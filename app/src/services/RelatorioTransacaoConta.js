const fs = require('fs');

class RelatorioTransacaoConta {
  constructor() {
    this.quantidadeTransacoes = 0;
    this.tentativasLocks = 0;
    this.saldoInsuficiente = 0;
    this.processadoCount = 0;
    this.tempoTotalProcessamento = 0; // nanos
    this.totalValorTransacoes = 0;
    this.totalTempoEsperaMilis = 0;
    this.tempoMedioUnidade = 'ms';
  }

  incrementTempoTotalProcessamento(tempoProcessamento) {
    this.tempoTotalProcessamento += tempoProcessamento;
  }

  setTempoMedioUnidade(unidade) {
    if (unidade === 'ns' || unidade === 'ms') {
      this.tempoMedioUnidade = unidade;
    }
  }

  getTempoMedioProcessamento() {
    if (this.processadoCount === 0) return 0.0;
    const avgNanos = this.tempoTotalProcessamento / this.processadoCount;
    if (this.tempoMedioUnidade === 'ns') {
      return avgNanos;
    } else {
      return avgNanos / 1_000_000;
    }
  }

  push(t, tempoEsperaMilis) {
    this.processadoCount++;
    this.totalValorTransacoes += t.getValorCentavos();
    this.totalTempoEsperaMilis += tempoEsperaMilis;
  }

  setQuantidadeTransacoes(quantidade) {
    this.quantidadeTransacoes = quantidade;
  }

  incrementaTentativasLocks() {
    this.tentativasLocks++;
  }

  incrementaSaldoInsuficiente() {
    this.saldoInsuficiente++;
  }

  getTentativasLocks() {
    return this.tentativasLocks;
  }

  getSaldoInsuficiente() {
    return this.saldoInsuficiente;
  }

  getProcessadoCount() {
    return this.processadoCount;
  }

  getTotalValorTransacoes() {
    return this.totalValorTransacoes;
  }

  getMediaValorTransacoes() {
    if (this.processadoCount === 0) return 0;
    return this.totalValorTransacoes / this.processadoCount;
  }

  getMediaTempoEspera() {
    if (this.processadoCount === 0) return 0;
    return this.totalTempoEsperaMilis / this.processadoCount;
  }

  write() {
    const content = [
      'Relatório de Transações e Estatísticas',
      '-------------------------------------',
      `Total de transações: ${this.quantidadeTransacoes}`,
      `Total de transações processadas com sucesso: ${this.processadoCount}`,
      `Tempo médio de cada processo (${this.tempoMedioUnidade}): ${this.getTempoMedioProcessamento().toFixed(2)}`,
      `Total valor transacionado (centavos): ${this.totalValorTransacoes}`,
      `Valor médio por transação (centavos): ${this.getMediaValorTransacoes().toFixed(2)}`,
      `Tempo médio de espera (milissegundos): ${this.getMediaTempoEspera().toFixed(2)}`,
      `Número de transações com saldo insuficiente: ${this.saldoInsuficiente}`,
      `Número de tentativas de locks: ${this.tentativasLocks}`,
      ''
    ].join('\n');

    try {
      fs.writeFileSync('relatorio.txt', content, 'utf8');
    } catch (e) {
      console.error('Erro ao escrever o relatório:', e.message);
    }
  }
}

module.exports = RelatorioTransacaoConta;