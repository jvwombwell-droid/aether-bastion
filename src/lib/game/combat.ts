import { BUFFS, MATCHUP } from "./config";
import type { LevelRule } from "./levels";
import type { BuffId, Element, Enemy } from "./types";

export type CombatRules = {
  thickHide: boolean;
  wardedNight: boolean;
};

export const DEFAULT_COMBAT_RULES: CombatRules = {
  thickHide: false,
  wardedNight: false,
};

export const THICK_HIDE_CAP = 0.42;

export function combatRulesFor(rule: LevelRule): CombatRules {
  switch (rule) {
    case "standard":
      return { thickHide: false, wardedNight: false };
    case "thickHide":
      return { thickHide: true, wardedNight: false };
    case "slipstream":
      return { thickHide: false, wardedNight: false };
    case "wardedNight":
      return { thickHide: false, wardedNight: true };
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** Damage multiplier from tower element vs enemy armor and active buffs. */
export function damageMultiplier(
  element: Element,
  enemy: Enemy,
  rules: CombatRules = DEFAULT_COMBAT_RULES,
): number {
  let mul = MATCHUP[element][enemy.armor];
  const shredded = enemy.buffs.some((b) => b.id === "shred");
  const exposed = enemy.buffs.some((b) => b.id === "expose");
  if (rules.thickHide && !shredded && enemy.armor === "iron") {
    mul = Math.min(mul, THICK_HIDE_CAP);
  }
  if (shredded && mul < 1) {
    // Armor cracked: pull weak matchups most of the way back toward 1.0
    mul = mul + (1 - mul) * 0.62;
  }
  const seen = new Set<BuffId>();
  for (const b of enemy.buffs) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const def = BUFFS[b.id];
    if (def.damageTakenMul && b.id !== "shred") mul *= def.damageTakenMul;
    if (b.id === "shred") mul *= def.damageTakenMul ?? 1;
    if (def.resistElements?.includes(element) && def.resistMul) {
      const superEffective = MATCHUP[element][enemy.armor] >= 1.4;
      const wardHolds = !superEffective || (rules.wardedNight && !exposed);
      if (wardHolds) mul *= def.resistMul;
    }
    if (def.weakElements) {
      if (def.weakElements.includes(element) && def.weakMul) mul *= def.weakMul;
    }
    if (b.id === "expose" && MATCHUP[element][enemy.armor] >= 1.4 && def.weakMul) {
      mul *= def.weakMul;
    }
  }
  return mul;
}
