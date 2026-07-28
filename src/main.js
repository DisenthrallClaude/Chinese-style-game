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

/* ================================================================
   载入页的机关齿轮组
   ----------------------------------------------------------------
   齿形、节圆、啮合位置、转速比全部算出来：
   两轮啮合时中心距 = 两节圆半径之和，角速度之比 = 齿数之比的倒数，
   方向相反。这样看上去才是真的在带动，而不是几张图各转各的。

   立体是真的立体：一枚齿轮由 SLICES 层同一条轮廓沿轴向叠出来，
   整组再放进一个 rotateX 的 3D 舞台里 —— 轮齿转到侧面时能看见厚度，
   齿顶还会挡住后面那一枚。全部走合成器动画，主线程忙着烘纹理也不会卡。
   ================================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(SVGNS, n);
  for (const k of Object.keys(a)) e.setAttribute(k, a[k]);
  return e;
};

// 一枚齿轮的轮廓。齿廓用二次贝塞尔逼近渐开线：齿根起手，经节圆鼓出，
// 收到齿顶再走一段齿顶弧 —— 比直上直下的梯形齿像机械得多。
function gearPath(R, rRoot, n) {
  const step = (Math.PI * 2) / n;
  const rPitch = R * 0.62 + rRoot * 0.38;
  const P = (r, a) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  const RR = R.toFixed(2), Rr = rRoot.toFixed(2);
  let d = `M${P(rRoot, 0)}`;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    d += `Q${P(rPitch, a + step * 0.11)} ${P(R, a + step * 0.29)}`;          // 上升齿廓
    d += `A${RR},${RR} 0 0 1 ${P(R, a + step * 0.50)}`;                      // 齿顶弧
    d += `Q${P(rPitch, a + step * 0.68)} ${P(rRoot, a + step * 0.79)}`;      // 下降齿廓
    d += `A${Rr},${Rr} 0 0 1 ${P(rRoot, a + step)}`;                         // 齿根弧
  }
  return d + 'Z';
}

// 圆形子路径。和外轮廓凑成 evenodd，就是真的挖穿的孔
function holePath(cx, cy, r) {
  const R = r.toFixed(2);
  return `M${(cx + r).toFixed(2)},${cy.toFixed(2)}` +
         `A${R},${R} 0 1 0 ${(cx - r).toFixed(2)},${cy.toFixed(2)}` +
         `A${R},${R} 0 1 0 ${(cx + r).toFixed(2)},${cy.toFixed(2)}Z`;
}

// 一层轮廓。top 层才画轮辐高光、铆钉与轴销。
// grad 是这一层用的渐变 id —— 明暗必须烘进渐变里，不能用 CSS filter：
// 3D 场景里给切片加 filter 会把它从父级的 3D 上下文里摘出去，整组齿轮直接消失。
function gearSlice(R, teeth, holes, top, grad) {
  const rRoot = R * 0.815;
  const rBore = R * 0.155;
  const rHole = R * 0.148;
  const rHoleC = R * 0.475;
  const VB = (R * 1.14).toFixed(2);
  let d = gearPath(R, rRoot, teeth) + holePath(0, 0, rBore);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2 + Math.PI / holes;
    d += holePath(Math.cos(a) * rHoleC, Math.sin(a) * rHoleC, rHole);
  }
  const body = `<path d="${d}" fill-rule="evenodd" fill="url(#${grad})"/>`;
  if (!top) return `<svg viewBox="-${VB} -${VB} ${VB * 2} ${VB * 2}">${body}</svg>`;

  const sw = (R * 0.030).toFixed(2);
  let ex = `<path d="${d}" fill-rule="evenodd" fill="none" stroke="rgba(255,240,206,.88)"` +
           ` stroke-width="${sw}" stroke-linejoin="round"/>`;
  // 轮缘沟槽 + 轮毂盘
  ex += `<circle r="${(rRoot * 0.93).toFixed(2)}" fill="none" stroke="rgba(255,238,196,.26)" stroke-width="${(R * 0.016).toFixed(2)}"/>`;
  ex += `<circle r="${(R * 0.285).toFixed(2)}" fill="none" stroke="rgba(232,196,116,.55)" stroke-width="${(R * 0.020).toFixed(2)}"/>`;
  // 铆钉：轮毂盘一圈
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    ex += `<circle cx="${(Math.cos(a) * R * 0.235).toFixed(2)}" cy="${(Math.sin(a) * R * 0.235).toFixed(2)}"` +
          ` r="${(R * 0.032).toFixed(2)}" fill="rgba(255,246,222,.72)"/>`;
  }
  // 键槽：轴孔上开一道方口，一眼看出是装在轴上的
  const kw = R * 0.055, kh = R * 0.075;
  ex += `<rect x="${(-kw).toFixed(2)}" y="${(-rBore - kh * 0.6).toFixed(2)}" width="${(kw * 2).toFixed(2)}" height="${(kh * 1.5).toFixed(2)}" fill="rgba(18,13,7,.85)"/>`;
  return `<svg viewBox="-${VB} -${VB} ${VB * 2} ${VB * 2}">${body}${ex}</svg>`;
}

const SLICES = 7;   // 一枚齿轮叠几层

function buildGear3D(stage, o, unit) {
  const { cx, cy, teeth, R, holes, dur, ccw, depth } = o;
  const size = R * 2.28;                       // 含 viewBox 余量
  const g = document.createElement('div');
  g.className = 'g3';
  g.style.width = (size * unit) + '%';
  g.style.height = (size * unit) + '%';
  g.style.left = ((cx - size / 2) * unit + 50) + '%';
  g.style.top = ((cy - size / 2) * unit + 50) + '%';

  const spin = document.createElement('div');
  spin.className = 'g3-spin' + (ccw ? ' ccw' : '');
  spin.style.setProperty('--dur', dur.toFixed(2) + 's');

  const th = R * 0.24;                          // 轮厚（视口单位）
  for (let i = 0; i < SLICES; i++) {
    const t = i / (SLICES - 1);
    const s = document.createElement('div');
    s.className = 'g3-slice';
    s.style.transform = `translateZ(${((t - 1) * th * unit * 4.0).toFixed(2)}px)`;
    s.innerHTML = gearSlice(R, teeth, holes, i === SLICES - 1, 'gSlice' + i);
    spin.appendChild(s);
  }
  // 轴：从轮心穿出去一小截
  const axle = document.createElement('i');
  axle.className = 'g3-axle';
  axle.style.setProperty('--r', (R * 0.30 * unit) + '%');
  spin.appendChild(axle);

  g.appendChild(spin);
  g.style.zIndex = String(10 + (depth | 0));
  stage.appendChild(g);
}

function buildGearRig() {
  const stage = document.getElementById('gearStage');
  if (!stage) return null;
  stage.innerHTML = '';

  // 渐变一份就够：同一文档里的 url(#id) 各 svg 都引得到
  const defs = el('svg', { class: 'gear-defs', 'aria-hidden': 'true' });
  const D = el('defs');
  const grad = (id, stops, attrs) => {
    const lg = el('linearGradient', { id, x1: '0.1', y1: '0', x2: '0.9', y2: '1', ...attrs });
    for (const [off, c] of stops) lg.appendChild(el('stop', { offset: off, 'stop-color': c }));
    D.appendChild(lg);
  };
  // 顶面的铜色；下面每一层按深度整体压暗，叠出来就是一圈有明暗过渡的轮缘
  const FACE = [['0', 0x7e5f27], ['0.30', 0xe4ba66], ['0.50', 0x8a6a2c],
                ['0.72', 0xf4d68e], ['1', 0x6b4f20]];
  const dim = (hex, k) => '#' + [16, 8, 0].map(sh =>
    Math.round(((hex >> sh) & 255) * k).toString(16).padStart(2, '0')).join('');
  for (let i = 0; i < SLICES; i++) {
    const k = 0.24 + (i / (SLICES - 1)) * 0.76;
    grad('gSlice' + i, FACE.map(([o, c]) => [o, dim(c, k)]));
  }
  grad('progGrad', [['0', '#8c6f36'], ['0.55', '#f5d68d'], ['1', '#fff6de']]);
  defs.appendChild(D);
  stage.appendChild(defs);

  // ---- 轮系：节圆半径取齿顶圆的 0.90，中心距 = 两节圆之和 ----
  const VB = 250;                   // 舞台的视口边长（单位）
  const unit = 100 / VB;            // 单位 -> 百分比
  const pitch = (R) => R * 0.90;
  const G = [
    { teeth: 24, R: 50, holes: 6, ccw: false, depth: 3 },                       // 主轮
    { teeth: 15, R: 31.25, holes: 5, ccw: true, from: 0, ang: -0.66, depth: 2 },
    { teeth: 11, R: 22.9, holes: 4, ccw: true, from: 0, ang: 2.30, depth: 2 },
    { teeth: 9, R: 18.75, holes: 0, ccw: false, from: 2, ang: 3.58, depth: 1 },
  ];
  const BASE_T = 15.0, BASE_N = 24;
  G[0].cx = 0; G[0].cy = 0;
  for (const g of G) {
    if (g.from !== undefined) {
      const p = G[g.from];
      const d = pitch(p.R) + pitch(g.R);
      g.cx = p.cx + Math.cos(g.ang) * d;
      g.cy = p.cy + Math.sin(g.ang) * d;
    }
    g.dur = BASE_T * (g.teeth / BASE_N);
    buildGear3D(stage, g, unit);
  }

  // ---- 度盘与进度环：浮在轮系上方一层 ----
  const dial = el('svg', { class: 'gear-dial', viewBox: '-125 -125 250 250', 'aria-hidden': 'true' });
  const ticks = el('g');
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = major ? 101 : 105, r1 = 110;
    ticks.appendChild(el('line', {
      class: 'tick' + (major ? ' tick-major' : ''),
      x1: (Math.cos(a) * r0).toFixed(2), y1: (Math.sin(a) * r0).toFixed(2),
      x2: (Math.cos(a) * r1).toFixed(2), y2: (Math.sin(a) * r1).toFixed(2),
    }));
  }
  dial.appendChild(ticks);
  const PR = 116;
  const circ = 2 * Math.PI * PR;
  dial.appendChild(el('circle', { class: 'prog-track', r: PR }));
  const arc = el('circle', {
    class: 'prog-arc', r: PR,
    'stroke-dasharray': circ.toFixed(2),
    'stroke-dashoffset': circ.toFixed(2),
  });
  dial.appendChild(arc);
  stage.appendChild(dial);

  return {
    set(p) {
      arc.setAttribute('stroke-dashoffset', (circ * (1 - Math.max(0, Math.min(1, p)))).toFixed(2));
    },
  };
}

class Boot {
  constructor() {
    this.rig = buildGearRig();
    this.p = 0;
  }
  set(p) {
    this.p = p;
    if (this.rig) this.rig.set(p);
  }
  // 开场要让进度条一格格走，所以等真正的一帧；
  // 换关时盖着的是静态过场，等帧毫无意义 —— 慢机器上每帧好几百毫秒，
  // 八个步骤就白白多花好几秒。那时只做一次微让步，把主线程还给 UI。
  async step(p, fn) {
    this.set(p);
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
    await boot.step(0.42, () => ensureLevelTextures(L.id));

    // 天时：先把这一关的气候色偏挂上，后面所有取色都按它来
    this.dayNight.climate = L.climate;
    this.dayNight.apply(this.dayNight.hour, true);

    const P = (a, b) => a + (b - a);
    this.terrain = await boot.step(0.46, () => new Terrain(scene));
    // 先登记台基，再造地形网格，最后落成建筑
    this.village = await boot.step(0.56, () => buildVillage(scene, this.terrain));
    await boot.step(0.66, () => this.terrain.build());
    await boot.step(0.72, () => this.village.place());
    this.river = await boot.step(0.78, () => new River(scene, this.terrain));
    this.veg = await boot.step(0.86, () => new Vegetation(scene, this.terrain));
    this.atmo = await boot.step(0.92, () => new Atmosphere(scene));
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
      boot.set(0.02 + (i / names.length) * 0.32);
      await new Promise(r => setTimeout(r, 0));
    }
    buildTexture(names[i]);
  }

  // ---- 2. 引擎、天空、相机（跨关卡长存）------------------------------
  const engine = await boot.step(0.38, () => new Engine(container));
  const sky = new Sky(engine.scene);
  const dayNight = new DayNight(engine, sky, LEVELS[0].climate);
  const envProbe = new EnvProbe(engine, sky);
  envProbe.bake();
  const rig = new CameraRig(engine.camera, engine.renderer.domElement);

  // ---- 3. 第一关的世界 ------------------------------------------------
  const world = new World(engine, dayNight);
  await world.build(0, boot);

  // ---- 4. 玩法与界面 --------------------------------------------------
  const game = await boot.step(0.96, () => new Game({
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

  boot.set(1.0);

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
  const h = document.querySelector('#loader .loader-verse');
  if (h) {
    h.innerHTML = '机关卡壳了：<br><span style="font-size:11px;opacity:.7">' +
      String(err && err.message || err).replace(/</g, '&lt;') + '</span>';
    h.style.color = '#ff9a86';
  }
});
