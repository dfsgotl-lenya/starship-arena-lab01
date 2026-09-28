const DEFAULT_CODES = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "Space",
];

export function createInput(target = window) {
  const down = new Set();
  const pressedThisFrame = new Set();

  const handleKeyDown = (event) => {
    if (DEFAULT_CODES.includes(event.code)) event.preventDefault();
    if (!event.repeat) pressedThisFrame.add(event.code);
    down.add(event.code);
  };
  const handleKeyUp = (event) => down.delete(event.code);
  const handleBlur = () => down.clear();

  target.addEventListener("keydown", handleKeyDown, { passive: false });
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("blur", handleBlur);

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressedThisFrame.has(code),
    endFrame: () => pressedThisFrame.clear(),
    destroy: () => {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
      target.removeEventListener("blur", handleBlur);
    },
  };
}
