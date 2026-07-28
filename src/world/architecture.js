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

/* ============================================================
   各关的屋顶形制
   ------------------------------------------------------------
   五关屋舍不是同一套瓦顶换个颜色：炎火之山无木可用，做夯土平顶；
   幽都雪压千斤，做陡坡井干；归墟风大浪急，做船篷弧顶；
   昆仑是帝之下都，重檐琉璃。屋顶一换，剪影就全变了。
   ============================================================ */

// 夯土平顶（炎火之山）：女儿墙 + 垛口 + 挑出来的椽头 + 屋顶晒台
function addFlatRoof(B, cx, cy, cz, L, D, opts = {}) {
  const { ry = 0, wallMat = 'plasterRed', capMat = 'stoneCut', over = 0.55, parapet = 0.85 } = opts;
  const rot = (px, pz) => [cx + Math.cos(ry) * px + Math.sin(ry) * pz, cz - Math.sin(ry) * px + Math.cos(ry) * pz];
  const HX = L / 2 + over, HZ = D / 2 + over;
  // 挑出的椽头：一排圆木从墙里穿出来，是夯土建筑最认得出的一处
  const per = 0.92;
  for (const [axis, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
    const span = axis === 'z' ? L : D;
    const n = Math.max(2, Math.floor(span / per));
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * span * 0.94;
      const px = axis === 'z' ? t : sgn * (L / 2 + over * 0.6);
      const pz = axis === 'z' ? sgn * (D / 2 + over * 0.6) : t;
      const [wx, wz] = rot(px, pz);
      B.add('woodDark', T(cyl(0.10, 0.11, 0.62, 6, 1.2), wx, cy - 0.20, wz,
        axis === 'z' ? Math.PI / 2 : 0, ry, axis === 'z' ? 0 : Math.PI / 2));
    }
  }
  // 屋面与压顶
  B.add(wallMat, T(box(L + over * 1.2, 0.34, D + over * 1.2, 0.5), cx, cy + 0.17, cz, 0, ry, 0));
  B.add(capMat, T(box(L + over * 1.4, 0.10, D + over * 1.4, 0.6), cx, cy + 0.38, cz, 0, ry, 0));
  // 女儿墙：留一段口子当出入
  for (const [axis, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
    const span = (axis === 'z' ? L : D) + over * 1.2;
    const segs = Math.max(3, Math.round(span / 1.15));
    for (let i = 0; i < segs; i++) {
      if (axis === 'z' && sgn === 1 && i === (segs >> 1)) continue;   // 上屋顶的口
      const t = ((i + 0.5) / segs - 0.5) * span;
      const px = axis === 'z' ? t : sgn * ((L + over * 1.2) / 2);
      const pz = axis === 'z' ? sgn * ((D + over * 1.2) / 2) : t;
      const [wx, wz] = rot(px, pz);
      const h = parapet * (i % 2 ? 1 : 0.68);        // 垛口高低相间
      B.add(wallMat, T(box(axis === 'z' ? span / segs * 0.94 : 0.30, h,
        axis === 'z' ? 0.30 : span / segs * 0.94, 0.6), wx, cy + 0.42 + h / 2, wz, 0, ry, 0));
    }
  }
  // 四角的角墩
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const [wx, wz] = rot(sx * (L + over * 1.2) / 2, sz * (D + over * 1.2) / 2);
    B.add(capMat, T(box(0.52, parapet * 1.25, 0.52, 0.8), wx, cy + 0.42 + parapet * 0.62, wz, 0, ry, 0));
  }
}

