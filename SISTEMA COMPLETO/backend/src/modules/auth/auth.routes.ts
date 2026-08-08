import { Router } from 'express';
import { register, login, refreshAccessToken, logout, getMe } from './auth.controller.js';
import { authGuard } from '../../middleware/authGuard.js';
import { csrfTokenHandler } from '../../middleware/csrfProtection.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshAccessToken);
router.get('/csrf-token', csrfTokenHandler);

// Protected routes
router.post('/logout', authGuard(), logout);
router.get('/me', authGuard(), getMe);

export default router;
