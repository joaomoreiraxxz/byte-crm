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
  } catch (err) {
    container.innerHTML = `<div style="padding: 24px; color:red;">Erro: ${err.message}</div>`;
  }
}
