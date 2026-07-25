/* ========== 神力：地形塑造、生命、灾难、其他 ========== */
'use strict';

/* ---------- 通用效果 ---------- */
function explode(game, x, y, r, opts) {
  opts = opts || {};
  const w = game.world;
  const dmg = opts.dmg || 100;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const tx = Math.round(x + dx), ty = Math.round(y + dy);
      if (!w.inB(tx, ty)) continue;
      const t = w.get(tx, ty);
      if (isWaterT(t)) continue;
      if (d < r * 0.35) {
        if (opts.lava) w.setLava(tx, ty, 300 + Math.random() * 400 | 0);
        else if (t !== T.MOUNTAIN) w.set(tx, ty, T.BURNT);
        else w.set(tx, ty, T.HILL);
      } else {
        if (t === T.MOUNTAIN && d < r * 0.6) w.set(tx, ty, T.HILL);
        else if (isLandT(t) && t !== T.LAVA) w.set(tx, ty, T.BURNT);
        if (flammableT(t)) w.ignite(tx, ty, 200);
      }
    }
  }
  // 伤害单位
  const victims = [];
  forEachNear(game, x, y, r + 1, (u) => victims.push(u));
  for (const u of victims) {
    const d = Math.hypot(u.x - x, u.y - y);
    u.damage(game, dmg * Math.max(0.1, 1 - d / (r + 1)));
  }
  // 摧毁建筑
  for (const v of game.villages) {
    for (const b of [...v.buildings]) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r) damageBuilding(game, b, dmg * (1 - d / r) + 30);
    }
  }
  // 粒子
  const n = Math.min(200, r * 18);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.05 + Math.random() * 0.35;
    game.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.1,
      30 + Math.random() * 50 | 0, ['#e33d1e', '#f2a03d', '#555', '#333'][(Math.random() * 4) | 0], 1.5 + Math.random() * 2.5);
  }
  game.shake = Math.max(game.shake, Math.min(30, r * 2));
}

function lightning(game, x, y) {
  const w = game.world;
  // 闪电流
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    game.addParticle(x + (Math.random() - .5) * 0.6, y - 8 * (1 - t), 0, 0.5, 6, '#fff8c0', 2);
  }
  game.addParticle(x, y, 0, 0, 8, '#ffffff', 4);
  // 伤害
  const victims = [];
  forEachNear(game, x, y, 1.8, (u) => victims.push(u));
  for (const u of victims) u.damage(game, 60);
  // 点燃 & 焦土
  const tx = x | 0, ty = y | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (w.inB(tx + dx, ty + dy)) w.ignite(tx + dx, ty + dy, 200);
  }
  const t = w.get(tx, ty);
  if (t === T.GRASS || t === T.FOREST) w.set(tx, ty, T.BURNT);
  game.shake = Math.max(game.shake, 4);
}

function spawnUnits(game, race, x, y, count) {
  const w = game.world;
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    if (game.units.length >= game.maxUnits) { game.toast('⚠️ 单位数量已达上限'); break; }
    const land = w.nearestLand(Math.round(x + (Math.random() - .5) * 3), Math.round(y + (Math.random() - .5) * 3), 10);
    if (!land) continue;
    const u = new Unit(race, land.x + Math.random(), land.y + Math.random());
    u.age = 2000; // 上帝放置的单位直接成年
    game.units.push(u);
    spawned++;
  }
  if (spawned) {
    for (let i = 0; i < spawned * 3; i++) {
      game.addParticle(x + (Math.random() - .5) * 2, y + (Math.random() - .5) * 2,
        0, -0.06, 30, '#c0f0ff', 1.5);
    }
  }
  return spawned;
}

