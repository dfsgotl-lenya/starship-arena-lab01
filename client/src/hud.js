export function createHud(dom, events) {
  const setScore = (score) => {
    dom.score.textContent = String(score);
  };
  const setStatus = (text) => {
    dom.statusBadge.textContent = text;
  };
  events.addEventListener("scoreChanged", (event) =>
    setScore(event.detail.score),
  );
  return {
    update(stats, world) {
      dom.steps.textContent = stats.stepsPerSecond.toFixed(1);
      dom.frames.textContent = stats.framesPerSecond.toFixed(1);
      dom.frameTime.textContent = `${stats.frameTimeMs.toFixed(2)} ms`;
      dom.entities.textContent = String(world.entities?.length ?? 0);
      const local = world.entities?.find(
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
