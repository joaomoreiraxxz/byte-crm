/**
 * CRM BYTE — SPA Hash Router
 * Simple hash-based router with guards, params, and transitions.
 */

const routes = {};
let currentRoute = null;
let beforeEachGuard = null;

/**
 * Register a route.
 * @param {string} path - Hash path (e.g., '/dashboard')
 * @param {Function} handler - Async function that returns HTML string or renders into #app
 */
export function route(path, handler) {
  routes[path] = handler;
}

/**
 * Set a global navigation guard (e.g., auth check).
 */
export function beforeEach(guard) {
  beforeEachGuard = guard;
}

/**
 * Navigate to a route.
 */
export function navigate(path) {
  window.location.hash = `#${path}`;
}

/**
 * Get current route path.
 */
export function getCurrentRoute() {
  return currentRoute;
}

/**
 * Extract params from URL pattern.
 * Pattern: /leads/:id → matches /leads/abc-123
 */
function matchRoute(hash) {
  const path = hash.replace('#', '') || '/login';

  // Exact match first
  if (routes[path]) {
    return { handler: routes[path], params: {}, path };
  }

  // Pattern matching (e.g., /leads/:id)
  for (const [pattern, handler] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { handler, params, path };
    }
  }

  return null;
}

/**
 * Handle hash change events.
 */
async function handleRoute() {
  const hash = window.location.hash || '#/login';
  const matched = matchRoute(hash);

  if (!matched) {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = `
        <div class="login-page">
          <div class="login-container" style="display:flex; justify-content:center; align-items:center;">
            <div class="login-card" style="text-align: center; max-width: 500px; padding: 60px 40px; background: rgba(14, 18, 45, 0.45); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; color: #fff; box-shadow: 0 32px 64px rgba(0,0,0,0.4);">
              <h1 style="font-size: 80px; font-weight: 700; background: linear-gradient(135deg, #A5B4FC, #4F46E5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; line-height: 1;">404</h1>
              <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Página não encontrada</h3>
              <p style="color: rgba(255,255,255,0.6); margin-bottom: 32px; line-height: 1.5;">O endereço que você tentou acessar não existe ou foi movido. Verifique o link e tente novamente.</p>
              <button class="login-submit" onclick="location.hash='#/dashboard'" style="max-width: 250px; margin: 0 auto;">
                Voltar ao Início
              </button>
            </div>
          </div>
        </div>`;
    }
    return;
  }

  // Run navigation guard
  if (beforeEachGuard) {
    const allowed = await beforeEachGuard(matched.path, currentRoute);
    if (!allowed) return;
  }

  currentRoute = matched.path;

  // Apply page transition
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.style.opacity = '0';
    appEl.style.transform = 'translateY(4px)';

    await new Promise((r) => setTimeout(r, 100));

    try {
      await matched.handler(matched.params);
    } catch (error) {
      console.error('[ROUTER] Route handler error:', error);
      appEl.innerHTML = `
        <div class="login-page">
          <div class="card login-card" style="text-align: center;">
            <h2 style="margin-bottom: var(--sp-4);">Erro</h2>
            <p style="color: var(--color-text-secondary);">${error.message}</p>
          </div>
        </div>`;
    }

    appEl.style.transition = 'opacity 250ms ease, transform 250ms ease';
    appEl.style.opacity = '1';
    appEl.style.transform = 'translateY(0)';
  }
}

/**
 * Initialize the router.
 */
export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export default { route, beforeEach, navigate, initRouter, getCurrentRoute };
