/**
 * 状态效果的「计划」计算（纯逻辑）。
 *
 * 自建命中路径下，引擎原本在命中时施加的中毒/燃烧/减速等效果不会自动发生，
 * 需要我们自己补挂。这里只负责把「该挂哪些效果、挂多久、强度多少」算出来，
 * 真正调用引擎接口的部分在 damage.ts。
 */
export type StatusEffectKind =
  | "poison"
  | "burn"
  | "slow"
  | "freezeAsSlow"
  | "fear"
  | "charm"
  | "confusion"
  | "shrink";

export interface StatusEffectSpec {
  /** 期望持续时间（帧）。 */
  readonly durationFrames: number;
  /** 强度：毒/燃烧是每跳伤害，减速是速度系数。 */
  readonly magnitude: number;
  /** PVP 下的持续时间上限，避免某个道具一次挂太久。 */
  readonly maxDurationFrames: number;
}

export type StatusEffectTable = Readonly<Record<StatusEffectKind, StatusEffectSpec>>;

export interface StatusEffectApplication {
  readonly kind: StatusEffectKind;
  readonly durationFrames: number;
  readonly magnitude: number;
}

/** 把「命中的泪弹带有哪些效果」换算成实际要施加的列表，并按上限截断持续时间。 */
export function planStatusEffects(
  activeKinds: readonly StatusEffectKind[],
  table: StatusEffectTable,
): readonly StatusEffectApplication[] {
  const plan: StatusEffectApplication[] = [];
  for (const kind of activeKinds) {
    const spec = table[kind];
    plan.push({
      kind,
      durationFrames: Math.min(spec.durationFrames, spec.maxDurationFrames),
      magnitude: spec.magnitude,
    });
  }
  return plan;
}
