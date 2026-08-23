import { describe, expect, it } from "vitest";
import { GameEngine } from "./engine";
import type { Enemy } from "./types";

function runner(partial?: Partial<Enemy>): Enemy {
  return {
    id: 1,
    kind: "runner",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    pathIndex: 0,
    progress: 0,
    speed: 80,
    armor: "frost",
    radius: 10,
    reward: 8,
    alive: true,
    buffs: [],
    slowTimer: 0,
    slowMul: 1,
    hitFlash: 0,
    pathT: 0,
    ...partial,
  };
}

function placeBattery(engine: GameEngine) {
  const cell = engine.cells.flat().find((c) => c.buildable && !c.path && !c.occupied && !c.keep);
  expect(cell).toBeTruthy();
  if (!cell) return null;
  engine.setPlacement("ember");
  expect(engine.tryPlace(cell.col, cell.row)).toBe(true);
  return engine.towers[engine.towers.length - 1]!;
}

describe("slipstream rules", () => {
  it("sprints runners on L3 when no towers are placed", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(3);
    expect(e.effectiveSpeedForTest(runner())).toBe(80 * 1.65);
  });

  it("stops the sprint after placing a First battery", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(3);
    const tower = placeBattery(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    expect(tower.targetMode).toBe("first");
    expect(tower.role).toBe("battery");
    expect(e.effectiveSpeedForTest(runner())).toBe(80);
  });

  it("sprints again when that battery is set to Strong", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(3);
    const tower = placeBattery(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    e.setSelectedTargetMode("strong");
    expect(tower.targetMode).toBe("strong");
    expect(e.effectiveSpeedForTest(runner())).toBe(80 * 1.65);
  });

  it("sprints when that battery is set to Last", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(3);
    const tower = placeBattery(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    e.setSelectedTargetMode("last");
    expect(tower.targetMode).toBe("last");
    expect(e.effectiveSpeedForTest(runner())).toBe(80 * 1.65);
  });

  it("does not sprint runners on L1 even with no towers", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(1);
    expect(e.effectiveSpeedForTest(runner())).toBe(80);
  });

  it("does not sprint a scout on L3", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.beginLevelForTest(3);
    expect(e.effectiveSpeedForTest(runner({ kind: "scout" }))).toBe(80);
  });
});
