export function busyWait(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Deliberately block the main thread for Experiment 1.
  }
}

export function createIntervalExperiment(onProgress) {
  const samples = [];
  let timerId = 0;
  let last = performance.now();
  let endAt = 0;

  const stop = () => {
    if (timerId !== 0) {
      window.clearInterval(timerId);
      timerId = 0;
    }
    if (samples.length === 0) return null;

    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
    const stdev = Math.sqrt(variance);

    return {
      frames: samples.length,
      fps: samples.length / 10,
      meanMs: mean,
      jitterMs: stdev,
      minMs: Math.min(...samples),
      maxMs: Math.max(...samples),
    };
  };

  return {
    start(durationMs = 10_000) {
      stop();
      samples.length = 0;
      last = performance.now();
      endAt = last + durationMs;

      timerId = window.setInterval(() => {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        onProgress({ elapsed: durationMs - Math.max(0, endAt - now), count: samples.length });

        if (now >= endAt) {
          stop();
        }
      }, 16);
    },
    stop,
  };
}
