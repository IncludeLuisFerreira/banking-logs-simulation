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

function processarEvento(type, data) {
  if (data.source !== 'visual') return;

  if (type === 'lock:request') {
    const { contaId, origemId, destinoId } = data;
    stats.locksAtivos++;
    if (contaId) setAccountState(contaId, 'requesting');
    if (origemId && destinoId) setArrowState(`${origemId}-${destinoId}`, 'requesting');
  }

  else if (type === 'lock:acquired') {
    const { contaId } = data;
    if (contaId) setAccountState(contaId, 'locked');
  }

  else if (type === 'lock:blocked' || type === 'lock:timeout') {
    const { contaId, origemId, destinoId } = data;
    const shortType = type === 'lock:blocked' ? 'blocked' : 'timeout';
    if (contaId) setAccountState(contaId, shortType);
    if (origemId && destinoId) setArrowState(`${origemId}-${destinoId}`, shortType);
  }

  else if (type === 'lock:released') {
    const { contaId, origemId, destinoId } = data;
    stats.locksAtivos = Math.max(0, stats.locksAtivos - 1);
    if (contaId) setAccountState(contaId, 'idle');
    // Clean up arrows in non-success state on release
    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      const arrow = activeArrows.get(key);
      if (arrow && arrow.arrowState !== 'success') {
        removeArrow(key);
      }
    }
  }

  else if (type === 'transacao:success') {
    const { origemId, destinoId, valorCentavos } = data;
    stats.transacoes++;
    const key = `${origemId}-${destinoId}`;

    const contaOrigem = contasData.find(c => c.id === origemId);
    const contaDestino = contasData.find(c => c.id === destinoId);
    if (contaOrigem) contaOrigem.saldoCentavos -= valorCentavos;
    if (contaDestino) contaDestino.saldoCentavos += valorCentavos;

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
    accountStates.clear();
    activeArrows.clear();
    stats = { transacoes: 0, locksAtivos: 0 };
    for (const c of contasData) {
      accountStates.set(c.id, { hubLineState: 'idle', borderState: 'idle' });
    }
  }

  else if (type === 'simulacao-visual:finalizada' || type === 'simulacao-visual:parada') {
    visualStatus.textContent = type === 'simulacao-visual:finalizada' ? 'Concluída' : 'Parado';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
    pararTimer();
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
function renderizar() {
  renderizarHubLines();
  renderizarCards();
  renderizarArrows();
  atualizarStats();
}

function renderizarHubLines() {
  svgLines.querySelectorAll('.hub-line').forEach(el => el.remove());

  const rect = visualArena.getBoundingClientRect();
  const centerX = rect.width / 2;
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
    const statusEl = card.querySelector('.conta-status');
    const labels = { idle: 'Livre', requesting: 'Solicitando', locked: 'Lock', blocked: 'Bloqueado', timeout: 'Timeout', success: 'Sucesso' };
    statusEl.textContent = labels[borderState] || borderState;
    const saldoEl = card.querySelector('.conta-saldo');
    saldoEl.textContent = `R$ ${(conta.saldoCentavos / 100).toFixed(2)}`;
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
}

// ===== Account Positioning =====
function renderizarContas(contas) {
  const rect = visualArena.getBoundingClientRect();
  const centerX = rect.width / 2;
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
      body: JSON.stringify({ numContas })
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
  visualAccounts.innerHTML = '';
  svgLines.innerHTML = '';
  locksAtivos.textContent = '0';
  totalTransacoes.textContent = '0';
  btnParar.disabled = true;
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
