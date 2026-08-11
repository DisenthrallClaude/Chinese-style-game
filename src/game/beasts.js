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
  const {
    span = 2.2, chord = 1.1, y = 1.3, z = 0.1, flap = 0.55, tilt = 0.1, emis = 0,
    // 飞羽的枚数。大鸟身上照旧只排九枚的话，一枚就有半米宽 ——
    // 远看是一叠板子，不是翼。翼展越大就该排得越密。
    feathers = 0,
  } = o;
  const nF = feathers || Math.max(9, Math.round(span * 4.2));
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
  // 飞羽：贴着骨架排开，向后掠、向下垂。中段最长，往翼尖既收窄又变短，
  // 相邻两枚彼此压叠 —— 这样才是一层羽面，不是一排等宽的板
  for (let i = 0; i < nF; i++) {
    const t = (i + 0.5) / nF;
    const p = arm(t);
    const len = chord * (0.60 + 0.92 * Math.sin(Math.PI * (0.20 + t * 0.76)));
    const wid = (span / nF) * (1.85 - t * 0.75);      // 压叠：比间距宽，越往尖越窄
    const g = box(wid, 0.040, len, 0.7);
    T(g, p[0], p[1] - 0.04 - t * 0.16, p[2] - len * 0.46,
      tilt + 0.14 + t * 0.26, side * t * 0.50, side * (0.06 + t * 0.34));
    B.push(g, col, emis * (0.35 + t * 0.55), [0, 0, flap * (0.55 + t * 0.85), y]);
    // 羽轴：一根细梁贯到羽尖，近看有筋
    B.push(T(box(wid * 0.16, 0.050, len * 0.94, 1.0),
      p[0], p[1] - 0.03 - t * 0.16, p[2] - len * 0.46,
      tilt + 0.14 + t * 0.26, side * t * 0.50, side * (0.06 + t * 0.34)),
      [col[0] * 0.72, col[1] * 0.70, col[2] * 0.74], emis * 0.5,
      [0, 0, flap * (0.55 + t * 0.85), y]);
  }
  // 覆羽：压在飞羽根部的两排短羽，翼面于是有了厚度
  for (let row = 0; row < 2; row++) {
    const nC = 7 - row * 2;
    for (let i = 0; i < nC; i++) {
      const t = (i + 0.5) / nC * (0.82 - row * 0.20);
      const p = arm(t);
      const g = box(span / nC * 1.5, 0.045, chord * (0.40 - row * 0.12), 0.8);
      T(g, p[0], p[1] + 0.06 + row * 0.05, p[2] - chord * (0.14 - row * 0.05),
        tilt + 0.06, side * t * 0.30, side * (0.10 + t * 0.24));
      B.push(g, col, emis * (0.30 - row * 0.10), [0, 0, flap * (0.4 + t * 0.5), y]);
    }
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

/* ============================================================
   细部零件 —— 四、五两关的异兽用得最多
   ------------------------------------------------------------
   四、五关的凶兽原先都是「几个椭球拼一下」，远看还行，近看就散。
   下面几件是专治这个的：人面有颅骨眉弓与发，鱼身有鳞列与鳍条，
   兽身有鬃与斑纹，蹄足分趾。用的还是同一套图元，只是排布密了、
   层次分了 —— 一族仍然只有一次 draw call。
   ============================================================ */

// 人面：颅、眉弓、颊、鼻、唇、发。山海经里一多半的凶兽都长着人脸，
// 这一件做细，整族的近景立刻不一样。
function addFace(B, col, accent, o = {}) {
  const {
    y = 2.0, z = 1.8, r = 0.5, phase = 0, hair = true,
    eyeColor = [1.0, 0.9, 0.4], hairCol = null, crown = 0,
  } = o;
  const anim = [0.05, phase, 0, 0];
  const hc = hairCol || [col[0] * 0.42, col[1] * 0.40, col[2] * 0.44];

  // 颅：上宽下窄的一枚椭球，比正球更像人头
  B.push(T(ellip(r * 0.92, r * 1.06, r * 0.80, 14), 0, y, z), accent, 0.04, anim);
  // 下颌：往前下方收
  B.push(T(ellip(r * 0.62, r * 0.52, r * 0.62, 12), 0, y - r * 0.62, z + r * 0.16), accent, 0.03, anim);
  // 颊骨一对
  for (const s of [-1, 1]) {
    B.push(T(ellip(r * 0.30, r * 0.26, r * 0.24, 9), s * r * 0.56, y - r * 0.10, z + r * 0.42), accent, 0.02, anim);
  }
  // 眉弓：一道横过去的脊，眼睛立刻有了「窝」
  for (const s of [-1, 1]) {
    B.push(T(ellip(r * 0.34, r * 0.10, r * 0.12, 8), s * r * 0.32, y + r * 0.30, z + r * 0.66,
      0, 0, -s * 0.26), accent, 0.05, anim);
  }
  // 眼窝（暗）+ 眼珠（亮）
  for (const s of [-1, 1]) {
    B.push(T(ellip(r * 0.20, r * 0.16, r * 0.08, 9), s * r * 0.32, y + r * 0.10, z + r * 0.70),
      [0.07, 0.05, 0.06], 0.0, anim);
    B.push(T(ellip(r * 0.13, r * 0.11, r * 0.09, 8), s * r * 0.32, y + r * 0.11, z + r * 0.76),
      eyeColor, 1.0, anim);
  }
  // 鼻
  B.push(T(ellip(r * 0.12, r * 0.22, r * 0.16, 8), 0, y - r * 0.10, z + r * 0.80), accent, 0.02, anim);
  B.push(T(ellip(r * 0.16, r * 0.08, r * 0.10, 8), 0, y - r * 0.26, z + r * 0.80), accent, 0.02, anim);
  // 唇
  B.push(T(ellip(r * 0.26, r * 0.07, r * 0.08, 9), 0, y - r * 0.44, z + r * 0.72),
    [accent[0] * 0.72, accent[1] * 0.52, accent[2] * 0.54], 0.02, anim);
  // 发：绕颅后一圈团块，前额留出来。
  // 小脸（开明兽那九张）就少给几缕 —— 九张脸各来十缕，一族的顶点数会翻上去，
  // 而描边壳还要再走一遍。
  if (hair) {
    const n = r < 0.34 ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const a = -0.6 + (i / (n - 1)) * (Math.PI * 2 - 1.2) + Math.PI / 2;
      const rr = r * 0.94;
      B.push(T(ellip(r * 0.28, r * 0.32, r * 0.24, r < 0.34 ? 7 : 8),
        Math.cos(a) * rr, y + r * 0.34 + Math.sin(i * 1.7) * r * 0.14, z + Math.sin(a) * rr * 0.72),
        hc, 0.0, [0.06, phase + i * 0.4, 0, 0]);
    }
  }
  // 冠：山海经里的神多半戴着点什么
  for (let i = 0; i < crown; i++) {
    const a = (i / Math.max(1, crown - 1) - 0.5) * 1.5;
    B.push(T(cone(r * 0.10, r * 0.62, 5, 1.0),
      Math.sin(a) * r * 0.64, y + r * 1.14, z + Math.cos(a) * r * 0.30, -0.22, 0, -a * 0.8),
      col, 0.22, anim);
  }
}

