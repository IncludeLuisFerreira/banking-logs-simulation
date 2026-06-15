# Modo Caos & Detecção de Deadlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a force-deadlock educational mode with Wait-For Graph cycle detection, SSE broadcast, and a custom deadlock overlay in the visual simulation UI.

**Architecture:** New `DeadlockDetector` class in `concurrency/` with explicit hook API. `GerenciadorTransacoes` integrates detector calls into `_executarLockNaive()`. `SimulacaoVisualService` generates N-transaction cycles. Frontend listens for new SSE event and shows expanded overlay modal.

**Tech Stack:** Node.js, Express 5, vanilla JS, Jest

---

### Task 1: Create DeadlockDetector class with tests

**Files:**
- Create: `app/src/concurrency/DeadlockDetector.js`
- Create: `app/__tests__/DeadlockDetector.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const DeadlockDetector = require('../src/concurrency/DeadlockDetector');

describe('DeadlockDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DeadlockDetector();
  });

  describe('acquireHold and releaseHold', () => {
    it('should record a hold', () => {
      detector.acquireHold(1, 10);
      detector.registerWait(1, 20);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should clear hold on release', () => {
      detector.acquireHold(1, 10);
      detector.releaseHold(10);
      detector.registerWait(2, 10);
      expect(detector.checkDeadlock(2)).toBeNull();
    });
  });

  describe('registerWait and releaseWait', () => {
    it('should clear wait on release', () => {
      detector.registerWait(1, 10);
      detector.releaseWait(1);
      expect(detector.checkDeadlock(1)).toBeNull();
    });
  });

  describe('checkDeadlock', () => {
    it('should return null when no deadlock exists (broken chain)', () => {
      detector.registerWait(1, 10);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should return null when hold exists but holder is not waiting', () => {
      detector.acquireHold(2, 10);
      detector.registerWait(1, 10);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should detect a 2-transaction deadlock cycle', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.registerWait(1, 20);

      const result = detector.checkDeadlock(1);
      expect(result).not.toBeNull();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ transacaoId: 1, contaId: 20 });
      expect(result[1]).toEqual({ transacaoId: 2, contaId: 10 });
    });

    it('should detect a 3-transaction deadlock cycle', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.acquireHold(3, 30);
      detector.registerWait(1, 20);
      detector.registerWait(2, 30);
      detector.registerWait(3, 10);

      const result = detector.checkDeadlock(1);
      expect(result).not.toBeNull();
      expect(result.length).toBe(3);
      expect(result[0]).toEqual({ transacaoId: 1, contaId: 20 });
      expect(result[1]).toEqual({ transacaoId: 2, contaId: 30 });
      expect(result[2]).toEqual({ transacaoId: 3, contaId: 10 });
    });

    it('should detect cycle starting from any node', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.acquireHold(3, 30);
      detector.registerWait(1, 20);
      detector.registerWait(2, 30);
      detector.registerWait(3, 10);

      const result = detector.checkDeadlock(2);
      expect(result).not.toBeNull();
      expect(result.length).toBe(3);
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      detector.acquireHold(1, 10);
      detector.registerWait(2, 20);
      detector.clear();

      detector.registerWait(3, 10);
      expect(detector.checkDeadlock(3)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest __tests__/DeadlockDetector.test.js --verbose`
Expected: All 8 tests FAIL with "DeadlockDetector is not a constructor"

- [ ] **Step 3: Write DeadlockDetector.js**

