var oe = (t) => {
  throw TypeError(t);
};
var te = (t, e, s) => e.has(t) || oe("Cannot " + s);
var h = (t, e, s) => (
    te(t, e, "read from private field"),
    s ? s.call(t) : e.get(t)
  ),
  S = (t, e, s) =>
    e.has(t)
      ? oe("Cannot add the same private member more than once")
      : e instanceof WeakSet
        ? e.add(t)
        : e.set(t, s),
  g = (t, e, s, n) => (
    te(t, e, "write to private field"),
    n ? n.call(t, s) : e.set(t, s),
    s
  ),
  H = (t, e, s) => (te(t, e, "access private method"), s);
var re = (t, e, s, n) => ({
  set _(i) {
    g(t, e, i, s);
  },
  get _() {
    return h(t, e, n);
  },
});
(function () {
  const e = document.createElement("link").relList;
  if (e && e.supports && e.supports("modulepreload")) return;
  for (const i of document.querySelectorAll('link[rel="modulepreload"]')) n(i);
  new MutationObserver((i) => {
    for (const o of i)
      if (o.type === "childList")
        for (const r of o.addedNodes)
          r.tagName === "LINK" && r.rel === "modulepreload" && n(r);
  }).observe(document, { childList: !0, subtree: !0 });
  function s(i) {
    const o = {};
    return (
      i.integrity && (o.integrity = i.integrity),
      i.referrerPolicy && (o.referrerPolicy = i.referrerPolicy),
      i.crossOrigin === "use-credentials"
        ? (o.credentials = "include")
        : i.crossOrigin === "anonymous"
          ? (o.credentials = "omit")
          : (o.credentials = "same-origin"),
      o
    );
  }
  function n(i) {
    if (i.ep) return;
    i.ep = !0;
    const o = s(i);
    fetch(i.href, o);
  }
})();
const be = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "Space",
];
function Se(t = window) {
  const e = new Set(),
    s = new Set(),
    n = (r) => {
      (be.includes(r.code) && r.preventDefault(),
        r.repeat || s.add(r.code),
        e.add(r.code));
    },
    i = (r) => e.delete(r.code),
    o = () => e.clear();
  return (
    t.addEventListener("keydown", n, { passive: !1 }),
    t.addEventListener("keyup", i),
    t.addEventListener("blur", o),
    {
      isDown: (r) => e.has(r),
      justPressed: (r) => s.has(r),
      endFrame: () => s.clear(),
      destroy: () => {
        (t.removeEventListener("keydown", n),
          t.removeEventListener("keyup", i),
          t.removeEventListener("blur", o));
      },
    }
  );
}
const ke = 1 / 60,
  Ee = 0.25;
