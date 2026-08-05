import type { BuffDef, BuffId, Element, EnemyDef, EnemyKind, TowerDef, WaveDef } from "./types";

export const CELL = 40;
export const COLS = 22;
export const ROWS = 14;
export const MAP_W = COLS * CELL;
export const MAP_H = ROWS * CELL;

export const START_GOLD = 220;
export const START_LIVES = 20;
export const SELL_REFUND = 0.6;
export const MAX_TIER = 3;

/** 10 waves per level × 10 levels. */
export const WAVES_PER_LEVEL = 10;
export const TOTAL_LEVELS = 10;

/** Damage multipliers: tower element → enemy armor. */
export const MATCHUP: Record<Element, Record<Element, number>> = {
  ember: { ember: 0.45, frost: 1.85, volt: 1.0, iron: 1.15 },
  frost: { ember: 1.05, frost: 0.45, volt: 1.85, iron: 1.0 },
  volt: { ember: 1.85, frost: 1.0, volt: 0.45, iron: 1.55 },
  iron: { ember: 1.0, frost: 1.0, volt: 1.0, iron: 0.55 },
};

export const ELEMENT_LABEL: Record<Element, string> = {
  ember: "Ember",
  frost: "Frost",
  volt: "Volt",
  iron: "Iron",
};

export const ELEMENT_COLOR: Record<Element, string> = {
  ember: "#e85d4c",
  frost: "#5b9fd4",
  volt: "#c9b44a",
  iron: "#8b95a8",
};

export const BUFFS: Record<BuffId, BuffDef> = {
  fortify: {
    id: "fortify",
    name: "Fortify",
    polarity: "strength",
    description: "Takes 35% less damage from all sources.",
    duration: 8,
    damageTakenMul: 0.65,
  },
  haste: {
    id: "haste",
    name: "Haste",
    polarity: "strength",
    description: "Moves 40% faster.",
    duration: 6,
    speedMul: 1.4,
  },
  ward: {
    id: "ward",
    name: "Element Ward",
    polarity: "strength",
    description: "Strong resistance to non-weakness elements.",
    duration: 10,
    resistElements: ["ember", "frost", "volt", "iron"],
    resistMul: 0.55,
  },
  frail: {
    id: "frail",
    name: "Frail",
    polarity: "weakness",
    description: "Takes 40% more damage.",
    duration: 7,
    damageTakenMul: 1.4,
  },
  expose: {
    id: "expose",
    name: "Exposed",
    polarity: "weakness",
    description: "Super-effective hits deal extra damage.",
    duration: 8,
    weakMul: 1.35,
  },
  regen: {
    id: "regen",
    name: "Regen",
    polarity: "strength",
    description: "Regenerates health over time.",
    duration: 12,
    regenPerSec: 6,
  },
};

