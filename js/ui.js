/* ========== UI：工具栏、顶部栏、检查器、小地图 ========== */
'use strict';

class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.$ = (id) => document.getElementById(id);
    this.activeCat = null;
    this.buildCats();
    this.bindTopbar();
    this.bindMinimap();
    this.bindHelp();
    this.selectTool('inspect');
    this.updateTopbar();
    setInterval(() => this.updateTopbar(), 500);
    setInterval(() => this.refreshInspector(), 600);
    setInterval(() => this.renderer.drawMinimap(this.$('minimap')), 800);
    setTimeout(() => this.renderer.drawMinimap(this.$('minimap')), 100);
  }

  /* ---------- 工具栏 ---------- */
  buildCats() {
    const bar = this.$('tool-cats');
    for (const cat of TOOL_CATS) {
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.textContent = cat.name;
      btn.dataset.cat = cat.id;
      btn.onclick = () => this.togglePopup(cat.id);
      bar.appendChild(btn);
    }
    this.$('brush-size').oninput = (e) => {
      this.game.brush = parseInt(e.target.value);
    };
  }

  togglePopup(catId) {
    const popup = this.$('tool-popup');
    if (this.activeCat === catId && !popup.classList.contains('hidden')) {
      popup.classList.add('hidden');
      this.activeCat = null;
      this.markCatActive(null);
      return;
    }
    this.activeCat = catId;
    this.markCatActive(catId);
    popup.innerHTML = '';
    for (const tool of TOOLS.filter(t => t.cat === catId)) {
      const b = document.createElement('button');
      b.className = 'tool-btn' + (this.game.tool === tool.id ? ' active' : '');
      b.innerHTML = `<span class="t-icon">${tool.icon}</span><span class="t-name">${tool.name}</span>`;
      b.onclick = () => {
        this.selectTool(tool.id);
        popup.querySelectorAll('.tool-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
      popup.appendChild(b);
    }
    popup.classList.remove('hidden');
  }

  markCatActive(catId) {
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === catId);
    });
  }

  selectTool(id) {
    const tool = toolById(id);
    if (!tool) return;
    this.game.tool = id;
    this.game.currentTool = tool;
    this.$('cur-tool').textContent = tool.icon + ' ' + tool.name;
    this.$('brush-size').style.visibility = tool.brush ? 'visible' : 'hidden';
    if (id === 'inspect') this.game.cv.style.cursor = 'pointer';
    else this.game.cv.style.cursor = 'crosshair';
  }

  /* ---------- 顶部栏 ---------- */
  bindTopbar() {
    const g = this.game;
    this.$('btn-pause').onclick = () => this.setPaused(!g.paused);
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.onclick = () => {
        g.speed = parseInt(b.dataset.speed);
        g.paused = false;
        this.$('btn-pause').textContent = '⏸';
        document.querySelectorAll('.speed-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    this.$('btn-zoom-in').onclick = () => g.zoomBy(1.4);
    this.$('btn-zoom-out').onclick = () => g.zoomBy(1 / 1.4);
    this.$('btn-save').onclick = () => g.saveWorld();
    this.$('btn-load').onclick = () => g.loadWorld();
    this.$('btn-new').onclick = () => g.newWorldPrompt();
    this.$('insp-close').onclick = () => g.select(null);
  }

  setPaused(p) {
    const g = this.game;
    g.paused = p;
    this.$('btn-pause').textContent = p ? '▶' : '⏸';
  }

  updateTopbar() {
    const g = this.game;
    this.$('stat-year').textContent = ((g.tick / 600) | 0) + 1;
    this.$('stat-pop').textContent = g.units.length;
    this.$('stat-villages').textContent = g.villages.length;
    this.$('stat-kingdoms').textContent = g.kingdoms.length;
  }

  /* ---------- 检查器 ---------- */
  refreshInspector() {
    const g = this.game;
    const panel = this.$('inspector');
    if (!g.selected || !g.selected.obj || g.selected.obj.dead) {
      panel.classList.add('hidden');
      if (g.selected && g.selected.obj && g.selected.obj.dead) g.select(null);
      return;
    }
    panel.classList.remove('hidden');
    const { type, obj } = g.selected;
    const body = this.$('insp-body');
    if (type === 'unit') {
      const def = RACES[obj.race];
      const k = g.kingdomById(obj.kingdom);
      const v = g.villageById(obj.village);
      const jobName = { none: '平民', warrior: '⚔️ 战士', settler: '🚩 开拓者' }[obj.job] || obj.job;
      this.$('insp-title').textContent = `${def.icon} ${obj.name}`;
      body.innerHTML = `
        <div class="row"><span class="k">种族</span><span>${def.name}${obj.adult ? '' : ' (幼年)'}</span></div>
        <div class="row"><span class="k">年龄</span><span>${obj.years} 岁</span></div>
        <div class="row"><span class="k">生命</span><span>${Math.ceil(obj.hp)}/${obj.maxHp}</span></div>
        <div class="bar"><div style="width:${Math.max(0, obj.hp / obj.maxHp * 100)}%"></div></div>
        ${def.civ ? `<div class="row"><span class="k">职业</span><span>${jobName}</span></div>` : ''}
        ${k ? `<div class="row"><span class="k">王国</span><span style="color:${k.color}">${k.name}</span></div>` : ''}
        ${v ? `<div class="row"><span class="k">村庄</span><span>${v.name}</span></div>` : ''}
        ${obj.bless > 0 ? '<div style="color:#ffe070">✨ 受到祝福</div>' : ''}
        ${obj.plague > 0 ? '<div style="color:#7ac44a">☠️ 感染瘟疫</div>' : ''}`;
    } else if (type === 'village') {
      const k = g.kingdomById(obj.kingdom);
      const houses = obj.buildings.filter(b => b.type === 'house' && b.progress >= 1).length;
      const farms = obj.buildings.filter(b => b.type === 'farm' && b.progress >= 1).length;
      this.$('insp-title').textContent = `🏠 ${obj.name}`;
      body.innerHTML = `
        <div class="row"><span class="k">王国</span><span style="color:${k ? k.color : '#fff'}">${k ? k.name : '无'}</span></div>
        <div class="row"><span class="k">种族</span><span>${RACES[obj.race].icon} ${RACES[obj.race].name}</span></div>
        <div class="row"><span class="k">人口</span><span>${obj.pop}/${obj.capacity()}</span></div>
        <div class="row"><span class="k">食物</span><span>${obj.food | 0}</span></div>
        <div class="row"><span class="k">房屋</span><span>${houses} 🏠 / ${farms} 🌾</span></div>
        <div class="row"><span class="k">半径</span><span>${obj.radius}</span></div>
        ${k && k.wars.size ? '<div style="color:#e14b4b">⚔️ 处于战争中</div>' : ''}`;
    }
  }

  /* ---------- 小地图 ---------- */
  bindMinimap() {
    const mm = this.$('minimap');
    const g = this.game;
    const jump = (e) => {
      const r = mm.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * g.world.w;
      const y = (e.clientY - r.top) / r.height * g.world.h;
      g.cam.x = Math.max(0, Math.min(g.world.w, x));
      g.cam.y = Math.max(0, Math.min(g.world.h, y));
      this.renderer.drawMinimap(mm);
    };
    let drag = false;
    mm.addEventListener('mousedown', (e) => { drag = true; jump(e); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (drag) jump(e); });
    window.addEventListener('mouseup', () => { drag = false; });
  }

  /* ---------- 帮助 ---------- */
  bindHelp() {
    this.$('btn-help').onclick = () => this.$('help-modal').classList.remove('hidden');
    this.$('help-close').onclick = () => this.$('help-modal').classList.add('hidden');
    this.$('help-modal').onclick = (e) => {
      if (e.target === this.$('help-modal')) this.$('help-modal').classList.add('hidden');
    };
    // 首次打开显示帮助 (加 ?play 参数可跳过)
    if (!location.search.includes('play') && !localStorage.getItem('wb_seen_help')) {
      this.$('help-modal').classList.remove('hidden');
      localStorage.setItem('wb_seen_help', '1');
    }
  }
}
