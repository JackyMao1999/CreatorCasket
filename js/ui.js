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
    this.bindPanels();
    this.selectTool('inspect');
    this.updateTopbar();
    this.refreshEventLog();
    this.refreshFactions();
    setInterval(() => this.updateTopbar(), 500);
    setInterval(() => this.refreshInspector(), 600);
    setInterval(() => { this.refreshFactions(); this.refreshEventLog(); }, 1500);
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
    this.$('btn-events').onclick = () => this.togglePanel('event-log');
    this.$('btn-factions').onclick = () => this.togglePanel('faction-panel');
    this.$('btn-settings').onclick = () => this.openSettings();
    this.$('insp-close').onclick = () => g.select(null);
  }

  togglePanel(id) {
    const el = this.$(id);
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
      if (id === 'faction-panel') this.refreshFactions();
      else this.refreshEventLog();
    }
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

  /* ---------- 事件记录 & 势力列表 & 设置 ---------- */
  makeDraggable(handle, target, saveKey) {
    let down = false, sx = 0, sy = 0, tx = 0, ty = 0, moved = false;
    const onStart = (e) => {
      if (e.target.closest('button, input, select, tr, td')) return;
      e.preventDefault();
      down = true; moved = false;
      const r = target.getBoundingClientRect();
      const ev = e.touches ? e.touches[0] : e;
      sx = ev.clientX; sy = ev.clientY;
      tx = r.left; ty = r.top;
      if (getComputedStyle(target).position === 'static' || !target.style.position) {
        target.style.position = 'fixed';
        target.style.left = tx + 'px';
        target.style.top = ty + 'px';
        target.style.margin = '0';
      }
    };
    const onMove = (e) => {
      if (!down) return;
      const ev = e.touches ? e.touches[0] : e;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (!moved) return;
      let nx = tx + dx, ny = ty + dy;
      nx = Math.max(-target.offsetWidth + 50, Math.min(window.innerWidth - 50, nx));
      ny = Math.max(0, Math.min(window.innerHeight - 35, ny));
      target.style.left = nx + 'px';
      target.style.top = ny + 'px';
    };
    const onEnd = () => {
      if (!down) return;
      down = false;
      if (moved && saveKey) {
        localStorage.setItem(saveKey, JSON.stringify({ x: parseFloat(target.style.left), y: parseFloat(target.style.top) }));
      }
    };
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);

    // 恢复上次位置
    if (saveKey) {
      const saved = localStorage.getItem(saveKey);
      if (saved) try {
        const pos = JSON.parse(saved);
        target.style.position = 'fixed'; target.style.left = pos.x + 'px'; target.style.top = pos.y + 'px'; target.style.margin = '0';
      } catch (e) { /* ignore */ }
    }
  }

  bindPanels() {
    const hotkeys = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey) this.togglePanel('event-log');
      if (e.key === 'k' && !e.ctrlKey && !e.metaKey) this.togglePanel('faction-panel');
      if (e.key === 'Escape') {
        const el = document.getElementById('settings-modal');
        if (!el.classList.contains('hidden')) el.classList.add('hidden');
        else if (!this.$('tool-popup').classList.contains('hidden')) this.$('tool-popup').classList.add('hidden');
        else if (!this.$('help-modal').classList.contains('hidden')) this.$('help-modal').classList.add('hidden');
        else this.game.select(null);
      }
    };
    window.addEventListener('keydown', hotkeys);

    this.$('settings-close').onclick = () => this.closeSettings();
    this.$('settings-modal').onclick = (e) => {
      if (e.target === this.$('settings-modal')) this.closeSettings();
    };

    // 拖动支持
    this.makeDraggable(
      this.$('event-log').querySelector('.panel-head'),
      this.$('event-log'),
      'wb_pos_events'
    );
    this.makeDraggable(
      this.$('faction-panel').querySelector('.panel-head'),
      this.$('faction-panel'),
      'wb_pos_factions'
    );
    this.makeDraggable(
      this.$('settings-modal').querySelector('.modal-box h2'),
      this.$('settings-modal').querySelector('.modal-box'),
      'wb_pos_settings'
    );

    // 势力列表点击跳转
    this.$('faction-body').addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const cx = parseFloat(tr.dataset.cx), cy = parseFloat(tr.dataset.cy);
      if (isFinite(cx)) { Game.cam.x = cx; Game.cam.y = cy; }
    });

    // 设置控件
    this.$('set-worldsize').onchange = (e) => {
      this.game.settings.worldSize = parseInt(e.target.value);
      this.game.saveSettings();
    };
    this.$('set-maxunits').oninput = (e) => {
      const v = parseInt(e.target.value);
      this.game.maxUnits = v;
      this.game.settings.maxUnits = v;
      this.$('lbl-maxunits').textContent = '(' + v + ')';
      this.game.saveSettings();
    };
    this.$('set-zones').onchange = (e) => {
      this.game.settings.showZones = e.target.checked;
      if (this.game.world) this.game.world.overlayDirty = true;
      this.game.saveSettings();
    };
    this.$('set-vnames').onchange = (e) => {
      this.game.settings.showVillageNames = e.target.checked;
      this.game.saveSettings();
    };
    this.$('set-particles').onchange = (e) => {
      this.game.settings.showParticles = e.target.checked;
      this.game.saveSettings();
    };
    this.$('set-autopause').onchange = (e) => {
      this.game.settings.autoPauseEvents = e.target.checked;
      this.game.saveSettings();
    };
  }

  refreshEventLog() {
    const list = this.$('event-list');
    if (!list) return;
    const events = this.game.events.slice(0, 30);
    list.innerHTML = events.map(e => {
      const y = e.year + 1;
      // Kingdom names colored
      let msg = e.msg;
      if (e.color) msg = msg.replace(/「(.+?)」/g, `<b style="color:${e.color}">「$1」</b>`);
      return `<div class="event-item">📅 ${y}年 ${msg}</div>`;
    }).join('');
  }

  refreshFactions() {
    const body = this.$('faction-body');
    if (!body) return;
    const g = this.game;
    const ks = [...g.kingdoms].filter(k => k.villages.length > 0);
    ks.sort((a, b) => {
      const ap = g.villages.filter(v => v.kingdom === a.id).reduce((s, v) => s + v.pop, 0);
      const bp = g.villages.filter(v => v.kingdom === b.id).reduce((s, v) => s + v.pop, 0);
      return bp - ap;
    });
    body.innerHTML = ks.map(k => {
      const vills = g.villages.filter(v => v.kingdom === k.id);
      const pop = vills.reduce((s, v) => s + v.pop, 0);
      const race = RACES[k.race];
      const war = k.wars.size > 0;
      const allied = k.allies.size > 0;
      let stateIcon = '☮️';
      if (war && allied) stateIcon = '⚔️🤝';
      else if (war) stateIcon = '⚔️';
      else if (allied) stateIcon = '🤝';
      const jumpV = vills[0];
      return `<tr class="${war ? 'war-row' : ''}" data-cx="${jumpV ? jumpV.cx : ''}" data-cy="${jumpV ? jumpV.cy : ''}">
        <td style="color:${k.color};font-weight:bold">${k.name}</td>
        <td>${race.icon} ${race.name}</td>
        <td>${pop}</td>
        <td>${k.villages.length}</td>
        <td>${stateIcon}</td>
      </tr>`;
    }).join('');
  }

  openSettings() {
    const s = this.game.settings;
    this.$('set-worldsize').value = s.worldSize || 192;
    this.$('set-maxunits').value = s.maxUnits || 900;
    this.$('lbl-maxunits').textContent = '(' + (s.maxUnits || 900) + ')';
    this.$('set-zones').checked = s.showZones !== false;
    this.$('set-vnames').checked = s.showVillageNames !== false;
    this.$('set-particles').checked = s.showParticles !== false;
    this.$('set-autopause').checked = !!s.autoPauseEvents;
    // 定位弹窗: 有记忆位置则恢复, 否则居中
    const box = this.$('settings-modal').querySelector('.modal-box');
    const saved = localStorage.getItem('wb_pos_settings');
    if (saved) try {
      const pos = JSON.parse(saved);
      box.style.position = 'fixed'; box.style.left = pos.x + 'px'; box.style.top = pos.y + 'px'; box.style.margin = '0';
    } catch (e) {
      box.removeAttribute('style');
    } else {
      box.removeAttribute('style');
    }
    this.$('settings-modal').classList.remove('hidden');
  }

  closeSettings() {
    this.$('settings-modal').classList.add('hidden');
  }
}
