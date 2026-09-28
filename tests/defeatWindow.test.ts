import { describe, expect, it } from "vitest";

import { advanceDefeatWindow } from "../src/core/defeatWindow";

describe("平局容差窗口", () => {
  it("没人出局时不产生结果", () => {
    const r = advanceDefeatWindow(undefined, 100, false, false, 3);
    expect(r.window).toBeUndefined();
    expect(r.result).toBeUndefined();
  });

  it("同一帧两人出局直接平局", () => {
    const r = advanceDefeatWindow(undefined, 100, true, true, 3);
    expect(r.result).toBe("DRAW");
  });

  it("P1 先出局时记录窗口，暂不判负", () => {
    const r = advanceDefeatWindow(undefined, 100, true, false, 3);
    expect(r.window).toEqual({ firstDefeated: 1, startFrame: 100 });
    expect(r.result).toBeUndefined();
  });

  it("容差内 P2 也出局则判平局", () => {
    const window = { firstDefeated: 1 as const, startFrame: 100 };
    const r = advanceDefeatWindow(window, 103, true, true, 3);
    expect(r.result).toBe("DRAW");
  });

  it("超出容差后 P1 判负", () => {
    const window = { firstDefeated: 1 as const, startFrame: 100 };
    const r = advanceDefeatWindow(window, 104, true, false, 3);
    expect(r.result).toBe("P2_WIN");
  });

  it("超出容差后 P2 判负", () => {
    const window = { firstDefeated: 2 as const, startFrame: 100 };
    const r = advanceDefeatWindow(window, 104, false, true, 3);
    expect(r.result).toBe("P1_WIN");
  });
});
