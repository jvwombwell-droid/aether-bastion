# Aether Bastion

Elemental tower defense game — hold the path across **10 levels** of **10 waves** each.

## Features

- **The Keep** — a real 2×2 building in a map corner; the path always ends at its door. Click it to fortify (+lives)
- **4 elemental towers** (Ember, Frost, Volt, Iron) with tier upgrades and rock-paper-scissors matchups
- **Iron Bastion shreds armor** so weak matchups stop bouncing
- **Enemy armor + strength/weakness buffs** (Fortify, Haste, Ward, Frail, Exposed, Regen, Shred)
- **Towers stay forever** — there is no sell
- **The road moves after wave 2** on level 1, and after wave 4 on later levels. Covering vs inland is called out
- **Inland towers convert** to **Watch** (boss snipe, longer range), **Well** (gold that scales with the campaign level), or **Beacon** (pulls the next road). Restore Battery if the road comes back
- **Door gun** can be bought on the keep, then upgraded after purchase
- Between levels, the path re-routes around permanent towers and the keep
- Ten authored campaigns (not the same 10 wave scripts on a scaler) · 1.6× upgrade costs

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
| X / C | Convert inland tower (Watch / Well / Beacon) |
| F | Cycle game speed (1× / 2× / 3×) |
| V | Turret cam (FPV) from the selected tower |
| Esc | Pause |

Between waves, a **wave preview** shows the upcoming roster (counts, armor, bosses, buffs). Higher-tier towers can apply **debuffs** (Frail, Exposed) on hit — stack them with element matchups.

Built with Grok.
