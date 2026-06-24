const Conta = require('../model/Conta');
const Transacao = require('../model/Transacao');
const CONTA_INVALIDA = require('../model/ContaInvalida');
const GerenciadorTransacoes = require('./GerenciadorTransacoes');
const LockLogger = require('./LockLogger');
const { clientesOnline } = require('../metrics');

class SimulacaoService {
  constructor() {
    this.contas = new Map();
    this.nextId = 1;
    this.lockLogger = new LockLogger();
    this.simulacaoAtiva = false;
    this.gerenciadorAtual = null;
    this._intervaloContinuo = null;
    this._timeoutId = null;
    this._modoContinuo = false;
  }

  _poissonDelay(meanMs) {
    return -Math.log(1 - Math.random()) * meanMs;
  }

  _paretoValue(min, alpha = 1.5) {
    return Math.floor(min / Math.random() ** (1 / alpha));
  }

  _pickWeightedDestino(contas, origemId) {
    if (contas.length <= 1) return null;
    const pesos = contas.map(c => c.id === origemId ? 0 : 1000 / c.id);
    const totalPeso = pesos.reduce((s, p) => s + p, 0);
    let r = Math.random() * totalPeso;
    for (let i = 0; i < contas.length; i++) {
      r -= pesos[i];
      if (r <= 0) return contas[i];
    }
    return contas.find(c => c.id !== origemId);
  }

  adicionarConta(saldoInicialCentavos = 100000, nome = '') {
    const conta = new Conta(this.nextId++, saldoInicialCentavos);
    this.contas.set(conta.id, { conta, nome });
    clientesOnline.set(this.contas.size);
    this.lockLogger.onEvent('conta:adicionada', {
      contaId: conta.id,
      nome,
      saldoCentavos: conta.getSaldoCentavos()
    });
    return { id: conta.id, nome, saldoCentavos: conta.getSaldoCentavos() };
  }

  removerConta(id) {
    const entry = this.contas.get(id);
    if (!entry) return false;
    const { conta, nome } = entry;
    conta.remover();
    this.contas.delete(id);
    clientesOnline.set(this.contas.size);
    this.lockLogger.onEvent('conta:removida', { contaId: id, nome });
    return true;
  }

  listarContas() {
    const lista = [];
    for (const [id, { conta, nome }] of this.contas) {
      lista.push({
        id,
        nome,
        saldoCentavos: conta.getSaldoCentavos(),
        ativa: conta.ativa
      });
    }
    return lista;
  }

  getConta(id) {
    const entry = this.contas.get(id);
    return entry ? entry.conta : null;
  }

  async iniciarSimulacaoNxN() {
    if (this.simulacaoAtiva) return { error: 'Simulação já em andamento' };
    if (this.contas.size < 2) return { error: 'São necessárias pelo menos 2 contas' };

    this.simulacaoAtiva = true;
    this._modoContinuo = false;
    const gerenciador = new GerenciadorTransacoes(this.lockLogger);
    this.gerenciadorAtual = gerenciador;

    const contasAtivas = [];
    for (const [, { conta }] of this.contas) {
      if (conta.ativa) contasAtivas.push(conta);
    }

    let totalTransacoes = 0;
    for (const origem of contasAtivas) {
      for (const destino of contasAtivas) {
        if (origem.id === destino.id) continue;
        const saldoOrigem = origem.getSaldoCentavos();
        if (saldoOrigem <= 0) continue;
        const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
        const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino;
        const transacao = new Transacao(origem, contaDestino, valor);
        gerenciador.adicionarTransacao(transacao);
        totalTransacoes++;
      }
    }

    this.lockLogger.onEvent('simulacao:iniciada', {
      totalContas: contasAtivas.length,
      totalTransacoes,
      timestamp: Date.now()
    });

    gerenciador.start();

    setImmediate(async () => {
      await gerenciador.encerrar();
      this.simulacaoAtiva = false;
      this.gerenciadorAtual = null;
      this.lockLogger.onEvent('simulacao:finalizada', {
        status: 'concluida',
        timestamp: Date.now()
      });
    });

    return {
      status: 'iniciada',
      totalContas: contasAtivas.length,
      totalTransacoes
    };
  }

