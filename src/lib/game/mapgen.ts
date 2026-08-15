import { CELL, COLS, ROWS, cellCenter } from "./config";

/** Mulberry32 seeded PRNG — deterministic per level seed. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function key(c: number, r: number) {
  return `${c},${r}`;
}

function inBounds(c: number, r: number) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS;
}

type Edge = "left" | "right" | "top" | "bottom";

function edgeCells(edge: Edge, blocked: Set<string>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (edge === "left") {
    for (let r = 1; r < ROWS - 1; r++) if (!blocked.has(key(0, r))) out.push([0, r]);
  } else if (edge === "right") {
    for (let r = 1; r < ROWS - 1; r++) if (!blocked.has(key(COLS - 1, r))) out.push([COLS - 1, r]);
  } else if (edge === "top") {
    for (let c = 1; c < COLS - 1; c++) if (!blocked.has(key(c, 0))) out.push([c, 0]);
  } else {
    for (let c = 1; c < COLS - 1; c++) if (!blocked.has(key(c, ROWS - 1))) out.push([c, ROWS - 1]);
  }
  if (!out.length) {
    const corners: Array<[number, number]> = [
      [0, 0],
      [COLS - 1, 0],
      [0, ROWS - 1],
      [COLS - 1, ROWS - 1],
    ];
    for (const [c, r] of corners) {
      if (
        !blocked.has(key(c, r)) &&
        (edge === "left"
          ? c === 0
          : edge === "right"
            ? c === COLS - 1
            : edge === "top"
              ? r === 0
              : r === ROWS - 1)
      ) {
        out.push([c, r]);
      }
    }
  }
  return out;
}

/**
 * Weighted random-cost pathfind (Dijkstra). Meanders; never enters blocked.
 */
