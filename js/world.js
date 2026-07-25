/* ========== 世界：地块、生成、火焰/熔岩/植被模拟 ========== */
'use strict';

const TILE = 8; // 每地块像素尺寸(放大后呈现像素风)

// 地块类型
const T = {
  DEEP: 0,     // 深海
  SHALLOW: 1,  // 浅海
  SAND: 2,     // 沙滩
  GRASS: 3,    // 草地
  FOREST: 4,   // 森林
  HILL: 5,     // 丘陵
  MOUNTAIN: 6, // 高山
  LAVA: 7,     // 熔岩
  BURNT: 8,    // 焦土
};

function isWaterT(t) { return t === T.DEEP || t === T.SHALLOW; }
function isLandT(t) { return !isWaterT(t) && t !== T.LAVA; }
function passableT(t) { return isLandT(t) && t !== T.MOUNTAIN; }
function flammableT(t) { return t === T.FOREST || t === T.GRASS; }

class World {
  constructor(w, h, seed) {
    this.w = w; this.h = h;
    this.seed = seed === undefined ? (Math.random() * 1e9) | 0 : seed;
    const n = w * h;
    this.tiles = new Uint8Array(n);      // 地块类型
    this.fire = new Uint8Array(n);       // 火焰强度 0=无
    this.lavaT = new Uint16Array(n);     // 熔岩冷却剩余tick
    this.farm = new Uint8Array(n);       // 农田生长阶段 0=非农田
    this.farmV = new Int16Array(n);      // 农田所属村庄 id+1
    this.road = new Uint8Array(n);       // 道路
    this.zone = new Int16Array(n);       // 村庄领地 id+1
    this.volcanoes = [];                 // {x,y}
    this.burning = new Set();            // 正在燃烧的地块索引
    this.dirty = new Set();              // 需要重绘的地块
    this.overlayDirty = false;           // 领地/农田层需要重绘
    this.rng = makeRNG(this.seed);
    this.generate();
  }

  idx(x, y) { return x + y * this.w; }
  inB(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inB(x, y) ? this.tiles[x + y * this.w] : T.DEEP; }

  set(x, y, t) {
    if (!this.inB(x, y)) return;
    const i = x + y * this.w;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    this.dirty.add(i);
    if (t !== T.LAVA) this.lavaT[i] = 0;
    if (!flammableT(t) && this.fire[i]) this._extinguish(i);
    if (isWaterT(t) || t === T.LAVA) {
      if (this.farm[i]) { this.farm[i] = 0; this.farmV[i] = 0; this.overlayDirty = true; }
      if (this.road[i]) { this.road[i] = 0; this.overlayDirty = true; }
    }
  }

  ignite(x, y, strength) {
    if (!this.inB(x, y)) return;
    const i = x + y * this.w;
    if (!flammableT(this.tiles[i])) return;
    this.fire[i] = strength || 200;
    this.burning.add(i);
    this.dirty.add(i);
  }

  _extinguish(i) {
    this.fire[i] = 0;
    this.burning.delete(i);
    this.dirty.add(i);
  }

  setLava(x, y, ttl) {
    if (!this.inB(x, y)) return;
    const i = x + y * this.w;
    this.tiles[i] = T.LAVA;
    this.lavaT[i] = ttl || 600;
    if (this.fire[i]) this._extinguish(i);
    if (this.farm[i]) { this.farm[i] = 0; this.farmV[i] = 0; this.overlayDirty = true; }
    this.dirty.add(i);
  }

