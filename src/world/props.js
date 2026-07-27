// 陈设 —— 灯笼、旗幡、石兽、器具，让山谷有人烟气
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, torus, plane, T, beam } from './geo.js';
import { toonify } from '../core/toon.js';

/* ============================================================
   灯笼群（实例化，夜里点亮，随风轻摆）
   ============================================================ */
export class Lanterns {
  constructor(materials, max = 220) {
    this.M = materials;
    this.items = [];
    this.max = max;

    // 灯笼纸身：旋转体
    const prof = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = (t - 0.5) * 1.0;
      const r = Math.sqrt(Math.max(0.0001, 1 - Math.pow(t * 2 - 1, 2))) * 0.52 + 0.06;
      prof.push(new THREE.Vector2(r, y));
    }
    this.globeGeo = new THREE.LatheGeometry(prof, 14);

    const capParts = [];
    const c1 = cyl(0.20, 0.24, 0.11, 10, 1.6); T(c1, 0, 0.52, 0); capParts.push(c1);
    const c2 = cyl(0.24, 0.20, 0.11, 10, 1.6); T(c2, 0, -0.52, 0); capParts.push(c2);
    const rod = cyl(0.028, 0.028, 0.55, 6, 2); T(rod, 0, 0.85, 0); capParts.push(rod);
    const tass = cone(0.10, 0.36, 7, 2); T(tass, 0, -0.74, 0, Math.PI, 0, 0); capParts.push(tass);
    this.capGeo = mergeList(capParts);

    this.globes = new THREE.InstancedMesh(this.globeGeo, materials.paper, max);
    this.caps = new THREE.InstancedMesh(this.capGeo, materials.woodRed, max);
    this.globes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.globes.castShadow = false;
    this.caps.castShadow = true;
    this.globes.count = 0;
    this.caps.count = 0;
    this.globes.frustumCulled = false;
    this.caps.frustumCulled = false;

    this.group = new THREE.Group();
    this.group.add(this.globes, this.caps);

    this.lights = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  add(x, y, z, scale = 1, color = null) {
    if (this.items.length >= this.max) return;
    this.items.push({ x, y, z, s: scale, phase: Math.random() * 9, amp: 0.03 + Math.random() * 0.05 });
    this.globes.count = this.items.length;
    this.caps.count = this.items.length;
  }

  // 少量点光源用于近处的暖光晕
  addLights(scene, picks) {
    for (const i of picks) {
      const it = this.items[i];
      if (!it) continue;
      const l = new THREE.PointLight(0xffa746, 0, 16, 1.8);
      l.position.set(it.x, it.y, it.z);
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(t, level) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const sw = Math.sin(t * 0.7 + it.phase) * it.amp;
      const sw2 = Math.cos(t * 0.53 + it.phase * 1.7) * it.amp * 0.7;
      this._e.set(sw, 0, sw2);
      this._q.setFromEuler(this._e);
      this._p.set(it.x + sw2 * 0.4 * it.s, it.y, it.z + sw * 0.4 * it.s);
      this._s.set(it.s, it.s, it.s);
      this._m.compose(this._p, this._q, this._s);
      this.globes.setMatrixAt(i, this._m);
      this.caps.setMatrixAt(i, this._m);
    }
    this.globes.instanceMatrix.needsUpdate = true;
    this.caps.instanceMatrix.needsUpdate = true;
    for (const l of this.lights) l.intensity = level * 26;
  }
}

