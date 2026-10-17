import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  snapshotByteLength,
} from "../codec/binary.ts";
import { parseClientMessage } from "../protocol/index.ts";
import { World } from "../sim/world.ts";
import { createAsteroid, createBullet } from "../sim/entity.ts";
import { entityId, sequenceNumber, tickNumber } from "../types.ts";
import type { EntityId, InputState, SnapshotEntity, Turn } from "../types.ts";

const turn = fc.constantFrom<Turn>(-1, 0, 1);
const input = fc.record({ thrust: fc.boolean(), turn, fire: fc.boolean() });
const uint32 = fc.integer({ min: 0, max: 0xffff_ffff });
const coord = fc.float({
  min: -1e5,
  max: 1e5,
  noNaN: true,
  noDefaultInfinity: true,
});

const entity: fc.Arbitrary<SnapshotEntity> = fc
  .record({
    id: fc.integer({ min: 0, max: 0xffff }),
    kind: fc.constantFrom("ship", "bullet", "asteroid", "pickup" as const),
    x: coord,
    y: coord,
    vx: coord,
    vy: coord,
    angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    hp: fc.integer({ min: 0, max: 65_535 }),
    owner: fc.integer({ min: 0, max: 0xffff }),
    flag: fc.boolean(),
    alive: fc.boolean(),
  })
  .map(({ id, kind, owner, flag, hp, ...rest }): SnapshotEntity => {
    const base = { ...rest, id: entityId(id), radius: 10 };
    switch (kind) {
      case "ship":
        return { ...base, kind, hp, maxHp: Math.max(100, hp) };
      case "bullet":
        return {
          ...base,
          kind,
          ownerId: entityId(owner),
          ttl: 1,
          homing: flag,
        };
      case "asteroid":
        return { ...base, kind, homing: flag, variant: 0 };
      default:
        return { ...base, kind: "pickup", variant: 0 };
    }
  });

const snapshot = fc.record({
  tick: uint32,
  seq: uint32,
  score: fc.integer({ min: -0x8000_0000, max: 0x7fff_ffff }),
  entities: fc.array(entity, { maxLength: 40 }),
});

