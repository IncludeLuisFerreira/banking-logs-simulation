let NEXT_ID = 1;
const MAX_IDADE_MILIS = 10000;

class Transacao {
  constructor(origem, destino, valorCentavos) {
    this.origem = origem;
    this.destino = destino;
    this.valorCentavos = valorCentavos;
    this.id = NEXT_ID++;
    this.tempoEntradaNaFila = Date.now();
    this.inicioProcessamento = null;
  }

  getTempoEntrada() {
    return this.tempoEntradaNaFila;
  }

  getOrigem() {
    return this.origem;
  }

  getDestino() {
    return this.destino;
  }

  getValorCentavos() {
    return this.valorCentavos;
  }

  getId() {
    return this.id;
  }

  calcularPrioridade() {
    const agora = Date.now();
    const idadeMilis = agora - this.tempoEntradaNaFila;
    const minIdade = Math.min(idadeMilis, MAX_IDADE_MILIS);
    const pesoIdade = (minIdade / MAX_IDADE_MILIS) * 1_000_000;
    return this.valorCentavos + pesoIdade;
  }

  toString() {
    return `from ${this.origem.getId()} to ${this.destino.getId()}: ${this.valorCentavos}`;
  }
}

module.exports = Transacao;