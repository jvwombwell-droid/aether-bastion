# Aether Bastion

Elemental tower-defense browser game. Single frontend service (no backend, no database). See `README.md` for gameplay, controls, and stack details.

## Cursor Cloud specific instructions

This is a single-service app: React 19 + TypeScript + Vite + TanStack Start, styled with Tailwind CSS v4. Dependencies are installed by the update script (`npm ci`), so they are already present when an agent starts.

Commands (defined in `package.json`):

| Task | Command | Notes |
| --- | --- | --- |
| Dev server | `npm run dev` | Vite dev server on `0.0.0.0:8080` (`strictPort` — the port is fixed and will error if taken). Run it in a persistent/tmux terminal so it stays up. |
| Tests | `npm test` | Vitest, node environment; only `src/**/*.test.ts` files. Fast (~1s), no browser needed. |
| Typecheck | `npm run typecheck` | `tsc --noEmit`. |
| Lint | `npm run lint` | ESLint. There is one pre-existing `react-hooks/exhaustive-deps` warning in `TowerDefense.tsx` (0 errors) — not introduced by setup. |
| Build | `npm run build` | Production build only; adds the Nitro Vercel preset. Not needed for local development. |

Non-obvious notes:
- Game state is persisted to browser `localStorage`, so a reloaded page offers **Continue** to resume a run mid-level. To test from a clean slate, use a fresh browser profile or clear site data for `localhost:8080`.
- The dev server logs harmless `notFoundError` warnings for the missing `__root__` not-found route (e.g. favicon requests). These are not errors and do not indicate a crash.
- The game is a canvas-rendered app driven by keyboard (1-4 build, Space start wave, U upgrade, X sell, F speed, V turret cam) and mouse (click tiles to place/select towers). See the controls table in `README.md`.
