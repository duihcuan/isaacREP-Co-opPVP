import { describe, expect, it } from "vitest";

import { isPlayerDefeated } from "../src/core/defeat";

describe("出局判定", () => {
  it("正常存活不算出局", () => {
    expect(isPlayerDefeated({ isDead: false, isCoopGhost: false })).toBe(false);
  });

  it("死亡动画中（可能正在复活）不算出局", () => {
    expect(isPlayerDefeated({ isDead: true, isCoopGhost: false })).toBe(false);
  });

  it("变成永久幽灵才算真出局", () => {
    expect(isPlayerDefeated({ isDead: true, isCoopGhost: true })).toBe(true);
  });

  it("幽灵状态即使 isDead 为 false 也算出局", () => {
    expect(isPlayerDefeated({ isDead: false, isCoopGhost: true })).toBe(true);
  });
});
