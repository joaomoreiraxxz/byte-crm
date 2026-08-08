import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    console.warn(`[REDIS] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  lazyConnect: false,
  enableReadyCheck: true,
});

redis.on('connect', () => {
  console.log('[REDIS] Connected');
});

redis.on('error', (err) => {
  console.error('[REDIS] Error:', err.message);
});

redis.on('close', () => {
  console.warn('[REDIS] Connection closed');
});

/**
 * Redis key namespaces for the application.
 * Prevents key collisions across modules.
 */
export const REDIS_KEYS = {
  // Rate limiting
  rateLimit: (ip: string, route: string) => `rl:${route}:${ip}`,

  // Brute force tracking
  bruteForce: {
    byIp: (ip: string) => `bf:ip:${ip}`,
    byUser: (userId: string) => `bf:user:${userId}`,
    lockout: (identifier: string) => `bf:lock:${identifier}`,
  },

  // Session management
  session: (userId: string) => `sess:${userId}`,
  refreshToken: (userId: string) => `rt:${userId}`,

  // CSRF tokens
  csrf: (sessionId: string) => `csrf:${sessionId}`,

  // WebSocket rooms
  wsRoom: (tenantId: string) => `ws:room:${tenantId}`,

  // Cache
  cache: {
    user: (userId: string) => `cache:user:${userId}`,
    pipeline: (tenantId: string) => `cache:pipeline:${tenantId}`,
    leads: (tenantId: string, stageId: string) => `cache:leads:${tenantId}:${stageId}`,
  },

  // Vault session (temporary decrypted key, TTL 5 min)
  vaultSession: (userId: string) => `vault:sess:${userId}`,
} as const;

/**
 * Check Redis connectivity
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    console.log('[REDIS] Ping response:', pong);
    return pong === 'PONG';
  } catch (error) {
    console.error('[REDIS] Connection check failed:', error);
    return false;
  }
}

export default redis;