function Pe({ step: t = ke, simulate: e, render: s }) {
  let n = !1,
    i = 0,
    o = 0,
    r = 0,
    a = 0,
    l = 0,
    u = 0,
    m = 0,
    p = 0,
    v = 0,
    c = 0,
    y = 0;
  const b = {
      stepsPerSecond: 0,
      framesPerSecond: 0,
      frameTimeMs: 0,
      totalSteps: 0,
      totalFrames: 0,
    },
    P = (M) => {
      if (!n) return;
      const ve = window.performance.now();
      o === 0 && (o = M);
      const ge = Math.min((M - o) / 1e3, Ee);
      for (o = M, r += ge; r + 1e-9 >= t;) (e(t), (r -= t), (a += 1), (m += 1));
      ((l += 1), (p += 1), u === 0 && (u = M));
      const ee = M - u;
      (ee >= 1e3 &&
        ((v = (m * 1e3) / ee), (c = (p * 1e3) / ee), (m = 0), (p = 0), (u = M)),
        (y = window.performance.now() - ve),
        (b.stepsPerSecond = v),
        (b.framesPerSecond = c),
        (b.frameTimeMs = y),
        (b.totalSteps = a),
        (b.totalFrames = l),
        s(r / t, b),
        (i = window.requestAnimationFrame(P)));
    };
  return {
    start() {
      n ||
        ((n = !0),
        (o = 0),
        (r = 0),
        (u = 0),
        (i = window.requestAnimationFrame(P)));
    },
    stop() {
      ((n = !1), window.cancelAnimationFrame(i));
    },
    getStats() {
      return { ...b, totalSteps: a, totalFrames: l };
    },
  };
}
function Ae(t, e = () => {}) {
  const s = t.getContext("2d");
  let n = 0,
    i = 0,
    o = 1;
  const r = () => {
      const l = t.getBoundingClientRect();
      ((n = Math.max(1, l.width)),
        (i = Math.max(1, l.height)),
        (o = Math.min(window.devicePixelRatio || 1, 2)),
        (t.width = Math.round(n * o)),
        (t.height = Math.round(i * o)),
        s.setTransform(o, 0, 0, o, 0, 0),
        e({ width: n, height: i, dpr: o }));
    },
    a = new ResizeObserver(r);
  return (
    a.observe(t),
    r(),
    {
      ctx: s,
      get size() {
        return { width: n, height: i, dpr: o };
      },
      destroy() {
        a.disconnect();
      },
    }
  );
}
const J = Math.PI * 2;
function ae(t, e, s) {
  return t + (e - t) * s;
}
function Me(t, e, s) {
  let n = ((e - t + Math.PI) % J) - Math.PI;
  return (n < -Math.PI && (n += J), t + n * s);
}
function xe(t, e, s, n) {
  (t.save(), (t.strokeStyle = "rgb(74 134 173 / 18%)"), (t.lineWidth = 1));
  const i = 64,
    o = (n * 6) % i;
  for (let r = -i + o; r < e + i; r += i)
    (t.beginPath(), t.moveTo(r, 0), t.lineTo(r, s), t.stroke());
  for (let r = -i + o; r < s + i; r += i)
    (t.beginPath(), t.moveTo(0, r), t.lineTo(e, r), t.stroke());
  t.restore();
}
function Te(t, e, s, n, i) {
  const o = t.createLinearGradient(0, 0, 0, s);
  (o.addColorStop(0, "#020713"),
    o.addColorStop(0.55, "#071425"),
    o.addColorStop(1, "#02080f"),
    (t.fillStyle = o),
    t.fillRect(0, 0, e, s),
    xe(t, e, s, n),
    t.save());
  for (const r of i)
    ((t.globalAlpha = 0.45 + Math.sin(n * r.speed + r.phase) * 0.2),
      (t.fillStyle = "#d9f6ff"),
      t.fillRect(r.x * e, r.y * s, r.size, r.size));
  t.restore();
}
function Ce(t, e, s) {
  (t.save(),
    (t.strokeStyle = "rgb(101 215 255 / 30%)"),
    (t.lineWidth = 2),
    t.strokeRect(1, 1, e - 2, s - 2),
    t.restore());
}
function V(t, e) {
  return {
    x: ae(t.prevPos.x, t.pos.x, e),
    y: ae(t.prevPos.y, t.pos.y, e),
    angle: Me(t.prevAngle, t.angle, e),
  };
}
function ie(t, e, s, n, i, o, r, a = 0, l = 1) {
  if (!(e != null && e.image)) return;
  const u = e.frames ?? 4,
    m = e.frameWidth,
    p = e.frameHeight,
    v = s % u;
  (t.save(),
    t.translate(n, i),
    t.rotate(a),
    (t.imageSmoothingEnabled = !0),
    t.drawImage(
      e.image,
      v * m,
      0,
      m,
      p,
      (-o * l) / 2,
      (-r * l) / 2,
      o * l,
      r * l,
    ),
    t.restore());
}
function Le(t, e, s, n) {
  const i = V(e, s),
    o = Math.floor((window.performance.now() / 120) % 4);
  (ie(t, n.sprites.ship, o, i.x, i.y, 48, 48, i.angle, 1),
    e.shieldTime > 0 &&
      (t.save(),
      (t.strokeStyle = "rgb(105 215 255 / 70%)"),
      (t.lineWidth = 3),
      t.beginPath(),
      t.arc(
        i.x,
        i.y,
        e.radius + 8 + Math.sin(window.performance.now() * 0.008) * 2,
        0,
        J,
      ),
      t.stroke(),
      t.restore()));
}
function Ie(t, e, s, n) {
  const i = V(e, s),
    o = Math.floor((e.ttl * 18) % 4);
  ie(t, n.sprites.bullet, o, i.x, i.y, 24, 24, i.angle, 1);
}
function $e(t, e, s, n) {
  const i = V(e, s),
    o = e.variant % 4;
  (ie(t, n.sprites.asteroid, o, i.x, i.y, 64, 64, i.angle, 1),
    e.homing &&
      (t.save(),
      (t.strokeStyle = "rgb(255 157 102 / 55%)"),
      t.beginPath(),
      t.arc(i.x, i.y, e.radius + 5, 0, J),
      t.stroke(),
      t.restore()));
}
function Re(t, e, s) {
  const n = V(e, s);
  (t.save(),
    t.translate(n.x, n.y),
    t.rotate(e.spin),
    (t.strokeStyle = e.pickupType === "shield" ? "#62d6ff" : "#ffcf58"),
    (t.fillStyle = "rgb(11 28 43 / 90%)"),
    (t.lineWidth = 2),
    t.beginPath(),
    t.rect(-10, -10, 20, 20),
    t.fill(),
    t.stroke(),
    (t.fillStyle = e.pickupType === "shield" ? "#bff3ff" : "#fff0ad"),
    (t.font = "bold 10px system-ui"),
    (t.textAlign = "center"),
    (t.textBaseline = "middle"),
    t.fillText(e.pickupType === "shield" ? "S" : "R", 0, 0),
    t.restore());
}
function qe(t, e) {
  t.save();
  for (const s of e.particles) {
    const n = Math.min(1, s.age / s.life),
      i = s.speed * s.age,
      o = e.pos.x + Math.cos(s.angle) * i,
      r = e.pos.y + Math.sin(s.angle) * i;
    ((t.globalAlpha = 1 - n),
      (t.fillStyle = "#ffd36e"),
      t.fillRect(o, r, s.size, s.size));
  }
  t.restore();
}
function Fe(t, e, s, n) {
  for (const i of e)
    i.alive &&
      (i.kind === "ship"
        ? Le(t, i, s, n)
        : i.kind === "bullet"
          ? Ie(t, i, s, n)
          : i.kind === "asteroid"
            ? $e(t, i, s, n)
            : i.kind === "pickup"
              ? Re(t, i, s)
              : i.kind === "explosion" && qe(t, i));
}
var Q, Z;
const _ = class _ {
  constructor({ pos: e, vel: s, radius: n, kind: i, angle: o = 0 } = {}) {
    S(this, Z, re(_, Q)._++);
    ((this.pos = e),
      (this.vel = s),
      (this.radius = n),
      (this.kind = i),
      (this.angle = o),
      (this.alive = !0),
      (this.prevPos = e.clone()),
      (this.prevAngle = o));
  }
  get id() {
    return h(this, Z);
  }
  capturePrevious() {
    ((this.prevPos = this.pos.clone()), (this.prevAngle = this.angle));
  }
  update() {}
  draw() {}
};
((Q = new WeakMap()), (Z = new WeakMap()), S(_, Q, 1));
let F = _;
class w {
  constructor(e = 0, s = 0) {
    ((this.x = e), (this.y = s));
  }
  add(e) {
    return new w(this.x + e.x, this.y + e.y);
  }
  sub(e) {
    return new w(this.x - e.x, this.y - e.y);
  }
  scale(e) {
    return new w(this.x * e, this.y * e);
  }
  length() {
    return Math.hypot(this.x, this.y);
  }
  normalize() {
    const e = this.length();
    return e > 1e-9 ? this.scale(1 / e) : new w();
  }
  rotate(e) {
    const s = Math.cos(e),
      n = Math.sin(e);
    return new w(this.x * s - this.y * n, this.x * n + this.y * s);
  }
  dot(e) {
    return this.x * e.x + this.y * e.y;
  }
  addInPlace(e) {
    return ((this.x += e.x), (this.y += e.y), this);
  }
  scaleInPlace(e) {
    return ((this.x *= e), (this.y *= e), this);
  }
  clone() {
    return new w(this.x, this.y);
  }
  static fromAngle(e, s = 1) {
    return new w(Math.cos(e) * s, Math.sin(e) * s);
  }
}
function ce({
  targetKind: t,
  turnRate: e = 3.5,
  acceleration: s = 80,
  maxSpeed: n = 320,
}) {
  return {
    targetKind: t,
    turnRate: e,
    acceleration: s,
    maxSpeed: n,
    update(i, o, r) {
      let a = null,
        l = Number.POSITIVE_INFINITY;
      for (const P of o.ofKind(t)) {
        if (!P.alive || P.id === i.id) continue;
        const M = P.pos.sub(i.pos).length();
        M < l && ((a = P), (l = M));
      }
      if (!a) return;
      const u = a.pos.sub(i.pos).normalize(),
        m = i.vel.length() > 1e-6 ? i.vel.normalize() : w.fromAngle(i.angle),
        p = m.x * u.y - m.y * u.x,
        v = Math.max(-1, Math.min(1, m.dot(u))),
        c = Math.atan2(p, v),
        y = Math.max(-e * r, Math.min(e * r, c));
      ((i.vel = i.vel.rotate(y).add(u.scale(s * r))),
        i.vel.length() > n && (i.vel = i.vel.normalize().scale(n)),
        (i.angle = Math.atan2(i.vel.y, i.vel.x)));
    },
  };
}
class De extends F {
  constructor(e, s, n = 0, { ownerId: i = null, homing: o = !1 } = {}) {
    (super({ pos: e, vel: s, radius: 5, kind: "bullet", angle: n }),
      (this.ttl = 2.2),
      (this.ownerId = i),
      (this.homing = o
        ? ce({
            targetKind: "asteroid",
            turnRate: 5.2,
            acceleration: 35,
            maxSpeed: 560,
          })
        : null));
  }
  update(e, s) {
    (this.homing && this.homing.update(this, s.world, e),
      (this.pos = this.pos.add(this.vel.scale(e))),
      (this.ttl -= e),
      this.ttl <= 0 && (this.alive = !1),
      (this.pos.x < -40 ||
        this.pos.x > s.width + 40 ||
        this.pos.y < -40 ||
        this.pos.y > s.height + 40) &&
        (this.alive = !1));
  }
}
var I;
class ne extends F {
  constructor(s, n) {
    super({ pos: new w(s, n), vel: new w(), radius: 18, kind: "ship" });
    S(this, I, 100);
    ((this.maxHp = 100),
      (this.turnSpeed = 3.4),
      (this.thrustAcceleration = 260),
      (this.drag = 0.992),
      (this.maxSpeed = 420),
      (this.fireCooldown = 0),
      (this.fireInterval = 0.24),
      (this.shieldTime = 0),
      (this.rapidFireTime = 0));
  }
  get hp() {
    return h(this, I);
  }
  get activePowerup() {
    return this.shieldTime > 0
      ? `SHIELD ${this.shieldTime.toFixed(1)}s`
      : this.rapidFireTime > 0
        ? `RAPID ${this.rapidFireTime.toFixed(1)}s`
        : "—";
  }
  update(s, { input: n }) {
    const i = n.isDown("ArrowLeft") || n.isDown("KeyA"),
      o = n.isDown("ArrowRight") || n.isDown("KeyD"),
      r = n.isDown("ArrowUp") || n.isDown("KeyW"),
      a = Number(o) - Number(i);
    ((this.angle += a * this.turnSpeed * s),
      r &&
        (this.vel = this.vel.add(
          w.fromAngle(this.angle, this.thrustAcceleration * s),
        )),
      (this.vel = this.vel.scale(Math.pow(this.drag, s * 60))),
      this.vel.length() > this.maxSpeed &&
        (this.vel = this.vel.normalize().scale(this.maxSpeed)),
      (this.pos = this.pos.add(this.vel.scale(s))),
      (this.fireCooldown = Math.max(0, this.fireCooldown - s)),
      (this.shieldTime = Math.max(0, this.shieldTime - s)),
      (this.rapidFireTime = Math.max(0, this.rapidFireTime - s)),
      this.rapidFireTime === 0 && (this.fireInterval = 0.24));
  }
  fire(s) {
    if (!this.alive || this.fireCooldown > 0) return null;
    const n = w.fromAngle(this.angle, this.radius + 11),
      i = this.vel.add(w.fromAngle(this.angle, 520)),
      o = new De(this.pos.add(n), i, this.angle, {
        ownerId: this.id,
        homing: s.bulletHomingEnabled,
      });
    return (
      s.spawn(o),
      s.events.dispatchEvent(
        new window.CustomEvent("fired", {
          detail: { shipId: this.id, bullet: o },
        }),
      ),
      (this.fireCooldown = this.fireInterval),
      o
    );
  }
  damage(s, n) {
    return !this.alive || this.shieldTime > 0
      ? !1
      : (g(this, I, Math.max(0, h(this, I) - s)),
        h(this, I) === 0 && n.destroyShip(this),
        !0);
  }
  healFull() {
    (g(this, I, this.maxHp),
      (this.alive = !0),
      (this.shieldTime = 0),
      (this.rapidFireTime = 0));
  }
  activateShield(s = 6) {
    this.shieldTime = Math.max(this.shieldTime, s);
  }
  activateRapidFire(s = 6) {
    ((this.rapidFireTime = Math.max(this.rapidFireTime, s)),
      (this.fireInterval = 0.08));
  }
}
I = new WeakMap();
class Be extends F {
  constructor(e, s, n, i, o = 24, r = !1) {
    (super({ pos: new w(e, s), vel: new w(n, i), radius: o, kind: "asteroid" }),
      (this.rotationSpeed = (Math.random() - 0.5) * 2),
      (this.homing = r
        ? ce({
            targetKind: "ship",
            turnRate: 1.7,
            acceleration: 18,
            maxSpeed: 90,
          })
        : null),
      (this.variant = Math.floor(Math.random() * 3)));
  }
  update(e, s) {
    (this.homing && this.homing.update(this, s.world, e),
      (this.pos = this.pos.add(this.vel.scale(e))),
      (this.angle += this.rotationSpeed * e),
      this.pos.x < this.radius &&
        this.vel.x < 0 &&
        (this.vel = new w(-this.vel.x, this.vel.y)),
      this.pos.x > s.width - this.radius &&
        this.vel.x > 0 &&
        (this.vel = new w(-this.vel.x, this.vel.y)),
      this.pos.y < this.radius &&
        this.vel.y < 0 &&
        (this.vel = new w(this.vel.x, -this.vel.y)),
      this.pos.y > s.height - this.radius &&
        this.vel.y > 0 &&
        (this.vel = new w(this.vel.x, -this.vel.y)));
  }
}
class le extends F {
  constructor(e, s, n = "shield") {
    (super({ pos: new w(e, s), vel: new w(), radius: 14, kind: "pickup" }),
      (this.pickupType = n),
      (this.spin = Math.random() * Math.PI * 2));
  }
  update(e) {
    this.spin += e * 1.8;
  }
  collect(e) {
    (this.pickupType === "shield" && e.activateShield(7),
      this.pickupType === "rapid" && e.activateRapidFire(7),
      (this.alive = !1));
  }
}
class je extends F {
  constructor(e, s) {
    (super({ pos: new w(e, s), vel: new w(), radius: 2, kind: "explosion" }),
      (this.ttl = 0.55),
      (this.particles = Array.from({ length: 18 }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 45 + Math.random() * 170,
        size: 1 + Math.random() * 3,
        life: 0.25 + Math.random() * 0.3,
        age: 0,
      }))));
  }
  update(e) {
    this.ttl -= e;
    for (const s of this.particles) s.age += e;
    this.ttl <= 0 && (this.alive = !1);
  }
}
function ze(t) {
  const e = [...t],
    s = [];
  for (let n = 0; n < e.length; n += 1) {
    const i = e[n];
    if (i.alive)
      for (let o = n + 1; o < e.length; o += 1) {
        const r = e[o];
        if (!r.alive) continue;
        const a = i.pos.x - r.pos.x,
          l = i.pos.y - r.pos.y,
          u = i.radius + r.radius;
        a * a + l * l <= u * u && s.push([i, r]);
      }
  }
  return s;
}
function Ne(t) {
  for (const [e, s] of ze(t)) {
    if (!e.alive || !s.alive) continue;
    const n = new Set([e.kind, s.kind]);
    if (n.has("bullet") && n.has("asteroid")) {
      const i = e.kind === "bullet" ? e : s,
        o = e.kind === "asteroid" ? e : s;
      ((i.alive = !1),
        (o.alive = !1),
        t.addScore(10),
        t.events.dispatchEvent(
          new window.CustomEvent("hit", { detail: { attacker: i, target: o } }),
        ),
        t.spawnExplosion(o.pos.x, o.pos.y));
      continue;
    }
    if (n.has("bullet") && n.has("ship")) {
      const i = e.kind === "bullet" ? e : s,
        o = e.kind === "ship" ? e : s;
      if (i.ownerId === o.id) continue;
      ((i.alive = !1),
        t.events.dispatchEvent(
          new window.CustomEvent("hit", { detail: { attacker: i, target: o } }),
        ),
        o.damage(25, t),
        o.alive || t.spawnExplosion(o.pos.x, o.pos.y));
      continue;
    }
    if (n.has("ship") && n.has("asteroid")) {
      const i = e.kind === "ship" ? e : s,
        o = e.kind === "asteroid" ? e : s;
      (t.events.dispatchEvent(
        new window.CustomEvent("hit", { detail: { attacker: o, target: i } }),
      ),
        i.damage(18, t) && (o.vel = o.vel.scale(-0.8)));
      continue;
    }
    if (n.has("ship") && n.has("pickup")) {
      const i = e.kind === "ship" ? e : s,
        o = e.kind === "pickup" ? e : s;
      o.alive &&
        (o.collect(i), t.spawnExplosion(o.pos.x, o.pos.y, { sparkOnly: !0 }));
    }
  }
}
var E, x, $, he, ue, pe;
class Oe {
  constructor({
    width: e = 800,
    height: s = 600,
    events: n = new window.EventTarget(),
  } = {}) {
    S(this, $);
    S(this, E, new Map());
    S(this, x);
    ((this.width = e),
      (this.height = s),
      (this.time = 0),
      (this.score = 0),
      (this.playerId = null),
      (this.playerShip = null),
      (this.events = n),
      (this.roomName = ""),
      g(this, x, []),
      (this.bulletHomingEnabled = !0),
      (this.arenaConfig = {}));
  }
  spawn(e) {
    return (
      (e.prevPos = e.pos.clone()),
      (e.prevAngle = e.angle),
      h(this, E).set(e.id, e),
      e.kind === "ship" &&
        this.playerId === null &&
        ((this.playerId = e.id), (this.playerShip = e)),
      e
    );
  }
  despawn(e) {
    const s = h(this, E).get(e);
    s && (s.alive = !1);
  }
  get(e) {
    return h(this, E).get(e);
  }
  *[Symbol.iterator]() {
    yield* h(this, E).values();
  }
  *ofKind(e) {
    for (const s of this) s.kind === e && s.alive && (yield s);
  }
  step(e, s) {
    this.time += e;
    const n = { ...s, world: this, width: this.width, height: this.height };
    for (const i of h(this, E).values())
      i.alive && (i.capturePrevious(), i.update(e, n));
    (Ne(this), H(this, $, he).call(this), H(this, $, ue).call(this));
  }
  destroyShip(e) {
    e.alive &&
      ((e.alive = !1),
      h(this, x).push({
        at: this.time + 2,
        x: this.width / 2,
        y: this.height / 2,
      }),
      this.playerId === e.id && (this.playerShip = null),
      this.addScore(-5));
  }
  addScore(e) {
    ((this.score += e),
      this.events.dispatchEvent(
        new window.CustomEvent("scoreChanged", {
          detail: { score: this.score, delta: e },
        }),
      ));
  }
  spawnExplosion(e, s, n = {}) {
    (this.spawn(new je(e, s)),
      this.events.dispatchEvent(
        new window.CustomEvent("exploded", { detail: { x: e, y: s } }),
      ),
      n.sparkOnly && this.addScore(1));
  }
  reset() {
    const e = this.score;
    (h(this, E).clear(),
      g(this, x, []),
      (this.time = 0),
      (this.score = 0),
      (this.playerId = null),
      (this.playerShip = null),
      this.events.dispatchEvent(
        new window.CustomEvent("scoreChanged", {
          detail: { score: 0, delta: -e },
        }),
      ));
  }
  seed(e = {}) {
    this.arenaConfig = { ...e };
    const s = e.asteroidCount ?? 9,
      n = e.homingEvery ?? 4,
      i = e.asteroidSpeedMin ?? 35,
      o = e.asteroidSpeedMax ?? 85;
    for (let r = 0; r < s; r += 1) {
      let a = 0,
        l = 0;
      do
        ((a = 50 + Math.random() * (this.width - 100)),
          (l = 50 + Math.random() * (this.height - 100)));
      while (Math.hypot(a - this.width / 2, l - this.height / 2) < 140);
      const u = i + Math.random() * (o - i),
        m = Math.random() * Math.PI * 2,
        p = new Be(
          a,
          l,
          Math.cos(m) * u,
          Math.sin(m) * u,
          20 + Math.random() * 15,
          r % n === 0,
        );
      this.spawn(p);
    }
    (this.spawn(new le(this.width * 0.25, this.height * 0.25, "shield")),
      this.spawn(new le(this.width * 0.75, this.height * 0.75, "rapid")));
  }
}
((E = new WeakMap()),
  (x = new WeakMap()),
  ($ = new WeakSet()),
  (he = function () {
    for (const [e, s] of h(this, E))
      s.alive ||
        (s.id === this.playerId && (this.playerShip = null),
        h(this, E).delete(e));
  }),
  (ue = function () {
    const e = h(this, x).filter((s) => s.at <= this.time);
    g(
      this,
      x,
      h(this, x).filter((s) => s.at > this.time),
    );
    for (const s of e) {
      const n = H(this, $, pe).call(this, s.x, s.y),
        i = new ne(n.x, n.y);
      (this.spawn(i),
        (this.playerId = i.id),
        (this.playerShip = i),
        this.events.dispatchEvent(
          new window.CustomEvent("respawned", { detail: { ship: i } }),
        ));
    }
  }),
  (pe = function (e, s) {
    const n = [...h(this, E).values()].filter(
        (o) => o.alive && o.kind === "asteroid",
      ),
      i = [
        { x: e, y: s },
        { x: this.width * 0.25, y: this.height * 0.5 },
        { x: this.width * 0.75, y: this.height * 0.5 },
        { x: this.width * 0.5, y: this.height * 0.25 },
        { x: this.width * 0.5, y: this.height * 0.75 },
      ];
    return (
      i.find((o) =>
        n.every((r) => {
          const a = r.pos.x - o.x,
            l = r.pos.y - o.y;
          return a * a + l * l > (r.radius + 70) ** 2;
        }),
      ) ?? i[0]
    );
  }));
