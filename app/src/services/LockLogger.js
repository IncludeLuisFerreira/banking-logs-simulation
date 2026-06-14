const EventEmitter = require('events');

class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.size = 0;
    this.head = 0;
  }

  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  forEach(fn) {
    const start = this.size < this.capacity ? 0 : this.head;
    const count = this.size < this.capacity ? this.size : this.capacity;
    for (let i = 0; i < count; i++) {
      fn(this.buffer[(start + i) % this.capacity]);
    }
  }
}

class LockLogger extends EventEmitter {
  constructor(capacity = 500) {
    super();
    this.buffer = new RingBuffer(capacity);
    this.clients = new Set();
  }

  onEvent(type, data) {
    const entry = { type, data, timestamp: Date.now() };
    this.buffer.push(entry);
    this.emit('log', entry);
    this._broadcast(entry);
  }

  _broadcast(entry) {
    const payload = `event: ${entry.type}\ndata: ${JSON.stringify(entry.data)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch (e) {
        this.clients.delete(res);
      }
    }
  }

  addClient(res) {
    this.clients.add(res);
    res.on('error', () => { this.clients.delete(res); });
    res.on('close', () => { this.clients.delete(res); });
    this.buffer.forEach((entry) => {
      try {
        const payload = `event: ${entry.type}\ndata: ${JSON.stringify(entry.data)}\n\n`;
        res.write(payload);
      } catch (e) {
        // ignore write errors on replay
      }
    });
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  connectConta(conta) {
    conta.mutex.on('lock:request', (ctx) => this.onEvent('lock:request', ctx));
    conta.mutex.on('lock:acquired', (ctx) => this.onEvent('lock:acquired', ctx));
    conta.mutex.on('lock:blocked', (ctx) => this.onEvent('lock:blocked', ctx));
    conta.mutex.on('lock:timeout', (ctx) => this.onEvent('lock:timeout', ctx));
    conta.mutex.on('lock:released', (ctx) => this.onEvent('lock:released', ctx));
  }

  disconnectConta(conta) {
    conta.mutex.removeAllListeners('lock:request');
    conta.mutex.removeAllListeners('lock:acquired');
    conta.mutex.removeAllListeners('lock:blocked');
    conta.mutex.removeAllListeners('lock:timeout');
    conta.mutex.removeAllListeners('lock:released');
  }
}

module.exports = LockLogger;
