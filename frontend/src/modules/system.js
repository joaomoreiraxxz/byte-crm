import { api } from '../lib/api.js';
import icon from '../lib/icons.js';
import { getState, setState } from '../lib/store.js';
import { showToast } from '../lib/websocket.js';

function renderEmptyState(title, subtitle, iconName) {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__subtitle">${subtitle}</p>
      </div>
    </div>
    <div class="card" style="margin-top: 24px; text-align: center; padding: 48px;">
      ${icon(iconName, 48)}
      <h3 style="margin: 16px 0 8px;">Módulo Vazio</h3>
      <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto;">
        Nenhum dado real foi encontrado.
      </p>
    </div>
  `;
}

export async function renderVault(container) {
  container.innerHTML = `<div style="padding: 32px; text-align:center;"><span class="spinner"></span></div>`;
  try {
    const res = await api.vault.listEntries();
    const data = res.data || [];
    
    if (data.length === 0) {
      container.innerHTML = renderEmptyState('Cofre', 'Senhas salvas', 'vault');
    } else {
      container.innerHTML = `<div style="color:white;">Cofre items here</div>`;
    }
  } catch (err) {
    container.innerHTML = renderEmptyState('Cofre', 'Senhas salvas', 'vault');
  }
}

export async function renderAudit(container) {
  container.innerHTML = renderEmptyState('Auditoria Sentinela V6', 'Logs do sistema', 'shield');
}

export async function renderTeam(container) {
  container.innerHTML = renderEmptyState('Equipe', 'Membros do tenant', 'team');
}

// ─── Settings / Profile ─────────────────────────────────────────
export async function renderSettings(container) {
  const user = getState('user');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Configurações</h1>
        <p class="page-header__subtitle">Gerencie sua conta e segurança</p>
      </div>
    </div>
    <div class="settings-layout" style="margin-top: 24px;">
      <nav class="settings-nav" id="settings-nav">
        <div class="settings-nav__item active" data-section="profile">${icon('team', 16)} Perfil</div>
        <div class="settings-nav__item" data-section="security">${icon('vault', 16)} Segurança</div>
      </nav>
      <div id="settings-content"></div>
    </div>
  `;

  const contentEl = container.querySelector('#settings-content');

  function renderProfileSection() {
    contentEl.innerHTML = `
      <div class="settings-section">
        <h3 class="settings-section__title">Informações do Perfil</h3>
        <form id="profile-form">
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">Nome Completo</label>
            <input type="text" id="pf-name" class="input" value="${user?.fullName || ''}" required />
          </div>
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">E-mail</label>
            <input type="email" class="input" value="${user?.email || ''}" disabled style="opacity:0.6;cursor:not-allowed;" />
            <span style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">O e-mail não pode ser alterado</span>
          </div>
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">Telefone</label>
            <input type="text" id="pf-phone" class="input" value="${user?.phone || ''}" placeholder="(11) 99999-9999" />
          </div>
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">URL do Avatar</label>
            <input type="url" id="pf-avatar" class="input" value="${user?.avatarUrl || ''}" placeholder="https://..." />
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <button type="submit" class="btn btn--primary" id="btn-save-profile">${icon('check', 16)} Salvar Alterações</button>
            <span id="profile-status" style="font-size:var(--fs-sm);color:var(--color-success);display:none;">Salvo com sucesso!</span>
          </div>
        </form>
        <div class="divider" style="margin:24px 0;"></div>
        <div>
          <h4 style="margin-bottom:8px;font-size:var(--fs-sm);color:var(--color-text-secondary);">Informações da Conta</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--fs-sm);">
            <div><strong>Cargo:</strong> ${translateRole(user?.role)}</div>
            <div><strong>Tenant:</strong> ${user?.tenantName || '—'}</div>
            <div><strong>Último login:</strong> ${user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('pt-BR') : '—'}</div>
          </div>
        </div>
      </div>`;

    contentEl.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = contentEl.querySelector('#btn-save-profile');
      const status = contentEl.querySelector('#profile-status');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner--sm"></span> Salvando...';

      try {
        const res = await api.auth.updateProfile({
          fullName: document.getElementById('pf-name').value,
          phone: document.getElementById('pf-phone').value || null,
          avatarUrl: document.getElementById('pf-avatar').value || null,
        });
        // Update local state
        setState('user', { ...user, ...res.data });
        status.style.display = 'inline';
        showToast('Perfil atualizado!', 'success');
        setTimeout(() => { status.style.display = 'none'; }, 3000);
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icon('check', 16)} Salvar Alterações`;
      }
    });
  }

  function renderSecuritySection() {
    contentEl.innerHTML = `
      <div class="settings-section">
        <h3 class="settings-section__title">Alterar Senha</h3>
        <form id="password-form">
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">Senha Atual</label>
            <input type="password" id="pw-current" class="input" required placeholder="••••••••" autocomplete="current-password" />
          </div>
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">Nova Senha</label>
            <input type="password" id="pw-new" class="input" required placeholder="Mínimo 8 caracteres" minlength="8" autocomplete="new-password" />
          </div>
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label">Confirmar Nova Senha</label>
            <input type="password" id="pw-confirm" class="input" required placeholder="Repita a nova senha" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn--primary" id="btn-change-pw">${icon('vault', 16)} Alterar Senha</button>
        </form>
        <div class="divider" style="margin:24px 0;"></div>
        <div>
          <h4 style="margin-bottom:8px;font-size:var(--fs-sm);color:var(--color-text-secondary);">Segurança da Conta</h4>
          <div class="settings-row">
            <div>
              <div class="settings-row__label">Autenticação MFA</div>
              <div class="settings-row__desc">Autenticação de dois fatores</div>
            </div>
            <span class="badge ${user?.mfaEnabled ? 'badge--success' : 'badge--neutral'}">${user?.mfaEnabled ? 'Ativado' : 'Desativado'}</span>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row__label">Reconhecimento Facial</div>
              <div class="settings-row__desc">Face ID para desbloqueio do cofre</div>
            </div>
            <span class="badge ${user?.faceEnrolled ? 'badge--success' : 'badge--neutral'}">${user?.faceEnrolled ? 'Cadastrado' : 'Não cadastrado'}</span>
          </div>
        </div>
      </div>`;

    contentEl.querySelector('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPw = document.getElementById('pw-new').value;
      const confirmPw = document.getElementById('pw-confirm').value;

      if (newPw !== confirmPw) {
        showToast('As senhas não coincidem', 'error');
        return;
      }

      const btn = contentEl.querySelector('#btn-change-pw');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner--sm"></span> Alterando...';

      try {
        await api.auth.changePassword({
          currentPassword: document.getElementById('pw-current').value,
          newPassword: newPw,
        });
        showToast('Senha alterada com sucesso!', 'success');
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-confirm').value = '';
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icon('vault', 16)} Alterar Senha`;
      }
    });
  }

  // Nav bindings
  container.querySelectorAll('.settings-nav__item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.settings-nav__item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const section = item.dataset.section;
      if (section === 'profile') renderProfileSection();
      else if (section === 'security') renderSecuritySection();
    });
  });

  // Default
  renderProfileSection();
}

function translateRole(role) {
  const map = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', agent: 'Agente' };
  return map[role] || role || 'Agente';
}
