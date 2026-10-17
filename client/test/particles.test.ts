import { describe, expect, test } from "vitest";
import { ParticleSystem } from "../src/render/particles.ts";

describe("ParticleSystem (pooled)", () => {
  test("emit takes particles from the pre-filled pool", () => {
    const system = new ParticleSystem(64);
    expect(system.pool.available).toBe(64);
    system.emit(10, 10, 20, 100, 1, 28);
    expect(system.count).toBe(20);
    expect(system.pool.available).toBe(44);
    expect(system.pool.created).toBe(64);
  });

  test("capacity is a hard cap", () => {
    const system = new ParticleSystem(16);
    expect(system.emit(0, 0, 100, 10, 1, 28)).toBe(16);
    expect(system.count).toBe(16);
  });

  test("dead particles go back to the pool and are reused without new allocations", () => {
    const system = new ParticleSystem(32);
    system.explosion(0, 0, false);
    for (let i = 0; i < 120; i += 1) system.update(1 / 60);
    expect(system.count).toBe(0);
    expect(system.pool.available).toBe(32);
    system.explosion(0, 0, true);
    expect(system.pool.created).toBe(32);
    expect(system.pool.reused).toBeGreaterThan(0);
  });

  test("particles move and slow down", () => {
    const system = new ParticleSystem(4);
    system.emit(100, 100, 1, 100, 1, 28);
    const p = system.live[0]!;
    const speed = Math.hypot(p.vx, p.vy);
    system.update(0.1);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThan(speed);
    expect(p.x !== 100 || p.y !== 100).toBe(true);
  });

  test("draw issues one fillRect per live particle", () => {
    const system = new ParticleSystem(8);
    system.emit(0, 0, 3, 10, 1, 190);
    let rects = 0;
    const ctx = {
      save() {},
      restore() {},
      fillRect: () => (rects += 1),
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    system.draw(ctx);
    expect(rects).toBe(3);
  });
});
