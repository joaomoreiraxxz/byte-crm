import { Router } from 'express';
import {
  setupVault,
  unlockVault,
  lockVault,
  listVaultEntries,
  getVaultEntry,
  createVaultEntry,
} from './vault.controller.js';
import { authGuard } from '../../middleware/authGuard.js';

const router = Router();
router.use(authGuard());

// Vault management
router.post('/setup', setupVault);
router.post('/unlock', unlockVault);
router.post('/lock', lockVault);

// Vault entries (require vault session via X-Vault-Session header)
router.get('/entries', listVaultEntries);
router.get('/entries/:id', getVaultEntry);
router.post('/entries', createVaultEntry);

export default router;
