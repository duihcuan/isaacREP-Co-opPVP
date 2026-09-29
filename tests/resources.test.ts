import { describe, expect, it } from "vitest";

import { applyAdd, applySpend, canSpend } from "../src/core/resources";

describe("资源计算", () => {
  it("拾取后数量增加", () => {
    expect(applyAdd(2, 1)).toBe(3);
  });

  it("数量不会变成负数", () => {
    expect(applyAdd(0, -5)).toBe(0);
  });

  it("足够时允许花费", () => {
    expect(canSpend(2, 1)).toBe(true);
  });

  it("不足时不允许花费", () => {
    expect(canSpend(0, 1)).toBe(false);
  });

  it("花费数量为 0 不算有效花费", () => {
    expect(canSpend(5, 0)).toBe(false);
  });

  it("花费后数量减少", () => {
    expect(applySpend(3, 1)).toBe(2);
  });

  it("花费后不会低于 0", () => {
    expect(applySpend(1, 5)).toBe(0);
  });
});
