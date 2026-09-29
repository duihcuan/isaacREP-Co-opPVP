/**
 * 判断对同一位玩家的水迹伤害是否已经过了冷却。
 *
 * 水迹是持续存在的实体，玩家站在里面每帧都会重叠，必须自己控制扣血节奏，
 * 否则会瞬间扣光。
 */
export function shouldApplyCreepDamage(
  frame: number,
  lastDamageFrame: number,
  intervalFrames: number,
): boolean {
  return frame - lastDamageFrame >= intervalFrames;
}
