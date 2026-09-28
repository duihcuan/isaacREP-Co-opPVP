import { CONFIG } from "../data/config";
import { advanceDefeatWindow } from "./defeatWindow";
import type { DefeatWindow } from "./defeatWindow";
import type { HealthBackend } from "./health";
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
  players: readonly [EntityPlayer, EntityPlayer],
  health: HealthBackend,
): { readonly tracker: RoundTracker; readonly result: RoundResult | undefined } {
  const advanced = advanceDefeatWindow(
    tracker.window,
    frame,
    health.isDefeated(players[0]),
    health.isDefeated(players[1]),
    CONFIG.drawToleranceFrames,
  );
  return { tracker: { window: advanced.window }, result: advanced.result };
}
