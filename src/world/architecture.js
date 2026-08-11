// 营造 —— 台基、木构、斗拱、飞檐，程序化生成中式楼阁
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import {
  box, cyl, cone, sphere, torus, plane, frustum, T, beam,
  roofSurface, roofUnder, MeshBuilder,
} from './geo.js';

/* ---------------------------------------------------------- 栏杆 */
export function addRailing(B, x0, z0, x1, z1, y, opts = {}) {
  const { h = 0.92, mat = 'woodRed', panel = 'lattice', postEvery = 1.7 } = opts;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const ux = dx / len, uz = dz / len;
  const ang = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / postEvery));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.add(mat, T(box(0.13, h, 0.13, 0.7), x0 + dx * t, y + h / 2, z0 + dz * t));
    // 望柱头
    B.add(mat, T(box(0.19, 0.11, 0.19, 0.7), x0 + dx * t, y + h + 0.05, z0 + dz * t));
  }
  // 上下枋
  B.add(mat, T(box(len, 0.11, 0.16, 0.55), (x0 + x1) / 2, y + h - 0.06, (z0 + z1) / 2, 0, ang, 0));
  B.add(mat, T(box(len, 0.09, 0.13, 0.55), (x0 + x1) / 2, y + 0.16, (z0 + z1) / 2, 0, ang, 0));
  // 栏板
  if (panel) {
    B.add(panel, T(plane(len, h - 0.34, 0.9), (x0 + x1) / 2, y + h / 2 - 0.06, (z0 + z1) / 2, 0, ang + Math.PI / 2, 0));
  }
}

/* ---------------------------------------------------------- 斗拱 */
function addBracket(B, x, y, z, ry, s = 1, mat = 'woodRed') {
  // 简化的一朵斗拱：坐斗 + 两跳华拱 + 散斗
  B.add(mat, T(box(0.42 * s, 0.20 * s, 0.42 * s, 0.9), x, y, z, 0, ry, 0));
  B.add(mat, T(box(1.30 * s, 0.13 * s, 0.16 * s, 0.9), x, y + 0.19 * s, z, 0, ry, 0));
  B.add(mat, T(box(0.16 * s, 0.13 * s, 1.10 * s, 0.9), x, y + 0.19 * s, z, 0, ry, 0));
  B.add(mat, T(box(1.72 * s, 0.12 * s, 0.15 * s, 0.9), x, y + 0.37 * s, z, 0, ry, 0));
  for (const o of [-0.62, 0, 0.62]) {
    const ox = Math.cos(ry) * o * s, oz = -Math.sin(ry) * o * s;
    B.add(mat, T(box(0.26 * s, 0.14 * s, 0.26 * s, 0.9), x + ox, y + 0.50 * s, z + oz, 0, ry, 0));
  }
}

/* ---------------------------------------------------------- 窗 */
export function addWindow(B, x, y, z, ry, w = 1.5, h = 1.7, style = 'lattice') {
  const frame = 0.10;
  B.add('woodDark', T(box(w + frame * 2, frame * 1.6, 0.16, 0.9), x, y + h / 2 + frame, z, 0, ry, 0));
  B.add('woodDark', T(box(w + frame * 2, frame * 1.6, 0.16, 0.9), x, y - h / 2 - frame, z, 0, ry, 0));
  const sx = Math.cos(ry) * (w / 2 + frame), sz = -Math.sin(ry) * (w / 2 + frame);
  B.add('woodDark', T(box(frame * 1.6, h + frame * 3.2, 0.16, 0.9), x + sx, y, z + sz, 0, ry, 0));
  B.add('woodDark', T(box(frame * 1.6, h + frame * 3.2, 0.16, 0.9), x - sx, y, z - sz, 0, ry, 0));
  // 暗房 + 夜灯
  const bx = Math.sin(ry) * 0.13, bz = Math.cos(ry) * 0.13;
  B.add('windowGlow', T(plane(w, h, 0.6), x - bx, y, z - bz, 0, ry, 0));
  B.add(style, T(plane(w, h, 1 / Math.max(w, h)), x, y, z, 0, ry, 0));
}

/* ---------------------------------------------------------- 门 */
function addDoor(B, x, y, z, ry, w = 2.0, h = 2.5) {
  const bx = Math.sin(ry), bz = Math.cos(ry);
  B.add('woodDark', T(box(w + 0.3, 0.18, 0.22, 0.8), x, y + h + 0.09, z, 0, ry, 0));
  const sx = Math.cos(ry) * (w / 2 + 0.1), sz = -Math.sin(ry) * (w / 2 + 0.1);
  B.add('woodDark', T(box(0.2, h + 0.2, 0.22, 0.8), x + sx, y + h / 2, z + sz, 0, ry, 0));
  B.add('woodDark', T(box(0.2, h + 0.2, 0.22, 0.8), x - sx, y + h / 2, z - sz, 0, ry, 0));
  for (const s of [-1, 1]) {
    const ox = Math.cos(ry) * (w / 4) * s, oz = -Math.sin(ry) * (w / 4) * s;
    B.add('woodRed', T(box(w / 2 - 0.05, h, 0.11, 0.9), x + ox, y + h / 2, z + oz, 0, ry, 0));
    // 门钉
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const dx = (c - 0.5) * 0.34, dy = h * 0.62 - r * 0.34;
      B.add('gold', T(sphere(0.055, 6, 5, 2), x + ox + Math.cos(ry) * dx + bx * 0.07, y + dy, z + oz - Math.sin(ry) * dx + bz * 0.07));
    }
  }
  // 门槛
  B.add('stoneCut', T(box(w + 0.5, 0.16, 0.34, 0.8), x, y + 0.08, z, 0, ry, 0));
  // 抱鼓石：门枕一对，正门立刻有了分量
  for (const s of [-1, 1]) {
    const ox = Math.cos(ry) * (w / 2 + 0.34) * s, oz = -Math.sin(ry) * (w / 2 + 0.34) * s;
    B.add('stone', T(box(0.52, 0.26, 0.86, 0.8), x + ox, y + 0.13, z + oz, 0, ry, 0));
    // 鼓面朝门外：先把圆柱扳倒指向 +Z，再随立面转过去
    const drum = T(cyl(0.32, 0.32, 0.20, 14, 1.0), 0, 0, 0, Math.PI / 2, 0, 0);
    B.add('stoneCut', T(drum, x + ox, y + 0.56, z + oz, 0, ry, 0));
    B.add('stoneCut', T(box(0.17, 0.46, 0.34, 0.9), x + ox, y + 0.34, z + oz, 0, ry, 0));
  }
  // 门簪与匾底
  for (const s of [-0.34, 0.34]) {
    const ox = Math.cos(ry) * w * s, oz = -Math.sin(ry) * w * s;
    B.add('woodRed', T(cyl(0.075, 0.075, 0.18, 8, 1.4), x + ox, y + h + 0.18, z + oz, Math.PI / 2, ry, 0));
  }
}

