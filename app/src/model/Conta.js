class Conta {
  constructor(id, saldoInicialCentavos) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.version = 0;
    this.ativa = true;
  }

  getSaldoCentavos() {
    return this.saldoCentavos;
  }

  sacar(valorCentavos, versaoEsperada) {
    if (!this.ativa) return { success: false, reason: 'inactive' };
    if (this.version !== versaoEsperada) return { success: false, reason: 'conflict' };
    if (this.saldoCentavos < valorCentavos) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    this.version++;
    return { success: true };
  }

  depositar(valorCentavos) {
    if (!this.ativa) return false;
    this.saldoCentavos += valorCentavos;
    this.version++;
    return true;
  }

  getId() {
    return this.id;
  }

  remover() {
    this.ativa = false;
  }
}

module.exports = Conta;
