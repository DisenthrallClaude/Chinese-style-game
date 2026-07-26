// 营造法式 · 基础构件 —— 带世界尺度 UV 的图元与合并工具
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

// UV 按真实尺寸铺展，使所有构件共用一张材质而不会拉伸
export function scaleUV(geo, sx, sy, ox = 0, oy = 0) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * sx + ox, uv.getY(i) * sy + oy);
  }
  uv.needsUpdate = true;
  return geo;
}

// 立方体：六面各自按真实边长铺 UV
export function box(w, h, d, uvScale = 0.32) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const uv = g.attributes.uv;
  // BoxGeometry 面序: +X, -X, +Y, -Y, +Z, -Z，每面 4 顶点
  const dims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * fw * uvScale, uv.getY(i) * fh * uvScale);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function cyl(rt, rb, h, seg = 12, uvScale = 0.32, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  scaleUV(g, Math.PI * (rt + rb) * uvScale, h * uvScale);
  return g;
}

export function cone(r, h, seg = 10, uvScale = 0.32) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  scaleUV(g, Math.PI * 2 * r * uvScale, h * uvScale);
  return g;
}

export function sphere(r, w = 12, h = 8, uvScale = 0.32) {
  const g = new THREE.SphereGeometry(r, w, h);
  scaleUV(g, Math.PI * 2 * r * uvScale, Math.PI * r * uvScale);
  return g;
}

export function torus(r, tube, rs = 8, ts = 20, uvScale = 0.32, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, tube, rs, ts, arc);
  scaleUV(g, r * arc * uvScale, Math.PI * 2 * tube * uvScale);
  return g;
}

export function plane(w, h, uvScale = 0.32, wseg = 1, hseg = 1) {
  const g = new THREE.PlaneGeometry(w, h, wseg, hseg);
  scaleUV(g, w * uvScale, h * uvScale);
  return g;
}

// 梯形棱台（台基、须弥座）
export function frustum(wTop, dTop, wBot, dBot, h, uvScale = 0.32) {
  const hw1 = wTop / 2, hd1 = dTop / 2, hw0 = wBot / 2, hd0 = dBot / 2;
  const y0 = -h / 2, y1 = h / 2;
  const v = [
    [-hw0, y0, -hd0], [hw0, y0, -hd0], [hw0, y0, hd0], [-hw0, y0, hd0],
    [-hw1, y1, -hd1], [hw1, y1, -hd1], [hw1, y1, hd1], [-hw1, y1, hd1],
  ];
  const faces = [
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
    [4, 5, 6, 7], [3, 2, 1, 0],
  ];
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (const f of faces) {
    const p = f.map(i => v[i]);
    const w = Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2]);
    const hh = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    const uvs = [[0, 0], [w * uvScale, 0], [w * uvScale, hh * uvScale], [0, hh * uvScale]];
    for (let i = 0; i < 4; i++) { pos.push(...p[i]); uv.push(...uvs[i]); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function T(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

// 沿两点之间架一根梁
export function beam(x0, y0, z0, x1, y1, z1, w, h, uvScale = 0.32) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const g = box(w, h, len, uvScale);
  const mid = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  _m.compose(mid, q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

/* ============================================================
   按材质分组累积几何，最后合并为少量 draw call
   ============================================================ */
export class MeshBuilder {
  constructor() { this.groups = new Map(); }

  add(key, geo) {
    let a = this.groups.get(key);
    if (!a) { a = []; this.groups.set(key, a); }
    a.push(geo);
    return this;
  }

  // 直接把已定位的几何加入
  addAt(key, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(key, T(geo, x, y, z, rx, ry, rz));
  }

  merge(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, list] of this.groups) {
      if (!list.length) continue;
      const mat = materials[key];
      if (!mat) { console.warn('缺少材质', key); continue; }
      let geo;
      try {
        geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      } catch (e) {
        geo = list[0];
      }
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow && mat.userData.noShadow !== true;
      mesh.receiveShadow = receiveShadow;
      mesh.name = key;
      group.add(mesh);
    }
    this.groups.clear();
    return group;
  }
}

/* ============================================================
   中式屋顶曲面
   d = 到檐口的内推距离 -> 决定坡面高度；四角起翘成飞檐
   ============================================================ */
export function roofSurface(L, D, opts = {}) {
  const {
    height = 3.2,        // 脊高（相对檐口）
    overhang = 1.5,      // 出檐
    hip = true,          // 庑殿(四坡) / 悬山(两坡)
    curve = 2.15,        // 反宇曲度
    upturn = 0.9,        // 翼角起翘
    cornerOut = 0.55,    // 翼角外挑
    segX = 40, segZ = 22,
    tile = 0.30,         // 瓦垄密度
    eaveDrop = 0.0,
  } = opts;

  const HX = L / 2 + overhang, HZ = D / 2 + overhang;
  const maxD = hip ? Math.min(HX, HZ) : HZ;

  const pos = [], uv = [], idx = [];
  const gx = segX, gz = segZ;
  const surf = (u, v) => {
    // u,v ∈ [0,1] 覆盖整个屋顶投影矩形
    let x = (u - 0.5) * 2 * HX;
    let z = (v - 0.5) * 2 * HZ;
    const dx = HX - Math.abs(x);
    const dz = HZ - Math.abs(z);
    const dist = hip ? Math.min(dx, dz) : dz;
    const t = 1 - Math.min(1, dist / maxD);          // 0 脊 -> 1 檐
    const f = 1 - Math.pow(1 - t, curve);
    let y = height * (1 - f) - eaveDrop * t;
    // 翼角
    const cx = Math.abs(x) / HX, cz = Math.abs(z) / HZ;
    const cw = Math.pow(Math.max(0, (cx - 0.52) / 0.48), 1.6) * Math.pow(Math.max(0, (cz - 0.52) / 0.48), 1.6);
    if (cw > 0) {
      y += cw * upturn;
      x += Math.sign(x) * cw * cornerOut;
      z += Math.sign(z) * cw * cornerOut;
    }
    // 檐口略微上卷
    const eaveT = Math.pow(Math.max(0, (t - 0.86) / 0.14), 2);
    y += eaveT * upturn * 0.30;
    return [x, y, z, dx, dz];
  };

  for (let i = 0; i <= gz; i++) {
    for (let j = 0; j <= gx; j++) {
      const u = j / gx, v = i / gz;
      const [x, y, z, dx, dz] = surf(u, v);
      pos.push(x, y, z);
      // 瓦垄顺坡而下：以最近檐口方向决定 UV 走向
      if (hip && dx < dz) uv.push(z * tile, x * tile);
      else uv.push(x * tile, z * tile);
    }
  }
  for (let i = 0; i < gz; i++) {
    for (let j = 0; j < gx; j++) {
      const a = i * (gx + 1) + j, b = a + gx + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 屋顶下表面（望板），避免从下方看穿
export function roofUnder(L, D, opts = {}) {
  const g = roofSurface(L, D, { ...opts, segX: 12, segZ: 8, tile: 0.24 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - 0.16);
  p.needsUpdate = true;
  // 翻面
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t;
  }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// 正脊 / 垂脊：沿屋面顶线放一根带起翘的脊
export function ridgeBar(x0, z0, x1, z1, y0, y1, w = 0.34, h = 0.42, uvScale = 0.5) {
  return beam(x0, y0, z0, x1, y1, z1, w, h, uvScale);
}
