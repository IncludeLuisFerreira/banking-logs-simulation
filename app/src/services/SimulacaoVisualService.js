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
    this.NUM_WORKERS = 10;
  }

  getContas() {
    return Array.from(this.contas.values()).map(c => ({
      id: c.conta.id,
      letter: c.letter,
      saldoCentavos: c.conta.getSaldoCentavos(),
      ativa: c.conta.ativa
    }));
  }

  _criarContas(numContas) {
    this.contas.clear();
    for (let i = 0; i < numContas; i++) {
      const letter = String.fromCharCode(65 + i);
      const conta = new Conta(i + 1, 100000);
      this.contas.set(conta.id, { conta, letter });
      this.lockLogger.onEvent('conta:adicionada', { contaId: conta.id, saldoCentavos: conta.getSaldoCentavos() });
    }
  }

  _gerarTransacoesNxN() {
    const transacoes = [];
    const contasArray = Array.from(this.contas.values());
    for (const origem of contasArray) {
      for (const destino of contasArray) {
        if (origem.conta.id === destino.conta.id) continue;
        const saldo = origem.conta.getSaldoCentavos();
        if (saldo <= 0) continue;
        const valor = Math.floor(Math.random() * Math.min(saldo, 10000)) + 1;
        transacoes.push(new Transacao(origem.conta, destino.conta, valor));
      }
    }
    return transacoes;
  }

  _gerarTransacoesAleatorio(quantidade) {
    const transacoes = [];
    const contasArray = Array.from(this.contas.values());
    for (let i = 0; i < quantidade; i++) {
      const idxOrigem = Math.floor(Math.random() * contasArray.length);
      let idxDestino = Math.floor(Math.random() * contasArray.length);
      let tentativas = 0;
      while (idxDestino === idxOrigem && tentativas < 10) {
        idxDestino = Math.floor(Math.random() * contasArray.length);
        tentativas++;
      }
      if (idxDestino === idxOrigem) continue;
      const origem = contasArray[idxOrigem];
      const destino = contasArray[idxDestino];
      const saldo = origem.conta.getSaldoCentavos();
      if (saldo <= 0) continue;
      const valor = Math.floor(Math.random() * Math.min(saldo, 10000)) + 1;
      transacoes.push(new Transacao(origem.conta, destino.conta, valor));
    }
    return transacoes;
  }

  async iniciar(numContas, mode = 'nxn', transacaoRange = {}) {
    if (this.running) return { error: 'Simulação visual já em andamento' };
    if (!Number.isInteger(numContas) || numContas < 5 || numContas > 15) {
      return { error: 'Número de contas deve ser um inteiro entre 5 e 15' };
    }

    this.running = true;
    this._generation++;
    const gen = this._generation;

    this._criarContas(numContas);

    const numWorkers = this.NUM_WORKERS;

    this.lockLogger.onEvent('simulacao-visual:iniciada', {
      contas: this.getContas(),
      totalContas: numContas,
      numWorkers,
      mode,
      timestamp: Date.now(),
      source: 'visual'
    });

    let transacoes;
    if (mode === 'random') {
      const minT = parseInt(transacaoRange.min) || 10;
      const maxT = parseInt(transacaoRange.max) || 50;
      const quantidade = Math.floor(Math.random() * (maxT - minT + 1)) + minT;
      transacoes = this._gerarTransacoesAleatorio(quantidade);
    } else {
      transacoes = this._gerarTransacoesNxN();
    }

    this.gerenciador = new GerenciadorTransacoes(this.lockLogger);
    this.gerenciador.NUM_WORKERS = numWorkers;
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
      mode,
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
      this.lockLogger.onEvent('conta:removida', { contaId: conta.id });
      conta.remover();
    }
    this.contas.clear();
    this.gerenciador = null;
    this.lockLogger.onEvent('simulacao-visual:parada', { timestamp: Date.now(), source: 'visual' });
    return { status: 'parada' };
  }
}

module.exports = SimulacaoVisualService;
