const Mutex = require('../concurrency/Mutex');

class Conta {
  constructor(id, saldoInicialCentavos) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.mutex = new Mutex();
  }

  getSaldoCentavos() {
    return this.saldoCentavos;
  }

  sacar(valorCentavos) {
    if (this.saldoCentavos <= 0) return false;
    if (this.saldoCentavos < valorCentavos) return false;
    this.saldoCentavos -= valorCentavos;
    return true;
  }

  depositar(valorCentavos) {
    if (valorCentavos <= 0) return false;
    this.saldoCentavos += valorCentavos;
    return true;
  }

  getId() {
    return this.id;
  }

  async tryLock(timeoutMs) {
    const result = await this.mutex.tryAcquire(timeoutMs);
    if (result.acquired) {
      return {
        unlock: () => result.release(),
        isHeld: () => this.mutex.isLocked()
      };
    }
    return null;
  }
}

module.exports = Conta;