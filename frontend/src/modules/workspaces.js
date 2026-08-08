import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { getState, setState } from '../lib/store.js';
import { renderDashboard } from './dashboard.js';
import { openTab } from './layout.js';

export async function renderWorkspaces(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Workspaces</h1>
        <p class="page-header__subtitle">Gerencie os espaços de trabalho da sua empresa</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm" id="btn-new-workspace">${icon('plus', 16)} Novo Workspace</button>
      </div>
    </div>
    <div id="workspaces-list" class="contacts-grid stagger" style="margin-top: 24px;">
      <div style="padding: 32px; text-align:center; grid-column: 1 / -1;"><span class="spinner"></span> Carregando...</div>
    </div>
  `;

  const btnNew = container.querySelector('#btn-new-workspace');
  btnNew.addEventListener('click', () => {
    const name = prompt('Nome do Workspace:');
    if (name) {
      api.request('POST', '/workspaces', { name, description: '' }).then(() => loadWorkspaces(container));
    }
  });

  loadWorkspaces(container);
}

async function loadWorkspaces(container) {
  const list = container.querySelector('#workspaces-list');
  try {
    const res = await api.request('GET', '/workspaces');
    const workspaces = res.data || [];

    if (workspaces.length === 0) {
      list.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 48px;">
          ${icon('dashboard', 48)}
          <h3 style="margin: 16px 0 8px;">Nenhum Workspace</h3>
          <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
            Sua empresa ainda não possui espaços de trabalho. Crie um para começar a gerenciar leads e funis.
          </p>
        </div>
      `;
      return;
    }

    list.innerHTML = workspaces.map(w => `
      <div class="card contact-card workspace-card" data-id="${w.id}" data-name="${w.name}" style="cursor: pointer; transition: transform 0.2s;">
        <div class="avatar avatar--xl contact-card__avatar" style="background: var(--color-primary); color: white;">
          ${w.name.substring(0, 2).toUpperCase()}
        </div>
        <div class="contact-card__name" style="margin-top: 16px; font-size: 18px;">${w.name}</div>
        <div class="contact-card__role" style="margin-top: 8px;">
          <button class="btn btn--secondary btn--sm btn-enter-ws">Entrar</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.workspace-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const name = card.dataset.name;
        setState('activeWorkspace', { id, name });
        // Redirect to CRM Pipeline or update UI
        alert(`Entrou no workspace: ${name}. Agora o CRM mostrará dados deste workspace.`);
      });
    });

  } catch (err) {
    list.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; color:red;">Erro: ${err.message}</div>`;
  }
}
