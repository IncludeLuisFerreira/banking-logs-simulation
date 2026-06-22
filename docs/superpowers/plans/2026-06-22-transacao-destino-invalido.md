# Transação com Destino Inválido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** Introduzir 10% de probabilidade de transações serem enviadas para contas inexistentes, com log para Loki e dashboard Grafana.

**Architecture:** FileLogger escreve logs JSON em `logs/error.log` → Promtail coleta → Loki armazena → Grafana exibe. Uma Conta sentinela (id=-1) serve como destino inválido. O executor detecta e loga o erro antes de qualquer operação.

**Tech Stack:** Node.js, Jest, Promtail, Loki, Grafana

---

### Task 1: FileLogger utility

**Files:**
- Create: `app/src/utils/FileLogger.js`
- Test: `app/__tests__/FileLogger.test.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/FileLogger.test.js
const fs = require('fs');
const path = require('path');

jest.mock('fs');

const FileLogger = require('../src/utils/FileLogger');

describe('FileLogger', () => {
  beforeEach(() => {
    fs.appendFileSync.mockClear();
  });

  test('deve escrever uma linha JSON no arquivo de log', () => {
    const logger = new FileLogger('/tmp/test-error.log');
    logger.error('destino_invalido', {
      origemId: 3,
      destinoId: -1,
      valorCentavos: 452,
      threadId: 'worker-7',
    });

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const written = fs.appendFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.tipo).toBe('destino_invalido');
    expect(parsed.origemId).toBe(3);
    expect(parsed.destinoId).toBe(-1);
    expect(parsed.valorCentavos).toBe(452);
    expect(parsed.mensagem).toContain('conta inexistente');
    expect(parsed.timestamp).toBeDefined();
  });

  test('deve usar o caminho padrão logs/error.log quando não especificado', () => {
    const logger = new FileLogger();
    logger.error('test', {});
    expect(fs.appendFileSync.mock.calls[0][0]).toMatch(/logs\/error\.log$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/FileLogger.test.js --no-coverage`
Expected: FAIL — "Cannot find module '../src/utils/FileLogger'"

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/FileLogger.js
const fs = require('fs');
const path = require('path');

class FileLogger {
  constructor(logPath = null) {
    this.logPath = logPath || path.join(__dirname, '..', '..', 'logs', 'error.log');
  }

  error(tipo, dados) {
    try {
      const entry = JSON.stringify({
        tipo,
        ...dados,
        mensagem: this._formatarMensagem(tipo, dados),
        timestamp: Date.now(),
      }) + '\n';
      fs.appendFileSync(this.logPath, entry, 'utf-8');
    } catch (e) {
      console.error('FileLogger error:', e);
    }
  }

  _formatarMensagem(tipo, dados) {
    switch (tipo) {
      case 'destino_invalido':
        return `Conta ${dados.origemId} tentou enviar R$ ${(dados.valorCentavos / 100).toFixed(2)} para conta inexistente (${dados.destinoId})`;
      default:
        return `${tipo}: ${JSON.stringify(dados)}`;
    }
  }
}

module.exports = FileLogger;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/FileLogger.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/FileLogger.js app/__tests__/FileLogger.test.js
git commit -m "feat: add FileLogger utility for structured error logs"
```

---

### Task 2: Conta Sentinela

**Files:**
- Create: `app/src/model/ContaInvalida.js`

- [ ] **Step 1: Create ContaInvalida module**

```js
// src/model/ContaInvalida.js
const Conta = require('./Conta');

const CONTA_INVALIDA = new Conta(-1, 0);

module.exports = CONTA_INVALIDA;
```

- [ ] **Step 2: Commit**

```bash
git add app/src/model/ContaInvalida.js
git commit -m "feat: add sentinel invalid account (id=-1)"
```

---

### Task 3: Detecção e log de destino inválido no GerenciadorTransacoes

**Files:**
- Modify: `app/src/services/GerenciadorTransacoes.js`
- Test: `app/__tests__/GerenciadorTransacoes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/GerenciadorTransacoes.test.js
const Conta = require('../src/model/Conta');
const Transacao = require('../src/model/Transacao');
const CONTA_INVALIDA = require('../src/model/ContaInvalida');

// Mock FileLogger
jest.mock('../src/utils/FileLogger');

const FileLogger = require('../src/utils/FileLogger');
const GerenciadorTransacoes = require('../src/services/GerenciadorTransacoes');

