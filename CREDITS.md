# Credits & licences

## Code libraries

| Library | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org/) | WebGL rendering | MIT |
| [Vite](https://vitejs.dev/) | Dev server and build | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Language | Apache-2.0 |

## 3D models, textures, fonts and audio

**None imported.** All geometry is generated procedurally in `src/world.ts` and
`src/avatar.ts` from primitive shapes (boxes, cylinders, cones). The cable-knit
pattern, the sky, the water and all sign graphics are drawn at runtime with Canvas 2D
or GLSL shaders written for this project. No Kenney, Quaternius or other third-party
asset packs are used yet. If CC0 packs are added later, list them here with their source URL.

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
