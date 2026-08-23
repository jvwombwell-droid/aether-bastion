import { describe, expect, it } from "vitest";
import {
  KEEP_DOOR_GUN_COST,
  KEEP_WELL_COST,
  MAX_KEEP_FORTIFY,
  MID_SHIFT_WAVE,
  SELL_REFUND,
  START_GOLD,
  START_LIVES,
  TOWERS,
  WATCH_RANGE_MUL,
  keepDoorGunCost,
  keepDoorUpgradeCost,
  keepFortifyCost,
  levelScale,
  sellRefundFor,
  towerRangeFor,
  upgradeCost,
  wellIncome,
} from "./config";

describe("sellRefundFor / upgradeCost", () => {
  it("T1 sell is 70% of list cost", () => {
    const list = TOWERS.ember.tiers[0]!.cost;
    expect(sellRefundFor("ember", 1)).toBe(Math.floor(list * SELL_REFUND));
  });

  it("T2 and T3 include the 1.6x upgrade spend", () => {
    const t1 = TOWERS.ember.tiers[0]!.cost;
    const up1 = upgradeCost("ember", 1);
    const up2 = upgradeCost("ember", 2);
    expect(up1).toBe(Math.round(TOWERS.ember.tiers[1]!.cost * 1.6));
    expect(up2).toBe(Math.round(TOWERS.ember.tiers[2]!.cost * 1.6));
    expect(sellRefundFor("ember", 2)).toBe(Math.floor((t1 + (up1 ?? 0)) * SELL_REFUND));
    expect(sellRefundFor("ember", 3)).toBe(
      Math.floor((t1 + (up1 ?? 0) + (up2 ?? 0)) * SELL_REFUND),
    );
  });
});

describe("starting economy", () => {
  it("opens the campaign at 300 gold and 22 lives", () => {
    expect(START_GOLD).toBe(300);
    expect(START_LIVES).toBe(22);
  });
});

describe("living keep helpers", () => {
  it("well income grows with tier and campaign level", () => {
    expect(wellIncome(1)).toBe(24);
    expect(wellIncome(3)).toBe(44);
    expect(wellIncome(1, 8)).toBe(61);
    expect(wellIncome(2, 1)).toBe(34);
  });

  it("watch range is 1.7× battery range; wells and beacons have none", () => {
    const base = TOWERS.ember.tiers[0]!.range;
    expect(WATCH_RANGE_MUL).toBe(1.7);
    expect(towerRangeFor("ember", 1, "battery")).toBe(base);
    expect(towerRangeFor("ember", 1, "watch")).toBe(Math.round(base * 1.7));
    expect(towerRangeFor("ember", 1, "well")).toBe(0);
    expect(towerRangeFor("ember", 1, "beacon")).toBe(0);
  });

  it("keep fortify has three paid ranks then null", () => {
    expect(MAX_KEEP_FORTIFY).toBe(3);
    expect(keepFortifyCost(0)).toBe(80);
    expect(keepFortifyCost(1)).toBe(160);
    expect(keepFortifyCost(2)).toBe(240);
    expect(keepFortifyCost(3)).toBeNull();
  });

  it("keep door gun and well costs", () => {
    expect(KEEP_DOOR_GUN_COST).toBe(90);
    expect(KEEP_WELL_COST).toBe(75);
    expect(keepDoorGunCost()).toBe(90);
    expect(keepDoorUpgradeCost(0)).toBe(90);
    expect(keepDoorUpgradeCost(1)).toBe(140);
    expect(keepDoorUpgradeCost(2)).toBe(220);
    expect(keepDoorUpgradeCost(3)).toBeNull();
  });

  it("default mid-shift for L2+ is wave 4", () => {
    expect(MID_SHIFT_WAVE).toBe(4);
  });
});

describe("levelScale", () => {
  it("L1 is 1x", () => {
    const s = levelScale(1);
    expect(s.hpMul).toBe(1);
    expect(s.countMul).toBe(1);
    expect(s.speedMul).toBe(1);
  });

  it("L6 vs L10 HP curve matches the L7 flatten", () => {
    const l6 = levelScale(6);
    const l10 = levelScale(10);
    const expectedL6 = Math.pow(1.58, 5);
    const expectedL10 = Math.pow(1.58, 5) * Math.pow(1.22, 4);
    expect(l6.hpMul).toBeCloseTo(expectedL6, 8);
    expect(l10.hpMul).toBeCloseTo(expectedL10, 8);
    expect(l10.hpMul).toBeLessThan(Math.pow(1.58, 9));
    expect(l10.hpMul).toBeGreaterThan(l6.hpMul);
  });
});
