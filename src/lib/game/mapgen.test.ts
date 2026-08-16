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
});
