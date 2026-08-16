import { BUFFS, MATCHUP } from "./config";
import type { BuffId, Element, Enemy } from "./types";

/** Damage multiplier from tower element vs enemy armor and active buffs. */
export function damageMultiplier(element: Element, enemy: Enemy): number {
  let mul = MATCHUP[element][enemy.armor];
  const shredded = enemy.buffs.some((b) => b.id === "shred");
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
      if (!superEffective) mul *= def.resistMul;
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