/* ---------------------------------------------------------- 屋顶 */
export function addRoof(B, cx, cy, cz, L, D, opts = {}) {
  const {
    hip = true, roofH = 2.7, overhang = 1.55, tileMat = 'tile',
    ridgeMat = 'tileDark', ornaments = true, upturn = 0.95, ry = 0,
  } = opts;

  const g = roofSurface(L, D, { height: roofH, overhang, hip, upturn, segX: hip ? 44 : 34, segZ: 24 });
  B.add(tileMat, T(g, cx, cy, cz, 0, ry, 0));
  const gu = roofUnder(L, D, { height: roofH, overhang, hip, upturn });
  B.add('woodDark', T(gu, cx, cy, cz, 0, ry, 0));

  const HX = L / 2 + overhang, HZ = D / 2 + overhang;
  const maxD = hip ? Math.min(HX, HZ) : HZ;
  const ridgeLen = hip ? Math.max(0.6, L - D) : L + overhang * 2;

  // 正脊
  const rb = box(ridgeLen, 0.40, 0.46, 0.7);
  B.add(ridgeMat, T(rb, cx, cy + roofH + 0.16, cz, 0, ry, 0));
  const rb2 = box(ridgeLen + 0.2, 0.13, 0.62, 0.7);
  B.add(ridgeMat, T(rb2, cx, cy + roofH - 0.06, cz, 0, ry, 0));

  if (ornaments) {
    // 鸱吻
    for (const s of [-1, 1]) {
      const ex = s * ridgeLen / 2;
      const wx = cx + Math.cos(ry) * ex, wz = cz - Math.sin(ry) * ex;
      B.add(ridgeMat, T(box(0.34, 0.78, 0.36, 1.2), wx, cy + roofH + 0.52, wz, 0, ry, 0));
      B.add(ridgeMat, T(cone(0.26, 0.62, 6, 1.2), wx + Math.cos(ry) * s * 0.10, cy + roofH + 1.02, wz - Math.sin(ry) * s * 0.10, 0, ry, -s * 0.5));
    }
  }

  // 垂脊（四角）
  const corners = hip
    ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of corners) {
    const ex = hip ? sx * ridgeLen / 2 : sx * (L / 2 + overhang);
    const ez = 0;
    const tx = sx * HX * 0.98, tz = sz * HZ * 0.98;
    const rot = (px, pz) => [cx + Math.cos(ry) * px + Math.sin(ry) * pz, cz - Math.sin(ry) * px + Math.cos(ry) * pz];
    const [ax, az] = rot(ex, ez);
    const [bx2, bz2] = rot(tx, tz);
    const y0 = cy + roofH + 0.10;
    const y1 = cy + upturn * 0.92 + 0.34;
    B.add(ridgeMat, beam(ax, y0, az, bx2, y1, bz2, 0.24, 0.30, 0.7));
    if (ornaments) {
      // 脊兽
      for (let k = 1; k <= 3; k++) {
        const t = 0.52 + k * 0.13;
        const px = lerp(ax, bx2, t), pz = lerp(az, bz2, t), py = lerp(y0, y1, t) + 0.22;
        B.add(ridgeMat, T(sphere(0.11, 6, 5, 2), px, py, pz));
      }
      // 角上的套兽
      B.add(ridgeMat, T(cone(0.16, 0.42, 6, 1.4), bx2, y1 + 0.30, bz2, 0.3 * sz, 0, -0.3 * sx));
      // 风铎：翼角挑出一截铁挑，底下悬一枚铜铃
      const hx = bx2 + (bx2 - ax) * 0.05, hz = bz2 + (bz2 - az) * 0.05;
      B.add('iron', T(cyl(0.030, 0.030, 0.34, 5, 1.4), hx, y1 + 0.02, hz));
      B.add('bronze', T(cyl(0.115, 0.075, 0.20, 8, 1.6), hx, y1 - 0.24, hz));
      B.add('bronze', T(sphere(0.048, 6, 5, 2), hx, y1 - 0.38, hz));
      B.add('bronze', T(box(0.11, 0.13, 0.02, 1.6), hx, y1 - 0.46, hz, 0, sx * 0.4, 0));
    }
  }

  // 悬山两端的博风板与悬鱼
  if (!hip) {
    for (const s of [-1, 1]) {
      const ex = s * (L / 2 + overhang * 0.94);
      const wx = cx + Math.cos(ry) * ex, wz = cz - Math.sin(ry) * ex;
      for (const sz of [-1, 1]) {
        const bz = sz * (D / 2 + overhang) * 0.52;
        const px = wx + Math.sin(ry) * bz, pz = wz + Math.cos(ry) * bz;
        B.add('woodDark', beam(
          cx + Math.cos(ry) * ex, cy + roofH * 0.96, cz - Math.sin(ry) * ex,
          px + Math.sin(ry) * bz * 0.9, cy + upturn * 0.5 + 0.18, pz + Math.cos(ry) * bz * 0.9,
          0.12, 0.42, 0.7));
      }
      // 悬鱼
      B.add('woodRed', T(box(0.44, 0.66, 0.10, 1.1), wx, cy + roofH * 0.62, wz, 0, ry, 0));
      B.add('gold', T(sphere(0.11, 7, 6, 1.6), wx, cy + roofH * 0.62, wz + 0.06));
    }
  }

  // 檐口滴水
  const eaveY = cy + 0.02;
  const per = 0.42;
  for (const [axis, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
    const span = axis === 'z' ? HX * 2 : HZ * 2;
    const n = Math.floor(span / per);
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * span;
      let px, pz;
      if (axis === 'z') { px = t; pz = sgn * HZ; } else { px = sgn * HX; pz = t; }
      const cxn = Math.abs(px) / HX, czn = Math.abs(pz) / HZ;
      const cw = Math.pow(Math.max(0, (cxn - 0.52) / 0.48), 1.6) * Math.pow(Math.max(0, (czn - 0.52) / 0.48), 1.6);
      const py = eaveY + cw * (opts.upturn || 0.95) + 0.30;
      const wx = cx + Math.cos(ry) * px + Math.sin(ry) * pz;
      const wz = cz - Math.sin(ry) * px + Math.cos(ry) * pz;
      B.add(ridgeMat, T(cyl(0.085, 0.085, 0.14, 6, 1.6), wx, py - 0.05, wz, Math.PI / 2, 0, 0));
    }
  }
}

