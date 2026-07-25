/* ========== 文明：种族、单位AI、村庄、王国、战争 ========== */
'use strict';

/* ---------- 种族定义 ---------- */
const RACES = {
  human:   { name: '人类', icon: '🧑', hp: 60,  dmg: 7,  speed: 0.055, civ: true, lifespan: 70,  skin: '#f0c8a0', cloth: true },
  elf:     { name: '精灵', icon: '🧝', hp: 50,  dmg: 9,  speed: 0.07,  civ: true, lifespan: 400, skin: '#f5e0c0', cloth: true },
  orc:     { name: '兽人', icon: '👹', hp: 90,  dmg: 10, speed: 0.05,  civ: true, lifespan: 55,  skin: '#6fae4e', cloth: true },
  dwarf:   { name: '矮人', icon: '🧔', hp: 100, dmg: 9,  speed: 0.042, civ: true, lifespan: 250, skin: '#e8b088', cloth: true },
  sheep:   { name: '羊',   icon: '🐑', hp: 20,  dmg: 1,  speed: 0.045, civ: false, lifespan: 15,  skin: '#eeeeee' },
  chicken: { name: '鸡',   icon: '🐔', hp: 8,   dmg: 1,  speed: 0.06,  civ: false, lifespan: 8,   skin: '#f8f0d8' },
  cow:     { name: '牛',   icon: '🐄', hp: 35,  dmg: 2,  speed: 0.04,  civ: false, lifespan: 20,  skin: '#c09060' },
  wolf:    { name: '狼',   icon: '🐺', hp: 40,  dmg: 6,  speed: 0.085, civ: false, lifespan: 14,  skin: '#8a8f9a' },
};
const CIV_RACES = ['human', 'elf', 'orc', 'dwarf'];
const KINGDOM_COLORS = ['#e14b4b', '#4b8ae1', '#4be17a', '#e1a84b', '#b44be1', '#4bd8e1', '#e14b9a', '#8ae14b', '#e16a4b', '#7a4be1'];

/* ---------- 名称生成 ---------- */
const NameGen = {
  _r: Math.random,
  pick(a) { return a[(this._r() * a.length) | 0]; },
  village() {
    const pre = ['溪', '石', '柳', '枫', '雾', '风', '泉', '麦', '松', '沙', '月', '星', '鹿', '鹰', '岩', '海'];
    const suf = ['村', '镇', '屯', '堡', '湾', '原', '谷', '岗'];
    return this.pick(pre) + this.pick(pre) + this.pick(suf);
  },
  kingdom(race) {
    const pre = ['神圣', '晨曦', '黄金', '雷霆', '苍狼', '翡翠', '烈阳', '月影', '铁岩', '风语', '星辰', '赤焰'];
    const suf = { human: ['帝国', '王国'], elf: ['林地', '圣树议会', '月辉王国'], orc: ['部落', '战团', '血牙氏族'], dwarf: ['山地王国', '铁丘之国', '矿脉联邦'] };
    return this.pick(pre) + this.pick(suf[race] || suf.human);
  },
  unit(race) {
    const a = ['阿', '格', '洛', '塔', '乌', '索', '艾', '布', '卡', '德', '芬', '古'];
    const b = ['尔', '恩', '姆', '克', '拉', '斯', '顿', '文', '戈', '鲁'];
    const c = ['', '纳', '德', '森', '特', '里', '昂'];
    return this.pick(a) + this.pick(b) + (this._r() < 0.5 ? this.pick(c) : '');
  },
};

/* ---------- 叛军名称 ---------- */
function generateRebelName(race) {
  const pre = ['暴风', '自由', '反抗', '赤色', '黎明', '铁拳', '暗影', '烈焰', '苍月', '血旗', '破晓'];
  const suf = ['反抗军', '自由军', '起义军', '解放阵线', '独立军', '同盟', '护民团'];
  return pre[(Math.random() * pre.length) | 0] + suf[(Math.random() * suf.length) | 0];
}

/* ---------- 敌对判定 ---------- */
function isHostile(game, a, b) {
  if (a === b) return false;
  if (a.race === 'wolf') return b.race === 'sheep' || b.race === 'chicken' || b.race === 'cow';
  if (b.race === 'wolf') return false;
  const ra = RACES[a.race], rb = RACES[b.race];
  if (!ra.civ || !rb.civ) return false;
  if (a.race === 'orc' || b.race === 'orc') return a.race !== b.race;
  if (a.kingdom && b.kingdom && a.kingdom !== b.kingdom) {
    const ka = game.kingdomById(a.kingdom), kb = game.kingdomById(b.kingdom);
    if (!ka || !kb) return false;
    if (ka.allies.has(b.kingdom)) return false;             // 盟友不互打
    if (ka.wars.has(b.kingdom)) return true;                // 直接交战
    // A的盟友与B交战 → A也被卷入
    for (const aid of ka.allies) {
      const ally = game.kingdomById(aid);
      if (ally && ally.wars.has(b.kingdom)) return true;
    }
    for (const bid of kb.allies) {
      const ally = game.kingdomById(bid);
      if (ally && ally.wars.has(a.kingdom)) return true;
    }
  }
  return false;
}

