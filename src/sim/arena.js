export function wrapPosition(value, size, margin = 24) {
  if (value < -margin) return size + margin;
  if (value > size + margin) return -margin;
  return value;
}

export function wrapShipToArena(ship, width, height) {
  return {
    ...ship,
    x: wrapPosition(ship.x, width),
    y: wrapPosition(ship.y, height),
  };
}
