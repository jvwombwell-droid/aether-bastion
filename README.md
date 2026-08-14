# Aether Bastion

Elemental tower defense game — hold the path across **10 levels** of **10 waves** each.

## Features

- **4 elemental towers** (Ember, Frost, Volt, Iron) with tier upgrades and rock-paper-scissors matchups
- **Iron Bastion shreds armor** so weak matchups stop bouncing
- **Enemy armor + strength/weakness buffs** (Fortify, Haste, Ward, Frail, Exposed, Regen, Shred)
- **Permanent towers** — once placed, they stay forever; new levels re-route the path around them
- **The front shifts** — covering vs off-path towers are called out, with a gold resupply
- **Randomized maps** each level (spawn/base can move edges; path ~30% of free tiles)
- Escalating difficulty across 10 levels · 1.6× upgrade costs · 70% sell refund

## Play

```bash
npm install
npm run dev
```

Open the app (dev server on port 8080).

## Stack

React 19 · TypeScript · Vite · TanStack Start · Tailwind CSS

## Controls

| Key | Action |
|-----|--------|
| 1–4 | Build Ember / Frost / Volt / Iron |
| Click map | Place or select tower |
| Space | Start wave / continue level |
| U | Upgrade selected |
| X | Sell selected |
| F | Cycle game speed (1× / 2× / 3×) |
| V | Turret cam (FPV) from the selected tower |
| Esc | Pause |

Between waves, a **wave preview** shows the upcoming roster (counts, armor, bosses, buffs). Higher-tier towers can apply **debuffs** (Frail, Exposed) on hit — stack them with element matchups.

Built with Grok.
