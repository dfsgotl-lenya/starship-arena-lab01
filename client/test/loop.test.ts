import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createLoop, createVariableLoop } from "../src/loop.ts";
import { FrameRecorder } from "../src/perf.ts";

describe("fixed-step game loop (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
        "setTimeout",
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  test("runs 60 simulation steps per simulated second regardless of frame count", () => {
    const steps: number[] = [];
    const loop = createLoop({
      step: 1 / 60,
      simulate: (dt) => steps.push(dt),
      render: () => undefined,
    });
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    expect(steps.length).toBeGreaterThanOrEqual(58);
    expect(steps.length).toBeLessThanOrEqual(61);
    expect(new Set(steps)).toEqual(new Set([1 / 60]));
  });

  test("a 2-second freeze is clamped to 0.25 s of catch-up (no spiral of death)", () => {
    vi.useRealTimers();
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        callbacks.push(cb);
        return callbacks.length;
      });
    let steps = 0;
    const loop = createLoop({
      step: 1 / 60,
      simulate: () => (steps += 1),
      render: () => undefined,
    });
    loop.start();
    callbacks.shift()?.(1000); // first frame only initialises lastTime
    expect(steps).toBe(0);
    callbacks.shift()?.(3000); // the tab froze for 2 s
    expect(steps).toBe(15); // 0.25 s × 60 Hz, not 120 steps
    loop.stop();
    raf.mockRestore();
  });

  test("render gets the interpolation alpha in [0, 1) and stats are updated", () => {
    const alphas: number[] = [];
    const loop = createLoop({
      step: 1 / 30,
      simulate: () => undefined,
      render: (alpha) => alphas.push(alpha),
    });
    loop.start();
    vi.advanceTimersByTime(1100);
    loop.stop();
    expect(alphas.every((a) => a >= 0 && a < 1)).toBe(true);
    const stats = loop.getStats();
    expect(stats.totalFrames).toBe(alphas.length);
    expect(stats.framesPerSecond).toBeGreaterThan(50);
    expect(stats.stepsPerSecond).toBeGreaterThan(25);
  });

  test("stop() cancels the next frame; start() twice does not double the loop", () => {
    let frames = 0;
    const loop = createLoop({
      simulate: () => undefined,
      render: () => (frames += 1),
    });
    loop.start();
    loop.start();
    vi.advanceTimersByTime(160);
    const counted = frames;
    expect(counted).toBeLessThanOrEqual(11);
    loop.stop();
    vi.advanceTimersByTime(500);
    expect(frames).toBe(counted);
  });

  test("the frame recorder collects per-frame work time while recording", () => {
    const recorder = new FrameRecorder(true);
    const loop = createLoop({
      simulate: () => undefined,
      render: () => undefined,
      recorder,
    });
    loop.start();
    vi.advanceTimersByTime(100);
    recorder.start();
    vi.advanceTimersByTime(1000);
    const summary = recorder.stop();
    loop.stop();
    expect(summary.frames).toBeGreaterThan(50);
    expect(summary.intervalP50).toBeGreaterThan(0);
    expect(summary.workP99).toBeGreaterThanOrEqual(summary.workP50);
  });

  test("variable loop passes the real delta to simulate", () => {
    const deltas: number[] = [];
    const loop = createVariableLoop({
      simulate: (dt) => deltas.push(dt),
      render: () => undefined,
    });
    loop.start();
    vi.advanceTimersByTime(200);
    loop.stop();
    expect(deltas.length).toBeGreaterThan(5);
    expect(deltas.slice(1).every((d) => d > 0 && d <= 0.25)).toBe(true);
  });
});
