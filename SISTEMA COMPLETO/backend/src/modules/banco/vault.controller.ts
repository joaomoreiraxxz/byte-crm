import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { redis, REDIS_KEYS } from '../../config/redis.js';
import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateSecureToken,
} from '../../utils/encryption.js';
import {
  ValidationError,
  NotFoundError,
  BiometricVerificationError,
  CryptoError,
  AuthenticationError,
} from '../../utils/errors.js';

const VAULT_SESSION_TTL = 300; // 5 minutes
const SALT_ROUNDS = 12;

/**
 * Setup master password for the vault.
 * POST /api/v1/vault/setup
 */
export async function setupVault(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const { masterPassword, passwordHint } = req.body;

    if (!masterPassword || masterPassword.length < 12) {
      throw new ValidationError('Master password must be at least 12 characters');
    }

    // Check if already setup
    const existing = await query(
      'SELECT id FROM vault_master_keys WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      throw new ValidationError('Vault is already configured. Use /vault/change-password to change.');
    }

    // Hash the master password (for server-side verification only)
    const masterHash = await bcrypt.hash(masterPassword, SALT_ROUNDS);

    // Generate recovery key
    const recoveryKey = generateSecureToken(32);
    const recoveryHash = await bcrypt.hash(recoveryKey, SALT_ROUNDS);

    await query(
      `INSERT INTO vault_master_keys (user_id, master_password_hash, password_hint, recovery_key_hash)
       VALUES ($1, $2, $3, $4)`,
      [userId, masterHash, passwordHint || null, recoveryHash]
    );

    res.status(201).json({
      success: true,
      data: {
        message: 'Vault configured successfully',
        recoveryKey: recoveryKey, // Show ONCE — user must save this
        warning: 'Save the recovery key securely. It will NOT be shown again.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Unlock the vault with master password + biometric verification.
 * POST /api/v1/vault/unlock
 *
 * Flow:
 * 1. Verify master password against bcrypt hash
 * 2. If face_enrolled, verify face_snapshot against biometric microservice
 * 3. Both must pass → create temporary vault session in Redis (5 min TTL)
 * 4. Return session token for subsequent vault operations
 */
export async function unlockVault(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const { masterPassword, faceSnapshot } = req.body;

    if (!masterPassword) {
      throw new ValidationError('Master password is required');
    }

    // Step 1: Verify master password
    const masterKeyResult = await query(
      'SELECT master_password_hash FROM vault_master_keys WHERE user_id = $1',
      [userId]
    );

    if (masterKeyResult.rows.length === 0) {
      throw new NotFoundError('Vault not configured. Use /vault/setup first.');
    }

    const { master_password_hash } = masterKeyResult.rows[0];
    const passwordValid = await bcrypt.compare(masterPassword, master_password_hash);

    if (!passwordValid) {
      throw new AuthenticationError('Invalid master password');
    }

    // Step 2: Biometric verification (if enrolled)
    const userResult = await query(
      'SELECT face_enrolled FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows[0]?.face_enrolled) {
      if (!faceSnapshot) {
        throw new ValidationError('Face verification required. Please provide faceSnapshot.');
      }

      // Call the biometric microservice
      const biometricResult = await verifyFace(userId, faceSnapshot);

      if (!biometricResult.match) {
        throw new BiometricVerificationError(
          `Face verification failed (confidence: ${(biometricResult.confidence * 100).toFixed(1)}%)`
        );
      }

      console.log(
        `[VAULT] Biometric verification passed for user ${userId} ` +
        `(confidence: ${(biometricResult.confidence * 100).toFixed(1)}%)`
      );
    }

    // Step 3: Both passed — create vault session
    const vaultSessionToken = generateSecureToken(32);
    const sessionKey = REDIS_KEYS.vaultSession(userId);

    // Store session with the master password (used to derive decryption keys)
    // This is the ONLY time the password is held in memory (Redis, 5 min TTL)
    await redis.set(
      sessionKey,
      JSON.stringify({
        token: vaultSessionToken,
        masterPassword, // Needed to derive keys for decryption
        createdAt: Date.now(),
      }),
      'EX',
      VAULT_SESSION_TTL
    );

    res.json({
      success: true,
      data: {
        vaultSessionToken,
        expiresIn: VAULT_SESSION_TTL,
        message: 'Vault unlocked successfully',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List vault entries (titles only — encrypted data not returned).
 * GET /api/v1/vault/entries
 */
export async function listVaultEntries(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT id, title, category, url, favorite, expires_at,
              strength_score, last_accessed_at, created_at, updated_at
       FROM vault_entries
       WHERE user_id = $1
       ORDER BY favorite DESC, updated_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a decrypted vault entry (requires valid vault session).
 * GET /api/v1/vault/entries/:id
 */
export async function getVaultEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const vaultToken = req.headers['x-vault-session'] as string;

    // Validate vault session
    const masterPassword = await validateVaultSession(userId, vaultToken);

    // Get encrypted entry
    const result = await query(
      `SELECT * FROM vault_entries WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Vault entry', id);
    }

    const entry = result.rows[0];

    // Decrypt data
    let decryptedData: Record<string, unknown>;
    try {
      const decrypted = decryptAES256GCM(
        entry.encrypted_data,
        masterPassword,
        entry.encryption_iv,
        entry.encryption_tag,
        entry.encryption_salt
      );
      decryptedData = JSON.parse(decrypted);
    } catch {
      throw new CryptoError();
    }

    // Decrypt notes if present
    let decryptedNotes: string | null = null;
    if (entry.notes_encrypted && entry.notes_iv && entry.notes_tag) {
      try {
        decryptedNotes = decryptAES256GCM(
          entry.notes_encrypted,
          masterPassword,
          entry.notes_iv,
          entry.notes_tag,
          entry.encryption_salt
        );
      } catch {
        decryptedNotes = '[Decryption failed]';
      }
    }

    // Update last accessed
    await query(
      'UPDATE vault_entries SET last_accessed_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        id: entry.id,
        title: entry.title,
        category: entry.category,
        url: entry.url,
        favorite: entry.favorite,
        credentials: decryptedData,
        notes: decryptedNotes,
        expiresAt: entry.expires_at,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new vault entry (encrypts data with master password).
 * POST /api/v1/vault/entries
 */
export async function createVaultEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId!;
    const vaultToken = req.headers['x-vault-session'] as string;

    const masterPassword = await validateVaultSession(userId, vaultToken);

    const { title, category, url, credentials, notes, expiresAt } = req.body;

    if (!title || !credentials) {
      throw new ValidationError('title and credentials are required');
    }

    // Encrypt credentials
    const credentialsStr = JSON.stringify(credentials);
    const encrypted = encryptAES256GCM(credentialsStr, masterPassword);

    // Encrypt notes if provided
    let notesEncrypted = null;
    let notesIv = null;
    let notesTag = null;
    if (notes) {
      const encryptedNotes = encryptAES256GCM(notes, masterPassword);
      notesEncrypted = encryptedNotes.ciphertext;
      notesIv = encryptedNotes.iv;
      notesTag = encryptedNotes.tag;
    }

    // Calculate password strength score
    const strengthScore = calculateStrengthScore(credentials.password);

    const result = await query(
      `INSERT INTO vault_entries (
        tenant_id, user_id, title, category, url,
        encrypted_data, encryption_iv, encryption_tag, encryption_salt,
        notes_encrypted, notes_iv, notes_tag,
        expires_at, strength_score
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id, title, category, url, favorite, expires_at, strength_score, created_at`,
      [
        tenantId, userId, title, category || 'generic', url || null,
        encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.salt,
        notesEncrypted, notesIv, notesTag,
        expiresAt || null, strengthScore,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Lock the vault (destroy session).
 * POST /api/v1/vault/lock
 */
export async function lockVault(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    await redis.del(REDIS_KEYS.vaultSession(userId));
    res.json({ success: true, message: 'Vault locked' });
  } catch (error) {
    next(error);
  }
}

// ─── Helper Functions ──────────────────────────────────────────

/**
 * Validate vault session token and return master password.
 */
async function validateVaultSession(userId: string, token: string): Promise<string> {
  if (!token) {
    throw new AuthenticationError('Vault session token required (X-Vault-Session header)');
  }

  const sessionData = await redis.get(REDIS_KEYS.vaultSession(userId));
  if (!sessionData) {
    throw new AuthenticationError('Vault session expired. Please unlock again.');
  }

  const session = JSON.parse(sessionData);
  if (session.token !== token) {
    throw new AuthenticationError('Invalid vault session token');
  }

  return session.masterPassword;
}

/**
 * Call the biometric microservice for face verification.
 */
async function verifyFace(
  userId: string,
  faceSnapshot: string
): Promise<{ match: boolean; confidence: number }> {
  try {
    const response = await axios.post(
      `${env.BIOMETRIC_SERVICE_URL}/verify`,
      {
        user_id: userId,
        image_base64: faceSnapshot,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': env.BIOMETRIC_API_KEY,
        },
        timeout: 30000,
      }
    );

    return {
      match: response.data.match === true,
      confidence: response.data.confidence || 0,
    };
  } catch (error: any) {
    console.error('[VAULT] Biometric service error:', error.message);
    throw new BiometricVerificationError(
      'Biometric service unavailable. Please try again.'
    );
  }
}

/**
 * Calculate password strength score (0-100).
 */
function calculateStrengthScore(password: string | undefined): number {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  if (password.length >= 20) score += 15;

  return Math.min(100, score);
}
