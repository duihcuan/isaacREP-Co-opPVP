import { describe, expect, it } from "vitest";

import { shouldSpawnItem } from "../src/core/itemSpawn";

const FIRST_DELAY = 30;
const FAST_INTERVAL = 60;
const NORMAL_INTERVAL = 180;
const FAST_SPAWN_COUNT = 2;

function check(frame: number, lastSpawnFrame: number, spawnsThisRound: number): boolean {
  return shouldSpawnItem(
    frame,
    lastSpawnFrame,
    spawnsThisRound,
    FIRST_DELAY,
    FAST_INTERVAL,
    NORMAL_INTERVAL,
    FAST_SPAWN_COUNT,
  );
}

describe("道具刷新计时（已取消场上数量上限）", () => {
  it("首次刷新前不刷新", () => {
    expect(check(29, -1, 0)).toBe(false);
  });

  it("到达首次延迟时刷新", () => {
    expect(check(30, -1, 0)).toBe(true);
  });

  it("本局前两个用短间隔：不足时不刷新", () => {
    expect(check(89, 30, 1)).toBe(false);
  });

  it("本局前两个用短间隔：达到时刷新", () => {
    expect(check(90, 30, 1)).toBe(true);
  });

  it("第三个起用常规间隔：不足时不刷新", () => {
    expect(check(209, 30, 2)).toBe(false);
  });

  it("第三个起用常规间隔：达到时刷新", () => {
    expect(check(210, 30, 2)).toBe(true);
  });
});
