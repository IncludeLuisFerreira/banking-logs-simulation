const userDisplay = document.getElementById('userDisplay');
const btnLogout = document.getElementById('btnLogout');
const feedback = document.getElementById('feedback');

const contasBody = document.getElementById('contasBody');
const contasEmpty = document.getElementById('contasEmpty');
const btnAddConta = document.getElementById('btnAddConta');
const inputSaldo = document.getElementById('inputSaldo');
const inputNome = document.getElementById('inputNome');

const btnIniciarSim = document.getElementById('btnIniciarSim');
const btnPararSim = document.getElementById('btnPararSim');
const simStatus = document.getElementById('simStatus');
const simTransacoes = document.getElementById('simTransacoes');
const counterLocksOk = document.getElementById('counterLocksOk');
const counterLocksBloq = document.getElementById('counterLocksBloq');
const counterTimeouts = document.getElementById('counterTimeouts');

const logsContainer = document.getElementById('logsContainer');
const btnLimparLogs = document.getElementById('btnLimparLogs');
const btnExportarLogs = document.getElementById('btnExportarLogs');

const API_URL = API_BASE_URL;
let eventSource = null;
let lockCounters = { acquired: 0, blocked: 0, timeout: 0 };

function exibirFeedback(mensagem, tipo) {
  feedback.textContent = mensagem;
  feedback.className = 'feedback';
  feedback.classList.add(`feedback--${tipo}`);
  feedback.hidden = false;
  setTimeout(() => { feedback.hidden = true; }, 4000);
}

function ocultarFeedback() {
  feedback.hidden = true;
  feedback.textContent = '';
}

function redirecionarLogin() {
  if (eventSource) eventSource.close();
  localStorage.removeItem('auth_token');
  window.location.href = '/index.html';
}

function getToken() {
  return localStorage.getItem('auth_token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  if (!res.ok) {
    if (res.status === 401) {
      exibirFeedback('Sessão expirada.', 'error');
      setTimeout(redirecionarLogin, 1500);
      return null;
    }
    const err = await res.json().catch(() => ({ erro: 'Erro desconhecido' }));
    throw new Error(err.erro || `HTTP ${res.status}`);
  }
  return res.json();
}

async function carregarUsuario() {
  const token = getToken();
  if (!token) { redirecionarLogin(); return; }

  try {
    const resposta = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resposta.ok) {
      exibirFeedback('Sessão expirada. Faça login novamente.', 'error');
      setTimeout(redirecionarLogin, 1500);
      return;
    }
    const dados = await resposta.json();
    const nome = dados.username || 'usuário';
    userDisplay.textContent = nome;
  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro);
    exibirFeedback('Erro de conexão. Redirecionando...', 'error');
    setTimeout(redirecionarLogin, 1500);
  }
}

async function carregarContas() {
  try {
    const contas = await apiFetch('/simulacao/contas');
    if (!contas) return;
    renderizarContas(contas);
  } catch (e) {
    exibirFeedback('Erro ao carregar contas: ' + e.message, 'error');
  }
}

function renderizarContas(contas) {
  contasBody.innerHTML = '';
  if (contas.length === 0) {
    contasEmpty.hidden = false;
    return;
  }
  contasEmpty.hidden = true;
  for (const c of contas) {
    const tr = document.createElement('tr');
    tr.className = c.ativa ? '' : 'inativa';
    const saldoReais = (c.saldoCentavos / 100).toFixed(2);
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.nome || '\u2014'}</td>
      <td>R$ ${saldoReais}</td>
      <td><span class="status-badge ${c.ativa ? 'status-online' : 'status-offline'}">${c.ativa ? 'Ativa' : 'Inativa'}</span></td>
      <td><button class="btn-remover" data-id="${c.id}">Remover</button></td>
    `;
    tr.querySelector('.btn-remover').addEventListener('click', () => removerConta(c.id));
    contasBody.appendChild(tr);
  }
}

async function adicionarConta() {
  const saldo = parseInt(inputSaldo.value) || 100000;
  const nome = inputNome.value.trim();
  try {
    await apiFetch('/simulacao/contas', {
      method: 'POST',
      body: JSON.stringify({ saldoInicial: saldo, nome })
    });
    inputSaldo.value = '100000';
    inputNome.value = '';
    await carregarContas();
    exibirFeedback('Conta adicionada com sucesso!', 'success');
  } catch (e) {
    exibirFeedback('Erro ao adicionar conta: ' + e.message, 'error');
  }
}

async function removerConta(id) {
  try {
    await apiFetch(`/simulacao/contas/${id}`, { method: 'DELETE' });
    await carregarContas();
    exibirFeedback(`Conta #${id} removida.`, 'success');
  } catch (e) {
    exibirFeedback('Erro ao remover conta: ' + e.message, 'error');
  }
}

async function iniciarSimulacao() {
  try {
    btnIniciarSim.disabled = true;
    const result = await apiFetch('/simulacao/stress', { method: 'POST' });
    if (!result) return;
    if (result.error) {
      exibirFeedback(result.error, 'error');
      btnIniciarSim.disabled = false;
      return;
    }
    simStatus.textContent = 'Rodando';
    simStatus.className = 'status-badge status-running';
    btnPararSim.disabled = false;
    simTransacoes.textContent = result.totalTransacoes || '0';
    lockCounters = { acquired: 0, blocked: 0, timeout: 0 };
    atualizarCounters();
  } catch (e) {
    exibirFeedback('Erro ao iniciar simulação: ' + e.message, 'error');
    btnIniciarSim.disabled = false;
  }
}

