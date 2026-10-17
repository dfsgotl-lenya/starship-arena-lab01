import {
  copyShip,
  integrateInPlace,
  wrapPosition,
} from "@starship-arena/shared/sim/integrate.ts";
import {
  blankBullet,
  createShip,
  initBullet,
} from "@starship-arena/shared/sim/entity.ts";
import { Pool } from "@starship-arena/shared/sim/pool.ts";
import { createPooledSnapshot } from "@starship-arena/shared/codec/binary.ts";
import type {
  NetEntity,
  PooledSnapshot,
} from "@starship-arena/shared/codec/binary.ts";
import {
  entityId,
  sequenceNumber,
  tickNumber,
} from "@starship-arena/shared/types.ts";
import type {
  BulletEntity,
  EntityId,
  EntityKind,
  Seq,
  ShipEntity,
  Tick,
  Turn,
} from "@starship-arena/shared/types.ts";
import { messageOf } from "../connection.ts";
import type { GameConnection, SnapshotSink } from "../connection.ts";
import type { InputController, RenderWorld } from "../types.ts";
import type { Bus } from "../events.ts";
import type { GameEvents } from "../events.ts";

export const NET_DT = 1 / 30;
const DEFAULT_INTERPOLATION = 100;
const SNAPSHOT_BUFFER = 12;
const RING_SIZE = SNAPSHOT_BUFFER + 2;
const MAX_PENDING = 60;

type PredictedBullet = BulletEntity & { predictedAge: number };

/** Mutable input record; recycled through a pool instead of a new literal per tick. */
export interface PendingInput {
  seq: Seq;
  tick: Tick;
  thrust: boolean;
  turn: Turn;
  fire: boolean;
}

/**
 * The object the renderer reads. One shape for every entity kind, created
 * once and rewritten every frame (Lab 7: no per-frame spread objects).
 */
export interface RenderEntity {
  id: EntityId;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  ownerId: EntityId;
  variant: number;
  local: boolean;
  prevX: number;
  prevY: number;
  prevAngle: number;
}

/**
 * id → (index + 1) lookup for one snapshot. A Uint16Array over the whole
 * uint16 id space is 128 KB per slot, allocated once; Lab 7's first version
 * used Map.clear()+set() and the Map's backing store was re-grown (allocated)
 * on every snapshot.
 */
class EntityIndex {
  readonly #slots = new Uint16Array(65_536);
  #snapshot: PooledSnapshot | null = null;

  rebuild(snapshot: PooledSnapshot): void {
    const previous = this.#snapshot;
    if (previous)
      for (let i = 0; i < previous.count; i += 1)
        this.#slots[previous.entities[i]!.id] = 0;
    for (let i = 0; i < snapshot.count; i += 1)
      this.#slots[snapshot.entities[i]!.id] = i + 1;
    this.#snapshot = snapshot;
  }

  /** Call before the pooled snapshot is overwritten by the decoder. */
  forget(): void {
    const previous = this.#snapshot;
    if (previous)
      for (let i = 0; i < previous.count; i += 1)
        this.#slots[previous.entities[i]!.id] = 0;
    this.#snapshot = null;
  }

  get(id: EntityId): NetEntity | undefined {
    const index = this.#slots[id] ?? 0;
    return index === 0 ? undefined : this.#snapshot?.entities[index - 1];
  }
}

interface SnapshotSlot {
  readonly snapshot: PooledSnapshot;
  readonly byId: EntityIndex;
  receivedAt: number;
}

export interface NetworkGameOptions {
  readonly connection: GameConnection;
  readonly width: number;
  readonly height: number;
  readonly input: InputController;
  readonly events: Bus<GameEvents>;
  readonly now?: () => number;
}
export interface NetworkStats {
  readonly rtt: number;
  readonly snapshotAge: number;
  readonly bytes: { readonly in: number; readonly out: number };
  readonly pending: number;
  readonly correction: number;
  readonly interpolation: number;
  readonly protocol: "json" | "binary";
}

