// 机关术 —— 齿轮、水车、传动轴、水碓、绞盘，皆可转动
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, torus, plane, T, beam, MeshBuilder } from './geo.js';
import { FallingWater } from './water.js';

/* ---------------------------------------------------------- 环 */
export function ringGeo(rOut, rIn, thick, seg = 28, uvScale = 0.5) {
  const pos = [], uv = [], idx = [];
  const h = thick / 2;
  let n = 0;
  const push = (a, b, c, d, uw, uh) => {
    pos.push(...a, ...b, ...c, ...d);
    uv.push(0, 0, uw, 0, uw, uh, 0, uh);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  };
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const arc = (rOut * Math.PI * 2 / seg) * uvScale;
    // 外圆面
    push([rOut * c0, rOut * s0, -h], [rOut * c1, rOut * s1, -h], [rOut * c1, rOut * s1, h], [rOut * c0, rOut * s0, h], arc, thick * uvScale);
    // 内圆面
    push([rIn * c1, rIn * s1, -h], [rIn * c0, rIn * s0, -h], [rIn * c0, rIn * s0, h], [rIn * c1, rIn * s1, h], arc, thick * uvScale);
    // 前后端面
    push([rIn * c0, rIn * s0, h], [rOut * c0, rOut * s0, h], [rOut * c1, rOut * s1, h], [rIn * c1, rIn * s1, h], (rOut - rIn) * uvScale, arc);
    push([rOut * c0, rOut * s0, -h], [rIn * c0, rIn * s0, -h], [rIn * c1, rIn * s1, -h], [rOut * c1, rOut * s1, -h], (rOut - rIn) * uvScale, arc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------- 齿轮 */
// 轴心为局部 Z 轴，绕 Z 旋转
export function gearGeo(r, teeth, thick, opts = {}) {
  const { hubR = Math.max(0.16, r * 0.20), spokes = 6, webT = thick * 0.45, rimW = r * 0.20 } = opts;
  const parts = [];
  const rimOut = r * 0.9;
  parts.push(ringGeo(rimOut, rimOut - rimW, thick, Math.max(16, teeth), 0.5));
  // 齿
  const toothH = r * 0.16, toothW = (Math.PI * 2 * r) / teeth * 0.52;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const g = box(toothW, toothH * 1.9, thick, 0.7);
    T(g, Math.cos(a) * (rimOut + toothH * 0.62), Math.sin(a) * (rimOut + toothH * 0.62), 0, 0, 0, a + Math.PI / 2);
    parts.push(g);
  }
  // 轮辐
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const len = rimOut - rimW - hubR + 0.06;
    const g = box(len, r * 0.13, webT, 0.7);
    T(g, Math.cos(a) * (hubR + len / 2 - 0.03), Math.sin(a) * (hubR + len / 2 - 0.03), 0, 0, 0, a);
    parts.push(g);
  }
  // 轮毂
  const hub = cyl(hubR, hubR, thick * 1.25, 12, 0.7);
  T(hub, 0, 0, 0, Math.PI / 2, 0, 0);
  parts.push(hub);
  const merged = mergeSafe(parts);
  return merged;
}

