import type { StatusEffectKind, StatusEffectTable } from "../core/statusEffects";

/**
 * PVP 下特效泪弹的数值表。
 *
 * 数值都是按 PVP 平衡调过的，不是原版数值：原版这些效果是给"打敌人"设计的，
 * 直接照搬会一套连招打死人。要调手感只改下面这张表即可。
 *
 * 旗标到效果的对应关系写在 damage.ts 的 applyTearEffects 里（用显式判断，
 * 避免把游戏枚举当作普通数据传递时出现类型问题）。
 */
export type { StatusEffectKind };

/**
 * PVP 下的效果数值。
 *
 * - `durationFrames`：期望持续帧数（30 帧 = 1 秒）
 * - `magnitude`：毒/燃烧是每跳伤害，减速是速度系数（越小越慢）
 * - `maxDurationFrames`：硬上限，防止某些道具一次挂太久
 */
export const STATUS_EFFECT_TABLE: StatusEffectTable = {
  slow: { durationFrames: 90, magnitude: 0.6, maxDurationFrames: 180 },
  freezeAsSlow: { durationFrames: 90, magnitude: 0.35, maxDurationFrames: 150 },
  poison: { durationFrames: 60, magnitude: 1, maxDurationFrames: 120 },
  burn: { durationFrames: 60, magnitude: 1, maxDurationFrames: 90 },
  fear: { durationFrames: 45, magnitude: 1, maxDurationFrames: 150 },
  charm: { durationFrames: 45, magnitude: 1, maxDurationFrames: 150 },
  confusion: { durationFrames: 60, magnitude: 1, maxDurationFrames: 150 },
  shrink: { durationFrames: 45, magnitude: 1, maxDurationFrames: 150 },
};
