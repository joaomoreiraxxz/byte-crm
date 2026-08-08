import { Request, Response, NextFunction } from 'express';
import { query, transaction } from '../../../config/database.js';
import { parsePagination, calcOffset, paginatedResponse, buildOrderBy } from '../../../utils/pagination.js';
import { ValidationError, NotFoundError } from '../../../utils/errors.js';

/**
 * List contas a pagar with filters.
 * GET /api/v1/erp/contas-pagar
 */
export async function listContasPagar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const pagination = parsePagination(req.query as Record<string, string>);
    const offset = calcOffset(pagination.page, pagination.limit);

    const conditions: string[] = ['cp.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (req.query.status) { conditions.push(`cp.status = $${idx++}`); params.push(req.query.status); }
    if (req.query.categoriaId) { conditions.push(`cp.categoria_id = $${idx++}`); params.push(req.query.categoriaId); }
    if (req.query.contaBancariaId) { conditions.push(`cp.conta_bancaria_id = $${idx++}`); params.push(req.query.contaBancariaId); }
    if (req.query.startDate) { conditions.push(`cp.due_date >= $${idx++}`); params.push(req.query.startDate); }
    if (req.query.endDate) { conditions.push(`cp.due_date <= $${idx++}`); params.push(req.query.endDate); }
    if (req.query.supplier) { conditions.push(`cp.supplier ILIKE $${idx++}`); params.push(`%${req.query.supplier}%`); }
    if (req.query.search) {
      conditions.push(`(cp.description ILIKE $${idx} OR cp.supplier ILIKE $${idx})`);
      params.push(`%${req.query.search}%`); idx++;
    }

    const where = conditions.join(' AND ');
    const orderBy = buildOrderBy({ ...pagination, sortBy: pagination.sortBy || 'due_date' });

    const countResult = await query(`SELECT COUNT(*) as total FROM contas_pagar cp WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT cp.*, c.name as categoria_name, c.color as categoria_color,
              cb.name as conta_bancaria_name, u.full_name as created_by_name
       FROM contas_pagar cp
       LEFT JOIN categorias c ON c.id = cp.categoria_id
       LEFT JOIN contas_bancarias cb ON cb.id = cp.conta_bancaria_id
       LEFT JOIN users u ON u.id = cp.created_by
       WHERE ${where} ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pagination.limit, offset]
    );

    // Summary totals
    const summaryResult = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'pendente' THEN amount - amount_paid ELSE 0 END), 0) as total_pendente,
        COALESCE(SUM(CASE WHEN status = 'vencido' THEN amount - amount_paid ELSE 0 END), 0) as total_vencido,
        COALESCE(SUM(CASE WHEN status = 'pago' THEN amount_paid ELSE 0 END), 0) as total_pago
       FROM contas_pagar cp WHERE ${where}`,
      params.slice(0, params.length) // reuse same params
    );

    res.json({
      success: true,
      ...paginatedResponse(result.rows, total, pagination),
      summary: summaryResult.rows[0],
    });
  } catch (error) { next(error); }
}

/**
 * Create a conta a pagar.
 * POST /api/v1/erp/contas-pagar
 */
export async function createContaPagar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const {
      categoriaId, contaBancariaId, description, supplier, amount,
      dueDate, competenceDate, recurrence, recurrenceEndDate,
      documentNumber, barcode, pixKey, notes, totalInstallments,
    } = req.body;

    if (!description || !amount || !dueDate) {
      throw new ValidationError('description, amount, and dueDate are required');
    }

    if (totalInstallments && totalInstallments > 1) {
      // Create installments
      const results = await transaction(async (client) => {
        const installments = [];
        const baseDate = new Date(dueDate);

        for (let i = 0; i < totalInstallments; i++) {
          const installmentDate = new Date(baseDate);
          installmentDate.setMonth(installmentDate.getMonth() + i);
          const installmentAmount = (parseFloat(amount) / totalInstallments).toFixed(2);

          const result = await client.query(
            `INSERT INTO contas_pagar (
              tenant_id, categoria_id, conta_bancaria_id, description, supplier,
              amount, due_date, competence_date, recurrence, document_number,
              barcode, pix_key, notes, installment_number, total_installments, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *`,
            [
              tenantId, categoriaId || null, contaBancariaId || null,
              `${description} (${i + 1}/${totalInstallments})`, supplier || null,
              installmentAmount, installmentDate.toISOString().split('T')[0],
              competenceDate || null, 'mensal', documentNumber || null,
              barcode || null, pixKey || null, notes || null,
              i + 1, totalInstallments, userId,
            ]
          );
          installments.push(result.rows[0]);
        }
        return installments;
      });

      res.status(201).json({ success: true, data: results });
    } else {
      const result = await query(
        `INSERT INTO contas_pagar (
          tenant_id, categoria_id, conta_bancaria_id, description, supplier,
          amount, due_date, competence_date, recurrence, recurrence_end_date,
          document_number, barcode, pix_key, notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *`,
        [
          tenantId, categoriaId || null, contaBancariaId || null,
          description, supplier || null, amount, dueDate,
          competenceDate || null, recurrence || 'unica', recurrenceEndDate || null,
          documentNumber || null, barcode || null, pixKey || null,
          notes || null, userId,
        ]
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    }
  } catch (error) { next(error); }
}

