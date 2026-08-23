import {
  BUFFS,
  CELL,
  COLS,
  ENEMIES,
  MATCHUP,
  MAX_TIER,
  ROWS,
  START_GOLD,
  START_LIVES,
  TOTAL_LEVELS,
  TOWERS,
  WAVES_PER_LEVEL,
  bossLeakCost,
  cellCenter,
  frontShiftResupply,
  levelClearBonus,
  levelScale,
  scaleWavesForLevel,
  upgradeCost,
  MATCHUP_HINT,
  KEEP_DOOR_GUN_COST,
  KEEP_DOOR_MAX_TIER,
  KEEP_FORTIFY_LIVES,
  KEEP_WELL_COST,
  WATCH_BOSS_DAMAGE_MUL,
  keepDoorStats,
  keepDoorUpgradeCost,
  keepFortifyCost,
  levelScript,
  midShiftAfterWave,
  midShiftResupply,
  towerFireRateFor,
  towerRangeFor,
  wellIncome,
} from "./config";
import {
  buildPathLengthsFromPoints,
  generatePathCells,
  keepFootprint,
  levelMapSeed,
  pathCellsToPoints,
  pickKeepOrigin,
  type KeepFootprint,
} from "./mapgen";
import { combatRulesFor, damageMultiplier } from "./combat";
import type { SavedRun, SavedTower } from "./persist";
import { renderGame } from "./render";
import type {
  ActiveBuff,
  BuffId,
  Cell,
  Element,
  Enemy,
  FloatingText,
  GamePhase,
  GameSnapshot,
  GameSpeed,
  Particle,
  PlacementMode,
  Projectile,
  TargetMode,
  Tower,
  TowerRole,
  Vec2,
  WaveDef,
  WavePreview,
  WavePreviewSpawn,
} from "./types";
import { TARGET_MODES } from "./types";

