import { CONFIG } from "../data/config";
import { advanceDefeatWindow } from "./defeatWindow";
import type { DefeatWindow } from "./defeatWindow";
import type { RoundResult } from "./state";

export interface RoundTracker {
  readonly window: DefeatWindow | undefined;
}

export function createRoundTracker(): RoundTracker {
  return { window: undefined };
}

export function evaluateRound(
  tracker: RoundTracker,
  frame: number,
  p1Defeated: boolean,
  p2Defeated: boolean,
): { readonly tracker: RoundTracker; readonly result: RoundResult | undefined } {
  const advanced = advanceDefeatWindow(
    tracker.window,
    frame,
    p1Defeated,
    p2Defeated,
    CONFIG.drawToleranceFrames,
  );
  return { tracker: { window: advanced.window }, result: advanced.result };
}
