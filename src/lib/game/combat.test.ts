import { describe, expect, it } from "vitest";
import { MATCHUP } from "./config";
import { damageMultiplier } from "./combat";
import type { ActiveBuff, Enemy } from "./types";

function enemy(partial: Partial<Enemy> & Pick<Enemy, "armor" | "buffs">): Enemy {
  return {
    id: 1,
    kind: "scout",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    pathIndex: 0,
    progress: 0,
    speed: 50,
    radius: 10,
    reward: 8,
    alive: true,
    slowTimer: 0,
    slowMul: 1,
    hitFlash: 0,
    pathT: 0,
    ...partial,
  };
}

function buff(id: ActiveBuff["id"], extra?: Partial<ActiveBuff>): ActiveBuff {
  return { id, remaining: 5, ...extra };
}

describe("damageMultiplier", () => {
  it("Ember vs Frost is a strong matchup", () => {
    const e = enemy({ armor: "frost", buffs: [] });
    expect(damageMultiplier("ember", e)).toBe(MATCHUP.ember.frost);
    expect(damageMultiplier("ember", e)).toBeGreaterThanOrEqual(1.4);
  });

  it("shred on a 0.45 matchup lands near 0.91", () => {
    const e = enemy({ armor: "ember", buffs: [buff("shred")] });
    const raw = MATCHUP.ember.ember;
    expect(raw).toBe(0.45);
    const pulled = raw + (1 - raw) * 0.62;
    expect(damageMultiplier("ember", e)).toBeCloseTo(pulled * 1.15, 8);
    expect(damageMultiplier("ember", e)).toBeCloseTo(0.91, 2);
  });

  it("same buff id does not double", () => {
    const once = enemy({ armor: "iron", buffs: [buff("frail")] });
    const twice = enemy({
      armor: "iron",
      buffs: [buff("frail"), buff("frail")],
    });
    expect(damageMultiplier("ember", twice)).toBe(damageMultiplier("ember", once));
  });

  it("innate Expose only boosts super-effective hits", () => {
    const exposed = enemy({ armor: "frost", buffs: [buff("expose", { permanent: true })] });
    const plain = enemy({ armor: "frost", buffs: [] });
    expect(damageMultiplier("ember", exposed)).toBeCloseTo(
      MATCHUP.ember.frost * 1.35,
      8,
    );
    expect(damageMultiplier("ember", exposed)).toBeGreaterThan(damageMultiplier("ember", plain));
    expect(damageMultiplier("frost", exposed)).toBe(damageMultiplier("frost", plain));
  });
});
