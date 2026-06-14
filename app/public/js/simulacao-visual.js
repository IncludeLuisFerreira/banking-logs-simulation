/* ===============================================================
   Module 1: SSE Client — connects, pushes events to buffer
   Module 2: Event Queue + Tick Timer — buffers events, ticks
   Module 3: State Manager — account states, arrows, stats
   Module 4: Renderer — hub lines, cards, arrows
   =============================================================== */

// --- DOM refs ---
const userDisplay = document.getElementById('userDisplay');
const feedback = document.getElementById('feedback');
const btnLogout = document.getElementById('btnLogout');
const btnIniciar = document.getElementById('btnIniciar');
const btnParar = document.getElementById('btnParar');
const btnLimpar = document.getElementById('btnLimpar');
const inputNumContas = document.getElementById('inputNumContas');
const visualStatus = document.getElementById('visualStatus');
const totalTransacoes = document.getElementById('totalTransacoes');
const locksAtivos = document.getElementById('locksAtivos');
const visualArena = document.getElementById('visualArena');
const svgLines = document.getElementById('svgLines');
const visualAccounts = document.getElementById('visualAccounts');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
const modeRadios = document.querySelectorAll('input[name="simMode"]');
const randomControls = document.getElementById('randomControls');
const inputTransMin = document.getElementById('inputTransMin');
const inputTransMax = document.getElementById('inputTransMax');

const API_URL = API_BASE_URL;

// --- Auth ---
function getToken() {
  return localStorage.getItem('auth_token');
}
function redirecionarLogin() {
  pararTimer();
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
}
async function carregarUsuario() {
  const token = getToken();
  if (!token) { redirecionarLogin(); return; }
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { redirecionarLogin(); return; }
    const dados = await res.json();
    userDisplay.textContent = dados.username || 'usuário';
  } catch { redirecionarLogin(); }
}

// --- Feedback ---
function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
  setTimeout(() => { feedback.hidden = true; }, 4000);
}

// ===== MODE SELECTOR =====
modeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    randomControls.hidden = radio.value !== 'random';
  });
});

// ===== MODULE 1: SSE Client =====
let eventSource = null;

function conectarSSE() {
  if (eventSource) eventSource.close();
  const token = getToken();
  if (!token) return;

  eventSource = new EventSource(`${API_URL}/simulacao/stream?token=${token}`);

  const eventTypes = ['lock:request', 'lock:acquired', 'lock:blocked', 'lock:timeout', 'lock:released', 'transacao:success', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada'];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (e) => {
      eventBuffer.push({ type, data: JSON.parse(e.data) });
    });
  }

  eventSource.onerror = () => {
    exibirFeedback('Conexão perdida. Reconectando...', 'error');
  };
}

function desconectarSSE() {
  if (eventSource) { eventSource.close(); eventSource = null; }
}

// ===== MODULE 2: Event Queue + Tick Timer =====
let eventBuffer = [];
let tickTimer = null;
let tickInterval = 500;

function iniciarTimer() {
  pararTimer();
  tickTimer = setInterval(processarTick, tickInterval);
}

function pararTimer() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function configurarVelocidade(ms) {
  tickInterval = ms;
  if (tickTimer) {
    iniciarTimer();
  }
}

function processarTick() {
  if (eventBuffer.length === 0) return;
  const event = eventBuffer.shift();
  processarEvento(event.type, event.data);
  renderizar();
}

// ===== MODULE 3: State Manager =====
let contasData = [];
let accountStates = new Map();
let activeArrows = new Map();
let stats = { transacoes: 0, locksAtivos: 0 };
let transacoesEmAndamento = new Map();
let transacoesConcluidas = [];
let resultadosSimulacao = null;
let inicioSimulacaoTimestamp = null;

