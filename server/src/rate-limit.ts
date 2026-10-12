export class TokenBucket {
  readonly #capacity: number;
  #tokens: number;
  readonly #refillPerMs: number;
  #last: number;

  constructor(ratePerSecond: number, capacity = ratePerSecond) {
    this.#capacity = capacity;
    this.#tokens = capacity;
    this.#refillPerMs = ratePerSecond / 1000;
    this.#last = Date.now();
  }

  consume(cost = 1): boolean {
    const now = Date.now();
    const elapsed = now - this.#last;
    this.#last = now;
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + elapsed * this.#refillPerMs,
    );
    if (this.#tokens < cost) return false;
    this.#tokens -= cost;
    return true;
  }
}
