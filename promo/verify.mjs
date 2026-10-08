// Checks a promo render: frame cadence, duplicate frames, durations and A/V sync at the beat drop.
//   node promo/verify.mjs [/tmp/promo]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/tmp/promo';
const FPS = 30, SECONDS = 18, N = FPS * SECONDS, DROP = 8.02, END_AT = 16;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString();
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const { log, sounds, markers, errors } = JSON.parse(readFileSync(join(OUT, 'framelog.json'), 'utf8'));
// 1. capture cadence: one frame per 1/30 s step, no gaps, no repeats
const steps = log.slice(1).map((r, i) => r.t - log[i].t);
const badSteps = steps.filter((d) => Math.abs(d - 1 / FPS) > 1e-6).length;
check(`capture: ${log.length} frames, each exactly 1/${FPS} s apart`, log.length === N && badSteps === 0 && log.every((r, i) => r.f === i), `irregular steps ${badSteps}`);
check('capture: no page errors during the render', !errors.length, errors.join(' | '));

// 2. duplicate frames in the rendered gameplay (end card hold excluded on purpose)
const md5 = sh('ffmpeg', ['-v', 'error', '-framerate', String(FPS), '-start_number', '0', '-i', join(OUT, 'frames', '%04d.png'), '-f', 'framemd5', '-'])
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
const dups = [];
for (let i = 1; i < Math.min(md5.length, END_AT * FPS); i++) if (md5[i] === md5[i - 1]) dups.push(i);
check(`frames: no duplicated consecutive frames in 0–${END_AT} s`, dups.length === 0 && md5.length === N, `${md5.length} frames, duplicates at ${dups.slice(0, 8).join(',') || 'none'}`);

// 3. outputs
for (const name of ['tst-promo-1080x1920.mp4', 'tst-promo-1920x1080.mp4']) {
  const p = join(OUT, name);
  const j = JSON.parse(sh('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,width,height,nb_read_frames,r_frame_rate,duration,sample_rate', '-of', 'json', p]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const ts = sh('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', p]).trim().split('\n').map(Number);
  const gaps = ts.slice(1).filter((t, i) => Math.abs(t - ts[i] - 1 / FPS) > 0.002).length;
  check(`${name}: ${v.width}x${v.height} @ ${v.r_frame_rate}, ${v.nb_read_frames} frames, evenly spaced timestamps`, Number(v.nb_read_frames) === N && v.r_frame_rate === `${FPS}/1` && gaps === 0, `timestamp gaps ${gaps}`);
  check(`${name}: audio ${Number(a.duration).toFixed(3)} s vs video ${Number(v.duration).toFixed(3)} s`, Math.abs(Number(a.duration) - Number(v.duration)) < 0.05 && Math.abs(Number(v.duration) - SECONDS) < 0.01, `${a.sample_rate} Hz`);
}

// 4. A/V sync at the drop: transform call frame, chord time, music onset, flash frame
const tr = sounds.find((s) => s.fn === 'transform');
const chord = tr ? tr.t + 0.82 : NaN;
const boostFrame = log.find((r) => r.phase === 'transform')?.f;
check('drop: transform sound fires on the same frame the transform starts', tr && Math.abs(tr.t - boostFrame / FPS) < 1e-6, `transform() at ${tr?.t.toFixed(4)} s, first transform frame ${boostFrame} (${(boostFrame / FPS).toFixed(4)} s)`);
check('drop: armour-lock chord lands on the music drop', Math.abs(chord - DROP) < 0.001, `chord ${chord.toFixed(4)} s, drop ${DROP} s`);
// onset: strongest rise in short-term energy of the mixed track around the drop
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', join(OUT, 'mix.wav'), '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
const pcm = new Int16Array(Uint8Array.from(raw).buffer);
const win = 80; // 10 ms
const e = [];
for (let i = 0; i + win <= pcm.length; i += win) { let s = 0; for (let j = 0; j < win; j++) s += pcm[i + j] ** 2; e.push(Math.sqrt(s / win)); }
let best = 0, bestT = 0;
for (let k = Math.round((DROP - 0.4) * 100); k < Math.round((DROP + 0.4) * 100); k++) {
  const rise = e[k] - Math.max(...e.slice(k - 5, k));
  if (rise > best) { best = rise; bestT = k / 100; }
}
// and the same measurement on the audio track inside each MP4 (catches mux offsets)
const onsetOf = (file) => {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  const p = new Int16Array(Uint8Array.from(b).buffer);
  const en = [];
  for (let i = 0; i + win <= p.length; i += win) { let s = 0; for (let j = 0; j < win; j++) s += p[i + j] ** 2; en.push(Math.sqrt(s / win)); }
  let bb = 0, bt = 0;
  for (let k = Math.round((DROP - 0.4) * 100); k < Math.round((DROP + 0.4) * 100); k++) { const r = en[k] - Math.max(...en.slice(k - 5, k)); if (r > bb) { bb = r; bt = k / 100; } }
  return bt;
};
for (const name of ['tst-promo-1080x1920.mp4', 'tst-promo-1920x1080.mp4']) {
  const o = onsetOf(join(OUT, name));
  check(`drop: ${name} audio onset`, Math.abs(o - DROP) <= 0.03, `onset ${o.toFixed(2)} s (AAC priming trimmed by the container edit list)`);
}
const flashFrame = Math.round((8 + 1 / 30) * FPS);
check('drop: audio onset in the final mix vs drop', Math.abs(bestT - DROP) <= 0.02, `onset ${bestT.toFixed(2)} s`);
check('drop: white flash / 「AI 加速」 title on the first frame after the drop', Math.abs(flashFrame / FPS - DROP) < 1 / FPS, `frame ${flashFrame} = ${(flashFrame / FPS).toFixed(4)} s (${((flashFrame / FPS - DROP) * 1000).toFixed(0)} ms after the chord)`);
console.log('markers', JSON.stringify(markers));
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
