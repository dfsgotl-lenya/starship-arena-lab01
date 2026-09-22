const DEFAULT_CODES = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"];

export function createInput(target = window) {
  const down = new Set();
  const pressedThisFrame = new Set();

  const handleKeyDown = (event) => {
    if (DEFAULT_CODES.includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      pressedThisFrame.add(event.code);
    }
    down.add(event.code);
  };

  const handleKeyUp = (event) => {
    down.delete(event.code);
  };

  target.addEventListener("keydown", handleKeyDown, { passive: false });
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("blur", () => down.clear());

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressedThisFrame.has(code),
    endFrame: () => pressedThisFrame.clear(),
    destroy: () => {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
    },
  };
}
