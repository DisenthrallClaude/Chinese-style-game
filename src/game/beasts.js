// 异兽志 —— 程序化生成《山海经》凶兽，实例化绘制，肢体在顶点着色器里动
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, beam, T } from '../world/geo.js';
import { colorOf } from '../core/textures.js';
import { toonUniforms, TOON_PARS, TOON_BODY } from '../core/toon.js';

/* ============================================================
   构件累加器：位置 / 顶点色 / 自发光强度 / 动画参数
   aAnim = (摆幅, 相位, 拍翼幅度, 枢轴 Y)
   ============================================================ */
class BeastBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.emi = []; this.anim = []; this.idx = [];
    this.count = 0;
  }
  push(geo, color, emissive = 0, anim = [0, 0, 0, 0]) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else this.nor.push(0, 1, 0);
      this.col.push(color[0], color[1], color[2]);
      this.emi.push(emissive);
      this.anim.push(anim[0], anim[1], anim[2], anim[3]);
    }
    const gi = geo.index.array;
    for (let i = 0; i < gi.length; i++) this.idx.push(gi[i] + base);
    this.count += p.count;
    return this;
  }
  // 焊接法线：把同一位置上的硬边法线求平均。
  // 描边用的外扩壳靠它才不会在方盒的棱角处裂开。
  _smoothNormals() {
    const n = this.count;
    const out = new Float32Array(n * 3);
    const acc = new Map();
    const key = (i) => {
      const q = 512;
      return `${Math.round(this.pos[i * 3] * q)},${Math.round(this.pos[i * 3 + 1] * q)},${Math.round(this.pos[i * 3 + 2] * q)}`;
    };
    for (let i = 0; i < n; i++) {
      const k = key(i);
      let a = acc.get(k);
      if (!a) { a = [0, 0, 0]; acc.set(k, a); }
      a[0] += this.nor[i * 3]; a[1] += this.nor[i * 3 + 1]; a[2] += this.nor[i * 3 + 2];
    }
    for (let i = 0; i < n; i++) {
      const a = acc.get(key(i));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
    }
    return out;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aSmooth', new THREE.BufferAttribute(this._smoothNormals(), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aEmis', new THREE.Float32BufferAttribute(this.emi, 1));
    g.setAttribute('aAnim', new THREE.Float32BufferAttribute(this.anim, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const hex2rgb = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

/* ---------------------------------------------------------- 部件 */
function ellip(rx, ry, rz, seg = 16) {
  const g = sphere(1, seg, Math.max(9, seg - 3), 0.5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  g.computeVertexNormals();
  return g;
}

function addSpine(B, col, o = {}) {
  // 分段的躯干：从头到尾逐渐收细，整体做蛇形摆动
  const { len = 3.0, r = 0.55, segs = 8, y = 1.0, taper = 0.5, wave = 0.06, rise = 0, seg = 15 } = o;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const rr = r * lerp(1.0, taper, Math.pow(t, 1.2)) * (1 - Math.pow(Math.abs(t - 0.42) * 1.5, 2) * 0.16);
    const z = lerp(len * 0.5, -len * 0.5, t);
    // 上窄下宽一点点：胸腹分明
    const g = ellip(rr * 1.03, rr * 0.98, rr * (len / segs) * 0.86, seg);
    T(g, 0, y + rise * Math.sin(t * Math.PI), z);
    B.push(g, col, 0, [wave * t, t * 1.6, 0, 0]);
  }
}

function addLeg(B, col, x, z, o = {}) {
  const { h = 1.0, r = 0.14, phase = 0, y = 1.0, swing = 0.16, foot = true, claw = true } = o;
  const kneeY = y - h * 0.46;
  // 大腿：上粗下细
  const th = cyl(r * 0.80, r * 1.18, h * 0.56, 10, 0.6);
  T(th, x, y - h * 0.24, z + r * 0.10);
  B.push(th, col, 0, [swing * 0.7, phase, 0, 0]);
  // 膝
  B.push(T(ellip(r * 0.86, r * 0.86, r * 0.94, 10), x, kneeY, z + r * 0.05), col, 0, [swing, phase, 0, 0]);
  // 小腿：略微前折
  const sh = cyl(r * 0.58, r * 0.82, h * 0.54, 10, 0.6);
  T(sh, x, y - h * 0.74, z - r * 0.10);
  B.push(sh, col, 0, [swing * 1.15, phase, 0, 0]);
  if (foot) {
    const f = ellip(r * 1.55, r * 0.70, r * 2.00, 11);
    T(f, x, y - h + r * 0.52, z + r * 0.58);
    B.push(f, col, 0, [swing * 1.2, phase, 0, 0]);
    // 趾 + 爪
    for (let i = -1; i <= 1; i++) {
      const toe = ellip(r * 0.36, r * 0.30, r * 0.62, 8);
      T(toe, x + i * r * 0.60, y - h + r * 0.42, z + r * 1.42);
      B.push(toe, col, 0, [swing * 1.22, phase, 0, 0]);
      if (claw) {
        const cw = cone(r * 0.22, r * 0.60, 6, 1.2);
        T(cw, x + i * r * 0.62, y - h + r * 0.34, z + r * 1.92, Math.PI / 2.2, 0, 0);
        B.push(cw, [0.90, 0.88, 0.80], 0.06, [swing * 1.25, phase, 0, 0]);
      }
    }
  }
}

// 背脊：一排小三角，剪影立刻硬朗起来
function addRidge(B, col, o = {}) {
  const { from = 1.4, to = -1.6, y = 1.5, h = 0.34, n = 8, phase = 0, emis = 0.1 } = o;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = from + (to - from) * t;
    const hh = h * Math.sin(Math.PI * (0.18 + t * 0.82));
    const g = cone(hh * 0.42, hh * 1.9, 5, 1.0);
    T(g, 0, y + hh * 0.7, z, -0.35, 0, 0);
    B.push(g, col, emis, [0.06 + t * 0.16, phase + t * 1.7, 0, 0]);
    // 鳍膜：贴在棘刺之间，剪影更连贯
    if (i < n - 1) {
      const web = box(0.045, hh * 0.95, Math.abs(to - from) / (n - 1) * 0.9, 0.9);
      T(web, 0, y + hh * 0.42, z + (to - from) / (n - 1) * 0.5, -0.2, 0, 0);
      B.push(web, col, emis * 0.7, [0.06 + t * 0.16, phase + t * 1.7, 0, 0]);
    }
  }
}

// 耳
function addEars(B, col, o = {}) {
  const { y = 1.5, z = 1.2, r = 0.13, spread = 0.22, len = 0.42, tilt = 0.3 } = o;
  for (const s2 of [-1, 1]) {
    const g = cone(r, len, 7, 1.0);
    T(g, s2 * spread, y, z, -tilt, 0, s2 * 0.42);
    B.push(g, col, 0, [0.05, 0, 0, 0]);
    // 耳窝：一小片内耳，近看有东西可读
    const inner = cone(r * 0.56, len * 0.62, 6, 1.0);
    T(inner, s2 * spread, y + len * 0.02, z + r * 0.34, -tilt, 0, s2 * 0.42);
    B.push(inner, [col[0] * 0.62 + 0.24, col[1] * 0.52 + 0.16, col[2] * 0.52 + 0.16], 0.02, [0.05, 0, 0, 0]);
  }
}

function addWing(B, col, side, o = {}) {
  const { span = 2.2, chord = 1.1, y = 1.3, z = 0.1, flap = 0.55, tilt = 0.1, emis = 0 } = o;
  // 翼骨：肩 → 肘（拱起）→ 腕（外展下沉），拱起来才像翼，不是一块板
  const arm = (t) => [
    side * span * t,
    y + Math.sin(t * Math.PI * 0.86) * span * 0.20 - t * t * span * 0.20,
    z - t * chord * 0.34,
  ];
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const a = arm(i / segs), b = arm((i + 1) / segs);
    const r = 0.10 - i * 0.017;
    B.push(beam(a[0], a[1], a[2], b[0], b[1], b[2], r * 1.7, r * 1.7, 0.9), col, 0, [0, 0, flap * (0.3 + i * 0.22), y]);
  }
  // 肘与腕的关节
  for (const t of [0.42, 0.86]) {
    const p = arm(t);
    B.push(T(ellip(0.115, 0.105, 0.125, 9), p[0], p[1], p[2]), col, 0, [0, 0, flap * (0.4 + t * 0.6), y]);
  }
  // 飞羽：贴着骨架排开，向后掠、向下垂，中段最长
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = arm(t);
    const len = chord * (0.72 + 0.86 * Math.sin(Math.PI * (0.22 + t * 0.74)));
    const g = box(span / n * 1.32, 0.045, len, 0.7);
    T(g, p[0], p[1] - 0.05 - t * 0.14, p[2] - len * 0.44,
      tilt + 0.16 + t * 0.22, side * t * 0.46, side * (0.08 + t * 0.30));
    B.push(g, col, emis * (0.4 + t * 0.6), [0, 0, flap * (0.55 + t * 0.85), y]);
  }
  // 覆羽：压在飞羽根部的一排短羽，翼面于是有了厚度
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5 * 0.78;
    const p = arm(t);
    const g = box(span * 0.17, 0.05, chord * 0.40, 0.8);
    T(g, p[0], p[1] + 0.07, p[2] - chord * 0.16,
      tilt + 0.08, side * t * 0.30, side * (0.10 + t * 0.24));
    B.push(g, col, emis * 0.35, [0, 0, flap * (0.4 + t * 0.5), y]);
  }
}

function addTail(B, col, o = {}) {
  const { len = 1.6, r = 0.12, y = 1.0, z = -1.5, ang = 0, segs = 4, phase = 0, emis = 0, curve = 0.4 } = o;
  let px = 0, py = y, pz = z;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const rr = r * (1 - t * 0.72);
    const step = len / segs;
    px += Math.sin(ang) * step;
    pz -= Math.cos(ang) * step;
    py += curve * step * (1 - t);
    const g = ellip(rr, rr, step * 0.62, 9);
    T(g, px, py, pz);
    B.push(g, col, emis * t, [0.10 + t * 0.26, phase + t * 2.2, 0, 0]);
  }
}

function addHead(B, col, accent, o = {}) {
  const {
    y = 1.5, z = 1.7, r = 0.42, kind = 'beast', eye = 2, eyeColor = accent,
    horn = 0, jaw = true, phase = 0,
  } = o;
  const anim = [0.05, phase, 0, 0];
  const g = ellip(r, r * 0.92, r * 1.32, 12);
  T(g, 0, y, z);
  B.push(g, col, 0, anim);
  // 吻部：往前收一截，头就不再是个鸡蛋
  const snout = ellip(r * 0.58, r * 0.50, r * 0.62, 10);
  T(snout, 0, y - r * 0.16, z + r * 1.10);
  B.push(snout, col, 0, anim);
  // 鼻头
  B.push(T(ellip(r * 0.20, r * 0.16, r * 0.14, 8), 0, y - r * 0.06, z + r * 1.60),
    [col[0] * 0.42, col[1] * 0.40, col[2] * 0.42], 0.0, anim);
  if (jaw) {
    const j = ellip(r * 0.62, r * 0.40, r * 0.94, 10);
    T(j, 0, y - r * 0.54, z + r * 0.48);
    B.push(j, col, 0, anim);
  }
  // 眉骨：压在眼上方，眼神立刻凶起来
  const eyes = eye === 1 ? [[0, 0]] : [[-r * 0.5, 0], [r * 0.5, 0]];
  for (const [ex] of eyes) {
    const brow = box(r * (eye === 1 ? 0.86 : 0.50), r * 0.16, r * 0.34, 1.0);
    T(brow, ex, y + r * 0.50, z + r * 0.86, -0.28, 0, ex > 0 ? -0.22 : (ex < 0 ? 0.22 : 0));
    B.push(brow, [col[0] * 0.66, col[1] * 0.64, col[2] * 0.66], 0.0, anim);
    // 眼白托底 + 发光瞳
    const socket = ellip(r * (eye === 1 ? 0.42 : 0.25), r * (eye === 1 ? 0.38 : 0.23), r * 0.12, 9);
    T(socket, ex, y + r * 0.22, z + r * 0.94);
    B.push(socket, [0.09, 0.08, 0.09], 0.0, anim);
    const e = ellip(r * (eye === 1 ? 0.32 : 0.18), r * (eye === 1 ? 0.28 : 0.16), r * 0.14, 9);
    T(e, ex, y + r * 0.22, z + r * 0.99);
    B.push(e, eyeColor, 1.0, anim);
  }
  // 角
  for (let i = 0; i < horn; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const hg = cone(r * 0.20, r * (1.1 + (i >> 1) * 0.4), 7, 0.8);
    T(hg, s * r * 0.52, y + r * 0.86 + (i >> 1) * 0.12, z - r * 0.24, -0.4, 0, s * 0.42);
    B.push(hg, accent, 0.12, anim);
    // 角根：一圈粗环，接口不再是硬插进去的
    B.push(T(ellip(r * 0.24, r * 0.12, r * 0.24, 9), s * r * 0.52, y + r * 0.78, z - r * 0.20), accent, 0.06, anim);
  }
}

/* ============================================================
   精细构件 —— 为四、五关及新增异兽而写
   要点：小体块一律用 blob（纬向段数可压到 4），铺陈一律用 box / cone，
   于是「细节多」不等于「顶点多」。
   ============================================================ */

