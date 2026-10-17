/**
 * Generic free-list object pool.
 *
 * Objects are created once with `create()` (so all of them share one hidden
 * class) and recycled through `release()`. Acquiring a recycled object does
 * not allocate, which keeps short-lived things (bullets, particles, pending
 * inputs) out of the young generation and away from the scavenger.
 */
export class Pool<T> {
  readonly #free: T[] = [];
  readonly #create: () => T;
  readonly #reset: ((item: T) => void) | undefined;
  readonly #max: number;
  created = 0;
  reused = 0;

  constructor(
    create: () => T,
    { reset, prefill = 0, max = Infinity }: PoolOptions<T> = {},
  ) {
    this.#create = create;
    this.#reset = reset;
    this.#max = max;
    for (let index = 0; index < prefill; index += 1) {
      this.#free.push(create());
      this.created += 1;
    }
  }

  acquire(): T {
    const item = this.#free.pop();
    if (item !== undefined) {
      this.reused += 1;
      return item;
    }
    this.created += 1;
    return this.#create();
  }

  release(item: T): void {
    if (this.#free.length >= this.#max) return;
    this.#reset?.(item);
    this.#free.push(item);
  }

  get available(): number {
    return this.#free.length;
  }
}

export interface PoolOptions<T> {
  readonly reset?: (item: T) => void;
  /** Objects created up front, e.g. during loading instead of during play. */
  readonly prefill?: number;
  /** Upper bound for the free list; extra released objects are dropped. */
  readonly max?: number;
}