function processarEvento(type, data) {
  if (data.source && data.source !== 'visual') return;

  if (type === 'lock:request') {
    const { contaId, origemId, destinoId } = data;
    stats.locksAtivos++;
    if (contaId) setAccountState(contaId, 'requesting');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      if (!transacoesEmAndamento.has(key)) {
        transacoesEmAndamento.set(key, { origemId, destinoId, inicioTimestamp: Date.now() });
      }
      setArrowState(key, 'requesting');
    }
  }

  else if (type === 'lock:acquired') {
    const { contaId } = data;
    if (contaId) setAccountState(contaId, 'locked');
  }

  else if (type === 'lock:blocked') {
    const { contaId } = data;
    if (contaId) setAccountState(contaId, 'blocked');
  }

  else if (type === 'lock:timeout') {
    const { contaId, origemId, destinoId } = data;
    if (contaId) setAccountState(contaId, 'timeout');
    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      transacoesEmAndamento.delete(key);
      removeArrow(key);
    }
  }

  else if (type === 'lock:released') {
    const { contaId } = data;
    stats.locksAtivos = Math.max(0, stats.locksAtivos - 1);
    if (contaId) setAccountState(contaId, 'idle');
  }

  else if (type === 'transacao:success') {
    const { origemId, destinoId, valorCentavos } = data;
    stats.transacoes++;

    const contaOrigem = contasData.find(c => c.id === origemId);
    const contaDestino = contasData.find(c => c.id === destinoId);
    if (contaOrigem) contaOrigem.saldoCentavos -= valorCentavos;
    if (contaDestino) contaDestino.saldoCentavos += valorCentavos;

    const key = `${origemId}-${destinoId}`;
    transacoesEmAndamento.delete(key);

    transacoesConcluidas.push({ origemId, destinoId, valorCentavos });

    setArrowState(key, 'success');
    setTimeout(() => {
      removeArrow(key);
      renderizar();
    }, 2000);

    if (origemId) setAccountState(origemId, 'idle');
    if (destinoId) setAccountState(destinoId, 'idle');
    const origHub = accountStates.get(origemId);
    const destHub = accountStates.get(destinoId);
    if (origHub) origHub.hubLineState = 'success';
    if (destHub) destHub.hubLineState = 'success';
    setTimeout(() => {
      if (origemId) setAccountState(origemId, 'idle');
      if (destinoId) setAccountState(destinoId, 'idle');
      renderizar();
    }, 2000);
  }

  else if (type === 'simulacao-visual:iniciada') {
    contasData = data.contas || [];
    accountStates.clear();
    activeArrows.clear();
    transacoesEmAndamento.clear();
    transacoesConcluidas = [];
    resultadosSimulacao = null;
    inicioSimulacaoTimestamp = Date.now();
    stats = { transacoes: 0, locksAtivos: 0 };
    for (const c of contasData) {
      accountStates.set(c.id, { hubLineState: 'idle', borderState: 'idle' });
    }
    visualStatus.textContent = 'Rodando';
    visualStatus.className = 'status-badge status-running';
  }

  else if (type === 'simulacao-visual:finalizada' || type === 'simulacao-visual:parada') {
    visualStatus.textContent = type === 'simulacao-visual:finalizada' ? 'Concluída' : 'Parado';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
    pararTimer();

    if (type === 'simulacao-visual:finalizada') {
      const duracao = Math.floor((Date.now() - inicioSimulacaoTimestamp) / 1000);
      const total = transacoesConcluidas.length + transacoesEmAndamento.size;
      const sucesso = transacoesConcluidas.length;
      const contencao = total > 0 ? Math.round(((total - sucesso) / total) * 100) : 0;
      resultadosSimulacao = { total, sucesso, contencao, duracao, timestamp: Date.now() };
      if (typeof mostrarResultados === 'function') {
        mostrarResultados(resultadosSimulacao);
      }
      visualStatus.className = 'status-badge status-concluida';
    }
    renderizar();
  }
}

function setAccountState(contaId, state) {
  const entry = accountStates.get(contaId);
  if (!entry) return;
  entry.hubLineState = state;
  entry.borderState = state;
}

function setArrowState(key, state) {
  const existing = activeArrows.get(key);
  if (existing) {
    existing.arrowState = state;
    if (existing.timeoutId) { clearTimeout(existing.timeoutId); existing.timeoutId = null; }
  } else {
    activeArrows.set(key, { arrowState: state, timeoutId: null });
  }
}

function removeArrow(key) {
  const entry = activeArrows.get(key);
  if (!entry) return;
  if (entry.timeoutId) clearTimeout(entry.timeoutId);
  activeArrows.delete(key);
}

