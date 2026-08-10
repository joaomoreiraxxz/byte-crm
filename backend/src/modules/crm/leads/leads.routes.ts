import { Router } from 'express';
import { listLeads, getLead, createLead, updateLead, moveLead, deleteLead, getKanbanBoard, addLeadNote, getLeadActivities } from './leads.controller.js';
import { authGuard, requireRole } from '../../../middleware/authGuard.js';

const router = Router();

router.use(authGuard());

router.get('/', listLeads);
router.get('/kanban/:pipelineId', getKanbanBoard);
router.get('/:id', getLead);
router.post('/', createLead);
router.put('/:id', updateLead);
router.patch('/:id/move', moveLead);
router.delete('/:id', requireRole('owner', 'admin', 'manager'), deleteLead);

// Lead Activities / Notes
router.get('/:id/activities', getLeadActivities);
router.post('/:id/notes', addLeadNote);

export default router;
