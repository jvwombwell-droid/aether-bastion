import { describe, expect, it } from "vitest";
import { generatePathCells, keepFootprint, pickKeepOrigin } from "./mapgen";

describe("generatePathCells", () => {
  it("never enters blocked tower cells", () => {
    const blocked: Array<[number, number]> = [
      [4, 4],
      [5, 6],
      [10, 7],
      [16, 3],
    ];
    const seeds = [1, 42, 99, 12345, 0x85ebca6b];
    for (const seed of seeds) {
      const path = generatePathCells(seed, blocked);
      const hits = path.filter(([c, r]) =>
        blocked.some(([bc, br]) => bc === c && br === r),
      );
      expect(hits, `seed ${seed}`).toEqual([]);
      expect(path.length).toBeGreaterThan(1);
    }
  });

  it("with a keep, ends at the door and never walks keep cells", () => {
    const keep = keepFootprint(0, 0);
    const seeds = [1, 42, 99, 777, 0x85ebca6b];
    for (const seed of seeds) {
      const path = generatePathCells(seed, [], keep);
      const end = path[path.length - 1]!;
      expect(end, `seed ${seed} door`).toEqual(keep.door);
      const hits = path.filter(([c, r]) =>
        keep.cells.some(([kc, kr]) => kc === c && kr === r),
      );
      expect(hits, `seed ${seed} keep`).toEqual([]);
    }
  });

  it("still ends at the door when avoiding a cluster beside it", () => {
    const keep = keepFootprint(0, 0);
    const avoid: Array<[number, number]> = [
      [4, 1],
      [5, 1],
      [4, 2],
      [5, 2],
    ];
    const seeds = [1, 42, 99];
    for (const seed of seeds) {
      const path = generatePathCells(seed, avoid, keep, avoid);
      expect(path[path.length - 1], `seed ${seed} door`).toEqual(keep.door);
      const hits = path.filter(([c, r]) =>
        avoid.some(([ac, ar]) => ac === c && ar === r),
      );
      expect(hits, `seed ${seed} towers`).toEqual([]);
    }
  });
});

describe("pickKeepOrigin", () => {
  it("picks a 2×2 corner", () => {
    for (const seed of [1, 2, 3, 99, 1000]) {
      const [c, r] = pickKeepOrigin(seed);
      const keep = keepFootprint(c, r);
      expect(keep.cells).toHaveLength(4);
      expect(keep.door[0]).toBeGreaterThanOrEqual(0);
      expect(keep.door[1]).toBeGreaterThanOrEqual(0);
    }
  });
});
