import { Pool } from "@starship-arena/shared/sim/pool.ts";

/** All particles share one hidden class: every field exists from creation. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

function blankParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, hue: 0 };
}

/**
 * Sparks, engine trails and explosions. Dead particles go back to a pool and
 * the live list is compacted in place, so a running system allocates nothing.
 */
export class ParticleSystem {
  readonly pool: Pool<Particle>;
  /** Live particles are live[0..count); the array itself never shrinks. */
  readonly live: Particle[] = [];
  count = 0;
  readonly capacity: number;
  #seed = 12345;

  constructor(capacity = 1024) {
    this.capacity = capacity;
    // Prefill during loading, not during play.
    this.pool = new Pool(blankParticle, { prefill: capacity, max: capacity });
  }

  /** Cheap deterministic LCG: Math.random() would also be fine, this is testable. */
  #random(): number {
    this.#seed = (Math.imul(this.#seed, 1664525) + 1013904223) >>> 0;
    return this.#seed / 4294967296;
  }

  emit(
    x: number,
    y: number,
    count: number,
    speed: number,
    life: number,
    hue: number,
    size = 2,
    baseVx = 0,
    baseVy = 0,
  ): number {
    let emitted = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.count >= this.capacity) break;
      const particle = this.pool.acquire();
      const angle = this.#random() * Math.PI * 2;
      const velocity = speed * (0.35 + this.#random() * 0.65);
      particle.x = x;
      particle.y = y;
      particle.vx = baseVx + Math.cos(angle) * velocity;
      particle.vy = baseVy + Math.sin(angle) * velocity;
      particle.maxLife = life * (0.6 + this.#random() * 0.4);
      particle.life = particle.maxLife;
      particle.size = size;
      particle.hue = hue;
      this.live[this.count++] = particle;
      emitted += 1;
    }
    return emitted;
  }

  explosion(x: number, y: number, big: boolean): void {
    this.emit(x, y, big ? 48 : 24, big ? 220 : 160, big ? 0.9 : 0.6, 28, 3);
  }

  update(dt: number): void {
    const live = this.live;
    const drag = Math.pow(0.9, dt * 60);
    let kept = 0;
    for (let index = 0; index < this.count; index += 1) {
      const particle = live[index]!;
      particle.life -= dt;
      if (particle.life <= 0) {
        this.pool.release(particle);
        continue;
      }
      particle.vx *= drag;
      particle.vy *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      live[kept++] = particle;
    }
    this.count = kept;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const live = this.live;
    if (this.count === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    let lastHue = -1;
    for (let index = 0; index < this.count; index += 1) {
      const particle = live[index]!;
      if (particle.hue !== lastHue) {
        lastHue = particle.hue;
        ctx.fillStyle = HUES[particle.hue] ?? "#ffd28a";
      }
      ctx.globalAlpha = particle.life / particle.maxLife;
      const size = particle.size;
      ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    }
    ctx.restore();
  }
}

/** Pre-built colour strings: no string formatting per particle per frame. */
const HUES: Readonly<Record<number, string>> = Object.freeze({
  28: "#ffb45c",
  190: "#7fe3ff",
  50: "#fff1a8",
});
