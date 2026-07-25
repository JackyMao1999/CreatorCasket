/* ========== 渲染：像素精灵生成、地图缓存、相机、小地图 ========== */
'use strict';

class Renderer {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.sprites = {};       // 地块精灵 variants
    this.unitSprites = new Map();
    this.buildingSprites = new Map();
    this.frame = 0;
    this.initSprites();
    this.mapCache = document.createElement('canvas');
    this.overlayCache = document.createElement('canvas');
    this.resize();
  }

  resize() {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  }

  allocMapCaches() {
    const w = this.game.world;
    this.mapCache.width = w.w * TILE;
    this.mapCache.height = w.h * TILE;
    this.overlayCache.width = w.w * TILE;
    this.overlayCache.height = w.h * TILE;
    this.rebuildMapCache();
    this.rebuildOverlay();
  }

  /* ---------- 像素精灵生成 ---------- */
  initSprites() {
    const S = TILE;
    const mk = (t, v, painter) => {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      painter(ctx, makeRNG(t * 100 + v * 17 + 5));
      return c;
    };
    const fill = (ctx, color) => { ctx.fillStyle = color; ctx.fillRect(0, 0, S, S); };
    const speckle = (ctx, rng, color, n) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) ctx.fillRect((rng() * S) | 0, (rng() * S) | 0, 1, 1);
    };

    this.sprites[T.DEEP] = [0, 1, 2].map(v => mk(T.DEEP, v, (ctx, rng) => {
      fill(ctx, '#1b4a85'); speckle(ctx, rng, '#173d6e', 12); speckle(ctx, rng, '#22589c', 8);
    }));
    this.sprites[T.SHALLOW] = [0, 1, 2].map(v => mk(T.SHALLOW, v, (ctx, rng) => {
      fill(ctx, '#3f8fc4'); speckle(ctx, rng, '#3577ab', 10); speckle(ctx, rng, '#5aa8da', 8);
    }));
    this.sprites[T.SAND] = [0, 1, 2].map(v => mk(T.SAND, v, (ctx, rng) => {
      fill(ctx, '#ecdaa0'); speckle(ctx, rng, '#dcc88a', 12); speckle(ctx, rng, '#c9b578', 6);
    }));
    this.sprites[T.GRASS] = [0, 1, 2].map(v => mk(T.GRASS, v, (ctx, rng) => {
      fill(ctx, '#7cc24f'); speckle(ctx, rng, '#6fb344', 14); speckle(ctx, rng, '#8ed465', 10);
      if (rng() < 0.3) { ctx.fillStyle = rng() < 0.5 ? '#fff' : '#ffd24a'; ctx.fillRect((rng() * 7) | 0, (rng() * 7) | 0, 1, 1); }
    }));
    this.sprites[T.FOREST] = [0, 1, 2].map(v => mk(T.FOREST, v, (ctx, rng) => {
      fill(ctx, '#5da03e'); speckle(ctx, rng, '#4e8a33', 10);
      // 小树
      const tree = (cx, cy) => {
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(cx, cy + 2, 1, 1);
        ctx.fillStyle = '#2f7a30'; ctx.fillRect(cx - 1, cy, 3, 2); ctx.fillRect(cx, cy - 1, 1, 1);
        ctx.fillStyle = '#3f9a40'; ctx.fillRect(cx, cy, 1, 1);
      };
      tree(2, 2); tree(5, 5); if (rng() < 0.5) tree(5, 2);
    }));
    this.sprites[T.HILL] = [0, 1, 2].map(v => mk(T.HILL, v, (ctx, rng) => {
      fill(ctx, '#8aa050'); speckle(ctx, rng, '#778c42', 10);
      ctx.fillStyle = '#a8c06a'; ctx.fillRect(1, 1, 5, 2);
      ctx.fillStyle = '#687838'; ctx.fillRect(2, 5, 5, 2);
    }));
    this.sprites[T.MOUNTAIN] = [0, 1, 2].map(v => mk(T.MOUNTAIN, v, (ctx, rng) => {
      fill(ctx, '#8a8a8a');
      ctx.fillStyle = '#6e6e6e'; ctx.fillRect(0, 4, 8, 4);
      ctx.fillStyle = '#9c9c9c'; ctx.fillRect(0, 0, 8, 2);
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(3, 1, 2, 2); ctx.fillRect(2, 2, 4, 1);
      speckle(ctx, rng, '#5e5e5e', 6);
    }));
    this.sprites[T.LAVA] = [0, 1, 2].map(v => mk(T.LAVA, v, (ctx, rng) => {
      fill(ctx, '#d83a18'); speckle(ctx, rng, '#f2a03d', 12); speckle(ctx, rng, '#ffd24a', 5); speckle(ctx, rng, '#7a2010', 8);
    }));
    this.sprites[T.BURNT] = [0, 1, 2].map(v => mk(T.BURNT, v, (ctx, rng) => {
      fill(ctx, '#3d3530'); speckle(ctx, rng, '#2e2825', 12); speckle(ctx, rng, '#555048', 6);
      if (rng() < 0.2) { ctx.fillStyle = '#e06020'; ctx.fillRect((rng() * 7) | 0, (rng() * 7) | 0, 1, 1); }
    }));
  }

  /* ---------- 地图缓存 ---------- */
  rebuildMapCache() {
    const w = this.game.world;
    const ctx = this.mapCache.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) this.drawTile(ctx, x, y);
    w.dirty.clear();
    w.fullRedraw = false;
  }

  drawTile(ctx, x, y) {
    const w = this.game.world;
    const i = w.idx(x, y);
    const t = w.tiles[i];
    const v = (x * 7 + y * 13 + i) % 3;
    ctx.drawImage(this.sprites[t][v], x * TILE, y * TILE);
    // 海岸线: 水与陆地交界处画浪花
    if (isWaterT(t)) {
      ctx.fillStyle = 'rgba(230,245,255,0.75)';
      if (isLandT(w.get(x, y - 1))) ctx.fillRect(x * TILE, y * TILE, TILE, 1);
      if (isLandT(w.get(x, y + 1))) ctx.fillRect(x * TILE, (y + 1) * TILE - 1, TILE, 1);
      if (isLandT(w.get(x - 1, y))) ctx.fillRect(x * TILE, y * TILE, 1, TILE);
      if (isLandT(w.get(x + 1, y))) ctx.fillRect((x + 1) * TILE - 1, y * TILE, 1, TILE);
    }
  }

  flushDirty() {
    const w = this.game.world;
    if (w.fullRedraw) { this.rebuildMapCache(); }
    else if (w.dirty.size) {
      const ctx = this.mapCache.getContext('2d');
      for (const i of w.dirty) {
        const x = i % w.w, y = (i / w.w) | 0;
        // 重画自己及相邻水块(海岸线)
        this.drawTile(ctx, x, y);
        if (isLandT(w.tiles[i])) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (w.inB(nx, ny) && isWaterT(w.get(nx, ny))) this.drawTile(ctx, nx, ny);
          }
        }
      }
      w.dirty.clear();
    }
    if (w.overlayDirty) this.rebuildOverlay();
  }

  /* ---------- 覆盖层: 领地/道路/农田 ---------- */
  rebuildOverlay() {
    const w = this.game.world;
    const game = this.game;
    const ctx = this.overlayCache.getContext('2d');
    ctx.clearRect(0, 0, this.overlayCache.width, this.overlayCache.height);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const i = w.idx(x, y);
        // 领地
        if (game.settings.showZones) {
        const z = w.zone[i];
        if (z) {
          const v = game.villageById(z);
          const k = v && game.kingdomById(v.kingdom);
          const color = k ? k.color : '#ffffff';
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = color;
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.globalAlpha = 0.85;
          // 边界: 邻居领地不同则描边
          const zUp = y > 0 ? w.zone[w.idx(x, y - 1)] : -1;
          const zDown = y + 1 < w.h ? w.zone[w.idx(x, y + 1)] : -1;
          const zLeft = x > 0 ? w.zone[w.idx(x - 1, y)] : -1;
          const zRight = x + 1 < w.w ? w.zone[w.idx(x + 1, y)] : -1;
          if (zUp !== z) ctx.fillRect(x * TILE, y * TILE, TILE, 1);
          if (zDown !== z) ctx.fillRect(x * TILE, (y + 1) * TILE - 1, TILE, 1);
          if (zLeft !== z) ctx.fillRect(x * TILE, y * TILE, 1, TILE);
          if (zRight !== z) ctx.fillRect((x + 1) * TILE - 1, y * TILE, 1, TILE);
          ctx.globalAlpha = 1;
        }
        } // showZones
        // 道路(水中则绘制木桥)
        if (w.road[i]) {
          if (isWaterT(w.tiles[i])) {
            ctx.fillStyle = '#8b6b4a'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
            ctx.fillStyle = '#a08060';
            for (let r = 0; r < TILE; r += 2) ctx.fillRect(x * TILE + 1, y * TILE + r, TILE - 2, 1);
            ctx.fillStyle = '#6a4f3a';
            ctx.fillRect(x * TILE, y * TILE, TILE, 1);
            ctx.fillRect(x * TILE, y * TILE + TILE - 1, TILE, 1);
          } else {
            ctx.fillStyle = '#9a7b50'; ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
            ctx.fillStyle = '#b08d5c'; ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
          }
        }
        // 农田
        const f = w.farm[i];
        if (f) {
          ctx.fillStyle = '#6a4526'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          const cropColor = f <= 2 ? '#7a9a3a' : f <= 4 ? '#8ec44a' : '#e8c84a';
          ctx.fillStyle = cropColor;
          for (let r = 1; r < TILE; r += 2) {
            for (let px = 1; px < TILE - 1; px += 2) {
              if ((px + r + x + y) % 3 || f >= 3) ctx.fillRect(x * TILE + px, y * TILE + r, 1, 1);
            }
          }
        }
      }
    }
    w.overlayDirty = false;
  }

  /* ---------- 单位/建筑精灵 ---------- */
  getUnitSprite(u, kingdomColor) {
    const adult = u.adult;
    const key = u.race + '|' + (kingdomColor || '') + '|' + (adult ? 1 : 0) + '|' + (u.job === 'warrior' ? 1 : 0);
    let c = this.unitSprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d');
    const def = RACES[u.race];
    if (def.civ) {
      const skin = def.skin;
      const cloth = kingdomColor || '#888888';
      const s = adult ? 0 : 1; // 儿童更小
      // 头
      ctx.fillStyle = skin;
      ctx.fillRect(3, 0 + s, 2, 2);
      // 身体(王国颜色)
      ctx.fillStyle = cloth;
      ctx.fillRect(2, 2 + s, 4, 3 - s);
      // 腿
      ctx.fillStyle = '#333';
      ctx.fillRect(3, 5, 1, 2); ctx.fillRect(4, 5, 1, 2);
      if (!adult) ctx.clearRect(2, 6, 4, 2), ctx.fillStyle = '#333', ctx.fillRect(3, 5, 1, 1), ctx.fillRect(4, 5, 1, 1);
      // 战士的武器像素
      if (u.job === 'warrior') {
        const wcol = { sword: '#c8c8c8', bow: '#e8a040', axe: '#e04848', hammer: '#b09060' }[u.weapon] || '#c8c8c8';
        ctx.fillStyle = wcol;
        ctx.fillRect(6, 1, 1, 5);
      }
    } else {
      // 动物
      const col = def.skin;
      ctx.fillStyle = col;
      if (u.race === 'sheep') { ctx.fillRect(1, 2, 6, 4); ctx.fillStyle = '#444'; ctx.fillRect(6, 3, 2, 2); ctx.fillRect(2, 6, 1, 1); ctx.fillRect(5, 6, 1, 1); }
      else if (u.race === 'chicken') { ctx.fillRect(2, 3, 4, 3); ctx.fillStyle = '#e14b4b'; ctx.fillRect(4, 2, 1, 1); ctx.fillStyle = '#f2a03d'; ctx.fillRect(5, 4, 2, 1); ctx.fillStyle = '#333'; ctx.fillRect(3, 6, 1, 1); }
      else if (u.race === 'cow') { ctx.fillRect(0, 2, 7, 4); ctx.fillStyle = '#e8d8c0'; ctx.fillRect(6, 3, 2, 2); ctx.fillStyle = '#333'; ctx.fillRect(1, 6, 1, 1); ctx.fillRect(5, 6, 1, 1); }
      else if (u.race === 'wolf') { ctx.fillRect(1, 3, 6, 3); ctx.fillRect(6, 2, 2, 2); ctx.fillStyle = '#666'; ctx.fillRect(0, 2, 1, 2); ctx.fillStyle = '#333'; ctx.fillRect(2, 6, 1, 1); ctx.fillRect(5, 6, 1, 1); }
    }
    this.unitSprites.set(key, c);
    return c;
  }

  getBuildingSprite(b, color) {
    const key = b.type + '|' + color;
    let c = this.buildingSprites.get(key);
    if (c) return c;
    const S = b.type === 'hall' ? 16 : 12;
    c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    if (b.type === 'hall') {
      ctx.fillStyle = '#c8b090'; ctx.fillRect(2, 6, 12, 8);          // 墙
      ctx.fillStyle = color; ctx.fillRect(1, 3, 14, 3);             // 屋顶
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(6, 10, 4, 4);         // 门
      ctx.fillStyle = color; ctx.fillRect(7, 0, 2, 3);              // 旗帜杆顶
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(9, 0, 3, 2);          // 旗
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(2, 12, 12, 2);
    } else if (b.type === 'house') {
      ctx.fillStyle = '#d0b890'; ctx.fillRect(2, 5, 8, 6);
      ctx.fillStyle = color; ctx.fillRect(1, 2, 10, 3);
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(5, 8, 2, 3);
      ctx.fillStyle = '#5a90c0'; ctx.fillRect(3, 6, 2, 2);
    } else if (b.type === 'farm') {
      ctx.fillStyle = '#b89a70'; ctx.fillRect(3, 5, 6, 5);
      ctx.fillStyle = '#a04030'; ctx.fillRect(2, 3, 8, 2);
      ctx.fillStyle = '#e8c84a'; ctx.fillRect(4, 7, 2, 3);
    }
    this.buildingSprites.set(key, c);
    return c;
  }

  /* ---------- 坐标变换 ---------- */
  worldToScreen(wx, wy) {
    const { cam } = this.game;
    const z = TILE * cam.zoom;
    return {
      x: (wx - cam.x) * z + this.cv.width / 2,
      y: (wy - cam.y) * z + this.cv.height / 2,
    };
  }
  screenToWorld(sx, sy) {
    const { cam } = this.game;
    const z = TILE * cam.zoom;
    return {
      x: (sx - this.cv.width / 2) / z + cam.x,
      y: (sy - this.cv.height / 2) / z + cam.y,
    };
  }

  /* ---------- 主绘制 ---------- */
  draw() {
    this.frame++;
    const game = this.game;
    const ctx = this.ctx;
    const w = game.world;
    this.flushDirty();

    const z = TILE * game.cam.zoom;
    const shx = (Math.random() - 0.5) * game.shake;
    const shy = (Math.random() - 0.5) * game.shake;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#12325e';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);

    ctx.save();
    ctx.translate(this.cv.width / 2 + shx, this.cv.height / 2 + shy);
    ctx.scale(z, z);
    ctx.translate(-game.cam.x, -game.cam.y);

    // 视野范围(tile)
    const tl = this.screenToWorld(0, 0), br = this.screenToWorld(this.cv.width, this.cv.height);
    const vx0 = Math.max(0, tl.x - 2), vy0 = Math.max(0, tl.y - 2);
    const vx1 = Math.min(w.w, br.x + 2), vy1 = Math.min(w.h, br.y + 2);

    // 地块层
    ctx.drawImage(this.mapCache, vx0 * TILE, vy0 * TILE, (vx1 - vx0) * TILE, (vy1 - vy0) * TILE,
      vx0, vy0, vx1 - vx0, vy1 - vy0);
    // 覆盖层
    ctx.drawImage(this.overlayCache, vx0 * TILE, vy0 * TILE, (vx1 - vx0) * TILE, (vy1 - vy0) * TILE,
      vx0, vy0, vx1 - vx0, vy1 - vy0);

    // 火焰(动态闪烁)
    if (w.burning.size) {
      for (const i of w.burning) {
        const x = i % w.w, y = (i / w.w) | 0;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        ctx.fillStyle = 'rgba(230,80,20,0.35)';
        ctx.fillRect(x, y, 1, 1);
        for (let f = 0; f < 3; f++) {
          ctx.fillStyle = ['#e33d1e', '#f2a03d', '#ffd24a'][(Math.random() * 3) | 0];
          ctx.fillRect(x + Math.random(), y + Math.random() * 0.7, 0.18, 0.18);
        }
      }
    }

    // 建筑
    for (const v of game.villages) {
      const k = game.kingdomById(v.kingdom);
      const color = k ? k.color : '#aaa';
      for (const b of v.buildings) {
        if (b.x < vx0 - 2 || b.x > vx1 + 2 || b.y < vy0 - 2 || b.y > vy1 + 2) continue;
        const spr = this.getBuildingSprite(b, color);
        if (b.progress < 1) {
          ctx.globalAlpha = 0.35 + 0.35 * b.progress;
          ctx.drawImage(spr, b.x - spr.width / TILE / 2, b.y - spr.height / TILE / 2, spr.width / TILE, spr.height / TILE);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#f2c14e';
          ctx.fillRect(b.x - 0.7, b.y - 1.2, 1.4 * b.progress, 0.15);
        } else {
          ctx.drawImage(spr, b.x - spr.width / TILE / 2, b.y - spr.height / TILE / 2, spr.width / TILE, spr.height / TILE);
        }
      }
      // 村庄名称(放大一定级别时)
      if (game.settings.showVillageNames && game.cam.zoom > 1.2 && v.cx > vx0 && v.cx < vx1 && v.cy > vy0 && v.cy < vy1) {
        ctx.font = '0.9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(v.name, v.cx + 0.05, v.cy - 1.35);
        ctx.fillStyle = '#fff';
        ctx.fillText(v.name, v.cx, v.cy - 1.4);
      }
    }

    // TNT
    for (const tnt of game.tnts) {
      ctx.fillStyle = (tnt.life % 10 < 5) ? '#e14b4b' : '#a02828';
      ctx.fillRect(tnt.x - 0.35, tnt.y - 0.35, 0.7, 0.7);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(tnt.x - 0.05, tnt.y - 0.55, 0.1, 0.2);
    }

    // 单位
    for (const u of game.units) {
      if (u.x < vx0 - 1 || u.x > vx1 + 1 || u.y < vy0 - 1 || u.y > vy1 + 1) continue;
      const k = u.kingdom ? game.kingdomById(u.kingdom) : null;
      const spr = this.getUnitSprite(u, k ? k.color : null);
      // 影子
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(u.x - 0.3, u.y + 0.35, 0.6, 0.15);
      ctx.drawImage(spr, u.x - 0.5, u.y - 0.55, 1, 1);
      // 状态
      if (u.bless > 0) { ctx.fillStyle = 'rgba(255,224,112,0.8)'; ctx.fillRect(u.x - 0.1, u.y - 0.85, 0.2, 0.2); }
      if (u.plague > 0) { ctx.fillStyle = 'rgba(74,154,42,0.8)'; ctx.fillRect(u.x - 0.45, u.y - 0.5, 0.9, 0.9); }
      // 受伤血条
      if (u.hp < u.maxHp * 0.6 && RACES[u.race].civ) {
        ctx.fillStyle = '#400';
        ctx.fillRect(u.x - 0.4, u.y - 0.75, 0.8, 0.1);
        ctx.fillStyle = '#e14b4b';
        ctx.fillRect(u.x - 0.4, u.y - 0.75, 0.8 * Math.max(0, u.hp / u.maxHp), 0.1);
      }
    }

    // 选中指示
    if (game.selected) {
      const o = game.selected.obj;
      if (o && !o.dead) {
        ctx.fillStyle = '#ffd24a';
        const bob = Math.sin(this.frame * 0.15) * 0.15;
        ctx.beginPath();
        const mx = o.x !== undefined ? o.x : o.cx, my = (o.y !== undefined ? o.y : o.cy) - 1.6 + bob;
        ctx.moveTo(mx, my + 0.4); ctx.lineTo(mx - 0.3, my); ctx.lineTo(mx + 0.3, my);
        ctx.fill();
      }
    }

    // 龙卷风
    for (const tor of game.tornadoes) {
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        const wob = Math.sin(this.frame * 0.2 + i) * (0.2 + t * 0.5);
        ctx.fillStyle = `rgba(200,200,210,${0.7 - t * 0.5})`;
        ctx.beginPath();
        ctx.arc(tor.x + wob, tor.y - i * 0.5, 0.25 + t * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 粒子
    if (game.settings.showParticles) {
    for (const p of game.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 25);
      ctx.fillStyle = p.color;
      const s = p.size / TILE;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    }

    ctx.restore();

    // 雨(屏幕空间)
    if (game.weather.rain > 0) {
      ctx.strokeStyle = 'rgba(150,190,235,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 130; i++) {
        const rx = Math.random() * this.cv.width, ry = Math.random() * this.cv.height;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 9);
      }
      ctx.stroke();
    }

    // 笔刷光标
    if (game.mouse.inCanvas && game.currentTool && game.currentTool.brush) {
      const p = this.worldToScreen(game.mouse.wx, game.mouse.wy);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (game.brush + 1) * z, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* ---------- 小地图 ---------- */
  drawMinimap(mm) {
    const game = this.game;
    const ctx = mm.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, mm.width, mm.height);
    ctx.drawImage(this.mapCache, 0, 0, mm.width, mm.height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.overlayCache, 0, 0, mm.width, mm.height);
    ctx.globalAlpha = 1;
    // 单位点
    const w = game.world;
    const sx = mm.width / w.w, sy = mm.height / w.h;
    for (const u of game.units) {
      const k = u.kingdom ? game.kingdomById(u.kingdom) : null;
      ctx.fillStyle = k ? k.color : (RACES[u.race].civ ? '#fff' : '#bbb');
      ctx.fillRect(u.x * sx, u.y * sy, 1.5, 1.5);
    }
    // 视野框
    const tl = this.screenToWorld(0, 0), br = this.screenToWorld(this.cv.width, this.cv.height);
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tl.x * sx, tl.y * sy, (br.x - tl.x) * sx, (br.y - tl.y) * sy);
  }
}
