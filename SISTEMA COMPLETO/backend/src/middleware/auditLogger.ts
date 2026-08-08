import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { encryptWithKey } from '../utils/encryption.js';
import { getClientIp } from './rateLimiter.js';

// Map HTTP methods to audit actions
const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
  GET: 'READ',
};

// Routes that should NOT be logged (high-frequency, low-value)
const SKIP_ROUTES = [
  '/health',
  '/api/v1/auth/csrf-token',
  '/favicon.ico',
  '/socket.io',
];

// Sensitive fields that should be redacted before encryption
const SENSITIVE_FIELDS = [
  'password', 'password_hash', 'master_password', 'token', 'refresh_token',
  'api_key', 'secret', 'credit_card', 'cvv', 'ssn', 'face_snapshot',
];

/**
 * Audit Logger middleware — logs every mutation (POST/PUT/DELETE) to the
 * audit_logs table with the request body encrypted using AES-256-GCM.
 *
 * For GET requests, only logs access to sensitive resources (vault, audit_logs).
 */
export function auditLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip non-auditable routes
    if (SKIP_ROUTES.some((route) => req.path.startsWith(route))) {
      return next();
    }

    // Only log mutations by default, and GETs for sensitive resources
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const isSensitiveRead = req.method === 'GET' && (
      req.path.includes('/vault') ||
      req.path.includes('/audit') ||
      req.path.includes('/security-alerts')
    );

    if (!isMutation && !isSensitiveRead) {
      return next();
    }

    const startTime = Date.now();

    // Capture the original end to intercept the response
    const originalEnd = res.end;
    const originalJson = res.json;

    let responseStatus: number | undefined;

    // Intercept res.json to capture status
    res.json = function (body: unknown) {
      responseStatus = res.statusCode;
      return originalJson.call(this, body);
    };

    // Intercept res.end to log after response is sent
    res.end = function (...args: unknown[]) {
      responseStatus = responseStatus || res.statusCode;
      const duration = Date.now() - startTime;

      // Fire-and-forget: don't block the response
      writeAuditLog(req, responseStatus, duration).catch((err) => {
        console.error('[AUDIT] Failed to write audit log:', err.message);
      });

      return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
    } as typeof res.end;

    next();
  };
}

/**
 * Write an audit log entry to the database.
 * The request body is encrypted with AES-256-GCM before storage.
 */
async function writeAuditLog(
  req: Request,
  responseStatus: number,
  durationMs: number
): Promise<void> {
  const action = resolveAction(req);
  const resource = resolveResource(req.path);
  const resourceId = extractResourceId(req.path);
  const ip = getClientIp(req);

  // User info from JWT (set by authGuard)
  const userId = (req as any).userId || null;
  const tenantId = (req as any).tenantId || null;

  // Encrypt the request body (only for mutations with body)
  let encryptedBody: string | null = null;
  let encryptionIv: string | null = null;
  let encryptionTag: string | null = null;

  if (req.body && Object.keys(req.body).length > 0) {
    const redactedBody = redactSensitiveFields(req.body);
    const bodyStr = JSON.stringify(redactedBody);

    const encrypted = encryptWithKey(bodyStr, env.AUDIT_ENCRYPTION_KEY);
    encryptedBody = encrypted.ciphertext;
    encryptionIv = encrypted.iv;
    encryptionTag = encrypted.tag;
  }

  await query(
    `INSERT INTO audit_logs (
      tenant_id, user_id, action, resource, resource_id,
      endpoint, method, ip_address, user_agent,
      request_body_encrypted, response_status, metadata,
      encryption_iv, encryption_tag, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, $10, $11, $12, $13, $14, $15)`,
    [
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      req.originalUrl,
      req.method,
      ip,
      req.headers['user-agent'] || 'unknown',
      encryptedBody,
      responseStatus,
      JSON.stringify({
        contentType: req.headers['content-type'],
        origin: req.headers['origin'],
      }),
      encryptionIv,
      encryptionTag,
      durationMs,
    ]
  );
}

/**
 * Resolve the audit action from the request context.
 */
function resolveAction(req: Request): string {
  // Special cases
  if (req.path.includes('/login')) return req.method === 'POST' ? 'LOGIN' : 'READ';
  if (req.path.includes('/logout')) return 'LOGOUT';
  if (req.path.includes('/register')) return 'REGISTER';
  if (req.path.includes('/vault/unlock')) return 'VAULT_UNLOCK';
  if (req.path.includes('/vault/lock')) return 'VAULT_LOCK';

  return METHOD_ACTION_MAP[req.method] || 'UNKNOWN';
}

/**
 * Extract the resource name from the URL path.
 * e.g., /api/v1/crm/leads/123 → 'leads'
 */
function resolveResource(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Find the first non-version, non-module segment that looks like a resource
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    // Skip UUIDs and numeric IDs
    if (segment.match(/^[0-9a-f]{8}-/i) || segment.match(/^\d+$/)) continue;
    // Skip 'api' and version segments
    if (segment === 'api' || segment.match(/^v\d+$/)) continue;
    return segment;
  }
  return path;
}

/**
 * Extract resource ID from URL path (last UUID-like segment).
 */
function extractResourceId(path: string): string | null {
  const uuidMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return uuidMatch ? uuidMatch[1] : null;
}

/**
 * Redact sensitive fields from an object before encryption.
 */
function redactSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitiveFields(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Manually log a specific audit event (for use outside middleware).
 */
export async function logAuditEvent(params: {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  endpoint: string;
  method: string;
  ip: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (
      tenant_id, user_id, action, resource, resource_id,
      endpoint, method, ip_address, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
    [
      params.tenantId,
      params.userId || null,
      params.action,
      params.resource,
      params.resourceId || null,
      params.endpoint,
      params.method,
      params.ip,
      JSON.stringify(params.metadata || {}),
    ]
  );
}