function windyPath(
  start: [number, number],
  goal: [number, number],
  blocked: Set<string>,
  rng: () => number,
  wind: number,
): Array<[number, number]> | null {
  const sk = key(start[0], start[1]);
  const gk = key(goal[0], goal[1]);
  if (blocked.has(sk) || blocked.has(gk)) return null;

  const edgeCost = (a: string, b: string) => {
    let h = 2166136261;
    const s = a + ">" + b;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = ((h >>> 0) % 1000) / 1000;
    return 1 + u * wind * 4;
  };

  const dist = new Map<string, number>();
  const parent = new Map<string, string | null>();
  dist.set(sk, 0);
  parent.set(sk, null);

  type Node = { k: string; c: number; r: number; d: number };
  const open: Node[] = [{ k: sk, c: start[0], r: start[1], d: 0 }];

  while (open.length) {
    open.sort((a, b) => a.d - b.d);
    const cur = open.shift()!;
    if (cur.k === gk) break;
    if ((dist.get(cur.k) ?? Infinity) < cur.d) continue;

    const neigh = DIRS.slice();
    shuffleInPlace(neigh, rng);
    for (const [dc, dr] of neigh) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      if (!inBounds(nc, nr)) continue;
      const nk = key(nc, nr);
      if (blocked.has(nk)) continue;
      const nd = cur.d + edgeCost(cur.k, nk);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        parent.set(nk, cur.k);
        open.push({ k: nk, c: nc, r: nr, d: nd });
      }
    }
  }

  if (!parent.has(gk)) return null;

  const path: Array<[number, number]> = [];
  let cur: string | null = gk;
  while (cur) {
    const [cs, rs] = cur.split(",").map(Number) as [number, number];
    path.push([cs, rs]);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

function dedupeConsecutive(path: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

function uniqueCount(path: Array<[number, number]>) {
  return new Set(path.map(([c, r]) => key(c, r))).size;
}

/** Path limited to ~30% of free (non-tower) tiles. */
export const PATH_COVERAGE_MIN = 0.27;
export const PATH_COVERAGE_MAX = 0.3;

function coverageBounds(blocked: Set<string>) {
  const available = Math.max(20, COLS * ROWS - blocked.size);
  const minLen = Math.floor(available * PATH_COVERAGE_MIN);
  const maxLen = Math.floor(available * PATH_COVERAGE_MAX);
  return { available, minLen, maxLen };
}

/**
 * Highly randomized path that never crosses permanent tower cells.
 * Covers at most 30% of available tiles. Spawn/base on varying edges.
 */
export function generatePathCells(
  seed: number,
  blockedCells: Array<[number, number]> = [],
): Array<[number, number]> {
  const blocked = new Set(blockedCells.map(([c, r]) => key(c, r)));
  const { minLen, maxLen } = coverageBounds(blocked);

  let best: Array<[number, number]> | null = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 72; attempt++) {
    const rng = makeRng((seed + attempt * 0x9e3779b9) >>> 0);
    const mid = (minLen + maxLen) / 2;
    // Fewer waypoints to stay near 30% coverage
    const estWp = Math.max(2, Math.min(6, Math.round(mid / 14 + (rng() - 0.5) * 2)));
    const path = tryOnce(blocked, rng, estWp, minLen, maxLen);
    if (!path) continue;
    if (path.some(([c, r]) => blocked.has(key(c, r)))) continue;

    const u = uniqueCount(path);
    if (u >= minLen && u <= maxLen) {
      return dedupeConsecutive(path);
    }
    const score = u < minLen ? minLen - u : u > maxLen ? u - maxLen : 0;
    if (score < bestScore) {
      bestScore = score;
      best = path;
    }
  }

  if (best) {
    const rng = makeRng(seed ^ 0xabcddcba);
    const adjusted = fitCoverage(best, blocked, rng, minLen, maxLen);
    if (adjusted) return adjusted;
  }

  return emergencyPath(seed, blocked, minLen, maxLen);
}

function tryOnce(
  blocked: Set<string>,
  rng: () => number,
  targetWp: number,
  minLen: number,
  maxLen: number,
): Array<[number, number]> | null {
  const edges: Edge[] = ["left", "right", "top", "bottom"];
  shuffleInPlace(edges, rng);
  const spawnEdge = edges[0]!;
  const opposite: Record<Edge, Edge> = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  };
  const endEdge: Edge =
    rng() < 0.65
      ? opposite[spawnEdge]
      : edges.filter((e) => e !== spawnEdge)[Math.floor(rng() * 3)]!;

  const spawnPool = edgeCells(spawnEdge, blocked);
  const endPool = edgeCells(endEdge, blocked);
  if (!spawnPool.length || !endPool.length) return null;

  const spawn = spawnPool[Math.floor(rng() * spawnPool.length)]!;
  let base = endPool[Math.floor(rng() * endPool.length)]!;
  for (let i = 0; i < 12; i++) {
    const cand = endPool[Math.floor(rng() * endPool.length)]!;
    if (Math.abs(cand[0] - spawn[0]) + Math.abs(cand[1] - spawn[1]) >= 12) {
      base = cand;
      break;
    }
  }

  const free: Array<[number, number]> = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!blocked.has(key(c, r))) free.push([c, r]);
    }
  }
  shuffleInPlace(free, rng);

  const waypoints: Array<[number, number]> = [];
  const minSep = targetWp >= 5 ? 2 : 3;
  for (const cell of free) {
    if (waypoints.length >= targetWp) break;
    const tooClose = [...waypoints, spawn, base].some(
      ([wc, wr]) => Math.abs(wc - cell[0]) + Math.abs(wr - cell[1]) < minSep,
    );
    if (tooClose) continue;
    waypoints.push(cell);
  }

  if (rng() < 0.45 && waypoints.length >= 3) {
    const cx = COLS / 2;
    const cy = ROWS / 2;
    waypoints.sort(
      (a, b) =>
        Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
    );
    const spawnAng = Math.atan2(spawn[1] - cy, spawn[0] - cx);
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const a = Math.atan2(waypoints[i]![1] - cy, waypoints[i]![0] - cx);
      const d = Math.abs(a - spawnAng);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    const rotated = [...waypoints.slice(best), ...waypoints.slice(0, best)];
    waypoints.length = 0;
    waypoints.push(...rotated);
  }

  const nodes: Array<[number, number]> = [spawn, ...waypoints, base];
  const wind = 0.45 + rng() * 0.9;
  const full: Array<[number, number]> = [];
  const softBlocked = new Set<string>(blocked);

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    const segBlock = new Set(softBlocked);
    segBlock.delete(key(a[0], a[1]));
    segBlock.delete(key(b[0], b[1]));
    for (const bk of blocked) segBlock.add(bk);

    let segment = windyPath(a, b, segBlock, rng, wind);
    if (!segment) segment = windyPath(a, b, blocked, rng, wind * 0.5);
    if (!segment || segment.length < 2) return null;

    for (let j = i === 0 ? 0 : 1; j < segment.length; j++) {
      full.push(segment[j]!);
      softBlocked.add(key(segment[j]![0], segment[j]![1]));
    }
  }

  const path = dedupeConsecutive(full);
  if (path.some(([c, r]) => blocked.has(key(c, r)))) return null;
  if (uniqueCount(path) > maxLen * 1.35) return null;
  return path;
}

