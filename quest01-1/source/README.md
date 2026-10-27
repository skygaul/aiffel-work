# NOVA ARMADA — 100 Stars Conquest

10 galaxies × 10 missions = 100 stages, 1,000,000 max score. WebGL2 3D arcade space shooter (Three.js + TypeScript + Vite).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scoring / content data unit tests
npm run build      # tsc --noEmit + production bundle
node scripts/gen-data.mjs   # regenerate src/data/galaxies + src/data/waves JSON
```

## Controls (rebindable in Settings)
| | |
|---|---|
| Mouse | steer (flight-stick style), LMB = main laser, RMB = missile |
| W / S | thrust / brake · A / D strafe |
| Shift | boost · Space | dash (0.25s invulnerable) |
| E | homing missiles · Q | Nova Burst (combo gauge 100%) |
| Esc / P | pause · R on result screen = instant retry |
Gamepad: left stick move, right stick aim, RT fire, X missile, Y nova, B dash, RB boost.

## URL parameters
- `?debug=1` — FPS / draw calls / memory overlay and `window.__perf`
- `?stage=G03-M05` — jump straight into a stage
- `?autoplay=1&speed=20[&stage=G01-M01&count=100]` — bot clears stages in order; results in `window.__autoplay`
- `?autoplay=1&speed=20&stages=G02-M10,G09-M06` — re-check specific stages (bot gets the upgrades a player would have by then)
- Autoplay never writes to the real save. Last full run: **100/100 cleared on first attempt**, 0 runtime errors, bot total 809,667.

## Structure
- `src/tuning.ts` all numbers · `src/scoring.ts` 4000+2000+1500+1500+1000 = 10,000 · `src/data/` generated JSON content
- `src/patterns/*.ts` 8 enemy attack patterns (one file each, common `Pattern` interface)
- `src/battle.ts` mission logic (8 mission types, waves, bosses with phases/parts) · `src/feel.ts` hit-stop, shake, VFX via event bus
- `src/worlds.ts` galaxy map (120k-point cloud, 1 draw call) + solar hub · `src/audio.ts` fully procedural SFX/BGM (no licensed assets)
- Save: `localStorage` `nova.save.v1` (failures are swallowed; the game keeps running)

## Not implemented / known gaps vs PRD
- WebGPU, online leaderboard, mobile touch (all P2/non-goals)
- Ship models are procedural/low-poly; boss meshes are procedural too (no hand-made models)
- Gamepad and key rebinding are implemented but only lightly tested
- Performance targets (60 fps / p99 ≤ 20ms) were not benchmarked on target GPUs
