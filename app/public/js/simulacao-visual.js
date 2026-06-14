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

// ===== Particle System =====
const particlesCanvas = document.getElementById('particlesCanvas');
const pCtx = particlesCanvas ? particlesCanvas.getContext('2d') : null;
let particles = [];
let particleAnimId = null;

function initParticles() {
  if (!pCtx) return;
  particlesCanvas.width = window.innerWidth;
  particlesCanvas.height = window.innerHeight;
  particles = [];
  const count = 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * particlesCanvas.width,
      y: Math.random() * particlesCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.1 - Math.random() * 0.2,
      r: 1 + Math.random() * 2,
      o: 0.1 + Math.random() * 0.2
    });
  }
  particleAnimId = requestAnimationFrame(animateParticles);
}

function animateParticles() {
  if (!pCtx) return;
  pCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -5) { p.y = particlesCanvas.height + 5; p.x = Math.random() * particlesCanvas.width; }
    if (p.x < -5) p.x = particlesCanvas.width + 5;
    if (p.x > particlesCanvas.width + 5) p.x = -5;

    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fillStyle = `rgba(0, 212, 255, ${p.o})`;
    pCtx.fill();
  }

  particleAnimId = requestAnimationFrame(animateParticles);
}

function resizeParticles() {
  if (!particlesCanvas) return;
  particlesCanvas.width = window.innerWidth;
  particlesCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeParticles);

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

  const eventTypes = ['transacao:lendo_origem', 'transacao:conflito', 'transacao:debitado', 'transacao:success', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada'];

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
let stats = { transacoes: 0, locksAtivos: 0, contecoes: 0 };
let transacoesEmAndamento = new Map();
let transacoesConcluidas = [];
let resultadosSimulacao = null;
let inicioSimulacaoTimestamp = null;

function processarEvento(type, data) {
  if (data.source && data.source !== 'visual') return;

  if (type === 'transacao:lendo_origem') {
    const { origemId, destinoId } = data;
    if (origemId) setAccountState(origemId, 'reading');
    if (destinoId) setAccountState(destinoId, 'reading');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      if (!transacoesEmAndamento.has(key)) {
        transacoesEmAndamento.set(key, { origemId, destinoId, inicioTimestamp: Date.now() });
      }
      setArrowState(key, 'reading');
    }
    atualizarTransacoesAtivas();
  }

  else if (type === 'transacao:debitado') {
    const { origemId, destinoId } = data;
    if (origemId) setAccountState(origemId, 'locked');
    if (destinoId) setAccountState(destinoId, 'locked');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      setArrowState(key, 'locked');
    }
    atualizarTransacoesAtivas();
  }

  else if (type === 'transacao:conflito') {
    const { origemId, destinoId } = data;
    stats.contecoes++;
    if (origemId) setAccountState(origemId, 'conflito');
    if (destinoId) setAccountState(destinoId, 'conflito');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      setArrowState(key, 'conflito');
      setTimeout(() => {
        removeArrow(key);
        if (origemId) setAccountState(origemId, 'idle');
        if (destinoId) setAccountState(destinoId, 'idle');
        atualizarTransacoesAtivas();
        renderizar();
      }, 800);
    }
    atualizarTransacoesAtivas();
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
    if (origemId) setAccountState(origemId, 'success');
    if (destinoId) setAccountState(destinoId, 'success');

    setTimeout(() => {
      removeArrow(key);
      if (origemId) setAccountState(origemId, 'idle');
      if (destinoId) setAccountState(destinoId, 'idle');
      atualizarTransacoesAtivas();
      renderizar();
    }, 1500);
  }

  else if (type === 'simulacao-visual:iniciada') {
    contasData = data.contas || [];
    accountStates.clear();
    activeArrows.clear();
    transacoesEmAndamento.clear();
    transacoesConcluidas = [];
    resultadosSimulacao = null;
    inicioSimulacaoTimestamp = Date.now();
    stats = { transacoes: 0, locksAtivos: 0, contecoes: 0 };
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

function atualizarTransacoesAtivas() {
  let count = 0;
  for (const [, state] of accountStates) {
    if (state.hubLineState !== 'idle' && state.hubLineState !== 'success') count++;
  }
  stats.locksAtivos = count;
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

    const letterEl = card.querySelector('.conta-letter');
    const saldoEl = card.querySelector('.conta-saldo');
    const barFillEl = card.querySelector('.conta-bar-fill');
    const statusEl = card.querySelector('.conta-status');

    const labels = {
      idle: 'Livre', reading: 'Lendo', locked: 'Debitando',
      conflito: 'Conflito', success: 'Sucesso'
    };
    const icons = {
      idle: '⚪', reading: '🔵', locked: '🟢',
      conflito: '⚡', success: '✅'
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
      const colors = { reading: '#4fc3f7', locked: '#4fc3f7', conflito: '#ff6d00', success: '#00e676' };
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
  const contencaoEl = document.getElementById('totalContencoes');
  if (contencaoEl) contencaoEl.textContent = stats.contecoes;
}

// ===== Results Overlay =====
function mostrarResultados(r) {
  const overlay = document.getElementById('resultsOverlay');
  if (!overlay) return;

  document.getElementById('resultsTotal').textContent = r.total;
  document.getElementById('resultsSucesso').textContent = r.sucesso;
  document.getElementById('resultsContencao').textContent = r.contencao + '%';
  document.getElementById('resultsDuracao').textContent = r.duracao + 's';

  overlay.hidden = false;
  overlay.style.display = 'flex';

  animarNumeros('resultsTotal', 0, r.total, 800);
  animarNumeros('resultsSucesso', 0, r.sucesso, 800);
  animarNumeros('resultsContencao', 0, r.contencao, 800);
  animarNumeros('resultsDuracao', 0, r.duracao, 800);
}

function animarNumeros(elementId, start, end, duration) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    const suffixes = { resultsContencao: '%', resultsDuracao: 's' };
    el.textContent = current + (suffixes[elementId] || '');
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
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
      <div class="conta-bar"><div class="conta-bar-fill" style="width:100%"></div></div>
      <div class="conta-status">⚪ Livre</div>
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
  stats = { transacoes: 0, locksAtivos: 0, contecoes: 0 };
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
  document.getElementById('resultsOverlay').style.display = '';
}

// ===== Speed Slider =====
speedSlider.addEventListener('input', () => {
  const ms = parseInt(speedSlider.value);
  speedLabel.textContent = ms + 'ms';
  configurarVelocidade(ms);
});

// ===== Panel Clear =====
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

document.getElementById('btnNovaSimulacao').addEventListener('click', () => {
  document.getElementById('resultsOverlay').hidden = true;
  document.getElementById('resultsOverlay').style.display = '';
});

initParticles();