/** Grow (detours) or trim path toward [minLen, maxLen] unique tiles. */
function fitCoverage(
  path: Array<[number, number]>,
  blocked: Set<string>,
  rng: () => number,
  minLen: number,
  maxLen: number,
): Array<[number, number]> | null {
  let cur = dedupeConsecutive(path);
  let u = uniqueCount(cur);

  let guard = 0;
  while (u < minLen && guard++ < 40) {
    const used = new Set(cur.map(([c, r]) => key(c, r)));
    const free: Array<[number, number]> = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = key(c, r);
        if (!blocked.has(k) && !used.has(k)) free.push([c, r]);
      }
    }
    if (!free.length) break;
    shuffleInPlace(free, rng);
    const detour = free[0]!;
    if (cur.length < 4) break;
    const idx = 1 + Math.floor(rng() * (cur.length - 2));
    const a = cur[idx]!;
    const b = cur[Math.min(idx + 1, cur.length - 1)]!;
    const toDetour = windyPath(a, detour, blocked, rng, 1.0);
    const fromDetour = windyPath(detour, b, blocked, rng, 1.0);
    if (!toDetour || !fromDetour) continue;
    const grown = [
      ...cur.slice(0, idx),
      ...toDetour,
      ...fromDetour.slice(1),
      ...cur.slice(idx + 1),
    ];
    cur = dedupeConsecutive(grown);
    u = uniqueCount(cur);
    if (u > maxLen) break;
  }

  u = uniqueCount(cur);
  guard = 0;
  while (u > maxLen && guard++ < 28) {
    if (cur.length < 8) break;
    const i0 = 1 + Math.floor(rng() * Math.floor(cur.length * 0.3));
    const i1 = Math.min(
      cur.length - 2,
      i0 + 3 + Math.floor(rng() * Math.floor(cur.length * 0.25)),
    );
    const a = cur[i0]!;
    const b = cur[i1]!;
    const short = windyPath(a, b, blocked, rng, 0.1);
    if (!short || short.length >= i1 - i0) continue;
    cur = dedupeConsecutive([...cur.slice(0, i0), ...short, ...cur.slice(i1 + 1)]);
    u = uniqueCount(cur);
  }

  u = uniqueCount(cur);
  if (u >= minLen && u <= maxLen && !cur.some(([c, r]) => blocked.has(key(c, r)))) {
    return cur;
  }
  // Prefer undershoot over exceeding 30%
  if (u >= minLen - 2 && u <= maxLen && !cur.some(([c, r]) => blocked.has(key(c, r)))) {
    return cur;
  }
  if (u > maxLen) {
    // Hard trim: take a shortened route from start to end using low wind
    const short = windyPath(cur[0]!, cur[cur.length - 1]!, blocked, rng, 0.05);
    if (short && uniqueCount(short) <= maxLen && uniqueCount(short) >= Math.min(minLen, short.length)) {
      // If still short of min, accept if <= max
      if (uniqueCount(short) <= maxLen) return short;
    }
  }
  return null;
}

