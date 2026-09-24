import {
  BUFFS,
  CELL,
  COLS,
  ENEMIES,
  ROWS,
  TOWERS,
  cellCenter,
  keepDoorStats,
  towerRangeFor,
} from "./config";
import { combatRulesFor, hitCallout } from "./combat";
import { levelScript, reconBoardLine } from "./levels";
import type { KeepFootprint } from "./mapgen";
import { enemySprite, getSprite, towerSprite } from "./sprites";
import type {
  Cell,
  Enemy,
  FloatingText,
  GamePhase,
  Particle,
  PlacementMode,
  Projectile,
  Tower,
  Vec2,
} from "./types";

/** Fields and methods GameEngine exposes for canvas drawing. */
export type RenderHost = {
  phase: GamePhase;
  fpv: boolean;
  selectedTowerId: number | null;
  placement: PlacementMode;
  hoverCol: number;
  hoverRow: number;
  shake: number;
  animTime: number;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  floats: FloatingText[];
  pathPoints: Vec2[];
  prevPathPoints: Vec2[];
  frontShift: number;
  shiftHold: boolean;
  lives: number;
  selectedKeep: boolean;
  keepWell: boolean;
  keepDoorGun: boolean;
  keepDoorTier: number;
  keepFortify: number;
  level: number;
  wave: number;
  cells: Cell[][];
  tilePatternCache: Map<string, CanvasPattern>;
  coveringCount: number;
  strandedCount: number;
  fpvYaw: number;
  fpvLookYaw: number;
  fpvPitch: number;
  fpvLookPitch: number;
  getSelectedTower(): Tower | null;
  keepSpec(): KeepFootprint;
  keepDoorPos(): Vec2;
  findTarget(tower: Tower): Enemy | null;
};

/** Canvas drawing for GameEngine. Simulation stays in engine.ts. */
export function renderGame(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
) {
  const selected = engine.getSelectedTower();
  if (engine.fpv && selected && engine.phase !== "menu") {
    drawFpv(engine, ctx, viewW, viewH, selected);
    return;
  }

  const scale = Math.min(viewW / (COLS * CELL), viewH / (ROWS * CELL));
  const drawW = COLS * CELL * scale;
  const drawH = ROWS * CELL * scale;
  const ox = (viewW - drawW) / 2;
  const oy = (viewH - drawH) / 2;

  ctx.save();
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, "#1c1816");
  g.addColorStop(0.5, "#12141a");
  g.addColorStop(1, "#0c1016");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  const shakeX = engine.shake > 0 ? (Math.random() - 0.5) * 6 * engine.shake : 0;
  const shakeY = engine.shake > 0 ? (Math.random() - 0.5) * 6 * engine.shake : 0;

  ctx.translate(ox + shakeX, oy + shakeY);
  ctx.scale(scale, scale);

  drawMap(engine, ctx);
  drawPath(engine, ctx);
  drawDuskWash(ctx);
  drawAetherVein(engine, ctx);
  drawBeaconPull(engine, ctx);
  drawEndpointPads(engine, ctx);

  if (engine.placement && engine.hoverCol >= 0) {
    drawPlacementGhost(engine, ctx, engine.hoverCol, engine.hoverRow);
  }
  if (selected) {
    drawRange(ctx, selected);
  }

  for (const t of engine.towers) drawTower(engine, ctx, t, t.id === engine.selectedTowerId);
  for (const e of engine.enemies) if (e.alive || e.hitFlash > 0) drawEnemy(engine, ctx, e);
  for (const p of engine.projectiles) if (p.alive) drawProjectile(ctx, p);
  for (const pt of engine.particles) drawParticle(ctx, pt);
  for (const f of engine.floats) drawFloat(ctx, f);

  if (engine.pathPoints.length > 0) {
    drawSpawn(engine, ctx, engine.pathPoints[0]!);
    drawKeep(engine, ctx);
    drawKeepDoor(engine, ctx, engine.keepDoorPos());
  }

  if (engine.frontShift > 0 || engine.shiftHold) drawFrontShift(engine, ctx);
  drawReconLine(engine, ctx);

  ctx.restore();
}

function ensureTilePattern(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  key: "grass" | "dirt",
): CanvasPattern | null {
  const cached = engine.tilePatternCache.get(key);
  if (cached) return cached;
  const img = getSprite(key);
  if (!img) return null;
  const pattern = ctx.createPattern(img, "repeat");
  if (pattern) {
    // 256px texture at ~2.4 cells so speckle reads at board scale
    const scale = (CELL * 2.4) / (img.naturalWidth || 256);
    if (typeof DOMMatrix !== "undefined") {
      pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    }
    engine.tilePatternCache.set(key, pattern);
  }
  return pattern;
}

