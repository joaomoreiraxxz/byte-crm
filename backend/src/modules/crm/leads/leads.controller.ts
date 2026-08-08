import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../../../config/database.js';
import { parsePagination, calcOffset, paginatedResponse, buildOrderBy } from '../../../utils/pagination.js';
import { NotFoundError, ValidationError } from '../../../utils/errors.js';

/**
 * List leads with filtering, sorting, and pagination.
 * GET /api/v1/crm/leads
 */
export async function listLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const pagination = parsePagination(req.query as Record<string, string>);
    const offset = calcOffset(pagination.page, pagination.limit);

    // Build dynamic WHERE clause from query params
    const conditions: string[] = ['l.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (req.query.stageId) {
      conditions.push(`l.stage_id = $${paramIdx++}`);
      params.push(req.query.stageId);
    }
    if (req.query.pipelineId) {
      conditions.push(`l.pipeline_id = $${paramIdx++}`);
      params.push(req.query.pipelineId);
    }
    if (req.query.assignedTo) {
      conditions.push(`l.assigned_to = $${paramIdx++}`);
      params.push(req.query.assignedTo);
    }
    if (req.query.source) {
      conditions.push(`l.source = $${paramIdx++}`);
      params.push(req.query.source);
    }
    if (req.query.search) {
      conditions.push(`(l.name ILIKE $${paramIdx} OR l.email ILIKE $${paramIdx} OR l.company ILIKE $${paramIdx} OR l.phone ILIKE $${paramIdx})`);
      params.push(`%${req.query.search}%`);
      paramIdx++;
    }
    if (req.query.tags) {
      conditions.push(`l.tags && $${paramIdx++}`);
      params.push((req.query.tags as string).split(','));
    }
    if (req.query.minValue) {
      conditions.push(`l.value >= $${paramIdx++}`);
      params.push(req.query.minValue);
    }
    if (req.query.maxValue) {
      conditions.push(`l.value <= $${paramIdx++}`);
      params.push(req.query.maxValue);
    }

    const whereClause = conditions.join(' AND ');
    const orderBy = buildOrderBy(pagination);

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM leads l WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Fetch page
    const result = await query(
      `SELECT l.*, ps.name as stage_name, ps.color as stage_color,
              u.full_name as assigned_name, u.avatar_url as assigned_avatar,
              p.name as pipeline_name
       FROM leads l
       LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
       LEFT JOIN users u ON u.id = l.assigned_to
       LEFT JOIN pipelines p ON p.id = l.pipeline_id
       WHERE ${whereClause}
       ${orderBy}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pagination.limit, offset]
    );

    res.json({
      success: true,
      ...paginatedResponse(result.rows, total, pagination),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single lead by ID with activities and messages count.
 * GET /api/v1/crm/leads/:id
 */
export async function getLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const result = await query(
      `SELECT l.*, ps.name as stage_name, ps.color as stage_color,
              u.full_name as assigned_name, u.avatar_url as assigned_avatar,
              p.name as pipeline_name,
              (SELECT COUNT(*) FROM lead_activities la WHERE la.lead_id = l.id) as activities_count,
              (SELECT COUNT(*) FROM whatsapp_messages wm WHERE wm.lead_id = l.id) as messages_count
       FROM leads l
       LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
       LEFT JOIN users u ON u.id = l.assigned_to
       LEFT JOIN pipelines p ON p.id = l.pipeline_id
       WHERE l.id = $1 AND l.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Lead', id);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new lead.
 * POST /api/v1/crm/leads
 */
export async function createLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const {
      pipelineId, stageId, assignedTo, name, email, phone,
      whatsappJid, company, positionTitle, value, probability,
      expectedCloseDate, source, tags, customFields, notes,
    } = req.body;

    if (!name || !pipelineId || !stageId) {
      throw new ValidationError('Missing required fields: name, pipelineId, stageId');
    }

    // Get max position in the target stage
    const posResult = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM leads WHERE stage_id = $1',
      [stageId]
    );
    const position = posResult.rows[0].next_pos;

    const result = await query(
      `INSERT INTO leads (
        tenant_id, pipeline_id, stage_id, assigned_to, name, email, phone,
        whatsapp_jid, company, position_title, value, probability,
        expected_close_date, position, source, tags, custom_fields, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        tenantId, pipelineId, stageId, assignedTo || null, name,
        email || null, phone || null, whatsappJid || null,
        company || null, positionTitle || null, value || 0,
        probability || 50, expectedCloseDate || null, position,
        source || 'manual', tags || [], customFields || {},
        notes || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a lead.
 * PUT /api/v1/crm/leads/:id
 */
export async function updateLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    // Verify lead exists
    const existing = await query(
      'SELECT id FROM leads WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Lead', id);
    }

    const updatableFields: Record<string, string> = {
      stageId: 'stage_id', pipelineId: 'pipeline_id', assignedTo: 'assigned_to',
      name: 'name', email: 'email', phone: 'phone', whatsappJid: 'whatsapp_jid',
      company: 'company', positionTitle: 'position_title', value: 'value',
      probability: 'probability', expectedCloseDate: 'expected_close_date',
      position: 'position', source: 'source', tags: 'tags',
      customFields: 'custom_fields', notes: 'notes', lostReason: 'lost_reason',
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(updatableFields)) {
      if (req.body[jsKey] !== undefined) {
        setClauses.push(`"${dbCol}" = $${idx++}`);
        values.push(req.body[jsKey]);
      }
    }

    // Handle won/lost status
    if (req.body.status === 'won') {
      setClauses.push(`won_at = NOW()`);
    } else if (req.body.status === 'lost') {
      setClauses.push(`lost_at = NOW()`);
    }

    if (setClauses.length === 0) {
      throw new ValidationError('No fields to update');
    }

    values.push(id, tenantId);
    const result = await query(
      `UPDATE leads SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING *`,
      values
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Move a lead to a different stage (Kanban drag-and-drop).
 * PATCH /api/v1/crm/leads/:id/move
 */
export async function moveLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { stageId, position } = req.body;
    const tenantId = req.tenantId!;

    if (!stageId || position === undefined) {
      throw new ValidationError('stageId and position are required');
    }

    await transaction(async (client) => {
      // Shift existing leads in the target stage
      await client.query(
        `UPDATE leads SET position = position + 1
         WHERE stage_id = $1 AND position >= $2 AND tenant_id = $3`,
        [stageId, position, tenantId]
      );

      // Move the lead
      await client.query(
        `UPDATE leads SET stage_id = $1, position = $2
         WHERE id = $3 AND tenant_id = $4`,
        [stageId, position, id, tenantId]
      );
    });

    const result = await query(
      `SELECT l.*, ps.name as stage_name, ps.color as stage_color
       FROM leads l
       LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
       WHERE l.id = $1`,
      [id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a lead.
 * DELETE /api/v1/crm/leads/:id
 */
export async function deleteLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const result = await query(
      'DELETE FROM leads WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Lead', id);
    }

    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get Kanban board data — all leads grouped by stage for a pipeline.
 * GET /api/v1/crm/leads/kanban/:pipelineId
 */
export async function getKanbanBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pipelineId } = req.params;
    const tenantId = req.tenantId!;

    // Get stages
    const stages = await query(
      `SELECT * FROM pipeline_stages
       WHERE pipeline_id = $1
       ORDER BY position ASC`,
      [pipelineId]
    );

    // Get leads grouped by stage
    const leads = await query(
      `SELECT l.*, u.full_name as assigned_name, u.avatar_url as assigned_avatar,
              (SELECT COUNT(*) FROM whatsapp_messages wm WHERE wm.lead_id = l.id) as messages_count
       FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE l.pipeline_id = $1 AND l.tenant_id = $2
         AND l.won_at IS NULL AND l.lost_at IS NULL
       ORDER BY l.position ASC`,
      [pipelineId, tenantId]
    );

    // Group leads by stage
    const board = stages.rows.map((stage) => ({
      ...stage,
      leads: leads.rows.filter((lead) => lead.stage_id === stage.id),
      totalValue: leads.rows
        .filter((lead) => lead.stage_id === stage.id)
        .reduce((sum, lead) => sum + parseFloat(lead.value || '0'), 0),
    }));

    res.json({
      success: true,
      data: {
        pipelineId,
        stages: board,
        totals: {
          leads: leads.rows.length,
          value: leads.rows.reduce((sum, l) => sum + parseFloat(l.value || '0'), 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
