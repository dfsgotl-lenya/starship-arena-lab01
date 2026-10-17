import { describe, expect, test } from "vitest";
import { createInput } from "../src/input.ts";
import { Bus } from "../src/events.ts";
import type { GameEvents } from "../src/events.ts";
import { FrameRecorder, percentile } from "../src/perf.ts";

describe("input", () => {
  test("tracks held keys, presses this frame and clears on blur", () => {
    const input = createInput(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(input.isDown("KeyW")).toBe(true);
    expect(input.justPressed("KeyW")).toBe(true);
    input.endFrame();
    expect(input.justPressed("KeyW")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    expect(input.isDown("KeyW")).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
    window.dispatchEvent(new Event("blur"));
    expect(input.isDown("KeyA")).toBe(false);
    input.destroy();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(input.isDown("KeyD")).toBe(false);
  });
});

describe("event bus", () => {
  test("emit dispatches a CustomEvent with the typed payload", () => {
    const bus = new Bus<GameEvents>();
    const scores: number[] = [];
    bus.addEventListener("hit", (event) =>
      scores.push((event as CustomEvent<{ score: number }>).detail.score),
    );
    bus.emit("hit", { score: 40 });
    expect(scores).toEqual([40]);
  });
});

describe("frame statistics", () => {
  test("percentile uses nearest-rank on sorted data", () => {
    const sorted = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.99)).toBe(99);
    expect(percentile(new Float64Array(), 0.5)).toBe(0);
  });

  test("recorder ignores frames while stopped and counts long frames", () => {
    const recorder = new FrameRecorder();
    recorder.record(0, 1);
    expect(recorder.summary().frames).toBe(0);
    recorder.start();
    recorder.record(0, 1);
    recorder.record(16.7, 2);
    recorder.record(60, 3); // 43 ms gap → long frame
    const summary = recorder.stop();
    expect(summary.frames).toBe(3);
    expect(summary.longFrames).toBe(1);
    expect(summary.workMax).toBe(3);
  });
});