/** Fill a rect with a repeating ground sprite, or a dusk color if it is not loaded. */
function fillGround(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  key: "grass" | "dirt",
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const pattern = ensureTilePattern(engine, ctx, key);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
    return;
  }

  const img = getSprite(key);
  if (img) {
    const tw = img.naturalWidth || CELL;
    const th = img.naturalHeight || CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const x0 = Math.floor(x / tw) * tw;
    const y0 = Math.floor(y / th) * th;
    const x1 = x + w;
    const y1 = y + h;
    for (let py = y0; py < y1; py += th) {
      for (let px = x0; px < x1; px += tw) {
        ctx.drawImage(img, px, py, tw, th);
      }
    }
    ctx.restore();
    return;
  }

  if (key === "grass") {
    const hill = ctx.createLinearGradient(0, 0, 0, ROWS * CELL);
    hill.addColorStop(0, "#455640");
    hill.addColorStop(0.5, "#334530");
    hill.addColorStop(1, "#243226");
    ctx.fillStyle = hill;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillStyle = "#5a4632";
    ctx.fillRect(x, y, w, h);
  }
}

function strokeLane(ctx: CanvasRenderingContext2D, points: Vec2[], color: string, width: number) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawMap(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  fillGround(engine, ctx, "grass", 0, 0, COLS * CELL, ROWS * CELL);
}

