import { describe, expect, it } from "vitest";

import { circlesOverlap, getSpawnPoints } from "../src/core/geometry";

describe("circlesOverlap", () => {
  it("两个重叠的圆返回 true", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 15, y: 0, radius: 10 };
    expect(circlesOverlap(a, b)).toBe(true);
  });

  it("两个分离的圆返回 false", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 25, y: 0, radius: 10 };
    expect(circlesOverlap(a, b)).toBe(false);
  });

  it("刚好相切算命中", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 20, y: 0, radius: 10 };
    expect(circlesOverlap(a, b)).toBe(true);
  });
});

describe("getSpawnPoints", () => {
  it("两个出生点关于房间中心左右对称", () => {
    const [left, right] = getSpawnPoints(320, 240, 160);
    expect(left.x).toBe(160);
    expect(left.y).toBe(240);
    expect(right.x).toBe(480);
    expect(right.y).toBe(240);
  });
});
