/* 无头冒烟测试: 在 Node 中运行核心模拟(不含渲染/UI) */
'use strict';
const fs = require('fs');
const path = require('path');

const files = ['js/noise.js', 'js/world.js', 'js/civ.js', 'js/powers.js'];
let src = files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const M = {};
src += `
Object.assign(M, { T, World, Unit, Village, Kingdom, RACES, spawnUnits, civTick, powersTick,
  explode, lightning, makeRNG, forEachNear, nearestVillage, tryFoundVillage, TOOLS, isHostile,
  rebuildSpatial, brushTiles });
`;
globalThis.Sound = { init(){}, resume(){}, hit(){}, death(){}, water(){}, build(){}, found(){}, war(){}, rebel(){}, erupt(){}, explosion(){}, thunder(){}, quake(){}, plague(){}, bless(){}, rain(){}, click(){} };
eval(src);

/* ---------- Game 桩 ---------- */
const game = {
  world: null,
  units: [], villages: [], kingdoms: [],
  particles: [], tornadoes: [], tnts: [], quakes: [],
  events: [],
  settings: { showZones: true, showVillageNames: true, showParticles: true, maxUnits: 900 },
  weather: { rain: 0 }, shake: 0, tick: 0,
  maxUnits: 900,
  toasts: [],
  toast(m) { this.toasts.push(m); },
  logEvent(type, msg, color) { this.toasts.push(msg); this.events.unshift({ year: (this.tick / 600) | 0, type, msg, color }); },
  addParticle(x, y, vx, vy, life, color, size) {
    if (this.particles.length < 2000) this.particles.push({ x, y, vx, vy, life, color, size });
  },
  villageById(id) { return this.villages.find(v => v.id === id) || null; },
  kingdomById(id) { return this.kingdoms.find(k => k.id === id) || null; },
};

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ 失败: ' + msg); }
}

/* ---------- 1. 世界生成 ---------- */
console.log('■ 世界生成');
game.world = new M.World(128, 128, 12345);
const counts = {};
for (const t of game.world.tiles) counts[t] = (counts[t] || 0) + 1;
assert(counts[M.T.DEEP] > 0, '有深海');
assert(counts[M.T.SHALLOW] > 0, '有浅海');
assert(counts[M.T.GRASS] + counts[M.T.FOREST] > 1000, `有足够陆地 (草地+森林=${(counts[M.T.GRASS] || 0) + (counts[M.T.FOREST] || 0)})`);
assert(counts[M.T.MOUNTAIN] > 0, '有高山');
// 边缘必须是水
let edgeWater = true;
for (let x = 0; x < 128; x++) {
  if (game.world.get(x, 0) > M.T.SHALLOW || game.world.get(x, 127) > M.T.SHALLOW) edgeWater = false;
}
assert(edgeWater, '地图边缘是海洋');

/* ---------- 2. 单位生成与建村 ---------- */
console.log('■ 文明模拟 (3000 tick)');
for (let g = 0; g < 4; g++) {
  const p = game.world.randLandPos(null, true);
  M.spawnUnits(game, ['human', 'elf', 'orc', 'dwarf'][g], p.x, p.y, 8);
}
assert(game.units.length === 32, `生成了32个单位 (实际 ${game.units.length})`);
assert(game.units.every(u => u.adult), '生成的单位是成年');

const t0 = Date.now();
for (let i = 0; i < 3000; i++) {
  game.tick = i;
  game.world.tick(game);
  M.civTick(game);
  M.powersTick(game);
}
console.log(`  (3000 tick 耗时 ${Date.now() - t0}ms)`);
assert(game.villages.length >= 2, `建立了村庄 (${game.villages.length}个)`);
assert(game.kingdoms.length >= 1, `建立了王国 (${game.kingdoms.length}个)`);
assert(game.units.length > 0, `人口存活 (${game.units.length})`);
const civs = game.units.filter(u => M.RACES[u.race].civ && u.village);
assert(civs.length > 0, `有村民归属村庄 (${civs.length}人)`);
const totalHouses = game.villages.reduce((s, v) => s + v.buildings.length, 0);
console.log(`  村庄=${game.villages.length} 王国=${game.kingdoms.length} 人口=${game.units.length} 建筑=${totalHouses}`);
assert(totalHouses > game.villages.length, '村庄建造了额外建筑');
// 领地
let zoned = 0;
for (const z of game.world.zone) if (z) zoned++;
assert(zoned > 0, `领地已划分 (${zoned}格)`);

