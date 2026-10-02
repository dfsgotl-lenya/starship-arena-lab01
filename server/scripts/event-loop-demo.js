setTimeout(() => console.log("timer"), 0);
globalThis.setImmediate(() => console.log("immediate"));
process.nextTick(() => console.log("nextTick"));
Promise.resolve().then(() => console.log("promise"));
