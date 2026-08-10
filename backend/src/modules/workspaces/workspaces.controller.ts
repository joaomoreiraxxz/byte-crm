import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../../config/database.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

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

    await transaction(async (client) => {
      // 1. Create workspace
      const wsResult = await client.query(
        'INSERT INTO workspaces (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [tenantId, name, description || null]
      );
      const workspace = wsResult.rows[0];

      // 2. Auto-create a default Pipeline for this workspace
      const pipelineResult = await client.query(
        'INSERT INTO pipelines (tenant_id, workspace_id, name, is_default) VALUES ($1, $2, $3, true) RETURNING id',
        [tenantId, workspace.id, 'Funil Principal']
      );
      const pipelineId = pipelineResult.rows[0].id;

      // 3. Auto-create default Stages
      const stages = [
        { name: 'Novo Lead', color: '#38BDF8', position: 0 },
        { name: 'Qualificado', color: '#818CF8', position: 1 },
        { name: 'Proposta Enviada', color: '#F59E0B', position: 2 },
        { name: 'Negociação', color: '#FB923C', position: 3 },
        { name: 'Fechado (Ganho)', color: '#22C55E', position: 4, is_won: true },
        { name: 'Perdido', color: '#EF4444', position: 5, is_lost: true },
      ];

      for (const stage of stages) {
        await client.query(
          `INSERT INTO pipeline_stages (pipeline_id, name, color, position, is_won, is_lost)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [pipelineId, stage.name, stage.color, stage.position, stage.is_won || false, stage.is_lost || false]
        );
      }

      res.status(201).json({ success: true, data: workspace });
    });
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

/**
 * List pipelines for a workspace.
 * GET /api/v1/workspaces/:id/pipelines
 */
export async function getWorkspacePipelines(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const result = await query(
      `SELECT p.*, 
              (SELECT json_agg(s ORDER BY s.position ASC) 
               FROM pipeline_stages s WHERE s.pipeline_id = p.id) as stages
       FROM pipelines p
       WHERE p.workspace_id = $1 AND p.tenant_id = $2
       ORDER BY p.is_default DESC, p.created_at ASC`,
      [id, tenantId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}
