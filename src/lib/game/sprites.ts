import type { Element, EnemyKind } from "./types";

const URLS: Record<string, string> = {
  ember: "/sprites/ember.png",
  frost: "/sprites/frost.png",
  volt: "/sprites/volt.png",
  iron: "/sprites/iron.png",
  scout: "/sprites/scout.png",
  brute: "/sprites/brute.png",
  runner: "/sprites/runner.png",
  shield: "/sprites/shield.png",
  hexer: "/sprites/hexer.png",
  boss: "/sprites/boss.png",
  spawn: "/sprites/spawn.png",
  base: "/sprites/base.png",
};

const cache = new Map<string, HTMLImageElement>();

function load(key: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = URLS[key] ?? "";
    cache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : img;
}

/** Returns a ready image, or null until loaded. */
export function getSprite(key: string): HTMLImageElement | null {
  const img = load(key);
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  return img;
}

export function towerSprite(kind: Element) {
  return getSprite(kind);
}

export function enemySprite(kind: EnemyKind) {
  return getSprite(kind);
}

export function preloadSprites() {
  for (const key of Object.keys(URLS)) load(key);
}
