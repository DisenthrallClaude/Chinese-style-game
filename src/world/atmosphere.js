// 气象 —— 浮尘、流萤、飞鸟、落英与炊烟（谷雾已撤，画面要通透）
import * as THREE from 'three';
import { Noise, Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { colorOf } from '../core/textures.js';
import { LEVEL, VALLEY_C, distToRiver } from './layout.js';


/* ============================================================
   通用粒子场（顶点着色器驱动，CPU 零开销）
   ============================================================ */
const partVert = /* glsl */`
  attribute vec3 aOrigin;
  attribute vec4 aParam;      // x: phase, y: speed, z: size, w: range
  varying float vAlpha;
  varying vec3 vTint;
  uniform float uTime, uSizeScale, uMode, uAlpha;
  uniform vec3 uColorA, uColorB;
  void main() {
    vec3 p = aOrigin;
    float ph = aParam.x, sp = aParam.y, sz = aParam.z, rg = aParam.w;
    float a = 1.0;
    if (uMode < 0.5) {
      // 浮尘：缓慢盘旋上升
      float ty = mod(uTime * sp * 0.35 + ph, 1.0);
      p.y += ty * rg;
      p.x += sin(uTime * sp + ph * 6.0) * 1.8;
      p.z += cos(uTime * sp * 0.83 + ph * 4.0) * 1.8;
      a = sin(ty * 3.14159) * 0.9 + 0.1;
    } else if (uMode < 1.5) {
      // 流萤：随机游走 + 闪烁
      p.x += sin(uTime * sp * 0.8 + ph * 5.0) * 4.2 + sin(uTime * sp * 2.1 + ph) * 1.1;
      p.z += cos(uTime * sp * 0.7 + ph * 3.0) * 4.2 + cos(uTime * sp * 1.7 + ph) * 1.1;
      p.y += sin(uTime * sp * 0.55 + ph * 2.0) * 1.9;
      a = pow(max(0.0, sin(uTime * (1.3 + sp * 2.0) + ph * 9.0)), 2.0);
    } else if (uMode < 2.5) {
      // 落英：飘落 + 摆荡
      float ty = mod(uTime * sp * 0.16 + ph, 1.0);
      p.y += rg * (1.0 - ty);
      p.x += sin(uTime * sp * 1.4 + ph * 7.0) * 3.4;
      p.z += cos(uTime * sp * 1.1 + ph * 5.0) * 3.4;
      a = smoothstep(0.0, 0.12, ty) * smoothstep(1.0, 0.82, ty);
    } else {
      // 风沙／横雪：主要沿风向平移，边走边缓缓下沉
      float ty = mod(uTime * sp * 0.22 + ph, 1.0);
      p.x += (ty - 0.5) * rg * 3.2;
      p.y += rg * 0.5 * (1.0 - ty) + sin(uTime * sp * 2.2 + ph * 6.0) * 1.4;
      p.z += sin(uTime * sp * 0.6 + ph * 4.0) * 6.0;
      a = smoothstep(0.0, 0.10, ty) * smoothstep(1.0, 0.80, ty);
    }
    vAlpha = a * uAlpha;
    vTint = mix(uColorA, uColorB, fract(ph * 3.77));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = sz * uSizeScale * (300.0 / max(1.0, -mv.z));
  }
`;
const partFrag = /* glsl */`
  precision highp float;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.06, d);
    a *= a;
    if (vAlpha * a < 0.004) discard;
    gl_FragColor = vec4(vTint, vAlpha * a);
  }
`;

class ParticleField {
  constructor(scene, opts = {}) {
    const {
      count = 600, mode = 0, colorA = 0xfff0c8, colorB = 0xffd489,
      area = 120, yBase = 2, yRange = 14, sizeRange = [1.2, 3.4],
      speedRange = [0.2, 0.9], center = VALLEY_C, blending = THREE.AdditiveBlending,
      alpha = 1.0, seed = 1,
    } = opts;
    const rng = new Rng(seed * 7919);
    const pos = new Float32Array(count * 3);
    const org = new Float32Array(count * 3);
    const par = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.pow(rng.next(), 0.6) * area;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const y = yBase + rng.range(0, yRange * 0.4);
      org[i * 3] = x; org[i * 3 + 1] = y; org[i * 3 + 2] = z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      par[i * 4] = rng.next();
      par[i * 4 + 1] = rng.range(speedRange[0], speedRange[1]);
      par[i * 4 + 2] = rng.range(sizeRange[0], sizeRange[1]);
      par[i * 4 + 3] = yRange;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aOrigin', new THREE.BufferAttribute(org, 3));
    g.setAttribute('aParam', new THREE.BufferAttribute(par, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(center.x, yBase + yRange / 2, center.z), area * 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSizeScale: { value: 1 },
        uMode: { value: mode },
        uAlpha: { value: alpha },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
      },
      vertexShader: partVert,
      fragmentShader: partFrag,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.renderOrder = 9;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(t, alpha) {
    this.material.uniforms.uTime.value = t;
    if (alpha !== undefined) this.material.uniforms.uAlpha.value = alpha;
  }
}

/* ============================================================
   飞鸟
   ============================================================ */
class Birds {
  constructor(scene, count = 18) {
    const g = new THREE.BufferGeometry();
    // 两片三角构成的一只鸟
    const pos = new Float32Array([
      0, 0, 0, -1, 0.12, -0.5, -1, 0.12, 0.5,
      0, 0, 0, 1, 0.12, 0.5, 1, 0.12, -0.5,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1e, side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0.85 });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false;
    this.count = count;
    this.rng = new Rng(4242);
    this.data = [];
    for (let i = 0; i < count; i++) {
      this.data.push({
        r: this.rng.range(90, 210),
        y: this.rng.range(52, 118),
        sp: this.rng.range(0.055, 0.115) * (this.rng.chance(0.5) ? 1 : -1),
        ph: this.rng.range(0, 6.28),
        flap: this.rng.range(7, 13),
        s: this.rng.range(1.1, 2.3),
        wob: this.rng.range(3, 10),
      });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    scene.add(this.mesh);
  }
  update(t) {
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      const a = t * d.sp + d.ph;
      const x = VALLEY_C.x + Math.cos(a) * d.r;
      const z = VALLEY_C.z + Math.sin(a) * d.r * 0.8;
      const y = d.y + Math.sin(t * 0.4 + d.ph) * d.wob;
      const flapA = Math.sin(t * d.flap + d.ph) * 0.75;
      this._e.set(flapA * 0.5, -a + (d.sp > 0 ? Math.PI / 2 : -Math.PI / 2), flapA);
      this._q.setFromEuler(this._e);
      this._p.set(x, y, z);
      this._s.set(d.s, d.s, d.s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ============================================================ */
export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.W = LEVEL.weather;
    const yb = LEVEL.geo.plazaY || 0;
    const W = this.W;
    this.fields = [];

    const add = (key, opts) => {
      const f = new ParticleField(scene, { ...opts, center: LEVEL.geo.center });
      this[key] = f;
      this.fields.push(f);
      return f;
    };

    add('dust', {
      count: 520, mode: 0, area: 108, yBase: yb + 0.5, yRange: 20,
      sizeRange: [0.5, 1.5], speedRange: [0.18, 0.62],
      colorA: 0xfff2d4, colorB: 0xffd9a0, seed: 3, alpha: 0.20,
    });
    add('fireflies', {
      count: 420, mode: 1, area: 96, yBase: yb + 1.2, yRange: 7,
      sizeRange: [1.6, 4.0], speedRange: [0.3, 1.0],
      colorA: 0xaaff9a, colorB: 0xffe27a, seed: 7, alpha: 0.0,
    });
    if (W.petals > 0) add('petals', {
      count: 220, mode: 2, area: 94, yBase: yb + 1.0, yRange: 26,
      sizeRange: [1.0, 2.2], speedRange: [0.35, 0.95],
      colorA: 0xffd9e2, colorB: 0xfff0c0, seed: 11, alpha: 0.5,
      blending: THREE.NormalBlending,
    });
    // 飞雪：细密、慢、白，压在整个谷上
    if (W.snow > 0) add('snow', {
      count: 1400, mode: 2, area: 130, yBase: yb + 1.0, yRange: 46,
      sizeRange: [1.1, 2.8], speedRange: [0.5, 1.3],
      colorA: 0xffffff, colorB: 0xd8e8ff, seed: 23, alpha: 0.7,
      blending: THREE.NormalBlending,
    });
    // 火星：自熔岩沟升起，加色混合
    if (W.ember > 0) add('ember', {
      count: 620, mode: 0, area: 100, yBase: yb - 1.0, yRange: 34,
      sizeRange: [1.0, 3.2], speedRange: [0.5, 1.6],
      colorA: 0xff7a1e, colorB: 0xffd06a, seed: 29, alpha: 0.55,
    });
    // 风沙：横着扫过画面
    if (W.sand > 0) add('sand', {
      count: 900, mode: 3, area: 120, yBase: yb + 0.5, yRange: 22,
      sizeRange: [0.8, 2.4], speedRange: [0.6, 1.5],
      colorA: 0xe8c890, colorB: 0xc8a066, seed: 31, alpha: 0.30,
      blending: THREE.NormalBlending,
    });
    // 浪沫：贴着水面的一层水汽
    if (W.spray > 0) add('spray', {
      count: 520, mode: 0, area: 125, yBase: (LEVEL.geo.waterY || 0) + 0.4, yRange: 9,
      sizeRange: [2.0, 5.5], speedRange: [0.25, 0.7],
      colorA: 0xeaf8ff, colorB: 0xb8dcea, seed: 37, alpha: 0.22,
      blending: THREE.NormalBlending,
    });
    // 灵光：昆仑的浮空光点
    if (W.motes > 0) add('motes', {
      count: 700, mode: 1, area: 110, yBase: yb + 2.0, yRange: 26,
      sizeRange: [1.2, 3.4], speedRange: [0.15, 0.6],
      colorA: 0xd8c0ff, colorB: 0xa8e8ff, seed: 41, alpha: 0.45,
    });

    this.birds = new Birds(scene, W.birds !== undefined ? W.birds : 20);
    this.smokes = [];
  }

  addSmoke(x, y, z) {
    const f = new ParticleField(this.scene, {
      count: 90, mode: 0, area: 0.7, yBase: y, yRange: 13,
      sizeRange: [3, 8], speedRange: [0.16, 0.34],
      colorA: 0xa8aeb4, colorB: 0x76797e, seed: 17 + this.smokes.length,
      center: { x, z }, blending: THREE.NormalBlending, alpha: 0.10,
    });
    this.smokes.push(f);
  }

  update(dt, t, dayNight, camera) {
    const n = clamp(dayNight.lanternLevel, 0, 1);
    const W = this.W;
    this.dust.update(t, lerp(0.10, 0.03, n) * (W.dust / 0.10 || 1));
    this.fireflies.update(t, n * 0.95 * (W.fireflies || 0));
    if (this.petals) this.petals.update(t, lerp(0.30, 0.10, n) * W.petals);
    if (this.snow) this.snow.update(t, lerp(0.62, 0.44, n) * W.snow);
    if (this.ember) this.ember.update(t, lerp(0.42, 0.72, n) * W.ember);
    if (this.sand) this.sand.update(t, lerp(0.30, 0.16, n) * W.sand);
    if (this.spray) this.spray.update(t, lerp(0.22, 0.12, n) * W.spray);
    if (this.motes) this.motes.update(t, lerp(0.28, 0.55, n) * W.motes);
    this.birds.update(t);
    for (const f of this.smokes) f.update(t, lerp(0.11, 0.05, n));
  }

  dispose() {
    for (const f of [...this.fields, ...this.smokes]) {
      f.points.geometry.dispose();
      f.material.dispose();
      this.scene.remove(f.points);
    }
    this.birds.mesh.geometry.dispose();
    this.birds.mesh.material.dispose();
    this.scene.remove(this.birds.mesh);
  }
}
