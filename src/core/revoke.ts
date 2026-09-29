/**
 * 计算还需要继续收回的道具。
 *
 * 收回道具时玩家可能正处于幽灵（死亡）状态，或者引擎会把道具带回来，
 * 因此不能调用一次就把清单丢掉，必须按「当前仍被持有」重新计算，留到下一帧再试。
 */
export function itemsStillHeld(
  pending: readonly number[],
  stillHeldIds: readonly number[],
): readonly number[] {
  const stillHeldSet = new Set<number>(stillHeldIds);
  return pending.filter((collectible) => stillHeldSet.has(collectible));
}
