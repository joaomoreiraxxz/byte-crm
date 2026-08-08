import { Request, Response, NextFunction } from 'express';
import { query } from '../../config/database.js';
import { ValidationError } from '../../utils/errors.js';

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    if (!workspaceId) throw new ValidationError('Workspace is required');
    const result = await query('SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    const { title, description, status, priority, dueDate } = req.body;
    if (!workspaceId || !title) throw new ValidationError('Workspace and Title are required');
    
    const result = await query(
      'INSERT INTO tasks (workspace_id, title, description, status, priority, due_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [workspaceId, title, description, status || 'pending', priority || 'medium', dueDate || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
}

export async function listNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    if (!workspaceId) throw new ValidationError('Workspace is required');
    const result = await query('SELECT * FROM notes WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

export async function createNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    const { title, content } = req.body;
    if (!workspaceId || !title) throw new ValidationError('Workspace and Title are required');
    
    const result = await query(
      'INSERT INTO notes (workspace_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [workspaceId, title, content]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
}

export async function listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    if (!workspaceId) throw new ValidationError('Workspace is required');
    const result = await query('SELECT * FROM calendar_events WHERE workspace_id = $1 ORDER BY start_time ASC', [workspaceId]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
}

export async function createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    const { title, description, startTime, endTime } = req.body;
    if (!workspaceId || !title || !startTime || !endTime) throw new ValidationError('Missing required fields');
    
    const result = await query(
      'INSERT INTO calendar_events (workspace_id, title, description, start_time, end_time) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [workspaceId, title, description, startTime, endTime]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
}
