const AsyncPriorityQueue = require('../concurrency/AsyncPriorityQueue');
const FileLogger = require('../utils/FileLogger');
const CONTA_INVALIDA = require('../model/ContaInvalida');
const RelatorioTransacaoConta = require('./RelatorioTransacaoConta');
const {
  transacoesTotal,
  transacoesSucesso,
  transacoesConflito,
  transacoesSaldoInsuficiente,
  transacoesDeadlock,
  transacoesDuracao,
  transacoesEsperaFila,
  workersAtivos,
  transacoesFila,
} = require('../metrics');

const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  CONFLICT: 'CONFLICT',
  LOCK_FAILED: 'LOCK_FAILED',
  INTERRUPTED: 'INTERRUPTED',
  DEADLOCK: 'DEADLOCK'
};

class GerenciadorTransacoes {
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

  adicionarTransacao(t) {
    this.fila.push(t);
    this.totalTransacoes++;
  }

  start() {
    this.relatorio.setQuantidadeTransacoes(this.totalTransacoes);
    this.running = true;
    for (let i = 0; i < this.NUM_WORKERS; i++) {
      this.workers.push(this.processarTransacao(i));
    }
  }

  async processarTransacao(workerId) {
    const threadId = `worker-${workerId}`;
    while (this.running) {
      let task = null;
      try {
        task = await this.fila.poll(500);
        if (task === null) continue;
        if (!this.running) break;

        this.taskEmProcesso++;
        transacoesTotal.inc();
        workersAtivos.set(this.taskEmProcesso);
        transacoesFila.set(this.fila.size());

        if (task.inicioProcessamento === null) {
          task.inicioProcessamento = Date.now();
        }

        const saida = task.getTempoEntrada();
        const tempoEspera = Date.now() - saida;
        const tempoInicio = process.hrtime.bigint();
        const resultado = await this.executar(task, threadId);
        const tempoFim = process.hrtime.bigint();
        const tempoProcessamento = Number(tempoFim - tempoInicio);

        this.tempoTotalEsperaMilis += tempoEspera;

        this.relatorio.incrementTempoTotalProcessamento(tempoProcessamento);
        switch (resultado) {
          case STATES.SUCCESS:
            this.relatorio.push(task, tempoEspera);
            transacoesSucesso.inc();
            transacoesEsperaFila.observe(tempoEspera);
            break;
          case STATES.INSUFICIENT_FUNDS:
            this.relatorio.incrementaSaldoInsuficiente();
            transacoesSaldoInsuficiente.inc();
            break;
          case STATES.CONFLICT:
          case STATES.LOCK_FAILED:
            this.relatorio.incrementaTentativasLocks();
            transacoesConflito.inc();
            this.adicionarTransacao(task);
            break;
          case STATES.DEADLOCK:
            transacoesDeadlock.inc();
          case STATES.INTERRUPTED:
            break;
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (task !== null) {
          this.taskEmProcesso--;
          workersAtivos.set(this.taskEmProcesso);
          transacoesFila.set(this.fila.size());
        }
      }
    }
  }

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

  _emitir(type, data) {
    if (this.lockLogger) {
      this.lockLogger.emitEvent(type, data);
    }
  }

  _emitirSuccess(task, threadId) {
    const agora = Date.now();
    const duracaoMs = task.inicioProcessamento !== null ? agora - task.inicioProcessamento : 0;
    transacoesDuracao.observe(duracaoMs);
    this._emitir('transacao:success', {
      threadId,
      origemId: task.getOrigem().getId(),
      destinoId: task.getDestino().getId(),
      valorCentavos: task.getValorCentavos(),
      timestamp: agora,
      duracaoMs
    });
  }

  _registrarDestinoInvalido(t, threadId) {
    const data = {
      origemId: t.getOrigem().getId(),
      destinoId: t.getDestino().getId(),
      valorCentavos: t.getValorCentavos(),
      threadId,
    };
    const logger = new FileLogger();
    logger.error('destino_invalido', data);
    const eventData = {
      ...data,
      timestamp: Date.now(),
    };
    if (this.source) eventData.source = this.source;
    if (this.simId) eventData.simId = this.simId;
    this._emitir('transacao:destino_invalido', eventData);
  }

  _emitirSaldoInsuficiente(t, threadId) {
    const data = {
      origemId: t.getOrigem().getId(),
      destinoId: t.getDestino().getId(),
      valorCentavos: t.getValorCentavos(),
      saldoDisponivel: t.getOrigem().getSaldoCentavos(),
      threadId,
      timestamp: Date.now(),
    };
    if (this.source) data.source = this.source;
    if (this.simId) data.simId = this.simId;
    this._emitir('transacao:saldo_insuficiente', data);
  }

  _emitirChequeEspecial(t, threadId, chequeEspecialUsado) {
    const data = {
      origemId: t.getOrigem().getId(),
      destinoId: t.getDestino().getId(),
      valorCentavos: t.getValorCentavos(),
      chequeEspecialUsado,
      threadId,
      timestamp: Date.now(),
    };
    if (this.source) data.source = this.source;
    if (this.simId) data.simId = this.simId;
    this._emitir('transacao:cheque_especial', data);
  }

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

  async _executarOtimista(t, threadId) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();

    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;
    if (c2.id === CONTA_INVALIDA.id) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }

    const context = this._makeContext(t, threadId);
    const v1 = c1.version;

    this._emitir('transacao:lendo_origem', { ...context, version: v1, timestamp: Date.now() });

    if (this.workerDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.workerDelayMs));
    }

    const result = c1.sacar(t.getValorCentavos(), v1);

    if (!result.success) {
      if (result.reason === 'conflict') {
        this._emitir('transacao:conflito', {
          ...context, versionEsperada: v1, versionAtual: c1.version, timestamp: Date.now()
        });
        return STATES.CONFLICT;
      }
      if (result.reason === 'insufficient_funds') {
        if (c1.temChequeEspecial()) {
          const ceResult = c1.sacarComChequeEspecialVersao(t.getValorCentavos(), v1);
          if (ceResult.success) {
            this._emitirChequeEspecial(t, threadId, ceResult.chequeEspecialUsado);
          } else {
            if (ceResult.reason === 'conflict') {
              this._emitir('transacao:conflito', {
                ...context, versionEsperada: v1, versionAtual: c1.version, timestamp: Date.now()
              });
              return STATES.CONFLICT;
            }
            this._emitirSaldoInsuficiente(t, threadId);
            return STATES.INSUFICIENT_FUNDS;
          }
        } else {
          this._emitirSaldoInsuficiente(t, threadId);
          return STATES.INSUFICIENT_FUNDS;
        }
      } else {
        return STATES.INTERRUPTED;
      }
    }

    this._emitir('transacao:debitado', { ...context, valorCentavos: t.getValorCentavos(), newVersion: c1.version, timestamp: Date.now() });

    if (!c2.depositar(t.getValorCentavos())) {
      c1.depositar(t.getValorCentavos());
      return STATES.INTERRUPTED;
    }

    this._emitirSuccess(t, threadId);
    return STATES.SUCCESS;
  }

  async _executarLockNaive(t, threadId) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();
    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;
    if (c2.id === CONTA_INVALIDA.id) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }

    const context = this._makeContext(t, threadId);
    this._emitir('transacao:lendo_origem', { ...context, timestamp: Date.now() });
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
        const descricao = ciclo.map(c =>
          `T${c.transacaoId} esperando Conta ${String.fromCharCode(64 + c.contaId)}`
        ).join('; ');
        this._emitir('simulacao:deadlock_detectado', {
          ciclo: ciclo.map(c => ({
            ...c,
            descricao: `T${c.transacaoId} esperando Conta ${String.fromCharCode(64 + c.contaId)}`
          })),
          descricao,
          contasEnvolvidas,
          transacoesEnvolvidas,
          simId: this.simId,
          timestamp: Date.now()
        });
        this.running = false;
        c1.mutex.drainWaiters();
        c2.mutex.drainWaiters();
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
        if (r.reason === 'insufficient_funds') {
          if (c1.temChequeEspecial()) {
            const ceResult = c1.sacarSemLockComChequeEspecial(t.getValorCentavos());
            if (ceResult.success) {
              this._emitirChequeEspecial(t, threadId, ceResult.chequeEspecialUsado);
            } else {
              this._emitirSaldoInsuficiente(t, threadId);
              resultado = STATES.INSUFICIENT_FUNDS; return resultado;
            }
          } else {
            this._emitirSaldoInsuficiente(t, threadId);
            resultado = STATES.INSUFICIENT_FUNDS; return resultado;
          }
        } else {
          resultado = STATES.INTERRUPTED; return resultado;
        }
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

  async _executarLockOrdenado(t, threadId) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();
    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;
    if (c2.id === CONTA_INVALIDA.id) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }

    const [primeiro, segundo] = c1.getId() < c2.getId() ? [c1, c2] : [c2, c1];

    const context = this._makeContext(t, threadId);
    this._emitir('transacao:lendo_origem', { ...context, timestamp: Date.now() });
    context.contaId = primeiro.getId();
    const releasePrimeiro = await primeiro.mutex.acquire({ ...context, timestamp: Date.now() });

    if (this.workerDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.workerDelayMs));
    }

    context.contaId = segundo.getId();
    let releaseSegundo;
    try {
      releaseSegundo = await segundo.mutex.acquire({ ...context, timestamp: Date.now() });
    } catch {
      releasePrimeiro();
      return STATES.INTERRUPTED;
    }

    let resultado = STATES.SUCCESS;
    try {
      const r = c1.sacarSemLock(t.getValorCentavos());
      if (!r.success) {
        if (r.reason === 'insufficient_funds') {
          if (c1.temChequeEspecial()) {
            const ceResult = c1.sacarSemLockComChequeEspecial(t.getValorCentavos());
            if (ceResult.success) {
              this._emitirChequeEspecial(t, threadId, ceResult.chequeEspecialUsado);
            } else {
              this._emitirSaldoInsuficiente(t, threadId);
              resultado = STATES.INSUFICIENT_FUNDS; return resultado;
            }
          } else {
            this._emitirSaldoInsuficiente(t, threadId);
            resultado = STATES.INSUFICIENT_FUNDS; return resultado;
          }
        } else {
          resultado = STATES.INTERRUPTED; return resultado;
        }
      }
      if (!c2.depositarSemLock(t.getValorCentavos())) {
        c1.depositarSemLock(t.getValorCentavos());
        resultado = STATES.INTERRUPTED; return resultado;
      }
      return resultado;
    } finally {
      releaseSegundo();
      releasePrimeiro();
      if (resultado === STATES.SUCCESS) this._emitirSuccess(t, threadId);
    }
  }

  async _executarLockTimeout(t, threadId) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();
    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;
    if (c2.id === CONTA_INVALIDA.id) {
      this._registrarDestinoInvalido(t, threadId);
      return STATES.INTERRUPTED;
    }

    const context = this._makeContext(t, threadId);
    this._emitir('transacao:lendo_origem', { ...context, timestamp: Date.now() });
    context.contaId = c1.getId();
    const lock1 = await c1.mutex.tryAcquire(500, { ...context, timestamp: Date.now() });
    if (!lock1.acquired) {
      this._emitir('transacao:conflito', { ...context, razao: 'timeout_lock1', timestamp: Date.now() });
      return STATES.LOCK_FAILED;
    }

    if (this.workerDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.workerDelayMs));
    }

    context.contaId = c2.getId();
    const lock2 = await c2.mutex.tryAcquire(500, { ...context, timestamp: Date.now() });
    if (!lock2.acquired) {
      lock1.release();
      this._emitir('transacao:conflito', { ...context, razao: 'timeout_lock2', timestamp: Date.now() });
      return STATES.LOCK_FAILED;
    }

    let resultado = STATES.SUCCESS;
    try {
      const r = c1.sacarSemLock(t.getValorCentavos());
      if (!r.success) {
        if (r.reason === 'insufficient_funds') {
          if (c1.temChequeEspecial()) {
            const ceResult = c1.sacarSemLockComChequeEspecial(t.getValorCentavos());
            if (ceResult.success) {
              this._emitirChequeEspecial(t, threadId, ceResult.chequeEspecialUsado);
            } else {
              this._emitirSaldoInsuficiente(t, threadId);
              resultado = STATES.INSUFICIENT_FUNDS; return resultado;
            }
          } else {
            this._emitirSaldoInsuficiente(t, threadId);
            resultado = STATES.INSUFICIENT_FUNDS; return resultado;
          }
        } else {
          resultado = STATES.INTERRUPTED; return resultado;
        }
      }
      if (!c2.depositarSemLock(t.getValorCentavos())) {
        c1.depositarSemLock(t.getValorCentavos());
        resultado = STATES.INTERRUPTED; return resultado;
      }
      return resultado;
    } finally {
      lock2.release();
      lock1.release();
      if (resultado === STATES.SUCCESS) this._emitirSuccess(t, threadId);
    }
  }

  async encerrar(timeoutMs = 60000) {
    this.running = false;
    const deadline = Date.now() + timeoutMs;
    while (this.taskEmProcesso > 0) {
      if (Date.now() > deadline) {
        this.relatorio.write();
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    await Promise.allSettled(this.workers);
    this.relatorio.write();
  }

  getCount() {
    return this.fila.size();
  }

  getStatus() {
    return {
      running: this.running,
      filaSize: this.fila.size(),
      taskEmProcesso: this.taskEmProcesso,
      totalTransacoes: this.totalTransacoes,
      modo: this.modo
    };
  }
}

module.exports = GerenciadorTransacoes;