function emergencyPath(
  seed: number,
  blocked: Set<string>,
  minLen: number,
  maxLen: number,
): Array<[number, number]> {
  const rng = makeRng(seed ^ 0xc0ffee);
  const free: Array<[number, number]> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!blocked.has(key(c, r))) free.push([c, r]);
    }
  }
  if (free.length < 2) return [[0, 0], [1, 0]];
  shuffleInPlace(free, rng);

  const edges: Edge[] = ["left", "right", "top", "bottom"];
  shuffleInPlace(edges, rng);
  const sp = edgeCells(edges[0]!, blocked);
  const ep = edgeCells(edges[1] === edges[0] ? edges[2]! : edges[1]!, blocked);
  const spawn = sp[0] ?? free[0]!;
  const base = ep[0] ?? free[free.length - 1]!;

  const wps = free.filter(
    ([c, r]) =>
      !(c === spawn[0] && r === spawn[1]) && !(c === base[0] && r === base[1]),
  );
  const take = Math.min(5, wps.length);
  const nodes: Array<[number, number]> = [spawn, ...wps.slice(0, take), base];
  const full: Array<[number, number]> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const seg = windyPath(nodes[i]!, nodes[i + 1]!, blocked, rng, 0.6);
    if (!seg) continue;
    for (let j = i === 0 ? 0 : 1; j < seg.length; j++) full.push(seg[j]!);
  }
  const path = dedupeConsecutive(full);
  const fitted = fitCoverage(path, blocked, rng, minLen, maxLen);
  if (fitted && fitted.length >= 2) return fitted;
  const direct = windyPath(spawn, base, blocked, rng, 0.05);
  if (direct && direct.length >= 2) return dedupeConsecutive(direct);
  return gridWalk(spawn, base, blocked) ?? [spawn, base];
}

/** Guaranteed 4-neighbor walk from spawn to base. Never a 2-point lerp. */
function gridWalk(
  start: [number, number],
  goal: [number, number],
  blocked: Set<string>,
): Array<[number, number]> | null {
  const sk = key(start[0], start[1]);
  const gk = key(goal[0], goal[1]);
  if (blocked.has(sk) || blocked.has(gk)) return null;
  const parent = new Map<string, string | null>();
  parent.set(sk, null);
  const q: Array<[number, number]> = [start];
  while (q.length) {
    const [c, r] = q.shift()!;
    if (key(c, r) === gk) break;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(nc, nr)) continue;
      const nk = key(nc, nr);
      if (blocked.has(nk) || parent.has(nk)) continue;
      parent.set(nk, key(c, r));
      q.push([nc, nr]);
    }
  }
  if (!parent.has(gk)) return null;
  const path: Array<[number, number]> = [];
  let cur: string | null = gk;
  while (cur) {
    const [cs, rs] = cur.split(",").map(Number) as [number, number];
    path.push([cs, rs]);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

export function pathCellsToPoints(cells: Array<[number, number]>) {
  return cells.map(([c, r]) => cellCenter(c, r));
}

export function buildPathLengthsFromPoints(points: Array<{ x: number; y: number }>): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(lengths[i - 1]! + d);
  }
  return lengths;
}

export function levelMapSeed(level: number, runSeed: number) {
  return (runSeed ^ Math.imul(level + 1, 0x85ebca6b)) >>> 0;
}

export { CELL };