// 船篷弧顶（归墟海眼）：竹篾席卷成的桶拱，两头封山花板
function addBarrelRoof(B, cx, cy, cz, L, D, opts = {}) {
  const { ry = 0, roofH = 2.2, over = 1.5, mat = 'wood', ribMat = 'woodDark' } = opts;
  const rot = (px, pz) => [cx + Math.cos(ry) * px + Math.sin(ry) * pz, cz - Math.sin(ry) * px + Math.cos(ry) * pz];
  const HD = D / 2 + over;
  const N = 12;
  const arc = (t) => {                       // t: -1..1 横跨，返回 [横向偏移, 高]
    const a = t * Math.PI / 2;
    return [Math.sin(a) * HD, Math.cos(a) * roofH];
  };
  // 篷面：一圈一圈的席
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (i / N) * 2, t1 = -1 + ((i + 1) / N) * 2;
    const [z0, y0] = arc(t0), [z1, y1] = arc(t1);
    const [ax, az] = rot(-(L / 2 + over * 0.5), z0), [bx, bz] = rot(L / 2 + over * 0.5, z0);
    const w = Math.hypot(z1 - z0, y1 - y0);
    const midY = cy + (y0 + y1) / 2;
    const ang = Math.atan2(y1 - y0, z1 - z0);
    const [mx, mz] = rot(0, (z0 + z1) / 2);
    B.add(mat, T(box(L + over, 0.14, w * 1.06, 0.7), mx, midY, mz, ang, ry, 0));
    if (i % 3 === 0) B.add(ribMat, T(box(L + over * 1.1, 0.10, 0.16, 1.0), mx, midY + 0.10, mz, ang, ry, 0));
    void ax; void az; void bx; void bz;
  }
  // 篷骨：几道横箍
  for (const s of [-1, -0.34, 0.34, 1]) {
    const px = s * (L / 2 + over * 0.42);
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (i / N) * 2, t1 = -1 + ((i + 1) / N) * 2;
      const [z0, y0] = arc(t0), [z1, y1] = arc(t1);
      const [p0x, p0z] = rot(px, z0), [p1x, p1z] = rot(px, z1);
      B.add(ribMat, beam(p0x, cy + y0 + 0.13, p0z, p1x, cy + y1 + 0.13, p1z, 0.11, 0.13, 0.9));
    }
  }
  // 山花板：两端封起来
  for (const s of [-1, 1]) {
    const [wx, wz] = rot(s * (L / 2 + over * 0.5), 0);
    B.add(ribMat, T(plane(HD * 2, roofH * 0.96, 0.7), wx, cy + roofH * 0.45, wz, 0, ry + Math.PI / 2, 0));
    B.add(ribMat, T(box(0.16, 0.16, HD * 2, 1.0), wx, cy + 0.06, wz, 0, ry, 0));
  }
  // 脊上的木鱼：船家讨个彩头
  B.add('bronze', T(cyl(0.16, 0.10, 0.62, 6, 1.0), cx, cy + roofH + 0.22, cz, Math.PI / 2, ry, 0));
}

