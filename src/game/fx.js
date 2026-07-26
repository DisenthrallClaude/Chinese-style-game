// 特效 —— 火星、冲击环、雷弧、飘字，全部走 GPU，主循环只写缓冲
import * as THREE from 'three';
import { Rng, clamp, lerp } from '../core/noise.js';
import { buildTexture } from '../core/textures.js';

/* ============================================================
   火星 / 碎屑 / 烟
   ============================================================ */
const sparkVert = /* glsl */`
  attribute vec3 aVel;
  attribute vec4 aLife;    // x: 出生时刻 y: 寿命 z: 尺寸 w: 重力
  attribute vec3 aColor;
  varying vec3 vCol;
  varying float vA;
  uniform float uTime;
  void main() {
    float age = uTime - aLife.x;
    float t = age / max(0.0001, aLife.y);
    if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; gl_PointSize = 0.0; return; }
    vec3 p = position + aVel * age;
    p.y -= aLife.w * age * age * 4.9;
    // 空气阻力
    p -= aVel * age * age * 0.34;
    vCol = aColor;
    vA = pow(1.0 - t, 1.6);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife.z * (1.0 - t * 0.55) * (420.0 / max(1.0, -mv.z));
  }
`;
const sparkFrag = /* glsl */`
  precision highp float;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.05, d);
    if (vA * a < 0.005) discard;
    gl_FragColor = vec4(vCol, vA * a);
  }
`;

export class Sparks {
  constructor(scene, max = 3000, blending = THREE.AdditiveBlending) {
    this.max = max; this.head = 0; this.time = 0; this.dirty = false;
    const pos = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const life = new Float32Array(max * 4);
    const col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) life[i * 4 + 1] = -1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(life, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 900);
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: sparkVert, fragmentShader: sparkFrag,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit(x, y, z, n, opts = {}) {
    const {
      speed = 6, spread = 1, color = 0xffb060, color2 = null, size = 6,
      life = 0.7, gravity = 0.35, up = 0.5, dirX = 0, dirY = 0, dirZ = 0, dirW = 0,
    } = opts;
    const g = this.geo;
    const P = g.attributes.position.array, V = g.attributes.aVel.array;
    const L = g.attributes.aLife.array, C = g.attributes.aColor.array;
    const c1 = this._c.set(color); const r1 = c1.r, g1 = c1.g, b1 = c1.b;
    let r2 = r1, g2 = g1, b2 = b1;
    if (color2 !== null) { const c2 = this._c.set(color2); r2 = c2.r; g2 = c2.g; b2 = c2.b; }
    for (let i = 0; i < n; i++) {
      const k = this.head; this.head = (this.head + 1) % this.max;
      P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const el = Math.acos(1 - Math.random() * (1 + up));
      const sp = speed * (0.35 + Math.random() * 0.9);
      let vx = Math.sin(el) * Math.cos(a) * sp * spread;
      let vy = Math.cos(el) * sp * (0.4 + up);
      let vz = Math.sin(el) * Math.sin(a) * sp * spread;
      if (dirW > 0) { vx += dirX * dirW; vy += dirY * dirW; vz += dirZ * dirW; }
      V[k * 3] = vx; V[k * 3 + 1] = vy; V[k * 3 + 2] = vz;
      L[k * 4] = this.time;
      L[k * 4 + 1] = life * (0.6 + Math.random() * 0.8);
      L[k * 4 + 2] = size * (0.55 + Math.random() * 0.9);
      L[k * 4 + 3] = gravity;
      const m = Math.random();
      C[k * 3] = lerp(r1, r2, m); C[k * 3 + 1] = lerp(g1, g2, m); C[k * 3 + 2] = lerp(b1, b2, m);
    }
    this.dirty = true;
  }

