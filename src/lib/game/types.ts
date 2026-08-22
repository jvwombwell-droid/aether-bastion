/** Elemental affinity shared by towers and enemy armor. */
export type Element = "ember" | "frost" | "volt" | "iron";

export type TowerKind = Element;

export type EnemyKind =
  | "scout"
  | "brute"
  | "runner"
  | "shield"
  | "hexer"
  | "boss";

/** Temporary combat modifiers on attackers. */
export type BuffId = "fortify" | "haste" | "ward" | "frail" | "expose" | "regen" | "shred";

export interface BuffDef {
  id: BuffId;
  name: string;
  /** Positive = helpful for enemy; negative = debuff. */
  polarity: "strength" | "weakness";
  description: string;
  duration: number;
  /** Damage taken multiplier while active. */
  damageTakenMul?: number;
  /** Move speed multiplier. */
  speedMul?: number;
  /** Extra resistance to listed elements. */
  resistElements?: Element[];
  resistMul?: number;
  /** Extra vulnerability to listed elements. */
  weakElements?: Element[];
  weakMul?: number;
  regenPerSec?: number;
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  short: string;
  description: string;
  color: string;
  colorDim: string;
  baseCost: number;
  /** Per-tier stats; index 0 = tier 1. */
  tiers: TowerTier[];
}

export interface TowerTier {
  damage: number;
  range: number;
  fireRate: number;
  projectileSpeed: number;
  splash: number;
  slow: number;
  chain: number;
  cost: number;
  /** Debuff applied on primary (direct) hit. */
  applyBuff?: BuffId;
  applyBuffChance?: number;
  applyBuffDuration?: number;
  /** Debuff applied on splash secondary targets. */
  splashBuff?: BuffId;
  splashBuffChance?: number;
  splashBuffDuration?: number;
  /** Debuff applied on chain hops (not the first hit). */
  chainBuff?: BuffId;
  chainBuffChance?: number;
  chainBuffDuration?: number;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  reward: number;
  armor: Element;
  radius: number;
  color: string;
  /** Innate strength buff ids (always on). */
  innateStrength: BuffId[];
  /** Innate weakness buff ids (always on). */
  innateWeakness: BuffId[];
  isBoss?: boolean;
}

export interface WaveSpawn {
  kind: EnemyKind;
  count: number;
  interval: number;
  delay: number;
  /** Optional buff applied on spawn. */
  spawnBuff?: BuffId;
  spawnBuffDuration?: number;
}

export interface WaveDef {
  name: string;
  spawns: WaveSpawn[];
  bonusGold: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** How a tower picks its next target. */
export type TargetMode = "first" | "strong" | "close" | "last";

/** Combat job. Inland towers convert; they are never sold. */
export type TowerRole = "battery" | "watch" | "well";

export type GameSpeed = 1 | 2 | 3;

export const TARGET_MODES: TargetMode[] = ["first", "strong", "close", "last"];

export const TARGET_MODE_LABEL: Record<TargetMode, string> = {
  first: "First",
  strong: "Strong",
  close: "Close",
  last: "Last",
};

export interface Tower {
  id: number;
  kind: TowerKind;
  col: number;
  row: number;
  x: number;
  y: number;
  tier: number;
  cooldown: number;
  angle: number;
  kills: number;
  targetMode: TargetMode;
  role: TowerRole;
  /** True if current path is inside this tower's range. */
  covering: boolean;
}

export interface ActiveBuff {
  id: BuffId;
  remaining: number;
  permanent?: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  pathIndex: number;
  progress: number;
  speed: number;
  armor: Element;
  radius: number;
  reward: number;
  alive: boolean;
  buffs: ActiveBuff[];
  slowTimer: number;
  slowMul: number;
  hitFlash: number;
  /** Visual-only tint while flashing; set by the hitting element. */
  hitFlashColor?: string;
  pathT: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  element: Element;
  speed: number;
  targetId: number;
  splash: number;
  slow: number;
  chain: number;
  chained: number;
  ttl: number;
  radius: number;
  alive: boolean;
  color: string;
  /** Seconds until the next trail crumb. Visual only. */
  trailT: number;
  applyBuff?: BuffId;
  applyBuffChance?: number;
  applyBuffDuration?: number;
  splashBuff?: BuffId;
  splashBuffChance?: number;
  splashBuffDuration?: number;
  chainBuff?: BuffId;
  chainBuffChance?: number;
  chainBuffDuration?: number;
}

/** Compact roster line for pre-wave planning UI. */
export interface WavePreviewSpawn {
  kind: EnemyKind;
  name: string;
  count: number;
  armor: Element;
  isBoss?: boolean;
  buff?: BuffId;
}

export interface WavePreview {
  name: string;
  /** 1-based wave number within the level */
  waveNumber: number;
  bonusGold: number;
  spawns: WavePreviewSpawn[];
  totalEnemies: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind?: "spark" | "ring" | "shard";
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
}

export type GamePhase = "menu" | "playing" | "paused" | "won" | "lost" | "levelclear";

export type PlacementMode = TowerKind | null;

export interface Cell {
  col: number;
  row: number;
  buildable: boolean;
  path: boolean;
  occupied: boolean;
  keep: boolean;
}

export interface GameSnapshot {
  phase: GamePhase;
  gold: number;
  lives: number;
  /** Campaign level 1–10 */
  level: number;
  totalLevels: number;
  /** Wave index within level 0–9 (display +1) */
  wave: number;
  totalWaves: number;
  waveActive: boolean;
  enemiesRemaining: number;
  selectedTowerId: number | null;
  selectedKeep: boolean;
  keepFortify: number;
  placement: PlacementMode;
  score: number;
  message: string | null;
  /** Next wave name when idle */
  nextWaveName: string | null;
  /** Full next-wave roster when idle between waves */
  nextWavePreview: WavePreview | null;
  gameSpeed: GameSpeed;
  /** Seconds remaining on the post-level "front shifts" beat. */
  frontShift: number;
  coveringCount: number;
  strandedCount: number;
  /** First-person turret camera from the selected tower. */
  fpv: boolean;
}
