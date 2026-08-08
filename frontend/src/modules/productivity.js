import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { getState } from '../lib/store.js';

export async function renderProductivity(container, type) {
  const ws = getState('activeWorkspace');
  if (!ws) {
    container.innerHTML = `<div style="padding:48px;text-align:center;color:red;">Selecione um Workspace primeiro!</div>`;
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
  btnCreate.addEventListener('click', async () => {
    const itemTitle = prompt(`Título (${title}):`);
    if (!itemTitle) return;
    try {
      let body = { title: itemTitle };
      if (type === 'tasks') body.description = '';
      if (type === 'notes') body.content = '';
      if (type === 'events') {
        body.startTime = new Date().toISOString();
        body.endTime = new Date(Date.now() + 3600000).toISOString();
      }
      
      await api.request('POST', endpoint, body);
      loadData();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  });

  const loadData = async () => {
    const list = container.querySelector('#data-list');
    try {
      const res = await api.request('GET', endpoint);
      const data = res.data || [];
      if (data.length === 0) {
        list.innerHTML = `<div class="card" style="padding:48px;text-align:center;">Nenhum registro encontrado.</div>`;
        return;
      }
      
      list.innerHTML = data.map(item => `
        <div class="card" style="padding: 16px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin-bottom:4px;">${item.title}</h3>
            <span style="font-size:12px; color:var(--color-text-secondary);">${new Date(item.created_at || item.start_time).toLocaleString()}</span>
          </div>
          <div>
            ${item.status ? `<span class="badge badge--primary">${item.status}</span>` : ''}
          </div>
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = `<div style="color:red;">${err.message}</div>`;
    }
  };

  loadData();
}