  update(t) {
    this.time = t;
    this.material.uniforms.uTime.value = t;
    if (this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aVel.needsUpdate = true;
      this.geo.attributes.aLife.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/* ============================================================
   冲击环 / 领域圈
   ============================================================ */
const ringVert = /* glsl */`
  attribute vec4 aRing;   // x: 出生 y: 寿命 z: 起始半径 w: 终止半径
  attribute vec4 aTint;   // rgb + 强度
  varying vec2 vUv;
  varying vec4 vTint;
  varying float vT;
  uniform float uTime;
  void main() {
    float age = uTime - aRing.x;
    float t = age / max(0.0001, aRing.y);
    vT = t;
    vUv = uv;
    vTint = aTint;
    if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    float r = mix(aRing.z, aRing.w, 1.0 - pow(1.0 - t, 2.2));
    vec3 p = position * r;
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }
`;
const ringFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec4 vTint;
  varying float vT;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float band = smoothstep(0.55, 0.98, d) * smoothstep(1.02, 0.94, d);
    float inner = smoothstep(1.0, 0.2, d) * 0.22;
    float a = (band + inner) * (1.0 - vT) * vTint.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint.rgb, a);
  }
`;

export class Rings {
  constructor(scene, max = 48) {
    const base = new THREE.PlaneGeometry(2, 2);
    base.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.mat4 = new THREE.InstancedBufferAttribute(new Float32Array(max * 16), 16);
    this.aRing = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    geo.setAttribute('instanceMatrix', this.mat4);
    geo.setAttribute('aRing', this.aRing);
    geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = max;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: ringVert.replace('attribute vec4 aRing;', 'attribute vec4 aRing;\nattribute mat4 instanceMatrix;'),
      fragmentShader: ringFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    scene.add(this.mesh);
    this.max = max; this.head = 0; this.time = 0;
    this._m = new THREE.Matrix4();
    for (let i = 0; i < max; i++) this.aRing.array[i * 4 + 1] = -1;
  }
  spawn(x, y, z, r0, r1, life, color, alpha = 1) {
    const k = this.head; this.head = (this.head + 1) % this.max;
    this._m.makeTranslation(x, y, z);
    this.mat4.array.set(this._m.elements, k * 16);
    const a = this.aRing.array;
    a[k * 4] = this.time; a[k * 4 + 1] = life; a[k * 4 + 2] = r0; a[k * 4 + 3] = r1;
    const c = new THREE.Color(color);
    const tt = this.aTint.array;
    tt[k * 4] = c.r; tt[k * 4 + 1] = c.g; tt[k * 4 + 2] = c.b; tt[k * 4 + 3] = alpha;
    this.mat4.needsUpdate = true; this.aRing.needsUpdate = true; this.aTint.needsUpdate = true;
  }
  update(t) { this.time = t; this.material.uniforms.uTime.value = t; }
}

/* ============================================================
   雷弧 / 光束
   ============================================================ */
export class Bolts {
  constructor(scene, max = 24, segs = 10) {
    this.max = max; this.segs = segs;
    const verts = max * (segs + 1) * 2;
    const pos = new Float32Array(verts * 3);
    const alp = new Float32Array(verts);
    const col = new Float32Array(verts * 3);
    const idx = [];
    for (let b = 0; b < max; b++) {
      const base = b * (segs + 1) * 2;
      for (let i = 0; i < segs; i++) {
        const a0 = base + i * 2;
        idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aAlpha; attribute vec3 aColor;
        varying float vA; varying vec3 vC;
        void main(){ vA=aAlpha; vC=aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float; varying float vA; varying vec3 vC;
        void main(){ if(vA<0.004) discard; gl_FragColor = vec4(vC, vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    scene.add(this.mesh);
    this.slots = new Array(max).fill(null);
    this.head = 0;
    this._up = new THREE.Vector3(0, 1, 0);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._d = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  spawn(from, to, opts = {}) {
    const { life = 0.22, width = 0.42, jitter = 0.9, color = 0xa8e0ff } = opts;
    const k = this.head; this.head = (this.head + 1) % this.max;
    const c = new THREE.Color(color);
    const off = [];
    for (let i = 0; i <= this.segs; i++) {
      const t = i / this.segs;
      const s = Math.sin(t * Math.PI) * jitter;
      off.push([(Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s]);
    }
    this.slots[k] = { from: from.clone(), to: to.clone(), t: 0, life, width, off, c };
    return k;
  }
  update(dt, camera) {
    const P = this.geo.attributes.position.array;
    const A = this.geo.attributes.aAlpha.array;
    const C = this.geo.attributes.aColor.array;
    const segs = this.segs;
    for (let b = 0; b < this.max; b++) {
      const s = this.slots[b];
      const base = b * (segs + 1) * 2;
      if (!s) { for (let i = 0; i <= segs; i++) { A[base + i * 2] = 0; A[base + i * 2 + 1] = 0; } continue; }
      s.t += dt;
      const k = 1 - s.t / s.life;
      if (k <= 0) { this.slots[b] = null; for (let i = 0; i <= segs; i++) { A[base + i * 2] = 0; A[base + i * 2 + 1] = 0; } continue; }
      this._d.copy(s.to).sub(s.from);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        this._a.copy(s.from).addScaledVector(this._d, t);
        this._a.x += s.off[i][0]; this._a.y += s.off[i][1]; this._a.z += s.off[i][2];
        this._n.copy(this._a).sub(camera.position).cross(this._d).normalize().multiplyScalar(s.width * (0.4 + k * 0.9));
        const i0 = (base + i * 2) * 3, i1 = (base + i * 2 + 1) * 3;
        P[i0] = this._a.x - this._n.x; P[i0 + 1] = this._a.y - this._n.y; P[i0 + 2] = this._a.z - this._n.z;
        P[i1] = this._a.x + this._n.x; P[i1 + 1] = this._a.y + this._n.y; P[i1 + 2] = this._a.z + this._n.z;
        const a = k * (0.5 + 0.5 * Math.sin(t * 9 + s.t * 40));
        A[base + i * 2] = a; A[base + i * 2 + 1] = a;
        C[i0] = s.c.r; C[i0 + 1] = s.c.g; C[i0 + 2] = s.c.b;
        C[i1] = s.c.r; C[i1 + 1] = s.c.g; C[i1 + 2] = s.c.b;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

/* ============================================================
   飘字（伤害 / 收益）—— DOM 层，量少但很提神
   ============================================================ */
export class FloatText {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = [];
    this.pool = [];
    this._v = new THREE.Vector3();
  }
  spawn(x, y, z, text, cls = '') {
    let el = this.pool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'float-text'; }
    el.textContent = text;
    el.className = 'float-text ' + cls;
    el.style.opacity = '1';
    this.container.appendChild(el);
    this.items.push({ el, x, y, z, t: 0, life: 1.05, vy: 5.4 + Math.random() * 2, dx: (Math.random() - 0.5) * 16 });
    if (this.items.length > 34) {
      const old = this.items.shift();
      old.el.remove(); this.pool.push(old.el);
    }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t > it.life) {
        it.el.remove(); this.pool.push(it.el);
        this.items.splice(i, 1); continue;
      }
      const k = it.t / it.life;
      this._v.set(it.x, it.y + it.vy * it.t * (1 - k * 0.5), it.z).project(this.camera);
      if (this._v.z > 1) { it.el.style.opacity = '0'; continue; }
      const sx = (this._v.x * 0.5 + 0.5) * innerWidth + it.dx * k;
      const sy = (-this._v.y * 0.5 + 0.5) * innerHeight;
      it.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${(1.25 - k * 0.35).toFixed(2)})`;
      it.el.style.opacity = String(Math.max(0, 1 - Math.pow(k, 2.2)));
    }
  }
}
