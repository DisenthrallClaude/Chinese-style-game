// 草木 —— 实例化的林木、灌丛、竹与风动的叶。族属与疏密由当关的 flora 决定。
import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { box, cyl, cone, sphere, plane, T, beam } from './geo.js';
import { getMaterials } from './materials.js';
import { colorOf } from '../core/textures.js';
import { toonify } from '../core/toon.js';
import {
  LEVEL, distToAnyPath, distToRiver, inFootprint, VALLEY_C, HEART, WATER_Y,
} from './layout.js';

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1.0 } };

// 各关的草木族属
const PALETTES = {
  green: { leaves: ['leafA', 'leafB', 'leafC'], pine: 'leafPine', grass: 'grassTuft', trunk: 'woodDark', bark: 'wood' },
  ash:   { leaves: ['leafDry', 'leafScorch', 'leafDry'], pine: 'leafDry', grass: 'grassDry', trunk: 'woodDark', bark: 'woodDark' },
  frost: { leaves: ['leafFrost', 'leafFrost', 'leafB'], pine: 'leafFrost', grass: 'grassFrost', trunk: 'woodDark', bark: 'woodDark' },
  sea:   { leaves: ['leafPalm', 'leafB', 'leafC'], pine: 'leafPine', grass: 'grassTuft', trunk: 'wood', bark: 'wood' },
  jade:  { leaves: ['leafJade', 'leafC', 'leafB'], pine: 'leafJade', grass: 'grassTuft', trunk: 'woodDark', bark: 'wood' },
};

// 晶簇的颜色：炎火之山是火晶，寒渊是冰棱，昆仑是玉髓
const CRYSTAL = {
  ash: { color: 0x2a0e06, emissive: 0xff6a1e, rough: 0.35 },
  frost: { color: 0x9fd8ee, emissive: 0x3f9fd0, rough: 0.16 },
  jade: { color: 0xa8e0c4, emissive: 0x58d0a0, rough: 0.22 },
  sea: { color: 0x9fe0e8, emissive: 0x30b0c0, rough: 0.24 },
  green: { color: 0xc8d8e0, emissive: 0x6090a0, rough: 0.3 },
};

