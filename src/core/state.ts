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
