export function createHud(dom, events) {
  const setScore = (score) => { dom.score.textContent = String(score); };
  const setStatus = (text) => { dom.statusBadge.textContent = text; };
  events.addEventListener("scoreChanged", (event) => setScore(event.detail.score));
  return {
    update(stats, world) {
      dom.steps.textContent = stats.stepsPerSecond.toFixed(1);
      dom.frames.textContent = stats.framesPerSecond.toFixed(1);
      dom.frameTime.textContent = `${stats.frameTimeMs.toFixed(2)} ms`;
      dom.entities.textContent = String([...world].length);
      dom.hp.textContent = world.playerShip ? String(world.playerShip.hp) : "RESPAWN";
      dom.activePower.textContent = world.playerShip?.activePowerup ?? "—";
      dom.room.textContent = world.roomName || "—";
    },
    setScore,
    setStatus,
  };
}
