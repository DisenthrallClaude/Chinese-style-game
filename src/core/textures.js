// 程序化材质坊 —— 木纹、瓦当、青石、绢帛、铜锈，全部在运行时绘制
// Every texture in the game is generated procedurally on a 2D canvas at load
// time: no binary assets, no network fetches, fully deterministic.

import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from './noise.js';

const noise = new Noise(90210);
const cache = new Map();

function mkCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function toDataTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// 由高度图（取亮度）生成法线贴图 —— 这是让程序化表面「有肉感」的关键
export function normalFromCanvas(src, strength = 2.0) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const sd = sctx.getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h);
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      od.data[i] = (nx * 0.5 + 0.5) * 255;
      od.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      od.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      od.data[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

// 由亮度生成粗糙度贴图（可反相、可重映射）
export function roughnessFromCanvas(src, lo = 0.55, hi = 0.95, invert = false) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h);
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    let v = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
    if (invert) v = 1 - v;
    const r = clamp(lo + (hi - lo) * v, 0, 1) * 255;
    od.data[i * 4] = r; od.data[i * 4 + 1] = r; od.data[i * 4 + 2] = r; od.data[i * 4 + 3] = 255;
  }
  octx.putImageData(od, 0, 0);
  return out;
}

function px(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] === undefined ? 255 : c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ 木 */
// 老木：年轮 + 节疤 + 风化裂纹
function drawWood(size, opts = {}) {
  const {
    base = [126, 94, 62], dark = [58, 40, 25], light = [176, 143, 100],
    grain = 26, knots = 3, seed = 7, weather = 0.5,
  } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  const knotList = [];
  for (let i = 0; i < knots; i++) {
    knotList.push({ x: rng.range(0, size), y: rng.range(0, size), r: rng.range(size * 0.02, size * 0.05) });
  }
  px(ctx, size, size, (x, y) => {
    const u = x / size, v = y / size;
    // 沿 y 方向的木纹（贴图默认竖纹，使用时按需旋转 uv）
    let warp = noise.tileFbm(x * 1.0, y * 0.14, size, size * 0.14, 4, 2.4) * 9;
    let ring = (x + warp) / size * grain;
    let g = Math.abs(((ring % 1) + 1) % 1 - 0.5) * 2;
    g = Math.pow(g, 0.7);
    // 节疤扭曲
    for (const k of knotList) {
      const dx = x - k.x, dy = (y - k.y) * 2.6;
      const d = Math.hypot(dx, dy);
      if (d < k.r * 9) {
        const infl = Math.exp(-d / (k.r * 3.2));
        g = lerp(g, Math.abs(((d / (k.r * 1.5)) % 1) - 0.5) * 2, infl * 0.9);
      }
    }
    const fine = noise.tileFbm(x * 3.2, y * 0.5, size, size * 0.5, 3, 5) * 0.12;
    let t = clamp(g * 0.8 + fine + 0.15, 0, 1);
    let r = lerp(dark[0], light[0], t), gg = lerp(dark[1], light[1], t), b = lerp(dark[2], light[2], t);
    r = lerp(r, base[0], 0.35); gg = lerp(gg, base[1], 0.35); b = lerp(b, base[2], 0.35);
    // 风化灰化 + 苔痕
    const w2 = noise.tileFbm(x * 0.9, y * 0.9, size, size, 5, 3) * 0.5 + 0.5;
    const gray = smoothstep(0.45, 0.95, w2) * weather;
    r = lerp(r, 138, gray * 0.5); gg = lerp(gg, 132, gray * 0.5); b = lerp(b, 118, gray * 0.5);
    const moss = smoothstep(0.72, 0.98, noise.tileFbm(x * 1.7 + 40, y * 1.7, size, size, 4, 2.5) * 0.5 + 0.5);
    r = lerp(r, 74, moss * 0.5 * weather); gg = lerp(gg, 92, moss * 0.55 * weather); b = lerp(b, 48, moss * 0.5 * weather);
    // 深裂
    const crack = smoothstep(0.985, 1.0, Math.abs(noise.tileFbm(x * 0.6, y * 0.09, size, size * 0.09, 3, 6)) * 2 + 0.5);
    const k2 = 1 - crack * 0.75;
    return [r * k2, gg * k2, b * k2];
  });
  return c;
}

