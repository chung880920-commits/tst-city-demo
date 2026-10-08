// Original promo track, synthesised from scratch (no samples). Released CC0 with the project.
// usage: node promo/music.mjs out.wav [dropSeconds] [totalSeconds]
import { writeFileSync } from 'node:fs';

const SR = 48000;
const out = process.argv[2] ?? 'music.wav';
const DROP = Number(process.argv[3] ?? 8.02);
const TOTAL = Number(process.argv[4] ?? 18);
const BEAT = 0.5; // 120 BPM
const N = Math.ceil(TOTAL * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const busRev = new Float32Array(N);

let seed = 20261008;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const beatT = (b) => DROP + b * BEAT; // b = beats relative to the drop

function add(t0, dur, fn, { gain = 1, pan = 0, rev = 0 } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR));
  const i1 = Math.min(N, Math.round((t0 + dur) * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const st = {};
  for (let i = i0; i < i1; i++) {
    const t = (i - Math.round(t0 * SR)) / SR;
    const v = fn(t, st);
    L[i] += v * gl;
    R[i] += v * gr;
    busRev[i] += v * gain * rev;
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---- instruments
const marimba = (m) => (t) => {
  const f = mtof(m);
  return env(t, 0.003, 0.22) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 30));
};
const pad = (ms, dur) => (t) => {
  const a = Math.min(1, t / 0.6) * Math.min(1, (dur - t) / 0.5);
  let v = 0;
  for (const m of ms) for (const det of [-0.08, 0.08]) {
    const f = mtof(m + det);
    v += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * f * 2 * t) * 0.6);
  }
  return (a * v) / (ms.length * 2);
};
const kick = (t) => {
  const f = 45 + 110 * Math.exp(-t * 30);
  return Math.sin(2 * Math.PI * f * t * (1 - Math.exp(-t * 30) * 0.3)) * env(t, 0.002, 0.16);
};
const noiseHit = (dec, hp = 0.5) => (t, s) => {
  const x = rnd() * 2 - 1;
  s.p = s.p ?? 0;
  const y = x - s.p * hp;
  s.p = x;
  return y * env(t, 0.001, dec);
};
const clap = (t, s) => noiseHit(0.09, 0.2)(t, s) * (t < 0.02 ? (Math.floor(t * 300) % 2 ? 0.6 : 1) : 1);
const bass = (m) => (t, s) => {
  const f = mtof(m);
  const saw = 2 * ((f * t) % 1) - 1;
  s.y = s.y ?? 0;
  const cut = 0.04 + 0.25 * Math.exp(-t * 14);
  s.y += cut * (saw - s.y);
  return (s.y * 1.6 + 0.5 * Math.sin(2 * Math.PI * f * t)) * env(t, 0.004, 0.35);
};
const lead = (m) => (t) => {
  const f = mtof(m) * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 4));
  const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 + Math.sin(2 * Math.PI * f * t) * 0.65;
  return sq * env(t, 0.01, 0.3);
};

// ---- arrangement (A minor pentatonic / C major colour)
const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66 - 1]]; // Am7 Fmaj7 Cmaj7 G6
const ARP = [69, 72, 76, 79, 81, 79, 76, 72];

// Intro: 4 bars before the drop
for (let bar = 0; bar < 4; bar++) {
  const t = beatT(-16 + bar * 4);
  add(t, 2.05, pad(CH[bar].map((m) => m + 12), 2.05), { gain: 0.16, rev: 0.5 });
  for (let i = 0; i < 8; i++) {
    const m = ARP[(i + bar * 2) % 8] + (bar === 3 && i > 3 ? 2 : 0);
    add(t + i * 0.25, 0.6, marimba(m), { gain: 0.22 * (0.7 + 0.3 * (bar / 3)), pan: i % 2 ? 0.35 : -0.35, rev: 0.35 });
  }
  if (bar >= 2) for (let i = 0; i < 8; i++) add(t + i * 0.25, 0.08, noiseHit(0.025, 0.95), { gain: 0.05 + (i % 2) * 0.03, pan: 0.2 });
}
// riser + snare roll into the drop, with a short breath of silence
add(DROP - 2, 1.9, (t, s) => noiseHit(9, 0.9)(t, s) * (t / 1.9) ** 2 * 0.6, { gain: 0.5, rev: 0.4 });
add(DROP - 2, 1.9, (t) => Math.sin(2 * Math.PI * (200 + 600 * (t / 1.9) ** 2) * t) * (t / 1.9) ** 3 * 0.25, { gain: 0.5 });
for (let k = 0; k < 16; k++) {
  const tt = DROP - 1 + k * (0.9 / 16);
  add(tt, 0.1, noiseHit(0.05, 0.4), { gain: 0.08 + 0.2 * (k / 15), rev: 0.2 });
}

