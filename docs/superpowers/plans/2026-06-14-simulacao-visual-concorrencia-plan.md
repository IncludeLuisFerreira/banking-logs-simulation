# Concorrência Real na Simulação Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir o processamento sequencial do `SimulacaoVisualService` por workers concorrentes via `GerenciadorTransacoes`, gerando contenção real de locks visível no frontend.

**Architecture:** `SimulacaoVisualService` cria contas e transações como antes, mas em vez de `_processar()` sequencial, alimenta um `GerenciadorTransacoes` com N workers (ex: 15) que disputam locks concorrentemente. Os eventos de lock (blocked, timeout, acquired, released) fluem naturalmente via Mutex → LockLogger → SSE → frontend.

**Tech Stack:** Node.js (EventEmitter, async/await), Express, LockLogger SSE.

---

### Task 1: Fix transacao:success no LockLogger

**Files:**
- Modify: `app/src/services/GerenciadorTransacoes.js`

**Problema:** `GerenciadorTransacoes.executar()` emite `transacao:success` via `this.lockLogger.emit()`, que é o `EventEmitter.emit()` padrão. Como ninguém escuta este evento no LockLogger, estas mensagens **nunca chegam aos clientes SSE**. O correto é usar `this.lockLogger.onEvent()` que armazena no buffer circular e faz broadcast SSE.

- [ ] **Step 1: Mudar `emit` para `onEvent`**

Em `app/src/services/GerenciadorTransacoes.js:63-71`, alterar:

```javascript
// ANTES:
if (this.lockLogger) {
  this.lockLogger.emit('transacao:success', {
    threadId,
    origemId: task.getOrigem().getId(),
    destinoId: task.getDestino().getId(),
    valorCentavos: task.getValorCentavos(),
    timestamp: Date.now()
  });
}

// DEPOIS:
if (this.lockLogger) {
  this.lockLogger.onEvent('transacao:success', {
    threadId,
    origemId: task.getOrigem().getId(),
    destinoId: task.getDestino().getId(),
    valorCentavos: task.getValorCentavos(),
    timestamp: Date.now()
  });
}
```

- [ ] **Step 2: Verificar que `onEvent` existe no LockLogger**

Run: `grep -n "onEvent" app/src/services/LockLogger.js`
Expected: `LockLogger` tem método `onEvent(type, data)` que chama `_broadcast(entry)`.

---

### Task 2: Rewrite SimulacaoVisualService — processamento concorrente

**Files:**
- Modify: `app/src/services/SimulacaoVisualService.js`

Substituir a lógica sequencial (`_processar` + `_executar`) pelo `GerenciadorTransacoes` com workers concorrentes.

- [ ] **Step 1: Adicionar import do GerenciadorTransacoes**

No topo de `SimulacaoVisualService.js`:

```javascript
const Conta = require('../model/Conta');
const Transacao = require('../model/Transacao');
const GerenciadorTransacoes = require('./GerenciadorTransacoes');
```

- [ ] **Step 2: Adicionar campo `gerenciador` no constructor**

```javascript
class SimulacaoVisualService {
  constructor(lockLogger) {
    this.lockLogger = lockLogger;
    this.contas = new Map();
    this.running = false;
    this._generation = 0;
    this.gerenciador = null;
  }
```

- [ ] **Step 3: Substituir `_processar` + `_executar` por uso do GerenciadorTransacoes**

No método `iniciar()`, substituir:

```javascript
// ANTES (linhas 57-62):
    setImmediate(() =>
      this._processar(transacoes, gen).catch(err => {
        console.error('SimulacaoVisualService error:', err);
        this.running = false;
      })
    );

// DEPOIS:
    this.gerenciador = new GerenciadorTransacoes(this.lockLogger);
    this.gerenciador.NUM_WORKERS = 15;
    for (const t of transacoes) {
      this.gerenciador.adicionarTransacao(t);
    }
    this.gerenciador.start();

    setImmediate(() =>
      this._aguardarConclusao(gen).catch(err => {
        console.error('SimulacaoVisualService error:', err);
        this.running = false;
      })
    );
```

- [ ] **Step 4: Adicionar método `_aguardarConclusao`**

Substituir o método `_processar` inteiro por:

```javascript
  async _aguardarConclusao(gen) {
    await this.gerenciador.encerrar();
    if (gen === this._generation) {
      this.running = false;
      this.gerenciador = null;
      this.lockLogger.onEvent('simulacao-visual:finalizada', {
        timestamp: Date.now()
      });
    }
  }
```

- [ ] **Step 5: Remover método `_executar` obsoleto**

Remover todo o método `_executar(t)` (linhas 86-114), já que o `GerenciadorTransacoes` trata da execução.

- [ ] **Step 6: Atualizar `parar()` para parar o gerenciador**

```javascript
  parar() {
    this.running = false;
    if (this.gerenciador) {
      this.gerenciador.running = false;
    }
    for (const { conta } of this.contas.values()) {
      this.lockLogger.disconnectConta(conta);
      conta.remover();
    }
    this.contas.clear();
    this.gerenciador = null;
    this.lockLogger.onEvent('simulacao-visual:parada', { timestamp: Date.now() });
    return { status: 'parada' };
  }
```

- [ ] **Step 7: Verificar sintaxe**

Run: `node -c app/src/services/SimulacaoVisualService.js`
Expected: No output (no syntax errors).

---

### Task 3: Testar concorrência

**Files:**
- Test: Aplicação completa

- [ ] **Step 1: Iniciar servidor**

Run: `node app/app.js` (no diretório `app/`)

- [ ] **Step 2: Login + iniciar simulação visual**

```bash
TOKEN=$(curl -s http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s -X POST http://localhost:3000/simulacao/visual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"numContas":8}' | python3 -m json.tool
```

- [ ] **Step 3: Verificar eventos de contenção no SSE**

```bash
timeout 3 curl -s "http://localhost:3000/simulacao/stream?token=$TOKEN" | \
  grep -E "(lock:blocked|lock:timeout)" | head -10
```

Expected: Vários eventos `lock:blocked` e `lock:timeout` (contenção real entre workers concorrentes).

- [ ] **Step 4: Verificar transacao:success com source:visual**

```bash
timeout 3 curl -s "http://localhost:3000/simulacao/stream?token=$TOKEN" | \
  grep "transacao:success" | head -5
```

Expected: Eventos `transacao:success` com `threadId: "worker-0"`, `worker-1`, etc.
