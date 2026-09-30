import test from "node:test";
import assert from "node:assert/strict";
import { TokenBucket } from "../src/rate-limit.js";

test("token bucket limits bursts", () => {
  const bucket = new TokenBucket(2, 2);
  assert.equal(bucket.consume(), true);
  assert.equal(bucket.consume(), true);
  assert.equal(bucket.consume(), false);
});