function makeFoliageMaterial(base, stiffness = 1.0) {
  const m = base.clone();
  m.userData = {};
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iOrigin = vec3(0.0);
        #endif
        float ph = iOrigin.x * 0.31 + iOrigin.z * 0.27;
        float hgt = max(0.0, transformed.y) * ${stiffness.toFixed(2)};
        float sway = sin(uTime * 1.15 + ph) * 0.55 + sin(uTime * 2.31 + ph * 1.7) * 0.30
                   + sin(uTime * 4.10 + ph * 2.9) * 0.15;
        transformed.x += sway * hgt * 0.055 * uWind;
        transformed.z += cos(uTime * 0.97 + ph * 1.3) * hgt * 0.040 * uWind;
      `);
  };
  m.customProgramCacheKey = () => 'foliage' + stiffness;
  // clone() 不带走卡通着色，得再挂一次
  toonify(m, 0.46);
  return m;
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

/* --------------------------------------------------- 树干与枝 */
function trunkGeo(rng, { h = 9, r = 0.5, branches = 4, lean = 0.1 } = {}) {
  const parts = [];
  const segs = 4;
  let px = 0, py = 0, pz = 0;
  let dirX = rng.range(-lean, lean), dirZ = rng.range(-lean, lean);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const r0 = r * lerp(1, 0.30, t0), r1 = r * lerp(1, 0.30, t1);
    const y0 = h * t0, y1 = h * t1;
    const x0 = px, z0 = pz;
    px += dirX * h / segs * (1 + i * 0.9);
    pz += dirZ * h / segs * (1 + i * 0.9);
    const g = cyl(r1, r0, Math.hypot(y1 - y0, px - x0, pz - z0), 8, 0.6);
    const mid = new THREE.Vector3((x0 + px) / 2, (y0 + y1) / 2, (z0 + pz) / 2);
    const dir = new THREE.Vector3(px - x0, y1 - y0, pz - z0).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    parts.push(g);
  }
  for (let i = 0; i < branches; i++) {
    const a = rng.range(0, Math.PI * 2);
    const t = rng.range(0.42, 0.86);
    const bl = h * rng.range(0.22, 0.42);
    const x0 = px * t, y0 = h * t, z0 = pz * t;
    const x1 = x0 + Math.cos(a) * bl, y1 = y0 + bl * rng.range(0.45, 0.9), z1 = z0 + Math.sin(a) * bl;
    parts.push(beam(x0, y0, z0, x1, y1, z1, r * 0.26, r * 0.26, 0.7));
  }
  parts.push(T(cyl(r * 1.05, r * 1.7, 0.7, 8, 0.6), 0, 0.25, 0));
  return { geo: mergeList(parts), topX: px, topY: h, topZ: pz };
}

/* --------------------------------------------------- 叶团 */
function crownGeo(rng, { R = 3.6, blobs = 7, quads = 3 } = {}) {
  const parts = [];
  for (let b = 0; b < blobs; b++) {
    const a = rng.range(0, Math.PI * 2);
    const t = Math.pow(rng.next(), 0.42);
    const rr = t * R * 0.92;
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    const cy = R * (0.34 - t * t * 0.62) + rng.range(-0.18, 0.18) * R;
    const s = R * rng.range(0.44, 0.70) * (1.08 - t * 0.26);
    for (let q = 0; q < quads; q++) {
      const g = plane(s, s * rng.range(0.78, 1.0), 1 / s);
      const ang = (q / quads) * Math.PI + rng.range(-0.35, 0.35);
      T(g, cx, cy, cz, rng.range(-0.5, 0.5), ang, rng.range(-0.35, 0.35));
      parts.push(g);
    }
  }
  return mergeList(parts);
}

/* --------------------------------------------------- 松 */
function pineGeo(rng, { h = 11, r = 0.42 } = {}) {
  return { trunk: mergeList([T(cyl(r * 0.24, r, h, 7, 0.6), 0, h / 2, 0)]), h };
}
function pineCrown(rng, { h = 11, R = 2.6, layers = 7 } = {}) {
  const parts = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = h * (0.24 + t * 0.74);
    const rr = R * (1 - t * 0.82) * rng.range(0.88, 1.14);
    const n = Math.max(3, Math.round(5 - t * 2));
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const g = plane(rr * 1.35, rr * 0.85, 1 / (rr * 1.4));
      T(g, Math.cos(a) * rr * 0.42, y + rng.range(-0.12, 0.12) * R,
        Math.sin(a) * rr * 0.42, rng.range(-0.22, -0.05), a + Math.PI / 2, rng.range(-0.12, 0.12));
      parts.push(g);
    }
  }
  return mergeList(parts);
}

/* --------------------------------------------------- 竹 */
function bambooGeo(rng) {
  const poles = [], leaves = [];
  const n = rng.int(6, 11);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), rr = rng.range(0, 1.5);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = rng.range(7, 12.5);
    const lean = rng.range(0.02, 0.09), la = rng.range(0, Math.PI * 2);
    const segs = 5;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const y0 = h * t0, y1 = h * t1 - 0.06;
      const ox0 = Math.cos(la) * lean * y0 * y0 * 0.09, oz0 = Math.sin(la) * lean * y0 * y0 * 0.09;
      const ox1 = Math.cos(la) * lean * y1 * y1 * 0.09, oz1 = Math.sin(la) * lean * y1 * y1 * 0.09;
      poles.push(beam(x + ox0, y0, z + oz0, x + ox1, y1, z + oz1, 0.09, 0.09, 1.4));
    }
    for (let k = 0; k < 4; k++) {
      const t = rng.range(0.55, 1.0);
      const y = h * t;
      const ox = Math.cos(la) * lean * y * y * 0.09, oz = Math.sin(la) * lean * y * y * 0.09;
      const s2 = rng.range(1.5, 2.4);
      const g = plane(s2, s2 * 0.7, 1 / s2);
      T(g, x + ox + rng.range(-0.5, 0.5), y, z + oz + rng.range(-0.5, 0.5),
        rng.range(-0.3, 0.3), rng.range(0, 3.14), rng.range(-0.2, 0.2));
      leaves.push(g);
    }
  }
  return { poles: mergeList(poles), leaves: mergeList(leaves) };
}

/* --------------------------------------------------- 灌木 */
function bushGeo(rng) {
  const parts = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.6, 1.3);
    const g = plane(s, s * 0.8, 1 / s);
    T(g, rng.range(-0.5, 0.5), s * 0.34, rng.range(-0.5, 0.5),
      rng.range(-0.2, 0.2), rng.range(0, 3.14), rng.range(-0.2, 0.2));
    parts.push(g);
  }
  return mergeList(parts);
}

/* --------------------------------------------------- 枯木 */
// 只剩骨架的死树：炎火之山与寒渊的主角
function deadwoodGeo(rng, { h = 7, r = 0.34 } = {}) {
  const parts = [];
  const segs = 3;
  let px = 0, pz = 0;
  const lean = rng.range(0.06, 0.2), la = rng.range(0, Math.PI * 2);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const y0 = h * t0, y1 = h * t1;
    const x0 = px, z0 = pz;
    px += Math.cos(la) * lean * h / segs * (1 + i);
    pz += Math.sin(la) * lean * h / segs * (1 + i);
    parts.push(beam(x0, y0, z0, px, y1, pz, r * lerp(1, 0.35, t1), r * lerp(1, 0.35, t1), 0.7));
  }
  // 断枝：短、硬、指向天
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const t = rng.range(0.35, 0.95);
    const bl = h * rng.range(0.16, 0.36);
    const x0 = px * t, y0 = h * t, z0 = pz * t;
    parts.push(beam(x0, y0, z0,
      x0 + Math.cos(a) * bl, y0 + bl * rng.range(0.5, 1.1), z0 + Math.sin(a) * bl,
      r * 0.20, r * 0.20, 0.8));
  }
  parts.push(T(cyl(r * 1.1, r * 1.8, 0.6, 7, 0.6), 0, 0.22, 0));
  return mergeList(parts);
}

/* --------------------------------------------------- 晶簇 */
function crystalGeo(rng) {
  const parts = [];
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.9, 3.0);
    const r = rng.range(0.14, 0.36);
    const g = cone(r, h, 5, 0.8);
    T(g, rng.range(-0.7, 0.7), h * 0.46, rng.range(-0.7, 0.7),
      rng.range(-0.30, 0.30), rng.range(0, 3.14), rng.range(-0.30, 0.30));
    parts.push(g);
  }
  return mergeList(parts);
}

/* ============================================================ */
export class Vegetation {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.L = LEVEL;
    this.flora = LEVEL.flora;
    this.pal = PALETTES[LEVEL.flora.palette] || PALETTES.green;
    this.M = getMaterials();
    this.group = new THREE.Group();
    scene.add(this.group);

    const leafBase = this.M.leaf;
    const mk = (tex, stiff) => {
      const m = leafBase.clone();
      m.map = colorOf(tex, 1);
      m.userData = {};
      const f = makeFoliageMaterial(m, stiff);
      f.side = THREE.DoubleSide;
      return f;
    };
    this.leafMats = this.pal.leaves.map(t => mk(t, 1.0));
    this.pineMat = mk(this.pal.pine, 0.7);
    this.bambooLeafMat = mk(this.pal.leaves[1], 1.5);
    this.grassMat = mk(this.pal.grass, 2.4);

    const cr = CRYSTAL[LEVEL.flora.palette] || CRYSTAL.green;
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: cr.color,
      emissive: new THREE.Color(cr.emissive),
      emissiveIntensity: 0.85,
      roughness: cr.rough,
      metalness: 0.12,
      transparent: true,
      opacity: 0.92,
    });
    this.crystalMat.userData = {};
    toonify(this.crystalMat, 0.30);

    this._generate();
  }

  // 一块地能不能长东西 —— 水里、路上、屋里、机关上都不行
  _ok(x, z, opts = {}) {
    const { minPath = 4.5, minRiver = 3.0, pad = 2.5, minY = 0.5 } = opts;
    if (distToAnyPath(x, z) < minPath) return false;
    if (distToRiver(x, z) < minRiver) return false;
    if (inFootprint(x, z, pad)) return false;
    if (Math.hypot(x - HEART.x, z - HEART.z) < 9) return false;
    // 水面以下的树会从半透明的水里透出来
    if (this.terrain.surfaceY(x, z) < WATER_Y + minY) return false;
    return true;
  }

  _scatter(count, rng, filter, opts = {}) {
    const { rMin = 8, rMax = 300, tries = 26 } = opts;
    const out = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let t = 0; t < tries && !placed; t++) {
        const a = rng.range(0, Math.PI * 2);
        const r = lerp(rMin, rMax, Math.pow(rng.next(), 0.62));
        const x = VALLEY_C.x + Math.cos(a) * r;
        const z = VALLEY_C.z + Math.sin(a) * r;
        // 摆在「画出来的那个面」上，不是解析高程 —— 远山的三角形能跨好几米
        const y = this.terrain.surfaceY(x, z);
        const slope = this.terrain.slopeAt(x, z, 2.2);
        if (filter(x, y, z, slope, r)) { out.push([x, y, z, r]); placed = true; }
      }
    }
    return out;
  }

  _instance(geo, mat, list, rng, scaleRange, castShadow = true) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
      p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      const [x, y, z] = list[i];
      const sc = rng.range(scaleRange[0], scaleRange[1]);
      e.set(rng.range(-0.035, 0.035), rng.range(0, Math.PI * 2), rng.range(-0.035, 0.035));
      q.setFromEuler(e);
      p.set(x, y - 0.12, z);
      s.set(sc * rng.range(0.9, 1.1), sc, sc * rng.range(0.9, 1.1));
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    }
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    return im;
  }

  _generate() {
    const T2 = this.terrain;
    const F = this.flora;
    const rng = new Rng(20240815 + this.L.index * 4441);
    // 只在内圈网格范围内种树：外圈三角形几十米宽，树会浮在山脊上
    const FAR = Math.min(300, (T2.innerR || 320) - 20);

    // ---------- 阔叶大树
    if (F.broadleaf > 0) {
      const spots = this._scatter(F.broadleaf, rng, (x, y, z, slope) =>
        slope < 0.85 && y < 46 && this._ok(x, z, { minPath: 5.5, pad: 4 }),
        { rMin: 16, rMax: Math.min(165, FAR) });
      for (let v = 0; v < 3; v++) {
        const r2 = new Rng(1000 + v * 77);
        const { geo, topY } = trunkGeo(r2, { h: r2.range(8, 12), r: r2.range(0.45, 0.66), branches: 5, lean: 0.09 });
        const crown = crownGeo(r2, { R: r2.range(3.9, 5.2), blobs: 26, quads: 2 });
        const cg = crown.clone();
        cg.translate(0, topY * 0.86, 0);
        const sub = spots.filter((_, i) => i % 3 === v);
        this._instance(geo, this.M[this.pal.trunk], sub, new Rng(500 + v), [0.82, 1.35]);
        this._instance(cg, this.leafMats[v], sub, new Rng(500 + v), [0.82, 1.35]);
      }
    }

    // ---------- 中型树
    if (F.midTree > 0) {
      const spots = this._scatter(F.midTree, rng, (x, y, z, slope) =>
        slope < 1.15 && y < 60 && this._ok(x, z, { minPath: 4.2, pad: 3 }),
        { rMin: 22, rMax: Math.min(260, FAR) });
      for (let v = 0; v < 2; v++) {
        const r2 = new Rng(3000 + v * 31);
        const { geo, topY } = trunkGeo(r2, { h: r2.range(5, 7.5), r: 0.30, branches: 3, lean: 0.12 });
        const crown = crownGeo(r2, { R: 3.0, blobs: 16, quads: 2 });
        crown.translate(0, topY * 0.84, 0);
        const sub = spots.filter((_, i) => i % 2 === v);
        this._instance(geo, this.M[this.pal.trunk], sub, new Rng(700 + v), [0.8, 1.3]);
        this._instance(crown, this.leafMats[(v + 1) % 3], sub, new Rng(700 + v), [0.8, 1.3]);
      }
    }

    // ---------- 松（陡坡与高处）
    if (F.pine > 0) {
      const spots = this._scatter(F.pine, rng, (x, y, z, slope) =>
        (slope > 0.4 || y > T2.plazaY + 26) && y < 190 &&
        this._ok(x, z, { minPath: 5, minRiver: 6, pad: 3, minY: 0.8 }),
        { rMin: 40, rMax: FAR });
      for (let v = 0; v < 2; v++) {
        const r2 = new Rng(5000 + v * 53);
        const { trunk } = pineGeo(r2, { h: r2.range(9, 14), r: 0.4 });
        const crown = pineCrown(r2, { h: r2.range(9, 14), R: r2.range(2.3, 3.3), layers: 7 });
        const sub = spots.filter((_, i) => i % 2 === v);
        this._instance(trunk, this.M[this.pal.trunk], sub, new Rng(900 + v), [0.75, 1.5]);
        this._instance(crown, this.pineMat, sub, new Rng(900 + v), [0.75, 1.5]);
      }
    }

    // ---------- 竹丛（近水与村边）
    if (F.bamboo > 0) {
      const spots = this._scatter(F.bamboo, rng, (x, y, z, slope, r) =>
        slope < 0.6 && r < 120 && y < T2.plazaY + 26 &&
        distToRiver(x, z) < 34 && this._ok(x, z, { minPath: 5, minRiver: 6, pad: 4 }),
        { rMin: 24, rMax: 120 });
      const r2 = new Rng(7777);
      const { poles, leaves } = bambooGeo(r2);
      this._instance(poles, this.M[this.pal.bark], spots, new Rng(1200), [0.85, 1.25]);
      this._instance(leaves, this.bambooLeafMat, spots, new Rng(1200), [0.85, 1.25], false);
    }

    // ---------- 枯木
    if (F.deadwood > 0) {
      const spots = this._scatter(F.deadwood, rng, (x, y, z, slope) =>
        slope < 1.2 && this._ok(x, z, { minPath: 4.5, minRiver: 5, pad: 3 }),
        { rMin: 20, rMax: Math.min(230, FAR) });
      for (let v = 0; v < 2; v++) {
        const r2 = new Rng(6100 + v * 29);
        const g = deadwoodGeo(r2, { h: r2.range(4.5, 9.0), r: r2.range(0.26, 0.44) });
        const sub = spots.filter((_, i) => i % 2 === v);
        this._instance(g, this.M[this.pal.trunk], sub, new Rng(1500 + v), [0.75, 1.4]);
      }
    }

    // ---------- 晶簇
    if (F.crystal > 0) {
      const spots = this._scatter(F.crystal, rng, (x, y, z, slope) =>
        slope < 1.5 && this._ok(x, z, { minPath: 4.0, minRiver: 4, pad: 2.5 }),
        { rMin: 14, rMax: Math.min(200, FAR) });
      const r2 = new Rng(8200);
      const g = crystalGeo(r2);
      this._instance(g, this.crystalMat, spots, new Rng(1600), [0.6, 1.6], false);
    }

    // ---------- 灌木
    if (F.bush > 0) {
      const spots = this._scatter(F.bush, rng, (x, y, z, slope) =>
        slope < 1.4 && y < 90 && T2.plazaMask(x, z) < 0.4 &&
        this._ok(x, z, { minPath: 3.2, minRiver: 5, pad: 2, minY: 0.6 }),
        { rMin: 10, rMax: Math.min(250, FAR) });
      const r2 = new Rng(9090);
      this._instance(bushGeo(r2), this.leafMats[1], spots, new Rng(1300), [0.7, 1.5], false);
    }

    // ---------- 草丛（近景）
    if (F.grass > 0) {
      const spots = this._scatter(F.grass, rng, (x, y, z, slope) =>
        slope < 1.0 && y < T2.plazaY + 40 && T2.plazaMask(x, z) < 0.35 &&
        this._ok(x, z, { minPath: 2.6, minRiver: 4, pad: 2, minY: 0.4 }),
        { rMin: 10, rMax: 150, tries: 8 });
      const g = plane(1.5, 1.0, 0.7);
      g.translate(0, 0.5, 0);
      const g2 = plane(1.5, 1.0, 0.7);
      g2.translate(0, 0.5, 0);
      g2.rotateY(Math.PI / 2);
      const im = this._instance(mergeList([g, g2]), this.grassMat, spots, new Rng(1400), [0.55, 1.15], false);
      if (im) im.receiveShadow = true;
    }
  }

  update(dt, t) {
    windUniforms.uTime.value = t;
    windUniforms.uWind.value = this.L.climate.wind || 1.0;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of [...this.leafMats, this.pineMat, this.bambooLeafMat, this.grassMat, this.crystalMat]) {
      m.dispose();
    }
    this.scene.remove(this.group);
  }
}

export { windUniforms };
