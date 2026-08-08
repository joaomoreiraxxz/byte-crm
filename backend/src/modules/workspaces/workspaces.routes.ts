import { Router } from 'express';
import { authGuard as requireAuth } from '../../middleware/authGuard.js';
import { listWorkspaces, createWorkspace, getWorkspace } from './workspaces.controller.js';

import { listTasks, createTask, listNotes, createNote, listEvents, createEvent } from './productivity.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listWorkspaces);
router.post('/', createWorkspace);
router.get('/:id', getWorkspace);

// Productivity
router.get('/:id/tasks', listTasks);
router.post('/:id/tasks', createTask);
router.get('/:id/notes', listNotes);
router.post('/:id/notes', createNote);
router.get('/:id/events', listEvents);
router.post('/:id/events', createEvent);

export default router;
