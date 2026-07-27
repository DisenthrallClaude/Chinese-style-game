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

/* ---------------------------------------------------------- 石拱桥 */
export function addArchBridge(B, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, span = 16, width = 5.2, rise = 2.6, deckY = 0.6 } = o;
  const segs = 26;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const arcY = (t) => Math.sin(Math.PI * clamp(t, 0, 1)) * rise;

  // 桥面
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
    const y0 = y + deckY + arcY(t0), y1 = y + deckY + arcY(t1);
    const [ax, az] = rot(0, z0), [bx, bz] = rot(0, z1);
    B.add('stoneCut', beam(ax, (y0 + y1) / 2, az, bx, (y0 + y1) / 2, bz, width, 0.42, 0.4));
    // 桥腹
    B.add('stone', beam(ax, (y0 + y1) / 2 - 0.5, az, bx, (y0 + y1) / 2 - 0.5, bz, width * 0.94, 0.7, 0.4));
  }
  // 拱圈
  for (const sgn of [-1, 1]) {
    const px = sgn * width / 2;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
      const y0 = y + deckY + arcY(t0), y1 = y + deckY + arcY(t1);
      const [ax, az] = rot(px, z0), [bx, bz] = rot(px, z1);
      B.add('stone', beam(ax, (y0 + y1) / 2 - 1.15, az, bx, (y0 + y1) / 2 - 1.15, bz, 0.5, 1.5, 0.4));
    }
  }
  // 桥墩
  for (const sgn of [-1, 1]) {
    const [px, pz] = rot(0, sgn * span / 2);
    B.add('stone', T(box(width + 0.9, 3.2, 1.7, 0.36), px, y + deckY - 1.4, pz, 0, ry, 0));
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
