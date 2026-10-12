import type { EntityId } from "@starship-arena/shared/types.ts";

export interface GameEvents {
  fired: { readonly predicted: boolean };
  hit: { readonly score: number };
  exploded: { readonly entityId: EntityId };
  scoreChanged: { readonly score: number };
}

/** Generic event bus ties each event name to its exact payload at compile time. */
export class Bus<Events extends object> extends EventTarget {
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    this.dispatchEvent(new CustomEvent(String(name), { detail: payload }));
  }
}