/* ---------------------------------------------------------- 楼阁 */
export function addBuilding(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0,
    w = 10, d = 7,
    floors = 1, floorH = 3.5,
    baseH = 0.75,
    hip = true, roofH = 2.7, overhang = 1.6,
    tileMat = 'tile',
    postMat = 'woodDark',
    wallMat = 'plaster',
    balcony = false,
    skirtRoof = false,     // 腰檐
    door = true,
    seed = 1,
  } = o;
  const rng = new Rng(seed * 7919 + 13);
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // ---- 台基
  const [bx, bz] = [x, z];
  B.add('stoneCut', T(frustum(w + 1.5, d + 1.5, w + 2.2, d + 2.2, baseH, 0.34), bx, y + baseH / 2, bz, 0, ry, 0));
  B.add('stone', T(box(w + 2.4, 0.16, d + 2.4, 0.34), bx, y + 0.06, bz, 0, ry, 0));

  // 台阶（正面 +z）
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const sh = baseH / steps;
    const [sx2, sz2] = rot(0, d / 2 + 1.1 + i * 0.42);
    B.add('stoneCut', T(box(w * 0.44, sh, 0.44 + i * 0.1, 0.5), sx2, y + baseH - sh * (i + 0.5), sz2, 0, ry, 0));
  }

  const postR = 0.20 + w * 0.006;
  const nx = Math.max(2, Math.round(w / 3.0));
  const nz = Math.max(2, Math.round(d / 3.0));

  for (let f = 0; f < floors; f++) {
    const y0 = y + baseH + f * floorH;
    const y1 = y0 + floorH;
    const shrink = f * 0.5;
    const fw = w - shrink, fd = d - shrink;

    // 柱
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        if (i > 0 && i < nx && j > 0 && j < nz) continue;
        const px = (i / nx - 0.5) * fw, pz = (j / nz - 0.5) * fd;
        const [wx, wz] = rot(px, pz);
        B.add(postMat, T(cyl(postR * 0.94, postR, floorH, 10, 0.55), wx, y0 + floorH / 2, wz));
        // 柱础
        B.add('stone', T(cyl(postR * 1.5, postR * 1.7, 0.20, 10, 0.8), wx, y0 + 0.10, wz));
      }
    }

    // 额枋
    for (const [ax, az, bx2, bz2] of [
      [-fw / 2, -fd / 2, fw / 2, -fd / 2], [-fw / 2, fd / 2, fw / 2, fd / 2],
      [-fw / 2, -fd / 2, -fw / 2, fd / 2], [fw / 2, -fd / 2, fw / 2, fd / 2],
    ]) {
      const [p0x, p0z] = rot(ax, az), [p1x, p1z] = rot(bx2, bz2);
      B.add(postMat, beam(p0x, y1 - 0.30, p0z, p1x, y1 - 0.30, p1z, 0.24, 0.36, 0.55));
      B.add(postMat, beam(p0x, y0 + 0.30, p0z, p1x, y0 + 0.30, p1z, 0.18, 0.20, 0.55));
    }

    // 墙与门窗
    const wallH = floorH - 0.7;
    const wallY = y0 + 0.35 + wallH / 2;
    const isFront = (side) => side === 2;
    const sides = [
      { ax: -fw / 2, az: -fd / 2, bx: fw / 2, bz: -fd / 2, n: [0, -1] },
      { ax: fw / 2, az: -fd / 2, bx: fw / 2, bz: fd / 2, n: [1, 0] },
      { ax: fw / 2, az: fd / 2, bx: -fw / 2, bz: fd / 2, n: [0, 1] },
      { ax: -fw / 2, az: fd / 2, bx: -fw / 2, bz: -fd / 2, n: [-1, 0] },
    ];
    sides.forEach((s, si) => {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      const [wx, wz] = rot(mx, mz);
      const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
      const openFront = balcony && f > 0;

      if (openFront && si === 2) {
        // 楼上正面做隔扇
        addWindow(B, wx, wallY, wz, faceRy, len * 0.78, wallH * 0.92, 'lattice');
        return;
      }
      if (si === 2 && f === 0 && door) {
        // 正面：门 + 两侧窗
        B.add(wallMat, T(box(len, wallH, 0.24, 0.44), wx, wallY, wz, 0, faceRy, 0));
        addDoor(B, wx, y0 + 0.02, wz, faceRy, Math.min(2.4, len * 0.34), wallH * 0.86);
        const off = len * 0.32;
        for (const sgn of [-1, 1]) {
          // 沿墙面切向偏移
          const [ox, oz] = rot(mx + s.n[1] * sgn * off, mz - s.n[0] * sgn * off);
          addWindow(B, ox, wallY + 0.25, oz, faceRy, Math.min(1.7, len * 0.2), wallH * 0.5, 'lattice');
        }
        return;
      }
      // 其他面：墙 + 一扇窗
      B.add(wallMat, T(box(len, wallH, 0.24, 0.44), wx, wallY, wz, 0, faceRy, 0));
      if (len > 3.2 && rng.chance(0.78)) {
        addWindow(B, wx, wallY + 0.2, wz, faceRy, Math.min(2.0, len * 0.34), wallH * 0.52,
          rng.chance(0.4) ? 'latticeIce' : 'lattice');
      }
      // 木裙板
      B.add('woodDark', T(box(len, 0.5, 0.28, 0.5), wx, y0 + 0.55, wz, 0, faceRy, 0));
    });

    // 檐下挂落：一排短垂柱，近看很出效果
    if (f === floors - 1) {
      for (const s of sides) {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        const cnt = Math.max(3, Math.round(len / 0.62));
        const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
        for (let i = 1; i < cnt; i++) {
          const t = i / cnt;
          const [wx, wz] = rot(lerp(s.ax, s.bx, t), lerp(s.az, s.bz, t));
          B.add('woodRed', T(box(0.07, 0.26, 0.07, 1.4), wx, y1 - 0.52, wz, 0, faceRy, 0));
        }
        const [mx2, mz2] = rot((s.ax + s.bx) / 2, (s.az + s.bz) / 2);
        B.add('woodRed', T(box(len, 0.08, 0.09, 0.8), mx2, y1 - 0.40, mz2, 0, faceRy + Math.PI / 2, 0));
      }
    }

    // 斗拱（顶层檐下）
    if (f === floors - 1) {
      const per = 2.0;
      for (const s of sides) {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        const cnt = Math.max(2, Math.round(len / per));
        const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
        for (let i = 0; i <= cnt; i++) {
          const t = i / cnt;
          const px = lerp(s.ax, s.bx, t), pz = lerp(s.az, s.bz, t);
          const [wx, wz] = rot(px, pz);
          addBracket(B, wx, y1 - 0.06, wz, faceRy, 0.78, postMat === 'woodDark' ? 'woodRed' : postMat);
        }
      }
    }

    // 腰檐 + 平座（多层）
    if (f < floors - 1 && (skirtRoof || balcony)) {
      addRoof(B, x, y1 + 0.1, z, fw + 1.1, fd + 1.1, {
        hip: true, roofH: 0.95, overhang: 1.15, tileMat, upturn: 0.55, ry, ornaments: false,
      });
      if (balcony) {
        const bw = fw + 1.9, bd = fd + 1.9;
        B.add('wood', T(box(bw, 0.16, bd, 0.5), x, y1 + 0.62, z, 0, ry, 0));
        const c = [
          rot(-bw / 2, -bd / 2), rot(bw / 2, -bd / 2), rot(bw / 2, bd / 2), rot(-bw / 2, bd / 2),
        ];
        for (let i = 0; i < 4; i++) {
          const a = c[i], b2 = c[(i + 1) % 4];
          addRailing(B, a[0], a[1], b2[0], b2[1], y1 + 0.70, { h: 0.86, mat: 'woodRed', panel: 'latticeIce' });
        }
      }
    }
  }

  // ---- 大屋顶
  const topY = y + baseH + floors * floorH;
  addRoof(B, x, topY, z, w + 0.6 - (floors - 1) * 0.5, d + 0.6 - (floors - 1) * 0.5, {
    hip, roofH, overhang, tileMat, upturn: 0.95 + w * 0.012, ry,
  });

  return { topY, w, d };
}

/* ============================================================
   各方山海的屋舍形制
   ------------------------------------------------------------
   五关不能只是「同一栋房子换了个瓦色」。这里给出四种完全不同的
   骨架，与栖梧谷的木构楼阁并列：

     夯土碉楼（炎火之山）—— 墙体收分、平顶女儿墙、椽头出挑，无檐
     井干木屋（幽都寒渊）—— 圆木叠垒、陡坡屋面压石、高石基、烟囱
     干栏船屋（归墟海眼）—— 高桩架空、竹篾墙、两端起翘的船形屋脊
     玉阙敞轩（昆仑天阙）—— 三层玉阶、一圈檐柱、重檐、鎏金脊饰

   四者的剪影各不相同：方、尖、翘、阔。远远一看就知道是哪一关。
   ============================================================ */

