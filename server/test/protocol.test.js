import test from "node:test";
import assert from "node:assert/strict";
import { parseMessage } from "../src/protocol.js";

test("accepts valid chat", () => {
  const value = parseMessage(
    JSON.stringify({ v: 0, type: "chat", text: "hello" }),
    1024,
  );
  assert.equal(value.type, "chat");
});

test("rejects unknown type", () => {
  assert.throws(() =>
    parseMessage(JSON.stringify({ v: 0, type: "warp" }), 1024),
  );
});

test("rejects oversized payload", () => {
  assert.throws(() =>
    parseMessage(
      JSON.stringify({ v: 0, type: "chat", text: "x".repeat(2000) }),
      100,
    ),
  );
});
