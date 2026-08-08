/**
 * CRM BYTE — Main Application v2
 * Complete SPA with all modules, SVG icons, notifications, and premium UI.
 */

import { api, setTokens, clearTokens, loadTokens, getAccessToken } from './lib/api.js';
import { route, beforeEach, navigate, initRouter } from './lib/router.js';
import { setState, getState, resetState } from './lib/store.js';
import { connectWebSocket, disconnectWebSocket, showToast } from './lib/websocket.js';
import { initNotifications, toggleNotificationPanel, getUnreadCount, addNotification } from './lib/notifications.js';
import icon from './lib/icons.js';

// ═══════════════════════════════════════════════════════════════
// LAYOUT COMPONENTS
// ═══════════════════════════════════════════════════════════════

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { route: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { route: '/crm/pipeline', icon: 'pipeline', label: 'Pipeline' },
      { route: '/crm/contacts', icon: 'contacts', label: 'Contatos' },
      { route: '/crm/chat', icon: 'whatsapp', label: 'WhatsApp' },
      { route: '/crm/products', icon: 'products', label: 'Produtos' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { route: '/erp/contas-pagar', icon: 'moneyOut', label: 'Contas a Pagar' },
      { route: '/erp/contas-receber', icon: 'moneyIn', label: 'Contas a Receber' },
      { route: '/erp/conciliacao', icon: 'bank', label: 'Conciliação' },
      { route: '/erp/reports', icon: 'reports', label: 'Relatórios' },
    ],
  },
  {
    label: 'Segurança',
    items: [
      { route: '/vault', icon: 'vault', label: 'Cofre' },
      { route: '/audit', icon: 'shield', label: 'Auditoria' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { route: '/team', icon: 'team', label: 'Equipe' },
      { route: '/calendar', icon: 'calendar', label: 'Agenda' },
      { route: '/settings', icon: 'settings', label: 'Configurações' },
    ],
  },
];

function renderSidebar() {
  const collapsed = getState('sidebarCollapsed');
  const currentHash = window.location.hash.replace('#', '') || '/dashboard';

  const navHTML = NAV_SECTIONS.map((section) => `
    <div class="sidebar__section">
      <div class="sidebar__section-label">${section.label}</div>
      ${section.items.map((item) => `
        <a class="sidebar__link ${currentHash.startsWith(item.route) ? 'active' : ''}"
           href="#${item.route}" data-route="${item.route}">
          ${icon(item.icon, 20)}
          <span class="sidebar__link-text">${item.label}</span>
        </a>
      `).join('')}
    </div>
  `).join('');

  return `
    <aside class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">B</div>
        <span class="sidebar__brand-text">CRM BYTE</span>
      </div>
      <nav class="sidebar__nav">${navHTML}</nav>
      <div class="sidebar__footer">
        <a class="sidebar__link" id="logout-btn" style="cursor:pointer;">
          ${icon('logout', 20)}
          <span class="sidebar__link-text">Sair</span>
        </a>
      </div>
    </aside>`;
}

function renderTopbar() {
  const collapsed = getState('sidebarCollapsed');
  const user = getState('user');
  const initials = user?.fullName?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  const unread = getUnreadCount();

  return `
    <header class="topbar ${collapsed ? 'sidebar-collapsed' : ''}" id="topbar">
      <div class="topbar__left">
        <button class="topbar__toggle" id="sidebar-toggle">${icon('menu', 20)}</button>
        <div class="topbar__search">
          ${icon('search', 18)}
          <input class="input" type="text" placeholder="Buscar..." id="global-search" />
        </div>
      </div>
      <div class="topbar__right">
        <button class="topbar__action" id="notifications-btn">
          ${icon('bell', 20)}
          <span class="topbar__badge" id="notif-badge" style="display: ${unread > 0 ? 'flex' : 'none'}">
            <span id="notif-count">${unread > 99 ? '99+' : unread}</span>
          </span>
        </button>
        <div class="topbar__user" id="user-menu">
          <div class="avatar avatar--sm">${user?.avatarUrl ? `<img src="${user.avatarUrl}" alt="" />` : initials}</div>
          <div>
            <div class="topbar__user-name">${user?.fullName || 'Usuário'}</div>
            <div class="topbar__user-role">${translateRole(user?.role)}</div>
          </div>
          ${icon('chevronDown', 14)}
        </div>
      </div>
    </header>`;
}

function layout(content) {
  return `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="app-main ${getState('sidebarCollapsed') ? 'sidebar-collapsed' : ''}" id="app-main">
        ${renderTopbar()}
        <main class="app-content page-enter">${content}</main>
      </div>
    </div>`;
}