/* ---------- 空间哈希 (每tick重建, 加速邻居查询) ---------- */
function rebuildSpatial(game) {
  const sp = new Map();
  const CS = 4;
  for (const u of game.units) {
    const key = ((u.x / CS) | 0) + ',' + ((u.y / CS) | 0);
    let arr = sp.get(key);
    if (!arr) { arr = []; sp.set(key, arr); }
    arr.push(u);
  }
  game._spatial = sp;
  game._spatialCS = CS;
}
function forEachNear(game, x, y, r, cb) {
  const CS = game._spatialCS || 4;
  const x0 = ((x - r) / CS) | 0, x1 = ((x + r) / CS) | 0;
  const y0 = ((y - r) / CS) | 0, y1 = ((y + r) / CS) | 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const arr = game._spatial && game._spatial.get(cx + ',' + cy);
      if (!arr) continue;
      for (const u of arr) {
        const dx = u.x - x, dy = u.y - y;
        if (dx * dx + dy * dy <= r * r) cb(u);
      }
    }
  }
}

/* ---------- 单位 ---------- */
let _unitId = 1;
class Unit {
  constructor(race, x, y) {
    const def = RACES[race];
    this.id = _unitId++;
    this.race = race;
    this.x = x; this.y = y;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.age = 0;               // tick 计, 600 tick = 1年
    this.village = 0;           // 村庄 id
    this.kingdom = 0;           // 王国 id
    this.job = 'none';          // none | warrior | settler
    this.tx = x; this.ty = y;   // 移动目标
    this.atkCd = 0;
    this.wanderCd = 0;
    this.spawnCd = 60;          // 出生后过多久可以建村
    this.bless = 0;             // 祝福剩余
    this.plague = 0;            // 瘟疫剩余
    this.name = NameGen.unit(race);
    this.dead = false;
  }

  get def() { return RACES[this.race]; }
  get adult() { return this.age >= 1800; } // 3岁成年
  get years() { return (this.age / 600) | 0; }

  damage(game, amount, attacker) {
    if (this.dead) return;
    this.hp -= amount;
    // 血液粒子
    for (let i = 0; i < 4; i++) {
      game.addParticle(this.x + (Math.random() - 0.5) * 0.5, this.y + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.15, -0.05 - Math.random() * 0.1, 20 + Math.random() * 20 | 0, '#c02020', 1.2);
    }
    if (this.hp <= 0) this.kill(game);
  }

  kill(game) {
    if (this.dead) return;
    this.dead = true;
    for (let i = 0; i < 8; i++) {
      game.addParticle(this.x, this.y, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2,
        30 + Math.random() * 20 | 0, '#a01818', 1.5);
    }
  }

  /* 向目标移动, 文明单位可游泳过河/海, 桥上全速 */
  _traverseSpeed(game, x, y) {
    const w = game.world;
    if (!w.inB(x | 0, y | 0)) return 0;
    const i = w.idx(x | 0, y | 0);
    const t = w.tiles[i];
    if (t === T.LAVA) return 0;
    if (w.road[i]) return 1;             // 木桥: 全速通行
    if (passableT(t) && !w.fire[i]) return 1;
    if (!this.def.civ) return 0;          // 动物不能游泳
    if (t === T.SHALLOW) return 0.45;     // 浅海游泳
    if (t === T.DEEP) return 0.22;       // 深海游泳
    return 0;
  }
  moveToward(game, tx, ty, speedMul) {
    const w = game.world;
    let dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return true;
    const sp = this.def.speed * (speedMul || 1) * (this.bless > 0 ? 1.4 : 1) * (this.adult ? 1 : 0.6);
    dx /= dist; dy /= dist;
    const baseDir = Math.atan2(dy, dx);
    for (const ang of [0, 0.7, -0.7, 1.4, -1.4, Math.PI / 2, -Math.PI / 2]) {
      const a = baseDir + ang;
      const cx = Math.cos(a), cy = Math.sin(a);
      const nx = this.x + cx * sp, ny = this.y + cy * sp;
      const tm = this._traverseSpeed(game, nx, ny);
      if (tm > 0) {
        const ms = sp * tm;
        this.x += cx * ms; this.y += cy * ms;
        if (tm < 1 && Math.random() < 0.5) game.addParticle(
          this.x + (Math.random() - .5) * .4, this.y + .35,
          (Math.random() - .5) * .04, -0.04, 18, '#a0d8f0', 1.3);
        return dist <= ms;
      }
    }
    return false;
  }

