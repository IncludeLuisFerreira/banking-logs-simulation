const AsyncPriorityQueue = require('../concurrency/AsyncPriorityQueue');
const RelatorioTransacaoConta = require('./RelatorioTransacaoConta');

const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  CONFLICT: 'CONFLICT',
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
            if (this.lockLogger) {
              this.lockLogger.emitEvent('transacao:success', {
                threadId,
                origemId: task.getOrigem().getId(),
                destinoId: task.getDestino().getId(),
                valorCentavos: task.getValorCentavos(),
                timestamp: Date.now()
              });
            }
            break;
          case STATES.INSUFICIENT_FUNDS:
            this.relatorio.incrementaSaldoInsuficiente();
            break;
          case STATES.CONFLICT:
            this.relatorio.incrementaTentativasLocks();
            this.adicionarTransacao(task);
            break;
          case STATES.INTERRUPTED:
            break;
          default:
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
    const c1 = t.getOrigem();
    const c2 = t.getDestino();

    if (!c1.ativa || !c2.ativa) return STATES.INTERRUPTED;

    const context = { threadId, origemId: t.getOrigem().getId(), destinoId: t.getDestino().getId() };
    if (this.source) context.source = this.source;
    if (this.simId) context.simId = this.simId;

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
      totalTransacoes: this.totalTransacoes
    };
  }
}

module.exports = GerenciadorTransacoes;
