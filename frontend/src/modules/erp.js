import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { showToast } from '../lib/websocket.js';
import { getState } from '../lib/store.js';

// ─── Reusable Modal ─────────────────────────────────────────────
function showModal(title, bodyHTML, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">${title}</h3>
        <button class="modal__close btn-close-modal">${icon('close', 18)}</button>
      </div>
      <form id="modal-form">
        <div class="modal__body">${bodyHTML}</div>
        <div class="modal__footer">
          <button type="button" class="btn btn--secondary btn-close-modal">Cancelar</button>
          <button type="submit" class="btn btn--primary">Salvar</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = overlay.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner--sm"></span>';
    try { await onSubmit(e); overlay.remove(); } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Salvar'; }
  });
  return overlay;
}

function renderEmptyState(title, subtitle, iconName) {
  return `
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      <div style="opacity:0.3;margin-bottom:16px;">${icon(iconName, 48)}</div>
      <h3 style="margin: 0 0 8px;">Nenhum dado encontrado</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.6;">
        Sua lista de ${title.toLowerCase()} está vazia no momento. Clique em "Adicionar" para criar o primeiro registro.
      </p>
    </div>
  `;
}

export async function renderContasPagar(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Contas a Pagar</h1>
        <p class="page-header__subtitle">Gerencie suas obrigações financeiras</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm" id="btn-add-pagar">${icon('plus', 16)} Nova Conta</button>
      </div>
    </div>
    <div id="pagar-content"><div style="padding: 32px; text-align:center;"><span class="spinner"></span> Carregando...</div></div>
  `;

  container.querySelector('#btn-add-pagar')?.addEventListener('click', () => {
    showModal('Nova Conta a Pagar', `
      <div class="input-group" style="margin-bottom:12px;">
        <label class="input-label">Descrição *</label>
        <input type="text" id="cp-desc" class="input" required placeholder="Ex: Aluguel do escritório" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="input-group">
          <label class="input-label">Valor (R$) *</label>
          <input type="number" id="cp-value" class="input" required step="0.01" placeholder="0.00" />
        </div>
        <div class="input-group">
          <label class="input-label">Vencimento *</label>
          <input type="date" id="cp-due" class="input" required />
        </div>
      </div>
      <div class="input-group" style="margin-top:12px;">
        <label class="input-label">Fornecedor</label>
        <input type="text" id="cp-supplier" class="input" placeholder="Nome do fornecedor" />
      </div>
    `, async () => {
      await api.post('/erp/contas-pagar', {
        description: document.getElementById('cp-desc').value,
        amount: parseFloat(document.getElementById('cp-value').value),
        dueDate: document.getElementById('cp-due').value,
        supplier: document.getElementById('cp-supplier').value || null,
      });
      showToast('Conta criada com sucesso!', 'success');
      loadContasPagar(container);
    });
  });

  loadContasPagar(container);
}

async function loadContasPagar(container) {
  const content = container.querySelector('#pagar-content');
  try {
    const res = await api.erp.getContasPagar();
    const data = res.data || [];

    if (data.length === 0) {
      content.innerHTML = renderEmptyState('Contas a Pagar', 'obrigações', 'moneyOut');
      return;
    }

    content.innerHTML = `
      <div class="card" style="overflow:hidden;">
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
            <tbody>
              ${data.map(item => `
                <tr>
                  <td style="font-weight:var(--fw-medium);">${item.description || '—'}</td>
                  <td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount || 0)}</td>
                  <td>${item.due_date ? new Date(item.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  <td><span class="badge ${item.status === 'paid' ? 'badge--success' : item.status === 'overdue' ? 'badge--danger' : 'badge--warning'}">${item.status === 'paid' ? 'Pago' : item.status === 'overdue' ? 'Vencido' : 'Pendente'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = renderEmptyState('Contas a Pagar', 'obrigações', 'moneyOut');
  }
}

export async function renderContasReceber(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Contas a Receber</h1>
        <p class="page-header__subtitle">Acompanhe seus recebíveis</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Nova Conta</button>
      </div>
    </div>
    ${renderEmptyState('Contas a Receber', 'recebíveis', 'moneyIn')}
  `;
}

export async function renderConciliacao(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Conciliação Bancária</h1>
        <p class="page-header__subtitle">Compare extratos bancários</p>
      </div>
    </div>
    ${renderEmptyState('Conciliação Bancária', 'registros', 'bank')}
  `;
}

export async function renderReports(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Relatórios</h1>
        <p class="page-header__subtitle">Análises e métricas do seu negócio</p>
      </div>
    </div>
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      <div style="opacity:0.3;margin-bottom:16px;">${icon('reports', 48)}</div>
      <h3 style="margin: 0 0 8px;">Módulo de Relatórios</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.6;">
        Os relatórios serão gerados automaticamente quando houver dados suficientes no sistema. Adicione leads, vendas e transações para desbloquear as análises.
      </p>
    </div>
  `;
}