// ===== MODULE 4: Renderer =====
function renderizarPainelTransacoes() {
  const painelEmAndamento = document.getElementById('painelEmAndamento');
  const painelConcluidas = document.getElementById('painelConcluidas');
  const contadorEmAndamento = document.getElementById('contadorEmAndamento');
  const contadorConcluidas = document.getElementById('contadorConcluidas');
  const painelContador = document.getElementById('painelContador');

  if (!painelEmAndamento || !painelConcluidas) return;

  if (contadorEmAndamento) contadorEmAndamento.textContent = transacoesEmAndamento.size;
  if (contadorConcluidas) contadorConcluidas.textContent = transacoesConcluidas.length;
  if (painelContador) {
    painelContador.textContent = `Em andamento: ${transacoesEmAndamento.size} | Concluídas: ${transacoesConcluidas.length}`;
  }

  // Em Andamento
  if (transacoesEmAndamento.size === 0) {
    painelEmAndamento.innerHTML = '<p class="painel-placeholder">Nenhuma transação em andamento.</p>';
  } else {
    let html = '';
    for (const [key, entry] of transacoesEmAndamento) {
      const [origemId, destinoId] = key.split('-').map(Number);
      const contaOrigem = contasData.find(c => c.id === origemId);
      const contaDestino = contasData.find(c => c.id === destinoId);
      const origemLetter = contaOrigem ? contaOrigem.letter : origemId;
      const destinoLetter = contaDestino ? contaDestino.letter : destinoId;
      html += `
        <div class="transacao-entry transacao-entry--in-progress">
          <span class="entry-spinner"></span>
          <span class="entry-origem">${origemLetter}</span>
          <span class="entry-seta">→</span>
          <span class="entry-destino">${destinoLetter}</span>
          <span class="entry-valor">processando...</span>
        </div>`;
    }
    painelEmAndamento.innerHTML = html;
  }

  // Concluídas
  if (transacoesConcluidas.length === 0) {
    painelConcluidas.innerHTML = '<p class="painel-placeholder">Nenhuma transação concluída.</p>';
  } else {
    const MAX_VISIVEIS = 100;
    const exibir = transacoesConcluidas.slice(-MAX_VISIVEIS);
    let html = '';
    for (const t of exibir) {
      const contaOrigem = contasData.find(c => c.id === t.origemId);
      const contaDestino = contasData.find(c => c.id === t.destinoId);
      const origemLetter = contaOrigem ? contaOrigem.letter : t.origemId;
      const destinoLetter = contaDestino ? contaDestino.letter : t.destinoId;
      const valor = (t.valorCentavos / 100).toFixed(2);
      html += `
        <div class="transacao-entry transacao-entry--completed">
          <span class="entry-check">✓</span>
          <span class="entry-origem">${origemLetter}</span>
          <span class="entry-seta">→</span>
          <span class="entry-destino">${destinoLetter}</span>
          <span class="entry-valor">R$ ${valor}</span>
        </div>`;
    }
    painelConcluidas.innerHTML = html;
    painelConcluidas.scrollTop = painelConcluidas.scrollHeight;
  }
}

function renderizar() {
  renderizarHubLines();
  renderizarCards();
  renderizarArrows();
  renderizarPainelTransacoes();
  atualizarStats();
}

function renderizarHubLines() {
  svgLines.querySelectorAll('.hub-line').forEach(el => el.remove());

  const rect = visualArena.getBoundingClientRect();
  const centerX = (rect.width - 220) / 2 + 220;
  const centerY = rect.height / 2;

  for (const conta of contasData) {
    const state = accountStates.get(conta.id);
    const lineState = state ? state.hubLineState : 'idle';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', centerX);
    line.setAttribute('y1', centerY);
    line.setAttribute('x2', conta._x);
    line.setAttribute('y2', conta._y);
    line.classList.add('hub-line', lineState);
    svgLines.appendChild(line);
  }
}

