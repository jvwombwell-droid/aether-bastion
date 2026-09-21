import {
  LEVEL_SCRIPTS,
  levelRule,
  levelScript,
  midShiftAfterWave,
  reconBoardLine,
  type LevelRule,
} from "./levels";
import type {
  BuffDef,
  BuffId,
  Element,
  EnemyDef,
  EnemyKind,
  TowerDef,
  TowerRole,
  WaveDef,
} from "./types";

export { LEVEL_SCRIPTS, levelRule, levelScript, midShiftAfterWave, reconBoardLine };
export type { LevelRule };

export const CELL = 40;
export const COLS = 22;
export const ROWS = 14;
export const MAP_W = COLS * CELL;
export const MAP_H = ROWS * CELL;

export const START_GOLD = 300;
export const START_LIVES = 22;
export const SELL_REFUND = 0.7;
export const MAX_TIER = 3;

/** 10 waves per level × 10 levels. */
export const WAVES_PER_LEVEL = 10;
export const TOTAL_LEVELS = 10;

/** Default mid-shift for L2+ (1-based wave that just cleared). L1 uses 2. */
export const MID_SHIFT_WAVE = 4;

export const WATCH_RANGE_MUL = 1.7;
export const WATCH_FIRE_MUL = 0.72;
export const WATCH_BOSS_DAMAGE_MUL = 1.45;
export const MAX_KEEP_FORTIFY = 3;
export const KEEP_FORTIFY_LIVES = 2;
export const KEEP_DOOR_GUN_COST = 90;
export const KEEP_DOOR_MAX_TIER = 3;
export const KEEP_WELL_COST = 75;
/** How hard a Beacon pulls the next road. Bigger than edge wobble (~1–6). */
export const BEACON_PULL = 36;

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
  shred: {
    id: "shred",
    name: "Shred",
    polarity: "weakness",
    description: "Armor cracked — weak matchups hurt much more.",
    duration: 6,
    damageTakenMul: 1.15,
  },
};

