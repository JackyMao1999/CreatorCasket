/* ========== 主程序：游戏状态、循环、输入、存档 ========== */
'use strict';

/* ---------- base64 工具(存档) ---------- */
function u8ToB64(a) {
  let s = '';
  for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
  return btoa(s);
}
function b64ToU8(b, Ctor) {
  const s = atob(b);
  const a = new Ctor(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
// 16位数组按字节视图序列化(直接fromCharCode会因值>255报错)
function u16ToB64(a) { return u8ToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
function b64ToU16(b, Ctor) {
  const u8 = b64ToU8(b, Uint8Array);
  if (u8.length % 2) throw new Error('bad 16bit data');
  const out = new Ctor(u8.length / 2);
  new Uint8Array(out.buffer).set(u8);
  return out;
}

const Game = {
  world: null,
  units: [], villages: [], kingdoms: [],
  particles: [], tornadoes: [], tnts: [], quakes: [],
  events: [],
  settings: {},
  cam: { x: 0, y: 0, zoom: 2 },
  speed: 3, paused: false,
  tool: 'inspect', currentTool: null, brush: 2,
  tick: 0,
  weather: { rain: 0 },
  shake: 0,
  selected: null,
  maxUnits: 900,
  mouse: { x: 0, y: 0, wx: 0, wy: 0, inCanvas: false },
  cv: null,
  renderer: null, ui: null,

  villageById(id) { return this.villages.find(v => v.id === id) || null; },
  kingdomById(id) { return this.kingdoms.find(k => k.id === id) || null; },

  addParticle(x, y, vx, vy, life, color, size) {
    if (!this.settings.showParticles || this.particles.length > 1500) return;
    this.particles.push({ x, y, vx, vy, life, color, size: size || 1.5 });
  },

  _toastTimer: null,
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
  },

  logEvent(type, msg, color) {
    const entry = { year: (this.tick / 600) | 0, type, msg, color: color || null };
    this.events.unshift(entry);
    if (this.events.length > 150) this.events.length = 150;
    this.toast(msg);
    if (this.settings.autoPauseEvents && type !== 'world') {
      this.paused = true; this.ui && this.ui.setPaused(true);
    }
    if (this.ui) this.ui.refreshEventLog();
  },

  loadSettings() {
    const def = { worldSize: 192, maxUnits: 900, showZones: true, showVillageNames: true, showParticles: true, autoPauseEvents: false, worldLaws: { noWar: false, noPlague: false, noFire: false, noHunger: false } };
    try {
      const s = JSON.parse(localStorage.getItem('wb_settings') || '{}');
      this.settings = Object.assign(def, s);
      if (!this.settings.worldLaws) this.settings.worldLaws = Object.assign({}, def.worldLaws);
    } catch(e) { this.settings = Object.assign({}, def); }
  },
  saveSettings() { localStorage.setItem('wb_settings', JSON.stringify(this.settings)); },

  select(sel) { this.selected = sel; this.ui && this.ui.refreshInspector(); },

  zoomBy(f, sx, sy) {
    sx = sx === undefined ? this.cv.width / 2 : sx;
    sy = sy === undefined ? this.cv.height / 2 : sy;
    const before = this.renderer.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(0.3, Math.min(8, this.cam.zoom * f));
    const after = this.renderer.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
  },

  /* ---------- 新世界 ---------- */
  newWorld(size) {
    this.world = new World(size, size);
    this.units = []; this.villages = []; this.kingdoms = [];
    this.particles = []; this.tornadoes = []; this.tnts = []; this.quakes = [];
    this.events = [];
    this.tick = 0; this.shake = 0; this.selected = null;
    this.weather.rain = 0;
    this.maxUnits = this.settings.maxUnits || 900;
    this.cam.x = size / 2; this.cam.y = size / 2;
    this.cam.zoom = Math.max(0.8, Math.min(window.innerWidth, window.innerHeight) / (size * TILE) * 1.2);
    this.renderer.allocMapCaches();
    this.renderer.unitSprites.clear();
    // 初始生命
    for (let g = 0; g < 3; g++) {
      const p = this.world.randLandPos(null, true);
      if (p) spawnUnits(this, 'human', p.x, p.y, 6);
    }
    for (let i = 0; i < 15; i++) { const p = this.world.randLandPos(null, true); if (p) spawnUnits(this, 'sheep', p.x, p.y, 2); }
    for (let i = 0; i < 8; i++) { const p = this.world.randLandPos(null, true); if (p) spawnUnits(this, 'chicken', p.x, p.y, 3); }
    for (let i = 0; i < 5; i++) { const p = this.world.randLandPos(null, true); if (p) spawnUnits(this, 'cow', p.x, p.y, 2); }
    for (let i = 0; i < 3; i++) { const p = this.world.randLandPos(null, true); if (p) spawnUnits(this, 'wolf', p.x, p.y, 1); }
    this.logEvent('world', '🌍 新世界诞生了!');
  },

  newWorldPrompt() {
    if (!confirm('确定要生成新世界吗？当前世界将被清空（可先 💾 保存）')) return;
    this.newWorld(this.settings.worldSize || 192);
  },

  /* ---------- 存档 ---------- */
  saveWorld() {
    try {
      const w = this.world;
      const data = {
        ver: 1, w: w.w, h: w.h, seed: w.seed, tick: this.tick,
        tiles: u8ToB64(w.tiles), lavaT: u16ToB64(w.lavaT),
        farm: u8ToB64(w.farm), farmV: u16ToB64(w.farmV), road: u8ToB64(w.road),
        resource: u8ToB64(w.resource), fire: u8ToB64(w.fire),
        volcanoes: w.volcanoes,
        units: this.units.map(u => ({
          race: u.race, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, age: u.age,
          village: u.village, kingdom: u.kingdom, job: u.job, name: u.name,
          bless: u.bless, plague: u.plague, hasBoat: u.hasBoat, weapon: u.weapon
        })),
        villages: this.villages.map(v => ({
          id: v.id, name: v.name, race: v.race, kingdom: v.kingdom,
          cx: v.cx, cy: v.cy, radius: v.radius, food: v.food, wood: v.wood, gold: v.gold, stone: v.stone, pop: v.pop, unrest: v.unrest,
          buildings: v.buildings, farmTiles: v.farmTiles,
        })),
        kingdoms: this.kingdoms.map(k => ({
          id: k.id, name: k.name, race: k.race, color: k.color,
          villages: k.villages, wars: [...k.wars], allies: [...k.allies],
        })),
        cam: this.cam,
        events: this.events.slice(0, 80),
      };
      localStorage.setItem('wb_save', JSON.stringify(data));
      this.toast('💾 世界已保存!');
    } catch (e) {
      this.toast('⚠️ 保存失败: ' + e.message);
    }
  },

  loadWorld() {
    const raw = localStorage.getItem('wb_save');
    if (!raw) { this.toast('⚠️ 没有找到存档'); return; }
    try {
      const d = JSON.parse(raw);
      const w = new World(d.w, d.h, d.seed);
      w.tiles = b64ToU8(d.tiles, Uint8Array);
      w.lavaT = b64ToU16(d.lavaT, Uint16Array);
      w.farm = b64ToU8(d.farm, Uint8Array);
      w.farmV = b64ToU16(d.farmV, Int16Array);
      w.road = b64ToU8(d.road, Uint8Array);
      w.resource = d.resource ? b64ToU8(d.resource, Uint8Array) : new Uint8Array(w.w * w.h);
      w.fire = d.fire ? b64ToU8(d.fire, Uint8Array) : new Uint8Array(w.w * w.h);
      for (let i = 0; i < w.fire.length; i++) if (w.fire[i]) w.burning.add(i);
      w.volcanoes = d.volcanoes || [];
      w.fullRedraw = true;
      this.world = w;
      this.tick = d.tick || 0;
      this.units = d.units.map(u => {
        const unit = new Unit(u.race, u.x, u.y);
        Object.assign(unit, u);
        unit.dead = false;
        return unit;
      });
      this.kingdoms = d.kingdoms.map(k => {
        const nk = new Kingdom(k.race);
        Object.assign(nk, k);
        nk.wars = new Set(k.wars);
        nk.allies = new Set(k.allies || []);
        return nk;
      });
      this.villages = d.villages.map(v => {
        const nv = new Village(v.race, v.kingdom, v.cx, v.cy);
        Object.assign(nv, v);
        nv.dead = false; nv.zoneDirty = true; nv.tick = 0;
        return nv;
      });
      // 修复计数器
      _unitId = Math.max(0, ...this.units.map(u => u.id)) + 1;
      _villageId = Math.max(0, ...this.villages.map(v => v.id)) + 1;
      _kingdomId = Math.max(0, ...this.kingdoms.map(k => k.id)) + 1;
      this.particles = []; this.tornadoes = []; this.tnts = []; this.quakes = [];
      this.events = d.events || [];
      this.maxUnits = this.settings.maxUnits || 900;
      this.selected = null;
      if (d.cam) this.cam = d.cam;
      this.renderer.allocMapCaches();
      this.renderer.unitSprites.clear();
      for (const v of this.villages) v.recomputeZone(this);
      this.toast('📂 世界已读取!');
    } catch (e) {
      this.toast('⚠️ 读取失败: ' + e.message);
    }
  },

  /* ---------- 游戏tick ---------- */
  gameTick() {
    this.tick++;
    if (this.weather.rain > 0) this.weather.rain--;
    this.world.tick(this);
    civTick(this);
    powersTick(this);
    // 粒子
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.98; p.vy *= 0.98;
      p.life--;
    }
    if (this.particles.length && this.tick % 2 === 0) {
      this.particles = this.particles.filter(p => p.life > 0);
    }
    if (this.shake > 0) this.shake *= 0.88;
  },
};

/* ---------- 输入 ---------- */
function bindInput() {
  const cv = Game.cv;
  const keys = {};
  let panning = false, applying = false, moved = false;
  let lastX = 0, lastY = 0;
  const pinch = { active: false, dist: 0 };

  function updateMouse(e) {
    const r = cv.getBoundingClientRect();
    Game.mouse.x = e.clientX - r.left;
    Game.mouse.y = e.clientY - r.top;
    const w = Game.renderer.screenToWorld(Game.mouse.x, Game.mouse.y);
    Game.mouse.wx = w.x; Game.mouse.wy = w.y;
    Game.mouse.inCanvas = true;
  }

  function applyTool() {
    const t = Game.currentTool;
    if (!t || t.id === 'inspect') return;
    if (t.brush) t.apply(Game, Game.mouse.wx, Game.mouse.wy, Game.brush);
    else t.apply(Game, Game.mouse.wx, Game.mouse.wy);
  }

  cv.addEventListener('mousedown', (e) => {
    Sound.resume();
    e.preventDefault();
    updateMouse(e);
    moved = false;
    if (e.button === 1 || e.button === 2 || Game.tool === 'inspect') {
      panning = true; lastX = e.clientX; lastY = e.clientY;
      if (Game.tool === 'inspect') applying = true; // 用于点击检测
    } else if (e.button === 0) {
      applying = true;
      applyTool();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (e.target === cv) updateMouse(e);
    else Game.mouse.inCanvas = false;
    if (panning && (e.buttons & 6 || Game.tool === 'inspect' && e.buttons & 1)) {
      const z = TILE * Game.cam.zoom;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      Game.cam.x -= dx / z;
      Game.cam.y -= dy / z;
      lastX = e.clientX; lastY = e.clientY;
    } else if (applying && e.buttons & 1 && Game.currentTool) {
      const t = Game.currentTool;
      if (t.brush || t.drag) applyTool();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (panning && Game.tool === 'inspect' && applying && !moved && e.target === cv) {
      updateMouse(e);
      Game.currentTool.apply(Game, Game.mouse.wx, Game.mouse.wy);
    }
    panning = false; applying = false;
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateMouse(e);
    Game.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, Game.mouse.x, Game.mouse.y);
  }, { passive: false });

  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  /* 触摸支持 */
  cv.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      updateMouse(t);
      if (Game.tool === 'inspect') { panning = true; applying = true; moved = false; }
      else { applying = true; applyTool(); }
      lastX = t.clientX; lastY = t.clientY;
    } else if (e.touches.length === 2) {
      pinch.active = true;
      pinch.dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      panning = false; applying = false;
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (pinch.active && e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      Game.zoomBy(d / pinch.dist);
      pinch.dist = d;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      updateMouse(t);
      if (panning) {
        const z = TILE * Game.cam.zoom;
        Game.cam.x -= (t.clientX - lastX) / z;
        Game.cam.y -= (t.clientY - lastY) / z;
        moved = true;
      } else if (applying && (Game.currentTool.brush || Game.currentTool.drag)) applyTool();
      lastX = t.clientX; lastY = t.clientY;
    }
  }, { passive: false });
  cv.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      if (panning && applying && !moved && Game.tool === 'inspect') {
        Game.currentTool.apply(Game, Game.mouse.wx, Game.mouse.wy);
      }
      panning = false; applying = false; pinch.active = false;
    }
  });

  /* 键盘 */
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { e.preventDefault(); Game.ui.setPaused(!Game.paused); }
    if (e.key === '+' || e.key === '=') Game.zoomBy(1.3);
    if (e.key === '-') Game.zoomBy(1 / 1.3);
    const cats = ['terrain', 'life', 'destroy', 'other'];
    if (['1', '2', '3', '4'].includes(e.key)) Game.ui.togglePopup(cats[parseInt(e.key) - 1]);
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  /* 键盘平移(在循环中调用) */
  Game.panByKeys = (dt) => {
    const sp = 25 / Game.cam.zoom * dt;
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= sp;
    if (keys['s'] || keys['arrowdown']) dy += sp;
    if (keys['a'] || keys['arrowleft']) dx -= sp;
    if (keys['d'] || keys['arrowright']) dx += sp;
    Game.cam.x += dx; Game.cam.y += dy;
  };
}

