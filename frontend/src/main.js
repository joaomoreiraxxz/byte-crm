import { api, clearTokens, getAccessToken } from './lib/api.js';
import { route, beforeEach, navigate, initRouter } from './lib/router.js';
import { setState, getState, resetState } from './lib/store.js';
import { connectWebSocket, disconnectWebSocket } from './lib/websocket.js';
import { initNotifications } from './lib/notifications.js';

import { initLayout, bindSidebarNav } from './modules/layout.js';
import { renderLogin } from './modules/auth.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderPipeline, renderContacts } from './modules/crm.js';
import { renderContasPagar, renderContasReceber, renderConciliacao, renderReports } from './modules/erp.js';
import { renderVault, renderAudit, renderTeam, renderSettings } from './modules/system.js';
import { renderTerminal } from './modules/terminal.js';
import { renderWorkspaces } from './modules/workspaces.js';
import { renderProductivity } from './modules/productivity.js';

// Route Map for Sidebar
const routeMap = {
  'dashboard': renderDashboard,
  'workspaces': renderWorkspaces,
  'pipeline': renderPipeline,
  'contacts': renderContacts,
  'tasks': (pane) => renderProductivity(pane, 'tasks'),
  'notes': (pane) => renderProductivity(pane, 'notes'),
  'calendar': (pane) => renderProductivity(pane, 'events'),
  'chat': (pane) => { pane.innerHTML = '<div style="padding:48px; text-align:center;">Módulo de WhatsApp (Evolution API) em construção...</div>'; },
  'products': (pane) => { pane.innerHTML = '<div style="padding:48px; text-align:center;">Módulo de Produtos em construção...</div>'; },
  'contas-pagar': renderContasPagar,
  'contas-receber': renderContasReceber,
  'conciliacao': renderConciliacao,
  'reports': renderReports,
  'vault': renderVault,
  'audit': renderAudit,
  'terminal': renderTerminal,
  'team': renderTeam,
  'settings': renderSettings,
};

// Main Router Handler for /dashboard
function handleDashboardEntry() {
  initLayout();
  bindSidebarNav(routeMap);
  
  // Default tab when entering dashboard
  import('./modules/layout.js').then(({ openTab, openedTabs }) => {
    // Only open default if no tabs already open
    if (openedTabs.length === 0) {
      openTab('workspaces', 'Workspaces', 'team', renderWorkspaces);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// ROUTE REGISTRATION
// ═══════════════════════════════════════════════════════════════

route('/login', () => renderLogin());
route('/dashboard', () => handleDashboardEntry());

// We can map other deep links if needed, but since we use Tabs, 
// everything goes through /dashboard and opens dynamically.
const subRoutes = [
  '/crm/pipeline', '/crm/contacts', '/crm/chat', '/crm/products',
  '/tasks', '/notes',
  '/erp/contas-pagar', '/erp/contas-receber', '/erp/conciliacao', '/erp/reports',
  '/vault', '/audit', '/terminal', '/team', '/calendar', '/settings'
];

subRoutes.forEach(r => {
  route(r, () => handleDashboardEntry());
});

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
}

init();