export const TOWERS: Record<Element, TowerDef> = {
  ember: {
    kind: "ember",
    name: "Ember Spire",
    short: "Ember",
    description: "High single-target fire. Strong vs Frost armor.",
    color: "#e85d4c",
    colorDim: "#7a2f28",
    baseCost: 55,
    tiers: [
      { damage: 18, range: 110, fireRate: 1.1, projectileSpeed: 320, splash: 0, slow: 0, chain: 0, cost: 55 },
      { damage: 32, range: 125, fireRate: 1.35, projectileSpeed: 360, splash: 0, slow: 0, chain: 0, cost: 70 },
      { damage: 52, range: 145, fireRate: 1.6, projectileSpeed: 400, splash: 18, slow: 0, chain: 0, cost: 110 },
    ],
  },
  frost: {
    kind: "frost",
    name: "Frost Pillar",
    short: "Frost",
    description: "Slows targets. Strong vs Volt armor.",
    color: "#5b9fd4",
    colorDim: "#2a4f6e",
    baseCost: 50,
    tiers: [
      { damage: 10, range: 105, fireRate: 0.95, projectileSpeed: 280, splash: 0, slow: 0.35, chain: 0, cost: 50 },
      { damage: 16, range: 120, fireRate: 1.1, projectileSpeed: 300, splash: 24, slow: 0.45, chain: 0, cost: 65 },
      { damage: 26, range: 140, fireRate: 1.25, projectileSpeed: 320, splash: 40, slow: 0.55, chain: 0, cost: 100 },
    ],
  },
  volt: {
    kind: "volt",
    name: "Volt Node",
    short: "Volt",
    description: "Chains lightning. Strong vs Ember & Iron.",
    color: "#c9b44a",
    colorDim: "#6a5c22",
    baseCost: 65,
    tiers: [
      { damage: 14, range: 100, fireRate: 0.85, projectileSpeed: 420, splash: 0, slow: 0, chain: 1, cost: 65 },
      { damage: 22, range: 115, fireRate: 1.0, projectileSpeed: 460, splash: 0, slow: 0, chain: 2, cost: 85 },
      { damage: 34, range: 130, fireRate: 1.15, projectileSpeed: 500, splash: 0, slow: 0, chain: 3, cost: 125 },
    ],
  },
  iron: {
    kind: "iron",
    name: "Iron Bastion",
    short: "Iron",
    description: "Splash shells. Reliable vs all, weak vs Iron armor.",
    color: "#8b95a8",
    colorDim: "#3d4452",
    baseCost: 60,
    tiers: [
      { damage: 12, range: 95, fireRate: 0.75, projectileSpeed: 260, splash: 42, slow: 0, chain: 0, cost: 60 },
      { damage: 20, range: 110, fireRate: 0.9, projectileSpeed: 280, splash: 55, slow: 0, chain: 0, cost: 80 },
      { damage: 34, range: 125, fireRate: 1.05, projectileSpeed: 300, splash: 70, slow: 0, chain: 0, cost: 120 },
    ],
  },
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    kind: "scout",
    name: "Scout",
    hp: 55,
    speed: 58,
    reward: 8,
    armor: "iron",
    radius: 10,
    color: "#a1a1aa",
    innateStrength: [],
    innateWeakness: ["expose"],
  },
  brute: {
    kind: "brute",
    name: "Brute",
    hp: 160,
    speed: 36,
    reward: 14,
    armor: "iron",
    radius: 14,
    color: "#71717a",
    innateStrength: ["fortify"],
    innateWeakness: [],
  },
  runner: {
    kind: "runner",
    name: "Runner",
    hp: 40,
    speed: 92,
    reward: 10,
    armor: "frost",
    radius: 9,
    color: "#5b9fd4",
    innateStrength: ["haste"],
    innateWeakness: ["frail"],
  },
  shield: {
    kind: "shield",
    name: "Warded",
    hp: 120,
    speed: 42,
    reward: 16,
    armor: "ember",
    radius: 12,
    color: "#e85d4c",
    innateStrength: ["ward"],
    innateWeakness: [],
  },
  hexer: {
    kind: "hexer",
    name: "Hexer",
    hp: 90,
    speed: 48,
    reward: 15,
    armor: "volt",
    radius: 11,
    color: "#c9b44a",
    innateStrength: ["regen"],
    innateWeakness: ["expose"],
  },
  boss: {
    kind: "boss",
    name: "Siege Lord",
    hp: 1400,
    speed: 28,
    reward: 120,
    armor: "iron",
    radius: 20,
    color: "#d4d4d8",
    innateStrength: ["fortify", "regen"],
    innateWeakness: ["expose"],
    isBoss: true,
  },
};

