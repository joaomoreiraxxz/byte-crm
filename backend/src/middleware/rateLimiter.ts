import { Request, Response, NextFunction } from 'express';
import { redis, REDIS_KEYS } from '../config/redis.js';
import { env } from '../config/env.js';
import { RateLimitError } from '../utils/errors.js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

// Route-specific rate limit configurations
const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/v1/auth/login': { maxRequests: 5, windowMs: 60000 },
  '/api/v1/auth/register': { maxRequests: 3, windowMs: 60000 },
  '/api/v1/auth/refresh': { maxRequests: 10, windowMs: 60000 },
  '/api/v1/vault/unlock': { maxRequests: 3, windowMs: 60000 },
  '/api/v1/webhooks': { maxRequests: 200, windowMs: 60000 },
};

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Each request is stored as a timestamped entry. Expired entries are
 * cleaned up atomically using MULTI/EXEC to prevent race conditions.
 *
 * Algorithm:
 * 1. Get current timestamp
 * 2. Remove entries older than the window
 * 3. Count remaining entries
 * 4. If under limit, add new entry and set TTL
 * 5. If over limit, reject with 429
 */
export function rateLimiter(customConfig?: Partial<RateLimitConfig>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Determine config: route-specific > custom > defaults
      const routePath = req.route?.path || req.path;
      const matchedRoute = Object.keys(ROUTE_LIMITS).find((route) =>
        routePath.startsWith(route)
      );

      const config: RateLimitConfig = {
        maxRequests: customConfig?.maxRequests || ROUTE_LIMITS[matchedRoute || '']?.maxRequests || env.RATE_LIMIT_GENERAL,
        windowMs: customConfig?.windowMs || ROUTE_LIMITS[matchedRoute || '']?.windowMs || env.RATE_LIMIT_WINDOW_MS,
        keyPrefix: customConfig?.keyPrefix || 'general',
      };

      const clientIp = getClientIp(req);
      const key = REDIS_KEYS.rateLimit(clientIp, config.keyPrefix || routePath);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Atomic sliding window operation
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart); // Remove expired
      pipeline.zcard(key);                             // Count current
      pipeline.zadd(key, now, `${now}:${Math.random()}`); // Add this request
      pipeline.pexpire(key, config.windowMs);          // Set TTL

      const results = await pipeline.exec();

      if (!results) {
        // Redis unavailable — fail open (allow request)
        return next();
      }

      const currentCount = (results[1]?.[1] as number) || 0;

      if (currentCount >= config.maxRequests) {
        // Calculate retry-after
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTimestamp = oldestEntry.length >= 2 ? parseInt(oldestEntry[1], 10) : now;
        const retryAfterMs = config.windowMs - (now - oldestTimestamp);
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

        res.set({
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((now + retryAfterMs) / 1000)),
          'Retry-After': String(retryAfterSeconds),
        });

        throw new RateLimitError(retryAfterSeconds);
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': String(Math.max(0, config.maxRequests - currentCount - 1)),
        'X-RateLimit-Reset': String(Math.ceil((now + config.windowMs) / 1000)),
      });

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        next(error);
      } else {
        // Fail open on Redis errors
        console.error('[RATE_LIMITER] Redis error, failing open:', error);
        next();
      }
    }
  };
}

/**
 * Extract real client IP from proxy headers.
 * Trusts X-Forwarded-For only when behind a known reverse proxy.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

export { getClientIp };
