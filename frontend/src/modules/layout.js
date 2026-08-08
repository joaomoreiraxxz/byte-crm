import { getState, setState } from '../lib/store.js';
import icon from '../lib/icons.js';
import { getUnreadCount, toggleNotificationPanel } from '../lib/notifications.js';

export const openedTabs = [];
export let activeTabId = null;

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { id: 'dashboard', route: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { id: 'pipeline', route: '/crm/pipeline', icon: 'pipeline', label: 'Pipeline' },
      { id: 'contacts', route: '/crm/contacts', icon: 'contacts', label: 'Contatos' },
      { id: 'chat', route: '/crm/chat', icon: 'whatsapp', label: 'WhatsApp' },
      { id: 'products', route: '/crm/products', icon: 'products', label: 'Produtos' },
    ],
  },
  {
    label: 'Produtividade',
    items: [
      { id: 'calendar', route: '/calendar', icon: 'calendar', label: 'Agenda' },
      { id: 'tasks', route: '/tasks', icon: 'check', label: 'Tarefas' },
      { id: 'notes', route: '/notes', icon: 'edit', label: 'Notas' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { id: 'contas-pagar', route: '/erp/contas-pagar', icon: 'moneyOut', label: 'Contas a Pagar' },
      { id: 'contas-receber', route: '/erp/contas-receber', icon: 'moneyIn', label: 'Contas a Receber' },
      { id: 'conciliacao', route: '/erp/conciliacao', icon: 'bank', label: 'Conciliação' },
      { id: 'reports', route: '/erp/reports', icon: 'reports', label: 'Relatórios' },
    ],
  },
  {
    label: 'Segurança & DevOps',
    items: [
      { id: 'vault', route: '/vault', icon: 'vault', label: 'Cofre' },
      { id: 'audit', route: '/audit', icon: 'shield', label: 'Auditoria' },
      { id: 'terminal', route: '/terminal', icon: 'terminal', label: 'Terminal SSH' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'team', route: '/team', icon: 'team', label: 'Equipe' },
      { id: 'settings', route: '/settings', icon: 'settings', label: 'Configurações' },
    ],
  },
];

export function initLayout() {
  if (document.getElementById('app-layout')) return;

  const collapsed = getState('sidebarCollapsed');
  
  const navHTML = NAV_SECTIONS.map((section) => `
    <div class="sidebar__section">
      <div class="sidebar__section-label">${section.label}</div>
      ${section.items.map((item) => `
        <a class="sidebar__link" data-id="${item.id}" data-title="${item.label}" data-icon="${item.icon}" data-route="${item.route}">
          ${icon(item.icon, 20)}
          <span class="sidebar__link-text">${item.label}</span>
        </a>
      `).join('')}
    </div>
  `).join('');

  document.getElementById('app').innerHTML = `
    <div class="app-layout" id="app-layout">
      <aside class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar">
        <div class="sidebar__brand">
          <img src="/favicon.svg" alt="Logo" style="width: 32px; height: 32px;" />
          <span class="sidebar__brand-text">CRM BYTE</span>
        </div>
        <nav class="sidebar__nav" id="sidebar-nav">${navHTML}</nav>
        <div class="sidebar__footer">
          <a class="sidebar__link" id="logout-btn" style="cursor:pointer;">
            ${icon('logout', 20)}
            <span class="sidebar__link-text">Sair</span>
          </a>
        </div>
      </aside>
      <div class="app-main ${collapsed ? 'sidebar-collapsed' : ''}" id="app-main">
        ${renderTopbar()}
        <div class="tabs-bar" id="tabs-bar" style="display:none;"></div>
        <main class="app-content" id="app-content"></main>
      </div>
    </div>
  `;
  
  bindSidebar();
}

