// Deterministic promo render: frame-by-frame capture of the game in ?record=1 mode, offline SFX,
// original music, overlays, then one square render cropped to 1080x1920 and 1920x1080.
//
//   node promo/render.mjs [--size 1920] [--url http://127.0.0.1:47321/] [--out /tmp/promo]
//
// Private inputs (not committed): promo/private/endcard.json {"phone": "...", "url": "...", "logo": "logo.png"}
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const SIZE = Number(arg('size', 1920));
const URL = arg('url', 'http://127.0.0.1:47321/');
const OUT = resolve(arg('out', '/tmp/promo'));
const FPS = 30;
const SECONDS = 18;
const END_AT = 16; // end card holds the last 2 s
const N = FPS * SECONDS;
const DROP = 8.02;
const FRAMES = join(OUT, 'frames');
const CHROME = process.env.CHROME ?? '/usr/local/bin/google-chrome';
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// ------------------------------------------------------------------ 1. frames + sound log
if (!has('skip-frames')) {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?record=1`);
  await page.waitForFunction(() => window.__tst && document.body.classList.contains('rec'));
  await page.addScriptTag({ path: join(here, 'timeline.js') });
  await page.evaluate(() => { __promo.setup(); __tst.recBegin(); });
  const log = [];
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const r = await page.evaluate(([f, ms]) => {
      const t = __tst.tick(ms);
      __promo.step(t);
      const img = __tst.renderGrab('image/png');
      const i = __tst.info();
      return { t, img, phase: i.boost.phase, k: i.boost.k, state: i.state, pos: i.pos, night: i.night };
    }, [f, f === 0 ? 0 : 1000 / FPS]);
    writeFileSync(join(FRAMES, `${String(f).padStart(4, '0')}.png`), Buffer.from(r.img.split(',')[1], 'base64'));
    delete r.img;
    log.push({ f, ...r });
    if (f % 30 === 0) console.log(`frame ${f}/${N}  t=${r.t.toFixed(3)}  ${r.state}/${r.phase}  pos ${r.pos.map((v) => v.toFixed(1))}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  // The ambient tram bell runs on a wall-clock timer, so it is not reproducible frame-to-frame: drop it.
  const sounds = (await page.evaluate(() => __tst.soundLog())).filter((s) => s.fn !== 'tramBell');
  const markers = await page.evaluate(() => __promo.markers);
  writeFileSync(join(OUT, 'framelog.json'), JSON.stringify({ log, sounds, markers, errors }, null, 1));
  // SFX: replay the logged calls through the game's own Sound class, offline.
  const b64 = await page.evaluate(([s, sec]) => __tst.renderSfx(s, sec), [sounds, SECONDS]);
  writeWav(join(OUT, 'sfx.wav'), Buffer.from(b64, 'base64'), 48000);
  await ctx.close();
  if (errors.length) console.log('page errors:', errors);
}

function writeWav(path, pcm, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}

// ------------------------------------------------------------------ 2. music + mix
// --music espelhar (default): "Espelhar - LOUD Melodic EDM" by Fupi (CC0, OpenGameArt), cut so its
// main drop (72.242 s in the file, measured) lands on DROP. --music synth: the original promo/music.mjs track.
const MUSIC = arg('music', 'espelhar');
const TRACKS = {
  espelhar: { file: join(here, 'music', 'espelhar_fupi_cc0.ogg'), drop: 72.07, gain: 0.55 },
};
if (MUSIC === 'synth') {
  sh('node', [join(here, 'music.mjs'), join(OUT, 'music.wav'), String(DROP), String(SECONDS)]);
} else {
  const tr = TRACKS[MUSIC];
  const start = tr.drop - DROP;
  sh('ffmpeg', ['-y', '-v', 'error', '-i', tr.file, '-af',
    `atrim=start=${start.toFixed(4)}:duration=${SECONDS},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.25,afade=t=out:st=${SECONDS - 1.6}:d=1.6`,
    '-ac', '2', join(OUT, 'music.wav')]);
}
const musicGain = MUSIC === 'synth' ? 0.8 : TRACKS[MUSIC].gain;
const sfxGain = MUSIC === 'synth' ? 1.6 : 2.2;
sh('ffmpeg', ['-y', '-v', 'error', '-i', join(OUT, 'music.wav'), '-i', join(OUT, 'sfx.wav'),
  '-filter_complex', `[1:a]volume=${sfxGain}[s];[0:a]volume=${musicGain}[m];[m][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84:attack=2:release=60:level=false[a]`,
  '-map', '[a]', '-ar', '48000', '-ac', '2', join(OUT, 'mix.wav')]);

