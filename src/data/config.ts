export const CONFIG = {
  /** 开局倒计时长度（帧，30 帧 = 1 秒）。 */
  countdownFrames: 90,

  /** 出生点相对房间中心的水平偏移。 */
  spawnOffsetX: 160,

  /** 单次 PVP 命中造成的伤害，单位是半颗心。 */
  damagePerHalfHeartHit: 1,

  /** 平局容差帧数。 */
  drawToleranceFrames: 3,

  /** 离场拉回的冷却帧数，避免传送抖动。 */
  pullBackCooldownFrames: 30,

  /** 诊断心跳的间隔帧数。 */
  heartbeatFrames: 90,
} as const;
