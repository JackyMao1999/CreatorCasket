/* ========== 随机数 & 值噪声 (用于世界生成) ========== */
'use strict';

// mulberry32 种子随机数
function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 值噪声 + fBm
class ValueNoise {
  constructor(seed) {
    const rng = makeRNG(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  _hash(x, y) { return this.perm[(this.perm[x & 255] + y) & 255] / 255; }
  _smooth(t) { return t * t * (3 - 2 * t); }
  noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = this._smooth(xf), v = this._smooth(yf);
    const a = this._hash(xi, yi), b = this._hash(xi + 1, yi);
    const c = this._hash(xi, yi + 1), d = this._hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; // 0..1
  }
  fbm(x, y, octaves) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm; // 0..1
  }
}