/* ---------------------------------------------------------- 夯土碉楼 */
export function addFortHouse(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, w = 10, d = 7,
    floors = 1, floorH = 3.5, baseH = 0.55,
    wallMat = 'plasterRed', postMat = 'woodDark', stoneMat = 'stone', cutMat = 'stoneCut',
    seed = 1, big = false,
  } = o;
  const rng = new Rng(seed * 6151 + 29);
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // 石砌基座：只露一线，沙埋掉大半
  B.add(cutMat, T(box(w + 1.2, baseH, d + 1.2, 0.4), x, y + baseH / 2, z, 0, ry, 0));

  let yy = y + baseH;
  let fw = w, fd = d;
  for (let f = 0; f < floors; f++) {
    // 墙体收分：上小下大，这是夯土的样子
    const topW = fw * 0.90, topD = fd * 0.90;
    B.add(wallMat, T(frustum(topW, topD, fw, fd, floorH, 0.30), x, yy + floorH / 2, z, 0, ry, 0));
    // 转角加厚的护角
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      const [cx2, cz2] = rot(Math.cos(a) * fw * 0.46, Math.sin(a) * fd * 0.46);
      B.add(wallMat, T(frustum(0.9, 0.9, 1.2, 1.2, floorH, 0.4), cx2, yy + floorH / 2, cz2, 0, ry + a, 0));
    }
    // 椽头：一排从墙里插出来的木梁端，夯土建筑的招牌
    for (const [len, nx2, nz2] of [[topW, 0, 1], [topW, 0, -1], [topD, 1, 0], [topD, -1, 0]]) {
      const cnt = Math.max(3, Math.round(len / 1.15));
      for (let i = 0; i < cnt; i++) {
        const t = (i + 0.5) / cnt - 0.5;
        const px = nz2 ? t * topW : nx2 * topW * 0.47;
        const pz = nx2 ? t * topD : nz2 * topD * 0.47;
        const [wx, wz] = rot(px + nx2 * 0.30, pz + nz2 * 0.30);
        B.add(postMat, T(cyl(0.09, 0.11, 0.66, 6, 0.9), wx, yy + floorH - 0.30, wz,
          Math.PI / 2, Math.atan2(nx2, nz2) + ry, 0));
      }
    }
    // 梯形窗洞：小而深，挡沙也挡热
    const nWin = Math.max(1, Math.round(topW / 3.4));
    for (let i = 0; i < nWin; i++) {
      const t = (i + 0.5) / nWin - 0.5;
      const [wx, wz] = rot(t * topW * 0.84, topD * 0.50);
      const hw = 0.42, hh = 0.78;
      B.add('windowGlow', T(plane(hw * 2, hh, 0.7), wx, yy + floorH * 0.58, wz, 0, ry, 0));
      B.add(postMat, T(box(hw * 2.5, 0.16, 0.30, 1.0), wx, yy + floorH * 0.58 + hh * 0.56, wz, 0, ry, 0));
    }
    yy += floorH;
    fw = topW; fd = topD;
  }

  // 女儿墙 + 垛口
  const pw = fw + 0.5, pd = fd + 0.5;
  B.add(wallMat, T(frustum(pw, pd, pw + 0.2, pd + 0.2, 0.30, 0.4), x, yy + 0.15, z, 0, ry, 0));
  for (const [len, nx2, nz2] of [[pw, 0, 1], [pw, 0, -1], [pd, 1, 0], [pd, -1, 0]]) {
    const cnt = Math.max(3, Math.round(len / 1.05));
    for (let i = 0; i < cnt; i++) {
      if (i % 2) continue;                     // 隔一个留个垛口
      const t = (i + 0.5) / cnt - 0.5;
      const px = nz2 ? t * pw : nx2 * pw * 0.5;
      const pz = nx2 ? t * pd : nz2 * pd * 0.5;
      const [wx, wz] = rot(px, pz);
      B.add(wallMat, T(box(0.62, 0.52, 0.36, 0.6), wx, yy + 0.56, wz, 0, ry + Math.atan2(nx2, nz2), 0));
    }
  }

  // 平顶上的晾晒架与陶罐
  const [gx, gz] = rot(0, 0);
  B.add(postMat, T(box(fw * 0.8, 0.10, 0.10, 0.9), gx, yy + 1.55, gz, 0, ry, 0));
  for (const s of [-1, 1]) {
    const [px, pz] = rot(s * fw * 0.36, 0);
    B.add(postMat, T(cyl(0.07, 0.09, 1.6, 6, 0.9), px, yy + 0.80, pz));
  }
  for (let i = 0; i < 3; i++) {
    const [px, pz] = rot((i - 1) * fw * 0.26, -0.2);
    B.add('cloth', T(plane(fw * 0.20, 1.0, 1.0), px, yy + 1.05, pz, 0, ry + Math.PI / 2, 0));
  }
  for (let i = 0; i < (big ? 4 : 2); i++) {
    const [px, pz] = rot(rng.range(-fw * 0.35, fw * 0.35), rng.range(-fd * 0.3, fd * 0.3));
    B.add(stoneMat, T(frustum(0.34, 0.34, 0.46, 0.46, 0.52, 0.8), px, yy + 0.26, pz, 0, rng.range(0, 3.14), 0));
  }

  // 门：深凹的洞口 + 木过梁 + 布幔
  const [dx0, dz0] = rot(0, d * 0.5 + 0.02);
  const dw = Math.min(2.2, w * 0.30);
  B.add('windowGlow', T(plane(dw, 2.4, 0.6), dx0, y + baseH + 1.2, dz0, 0, ry, 0));
  B.add(postMat, T(box(dw + 0.7, 0.26, 0.42, 0.9), dx0, y + baseH + 2.50, dz0, 0, ry, 0));
  for (const s of [-1, 1]) {
    const [px, pz] = rot(s * (dw / 2 + 0.18), d * 0.5 + 0.04);
    B.add(postMat, T(cyl(0.14, 0.17, 2.5, 7, 0.8), px, y + baseH + 1.25, pz));
  }
  B.add('cloth', T(plane(dw * 0.94, 1.1, 1.0), dx0, y + baseH + 1.95, dz0 + 0.12, 0, ry, 0));

  // 外挂的木梯：靠着墙上到平顶
  const [lx, lz] = rot(w * 0.42, -d * 0.5 - 0.5);
  const topRoof = yy + 0.3;
  B.add(postMat, beam(lx, y + baseH, lz, lx, topRoof, lz + 0.9, 0.10, 0.10, 0.9));
  B.add(postMat, beam(lx + 0.55, y + baseH, lz, lx + 0.55, topRoof, lz + 0.9, 0.10, 0.10, 0.9));
  const rungs = Math.max(4, Math.round((topRoof - y) / 0.5));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    B.add(postMat, T(box(0.60, 0.06, 0.06, 1.0), lx + 0.28, lerp(y + baseH, topRoof, t), lz + 0.9 * t, 0, ry, 0));
  }

  return { topY: yy, w, d };
}