// 低面数椭球：ellip 的纬向段数最少也有 9，拿来做小零件太亏
function blob(rx, ry, rz, w = 7, h = 5) {
  const g = sphere(1, w, h, 0.5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  g.computeVertexNormals();
  return g;
}
const putBox = (B, col, e, an, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
  B.push(T(box(w, h, d, 1.0), x, y, z, rx, ry, rz), col, e, an);
const putCone = (B, col, e, an, r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 5) =>
  B.push(T(cone(r, h, seg, 1.0), x, y, z, rx, ry, rz), col, e, an);
const putBlob = (B, col, e, an, rx, ry, rz, x, y, z, ax = 0, ay = 0, az = 0, w = 7, h = 5) =>
  B.push(T(blob(rx, ry, rz, w, h), x, y, z, ax, ay, az), col, e, an);
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const bone = [0.93, 0.90, 0.80];
const QING = [0.20, 0.78, 0.56];          // 青蛇之青
const BLOOD = [0.62, 0.07, 0.06];

// 躯干：沿 z 排一串体块，粗细由 profile(t) 给出。
// 颈、肩、胯、尾根的收放全在这条曲线上，剪影这才有起伏
function addTorso(B, col, o = {}) {
  const {
    z0 = 1.4, z1 = -1.4, y = 1.0, segs = 7, r = 0.5, wave = 0.05, phase = 0, emis = 0,
    flat = 1.0, tall = 1.0, rise = null, w = 9, h = 6, drop = 0,
    profile = (t) => 1 - Math.pow(Math.abs(t - 0.40) * 1.55, 1.8) * 0.42,
  } = o;
  const step = Math.abs(z1 - z0) / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const rr = r * profile(t);
    const z = lerp(z0, z1, t);
    const yy = y + (rise ? rise(t) : 0) - drop * t * t;
    putBlob(B, col, emis, [wave * (0.35 + t * 0.9), phase + t * 1.5, 0, 0],
      rr * flat, rr * tall, step * 0.78 + rr * 0.22, 0, yy, z, 0, 0, 0, w, h);
  }
}

// 兽足：髀、股、膝、胫、跖、趾爪。back=true 时膝向后折，前后肢站姿才错落
function addPaw(B, col, x, z, o = {}) {
  const {
    h = 1.0, r = 0.15, phase = 0, y = 1.0, swing = 0.18, back = false, emis = 0,
    toes = 3, claw = 0.55, clawCol = bone, hoof = 0, hip = 1.0, splay = 1.0,
  } = o;
  const A = (m) => [swing * m, phase, 0, 0];
  const s = back ? -1 : 1;
  const ky = y - h * 0.44, ay = y - h * 0.84, fy = y - h;
  const kz = z + s * r * 1.15, az = z - s * r * 0.45;
  if (hip > 0) putBlob(B, col, emis, A(0.3), r * 1.7 * hip, r * 1.95 * hip, r * 1.9 * hip, x, y + h * 0.05, z, 0, 0, 0, 7, 4);
  B.push(beam(x, y, z, x, ky, kz, r * 1.5, r * 1.55, 0.8), col, emis, A(0.7));
  putBlob(B, col, emis, A(0.95), r * 0.92, r * 0.92, r * 1.0, x, ky, kz, 0, 0, 0, 6, 4);
  B.push(beam(x, ky, kz, x, ay, az, r * 1.02, r * 1.08, 0.8), col, emis, A(1.1));
  putBlob(B, col, emis, A(1.2), r * 0.72, r * 0.70, r * 0.78, x, ay, az, 0, 0, 0, 5, 4);
  if (hoof > 0) {
    // 蹄：一截厚圆台，羊马之属
    B.push(T(cyl(r * 1.10, r * 1.38, h * 0.18, 6, 0.9), x, fy + h * 0.09, az + r * 0.18), clawCol, emis, A(1.3));
    putBox(B, shade(clawCol, 0.72), 0, A(1.32), r * 0.16, h * 0.16, r * 1.5, x, fy + h * 0.09, az + r * 0.22);
    return;
  }
  putBox(B, col, emis, A(1.25), r * 2.0 * splay, r * 0.72, r * 2.2, x, fy + r * 0.42, az + r * 0.70, 0.06);
  for (let i = 0; i < toes; i++) {
    const tx = x + (i - (toes - 1) / 2) * r * 0.98 * splay;
    putBox(B, col, emis, A(1.3), r * 0.62 * splay, r * 0.52, r * 1.20, tx, fy + r * 0.36, az + r * 1.76, 0.05);
    if (claw > 0) putCone(B, clawCol, 0.05, A(1.34), r * 0.26, r * claw * 2.2, tx, fy + r * 0.20, az + r * 2.48, Math.PI / 2.1, 0, 0, 4);
  }
}

// 禽足：胫、跗跖，三前一后四趾，末端利爪
function addBirdClaw(B, col, x, z, o = {}) {
  const { y = 1.4, h = 1.1, r = 0.10, phase = 0, swing = 0.12, clawCol = bone, emis = 0, grip = 1.0 } = o;
  const A = (m) => [swing * m, phase, 0, 0];
  const ky = y - h * 0.46, fy = y - h;
  putBlob(B, col, emis, A(0.3), r * 2.2, r * 2.5, r * 2.2, x, y + h * 0.06, z, 0, 0, 0, 6, 4);
  B.push(beam(x, y, z, x, ky, z + r * 1.4, r * 1.9, r * 1.9, 0.8), col, emis, A(0.7));
  putBlob(B, col, emis, A(0.95), r * 1.0, r * 1.0, r * 1.1, x, ky, z + r * 1.4, 0, 0, 0, 5, 4);
  B.push(beam(x, ky, z + r * 1.4, x, fy + r * 0.4, z - r * 0.5, r * 1.0, r * 1.0, 0.8), shade(col, 0.8), emis, A(1.05));
  for (const [ox, oz, ln] of [[-1.0, 1.0, 1.0], [0, 1.35, 1.15], [1.0, 1.0, 1.0], [0, -1.0, 0.8]]) {
    const tx = x + ox * r * 1.1, tz = z - r * 0.5 + oz * r * 1.6 * grip;
    putBox(B, shade(col, 0.82), emis, A(1.2), r * 0.6, r * 0.55, r * 2.2 * ln, tx, fy + r * 0.34, tz, 0.1, ox * 0.28, 0);
    putCone(B, clawCol, 0.06, A(1.25), r * 0.28, r * 1.6 * ln, tx + ox * r * 0.42, fy + r * 0.02, tz + oz * r * 1.35,
      (oz > 0 ? 1 : -1) * Math.PI / 1.7, ox * 0.28, 0, 4);
  }
}

// 人面：脸盘 / 额颧 / 眉弓 / 双目 / 鼻 / 唇 / 颌。
// 凡「人面」之兽皆用它；lite 供开明兽那样一口气九张脸的场合
function addFace(B, skin, o = {}) {
  const {
    x = 0, y = 2.0, z = 1.6, r = 0.42, anim = [0.05, 0, 0, 0], eye = [1.0, 0.90, 0.40],
    emis = 0.05, lite = false, yaw = 0, hair = 0, hairCol = null, beard = 0,
  } = o;
  const dk = shade(skin, 0.44);
  putBlob(B, skin, emis, anim, r, r * 1.20, r * 0.80, x, y, z, 0, yaw, 0, lite ? 8 : 9, lite ? 5 : 6);
  for (const s of [-1, 1])
    putBox(B, dk, 0, anim, r * 0.52, r * 0.14, r * 0.30, x + s * r * 0.40, y + r * 0.40, z + r * 0.60, -0.20, yaw, -s * 0.22);
  for (const s of [-1, 1]) {
    if (!lite) putBlob(B, [0.07, 0.07, 0.08], 0, anim, r * 0.26, r * 0.17, r * 0.10, x + s * r * 0.40, y + r * 0.18, z + r * 0.64, 0, yaw, 0, 6, 4);
    putBlob(B, eye, 1.0, anim, r * 0.16, r * 0.13, r * 0.10, x + s * r * 0.40, y + r * 0.18, z + r * 0.70, 0, yaw, 0, 5, 4);
  }
  putBox(B, skin, emis, anim, r * 0.20, r * 0.46, r * 0.24, x, y - r * 0.02, z + r * 0.68, 0.20, yaw, 0);
  putBox(B, dk, 0, anim, r * 0.50, r * 0.12, r * 0.14, x, y - r * 0.50, z + r * 0.62, 0, yaw, 0);
  if (!lite) {
    putBox(B, skin, emis, anim, r * 1.32, r * 0.40, r * 0.44, x, y + r * 0.72, z + r * 0.20, -0.26, yaw, 0);
    for (const s of [-1, 1])
      putBlob(B, skin, emis, anim, r * 0.30, r * 0.30, r * 0.24, x + s * r * 0.62, y + r * 0.06, z + r * 0.42, 0, yaw, 0, 6, 4);
    putBox(B, skin, emis, anim, r * 0.56, r * 0.10, r * 0.16, x, y - r * 0.42, z + r * 0.62, -0.12, yaw, 0);
    putBox(B, skin, emis, anim, r * 0.50, r * 0.10, r * 0.16, x, y - r * 0.60, z + r * 0.60, 0.14, yaw, 0);
    putBlob(B, skin, emis, anim, r * 0.50, r * 0.34, r * 0.40, x, y - r * 0.78, z + r * 0.26, 0, yaw, 0, 7, 5);
    putBlob(B, skin, emis, anim, r * 0.14, r * 0.12, r * 0.12, x, y - r * 0.22, z + r * 0.78, 0, yaw, 0, 5, 4);
  }
  for (let i = 0; i < hair; i++) {
    const t = hair > 1 ? i / (hair - 1) : 0.5;
    putCone(B, hairCol || shade(skin, 0.66), emis + 0.10, anim, r * 0.15, r * (0.55 + Math.sin(t * Math.PI) * 0.60),
      x + (t - 0.5) * r * 1.55, y + r * 1.22, z - r * 0.12, -0.34, yaw, (t - 0.5) * 1.0, 4);
  }
  for (let i = 0; i < beard; i++) {
    const t = beard > 1 ? i / (beard - 1) : 0.5;
    putCone(B, hairCol || shade(skin, 0.55), emis, anim, r * 0.11, r * (0.5 + Math.cos(t * Math.PI) * 0.3),
      x + (t - 0.5) * r * 1.0, y - r * 1.05, z + r * 0.34, Math.PI - 0.3, yaw, (t - 0.5) * 0.6, 4);
  }
}

// 鸟翼（低面数）：肩肘腕三折的骨、一列飞羽、一列覆羽
function addPinion(B, col, side, o = {}) {
  const {
    span = 2.4, chord = 1.1, y = 1.6, z = 0.1, flap = 0.6, emis = 0, n = 8,
    tilt = 0.12, tipCol = null, droop = 0.20, boneCol = null,
  } = o;
  const arm = (t) => [side * span * t, y + Math.sin(t * Math.PI * 0.86) * span * 0.20 - t * t * span * droop, z - t * chord * 0.34];
  for (let i = 0; i < 3; i++) {
    const p = arm(i / 3), q = arm((i + 1) / 3), rr = 0.11 - i * 0.022;
    B.push(beam(p[0], p[1], p[2], q[0], q[1], q[2], rr * span * 0.7, rr * span * 0.7, 0.8),
      boneCol || col, emis * 0.3, [0, 0, flap * (0.32 + i * 0.30), y]);
  }
  for (const t of [0.34, 0.70]) {
    const p = arm(t);
    putBlob(B, boneCol || col, emis * 0.3, [0, 0, flap * (0.4 + t * 0.6), y], span * 0.055, span * 0.05, span * 0.06, p[0], p[1], p[2], 0, 0, 0, 6, 4);
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = arm(t);
    const len = chord * (0.70 + 0.90 * Math.sin(Math.PI * (0.20 + t * 0.76)));
    putBox(B, (tipCol && t > 0.70) ? tipCol : col, emis * (0.35 + t * 0.65), [0, 0, flap * (0.55 + t * 0.85), y],
      span / n * 1.30, 0.045 * span, len, p[0], p[1] - span * 0.03 - t * chord * 0.12, p[2] - len * 0.44,
      tilt + 0.15 + t * 0.22, side * t * 0.44, side * (0.08 + t * 0.30));
  }
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5 * 0.76, p = arm(t);
    putBox(B, col, emis * 0.35, [0, 0, flap * (0.4 + t * 0.5), y],
      span * 0.17, 0.05 * span, chord * 0.40, p[0], p[1] + span * 0.03, p[2] - chord * 0.16,
      tilt + 0.08, side * t * 0.30, side * (0.10 + t * 0.24));
  }
}

// 薄翅：一根前缘脉、两片膜、几条翅脉。玄蜂与肥遗的翅
function addMembraneWing(B, col, side, o = {}) {
  const { span = 1.4, chord = 0.5, y = 1.4, z = 0.2, flap = 0.9, emis = 0.05, sweep = -0.45, tilt = 0.12 } = o;
  const tx = side * span, tz = z + sweep * span;
  const A = (m) => [0, 0, flap * m, y];
  B.push(beam(side * span * 0.06, y, z, tx, y + span * 0.10, tz, span * 0.05, span * 0.05, 0.8), shade(col, 0.7), emis, A(0.6));
  for (let i = 0; i < 2; i++) {
    const t = 0.3 + i * 0.42;
    putBox(B, col, emis, A(0.6 + t * 0.7), span * 0.62, 0.018 * span, chord * (1.0 - i * 0.25),
      side * span * t, y + span * 0.06 - i * span * 0.05, z + sweep * span * t - chord * 0.22,
      tilt, side * 0.30, side * (0.10 + i * 0.16));
  }
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const ax = side * span * t, ay = y + span * (0.09 - t * 0.04), az = z + sweep * span * t;
    B.push(beam(ax, ay, az, ax + side * span * 0.16, ay - span * 0.02, az - chord * 0.55, span * 0.022, span * 0.022, 0.8),
      shade(col, 0.75), emis, A(0.8 + t * 0.6));
  }
}

// 青蛇：一条缠绕的小蛇，头有目有信。奢比尸珥两蛇、禺彊珥两蛇践两蛇皆用它
function addSnake(B, o = {}) {
  const {
    segs = 6, r = 0.10, col = QING, emis = 0.30, phase = 0, sway = 0.34,
    eye = [1.0, 0.86, 0.28],
    path = (t) => [Math.sin(t * 3.6) * 0.26, 1.40 - t * 0.90, 1.30 + Math.cos(t * 2.4) * 0.20],
  } = o;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const p = path(t), rr = r * (1 - t * 0.30);
    putBlob(B, i % 2 ? shade(col, 0.78) : col, emis, [sway * (0.30 + t), phase + t * 2.6, 0, 0],
      rr, rr, rr * 1.55, p[0], p[1], p[2], 0, 0, 0, 5, 4);
  }
  const p1 = path(1.0), p0 = path(0.86);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz) || 1e-4);
  const an = [sway * 1.35, phase + 2.6, 0, 0];
  const at = (g) => B.push(T(g, p1[0], p1[1], p1[2], pitch, yaw, 0), col, emis, an);
  at(T(blob(r * 1.25, r * 1.00, r * 1.90, 6, 4), 0, 0, r * 1.5));
  at(T(box(r * 1.9, r * 0.5, r * 2.2, 1.0), 0, -r * 0.72, r * 1.6));
  for (const s of [-1, 1])
    B.push(T(T(blob(r * 0.46, r * 0.42, r * 0.36, 4, 3), s * r * 0.85, r * 0.42, r * 1.9),
      p1[0], p1[1], p1[2], pitch, yaw, 0), eye, 1.0, an);
  B.push(T(T(box(r * 0.22, r * 0.14, r * 1.5, 1.0), 0, -r * 0.55, r * 3.4), p1[0], p1[1], p1[2], pitch, yaw, 0),
    [0.85, 0.16, 0.20], 0.35, [sway * 1.7, phase + 3.2, 0, 0]);
}

/* ============================================================
   各兽形制
   ============================================================ */
