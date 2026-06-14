# Simulação Otimista (MVCC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mutex-based locking with optimistic concurrency control (OCC/MVCC) in the visual banking simulation

**Architecture:** Remove Mutex from Conta model, use version-based optimistic locking. Workers check account version before modifying; if version changed, transaction retries. Events emit transaction lifecycle instead of lock states.

**Tech Stack:** Node.js, Express, Server-Sent Events, vanilla JS frontend

---

### Task 1: Refactor Conta.js — Remove Mutex, Add OCC

**Files:**
- Modify: `app/src/model/Conta.js`

- [ ] **Replace Conta.js with OCC version**

Write the following:

```javascript
class Conta {
  constructor(id, saldoInicialCentavos) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.version = 0;
    this.ativa = true;
  }

  getSaldoCentavos() {
    return this.saldoCentavos;
  }

  sacar(valorCentavos, versaoEsperada) {
    if (!this.ativa) return { success: false, reason: 'inactive' };
    if (this.version !== versaoEsperada) return { success: false, reason: 'conflict' };
    if (this.saldoCentavos < valorCentavos) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    this.version++;
    return { success: true };
  }

  depositar(valorCentavos) {
    if (!this.ativa) return false;
    this.saldoCentavos += valorCentavos;
    this.version++;
    return true;
  }

  getId() {
    return this.id;
  }

  remover() {
    this.ativa = false;
  }
}

module.exports = Conta;
```

- [ ] **Commit**

```
git add app/src/model/Conta.js
git commit -m "refactor(conta): replace mutex with version-based OCC"
```

---

### Task 2: Refactor LockLogger.js — Remove mutex listeners, emit transaction events

**Files:**
- Modify: `app/src/services/LockLogger.js`

- [ ] **Remove conta.mutex event wiring, add direct event emission support**

Replace `connectConta` and `disconnectConta` with a simple `emitEvent` helper. Remove all `conta.mutex.on(...)` references.

```javascript
const EventEmitter = require('events');

class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.size = 0;
    this.head = 0;
  }
  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }
  forEach(fn) {
    const start = this.size < this.capacity ? 0 : this.head;
    const count = this.size < this.capacity ? this.size : this.capacity;
    for (let i = 0; i < count; i++) fn(this.buffer[(start + i) % this.capacity]);
  }
}

class LockLogger extends EventEmitter {
  constructor(capacity = 500) {
    super();
    this.buffer = new RingBuffer(capacity);
    this.clients = new Set();
  }

  onEvent(type, data) {
    const entry = { type, data, timestamp: Date.now() };
    this.buffer.push(entry);
    this.emit('log', entry);
    this._broadcast(entry);
  }

  _broadcast(entry) {
    const payload = `event: ${entry.type}\ndata: ${JSON.stringify(entry.data)}\n\n`;
    for (const res of this.clients) {
      try { res.write(payload); } catch { this.clients.delete(res); }
    }
  }

  addClient(res) {
    this.clients.add(res);
    res.on('error', () => this.clients.delete(res));
    res.on('close', () => this.clients.delete(res));
    this.buffer.forEach((entry) => {
      try {
        const payload = `event: ${entry.type}\ndata: ${JSON.stringify(entry.data)}\n\n`;
        res.write(payload);
      } catch {}
    });
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  emitEvent(type, data) {
    this.onEvent(type, data);
  }
}

module.exports = LockLogger;
```

- [ ] **Commit**

```
git add app/src/services/LockLogger.js
git commit -m "refactor(locklogger): remove mutex wiring, add generic emitEvent"
```

---

### Task 3: Refactor GerenciadorTransacoes.js — OCC logic, conflict state, new events

**Files:**
- Modify: `app/src/services/GerenciadorTransacoes.js`

- [ ] **Add CONFLICT state and OCC in executar()**

Add `CONFLICT` to STATES and rewrite `executar()`:

```javascript
const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  CONFLICT: 'CONFLICT',
  INTERRUPTED: 'INTERRUPTED'
};
```

Replace the `executar` method:

