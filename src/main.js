// 山海机关录 —— 入口与关卡生命周期
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { CameraRig } from './core/controls.js';
import { buildTexture, buildTextureNames, ensureLevelTextures } from './core/textures.js';
import { Sky } from './world/sky.js';
import { DayNight } from './world/daynight.js';
import { EnvProbe } from './world/env.js';
import { Terrain } from './world/terrain.js';
import { River } from './world/water.js';
import { buildVillage } from './world/village.js';
import { Vegetation } from './world/vegetation.js';
import { Atmosphere } from './world/atmosphere.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';
import { LEVELS } from './world/levels.js';
import { applyLevel } from './world/layout.js';

const $ = (s) => document.querySelector(s);

const LOAD_STEPS = [
  '正在开山凿石…', '正在引溪筑渠…', '正在架梁立柱…',
  '正在铸齿造轮…', '正在栽松植竹…', '正在张灯结彩…', '正在推演天时…',
];


/* ================================================================
   载入页的机关齿轮组
   ----------------------------------------------------------------
   齿形、节圆、啮合位置、转速比全部算出来：
   两轮啮合时中心距 = 两节圆半径之和，角速度之比 = 齿数之比的倒数，
   方向相反。这样看上去才是真的在带动，而不是几张图各转各的。
   ================================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(SVGNS, n);
  for (const k of Object.keys(a)) e.setAttribute(k, a[k]);
  return e;
};

// 一枚齿轮的轮廓：齿顶圆 R、齿根圆 rRoot、齿数 n
function gearOutline(R, rRoot, n) {
  const step = (Math.PI * 2) / n;
  const P = [];
  const at = (r, a) => P.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  for (let i = 0; i < n; i++) {
    const a = i * step;
    at(rRoot, a);                    // 齿根起
    at(R, a + step * 0.15);          // 齿顶前缘
    at(R, a + step * 0.35);          // 齿顶后缘
    at(rRoot, a + step * 0.50);      // 落回齿根
    at(rRoot, a + step * 0.78);      // 齿根弧中点，弧线不至于切成直边
  }
  return 'M' + P.join('L') + 'Z';
}

function buildGear(parent, o) {
  const { cx, cy, teeth, R, spokes = 5, dur, ccw, sub } = o;
  const rRoot = R * 0.80;
  const holder = el('g', { transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)})` });
  if (sub) holder.setAttribute('class', 'gear-sub');
  const spin = el('g', { class: 'gear-spin' + (ccw ? ' ccw' : '') });
  spin.style.setProperty('--dur', dur.toFixed(2) + 's');

  const d = gearOutline(R, rRoot, teeth);
  spin.appendChild(el('path', { class: 'gear-depth', d }));   // 轮齿的厚度
  spin.appendChild(el('path', { class: 'gear-face', d }));    // 金属面
  spin.appendChild(el('path', { class: 'gear-body', d }));    // 亮边
  spin.appendChild(el('circle', { class: 'gear-rim', r: (R * 0.985).toFixed(2) }));
  spin.appendChild(el('circle', { class: 'gear-hub', r: (R * 0.30).toFixed(2) }));
  spin.appendChild(el('circle', { class: 'gear-hub', r: (R * 0.58).toFixed(2) }));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    spin.appendChild(el('line', {
      class: 'gear-spoke',
      x1: (Math.cos(a) * R * 0.31).toFixed(2), y1: (Math.sin(a) * R * 0.31).toFixed(2),
      x2: (Math.cos(a) * R * 0.57).toFixed(2), y2: (Math.sin(a) * R * 0.57).toFixed(2),
    }));
  }
  for (let i = 0; i < spokes; i++) {
    const a2 = ((i + 0.5) / spokes) * Math.PI * 2;
    spin.appendChild(el('circle', {
      class: 'gear-hub', r: (R * 0.045).toFixed(2),
      cx: (Math.cos(a2) * R * 0.44).toFixed(2), cy: (Math.sin(a2) * R * 0.44).toFixed(2),
    }));
  }
  spin.appendChild(el('circle', { class: 'gear-pin', r: (R * 0.07).toFixed(2) }));
  holder.appendChild(spin);
  parent.appendChild(holder);
}

function buildGearRig() {
  const svg = document.getElementById('gearSvg');
  if (!svg) return null;
  svg.innerHTML = '';

  // 进度环的渐变
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'progGrad', x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.appendChild(el('stop', { offset: '0', 'stop-color': '#8c6f36' }));
  grad.appendChild(el('stop', { offset: '0.55', 'stop-color': '#f5d68d' }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': '#fff6de' }));
  defs.appendChild(grad);
  const gg = el('linearGradient', { id: 'gearGrad', x1: '0.15', y1: '0', x2: '0.85', y2: '1' });
  gg.appendChild(el('stop', { offset: '0', 'stop-color': '#6a4f22' }));
  gg.appendChild(el('stop', { offset: '0.45', 'stop-color': '#c69a48' }));
  gg.appendChild(el('stop', { offset: '0.72', 'stop-color': '#5c451f' }));
  gg.appendChild(el('stop', { offset: '1', 'stop-color': '#8d6c30' }));
  defs.appendChild(gg);
  svg.appendChild(defs);

  // 度盘刻度
  const ticks = el('g');
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = major ? 100 : 104, r1 = 109;
    ticks.appendChild(el('line', {
      class: 'tick' + (major ? ' tick-major' : ''),
      x1: (Math.cos(a) * r0).toFixed(2), y1: (Math.sin(a) * r0).toFixed(2),
      x2: (Math.cos(a) * r1).toFixed(2), y2: (Math.sin(a) * r1).toFixed(2),
    }));
  }
  svg.appendChild(ticks);

  // 进度环
  const PR = 114;
  const circ = 2 * Math.PI * PR;
  svg.appendChild(el('circle', { class: 'prog-track', r: PR }));
  const arc = el('circle', {
    class: 'prog-arc', r: PR,
    'stroke-dasharray': circ.toFixed(2),
    'stroke-dashoffset': circ.toFixed(2),
  });
  svg.appendChild(arc);

  // 轮系：节圆半径取齿顶圆的 0.90，中心距 = 两节圆之和
  const pitch = (R) => R * 0.90;
  const G = [
    { teeth: 26, R: 52, spokes: 6, ccw: false },                 // 主轮
    { teeth: 15, R: 30, spokes: 5, ccw: true, from: 0, ang: -0.62 },
    { teeth: 11, R: 22, spokes: 4, ccw: true, from: 0, ang: 2.35 },
    { teeth: 9, R: 18, spokes: 4, ccw: false, from: 2, ang: 3.62, sub: true },
  ];
  // 主轮 26 齿转一圈 14 秒，其余按齿数反比推
  const BASE_T = 14.0, BASE_N = 26;
  G[0].cx = 0; G[0].cy = 0;
  for (const g of G) {
    if (g.from !== undefined) {
      const p = G[g.from];
      const d = pitch(p.R) + pitch(g.R);
      g.cx = p.cx + Math.cos(g.ang) * d;
      g.cy = p.cy + Math.sin(g.ang) * d;
    }
    g.dur = BASE_T * (g.teeth / BASE_N);
    buildGear(svg, g);
  }

  return {
    set(p) {
      arc.setAttribute('stroke-dashoffset', (circ * (1 - Math.max(0, Math.min(1, p)))).toFixed(2));
    },
  };
}

class Boot {
  constructor() {
    this.rig = buildGearRig();
    this.hint = null;
    this.p = 0;
  }
  set(p, msg) {
    this.p = p;
    if (this.rig) this.rig.set(p);
    if (msg && this.hint) this.hint.textContent = msg;
  }
  // 开场要让进度条一格格走，所以等真正的一帧；
  // 换关时盖着的是静态过场，等帧毫无意义 —— 慢机器上每帧好几百毫秒，
  // 八个步骤就白白多花好几秒。那时只做一次微让步，把主线程还给 UI。
  async step(p, msg, fn) {
    this.set(p, msg);
    if (this.fast) await new Promise(r => setTimeout(r, 0));
    else await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return fn ? fn() : null;
  }
}

/* ================================================================
   一关的世界：地形、水、聚落、草木、气象
   换关时整个丢掉重建，engine / sky / rig / hud 一直活着。
   ================================================================ */