// 鳞列：沿一段躯干贴一层层叠瓦式的小片。鱼身、蛇身近看就有东西可读了
function addScales(B, col, o = {}) {
  const { from = 1.2, to = -1.4, y = 1.4, r = 0.5, rows = 6, perRow = 7, size = 0.16, emis = 0.05, phase = 0 } = o;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const z = from + (to - from) * t;
    const rr = r * (1 - Math.pow(Math.abs(t - 0.35) * 1.5, 2) * 0.30);
    for (let k = 0; k < perRow; k++) {
      const a = (k / perRow) * Math.PI * 2 + (i % 2) * (Math.PI / perRow);
      // 只贴上半圈与侧面，肚皮不要
      if (Math.sin(a) < -0.55) continue;
      const px = Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
      B.push(T(ellip(size, size * 0.34, size * 0.9, 6), px, py, z, 0, a + Math.PI / 2, a * 0.2),
        [col[0] * 1.12, col[1] * 1.10, col[2] * 1.14], emis, [0.06 + t * 0.14, phase + t * 1.6, 0, 0]);
    }
  }
}

// 鳍：一排鳍条撑着一片膜，比一块方板像鳍得多
function addFin(B, col, o = {}) {
  const {
    x = 0, y = 1.5, z = 0, len = 1.4, span = 1.0, rays = 6,
    ang = 0, tilt = 0, emis = 0.2, phase = 0, flap = 0,
  } = o;
  for (let i = 0; i < rays; i++) {
    const t = i / (rays - 1);
    const L = len * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + t * 0.7)));
    const a = ang + (t - 0.5) * span;
    const ex = x + Math.sin(a) * L, ez = z + Math.cos(a) * L;
    const ey = y - L * tilt;
    B.push(beam(x, y, z, ex, ey, ez, 0.045, 0.045, 1.2), col, emis, [0, 0, flap, y]);
    // 膜：相邻两条鳍条之间的一片
    if (i < rays - 1) {
      const t2 = (i + 1) / (rays - 1);
      const L2 = len * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + t2 * 0.7)));
      const a2 = ang + (t2 - 0.5) * span;
      const mx = x + Math.sin((a + a2) / 2) * (L + L2) * 0.28;
      const mz = z + Math.cos((a + a2) / 2) * (L + L2) * 0.28;
      const my = y - (L + L2) * 0.28 * tilt;
      B.push(T(box(Math.abs(a2 - a) * (L + L2) * 0.30, 0.022, (L + L2) * 0.44, 0.9),
        mx, my, mz, tilt * 0.6, (a + a2) / 2, 0), col, emis * 0.7, [0, 0, flap * 0.8, y]);
    }
  }
}

// 鬃 / 背毛：沿脊线一排带弧度的簇
function addMane(B, col, o = {}) {
  const { from = 1.4, to = -0.6, y = 2.2, drop = 0.6, n = 9, w = 0.09, emis = 0.12, phase = 0 } = o;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = from + (to - from) * t;
    const h = drop * (0.6 + 0.4 * Math.sin(Math.PI * t));
    B.push(T(box(w, h, w * 2.2, 1.0), 0, y - h * 0.3, z, -0.34 - t * 0.2, 0, Math.sin(i * 2.1) * 0.22),
      col, emis, [0.08 + t * 0.20, phase + t * 2.2, 0, 0]);
    // 两侧各分一缕
    for (const s of [-1, 1]) {
      B.push(T(box(w * 0.7, h * 0.72, w * 1.8, 1.0), s * w * 1.4, y - h * 0.42, z, -0.30, 0, s * 0.32),
        col, emis * 0.8, [0.09 + t * 0.20, phase + t * 2.2 + s, 0, 0]);
    }
  }
}

// 斑纹：贴在躯干侧面的一道道弯带（虎文、豹纹）
function addStripes(B, col, o = {}) {
  const { from = 1.2, to = -1.4, y = 1.5, r = 0.6, n = 8, w = 0.07, h = 0.34, emis = 0.06 } = o;
  // 调用处递进来的多半是 accent，而 accent 常常接近白 —— 照原色贴上去
  // 就是沿着身子插了一排白板。虎文本来是暗的，先压到三成半。
  const dark = [col[0] * 0.34, col[1] * 0.30, col[2] * 0.30];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = from + (to - from) * t;
    for (const s of [-1, 1]) {
      const bend = Math.sin(i * 1.9) * 0.5;
      // 贴着身子的弧面走，别戳出去
      const rr = r * 0.90;
      const yy = y + Math.sin(i * 1.3) * r * 0.22;
      B.push(T(box(w, h, r * 0.26, 1.0), s * rr, yy, z, 0, 0, s * (0.4 + bend)),
        dark, emis * 0.4, [0.05, 0, 0, 0]);
      // 背上也搭一道，从侧面翻过脊
      if (i % 2 === 0) {
        B.push(T(box(w * 0.9, h * 0.7, r * 0.24, 1.0), s * rr * 0.52, yy + r * 0.62, z,
          0, 0, s * (1.1 + bend * 0.4)), dark, emis * 0.4, [0.05, 0, 0, 0]);
      }
    }
  }
}

