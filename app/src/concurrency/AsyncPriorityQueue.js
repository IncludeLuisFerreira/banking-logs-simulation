class AsyncPriorityQueue {
  constructor(comparator) {
    this.heap = [];
    this.comparator = comparator;
    this.waiters = [];
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
    while (this.waiters.length > 0 && this.heap.length > 0) {
      const resolve = this.waiters.shift();
      resolve(this._pop());
    }
  }

  async poll(timeoutMs) {
    if (this.heap.length > 0) {
      return this._pop();
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(onResolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);

      const onResolve = (item) => {
        clearTimeout(timer);
        resolve(item);
      };

      this.waiters.push(onResolve);
    });
  }

  _pop() {
    if (this.isEmpty()) return undefined;
    const root = this.heap[0];
    const end = this.heap.pop();
    if (!this.isEmpty()) {
      this.heap[0] = end;
      this._sinkDown(0);
    }
    return root;
  }

  _bubbleUp(n) {
    const element = this.heap[n];
    while (n > 0) {
      const parentN = Math.floor((n - 1) / 2);
      const parent = this.heap[parentN];
      if (this.comparator(element, parent) >= 0) break;
      this.heap[parentN] = element;
      this.heap[n] = parent;
      n = parentN;
    }
  }

  _sinkDown(n) {
    const length = this.heap.length;
    const element = this.heap[n];
    while (true) {
      const leftChildN = 2 * n + 1;
      const rightChildN = 2 * n + 2;
      let swap = null;
      let leftChild, rightChild;
      if (leftChildN < length) {
        leftChild = this.heap[leftChildN];
        if (this.comparator(leftChild, element) < 0) swap = leftChildN;
      }
      if (rightChildN < length) {
        rightChild = this.heap[rightChildN];
        if (this.comparator(rightChild, (swap === null ? element : leftChild)) < 0) swap = rightChildN;
      }
      if (swap === null) break;
      this.heap[n] = this.heap[swap];
      this.heap[swap] = element;
      n = swap;
    }
  }
}

module.exports = AsyncPriorityQueue;