// DROP: impact
add(DROP, 2.2, (t) => Math.sin(2 * Math.PI * (40 + 30 * Math.exp(-t * 6)) * t) * env(t, 0.003, 0.7), { gain: 0.9 });
add(DROP, 2.5, noiseHit(0.8, 0.98), { gain: 0.28, rev: 0.7 });
add(DROP, 1.6, pad([60, 64, 67, 71, 74], 1.6), { gain: 0.3, rev: 0.6 });

// Groove: 12 beats after the drop (≈ boost run), then 4-beat breakdown
const HOOK = [[0, 81, 0.5], [1, 84, 0.5], [1.5, 81, 0.25], [2, 79, 0.5], [3, 76, 1], [4, 79, 0.5], [5, 81, 0.5], [6, 84, 0.5], [6.5, 86, 0.5], [7, 88, 1]];
const BASS = [45, 45, 41, 41, 36, 36, 43, 43];
for (let b = 0; b < 12; b++) {
  const t = beatT(b);
  add(t, 0.4, kick, { gain: 0.85 });
  if (b % 2 === 1) add(t, 0.25, clap, { gain: 0.32, rev: 0.25 });
  for (let h = 0; h < 4; h++) add(t + h * 0.125, 0.06, noiseHit(h % 2 ? 0.02 : 0.035, 0.97), { gain: h % 2 ? 0.05 : 0.08, pan: -0.25 });
  add(t + 0.25, 0.4, bass(BASS[Math.floor(b / 2) % 8] + (b % 2 ? 12 : 0)), { gain: 0.32 });
  add(t, 0.42, bass(BASS[Math.floor(b / 2) % 8]), { gain: 0.36 });
  if (b % 4 === 0) add(t, 2, pad(CH[(b / 4) % 4].map((m) => m + 12), 2), { gain: 0.12, rev: 0.5 });
}
for (const rep of [0, 8]) for (const [b, m, len] of HOOK) if (rep + b < 12) add(beatT(rep + b), len * BEAT + 0.3, lead(m), { gain: 0.16, pan: 0.15, rev: 0.4 });
// breakdown (fold back) and end-card resolve
for (let i = 0; i < 8; i++) add(beatT(12) + i * 0.25, 0.6, marimba([81, 79, 76, 72, 76, 72, 69, 67][i]), { gain: 0.2, pan: i % 2 ? 0.3 : -0.3, rev: 0.4 });
add(beatT(12), 0.4, kick, { gain: 0.6 });
add(beatT(14), 0.4, kick, { gain: 0.5 });
add(beatT(16), TOTAL - beatT(16), pad([48, 55, 60, 64, 67, 71, 74], TOTAL - beatT(16)), { gain: 0.26, rev: 0.6 });
for (const [i, m] of [72, 76, 79, 84].entries()) add(beatT(16) + i * 0.12, 1.4, marimba(m), { gain: 0.2, rev: 0.6 });

// ---- reverb (Schroeder) + master
const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
for (let n = 0; n < N; n++) {
  let y = 0;
  for (const c of combs) {
    const o = c.buf[c.i];
    c.buf[c.i] = busRev[n] + o * 0.82;
    c.i = (c.i + 1) % c.d;
    y += o;
  }
  y *= 0.25;
  for (const a of aps) {
    const o = a.buf[a.i];
    const v = y + o * 0.5;
    a.buf[a.i] = v;
    a.i = (a.i + 1) % a.d;
    y = o - v * 0.5;
  }
  L[n] += y * 0.35;
  R[n] += y * 0.35 * (n % 3 ? 1 : 0.98);
}
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const g = 0.89 / peak;
const fadeIn = 0.02 * SR;
const fadeOut = 1.2 * SR;
const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const f = Math.min(1, n / fadeIn) * Math.min(1, (N - n) / fadeOut);
  const s = (x) => Math.max(-1, Math.min(1, Math.tanh(x * g * 1.1) * f));
  data.writeInt16LE(Math.round(s(L[n]) * 32767), 44 + n * 4);
  data.writeInt16LE(Math.round(s(R[n]) * 32767), 46 + n * 4);
}
writeFileSync(out, data);
console.log(`wrote ${out}: ${TOTAL}s, drop at ${DROP}s, peak normalised`);
