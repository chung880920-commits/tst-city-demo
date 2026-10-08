# 尖沙咀城市尋寶（試玩版）· TST City Hunt (demo)

A single-player, browser-based 3D feasibility demo: a stylised low-poly slice of the
Tsim Sha Tsui waterfront in Hong Kong at sunset. You walk around in third person,
find three glowing treasure points, and get a completion card at the end.

- **World:** former KCR Clock Tower, ferry pier with a docked double-ended ferry,
  harbour promenade with animated water, Salisbury Road, a Canton Road–style street,
  a Nathan Road–style neon street, a small lane, a dome and a sloped-roof hall, and
  a hazy Hong Kong Island skyline across the harbour. Traffic (taxis and a bus) drives along Salisbury Road.
- **Feel:** chase camera with smooth follow, auto-recentres behind you, and never
  clips into buildings, awnings, signs or tree crowns (see Collision below). Warm late-afternoon light,
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
| AI 加速 (when energy is full) | **E** or click the 「AI 加速」 button | 「AI 加速」 button (above 跑) |

### HUD buttons (top right)

- **⚙ Settings:** quality and 「重新開始尋寶」 (reset progress). The fps / triangles / draw-calls
  line only shows with `?debug=1`.
- **🔊 Sound:** mute / unmute. Remembered between visits. Audio starts when you press 開始
  (required by iOS Safari).
- **🌙 / ☀ Night:** fades between sunset and night (~2.5 s). At night the neon, shop windows
  and the Hong Kong Island skyline are self-lit (emissive materials, no extra lights);
  the only extra real light is one warm street-lamp glow around the player.

### Quality

Three levels: **省電** (no shadows, no lamp light, pixel ratio ≈ 0.75), **流暢**
(no shadows, pixel ratio ≤ 1.25) and **高畫質** (shadows, pixel ratio ≤ 2).
Touch devices start on 流暢, desktops on 高畫質. **Auto quality:** from the first frames (the title screen already renders the full scene),
the game measures fps for ~3.5 s and steps down (below 45 fps: 高畫質 → 流暢; below 28 fps:
→ 省電). Choosing a level by hand turns auto off and is remembered.

### Guidance and rewards

- A glowing gold line on the ground shows a walkable route to the next checkpoint
  (A* on a 4 m grid around the buildings, then smoothed).
- If you stand still for 15 s, the avatar says 「差少少啫，跟住金線行！」, the 下一站
  panel pulses and the guide line throbs.
- Unlocking a checkpoint: a large two-wave gold particle burst, a screen-space gold ring
  flash with confetti, the camera swings round and pushes in, the avatar cheers, a gold chime
  plays and the phone vibrates (where supported). The burst follows wall-clock time (closed-form
  positions, not per-frame steps) and the ring and confetti are CSS animations, so a phone running
  at 10 fps sees the same celebration as one at 60 fps. The popup opens after 1.8 s.
  The completion card adds a short jingle.

### AI 加速 / AI Boost 「針織戰甲」

Each landmark unlock fills one of three **AI 能量** segments (shown under the treasure count).
When all three are full the large 「AI 加速」 button lights up and pulses (desktop: press **E**).
On touch the button is always shown; until the meter is full it is greyed out with the count
(for example 1/3). Pressing it, or **E**, before then shows
「AI 能量未滿（1/3），再解鎖 2 個地標就用得！」 with live counts.
It is a single press; there is no double-tap trigger. After all three landmarks are found,
energy refills by one segment every 12 s so you can keep boosting while you explore.

- **Transform (1 s):** the camera moves in close and the cardigan's knit tiles flip over one by
  one into navy / cream / teal plates with gold trim. Two compact thrusters slide out of the
  back, and the bubble says 「轉型唔係換人，係升級自己」.
- **Boost (5 s):** top speed is 2 × run speed (15.2 m/s), the camera pulls back a little, and a
  gold light trail follows the feet. The energy bar drains as the time runs out.
- **Fold back (0.8 s):** the plates flip back into the cardigan.

Movement is swept: each frame's motion is split into steps of 0.18 m or less (under half the
player radius), and collisions are resolved after every step. If the player still ends up inside
a solid box, they snap back to the last safe position. The map bounds are clamped, so even at
boost speed you can't pass through buildings, railings or the pier, or leave the map. On 省電
the burst uses fewer particles and the trail is shorter. The plates add about 20 small meshes,
and only while the boost is showing. The English line
"Transformation isn't replacing you. It's upgrading you." is kept in `BOOST_LINE` in
`src/main.ts`, ready for when a 中/EN switch is added.

### Saved progress

Found checkpoints, AI energy and your position are saved in `localStorage` (`tst-progress-v1`)
every few seconds and on each unlock, so a reload continues where you left off.
Settings → 「重新開始尋寶」 clears it. Mute (`tst-muted`), night (`tst-night`) and a
manual quality choice (`tst-quality`) are remembered too.

### Test shortcut

Add `?test=1` (or `?energy=full`) to the URL to start with full AI energy, so you can try the
transform, the 2 × boost, the 5 s fold-back and boosting into walls straight away. Energy refills
after every boost, a red 「測試模式」 tag shows under the meter, and progress is saved to a
separate slot (`tst-progress-test-v1`), so normal play is unaffected. `?debug=1` shows the
fps / triangle / draw-call line in settings.

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

## Browser QA

With `npm run dev` running, these drive headless Chrome (set `CHROME` to its path and
`QA_URL` if not on port 47321). They run on software GL, so each takes several minutes.

