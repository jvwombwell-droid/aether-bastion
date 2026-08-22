# Aether Bastion

Elemental tower defense game — hold the path across **10 levels** of **10 waves** each.

## Features

- **The Keep** — a real 2×2 building in a map corner; the path always ends at its door. Click it to fortify (+lives)
- **4 elemental towers** (Ember, Frost, Volt, Iron) with tier upgrades and rock-paper-scissors matchups
- **Iron Bastion shreds armor** so weak matchups stop bouncing
- **Enemy armor + strength/weakness buffs** (Fortify, Haste, Ward, Frail, Exposed, Regen, Shred)
- **Towers stay forever** — there is no sell
- **The road moves after wave 4** of each level (before Hex Tide / wave 5). Covering vs inland is called out
- **Inland towers convert** to **Watch** (longer range, slower fire) or **Well** (gold each wave). Restore Battery if the road comes back
- Between levels, the path re-routes around permanent towers and the keep
- Escalating difficulty across 10 levels · 1.6× upgrade costs

## Play

```bash
npm install
npm run dev
```

Open the app (dev server on port 8080). Between waves, **Continue** resumes a saved run after a refresh.

```bash
npm test
```

## Stack

React 19 · TypeScript · Vite · TanStack Start · Tailwind CSS

## Controls

| Key | Action |
|-----|--------|
| 1–4 | Build Ember / Frost / Volt / Iron |
| Click map | Place or select tower |
| Click keep | Fortify (+lives) |
| Space | Start wave / continue level |
| U | Upgrade selected |
| X / C | Convert inland tower to Watch / Well |
| F | Cycle game speed (1× / 2× / 3×) |
| V | Turret cam (FPV) from the selected tower |
| Esc | Pause |

Between waves, a **wave preview** shows the upcoming roster (counts, armor, bosses, buffs). Higher-tier towers can apply **debuffs** (Frail, Exposed) on hit — stack them with element matchups.

Built with Grok.
