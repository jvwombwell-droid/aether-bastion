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
  MID_SHIFT_WAVE,
  KEEP_DOOR_GUN_COST,
  KEEP_FORTIFY_LIVES,
  KEEP_WELL_COST,
  keepFortifyCost,
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
import { damageMultiplier } from "./combat";
import type { SavedRun, SavedTower } from "./persist";
import { enemySprite, getSprite, towerSprite } from "./sprites";
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
): { covering: number; stranded: number } {
  const cells = generatePathCells(seed, blockedTowers, keep, blockedTowers);
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
    const { covering, stranded } = evaluateShiftSeed(seed, blocked, keep, towers);
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
  keepWell = false;
  keepDoorCooldown = 0;
  selectedKeep = false;

  pathCells: Array<[number, number]> = [];
  pathPoints: Vec2[] = [];
  pathLengths: number[] = [0];
  pathTotal = 1;
  private prevPathPoints: Vec2[] = [];
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
  private hoverCol = -1;
  private hoverRow = -1;
  private shake = 0;
  private animTime = 0;
  private tilePatternCache = new Map<string, CanvasPattern>();

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

  private loadMapForLevel(
    level: number,
    blocked: Array<[number, number]> = [],
    seedOverride?: number,
  ) {
    const keep = this.keepSpec();
    const seed = seedOverride ?? levelMapSeed(level, this.runSeed);
    const blockedAll = [...keep.cells, ...blocked];
    this.pathCells = generatePathCells(seed, blockedAll, keep, blocked);
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
      version: 3,
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

    const byKind = new Map<
      import("./types").EnemyKind,
      { count: number; buff?: BuffId }
    >();
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
        ? this.levelWaves[this.wave]?.name ?? null
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
      enemiesRemaining:
        this.enemies.filter((e) => e.alive).length + this.spawnQueue.length,
      selectedTowerId: this.selectedTowerId,
      selectedKeep: this.selectedKeep,
      keepFortify: this.keepFortify,
      keepDoorGun: this.keepDoorGun,
      keepWell: this.keepWell,
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
    this.refreshTowerCoverage();
    const label = role === "watch" ? "Watch" : role === "well" ? "Aether Well" : "Battery";
    this.setMessage(`${TOWERS[t.kind].name} → ${label}`);
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
    this.keepDoorCooldown = 0;
    this.setMessage("Door gun — the keep fires the last stretch.");
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
    this.keepDoorCooldown = 1 / TOWERS.iron.tiers[0]!.fireRate;
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
    const bossExtra = def.isBoss ? Math.pow(1.22, this.level - 1) : 1;
    // All combat stats are strictly positive — clamp so bad scale never goes ≤0
    const hp = Math.max(1, Math.round(def.hp * Math.max(0, hpMul) * Math.max(0, bossExtra)));
    const spd = Math.max(8, def.speed * Math.max(0, speedMul));
    const reward = Math.max(1, Math.round((def.reward + this.wave * 1.5) * Math.max(0, scale.rewardMul)));
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

  private effectiveSpeed(e: Enemy): number {
    let mul = 1;
    if (e.slowTimer > 0) mul *= e.slowMul;
    for (const b of e.buffs) {
      const def = BUFFS[b.id];
      if (def.speedMul) mul *= def.speedMul;
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
    const mul = damageMultiplier(element, enemy);
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
      this.playSfx(enemy.buffs.some((b) => b.id === "shred") ? "shred" : "hit");
    }
  }

  private findTarget(tower: Tower): Enemy | null {
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
      damage: tier.damage,
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
    this.playSfx("fire");
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
          this.tryApplyProjectileBuff(
            e,
            p.chainBuff,
            p.chainBuffChance,
            p.chainBuffDuration,
          );
        } else {
          this.tryApplyProjectileBuff(
            e,
            p.applyBuff,
            p.applyBuffChance,
            p.applyBuffDuration,
          );
        }
      } else {
        this.tryApplyProjectileBuff(
          e,
          p.splashBuff,
          p.splashBuffChance,
          p.splashBuffDuration,
        );
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

  private keepDoorPos(): Vec2 {
    const door = this.keepSpec().door;
    return cellCenter(door[0], door[1]);
  }

  private findKeepDoorTarget(): Enemy | null {
    const door = this.keepDoorPos();
    const range = TOWERS.iron.tiers[0]!.range;
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
    const tier = TOWERS.iron.tiers[0]!;
    const dx = target.x - door.x;
    const dy = target.y - door.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = tier.projectileSpeed;
    this.projectiles.push({
      id: id(),
      x: door.x,
      y: door.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      damage: tier.damage,
      element: "iron",
      speed,
      targetId: target.id,
      splash: tier.splash,
      slow: tier.slow,
      chain: tier.chain,
      chained: 0,
      ttl: 2.5,
      radius: 5,
      alive: true,
      color: TOWERS.iron.color,
      trailT: 0.03,
      applyBuff: tier.applyBuff,
      applyBuffChance: tier.applyBuffChance,
      applyBuffDuration: tier.applyBuffDuration,
    });
    this.muzzleFlashAt(door.x, door.y, "iron", dx / len, dy / len);
    this.playSfx("fire");
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
    this.emitBurst(x, y, color, 5 + Math.floor(Math.random() * 3), this.fxKind(element), 3.2, 70, 0.28);
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
      if (t.role === "well") continue;
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
          this.keepDoorCooldown = 1 / TOWERS.iron.tiers[0]!.fireRate;
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

    if (
      this.waveActive &&
      this.spawnQueue.length === 0 &&
      this.enemies.every((e) => !e.alive)
    ) {
      this.waveActive = false;
      const waveDef = this.levelWaves[this.wave]!;
      this.gold += waveDef.bonusGold;
      let wellGold = 0;
      for (const t of this.towers) {
        if (t.role === "well") wellGold += wellIncome(t.tier);
      }
      const keepWellGold = this.keepWell ? wellIncome(1) : 0;
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
      } else if (!this.midShiftDone && this.wave === MID_SHIFT_WAVE - 1) {
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
      this.drawFpv(ctx, viewW, viewH, selected);
      return;
    }

    const scale = Math.min(viewW / (COLS * CELL), viewH / (ROWS * CELL));
    const drawW = COLS * CELL * scale;
    const drawH = ROWS * CELL * scale;
    const ox = (viewW - drawW) / 2;
    const oy = (viewH - drawH) / 2;

    ctx.save();
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "#1c1816");
    g.addColorStop(0.5, "#12141a");
    g.addColorStop(1, "#0c1016");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;

    ctx.translate(ox + shakeX, oy + shakeY);
    ctx.scale(scale, scale);

    this.drawMap(ctx);
    this.drawPath(ctx);
    this.drawDuskWash(ctx);
    this.drawAetherVein(ctx);
    this.drawEndpointPads(ctx);

    if (this.placement && this.hoverCol >= 0) {
      this.drawPlacementGhost(ctx, this.hoverCol, this.hoverRow);
    }
    if (selected) {
      this.drawRange(ctx, selected);
    }

    for (const t of this.towers) this.drawTower(ctx, t, t.id === this.selectedTowerId);
    for (const e of this.enemies) if (e.alive || e.hitFlash > 0) this.drawEnemy(ctx, e);
    for (const p of this.projectiles) if (p.alive) this.drawProjectile(ctx, p);
    for (const pt of this.particles) this.drawParticle(ctx, pt);
    for (const f of this.floats) this.drawFloat(ctx, f);

    if (this.pathPoints.length > 0) {
      this.drawSpawn(ctx, this.pathPoints[0]!);
      this.drawKeep(ctx);
      this.drawKeepDoor(ctx, this.keepDoorPos());
    }

    if (this.frontShift > 0 || this.shiftHold) this.drawFrontShift(ctx);

    ctx.restore();
  }

  private ensureTilePattern(
    ctx: CanvasRenderingContext2D,
    key: "grass" | "dirt",
  ): CanvasPattern | null {
    const cached = this.tilePatternCache.get(key);
    if (cached) return cached;
    const img = getSprite(key);
    if (!img) return null;
    const pattern = ctx.createPattern(img, "repeat");
    if (pattern) {
      // 256px texture at ~2.4 cells so speckle reads at board scale
      const scale = (CELL * 2.4) / (img.naturalWidth || 256);
      if (typeof DOMMatrix !== "undefined") {
        pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
      }
      this.tilePatternCache.set(key, pattern);
    }
    return pattern;
  }

  /** Fill a rect with a repeating ground sprite, or a dusk color if it is not loaded. */
  private fillGround(
    ctx: CanvasRenderingContext2D,
    key: "grass" | "dirt",
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const pattern = this.ensureTilePattern(ctx, key);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, w, h);
      return;
    }

    const img = getSprite(key);
    if (img) {
      const tw = img.naturalWidth || CELL;
      const th = img.naturalHeight || CELL;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const x0 = Math.floor(x / tw) * tw;
      const y0 = Math.floor(y / th) * th;
      const x1 = x + w;
      const y1 = y + h;
      for (let py = y0; py < y1; py += th) {
        for (let px = x0; px < x1; px += tw) {
          ctx.drawImage(img, px, py, tw, th);
        }
      }
      ctx.restore();
      return;
    }

    if (key === "grass") {
      const hill = ctx.createLinearGradient(0, 0, 0, ROWS * CELL);
      hill.addColorStop(0, "#455640");
      hill.addColorStop(0.5, "#334530");
      hill.addColorStop(1, "#243226");
      ctx.fillStyle = hill;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = "#5a4632";
      ctx.fillRect(x, y, w, h);
    }
  }

  private strokeLane(
    ctx: CanvasRenderingContext2D,
    points: Vec2[],
    color: string,
    width: number,
  ) {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  private drawMap(ctx: CanvasRenderingContext2D) {
    this.fillGround(ctx, "grass", 0, 0, COLS * CELL, ROWS * CELL);
  }

  private drawPath(ctx: CanvasRenderingContext2D) {
    if (this.frontShift > 0 && this.prevPathPoints.length > 1) {
      const fade = this.frontShift / 4.2;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.28 * fade;
      ctx.setLineDash([8, 10]);
      this.strokeLane(ctx, this.prevPathPoints, "#6a5a48", CELL * 0.7);
      ctx.restore();
    }

    if (this.pathPoints.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Rounded dirt road — do not stamp square path cells (that reads as a grid).
    this.strokeLane(ctx, this.pathPoints, "rgba(48, 34, 22, 0.55)", CELL * 1.02);
    const dirt = this.ensureTilePattern(ctx, "dirt");
    if (dirt) {
      ctx.strokeStyle = dirt;
      ctx.lineWidth = CELL * 0.86;
      ctx.beginPath();
      for (let i = 0; i < this.pathPoints.length; i++) {
        const p = this.pathPoints[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    } else {
      this.strokeLane(ctx, this.pathPoints, "#6b5340", CELL * 0.86);
    }
    this.strokeLane(ctx, this.pathPoints, "rgba(92, 70, 48, 0.28)", CELL * 0.52);
    ctx.restore();
  }

  private drawDuskWash(ctx: CanvasRenderingContext2D) {
    const w = COLS * CELL;
    const h = ROWS * CELL;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = "multiply";
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, "#f4d4a8");
    wash.addColorStop(0.4, "#d8c8b4");
    wash.addColorStop(1, "#8a96a4");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    const warm = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    warm.addColorStop(0, "rgba(232, 150, 70, 0.55)");
    warm.addColorStop(1, "rgba(232, 150, 70, 0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h * 0.35);
    ctx.restore();

    ctx.save();
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      h * 0.28,
      w * 0.5,
      h * 0.5,
      Math.hypot(w, h) * 0.58,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(0.72, "rgba(10,12,20,0.05)");
    vig.addColorStop(1, "rgba(8,10,18,0.22)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private drawAetherVein(ctx: CanvasRenderingContext2D) {
    if (this.pathPoints.length < 2) return;
    const pulse = this.frontShift > 0 ? 0.16 + 0.1 * Math.sin(this.animTime * 7) : 0.08;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.strokeLane(ctx, this.pathPoints, `rgba(150, 196, 210, ${pulse})`, 1.15);
    ctx.restore();
  }

  private drawEndpointPads(ctx: CanvasRenderingContext2D) {
    if (this.pathPoints.length === 0) return;
    const spawn = this.pathPoints[0]!;
    const keep = this.pathPoints[this.pathPoints.length - 1]!;

    ctx.save();
    const spawnGlow = ctx.createRadialGradient(
      spawn.x,
      spawn.y,
      2,
      spawn.x,
      spawn.y,
      CELL * 1.35,
    );
    spawnGlow.addColorStop(0, "rgba(196, 92, 92, 0.22)");
    spawnGlow.addColorStop(0.55, "rgba(196, 92, 92, 0.07)");
    spawnGlow.addColorStop(1, "rgba(196, 92, 92, 0)");
    ctx.fillStyle = spawnGlow;
    ctx.beginPath();
    ctx.arc(spawn.x, spawn.y, CELL * 1.35, 0, Math.PI * 2);
    ctx.fill();

    const keepGlow = ctx.createRadialGradient(keep.x, keep.y, 2, keep.x, keep.y, CELL * 1.45);
    keepGlow.addColorStop(0, "rgba(160, 200, 220, 0.2)");
    keepGlow.addColorStop(0.55, "rgba(160, 200, 220, 0.07)");
    keepGlow.addColorStop(1, "rgba(160, 200, 220, 0)");
    ctx.fillStyle = keepGlow;
    ctx.beginPath();
    ctx.arc(keep.x, keep.y, CELL * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSpawn(ctx: CanvasRenderingContext2D, pos: Vec2) {
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 3.2);
    ctx.save();
    ctx.translate(pos.x, pos.y);

    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    glow.addColorStop(0, `rgba(196, 92, 92, ${0.4 + pulse * 0.18})`);
    glow.addColorStop(1, "rgba(196, 92, 92, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();

    const portal = getSprite("spawn");
    if (portal) {
      const s = 46;
      ctx.drawImage(portal, Math.round(-s / 2), Math.round(-s / 2), s, s);
    } else {
      ctx.fillStyle = "#2a1212";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawLabelPill(ctx, 0, -32, "SPAWN", "#c45c5c", "#1a0c0c");
    ctx.restore();
  }

  private drawKeep(ctx: CanvasRenderingContext2D) {
    const keep = this.keepSpec();
    const pos = {
      x: keep.origin[0] * CELL + CELL,
      y: keep.origin[1] * CELL + CELL,
    };
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.4);
    const danger = this.lives <= 5;
    const accent = danger ? "#c45c5c" : "#c8d0dc";
    const selected = this.selectedKeep;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 58);
    glow.addColorStop(
      0,
      danger
        ? `rgba(200, 100, 100, ${0.38 + pulse * 0.15})`
        : `rgba(160, 200, 220, ${0.34 + pulse * 0.14})`,
    );
    glow.addColorStop(1, "rgba(160, 200, 220, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = "#f4f4f5";
      ctx.lineWidth = 2;
      ctx.strokeRect(-CELL, -CELL, CELL * 2, CELL * 2);
    }

    const spr = getSprite("keep") ?? getSprite("base");
    if (spr) {
      const s = 92;
      ctx.drawImage(spr, Math.round(-s / 2), Math.round(-s / 2 - 10), s, s);
    } else {
      ctx.fillStyle = "#1a1c22";
      ctx.fillRect(-28, -24, 56, 48);
    }

    this.drawLabelPill(
      ctx,
      0,
      -52,
      danger ? `KEEP  ${this.lives}` : "KEEP",
      accent,
      danger ? "#1a0c0c" : "#0e1014",
    );
    if (!danger) {
      ctx.fillStyle = "rgba(180, 195, 215, 0.9)";
      ctx.font = "700 10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(this.lives), 0, 42);
    }
    if (this.keepWell) {
      ctx.fillStyle = "rgba(212,176,80,0.95)";
      ctx.font = "700 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WELL", 0, 56);
    }

    ctx.restore();

    if (this.selectedKeep && this.keepDoorGun) {
      const door = this.keepDoorPos();
      const range = TOWERS.iron.tiers[0]!.range;
      ctx.save();
      ctx.strokeStyle = TOWERS.iron.color + "55";
      ctx.fillStyle = TOWERS.iron.color + "12";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(door.x, door.y, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawKeepDoor(ctx: CanvasRenderingContext2D, pos: Vec2) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.8);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, `rgba(160, 210, 230, ${0.45 + pulse * 0.2})`);
    g.addColorStop(1, "rgba(160, 210, 230, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    if (this.keepDoorGun) {
      let ang = -Math.PI / 2;
      if (this.pathPoints.length >= 2) {
        const a = this.pathPoints[this.pathPoints.length - 2]!;
        const b = this.pathPoints[this.pathPoints.length - 1]!;
        ang = Math.atan2(a.y - b.y, a.x - b.x);
      }
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = TOWERS.iron.color;
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(0, -12);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-3.2, -22, 6.4, 16);
      ctx.fillStyle = "#2a2e34";
      ctx.fillRect(-1.6, -20, 3.2, 10);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawLabelPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    bg: string,
  ) {
    ctx.save();
    ctx.font = "700 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 14;
    const h = 16;
    const r = 4;
    const left = x - w / 2;
    const top = y - h / 2;

    ctx.fillStyle = bg;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + h - r);
    ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
    ctx.lineTo(left + r, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  private drawRange(ctx: CanvasRenderingContext2D, t: Tower) {
    if (t.role === "well") return;
    const range = towerRangeFor(t.kind, t.tier, t.role);
    ctx.save();
    ctx.strokeStyle = TOWERS[t.kind].color + "55";
    ctx.fillStyle = TOWERS[t.kind].color + "12";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPlacementGhost(ctx: CanvasRenderingContext2D, col: number, row: number) {
    if (!this.placement || col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
    const cell = this.cells[row]![col]!;
    const pos = cellCenter(col, row);
    const ok = cell.buildable && !cell.occupied && !cell.path;
    const def = TOWERS[this.placement];
    const range = def.tiers[0]!.range;
    ctx.save();
    ctx.fillStyle = ok ? "rgba(236, 224, 196, 0.22)" : "rgba(196, 92, 92, 0.22)";
    ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = ok ? "rgba(246, 232, 196, 0.95)" : "rgba(220, 110, 100, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = ok ? def.color : "#c45c5c";
    ctx.fillStyle = ok ? def.color + "22" : "#c45c5c22";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = ok ? 0.7 : 0.35;
    const spr = towerSprite(this.placement);
    if (spr) {
      ctx.drawImage(spr, Math.round(pos.x - 18), Math.round(pos.y - 22), 36, 36);
    } else {
      ctx.fillStyle = ok ? def.color : "#c45c5c";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTower(ctx: CanvasRenderingContext2D, t: Tower, selected: boolean) {
    const def = TOWERS[t.kind];
    ctx.save();
    ctx.translate(t.x, t.y);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.frontShift > 0 || this.shiftHold || !t.covering) {
      const pulse =
        this.frontShift > 0 || this.shiftHold
          ? 0.45 + 0.55 * Math.sin(this.animTime * 6)
          : 0.55;
      ctx.strokeStyle = t.covering
        ? `rgba(90, 158, 111, ${0.35 + pulse * 0.5})`
        : `rgba(212, 160, 64, ${0.4 + pulse * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 21 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (t.role === "watch") this.drawWatchGlow(ctx);

    const sprite = towerSprite(t.kind);
    if (t.role === "well") {
      this.drawWellTower(ctx, t);
    } else {
      if (sprite) {
        const s = 38 + t.tier * 2;
        ctx.drawImage(sprite, Math.round(-s / 2), Math.round(-s / 2 - 4), s, s);
      } else {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      if (t.role === "watch") this.drawWatchLantern(ctx);
    }

    if (selected) {
      ctx.strokeStyle = "#f4f4f5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (t.role === "well") {
      ctx.fillStyle = "rgba(212,176,80,0.95)";
      ctx.font = "700 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WELL", 0, 24);
    } else if (t.role === "watch") {
      ctx.fillStyle = "rgba(160,200,220,0.95)";
      ctx.font = "700 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("WATCH", 0, 24);
    } else if (!t.covering) {
      ctx.fillStyle = "rgba(212,160,64,0.95)";
      ctx.font = "700 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("INLAND", 0, 24);
    }

    ctx.restore();

    ctx.save();
    for (let i = 0; i < t.tier; i++) {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(t.x - 8 + i * 8, t.y + 20, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Cool watch-light, not Ember orange. */
  private drawWatchGlow(ctx: CanvasRenderingContext2D) {
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.6);
    const glow = ctx.createRadialGradient(0, -12, 2, 0, -10, 28);
    glow.addColorStop(0, `rgba(220, 230, 255, ${0.4 + pulse * 0.14})`);
    glow.addColorStop(0.45, `rgba(160, 190, 220, ${0.16 + pulse * 0.08})`);
    glow.addColorStop(1, "rgba(160, 190, 220, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, -12, 14, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Small lantern on the crown — not a 22px lamp-post sticker. */
  private drawWatchLantern(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(236, 232, 210, 0.95)";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(5, -16);
    ctx.lineTo(0, -11);
    ctx.lineTo(-5, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(180, 210, 240, 0.9)";
    ctx.beginPath();
    ctx.arc(0, -16, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Well replaces the gun. */
  private drawWellTower(ctx: CanvasRenderingContext2D, t: Tower) {
    const overlay = getSprite("well");
    if (overlay) {
      const s = 36 + t.tier * 2;
      ctx.drawImage(overlay, Math.round(-s / 2), Math.round(-s / 2 + 1), s, s);
      return;
    }
    ctx.fillStyle = "#6e685c";
    ctx.beginPath();
    ctx.ellipse(0, 3, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9a9384";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = "#0d0b12";
    ctx.beginPath();
    ctx.ellipse(0, 3, 9.5, 6.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Visual size only — hitboxes stay on e.radius. */
  private enemySpriteSize(e: Enemy): number {
    const def = ENEMIES[e.kind];
    if (def.isBoss) return 64;
    if (e.kind === "scout" || e.kind === "runner") return e.radius * 4.0;
    return e.radius * 3.3;
  }

  /** Fit sprite in a box without squashing tall or square art. */
  private drawContainedSprite(
    ctx: CanvasRenderingContext2D,
    sprite: HTMLImageElement,
    x: number,
    y: number,
    box: number,
  ) {
    const iw = sprite.naturalWidth || box;
    const ih = sprite.naturalHeight || box;
    const scale = Math.min(box / iw, box / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(sprite, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const def = ENEMIES[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(e.hitFlash * 40) * 0.45;

    const size = this.enemySpriteSize(e);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, size * 0.38, size * 0.28, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const sprite = enemySprite(e.kind);
    if (sprite) {
      const bob = Math.sin(this.animTime * 8 + e.id) * 1.1;
      this.drawContainedSprite(ctx, sprite, 0, -2 + bob, size);
      if (e.hitFlash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(0.5, e.hitFlash * 4);
        ctx.fillStyle = e.hitFlashColor ?? "#f4f4f5";
        ctx.beginPath();
        ctx.ellipse(0, -2, size * 0.3, size * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.fillStyle = e.hitFlash > 0.05 ? (e.hitFlashColor ?? "#f4f4f5") : def.color;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Armor pip — not a full-body ring
    const armor = TOWERS[e.armor]?.color ?? "#a1a1aa";
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.arc(size * 0.32, -size * 0.32, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(8,8,10,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const shredded = e.buffs.some((b) => b.id === "shred");
    if (shredded) {
      ctx.strokeStyle = "#d4b06a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(size * 0.32 - 3, -size * 0.32 - 3);
      ctx.lineTo(size * 0.32 + 3, -size * 0.32 + 3);
      ctx.moveTo(size * 0.32 + 3, -size * 0.32 - 3);
      ctx.lineTo(size * 0.32 - 3, -size * 0.32 + 3);
      ctx.stroke();
    }

    const hasStrength = e.buffs.some((b) => BUFFS[b.id].polarity === "strength");
    const hasWeakness = e.buffs.some((b) => BUFFS[b.id].polarity === "weakness");
    if (hasStrength) {
      ctx.fillStyle = "#5a9e6f";
      ctx.fillRect(-size * 0.42, -size * 0.42, 5, 5);
    }
    if (hasWeakness) {
      ctx.fillStyle = "#c45c5c";
      ctx.fillRect(-size * 0.42 + (hasStrength ? 6 : 0), -size * 0.42, 5, 5);
    }

    const bw = Math.max(22, size * 0.85);
    const bh = 3;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-bw / 2, -size / 2 - 8, bw, bh);
    ctx.fillStyle = pct > 0.4 ? "#5a9e6f" : "#c45c5c";
    ctx.fillRect(-bw / 2, -size / 2 - 8, bw * pct, bh);

    if (e.slowTimer > 0) {
      ctx.fillStyle = "rgba(91,159,212,0.75)";
      ctx.beginPath();
      ctx.arc(size / 2 - 4, size / 2 - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawFrontShift(ctx: CanvasRenderingContext2D) {
    const fade = this.shiftHold
      ? 1
      : Math.min(1, this.frontShift / 0.6, (4.2 - this.frontShift) / 0.45);
    const mid = (COLS * CELL) / 2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(8,8,12,0.62)";
    ctx.fillRect(mid - 250, 10, 500, 50);
    ctx.strokeStyle = "rgba(212,196,160,0.4)";
    ctx.strokeRect(mid - 250, 10, 500, 50);
    ctx.fillStyle = "#e8e0d0";
    ctx.font = "700 14px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("THE FRONT SHIFTS", mid, 26);
    ctx.font = "500 11px Segoe UI, sans-serif";
    ctx.fillStyle = "#a8a29a";
    ctx.fillText(
      this.shiftHold
        ? `${this.coveringCount} covering · ${this.strandedCount} inland — convert or grow the keep, then start`
        : `${this.coveringCount} still cover the road · ${this.strandedCount} now inland`,
      mid,
      44,
    );
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
    ctx.save();
    const ang = Math.atan2(p.vy, p.vx);
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    if (p.element === "ember") {
      // Orange teardrop — must not read as a gold lightning bolt.
      ctx.fillStyle = "#e85d4c";
      ctx.shadowColor = "#e85d4c";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, 7);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, -7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7a2418";
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-12, 4);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-12, -4);
      ctx.closePath();
      ctx.fill();
    } else if (p.element === "frost") {
      ctx.fillStyle = "#5b9fd4";
      ctx.shadowColor = "#9fd4f0";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-14, 0);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#f2f7fc";
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, -3.5);
      ctx.closePath();
      ctx.fill();
    } else if (p.element === "volt") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(2, 6);
      ctx.lineTo(16, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#f5e9a0";
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(2, 6);
      ctx.lineTo(16, 0);
      ctx.stroke();
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#1c1e22";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(-16, 0);
      ctx.stroke();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#eceff4";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#2a2e34";
      ctx.beginPath();
      ctx.arc(3, 0, p.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    ctx.save();
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    if (p.kind === "ring") {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.15 - a * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "shard") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.size);
      ctx.lineTo(p.x + p.size * 0.5, p.y);
      ctx.lineTo(p.x, p.y + p.size);
      ctx.lineTo(p.x - p.size * 0.5, p.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFloat(ctx: CanvasRenderingContext2D, f: FloatingText) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.font = "700 11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  private tickFpvCamera(t: Tower) {
    const desired = this.aimYawFromTower(t);
    let d = desired - this.fpvYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.fpvYaw += d * 0.07;
    t.angle = this.fpvYaw + this.fpvLookYaw;
  }

  private projectFpv(
    wx: number,
    wy: number,
    height: number,
    camX: number,
    camY: number,
    yaw: number,
    pitch: number,
    vw: number,
    vh: number,
  ): { x: number; y: number; z: number; s: number } | null {
    const dx = wx - camX;
    const dy = wy - camY;
    const fx = Math.cos(yaw);
    const fy = Math.sin(yaw);
    const rx = -Math.sin(yaw);
    const ry = Math.cos(yaw);
    const right = dx * rx + dy * ry;
    const forward = dx * fx + dy * fy;
    const up = height - 20;
    if (forward < 10) return null;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const fz = forward * cp - up * sp;
    const fy2 = forward * sp + up * cp;
    if (fz < 8) return null;
    const f = vh / (2 * Math.tan(0.52));
    return {
      x: vw / 2 + (right / fz) * f,
      y: vh * 0.46 - (fy2 / fz) * f,
      z: fz,
      s: f / fz,
    };
  }

  private drawFpv(ctx: CanvasRenderingContext2D, vw: number, vh: number, cam: Tower) {
    const yaw = this.fpvYaw + this.fpvLookYaw;
    const pitch = this.fpvPitch + this.fpvLookPitch;
    const def = TOWERS[cam.kind];
    const project = (wx: number, wy: number, h = 0) =>
      this.projectFpv(wx, wy, h, cam.x, cam.y, yaw, pitch, vw, vh);

    ctx.save();
    ctx.clearRect(0, 0, vw, vh);

    const sky = ctx.createLinearGradient(0, 0, 0, vh * 0.5);
    sky.addColorStop(0, "#141820");
    sky.addColorStop(0.55, "#1c1816");
    sky.addColorStop(1, "#2a2218");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh * 0.5);

    const ground = ctx.createLinearGradient(0, vh * 0.42, 0, vh);
    ground.addColorStop(0, "#3a3224");
    ground.addColorStop(0.35, "#2a2418");
    ground.addColorStop(1, "#14110c");
    ctx.fillStyle = ground;
    ctx.fillRect(0, vh * 0.42, vw, vh * 0.58);

    // Horizon haze
    const haze = ctx.createLinearGradient(0, vh * 0.38, 0, vh * 0.52);
    haze.addColorStop(0, "rgba(180,140,90,0)");
    haze.addColorStop(0.5, "rgba(180,140,90,0.12)");
    haze.addColorStop(1, "rgba(40,32,20,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, vh * 0.36, vw, vh * 0.2);

    // Ground grid — short lanes only, close to camera
    ctx.strokeStyle = "rgba(255,230,180,0.05)";
    ctx.lineWidth = 1;
    const rightX = Math.cos(yaw + Math.PI / 2);
    const rightY = Math.sin(yaw + Math.PI / 2);
    const fwdX = Math.cos(yaw);
    const fwdY = Math.sin(yaw);
    for (let i = -6; i <= 6; i++) {
      const ox = cam.x + rightX * i * 36;
      const oy = cam.y + rightY * i * 36;
      const a = project(ox + fwdX * 50, oy + fwdY * 50);
      const b = project(ox + fwdX * 280, oy + fwdY * 280);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Path as receding road — one stroke per segment so width can shrink with depth
    const pathProj = this.pathPoints.map((p) => project(p.x, p.y, 0));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < pathProj.length - 1; i++) {
      const a = pathProj[i];
      const b = pathProj[i + 1];
      if (!a || !b) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > vw * 0.85) continue;
      ctx.strokeStyle = "#4a3c28";
      ctx.lineWidth = Math.max(5, Math.min(36, ((a.s + b.s) / 2) * 0.32));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(212,196,160,0.2)";
      ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.18);
      ctx.stroke();
    }
    // Spawn / base markers
    if (this.pathPoints.length) {
      const sp = project(this.pathPoints[0]!.x, this.pathPoints[0]!.y, 10);
      const bp = project(this.pathPoints[this.pathPoints.length - 1]!.x, this.pathPoints[this.pathPoints.length - 1]!.y, 14);
      if (sp) {
        const img = getSprite("spawn");
        const sz = Math.max(18, Math.min(70, sp.s * 0.9));
        if (img) ctx.drawImage(img, sp.x - sz / 2, sp.y - sz, sz, sz);
      }
      if (bp) {
        const img = getSprite("base");
        const sz = Math.max(20, Math.min(78, bp.s * 1.0));
        if (img) ctx.drawImage(img, bp.x - sz / 2, bp.y - sz, sz, sz);
      }
    }

    type SpriteBillboard = {
      z: number;
      draw: () => void;
    };
    const billboards: SpriteBillboard[] = [];

    for (const t of this.towers) {
      if (t.id === cam.id) continue;
      const p = project(t.x, t.y, 12);
      if (!p) continue;
      billboards.push({
        z: p.z,
        draw: () => {
          const spr = towerSprite(t.kind);
          const sz = Math.max(16, Math.min(72, p.s * 0.85));
          if (spr) ctx.drawImage(spr, p.x - sz / 2, p.y - sz * 0.92, sz, sz);
          else {
            ctx.fillStyle = TOWERS[t.kind].color;
            ctx.fillRect(p.x - 6, p.y - 16, 12, 16);
          }
        },
      });
    }

    const tracked = this.findTarget(cam);
    for (const e of this.enemies) {
      if (!e.alive && e.hitFlash <= 0) continue;
      const p = project(e.x, e.y, 8);
      if (!p) continue;
      billboards.push({
        z: p.z,
        draw: () => {
          const spr = enemySprite(e.kind);
          const sz = Math.max(18, Math.min(110, p.s * (e.kind === "boss" ? 1.5 : 1.05)));
          ctx.save();
          if (e.hitFlash > 0) ctx.globalAlpha = 0.65 + Math.sin(e.hitFlash * 40) * 0.35;
          if (spr) this.drawContainedSprite(ctx, spr, p.x, p.y - sz * 0.45, sz);
          else {
            ctx.fillStyle = e.hitFlash > 0 ? (e.hitFlashColor ?? ENEMIES[e.kind].color) : ENEMIES[e.kind].color;
            ctx.beginPath();
            ctx.arc(p.x, p.y - sz * 0.4, sz * 0.28, 0, Math.PI * 2);
            ctx.fill();
          }
          if (e.hitFlash > 0 && spr) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = Math.min(0.45, e.hitFlash * 3.5);
            ctx.fillStyle = e.hitFlashColor ?? "#f4f4f5";
            ctx.beginPath();
            ctx.ellipse(p.x, p.y - sz * 0.45, sz * 0.26, sz * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
          }
          const bw = sz * 0.7;
          const pct = Math.max(0, e.hp / e.maxHp);
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(p.x - bw / 2, p.y - sz - 6, bw, 4);
          ctx.fillStyle = pct > 0.4 ? "#5a9e6f" : "#c45c5c";
          ctx.fillRect(p.x - bw / 2, p.y - sz - 6, bw * pct, 4);
          if (tracked && tracked.id === e.id) {
            ctx.strokeStyle = def.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - sz / 2 - 4, p.y - sz - 10, sz + 8, sz + 14);
          }
          ctx.restore();
        },
      });
    }

    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      const p = project(pr.x, pr.y, 10);
      if (!p) continue;
      billboards.push({
        z: p.z,
        draw: () => {
          ctx.save();
          ctx.fillStyle = pr.color;
          ctx.shadowColor = pr.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 8, Math.max(2, Math.min(8, p.s * 0.08)), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }

    billboards.sort((a, b) => b.z - a.z);
    for (const b of billboards) b.draw();

    // Range ring on ground
    const range = def.tiers[cam.tier - 1]!.range;
    ctx.save();
    ctx.strokeStyle = def.color + "55";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    let ringStarted = false;
    for (let a = 0; a <= 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const p = project(cam.x + Math.cos(ang) * range, cam.y + Math.sin(ang) * range, 0);
      if (!p) {
        ringStarted = false;
        continue;
      }
      if (!ringStarted) {
        ctx.moveTo(p.x, p.y);
        ringStarted = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    // Stone visor / crenellation
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, vw, 36);
    ctx.fillRect(0, vh - 54, vw, 54);
    ctx.fillStyle = "#1a1a1e";
    for (let x = 0; x < vw; x += 28) {
      ctx.fillRect(x + 4, 28, 16, 14);
      ctx.fillRect(x + 4, vh - 68, 16, 16);
    }

    // Vignette
    const vig = ctx.createRadialGradient(vw / 2, vh * 0.48, vh * 0.2, vw / 2, vh * 0.48, vh * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, vw, vh);

    // Crosshair
    ctx.strokeStyle = def.color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    const cx = vw / 2;
    const cy = vh * 0.46;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx, cy + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = def.color;
    ctx.font = "700 13px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(def.name.toUpperCase(), 16, vh - 28);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "500 11px Segoe UI, sans-serif";
    ctx.fillText(`T${cam.tier} · ${cam.kills} kills · drag to look · V exit`, 16, vh - 12);

    if (tracked) {
      const ed = ENEMIES[tracked.kind];
      const mul = damageMultiplier(cam.kind, tracked);
      const tag = mul >= 1.4 ? "STRONG" : mul <= 0.65 ? "RESIST" : "HIT";
      ctx.textAlign = "right";
      ctx.fillStyle = "#e4e4e7";
      ctx.font = "600 12px Segoe UI, sans-serif";
      ctx.fillText(ed.name, vw - 16, vh - 28);
      ctx.fillStyle = mul >= 1.4 ? "#5a9e6f" : mul <= 0.65 ? "#c45c5c" : def.color;
      ctx.font = "700 11px Segoe UI, sans-serif";
      ctx.fillText(`${tag}  ${Math.round(tracked.hp)}/${tracked.maxHp}`, vw - 16, vh - 12);
    } else {
      ctx.textAlign = "right";
      ctx.fillStyle = "#71717a";
      ctx.font = "500 11px Segoe UI, sans-serif";
      ctx.fillText("No target in range", vw - 16, vh - 20);
    }

    ctx.restore();

    this.drawFpvMinimap(ctx, vw, vh, cam);
  }

  private drawFpvMinimap(ctx: CanvasRenderingContext2D, vw: number, vh: number, cam: Tower) {
    const mw = Math.min(176, vw * 0.28);
    const mh = mw * (ROWS / COLS);
    const mx = vw - mw - 12;
    const my = 44;
    const sx = mw / (COLS * CELL);
    const sy = mh / (ROWS * CELL);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,10,12,0.82)";
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.strokeStyle = "rgba(212,196,160,0.35)";
    ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);

    ctx.translate(mx, my);
    ctx.scale(sx, sy);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r]![c]!;
        ctx.fillStyle = cell.path ? "#3a3224" : "#1a1c20";
        ctx.fillRect(c * CELL, r * CELL, CELL + 0.5, CELL + 0.5);
      }
    }
    ctx.strokeStyle = "#6a5a40";
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < this.pathPoints.length; i++) {
      const p = this.pathPoints[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    for (const t of this.towers) {
      ctx.fillStyle = t.id === cam.id ? "#f4f4f5" : TOWERS[t.kind].color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.id === cam.id ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      ctx.fillStyle = ENEMIES[e.kind].color;
      ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
    }

    // View cone
    const yaw = this.fpvYaw + this.fpvLookYaw;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(cam.x, cam.y);
    ctx.arc(cam.x, cam.y, 90, yaw - 0.5, yaw + 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    void vh;
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