function renderizarCards() {
  for (const conta of contasData) {
    const card = document.getElementById(`conta-${conta.id}`);
    if (!card) continue;
    const state = accountStates.get(conta.id);
    const borderState = state ? state.borderState : 'idle';
    card.className = `conta-card status-${borderState}`;

    const letterEl = card.querySelector('.conta-letter');
    const saldoEl = card.querySelector('.conta-saldo');
    const barFillEl = card.querySelector('.conta-bar-fill');
    const statusEl = card.querySelector('.conta-status');

    const labels = {
      idle: 'Livre', requesting: 'Solicitando', locked: 'Lock',
      blocked: 'Bloqueado', timeout: 'Timeout', success: 'Sucesso'
    };
    const icons = {
      idle: '⚪', requesting: '🔵', locked: '🟢',
      blocked: '🔴', timeout: '🔴', success: '🟢'
    };

    if (letterEl) letterEl.textContent = conta.letter;
    if (saldoEl) saldoEl.textContent = `R$ ${(conta.saldoCentavos / 100).toFixed(2)}`;
    if (statusEl) statusEl.textContent = `${icons[borderState] || '⚪'} ${labels[borderState] || borderState}`;

    const saldoInicial = 100000;
    const pct = Math.max(0, Math.min(100, (conta.saldoCentavos / saldoInicial) * 100));
    if (barFillEl) barFillEl.style.width = pct + '%';
  }
}

function renderizarArrows() {
  svgLines.querySelectorAll('.arrow-line').forEach(el => el.remove());
  svgLines.querySelectorAll('.arrow-marker').forEach(el => el.remove());

  for (const [key, entry] of activeArrows) {
    const [origemId, destinoId] = key.split('-').map(Number);
    const origem = contasData.find(c => c.id === origemId);
    const destino = contasData.find(c => c.id === destinoId);
    if (!origem || !destino) continue;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', origem._x);
    line.setAttribute('y1', origem._y);
    line.setAttribute('x2', destino._x);
    line.setAttribute('y2', destino._y);
    line.classList.add('arrow-line', entry.arrowState);

    let defs = svgLines.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgLines.prepend(defs);
    }
    const markerId = `arrowhead-${key}`;
    let marker = document.getElementById(markerId);
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', markerId);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      marker.classList.add('arrow-marker');
      const colors = { requesting: '#4fc3f7', locked: '#4fc3f7', blocked: '#ef5350', timeout: '#ef5350', success: '#00e676' };
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '0 0, 10 3.5, 0 7');
      poly.setAttribute('fill', colors[entry.arrowState] || '#555');
      marker.appendChild(poly);
      defs.appendChild(marker);
    }
    line.setAttribute('marker-end', `url(#${markerId})`);
    svgLines.appendChild(line);

    // Floating value label
    const midX = (parseFloat(line.getAttribute('x1')) + parseFloat(line.getAttribute('x2'))) / 2;
    const midY = (parseFloat(line.getAttribute('y1')) + parseFloat(line.getAttribute('y2'))) / 2;

    const floatLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    floatLabel.setAttribute('x', midX);
    floatLabel.setAttribute('y', midY - 10);
    floatLabel.setAttribute('text-anchor', 'middle');
    floatLabel.classList.add('arrow-float-label');
    floatLabel.setAttribute('data-key', key);
    const concluida = transacoesConcluidas.find(t => t.origemId === origemId && t.destinoId === destinoId);
    if (concluida && entry.arrowState === 'success') {
      floatLabel.textContent = `R$ ${(concluida.valorCentavos / 100).toFixed(2)}`;
      floatLabel.classList.add('arrow-float-label--visible');
    }
    svgLines.appendChild(floatLabel);
  }
}

function atualizarStats() {
  locksAtivos.textContent = stats.locksAtivos;
  totalTransacoes.textContent = stats.transacoes;
}