  wander(game, radius) {
    if (this.wanderCd > 0) { this.wanderCd--; }
    const arrived = Math.hypot(this.tx - this.x, this.ty - this.y) < 0.6;
    if (this.wanderCd <= 0 || arrived) {
      this.wanderCd = 60 + Math.random() * 120 | 0;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * (radius || 6);
      const nx = this.x + Math.cos(a) * d, ny = this.y + Math.sin(a) * d;
      if (game.world.inB(nx | 0, ny | 0) && passableT(game.world.get(nx | 0, ny | 0))) {
        this.tx = nx; this.ty = ny;
      }
    }
    this.moveToward(game, this.tx, this.ty, 0.7);
  }

  tick(game) {
    if (this.dead) return;
    const w = game.world;
    this.age++;
    if (this.spawnCd > 0) this.spawnCd--;
    if (this.atkCd > 0) this.atkCd--;

    // --- 状态效果 ---
    if (this.bless > 0) {
      this.bless--;
      this.hp = Math.min(this.maxHp, this.hp + 0.08);
      if (Math.random() < 0.1) game.addParticle(this.x + (Math.random() - .5), this.y - Math.random() * 0.5, 0, -0.04, 25, '#ffe070', 1.2);
    }
    if (this.plague > 0) {
      this.plague--;
      this.hp -= 0.05;
      if (Math.random() < 0.15) game.addParticle(this.x + (Math.random() - .5) * .6, this.y - Math.random() * .5, 0, -0.03, 25, '#4a9a2a', 1.4);
      if (this.hp <= 0) { this.kill(game); return; }
      // 传播
      if (Math.random() < 0.02) {
        forEachNear(game, this.x, this.y, 1.6, (o) => {
          if (o !== this && RACES[o.race].civ && o.plague <= 0 && o.bless <= 0 && Math.random() < 0.4) o.plague = 1200;
        });
      }
    }
    // --- 环境伤害 ---
    const ti = w.idx(this.x | 0, this.y | 0);
    const tt = w.tiles[ti];
    if (tt === T.LAVA) { this.damage(game, 2); if (this.dead) return; }
    else if (w.fire[ti]) { this.damage(game, 0.5); if (this.dead) return; }
    // 深海溺水 (文明单位游泳中, 桥上不会溺水)
    else if (tt === T.DEEP && this.def.civ && !w.road[ti] && Math.random() < 0.25) { this.hp -= 0.015; }
    // --- 寿命 ---
    if (this.years > this.def.lifespan && Math.random() < 0.002) { this.kill(game); return; }
    // 缓慢回血
    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 0.008);

