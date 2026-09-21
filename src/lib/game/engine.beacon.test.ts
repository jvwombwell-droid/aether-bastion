import { describe, expect, it } from "vitest";
import { cellCenter, midShiftAfterWave, towerRangeFor } from "./config";
import { GameEngine } from "./engine";
import { keepFootprint } from "./mapgen";

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

function farthestFromDoor(engine: GameEngine) {
  const keep = keepFootprint(engine.keepOrigin[0], engine.keepOrigin[1]);
  const door = cellCenter(keep.door[0], keep.door[1]);
  let best = engine.towers[0]!;
  let bestD = -1;
  for (const t of engine.towers) {
    const d = (t.x - door.x) ** 2 + (t.y - door.y) ** 2;
    if (d > bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

describe("beacon pull", () => {
  it("bends the mid-level road into T1 range of the farthest beacon", () => {
    const pull = towerRangeFor("ember", 1, "battery");
    const pull2 = pull * pull;
    for (const seed of [1, 7, 42, 99]) {
      const e = new GameEngine();
      e.resetWithSeed(seed);
      placeCoveringAlongPath(e, 4);
      const beacon = farthestFromDoor(e);
      beacon.covering = false;
      e.selectedTowerId = beacon.id;
      expect(e.convertSelected("beacon"), `seed ${seed} convert`).toBe(true);
      expect(beacon.role, `seed ${seed} role`).toBe("beacon");

      fireMidShift(e);

      const keep = keepFootprint(e.keepOrigin[0], e.keepOrigin[1]);
      expect(e.pathCells[e.pathCells.length - 1], `seed ${seed} door`).toEqual(keep.door);
      const near = e.pathPoints.some((p) => {
        const dx = p.x - beacon.x;
        const dy = p.y - beacon.y;
        return dx * dx + dy * dy <= pull2;
      });
      expect(near, `seed ${seed} beacon range`).toBe(true);
      expect(
        e.towers.some((t) => t.role === "battery" && t.covering),
        `seed ${seed} battery covering`,
      ).toBe(true);
    }
  });

  it("without a beacon, strands at least one battery and keeps one covering", () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
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
});
