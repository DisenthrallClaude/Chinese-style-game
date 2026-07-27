// 十二时辰 —— 一天的光色变化，驱动天空、光源、雾、后期调色
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/noise.js';

const C = (hex) => new THREE.Color(hex);

// 关键帧：按小时排列，中间线性插值
const KEYS = [
  {
    h: 0.0, name: '子夜',
    sunEl: -48, sunAz: 350, moonEl: 46, moonAz: 206,
    sun: 0xaec4f8, sunI: 3.9,
    hemiSky: 0x46649c, hemiGnd: 0x222a3a, hemiI: 1.407,
    fill: 0x6a8ec8, fillI: 0.62, amb: 0.15,
    zen: 0x0a1430, hor: 0x1e2e52, gnd: 0x121a2c,
    cloudLit: 0x4a5a7c, cloudDark: 0x121826, cover: 0.36,
    fog: 0x16233c, fogD: 0.0030,
    star: 1.0, moon: 1.0,
    ray: 0.10, rayThr: 0.16,
    bloom: 0.95, bloomThr: 0.36,
    exposure: 1.34, contrast: 1.041, sat: 1.012,
    lift: [0.036, 0.065, 0.123], gain: [0.86, 0.94, 1.12],
    lantern: 1.0,
  },
  {
    h: 4.6, name: '平旦',
    sunEl: -7, sunAz: 60, moonEl: 30, moonAz: 240,
    sun: 0xd8a2e0, sunI: 3.4,
    hemiSky: 0x64749e, hemiGnd: 0x342c3a, hemiI: 1.367,
    fill: 0x6a7ab0, fillI: 0.60, amb: 0.15,
    zen: 0x1b2a56, hor: 0x8c6c84, gnd: 0x2c2836,
    cloudLit: 0xb08ca8, cloudDark: 0x2a2c44, cover: 0.46,
    fog: 0x5a5470, fogD: 0.0036,
    star: 0.34, moon: 0.42,
    ray: 0.42, rayThr: 0.24,
    bloom: 0.80, bloomThr: 0.40,
    exposure: 1.16, contrast: 1.031, sat: 1.072,
    lift: [0.039, 0.043, 0.084], gain: [1.02, 0.96, 1.04],
    lantern: 0.85,
  },
  {
    h: 6.4, name: '日出',
    sunEl: 13, sunAz: 30, moonEl: 14, moonAz: 280,
    sun: 0xffb066, sunI: 3.587,
    hemiSky: 0x8ea6d2, hemiGnd: 0x4a3826, hemiI: 0.772,
    fill: 0x8aa8dc, fillI: 0.286, amb: 0.090,
    zen: 0x2a5090, hor: 0xf0a878, gnd: 0x5a4a48,
    cloudLit: 0xffc89a, cloudDark: 0x5a4a58, cover: 0.50,
    fog: 0xd8b498, fogD: 0.0034,
    star: 0.0, moon: 0.10,
    ray: 1.15, rayThr: 0.34,
    bloom: 0.72, bloomThr: 0.52,
    exposure: 1.06, contrast: 1.041, sat: 1.198,
    lift: [0.030, 0.032, 0.063], gain: [1.08, 1.00, 0.94],
    lantern: 0.45,
  },
  {
    h: 8.6, name: '辰时',
    sunEl: 46, sunAz: 58, moonEl: -20, moonAz: 320,
    sun: 0xffe0b0, sunI: 5.513,
    hemiSky: 0xa8c8ff, hemiGnd: 0x4a3a26, hemiI: 1.040,
    fill: 0x8fb4e8, fillI: 0.420, amb: 0.126,
    zen: 0x3d86d8, hor: 0xd6e8f2, gnd: 0x9aa4ac,
    cloudLit: 0xfffaf2, cloudDark: 0x7a869a, cover: 0.40,
    fog: 0xd2e2ea, fogD: 0.0026,
    star: 0.0, moon: 0.0,
    ray: 0.92, rayThr: 0.52,
    bloom: 0.55, bloomThr: 0.98,
    exposure: 1.0, contrast: 1.051, sat: 1.219,
    lift: [0.027, 0.047, 0.088], gain: [1.05, 1.01, 0.96],
    lantern: 0.0,
  },
  {
    h: 12.0, name: '正午',
    sunEl: 72, sunAz: 118, moonEl: -40, moonAz: 0,
    sun: 0xfff2dc, sunI: 6.212,
    hemiSky: 0xbcd8ff, hemiGnd: 0x56452e, hemiI: 1.136,
    fill: 0x9cc0f0, fillI: 0.370, amb: 0.144,
    zen: 0x357ad8, hor: 0xe2eff6, gnd: 0xa2a8ac,
    cloudLit: 0xffffff, cloudDark: 0x8c98aa, cover: 0.34,
    fog: 0xdaeaf2, fogD: 0.0022,
    star: 0.0, moon: 0.0,
    ray: 0.62, rayThr: 0.66,
    bloom: 0.48, bloomThr: 1.10,
    exposure: 0.96, contrast: 1.060, sat: 1.177,
    lift: [0.021, 0.040, 0.077], gain: [1.02, 1.01, 0.99],
    lantern: 0.0,
  },
  {
    h: 16.4, name: '申时',
    sunEl: 43, sunAz: 188, moonEl: -22, moonAz: 40,
    sun: 0xffd79a, sunI: 5.337,
    hemiSky: 0xa8c4f0, hemiGnd: 0x584428, hemiI: 0.969,
    fill: 0x8ab0e4, fillI: 0.352, amb: 0.117,
    zen: 0x3a7cc8, hor: 0xece0c4, gnd: 0x9c9890,
    cloudLit: 0xfff0dc, cloudDark: 0x7e8494, cover: 0.42,
    fog: 0xe0d8c0, fogD: 0.0026,
    star: 0.0, moon: 0.0,
    ray: 1.02, rayThr: 0.50,
    bloom: 0.58, bloomThr: 0.96,
    exposure: 1.0, contrast: 1.051, sat: 1.240,
    lift: [0.027, 0.043, 0.081], gain: [1.07, 1.01, 0.94],
    lantern: 0.0,
  },
  {
    h: 18.3, name: '金乌',
    sunEl: 17, sunAz: 224, moonEl: 6, moonAz: 60,
    sun: 0xff9a4e, sunI: 4.462,
    hemiSky: 0x9aaee0, hemiGnd: 0x60401e, hemiI: 0.791,
    fill: 0x7e9ad8, fillI: 0.286, amb: 0.099,
    zen: 0x2a4e9c, hor: 0xf0a060, gnd: 0x6e5a4c,
    cloudLit: 0xffb877, cloudDark: 0x6a5464, cover: 0.52,
    fog: 0xdca476, fogD: 0.0029,
    star: 0.0, moon: 0.06,
    ray: 1.45, rayThr: 0.34,
    bloom: 0.80, bloomThr: 0.52,
    exposure: 1.04, contrast: 1.070, sat: 1.324,
    lift: [0.030, 0.032, 0.070], gain: [1.12, 0.99, 0.90],
    lantern: 0.30,
  },
  {
    h: 19.6, name: '黄昏',
    sunEl: 2, sunAz: 240, moonEl: 20, moonAz: 140,
    sun: 0xff6a3c, sunI: 1.662,
    hemiSky: 0x6a76b4, hemiGnd: 0x46301e, hemiI: 0.804,
    fill: 0x6a7ec0, fillI: 0.40, amb: 0.110,
    zen: 0x1c2f74, hor: 0xd4683e, gnd: 0x4a3a3a,
    cloudLit: 0xff8a52, cloudDark: 0x4a3a52, cover: 0.56,
    fog: 0xa87a66, fogD: 0.0033,
    star: 0.22, moon: 0.30,
    ray: 1.10, rayThr: 0.26,
    bloom: 0.92, bloomThr: 0.42,
    exposure: 1.10, contrast: 1.070, sat: 1.303,
    lift: [0.033, 0.040, 0.088], gain: [1.10, 0.98, 0.94],
    lantern: 0.72,
  },
  {
    h: 21.0, name: '戌时',
    sunEl: -34, sunAz: 300, moonEl: 40, moonAz: 190,
    sun: 0xa6bcf2, sunI: 4.2,
    hemiSky: 0x54689e, hemiGnd: 0x28303e, hemiI: 1.474,
    fill: 0x7288bc, fillI: 0.64, amb: 0.155,
    zen: 0x0e1c44, hor: 0x364a76, gnd: 0x1e2638,
    cloudLit: 0x5c6a92, cloudDark: 0x1a2032, cover: 0.42,
    fog: 0x22304c, fogD: 0.0031,
    star: 0.82, moon: 0.86,
    ray: 0.16, rayThr: 0.18,
    bloom: 0.95, bloomThr: 0.36,
    exposure: 1.30, contrast: 1.041, sat: 1.050,
    lift: [0.036, 0.061, 0.116], gain: [0.88, 0.95, 1.10],
    lantern: 1.0,
  },
];
KEYS.push({ ...KEYS[0], h: 24.0 });

