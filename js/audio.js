/* ========== 合成音效系统 — Web Audio API 无外部文件 ========== */
'use strict';

const Sound = {
  ctx: null,
  _masterGain: null,
  _muted: false,
  _volume: 0.5,
  _noiseBuf: null,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this.ctx.destination);
      this._initNoiseBuf();
    } catch (e) { /* 无音频支持 */ }
  },

  _initNoiseBuf() {
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  },

  mute() { this._muted = true; },
  unmute() { this._muted = false; },
  isMuted() { return this._muted; },
  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); if (this._masterGain) this._masterGain.gain.value = v; },
  getVolume() { return this._volume; },

  // 确保上下文运行(某些浏览器需要用户交互后启动)
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  _playTone(freq, dur, type, vol, rampDown, when) {
    if (!this.ctx || this._muted) return;
    this.resume();
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol * this._volume, t);
    if (rampDown !== false) g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + dur);
  },

  _playNoise(dur, vol, filterFreq, when) {
    if (!this.ctx || this._muted) return;
    this.resume();
    const t = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * this._volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filterFreq;
      f.Q.value = 1.5;
      src.connect(f); f.connect(g);
    } else { src.connect(g); }
    g.connect(this._masterGain);
    src.start(t, Math.random() * 0.8);
  },

  _seqTone(freqs, vols, dur, type) {
    if (!this.ctx || this._muted) return;
    this.resume();
    let t = this.ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      this._playTone(freqs[i], dur[i] || dur, type, vols[i] || 0.2, true, t);
      t += dur[i] || dur;
    }
  },

  /* ---- 具体音效 ---- */
  click()    { this._playTone(800, 0.06, 'square', 0.15); },
  hit()      { this._playTone(120, 0.1, 'sawtooth', 0.25); },
  explosion(){ this._playNoise(0.4, 0.6); this._playTone(60, 0.35, 'sawtooth', 0.4); },
  build()    { this._seqTone([440, 660, 880], [0.2, 0.2, 0.2], 0.08, 'square'); },
  war()      { this._seqTone([200, 150], [0.3, 0.3], 0.3, 'sawtooth'); },
  found()    { this._seqTone([523, 659, 784], [0.18, 0.18, 0.18], 0.1, 'triangle'); },
  death()    { this._seqTone([300, 200], [0.2, 0.15], 0.15, 'triangle'); },
  thunder()  { this._playNoise(0.3, 0.5, 400); this._playTone(50, 0.25, 'sawtooth', 0.35); },
  water()    { this._playNoise(0.08, 0.1, 6000); },
  erupt()    { this._playNoise(0.5, 0.5); this._playTone(40, 0.4, 'sawtooth', 0.45); },
  quake()    { this._playNoise(0.6, 0.4, 100); this._playTone(30, 0.5, 'sawtooth', 0.35); },
  plague()   { this._playTone(60, 0.4, 'sawtooth', 0.15); },
  bless()    { this._seqTone([1047, 1319], [0.12, 0.2], 0.12, 'sine'); },
  rain()     { this._playNoise(0.6, 0.08, 8000); },
  rebel()    { this._seqTone([150, 100], [0.3, 0.35], 0.2, 'sawtooth'); },
};