export const TOWERS: Record<Element, TowerDef> = {
  ember: {
    kind: "ember",
    name: "Ember Spire",
    short: "Ember",
    description: "High single-target fire. Strong vs Frost armor. T3 can Expose targets.",
    color: "#e85d4c",
    colorDim: "#7a2f28",
    baseCost: 55,
    tiers: [
      { damage: 18, range: 110, fireRate: 1.1, projectileSpeed: 320, splash: 0, slow: 0, chain: 0, cost: 55 },
      { damage: 32, range: 125, fireRate: 1.35, projectileSpeed: 360, splash: 0, slow: 0, chain: 0, cost: 70 },
      {
        damage: 52,
        range: 145,
        fireRate: 1.6,
        projectileSpeed: 400,
        splash: 18,
        slow: 0,
        chain: 0,
        cost: 110,
        applyBuff: "expose",
        applyBuffChance: 0.4,
        applyBuffDuration: 5,
      },
    ],
  },
  frost: {
    kind: "frost",
    name: "Frost Pillar",
    short: "Frost",
    description: "Slows targets and can apply Frail at higher tiers. Strong vs Volt armor.",
    color: "#5b9fd4",
    colorDim: "#2a4f6e",
    baseCost: 50,
    tiers: [
      { damage: 10, range: 105, fireRate: 0.95, projectileSpeed: 280, splash: 0, slow: 0.35, chain: 0, cost: 50 },
      {
        damage: 16,
        range: 120,
        fireRate: 1.1,
        projectileSpeed: 300,
        splash: 24,
        slow: 0.45,
        chain: 0,
        cost: 65,
        applyBuff: "frail",
        applyBuffChance: 0.35,
        applyBuffDuration: 5,
      },
      {
        damage: 26,
        range: 140,
        fireRate: 1.25,
        projectileSpeed: 320,
        splash: 40,
        slow: 0.55,
        chain: 0,
        cost: 100,
        applyBuff: "frail",
        applyBuffChance: 0.65,
        applyBuffDuration: 7,
      },
    ],
  },
  volt: {
    kind: "volt",
    name: "Volt Node",
    short: "Volt",
    description: "Chains lightning that can Expose. Strong vs Ember & Iron.",
    color: "#c9b44a",
    colorDim: "#6a5c22",
    baseCost: 65,
    tiers: [
      { damage: 14, range: 100, fireRate: 0.85, projectileSpeed: 420, splash: 0, slow: 0, chain: 1, cost: 65 },
      {
        damage: 22,
        range: 115,
        fireRate: 1.0,
        projectileSpeed: 460,
        splash: 0,
        slow: 0,
        chain: 2,
        cost: 85,
        chainBuff: "expose",
        chainBuffChance: 0.75,
        chainBuffDuration: 5,
      },
      {
        damage: 34,
        range: 130,
        fireRate: 1.15,
        projectileSpeed: 500,
        splash: 0,
        slow: 0,
        chain: 3,
        cost: 125,
        applyBuff: "expose",
        applyBuffChance: 0.3,
        applyBuffDuration: 4,
        chainBuff: "expose",
        chainBuffChance: 1.0,
        chainBuffDuration: 6,
      },
    ],
  },
  iron: {
    kind: "iron",
    name: "Iron Bastion",
    short: "Iron",
    description: "Shreds armor so every tower hits harder. Splash cracks Iron hides.",
    color: "#8b95a8",
    colorDim: "#3d4452",
    baseCost: 60,
    tiers: [
      {
        damage: 12,
        range: 100,
        fireRate: 0.8,
        projectileSpeed: 260,
        splash: 46,
        slow: 0,
        chain: 0,
        cost: 60,
        applyBuff: "shred",
        applyBuffChance: 0.45,
        applyBuffDuration: 4,
      },
      {
        damage: 20,
        range: 115,
        fireRate: 0.95,
        projectileSpeed: 280,
        splash: 58,
        slow: 0,
        chain: 0,
        cost: 80,
        applyBuff: "shred",
        applyBuffChance: 0.7,
        applyBuffDuration: 5,
        splashBuff: "shred",
        splashBuffChance: 0.5,
        splashBuffDuration: 4,
      },
      {
        damage: 34,
        range: 130,
        fireRate: 1.1,
        projectileSpeed: 300,
        splash: 74,
        slow: 0,
        chain: 0,
        cost: 120,
        applyBuff: "shred",
        applyBuffChance: 1,
        applyBuffDuration: 7,
        splashBuff: "shred",
        splashBuffChance: 0.85,
        splashBuffDuration: 6,
      },
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

/** @deprecated use LEVEL_SCRIPTS — kept for UI import name compat */
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
 * Difficulty scale per campaign level (t = level-1).
 * L1–6: exponential HP/count growth (hpMul = 1.58^t).
 * L7–10: softer curve from the L6 base so late levels stay challenging but fair
 * (~L10 hpMul ≈ 20–25× instead of ~61×).
 */
export function levelScale(level: number): LevelScale {
  const L = Math.max(1, Math.min(TOTAL_LEVELS, level));
  const t = L - 1;
  // L1–6 exponential; L7+ flatten from L6 base
  const hpMul =
    L <= 6
      ? Math.max(1, Math.pow(1.58, t))
      : Math.pow(1.58, 5) * Math.pow(1.22, L - 6);
  const countMul =
    L <= 6
      ? Math.max(1, Math.pow(1.28, t))
      : Math.pow(1.28, 5) * Math.pow(1.12, L - 6);
  // Speed stays mild throughout; rewards/interval/buff pressure scale with level
  return {
    hpMul,
    speedMul: Math.max(1, Math.pow(1.07, t)),
    countMul,
    rewardMul: Math.max(1, Math.pow(1.32, t)),
    bonusGoldMul: Math.max(1, Math.pow(1.35, t)),
    intervalMul: Math.max(0.22, Math.pow(0.9, t)),
    forceBuffChance: Math.min(0.92, Math.max(0, 1 - Math.pow(0.72, t))),
  };
}

/** Lives lost when a boss reaches the base. Scouts still cost 1. */
export function bossLeakCost(level: number): number {
  // L1–3: 3, L4–6: 4, L7–10: 5
  return Math.min(5, 3 + Math.floor((Math.max(1, level) - 1) / 3));
}

/** Authored waves for a campaign level. Gold scales; counts stay as written. */
export function scaleWavesForLevel(level: number): WaveDef[] {
  const s = levelScale(level);
  return levelScript(level).waves.map((w) => ({
    name: w.name,
    bonusGold: Math.round(w.bonusGold * s.bonusGoldMul),
    spawns: w.spawns.map((sp) => ({ ...sp })),
  }));
}

export function levelClearBonus(level: number): number {
  return Math.round(110 * Math.pow(1.38, level - 1));
}

/** Flat gold when the path moves. Inland towers are not paid extra. */
export function frontShiftResupply(level: number, _stranded = 0): number {
  return Math.round(45 + level * 16);
}

export function midShiftResupply(level: number): number {
  return Math.round(frontShiftResupply(level) * 0.65);
}

/** Well payout scales with tower tier and campaign level. */
export function wellIncome(tier: number, level = 1): number {
  const base = 14 + Math.max(1, tier) * 10;
  const levelMul = 1 + Math.max(0, level - 1) * 0.22;
  return Math.round(base * levelMul);
}

export function keepFortifyCost(current: number): number | null {
  if (current >= MAX_KEEP_FORTIFY) return null;
  return 80 + current * 80;
}

export function keepDoorGunCost(): number {
  return KEEP_DOOR_GUN_COST;
}

export function keepDoorUpgradeCost(currentTier: number): number | null {
  if (currentTier < 1) return KEEP_DOOR_GUN_COST;
  if (currentTier >= KEEP_DOOR_MAX_TIER) return null;
  return currentTier === 1 ? 140 : 220;
}

export interface KeepDoorStats {
  damage: number;
  range: number;
  fireRate: number;
  splash: number;
  applyBuffChance: number;
  applyBuffDuration: number;
}

/** Door gun uses Iron tiers, then grows with fortify and campaign level. */
export function keepDoorStats(tier: number, fortify: number, level: number): KeepDoorStats {
  const t = Math.max(1, Math.min(KEEP_DOOR_MAX_TIER, tier));
  const iron = TOWERS.iron.tiers[t - 1]!;
  const fortMul = 1 + Math.max(0, fortify) * 0.2;
  const levelMul = 1 + Math.max(0, level - 1) * 0.18;
  return {
    damage: Math.round(iron.damage * fortMul * levelMul),
    range: Math.round(iron.range * (1 + (t - 1) * 0.08)),
    fireRate: iron.fireRate * (1 + (t - 1) * 0.08),
    splash: iron.splash,
    applyBuffChance: iron.applyBuffChance ?? 0.45,
    applyBuffDuration: iron.applyBuffDuration ?? 4,
  };
}

export function towerRangeFor(kind: Element, tier: number, role: TowerRole): number {
  if (role === "well" || role === "beacon") return 0;
  const r = TOWERS[kind].tiers[Math.max(0, tier - 1)]!.range;
  return role === "watch" ? Math.round(r * WATCH_RANGE_MUL) : r;
}

export function towerFireRateFor(kind: Element, tier: number, role: TowerRole): number {
  if (role === "well" || role === "beacon") return 0;
  const f = TOWERS[kind].tiers[Math.max(0, tier - 1)]!.fireRate;
  return role === "watch" ? f * WATCH_FIRE_MUL : f;
}

/** Gold returned if this tower is sold at its current tier. */
export function sellRefundFor(kind: Element, tier: number): number {
  let invested = TOWERS[kind].tiers[0]!.cost;
  for (let i = 1; i < tier; i++) {
    invested += upgradeCost(kind, i) ?? TOWERS[kind].tiers[i]!.cost;
  }
  return Math.floor(invested * SELL_REFUND);
}

/** Upgrade to next tier — 1.6× listed cost (still steep, less punishing than 2×). */
export function upgradeCost(kind: Element, currentTier: number): number | null {
  if (currentTier >= MAX_TIER) return null;
  const base = TOWERS[kind].tiers[currentTier]?.cost;
  if (base == null) return null;
  return Math.round(base * 1.6);
}

export const MATCHUP_MANTRA =
  "Ember melts Frost · Frost freezes Volt · Volt shocks Ember & Iron · Iron cracks armor";

export const MATCHUP_HINT: Record<Element, string> = {
  ember: "EMBER > FROST",
  frost: "FROST > VOLT",
  volt: "VOLT > EMBER",
  iron: "IRON shreds all",
};

export function cellCenter(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function matchupLabel(tower: Element, armor: Element): "strong" | "weak" | "neutral" {
  const m = MATCHUP[tower][armor];
  if (m >= 1.4) return "strong";
  if (m <= 0.6) return "weak";
  return "neutral";
}