// ===== Account Positioning =====
function renderizarContas(contas) {
  const rect = visualArena.getBoundingClientRect();
  const arenaWidth = rect.width - 220;
  const centerX = arenaWidth / 2 + 220;
  const centerY = rect.height / 2;
  const radius = Math.min(arenaWidth / 2, centerY) - 90;

  visualAccounts.innerHTML = '';

  contas.forEach((conta, i) => {
    const angle = (i / contas.length) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    conta._x = x;
    conta._y = y;

    const card = document.createElement('div');
    card.className = 'conta-card status-idle';
    card.id = `conta-${conta.id}`;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.innerHTML = `
      <div class="conta-letter">${conta.letter}</div>
      <div class="conta-saldo">R$ ${(conta.saldoCentavos / 100).toFixed(2)}</div>
      <div class="conta-status">Livre</div>
    `;
    visualAccounts.appendChild(card);
  });

  const bankHub = document.getElementById('visualCenter');
  if (bankHub) {
    bankHub.style.left = centerX + 'px';
    bankHub.style.top = centerY + 'px';
  }
}

// ===== Simulation Lifecycle =====
async function iniciarSimulacao() {
  const numContas = parseInt(inputNumContas.value) || 8;
  if (numContas < 5 || numContas > 15) {
    exibirFeedback('Número de contas deve ser entre 5 e 15', 'error');
    return;
  }

  const mode = document.querySelector('input[name="simMode"]:checked').value;
  const transacaoRange = mode === 'random' ? {
    min: parseInt(inputTransMin.value) || 15,
    max: parseInt(inputTransMax.value) || 40
  } : {};

  limpar();
  btnIniciar.disabled = true;
  visualStatus.textContent = 'Iniciando...';
  visualStatus.className = 'status-badge status-running';

  try {
    const token = getToken();
    const res = await fetch(`${API_URL}/simulacao/visual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ numContas, mode, transacaoRange })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ erro: 'Erro ao iniciar simulação' }));
      exibirFeedback(errData.erro || 'Erro ao iniciar simulação', 'error');
      btnIniciar.disabled = false;
      visualStatus.textContent = 'Parado';
      visualStatus.className = 'status-badge status-idle';
      return;
    }
    const data = await res.json();

    contasData = data.contas || [];
    renderizarContas(contasData);

    for (const c of contasData) {
      accountStates.set(c.id, { hubLineState: 'idle', borderState: 'idle' });
    }

    conectarSSE();
    iniciarTimer();
    btnParar.disabled = false;
    visualStatus.textContent = 'Rodando';
  } catch (e) {
    exibirFeedback('Erro de conexão: ' + e.message, 'error');
    btnIniciar.disabled = false;
    visualStatus.textContent = 'Parado';
    visualStatus.className = 'status-badge status-idle';
  }
}

async function pararSimulacao() {
  try {
    const token = getToken();
    await fetch(`${API_URL}/simulacao/visual/stop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch {}
  limpar();
  visualStatus.textContent = 'Parado';
  visualStatus.className = 'status-badge status-idle';
  btnParar.disabled = true;
  btnIniciar.disabled = false;
}

function limpar() {
  desconectarSSE();
  pararTimer();
  eventBuffer = [];
  contasData = [];
  accountStates.clear();
  activeArrows.clear();
  stats = { transacoes: 0, locksAtivos: 0 };
  transacoesEmAndamento.clear();
  transacoesConcluidas = [];
  resultadosSimulacao = null;
  inicioSimulacaoTimestamp = null;
  visualAccounts.innerHTML = '';
  svgLines.innerHTML = '';
  locksAtivos.textContent = '0';
  totalTransacoes.textContent = '0';
  btnParar.disabled = true;
  document.getElementById('resultsOverlay').hidden = true;
}

// ===== Speed Slider =====
speedSlider.addEventListener('input', () => {
  const ms = parseInt(speedSlider.value);
  speedLabel.textContent = ms + 'ms';
  configurarVelocidade(ms);
});

// ===== Transaction Log =====
const transacaoLogs = document.getElementById('transacaoLogs');
const btnLimparLogTransacoes = document.getElementById('btnLimparLogTransacoes');

btnLimparLogTransacoes.addEventListener('click', () => {
  transacoesConcluidas = [];
  renderizar();
});

// ===== Init =====
carregarUsuario();
btnLogout.addEventListener('click', redirecionarLogin);
btnIniciar.addEventListener('click', iniciarSimulacao);
btnParar.addEventListener('click', pararSimulacao);
btnLimpar.addEventListener('click', limpar);
inputNumContas.addEventListener('keydown', (e) => { if (e.key === 'Enter') iniciarSimulacao(); });
