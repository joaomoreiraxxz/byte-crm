import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { getState, setState } from '../lib/store.js';
import { showToast } from '../lib/websocket.js';

// ─── Modal Helper ─────────────────────────────────────────────
function showModal(title, bodyHTML, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s ease';
  overlay.innerHTML = `
    <div class="card" style="width:460px;max-width:90vw;padding:28px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;box-shadow:0 24px 48px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:18px;">${title}</h3>
        <button class="btn-modal-close" style="background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:20px;">&times;</button>
      </div>
      <form id="modal-form">${bodyHTML}
        <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end;">
          <button type="button" class="btn btn--secondary btn-modal-close">Cancelar</button>
          <button type="submit" class="btn btn--primary">Salvar</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.btn-modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await onSubmit(e); overlay.remove(); } catch (err) { showToast(err.message, 'error'); }
  });
  return overlay;
}

// ─── Workspaces ───────────────────────────────────────────────
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

  container.querySelector('#btn-new-workspace').addEventListener('click', () => {
    showModal('Criar Workspace', `
      <div class="input-group" style="margin-bottom:12px;">
        <label class="input-label">Nome do Workspace</label>
        <input type="text" id="ws-name" class="input" required placeholder="Ex: Equipe Comercial" />
      </div>
      <div class="input-group" style="margin-bottom:12px;">
        <label class="input-label">Descrição (opcional)</label>
        <input type="text" id="ws-desc" class="input" placeholder="Breve descrição" />
      </div>
    `, async () => {
      const name = document.querySelector('#ws-name').value;
      const description = document.querySelector('#ws-desc').value;
      await api.post('/workspaces', { name, description });
      showToast('Workspace criado!', 'success');
      loadWorkspaces(container);
    });
  });

  loadWorkspaces(container);
}

async function loadWorkspaces(container) {
  const list = container.querySelector('#workspaces-list');
  try {
    const res = await api.get('/workspaces');
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

    const active = getState('activeWorkspace');

    list.innerHTML = workspaces.map(w => `
      <div class="card contact-card workspace-card ${active && active.id === w.id ? 'workspace-card--active' : ''}" data-id="${w.id}" data-name="${w.name}" style="cursor:pointer;transition:transform .2s,box-shadow .2s;${active && active.id === w.id ? 'border:2px solid var(--color-primary);box-shadow:0 0 16px rgba(56,189,248,0.3);' : ''}">
        <div class="avatar avatar--xl contact-card__avatar" style="background:var(--color-primary);color:white;font-weight:700;">
          ${w.name.substring(0, 2).toUpperCase()}
        </div>
        <div class="contact-card__name" style="margin-top:16px;font-size:18px;">${w.name}</div>
        <div style="margin-top:4px;font-size:12px;color:var(--color-text-secondary);">${w.description || 'Sem descrição'}</div>
        <div class="contact-card__role" style="margin-top:12px;">
          <button class="btn ${active && active.id === w.id ? 'btn--primary' : 'btn--secondary'} btn--sm btn-enter-ws">
            ${active && active.id === w.id ? '✓ Ativo' : 'Entrar'}
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.workspace-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const name = card.dataset.name;
        setState('activeWorkspace', { id, name });
        showToast(`Workspace "${name}" ativado`, 'success');
        loadWorkspaces(container); // Re-render to update active state
      });
    });

  } catch (err) {
    list.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; color:var(--color-danger);">Erro ao carregar: ${err.message}</div>`;
  }
}