function mergeSafe(list) {
  if (list.length === 1) return list[0];
  // 简易合并（所有图元都带 position/uv/index）
  let count = 0, icount = 0;
  for (const g of list) { count += g.attributes.position.count; icount += g.index ? g.index.count : 0; }
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const nor = new Float32Array(count * 3);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, u = g.attributes.uv, nn = g.attributes.normal;
    pos.set(p.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (nn) nor.set(nn.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

/* ============================================================
   机关总管：静态构架合并，转动件单独成 mesh
   ============================================================ */
export class Machinery {
  constructor(materials) {
    this.M = materials;
    this.B = new MeshBuilder();
    this.rotors = [];     // {obj, axis, speed, phase}
    this.oscs = [];       // {fn}
    this.group = new THREE.Group();
    this.waters = [];
    this.emitters = [];   // 水花/尘埃发射点
    this.rate = 1;        // 全局机关转速（游戏可调）
  }

  addRotor(mesh, axis, speed) {
    this.group.add(mesh);
    this.rotors.push({ obj: mesh, axis, speed });
    return mesh;
  }

  gear(matKey, x, y, z, r, teeth, thick, opts = {}) {
    const { axis = 'z', ry = 0, speed = 0.6, tilt = 0 } = opts;
    const g = gearGeo(r, teeth, thick, opts);
    const mesh = new THREE.Mesh(g, this.M[matKey]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    if (axis === 'y') holder.rotation.x = Math.PI / 2;
    else if (axis === 'x') holder.rotation.y = Math.PI / 2;
    holder.rotation.z += tilt;
    if (axis === 'z') holder.rotation.y = ry;
    holder.add(mesh);
    this.group.add(holder);
    this.rotors.push({ obj: mesh, axis: 'z', speed });
    return holder;
  }

  update(dt, t) {
    const r = this.rate;
    for (const ro of this.rotors) {
      ro.obj.rotation[ro.axis] += ro.speed * dt * r;
    }
    for (const o of this.oscs) o(t, dt, r);
    for (const w of this.waters) w.update(t * r);
  }

  build() {
    const merged = this.B.merge(this.M);
    this.group.add(merged);
    return this.group;
  }
}

/* ---------------------------------------------------------- 大水车 */
export function addWaterwheel(mac, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, R = 5.2, width = 2.1, paddles = 18, speed = 0.42,
    flume = true, flumeLen = 14, flumeH = 6.4,
  } = o;
  const B = mac.B, M = mac.M;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // ---- 轮体（转动）
  const wheel = new THREE.Group();
  const parts = [];
  for (const side of [-1, 1]) {
    const rim = ringGeo(R, R * 0.90, 0.22, 30, 0.5);
    T(rim, 0, 0, side * width / 2);
    parts.push(rim);
    const rim2 = ringGeo(R * 0.56, R * 0.48, 0.18, 22, 0.5);
    T(rim2, 0, 0, side * width / 2);
    parts.push(rim2);
    for (let i = 0; i < paddles; i++) {
      const a = (i / paddles) * Math.PI * 2;
      const g = box(R * 0.98, 0.16, 0.16, 0.6);
      T(g, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, side * width / 2, 0, 0, a);
      parts.push(g);
    }
  }
  // 叶板与水斗
  for (let i = 0; i < paddles; i++) {
    const a = (i / paddles) * Math.PI * 2;
    const pb = box(0.9, 0.11, width, 0.6);
    T(pb, Math.cos(a) * (R - 0.44), Math.sin(a) * (R - 0.44), 0, 0, 0, a + 0.42);
    parts.push(pb);
    const bk = box(0.62, 0.10, width * 0.92, 0.6);
    T(bk, Math.cos(a) * (R - 0.86), Math.sin(a) * (R - 0.86), 0, 0, 0, a - 0.9);
    parts.push(bk);
    // 辐条
    const sp = box(R * 0.92, 0.13, 0.13, 0.6);
    T(sp, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, 0, 0, a);
    parts.push(sp);
  }
  const hub = cyl(0.42, 0.42, width + 0.5, 12, 0.6);
  T(hub, 0, 0, 0, Math.PI / 2, 0, 0);
  parts.push(hub);
  const wg = mergeSafe(parts);
  const wm = new THREE.Mesh(wg, M.woodDark);
  wm.castShadow = true; wm.receiveShadow = true;
  wheel.add(wm);
  wheel.position.set(x, y + R * 0.94, z);
  wheel.rotation.y = ry;
  mac.group.add(wheel);
  mac.rotors.push({ obj: wm, axis: 'z', speed });

  // ---- 轴与支架
  const axleY = y + R * 0.94;
  for (const side of [-1, 1]) {
    const [ax, az] = rot(0, side * (width / 2 + 1.5));
    B.add('woodDark', T(cyl(0.26, 0.34, axleY - y + 0.6, 10, 0.5), ax, y + (axleY - y) / 2, az, 0.10 * side, 0, 0));
    B.add('woodDark', beam(ax - 1.6, y, az, ax + 1.6, y, az, 0.34, 0.34, 0.5));
    // 斜撑
    B.add('wood', beam(ax, axleY - 0.5, az, ax + 2.2, y + 0.4, az, 0.22, 0.24, 0.5));
    B.add('wood', beam(ax, axleY - 0.5, az, ax - 2.2, y + 0.4, az, 0.22, 0.24, 0.5));
    // 轴承座
    B.add('iron', T(box(0.7, 0.5, 0.6, 1.1), ax, axleY, az, 0, ry, 0));
  }
  const [sx, sz] = rot(0, -(width / 2 + 1.6)), [ex, ez] = rot(0, width / 2 + 1.6);
  B.add('iron', beam(sx, axleY, sz, ex, axleY, ez, 0.19, 0.19, 0.9));

  // ---- 渡槽 + 落水
  if (flume) {
    const fy = y + flumeH;
    const [f0x, f0z] = rot(-flumeLen, 0), [f1x, f1z] = rot(0.4, 0);
    // 槽身
    B.add('wood', beam(f0x, fy, f0z, f1x, fy - 0.9, f1z, width * 0.9, 0.2, 0.5));
    for (const side of [-1, 1]) {
      const [g0x, g0z] = rot(-flumeLen, side * width * 0.45);
      const [g1x, g1z] = rot(0.4, side * width * 0.45);
      B.add('wood', beam(g0x, fy + 0.26, g0z, g1x, fy - 0.64, g1z, 0.12, 0.55, 0.5));
    }
    // 支架
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const px = lerp(-flumeLen, 0.4, t);
      const py = lerp(fy, fy - 0.9, t);
      const [wx, wz] = rot(px, 0);
      B.add('woodDark', T(cyl(0.16, 0.2, py - y, 8, 0.5), wx, y + (py - y) / 2, wz));
      const [b0x, b0z] = rot(px, -width * 0.5), [b1x, b1z] = rot(px, width * 0.5);
      B.add('woodDark', beam(b0x, py - 0.2, b0z, b1x, py - 0.2, b1z, 0.16, 0.16, 0.5));
    }
    // 水帘
    const fall = new FallingWater(width * 0.86, flumeH - R * 0.8, { speed: 1.15, opacity: 0.82 });
    const [wx, wz] = rot(0.9, 0);
    fall.mesh.position.set(wx, y + flumeH - (flumeH - R * 0.8) / 2 - 0.7, wz);
    fall.mesh.rotation.y = ry + Math.PI / 2;
    mac.group.add(fall.mesh);
    mac.waters.push(fall);
    mac.emitters.push({ x: wx, y: y + R * 0.4, z: wz, kind: 'splash', rate: 26 });
  }

  // 轮下溅起的水花
  mac.emitters.push({ x, y: y + 0.2, z, kind: 'splash', rate: 12 });
  return { axleY, wheel };
}

/* ---------------------------------------------------------- 齿轮塔 */
export function addGearTower(mac, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, H = 17, w = 4.6 } = o;
  const B = mac.B, M = mac.M;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const taper = (t) => lerp(1.0, 0.62, t);

  // 立柱
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const r0 = w / 2 * taper(t0), r1 = w / 2 * taper(t1);
      const [ax, az] = rot(sx * r0, sz * r0);
      const [bx, bz] = rot(sx * r1, sz * r1);
      B.add('woodDark', beam(ax, y + H * t0, az, bx, y + H * t1, bz, 0.30, 0.30, 0.5));
    }
    const [fx, fz] = rot(sx * w / 2, sz * w / 2);
    B.add('stone', T(box(0.8, 0.7, 0.8, 0.5), fx, y + 0.3, fz, 0, ry, 0));
  }
  // 横枋与斜撑
  for (let lv = 1; lv <= 5; lv++) {
    const t = lv / 5.5;
    const r = w / 2 * taper(t);
    const yy = y + H * t;
    const pts = corners.map(([sx, sz]) => rot(sx * r, sz * r));
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      B.add('wood', beam(a[0], yy, a[1], b[0], yy, b[1], 0.20, 0.24, 0.5));
      if (lv < 5) {
        const t2 = (lv + 1) / 5.5;
        const r2 = w / 2 * taper(t2);
        const c = rot(corners[(i + 1) % 4][0] * r2, corners[(i + 1) % 4][1] * r2);
        B.add('wood', beam(a[0], yy, a[1], c[0], y + H * t2, c[1], 0.14, 0.16, 0.5));
      }
    }
    // 平台
    if (lv === 2 || lv === 4) {
      B.add('wood', T(box(r * 2.3, 0.14, r * 2.3, 0.6), x, yy + 0.1, z, 0, ry, 0));
      const rr = r * 1.15;
      const pp = corners.map(([sx, sz]) => rot(sx * rr, sz * rr));
      for (let i = 0; i < 4; i++) {
        const a = pp[i], b = pp[(i + 1) % 4];
        B.add('wood', beam(a[0], yy + 0.9, a[1], b[0], yy + 0.9, b[1], 0.10, 0.12, 0.6));
        B.add('wood', beam(a[0], yy + 0.5, a[1], b[0], yy + 0.5, b[1], 0.08, 0.10, 0.6));
      }
    }
  }

  // 主齿轮组
  const gy = y + H * 0.78;
  const [g0x, g0z] = rot(0, w * 0.42);
  mac.gear('woodDark', g0x, gy, g0z, 2.5, 22, 0.34, { speed: 0.30, ry });
  const [g1x, g1z] = rot(2.35, w * 0.42);
  mac.gear('wood', g1x, gy - 1.5, g1z, 1.25, 12, 0.30, { speed: -0.55, ry });
  const [g2x, g2z] = rot(-2.2, w * 0.42);
  mac.gear('iron', g2x, gy + 1.3, g2z, 1.0, 10, 0.26, { speed: -0.70, ry });

  // 顶部滑轮与吊索
  const topY = y + H;
  const [px, pz] = rot(0, w * 0.30);
  mac.gear('iron', px, topY - 0.5, pz, 0.7, 8, 0.22, { speed: 0.9, ry });
  const [ox, oz] = rot(0, w * 0.30 + 0.0);
  B.add('iron', beam(ox, topY - 0.5, oz, ox, y + 5.4, oz, 0.05, 0.05, 1.2));
  B.add('stone', T(box(0.9, 1.3, 0.9, 0.5), ox, y + 4.7, oz, 0, ry, 0));

  // 顶棚
  const [rx, rz] = rot(0, 0);
  B.add('tileDark', T(cone(w * 0.86, 1.5, 4, 0.6), rx, topY + 0.9, rz, 0, ry + Math.PI / 4, 0));
  B.add('gold', T(sphere(0.28, 8, 6, 1.2), rx, topY + 1.9, rz));

  // 旗幡
  return { topY };
}

