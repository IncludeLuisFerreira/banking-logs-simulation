const Conta = require('../model/Conta');
const Transacao = require('../model/Transacao');

class SimulacaoVisualService {
  constructor(lockLogger) {
    this.lockLogger = lockLogger;
    this.contas = new Map();
    this.running = false;
    this._generation = 0;
  }

  getContas() {
    return Array.from(this.contas.values()).map(c => ({
      id: c.conta.id,
      letter: c.letter,
      saldoCentavos: c.conta.getSaldoCentavos(),
      ativa: c.conta.ativa
    }));
  }

  async iniciar(numContas) {
    if (this.running) return { error: 'Simulação visual já em andamento' };
    if (!Number.isInteger(numContas) || numContas < 5 || numContas > 15) {
      return { error: 'Número de contas deve ser um inteiro entre 5 e 15' };
    }

    this.running = true;
    this._generation++;
    const gen = this._generation;
    this.contas.clear();

    for (let i = 0; i < numContas; i++) {
      const letter = String.fromCharCode(65 + i);
      const conta = new Conta(i + 1, 100000);
      this.contas.set(conta.id, { conta, letter });
      this.lockLogger.connectConta(conta);
    }

    this.lockLogger.onEvent('simulacao-visual:iniciada', {
      contas: this.getContas(),
      totalContas: numContas,
      timestamp: Date.now()
    });

    const transacoes = [];
    const contasAtivas = Array.from(this.contas.values());
    for (const origem of contasAtivas) {
      for (const destino of contasAtivas) {
        if (origem.conta.id === destino.conta.id) continue;
        const saldo = origem.conta.getSaldoCentavos();
        if (saldo <= 0) continue;
        const valor = Math.floor(Math.random() * Math.min(saldo, 10000)) + 1;
        transacoes.push(new Transacao(origem.conta, destino.conta, valor));
      }
    }

    setImmediate(() =>
      this._processar(transacoes, gen).catch(err => {
        console.error('SimulacaoVisualService error:', err);
        this.running = false;
      })
    );

    return {
      status: 'iniciada',
      totalContas: numContas,
      totalTransacoes: transacoes.length,
      contas: this.getContas()
    };
  }

  async _processar(transacoes, gen) {
    for (const t of transacoes) {
      if (!this.running || gen !== this._generation) break;
      await this._executar(t);
      await new Promise(r => setTimeout(r, 400));
    }
    if (gen === this._generation) {
      this.running = false;
      this.lockLogger.onEvent('simulacao-visual:finalizada', {
        timestamp: Date.now()
      });
    }
  }

  async _executar(t) {
    const c1 = t.getOrigem();
    const c2 = t.getDestino();
    if (!c1.ativa || !c2.ativa) return;

    const primeiro = c1.getId() < c2.getId() ? c1 : c2;
    const segundo = c1.getId() < c2.getId() ? c2 : c1;
    const context = { threadId: 'visual', source: 'visual', origemId: c1.getId(), destinoId: c2.getId() };

    const lock1 = await primeiro.tryLock(1000, context);
    if (!lock1) return;
    const lock2 = await segundo.tryLock(1000, context);
    if (!lock2) { lock1.unlock(); return; }

    if (t.getOrigem().sacar(t.getValorCentavos())) {
      t.getDestino().depositar(t.getValorCentavos());
      this.lockLogger.onEvent('transacao:success', {
        threadId: 'visual',
        source: 'visual',
        origemId: c1.getId(),
        destinoId: c2.getId(),
        valorCentavos: t.getValorCentavos(),
        timestamp: Date.now()
      });
    }

    lock2.unlock();
    lock1.unlock();
  }

  parar() {
    this.running = false;
    for (const { conta } of this.contas.values()) {
      this.lockLogger.disconnectConta(conta);
      conta.remover();
    }
    this.contas.clear();
    this.lockLogger.onEvent('simulacao-visual:parada', { timestamp: Date.now() });
    return { status: 'parada' };
  }
}

module.exports = SimulacaoVisualService;