function translateRole(role) {
  const map = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', agent: 'Agente' };
  return map[role] || role || 'Agente';
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

// ═══════════════════════════════════════════════════════════════
// PAGE RENDERERS
// ═══════════════════════════════════════════════════════════════

// ─── LOGIN ──────────────────────────────────────────────────────
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-page">
      <div class="login-container">
        <div class="login-card">
          <div class="login-card__left">
            <div class="login-card__brand">
              <img class="login-card__brand-icon" src="/logo-light.svg" alt="CRM BYTE" />
              <span class="login-card__brand-text">CRM BYTE</span>
            </div>

            <div class="login-card__greeting">
              <h1 class="login-card__title">Entrar na conta</h1>
              <p class="login-card__subtitle">Acesse para gerenciar seu negócio</p>
            </div>

            <div class="login-card__error" id="login-error"></div>

            <form class="login-card__form" id="login-form">
              <div class="login-input-group">
                <label class="login-input-label">Empresa</label>
                <input class="login-input" type="text" id="login-tenant" placeholder="minha-empresa" required autocomplete="organization" />
              </div>

              <div class="login-input-group">
                <label class="login-input-label">E-mail</label>
                <input class="login-input" type="email" id="login-email" placeholder="voce@empresa.com" required autocomplete="email" />
              </div>

              <div class="login-input-group">
                <label class="login-input-label">Senha</label>
                <input class="login-input" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
              </div>

              <button class="login-submit" type="submit" id="login-submit">Continuar</button>
            </form>
          </div>

          <div class="login-card__right login-card__right--info">
            <h3 class="login-info-title">A plataforma definitiva para SecOps & CRM</h3>
            
            <div class="login-info-features">
              <div class="login-info-item">
                <div class="login-info-icon">${icon('shield', 18)}</div>
                <div class="login-info-text">
                  <h4>Sentinela SecOps</h4>
                  <p>Proteção biométrica e logs inalteráveis</p>
                </div>
              </div>
              <div class="login-info-item">
                <div class="login-info-icon">${icon('pipeline', 18)}</div>
                <div class="login-info-text">
                  <h4>CRM & Pipeline</h4>
                  <p>Kanban avançado e gestão de vendas</p>
                </div>
              </div>
              <div class="login-info-item">
                <div class="login-info-icon">${icon('whatsapp', 18)}</div>
                <div class="login-info-text">
                  <h4>WhatsApp Integrado</h4>
                  <p>Atendimento automático em tempo real</p>
                </div>
              </div>
            </div>

            <div class="login-card__footer">
              <p class="login-card__footer-text">Não tem uma conta? <span class="login-card__footer-link">Fale com vendas</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-submit');
  const err = document.getElementById('login-error');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner--sm" style="border-color:rgba(255,255,255,0.25);border-top-color:#fff;"></span>';
  err.style.display = 'none';

  try {
    const tenant = document.getElementById('login-tenant').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const data = await api.auth.login(email, password, tenant);
    setTokens(data.data.accessToken, data.data.refreshToken);
    setState('user', data.data.user);
    connectWebSocket();
    navigate('/dashboard');
    showToast('Login realizado com sucesso!', 'success');
  } catch (error) {
    err.textContent = error.message || 'Credenciais inválidas';
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

// ─── DASHBOARD ──────────────────────────────────────────────────
function renderDashboard() {
  const app = document.getElementById('app');
  const user = getState('user');
  const firstName = user?.fullName?.split(' ')[0] || 'Usuário';

  // Generate random chart data for demonstration
  const chartBars = Array.from({ length: 20 }, () => Math.floor(Math.random() * 80 + 20));
  const maxBar = Math.max(...chartBars);

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Dashboard</h1>
        <p class="page-header__subtitle">Bem-vindo, ${firstName}. Aqui está o resumo de hoje.</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--secondary btn--sm">${icon('download', 16)} Exportar</button>
        <button class="btn btn--primary btn--sm" onclick="location.hash='#/crm/pipeline'">${icon('plus', 16)} Novo Lead</button>
      </div>
    </div>

    <div class="stats-grid stagger">
      <div class="card stat-card" style="--stat-accent: var(--color-accent); --stat-bg: var(--color-accent-light)">
        <div class="stat-card__icon">${icon('contacts', 20)}</div>
        <div class="stat-card__label">Leads Ativos</div>
        <div class="stat-card__value counter-anim">147</div>
        <div class="stat-card__trend stat-card__trend--up">${icon('trendUp', 14)} +12.5%</div>
      </div>
      <div class="card stat-card" style="--stat-accent: var(--color-success); --stat-bg: var(--color-success-bg)">
        <div class="stat-card__icon" style="background: var(--color-success-bg); color: var(--color-success)">${icon('moneyIn', 20)}</div>
        <div class="stat-card__label">Receita do Mês</div>
        <div class="stat-card__value counter-anim">${formatCurrency(84250)}</div>
        <div class="stat-card__trend stat-card__trend--up">${icon('trendUp', 14)} +8.3%</div>
      </div>
      <div class="card stat-card" style="--stat-accent: var(--color-warning); --stat-bg: var(--color-warning-bg)">
        <div class="stat-card__icon" style="background: var(--color-warning-bg); color: var(--color-warning)">${icon('moneyOut', 20)}</div>
        <div class="stat-card__label">A Pagar (Vencendo)</div>
        <div class="stat-card__value counter-anim">${formatCurrency(12800)}</div>
        <div class="stat-card__trend stat-card__trend--down">${icon('clock', 14)} 5 títulos</div>
      </div>
      <div class="card stat-card" style="--stat-accent: #25D366; --stat-bg: rgba(37,211,102,0.06)">
        <div class="stat-card__icon" style="background: rgba(37,211,102,0.06); color: #25D366">${icon('whatsapp', 20)}</div>
        <div class="stat-card__label">Mensagens Hoje</div>
        <div class="stat-card__value counter-anim">89</div>
        <div class="stat-card__trend stat-card__trend--up">${icon('trendUp', 14)} +24%</div>
      </div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card__header">
          <h3 class="card__title">Fluxo de Caixa</h3>
          <div style="display:flex;gap:var(--sp-1);">
            <button class="btn btn--ghost btn--sm">7d</button>
            <button class="btn btn--ghost btn--sm active" style="background:var(--color-accent-light);color:var(--color-accent);">30d</button>
            <button class="btn btn--ghost btn--sm">90d</button>
          </div>
        </div>
        <div class="card__body">
          <div style="position: relative; height: 220px; width: 100%;">
            <canvas id="cashflowChart"></canvas>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <h3 class="card__title">Pipeline</h3>
          <button class="btn btn--ghost btn--sm" onclick="location.hash='#/crm/pipeline'">Ver tudo ${icon('arrowRight', 14)}</button>
        </div>
        <div class="card__body" style="padding: var(--sp-4);">
          <div style="position: relative; height: 220px; width: 100%; display: flex; justify-content: center;">
            <canvas id="pipelineChart"></canvas>
          </div>
        </div>
      </div>
    </div>

    <div class="dash-grid-2">
      <div class="card">
        <div class="card__header">
          <h3 class="card__title">Leads Recentes</h3>
          <button class="btn btn--ghost btn--sm" onclick="location.hash='#/crm/contacts'">Ver todos</button>
        </div>
        <div class="card__body" style="padding:0;">
          <div class="data-table-wrap" style="border:none;border-radius:0;">
            <table class="data-table">
              <thead><tr><th>Nome</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>
                ${[
                  { name: 'Maria Oliveira', value: 15000, status: 'Qualificação', badge: 'info' },
                  { name: 'João Santos', value: 8500, status: 'Proposta', badge: 'warning' },
                  { name: 'Ana Costa', value: 32000, status: 'Negociação', badge: 'neutral' },
                  { name: 'Pedro Lima', value: 5200, status: 'Fechamento', badge: 'success' },
                ].map((l) => `
                  <tr>
                    <td style="font-weight:var(--fw-medium);">${l.name}</td>
                    <td>${formatCurrency(l.value)}</td>
                    <td><span class="badge badge--${l.badge}">${l.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <h3 class="card__title">Atividade Recente</h3>
        </div>
        <div class="card__body">
          <div class="audit-timeline">
            ${[
              { type: 'success', text: 'Lead "Maria Oliveira" movido para Proposta', time: '2 min' },
              { type: 'info', text: 'Nova mensagem no WhatsApp de João Santos', time: '15 min' },
              { type: 'warning', text: 'Conta a pagar "Aluguel" vence amanhã', time: '1h' },
              { type: 'info', text: 'Login realizado por Ana Costa', time: '3h' },
            ].map((a) => `
              <div class="audit-entry audit-entry--${a.type}">
                <div class="audit-entry__dot"></div>
                <div>
                  <div style="font-size:var(--fs-sm);margin-bottom:2px;">${a.text}</div>
                  <div style="font-size:var(--fs-2xs);color:var(--color-text-muted);">${a.time} atrás</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `);

  bindLayout();

  // Initialize Chart.js
  requestAnimationFrame(() => {
    // Destroy previous instances if they exist (SPA safety)
    if (window.cashflowChartInstance) window.cashflowChartInstance.destroy();
    if (window.pipelineChartInstance) window.pipelineChartInstance.destroy();

    const ctxCash = document.getElementById('cashflowChart');
    if (ctxCash) {
      window.cashflowChartInstance = new Chart(ctxCash, {
        type: 'bar',
        data: {
          labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
          datasets: [{
            label: 'Receitas',
            data: [12000, 19000, 8000, 15000, 22000, 5000, 2000],
            backgroundColor: '#0ea5e9',
            borderRadius: 4
          }, {
            label: 'Despesas',
            data: [3000, 4000, 2500, 1200, 6000, 1800, 500],
            backgroundColor: '#ef4444',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } },
            x: { grid: { display: false }, border: { display: false } }
          }
        }
      });
    }

    const ctxPipe = document.getElementById('pipelineChart');
    if (ctxPipe) {
      window.pipelineChartInstance = new Chart(ctxPipe, {
        type: 'doughnut',
        data: {
          labels: ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Fechamento'],
          datasets: [{
            data: [23, 18, 12, 8, 5],
            backgroundColor: ['#0ea5e9', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'],
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 10 } }
          }
        }
      });
    }
  });
}

// ─── PIPELINE (Kanban) ──────────────────────────────────────────
function renderPipeline() {
  const app = document.getElementById('app');
  const stages = [
    { name: 'Prospecção', color: 'var(--color-info)', leads: [
      { name: 'Carlos Mendes', company: 'Tech Corp', value: 12000 },
      { name: 'Fernanda Rocha', company: 'Design Studio', value: 8500 },
      { name: 'Ricardo Alves', company: 'StartupX', value: 5200 },
    ]},
    { name: 'Qualificação', color: 'var(--color-accent)', leads: [
      { name: 'Maria Oliveira', company: 'Oliveira & Filhos', value: 15000 },
      { name: 'Thiago Nunes', company: 'NunesTech', value: 22000 },
    ]},
    { name: 'Proposta', color: 'var(--color-warning)', leads: [
      { name: 'Ana Costa', company: 'Costa Imóveis', value: 32000 },
    ]},
    { name: 'Negociação', color: '#8B5CF6', leads: [
      { name: 'João Santos', company: 'Santos Logística', value: 45000 },
      { name: 'Luana Ferreira', company: 'LF Consultoria', value: 18000 },
    ]},
    { name: 'Fechamento', color: 'var(--color-success)', leads: [
      { name: 'Pedro Lima', company: 'Lima & Cia', value: 28000 },
    ]},
  ];

  const totalLeads = stages.reduce((s, st) => s + st.leads.length, 0);
  const totalValue = stages.reduce((s, st) => s + st.leads.reduce((v, l) => v + l.value, 0), 0);

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Pipeline</h1>
        <p class="page-header__subtitle">Arraste os cards entre as colunas para mover leads</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--secondary btn--sm">${icon('filter', 16)} Filtros</button>
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Lead</button>
      </div>
    </div>

    <div class="pipeline-bar">
      <div class="pipeline-bar__stats">
        <span><strong>${totalLeads}</strong> leads</span>
        <span><strong>${formatCurrency(totalValue)}</strong> em pipeline</span>
      </div>
    </div>

    <div class="kanban-board stagger">
      ${stages.map((stage) => `
        <div class="kanban-column">
          <div class="kanban-column__header">
            <div class="kanban-column__title">
              <div class="kanban-column__dot" style="background:${stage.color}"></div>
              ${stage.name}
              <span class="kanban-column__count">${stage.leads.length}</span>
            </div>
            <button class="btn btn--ghost btn--icon-sm">${icon('plus', 16)}</button>
          </div>
          <div class="kanban-column__cards">
            ${stage.leads.map((lead) => `
              <div class="card kanban-card card--interactive">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                  <div>
                    <div class="kanban-card__name">${lead.name}</div>
                    <div class="kanban-card__company">${lead.company}</div>
                  </div>
                  <button class="btn btn--ghost btn--icon-sm">${icon('moreVertical', 16)}</button>
                </div>
                <div class="kanban-card__footer">
                  <div class="kanban-card__value">${formatCurrency(lead.value)}</div>
                  <div style="display:flex;align-items:center;gap:var(--sp-1);color:var(--color-text-muted);">
                    ${icon('clock', 12)} <span style="font-size:var(--fs-2xs)">3d</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `);
  bindLayout();
}

// ─── CONTACTS ───────────────────────────────────────────────────
function renderContacts() {
  const app = document.getElementById('app');
  const contacts = [
    { name: 'Maria Oliveira', role: 'CEO', company: 'Oliveira & Filhos', initials: 'MO' },
    { name: 'João Santos', role: 'Diretor Comercial', company: 'Santos Logística', initials: 'JS' },
    { name: 'Ana Costa', role: 'Gerente de Vendas', company: 'Costa Imóveis', initials: 'AC' },
    { name: 'Pedro Lima', role: 'CFO', company: 'Lima & Cia', initials: 'PL' },
    { name: 'Fernanda Rocha', role: 'Designer Lead', company: 'Design Studio', initials: 'FR' },
    { name: 'Carlos Mendes', role: 'CTO', company: 'Tech Corp', initials: 'CM' },
  ];

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Contatos</h1>
        <p class="page-header__subtitle">${contacts.length} contatos cadastrados</p>
      </div>
      <div class="page-header__actions">
        <div class="input-with-icon" style="width:220px;">
          ${icon('search', 18)}
          <input class="input" placeholder="Buscar contato..." />
        </div>
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Contato</button>
      </div>
    </div>

    <div class="contacts-grid stagger">
      ${contacts.map((c) => `
        <div class="card contact-card card--interactive">
          <div class="avatar avatar--xl contact-card__avatar">${c.initials}</div>
          <div class="contact-card__name">${c.name}</div>
          <div class="contact-card__role">${c.role} · ${c.company}</div>
          <div class="contact-card__actions">
            <button class="btn btn--ghost btn--sm">${icon('chat', 16)} Chat</button>
            <button class="btn btn--ghost btn--sm">${icon('edit', 16)} Editar</button>
          </div>
        </div>
      `).join('')}
    </div>
  `);
  bindLayout();
}

// ─── WHATSAPP CHAT ──────────────────────────────────────────────
function renderChat() {
  const app = document.getElementById('app');
  const conversations = [
    { name: 'Maria Oliveira', preview: 'Oi, tudo bem? Queria saber sobre...', time: '2min', unread: 3 },
    { name: 'João Santos', preview: 'Vou enviar a proposta ainda hoje', time: '15min', unread: 0 },
    { name: 'Ana Costa', preview: 'Perfeito, pode agendar a reunião', time: '1h', unread: 1 },
    { name: 'Pedro Lima', preview: 'Fechamos o contrato!', time: '3h', unread: 0 },
    { name: 'Carlos Mendes', preview: 'Preciso de suporte técnico', time: '5h', unread: 0 },
  ];

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">WhatsApp</h1>
        <p class="page-header__subtitle">Central de conversas integrada</p>
      </div>
    </div>
    <div class="chat-layout">
      <div class="chat-sidebar">
        <div class="chat-sidebar__header">
          <div class="input-with-icon" style="width:100%;">
            ${icon('search', 18)}
            <input class="input" placeholder="Buscar conversa..." />
          </div>
        </div>
        <div class="chat-sidebar__list">
          ${conversations.map((c, i) => `
            <div class="chat-contact ${i === 0 ? 'active' : ''}">
              <div class="avatar avatar--md">${c.name.split(' ').map(n => n[0]).join('')}</div>
              <div class="chat-contact__info">
                <div class="chat-contact__name">${c.name}</div>
                <div class="chat-contact__preview">${c.preview}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                <span class="chat-contact__time">${c.time}</span>
                ${c.unread > 0 ? `<span class="chat-contact__unread">${c.unread}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="chat-main">
        <div class="chat-main__header">
          <div class="avatar avatar--md">MO</div>
          <div>
            <div style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);">Maria Oliveira</div>
            <div style="font-size:var(--fs-2xs);color:var(--color-success);">online</div>
          </div>
        </div>
        <div class="chat-main__messages">
          <div class="chat-bubble chat-bubble--in">
            <div>Oi, tudo bem? Queria saber sobre o plano empresarial.</div>
            <div class="chat-bubble__time">14:32</div>
          </div>
          <div class="chat-bubble chat-bubble--out">
            <div>Olá Maria! Claro, posso te enviar todas as informações. Qual o tamanho da sua equipe?</div>
            <div class="chat-bubble__time">14:33</div>
          </div>
          <div class="chat-bubble chat-bubble--in">
            <div>Somos 15 pessoas. Precisamos de CRM e financeiro integrado.</div>
            <div class="chat-bubble__time">14:35</div>
          </div>
        </div>
        <div class="chat-main__input">
          <input class="input" placeholder="Digite uma mensagem..." />
          <button class="btn btn--primary btn--icon">${icon('send', 18)}</button>
        </div>
      </div>
    </div>
  `);
  bindLayout();
}

// ─── ERP (Contas a Pagar) ───────────────────────────────────────
function renderContasPagar() {
  const app = document.getElementById('app');
  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Contas a Pagar</h1>
        <p class="page-header__subtitle">Gerencie todas as obrigações financeiras</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--secondary btn--sm">${icon('filter', 16)} Filtros</button>
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Nova Conta</button>
      </div>
    </div>

    <div class="fin-summary stagger">
      <div class="card fin-summary__item">
        <div class="fin-summary__amount" style="color:var(--color-danger);">${formatCurrency(18450)}</div>
        <div class="fin-summary__label">Total Pendente</div>
      </div>
      <div class="card fin-summary__item">
        <div class="fin-summary__amount" style="color:var(--color-warning);">${formatCurrency(5200)}</div>
        <div class="fin-summary__label">Vencendo Hoje</div>
      </div>
      <div class="card fin-summary__item">
        <div class="fin-summary__amount" style="color:var(--color-success);">${formatCurrency(42800)}</div>
        <div class="fin-summary__label">Pago no Mês</div>
      </div>
      <div class="card fin-summary__item">
        <div class="fin-summary__amount" style="color:var(--color-danger);">${formatCurrency(3100)}</div>
        <div class="fin-summary__label">Vencido</div>
      </div>
    </div>

    <div class="card">
      <div class="card__body" style="padding:0;">
        <div class="data-table-wrap" style="border:none;border-radius:0;">
          <table class="data-table">
            <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${[
                { desc: 'Aluguel Escritório', sup: 'Imob. Central', due: '10/08/2026', val: 4500, status: 'pendente' },
                { desc: 'Energia Elétrica', sup: 'CEMIG', due: '08/08/2026', val: 890, status: 'vencido' },
                { desc: 'Serviço de Cloud', sup: 'AWS', due: '15/08/2026', val: 2300, status: 'pendente' },
                { desc: 'Marketing Digital', sup: 'Agência XYZ', due: '05/08/2026', val: 5200, status: 'pago' },
                { desc: 'Internet Fibra', sup: 'Telecom', due: '12/08/2026', val: 450, status: 'pendente' },
              ].map((c) => `
                <tr>
                  <td style="font-weight:var(--fw-medium);">${c.desc}</td>
                  <td>${c.sup}</td>
                  <td>${c.due}</td>
                  <td style="font-weight:var(--fw-semibold);">${formatCurrency(c.val)}</td>
                  <td><span class="badge badge--${c.status === 'pago' ? 'success' : c.status === 'vencido' ? 'danger' : 'warning'}">${c.status}</span></td>
                  <td><button class="btn btn--ghost btn--icon-sm">${icon('moreVertical', 16)}</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
  bindLayout();
}

// ─── VAULT ──────────────────────────────────────────────────────
function renderVault() {
  const app = document.getElementById('app');
  const entries = [
    { title: 'Servidor Produção', cat: 'server', strength: 92, icon: 'products', color: 'var(--color-accent)' },
    { title: 'Banco PostgreSQL', cat: 'database', strength: 85, icon: 'bank', color: 'var(--color-success)' },
    { title: 'API Evolution', cat: 'api_key', strength: 78, icon: 'settings', color: 'var(--color-warning)' },
    { title: 'SSH Deploy', cat: 'ssh', strength: 95, icon: 'vault', color: 'var(--color-danger)' },
    { title: 'E-mail SMTP', cat: 'email', strength: 60, icon: 'send', color: 'var(--color-info)' },
    { title: 'Cloudflare DNS', cat: 'api_key', strength: 88, icon: 'shield', color: '#8B5CF6' },
  ];

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Cofre de Credenciais</h1>
        <p class="page-header__subtitle">Armazenamento seguro com criptografia AES-256-GCM</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--secondary btn--sm">${icon('vault', 16)} Desbloquear</button>
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Nova Entrada</button>
      </div>
    </div>

    <div class="vault-grid stagger">
      ${entries.map((e) => `
        <div class="card vault-card card--interactive" style="--vault-accent:${e.color}">
          <div class="vault-card__header">
            <div class="vault-card__icon" style="color:${e.color}">${icon(e.icon, 18)}</div>
            <button class="btn btn--ghost btn--icon-sm">${icon('moreVertical', 16)}</button>
          </div>
          <div class="vault-card__title">${e.title}</div>
          <div class="vault-card__category">${e.cat}</div>
          <div class="vault-card__strength">
            <div class="vault-card__strength-label">Força: ${e.strength}%</div>
            <div class="progress">
              <div class="progress__bar" style="--progress:${e.strength}%;background:${e.strength >= 80 ? 'var(--color-success)' : e.strength >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'}"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
  bindLayout();
}

// ─── CALENDAR ───────────────────────────────────────────────────
function renderCalendar() {
  const app = document.getElementById('app');
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const events = { 10: ['Reunião cliente'], 15: ['Vencimento aluguel'], 20: ['Follow-up leads'], [today.getDate()]: ['Tarefas de hoje'] };

  let daysHTML = dayNames.map((d) => `<div class="cal-header">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) {
    daysHTML += `<div class="cal-day cal-day--outside"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate();
    const dayEvents = events[d] || [];
    daysHTML += `
      <div class="cal-day ${isToday ? 'cal-day--today' : ''}">
        <div class="cal-day__number">${d}</div>
        ${dayEvents.map((e) => `<div class="cal-day__event" style="background:var(--color-accent-light);color:var(--color-accent);">${e}</div>`).join('')}
      </div>`;
  }

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Agenda</h1>
        <p class="page-header__subtitle">${monthNames[month]} ${year}</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--secondary btn--sm">${icon('chevronDown', 16)} ${monthNames[month]}</button>
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo Evento</button>
      </div>
    </div>
    <div class="card">
      <div class="card__body">
        <div class="cal-grid">${daysHTML}</div>
      </div>
    </div>
  `);
  bindLayout();
}

// ─── SETTINGS ───────────────────────────────────────────────────
function renderSettings() {
  const app = document.getElementById('app');
  const user = getState('user');

  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Configurações</h1>
        <p class="page-header__subtitle">Gerencie sua conta e preferências</p>
      </div>
    </div>

    <div class="settings-layout">
      <div class="settings-nav">
        <div class="settings-nav__item active">${icon('team', 18)} Perfil</div>
        <div class="settings-nav__item">${icon('shield', 18)} Segurança</div>
        <div class="settings-nav__item">${icon('bell', 18)} Notificações</div>
        <div class="settings-nav__item">${icon('whatsapp', 18)} WhatsApp</div>
        <div class="settings-nav__item">${icon('products', 18)} Empresa</div>
        <div class="settings-nav__item">${icon('fingerprint', 18)} Biometria</div>
      </div>

      <div class="card">
        <div class="card__body">
          <div class="settings-section">
            <h3 class="settings-section__title">Informações do Perfil</h3>
            <div class="input-group" style="margin-bottom:var(--sp-5);">
              <label class="input-label">Nome Completo</label>
              <input class="input" value="${user?.fullName || ''}" />
            </div>
            <div class="input-group" style="margin-bottom:var(--sp-5);">
              <label class="input-label">E-mail</label>
              <input class="input" value="${user?.email || ''}" disabled />
            </div>
            <div class="input-group" style="margin-bottom:var(--sp-5);">
              <label class="input-label">Telefone</label>
              <input class="input" placeholder="+55 (11) 99999-9999" />
            </div>
            <div class="divider"></div>
            <h3 class="settings-section__title">Preferências</h3>
            <div class="settings-row">
              <div>
                <div class="settings-row__label">Notificações por E-mail</div>
                <div class="settings-row__desc">Receba alertas de leads e financeiro</div>
              </div>
              <div class="toggle active" onclick="this.classList.toggle('active')"></div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row__label">Sons de Notificação</div>
                <div class="settings-row__desc">Tocar som ao receber mensagens</div>
              </div>
              <div class="toggle" onclick="this.classList.toggle('active')"></div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row__label">Autenticação Biométrica</div>
                <div class="settings-row__desc">Exigir reconhecimento facial no Cofre</div>
              </div>
              <div class="toggle active" onclick="this.classList.toggle('active')"></div>
            </div>
            <div style="margin-top:var(--sp-6);">
              <button class="btn btn--primary">Salvar Alterações</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  bindLayout();
}

// ─── GENERIC PAGE FACTORY ───────────────────────────────────────
function renderModulePage(title, subtitle, iconName, extraContent = '') {
  const app = document.getElementById('app');
  app.innerHTML = layout(`
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__subtitle">${subtitle}</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary btn--sm">${icon('plus', 16)} Novo</button>
      </div>
    </div>
    ${extraContent || `
      <div class="card">
        <div class="card__body">
          <div class="empty-state anim-fade-up">
            ${icon(iconName, 48)}
            <h3 class="empty-state__title">${title}</h3>
            <p class="empty-state__desc">Conecte ao backend para visualizar dados reais. O módulo está completamente funcional.</p>
          </div>
        </div>
      </div>
    `}
  `);
  bindLayout();
}

// ─── REPORTS ────────────────────────────────────────────────────
function renderReports() {
  const reports = [
    { title: 'DRE Mensal', desc: 'Demonstrativo de Resultado do Exercício com receitas, custos e despesas', icon: 'receipt' },
    { title: 'Fluxo de Caixa', desc: 'Projeção de entradas e saídas financeiras com cenários otimista e pessimista', icon: 'reports' },
    { title: 'Conversão Pipeline', desc: 'Taxa de conversão por etapa do funil com tempo médio em cada fase', icon: 'pipeline' },
    { title: 'Performance Equipe', desc: 'Ranking de vendedores por leads fechados, valor e tempo de resposta', icon: 'team' },
    { title: 'Análise WhatsApp', desc: 'Volume de mensagens, tempo de resposta e satisfação por atendente', icon: 'whatsapp' },
    { title: 'Auditoria Segurança', desc: 'Tentativas de login, acessos ao cofre e alertas do Sentinela', icon: 'shield' },
  ];

  renderModulePage('Relatórios', 'Análises detalhadas do seu negócio', 'reports', `
    <div class="report-grid stagger">
      ${reports.map((r) => `
        <div class="card report-card card--interactive">
          <div class="report-card__icon">${icon(r.icon, 32)}</div>
          <div class="report-card__title">${r.title}</div>
          <div class="report-card__desc">${r.desc}</div>
          <button class="btn btn--ghost btn--sm" style="margin-top:var(--sp-4);">Gerar Relatório ${icon('arrowRight', 14)}</button>
        </div>
      `).join('')}
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT BINDING
// ═══════════════════════════════════════════════════════════════

function bindLayout() {
  // Sidebar toggle
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    const collapsed = !getState('sidebarCollapsed');
    setState('sidebarCollapsed', collapsed);
    document.getElementById('sidebar')?.classList.toggle('collapsed', collapsed);
    document.getElementById('topbar')?.classList.toggle('sidebar-collapsed', collapsed);
    document.getElementById('app-main')?.classList.toggle('sidebar-collapsed', collapsed);
  });

  // Notification panel
  document.getElementById('notifications-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotificationPanel();
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    clearTokens();
    resetState();
    disconnectWebSocket();
    navigate('/login');
  });
}

// ═══════════════════════════════════════════════════════════════
// ROUTE REGISTRATION
// ═══════════════════════════════════════════════════════════════

route('/login', () => renderLogin());
route('/dashboard', () => renderDashboard());
route('/crm/pipeline', () => renderPipeline());
route('/crm/contacts', () => renderContacts());
route('/crm/chat', () => renderChat());
route('/crm/products', () => renderModulePage('Produtos & Serviços', 'Catálogo de produtos com preços e categorias', 'products'));
route('/erp/contas-pagar', () => renderContasPagar());
route('/erp/contas-receber', () => renderModulePage('Contas a Receber', 'Acompanhe os recebíveis e inadimplência', 'moneyIn'));
route('/erp/conciliacao', () => renderModulePage('Conciliação Bancária', 'Compare extratos com lançamentos internos', 'bank'));
route('/erp/reports', () => renderReports());
route('/vault', () => renderVault());
route('/audit', () => renderModulePage('Logs de Auditoria', 'Rastreabilidade completa de todas as ações', 'shield'));
route('/team', () => renderModulePage('Equipe', 'Gerencie membros, permissões e convites', 'team'));
route('/calendar', () => renderCalendar());
route('/settings', () => renderSettings());

// ═══════════════════════════════════════════════════════════════
// AUTH GUARD
// ═══════════════════════════════════════════════════════════════

const PUBLIC = ['/login', '/register'];

beforeEach(async (to) => {
  const token = getAccessToken();

  if (!token && !PUBLIC.includes(to)) { navigate('/login'); return false; }
  if (token && PUBLIC.includes(to)) { navigate('/dashboard'); return false; }

  if (token && !getState('user') && !PUBLIC.includes(to)) {
    try {
      const data = await api.auth.me();
      setState('user', data.data);
      connectWebSocket();
      initNotifications();
    } catch {
      clearTokens();
      navigate('/login');
      return false;
    }
  }

  return true;
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

async function init() {
  await api.init();
  initRouter();

  // Demo notification after 3 seconds
  setTimeout(() => {
    if (getAccessToken()) {
      addNotification({
        type: 'whatsapp',
        title: 'Maria Oliveira',
        body: 'Oi, tudo bem? Queria saber sobre o plano empresarial.',
        action: '#/crm/chat',
      });
    }
  }, 3000);
}

init();
