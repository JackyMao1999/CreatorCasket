/* ========== 合成音效系统 — Web Audio API 无外部文件 ========== */
'use strict';

const Sound = {
  ctx: null,
  _masterGain: null,
  _muted: false,
  _volume: 0.5,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this.ctx.destination);
    } catch (e) { /* 无音频支持 */ }
  },

  // 确保上下文运行(某些浏览器需要用户交互后启动)
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  // 白噪声缓冲(用于爆炸/火焰音效)
  _noiseBuf(duration) {
    const sr = this.ctx.sampleRate;
    const len = (sr * duration) | 0;
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  _playTone(freq, dur, type, vol, rampDown) {
    if (!this.ctx || this._muted) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol * this._volume, this.ctx.currentTime);
    if (rampDown !== false) g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this._masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  },

  _playNoise(dur, vol, filterFreq) {
    if (!this.ctx || this._muted) return;
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf(dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * this._volume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filterFreq;
      f.Q.value = 1.5;
      src.connect(f); f.connect(g);
    } else { src.connect(g); }
    g.connect(this._masterGain);
    src.start();
  },

  /* ---- 具体音效 ---- */
  click()    { this._playTone(800, 0.06, 'square', 0.15); },
  hit()      { this._playTone(120, 0.1, 'sawtooth', 0.25); },
  explosion(){ this._playNoise(0.4, 0.6); this._playTone(60, 0.35, 'sawtooth', 0.4); },
  fire()     { this._playNoise(0.15, 0.18, 2000); },
  build()    { this._playTone(440, 0.08, 'square', 0.2);
               setTimeout(() => this._playTone(660, 0.08, 'square', 0.2), 80);
               setTimeout(() => this._playTone(880, 0.12, 'square', 0.2), 160); },
  war()      { this._playTone(200, 0.3, 'sawtooth', 0.3);
               setTimeout(() => this._playTone(150, 0.3, 'sawtooth', 0.3), 200); },
  found()    { this._playTone(523, 0.1, 'triangle', 0.18);
               setTimeout(() => this._playTone(659, 0.1, 'triangle', 0.18), 100);
               setTimeout(() => this._playTone(784, 0.15, 'triangle', 0.18), 200); },
  death()    { this._playTone(300, 0.15, 'triangle', 0.2);
               setTimeout(() => this._playTone(200, 0.2, 'triangle', 0.15), 100); },
  thunder()  { this._playNoise(0.3, 0.5, 400);
               this._playTone(50, 0.25, 'sawtooth', 0.35); },
  water()    { this._playNoise(0.08, 0.1, 6000); },
  erupt()    { this._playNoise(0.5, 0.5);
               this._playTone(40, 0.4, 'sawtooth', 0.45); },
  quake()    { this._playNoise(0.6, 0.4, 100); this._playTone(30, 0.5, 'sawtooth', 0.35); },
  plague()   { this._playTone(60, 0.4, 'sawtooth', 0.15); },
  bless()    { this._playTone(1047, 0.15, 'sine', 0.12);
               setTimeout(() => this._playTone(1319, 0.2, 'sine', 0.12), 120); },
  rain()     { this._playNoise(0.6, 0.08, 8000); },
  rebel()    { this._playTone(150, 0.2, 'sawtooth', 0.3);
               setTimeout(() => this._playTone(100, 0.25, 'sawtooth', 0.35), 200); },
};