class World {
  constructor(engine, dayNight) {
    this.engine = engine;
    this.dayNight = dayNight;
  }

  async build(levelIndex, boot) {
    const scene = this.engine.scene;
    const L = applyLevel(levelIndex);
    this.level = L;

    // 这一关专用的贴图先补齐（第一次进这关才会真的烘）
    await boot.step(0.42, '正在调朱和墨…', () => ensureLevelTextures(L.id));

    // 天时：先把这一关的气候色偏挂上，后面所有取色都按它来
    this.dayNight.climate = L.climate;
    this.dayNight.apply(this.dayNight.hour, true);

    const P = (a, b) => a + (b - a);
    this.terrain = await boot.step(0.46, '正在开山凿石…', () => new Terrain(scene));
    // 先登记台基，再造地形网格，最后落成建筑
    this.village = await boot.step(0.56, '正在架梁立柱…', () => buildVillage(scene, this.terrain));
    await boot.step(0.66, '正在开山凿石…', () => this.terrain.build());
    await boot.step(0.72, '正在架梁立柱…', () => this.village.place());
    this.river = await boot.step(0.78, '正在引溪筑渠…', () => new River(scene, this.terrain));
    this.veg = await boot.step(0.86, '正在栽松植竹…', () => new Vegetation(scene, this.terrain));
    this.atmo = await boot.step(0.92, '正在张灯结彩…', () => new Atmosphere(scene));
    for (const [sx, sy, sz] of this.village.smokeSpots) this.atmo.addSmoke(sx, sy, sz);
    return this;
  }