const We = 500;
function fe(t, e) {
  return new Promise((s, n) => {
    if (e != null && e.aborted) {
      n(j());
      return;
    }
    const i = window.setTimeout(s, t),
      o = () => {
        (window.clearTimeout(i), n(j()));
      };
    e == null || e.addEventListener("abort", o, { once: !0 });
  });
}
function j() {
  const t = new Error("Operation aborted");
  return ((t.name = "AbortError"), t);
}
async function T(t, { signal: e } = {}) {
  const s = await window.fetch(t, { signal: e });
  if (!s.ok) {
    const n = new Error(`HTTP ${s.status} for ${t}`);
    throw ((n.status = s.status), n);
  }
  return s.json();
}
async function B(
  t,
  { attempts: e = 3, baseMs: s = 200, signal: n, onRetry: i = () => {} } = {},
) {
  let o;
  for (let r = 1; r <= e; r += 1) {
    if (n != null && n.aborted) throw j();
    try {
      return await t({ signal: n, attempt: r });
    } catch (a) {
      o = a;
      const l = Number((a == null ? void 0 : a.status) ?? 0);
      if (
        !(
          (a == null ? void 0 : a.name) !== "AbortError" &&
          (l === 0 || l >= We)
        ) ||
        r >= e
      )
        throw a;
      const m = s * 2 ** (r - 1),
        p = m * (0.2 * Math.random()),
        v = Math.round(m + p);
      (i({ attempt: r, waitMs: v, error: a }), await fe(v, n));
    }
  }
  throw o;
}
async function we(t, { signal: e } = {}) {
  const s = await window.fetch(t, { signal: e });
  if (!s.ok) {
    const i = new Error(`HTTP ${s.status} for ${t}`);
    throw ((i.status = s.status), i);
  }
  const n = await s.blob();
  if (e != null && e.aborted) throw j();
  return window.createImageBitmap(n);
}
async function He(t, e, { signal: s } = {}) {
  const n = await window.fetch(e, { signal: s });
  if (!n.ok) {
    const o = new Error(`HTTP ${n.status} for ${e}`);
    throw ((o.status = n.status), o);
  }
  const i = await n.arrayBuffer();
  if (s != null && s.aborted) throw j();
  return t.decodeAudioData(i);
}
async function me(t, { signal: e } = {}) {
  return T(t, { signal: e });
}
async function Ke(
  t,
  {
    decoderContext: e,
    onProgress: s = () => {},
    signal: n,
    onRetry: i = () => {},
  } = {},
) {
  const o = [],
    r = { sprites: {}, sounds: {}, arena: null },
    a = Object.entries(t.sprites ?? {}),
    l = Object.entries(t.sounds ?? {}),
    u = a.length + l.length + (t.arena ? 1 : 0);
  let m = 0;
  const p = (c, y) =>
    c.then(
      (b) => (
        (m += 1),
        s({ done: m, total: u, key: y.key, kind: y.kind }),
        { ...y, value: b }
      ),
    );
  for (const [c, y] of a) {
    const b = B(() => we(y.url, { signal: n }), {
      signal: n,
      onRetry: (P) => i({ ...P, key: c, kind: "sprite" }),
    });
    o.push(p(b, { key: c, kind: "sprite", descriptor: y }));
  }
  for (const [c, y] of l) {
    const b = B(() => He(e, y, { signal: n }), {
      signal: n,
      onRetry: (P) => i({ ...P, key: c, kind: "audio" }),
    });
    o.push(p(b, { key: c, kind: "audio", url: y }));
  }
  if (t.arena) {
    const c = B(() => me(t.arena, { signal: n }), {
      signal: n,
      onRetry: (y) => i({ ...y, key: "arena", kind: "json" }),
    });
    o.push(p(c, { key: "arena", kind: "json", url: t.arena }));
  }
  const v = await Promise.all(o);
  for (const c of v)
    c.kind === "sprite"
      ? (r.sprites[c.key] = { image: c.value, ...c.descriptor })
      : c.kind === "audio"
        ? (r.sounds[c.key] = c.value)
        : (r.arena = c.value);
  return r;
}
function Ue() {
  let t = null;
  const e = new Map();
  let s = !1;
  const n = async () => (
      t || (t = new window.AudioContext()),
      t.state !== "running" && (await t.resume()),
      t
    ),
    i = async (o, r = 0.35) => {
      if (!t || t.state !== "running") return;
      const a = e.get(o);
      if (!a) return;
      const l = t.createBufferSource(),
        u = t.createGain();
      ((u.gain.value = r),
        (l.buffer = a),
        l.connect(u).connect(t.destination),
        l.start());
    };
  return {
    setBuffers(o) {
      for (const [r, a] of Object.entries(o)) e.set(r, a);
    },
    async unlock() {
      await n();
    },
    attach(o) {
      s ||
        ((s = !0),
        o.addEventListener("fired", () => {
          i("fired", 0.24);
        }),
        o.addEventListener("hit", () => {
          i("hit", 0.3);
        }),
        o.addEventListener("exploded", () => {
          i("exploded", 0.34);
        }));
    },
    dispose() {
      (t && t.close(), e.clear());
    },
  };
}
async function* Je(t, e) {
  for (; !t.aborted;) (yield Date.now(), await fe(e, t));
}
function Ge(t, e) {
  const s = window.AbortSignal.timeout(e);
  return window.AbortSignal.any([t, s]);
}
var N, O, W, A, q, D;
class Ye extends window.EventTarget {
  constructor({
    endpoint: s = "/api/rooms",
    intervalMs: n = 4e3,
    timeoutMs: i = 2500,
  } = {}) {
    super();
    S(this, N);
    S(this, O);
    S(this, W);
    S(this, A, null);
    S(this, q, !1);
    S(this, D, []);
    (g(this, N, s), g(this, O, n), g(this, W, i));
  }
  get rooms() {
    return [...h(this, D)];
  }
  async refresh() {
    if (!h(this, A)) return;
    const s = Ge(h(this, A).signal, h(this, W));
    try {
      const n = await T(h(this, N), { signal: s });
      return (
        g(this, D, Array.isArray(n.rooms) ? n.rooms : []),
        this.dispatchEvent(
          new window.CustomEvent("roomsChanged", { detail: this.rooms }),
        ),
        this.rooms
      );
    } catch (n) {
      return (
        ((n == null ? void 0 : n.name) === "AbortError" &&
          h(this, A).signal.aborted) ||
          this.dispatchEvent(
            new window.CustomEvent("error", {
              detail: { phase: "refresh", error: n },
            }),
          ),
        null
      );
    }
  }
  async start() {
    if (!h(this, q)) {
      (g(this, q, !0),
        g(this, A, new window.AbortController()),
        await this.refresh());
      try {
        for await (const s of Je(h(this, A).signal, h(this, O))) {
          if (!h(this, q)) break;
          await this.refresh();
        }
      } catch (s) {
        (s == null ? void 0 : s.name) !== "AbortError" &&
          this.dispatchEvent(
            new window.CustomEvent("error", {
              detail: { phase: "poll", error: s },
            }),
          );
      }
    }
  }
  leave() {
    var s;
    (g(this, q, !1), (s = h(this, A)) == null || s.abort(), g(this, A, null));
  }
  join(s, n) {
    const i = h(this, D).find((o) => o.id === s);
    if (!i) throw new Error("Room is no longer available");
    (this.leave(),
      this.dispatchEvent(
        new window.CustomEvent("joined", {
          detail: { room: i, playerName: n },
        }),
      ));
  }
}
((N = new WeakMap()),
  (O = new WeakMap()),
  (W = new WeakMap()),
  (A = new WeakMap()),
  (q = new WeakMap()),
  (D = new WeakMap()));
