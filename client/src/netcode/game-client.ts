import { integrate } from "@starship-arena/shared/sim/integrate.ts";
import { createBullet } from "@starship-arena/shared/sim/entity.ts";
import {
  entityId,
  sequenceNumber,
  tickNumber,
} from "@starship-arena/shared/types.ts";
import type {
  BulletEntity,
  EntityId,
  InputState,
  NetworkSnapshot,
  Seq,
  ShipEntity,
  SnapshotEntity,
  Tick,
  Turn,
} from "@starship-arena/shared/types.ts";
import { ServerMessageSchema } from "@starship-arena/shared/protocol/index.ts";
import type { GameConnection } from "../connection.ts";
import type { InputController, ClientEntity, RenderWorld } from "../types.ts";
import type { Bus } from "../events.ts";
import type { GameEvents } from "../events.ts";

const NET_DT = 1 / 30;
const DEFAULT_INTERPOLATION = 100;
type PredictedBullet = BulletEntity & { predictedAge: number };
interface TimedSnapshot {
  readonly receivedAt: number;
  readonly snapshot: NetworkSnapshot;
}
export interface NetworkGameOptions {
  readonly connection: GameConnection;
  readonly width: number;
  readonly height: number;
  readonly input: InputController;
  readonly events: Bus<GameEvents>;
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

export class NetworkGame {
  readonly connection: GameConnection;
  readonly width: number;
  readonly height: number;
  readonly input: InputController;
  readonly events: Bus<GameEvents>;
  playerId: string | null = null;
  shipId: EntityId | null = null;
  localShip: ShipEntity | null = null;
  localPrev: ShipEntity | null = null;
  pendingInputs: Array<{
    readonly seq: Seq;
    readonly tick: Tick;
    readonly thrust: boolean;
    readonly turn: Turn;
    readonly fire: boolean;
  }> = [];
  seq: Seq = sequenceNumber(0);
  predictionAccumulator = 0;
  fireQueued = false;
  snapshots: TimedSnapshot[] = [];
  lastSnapshotAt = 0;
  rtt = 0;
  correction = 0;
  correctionOffset = { x: 0, y: 0 };
  interpolationDelay = DEFAULT_INTERPOLATION;
  localBullets: PredictedBullet[] = [];
  breakDeterminism = false;
  score = 0;
  serverTick: Tick = tickNumber(0);
  onRoster:
    | ((
        players: readonly { readonly id: string; readonly name: string }[],
      ) => void)
    | null = null;
  onChat:
    | ((message: { readonly name: string; readonly text: string }) => void)
    | null = null;

  constructor({
    connection,
    width,
    height,
    input,
    events,
  }: NetworkGameOptions) {
    this.connection = connection;
    this.width = width;
    this.height = height;
    this.input = input;
    this.events = events;
    this.#bind();
  }