function lerpKey(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'name') { out[k] = t < 0.5 ? a[k] : b[k]; continue; }
    const av = a[k], bv = b[k];
    if (Array.isArray(av)) {
      out[k] = av.map((v, i) => lerp(v, bv[i], t));
    } else if (typeof av === 'number') {
      // 颜色以十六进制存储时用分量插值
      if (k === 'sun' || k === 'hemiSky' || k === 'hemiGnd' || k === 'fill' ||
          k === 'zen' || k === 'hor' || k === 'gnd' || k === 'cloudLit' ||
          k === 'cloudDark' || k === 'fog') {
        const ca = C(av), cb = C(bv);
        out[k] = ca.lerp(cb, t);
      } else {
        out[k] = lerp(av, bv, t);
      }
    } else {
      out[k] = av;
    }
  }
  return out;
}

export class DayNight {
  constructor(engine, sky) {
    this.engine = engine;
    this.sky = sky;
    this.hour = 8.6;
    this.targetHour = 8.6;
    this.transition = 0;      // >0 表示正在过渡
    this.transitionSpeed = 0.5;
    this.autoRun = false;
    this.autoSpeed = 0.35;    // 小时/秒
    this.state = null;
    this.lanternLevel = 0;
    this.sunScreen = new THREE.Vector2(0.5, 0.9);
    this.sunVisible = 0;
    this.sunWorld = new THREE.Vector3();
    this.moonWorld = new THREE.Vector3();
    this.shadowDir = new THREE.Vector3(0.4, 0.6, -0.7).normalize();
    this._tmp = new THREE.Vector3();
    this.apply(this.hour, true);
  }