  /* ---------- 世界生成：带边缘衰减的岛屿 ---------- */
  generate() {
    const { w, h, rng } = this;
    const elev = new ValueNoise(this.seed);
    const moist = new ValueNoise(this.seed + 7777);
    const scale = 5.5 / Math.max(w, h) * 64; // 控制岛屿数量/大小
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = x + y * w;
        // 边缘衰减 -> 四周必为深海
        const nx = x / w - 0.5, ny = y / h - 0.5;
        const edge = Math.max(Math.abs(nx), Math.abs(ny)) * 2; // 0..1
        let e = elev.fbm(x * scale / 8, y * scale / 8, 5);
        e = e * 1.05 - edge * edge * 0.55;
        let t;
        if (e < 0.30) t = T.DEEP;
        else if (e < 0.42) t = T.SHALLOW;
        else if (e < 0.47) t = T.SAND;
        else if (e < 0.78) t = T.GRASS;
        else if (e < 0.88) t = T.HILL;
        else t = T.MOUNTAIN;
        // 森林由湿度决定
        if (t === T.GRASS) {
          const m = moist.fbm(x * scale / 5 + 40, y * scale / 5 + 40, 4);
          if (m > 0.58) t = T.FOREST;
        }
        this.tiles[i] = t;
      }
    }
    // 平滑：孤立的深水变浅水
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = x + y * w;
        if (this.tiles[i] === T.SHALLOW) {
          let land = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (isLandT(this.tiles[i + dx + dy * w])) land++;
          if (land === 0) this.tiles[i] = T.DEEP;
        }
      }
    }
    this.dirty.clear();
    this.fullRedraw = true;
  }

  /* ---------- 随机工具 ---------- */
  randLandPos(rng, needPassable) {
    rng = rng || this.rng;
    for (let tries = 0; tries < 400; tries++) {
      const x = (rng() * this.w) | 0, y = (rng() * this.h) | 0;
      const t = this.tiles[x + y * this.w];
      if (needPassable ? passableT(t) : isLandT(t)) return { x, y };
    }
    return null;
  }

  // 找最近的可通行陆地
  nearestLand(x, y, maxR) {
    x |= 0; y |= 0;
    if (this.inB(x, y) && passableT(this.tiles[x + y * this.w])) return { x, y };
    for (let r = 1; r < (maxR || 20); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.inB(nx, ny) && passableT(this.tiles[nx + ny * this.w])) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  /* ---------- 每tick模拟 ---------- */
  tick(game) {
    const rng = this.rng;
    const rain = game.weather.rain > 0;

    // --- 火焰蔓延 ---
    if (this.burning.size) {
      const arr = Array.from(this.burning);
      const step = rain ? 30 : 14; // 每次处理的火焰数, 雨天衰更快
      for (let k = 0; k < Math.min(arr.length, step + 10); k++) {
        const i = arr[(rng() * arr.length) | 0];
        const x = i % this.w, y = (i / this.w) | 0;
        let f = this.fire[i];
        f -= rain ? 26 : 4;
        if (f <= 0) {
          this._extinguish(i);
          // 烧尽: 森林->焦土, 草地小概率焦土
          const t = this.tiles[i];
          if (t === T.FOREST || (t === T.GRASS && rng() < 0.3)) this.set(x, y, T.BURNT);
          continue;
        }
        this.fire[i] = f;
        // 蔓延
        if (!rain && rng() < 0.35) {
          const dx = (rng() * 3 | 0) - 1, dy = (rng() * 3 | 0) - 1;
          this.ignite(x + dx, y + dy, 160 + rng() * 90 | 0);
        }
        // 烟雾粒子
        if (game.particles.length < 900 && rng() < 0.3) {
          game.addParticle(x + rng(), y + rng() * 0.5, (rng() - 0.5) * 0.05, -0.06 - rng() * 0.05,
            40 + rng() * 30 | 0, rng() < 0.5 ? '#555' : '#e07020', 1 + rng() * 1.5);
        }
      }
    }

    // --- 熔岩冷却 & 点燃周围 ---
    // 抽样检查熔岩(全图扫太贵, 用抽样)
    for (let k = 0; k < 300; k++) {
      const i = (rng() * this.tiles.length) | 0;
      if (this.tiles[i] !== T.LAVA) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      if (this.lavaT[i] > 0) {
        this.lavaT[i]--;
        // 点燃周围可燃物
        if (rng() < 0.2) {
          const dx = (rng() * 3 | 0) - 1, dy = (rng() * 3 | 0) - 1;
          this.ignite(x + dx, y + dy, 220);
        }
        if (this.lavaT[i] === 0) this.set(x, y, rng() < 0.5 ? T.MOUNTAIN : T.HILL);
      }
    }

    // --- 火山喷发 ---
    for (const v of this.volcanoes) {
      if (this.get(v.x, v.y) !== T.LAVA) this.setLava(v.x, v.y, 4000); // 保持火山口
      if (rng() < 0.02) {
        // 喷发: 周围抛射熔岩块
        const n = 2 + (rng() * 4 | 0);
        for (let j = 0; j < n; j++) {
          const a = rng() * Math.PI * 2, d = 1 + rng() * 4;
          const lx = Math.round(v.x + Math.cos(a) * d), ly = Math.round(v.y + Math.sin(a) * d);
          if (this.inB(lx, ly) && !isWaterT(this.get(lx, ly))) this.setLava(lx, ly, 300 + rng() * 500 | 0);
        }
        game.shake = Math.max(game.shake, 6);
        game.logEvent('disaster', '🌋 火山喷发!');
        for (let j = 0; j < 30; j++) {
          const a = rng() * Math.PI * 2, sp = 0.05 + rng() * 0.25;
          game.addParticle(v.x + 0.5, v.y, Math.cos(a) * sp, -0.2 - rng() * 0.3,
            50 + rng() * 60 | 0, ['#e33d1e', '#f2a03d', '#333'][(rng() * 3) | 0], 1.5 + rng() * 2);
        }
      }
    }

    // --- 植被恢复与扩散 (抽样) ---
    for (let k = 0; k < 200; k++) {
      const i = (rng() * this.tiles.length) | 0;
      const t = this.tiles[i];
      const x = i % this.w, y = (i / this.w) | 0;
      if (t === T.BURNT && rng() < (rain ? 0.08 : 0.02)) this.set(x, y, T.GRASS);
      else if (t === T.GRASS && rng() < 0.004) {
        // 邻近森林则蔓延成森林
        let nearForest = false;
        for (let dy = -1; dy <= 1 && !nearForest; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (this.get(x + dx, y + dy) === T.FOREST) { nearForest = true; break; }
        if (nearForest) this.set(x, y, T.FOREST);
      }
    }
  }
}
