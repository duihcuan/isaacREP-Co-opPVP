import type { RoundResult } from "./state";

export interface DefeatWindow {
  readonly firstDefeated: 1 | 2;
  readonly startFrame: number;
}

export interface DefeatWindowResult {
  readonly window: DefeatWindow | undefined;
  readonly result: RoundResult | undefined;
}

/**
 * 推进平局判定窗口。
 *
 * 两人在同一帧或容差帧数内出局判平局；只有一人出局且超过容差时，另一人获胜。
 */
export function advanceDefeatWindow(
  window: DefeatWindow | undefined,
  frame: number,
  p1Defeated: boolean,
  p2Defeated: boolean,
  toleranceFrames: number,
): DefeatWindowResult {
  if (window === undefined) {
    if (p1Defeated && p2Defeated) {
      return { window: undefined, result: "DRAW" };
    }
    if (p1Defeated) {
      return { window: { firstDefeated: 1, startFrame: frame }, result: undefined };
    }
    if (p2Defeated) {
      return { window: { firstDefeated: 2, startFrame: frame }, result: undefined };
    }
    return { window: undefined, result: undefined };
  }

  if (p1Defeated && p2Defeated && frame - window.startFrame <= toleranceFrames) {
    return { window: undefined, result: "DRAW" };
  }

  if (frame - window.startFrame > toleranceFrames) {
    return {
      window: undefined,
      result: window.firstDefeated === 1 ? "P2_WIN" : "P1_WIN",
    };
  }

  return { window, result: undefined };
}
