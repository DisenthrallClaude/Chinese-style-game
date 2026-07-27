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
}
