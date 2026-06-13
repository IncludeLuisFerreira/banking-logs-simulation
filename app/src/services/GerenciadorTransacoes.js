const AsyncPriorityQueue = require('../concurrency/AsyncPriorityQueue');
const RelatorioTransacaoConta = require('./RelatorioTransacaoConta');

const STATES = {
  SUCCESS: 'SUCCESS',
  INSUFICIENT_FUNDS: 'INSUFICIENT_FUNDS',
  LOCK_FAILED: 'LOCK_FAILED',
  INTERRUPTED: 'INTERRUPTED'
};

class GerenciadorTransacoes {
  constructor() {
    this.fila = new AsyncPriorityQueue((a, b) => {
      return b.calcularPrioridade() - a.calcularPrioridade();
    });
    this.relatorio = new RelatorioTransacaoConta();
    this.NUM_WORKERS = 100;
    this.running = false;
    this.taskEmProcesso = 0;
    this.tempoTotalEsperaMilis = 0;
    this.workers = [];
  }

  adicionarTransacao(t) {
    this.fila.push(t);
  }

  start() {
    this.relatorio.setQuantidadeTransacoes(this.fila.size());
    this.running = true;
    for (let i = 0; i < this.NUM_WORKERS; i++) {
      this.workers.push(this.processarTransacao());
    }
  }

  async processarTransacao() {
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
        const resultado = await this.executar(task);
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

  async executar(t) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();

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
      lock1 = await primeiro.tryLock(500);
      if (!lock1) {
        return STATES.LOCK_FAILED;
      }

      if (segundo !== null) {
        lock2 = await segundo.tryLock(500);
        if (!lock2) {
          if (lock1) lock1.unlock();
          return STATES.LOCK_FAILED;
        }
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
}

module.exports = GerenciadorTransacoes;