/* ---------------------------------------------------------------- 瓦 */
// 中式筒瓦屋面：一垄一垄的半圆瓦，青灰釉，带苔与积尘
function drawRoofTile(size, opts = {}) {
  const { cols = 9, seed = 21, hue = [62, 72, 80] } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  const jitter = [];
  for (let i = 0; i < cols; i++) jitter.push(rng.range(-0.14, 0.14));
  px(ctx, size, size, (x, y) => {
    const u = x / size;
    const fu = u * cols;
    const ci = Math.floor(fu);
    let t = fu - ci;                     // 0..1 横跨一垄
    // 半圆瓦截面 -> 明暗
    const bulge = Math.sin(Math.PI * clamp(t, 0, 1));
    let shade = Math.pow(bulge, 0.55);
    // 瓦沟（两垄之间的凹槽）
    const groove = smoothstep(0.0, 0.13, t) * smoothstep(1.0, 0.87, t);
    shade *= lerp(0.34, 1.0, groove);
    // 沿垄方向的一片片瓦片接缝
    const rows = 13;
    const fy = y / size * rows + jitter[ci % cols] * 2;
    const ry = fy - Math.floor(fy);
    const seam = smoothstep(0.0, 0.09, ry) * smoothstep(1.0, 0.93, ry);
    shade *= lerp(0.5, 1.0, seam);
    shade += (1 - seam) * 0.02;
    // 釉面斑驳
    const n = noise.tileFbm(x * 2.2, y * 2.2, size, size, 5, 3) * 0.5 + 0.5;
    shade *= lerp(0.82, 1.12, n);
    let r = hue[0] * shade, g = hue[1] * shade, b = hue[2] * shade;
    // 苔藓沿瓦沟生长
    const mossN = noise.tileFbm(x * 1.5 + 90, y * 1.5, size, size, 4, 2.5) * 0.5 + 0.5;
    const moss = smoothstep(0.56, 0.9, mossN) * (1 - groove * 0.6);
    r = lerp(r, 66, moss * 0.55); g = lerp(g, 86, moss * 0.6); b = lerp(b, 44, moss * 0.5);
    // 高光边（釉的反光）
    const hl = Math.pow(clamp(bulge, 0, 1), 6) * 34;
    return [clamp(r + hl, 0, 255), clamp(g + hl, 0, 255), clamp(b + hl * 1.05, 0, 255)];
  });
  return c;
}

