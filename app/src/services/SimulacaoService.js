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
        const valor = Math.floor(Math.random() * Math.min(saldoOrigem, 10000)) + 1;
        const contaDestino = Math.random() < 0.1 ? CONTA_INVALIDA : destino;
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

  pararSimulacao() {
    if (!this.simulacaoAtiva || !this.gerenciadorAtual) {
      return { error: 'Nenhuma simulação em andamento' };
    }
    this.gerenciadorAtual.running = false;
    this.simulacaoAtiva = false;
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
