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
   载入页的机关齿轮组 —— 真三维
   ----------------------------------------------------------------
   齿数、节圆、中心距、转速比、啮合相位全部算出来：
   两轮啮合时中心距 = 两节圆半径之和，角速度之比 = 齿数之比的倒数，
   方向相反；从动轮还要转过一个相位角，让自己的齿槽正对着主动轮的齿。

   厚度不是画上去的阴影 —— 每枚轮子是一叠沿 Z 轴排开的薄片（CSS
   preserve-3d），整组挂在一块后仰的舞台上，所以转起来能看见轮齿的
   侧面在明暗里进出。高光片不跟着转，铜面才像是被一盏固定的灯照着。

   全部走 CSS 动画（合成器线程），所以主线程在烘贴图卡住时，齿轮照转。
   ================================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(SVGNS, n);
  for (const k of Object.keys(a)) e.setAttribute(k, a[k]);
  return e;
};

// 一枚齿轮的轮廓。渐开线用二次贝塞尔近似：齿根圆角、齿侧内凹、齿顶倒角，
// 比梯形齿看着「铸」得出来。
function gearOutline(R, rRoot, n) {
  const p = (Math.PI * 2) / n;
  const rPitch = (R + rRoot) * 0.52;
  const rTip = R;
  const P = [];
  const pt = (r, a) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const a = i * p;
    // 齿根 -> 节圆（凹）-> 齿顶前缘
    P.push((i ? 'L' : 'M') + pt(rRoot, a + p * 0.04));
    P.push('Q' + pt(rRoot * 1.02, a + p * 0.10) + ' ' + pt(rPitch, a + p * 0.155));
    P.push('Q' + pt(R * 0.99, a + p * 0.20) + ' ' + pt(rTip * 0.995, a + p * 0.225));
    // 齿顶：中间略鼓，两端倒角
    P.push('L' + pt(rTip, a + p * 0.26));
    P.push('L' + pt(rTip, a + p * 0.34));
    P.push('L' + pt(rTip * 0.995, a + p * 0.375));
    // 齿顶后缘 -> 节圆 -> 齿根
    P.push('Q' + pt(R * 0.99, a + p * 0.40) + ' ' + pt(rPitch, a + p * 0.445));
    P.push('Q' + pt(rRoot * 1.02, a + p * 0.50) + ' ' + pt(rRoot, a + p * 0.56));
    // 齿根弧：走个中点，不至于切成直边
    P.push('Q' + pt(rRoot * 0.985, a + p * 0.80) + ' ' + pt(rRoot, a + p * 1.04));
  }
  return P.join('') + 'Z';
}