/* -------------------------------------------------------------- 青石板 */
function drawFlagstone(size, opts = {}) {
  const { cells = 7, seed = 33, base = [116, 112, 102], joint = [44, 42, 37] } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  // Worley 点
  const pts = [];
  for (let gy = -1; gy <= cells; gy++) {
    for (let gx = -1; gx <= cells; gx++) {
      pts.push([
        ((gx + rng.range(0.18, 0.82)) / cells) * size,
        ((gy + rng.range(0.18, 0.82)) / cells) * size,
        rng.range(0.86, 1.14),
      ]);
    }
  }
  px(ctx, size, size, (x, y) => {
    // 域扭曲让石缝不那么规整
    const wx = x + noise.tileFbm(x * 1.4, y * 1.4, size, size, 3, 3) * size * 0.035;
    const wy = y + noise.tileFbm(x * 1.4 + 55, y * 1.4 + 55, size, size, 3, 3) * size * 0.035;
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx = wx - p[0], dy = wy - p[1];
      // 环绕
      if (dx > size / 2) dx -= size; if (dx < -size / 2) dx += size;
      if (dy > size / 2) dy -= size; if (dy < -size / 2) dy += size;
      const d = Math.hypot(dx, dy) * p[2];
      if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) { d2 = d; }
    }
    const edge = d2 - d1;                       // 到石缝的距离
    const jw = size * 0.016;
    const inStone = smoothstep(jw * 0.35, jw * 1.8, edge);
    // 每块石头自身色差
    const h = ((id * 2654435761) >>> 0) / 4294967296;
    let tint = lerp(0.92, 1.08, h);
    const grain = noise.tileFbm(x * 4.5, y * 4.5, size, size, 4, 6) * 0.06;
    const mottle = noise.tileFbm(x * 1.1 + id * 3, y * 1.1, size, size, 4, 2) * 0.07;
    // 边缘倒角带来的亮边
    const bevel = smoothstep(jw * 0.4, jw * 2.6, edge);
    const lightEdge = (1 - bevel) * 0.09;
    let r = base[0] * tint * (1 + grain + mottle + lightEdge);
    let g = base[1] * tint * (1 + grain + mottle + lightEdge);
    let b = base[2] * tint * (1 + grain + mottle * 0.8 + lightEdge);
    // 石缝里的泥苔
    const mossN = noise.tileFbm(x * 2.0 + 200, y * 2.0, size, size, 4, 3) * 0.5 + 0.5;
    const moss = (1 - inStone) * smoothstep(0.3, 0.8, mossN);
    r = lerp(joint[0], r, inStone); g = lerp(joint[1], g, inStone); b = lerp(joint[2], b, inStone);
    r = lerp(r, 68, moss * 0.6); g = lerp(g, 92, moss * 0.65); b = lerp(b, 46, moss * 0.55);
    // 踩踏磨光
    const wear = smoothstep(0.55, 1.0, noise.tileFbm(x * 0.55, y * 0.55, size, size, 3, 1.6) * 0.5 + 0.5) * inStone;
    r = lerp(r, r * 1.08 + 6, wear * 0.4); g = lerp(g, g * 1.08 + 6, wear * 0.4); b = lerp(b, b * 1.06 + 5, wear * 0.4);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* ---------------------------------------------------------------- 山岩 */
function drawRock(size, opts = {}) {
  const { base = [108, 106, 103], seed = 41, strata = 7 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const warp = noise.tileFbm(x * 0.8, y * 0.8, size, size, 4, 2) * size * 0.12;
    const s = ((y + warp) / size) * strata;
    let band = Math.abs((s % 1) - 0.5) * 2;
    band = Math.pow(band, 1.6);
    const detail = noise.tileFbm(x * 3.0, y * 3.0, size, size, 5, 4) * 0.5 + 0.5;
    const coarse = noise.tileFbm(x * 1.1, y * 1.1, size, size, 4, 1.7) * 0.5 + 0.5;
    let v = lerp(0.52, 1.30, detail * 0.5 + coarse * 0.5) * lerp(0.72, 1.12, band);
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    // 铁锈渗色
    const rust = smoothstep(0.68, 0.95, noise.tileFbm(x * 0.9 + 300, y * 0.9, size, size, 4, 2) * 0.5 + 0.5);
    r = lerp(r, 118, rust * 0.40); g = lerp(g, 92, rust * 0.34); b = lerp(b, 66, rust * 0.30);
    // 植被苔痕
    const moss = smoothstep(0.6, 0.95, noise.tileFbm(x * 1.6 + 700, y * 1.6, size, size, 4, 2.6) * 0.5 + 0.5);
    r = lerp(r, 70, moss * 0.42); g = lerp(g, 90, moss * 0.5); b = lerp(b, 52, moss * 0.4);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* -------------------------------------------------------------- 泥土地 */
function drawSoil(size, opts = {}) {
  const { base = [138, 116, 88], seed = 51 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  px(ctx, size, size, (x, y) => {
    const n1 = noise.tileFbm(x * 2.4, y * 2.4, size, size, 5, 4) * 0.5 + 0.5;
    const n2 = noise.tileFbm(x * 6.0, y * 6.0, size, size, 3, 9) * 0.5 + 0.5;
    let v = lerp(0.7, 1.22, n1 * 0.65 + n2 * 0.35);
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    // 碎石
    const peb = noise.tileFbm(x * 8, y * 8, size, size, 2, 14) * 0.5 + 0.5;
    const isPeb = smoothstep(0.78, 0.9, peb);
    r = lerp(r, 150, isPeb * 0.6); g = lerp(g, 146, isPeb * 0.6); b = lerp(b, 136, isPeb * 0.6);
    // 草根
    const gr = smoothstep(0.62, 0.92, noise.tileFbm(x * 3.1 + 90, y * 3.1, size, size, 4, 3) * 0.5 + 0.5);
    r = lerp(r, 84, gr * 0.45); g = lerp(g, 102, gr * 0.5); b = lerp(b, 52, gr * 0.45);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* ---------------------------------------------------------------- 草地 */
function drawGrassGround(size) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const n1 = noise.tileFbm(x * 3.2, y * 3.2, size, size, 5, 5) * 0.5 + 0.5;
    const n2 = noise.tileFbm(x * 9, y * 9, size, size, 3, 13) * 0.5 + 0.5;
    const patch = noise.tileFbm(x * 0.9, y * 0.9, size, size, 3, 1.6) * 0.5 + 0.5;
    const v = n1 * 0.6 + n2 * 0.4;
    let r = lerp(62, 132, v) * lerp(0.85, 1.15, patch);
    let g = lerp(86, 166, v) * lerp(0.85, 1.12, patch);
    let b = lerp(40, 78, v) * lerp(0.9, 1.1, patch);
    // 枯黄
    const dry = smoothstep(0.66, 0.95, patch);
    r = lerp(r, 142, dry * 0.4); g = lerp(g, 130, dry * 0.32); b = lerp(b, 74, dry * 0.3);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* --------------------------------------------------------------- 灯笼纸 */
function drawPaper(size, tint = [255, 214, 150]) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const fib = noise.tileFbm(x * 7, y * 1.4, size, size * 0.2, 3, 8) * 0.5 + 0.5;
    const fib2 = noise.tileFbm(x * 1.4, y * 7, size * 0.2, size, 3, 8) * 0.5 + 0.5;
    const blot = noise.tileFbm(x * 1.6, y * 1.6, size, size, 4, 2.2) * 0.5 + 0.5;
    const v = lerp(0.88, 1.06, fib * 0.4 + fib2 * 0.35 + blot * 0.25);
    return [clamp(tint[0] * v, 0, 255), clamp(tint[1] * v, 0, 255), clamp(tint[2] * v, 0, 255)];
  });
  return c;
}

/* ----------------------------------------------------------------- 绢帛 */
function drawCloth(size, opts = {}) {
  const { base = [166, 42, 38], seed = 61 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const weaveX = (Math.sin(x * Math.PI * 2 / 3) * 0.5 + 0.5);
    const weaveY = (Math.sin(y * Math.PI * 2 / 3) * 0.5 + 0.5);
    const weave = (weaveX * 0.5 + weaveY * 0.5);
    const worn = noise.tileFbm(x * 1.8, y * 1.8, size, size, 4, 2.4) * 0.5 + 0.5;
    const v = lerp(0.84, 1.1, weave * 0.35 + worn * 0.65);
    const fade = smoothstep(0.6, 1.0, worn) * 0.28;
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    r = lerp(r, 196, fade); g = lerp(g, 160, fade); b = lerp(b, 128, fade);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* ---------------------------------------------------------------- 青铜 */
function drawBronze(size, opts = {}) {
  const { base = [138, 106, 58], patina = [66, 126, 108], seed = 71 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const n = noise.tileFbm(x * 2.6, y * 2.6, size, size, 5, 3.4) * 0.5 + 0.5;
    const n2 = noise.tileFbm(x * 7, y * 7, size, size, 3, 8) * 0.5 + 0.5;
    let v = lerp(0.72, 1.2, n * 0.6 + n2 * 0.4);
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    const pt = smoothstep(0.5, 0.86, noise.tileFbm(x * 1.5 + 500, y * 1.5, size, size, 4, 2.2) * 0.5 + 0.5);
    r = lerp(r, patina[0], pt * 0.68); g = lerp(g, patina[1], pt * 0.72); b = lerp(b, patina[2], pt * 0.7);
    const dirt = smoothstep(0.72, 1.0, n2) * 0.25;
    r *= 1 - dirt; g *= 1 - dirt; b *= 1 - dirt;
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  return c;
}

/* -------------------------------------------------------------- 白灰墙 */
function drawPlaster(size) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const n = noise.tileFbm(x * 2.2, y * 2.2, size, size, 5, 3) * 0.5 + 0.5;
    const stain = noise.tileFbm(x * 0.8, y * 1.4, size, size, 4, 1.7) * 0.5 + 0.5;
    let v = lerp(0.86, 1.05, n);
    let r = 170 * v, g = 164 * v, b = 150 * v;
    // 雨痕自上而下
    const streak = smoothstep(0.55, 1.0, stain) * smoothstep(0.0, 0.7, y / size);
    r = lerp(r, 150, streak * 0.45); g = lerp(g, 148, streak * 0.45); b = lerp(b, 134, streak * 0.42);
    const crack = smoothstep(0.975, 1.0, Math.abs(noise.tileFbm(x * 1.4, y * 1.4, size, size, 3, 4)) * 2 + 0.5);
    const k = 1 - crack * 0.55;
    return [r * k, g * k, b * k];
  });
  return c;
}

/* ------------------------------------------------------- 树叶 / 草 蒙版 */
// 一簇树叶的 RGBA 贴图，用于交叉面片
function drawLeafCluster(size, opts = {}) {
  const { seed = 3, color = [58, 96, 40], hi = [128, 168, 74], count = 260 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = new Rng(seed);
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < count; i++) {
    // 团簇分布：向中心聚拢
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.pow(rng.next(), 0.62) * size * 0.47;
    const x = cx + Math.cos(a) * rr * 1.12;
    const y = cy + Math.sin(a) * rr * 0.9;
    const s = rng.range(size * 0.035, size * 0.085) * lerp(1.25, 0.6, rr / (size * 0.5));
    const rot = rng.range(0, Math.PI * 2);
    const shade = lerp(0.55, 1.15, Math.pow(rng.next(), 0.8)) * lerp(1.15, 0.7, rr / (size * 0.5));
    const r = clamp(lerp(color[0], hi[0], rng.next()) * shade, 0, 255);
    const g = clamp(lerp(color[1], hi[1], rng.next()) * shade, 0, 255);
    const b = clamp(lerp(color[2], hi[2], rng.next()) * shade, 0, 255);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.beginPath();
    // 叶片：两段贝塞尔构成的柳叶形
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.72, 0, 0, s);
    ctx.quadraticCurveTo(-s * 0.72, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }
  // 边缘羽化，避免硬切
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x - cx) / (size * 0.5), dy = (y - cy) / (size * 0.5);
      const r = Math.hypot(dx, dy);
      const fall = 1 - smoothstep(0.72, 1.02, r);
      d[i + 3] = clamp(d[i + 3] * fall, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawGrassBlades(size, opts = {}) {
  const { seed = 5, color = [54, 82, 34], hi = [104, 132, 58], count = 22 } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = rng.range(size * 0.06, size * 0.94);
    const h = rng.range(size * 0.42, size * 0.95);
    const bend = rng.range(-1, 1) * size * 0.24;
    const w = rng.range(size * 0.012, size * 0.028);
    const t = rng.next();
    const r = lerp(color[0], hi[0], t), g = lerp(color[1], hi[1], t), b = lerp(color[2], hi[2], t);
    const grad = ctx.createLinearGradient(x0, size, x0 + bend, size - h);
    grad.addColorStop(0, `rgb(${(r * 0.55) | 0},${(g * 0.55) | 0},${(b * 0.5) | 0})`);
    grad.addColorStop(1, `rgb(${r | 0},${g | 0},${b | 0})`);
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, size);
    ctx.quadraticCurveTo(x0 + bend * 0.3, size - h * 0.55, x0 + bend, size - h);
    ctx.lineWidth = w * 2;
    ctx.stroke();
  }
  return c;
}

/* ------------------------------------------------------------- 窗棂纹样 */
// 中式冰裂纹 / 步步锦窗格，作为 alpha 贴图打在窗上
function drawLattice(size, opts = {}) {
  const { seed = 9, style = 'grid' } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'square';
  const rng = new Rng(seed);
  if (style === 'ice') {
    // 冰裂纹：随机线段网络
    for (let i = 0; i < 46; i++) {
      const x1 = rng.range(0, size), y1 = rng.range(0, size);
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(size * 0.18, size * 0.5);
      ctx.lineWidth = size * 0.022;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + Math.cos(a) * len, y1 + Math.sin(a) * len);
      ctx.stroke();
    }
  } else {
    const n = 5;
    ctx.lineWidth = size * 0.03;
    for (let i = 0; i <= n; i++) {
      const p = (i / n) * size;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    // 回字纹角饰
    ctx.lineWidth = size * 0.022;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i + j) % 2) continue;
        const x = (i / n) * size, y = (j / n) * size, s = size / n;
        ctx.strokeRect(x + s * 0.26, y + s * 0.26, s * 0.48, s * 0.48);
      }
    }
  }
  // 外框
  ctx.lineWidth = size * 0.07;
  ctx.strokeRect(0, 0, size, size);
  return c;
}

