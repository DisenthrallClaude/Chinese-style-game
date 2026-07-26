// 异兽志 —— 程序化生成《山海经》凶兽，实例化绘制，肢体在顶点着色器里动
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, T } from '../world/geo.js';

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
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
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
function ellip(rx, ry, rz, seg = 10) {
  const g = sphere(1, seg, Math.max(6, seg - 2), 0.5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  g.computeVertexNormals();
  return g;
}

function addSpine(B, col, o = {}) {
  // 分段的躯干：从头到尾逐渐收细，整体做蛇形摆动
  const { len = 3.0, r = 0.55, segs = 6, y = 1.0, taper = 0.5, wave = 0.06, rise = 0, seg = 9 } = o;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const rr = r * lerp(1.0, taper, Math.pow(t, 1.2)) * (1 - Math.pow(Math.abs(t - 0.42) * 1.5, 2) * 0.16);
    const z = lerp(len * 0.5, -len * 0.5, t);
    const g = ellip(rr * 1.02, rr, rr * (len / segs) * 0.82, seg);
    T(g, 0, y + rise * Math.sin(t * Math.PI), z);
    B.push(g, col, 0, [wave * t, t * 1.6, 0, 0]);
  }
}

function addLeg(B, col, x, z, o = {}) {
  const { h = 1.0, r = 0.14, phase = 0, y = 1.0, swing = 0.16, foot = true } = o;
  const g = cyl(r * 0.72, r, h, 6, 0.6);
  T(g, x, y - h / 2, z);
  B.push(g, col, 0, [swing, phase, 0, 0]);
  if (foot) {
    const f = ellip(r * 1.5, r * 0.7, r * 2.0, 7);
    T(f, x, y - h + r * 0.5, z + r * 0.6);
    B.push(f, col, 0, [swing * 1.2, phase, 0, 0]);
  }
}

function addWing(B, col, side, o = {}) {
  const { span = 2.2, chord = 1.1, y = 1.3, z = 0.1, flap = 0.55, tilt = 0.1, emis = 0 } = o;
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const w = span * (0.42 + t * 0.36);
    const g = box(w, 0.08, chord * (1 - t * 0.42), 0.7);
    T(g, side * (span * 0.30 + w * 0.5 * t + 0.18), y + t * 0.24, z - t * 0.4, tilt, side * t * 0.34, side * (0.1 + t * 0.18));
    B.push(g, col, emis * t, [0, 0, flap * (0.6 + t * 0.7), y]);
  }
  // 翼骨
  const bone = cyl(0.05, 0.09, span, 6, 0.8);
  T(bone, side * span * 0.5, y + 0.1, z, 0, 0, Math.PI / 2);
  B.push(bone, col, 0, [0, 0, flap, y]);
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
    const g = ellip(rr, rr, step * 0.62, 7);
    T(g, px, py, pz);
    B.push(g, col, emis * t, [0.10 + t * 0.26, phase + t * 2.2, 0, 0]);
  }
}

