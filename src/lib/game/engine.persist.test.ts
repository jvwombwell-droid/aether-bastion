import { describe, expect, it } from "vitest";
import { START_GOLD } from "./config";
import { GameEngine } from "./engine";

describe("GameEngine persist", () => {
  it("export then import keeps level gold and towers", () => {
    const a = new GameEngine();
    a.reset();
    const cell = a.cells.flat().find((c) => c.buildable && !c.path && !c.occupied);
    expect(cell).toBeTruthy();
    if (!cell) return;
    a.setPlacement("ember");
    expect(a.tryPlace(cell.col, cell.row)).toBe(true);

    const saved = a.exportRun();
    expect(saved).not.toBeNull();
    if (!saved) return;

    const b = new GameEngine();
    expect(b.importRun(saved)).toBe(true);
    expect(b.level).toBe(1);
    expect(b.gold).toBe(START_GOLD - 55);
    expect(b.towers).toHaveLength(1);
    expect(b.towers[0]?.kind).toBe("ember");
    expect(b.towers[0]?.col).toBe(cell.col);
    expect(b.towers[0]?.row).toBe(cell.row);
    expect(b.waveActive).toBe(false);
  });
});
