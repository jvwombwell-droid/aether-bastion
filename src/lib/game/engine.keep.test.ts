import { describe, expect, it } from "vitest";
import {
  KEEP_DOOR_GUN_COST,
  KEEP_FORTIFY_LIVES,
  KEEP_WELL_COST,
  START_GOLD,
  START_LIVES,
  cellCenter,
  wellIncome,
} from "./config";
import { GameEngine } from "./engine";

function enemyAtDoor(engine: GameEngine) {
  const door = engine.keepSpec().door;
  const pos = cellCenter(door[0], door[1]);
  const along = engine.pathPoints[Math.max(0, engine.pathPoints.length - 2)] ?? pos;
  const dx = along.x - pos.x;
  const dy = along.y - pos.y;
  const len = Math.hypot(dx, dy) || 1;
  engine.enemies.push({
    id: 9001,
    kind: "scout",
    x: pos.x + (dx / len) * 40,
    y: pos.y + (dy / len) * 40,
    hp: 400,
    maxHp: 400,
    pathIndex: Math.max(0, engine.pathPoints.length - 2),
    progress: 0,
    speed: 0,
    armor: "iron",
    radius: 10,
    reward: 1,
    alive: true,
    buffs: [],
    slowTimer: 0,
    slowMul: 1,
    hitFlash: 0,
    pathT: 0.99,
  });
  return pos;
}

describe("keep upgrades", () => {
  it("thicker walls cost 80 then 150 then refuse", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    const gold0 = e.gold;
    expect(e.fortifyKeep()).toBe(true);
    expect(e.gold).toBe(gold0 - 80);
    expect(e.keepFortify).toBe(1);
    expect(e.lives).toBe(START_LIVES + KEEP_FORTIFY_LIVES);
    expect(e.message).toBe(`Thicker walls — +${KEEP_FORTIFY_LIVES} lives`);

    expect(e.fortifyKeep()).toBe(true);
    expect(e.gold).toBe(gold0 - 80 - 150);
    expect(e.keepFortify).toBe(2);
    expect(e.lives).toBe(START_LIVES + KEEP_FORTIFY_LIVES * 2);

    expect(e.fortifyKeep()).toBe(false);
    expect(e.keepFortify).toBe(2);
    expect(e.gold).toBe(gold0 - 80 - 150);
  });

  it("buys a door gun once for 90g", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    expect(e.gold).toBe(START_GOLD - KEEP_DOOR_GUN_COST);
    expect(e.keepDoorGun).toBe(true);
    expect(e.snapshot().keepDoorGun).toBe(true);
    expect(e.towers).toHaveLength(0);
    expect(e.message).toBe("Door gun — the keep fires the last stretch.");
  });

  it("cannot buy a door gun twice", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    const gold = e.gold;
    expect(e.buyKeepDoorGun()).toBe(false);
    expect(e.gold).toBe(gold);
    expect(e.keepDoorGun).toBe(true);
  });

  it("buys a courtyard well once for 75g", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepWell()).toBe(true);
    expect(e.gold).toBe(START_GOLD - KEEP_WELL_COST);
    expect(e.keepWell).toBe(true);
    expect(e.snapshot().keepWell).toBe(true);
    expect(e.message).toBe("Courtyard well — gold each wave.");
    expect(e.buyKeepWell()).toBe(false);
    expect(e.gold).toBe(START_GOLD - KEEP_WELL_COST);
  });

  it("pays keep well 18g on wave clear", () => {
    const control = new GameEngine();
    control.resetWithSeed(1);
    control.emptyWaveForTest();
    control.update(0.2);
    const wavePayout = control.gold - START_GOLD;

    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepWell()).toBe(true);
    const goldAfterBuy = e.gold;
    e.startWave();
    e.emptyWaveForTest();
    e.update(0.2);
    expect(e.gold).toBe(goldAfterBuy + wavePayout + wellIncome(1));
    expect(e.message).toContain("keep well +18g");
  });

  it("door gun fires iron from the keep door", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    const door = enemyAtDoor(e);
    expect(e.fireKeepDoorForTest()).toBe(true);
    const shot = e.projectiles.find((p) => p.alive && p.element === "iron");
    expect(shot).toBeTruthy();
    expect(shot!.x).toBeCloseTo(door.x);
    expect(shot!.y).toBeCloseTo(door.y);
    expect(shot!.damage).toBe(12);
    expect(shot!.splash).toBe(46);
    expect(e.towers.some((t) => t.kind === "iron")).toBe(false);
  });

  it("door gun fires during update from the door", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    const door = enemyAtDoor(e);
    e.update(0.05);
    const shot = e.projectiles.find((p) => p.alive && p.element === "iron");
    expect(shot).toBeTruthy();
    const dist = Math.hypot(shot!.x - door.x, shot!.y - door.y);
    expect(dist).toBeLessThan(20);
  });

  it("round-trips all three keep flags", () => {
    const a = new GameEngine();
    a.resetWithSeed(1);
    expect(a.fortifyKeep()).toBe(true);
    expect(a.buyKeepDoorGun()).toBe(true);
    expect(a.buyKeepWell()).toBe(true);
    const saved = a.exportRun();
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.version).toBe(3);
    expect(saved.keepFortify).toBe(1);
    expect(saved.keepDoorGun).toBe(true);
    expect(saved.keepWell).toBe(true);

    const b = new GameEngine();
    expect(b.importRun(saved)).toBe(true);
    expect(b.keepFortify).toBe(1);
    expect(b.keepDoorGun).toBe(true);
    expect(b.keepWell).toBe(true);
    expect(b.snapshot().keepDoorGun).toBe(true);
    expect(b.snapshot().keepWell).toBe(true);
    expect(b.towers).toHaveLength(0);
  });
});
