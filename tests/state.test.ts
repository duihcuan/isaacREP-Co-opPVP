import { describe, expect, it } from "vitest";

import { PvpPhase, createInitialState, reduce } from "../src/core/state";

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
