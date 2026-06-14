/* ===============================================================
   Module 1: SSE Client — connects, pushes events to buffer
   Module 2: Event Queue + Tick Timer — buffers events, ticks
   Module 3: State Manager — account states, arrows, stats, workers
   Module 4: Renderer — hub lines, cards, arrows, workers
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
const workersAtivos = document.getElementById('workersAtivos');
const workersTotal = document.getElementById('workersTotal');
const visualArena = document.getElementById('visualArena');
const svgLines = document.getElementById('svgLines');
const visualAccounts = document.getElementById('visualAccounts');
const visualWorkers = document.getElementById('visualWorkers');
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
let workerStates = new Map();
let stats = { transacoes: 0, locksAtivos: 0 };

function processarEvento(type, data) {
  if (data.source && data.source !== 'visual') return;

  if (type === 'lock:request') {
    const { contaId, threadId } = data;
    stats.locksAtivos++;
    if (contaId) setAccountState(contaId, 'requesting');
    if (threadId) setWorkerState(threadId, 'requesting', contaId);
  }

  else if (type === 'lock:acquired') {
    const { contaId, threadId } = data;
    if (contaId) setAccountState(contaId, 'locked');
    if (threadId) setWorkerState(threadId, 'locked', contaId);
  }

  else if (type === 'lock:blocked') {
    const { contaId, threadId } = data;
    if (contaId) setAccountState(contaId, 'blocked');
    if (threadId) setWorkerState(threadId, 'blocked', contaId);
  }

  else if (type === 'lock:timeout') {
    const { contaId, threadId } = data;
    if (contaId) setAccountState(contaId, 'timeout');
    if (threadId) setWorkerState(threadId, 'timeout', contaId);
  }

  else if (type === 'lock:released') {
    const { contaId, threadId } = data;
    stats.locksAtivos = Math.max(0, stats.locksAtivos - 1);
    if (contaId) setAccountState(contaId, 'idle');
    if (threadId) setWorkerState(threadId, 'idle', null);
  }

  else if (type === 'transacao:success') {
    const { threadId } = data;
    if (threadId) setWorkerState(threadId, 'idle', null);
  }

  else if (type === 'simulacao-visual:iniciada') {
    contasData = data.contas || [];
    accountStates.clear();
    activeArrows.clear();
    workerStates.clear();
    stats = { transacoes: 0, locksAtivos: 0 };
    for (const c of contasData) {
      accountStates.set(c.id, { hubLineState: 'idle', borderState: 'idle' });
    }
    const numWorkers = data.numWorkers || 10;
    for (let i = 0; i < numWorkers; i++) {
      workerStates.set(`worker-${i}`, { state: 'idle', contaId: null });
    }
    workersTotal.textContent = numWorkers;
  }

  else if (type === 'simulacao-visual:finalizada' || type === 'simulacao-visual:parada') {
    visualStatus.textContent = type === 'simulacao-visual:finalizada' ? 'Concluída' : 'Parado';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
    pararTimer();
    for (const [id, ws] of workerStates) {
      ws.state = 'idle';
      ws.contaId = null;
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

function setWorkerState(threadId, state, contaId) {
  const ws = workerStates.get(threadId);
  if (!ws) return;
  ws.state = state;
  ws.contaId = contaId;
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
let _cachedRect = null;
let _cachedAccountCenter = null;
let _cachedWorkerCenter = null;

function renderizar() {
  const rect = visualArena.getBoundingClientRect();
  _cachedRect = rect;
  _cachedAccountCenter = { x: rect.width * 0.32, y: rect.height / 2 };
  _cachedWorkerCenter = { x: rect.width * 0.72, y: rect.height / 2 };

  positionarHubs();
  renderizarHubLines();
  renderizarCards();
  renderizarWorkerCards();
  renderizarWorkerLines();
  renderizarArrows();
  atualizarStats();
}

function positionarHubs() {
  const bankHub = document.getElementById('visualCenter');
  const workerHub = document.getElementById('visualCenterWorker');
  if (!bankHub || !workerHub || !_cachedRect) return;
  bankHub.style.left = (_cachedAccountCenter.x) + 'px';
  bankHub.style.top = (_cachedAccountCenter.y) + 'px';
  workerHub.style.left = (_cachedWorkerCenter.x) + 'px';
  workerHub.style.top = (_cachedWorkerCenter.y) + 'px';
}

function renderizarHubLines() {
  svgLines.querySelectorAll('.hub-line').forEach(el => el.remove());
  if (!_cachedAccountCenter) return;

  for (const conta of contasData) {
    const state = accountStates.get(conta.id);
    const lineState = state ? state.hubLineState : 'idle';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', _cachedAccountCenter.x);
    line.setAttribute('y1', _cachedAccountCenter.y);
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
    const statusEl = card.querySelector('.conta-status');
    const labels = { idle: 'Livre', requesting: 'Solicitando', locked: 'Lock', blocked: 'Bloqueado', timeout: 'Timeout', success: 'Sucesso' };
    statusEl.textContent = labels[borderState] || borderState;
    const saldoEl = card.querySelector('.conta-saldo');
    saldoEl.textContent = `R$ ${(conta.saldoCentavos / 100).toFixed(2)}`;
  }
}

function renderizarWorkerCards() {
  visualWorkers.innerHTML = '';
  if (!_cachedWorkerCenter) return;

  const count = workerStates.size;
  if (count === 0) return;
  const radius = 70;

  let idx = 0;
  for (const [threadId, ws] of workerStates) {
    const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
    const x = _cachedWorkerCenter.x + radius * Math.cos(angle);
    const y = _cachedWorkerCenter.y + radius * Math.sin(angle);

    const card = document.createElement('div');
    card.className = `worker-card worker-${ws.state}`;
    card.id = `worker-${threadId}`;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.title = `${threadId}: ${ws.state}`;

    const icons = { idle: '⏸️', requesting: '🔍', locked: '🔒', blocked: '⛔', timeout: '⏰' };
    card.innerHTML = `
      <div class="worker-status-icon">${icons[ws.state] || '⏸️'}</div>
      <div class="worker-id">${threadId.replace('worker-', 'W')}</div>
    `;
    visualWorkers.appendChild(card);
    idx++;
  }
}

function renderizarWorkerLines() {
  svgLines.querySelectorAll('.worker-line').forEach(el => el.remove());
  if (!_cachedWorkerCenter) return;

  for (const [threadId, ws] of workerStates) {
    if (ws.state === 'idle' || !ws.contaId) continue;

    const conta = contasData.find(c => c.id === ws.contaId);
    if (!conta || conta._x == null) continue;

    const workerNode = document.getElementById(`worker-${threadId}`);
    if (!workerNode) continue;

    const wx = parseFloat(workerNode.style.left);
    const wy = parseFloat(workerNode.style.top);
    if (isNaN(wx) || isNaN(wy)) continue;

    const lineState = ws.state === 'locked' ? 'locked' : ws.state;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', wx);
    line.setAttribute('y1', wy);
    line.setAttribute('x2', conta._x);
    line.setAttribute('y2', conta._y);
    line.classList.add('worker-line', lineState);
    svgLines.appendChild(line);
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
      const colors = { requesting: '#f0a030', locked: '#f0a030', blocked: '#dc3545', timeout: '#dc3545', success: '#28a745' };
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '0 0, 10 3.5, 0 7');
      poly.setAttribute('fill', colors[entry.arrowState] || '#555');
      marker.appendChild(poly);
      defs.appendChild(marker);
    }
    line.setAttribute('marker-end', `url(#${markerId})`);
    svgLines.appendChild(line);
  }
}

function atualizarStats() {
  locksAtivos.textContent = stats.locksAtivos;
  totalTransacoes.textContent = stats.transacoes;

  let ativos = 0;
  for (const ws of workerStates.values()) {
    if (ws.state !== 'idle') ativos++;
  }
  workersAtivos.textContent = ativos;
}

// ===== Account Positioning =====
function renderizarContas(contas) {
  const rect = visualArena.getBoundingClientRect();
  const centerX = rect.width * 0.32;
  const centerY = rect.height / 2;
  const radius = Math.min(centerX, centerY) - 90;

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
  workerStates.clear();
  stats = { transacoes: 0, locksAtivos: 0 };
  visualAccounts.innerHTML = '';
  visualWorkers.innerHTML = '';
  svgLines.innerHTML = '';
  locksAtivos.textContent = '0';
  totalTransacoes.textContent = '0';
  workersAtivos.textContent = '0';
  workersTotal.textContent = '0';
  btnParar.disabled = true;
  _cachedRect = null;
  _cachedAccountCenter = null;
  _cachedWorkerCenter = null;
}

// ===== Speed Slider =====
speedSlider.addEventListener('input', () => {
  const ms = parseInt(speedSlider.value);
  speedLabel.textContent = ms + 'ms';
  configurarVelocidade(ms);
});

// ===== Init =====
carregarUsuario();
btnLogout.addEventListener('click', redirecionarLogin);
btnIniciar.addEventListener('click', iniciarSimulacao);
btnParar.addEventListener('click', pararSimulacao);
btnLimpar.addEventListener('click', limpar);
inputNumContas.addEventListener('keydown', (e) => { if (e.key === 'Enter') iniciarSimulacao(); });
