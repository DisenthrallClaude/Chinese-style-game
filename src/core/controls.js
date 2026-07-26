// 运镜 —— 受约束的轨道相机，兼顾观景与布阵
import * as THREE from 'three';
import { clamp, lerp } from './noise.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.target = new THREE.Vector3(0, 8, -28);
    this.desired = this.target.clone();
    this.yaw = 0;
    this.pitch = 0.352;
    this.dist = 160;
    this.dYaw = 0; this.dPitch = 0.352; this.dDist = 160;
    this.home = { target: new THREE.Vector3(0, 8, -28), yaw: 0, pitch: 0.352, dist: 160 };

    this.minDist = 26; this.maxDist = 260;
    this.minPitch = 0.055; this.maxPitch = 1.18;
    this.bounds = { x: 96, z: 104, cz: -12 };

    this.enabled = true;
    this.dragging = null;
    this.keys = new Set();
    this._shake = 0; this._shakeDecay = 3.2;
    this._tmp = new THREE.Vector3();
    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this.dragging = { mode: 'orbit', x: e.clientX, y: e.clientY };
        d.setPointerCapture(e.pointerId);
      }
    });
    addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
      this.dragging.x = e.clientX; this.dragging.y = e.clientY;
      this.yaw -= dx * 0.0042;
      this.pitch = clamp(this.pitch + dy * 0.0034, this.minPitch, this.maxPitch);
    });
    addEventListener('pointerup', () => { this.dragging = null; });
    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0011);
      this.dist = clamp(this.dist * f, this.minDist, this.maxDist);
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  shake(amount) { this._shake = Math.min(1.6, this._shake + amount); }

  reset() {
    this.desired.copy(this.home.target);
    this.yaw = this.home.yaw; this.pitch = this.home.pitch; this.dist = this.home.dist;
  }

  focus(x, z, dist) {
    this.desired.set(x, this.desired.y, z);
    if (dist) this.dist = clamp(dist, this.minDist, this.maxDist);
  }

  update(dt) {
    const k = this.keys;
    const panSpeed = (this.dist * 0.42) * dt;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyQ')) this.yaw += dt * 1.0;
    if (k.has('KeyE')) this.yaw -= dt * 1.0;
    if (mx || mz) {
      // 沿相机朝向平移
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      this.desired.x += (mx * c + mz * s) * panSpeed;
      this.desired.z += (-mx * s + mz * c) * panSpeed;
    }
    this.desired.x = clamp(this.desired.x, -this.bounds.x, this.bounds.x);
    this.desired.z = clamp(this.desired.z, this.bounds.cz - this.bounds.z, this.bounds.cz + this.bounds.z);

    const sm = 1 - Math.pow(0.0016, dt);
    this.target.lerp(this.desired, sm);
    this.dYaw = lerp(this.dYaw, this.yaw, sm);
    this.dPitch = lerp(this.dPitch, this.pitch, sm);
    this.dDist = lerp(this.dDist, this.dist, sm);

    const cp = Math.cos(this.dPitch), sp = Math.sin(this.dPitch);
    const x = this.target.x + Math.sin(this.dYaw) * cp * this.dDist;
    const z = this.target.z + Math.cos(this.dYaw) * cp * this.dDist;
    const y = this.target.y + sp * this.dDist;
    this.camera.position.set(x, y, z);

    if (this._shake > 0.0005) {
      const a = this._shake * this._shake;
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * 47.3) * a * 1.5;
      this.camera.position.y += Math.sin(t * 39.1 + 1.7) * a * 1.2;
      this.camera.position.z += Math.cos(t * 43.7) * a * 1.5;
      this._shake = Math.max(0, this._shake - dt * this._shakeDecay * (0.4 + this._shake));
    }
    this.camera.lookAt(this.target);
  }
}