// 井干壁（幽都寒渊）：一层层原木叠起来，转角互相咬着出头
function addLogWalls(B, x, y, z, ry, w, d, h, mat = 'woodDark') {
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  const r = 0.19;
  const rows = Math.max(3, Math.floor(h / (r * 2)));
  for (let i = 0; i < rows; i++) {
    const yy = y + r + i * (h / rows);
    const along = i % 2 === 0;                 // 横一层、纵一层
    const out = 0.42;                          // 转角出头
    if (along) {
      for (const s of [-1, 1]) {
        const [wx, wz] = rot(0, s * d / 2);
        B.add(mat, T(cyl(r, r, w + out * 2, 8, 0.8), wx, yy, wz, 0, 0, Math.PI / 2));
      }
    } else {
      for (const s of [-1, 1]) {
        const [wx, wz] = rot(s * w / 2, 0);
        B.add(mat, T(cyl(r, r, d + out * 2, 8, 0.8), wx, yy, wz, Math.PI / 2, ry, 0));
      }
    }
  }
  // 缝里塞的苔与泥
  for (let i = 1; i < rows; i += 2) {
    const yy = y + r + i * (h / rows);
    for (const s of [-1, 1]) {
      const [wx, wz] = rot(0, s * (d / 2 - 0.04));
      B.add('plaster', T(box(w * 0.98, h / rows * 0.34, 0.10, 0.6), wx, yy - r * 0.9, wz, 0, ry, 0));
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
    style = 'valley',      // valley 楼阁 / desert 夯土碉楼 / snow 井干木屋 /
                           // stilt 干栏船屋 / palace 重檐玉阙
    stoneMat = 'stone',
    cutMat = 'stoneCut',
  } = o;
  const isEarth = style === 'desert';
  const isLog = style === 'snow';
  const isBoat = style === 'stilt';
  const isPalace = style === 'palace';
  const rng = new Rng(seed * 7919 + 13);
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];

  // ---- 台基：一关一个样
  const [bx, bz] = [x, z];
  if (isPalace) {
    // 汉白玉三层须弥座 + 望柱 + 螭首
    for (let k = 0; k < 3; k++) {
      const g2 = 1.0 - k * 0.30, hk = baseH * (0.52 - k * 0.08);
      B.add(cutMat, T(frustum(w + 1.0 + g2 * 2.2, d + 1.0 + g2 * 2.2,
        w + 1.4 + g2 * 2.6, d + 1.4 + g2 * 2.6, hk, 0.4), bx, y + baseH * k * 0.5 + hk / 2, bz, 0, ry, 0));
    }
    const RW = w + 3.2, RD = d + 3.2;
    for (const [sx3, sz3] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [wx, wz] = rot(sx3 * RW / 2, sz3 * RD / 2);
      B.add(cutMat, T(box(0.30, 1.05, 0.30, 0.8), wx, y + baseH + 0.52, wz, 0, ry, 0));
      B.add('gold', T(sphere(0.16, 8, 6, 1.2), wx, y + baseH + 1.12, wz));
      // 螭首：台基四角伸出去的排水兽头
      B.add(cutMat, T(cyl(0.16, 0.24, 0.66, 7, 0.9), wx + sx3 * 0.24, y + baseH * 0.62, wz + sz3 * 0.24,
        Math.PI / 2 - 0.25, Math.atan2(sx3, sz3), 0));
    }
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5;
      const [ax2, az2] = rot(t * RW * 0.92, RD / 2);
      B.add(cutMat, T(box(0.24, 0.90, 0.24, 0.8), ax2, y + baseH + 0.45, az2, 0, ry, 0));
    }
  } else if (isEarth) {
    // 夯土：台基与墙连成一体，一路收分上去
    B.add(stoneMat, T(frustum(w + 1.1, d + 1.1, w + 2.4, d + 2.4, baseH * 1.25, 0.34), bx, y + baseH * 0.62, bz, 0, ry, 0));
  } else if (isBoat) {
    // 干栏：石不多，先铺一层木platform
    B.add('woodDark', T(box(w + 2.0, 0.26, d + 2.0, 0.5), bx, y + baseH - 0.13, bz, 0, ry, 0));
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const [wx, wz] = rot(i * (w / 2 + 0.7), j * (d / 2 + 0.7));
      B.add('wood', T(cyl(0.20, 0.24, baseH + 0.5, 8, 0.7), wx, y + baseH * 0.5 - 0.2, wz));
    }
    B.add('wood', T(box(w + 1.6, 0.12, d + 1.6, 0.6), bx, y + baseH + 0.02, bz, 0, ry, 0));
  } else {
    B.add(cutMat, T(frustum(w + 1.5, d + 1.5, w + 2.2, d + 2.2, baseH, 0.34), bx, y + baseH / 2, bz, 0, ry, 0));
    B.add(stoneMat, T(box(w + 2.4, 0.16, d + 2.4, 0.34), bx, y + 0.06, bz, 0, ry, 0));
  }

  // 台阶（正面 +z）
  const steps = isPalace ? 5 : 3;
  for (let i = 0; i < steps; i++) {
    const sh = baseH / steps;
    const [sx2, sz2] = rot(0, d / 2 + 1.1 + i * (isPalace ? 0.56 : 0.42));
    B.add(isBoat ? 'wood' : cutMat,
      T(box(w * (isPalace ? 0.52 : 0.44), sh, 0.44 + i * 0.1, 0.5),
        sx2, y + baseH - sh * (i + 0.5), sz2, 0, ry, 0));
  }

  const postR = 0.20 + w * 0.006;
  const nx = Math.max(2, Math.round(w / 3.0));
  const nz = Math.max(2, Math.round(d / 3.0));

  for (let f = 0; f < floors; f++) {
    const y0 = y + baseH + f * floorH;
    const y1 = y0 + floorH;
    const shrink = f * 0.5;
    const fw = w - shrink, fd = d - shrink;

    // 柱。夯土碉楼是承重墙，没有露明柱；井干木屋只在四角立柱
    if (!isEarth) {
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= nz; j++) {
          if (i > 0 && i < nx && j > 0 && j < nz) continue;
          if (isLog && i > 0 && i < nx && j >= 0) continue;
          const px = (i / nx - 0.5) * fw, pz = (j / nz - 0.5) * fd;
          const [wx, wz] = rot(px, pz);
          const pr = postR * (isPalace ? 1.22 : 1);
          B.add(postMat, T(cyl(pr * 0.94, pr, floorH, 10, 0.55), wx, y0 + floorH / 2, wz));
          B.add(stoneMat, T(cyl(pr * 1.5, pr * 1.7, 0.20, 10, 0.8), wx, y0 + 0.10, wz));
          // 玉阙的柱身缠一道金箍
          if (isPalace) B.add('gold', T(torus(pr * 1.12, 0.05, 5, 12, 1.0), wx, y0 + floorH * 0.78, wz, Math.PI / 2, 0, 0));
        }
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
        B.add(wallMat, T(box(len, wallH, isEarth ? 0.44 : 0.24, 0.44), wx, wallY, wz, 0, faceRy, 0));
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
      if (len > 3.2 && rng.chance(isEarth ? 0.55 : 0.78)) {
        addWindow(B, wx, wallY + 0.2, wz, faceRy,
          Math.min(isEarth ? 1.0 : 2.0, len * (isEarth ? 0.18 : 0.34)),
          wallH * (isEarth ? 0.34 : 0.52),
          rng.chance(0.4) ? 'latticeIce' : 'lattice');
      }
      // 木裙板
      if (!isEarth) B.add('woodDark', T(box(len, 0.5, 0.28, 0.5), wx, y0 + 0.55, wz, 0, faceRy, 0));
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

  // ---- 井干：外面再包一层原木，一层层叠上去、转角出头
  if (isLog) {
    addLogWalls(B, x, y + baseH, z, ry, w, d, floors * floorH - 0.3, postMat === 'wood' ? 'wood' : 'woodDark');
  }

  // ---- 干栏船屋：外挑一圈回廊 + 竹篾栏板
  if (isBoat) {
    const bw = w + 2.6, bd = d + 2.6;
    B.add('wood', T(box(bw, 0.14, bd, 0.5), x, y + baseH + 0.06, z, 0, ry, 0));
    const c4 = [rot(-bw / 2, -bd / 2), rot(bw / 2, -bd / 2), rot(bw / 2, bd / 2), rot(-bw / 2, bd / 2)];
    for (let i = 0; i < 4; i++) {
      if (i === 2) continue;                       // 正面留出入口
      const a = c4[i], b2 = c4[(i + 1) % 4];
      addRailing(B, a[0], a[1], b2[0], b2[1], y + baseH + 0.12, { h: 0.80, mat: 'wood', panel: null, postEvery: 1.25 });
    }
    // 缆桩与鱼骨挂架
    for (const s of [-1, 1]) {
      const [px, pz] = rot(s * bw / 2, bd / 2 - 0.4);
      B.add('woodDark', T(cyl(0.14, 0.18, 1.3, 7, 0.8), px, y + baseH + 0.6, pz));
      B.add('iron', T(torus(0.16, 0.035, 5, 10, 1.0), px, y + baseH + 1.2, pz, Math.PI / 2, 0, 0));
    }
  }

  // ---- 大屋顶：一关一个形制
  const topY = y + baseH + floors * floorH;
  const RW = w + 0.6 - (floors - 1) * 0.5, RD = d + 0.6 - (floors - 1) * 0.5;
  if (isEarth) {
    addFlatRoof(B, x, topY, z, RW, RD, {
      ry, wallMat, capMat: cutMat, over: 0.62, parapet: 0.72 + (o.big ? 0.35 : 0),
    });
    // 大屋顶上再支一个遮阳的凉棚，才不至于一片死板
    if (o.big) {
      for (const s of [-1, 1]) {
        const [px, pz] = rot(s * RW * 0.30, 0);
        B.add('woodDark', T(cyl(0.11, 0.13, 1.5, 6, 0.8), px, topY + 1.15, pz));
      }
      B.add('cloth', T(plane(RW * 0.72, RD * 0.62, 0.6), x, topY + 1.86, z, Math.PI / 2, ry, 0));
    }
  } else if (isBoat) {
    addBarrelRoof(B, x, topY, z, RW, RD, {
      ry, roofH: roofH * 0.86, over: overhang * 0.92, mat: tileMat === 'tile' ? 'wood' : tileMat, ribMat: 'woodDark',
    });
  } else if (isLog) {
    // 陡坡双坡顶 + 压顶石：雪压不塌，是幽都的样子
    addRoof(B, x, topY, z, RW, RD, {
      hip: false, roofH: roofH * 1.45, overhang: overhang * 1.15, tileMat,
      upturn: 0.28, ry, ornaments: false,
    });
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      for (const s of [-1, 1]) {
        const t = (i + 0.6) / rows;
        const px = (Math.random() - 0.5) * RW * 0.82;
        const pz = s * (RD / 2 + overhang) * (1 - t * 0.78);
        const [wx, wz] = rot(px, pz);
        B.add(stoneMat, T(box(0.62, 0.16, 0.44, 0.8), wx, topY + roofH * 1.45 * t + 0.12, wz, 0, ry, 0));
      }
    }
    // 挡雪的檐板与烟囱
    for (const s of [-1, 1]) {
      const [wx, wz] = rot(0, s * (RD / 2 + overhang * 1.1));
      B.add('woodDark', T(box(RW + overhang * 2, 0.22, 0.10, 0.8), wx, topY + 0.42, wz, 0, ry, 0));
    }
    const [chx, chz] = rot(RW * 0.28, -RD * 0.2);
    B.add(stoneMat, T(box(0.66, roofH * 1.7, 0.66, 0.7), chx, topY + roofH * 0.85, chz, 0, ry, 0));
    B.add(cutMat, T(box(0.86, 0.14, 0.86, 0.9), chx, topY + roofH * 1.72, chz, 0, ry, 0));
  } else if (isPalace) {
    // 重檐庑殿：下檐先出一圈，上檐再压一层，才有帝之下都的分量
    addRoof(B, x, topY - roofH * 0.34, z, RW + 2.2, RD + 2.2, {
      hip: true, roofH: roofH * 0.62, overhang: overhang * 1.15, tileMat,
      upturn: 0.85, ry, ornaments: false,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const [px, pz] = rot(Math.cos(a) * (RW / 2 + 1.0), Math.sin(a) * (RD / 2 + 1.0));
      B.add(postMat, T(cyl(0.19, 0.21, roofH * 0.9, 9, 0.6), px, topY + roofH * 0.1, pz));
    }
    addRoof(B, x, topY + roofH * 0.62, z, RW, RD, {
      hip, roofH, overhang, tileMat, upturn: 1.05 + w * 0.012, ry,
    });
  } else {
    addRoof(B, x, topY, z, RW, RD, {
      hip, roofH, overhang, tileMat, upturn: 0.95 + w * 0.012, ry,
    });
  }

  return { topY, w, d };
}

