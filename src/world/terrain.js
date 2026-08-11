// 山川 —— 高程场引擎。地貌本身写在 levels.js 里，这里只负责把它变成网格。
import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { buildTexture, colorOf, normalOf, roughnessOf } from '../core/textures.js';
import { toonify } from '../core/toon.js';
import {
  LEVEL, VALLEY_C, WATER_Y, PLAZA, distToRiver, distToAnyPath, inFootprint,
} from './layout.js';

const n1 = new Noise(4242);
const n2 = new Noise(9911);
const n3 = new Noise(1733);

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.pads = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.level = LEVEL;
    this.geo = LEVEL.geo;

    // 递给关卡高程函数的工具箱
    this.H = {
      n1, n2, n3, clamp, lerp, smoothstep,
      dRiver: distToRiver,
      dPath: distToAnyPath,
      C: VALLEY_C,
    };
  }

  // ---- 未经平整的原始高程 --------------------------------------------
  baseHeight(x, z) {
    return this.geo.height(x, z, this.H);
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

  // ---- 找平之前的地面：兽道浅沟 + 广场，但不含建筑台基 ----------------
  // 台基的高度必须从这里取。若直接用 baseHeight，广场里的宅基就会比找平后的
  // 广场面高低几米，凭空出现深坑与高台。
  groundY(x, z) {
    let h = this.baseHeight(x, z);
    // 兽道踏出的浅沟 —— 必须排在找平之前，否则会把台基边缘又挖掉一圈，
    // 沿着压顶石板露出 0.3~0.4 米的缝
    const dp = distToAnyPath(x, z);
    if (dp < 7) h -= (1 - smoothstep(0, 5.2, dp)) * 0.36;
    // 广场平整
    const pm = this.plazaMask(x, z);
    if (pm > 0) h = lerp(h, this.plazaY, pm);
    return h;
  }

  // ---- 最终高程（含建筑台基）----------------------------------------
  heightAt(x, z) {
    let h = this.groundY(x, z);
    const [pw, py] = this.padInfluence(x, z);
    if (pw > 0) h = lerp(h, py, pw);
    return h;
  }

  // 广场找平的目标高度：由关卡指定，村寨的一切摆件都以它为基准面
  get plazaY() { return this.geo.plazaY || 0; }

  plazaMask(x, z) {
    const cx = (PLAZA.x0 + PLAZA.x1) / 2, cz = (PLAZA.z0 + PLAZA.z1) / 2;
    const hx = (PLAZA.x1 - PLAZA.x0) / 2, hz = (PLAZA.z1 - PLAZA.z0) / 2;
    const wob = n1.fbm2(x * 0.045, z * 0.045, 3) * 5.0;
    const dx = Math.abs(x - cx) - hx + wob;
    const dz = Math.abs(z - cz) - hz + wob;
    return 1 - smoothstep(-1.5, 9.0, Math.max(dx, dz));
  }

  // 预烘一张高度查询表，供每帧的怪物落地与光标求交使用
  buildLUT(half = 180, step = 1.4) {
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
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  }

  slopeAt(x, z, eps = 1.2) {
    const hL = this.heightAt(x - eps, z), hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps), hU = this.heightAt(x, z + eps);
    return Math.hypot(hR - hL, hU - hD) / (2 * eps);
  }

  // 一块地是否平整到可以摆东西 —— 道具、植被、机关都用它，避免半悬在坎上
  isFlat(x, z, radius = 1.6, tol = 0.55) {
    const y = this.surfaceY(x, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = this.surfaceY(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
      if (Math.abs(d - y) > tol) return false;
    }
    return true;
  }

  // 一块地的最大高差，用于判断塔基／道具会不会一角翘起来
  reliefAt(x, z, radius = 2.2) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = this.surfaceY(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const c = this.surfaceY(x, z);
    return Math.max(hi, c) - Math.min(lo, c);
  }

  /* ------------------------------------------------------------------
     渲染面的真实高度
     ------------------------------------------------------------------
     地形显示的是径向网格，不是解析高程场。山脊上一个三角形能跨好几米，
     解析值与实际画出来的面能差出好几米 —— 远山上的树就是这么浮起来的。
     这里按与建网格完全一致的顶点顺序做三角形插值，取到的就是眼睛看到的面。
  */
  surfaceY(x, z) {
    const g = this._pickGrid(x, z);
    if (!g) return this.heightAt(x, z);
    const dx = x - VALLEY_C.x, dz = z - VALLEY_C.z;
    const r = Math.hypot(dx, dz);
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;

    // 反解环号：r = r0 + (r1-r0) * t^power
    const t = Math.pow((r - g.r0) / (g.r1 - g.r0), 1 / g.power);
    const fi = t * g.rings;
    const fj = (ang / (Math.PI * 2)) * g.seg;
    let i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0) i = 0; if (i > g.rings - 1) i = g.rings - 1;
    if (j < 0) j = 0; if (j > g.seg - 1) j = g.seg - 1;
    const u = fi - i, v = fj - j;

    const row = g.seg + 1;
    const yA = g.y[i * row + j];             // (i,   j)
    const yB = g.y[i * row + j + 1];         // (i,   j+1)
    const yC = g.y[(i + 1) * row + j];       // (i+1, j)
    const yD = g.y[(i + 1) * row + j + 1];   // (i+1, j+1)

    // 建索引时的两个三角形：(A,B,C) 与 (B,D,C)，对角线是 u+v=1
    if (u + v <= 1) return yA + (yB - yA) * v + (yC - yA) * u;
    const uu = 1 - u, vv = 1 - v;
    return yD + (yC - yD) * vv + (yB - yD) * uu;
  }

  _pickGrid(x, z) {
    const dx = x - VALLEY_C.x, dz = z - VALLEY_C.z;
    const r = Math.hypot(dx, dz);
    const a = this._gridInner, b = this._gridOuter;
    if (a && r >= a.r0 && r <= a.r1) return a;
    if (b && r >= b.r0 && r <= b.r1) return b;
    return null;
  }

  // ---- 网格构建 ------------------------------------------------------
  _radialGeometry(r0, r1, rings, seg, power, store) {
    const row = seg + 1;
    const verts = (rings + 1) * row;
    const pos = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx = [];

    // 第一遍：只求高程。坡度留到第二遍用邻格差分算 ——
    // 逐点再调四次 heightAt 会让整关的构建慢五倍。
    let vi = 0;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const r = r0 + (r1 - r0) * Math.pow(t, power);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const x = VALLEY_C.x + Math.cos(a) * r;
        const z = VALLEY_C.z + Math.sin(a) * r;
        pos[vi * 3] = x; pos[vi * 3 + 1] = this.heightAt(x, z); pos[vi * 3 + 2] = z;
        uv[vi * 2] = x * 0.02; uv[vi * 2 + 1] = z * 0.02;
        vi++;
      }
    }

    // 第二遍：邻格差分求坡度，再问关卡要表层配比
    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= seg; j++) {
        const k = i * row + j;
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        const kIn = Math.max(0, i - 1) * row + j;
        const kOut = Math.min(rings, i + 1) * row + j;
        const kA = i * row + (j === 0 ? seg - 1 : j - 1);
        const kB = i * row + (j === seg ? 1 : j + 1);
        const dRad = Math.hypot(pos[kOut * 3] - pos[kIn * 3], pos[kOut * 3 + 2] - pos[kIn * 3 + 2]) || 1;
        const dTan = Math.hypot(pos[kB * 3] - pos[kA * 3], pos[kB * 3 + 2] - pos[kA * 3 + 2]) || 1;
        const gRad = (pos[kOut * 3 + 1] - pos[kIn * 3 + 1]) / dRad;
        const gTan = (pos[kB * 3 + 1] - pos[kA * 3 + 1]) / dTan;
        const slope = Math.hypot(gRad, gTan);
        const w = this.geo.surface(x, z, y, slope, this.H);
        const sum = w[0] + w[1] + w[2] || 1;
        col[k * 3] = w[0] / sum; col[k * 3 + 1] = w[1] / sum; col[k * 3 + 2] = w[2] / sum;
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

    // 留一份高度表，surfaceY 靠它还原「画出来的那个面」
    if (store) {
      const ys = new Float32Array(verts);
      for (let k = 0; k < verts; k++) ys[k] = pos[k * 3 + 1];
      this[store] = { r0, r1, rings, seg, power, y: ys };
    }
    return g;
  }

  // 表层权重：三层材质的混合比
  _surfaceWeights(x, z, y) {
    const slope = this.slopeAt(x, z, 1.6);
    const w = this.geo.surface(x, z, y, slope, this.H);
    const s = w[0] + w[1] + w[2] || 1;
    return [w[0] / s, w[1] / s, w[2] / s];
  }

  _material() {
    const tex = this.geo.tex;
    const tA = colorOf(tex[0], 1);
    const tB = colorOf(tex[1], 1);
    const tC = colorOf(tex[2], 1);
    const tMacro = colorOf('noiseRGBA', 1);
    [tA, tB, tC, tMacro].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });

    const warm = this.geo.macroWarm || [1.12, 1.02, 0.84];
    const cool = this.geo.macroCool || [0.94, 1.00, 0.92];

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      color: 0xffffff,
      dithering: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tA = { value: tA };
      shader.uniforms.tB = { value: tB };
      shader.uniforms.tC = { value: tC };
      shader.uniforms.tMacro = { value: tMacro };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWorldN = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldP;
          varying vec3 vWorldN;
          uniform sampler2D tA, tB, tC, tMacro;

          // 三平面投影：崖壁上不再把贴图拉成一条条
          vec3 triplanar(sampler2D t, vec3 p, vec3 n, float scale) {
            vec3 bw = pow(abs(n), vec3(4.0));
            bw /= max(bw.x + bw.y + bw.z, 0.0001);
            vec3 cx = texture2D(t, p.zy * scale).rgb;
            vec3 cy = texture2D(t, p.xz * scale).rgb;
            vec3 cz = texture2D(t, p.xy * scale).rgb;
            return cx * bw.x + cy * bw.y + cz * bw.z;
          }`)
        .replace('#include <color_fragment>', `
          vec3 w = vColor.rgb / max(vColor.r + vColor.g + vColor.b, 0.0001);
          vec3 P = vWorldP;
          vec3 N = normalize(vWorldN);
          float flatness = clamp(N.y, 0.0, 1.0);

          // 平地按世界 xz 平铺（便宜），陡坡换三平面（不拉伸）
          vec2 wuv = P.xz;
          vec3 ca = texture2D(tA, wuv * 0.085).rgb;
          vec3 ca2 = texture2D(tA, vec2(wuv.y, -wuv.x) * 0.026).rgb;
          ca = mix(ca, ca2, 0.30);
          vec3 cb = texture2D(tB, wuv * 0.11).rgb;

          vec3 cc = triplanar(tC, P, N, 0.042);
          vec3 cc2 = triplanar(tC, P, N, 0.0092);
          cc = mix(cc, cc2, 0.5);

          // 陡处把前两层也换成三平面，坡面才不糊
          if (flatness < 0.72) {
            float k = smoothstep(0.72, 0.34, flatness);
            ca = mix(ca, triplanar(tA, P, N, 0.085), k);
            cb = mix(cb, triplanar(tB, P, N, 0.11), k);
          }

          vec3 blended = ca * w.r + cb * w.g + cc * w.b;

          // 大尺度色彩变化，打散平铺感
          vec3 macro = texture2D(tMacro, wuv * 0.0043).rgb;
          blended *= mix(vec3(0.78), vec3(1.22), macro.r);
          blended *= mix(vec3(${cool[0]}, ${cool[1]}, ${cool[2]}),
                         vec3(${warm[0]}, ${warm[1]}, ${warm[2]}), macro.g);
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
    // 内圈一直铺到 320：远山上的松林就落在这一圈里，
    // 网格够密，树才不会浮在山脊的三角形上面
    this.innerR = 320;
    const inner = this._radialGeometry(0.6, this.innerR, 152, 300, 1.46, '_gridInner');
    this.mesh = new THREE.Mesh(inner, matA);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.group.add(this.mesh);

    const outer = this._radialGeometry(this.innerR, 980, 96, 208, 1.7, '_gridOuter');
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

  // ---- 广场铺地 ------------------------------------------------------
  _buildPlaza() {
    const seg = 140;
    const cx = (PLAZA.x0 + PLAZA.x1) / 2, cz = (PLAZA.z0 + PLAZA.z1) / 2;
    const hx = (PLAZA.x1 - PLAZA.x0) / 2, hz = (PLAZA.z1 - PLAZA.z0) / 2;
    const pos = [], uv = [], idx = [];
    const gw = seg, gh = seg;
    for (let i = 0; i <= gh; i++) {
      for (let j = 0; j <= gw; j++) {
        const u = j / gw, v = i / gh;
        const x = cx + (u - 0.5) * hx * 2.16;
        const z = cz + (v - 0.5) * hz * 2.16;
        // 抬高 12cm 而不是 4.5cm：远景下 z-buffer 精度不足时不会闪
        pos.push(x, this.heightAt(x, z) + 0.12, z);
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
        // 建筑台基自带压顶石板，铺地再压过去就是两层共面的闪烁
        if (inFootprint(px, pz, 0.4)) continue;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    if (!idx.length) return;         // 归墟／昆仑这类广场落在水上的关卡，直接不铺
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    const name = this.geo.plazaTex;
    const mat = new THREE.MeshStandardMaterial({
      map: colorOf(name, 1),
      normalMap: normalOf(name, 1.5, 1),
      roughnessMap: roughnessOf(name, 0.62, 0.98, false, 1),
      roughness: 1.0,
      metalness: 0.0,
      normalScale: new THREE.Vector2(0.85, 0.85),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.plazaMesh = new THREE.Mesh(g, mat);
    this.plazaMesh.receiveShadow = true;
    this.group.add(this.plazaMesh);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
    this.scene.remove(this.group);
    this.pads.length = 0;
    this._lut = null;
  }
}
