class Mutex {
  constructor() {
    this._locked = false;
    this._waiters = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      const release = () => {
        if (this._waiters.length > 0) {
          const next = this._waiters.shift();
          next(release);
        } else {
          this._locked = false;
        }
      };

      if (!this._locked) {
        this._locked = true;
        resolve(release);
      } else {
        this._waiters.push(resolve);
      }
    });
  }

  async tryAcquire(timeoutMs) {
    if (!this._locked) {
      const release = await this.acquire();
      return { acquired: true, release: () => release() };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this._waiters.indexOf(onResolve);
        if (index !== -1) this._waiters.splice(index, 1);
        resolve({ acquired: false, release: null });
      }, timeoutMs);

      const onResolve = (release) => {
        clearTimeout(timer);
        resolve({ acquired: true, release: () => release() });
      };

      this._waiters.push(onResolve);
    });
  }

  isLocked() {
    return this._locked;
  }
}

module.exports = Mutex;