    if (this.def.civ) this.tickCiv(game);
    else this.tickAnimal(game);
  }

  /* ---------- 动物AI ---------- */
  tickAnimal(game) {
    if (this.race === 'wolf') {
      // 寻找猎物
      let prey = null, pd = 81;
      forEachNear(game, this.x, this.y, 9, (o) => {
        if (o.dead) return;
        if (o.race === 'sheep' || o.race === 'chicken' || o.race === 'cow') {
          const d = (o.x - this.x) ** 2 + (o.y - this.y) ** 2;
          if (d < pd) { pd = d; prey = o; }
        }
      });
      if (prey) {
        if (pd < 1.1) {
          if (this.atkCd <= 0) { this.atkCd = 25; prey.damage(game, this.def.dmg, this); }
        } else this.moveToward(game, prey.x, prey.y, 1.2);
        return;
      }
    }
    this.wander(game, 8);
    // 繁殖
    if (this.adult && Math.random() < 0.0004) {
      let count = 0;
      for (const u of game.units) if (u.race === this.race) count++;
      if (count < 130) {
        const baby = new Unit(this.race, this.x + (Math.random() - .5), this.y + (Math.random() - .5));
        game.units.push(baby);
      }
    }
  }

  /* ---------- 文明种族AI ---------- */
  tickCiv(game) {
    const w = game.world;

    // 1) 附近的敌人: 战士迎战 / 平民逃跑
    let enemy = null, ed = 100;
    forEachNear(game, this.x, this.y, 10, (o) => {
      if (o.dead || !isHostile(game, this, o)) return;
      const d = (o.x - this.x) ** 2 + (o.y - this.y) ** 2;
      if (d < ed) { ed = d; enemy = o; }
    });

    const kingdom = game.kingdomById(this.kingdom);
    const atWar = kingdomAtWar(game, kingdom);
    // 战时成为战士
    if (this.adult && atWar && this.job === 'none' && Math.random() < 0.02) this.job = 'warrior';
    if (!atWar && this.job === 'warrior') this.job = 'none';

    if (enemy) {
      if (this.job === 'warrior' || (this.adult && ed < 4 && this.race === 'orc')) {
        if (ed < 1.44) { // 1.2^2
          if (this.atkCd <= 0) {
            this.atkCd = 22;
            const dmg = this.def.dmg * (this.bless > 0 ? 1.6 : 1) * (0.7 + Math.random() * 0.6);
            enemy.damage(game, dmg, this);
          }
        } else this.moveToward(game, enemy.x, enemy.y, 1.25);
        return;
      }
      // 平民逃跑
      if (ed < 16) {
        const a = Math.atan2(this.y - enemy.y, this.x - enemy.x);
        this.moveToward(game, this.x + Math.cos(a) * 5, this.y + Math.sin(a) * 5, 1.3);
        return;
      }
    }

    // 2) 开拓者: 前往新地建村
    if (this.job === 'settler') {
      const arrived = this.moveToward(game, this.tx, this.ty, 1);
      this.settleT = (this.settleT || 0) + 1;
      if (arrived || this.settleT > 1500) {
        if (tryFoundVillage(game, this)) return;
        if (this.settleT > 1500) { // 放弃, 加入最近同族村庄
          this.job = 'none'; this.settleT = 0;
          const v = nearestVillage(game, this.x, this.y, 30, this.race);
          if (v) { this.village = v.id; this.kingdom = v.kingdom; }
        }
      }
      return;
    }

    // 3) 无村庄的文明单位: 尝试建村
    if (!this.village) {
      if (this.spawnCd <= 0 && this.adult && game.villages.length < 40) {
        if (tryFoundVillage(game, this)) return;
      }
      // 加入附近同族村庄
      if (Math.random() < 0.01) {
        const v = nearestVillage(game, this.x, this.y, 15, this.race);
        if (v) { this.village = v.id; this.kingdom = v.kingdom; return; }
      }
      this.wander(game, 10);
      return;
    }

    const village = game.villageById(this.village);
    if (!village) { this.village = 0; return; }

    // 4) 战士: 进攻敌对王国村庄
    if (this.job === 'warrior' && kingdom && kingdom.wars.size) {
      const targetV = findWarTarget(game, kingdom, this);
      if (targetV) {
        const d2 = (targetV.cx - this.x) ** 2 + (targetV.cy - this.y) ** 2;
        if (d2 > 4) { this.moveToward(game, targetV.cx, targetV.cy, 1.1); return; }
        // 攻击建筑
        const b = nearestBuilding(targetV, this.x, this.y, 2.5);
        if (b && this.atkCd <= 0) {
          this.atkCd = 25;
          damageBuilding(game, b, this.def.dmg * 1.5);
          return;
        }
        if (b) { this.moveToward(game, b.x, b.y, 1.1); return; }
      }
    }

    // 5) 建造
    const site = village.buildings.find(b => b.progress < 1);
    if (site && this.adult && this.job === 'none') {
      const d2 = (site.x - this.x) ** 2 + (site.y - this.y) ** 2;
      if (d2 < 2.6) {
        site.progress += 0.012;
        if (Math.random() < 0.1) game.addParticle(site.x + (Math.random() - .5), site.y - Math.random() * .5, 0, -0.05, 15, '#d8c890', 1);
        if (site.progress >= 1) completeBuilding(game, village, site);
      } else this.moveToward(game, site.x, site.y, 1);
      return;
    }

    // 6) 日常闲逛(围绕村庄)
    if (!this.adult) { this.wander(game, 4); return; }
    const a = Math.random() * Math.PI * 2;
    if (this.wanderCd <= 0 || Math.hypot(this.tx - this.x, this.ty - this.y) < 0.6) {
      this.wanderCd = 80 + Math.random() * 150 | 0;
      const d = Math.random() * village.radius * 0.8;
      const nx = village.cx + Math.cos(a) * d, ny = village.cy + Math.sin(a) * d;
      if (w.inB(nx | 0, ny | 0) && passableT(w.get(nx | 0, ny | 0))) { this.tx = nx; this.ty = ny; }
    }
    if (this.wanderCd > 0) this.wanderCd--;
    this.moveToward(game, this.tx, this.ty, 0.65);
  }
}

/* ---------- 村庄 ---------- */
let _villageId = 1;
class Village {
  constructor(race, kingdom, x, y) {
    this.id = _villageId++;
    this.name = NameGen.village();
    this.race = race;
    this.kingdom = kingdom;
    this.cx = x; this.cy = y;
    this.radius = 8;
    this.food = 25;
    this.buildings = [];
    this.farmTiles = [];
    this.pop = 0;
    this.unrest = 0;          // 不满度 0~100
    this.zoneDirty = true;
    this.tick = 0;
    this.dead = false;
  }

  get color() { return '#fff'; }

  capacity() {
    let cap = 0;
    for (const b of this.buildings) {
      if (b.progress < 1) continue;
      if (b.type === 'hall') cap += 6;
      else if (b.type === 'house') cap += 4;
    }
    return cap;
  }

