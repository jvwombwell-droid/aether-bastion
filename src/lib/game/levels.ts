import type { WaveDef } from "./types";

/** Per-level combat exam. Standard levels only change density, not rules. */
export type LevelRule = "standard" | "thickHide" | "slipstream" | "wardedNight";

export interface LevelScript {
  name: string;
  blurb: string;
  rule: LevelRule;
  /** 1-based wave that just cleared when the road moves (before the next wave). */
  midShiftAfter: number;
  waves: WaveDef[];
}

/**
 * Ten authored campaigns. Mapgen still weaves the road;
 * these scripts decide *what* walks it.
 */
export const LEVEL_SCRIPTS: LevelScript[] = [
  {
    name: "First Watch",
    blurb: "Learn the road. After wave 2 the front moves.",
    rule: "standard",
    midShiftAfter: 2,
    waves: [
      {
        name: "Recon",
        bonusGold: 30,
        spawns: [{ kind: "scout", count: 6, interval: 0.85, delay: 0 }],
      },
      {
        name: "Frost Line",
        bonusGold: 32,
        spawns: [
          { kind: "runner", count: 5, interval: 0.7, delay: 0 },
          { kind: "scout", count: 4, interval: 0.75, delay: 2 },
        ],
      },
      {
        name: "After the Cut",
        bonusGold: 36,
        spawns: [
          { kind: "scout", count: 6, interval: 0.65, delay: 0 },
          { kind: "hexer", count: 3, interval: 1.0, delay: 1.5 },
        ],
      },
      {
        name: "Iron Primer",
        bonusGold: 38,
        spawns: [
          { kind: "brute", count: 4, interval: 1.2, delay: 0 },
          { kind: "scout", count: 6, interval: 0.6, delay: 1 },
        ],
      },
      {
        name: "Ember Guard",
        bonusGold: 40,
        spawns: [
          { kind: "shield", count: 4, interval: 1.0, delay: 0, spawnBuff: "ward", spawnBuffDuration: 5 },
          { kind: "runner", count: 4, interval: 0.65, delay: 2 },
        ],
      },
      {
        name: "Mixed Light",
        bonusGold: 42,
        spawns: [
          { kind: "shield", count: 3, interval: 1.0, delay: 0 },
          { kind: "hexer", count: 3, interval: 1.0, delay: 0.4 },
          { kind: "runner", count: 5, interval: 0.6, delay: 2 },
        ],
      },
      {
        name: "Quick Feet",
        bonusGold: 44,
        spawns: [
          { kind: "runner", count: 8, interval: 0.5, delay: 0 },
          { kind: "scout", count: 6, interval: 0.5, delay: 1 },
        ],
      },
      {
        name: "Hardened",
        bonusGold: 48,
        spawns: [
          { kind: "brute", count: 5, interval: 1.0, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 8 },
          { kind: "hexer", count: 3, interval: 0.9, delay: 2 },
        ],
      },
      {
        name: "All Fronts",
        bonusGold: 52,
        spawns: [
          { kind: "scout", count: 6, interval: 0.5, delay: 0 },
          { kind: "runner", count: 5, interval: 0.5, delay: 1 },
          { kind: "brute", count: 3, interval: 1.0, delay: 2 },
          { kind: "shield", count: 3, interval: 0.9, delay: 3 },
        ],
      },
      {
        name: "First Lord",
        bonusGold: 80,
        spawns: [
          { kind: "brute", count: 4, interval: 1.0, delay: 0 },
          { kind: "shield", count: 3, interval: 0.9, delay: 1 },
          { kind: "boss", count: 1, interval: 1, delay: 5 },
          { kind: "runner", count: 5, interval: 0.55, delay: 8 },
        ],
      },
    ],
  },
  {
    name: "Shred School",
    blurb: "Iron hides shrug off every shot until Shred cracks them.",
    rule: "thickHide",
    midShiftAfter: 4,
    waves: [
      {
        name: "Iron Recon",
        bonusGold: 32,
        spawns: [{ kind: "scout", count: 8, interval: 0.7, delay: 0 }],
      },
      {
        name: "Hide Line",
        bonusGold: 36,
        spawns: [
          { kind: "brute", count: 6, interval: 1.0, delay: 0 },
        ],
      },
      {
        name: "Thick Hide",
        bonusGold: 40,
        spawns: [
          { kind: "brute", count: 7, interval: 0.9, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "Last Hide",
        bonusGold: 42,
        spawns: [
          { kind: "brute", count: 5, interval: 0.95, delay: 0 },
          { kind: "scout", count: 8, interval: 0.5, delay: 1.5 },
        ],
      },
      {
        name: "Cracked Road",
        bonusGold: 48,
        spawns: [
          { kind: "brute", count: 6, interval: 0.9, delay: 0 },
          { kind: "scout", count: 10, interval: 0.45, delay: 2 },
        ],
      },
      {
        name: "Two Walls",
        bonusGold: 52,
        spawns: [
          { kind: "brute", count: 8, interval: 0.85, delay: 0 },
          { kind: "scout", count: 6, interval: 0.5, delay: 3 },
        ],
      },
      {
        name: "Haste Hides",
        bonusGold: 55,
        spawns: [
          { kind: "scout", count: 10, interval: 0.4, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "brute", count: 4, interval: 1.0, delay: 2 },
        ],
      },
      {
        name: "Fortified",
        bonusGold: 60,
        spawns: [
          { kind: "brute", count: 8, interval: 0.85, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 10 },
          { kind: "hexer", count: 5, interval: 0.75, delay: 2 },
        ],
      },
      {
        name: "Iron Fronts",
        bonusGold: 66,
        spawns: [
          { kind: "scout", count: 8, interval: 0.4, delay: 0 },
          { kind: "brute", count: 6, interval: 0.8, delay: 1 },
          { kind: "hexer", count: 5, interval: 0.75, delay: 3 },
        ],
      },
      {
        name: "Hide Lord",
        bonusGold: 100,
        spawns: [
          { kind: "brute", count: 7, interval: 0.8, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 10 },
          { kind: "boss", count: 1, interval: 1, delay: 5, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "scout", count: 12, interval: 0.35, delay: 8 },
        ],
      },
    ],
  },
  {
    name: "Blitz Road",
    blurb: "Runners sprint unless a gun is on First.",
    rule: "slipstream",
    midShiftAfter: 4,
    waves: [
      {
        name: "First Drill",
        bonusGold: 34,
        spawns: [{ kind: "runner", count: 8, interval: 0.45, delay: 0 }],
      },
      {
        name: "Late Pack",
        bonusGold: 38,
        spawns: [{ kind: "runner", count: 10, interval: 0.38, delay: 0 }],
      },
      {
        name: "Haste Drill",
        bonusGold: 42,
        spawns: [
          { kind: "runner", count: 12, interval: 0.32, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
        ],
      },
      {
        name: "Still Late",
        bonusGold: 44,
        spawns: [
          { kind: "runner", count: 10, interval: 0.3, delay: 0 },
          { kind: "runner", count: 6, interval: 0.28, delay: 2, spawnBuff: "haste", spawnBuffDuration: 4 },
        ],
      },
      {
        name: "After the Cut",
        bonusGold: 50,
        spawns: [
          { kind: "runner", count: 14, interval: 0.28, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
        ],
      },
      {
        name: "Split Sprint",
        bonusGold: 54,
        spawns: [
          { kind: "runner", count: 8, interval: 0.28, delay: 0 },
          { kind: "runner", count: 8, interval: 0.26, delay: 1.1, spawnBuff: "haste", spawnBuffDuration: 5 },
        ],
      },
      {
        name: "Blitz",
        bonusGold: 58,
        spawns: [
          { kind: "runner", count: 18, interval: 0.26, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
      {
        name: "Slow Bait",
        bonusGold: 62,
        spawns: [
          { kind: "brute", count: 3, interval: 1.0, delay: 0 },
          { kind: "runner", count: 12, interval: 0.26, delay: 3.2, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
      {
        name: "All Fast",
        bonusGold: 70,
        spawns: [
          { kind: "runner", count: 14, interval: 0.26, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "runner", count: 10, interval: 0.24, delay: 2 },
        ],
      },
      {
        name: "Sprint Lord",
        bonusGold: 110,
        spawns: [
          { kind: "runner", count: 12, interval: 0.26, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
          { kind: "boss", count: 1, interval: 1, delay: 4 },
          { kind: "runner", count: 12, interval: 0.24, delay: 7, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
    ],
  },
  {
    name: "Warded Night",
    blurb: "Ward holds even super-effective hits until Exposed.",
    rule: "wardedNight",
    midShiftAfter: 4,
    waves: [
      {
        name: "Ward Recon",
        bonusGold: 36,
        spawns: [{ kind: "shield", count: 5, interval: 0.9, delay: 0 }],
      },
      {
        name: "Ward Line",
        bonusGold: 40,
        spawns: [
          { kind: "shield", count: 6, interval: 0.85, delay: 0, spawnBuff: "ward", spawnBuffDuration: 7 },
        ],
      },
      {
        name: "Sealed",
        bonusGold: 44,
        spawns: [
          { kind: "shield", count: 7, interval: 0.8, delay: 0, spawnBuff: "ward", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "Night Gate",
        bonusGold: 46,
        spawns: [
          { kind: "shield", count: 6, interval: 0.8, delay: 0 },
          { kind: "shield", count: 4, interval: 0.75, delay: 3, spawnBuff: "ward", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "After the Seal",
        bonusGold: 52,
        spawns: [
          { kind: "shield", count: 8, interval: 0.75, delay: 0, spawnBuff: "ward", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "Deep Ward",
        bonusGold: 56,
        spawns: [
          { kind: "shield", count: 8, interval: 0.7, delay: 0, spawnBuff: "ward", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "Exposed Drill",
        bonusGold: 60,
        spawns: [
          { kind: "hexer", count: 6, interval: 0.7, delay: 0 },
          { kind: "shield", count: 6, interval: 0.75, delay: 1.5, spawnBuff: "ward", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "Hard Ward",
        bonusGold: 66,
        spawns: [
          { kind: "shield", count: 8, interval: 0.7, delay: 0, spawnBuff: "ward", spawnBuffDuration: 10 },
          { kind: "shield", count: 5, interval: 0.65, delay: 3, spawnBuff: "ward", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "All Warded",
        bonusGold: 72,
        spawns: [
          { kind: "shield", count: 10, interval: 0.65, delay: 0, spawnBuff: "ward", spawnBuffDuration: 10 },
          { kind: "shield", count: 6, interval: 0.6, delay: 4, spawnBuff: "ward", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "Ward Lord",
        bonusGold: 120,
        spawns: [
          { kind: "shield", count: 8, interval: 0.65, delay: 0, spawnBuff: "ward", spawnBuffDuration: 10 },
          { kind: "boss", count: 1, interval: 1, delay: 5, spawnBuff: "ward", spawnBuffDuration: 12 },
          { kind: "shield", count: 6, interval: 0.6, delay: 8, spawnBuff: "ward", spawnBuffDuration: 10 },
        ],
      },
    ],
  },
  {
    name: "Hex Current",
    blurb: "Regen hexers. Expose them or they walk it off.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Spark Recon",
        bonusGold: 38,
        spawns: [
          { kind: "hexer", count: 5, interval: 0.8, delay: 0 },
          { kind: "scout", count: 6, interval: 0.55, delay: 1 },
        ],
      },
      {
        name: "Current",
        bonusGold: 42,
        spawns: [
          { kind: "hexer", count: 7, interval: 0.7, delay: 0 },
          { kind: "runner", count: 5, interval: 0.5, delay: 2 },
        ],
      },
      {
        name: "Regen Line",
        bonusGold: 46,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.65, delay: 0, spawnBuff: "regen", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 50,
        spawns: [
          { kind: "hexer", count: 6, interval: 0.7, delay: 0 },
          { kind: "brute", count: 4, interval: 1.0, delay: 2 },
        ],
      },
      {
        name: "Hex Tide",
        bonusGold: 56,
        spawns: [
          { kind: "hexer", count: 9, interval: 0.6, delay: 0 },
          { kind: "brute", count: 4, interval: 1.1, delay: 1.5 },
          { kind: "scout", count: 8, interval: 0.4, delay: 3 },
        ],
      },
      {
        name: "Live Wire",
        bonusGold: 60,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.6, delay: 0, spawnBuff: "regen", spawnBuffDuration: 10 },
          { kind: "shield", count: 5, interval: 0.8, delay: 1 },
          { kind: "runner", count: 6, interval: 0.45, delay: 2 },
        ],
      },
      {
        name: "Spark Blitz",
        bonusGold: 64,
        spawns: [
          { kind: "runner", count: 12, interval: 0.35, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "hexer", count: 6, interval: 0.6, delay: 1 },
        ],
      },
      {
        name: "Hard Current",
        bonusGold: 70,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.6, delay: 0, spawnBuff: "regen", spawnBuffDuration: 12 },
          { kind: "brute", count: 6, interval: 0.85, delay: 2, spawnBuff: "fortify", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "All Current",
        bonusGold: 76,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.55, delay: 0 },
          { kind: "scout", count: 8, interval: 0.4, delay: 1 },
          { kind: "shield", count: 5, interval: 0.75, delay: 2 },
          { kind: "brute", count: 4, interval: 0.9, delay: 3 },
        ],
      },
      {
        name: "Hex Lord",
        bonusGold: 130,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.55, delay: 0, spawnBuff: "regen", spawnBuffDuration: 12 },
          { kind: "boss", count: 1, interval: 1, delay: 4, spawnBuff: "regen", spawnBuffDuration: 14 },
          { kind: "runner", count: 8, interval: 0.4, delay: 8 },
        ],
      },
    ],
  },
  {
    name: "Split Siege",
    blurb: "Two jobs at once. Convert inland or lose the new road.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Split Recon",
        bonusGold: 40,
        spawns: [
          { kind: "scout", count: 8, interval: 0.55, delay: 0 },
          { kind: "runner", count: 5, interval: 0.55, delay: 1 },
        ],
      },
      {
        name: "Both Lines",
        bonusGold: 44,
        spawns: [
          { kind: "brute", count: 4, interval: 1.0, delay: 0 },
          { kind: "shield", count: 4, interval: 0.9, delay: 0.5 },
          { kind: "hexer", count: 3, interval: 0.85, delay: 2 },
        ],
      },
      {
        name: "Three Ways",
        bonusGold: 48,
        spawns: [
          { kind: "runner", count: 8, interval: 0.45, delay: 0 },
          { kind: "brute", count: 4, interval: 1.0, delay: 1 },
          { kind: "hexer", count: 4, interval: 0.8, delay: 2 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 52,
        spawns: [
          { kind: "shield", count: 5, interval: 0.8, delay: 0 },
          { kind: "brute", count: 5, interval: 0.9, delay: 1 },
          { kind: "runner", count: 6, interval: 0.45, delay: 2 },
        ],
      },
      {
        name: "Hex Tide",
        bonusGold: 58,
        spawns: [
          { kind: "hexer", count: 7, interval: 0.65, delay: 0 },
          { kind: "brute", count: 5, interval: 1.0, delay: 1 },
          { kind: "scout", count: 10, interval: 0.4, delay: 3 },
        ],
      },
      {
        name: "Mixed Siege",
        bonusGold: 64,
        spawns: [
          { kind: "shield", count: 5, interval: 0.8, delay: 0 },
          { kind: "hexer", count: 5, interval: 0.8, delay: 0.4 },
          { kind: "runner", count: 8, interval: 0.42, delay: 2 },
          { kind: "brute", count: 4, interval: 1.0, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "Blitz",
        bonusGold: 68,
        spawns: [
          { kind: "runner", count: 14, interval: 0.34, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "scout", count: 10, interval: 0.35, delay: 1 },
        ],
      },
      {
        name: "Hardened",
        bonusGold: 74,
        spawns: [
          { kind: "brute", count: 7, interval: 0.85, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "shield", count: 6, interval: 0.75, delay: 2 },
          { kind: "hexer", count: 6, interval: 0.7, delay: 3 },
        ],
      },
      {
        name: "All Fronts",
        bonusGold: 80,
        spawns: [
          { kind: "scout", count: 8, interval: 0.4, delay: 0 },
          { kind: "runner", count: 8, interval: 0.4, delay: 1 },
          { kind: "brute", count: 5, interval: 0.85, delay: 2 },
          { kind: "shield", count: 5, interval: 0.75, delay: 3 },
          { kind: "hexer", count: 5, interval: 0.75, delay: 4 },
        ],
      },
      {
        name: "Twin Lords",
        bonusGold: 140,
        spawns: [
          { kind: "brute", count: 5, interval: 0.85, delay: 0 },
          { kind: "shield", count: 5, interval: 0.8, delay: 1 },
          { kind: "boss", count: 2, interval: 2.5, delay: 5, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "runner", count: 8, interval: 0.4, delay: 9 },
        ],
      },
    ],
  },
  {
    name: "Thunder March",
    blurb: "Volt armor and haste. Frost holds the line.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Spark Walk",
        bonusGold: 44,
        spawns: [
          { kind: "hexer", count: 6, interval: 0.7, delay: 0 },
          { kind: "runner", count: 6, interval: 0.5, delay: 1 },
        ],
      },
      {
        name: "March",
        bonusGold: 48,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.6, delay: 0 },
          { kind: "scout", count: 8, interval: 0.45, delay: 1.5 },
        ],
      },
      {
        name: "Haste Current",
        bonusGold: 52,
        spawns: [
          { kind: "hexer", count: 6, interval: 0.6, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
          { kind: "runner", count: 8, interval: 0.4, delay: 1, spawnBuff: "haste", spawnBuffDuration: 5 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 56,
        spawns: [
          { kind: "hexer", count: 7, interval: 0.6, delay: 0 },
          { kind: "brute", count: 5, interval: 0.9, delay: 2 },
        ],
      },
      {
        name: "Thunder Tide",
        bonusGold: 62,
        spawns: [
          { kind: "hexer", count: 10, interval: 0.5, delay: 0 },
          { kind: "runner", count: 10, interval: 0.36, delay: 2, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
      {
        name: "Storm Mix",
        bonusGold: 68,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.55, delay: 0 },
          { kind: "shield", count: 5, interval: 0.75, delay: 1 },
          { kind: "brute", count: 5, interval: 0.85, delay: 2 },
          { kind: "runner", count: 8, interval: 0.4, delay: 3 },
        ],
      },
      {
        name: "Bolt Blitz",
        bonusGold: 74,
        spawns: [
          { kind: "runner", count: 14, interval: 0.3, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
          { kind: "hexer", count: 8, interval: 0.5, delay: 1, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
      {
        name: "Hard March",
        bonusGold: 80,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.55, delay: 0, spawnBuff: "regen", spawnBuffDuration: 10 },
          { kind: "brute", count: 6, interval: 0.8, delay: 2, spawnBuff: "fortify", spawnBuffDuration: 10 },
          { kind: "shield", count: 5, interval: 0.75, delay: 3 },
        ],
      },
      {
        name: "Full Storm",
        bonusGold: 88,
        spawns: [
          { kind: "hexer", count: 10, interval: 0.5, delay: 0 },
          { kind: "runner", count: 10, interval: 0.35, delay: 1 },
          { kind: "brute", count: 5, interval: 0.8, delay: 2 },
          { kind: "shield", count: 5, interval: 0.7, delay: 3 },
        ],
      },
      {
        name: "Storm Lords",
        bonusGold: 150,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.5, delay: 0 },
          { kind: "boss", count: 2, interval: 2.2, delay: 4, spawnBuff: "haste", spawnBuffDuration: 8 },
          { kind: "runner", count: 10, interval: 0.35, delay: 8, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
    ],
  },
  {
    name: "Iron Tide",
    blurb: "Thick hides. Shred and the door gun earn their keep.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Iron Walk",
        bonusGold: 48,
        spawns: [
          { kind: "brute", count: 6, interval: 0.85, delay: 0 },
          { kind: "scout", count: 8, interval: 0.45, delay: 1 },
        ],
      },
      {
        name: "Hide Line",
        bonusGold: 52,
        spawns: [
          { kind: "brute", count: 8, interval: 0.75, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "Tide Rise",
        bonusGold: 56,
        spawns: [
          { kind: "brute", count: 7, interval: 0.8, delay: 0 },
          { kind: "hexer", count: 5, interval: 0.7, delay: 1.5 },
          { kind: "scout", count: 8, interval: 0.4, delay: 3 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 60,
        spawns: [
          { kind: "brute", count: 8, interval: 0.75, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 10 },
          { kind: "shield", count: 4, interval: 0.8, delay: 2 },
        ],
      },
      {
        name: "Iron Tide",
        bonusGold: 68,
        spawns: [
          { kind: "brute", count: 8, interval: 0.7, delay: 0 },
          { kind: "hexer", count: 6, interval: 0.65, delay: 1 },
          { kind: "scout", count: 10, interval: 0.38, delay: 3 },
        ],
      },
      {
        name: "Cracked Mix",
        bonusGold: 74,
        spawns: [
          { kind: "brute", count: 8, interval: 0.7, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 10 },
          { kind: "shield", count: 6, interval: 0.7, delay: 1 },
          { kind: "runner", count: 8, interval: 0.4, delay: 3 },
        ],
      },
      {
        name: "Heavy Blitz",
        bonusGold: 80,
        spawns: [
          { kind: "scout", count: 12, interval: 0.32, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "brute", count: 6, interval: 0.75, delay: 2 },
        ],
      },
      {
        name: "Fortress",
        bonusGold: 88,
        spawns: [
          { kind: "brute", count: 10, interval: 0.7, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "hexer", count: 6, interval: 0.65, delay: 2 },
          { kind: "shield", count: 5, interval: 0.7, delay: 3 },
        ],
      },
      {
        name: "Iron Fronts",
        bonusGold: 96,
        spawns: [
          { kind: "scout", count: 10, interval: 0.35, delay: 0 },
          { kind: "brute", count: 8, interval: 0.7, delay: 1 },
          { kind: "hexer", count: 6, interval: 0.6, delay: 2 },
          { kind: "shield", count: 5, interval: 0.7, delay: 3 },
        ],
      },
      {
        name: "Iron Lords",
        bonusGold: 160,
        spawns: [
          { kind: "brute", count: 8, interval: 0.7, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "boss", count: 2, interval: 2.0, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 14 },
          { kind: "scout", count: 10, interval: 0.35, delay: 8 },
        ],
      },
    ],
  },
  {
    name: "All Fronts",
    blurb: "Every armor at once. The keep is the hinge.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Open All",
        bonusGold: 52,
        spawns: [
          { kind: "scout", count: 8, interval: 0.45, delay: 0 },
          { kind: "runner", count: 6, interval: 0.45, delay: 1 },
          { kind: "hexer", count: 4, interval: 0.7, delay: 2 },
        ],
      },
      {
        name: "Four Colors",
        bonusGold: 56,
        spawns: [
          { kind: "brute", count: 4, interval: 0.9, delay: 0 },
          { kind: "shield", count: 4, interval: 0.85, delay: 0.5 },
          { kind: "hexer", count: 4, interval: 0.8, delay: 1 },
          { kind: "runner", count: 6, interval: 0.45, delay: 2 },
        ],
      },
      {
        name: "Press",
        bonusGold: 60,
        spawns: [
          { kind: "scout", count: 10, interval: 0.38, delay: 0 },
          { kind: "brute", count: 5, interval: 0.85, delay: 1 },
          { kind: "shield", count: 5, interval: 0.8, delay: 2 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 66,
        spawns: [
          { kind: "hexer", count: 6, interval: 0.6, delay: 0 },
          { kind: "brute", count: 5, interval: 0.8, delay: 1 },
          { kind: "runner", count: 8, interval: 0.4, delay: 2, spawnBuff: "haste", spawnBuffDuration: 5 },
        ],
      },
      {
        name: "Hex Tide",
        bonusGold: 74,
        spawns: [
          { kind: "hexer", count: 8, interval: 0.55, delay: 0 },
          { kind: "brute", count: 5, interval: 0.85, delay: 1 },
          { kind: "scout", count: 10, interval: 0.35, delay: 3 },
        ],
      },
      {
        name: "Mixed Siege",
        bonusGold: 82,
        spawns: [
          { kind: "shield", count: 6, interval: 0.7, delay: 0, spawnBuff: "ward", spawnBuffDuration: 8 },
          { kind: "hexer", count: 6, interval: 0.7, delay: 0.4 },
          { kind: "runner", count: 8, interval: 0.38, delay: 2 },
          { kind: "brute", count: 5, interval: 0.85, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 10 },
        ],
      },
      {
        name: "Blitz",
        bonusGold: 88,
        spawns: [
          { kind: "runner", count: 16, interval: 0.3, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
          { kind: "scout", count: 12, interval: 0.32, delay: 1 },
        ],
      },
      {
        name: "Hardened",
        bonusGold: 96,
        spawns: [
          { kind: "brute", count: 8, interval: 0.75, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "shield", count: 7, interval: 0.7, delay: 2 },
          { kind: "hexer", count: 7, interval: 0.65, delay: 3 },
        ],
      },
      {
        name: "Every Gate",
        bonusGold: 104,
        spawns: [
          { kind: "scout", count: 10, interval: 0.35, delay: 0 },
          { kind: "runner", count: 8, interval: 0.35, delay: 1 },
          { kind: "brute", count: 6, interval: 0.75, delay: 2 },
          { kind: "shield", count: 6, interval: 0.7, delay: 3 },
          { kind: "hexer", count: 6, interval: 0.65, delay: 4 },
        ],
      },
      {
        name: "Three Lords",
        bonusGold: 180,
        spawns: [
          { kind: "brute", count: 6, interval: 0.75, delay: 0 },
          { kind: "shield", count: 6, interval: 0.7, delay: 1 },
          { kind: "hexer", count: 6, interval: 0.65, delay: 2 },
          { kind: "boss", count: 3, interval: 2.4, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 14 },
          { kind: "runner", count: 10, interval: 0.35, delay: 10, spawnBuff: "haste", spawnBuffDuration: 6 },
        ],
      },
    ],
  },
  {
    name: "Last Stand",
    blurb: "The keep is the only promise. Grow it.",
    rule: "standard",
    midShiftAfter: 4,
    waves: [
      {
        name: "Last Recon",
        bonusGold: 56,
        spawns: [
          { kind: "scout", count: 10, interval: 0.4, delay: 0 },
          { kind: "runner", count: 8, interval: 0.4, delay: 1 },
          { kind: "hexer", count: 4, interval: 0.7, delay: 2 },
        ],
      },
      {
        name: "Closing Line",
        bonusGold: 62,
        spawns: [
          { kind: "brute", count: 6, interval: 0.8, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 8 },
          { kind: "shield", count: 6, interval: 0.75, delay: 1, spawnBuff: "ward", spawnBuffDuration: 8 },
        ],
      },
      {
        name: "No Quiet",
        bonusGold: 68,
        spawns: [
          { kind: "runner", count: 12, interval: 0.32, delay: 0, spawnBuff: "haste", spawnBuffDuration: 5 },
          { kind: "hexer", count: 6, interval: 0.6, delay: 1 },
          { kind: "brute", count: 5, interval: 0.8, delay: 2 },
        ],
      },
      {
        name: "Before the Cut",
        bonusGold: 74,
        spawns: [
          { kind: "shield", count: 7, interval: 0.7, delay: 0 },
          { kind: "hexer", count: 7, interval: 0.6, delay: 1 },
          { kind: "brute", count: 6, interval: 0.75, delay: 2 },
        ],
      },
      {
        name: "Last Tide",
        bonusGold: 84,
        spawns: [
          { kind: "hexer", count: 9, interval: 0.5, delay: 0, spawnBuff: "regen", spawnBuffDuration: 10 },
          { kind: "brute", count: 6, interval: 0.8, delay: 1 },
          { kind: "scout", count: 12, interval: 0.32, delay: 3 },
        ],
      },
      {
        name: "Siege Mix",
        bonusGold: 92,
        spawns: [
          { kind: "shield", count: 7, interval: 0.65, delay: 0, spawnBuff: "ward", spawnBuffDuration: 10 },
          { kind: "hexer", count: 7, interval: 0.6, delay: 0.4 },
          { kind: "runner", count: 10, interval: 0.34, delay: 2 },
          { kind: "brute", count: 6, interval: 0.75, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 12 },
        ],
      },
      {
        name: "Last Blitz",
        bonusGold: 100,
        spawns: [
          { kind: "runner", count: 18, interval: 0.28, delay: 0, spawnBuff: "haste", spawnBuffDuration: 6 },
          { kind: "scout", count: 14, interval: 0.3, delay: 1 },
        ],
      },
      {
        name: "Last Wall",
        bonusGold: 110,
        spawns: [
          { kind: "brute", count: 10, interval: 0.65, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 12 },
          { kind: "shield", count: 8, interval: 0.65, delay: 2 },
          { kind: "hexer", count: 8, interval: 0.55, delay: 3, spawnBuff: "regen", spawnBuffDuration: 12 },
        ],
      },
      {
        name: "Every Gate",
        bonusGold: 120,
        spawns: [
          { kind: "scout", count: 12, interval: 0.3, delay: 0 },
          { kind: "runner", count: 10, interval: 0.32, delay: 1 },
          { kind: "brute", count: 7, interval: 0.7, delay: 2 },
          { kind: "shield", count: 7, interval: 0.65, delay: 3 },
          { kind: "hexer", count: 7, interval: 0.55, delay: 4 },
        ],
      },
      {
        name: "The Keep Holds",
        bonusGold: 220,
        spawns: [
          { kind: "brute", count: 8, interval: 0.7, delay: 0, spawnBuff: "fortify", spawnBuffDuration: 14 },
          { kind: "shield", count: 7, interval: 0.65, delay: 1, spawnBuff: "ward", spawnBuffDuration: 12 },
          { kind: "hexer", count: 7, interval: 0.55, delay: 2, spawnBuff: "regen", spawnBuffDuration: 14 },
          { kind: "boss", count: 3, interval: 2.2, delay: 4, spawnBuff: "fortify", spawnBuffDuration: 16 },
          { kind: "runner", count: 12, interval: 0.3, delay: 10, spawnBuff: "haste", spawnBuffDuration: 8 },
        ],
      },
    ],
  },
];

export function levelScript(level: number): LevelScript {
  const i = Math.max(1, Math.min(LEVEL_SCRIPTS.length, level)) - 1;
  return LEVEL_SCRIPTS[i]!;
}

export function midShiftAfterWave(level: number): number {
  return levelScript(level).midShiftAfter;
}

export function levelRule(level: number): LevelRule {
  return levelScript(level).rule;
}

/** One sentence on the board during wave 1. Gone after Recon clears. */
export function reconBoardLine(level: number): string | null {
  switch (level) {
    case 1:
      return "The pip is armor. Match it, or bounce.";
    case 2:
      return "Hides bounce until Iron shreds them.";
    case 3:
      return "Runners sprint unless a gun is on First.";
    case 4:
      return "Ward holds until Exposed.";
    default:
      return null;
  }
}