  sample(hour) {
    const h = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smoothstep(0, 1, (h - a.h) / Math.max(0.0001, b.h - a.h));
    return lerpKey(a, b, t);
  }

  setHour(h, instant = false) {
    this.targetHour = h;
    if (instant) { this.hour = h; this.apply(h, true); }
  }

  // 昼/夜快捷切换（游戏波次用）
  toDay() { this.setHour(8.6); }
  toNight() { this.setHour(21.4); }
  get isNight() {
    const h = this.hour;
    return h < 5.6 || h > 19.2;
  }

  update(dt, camera) {
    if (this.autoRun) {
      this.hour = (this.hour + dt * this.autoSpeed) % 24;
      this.targetHour = this.hour;
    } else if (Math.abs(this.hour - this.targetHour) > 0.005) {
      // 沿最短方向绕圈过渡
      let diff = this.targetHour - this.hour;
      if (diff > 12) diff -= 24;
      if (diff < -12) diff += 24;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), dt * 5.2);
      this.hour = ((this.hour + step) % 24 + 24) % 24;
    }
    this.apply(this.hour);
    this._updateSunScreen(camera);
  }

  apply(hour, instant = false) {
    const s = this.sample(hour);
    this.state = s;
    const e = this.engine, u = this.sky.u;

    // 太阳与月亮方向
    const el = THREE.MathUtils.degToRad(s.sunEl);
    const az = THREE.MathUtils.degToRad(s.sunAz);
    const dir = this._tmp.set(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az)
    ).normalize();
    this.sunWorld.copy(dir);
    u.uSunDir.value.copy(dir);
    const mel = THREE.MathUtils.degToRad(s.moonEl);
    const maz = THREE.MathUtils.degToRad(s.moonAz);
    this.moonWorld.set(
      Math.cos(mel) * Math.sin(maz),
      Math.sin(mel),
      Math.cos(mel) * Math.cos(maz)
    ).normalize();
    u.uMoonDir.value.copy(this.moonWorld);

    // 主光：日落后主光切换为月光方向
    const useMoon = s.sunEl < -3;
    const lightDir = useMoon ? this.moonWorld : dir;
    this.shadowDir.copy(lightDir);
    e.sun.position.copy(lightDir).multiplyScalar(190).add(e.sun.target.position);
    e.sun.color.copy(s.sun);
    e.sun.intensity = s.sunI;
    e.sun.castShadow = s.sunI > 0.12;

    e.hemi.color.copy(s.hemiSky);
    e.hemi.groundColor.copy(s.hemiGnd);
    e.hemi.intensity = s.hemiI;
    e.fill.color.copy(s.fill);
    e.fill.intensity = s.fillI;
    e.ambient.intensity = s.amb;

    // 天空
    u.uZenith.value.copy(s.zen);
    u.uHorizon.value.copy(s.hor);
    u.uGround.value.copy(s.gnd);
    u.uSunColor.value.copy(s.sun);
    u.uSunIntensity.value = clamp(s.sunI / 3.2, 0.04, 1.25);
    u.uCloudLit.value.copy(s.cloudLit);
    u.uCloudDark.value.copy(s.cloudDark);
    u.uCloudCover.value = s.cover;
    u.uStarStrength.value = s.star;
    u.uMoonStrength.value = s.moon;

    // 雾
    if (!e.scene.fog) e.scene.fog = new THREE.FogExp2(0xaabbcc, 0.006);
    e.scene.fog.color.copy(s.fog);
    e.scene.fog.density = s.fogD;
    e.renderer.toneMappingExposure = 1.0;

    // 后期
    e.godRay.uniforms.uIntensity.value = s.ray;
    e.godRay.uniforms.uThreshold.value = s.rayThr;
    e.godRay.uniforms.uSunColor.value.copy(s.sun).lerp(C(0xffffff), 0.15);
    e.bloom.strength = s.bloom;
    e.bloom.threshold = s.bloomThr;
    const g = e.grade.uniforms;
    g.uExposure.value = s.exposure;
    g.uContrast.value = s.contrast;
    g.uSaturation.value = s.sat;
    g.uLift.value.setRGB(s.lift[0], s.lift[1], s.lift[2]);
    g.uGain.value.setRGB(s.gain[0], s.gain[1], s.gain[2]);

    this.lanternLevel = s.lantern;
  }

  _updateSunScreen(camera) {
    if (!camera) return;
    const useMoon = this.state.sunEl < -3;
    const p = this._tmp.copy(useMoon ? this.moonWorld : this.sunWorld).multiplyScalar(900).add(camera.position);
    p.project(camera);
    const onScreen = p.z < 1;
    const sx = p.x * 0.5 + 0.5, sy = p.y * 0.5 + 0.5;
    this.sunScreen.set(sx, sy);
    // 屏幕外时平滑淡出光柱
    const marginX = Math.max(0, Math.max(-sx, sx - 1));
    const marginY = Math.max(0, Math.max(-sy, sy - 1));
    const off = Math.max(marginX, marginY);
    const vis = onScreen ? clamp(1 - off / 0.55, 0, 1) : 0;
    this.sunVisible += (vis - this.sunVisible) * 0.12;
    this.engine.godRay.uniforms.uSunScreen.value.copy(this.sunScreen);
    this.engine.godRay.uniforms.uVisible.value = this.sunVisible;
  }

  get phaseName() { return this.state ? this.state.name : ''; }
}
