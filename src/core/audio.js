// 声景 —— 全程序化合成：木石之声、机括之响、溪流与风
import { clamp, lerp } from './noise.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.7;
    this._last = new Map();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(c.destination);

    // 压限，避免混音爆掉
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.16;
    this.comp.connect(this.master);

    this.sfx = c.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.comp);

    this.amb = c.createGain();
    this.amb.gain.value = 0.0;
    this.amb.connect(this.master);

    this.noiseBuf = this._noise(2.2);
    this._ambient();
    this.ready = true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  _noise(sec) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.5 + last * 3.2;
    }
    return b;
  }

  // 环境底噪：溪水 + 风 + 一点低频
  _ambient() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.55;
    const g1 = c.createGain(); g1.gain.value = 0.10;
    src.connect(bp); bp.connect(g1); g1.connect(this.amb);

    const src2 = c.createBufferSource();
    src2.buffer = this.noiseBuf;
    src2.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    const g2 = c.createGain(); g2.gain.value = 0.16;
    src2.connect(lp); lp.connect(g2); g2.connect(this.amb);
    // 风的起伏
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.09;
    lfo.connect(lg); lg.connect(g2.gain);
    lfo.start();

    src.start(); src2.start();
    this._ambNodes = { g1, g2, lp, bp };
    this.amb.gain.setTargetAtTime(0.5, c.currentTime, 2.5);
  }

  _env(node, t0, a, d, peak = 1) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  // 节流：同一种音效在极短时间内不重复叠加太多
  _throttle(key, ms) {
    const now = performance.now();
    const l = this._last.get(key) || 0;
    if (now - l < ms) return false;
    this._last.set(key, now);
    return true;
  }

  tone(freq, opts = {}) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t0 = c.currentTime;
    const { type = 'triangle', a = 0.005, d = 0.2, gain = 0.25, slide = 0, detune = 0, dest = this.sfx } = opts;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + a + d);
    o.detune.value = detune;
    const g = c.createGain();
    this._env(g, t0, a, d, gain);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }

  noise(opts = {}) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t0 = c.currentTime;
    const { a = 0.004, d = 0.18, gain = 0.25, type = 'bandpass', freq = 900, q = 1.2, sweep = 0 } = opts;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + a + d);
    const g = c.createGain();
    this._env(g, t0, a, d, gain);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t0); s.stop(t0 + a + d + 0.06);
  }

  /* ------------------------------------------------------ 音效 */
  build() {
    this.noise({ freq: 320, d: 0.22, gain: 0.34, type: 'lowpass', q: 0.7 });
    this.tone(180, { type: 'sine', d: 0.24, gain: 0.22, slide: 0.6 });
    setTimeout(() => this.tone(720, { type: 'square', d: 0.07, gain: 0.07 }), 70);
    setTimeout(() => this.tone(980, { type: 'square', d: 0.06, gain: 0.05 }), 130);
  }
  upgrade() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, { type: 'triangle', d: 0.22, gain: 0.14 }), i * 70));
  }
  sell() {
    this.noise({ freq: 1600, d: 0.2, gain: 0.16, sweep: 0.3 });
    this.tone(420, { type: 'sine', d: 0.2, gain: 0.14, slide: 0.45 });
  }
  denied() {
    this.tone(140, { type: 'square', d: 0.14, gain: 0.10 });
    setTimeout(() => this.tone(105, { type: 'square', d: 0.16, gain: 0.10 }), 90);
  }
  shootBolt() {
    if (!this._throttle('bolt', 45)) return;
    this.noise({ freq: 2600, d: 0.06, gain: 0.10, sweep: 0.35, q: 2.0 });
    this.tone(760 + Math.random() * 160, { type: 'triangle', d: 0.05, gain: 0.045, slide: 0.5 });
  }
  shootStone() {
    if (!this._throttle('stone', 100)) return;
    this.noise({ freq: 260, d: 0.3, gain: 0.24, type: 'lowpass' });
    this.tone(120, { type: 'sine', d: 0.3, gain: 0.16, slide: 0.6 });
  }
  flame() {
    if (!this._throttle('flame', 130)) return;
    this.noise({ freq: 700, d: 0.24, gain: 0.13, q: 0.6, sweep: 0.6 });
  }
  frost() {
    if (!this._throttle('frost', 260)) return;
    this.tone(1760, { type: 'sine', d: 0.4, gain: 0.055, slide: 1.4 });
    this.noise({ freq: 4200, d: 0.3, gain: 0.05, q: 3 });
  }
  blade() {
    if (!this._throttle('blade', 110)) return;
    this.noise({ freq: 3200, d: 0.09, gain: 0.09, sweep: 0.25, q: 3.5 });
  }
  thunder() {
    if (!this._throttle('thunder', 90)) return;
    this.noise({ freq: 5200, d: 0.10, gain: 0.16, sweep: 0.12, q: 1.0 });
    this.tone(88, { type: 'sawtooth', d: 0.34, gain: 0.14, slide: 0.4 });
  }
  hit() {
    if (!this._throttle('hit', 55)) return;
    this.noise({ freq: 420, d: 0.07, gain: 0.09, type: 'lowpass' });
  }
  kill() {
    if (!this._throttle('kill', 60)) return;
    this.noise({ freq: 300, d: 0.16, gain: 0.16, type: 'lowpass' });
    this.tone(200 + Math.random() * 90, { type: 'sawtooth', d: 0.14, gain: 0.07, slide: 0.4 });
  }
  bossRoar() {
    this.tone(62, { type: 'sawtooth', d: 1.3, gain: 0.28, slide: 0.7 });
    this.tone(93, { type: 'square', d: 1.1, gain: 0.12, slide: 0.72 });
    this.noise({ freq: 220, d: 1.2, gain: 0.2, type: 'lowpass', sweep: 0.5 });
  }
  waveStart() {
    // 鼓 + 锣
    this.tone(70, { type: 'sine', d: 0.5, gain: 0.34, slide: 0.55 });
    this.noise({ freq: 180, d: 0.5, gain: 0.2, type: 'lowpass' });
    setTimeout(() => {
      this.tone(320, { type: 'triangle', d: 1.6, gain: 0.16, slide: 0.94 });
      this.tone(478, { type: 'triangle', d: 1.5, gain: 0.10, slide: 0.94, detune: 12 });
      this.noise({ freq: 2600, d: 1.4, gain: 0.06, q: 0.6, sweep: 0.4 });
    }, 150);
  }
  heartHit() {
    this.tone(58, { type: 'sine', d: 1.0, gain: 0.36, slide: 0.6 });
    this.noise({ freq: 140, d: 0.7, gain: 0.2, type: 'lowpass' });
  }
  skill(kind) {
    if (kind === 'bolt') {
      this.noise({ freq: 6000, d: 0.14, gain: 0.24, sweep: 0.08 });
      this.tone(66, { type: 'sawtooth', d: 0.9, gain: 0.3, slide: 0.35 });
    } else if (kind === 'freeze') {
      [1400, 1900, 2600].forEach((f, i) => setTimeout(() =>
        this.tone(f, { type: 'sine', d: 0.7, gain: 0.10, slide: 1.6 }), i * 60));
      this.noise({ freq: 3600, d: 0.8, gain: 0.09, q: 2 });
    } else {
      [392, 523, 659, 784].forEach((f, i) => setTimeout(() =>
        this.tone(f, { type: 'triangle', d: 0.5, gain: 0.12 }), i * 55));
    }
  }
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this.tone(f, { type: 'triangle', d: 0.7, gain: 0.16 }), i * 150));
  }
  defeat() {
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this.tone(f, { type: 'sine', d: 1.0, gain: 0.2, slide: 0.8 }), i * 240));
  }
  click() { this.tone(1200, { type: 'square', d: 0.03, gain: 0.04 }); }
}

export const audio = new Audio();