function drawPath(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  if (engine.frontShift > 0 && engine.prevPathPoints.length > 1) {
    const fade = engine.frontShift / 4.2;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.28 * fade;
    ctx.setLineDash([8, 10]);
    strokeLane(ctx, engine.prevPathPoints, "#6a5a48", CELL * 0.7);
    ctx.restore();
  }

  if (engine.pathPoints.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Rounded dirt road — do not stamp square path cells (that reads as a grid).
  strokeLane(ctx, engine.pathPoints, "rgba(48, 34, 22, 0.55)", CELL * 1.02);
  const dirt = ensureTilePattern(engine, ctx, "dirt");
  if (dirt) {
    ctx.strokeStyle = dirt;
    ctx.lineWidth = CELL * 0.86;
    ctx.beginPath();
    for (let i = 0; i < engine.pathPoints.length; i++) {
      const p = engine.pathPoints[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  } else {
    strokeLane(ctx, engine.pathPoints, "#6b5340", CELL * 0.86);
  }
  strokeLane(ctx, engine.pathPoints, "rgba(92, 70, 48, 0.28)", CELL * 0.52);
  ctx.restore();
}

/** T1 battery bubble on the dirt so beacon pull is visible, not just a tower halo. */
function drawBeaconPull(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  const beacons = engine.towers.filter((t) => t.role === "beacon");
  if (beacons.length === 0) return;

  const range = towerRangeFor("ember", 1, "battery");
  const scarRange2 = (range * 0.95) * (range * 0.95);
  const shifting = engine.frontShift > 0 || engine.shiftHold;
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 2.4);
  const discAlpha = shifting ? 0.36 + pulse * 0.14 : 0.22 + pulse * 0.08;
  const nearBeacon = (p: Vec2) =>
    beacons.some((b) => {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      return dx * dx + dy * dy <= scarRange2;
    });

  ctx.save();
  for (const b of beacons) {
    const glow = ctx.createRadialGradient(b.x, b.y, 6, b.x, b.y, range);
    glow.addColorStop(0, `rgba(196, 181, 253, ${discAlpha})`);
    glow.addColorStop(0.42, `rgba(167, 139, 250, ${discAlpha * 0.48})`);
    glow.addColorStop(1, "rgba(124, 58, 237, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, range, 0, Math.PI * 2);
    ctx.fill();
  }

  if (engine.pathPoints.length > 0) {
    const scarAlpha = shifting ? 0.42 + pulse * 0.12 : 0.28 + pulse * 0.1;
    ctx.fillStyle = `rgba(167, 139, 250, ${scarAlpha})`;
    ctx.strokeStyle = `rgba(196, 181, 253, ${Math.min(0.85, scarAlpha + 0.12)})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 18;

    ctx.beginPath();
    let drawing = false;
    for (const p of engine.pathPoints) {
      if (nearBeacon(p)) {
        if (!drawing) {
          ctx.moveTo(p.x, p.y);
          drawing = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        drawing = false;
      }
    }
    ctx.stroke();

    for (const p of engine.pathPoints) {
      if (!nearBeacon(p)) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = shifting
      ? `rgba(196, 181, 253, ${0.42 + pulse * 0.12})`
      : `rgba(196, 181, 253, ${0.28 + pulse * 0.1})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 6]);
    for (const b of beacons) {
      let nearest = engine.pathPoints[0]!;
      let best = Infinity;
      for (const p of engine.pathPoints) {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          nearest = p;
        }
      }
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(nearest.x, nearest.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawDuskWash(ctx: CanvasRenderingContext2D) {
  const w = COLS * CELL;
  const h = ROWS * CELL;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.globalCompositeOperation = "multiply";
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "#f4d4a8");
  wash.addColorStop(0.4, "#d8c8b4");
  wash.addColorStop(1, "#8a96a4");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  const warm = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  warm.addColorStop(0, "rgba(232, 150, 70, 0.55)");
  warm.addColorStop(1, "rgba(232, 150, 70, 0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h * 0.35);
  ctx.restore();

  ctx.save();
  const vig = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    h * 0.28,
    w * 0.5,
    h * 0.5,
    Math.hypot(w, h) * 0.58,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.72, "rgba(10,12,20,0.05)");
  vig.addColorStop(1, "rgba(8,10,18,0.22)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawAetherVein(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  if (engine.pathPoints.length < 2) return;
  const pulse = engine.frontShift > 0 ? 0.16 + 0.1 * Math.sin(engine.animTime * 7) : 0.08;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokeLane(ctx, engine.pathPoints, `rgba(150, 196, 210, ${pulse})`, 1.15);
  ctx.restore();
}

function drawEndpointPads(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  if (engine.pathPoints.length === 0) return;
  const spawn = engine.pathPoints[0]!;
  const keep = engine.pathPoints[engine.pathPoints.length - 1]!;

  ctx.save();
  const spawnGlow = ctx.createRadialGradient(spawn.x, spawn.y, 2, spawn.x, spawn.y, CELL * 1.35);
  spawnGlow.addColorStop(0, "rgba(196, 92, 92, 0.22)");
  spawnGlow.addColorStop(0.55, "rgba(196, 92, 92, 0.07)");
  spawnGlow.addColorStop(1, "rgba(196, 92, 92, 0)");
  ctx.fillStyle = spawnGlow;
  ctx.beginPath();
  ctx.arc(spawn.x, spawn.y, CELL * 1.35, 0, Math.PI * 2);
  ctx.fill();

  const keepGlow = ctx.createRadialGradient(keep.x, keep.y, 2, keep.x, keep.y, CELL * 1.45);
  keepGlow.addColorStop(0, "rgba(160, 200, 220, 0.2)");
  keepGlow.addColorStop(0.55, "rgba(160, 200, 220, 0.07)");
  keepGlow.addColorStop(1, "rgba(160, 200, 220, 0)");
  ctx.fillStyle = keepGlow;
  ctx.beginPath();
  ctx.arc(keep.x, keep.y, CELL * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpawn(engine: RenderHost, ctx: CanvasRenderingContext2D, pos: Vec2) {
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 3.2);
  ctx.save();
  ctx.translate(pos.x, pos.y);

  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
  glow.addColorStop(0, `rgba(196, 92, 92, ${0.4 + pulse * 0.18})`);
  glow.addColorStop(1, "rgba(196, 92, 92, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();

  const portal = getSprite("spawn");
  if (portal) {
    const s = 46;
    ctx.drawImage(portal, Math.round(-s / 2), Math.round(-s / 2), s, s);
  } else {
    ctx.fillStyle = "#2a1212";
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLabelPill(ctx, 0, -32, "SPAWN", "#c45c5c", "#1a0c0c");
  ctx.restore();
}

function drawKeep(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  const keep = engine.keepSpec();
  const pos = {
    x: keep.origin[0] * CELL + CELL,
    y: keep.origin[1] * CELL + CELL,
  };
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 2.4);
  const danger = engine.lives <= 5;
  const accent = danger ? "#c45c5c" : "#c8d0dc";
  const selected = engine.selectedKeep;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 58);
  glow.addColorStop(
    0,
    danger
      ? `rgba(200, 100, 100, ${0.38 + pulse * 0.15})`
      : `rgba(160, 200, 220, ${0.34 + pulse * 0.14})`,
  );
  glow.addColorStop(1, "rgba(160, 200, 220, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = "#f4f4f5";
    ctx.lineWidth = 2;
    ctx.strokeRect(-CELL, -CELL, CELL * 2, CELL * 2);
  }

  const spr = getSprite("keep") ?? getSprite("base");
  if (spr) {
    const s = 92;
    ctx.drawImage(spr, Math.round(-s / 2), Math.round(-s / 2 - 10), s, s);
  } else {
    ctx.fillStyle = "#1a1c22";
    ctx.fillRect(-28, -24, 56, 48);
  }

  drawLabelPill(
    ctx,
    0,
    -52,
    danger ? `KEEP  ${engine.lives}` : "KEEP",
    accent,
    danger ? "#1a0c0c" : "#0e1014",
  );
  if (!danger) {
    ctx.fillStyle = "rgba(180, 195, 215, 0.9)";
    ctx.font = "700 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(engine.lives), 0, 42);
  }
  if (engine.keepWell) {
    ctx.fillStyle = "rgba(212,176,80,0.95)";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WELL", 0, 56);
  }

  ctx.restore();

  if (engine.selectedKeep && engine.keepDoorGun) {
    const door = engine.keepDoorPos();
    const range = keepDoorStats(engine.keepDoorTier || 1, engine.keepFortify, engine.level).range;
    ctx.save();
    ctx.strokeStyle = TOWERS.iron.color + "55";
    ctx.fillStyle = TOWERS.iron.color + "12";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(door.x, door.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawKeepDoor(engine: RenderHost, ctx: CanvasRenderingContext2D, pos: Vec2) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 2.8);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
  g.addColorStop(0, `rgba(160, 210, 230, ${0.45 + pulse * 0.2})`);
  g.addColorStop(1, "rgba(160, 210, 230, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  if (engine.keepDoorGun) {
    let ang = -Math.PI / 2;
    if (engine.pathPoints.length >= 2) {
      const a = engine.pathPoints[engine.pathPoints.length - 2]!;
      const b = engine.pathPoints[engine.pathPoints.length - 1]!;
      ang = Math.atan2(a.y - b.y, a.x - b.x);
    }
    ctx.save();
    ctx.rotate(ang);
    ctx.fillStyle = TOWERS.iron.color;
    ctx.beginPath();
    ctx.moveTo(-8, 8);
    ctx.lineTo(0, -12);
    ctx.lineTo(8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-3.2, -22, 6.4, 16);
    ctx.fillStyle = "#2a2e34";
    ctx.fillRect(-1.6, -20, 3.2, 10);
    ctx.restore();
  }
  ctx.restore();
}

function drawLabelPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  bg: string,
) {
  ctx.save();
  ctx.font = "700 10px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 14;
  const h = 16;
  const r = 4;
  const left = x - w / 2;
  const top = y - h / 2;

  ctx.fillStyle = bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + w - r, top);
  ctx.quadraticCurveTo(left + w, top, left + w, top + r);
  ctx.lineTo(left + w, top + h - r);
  ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
  ctx.lineTo(left + r, top + h);
  ctx.quadraticCurveTo(left, top + h, left, top + h - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function drawRange(ctx: CanvasRenderingContext2D, t: Tower) {
  if (t.role === "well" || t.role === "beacon") return;
  const range = towerRangeFor(t.kind, t.tier, t.role);
  ctx.save();
  ctx.strokeStyle = TOWERS[t.kind].color + "55";
  ctx.fillStyle = TOWERS[t.kind].color + "12";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlacementGhost(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
) {
  if (!engine.placement || col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
  const cell = engine.cells[row]![col]!;
  const pos = cellCenter(col, row);
  const ok = cell.buildable && !cell.occupied && !cell.path;
  const def = TOWERS[engine.placement];
  const range = def.tiers[0]!.range;
  ctx.save();
  ctx.fillStyle = ok ? "rgba(236, 224, 196, 0.22)" : "rgba(196, 92, 92, 0.22)";
  ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
  ctx.strokeStyle = ok ? "rgba(246, 232, 196, 0.95)" : "rgba(220, 110, 100, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = ok ? def.color : "#c45c5c";
  ctx.fillStyle = ok ? def.color + "22" : "#c45c5c22";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = ok ? 0.7 : 0.35;
  const spr = towerSprite(engine.placement);
  if (spr) {
    const { h } = containedSpriteSize(spr, 56);
    drawContainedSprite(ctx, spr, pos.x, pos.y - h * 0.15, 56);
  } else {
    ctx.fillStyle = ok ? def.color : "#c45c5c";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTower(engine: RenderHost, ctx: CanvasRenderingContext2D, t: Tower, selected: boolean) {
  const def = TOWERS[t.kind];
  const longSide = 64 + (t.tier - 1) * 4;
  const art = t.role === "well" ? getSprite("well") : towerSprite(t.kind);
  const fit = art ? containedSpriteSize(art, longSide) : null;
  const ring = fit ? Math.max(fit.w, fit.h) * 0.48 : 0;
  const lanternY = fit ? -fit.h / 2 + 6 : -16;

  ctx.save();
  ctx.translate(t.x, t.y);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  if (fit) ctx.ellipse(0, fit.h / 2 - 2, Math.max(10, fit.w * 0.28), 5, 0, 0, Math.PI * 2);
  else ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (engine.frontShift > 0 || engine.shiftHold || !t.covering) {
    const pulse =
      engine.frontShift > 0 || engine.shiftHold
        ? 0.45 + 0.55 * Math.sin(engine.animTime * 6)
        : 0.55;
    ctx.strokeStyle = t.covering
      ? `rgba(90, 158, 111, ${0.35 + pulse * 0.5})`
      : `rgba(212, 160, 64, ${0.4 + pulse * 0.45})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, (fit ? ring : 21) + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (t.role === "watch") drawWatchGlow(engine, ctx, lanternY);
  if (t.role === "beacon") drawBeaconGlow(engine, ctx);

  if (t.role === "well") {
    drawWellTower(ctx, longSide);
  } else if (art) {
    drawOutlinedSprite(ctx, art, 0, 0, longSide);
  } else {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (t.role === "watch") drawWatchLantern(ctx, lanternY);

  if (selected) {
    ctx.strokeStyle = "#f4f4f5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, fit ? ring : 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  const labelY = fit ? fit.h / 2 + 10 : 24;
  if (t.role === "well") {
    ctx.fillStyle = "rgba(212,176,80,0.95)";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WELL", 0, labelY);
  } else if (t.role === "beacon") {
    ctx.fillStyle = "rgba(196,160,220,0.95)";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BEACON", 0, labelY);
  } else if (t.role === "watch") {
    ctx.fillStyle = "rgba(160,200,220,0.95)";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WATCH", 0, labelY);
  } else if (!t.covering) {
    ctx.fillStyle = "rgba(212,160,64,0.95)";
    ctx.font = "700 8px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("INLAND", 0, labelY);
  }

  ctx.restore();

  const pipY = t.y + (fit ? fit.h / 2 + 18 : 20);
  ctx.save();
  for (let i = 0; i < t.tier; i++) {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(t.x - 8 + i * 8, pipY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBeaconGlow(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 3.1);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  glow.addColorStop(0, `rgba(220, 190, 255, ${0.45 + pulse * 0.16})`);
  glow.addColorStop(0.5, `rgba(160, 120, 210, ${0.18 + pulse * 0.08})`);
  glow.addColorStop(1, "rgba(160, 120, 210, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
}

/** Cool watch-light, not Ember orange. */
function drawWatchGlow(engine: RenderHost, ctx: CanvasRenderingContext2D, lanternY = -16) {
  const y = lanternY + 4;
  const pulse = 0.5 + 0.5 * Math.sin(engine.animTime * 2.6);
  const glow = ctx.createRadialGradient(0, y, 2, 0, y + 2, 28);
  glow.addColorStop(0, `rgba(220, 230, 255, ${0.4 + pulse * 0.14})`);
  glow.addColorStop(0.45, `rgba(160, 190, 220, ${0.16 + pulse * 0.08})`);
  glow.addColorStop(1, "rgba(160, 190, 220, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, y, 14, 22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Small lantern on the crown — not a 22px lamp-post sticker. */
function drawWatchLantern(ctx: CanvasRenderingContext2D, centerY = -16) {
  ctx.fillStyle = "rgba(236, 232, 210, 0.95)";
  ctx.beginPath();
  ctx.moveTo(0, centerY - 6);
  ctx.lineTo(5, centerY);
  ctx.lineTo(0, centerY + 5);
  ctx.lineTo(-5, centerY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(180, 210, 240, 0.9)";
  ctx.beginPath();
  ctx.arc(0, centerY, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Well replaces the gun. */
function drawWellTower(ctx: CanvasRenderingContext2D, longSide: number) {
  const overlay = getSprite("well");
  if (overlay) {
    drawOutlinedSprite(ctx, overlay, 0, 0, longSide);
    return;
  }
  ctx.fillStyle = "#6e685c";
  ctx.beginPath();
  ctx.ellipse(0, 3, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9a9384";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.fillStyle = "#0d0b12";
  ctx.beginPath();
  ctx.ellipse(0, 3, 9.5, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Visual size only — hitboxes stay on e.radius. */
function enemySpriteSize(e: Enemy): number {
  const def = ENEMIES[e.kind];
  if (def.isBoss) return 64;
  if (e.kind === "scout" || e.kind === "runner") return e.radius * 4.0;
  return e.radius * 3.3;
}

function containedSpriteSize(sprite: HTMLImageElement, box: number): { w: number; h: number } {
  const iw = sprite.naturalWidth || box;
  const ih = sprite.naturalHeight || box;
  const scale = Math.min(box / iw, box / ih);
  return { w: iw * scale, h: ih * scale };
}

/** Fit sprite in a box without squashing tall or square art. */
function drawContainedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  box: number,
): { w: number; h: number } {
  const { w, h } = containedSpriteSize(sprite, box);
  ctx.drawImage(sprite, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  return { w, h };
}

function drawOutlinedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  longSide: number,
): { w: number; h: number } {
  ctx.save();
  let edge = true;
  try {
    ctx.filter = "brightness(0)";
  } catch {
    edge = false;
  }
  if (edge) {
    ctx.globalAlpha = 0.85;
    for (const ox of [-2, 0, 2]) {
      for (const oy of [-2, 0, 2]) {
        if (ox === 0 && oy === 0) continue;
        drawContainedSprite(ctx, sprite, x + ox, y + oy, longSide);
      }
    }
  }
  ctx.restore();
  return drawContainedSprite(ctx, sprite, x, y, longSide);
}

function drawEnemy(engine: RenderHost, ctx: CanvasRenderingContext2D, e: Enemy) {
  const def = ENEMIES[e.kind];
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(e.hitFlash * 40) * 0.45;

  const size = enemySpriteSize(e);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.38, size * 0.28, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const sprite = enemySprite(e.kind);
  if (sprite) {
    const bob = Math.sin(engine.animTime * 8 + e.id) * 1.1;
    drawContainedSprite(ctx, sprite, 0, -2 + bob, size);
    if (e.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(0.5, e.hitFlash * 4);
      ctx.fillStyle = e.hitFlashColor ?? "#f4f4f5";
      ctx.beginPath();
      ctx.ellipse(0, -2, size * 0.3, size * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = e.hitFlash > 0.05 ? (e.hitFlashColor ?? "#f4f4f5") : def.color;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Armor pip — not a full-body ring
  const armor = TOWERS[e.armor]?.color ?? "#a1a1aa";
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.arc(size * 0.32, -size * 0.32, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(8,8,10,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const shredded = e.buffs.some((b) => b.id === "shred");
  if (shredded) {
    ctx.strokeStyle = "#d4b06a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(size * 0.32 - 3, -size * 0.32 - 3);
    ctx.lineTo(size * 0.32 + 3, -size * 0.32 + 3);
    ctx.moveTo(size * 0.32 + 3, -size * 0.32 - 3);
    ctx.lineTo(size * 0.32 - 3, -size * 0.32 + 3);
    ctx.stroke();
  }

  const hasStrength = e.buffs.some((b) => BUFFS[b.id].polarity === "strength");
  const hasWeakness = e.buffs.some((b) => BUFFS[b.id].polarity === "weakness");
  if (hasStrength) {
    ctx.fillStyle = "#5a9e6f";
    ctx.fillRect(-size * 0.42, -size * 0.42, 5, 5);
  }
  if (hasWeakness) {
    ctx.fillStyle = "#c45c5c";
    ctx.fillRect(-size * 0.42 + (hasStrength ? 6 : 0), -size * 0.42, 5, 5);
  }

  const bw = Math.max(22, size * 0.85);
  const bh = 3;
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-bw / 2, -size / 2 - 8, bw, bh);
  ctx.fillStyle = pct > 0.4 ? "#5a9e6f" : "#c45c5c";
  ctx.fillRect(-bw / 2, -size / 2 - 8, bw * pct, bh);

  if (e.slowTimer > 0) {
    ctx.fillStyle = "rgba(91,159,212,0.75)";
    ctx.beginPath();
    ctx.arc(size / 2 - 4, size / 2 - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFrontShift(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  const fade = engine.shiftHold
    ? 1
    : Math.min(1, engine.frontShift / 0.6, (4.2 - engine.frontShift) / 0.45);
  const mid = (COLS * CELL) / 2;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(8,8,12,0.62)";
  ctx.fillRect(mid - 250, 10, 500, 50);
  ctx.strokeStyle = "rgba(212,196,160,0.4)";
  ctx.strokeRect(mid - 250, 10, 500, 50);
  ctx.fillStyle = "#e8e0d0";
  ctx.font = "700 14px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("THE KEEP HOLDS · THE FRONT SHIFTS", mid, 26);
  ctx.font = "500 11px Segoe UI, sans-serif";
  ctx.fillStyle = "#a8a29a";
  ctx.fillText(
    engine.shiftHold
      ? `${engine.coveringCount} covering · ${engine.strandedCount} inland — convert or grow the keep, then start`
      : `${engine.coveringCount} still cover the road · ${engine.strandedCount} now inland`,
    mid,
    44,
  );
  ctx.restore();
}

function drawReconLine(engine: RenderHost, ctx: CanvasRenderingContext2D) {
  if (engine.phase !== "playing" && engine.phase !== "paused") return;
  if (engine.wave !== 0 || engine.shiftHold || engine.frontShift > 0) return;
  const line = reconBoardLine(engine.level);
  if (line === null) return;

  const mid = (COLS * CELL) / 2;
  ctx.save();
  ctx.fillStyle = "rgba(8,8,12,0.52)";
  ctx.fillRect(mid - 200, 14, 400, 26);
  ctx.strokeStyle = "rgba(196,181,253,0.26)";
  ctx.strokeRect(mid - 200, 14, 400, 26);
  ctx.fillStyle = "#d4cce4";
  ctx.font = "600 12px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line, mid, 27);
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
  ctx.save();
  const ang = Math.atan2(p.vy, p.vx);
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 10;
  if (p.element === "ember") {
    // Orange teardrop — must not read as a gold lightning bolt.
    ctx.fillStyle = "#e85d4c";
    ctx.shadowColor = "#e85d4c";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 7);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#7a2418";
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, -4);
    ctx.closePath();
    ctx.fill();
  } else if (p.element === "frost") {
    ctx.fillStyle = "#5b9fd4";
    ctx.shadowColor = "#9fd4f0";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-14, 0);
    ctx.lineTo(0, -8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f2f7fc";
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(0, -3.5);
    ctx.closePath();
    ctx.fill();
  } else if (p.element === "volt") {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(2, 6);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "#f5e9a0";
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(2, 6);
    ctx.lineTo(16, 0);
    ctx.stroke();
  } else {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#1c1e22";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-16, 0);
    ctx.stroke();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#eceff4";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#2a2e34";
    ctx.beginPath();
    ctx.arc(3, 0, p.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  const a = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = a;
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  if (p.kind === "ring") {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1.15 - a * 0.4), 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "shard") {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.size);
    ctx.lineTo(p.x + p.size * 0.5, p.y);
    ctx.lineTo(p.x, p.y + p.size);
    ctx.lineTo(p.x - p.size * 0.5, p.y);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloat(ctx: CanvasRenderingContext2D, f: FloatingText) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
  ctx.fillStyle = f.color;
  ctx.font = "700 11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(f.text, f.x, f.y);
  ctx.restore();
}

function projectFpv(
  wx: number,
  wy: number,
  height: number,
  camX: number,
  camY: number,
  yaw: number,
  pitch: number,
  vw: number,
  vh: number,
): { x: number; y: number; z: number; s: number } | null {
  const dx = wx - camX;
  const dy = wy - camY;
  const fx = Math.cos(yaw);
  const fy = Math.sin(yaw);
  const rx = -Math.sin(yaw);
  const ry = Math.cos(yaw);
  const right = dx * rx + dy * ry;
  const forward = dx * fx + dy * fy;
  const up = height - 20;
  if (forward < 10) return null;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fz = forward * cp - up * sp;
  const fy2 = forward * sp + up * cp;
  if (fz < 8) return null;
  const f = vh / (2 * Math.tan(0.52));
  return {
    x: vw / 2 + (right / fz) * f,
    y: vh * 0.46 - (fy2 / fz) * f,
    z: fz,
    s: f / fz,
  };
}

function drawFpv(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  cam: Tower,
) {
  const yaw = engine.fpvYaw + engine.fpvLookYaw;
  const pitch = engine.fpvPitch + engine.fpvLookPitch;
  const def = TOWERS[cam.kind];
  const project = (wx: number, wy: number, h = 0) =>
    projectFpv(wx, wy, h, cam.x, cam.y, yaw, pitch, vw, vh);

  ctx.save();
  ctx.clearRect(0, 0, vw, vh);

  const sky = ctx.createLinearGradient(0, 0, 0, vh * 0.5);
  sky.addColorStop(0, "#141820");
  sky.addColorStop(0.55, "#1c1816");
  sky.addColorStop(1, "#2a2218");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh * 0.5);

  const ground = ctx.createLinearGradient(0, vh * 0.42, 0, vh);
  ground.addColorStop(0, "#3a3224");
  ground.addColorStop(0.35, "#2a2418");
  ground.addColorStop(1, "#14110c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, vh * 0.42, vw, vh * 0.58);

  // Horizon haze
  const haze = ctx.createLinearGradient(0, vh * 0.38, 0, vh * 0.52);
  haze.addColorStop(0, "rgba(180,140,90,0)");
  haze.addColorStop(0.5, "rgba(180,140,90,0.12)");
  haze.addColorStop(1, "rgba(40,32,20,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, vh * 0.36, vw, vh * 0.2);

  // Ground grid — short lanes only, close to camera
  ctx.strokeStyle = "rgba(255,230,180,0.05)";
  ctx.lineWidth = 1;
  const rightX = Math.cos(yaw + Math.PI / 2);
  const rightY = Math.sin(yaw + Math.PI / 2);
  const fwdX = Math.cos(yaw);
  const fwdY = Math.sin(yaw);
  for (let i = -6; i <= 6; i++) {
    const ox = cam.x + rightX * i * 36;
    const oy = cam.y + rightY * i * 36;
    const a = project(ox + fwdX * 50, oy + fwdY * 50);
    const b = project(ox + fwdX * 280, oy + fwdY * 280);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Path as receding road — one stroke per segment so width can shrink with depth
  const pathProj = engine.pathPoints.map((p) => project(p.x, p.y, 0));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < pathProj.length - 1; i++) {
    const a = pathProj[i];
    const b = pathProj[i + 1];
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > vw * 0.85) continue;
    ctx.strokeStyle = "#4a3c28";
    ctx.lineWidth = Math.max(5, Math.min(36, ((a.s + b.s) / 2) * 0.32));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(212,196,160,0.2)";
    ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.18);
    ctx.stroke();
  }
  // Spawn / base markers
  if (engine.pathPoints.length) {
    const sp = project(engine.pathPoints[0]!.x, engine.pathPoints[0]!.y, 10);
    const bp = project(
      engine.pathPoints[engine.pathPoints.length - 1]!.x,
      engine.pathPoints[engine.pathPoints.length - 1]!.y,
      14,
    );
    if (sp) {
      const img = getSprite("spawn");
      const sz = Math.max(18, Math.min(70, sp.s * 0.9));
      if (img) ctx.drawImage(img, sp.x - sz / 2, sp.y - sz, sz, sz);
    }
    if (bp) {
      const img = getSprite("base");
      const sz = Math.max(20, Math.min(78, bp.s * 1.0));
      if (img) ctx.drawImage(img, bp.x - sz / 2, bp.y - sz, sz, sz);
    }
  }

  type SpriteBillboard = {
    z: number;
    draw: () => void;
  };
  const billboards: SpriteBillboard[] = [];

  for (const t of engine.towers) {
    if (t.id === cam.id) continue;
    const p = project(t.x, t.y, 12);
    if (!p) continue;
    billboards.push({
      z: p.z,
      draw: () => {
        const spr = towerSprite(t.kind);
        const sz = Math.max(16, Math.min(72, p.s * 0.85));
        if (spr) ctx.drawImage(spr, p.x - sz / 2, p.y - sz * 0.92, sz, sz);
        else {
          ctx.fillStyle = TOWERS[t.kind].color;
          ctx.fillRect(p.x - 6, p.y - 16, 12, 16);
        }
      },
    });
  }

  const tracked = engine.findTarget(cam);
  for (const e of engine.enemies) {
    if (!e.alive && e.hitFlash <= 0) continue;
    const p = project(e.x, e.y, 8);
    if (!p) continue;
    billboards.push({
      z: p.z,
      draw: () => {
        const spr = enemySprite(e.kind);
        const sz = Math.max(18, Math.min(110, p.s * (e.kind === "boss" ? 1.5 : 1.05)));
        ctx.save();
        if (e.hitFlash > 0) ctx.globalAlpha = 0.65 + Math.sin(e.hitFlash * 40) * 0.35;
        if (spr) drawContainedSprite(ctx, spr, p.x, p.y - sz * 0.45, sz);
        else {
          ctx.fillStyle =
            e.hitFlash > 0 ? (e.hitFlashColor ?? ENEMIES[e.kind].color) : ENEMIES[e.kind].color;
          ctx.beginPath();
          ctx.arc(p.x, p.y - sz * 0.4, sz * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        if (e.hitFlash > 0 && spr) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.min(0.45, e.hitFlash * 3.5);
          ctx.fillStyle = e.hitFlashColor ?? "#f4f4f5";
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - sz * 0.45, sz * 0.26, sz * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        const bw = sz * 0.7;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(p.x - bw / 2, p.y - sz - 6, bw, 4);
        ctx.fillStyle = pct > 0.4 ? "#5a9e6f" : "#c45c5c";
        ctx.fillRect(p.x - bw / 2, p.y - sz - 6, bw * pct, 4);
        if (tracked && tracked.id === e.id) {
          ctx.strokeStyle = def.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - sz / 2 - 4, p.y - sz - 10, sz + 8, sz + 14);
        }
        ctx.restore();
      },
    });
  }

  for (const pr of engine.projectiles) {
    if (!pr.alive) continue;
    const p = project(pr.x, pr.y, 10);
    if (!p) continue;
    billboards.push({
      z: p.z,
      draw: () => {
        ctx.save();
        ctx.fillStyle = pr.color;
        ctx.shadowColor = pr.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, Math.max(2, Math.min(8, p.s * 0.08)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    });
  }

  billboards.sort((a, b) => b.z - a.z);
  for (const b of billboards) b.draw();

  // Range ring on ground
  const range = def.tiers[cam.tier - 1]!.range;
  ctx.save();
  ctx.strokeStyle = def.color + "55";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  let ringStarted = false;
  for (let a = 0; a <= 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    const p = project(cam.x + Math.cos(ang) * range, cam.y + Math.sin(ang) * range, 0);
    if (!p) {
      ringStarted = false;
      continue;
    }
    if (!ringStarted) {
      ctx.moveTo(p.x, p.y);
      ringStarted = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();

  // Stone visor / crenellation
  ctx.fillStyle = "#121214";
  ctx.fillRect(0, 0, vw, 36);
  ctx.fillRect(0, vh - 54, vw, 54);
  ctx.fillStyle = "#1a1a1e";
  for (let x = 0; x < vw; x += 28) {
    ctx.fillRect(x + 4, 28, 16, 14);
    ctx.fillRect(x + 4, vh - 68, 16, 16);
  }

  // Vignette
  const vig = ctx.createRadialGradient(vw / 2, vh * 0.48, vh * 0.2, vw / 2, vh * 0.48, vh * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, vw, vh);

  // Crosshair
  ctx.strokeStyle = def.color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  const cx = vw / 2;
  const cy = vh * 0.46;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.moveTo(cx + 5, cy);
  ctx.lineTo(cx + 16, cy);
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx, cy - 5);
  ctx.moveTo(cx, cy + 5);
  ctx.lineTo(cx, cy + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = def.color;
  ctx.font = "700 13px Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(def.name.toUpperCase(), 16, vh - 28);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "500 11px Segoe UI, sans-serif";
  ctx.fillText(`T${cam.tier} · ${cam.kills} kills · drag to look · V exit`, 16, vh - 12);

  if (tracked) {
    const ed = ENEMIES[tracked.kind];
    const call = hitCallout(cam.kind, tracked, combatRulesFor(levelScript(engine.level).rule));
    const tag = call.text !== "" ? call.text : "HIT";
    ctx.textAlign = "right";
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "600 12px Segoe UI, sans-serif";
    ctx.fillText(ed.name, vw - 16, vh - 28);
    ctx.fillStyle =
      call.tone === "strong" ? "#5a9e6f" : call.tone === "weak" ? "#c45c5c" : def.color;
    ctx.font = "700 11px Segoe UI, sans-serif";
    ctx.fillText(`${tag}  ${Math.round(tracked.hp)}/${tracked.maxHp}`, vw - 16, vh - 12);
  } else {
    ctx.textAlign = "right";
    ctx.fillStyle = "#71717a";
    ctx.font = "500 11px Segoe UI, sans-serif";
    ctx.fillText("No target in range", vw - 16, vh - 20);
  }

  ctx.restore();

  drawFpvMinimap(engine, ctx, vw, vh, cam);
}

function drawFpvMinimap(
  engine: RenderHost,
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  cam: Tower,
) {
  const mw = Math.min(176, vw * 0.28);
  const mh = mw * (ROWS / COLS);
  const mx = vw - mw - 12;
  const my = 44;
  const sx = mw / (COLS * CELL);
  const sy = mh / (ROWS * CELL);

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(10,10,12,0.82)";
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.strokeStyle = "rgba(212,196,160,0.35)";
  ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);

  ctx.translate(mx, my);
  ctx.scale(sx, sy);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = engine.cells[r]![c]!;
      ctx.fillStyle = cell.path ? "#3a3224" : "#1a1c20";
      ctx.fillRect(c * CELL, r * CELL, CELL + 0.5, CELL + 0.5);
    }
  }
  ctx.strokeStyle = "#6a5a40";
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i < engine.pathPoints.length; i++) {
    const p = engine.pathPoints[i]!;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  for (const t of engine.towers) {
    ctx.fillStyle = t.id === cam.id ? "#f4f4f5" : TOWERS[t.kind].color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.id === cam.id ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of engine.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = ENEMIES[e.kind].color;
    ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
  }

  // View cone
  const yaw = engine.fpvYaw + engine.fpvLookYaw;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(cam.x, cam.y);
  ctx.arc(cam.x, cam.y, 90, yaw - 0.5, yaw + 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  void vh;
}
