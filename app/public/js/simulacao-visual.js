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

const API_URL = API_BASE_URL;
let eventSource = null;
let contasData = [];
let locksAtivosCount = 0;
let transacoesCount = 0;
let activeLines = new Map();

function getToken() {
  return localStorage.getItem('auth_token');
}

function redirecionarLogin() {
  if (eventSource) eventSource.close();
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
  } catch {
    redirecionarLogin();
  }
}

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
  setTimeout(() => { feedback.hidden = true; }, 4000);
}

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
    const data = await res.json();
    if (!res.ok) {
      exibirFeedback(data.erro || 'Erro ao iniciar simulação', 'error');
      btnIniciar.disabled = false;
      visualStatus.textContent = 'Parado';
      visualStatus.className = 'status-badge status-idle';
      return;
    }

    contasData = data.contas || [];
    renderizarContas(contasData);
    conectarSSE();
    btnParar.disabled = false;
    visualStatus.textContent = 'Rodando';
  } catch (e) {
    exibirFeedback('Erro de conexão: ' + e.message, 'error');
    btnIniciar.disabled = false;
    visualStatus.textContent = 'Parado';
    visualStatus.className = 'status-badge status-idle';
  }
}

function renderizarContas(contas) {
  const rect = visualArena.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const radius = Math.min(centerX, centerY) - 90;

  visualAccounts.innerHTML = '';
  svgLines.innerHTML = '';

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

function desenharSeta(origemId, destinoId, state) {
  const key = `${origemId}-${destinoId}`;
  if (activeLines.has(key)) return;

  const origem = contasData.find(c => c.id === origemId);
  const destino = contasData.find(c => c.id === destinoId);
  if (!origem || !destino) return;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', origem._x);
  line.setAttribute('y1', origem._y);
  line.setAttribute('x2', destino._x);
  line.setAttribute('y2', destino._y);
  line.classList.add('arrow-line', state);

  const color = state === 'requesting' ? '#f0a030' : state === 'locked' ? '#28a745' : '#dc3545';

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
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0, 10 3.5, 0 7');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    defs.appendChild(marker);
  }
  line.setAttribute('marker-end', `url(#${markerId})`);

  svgLines.appendChild(line);
  activeLines.set(key, { line });
}

function removerSeta(origemId, destinoId) {
  const key = `${origemId}-${destinoId}`;
  const entry = activeLines.get(key);
  if (!entry) return;
  entry.line.remove();
  const marker = document.getElementById(`arrowhead-${key}`);
  if (marker) marker.remove();
  activeLines.delete(key);
}

function conectarSSE() {
  if (eventSource) eventSource.close();
  const token = getToken();
  if (!token) return;

  eventSource = new EventSource(`${API_URL}/simulacao/stream?token=${token}`);

  eventSource.addEventListener('lock:request', (e) => {
    atualizarConta(e, 'requesting');
  });

  eventSource.addEventListener('lock:acquired', (e) => {
    atualizarConta(e, 'locked');
  });

  eventSource.addEventListener('lock:blocked', (e) => {
    atualizarConta(e, 'blocked');
  });

  eventSource.addEventListener('lock:timeout', (e) => {
    atualizarConta(e, 'timeout');
  });

  eventSource.addEventListener('lock:released', () => {
    locksAtivosCount = Math.max(0, locksAtivosCount - 1);
    locksAtivos.textContent = locksAtivosCount;
  });

  eventSource.addEventListener('transacao:success', (e) => {
    const data = JSON.parse(e.data);
    if (data.source !== 'visual') return;
    transacoesCount++;
    totalTransacoes.textContent = transacoesCount;
    removerSeta(data.origemId, data.destinoId);
    const contaOrigem = contasData.find(c => c.id === data.origemId);
    const contaDestino = contasData.find(c => c.id === data.destinoId);
    if (contaOrigem) { contaOrigem.saldoCentavos -= data.valorCentavos; atualizarSaldo(contaOrigem); }
    if (contaDestino) { contaDestino.saldoCentavos += data.valorCentavos; atualizarSaldo(contaDestino); }
    atualizarStatusConta(data.origemId, 'idle');
    atualizarStatusConta(data.destinoId, 'idle');
  });

  eventSource.addEventListener('simulacao-visual:iniciada', () => {});

  eventSource.addEventListener('simulacao-visual:finalizada', () => {
    visualStatus.textContent = 'Concluída';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
  });

  eventSource.addEventListener('simulacao-visual:parada', () => {
    visualStatus.textContent = 'Parado';
    visualStatus.className = 'status-badge status-idle';
    btnParar.disabled = true;
    btnIniciar.disabled = false;
  });

  eventSource.onerror = () => {
    exibirFeedback('Conexão perdida. Reconectando...', 'error');
  };
}

function atualizarConta(e, state) {
  const data = JSON.parse(e.data);
  if (data.source !== 'visual') return;

  const { origemId, destinoId } = data;

  if (state === 'requesting') {
    locksAtivosCount++;
    locksAtivos.textContent = locksAtivosCount;
    desenharSeta(origemId, destinoId, 'requesting');
    atualizarStatusConta(origemId, 'requesting');
  } else if (state === 'locked') {
    removerSeta(origemId, destinoId);
    desenharSeta(origemId, destinoId, 'locked');
    atualizarStatusConta(origemId, 'locked');
  } else if (state === 'blocked' || state === 'timeout') {
    removerSeta(origemId, destinoId);
    desenharSeta(origemId, destinoId, state);
    atualizarStatusConta(origemId, state);
  }
}

function atualizarStatusConta(contaId, status) {
  const card = document.getElementById(`conta-${contaId}`);
  if (!card) return;
  card.className = `conta-card status-${status}`;
  const statusEl = card.querySelector('.conta-status');
  const labels = { idle: 'Livre', requesting: '🔒 Solicitando', locked: '🔓 Lock', blocked: '⛔ Bloqueado', timeout: '⏰ Timeout' };
  statusEl.textContent = labels[status] || status;
}

function atualizarSaldo(conta) {
  const card = document.getElementById(`conta-${conta.id}`);
  if (!card) return;
  const saldoEl = card.querySelector('.conta-saldo');
  saldoEl.textContent = `R$ ${(conta.saldoCentavos / 100).toFixed(2)}`;
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
  if (eventSource) { eventSource.close(); eventSource = null; }
  visualAccounts.innerHTML = '';
  svgLines.innerHTML = '';
  activeLines.clear();
  locksAtivosCount = 0;
  transacoesCount = 0;
  locksAtivos.textContent = '0';
  totalTransacoes.textContent = '0';
  contasData = [];
  btnParar.disabled = true;
}

carregarUsuario();
btnLogout.addEventListener('click', redirecionarLogin);
btnIniciar.addEventListener('click', iniciarSimulacao);
btnParar.addEventListener('click', pararSimulacao);
btnLimpar.addEventListener('click', limpar);
inputNumContas.addEventListener('keydown', (e) => { if (e.key === 'Enter') iniciarSimulacao(); });
