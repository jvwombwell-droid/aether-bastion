import { describe, expect, it } from "vitest";
import { parseSavedRun } from "./persist";

const valid = {
  version: 3,
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
      role: "battery",
    },
  ],
  pathCells: [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  keepCol: 0,
  keepRow: 0,
  midShiftDone: false,
  keepFortify: 0,
  keepDoorGun: false,
  keepWell: false,
};

const validV2 = {
  version: 2,
  nextId: 4,
  runSeed: 99,
  level: 2,
  wave: 3,
  phase: "playing",
  gold: 200,
  lives: 18,
  score: 500,
  gameSpeed: 1,
  towers: valid.towers,
  pathCells: valid.pathCells,
  keepCol: 0,
  keepRow: 0,
  midShiftDone: false,
  keepFortify: 1,
};

describe("parseSavedRun", () => {
  it("accepts a valid v3 run", () => {
    const parsed = parseSavedRun(valid);
    expect(parsed?.version).toBe(3);
    expect(parsed?.level).toBe(2);
    expect(parsed?.towers).toHaveLength(1);
    expect(parsed?.towers[0]?.role).toBe("battery");
    expect(parsed?.keepCol).toBe(0);
    expect(parsed?.keepDoorGun).toBe(false);
    expect(parsed?.keepWell).toBe(false);
  });

  it("loads a v2 run with door gun and well off", () => {
    const parsed = parseSavedRun(validV2);
    expect(parsed?.version).toBe(3);
    expect(parsed?.keepFortify).toBe(1);
    expect(parsed?.keepDoorGun).toBe(false);
    expect(parsed?.keepWell).toBe(false);
    expect(parsed?.level).toBe(2);
  });

  it("keeps v3 door and well flags", () => {
    const parsed = parseSavedRun({ ...valid, keepDoorGun: true, keepWell: true, keepFortify: 2 });
    expect(parsed?.keepDoorGun).toBe(true);
    expect(parsed?.keepWell).toBe(true);
    expect(parsed?.keepFortify).toBe(2);
  });

  it("rejects a bad version or short path", () => {
    expect(parseSavedRun({ ...valid, version: 1 })).toBeNull();
    expect(parseSavedRun({ ...valid, pathCells: [[0, 1]] })).toBeNull();
    expect(parseSavedRun({ ...valid, phase: "won" })).toBeNull();
  });

  it("rejects v3 missing keep door/well flags", () => {
    const noDoor = { ...valid } as Record<string, unknown>;
    delete noDoor.keepDoorGun;
    expect(parseSavedRun(noDoor)).toBeNull();
    expect(parseSavedRun({ ...valid, keepWell: "yes" })).toBeNull();
  });
});