function renderTopbar() {
  const user = getState('user');
  const initials = user?.fullName?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  const unread = getUnreadCount();

  return `
    <header class="topbar" id="topbar">
      <div class="topbar__left">
        <button class="topbar__toggle" id="sidebar-toggle">${icon('menu', 20)}</button>
        <div class="topbar__search">
          ${icon('search', 18)}
          <input class="input" type="text" placeholder="Buscar módulos..." id="global-search" />
        </div>
      </div>
      <div class="topbar__right">
        <button class="topbar__action" id="notifications-btn">
          ${icon('bell', 20)}
          <span class="topbar__badge" id="notif-badge" style="display: ${unread > 0 ? 'flex' : 'none'}">
            <span id="notif-count">${unread > 99 ? '99+' : unread}</span>
          </span>
        </button>
        <div class="topbar__user" id="user-menu" data-id="settings" data-title="Configurações" data-icon="settings">
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

function bindSidebar() {
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    const currentState = getState('sidebarCollapsed') || false;
    const newState = !currentState;
    setState('sidebarCollapsed', newState);
    document.getElementById('sidebar')?.classList.toggle('collapsed', newState);
    document.getElementById('app-main')?.classList.toggle('sidebar-collapsed', newState);
  });

  document.getElementById('notifications-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotificationPanel();
  });
}

export function openTab(id, title, iconName, renderFn) {
  initLayout();
  
  if (!openedTabs.find(t => t.id === id)) {
    openedTabs.push({ id, title, icon: iconName });
    
    // Create pane
    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `pane-${id}`;
    document.getElementById('app-content').appendChild(pane);
    
    // Render content
    renderFn(pane);
    
    renderTabsBar();
  }
  
  activateTab(id);
}

export function closeTab(id, event) {
  if (event) {
    event.stopPropagation();
  }
  const index = openedTabs.findIndex(t => t.id === id);
  if (index !== -1) {
    openedTabs.splice(index, 1);
    const pane = document.getElementById(`pane-${id}`);
    if (pane) pane.remove();
    
    renderTabsBar();
    
    if (openedTabs.length > 0) {
      if (activeTabId === id) {
        // Go to previous tab
        const newActive = openedTabs[Math.max(0, index - 1)];
        activateTab(newActive.id);
      }
    } else {
      activeTabId = null;
      document.getElementById('tabs-bar').style.display = 'none';
      document.getElementById('app-content').innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;opacity:0.3;">
          <div style="text-align:center;">
            ${icon('dashboard', 64)}
            <h2 style="margin-top:16px;">Nenhum Módulo Aberto</h2>
            <p>Selecione um módulo no menu lateral</p>
          </div>
        </div>
      `;
    }
  }
}

function activateTab(id) {
  activeTabId = id;
  
  // Update sidebar active state
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.classList.toggle('active', link.dataset.id === id);
  });
  
  // Update tabs active state
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === id);
  });
  
  // Update panes active state
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${id}`);
  });
}

function renderTabsBar() {
  const tabsBar = document.getElementById('tabs-bar');
  if (openedTabs.length === 0) {
    tabsBar.style.display = 'none';
    return;
  }
  
  tabsBar.style.display = 'flex';
  tabsBar.innerHTML = openedTabs.map(t => `
    <div class="tab-btn ${t.id === activeTabId ? 'active' : ''}" data-id="${t.id}">
      ${icon(t.icon, 16)}
      ${t.title}
      <div class="tab-btn__close" data-close-id="${t.id}">${icon('close', 14) || 'x'}</div>
    </div>
  `).join('');
  
  // Bind tab clicks
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Ignore click if it was on the close button
      if (e.target.closest('.tab-btn__close')) return;
      activateTab(btn.dataset.id);
    });
  });
  
  document.querySelectorAll('.tab-btn__close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeTab(btn.dataset.closeId, e);
    });
  });
}

export function bindSidebarNav(routeMap) {
  document.getElementById('sidebar-nav')?.addEventListener('click', (e) => {
    const link = e.target.closest('.sidebar__link');
    if (link && link.dataset.id) {
      const id = link.dataset.id;
      const title = link.dataset.title;
      const iconName = link.dataset.icon;
      
      if (routeMap[id]) {
        openTab(id, title, iconName, routeMap[id]);
      }
    }
  });

  // Topbar user menu opens settings tab
  document.getElementById('user-menu')?.addEventListener('click', () => {
    if (routeMap['settings']) {
      openTab('settings', 'Configurações', 'settings', routeMap['settings']);
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      const { api, clearTokens } = await import('../lib/api.js');
      const { disconnectWebSocket } = await import('../lib/websocket.js');
      const { navigate } = await import('../lib/router.js');
      
      await api.auth.logout();
      clearTokens();
      disconnectWebSocket();
      navigate('/login');
    } catch (e) {
      console.error('Logout error', e);
    }
  });
}

function translateRole(role) {
  const map = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', agent: 'Agente' };
  return map[role] || role || 'Agente';
}