describe("fast-check properties", () => {
  test("P1: decode(encode(input)) is the same input", () => {
    fc.assert(
      fc.property(uint32, uint32, input, (seq, tick, state) => {
        const packet = {
          seq: sequenceNumber(seq),
          tick: tickNumber(tick),
          ...state,
        };
        expect(decodeInput(encodeInput(packet))).toEqual(packet);
      }),
    );
  });

  test("P2: snapshot round-trip is lossless except float32 and angle rounding", () => {
    fc.assert(
      fc.property(snapshot, ({ tick, seq, score, entities }) => {
        const frame = encodeSnapshot(
          { version: 1, tick: tickNumber(tick), time: 0, entities, scores: {} },
          sequenceNumber(seq),
          score,
        );
        const decoded = decodeSnapshot(frame);
        expect(decoded.tick).toBe(tick);
        expect(decoded.lastProcessedSeq).toBe(seq);
        expect(decoded.score).toBe(score);
        decoded.entities.forEach((out, index) => {
          const source = entities[index]!;
          expect(out.id).toBe(source.id);
          expect(out.kind).toBe(source.kind);
          expect(out.alive).toBe(source.alive);
          expect(out.x).toBe(Math.fround(source.x));
          expect(out.vy).toBe(Math.fround(source.vy));
          // Angle is sent as Int16 thousandths of a radian.
          expect(Math.abs(out.angle - source.angle)).toBeLessThanOrEqual(
            0.0005 + 1e-12,
          );
          if (source.kind === "ship" && out.kind === "ship")
            expect(out.hp).toBe(source.hp);
          if (source.kind === "bullet" && out.kind === "bullet")
            expect(out.ownerId).toBe(source.ownerId);
        });
      }),
    );
  });

  test("P3: frame length matches the documented format (12 / 16 + 26·n)", () => {
    fc.assert(
      fc.property(snapshot, uint32, input, ({ tick, entities }, seq, state) => {
        const frame = encodeSnapshot({
          version: 1,
          tick: tickNumber(tick),
          time: 0,
          entities,
          scores: {},
        });
        expect(frame.byteLength).toBe(16 + 26 * entities.length);
        expect(frame.byteLength).toBe(snapshotByteLength(entities.length));
        expect(new DataView(frame).getUint16(6, true)).toBe(entities.length);
        const packet = encodeInput({
          seq: sequenceNumber(seq),
          tick: tickNumber(0),
          ...state,
        });
        expect(packet.byteLength).toBe(12);
      }),
    );
  });

  test("P4: a corrupted buffer throws an Error — never a crash or a bad value", () => {
    const decodeOrError = (decode: () => unknown) => {
      try {
        decode();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    };
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        decodeOrError(() => decodeSnapshot(bytes));
        decodeOrError(() => decodeInput(bytes));
      }),
    );
    // Flip bytes inside a valid frame: either still valid or a clean Error.
    fc.assert(
      fc.property(
        snapshot,
        fc.nat(),
        fc.integer({ min: 0, max: 255 }),
        ({ entities }, at, value) => {
          const frame = encodeSnapshot({
            version: 1,
            tick: tickNumber(1),
            time: 0,
            entities,
            scores: {},
          });
          const bytes = new Uint8Array(frame);
          bytes[at % bytes.length] = value;
          decodeOrError(() => {
            const decoded = decodeSnapshot(bytes);
            for (const e of decoded.entities)
              expect(Number.isFinite(e.x)).toBe(true);
          });
        },
      ),
    );
  });

  test("P5: a ship always stays inside the arena", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 959.99, noNaN: true }),
        fc.double({ min: 0, max: 599.99, noNaN: true }),
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.array(input, { minLength: 1, maxLength: 200 }),
        (x, y, vx, vy, inputs) => {
          const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
          const ship = world.addShip(world.allocateId(), x, y);
          ship.vx = vx;
          ship.vy = vy;
          for (const state of inputs) {
            world.step(
              1 / 30,
              new Map<EntityId, InputState>([[ship.id, state]]),
            );
            expect(ship.x).toBeGreaterThanOrEqual(0);
            expect(ship.x).toBeLessThan(world.width);
            expect(ship.y).toBeGreaterThanOrEqual(0);
            expect(ship.y).toBeLessThan(world.height);
          }
        },
      ),
    );
  });

  const validMessage = fc.oneof(
    fc.record({
      v: fc.constant(0),
      type: fc.constant("join"),
      room: fc
        .string({ minLength: 1, maxLength: 64 })
        .filter((s) => s.trim().length > 0),
      name: fc
        .string({ minLength: 1, maxLength: 18 })
        .filter((s) => s.trim().length > 0),
    }),
    fc.record({
      v: fc.constant(0),
      type: fc.constant("input"),
      seq: uint32,
      tick: uint32,
      thrust: fc.boolean(),
      turn,
      fire: fc.boolean(),
    }),
    fc.record({
      v: fc.constant(0),
      type: fc.constant("chat"),
      text: fc
        .string({ minLength: 1, maxLength: 200 })
        .filter((s) => s.trim().length > 0),
    }),
    fc.record({ v: fc.constant(0), type: fc.constant("leave") }),
    fc.record({
      v: fc.constant(0),
      type: fc.constant("ping"),
      t: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }),
  );

  test("P6: parseClientMessage accepts valid messages and rejects corrupted ones", () => {
    fc.assert(
      fc.property(validMessage, (message) => {
        expect(
          parseClientMessage(JSON.stringify(message), 1 << 16).success,
        ).toBe(true);
      }),
    );
    fc.assert(
      fc.property(
        validMessage,
        fc.constantFrom("drop-v", "bad-v", "bad-type", "truncate"),
        (message, corruption) => {
          const text = JSON.stringify(message);
          const corrupted =
            corruption === "drop-v"
              ? JSON.stringify({ ...message, v: undefined })
              : corruption === "bad-v"
                ? JSON.stringify({ ...message, v: 7 })
                : corruption === "bad-type"
                  ? JSON.stringify({ ...message, type: `${message.type}!` })
                  : text.slice(0, -1);
          expect(parseClientMessage(corrupted, 1 << 16).success).toBe(false);
        },
      ),
    );
  });

  test("P7: parseClientMessage never throws, whatever arrives on the socket", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.jsonValue(), fc.uint8Array(), fc.anything()),
        (data) => {
          const result = parseClientMessage(
            typeof data === "string" ? data : data,
            4096,
          );
          expect(typeof result.success).toBe("boolean");
        },
      ),
    );
  });

  test("P8: spatial hash and all-vs-all collisions agree on random worlds", () => {
    const point = fc.record({
      x: fc.double({ min: 0, max: 959, noNaN: true }),
      y: fc.double({ min: 0, max: 599, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.array(point, { maxLength: 30 }),
        fc.array(point, { maxLength: 60 }),
        (rocks, shots) => {
          const run = (broadphase: "hash" | "naive") => {
            const world = new World({
              seed: 1,
              arena: { asteroidCount: 0 },
              broadphase,
            });
            for (const rock of rocks)
              world.add(
                createAsteroid(world.allocateId(), rock.x, rock.y, 0, 0, 25),
              );
            const ship = world.addShip(world.allocateId(), 480, 300);
            for (const shot of shots) {
              const bullet = world.add(
                createBullet(world.allocateId(), ship.id, ship),
              );
              bullet.x = shot.x;
              bullet.y = shot.y;
            }
            world.collisions.resolve(world);
            return {
              alive: [...world.entities.values()].map((e) => e.alive),
              events: [...world.events],
            };
          };
          expect(run("hash")).toEqual(run("naive"));
        },
      ),
    );
  });

  test("P9: the step is deterministic for any input script", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.array(input, { maxLength: 120 }),
        (seed, inputs) => {
          const run = () => {
            const world = new World({ seed, arena: { asteroidCount: 5 } });
            world.seedArena();
            const ship = world.addShip(world.allocateId(), 480, 300);
            for (const state of inputs)
              world.step(1 / 30, new Map([[ship.id, state]]));
            return world.snapshot();
          };
          expect(run()).toEqual(run());
        },
      ),
      { numRuns: 30 },
    );
  });
});
