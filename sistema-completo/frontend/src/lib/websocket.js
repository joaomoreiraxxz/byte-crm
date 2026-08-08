/**
 * CRM BYTE — WebSocket Client
 * Socket.IO wrapper for real-time events (WhatsApp, notifications).
 */

import { io } from 'socket.io-client';
import { getAccessToken } from './api.js';
import { setState, getState } from './store.js';

let socket = null;
const eventHandlers = new Map();

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

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="material-icons-outlined" style="font-size: 18px;">
      ${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'}
    </span>
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