```bash
npm run qa:touch    # mobile emulation: 2.5 s long-press + ≥ 5 s joystick drag to the first
                    # checkpoint (no context menu, no pointercancel, unlock fires), long-press on
                    # canvas/buttons, touch CSS, and every visible text ≥ 18 px on 5 screens
npm run qa:camera   # hugs 6 storefronts (static angle sweep, walk, run, AI Boost) and the unlock
                    # push-in; fails if any frame puts the camera inside / within near-plane reach
                    # of a surface, or if one colour fills > 90 % of the view
```

## Promo video (internal)

`promo/` renders an 18 s promo deterministically instead of screen-recording (software GL
stutters in real time). Opening the game with `?record=1` hides all DOM UI, forces high
quality at 1× pixel ratio, seeds `Math.random`, steps a manual clock, and logs every sound
call with its time. `promo/timeline.js` scripts the avatar and camera shot by shot.

```bash
npm run dev                                   # keep running
node promo/render.mjs                         # → /tmp/promo/tst-promo-1080x1920.mp4 and -1920x1080.mp4
node promo/verify.mjs /tmp/promo              # frame cadence, duplicates, durations, A/V sync at the drop
node promo/preview.mjs                        # fast 480 px dry run of the timeline (every 15th frame)
```

One pass renders 540 square 1920 × 1920 PNG frames (30 fps). Both formats are centre crops
of the same frames, so every shot keeps its subject inside the central square. Then:

- **Sound effects:** the logged sound calls are replayed through `src/audio.ts` into an
  `OfflineAudioContext`, sample-accurate to the frame.
- **Music:** "Espelhar" by Fupi (CC0, OpenGameArt; see `promo/MUSIC-LICENSE.md`). The
  18 s cut runs from 64.05 s to 82.05 s of the file, so its main drop (72.07 s) lands at
  8.02 s. That is exactly when the transform's armour-lock chord sounds (trigger at frame
  216, plus 0.82 s). The flash and 「AI 加速」 title appear on frame 241. Use
  `--music synth` for the original fallback track from `promo/music.mjs`.
- **Overlays:** captions and the end card are rendered from `promo/overlay.html` as
  transparent PNGs for each format and composited with ffmpeg.
- **Private end card:** the contact details and logo live in the git-ignored
  `promo/private/endcard.json` (`{"phone", "url", "logo"}`; `logo` is a file path relative
  to that folder). Without a logo file, a text wordmark is used.

## Deploy

**GitHub Pages (included workflow).** Live at
<https://chung880920-commits.github.io/tst-city-demo/>. Every push to `main` on GitHub runs
`.github/workflows/deploy.yml` (`configure-pages` → `npm run build` → `upload-pages-artifact`
→ `deploy-pages`). The repo's *Settings → Pages → Source* must be **GitHub Actions**.

The workflow builds with `BASE_PATH=/tst-city-demo/`, so asset URLs are absolute under that
sub-path. Without `BASE_PATH` (local dev, `npm run preview`, tunnels, other static hosts)
the build uses relative paths. To build the Pages variant locally:
`BASE_PATH=/tst-city-demo/ npm run build`.

**Any static host.** Upload the contents of `dist/` (Netlify drop, Cloudflare Pages,
Vercel static, S3 + CloudFront, nginx …). No server code or environment variables are needed.

## Project layout

```
src/
  main.ts      game loop, player physics, chase camera, checkpoints, HUD wiring
  world.ts     procedural TST layout, buildings, landmarks, colliders, minimap shapes, traffic
  avatar.ts    low-poly founder avatar, procedural animation, portrait renderer
  env.ts       sky shader (sunset + stars), animated water shader, lights, sunset↔night palette
  audio.ts     Web Audio synthesised footsteps, ambience, chime, jingle; mute
  guide.ts     grid A* navigator, gold guide-line ribbon, particle burst
  signs.ts     neon / shop sign texture atlas (one draw call for every sign)
  builder.ts   merges many small shapes into one vertex-coloured mesh
  input.ts     keyboard, mouse orbit, touch joystick and buttons
  minimap.ts   rotating circular minimap
  style.css    HUD, title, popups (navy + gold, large type)
```

### Collision

The player is a circle (r = 0.42 m) tested against axis-aligned boxes in the ground
plane, with box heights so low things (benches, planters) can be jumped onto. The
camera sphere-casts (r = 0.3 m) from the avatar's head against those boxes plus a
second list of camera-only 3D boxes (`camBlockers`: shop awnings, blade signs, palm and
street-tree crowns, the pier canopy) and the ground. It snaps in front of the first hit
on the same frame and eases back out slowly, a near-plane check pulls it further in if a
moving bus reaches it, and when it is boxed in against a wall it swings toward the
nearest clear angle instead of sitting against the avatar's head. This applies to normal
play, AI Boost and the unlock close-up.

On touch devices the canvas, joystick, HUD and buttons use `touch-action: none`,
`user-select: none` and `-webkit-touch-callout: none`, and `contextmenu`, `selectstart`,
`dragstart` and iOS `gesture*` events are cancelled, so a long press never opens the
browser's "save image" menu, selects text or zooms, and a held joystick drag is not cut.
No physics engine is needed for this scope, which keeps the bundle small.

### Adding real questions

Checkpoints live in `CHECKPOINTS` in `src/world.ts` (`id`, `name`, `x`, `z`). The
popup is `#popup` in `index.html`; `unlock()` in `src/main.ts` fills it. To add
scenario questions, attach a question object to each checkpoint and render it into
the popup in place of 「小任務即將推出」.
