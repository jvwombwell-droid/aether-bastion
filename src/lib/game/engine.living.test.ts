import { describe, expect, it } from "vitest";
import { START_GOLD, cellCenter, midShiftAfterWave, towerRangeFor, wellIncome } from "./config";
import { GameEngine } from "./engine";
import { keepFootprint } from "./mapgen";

function placeOnBuildable(engine: GameEngine, kind: "ember" | "frost" | "volt" | "iron" = "ember") {
  const cell = engine.cells.flat().find((c) => c.buildable && !c.path && !c.occupied && !c.keep);
  expect(cell).toBeTruthy();
  if (!cell) return null;
  engine.setPlacement(kind);
  expect(engine.tryPlace(cell.col, cell.row)).toBe(true);
  return engine.towers[engine.towers.length - 1]!;
}

const CARDINALS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Path-adjacent buildable tiles that actually cover the live road. */
function coveringPathNeighbors(engine: GameEngine) {
  const range = towerRangeFor("ember", 1, "battery");
  const r2 = range * range;
  const seen = new Set<string>();
  const out: Array<{ col: number; row: number }> = [];
  for (const [c, r] of engine.pathCells) {
    for (const [dc, dr] of CARDINALS) {
      const nc = c + dc;
      const nr = r + dr;
      const cell = engine.cells[nr]?.[nc];
      if (!cell || !cell.buildable || cell.occupied || cell.path || cell.keep) continue;
      const k = `${nc},${nr}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const pos = cellCenter(nc, nr);
      const covers = engine.pathPoints.some((p) => {
        const dx = pos.x - p.x;
        const dy = pos.y - p.y;
        return dx * dx + dy * dy <= r2;
      });
      if (covers) out.push({ col: nc, row: nr });
    }
  }
  return out;
}

function pickSpread(
  spots: Array<{ col: number; row: number }>,
  count: number,
): Array<{ col: number; row: number }> {
  if (spots.length === 0) return [];
  const n = Math.min(count, spots.length);
  const chosen: Array<{ col: number; row: number }> = [];
  const take = (spot: { col: number; row: number }) => {
    if (chosen.some((s) => s.col === spot.col && s.row === spot.row)) return;
    chosen.push(spot);
  };
  if (n === 1) {
    take(spots[Math.floor(spots.length / 2)]!);
    return chosen;
  }
  for (let i = 0; i < n; i++) {
    take(spots[Math.round((i * (spots.length - 1)) / (n - 1))]!);
  }
  for (const s of spots) {
    if (chosen.length >= count) break;
    take(s);
  }
  return chosen.slice(0, count);
}

function placeCoveringAlongPath(engine: GameEngine, count: number) {
  const spots = pickSpread(coveringPathNeighbors(engine), count);
  expect(spots.length, "path-adjacent covering tiles").toBeGreaterThanOrEqual(count);
  for (const s of spots) {
    engine.setPlacement("ember");
    expect(engine.tryPlace(s.col, s.row)).toBe(true);
  }
  expect(engine.towers).toHaveLength(count);
  expect(engine.towers.every((t) => t.covering)).toBe(true);
}

function fireMidShift(engine: GameEngine) {
  const after = midShiftAfterWave(engine.level);
  engine.wave = after - 1;
  engine.emptyWaveForTest();
  engine.update(0.2);
  expect(engine.wave).toBe(after);
  expect(engine.midShiftDone).toBe(true);
}

/** First covering path-neighbor walking spawn → door (spawn-side gun). */
function placeCoveringNearSpawn(engine: GameEngine) {
  const spots = coveringPathNeighbors(engine);
  expect(spots.length, "spawn-side covering tile").toBeGreaterThanOrEqual(1);
  const spot = spots[0]!;
  engine.setPlacement("ember");
  expect(engine.tryPlace(spot.col, spot.row)).toBe(true);
  expect(engine.towers).toHaveLength(1);
  expect(engine.towers[0]?.covering).toBe(true);
}

function placeClosestToDoor(engine: GameEngine, count: number) {
  const keep = keepFootprint(engine.keepOrigin[0], engine.keepOrigin[1]);
  const [dc, dr] = keep.door;
  const spots: Array<{ col: number; row: number; dist: number }> = [];
  for (const row of engine.cells) {
    for (const cell of row) {
      if (!cell.buildable || cell.occupied || cell.path || cell.keep) continue;
      spots.push({
        col: cell.col,
        row: cell.row,
        dist: Math.abs(cell.col - dc) + Math.abs(cell.row - dr),
      });
    }
  }
  spots.sort((a, b) => a.dist - b.dist || a.col - b.col || a.row - b.row);
  expect(spots.length, "buildable tiles near door").toBeGreaterThanOrEqual(count);
  for (const s of spots.slice(0, count)) {
    engine.setPlacement("ember");
    expect(engine.tryPlace(s.col, s.row)).toBe(true);
  }
  expect(engine.towers).toHaveLength(count);
}

function doorPosOf(engine: GameEngine) {
  const keep = keepFootprint(engine.keepOrigin[0], engine.keepOrigin[1]);
  return { keep, pos: cellCenter(keep.door[0], keep.door[1]) };
}

function towersCoverDoorCell(engine: GameEngine): boolean {
  const { pos } = doorPosOf(engine);
  const range = towerRangeFor("ember", 1, "battery");
  const r2 = range * range;
  return engine.towers.every((t) => {
    const dx = t.x - pos.x;
    const dy = t.y - pos.y;
    return dx * dx + dy * dy <= r2;
  });
}

describe("living keep", () => {
  it("path ends at the keep door and keep tiles are not buildable", () => {
    const e = new GameEngine();
    e.reset();
    const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
    const end = e.pathCells[e.pathCells.length - 1]!;
    expect(end).toEqual(keep.door);
    for (const [c, r] of keep.cells) {
      const cell = e.cells[r]![c]!;
      expect(cell.keep).toBe(true);
      expect(cell.buildable).toBe(false);
      e.setPlacement("ember");
      expect(e.tryPlace(c, r)).toBe(false);
    }
  });

  it("shifts the First Watch road after wave 2 clears", () => {
    const e = new GameEngine();
    e.reset();
    expect(e.snapshot().levelName).toBe("First Watch");
    expect(e.snapshot().midShiftAfter).toBe(2);
    expect(e.snapshot().keepDoorTier).toBe(0);
    const before = e.pathCells.map(([c, r]) => `${c},${r}`).join("|");
    fireMidShift(e);
    const after = e.pathCells.map(([c, r]) => `${c},${r}`).join("|");
    expect(after).not.toBe(before);
    const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
    expect(e.pathCells[e.pathCells.length - 1]).toEqual(keep.door);
    expect(e.towers).toHaveLength(0);
    expect(e.wave).toBe(2);
    expect(e.midShiftDone).toBe(true);
  });

  it("keeps the only covering tower covering after the mid-level front shift", () => {
    const seeds = [1, 7, 42, 99, 12345];
    for (const seed of seeds) {
      const e = new GameEngine();
      e.resetWithSeed(seed);
      placeCoveringAlongPath(e, 1);
      fireMidShift(e);
      const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} door`).toEqual(keep.door);
      expect(e.towers, `seed ${seed} count`).toHaveLength(1);
      expect(e.towers[0]?.covering, `seed ${seed} covering`).toBe(true);
      expect(e.coveringCount, `seed ${seed} coveringCount`).toBe(1);
      expect(e.strandedCount, `seed ${seed} stranded`).toBe(0);
    }
  });

  it("keeps a spawn-side covering tower covering after the mid-level front shift", () => {
    const seeds = [1, 7, 42, 99, 12345];
    for (const seed of seeds) {
      const e = new GameEngine();
      e.resetWithSeed(seed);
      placeCoveringNearSpawn(e);
      fireMidShift(e);
      const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} door`).toEqual(keep.door);
      expect(e.towers[0]?.covering, `seed ${seed} covering`).toBe(true);
      expect(e.coveringCount, `seed ${seed} coveringCount`).toBe(1);
      expect(e.strandedCount, `seed ${seed} stranded`).toBe(0);
    }
  });

  it("strands at least one tower and leaves at least one covering after the mid-level shift", () => {
    const seeds = [1, 7, 42, 99, 12345];
    for (const seed of seeds) {
      const e = new GameEngine();
      e.resetWithSeed(seed);
      placeCoveringAlongPath(e, 4);
      fireMidShift(e);
      const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} door`).toEqual(keep.door);
      expect(e.strandedCount, `seed ${seed} stranded`).toBeGreaterThanOrEqual(1);
      expect(e.coveringCount, `seed ${seed} covering`).toBeGreaterThanOrEqual(1);
    }
  });

  it("converts a tower the mid-shift actually left inland", () => {
    const e = new GameEngine();
    e.resetWithSeed(42);
    placeCoveringAlongPath(e, 4);
    fireMidShift(e);
    expect(e.strandedCount).toBeGreaterThanOrEqual(1);
    const inland = e.towers.find((t) => t.covering === false);
    expect(inland, "engine-state inland tower").toBeTruthy();
    if (!inland) return;
    e.selectedTowerId = inland.id;
    expect(e.convertSelected("well")).toBe(true);
    expect(inland.role).toBe("well");
  });

  it("keeps door-hugging batteries covering after mid-shift and level-shift", () => {
    const seeds = [1, 7, 42];
    for (const seed of seeds) {
      const e = new GameEngine();
      e.resetWithSeed(seed);
      placeClosestToDoor(e, 4);
      fireMidShift(e);
      const { keep } = doorPosOf(e);
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} mid door`).toEqual(keep.door);
      expect(e.coveringCount, `seed ${seed} mid covering`).toBeGreaterThanOrEqual(1);
      if (towersCoverDoorCell(e)) {
        expect(e.coveringCount, `seed ${seed} mid door-huggers`).toBe(4);
        expect(e.strandedCount, `seed ${seed} mid inland`).toBe(0);
      }

      e.phase = "levelclear";
      e.continueAfterLevelClear();
      expect(e.level, `seed ${seed} level`).toBe(2);
      expect(e.phase, `seed ${seed} phase`).toBe("playing");
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} level door`).toEqual(keep.door);
      expect(e.coveringCount, `seed ${seed} level covering`).toBeGreaterThanOrEqual(1);
      if (towersCoverDoorCell(e)) {
        expect(e.coveringCount, `seed ${seed} level door-huggers`).toBe(4);
      }
    }
  });

  it("holds the front-shift turn until the next wave starts", () => {
    const e = new GameEngine();
    e.resetWithSeed(42);
    placeCoveringAlongPath(e, 4);
    fireMidShift(e);
    expect(e.shiftHold).toBe(true);
    expect(e.selectedKeep).toBe(true);
    expect(e.snapshot().shiftHold).toBe(true);
    e.update(5);
    expect(e.shiftHold).toBe(true);
    expect(e.message ?? "").toMatch(/convert inland/i);
    e.startWave();
    expect(e.shiftHold).toBe(false);
    expect(e.waveActive).toBe(true);
  });

  it("converts an inland tower to a well and will not sell it", () => {
    const e = new GameEngine();
    e.reset();
    const tower = placeOnBuildable(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    tower.covering = false;
    e.selectedTowerId = tower.id;
    expect(e.convertSelected("well")).toBe(true);
    expect(e.towers[0]?.role).toBe("well");
    expect(e.sellSelected()).toBe(false);
    expect(e.towers).toHaveLength(1);
  });

  it("will not convert a covering battery", () => {
    const e = new GameEngine();
    e.reset();
    const tower = placeOnBuildable(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    tower.covering = true;
    e.selectedTowerId = tower.id;
    expect(e.convertSelected("watch")).toBe(false);
    expect(e.towers[0]?.role).toBe("battery");
  });

  it("pays well income on wave clear", () => {
    const e = new GameEngine();
    e.reset();
    const tower = placeOnBuildable(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    tower.covering = false;
    e.selectedTowerId = tower.id;
    e.convertSelected("well");
    const goldBefore = e.gold;
    e.wave = 0;
    e.emptyWaveForTest();
    e.update(0.2);
    expect(e.gold).toBeGreaterThanOrEqual(goldBefore + wellIncome(1));
  });

  it("round-trips keep and tower role through persist", () => {
    const a = new GameEngine();
    a.reset();
    const tower = placeOnBuildable(a, "frost");
    expect(tower).toBeTruthy();
    if (!tower) return;
    tower.covering = false;
    a.selectedTowerId = tower.id;
    a.convertSelected("watch");
    a.keepFortify = 1;
    const saved = a.exportRun();
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.version).toBe(4);
    expect(saved.keepDoorTier).toBe(0);
    expect(saved.towers[0]?.role).toBe("watch");

    const b = new GameEngine();
    expect(b.importRun(saved)).toBe(true);
    expect(b.keepOrigin).toEqual(a.keepOrigin);
    expect(b.towers[0]?.role).toBe("watch");
    expect(b.keepFortify).toBe(1);
    expect(b.gold).toBe(START_GOLD - 50);
  });
});