/**
 * Pay a conta a pagar — creates transaction and updates balance.
 * POST /api/v1/erp/contas-pagar/:id/pay
 */
export async function payContaPagar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { amountPaid, contaBancariaId, paymentDate, notes } = req.body;

    if (!amountPaid || !contaBancariaId) {
      throw new ValidationError('amountPaid and contaBancariaId are required');
    }

    const result = await transaction(async (client) => {
      // Get the bill
      const bill = await client.query(
        'SELECT * FROM contas_pagar WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenantId]
      );

      if (bill.rows.length === 0) throw new NotFoundError('Conta a pagar', id);

      const conta = bill.rows[0];
      const totalPaid = parseFloat(conta.amount_paid) + parseFloat(amountPaid);
      const status = totalPaid >= parseFloat(conta.amount) ? 'pago' : 'parcial';

      // Update bill
      await client.query(
        `UPDATE contas_pagar SET
          amount_paid = $1, status = $2, payment_date = $3,
          conta_bancaria_id = $4, notes = COALESCE($5, notes)
         WHERE id = $6`,
        [totalPaid, status, paymentDate || new Date().toISOString().split('T')[0], contaBancariaId, notes, id]
      );

      // Create transaction (triggers balance update)
      const tx = await client.query(
        `INSERT INTO transacoes (
          tenant_id, conta_bancaria_id, categoria_id, conta_pagar_id,
          type, amount, description, transaction_date, created_by
        ) VALUES ($1,$2,$3,$4,'saida',$5,$6,$7,$8)
        RETURNING *`,
        [
          tenantId, contaBancariaId, conta.categoria_id, id,
          amountPaid, `Pagamento: ${conta.description}`,
          paymentDate || new Date().toISOString().split('T')[0], userId,
        ]
      );

      return { bill: { ...conta, amount_paid: totalPaid, status }, transaction: tx.rows[0] };
    });

    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

/**
 * Get conciliação bancária report.
 * GET /api/v1/erp/conciliacao/:contaBancariaId
 */
export async function getConciliacao(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contaBancariaId } = req.params;
    const tenantId = req.tenantId!;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Verify account belongs to tenant
    const account = await query(
      'SELECT * FROM contas_bancarias WHERE id = $1 AND tenant_id = $2',
      [contaBancariaId, tenantId]
    );
    if (account.rows.length === 0) throw new NotFoundError('Conta bancária', contaBancariaId);

    // Run conciliação function
    const conciliacao = await query(
      'SELECT * FROM fn_conciliar_saldo($1, $2, $3)',
      [contaBancariaId, month, year]
    );

    // Get unconciliated transactions
    const unconciliated = await query(
      `SELECT t.*, c.name as categoria_name
       FROM transacoes t
       LEFT JOIN categorias c ON c.id = t.categoria_id
       WHERE t.conta_bancaria_id = $1
         AND t.is_conciliated = false
         AND EXTRACT(MONTH FROM t.transaction_date) = $2
         AND EXTRACT(YEAR FROM t.transaction_date) = $3
       ORDER BY t.transaction_date DESC`,
      [contaBancariaId, month, year]
    );

    res.json({
      success: true,
      data: {
        account: account.rows[0],
        period: { month, year },
        conciliacao: conciliacao.rows[0] || null,
        unconciliatedTransactions: unconciliated.rows,
      },
    });
  } catch (error) { next(error); }
}

/**
 * Conciliate a transaction (mark as verified).
 * PATCH /api/v1/erp/transacoes/:id/conciliate
 */
export async function conciliateTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const tenantId = req.tenantId!;

    const result = await query(
      `UPDATE transacoes SET
        is_conciliated = true, conciliated_at = NOW(), conciliated_by = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, id, tenantId]
    );

    if (result.rows.length === 0) throw new NotFoundError('Transação', id);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
}