let nextId = 1;
function id() {
  return nextId++;
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

const FRONT_SHIFT_SEED_ATTEMPTS = 64;
const FRONT_SHIFT_SEED_STRIDE = 0x9e3779b9;
const SLIPSTREAM_SPEED_MUL = 1.65;

type ShiftTower = Pick<Tower, "col" | "row" | "x" | "y" | "kind" | "tier" | "role">;

function towerCoversPath(
  t: Pick<Tower, "x" | "y" | "kind" | "tier" | "role">,
  pathPoints: Vec2[],
): boolean {
  const range = towerRangeFor(t.kind, t.tier, t.role);
  const r2 = range * range;
  return pathPoints.some((p) => dist2(t.x, t.y, p.x, p.y) <= r2);
}

function countPathCoverage(
  towers: Array<Pick<Tower, "x" | "y" | "kind" | "tier" | "role">>,
  pathPoints: Vec2[],
): { covering: number; stranded: number } {
  let covering = 0;
  let stranded = 0;
  for (const t of towers) {
    if (towerCoversPath(t, pathPoints)) covering += 1;
    else stranded += 1;
  }
  return { covering, stranded };
}

/** Higher tuple wins. Mixed covering+stranded outranks all-cover, which outranks none-cover. */
function shiftCoverageScore(
  covering: number,
  stranded: number,
  towerCount: number,
): [number, number, number] {
  if (towerCount <= 1) {
    return [covering >= 1 ? 1 : 0, stranded, covering];
  }
  if (stranded >= 1 && covering >= 1) return [2, stranded, covering];
  if (covering >= 1) return [1, stranded, covering];
  return [0, stranded, covering];
}

function scoreBetter(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

/** Pure: generate a candidate path and count covering/stranded without touching the live map. */
function evaluateShiftSeed(
  seed: number,
  blockedTowers: Array<[number, number]>,
  keep: KeepFootprint,
  towers: ShiftTower[],
  attractCells: Array<[number, number]> = [],
): { covering: number; stranded: number } {
  const cells = generatePathCells(seed, blockedTowers, keep, blockedTowers, attractCells);
  const points = pathCellsToPoints(cells);
  return countPathCoverage(towers, points);
}

/** Pick a path seed that strands someone when possible, without leaving the road uncovered. */
function pickFrontShiftSeed(seed0: number, keep: KeepFootprint, towers: ShiftTower[]): number {
  if (towers.length === 0) return seed0;
  const blocked: Array<[number, number]> = towers.map((t) => [t.col, t.row]);
  const n = towers.length;
  let bestSeed = seed0;
  let bestScore: [number, number, number] | null = null;

  for (let i = 0; i < FRONT_SHIFT_SEED_ATTEMPTS; i++) {
    const seed = (seed0 + i * FRONT_SHIFT_SEED_STRIDE) >>> 0;
    const attract = towers.filter((t) => t.role === "beacon").map((t) => [t.col, t.row] as [number, number]);
    const { covering, stranded } = evaluateShiftSeed(seed, blocked, keep, towers, attract);
    const score = shiftCoverageScore(covering, stranded, n);
    if (!bestScore || scoreBetter(score, bestScore)) {
      bestScore = score;
      bestSeed = seed;
    }
    if (n === 1 && covering >= 1) break;
    if (n >= 2 && covering >= 1 && stranded === n - 1) break;
  }
  return bestSeed;
}

export class GameEngine {
  cells: Cell[][] = [];
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floats: FloatingText[] = [];

  phase: GamePhase = "menu";
  gold = START_GOLD;
  lives = START_LIVES;
  /** Campaign level 1–TOTAL_LEVELS */
  level = 1;
  /** Wave index within level 0..WAVES_PER_LEVEL-1 */
  wave = 0;
  waveActive = false;
  selectedTowerId: number | null = null;
  placement: PlacementMode = null;
  score = 0;
  message: string | null = null;
  messageTimer = 0;
  gameSpeed: GameSpeed = 1;
  frontShift = 0;
  /** Stays true until the next wave starts so the hold is a real turn. */
  shiftHold = false;
  coveringCount = 0;
  strandedCount = 0;
  fpv = false;
  fpvYaw = 0;
  fpvPitch = 0.12;
  fpvLookYaw = 0;
  fpvLookPitch = 0;
  fpvDragging = false;
  sfx: string[] = [];
  keepOrigin: [number, number] = [0, 0];
  midShiftDone = false;
  keepFortify = 0;
  keepDoorGun = false;
  keepDoorTier = 0;
  keepWell = false;
  keepDoorCooldown = 0;
  selectedKeep = false;

  pathCells: Array<[number, number]> = [];
  pathPoints: Vec2[] = [];
  pathLengths: number[] = [0];
  pathTotal = 1;
  /** Render host */
  prevPathPoints: Vec2[] = [];
  private matchupTeachCd = 0;
  private levelWaves: WaveDef[] = scaleWavesForLevel(1);
  private runSeed = 1;
  private levelClearTimer = 0;

  private spawnQueue: Array<{
    kind: import("./types").EnemyKind;
    at: number;
    spawnBuff?: BuffId;
    spawnBuffDuration?: number;
  }> = [];
  private waveTime = 0;
  /** Render host */
  hoverCol = -1;
  hoverRow = -1;
  shake = 0;
  animTime = 0;
  tilePatternCache = new Map<string, CanvasPattern>();

  constructor() {
    this.runSeed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
    this.keepOrigin = pickKeepOrigin(this.runSeed);
    this.loadMapForLevel(1);
  }

  keepSpec(): KeepFootprint {
    return keepFootprint(this.keepOrigin[0], this.keepOrigin[1]);
  }

  isKeepCell(col: number, row: number): boolean {
    return this.keepSpec().cells.some(([c, r]) => c === col && r === row);
  }

  /** Test seam: current wave has no remaining enemies so update() will clear it. */
  emptyWaveForTest() {
    this.waveActive = true;
    this.spawnQueue = [];
    this.enemies = [];
  }

  /** Test seam: elemental hit pop. */
  emitHitFxForTest(element: Element) {
    this.elementalHit(80, 80, element);
  }

  /** Test seam: jump to a campaign level on the current map/towers. Reloads waves. */
  beginLevelForTest(level: number) {
    this.level = Math.max(1, Math.min(TOTAL_LEVELS, level));
    this.wave = 0;
    this.waveActive = false;
    this.shiftHold = false;
    this.midShiftDone = false;
    this.levelWaves = scaleWavesForLevel(this.level);
  }

  effectiveSpeedForTest(e: Enemy): number {
    return this.effectiveSpeed(e);
  }

  private loadMapForLevel(
    level: number,
    blocked: Array<[number, number]> = [],
    seedOverride?: number,
  ) {
    const keep = this.keepSpec();
    const seed = seedOverride ?? levelMapSeed(level, this.runSeed);
    const blockedAll = [...keep.cells, ...blocked];
    const attract = this.towers.filter((t) => t.role === "beacon").map((t) => [t.col, t.row] as [number, number]);
    this.pathCells = generatePathCells(seed, blockedAll, keep, blocked, attract);
    this.pathPoints = pathCellsToPoints(this.pathCells);
    this.pathLengths = buildPathLengthsFromPoints(this.pathPoints);
    this.pathTotal = this.pathLengths[this.pathLengths.length - 1] ?? 1;
    this.levelWaves = scaleWavesForLevel(level);
    this.buildGrid();
    // Restore permanent tower occupancy after grid rebuild
    for (const [c, r] of blocked) {
      if (this.isKeepCell(c, r)) continue;
      const cell = this.cells[r]?.[c];
      if (cell) {
        cell.occupied = true;
        cell.buildable = false;
        cell.path = false;
      }
    }
  }

  private buildGrid() {
    const pathSet = new Set(this.pathCells.map(([c, r]) => `${c},${r}`));
    const keepSet = new Set(this.keepSpec().cells.map(([c, r]) => `${c},${r}`));
    this.cells = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < COLS; c++) {
        const isKeep = keepSet.has(`${c},${r}`);
        const isPath = pathSet.has(`${c},${r}`) && !isKeep;
        row.push({
          col: c,
          row: r,
          path: isPath,
          buildable: !isPath && !isKeep,
          occupied: isKeep,
          keep: isKeep,
        });
      }
      this.cells.push(row);
    }
  }

  reset() {
    this.resetWithSeed((Math.floor(Math.random() * 0xffffffff) || 1) >>> 0);
  }

  /** Test seam: start a run with a fixed map seed. */
  resetWithSeed(seed: number) {
    nextId = 1;
    this.runSeed = seed >>> 0 || 1;
    this.keepOrigin = pickKeepOrigin(this.runSeed);
    this.midShiftDone = false;
    this.keepFortify = 0;
    this.keepDoorGun = false;
    this.keepDoorTier = 0;
    this.keepWell = false;
    this.keepDoorCooldown = 0;
    this.selectedKeep = false;
    this.level = 1;
    this.loadMapForLevel(1);
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floats = [];
    this.phase = "playing";
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.waveActive = false;
    this.selectedTowerId = null;
    this.placement = null;
    this.score = 0;
    this.message = `Level 1 — the keep holds the corner. Place a tower beside the road, then start wave 1. Towers stay forever.`;
    this.messageTimer = 4;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.shake = 0;
    this.animTime = 0;
    this.levelClearTimer = 0;
    this.gameSpeed = 1;
    this.frontShift = 0;
    this.shiftHold = false;
    this.coveringCount = 0;
    this.strandedCount = 0;
    this.prevPathPoints = [];
    this.matchupTeachCd = 0;
    this.fpv = false;
    this.fpvLookYaw = 0;
    this.fpvLookPitch = 0;
    this.fpvDragging = false;
  }

  exportRun(): SavedRun | null {
    if (this.phase !== "playing" && this.phase !== "paused" && this.phase !== "levelclear") {
      return null;
    }
    if (this.pathCells.length < 2) return null;
    const towers: SavedTower[] = this.towers.map((t) => ({
      id: t.id,
      kind: t.kind,
      col: t.col,
      row: t.row,
      tier: t.tier,
      kills: t.kills,
      targetMode: t.targetMode,
      role: t.role,
    }));
    return {
      version: 4,
      nextId,
      runSeed: this.runSeed,
      level: this.level,
      wave: this.wave,
      phase: this.phase,
      gold: this.gold,
      lives: this.lives,
      score: this.score,
      gameSpeed: this.gameSpeed,
      towers,
      pathCells: this.pathCells.map(([c, r]) => [c, r]),
      keepCol: this.keepOrigin[0],
      keepRow: this.keepOrigin[1],
      midShiftDone: this.midShiftDone,
      keepFortify: this.keepFortify,
      keepDoorGun: this.keepDoorGun,
      keepDoorTier: this.keepDoorTier,
      keepWell: this.keepWell,
    };
  }

  importRun(saved: SavedRun): boolean {
    if (saved.pathCells.length < 2) return false;
    if (saved.level < 1 || saved.level > TOTAL_LEVELS) return false;
    if (saved.wave < 0 || saved.wave > WAVES_PER_LEVEL) return false;

    const blocked = new Set(saved.towers.map((t) => `${t.col},${t.row}`));
    for (const [c, r] of saved.pathCells) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
      if (blocked.has(`${c},${r}`)) return false;
    }
    const keepCheck = keepFootprint(saved.keepCol, saved.keepRow);
    const corner =
      (saved.keepCol === 0 || saved.keepCol === COLS - 2) &&
      (saved.keepRow === 0 || saved.keepRow === ROWS - 2);
    if (!corner) return false;
    const keepKeys = new Set(keepCheck.cells.map(([c, r]) => `${c},${r}`));
    for (const [c, r] of saved.pathCells) {
      if (keepKeys.has(`${c},${r}`)) return false;
    }
    for (const t of saved.towers) {
      if (t.col < 0 || t.row < 0 || t.col >= COLS || t.row >= ROWS) return false;
      if (t.tier < 1 || t.tier > MAX_TIER) return false;
      if (keepKeys.has(`${t.col},${t.row}`)) return false;
    }

    nextId = Math.max(1, Math.floor(saved.nextId));
    this.runSeed = saved.runSeed >>> 0 || 1;
    this.keepOrigin = [saved.keepCol, saved.keepRow];
    this.midShiftDone = saved.midShiftDone;
    this.keepFortify = Math.max(0, Math.floor(saved.keepFortify));
    this.keepDoorGun = saved.keepDoorGun === true;
    this.keepDoorTier = saved.keepDoorTier > 0 ? saved.keepDoorTier : this.keepDoorGun ? 1 : 0;
    this.keepWell = saved.keepWell === true;
    this.keepDoorCooldown = 0;
    this.selectedKeep = false;
    this.shiftHold = false;
    this.level = saved.level;
    this.wave = saved.wave;
    this.phase = saved.phase;
    this.gold = saved.gold;
    this.lives = saved.lives;
    this.score = saved.score;
    this.gameSpeed = saved.gameSpeed;
    this.pathCells = saved.pathCells.map(([c, r]) => [c, r]);
    this.pathPoints = pathCellsToPoints(this.pathCells);
    this.pathLengths = buildPathLengthsFromPoints(this.pathPoints);
    this.pathTotal = this.pathLengths[this.pathLengths.length - 1] ?? 1;
    this.levelWaves = scaleWavesForLevel(this.level);
    this.buildGrid();

    this.towers = [];
    for (const s of saved.towers) {
      const pos = cellCenter(s.col, s.row);
      const cell = this.cells[s.row]![s.col]!;
      cell.occupied = true;
      cell.buildable = false;
      cell.path = false;
      this.towers.push({
        id: s.id,
        kind: s.kind,
        col: s.col,
        row: s.row,
        x: pos.x,
        y: pos.y,
        tier: s.tier,
        cooldown: 0.2,
        angle: 0,
        kills: s.kills,
        targetMode: s.targetMode,
        role: s.role,
        covering: true,
      });
    }
    this.refreshTowerCoverage();

    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floats = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.waveActive = false;
    this.selectedTowerId = null;
    this.placement = null;
    this.fpv = false;
    this.fpvLookYaw = 0;
    this.fpvLookPitch = 0;
    this.fpvDragging = false;
    this.frontShift = 0;
    this.prevPathPoints = [];
    this.message = null;
    this.messageTimer = 0;
    this.shake = 0;
    return true;
  }

  setGameSpeed(speed: GameSpeed) {
    this.gameSpeed = speed;
  }

  cycleGameSpeed(): GameSpeed {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : this.gameSpeed === 2 ? 3 : 1;
    return this.gameSpeed;
  }

  private applyPathAroundTowers(seed: number) {
    const blocked: Array<[number, number]> = this.towers.map((t) => [t.col, t.row]);
    this.prevPathPoints = this.pathPoints.slice();
    this.loadMapForLevel(this.level, blocked, seed);
    for (const t of this.towers) {
      const cell = this.cells[t.row]![t.col]!;
      cell.occupied = true;
      cell.buildable = false;
      cell.path = false;
      t.cooldown = 0.2;
    }
    this.refreshTowerCoverage();
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floats = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.waveActive = false;
    this.selectedTowerId = null;
    this.selectedKeep = false;
    this.placement = null;
    this.fpv = false;
    this.frontShift = 4.2;
  }

  private openShiftHold(goldNote: string) {
    this.shiftHold = true;
    this.selectedKeep = true;
    this.selectedTowerId = null;
    this.placement = null;
    this.fpv = false;
    this.setMessage(
      `The front shifts — convert inland towers or grow the keep, then start the next wave. ${this.coveringCount} covering · ${this.strandedCount} inland · ${goldNote}`,
      99,
    );
    this.playSfx("shift");
  }

  private shiftFrontMidLevel() {
    const seed0 = (levelMapSeed(this.level, this.runSeed) ^ 0x51e9e55) >>> 0;
    const seed = pickFrontShiftSeed(seed0, this.keepSpec(), this.towers);
    this.applyPathAroundTowers(seed);
    this.midShiftDone = true;
    const resupply = midShiftResupply(this.level);
    this.gold += resupply;
    this.openShiftHold(`+${resupply}g`);
  }

  /** Advance to next level: path re-rolls around permanent towers; keep stays. */
  private beginNextLevel() {
    const cleared = this.level;
    const bonus = levelClearBonus(cleared);

    this.level += 1;
    this.midShiftDone = false;
    const seed0 = levelMapSeed(this.level, this.runSeed);
    this.applyPathAroundTowers(pickFrontShiftSeed(seed0, this.keepSpec(), this.towers));

    const stranded = this.strandedCount;
    const resupply = frontShiftResupply(this.level, stranded);
    this.gold += bonus + resupply;
    this.score += 500 + cleared * 200;
    this.wave = 0;
    this.lives = Math.min(
      START_LIVES + this.keepFortify * KEEP_FORTIFY_LIVES,
      this.lives + 3 + Math.floor(cleared / 2),
    );
    this.phase = "playing";
    this.levelClearTimer = 0;
    this.openShiftHold(`+${bonus + resupply}g`);
  }

  consumeSfx(): string[] {
    const out = this.sfx;
    this.sfx = [];
    return out;
  }

  private playSfx(name: string) {
    this.sfx.push(name);
    if (this.sfx.length > 14) this.sfx.shift();
  }

  private refreshTowerCoverage() {
    let covering = 0;
    let stranded = 0;
    for (const t of this.towers) {
      t.covering = towerCoversPath(t, this.pathPoints);
      if (t.covering) covering += 1;
      else stranded += 1;
    }
    this.coveringCount = covering;
    this.strandedCount = stranded;
  }

  /** Called from UI when level-clear overlay continues (or auto after timer). */
  continueAfterLevelClear() {
    if (this.phase !== "levelclear") return;
    if (this.level >= TOTAL_LEVELS) {
      this.phase = "won";
      this.setMessage("All 10 levels cleared. Bastion stands.");
      return;
    }
    this.beginNextLevel();
  }

  getNextWavePreview(): WavePreview | null {
    if (this.phase !== "playing" && this.phase !== "paused") return null;
    if (this.waveActive || this.wave >= this.levelWaves.length) return null;
    const waveDef = this.levelWaves[this.wave];
    if (!waveDef) return null;

    const byKind = new Map<import("./types").EnemyKind, { count: number; buff?: BuffId }>();
    for (const s of waveDef.spawns) {
      const prev = byKind.get(s.kind);
      if (prev) {
        prev.count += s.count;
        if (s.spawnBuff) prev.buff = s.spawnBuff;
      } else {
        byKind.set(s.kind, {
          count: s.count,
          buff: s.spawnBuff,
        });
      }
    }

    const spawns: WavePreviewSpawn[] = [];
    let totalEnemies = 0;
    for (const [kind, agg] of byKind) {
      const def = ENEMIES[kind];
      totalEnemies += agg.count;
      spawns.push({
        kind,
        name: def.name,
        count: agg.count,
        armor: def.armor,
        isBoss: def.isBoss,
        buff: agg.buff,
      });
    }

    return {
      name: waveDef.name,
      waveNumber: this.wave + 1,
      bonusGold: waveDef.bonusGold,
      spawns,
      totalEnemies,
    };
  }

  snapshot(): GameSnapshot {
    const next =
      !this.waveActive && this.wave < this.levelWaves.length
        ? (this.levelWaves[this.wave]?.name ?? null)
        : null;
    return {
      phase: this.phase,
      gold: this.gold,
      lives: this.lives,
      level: this.level,
      totalLevels: TOTAL_LEVELS,
      wave: this.wave,
      totalWaves: WAVES_PER_LEVEL,
      waveActive: this.waveActive,
      enemiesRemaining: this.enemies.filter((e) => e.alive).length + this.spawnQueue.length,
      selectedTowerId: this.selectedTowerId,
      selectedKeep: this.selectedKeep,
      keepFortify: this.keepFortify,
      keepDoorGun: this.keepDoorGun,
      keepDoorTier: this.keepDoorTier,
      keepWell: this.keepWell,
      levelName: levelScript(this.level).name,
      midShiftAfter: midShiftAfterWave(this.level),
      placement: this.placement,
      score: this.score,
      message: this.message,
      nextWaveName: next,
      nextWavePreview: this.getNextWavePreview(),
      gameSpeed: this.gameSpeed,
      frontShift: this.frontShift,
      shiftHold: this.shiftHold,
      coveringCount: this.coveringCount,
      strandedCount: this.strandedCount,
      fpv: this.fpv,
    };
  }

  setPlacement(kind: PlacementMode) {
    if (this.phase !== "playing") return;
    this.placement = kind;
    this.selectedTowerId = null;
    this.selectedKeep = false;
    if (kind) this.fpv = false;
  }

  setHover(col: number, row: number) {
    this.hoverCol = col;
    this.hoverRow = row;
  }

  getSelectedTower(): Tower | null {
    if (this.selectedTowerId == null) return null;
    return this.towers.find((t) => t.id === this.selectedTowerId) ?? null;
  }

  private setMessage(msg: string, duration = 2.5) {
    this.message = msg;
    this.messageTimer = duration;
  }

  tryPlace(col: number, row: number): boolean {
    if (this.phase !== "playing" || !this.placement) return false;
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    const cell = this.cells[row]![col]!;
    if (!cell.buildable || cell.occupied || cell.path || cell.keep) {
      this.setMessage("Cannot build here.");
      return false;
    }
    const def = TOWERS[this.placement];
    const cost = def.tiers[0]!.cost;
    if (this.gold < cost) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= cost;
    const pos = cellCenter(col, row);
    const tower: Tower = {
      id: id(),
      kind: this.placement,
      col,
      row,
      x: pos.x,
      y: pos.y,
      tier: 1,
      cooldown: 0.15,
      angle: 0,
      kills: 0,
      targetMode: "first",
      role: "battery",
      covering: true,
    };
    this.towers.push(tower);
    cell.occupied = true;
    this.selectedTowerId = tower.id;
    this.placement = null;
    this.refreshTowerCoverage();
    this.burst(pos.x, pos.y, def.color, 8);
    this.playSfx("place");
    return true;
  }

  selectAt(col: number, row: number) {
    if (this.phase !== "playing") return;
    if (this.isKeepCell(col, row)) {
      this.selectedKeep = true;
      this.selectedTowerId = null;
      this.placement = null;
      this.fpv = false;
      return;
    }
    const tower = this.towers.find((t) => t.col === col && t.row === row);
    if (tower) {
      this.selectedTowerId = tower.id;
      this.selectedKeep = false;
      this.placement = null;
    } else if (!this.placement) {
      this.selectedTowerId = null;
      this.selectedKeep = false;
      this.fpv = false;
    }
  }

  toggleFpv(): boolean {
    const t = this.getSelectedTower();
    if (!t) {
      this.fpv = false;
      return false;
    }
    this.fpv = !this.fpv;
    if (this.fpv) {
      this.fpvLookYaw = 0;
      this.fpvLookPitch = 0;
      this.fpvYaw = this.aimYawFromTower(t);
      this.fpvPitch = 0.12;
      this.setMessage(`${TOWERS[t.kind].name} — turret cam`, 2);
    }
    return this.fpv;
  }

  setFpv(on: boolean) {
    if (on) {
      if (!this.getSelectedTower()) return;
      if (!this.fpv) this.toggleFpv();
    } else {
      this.fpv = false;
      this.fpvDragging = false;
    }
  }

  lookFpv(dx: number, dy: number) {
    if (!this.fpv) return;
    this.fpvLookYaw += dx * 0.0045;
    this.fpvLookPitch = Math.max(-0.35, Math.min(0.45, this.fpvLookPitch + dy * 0.0032));
  }

  private aimYawFromTower(t: Tower): number {
    const target = this.findTarget(t);
    if (target) return Math.atan2(target.y - t.y, target.x - t.x);
    // Face the nearest path point
    let best = t.angle || 0;
    let bestD = Infinity;
    for (const p of this.pathPoints) {
      const d = dist2(t.x, t.y, p.x, p.y);
      if (d < bestD && d > 40) {
        bestD = d;
        best = Math.atan2(p.y - t.y, p.x - t.x);
      }
    }
    return best;
  }

  upgradeSelected(): boolean {
    const t = this.getSelectedTower();
    if (!t || this.phase !== "playing") return false;
    const cost = upgradeCost(t.kind, t.tier);
    if (cost == null) {
      this.setMessage("Max tier reached.");
      return false;
    }
    if (this.gold < cost) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= cost;
    t.tier += 1;
    this.refreshTowerCoverage();
    this.burst(t.x, t.y, TOWERS[t.kind].color, 12);
    this.setMessage(`${TOWERS[t.kind].name} → Tier ${t.tier}`);
    return true;
  }

  sellSelected(): boolean {
    this.setMessage("Towers stay forever. Convert inland ones.");
    return false;
  }

  convertSelected(role: TowerRole): boolean {
    const t = this.getSelectedTower();
    if (!t || this.phase !== "playing") return false;
    if (t.role === role) return false;
    if (role === "battery") {
      if (!t.covering) {
        this.setMessage("Still inland — restore only when the road returns.");
        return false;
      }
    } else if (t.role === "battery" && t.covering) {
      this.setMessage("On the road — convert only inland towers.");
      return false;
    }
    t.role = role;
    if (role === "watch") t.targetMode = "strong";
    this.refreshTowerCoverage();
    const label =
      role === "watch"
        ? "Watch"
        : role === "well"
          ? "Aether Well"
          : role === "beacon"
            ? "Beacon"
            : "Battery";
    this.setMessage(
      role === "watch"
        ? `${TOWERS[t.kind].name} → Watch — hunts bosses, longer reach`
        : role === "beacon"
          ? `${TOWERS[t.kind].name} → Beacon — the next road bends here`
          : `${TOWERS[t.kind].name} → ${label}`,
    );
    return true;
  }

  fortifyKeep(): boolean {
    if (this.phase !== "playing") return false;
    const cost = keepFortifyCost(this.keepFortify);
    if (cost == null) {
      this.setMessage("Keep is fully fortified.");
      return false;
    }
    if (this.gold < cost) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= cost;
    this.keepFortify += 1;
    this.lives += KEEP_FORTIFY_LIVES;
    this.setMessage(`Thicker walls — +${KEEP_FORTIFY_LIVES} lives`);
    this.playSfx("place");
    return true;
  }

  buyKeepDoorGun(): boolean {
    if (this.phase !== "playing" || this.keepDoorGun) return false;
    if (this.gold < KEEP_DOOR_GUN_COST) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= KEEP_DOOR_GUN_COST;
    this.keepDoorGun = true;
    this.keepDoorTier = 1;
    this.keepDoorCooldown = 0;
    this.setMessage("Door gun T1 — the keep fires the last stretch.");
    this.playSfx("place");
    return true;
  }

  upgradeKeepDoorGun(): boolean {
    if (this.phase !== "playing" || !this.keepDoorGun) return false;
    const cost = keepDoorUpgradeCost(this.keepDoorTier);
    if (cost == null) {
      this.setMessage("Door gun is fully upgraded.");
      return false;
    }
    if (this.gold < cost) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= cost;
    this.keepDoorTier = Math.min(KEEP_DOOR_MAX_TIER, this.keepDoorTier + 1);
    this.setMessage(`Door gun → T${this.keepDoorTier} — harder last stretch`);
    this.playSfx("place");
    return true;
  }

  buyKeepWell(): boolean {
    if (this.phase !== "playing" || this.keepWell) return false;
    if (this.gold < KEEP_WELL_COST) {
      this.setMessage("Not enough gold.");
      return false;
    }
    this.gold -= KEEP_WELL_COST;
    this.keepWell = true;
    this.setMessage("Courtyard well — gold each wave.");
    this.playSfx("place");
    return true;
  }

  /** Test seam: fire the door gun once if an enemy is in range. */
  fireKeepDoorForTest(): boolean {
    if (!this.keepDoorGun) return false;
    const target = this.findKeepDoorTarget();
    if (!target) return false;
    this.fireKeepDoor(target);
    this.keepDoorCooldown = 1 / keepDoorStats(this.keepDoorTier || 1, this.keepFortify, this.level).fireRate;
    return true;
  }

  cycleSelectedTargetMode(): TargetMode | null {
    const t = this.getSelectedTower();
    if (!t) return null;
    const idx = TARGET_MODES.indexOf(t.targetMode);
    const next = TARGET_MODES[(idx + 1) % TARGET_MODES.length]!;
    t.targetMode = next;
    return next;
  }

  setSelectedTargetMode(mode: TargetMode) {
    const t = this.getSelectedTower();
    if (!t) return;
    t.targetMode = mode;
  }

  startWave() {
    if (this.phase !== "playing" || this.waveActive) return;
    if (this.wave >= this.levelWaves.length) return;
    const waveDef = this.levelWaves[this.wave]!;
    this.waveActive = true;
    this.waveTime = 0;
    this.spawnQueue = [];
    for (const s of waveDef.spawns) {
      for (let i = 0; i < s.count; i++) {
        this.spawnQueue.push({
          kind: s.kind,
          at: s.delay + i * s.interval,
          spawnBuff: s.spawnBuff,
          spawnBuffDuration: s.spawnBuffDuration,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.shiftHold = false;
    this.setMessage(`L${this.level} · Wave ${this.wave + 1}: ${waveDef.name}`);
  }

  togglePause() {
    if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "paused") this.phase = "playing";
  }

  private spawnEnemy(
    kind: import("./types").EnemyKind,
    spawnBuff?: BuffId,
    spawnBuffDuration?: number,
  ) {
    const def = ENEMIES[kind];
    const start = this.pathPoints[0]!;
    const scale = levelScale(this.level);
    const waveMul = 1 + this.wave * 0.06;
    const hpMul = scale.hpMul * waveMul;
    const speedMul = scale.speedMul * (1 + this.wave * 0.02);
    const buffs: ActiveBuff[] = [];
    for (const b of def.innateStrength) {
      buffs.push({ id: b, remaining: 9999, permanent: true });
    }
    for (const b of def.innateWeakness) {
      buffs.push({ id: b, remaining: 9999, permanent: true });
    }
    if (spawnBuff && !buffs.some((b) => b.id === spawnBuff)) {
      buffs.push({
        id: spawnBuff,
        remaining: spawnBuffDuration ?? BUFFS[spawnBuff].duration,
      });
    }
    const bossExtra = def.isBoss ? 1 + (this.level - 1) * 0.08 : 1;
    // All combat stats are strictly positive — clamp so bad scale never goes ≤0
    const hp = Math.max(1, Math.round(def.hp * Math.max(0, hpMul) * Math.max(0, bossExtra)));
    const spd = Math.max(8, def.speed * Math.max(0, speedMul));
    const reward = Math.max(
      1,
      Math.round((def.reward + this.wave * 1.5) * Math.max(0, scale.rewardMul)),
    );
    const enemy: Enemy = {
      id: id(),
      kind,
      x: start.x,
      y: start.y,
      hp,
      maxHp: hp,
      pathIndex: 0,
      progress: 0,
      speed: spd,
      armor: def.armor,
      radius: def.radius,
      reward,
      alive: true,
      buffs,
      slowTimer: 0,
      slowMul: 1,
      hitFlash: 0,
      pathT: 0,
    };
    this.enemies.push(enemy);
  }

  private enemyPathProgress(e: Enemy): number {
    const base = this.pathLengths[e.pathIndex] ?? 0;
    if (e.pathIndex >= this.pathPoints.length - 1) return this.pathTotal;
    const a = this.pathPoints[e.pathIndex]!;
    const b = this.pathPoints[e.pathIndex + 1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const along = Math.hypot(e.x - a.x, e.y - a.y);
    return base + Math.min(seg, along);
  }

  private hasFirstGun(): boolean {
    return this.towers.some(
      (t) => t.targetMode === "first" && (t.role === "battery" || t.role === "watch"),
    );
  }

  private effectiveSpeed(e: Enemy): number {
    let mul = 1;
    if (e.slowTimer > 0) mul *= e.slowMul;
    for (const b of e.buffs) {
      const def = BUFFS[b.id];
      if (def.speedMul) mul *= def.speedMul;
    }
    if (levelScript(this.level).rule === "slipstream" && e.kind === "runner" && !this.hasFirstGun()) {
      mul *= SLIPSTREAM_SPEED_MUL;
    }
    return e.speed * mul;
  }

  private applyDamage(
    enemy: Enemy,
    raw: number,
    element: Element,
    opts?: { slow?: number; fromX?: number; fromY?: number },
  ) {
    if (!enemy.alive) return;
    const mul = damageMultiplier(element, enemy, combatRulesFor(levelScript(this.level).rule));
    const dmg = Math.max(1, Math.round(raw * mul));
    enemy.hp -= dmg;
    enemy.hitFlash = 0.12;
    enemy.hitFlashColor = TOWERS[element].color;
    const isStrong = mul >= 1.4;
    const isWeak = mul <= 0.65;
    this.floats.push({
      x: enemy.x + (Math.random() * 8 - 4),
      y: enemy.y - enemy.radius - 4,
      text: isStrong ? `${dmg}!` : isWeak ? `${dmg}` : `${dmg}`,
      color: isStrong ? "#f4f4f5" : isWeak ? "#71717a" : TOWERS[element].color,
      life: 0.7,
      maxLife: 0.7,
      vy: -28,
    });
    if (this.matchupTeachCd <= 0 && (isStrong || isWeak)) {
      this.matchupTeachCd = 1.35;
      this.floats.push({
        x: enemy.x,
        y: enemy.y - enemy.radius - 18,
        text: isStrong ? MATCHUP_HINT[element] : "RESIST",
        color: isStrong ? TOWERS[element].color : "#71717a",
        life: 1.05,
        maxLife: 1.05,
        vy: -18,
      });
    }
    if (opts?.slow && opts.slow > 0) {
      enemy.slowTimer = Math.max(enemy.slowTimer, 1.6);
      enemy.slowMul = Math.min(enemy.slowMul, 1 - opts.slow);
    }
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.gold += enemy.reward;
      this.score += enemy.reward * 10 + 25;
      let best: Tower | null = null;
      let bestD = Infinity;
      for (const tw of this.towers) {
        if (tw.kind !== element) continue;
        const d = dist2(tw.x, tw.y, enemy.x, enemy.y);
        if (d < bestD) {
          bestD = d;
          best = tw;
        }
      }
      if (best) best.kills += 1;
      this.elementalKill(enemy.x, enemy.y, element, !!ENEMIES[enemy.kind].isBoss);
      this.playSfx(ENEMIES[enemy.kind].isBoss ? "bossKill" : "kill");
    } else {
      if (opts?.fromX != null) this.elementalHit(enemy.x, enemy.y, element);
      this.playSfx(enemy.buffs.some((b) => b.id === "shred") ? "shred" : `hit:${element}`);
    }
  }

  findTarget(tower: Tower): Enemy | null {
    const range = towerRangeFor(tower.kind, tower.tier, tower.role);
    const range2 = range * range;
    const mode = tower.targetMode ?? "first";
    let best: Enemy | null = null;
    let bestProgress = -1;
    let bestHp = -1;
    let bestMaxHp = -1;
    let bestDist = Infinity;
    let worstProgress = Infinity;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(tower.x, tower.y, e.x, e.y);
      if (d2 > range2) continue;
      const prog = this.enemyPathProgress(e);

      if (mode === "first") {
        if (prog > bestProgress) {
          bestProgress = prog;
          best = e;
        }
      } else if (mode === "last") {
        if (prog < worstProgress) {
          worstProgress = prog;
          best = e;
        }
      } else if (mode === "close") {
        if (d2 < bestDist) {
          bestDist = d2;
          best = e;
        }
      } else if (
        e.maxHp > bestMaxHp ||
        (e.maxHp === bestMaxHp && e.hp > bestHp) ||
        (e.maxHp === bestMaxHp && e.hp === bestHp && prog > bestProgress)
      ) {
        bestMaxHp = e.maxHp;
        bestHp = e.hp;
        bestProgress = prog;
        best = e;
      }
    }
    return best;
  }

  private applyEnemyBuff(enemy: Enemy, buffId: BuffId, duration: number) {
    if (!enemy.alive) return;
    const existing = enemy.buffs.find((b) => b.id === buffId);
    let showFloat = false;
    if (existing) {
      if (!existing.permanent) {
        if (duration > existing.remaining) {
          existing.remaining = duration;
          showFloat = true;
        }
      }
    } else {
      enemy.buffs.push({ id: buffId, remaining: duration });
      showFloat = true;
    }
    const def = BUFFS[buffId];
    if (showFloat && def.polarity === "weakness") {
      this.floats.push({
        x: enemy.x,
        y: enemy.y - enemy.radius - 10,
        text: def.name,
        color: "#c9a86c",
        life: 0.65,
        maxLife: 0.65,
        vy: -22,
      });
    }
  }

  private tryApplyProjectileBuff(
    enemy: Enemy,
    buffId: BuffId | undefined,
    chance: number | undefined,
    duration: number | undefined,
  ) {
    if (!buffId || !enemy.alive) return;
    const roll = chance ?? 1;
    if (Math.random() > roll) return;
    const dur = duration ?? BUFFS[buffId].duration;
    this.applyEnemyBuff(enemy, buffId, dur);
  }

  private fire(tower: Tower, target: Enemy) {
    const tier = TOWERS[tower.kind].tiers[tower.tier - 1]!;
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = tier.projectileSpeed;
    tower.angle = Math.atan2(dy, dx);
    this.projectiles.push({
      id: id(),
      x: tower.x,
      y: tower.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      damage:
        tower.role === "watch" && ENEMIES[target.kind].isBoss
          ? Math.round(tier.damage * WATCH_BOSS_DAMAGE_MUL)
          : tier.damage,
      element: tower.kind,
      speed,
      targetId: target.id,
      splash: tier.splash,
      slow: tier.slow,
      chain: tier.chain,
      chained: 0,
      ttl: 2.5,
      radius: 4 + tower.tier,
      alive: true,
      color: TOWERS[tower.kind].color,
      trailT: 0.03,
      applyBuff: tier.applyBuff,
      applyBuffChance: tier.applyBuffChance,
      applyBuffDuration: tier.applyBuffDuration,
      splashBuff: tier.splashBuff,
      splashBuffChance: tier.splashBuffChance,
      splashBuffDuration: tier.splashBuffDuration,
      chainBuff: tier.chainBuff,
      chainBuffChance: tier.chainBuffChance,
      chainBuffDuration: tier.chainBuffDuration,
    });
    this.muzzleFlash(tower, dx / len, dy / len);
    this.playSfx(`fire:${tower.kind}`);
  }

  private impactProjectile(p: Projectile, hit: Enemy | null) {
    p.alive = false;
    const targets: Enemy[] = [];
    if (hit && hit.alive) targets.push(hit);

    if (p.splash > 0) {
      const r2 = p.splash * p.splash;
      const ox = hit?.x ?? p.x;
      const oy = hit?.y ?? p.y;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (hit && e.id === hit.id) continue;
        if (dist2(ox, oy, e.x, e.y) <= r2) targets.push(e);
      }
      this.burst(ox, oy, p.color, 10);
      this.particles.push({
        x: ox,
        y: oy,
        vx: 0,
        vy: 0,
        life: 0.32,
        maxLife: 0.32,
        color: p.color,
        size: p.splash,
        kind: "ring",
      });
    }

    for (const e of targets) {
      const isPrimary = hit != null && e.id === hit.id;
      const splashFalloff = isPrimary ? 1 : 0.55;
      this.applyDamage(e, p.damage * splashFalloff, p.element, {
        slow: p.slow,
        fromX: p.x,
        fromY: p.y,
      });

      if (isPrimary) {
        if (p.chained > 0) {
          this.tryApplyProjectileBuff(e, p.chainBuff, p.chainBuffChance, p.chainBuffDuration);
        } else {
          this.tryApplyProjectileBuff(e, p.applyBuff, p.applyBuffChance, p.applyBuffDuration);
        }
      } else {
        this.tryApplyProjectileBuff(e, p.splashBuff, p.splashBuffChance, p.splashBuffDuration);
      }
    }

    if (p.chain > 0 && p.chained < p.chain && hit) {
      let next: Enemy | null = null;
      let bestD = 110 * 110;
      for (const e of this.enemies) {
        if (!e.alive || e.id === hit.id) continue;
        const d = dist2(hit.x, hit.y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          next = e;
        }
      }
      if (next) {
        this.projectiles.push({
          ...p,
          id: id(),
          x: hit.x,
          y: hit.y,
          targetId: next.id,
          damage: p.damage * 0.7,
          chained: p.chained + 1,
          ttl: 1.2,
          alive: true,
          vx: 0,
          vy: 0,
        });
      }
    }
  }

  private capParticles() {
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 140);
  }

  private fxKind(element: Element): NonNullable<Particle["kind"]> {
    return element === "frost" ? "shard" : "spark";
  }

  private emitBurst(
    x: number,
    y: number,
    color: string,
    n: number,
    kind: Particle["kind"],
    size: number,
    speed: number,
    life: number,
  ) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.55 + Math.random() * 0.9);
      const l = life * (0.75 + Math.random() * 0.5);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: l,
        maxLife: l,
        color,
        size: size * (0.7 + Math.random() * 0.6),
        kind,
      });
    }
  }

  keepDoorPos(): Vec2 {
    const door = this.keepSpec().door;
    return cellCenter(door[0], door[1]);
  }

  private findKeepDoorTarget(): Enemy | null {
    const door = this.keepDoorPos();
    const range = keepDoorStats(this.keepDoorTier || 1, this.keepFortify, this.level).range;
    const range2 = range * range;
    let best: Enemy | null = null;
    let bestProgress = -1;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(door.x, door.y, e.x, e.y) > range2) continue;
      const prog = this.enemyPathProgress(e);
      if (prog > bestProgress) {
        bestProgress = prog;
        best = e;
      }
    }
    return best;
  }

  private fireKeepDoor(target: Enemy) {
    const door = this.keepDoorPos();
    const iron = TOWERS.iron.tiers[Math.max(0, (this.keepDoorTier || 1) - 1)]!;
    const stats = keepDoorStats(this.keepDoorTier || 1, this.keepFortify, this.level);
    const dx = target.x - door.x;
    const dy = target.y - door.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = iron.projectileSpeed;
    this.projectiles.push({
      id: id(),
      x: door.x,
      y: door.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      damage: stats.damage,
      element: "iron",
      speed,
      targetId: target.id,
      splash: stats.splash,
      slow: iron.slow,
      chain: iron.chain,
      chained: 0,
      ttl: 2.5,
      radius: 5,
      alive: true,
      color: TOWERS.iron.color,
      trailT: 0.03,
      applyBuff: iron.applyBuff,
      applyBuffChance: stats.applyBuffChance,
      applyBuffDuration: stats.applyBuffDuration,
    });
    this.muzzleFlashAt(door.x, door.y, "iron", dx / len, dy / len);
    this.playSfx("fire:iron");
  }

  private muzzleFlash(tower: Tower, ux: number, uy: number) {
    this.muzzleFlashAt(tower.x, tower.y, tower.kind, ux, uy);
  }

  private muzzleFlashAt(ox: number, oy: number, element: Element, ux: number, uy: number) {
    this.capParticles();
    const x = ox + ux * 10;
    const y = oy + uy * 10 - 8;
    const color = TOWERS[element].color;
    const kind = this.fxKind(element);
    const n = 3 + Math.floor(Math.random() * 3);
    const iron = element === "iron";
    for (let i = 0; i < n; i++) {
      const life = 0.12 + Math.random() * 0.1;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 5,
        y: y + (Math.random() - 0.5) * 4,
        vx: ux * 28 + (Math.random() - 0.5) * 46,
        vy: uy * 28 - 12 + (Math.random() - 0.5) * 36,
        life,
        maxLife: life,
        color,
        size: iron ? 1.2 + Math.random() * 0.8 : 1.8 + Math.random() * 2,
        kind,
      });
    }
  }

  private trailCrumb(p: Projectile) {
    if (this.particles.length >= 180) return;
    const life = 0.12;
    this.particles.push({
      x: p.x + (Math.random() - 0.5) * 2,
      y: p.y + (Math.random() - 0.5) * 2,
      vx: -p.vx * 0.12 + (Math.random() - 0.5) * 18,
      vy: -p.vy * 0.12 + (Math.random() - 0.5) * 18,
      life,
      maxLife: life,
      color: p.color,
      size: 2.4 + Math.random() * 1.8,
      kind: this.fxKind(p.element),
    });
  }

  private elementalHit(x: number, y: number, element: Element) {
    this.capParticles();
    const color = TOWERS[element].color;
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.35,
      maxLife: 0.35,
      color,
      size: 18 + Math.random() * 4,
      kind: "ring",
    });
    this.emitBurst(
      x,
      y,
      color,
      5 + Math.floor(Math.random() * 3),
      this.fxKind(element),
      3.2,
      70,
      0.28,
    );
  }

  private elementalKill(x: number, y: number, element: Element, isBoss: boolean) {
    this.capParticles();
    const color = TOWERS[element].color;
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: isBoss ? 0.5 : 0.42,
      maxLife: isBoss ? 0.5 : 0.42,
      color,
      size: isBoss ? 36 : 26 + Math.random() * 6,
      kind: "ring",
    });
    const shards = isBoss ? 16 : 10 + Math.floor(Math.random() * 5);
    const sparks = isBoss ? 10 : 6;
    this.emitBurst(x, y, color, shards, "shard", isBoss ? 5 : 3.8, isBoss ? 110 : 90, 0.4);
    this.emitBurst(x, y, color, sparks, "spark", isBoss ? 3.2 : 2.6, isBoss ? 80 : 60, 0.3);
  }

  private burst(x: number, y: number, color: string, n: number) {
    this.capParticles();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.5,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  update(dt: number) {
    // UI multiplies dt by gameSpeed; substep so 2×/3× remain accurate under the 50ms step cap.
    let timeLeft = Math.min(Math.max(0, dt), 0.2);
    while (timeLeft > 0) {
      const cap = Math.min(timeLeft, 0.05);
      timeLeft -= cap;
      this.animTime += cap;

      if (this.phase === "levelclear") {
        // Wait for the player — auto-skip hid the new path.
        continue;
      }

      if (this.phase !== "playing") {
        return;
      }

      if (this.messageTimer > 0) {
        this.messageTimer -= cap;
        if (this.messageTimer <= 0) this.message = null;
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - cap * 4);
      if (this.matchupTeachCd > 0) this.matchupTeachCd = Math.max(0, this.matchupTeachCd - cap);
      if (this.frontShift > 0) this.frontShift = Math.max(0, this.frontShift - cap);

      if (this.waveActive) {
        this.waveTime += cap;
        while (this.spawnQueue.length && this.spawnQueue[0]!.at <= this.waveTime) {
          const s = this.spawnQueue.shift()!;
          this.spawnEnemy(s.kind, s.spawnBuff, s.spawnBuffDuration);
        }
      }

      for (const e of this.enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - cap);
        if (!e.alive) continue;
        e.slowTimer = Math.max(0, e.slowTimer - cap);
        if (e.slowTimer <= 0) e.slowMul = 1;

        for (const b of e.buffs) {
          if (!b.permanent) b.remaining -= cap;
          const def = BUFFS[b.id];
          if (def.regenPerSec) {
            const regen = def.regenPerSec * (1 + (this.level - 1) * 0.12);
            e.hp = Math.min(e.maxHp, e.hp + regen * cap);
          }
        }
        e.buffs = e.buffs.filter((b) => b.permanent || b.remaining > 0);

        const speed = this.effectiveSpeed(e);
        let remaining = speed * cap;
        while (remaining > 0 && e.pathIndex < this.pathPoints.length - 1) {
          const target = this.pathPoints[e.pathIndex + 1]!;
          const dx = target.x - e.x;
          const dy = target.y - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= remaining || dist < 0.5) {
            e.x = target.x;
            e.y = target.y;
            e.pathIndex += 1;
            remaining -= dist;
          } else {
            e.x += (dx / dist) * remaining;
            e.y += (dy / dist) * remaining;
            remaining = 0;
          }
        }
        e.pathT = this.enemyPathProgress(e) / this.pathTotal;

        if (e.pathIndex >= this.pathPoints.length - 1) {
          e.alive = false;
          const isBoss = !!ENEMIES[e.kind].isBoss;
          const leakCost = isBoss ? bossLeakCost(this.level) : 1;
          this.lives = Math.max(0, this.lives - leakCost);
          this.shake = isBoss ? 0.55 : 0.35;
          this.burst(e.x, e.y, "#c45c5c", isBoss ? 18 : 10);
          this.playSfx("leak");
          if (this.lives <= 0) {
            this.lives = 0;
            this.phase = "lost";
            this.setMessage(isBoss ? "Boss breached the bastion." : "Keep fallen.");
          } else if (isBoss) {
            this.setMessage(`Boss breach! −${leakCost} lives`);
          }
        }
      }
      this.enemies = this.enemies.filter((e) => e.alive || e.hitFlash > 0);

      for (const t of this.towers) {
        if (t.role === "well" || t.role === "beacon") continue;
        t.cooldown -= cap;
        if (t.cooldown > 0) continue;
        const target = this.findTarget(t);
        if (!target) continue;
        this.fire(t, target);
        t.cooldown = 1 / towerFireRateFor(t.kind, t.tier, t.role);
      }

      if (this.keepDoorGun) {
        this.keepDoorCooldown -= cap;
        if (this.keepDoorCooldown <= 0) {
          const doorTarget = this.findKeepDoorTarget();
          if (doorTarget) {
            this.fireKeepDoor(doorTarget);
            this.keepDoorCooldown = 1 / keepDoorStats(this.keepDoorTier || 1, this.keepFortify, this.level).fireRate;
          }
        }
      }

      for (const p of this.projectiles) {
        if (!p.alive) continue;
        p.ttl -= cap;
        if (p.ttl <= 0) {
          p.alive = false;
          continue;
        }
        const target = this.enemies.find((e) => e.id === p.targetId && e.alive);
        if (target) {
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < target.radius + p.radius || dist < p.speed * cap * 1.2) {
            this.impactProjectile(p, target);
            continue;
          }
          p.vx = (dx / dist) * p.speed;
          p.vy = (dy / dist) * p.speed;
        }
        p.x += p.vx * cap;
        p.y += p.vy * cap;
        if (p.x < -20 || p.y < -20 || p.x > COLS * CELL + 20 || p.y > ROWS * CELL + 20) {
          p.alive = false;
          continue;
        }
        p.trailT -= cap;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          this.trailCrumb(p);
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);

      for (const pt of this.particles) {
        pt.life -= cap;
        pt.x += pt.vx * cap;
        pt.y += pt.vy * cap;
        pt.vx *= 0.92;
        pt.vy *= 0.92;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const f of this.floats) {
        f.life -= cap;
        f.y += f.vy * cap;
      }
      this.floats = this.floats.filter((f) => f.life > 0);

      if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.every((e) => !e.alive)) {
        this.waveActive = false;
        const waveDef = this.levelWaves[this.wave]!;
        this.gold += waveDef.bonusGold;
        let wellGold = 0;
        for (const t of this.towers) {
          if (t.role === "well") wellGold += wellIncome(t.tier, this.level);
        }
        const keepWellGold = this.keepWell ? wellIncome(2, this.level) : 0;
        this.gold += wellGold + keepWellGold;
        this.score += 100 + this.wave * 50 + this.level * 30;
        this.wave += 1;
        this.enemies = [];
        if (this.wave >= WAVES_PER_LEVEL) {
          if (this.level >= TOTAL_LEVELS) {
            this.phase = "won";
            this.setMessage("All 10 levels cleared. Bastion stands.", 6);
            this.playSfx("win");
          } else {
            this.phase = "levelclear";
            this.setMessage(`Level ${this.level} cleared! Read the new front, then continue.`);
            this.playSfx("clear");
          }
        } else if (!this.midShiftDone && this.wave === midShiftAfterWave(this.level)) {
          this.shiftFrontMidLevel();
        } else {
          const extra = `${wellGold > 0 ? ` · wells +${wellGold}g` : ""}${keepWellGold > 0 ? ` · keep well +${keepWellGold}g` : ""}`;
          this.setMessage(`Wave clear! +${waveDef.bonusGold}g${extra} — prep next.`);
          this.playSfx("wave");
        }
      }

      // Won / lost / levelclear: stop combat substeps (levelclear continues via loop head).
      if (this.phase !== "playing") {
        if (this.phase !== "levelclear") return;
      }
    } // while timeLeft
  }

  // ---- Rendering ----
  render(ctx: CanvasRenderingContext2D, viewW: number, viewH: number) {
    if (this.phase !== "playing" && this.phase !== "levelclear") {
      this.animTime += 1 / 60;
    }
    const selected = this.getSelectedTower();
    if (this.fpv && selected && this.phase !== "menu") {
      this.tickFpvCamera(selected);
    }
    renderGame(this, ctx, viewW, viewH);
  }

  private tickFpvCamera(t: Tower) {
    const desired = this.aimYawFromTower(t);
    let d = desired - this.fpvYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.fpvYaw += d * 0.07;
    t.angle = this.fpvYaw + this.fpvLookYaw;
  }

  screenToCell(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    viewW: number,
    viewH: number,
  ): { col: number; row: number } | null {
    const scale = Math.min(viewW / (COLS * CELL), viewH / (ROWS * CELL));
    const drawW = COLS * CELL * scale;
    const drawH = ROWS * CELL * scale;
    const ox = (viewW - drawW) / 2;
    const oy = (viewH - drawH) / 2;
    const x = ((clientX - rect.left) * (viewW / rect.width) - ox) / scale;
    const y = ((clientY - rect.top) * (viewH / rect.height) - oy) / scale;
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
    return { col, row };
  }
}

export function formatMatchup(element: Element): string {
  const rows = (Object.keys(MATCHUP) as Element[]).map((armor) => {
    const m = MATCHUP[element][armor];
    const tag = m >= 1.4 ? "▲" : m <= 0.6 ? "▼" : "•";
    return `${tag}${armor}`;
  });
  return rows.join(" ");
}