```javascript
async executar(t, threadId = 'unknown') {
  const c1 = t.getOrigem();
  const c2 = t.getDestino();

  if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;

  const context = { threadId, origemId: t.getOrigem().getId(), destinoId: t.getDestino().getId() };

  // Read current version (snapshot)
  const v1 = c1.version;

  // Emit: reading origin
  if (this.lockLogger) {
    this.lockLogger.emitEvent('transacao:lendo_origem', {
      ...context,
      version: v1,
      timestamp: Date.now()
    });
  }

  // Wait if configured
  if (this.workerDelayMs > 0) {
    await new Promise(r => setTimeout(r, this.workerDelayMs));
  }

  // Attempt atomic debit from origin with version check
  const result = c1.sacar(t.getValorCentavos(), v1);

  if (!result.success) {
    if (result.reason === 'conflict') {
      if (this.lockLogger) {
        this.lockLogger.emitEvent('transacao:conflito', {
          ...context,
          versionEsperada: v1,
          versionAtual: c1.version,
          timestamp: Date.now()
        });
      }
      return STATES.CONFLICT;
    }
    if (result.reason === 'insufficient_funds') return STATES.INSUFICIENT_FUNDS;
    return STATES.INTERRUPTED;
  }

  // Emit: debit successful
  if (this.lockLogger) {
    this.lockLogger.emitEvent('transacao:debitado', {
      ...context,
      valorCentavos: t.getValorCentavos(),
      newVersion: c1.version,
      timestamp: Date.now()
    });
  }

  // Credit destination
  if (!c2.depositar(t.getValorCentavos())) {
    // Rollback: restore origin
    c1.depositar(t.getValorCentavos());
    return STATES.INTERRUPTED;
  }

  return STATES.SUCCESS;
}
```

Update `processarTransacao` switch to handle CONFLICT:

```javascript
case STATES.CONFLICT:
  this.relatorio.incrementaTentativasLocks();
  this.adicionarTransacao(task);
  break;
```

- [ ] **Commit**

```
git add app/src/services/GerenciadorTransacoes.js
git commit -m "feat(gerenciador): add OCC with conflict detection and retry"
```

---

### Task 4: Update SimulacaoVisualService.js — new event types

**Files:**
- Modify: `app/src/services/SimulacaoVisualService.js`

- [ ] **Add new event `transacao:lendo_origem` emission in the simulation**

Update `_gerarTransacoesNxN()` and `_gerarTransacoesAleatorio()` — no changes needed for generation logic.

The `gerenciador.executar` already emits events. Just ensure `this.lockLogger.emitEvent` is used in gerenciador (already done in Task 3).

- [ ] **Commit**

```
git add app/src/services/SimulacaoVisualService.js
git commit -m "chore: no changes needed, events emitted from gerenciador"
```

---

### Task 5: Add CSS for new visual states (conflict, reading, retry)

**Files:**
- Modify: `app/public/css/simulacao-visual.css`

- [ ] **Add .conflito state styles for cards, hub-lines, and arrow-lines**

Add before `.arrow-float-label`:

```css
/* --- OCC States --- */
.conta-card.status-conflito {
  border-color: #ff6d00;
  box-shadow: 0 0 20px rgba(255, 109, 0, 0.5);
  animation: pulse-conflito 0.5s ease-in-out 3;
}
.conta-card.status-conflito .conta-letter {
  background: rgba(255, 109, 0, 0.3);
  color: #ffab40;
}
.conta-card.status-conflito .conta-status {
  background: rgba(255, 109, 0, 0.25);
  color: #ffab40;
}

.conta-card.status-reading {
  border-color: #4fc3f7;
  box-shadow: 0 0 12px rgba(79, 195, 247, 0.2);
}
.conta-card.status-reading .conta-letter {
  background: rgba(79, 195, 247, 0.15);
  color: #4fc3f7;
}
.conta-card.status-reading .conta-status {
  background: rgba(79, 195, 247, 0.15);
  color: #4fc3f7;
}

.hub-line.conflito,
.hub-line.conflict {
  stroke: #ff6d00;
  stroke-dasharray: 4 4;
  animation: dash-move 0.4s linear infinite;
}

.hub-line.reading {
  stroke: #4fc3f7;
  stroke-dasharray: 6 4;
  animation: dash-move 0.8s linear infinite;
}

.arrow-line.conflito,
.arrow-line.conflict {
  stroke: #ff6d00;
  stroke-dasharray: 4 4;
  animation: dash-move 0.4s linear infinite;
}

.arrow-line.reading {
  stroke: #4fc3f7;
  stroke-dasharray: 6 4;
  animation: dash-move 0.8s linear infinite;
}

@keyframes pulse-conflito {
  0%, 100% { box-shadow: 0 0 12px rgba(255, 109, 0, 0.3); }
  50% { box-shadow: 0 0 28px rgba(255, 109, 0, 0.6); }
}

/* Contention counter */
.contencao-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  background: rgba(255, 109, 0, 0.15);
  color: #ffab40;
  border: 1px solid rgba(255, 109, 0, 0.2);
}
```

Update the `.hub-line` and `.arrow-line` default classes to include `.reading`:

Replace the legend dots section:

