const DEFAULT_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.25;

export function createLoop({ step = DEFAULT_STEP, simulate, render }) {
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

  const stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
    totalSteps: 0,
    totalFrames: 0,
  };

  const frame = (now) => {
    if (!running) return;

    const start = performance.now();
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

    frameTimeMs = performance.now() - start;
    stats.stepsPerSecond = stepsPerSecond;
    stats.framesPerSecond = framesPerSecond;
    stats.frameTimeMs = frameTimeMs;
    stats.totalSteps = totalSteps;
    stats.totalFrames = totalFrames;
    render(accumulator / step, stats);

    rafId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      windowStart = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    getStats() {
      return { ...stats, totalSteps, totalFrames };
    },
  };
}


export function createVariableLoop({ simulate, render }) {
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let frames = 0;
  let windowStart = 0;
  let framesInWindow = 0;
  let framesPerSecond = 0;

  const stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
    totalFrames: 0,
  };

  const frame = (now) => {
    if (!running) return;

    const start = performance.now();
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
    stats.frameTimeMs = performance.now() - start;
    stats.totalFrames = frames;
    render(0, stats);
    rafId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      windowStart = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
