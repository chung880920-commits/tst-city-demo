# 尖沙咀城市尋寶（試玩版）· TST City Hunt (demo)

A single-player, browser-based 3D feasibility demo: a stylised low-poly slice of the
Tsim Sha Tsui waterfront in Hong Kong at sunset. You walk around in third person,
find three glowing treasure points, and get a completion card at the end.

- **World:** former KCR Clock Tower, ferry pier with a docked double-ended ferry,
  harbour promenade with animated water, Salisbury Road, a Canton Road–style street,
  a Nathan Road–style neon street, a small lane, a dome and a sloped-roof hall, and
  a hazy Hong Kong Island skyline across the harbour. Traffic (taxis and a bus) drives along Salisbury Road.
- **Feel:** chase camera with smooth follow, auto-recentres behind you, and pulls
  in when a building gets between it and the player. Warm late-afternoon light,
  shadows, a rotating circular minimap with landmark markers, walk / run / jump.
- **Player:** a rounded, stylised low-poly avatar of the founder (~7k triangles), built in
  code from spheres, capsules and bevelled boxes: softer jaw, slicked-back hair swoop
  with short faded sides, cable-knit shawl-collar cardigan, white tee, dark trousers,
  hands-in-pockets idle and procedural walk/run/jump.
  The HUD portrait and title image are rendered from the same model at startup.
- **UI:** Traditional Chinese (Hong Kong Cantonese), navy `#0B1F3A` + gold `#F5C542`,
  large type (≥ 18 px body on mobile) and large touch targets.

All geometry is procedural (no downloaded models, no textures from the web). All shop
names and signs are fictional. See [`CREDITS.md`](./CREDITS.md).

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrow keys | Left virtual joystick |
| Run | Hold Shift | 「跑」 button (toggle) |
| Jump | Space | 「跳」 button |
| Camera | Drag with mouse | Drag anywhere on the 3D view |

Settings (⚙) has a quality toggle: **流暢** (no real-time shadows, pixel ratio ≤ 1.25)
and **高畫質** (shadows, pixel ratio ≤ 2). Touch devices default to 流暢. The panel
also shows live fps, triangle count and draw calls.

## Run locally

Requires Node 18+ (tested with Node 22).

```bash
npm install
npm run dev        # http://localhost:47321
```

## Build

```bash
npm run build      # type-checks, then writes static files to dist/
npm run preview    # serves dist/ on http://localhost:47322
```

`vite.config.ts` uses `base: './'`, so `dist/` works from any sub-path — a GitHub
Pages project site, an S3 bucket, a USB stick served by any static server.

## Deploy

**GitHub Pages (included workflow).** Push to `main` on GitHub, then in the repo go to
*Settings → Pages → Build and deployment → Source: GitHub Actions*. The workflow in
`.github/workflows/deploy.yml` builds and publishes `dist/`.

**Any static host.** Upload the contents of `dist/` (Netlify drop, Cloudflare Pages,
Vercel static, S3 + CloudFront, nginx …). No server code or environment variables are needed.

## Project layout

```
src/
  main.ts      game loop, player physics, chase camera, checkpoints, HUD wiring
  world.ts     procedural TST layout, buildings, landmarks, colliders, minimap shapes, traffic
  avatar.ts    low-poly founder avatar, procedural animation, portrait renderer
  env.ts       sunset sky shader, animated water shader, lights
  signs.ts     neon / shop sign texture atlas (one draw call for every sign)
  builder.ts   merges many small shapes into one vertex-coloured mesh
  input.ts     keyboard, mouse orbit, touch joystick and buttons
  minimap.ts   rotating circular minimap
  style.css    HUD, title, popups (navy + gold, large type)
```

### Collision

The player is a circle (r = 0.42 m) tested against axis-aligned boxes in the ground
plane, with box heights so low things (benches, planters) can be jumped onto. The
camera ray-casts the same boxes and pulls in when a wall is between it and the player.
No physics engine is needed for this scope, which keeps the bundle small.

### Adding real questions

Checkpoints live in `CHECKPOINTS` in `src/world.ts` (`id`, `name`, `x`, `z`). The
popup is `#popup` in `index.html`; `unlock()` in `src/main.ts` fills it. To add
scenario questions, attach a question object to each checkpoint and render it into
the popup in place of 「題目稍後加入」.
