// 舆图 —— 当前关卡的地理事实。世界与玩法共用这一份。
//
// 这里导出的是「活绑定」：applyLevel() 一换关，所有 import 方看到的都是新值。
// 因此各模块必须在 applyLevel() 之后再构造，不可在模块顶层解构这些值。
import { clamp, smoothstep } from '../core/noise.js';
import { LEVELS } from './levels.js';

// 折线距离查询的关心半径。地形里所有跟兽道／水道有关的 smoothstep
// 上界都远小于它，超出就没必要精确算了。
const FAR = 48;

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

    // 包围盒：地形高程场只关心 FAR 以内的距离，盒外一律走解析下界，
    // 免得每个远处顶点都去扫一遍折线（地形几万个顶点，这是最烫的一条路）
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;

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

  // 距离查询。超过 FAR 之外只保证「不小于真值」，高程场的所有 smoothstep
  // 在那个距离上早就饱和了，取个下界完全够用。
  distanceTo(x, z) {
    const bx = Math.max(this.minX - x, 0, x - this.maxX);
    const bz = Math.max(this.minZ - z, 0, z - this.maxZ);
    const bd = bx > 0 || bz > 0 ? Math.hypot(bx, bz) : 0;
    if (bd > FAR) return bd;

    let best = Infinity;
    const pts = this.pts;
    const loop = (i) => {
      const a = pts[i], b = pts[i + 1];
      const abx = b[0] - a[0], abz = b[1] - a[1];
      const apx = x - a[0], apz = z - a[1];
      const len2 = abx * abx + abz * abz || 1e-6;
      let t = (apx * abx + apz * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = apx - abx * t, dz = apz - abz * t;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    };

    const gx = Math.floor(x / this._cell), gz = Math.floor(z / this._cell);
    const idx = this._grid.get(gx + ',' + gz);
    if (idx) { for (const i of idx) loop(i); return Math.sqrt(best); }

    // 本格是空的：向外一圈圈找，找到就够了，不必扫全线
    for (let r = 1; r <= 6; r++) {
      let hit = false;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const a = this._grid.get((gx + dx) + ',' + (gz + dz));
          if (!a) continue;
          hit = true;
          for (const i of a) loop(i);
        }
      }
      if (hit) return Math.sqrt(best);
    }
    // 六圈都没有，那就是真的远，返回下界
    return Math.max(bd, this._cell * 6);
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

/* ================================================================
   当前关卡的地理事实（由 applyLevel 填充）
   ================================================================ */
export let LEVEL = null;
export let HEART = { x: 0, z: 0 };
export let GATES = [];
export let PATHS = { left: null, right: null };
export let TRUNK_LINE = null;
export let ALL_PATH_LINES = [];
export let RIVER = null;
export let RIVER_PTS = [];
export let WATER_Y = -1.9;
export let WATER_KIND = 'river';
export let WATER_SHEET = false;
export let BRIDGE = null;
export let PLAZA = { x0: -50, x1: 50, z0: 0, z1: 50 };
export let VALLEY_C = { x: 0, z: 0 };
export let VALLEY_R = 118;
export let BUILD_R = 112;

// 建筑占地（世界生成与建造格位都要避开）—— 数组身份保持不变，换关只清空
export const FOOTPRINTS = [];

export function addFootprint(x, z, rx, rz, rot = 0) {
  FOOTPRINTS.push({ x, z, rx, rz, rot });
}

export function inFootprint(x, z, pad = 0) {
  for (let i = 0; i < FOOTPRINTS.length; i++) {
    const f = FOOTPRINTS[i];
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < f.rx + pad && Math.abs(lz) < f.rz + pad) return true;
  }
  return false;
}

export function distToAnyPath(x, z) {
  return Math.min(PATHS.left.distanceTo(x, z), PATHS.right.distanceTo(x, z));
}

// 水道中心线距离。铺成一整片的海／云海没有中心线，一律返回极大值，
// 免得地形把「河床」挖到海底去。
export function distToRiver(x, z) {
  return WATER_SHEET ? 1e6 : RIVER.distanceTo(x, z);
}

/* ---------------------------------------------------------------- 换关 */
export function applyLevel(indexOrDef) {
  const L = typeof indexOrDef === 'number' ? LEVELS[indexOrDef] : indexOrDef;
  if (!L) throw new Error('未知关卡: ' + indexOrDef);
  LEVEL = L;

  const bl = smoothPath(L.branchL, 6);
  const br = smoothPath(L.branchR, 6);
  const tr = smoothPath(L.trunk, 10);

  PATHS = {
    left: new Polyline(resample([...bl, ...tr.slice(1)], 1.0)),
    right: new Polyline(resample([...br, ...tr.slice(1)], 1.0)),
  };
  TRUNK_LINE = new Polyline(resample(tr, 1.0));
  ALL_PATH_LINES = [PATHS.left, PATHS.right];

  RIVER_PTS = smoothPath(L.water.pts, 8);
  RIVER = new Polyline(resample(RIVER_PTS, 1.6));
  WATER_Y = L.geo.waterY;
  WATER_KIND = L.water.kind;
  WATER_SHEET = !!L.water.sheet;

  // 山口的 y 每关重算，先清掉上一关留下的
  GATES = L.gates.map(g => ({ x: g.x, z: g.z, name: g.name, y: 0 }));
  HEART = { x: L.heart.x, z: L.heart.z };
  PLAZA = { ...L.plaza };
  BRIDGE = L.bridge ? { ...L.bridge } : null;
  VALLEY_C = { ...L.geo.center };
  VALLEY_R = L.geo.innerR;
  BUILD_R = L.geo.buildR;

  FOOTPRINTS.length = 0;
  return L;
}