  hall() { return this.buildings.find(b => b.type === 'hall'); }

  maxHouses() { return 4 + this.radius; }

  tickVillage(game) {
    if (this.dead) return;
    this.tick++;
    const w = game.world;

    // 农田生长
    for (const fi of this.farmTiles) {
      let s = w.farm[fi];
      if (s === 0) continue;
      if (Math.random() < (game.weather.rain > 0 ? 0.006 : 0.003)) {
        s++;
        if (s > 5) { s = 1; this.food += 7; }
        w.farm[fi] = s;
        w.overlayDirty = true;
      }
    }

    if (this.tick % 20 === 0) {
      // 人口增长
      const cap = this.capacity();
      if (this.pop < cap && this.food >= 12 && game.units.length < game.maxUnits) {
        this.food -= 12;
        const h = this.hall() || this.buildings[0];
        const u = new Unit(this.race, this.cx + (Math.random() - .5) * 2, this.cy + (Math.random() - .5) * 2);
        u.village = this.id; u.kingdom = this.kingdom;
        game.units.push(u);
        this.pop++;
      }
      // 饥饿: 没食物且超生
      if (this.food < 5 && this.pop > cap) {
        // 有人挨饿 -> 概率死亡
        if (Math.random() < 0.1) {
          const victim = game.units.find(u => u.village === this.id);
          if (victim) victim.kill(game);
        }
      }

      // 扩张: 建房子
      const houses = this.buildings.filter(b => b.type === 'house').length;
      const farms = this.buildings.filter(b => b.type === 'farm').length;
      const queued = this.buildings.some(b => b.progress < 1);
      if (!queued && this.pop >= cap - 1 && houses < this.maxHouses()) {
        const spot = this.findBuildSpot(game, 2);
        if (spot) this.buildings.push({ type: 'house', x: spot.x, y: spot.y, hp: 60, maxHp: 60, progress: 0, village: this.id });
      } else if (!queued && farms < Math.max(1, (houses / 2) | 0)) {
        const spot = this.findBuildSpot(game, 2, true);
        if (spot) this.buildings.push({ type: 'farm', x: spot.x, y: spot.y, hp: 30, maxHp: 30, progress: 0, village: this.id });
      }

      // 半径成长
      if (houses >= this.maxHouses() - 1 && this.radius < 16) {
        this.radius++;
        this.zoneDirty = true;
      }

      // 派出开拓者
      if (this.pop >= cap && cap >= 10 && Math.random() < 0.06 && game.villages.length < 40) {
        const settler = game.units.find(u => u.village === this.id && u.adult && u.job === 'none');
        if (settler) {
          const a = Math.random() * Math.PI * 2, d = 15 + Math.random() * 20;
          const nx = Math.round(this.cx + Math.cos(a) * d), ny = Math.round(this.cy + Math.sin(a) * d);
          const land = w.nearestLand(nx, ny, 12);
          if (land) {
            settler.job = 'settler'; settler.village = 0;
            settler.tx = land.x; settler.ty = land.y; settler.settleT = 0;
          }
        }
      }
      // 不满度更新
      this.tickUnrest(game);
    }

    // 领地重算 & 叛乱判定
    if (this.zoneDirty || this.tick % 300 === 0) {
      this.recomputeZone(game);
      this.zoneDirty = false;
    }
    if (this.tick % 300 === 0) this.checkRebellion(game);
  }

  tickUnrest(game) {
    const cap = this.capacity();
    let hasPlague = false;
    for (const u of game.units) {
      if (u.village === this.id && u.plague > 0) { hasPlague = true; break; }
    }
    let delta = -0.35;
    if (this.food < this.pop) delta += 1.8;
    if (this.pop > cap) delta += 1.2;
    if (hasPlague) delta += 2.5;
    const kingdom = game.kingdomById(this.kingdom);
    if (kingdom && kingdomAtWar(game, kingdom)) delta += 0.6;
    this.unrest = Math.max(0, Math.min(100, this.unrest + delta));
  }