```css
.legend-dot.requesting { background: #4fc3f7; }
.legend-dot.locked { background: #00e676; }
.legend-dot.blocked { background: #ef5350; }
.legend-dot.idle { background: rgba(85, 102, 119, 0.4); }
```

With:

```css
.legend-dot.reading { background: #4fc3f7; }
.legend-dot.locked { background: #00e676; }
.legend-dot.conflito { background: #ff6d00; }
.legend-dot.idle { background: rgba(85, 102, 119, 0.4); }
```

- [ ] **Commit**

```
git add app/public/css/simulacao-visual.css
git commit -m "style: add CSS for conflict/reading OCC states"
```

---

### Task 6: Update simulacao-visual.html — new legend, contention counter

**Files:**
- Modify: `app/public/html/simulacao-visual.html`

- [ ] **Update legend and add contention counter to center stats**

Change the legend section:

```html
<div class="visual-legend">
  <span class="legend-item"><span class="legend-dot reading"></span> Lendo</span>
  <span class="legend-item"><span class="legend-dot locked"></span> Debitando</span>
  <span class="legend-item"><span class="legend-dot conflito"></span> Conflito</span>
  <span class="legend-item"><span class="legend-dot idle"></span> Livre</span>
</div>
```

Replace the center stats:

```html
<div class="center-stats">
  <span>Transferências: <strong id="totalTransacoes">0</strong></span>
  <span>Locks ativos: <strong id="locksAtivos">0</strong></span>
</div>
```

With:

```html
<div class="center-stats">
  <span>Transferências: <strong id="totalTransacoes">0</strong></span>
  <span>Transações ativas: <strong id="locksAtivos">0</strong></span>
  <span>Contenções: <strong id="totalContencoes" style="color:#ffab40">0</strong></span>
</div>
```

- [ ] **Commit**

```
git add app/public/html/simulacao-visual.html
git commit -m "feat(html): update legend and add contention counter"
```

---

### Task 7: Update simulacao-visual.js — OCC event handling, remove lock events

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Replace SSE event types list**

Change the eventTypes array from:

```javascript
const eventTypes = ['lock:request', 'lock:acquired', 'lock:blocked', 'lock:timeout', 'lock:released', 'transacao:success', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada'];
```

To:

```javascript
const eventTypes = ['transacao:lendo_origem', 'transacao:conflito', 'transacao:debitado', 'transacao:success', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada'];
```

- [ ] **Add contention counter to stats**

Change initial stats to include contecoes:

```javascript
let stats = { transacoes: 0, locksAtivos: 0, contecoes: 0 };
```

- [ ] **Replace processarEvento's lock events with OCC events**

Replace the entire `processarEvento` function body with:

```javascript
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
    const { origemId, destinoId, valorCentavos, newVersion } = data;
    if (origemId) setAccountState(origemId, 'locked');
    if (destinoId) setAccountState(destinoId, 'locked');

    if (origemId && destinoId) {
      const key = `${origemId}-${destinoId}`;
      setArrowState(key, 'locked');
    }
    atualizarTransacoesAtivas();
  }

  else if (type === 'transacao:conflito') {
    const { origemId, destinoId, versionEsperada, versionAtual } = data;
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
```

- [ ] **Replace `atualizarLocksAtivos` with `atualizarTransacoesAtivas`**

```javascript
function atualizarTransacoesAtivas() {
  let count = 0;
  for (const [, state] of accountStates) {
    if (state.hubLineState !== 'idle' && state.hubLineState !== 'success') count++;
  }
  stats.locksAtivos = count;
}
```

- [ ] **Update `atualizarStats` to show contecoes**

```javascript
function atualizarStats() {
  locksAtivos.textContent = stats.locksAtivos;
  totalTransacoes.textContent = stats.transacoes;
  const contencaoEl = document.getElementById('totalContencoes');
  if (contencaoEl) contencaoEl.textContent = stats.contecoes;
}
```

- [ ] **Update `renderizarCards` to handle 'conflito' and 'reading' states**

In the labels and icons objects:

```javascript
const labels = {
  idle: 'Livre', reading: 'Lendo', locked: 'Debitando',
  conflito: 'Conflito', success: 'Sucesso'
};
const icons = {
  idle: '⚪', reading: '🔵', locked: '🟢',
  conflito: '⚡', success: '✅'
};
```

- [ ] **Update `conectarSSE` eventTypes to remove lock events**

```javascript
const eventTypes = ['transacao:lendo_origem', 'transacao:conflito', 'transacao:debitado', 'transacao:success', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada'];
```

- [ ] **Commit**

```
git add app/public/js/simulacao-visual.js
git commit -m "feat(visual-js): OCC event handling, contention tracking, remove lock events"
```