// 一片薄片：轮廓 + （最上一片才画的）辐板细节
function gearPlate(o) {
  const { R, rRoot, teeth, spokes, size, fill, stroke, top, hub } = o;
  const s = el('svg', {
    class: 'gp', viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`,
    width: size, height: size,
  });
  const d = gearOutline(R, rRoot, teeth);
  s.appendChild(el('path', { d, fill, stroke: stroke || 'none', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }));
  if (!top) return s;

  // 顶面：轮辐、轮毂、铆钉、减重孔
  const web = el('g', { class: 'gp-face' });
  web.appendChild(el('circle', { r: (R * 0.80).toFixed(2), fill: 'none', stroke: 'rgba(24,15,5,.42)', 'stroke-width': (R * 0.10).toFixed(2) }));
  web.appendChild(el('circle', { r: (R * 0.72).toFixed(2), fill: 'none', stroke: 'rgba(255,232,180,.30)', 'stroke-width': 0.9 }));
  // 辐板挖空：轮辐之间的月牙孔
  for (let i = 0; i < spokes; i++) {
    const a0 = ((i + 0.16) / spokes) * Math.PI * 2;
    const a1 = ((i + 0.84) / spokes) * Math.PI * 2;
    const r0 = R * 0.34, r1 = R * 0.63;
    const P = [
      `M${(Math.cos(a0) * r0).toFixed(2)},${(Math.sin(a0) * r0).toFixed(2)}`,
      `L${(Math.cos(a0) * r1).toFixed(2)},${(Math.sin(a0) * r1).toFixed(2)}`,
      `A${r1.toFixed(2)},${r1.toFixed(2)} 0 0 1 ${(Math.cos(a1) * r1).toFixed(2)},${(Math.sin(a1) * r1).toFixed(2)}`,
      `L${(Math.cos(a1) * r0).toFixed(2)},${(Math.sin(a1) * r0).toFixed(2)}`,
      `A${r0.toFixed(2)},${r0.toFixed(2)} 0 0 0 ${(Math.cos(a0) * r0).toFixed(2)},${(Math.sin(a0) * r0).toFixed(2)}`,
      'Z',
    ].join('');
    web.appendChild(el('path', { d: P, fill: 'rgba(10,7,3,.62)', stroke: 'rgba(255,226,166,.20)', 'stroke-width': 0.7 }));
  }
  // 轮毂
  web.appendChild(el('circle', { r: (R * 0.30).toFixed(2), fill: hub, stroke: 'rgba(255,232,180,.42)', 'stroke-width': 0.9 }));
  web.appendChild(el('circle', { r: (R * 0.13).toFixed(2), fill: 'rgba(12,9,4,.9)', stroke: 'rgba(255,232,180,.34)', 'stroke-width': 0.7 }));
  // 键槽：轮毂上一道方口，转起来一眼就看出在转
  web.appendChild(el('rect', {
    x: (-R * 0.055).toFixed(2), y: (-R * 0.185).toFixed(2),
    width: (R * 0.11).toFixed(2), height: (R * 0.075).toFixed(2),
    fill: 'rgba(12,9,4,.95)',
  }));
  // 铆钉
  for (let i = 0; i < spokes; i++) {
    const a = ((i + 0.5) / spokes) * Math.PI * 2;
    web.appendChild(el('circle', {
      r: (R * 0.036).toFixed(2), fill: 'rgba(255,238,196,.72)',
      cx: (Math.cos(a) * R * 0.235).toFixed(2), cy: (Math.sin(a) * R * 0.235).toFixed(2),
    }));
  }
  s.appendChild(web);
  return s;
}

// 不随轮子转的那层：定向高光 + 轮毂周围的暗角，铜面这才像被灯照着
function gearShine(R, size) {
  const s = el('svg', {
    class: 'gp gp-shine', viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`,
    width: size, height: size,
  });
  const id = 'sh' + Math.random().toString(36).slice(2, 8);
  const defs = el('defs');
  const lg = el('linearGradient', { id, x1: '0.12', y1: '0', x2: '0.9', y2: '1' });
  lg.appendChild(el('stop', { offset: '0', 'stop-color': '#fff6dc', 'stop-opacity': '0.42' }));
  lg.appendChild(el('stop', { offset: '0.38', 'stop-color': '#ffdca0', 'stop-opacity': '0.10' }));
  lg.appendChild(el('stop', { offset: '0.66', 'stop-color': '#000000', 'stop-opacity': '0.22' }));
  lg.appendChild(el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.42' }));
  defs.appendChild(lg);
  const rg = el('radialGradient', { id: id + 'a' });
  rg.appendChild(el('stop', { offset: '0.30', 'stop-color': '#000', 'stop-opacity': '0.55' }));
  rg.appendChild(el('stop', { offset: '0.62', 'stop-color': '#000', 'stop-opacity': '0' }));
  defs.appendChild(rg);
  s.appendChild(defs);
  s.appendChild(el('circle', { r: (R * 1.02).toFixed(2), fill: `url(#${id})` }));
  s.appendChild(el('circle', { r: (R * 0.95).toFixed(2), fill: `url(#${id}a)` }));
  return s;
}

const PALETTE = {
  brass: { face: '#c8993f', edge: '#7c5a1e', deep: '#3a2909', hub: '#8c6a2a' },
  bronze: { face: '#b8763c', edge: '#6e4319', deep: '#331d06', hub: '#7d4f22' },
  steel: { face: '#8e9aa6', edge: '#4a545f', deep: '#1d232a', hub: '#5d6873' },
};

// 把 #rrggbb 按系数压暗
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function buildOneGear(stage, g) {
  const pal = PALETTE[g.mat];
  const size = g.R * 2.5;
  const holder = document.createElement('div');
  holder.className = 'gear';
  holder.style.transform =
    `translate3d(${g.cx.toFixed(2)}px, ${g.cy.toFixed(2)}px, ${(g.z || 0).toFixed(2)}px)` +
    ` rotate(${(g.phase * 180 / Math.PI).toFixed(2)}deg)`;

  const spin = document.createElement('div');
  spin.className = 'gear-spin' + (g.ccw ? ' ccw' : '');
  spin.style.setProperty('--dur', g.dur.toFixed(2) + 's');

  // 薄片自下而上：越靠后越暗，最上一片带辐板细节
  const N = g.plates;
  const rRoot = g.R * 0.78;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const top = i === N - 1;
    const k = 0.34 + t * 0.66;
    const plate = gearPlate({
      R: g.R, rRoot, teeth: g.teeth, spokes: g.spokes, size,
      fill: top ? pal.face : shade(pal.edge, k),
      stroke: top ? 'rgba(255,238,200,.55)' : (i === 0 ? shade(pal.deep, 1) : null),
      top, hub: pal.hub,
    });
    // 位置用 left/top 摆（px），transform 里只留 Z ——
    // SVG 根元素上的百分比 translate 会按 viewBox 解析，整幅图会被推出画面
    plate.style.left = (-size / 2).toFixed(1) + 'px';
    plate.style.top = (-size / 2).toFixed(1) + 'px';
    plate.style.transform = `translateZ(${(t * g.thick - g.thick / 2).toFixed(2)}px)`;
    spin.appendChild(plate);
  }
  holder.appendChild(spin);

  // 高光片：不转
  const sh = gearShine(g.R, size);
  sh.style.left = (-size / 2).toFixed(1) + 'px';
  sh.style.top = (-size / 2).toFixed(1) + 'px';
  sh.style.transform = `translateZ(${(g.thick / 2 + 0.4).toFixed(2)}px)`;
  holder.appendChild(sh);

  // 轴：从轮心往观者方向伸出一小截
  const axle = document.createElement('i');
  axle.className = 'gear-axle';
  axle.style.width = axle.style.height = (g.R * 0.30).toFixed(1) + 'px';
  axle.style.transform = `translate(-50%,-50%) translateZ(${(g.thick / 2 + 3.2).toFixed(2)}px)`;
  holder.appendChild(axle);

  stage.appendChild(holder);
}

