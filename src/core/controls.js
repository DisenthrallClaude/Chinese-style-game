// 运镜 —— 受约束的轨道相机
// 鼠标：左键拖拽抓地平移 / 右键（或中键、Shift+左键）转视角 /
//       滚轮对准光标推拉 / 光标贴近屏幕边缘自动推屏
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise.js';

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

    this.minDist = 18; this.maxDist = 275;
    this.minPitch = 0.055; this.maxPitch = 1.22;
    this.bounds = { x: 104, z: 112, cz: -12 };

    this.enabled = true;
    this.dragging = null;
    this.keys = new Set();
    this._shake = 0; this._shakeDecay = 3.2;

    // 边缘推屏
    this.edgePan = true;
    this.edgeMargin = 46;        // 像素
    this.edgeSpeed = 0.55;       // 相对于当前距离
    this.pointer = { x: -1, y: -1, inside: false, overUI: false };

    // 惯性
    this.vel = new THREE.Vector3();
    this.yawVel = 0;

    // 滚轮对准光标：由外部提供光标处的世界坐标
    this.cursorProvider = null;

    this._tmp = new THREE.Vector3();
    this._bind();
  }

  /* ---------------------------------------------------- 事件 */
  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());

    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const orbit = (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey));
      this.dragging = {
        mode: orbit ? 'orbit' : 'pan',
        x: e.clientX, y: e.clientY,
        moved: 0, id: e.pointerId,
      };
      this.vel.set(0, 0, 0);
      this.yawVel = 0;
      try { d.setPointerCapture(e.pointerId); } catch (_) {}
    });

    addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      // 指针停在界面元素上时不推屏
      const t = e.target;
      this.pointer.overUI = !!(t && t !== d && t.closest &&
        t.closest('#hud, #startScreen, #endScreen, #loader'));

      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
      this.dragging.x = e.clientX; this.dragging.y = e.clientY;
      this.dragging.moved += Math.abs(dx) + Math.abs(dy);

      if (this.dragging.mode === 'orbit') {
        this.yaw -= dx * 0.0042;
        this.pitch = clamp(this.pitch + dy * 0.0034, this.minPitch, this.maxPitch);
        this.yawVel = -dx * 0.0042;
      } else {
        // 抓住地面拖动：世界跟着鼠标走
        // 屏幕右向量 R = (cos, 0, -sin)，屏幕深入方向 F = (-sin, 0, -cos)
        const sc = this._panScale();
        const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
        const a = -dx * sc.h;   // 沿 R
        const b = dy * sc.v;    // 沿 F
        const ox = a * c + b * (-sn);
        const oz = a * (-sn) + b * (-c);
        this.desired.x += ox;
        this.desired.z += oz;
        this.vel.set(ox, 0, oz).multiplyScalar(6);
      }
    });

    const endDrag = () => { this.dragging = null; };
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);
    d.addEventListener('pointerleave', () => { this.pointer.inside = false; });

    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      // 触控板与滚轮的 delta 量级差很多，做一次归一
      const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 100 : 1);
      const f = Math.exp(clamp(e.deltaY * unit, -260, 260) * 0.0013);
      const next = clamp(this.dist * f, this.minDist, this.maxDist);

      // 朝光标处推拉：拉近时把取景中心往光标那边挪
      const p = this.cursorProvider && this.cursorProvider();
      if (p) {
        const k = clamp(1 - next / Math.max(0.001, this.dist), -0.6, 0.6) * 0.9;
        this.desired.x += (p.x - this.desired.x) * k;
        this.desired.z += (p.z - this.desired.z) * k;
      }
      this.dist = next;
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.dragging = null; });
  }

  // 每像素对应的地面位移
  _panScale() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * this.dist * Math.tan(fov / 2) / Math.max(1, innerHeight);
    return { h, v: h / Math.max(0.30, Math.sin(this.pitch)) };
  }

  /* ---------------------------------------------------- 接口 */
  shake(amount) { this._shake = Math.min(1.6, this._shake + amount); }

  reset() {
    this.desired.copy(this.home.target);
    this.yaw = this.home.yaw; this.pitch = this.home.pitch; this.dist = this.home.dist;
    this.vel.set(0, 0, 0); this.yawVel = 0;
  }

  focus(x, z, dist) {
    this.desired.set(x, this.desired.y, z);
    if (dist) this.dist = clamp(dist, this.minDist, this.maxDist);
  }

  /* ---------------------------------------------------- 每帧 */
  update(dt) {
    const k = this.keys;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);

    // 键盘平移
    const panSpeed = (this.dist * 0.46) * dt;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('BracketLeft')) this.yaw += dt * 1.1;
    if (k.has('BracketRight')) this.yaw -= dt * 1.1;
    if (mx || mz) {
      this.desired.x += (mx * c + mz * s) * panSpeed;
      this.desired.z += (-mx * s + mz * c) * panSpeed;
      this.vel.set(0, 0, 0);
    }

    // 边缘推屏
    if (this.edgePan && this.pointer.inside && !this.pointer.overUI && !this.dragging) {
      const m = this.edgeMargin;
      let ex = 0, ey = 0;
      if (this.pointer.x < m) ex = -(1 - this.pointer.x / m);
      else if (this.pointer.x > innerWidth - m) ex = 1 - (innerWidth - this.pointer.x) / m;
      if (this.pointer.y < m) ey = -(1 - this.pointer.y / m);
      else if (this.pointer.y > innerHeight - m) ey = 1 - (innerHeight - this.pointer.y) / m;
      if (ex || ey) {
        // 平方曲线：越贴边越快，避免误触
        ex = Math.sign(ex) * ex * ex;
        ey = Math.sign(ey) * ey * ey;
        const sp = this.dist * this.edgeSpeed * dt;
        this.desired.x += (ex * c + ey * s) * sp;
        this.desired.z += (-ex * s + ey * c) * sp;
      }
    }

    // 拖拽结束后的惯性滑行
    if (!this.dragging) {
      if (this.vel.lengthSq() > 1e-6) {
        this.desired.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.pow(0.0032, dt));
      }
      if (Math.abs(this.yawVel) > 1e-5) {
        this.yaw += this.yawVel * dt * 8;
        this.yawVel *= Math.pow(0.004, dt);
      }
    }

    this.desired.x = clamp(this.desired.x, -this.bounds.x, this.bounds.x);
    this.desired.z = clamp(this.desired.z, this.bounds.cz - this.bounds.z, this.bounds.cz + this.bounds.z);

    // 拉近时自动压低俯角，贴地看更有临场感
    const near = 1 - smoothstep(this.minDist, 110, this.dist);
    this.maxPitch = lerp(1.22, 0.86, near);
    this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);

    const sm = 1 - Math.pow(0.0016, dt);
    this.target.lerp(this.desired, sm);
    this.dYaw = lerp(this.dYaw, this.yaw, sm);
    this.dPitch = lerp(this.dPitch, this.pitch, sm);
    this.dDist = lerp(this.dDist, this.dist, sm);

    const cp = Math.cos(this.dPitch), sp = Math.sin(this.dPitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.dYaw) * cp * this.dDist,
      this.target.y + sp * this.dDist,
      this.target.z + Math.cos(this.dYaw) * cp * this.dDist
    );

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
