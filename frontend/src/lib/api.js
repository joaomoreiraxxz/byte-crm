/**
 * CRM BYTE — HTTP API Client
 * Wraps fetch with auth headers, CSRF tokens, error handling, and retry logic.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

let accessToken = null;
let refreshToken = null;
let csrfToken = null;

// ─── Token Management ──────────────────────────────────────────
export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) {
    sessionStorage.setItem('bytecrm_at', access);
    sessionStorage.setItem('bytecrm_rt', refresh);
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  csrfToken = null;
  sessionStorage.removeItem('bytecrm_at');
  sessionStorage.removeItem('bytecrm_rt');
}

export function loadTokens() {
  accessToken = sessionStorage.getItem('bytecrm_at');
  refreshToken = sessionStorage.getItem('bytecrm_rt');
}

export function getAccessToken() {
  return accessToken;
}

// ─── CSRF Token ─────────────────────────────────────────────────
async function fetchCsrfToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/csrf-token`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.data?.csrfToken;
  } catch (e) {
    console.warn('[API] Failed to fetch CSRF token:', e);
  }
}

// ─── Token Refresh ──────────────────────────────────────────────
let isRefreshing = false;
let refreshQueue = [];

async function refreshAccessToken() {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      refreshQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) throw new Error('Refresh failed');

    const data = await res.json();
    setTokens(data.data.accessToken, data.data.refreshToken);

    refreshQueue.forEach(({ resolve }) => resolve());
    refreshQueue = [];
    return true;
  } catch (error) {
    refreshQueue.forEach(({ reject }) => reject(error));
    refreshQueue = [];
    clearTokens();
    window.location.hash = '#/login';
    return false;
  } finally {
    isRefreshing = false;
  }
}

// ─── Core Request Function ─────────────────────────────────────
async function request(method, path, body = null, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  if (options.vaultSession) {
    headers['X-Vault-Session'] = options.vaultSession;
  }

  const config = {
    method,
    headers,
    credentials: 'include',
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  let res = await fetch(url, config);

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken && !options.noRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      config.headers = headers;
      res = await fetch(url, config);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error?.message || 'Request failed');
    error.code = data.error?.code;
    error.status = res.status;
    error.details = data.error?.details;
    throw error;
  }

  return data;
}

// ─── Public API Methods ─────────────────────────────────────────
export const api = {
  get: (path, options) => request('GET', path, null, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, null, options),

  // Auth shortcuts
  auth: {
    login: (email, password, tenantSlug) =>
      request('POST', '/auth/login', { email, password, tenantSlug }),
    register: (data) => request('POST', '/auth/register', data),
    logout: () => request('POST', '/auth/logout'),
    me: () => request('GET', '/auth/me'),
  },

  // CRM shortcuts
  crm: {
    getKanban: (pipelineId) => request('GET', `/crm/leads/kanban/${pipelineId}`),
    getLeads: (params) => request('GET', `/crm/leads?${new URLSearchParams(params)}`),
    getLead: (id) => request('GET', `/crm/leads/${id}`),
    createLead: (data) => request('POST', '/crm/leads', data),
    updateLead: (id, data) => request('PUT', `/crm/leads/${id}`, data),
    moveLead: (id, stageId, position) =>
      request('PATCH', `/crm/leads/${id}/move`, { stageId, position }),
    deleteLead: (id) => request('DELETE', `/crm/leads/${id}`),
  },

  // WhatsApp shortcuts
  whatsapp: {
    getMessages: (leadId, params) =>
      request('GET', `/whatsapp/messages/${leadId}?${new URLSearchParams(params || {})}`),
    sendMessage: (data) => request('POST', '/whatsapp/send', data),
  },

  // ERP shortcuts
  erp: {
    getContasPagar: (params) =>
      request('GET', `/erp/contas-pagar?${new URLSearchParams(params || {})}`),
    createContaPagar: (data) => request('POST', '/erp/contas-pagar', data),
    payContaPagar: (id, data) => request('POST', `/erp/contas-pagar/${id}/pay`, data),
    getConciliacao: (contaId, month, year) =>
      request('GET', `/erp/conciliacao/${contaId}?month=${month}&year=${year}`),
    conciliate: (transacaoId) =>
      request('PATCH', `/erp/transacoes/${transacaoId}/conciliate`),
  },

  // Vault shortcuts
  vault: {
    setup: (masterPassword, hint) =>
      request('POST', '/vault/setup', { masterPassword, passwordHint: hint }),
    unlock: (masterPassword, faceSnapshot) =>
      request('POST', '/vault/unlock', { masterPassword, faceSnapshot }),
    lock: () => request('POST', '/vault/lock'),
    listEntries: () => request('GET', '/vault/entries'),
    getEntry: (id, vaultSession) =>
      request('GET', `/vault/entries/${id}`, null, { vaultSession }),
    createEntry: (data, vaultSession) =>
      request('POST', '/vault/entries', data, { vaultSession }),
  },

  init: async () => {
    loadTokens();
    await fetchCsrfToken();
  },
};

export default api;