/* ------------------------------------------------------------ 通用噪声 */
function drawNoiseRGBA(size, scale = 4, octaves = 4) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const a = noise.tileFbm(x * scale / 64, y * scale / 64, size * scale / 64, size * scale / 64, octaves, 1) * 0.5 + 0.5;
    const b = noise.tileFbm(x * scale / 32 + 17, y * scale / 32 + 17, size * scale / 32, size * scale / 32, octaves, 1) * 0.5 + 0.5;
    const d = noise.tileFbm(x * scale / 16 + 91, y * scale / 16 + 91, size * scale / 16, size * scale / 16, 3, 1) * 0.5 + 0.5;
    return [a * 255, b * 255, d * 255, 255];
  });
  return c;
}

// 水面法线：两层不同尺度的涟漪叠加
function drawWaterHeight(size) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const a = noise.tileFbm(x * 2.4, y * 2.4, size, size, 4, 3.2) * 0.5 + 0.5;
    const b = noise.tileFbm(x * 6.5, y * 6.5, size, size, 3, 9) * 0.5 + 0.5;
    const v = clamp(a * 0.66 + b * 0.34, 0, 1) * 255;
    return [v, v, v];
  });
  return c;
}

// 柔和圆形 alpha（雾团、光斑、粒子）
function drawSoftBlob(size, opts = {}) {
  const { power = 2.4, core = 0.0, tint = [255, 255, 255] } = opts;
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const dx = (x / size - 0.5) * 2, dy = (y / size - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    let a = Math.pow(clamp(1 - r, 0, 1), power);
    if (core > 0) a = clamp(a + Math.pow(clamp(1 - r / core, 0, 1), 1.5), 0, 1);
    return [tint[0], tint[1], tint[2], a * 255];
  });
  return c;
}

