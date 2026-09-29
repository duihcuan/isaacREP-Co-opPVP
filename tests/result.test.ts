import { describe, expect, it } from "vitest";

import { createRoundTracker, evaluateRound } from "../src/core/result";

describe("evaluateRound", () => {
  it("无人出局时不产生结果", () => {
    const r = evaluateRound(createRoundTracker(), 100, false, false);
    expect(r.result).toBeUndefined();
  });

  it("同一帧两人出局判平局", () => {
    const r = evaluateRound(createRoundTracker(), 100, true, true);
    expect(r.result).toBe("DRAW");
  });

  it("P1 出局时先开窗口，不立刻判负", () => {
    const r = evaluateRound(createRoundTracker(), 100, true, false);
    expect(r.result).toBeUndefined();
    expect(r.tracker.window).toEqual({ firstDefeated: 1, startFrame: 100 });
  });

  it("容差内 P2 也出局判平局", () => {
    let tracker = createRoundTracker();
    tracker = evaluateRound(tracker, 100, true, false).tracker;
    const r = evaluateRound(tracker, 102, true, true);
    expect(r.result).toBe("DRAW");
  });

  it("超出容差后 P1 判负", () => {
    let tracker = createRoundTracker();
    tracker = evaluateRound(tracker, 100, true, false).tracker;
    const r = evaluateRound(tracker, 110, true, false);
    expect(r.result).toBe("P2_WIN");
  });
});
