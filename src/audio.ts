/**
 * All sounds are synthesised at runtime with Web Audio (no sample files), so
 * they are original to this project and released as CC0 (see CREDITS.md).
 */
const MUTE_KEY = 'tst-muted';

export class Sound {
  ctx: AudioContext | null = null;
  muted = false;
  /** Rendering into an OfflineAudioContext (promo record mode): no timers, no running-state gate. */
  private offline = false;
  private master!: GainNode;
  private sfx!: GainNode;
  private waves!: GainNode;
  private city!: GainNode;
  private noise!: AudioBuffer;
  private tramTimer = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable */
    }
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Must be called from a user gesture (iOS only allows audio after one). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    // A silent one-sample buffer played inside the gesture unlocks iOS Safari.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.connect(this.ctx.destination);
    src.start(0);
  }

  /** Renders the same sounds into an offline context; call methods from ctx.suspend() callbacks. */
  attachOffline(ctx: OfflineAudioContext) {
    this.ctx = ctx as unknown as AudioContext;
    this.offline = true;
    this.muted = false;
    this.build();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  get masterGain() {
    return this.ctx ? this.master.gain.value : 0;
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Harbour waves: low-passed noise with a slow swell.
    this.waves = ctx.createGain();
    this.waves.gain.value = 0;
    this.waves.connect(this.master);
    const wSrc = ctx.createBufferSource();
    wSrc.buffer = this.noise;
    wSrc.loop = true;
    const wLp = ctx.createBiquadFilter();
    wLp.type = 'lowpass';
    wLp.frequency.value = 520;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(swell.gain);
    wSrc.connect(wLp).connect(swell).connect(this.waves);
    wSrc.start();
    lfo.start();

    // City: brown-ish rumble of distant traffic.
    this.city = ctx.createGain();
    this.city.gain.value = 0;
    this.city.connect(this.master);
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    const cSrc = ctx.createBufferSource();
    cSrc.buffer = brown;
    cSrc.loop = true;
    const cLp = ctx.createBiquadFilter();
    cLp.type = 'lowpass';
    cLp.frequency.value = 380;
    cSrc.connect(cLp).connect(this.city);
    cSrc.start();
    if (!this.offline) this.scheduleTram();
  }

  private scheduleTram() {
    window.clearTimeout(this.tramTimer);
    this.tramTimer = window.setTimeout(() => {
      this.tramBell();
      this.scheduleTram();
    }, 14000 + Math.random() * 16000);
  }

  /** The "ding-ding" of a tram drifting across the harbour. */
  tramBell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const off of [0, 0.32]) {
      this.bell(1320, t + off, 1.1, 0.07, this.city);
      this.bell(2640, t + off, 0.6, 0.025, this.city);
    }
  }

  private bell(freq: number, at: number, dur: number, vol: number, dest: AudioNode, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Ambience mix follows where the player is: waves near the shore, traffic in the streets. */
  updateAmbience(z: number, night: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const shore = Math.max(0, Math.min(1, (z + 10) / 45));
    this.waves.gain.setTargetAtTime(0.06 + shore * 0.22, t, 0.5);
    this.city.gain.setTargetAtTime((0.1 + (1 - shore) * 0.22) * (1 - night * 0.3), t, 0.5);
  }

  step(running: boolean) {
    if (!this.ctx || (this.ctx.state !== 'running' && !this.offline)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 500;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    const vol = running ? 0.32 : 0.2;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5, 0.1);
    this.bell(85 + Math.random() * 15, t, 0.07, vol * 0.6, this.sfx);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      this.bell(f, t + i * 0.085, 1.0, 0.16, this.sfx);
      this.bell(f * 2, t + i * 0.085, 0.5, 0.04, this.sfx, 'triangle');
    });
    for (let i = 0; i < 8; i++) this.bell(2600 + Math.random() * 1800, t + 0.35 + i * 0.05, 0.3, 0.025, this.sfx);
  }

  private whoosh(at: number, dur: number, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(f0, at);
    bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(at, Math.random(), dur + 0.05);
  }

  /** AI Boost: knit tiles flipping (rising wooden plucks), a weave whoosh, then a warm chord. */
  transform() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const scale = [392, 440, 523.25, 587.33, 659.25, 784, 880, 1046.5];
    for (let i = 0; i < 14; i++) {
      const f = scale[i % scale.length] * (i >= scale.length ? 2 : 1);
      this.bell(f, t + i * 0.055, 0.16, 0.07, this.sfx, 'triangle');
    }
    this.whoosh(t, 0.9, 260, 2600, 0.16);
    for (const f of [261.63, 329.63, 392, 493.88, 587.33]) this.bell(f, t + 0.8, 1.4, 0.06, this.sfx, 'triangle');
    this.bell(2093, t + 0.82, 0.9, 0.05, this.sfx);
  }

  /** Plates folding back into the cardigan: the same plucks, descending. */
  fold() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const scale = [1046.5, 880, 784, 659.25, 587.33, 523.25, 440, 392];
    scale.forEach((f, i) => this.bell(f, t + i * 0.06, 0.14, 0.06, this.sfx, 'triangle'));
    this.whoosh(t, 0.6, 2200, 300, 0.1);
  }

  private thrustGain: GainNode | null = null;

  /** Soft airy hum while the thrusters run. */
  thrust(on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.thrustGain) {
      this.thrustGain = ctx.createGain();
      this.thrustGain.gain.value = 0;
      this.thrustGain.connect(this.sfx);
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 196;
      const humG = ctx.createGain();
      humG.gain.value = 0.25;
      src.connect(bp).connect(this.thrustGain);
      hum.connect(humG).connect(this.thrustGain);
      src.start();
      hum.start();
    }
    this.thrustGain.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, on ? 0.15 : 0.25);
  }

  jingle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const beat = 0.15;
    const melody: Array<[number, number, number]> = [
      [523.25, 0, 1], [659.25, 1, 1], [783.99, 2, 1], [1046.5, 3, 2],
      [783.99, 5, 1], [1046.5, 6, 1], [1318.5, 7, 4],
    ];
    for (const [f, at, len] of melody) {
      this.bell(f, t + at * beat, len * beat + 0.4, 0.14, this.sfx, 'triangle');
      this.bell(f * 2, t + at * beat, len * beat, 0.03, this.sfx);
    }
    for (const [f, at] of [[130.81, 0], [196, 3], [261.63, 7]] as const) this.bell(f, t + at * beat, 0.9, 0.12, this.sfx, 'triangle');
  }
}
