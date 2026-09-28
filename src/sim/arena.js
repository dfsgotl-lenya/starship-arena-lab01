export function wrapPosition(value, size, margin = 24) {
  if (value < -margin) return size + margin;
  if (value > size + margin) return -margin;
  return value;
}

export function wrapEntity(entity, width, height) {
  entity.pos.x = wrapPosition(entity.pos.x, width, entity.radius);
  entity.pos.y = wrapPosition(entity.pos.y, height, entity.radius);
  return entity;
}
