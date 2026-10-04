import { describe, expect, it } from "vitest";

import {
  PvpPhase,
  createInitialState,
  createRunStartState,
  isRoundActive,
  reduce,
  shouldAbortRound,
} from "../src/core/state";

describe("对局状态机", () => {
  it("初始为 IDLE", () => {
    expect(createInitialState().phase).toBe(PvpPhase.IDLE);
  });

  it("IDLE 收到 toggle-on 进入 ARMING", () => {
    const state = reduce(createInitialState(), { kind: "toggle-on" });
    expect(state.phase).toBe(PvpPhase.ARMING);
  });

  it("ARMING 收到 players-ready 进入 COUNTDOWN", () => {
    let state = reduce(createInitialState(), { kind: "toggle-on" });
    state = reduce(state, { kind: "players-ready" });
    expect(state.phase).toBe(PvpPhase.COUNTDOWN);
  });

  it("COUNTDOWN 收到 countdown-finished 进入 FIGHT", () => {
    let state = reduce(createInitialState(), { kind: "toggle-on" });
    state = reduce(state, { kind: "players-ready" });
    state = reduce(state, { kind: "countdown-finished" });
    expect(state.phase).toBe(PvpPhase.FIGHT);
  });

  it("FIGHT 收到 round-finished 进入 RESULT 并记录结果", () => {
    let state = reduce(createInitialState(), { kind: "toggle-on" });
    state = reduce(state, { kind: "players-ready" });
    state = reduce(state, { kind: "countdown-finished" });
    state = reduce(state, { kind: "round-finished", result: "P1_WIN" });
    expect(state.phase).toBe(PvpPhase.RESULT);
    expect(state.lastResult).toBe("P1_WIN");
  });

  it("RESULT 收到 restart 回到 COUNTDOWN 并清空结果", () => {
    let state = reduce(createInitialState(), { kind: "toggle-on" });
    state = reduce(state, { kind: "players-ready" });
    state = reduce(state, { kind: "countdown-finished" });
    state = reduce(state, { kind: "round-finished", result: "DRAW" });
    state = reduce(state, { kind: "restart" });
    expect(state.phase).toBe(PvpPhase.COUNTDOWN);
    expect(state.lastResult).toBeUndefined();
  });

  it("任意状态收到 players-lost 都回到 IDLE", () => {
    let state = reduce(createInitialState(), { kind: "toggle-on" });
    state = reduce(state, { kind: "players-lost" });
    expect(state.phase).toBe(PvpPhase.IDLE);
  });

  it("IDLE 收到 toggle-on 之外的任何事件都保持 IDLE", () => {
    const state = reduce(createInitialState(), { kind: "countdown-finished" });
    expect(state.phase).toBe(PvpPhase.IDLE);
  });
});

describe("shouldAbortRound", () => {
  it("ARMING 阶段只有一名玩家时不应中止（这正是等待 2P 加入的状态）", () => {
    expect(shouldAbortRound(PvpPhase.ARMING, 1)).toBe(false);
  });

  it("ARMING 阶段零名玩家时不应中止", () => {
    expect(shouldAbortRound(PvpPhase.ARMING, 0)).toBe(false);
  });

  it("COUNTDOWN 阶段不足两名玩家应中止", () => {
    expect(shouldAbortRound(PvpPhase.COUNTDOWN, 1)).toBe(true);
  });

  it("FIGHT 阶段不足两名玩家应中止", () => {
    expect(shouldAbortRound(PvpPhase.FIGHT, 1)).toBe(true);
  });

  it("FIGHT 阶段两名玩家不应中止", () => {
    expect(shouldAbortRound(PvpPhase.FIGHT, 2)).toBe(false);
  });

  it("RESULT 阶段有人离开（人数为 1）应当中止，回到等待加入", () => {
    expect(shouldAbortRound(PvpPhase.RESULT, 1)).toBe(true);
  });

  it("RESULT 阶段两人都在（其中一人是幽灵）不应中止", () => {
    expect(shouldAbortRound(PvpPhase.RESULT, 2)).toBe(false);
  });

  it("IDLE 阶段不应中止", () => {
    expect(shouldAbortRound(PvpPhase.IDLE, 0)).toBe(false);
  });
});

describe("isRoundActive", () => {
  it("IDLE 时对局未激活", () => {
    expect(isRoundActive(PvpPhase.IDLE)).toBe(false);
  });

  it("ARMING 时对局已激活（需要抑制房间奖励）", () => {
    expect(isRoundActive(PvpPhase.ARMING)).toBe(true);
  });

  it("COUNTDOWN 时对局已激活", () => {
    expect(isRoundActive(PvpPhase.COUNTDOWN)).toBe(true);
  });

  it("FIGHT 时对局已激活", () => {
    expect(isRoundActive(PvpPhase.FIGHT)).toBe(true);
  });

  it("RESULT 时对局已激活", () => {
    expect(isRoundActive(PvpPhase.RESULT)).toBe(true);
  });
});

describe("createRunStartState", () => {
  it("开关关闭时本局保持 IDLE（完全走原版流程）", () => {
    expect(createRunStartState(false).phase).toBe(PvpPhase.IDLE);
  });

  it("开关打开时本局进入 ARMING 等待 2P 加入", () => {
    expect(createRunStartState(true).phase).toBe(PvpPhase.ARMING);
  });
});
