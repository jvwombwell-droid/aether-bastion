import { describe, expect, it } from "vitest";
import { parseSavedRun } from "./persist";

const valid = {
  version: 1,
  nextId: 4,
  runSeed: 99,
  level: 2,
  wave: 3,
  phase: "playing",
  gold: 200,
  lives: 18,
  score: 500,
  gameSpeed: 1,
  towers: [
    {
      id: 1,
      kind: "ember",
      col: 3,
      row: 4,
      tier: 1,
      kills: 2,
      targetMode: "first",
    },
  ],
  pathCells: [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
};

describe("parseSavedRun", () => {
  it("accepts a valid v1 run", () => {
    const parsed = parseSavedRun(valid);
    expect(parsed?.level).toBe(2);
    expect(parsed?.towers).toHaveLength(1);
  });

  it("rejects a bad version or short path", () => {
    expect(parseSavedRun({ ...valid, version: 2 })).toBeNull();
    expect(parseSavedRun({ ...valid, pathCells: [[0, 1]] })).toBeNull();
    expect(parseSavedRun({ ...valid, phase: "won" })).toBeNull();
  });
});
