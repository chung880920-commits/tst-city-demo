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
| Completion jingle | Original 8-beat triangle-wave fanfare with a bass line (not based on any existing tune) | CC0 (self-made) |

Text is rendered with the visitor's system fonts (for example PingFang HK, Microsoft
JhengHei or Noto Sans TC); no font files are bundled.

## Names, brands and likeness

- All shop names and signs (金龍茶餐廳, 好運找換, 浪花坊 WAVEFRONT ARCADE, 晨星號, 渡海小輪 …)
  are **fictional**. Any similarity to real businesses is unintended.
- Real place names (尖沙咀鐘樓, 天星碼頭, 彌敦道, 廣東道, 梳士巴利道, 漢口道) are used only
  as geographic labels. No operator logos, liveries or trademarks are reproduced.
- The demo uses no assets, logos, fonts or names from the Grand Theft Auto series.
- The player avatar is a stylised cartoon of the project's founder, made at his request.
  His reference photo is **not** included in this repository or the build.