const SHAPES = {
  // 讙：状如狸，一目三尾
  huan(B, c, a) {
    addSpine(B, c, { len: 2.2, r: 0.42, segs: 5, y: 0.86, taper: 0.55, wave: 0.05 });
    for (const [x, z, ph] of [[-0.34, 0.72, 0], [0.34, 0.72, 3.1], [-0.34, -0.62, 3.1], [0.34, -0.62, 0]])
      addLeg(B, c, x, z, { h: 0.86, r: 0.11, phase: ph, y: 0.86, swing: 0.19 });
    addHead(B, c, a, { y: 1.12, z: 1.28, r: 0.36, eye: 1, eyeColor: [1.0, 0.72, 0.2] });
    addEars(B, c, { y: 1.36, z: 1.16, r: 0.12, spread: 0.20, len: 0.40, tilt: 0.24 });
    addRidge(B, a, { from: 1.0, to: -0.9, y: 1.14, h: 0.20, n: 6, emis: 0.16 });
    for (let i = 0; i < 3; i++)
      addTail(B, c, { len: 1.6, r: 0.11, y: 0.96, z: -1.05, ang: (i - 1) * 0.44, phase: i * 1.7, curve: 0.55, emis: 0.12 });
  },
  // 猰貐：龙首兽身
  yayu(B, c, a) {
    addSpine(B, c, { len: 3.0, r: 0.60, segs: 6, y: 1.06, taper: 0.5, wave: 0.05 });
    for (const [x, z, ph] of [[-0.48, 1.0, 0], [0.48, 1.0, 3.1], [-0.48, -0.9, 3.1], [0.48, -0.9, 0]])
      addLeg(B, c, x, z, { h: 1.06, r: 0.16, phase: ph, y: 1.06, swing: 0.2 });
    const neck = cyl(0.28, 0.36, 0.8, 7, 0.6);
    T(neck, 0, 1.5, 1.5, 0.5, 0, 0);
    B.push(neck, c, 0, [0.06, 0, 0, 0]);
    addHead(B, c, a, { y: 1.86, z: 1.92, r: 0.44, horn: 2, eyeColor: [1.0, 0.5, 0.2] });
    addRidge(B, a, { from: 1.5, to: -1.4, y: 1.55, h: 0.32, n: 9, emis: 0.14 });
    addTail(B, c, { len: 2.0, r: 0.17, y: 1.1, z: -1.5, curve: 0.2 });
  },
  // 蠃鱼：鱼身鸟翼
  luoyu(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.52, segs: 6, y: 1.1, taper: 0.32, wave: 0.14 });
    addWing(B, a, -1, { span: 2.0, chord: 0.9, y: 1.42, z: 0.2, flap: 0.5, emis: 0.14 });
    addWing(B, a, 1, { span: 2.0, chord: 0.9, y: 1.42, z: 0.2, flap: 0.5, emis: 0.14 });
    addHead(B, c, a, { y: 1.22, z: 1.5, r: 0.38, jaw: true, eyeColor: [0.7, 1.0, 1.0] });
    // 尾鳍
    const f = box(0.06, 1.0, 0.9, 0.8);
    T(f, 0, 1.15, -1.5, 0, 0, 0);
    B.push(f, a, 0.14, [0.3, 2.0, 0, 0]);
    for (const [x, z, ph] of [[-0.30, 0.5, 0], [0.30, 0.5, 3.1]])
      addLeg(B, c, x, z, { h: 0.7, r: 0.09, phase: ph, y: 1.0, swing: 0.24 });
  },
  // 鵸鵌：三首六尾之鸟
  qitu(B, c, a) {
    addSpine(B, c, { len: 1.6, r: 0.40, segs: 4, y: 1.5, taper: 0.6, wave: 0.04 });
    addWing(B, c, -1, { span: 2.4, chord: 1.0, y: 1.62, z: 0.0, flap: 0.75, emis: 0.09 });
    addWing(B, c, 1, { span: 2.4, chord: 1.0, y: 1.62, z: 0.0, flap: 0.75, emis: 0.09 });
    for (let i = 0; i < 3; i++) {
      const s = (i - 1) * 0.36;
      addHead(B, c, a, { y: 1.62 + Math.abs(s) * 0.1, z: 1.0, r: 0.24, jaw: false, phase: i * 2.0, eyeColor: [1, 0.9, 0.4] });
      const nk = cyl(0.09, 0.13, 0.5, 6, 0.8);
      T(nk, s, 1.62, 0.78, 0.7, 0, -s * 0.7);
      B.push(nk, c, 0, [0.06, i * 2.0, 0, 0]);
    }
    for (let i = 0; i < 6; i++)
      addTail(B, c, { len: 1.0, r: 0.07, y: 1.5, z: -0.75, ang: (i - 2.5) * 0.28, phase: i * 1.1, emis: 0.25, curve: 0.2 });
  },
  // 毕方：一足赤火之鸟
  bifang(B, c, a) {
    addSpine(B, c, { len: 1.7, r: 0.44, segs: 4, y: 1.6, taper: 0.5, wave: 0.05 });
    addWing(B, c, -1, { span: 2.9, chord: 1.3, y: 1.72, z: 0.0, flap: 0.68, emis: 0.22 });
    addWing(B, c, 1, { span: 2.9, chord: 1.3, y: 1.72, z: 0.0, flap: 0.68, emis: 0.22 });
    const nk = cyl(0.11, 0.17, 0.9, 6, 0.8);
    T(nk, 0, 1.95, 0.8, 0.85, 0, 0);
    B.push(nk, c, 0.1, [0.07, 0, 0, 0]);
    addHead(B, c, a, { y: 2.22, z: 1.2, r: 0.26, jaw: false, eyeColor: [1, 0.85, 0.3] });
    const beak = cone(0.10, 0.5, 6, 0.9);
    T(beak, 0, 2.2, 1.5, Math.PI / 2, 0, 0);
    B.push(beak, a, 0.22, [0.07, 0, 0, 0]);
    addLeg(B, a, 0, -0.1, { h: 1.5, r: 0.10, phase: 0, y: 1.5, swing: 0.10 });
    for (let i = 0; i < 4; i++)
      addTail(B, a, { len: 1.5, r: 0.08, y: 1.55, z: -0.85, ang: (i - 1.5) * 0.22, phase: i * 1.4, emis: 0.32, curve: 0.1 });
  },
  // 化蛇：人面豺身，蛇尾
  huashe(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.50, segs: 6, y: 1.0, taper: 0.42, wave: 0.08 });
    for (const [x, z, ph] of [[-0.38, 0.85, 0], [0.38, 0.85, 3.1], [-0.38, -0.7, 3.1], [0.38, -0.7, 0]])
      addLeg(B, c, x, z, { h: 1.0, r: 0.12, phase: ph, y: 1.0, swing: 0.2 });
    // 人面
    const f = ellip(0.34, 0.42, 0.26, 9);
    T(f, 0, 1.5, 1.42);
    B.push(f, a, 0.05, [0.05, 0, 0, 0]);
    for (const ex of [-0.14, 0.14]) {
      const e = ellip(0.07, 0.05, 0.05, 6);
      T(e, ex, 1.58, 1.64);
      B.push(e, [0.1, 0.9, 1.0], 1.0, [0.05, 0, 0, 0]);
    }
    addTail(B, c, { len: 2.4, r: 0.16, y: 1.05, z: -1.3, segs: 6, curve: 0.35, emis: 0.15 });
  },
  // 相柳：九首蛇身
  xiangliu(B, c, a) {
    addSpine(B, c, { len: 3.4, r: 0.70, segs: 7, y: 0.95, taper: 0.34, wave: 0.14, rise: 0.3 });
    for (let i = 0; i < 9; i++) {
      const ang = (i - 4) * 0.20;
      const rise = 1.0 + Math.cos((i - 4) * 0.5) * 0.55;
      const nx = Math.sin(ang) * 1.1, nz = 1.5 + Math.cos(ang) * 0.35;
      const nk = cyl(0.11, 0.19, 1.5 + rise * 0.4, 6, 0.8);
      T(nk, nx * 0.5, 1.3 + rise * 0.5, nz * 0.55, 0.6, 0, -ang * 1.2);
      B.push(nk, c, 0, [0.16, i * 0.8, 0, 0]);
      addHead(B, c, a, {
        y: 1.55 + rise * 0.9, z: nz, r: 0.22, jaw: false, phase: i * 0.8,
        eyeColor: [0.5, 1.0, 0.8],
      });
    }
    addTail(B, c, { len: 2.2, r: 0.22, y: 1.0, z: -1.8, segs: 5, curve: 0.25, emis: 0.2 });
  },
  // 九尾狐
  jiuwei(B, c, a) {
    addSpine(B, c, { len: 2.5, r: 0.46, segs: 6, y: 1.0, taper: 0.5, wave: 0.06 });
    for (const [x, z, ph] of [[-0.36, 0.85, 0], [0.36, 0.85, 3.1], [-0.36, -0.7, 3.1], [0.36, -0.7, 0]])
      addLeg(B, c, x, z, { h: 1.0, r: 0.11, phase: ph, y: 1.0, swing: 0.2 });
    addHead(B, c, a, { y: 1.32, z: 1.44, r: 0.34, eyeColor: [1.0, 0.85, 0.3] });
    addEars(B, c, { y: 1.58, z: 1.30, r: 0.13, spread: 0.21, len: 0.38, tilt: 0.18 });
    for (let i = 0; i < 9; i++)
      addTail(B, a, {
        len: 2.0, r: 0.13, y: 1.15, z: -1.2, ang: (i - 4) * 0.24,
        phase: i * 0.9, emis: 0.22, curve: 0.55, segs: 5,
      });
  },
  // 饕餮：巨口无厌
  taotie(B, c, a) {
    addSpine(B, c, { len: 3.4, r: 0.95, segs: 6, y: 1.5, taper: 0.62, wave: 0.04 });
    for (const [x, z, ph] of [[-0.76, 1.1, 0], [0.76, 1.1, 3.1], [-0.76, -1.0, 3.1], [0.76, -1.0, 0]])
      addLeg(B, c, x, z, { h: 1.5, r: 0.26, phase: ph, y: 1.5, swing: 0.16 });
    // 巨首
    const h = ellip(0.86, 0.78, 0.9, 10);
    T(h, 0, 1.9, 1.85);
    B.push(h, c, 0, [0.04, 0, 0, 0]);
    // 大口
    const m = ellip(0.66, 0.36, 0.5, 9);
    T(m, 0, 1.55, 2.35);
    B.push(m, a, 0.40, [0.04, 0, 0, 0]);
    for (let i = 0; i < 7; i++) {
      const tx = (i - 3) * 0.17;
      const tth = cone(0.07, 0.28, 5, 1.0);
      T(tth, tx, 1.62, 2.5, Math.PI, 0, 0);
      B.push(tth, [0.95, 0.92, 0.82], 0.1, [0.04, 0, 0, 0]);
    }
    for (const s of [-1, 1]) {
      const hn = cone(0.18, 1.1, 6, 0.7);
      T(hn, s * 0.6, 2.6, 1.7, -0.5, 0, s * 0.7);
      B.push(hn, a, 0.15, [0.04, 0, 0, 0]);
      // 腋下之目
      const e = ellip(0.16, 0.14, 0.08, 7);
      T(e, s * 0.92, 1.55, 0.9, 0, s * 0.5, 0);
      B.push(e, [1.0, 0.55, 0.15], 1.0, [0.04, 0, 0, 0]);
    }
    addTail(B, c, { len: 1.6, r: 0.24, y: 1.5, z: -1.8, curve: 0.1 });
  },
  // 帝江：浑敦无面，六足四翼
  dijiang(B, c, a) {
    const body = ellip(1.15, 1.05, 1.1, 12);
    T(body, 0, 1.5, 0);
    B.push(body, c, 0.05, [0.10, 0, 0, 0]);
    const glow = ellip(0.75, 0.68, 0.72, 10);
    T(glow, 0, 1.5, 0.5);
    B.push(glow, a, 0.24, [0.10, 0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1;
      const k = i % 3;
      addLeg(B, c, s * 0.72, (k - 1) * 0.72, { h: 1.15, r: 0.13, phase: i * 1.05, y: 1.15, swing: 0.22 });
    }
    for (const s of [-1, 1]) {
      addWing(B, a, s, { span: 1.9, chord: 0.9, y: 2.0, z: 0.35, flap: 0.6, emis: 0.20 });
      addWing(B, a, s, { span: 1.5, chord: 0.7, y: 1.7, z: -0.55, flap: 0.7, emis: 0.17 });
    }
  },
  // 穷奇：虎而有翼
  qiongqi(B, c, a) {
    addSpine(B, c, { len: 3.4, r: 0.72, segs: 6, y: 1.5, taper: 0.5, wave: 0.05 });
    for (const [x, z, ph] of [[-0.58, 1.2, 0], [0.58, 1.2, 3.1], [-0.58, -1.05, 3.1], [0.58, -1.05, 0]])
      addLeg(B, c, x, z, { h: 1.5, r: 0.20, phase: ph, y: 1.5, swing: 0.18 });
    addHead(B, c, a, { y: 1.86, z: 2.0, r: 0.56, horn: 2, eyeColor: [1.0, 0.35, 0.2] });
    addEars(B, c, { y: 2.16, z: 1.86, r: 0.15, spread: 0.34, len: 0.44, tilt: 0.14 });
    addRidge(B, a, { from: 1.6, to: -1.7, y: 2.1, h: 0.30, n: 8, emis: 0.2 });
    for (let i = 0; i < 6; i++) {
      const tth = cone(0.06, 0.24, 5, 1.0);
      T(tth, (i - 2.5) * 0.14, 1.66, 2.44, Math.PI, 0, 0);
      B.push(tth, [0.95, 0.92, 0.84], 0.1, [0.05, 0, 0, 0]);
    }
    addWing(B, a, -1, { span: 3.0, chord: 1.30, y: 2.00, z: 0.35, flap: 0.42, emis: 0.12 });
    addWing(B, a, 1, { span: 3.0, chord: 1.30, y: 2.00, z: 0.35, flap: 0.42, emis: 0.12 });
    addTail(B, c, { len: 2.4, r: 0.19, y: 1.6, z: -1.8, curve: 0.3, segs: 5 });
  },
  // 夔：苍身一足之牛
  kuifu(B, c, a) {
    addSpine(B, c, { len: 4.0, r: 1.05, segs: 6, y: 2.0, taper: 0.6, wave: 0.05 });
    addLeg(B, c, 0, 0.3, { h: 2.0, r: 0.44, phase: 0, y: 2.0, swing: 0.10 });
    addHead(B, c, a, { y: 2.4, z: 2.3, r: 0.74, jaw: true, eyeColor: [0.5, 0.9, 1.0] });
    for (const s of [-1, 1]) {
      const hn = cone(0.14, 0.9, 6, 0.8);
      T(hn, s * 0.5, 3.0, 2.1, -0.3, 0, s * 0.9);
      B.push(hn, a, 0.18, [0.04, 0, 0, 0]);
    }
    // 雷纹
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r2 = box(0.12, 0.5, 0.12, 1.0);
      T(r2, Math.sin(i * 2.1) * 0.7, 2.7 + Math.sin(i * 1.3) * 0.3, lerp(1.6, -1.8, t), 0, 0, Math.sin(i) * 0.9);
      B.push(r2, [0.6, 0.9, 1.0], 0.55, [0.10, i * 0.8, 0, 0]);
    }
    addTail(B, c, { len: 2.0, r: 0.26, y: 2.0, z: -2.1, curve: 0.2 });
  },
  // 烛龙：人面蛇身而赤
  zhulong(B, c, a) {
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const rr = lerp(1.15, 0.28, Math.pow(t, 0.85)) * (1 + Math.sin(t * 6) * 0.05);
      const z = lerp(2.2, -8.5, t);
      const y = 1.6 + Math.sin(t * Math.PI * 2.2) * 0.75;
      const g = ellip(rr * 1.05, rr, rr * 0.95, 10);
      T(g, Math.sin(t * Math.PI * 1.7) * 0.9, y, z);
      B.push(g, c, t < 0.2 ? 0.1 : 0.04, [0.12 + t * 0.5, t * 3.4, 0, 0]);
      if (i % 2 === 0 && i > 1) {
        const fin = box(0.08, rr * 1.5, rr * 0.9, 0.8);
        T(fin, Math.sin(t * Math.PI * 1.7) * 0.9, y + rr * 1.1, z, 0, 0, 0);
        B.push(fin, a, 0.30, [0.14 + t * 0.5, t * 3.4, 0, 0]);
      }
    }
    // 人面
    const f = ellip(0.95, 1.1, 0.7, 12);
    T(f, 0, 2.6, 2.75);
    B.push(f, a, 0.08, [0.06, 0, 0, 0]);
    for (const ex of [-0.36, 0.36]) {
      const e = ellip(0.2, 0.14, 0.12, 8);
      T(e, ex, 2.85, 3.28);
      B.push(e, [1.0, 0.9, 0.35], 1.0, [0.06, 0, 0, 0]);
    }
    for (const s of [-1, 1]) {
      const hn = cone(0.16, 1.5, 6, 0.7);
      T(hn, s * 0.62, 3.5, 2.5, -0.5, 0, s * 0.5);
      B.push(hn, a, 0.22, [0.06, 0, 0, 0]);
      const wh = box(0.06, 0.06, 1.9, 1.0);
      T(wh, s * 0.7, 2.5, 3.4, 0, s * 0.5, 0);
      B.push(wh, a, 0.42, [0.3, s * 2, 0, 0]);
    }
  },

  /* ============================================================
     二 · 炎火之山
     ============================================================ */
  // 狰：状如赤豹，五尾一角
  zheng(B, c, a) {
    addSpine(B, c, { len: 2.8, r: 0.52, segs: 6, y: 1.0, taper: 0.48, wave: 0.06 });
    for (const [x, z, ph] of [[-0.42, 0.92, 0], [0.42, 0.92, 3.1], [-0.42, -0.82, 3.1], [0.42, -0.82, 0]])
      addLeg(B, c, x, z, { h: 1.0, r: 0.14, phase: ph, y: 1.0, swing: 0.22 });
    addHead(B, c, a, { y: 1.30, z: 1.52, r: 0.40, eyeColor: [1.0, 0.55, 0.15] });
    addEars(B, c, { y: 1.56, z: 1.38, r: 0.12, spread: 0.24, len: 0.34, tilt: 0.20 });
    // 独角：额心一支，向前斜挑
    const hn = cone(0.13, 1.05, 6, 0.8);
    T(hn, 0, 1.72, 1.62, -0.62, 0, 0);
    B.push(hn, a, 0.28, [0.05, 0, 0, 0]);
    addRidge(B, a, { from: 1.3, to: -1.3, y: 1.42, h: 0.26, n: 8, emis: 0.26 });
    // 五尾
    for (let i = 0; i < 5; i++)
      addTail(B, a, {
        len: 1.9, r: 0.10, y: 1.10, z: -1.30, ang: (i - 2) * 0.34,
        phase: i * 1.3, emis: 0.34, curve: 0.42, segs: 5,
      });
  },
  // 鬿雀：状如鸡而白首，鼠足而虎爪
  qique(B, c, a) {
    addSpine(B, c, { len: 1.8, r: 0.44, segs: 4, y: 1.5, taper: 0.52, wave: 0.05 });
    addWing(B, c, -1, { span: 2.6, chord: 1.15, y: 1.66, z: 0.0, flap: 0.72, emis: 0.16 });
    addWing(B, c, 1, { span: 2.6, chord: 1.15, y: 1.66, z: 0.0, flap: 0.72, emis: 0.16 });
    const nk = cyl(0.12, 0.18, 0.8, 6, 0.8);
    T(nk, 0, 1.88, 0.76, 0.8, 0, 0);
    B.push(nk, c, 0, [0.06, 0, 0, 0]);
    // 白首
    addHead(B, [0.94, 0.92, 0.88], a, { y: 2.10, z: 1.16, r: 0.28, jaw: false, eyeColor: [1, 0.4, 0.2] });
    const beak = cone(0.11, 0.46, 6, 0.9);
    T(beak, 0, 2.06, 1.46, Math.PI / 2, 0, 0);
    B.push(beak, a, 0.20, [0.06, 0, 0, 0]);
    // 鸡冠
    for (let i = 0; i < 3; i++) {
      const g = cone(0.07, 0.24 - i * 0.04, 5, 1.0);
      T(g, 0, 2.34, 1.20 - i * 0.16);
      B.push(g, [0.86, 0.20, 0.14], 0.22, [0.06, 0, 0, 0]);
    }
    // 鼠足虎爪
    for (const [x, ph] of [[-0.24, 0], [0.24, 3.1]])
      addLeg(B, a, x, -0.05, { h: 1.28, r: 0.10, phase: ph, y: 1.42, swing: 0.14 });
    for (let i = 0; i < 3; i++)
      addTail(B, c, { len: 1.2, r: 0.08, y: 1.48, z: -0.92, ang: (i - 1) * 0.30, phase: i * 1.2, emis: 0.18, curve: 0.16 });
  },
  // 火鼠：生于火中，其毛可织
  huoshu(B, c, a) {
    addSpine(B, c, { len: 1.7, r: 0.34, segs: 5, y: 0.68, taper: 0.52, wave: 0.07 });
    for (const [x, z, ph] of [[-0.26, 0.56, 0], [0.26, 0.56, 3.1], [-0.26, -0.48, 3.1], [0.26, -0.48, 0]])
      addLeg(B, c, x, z, { h: 0.68, r: 0.085, phase: ph, y: 0.68, swing: 0.26 });
    addHead(B, c, a, { y: 0.86, z: 1.02, r: 0.27, eyeColor: [1.0, 0.75, 0.2] });
    addEars(B, c, { y: 1.08, z: 0.90, r: 0.13, spread: 0.17, len: 0.30, tilt: 0.10 });
    // 燃着的背毛
    addRidge(B, a, { from: 0.8, to: -0.8, y: 0.92, h: 0.22, n: 7, emis: 0.55 });
    addTail(B, a, { len: 1.5, r: 0.07, y: 0.72, z: -0.86, segs: 5, curve: 0.30, emis: 0.42 });
  },
  // 朱厌：状如猿，白首赤足
  zhuyan(B, c, a) {
    addSpine(B, c, { len: 2.4, r: 0.92, segs: 5, y: 2.30, taper: 0.72, wave: 0.04, rise: 0.2 });
    // 后腿短、前臂长，猿的比例
    for (const [x, ph] of [[-0.68, 0], [0.68, 3.1]])
      addLeg(B, a, x, -0.42, { h: 1.55, r: 0.26, phase: ph, y: 2.10, swing: 0.16 });
    for (const s of [-1, 1]) {
      // 长臂：肩 -> 肘 -> 拳，垂到地面
      B.push(beam(s * 0.86, 2.85, 0.30, s * 1.30, 1.70, 0.55, 0.24, 0.24, 0.7), c, 0, [0.20, s > 0 ? 0 : 3.1, 0, 0]);
      B.push(beam(s * 1.30, 1.70, 0.55, s * 1.42, 0.55, 0.85, 0.20, 0.20, 0.7), c, 0, [0.30, s > 0 ? 0 : 3.1, 0, 0]);
      B.push(T(ellip(0.34, 0.30, 0.36, 10), s * 1.44, 0.36, 0.92), c, 0, [0.34, s > 0 ? 0 : 3.1, 0, 0]);
    }
    // 白首
    addHead(B, [0.93, 0.91, 0.86], a, { y: 3.10, z: 1.10, r: 0.62, horn: 0, eyeColor: [1.0, 0.22, 0.12] });
    addEars(B, [0.93, 0.91, 0.86], { y: 3.24, z: 0.72, r: 0.20, spread: 0.58, len: 0.30, tilt: 0.0 });
    addRidge(B, a, { from: 1.2, to: -1.2, y: 2.90, h: 0.24, n: 6, emis: 0.18 });
  },

  /* ============================================================
     三 · 幽都寒渊
     ============================================================ */
  // 诸犍：豹身人首，牛耳一目，行则衔其尾
  zhujian(B, c, a) {
    addSpine(B, c, { len: 3.0, r: 0.56, segs: 6, y: 1.14, taper: 0.46, wave: 0.05 });
    for (const [x, z, ph] of [[-0.44, 1.0, 0], [0.44, 1.0, 3.1], [-0.44, -0.9, 3.1], [0.44, -0.9, 0]])
      addLeg(B, c, x, z, { h: 1.14, r: 0.16, phase: ph, y: 1.14, swing: 0.20 });
    // 人面：扁平的脸盘，独目
    const f = ellip(0.40, 0.48, 0.30, 10);
    T(f, 0, 1.72, 1.58);
    B.push(f, a, 0.04, [0.05, 0, 0, 0]);
    const eye = ellip(0.15, 0.13, 0.08, 9);
    T(eye, 0, 1.80, 1.84);
    B.push(eye, [0.7, 0.95, 1.0], 1.0, [0.05, 0, 0, 0]);
    // 牛耳
    for (const s of [-1, 1]) {
      const e = ellip(0.10, 0.24, 0.06, 8);
      T(e, s * 0.44, 1.82, 1.42, 0, 0, s * 0.7);
      B.push(e, c, 0, [0.05, 0, 0, 0]);
    }
    addRidge(B, a, { from: 1.4, to: -1.4, y: 1.58, h: 0.24, n: 8, emis: 0.16 });
    // 长尾：绕回身侧，像衔在口中
    addTail(B, c, { len: 3.0, r: 0.15, y: 1.18, z: -1.5, segs: 7, curve: 0.50, ang: 0.35, emis: 0.10 });
  },
  // 狡：状如犬而豹文，其角如牛
  jiao(B, c, a) {
    addSpine(B, c, { len: 2.2, r: 0.40, segs: 5, y: 0.92, taper: 0.52, wave: 0.06 });
    for (const [x, z, ph] of [[-0.32, 0.74, 0], [0.32, 0.74, 3.1], [-0.32, -0.64, 3.1], [0.32, -0.64, 0]])
      addLeg(B, c, x, z, { h: 0.92, r: 0.11, phase: ph, y: 0.92, swing: 0.24 });
    addHead(B, c, a, { y: 1.16, z: 1.30, r: 0.32, eyeColor: [0.85, 1.0, 0.6] });
    addEars(B, c, { y: 1.40, z: 1.18, r: 0.11, spread: 0.19, len: 0.32, tilt: 0.26 });
    // 牛角：向两侧弯出去
    for (const s of [-1, 1]) {
      const hn = cone(0.10, 0.72, 6, 0.8);
      T(hn, s * 0.28, 1.42, 1.08, -0.30, 0, s * 1.05);
      B.push(hn, a, 0.16, [0.05, 0, 0, 0]);
    }
    addTail(B, c, { len: 1.5, r: 0.10, y: 1.00, z: -1.0, curve: 0.48, segs: 4 });
  },
  // 寒鸮：玄羽白瞳，翼过处泉眼尽冻
  hanba(B, c, a) {
    addSpine(B, c, { len: 1.6, r: 0.46, segs: 4, y: 1.5, taper: 0.58, wave: 0.04 });
    addWing(B, a, -1, { span: 2.8, chord: 1.25, y: 1.62, z: 0.05, flap: 0.62, emis: 0.24 });
    addWing(B, a, 1, { span: 2.8, chord: 1.25, y: 1.62, z: 0.05, flap: 0.62, emis: 0.24 });
    // 鸮首：又圆又扁，面盘明显
    const h = ellip(0.42, 0.40, 0.34, 11);
    T(h, 0, 1.90, 0.86);
    B.push(h, c, 0, [0.05, 0, 0, 0]);
    for (const ex of [-0.17, 0.17]) {
      B.push(T(ellip(0.16, 0.16, 0.06, 9), ex, 1.94, 1.14), [0.92, 0.98, 1.0], 0.35, [0.05, 0, 0, 0]);
      B.push(T(ellip(0.075, 0.075, 0.05, 8), ex, 1.94, 1.19), [0.05, 0.06, 0.09], 0.0, [0.05, 0, 0, 0]);
    }
    const beak = cone(0.08, 0.28, 5, 0.9);
    T(beak, 0, 1.82, 1.20, Math.PI / 2.1, 0, 0);
    B.push(beak, a, 0.18, [0.05, 0, 0, 0]);
    // 角羽
    for (const s of [-1, 1]) {
      const g = cone(0.08, 0.34, 5, 1.0);
      T(g, s * 0.26, 2.22, 0.80, -0.2, 0, s * 0.42);
      B.push(g, c, 0.05, [0.05, 0, 0, 0]);
    }
    for (const [x, ph] of [[-0.20, 0], [0.20, 3.1]])
      addLeg(B, a, x, -0.05, { h: 0.86, r: 0.085, phase: ph, y: 1.36, swing: 0.10 });
    for (let i = 0; i < 3; i++)
      addTail(B, c, { len: 1.1, r: 0.09, y: 1.44, z: -0.82, ang: (i - 1) * 0.24, phase: i * 1.1, emis: 0.14, curve: 0.06 });
  },
  // 強良：衔蛇操蛇，虎首人身
  qiangliang(B, c, a) {
    // 人身：直立的躯干
    addSpine(B, c, { len: 2.2, r: 0.86, segs: 5, y: 2.60, taper: 0.66, wave: 0.05, rise: 0.15 });
    for (const [x, ph] of [[-0.62, 0], [0.62, 3.1]])
      addLeg(B, c, x, -0.10, { h: 2.30, r: 0.30, phase: ph, y: 2.40, swing: 0.18 });
    // 虎首
    addHead(B, c, a, { y: 3.44, z: 0.98, r: 0.70, horn: 0, eyeColor: [0.6, 0.95, 1.0] });
    addEars(B, c, { y: 3.76, z: 0.72, r: 0.17, spread: 0.42, len: 0.36, tilt: 0.10 });
    for (let i = 0; i < 6; i++) {
      const tth = cone(0.07, 0.26, 5, 1.0);
      T(tth, (i - 2.5) * 0.16, 3.20, 1.60, Math.PI, 0, 0);
      B.push(tth, [0.96, 0.94, 0.88], 0.12, [0.05, 0, 0, 0]);
    }
    // 双臂各操一蛇
    for (const s of [-1, 1]) {
      B.push(beam(s * 0.80, 3.10, 0.20, s * 1.55, 2.40, 0.70, 0.22, 0.22, 0.7), c, 0, [0.22, s > 0 ? 0 : 3.1, 0, 0]);
      // 蛇：一节节盘在手上
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const rr = 0.16 * (1 - t * 0.5);
        B.push(T(ellip(rr, rr, rr * 1.5, 8),
          s * (1.62 + Math.sin(t * 4.2) * 0.42), 2.34 - t * 0.20, 0.80 + t * 1.05),
          a, 0.34, [0.36 + t * 0.3, s * 2 + t * 3, 0, 0]);
      }
    }
    // 雷纹
    for (let i = 0; i < 7; i++) {
      const g = box(0.11, 0.44, 0.11, 1.0);
      T(g, Math.sin(i * 2.1) * 0.62, 3.0 + Math.sin(i * 1.3) * 0.5, 0.9 - i * 0.34, 0, 0, Math.sin(i) * 0.9);
      B.push(g, [0.62, 0.92, 1.0], 0.60, [0.12, i * 0.8, 0, 0]);
    }
  },

  /* ============================================================
     四 · 归墟海眼
     ============================================================ */
  // 陵鱼：人面手足鱼身，在海中 —— 侧扁鱼体前接人面人臂，后收尾柄张尾鳍
  lingyu(B, c, a) {
    const dk = shade(c, 0.60), lt = shade(c, 1.28), gill = shade(a, 0.85);
    // 鱼身：横截面侧扁（x 窄 y 高），肩阔而尾根急收
    addTorso(B, c, {
      z0: 1.10, z1: -1.35, y: 1.06, segs: 7, r: 0.54, wave: 0.10, flat: 0.70, tall: 1.18, w: 8, h: 5,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.22) * 1.42, 1.7) * 0.80,
    });
    // 尾柄：细而结实的两小截，尾鳍这才甩得动
    for (let i = 0; i < 2; i++)
      putBlob(B, dk, 0.02, [0.28 + i * 0.12, 2.0 + i * 0.6, 0, 0],
        0.11 - i * 0.02, 0.19 - i * 0.04, 0.20, 0, 1.08, -1.58 - i * 0.30, 0, 0, 0, 6, 4);
    // 人面：自鱼体前端探出，鬓边带一列鳍状短发
    addFace(B, a, {
      y: 1.48, z: 1.24, r: 0.30, emis: 0.07, eye: [0.30, 1.00, 0.92],
      anim: [0.07, 0, 0, 0], hair: 5, hairCol: lt,
    });
    // 鳃盖：一片弧甲压三道鳃缝
    for (const s of [-1, 1]) {
      putBox(B, gill, 0.10, [0.07, 0, 0, 0], 0.07, 0.44, 0.34, s * 0.31, 1.20, 0.86, 0, s * 0.42, s * 0.10);
      for (let i = 0; i < 3; i++)
        putBox(B, dk, 0, [0.07, 0, 0, 0], 0.05, 0.30 - i * 0.05, 0.05, s * 0.34, 1.18, 0.96 - i * 0.11, 0, s * 0.42, 0);
    }
    // 人臂：肩、上臂、肘、前臂、掌，掌上三指带蹼
    for (const s of [-1, 1]) {
      const ph = s > 0 ? 0 : 3.1;
      putBlob(B, a, 0.04, [0.14, ph, 0, 0], 0.16, 0.16, 0.16, s * 0.34, 1.16, 0.66, 0, 0, 0, 6, 4);
      B.push(beam(s * 0.34, 1.16, 0.66, s * 0.72, 0.92, 0.92, 0.13, 0.13, 0.8), a, 0.03, [0.24, ph, 0, 0]);
      putBlob(B, a, 0.03, [0.28, ph, 0, 0], 0.10, 0.10, 0.10, s * 0.72, 0.92, 0.92, 0, 0, 0, 5, 4);
      B.push(beam(s * 0.72, 0.92, 0.92, s * 0.90, 0.72, 1.14, 0.11, 0.11, 0.8), a, 0.03, [0.30, ph, 0, 0]);
      putBox(B, a, 0.05, [0.32, ph, 0, 0], 0.20, 0.07, 0.20, s * 0.92, 0.68, 1.22, 0.2, 0, 0);
      for (let i = -1; i <= 1; i++)
        putBox(B, a, 0.05, [0.34, ph, 0, 0], 0.06, 0.05, 0.20, s * 0.92 + i * 0.07, 0.66, 1.38, 0.25, i * 0.2, 0);
      // 蹼：指间一片薄膜
      putBox(B, lt, 0.16, [0.34, ph, 0, 0], 0.22, 0.02, 0.17, s * 0.92, 0.65, 1.36, 0.25, 0, 0);
    }
    // 腹下两足：短而带蹼，不出爪
    for (const s of [-1, 1])
      addPaw(B, c, s * 0.27, -0.42, { h: 0.94, r: 0.09, phase: s > 0 ? 0 : 3.1, y: 0.96, swing: 0.22, claw: 0, toes: 3, back: true, splay: 1.3 });
    // 背鳍：一列硬棘拉起鳍膜
    for (let i = 0; i < 8; i++) {
      const t = i / 7, z = lerp(1.05, -1.25, t);
      const hh = 0.34 * Math.sin(Math.PI * (0.20 + t * 0.78));
      const an = [0.08 + t * 0.22, t * 1.8, 0, 0];
      putCone(B, a, 0.28, an, 0.045, hh * 2.0, 0, 1.62 + hh * 0.6, z, -0.30, 0, 0, 4);
      if (i < 7) putBox(B, a, 0.18, an, 0.035, hh * 1.05, 0.30, 0, 1.56 + hh * 0.35, z - 0.16, -0.16, 0, 0);
    }
    // 胸鳍：三根鳍条撑开一片薄鳍
    for (const s of [-1, 1]) {
      const ph = s > 0 ? 1.0 : 4.1;
      putBox(B, a, 0.20, [0.24, ph, 0, 0], 0.42, 0.03, 0.36, s * 0.52, 1.00, 0.18, 0.1, s * 0.5, s * 0.5);
      for (let i = 0; i < 3; i++)
        putBox(B, lt, 0.24, [0.26 + i * 0.04, ph + i * 0.5, 0, 0], 0.40, 0.035, 0.05, s * 0.54, 1.00 + (i - 1) * 0.10, 0.18, 0.1, s * 0.5, s * 0.5);
    }
    // 臀鳍
    putBox(B, a, 0.18, [0.24, 2.4, 0, 0], 0.035, 0.30, 0.34, 0, 0.74, -1.00, 0.22, 0, 0);
    // 鳞列：两侧各两排小扁片，侧线压一道暗纹
    for (const s of [-1, 1])
      for (let r2 = 0; r2 < 2; r2++)
        for (let i = 0; i < 6; i++) {
          const t = i / 5, z = lerp(0.86, -1.10, t);
          const w2 = 0.44 - t * 0.22;
          putBox(B, r2 ? lt : shade(c, 1.10), 0.05, [0.10 + t * 0.24, t * 1.6, 0, 0],
            0.04, 0.17 * w2 / 0.34, 0.20, s * (0.30 - t * 0.14), 1.06 + (r2 ? 0.22 : -0.14), z, 0, s * 0.3, s * 0.2);
        }
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      putBox(B, dk, 0, [0.12 + t * 0.24, t * 1.6, 0, 0], 0.03, 0.05, 0.42, (i % 2 ? 1 : -1) * 0.31, 1.06, lerp(0.80, -1.06, t));
    }
    // 尾鳍：上下两叶分叉，中间三根鳍条
    for (const s of [-1, 1])
      putBox(B, a, 0.26, [0.42, 2.4, 0, 0], 0.045, 0.62, 0.62, 0, 1.10 + s * 0.42, -2.06, s * 0.42, 0, 0);
    for (let i = 0; i < 3; i++)
      putBox(B, lt, 0.30, [0.44, 2.5, 0, 0], 0.05, 0.05, 0.66, 0, 1.10 + (i - 1) * 0.36, -2.02, (i - 1) * 0.40, 0, 0);
  },
  // 奢比尸：兽身人面大耳，珥两青蛇 —— 肩高胯低，颈短头沉，两耳各盘一蛇
  shebishi(B, c, a) {
    const dk = shade(c, 0.62), lt = shade(c, 1.20);
    // 兽身：肩隆而腰收，胯又鼓起
    addTorso(B, c, {
      z0: 1.30, z1: -1.55, y: 1.42, segs: 7, r: 0.76, wave: 0.05, w: 9, h: 6,
      rise: (t) => Math.sin(t * Math.PI) * 0.10 - t * 0.10,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.30) * 1.7, 2) * 0.30 - t * 0.16,
    });
    // 肩胛与臀：两团鼓出来的肉，四足才像撑得住这身量
    for (const s of [-1, 1]) {
      putBlob(B, lt, 0, [0.05, 0, 0, 0], 0.30, 0.34, 0.42, s * 0.52, 1.72, 1.00, 0, 0, 0, 6, 4);
      putBlob(B, c, 0, [0.06, 1.4, 0, 0], 0.32, 0.34, 0.40, s * 0.50, 1.62, -0.98, 0, 0, 0, 6, 4);
    }
    for (const [x, z, ph, bk] of [[-0.60, 1.05, 0, false], [0.60, 1.05, 3.1, false], [-0.60, -0.98, 3.1, true], [0.60, -0.98, 0, true]])
      addPaw(B, c, x, z, { h: 1.42, r: 0.20, phase: ph, y: 1.42, swing: 0.18, back: bk, claw: 0.6 });
    // 颈：短而粗，人面直接坐在肩上
    putBlob(B, c, 0, [0.05, 0, 0, 0], 0.40, 0.40, 0.34, 0, 1.80, 1.46, 0.3, 0, 0, 7, 5);
    // 人面：宽额高颧，颌下三绺须
    addFace(B, a, {
      y: 2.02, z: 1.72, r: 0.46, emis: 0.05, eye: [1.00, 0.86, 0.32],
      anim: [0.05, 0, 0, 0], beard: 3, hairCol: dk,
    });
    // 大耳：一枚阔耳廓，内嵌耳窝与三道耳轮
    for (const s of [-1, 1]) {
      putBlob(B, c, 0, [0.05, 0, 0, 0], 0.09, 0.42, 0.30, s * 0.62, 2.10, 1.56, 0, s * 0.40, s * 0.28, 7, 5);
      putBox(B, shade(a, 0.72), 0.03, [0.05, 0, 0, 0], 0.05, 0.50, 0.30, s * 0.66, 2.10, 1.58, 0, s * 0.40, s * 0.28);
      for (let i = 0; i < 3; i++)
        putBox(B, dk, 0, [0.05, 0, 0, 0], 0.04, 0.10, 0.24 - i * 0.05, s * 0.69, 2.28 - i * 0.20, 1.58, 0, s * 0.40, s * 0.28);
      // 珥蛇：自耳廓垂下，尾梢缠在耳轮上
      addSnake(B, {
        segs: 6, r: 0.10, phase: s > 0 ? 0.4 : 2.6, sway: 0.36,
        path: (t) => [s * (0.72 + Math.sin(t * 3.8) * 0.24), 2.02 - t * 0.92, 1.52 + Math.cos(t * 2.6) * 0.24 + t * 0.30],
      });
    }
    // 甲片：背上两列扁甲，脊线一列棘
    for (const s of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        putBox(B, lt, 0.06, [0.05 + t * 0.14, t * 1.5, 0, 0], 0.22, 0.07, 0.26,
          s * (0.34 - t * 0.10), 2.02 - t * 0.16, lerp(1.20, -1.30, t), -0.16, 0, s * 0.55);
      }
    for (let i = 0; i < 8; i++) {
      const t = i / 7, hh = 0.24 * Math.sin(Math.PI * (0.2 + t * 0.78));
      putCone(B, a, 0.18, [0.05 + t * 0.16, t * 1.6, 0, 0], hh * 0.5, hh * 2.0, 0, 2.14 - t * 0.14 + hh * 0.6, lerp(1.30, -1.40, t), -0.32, 0, 0, 4);
    }
    // 尾：粗根渐收，末梢一撮硬毛
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      putBlob(B, c, 0, [0.14 + t * 0.26, 1.6 + t * 2.0, 0, 0], 0.19 - t * 0.11, 0.19 - t * 0.11, 0.26,
        Math.sin(t * 1.4) * 0.18, 1.46 + t * 0.14, -1.70 - t * 0.48, 0, 0, 0, 6, 4);
    }
    for (let i = 0; i < 3; i++)
      putCone(B, dk, 0.05, [0.42, 3.6, 0, 0], 0.06, 0.32, Math.sin(1.4) * 0.20 + (i - 1) * 0.07, 1.66, -3.30, -1.9, 0, (i - 1) * 0.4, 4);
  },
  // 鱄鱼：状如鲋而彘毛，振鳍而飞 —— 鲫形高身侧扁，背披猪鬃，胸鳍化翼
  zhuanyu(B, c, a) {
    const dk = shade(c, 0.58), lt = shade(c, 1.30);
    // 鲋体：又高又扁，背弓腹圆
    addTorso(B, c, {
      z0: 0.86, z1: -1.05, y: 1.50, segs: 6, r: 0.56, wave: 0.11, flat: 0.56, tall: 1.32, w: 8, h: 5,
      rise: (t) => Math.sin(t * Math.PI * 0.9) * 0.06,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.26) * 1.5, 1.6) * 0.72,
    });
    // 鱼头：额隆、吻钝、下唇厚，两颊各一枚鳃盖
    putBlob(B, c, 0, [0.08, 0, 0, 0], 0.32, 0.42, 0.34, 0, 1.56, 1.02, 0, 0, 0, 8, 5);
    putBlob(B, lt, 0.03, [0.08, 0, 0, 0], 0.22, 0.20, 0.22, 0, 1.44, 1.34, 0.2, 0, 0, 6, 4);
    putBox(B, dk, 0, [0.08, 0, 0, 0], 0.30, 0.09, 0.16, 0, 1.34, 1.42, 0.18);
    putBox(B, lt, 0.06, [0.08, 0, 0, 0], 0.26, 0.10, 0.14, 0, 1.26, 1.40, -0.22);
    for (const s of [-1, 1]) {
      // 大鱼眼：黑眶包着一枚亮瞳
      putBlob(B, [0.07, 0.06, 0.06], 0, [0.08, 0, 0, 0], 0.11, 0.11, 0.08, s * 0.22, 1.66, 1.20, 0, 0, 0, 6, 4);
      putBlob(B, [1.0, 0.80, 0.32], 1.0, [0.08, 0, 0, 0], 0.075, 0.075, 0.07, s * 0.23, 1.66, 1.25, 0, 0, 0, 5, 4);
      putBox(B, shade(a, 0.9), 0.10, [0.08, 0, 0, 0], 0.06, 0.36, 0.26, s * 0.28, 1.52, 0.94, 0, s * 0.36, s * 0.12);
      for (let i = 0; i < 2; i++)
        putBox(B, dk, 0, [0.08, 0, 0, 0], 0.04, 0.24, 0.05, s * 0.31, 1.50, 1.00 - i * 0.11, 0, s * 0.36, 0);
      // 口须
      putBox(B, dk, 0, [0.18, 1.0, 0, 0], 0.03, 0.03, 0.26, s * 0.12, 1.30, 1.50, 0.3, s * 0.5, 0);
    }
    // 彘毛：背脊一列硬鬃，两侧再各一列短鬃
    for (let i = 0; i < 10; i++) {
      const t = i / 9, hh = 0.34 * Math.sin(Math.PI * (0.16 + t * 0.80));
      putCone(B, a, 0.26, [0.08 + t * 0.22, t * 2.0, 0, 0], 0.05, hh * 2.0, 0, 1.94 + hh * 0.5, lerp(0.88, -1.02, t), -0.44, 0, 0, 4);
    }
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        putCone(B, shade(a, 0.85), 0.16, [0.08 + t * 0.20, t * 1.8, 0, 0], 0.04, 0.24,
          s * 0.14, 1.86 - t * 0.10, lerp(0.72, -0.86, t), -0.42, 0, s * 0.5, 4);
      }
    // 胸鳍当翼：三根鳍骨撑一片鳍膜，鳍条一列
    for (const s of [-1, 1])
      addPinion(B, a, s, {
        span: 1.95, chord: 0.90, y: 1.60, z: 0.22, flap: 0.90, emis: 0.24, n: 7, droop: 0.10, boneCol: lt,
      });
    // 腹鳍与臀鳍
    for (const s of [-1, 1])
      putBox(B, a, 0.20, [0.26, s > 0 ? 1.2 : 4.3, 0, 0], 0.04, 0.30, 0.26, s * 0.18, 1.14, 0.20, 0.3, 0, s * 0.6);
    putBox(B, a, 0.20, [0.28, 2.2, 0, 0], 0.04, 0.28, 0.24, 0, 1.10, -0.68, 0.24, 0, 0);
    // 鳞列：两侧各两排
    for (const s of [-1, 1])
      for (let r2 = 0; r2 < 2; r2++)
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          putBox(B, r2 ? lt : shade(c, 1.10), 0.05, [0.09 + t * 0.22, t * 1.7, 0, 0],
            0.035, 0.20, 0.18, s * (0.26 - t * 0.10), 1.50 + (r2 ? 0.24 : -0.20), lerp(0.66, -0.90, t), 0, s * 0.3, s * 0.2);
        }
    // 尾柄与叉形尾鳍
    for (let i = 0; i < 2; i++)
      putBlob(B, dk, 0.02, [0.30 + i * 0.14, 2.0 + i * 0.6, 0, 0], 0.10 - i * 0.02, 0.17 - i * 0.03, 0.16,
        0, 1.50, -1.22 - i * 0.24, 0, 0, 0, 6, 4);
    for (const s of [-1, 1])
      putBox(B, a, 0.28, [0.44, 2.4, 0, 0], 0.045, 0.52, 0.52, 0, 1.50 + s * 0.34, -1.86, s * 0.44, 0, 0);
    for (let i = 0; i < 3; i++)
      putBox(B, lt, 0.32, [0.46, 2.5, 0, 0], 0.05, 0.05, 0.56, 0, 1.50 + (i - 1) * 0.30, -1.84, (i - 1) * 0.42, 0, 0);
  },
  // 禺彊：北海之神，人面鸟身，珥两青蛇，践两青蛇
  yuqiang(B, c, a) {
    const dk = shade(c, 0.60), lt = shade(c, 1.30), QQ = [0.18, 0.80, 0.74];
    // 鸟身：胸膛前挺，腰以下急收
    addTorso(B, c, {
      z0: 0.95, z1: -1.55, y: 2.32, segs: 6, r: 0.98, wave: 0.05, w: 10, h: 6,
      rise: (t) => Math.sin(t * Math.PI * 0.8) * 0.14 - t * 0.30,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.22) * 1.5, 1.8) * 0.62,
    });
    // 胸羽：一层层叠瓦似的甲羽
    for (let r2 = 0; r2 < 3; r2++)
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        putBox(B, r2 % 2 ? lt : a, 0.10, [0.05, 0, 0, 0], 0.34, 0.07, 0.30,
          (t - 0.5) * 1.30, 2.62 - r2 * 0.40, 0.86 - Math.abs(t - 0.5) * 0.5 - r2 * 0.10, -0.34, (t - 0.5) * 0.7, 0);
      }
    // 背羽
    for (let i = 0; i < 8; i++) {
      const t = i / 7, hh = 0.30 * Math.sin(Math.PI * (0.2 + t * 0.78));
      putCone(B, a, 0.30, [0.05 + t * 0.16, t * 1.7, 0, 0], hh * 0.55, hh * 2.2, 0, 3.02 - t * 0.30 + hh * 0.6, lerp(0.80, -1.50, t), -0.36, 0, 0, 4);
    }
    // 双翼：北海之神，翼宽而下垂
    for (const s of [-1, 1])
      addPinion(B, a, s, { span: 3.5, chord: 1.5, y: 2.62, z: 0.24, flap: 0.42, emis: 0.22, n: 9, droop: 0.26, tipCol: lt, boneCol: c });
    // 颈：三节，外披一圈羽领
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      putBlob(B, c, 0, [0.05, 0, 0, 0], 0.34 - t * 0.06, 0.34 - t * 0.06, 0.30, 0, 2.80 + t * 0.36, 0.86 + t * 0.20, 0, 0, 0, 7, 4);
    }
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      putBox(B, lt, 0.18, [0.05, i * 0.4, 0, 0], 0.20, 0.06, 0.30,
        Math.cos(ang) * 0.46, 2.94 + Math.sin(ang) * 0.30, 0.92 - 0.10, -0.4, 0, ang);
    }
    // 人面：北海之神，玄冠水发，颌下垂须
    addFace(B, a, {
      y: 3.34, z: 1.26, r: 0.60, emis: 0.09, eye: [0.50, 1.00, 1.00],
      anim: [0.06, 0, 0, 0], hair: 7, hairCol: lt, beard: 5,
    });
    // 珥两青蛇：自面颊两侧垂落
    for (const s of [-1, 1])
      addSnake(B, {
        segs: 7, r: 0.13, col: QQ, emis: 0.36, phase: s > 0 ? 0.5 : 2.9, sway: 0.34,
        path: (t) => [s * (0.78 + Math.sin(t * 3.8) * 0.30), 3.28 - t * 1.30, 1.10 + Math.cos(t * 2.6) * 0.26 + t * 0.36],
      });
    // 践两青蛇：盘在脚下，头向前昂
    for (const s of [-1, 1])
      addSnake(B, {
        segs: 7, r: 0.15, col: QQ, emis: 0.30, phase: s > 0 ? 1.3 : 4.2, sway: 0.40,
        path: (t) => [s * (0.66 + Math.sin(t * 3.2) * 0.52), 0.17 + Math.pow(t, 3) * 0.72, 0.55 - t * 1.9],
      });
    // 鸟腿：粗壮，胫上覆羽，四趾抓地
    for (const s of [-1, 1])
      addBirdClaw(B, c, s * 0.58, -0.10, { y: 2.12, h: 2.06, r: 0.20, phase: s > 0 ? 0 : 3.1, swing: 0.14, clawCol: shade(a, 1.1) });
    // 鳞甲：腿侧与腰间的一列小片
    for (const s of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        putBox(B, lt, 0.08, [0.06 + t * 0.10, t * 1.4, 0, 0], 0.06, 0.22, 0.24,
          s * (0.74 - t * 0.06), 2.30 - t * 0.30, 0.30 - t * 0.70, 0, s * 0.3, s * 0.4);
      }
    // 尾羽
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      putBox(B, a, 0.24 + t * 0.10, [0.24 + t * 0.10, 2.0 + t * 0.6, 0, 0], 0.16, 0.05, 1.30,
        (t - 0.5) * 1.10, 2.16 - Math.abs(t - 0.5) * 0.30, -2.10, 0.30, (t - 0.5) * 0.55, (t - 0.5) * 0.3);
    }
  },

  /* ============================================================
     五 · 昆仑天阙
     ============================================================ */
  // 土蝼：状如羊而四角，是食人 —— 羊形而阔口露齿，四角分两对盘出
  tulou(B, c, a) {
    const dk = shade(c, 0.60), wool = shade(c, 1.22);
    // 羊身：桶状，背平腹垂
    addTorso(B, c, {
      z0: 1.05, z1: -1.30, y: 1.20, segs: 6, r: 0.58, wave: 0.05, w: 8, h: 5,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.44) * 1.5, 2) * 0.26 - t * 0.10,
    });
    // 羊毛：一圈蓬松团块把躯干裹住，剪影立刻毛茸茸
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + 0.3;
      putBlob(B, wool, 0, [0.06, i * 0.6, 0, 0], 0.26, 0.24, 0.28,
        Math.cos(ang) * 0.50, 1.32 + Math.sin(ang * 2) * 0.16, Math.sin(ang) * 0.80 - 0.12, 0, 0, 0, 6, 4);
    }
    // 四蹄：偶蹄，前腿直、后腿曲
    for (const [x, z, ph, bk] of [[-0.40, 0.88, 0, false], [0.40, 0.88, 3.1, false], [-0.40, -0.82, 3.1, true], [0.40, -0.82, 0, true]])
      addPaw(B, c, x, z, { h: 1.20, r: 0.13, phase: ph, y: 1.20, swing: 0.20, back: bk, hoof: 1, clawCol: [0.22, 0.20, 0.18] });
    // 颈与长脸：额平、吻长、下颌方
    putBlob(B, c, 0, [0.05, 0, 0, 0], 0.26, 0.28, 0.30, 0, 1.44, 1.14, 0.4, 0, 0, 7, 4);
    putBlob(B, c, 0, [0.05, 0, 0, 0], 0.28, 0.30, 0.34, 0, 1.58, 1.38, 0, 0, 0, 8, 5);
    putBlob(B, c, 0, [0.05, 0, 0, 0], 0.19, 0.20, 0.30, 0, 1.48, 1.76, 0.2, 0, 0, 7, 4);
    putBox(B, dk, 0, [0.05, 0, 0, 0], 0.26, 0.14, 0.16, 0, 1.40, 1.98, 0.1);
    for (const s of [-1, 1]) putBox(B, [0.10, 0.08, 0.08], 0, [0.05, 0, 0, 0], 0.06, 0.06, 0.05, s * 0.08, 1.44, 2.04);
    // 下颌与食人之齿
    putBlob(B, shade(c, 0.86), 0, [0.05, 0, 0, 0], 0.17, 0.11, 0.28, 0, 1.30, 1.74, 0, 0, 0, 6, 4);
    for (let i = 0; i < 5; i++)
      putCone(B, bone, 0.08, [0.05, 0, 0, 0], 0.035, 0.16, (i - 2) * 0.075, 1.36, 1.92, Math.PI, 0, 0, 4);
    for (const s of [-1, 1]) putCone(B, bone, 0.10, [0.05, 0, 0, 0], 0.045, 0.24, s * 0.14, 1.34, 1.82, Math.PI, 0, s * 0.2, 4);
    // 羊眼：横瞳，眼白在外
    for (const s of [-1, 1]) {
      putBlob(B, [0.08, 0.07, 0.06], 0, [0.05, 0, 0, 0], 0.10, 0.09, 0.07, s * 0.25, 1.66, 1.56, 0, s * 0.4, 0, 6, 4);
      putBox(B, [1.0, 0.90, 0.40], 1.0, [0.05, 0, 0, 0], 0.13, 0.05, 0.05, s * 0.27, 1.66, 1.60, 0, s * 0.4, 0);
    }
    // 耳：两片下垂的长耳
    for (const s of [-1, 1]) {
      putBox(B, shade(c, 0.9), 0, [0.05, 0, 0, 0], 0.28, 0.06, 0.16, s * 0.44, 1.66, 1.30, 0, s * 0.5, s * 0.5);
      putBox(B, shade(a, 0.7), 0.02, [0.05, 0, 0, 0], 0.22, 0.04, 0.11, s * 0.44, 1.68, 1.31, 0, s * 0.5, s * 0.5);
    }
    // 四角：前一对短而前挑，后一对长而向后盘旋，各分四节
    for (const s of [-1, 1])
      for (let k = 0; k < 2; k++) {
        let px = s * (0.22 + k * 0.14), py = 1.82 + k * 0.04, pz = 1.42 - k * 0.34;
        const n = 4, scale = k ? 1.0 : 0.6;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const step = 0.30 * scale * (1 - t * 0.25);
          const yaw = s * (0.55 + t * 1.5) * (k ? 1 : 0.6);
          const pitch = -0.4 + t * (k ? 1.9 : 1.0);
          const nx = px + Math.sin(yaw) * step, ny = py + Math.cos(pitch) * step * 0.7, nz = pz - Math.sin(pitch) * step;
          B.push(beam(px, py, pz, nx, ny, nz, (0.11 - t * 0.06) * scale, (0.11 - t * 0.06) * scale, 0.9), a, 0.14, [0.05, 0, 0, 0]);
          px = nx; py = ny; pz = nz;
        }
        putCone(B, shade(a, 1.15), 0.20, [0.05, 0, 0, 0], 0.05 * scale, 0.24 * scale, px, py, pz, -1.4, s * 1.2, 0, 4);
      }
    // 短尾
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      putBlob(B, wool, 0, [0.10 + t * 0.16, 1.8 + t * 1.4, 0, 0], 0.14 - t * 0.05, 0.14 - t * 0.05, 0.16,
        0, 1.30 - t * 0.16, -1.42 - t * 0.20, 0, 0, 0, 5, 4);
    }
  },
  // 英招：马身而人面，虎文而鸟翼，徇于四海
  yingzhao(B, c, a) {
    const dk = shade(c, 0.55), lt = shade(c, 1.25);
    // 马身：胸深腰细臀圆
    addTorso(B, c, {
      z0: 1.20, z1: -1.45, y: 1.66, segs: 7, r: 0.62, wave: 0.05, w: 9, h: 5,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.24) * 1.55, 2) * 0.34 + Math.pow(Math.max(0, t - 0.7), 2) * 0.9,
    });
    for (const s of [-1, 1]) {
      putBlob(B, c, 0, [0.05, 0, 0, 0], 0.26, 0.30, 0.36, s * 0.44, 1.92, 0.92, 0, 0, 0, 6, 4);   // 肩胛
      putBlob(B, c, 0, [0.06, 1.4, 0, 0], 0.30, 0.32, 0.38, s * 0.44, 1.84, -1.02, 0, 0, 0, 6, 4); // 尻
    }
    // 马腿：细长，后肢跗关节后折
    for (const [x, z, ph, bk] of [[-0.44, 1.02, 0, false], [0.44, 1.02, 3.1, false], [-0.44, -1.02, 3.1, true], [0.44, -1.02, 0, true]])
      addPaw(B, c, x, z, { h: 1.66, r: 0.12, phase: ph, y: 1.66, swing: 0.24, back: bk, hoof: 1, clawCol: [0.24, 0.21, 0.18] });
    // 马颈：三节上扬，颈脊一列鬃
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      putBlob(B, c, 0, [0.05, 0, 0, 0], 0.28 - t * 0.05, 0.32 - t * 0.05, 0.30, 0, 1.98 + t * 0.42, 1.30 + t * 0.28, 0, 0, 0, 7, 4);
    }
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      putBox(B, a, 0.16, [0.09 + t * 0.20, t * 2.2, 0, 0], 0.05, 0.34 - t * 0.08, 0.20,
        0, 2.60 - t * 0.62, 1.72 - t * 0.86, -0.34 + t * 0.2, 0, 0);
    }
    // 人面
    addFace(B, a, { y: 2.72, z: 1.82, r: 0.32, emis: 0.07, eye: [1.00, 0.95, 0.52], anim: [0.05, 0, 0, 0], hair: 5, hairCol: lt });
    // 鸟翼：徇于四海，翼展宽阔
    for (const s of [-1, 1])
      addPinion(B, a, s, { span: 2.95, chord: 1.25, y: 2.18, z: 0.18, flap: 0.58, emis: 0.24, n: 9, droop: 0.18, tipCol: lt, boneCol: c });
    // 虎文：躯干两侧各一列条带，背上再压一列
    for (const s of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        putBox(B, dk, 0.06, [0.05 + t * 0.10, 0, 0, 0], 0.05, 0.44 - Math.abs(t - 0.5) * 0.28, 0.11,
          s * (0.58 - Math.pow(t - 0.3, 2) * 0.5), 1.74, lerp(1.02, -1.24, t), 0, s * 0.25, s * 0.45 + Math.sin(i * 1.7) * 0.3);
      }
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      putBox(B, dk, 0.06, [0.05 + t * 0.10, 0, 0, 0], 0.42, 0.05, 0.10, 0, 2.24, lerp(0.90, -1.10, t), 0, 0, Math.sin(i * 2.1) * 0.4);
    }
    // 马尾：一束长毛
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      putBox(B, a, 0.18, [0.20 + t * 0.26, 1.8 + t * 1.6, 0, 0], 0.07, 0.07, 1.20 - t * 0.30,
        Math.sin(i * 1.9) * 0.14, 1.86 - t * 0.34, -2.10 - t * 0.14, 0.42 + t * 0.2, Math.sin(i * 1.3) * 0.2, 0);
    }
  },
  // 陆吾：虎身而九尾，人面而虎爪，司天之九部
  luwu(B, c, a) {
    const dk = shade(c, 0.48), lt = shade(c, 1.24);
    // 虎身：肩高于胯，腰略收
    addTorso(B, c, {
      z0: 1.34, z1: -1.50, y: 1.46, segs: 7, r: 0.68, wave: 0.05, w: 9, h: 6,
      rise: (t) => Math.cos(t * Math.PI * 0.7) * 0.10 - 0.04,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.28) * 1.6, 2) * 0.30 - t * 0.08,
    });
    for (const s of [-1, 1]) {
      putBlob(B, lt, 0, [0.05, 0, 0, 0], 0.28, 0.32, 0.40, s * 0.48, 1.80, 1.06, 0, 0, 0, 6, 4);
      putBlob(B, c, 0, [0.06, 1.4, 0, 0], 0.30, 0.32, 0.38, s * 0.48, 1.66, -1.02, 0, 0, 0, 6, 4);
    }
    // 虎爪：四足俱五趾出爪，前肢掌大
    for (const [x, z, ph, bk, tn] of [[-0.54, 1.12, 0, false, 4], [0.54, 1.12, 3.1, false, 4], [-0.54, -1.02, 3.1, true, 3], [0.54, -1.02, 0, true, 3]])
      addPaw(B, c, x, z, { h: 1.46, r: 0.19, phase: ph, y: 1.46, swing: 0.18, back: bk, toes: tn, claw: 0.75, splay: 1.15 });
    // 短颈：人面几乎坐在肩上
    putBlob(B, c, 0, [0.05, 0, 0, 0], 0.38, 0.36, 0.32, 0, 1.84, 1.48, 0.34, 0, 0, 7, 5);
    // 人面：司天之神，戴冠垂须
    addFace(B, a, { y: 2.06, z: 1.76, r: 0.42, emis: 0.08, eye: [1.00, 0.92, 0.45], anim: [0.05, 0, 0, 0], hair: 6, hairCol: lt, beard: 3 });
    // 虎耳：圆耳，耳背一抹白
    for (const s of [-1, 1]) {
      putBlob(B, c, 0, [0.05, 0, 0, 0], 0.15, 0.19, 0.07, s * 0.36, 2.42, 1.62, 0, s * 0.2, s * 0.3, 7, 4);
      putBox(B, [0.94, 0.92, 0.86], 0.06, [0.05, 0, 0, 0], 0.14, 0.16, 0.04, s * 0.36, 2.42, 1.58, 0, s * 0.2, s * 0.3);
    }
    // 虎纹：两侧各一列竖带，背上一列横带
    for (const s of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        putBox(B, dk, 0.04, [0.05 + t * 0.10, 0, 0, 0], 0.05, 0.52 - Math.abs(t - 0.45) * 0.34, 0.12,
          s * (0.64 - Math.pow(t - 0.28, 2) * 0.6), 1.52, lerp(1.16, -1.32, t), 0, s * 0.22, s * 0.4 + Math.sin(i * 1.9) * 0.34);
      }
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      putBox(B, dk, 0.04, [0.05 + t * 0.10, 0, 0, 0], 0.48, 0.06, 0.12, 0, 2.06 - t * 0.10, lerp(1.05, -1.20, t), 0, 0, Math.sin(i * 2.3) * 0.4);
    }
    // 背脊：一列短棘
    for (let i = 0; i < 8; i++) {
      const t = i / 7, hh = 0.22 * Math.sin(Math.PI * (0.2 + t * 0.78));
      putCone(B, a, 0.20, [0.05 + t * 0.14, t * 1.6, 0, 0], hh * 0.5, hh * 2.0, 0, 2.14 - t * 0.14 + hh * 0.6, lerp(1.30, -1.40, t), -0.32, 0, 0, 4);
    }
    // 九尾：扇形张开，高低错落，梢头一撮亮毛
    for (let i = 0; i < 9; i++) {
      const k = i - 4, ang = k * 0.24;
      const lift = 0.30 - Math.abs(k) * 0.05;
      let px = Math.sin(ang) * 0.30, py = 1.62, pz = -1.52;
      for (let j = 0; j < 4; j++) {
        const t = j / 3, step = 0.50 - t * 0.10;
        const nx = px + Math.sin(ang * (1 + t * 0.8)) * step;
        const ny = py + lift * step * (1 - t * 0.4);
        const nz = pz - Math.cos(ang * (1 + t * 0.8)) * step;
        const rr = 0.13 * (1 - t * 0.5);
        B.push(beam(px, py, pz, nx, ny, nz, rr * 2, rr * 2, 0.8), a, 0.20 + t * 0.14, [0.14 + t * 0.30, i * 0.9 + t * 2.0, 0, 0]);
        px = nx; py = ny; pz = nz;
      }
      putCone(B, shade(a, 1.2), 0.55, [0.46, i * 0.9 + 2.2, 0, 0], 0.09, 0.34, px, py, pz, -2.0 + ang * 0.3, ang, 0, 4);
    }
  },
  // 开明兽：身大类虎而九首，皆人面，东向立昆仑上
  kaiming(B, c, a) {
    const dk = shade(c, 0.46), lt = shade(c, 1.22);
    // 巨虎身：肩峰高耸，胸阔腰厚
    addTorso(B, c, {
      z0: 1.90, z1: -2.10, y: 2.10, segs: 8, r: 1.06, wave: 0.04, w: 10, h: 6,
      rise: (t) => Math.cos(t * Math.PI * 0.7) * 0.18 - 0.06,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.30) * 1.55, 2) * 0.28 - t * 0.10,
    });
    for (const s of [-1, 1]) {
      putBlob(B, lt, 0, [0.04, 0, 0, 0], 0.44, 0.50, 0.60, s * 0.74, 2.62, 1.50, 0, 0, 0, 7, 5);
      putBlob(B, c, 0, [0.05, 1.4, 0, 0], 0.46, 0.50, 0.58, s * 0.74, 2.36, -1.42, 0, 0, 0, 7, 5);
    }
    // 虎爪：四足踞地，前肢四趾大爪
    for (const [x, z, ph, bk, tn] of [[-0.84, 1.50, 0, false, 4], [0.84, 1.50, 3.1, false, 4], [-0.84, -1.40, 3.1, true, 3], [0.84, -1.40, 0, true, 3]])
      addPaw(B, c, x, z, { h: 2.10, r: 0.29, phase: ph, y: 2.10, swing: 0.15, back: bk, toes: tn, claw: 0.80, splay: 1.10 });
    // 九首：三列高低错落 —— 中首最尊，两翼渐低，外侧两首更向前探
    const HEADS = [
      [0.00, 1.62, 0.34, 0.44], [-0.40, 1.30, 0.10, 0.38], [0.40, 1.30, 0.10, 0.38],
      [-0.78, 0.92, -0.20, 0.35], [0.78, 0.92, -0.20, 0.35],
      [-1.12, 1.10, 0.52, 0.33], [1.12, 1.10, 0.52, 0.33],
      [-1.42, 0.62, 0.16, 0.30], [1.42, 0.62, 0.16, 0.30],
    ];
    HEADS.forEach(([nx, rise, fwd, fr], i) => {
      const nz = 2.02 + fwd;
      const an = [0.09, i * 0.7, 0, 0];
      // 颈：三节，自肩窝斜伸而出
      let px = nx * 0.34, py = 2.70, pz = 1.55;
      for (let j = 0; j < 3; j++) {
        const t = (j + 1) / 3;
        const qx = lerp(nx * 0.34, nx, t), qy = lerp(2.70, 3.10 + rise, t), qz = lerp(1.55, nz, t);
        B.push(beam(px, py, pz, qx, qy, qz, 0.26 - j * 0.05, 0.28 - j * 0.05, 0.8), c, 0, [0.06 + j * 0.02, i * 0.7, 0, 0]);
        px = qx; py = qy; pz = qz;
      }
      // 颈鬃：每颈根部一圈短毛，九颈之间才不糊成一片
      for (let j = 0; j < 3; j++)
        putCone(B, a, 0.20, an, 0.07, 0.30, lerp(nx * 0.34, nx, 0.35) + (j - 1) * 0.12,
          lerp(2.70, 3.10 + rise, 0.35) + 0.22, lerp(1.55, nz, 0.35), -0.5, 0, (j - 1) * 0.5 + nx * 0.2, 4);
      // 人面：九张脸，眼色由中及外渐冷
      addFace(B, a, {
        x: nx, y: 3.34 + rise, z: nz, r: fr, lite: true, emis: 0.09, yaw: -nx * 0.16,
        eye: [1.0, 0.90 - Math.abs(nx) * 0.10, 0.36 + Math.abs(nx) * 0.28], anim: an,
      });
      // 冠：中首之冠最高
      putCone(B, shade(a, 1.2), 0.30, an, fr * 0.24, fr * (1.0 + rise * 0.5), nx, 3.34 + rise + fr * 1.30, nz - fr * 0.18, -0.22, 0, -nx * 0.18, 4);
      putBox(B, dk, 0.05, an, fr * 1.10, fr * 0.18, fr * 0.5, nx, 3.34 + rise + fr * 0.98, nz - fr * 0.02, -0.24, -nx * 0.16, 0);
    });
    // 虎纹
    for (const s of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        putBox(B, dk, 0.04, [0.04 + t * 0.08, 0, 0, 0], 0.07, 0.80 - Math.abs(t - 0.45) * 0.5, 0.18,
          s * (1.00 - Math.pow(t - 0.28, 2) * 0.9), 2.16, lerp(1.70, -1.90, t), 0, s * 0.22, s * 0.4 + Math.sin(i * 1.9) * 0.34);
      }
    // 背脊：一列长棘
    for (let i = 0; i < 10; i++) {
      const t = i / 9, hh = 0.34 * Math.sin(Math.PI * (0.18 + t * 0.80));
      putCone(B, a, 0.26, [0.04 + t * 0.14, t * 1.6, 0, 0], hh * 0.48, hh * 2.1, 0, 3.02 - t * 0.30 + hh * 0.6, lerp(1.80, -2.00, t), -0.34, 0, 0, 4);
    }
    // 尾：粗根渐收，末端一簇
    let tx = 0, ty = 2.20, tz = -2.24;
    for (let i = 0; i < 5; i++) {
      const t = i / 4, step = 0.62;
      const nx2 = tx + Math.sin(t * 1.6) * 0.22, ny = ty + 0.18 * (1 - t), nz2 = tz - step;
      B.push(beam(tx, ty, tz, nx2, ny, nz2, 0.46 - t * 0.28, 0.46 - t * 0.28, 0.8), c, 0.06 + t * 0.08, [0.12 + t * 0.30, 1.6 + t * 2.2, 0, 0]);
      tx = nx2; ty = ny; tz = nz2;
    }
    for (let i = 0; i < 3; i++)
      putCone(B, a, 0.40, [0.44, 3.8, 0, 0], 0.09, 0.44, tx + (i - 1) * 0.10, ty, tz - 0.10, -2.0, 0, (i - 1) * 0.4, 4);
  },

  /* ============================================================
     补遗 · 诸方异兽
     ============================================================ */
  // 蛊雕：状如雕而有角，其音如婴儿，是食人 —— 掠空之姿，钩喙利爪
  gudiao(B, c, a) {
    const dk = shade(c, 0.55), lt = shade(c, 1.28);
    // 猛禽体：胸厚而尾根收，飞行姿态前倾
    addTorso(B, c, {
      z0: 0.90, z1: -1.15, y: 1.62, segs: 5, r: 0.52, wave: 0.06, w: 9, h: 5,
      rise: (t) => -t * 0.16,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.26) * 1.6, 1.8) * 0.66,
    });
    // 胸羽：三层叠瓦
    for (let r2 = 0; r2 < 3; r2++)
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3;
        putBox(B, r2 % 2 ? lt : a, 0.12, [0.06, 0, 0, 0], 0.26, 0.05, 0.24,
          (t - 0.5) * 0.72, 1.80 - r2 * 0.26, 0.86 - Math.abs(t - 0.5) * 0.3 - r2 * 0.08, -0.34, (t - 0.5) * 0.7, 0);
      }
    // 背羽列
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      putBox(B, dk, 0.06, [0.06 + t * 0.12, t * 1.5, 0, 0], 0.30, 0.05, 0.26, 0, 2.06 - t * 0.20, lerp(0.78, -1.00, t), -0.24, 0, 0);
    }
    // 双翼：展开滑翔，翼梢一抹亮色
    for (const s of [-1, 1])
      addPinion(B, a, s, { span: 2.65, chord: 1.20, y: 1.80, z: 0.20, flap: 0.68, emis: 0.22, n: 9, droop: 0.14, tipCol: lt, boneCol: c });
    // 颈与头：额高、眼深、钩喙分上下
    putBlob(B, c, 0, [0.06, 0, 0, 0], 0.24, 0.24, 0.26, 0, 1.86, 0.98, 0.3, 0, 0, 7, 4);
    putBlob(B, c, 0, [0.06, 0, 0, 0], 0.30, 0.30, 0.32, 0, 2.02, 1.28, 0, 0, 0, 8, 5);
    for (const s of [-1, 1]) {
      // 眉脊压在眼上，鹰视之凶全在这一条
      putBox(B, dk, 0, [0.06, 0, 0, 0], 0.16, 0.06, 0.18, s * 0.16, 2.14, 1.46, -0.24, 0, -s * 0.2);
      putBlob(B, [0.06, 0.05, 0.06], 0, [0.06, 0, 0, 0], 0.10, 0.09, 0.07, s * 0.17, 2.04, 1.46, 0, s * 0.35, 0, 6, 4);
      putBlob(B, [1.0, 0.62, 0.25], 1.0, [0.06, 0, 0, 0], 0.065, 0.06, 0.06, s * 0.18, 2.04, 1.50, 0, s * 0.35, 0, 5, 4);
    }
    // 钩喙：上喙下钩，蜡膜与鼻孔分明
    putBox(B, shade(a, 0.9), 0.10, [0.06, 0, 0, 0], 0.14, 0.12, 0.12, 0, 1.98, 1.56);
    putCone(B, bone, 0.10, [0.06, 0, 0, 0], 0.10, 0.34, 0, 1.96, 1.70, Math.PI / 2.1, 0, 0, 5);
    putCone(B, shade(bone, 0.9), 0.10, [0.06, 0, 0, 0], 0.055, 0.20, 0, 1.86, 1.78, Math.PI / 1.5, 0, 0, 4);
    putBox(B, shade(c, 0.7), 0, [0.06, 0, 0, 0], 0.13, 0.05, 0.10, 0, 1.88, 1.62);
    // 头顶一对角：两节前挑
    for (const s of [-1, 1]) {
      B.push(beam(s * 0.16, 2.24, 1.22, s * 0.30, 2.62, 1.02, 0.09, 0.09, 0.9), a, 0.20, [0.06, 0, 0, 0]);
      putCone(B, shade(a, 1.2), 0.30, [0.06, 0, 0, 0], 0.06, 0.34, s * 0.34, 2.76, 0.94, -0.5, 0, s * 0.5, 4);
    }
    // 利爪：飞行时半收
    for (const s of [-1, 1])
      addBirdClaw(B, c, s * 0.26, -0.10, { y: 1.44, h: 1.00, r: 0.11, phase: s > 0 ? 0 : 3.1, swing: 0.16, grip: 0.7, clawCol: shade(a, 1.1) });
    // 尾羽：一把张开的扇
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      putBox(B, a, 0.20 + t * 0.10, [0.18 + t * 0.12, 1.8 + t * 0.6, 0, 0], 0.14, 0.04, 1.20,
        (t - 0.5) * 0.86, 1.50 - Math.abs(t - 0.5) * 0.18, -1.72, 0.16, (t - 0.5) * 0.60, (t - 0.5) * 0.28);
    }
  },
  // 玄蜂：其大如壶，其状如螽 —— 分节腹部环黑黄，两对薄翅，长螫
  xuanfeng(B, c, a) {
    const blk = shade(c, 0.55);
    // 头：一对巨大复眼 + 口器 + 触角
    putBlob(B, c, 0, [0.06, 0, 0, 0], 0.26, 0.24, 0.20, 0, 1.30, 0.72, 0, 0, 0, 8, 5);
    for (const s of [-1, 1]) {
      putBlob(B, [0.10, 0.08, 0.06], 0.06, [0.06, 0, 0, 0], 0.13, 0.17, 0.15, s * 0.20, 1.32, 0.74, 0, s * 0.4, 0, 8, 5);
      putBlob(B, a, 0.55, [0.06, 0, 0, 0], 0.10, 0.13, 0.11, s * 0.23, 1.32, 0.78, 0, s * 0.4, 0, 6, 4);
      // 触角：两节，前段下弯
      B.push(beam(s * 0.10, 1.44, 0.82, s * 0.24, 1.66, 1.06, 0.030, 0.030, 0.9), blk, 0, [0.20, s * 1.6, 0, 0]);
      B.push(beam(s * 0.24, 1.66, 1.06, s * 0.34, 1.62, 1.42, 0.026, 0.026, 0.9), blk, 0, [0.28, s * 1.6, 0, 0]);
    }
    // 口器：一对大颚
    for (const s of [-1, 1])
      putCone(B, blk, 0.04, [0.06, 0, 0, 0], 0.045, 0.22, s * 0.07, 1.18, 0.90, Math.PI / 1.9, 0, s * 0.5, 4);
    // 胸：绒毛环绕，六足由此生出
    putBlob(B, blk, 0, [0.05, 0, 0, 0], 0.30, 0.28, 0.34, 0, 1.30, 0.30, 0, 0, 0, 8, 5);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      putCone(B, a, 0.14, [0.05, i * 0.6, 0, 0], 0.05, 0.20, Math.cos(ang) * 0.28, 1.30 + Math.sin(ang) * 0.26, 0.32,
        Math.PI / 2, 0, -ang, 4);
    }
    // 腹：五节，黑黄相间，逐节收细
    for (let i = 0; i < 5; i++) {
      const t = i / 4, rr = 0.30 * (1 - t * 0.55);
      const an = [0.06 + t * 0.14, t * 1.6, 0, 0];
      putBlob(B, i % 2 ? a : blk, i % 2 ? 0.16 : 0.0, an, rr, rr * 0.94, 0.20, 0, 1.26 - t * 0.10, -0.06 - t * 0.86, 0, 0, 0, 8, 5);
      putBox(B, blk, 0, an, rr * 1.7, rr * 0.30, 0.05, 0, 1.26 - t * 0.10, -0.16 - t * 0.86);
    }
    // 螫针：长而利，根部一枚毒囊
    putBlob(B, blk, 0, [0.24, 1.8, 0, 0], 0.10, 0.10, 0.12, 0, 1.14, -1.02, 0, 0, 0, 6, 4);
    putCone(B, bone, 0.20, [0.30, 2.0, 0, 0], 0.055, 0.52, 0, 1.10, -1.34, Math.PI / 1.72, 0, 0, 5);
    // 两对薄翅
    for (const s of [-1, 1]) {
      addMembraneWing(B, [0.86, 0.90, 0.96], s, { span: 1.35, chord: 0.46, y: 1.52, z: 0.34, flap: 1.10, emis: 0.05, sweep: -0.55 });
      addMembraneWing(B, [0.82, 0.86, 0.94], s, { span: 1.00, chord: 0.34, y: 1.42, z: 0.06, flap: 1.25, emis: 0.05, sweep: -0.60 });
    }
    // 六足：股胫跗三节，末端一枚钩爪
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1, k = i % 3;
      const ph = i * 1.05;
      const ox = s * 0.24, oz = 0.48 - k * 0.30;
      const mx = s * (0.52 + k * 0.06), my = 1.14 - k * 0.04, mz = oz + (k - 1) * 0.16;
      const fx = s * (0.62 + k * 0.10), fz = mz + (k - 1) * 0.24;
      B.push(beam(ox, 1.26, oz, mx, my, mz, 0.05, 0.05, 0.9), blk, 0, [0.16, ph, 0, 0]);
      B.push(beam(mx, my, mz, fx, 0.42, fz, 0.042, 0.042, 0.9), blk, 0, [0.26, ph, 0, 0]);
      putCone(B, a, 0.14, [0.30, ph, 0, 0], 0.035, 0.14, fx, 0.36, fz, Math.PI, 0, 0, 4);
    }
  },
  // 蜚：状如牛而白首，一目而蛇尾，所行之国大疫
  fei(B, c, a) {
    const dk = shade(c, 0.55), white = [0.90, 0.90, 0.84];
    // 牛身：肩峰高耸，腹垂，步态沉重
    addTorso(B, c, {
      z0: 1.20, z1: -1.30, y: 1.34, segs: 7, r: 0.72, wave: 0.04, w: 9, h: 5,
      rise: (t) => Math.cos(t * Math.PI * 0.6) * 0.10,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.36) * 1.5, 2) * 0.24 - t * 0.10,
    });
    putBlob(B, c, 0, [0.04, 0, 0, 0], 0.46, 0.36, 0.52, 0, 1.94, 0.88, 0, 0, 0, 8, 5);   // 肩峰
    putBlob(B, shade(c, 0.86), 0, [0.06, 1.2, 0, 0], 0.46, 0.28, 0.60, 0, 0.88, 0.10, 0, 0, 0, 7, 4); // 垂腹
    // 四蹄：粗短，步态沉
    for (const [x, z, ph, bk] of [[-0.52, 0.98, 0, false], [0.52, 0.98, 3.1, false], [-0.52, -0.94, 3.1, true], [0.52, -0.94, 0, true]])
      addPaw(B, c, x, z, { h: 1.36, r: 0.18, phase: ph, y: 1.36, swing: 0.13, back: bk, hoof: 1, clawCol: [0.20, 0.19, 0.17] });
    // 白首：颈短、颅方、吻宽
    putBlob(B, white, 0.03, [0.04, 0, 0, 0], 0.34, 0.32, 0.30, 0, 1.72, 1.34, 0.25, 0, 0, 7, 4);
    putBlob(B, white, 0.03, [0.04, 0, 0, 0], 0.38, 0.38, 0.40, 0, 1.70, 1.76, 0, 0, 0, 9, 6);
    putBlob(B, white, 0.03, [0.04, 0, 0, 0], 0.26, 0.24, 0.30, 0, 1.54, 2.14, 0.16, 0, 0, 7, 4);
    putBox(B, shade(white, 0.72), 0, [0.04, 0, 0, 0], 0.34, 0.16, 0.16, 0, 1.44, 2.36, 0.1);
    for (const s of [-1, 1]) putBox(B, [0.12, 0.10, 0.10], 0, [0.04, 0, 0, 0], 0.07, 0.08, 0.05, s * 0.10, 1.48, 2.42);
    putBlob(B, shade(white, 0.88), 0, [0.04, 0, 0, 0], 0.22, 0.13, 0.28, 0, 1.36, 2.10, 0, 0, 0, 6, 4);
    // 一目：额心一枚巨眼，眼睑包一圈，瞳心竖裂
    putBlob(B, shade(white, 0.7), 0, [0.04, 0, 0, 0], 0.26, 0.26, 0.16, 0, 1.90, 2.00, 0, 0, 0, 9, 5);
    putBlob(B, [0.06, 0.05, 0.05], 0, [0.04, 0, 0, 0], 0.21, 0.21, 0.12, 0, 1.90, 2.06, 0, 0, 0, 8, 5);
    putBlob(B, a, 1.0, [0.04, 0, 0, 0], 0.16, 0.16, 0.10, 0, 1.90, 2.10, 0, 0, 0, 8, 5);
    putBox(B, [0.05, 0.05, 0.04], 0, [0.04, 0, 0, 0], 0.05, 0.22, 0.05, 0, 1.90, 2.18);
    // 牛角：两节，向外再上挑
    for (const s of [-1, 1]) {
      B.push(beam(s * 0.28, 2.00, 1.72, s * 0.62, 2.18, 1.56, 0.11, 0.11, 0.9), shade(white, 0.8), 0.04, [0.04, 0, 0, 0]);
      putCone(B, shade(white, 0.9), 0.08, [0.04, 0, 0, 0], 0.085, 0.44, s * 0.76, 2.42, 1.48, -0.4, 0, s * 0.7, 5);
    }
    // 耳
    for (const s of [-1, 1])
      putBox(B, white, 0.02, [0.04, 0, 0, 0], 0.24, 0.06, 0.14, s * 0.44, 1.82, 1.52, 0, s * 0.4, s * 0.6);
    // 疫气：体侧一列暗斑，肋骨隐现
    for (const s of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        putBox(B, dk, 0.10, [0.05 + t * 0.10, t * 1.3, 0, 0], 0.05, 0.34 - Math.abs(t - 0.4) * 0.2, 0.12,
          s * (0.66 - Math.pow(t - 0.3, 2) * 0.5), 1.32, lerp(0.98, -1.06, t), 0, s * 0.24, s * 0.3);
      }
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      putBlob(B, a, 0.45, [0.10 + t * 0.2, t * 2.4, 0, 0], 0.07, 0.06, 0.07,
        Math.sin(i * 2.3) * 0.5, 2.02 + Math.sin(i * 1.7) * 0.24, lerp(0.70, -0.90, t), 0, 0, 0, 5, 4);
    }
    // 蛇尾：自牛胯接出，一节节收细，末端一枚蛇头
    const tp = (t) => [Math.sin(t * 3.4) * 0.42, 1.30 - t * 0.30 + Math.sin(t * 2.2) * 0.20, -1.42 - t * 1.45];
    for (let i = 0; i < 7; i++) {
      const t = i / 6, p = tp(t), rr = 0.20 * (1 - t * 0.55);
      putBlob(B, i % 2 ? shade(c, 1.14) : c, 0.04, [0.14 + t * 0.32, 1.4 + t * 2.6, 0, 0], rr, rr, 0.24, p[0], p[1], p[2], 0, 0, 0, 6, 4);
    }
    const hp = tp(1.0);
    putBlob(B, dk, 0.08, [0.48, 4.0, 0, 0], 0.13, 0.10, 0.22, hp[0], hp[1], hp[2] - 0.24, 0, 0, 0, 6, 4);
    for (const s of [-1, 1])
      putBlob(B, a, 1.0, [0.48, 4.0, 0, 0], 0.05, 0.045, 0.04, hp[0] + s * 0.07, hp[1] + 0.05, hp[2] - 0.32, 0, 0, 0, 4, 3);
    putBox(B, [0.85, 0.16, 0.20], 0.30, [0.54, 4.4, 0, 0], 0.03, 0.02, 0.24, hp[0], hp[1] - 0.04, hp[2] - 0.48);
  },
  // 罔象：状如小儿，赤黑色，赤爪，大耳，长臂
  wangxiang(B, c, a) {
    const dk = shade(c, 0.55), lt = shade(c, 1.30), red = [0.72, 0.14, 0.10];
    // 佝偻的小儿身：背弓、胸凹、腹鼓
    addTorso(B, c, {
      z0: 0.42, z1: -0.52, y: 1.10, segs: 5, r: 0.44, wave: 0.06, w: 8, h: 5, tall: 1.10,
      rise: (t) => Math.sin(t * Math.PI * 0.8) * 0.10,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.55) * 1.5, 2) * 0.30,
    });
    putBlob(B, dk, 0, [0.06, 0.6, 0, 0], 0.40, 0.34, 0.34, 0, 1.44, -0.30, 0, 0, 0, 8, 5);   // 驼起来的背
    putBlob(B, lt, 0, [0.07, 0, 0, 0], 0.34, 0.28, 0.26, 0, 0.92, 0.28, 0, 0, 0, 7, 4);       // 鼓腹
    // 肋骨：一列凸起，瘦得见骨
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++)
        putBox(B, lt, 0.05, [0.07, 0, 0, 0], 0.05, 0.06, 0.30, s * 0.30, 1.26 - i * 0.15, 0.16, 0, s * 0.3, s * 0.5);
    // 短腿：屈膝，蹲伏之姿
    for (const s of [-1, 1])
      addPaw(B, c, s * 0.24, -0.12, { h: 0.72, r: 0.11, phase: s > 0 ? 0 : 3.1, y: 0.98, swing: 0.26, back: true, toes: 3, claw: 0.5, clawCol: red, splay: 1.2 });
    // 长臂：过膝，肩、上臂、肘、前臂、掌，五指赤爪
    for (const s of [-1, 1]) {
      const ph = s > 0 ? 0 : 3.1;
      putBlob(B, c, 0, [0.10, ph, 0, 0], 0.17, 0.17, 0.17, s * 0.42, 1.42, 0.06, 0, 0, 0, 6, 4);
      B.push(beam(s * 0.42, 1.42, 0.06, s * 0.62, 0.78, 0.22, 0.14, 0.14, 0.8), c, 0, [0.22, ph, 0, 0]);
      putBlob(B, c, 0, [0.30, ph, 0, 0], 0.11, 0.11, 0.11, s * 0.62, 0.78, 0.22, 0, 0, 0, 5, 4);
      B.push(beam(s * 0.62, 0.78, 0.22, s * 0.70, 0.22, 0.40, 0.115, 0.115, 0.8), c, 0, [0.36, ph, 0, 0]);
      putBox(B, c, 0, [0.42, ph, 0, 0], 0.18, 0.09, 0.20, s * 0.70, 0.14, 0.46, 0.3, 0, 0);
      for (let i = 0; i < 4; i++) {
        const fx = s * 0.70 + (i - 1.5) * 0.055;
        putBox(B, c, 0, [0.44, ph, 0, 0], 0.045, 0.05, 0.16, fx, 0.08, 0.58, 0.35, (i - 1.5) * 0.18, 0);
        putCone(B, red, 0.24, [0.46, ph, 0, 0], 0.028, 0.16, fx, 0.01, 0.66, Math.PI / 1.5, (i - 1.5) * 0.18, 0, 4);
      }
    }
    // 小儿头：颅大脸圆，双目无神地发亮
    putBlob(B, c, 0, [0.06, 0, 0, 0], 0.14, 0.14, 0.14, 0, 1.52, 0.20, 0, 0, 0, 6, 4);
    putBlob(B, lt, 0.03, [0.06, 0, 0, 0], 0.36, 0.38, 0.34, 0, 1.80, 0.22, 0, 0, 0, 9, 6);
    putBlob(B, lt, 0.03, [0.06, 0, 0, 0], 0.18, 0.15, 0.16, 0, 1.66, 0.48, 0.2, 0, 0, 6, 4);
    for (const s of [-1, 1]) {
      putBlob(B, [0.05, 0.05, 0.06], 0, [0.06, 0, 0, 0], 0.12, 0.11, 0.08, s * 0.15, 1.84, 0.48, 0, s * 0.2, 0, 6, 4);
      putBlob(B, a, 1.0, [0.06, 0, 0, 0], 0.075, 0.070, 0.06, s * 0.15, 1.84, 0.52, 0, s * 0.2, 0, 5, 4);
    }
    putBox(B, dk, 0, [0.06, 0, 0, 0], 0.22, 0.06, 0.10, 0, 1.58, 0.52);            // 咧开的嘴缝
    for (let i = 0; i < 4; i++)
      putCone(B, [0.90, 0.88, 0.80], 0.06, [0.06, 0, 0, 0], 0.022, 0.09, (i - 1.5) * 0.055, 1.58, 0.54, Math.PI, 0, 0, 4);
    putBox(B, dk, 0, [0.06, 0, 0, 0], 0.06, 0.10, 0.08, 0, 1.70, 0.54);            // 鼻
    // 大耳：两片阔耳外张，耳轮分明
    for (const s of [-1, 1]) {
      putBlob(B, lt, 0.02, [0.06, 0, 0, 0], 0.07, 0.30, 0.24, s * 0.40, 1.82, 0.14, 0, s * 0.36, s * 0.24, 7, 4);
      putBox(B, dk, 0, [0.06, 0, 0, 0], 0.04, 0.34, 0.06, s * 0.44, 1.82, 0.14, 0, s * 0.36, s * 0.24);
      putBox(B, shade(a, 0.5), 0.05, [0.06, 0, 0, 0], 0.03, 0.16, 0.13, s * 0.43, 1.80, 0.18, 0, s * 0.36, s * 0.24);
    }
    // 湿发：几缕垂到肩上
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      putCone(B, dk, 0.04, [0.10 + t * 0.10, i * 0.8, 0, 0], 0.05, 0.34 + Math.sin(t * Math.PI) * 0.18,
        (t - 0.5) * 0.52, 2.08, 0.10 - Math.abs(t - 0.5) * 0.18, Math.PI - 0.4, 0, (t - 0.5) * 1.0, 4);
    }
  },
  // 鬼车：九首之鸟，一首为犬所噬，滴血所至其家有殃
  guiche(B, c, a) {
    const dk = shade(c, 0.55), lt = shade(c, 1.30);
    // 鸟身
    addTorso(B, c, {
      z0: 0.86, z1: -1.20, y: 1.66, segs: 5, r: 0.58, wave: 0.05, w: 9, h: 5,
      profile: (t) => 1 - Math.pow(Math.abs(t - 0.28) * 1.6, 1.8) * 0.62,
    });
    // 胸羽与背羽
    for (let r2 = 0; r2 < 2; r2++)
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3;
        putBox(B, r2 ? lt : a, 0.10, [0.05, 0, 0, 0], 0.28, 0.05, 0.26,
          (t - 0.5) * 0.80, 1.84 - r2 * 0.30, 0.82 - Math.abs(t - 0.5) * 0.3 - r2 * 0.08, -0.34, (t - 0.5) * 0.7, 0);
      }
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      putBox(B, dk, 0.06, [0.05 + t * 0.12, t * 1.5, 0, 0], 0.32, 0.05, 0.26, 0, 2.14 - t * 0.22, lerp(0.74, -1.04, t), -0.24, 0, 0);
    }
    // 双翼：夜飞之鸟，翼色黯而梢发微光
    for (const s of [-1, 1])
      addPinion(B, a, s, { span: 2.85, chord: 1.20, y: 1.86, z: 0.16, flap: 0.62, emis: 0.20, n: 9, droop: 0.20, tipCol: lt, boneCol: c });
    // 九首：高低错落地自肩窝伸出，第八首断颈滴血
    const NECKS = [
      [0.00, 1.30, 0.55], [-0.34, 1.05, 0.40], [0.34, 1.12, 0.44],
      [-0.66, 0.72, 0.20], [0.66, 0.80, 0.24], [-0.90, 1.02, -0.10],
      [0.90, 0.94, -0.14], [-1.05, 0.30, 0.34], [1.08, 0.55, -0.35],
    ];
    NECKS.forEach(([nx, rise, fwd], i) => {
      const broken = (i === 7);
      const an = [0.10, i * 0.8, 0, 0];
      const hx = nx, hy = 2.16 + rise, hz = 0.94 + fwd;
      let px = nx * 0.30, py = 1.96, pz = 0.70;
      const n = broken ? 2 : 3;
      for (let j = 0; j < n; j++) {
        const t = (j + 1) / 3;
        const qx = lerp(nx * 0.30, hx, t), qy = lerp(1.96, hy, t), qz = lerp(0.70, hz, t);
        B.push(beam(px, py, pz, qx, qy, qz, 0.13 - j * 0.02, 0.14 - j * 0.02, 0.8),
          broken ? shade(c, 0.8) : c, 0, [0.06 + j * 0.03, i * 0.8, 0, 0]);
        px = qx; py = qy; pz = qz;
      }
      if (broken) {
        // 断颈：一圈血红的断口，底下坠着几滴血
        B.push(T(cyl(0.11, 0.12, 0.06, 6, 0.9), px, py, pz, 0.5, 0, 0.3), BLOOD, 0.45, an);
        for (let j = 0; j < 4; j++)
          putBlob(B, BLOOD, 0.55, [0.20 + j * 0.12, i * 0.8 + j * 1.1, 0, 0],
            0.045 - j * 0.006, 0.070 - j * 0.008, 0.045 - j * 0.006,
            px + Math.sin(j * 2.0) * 0.05, py - 0.22 - j * 0.30, pz - 0.02, 0, 0, 0, 5, 4);
        return;
      }
      // 鸟首：颅、钩喙、一对赤瞳、脑后一撮翎
      putBlob(B, c, 0, an, 0.16, 0.15, 0.18, hx, hy, hz, 0, -nx * 0.2, 0, 7, 4);
      putCone(B, shade(a, 1.1), 0.16, an, 0.055, 0.26, hx, hy - 0.02, hz + 0.22, Math.PI / 2.1, -nx * 0.2, 0, 5);
      putCone(B, shade(a, 0.9), 0.16, an, 0.035, 0.14, hx, hy - 0.08, hz + 0.22, Math.PI / 1.5, -nx * 0.2, 0, 4);
      for (const s of [-1, 1])
        putBlob(B, [1.0, 0.30, 0.22], 1.0, an, 0.045, 0.042, 0.038, hx + s * 0.10, hy + 0.04, hz + 0.10, 0, -nx * 0.2, 0, 4, 3);
      putCone(B, a, 0.24, an, 0.04, 0.22, hx, hy + 0.18, hz - 0.10, -0.5, -nx * 0.2, -nx * 0.2, 4);
    });
    // 禽足
    for (const s of [-1, 1])
      addBirdClaw(B, c, s * 0.28, -0.14, { y: 1.48, h: 1.10, r: 0.11, phase: s > 0 ? 0 : 3.1, swing: 0.16, clawCol: shade(a, 1.1) });
    // 长尾羽
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      putBox(B, a, 0.18 + t * 0.14, [0.20 + t * 0.14, 1.8 + t * 0.7, 0, 0], 0.13, 0.04, 1.55,
        (t - 0.5) * 0.90, 1.56 - Math.abs(t - 0.5) * 0.22, -1.92, 0.20, (t - 0.5) * 0.58, (t - 0.5) * 0.30);
    }
  },
  // 肥遗：六足四翼，见则天下大旱
  feiyi(B, c, a) {
    const dk = shade(c, 0.58), lt = shade(c, 1.28);
    // 蛇身：一条起伏的长躯，前粗后细
    const bp = (t) => [Math.sin(t * Math.PI * 1.5) * 0.42, 1.12 + Math.sin(t * Math.PI * 1.8) * 0.24, lerp(1.10, -2.30, t)];
    for (let i = 0; i < 9; i++) {
      const t = i / 8, p = bp(t);
      const rr = 0.44 * (1 - Math.pow(t, 1.3) * 0.72);
      putBlob(B, c, 0.06, [0.06 + t * 0.34, t * 2.6, 0, 0], rr, rr * 0.94, 0.30, p[0], p[1], p[2], 0, 0, 0, 8, 5);
      // 腹鳞：一列横板压在身下
      putBox(B, lt, 0.10, [0.06 + t * 0.34, t * 2.6, 0, 0], rr * 1.3, 0.05, 0.22, p[0], p[1] - rr * 0.90, p[2]);
      // 背鳞：脊线两侧各一片
      for (const s of [-1, 1])
        putBox(B, dk, 0.08, [0.06 + t * 0.34, t * 2.6, 0, 0], 0.09, 0.10, 0.22,
          p[0] + s * rr * 0.55, p[1] + rr * 0.72, p[2], 0, 0, s * 0.5);
    }
    // 蛇头：吻尖、颊鼓、颌宽，一对竖瞳与信子
    const hp = bp(-0.10);
    putBlob(B, c, 0.06, [0.06, 0, 0, 0], 0.34, 0.28, 0.40, hp[0], hp[1], hp[2], 0, 0, 0, 8, 5);
    putBlob(B, c, 0.06, [0.06, 0, 0, 0], 0.22, 0.18, 0.26, hp[0] * 0.6, hp[1] - 0.03, hp[2] + 0.48, 0, 0, 0, 7, 4);
    putBox(B, dk, 0.04, [0.06, 0, 0, 0], 0.34, 0.09, 0.44, hp[0] * 0.7, hp[1] - 0.16, hp[2] + 0.32, 0.08);
    for (const s of [-1, 1]) {
      putBlob(B, [0.06, 0.06, 0.07], 0, [0.06, 0, 0, 0], 0.11, 0.10, 0.09, hp[0] + s * 0.22, hp[1] + 0.12, hp[2] + 0.24, 0, s * 0.3, 0, 6, 4);
      putBlob(B, a, 1.0, [0.06, 0, 0, 0], 0.070, 0.065, 0.06, hp[0] + s * 0.23, hp[1] + 0.12, hp[2] + 0.28, 0, s * 0.3, 0, 5, 4);
      putBox(B, [0.05, 0.05, 0.05], 0, [0.06, 0, 0, 0], 0.02, 0.09, 0.03, hp[0] + s * 0.23, hp[1] + 0.12, hp[2] + 0.33);
      // 颊后一枚颊鳞
      putBox(B, lt, 0.12, [0.06, 0, 0, 0], 0.05, 0.18, 0.20, hp[0] + s * 0.30, hp[1] - 0.02, hp[2] + 0.06, 0, s * 0.4, s * 0.2);
    }
    putBox(B, [0.86, 0.20, 0.22], 0.40, [0.24, 1.2, 0, 0], 0.03, 0.02, 0.34, hp[0] * 0.6, hp[1] - 0.18, hp[2] + 0.86);
    // 头顶一列小棘，旱气自此蒸腾
    for (let i = 0; i < 3; i++)
      putCone(B, a, 0.40, [0.06, 0, 0, 0], 0.04, 0.20, hp[0] * (1 - i * 0.1), hp[1] + 0.28, hp[2] - i * 0.20, -0.4, 0, 0, 4);
    // 六足：短而外撇，三节带钩爪
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1, k = i % 3;
      const t = 0.10 + k * 0.20, p = bp(t);
      const ph = i * 1.05;
      const rr = 0.44 * (1 - Math.pow(t, 1.3) * 0.72);
      const ox = p[0] + s * rr * 0.75, oy = p[1] - rr * 0.35, oz = p[2];
      const mx = ox + s * 0.30, my = oy - 0.30, mz = oz + 0.10;
      const fx = mx + s * 0.10, fz = mz + 0.16;
      putBlob(B, c, 0.05, [0.10, ph, 0, 0], 0.11, 0.11, 0.12, ox, oy, oz, 0, 0, 0, 5, 4);
      B.push(beam(ox, oy, oz, mx, my, mz, 0.11, 0.11, 0.8), c, 0.04, [0.20, ph, 0, 0]);
      B.push(beam(mx, my, mz, fx, 0.16, fz, 0.085, 0.085, 0.8), c, 0.04, [0.30, ph, 0, 0]);
      putBox(B, dk, 0.04, [0.34, ph, 0, 0], 0.16, 0.06, 0.20, fx, 0.12, fz + 0.10, 0.1);
      for (let j = -1; j <= 1; j++)
        putCone(B, bone, 0.10, [0.36, ph, 0, 0], 0.03, 0.15, fx + j * 0.06, 0.06, fz + 0.22, Math.PI / 1.6, j * 0.3, 0, 4);
    }
    // 四翼：两对薄翼，通体带一点自发光
    for (const s of [-1, 1]) {
      addMembraneWing(B, a, s, { span: 1.60, chord: 0.62, y: 1.56, z: 0.62, flap: 0.80, emis: 0.26, sweep: -0.42 });
      addMembraneWing(B, shade(a, 0.9), s, { span: 1.30, chord: 0.52, y: 1.40, z: -0.30, flap: 0.92, emis: 0.22, sweep: -0.48 });
    }
    // 尾梢
    const tp2 = bp(1.06);
    putCone(B, a, 0.45, [0.44, 2.8, 0, 0], 0.09, 0.50, tp2[0], tp2[1], tp2[2] - 0.16, Math.PI / 1.15, 0, 0, 5);
  },
};

