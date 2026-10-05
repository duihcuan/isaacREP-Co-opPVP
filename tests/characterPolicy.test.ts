import { describe, expect, it } from "vitest";

import { createCharacterPolicy } from "../src/core/characterPolicy";

describe("角色白名单", () => {
  it("自定义角色不在名单内", () => {
    const policy = createCharacterPolicy([0, 2]);
    expect(policy.isAllowed(9999)).toBe(false);
  });

  it("未加入名单的角色不被允许", () => {
    const policy = createCharacterPolicy([0, 2]);
    expect(policy.isAllowed(1)).toBe(false);
  });

  it("名单内的以撒被允许", () => {
    const policy = createCharacterPolicy([0, 2]);
    expect(policy.isAllowed(0)).toBe(true);
  });
});