```js
class DeadlockDetector {
  constructor() {
    this.holds = new Map();
    this.waitingFor = new Map();
  }

  acquireHold(transacaoId, contaId) {
    this.holds.set(contaId, transacaoId);
  }

  releaseHold(contaId) {
    this.holds.delete(contaId);
  }

  registerWait(transacaoId, contaId) {
    this.waitingFor.set(transacaoId, contaId);
  }

  releaseWait(transacaoId) {
    this.waitingFor.delete(transacaoId);
  }

  checkDeadlock(startTransacaoId) {
    const visited = new Set();
    let current = startTransacaoId;
    const path = [];

    while (!visited.has(current)) {
      visited.add(current);
      const wantedConta = this.waitingFor.get(current);
      if (wantedConta === undefined) return null;

      const holderTransacao = this.holds.get(wantedConta);
      if (holderTransacao === undefined) return null;

      path.push({ transacaoId: current, contaId: wantedConta });
      current = holderTransacao;
    }

    const cycleStart = path.findIndex(p => p.transacaoId === current);
    if (cycleStart === -1) return null;
    return path.slice(cycleStart);
  }

  clear() {
    this.holds.clear();
    this.waitingFor.clear();
  }
}

module.exports = DeadlockDetector;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest __tests__/DeadlockDetector.test.js --verbose`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/concurrency/DeadlockDetector.js app/__tests__/DeadlockDetector.test.js
git commit -m "feat: add DeadlockDetector with Wait-For Graph and DFS cycle detection"
```

---

### Task 2: Integrate DeadlockDetector into GerenciadorTransacoes

**Files:**
- Modify: `app/src/services/GerenciadorTransacoes.js`

- [ ] **Step 1: Add STATES.DEADLOCK constant**

Modify the `STATES` object at line 4-10:

```js
const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  CONFLICT: 'CONFLICT',
  LOCK_FAILED: 'LOCK_FAILED',
  INTERRUPTED: 'INTERRUPTED',
  DEADLOCK: 'DEADLOCK'
};
```

- [ ] **Step 2: Accept deadlockDetector in constructor**

Modify the constructor (line 13-29) to add `deadlockDetector` parameter:

```js
constructor(lockLogger = null, deadlockDetector = null) {
  this.fila = new AsyncPriorityQueue((a, b) => {
    return b.calcularPrioridade() - a.calcularPrioridade();
  });
  this.relatorio = new RelatorioTransacaoConta();
  this.NUM_WORKERS = 100;
  this.running = false;
  this.taskEmProcesso = 0;
  this.tempoTotalEsperaMilis = 0;
  this.workers = [];
  this.lockLogger = lockLogger;
  this.deadlockDetector = deadlockDetector;
  this.totalTransacoes = 0;
  this.workerDelayMs = 0;
  this.source = null;
  this.simId = null;
  this.modo = 'otimista';
}
```

- [ ] **Step 3: Add transacaoId to _makeContext**

Modify `_makeContext` method (line 119-128) to include `transacaoId`:

```js
_makeContext(task, threadId) {
  const ctx = {
    threadId,
    transacaoId: task.id,
    origemId: task.getOrigem().getId(),
    destinoId: task.getDestino().getId()
  };
  if (this.source) ctx.source = this.source;
  if (this.simId) ctx.simId = this.simId;
  return ctx;
}
```

- [ ] **Step 4: Add 'deadlock' mode alias in executar()**

Modify the `executar` method (line 90-101) to add the `'deadlock'` case:

```js
async executar(t, threadId = 'unknown') {
  switch (this.modo) {
    case 'lock-naive':
    case 'deadlock':
      return this._executarLockNaive(t, threadId);
    case 'lock-ordenado':
      return this._executarLockOrdenado(t, threadId);
    case 'lock-timeout':
      return this._executarLockTimeout(t, threadId);
    default:
      return this._executarOtimista(t, threadId);
  }
}
```

- [ ] **Step 5: Integrate deadlock detection into _executarLockNaive**

Replace the entire `_executarLockNaive` method (line 169-208) with:

```js
async _executarLockNaive(t, threadId) {
  const c1 = t.getOrigem();
  const c2 = t.getDestino();
  if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;

  const context = this._makeContext(t, threadId);
  context.contaId = c1.getId();
  const release1 = await c1.mutex.acquire({ ...context, timestamp: Date.now() });

  if (this.deadlockDetector) {
    this.deadlockDetector.acquireHold(t.id, c1.getId());
  }

  if (this.workerDelayMs > 0) {
    await new Promise(r => setTimeout(r, this.workerDelayMs));
  }

  context.contaId = c2.getId();

  if (this.deadlockDetector) {
    this.deadlockDetector.registerWait(t.id, c2.getId());
    const ciclo = this.deadlockDetector.checkDeadlock(t.id);
    if (ciclo) {
      const contasEnvolvidas = [...new Set(ciclo.map(c => c.contaId))];
      const transacoesEnvolvidas = [...new Set(ciclo.map(c => c.transacaoId))];
      const transacoesHolding = [];
      for (const [contaId, transacaoId] of this.deadlockDetector.holds.entries()) {
        if (contasEnvolvidas.includes(contaId)) {
          transacoesHolding.push({ transacaoId, contaId });
        }
      }
      const descricao = ciclo.map(c => `T${c.transacaoId} esperando Conta ${String.fromCharCode(64 + c.contaId)}`).join('; ');
      this._emitir('simulacao:deadlock_detectado', {
        ciclo: ciclo.map(c => ({
          ...c,
          descricao: `T${c.transacaoId} esperando Conta ${String.fromCharCode(64 + c.contaId)}`
        })),
        descricao,
        contasEnvolvidas,
        transacoesEnvolvidas,
        transacoesHolding,
        simId: this.simId,
        timestamp: Date.now()
      });
      this.running = false;
      release1();
      this.deadlockDetector.releaseHold(c1.getId());
      this.deadlockDetector.releaseWait(t.id);
      return STATES.DEADLOCK;
    }
  }

  let release2;
  try {
    release2 = await c2.mutex.acquire({ ...context, timestamp: Date.now() });
  } catch {
    release1();
    if (this.deadlockDetector) {
      this.deadlockDetector.releaseHold(c1.getId());
      this.deadlockDetector.releaseWait(t.id);
    }
    return STATES.INTERRUPTED;
  }

  if (this.deadlockDetector) {
    this.deadlockDetector.acquireHold(t.id, c2.getId());
    this.deadlockDetector.releaseWait(t.id);
  }

  let resultado = STATES.SUCCESS;
  try {
    const r = c1.sacarSemLock(t.getValorCentavos());
    if (!r.success) {
      if (r.reason === 'insufficient_funds') { resultado = STATES.INSUFICIENT_FUNDS; return resultado; }
      resultado = STATES.INTERRUPTED; return resultado;
    }
    if (!c2.depositarSemLock(t.getValorCentavos())) {
      c1.depositarSemLock(t.getValorCentavos());
      resultado = STATES.INTERRUPTED; return resultado;
    }
    return resultado;
  } finally {
    release2();
    release1();
    if (this.deadlockDetector) {
      this.deadlockDetector.releaseHold(c1.getId());
      this.deadlockDetector.releaseHold(c2.getId());
      this.deadlockDetector.releaseWait(t.id);
    }
    if (resultado === STATES.SUCCESS) this._emitirSuccess(t, threadId);
  }
}
```

- [ ] **Step 6: Handle DEADLOCK state in processarTransacao (not re-enqueue)**

Modify the `processarTransacao` while-loop at line 77 — ensure DEADLOCK is handled like INTERRUPTED (not re-enqueued). Add to the existing switch at line 65-79:

```js
case STATES.DEADLOCK:
case STATES.INTERRUPTED:
  break;
