import type { LoopStats, RenderWorld } from "./types.ts";

export interface HudElements {
  readonly score: HTMLElement;
  readonly statusBadge: HTMLElement;
  readonly steps: HTMLElement;
  readonly frames: HTMLElement;
  readonly frameTime: HTMLElement;
  readonly entities: HTMLElement;
  readonly hp: HTMLElement;
  readonly activePower: HTMLElement;
  readonly room: HTMLElement;
}

export function createHud(dom: HudElements, events: EventTarget) {
  const setScore = (score: number): void => {
    dom.score.textContent = String(score);
  };
  const setStatus = (text: string): void => {
    dom.statusBadge.textContent = text;
  };
  events.addEventListener("scoreChanged", (event) => {
    if (event instanceof CustomEvent) {
      const detail: unknown = event.detail;
      if (
        typeof detail === "object" &&
        detail !== null &&
        "score" in detail &&
        typeof detail.score === "number"
      )
        setScore(detail.score);
    }
  });
  return {
    update(stats: LoopStats, world: RenderWorld): void {
      dom.steps.textContent = stats.stepsPerSecond.toFixed(1);
      dom.frames.textContent = stats.framesPerSecond.toFixed(1);
      dom.frameTime.textContent = `${stats.frameTimeMs.toFixed(2)} ms`;
      dom.entities.textContent = String(world.entities.length);
      const local = world.entities.find(
        (entity) => entity.local && entity.kind === "ship",
      );
      dom.hp.textContent = local ? String(local.hp ?? 100) : "WAIT";
      dom.activePower.textContent = "—";
      dom.room.textContent = world.roomName || dom.room.textContent || "—";
      setScore(world.score ?? 0);
    },
    setScore,
    setStatus,
  };
}
