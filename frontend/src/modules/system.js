import { api } from '../lib/api.js';
import icon from '../lib/icons.js';

function renderEmptyState(title, subtitle, iconName) {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__subtitle">${subtitle}</p>
      </div>
    </div>
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      ${icon(iconName, 48)}
      <h3 style="margin: 16px 0 8px;">Módulo Vazio</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
        Nenhum dado real foi encontrado.
      </p>
    </div>
  `;
}

export async function renderVault(container) {
  container.innerHTML = `<div style="padding: 32px; text-align:center;"><span class="spinner"></span></div>`;
  try {
    const res = await api.vault.listEntries();
    const data = res.data || [];
    
    if (data.length === 0) {
      container.innerHTML = renderEmptyState('Cofre', 'Senhas salvas', 'vault');
    } else {
      container.innerHTML = `<div style="color:white;">Cofre items here</div>`;
    }
  } catch (err) {
    container.innerHTML = renderEmptyState('Cofre', 'Senhas salvas', 'vault');
  }
}

export async function renderAudit(container) {
  container.innerHTML = renderEmptyState('Auditoria Sentinela V6', 'Logs do sistema', 'shield');
}

export async function renderTeam(container) {
  container.innerHTML = renderEmptyState('Equipe', 'Membros do tenant', 'team');
}

export async function renderSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Configurações</h1>
        <p class="page-header__subtitle">Gerencie sua conta</p>
      </div>
    </div>
    <div class="card" style="margin-top: 24px;">
      <div class="card__body">
        (WIP) Página de configurações em branco.
      </div>
    </div>
  `;
}
