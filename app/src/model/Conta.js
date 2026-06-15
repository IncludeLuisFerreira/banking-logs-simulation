const Mutex = require('../concurrency/Mutex');

class Conta {
  constructor(id, saldoInicialCentavos) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.version = 0;
    this.mutex = new Mutex();
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

  sacarSemLock(valorCentavos) {
    if (!this.ativa) return false;
    if (this.saldoCentavos < valorCentavos) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    return { success: true };
  }

  depositar(valorCentavos) {
    if (!this.ativa) return false;
    this.saldoCentavos += valorCentavos;
    this.version++;
    return true;
  }

  depositarSemLock(valorCentavos) {
    if (!this.ativa) return false;
    this.saldoCentavos += valorCentavos;
    return true;
  }

  getId() {
    return this.id;
  }

  isLocked() {
    return this.mutex.isLocked();
  }

  remover() {
    this.ativa = false;
    this.mutex.drainWaiters();
  }
}

module.exports = Conta;
