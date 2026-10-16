import type {
  LoopOptions,
  LoopStats,
  VariableLoopOptions,
  VariableLoopStats,
} from "./types.ts";

const DEFAULT_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.25;

export function createLoop({
  step = DEFAULT_STEP,
  simulate,
  render,
  recorder,
}: LoopOptions) {
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let totalSteps = 0;
  let totalFrames = 0;
  let windowStart = 0;
  let stepsInWindow = 0;
  let framesInWindow = 0;
  let stepsPerSecond = 0;
  let framesPerSecond = 0;
  let frameTimeMs = 0;
  const stats: LoopStats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
    totalSteps: 0,
    totalFrames: 0,
  };

  const frame = (now: number): void => {
    if (!running) return;
    const start = window.performance.now();
    recorder?.mark("frame-start");
    if (lastTime === 0) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, MAX_FRAME_DELTA);
    lastTime = now;
    accumulator += delta;
    while (accumulator + 1e-9 >= step) {
      simulate(step);
      accumulator -= step;
      totalSteps += 1;
      stepsInWindow += 1;
    }
    totalFrames += 1;
    framesInWindow += 1;
    if (windowStart === 0) windowStart = now;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      stepsPerSecond = (stepsInWindow * 1000) / elapsed;
      framesPerSecond = (framesInWindow * 1000) / elapsed;
      stepsInWindow = 0;
      framesInWindow = 0;
      windowStart = now;
    }
    frameTimeMs = window.performance.now() - start;
    stats.stepsPerSecond = stepsPerSecond;
    stats.framesPerSecond = framesPerSecond;
    stats.frameTimeMs = frameTimeMs;
    stats.totalSteps = totalSteps;
    stats.totalFrames = totalFrames;
    recorder?.mark("simulate-end");
    render(accumulator / step, stats);
    if (recorder) {
      recorder.mark("frame-end");
      recorder.measure("simulate", "frame-start", "simulate-end");
      recorder.measure("render", "simulate-end", "frame-end");
      recorder.measure("frame", "frame-start", "frame-end");
      recorder.record(start, window.performance.now() - start);
    }
    rafId = window.requestAnimationFrame(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      windowStart = 0;
      rafId = window.requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      window.cancelAnimationFrame(rafId);
    },
    getStats(): LoopStats {
      return { ...stats, totalSteps, totalFrames };
    },
  };
}

export function createVariableLoop({ simulate, render }: VariableLoopOptions) {
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let frames = 0;
  let windowStart = 0;
  let framesInWindow = 0;
  let framesPerSecond = 0;
  const stats: VariableLoopStats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
    totalFrames: 0,
  };

  const frame = (now: number): void => {
    if (!running) return;
    const start = window.performance.now();
    if (lastTime === 0) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    simulate(delta);
    frames += 1;
    framesInWindow += 1;
    if (windowStart === 0) windowStart = now;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      framesPerSecond = (framesInWindow * 1000) / elapsed;
      framesInWindow = 0;
      windowStart = now;
    }
    stats.stepsPerSecond = framesPerSecond;
    stats.framesPerSecond = framesPerSecond;
    stats.frameTimeMs = window.performance.now() - start;
    stats.totalFrames = frames;
    render(0, stats);
    rafId = window.requestAnimationFrame(frame);
  };
  return {
    start(): void {
      if (!running) {
        running = true;
        lastTime = 0;
        windowStart = 0;
        rafId = window.requestAnimationFrame(frame);
      }
    },
    stop(): void {
      running = false;
      window.cancelAnimationFrame(rafId);
    },
  };
}