/* ---------- 启动 ---------- */
window.addEventListener('load', () => {
  Game.cv = document.getElementById('game');
  Sound.init();
  Game.renderer = new Renderer(Game.cv, Game);
  Game.loadSettings();
  Game.newWorld(Game.settings.worldSize || 192);
  Game.ui = new UI(Game, Game.renderer);
  bindInput();

  window.addEventListener('resize', () => Game.renderer.resize());
  setTimeout(() => Game.renderer.resize(), 200);

  // 调试: ?warp=N 快进N tick, &zoom=Z 设置缩放
  const warp = (location.search.match(/warp=(\d+)/) || [])[1];
  if (warp) {
    const n = Math.min(20000, parseInt(warp));
    for (let i = 0; i < n; i++) Game.gameTick();
    Game.toast(`⏩ 已快进 ${n} tick`);
  }
  const zm = (location.search.match(/zoom=([\d.]+)/) || [])[1];
  if (zm) Game.cam.zoom = parseFloat(zm);
  Game.ui.updateTopbar();
  Game.renderer.drawMinimap(document.getElementById('minimap'));

  // 调试面板: ?debug 显示 tick 信息并定位到村庄
  if (location.search.includes('debug')) {
    if (Game.villages.length) {
      Game.cam.x = Game.villages[0].cx;
      Game.cam.y = Game.villages[0].cy;
    }
    // 可视化桥测试: &bridge 在浅海上画演示桥
    if (location.search.includes('bridge')) {
      const w = Game.world;
      for (let x = 10; x < 50; x++) { w.set(x, 20, T.SHALLOW); w.set(x, 21, T.SHALLOW); w.set(x, 22, T.SHALLOW); }
      for (let y = 10; y < 35; y++) { w.set(30, y, T.SHALLOW); w.set(31, y, T.SHALLOW); }
      layRoad(Game, 5, 21, 55, 21);
      layRoad(Game, 30, 5, 30, 40);
      w.set(20, 21, T.DEEP); w.set(21, 21, T.DEEP); w.set(22, 21, T.DEEP); // 中间3格深海,桥会断
      Game.cam.x = 30; Game.cam.y = 22; Game.cam.zoom = 4;
    }
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:50px;left:10px;z-index:99;background:#000;color:#0f0;font-size:18px;padding:6px;';
    document.body.appendChild(d);
    setInterval(() => {
      d.textContent = `tick=${Game.tick} units=${Game.units.length} villages=${Game.villages.length} kingdoms=${Game.kingdoms.length} year=${((Game.tick / 600) | 0) + 1}`;
    }, 300);
  }

  let last = performance.now(), acc = 0;
  const TICK = 1000 / 30;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(100, now - last);
    last = now;
    Game.panByKeys(dt / 1000);
    if (!Game.paused) {
      acc += dt * Game.speed;
      let n = 0;
      while (acc >= TICK && n < 12) {
        Game.gameTick();
        acc -= TICK;
        n++;
      }
      if (n >= 12) acc = 0;
    }
    Game.renderer.draw();
  }
  requestAnimationFrame(loop);
});
