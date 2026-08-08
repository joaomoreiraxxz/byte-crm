import { api } from '../lib/api.js';
import icon from '../lib/icons.js';

export async function renderDashboard(container) {
  container.innerHTML = `
    <div style="padding: 32px; display:flex; justify-content:center; align-items:center; height: 100%;">
      <span class="spinner"></span> Carregando...
    </div>
  `;

  try {
    const leadsRes = await api.crm.getLeads();
    const leads = leadsRes.data || [];
    
    // Calculate stats
    const totalLeads = leads.length;
    const totalValue = leads.reduce((acc, lead) => acc + (parseFloat(lead.value) || 0), 0);
    
    const hasData = totalLeads > 0;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Dashboard</h1>
          <p class="page-header__subtitle">Visão geral do seu negócio em tempo real</p>
        </div>
      </div>

      <div class="stats-grid stagger">
        <div class="card stat-card" style="--stat-accent: var(--color-accent); --stat-bg: var(--color-accent-light)">
          <div class="stat-card__icon">${icon('contacts', 20)}</div>
          <div class="stat-card__label">Leads Ativos</div>
          <div class="stat-card__value counter-anim">${totalLeads}</div>
        </div>
        <div class="card stat-card" style="--stat-accent: var(--color-success); --stat-bg: var(--color-success-bg)">
          <div class="stat-card__icon" style="background: var(--color-success-bg); color: var(--color-success)">${icon('moneyIn', 20)}</div>
          <div class="stat-card__label">Receita em Pipeline</div>
          <div class="stat-card__value counter-anim">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}</div>
        </div>
        <div class="card stat-card" style="--stat-accent: var(--color-warning); --stat-bg: var(--color-warning-bg)">
          <div class="stat-card__icon" style="background: var(--color-warning-bg); color: var(--color-warning)">${icon('clock', 20)}</div>
          <div class="stat-card__label">Mensagens Hoje</div>
          <div class="stat-card__value counter-anim">0</div>
        </div>
      </div>

      ${!hasData ? `
        <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
          ${icon('dashboard', 48)}
          <h3 style="margin: 16px 0 8px;">Dashboard Vazio</h3>
          <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
            Assim que você começar a adicionar leads no CRM e contas no Financeiro, os gráficos reais aparecerão aqui em tempo real.
          </p>
        </div>
      ` : `
        <div class="card" style="margin-top: 24px;">
          <div class="card__header">
            <h3 class="card__title">Leads Recentes</h3>
          </div>
          <div class="card__body" style="padding:0;">
            <table class="data-table">
              <thead><tr><th>Nome</th><th>Empresa</th><th>Valor</th></tr></thead>
              <tbody>
                ${leads.slice(0, 5).map(l => `
                  <tr>
                    <td style="font-weight:var(--fw-medium);">${l.title}</td>
                    <td>${l.companyName || '-'}</td>
                    <td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.value || 0)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="padding: 24px; text-align: center; color: var(--color-danger);">
        Erro ao carregar dashboard: ${err.message}
      </div>
    `;
  }
}
