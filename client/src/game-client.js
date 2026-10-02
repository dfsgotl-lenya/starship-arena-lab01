import { integrate } from "@starship-arena/shared/sim/integrate.js";
import { createBullet } from "@starship-arena/shared/sim/entity.js";

const NET_DT = 1 / 30;
const DEFAULT_INTERPOLATION = 100;

export class NetworkGame {
  constructor({
    connection,
    width,
    height,
    input,
    events,
    playerId = null,
    shipId = null,
  }) {
    this.connection = connection;
    this.width = width;
    this.height = height;
    this.input = input;
    this.events = events;
    this.playerId = playerId;
    this.shipId = shipId == null ? null : Number(shipId);
    this.localShip = null;
    this.localPrev = null;
    this.pendingInputs = [];
    this.seq = 0;
    this.predictionAccumulator = 0;
    this.fireQueued = false;
    this.snapshots = [];
    this.lastSnapshotAt = 0;
    this.rtt = 0;
    this.correction = 0;
    this.correctionOffset = { x: 0, y: 0 };
    this.interpolationDelay = DEFAULT_INTERPOLATION;
    this.localBullets = [];
    this.breakDeterminism = false;
    this.score = 0;
    this.serverTick = 0;
    this.onRoster = null;
    this.onChat = null;
    this.#bind();
  }

  #bind() {
    this.connection.addEventListener("joined", (event) => {
      this.playerId = event.detail.playerId;
      this.shipId = Number(event.detail.shipId);
      this.serverTick = 0;
    });
    this.connection.addEventListener("snapshot", (event) =>
      this.#snapshot(event.detail),
    );
    this.connection.addEventListener("pong", (event) => {
      this.rtt = Math.max(0, performance.now() - Number(event.detail.t));
    });
    this.connection.addEventListener("roster", (event) =>
      this.onRoster?.(event.detail.players ?? []),
    );
    this.connection.addEventListener("chat", (event) =>
      this.onChat?.(event.detail),
    );
  }

  fire() {
    this.fireQueued = true;
  }

  setInterpolationDelay(ms) {
    this.interpolationDelay = Math.max(33, Math.min(250, ms));
  }

  step(dt) {
    this.predictionAccumulator += dt;
    while (this.predictionAccumulator >= NET_DT) {
      this.localPrev = this.localShip ? { ...this.localShip } : null;
      const control = {
        thrust: this.input.isDown("ArrowUp") || this.input.isDown("KeyW"),
        turn:
          Number(this.input.isDown("ArrowRight") || this.input.isDown("KeyD")) -
          Number(this.input.isDown("ArrowLeft") || this.input.isDown("KeyA")),
        fire: this.fireQueued,
      };
      this.fireQueued = false;
      this.seq += 1;
      const packet = {
        seq: this.seq,
        tick: this.serverTick,
        thrust: control.thrust,
        turn: control.turn,
        fire: control.fire,
      };
      this.pendingInputs.push(packet);
      if (this.pendingInputs.length > 60) this.pendingInputs.shift();
      if (this.localShip) {
        if (control.fire && this.localShip.fireCooldown <= 0) {
          const bullet = createBullet(-this.seq, this.shipId, this.localShip);
          this.localBullets.push({ ...bullet, predictedAge: 0 });
          this.localShip.fireCooldown = this.localShip.fireInterval;
          this.events?.dispatchEvent(
            new window.CustomEvent("fired", { detail: { predicted: true } }),
          );
        }
        this.localShip = wrapShip(
          integrate(this.localShip, control, NET_DT, {
            breakDeterminism: this.breakDeterminism,
          }),
          this.width,
          this.height,
        );
      }
      this.connection.sendInput(packet);
      this.predictionAccumulator -= NET_DT;
    }
    for (const bullet of this.localBullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.ttl -= dt;
      bullet.predictedAge += dt;
    }
    this.localBullets = this.localBullets.filter((bullet) => bullet.ttl > 0);
    const decay = Math.min(1, dt / 0.1);
    this.correctionOffset.x *= 1 - decay;
    this.correctionOffset.y *= 1 - decay;
  }

  render(now = performance.now()) {
    const remote = interpolateSnapshots(
      this.snapshots,
      now - this.interpolationDelay,
    );
    const entities = [];
    if (this.localShip) {
      const alpha = Math.min(1, this.predictionAccumulator / NET_DT);
      const x =
        lerp(this.localPrev?.x ?? this.localShip.x, this.localShip.x, alpha) +
        this.correctionOffset.x;
      const y =
        lerp(this.localPrev?.y ?? this.localShip.y, this.localShip.y, alpha) +
        this.correctionOffset.y;
      entities.push({
        ...this.localShip,
        x,
        y,
        prevX: x,
        prevY: y,
        local: true,
      });
    }
    for (const bullet of this.localBullets)
      entities.push({
        ...bullet,
        prevX: bullet.x - bullet.vx * NET_DT,
        prevY: bullet.y - bullet.vy * NET_DT,
        local: true,
      });
    if (remote)
      for (const entity of remote.entities) {
        if (
          entity.id === this.shipId ||
          (entity.kind === "bullet" && entity.ownerId === this.shipId)
        )
          continue;
        entities.push({
          ...entity,
          prevX: entity.x,
          prevY: entity.y,
          local: false,
        });
      }
    return { entities, score: this.score };
  }

  netStats(connection) {
    return {
      rtt: this.rtt,
      snapshotAge: this.lastSnapshotAt
        ? performance.now() - this.lastSnapshotAt
        : 0,
      bytes: connection.getBytesPerSecond(),
      pending: this.pendingInputs.length,
      correction: this.correction,
      interpolation: this.interpolationDelay,
      protocol: connection.protocol,
    };
  }

  #snapshot(snapshot) {
    const receivedAt = performance.now();
    this.serverTick = snapshot.tick ?? this.serverTick;
    this.lastSnapshotAt = receivedAt;
    const previousScore = this.score;
    this.score = Number(snapshot.score ?? 0);
    if (this.score > previousScore)
      this.events?.dispatchEvent(
        new window.CustomEvent("hit", { detail: { score: this.score } }),
      );
    const local = snapshot.entities.find((entity) => entity.id === this.shipId);
    if (local) {
      if (!this.localShip) {
        this.localShip = {
          ...local,
          turnSpeed: 3.4,
          thrustAcceleration: 260,
          drag: 0.992,
          maxSpeed: 420,
          fireCooldown: 0,
          fireInterval: 0.12,
          radius: 18,
          maxHp: 100,
        };
        this.localPrev = { ...this.localShip };
      } else {
        const before = { ...this.localShip };
        const authoritative = {
          ...this.localShip,
          ...local,
          turnSpeed: 3.4,
          thrustAcceleration: 260,
          drag: 0.992,
          maxSpeed: 420,
          fireCooldown: 0,
          fireInterval: 0.12,
          radius: 18,
          maxHp: 100,
        };
        const ack = snapshot.lastProcessedSeq ?? 0;
        this.pendingInputs = this.pendingInputs.filter(
          (item) => item.seq > ack,
        );
        let reconciled = authoritative;
        for (const pending of this.pendingInputs)
          reconciled = wrapShip(
            integrate(reconciled, pending, NET_DT, {
              breakDeterminism: this.breakDeterminism,
            }),
            this.width,
            this.height,
          );
        this.correction = Math.hypot(
          before.x - reconciled.x,
          before.y - reconciled.y,
        );
        this.correctionOffset.x += before.x - reconciled.x;
        this.correctionOffset.y += before.y - reconciled.y;
        this.localShip = reconciled;
      }
      this.localBullets = this.localBullets.filter(
        (bullet) =>
          !snapshot.entities.some(
            (entity) =>
              entity.kind === "bullet" &&
              entity.ownerId === this.playerId &&
              Math.hypot(entity.x - bullet.x, entity.y - bullet.y) < 45,
          ),
      );
    }
    this.snapshots.push({ receivedAt, snapshot });
    if (this.snapshots.length > 12) this.snapshots.shift();
  }
}