export function buildBeastGeometry(def) {
  const B = new BeastBuilder();
  const c = hex2rgb(def.body), a = hex2rgb(def.accent);
  (SHAPES[def.id] || SHAPES.huan)(B, c, a);
  const g = B.build();
  const s = def.scale || 1;
  g.scale(s, s, s);
  g.computeBoundingSphere();
  return g;
}

/* ============================================================
   兽群材质：顶点动画 + 受击闪白 + 冰冻着色
   ============================================================ */
export const beastUniforms = {
  uTime: { value: 0 },
  uRim: { value: 0.17 },
  uRimColor: { value: new THREE.Color(0xfff0d0) },
  tSkin: { value: null },
  uInk: { value: 0.0042 },                          // 描边粗细（按视距缩放）
  uInkColor: { value: new THREE.Color(0x1d1512) },
};

// 顶点动画：主体与描边壳必须走同一套，否则轮廓会「掉队」
const BEAST_ANIM = /* glsl */`
  float ph = aPhase + aAnim.y;
  float spd = mix(2.2, 9.5, clamp(aGait, 0.0, 1.0)) * (1.0 - aState.y * 0.85);
  float g = sin(uTime * spd + ph);
  transformed.y += g * aAnim.x;
  transformed.z += cos(uTime * spd + ph) * aAnim.x * 0.55;
  if (aAnim.z > 0.001) {
    float ang = sin(uTime * (spd * 1.35) + aPhase) * aAnim.z * (position.x < 0.0 ? -1.0 : 1.0);
    float cc = cos(ang), ss = sin(ang);
    float px = transformed.x, py = transformed.y - aAnim.w;
    transformed.x = px * cc - py * ss;
    transformed.y = px * ss + py * cc + aAnim.w;
    float nx = animNormal.x, ny = animNormal.y;
    animNormal.x = nx * cc - ny * ss;
    animNormal.y = nx * ss + ny * cc;
  }
  transformed *= max(0.02, 1.0 - aState.z * 0.55);
`;

