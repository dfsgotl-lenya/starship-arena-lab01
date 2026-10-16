/**
 * Frame-time instrumentation for Lab 7.
 *
 * - `performance.mark/measure` around simulate and render, only when the page
 *   is opened with `?perf=1` (each PerformanceEntry is itself an allocation).
 * - A fixed-size Float64Array ring stores per-frame work time and the interval
 *   between frames, so recording does not create garbage.
 * - `window.__perf` lets the Playwright profiler read p50/p95/p99.
 */
const CAPACITY = 1 << 14; // ~4.5 min at 60 fps

export interface FrameSummary {
  readonly frames: number;
  readonly workP50: number;
  readonly workP95: number;
  readonly workP99: number;
  readonly workMax: number;
  readonly intervalP50: number;
  readonly intervalP95: number;
  readonly intervalP99: number;
  readonly intervalMax: number;
  readonly longFrames: number;
}

export class FrameRecorder {
  readonly #work = new Float64Array(CAPACITY);
  readonly #interval = new Float64Array(CAPACITY);
  #count = 0;
  #recording = false;
  #lastFrameAt = 0;
  readonly useMarks: boolean;

  constructor(useMarks = false) {
    this.useMarks = useMarks;
  }

  start(): void {
    this.#count = 0;
    this.#lastFrameAt = 0;
    this.#recording = true;
    if (this.useMarks) {
      performance.clearMarks();
      performance.clearMeasures();
    }
  }

  stop(): FrameSummary {
    this.#recording = false;
    return this.summary();
  }

  get recording(): boolean {
    return this.#recording;
  }

  mark(name: string): void {
    if (this.useMarks && this.#recording) performance.mark(name);
  }

  measure(name: string, start: string, end: string): void {
    if (this.useMarks && this.#recording) performance.measure(name, start, end);
  }

  record(frameStart: number, workMs: number): void {
    if (!this.#recording) return;
    const index = this.#count % CAPACITY;
    this.#work[index] = workMs;
    this.#interval[index] =
      this.#lastFrameAt === 0 ? 0 : frameStart - this.#lastFrameAt;
    this.#lastFrameAt = frameStart;
    this.#count += 1;
  }

  summary(): FrameSummary {
    const n = Math.min(this.#count, CAPACITY);
    const work = this.#work.slice(0, n).sort();
    // The first interval is 0 by construction; ignore it.
    const interval = this.#interval.slice(1, n).sort();
    let longFrames = 0;
    for (const value of interval) if (value > 1000 / 60 + 4) longFrames += 1;
    return {
      frames: n,
      workP50: percentile(work, 0.5),
      workP95: percentile(work, 0.95),
      workP99: percentile(work, 0.99),
      workMax: work[work.length - 1] ?? 0,
      intervalP50: percentile(interval, 0.5),
      intervalP95: percentile(interval, 0.95),
      intervalP99: percentile(interval, 0.99),
      intervalMax: interval[interval.length - 1] ?? 0,
      longFrames,
    };
  }
}

export function percentile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

declare global {
  interface Window {
    __perf?: {
      readonly recorder: FrameRecorder;
      start(): void;
      stop(): FrameSummary;
      entities(): number;
    };
  }
}
