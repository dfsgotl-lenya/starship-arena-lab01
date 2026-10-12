import test from "node:test";
import assert from "node:assert/strict";
import { parseClientMessage } from "../src/protocol.ts";

test("accepts valid chat", () => {
  const result = parseClientMessage(
    JSON.stringify({ v: 0, type: "chat", text: "hello" }),
    1024,
  );
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.type, "chat");
});

test("rejects unknown type", () => {
  const result = parseClientMessage(
    JSON.stringify({ v: 0, type: "warp" }),
    1024,
  );
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "INVALID_MESSAGE");
});

test("rejects oversized payload", () => {
  const result = parseClientMessage(
    JSON.stringify({ v: 0, type: "chat", text: "x".repeat(2000) }),
    100,
  );
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "MESSAGE_TOO_LARGE");
});

test("malformed JSON is returned as an error result, not thrown", () => {
  const result = parseClientMessage("{not-json", 1024);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "BAD_JSON");
});
