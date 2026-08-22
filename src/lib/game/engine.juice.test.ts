import { describe, expect, it } from "vitest";
import { TOWERS } from "./config";
import { GameEngine } from "./engine";

describe("combat juice", () => {
  it("hit emits a ring in the tower color", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.emitHitFxForTest("ember");
    const rings = e.particles.filter((p) => p.kind === "ring");
    expect(rings).toHaveLength(1);
    expect(rings[0]!.color).toBe(TOWERS.ember.color);
    expect(e.particles.length).toBeGreaterThanOrEqual(5);
    expect(e.particles.every((p) => p.color === TOWERS.ember.color)).toBe(true);
  });
});