function buildGearRig() {
  const stage = document.getElementById('gearStage');
  if (!stage) return null;
  stage.innerHTML = '';

  // 轮系：节圆半径取齿顶圆的 0.88，中心距 = 两节圆之和
  const pitch = (R) => R * 0.88;
  const G = [
    { teeth: 30, R: 62, spokes: 6, ccw: false, mat: 'brass', thick: 15, plates: 7 },
    { teeth: 17, R: 36, spokes: 5, ccw: true, from: 0, ang: -0.66, mat: 'steel', thick: 12, plates: 6 },
    { teeth: 12, R: 26, spokes: 4, ccw: true, from: 0, ang: 2.32, mat: 'bronze', thick: 11, plates: 6 },
    { teeth: 9, R: 20, spokes: 4, ccw: false, from: 2, ang: 3.66, mat: 'steel', thick: 9, plates: 5, z: -16 },
  ];
  // 主轮 30 齿转一圈 16 秒，其余按齿数反比推
  const BASE_T = 16.0, BASE_N = 30;
  G[0].cx = 0; G[0].cy = 0; G[0].phase = 0;
  for (const g of G) {
    if (g.from !== undefined) {
      const p = G[g.from];
      const d = pitch(p.R) + pitch(g.R);
      g.cx = p.cx + Math.cos(g.ang) * d;
      g.cy = p.cy + Math.sin(g.ang) * d;
      // 相位：让自己的一个齿槽正对着主动轮 —— 齿槽在两齿之间，故偏半个齿距
      g.phase = (g.ang + Math.PI) - Math.PI / g.teeth;
    }
    g.dur = BASE_T * (g.teeth / BASE_N);
  }
  // 从动轮全都往一侧铺，整组的重心并不在主轮上。
  // 按包围盒把轮系挪回舞台正中，才和外面的度盘同心。
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of G) {
    x0 = Math.min(x0, g.cx - g.R); x1 = Math.max(x1, g.cx + g.R);
    y0 = Math.min(y0, g.cy - g.R); y1 = Math.max(y1, g.cy + g.R);
  }
  const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
  for (const g of G) { g.cx -= ox; g.cy -= oy; buildOneGear(stage, g); }

  // ---- 度盘与进度环：浮在轮系前面一层，一并跟着舞台后仰
  const size = 300;
  const dial = el('svg', {
    class: 'gear-dial', viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`,
    width: size, height: size,
  });
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'progGrad', x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.appendChild(el('stop', { offset: '0', 'stop-color': '#8c6f36' }));
  grad.appendChild(el('stop', { offset: '0.55', 'stop-color': '#f5d68d' }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': '#fff6de' }));
  defs.appendChild(grad);
  dial.appendChild(defs);

  const ticks = el('g');
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = major ? 121 : 126, r1 = 132;
    ticks.appendChild(el('line', {
      class: 'tick' + (major ? ' tick-major' : ''),
      x1: (Math.cos(a) * r0).toFixed(2), y1: (Math.sin(a) * r0).toFixed(2),
      x2: (Math.cos(a) * r1).toFixed(2), y2: (Math.sin(a) * r1).toFixed(2),
    }));
  }
  dial.appendChild(ticks);

  const PR = 138;
  const circ = 2 * Math.PI * PR;
  dial.appendChild(el('circle', { class: 'prog-track', r: PR }));
  const arc = el('circle', {
    class: 'prog-arc', r: PR,
    'stroke-dasharray': circ.toFixed(2),
    'stroke-dashoffset': circ.toFixed(2),
  });
  dial.appendChild(arc);
  // 绝对定位下用 margin 做居中：既落在舞台正中，又不必在 SVG 上写
  // 百分比 translate（那个是按 viewBox 解析的）
  dial.style.left = '50%';
  dial.style.top = '50%';
  dial.style.marginLeft = (-size / 2) + 'px';
  dial.style.marginTop = (-size / 2) + 'px';
  dial.style.transform = 'translateZ(30px)';
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
  // 载入页平时不出文字；只有真卡壳了才在偈语那一行报错
  const h = document.querySelector('#loader .loader-verse');
  if (h) {
    h.innerHTML = '机关卡壳了：<br><span style="font-size:11px;opacity:.7">' +
      String(err && err.message || err).replace(/</g, '&lt;') + '</span>';
    h.style.color = '#ff9a86';
  }
});