/* ---------------------------------------------------------- 传动轴 */
export function addDriveShaft(mac, x0, y0, z0, x1, y1, z1, o = {}) {
  const { r = 0.15, speed = 1.1, posts = true, groundY = null } = o;
  const B = mac.B, M = mac.M;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  if (len < 0.5) return;
  const g = cyl(r, r, len, 10, 0.9);
  T(g, 0, 0, 0, Math.PI / 2, 0, 0);   // 轴沿 Z
  const mesh = new THREE.Mesh(g, M.wood);
  mesh.castShadow = true;
  const holder = new THREE.Group();
  holder.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  holder.lookAt(new THREE.Vector3(x1, y1, z1));
  holder.add(mesh);
  mac.group.add(holder);
  mac.rotors.push({ obj: mesh, axis: 'z', speed });

  // 轴上的箍
  const rings = Math.max(2, Math.floor(len / 2.4));
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const px = lerp(x0, x1, t), py = lerp(y0, y1, t), pz = lerp(z0, z1, t);
    if (posts && i > 0 && i < rings && groundY !== null) {
      B.add('woodDark', T(cyl(0.11, 0.15, py - groundY, 8, 0.6), px, (py + groundY) / 2, pz));
      B.add('iron', T(box(0.38, 0.30, 0.34, 1.2), px, py, pz));
    }
  }
}

