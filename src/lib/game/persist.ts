import type { GameSpeed, TargetMode, TowerKind, TowerRole } from "./types";

export const SAVE_KEY = "aether-bastion-run";
export const SAVE_VERSION = 2;

export type SavedPhase = "playing" | "paused" | "levelclear";

export interface SavedTower {
  id: number;
  kind: TowerKind;
  col: number;
  row: number;
  tier: number;
  kills: number;
  targetMode: TargetMode;
  role: TowerRole;
}

export interface SavedRun {
  version: 2;
  nextId: number;
  runSeed: number;
  level: number;
  wave: number;
  phase: SavedPhase;
  gold: number;
  lives: number;
  score: number;
  gameSpeed: GameSpeed;
  towers: SavedTower[];
  pathCells: Array<[number, number]>;
  keepCol: number;
  keepRow: number;
  midShiftDone: boolean;
  keepFortify: number;
}

const TOWER_KINDS: readonly TowerKind[] = ["ember", "frost", "volt", "iron"];
const TARGET_MODES: readonly TargetMode[] = ["first", "strong", "close", "last"];
const TOWER_ROLES: readonly TowerRole[] = ["battery", "watch", "well"];
const PHASES: readonly SavedPhase[] = ["playing", "paused", "levelclear"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTowerKind(value: unknown): value is TowerKind {
  return TOWER_KINDS.some((kind) => kind === value);
}

function isTargetMode(value: unknown): value is TargetMode {
  return TARGET_MODES.some((mode) => mode === value);
}

function isTowerRole(value: unknown): value is TowerRole {
  return TOWER_ROLES.some((role) => role === value);
}

function isSavedPhase(value: unknown): value is SavedPhase {
  return PHASES.some((phase) => phase === value);
}

function isGameSpeed(value: unknown): value is GameSpeed {
  return value === 1 || value === 2 || value === 3;
}

function isPathCell(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function isSavedTower(value: unknown): value is SavedTower {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    Number.isFinite(value.id) &&
    isTowerKind(value.kind) &&
    typeof value.col === "number" &&
    Number.isFinite(value.col) &&
    typeof value.row === "number" &&
    Number.isFinite(value.row) &&
    typeof value.tier === "number" &&
    Number.isFinite(value.tier) &&
    value.tier >= 1 &&
    typeof value.kills === "number" &&
    Number.isFinite(value.kills) &&
    isTargetMode(value.targetMode) &&
    isTowerRole(value.role)
  );
}

export function parseSavedRun(data: unknown): SavedRun | null {
  if (!isRecord(data)) return null;
  if (data.version !== SAVE_VERSION) return null;
  if (typeof data.nextId !== "number" || !Number.isFinite(data.nextId)) return null;
  if (typeof data.runSeed !== "number" || !Number.isFinite(data.runSeed)) return null;
  if (typeof data.level !== "number" || !Number.isFinite(data.level)) return null;
  if (typeof data.wave !== "number" || !Number.isFinite(data.wave)) return null;
  if (!isSavedPhase(data.phase)) return null;
  if (typeof data.gold !== "number" || !Number.isFinite(data.gold)) return null;
  if (typeof data.lives !== "number" || !Number.isFinite(data.lives)) return null;
  if (typeof data.score !== "number" || !Number.isFinite(data.score)) return null;
  if (!isGameSpeed(data.gameSpeed)) return null;
  if (!Array.isArray(data.towers) || !data.towers.every(isSavedTower)) return null;
  if (!Array.isArray(data.pathCells) || !data.pathCells.every(isPathCell)) return null;
  if (data.pathCells.length < 2) return null;
  if (typeof data.keepCol !== "number" || !Number.isFinite(data.keepCol)) return null;
  if (typeof data.keepRow !== "number" || !Number.isFinite(data.keepRow)) return null;
  if (typeof data.midShiftDone !== "boolean") return null;
  if (typeof data.keepFortify !== "number" || !Number.isFinite(data.keepFortify)) return null;

  return {
    version: 2,
    nextId: data.nextId,
    runSeed: data.runSeed,
    level: data.level,
    wave: data.wave,
    phase: data.phase,
    gold: data.gold,
    lives: data.lives,
    score: data.score,
    gameSpeed: data.gameSpeed,
    towers: data.towers,
    pathCells: data.pathCells,
    keepCol: data.keepCol,
    keepRow: data.keepRow,
    midShiftDone: data.midShiftDone,
    keepFortify: data.keepFortify,
  };
}

export function loadSavedRun(): SavedRun | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return parseSavedRun(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeSavedRun(run: SavedRun): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* quota / private mode */
  }
}

export function clearSavedRun(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
