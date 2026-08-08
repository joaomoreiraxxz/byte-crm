import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

// Extend Express Request with auth context
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
      workspaceId?: string;
      userRole?: string;
      userEmail?: string;
    }
  }
}

interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * JWT authentication guard.
 * Verifies the access token from the Authorization header,
 * validates the user still exists and is active, and attaches
 * user context to the request object.
 */
export function authGuard() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from Bearer header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        throw new AuthenticationError('Token not provided');
      }

      // Verify JWT
      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          throw new AuthenticationError('Token expired');
        }
        if (err instanceof jwt.JsonWebTokenError) {
          throw new AuthenticationError('Invalid token');
        }
        throw new AuthenticationError('Token verification failed');
      }

      // Validate user still exists and is active
      const result = await query(
        `SELECT id, tenant_id, role, email, is_active, locked_until
         FROM users
         WHERE id = $1 AND tenant_id = $2`,
        [decoded.userId, decoded.tenantId]
      );

      if (result.rows.length === 0) {
        throw new AuthenticationError('User not found');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new AuthenticationError('Account deactivated');
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new AuthenticationError('Account temporarily locked');
      }

      // Attach user context to request
      req.userId = decoded.userId;
      req.tenantId = decoded.tenantId;
      req.userRole = decoded.role;
      req.userEmail = decoded.email;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Role-based access control middleware.
 * Must be used AFTER authGuard.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      return next(new AuthenticationError('Not authenticated'));
    }

    if (!allowedRoles.includes(req.userRole)) {
      return next(
        new AuthorizationError(
          `Role '${req.userRole}' is not authorized. Required: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
}

/**
 * Ensure the request is accessing resources within the user's tenant.
 * Validates :tenantId URL param matches the JWT tenant.
 */
export function tenantGuard() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const paramTenantId = req.params.tenantId;

    if (paramTenantId && paramTenantId !== req.tenantId) {
      return next(new AuthorizationError('Cross-tenant access denied'));
    }

    next();
  };
}
