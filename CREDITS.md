# Credits & licences

## Code libraries

| Library | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | WebGL rendering | MIT |
| [Vite](https://vitejs.dev/) | Dev server and build | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Language | Apache-2.0 |

## 3D models, textures, fonts and sound

**None imported.** All geometry is generated procedurally in `src/world.ts` and
`src/avatar.ts` from primitive shapes (boxes, bevelled boxes, spheres, capsules, cylinders, cones). The cable-knit
pattern, the sky, the water and all sign graphics are drawn at runtime with Canvas 2D
or GLSL shaders written for this project. No Kenney, Quaternius or other third-party
asset packs are used yet. If CC0 packs are added later, list them here with their source URL.

### Sound

No sample files, recordings or music are bundled. Every sound is synthesised live in
the browser by `src/audio.ts` with the Web Audio API (oscillators, generated noise and
filters). They were written for this project and are released as
**CC0 1.0 (public domain dedication)**.

| Sound | How it is made | Licence |
|---|---|---|
| Footsteps | Short band-passed white-noise click plus a low sine thump, pitch randomised per step | CC0 (self-made) |
| Harbour waves | Looping low-passed white noise, volume swelled by a slow LFO; louder near the shore | CC0 (self-made) |
| City rumble | Looping low-passed brown noise; louder in the streets, softer at night | CC0 (self-made) |
| Tram bell 「叮叮」 | Two sine-bell partial pairs, played at random every 14–30 s | CC0 (self-made) |
| Gold unlock chime | Rising C-major arpeggio (C6–E6–G6–C7) of sine bells plus sparkle tones | CC0 (self-made) |
| AI Boost transform 「針織戰甲」 | 14 rising pentatonic triangle-wave plucks (one per knit tile flipping), a band-passed noise "weave" whoosh sweeping up, then a soft Cmaj9 chord | CC0 (self-made) |
| AI Boost thruster hum | Looping band-passed noise plus a quiet 196 Hz sine, faded in/out | CC0 (self-made) |
| AI Boost fold-back | The same plucks descending, with a downward whoosh | CC0 (self-made) |
| Completion jingle | Original 8-beat triangle-wave fanfare with a bass line (not based on any existing tune) | CC0 (self-made) |

### Promo video (`promo/`, internal review only)

| Element | Source | Licence |
|---|---|---|
| Music: "Espelhar - LOUD Melodic EDM" by [Fupi](https://opengameart.org/users/fupi), 18 s cut (64.05–82.05 s) | [OpenGameArt](https://opengameart.org/content/espelhar-loud-melodic-edm), file `promo/music/espelhar_fupi_cc0.ogg`; details in `promo/MUSIC-LICENSE.md` | CC0 1.0 |
| Fallback music (`--music synth`, not used in the current cut) | Original composition, synthesised sample-by-sample by `promo/music.mjs` | CC0 1.0 (self-made) |
| Sound effects in the video | The game's own `src/audio.ts` sounds, re-rendered offline from the recorded run | CC0 1.0 (self-made) |
| Caption font | [Noto Sans CJK TC](https://github.com/notofonts/noto-cjk) (system package `fonts-noto-cjk`), used only to render captions into the video; not bundled | SIL Open Font License 1.1 |
| GoProjects logo and end-card contact details | Supplied by the client; kept in the git-ignored `promo/private/`, not committed | Client-owned |

Credit line: **Music: Espelhar by Fupi, CC0, OpenGameArt**. CC0 does not require
attribution; it is credited anyway.

Text is rendered with the visitor's system fonts (for example PingFang HK, Microsoft
JhengHei or Noto Sans TC); no font files are bundled.

## Original character feature: AI 加速 / Knit Armor

The 「針織戰甲」 boost is an original design for this project: the avatar's own cable-knit
cardigan tiles flip over into a few low-poly navy / cream / teal plates with gold trim, and two
small thrusters slide out of the back plate. It deliberately avoids any well-known franchise
look: no red-and-gold suit, no glowing chest light, no helmet or mask (his face stays
visible), no vehicle-to-robot change, and the sounds are soft marimba-like plucks rather than
mechanical transformation or repulsor effects.

## Names, brands and likeness

- All shop names and signs (金龍茶餐廳, 好運找換, 浪花坊 WAVEFRONT ARCADE, 晨星號, 渡海小輪 …)
  are **fictional**. Any similarity to real businesses is unintended.
- Real place names (尖沙咀鐘樓, 天星碼頭, 彌敦道, 廣東道, 梳士巴利道, 漢口道) are used only
  as geographic labels. No operator logos, liveries or trademarks are reproduced.
- The demo uses no assets, logos, fonts or names from the Grand Theft Auto series.
- The player avatar is a stylised cartoon of the project's founder, made at his request.
  His reference photo is **not** included in this repository or the build.
