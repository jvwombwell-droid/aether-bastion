import {
  BUFFS,
  CELL,
  COLS,
  ENEMIES,
  MATCHUP,
  ROWS,
  SELL_REFUND,
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
} from "./config";
import {
  buildPathLengthsFromPoints,
  generatePathCells,
  levelMapSeed,
  pathCellsToPoints,
} from "./mapgen";
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
  TowerKind,
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
  coveringCount = 0;
  strandedCount = 0;
  fpv = false;
  fpvYaw = 0;
  fpvPitch = 0.12;
  fpvLookYaw = 0;
  fpvLookPitch = 0;
  fpvDragging = false;

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

  constructor() {
    this.runSeed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
    this.loadMapForLevel(1);
  }

  private loadMapForLevel(
    level: number,
    blocked: Array<[number, number]> = [],
  ) {
    const seed = levelMapSeed(level, this.runSeed);
    this.pathCells = generatePathCells(seed, blocked);
    this.pathPoints = pathCellsToPoints(this.pathCells);
    this.pathLengths = buildPathLengthsFromPoints(this.pathPoints);
    this.pathTotal = this.pathLengths[this.pathLengths.length - 1] ?? 1;
    this.levelWaves = scaleWavesForLevel(level);
    this.buildGrid();
    // Restore permanent tower occupancy after grid rebuild
    for (const [c, r] of blocked) {
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
    this.cells = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < COLS; c++) {
        const isPath = pathSet.has(`${c},${r}`);
        row.push({
          col: c,
          row: r,
          path: isPath,
          buildable: !isPath,
          occupied: false,
        });
      }
      this.cells.push(row);
    }
  }

  reset() {
    nextId = 1;
    this.runSeed = (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
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
    this.message = `Level 1 — place towers, then start wave 1.`;
    this.messageTimer = 4;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.shake = 0;
    this.animTime = 0;
    this.levelClearTimer = 0;
    this.gameSpeed = 1;
    this.frontShift = 0;
    this.coveringCount = 0;
    this.strandedCount = 0;
    this.prevPathPoints = [];
    this.matchupTeachCd = 0;
    this.fpv = false;
    this.fpvLookYaw = 0;
    this.fpvLookPitch = 0;
    this.fpvDragging = false;
  }

  setGameSpeed(speed: GameSpeed) {
    this.gameSpeed = speed;
  }

  cycleGameSpeed(): GameSpeed {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : this.gameSpeed === 2 ? 3 : 1;
    return this.gameSpeed;
  }

  /** Advance to next level: path re-rolls around permanent towers; spawn/base may move. */
  private beginNextLevel() {
    const cleared = this.level;
    const bonus = levelClearBonus(cleared);

    const blocked: Array<[number, number]> = this.towers.map((t) => [t.col, t.row]);
    this.prevPathPoints = this.pathPoints.slice();

    this.level += 1;
    this.loadMapForLevel(this.level, blocked);

    for (const t of this.towers) {
      const cell = this.cells[t.row]![t.col]!;
      cell.occupied = true;
      cell.buildable = false;
      cell.path = false;
      t.cooldown = 0.2;
    }

    this.refreshTowerCoverage();
    const stranded = this.strandedCount;
    const resupply = frontShiftResupply(this.level, stranded);
    this.gold += bonus + resupply;
    this.score += 500 + cleared * 200;

    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floats = [];
    this.wave = 0;
    this.waveActive = false;
    this.selectedTowerId = null;
    this.placement = null;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.lives = Math.min(START_LIVES, this.lives + 3 + Math.floor(cleared / 2));
    this.phase = "playing";
    this.levelClearTimer = 0;
    this.frontShift = 4.2;
    this.fpv = false;

    this.setMessage(
      `The front shifts — ${this.coveringCount} covering · ${stranded} off-path · +${bonus + resupply}g`,
      6,
    );
  }

  private refreshTowerCoverage() {
    let covering = 0;
    let stranded = 0;
    for (const t of this.towers) {
      const range = TOWERS[t.kind].tiers[t.tier - 1]!.range;
      const r2 = range * range;
      t.covering = this.pathPoints.some((p) => dist2(t.x, t.y, p.x, p.y) <= r2);
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
      placement: this.placement,
      score: this.score,
      message: this.message,
      nextWaveName: next,
      nextWavePreview: this.getNextWavePreview(),
      gameSpeed: this.gameSpeed,
      frontShift: this.frontShift,
      coveringCount: this.coveringCount,
      strandedCount: this.strandedCount,
      fpv: this.fpv,
    };
  }

  setPlacement(kind: PlacementMode) {
    if (this.phase !== "playing") return;
    this.placement = kind;
    this.selectedTowerId = null;
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
    if (!cell.buildable || cell.occupied || cell.path) {
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
      covering: true,
    };
    this.towers.push(tower);
    cell.occupied = true;
    this.selectedTowerId = tower.id;
    this.placement = null;
    this.burst(pos.x, pos.y, def.color, 8);
    return true;
  }

  selectAt(col: number, row: number) {
    if (this.phase !== "playing") return;
    const tower = this.towers.find((t) => t.col === col && t.row === row);
    if (tower) {
      this.selectedTowerId = tower.id;
      this.placement = null;
    } else if (!this.placement) {
      this.selectedTowerId = null;
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
    const t = this.getSelectedTower();
    if (!t || this.phase !== "playing") return false;
    const def = TOWERS[t.kind];
    let invested = def.tiers[0]!.cost;
    for (let i = 1; i < t.tier; i++) {
      invested += upgradeCost(t.kind, i) ?? def.tiers[i]!.cost;
    }
    const refund = Math.floor(invested * SELL_REFUND);
    this.gold += refund;
    this.cells[t.row]![t.col]!.occupied = false;
    this.towers = this.towers.filter((x) => x.id !== t.id);
    this.selectedTowerId = null;
    this.fpv = false;
    this.refreshTowerCoverage();
    this.setMessage(`Sold for ${refund}g`);
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
    if (spawnBuff) {
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

  private damageMultiplier(element: Element, enemy: Enemy): number {
    let mul = MATCHUP[element][enemy.armor];
    const shredded = enemy.buffs.some((b) => b.id === "shred");
    if (shredded && mul < 1) {
      // Armor cracked: pull weak matchups most of the way back toward 1.0
      mul = mul + (1 - mul) * 0.62;
    }
    for (const b of enemy.buffs) {
      const def = BUFFS[b.id];
      if (def.damageTakenMul) mul *= def.damageTakenMul;
      if (def.resistElements?.includes(element) && def.resistMul) {
        mul *= def.resistMul;
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

  private applyDamage(
    enemy: Enemy,
    raw: number,
    element: Element,
    opts?: { slow?: number; fromX?: number; fromY?: number },
  ) {
    if (!enemy.alive) return;
    const mul = this.damageMultiplier(element, enemy);
    const dmg = Math.max(1, Math.round(raw * mul));
    enemy.hp -= dmg;
    enemy.hitFlash = 0.12;
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
    if (opts?.fromX != null) {
      this.burst(enemy.x, enemy.y, TOWERS[element].color, 4);
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
      this.burst(enemy.x, enemy.y, ENEMIES[enemy.kind].color, 14);
    }
  }

  private findTarget(tower: Tower): Enemy | null {
    const def = TOWERS[tower.kind].tiers[tower.tier - 1]!;
    const range2 = def.range * def.range;
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

  private burst(x: number, y: number, color: string, n: number) {
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
      this.levelClearTimer -= cap;
      if (this.levelClearTimer <= 0) {
        this.continueAfterLevelClear();
      }
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
      if (!e.alive) continue;
      e.hitFlash = Math.max(0, e.hitFlash - cap);
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
        if (this.lives <= 0) {
          this.lives = 0;
          this.phase = "lost";
          this.setMessage(isBoss ? "Boss breached the bastion." : "Base fallen.");
        } else if (isBoss) {
          this.setMessage(`Boss breach! −${leakCost} lives`);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.hitFlash > 0);

    for (const t of this.towers) {
      t.cooldown -= cap;
      if (t.cooldown > 0) continue;
      const target = this.findTarget(t);
      if (!target) continue;
      const tier = TOWERS[t.kind].tiers[t.tier - 1]!;
      this.fire(t, target);
      t.cooldown = 1 / tier.fireRate;
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
      this.score += 100 + this.wave * 50 + this.level * 30;
      this.wave += 1;
      this.enemies = [];
      if (this.wave >= WAVES_PER_LEVEL) {
        if (this.level >= TOTAL_LEVELS) {
          this.phase = "won";
          this.setMessage("All 10 levels cleared. Bastion stands.", 6);
        } else {
          this.phase = "levelclear";
          this.levelClearTimer = 2.8;
          this.setMessage(`Level ${this.level} cleared! Next map incoming…`, 3);
        }
      } else {
        this.setMessage(`Wave clear! +${waveDef.bonusGold}g — prep next.`);
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

    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "#0c0c0e");
    g.addColorStop(1, "#080809");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;

    ctx.translate(ox + shakeX, oy + shakeY);
    ctx.scale(scale, scale);

    this.drawMap(ctx);
    this.drawPath(ctx);
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
      this.drawBase(ctx, this.pathPoints[this.pathPoints.length - 1]!);
    }

    if (this.frontShift > 0) this.drawFrontShift(ctx);

    ctx.restore();
  }

  private drawMap(ctx: CanvasRenderingContext2D) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r]![c]!;
        const x = c * CELL;
        const y = r * CELL;
        const h = ((c * 17 + r * 31) >>> 0) % 5;
        if (cell.path) {
          ctx.fillStyle = h < 2 ? "#2a2318" : h < 4 ? "#32291c" : "#2e2619";
        } else {
          const moss = ["#12161a", "#14181c", "#161a1e", "#13171b", "#15191d"][h]!;
          ctx.fillStyle = moss;
        }
        ctx.fillRect(x, y, CELL, CELL);
        if (!cell.path && cell.buildable) {
          ctx.fillStyle = "rgba(90, 140, 110, 0.045)";
          ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = "rgba(255,255,255,0.035)";
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        }
      }
    }
  }

  private drawPath(ctx: CanvasRenderingContext2D) {
    if (this.frontShift > 0 && this.prevPathPoints.length > 1) {
      const fade = this.frontShift / 4.2;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.22 * fade;
      ctx.strokeStyle = "#6a5a48";
      ctx.lineWidth = CELL * 0.7;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      for (let i = 0; i < this.prevPathPoints.length; i++) {
        const p = this.prevPathPoints[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (this.pathPoints.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3a3024";
    ctx.lineWidth = CELL * 0.84;
    ctx.beginPath();
    for (let i = 0; i < this.pathPoints.length; i++) {
      const p = this.pathPoints[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#4a3e2e";
    ctx.lineWidth = CELL * 0.52;
    ctx.stroke();
    ctx.strokeStyle = "rgba(212,196,160,0.16)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawEndpointPads(ctx: CanvasRenderingContext2D) {
    if (this.pathCells.length === 0) return;
    const spawnCell = this.pathCells[0]!;
    const baseCell = this.pathCells[this.pathCells.length - 1]!;

    for (let i = 0; i < Math.min(4, this.pathCells.length); i++) {
      const [c, r] = this.pathCells[i]!;
      const alpha = 0.22 - i * 0.04;
      ctx.fillStyle = `rgba(196, 92, 92, ${alpha})`;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }

    for (let i = 0; i < Math.min(4, this.pathCells.length); i++) {
      const idx = this.pathCells.length - 1 - i;
      const [c, r] = this.pathCells[idx]!;
      const alpha = 0.2 - i * 0.035;
      ctx.fillStyle = `rgba(180, 200, 220, ${alpha})`;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(196, 92, 92, 0.75)";
    ctx.strokeRect(
      spawnCell[0] * CELL + 2,
      spawnCell[1] * CELL + 2,
      CELL - 4,
      CELL - 4,
    );
    ctx.strokeStyle = "rgba(200, 210, 225, 0.8)";
    ctx.strokeRect(
      baseCell[0] * CELL + 2,
      baseCell[1] * CELL + 2,
      CELL - 4,
      CELL - 4,
    );
  }

  private drawSpawn(ctx: CanvasRenderingContext2D, pos: Vec2) {
    const t = this.animTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    const pulse2 = 0.5 + 0.5 * Math.sin(t * 3.2 + 1.2);

    ctx.save();
    ctx.translate(pos.x, pos.y);

    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
    glow.addColorStop(0, `rgba(196, 92, 92, ${0.45 + pulse * 0.2})`);
    glow.addColorStop(0.55, `rgba(196, 92, 92, ${0.18 + pulse * 0.1})`);
    glow.addColorStop(1, "rgba(196, 92, 92, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(232, 120, 110, ${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(196, 92, 92, ${0.25 + pulse2 * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + pulse2 * 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#2a1212";
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e07a6e";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = `rgba(232, 140, 130, ${0.75 + pulse * 0.25})`;
    for (let i = 0; i < 3; i++) {
      const ox = -4 + i * 5;
      ctx.beginPath();
      ctx.moveTo(ox - 2, -6);
      ctx.lineTo(ox + 4, 0);
      ctx.lineTo(ox - 2, 6);
      ctx.lineTo(ox, 0);
      ctx.closePath();
      ctx.fill();
    }

    const portal = getSprite("spawn");
    if (portal) {
      ctx.drawImage(portal, -22, -22, 44, 44);
    }

    this.drawLabelPill(ctx, 0, -30, "SPAWN", "#c45c5c", "#1a0c0c");

    ctx.fillStyle = "rgba(196, 92, 92, 0.85)";
    ctx.font = "600 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ENEMY ENTRY", 0, 32);

    ctx.restore();
  }

  private drawBase(ctx: CanvasRenderingContext2D, pos: Vec2) {
    const t = this.animTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const danger = this.lives <= 5;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    const ringA = danger ? 200 : 180;
    const ringB = danger ? 100 : 200;
    const ringC = danger ? 100 : 220;
    const accent = danger ? "#c45c5c" : "#c8d0dc";
    const accentDim = danger ? "#7a3030" : "#6a7588";

    const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 38);
    glow.addColorStop(0, `rgba(${ringA}, ${ringB}, ${ringC}, ${0.4 + pulse * 0.15})`);
    glow.addColorStop(0.5, `rgba(${ringA}, ${ringB}, ${ringC}, 0.14)`);
    glow.addColorStop(1, `rgba(${ringA}, ${ringB}, ${ringC}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 3; i >= 1; i--) {
      const r = 12 + i * 6 + pulse * 1.5;
      ctx.strokeStyle =
        i === 1
          ? accent
          : `rgba(${ringA}, ${ringB}, ${ringC}, ${0.25 + i * 0.12})`;
      ctx.lineWidth = i === 1 ? 2.5 : 1.75;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#1a1c22";
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(14, -4);
    ctx.lineTo(14, 12);
    ctx.lineTo(-14, 12);
    ctx.lineTo(-14, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    const keep = getSprite("base");
    if (keep) {
      ctx.drawImage(keep, -24, -28, 48, 48);
    }

    ctx.fillStyle = accentDim;
    for (const bx of [-10, -3, 4]) {
      ctx.fillRect(bx, -18, 6, 5);
    }

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(7, -1);
    ctx.lineTo(7, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-7, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0c0c0e";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(this.lives), 0, 2);

    this.drawLabelPill(ctx, 0, -36, "BASE", accent, danger ? "#1a0c0c" : "#0e1014");

    ctx.fillStyle = danger ? "rgba(196, 92, 92, 0.9)" : "rgba(180, 195, 215, 0.85)";
    ctx.font = "600 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(danger ? "CRITICAL" : "DEFEND HERE", 0, 34);

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
    const range = TOWERS[t.kind].tiers[t.tier - 1]!.range;
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
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = ok ? def.color : "#c45c5c";
    ctx.fillStyle = ok ? def.color + "22" : "#c45c5c22";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ok ? def.color : "#c45c5c";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawTower(ctx: CanvasRenderingContext2D, t: Tower, selected: boolean) {
    const def = TOWERS[t.kind];
    ctx.save();
    ctx.translate(t.x, t.y);

    if (this.frontShift > 0) {
      const pulse = 0.45 + 0.55 * Math.sin(this.animTime * 6);
      ctx.strokeStyle = t.covering
        ? `rgba(90, 158, 111, ${0.35 + pulse * 0.5})`
        : `rgba(212, 160, 64, ${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let layer = 0; layer < t.tier; layer++) {
      const r = 16 + layer * 3;
      ctx.strokeStyle = layer === t.tier - 1 ? def.color : def.colorDim;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.28 + layer * 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const sprite = towerSprite(t.kind);
    if (sprite) {
      const s = 38 + t.tier * 2;
      ctx.drawImage(sprite, -s / 2, -s / 2 - 4, s, s);
    } else {
      ctx.fillStyle = "#1c1c22";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      ctx.strokeStyle = "#f4f4f5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.frontShift > 0 && !t.covering) {
      ctx.fillStyle = "rgba(212,160,64,0.95)";
      ctx.font = "700 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OFF PATH", 0, 24);
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

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const def = ENEMIES[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(e.hitFlash * 40) * 0.45;

    const hasStrength = e.buffs.some((b) => BUFFS[b.id].polarity === "strength");
    const hasWeakness = e.buffs.some((b) => BUFFS[b.id].polarity === "weakness");
    if (hasStrength) {
      ctx.strokeStyle = "rgba(90,158,111,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (hasWeakness) {
      ctx.strokeStyle = "rgba(196,92,92,0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const sprite = enemySprite(e.kind);
    const size = def.isBoss ? 46 : e.radius * 2.8;
    if (sprite) {
      ctx.drawImage(sprite, -size / 2, -size / 2 - 2, size, size);
    } else {
      ctx.fillStyle = e.hitFlash > 0.05 ? "#f4f4f5" : def.color;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = TOWERS[e.armor]?.color ?? "#a1a1aa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();

    const bw = Math.max(22, size * 0.85);
    const bh = 3;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-bw / 2, -size / 2 - 8, bw, bh);
    ctx.fillStyle = pct > 0.4 ? "#5a9e6f" : "#c45c5c";
    ctx.fillRect(-bw / 2, -size / 2 - 8, bw * pct, bh);

    if (e.slowTimer > 0) {
      ctx.fillStyle = "rgba(91,159,212,0.7)";
      ctx.beginPath();
      ctx.arc(size / 2 - 4, size / 2 - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawFrontShift(ctx: CanvasRenderingContext2D) {
    const fade = Math.min(1, this.frontShift / 0.6, (4.2 - this.frontShift) / 0.45);
    const mid = (COLS * CELL) / 2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(8,8,12,0.62)";
    ctx.fillRect(mid - 210, 10, 420, 50);
    ctx.strokeStyle = "rgba(212,196,160,0.4)";
    ctx.strokeRect(mid - 210, 10, 420, 50);
    ctx.fillStyle = "#e8e0d0";
    ctx.font = "700 14px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("THE FRONT SHIFTS", mid, 26);
    ctx.font = "500 11px Segoe UI, sans-serif";
    ctx.fillStyle = "#a8a29a";
    ctx.fillText(
      `${this.coveringCount} still cover the road · ${this.strandedCount} now inland`,
      mid,
      44,
    );
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
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
          const sz = Math.max(18, Math.min(110, p.s * (e.kind === "boss" ? 1.35 : 1.05)));
          ctx.save();
          if (e.hitFlash > 0) ctx.globalAlpha = 0.65 + Math.sin(e.hitFlash * 40) * 0.35;
          if (spr) ctx.drawImage(spr, p.x - sz / 2, p.y - sz * 0.95, sz, sz);
          else {
            ctx.fillStyle = ENEMIES[e.kind].color;
            ctx.beginPath();
            ctx.arc(p.x, p.y - sz * 0.4, sz * 0.28, 0, Math.PI * 2);
            ctx.fill();
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
      const mul = this.damageMultiplier(cam.kind, tracked);
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
