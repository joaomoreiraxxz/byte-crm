import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors.js';

export function requireWorkspace(req: Request, res: Response, next: NextFunction): void {
  const workspaceId = req.headers['x-workspace-id'];
  if (!workspaceId) {
    return next(new ValidationError('Header X-Workspace-Id is required'));
  }
  req.workspaceId = workspaceId as string;
  next();
}
