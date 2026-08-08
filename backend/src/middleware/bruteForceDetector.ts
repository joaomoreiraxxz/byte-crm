import { Request, Response, NextFunction } from 'express';
import { redis, REDIS_KEYS } from '../config/redis.js';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { getClientIp } from './rateLimiter.js';

/**
 * Brute Force Detector — monitors failed login attempts using Redis sorted sets.
 *
 * Algorithm:
 * 1. On each failed login, record the attempt with timestamp in Redis
 * 2. Count attempts within the configured window (default: 15 minutes)
 * 3. If count >= threshold (default: 5), lock the account/IP for lockout period (default: 30 min)
 * 4. Generate a security_alert in the database with severity HIGH
 * 5. Log the event for SOC team review
 */

/**
 * Record a failed login attempt and check for brute force.
 * Called from the auth controller on login failure.
 */
export async function recordFailedLogin(
  ip: string,
  userId?: string,
  tenantId?: string,
  email?: string
): Promise<{ blocked: boolean; attemptsRemaining: number }> {
  const now = Date.now();
  const windowMs = env.BRUTE_FORCE_WINDOW_MINUTES * 60 * 1000;
  const windowStart = now - windowMs;
  const maxAttempts = env.BRUTE_FORCE_MAX_ATTEMPTS;

  // Track by IP
  const ipKey = REDIS_KEYS.bruteForce.byIp(ip);

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(ipKey, 0, windowStart);
  pipeline.zadd(ipKey, now, `${now}:${Math.random()}`);
  pipeline.zcard(ipKey);
  pipeline.pexpire(ipKey, windowMs);

  const results = await pipeline.exec();
  const ipAttempts = (results?.[2]?.[1] as number) || 0;

  // Also track by user ID if available
  let userAttempts = 0;
  if (userId) {
    const userKey = REDIS_KEYS.bruteForce.byUser(userId);
    const userPipeline = redis.pipeline();
    userPipeline.zremrangebyscore(userKey, 0, windowStart);
    userPipeline.zadd(userKey, now, `${now}:${Math.random()}`);
    userPipeline.zcard(userKey);
    userPipeline.pexpire(userKey, windowMs);

    const userResults = await userPipeline.exec();
    userAttempts = (userResults?.[2]?.[1] as number) || 0;
  }

  const totalAttempts = Math.max(ipAttempts, userAttempts);
  const attemptsRemaining = Math.max(0, maxAttempts - totalAttempts);

  // Check if threshold exceeded
  if (totalAttempts >= maxAttempts) {
    await triggerBruteForceAlert(ip, userId, tenantId, email, totalAttempts);
    return { blocked: true, attemptsRemaining: 0 };
  }

  return { blocked: false, attemptsRemaining };
}

/**
 * Check if an IP or user is currently locked out.
 */
export async function isLockedOut(ip: string, userId?: string): Promise<boolean> {
  const ipLocked = await redis.exists(REDIS_KEYS.bruteForce.lockout(ip));
  if (ipLocked) return true;

  if (userId) {
    const userLocked = await redis.exists(REDIS_KEYS.bruteForce.lockout(userId));
    if (userLocked) return true;
  }

  return false;
}

/**
 * Clear failed login tracking (called on successful login).
 */
export async function clearFailedLogins(ip: string, userId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(REDIS_KEYS.bruteForce.byIp(ip));
  pipeline.del(REDIS_KEYS.bruteForce.byUser(userId));
  pipeline.del(REDIS_KEYS.bruteForce.lockout(ip));
  pipeline.del(REDIS_KEYS.bruteForce.lockout(userId));
  await pipeline.exec();
}

/**
 * Trigger a brute force security alert.
 * Locks the IP/user and creates a database alert.
 */
async function triggerBruteForceAlert(
  ip: string,
  userId: string | undefined,
  tenantId: string | undefined,
  email: string | undefined,
  attempts: number
): Promise<void> {
  const lockoutMs = env.BRUTE_FORCE_LOCKOUT_MINUTES * 60 * 1000;

  // Lock the IP
  await redis.set(
    REDIS_KEYS.bruteForce.lockout(ip),
    '1',
    'PX',
    lockoutMs
  );

  // Lock the user if known
  if (userId) {
    await redis.set(
      REDIS_KEYS.bruteForce.lockout(userId),
      '1',
      'PX',
      lockoutMs
    );

    // Also lock in database
    await query(
      `UPDATE users SET locked_until = NOW() + INTERVAL '${env.BRUTE_FORCE_LOCKOUT_MINUTES} minutes',
       failed_login_attempts = $1 WHERE id = $2`,
      [attempts, userId]
    );
  }

  // Create security alert
  await query(
    `INSERT INTO security_alerts (
      tenant_id, user_id, alert_type, severity, title, description, ip_address, metadata
    ) VALUES ($1, $2, 'BRUTE_FORCE', 'HIGH', $3, $4, $5::inet, $6)`,
    [
      tenantId || null,
      userId || null,
      `Brute force attack detected from ${ip}`,
      `${attempts} failed login attempts detected within ${env.BRUTE_FORCE_WINDOW_MINUTES} minutes for ${email || 'unknown user'}. IP and account locked for ${env.BRUTE_FORCE_LOCKOUT_MINUTES} minutes.`,
      ip,
      JSON.stringify({
        email,
        attempts,
        window_minutes: env.BRUTE_FORCE_WINDOW_MINUTES,
        lockout_minutes: env.BRUTE_FORCE_LOCKOUT_MINUTES,
        locked_at: new Date().toISOString(),
      }),
    ]
  );

  console.warn(
    `[SENTINELA] 🚨 BRUTE FORCE ALERT: ${attempts} failed attempts from IP ${ip}` +
    ` (user: ${email || userId || 'unknown'}). Locked for ${env.BRUTE_FORCE_LOCKOUT_MINUTES}min.`
  );
}

/**
 * Middleware: Check lockout status before processing login requests.
 */
export function bruteForceGuard() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Only apply to login endpoints
      if (!req.path.includes('/login') && !req.path.includes('/vault/unlock')) {
        return next();
      }

      const ip = getClientIp(req);
      const email = req.body?.email;

      // Check IP lockout
      if (await isLockedOut(ip)) {
        res.status(423).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: `Account temporarily locked due to multiple failed login attempts. Try again in ${env.BRUTE_FORCE_LOCKOUT_MINUTES} minutes.`,
          },
        });
        return;
      }

      // If email provided, check user lockout
      if (email) {
        const result = await query(
          'SELECT id, locked_until FROM users WHERE email = $1 AND locked_until > NOW() LIMIT 1',
          [email]
        );
        if (result.rows.length > 0) {
          res.status(423).json({
            success: false,
            error: {
              code: 'ACCOUNT_LOCKED',
              message: 'Account temporarily locked. Try again later.',
            },
          });
          return;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
