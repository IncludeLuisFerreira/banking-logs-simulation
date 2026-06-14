const AsyncPriorityQueue = require('../concurrency/AsyncPriorityQueue');
const RelatorioTransacaoConta = require('./RelatorioTransacaoConta');

const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
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
  }

  adicionarTransacao(t) {
    this.fila.push(t);
    this.totalTransacoes++;
  }

  start() {
    this.relatorio.setQuantidadeTransacoes(this.fila.size());
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
              this.lockLogger.emit('transacao:success', {
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
          case STATES.LOCK_FAILED:
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

    let primeiro, segundo;
    if (c1.getId() < c2.getId()) {
      primeiro = c1;
      segundo = c2;
    } else if (c1.getId() > c2.getId()) {
      primeiro = c2;
      segundo = c1;
    } else {
      primeiro = c1;
      segundo = null;
    }

    let lock1 = null;
    let lock2 = null;

    try {
      const context = { threadId, origemId: t.getOrigem().getId(), destinoId: t.getDestino().getId() };

      lock1 = await primeiro.tryLock(500, context);
      if (!lock1) {
        return STATES.LOCK_FAILED;
      }

      if (segundo !== null) {
        lock2 = await segundo.tryLock(500, context);
        if (!lock2) {
          return STATES.LOCK_FAILED;
        }
      }

      if (!c1.ativa || !c2.ativa) {
        return STATES.INTERRUPTED;
      }

      if (t.getOrigem().sacar(t.getValorCentavos())) {
        t.getDestino().depositar(t.getValorCentavos());
        return STATES.SUCCESS;
      } else {
        return STATES.INSUFICIENT_FUNDS;
      }
    } catch (e) {
      return STATES.INTERRUPTED;
    } finally {
      if (lock2) lock2.unlock();
      if (lock1) lock1.unlock();
    }
  }

  async encerrar() {
    while (!this.fila.isEmpty() || this.taskEmProcesso > 0) {
      await new Promise(r => setTimeout(r, 10));
    }
    this.running = false;
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