// 蹄：分趾，比一个球更像脚
function addHoof(B, col, x, y, z, r = 0.16, phase = 0, swing = 0.16) {
  const anim = [swing * 1.2, phase, 0, 0];
  B.push(T(ellip(r * 1.20, r * 0.86, r * 1.05, 10), x, y + r * 0.5, z), col, 0, anim);
  for (const s of [-1, 1]) {
    B.push(T(ellip(r * 0.52, r * 0.62, r * 0.78, 8), x + s * r * 0.44, y + r * 0.34, z + r * 0.30),
      [0.24, 0.20, 0.18], 0.02, anim);
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
  // 陵鱼：人面手足鱼身，在海中
  lingyu(B, c, a) {
    // 鱼身：前粗后细，尾部收成一条
    addSpine(B, c, { len: 2.8, r: 0.52, segs: 8, y: 1.35, taper: 0.28, wave: 0.13, seg: 15 });
    addScales(B, c, { from: 1.1, to: -1.3, y: 1.35, r: 0.50, rows: 7, perRow: 8, size: 0.15, emis: 0.10 });
    // 背鳍：一排鳍条撑起的膜
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      addFin(B, a, {
        x: 0, y: 1.82 - t * 0.06, z: 0.85 - t * 1.7, len: 0.62 - t * 0.16, span: 0.5,
        rays: 3, ang: 0, tilt: -1.6, emis: 0.26, phase: i * 0.9,
      });
    }
    // 胸鳍一对（当手用的那对在上面，这对在腹侧）
    for (const s2 of [-1, 1]) {
      addFin(B, a, {
        x: s2 * 0.44, y: 1.10, z: 0.42, len: 0.95, span: 0.9, rays: 5,
        ang: s2 * 1.5, tilt: 0.32, emis: 0.24, flap: 0.34,
      });
    }
    // 人的手足：陵鱼「人面手足」，这是它跟别的鱼身之属的分野
    for (const s2 of [-1, 1]) {
      B.push(T(ellip(0.17, 0.17, 0.17, 9), s2 * 0.42, 1.52, 0.66), c, 0, [0.06, 0, 0, 0]);
      B.push(beam(s2 * 0.42, 1.52, 0.66, s2 * 0.76, 1.02, 0.92, 0.12, 0.12, 0.8), c, 0, [0.16, s2 * 2, 0, 0]);
      B.push(beam(s2 * 0.76, 1.02, 0.92, s2 * 0.70, 0.62, 1.14, 0.10, 0.10, 0.8), c, 0, [0.22, s2 * 2, 0, 0]);
      // 五指
      for (let k = 0; k < 4; k++) {
        B.push(T(ellip(0.030, 0.030, 0.10, 6), s2 * (0.62 + k * 0.055), 0.50, 1.22 + Math.sin(k) * 0.03),
          c, 0, [0.24, s2 * 2 + k, 0, 0]);
      }
      // 足：藏在鱼身之下
      addLeg(B, c, s2 * 0.30, -0.30, { h: 0.72, r: 0.085, phase: s2 > 0 ? 0 : 3.1, y: 1.06, swing: 0.22, claw: false });
    }
    // 人面
    addFace(B, a, c, { y: 1.72, z: 1.34, r: 0.36, eyeColor: [0.55, 1.0, 0.92], crown: 3 });
    // 尾鳍：上下两叶
    for (const s2 of [-1, 1]) {
      addFin(B, a, {
        x: 0, y: 1.34 + s2 * 0.10, z: -1.48, len: 1.15, span: 0.75, rays: 5,
        ang: Math.PI, tilt: -s2 * 0.55, emis: 0.30, flap: 0.20, phase: s2,
      });
    }
  },
  // 奢比尸：兽身人面大耳，珥两青蛇
  shebishi(B, c, a) {
    addSpine(B, c, { len: 3.2, r: 0.74, segs: 8, y: 1.42, taper: 0.56, wave: 0.05, seg: 16 });
    for (const [x, z, ph] of [[-0.60, 1.05, 0], [0.60, 1.05, 3.1], [-0.60, -0.95, 3.1], [0.60, -0.95, 0]])
      addLeg(B, c, x, z, { h: 1.42, r: 0.21, phase: ph, y: 1.42, swing: 0.18 });
    // 人面：这一族的脸是招牌，做全套 —— 颅、眉、颊、鼻、唇、发
    addFace(B, c, a, { y: 1.98, z: 1.74, r: 0.50, eyeColor: [1.0, 0.86, 0.35], crown: 0 });
    // 大耳：珥蛇之处
    for (const s2 of [-1, 1]) {
      const e = ellip(0.11, 0.44, 0.30, 11);
      T(e, s2 * 0.62, 2.06, 1.58, 0, s2 * 0.4, s2 * 0.30);
      B.push(e, c, 0, [0.05, 0, 0, 0]);
      // 耳轮：里面再套一片，耳朵就不是一块板
      const e2 = ellip(0.07, 0.30, 0.20, 9);
      T(e2, s2 * 0.66, 2.04, 1.66, 0, s2 * 0.4, s2 * 0.30);
      B.push(e2, [c[0] * 0.60 + 0.26, c[1] * 0.50 + 0.18, c[2] * 0.50 + 0.18], 0.02, [0.05, 0, 0, 0]);
      // 耳上悬的青蛇：分节 + 头 + 信子
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const rr = 0.095 * (1 - t * 0.42);
        B.push(T(ellip(rr, rr, rr * 1.7, 8),
          s2 * (0.72 + Math.sin(t * 3.4) * 0.22), 1.86 - t * 0.86, 1.58 + Math.cos(t * 2.6) * 0.20),
          [0.30, 0.86, 0.52], 0.30, [0.30 + t * 0.4, s2 * 2 + t * 3.2, 0, 0]);
      }
      B.push(T(ellip(0.11, 0.09, 0.15, 8), s2 * 0.82, 1.00, 1.72), [0.34, 0.92, 0.56], 0.36,
        [0.72, s2 * 2 + 3.2, 0, 0]);
      B.push(T(ellip(0.02, 0.02, 0.11, 5), s2 * 0.82, 0.98, 1.90), [0.95, 0.30, 0.34], 0.5,
        [0.74, s2 * 2 + 3.2, 0, 0]);
    }
    addMane(B, a, { from: 1.5, to: -0.4, y: 2.06, drop: 0.42, n: 8, w: 0.08, emis: 0.16 });
    addRidge(B, a, { from: -0.5, to: -1.6, y: 1.90, h: 0.22, n: 5, emis: 0.14 });
    addStripes(B, a, { from: 1.0, to: -1.5, y: 1.46, r: 0.70, n: 7, w: 0.075, h: 0.30, emis: 0.06 });
    addTail(B, c, { len: 1.8, r: 0.18, y: 1.44, z: -1.7, curve: 0.18, segs: 6 });
  },
  // 鱄鱼：状如鲋而彘毛，振鳍而飞
  zhuanyu(B, c, a) {
    addSpine(B, c, { len: 2.0, r: 0.52, segs: 6, y: 1.5, taper: 0.30, wave: 0.13, seg: 15 });
    addScales(B, c, { from: 0.9, to: -0.9, y: 1.5, r: 0.50, rows: 6, perRow: 8, size: 0.14, emis: 0.12 });
    // 胸鳍当翼：鳍条撑膜，扇起来一片一片地动
    for (const s2 of [-1, 1]) {
      addFin(B, a, {
        x: s2 * 0.40, y: 1.56, z: 0.28, len: 1.75, span: 1.15, rays: 7,
        ang: s2 * 1.45, tilt: 0.16, emis: 0.28, flap: 0.85,
      });
    }
    addHead(B, c, a, { y: 1.56, z: 1.16, r: 0.36, jaw: true, eyeColor: [1.0, 0.8, 0.35] });
    // 鳃盖：一片半月形的硬壳，鱼头就有了骨相
    for (const s2 of [-1, 1]) {
      B.push(T(ellip(0.09, 0.30, 0.24, 10), s2 * 0.36, 1.54, 0.86, 0, s2 * 0.3, 0),
        [c[0] * 1.15, c[1] * 1.12, c[2] * 1.15], 0.10, [0.06, 0, 0, 0]);
    }
    // 口须
    for (const s2 of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const t = i / 2;
        B.push(T(ellip(0.028, 0.028, 0.13, 5),
          s2 * (0.14 + t * 0.16), 1.36 - t * 0.14, 1.52 + t * 0.22), a, 0.24,
          [0.18 + t * 0.3, s2 * 2 + i, 0, 0]);
      }
    }
    // 彘毛：背上一排硬鬃，一族的名号就在这儿
    addMane(B, a, { from: 0.85, to: -0.95, y: 1.88, drop: 0.36, n: 10, w: 0.055, emis: 0.24 });
    // 尾鳍
    for (const s2 of [-1, 1]) {
      addFin(B, a, {
        x: 0, y: 1.50 + s2 * 0.09, z: -1.06, len: 0.92, span: 0.7, rays: 5,
        ang: Math.PI, tilt: -s2 * 0.6, emis: 0.30, flap: 0.34, phase: s2,
      });
    }
  },
  // 禺彊：人面鸟身，珥两青蛇，践两青蛇
  yuqiang(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.98, segs: 7, y: 2.30, taper: 0.62, wave: 0.05, seg: 16 });
    addWing(B, a, -1, { span: 3.6, chord: 1.5, y: 2.55, z: 0.20, flap: 0.40, emis: 0.09, feathers: 17 });
    addWing(B, a, 1, { span: 3.6, chord: 1.5, y: 2.55, z: 0.20, flap: 0.40, emis: 0.09, feathers: 17 });
    // 覆在鸟身上的三层羽：胸、腹、腰各一圈，剪影就不再是个光溜的椭球
    for (let L = 0; L < 3; L++) {
      const zz = 0.85 - L * 0.85;
      const rr = 0.98 - L * 0.10;
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2 + L * 0.28;
        if (Math.sin(ang) < -0.75) continue;
        B.push(T(box(0.19, 0.045, 0.34, 0.8),
          Math.cos(ang) * rr, 2.30 + Math.sin(ang) * rr * 0.92, zz,
          0.18, ang + Math.PI / 2, ang * 0.14),
          [c[0] * 1.12, c[1] * 1.10, c[2] * 1.12], 0.04, [0.05, L + i * 0.3, 0, 0]);
      }
    }
    // 颈与人面：北海之神，脸上要有神气
    const nk = cyl(0.26, 0.36, 0.72, 9, 0.7);
    T(nk, 0, 2.92, 1.10, 0.42, 0, 0);
    B.push(nk, c, 0, [0.06, 0, 0, 0]);
    addFace(B, c, a, { y: 3.26, z: 1.30, r: 0.60, eyeColor: [0.55, 1.0, 1.0], crown: 5 });
    // 颔下的须
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      B.push(T(ellip(0.05, 0.05, 0.20, 6),
        (t - 0.5) * 0.34, 2.86 - t * 0.10, 1.62 - Math.abs(t - 0.5) * 0.18),
        a, 0.22, [0.20, i * 1.1, 0, 0]);
    }
    // 耳上与足下各一对青蛇：分节 + 蛇头 + 信子
    for (const s2 of [-1, 1]) {
      for (const [oy, oz, ph] of [[3.06, 1.16, 0], [0.30, 0.20, 1.7]]) {
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const rr = 0.115 * (1 - t * 0.45);
          const px = s2 * (0.70 + Math.sin(t * 3.6) * 0.30);
          const py = oy - t * (oy > 1 ? 0.92 : 0.0);
          const pz = oz + (oy > 1 ? Math.cos(t * 2.4) * 0.22 : -t * 1.5);
          B.push(T(ellip(rr, rr, rr * 1.7, 8), px, py, pz),
            [0.24, 0.82, 0.72], 0.36, [0.30 + t * 0.4, s2 * 2 + t * 3 + ph, 0, 0]);
        }
        const hx = s2 * 0.86, hy = oy > 1 ? oy - 0.96 : oy, hz = oy > 1 ? oz + 0.18 : oz - 1.6;
        B.push(T(ellip(0.13, 0.10, 0.17, 9), hx, hy, hz), [0.28, 0.88, 0.76], 0.40,
          [0.72, s2 * 2 + 3 + ph, 0, 0]);
        B.push(T(ellip(0.022, 0.022, 0.12, 5), hx, hy - 0.01, hz + 0.20), [0.95, 0.30, 0.34], 0.55,
          [0.74, s2 * 2 + 3 + ph, 0, 0]);
      }
      addLeg(B, c, s2 * 0.56, -0.10, { h: 1.95, r: 0.22, phase: s2 > 0 ? 0 : 3.1, y: 2.10, swing: 0.14 });
    }
    addRidge(B, a, { from: 1.4, to: -1.5, y: 2.94, h: 0.30, n: 9, emis: 0.28 });
  },

  /* ============================================================
     五 · 昆仑天阙
     ============================================================ */
  // 土蝼：状如羊而四角，是食人
  tulou(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.54, segs: 7, y: 1.18, taper: 0.54, wave: 0.05, seg: 15 });
    for (const [x, z, ph] of [[-0.40, 0.88, 0], [0.40, 0.88, 3.1], [-0.40, -0.78, 3.1], [0.40, -0.78, 0]]) {
      addLeg(B, c, x, z, { h: 1.18, r: 0.14, phase: ph, y: 1.18, swing: 0.18, claw: false, foot: false });
      addHoof(B, [0.26, 0.22, 0.20], x, 1.18 - 1.18, z + 0.10, 0.15, ph, 0.18);
    }
    // 羊头：长脸、方吻，与虎豹之属分得开
    addHead(B, c, a, { y: 1.44, z: 1.32, r: 0.32, eyeColor: [1.0, 0.9, 0.4] });
    B.push(T(ellip(0.20, 0.19, 0.30, 11), 0, 1.34, 1.76), c, 0, [0.05, 0, 0, 0]);
    addEars(B, c, { y: 1.56, z: 1.10, r: 0.10, spread: 0.30, len: 0.34, tilt: 0.55 });
    // 四角：两对，前一对短而直，后一对长而盘旋 —— 一族的名号就在这四只角上
    for (const s2 of [-1, 1]) {
      // 前角
      const h1 = cone(0.085, 0.52, 7, 0.8);
      T(h1, s2 * 0.22, 1.72, 1.14, -0.50, 0, s2 * 0.72);
      B.push(h1, a, 0.16, [0.05, 0, 0, 0]);
      // 后角：分四节向后盘
      let px = s2 * 0.30, py = 1.70, pz = 0.92;
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const r2 = 0.10 - t * 0.045;
        const nx2 = px + s2 * (0.20 - t * 0.06);
        const ny2 = py + 0.16 - t * 0.20;
        const nz2 = pz - 0.16 - t * 0.16;
        B.push(beam(px, py, pz, nx2, ny2, nz2, r2 * 2.0, r2 * 2.0, 0.9), a, 0.20, [0.05, 0, 0, 0]);
        // 角上的环棱
        B.push(T(ellip(r2 * 1.35, r2 * 1.35, r2 * 0.42, 8), nx2, ny2, nz2), a, 0.24, [0.05, 0, 0, 0]);
        px = nx2; py = ny2; pz = nz2;
      }
    }
    // 羊毛：三层错开的团块，密而有层，不再是一圈孤零零的球
    for (let L = 0; L < 3; L++) {
      const rr = 0.50 + L * 0.045;
      const n = 12 - L * 2;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + L * 0.5;
        if (Math.sin(ang) < -0.62) continue;
        const zz = 0.72 - L * 0.62 + Math.sin(i * 1.9) * 0.16;
        B.push(T(ellip(0.24 - L * 0.03, 0.22 - L * 0.03, 0.24 - L * 0.03, 8),
          Math.cos(ang) * rr, 1.20 + Math.sin(ang) * rr * 0.95, zz),
          [c[0] * (1.02 + L * 0.05), c[1] * (1.02 + L * 0.05), c[2] * (1.0 + L * 0.05)],
          0, [0.06, i * 0.6 + L, 0, 0]);
      }
    }
    addTail(B, c, { len: 0.8, r: 0.11, y: 1.24, z: -1.24, curve: -0.2, segs: 3 });
  },
  // 英招：马身而人面，虎文而鸟翼，徇于四海
  yingzhao(B, c, a) {
    addSpine(B, c, { len: 3.0, r: 0.60, segs: 7, y: 1.62, taper: 0.52, wave: 0.05, seg: 16 });
    for (const [x, z, ph] of [[-0.46, 1.05, 0], [0.46, 1.05, 3.1], [-0.46, -0.95, 3.1], [0.46, -0.95, 0]]) {
      addLeg(B, c, x, z, { h: 1.62, r: 0.15, phase: ph, y: 1.62, swing: 0.22, claw: false, foot: false });
      addHoof(B, [0.22, 0.19, 0.17], x, 0, z + 0.10, 0.16, ph, 0.22);
    }
    addWing(B, a, -1, { span: 3.0, chord: 1.25, y: 2.10, z: 0.15, flap: 0.55, emis: 0.22 });
    addWing(B, a, 1, { span: 3.0, chord: 1.25, y: 2.10, z: 0.15, flap: 0.55, emis: 0.22 });
    // 马颈：分三节，粗到细
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const nk = cyl(0.30 - t * 0.07, 0.36 - t * 0.06, 0.40, 10, 0.7);
      T(nk, 0, 1.94 + t * 0.42, 1.24 + t * 0.30, 0.62, 0, 0);
      B.push(nk, c, 0, [0.06, 0, 0, 0]);
    }
    // 人面 + 马鬃
    addFace(B, c, a, { y: 2.66, z: 1.84, r: 0.32, eyeColor: [1.0, 0.95, 0.55], hair: false, crown: 0 });
    addMane(B, a, { from: 1.92, to: 1.16, y: 2.52, drop: 0.52, n: 7, w: 0.075, emis: 0.16 });
    addMane(B, a, { from: 1.10, to: -0.60, y: 2.18, drop: 0.34, n: 8, w: 0.065, emis: 0.12 });
    // 虎文：贴身的弯带
    addStripes(B, a, { from: 1.10, to: -1.30, y: 1.66, r: 0.58, n: 9, w: 0.075, h: 0.32, emis: 0.10 });
    addTail(B, a, { len: 1.9, r: 0.10, y: 1.72, z: -1.58, curve: 0.14, segs: 6, emis: 0.16 });
    // 尾梢的一束毛
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      B.push(T(ellip(0.035, 0.035, 0.28, 6),
        Math.cos(ang) * 0.09, 1.98 + Math.sin(ang) * 0.09, -3.30), a, 0.22, [0.34, i * 1.2, 0, 0]);
    }
  },
  // 陆吾：虎身而九尾，人面而虎爪。司天之九部
  luwu(B, c, a) {
    addSpine(B, c, { len: 3.2, r: 0.66, segs: 8, y: 1.44, taper: 0.50, wave: 0.05, seg: 16 });
    for (const [x, z, ph] of [[-0.54, 1.12, 0], [0.54, 1.12, 3.1], [-0.54, -1.0, 3.1], [0.54, -1.0, 0]])
      addLeg(B, c, x, z, { h: 1.44, r: 0.19, phase: ph, y: 1.44, swing: 0.18 });
    // 人面：司天之神，冠上五道
    addFace(B, c, a, { y: 1.98, z: 1.74, r: 0.46, eyeColor: [1.0, 0.92, 0.45], crown: 5 });
    addEars(B, c, { y: 2.30, z: 1.60, r: 0.14, spread: 0.38, len: 0.36, tilt: 0.12 });
    // 颊边的一圈鬛
    for (const s2 of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        B.push(T(box(0.055, 0.30 - t * 0.08, 0.13, 1.0),
          s2 * (0.44 + t * 0.10), 1.96 - t * 0.30, 1.60 - t * 0.12, 0, 0, s2 * (0.5 + t * 0.4)),
          a, 0.14, [0.06, s2 + i * 0.5, 0, 0]);
      }
    }
    addMane(B, a, { from: 1.40, to: -0.40, y: 1.96, drop: 0.36, n: 8, w: 0.07, emis: 0.18 });
    addRidge(B, a, { from: -0.5, to: -1.5, y: 1.92, h: 0.22, n: 5, emis: 0.20 });
    addStripes(B, a, { from: 1.15, to: -1.40, y: 1.48, r: 0.64, n: 10, w: 0.075, h: 0.34, emis: 0.10 });
    // 九尾：中间一条最粗最长，两侧渐次收细
    for (let i = 0; i < 9; i++) {
      const k = Math.abs(i - 4) / 4;
      addTail(B, [a[0] * 0.62 + c[0] * 0.38, a[1] * 0.62 + c[1] * 0.38, a[2] * 0.62 + c[2] * 0.38], {
        len: 2.2 - k * 0.42, r: 0.105 - k * 0.026, y: 1.58, z: -1.55, ang: (i - 4) * 0.23,
        phase: i * 0.9, emis: 0.10, curve: 0.50, segs: 7,
      });
    }
  },
  // 开明兽：身大类虎而九首，皆人面，东向立昆仑上
  kaiming(B, c, a) {
    addSpine(B, c, { len: 4.2, r: 1.02, segs: 9, y: 2.05, taper: 0.60, wave: 0.04, seg: 17 });
    for (const [x, z, ph] of [[-0.84, 1.5, 0], [0.84, 1.5, 3.1], [-0.84, -1.35, 3.1], [0.84, -1.35, 0]])
      addLeg(B, c, x, z, { h: 2.05, r: 0.30, phase: ph, y: 2.05, swing: 0.15 });
    // 九首：一列人面，中间的最高。每一张脸都做全 —— 这一族的分量全在这儿
    for (let i = 0; i < 9; i++) {
      const k = i - 4;
      const ang = k * 0.19;
      const rise = 1.0 - Math.abs(k) * 0.11;
      const nx = Math.sin(ang) * 1.5;
      const nz = 2.05 + Math.cos(ang) * 0.30;
      const ph = i * 0.7;
      // 颈：分三节，喉部略鼓。颈短了九张脸就贴在背上，成了一排蛋
      for (let j = 0; j < 3; j++) {
        const t = j / 2;
        const nk = cyl(0.17 - t * 0.03, 0.25 - t * 0.04, 0.56, 9, 0.8);
        T(nk, nx * (0.34 + t * 0.42), 2.28 + rise * 0.26 + t * 0.86, nz * (0.46 + t * 0.30),
          0.50, 0, -ang * 1.15);
        B.push(nk, c, 0, [0.10, ph, 0, 0]);
      }
      // 脸：颅、眉、颊、鼻、唇、发、冠 —— addFace 一次给全，再整体平移过去
      const sub = new BeastBuilder();
      addFace(sub, c, a, {
        y: 0, z: 0, r: 0.40, phase: ph, eyeColor: [1.0, 0.90, 0.40], crown: 3,
      });
      // 把这张脸挪到自己的颈上
      const gp = sub.pos;
      for (let v = 0; v < sub.count; v++) {
        gp[v * 3] += nx;
        gp[v * 3 + 1] += 3.22 + rise * 0.86;
        gp[v * 3 + 2] += nz;
      }
      B.pos.push(...sub.pos); B.nor.push(...sub.nor); B.col.push(...sub.col);
      B.emi.push(...sub.emi); B.anim.push(...sub.anim);
      for (const ix of sub.idx) B.idx.push(ix + B.count);
      B.count += sub.count;
    }
    addMane(B, a, { from: 1.70, to: -0.60, y: 2.66, drop: 0.52, n: 10, w: 0.09, emis: 0.22 });
    addRidge(B, a, { from: -0.7, to: -2.0, y: 2.62, h: 0.34, n: 6, emis: 0.24 });
    addStripes(B, a, { from: 1.50, to: -1.90, y: 2.08, r: 1.00, n: 11, w: 0.075, h: 0.34, emis: 0.06 });
    addTail(B, c, { len: 2.6, r: 0.24, y: 2.10, z: -2.2, curve: 0.24, segs: 6, emis: 0.12 });
  },

  /* ============================================================
     六气之属 —— 风、毒、蛊、暗
     ============================================================ */
  // 蠱雕：状如雕而有角，其音如婴儿。腹中养蛊
  gudiao(B, c, a) {
    addSpine(B, c, { len: 2.0, r: 0.46, segs: 5, y: 1.58, taper: 0.52, wave: 0.05 });
    addWing(B, c, -1, { span: 2.8, chord: 1.2, y: 1.74, z: 0.05, flap: 0.72, emis: 0.16 });
    addWing(B, c, 1, { span: 2.8, chord: 1.2, y: 1.74, z: 0.05, flap: 0.72, emis: 0.16 });
    const nk = cyl(0.11, 0.16, 0.66, 7, 0.8);
    T(nk, 0, 1.92, 0.86, 0.72, 0, 0);
    B.push(nk, c, 0, [0.06, 0, 0, 0]);
    addHead(B, c, a, { y: 2.10, z: 1.16, r: 0.28, jaw: false, eyeColor: [1.0, 0.55, 0.95] });
    // 鹰喙：上颚带钩
    const beak = cone(0.11, 0.46, 6, 0.9);
    T(beak, 0, 2.08, 1.46, Math.PI / 2, 0, 0);
    B.push(beak, a, 0.16, [0.06, 0, 0, 0]);
    B.push(T(ellip(0.07, 0.10, 0.09, 7), 0, 1.99, 1.60, 0.5, 0, 0), a, 0.20, [0.06, 0, 0, 0]);
    // 角：雕而有角，一对向后掠
    for (const s of [-1, 1]) {
      const hn = cone(0.075, 0.72, 6, 0.9);
      T(hn, s * 0.17, 2.30, 1.02, -0.92, 0, s * 0.30);
      B.push(hn, a, 0.26, [0.06, 0, 0, 0]);
    }
    // 腹中蛊：一串沿腹线游走的紫色光点，是这一族的记号
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      B.push(T(ellip(0.09, 0.08, 0.09, 7),
        Math.sin(t * 5.2) * 0.20, 1.34 + Math.sin(t * 3.1) * 0.08, 0.62 - t * 1.4),
        [0.95, 0.40, 0.86], 0.85, [0.14 + t * 0.20, i * 0.9, 0, 0]);
    }
    for (const [x, z, ph] of [[-0.22, 0.30, 0], [0.22, 0.30, 3.1]])
      addLeg(B, a, x, z, { h: 0.72, r: 0.085, phase: ph, y: 1.36, swing: 0.20 });
    for (let i = 0; i < 5; i++)
      addTail(B, c, { len: 1.2, r: 0.075, y: 1.52, z: -0.94, ang: (i - 2) * 0.22, phase: i * 1.2, emis: 0.30, curve: 0.16 });
  },

  // 土伯：幽都之神，虎首三目，其角觺觺，其身九约
  tubo(B, c, a) {
    addSpine(B, c, { len: 3.4, r: 0.80, segs: 7, y: 1.62, taper: 0.54, wave: 0.05 });
    for (const [x, z, ph] of [[-0.66, 1.15, 0], [0.66, 1.15, 3.1], [-0.66, -1.05, 3.1], [0.66, -1.05, 0]])
      addLeg(B, c, x, z, { h: 1.62, r: 0.24, phase: ph, y: 1.62, swing: 0.16 });
    // 虎首
    addHead(B, c, a, { y: 2.10, z: 1.86, r: 0.56, eyeColor: [0.72, 0.52, 1.0] });
    // 三目：额上再开一只，比双目更亮
    B.push(T(ellip(0.13, 0.17, 0.10, 9), 0, 2.46, 1.98), [0.86, 0.66, 1.0], 1.0, [0.05, 0, 0, 0]);
    B.push(T(ellip(0.20, 0.24, 0.06, 9), 0, 2.46, 1.92), [0.10, 0.06, 0.18], 0.0, [0.05, 0, 0, 0]);
    addEars(B, c, { y: 2.44, z: 1.66, r: 0.16, spread: 0.42, len: 0.34, tilt: 0.14 });
    // 觺觺之角：一对粗大的分叉角
    for (const s of [-1, 1]) {
      const hn = cone(0.15, 1.05, 6, 0.8);
      T(hn, s * 0.34, 2.68, 1.62, -0.30, 0, s * 0.52);
      B.push(hn, a, 0.22, [0.05, 0, 0, 0]);
      const br = cone(0.085, 0.56, 5, 0.9);
      T(br, s * 0.66, 3.02, 1.42, -0.10, 0, s * 1.05);
      B.push(br, a, 0.26, [0.05, 0, 0, 0]);
    }
    // 九约：身上九道缠绕的暗环。一圈小球看着像气泡纸 ——
    // 改成贴着躯干弧面的扁片，才是「约」（缠束）
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const z = 1.35 - t * 2.9;
      const rr = 0.80 * (1 - t * 0.34);
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * Math.PI * 2 + t * 1.7;
        if (Math.sin(ang) < -0.72) continue;          // 肚皮那面不缠
        B.push(T(box(0.055, 0.20, rr * 0.62, 1.0),
          Math.cos(ang) * rr, 1.62 + Math.sin(ang) * rr * 0.92, z,
          0, ang + Math.PI / 2, ang * 0.12),
          [0.50, 0.38, 0.82], 0.22, [0.05, i * 0.6, 0, 0]);
      }
      // 环上的一枚扣
      B.push(T(ellip(0.10, 0.10, 0.10, 8), 0, 1.62 + rr * 0.94, z), [0.66, 0.52, 0.98], 0.40,
        [0.05, i * 0.6, 0, 0]);
    }
    addRidge(B, a, { from: 1.5, to: -1.7, y: 2.16, h: 0.30, n: 9, emis: 0.24 });
    addTail(B, c, { len: 2.0, r: 0.20, y: 1.64, z: -1.9, curve: 0.20, segs: 5, emis: 0.16 });
  },

  // 蜚：状如牛而白首，一目而蛇尾。行水则竭，行草则死
  fei(B, c, a) {
    addSpine(B, c, { len: 3.0, r: 0.68, segs: 6, y: 1.36, taper: 0.50, wave: 0.06 });
    for (const [x, z, ph] of [[-0.52, 1.0, 0], [0.52, 1.0, 3.1], [-0.52, -0.9, 3.1], [0.52, -0.9, 0]])
      addLeg(B, c, x, z, { h: 1.36, r: 0.18, phase: ph, y: 1.36, swing: 0.18, claw: false });
    // 白首：颜色比躯干淡得多
    const white = [0.90, 0.92, 0.84];
    addHead(B, white, a, { y: 1.66, z: 1.66, r: 0.46, eye: 0, eyeColor: [0.85, 1.0, 0.30] });
    // 一目：正当中一只独眼
    B.push(T(ellip(0.19, 0.21, 0.12, 10), 0, 1.78, 2.02), [0.82, 1.0, 0.28], 1.0, [0.05, 0, 0, 0]);
    B.push(T(ellip(0.07, 0.13, 0.05, 8), 0, 1.78, 2.10), [0.06, 0.10, 0.02], 0.0, [0.05, 0, 0, 0]);
    // 牛角
    for (const s of [-1, 1]) {
      const hn = cone(0.10, 0.72, 6, 0.8);
      T(hn, s * 0.34, 2.02, 1.50, -0.18, 0, s * 1.05);
      B.push(hn, white, 0.06, [0.05, 0, 0, 0]);
    }
    // 蛇尾
    addTail(B, a, { len: 2.6, r: 0.20, y: 1.38, z: -1.55, segs: 7, curve: 0.30, emis: 0.24 });
    // 所过之处的疫气：背上浮着几片低伏的绿雾。做成扁的、错开的，
    // 一串正球看着像葡萄，不像气
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const w = 0.42 - t * 0.10;
      B.push(T(ellip(w, w * 0.34, w * 0.86, 8),
        Math.sin(i * 2.1) * 0.34, 1.96 + t * 0.30 + Math.sin(i * 1.4) * 0.10, 0.95 - t * 2.2,
        Math.sin(i) * 0.2, i * 0.7, Math.cos(i) * 0.18),
        [0.58, 0.82, 0.22], 0.30, [0.16 + t * 0.30, i * 0.8, 0, 0]);
    }
  },

  // 计蒙：人身而龙首，出入必有飘风暴雨
  jimeng(B, c, a) {
    addSpine(B, c, { len: 2.2, r: 0.48, segs: 5, y: 1.80, taper: 0.56, wave: 0.06 });
    addWing(B, a, -1, { span: 3.2, chord: 1.15, y: 2.02, z: 0.10, flap: 0.80, emis: 0.30 });
    addWing(B, a, 1, { span: 3.2, chord: 1.15, y: 2.02, z: 0.10, flap: 0.80, emis: 0.30 });
    // 龙首：长吻 + 后掠的角 + 颔下须
    const nk = cyl(0.15, 0.22, 0.86, 8, 0.7);
    T(nk, 0, 2.24, 0.92, 0.66, 0, 0);
    B.push(nk, c, 0, [0.06, 0, 0, 0]);
    addHead(B, c, a, { y: 2.54, z: 1.36, r: 0.34, eyeColor: [0.60, 1.0, 0.92] });
    const snout = ellip(0.20, 0.18, 0.44, 9);
    T(snout, 0, 2.46, 1.86);
    B.push(snout, c, 0.04, [0.06, 0, 0, 0]);
    for (const s of [-1, 1]) {
      const hn = cone(0.065, 0.80, 5, 0.9);
      T(hn, s * 0.20, 2.76, 1.16, -1.05, 0, s * 0.22);
      B.push(hn, a, 0.30, [0.06, 0, 0, 0]);
      // 颔须
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        B.push(T(ellip(0.045, 0.045, 0.16, 6),
          s * (0.20 + t * 0.22), 2.34 - t * 0.30, 1.86 + t * 0.28),
          a, 0.36, [0.16 + t * 0.3, s * 2 + i, 0, 0]);
      }
    }
    // 人身：肩、臂
    for (const s of [-1, 1]) {
      B.push(T(ellip(0.22, 0.22, 0.22, 9), s * 0.44, 2.00, 0.52), c, 0, [0.06, 0, 0, 0]);
      B.push(beam(s * 0.44, 2.00, 0.52, s * 0.72, 1.30, 0.74, 0.17, 0.17, 0.8), c, 0, [0.14, s * 2, 0, 0]);
      B.push(beam(s * 0.72, 1.30, 0.74, s * 0.60, 0.72, 1.02, 0.13, 0.13, 0.8), c, 0, [0.20, s * 2, 0, 0]);
    }
    for (const [x, z, ph] of [[-0.30, -0.10, 0], [0.30, -0.10, 3.1]])
      addLeg(B, c, x, z, { h: 1.30, r: 0.13, phase: ph, y: 1.56, swing: 0.22, claw: false });
    // 飘风：绕身旋起的一圈风环
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rr = 1.05 + Math.sin(i * 1.9) * 0.20;
      B.push(T(ellip(0.10, 0.06, 0.30, 6),
        Math.cos(ang) * rr, 1.52 + Math.sin(ang * 2) * 0.34, Math.sin(ang) * rr * 0.7 - 0.2,
        0, ang, 0.4),
        [0.62, 0.94, 0.82], 0.62, [0.22, i * 0.52, 0, 0]);
    }
    addTail(B, a, { len: 1.9, r: 0.13, y: 1.72, z: -1.20, segs: 5, curve: 0.22, emis: 0.34 });
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
