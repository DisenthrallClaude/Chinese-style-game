// 草木 —— 实例化的林木、灌丛、竹与风动的叶
import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { box, cyl, cone, sphere, plane, T, beam } from './geo.js';
import { getMaterials } from './materials.js';
import { colorOf } from '../core/textures.js';
import { distToAnyPath, distToRiver, inFootprint, VALLEY_C, HEART } from './layout.js';

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1.0 } };

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
  // 主枝
  for (let i = 0; i < branches; i++) {
    const a = rng.range(0, Math.PI * 2);
    const t = rng.range(0.42, 0.86);
    const bl = h * rng.range(0.22, 0.42);
    const x0 = px * t, y0 = h * t, z0 = pz * t;
    const x1 = x0 + Math.cos(a) * bl, y1 = y0 + bl * rng.range(0.45, 0.9), z1 = z0 + Math.sin(a) * bl;
    parts.push(beam(x0, y0, z0, x1, y1, z1, r * 0.26, r * 0.26, 0.7));
  }
  // 根盘
  parts.push(T(cyl(r * 1.05, r * 1.7, 0.7, 8, 0.6), 0, 0.25, 0));
  return { geo: mergeList(parts), topX: px, topY: h, topZ: pz };
}

/* --------------------------------------------------- 叶团 */
function crownGeo(rng, { R = 3.6, blobs = 7, quads = 3 } = {}) {
  const parts = [];
  for (let b = 0; b < blobs; b++) {
    const a = rng.range(0, Math.PI * 2);
    // 外圈密、中心疏，整体压成扁穹顶，比正球更像阔叶树
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
  const parts = [];
  parts.push(T(cyl(r * 0.24, r, h, 7, 0.6), 0, h / 2, 0));
  return { trunk: mergeList(parts), h };
}
function pineCrown(rng, { h = 11, R = 2.6, layers = 7 } = {}) {
  const parts = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = h * (0.24 + t * 0.74);
    const rr = R * (1 - t * 0.82) * rng.range(0.88, 1.14);
    // 每层围一圈小片，松针的层叠感靠这个
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
  const poles = [];
  const leaves = [];
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
      T(g, x + ox + rng.range(-0.5, 0.5), y, z + oz + rng.range(-0.5, 0.5), rng.range(-0.3, 0.3), rng.range(0, 3.14), rng.range(-0.2, 0.2));
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
    T(g, rng.range(-0.5, 0.5), s * 0.34, rng.range(-0.5, 0.5), rng.range(-0.2, 0.2), rng.range(0, 3.14), rng.range(-0.2, 0.2));
    parts.push(g);
  }
  return mergeList(parts);
}

/* ============================================================ */
export class Vegetation {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.M = getMaterials();
    this.group = new THREE.Group();
    scene.add(this.group);

    this.leafMats = [
      makeFoliageMaterial(this.M.leaf, 1.0),
      makeFoliageMaterial(this.M.leafB, 1.0),
      makeFoliageMaterial(this.M.leafC, 1.0),
    ];
    this.pineMat = makeFoliageMaterial(this.M.leafPine, 0.7);
    this.bambooLeafMat = makeFoliageMaterial(this.M.leafB, 1.5);
    this.grassMat = makeFoliageMaterial(this.M.grass, 2.4);
    for (const m of [...this.leafMats, this.pineMat, this.bambooLeafMat, this.grassMat]) {
      m.side = THREE.DoubleSide;
    }

