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

  /** 分裂类泪弹命中后产生的小泪弹数量与初速。 */
  splitChildCount: 2,
  splitChildSpeed: 6,

  /** 追踪类泪弹每帧朝对手修正速度的比例。 */
  homingSteerStrength: 0.25,

  /** 神性光环的判定半径。 */
  auraRadius: 42,

  /** 神性光环的扣血冷却与单次伤害（半颗心）。 */
  auraDamageIntervalFrames: 30,
  auraDamageHalfHearts: 1,

  /** 天堂光柱类命中时的追加伤害（半颗心）。 */
  lightBeamBonusHalfHearts: 1,

  /** 命中生苍蝇类产生的苍蝇数量，以及召唤物追击对手的速度。 */
  mulliganFlyCount: 1,
  summonChaseSpeed: 3.2,

  /** 四分裂泪弹落地后裂出的小泪弹数量与初速。 */
  quadSplitChildSpeed: 5,

  /** 升天动画的自控时长（帧）。实测同房间转场不产生可用动画窗口，故由模组自己计时。 */
  ascentDurationFrames: 75,
  /** 升天期间胜者的上浮距离（像素）。 */
  ascentRiseDistance: 220,

  /** 同一颗泪弹对同一名对手的再次命中冷却（帧）。可操控的持续泪弹（路德维科）依赖它。 */
  tearRehitCooldownFrames: 20,

  /** 攻击型召唤物（蓝苍蝇一类）接触对手造成的伤害（半颗心）。 */
  summonContactHalfHearts: 1,
} as const;