export function makeBeastMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.54,
    metalness: 0.10,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.0,
  });
  if (!beastUniforms.tSkin.value) beastUniforms.tSkin.value = colorOf('noiseRGBA', 1);
  m.defines = { TOON_SHADE: '' };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = beastUniforms.uTime;
    shader.uniforms.uRim = beastUniforms.uRim;
    shader.uniforms.uRimColor = beastUniforms.uRimColor;
    shader.uniforms.tSkin = beastUniforms.tSkin;
    shader.uniforms.uToon = { value: 0.52 };
    shader.uniforms.uToonSteps = toonUniforms.uToonSteps;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aAnim;
        attribute float aEmis;
        attribute float aPhase;
        attribute float aGait;
        attribute vec3 aState;   // x: 受击闪白 y: 冰冻 z: 生死渐隐
        uniform float uTime;
        varying float vEmis;
        varying vec3 vState;
        varying vec3 vLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEmis = aEmis;
        vState = aState;
        vLocal = position;
        vec3 animNormal = objectNormal;   // 主体不回写法线，仅供动画式共用
        ${BEAST_ANIM}
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vEmis;
        varying vec3 vState;
        varying vec3 vLocal;
        uniform float uRim;
        uniform vec3 uRimColor;
        uniform sampler2D tSkin;
        ${TOON_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // 皮纹：物体空间取噪声，随身体一起动
        float skin = texture2D(tSkin, vLocal.xz * 0.62 + vLocal.y * 0.17).g;
        float skin2 = texture2D(tSkin, vLocal.xy * 1.9 - vLocal.z * 0.4).r;
        diffuseColor.rgb *= mix(0.86, 1.14, skin * 0.65 + skin2 * 0.35);
        // 底面压暗，形体立刻立起来
        diffuseColor.rgb *= mix(0.62, 1.0, clamp(vLocal.y * 0.58, 0.0, 1.0));
        totalEmissiveRadiance = diffuseColor.rgb * vEmis * 0.85;
        // 冰封：泛青白
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.86, 1.0), vState.y * 0.72);
        totalEmissiveRadiance += vec3(0.25, 0.55, 0.9) * vState.y * 0.5;
        // 受击闪白
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vState.x * 0.85);
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.5) * vState.x * 2.2;
        // 边缘光：贴着轮廓描一道，兽的体积感全靠它
        float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        rimF = pow(rimF, 3.6);
        totalEmissiveRadiance += mix(uRimColor, diffuseColor.rgb * 1.6, 0.55) * rimF * uRim;
      `)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        ${TOON_BODY}`);
  };
  m.customProgramCacheKey = () => 'beast';
  return m;
}

