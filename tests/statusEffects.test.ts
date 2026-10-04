import { describe, expect, it } from "vitest";

import { planStatusEffects } from "../src/core/statusEffects";
import type { StatusEffectTable } from "../src/core/statusEffects";

const table: StatusEffectTable = {
  poison: { durationFrames: 60, magnitude: 1, maxDurationFrames: 120 },
  burn: { durationFrames: 300, magnitude: 1, maxDurationFrames: 90 },
  slow: { durationFrames: 90, magnitude: 0.5, maxDurationFrames: 180 },
  freezeAsSlow: { durationFrames: 60, magnitude: 0.3, maxDurationFrames: 180 },
  fear: { durationFrames: 30, magnitude: 1, maxDurationFrames: 150 },
  charm: { durationFrames: 30, magnitude: 1, maxDurationFrames: 150 },
  confusion: { durationFrames: 30, magnitude: 1, maxDurationFrames: 150 },
  shrink: { durationFrames: 30, magnitude: 1, maxDurationFrames: 150 },
};

describe("状态效果计划", () => {
  it("没有效果时返回空列表", () => {
    expect(planStatusEffects([], table)).toEqual([]);
  });

  it("按传入顺序生成应用列表", () => {
    const plan = planStatusEffects(["poison", "fear"], table);
    expect(plan.map((entry) => entry.kind)).toEqual(["poison", "fear"]);
  });

  it("超过上限的持续时间会被截断", () => {
    const plan = planStatusEffects(["burn"], table);
    expect(plan[0]?.durationFrames).toBe(90);
  });

  it("未超过上限时保持原值", () => {
    const plan = planStatusEffects(["poison"], table);
    expect(plan[0]?.durationFrames).toBe(60);
  });

  it("强度原样传递", () => {
    const plan = planStatusEffects(["freezeAsSlow"], table);
    expect(plan[0]?.magnitude).toBe(0.3);
  });
});