  async iniciarSimulacaoContinua({ intervaloMs = 50, estrategia = 'otimista' } = {}) {
    if (this.simulacaoAtiva) return { error: 'Simulação já em andamento' };
    if (this.contas.size < 2) return { error: 'São necessárias pelo menos 2 contas' };

    this.simulacaoAtiva = true;
    this._modoContinuo = true;
    const gerenciador = new GerenciadorTransacoes(this.lockLogger);
    gerenciador.modo = estrategia;
    this.gerenciadorAtual = gerenciador;

    const contasAtivas = () => {
      const arr = [];
      for (const [, { conta }] of this.contas) {
        if (conta.ativa) arr.push(conta);
      }
      return arr;
    };

    gerenciador.start();

    this.lockLogger.onEvent('simulacao:iniciada', {
      modo: 'continuo',
      intervaloMs,
      estrategia,
      totalContas: this.contas.size,
      timestamp: Date.now()
    });

    let burstCountdown = Math.floor(Math.random() * 5) + 3;
    let cicloCount = 0;

    const tick = async () => {
      if (!this.simulacaoAtiva) return;
      const contas = contasAtivas();
      if (contas.length < 2) {
        this._timeoutId = setTimeout(tick, intervaloMs);
        return;
      }

      cicloCount++;

      if (cicloCount >= burstCountdown) {
        cicloCount = 0;
        burstCountdown = Math.floor(Math.random() * 5) + 3;
        const burstSize = Math.floor(Math.random() * 30) + 10;
        for (let b = 0; b < burstSize; b++) {
          for (const origem of contas) {
            const destino = this._pickWeightedDestino(contas, origem.id);
            if (!destino) continue;
            if (origem.getSaldoCentavos() <= 0) continue;
            const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
            const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino;
            const tx = new Transacao(origem, contaDestino, valor);
            gerenciador.adicionarTransacao(tx);
          }
        }
      } else {
        for (const origem of contas) {
          const destino = this._pickWeightedDestino(contas, origem.id);
          if (!destino) continue;
          if (origem.getSaldoCentavos() <= 0) continue;
          const valor = Math.min(this._paretoValue(1000, 1.5), 500000);
          const contaDestino = Math.random() < 0.02 ? CONTA_INVALIDA : destino;
          const tx = new Transacao(origem, contaDestino, valor);
          gerenciador.adicionarTransacao(tx);
        }
      }

      const delay = this._poissonDelay(intervaloMs);
      this._timeoutId = setTimeout(tick, delay);
    };

    this._timeoutId = setTimeout(tick, intervaloMs);

    this._intervaloContinuo = { cancel: () => clearTimeout(this._timeoutId) };

    return {
      status: 'iniciada',
      modo: 'continuo',
      intervaloMs,
      estrategia,
      totalContas: this.contas.size
    };
  }

  pararSimulacao() {
    if (!this.simulacaoAtiva || !this.gerenciadorAtual) {
      return { error: 'Nenhuma simulação em andamento' };
    }
    if (this._intervaloContinuo) {
      this._intervaloContinuo.cancel();
      this._intervaloContinuo = null;
    }
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    this.gerenciadorAtual.running = false;
    this.simulacaoAtiva = false;
    this._modoContinuo = false;
    this.gerenciadorAtual = null;
    this.lockLogger.onEvent('simulacao:parada', { timestamp: Date.now() });
    return { status: 'parada' };
  }

  getStatus() {
    return {
      simulacaoAtiva: this.simulacaoAtiva,
      totalContas: this.contas.size,
      gerenciador: this.gerenciadorAtual ? this.gerenciadorAtual.getStatus() : null
    };
  }
}

const instance = new SimulacaoService();
module.exports = instance;
