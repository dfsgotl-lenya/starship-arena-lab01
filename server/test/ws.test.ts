import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { attachWebSocketServer } from "../src/ws.ts";
import { RoomManager } from "../src/rooms.ts";
import {
  decodeSnapshot,
  encodeInput,
} from "@starship-arena/shared/codec/binary.ts";
import { sequenceNumber, tickNumber } from "@starship-arena/shared/types.ts";
import { testConfig } from "./helpers.ts";

let url = "";
let close: () => Promise<void> = async () => undefined;

beforeEach(async () => {
  const config = testConfig({ messageRate: 60 });
  const server = createServer();
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: config.maxPayload,
  });
  const rooms = new RoomManager(config);
  const stop = attachWebSocketServer(wss, rooms, config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  close = async () => {
    stop();
    for (const client of wss.clients) client.terminate();
    wss.close();
    await rooms.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
});
afterEach(async () => close());

interface Client {
  socket: WebSocket;
  json: Array<{ type: string; [key: string]: unknown }>;
  binary: ArrayBuffer[];
  closed: Promise<{ code: number; reason: string }>;
}
function connect(query = ""): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url + query);
    const client: Client = {
      socket,
      json: [],
      binary: [],
      closed: new Promise((done) =>
        socket.on("close", (code, reason) =>
          done({ code, reason: String(reason) }),
        ),
      ),
    };
    socket.on("message", (data: Buffer, isBinary) => {
      if (isBinary)
        client.binary.push(
          data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ) as ArrayBuffer,
        );
      else client.json.push(JSON.parse(String(data)) as Client["json"][number]);
    });
    socket.on("open", () => resolve(client));
    socket.on("error", reject);
  });
}
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
const join = (client: Client, name: string) =>
  client.socket.send(
    JSON.stringify({ v: 0, type: "join", room: "alpha", name }),
  );

describe("WebSocket server (integration)", () => {
  test("two clients join one room, see each other in the roster and chat reaches both", async () => {
    const a = await connect();
    const b = await connect();
    join(a, "Ann");
    await until(() => a.json.some((m) => m.type === "joined"));
    join(b, "Bob");
    await until(() =>
      a.json.some(
        (m) => m.type === "roster" && (m.players as unknown[]).length === 2,
      ),
    );
    b.socket.send(JSON.stringify({ v: 0, type: "chat", text: "hi Ann" }));
    await until(() =>
      a.json.some((m) => m.type === "chat" && m.text === "hi Ann"),
    );
    expect(b.json.some((m) => m.type === "chat" && m.name === "Bob")).toBe(
      true,
    );
  });

  test("binary snapshots arrive at 30 Hz and decode", async () => {
    const a = await connect();
    join(a, "Ann");
    await until(() => a.binary.length >= 5);
    const snapshot = decodeSnapshot(a.binary.at(-1));
    expect(snapshot.entities.some((e) => e.kind === "ship")).toBe(true);
  });

  test("the other client sees the first client's ship move", async () => {
    const a = await connect();
    const b = await connect();
    join(a, "Ann");
    await until(() => a.json.some((m) => m.type === "joined"));
    const shipId = a.json.find((m) => m.type === "joined")?.shipId as number;
    join(b, "Bob");
    await until(() => b.binary.length > 2);
    const xOf = () =>
      decodeSnapshot(b.binary.at(-1)).entities.find((e) => e.id === shipId)
        ?.x ?? 0;
    const start = xOf();
    for (let seq = 1; seq <= 20; seq += 1)
      a.socket.send(
        encodeInput({
          seq: sequenceNumber(seq),
          tick: tickNumber(0),
          thrust: true,
          turn: 0,
          fire: false,
        }),
      );
    await until(() => Math.abs(xOf() - start) > 5);
  });

  test("a corrupted binary frame closes that socket with 1008; the server keeps running", async () => {
    const bad = await connect();
    join(bad, "Bad");
    await until(() => bad.json.some((m) => m.type === "joined"));
    bad.socket.send(new Uint8Array([9, 9, 9]));
    const closed = await bad.closed;
    expect(closed.code).toBe(1008);
    const good = await connect();
    join(good, "Good");
    await until(() => good.json.some((m) => m.type === "joined"));
  });

  test("malformed JSON gets 1008, unknown room gets an error message", async () => {
    const a = await connect();
    a.socket.send(
      JSON.stringify({ v: 0, type: "join", room: "nope", name: "X" }),
    );
    await until(() => a.json.some((m) => m.type === "errorMessage"));
    a.socket.send("{oops");
    expect((await a.closed).code).toBe(1008);
  });

  test("a flood of messages trips the rate limit", async () => {
    const a = await connect();
    for (let i = 0; i < 200; i += 1)
      a.socket.send(JSON.stringify({ v: 0, type: "ping", t: i }));
    const closed = await a.closed;
    expect(closed.code).toBe(1008);
    expect(closed.reason).toMatch(/rate/);
  });
});
