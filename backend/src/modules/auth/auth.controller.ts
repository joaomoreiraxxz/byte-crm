import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { redis, REDIS_KEYS } from '../../config/redis.js';
import { sha256 } from '../../utils/encryption.js';
import { AuthenticationError, ValidationError, ConflictError } from '../../utils/errors.js';
import { recordFailedLogin, clearFailedLogins } from '../../middleware/bruteForceDetector.js';
import { getClientIp } from '../../middleware/rateLimiter.js';

const SALT_ROUNDS = 12;

/**
 * Register a new user account.
 * POST /api/v1/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, fullName, tenantSlug } = req.body;

    if (!email || !password || !fullName || !tenantSlug) {
      throw new ValidationError('Missing required fields: email, password, fullName, tenantSlug');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Find or validate tenant
    const tenantResult = await query(
      'SELECT id, is_active, max_users FROM tenants WHERE slug = $1',
      [tenantSlug]
    );

    if (tenantResult.rows.length === 0) {
      throw new ValidationError('Invalid tenant');
    }

    const tenant = tenantResult.rows[0];
    if (!tenant.is_active) {
      throw new ValidationError('Tenant is inactive');
    }

    // Check user limit
    const userCount = await query(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
      [tenant.id]
    );

    if (parseInt(userCount.rows[0].count) >= tenant.max_users) {
      throw new ConflictError('User limit reached for this tenant');
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [tenant.id, email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Determine role (first user = owner)
    const isFirstUser = parseInt(userCount.rows[0].count) === 0;
    const role = isFirstUser ? 'owner' : 'agent';

    // Create user
    const result = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, email, full_name, role, created_at`,
      [tenant.id, email.toLowerCase(), passwordHash, fullName, role]
    );

    const user = result.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user as any);

    // Store refresh token hash
    const refreshHash = sha256(refreshToken);
    await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [refreshHash, user.id]);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          tenantId: user.tenant_id,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login with email and password.
 * POST /api/v1/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, tenantSlug } = req.body;

    if (!email || !password || !tenantSlug) {
      throw new ValidationError('Missing required fields: email, password, tenantSlug');
    }

    const ip = getClientIp(req);

    // Find user with tenant
    const result = await query(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name,
              u.role, u.is_active, u.locked_until, u.avatar_url, u.face_enrolled,
              t.name as tenant_name, t.slug as tenant_slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND t.slug = $2`,
      [email.toLowerCase(), tenantSlug]
    );

    if (result.rows.length === 0) {
      // Record failed attempt (no user ID available)
      await recordFailedLogin(ip, undefined, undefined, email);
      throw new AuthenticationError('Invalid email or password');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new AuthenticationError('Account is deactivated');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new AuthenticationError(
        `Account locked. Try again in ${minutesLeft} minutes.`
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await recordFailedLogin(ip, user.id, user.tenant_id, email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Success — clear any failed login tracking
    await clearFailedLogins(ip, user.id);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user as any);

    // Store refresh token hash and update last login
    const refreshHash = sha256(refreshToken);
    await query(
      `UPDATE users SET
        refresh_token_hash = $1,
        last_login_at = NOW(),
        last_login_ip = $2::inet,
        failed_login_attempts = 0,
        locked_until = NULL
       WHERE id = $3`,
      [refreshHash, ip, user.id]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: user.tenant_name,
          tenantSlug: user.tenant_slug,
          avatarUrl: user.avatar_url,
          faceEnrolled: user.face_enrolled,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh the access token using a valid refresh token.
 * POST /api/v1/auth/refresh
 */
export async function refreshAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    // Verify refresh token
    let decoded: { userId: string; tenantId: string; role: string; email: string };
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as typeof decoded;
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Validate the refresh token hash matches
    const refreshHash = sha256(refreshToken);
    const result = await query(
      `SELECT id, tenant_id, email, full_name, role, is_active, refresh_token_hash
       FROM users WHERE id = $1 AND tenant_id = $2`,
      [decoded.userId, decoded.tenantId]
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new AuthenticationError('Account deactivated');
    }

    if (user.refresh_token_hash !== refreshHash) {
      // Token reuse detected — possible token theft. Invalidate all sessions.
      await query(
        'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
        [user.id]
      );
      throw new AuthenticationError('Refresh token revoked (possible token theft detected)');
    }

    // Rotate: generate new tokens
    const tokens = generateTokens(user as any);
    const newRefreshHash = sha256(tokens.refreshToken);

    await query(
      'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
      [newRefreshHash, user.id]
    );

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout — invalidate refresh token.
 * POST /api/v1/auth/logout
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.userId) {
      await query(
        'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
        [req.userId]
      );
      // Clean up Redis session
      await redis.del(REDIS_KEYS.session(req.userId));
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current user profile.
 * GET /api/v1/auth/me
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.avatar_url, u.phone,
              u.face_enrolled, u.mfa_enabled, u.preferences, u.last_login_at,
              t.name as tenant_name, t.slug as tenant_slug, t.plan, t.settings as tenant_settings
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        faceEnrolled: user.face_enrolled,
        mfaEnabled: user.mfa_enabled,
        preferences: user.preferences,
        lastLoginAt: user.last_login_at,
        tenant: {
          name: user.tenant_name,
          slug: user.tenant_slug,
          plan: user.plan,
          settings: user.tenant_settings,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Token Generation ─────────────────────────────────────────

function generateTokens(user: {
  id: string;
  tenant_id: string;
  role: string;
  email: string;
}): { accessToken: string; refreshToken: string } {
  const payload = {
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    email: user.email,
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as any,
    issuer: 'bytecrm',
    audience: 'bytecrm-api',
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as any,
    issuer: 'bytecrm',
    audience: 'bytecrm-api',
  });

  return { accessToken, refreshToken };
}
