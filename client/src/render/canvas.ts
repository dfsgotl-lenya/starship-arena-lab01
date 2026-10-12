export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
export interface CanvasSetup {
  readonly ctx: CanvasRenderingContext2D;
  readonly size: CanvasSize;
  destroy(): void;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  onResize: (size: CanvasSize) => void = () => {},
): CanvasSetup {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context is not available");
  let width = 0;
  let height = 0;
  let dpr = 1;
  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize({ width, height, dpr });
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return {
    ctx,
    get size() {
      return { width, height, dpr };
    },
    destroy() {
      observer.disconnect();
    },
  };
}