async function pararSimulacao() {
  try {
    await apiFetch('/simulacao/stop', { method: 'POST' });
    simStatus.textContent = 'Parado';
    simStatus.className = 'status-badge status-idle';
    btnPararSim.disabled = true;
    btnIniciarSim.disabled = false;
  } catch (e) {
    exibirFeedback('Erro ao parar simulação: ' + e.message, 'error');
  }
}

function conectarSSE() {
  const token = getToken();
  if (!token) return;
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`${API_URL}/simulacao/stream?token=${token}`);

  eventSource.addEventListener('connected', () => {
    adicionarLog('info', 'Conectado ao stream de eventos.');
  });

  eventSource.addEventListener('lock:acquired', (e) => {
    const data = JSON.parse(e.data);
    lockCounters.acquired++;
    atualizarCounters();
    adicionarLog('acquired', `${data.threadId} adquiriu lock conta #${data.contaId} (espera: ${data.waitTimeMs}ms)`);
  });

  eventSource.addEventListener('lock:blocked', (e) => {
    const data = JSON.parse(e.data);
    lockCounters.blocked++;
    atualizarCounters();
    adicionarLog('blocked', `${data.threadId} bloqueada aguardando conta #${data.contaId}`);
  });

  eventSource.addEventListener('lock:timeout', (e) => {
    const data = JSON.parse(e.data);
    lockCounters.timeout++;
    atualizarCounters();
    adicionarLog('timeout', `${data.threadId} timeout conta #${data.contaId} (${data.timeoutMs}ms)`);
  });

  eventSource.addEventListener('transacao:success', (e) => {
    const data = JSON.parse(e.data);
    const valorReais = (data.valorCentavos / 100).toFixed(2);
    adicionarLog('success', `${data.threadId} #${data.origemId} \u2192 #${data.destinoId}: R$ ${valorReais}`);
  });

  eventSource.addEventListener('simulacao:iniciada', (e) => {
    adicionarLog('info', `Simulação iniciada: ${JSON.parse(e.data).totalTransacoes} transações`);
  });

  eventSource.addEventListener('simulacao:finalizada', (e) => {
    adicionarLog('info', 'Simulação concluída.');
    simStatus.textContent = 'Concluída';
    simStatus.className = 'status-badge status-idle';
    btnPararSim.disabled = true;
    btnIniciarSim.disabled = false;
    exibirFeedback('Simulação concluída!', 'success');
  });

  eventSource.addEventListener('simulacao:parada', () => {
    adicionarLog('info', 'Simulação interrompida pelo usuário.');
  });

  eventSource.addEventListener('conta:adicionada', (e) => {
    const data = JSON.parse(e.data);
    adicionarLog('info', `Conta #${data.contaId} adicionada (R$ ${(data.saldoCentavos / 100).toFixed(2)})`);
    carregarContas();
  });

  eventSource.addEventListener('conta:removida', (e) => {
    const data = JSON.parse(e.data);
    adicionarLog('removed', `Conta #${data.contaId} removida do pool`);
    carregarContas();
  });

  eventSource.onerror = () => {
    adicionarLog('error', 'Conexão SSE perdida. Reconectando...');
  };
}

function adicionarLog(tipo, mensagem) {
  const placeholder = logsContainer.querySelector('.logs-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = `log-entry log-${tipo}`;
  const time = new Date().toLocaleTimeString('pt-BR');
  div.innerHTML = `<span class="log-time">${time}</span> <span class="log-msg">${mensagem}</span>`;
  logsContainer.appendChild(div);

  while (logsContainer.children.length > 500) {
    logsContainer.removeChild(logsContainer.firstChild);
  }
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function limparLogs() {
  logsContainer.innerHTML = '<p class="logs-placeholder">Logs limpos.</p>';
}

function exportarLogs() {
  const linhas = [];
  for (const child of logsContainer.children) {
    if (child.classList.contains('log-entry')) {
      const time = child.querySelector('.log-time')?.textContent || '';
      const msg = child.querySelector('.log-msg')?.textContent || '';
      linhas.push(`[${time}] ${msg}`);
    }
  }
  if (linhas.length === 0) {
    exibirFeedback('Nenhum log para exportar.', 'error');
    return;
  }
  const blob = new Blob([linhas.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `logs-simulacao-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function atualizarCounters() {
  counterLocksOk.textContent = lockCounters.acquired;
  counterLocksBloq.textContent = lockCounters.blocked;
  counterTimeouts.textContent = lockCounters.timeout;
}

btnLogout.addEventListener('click', redirecionarLogin);
btnAddConta.addEventListener('click', adicionarConta);
btnIniciarSim.addEventListener('click', iniciarSimulacao);
btnPararSim.addEventListener('click', pararSimulacao);
btnLimparLogs.addEventListener('click', limparLogs);
btnExportarLogs.addEventListener('click', exportarLogs);

inputSaldo.addEventListener('keydown', (e) => { if (e.key === 'Enter') adicionarConta(); });
inputNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') adicionarConta(); });

carregarUsuario();
carregarContas();
conectarSSE();
