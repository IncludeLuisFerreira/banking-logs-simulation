const Conta = require('../model/Conta');
const Transacao = require('../model/Transacao');
const GerenciadorTransacoes = require('./GerenciadorTransacoes');

class SimulacaoVisualService {
  constructor(lockLogger) {
    this.lockLogger = lockLogger;
    this.contas = new Map();
    this.running = false;
    this._generation = 0;
    this.gerenciador = null;
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
      timestamp: Date.now(),
      source: 'visual'
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

    this.gerenciador = new GerenciadorTransacoes(this.lockLogger);
    this.gerenciador.NUM_WORKERS = 10;
    this.gerenciador.workerDelayMs = 80;
    this.gerenciador.source = 'visual';
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

    return {
      status: 'iniciada',
      totalContas: numContas,
      totalTransacoes: transacoes.length,
      contas: this.getContas()
    };
  }

  async _aguardarConclusao(gen) {
    if (this.gerenciador) {
      await this.gerenciador.encerrar();
    }
    if (gen === this._generation) {
      this.running = false;
      this.gerenciador = null;
      this.lockLogger.onEvent('simulacao-visual:finalizada', {
        timestamp: Date.now(),
        source: 'visual'
      });
    }
  }

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
    this.lockLogger.onEvent('simulacao-visual:parada', { timestamp: Date.now(), source: 'visual' });
    return { status: 'parada' };
  }
}

module.exports = SimulacaoVisualService;
