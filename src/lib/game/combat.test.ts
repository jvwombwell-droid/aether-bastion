import { describe, expect, it } from "vitest";
import { MATCHUP } from "./config";
import {
  combatRulesFor,
  damageMultiplier,
  hitCallout,
  DEFAULT_COMBAT_RULES,
  THICK_HIDE_CAP,
} from "./combat";
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

  it("thickHide caps Volt vs iron hide without shred at THICK_HIDE_CAP", () => {
    const e = enemy({ armor: "iron", buffs: [] });
    expect(damageMultiplier("volt", e, { thickHide: true, wardedNight: false })).toBe(
      THICK_HIDE_CAP,
    );
    expect(THICK_HIDE_CAP).toBe(0.42);
    expect(MATCHUP.volt.iron).toBe(1.55);
  });

  it("thickHide caps Ember vs iron hide without shred at THICK_HIDE_CAP", () => {
    const e = enemy({ armor: "iron", buffs: [] });
    expect(damageMultiplier("ember", e, { thickHide: true, wardedNight: false })).toBe(
      THICK_HIDE_CAP,
    );
  });

  it("thickHide does not cap Volt vs iron after shred", () => {
    const e = enemy({ armor: "iron", buffs: [buff("shred")] });
    expect(
      damageMultiplier("volt", e, { thickHide: true, wardedNight: false }),
    ).toBeCloseTo(MATCHUP.volt.iron * 1.15, 8);
  });

  it("thickHide off leaves Volt vs iron at 1.55", () => {
    const e = enemy({ armor: "iron", buffs: [] });
    expect(damageMultiplier("volt", e)).toBe(1.55);
    expect(damageMultiplier("volt", e, DEFAULT_COMBAT_RULES)).toBe(1.55);
  });

  it("wardedNight applies ward resist to super-effective hits without expose", () => {
    const e = enemy({ armor: "ember", buffs: [buff("ward")] });
    expect(
      damageMultiplier("volt", e, { thickHide: false, wardedNight: true }),
    ).toBeCloseTo(MATCHUP.volt.ember * 0.55, 8);
  });

  it("wardedNight skips ward on exposed super-effective hits", () => {
    const e = enemy({ armor: "ember", buffs: [buff("ward"), buff("expose")] });
    expect(
      damageMultiplier("volt", e, { thickHide: false, wardedNight: true }),
    ).toBeCloseTo(MATCHUP.volt.ember * 1.35, 8);
  });

  it("default rules still skip ward on super-effective Volt vs ember", () => {
    const e = enemy({ armor: "ember", buffs: [buff("ward")] });
    expect(damageMultiplier("volt", e)).toBe(MATCHUP.volt.ember);
    expect(damageMultiplier("volt", e)).toBe(1.85);
  });
});

describe("hitCallout", () => {
  it("Volt vs iron with Expose includes VOLT > IRON and Expose", () => {
    const call = hitCallout("volt", enemy({ armor: "iron", buffs: [buff("expose")] }));
    expect(call.text).toContain("VOLT > IRON");
    expect(call.text).toContain("Expose");
    expect(call.text).not.toContain("EMBER");
    expect(call.tone).toBe("strong");
  });

  it("Volt vs iron with Fortify is VOLT > IRON · Fortify", () => {
    const call = hitCallout("volt", enemy({ armor: "iron", buffs: [buff("fortify")] }));
    expect(call.text).toBe("VOLT > IRON · Fortify");
    expect(call.tone).toBe("neutral");
  });

  it("thick hide Volt vs iron is RESIST · Thick hide", () => {
    const call = hitCallout("volt", enemy({ armor: "iron", buffs: [] }), {
      thickHide: true,
      wardedNight: false,
    });
    expect(call.text).toBe("RESIST · Thick hide");
    expect(call.tone).toBe("weak");
  });

  it("warded night Volt vs ember ward is VOLT > EMBER · Ward", () => {
    const call = hitCallout("volt", enemy({ armor: "ember", buffs: [buff("ward")] }), {
      thickHide: false,
      wardedNight: true,
    });
    expect(call.text).toBe("VOLT > EMBER · Ward");
    expect(call.tone).toBe("neutral");
  });

  it("default rules omit Ward on super-effective Volt vs ember", () => {
    const call = hitCallout("volt", enemy({ armor: "ember", buffs: [buff("ward")] }));
    expect(call.text).toBe("VOLT > EMBER");
    expect(call.text).not.toContain("Ward");
    expect(call.tone).toBe("strong");
  });

  it("Iron vs frost Frail is only Frail", () => {
    const call = hitCallout("iron", enemy({ armor: "frost", buffs: [buff("frail")] }));
    expect(call.text).toBe("Frail");
    expect(call.tone).toBe("strong");
    expect(call.text.toLowerCase()).not.toContain("shred");
    expect(call.text).not.toContain("IRON");
  });

  it("Ember vs frost is EMBER > FROST", () => {
    const call = hitCallout("ember", enemy({ armor: "frost", buffs: [] }));
    expect(call.text).toBe("EMBER > FROST");
    expect(call.tone).toBe("strong");
  });

  it("Ember vs ember Shred is only Shred", () => {
    const call = hitCallout("ember", enemy({ armor: "ember", buffs: [buff("shred")] }));
    expect(call.text).toBe("Shred");
    expect(call.tone).toBe("neutral");
  });
});

describe("combatRulesFor", () => {
  it("maps thickHide / slipstream / wardedNight / standard", () => {
    expect(combatRulesFor("thickHide")).toEqual({
      thickHide: true,
      wardedNight: false,
    });
    expect(combatRulesFor("slipstream")).toEqual({
      thickHide: false,
      wardedNight: false,
    });
    expect(combatRulesFor("wardedNight")).toEqual({
      thickHide: false,
      wardedNight: true,
    });
    expect(combatRulesFor("standard")).toEqual({
      thickHide: false,
      wardedNight: false,
    });
  });
});