    this._generate();
  }

  _ok(x, z, opts = {}) {
    const { minPath = 4.5, minRiver = 3.0, pad = 2.5 } = opts;
    if (distToAnyPath(x, z) < minPath) return false;
    if (distToRiver(x, z) < minRiver) return false;
    if (inFootprint(x, z, pad)) return false;
    if (Math.hypot(x - HEART.x, z - HEART.z) < 9) return false;
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
        const y = this.terrain.heightAt(x, z);
        const slope = this.terrain.slopeAt(x, z, 2.2);
        if (filter(x, y, z, slope, r)) { out.push([x, y, z, r]); placed = true; }
      }
    }
    return out;
  }

  _instance(geo, mat, list, rng, scaleRange, castShadow = true) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
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
    const rng = new Rng(20240815);

    // ---------- 阔叶大树（谷内与坡地）
    const bigSpots = this._scatter(120, rng, (x, y, z, slope, r) =>
      slope < 0.85 && y < 46 && y > -1 && this._ok(x, z, { minPath: 5.5, pad: 4 }),
      { rMin: 16, rMax: 165 });
    for (let v = 0; v < 3; v++) {
      const r2 = new Rng(1000 + v * 77);
      const { geo, topY } = trunkGeo(r2, { h: r2.range(8, 12), r: r2.range(0.45, 0.66), branches: 5, lean: 0.09 });
      const crown = crownGeo(r2, { R: r2.range(3.9, 5.2), blobs: 26, quads: 2 });
      const cg = crown.clone();
      cg.translate(0, topY * 0.86, 0);
      const sub = bigSpots.filter((_, i) => i % 3 === v);
      const rr = new Rng(500 + v);
      this._instance(geo, this.M.woodDark, sub, rr, [0.82, 1.35]);
      const rr2 = new Rng(500 + v);
      this._instance(cg, this.leafMats[v], sub, rr2, [0.82, 1.35]);
    }

    // ---------- 中型树
    const midSpots = this._scatter(220, rng, (x, y, z, slope, r) =>
      slope < 1.15 && y < 60 && this._ok(x, z, { minPath: 4.2, pad: 3 }),
      { rMin: 22, rMax: 260 });
    for (let v = 0; v < 2; v++) {
      const r2 = new Rng(3000 + v * 31);
      const { geo, topY } = trunkGeo(r2, { h: r2.range(5, 7.5), r: 0.30, branches: 3, lean: 0.12 });
      const crown = crownGeo(r2, { R: 3.0, blobs: 16, quads: 2 });
      crown.translate(0, topY * 0.84, 0);
      const sub = midSpots.filter((_, i) => i % 2 === v);
      this._instance(geo, this.M.woodDark, sub, new Rng(700 + v), [0.8, 1.3]);
      this._instance(crown, this.leafMats[(v + 1) % 3], sub, new Rng(700 + v), [0.8, 1.3]);
    }

    // ---------- 松（陡坡与高处）
    const pineSpots = this._scatter(420, rng, (x, y, z, slope, r) =>
      (slope > 0.4 || y > 26) && y < 190 && distToAnyPath(x, z) > 5 && !inFootprint(x, z, 3),
      { rMin: 40, rMax: 420 });
    for (let v = 0; v < 2; v++) {
      const r2 = new Rng(5000 + v * 53);
      const { trunk, h } = pineGeo(r2, { h: r2.range(9, 14), r: 0.4 });
      const crown = pineCrown(r2, { h: r2.range(9, 14), R: r2.range(2.3, 3.3), layers: 7 });
      const sub = pineSpots.filter((_, i) => i % 2 === v);
      this._instance(trunk, this.M.woodDark, sub, new Rng(900 + v), [0.75, 1.5]);
      this._instance(crown, this.pineMat, sub, new Rng(900 + v), [0.75, 1.5]);
    }

    // ---------- 竹丛（近水与村边）
    const bambooSpots = this._scatter(46, rng, (x, y, z, slope, r) =>
      slope < 0.6 && r < 120 && y > -1 && y < 26 &&
      distToAnyPath(x, z) > 5 && distToRiver(x, z) > 5 && distToRiver(x, z) < 34 && !inFootprint(x, z, 4),
      { rMin: 24, rMax: 120 });
    {
      const r2 = new Rng(7777);
      const { poles, leaves } = bambooGeo(r2);
      this._instance(poles, this.M.wood, bambooSpots, new Rng(1200), [0.85, 1.25]);
      this._instance(leaves, this.bambooLeafMat, bambooSpots, new Rng(1200), [0.85, 1.25], false);
    }

    // ---------- 灌木
    const bushSpots = this._scatter(520, rng, (x, y, z, slope, r) =>
      slope < 1.4 && y < 90 && distToAnyPath(x, z) > 3.2 && !inFootprint(x, z, 2) &&
      this.terrain.plazaMask(x, z) < 0.4,
      { rMin: 10, rMax: 250 });
    {
      const r2 = new Rng(9090);
      const bg = bushGeo(r2);
      this._instance(bg, this.leafMats[1], bushSpots, new Rng(1300), [0.7, 1.5], false);
    }

    // ---------- 草丛（近景）
    const grassSpots = this._scatter(1700, rng, (x, y, z, slope, r) =>
      slope < 1.0 && y > -1.4 && y < 40 && distToAnyPath(x, z) > 2.6 &&
      this.terrain.plazaMask(x, z) < 0.35 && !inFootprint(x, z, 2),
      { rMin: 10, rMax: 150, tries: 8 });
    {
      const g = plane(1.5, 1.0, 0.7);
      g.translate(0, 0.5, 0);
      const g2 = plane(1.5, 1.0, 0.7);
      g2.translate(0, 0.5, 0);
      g2.rotateY(Math.PI / 2);
      const merged = mergeList([g, g2]);
      const im = this._instance(merged, this.grassMat, grassSpots, new Rng(1400), [0.55, 1.15], false);
      if (im) im.receiveShadow = true;
    }
  }

  update(dt, t) {
    windUniforms.uTime.value = t;
  }
}

export { windUniforms };
