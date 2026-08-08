import { Router } from 'express';
import { listContasPagar, createContaPagar, payContaPagar, getConciliacao, conciliateTransaction } from './erp.controller.js';
import { authGuard, requireRole } from '../../middleware/authGuard.js';

const router = Router();
router.use(authGuard());

// Contas a Pagar
router.get('/contas-pagar', listContasPagar);
router.post('/contas-pagar', createContaPagar);
router.post('/contas-pagar/:id/pay', requireRole('owner', 'admin', 'manager'), payContaPagar);

// Conciliação
router.get('/conciliacao/:contaBancariaId', requireRole('owner', 'admin', 'manager'), getConciliacao);
router.patch('/transacoes/:id/conciliate', requireRole('owner', 'admin'), conciliateTransaction);

export default router;
