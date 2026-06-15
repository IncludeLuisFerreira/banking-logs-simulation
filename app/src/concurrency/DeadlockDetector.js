class DeadlockDetector {
  constructor() {
    this.holds = new Map();
    this.waitingFor = new Map();
  }

  acquireHold(transacaoId, contaId) {
    this.holds.set(contaId, transacaoId);
  }

  releaseHold(contaId) {
    this.holds.delete(contaId);
  }

  registerWait(transacaoId, contaId) {
    this.waitingFor.set(transacaoId, contaId);
  }

  releaseWait(transacaoId) {
    this.waitingFor.delete(transacaoId);
  }

  checkDeadlock(startTransacaoId) {
    const visited = new Set();
    let current = startTransacaoId;
    const path = [];

    while (!visited.has(current)) {
      visited.add(current);
      const wantedConta = this.waitingFor.get(current);
      if (wantedConta === undefined) return null;

      const holderTransacao = this.holds.get(wantedConta);
      if (holderTransacao === undefined) return null;

      path.push({ transacaoId: current, contaId: wantedConta });
      current = holderTransacao;
    }

    const cycleStart = path.findIndex(p => p.transacaoId === current);
    if (cycleStart === -1) return null;
    return path.slice(cycleStart);
  }

  clear() {
    this.holds.clear();
    this.waitingFor.clear();
  }
}

module.exports = DeadlockDetector;