function addHead(B, col, accent, o = {}) {
  const {
    y = 1.5, z = 1.7, r = 0.42, kind = 'beast', eye = 2, eyeColor = accent,
    horn = 0, jaw = true, phase = 0,
  } = o;
  const g = ellip(r, r * 0.92, r * 1.32, 9);
  T(g, 0, y, z);
  B.push(g, col, 0, [0.05, phase, 0, 0]);
  if (jaw) {
    const j = ellip(r * 0.68, r * 0.42, r * 0.92, 7);
    T(j, 0, y - r * 0.52, z + r * 0.42);
    B.push(j, col, 0, [0.05, phase, 0, 0]);
  }
  // 眼
  const eyes = eye === 1 ? [[0, 0]] : [[-r * 0.5, 0], [r * 0.5, 0]];
  for (const [ex] of eyes) {
    const e = ellip(r * (eye === 1 ? 0.34 : 0.19), r * (eye === 1 ? 0.30 : 0.17), r * 0.14, 7);
    T(e, ex, y + r * 0.22, z + r * 0.98);
    B.push(e, eyeColor, 1.0, [0.05, phase, 0, 0]);
  }
  // 角
  for (let i = 0; i < horn; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const hg = cone(r * 0.20, r * (1.1 + (i >> 1) * 0.4), 6, 0.8);
    T(hg, s * r * 0.52, y + r * 0.86 + (i >> 1) * 0.12, z - r * 0.24, -0.4, 0, s * 0.42);
    B.push(hg, accent, 0.12, [0.05, phase, 0, 0]);
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
    for (let i = 0; i < 3; i++)
      addTail(B, c, { len: 1.5, r: 0.11, y: 0.94, z: -1.05, ang: (i - 1) * 0.42, phase: i * 1.7, curve: 0.5 });
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
    addTail(B, c, { len: 1.9, r: 0.17, y: 1.1, z: -1.5, curve: 0.2 });
  },
  // 蠃鱼：鱼身鸟翼
  luoyu(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.52, segs: 6, y: 1.1, taper: 0.32, wave: 0.14 });
    addWing(B, a, -1, { span: 2.0, chord: 0.9, y: 1.42, z: 0.2, flap: 0.5, emis: 0.35 });
    addWing(B, a, 1, { span: 2.0, chord: 0.9, y: 1.42, z: 0.2, flap: 0.5, emis: 0.35 });
    addHead(B, c, a, { y: 1.22, z: 1.5, r: 0.38, jaw: true, eyeColor: [0.7, 1.0, 1.0] });
    // 尾鳍
    const f = box(0.06, 1.0, 0.9, 0.8);
    T(f, 0, 1.15, -1.5, 0, 0, 0);
    B.push(f, a, 0.3, [0.3, 2.0, 0, 0]);
    for (const [x, z, ph] of [[-0.30, 0.5, 0], [0.30, 0.5, 3.1]])
      addLeg(B, c, x, z, { h: 0.7, r: 0.09, phase: ph, y: 1.0, swing: 0.24 });
  },
  // 鵸鵌：三首六尾之鸟
  qitu(B, c, a) {
    addSpine(B, c, { len: 1.6, r: 0.40, segs: 4, y: 1.5, taper: 0.6, wave: 0.04 });
    addWing(B, c, -1, { span: 2.4, chord: 1.0, y: 1.62, z: 0.0, flap: 0.75, emis: 0.2 });
    addWing(B, c, 1, { span: 2.4, chord: 1.0, y: 1.62, z: 0.0, flap: 0.75, emis: 0.2 });
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
    addWing(B, c, -1, { span: 2.9, chord: 1.3, y: 1.72, z: 0.0, flap: 0.68, emis: 0.55 });
    addWing(B, c, 1, { span: 2.9, chord: 1.3, y: 1.72, z: 0.0, flap: 0.68, emis: 0.55 });
    const nk = cyl(0.11, 0.17, 0.9, 6, 0.8);
    T(nk, 0, 1.95, 0.8, 0.85, 0, 0);
    B.push(nk, c, 0.1, [0.07, 0, 0, 0]);
    addHead(B, c, a, { y: 2.22, z: 1.2, r: 0.26, jaw: false, eyeColor: [1, 0.85, 0.3] });
    const beak = cone(0.10, 0.5, 6, 0.9);
    T(beak, 0, 2.2, 1.5, Math.PI / 2, 0, 0);
    B.push(beak, a, 0.5, [0.07, 0, 0, 0]);
    addLeg(B, a, 0, -0.1, { h: 1.5, r: 0.10, phase: 0, y: 1.5, swing: 0.10 });
    for (let i = 0; i < 4; i++)
      addTail(B, a, { len: 1.5, r: 0.08, y: 1.55, z: -0.85, ang: (i - 1.5) * 0.22, phase: i * 1.4, emis: 0.8, curve: 0.1 });
  },
  // 化蛇：人面豺身，蛇尾
  huashe(B, c, a) {
    addSpine(B, c, { len: 2.6, r: 0.50, segs: 6, y: 1.0, taper: 0.42, wave: 0.08 });
    for (const [x, z, ph] of [[-0.38, 0.85, 0], [0.38, 0.85, 3.1], [-0.38, -0.7, 3.1], [0.38, -0.7, 0]])
      addLeg(B, c, x, z, { h: 1.0, r: 0.12, phase: ph, y: 1.0, swing: 0.2 });
    // 人面
    const f = ellip(0.34, 0.42, 0.26, 9);
    T(f, 0, 1.5, 1.42);
    B.push(f, a, 0.18, [0.05, 0, 0, 0]);
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
    for (const s of [-1, 1]) {
      const ear = cone(0.11, 0.32, 5, 0.9);
      T(ear, s * 0.2, 1.62, 1.3, -0.2, 0, s * 0.3);
      B.push(ear, c, 0, [0.05, 0, 0, 0]);
    }
    for (let i = 0; i < 9; i++)
      addTail(B, a, {
        len: 2.0, r: 0.13, y: 1.15, z: -1.2, ang: (i - 4) * 0.24,
        phase: i * 0.9, emis: 0.55, curve: 0.55, segs: 5,
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
    B.push(m, a, 0.85, [0.04, 0, 0, 0]);
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
    B.push(glow, a, 0.55, [0.10, 0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1;
      const k = i % 3;
      addLeg(B, c, s * 0.72, (k - 1) * 0.72, { h: 1.15, r: 0.13, phase: i * 1.05, y: 1.15, swing: 0.22 });
    }
    for (const s of [-1, 1]) {
      addWing(B, a, s, { span: 1.9, chord: 0.9, y: 2.0, z: 0.35, flap: 0.6, emis: 0.5 });
      addWing(B, a, s, { span: 1.5, chord: 0.7, y: 1.7, z: -0.55, flap: 0.7, emis: 0.4 });
    }
  },
  // 穷奇：虎而有翼
  qiongqi(B, c, a) {
    addSpine(B, c, { len: 3.4, r: 0.72, segs: 6, y: 1.5, taper: 0.5, wave: 0.05 });
    for (const [x, z, ph] of [[-0.58, 1.2, 0], [0.58, 1.2, 3.1], [-0.58, -1.05, 3.1], [0.58, -1.05, 0]])
      addLeg(B, c, x, z, { h: 1.5, r: 0.20, phase: ph, y: 1.5, swing: 0.18 });
    addHead(B, c, a, { y: 1.86, z: 2.0, r: 0.56, horn: 2, eyeColor: [1.0, 0.35, 0.2] });
    for (let i = 0; i < 6; i++) {
      const tth = cone(0.06, 0.24, 5, 1.0);
      T(tth, (i - 2.5) * 0.14, 1.66, 2.44, Math.PI, 0, 0);
      B.push(tth, [0.95, 0.92, 0.84], 0.1, [0.05, 0, 0, 0]);
    }
    addWing(B, a, -1, { span: 3.6, chord: 1.7, y: 2.15, z: 0.3, flap: 0.42, emis: 0.28 });
    addWing(B, a, 1, { span: 3.6, chord: 1.7, y: 2.15, z: 0.3, flap: 0.42, emis: 0.28 });
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
      B.push(hn, a, 0.4, [0.04, 0, 0, 0]);
    }
    // 雷纹
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const r2 = box(0.12, 0.5, 0.12, 1.0);
      T(r2, Math.sin(i * 2.1) * 0.7, 2.7 + Math.sin(i * 1.3) * 0.3, lerp(1.6, -1.8, t), 0, 0, Math.sin(i) * 0.9);
      B.push(r2, [0.6, 0.9, 1.0], 1.0, [0.10, i * 0.8, 0, 0]);
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
        B.push(fin, a, 0.7, [0.14 + t * 0.5, t * 3.4, 0, 0]);
      }
    }
    // 人面
    const f = ellip(0.95, 1.1, 0.7, 12);
    T(f, 0, 2.6, 2.75);
    B.push(f, a, 0.22, [0.06, 0, 0, 0]);
    for (const ex of [-0.36, 0.36]) {
      const e = ellip(0.2, 0.14, 0.12, 8);
      T(e, ex, 2.85, 3.28);
      B.push(e, [1.0, 0.9, 0.35], 1.0, [0.06, 0, 0, 0]);
    }
    for (const s of [-1, 1]) {
      const hn = cone(0.16, 1.5, 6, 0.7);
      T(hn, s * 0.62, 3.5, 2.5, -0.5, 0, s * 0.5);
      B.push(hn, a, 0.5, [0.06, 0, 0, 0]);
      const wh = box(0.06, 0.06, 1.9, 1.0);
      T(wh, s * 0.7, 2.5, 3.4, 0, s * 0.5, 0);
      B.push(wh, a, 0.9, [0.3, s * 2, 0, 0]);
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
export const beastUniforms = { uTime: { value: 0 } };

export function makeBeastMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.66,
    metalness: 0.10,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = beastUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aAnim;
        attribute float aEmis;
        attribute float aPhase;
        attribute float aGait;
        attribute vec3 aState;   // x: 受击闪白 y: 冰冻 z: 生死渐隐
        uniform float uTime;
        varying float vEmis;
        varying vec3 vState;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEmis = aEmis;
        vState = aState;
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
        }
        transformed *= max(0.02, 1.0 - aState.z * 0.55);
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vEmis;
        varying vec3 vState;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = diffuseColor.rgb * vEmis * 1.7;
        // 冰封：泛青白
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.86, 1.0), vState.y * 0.72);
        totalEmissiveRadiance += vec3(0.25, 0.55, 0.9) * vState.y * 0.5;
        // 受击闪白
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vState.x * 0.85);
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.5) * vState.x * 2.2;
      `);
  };
  m.customProgramCacheKey = () => 'beast';
  return m;
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