// 带絮状边缘的雾团（比纯圆更像真雾）
function drawMistPuff(size) {
  const c = mkCanvas(size);
  const ctx = c.getContext('2d');
  px(ctx, size, size, (x, y) => {
    const dx = (x / size - 0.5) * 2, dy = (y / size - 0.5) * 2;
    let r = Math.hypot(dx, dy);
    const n = noise.fbm2(x * 0.018, y * 0.018, 5, 2.2, 0.55) * 0.5 + 0.5;
    r += (n - 0.5) * 0.75;
    const a = Math.pow(clamp(1 - r, 0, 1), 1.9) * lerp(0.55, 1.0, n);
    return [255, 255, 255, clamp(a, 0, 1) * 255];
  });
  return c;
}

// 星空
function drawStars(w, h) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const rng = new Rng(2024);
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(0, w), y = rng.range(0, h);
    const s = Math.pow(rng.next(), 3.2);
    const r = s * 1.9 + 0.24;
    const b = 120 + s * 135;
    const warm = rng.next();
    ctx.fillStyle = `rgba(${(b * lerp(0.82, 1, warm)) | 0},${(b * 0.95) | 0},${(b * lerp(1, 0.82, warm)) | 0},${0.35 + s * 0.65})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 银河
  const g = ctx.createLinearGradient(0, h * 0.28, w, h * 0.62);
  for (let i = 0; i < 260; i++) {
    const t = i / 260;
    const x = t * w;
    const y = h * 0.42 + Math.sin(t * 3.1) * h * 0.1;
    const rad = h * 0.1;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(150,165,205,0.055)');
    grd.addColorStop(1, 'rgba(150,165,205,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

/* ------------------------------------------------------------------ API */
const builders = {
  wood: () => drawWood(512, { seed: 7 }),
  woodDark: () => drawWood(512, { seed: 13, base: [92, 66, 44], dark: [40, 28, 18], light: [140, 108, 72], weather: 0.72 }),
  woodRed: () => drawWood(512, { seed: 23, base: [128, 58, 42], dark: [62, 24, 18], light: [178, 92, 62], weather: 0.3, grain: 20 }),
  roofTile: () => drawRoofTile(512, { cols: 9 }),
  roofTileDark: () => drawRoofTile(512, { cols: 11, seed: 44, hue: [48, 56, 64] }),
  flagstone: () => drawFlagstone(512, { cells: 9, base: [126, 121, 110] }),
  flagstoneFine: () => drawFlagstone(512, { cells: 11, seed: 77, base: [124, 119, 108] }),
  rock: () => drawRock(512, {}),
  rockDark: () => drawRock(512, { base: [86, 88, 92], seed: 88, strata: 5 }),
  soil: () => drawSoil(512, {}),
  grassGround: () => drawGrassGround(512),
  paper: () => drawPaper(256, [228, 182, 118]),
  paperWhite: () => drawPaper(256, [214, 204, 178]),
  clothRed: () => drawCloth(256, { base: [158, 40, 36] }),
  clothIndigo: () => drawCloth(256, { base: [42, 62, 104], seed: 65 }),
  bronze: () => drawBronze(256, {}),
  iron: () => drawBronze(256, { base: [92, 92, 98], patina: [70, 74, 82], seed: 91 }),
  gold: () => drawBronze(256, { base: [198, 158, 66], patina: [150, 116, 48], seed: 95 }),
  plaster: () => drawPlaster(512),
  leafA: () => drawLeafCluster(256, { seed: 3 }),
  leafB: () => drawLeafCluster(256, { seed: 8, color: [46, 82, 36], hi: [110, 152, 62] }),
  leafC: () => drawLeafCluster(256, { seed: 15, color: [72, 96, 42], hi: [156, 178, 84] }),
  leafPine: () => drawLeafCluster(256, { seed: 27, color: [32, 62, 46], hi: [72, 110, 70], count: 320 }),
  grassTuft: () => drawGrassBlades(128, {}),
  latticeGrid: () => drawLattice(256, { style: 'grid' }),
  latticeIce: () => drawLattice(256, { style: 'ice', seed: 19 }),
  noiseRGBA: () => drawNoiseRGBA(256, 4, 4),
  waterHeight: () => drawWaterHeight(512),
  blob: () => drawSoftBlob(128, { power: 2.6 }),
  blobHot: () => drawSoftBlob(128, { power: 3.4, core: 0.34 }),
  mistPuff: () => drawMistPuff(256),
  stars: () => drawStars(2048, 1024),
};

export const TEX = {};          // name -> THREE.Texture (sRGB color)
export const CANVAS = {};       // name -> HTMLCanvasElement
const derived = new Map();

export function buildTextureNames() { return Object.keys(builders); }

export function buildTexture(name) {
  if (CANVAS[name]) return TEX[name];
  const canvas = builders[name]();
  CANVAS[name] = canvas;
  TEX[name] = toTexture(canvas, 1);
  return TEX[name];
}

// 取得某张贴图对应的法线图（惰性生成 + 缓存）
export function normalOf(name, strength = 2.0, repeat = 1) {
  const key = `n:${name}:${strength}`;
  if (!derived.has(key)) {
    const c = normalFromCanvas(CANVAS[name] || builders[name](), strength);
    derived.set(key, c);
  }
  const t = toDataTexture(derived.get(key), repeat);
  return t;
}

export function roughnessOf(name, lo = 0.55, hi = 0.95, invert = false, repeat = 1) {
  const key = `r:${name}:${lo}:${hi}:${invert}`;
  if (!derived.has(key)) {
    const c = roughnessFromCanvas(CANVAS[name] || builders[name](), lo, hi, invert);
    derived.set(key, c);
  }
  return toDataTexture(derived.get(key), repeat);
}

// 取得一张带独立 repeat 的彩色贴图副本
export function colorOf(name, repeat = 1) {
  const t = toTexture(CANVAS[name] || builders[name](), repeat);
  return t;
}

export function alphaOf(name, repeat = 1) {
  return toDataTexture(CANVAS[name] || builders[name](), repeat);
}

export { toTexture, toDataTexture, mkCanvas };
