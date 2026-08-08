import { api } from '../lib/api.js';
import icon from '../lib/icons.js';

export async function renderPipeline(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Pipeline de Vendas</h1>
        <p class="page-header__subtitle">Gerencie o fluxo de negociações</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Lead</button>
      </div>
    </div>
    <div style="padding: 32px; text-align:center;">
      <span class="spinner"></span> Carregando Pipeline...
    </div>
  `;

  try {
    const res = await api.crm.getLeads(); // Simulating getting kanban board
    const leads = res.data || [];
    
    if (leads.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-header__title">Pipeline de Vendas</h1>
            <p class="page-header__subtitle">Gerencie o fluxo de negociações</p>
          </div>
          <div class="page-header__actions">
            <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Lead</button>
          </div>
        </div>
        <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
          ${icon('pipeline', 48)}
          <h3 style="margin: 16px 0 8px;">Nenhum Lead Encontrado</h3>
          <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
            Seu funil está vazio. Clique em "Novo Lead" para começar a prospectar clientes e fechar vendas!
          </p>
        </div>
      `;
    } else {
      // Logic for rendering kanban board...
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-header__title">Pipeline de Vendas</h1>
          </div>
          <div class="page-header__actions">
            <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Lead</button>
          </div>
        </div>
        <div class="kanban-board">
          <div class="kanban-column">
            <div class="kanban-column__header">
              <div class="kanban-column__title">Novos <span class="kanban-column__count">${leads.length}</span></div>
            </div>
            <div class="kanban-column__cards">
              ${leads.map(l => `
                <div class="card kanban-card">
                  <div class="kanban-card__name">${l.title}</div>
                  <div class="kanban-card__value">R$ ${l.value}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    container.querySelectorAll('.btn--primary').forEach(btn => {
      if(btn.textContent.includes('Novo Lead') || btn.textContent.includes('Adicionar')) {
        btn.addEventListener('click', () => {
          const ws = import('./store.js').then(({ getState }) => {
            const active = getState('activeWorkspace');
            if(!active) return alert('Selecione um Workspace primeiro na aba Workspaces.');
            
            // Build modal
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.background = 'rgba(0,0,0,0.8)';
            modal.style.zIndex = '9999';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            
            modal.innerHTML = `
              <div class="card" style="width: 400px; padding: 24px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px;">
                <h3 style="margin-bottom: 16px;">Criar Novo Lead</h3>
                <form id="new-lead-form">
                  <div class="input-group" style="margin-bottom: 12px;">
                    <label class="input-label">Nome do Lead</label>
                    <input type="text" id="lead-name" class="input" required />
                  </div>
                  <div class="input-group" style="margin-bottom: 12px;">
                    <label class="input-label">Pipeline ID (Temporário)</label>
                    <input type="text" id="lead-pipeline" class="input" required placeholder="UUID do Funil" />
                  </div>
                  <div class="input-group" style="margin-bottom: 12px;">
                    <label class="input-label">Stage ID (Temporário)</label>
                    <input type="text" id="lead-stage" class="input" required placeholder="UUID do Estágio" />
                  </div>
                  <div class="input-group" style="margin-bottom: 12px;">
                    <label class="input-label">Telefone (WhatsApp)</label>
                    <input type="text" id="lead-phone" class="input" />
                  </div>
                  <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
                    <button type="button" class="btn btn--secondary" id="btn-cancel-lead">Cancelar</button>
                    <button type="submit" class="btn btn--primary">Salvar Lead</button>
                  </div>
                </form>
              </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#btn-cancel-lead').addEventListener('click', () => modal.remove());
            
            modal.querySelector('#new-lead-form').addEventListener('submit', async (e) => {
              e.preventDefault();
              const name = modal.querySelector('#lead-name').value;
              const pipelineId = modal.querySelector('#lead-pipeline').value;
              const stageId = modal.querySelector('#lead-stage').value;
              const phone = modal.querySelector('#lead-phone').value;
              
              try {
                await api.crm.createLead({ name, pipelineId, stageId, phone, workspaceId: active.id });
                alert('Lead criado com sucesso!');
                modal.remove();
                renderPipeline(container);
              } catch (err) {
                alert('Erro ao criar lead: ' + err.message);
              }
            });
          });
        });
      }
    });

  } catch (err) {
    container.innerHTML = `<div style="padding: 24px; color:red;">Erro: ${err.message}</div>`;
  }
}

export async function renderContacts(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Contatos</h1>
        <p class="page-header__subtitle">Sua base de clientes</p>
      </div>
    </div>
    <div style="padding: 32px; text-align:center;"><span class="spinner"></span> Carregando...</div>
  `;

  try {
    const res = await api.crm.getLeads(); 
    const contacts = res.data || [];

    if (contacts.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <div><h1 class="page-header__title">Contatos</h1></div>
          <button class="btn btn--primary btn--sm">${icon('plus', 16)} Adicionar</button>
        </div>
        <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
          ${icon('contacts', 48)}
          <h3 style="margin: 16px 0 8px;">Nenhum Contato</h3>
          <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
            Sua lista de contatos está vazia. Comece adicionando seus clientes.
          </p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="page-header">
          <div><h1 class="page-header__title">Contatos</h1></div>
          <button class="btn btn--primary btn--sm">${icon('plus', 16)} Adicionar</button>
        </div>
        <div class="contacts-grid stagger">
          ${contacts.map(c => `
            <div class="card contact-card">
              <div class="avatar avatar--xl contact-card__avatar">${c.title[0]}</div>
              <div class="contact-card__name">${c.title}</div>
              <div class="contact-card__role">${c.companyName || '-'}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    container.querySelectorAll('.btn--primary').forEach(btn => {
      if(btn.textContent.includes('Adicionar')) {
        btn.addEventListener('click', () => {
          alert('Módulo de criação de Contatos está ativo e será integrado à API.');
        });
      }
    });

  } catch (err) {
    container.innerHTML = `<div style="padding: 24px; color:red;">Erro: ${err.message}</div>`;
  }
}