  update(dt, t) {
    this.river.update(t, this.engine.camera, this.dayNight);
    this.village.update(dt, t, this.dayNight);
    this.veg.update(dt, t);
    this.atmo.update(dt, t, this.dayNight, this.engine.camera);
  }

  dispose() {
    this.atmo.dispose();
    this.veg.dispose();
    this.river.dispose();
    this.village.dispose();
    this.terrain.dispose();
  }
}

async function main() {
  const boot = new Boot();
  const container = $('#viewport');

  // ---- 1. 程序化纹理 --------------------------------------------------
  const names = buildTextureNames();
  for (let i = 0; i < names.length; i++) {
    if (i % 4 === 0) {
      boot.set(0.02 + (i / names.length) * 0.32, LOAD_STEPS[Math.min(6, (i / names.length * 3) | 0)]);
      await new Promise(r => setTimeout(r, 0));
    }
    buildTexture(names[i]);
  }

  // ---- 2. 引擎、天空、相机（跨关卡长存）------------------------------
  const engine = await boot.step(0.38, '正在推演天时…', () => new Engine(container));
  const sky = new Sky(engine.scene);
  const dayNight = new DayNight(engine, sky, LEVELS[0].climate);
  const envProbe = new EnvProbe(engine, sky);
  envProbe.bake();
  const rig = new CameraRig(engine.camera, engine.renderer.domElement);

  // ---- 3. 第一关的世界 ------------------------------------------------
  const world = new World(engine, dayNight);
  await world.build(0, boot);

  // ---- 4. 玩法与界面 --------------------------------------------------
  const game = await boot.step(0.96, '正在推演天时…', () => new Game({
    engine, rig, dayNight, world,
    terrain: world.terrain, village: world.village, atmo: world.atmo,
  }));
  const hud = new HUD(game);
  game.attachHUD(hud);
  rig.cursorProvider = () => (game.state === 'menu' ? null : game.cursorWorld);

  // 换关：把整个世界拆掉重建，再让玩法接上新的地形
  game.loadLevel = async (index) => {
    if (game._loading) return;
    game._loading = true;
    hud.showLoading(LEVELS[index]);
    await new Promise(r => setTimeout(r, 30));
    boot.fast = true;
    world.dispose();
    await world.build(index, boot);
    boot.fast = false;
    envProbe.bake();
    game.setWorld({
      world, terrain: world.terrain, village: world.village, atmo: world.atmo,
    });
    rig.reset();
    hud.hideLoading();
    hud.refreshAll();
    game._loading = false;
  };

  boot.set(1.0, '机关已备');

  // ---- 主循环 ---------------------------------------------------------
  const clock = new THREE.Clock();
  let t = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.066, clock.getDelta());
    t += dt;

    rig.update(dt);
    // 让阴影相机跟着取景中心走，保证近处阴影分辨率
    engine.sun.target.position.set(rig.target.x, 0, rig.target.z);
    engine.sun.position.copy(dayNight.shadowDir).multiplyScalar(190).add(engine.sun.target.position);
    engine.sun.target.updateMatrixWorld();
    dayNight.update(dt, engine.camera);
    envProbe.update(dt, dayNight.hour);
    sky.update(engine.camera, t);
    if (!game._loading) {
      world.update(dt, t);
      game.update(dt, t);
    }
    hud.update(dt);

    engine.render(dt);
    window.__N = (window.__N || 0) + 1;
  }

  await new Promise(r => setTimeout(r, 220));
  $('#loader').classList.add('done');
  setTimeout(() => { $('#loader').style.display = 'none'; }, 1000);
  $('#startScreen').hidden = false;
  frame();

  // 供调试
  window.SHANHAI = { THREE, engine, sky, dayNight, world, game, rig, envProbe, LEVELS,
    get terrain() { return world.terrain; },
    get river() { return world.river; },
    get veg() { return world.veg; },
    get atmo() { return world.atmo; },
    get village() { return world.village; } };
}

main().catch(err => {
  console.error(err);
  window.__ERR = String(err && err.message || err);
  const h = document.querySelector('#loader .loader-hint');
  if (h) {
    h.innerHTML = '机关卡壳了：<br><span style="font-size:11px;opacity:.7">' +
      String(err && err.message || err).replace(/</g, '&lt;') + '</span>';
    h.style.color = '#ff9a86';
  }
});
