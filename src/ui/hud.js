// 界面 —— 建造栏、机关详情、秘术、波次预告
import { TOWERS, TOWER_BY_ID, ENEMIES, SKILLS, ELEMENTS, WAVES, RULES, endlessWave } from '../game/config.js';
import { audio } from '../core/audio.js';
import { clamp } from '../core/noise.js';

const $ = (s) => document.querySelector(s);
const EL_VAR = { metal: 'var(--el-metal)', wood: 'var(--el-wood)', water: 'var(--el-water)', fire: 'var(--el-fire)', earth: 'var(--el-earth)', none: 'rgba(233,220,190,.5)' };

/* 用 canvas 画机关小图标：一枚铜牌上的写意剪影 */
function towerIcon(def, size = 40) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  const S = size * 2;
  g.clearRect(0, 0, S, S);
  const el = ELEMENTS[def.el] || ELEMENTS.none;
  const col = '#' + (el.color).toString(16).padStart(6, '0');
  // 底盘
  const grd = g.createRadialGradient(S * 0.42, S * 0.34, 2, S / 2, S / 2, S * 0.56);
  grd.addColorStop(0, 'rgba(90,70,40,.9)');
  grd.addColorStop(1, 'rgba(24,18,12,.95)');
  g.fillStyle = grd;
  g.beginPath();
  const r = S * 0.42, cx = S / 2, cy = S / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(216,172,82,.55)'; g.lineWidth = S * 0.02; g.stroke();

  g.save();
  g.translate(cx, cy);
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = S * 0.055; g.lineCap = 'round'; g.lineJoin = 'round';
  const u = S * 0.30;
  const path = (fn) => { g.beginPath(); fn(); g.stroke(); };
  switch (def.id) {
    case 'crossbow':
      path(() => { g.moveTo(-u, -u * 0.3); g.quadraticCurveTo(0, -u * 0.95, u, -u * 0.3); });
      path(() => { g.moveTo(-u, -u * 0.3); g.lineTo(u, -u * 0.3); });
      path(() => { g.moveTo(0, -u * 0.5); g.lineTo(0, u * 0.85); });
      break;
    case 'catapult':
      path(() => { g.moveTo(-u * 0.9, u * 0.75); g.lineTo(u * 0.8, -u * 0.8); });
      path(() => { g.moveTo(-u * 0.9, u * 0.75); g.lineTo(u * 0.6, u * 0.75); });
      path(() => { g.moveTo(-u * 0.15, u * 0.1); g.lineTo(-u * 0.15, u * 0.75); });
      g.beginPath(); g.arc(u * 0.8, -u * 0.8, u * 0.24, 0, 7); g.fill();
      break;
    case 'flame':
      path(() => { g.moveTo(-u * 0.9, u * 0.5); g.lineTo(u * 0.2, -u * 0.1); });
      g.beginPath();
      g.moveTo(u * 0.2, -u * 0.1);
      g.quadraticCurveTo(u * 1.1, -u * 0.75, u * 0.95, u * 0.15);
      g.quadraticCurveTo(u * 0.85, u * 0.6, u * 0.25, u * 0.35);
      g.closePath(); g.fill();
      break;
    case 'frost':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        path(() => { g.moveTo(0, 0); g.lineTo(Math.cos(a) * u, Math.sin(a) * u); });
        path(() => {
          g.moveTo(Math.cos(a) * u * 0.6, Math.sin(a) * u * 0.6);
          g.lineTo(Math.cos(a + 0.5) * u * 0.85, Math.sin(a + 0.5) * u * 0.85);
        });
      }
      break;
    case 'blade':
      g.lineWidth = S * 0.045;
      path(() => { g.arc(0, 0, u * 0.7, 0, Math.PI * 2); });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        path(() => {
          g.moveTo(Math.cos(a) * u * 0.7, Math.sin(a) * u * 0.7);
          g.lineTo(Math.cos(a + 0.35) * u, Math.sin(a + 0.35) * u);
        });
      }
      break;
    case 'thunder':
      g.beginPath();
      g.moveTo(u * 0.15, -u); g.lineTo(-u * 0.5, u * 0.1); g.lineTo(-u * 0.02, u * 0.1);
      g.lineTo(-u * 0.35, u); g.lineTo(u * 0.55, -u * 0.2); g.lineTo(u * 0.05, -u * 0.2);
      g.closePath(); g.fill();
      break;
    case 'wheel':
      g.lineWidth = S * 0.045;
      path(() => { g.arc(0, 0, u * 0.85, 0, Math.PI * 2); });
      path(() => { g.arc(0, 0, u * 0.28, 0, Math.PI * 2); });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        path(() => { g.moveTo(Math.cos(a) * u * 0.28, Math.sin(a) * u * 0.28); g.lineTo(Math.cos(a) * u * 0.85, Math.sin(a) * u * 0.85); });
      }
      break;
    case 'windmill':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * u, Math.sin(a) * u);
        g.lineTo(Math.cos(a + 0.45) * u * 0.72, Math.sin(a + 0.45) * u * 0.72);
        g.closePath(); g.fill();
      }
      break;
    default:
      g.lineWidth = S * 0.05;
      path(() => { g.arc(-u * 0.4, 0, u * 0.45, 0, Math.PI * 2); });
      path(() => { g.arc(u * 0.45, u * 0.1, u * 0.34, 0, Math.PI * 2); });
      path(() => { g.moveTo(-u * 0.4, -u * 0.75); g.lineTo(-u * 0.4, u * 0.75); });
      break;
  }
  g.restore();
  return c.toDataURL();
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.hud = $('#hud');
    this.toastBox = $('#toast');
    this.buildBar = $('#buildBar');
    this.skillBar = $('#skillBar');
    this.tip = $('#tip');
    this.tp = $('#towerPanel');

    // 飘字层
    this.floatLayer = document.createElement('div');
    this.floatLayer.id = 'floatLayer';
    document.body.appendChild(this.floatLayer);

    this.icons = {};
    for (const t of TOWERS) this.icons[t.id] = towerIcon(t);

    this._buildBuildBar();
    this._buildSkillBar();
    this._bind();
    this._fpsT = 0;
  }

  /* ---------------------------------------------------- 构建 DOM */
  _buildBuildBar() {
    this.buildBar.innerHTML = '';
    this.cards = {};
    TOWERS.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'bcard';
      el.innerHTML = `
        <span class="bc-key">${i + 1}</span>
        <span class="bc-el" style="background:${EL_VAR[t.el]};box-shadow:0 0 7px ${EL_VAR[t.el]}"></span>
        <img class="bc-icon" src="${this.icons[t.id]}" alt="">
        <div class="bc-name">${t.name}</div>
        <div class="bc-cost">${t.cost}</div>
        <div class="bc-pw">${t.power < 0 ? '产 ' + (-t.power) : '耗 ' + t.power}</div>`;
      el.onclick = () => { this.game.selectTowerType(t.id); audio.click(); };
      el.onmouseenter = (e) => this.showTip(this._towerTip(t), e);
      el.onmousemove = (e) => this.moveTip(e);
      el.onmouseleave = () => this.hideTip();
      this.buildBar.appendChild(el);
      this.cards[t.id] = el;
    });
  }

  _buildSkillBar() {
    this.skillBar.innerHTML = '';
    this.skillBtns = {};
    for (const s of SKILLS) {
      const b = document.createElement('button');
      b.className = 'skbtn';
      b.innerHTML = `<span>${s.glyph}</span><span class="sk-cd"></span><span class="sk-key">${s.key}</span>`;
      b.onclick = () => this.game.armSkill(s.id);
      b.onmouseenter = (e) => this.showTip(
        `<div class="tip-name">${s.name}</div>
         <div class="tip-el" style="color:var(--gold)">秘术 · 冷却 ${s.cd} 秒</div>
         <div class="tip-desc">${s.desc}</div>`, e);
      b.onmousemove = (e) => this.moveTip(e);
      b.onmouseleave = () => this.hideTip();
      this.skillBar.appendChild(b);
      this.skillBtns[s.id] = b;
    }
  }

  _bind() {
    const G = this.game;
    $('#btnStart').onclick = () => { this.startGame(false); };
    $('#btnSandbox').onclick = () => { this.startGame(true); };
    $('#btnRetry').onclick = () => { $('#endScreen').hidden = true; G.restart(); };
    $('#btnWave').onclick = () => { G.startWave(); audio.click(); };
    $('#btnSpeed').onclick = () => { G.cycleSpeed(); audio.click(); };
    $('#btnDayNight').onclick = () => { G.toggleDayNight(); audio.click(); };
    $('#btnCam').onclick = () => { G.rig.reset(); audio.click(); };
    $('#tpClose').onclick = () => G.select(null);
    $('#btnUpgrade').onclick = () => G.upgradeSelected();
    $('#btnSell').onclick = () => G.sellSelected();
    $('#waveMax').textContent = WAVES.length;
  }

  startGame(sandbox) {
    audio.init(); audio.resume();
    $('#startScreen').hidden = true;
    this.hud.hidden = false;
    this.game.begin();
    if (sandbox) {
      this.game.gold = 4000;
      this.game.dayNight.autoRun = true;
      this.toast('自由观景 · 时辰自行流转（N 键切昼夜，右键拖拽转视角）');
    } else {
      this.hints([
        ['先在<b>溪畔</b>架一座「水车」——谷中机关，皆靠机力驱动', 0],
        ['再用「传动枢」把机力<b>接到兽道边</b>，机关须连上网络才会转', 5200],
        ['在兽道旁摆下「连弩机」，然后按 <b>空格</b> 催兵', 10400],
        ['按 <b>L</b> 可随时查看机力网络；点选机关可<b>升阶</b>或拆解', 15600],
      ]);
    }
    this.refreshAll();
  }

  /* ---------------------------------------------------- 刷新 */
  refreshAll() {
    this.refreshBuildBar();
    this.refreshSelection();
    this.refreshSkills();
    this.refreshWave();
    this.refreshSpeed();
    $('#endScreen').hidden = true;
  }

  refreshBuildBar() {
    const G = this.game;
    for (const t of TOWERS) {
      const el = this.cards[t.id];
      el.classList.toggle('active', G.selectedTowerId === t.id);
      el.classList.toggle('poor', G.gold < t.cost);
    }
  }

  refreshSpeed() {
    $('#btnSpeed').textContent = '×' + this.game.speed;
    $('#btnSpeed').classList.toggle('on', this.game.speed > 1);
  }

  refreshWave() {
    const G = this.game;
    $('#waveNum').textContent = G.waveIndex + (G.waveActive ? 1 : 1);
    const def = G.waveDef;
    $('#nwName').textContent = def.name;
    const counts = {};
    for (const g of def.groups) counts[g.id] = (counts[g.id] || 0) + g.count;
    const list = $('#nwList');
    list.innerHTML = '';
    for (const id of Object.keys(counts)) {
      const e = ENEMIES[id];
      if (!e) continue;
      const chip = document.createElement('span');
      chip.className = 'nw-chip';
      const c = ELEMENTS[e.el];
      chip.innerHTML = `<i style="background:${EL_VAR[e.el]};box-shadow:0 0 6px ${EL_VAR[e.el]}"></i>${e.name}<u>×${counts[id]}</u>`;
      chip.onmouseenter = (ev) => this.showTip(this._enemyTip(e), ev);
      chip.onmousemove = (ev) => this.moveTip(ev);
      chip.onmouseleave = () => this.hideTip();
      list.appendChild(chip);
    }
    $('#btnWave').classList.toggle('pending', !G.waveActive);
    $('#btnWave').textContent = G.waveActive ? '交 战 中' : '催 兵';
  }

  refreshSkills() {
    const G = this.game;
    for (const s of SKILLS) {
      const b = this.skillBtns[s.id];
      const cd = G.skillCd[s.id];
      const p = cd > 0 ? (cd / s.cd) * 100 : 0;
      b.querySelector('.sk-cd').style.setProperty('--p', p.toFixed(1) + '%');
      b.classList.toggle('ready', cd <= 0);
      b.classList.toggle('armed', G.armedSkill === s.id);
      b.disabled = cd > 0;
    }
  }

  refreshSelection() {
    const G = this.game, t = G.selected;
    if (!t) { this.tp.hidden = true; return; }
    this.tp.hidden = false;
    const d = t.def;
    $('#tpIcon').innerHTML = `<img src="${this.icons[d.id]}" style="width:100%;height:100%">`;
    $('#tpName').textContent = d.name;
    $('#tpLv').textContent = d.upName[t.level];
    $('#tpLv').style.color = EL_VAR[d.el];

    const st = t.stats;
    const next = t.level < d.up.length - 1 ? d.up[t.level + 1] : null;
    const rows = [];
    const row = (label, val, nextVal, unit = '') => {
      const up = nextVal !== undefined && nextVal !== null && nextVal !== val;
      rows.push(`<div class="tp-stat"><span>${label}</span><i></i><b class="${up ? 'up' : ''}">${val}${unit}${up ? ' → ' + nextVal + unit : ''}</b></div>`);
    };
    if (d.kind !== 'gen' && d.kind !== 'relay') {
      row('伤害', st.dmg ?? d.dmg, next ? (next.dmg ?? d.dmg) : null);
      row('射速', (st.rate ?? d.rate).toFixed(2), next ? (next.rate ?? d.rate).toFixed(2) : null, '/秒');
      row('射程', st.range ?? d.range, next ? (next.range ?? d.range) : null);
      if (d.kind === 'splash') row('溅射', st.splash ?? d.splash, next ? (next.splash ?? d.splash) : null);
      if (d.kind === 'chain') row('连锁', st.chain ?? d.chain, next ? (next.chain ?? d.chain) : null, ' 目标');
      if (d.kind === 'field') row('减速', Math.round((st.slow ?? d.slow) * 100), next ? Math.round((next.slow ?? d.slow) * 100) : null, '%');
      if (d.kind === 'cone') row('灼烧', st.burn ?? d.burn, next ? (next.burn ?? d.burn) : null, '/秒');
      row('五行', ELEMENTS[d.el].name, null);
      row('机力', st.power ?? d.power, next ? (next.power ?? d.power) : null);
      row('累计伤害', Math.round(t.damageDone), null);
    } else {
      if (d.kind === 'gen') row('产出机力', -(st.power ?? d.power), next ? -(next.power ?? d.power) : null);
      row('连接半径', st.link ?? d.link, next ? (next.link ?? d.link) : null);
    }
    rows.push(`<div class="tp-stat"><span>状态</span><i></i><b class="${t.powered ? 'up' : ''}" style="${t.powered ? '' : 'color:#ff9a86'}">${t.disabled > 0 ? '卡死' : (t.powered ? '运转' : '断网停机')}</b></div>`);
    rows.push(`<div class="tp-desc">${d.desc}</div>`);
    $('#tpStats').innerHTML = rows.join('');

    const cost = t.upgradeCost();
    const btnUp = $('#btnUpgrade');
    if (cost === null) { btnUp.disabled = true; $('#upCost').textContent = '极阶'; }
    else { btnUp.disabled = G.gold < cost; $('#upCost').textContent = cost; }
    $('#sellVal').textContent = Math.round(t.value * RULES.sellRatio);
  }

  /* ---------------------------------------------------- 提示 */
  _towerTip(t) {
    const el = ELEMENTS[t.el];
    const beat = el.beats ? ELEMENTS[el.beats].name : null;
    return `<div class="tip-name">${t.name}</div>
      <div class="tip-el" style="color:${EL_VAR[t.el]}">${el.name === '·' ? '无属性' : '五行 · ' + el.name}${beat ? '（克 ' + beat + '）' : ''}</div>
      ${t.kind !== 'gen' && t.kind !== 'relay' ? `
      <div class="tip-row"><span>伤害</span><b>${t.dmg}</b></div>
      <div class="tip-row"><span>射速</span><b>${t.rate}/秒</b></div>
      <div class="tip-row"><span>射程</span><b>${t.range}</b></div>` : ''}
      <div class="tip-row"><span>造价</span><b>${t.cost} 灵石</b></div>
      <div class="tip-row"><span>机力</span><b>${t.power < 0 ? '产出 ' + (-t.power) : '消耗 ' + t.power}</b></div>
      ${t.link ? `<div class="tip-row"><span>连接半径</span><b>${t.link}</b></div>` : ''}
      <div class="tip-desc">${t.desc}</div>
      ${t.needs === 'water' ? '<div class="tip-warn">※ 只能建在溪畔的格位上</div>' : ''}`;
  }

  _enemyTip(e) {
    const el = ELEMENTS[e.el];
    const weak = Object.values(ELEMENTS).filter(x => x.beats === e.el).map(x => x.name).join('、');
    return `<div class="tip-name">${e.name}${e.boss ? ' · 凶' : ''}</div>
      <div class="tip-el" style="color:${EL_VAR[e.el]}">五行 · ${el.name}　畏 ${weak || '—'}</div>
      <div class="tip-row"><span>气血</span><b>${e.hp}</b></div>
      <div class="tip-row"><span>脚力</span><b>${e.speed}</b></div>
      <div class="tip-row"><span>皮甲</span><b>${e.armor}</b></div>
      <div class="tip-row"><span>形态</span><b>${e.kind === 'air' ? '飞行（不循兽道）' : '地行'}</b></div>
      <div class="tip-desc">${e.desc}</div>`;
  }

  showTip(html, ev) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    this.moveTip(ev);
  }
  moveTip(ev) {
    if (this.tip.hidden) return;
    const r = this.tip.getBoundingClientRect();
    let x = ev.clientX + 16, y = ev.clientY - r.height - 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 16;
    if (y < 8) y = ev.clientY + 20;
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
  }
  hideTip() { this.tip.hidden = true; }

  hints(list) {
    for (const [text, delay] of list) {
      setTimeout(() => { if (!this.hud.hidden) this.toast(text, 'good'); }, delay);
    }
  }

  toast(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast-item ' + cls;
    el.innerHTML = text;
    this.toastBox.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, 3200);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild.remove();
  }

  announceWave(n, name) {
    const b = $('#waveBanner');
    b.querySelector('.wb-num').textContent = `第 ${n} 波`;
    b.querySelector('.wb-name').textContent = name;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  showEnd(won) {
    const G = this.game;
    $('#endScreen').hidden = false;
    $('#endSeal').textContent = won ? '守' : '陷';
    $('#endTitle').textContent = won ? '山谷得全' : '山谷失守';
    $('#endText').innerHTML = won
      ? '烛龙敛目，众兽退散。谷中机关虽已伤痕累累，社树仍亭亭如盖。<br>此后年年今日，谷民皆以此夜为节。'
      : '社树倾折，机括俱毁。凶兽自山口涌下，栖梧谷终成传说。<br>《山海经》又添一笔：「有谷曰栖梧，今亡。」';
    $('#endStats').innerHTML = `
      <div class="estat"><b>${G.waveIndex}</b><span>抵御波次</span></div>
      <div class="estat"><b>${G.stats.kills}</b><span>斩兽</span></div>
      <div class="estat"><b>${G.stats.built}</b><span>造机关</span></div>
      <div class="estat"><b>${G.heart}</b><span>社树余命</span></div>`;
  }

  /* ---------------------------------------------------- 每帧 */
  update(dt) {
    const G = this.game;
    if (this.hud.hidden) return;
    // 血与机力
    const hp = clamp(G.heart / G.maxHeart, 0, 1);
    const bh = $('#barHeart');
    bh.style.width = (hp * 100) + '%';
    bh.parentElement.classList.toggle('low', hp < 0.34);
    $('#txtHeart').textContent = G.heart;

    const sup = G.towers.supply, dem = G.towers.demand;
    const ratio = dem <= 0 ? 1 : clamp(sup / dem, 0, 1);
    const bp = $('#barPower');
    bp.style.width = (ratio * 100) + '%';
    bp.parentElement.classList.toggle('low', ratio < 0.999 && dem > 0);
    $('#txtPower').textContent = `${sup}/${dem}`;

    $('#txtGold').textContent = G.gold;
    $('#txtTime').textContent = G.dayNight.phaseName + (G.surge > 0 ? ' · 归元' : '');
    $('#btnDayNight').textContent = G.dayNight.isNight ? '☾' : '☀';

    this._fpsT += dt;
    if (this._fpsT > 0.5) {
      this._fpsT = 0;
      $('#txtFps').textContent = Math.round(G.engine.fps) + ' FPS';
    }

    // 冷却环
    for (const s of SKILLS) {
      const cd = G.skillCd[s.id];
      const b = this.skillBtns[s.id];
      const p = cd > 0 ? (cd / s.cd) * 100 : 0;
      b.querySelector('.sk-cd').style.setProperty('--p', p.toFixed(1) + '%');
      if (cd <= 0 && b.disabled) { b.disabled = false; b.classList.add('ready'); }
      if (cd > 0 && !b.disabled) { b.disabled = true; b.classList.remove('ready'); }
    }

    if (G.selected) {
      const cost = G.selected.upgradeCost();
      const btnUp = $('#btnUpgrade');
      if (cost !== null) btnUp.disabled = G.gold < cost;
    }
    this.hud.classList.toggle('building', !!G.selectedTowerId);

    if (this._lastWave !== G.waveIndex || this._lastActive !== G.waveActive) {
      this._lastWave = G.waveIndex;
      this._lastActive = G.waveActive;
      this.refreshWave();
    }
    if (this._lastGoldTier !== (G.gold / 25 | 0)) {
      this._lastGoldTier = (G.gold / 25 | 0);
      this.refreshBuildBar();
    }
  }
}
