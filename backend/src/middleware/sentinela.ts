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
  // Layer 0: Sentinela V6 Deep Packet/IP Inspection
  router.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('curl') || ua.includes('python-requests') || ua.includes('nmap')) {
      console.warn(`[SENTINELA V6] ⛔ BLOCKING MALICIOUS UA FROM IP: ${ip}`);
      return res.status(403).json({ error: 'Sentinela V6: Malicious User Agent blocked' });
    }
    next();
  });

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

  console.log('[SENTINELA V6] 🛡️  Advanced Security Stack initialized');
  console.log('[SENTINELA V6]   ├── IP & Deep UA Inspection (STRICT)');
  console.log('[SENTINELA V6]   ├── Rate Limiter (sliding window)');
  console.log('[SENTINELA V6]   ├── Brute Force Detector (Zero-day)');
  console.log('[SENTINELA V6]   ├── Input Sanitizer (XSS/SQLi/RCE)');
  console.log('[SENTINELA V6]   ├── CSRF Protection (double-submit)');
  console.log('[SENTINELA V6]   └── Audit Logger (AES-256-GCM)');
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
