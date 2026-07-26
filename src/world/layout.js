// 舆图 —— 山谷布局、兽道走向、要地坐标。世界与玩法共用这一份地理事实。
import { clamp, smoothstep } from '../core/noise.js';

// ---- 折线工具 ---------------------------------------------------------
export function resample(points, step = 1.2) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

// Catmull-Rom 平滑，让兽道自然弯转
export function smoothPath(points, subdiv = 8) {
  const p = points;
  const out = [];
  const n = p.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n - 1, i + 2)];
    for (let k = 0; k < subdiv; k++) {
      const t = k / subdiv, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  out.push(p[n - 1].slice());
  return out;
}

export class Polyline {
  constructor(points) {
    this.pts = points;
    this.cum = [0];
    let L = 0;
    for (let i = 1; i < points.length; i++) {
      L += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      this.cum.push(L);
    }
    this.length = L;
    // 粗粒度空间索引，加速最近距离查询
    this._cell = 8;
    this._grid = new Map();
    for (let i = 0; i < points.length - 1; i++) {
      const [x, z] = points[i];
      const gx = Math.floor(x / this._cell), gz = Math.floor(z / this._cell);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const key = (gx + dx) + ',' + (gz + dz);
        let a = this._grid.get(key);
        if (!a) { a = []; this._grid.set(key, a); }
        a.push(i);
      }
    }
  }

  // 距离 + 最近点参数
  distanceTo(x, z) {
    const gx = Math.floor(x / this._cell), gz = Math.floor(z / this._cell);
    const idx = this._grid.get(gx + ',' + gz);
    let best = Infinity;
    const scan = idx || null;
    const n = this.pts.length - 1;
    const loop = (i) => {
      const a = this.pts[i], b = this.pts[i + 1];
      const abx = b[0] - a[0], abz = b[1] - a[1];
      const apx = x - a[0], apz = z - a[1];
      const len2 = abx * abx + abz * abz || 1e-6;
      let t = (apx * abx + apz * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = apx - abx * t, dz = apz - abz * t;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    };
    if (scan) { for (const i of scan) loop(i); }
    else { for (let i = 0; i < n; i += 2) loop(i); }
    return Math.sqrt(best);
  }

  at(dist) {
    const d = clamp(dist, 0, this.length);
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1e-6;
    const t = (d - this.cum[lo]) / seg;
    const a = this.pts[lo], b = this.pts[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  tangentAt(dist) {
    const a = this.at(Math.max(0, dist - 0.8));
    const b = this.at(Math.min(this.length, dist + 0.8));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
}

// ---- 山谷布局 ---------------------------------------------------------
export const HEART = { x: 0, z: 47 };

export const GATES = [
  { x: -36, z: -102, name: '左山口' },
  { x: 36, z: -102, name: '右山口' },
];

const BRANCH_L = smoothPath([
  [-36, -102], [-33, -90], [-24, -78], [-27, -63], [-18, -50], [-8, -38], [-2, -30], [0, -26],
], 6);

const BRANCH_R = smoothPath([
  [36, -102], [33, -88], [24, -76], [27, -61], [17, -48], [7, -37], [2, -30], [0, -26],
], 6);

const TRUNK = smoothPath([
  [0, -26], [0, -16], [0, -6], [-20, -1], [-36, 8], [-34, 24], [-16, 31],
  [2, 27], [20, 32], [30, 44], [14, 52], [0, 47],
], 10);

export const PATHS = {
  left: new Polyline(resample([...BRANCH_L, ...TRUNK.slice(1)], 1.0)),
  right: new Polyline(resample([...BRANCH_R, ...TRUNK.slice(1)], 1.0)),
};
export const TRUNK_LINE = new Polyline(resample(TRUNK, 1.0));
export const ALL_PATH_LINES = [PATHS.left, PATHS.right];

export function distToAnyPath(x, z) {
  return Math.min(PATHS.left.distanceTo(x, z), PATHS.right.distanceTo(x, z));
}

// ---- 溪流 -------------------------------------------------------------
export const RIVER_PTS = smoothPath([
  [-150, -40], [-108, -30], [-70, -22], [-40, -17], [-14, -13],
  [16, -12], [46, -15], [82, -22], [124, -34], [160, -46],
], 8);
export const RIVER = new Polyline(resample(RIVER_PTS, 1.6));
export const WATER_Y = -1.9;

// 兽道与溪流交汇处 —— 石拱桥
export const BRIDGE = { x: 0, z: -13.2, angle: 0.06, span: 17 };

// ---- 区域 -------------------------------------------------------------
export const PLAZA = { x0: -52, x1: 52, z0: -2, z1: 60 };

export const VALLEY_R = 118;   // 山谷内缘半径
export const VALLEY_C = { x: 0, z: -14 };

// 建筑占地（世界生成与建造格位都要避开）
export const FOOTPRINTS = [];
export function addFootprint(x, z, rx, rz, rot = 0) {
  FOOTPRINTS.push({ x, z, rx, rz, rot });
}
export function inFootprint(x, z, pad = 0) {
  for (const f of FOOTPRINTS) {
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < f.rx + pad && Math.abs(lz) < f.rz + pad) return true;
  }
  return false;
}

// 溪流中心线距离（用于挖河床、判断水中格位）
export function distToRiver(x, z) { return RIVER.distanceTo(x, z); }

// 台地：越往山里越高
export function terraceHeight(z) {
  const t = smoothstep(-18, -104, z);
  const steps = 5;
  const s = t * steps;
  const i = Math.floor(s);
  const f = s - i;
  return ((i + smoothstep(0.30, 0.86, f)) / steps) * 30;
}