/* ---------------------------------------------------------- 水碓（连机碓） */
export function addTripHammers(mac, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, count = 3, speed = 0.9 } = o;
  const B = mac.B, M = mac.M;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const spacing = 2.3;
  const shaftLen = count * spacing + 1.4;

  // 凸轮轴
  const [s0x, s0z] = rot(0, -shaftLen / 2), [s1x, s1z] = rot(0, shaftLen / 2);
  addDriveShaft(mac, s0x, y + 1.25, s0z, s1x, y + 1.25, s1z, { r: 0.22, speed, groundY: y });
  for (const sgn of [-1, 1]) {
    const [px, pz] = rot(0, sgn * shaftLen / 2);
    B.add('woodDark', T(cyl(0.18, 0.24, 1.25, 8, 0.6), px, y + 0.62, pz));
    B.add('iron', T(box(0.42, 0.34, 0.38, 1.2), px, y + 1.25, pz, 0, ry, 0));
  }

  for (let i = 0; i < count; i++) {
    const zoff = (i - (count - 1) / 2) * spacing;
    const [px, pz] = rot(1.5, zoff);
    // 支点
    const [fx, fz] = rot(0.55, zoff);
    B.add('woodDark', T(box(0.3, 1.0, 0.4, 0.7), fx, y + 0.5, fz, 0, ry, 0));

    // 碓杆（摆动）
    const arm = new THREE.Group();
    arm.position.set(fx, y + 0.95, fz);
    arm.rotation.y = ry;
    const bar = box(0.24, 0.24, 3.6, 0.6);
    T(bar, 0, 0, 0, 0, 0, 0);
    const barMesh = new THREE.Mesh(bar, M.wood);
    barMesh.castShadow = true;
    // 碓头
    const head = box(0.5, 0.62, 0.5, 0.9);
    T(head, 0, -0.1, 1.75);
    const headMesh = new THREE.Mesh(head, M.iron);
    headMesh.castShadow = true;
    const pivot = new THREE.Group();
    pivot.add(barMesh); pivot.add(headMesh);
    arm.add(pivot);
    mac.group.add(arm);
    const phase = (i / count) * Math.PI * 2;
    mac.oscs.push((t, dt, rate) => {
      const a = Math.sin(t * speed * rate * 2.0 + phase);
      pivot.rotation.x = -0.10 + Math.max(0, a) * 0.30 - Math.max(0, -a) * 0.06;
    });

    // 石臼
    const [mx, mz] = rot(2.3, zoff);
    B.add('stone', T(cyl(0.55, 0.62, 0.7, 12, 0.7), mx, y + 0.35, mz));
    B.add('stone', T(cyl(0.34, 0.30, 0.16, 12, 0.9), mx, y + 0.72, mz));
  }
}