/* ---------- 灾难实体tick ---------- */
function powersTick(game) {
  const w = game.world;
  // 龙卷风
  for (const tor of game.tornadoes) {
    tor.life--;
    // 随机漂移
    tor.vx += (Math.random() - 0.5) * 0.02;
    tor.vy += (Math.random() - 0.5) * 0.02;
    const sp = Math.hypot(tor.vx, tor.vy);
    if (sp > 0.12) { tor.vx = tor.vx / sp * 0.12; tor.vy = tor.vy / sp * 0.12; }
    const nx = tor.x + tor.vx, ny = tor.y + tor.vy;
    if (w.inB(nx | 0, ny | 0) && !isWaterT(w.get(nx | 0, ny | 0))) { tor.x = nx; tor.y = ny; }
    else { tor.vx *= -1; tor.vy *= -1; }
    // 卷起单位
    const victims = [];
    forEachNear(game, tor.x, tor.y, 2.2, (u) => victims.push(u));
    for (const u of victims) {
      if (Math.random() < 0.15) {
        u.x += (Math.random() - .5) * 6; u.y += (Math.random() - .5) * 6;
        u.x = Math.max(1, Math.min(w.w - 2, u.x));
        u.y = Math.max(1, Math.min(w.h - 2, u.y));
        u.damage(game, 12);
      }
    }
    // 摧毁建筑 & 削平森林
    for (const v of game.villages) {
      for (const b of [...v.buildings]) {
        if (Math.hypot(b.x - tor.x, b.y - tor.y) < 2.5 && Math.random() < 0.1) damageBuilding(game, b, 8);
      }
    }
    const tx = tor.x | 0, ty = tor.y | 0;
    if (w.get(tx, ty) === T.FOREST && Math.random() < 0.3) w.set(tx, ty, T.GRASS);
    // 烟尘
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      game.addParticle(tor.x + Math.cos(a) * 1.2, tor.y + Math.sin(a) * 1.2,
        Math.cos(a + 1.5) * 0.1, -0.08, 25, '#c8c8d0', 1.5 + Math.random() * 1.5);
    }
  }
  game.tornadoes = game.tornadoes.filter(t => t.life > 0);

  // TNT
  for (const tnt of game.tnts) {
    tnt.life--;
    if (tnt.life % 10 < 5) game.addParticle(tnt.x, tnt.y - 0.5, 0, -0.05, 8, '#ff4040', 1.5);
    if (tnt.life <= 0) explode(game, tnt.x, tnt.y, 3, { dmg: 70 });
  }
  game.tnts = game.tnts.filter(t => t.life > 0);

  // 地震
  for (const q of game.quakes) {
    q.life--;
    game.shake = Math.max(game.shake, 7);
    if (q.life % 4 === 0) {
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * q.r;
        const tx = Math.round(q.x + Math.cos(a) * d), ty = Math.round(q.y + Math.sin(a) * d);
        if (!w.inB(tx, ty)) continue;
        const t = w.get(tx, ty);
        const down = { [T.MOUNTAIN]: T.HILL, [T.HILL]: T.GRASS, [T.FOREST]: T.GRASS, [T.GRASS]: T.SAND, [T.BURNT]: T.SAND, [T.SAND]: T.SHALLOW, [T.SHALLOW]: T.DEEP };
        if (down[t] !== undefined) w.set(tx, ty, down[t]);
      }
      // 伤害
      const victims = [];
      forEachNear(game, q.x, q.y, q.r, (u) => victims.push(u));
      for (const u of victims) if (Math.random() < 0.2) u.damage(game, 6);
      for (const v of game.villages) {
        for (const b of [...v.buildings]) {
          if (Math.hypot(b.x - q.x, b.y - q.y) < q.r && Math.random() < 0.25) damageBuilding(game, b, 10);
        }
      }
    }
  }
  game.quakes = game.quakes.filter(q => q.life > 0);
}

/* ---------- 工具定义 ---------- */
const TOOL_CATS = [
  { id: 'terrain', name: '🗺️ 地形' },
  { id: 'life', name: '🧬 生命' },
  { id: 'destroy', name: '💥 灾难' },
  { id: 'other', name: '✨ 其他' },
];

