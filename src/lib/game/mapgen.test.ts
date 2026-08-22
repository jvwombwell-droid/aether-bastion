import { describe, expect, it } from "vitest";
import { generatePathCells } from "./mapgen";

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

  it("pins the keep when asked and still lets the front move", () => {
    const keep: [number, number] = [21, 7];
    const blocked: Array<[number, number]> = [
      [10, 4],
      [11, 5],
      [12, 6],
    ];
    const a = generatePathCells(11, blocked, keep);
    const b = generatePathCells(77, blocked, keep);
    expect(a.at(-1)).toEqual(keep);
    expect(b.at(-1)).toEqual(keep);
    expect(a[0]).not.toEqual(keep);
    // Different seeds should be able to pick a different spawn
    const spawnMoved = a[0]![0] !== b[0]![0] || a[0]![1] !== b[0]![1];
    expect(spawnMoved).toBe(true);
    const hits = a.filter(([c, r]) => blocked.some(([bc, br]) => bc === c && br === r));
    expect(hits).toEqual([]);
  });
});
