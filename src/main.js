// 山海机关录 —— 入口
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { CameraRig } from './core/controls.js';
import { buildTexture, buildTextureNames } from './core/textures.js';
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

const $ = (s) => document.querySelector(s);

const LOAD_STEPS = [
  '正在开山凿石…', '正在引溪筑渠…', '正在架梁立柱…',
  '正在铸齿造轮…', '正在栽松植竹…', '正在张灯结彩…', '正在推演天时…',
];

class Boot {
  constructor() {
    this.bar = $('#loader .loader-bar i');
    this.hint = $('#loader .loader-hint');
    this.p = 0;
  }
  set(p, msg) {
    this.p = p;
    this.bar.style.width = (p * 100).toFixed(1) + '%';
    if (msg) this.hint.textContent = msg;
  }
  async step(p, msg, fn) {
    this.set(p, msg);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = fn ? fn() : null;
    return out;
  }
}

async function main() {
  const boot = new Boot();
  const container = $('#viewport');

  // ---- 1. 程序化纹理 --------------------------------------------------
  const names = buildTextureNames();
  for (let i = 0; i < names.length; i++) {
    if (i % 4 === 0) {
      boot.set(0.03 + (i / names.length) * 0.34, LOAD_STEPS[Math.min(6, (i / names.length * 3) | 0)]);
      await new Promise(r => setTimeout(r, 0));
    }
    buildTexture(names[i]);
  }

  // ---- 2. 引擎与天空 --------------------------------------------------
  const engine = await boot.step(0.40, '正在推演天时…', () => new Engine(container));
  const sky = new Sky(engine.scene);
  const dayNight = new DayNight(engine, sky);
  const envProbe = new EnvProbe(engine, sky);
  envProbe.bake();

  const rig = new CameraRig(engine.camera, engine.renderer.domElement);

  // ---- 3. 地形 --------------------------------------------------------
  const terrain = await boot.step(0.48, '正在开山凿石…', () => new Terrain(engine.scene));

  // ---- 4. 村寨（先登记台基，再生成地形网格）---------------------------
  const village = await boot.step(0.58, '正在架梁立柱…', () => buildVillage(engine.scene, terrain));
  await boot.step(0.68, '正在开山凿石…', () => terrain.build());
  village.place();

  // ---- 5. 水系 --------------------------------------------------------
  const river = await boot.step(0.74, '正在引溪筑渠…', () => new River(engine.scene, terrain));

  // ---- 6. 草木 --------------------------------------------------------
  const veg = await boot.step(0.82, '正在栽松植竹…', () => new Vegetation(engine.scene, terrain));

  // ---- 7. 氛围 --------------------------------------------------------
  const atmo = await boot.step(0.90, '正在张灯结彩…', () => new Atmosphere(engine.scene));

  // ---- 8. 玩法 --------------------------------------------------------
  const game = await boot.step(0.95, '正在推演天时…', () => new Game({
    engine, terrain, rig, dayNight, village, atmo,
  }));
  const hud = new HUD(game);
  game.attachHUD(hud);
  rig.cursorProvider = () => (game.state === 'menu' ? null : game.cursorWorld);
  // 炊烟接到氛围系统
  for (const [sx, sy, sz] of village.smokeSpots) atmo.addSmoke(sx, sy, sz);

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
    river.update(t, engine.camera, dayNight);
    village.update(dt, t, dayNight);
    veg.update(dt, t);
    atmo.update(dt, t, dayNight, engine.camera);
    game.update(dt, t);
    hud.update(dt);

    engine.render(dt);
  }

  await new Promise(r => setTimeout(r, 220));
  $('#loader').classList.add('done');
  setTimeout(() => { $('#loader').style.display = 'none'; }, 1000);
  $('#startScreen').hidden = false;
  frame();

  // 供调试
  window.SHANHAI = { THREE, engine, sky, dayNight, terrain, river, veg, atmo, game, rig, village, envProbe };
}

main().catch(err => {
  console.error(err);
  const h = document.querySelector('#loader .loader-hint');
  if (h) {
    h.innerHTML = '机关卡壳了：<br><span style="font-size:11px;opacity:.7">' +
      String(err && err.message || err).replace(/</g, '&lt;') + '</span>';
    h.style.color = '#ff9a86';
  }
});
