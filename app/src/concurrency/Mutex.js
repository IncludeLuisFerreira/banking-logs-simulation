const EventEmitter = require('events');

class Mutex extends EventEmitter {
  constructor() {
    super();
    this._locked = false;
    this._waiters = [];
  }

  async acquire(context = {}) {
    const requestTime = Date.now();
    this.emit('lock:request', { ...context, timestamp: requestTime });
    return new Promise((resolve) => {
      const release = () => {
        this.emit('lock:released', { ...context, timestamp: Date.now() });
        if (this._waiters.length > 0) {
          const next = this._waiters.shift();
          next(release);
        } else {
          this._locked = false;
        }
      };

      if (!this._locked) {
        this._locked = true;
        this.emit('lock:acquired', { ...context, waitTimeMs: 0, timestamp: Date.now() });
        resolve(release);
      } else {
        this.emit('lock:blocked', { ...context, timestamp: Date.now() });
        this._waiters.push((r) => {
          const waitTimeMs = Date.now() - requestTime;
          this.emit('lock:acquired', { ...context, waitTimeMs, timestamp: Date.now() });
          resolve(r);
        });
      }
    });
  }

  async tryAcquire(timeoutMs, context = {}) {
    const requestTime = Date.now();
    this.emit('lock:request', { ...context, timestamp: requestTime });

    if (!this._locked) {
      this._locked = true;
      const release = () => {
        this.emit('lock:released', { ...context, timestamp: Date.now() });
        if (this._waiters.length > 0) {
          const next = this._waiters.shift();
          next(release);
        } else {
          this._locked = false;
        }
      };
      this.emit('lock:acquired', { ...context, waitTimeMs: 0, timestamp: Date.now() });
      return { acquired: true, release: () => release() };
    }

    return new Promise((resolve) => {
      this.emit('lock:blocked', { ...context, timestamp: Date.now() });

      const timer = setTimeout(() => {
        const index = this._waiters.indexOf(onResolve);
        if (index !== -1) this._waiters.splice(index, 1);
        this.emit('lock:timeout', { ...context, timeoutMs, timestamp: Date.now() });
        resolve({ acquired: false, release: null });
      }, timeoutMs);

      const onResolve = (release) => {
        clearTimeout(timer);
        const waitTimeMs = Date.now() - requestTime;
        this.emit('lock:acquired', { ...context, waitTimeMs, timestamp: Date.now() });
        const wrappedRelease = () => {
          this.emit('lock:released', { ...context, timestamp: Date.now() });
          release();
        };
        resolve({ acquired: true, release: wrappedRelease });
      };

      this._waiters.push(onResolve);
    });
  }

  isLocked() {
    return this._locked;
  }
}

module.exports = Mutex;