/* ---------------------------------------------------------- 绞盘 / 起重架 */
export function addCrane(mac, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, H = 8.5, reach = 5.5 } = o;
  const B = mac.B, M = mac.M;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  // 主柱
  B.add('woodDark', T(cyl(0.30, 0.38, H, 10, 0.5), x, y + H / 2, z));
  B.add('stone', T(box(1.6, 0.5, 1.6, 0.5), x, y + 0.25, z, 0, ry, 0));
  // 斜臂
  const [ax, az] = rot(reach, 0);
  B.add('wood', beam(x, y + H - 0.4, z, ax, y + H * 0.86, az, 0.26, 0.30, 0.5));
  B.add('wood', beam(x, y + H * 0.52, z, ax * 0.62 + x * 0.38, y + H * 0.80, az * 0.62 + z * 0.38, 0.18, 0.20, 0.5));
  // 拉索
  B.add('iron', beam(x, y + H, z, ax, y + H * 0.86, az, 0.045, 0.045, 1.4));
  // 吊钩（摆动）
  const hook = new THREE.Group();
  hook.position.set(ax, y + H * 0.86, az);
  const rope = cyl(0.035, 0.035, 3.4, 6, 1.4);
  T(rope, 0, -1.7, 0);
  const ropeMesh = new THREE.Mesh(rope, M.iron);
  const crate = box(1.2, 1.0, 1.2, 0.7);
  T(crate, 0, -3.9, 0);
  const crateMesh = new THREE.Mesh(crate, M.wood);
  crateMesh.castShadow = true;
  const swing = new THREE.Group();
  swing.add(ropeMesh); swing.add(crateMesh);
  hook.add(swing);
  mac.group.add(hook);
  mac.oscs.push((t) => {
    swing.rotation.x = Math.sin(t * 0.62) * 0.075;
    swing.rotation.z = Math.cos(t * 0.47) * 0.055;
  });
  // 绞盘
  const [wx, wz] = rot(-1.5, 0);
  mac.gear('wood', wx, y + 1.1, wz, 0.85, 10, 0.5, { speed: 0.42, ry: ry + Math.PI / 2 });
  B.add('woodDark', T(box(2.4, 0.3, 0.3, 0.7), wx, y + 1.1, wz, 0, ry, 0));
}

