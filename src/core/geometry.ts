export interface CircleLike {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface PointLike {
  readonly x: number;
  readonly y: number;
}

/** 圆形碰撞判定。以撒的碰撞体是圆形，用圆判定足够。 */
export function circlesOverlap(a: CircleLike, b: CircleLike): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radiusSum = a.radius + b.radius;
  return dx * dx + dy * dy <= radiusSum * radiusSum;
}

/** 计算房间中心左右对称的两个出生点。 */
export function getSpawnPoints(
  centerX: number,
  centerY: number,
  offsetX: number,
): readonly [PointLike, PointLike] {
  return [
    { x: centerX - offsetX, y: centerY },
    { x: centerX + offsetX, y: centerY },
  ];
}
