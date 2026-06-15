const AsyncPriorityQueue = require('../concurrency/AsyncPriorityQueue');
const RelatorioTransacaoConta = require('./RelatorioTransacaoConta');

const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  CONFLICT: 'CONFLICT',
  LOCK_FAILED: 'LOCK_FAILED',
  INTERRUPTED: 'INTERRUPTED'
};

class GerenciadorTransacoes {
  constructor(lockLogger = null) {
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
            break;
          case STATES.INSUFICIENT_FUNDS:
            this.relatorio.incrementaSaldoInsuficiente();
            break;
          case STATES.CONFLICT:
          case STATES.LOCK_FAILED:
            this.relatorio.incrementaTentativasLocks();
            this.adicionarTransacao(task);
            break;
          case STATES.INTERRUPTED:
            break;
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (task !== null) {
          this.taskEmProcesso--;
        }
      }
    }
  }

  async executar(t, threadId = 'unknown') {
    switch (this.modo) {
      case 'lock-naive':
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
    this._emitir('transacao:success', {
      threadId,
      origemId: task.getOrigem().getId(),
      destinoId: task.getDestino().getId(),
      valorCentavos: task.getValorCentavos(),
      timestamp: Date.now()
    });
  }

  _makeContext(task, threadId) {
    const ctx = {
      threadId,
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
      if (result.reason === 'insufficient_funds') return STATES.INSUFICIENT_FUNDS;
      return STATES.INTERRUPTED;
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

    const context = this._makeContext(t, threadId);
    context.contaId = c1.getId();
    const release1 = await c1.mutex.acquire({ ...context, timestamp: Date.now() });

    if (this.workerDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.workerDelayMs));
    }

    context.contaId = c2.getId();
    let release2;
    try {
      release2 = await c2.mutex.acquire({ ...context, timestamp: Date.now() });
    } catch {
      release1();
      return STATES.INTERRUPTED;
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
      if (resultado === STATES.SUCCESS) this._emitirSuccess(t, threadId);
    }
  }

  async _executarLockOrdenado(t, threadId) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();
    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;

    const [primeiro, segundo] = c1.getId() < c2.getId() ? [c1, c2] : [c2, c1];

    const context = this._makeContext(t, threadId);
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
        if (r.reason === 'insufficient_funds') { resultado = STATES.INSUFICIENT_FUNDS; return resultado; }
        resultado = STATES.INTERRUPTED; return resultado;
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

    const context = this._makeContext(t, threadId);
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
        if (r.reason === 'insufficient_funds') { resultado = STATES.INSUFICIENT_FUNDS; return resultado; }
        resultado = STATES.INTERRUPTED; return resultado;
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

  async encerrar() {
    this.running = false;
    while (this.taskEmProcesso > 0) {
      await new Promise(r => setTimeout(r, 10));
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