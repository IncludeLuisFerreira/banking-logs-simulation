const Mutex = require('../concurrency/Mutex');

class Conta {
  constructor(id, saldoInicialCentavos, chequeEspecialLimite = 0) {
    this.id = id;
    this.saldoCentavos = saldoInicialCentavos;
    this.version = 0;
    this.mutex = new Mutex();
    this.ativa = true;
    this.chequeEspecialLimite = chequeEspecialLimite;
    this.chequeEspecialUsado = 0;
  }

  getSaldoCentavos() {
    return this.saldoCentavos;
  }

  temChequeEspecial() {
    return this.chequeEspecialLimite > 0;
  }

  getChequeEspecialDisponivel() {
    return Math.max(0, this.chequeEspecialLimite - this.chequeEspecialUsado);
  }

  sacarComChequeEspecial(valorCentavos) {
    if (!this.ativa) return { success: false, reason: 'inactive' };
    const disponivel = this.chequeEspecialLimite - this.chequeEspecialUsado;
    const excedente = Math.max(0, valorCentavos - this.saldoCentavos);
    if (excedente > disponivel) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    this.version++;
    if (excedente > 0) this.chequeEspecialUsado += excedente;
    return { success: true, chequeEspecialUsado: excedente };
  }

  sacarComChequeEspecialVersao(valorCentavos, versaoEsperada) {
    if (!this.ativa) return { success: false, reason: 'inactive' };
    if (this.version !== versaoEsperada) return { success: false, reason: 'conflict' };
    const disponivel = this.chequeEspecialLimite - this.chequeEspecialUsado;
    const excedente = Math.max(0, valorCentavos - this.saldoCentavos);
    if (excedente > disponivel) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    this.version++;
    if (excedente > 0) this.chequeEspecialUsado += excedente;
    return { success: true, chequeEspecialUsado: excedente };
  }

  sacarSemLockComChequeEspecial(valorCentavos) {
    if (!this.ativa) return { success: false, reason: 'inactive' };
    const disponivel = this.chequeEspecialLimite - this.chequeEspecialUsado;
    const excedente = Math.max(0, valorCentavos - this.saldoCentavos);
    if (excedente > disponivel) return { success: false, reason: 'insufficient_funds' };
    this.saldoCentavos -= valorCentavos;
    if (excedente > 0) this.chequeEspecialUsado += excedente;
    return { success: true, chequeEspecialUsado: excedente };
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
    if (!this.ativa) return { success: false, reason: 'inactive' };
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