/* ---------- 3. 灾难 ---------- */
console.log('■ 灾难工具');
const land = game.world.randLandPos(null, true);
M.explode(game, land.x, land.y, 6, { lava: true, dmg: 200 });
assert(game.world.get(land.x, land.y) === M.T.LAVA, '陨石坑中心是熔岩');
M.lightning(game, land.x + 10, land.y + 10);
const nuke = M.TOOLS.find(t => t.id === 'nuke');
nuke.apply(game, land.x, land.y - 10);
assert(game.shake >= 25, '核弹造成震屏');
const tor = M.TOOLS.find(t => t.id === 'tornado');
tor.apply(game, land.x, land.y);
assert(game.tornadoes.length === 1, '龙卷风生成');
const quake = M.TOOLS.find(t => t.id === 'quake');
quake.apply(game, land.x, land.y);
for (let i = 0; i < 900; i++) { game.tick++; game.world.tick(game); M.civTick(game); M.powersTick(game); }
assert(game.tornadoes.length === 0, '龙卷风最终消散');
assert(game.quakes.length === 0, '地震最终停止');

/* ---------- 4. 其他工具 ---------- */
console.log('■ 其他工具');
const bless = M.TOOLS.find(t => t.id === 'bless');
if (game.units.length) {
  const u = game.units[0];
  u.hp = 5;
  bless.apply(game, u.x, u.y, 3);
  assert(u.bless > 0 && u.hp === u.maxHp, '祝福治愈并加持');
  const eraser = M.TOOLS.find(t => t.id === 'eraser');
  const before = game.units.length;
  eraser.apply(game, u.x, u.y, 1);
  assert(u.dead, '橡皮擦抹除单位');
}
// 地形工具
const raise = M.TOOLS.find(t => t.id === 'raise');
const waterTile = { x: 5, y: 5 };
assert(game.world.get(waterTile.x, waterTile.y) === M.T.DEEP, '角落是深海');
raise.apply(game, waterTile.x, waterTile.y, 0);
assert(game.world.get(waterTile.x, waterTile.y) === M.T.SHALLOW, '抬升: 深海->浅海');
const volcano = M.TOOLS.find(t => t.id === 'volcano');
const vp = game.world.randLandPos(null, true);
volcano.apply(game, vp.x, vp.y);
assert(game.world.volcanoes.length > 0, '火山创建');
// 降雨灭火
game.world.ignite(vp.x + 3, vp.y + 3, 200);
M.TOOLS.find(t => t.id === 'rain').apply(game);
assert(game.weather.rain > 0, '降雨开启');

/* ---------- 5. 长时间稳定性 ---------- */
console.log('■ 长时间模拟 (再加 5000 tick)');
const t1 = Date.now();
for (let i = 0; i < 5000; i++) {
  game.tick++;
  game.world.tick(game);
  M.civTick(game);
  M.powersTick(game);
}
console.log(`  (5000 tick 耗时 ${Date.now() - t1}ms)`);
console.log(`  最终: 村庄=${game.villages.length} 王国=${game.kingdoms.length} 人口=${game.units.length} 粒子=${game.particles.length}`);
const nan = game.units.filter(u => !isFinite(u.x) || !isFinite(u.y));
assert(nan.length === 0, '没有单位坐标NaN');
assert(game.units.length <= game.maxUnits, '人口未超上限');
// 序列化检查(模拟存档)
const json = JSON.stringify({
  tiles: Array.from(game.world.tiles),
  units: game.units.map(u => ({ race: u.race, x: u.x, y: u.y })),
});
assert(json.length > 1000, `存档可序列化 (${(json.length / 1024) | 0}KB)`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
