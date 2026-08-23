import { describe, expect, it } from "vitest";
import { GameEngine } from "./engine";
import type { TowerRole } from "./types";

function placeInland(engine: GameEngine) {
  const cell = engine.cells.flat().find((c) => c.buildable && !c.path && !c.occupied && !c.keep);
  expect(cell).toBeTruthy();
  if (!cell) return null;
  engine.setPlacement("ember");
  expect(engine.tryPlace(cell.col, cell.row)).toBe(true);
  const tower = engine.towers[engine.towers.length - 1]!;
  tower.covering = false;
  engine.selectedTowerId = tower.id;
  return tower;
}

describe("convertSelected", () => {
  it("converts an inland tower to a beacon", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    const tower = placeInland(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    expect(e.convertSelected("beacon")).toBe(true);
    expect(tower.role).toBe("beacon");
    expect(e.message).toMatch(/Beacon/i);
    expect(e.sellSelected()).toBe(false);
    expect(e.towers).toHaveLength(1);
  });

  it("converts inland towers through watch, well, and beacon", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    const tower = placeInland(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    const roles: TowerRole[] = ["watch", "well", "beacon"];
    for (const role of roles) {
      expect(e.convertSelected(role)).toBe(true);
      expect(tower.role).toBe(role);
    }
  });

  it("will not convert a covering battery to a beacon", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    const tower = placeInland(e);
    expect(tower).toBeTruthy();
    if (!tower) return;
    tower.covering = true;
    expect(e.convertSelected("beacon")).toBe(false);
    expect(tower.role).toBe("battery");
  });
});
