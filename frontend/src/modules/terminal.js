import { getSocket } from '../lib/websocket.js';
import icon from '../lib/icons.js';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function renderTerminal(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title" style="color: var(--color-danger);">Terminal Root (SSH)</h1>
        <p class="page-header__subtitle">Acesso direto ao servidor via WebSocket seguro (Sentinela V6)</p>
      </div>
    </div>
    
    <div class="card" style="margin-bottom: 24px; background: rgba(180, 74, 74, 0.05); border-color: rgba(180, 74, 74, 0.2);">
      <div class="card__body" style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">
        <div class="input-group" style="flex: 1; min-width: 200px;">
          <label class="input-label">Host / IP</label>
          <input type="text" class="input" id="ssh-host" placeholder="ex: 179.198.113.136" />
        </div>
        <div class="input-group" style="width: 100px;">
          <label class="input-label">Porta</label>
          <input type="number" class="input" id="ssh-port" value="22" />
        </div>
        <div class="input-group" style="flex: 1; min-width: 150px;">
          <label class="input-label">Usuário</label>
          <input type="text" class="input" id="ssh-user" value="root" />
        </div>
        <div class="input-group" style="flex: 1; min-width: 150px;">
          <label class="input-label">Senha</label>
          <input type="password" class="input" id="ssh-pass" />
        </div>
        <button class="btn btn--danger" id="ssh-connect-btn">${icon('terminal', 16)} Conectar</button>
      </div>
    </div>

    <div id="terminal-container" style="height: 500px; background: #000; padding: 8px; border-radius: 8px; border: 1px solid var(--color-border);"></div>
  `;

  const term = new Terminal({
    theme: { background: '#000000', foreground: '#00ff00' },
    fontFamily: 'Consolas, monospace',
    fontSize: 14,
    cursorBlink: true
  });
  
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  
  const termContainer = container.querySelector('#terminal-container');
  term.open(termContainer);
  fitAddon.fit();
  
  term.writeln('=== SENTINELA V6 SECURE TERMINAL ===');
  term.writeln('Aguardando conexão...');

  const socket = getSocket();
  let connected = false;

  const btn = container.querySelector('#ssh-connect-btn');
  btn.addEventListener('click', () => {
    if (!socket) {
      term.writeln('\\x1b[31mErro: WebSocket não conectado\\x1b[0m');
      return;
    }

    const host = container.querySelector('#ssh-host').value;
    const port = container.querySelector('#ssh-port').value;
    const username = container.querySelector('#ssh-user').value;
    const password = container.querySelector('#ssh-pass').value;

    if (!host || !username || !password) {
      term.writeln('\\x1b[33mPreencha todos os campos para conectar.\\x1b[0m');
      return;
    }

    term.clear();
    socket.emit('ssh:connect', { host, port: parseInt(port), username, password });
    
    // Bind term resize to socket
    window.addEventListener('resize', () => {
      fitAddon.fit();
      socket.emit('ssh:resize', { cols: term.cols, rows: term.rows });
    });
  });

  if (socket) {
    socket.on('ssh:data', (data) => {
      term.write(data);
    });

    socket.on('ssh:error', (err) => {
      term.writeln(`\r\n\\x1b[31m[ERRO] ${err}\\x1b[0m\r\n`);
    });

    term.onData(data => {
      socket.emit('ssh:data', data);
    });
  }
}
