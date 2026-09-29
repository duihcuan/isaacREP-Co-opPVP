import { describe, expect, it } from "vitest";

import { shouldSpawnItem } from "../src/core/itemSpawn";

const FIRST_DELAY = 300;
const FAST_INTERVAL = 90;
const NORMAL_INTERVAL = 540;
const FAST_SPAWN_COUNT = 2;
const MAX_ON_FIELD = 4;

function check(
  frame: number,
  lastSpawnFrame: number,
  itemsOnField: number,
  spawnsThisRound: number,
): boolean {
  return shouldSpawnItem(
    frame,
    lastSpawnFrame,
    itemsOnField,
    spawnsThisRound,
    FIRST_DELAY,
    FAST_INTERVAL,
    NORMAL_INTERVAL,
    FAST_SPAWN_COUNT,
    MAX_ON_FIELD,
  );
}

describe("道具刷新计时", () => {
  it("场上已达上限时不刷新", () => {
    expect(check(1000, 0, 4, 0)).toBe(false);
  });

  it("首次刷新前不刷新", () => {
    expect(check(299, -1, 0, 0)).toBe(false);
  });

  it("到达首次延迟时刷新", () => {
    expect(check(300, -1, 0, 0)).toBe(true);
  });

  it("本局前两个道具用更短的间隔：不足快间隔时不刷新", () => {
    expect(check(300 + 89, 300, 0, 1)).toBe(false);
  });

  it("本局前两个道具用更短的间隔：达到快间隔时刷新", () => {
    expect(check(300 + 90, 300, 0, 1)).toBe(true);
  });

  it("第三个起用普通间隔：不足普通间隔时不刷新", () => {
    expect(check(300 + 89, 300, 0, 2)).toBe(false);
  });

  it("第三个起用普通间隔：达到普通间隔时刷新", () => {
    expect(check(300 + 540, 300, 0, 2)).toBe(true);
  });

  it("场上未满但已达上限减一仍可刷新", () => {
    expect(check(1000, 400, 3, 5)).toBe(true);
  });
});