const TOOLS = [
  /* ---- 地形 ---- */
  {
    id: 'inspect', cat: 'terrain', name: '查看', icon: '👆', brush: false,
    apply(game, x, y) {
      // 优先单位
      let unit = null, ud = 4;
      forEachNear(game, x, y, 2, (u) => {
        const d = (u.x - x) ** 2 + (u.y - y) ** 2;
        if (d < ud) { ud = d; unit = u; }
      });
      if (unit) { game.select({ type: 'unit', obj: unit }); return; }
      const zi = game.world.zone[game.world.idx(x | 0, y | 0)];
      if (zi) {
        const v = game.villageById(zi);
        if (v) { game.select({ type: 'village', obj: v }); return; }
      }
      // 点击空白 -> 查看所在王国
      let nv = nearestVillage(game, x, y, 8);
      if (nv) { game.select({ type: 'village', obj: nv }); return; }
      game.select(null);
    }
  },
  {
    id: 'raise', cat: 'terrain', name: '抬升', icon: '⬆️', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      const up = { [T.DEEP]: T.SHALLOW, [T.SHALLOW]: T.SAND, [T.SAND]: T.GRASS, [T.GRASS]: T.HILL, [T.FOREST]: T.HILL, [T.BURNT]: T.HILL, [T.HILL]: T.MOUNTAIN };
      if (up[t] !== undefined) w.set(tx, ty, up[t]);
    }); }
  },
  {
    id: 'lower', cat: 'terrain', name: '下沉', icon: '⬇️', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      const down = { [T.MOUNTAIN]: T.HILL, [T.HILL]: T.GRASS, [T.FOREST]: T.GRASS, [T.GRASS]: T.SAND, [T.BURNT]: T.SAND, [T.SAND]: T.SHALLOW, [T.SHALLOW]: T.DEEP };
      if (down[t] !== undefined) w.set(tx, ty, down[t]);
    }); }
  },
  {
    id: 'water', cat: 'terrain', name: '水流', icon: '💧', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      if (t !== T.DEEP) w.set(tx, ty, T.SHALLOW);
    }); }
  },
  {
    id: 'sand', cat: 'terrain', name: '沙地', icon: '🏜️', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      if (isLandT(t) && t !== T.LAVA) w.set(tx, ty, T.SAND);
    }); }
  },
  {
    id: 'grass', cat: 'terrain', name: '草地', icon: '🌱', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      if (isLandT(t) && t !== T.LAVA && t !== T.MOUNTAIN) w.set(tx, ty, T.GRASS);
    }); }
  },
  {
    id: 'forest', cat: 'terrain', name: '森林', icon: '🌲', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      if (t === T.GRASS || t === T.SAND || t === T.BURNT) w.set(tx, ty, T.FOREST);
    }); }
  },
  {
    id: 'volcano', cat: 'terrain', name: '火山', icon: '🌋', brush: false,
    apply(game, x, y) {
      const w = game.world;
      const cx = x | 0, cy = y | 0;
      const land = w.nearestLand(cx, cy, 10);
      if (!land) { game.toast('⚠️ 需要放置在陆地上'); return; }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx, dy) > 2.5) continue;
        const tx = land.x + dx, ty = land.y + dy;
        if (w.inB(tx, ty) && isLandT(w.get(tx, ty))) w.set(tx, ty, T.MOUNTAIN);
      }
      w.setLava(land.x, land.y, 9999);
      w.volcanoes.push({ x: land.x, y: land.y });
      game.shake = 8;
      game.logEvent('disaster', '🌋 一座火山拔地而起!');
    }
  },
  {
    id: 'sponge', cat: 'terrain', name: '海绵', icon: '🧽', brush: true,
    apply(game, x, y, b) { brushTiles(game, x, y, b, (w, tx, ty, t) => {
      if (isWaterT(t)) w.set(tx, ty, T.SAND);
    }); }
  },

  /* ---- 生命 ---- */
  { id: 'human',   cat: 'life', name: '人类', icon: '🧑', brush: false, apply: (g, x, y) => spawnUnits(g, 'human', x, y, 2) },
  { id: 'elf',     cat: 'life', name: '精灵', icon: '🧝', brush: false, apply: (g, x, y) => spawnUnits(g, 'elf', x, y, 2) },
  { id: 'orc',     cat: 'life', name: '兽人', icon: '👹', brush: false, apply: (g, x, y) => spawnUnits(g, 'orc', x, y, 2) },
  { id: 'dwarf',   cat: 'life', name: '矮人', icon: '🧔', brush: false, apply: (g, x, y) => spawnUnits(g, 'dwarf', x, y, 2) },
  { id: 'sheep',   cat: 'life', name: '羊',   icon: '🐑', brush: false, apply: (g, x, y) => spawnUnits(g, 'sheep', x, y, 3) },
  { id: 'chicken', cat: 'life', name: '鸡',   icon: '🐔', brush: false, apply: (g, x, y) => spawnUnits(g, 'chicken', x, y, 4) },
  { id: 'cow',     cat: 'life', name: '牛',   icon: '🐄', brush: false, apply: (g, x, y) => spawnUnits(g, 'cow', x, y, 2) },
  { id: 'wolf',    cat: 'life', name: '狼',   icon: '🐺', brush: false, apply: (g, x, y) => spawnUnits(g, 'wolf', x, y, 2) },

  /* ---- 灾难 ---- */
  { id: 'lightning', cat: 'destroy', name: '闪电', icon: '⚡', brush: false, drag: true, apply: (g, x, y) => lightning(g, x, y) },
  {
    id: 'meteor', cat: 'destroy', name: '陨石', icon: '☄️', brush: false,
    apply(game, x, y) {
      // 天降陨石
      for (let i = 0; i < 15; i++) {
        game.addParticle(x - 6 + i * 0.4, y - 9 + i * 0.6, 0.15, 0.3, 20, i % 2 ? '#f2a03d' : '#e33d1e', 2.5);
      }
      explode(game, x, y, 5, { lava: true, dmg: 120 });
      game.logEvent('disaster', '☄️ 陨石撞击!');
    }
  },
  {
    id: 'tornado', cat: 'destroy', name: '龙卷风', icon: '🌪️', brush: false,
    apply(game, x, y) {
      const land = game.world.nearestLand(x | 0, y | 0, 15);
      if (!land) { game.toast('⚠️ 需要放置在陆地上'); return; }
      game.tornadoes.push({ x: land.x, y: land.y, vx: 0.05, vy: 0, life: 800 });
      game.logEvent('disaster', '🌪️ 龙卷风来袭!');
    }
  },
  {
    id: 'quake', cat: 'destroy', name: '地震', icon: '💥', brush: false,
    apply(game, x, y) {
      game.quakes.push({ x, y, r: 13, life: 160 });
      game.logEvent('disaster', '💥 地震!');
    }
  },
  { id: 'tnt', cat: 'destroy', name: 'TNT', icon: '🧨', brush: false, drag: true, apply: (g, x, y) => g.tnts.push({ x, y, life: 50 }) },
  {
    id: 'nuke', cat: 'destroy', name: '核弹', icon: '☢️', brush: false,
    apply(game, x, y) {
      explode(game, x, y, 13, { lava: true, dmg: 400 });
      game.shake = 30;
      game.logEvent('disaster', '☢️ 核弹爆炸! 世界在颤抖……');
    }
  },

  /* ---- 其他 ---- */
  {
    id: 'bless', cat: 'other', name: '祝福', icon: '✨', brush: true,
    apply(game, x, y, b) {
      const r = b + 1;
      const list = [];
      forEachNear(game, x, y, r + 1, (u) => list.push(u));
      for (const u of list) {
        u.bless = 3600; u.plague = 0; u.hp = u.maxHp;
        game.addParticle(u.x, u.y - 0.5, 0, -0.06, 40, '#ffe070', 1.5);
      }
    }
  },
  {
    id: 'plague', cat: 'other', name: '瘟疫', icon: '☠️', brush: true,
    apply(game, x, y, b) {
      const r = b + 1;
      const list = [];
      forEachNear(game, x, y, r + 1, (u) => list.push(u));
      for (const u of list) {
        if (RACES[u.race].civ && u.bless <= 0) u.plague = 1200;
      }
      if (list.length) game.logEvent('plague', '☠️ 瘟疫开始蔓延……');
    }
  },
  {
    id: 'rain', cat: 'other', name: '降雨', icon: '🌧️', brush: false,
    apply(game) {
      game.weather.rain = 900;
      game.logEvent('nature', '🌧️ 天降大雨, 火焰将被浇灭');
    }
  },
  {
    id: 'eraser', cat: 'other', name: '橡皮擦', icon: '❌', brush: true,
    apply(game, x, y, b) {
      const r = b + 1;
      const list = [];
      forEachNear(game, x, y, r + 1, (u) => list.push(u));
      for (const u of list) {
        for (let i = 0; i < 4; i++) game.addParticle(u.x, u.y, (Math.random() - .5) * .1, -0.08, 25, '#ffffff', 1.5);
        u.kill(game);
      }
    }
  },
];

function brushTiles(game, x, y, b, fn) {
  const w = game.world;
  const r = b + 1;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.hypot(dx, dy) > r) continue;
      const tx = Math.round(x + dx), ty = Math.round(y + dy);
      if (!w.inB(tx, ty)) continue;
      fn(w, tx, ty, w.get(tx, ty));
    }
  }
}

function toolById(id) { return TOOLS.find(t => t.id === id); }
