export class Entity {
  static #nextId = 1;
  #id = Entity.#nextId++;

  constructor({ pos, vel, radius, kind, angle = 0 } = {}) {
    this.pos = pos;
    this.vel = vel;
    this.radius = radius;
    this.kind = kind;
    this.angle = angle;
    this.alive = true;
    this.prevPos = pos.clone();
    this.prevAngle = angle;
  }

  get id() {
    return this.#id;
  }

  capturePrevious() {
    this.prevPos = this.pos.clone();
    this.prevAngle = this.angle;
  }

  update() {
    // Base entity has no movement by itself.
  }

  draw() {
    // Rendering is handled by the renderer system.
  }
}
