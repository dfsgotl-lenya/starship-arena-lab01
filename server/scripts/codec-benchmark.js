import { performance } from "node:perf_hooks";
import {
  encodeInput,
  encodeSnapshot,
  decodeSnapshot,
} from "@starship-arena/shared/codec/binary.js";

const entities = [];
for (let i = 1; i <= 4; i += 1)
  entities.push({
    id: i,
    kind: "ship",
    ownerId: i,
    x: i * 100,
    y: 200 + i,
    vx: 10,
    vy: 20,
    angle: 0.5,
    hp: 100,
    alive: true,
  });
for (let i = 5; i <= 16; i += 1)
  entities.push({
    id: i,
    kind: "asteroid",
    ownerId: 0,
    x: i * 40,
    y: 300,
    vx: 5,
    vy: 2,
    angle: 0.2,
    hp: 0,
    alive: true,
    homing: i % 4 === 0,
  });
const snapshot = {
  version: 1,
  tick: 300,
  time: 10,
  entities,
  scores: { 1: 100, 2: 50, 3: 0, 4: 0 },
};
const input = { seq: 1, tick: 300, thrust: true, turn: 1, fire: false };
const jsonSnapshot = JSON.stringify(snapshot);
const binarySnapshot = encodeSnapshot(snapshot, 1, 100);
const jsonInput = JSON.stringify({ v: 0, type: "input", ...input });
const binaryInput = encodeInput(input);
const iterations = 10000;
let t0 = performance.now();
for (let i = 0; i < iterations; i += 1) JSON.stringify(snapshot);
for (let i = 0; i < iterations; i += 1) JSON.parse(jsonSnapshot);
const jsonUs = ((performance.now() - t0) * 1000) / iterations;
t0 = performance.now();
for (let i = 0; i < iterations; i += 1)
  decodeSnapshot(encodeSnapshot(snapshot, 1, 100));
const binaryUs = ((performance.now() - t0) * 1000) / iterations;
console.log(`JSON snapshot bytes: ${Buffer.byteLength(jsonSnapshot)}`);
console.log(`Binary snapshot bytes: ${binarySnapshot.byteLength}`);
console.log(`JSON input bytes: ${Buffer.byteLength(jsonInput)}`);
console.log(`Binary input bytes: ${binaryInput.byteLength}`);
console.log(
  `JSON down KB/s @30Hz: ${((Buffer.byteLength(jsonSnapshot) * 30) / 1024).toFixed(2)}`,
);
console.log(
  `Binary down KB/s @30Hz: ${((binarySnapshot.byteLength * 30) / 1024).toFixed(2)}`,
);
console.log(
  `JSON up KB/s @30Hz: ${((Buffer.byteLength(jsonInput) * 30) / 1024).toFixed(2)}`,
);
console.log(
  `Binary up KB/s @30Hz: ${((binaryInput.byteLength * 30) / 1024).toFixed(2)}`,
);
console.log(`JSON encode+decode avg: ${jsonUs.toFixed(2)} µs`);
console.log(`Binary encode+decode avg: ${binaryUs.toFixed(2)} µs`);
