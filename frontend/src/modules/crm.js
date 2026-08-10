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

// ─── Pipeline / Kanban ──────────────────────────────────────────
export async function renderPipeline(container) {
  const ws = getState('activeWorkspace');

  if (!ws) {
    container.innerHTML = `
      <div class="page-header"><div><h1 class="page-header__title">Pipeline de Vendas</h1></div></div>
      <div class="card" style="margin-top:24px;text-align:center;padding:48px;">
        ${icon('pipeline', 48)}
        <h3 style="margin:16px 0 8px;">Nenhum Workspace Selecionado</h3>
        <p style="color:var(--color-text-secondary);max-width:400px;margin:0 auto;">
          Para visualizar seu funil de vendas, vá até a aba "Workspaces" no menu lateral e selecione ou crie um espaço de trabalho.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = `<div style="padding:32px;text-align:center;"><span class="spinner"></span> Carregando Pipeline...</div>`;

  try {
    // 1. Get pipelines for this workspace
    const pipelinesRes = await api.workspaces.getPipelines(ws.id);
    const pipelines = pipelinesRes.data || [];

    if (pipelines.length === 0) {
      container.innerHTML = `
        <div class="page-header"><div><h1 class="page-header__title">Pipeline de Vendas</h1></div></div>
        <div class="card" style="margin-top:24px;text-align:center;padding:48px;">
          ${icon('pipeline', 48)}
          <h3 style="margin:16px 0 8px;">Nenhum Pipeline Encontrado</h3>
          <p style="color:var(--color-text-secondary);">Crie um novo workspace para gerar um funil automaticamente.</p>
        </div>`;
      return;
    }

    const pipeline = pipelines[0];
    const stages = pipeline.stages || [];

    // 2. Get kanban data
    const kanbanRes = await api.crm.getKanban(pipeline.id);
    const board = kanbanRes.data;
    const kanbanStages = board.stages || [];

    // 3. Render
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Pipeline de Vendas</h1>
          <p class="page-header__subtitle">${pipeline.name} — ${ws.name}</p>
        </div>
        <div class="page-header__actions">
          <span style="font-size:var(--fs-sm);color:var(--color-text-secondary);margin-right:8px;">
            ${board.totals.leads} leads · ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(board.totals.value)}
          </span>
          <button class="btn btn--primary btn--sm" id="btn-new-lead">${icon('plus', 16)} Novo Lead</button>
        </div>
      </div>
      <div class="kanban-board" id="kanban-board">
        ${kanbanStages.map(stage => `
          <div class="kanban-column" data-stage-id="${stage.id}">
            <div class="kanban-column__header">
              <div class="kanban-column__title">
                <span class="kanban-column__dot" style="background:${stage.color}"></span>
                ${stage.name}
                <span class="kanban-column__count">${stage.leads.length}</span>
              </div>
            </div>
            <div class="kanban-column__cards" data-stage-id="${stage.id}"
                 style="min-height:80px;border:2px dashed transparent;border-radius:8px;transition:border-color .2s;">
              ${stage.leads.map(lead => renderKanbanCard(lead)).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;

    // ─── Drag & Drop ──────────────────────────────────────────
    const cards = container.querySelectorAll('.kanban-card');
    const dropZones = container.querySelectorAll('.kanban-column__cards');

    cards.forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        card.classList.add('sortable-ghost');
        e.dataTransfer.setData('text/plain', card.dataset.leadId);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('sortable-ghost');
        dropZones.forEach(z => z.style.borderColor = 'transparent');
      });
    });

    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.style.borderColor = 'var(--color-accent)';
      });
      zone.addEventListener('dragleave', () => {
        zone.style.borderColor = 'transparent';
      });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.style.borderColor = 'transparent';
        const leadId = e.dataTransfer.getData('text/plain');
        const newStageId = zone.dataset.stageId;
        const position = zone.children.length;

        // Optimistic: move card visually
        const cardEl = container.querySelector(`[data-lead-id="${leadId}"]`);
        if (cardEl) zone.appendChild(cardEl);

        try {
          await api.crm.moveLead(leadId, newStageId, position);
          showToast('Lead movido!', 'success');
          // Re-render to update counts
          renderPipeline(container);
        } catch (err) {
          showToast('Erro ao mover: ' + err.message, 'error');
          renderPipeline(container);
        }
      });
    });

    // ─── Click on card → Lead Detail ──────────────────────────
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        openLeadDetail(card.dataset.leadId, container, pipeline);
      });
    });

    // ─── New Lead Button ──────────────────────────────────────
    container.querySelector('#btn-new-lead').addEventListener('click', () => {
      const firstStage = kanbanStages[0];
      if (!firstStage) return showToast('Nenhum estágio encontrado', 'error');

      showModal('Criar Novo Lead', `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Nome *</label>
          <input type="text" id="lead-name" class="input" required placeholder="Nome do contato" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="input-group">
            <label class="input-label">E-mail</label>
            <input type="email" id="lead-email" class="input" placeholder="email@exemplo.com" />
          </div>
          <div class="input-group">
            <label class="input-label">Telefone</label>
            <input type="text" id="lead-phone" class="input" placeholder="(11) 99999-9999" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
          <div class="input-group">
            <label class="input-label">Empresa</label>
            <input type="text" id="lead-company" class="input" placeholder="Nome da empresa" />
          </div>
          <div class="input-group">
            <label class="input-label">Valor (R$)</label>
            <input type="number" id="lead-value" class="input" placeholder="0.00" step="0.01" />
          </div>
        </div>
        <div class="input-group" style="margin-top:12px;">
          <label class="input-label">Estágio</label>
          <select id="lead-stage" class="input">
            ${kanbanStages.filter(s => !s.is_won && !s.is_lost).map(s => `<option value="${s.id}" ${s.id === firstStage.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      `, async () => {
        const data = {
          name: document.getElementById('lead-name').value,
          email: document.getElementById('lead-email').value || null,
          phone: document.getElementById('lead-phone').value || null,
          company: document.getElementById('lead-company').value || null,
          value: parseFloat(document.getElementById('lead-value').value) || 0,
          pipelineId: pipeline.id,
          stageId: document.getElementById('lead-stage').value,
        };
        await api.crm.createLead(data);
        showToast('Lead criado com sucesso!', 'success');
        renderPipeline(container);
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="padding:24px;color:var(--color-danger);">Erro: ${err.message}</div>`;
  }
}

function renderKanbanCard(lead) {
  return `
    <div class="card kanban-card" data-lead-id="${lead.id}" draggable="true">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="kanban-card__name">${lead.name}</div>
          ${lead.company ? `<div class="kanban-card__company">${lead.company}</div>` : ''}
        </div>
        ${lead.assigned_avatar ? `<div class="avatar avatar--sm"><img src="${lead.assigned_avatar}" alt="" /></div>` : ''}
      </div>
      <div class="kanban-card__footer">
        <div class="kanban-card__value">${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(lead.value || 0)}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${lead.phone ? `<span title="Telefone">${icon('chat', 12)}</span>` : ''}
          ${lead.messages_count > 0 ? `<span title="Mensagens">${icon('whatsapp', 12)} ${lead.messages_count}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── Lead Detail Modal ──────────────────────────────────────────
async function openLeadDetail(leadId, container, pipeline) {
  try {
    const [leadRes, activitiesRes] = await Promise.all([
      api.crm.getLead(leadId),
      api.crm.getLeadActivities(leadId),
    ]);
    const lead = leadRes.data;
    const activities = activitiesRes.data || [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `
      <div class="modal modal--lg" style="max-height:90vh;overflow-y:auto;">
        <div class="modal__header">
          <h3 class="modal__title">${lead.name}</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn--ghost btn--sm" id="btn-edit-lead">${icon('edit', 14)} Editar</button>
            <button class="btn btn--danger btn--sm" id="btn-delete-lead">${icon('trash', 14)} Excluir</button>
            <button class="modal__close btn-close-modal">${icon('close', 18)}</button>
          </div>
        </div>
        <div class="modal__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
            <div>
              <h4 style="margin-bottom:12px;color:var(--color-text-secondary);font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:1px;">Dados do Contato</h4>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <div><strong>Email:</strong> ${lead.email || '—'}</div>
                <div><strong>Telefone:</strong> ${lead.phone || '—'}</div>
                <div><strong>Empresa:</strong> ${lead.company || '—'}</div>
                <div><strong>Valor:</strong> ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(lead.value || 0)}</div>
                <div><strong>Probabilidade:</strong> ${lead.probability}%</div>
                <div><strong>Origem:</strong> <span class="badge badge--info">${lead.source}</span></div>
                <div><strong>Estágio:</strong> <span class="badge" style="background:${lead.stage_color}20;color:${lead.stage_color}">${lead.stage_name}</span></div>
              </div>
              ${lead.notes ? `<div style="margin-top:16px;padding:12px;background:var(--color-bg-secondary);border-radius:8px;font-size:var(--fs-sm);"><strong>Observações:</strong><br/>${lead.notes}</div>` : ''}
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="color:var(--color-text-secondary);font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:1px;">Notas & Atividades</h4>
                <button class="btn btn--ghost btn--sm" id="btn-add-note">${icon('plus', 14)} Nota</button>
              </div>
              <div id="activities-list" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;">
                ${activities.length === 0 ? '<p style="color:var(--color-text-muted);font-size:var(--fs-sm);">Nenhuma atividade registrada.</p>' :
                  activities.map(a => `
                    <div style="padding:10px;background:var(--color-bg-secondary);border-radius:8px;font-size:var(--fs-sm);">
                      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <strong>${a.title}</strong>
                        <span style="font-size:10px;color:var(--color-text-muted);">${new Date(a.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      ${a.description ? `<div style="color:var(--color-text-secondary);">${a.description}</div>` : ''}
                      <div style="font-size:10px;color:var(--color-text-muted);margin-top:4px;">${a.user_name || 'Sistema'} · ${a.type}</div>
                    </div>
                  `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Add Note
    overlay.querySelector('#btn-add-note').addEventListener('click', () => {
      overlay.remove();
      showModal('Adicionar Nota', `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Título *</label>
          <input type="text" id="note-title" class="input" required placeholder="Resumo da nota" />
        </div>
        <div class="input-group">
          <label class="input-label">Descrição</label>
          <textarea id="note-desc" class="input" rows="4" placeholder="Detalhes..."></textarea>
        </div>
      `, async () => {
        await api.crm.addLeadNote(leadId, {
          title: document.getElementById('note-title').value,
          description: document.getElementById('note-desc').value || null,
        });
        showToast('Nota adicionada!', 'success');
        openLeadDetail(leadId, container, pipeline);
      });
    });

    // Edit Lead
    overlay.querySelector('#btn-edit-lead').addEventListener('click', () => {
      overlay.remove();
      showModal('Editar Lead', `
        <div class="input-group" style="margin-bottom:12px;">
          <label class="input-label">Nome *</label>
          <input type="text" id="edit-name" class="input" required value="${lead.name}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="input-group">
            <label class="input-label">E-mail</label>
            <input type="email" id="edit-email" class="input" value="${lead.email || ''}" />
          </div>
          <div class="input-group">
            <label class="input-label">Telefone</label>
            <input type="text" id="edit-phone" class="input" value="${lead.phone || ''}" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
          <div class="input-group">
            <label class="input-label">Empresa</label>
            <input type="text" id="edit-company" class="input" value="${lead.company || ''}" />
          </div>
          <div class="input-group">
            <label class="input-label">Valor (R$)</label>
            <input type="number" id="edit-value" class="input" step="0.01" value="${lead.value || 0}" />
          </div>
        </div>
        <div class="input-group" style="margin-top:12px;">
          <label class="input-label">Observações</label>
          <textarea id="edit-notes" class="input" rows="3">${lead.notes || ''}</textarea>
        </div>
      `, async () => {
        await api.crm.updateLead(leadId, {
          name: document.getElementById('edit-name').value,
          email: document.getElementById('edit-email').value || null,
          phone: document.getElementById('edit-phone').value || null,
          company: document.getElementById('edit-company').value || null,
          value: parseFloat(document.getElementById('edit-value').value) || 0,
          notes: document.getElementById('edit-notes').value || null,
        });
        showToast('Lead atualizado!', 'success');
        renderPipeline(container);
      });
    });

    // Delete Lead
    overlay.querySelector('#btn-delete-lead').addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja excluir este lead permanentemente?')) return;
      try {
        await api.crm.deleteLead(leadId);
        showToast('Lead excluído', 'success');
        overlay.remove();
        renderPipeline(container);
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });

  } catch (err) {
    showToast('Erro ao carregar lead: ' + err.message, 'error');
  }
}

// ─── Contacts ───────────────────────────────────────────────────
export async function renderContacts(container) {
  const ws = getState('activeWorkspace');

  if (!ws) {
    container.innerHTML = `
      <div class="page-header"><div><h1 class="page-header__title">Contatos</h1></div></div>
      <div class="card" style="margin-top:24px;text-align:center;padding:48px;">
        ${icon('contacts', 48)}
        <h3 style="margin:16px 0 8px;">Nenhum Workspace Selecionado</h3>
        <p style="color:var(--color-text-secondary);max-width:400px;margin:0 auto;">
          Para visualizar seus contatos, vá até a aba "Workspaces" no menu lateral.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = `<div style="padding:32px;text-align:center;"><span class="spinner"></span> Carregando...</div>`;

  try {
    const res = await api.crm.getLeads();
    const contacts = res.data || [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Contatos</h1>
          <p class="page-header__subtitle">${contacts.length} contatos no workspace ${ws.name}</p>
        </div>
        <div class="page-header__actions">
          <div class="topbar__search" style="width:200px;">
            ${icon('search', 16)}
            <input class="input" type="text" placeholder="Buscar contato..." id="search-contacts" />
          </div>
        </div>
      </div>
      ${contacts.length === 0 ? `
        <div class="card" style="margin-top:24px;text-align:center;padding:48px;">
          ${icon('contacts', 48)}
          <h3 style="margin:16px 0 8px;">Nenhum Contato</h3>
          <p style="color:var(--color-text-secondary);">Adicione leads no funil de vendas para popular seus contatos.</p>
        </div>
      ` : `
        <div class="contacts-grid stagger" id="contacts-list" style="margin-top:24px;">
          ${contacts.map(c => `
            <div class="card contact-card" data-lead-id="${c.id}" style="cursor:pointer;">
              <div class="avatar avatar--xl contact-card__avatar">${(c.name || '?')[0].toUpperCase()}</div>
              <div class="contact-card__name">${c.name}</div>
              <div class="contact-card__role">${c.company || c.email || c.phone || '—'}</div>
              <div style="margin-top:8px;">
                <span class="badge" style="background:${c.stage_color || '#708090'}20;color:${c.stage_color || '#708090'}">${c.stage_name || 'Sem estágio'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}`;

    // Search filter
    container.querySelector('#search-contacts')?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      container.querySelectorAll('.contact-card').forEach(card => {
        const name = card.querySelector('.contact-card__name').textContent.toLowerCase();
        const role = card.querySelector('.contact-card__role').textContent.toLowerCase();
        card.style.display = (name.includes(term) || role.includes(term)) ? '' : 'none';
      });
    });

    // Click on contact → detail
    container.querySelectorAll('.contact-card').forEach(card => {
      card.addEventListener('click', async () => {
        try {
          const pipelinesRes = await api.workspaces.getPipelines(ws.id);
          const pipeline = (pipelinesRes.data || [])[0];
          openLeadDetail(card.dataset.leadId, container, pipeline);
        } catch (err) {
          showToast('Erro: ' + err.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="padding:24px;color:var(--color-danger);">Erro: ${err.message}</div>`;
  }
}