function Xe(t, e) {
  t.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-head">
        <div>
          <p class="eyebrow">Online lobby</p>
          <h2>Choose your room</h2>
        </div>
        <span class="pill" id="lobby-status">Refreshing…</span>
      </div>
      <label class="field">Player name<input id="player-name" maxlength="18" value="Pilot" /></label>
      <div id="room-list" class="room-list"></div>
      <div class="lobby-actions">
        <button id="join-room" disabled>Join selected room</button>
        <button id="leave-lobby" class="ghost">Stop refresh</button>
      </div>
      <p class="lobby-note" id="lobby-note">Rooms refresh every 4 s. Each HTTP request has its own timeout.</p>
    </div>
  `;
  const s = t.querySelector("#room-list"),
    n = t.querySelector("#lobby-status"),
    i = t.querySelector("#lobby-note"),
    o = t.querySelector("#join-room"),
    r = t.querySelector("#player-name");
  let a = null;
  const l = (p) => {
      var v;
      ((a = ((v = p[0]) == null ? void 0 : v.id) ?? null),
        (s.innerHTML = p
          .map(
            (c, y) => `
      <label class="room-option ${y === 0 ? "selected" : ""}">
        <input type="radio" name="room" value="${c.id}" ${y === 0 ? "checked" : ""} />
        <span><strong>${c.name}</strong><small>${c.players}/${c.capacity} pilots · ${c.arena.asteroidCount} asteroids</small></span>
      </label>
    `,
          )
          .join("")),
        (o.disabled = p.length === 0));
      for (const c of s.querySelectorAll("input[name=room]"))
        c.addEventListener("change", () => {
          a = c.value;
          for (const y of s.querySelectorAll(".room-option"))
            y.classList.remove("selected");
          c.closest(".room-option").classList.add("selected");
        });
      n.textContent = `${p.length} rooms`;
    },
    u = (p) => l(p.detail),
    m = (p) => {
      var v;
      ((n.textContent = "Lobby error"),
        (i.textContent = `${p.detail.phase}: ${((v = p.detail.error) == null ? void 0 : v.message) ?? "request failed"}`));
    };
  return (
    e.addEventListener("roomsChanged", u),
    e.addEventListener("error", m),
    o.addEventListener("click", () => {
      const p = r.value.trim() || "Pilot";
      try {
        e.join(a, p);
      } catch (v) {
        i.textContent = v.message;
      }
    }),
    t.querySelector("#leave-lobby").addEventListener("click", () => {
      (e.leave(),
        (n.textContent = "Refresh stopped"),
        (i.textContent =
          "Polling aborted cleanly. Join a room to start the game."));
    }),
    () => {
      (e.removeEventListener("roomsChanged", u),
        e.removeEventListener("error", m),
        e.leave(),
        t.replaceChildren());
    }
  );
}
function Qe(t, e) {
  const s = (i) => {
      t.score.textContent = String(i);
    },
    n = (i) => {
      t.statusBadge.textContent = i;
    };
  return (
    e.addEventListener("scoreChanged", (i) => s(i.detail.score)),
    {
      update(i, o) {
        var r;
        ((t.steps.textContent = i.stepsPerSecond.toFixed(1)),
          (t.frames.textContent = i.framesPerSecond.toFixed(1)),
          (t.frameTime.textContent = `${i.frameTimeMs.toFixed(2)} ms`),
          (t.entities.textContent = String([...o].length)),
          (t.hp.textContent = o.playerShip
            ? String(o.playerShip.hp)
            : "RESPAWN"),
          (t.activePower.textContent =
            ((r = o.playerShip) == null ? void 0 : r.activePowerup) ?? "—"),
          (t.room.textContent = o.roomName || "—"));
      },
      setScore: s,
      setStatus: n,
    }
  );
}
function Ze() {
  (window.console.group("[Lab 03] Five microtask/task ordering puzzles"),
    window.console.log(
      "P1 output: A, C, B | Promise reaction is a microtask, so sync logs finish first.",
    ),
    window.console.log("P1:A"),
    window.Promise.resolve().then(() => window.console.log("P1:B")),
    window.console.log("P1:C"),
    (async () => (
      window.console.log("P2:A"),
      await 0,
      window.console.log("P2:B")
    ))(),
    window.console.log(
      "P2:C | output: A, C, B | await yields and resumes as a microtask.",
    ),
    window.Promise.resolve()
      .then(() => {
        (window.console.log("P3:A"),
          window.setTimeout(() => window.console.log("P3:D"), 0));
      })
      .then(() => window.console.log("P3:B")),
    window.console.log(
      "P3:C | output: C, A, B, D | the timer is a later task than both promise reactions.",
    ),
    window.requestAnimationFrame(() =>
      window.console.log(
        "P4:rAF | output after current task + microtasks | rAF runs at the rendering opportunity before paint.",
      ),
    ),
    window.Promise.resolve().then(() => window.console.log("P4:micro")),
    window.console.log("P4:sync"),
    window.Promise.resolve().then(async () => {
      (window.console.log("P5:A"),
        await window.Promise.resolve(),
        window.console.log("P5:B"),
        await 0,
        window.console.log("P5:C"));
    }),
    window.console.log(
      "P5:D | output: D, A, B, C | each await yields to a later microtask turn.",
    ),
    window.console.groupEnd());
}
function _e(t) {
  t.innerHTML = `
    <div class="diagnostics-head"><span class="section-label">Async diagnostics</span><small>Run these after joining.</small></div>
    <div class="diagnostics-buttons">
      <button data-test="404">404 sprite</button>
      <button data-test="timeout">network timeout</button>
      <button data-test="abort">abort mid-load</button>
      <button data-test="bad-json">corrupt JSON</button>
      <button data-test="retry">retry 5xx</button>
      <button data-test="benchmark">sequential vs concurrent</button>
    </div>
    <pre id="diagnostics-log">No tests run yet.</pre>
  `;
  const e = t.querySelector("#diagnostics-log"),
    s = (n) => {
      e.textContent = `${new Date().toLocaleTimeString()} ${n}
${e.textContent === "No tests run yet." ? "" : e.textContent}`.trim();
    };
  (t.querySelector('[data-test="404"]').addEventListener("click", async () => {
    try {
      await B(() => we("/assets/sprites/missing-sprite.png"), { attempts: 3 });
    } catch (n) {
      s(`404 sprite recovered: ${n.message}; 4xx was not retried.`);
    }
  }),
    t
      .querySelector('[data-test="timeout"]')
      .addEventListener("click", async () => {
        try {
          await T("/api/slow?ms=4000", {
            signal: window.AbortSignal.timeout(500),
          });
        } catch (n) {
          s(`network timeout recovered: ${n.name} (${n.message}).`);
        }
      }),
    t
      .querySelector('[data-test="abort"]')
      .addEventListener("click", async () => {
        const n = new window.AbortController(),
          i = T("/api/slow?ms=3000", { signal: n.signal });
        window.setTimeout(() => n.abort(), 120);
        try {
          await i;
        } catch (o) {
          s(`abort mid-load recovered: ${o.name}.`);
        }
      }),
    t
      .querySelector('[data-test="bad-json"]')
      .addEventListener("click", async () => {
        try {
          await T("/api/bad.json");
        } catch (n) {
          s(`corrupt JSON recovered: ${n.name}.`);
        }
      }),
    t
      .querySelector('[data-test="retry"]')
      .addEventListener("click", async () => {
        const n = `demo-${Date.now()}`;
        try {
          const i = await B(() => T(`/api/flaky?key=${n}`), {
            attempts: 3,
            baseMs: 120,
            onRetry: ({ attempt: o, waitMs: r }) =>
              s(
                `retry backoff: 503 on attempt ${o}, waiting ${r} ms + jitter.`,
              ),
          });
          s(`retry test recovered after ${i.attempts} attempts.`);
        } catch (i) {
          s(`retry test failed: ${i.message}`);
        }
      }),
    t
      .querySelector('[data-test="benchmark"]')
      .addEventListener("click", async () => {
        const n = [1, 2, 3, 4].map(
            (l) => `/api/slow?ms=320&n=${l}&t=${Date.now()}`,
          ),
          i = window.performance.now();
        for (const l of n) await T(l);
        const o = window.performance.now() - i,
          r = window.performance.now();
        await Promise.all(n.map((l) => T(l)));
        const a = window.performance.now() - r;
        s(
          `benchmark: sequential ${o.toFixed(0)} ms vs concurrent ${a.toFixed(0)} ms.`,
        );
      }));
}
const Ve = document.querySelector("#game"),
  R = Ae(Ve),
  G = new window.EventTarget(),
  Y = Se(window),
  z = Ue(),
  f = {
    loading: document.querySelector("#loading-screen"),
    loadingLabel: document.querySelector("#loading-label"),
    loadingError: document.querySelector("#loading-error"),
    retry: document.querySelector("#retry-loading"),
    lobby: document.querySelector("#lobby-screen"),
    game: document.querySelector("#game-screen"),
    canvasWrap: document.querySelector("#canvas-wrap"),
    statusBadge: document.querySelector("#status-badge"),
    steps: document.querySelector("#steps"),
    frames: document.querySelector("#frames"),
    frameTime: document.querySelector("#frame-time"),
    hp: document.querySelector("#hp"),
    score: document.querySelector("#score"),
    entities: document.querySelector("#entities"),
    activePower: document.querySelector("#active-power"),
    room: document.querySelector("#room"),
    diagnostics: document.querySelector("#diagnostics"),
    diagnosticsLog: document.querySelector("#diagnostics-log"),
  },
  et = Array.from({ length: 120 }, (t, e) => ({
    x: ((e * 73) % 997) / 997,
    y: ((e * 151) % 991) / 991,
    size: e % 7 === 0 ? 2 : 1,
    speed: 0.6 + (e % 5) * 0.15,
    phase: e * 0.37,
  })),
  se = Qe(f, G),
  X = new Ye();
let U = null,
  de = null,
  d = null,
  C = null,
  L = null,
  k = null;
function K(t, e, s = "") {
  const { ctx: n, size: i } = R,
    o = Math.min(520, i.width * 0.7),
    r = (i.width - o) / 2,
    a = i.height / 2 + 32;
  ((n.fillStyle = "#020713"),
    n.fillRect(0, 0, i.width, i.height),
    (n.fillStyle = "#9be7ff"),
    (n.font = "700 18px system-ui"),
    (n.textAlign = "center"),
    n.fillText("STARSHIP ARENA — LOADING", i.width / 2, i.height / 2 - 28),
    (n.fillStyle = "#5b7089"),
    (n.font = "13px system-ui"),
    n.fillText(e, i.width / 2, i.height / 2),
    (n.strokeStyle = "rgb(131 204 255 / 30%)"),
    n.strokeRect(r, a, o, 18),
    (n.fillStyle = "#66ddff"),
    n.fillRect(r + 2, a + 2, Math.max(0, (o - 4) * t), 14),
    (n.fillStyle = "#c9ecff"),
    n.fillText(`${Math.round(t * 100)}%`, i.width / 2, a + 50),
    s && ((n.fillStyle = "#ffb59f"), n.fillText(s, i.width / 2, a + 78)));
}
async function ye() {
  ((f.loading.hidden = !1),
    (f.lobby.hidden = !0),
    (f.game.hidden = !0),
    (f.diagnostics.hidden = !0),
    (f.loadingError.textContent = ""),
    (f.retry.hidden = !0),
    k == null || k.abort(),
    (k = new window.AbortController()),
    L == null || L(),
    (L = null));
  try {
    (K(0, "Reading assets/manifest.json…"),
      (de = await me("/assets/manifest.json", { signal: k.signal })));
    const t = new window.OfflineAudioContext(1, 1, 44100);
    let e = 0;
    ((U = await Ke(de, {
      decoderContext: t,
      signal: k.signal,
      onProgress: ({ done: s, total: n, key: i }) => {
        ((e = s / n), K(e, `Loaded ${i} (${s}/${n})`));
      },
      onRetry: ({ key: s, attempt: n, waitMs: i, kind: o }) => {
        K(e, `Retry ${o} ${s}: attempt ${n + 1} in ${i} ms`);
      },
    })),
      z.setBuffers(U.sounds),
      G.dispatchEvent(new window.CustomEvent("assetsReady", { detail: U })),
      (f.loading.hidden = !0),
      (f.lobby.hidden = !1),
      (L = Xe(f.lobby, X)),
      X.start(),
      (f.statusBadge.textContent = "LOBBY READY"),
      Ze(),
      window.Promise.all([
        window.Promise.resolve("sprite"),
        window.Promise.resolve("audio"),
      ]).then((s) => window.console.log("[Lab 03] Promise.all:", s)),
      window.Promise.allSettled([
        window.Promise.resolve("ok"),
        window.Promise.reject(new Error("demo")),
      ]).then((s) => window.console.log("[Lab 03] Promise.allSettled:", s)),
      window.Promise.race([
        new window.Promise((s) => window.setTimeout(() => s("slow"), 20)),
        new window.Promise((s) => window.setTimeout(() => s("fast"), 5)),
      ]).then((s) => window.console.log("[Lab 03] Promise.race:", s)),
      window.Promise.any([
        window.Promise.reject(new Error("x")),
        window.Promise.resolve("mirror"),
      ]).then((s) => window.console.log("[Lab 03] Promise.any:", s)));
  } catch (t) {
    if ((t == null ? void 0 : t.name) === "AbortError") return;
    (k == null || k.abort(),
      window.console.error("[Lab 03] Asset pipeline failed:", t),
      (f.loadingError.textContent = `${t.message ?? "Asset loading failed"}. Use Retry.`),
      (f.retry.hidden = !1),
      K(0, "Loading failed", f.loadingError.textContent));
  }
}
f.retry.addEventListener("click", () => {
  ye();
});
X.addEventListener("joined", async (t) => {
  (L == null || L(),
    (f.lobby.hidden = !0),
    (f.game.hidden = !1),
    (f.diagnostics.hidden = !1));
  try {
    await z.unlock();
  } catch (i) {
    window.console.warn("[Lab 03] Audio unlock failed:", i);
  }
  z.attach(G);
  const { room: e, playerName: s } = t.detail;
  ((d = new Oe({ width: R.size.width, height: R.size.height, events: G })),
    (d.roomName = e.name),
    d.reset(),
    (d.width = R.size.width),
    (d.height = R.size.height),
    d.seed(e.arena),
    (d.playerId = null),
    (d.playerShip = null));
  const n = new ne(d.width / 2, d.height / 2);
  (d.spawn(n),
    (f.statusBadge.textContent = e.name.toUpperCase()),
    se.setStatus(`Player: ${s}`),
    se.setScore(0),
    _e(f.diagnostics),
    C == null || C.stop(),
    (C = Pe({
      step: 1 / 60,
      simulate(i) {
        (d.step(i, { input: Y }),
          d.playerShip && (d.playerShip = d.get(d.playerId)));
      },
      render(i, o) {
        const { ctx: r, size: a } = R;
        (Te(r, a.width, a.height, d.time, et),
          Ce(r, a.width, a.height),
          Fe(r, d, i, U),
          se.update(o, d),
          Y.endFrame());
      },
    })),
    C.start(),
    f.canvasWrap.focus());
});
window.addEventListener("keydown", (t) => {
  if (t.code === "Space" && !t.repeat && d != null && d.playerShip) {
    const e = d.playerShip.fire(d);
    e && (f.statusBadge.textContent = e.homing ? "HOMING FIRE" : "FIRE");
  }
  if (t.code === "KeyR" && Y.justPressed("KeyR") && d) {
    (d.reset(),
      (d.roomName = d.roomName || "Training Ring"),
      d.seed(d.arenaConfig));
    const e = new ne(d.width / 2, d.height / 2);
    d.spawn(e);
  }
});
f.canvasWrap.addEventListener("pointerdown", () => {
  z.unlock();
});
f.canvasWrap.addEventListener("click", () => f.canvasWrap.focus());
window.addEventListener("beforeunload", () => {
  (k == null || k.abort(),
    X.leave(),
    C == null || C.stop(),
    Y.destroy(),
    R.destroy(),
    z.dispose());
});
ye();
