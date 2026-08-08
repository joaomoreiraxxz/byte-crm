/**
 * CRM BYTE — Simple Reactive Store
 * Lightweight pub/sub state management.
 */

const state = {
  user: null,
  tenant: null,
  sidebarCollapsed: false,
  vaultSession: null,
  activeLeadId: null,
  activePipelineId: null,
  notifications: [],
  onlineUsers: [],
};

const listeners = new Map();

/**
 * Get a state value.
 */
export function getState(key) {
  return state[key];
}

/**
 * Set a state value and notify listeners.
 */
export function setState(key, value) {
  const prev = state[key];
  state[key] = value;

  if (listeners.has(key)) {
    listeners.get(key).forEach((cb) => cb(value, prev));
  }
}

/**
 * Subscribe to state changes.
 * Returns an unsubscribe function.
 */
export function subscribe(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  return () => listeners.get(key).delete(callback);
}

/**
 * Get the full state snapshot.
 */
export function getSnapshot() {
  return { ...state };
}

/**
 * Reset state to defaults (on logout).
 */
export function resetState() {
  state.user = null;
  state.tenant = null;
  state.vaultSession = null;
  state.activeLeadId = null;
  state.notifications = [];
  state.onlineUsers = [];
}

export default { getState, setState, subscribe, getSnapshot, resetState };