/* ---------------------------------------------------------- 石拱桥
   真的架在水面之上：桥腹是一圈券石砌出来的筒拱，拱下是空的，
   水（或熔岩）从券洞里淌过去。两头落在河岸的桥台上，
   桥台之间除了券石一无所有 —— 地形里不再有任何土。
   y0 / y1 是两个桥头的地面高度，桥面从这两点起拱。 */
export function addArchBridge(B, o = {}) {
  const {
    x = 0, y = 0, z = 0, ry = 0, span = 16, width = 5.2, rise = 2.6,
    y0 = 0, y1 = 0, waterY = -2.0,
    stoneMat = 'stone', cutMat = 'stoneCut', railMat = 'stoneCut',
  } = o;
  const segs = 24;
  const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
  // 桥面：两端接地，中间起拱
  const deckAt = (t) => lerp(y0, y1, clamp(t, 0, 1)) + Math.sin(Math.PI * clamp(t, 0, 1)) * rise;
  const half = span / 2;
  const HW = width / 2;

  // ---- 桥面板与压面石
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
    const my = (deckAt(t0) + deckAt(t1)) / 2;
    const [ax, az] = rot(0, z0), [bx, bz] = rot(0, z1);
    B.add(cutMat, beam(ax, my - 0.16, az, bx, my - 0.16, bz, width, 0.34, 0.4));
    B.add(stoneMat, beam(ax, my - 0.46, az, bx, my - 0.46, bz, width + 0.34, 0.30, 0.4));
  }

  // ---- 券洞：半圆筒拱。起拱线略高于水面，拱顶顶到桥面板底下
  const ah = Math.min(half * 0.86, span * 0.44);          // 净跨的一半
  const spring = waterY + 0.35;                            // 起拱线
  const crown = deckAt(0.5) - 0.95;                        // 拱顶
  const archR = Math.max(1.2, crown - spring);
  const NA = 22;
  const arcPt = (k) => {
    const a = Math.PI * (k / NA);
    return [-Math.cos(a) * ah, spring + Math.sin(a) * archR];
  };
  for (let k = 0; k < NA; k++) {
    const [z0, h0] = arcPt(k), [z1v, h1v] = arcPt(k + 1);
    const [ax, az] = rot(0, z0), [bx, bz] = rot(0, z1v);
    // 券石：整幅宽度的一圈拱石，拱腹就是它的内表面
    B.add(cutMat, beam(ax, h0, az, bx, h1v, bz, width + 0.10, 0.62, 0.5));
    // 两侧券脸：比券石略突出一线，正面看得见一圈弧
    for (const sgn of [-1, 1]) {
      const [cx0, cz0] = rot(sgn * (HW + 0.16), z0), [cx1, cz1] = rot(sgn * (HW + 0.16), z1v);
      B.add(stoneMat, beam(cx0, h0, cz0, cx1, h1v, cz1, 0.30, 0.86, 0.5));
    }
  }

  // ---- 撞券（拱背与桥面之间的实体）：只填拱外，拱内一定要空着
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const zc = (t - 0.5) * span;
    const top = deckAt(t) - 0.62;
    // 这一站的拱背高度；出了净跨就一路落到起拱线以下
    let base = spring - 0.6;
    if (Math.abs(zc) < ah) base = spring + Math.sqrt(1 - (zc / ah) * (zc / ah)) * archR + 0.34;
    if (top - base < 0.12) continue;
    const [px, pz] = rot(0, zc);
    B.add(stoneMat, T(box(width + 0.02, top - base, span / segs + 0.02, 0.42),
      px, (top + base) / 2, pz, 0, ry, 0));
  }

  // ---- 桥台：两端落到岸上，往下埋一截
  for (const sgn of [-1, 1]) {
    const t = sgn < 0 ? 0 : 1;
    const yTop = deckAt(t) - 0.5;
    const yBot = Math.min(waterY - 2.6, yTop - 4.0);
    const [px, pz] = rot(0, sgn * (half + 1.05));
    B.add(stoneMat, T(box(width + 1.5, yTop - yBot, 3.0, 0.36), px, (yTop + yBot) / 2, pz, 0, ry, 0));
    B.add(cutMat, T(box(width + 2.0, 0.30, 3.3, 0.5), px, yTop + 0.15, pz, 0, ry, 0));
  }

  // ---- 分水尖：券脚外侧一对三棱石，把水劈开
  for (const sgn of [-1, 1]) {
    for (const sd of [-1, 1]) {
      const [px, pz] = rot(sd * (HW + 0.30), sgn * ah);
      const hgt = spring - waterY + 1.5;
      B.add(stoneMat, T(cyl(0.34, 0.62, hgt, 3, 0.7), px, waterY + hgt / 2 - 0.4, pz, 0, ry + sgn * 0.4, 0));
    }
  }

  // ---- 栏杆：望柱 + 栏板，随拱线起伏
  for (const sd of [-1, 1]) {
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [px, pz] = rot(sd * (HW - 0.26), (t - 0.5) * span);
      const py = deckAt(t) + 0.02;
      B.add(railMat, T(box(0.26, 0.92, 0.26, 0.7), px, py + 0.46, pz, 0, ry, 0));
      B.add(railMat, T(sphere(0.155, 7, 6, 1.4), px, py + 1.02, pz));
      if (i < n) {
        const t2 = (i + 1) / n;
        const [qx, qz] = rot(sd * (HW - 0.26), (t2 - 0.5) * span);
        const qy = deckAt(t2) + 0.02;
        B.add(railMat, beam(px, py + 0.72, pz, qx, qy + 0.72, qz, 0.15, 0.20, 0.55));
        B.add(railMat, beam(px, py + 0.34, pz, qx, qy + 0.34, qz, 0.13, 0.46, 0.55));
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
