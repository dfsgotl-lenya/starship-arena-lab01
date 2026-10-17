/**
 * Uniform-grid spatial hash for the collision broad phase.
 *
 * Instead of testing every bullet against every target (O(n·m)), targets are
 * bucketed by cell and each bullet only looks at the cells its bounding circle
 * touches.
 *
 * Allocation-free when warm: buckets are arrays with a separate count in an
 * Int32Array. We never write `array.length = 0` — V8 drops the backing store
 * on that, and the next push() allocates a new one (measured in Lab 7).
 */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export class SpatialHash<T extends Circle> {
  readonly cellSize: number;
  readonly #cols: number;
  readonly #rows: number;
  readonly #cells: T[][];
  readonly #counts: Int32Array;
  readonly #used: Int32Array;
  #usedCount = 0;
  readonly #stamp: Int32Array;
  #query = 0;

  constructor(width: number, height: number, cellSize = 64) {
    this.cellSize = cellSize;
    this.#cols = Math.max(1, Math.ceil(width / cellSize));
    this.#rows = Math.max(1, Math.ceil(height / cellSize));
    const cells = this.#cols * this.#rows;
    this.#cells = Array.from({ length: cells }, () => []);
    this.#counts = new Int32Array(cells);
    this.#used = new Int32Array(cells);
    this.#stamp = new Int32Array(cells);
  }

  clear(): void {
    for (let i = 0; i < this.#usedCount; i += 1)
      this.#counts[this.#used[i]!] = 0;
    this.#usedCount = 0;
  }

  insert(item: T): void {
    const minX = this.#col(item.x - item.radius);
    const maxX = this.#col(item.x + item.radius);
    const minY = this.#row(item.y - item.radius);
    const maxY = this.#row(item.y + item.radius);
    for (let row = minY; row <= maxY; row += 1)
      for (let col = minX; col <= maxX; col += 1) {
        const index = row * this.#cols + col;
        const count = this.#counts[index]!;
        if (count === 0) this.#used[this.#usedCount++] = index;
        this.#cells[index]![count] = item;
        this.#counts[index] = count + 1;
      }
  }

  /**
   * Writes every item whose cells overlap the circle into `out[0..n)` without
   * duplicates and returns n. `out` is a caller-owned scratch array that only
   * ever grows.
   */
  query(x: number, y: number, radius: number, out: T[]): number {
    let found = 0;
    this.#query += 1;
    const minX = this.#col(x - radius);
    const maxX = this.#col(x + radius);
    const minY = this.#row(y - radius);
    const maxY = this.#row(y + radius);
    for (let row = minY; row <= maxY; row += 1)
      for (let col = minX; col <= maxX; col += 1) {
        const index = row * this.#cols + col;
        if (this.#stamp[index] === this.#query) continue;
        this.#stamp[index] = this.#query;
        const cell = this.#cells[index]!;
        const count = this.#counts[index]!;
        for (let i = 0; i < count; i += 1) {
          const item = cell[i]!;
          let seen = false;
          for (let j = 0; j < found && !seen; j += 1) seen = out[j] === item;
          if (!seen) out[found++] = item;
        }
      }
    return found;
  }

  #col(x: number): number {
    return Math.min(this.#cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }
  #row(y: number): number {
    return Math.min(this.#rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }
}