  #bind(): void {
    this.connection.addEventListener("joined", (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = ServerMessageSchema.safeParse(event.detail);
      if (!parsed.success || parsed.data.type !== "joined") return;
      this.playerId = parsed.data.playerId;
      this.shipId = parsed.data.shipId;
      this.serverTick = tickNumber(0);
    });
    this.connection.addEventListener("snapshot", (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = ServerMessageSchema.safeParse(event.detail);
      if (parsed.success && parsed.data.type === "snapshot")
        this.#snapshot(parsed.data);
    });
    this.connection.addEventListener("pong", (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = ServerMessageSchema.safeParse(event.detail);
      if (
        parsed.success &&
        parsed.data.type === "pong" &&
        typeof parsed.data.t === "number"
      )
        this.rtt = Math.max(0, performance.now() - parsed.data.t);
    });
    this.connection.addEventListener("roster", (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = ServerMessageSchema.safeParse(event.detail);
      if (parsed.success && parsed.data.type === "roster")
        this.onRoster?.(parsed.data.players);
    });
    this.connection.addEventListener("chat", (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = ServerMessageSchema.safeParse(event.detail);
      if (parsed.success && parsed.data.type === "chat")
        this.onChat?.(parsed.data);
    });
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
      this.localPrev = this.localShip ? { ...this.localShip } : null;
      const right =
        this.input.isDown("ArrowRight") || this.input.isDown("KeyD");
      const left = this.input.isDown("ArrowLeft") || this.input.isDown("KeyA");
      const turn: Turn = right === left ? 0 : right ? 1 : -1;
      const control: InputState = {
        thrust: this.input.isDown("ArrowUp") || this.input.isDown("KeyW"),
        turn,
        fire: this.fireQueued,
      };
      this.fireQueued = false;
      this.seq = sequenceNumber(Number(this.seq) + 1);
      const packet = {
        seq: this.seq,
        tick: this.serverTick,
        thrust: control.thrust,
        turn: control.turn,
        fire: control.fire,
      };
      this.pendingInputs.push(packet);
      if (this.pendingInputs.length > 60) this.pendingInputs.shift();
      if (this.localShip && this.shipId !== null) {
        if (control.fire && this.localShip.fireCooldown <= 0) {
          const bullet = createBullet(
            entityId(Number(this.seq) % 65_536),
            this.shipId,
            this.localShip,
          );
          this.localBullets.push({ ...bullet, predictedAge: 0 });
          this.localShip.fireCooldown = this.localShip.fireInterval;
          this.events.emit("fired", { predicted: true });
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

  render(now = performance.now()): RenderWorld {
    const remote = interpolateSnapshots(
      this.snapshots,
      now - this.interpolationDelay,
    );
    const entities: ClientEntity[] = [];
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
    if (remote) {
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
    }
    return { entities, score: this.score };
  }

  netStats(): NetworkStats {
    return {
      rtt: this.rtt,
      snapshotAge: this.lastSnapshotAt
        ? performance.now() - this.lastSnapshotAt
        : 0,
      bytes: this.connection.getBytesPerSecond(),
      pending: this.pendingInputs.length,
      correction: this.correction,
      interpolation: this.interpolationDelay,
      protocol: this.connection.protocol,
    };
  }

  #snapshot(snapshot: NetworkSnapshot): void {
    const receivedAt = performance.now();
    this.serverTick = snapshot.tick;
    this.lastSnapshotAt = receivedAt;
    const previousScore = this.score;
    this.score = Number(snapshot.score ?? 0);
    if (this.score > previousScore)
      this.events.emit("hit", { score: this.score });
    const local = snapshot.entities.find((entity) => entity.id === this.shipId);
    if (local?.kind === "ship") {
      if (!this.localShip) {
        this.localShip = createPredictedShip(local);
        this.localPrev = { ...this.localShip };
      } else {
        const before = { ...this.localShip };
        const authoritative = createPredictedShip(local);
        const ack = snapshot.lastProcessedSeq;
        this.pendingInputs = this.pendingInputs.filter(
          (item) => item.seq > ack,
        );
        let reconciled = authoritative;
        for (const pending of this.pendingInputs) {
          const input: InputState = {
            thrust: pending.thrust,
            turn: pending.turn,
            fire: pending.fire,
          };
          reconciled = wrapShip(
            integrate(reconciled, input, NET_DT, {
              breakDeterminism: this.breakDeterminism,
            }),
            this.width,
            this.height,
          );
        }
        this.correction = Math.hypot(
          before.x - reconciled.x,
          before.y - reconciled.y,
        );
        this.correctionOffset.x += before.x - reconciled.x;
        this.correctionOffset.y += before.y - reconciled.y;
        this.localShip = reconciled;
      }
      // ownerId is the numeric ship EntityId, whereas playerId is a UUID string; compare shipId.
      this.localBullets = this.localBullets.filter(
        (bullet) =>
          !snapshot.entities.some(
            (entity) =>
              entity.kind === "bullet" &&
              entity.ownerId === this.shipId &&
              Math.hypot(entity.x - bullet.x, entity.y - bullet.y) < 45,
          ),
      );
    }
    this.snapshots.push({ receivedAt, snapshot });
    if (this.snapshots.length > 12) this.snapshots.shift();
  }
}

function createPredictedShip(
  snapshot: Extract<SnapshotEntity, { kind: "ship" }>,
): ShipEntity {
  return {
    id: snapshot.id,
    kind: "ship",
    x: snapshot.x,
    y: snapshot.y,
    vx: snapshot.vx,
    vy: snapshot.vy,
    angle: snapshot.angle,
    radius: 18,
    hp: snapshot.hp,
    maxHp: snapshot.maxHp,
    turnSpeed: 3.4,
    thrustAcceleration: 260,
    drag: 0.992,
    maxSpeed: 420,
    fireCooldown: 0,
    fireInterval: 0.12,
    alive: snapshot.alive,
  };
}

function interpolateSnapshots(
  buffer: readonly TimedSnapshot[],
  targetTime: number,
): NetworkSnapshot | null {
  if (buffer.length === 0) return null;
  const first = buffer[0];
  const last = buffer[buffer.length - 1];
  if (!first || !last) return null;
  if (buffer.length === 1 || targetTime <= first.receivedAt)
    return first.snapshot;
  let a = first;
  let b = last;
  for (let index = 1; index < buffer.length; index += 1) {
    const current = buffer[index];
    const previous = buffer[index - 1];
    if (current && previous && current.receivedAt >= targetTime) {
      b = current;
      a = previous;
      break;
    }
  }
  const span = Math.max(1, b.receivedAt - a.receivedAt);
  const alpha = Math.max(0, Math.min(1, (targetTime - a.receivedAt) / span));
  const mapB = new Map<EntityId, SnapshotEntity>(
    b.snapshot.entities.map((entity): readonly [EntityId, SnapshotEntity] => [
      entity.id,
      entity,
    ]),
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

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}
function lerpAngle(a: number, b: number, alpha: number): number {
  const delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + delta * alpha;
}
function wrapShip(ship: ShipEntity, width: number, height: number): ShipEntity {
  const next = { ...ship };
  if (next.x < 0) next.x += width;
  if (next.x >= width) next.x -= width;
  if (next.y < 0) next.y += height;
  if (next.y >= height) next.y -= height;
  return next;
}