/* ---------------------------------------------------------- 井干木屋 */
export function addLogHouse(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, w = 10, d = 7,
    floors = 1, floorH = 3.2, baseH = 1.05, roofH = 3.6,
    logMat = 'woodDark', roofMat = 'tileDark', stoneMat = 'rockDark', cutMat = 'stoneCut',
    seed = 1, big = false,
  } = o;
  const rng = new Rng(seed * 4409 + 71);
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // 毛石高基座：雪一堆起来，矮基座的屋子就埋了半截
  B.add(stoneMat, T(frustum(w + 1.0, d + 1.0, w + 2.0, d + 2.0, baseH, 0.42), x, y + baseH / 2, z, 0, ry, 0));
  B.add(cutMat, T(box(w + 1.6, 0.18, d + 1.6, 0.5), x, y + baseH + 0.06, z, 0, ry, 0));
  // 基座上散砌的石块，边缘就不是一条直线了
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const [px, pz] = rot(Math.cos(a) * (w / 2 + 0.9), Math.sin(a) * (d / 2 + 0.9));
    B.add(stoneMat, T(box(rng.range(0.5, 0.9), rng.range(0.3, 0.6), rng.range(0.5, 0.9), 0.7),
      px, y + rng.range(0.1, baseH), pz, rng.range(-0.2, 0.2), rng.range(0, 3.14), rng.range(-0.2, 0.2)));
  }

  const H = floors * floorH;
  const y0 = y + baseH + 0.1;
  // 井干墙：一根根圆木横着叠，转角互相咬出头
  const logR = 0.21;
  const rows = Math.max(4, Math.round(H / (logR * 2)));
  for (let i = 0; i < rows; i++) {
    const ly = y0 + logR + i * (logR * 1.94);
    if (ly > y0 + H) break;
    const alt = i % 2;
    // 前后两根（沿 x）
    for (const sz of [-1, 1]) {
      const [ax, az] = rot(-w / 2 - (alt ? 0.34 : 0), sz * d / 2);
      const [bx, bz] = rot(w / 2 + (alt ? 0.34 : 0), sz * d / 2);
      B.add(logMat, T(cyl(logR, logR, Math.hypot(bx - ax, bz - az), 7, 0.7),
        (ax + bx) / 2, ly, (az + bz) / 2, 0, ry, Math.PI / 2));
    }
    // 左右两根（沿 z），与上一层错开半根，转角就咬住了
    for (const sx of [-1, 1]) {
      const [ax, az] = rot(sx * w / 2, -d / 2 - (alt ? 0 : 0.34));
      const [bx, bz] = rot(sx * w / 2, d / 2 + (alt ? 0 : 0.34));
      B.add(logMat, T(cyl(logR, logR, Math.hypot(bx - ax, bz - az), 7, 0.7),
        (ax + bx) / 2, ly + logR * 0.97, (az + bz) / 2, Math.PI / 2, ry, 0));
    }
  }

  // 山墙：两端的三角形，也用圆木一根根收进去
  const gableH = roofH;
  for (const sz of [-1, 1]) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const len = w * (1 - t) + 0.4;
      if (len < 0.6) continue;
      const [ax, az] = rot(-len / 2, sz * d / 2);
      const [bx, bz] = rot(len / 2, sz * d / 2);
      B.add(logMat, T(cyl(logR * 0.92, logR * 0.92, Math.hypot(bx - ax, bz - az), 7, 0.7),
        (ax + bx) / 2, y0 + H + t * gableH + 0.2, (az + bz) / 2, 0, ry, Math.PI / 2));
    }
  }

  // 陡坡双坡屋面：雪压不住才立得久
  const g = roofSurface(w + 1.9, d + 1.7, {
    height: roofH, overhang: 1.15, hip: false, upturn: 0.18, curve: 1.25,
    segX: 30, segZ: 18, rib: 0.03, ribW: 0.55,
  });
  B.add(roofMat, T(g, x, y0 + H + 0.2, z, 0, ry, 0));
  B.add(logMat, T(roofUnder(w + 1.9, d + 1.7, {
    height: roofH, overhang: 1.15, hip: false, upturn: 0.18, curve: 1.25,
  }), x, y0 + H + 0.2, z, 0, ry, 0));
  // 正脊：一根压脊的圆木
  B.add(logMat, T(cyl(0.22, 0.22, w + 2.2, 8, 0.8), x, y0 + H + roofH + 0.32, z, 0, ry, Math.PI / 2));
  // 屋面压石：北地木屋的做法，风刮不走瓦
  for (let i = 0; i < (big ? 14 : 9); i++) {
    const t = rng.range(0.12, 0.88);
    const sz = rng.chance(0.5) ? 1 : -1;
    const [px, pz] = rot(rng.range(-0.44, 0.44) * w, sz * d * 0.30);
    B.add(stoneMat, T(box(rng.range(0.34, 0.62), rng.range(0.20, 0.34), rng.range(0.34, 0.58), 0.8),
      px, y0 + H + 0.2 + roofH * (1 - Math.abs(0.30 * 2)) * 0.55 + 0.14, pz,
      0, rng.range(0, 3.14), 0));
  }

  // 石烟囱
  const [chx, chz] = rot(w * 0.30, -d * 0.24);
  const chTop = y0 + H + roofH + 1.5;
  B.add(stoneMat, T(frustum(0.72, 0.72, 0.98, 0.98, chTop - (y0 + H * 0.3), 0.45),
    chx, (chTop + y0 + H * 0.3) / 2, chz, 0, ry, 0));
  B.add(cutMat, T(box(1.15, 0.18, 1.15, 0.7), chx, chTop + 0.09, chz, 0, ry, 0));

  // 门廊：挑出的雨搭 + 两根原木柱
  const [px0, pz0] = rot(0, d / 2 + 1.35);
  for (const s of [-1, 1]) {
    const [cx2, cz2] = rot(s * 1.35, d / 2 + 1.35);
    B.add(logMat, T(cyl(0.17, 0.21, 2.7, 8, 0.7), cx2, y0 + 1.35, cz2));
  }
  B.add(roofMat, T(box(3.6, 0.18, 2.1, 0.6), px0, y0 + 2.80, pz0, -0.22, ry, 0));
  B.add(logMat, T(box(3.8, 0.16, 0.16, 0.9), px0, y0 + 2.72, pz0, 0, ry, 0));
  addDoor(B, px0, y0 + 0.02, rot(0, d / 2 + 0.06)[1] === pz0 ? pz0 : rot(0, d / 2 + 0.06)[1],
    ry, Math.min(1.9, w * 0.24), 2.1);

  // 檐下柴垛
  const [fx, fz] = rot(-w * 0.42, d * 0.30);
  for (let i = 0; i < 8; i++) {
    const r2 = 0.14;
    B.add(logMat, T(cyl(r2, r2, 1.5, 6, 0.9),
      fx + (i % 4) * 0.30 - 0.45, y0 + 0.16 + Math.floor(i / 4) * 0.30, fz, 0, ry, Math.PI / 2));
  }

  return { topY: y0 + H, w, d };
}

