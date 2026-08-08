import { Router } from 'express';
import { rateLimiter } from './rateLimiter.js';
import { inputSanitizer } from './inputSanitizer.js';
import { csrfProtection } from './csrfProtection.js';
import { auditLogger } from './auditLogger.js';
import { bruteForceGuard } from './bruteForceDetector.js';

/**
 * MÓDULO SENTINELA — Global Security Middleware Orchestrator
 *
 * Applies security layers in the correct order:
 *
 * 1. Rate Limiting (sliding window via Redis)
 *    → Prevents DDoS and API abuse
 *
 * 2. Brute Force Detection
 *    → Blocks IPs/users with excessive failed logins
 *
 * 3. Input Sanitization (XSS/SQLi/Prototype Pollution)
 *    → Sanitizes all inputs before they reach controllers
 *
 * 4. CSRF Protection (Double-Submit Cookie)
 *    → Validates mutation requests have valid CSRF tokens
 *
 * 5. Audit Logging (AES-256-GCM encrypted)
 *    → Logs all mutations with encrypted request bodies
 *
 * Each layer is independent and fails gracefully.
 * The order matters: rate limiting first prevents waste of resources on
 * sanitization/logging for requests that would be rejected anyway.
 */
export function applySentinela(router: Router): void {
  // Layer 1: Rate Limiting
  router.use(rateLimiter());

  // Layer 2: Brute Force Guard (login/vault endpoints only)
  router.use(bruteForceGuard());

  // Layer 3: Input Sanitization
  router.use(inputSanitizer());

  // Layer 4: CSRF Protection (mutations only)
  router.use(csrfProtection());

  // Layer 5: Audit Logging
  router.use(auditLogger());

  console.log('[SENTINELA] 🛡️  Security middleware stack initialized');
  console.log('[SENTINELA]   ├── Rate Limiter (sliding window)');
  console.log('[SENTINELA]   ├── Brute Force Detector');
  console.log('[SENTINELA]   ├── Input Sanitizer (XSS/SQLi)');
  console.log('[SENTINELA]   ├── CSRF Protection (double-submit)');
  console.log('[SENTINELA]   └── Audit Logger (AES-256-GCM)');
}

// Re-export individual middlewares for selective use
export { rateLimiter } from './rateLimiter.js';
export { inputSanitizer } from './inputSanitizer.js';
export { csrfProtection, csrfTokenHandler } from './csrfProtection.js';
export { auditLogger, logAuditEvent } from './auditLogger.js';
export {
  bruteForceGuard,
  recordFailedLogin,
  clearFailedLogins,
  isLockedOut,
} from './bruteForceDetector.js';
export { authGuard, requireRole, tenantGuard } from './authGuard.js';
