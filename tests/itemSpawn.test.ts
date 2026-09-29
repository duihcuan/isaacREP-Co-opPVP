import { describe, expect, it } from "vitest";

import { shouldSpawnItem } from "../src/core/itemSpawn";

const FIRST_DELAY = 300;
const INTERVAL = 540;
const MAX_ON_FIELD = 2;

function check(
  frame: number,
  lastSpawnFrame: number,
  itemsOnField: number,
): boolean {
  return shouldSpawnItem(frame, lastSpawnFrame, itemsOnField, FIRST_DELAY, INTERVAL, MAX_ON_FIELD);
}

describe("道具刷新计时", () => {
  it("场上已达上限时不刷新", () => {
    expect(check(1000, 0, 2)).toBe(false);
  });

  it("首次刷新前不刷新", () => {
    expect(check(299, -1, 0)).toBe(false);
  });

  it("到达首次延迟时刷新", () => {
    expect(check(300, -1, 0)).toBe(true);
  });

  it("距上次刷新不足间隔时不刷新", () => {
    expect(check(300 + 539, 300, 0)).toBe(false);
  });

  it("距上次刷新达到间隔时刷新", () => {
    expect(check(300 + 540, 300, 0)).toBe(true);
  });

  it("场上未满但已达上限减一仍可刷新", () => {
    expect(check(1000, 400, 1)).toBe(true);
  });
});
