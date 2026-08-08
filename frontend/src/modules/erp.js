import { api } from '../lib/api.js';
import icon from '../lib/icons.js';

function renderEmptyState(title, subtitle, iconName) {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__subtitle">${subtitle}</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Adicionar</button>
      </div>
    </div>
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      ${icon(iconName, 48)}
      <h3 style="margin: 16px 0 8px;">Nenhum dado encontrado</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
        Sua lista de ${title.toLowerCase()} está vazia no momento.
      </p>
    </div>
  `;
}

export async function renderContasPagar(container) {
  container.innerHTML = `<div style="padding: 32px; text-align:center;"><span class="spinner"></span></div>`;
  try {
    const res = await api.erp.getTransactions('payable');
    const data = res.data || [];
    
    if (data.length === 0) {
      container.innerHTML = renderEmptyState('Contas a Pagar', 'Gerencie obrigações', 'moneyOut');
    } else {
      container.innerHTML = `<div style="color:white;">Contas a pagar list here</div>`;
    }
  } catch (err) {
    container.innerHTML = renderEmptyState('Contas a Pagar', 'Gerencie obrigações', 'moneyOut');
  }
}

export async function renderContasReceber(container) {
  container.innerHTML = renderEmptyState('Contas a Receber', 'Acompanhe recebíveis', 'moneyIn');
}

export async function renderConciliacao(container) {
  container.innerHTML = renderEmptyState('Conciliação Bancária', 'Compare extratos', 'bank');
}

export async function renderReports(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Relatórios Reais</h1>
        <p class="page-header__subtitle">Sem dados falsos. Módulo em construção.</p>
      </div>
    </div>
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      ${icon('reports', 48)}
      <h3 style="margin: 16px 0 8px;">Módulo de Relatórios</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
        Você solicitou a remoção de todos os dados falsos. Como ainda não há dados suficientes no banco, os relatórios estão indisponíveis.
      </p>
    </div>
  `;
}
