import type { InputController } from "./types.ts";

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

export function createInput(target: Window = window): InputController {
  const down = new Set<string>();
  const pressedThisFrame = new Set<string>();
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (DEFAULT_CODES.includes(event.code)) event.preventDefault();
    if (!event.repeat) pressedThisFrame.add(event.code);
    down.add(event.code);
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    down.delete(event.code);
  };
  const handleBlur = (): void => {
    down.clear();
  };

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
