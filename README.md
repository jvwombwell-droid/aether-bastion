# Aether Bastion

Elemental tower defense game — hold the path across **10 levels** of **10 waves** each.

## Features

- **4 elemental towers** (Ember, Frost, Volt, Iron) with tier upgrades and rock-paper-scissors matchups
- **Enemy armor + strength/weakness buffs** (Fortify, Haste, Ward, Frail, Exposed, Regen)
- **Permanent towers** — once placed, they stay forever; new levels re-route the path around them
- **Randomized maps** each level (spawn/base can move edges; path ~30% of free tiles)
- **Exponential difficulty** across levels
- Upgrades cost **2×** placement tier prices

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
| Esc | Pause |

Built with Grok.