/* ------------------------------------------------------------------
   描边壳：同一批实例、同一套顶点动画，法线外扩后只画背面。
   顶点法线在 build() 里已按位置焊接过，方盒棱角处不会裂。
   ------------------------------------------------------------------ */
export function makeBeastOutlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: beastUniforms.uTime,
      uInk: beastUniforms.uInk,
      uInkColor: beastUniforms.uInkColor,
    },
    vertexShader: /* glsl */`
      attribute vec3 aSmooth;
      attribute vec4 aAnim;
      attribute float aPhase;
      attribute float aGait;
      attribute vec3 aState;
      uniform float uTime;
      uniform float uInk;
      varying float vCut;
      void main() {
        vec3 transformed = position;
        vec3 animNormal = normalize(aSmooth);
        ${BEAST_ANIM}
        vCut = aState.z;
        vec4 wp = vec4(transformed, 1.0);
        vec3 wn = animNormal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = normalize(mat3(instanceMatrix) * animNormal);
        #endif
        vec4 mv = modelViewMatrix * wp;
        vec3 vn = normalize(normalMatrix * wn);
        // 线宽随视距放大 —— 屏幕上粗细基本恒定
        float w = uInk * clamp(-mv.z, 12.0, 220.0);
        mv.xyz += vn * w;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uInkColor;
      varying float vCut;
      void main() {
        if (vCut > 0.45) discard;       // 消散中的兽不再描边
        gl_FragColor = vec4(uInkColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    fog: false,
  });
}

/* ============================================================
   接地阴影 —— 贴在地面的一团软影，物体立刻「站」得住
   ============================================================ */
const blobVert = /* glsl */`
  attribute vec4 aBlob;   // xyz: 位置 w: 半径
  attribute float aDark;
  varying vec2 vUv;
  varying float vDark;
  void main() {
    vUv = uv;
    vDark = aDark;
    vec3 p = vec3(position.x * aBlob.w, 0.0, position.y * aBlob.w) + aBlob.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const blobFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying float vDark;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.1) * vDark;
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.02, 0.03, 0.035, a);
  }