/* ---------------------------------------------------------- 干栏船屋 */
export function addStiltHouse(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, w = 10, d = 7,
    floors = 1, floorH = 3.2, roofH = 2.8, lift = 2.2,
    postMat = 'wood', wallMat = 'wood', roofMat = 'tile',
    groundY = null, seed = 1, big = false,
  } = o;
  const rng = new Rng(seed * 3301 + 17);
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const gy = groundY === null ? y : groundY;

  // 木桩：一排排插到地里，长短各随其地
  const nx = Math.max(2, Math.round(w / 2.6)), nz = Math.max(2, Math.round(d / 2.6));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz && !(i % 2 === 0 && j % 2 === 0)) continue;
      const [wx, wz] = rot((i / nx - 0.5) * w, (j / nz - 0.5) * d);
      const h = lift + 0.9;
      B.add(postMat, T(cyl(0.16, 0.22, h, 8, 0.7), wx, y + lift - h / 2 + 0.2, wz,
        rng.range(-0.03, 0.03), 0, rng.range(-0.03, 0.03)));
    }
  }
  // 斜撑
  for (const s of [-1, 1]) {
    const [ax, az] = rot(s * w * 0.5, -d * 0.5);
    const [bx, bz] = rot(s * w * 0.28, -d * 0.5);
    B.add(postMat, beam(ax, y + lift - 1.5, az, bx, y + lift + 0.05, bz, 0.10, 0.10, 0.9));
  }
  // 楼板与地栿
  const y0 = y + lift;
  B.add(postMat, T(box(w + 1.4, 0.22, d + 1.4, 0.55), x, y0 + 0.11, z, 0, ry, 0));
  for (const sz of [-1, 1]) {
    const [ax, az] = rot(-w / 2 - 0.7, sz * (d / 2 + 0.6));
    const [bx, bz] = rot(w / 2 + 0.7, sz * (d / 2 + 0.6));
    B.add('woodDark', beam(ax, y0 + 0.02, az, bx, y0 + 0.02, bz, 0.22, 0.34, 0.6));
  }

  // 竹篾墙：一片片竖着的薄板，缝里透光
  const H = floors * floorH;
  const sides = [
    { ax: -w / 2, az: -d / 2, bx: w / 2, bz: -d / 2, n: [0, -1] },
    { ax: w / 2, az: -d / 2, bx: w / 2, bz: d / 2, n: [1, 0] },
    { ax: w / 2, az: d / 2, bx: -w / 2, bz: d / 2, n: [0, 1] },
    { ax: -w / 2, az: d / 2, bx: -w / 2, bz: -d / 2, n: [-1, 0] },
  ];
  sides.forEach((s, si) => {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const [mx, mz] = rot((s.ax + s.bx) / 2, (s.az + s.bz) / 2);
    const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
    if (si === 2) {
      // 正面：一半是门洞，两侧是竹墙
      B.add('windowGlow', T(plane(len, H - 0.5, 0.6), mx, y0 + 0.3 + (H - 0.5) / 2, mz, 0, faceRy, 0));
      for (const sgn of [-1, 1]) {
        const [ox, oz] = rot((s.ax + s.bx) / 2 + s.n[1] * sgn * len * 0.33,
          (s.az + s.bz) / 2 - s.n[0] * sgn * len * 0.33);
        B.add(wallMat, T(box(len * 0.32, H - 0.5, 0.16, 0.7), ox, y0 + 0.3 + (H - 0.5) / 2, oz, 0, faceRy, 0));
      }
    } else {
      B.add(wallMat, T(box(len, H - 0.5, 0.16, 0.7), mx, y0 + 0.3 + (H - 0.5) / 2, mz, 0, faceRy, 0));
      if (len > 3.0) {
        addWindow(B, mx, y0 + H * 0.62, mz, faceRy, Math.min(1.8, len * 0.3), H * 0.40, 'lattice');
      }
    }
    // 竹篾：一道道竖压条
    const cnt = Math.max(4, Math.round(len / 0.55));
    for (let i = 1; i < cnt; i++) {
      const t = i / cnt;
      const [wx, wz] = rot(lerp(s.ax, s.bx, t), lerp(s.az, s.bz, t));
      B.add(postMat, T(box(0.06, H - 0.6, 0.07, 1.2), wx, y0 + 0.35 + (H - 0.6) / 2, wz, 0, faceRy, 0));
    }
  });
  // 檐柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [wx, wz] = rot(sx * (w / 2 + 0.55), sz * (d / 2 + 0.55));
    B.add(postMat, T(cyl(0.15, 0.18, H + 0.4, 9, 0.7), wx, y0 + (H + 0.4) / 2, wz));
  }

  // 船形屋顶：两端的正脊高高翘起，像一条覆过来的舟
  const topY = y0 + H;
  const g = roofSurface(w + 1.2, d + 1.2, {
    height: roofH, overhang: 1.9, hip: false, upturn: 1.5, cornerOut: 0.9,
    curve: 2.5, segX: 40, segZ: 22, rib: 0.05, ribW: 0.40,
  });
  B.add(roofMat, T(g, x, topY, z, 0, ry, 0));
  B.add('woodDark', T(roofUnder(w + 1.2, d + 1.2, {
    height: roofH, overhang: 1.9, hip: false, upturn: 1.5, cornerOut: 0.9, curve: 2.5,
  }), x, topY, z, 0, ry, 0));
  // 起翘的脊：分段抬。roofSurface 在悬山的脊线上是平的，脊要是拱得太高
  // 就会和瓦面脱开，成了屋顶上方悬着的一道箍。抬到 0.85 就够看出「舟」了，
  // 再用一排短柱把脊与瓦面之间那点空隙填上。
  const segsR = 14;
  const half = w / 2 + 1.9;
  const ridgeY = (t) => {
    const u = (t - 0.5) * 2;                          // -1..1
    return topY + roofH + 0.22 + Math.pow(Math.abs(u), 2.8) * 0.85;
  };
  for (let i = 0; i < segsR; i++) {
    const t0 = i / segsR, t1 = (i + 1) / segsR;
    const [ax, az] = rot((t0 - 0.5) * 2 * half, 0);
    const [bx, bz] = rot((t1 - 0.5) * 2 * half, 0);
    B.add('woodDark', beam(ax, ridgeY(t0), az, bx, ridgeY(t1), bz, 0.26, 0.30, 0.7));
    // 垫在脊下的短柱，把翘起来那一段与瓦面连住
    const t = (t0 + t1) / 2;
    const gap = ridgeY(t) - (topY + roofH + 0.22);
    if (gap > 0.12) {
      const [px, pz] = rot((t - 0.5) * 2 * half, 0);
      B.add('woodDark', T(box(0.16, gap, 0.20, 0.9), px, topY + roofH + 0.22 + gap / 2, pz, 0, ry, 0));
    }
  }
  // 脊端的舟首：一枚翘起的木牙
  for (const s of [-1, 1]) {
    const [ex, ez] = rot(s * half, 0);
    const ey = ridgeY(s > 0 ? 1 : 0);
    B.add('woodDark', T(box(0.28, 0.95, 0.34, 0.9), ex, ey + 0.50, ez, 0, ry, s * 0.30));
    B.add('bronze', T(sphere(0.17, 8, 6, 1.2),
      ex + Math.cos(ry) * s * 0.26, ey + 1.02, ez - Math.sin(ry) * s * 0.26));
  }

  // 外挂晒台 + 栏杆
  const [bx0, bz0] = rot(0, d / 2 + 2.0);
  B.add(postMat, T(box(w * 0.72, 0.14, 2.4, 0.6), bx0, y0 + 0.14, bz0, 0, ry, 0));
  const c0 = rot(-w * 0.36, d / 2 + 0.8), c1 = rot(w * 0.36, d / 2 + 0.8);
  const c2 = rot(w * 0.36, d / 2 + 3.2), c3 = rot(-w * 0.36, d / 2 + 3.2);
  addRailing(B, c1[0], c1[1], c2[0], c2[1], y0 + 0.2, { h: 0.78, mat: postMat, panel: null, postEvery: 1.2 });
  addRailing(B, c2[0], c2[1], c3[0], c3[1], y0 + 0.2, { h: 0.78, mat: postMat, panel: null, postEvery: 1.2 });
  addRailing(B, c3[0], c3[1], c0[0], c0[1], y0 + 0.2, { h: 0.78, mat: postMat, panel: null, postEvery: 1.2 });
  // 晒台上的鱼干架
  if (big) {
    for (const s of [-1, 1]) {
      const [px, pz] = rot(s * w * 0.28, d / 2 + 2.0);
      B.add(postMat, T(cyl(0.08, 0.10, 1.8, 6, 0.9), px, y0 + 1.05, pz));
    }
    const [r0x, r0z] = rot(-w * 0.28, d / 2 + 2.0), [r1x, r1z] = rot(w * 0.28, d / 2 + 2.0);
    B.add(postMat, beam(r0x, y0 + 1.9, r0z, r1x, y0 + 1.9, r1z, 0.05, 0.05, 1.4));
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      B.add('paperWhite', T(plane(0.30, 0.62, 1.4),
        lerp(r0x, r1x, t), y0 + 1.55, lerp(r0z, r1z, t), 0, ry + rng.range(-0.3, 0.3), 0));
    }
  }
  // 下到地面的木梯。落差太大就别硬接了 —— 台子搭在崖沿上时，
  // 那道梯子会径直悬到半空里去
  const drop = y0 - gy;
  if (drop > 0.5 && drop < 5.5) {
    const run = Math.max(1.6, drop * 1.15);           // 坡度约 40 度
    const steps = Math.max(3, Math.round(drop / 0.40));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [px, pz] = rot(-w * 0.30, d / 2 + 3.1 + t * run);
      B.add(postMat, T(box(1.2, 0.10, run / steps + 0.16, 0.8), px, lerp(y0, gy + 0.15, t), pz, 0, ry, 0));
    }
    // 两根斜梁
    for (const s of [-1, 1]) {
      const [ax, az] = rot(-w * 0.30 + s * 0.58, d / 2 + 3.1);
      const [bx, bz] = rot(-w * 0.30 + s * 0.58, d / 2 + 3.1 + run);
      B.add('woodDark', beam(ax, y0 - 0.12, az, bx, gy + 0.05, bz, 0.12, 0.18, 0.8));
    }
  }

  return { topY, w, d };
}

