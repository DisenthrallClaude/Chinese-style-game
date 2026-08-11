// 营造格 —— 可安放机关的地块，以及地块的高亮显示
import * as THREE from 'three';
import { clamp, lerp, smoothstep, Rng } from '../core/noise.js';
import {
  distToAnyPath, distToRiver, inFootprint, VALLEY_C, HEART, PATHS, BUILD_R,
  WATER_Y, WATER_SHEET,
} from '../world/layout.js';

const slotVert = /* glsl */`
  attribute vec3 aPos;
  attribute vec4 aInfo;   // x: 类型 y: 高亮 z: 可用 w: 尺寸
  varying vec2 vUv;
  varying vec4 vInfo;
  uniform float uTime;
  void main() {
    vUv = uv;
    vInfo = aInfo;
    float s = aInfo.w * (1.0 + aInfo.y * 0.22);
    vec3 p = vec3(position.x * s, 0.0, position.y * s) + aPos;
    p.y += 0.06 + aInfo.y * 0.05;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const slotFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec4 vInfo;
  uniform float uTime, uFade;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    // 八角形
    float d = max(max(abs(c.x), abs(c.y)), (abs(c.x) + abs(c.y)) * 0.72);
    float ring = smoothstep(0.98, 0.88, d) * smoothstep(0.66, 0.78, d);
    float fill = smoothstep(1.0, 0.86, d) * 0.16;
    vec3 col = vInfo.x < 0.5
      ? vec3(0.88, 0.72, 0.36)                      // 陆地
      : (vInfo.x < 1.5 ? vec3(0.40, 0.76, 0.95)     // 临水
                       : vec3(0.72, 0.92, 0.62));   // 高地
    if (vInfo.z < 0.5) col = vec3(0.85, 0.28, 0.22);
    float pulse = 0.72 + 0.28 * sin(uTime * 2.4 + vInfo.w * 3.0);
    float a = (ring * (0.55 + vInfo.y * 0.9) + fill) * pulse * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * (1.0 + vInfo.y * 0.9), a);
  }
`;

export class BuildGrid {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.slots = [];
    this._generate(terrain);

    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const n = this.slots.length;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aInfo.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      const s = this.slots[i];
      this.aPos.array[i * 3] = s.x; this.aPos.array[i * 3 + 1] = s.y; this.aPos.array[i * 3 + 2] = s.z;
      this.aInfo.array[i * 4] = s.type === 'water' ? 1 : (s.type === 'high' ? 2 : 0);
      this.aInfo.array[i * 4 + 3] = 2.05;
    }
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aInfo', this.aInfo);
    geo.instanceCount = n;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: slotVert, fragmentShader: slotFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.fade = 0;
  }

  _generate(terrain) {
    // 六边形排布，看起来比方格自然
    const step = 5.2;
    const rowH = step * 0.866;
    // 判据沿用原作：坡度门槛放得比较松，河两岸都摆得下。
    // 另加一道很宽的高差兜底，只拦真正会悬空半米以上的坎，不做精细筛选。
    const BASE_R = 2.15;
    const MAX_RELIEF = 1.30;
    let idx = 0;
    for (let row = -30; row <= 30; row++) {
      const z = VALLEY_C.z + row * rowH;
      const off = (row & 1) ? step * 0.5 : 0;
      for (let col = -30; col <= 30; col++) {
        const x = VALLEY_C.x + col * step + off;
        const rr = Math.hypot(x - VALLEY_C.x, z - VALLEY_C.z);
        if (rr > BUILD_R) continue;
        const dPath = distToAnyPath(x, z);
        if (dPath < 4.0 || dPath > 34) continue;
        if (inFootprint(x, z, 1.2)) continue;
        if (Math.hypot(x - HEART.x, z - HEART.z) < 8.5) continue;
        // 取渲染面的高度，不是解析高程 —— 塔是摆在画出来的那个面上的
        const y = terrain.surfaceY(x, z);
        const dRiver = distToRiver(x, z);
        // 整片的海／云海没有中心线，改用「离水面多高」判断是不是临水格
        const nearWater = WATER_SHEET ? (y < WATER_Y + 4.2) : (dRiver < 11.5);
        if (y < WATER_Y + (nearWater ? 0.2 : 0.7)) continue;
        const slope = terrain.slopeAt(x, z, 2.4);
        if (slope > (nearWater ? 1.25 : 0.62)) continue;
        if (terrain.reliefAt(x, z, BASE_R) > MAX_RELIEF) continue;
        let type = 'land';
        if (nearWater) type = 'water';
        else if (y > terrain.plazaY + 16) type = 'high';
        this.slots.push({ i: idx++, x, y, z, type, tower: null, dPath, dRiver });
      }
    }
  }

  // 找到离射线落点最近的可用格
  nearest(x, z, maxD = 5.0) {
    let best = null, bd = maxD * maxD;
    for (const s of this.slots) {
      const dx = s.x - x, dz = s.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.slots.length = 0;
  }

  setBuildMode(on, canPlace) {
    this.target = on ? 1 : 0;
    this.canPlace = canPlace;
  }

  update(dt, t, hoverSlot, validFn) {
    this.fade += ((this.target || 0) - this.fade) * Math.min(1, dt * 7);
    this.mesh.visible = this.fade > 0.01;
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uFade.value = this.fade;
    if (!this.mesh.visible) return;
    const A = this.aInfo.array;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const occupied = !!s.tower;
      const ok = !occupied && (!validFn || validFn(s));
      A[i * 4 + 1] = (hoverSlot === s) ? 1 : 0;
      A[i * 4 + 2] = ok ? 1 : 0;
      A[i * 4 + 3] = occupied ? 0.0 : 2.05;
    }
    this.aInfo.needsUpdate = true;
  }
}