`;

export class GroundBlobs {
  constructor(scene, max = 200) {
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.aBlob = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aDark = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.aBlob.setUsage(THREE.DynamicDrawUsage);
    this.aDark.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBlob', this.aBlob);
    geo.setAttribute('aDark', this.aDark);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: blobVert, fragmentShader: blobFrag,
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.max = max; this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, y, z, r, dark = 0.42) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const a = this.aBlob.array;
    a[i * 4] = x; a[i * 4 + 1] = y + 0.06; a[i * 4 + 2] = z; a[i * 4 + 3] = r;
    this.aDark.array[i] = dark;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aBlob.needsUpdate = true;
    this.aDark.needsUpdate = true;
  }
  dispose(scene) {
    this.geo.dispose();
    this.material.dispose();
    scene.remove(this.mesh);
  }

}

/* ============================================================
   血条：面向相机的实例化条
   ============================================================ */
const barVert = /* glsl */`
  attribute vec3 aPos;
  attribute vec3 aInfo;   // x: 血量比例 y: 宽度 z: 可见
  varying vec2 vUv;
  varying float vHp;
  varying float vVis;
  uniform float uScale;
  void main() {
    vUv = uv;
    vHp = aInfo.x;
    vVis = aInfo.z;
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    float w = aInfo.y * uScale;
    mv.xy += position.xy * vec2(w, w * 0.14);
    gl_Position = projectionMatrix * mv;
  }
