import { api, setTokens } from '../lib/api.js';
import { setState } from '../lib/store.js';
import { connectWebSocket } from '../lib/websocket.js';
import icon from '../lib/icons.js';
import { navigate } from '../lib/router.js';
import { showToast } from '../lib/websocket.js';

export function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-page">
      <div class="login-container">
        <div class="login-card">
          <div class="login-card__left">
            <div class="login-card__brand">
              <img class="login-card__brand-icon" src="/favicon.svg" alt="CRM BYTE" style="width: 32px; height: 32px;" />
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
                  <h4>Sentinela V6</h4>
                  <p>Proteção rigorosa contra intrusões</p>
                </div>
              </div>
              <div class="login-info-item">
                <div class="login-info-icon">${icon('terminal', 18)}</div>
                <div class="login-info-text">
                  <h4>Web SSH Integrado</h4>
                  <p>Controle raiz com túnel WebSocket seguro</p>
                </div>
              </div>
              <div class="login-info-item">
                <div class="login-info-icon">${icon('pipeline', 18)}</div>
                <div class="login-info-text">
                  <h4>CRM Avançado</h4>
                  <p>Gestão de vendas e pipeline de alta performance</p>
                </div>
              </div>
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
    // Using simple alert or toast if available
    console.log('Login realized with success!');
  } catch (error) {
    err.textContent = error.message || 'Credenciais inválidas';
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}