/** Base wave templates — scaled per level at runtime. */
export const BASE_WAVES: WaveDef[] = [
  {
    name: "Recon",
    bonusGold: 25,
    spawns: [{ kind: "scout", count: 8, interval: 0.7, delay: 0 }],
  },
  {
    name: "Frost Line",
    bonusGold: 30,
    spawns: [
      { kind: "runner", count: 6, interval: 0.55, delay: 0 },
      { kind: "scout", count: 5, interval: 0.65, delay: 2 },
    ],
  },
  {
    name: "Iron Wall",
    bonusGold: 35,
    spawns: [
      { kind: "brute", count: 5, interval: 1.1, delay: 0 },
      { kind: "scout", count: 8, interval: 0.5, delay: 1 },
    ],
  },
  {
    name: "Ember Guard",
    bonusGold: 40,
    spawns: [
      { kind: "shield", count: 6, interval: 0.9, delay: 0, spawnBuff: "ward", spawnBuffDuration: 6 },
      { kind: "runner", count: 6, interval: 0.5, delay: 2 },
    ],
  },
  {
    name: "Hex Tide",
    bonusGold: 45,
    spawns: [
      { kind: "hexer", count: 7, interval: 0.8, delay: 0 },
      { kind: "brute", count: 4, interval: 1.2, delay: 1.5 },
      { kind: "scout", count: 10, interval: 0.4, delay: 3 },
    ],
  },
  {
    name: "Mixed Siege",
    bonusGold: 50,
    spawns: [
      { kind: "shield", count: 5, interval: 0.85, delay: 0 },
      { kind: "hexer", count: 5, interval: 0.85, delay: 0.4 },
      { kind: "runner", count: 8, interval: 0.45, delay: 2 },
      { kind: "brute", count: 4, interval: 1.0, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 10 },
    ],
  },
  {
    name: "Blitz",
    bonusGold: 55,
    spawns: [
      { kind: "runner", count: 14, interval: 0.35, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
      { kind: "scout", count: 12, interval: 0.35, delay: 1 },
    ],
  },
  {
    name: "Hardened",
    bonusGold: 60,
    spawns: [
      { kind: "brute", count: 8, interval: 0.9, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
      { kind: "shield", count: 6, interval: 0.8, delay: 2 },
      { kind: "hexer", count: 6, interval: 0.7, delay: 3 },
    ],
  },
  {
    name: "All Fronts",
    bonusGold: 70,
    spawns: [
      { kind: "scout", count: 10, interval: 0.4, delay: 0 },
      { kind: "runner", count: 8, interval: 0.4, delay: 1 },
      { kind: "brute", count: 6, interval: 0.85, delay: 2 },
      { kind: "shield", count: 6, interval: 0.75, delay: 3 },
      { kind: "hexer", count: 6, interval: 0.75, delay: 4 },
    ],
  },
  {
    name: "Siege Lord",
    bonusGold: 100,
    spawns: [
      { kind: "brute", count: 6, interval: 0.9, delay: 0 },
      { kind: "shield", count: 6, interval: 0.8, delay: 1 },
      { kind: "hexer", count: 6, interval: 0.7, delay: 2 },
      { kind: "boss", count: 1, interval: 1, delay: 5, spawnBuff: "fortify", spawnBuffDuration: 15 },
      { kind: "runner", count: 10, interval: 0.4, delay: 8 },
    ],
  },
];

/** @deprecated use BASE_WAVES + scaleWavesForLevel — kept for UI import name compat */
export const WAVES = BASE_WAVES;

export interface LevelScale {
  hpMul: number;
  speedMul: number;
  countMul: number;
  rewardMul: number;
  bonusGoldMul: number;
  intervalMul: number;
  /** Extra strength buffs forced onto more spawns at higher levels. */
  forceBuffChance: number;
}

/**
 * Fully exponential difficulty per level (t = level-1).
 * L1 = 1× · L5 ≈ 6–10× HP · L10 ≈ 50×+ HP with denser, buffed packs.
 */
export function levelScale(level: number): LevelScale {
  const L = Math.max(1, Math.min(TOTAL_LEVELS, level));
  const t = L - 1;
  // Exponential growth — always ≥ 1 for combat stats (interval shrinks but stays > 0)
  return {
    hpMul: Math.max(1, Math.pow(1.58, t)),
    speedMul: Math.max(1, Math.pow(1.07, t)),
    countMul: Math.max(1, Math.pow(1.28, t)),
    rewardMul: Math.max(1, Math.pow(1.32, t)),
    bonusGoldMul: Math.max(1, Math.pow(1.35, t)),
    intervalMul: Math.max(0.22, Math.pow(0.9, t)),
    forceBuffChance: Math.min(0.92, Math.max(0, 1 - Math.pow(0.72, t))),
  };
}

const STRENGTH_BUFFS: BuffId[] = ["fortify", "haste", "ward", "regen"];

/** Scale base wave templates for a campaign level (1–10). */
export function scaleWavesForLevel(level: number): WaveDef[] {
  const s = levelScale(level);
  return BASE_WAVES.map((w, wi) => {
    const spawns = w.spawns.map((sp) => {
      const count = Math.max(1, Math.round(sp.count * Math.max(1, s.countMul)));
      const interval = Math.max(0.18, sp.interval * s.intervalMul);
      let spawnBuff = sp.spawnBuff;
      let spawnBuffDuration = sp.spawnBuffDuration;
      // Higher levels: more forced strength buffs on non-boss packs
      if (!spawnBuff && sp.kind !== "boss" && s.forceBuffChance > 0) {
        // Deterministic-ish by wave index
        const roll = ((wi * 17 + sp.kind.charCodeAt(0) + level * 3) % 100) / 100;
        if (roll < s.forceBuffChance) {
          spawnBuff = STRENGTH_BUFFS[(wi + level) % STRENGTH_BUFFS.length]!;
          spawnBuffDuration = 6 + level;
        }
      }
      // Extra boss on last wave of high levels
      return {
        ...sp,
        count: sp.kind === "boss" && level >= 5 ? count + Math.floor((level - 4) / 2) : count,
        interval,
        spawnBuff,
        spawnBuffDuration,
      };
    });
    // From L2+: inject escalating extra packs (count grows exponentially with level)
    if (level >= 2 && wi >= 2) {
      const extraKind: EnemyKind =
        wi % 3 === 0 ? "brute" : wi % 3 === 1 ? "shield" : "hexer";
      const extraCount = Math.max(2, Math.round(2 * Math.pow(1.35, level - 1)));
      spawns.push({
        kind: extraKind,
        count: extraCount,
        interval: Math.max(0.22, 0.85 * s.intervalMul),
        delay: 4.5,
        spawnBuff: level >= 5 ? STRENGTH_BUFFS[(wi + level) % STRENGTH_BUFFS.length] : undefined,
        spawnBuffDuration: level >= 5 ? 5 + level : undefined,
      });
    }
    // High levels: second pressure pack on boss wave
    if (level >= 6 && wi === BASE_WAVES.length - 1) {
      spawns.push({
        kind: "runner",
        count: Math.round(6 * Math.pow(1.25, level - 6)),
        interval: Math.max(0.2, 0.4 * s.intervalMul),
        delay: 10,
        spawnBuff: "haste",
        spawnBuffDuration: 6 + level,
      });
    }
    return {
      name: w.name,
      bonusGold: Math.round(w.bonusGold * s.bonusGoldMul),
      spawns,
    };
  });
}

export function levelClearBonus(level: number): number {
  return Math.round(90 * Math.pow(1.42, level - 1));
}

export function cellCenter(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function matchupLabel(tower: Element, armor: Element): "strong" | "weak" | "neutral" {
  const m = MATCHUP[tower][armor];
  if (m >= 1.4) return "strong";
  if (m <= 0.6) return "weak";
  return "neutral";
}

/** Upgrade to next tier — 2× the tier's listed cost. Placement uses tiers[0].cost unchanged. */
export function upgradeCost(kind: Element, currentTier: number): number | null {
  if (currentTier >= MAX_TIER) return null;
  const base = TOWERS[kind].tiers[currentTier]?.cost;
  if (base == null) return null;
  return base * 2;
}
