import { Request, Response, NextFunction } from 'express';
import { query } from '../../../config/database.js';
import { NotFoundError, ValidationError } from '../../../utils/errors.js';

export async function listWorkspaces(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const result = await query(
      'SELECT * FROM workspaces WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function createWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const { name, description } = req.body;

    if (!name) {
      throw new ValidationError('Name is required');
    }

    const result = await query(
      'INSERT INTO workspaces (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [tenantId, name, description]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function getWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const result = await query(
      'SELECT * FROM workspaces WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Workspace', id);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}
