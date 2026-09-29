/**
 * 道具刷新计时判定（纯逻辑）。
 *
 * @param frame 当前对局帧数（从对局开始算起）
 * @param lastSpawnFrame 上次刷新所在的对局帧数，尚未刷新过时传 -1
 * @param itemsOnField 场上现存道具数量
 */
export function shouldSpawnItem(
  frame: number,
  lastSpawnFrame: number,
  itemsOnField: number,
  spawnsThisRound: number,
  firstDelayFrames: number,
  fastIntervalFrames: number,
  normalIntervalFrames: number,
  fastSpawnCount: number,
  maxItemsOnField: number,
): boolean {
  if (itemsOnField >= maxItemsOnField) {
    return false;
  }
  if (lastSpawnFrame < 0) {
    return frame >= firstDelayFrames;
  }
  const intervalFrames =
    spawnsThisRound < fastSpawnCount ? fastIntervalFrames : normalIntervalFrames;
  return frame - lastSpawnFrame >= intervalFrames;
}
