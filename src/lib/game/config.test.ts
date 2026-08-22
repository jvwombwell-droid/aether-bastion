import { describe, expect, it } from "vitest";
import {
  SELL_REFUND,
  TOWERS,
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

describe("living keep helpers", () => {
  it("well income grows with tier", () => {
    expect(wellIncome(1)).toBe(18);
    expect(wellIncome(3)).toBe(34);
  });

  it("watch range is 1.5× battery range", () => {
    const base = TOWERS.ember.tiers[0]!.range;
    expect(towerRangeFor("ember", 1, "battery")).toBe(base);
    expect(towerRangeFor("ember", 1, "watch")).toBe(Math.round(base * 1.5));
    expect(towerRangeFor("ember", 1, "well")).toBe(base);
  });

  it("keep fortify has two paid ranks then null", () => {
    expect(keepFortifyCost(0)).toBe(80);
    expect(keepFortifyCost(1)).toBe(150);
    expect(keepFortifyCost(2)).toBeNull();
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