  checkRebellion(game) {
    if (this.unrest < 80) return;
    const kingdom = game.kingdomById(this.kingdom);
    if (!kingdom || kingdom.villages.length < 2) return;
    if (this.dead) return;
    // 30% 概率触发叛变
    if (Math.random() > 0.3 * (this.unrest / 100)) return;

    const newKingdom = new Kingdom(this.race);
    newKingdom.name = generateRebelName(kingdom.race);
    game.kingdoms.push(newKingdom);

    // 将该村划入叛军王国
    const oldVillages = kingdom.villages;
    kingdom.villages = oldVillages.filter(id => id !== this.id);
    newKingdom.villages.push(this.id);
    this.kingdom = newKingdom.id;
    this.unrest = 30; // 释放部分不满
    this.zoneDirty = true;

    // 村民改旗易帜
    for (const u of game.units) {
      if (u.village === this.id) u.kingdom = newKingdom.id;
    }

    // 宣战
    kingdom.wars.add(newKingdom.id);
    newKingdom.wars.add(kingdom.id);

    game.logEvent('rebellion', `⚔️ 「${this.name}」发动叛乱，脱离「${kingdom.name}」成立「${newKingdom.name}」！`, kingdom.color);

    // 连锁叛变: 同王国内距离 <35 且不满 >=60 的邻村有概率一并脱离
    for (const vid of [...kingdom.villages]) {
      const v = game.villageById(vid);
      if (!v || v.kingdom !== kingdom.id) continue;
      const d = Math.hypot(v.cx - this.cx, v.cy - this.cy);
      if (d < 35 && v.unrest >= 60 && Math.random() < 0.45) {
        kingdom.villages = kingdom.villages.filter(id => id !== vid);
        newKingdom.villages.push(vid);
        v.kingdom = newKingdom.id;
        v.unrest = 25;
        v.zoneDirty = true;
        for (const u of game.units) {
          if (u.village === v.id) u.kingdom = newKingdom.id;
        }
        game.logEvent('rebellion', `「${v.name}」也加入了叛军！`);
      }
    }

    // 如果原王国没村庄了则清理
    if (kingdom.villages.length === 0) {
      for (const k of game.kingdoms) k.wars.delete(kingdom.id);
      game.kingdoms = game.kingdoms.filter(k => k !== kingdom);
    }
  }

  findBuildSpot(game, clearance, needGrass) {
    const w = game.world;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 2 + Math.random() * (this.radius - 3);
      const x = Math.round(this.cx + Math.cos(a) * d), y = Math.round(this.cy + Math.sin(a) * d);
      if (!w.inB(x, y)) continue;
      const t = w.get(x, y);
      if (needGrass ? (t !== T.GRASS && t !== T.BURNT) : !passableT(t)) continue;
      if (w.farm[w.idx(x, y)]) continue;
      // 不与其他建筑重叠
      let clash = false;
      for (const b of this.buildings) {
        if (Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2) { clash = true; break; }
      }
      if (!clash) return { x, y };
    }
    return null;
  }

  /* 领地: 从中心洪泛, 覆盖半径内可通行地块 */
  recomputeZone(game) {
    const w = game.world;
    const R = this.radius + 3;
    const myId = this.id;
    // 清除旧领地
    for (let y = Math.max(0, this.cy - R - 4); y <= Math.min(w.h - 1, this.cy + R + 4); y++) {
      for (let x = Math.max(0, this.cx - R - 4); x <= Math.min(w.w - 1, this.cx + R + 4); x++) {
        const i = w.idx(x, y);
        if (w.zone[i] === myId) { w.zone[i] = 0; }
      }
    }
    // 重新标记
    for (let y = Math.max(0, this.cy - R); y <= Math.min(w.h - 1, this.cy + R); y++) {
      for (let x = Math.max(0, this.cx - R); x <= Math.min(w.w - 1, this.cx + R); x++) {
        const d = Math.hypot(x - this.cx, y - this.cy);
        if (d > R) continue;
        const i = w.idx(x, y);
        if (!passableT(w.tiles[i])) continue;
        if (w.zone[i] === 0) w.zone[i] = myId;
        else if (w.zone[i] !== myId) {
          // 争夺: 离谁中心近归谁
          const other = game.villageById(w.zone[i]);
          if (other) {
            const dOther = Math.hypot(x - other.cx, y - other.cy);
            if (d < dOther) w.zone[i] = myId;
          } else w.zone[i] = myId;
        }
      }
    }
    w.overlayDirty = true;
  }

  clearZone(game) {
    const w = game.world;
    for (let i = 0; i < w.zone.length; i++) if (w.zone[i] === this.id) w.zone[i] = 0;
    w.overlayDirty = true;
  }

  destroy(game) {
    if (this.dead) return;
    this.dead = true;
    this.clearZone(game);
    // 农田荒废
    const w = game.world;
    for (const fi of this.farmTiles) { w.farm[fi] = 0; w.farmV[fi] = 0; }
    w.overlayDirty = true;
    // 村民变成流民
    for (const u of game.units) {
      if (u.village === this.id) { u.village = 0; u.job = 'none'; u.spawnCd = 200; }
    }
    const k = game.kingdomById(this.kingdom);
    if (k) k.villages = k.villages.filter(id => id !== this.id);
    const k0 = game.kingdomById(this.kingdom);
    game.logEvent('village', `🔥 ${this.name} 被摧毁了!`, k0 ? k0.color : null);
  }
}

