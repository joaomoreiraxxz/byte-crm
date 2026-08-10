/**
 * CRM BYTE — WebSocket Client
 * Socket.IO wrapper for real-time events (WhatsApp, notifications).
 */

import { io } from 'socket.io-client';
import { getAccessToken } from './api.js';
import { setState, getState } from './store.js';

let socket = null;
const eventHandlers = new Map();

export const getSocket = () => socket;

/**
 * Connect to the WebSocket server.
 */
export function connectWebSocket() {
  const token = getAccessToken();
  if (!token) return;

  if (socket?.connected) return;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Connection error:', err.message);
  });

  // ─── WhatsApp Events ──────────────────────────────────────
  socket.on('whatsapp:message:new', (data) => {
    triggerHandlers('whatsapp:message:new', data);
    showToast(`Nova mensagem de ${data.message?.sender_name || 'Desconhecido'}`, 'info');
  });

  socket.on('whatsapp:message:status', (data) => {
    triggerHandlers('whatsapp:message:status', data);
  });

  socket.on('whatsapp:contacts:update', (data) => {
    triggerHandlers('whatsapp:contacts:update', data);
  });

  socket.on('whatsapp:typing', (data) => {
    triggerHandlers('whatsapp:typing', data);
  });
}

/**
 * Disconnect WebSocket.
 */
export function disconnectWebSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join a lead's chat room.
 */
export function joinLeadRoom(leadId) {
  socket?.emit('join:lead', leadId);
}

/**
 * Leave a lead's chat room.
 */
export function leaveLeadRoom(leadId) {
  socket?.emit('leave:lead', leadId);
}

/**
 * Register an event handler.
 */
export function onEvent(event, handler) {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  eventHandlers.get(event).add(handler);

  return () => eventHandlers.get(event).delete(handler);
}

function triggerHandlers(event, data) {
  if (eventHandlers.has(event)) {
    eventHandlers.get(event).forEach((handler) => handler(data));
  }
}

// ─── Toast helper ────────────────────────────────────────────
function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const iconMap = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D9970" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C08C39" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  const borderColors = {
    success: '#3D9970',
    error: '#EF4444',
    warning: '#C08C39',
    info: '#38BDF8',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.style.borderLeftColor = borderColors[type] || borderColors.info;
  toast.innerHTML = `
    <span style="display:inline-flex;flex-shrink:0;">${iconMap[type] || iconMap.info}</span>
    <span>${message}</span>
  `;

  root.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export { showToast };
export default { connectWebSocket, disconnectWebSocket, joinLeadRoom, leaveLeadRoom, onEvent };
