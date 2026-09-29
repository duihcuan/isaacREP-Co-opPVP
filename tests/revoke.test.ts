import { describe, expect, it } from "vitest";

import { itemsStillHeld } from "../src/core/revoke";

describe("道具收回清单", () => {
  it("全部收回后清单为空", () => {
    expect(itemsStillHeld([1, 2, 3], [])).toEqual([]);
  });

  it("仍被持有的道具保留在清单里", () => {
    expect(itemsStillHeld([1, 2, 3], [2, 3])).toEqual([2, 3]);
  });

  it("只保留清单内的道具，忽略无关的道具", () => {
    expect(itemsStillHeld([1, 2], [2, 99])).toEqual([2]);
  });

  it("原始清单不会被修改", () => {
    const pending = [1, 2];
    itemsStillHeld(pending, [1]);
    expect(pending).toEqual([1, 2]);
  });
});
