import { describe, expect, it } from "vitest";
import {
  KEEP_DOOR_GUN_COST,
  KEEP_FORTIFY_LIVES,
  KEEP_WELL_COST,
  START_GOLD,
  START_LIVES,
  cellCenter,
  keepDoorStats,
  keepDoorUpgradeCost,
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
  it("thicker walls cost 80 then 160 then 240 then refuse", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    e.gold = 80 + 160 + 240 + 10;
    const gold0 = e.gold;
    expect(e.fortifyKeep()).toBe(true);
    expect(e.gold).toBe(gold0 - 80);
    expect(e.keepFortify).toBe(1);
    expect(e.lives).toBe(START_LIVES + KEEP_FORTIFY_LIVES);
    expect(e.message).toBe(`Thicker walls — +${KEEP_FORTIFY_LIVES} lives`);

    expect(e.fortifyKeep()).toBe(true);
    expect(e.gold).toBe(gold0 - 80 - 160);
    expect(e.keepFortify).toBe(2);
    expect(e.lives).toBe(START_LIVES + KEEP_FORTIFY_LIVES * 2);

    expect(e.fortifyKeep()).toBe(true);
    expect(e.gold).toBe(gold0 - 80 - 160 - 240);
    expect(e.keepFortify).toBe(3);
    expect(e.lives).toBe(START_LIVES + KEEP_FORTIFY_LIVES * 3);

    expect(e.fortifyKeep()).toBe(false);
    expect(e.keepFortify).toBe(3);
    expect(e.gold).toBe(gold0 - 80 - 160 - 240);
  });

  it("buys a door gun once for 90g at T1", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    expect(e.gold).toBe(START_GOLD - KEEP_DOOR_GUN_COST);
    expect(e.keepDoorGun).toBe(true);
    expect(e.keepDoorTier).toBe(1);
    expect(e.snapshot().keepDoorGun).toBe(true);
    expect(e.snapshot().keepDoorTier).toBe(1);
    expect(e.towers).toHaveLength(0);
    expect(e.message).toBe("Door gun T1 — the keep fires the last stretch.");
  });

  it("cannot buy a door gun twice", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    const gold = e.gold;
    expect(e.buyKeepDoorGun()).toBe(false);
    expect(e.gold).toBe(gold);
    expect(e.keepDoorGun).toBe(true);
    expect(e.keepDoorTier).toBe(1);
  });

  it("upgradeKeepDoorGun raises the door gun through T3 then refuses", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.upgradeKeepDoorGun()).toBe(false);
    expect(e.keepDoorTier).toBe(0);

    expect(e.buyKeepDoorGun()).toBe(true);
    const t2 = keepDoorUpgradeCost(1);
    const t3 = keepDoorUpgradeCost(2);
    expect(t2).toBe(140);
    expect(t3).toBe(220);
    e.gold = (t2 ?? 0) + (t3 ?? 0) + 10;
    const gold0 = e.gold;

    expect(e.upgradeKeepDoorGun()).toBe(true);
    expect(e.keepDoorTier).toBe(2);
    expect(e.gold).toBe(gold0 - 140);
    expect(e.message).toBe("Door gun → T2 — harder last stretch");

    expect(e.upgradeKeepDoorGun()).toBe(true);
    expect(e.keepDoorTier).toBe(3);
    expect(e.gold).toBe(gold0 - 140 - 220);
    expect(e.message).toBe("Door gun → T3 — harder last stretch");
    expect(keepDoorUpgradeCost(3)).toBeNull();

    expect(e.upgradeKeepDoorGun()).toBe(false);
    expect(e.keepDoorTier).toBe(3);
    expect(e.gold).toBe(gold0 - 140 - 220);
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

  it("pays keep well 34g on wave clear at L1", () => {
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
    const keepPay = wellIncome(2, 1);
    expect(keepPay).toBe(34);
    expect(e.gold).toBe(goldAfterBuy + wavePayout + keepPay);
    expect(e.message).toContain("keep well +34g");
  });

  it("door gun fires iron from the keep door", () => {
    const e = new GameEngine();
    e.resetWithSeed(1);
    expect(e.buyKeepDoorGun()).toBe(true);
    const door = enemyAtDoor(e);
    expect(e.fireKeepDoorForTest()).toBe(true);
    const shot = e.projectiles.find((p) => p.alive && p.element === "iron");
    const stats = keepDoorStats(1, 0, 1);
    expect(shot).toBeTruthy();
    expect(shot!.x).toBeCloseTo(door.x);
    expect(shot!.y).toBeCloseTo(door.y);
    expect(shot!.damage).toBe(stats.damage);
    expect(shot!.splash).toBe(stats.splash);
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

  it("round-trips keep flags including door tier", () => {
    const a = new GameEngine();
    a.resetWithSeed(1);
    a.gold = START_GOLD + 200;
    expect(a.fortifyKeep()).toBe(true);
    expect(a.buyKeepDoorGun()).toBe(true);
    expect(a.upgradeKeepDoorGun()).toBe(true);
    expect(a.buyKeepWell()).toBe(true);
    const saved = a.exportRun();
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.version).toBe(4);
    expect(saved.keepFortify).toBe(1);
    expect(saved.keepDoorGun).toBe(true);
    expect(saved.keepDoorTier).toBe(2);
    expect(saved.keepWell).toBe(true);

    const b = new GameEngine();
    expect(b.importRun(saved)).toBe(true);
    expect(b.keepFortify).toBe(1);
    expect(b.keepDoorGun).toBe(true);
    expect(b.keepDoorTier).toBe(2);
    expect(b.keepWell).toBe(true);
    expect(b.snapshot().keepDoorGun).toBe(true);
    expect(b.snapshot().keepDoorTier).toBe(2);
    expect(b.snapshot().keepWell).toBe(true);
    expect(b.snapshot().levelName).toBe("First Watch");
    expect(b.snapshot().midShiftAfter).toBe(2);
    expect(b.towers).toHaveLength(0);
  });
});
