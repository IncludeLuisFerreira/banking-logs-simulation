const DeadlockDetector = require('../src/concurrency/DeadlockDetector');

describe('DeadlockDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DeadlockDetector();
  });

  describe('acquireHold and releaseHold', () => {
    it('should record a hold', () => {
      detector.acquireHold(1, 10);
      detector.registerWait(1, 20);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should clear hold on release', () => {
      detector.acquireHold(1, 10);
      detector.releaseHold(10);
      detector.registerWait(2, 10);
      expect(detector.checkDeadlock(2)).toBeNull();
    });
  });

  describe('registerWait and releaseWait', () => {
    it('should clear wait on release', () => {
      detector.registerWait(1, 10);
      detector.releaseWait(1);
      expect(detector.checkDeadlock(1)).toBeNull();
    });
  });

  describe('checkDeadlock', () => {
    it('should return null when no deadlock exists (broken chain)', () => {
      detector.registerWait(1, 10);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should return null when hold exists but holder is not waiting', () => {
      detector.acquireHold(2, 10);
      detector.registerWait(1, 10);
      expect(detector.checkDeadlock(1)).toBeNull();
    });

    it('should detect a 2-transaction deadlock cycle', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.registerWait(1, 20);
      detector.registerWait(2, 10);

      const result = detector.checkDeadlock(1);
      expect(result).not.toBeNull();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ transacaoId: 1, contaId: 20 });
      expect(result[1]).toEqual({ transacaoId: 2, contaId: 10 });
    });

    it('should detect a 3-transaction deadlock cycle', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.acquireHold(3, 30);
      detector.registerWait(1, 20);
      detector.registerWait(2, 30);
      detector.registerWait(3, 10);

      const result = detector.checkDeadlock(1);
      expect(result).not.toBeNull();
      expect(result.length).toBe(3);
      expect(result[0]).toEqual({ transacaoId: 1, contaId: 20 });
      expect(result[1]).toEqual({ transacaoId: 2, contaId: 30 });
      expect(result[2]).toEqual({ transacaoId: 3, contaId: 10 });
    });

    it('should detect cycle starting from any node', () => {
      detector.acquireHold(1, 10);
      detector.acquireHold(2, 20);
      detector.acquireHold(3, 30);
      detector.registerWait(1, 20);
      detector.registerWait(2, 30);
      detector.registerWait(3, 10);

      const result = detector.checkDeadlock(2);
      expect(result).not.toBeNull();
      expect(result.length).toBe(3);
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      detector.acquireHold(1, 10);
      detector.registerWait(2, 20);
      detector.clear();

      detector.registerWait(3, 10);
      expect(detector.checkDeadlock(3)).toBeNull();
    });
  });
});
