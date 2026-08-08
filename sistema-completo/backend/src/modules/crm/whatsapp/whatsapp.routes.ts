import { Router } from 'express';
import { handleEvolutionWebhook, sendMessage, getMessages } from './whatsapp.controller.js';
import { authGuard } from '../../../middleware/authGuard.js';

const router = Router();

// Webhook — no auth (validated by instance matching)
router.post('/webhooks/evolution', handleEvolutionWebhook);

// Protected routes
router.post('/whatsapp/send', authGuard(), sendMessage);
router.get('/whatsapp/messages/:leadId', authGuard(), getMessages);

export default router;
