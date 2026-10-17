/// <reference lib="webworker" />
import { decodeSnapshot } from "@starship-arena/shared/codec/binary.ts";
import { packSnapshot } from "./snapshot-pack.ts";

/** Lab 7 experiment: validate + decode binary snapshots off the main thread. */
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  try {
    const packed = packSnapshot(decodeSnapshot(event.data));
    scope.postMessage(packed, [packed.buffer]);
  } catch (error: unknown) {
    scope.postMessage(error instanceof Error ? error.message : String(error));
  }
});