/* ---------------------------------------------------------- 玉阙敞轩 */
export function addPalaceHall(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, w = 12, d = 8,
    floors = 1, floorH = 4.2, roofH = 3.4,
    jadeMat = 'jadeM', postMat = 'woodRed', roofMat = 'tileJade', cutMat = 'jadeM',
    seed = 1, big = false,
  } = o;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // 三层玉阶须弥座：昆仑的屋子是从台上长出来的
  const tiers = big ? 3 : 2;
  let by = y;
  for (let i = 0; i < tiers; i++) {
    const t = (tiers - i) / tiers;
    const tw = w + 2.0 + t * 2.6, td = d + 2.0 + t * 2.6;
    const th = 0.52;
    B.add(cutMat, T(frustum(tw - 0.3, td - 0.3, tw, td, th, 0.36), x, by + th / 2, z, 0, ry, 0));
    B.add(jadeMat, T(box(tw + 0.3, 0.14, td + 0.3, 0.5), x, by + th + 0.05, z, 0, ry, 0));
    by += th;
    // 每层台缘一圈栏板与望柱
    if (i === tiers - 1) {
      const hw = (w + 2.0) / 2 + 0.2, hd = (d + 2.0) / 2 + 0.2;
      const c = [rot(-hw, -hd), rot(hw, -hd), rot(hw, hd), rot(-hw, hd)];
      for (let k = 0; k < 4; k++) {
        if (k === 2) continue;                                  // 正面留出踏道
        const a = c[k], b2 = c[(k + 1) % 4];
        addRailing(B, a[0], a[1], b2[0], b2[1], by, { h: 0.86, mat: jadeMat, panel: 'latticeIce', postEvery: 1.9 });
      }
    }
  }
  // 螭首：台缘伸出的排水兽头
  for (let i = 0; i < (big ? 8 : 6); i++) {
    const a = (i / (big ? 8 : 6)) * Math.PI * 2;
    const [px, pz] = rot(Math.cos(a) * (w / 2 + 1.5), Math.sin(a) * (d / 2 + 1.5));
    B.add(jadeMat, T(cyl(0.14, 0.19, 0.62, 8, 0.9), px, by - 0.22, pz, Math.PI / 2, -a, 0));
    B.add('gold', T(sphere(0.12, 8, 6, 1.2), px + Math.cos(a) * 0.30, by - 0.22, pz + Math.sin(a) * 0.30));
  }
  // 正面踏道 + 御路石
  const [rx0, rz0] = rot(0, d / 2 + 1.4);
  const nStep = 5;
  for (let i = 0; i < nStep; i++) {
    const t = i / nStep;
    B.add(cutMat, T(box(w * 0.52, (by - y) / nStep, 0.55, 0.5),
      rx0 + Math.sin(ry) * i * 0.55, y + (by - y) * (1 - t) - (by - y) / nStep / 2, rz0 + Math.cos(ry) * i * 0.55, 0, ry, 0));
  }

  const y0 = by;
  const H = floors * floorH;
  // 一圈檐柱：敞轩，四面通透，只在后半有墙
  const nx = Math.max(3, Math.round(w / 2.8)), nz = Math.max(2, Math.round(d / 2.8));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      const [wx, wz] = rot((i / nx - 0.5) * w, (j / nz - 0.5) * d);
      B.add(postMat, T(cyl(0.24, 0.27, H, 12, 0.5), wx, y0 + H / 2, wz));
      B.add(jadeMat, T(cyl(0.36, 0.42, 0.24, 12, 0.8), wx, y0 + 0.12, wz));
      // 柱头的鎏金箍
      B.add('gold', T(cyl(0.28, 0.28, 0.16, 12, 1.2), wx, y0 + H - 0.30, wz));
    }
  }
  // 背面与两侧的隔扇墙
  for (const s of [{ n: [0, -1], len: w }, { n: [1, 0], len: d }, { n: [-1, 0], len: d }]) {
    const [mx, mz] = rot(s.n[0] * w / 2, s.n[1] * d / 2);
    const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
    B.add('windowGlow', T(plane(s.len * 0.94, H * 0.78, 0.6), mx, y0 + H * 0.46, mz, 0, faceRy, 0));
    B.add('latticeIce', T(plane(s.len * 0.94, H * 0.78, 0.9), mx, y0 + H * 0.46, mz, 0, faceRy, 0));
    B.add(postMat, T(box(s.len, 0.20, 0.24, 0.7), mx, y0 + H * 0.85, mz, 0, faceRy, 0));
  }
  // 额枋与雀替
  for (const [ax, az, bx2, bz2] of [
    [-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, d / 2, w / 2, d / 2],
    [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2],
  ]) {
    const [p0x, p0z] = rot(ax, az), [p1x, p1z] = rot(bx2, bz2);
    B.add(postMat, beam(p0x, y0 + H - 0.34, p0z, p1x, y0 + H - 0.34, p1z, 0.26, 0.40, 0.5));
    B.add('gold', beam(p0x, y0 + H - 0.34, p0z, p1x, y0 + H - 0.34, p1z, 0.28, 0.12, 0.9));
  }

  // 重檐：下檐一圈，上檐是主屋顶
  addRoof(B, x, y0 + H * 0.66, z, w + 2.6, d + 2.6, {
    hip: true, roofH: 1.15, overhang: 1.5, tileMat: roofMat, ridgeMat: 'gold',
    upturn: 0.85, ry, ornaments: false,
  });
  // 上檐下的三跳斗拱，一朵挨一朵
  const per = 1.35;
  for (const s of [{ n: [0, 1], len: w }, { n: [0, -1], len: w }, { n: [1, 0], len: d }, { n: [-1, 0], len: d }]) {
    const cnt = Math.max(3, Math.round(s.len / per));
    const faceRy = ry + Math.atan2(s.n[0], s.n[1]);
    for (let i = 0; i <= cnt; i++) {
      const t = i / cnt - 0.5;
      const px = s.n[0] ? s.n[0] * w / 2 : t * w;
      const pz = s.n[1] ? s.n[1] * d / 2 : t * d;
      const [wx, wz] = rot(px, pz);
      addBracket(B, wx, y0 + H - 0.06, wz, faceRy, 0.92, postMat);
    }
  }
  addRoof(B, x, y0 + H, z, w + 0.8, d + 0.8, {
    hip: true, roofH, overhang: 2.1, tileMat: roofMat, ridgeMat: 'gold',
    upturn: 1.15 + w * 0.012, ry,
  });
  // 脊上的鎏金宝顶
  B.add('gold', T(cyl(0.30, 0.42, 0.55, 12, 0.8), x, y0 + H + roofH + 0.52, z));
  B.add('gold', T(sphere(0.34, 12, 9, 0.8), x, y0 + H + roofH + 1.05, z));
  B.add('jadeM', T(cone(0.16, 0.62, 8, 0.9), x, y0 + H + roofH + 1.58, z));

  return { topY: y0 + H, w, d };
}

