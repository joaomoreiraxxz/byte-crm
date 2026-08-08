import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * CSRF Protection using the Double-Submit Cookie pattern.
 *
 * How it works:
 * 1. On GET /api/v1/auth/csrf-token, generate a random token.
 * 2. Set it as an HttpOnly, Secure, SameSite cookie AND return it in the response body.
 * 3. The frontend stores the body token and sends it in the X-CSRF-Token header on mutations.
 * 4. On POST/PUT/DELETE, compare the header token with the cookie token.
 *
 * The CSRF secret is used to HMAC-sign the token, preventing forgery.
 */

const CSRF_COOKIE_NAME = '__bytecrm_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_EXPIRY_MS = 3600000; // 1 hour

/**
 * Generate a signed CSRF token.
 */
function generateCsrfToken(): { token: string; signature: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  const payload = `${token}.${timestamp}`;
  const signature = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(payload)
    .digest('hex');

  return {
    token: `${payload}.${signature}`,
    signature,
  };
}

/**
 * Verify a CSRF token's signature and expiry.
 */
function verifyCsrfToken(fullToken: string): boolean {
  const parts = fullToken.split('.');
  if (parts.length !== 3) return false;

  const [token, timestamp, signature] = parts;
  const payload = `${token}.${timestamp}`;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(payload)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  // Check token expiry
  const tokenTime = parseInt(timestamp, 36);
  if (Date.now() - tokenTime > TOKEN_EXPIRY_MS) {
    return false;
  }

  return true;
}

/**
 * Route handler: Generate and return a new CSRF token.
 * GET /api/v1/auth/csrf-token
 */
export function csrfTokenHandler(req: Request, res: Response): void {
  const { token } = generateCsrfToken();

  // Set as HttpOnly cookie
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY_MS,
    path: '/',
  });

  // Also return in body so frontend can set it as a header
  res.json({
    success: true,
    data: { csrfToken: token },
  });
}

/**
 * CSRF validation middleware.
 * Skips GET, HEAD, OPTIONS requests (safe methods).
 * Skips webhook endpoints (external services don't send CSRF tokens).
 */
export function csrfProtection() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Safe methods don't need CSRF protection
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Webhooks are exempt (they use API key auth)
    if (req.path.includes('/webhooks/')) {
      return next();
    }

    // Get token from header and cookie
    const headerToken = req.headers[CSRF_HEADER_NAME] as string;
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string;

    if (!headerToken || !cookieToken) {
      return next(new AppError('CSRF token missing', 403, 'CSRF_MISSING'));
    }

    // Tokens must match (double-submit validation)
    if (headerToken !== cookieToken) {
      return next(new AppError('CSRF token mismatch', 403, 'CSRF_MISMATCH'));
    }

    // Verify signature and expiry
    if (!verifyCsrfToken(headerToken)) {
      return next(new AppError('CSRF token invalid or expired', 403, 'CSRF_INVALID'));
    }

    next();
  };
}
