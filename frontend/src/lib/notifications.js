/**
 * CRM BYTE — Notification System
 * Real-time notification center with categories, sounds, and persistence.
 */

import { onEvent } from './websocket.js';
import { getState, setState, subscribe } from './store.js';
import icon from './icons.js';

let notificationPanel = null;
let isOpen = false;

const NOTIFICATION_TYPES = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: 'whatsapp' },
  lead: { label: 'Lead', color: '#4A6FA5', icon: 'contacts' },
  finance: { label: 'Financeiro', color: '#D4A843', icon: 'wallet' },
  security: { label: 'Segurança', color: '#C75B5B', icon: 'shield' },
  system: { label: 'Sistema', color: '#708090', icon: 'info' },
};

/**
 * Initialize the notification system.
 * Listens for WebSocket events and creates notifications.
 */
export function initNotifications() {
  // WhatsApp messages
  onEvent('whatsapp:message:new', (data) => {
    if (data.message?.direction === 'inbound') {
      addNotification({
        type: 'whatsapp',
        title: data.message.sender_name || 'Nova mensagem',
        body: data.message.content?.substring(0, 80) || 'Mídia recebida',
        action: `#/crm/chat?lead=${data.leadId}`,
        timestamp: new Date(),
      });
    }
  });

  // Load persisted notifications
  const saved = sessionStorage.getItem('bytecrm_notifications');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      setState('notifications', parsed.slice(0, 50));
    } catch { /* ignore */ }
  }
}

/**
 * Add a notification to the store and show a toast.
 */
export function addNotification({ type, title, body, action, timestamp }) {
  const notifications = getState('notifications') || [];
  const notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    body,
    action,
    timestamp: timestamp || new Date(),
    read: false,
  };

  const updated = [notification, ...notifications].slice(0, 100);
  setState('notifications', updated);
  sessionStorage.setItem('bytecrm_notifications', JSON.stringify(updated));

  // Show inline toast
  showNotificationToast(notification);

  // Update badge count
  updateBadge();
}

/**
 * Mark a notification as read.
 */
export function markAsRead(notifId) {
  const notifications = getState('notifications') || [];
  const updated = notifications.map((n) =>
    n.id === notifId ? { ...n, read: true } : n
  );
  setState('notifications', updated);
  sessionStorage.setItem('bytecrm_notifications', JSON.stringify(updated));
  updateBadge();
}

/**
 * Mark all notifications as read.
 */
export function markAllAsRead() {
  const notifications = getState('notifications') || [];
  const updated = notifications.map((n) => ({ ...n, read: true }));
  setState('notifications', updated);
  sessionStorage.setItem('bytecrm_notifications', JSON.stringify(updated));
  updateBadge();
}

/**
 * Get unread count.
 */
export function getUnreadCount() {
  const notifications = getState('notifications') || [];
  return notifications.filter((n) => !n.read).length;
}

/**
 * Update the notification badge in the topbar.
 */
function updateBadge() {
  const count = getUnreadCount();
  const badge = document.getElementById('notif-badge');
  const countEl = document.getElementById('notif-count');
  if (badge) badge.style.display = count > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = count > 99 ? '99+' : count;
}

/**
 * Toggle the notification panel.
 */
export function toggleNotificationPanel() {
  isOpen = !isOpen;

  let panel = document.getElementById('notification-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'notification-panel';
    document.body.appendChild(panel);
  }

  if (isOpen) {
    const notifications = getState('notifications') || [];
    const unread = getUnreadCount();

    panel.className = 'notif-panel notif-panel--open';
    panel.innerHTML = `
      <div class="notif-panel__header">
        <h3 class="notif-panel__title">Notificações ${unread > 0 ? `<span class="notif-panel__count">${unread}</span>` : ''}</h3>
        <div class="notif-panel__actions">
          ${unread > 0 ? `<button class="btn btn--ghost btn--sm" id="mark-all-read">Marcar todas</button>` : ''}
          <button class="btn btn--ghost btn--sm btn--icon" id="close-notif-panel">${icon('close', 18)}</button>
        </div>
      </div>
      <div class="notif-panel__body">
        ${notifications.length === 0 ? `
          <div class="notif-panel__empty">
            ${icon('bell', 40)}
            <p>Nenhuma notificação</p>
          </div>
        ` : notifications.slice(0, 30).map((n) => renderNotification(n)).join('')}
      </div>
    `;

    // Event handlers
    panel.querySelector('#close-notif-panel')?.addEventListener('click', toggleNotificationPanel);
    panel.querySelector('#mark-all-read')?.addEventListener('click', () => {
      markAllAsRead();
      toggleNotificationPanel();
      toggleNotificationPanel(); // Re-render
    });

    panel.querySelectorAll('.notif-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const action = item.dataset.action;
        markAsRead(id);
        if (action) window.location.hash = action;
        toggleNotificationPanel();
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
  } else {
    panel.className = 'notif-panel';
    panel.innerHTML = '';
    document.removeEventListener('click', handleOutsideClick);
  }
}

function handleOutsideClick(e) {
  const panel = document.getElementById('notification-panel');
  const btn = document.getElementById('notifications-btn');
  if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
    isOpen = true;
    toggleNotificationPanel();
  }
}

function renderNotification(n) {
  const typeInfo = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.system;
  const timeAgo = formatTimeAgo(new Date(n.timestamp));

  return `
    <div class="notif-item ${n.read ? '' : 'notif-item--unread'}" data-id="${n.id}" data-action="${n.action || ''}">
      <div class="notif-item__icon" style="color: ${typeInfo.color}">
        ${icon(typeInfo.icon, 18)}
      </div>
      <div class="notif-item__content">
        <div class="notif-item__title">${n.title}</div>
        <div class="notif-item__body">${n.body}</div>
        <div class="notif-item__time">${timeAgo}</div>
      </div>
      ${!n.read ? '<div class="notif-item__dot"></div>' : ''}
    </div>
  `;
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function showNotificationToast(notification) {
  const typeInfo = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.system;
  const root = document.getElementById('toast-root');
  if (!root) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderLeftColor = typeInfo.color;
  toast.innerHTML = `
    <div style="color: ${typeInfo.color}">${icon(typeInfo.icon, 18)}</div>
    <div>
      <div style="font-weight: 500; margin-bottom: 2px;">${notification.title}</div>
      <div style="color: var(--color-text-tertiary); font-size: var(--fs-xs);">${notification.body}</div>
    </div>
  `;

  if (notification.action) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      window.location.hash = notification.action;
      toast.remove();
    });
  }

  root.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

export default { initNotifications, addNotification, toggleNotificationPanel, getUnreadCount };
