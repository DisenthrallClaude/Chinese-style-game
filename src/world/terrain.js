// 山川 —— 谷地高程场、层叠梯田、环谷喀斯特峰林与青石广场
import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { buildTexture, colorOf, normalOf, roughnessOf } from '../core/textures.js';
import { toonify } from '../core/toon.js';
import {
  VALLEY_C, WATER_Y, PLAZA, distToRiver, distToAnyPath, terraceHeight,
} from './layout.js';

const n1 = new Noise(4242);
const n2 = new Noise(9911);

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.pads = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._cache = new Map();
  }

  // ---- 未经平整的原始高程 --------------------------------------------
  baseHeight(x, z) {
    const dxc = x - VALLEY_C.x, dzc = z - VALLEY_C.z;

    // 谷底起伏
    let h = n1.fbm2(x * 0.0125, z * 0.0125, 4) * 1.9
          + n1.fbm2(x * 0.052, z * 0.052, 3) * 0.42
          + n1.fbm2(x * 0.0068 + 30, z * 0.0068, 3) * 4.2;

    // 后山梯田
    h += terraceHeight(z);

    // 环谷山体（椭圆距离）
    const ex = dxc / 106, ez = dzc / 94;
    const er = Math.sqrt(ex * ex + ez * ez);
    let rimT = smoothstep(1.02, 1.72, er);
    if (rimT > 0) {
      const ridge = n2.ridge2(x * 0.0072, z * 0.0072, 5, 2.1, 0.52);
      const ridge2 = n2.ridge2(x * 0.019 + 40, z * 0.019, 4, 2.2, 0.5);
      // 喀斯特：陡立的峰体
      const peak = Math.pow(clamp(ridge, 0, 1), 0.62) * 52 + Math.pow(clamp(ridge2, 0, 1), 1.6) * 18;
      let rim = rimT * (16 + peak);
      // 溪流出谷处切出峡口
      const dr = distToRiver(x, z);
      const gorge = 1 - smoothstep(5, 30, dr);
      rim *= (1 - gorge * 0.86);
      h += rim;
    }

    // 更远处的峰林 —— 向北（-z）开一道谷口，让层叠远山与天空露出来
    const rr = Math.hypot(dxc, dzc);
    if (rr > 130) {
      // 与 -z 轴的夹角：谷口方向压低山体
      const ang = Math.atan2(dxc, -dzc);
      const notch = 1 - 0.80 * Math.exp(-Math.pow(ang / 0.46, 2))
                      - 0.30 * Math.exp(-Math.pow(ang / 1.05, 2));
      const far = smoothstep(130, 400, rr);
      const rg = n2.ridge2(x * 0.0031 + 90, z * 0.0031, 6, 2.05, 0.5);
      const rg2 = n2.ridge2(x * 0.0088 + 300, z * 0.0088, 4, 2.2, 0.5);
      const strata = Math.sin(rg * 30) * 0.022;
      const peaks = Math.pow(clamp(rg, 0, 1), 0.5) * 330 + Math.pow(clamp(rg2, 0, 1), 1.7) * 90 + strata * 220;
      h += far * peaks * Math.max(0.12, notch);
      // 天际线上最高的一层
      h += smoothstep(330, 820, rr) * Math.pow(clamp(n2.ridge2(x * 0.0016, z * 0.0016, 5), 0, 1), 0.62) * 460
           * Math.max(0.18, 1 - 0.62 * Math.exp(-Math.pow(ang / 0.62, 2)));
    }

    // 谷口走廊：向北压低地形，露出层叠远山与天空；两侧留下高耸峰体
    if (rr > 120) {
      const ang = Math.atan2(dxc, -dzc);
      const corridor = Math.exp(-Math.pow(ang / 0.40, 2));
      if (corridor > 0.015) {
        const spire = Math.pow(clamp(n2.simplex2(x * 0.0021 + 11, z * 0.0021 - 7), 0, 1), 2.6);
        const cap = 26 + rr * 0.050 + spire * 340 * smoothstep(430, 720, rr);
        const capped = Math.min(h, cap);
        h = lerp(h, capped, corridor * smoothstep(120, 190, rr));
      }
    }

    // 河床下切
    const dRiver = distToRiver(x, z);
    const carve = (1 - smoothstep(3.2, 12.0, dRiver)) * 4.4;
    h -= carve;
    // 河岸缓坡
    h -= (1 - smoothstep(10, 22, dRiver)) * 0.5;

    return h;
  }

  registerPad(x, z, rx, rz, rot, y, feather = 3.5) {
    this.pads.push({ x, z, rx, rz, rot, y, feather });
  }

  padInfluence(x, z) {
    let bestW = 0, bestY = 0;
    for (const p of this.pads) {
      const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
      const dx = x - p.x, dz = z - p.z;
      const lx = Math.abs(dx * c - dz * s), lz = Math.abs(dx * s + dz * c);
      const ox = lx - p.rx, oz = lz - p.rz;
      const d = Math.max(ox, oz);
      const w = 1 - smoothstep(0, p.feather, Math.max(0, d));
      if (w > bestW) { bestW = w; bestY = p.y; }
    }
    return [bestW, bestY];
  }

  // ---- 最终高程（含平台与兽道）--------------------------------------
  heightAt(x, z) {
    let h = this.baseHeight(x, z);

    // 广场平整
    const pm = this.plazaMask(x, z);
    if (pm > 0) h = lerp(h, 0, pm);

    // 建筑台基
    const [pw, py] = this.padInfluence(x, z);
    if (pw > 0) h = lerp(h, py, pw);

    // 兽道踏出的浅沟
    const dp = distToAnyPath(x, z);
    if (dp < 7) {
      const t = 1 - smoothstep(0, 5.2, dp);
      h -= t * 0.36;
    }
    return h;
  }

  plazaMask(x, z) {
    const cx = (PLAZA.x0 + PLAZA.x1) / 2, cz = (PLAZA.z0 + PLAZA.z1) / 2;
    const hx = (PLAZA.x1 - PLAZA.x0) / 2, hz = (PLAZA.z1 - PLAZA.z0) / 2;
    const wob = n1.fbm2(x * 0.045, z * 0.045, 3) * 5.0;
    const dx = Math.abs(x - cx) - hx + wob;
    const dz = Math.abs(z - cz) - hz + wob;
    const d = Math.max(dx, dz);
    return 1 - smoothstep(-1.5, 9.0, d);
  }

  // 预烘一张高度查询表，供每帧的怪物落地与光标求交使用
  buildLUT(half = 168, step = 1.5) {
    const n = Math.ceil((half * 2) / step) + 1;
    const arr = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = -half + j * step;
      for (let i = 0; i < n; i++) {
        arr[j * n + i] = this.heightAt(-half + i * step, z);
      }
    }
    this._lut = { arr, n, half, step };
    return this;
  }

  // 双线性采样；出表则回落到解析求值
  heightFast(x, z) {
    const L = this._lut;
    if (!L) return this.heightAt(x, z);
    const fx = (x + L.half) / L.step, fz = (z + L.half) / L.step;
    if (fx < 0 || fz < 0 || fx >= L.n - 1 || fz >= L.n - 1) return this.heightAt(x, z);
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const a = L.arr[j * L.n + i], b = L.arr[j * L.n + i + 1];
    const c = L.arr[(j + 1) * L.n + i], d = L.arr[(j + 1) * L.n + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  normalAt(x, z, eps = 0.9) {
    const hL = this.heightAt(x - eps, z), hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps), hU = this.heightAt(x, z + eps);
    const n = new THREE.Vector3(hL - hR, 2 * eps, hD - hU);
    return n.normalize();
  }

  slopeAt(x, z, eps = 1.2) {
    const hL = this.heightAt(x - eps, z), hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps), hU = this.heightAt(x, z + eps);
    return Math.hypot(hR - hL, hU - hD) / (2 * eps);
  }

  // ---- 网格构建 ------------------------------------------------------
  _radialGeometry(r0, r1, rings, seg, power) {
    const verts = (rings + 1) * (seg + 1);
    const pos = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx = [];
    let vi = 0;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const r = r0 + (r1 - r0) * Math.pow(t, power);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const x = VALLEY_C.x + Math.cos(a) * r;
        const z = VALLEY_C.z + Math.sin(a) * r;
        const y = this.heightAt(x, z);
        pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
        uv[vi * 2] = x * 0.02; uv[vi * 2 + 1] = z * 0.02;
        const c = this._surfaceWeights(x, z, y);
        col[vi * 3] = c[0]; col[vi * 3 + 1] = c[1]; col[vi * 3 + 2] = c[2];
        vi++;
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j;
        const b = a + seg + 1;
        // 环向绕序与直角网格相反，顺序必须反过来才是正面朝上
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // 表层权重：r=草 g=土 b=岩
  _surfaceWeights(x, z, y) {
    const slope = this.slopeAt(x, z, 1.6);
    const dp = distToAnyPath(x, z);
    const dr = distToRiver(x, z);

    let rock = smoothstep(0.52, 1.05, slope) + smoothstep(26, 56, y) * 1.0;
    rock = clamp(rock, 0, 1);

    // 兽道踩秃的土路
    let soil = (1 - smoothstep(1.6, 5.4, dp)) * 0.95;
    // 河滩
    soil = Math.max(soil, (1 - smoothstep(2.5, 9.0, dr)) * 0.8);
    // 随机裸土斑块
    soil = Math.max(soil, smoothstep(0.42, 0.78, n1.fbm2(x * 0.03, z * 0.03, 4) * 0.5 + 0.5) * 0.55);
    soil = clamp(soil * (1 - rock * 0.7), 0, 1);

    const grass = clamp(1 - rock - soil, 0, 1);
    const s = grass + soil + rock || 1;
    return [grass / s, soil / s, rock / s];
  }

  _material() {
    const tGrass = colorOf('grassGround', 1);
    const tSoil = colorOf('soil', 1);
    const tRock = colorOf('rock', 1);
    const tMacro = colorOf('noiseRGBA', 1);
    [tGrass, tSoil, tRock, tMacro].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      color: 0xffffff,
      dithering: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tGrass = { value: tGrass };
      shader.uniforms.tSoil = { value: tSoil };
      shader.uniforms.tRock = { value: tRock };
      shader.uniforms.tMacro = { value: tMacro };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldP;
          uniform sampler2D tGrass, tSoil, tRock, tMacro;`)
        .replace('#include <color_fragment>', `
          vec3 w = normalize(max(vColor.rgb, vec3(0.0001)));
          w = vColor.rgb / max(vColor.r + vColor.g + vColor.b, 0.0001);
          vec2 wuv = vWorldP.xz;
          vec3 cg = texture2D(tGrass, wuv * 0.085).rgb;
          // 第二层旋转 90° 再叠，草纹交织，不会拉出一道道长条
          vec3 cg2 = texture2D(tGrass, vec2(wuv.y, -wuv.x) * 0.026).rgb;
          cg = mix(cg, cg2, 0.30);
          vec3 cs = texture2D(tSoil, wuv * 0.11).rgb;
          vec3 cr = texture2D(tRock, wuv * 0.042).rgb;
          vec3 cr2 = texture2D(tRock, wuv * 0.0092).rgb;
          cr = mix(cr, cr2, 0.5);
          vec3 blended = cg * w.r + cs * w.g + cr * w.b;
          // 大尺度色彩变化，打散平铺感
          vec3 macro = texture2D(tMacro, wuv * 0.0043).rgb;
          blended *= mix(vec3(0.78), vec3(1.22), macro.r);
          blended *= mix(vec3(0.94, 1.0, 0.92), vec3(1.12, 1.02, 0.84), macro.g);
          diffuseColor.rgb *= blended;
        `);
      this._terrainShader = shader;
    };
    // 地面卡通量给得比建筑轻得多，只把坡面的明暗稍稍收一收
    toonify(mat, 0.15);
    return mat;
  }

  build() {
    const matA = this._material();
    const inner = this._radialGeometry(0.6, 148, 118, 256, 1.42);
    this.mesh = new THREE.Mesh(inner, matA);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.group.add(this.mesh);

    const outer = this._radialGeometry(148, 940, 120, 224, 1.75);
    const matB = this._material();
    matB.roughness = 1.0;
    this.outerMesh = new THREE.Mesh(outer, matB);
    this.outerMesh.receiveShadow = false;
    this.outerMesh.castShadow = false;
    this.group.add(this.outerMesh);

    this._buildPlaza();
    this.buildLUT();
    return this;
  }

  // ---- 青石广场 ------------------------------------------------------
  _buildPlaza() {
    const seg = 132;
    const cx = (PLAZA.x0 + PLAZA.x1) / 2, cz = (PLAZA.z0 + PLAZA.z1) / 2;
    const hx = (PLAZA.x1 - PLAZA.x0) / 2, hz = (PLAZA.z1 - PLAZA.z0) / 2;
    const pos = [], uv = [], idx = [];
    const gw = seg, gh = seg;
    for (let i = 0; i <= gh; i++) {
      for (let j = 0; j <= gw; j++) {
        const u = j / gw, v = i / gh;
        const x = cx + (u - 0.5) * hx * 2.16;
        const z = cz + (v - 0.5) * hz * 2.16;
        pos.push(x, this.heightAt(x, z) + 0.045, z);
        uv.push(x * 0.105, z * 0.105);
      }
    }
    for (let i = 0; i < gh; i++) {
      for (let j = 0; j < gw; j++) {
        const a = i * (gw + 1) + j, b = a + gw + 1;
        // 只保留广场轮廓内的面
        const px = pos[a * 3], pz = pos[a * 3 + 2];
        if (this.plazaMask(px, pz) < 0.55) continue;
        if (distToRiver(px, pz) < 6.6) continue;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    const map = colorOf('flagstone', 1);
    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap: normalOf('flagstone', 1.5, 1),
      roughnessMap: roughnessOf('flagstone', 0.62, 0.98, false, 1),
      roughness: 1.0,
      metalness: 0.0,
      normalScale: new THREE.Vector2(0.85, 0.85),
    });
    this.plazaMesh = new THREE.Mesh(g, mat);
    this.plazaMesh.receiveShadow = true;
    this.group.add(this.plazaMesh);
  }
}