/* ---------------------------------------------------------- 石拱桥 */
export function addArchBridge(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, span = 16, width = 5.2, rise = 2.6, deckY = 0.6,
    // 侧墙一路砌到这个高度。地形在桥下是被抬起来的一条窄带（见 levels.js
    // 的 bridgeDeck），不砌墙的话那截土就从桥两边露出来 —— 河也就断了。
    skirtY = null, stoneMat = 'stone', cutMat = 'stoneCut',
  } = o;
  const segs = 26;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const arcY = (t) => Math.sin(Math.PI * clamp(t, 0, 1)) * rise;

  // 桥面
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
    const y0 = y + deckY + arcY(t0), y1 = y + deckY + arcY(t1);
    const [ax, az] = rot(0, z0), [bx, bz] = rot(0, z1);
    B.add(cutMat, beam(ax, (y0 + y1) / 2, az, bx, (y0 + y1) / 2, bz, width, 0.42, 0.4));
    // 桥腹
    B.add(stoneMat, beam(ax, (y0 + y1) / 2 - 0.5, az, bx, (y0 + y1) / 2 - 0.5, bz, width * 0.94, 0.7, 0.4));
  }

  // 侧墙（拱肩墙）：从桥面一路砌到水面以下，把桥下那截土整个包住
  if (skirtY !== null) {
    for (const sgn of [-1, 1]) {
      const px = sgn * (width / 2 - 0.18);
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
        const top = y + deckY + (arcY(t0) + arcY(t1)) / 2 + 0.18;
        const hgt = top - skirtY;
        if (hgt <= 0.2) continue;
        const [ax, az] = rot(px, z0), [bx, bz] = rot(px, z1);
        B.add(cutMat, beam(ax, top - hgt / 2, az, bx, top - hgt / 2, bz, 0.42, hgt, 0.45));
      }
      // 墙面上的拱券：一圈券石，看着才是「拱桥」而不是一堵挡土墙
      const vou = 13;
      for (let i = 0; i < vou; i++) {
        const a = Math.PI * (0.06 + (i / (vou - 1)) * 0.88);
        const rr = span * 0.40;
        const pz2 = -Math.cos(a) * rr;
        const py = y + deckY - 0.55 + Math.sin(a) * (rise + 1.35);
        const [vx, vz] = rot(sgn * (width / 2 + 0.06), pz2);
        B.add(stoneMat, T(box(0.30, 0.62, span * 0.10, 0.9), vx, py, vz, 0, ry, a - Math.PI / 2));
      }
    }
  }

  // 拱圈
  for (const sgn of [-1, 1]) {
    const px = sgn * width / 2;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
      const y0 = y + deckY + arcY(t0), y1 = y + deckY + arcY(t1);
      const [ax, az] = rot(px, z0), [bx, bz] = rot(px, z1);
      B.add(stoneMat, beam(ax, (y0 + y1) / 2 - 1.15, az, bx, (y0 + y1) / 2 - 1.15, bz, 0.5, 1.5, 0.4));
    }
  }
  // 桥墩与分水尖
  for (const sgn of [-1, 1]) {
    const [px, pz] = rot(0, sgn * span / 2);
    B.add(stoneMat, T(box(width + 0.9, 3.2, 1.7, 0.36), px, y + deckY - 1.4, pz, 0, ry, 0));
    if (skirtY !== null) {
      const h2 = y + deckY - skirtY;
      B.add(stoneMat, T(box(width + 1.3, h2, 2.1, 0.36), px, skirtY + h2 / 2, pz, 0, ry, 0));
      // 迎水面的分水尖
      const [qx, qz] = rot(0, sgn * (span / 2 + 1.0));
      B.add(stoneMat, T(box(1.5, h2 * 0.9, 1.5, 0.5), qx, skirtY + h2 * 0.45, qz, 0, ry + Math.PI / 4, 0));
    }
  }
  // 栏杆
  for (const sgn of [-1, 1]) {
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [px, pz] = rot(sgn * (width / 2 - 0.22), (t - 0.5) * span);
      const py = y + deckY + arcY(t) + 0.21;
      B.add('stoneCut', T(box(0.24, 0.86, 0.24, 0.7), px, py + 0.43, pz, 0, ry, 0));
      B.add('stoneCut', T(sphere(0.15, 7, 6, 1.4), px, py + 0.94, pz));
      if (i < n) {
        const t2 = (i + 1) / n;
        const [qx, qz] = rot(sgn * (width / 2 - 0.22), (t2 - 0.5) * span);
        const qy = y + deckY + arcY(t2) + 0.21;
        B.add('stoneCut', beam(px, py + 0.66, pz, qx, qy + 0.66, qz, 0.16, 0.22, 0.55));
        B.add('stoneCut', beam(px, py + 0.22, pz, qx, qy + 0.22, qz, 0.14, 0.30, 0.55));
      }
    }
  }
}

/* ---------------------------------------------------------- 木桥 / 栈道 */
export function addPlankBridge(B, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, span = 12, width = 3.0, sag = 0.3, rail = true } = o;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const n = Math.floor(span / 0.42);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pz = (t - 0.5) * span;
    const py = y - Math.sin(Math.PI * t) * sag;
    const [wx, wz] = rot(0, pz);
    B.add('wood', T(box(width, 0.12, 0.32, 0.7), wx, py, wz, 0, ry, (Math.random() - 0.5) * 0.02));
  }
  // 大梁
  for (const sgn of [-1, 1]) {
    const [ax, az] = rot(sgn * (width / 2 - 0.2), -span / 2);
    const [bx, bz] = rot(sgn * (width / 2 - 0.2), span / 2);
    B.add('woodDark', beam(ax, y - 0.18, az, bx, y - 0.18, bz, 0.22, 0.34, 0.55));
  }
  if (rail) {
    for (const sgn of [-1, 1]) {
      const [ax, az] = rot(sgn * (width / 2 - 0.1), -span / 2);
      const [bx, bz] = rot(sgn * (width / 2 - 0.1), span / 2);
      addRailing(B, ax, az, bx, bz, y + 0.06, { h: 0.86, mat: 'wood', panel: null, postEvery: 1.5 });
    }
  }
}

/* ---------------------------------------------------------- 牌坊 */
export function addPailou(B, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, w = 9, h = 6.4 } = o;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  for (const sgn of [-1, 1]) {
    for (const inner of [0, 1]) {
      const px = sgn * (w / 2 - inner * w * 0.26);
      const [wx, wz] = rot(px, 0);
      const ph = inner ? h * 0.82 : h;
      B.add('stone', T(box(0.9, 0.7, 1.5, 0.5), wx, y + 0.35, wz, 0, ry, 0));
      B.add('woodRed', T(cyl(0.28, 0.32, ph, 12, 0.5), wx, y + ph / 2 + 0.6, wz));
      B.add('stone', T(box(0.42, 1.7, 1.9, 0.5), wx, y + 1.4, wz, 0, ry, 0));
    }
  }
  // 额枋
  for (const [yy, ww, hh] of [[h * 0.62, w + 0.6, 0.9], [h * 0.82, w * 0.52, 0.7]]) {
    B.add('woodRed', T(box(ww, hh, 0.5, 0.5), x, y + yy, z, 0, ry, 0));
    B.add('gold', T(box(ww * 0.9, hh * 0.34, 0.56, 0.7), x, y + yy, z, 0, ry, 0));
  }
  // 檐
  addRoof(B, x, y + h * 0.92, z, w * 0.5, 1.9, { hip: false, roofH: 0.85, overhang: 1.0, upturn: 0.7, ry, tileMat: 'tile', ornaments: false });
  for (const sgn of [-1, 1]) {
    const [px, pz] = rot(sgn * (w / 2 - 0.1), 0);
    addRoof(B, px, y + h * 0.70, pz, 3.0, 1.7,
      { hip: false, roofH: 0.7, overhang: 0.85, upturn: 0.6, ry, tileMat: 'tile', ornaments: false });
  }
}