function nearestBuilding(village, x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const b of village.buildings) {
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function damageBuilding(game, b, dmg) {
  b.hp -= dmg;
  for (let i = 0; i < 3; i++) {
    game.addParticle(b.x + (Math.random() - .5), b.y - Math.random(), (Math.random() - .5) * .1, -0.05, 20, '#8a6a4a', 1.2);
  }
  if (b.hp <= 0) {
    const v = game.villageById(b.village);
    if (v) {
      v.buildings = v.buildings.filter(x => x !== b);
      if (b.type === 'farm') removeFarmTiles(game, v, b);
      if (b.type === 'hall') v.destroy(game);
    }
  }
}

function completeBuilding(game, village, b) {
  b.progress = 1;
  const w = game.world;
  if (b.type === 'farm') {
    // 圈出周围草地作为农田
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = b.x + dx, y = b.y + dy;
        if (!w.inB(x, y)) continue;
        const i = w.idx(x, y);
        if ((w.tiles[i] === T.GRASS || w.tiles[i] === T.BURNT) && !w.farm[i]) {
          w.farm[i] = 1; w.farmV[i] = village.id;
          village.farmTiles.push(i);
          if (++n >= 5) break;
        }
      }
      if (n >= 5) break;
    }
    w.overlayDirty = true;
  } else if (b.type === 'house' || b.type === 'hall') {
    // 铺路到村庄中心
    layRoad(game, b.x, b.y, village.cx, village.cy);
  }
  village.zoneDirty = true;
}

function removeFarmTiles(game, village, b) {
  const w = game.world;
  village.farmTiles = village.farmTiles.filter(fi => {
    const fx = fi % w.w, fy = (fi / w.w) | 0;
    if (Math.abs(fx - b.x) <= 1 && Math.abs(fy - b.y) <= 1) { w.farm[fi] = 0; w.farmV[fi] = 0; return false; }
    return true;
  });
  w.overlayDirty = true;
}

function layRoad(game, x0, y0, x1, y1) {
  const w = game.world;
  let x = x0, y = y0;
  let guard = 200;
  while ((x !== x1 || y !== y1) && guard-- > 0) {
    const i = w.idx(x, y);
    // 陆地和浅海(木桥)可铺路, 避开农田/熔岩/深海
    if ((passableT(w.tiles[i]) || w.tiles[i] === T.SHALLOW) && !w.farm[i] && w.tiles[i] !== T.LAVA) { w.road[i] = 1; }
    if (x < x1) x++; else if (x > x1) x--;
    else if (y < y1) y++; else if (y > y1) y--;
    else break;
  }
  w.overlayDirty = true;
}

/* ---------- 王国 ---------- */
let _kingdomId = 1;
class Kingdom {
  constructor(race) {
    this.id = _kingdomId++;
    this.name = NameGen.kingdom(race);
    this.race = race;
    this.color = KINGDOM_COLORS[(this.id - 1) % KINGDOM_COLORS.length];
    this.villages = [];
    this.wars = new Set();
    this.allies = new Set();
  }
}