```

Find the `INTERRUPTED` case (line 77-78) and change it to include DEADLOCK:

```js
case STATES.DEADLOCK:
case STATES.INTERRUPTED:
  break;
```

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `cd app && npm test`
Expected: All 11 existing auth tests pass, overall suite passes

- [ ] **Step 8: Commit**

```bash
git add app/src/services/GerenciadorTransacoes.js
git commit -m "feat: integrate DeadlockDetector into GerenciadorTransacoes lock-naive flow"
```

---

### Task 3: Add force-deadlock mode to SimulacaoVisualService

**Files:**
- Modify: `app/src/services/SimulacaoVisualService.js`

- [ ] **Step 1: Add require for DeadlockDetector**

Add at the top (after line 3):

```js
const DeadlockDetector = require('../concurrency/DeadlockDetector');
```

- [ ] **Step 2: Add _gerarTransacoesDeadlock method**

Add before the `iniciar` method (before line 74):

```js
_gerarTransacoesDeadlock(numContas) {
  const transacoes = [];
  const contasArray = Array.from(this.contas.values());
  for (let i = 0; i < numContas; i++) {
    const origem = contasArray[i];
    const destino = contasArray[(i + 1) % numContas];
    const saldo = origem.conta.getSaldoCentavos();
    const valor = Math.floor(Math.random() * Math.min(saldo, 10000)) + 1;
    transacoes.push(new Transacao(origem.conta, destino.conta, valor));
  }
  return transacoes;
}
```

- [ ] **Step 3: Modify iniciar() to handle force-deadlock mode**

Replace the beginning of the `iniciar` method (lines 74-84) with:

```js
async iniciar(numContas, mode = 'nxn', transacaoRange = {}, estrategia = 'otimista') {
  if (this.running) return { error: 'Simulação visual já em andamento' };
  const minContas = mode === 'force-deadlock' ? 3 : 5;
  const maxContas = 30;
  if (!Number.isInteger(numContas) || numContas < minContas || numContas > maxContas) {
    return { error: `Número de contas deve ser um inteiro entre ${minContas} e ${maxContas}` };
  }

  if (mode === 'force-deadlock') {
    estrategia = 'lock-naive';
  }

  this.running = true;
  this._generation++;
  const gen = this._generation;

  this._criarContas(numContas, estrategia);

  const numWorkers = this.NUM_WORKERS;

  this.lockLogger.onEvent('simulacao-visual:iniciada', {
    contas: this.getContas(),
    totalContas: numContas,
    numWorkers,
    mode,
    estrategia,
    simId: gen,
    timestamp: Date.now(),
    source: 'visual'
  });

  let transacoes;
  if (mode === 'force-deadlock') {
    transacoes = this._gerarTransacoesDeadlock(numContas);
  } else if (mode === 'random') {
    // ... existing random code ...
```

Then modify the gerenciador creation block (line 109-118) to pass DeadlockDetector when in force-deadlock mode:

```js
let deadlockDetector = null;
if (mode === 'force-deadlock') {
  deadlockDetector = new DeadlockDetector();
}
this.gerenciador = new GerenciadorTransacoes(this.lockLogger, deadlockDetector);
this.gerenciador.NUM_WORKERS = numWorkers;
this.gerenciador.workerDelayMs = 300;
this.gerenciador.source = 'visual';
this.gerenciador.simId = gen;
this.gerenciador.modo = estrategia;
```

And in the return object (line 128), change `mode` to `mode` (already correct) and ensure the source is passed correctly.

The full modified `iniciar` method should be:

```js
async iniciar(numContas, mode = 'nxn', transacaoRange = {}, estrategia = 'otimista') {
  if (this.running) return { error: 'Simulação visual já em andamento' };
  const minContas = mode === 'force-deadlock' ? 3 : 5;
  const maxContas = 30;
  if (!Number.isInteger(numContas) || numContas < minContas || numContas > maxContas) {
    return { error: `Número de contas deve ser um inteiro entre ${minContas} e ${maxContas}` };
  }

  if (mode === 'force-deadlock') {
    estrategia = 'lock-naive';
  }

  this.running = true;
  this._generation++;
  const gen = this._generation;

  this._criarContas(numContas, estrategia);

  const numWorkers = this.NUM_WORKERS;

  this.lockLogger.onEvent('simulacao-visual:iniciada', {
    contas: this.getContas(),
    totalContas: numContas,
    numWorkers,
    mode,
    estrategia,
    simId: gen,
    timestamp: Date.now(),
    source: 'visual'
  });

  let transacoes;
  if (mode === 'force-deadlock') {
    transacoes = this._gerarTransacoesDeadlock(numContas);
  } else if (mode === 'random') {
    const minT = parseInt(transacaoRange.min) || 10;
    const maxT = parseInt(transacaoRange.max) || 50;
    const quantidade = Math.floor(Math.random() * (maxT - minT + 1)) + minT;
    transacoes = this._gerarTransacoesAleatorio(quantidade);
  } else {
    transacoes = this._gerarTransacoesNxN();
  }

  let deadlockDetector = null;
  if (mode === 'force-deadlock') {
    deadlockDetector = new DeadlockDetector();
  }
  this.gerenciador = new GerenciadorTransacoes(this.lockLogger, deadlockDetector);
  this.gerenciador.NUM_WORKERS = numWorkers;
  this.gerenciador.workerDelayMs = 300;
  this.gerenciador.source = 'visual';
  this.gerenciador.simId = gen;
  this.gerenciador.modo = estrategia;
  for (const t of transacoes) {
    this.gerenciador.adicionarTransacao(t);
  }
  this.gerenciador.start();

  const gerenciadorAtual = this.gerenciador;
  setImmediate(() =>
    this._aguardarConclusao(gen, gerenciadorAtual).catch(err => {
      console.error('SimulacaoVisualService error:', err);
      this.running = false;
    })
  );

  return {
    status: 'iniciada',
    mode,
    estrategia,
    totalContas: numContas,
    totalTransacoes: transacoes.length,
    simId: gen,
    contas: this.getContas()
  };
}
```

- [ ] **Step 4: Verify no startup errors**

Run: `cd app && node -e "require('./src/services/SimulacaoVisualService')" && echo "OK"`
Expected: OK (no errors)

- [ ] **Step 5: Commit**

```bash
git add app/src/services/SimulacaoVisualService.js
git commit -m "feat: add force-deadlock mode with N-transaction cycle generation"
```

---

### Task 4: Update HTML with Modo Caos selector

**Files:**
- Modify: `app/public/html/simulacao-visual.html`

- [ ] **Step 1: Add deadlock radio option and strategy lock logic**

Replace the mode radios block (lines 24-26) to add the deadlock option:

```html
<label class="form-label">Modo:</label>
<label class="radio-label"><input type="radio" name="simMode" value="nxn" checked> NxN</label>
<label class="radio-label"><input type="radio" name="simMode" value="random"> Aleatório</label>
<label class="radio-label radio-label--danger"><input type="radio" name="simMode" value="force-deadlock"> ⚠️ Modo Caos <span class="radio-hint">(Força Deadlock)</span></label>
```

Replace the `inputNumContas` field (line 41) to allow `min="3"` when in force-deadlock. Change:

```html
<input type="number" id="inputNumContas" class="form-input" value="8" min="5" max="30">
```

The `min` will be controlled by JS dynamically (set in Task 6).

- [ ] **Step 2: Add deadlock overlay HTML before closing </main>**

Insert before `</main>` (before line 117):

```html
<div class="overlay deadlock-overlay" id="deadlockOverlay" hidden>
  <div class="deadlock-modal">
    <div class="deadlock-icon">🚨</div>
    <h2 class="deadlock-title">Deadlock Identificado!</h2>
    <p class="deadlock-subtitle">Simulação interrompida automaticamente</p>
    <div class="deadlock-desc" id="deadlockDesc"></div>
    <div class="deadlock-cycle" id="deadlockCycle"></div>
    <div class="deadlock-badges" id="deadlockBadges"></div>
    <div class="deadlock-actions">
      <button id="btnDeadlockVerArena" class="deadlock-btn deadlock-btn--secondary">Ver Arena</button>
      <button id="btnDeadlockVoltar" class="deadlock-btn deadlock-btn--primary">Voltar ao Controle</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add app/public/html/simulacao-visual.html
git commit -m "feat: add Modo Caos radio option and deadlock overlay HTML"
```

---

### Task 5: Add deadlock overlay CSS

**Files:**
- Modify: `app/public/css/simulacao-visual.css`

- [ ] **Step 1: Add deadlock CSS at end of file**

Append to the end of `simulacao-visual.css`:

```css
.deadlock-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
}

.deadlock-overlay[hidden] {
  display: none;
}

.deadlock-modal {
  background: #0d1117;
  border: 2px solid #ff6b6b;
  border-radius: 14px;
  padding: 32px;
  max-width: 460px;
  width: 90%;
  text-align: center;
  animation: deadlockSlideUp 0.4s ease-out;
  box-shadow: 0 0 40px rgba(255, 107, 107, 0.3);
}

@keyframes deadlockSlideUp {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.deadlock-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.deadlock-title {
  color: #ff6b6b;
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px;
}

.deadlock-subtitle {
  color: #8b949e;
  font-size: 13px;
  margin: 0 0 20px;
}

.deadlock-desc {
  color: #c9d1d9;
  font-size: 13px;
  margin: 0 0 16px;
  line-height: 1.5;
}

.deadlock-cycle {
  background: #161b22;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  text-align: left;
}

.deadlock-cycle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #0d1117;
  border-radius: 6px;
  border-left: 3px solid #58a6ff;
  margin-bottom: 8px;
}

.deadlock-cycle-row:last-child {
  margin-bottom: 0;
}

.deadlock-badge {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.deadlock-badge--tx {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.deadlock-badge--conta {
  background: rgba(240, 192, 64, 0.15);
  color: #f0c040;
}

.deadlock-badges {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.deadlock-actions {
  display: flex;
  gap: 10px;
}

.deadlock-btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.deadlock-btn:hover {
  opacity: 0.85;
}

.deadlock-btn--primary {
  background: #238636;
  color: #fff;
}

.deadlock-btn--secondary {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
}

.radio-label--danger input[type="radio"] {
  accent-color: #ff6b6b;
}

.radio-label--danger {
  color: #ff6b6b;
  font-weight: 600;
}

.radio-hint {
  font-weight: 400;
  font-size: 11px;
  color: #8b949e;
  margin-left: 2px;
}

.status-deadlock {
  background: #ff6b6b22;
  color: #ff6b6b;
  border: 1px solid #ff6b6b;
  font-weight: 700;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/public/css/simulacao-visual.css
git commit -m "style: add deadlock overlay and Modo Caos radio CSS"
```

---

### Task 6: Add deadlock SSE listener and overlay logic to frontend JS

**Files:**
- Modify: `app/public/js/simulacao-visual.js`

- [ ] **Step 1: Add deadlockOverlay DOM refs**

Add at the end of the DOM refs block (after line 28):

```js
const deadlockOverlay = document.getElementById('deadlockOverlay');
const deadlockDesc = document.getElementById('deadlockDesc');
const deadlockCycle = document.getElementById('deadlockCycle');
const deadlockBadges = document.getElementById('deadlockBadges');
const btnDeadlockVerArena = document.getElementById('btnDeadlockVerArena');
const btnDeadlockVoltar = document.getElementById('btnDeadlockVoltar');
```

- [ ] **Step 2: Register deadlock SSE event type**

Add `'simulacao:deadlock_detectado'` to the eventTypes array at line 133:

```js
const eventTypes = ['transacao:lendo_origem', 'transacao:conflito', 'transacao:debitado', 'transacao:success', 'lock:request', 'lock:acquired', 'lock:blocked', 'lock:released', 'lock:timeout', 'simulacao-visual:iniciada', 'simulacao-visual:finalizada', 'simulacao-visual:parada', 'simulacao:deadlock_detectado'];
```

- [ ] **Step 3: Add deadlock handler in processarEvento**

Add after the `simulacao-visual:finalizada` block (after line 364), before the closing `}` of the if-else chain:

```js
else if (type === 'simulacao:deadlock_detectado') {
  pararTimer();
  simulacaoAtiva = false;
  visualStatus.textContent = 'Deadlock';
  visualStatus.className = 'status-badge status-deadlock';
  btnParar.disabled = true;
  btnIniciar.disabled = false;

  const { ciclo, descricao, contasEnvolvidas } = data;
  deadlockDesc.textContent = descricao || 'Ciclo de bloqueio detectado entre as transações.';

  deadlockCycle.innerHTML = (ciclo || []).map(c => `
    <div class="deadlock-cycle-row">
      <span class="deadlock-badge deadlock-badge--tx">T${c.transacaoId}</span>
      <span style="color:#8b949e;font-size:12px">esperando</span>
      <span class="deadlock-badge deadlock-badge--conta">Conta ${String.fromCharCode(64 + c.contaId)}</span>
    </div>
  `).join('');

  deadlockBadges.innerHTML = (contasEnvolvidas || []).map(id =>
    `<span class="deadlock-badge deadlock-badge--conta">Conta ${String.fromCharCode(64 + id)}</span>`
  ).join('');

  deadlockOverlay.hidden = false;
  deadlockOverlay.style.display = 'flex';
}
```

- [ ] **Step 4: Add deadlock overlay button handlers and mode selector logic**

Add at the end of the init block (before `initParticles()` at line 812):

```js
btnDeadlockVerArena.addEventListener('click', () => {
  deadlockOverlay.hidden = true;
  deadlockOverlay.style.display = '';
});

btnDeadlockVoltar.addEventListener('click', () => {
  deadlockOverlay.hidden = true;
  deadlockOverlay.style.display = '';
  limpar();
  visualStatus.textContent = 'Parado';
  visualStatus.className = 'status-badge status-idle';
});

deadlockOverlay.addEventListener('click', (e) => {
  if (e.target === deadlockOverlay) {
    deadlockOverlay.hidden = true;
    deadlockOverlay.style.display = '';
  }
});
```

- [ ] **Step 5: Update mode selector event to handle force-deadlock mode**

Replace the modeRadios event listener block (lines 117-121) with:

```js
modeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    const isRandom = radio.value === 'random';
    const isDeadlock = radio.value === 'force-deadlock';
    randomControls.hidden = !isRandom;
    selectEstrategia.disabled = isDeadlock;
    if (isDeadlock) {
      selectEstrategia.value = 'lock-naive';
      inputNumContas.min = 3;
      if (parseInt(inputNumContas.value) < 3) inputNumContas.value = 3;
    } else {
      inputNumContas.min = 5;
      selectEstrategia.disabled = false;
    }
  });
});
```

- [ ] **Step 6: Update iniciarSimulacao validation range**

Modify the validation range at line 679 to use dynamic min:

Replace line 679:
```js
if (numContas < 5 || numContas > 30) {
```
With:
```js
const minContas = mode === 'force-deadlock' ? 3 : 5;
if (numContas < minContas || numContas > 30) {
```

Replace line 680:
```js
exibirFeedback('Número de contas deve ser entre 5 e 30', 'error');
```
With:
```js
exibirFeedback(`Número de contas deve ser entre ${minContas} e 30`, 'error');
```

- [ ] **Step 8: Commit**

```bash
git add app/public/js/simulacao-visual.js app/public/css/simulacao-visual.css
git commit -m "feat: add deadlock SSE listener, overlay logic, and Modo Caos mode selector"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run full test suite**

Run: `cd app && npm test`
Expected: All tests pass (11 auth tests + 8 detector tests = 19 total)

- [ ] **Step 2: Start server and verify endpoint**

Run: `cd app && node app.js &`
Wait 2 seconds.
Run: `curl -s http://localhost:3000/auth/login -X POST -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'`
Expected: Returns JSON with token.

Save token as `T=$(curl -s http://localhost:3000/auth/login -X POST -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")`

Run: `curl -s "http://localhost:3000/simulacao/visual" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $T" -d '{"numContas":4,"mode":"force-deadlock","estrategia":"otimista"}'`
Expected: Returns `{"status":"iniciada","mode":"force-deadlock","estrategia":"lock-naive",...}` (estrategia overridden to lock-naive)

Kill server: `kill %1`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests passing, force-deadlock endpoint confirmed"
```
