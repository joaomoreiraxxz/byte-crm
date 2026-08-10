import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { getState } from '../lib/store.js';
import { showToast } from '../lib/websocket.js';

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

// ─── Productivity Module ────────────────────────────────────────
export async function renderProductivity(container, type) {
  const ws = getState('activeWorkspace');
  if (!ws) {
    container.innerHTML = `
      <div class="card" style="margin-top:24px;text-align:center;padding:48px;">
        ${icon('dashboard', 48)}
        <h3 style="margin:16px 0 8px;">Nenhum Workspace Selecionado</h3>
        <p style="color:var(--color-text-secondary);max-width:400px;margin:0 auto;">
          Para acessar este módulo, vá até a aba "Workspaces" e selecione um espaço de trabalho.
        </p>
      </div>`;
    return;
  }

  let title, subtitle, endpoint;
  if (type === 'tasks') {
    title = 'Tarefas';
    subtitle = 'Gerenciamento de atividades do workspace';
    endpoint = `/workspaces/${ws.id}/tasks`;
  } else if (type === 'notes') {
    title = 'Notas';
    subtitle = 'Anotações rápidas';
    endpoint = `/workspaces/${ws.id}/notes`;
  } else {
    title = 'Agenda';
    subtitle = 'Eventos e compromissos';
    endpoint = `/workspaces/${ws.id}/events`;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__subtitle">${subtitle} (${ws.name})</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary" id="btn-create">${icon('plus', 16)} Novo Registro</button>
      </div>
    </div>
    <div id="data-list" style="margin-top:24px; display:flex; flex-direction:column; gap:16px;">
      <div style="padding: 32px; text-align:center;"><span class="spinner"></span></div>
    </div>
  `;

  const btnCreate = container.querySelector('#btn-create');
  btnCreate.addEventListener('click', () => {
    let modalBody = '';

    if (type === 'tasks') {
      modalBody = `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Título *</label>
          <input type="text" id="item-title" class="input" required placeholder="Nome da tarefa" />
        </div>
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Descrição</label>
          <textarea id="item-desc" class="input" rows="3" placeholder="Detalhes..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="input-group">
            <label class="input-label">Prioridade</label>
            <select id="item-priority" class="input">
              <option value="low">Baixa</option>
              <option value="medium" selected>Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Data Limite</label>
            <input type="datetime-local" id="item-due" class="input" />
          </div>
        </div>`;
    } else if (type === 'notes') {
      modalBody = `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Título *</label>
          <input type="text" id="item-title" class="input" required placeholder="Título da nota" />
        </div>
        <div class="input-group">
          <label class="input-label">Conteúdo</label>
          <textarea id="item-content" class="input" rows="6" placeholder="Escreva sua nota..."></textarea>
        </div>`;
    } else {
      modalBody = `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Título do Evento *</label>
          <input type="text" id="item-title" class="input" required placeholder="Nome do evento" />
        </div>
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Descrição</label>
          <textarea id="item-desc" class="input" rows="2" placeholder="Detalhes..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="input-group">
            <label class="input-label">Início *</label>
            <input type="datetime-local" id="item-start" class="input" required />
          </div>
          <div class="input-group">
            <label class="input-label">Fim *</label>
            <input type="datetime-local" id="item-end" class="input" required />
          </div>
        </div>`;
    }

    showModal(`Novo(a) ${title.slice(0, -1)}`, modalBody, async () => {
      const itemTitle = document.getElementById('item-title').value;
      let body = { title: itemTitle };

      if (type === 'tasks') {
        body.description = document.getElementById('item-desc')?.value || '';
        body.priority = document.getElementById('item-priority')?.value || 'medium';
        body.dueDate = document.getElementById('item-due')?.value || null;
      } else if (type === 'notes') {
        body.content = document.getElementById('item-content')?.value || '';
      } else {
        body.description = document.getElementById('item-desc')?.value || '';
        body.startTime = document.getElementById('item-start')?.value ? new Date(document.getElementById('item-start').value).toISOString() : null;
        body.endTime = document.getElementById('item-end')?.value ? new Date(document.getElementById('item-end').value).toISOString() : null;
      }

      await api.post(endpoint, body);
      showToast(`${title.slice(0, -1)} criado(a) com sucesso!`, 'success');
      loadData();
    });
  });

  const loadData = async () => {
    const list = container.querySelector('#data-list');
    try {
      const res = await api.get(endpoint);
      const data = res.data || [];
      if (data.length === 0) {
        list.innerHTML = `
          <div class="card" style="padding:48px;text-align:center;">
            ${icon(type === 'tasks' ? 'check' : type === 'notes' ? 'edit' : 'calendar', 48)}
            <h3 style="margin:16px 0 8px;">Nenhum Registro</h3>
            <p style="color:var(--color-text-secondary);">Clique em "Novo Registro" para começar.</p>
          </div>`;
        return;
      }
      
      list.innerHTML = data.map(item => {
        const priorityColors = { low: 'badge--neutral', medium: 'badge--info', high: 'badge--warning', urgent: 'badge--danger' };
        const statusColors = { pending: 'badge--warning', in_progress: 'badge--info', completed: 'badge--success', cancelled: 'badge--neutral' };

        return `
          <div class="card" style="padding: 16px; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
              <h3 style="margin-bottom:4px;font-size:var(--fs-md);">${item.title}</h3>
              ${item.description || item.content ? `<p style="font-size:var(--fs-sm);color:var(--color-text-secondary);margin-top:4px;max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.description || item.content}</p>` : ''}
              <span style="font-size:11px; color:var(--color-text-muted);">${new Date(item.created_at || item.start_time).toLocaleString('pt-BR')}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${item.priority ? `<span class="badge ${priorityColors[item.priority] || 'badge--neutral'}">${item.priority}</span>` : ''}
              ${item.status ? `<span class="badge ${statusColors[item.status] || 'badge--neutral'}">${item.status}</span>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div style="color:var(--color-danger);padding:16px;">Erro: ${err.message}</div>`;
    }
  };

  loadData();
}