/* ---------- 全局文明函数 ---------- */
function nearestVillage(game, x, y, maxD, race) {
  let best = null, bd = maxD * maxD;
  for (const v of game.villages) {
    if (v.dead) continue;
    if (race && v.race !== race) continue;
    const d = (v.cx - x) ** 2 + (v.cy - y) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function tryFoundVillage(game, unit) {
  const w = game.world;
  const x = unit.x | 0, y = unit.y | 0;
  if (!w.inB(x, y) || !passableT(w.get(x, y))) return false;
  if (nearestVillage(game, x, y, 12)) return false;
  // 周围需大致为陆地
  let land = 0, total = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    total++;
    if (passableT(w.get(x + dx, y + dy))) land++;
  }
  if (land / total < 0.6) return false;

  // 决定王国: 优先自己原王国, 其次附近同族王国, 否则新建
  let kingdom = null;
  if (unit.kingdom) {
    const k = game.kingdomById(unit.kingdom);
    if (k && k.race === unit.race) kingdom = k;
  }
  if (!kingdom) {
    const nv = nearestVillage(game, x, y, 40, unit.race);
    if (nv) kingdom = game.kingdomById(nv.kingdom);
  }
  if (!kingdom) {
    kingdom = new Kingdom(unit.race);
    game.kingdoms.push(kingdom);
    game.logEvent('kingdom', `👑 ${RACES[unit.race].name}建立了「${kingdom.name}」!`, kingdom.color);
  }

  const v = new Village(unit.race, kingdom.id, x, y);
  v.buildings.push({ type: 'hall', x, y, hp: 150, maxHp: 150, progress: 1, village: v.id });
  kingdom.villages.push(v.id);
  game.villages.push(v);
  unit.village = v.id; unit.kingdom = kingdom.id;
  if (unit.job === 'settler') { unit.job = 'none'; unit.settleT = 0; }
  v.recomputeZone(game);
  game.logEvent('village', `🏠 「${v.name}」建成了!`);
  return true;
}

function findWarTarget(game, kingdom, unit) {
  let best = null, bd = Infinity;
  // 收集所有敌方王国(自己的敌人 + 盟友的敌人)
  const enemies = new Set(kingdom.wars);
  for (const aid of kingdom.allies) {
    const ally = game.kingdomById(aid);
    if (ally) for (const wid of ally.wars) enemies.add(wid);
  }
  for (const vkId of enemies) {
    const enemy = game.kingdomById(vkId);
    if (!enemy) continue;
    for (const vid of enemy.villages) {
      const v = game.villageById(vid);
      if (!v || v.dead) continue;
      const d = (v.cx - unit.x) ** 2 + (v.cy - unit.y) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
  }
  return best;
}

/* 王国或其任一盟友处于战争 */
function kingdomAtWar(game, kingdom) {
  if (!kingdom) return false;
  if (kingdom.wars.size > 0) return true;
  for (const aid of kingdom.allies) {
    const ally = game.kingdomById(aid);
    if (ally && ally.wars.size > 0) return true;
  }
  return false;
}

/* 王国间战争判定 & 同盟外交 (每150 tick) */
function kingdomsTick(game) {
  const ks = game.kingdoms.filter(k => k.villages.length > 0);
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      const A = ks[i], B = ks[j];
      // 计算两王国村庄最小距离
      let minD = Infinity;
      for (const va of A.villages) {
        const a = game.villageById(va);
        if (!a) continue;
        for (const vb of B.villages) {
          const b = game.villageById(vb);
          if (!b) continue;
          const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          if (d < minD) minD = d;
        }
      }
      const orcWar = (A.race === 'orc' || B.race === 'orc') && A.race !== B.race;
      const atWar = A.wars.has(B.id);

      // --- 战争宣言/议和 ---
      if (minD < 50 || (orcWar && minD < 80)) {
        if (!atWar) {
          if (orcWar || Math.random() < 0.18) {
            A.wars.add(B.id); B.wars.add(A.id);
            game.logEvent('war', `⚔️ 「${A.name}」向「${B.name}」宣战!`, A.color);
            // 宣战即解除同盟(背刺)
            if (A.allies.has(B.id)) {
              A.allies.delete(B.id); B.allies.delete(B.id);
              game.logEvent('alliance', `💔 「${A.name}」背叛了与「${B.name}」的同盟！`);
            }
          }
        } else if (!orcWar && Math.random() < 0.12) {
          A.wars.delete(B.id); B.wars.delete(A.id);
          game.logEvent('war', `🕊️ 「${A.name}」与「${B.name}」议和了`);
        }
      }

      // --- 同盟缔结 (邻近且非战争非兽人, 各有盟友<=3) ---
      if (!atWar && !orcWar && minD < 45 && A.allies.size < 3 && B.allies.size < 3) {
        const hasCommon = [...A.wars].some(w => B.wars.has(w));
        const sameRace = A.race === B.race && minD < 35;
        const chance = hasCommon ? 0.30 : (sameRace ? 0.20 : 0.08);
        if (Math.random() < chance) {
          A.allies.add(B.id); B.allies.add(A.id);
          game.logEvent('alliance', `🤝 「${A.name}」与「${B.name}」缔结了同盟！`);
        }
      }

      // --- 同盟瓦解 (无共同敌人且异族, 概率断交) ---
      if (A.allies.has(B.id)) {
        const hasCommon = [...A.wars].some(w => B.wars.has(w));
        if (!hasCommon && A.race !== B.race && Math.random() < 0.15) {
          A.allies.delete(B.id); B.allies.delete(B.id);
          game.logEvent('alliance', `💔 「${A.name}」与「${B.name}」的同盟破裂了`);
        }
      }
    }
  }
  // 清理没有村庄的王国(包括 allies 清理)
  for (const k of game.kingdoms) {
    if (k.villages.length === 0) {
      for (const o of game.kingdoms) { o.wars.delete(k.id); o.allies.delete(k.id); }
    }
  }
  game.kingdoms = game.kingdoms.filter(k => k.villages.length > 0);
}

/* 每tick文明主更新 */
function civTick(game) {
  rebuildSpatial(game);
  for (const u of game.units) u.tick(game);
  // 清理死亡单位
  if (game.units.some(u => u.dead)) game.units = game.units.filter(u => !u.dead);
  for (const v of game.villages) v.tickVillage(game);
  if (game.villages.some(v => v.dead)) game.villages = game.villages.filter(v => !v.dead);
  if (game.tick % 150 === 0) kingdomsTick(game);
  // 每60 tick统计人口
  if (game.tick % 60 === 0) {
    for (const v of game.villages) v.pop = 0;
    for (const u of game.units) {
      if (u.village) {
        const v = game.villageById(u.village);
        if (v) v.pop++;
      }
    }
  }
}
