import { describe, expect, it } from "vitest";
import { parseSavedRun } from "./persist";

const valid = {
  version: 4,
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
  keepDoorTier: 0,
  keepWell: false,
};

const validV3 = {
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
  towers: valid.towers,
  pathCells: valid.pathCells,
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
  it("accepts a valid v4 run", () => {
    const parsed = parseSavedRun(valid);
    expect(parsed?.version).toBe(4);
    expect(parsed?.level).toBe(2);
    expect(parsed?.towers).toHaveLength(1);
    expect(parsed?.towers[0]?.role).toBe("battery");
    expect(parsed?.keepCol).toBe(0);
    expect(parsed?.keepDoorGun).toBe(false);
    expect(parsed?.keepDoorTier).toBe(0);
    expect(parsed?.keepWell).toBe(false);
  });

  it("accepts a v3 run and fills keepDoorTier", () => {
    const parsed = parseSavedRun(validV3);
    expect(parsed?.version).toBe(4);
    expect(parsed?.keepDoorGun).toBe(false);
    expect(parsed?.keepDoorTier).toBe(0);
    expect(parsed?.keepWell).toBe(false);
    expect(parsed?.level).toBe(2);
  });

  it("loads a v2 run with door gun and well off and keepDoorTier 0", () => {
    const parsed = parseSavedRun(validV2);
    expect(parsed?.version).toBe(4);
    expect(parsed?.keepFortify).toBe(1);
    expect(parsed?.keepDoorGun).toBe(false);
    expect(parsed?.keepDoorTier).toBe(0);
    expect(parsed?.keepWell).toBe(false);
    expect(parsed?.level).toBe(2);
  });

  it("fills keepDoorTier 1 when a v3 save already bought the door gun", () => {
    const parsed = parseSavedRun({ ...validV3, keepDoorGun: true, keepWell: true, keepFortify: 2 });
    expect(parsed?.version).toBe(4);
    expect(parsed?.keepDoorGun).toBe(true);
    expect(parsed?.keepDoorTier).toBe(1);
    expect(parsed?.keepWell).toBe(true);
    expect(parsed?.keepFortify).toBe(2);
  });

  it("keeps an explicit v4 door tier", () => {
    const parsed = parseSavedRun({ ...valid, keepDoorGun: true, keepDoorTier: 2, keepWell: true });
    expect(parsed?.keepDoorGun).toBe(true);
    expect(parsed?.keepDoorTier).toBe(2);
    expect(parsed?.keepWell).toBe(true);
  });

  it("accepts a beacon tower role", () => {
    const parsed = parseSavedRun({
      ...valid,
      towers: [{ ...valid.towers[0]!, role: "beacon" }],
    });
    expect(parsed?.towers[0]?.role).toBe("beacon");
  });

  it("rejects a bad version or short path", () => {
    expect(parseSavedRun({ ...valid, version: 1 })).toBeNull();
    expect(parseSavedRun({ ...valid, pathCells: [[0, 1]] })).toBeNull();
    expect(parseSavedRun({ ...valid, phase: "won" })).toBeNull();
  });

  it("rejects v3 missing keep door/well flags", () => {
    const noDoor = { ...validV3 } as Record<string, unknown>;
    delete noDoor.keepDoorGun;
    expect(parseSavedRun(noDoor)).toBeNull();
    expect(parseSavedRun({ ...validV3, keepWell: "yes" })).toBeNull();
  });

  it("rejects v4 missing keepDoorTier", () => {
    const noTier = { ...valid } as Record<string, unknown>;
    delete noTier.keepDoorTier;
    expect(parseSavedRun(noTier)).toBeNull();
    expect(parseSavedRun({ ...valid, keepDoorTier: "1" })).toBeNull();
  });
});