function interpolateSnapshots(buffer, targetTime) {
  if (buffer.length === 0) return null;
  if (buffer.length === 1 || targetTime <= buffer[0].receivedAt)
    return buffer[0].snapshot;
  let a = buffer[0];
  let b = buffer[buffer.length - 1];
  for (let index = 1; index < buffer.length; index += 1) {
    if (buffer[index].receivedAt >= targetTime) {
      b = buffer[index];
      a = buffer[index - 1];
      break;
    }
  }
  const span = Math.max(1, b.receivedAt - a.receivedAt);
  const alpha = Math.max(0, Math.min(1, (targetTime - a.receivedAt) / span));
  const mapB = new Map(
    b.snapshot.entities.map((entity) => [entity.id, entity]),
  );
  return {
    ...b.snapshot,
    entities: a.snapshot.entities.map((entity) => {
      const next = mapB.get(entity.id);
      if (!next) return entity;
      return {
        ...entity,
        x: lerp(entity.x, next.x, alpha),
        y: lerp(entity.y, next.y, alpha),
        angle: lerpAngle(entity.angle, next.angle, alpha),
      };
    }),
  };
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}
function lerpAngle(a, b, alpha) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + delta * alpha;
}
function wrapShip(ship, width, height) {
  const next = { ...ship };
  if (next.x < 0) next.x += width;
  if (next.x >= width) next.x -= width;
  if (next.y < 0) next.y += height;
  if (next.y >= height) next.y -= height;
  return next;
}