// ------------------------------------------------------------------ 3. overlays
const CAPS = [
  // id, start, end, fade-in, fade-out
  ['title', 0.25, 2.3, 0.3, 0.3],
  ['unlock', 2.7, 4.95, 0.25, 0.2],
  ['energy', MUSIC === 'synth' ? 5.25 : 6.086, 7.25, MUSIC === 'synth' ? 0.2 : 0, 0.2],
  ['speech', 7.35, 9.9, 0.15, 0.3],
  ['flash', 8 + 1 / 30, 8.3, 0, 0.27],
  ['boost', 8 + 1 / 30, 12.9, 0, 0.3],
  ['outro', 13.4, 15.85, 0.3, 0.25],
  ['end', END_AT, SECONDS, 0.3, 0],
];
const privDir = join(here, 'private');
const endcfg = existsSync(join(privDir, 'endcard.json')) ? JSON.parse(readFileSync(join(privDir, 'endcard.json'), 'utf8')) : {};
if (endcfg.logo && !/^(data|https?|file):/.test(endcfg.logo)) endcfg.logo = pathToFileURL(resolve(privDir, endcfg.logo)).href;
const OV = join(OUT, 'ov');
mkdirSync(OV, { recursive: true });
const FORMATS = { v: [1080, 1920], h: [1920, 1080] };
for (const [fmt, [w, hgt]] of Object.entries(FORMATS)) {
  const page = await browser.newPage({ viewport: { width: w, height: hgt } });
  for (const [id] of CAPS) {
    const q = new URLSearchParams({ fmt, id, cfg: encodeURIComponent(JSON.stringify(endcfg)) });
    await page.goto(`${pathToFileURL(join(here, 'overlay.html')).href}?${q}`);
    await page.waitForSelector('body[data-ready="1"]');
    await page.screenshot({ path: join(OV, `${fmt}_${id}.png`), omitBackground: true });
  }
  await page.close();
}
await browser.close();

// ------------------------------------------------------------------ 4. compose both formats
for (const [fmt, [w, hgt]] of Object.entries(FORMATS)) {
  const crop = `crop=${Math.round((w / Math.max(w, hgt)) * SIZE)}:${Math.round((hgt / Math.max(w, hgt)) * SIZE)},scale=${w}:${hgt}:flags=lanczos`;
  const inputs = ['-framerate', String(FPS), '-start_number', '0', '-i', join(FRAMES, '%04d.png')];
  let graph = `[0:v]${crop},setsar=1,format=rgba[b0];`;
  CAPS.forEach(([id, a, b, fi, fo], j) => {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(SECONDS), '-i', join(OV, `${fmt}_${id}.png`));
    const fades = [fi ? `fade=t=in:st=${a}:d=${fi}:alpha=1` : '', fo ? `fade=t=out:st=${(b - fo).toFixed(3)}:d=${fo}:alpha=1` : ''].filter(Boolean).join(',');
    graph += `[${j + 1}:v]format=rgba${fades ? ',' + fades : ''}[o${j}];[b${j}][o${j}]overlay=0:0:enable='between(t,${a},${b})'[b${j + 1}];`;
  });
  graph += `[b${CAPS.length}]format=yuv420p[v]`;
  const out = join(OUT, `tst-promo-${fmt === 'v' ? '1080x1920' : '1920x1080'}.mp4`);
  sh('ffmpeg', ['-y', '-v', 'error', ...inputs, '-i', join(OUT, 'mix.wav'), '-filter_complex', graph, '-map', '[v]', '-map', `${CAPS.length + 1}:a`,
    '-r', String(FPS), '-frames:v', String(N), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(SECONDS), '-movflags', '+faststart', out]);
  console.log('wrote', out);
}