export class NetworkGame implements SnapshotSink {
  readonly connection: GameConnection;
  readonly width: number;
  readonly height: number;
  readonly input: InputController;
  readonly events: Bus<GameEvents>;
  readonly #now: () => number;
  playerId: string | null = null;
  shipId: EntityId | null = null;
  /** Predicted local ship (a preallocated object, null until the first snapshot). */
  localShip: ShipEntity | null = null;
  readonly #ship: ShipEntity = createShip(entityId(0), 0, 0);
  readonly #prev: ShipEntity = createShip(entityId(0), 0, 0);
  readonly #before: ShipEntity = createShip(entityId(0), 0, 0);
  readonly #replay: ShipEntity = createShip(entityId(0), 0, 0);
  readonly pendingInputs: PendingInput[] = [];
  readonly #inputPool = new Pool<PendingInput>(
    () => ({
      seq: sequenceNumber(0),
      tick: tickNumber(0),
      thrust: false,
      turn: 0,
      fire: false,
    }),
    { prefill: MAX_PENDING },
  );
  readonly #control: PendingInput = {
    seq: sequenceNumber(0),
    tick: tickNumber(0),
    thrust: false,
    turn: 0,
    fire: false,
  };
  seq: Seq = sequenceNumber(0);
  predictionAccumulator = 0;
  fireQueued = false;
  readonly #ring: SnapshotSlot[] = Array.from({ length: RING_SIZE }, () => ({
    snapshot: createPooledSnapshot(),
    byId: new EntityIndex(),
    receivedAt: 0,
  }));
  #ringHead = 0;
  #ringCount = 0;
  lastSnapshotAt = 0;
  rtt = 0;
  correction = 0;
  readonly correctionOffset = { x: 0, y: 0 };
  interpolationDelay = DEFAULT_INTERPOLATION;
  readonly localBullets: PredictedBullet[] = [];
  readonly bulletPool = new Pool<PredictedBullet>(
    () => ({ ...blankBullet(), predictedAge: 0 }),
    { prefill: 16 },
  );
  breakDeterminism = false;
  score = 0;
  serverTick: Tick = tickNumber(0);
  readonly #renderPool: RenderEntity[] = [];
  readonly #renderList: RenderEntity[] = [];
  #renderCount = 0;
  readonly #renderWorld: { entities: RenderEntity[]; score: number } = {
    entities: this.#renderList,
    score: 0,
  };
  onRoster:
    | ((
        players: readonly { readonly id: string; readonly name: string }[],
      ) => void)
    | null = null;
  onChat:
    | ((message: { readonly name: string; readonly text: string }) => void)
    | null = null;
  /** Called when an asteroid or ship vanishes between two snapshots. */
  onDestroyed: ((x: number, y: number, kind: EntityKind) => void) | null = null;

  constructor({
    connection,
    width,
    height,
    input,
    events,
    now = () => performance.now(),
  }: NetworkGameOptions) {
    this.connection = connection;
    this.width = width;
    this.height = height;
    this.input = input;
    this.events = events;
    this.#now = now;
    this.#bind();
  }

  #bind(): void {
    this.connection.snapshotSink = this;
    this.connection.addEventListener("joined", (event: Event) => {
      const message = messageOf(event);
      if (message?.type !== "joined") return;
      this.playerId = message.playerId;
      this.shipId = message.shipId;
      this.serverTick = tickNumber(0);
    });
    this.connection.addEventListener("pong", (event: Event) => {
      const message = messageOf(event);
      if (message?.type === "pong" && typeof message.t === "number")
        this.rtt = Math.max(0, this.#now() - message.t);
    });
    this.connection.addEventListener("roster", (event: Event) => {
      const message = messageOf(event);
      if (message?.type === "roster") this.onRoster?.(message.players);
    });
    this.connection.addEventListener("chat", (event: Event) => {
      const message = messageOf(event);
      if (message?.type === "chat") this.onChat?.(message);
    });
  }

  dispose(): void {
    if (this.connection.snapshotSink === this)
      this.connection.snapshotSink = null;
  }

  fire(): void {
    this.fireQueued = true;
  }
  setInterpolationDelay(ms: number): void {
    this.interpolationDelay = Math.max(33, Math.min(250, ms));
  }

  step(dt: number): void {
    this.predictionAccumulator += dt;
    while (this.predictionAccumulator >= NET_DT) {
      const ship = this.localShip;
      if (ship) copyShip(this.#prev, ship);
      const right =
        this.input.isDown("ArrowRight") || this.input.isDown("KeyD");
      const left = this.input.isDown("ArrowLeft") || this.input.isDown("KeyA");
      const control = this.#control;
      control.turn = right === left ? 0 : right ? 1 : -1;
      control.thrust =
        this.input.isDown("ArrowUp") || this.input.isDown("KeyW");
      control.fire = this.fireQueued;
      this.fireQueued = false;
      this.seq = sequenceNumber(Number(this.seq) + 1);
      control.seq = this.seq;
      control.tick = this.serverTick;

      const packet = this.#inputPool.acquire();
      packet.seq = control.seq;
      packet.tick = control.tick;
      packet.thrust = control.thrust;
      packet.turn = control.turn;
      packet.fire = control.fire;
      this.pendingInputs.push(packet);
      if (this.pendingInputs.length > MAX_PENDING) {
        const dropped = this.pendingInputs.shift();
        if (dropped) this.#inputPool.release(dropped);
      }
      if (ship && this.shipId !== null) {
        if (control.fire && ship.fireCooldown <= 0) {
          const bullet = initBullet(
            this.bulletPool.acquire(),
            entityId(Number(this.seq) % 65_536),
            this.shipId,
            ship,
          );
          bullet.predictedAge = 0;
          this.localBullets.push(bullet);
          ship.fireCooldown = ship.fireInterval;
          this.events.emit("fired", { predicted: true });
        }
        integrateInPlace(ship, control, NET_DT, ship, this.breakDeterminism);
        wrapPosition(ship, this.width, this.height);
      }
      this.connection.sendInput(control);
      this.predictionAccumulator -= NET_DT;
    }
    const bullets = this.localBullets;
    let kept = 0;
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index]!;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.ttl -= dt;
      bullet.predictedAge += dt;
      if (bullet.ttl > 0) bullets[kept++] = bullet;
      else this.bulletPool.release(bullet);
    }
    bullets.length = kept;
    const decay = Math.min(1, dt / 0.1);
    this.correctionOffset.x *= 1 - decay;
    this.correctionOffset.y *= 1 - decay;
  }

  /** Builds the frame's entity list into reused objects. */
  render(now = this.#now()): RenderWorld {
    this.#renderCount = 0;
    const ship = this.localShip;
    if (ship) {
      const alpha = Math.min(1, this.predictionAccumulator / NET_DT);
      const x = lerp(this.#prev.x, ship.x, alpha) + this.correctionOffset.x;
      const y = lerp(this.#prev.y, ship.y, alpha) + this.correctionOffset.y;
      const item = this.#renderItem();
      writeRender(item, ship, true);
      item.x = item.prevX = x;
      item.y = item.prevY = y;
      item.hp = ship.hp;
      item.maxHp = ship.maxHp;
    }
    for (let index = 0; index < this.localBullets.length; index += 1) {
      const bullet = this.localBullets[index]!;
      const item = this.#renderItem();
      writeRender(item, bullet, true);
      item.ownerId = bullet.ownerId;
      item.prevX = bullet.x - bullet.vx * NET_DT;
      item.prevY = bullet.y - bullet.vy * NET_DT;
    }
    this.#interpolate(now - this.interpolationDelay);
    // Trim once at the end. Never `length = 0` + push(): V8 frees the backing
    // store on length 0 and push() re-allocates it — that was 2 MB per 30 s.
    const list = this.#renderList;
    if (list.length !== this.#renderCount) list.length = this.#renderCount;
    this.#renderWorld.score = this.score;
    return this.#renderWorld;
  }

  netStats(): NetworkStats {
    return {
      rtt: this.rtt,
      snapshotAge: this.lastSnapshotAt ? this.#now() - this.lastSnapshotAt : 0,
      bytes: this.connection.getBytesPerSecond(),
      pending: this.pendingInputs.length,
      correction: this.correction,
      interpolation: this.interpolationDelay,
      protocol: this.connection.protocol,
    };
  }

  // ---- SnapshotSink: the connection decodes straight into our ring ----
  slot(): PooledSnapshot {
    const slot = this.#ring[(this.#ringHead + this.#ringCount) % RING_SIZE]!;
    // The decoder is about to overwrite this slot's entities.
    slot.byId.forget();
    return slot.snapshot;
  }

  commit(snapshot: PooledSnapshot): void {
    const index = (this.#ringHead + this.#ringCount) % RING_SIZE;
    const slot = this.#ring[index]!;
    if (slot.snapshot !== snapshot) return;
    const receivedAt = this.#now();
    slot.receivedAt = receivedAt;
    slot.byId.rebuild(snapshot);
    const previous =
      this.#ringCount > 0 ? this.#slotAt(this.#ringCount - 1) : null;
    if (this.#ringCount < SNAPSHOT_BUFFER) this.#ringCount += 1;
    else this.#ringHead = (this.#ringHead + 1) % RING_SIZE;
    if (previous) this.#detectDestroyed(previous, slot);
    this.#applySnapshot(snapshot, receivedAt);
  }

  #slotAt(offset: number): SnapshotSlot {
    return this.#ring[(this.#ringHead + offset) % RING_SIZE]!;
  }

  #detectDestroyed(previous: SnapshotSlot, current: SnapshotSlot): void {
    if (!this.onDestroyed) return;
    const snapshot = previous.snapshot;
    for (let i = 0; i < snapshot.count; i += 1) {
      const entity = snapshot.entities[i]!;
      if (entity.kind !== "asteroid" && entity.kind !== "ship") continue;
      const next = current.byId.get(entity.id);
      if (!next || next.kind !== entity.kind)
        this.onDestroyed(entity.x, entity.y, entity.kind);
    }
  }

  #applySnapshot(snapshot: PooledSnapshot, receivedAt: number): void {
    this.serverTick = snapshot.tick;
    this.lastSnapshotAt = receivedAt;
    const previousScore = this.score;
    this.score = snapshot.score;
    if (this.score > previousScore)
      this.events.emit("hit", { score: this.score });
    let local: NetEntity | undefined;
    for (let i = 0; i < snapshot.count; i += 1) {
      const entity = snapshot.entities[i]!;
      if (entity.id === this.shipId && entity.kind === "ship") local = entity;
    }
    if (!local) return;
    if (!this.localShip) {
      this.localShip = shipFromNet(this.#ship, local);
      copyShip(this.#prev, this.#ship);
    } else {
      const before = copyShip(this.#before, this.localShip);
      const reconciled = shipFromNet(this.#replay, local);
      const ack = snapshot.lastProcessedSeq;
      let kept = 0;
      const pendingInputs = this.pendingInputs;
      for (let i = 0; i < pendingInputs.length; i += 1) {
        const pending = pendingInputs[i]!;
        if (pending.seq > ack) {
          this.pendingInputs[kept++] = pending;
          // Replay through the same shared integrate the server runs.
          integrateInPlace(
            reconciled,
            pending,
            NET_DT,
            reconciled,
            this.breakDeterminism,
          );
          wrapPosition(reconciled, this.width, this.height);
        } else {
          this.#inputPool.release(pending);
        }
      }
      this.pendingInputs.length = kept;
      this.correction = Math.hypot(
        before.x - reconciled.x,
        before.y - reconciled.y,
      );
      this.correctionOffset.x += before.x - reconciled.x;
      this.correctionOffset.y += before.y - reconciled.y;
      reconciled.fireCooldown = before.fireCooldown;
      copyShip(this.#ship, reconciled);
    }
    // Drop predicted bullets once the server's version of them shows up.
    const bullets = this.localBullets;
    let kept = 0;
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index]!;
      let confirmed = false;
      for (let i = 0; i < snapshot.count && !confirmed; i += 1) {
        const entity = snapshot.entities[i]!;
        confirmed =
          entity.kind === "bullet" &&
          entity.ownerId === this.shipId &&
          Math.hypot(entity.x - bullet.x, entity.y - bullet.y) < 45;
      }
      if (confirmed) this.bulletPool.release(bullet);
      else bullets[kept++] = bullet;
    }
    bullets.length = kept;
  }

  #renderItem(): RenderEntity {
    const index = this.#renderCount++;
    let item = this.#renderPool[index];
    if (!item) {
      item = blankRender();
      this.#renderPool.push(item);
    }
    this.#renderList[index] = item;
    return item;
  }

  /** Interpolates remote entities between the two snapshots around `target`. */
  #interpolate(target: number): void {
    const count = this.#ringCount;
    if (count === 0) return;
    let a = this.#slotAt(0);
    let b = this.#slotAt(count - 1);
    if (count === 1 || target <= a.receivedAt) {
      b = a;
    } else {
      for (let offset = 1; offset < count; offset += 1) {
        const current = this.#slotAt(offset);
        if (current.receivedAt >= target) {
          a = this.#slotAt(offset - 1);
          b = current;
          break;
        }
      }
    }
    const span = Math.max(1, b.receivedAt - a.receivedAt);
    const alpha = Math.max(0, Math.min(1, (target - a.receivedAt) / span));
    const from = a.snapshot;
    for (let i = 0; i < from.count; i += 1) {
      const entity = from.entities[i]!;
      if (
        entity.id === this.shipId ||
        (entity.kind === "bullet" && entity.ownerId === this.shipId)
      )
        continue;
      const next = a === b ? undefined : b.byId.get(entity.id);
      const item = this.#renderItem();
      writeRender(item, entity, false);
      item.hp = entity.hp;
      item.maxHp = entity.maxHp;
      item.ownerId = entity.ownerId;
      item.variant = entity.variant;
      if (next && next.kind === entity.kind) {
        item.x = lerp(entity.x, next.x, alpha);
        item.y = lerp(entity.y, next.y, alpha);
        item.angle = lerpAngle(entity.angle, next.angle, alpha);
      }
      item.prevX = item.x;
      item.prevY = item.y;
      item.prevAngle = item.angle;
    }
  }
}

function blankRender(): RenderEntity {
  return {
    id: entityId(0),
    kind: "ship",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 0,
    alive: true,
    hp: 0,
    maxHp: 0,
    ownerId: entityId(0),
    variant: 0,
    local: false,
    prevX: 0,
    prevY: 0,
    prevAngle: 0,
  };
}

function writeRender(
  item: RenderEntity,
  source: {
    readonly id: EntityId;
    readonly kind: EntityKind;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly angle: number;
    readonly radius: number;
    readonly alive: boolean;
  },
  local: boolean,
): void {
  item.id = source.id;
  item.kind = source.kind;
  item.x = source.x;
  item.y = source.y;
  item.vx = source.vx;
  item.vy = source.vy;
  item.angle = source.angle;
  item.radius = source.radius;
  item.alive = source.alive;
  item.local = local;
  item.hp = 0;
  item.maxHp = 0;
  item.ownerId = entityId(0);
  item.variant = 0;
  item.prevX = source.x;
  item.prevY = source.y;
  item.prevAngle = source.angle;
}

function shipFromNet(target: ShipEntity, net: NetEntity): ShipEntity {
  const defaults = SHIP_DEFAULTS;
  copyShip(target, defaults);
  target.id = net.id;
  target.x = net.x;
  target.y = net.y;
  target.vx = net.vx;
  target.vy = net.vy;
  target.angle = net.angle;
  target.hp = net.hp;
  target.maxHp = net.maxHp;
  target.alive = net.alive;
  return target;
}
const SHIP_DEFAULTS: ShipEntity = createShip(entityId(0), 0, 0);

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}
function lerpAngle(a: number, b: number, alpha: number): number {
  const delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + delta * alpha;
}
