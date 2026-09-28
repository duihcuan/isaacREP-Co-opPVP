export enum PvpPhase {
  IDLE = "IDLE",
  ARMING = "ARMING",
  COUNTDOWN = "COUNTDOWN",
  FIGHT = "FIGHT",
  RESULT = "RESULT",
}

export type RoundResult = "P1_WIN" | "P2_WIN" | "DRAW";

export type PvpEvent =
  | { readonly kind: "toggle-on" }
  | { readonly kind: "toggle-off" }
  | { readonly kind: "players-ready" }
  | { readonly kind: "countdown-finished" }
  | { readonly kind: "round-finished"; readonly result: RoundResult }
  | { readonly kind: "restart" }
  | { readonly kind: "players-lost" };

export interface PvpState {
  readonly phase: PvpPhase;
  readonly lastResult: RoundResult | undefined;
}

export function createInitialState(): PvpState {
  return { phase: PvpPhase.IDLE, lastResult: undefined };
}

/**
 * 判断当前是否应当因为玩家数不足而中止对局。
 *
 * ARMING 是「等待 2P 加入」的状态，此时只有一名玩家是正常的，绝不能中止；
 * RESULT 阶段玩家死亡后会变成幽灵但仍然在场，同样不该中止。
 */
export function shouldAbortRound(phase: PvpPhase, playerCount: number): boolean {
  if (phase !== PvpPhase.COUNTDOWN && phase !== PvpPhase.FIGHT) {
    return false;
  }
  return playerCount !== 2;
}

export function reduce(state: PvpState, event: PvpEvent): PvpState {
  if (event.kind === "players-lost" || event.kind === "toggle-off") {
    return createInitialState();
  }

  switch (state.phase) {
    case PvpPhase.IDLE: {
      return event.kind === "toggle-on" ? { phase: PvpPhase.ARMING, lastResult: undefined } : state;
    }
    case PvpPhase.ARMING: {
      return event.kind === "players-ready"
        ? { phase: PvpPhase.COUNTDOWN, lastResult: undefined }
        : state;
    }
    case PvpPhase.COUNTDOWN: {
      return event.kind === "countdown-finished"
        ? { phase: PvpPhase.FIGHT, lastResult: undefined }
        : state;
    }
    case PvpPhase.FIGHT: {
      return event.kind === "round-finished"
        ? { phase: PvpPhase.RESULT, lastResult: event.result }
        : state;
    }
    case PvpPhase.RESULT: {
      return event.kind === "restart" ? { phase: PvpPhase.COUNTDOWN, lastResult: undefined } : state;
    }
    default: {
      return state;
    }
  }
}
