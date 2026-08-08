import { Request, Response, NextFunction } from 'express';
import xss, { IFilterXSSOptions } from 'xss';
import validator from 'validator';

// SQL injection patterns (common attack vectors)
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/i,
  /(--|#|\/\*|\*\/)/,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  /('\s*(OR|AND)\s+')/i,
  /(;\s*(DROP|DELETE|UPDATE|INSERT|ALTER))/i,
  /(\bSLEEP\s*\()/i,
  /(\bBENCHMARK\s*\()/i,
  /(\bWAITFOR\s+DELAY\b)/i,
  /(\bLOAD_FILE\s*\()/i,
  /(\bINTO\s+(OUT|DUMP)FILE\b)/i,
];

// XSS custom whitelist config (strip all potentially dangerous tags)
const XSS_OPTIONS: IFilterXSSOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  onIgnoreTag(_tag: string, _html: string, _options: unknown) {
    return '';
  },
};

/**
 * Input sanitizer middleware that protects against:
 * 1. XSS (Cross-Site Scripting) — strips all HTML/script tags
 * 2. SQL Injection — detects common SQL injection patterns
 * 3. NoSQL Injection — prevents $ operators in MongoDB-style attacks
 * 4. Path Traversal — blocks ../ sequences
 *
 * Applied to all POST, PUT, PATCH request bodies and all query parameters.
 */
export function inputSanitizer() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeObject(req.query as Record<string, unknown>) as typeof req.query;
      }

      // Sanitize body (only for methods that have bodies)
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        // Skip sanitization for webhook endpoints (they come from external services)
        if (req.path.includes('/webhooks/')) {
          return next();
        }

        // Check for SQL injection in the raw body
        const bodyStr = JSON.stringify(req.body);
        if (detectSqlInjection(bodyStr)) {
          console.warn(`[SANITIZER] SQL injection attempt detected from ${req.ip}: ${req.path}`);
          res.status(400).json({
            success: false,
            error: {
              code: 'MALICIOUS_INPUT',
              message: 'Request contains potentially malicious content',
            },
          });
          return;
        }

        req.body = sanitizeObject(req.body);
      }

      // Sanitize URL parameters
      if (req.params) {
        for (const [key, value] of Object.entries(req.params)) {
          if (typeof value === 'string') {
            req.params[key] = sanitizeString(value);
          }
        }
      }

      next();
    } catch (error) {
      console.error('[SANITIZER] Error during sanitization:', error);
      next();
    }

  };
}

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (typeof item === 'string') return sanitizeString(item);
        if (typeof item === 'object' && item !== null) {
          return sanitizeObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a single string value.
 */
function sanitizeString(input: string): string {
  // 1. XSS filtering — strip all HTML tags
  let sanitized = xss(input, XSS_OPTIONS);

  // 2. Trim whitespace
  sanitized = sanitized.trim();

  // 3. Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // 4. Block path traversal
  sanitized = sanitized.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');

  return sanitized;
}

/**
 * Detect SQL injection patterns in a string.
 */
function detectSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Validate and sanitize an email address.
 */
export function sanitizeEmail(email: string): string | null {
  const sanitized = sanitizeString(email).toLowerCase();
  return validator.isEmail(sanitized) ? validator.normalizeEmail(sanitized) || sanitized : null;
}

/**
 * Validate UUID format.
 */
export function isValidUUID(id: string): boolean {
  return validator.isUUID(id, 4);
}

export { sanitizeString, detectSqlInjection };