/* ---------------------------------------------------------- 石磨 */
export function addMill(mac, o = {}) {
  const { x = 0, y = 0, z = 0, speed = 0.55 } = o;
  const B = mac.B, M = mac.M;
  B.add('stone', T(cyl(1.5, 1.6, 0.55, 20, 0.6), x, y + 0.28, z));
  const top = cyl(1.25, 1.25, 0.45, 20, 0.6);
  const m = new THREE.Mesh(top, M.stone);
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, y + 0.78, z);
  mac.group.add(m);
  mac.rotors.push({ obj: m, axis: 'y', speed });
  B.add('wood', T(box(3.0, 0.18, 0.18, 0.7), x, y + 1.06, z));
  B.add('woodDark', T(cyl(0.14, 0.14, 1.3, 8, 0.7), x, y + 0.6, z));
}

/* ---------------------------------------------------------- 风车（立式） */
export function addWindmill(mac, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, H = 7.5, R = 3.4, blades = 6, speed = 0.5 } = o;
  const B = mac.B, M = mac.M;
  B.add('woodDark', T(cyl(0.30, 0.44, H, 10, 0.5), x, y + H / 2, z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + ry;
    B.add('wood', beam(x, y + H * 0.62, z, x + Math.cos(a) * 2.4, y + 0.2, z + Math.sin(a) * 2.4, 0.16, 0.18, 0.5));
  }
  // 转轮
  const parts = [];
  parts.push(T(cyl(0.28, 0.28, 0.6, 10, 0.8), 0, 0, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const arm = box(R, 0.12, 0.12, 0.7);
    T(arm, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a);
    parts.push(arm);
    const sail = box(R * 0.5, 1.0, 0.05, 0.7);
    T(sail, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, 0.16, 0, 0, a);
    parts.push(sail);
  }
  const g = mergeSafe(parts);
  const mesh = new THREE.Mesh(g, M.wood);
  mesh.castShadow = true;
  const holder = new THREE.Group();
  holder.position.set(x, y + H, z);
  holder.rotation.y = ry;
  holder.add(mesh);
  mac.group.add(holder);
  mac.rotors.push({ obj: mesh, axis: 'z', speed });
  B.add('woodDark', T(box(1.0, 0.7, 1.0, 0.7), x, y + H - 0.1, z, 0, ry, 0));
}
