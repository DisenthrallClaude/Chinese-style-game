// 界面 —— 建造栏、机关详情、秘术、波次预告
import {
  TOWERS, TOWER_BY_ID, ENEMIES, SKILLS, ELEMENTS, RULES, endlessWave, counteredBy,
} from '../game/config.js';
import { audio } from '../core/audio.js';
import { clamp } from '../core/noise.js';
import { LEVELS } from '../world/levels.js';

const $ = (s) => document.querySelector(s);
const EL_VAR = {
  metal: 'var(--el-metal)', wood: 'var(--el-wood)', water: 'var(--el-water)',
  fire: 'var(--el-fire)', earth: 'var(--el-earth)',
  thunder: 'var(--el-thunder)', wind: 'var(--el-wind)', poison: 'var(--el-poison)',
  gu: 'var(--el-gu)', dark: 'var(--el-dark)', space: 'var(--el-space)',
  none: 'rgba(233,220,190,.5)',
};
const elVar = (k) => EL_VAR[k] || EL_VAR.none;
// 属性名的小徽章：波次预告与详情面板到处都要用
const elChip = (k) => {
  const e = ELEMENTS[k];
  if (!e) return '';
  return `<b class="elc" style="color:${elVar(k)};border-color:${elVar(k)}">${e.name}</b>`;
};

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
    case 'gale':
      // 罡风：三道被吹开的气流线，越往前越散
      g.lineWidth = S * 0.05;
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * u * 0.52;
        path(() => {
          g.moveTo(-u, y);
          g.bezierCurveTo(-u * 0.1, y - u * 0.3, u * 0.3, y + u * 0.3, u * 0.72, y * 1.5);
        });
        // 卷尾
        path(() => { g.arc(u * 0.72, y * 1.5 + u * 0.16, u * 0.17, -1.6, 2.6); });
      }
      break;
    case 'miasma':
      // 瘴：三足鼎 + 上升的雾团
      g.lineWidth = S * 0.05;
      path(() => {
        g.moveTo(-u * 0.72, u * 0.05); g.lineTo(-u * 0.5, u * 0.68);
        g.moveTo(u * 0.72, u * 0.05); g.lineTo(u * 0.5, u * 0.68);
        g.moveTo(0, u * 0.15); g.lineTo(0, u * 0.85);
      });
      path(() => {
        g.moveTo(-u * 0.82, -u * 0.18);
        g.lineTo(u * 0.82, -u * 0.18);
        g.lineTo(u * 0.6, u * 0.1);
        g.lineTo(-u * 0.6, u * 0.1);
        g.closePath();
      });
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 0.85 - i * 0.22;
        g.beginPath();
        g.arc((i - 1) * u * 0.34, -u * (0.5 + i * 0.18), u * (0.26 - i * 0.04), 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
      break;
    case 'guwen':
      // 蛊：一只瓮，口上飞出三只虫
      g.lineWidth = S * 0.05;
      path(() => {
        g.moveTo(-u * 0.34, -u * 0.1);
        g.bezierCurveTo(-u * 0.9, u * 0.24, -u * 0.6, u * 0.92, 0, u * 0.92);
        g.bezierCurveTo(u * 0.6, u * 0.92, u * 0.9, u * 0.24, u * 0.34, -u * 0.1);
        g.closePath();
      });
      path(() => { g.moveTo(-u * 0.46, -u * 0.1); g.lineTo(u * 0.46, -u * 0.1); });
      for (let i = 0; i < 3; i++) {
        const a = -2.4 + i * 0.75;
        const cx2 = Math.cos(a) * u * 0.78, cy2 = Math.sin(a) * u * 0.78 - u * 0.2;
        g.beginPath(); g.ellipse(cx2, cy2, u * 0.13, u * 0.07, a, 0, 7); g.fill();
      }
      break;
    case 'umbra':
      // 暗：石幢的层层出檐，顶上一颗吞光的黑石
      g.lineWidth = S * 0.045;
      for (let i = 0; i < 3; i++) {
        const y = -u * 0.2 + i * u * 0.44;
        const w = u * (0.42 + i * 0.22);
        path(() => { g.moveTo(-w, y); g.lineTo(w, y); });
        path(() => {
          g.moveTo(-w * 0.62, y); g.lineTo(-w * 0.5, y + u * 0.34);
          g.moveTo(w * 0.62, y); g.lineTo(w * 0.5, y + u * 0.34);
        });
      }
      g.beginPath(); g.arc(0, -u * 0.62, u * 0.26, 0, 7); g.fill();
      g.globalAlpha = 0.45;
      g.beginPath(); g.arc(0, -u * 0.62, u * 0.48, 0, 7); g.stroke();
      g.globalAlpha = 1;
      break;
    case 'voidjar':
      // 空：一只壶，壶口塌下去一个洞，周围是被吸进去的星点
      g.lineWidth = S * 0.05;
      path(() => {
        g.moveTo(-u * 0.30, -u * 0.34);
        g.bezierCurveTo(-u * 0.86, u * 0.02, -u * 0.62, u * 0.9, 0, u * 0.9);
        g.bezierCurveTo(u * 0.62, u * 0.9, u * 0.86, u * 0.02, u * 0.30, -u * 0.34);
      });
      path(() => { g.moveTo(-u * 0.46, -u * 0.34); g.lineTo(u * 0.46, -u * 0.34); });
      // 洞：实心
      g.beginPath(); g.arc(0, -u * 0.62, u * 0.22, 0, 7); g.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r2 = u * (0.5 + (i % 2) * 0.24);
        g.beginPath(); g.arc(Math.cos(a) * r2, -u * 0.62 + Math.sin(a) * r2 * 0.6, u * 0.055, 0, 7); g.fill();
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
    this.game.towerList.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'bcard';
      const key = i < 9 ? String(i + 1) : (i === 9 ? '0' : '');
      el.innerHTML = `
        <span class="bc-key">${key}</span>
        <span class="bc-el" style="background:${elVar(t.el)};box-shadow:0 0 7px ${elVar(t.el)}"></span>
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
    // 第一幕 -> 舆图
    $('#btnToMap').onclick = () => { audio.init(); audio.click(); this.showMap(); };
    $('#btnBack').onclick = () => { audio.click(); this.showTitle(); };
    $('#btnEnter').onclick = () => { this.startLevel(this.pickedLevel, false); };
    $('#btnSandbox').onclick = () => { this.startLevel(0, true); };

    $('#btnRetry').onclick = () => { $('#endScreen').hidden = true; G.restart(); };
    $('#btnNext').onclick = () => {
      const n = G.nextLevelIndex;
      $('#endScreen').hidden = true;
      if (n >= 0) this.startLevel(n, false);
    };
    $('#btnMap').onclick = () => {
      $('#endScreen').hidden = true;
      this.hud.hidden = true;
      $('#startScreen').hidden = false;
      this.showMap();
    };

    $('#btnWave').onclick = () => { G.startWave(); audio.click(); };
    $('#btnSpeed').onclick = () => { G.cycleSpeed(); audio.click(); };
    $('#btnDayNight').onclick = () => { G.toggleDayNight(); audio.click(); };
    $('#btnCam').onclick = () => { G.rig.reset(); audio.click(); };
    $('#btnQuit').onclick = () => this.quitToMap();
    $('#tpClose').onclick = () => G.select(null);
    $('#btnUpgrade').onclick = () => G.upgradeSelected();
    $('#btnSell').onclick = () => G.sellSelected();
    $('#waveMax').textContent = this.game.waveCount;
    $('#lvSeal').textContent = this.game.level.seal;
    $('#lvName').textContent = this.game.level.name;

    this._loadProgress();
    this._buildLevelGrid();
  }

  /* ------------------------------------------------ 进度存档 */
  _loadProgress() {
    try {
      const raw = localStorage.getItem('shanhai.cleared');
      if (raw) this.game.cleared = JSON.parse(raw) || [];
    } catch (e) { this.game.cleared = []; }
  }
  _saveProgress() {
    try { localStorage.setItem('shanhai.cleared', JSON.stringify(this.game.cleared)); } catch (e) { /* 无痕模式，忽略 */ }
  }
  // 五关一律开放，随意挑着打。cleared 仍然记着，只用来盖「守」字印
  isUnlocked(i) { return true; }

  /* ------------------------------------------------ 舆图 */
  showTitle() { $('#actMap').hidden = true; $('#actTitle').hidden = false; }
  showMap() {
    $('#actTitle').hidden = true;
    $('#actMap').hidden = false;
    this._buildLevelGrid();
  }

  _buildLevelGrid() {
    const grid = $('#levelGrid');
    if (!grid) return;
    if (this.pickedLevel === undefined) this.pickedLevel = 0;
    const TINT = [
      'rgba(126,190,120,.26)', 'rgba(228,110,48,.28)', 'rgba(120,190,232,.26)',
      'rgba(80,206,196,.26)', 'rgba(178,150,246,.26)',
    ];
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const un = this.isUnlocked(i);
      const done = this.game.cleared.includes(i);
      const el = document.createElement('div');
      el.className = 'lcard' + (un ? '' : ' locked') + (i === this.pickedLevel ? ' active' : '');
      el.style.setProperty('--i', i);
      el.style.setProperty('--tint', TINT[i]);
      el.innerHTML =
        `${done ? '<span class="lc-done">守</span>' : ''}` +
        `<div class="lc-no">第 ${L.numCN} 关</div>` +
        `<div class="lc-seal">${L.seal}</div>` +
        `<div class="lc-name">${L.name}</div>` +
        `<div class="lc-en">${L.en}</div>` +
        (un ? `<div class="lc-brief">${L.brief}</div>`
            : `<div class="lc-lock">— 须先守住前一关 —</div>`);
      if (un) {
        el.onclick = () => {
          this.pickedLevel = i;
          audio.click();
          this._buildLevelGrid();
        };
        el.ondblclick = () => this.startLevel(i, false);
      }
      grid.appendChild(el);
    });
    const btn = $('#btnEnter');
    if (btn) btn.disabled = !this.isUnlocked(this.pickedLevel);
  }

  /* ------------------------------------------------ 开局 */
  async startLevel(index, sandbox) {
    audio.init(); audio.resume();
    const G = this.game;
    $('#startScreen').hidden = true;
    if (index !== G.levelIndex && G.loadLevel) {
      await G.loadLevel(index);
    } else {
      G.restart();
    }
    this.hud.hidden = false;
    G.begin();
    if (sandbox) {
      G.gold = 4000;
      G.dayNight.autoRun = true;
      this.toast('自由观景 · 时辰自行流转（N 键切昼夜，右键拖拽转视角）');
    } else if (index === 0) {
      this.hints([
        ['先在<b>溪畔</b>架一座「水车」——谷中机关，皆靠机力驱动', 0],
        ['再用「传动枢」把机力<b>接到兽道边</b>，机关须连上网络才会转', 5200],
        ['在兽道旁摆下「连弩机」，然后按 <b>空格</b> 催兵', 10400],
        ['右上角波次预告底下写着这一波<b>宜用</b>哪几属 —— 照着摆，伤害差近三倍', 15600],
        ['按 <b>L</b> 可随时查看机力网络；点选机关可<b>升阶</b>或拆解', 20800],
      ]);
    } else {
      const L = G.level;
      this.hints([[L.brief, 400], [L.lore, 6000]]);
    }
    this.refreshAll();
  }

  /* ------------------------------------------------ 出关 */
  // 交战中要按两下才走，免得手滑把一局点没了
  quitToMap() {
    const G = this.game;
    const btn = $('#btnQuit');
    if (G.waveActive && !this._quitArmed) {
      this._quitArmed = true;
      btn.classList.add('warn');
      btn.textContent = '确 认';
      this.toast('交战中 —— 再点一次「确认」出关', 'bad');
      clearTimeout(this._quitT);
      this._quitT = setTimeout(() => {
        this._quitArmed = false;
        btn.classList.remove('warn');
        btn.textContent = '出 关';
      }, 3000);
      return;
    }
    clearTimeout(this._quitT);
    this._quitArmed = false;
    btn.classList.remove('warn');
    btn.textContent = '出 关';
    audio.click();
    G.abandon();
    this.hud.hidden = true;
    $('#endScreen').hidden = true;
    $('#towerPanel').hidden = true;
    $('#startScreen').hidden = false;
    this.showMap();
  }

  /* ------------------------------------------------ 换关过场 */
  showLoading(L) {
    const box = $('#levelLoad');
    if (!box) return;
    $('#llSeal').textContent = L.seal;
    $('#llNo').textContent = `第 ${L.numCN} 关`;
    $('#llName').textContent = L.name;
    $('#llSub').textContent = L.subtitle;
    $('#llVerse').textContent = L.verse;
    box.hidden = false;
    // 重放入场动画
    box.querySelectorAll('.ll-seal, .ll-no, .ll-name, .ll-sub, .ll-verse').forEach(el => {
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    });
    this._loadShownAt = performance.now();
  }
  async hideLoading() {
    // 过场至少停 1.2 秒，太快闪一下反而糊
    const el = $('#levelLoad');
    if (!el) return;
    const wait = Math.max(0, 1200 - (performance.now() - (this._loadShownAt || 0)));
    await new Promise(r => setTimeout(r, wait));
    el.style.transition = 'opacity .6s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.hidden = true; el.style.opacity = ''; el.style.transition = ''; }, 620);
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
    for (const t of G.towerList) {
      const el = this.cards[t.id];
      if (!el) continue;
      el.classList.toggle('active', G.selectedTowerId === t.id);
      el.classList.toggle('poor', G.gold < t.cost);
    }
  }

  // 换关：建造栏与关卡角标重建
  rebuildForLevel() {
    for (const t of this.game.towerList) if (!this.icons[t.id]) this.icons[t.id] = towerIcon(t);
    this._buildBuildBar();
    const L = this.game.level;
    $('#waveMax').textContent = this.game.waveCount;
    $('#lvSeal').textContent = L.seal;
    $('#lvName').textContent = L.name;
    this.refreshAll();
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
      chip.innerHTML = `<i style="background:${elVar(e.el)};box-shadow:0 0 6px ${elVar(e.el)}"></i>${e.name}` +
        `<em class="nw-el" style="color:${elVar(e.el)}">${c ? c.name : ''}</em><u>×${counts[id]}</u>`;
      chip.onmouseenter = (ev) => this.showTip(this._enemyTip(e), ev);
      chip.onmousemove = (ev) => this.moveTip(ev);
      chip.onmouseleave = () => this.hideTip();
      list.appendChild(chip);
    }
    // 克制预告：把这一波每只凶兽「畏」什么攒起来，按能压住多少只排个序。
    // 属性从五个涨到十一个之后，光看一排小旗已经算不过来了。
    const score = {};
    for (const id of Object.keys(counts)) {
      const e = ENEMIES[id];
      if (!e) continue;
      for (const k of counteredBy(e.el)) score[k] = (score[k] || 0) + counts[id];
    }
    const rank = Object.keys(score).sort((a, b) => score[b] - score[a]).slice(0, 4);
    let hint = $('#nwHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'nwHint';
      hint.className = 'nw-hint';
      $('#nextWave').appendChild(hint);
    }
    hint.innerHTML = rank.length
      ? `<span>宜用</span>${rank.map(k => elChip(k)).join('')}`
      : '';
    hint.onmouseenter = (ev) => this.showTip(
      `<div class="tip-name">克制预告</div>
       <div class="tip-el">按这一波凶兽的属性排出来的</div>
       ${rank.map(k => `<div class="tip-row"><span>${elChip(k)} ${ELEMENTS[k].name}</span><b>压得住 ${score[k]} 只</b></div>`).join('')}
       <div class="tip-note">打对属性 ×1.85，打错只有 ×0.62</div>`, ev);
    hint.onmousemove = (ev) => this.moveTip(ev);
    hint.onmouseleave = () => this.hideTip();

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
    $('#tpLv').style.color = elVar(d.el);

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
      if (d.kind === 'gust') {
        row('吹退', (st.push ?? d.push).toFixed(1), next ? (next.push ?? d.push).toFixed(1) : null, ' 步');
        row('对飞行', '×' + d.airMult.toFixed(1), null);
      }
      if (d.kind === 'venom') {
        row('毒雾', st.venom ?? d.venom, next ? (next.venom ?? d.venom) : null, '/秒·层');
        row('溅射', st.splash ?? d.splash, next ? (next.splash ?? d.splash) : null);
        row('雾存', d.venomTime.toFixed(1), null, ' 秒');
      }
      if (d.kind === 'swarm') {
        row('受创加重', Math.round((st.vuln ?? d.vuln) * 100), next ? Math.round((next.vuln ?? d.vuln) * 100) : null, '%');
        row('传染半径', st.spread ?? d.spread, next ? (next.spread ?? d.spread) : null);
      }
      if (d.kind === 'shade') {
        row('蚀甲', Math.round((st.shred ?? d.shred) * 100), next ? Math.round((next.shred ?? d.shred) * 100) : null, '%');
        row('减速', Math.round((st.slow ?? d.slow) * 100), next ? Math.round((next.slow ?? d.slow) * 100) : null, '%');
      }
      if (d.kind === 'warp') {
        row('拖回', (st.pull ?? d.pull).toFixed(1), next ? (next.pull ?? d.pull).toFixed(1) : null, ' 步');
        row('无视皮甲', '是', null);
      }
      row('属性', ELEMENTS[d.el].name, null);
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
    const beats = (el.beats || []).map(k => elChip(k)).join('');
    const weak = counteredBy(t.el).map(k => elChip(k)).join('');
    return `<div class="tip-name">${t.name}</div>
      <div class="tip-el" style="color:${elVar(t.el)}">${el.name === '·' ? '无属性' : (el.ring === 'liuqi' ? '六气 · ' : '五行 · ') + el.name}</div>
      ${beats ? `<div class="tip-cnt">克 ${beats}<s>×1.85</s></div>` : ''}
      ${weak ? `<div class="tip-cnt bad">被 ${weak} 所克<s>×0.62</s></div>` : ''}
      ${el.note ? `<div class="tip-note">${el.note}</div>` : ''}
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
    const weak = counteredBy(e.el).map(k => elChip(k)).join('');
    const strong = (el.beats || []).map(k => elChip(k)).join('');
    return `<div class="tip-name">${e.name}${e.boss ? ' · 凶' : ''}</div>
      <div class="tip-el" style="color:${elVar(e.el)}">${el.ring === 'liuqi' ? '六气' : '五行'} · ${el.name}</div>
      <div class="tip-cnt">畏 ${weak || '—'}<s>用这些打，×1.85</s></div>
      ${strong ? `<div class="tip-cnt bad">克 ${strong}<s>这些打它只有 ×0.62</s></div>` : ''}
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
    const L = G.level;
    const next = G.nextLevelIndex;
    const isLast = next < 0;
    if (won) this._saveProgress();

    $('#endScreen').hidden = false;
    $('#endSeal').textContent = won ? '守' : '陷';
    $('#endTitle').textContent = won
      ? (isLast ? '山海既定' : `${L.name} · 得全`)
      : `${L.name} · 失守`;

    const winText = {
      qiwu: '烛龙敛目，众兽退散。谷中机关虽已伤痕累累，社树仍亭亭如盖。<br>然西望大荒，赤光烛天——那是<b>炎火之山</b>。',
      yanhuo: '火熄沙定，朱厌伏诛。熔炉犹自轰鸣，谷民却已收拾行装。<br>北方黑水之滨，有山终年不化——那是<b>幽都寒渊</b>。',
      youdu: '冰原重归死寂，強良沉入裂隙。机关的齿轮上结满了霜。<br>东望大海，众水所归而不盈——那是<b>归墟海眼</b>。',
      guixu: '潮退浪平，禺彊没入大壑。栈桥断了几处，社树却还立着。<br>抬头，云海之上有玉台悬空——那是<b>昆仑天阙</b>。',
      kunlun: '九首俱寂，开明兽退守其位。五方山海，自此复归其序。<br>《山海经》末页添了一行小字：「有械曰机关，守山海者也。」',
    }[L.id];
    const loseText = `社树倾折，机括俱毁。凶兽自山口涌下，${L.name}终成传说。<br>` +
      `《山海经》又添一笔：「有地曰${L.name}，今亡。」`;
    $('#endText').innerHTML = won ? winText : loseText;

    $('#endStats').innerHTML = `
      <div class="estat"><b>${G.waveIndex}</b><span>抵御波次</span></div>
      <div class="estat"><b>${G.stats.kills}</b><span>斩兽</span></div>
      <div class="estat"><b>${G.stats.built}</b><span>造机关</span></div>
      <div class="estat"><b>${G.heart}</b><span>社树余命</span></div>`;

    const bn = $('#btnNext');
    bn.hidden = !(won && !isLast);
    if (!bn.hidden) bn.textContent = `入 · ${LEVELS[next].name}`;
    $('#btnRetry').textContent = won ? '再 · 守 一 次' : '重 整 旗 鼓';
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
