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

  /** 对局开始后首次刷新道具的延迟（帧）。 */
  itemSpawnFirstDelayFrames: 60,

  /** 本局前几个道具使用的短间隔（帧）。 */
  itemSpawnFastIntervalFrames: 90,

  /** 常规道具刷新间隔（帧）。 */
  itemSpawnIntervalFrames: 300,

  /** 本局用短间隔刷新的道具个数。 */
  fastSpawnCount: 2,

  /** 场上同时存在的道具上限。 */
  maxItemsOnField: 4,

  /** 每次刷新时改为生成箱子的概率（0 到 1）。 */
  chestChance: 0.35,

  /** 单次刷新最多抽取几次道具池。 */
  itemPickMaxAttempts: 20,

  /** 结算画面停留多久后自动开始下一局（帧，90 帧 = 3 秒）。 */
  resultRestartDelayFrames: 90,

  /** 单次水迹伤害（半颗心）。 */
  creepDamagePerTick: 1,

  /** 水迹伤害的冷却帧数。 */
  creepDamageIntervalFrames: 30,

  /** 水迹的判定半径。 */
  creepHitRadius: 24,

  /** 连续多少帧处于幽灵状态才判定出局（容纳复活类道具与角色的复活过程）。 */
  ghostConfirmFrames: 15,

  /** 带爆炸标记的泪弹（如依庇卡）命中时产生的爆炸伤害。 */
  explosiveTearDamage: 30,

  /** 雅各布天梯类闪电效果在 PVP 里的等效追加伤害（半颗心）。 */
  jacobsLadderBonusHalfHearts: 1,

  /** 带击退标记的泪弹命中时推开对手的速度。 */
  tearKnockbackForce: 6,
} as const;
