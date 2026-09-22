export function busyWait(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Deliberately block the main thread for Experiment 1.
  }
}

export function createIntervalExperiment({ onProgress, onComplete }) {
  let timerId = 0;
  let samples = [];
  let startTime = 0;
  let last = 0;
  let durationMs = 10_000;
  let running = false;

  const buildResult = (endTime) => {
    if (samples.length === 0) return null;

    const elapsedMs = Math.max(1, endTime - startTime);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance =
      samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;

    return {
      callbacks: samples.length,
      fps: (samples.length * 1000) / elapsedMs,
      meanMs: mean,
      jitterMs: Math.sqrt(variance),
      minMs: Math.min(...samples),
      maxMs: Math.max(...samples),
      elapsedMs,
    };
  };

  const finish = (endTime = performance.now()) => {
    if (!running) return null;

    running = false;
    if (timerId !== 0) {
      window.clearInterval(timerId);
      timerId = 0;
    }

    const result = buildResult(endTime);
    if (result) onComplete?.(result);
    return result;
  };

  return {
    start(nextDurationMs = 10_000) {
      finish();
      samples = [];
      durationMs = nextDurationMs;
      startTime = performance.now();
      last = startTime;
      running = true;

      timerId = window.setInterval(() => {
        if (!running) return;

        const now = performance.now();
        samples.push(now - last);
        last = now;

        const elapsed = now - startTime;
        onProgress?.({ elapsed, durationMs, count: samples.length });

        if (elapsed >= durationMs) {
          finish(now);
        }
      }, 16);
    },

    stop() {
      return finish();
    },
  };
}
