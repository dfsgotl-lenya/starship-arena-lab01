export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  sub(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(value) {
    return new Vector2(this.x * value, this.y * value);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const length = this.length();
    return length > 1e-9 ? this.scale(1 / length) : new Vector2();
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  addInPlace(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  scaleInPlace(value) {
    this.x *= value;
    this.y *= value;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  static fromAngle(angle, magnitude = 1) {
    return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }
}