function mergeList(list) {
  let count = 0, icount = 0;
  for (const g of list) { count += g.attributes.position.count; icount += g.index.count; }
  const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

/* ============================================================
   旗幡 —— 顶点波动的布料
   ============================================================ */
export const clothUniforms = { uTime: { value: 0 }, uWind: { value: 1.0 } };

export function makeClothMaterial(base) {
  const m = base.clone();
  m.userData = { ...base.userData };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clothUniforms.uTime;
    shader.uniforms.uWind = clothUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hang = (0.5 - uv.y);
        float wav = sin(uv.y * 7.0 + uTime * 2.1 + position.x * 0.9) * 0.5
                  + sin(uv.y * 3.1 - uTime * 1.4 + position.y * 1.7) * 0.5;
        float amp = pow(max(0.0, 1.0 - uv.y), 1.4) * 0.22 * uWind;
        transformed.z += wav * amp;
        transformed.x += sin(uv.y * 4.0 + uTime * 1.7) * amp * 0.35;
      `);
  };
  m.customProgramCacheKey = () => 'cloth';
  toonify(m, 0.30);
  return m;
}

export function addBanner(B, x, y, z, ry, w = 0.9, h = 4.2, mat = 'bannerRed') {
  B.add('woodDark', T(box(w + 0.4, 0.1, 0.1, 1.2), x, y, z, 0, ry, 0));
  B.add(mat, T(plane(w, h, 1.0, 4, 10), x, y - h / 2 - 0.06, z, 0, ry, 0));
  for (const s of [-1, 1]) {
    const ox = Math.cos(ry) * s * (w / 2 + 0.16), oz = -Math.sin(ry) * s * (w / 2 + 0.16);
    B.add('gold', T(sphere(0.06, 6, 5, 2), x + ox, y, z + oz));
  }
}

/* ============================================================
   零散陈设
   ============================================================ */
export function addStoneLion(B, x, y, z, ry = 0, s = 1) {
  B.add('stoneCut', T(box(1.0 * s, 0.45 * s, 1.3 * s, 0.7), x, y + 0.22 * s, z, 0, ry, 0));
  B.add('stone', T(box(0.62 * s, 0.72 * s, 0.95 * s, 0.9), x, y + 0.80 * s, z, 0, ry, 0));
  const hx = x + Math.sin(ry) * 0.24 * s, hz = z + Math.cos(ry) * 0.24 * s;
  B.add('stone', T(sphere(0.34 * s, 10, 8, 1.4), hx, y + 1.38 * s, hz));
  B.add('stone', T(sphere(0.15 * s, 7, 6, 1.6), hx + Math.cos(ry) * 0.2 * s, y + 1.56 * s, hz - Math.sin(ry) * 0.2 * s));
  B.add('stone', T(sphere(0.15 * s, 7, 6, 1.6), hx - Math.cos(ry) * 0.2 * s, y + 1.56 * s, hz + Math.sin(ry) * 0.2 * s));
  B.add('stone', T(sphere(0.20 * s, 8, 7, 1.6), hx + Math.sin(ry) * 0.18 * s, y + 1.05 * s, hz + Math.cos(ry) * 0.18 * s));
  // 前爪
  for (const sgn of [-1, 1]) {
    const px = x + Math.cos(ry) * 0.22 * s * sgn + Math.sin(ry) * 0.42 * s;
    const pz = z - Math.sin(ry) * 0.22 * s * sgn + Math.cos(ry) * 0.42 * s;
    B.add('stone', T(box(0.20 * s, 0.52 * s, 0.30 * s, 1.0), px, y + 0.70 * s, pz, 0, ry, 0));
  }
}

export function addBarrel(B, x, y, z, ry = 0, s = 1, mat = 'wood') {
  B.add(mat, T(cyl(0.42 * s, 0.46 * s, 1.0 * s, 12, 0.9), x, y + 0.5 * s, z, 0, ry, 0));
  B.add('iron', T(torus(0.46 * s, 0.035 * s, 5, 14, 1.6), x, y + 0.22 * s, z, Math.PI / 2, 0, 0));
  B.add('iron', T(torus(0.44 * s, 0.035 * s, 5, 14, 1.6), x, y + 0.80 * s, z, Math.PI / 2, 0, 0));
}

export function addCrate(B, x, y, z, ry = 0, s = 1) {
  B.add('wood', T(box(0.9 * s, 0.75 * s, 0.9 * s, 0.9), x, y + 0.38 * s, z, 0, ry, 0));
  B.add('woodDark', T(box(0.94 * s, 0.09 * s, 0.94 * s, 0.9), x, y + 0.70 * s, z, 0, ry, 0));
  B.add('woodDark', T(box(0.94 * s, 0.09 * s, 0.94 * s, 0.9), x, y + 0.10 * s, z, 0, ry, 0));
}

export function addWorkbench(B, x, y, z, ry = 0) {
  B.add('wood', T(box(3.2, 0.16, 1.4, 0.7), x, y + 0.92, z, 0, ry, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + Math.cos(ry) * sx * 1.4 + Math.sin(ry) * sz * 0.55;
    const pz = z - Math.sin(ry) * sx * 1.4 + Math.cos(ry) * sz * 0.55;
    B.add('woodDark', T(box(0.16, 0.92, 0.16, 0.8), px, y + 0.46, pz, 0, ry, 0));
  }
  // 图卷
  B.add('paperWhite', T(cyl(0.11, 0.11, 1.1, 8, 1.4), x - Math.cos(ry) * 0.8, y + 1.06, z + Math.sin(ry) * 0.8, 0, ry, Math.PI / 2));
  B.add('paperWhite', T(box(1.2, 0.02, 0.7, 1.0), x + Math.cos(ry) * 0.5, y + 1.01, z - Math.sin(ry) * 0.5, 0, ry, 0));
  // 器具
  B.add('bronze', T(cyl(0.16, 0.18, 0.16, 10, 1.6), x + Math.cos(ry) * 1.1, y + 1.08, z - Math.sin(ry) * 1.1));
  B.add('iron', T(box(0.5, 0.05, 0.09, 1.6), x - Math.cos(ry) * 0.2, y + 1.03, z + Math.sin(ry) * 0.2, 0, ry + 0.4, 0));
}

export function addWell(B, x, y, z) {
  B.add('stone', T(cyl(1.05, 1.15, 0.9, 16, 0.6), x, y + 0.45, z));
  B.add('stoneCut', T(cyl(1.2, 1.2, 0.16, 16, 0.8), x, y + 0.94, z));
  for (const s of [-1, 1]) {
    B.add('woodDark', T(cyl(0.11, 0.13, 2.3, 8, 0.7), x + s * 1.0, y + 1.15, z));
  }
  B.add('woodDark', T(box(2.4, 0.16, 0.16, 0.8), x, y + 2.3, z));
  B.add('tileDark', T(cone(1.7, 0.7, 4, 0.6), x, y + 2.7, z, 0, Math.PI / 4, 0));
}

export function addFence(B, x0, z0, x1, z1, y, h = 1.1, mat = 'wood') {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 1.4));
  const ang = Math.atan2(dx, dz);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.add(mat, T(box(0.14, h, 0.14, 0.8), x0 + dx * t, y + h / 2, z0 + dz * t));
  }
  B.add(mat, T(box(len, 0.09, 0.11, 0.6), (x0 + x1) / 2, y + h * 0.82, (z0 + z1) / 2, 0, ang, 0));
  B.add(mat, T(box(len, 0.09, 0.11, 0.6), (x0 + x1) / 2, y + h * 0.42, (z0 + z1) / 2, 0, ang, 0));
}

export function addCart(B, x, y, z, ry = 0) {
  B.add('wood', T(box(2.4, 0.14, 1.3, 0.8), x, y + 0.78, z, 0, ry, 0));
  for (const s of [-1, 1]) {
    const px = x + Math.sin(ry) * 0 + Math.cos(ry) * 0, pz = z;
    const ox = Math.sin(ry) * s * 0.72, oz = Math.cos(ry) * s * 0.72;
    B.add('woodDark', T(torus(0.62, 0.09, 5, 14, 0.9), px + ox, y + 0.62, pz + oz, 0, ry + Math.PI / 2, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.add('woodDark', T(box(0.06, 1.16, 0.06, 1.2), px + ox, y + 0.62, pz + oz, 0, ry, a));
    }
  }
  B.add('woodDark', T(box(0.12, 0.12, 2.0, 0.9), x + Math.sin(ry) * 1.9, y + 0.72, z + Math.cos(ry) * 1.9, 0.16, ry, 0));
}

export function addIncenseBurner(B, x, y, z, s = 1) {
  B.add('bronze', T(cyl(0.62 * s, 0.52 * s, 0.72 * s, 14, 0.8), x, y + 0.36 * s, z));
  B.add('bronze', T(torus(0.60 * s, 0.06 * s, 5, 16, 1.2), x, y + 0.70 * s, z, Math.PI / 2, 0, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    B.add('bronze', T(cyl(0.07 * s, 0.09 * s, 0.4 * s, 6, 1.2), x + Math.cos(a) * 0.42 * s, y + 0.06 * s, z + Math.sin(a) * 0.42 * s, 0.2, 0, 0));
  }
  B.add('bronze', T(cone(0.5 * s, 0.34 * s, 12, 0.9), x, y + 0.9 * s, z));
  B.add('gold', T(sphere(0.09 * s, 7, 6, 2), x, y + 1.1 * s, z));
}

export function addRockCluster(B, x, y, z, s = 1, seed = 1) {
  const rng = new Rng(seed * 977 + 3);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const rr = rng.range(0.5, 1.5) * s;
    const g = sphere(rr, 7, 5, 0.6);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const f = 0.72 + rng.next() * 0.5;
      p.setXYZ(k, p.getX(k) * f * 1.2, p.getY(k) * f * 0.72, p.getZ(k) * f);
    }
    g.computeVertexNormals();
    B.add('stone', T(g, x + rng.range(-1.4, 1.4) * s, y + rr * 0.32, z + rng.range(-1.4, 1.4) * s,
      rng.range(0, 0.4), rng.range(0, 6.28), rng.range(0, 0.4)));
  }
}

// 悬挂的绳索与滑轮
export function addRopeLine(B, x0, y0, z0, x1, y1, z1, sag = 0.6, seg = 8) {
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const s0 = Math.sin(Math.PI * t0), s1 = Math.sin(Math.PI * t1);
    const p0 = [lerp(x0, x1, t0), lerp(y0, y1, t0) - s0 * sag, lerp(z0, z1, t0)];
    const p1 = [lerp(x0, x1, t1), lerp(y0, y1, t1) - s1 * sag, lerp(z0, z1, t1)];
    B.add('iron', beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.035, 0.035, 2.0));
  }
}

// 匾额
export function addSignboard(B, x, y, z, ry, w = 2.6, h = 0.9) {
  B.add('woodDark', T(box(w, h, 0.16, 0.7), x, y, z, 0, ry, 0));
  B.add('gold', T(box(w * 0.92, h * 0.7, 0.19, 0.9), x, y, z, 0, ry, 0));
  B.add('woodRed', T(box(w * 0.86, h * 0.56, 0.21, 0.9), x, y, z, 0, ry, 0));
}
