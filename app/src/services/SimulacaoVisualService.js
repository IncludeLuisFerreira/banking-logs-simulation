const Conta = require('../model/Conta');
const Transacao = require('../model/Transacao');
const CONTA_INVALIDA = require('../model/ContaInvalida');
const GerenciadorTransacoes = require('./GerenciadorTransacoes');
const DeadlockDetector = require('../concurrency/DeadlockDetector');

class SimulacaoVisualService {
  constructor(lockLogger) {
    this.lockLogger = lockLogger;
    this.contas = new Map();
    this.running = false;
    this._generation = 0;
    this.gerenciador = null;
    this.NUM_WORKERS = 8;
  }

  _paretoValue(min, alpha = 1.5) {
    return Math.floor(min / Math.random() ** (1 / alpha));
  }

  _pickWeightedDestino(contas, origemId) {
    if (contas.length <= 1) return null;
    const pesos = contas.map(c => c.conta.id === origemId ? 0 : 1000 / c.conta.id);
    const totalPeso = pesos.reduce((s, p) => s + p, 0);
    let r = Math.random() * totalPeso;
    for (let i = 0; i < contas.length; i++) {
      r -= pesos[i];
      if (r <= 0) return contas[i];
    }
    return contas.find(c => c.conta.id !== origemId);
  }

  getContas() {
    return Array.from(this.contas.values()).map(c => ({
      id: c.conta.id,
      letter: c.letter,
      saldoCentavos: c.conta.getSaldoCentavos(),
      ativa: c.conta.ativa,
      temChequeEspecial: c.conta.temChequeEspecial()
    }));
  }

  _criarContas(numContas, estrategia) {
    this.contas.clear();
    const MAX_CONTAS_CHEQUE_ESPECIAL = 5;
    const CHEQUE_ESPECIAL_POR_CONTA = 100000;
    const PROB_CHEQUE_ESPECIAL = 0.3;
    let contasComChequeEspecial = 0;

    for (let i = 0; i < numContas; i++) {
      const letter = String.fromCharCode(65 + i);
      let chequeEspecialLimite = 0;
      if (contasComChequeEspecial < MAX_CONTAS_CHEQUE_ESPECIAL && Math.random() < PROB_CHEQUE_ESPECIAL) {
        chequeEspecialLimite = CHEQUE_ESPECIAL_POR_CONTA;
        contasComChequeEspecial++;
      }
      const conta = new Conta(i + 1, 100000, chequeEspecialLimite);
      this.contas.set(conta.id, { conta, letter });
      this.lockLogger.onEvent('conta:adicionada', { contaId: conta.id, saldoCentavos: conta.getSaldoCentavos() });
      if (estrategia && estrategia.startsWith('lock')) {
        this.lockLogger.connectMutex(conta.mutex, { contaId: conta.id, letter });
      }
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
        const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
        const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino.conta;
        transacoes.push(new Transacao(origem.conta, contaDestino, valor));
      }
    }
    return transacoes;
  }

  _gerarTransacoesAleatorio(quantidade) {
    const transacoes = [];
    const contasArray = Array.from(this.contas.values());
    for (let i = 0; i < quantidade; i++) {
      const idxOrigem = Math.floor(Math.random() * contasArray.length);
      const origem = contasArray[idxOrigem];
      const destino = this._pickWeightedDestino(contasArray, origem.conta.id);
      if (!destino) continue;
      const saldo = origem.conta.getSaldoCentavos();
      if (saldo <= 0) continue;
      const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
      const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino.conta;
      transacoes.push(new Transacao(origem.conta, contaDestino, valor));
    }
    return transacoes;
  }

  _gerarTransacoesDeadlock(numContas) {
    const transacoes = [];
    const contasArray = Array.from(this.contas.values());
    for (let i = 0; i < numContas; i++) {
      const origem = contasArray[i];
      const destino = contasArray[(i + 1) % numContas];
      const saldo = origem.conta.getSaldoCentavos();
      const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
      const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino.conta;
      transacoes.push(new Transacao(origem.conta, contaDestino, valor));
    }
    return transacoes;
  }

  async iniciar(numContas, mode = 'nxn', transacaoRange = {}, estrategia = 'otimista') {
    if (this.running) return { error: 'Simulação visual já em andamento' };
    const minContas = mode === 'force-deadlock' ? 3 : 5;
    const maxContas = 30;
    if (!Number.isInteger(numContas) || numContas < minContas || numContas > maxContas) {
      return { error: `Número de contas deve ser um inteiro entre ${minContas} e ${maxContas}` };
    }

    if (mode === 'force-deadlock') {
      estrategia = 'lock-naive';
    }

    this.running = true;
    this._generation++;
    const gen = this._generation;

    this._criarContas(numContas, estrategia);

    const numWorkers = this.NUM_WORKERS;

    this.lockLogger.onEvent('simulacao-visual:iniciada', {
      contas: this.getContas(),
      totalContas: numContas,
      numWorkers,
      mode,
      estrategia,
      simId: gen,
      timestamp: Date.now(),
      source: 'visual'
    });

    let transacoes;
    if (mode === 'force-deadlock') {
      transacoes = this._gerarTransacoesDeadlock(numContas);
    } else if (mode === 'random') {
      const minT = parseInt(transacaoRange.min) || 10;
      const maxT = parseInt(transacaoRange.max) || 50;
      const quantidade = Math.floor(Math.random() * (maxT - minT + 1)) + minT;
      transacoes = this._gerarTransacoesAleatorio(quantidade);
    } else {
      transacoes = this._gerarTransacoesNxN();
    }

    let deadlockDetector = null;
    if (mode === 'force-deadlock') {
      deadlockDetector = new DeadlockDetector();
    }
    this.gerenciador = new GerenciadorTransacoes(this.lockLogger, deadlockDetector);
    this.gerenciador.NUM_WORKERS = numWorkers;
    this.gerenciador.workerDelayMs = 300;
    this.gerenciador.source = 'visual';
    this.gerenciador.simId = gen;
    this.gerenciador.modo = estrategia;
    for (const t of transacoes) {
      this.gerenciador.adicionarTransacao(t);
    }
    this.gerenciador.start();

    const gerenciadorAtual = this.gerenciador;
    setImmediate(() =>
      this._aguardarConclusao(gen, gerenciadorAtual).catch(err => {
        console.error('SimulacaoVisualService error:', err);
        this.running = false;
      })
    );

    return {
      status: 'iniciada',
      mode,
      estrategia,
      totalContas: numContas,
      totalTransacoes: transacoes.length,
      simId: gen,
      contas: this.getContas()
    };
  }

  async _aguardarConclusao(gen, gerenciador) {
    if (gerenciador) {
      while (gerenciador.running && (gerenciador.getCount() > 0 || gerenciador.taskEmProcesso > 0)) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      await gerenciador.encerrar();
    }
    if (gen === this._generation) {
      this.running = false;
      this.gerenciador = null;
      this.lockLogger.onEvent('simulacao-visual:finalizada', {
        simId: gen,
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
      this.lockLogger.disconnectMutex(conta.mutex);
      conta.remover();
    }
    this.contas.clear();
    this.gerenciador = null;
    this.lockLogger.onEvent('simulacao-visual:parada', { timestamp: Date.now(), source: 'visual' });
    return { status: 'parada' };
  }
}

module.exports = SimulacaoVisualService;