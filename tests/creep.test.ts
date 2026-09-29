import { describe, expect, it } from "vitest";

import { shouldApplyCreepDamage } from "../src/core/creep";

describe("水迹伤害冷却", () => {
  it("从未造成过伤害时可以立即造成伤害", () => {
    expect(shouldApplyCreepDamage(10, Number.NEGATIVE_INFINITY, 30)).toBe(true);
  });

  it("冷却未到时不再造成伤害", () => {
    expect(shouldApplyCreepDamage(10, 0, 30)).toBe(false);
  });

  it("冷却刚好到达时可以造成伤害", () => {
    expect(shouldApplyCreepDamage(30, 0, 30)).toBe(true);
  });

  it("冷却超过后可以造成伤害", () => {
    expect(shouldApplyCreepDamage(45, 0, 30)).toBe(true);
  });
});