describe('GerenciadorTransacoes — destino inválido', () => {
  test('deve detectar destino inválido e retornar INTERRUPTED', async () => {
    const origem = new Conta(1, 100000);
    const gerenciador = new GerenciadorTransacoes(null);
    gerenciador.modo = 'otimista';

    const transacao = new Transacao(origem, CONTA_INVALIDA, 5000);
    const resultado = await gerenciador.executar(transacao, 'worker-test');

    expect(resultado).toBe('INTERRUPTED');
    expect(FileLogger).toHaveBeenCalledTimes(1);
    const instance = FileLogger.mock.instances[0];
    expect(instance.error).toHaveBeenCalledWith('destino_invalido', expect.objectContaining({
      origemId: 1,
      destinoId: -1,
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/GerenciadorTransacoes.test.js --no-coverage`
Expected: FAIL — FileLogger was not called (not yet implemented)

Note: if a test `describe` block causes test collection to hang, run the specific test with `-t` flag or adjust the AsyncPriorityQueue timeout.

- [ ] **Step 3: Modify GerenciadorTransacoes to detect and log invalid destinations**

Add near top of file:
```js
const FileLogger = require('../utils/FileLogger');
const CONTA_INVALIDA = require('../model/ContaInvalida');

const INVALID_ACCOUNT_ID = -1;
```

Add new method after `_emitirSuccess`:
```js
  _registrarDestinoInvalido(t, threadId) {
    const data = {
      origemId: t.getOrigem().getId(),
      destinoId: t.getDestino().getId(),
      valorCentavos: t.getValorCentavos(),
      threadId,
    };
    const logger = new FileLogger();
    logger.error('destino_invalido', data);
    this._emitir('transacao:destino_invalido', {
      ...data,
      timestamp: Date.now(),
    });
  }
```

Add at the start of each executor method (`_executarOtimista`, `_executarLockNaive`, `_executarLockOrdenado`, `_executarLockTimeout`), right after getting `c1` and `c2` and the `if (!c1.ativa || !c2.ativa)` check:

```js
    if (c2.id === INVALID_ACCOUNT_ID) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }
```

For `_executarOtimista`, insert after line 168 (`if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;`):

```js
    const INVALID_ACCOUNT_ID = -1;
    // ... (at top of method or in local scope)
```

Actually, since `INVALID_ACCOUNT_ID` is defined at module level, just use it directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/GerenciadorTransacoes.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/services/GerenciadorTransacoes.js app/__tests__/GerenciadorTransacoes.test.js
git commit -m "feat: detect and log transactions to invalid destinations"
```

---

### Task 4: Gerar destinos inválidos na Simulação Visual

**Files:**
- Modify: `app/src/services/SimulacaoVisualService.js`

- [ ] **Step 1: Add import at top**

```js
const CONTA_INVALIDA = require('../model/ContaInvalida');
```

- [ ] **Step 2: Modify `_gerarTransacoesNxN`**

Replace the inner loop that creates `Transacao(origem.conta, destino.conta, valor)` with:

```js
      const contaDestino = Math.random() < 0.1 ? CONTA_INVALIDA : destino.conta;
      transacoes.push(new Transacao(origem.conta, contaDestino, valor));
```

- [ ] **Step 3: Modify `_gerarTransacoesAleatorio`**

Replace the line that creates `Transacao(origem.conta, destino.conta, valor)` with:

```js
      const contaDestino = Math.random() < 0.1 ? CONTA_INVALIDA : destino.conta;
      transacoes.push(new Transacao(origem.conta, contaDestino, valor));
```

- [ ] **Step 4: Modify `_gerarTransacoesDeadlock`**

Replace the `Transacao(origem.conta, destino.conta, valor)` with:

```js
      const contaDestino = Math.random() < 0.1 ? CONTA_INVALIDA : destino.conta;
      transacoes.push(new Transacao(origem.conta, contaDestino, valor));
```

- [ ] **Step 5: Commit**

```bash
git add app/src/services/SimulacaoVisualService.js
git commit -m "feat: 10% chance of invalid destination in visual simulation"
```

---

### Task 5: Gerar destinos inválidos no Stress NxN

**Files:**
- Modify: `app/src/services/SimulacaoService.js`

- [ ] **Step 1: Add import at top**

```js
const CONTA_INVALIDA = require('../model/ContaInvalida');
```

- [ ] **Step 2: Modify `iniciarSimulacaoNxN`**

In the inner loop where `destino` is from `contasAtivas`, replace the `Transacao` creation:

```js
        const contaDestino = Math.random() < 0.1 ? CONTA_INVALIDA : destino;
        const transacao = new Transacao(origem, contaDestino, valor);
```

Replace the existing line:
```js
        const transacao = new Transacao(origem, destino, valor);
```

- [ ] **Step 3: Commit**

```bash
git add app/src/services/SimulacaoService.js
git commit -m "feat: 10% chance of invalid destination in stress NxN"
```

---

### Task 6: Dashboard Grafana "Transação com Destino Inválido"

**Files:**
- Create: `monitoring/grafana/dashboards/transacao-destino-invalido.json`

- [ ] **Step 1: Create dashboard JSON**

```json
{
  "title": "Transação com Destino Inválido",
  "uid": "transacao-destino-invalido",
  "schemaVersion": 39,
  "version": 1,
  "timezone": "browser",
  "panels": [
    {
      "title": "Total de Erros (Destino Inválido)",
      "type": "stat",
      "gridPos": { "x": 0, "y": 0, "w": 4, "h": 4 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "sum(count_over_time({job=\"banking-simulation\"} |= \"destino_invalido\" [1m]))",
          "legendFormat": "total"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "short",
          "color": { "mode": "fixed" },
          "thresholds": { "mode": "absolute", "steps": [{ "value": null, "color": "red" }] }
        }
      }
    },
    {
      "title": "Erros ao Longo do Tempo",
      "type": "timeseries",
      "gridPos": { "x": 4, "y": 0, "w": 8, "h": 8 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "sum by (origemId) (count_over_time({job=\"banking-simulation\"} |= \"destino_invalido\" [30s]))",
          "legendFormat": "Conta {{origemId}}"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "short" }
      }
    },
    {
      "title": "Últimos Erros",
      "type": "logs",
      "gridPos": { "x": 0, "y": 8, "w": 12, "h": 10 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "{job=\"banking-simulation\"} |= \"destino_invalido\"",
          "legendFormat": ""
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add monitoring/grafana/dashboards/transacao-destino-invalido.json
git commit -m "feat: add Grafana dashboard for invalid destination errors"
```
