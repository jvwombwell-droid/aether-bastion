import { describe, expect, it } from "vitest";
import {
  LEVEL_SCRIPTS,
  TOWERS,
  keepDoorStats,
  levelRule,
  levelScript,
  midShiftAfterWave,
  reconBoardLine,
  scaleWavesForLevel,
  wellIncome,
} from "./config";

describe("LEVEL_SCRIPTS", () => {
  it("authors ten campaign scripts", () => {
    expect(LEVEL_SCRIPTS).toHaveLength(10);
    for (const script of LEVEL_SCRIPTS) {
      expect(script.waves).toHaveLength(10);
      expect(script.name.length).toBeGreaterThan(0);
      expect(script.rule).toBeDefined();
    }
  });

  it("assigns exam rules to L2–L4 and standard elsewhere", () => {
    expect(levelScript(1).rule).toBe("standard");
    expect(levelScript(2).rule).toBe("thickHide");
    expect(levelScript(3).rule).toBe("slipstream");
    expect(levelScript(4).rule).toBe("wardedNight");
    expect(levelRule(2)).toBe("thickHide");
    expect(levelRule(3)).toBe("slipstream");
    expect(levelRule(4)).toBe("wardedNight");
    for (let level = 5; level <= 10; level++) {
      expect(levelScript(level).rule, `L${level}`).toBe("standard");
      expect(levelRule(level), `L${level}`).toBe("standard");
    }
  });

  it("names L2–L4 signature waves for each exam", () => {
    const l2 = levelScript(2);
    expect(l2.waves[0]?.name).toBe("Iron Recon");
    expect(l2.waves[1]?.name).toBe("Hide Line");
    expect(levelScript(3).waves[0]?.name).toBe("First Drill");
    expect(levelScript(4).waves[0]?.name).toBe("Ward Recon");
  });

  it("shows a recon board line only on L1–L4", () => {
    expect(reconBoardLine(1)).toBe("The pip is armor. Match it, or bounce.");
    expect(reconBoardLine(2)).toBe("Hides bounce until Iron shreds them.");
    expect(reconBoardLine(3)).toBe("Runners sprint unless a gun is on First.");
    expect(reconBoardLine(4)).toBe("Ward holds until Exposed.");
    expect(reconBoardLine(5)).toBeNull();
  });

  it("names level 1 First Watch and shifts after wave 2", () => {
    const l1 = levelScript(1);
    expect(l1.name).toBe("First Watch");
    expect(l1.midShiftAfter).toBe(2);
    expect(midShiftAfterWave(1)).toBe(2);
  });

  it("shifts L2–L10 after wave 4", () => {
    for (let level = 2; level <= 10; level++) {
      expect(levelScript(level).midShiftAfter, `L${level}`).toBe(4);
      expect(midShiftAfterWave(level), `L${level}`).toBe(4);
    }
  });

  it("opens L1 with a 6-scout Recon", () => {
    const first = levelScript(1).waves[0]!;
    expect(first.name).toBe("Recon");
    expect(first.spawns).toHaveLength(1);
    expect(first.spawns[0]).toMatchObject({ kind: "scout", count: 6 });
  });
});

describe("scaleWavesForLevel", () => {
  it("returns the authored L1 script (10 waves, Recon of 6 scouts)", () => {
    const waves = scaleWavesForLevel(1);
    expect(waves).toHaveLength(10);
    expect(waves[0]?.name).toBe("Recon");
    expect(waves[0]?.spawns[0]).toMatchObject({ kind: "scout", count: 6 });
    expect(waves[0]?.spawns[0]?.count).not.toBe(8);
  });
});

describe("wellIncome", () => {
  it("is 14 + tier*10, then scales 22% per campaign level after 1", () => {
    expect(wellIncome(1)).toBe(24);
    expect(wellIncome(3)).toBe(44);
    expect(wellIncome(2, 1)).toBe(34);
    expect(wellIncome(1, 8)).toBe(Math.round(24 * (1 + 7 * 0.22)));
    expect(wellIncome(1, 8)).toBeGreaterThan(wellIncome(1));
  });
});

describe("keepDoorStats", () => {
  it("starts from Iron T1 at campaign L1 with no fortify", () => {
    const iron = TOWERS.iron.tiers[0]!;
    const stats = keepDoorStats(1, 0, 1);
    expect(stats.damage).toBe(iron.damage);
    expect(stats.range).toBe(iron.range);
    expect(stats.fireRate).toBe(iron.fireRate);
    expect(stats.splash).toBe(iron.splash);
  });

  it("grows with door tier, fortify, and campaign level", () => {
    const t1 = keepDoorStats(1, 0, 1);
    const fortified = keepDoorStats(1, 3, 1);
    const later = keepDoorStats(1, 0, 4);
    const t3 = keepDoorStats(3, 0, 1);
    expect(fortified.damage).toBeGreaterThan(t1.damage);
    expect(later.damage).toBeGreaterThan(t1.damage);
    expect(t3.damage).toBeGreaterThan(t1.damage);
    expect(t3.range).toBeGreaterThan(t1.range);
    expect(t3.fireRate).toBeGreaterThan(t1.fireRate);
  });
});

describe("midShiftAfterWave", () => {
  it("reads the authored cut from the level script", () => {
    expect(midShiftAfterWave(1)).toBe(2);
    expect(midShiftAfterWave(2)).toBe(4);
    expect(midShiftAfterWave(10)).toBe(4);
  });
});