`;
const barFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying float vHp;
  varying float vVis;
  void main() {
    if (vVis < 0.5) discard;
    float edge = 0.09;
    vec3 bg = vec3(0.06, 0.05, 0.04);
    vec3 fg = mix(vec3(0.92, 0.24, 0.18), vec3(0.45, 0.86, 0.42), smoothstep(0.25, 0.72, vHp));
    float inside = step(edge, vUv.x) * step(vUv.x, 1.0 - edge) * step(0.18, vUv.y) * step(vUv.y, 0.82);
    vec3 col = mix(bg, fg, step(vUv.x, mix(edge, 1.0 - edge, vHp)) * inside);
    float a = mix(0.75, 1.0, inside);
    gl_FragColor = vec4(col, a * vVis);
  }
`;

export class HealthBars {
  constructor(scene, max = 160) {
    const g = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = g.index;
    geo.attributes.position = g.attributes.position;
    geo.attributes.uv = g.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aInfo.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aInfo', this.aInfo);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1.0 } },
      vertexShader: barVert, fragmentShader: barFrag,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.max = max;
    this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, y, z, hp, width, vis = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.aPos.array[i * 3] = x; this.aPos.array[i * 3 + 1] = y; this.aPos.array[i * 3 + 2] = z;
    this.aInfo.array[i * 3] = hp; this.aInfo.array[i * 3 + 1] = width; this.aInfo.array[i * 3 + 2] = vis;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aInfo.needsUpdate = true;
  }
  dispose(scene) {
    this.geo.dispose();
    this.material.dispose();
    scene.remove(this.mesh);
  }

}
