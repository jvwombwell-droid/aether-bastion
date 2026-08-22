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
  keep: "/sprites/keep.png",
  grass: "/sprites/grass.png",
  dirt: "/sprites/dirt.png",
};

const cache = new Map<string, HTMLImageElement>();
const retryAt = new Map<string, number>();
const RETRY_MS = 1500;

function bootImage(url: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img;
}

function load(key: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const url = URLS[key];
  if (!url) return null;
  let img = cache.get(key);
  if (!img) {
    img = bootImage(url);
    cache.set(key, img);
  } else if (img.complete && img.naturalWidth === 0) {
    // Grass/dirt may land after first paint; retry a failed fetch.
    const now = Date.now();
    if (now - (retryAt.get(key) ?? 0) >= RETRY_MS) {
      retryAt.set(key, now);
      img = bootImage(url);
      cache.set(key, img);
    }
  }
  return img;
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
