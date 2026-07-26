// 弹道 —— 弩矢与飞石，实例化绘制
import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';
import { box, cyl, cone, sphere, T } from '../world/geo.js';
import { getMaterials } from '../world/materials.js';

function boltGeo() {
  const shaft = cyl(0.045, 0.045, 1.15, 5, 1.4);
  T(shaft, 0, 0, 0, Math.PI / 2, 0, 0);
  const head = cone(0.085, 0.3, 5, 1.4);
  T(head, 0, 0, 0.66, Math.PI / 2, 0, 0);
  const fl = box(0.02, 0.16, 0.22, 1.4);
  T(fl, 0, 0, -0.5);
  const fl2 = box(0.16, 0.02, 0.22, 1.4);
  T(fl2, 0, 0, -0.5);
  const list = [shaft, head, fl, fl2];
  let c = 0, ic = 0;
  for (const g of list) { c += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(c * 3), uv = new Float32Array(c * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
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

export class Projectiles {
  constructor(scene, game) {
    this.game = game;
    const M = getMaterials();
    this.list = [];
    this.max = 220;
    this.boltMesh = new THREE.InstancedMesh(boltGeo(), M.woodDark, this.max);
    this.stoneMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), M.stone, 90);
    for (const m of [this.boltMesh, this.stoneMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._d = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  fire(kind, from, target, opts) {
    if (this.list.length >= this.max) return;
    this.list.push({
      kind, x: from.x, y: from.y, z: from.z,
      target, speed: opts.speed || 70, dmg: opts.dmg, el: opts.el,
      splash: opts.splash || 0, arc: !!opts.arc, t: 0,
      sx: from.x, sy: from.y, sz: from.z,
      tx: target.x, ty: target.y + 1.0, tz: target.z,
      spin: Math.random() * 6.28, tower: opts.tower,
      burn: opts.burn || 0, burnTime: opts.burnTime || 0,
    });
  }

  update(dt, enemies) {
    const G = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      // 追踪目标（目标死了就打原地）
      if (p.target && p.target.alive) {
        p.tx = p.target.x; p.ty = p.target.y + 1.0; p.tz = p.target.z;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;
      p.t += dt;
      if (dist <= step || p.t > 4) {
        // 命中
        G.onProjectileHit(p, enemies);
        this.list.splice(i, 1);
        continue;
      }
      if (p.arc) {
        const total = Math.hypot(p.tx - p.sx, p.tz - p.sz);
        const travelled = Math.hypot(p.x - p.sx, p.z - p.sz);
        const k = clamp(travelled / Math.max(0.001, total), 0, 1);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        const k2 = clamp((travelled + step) / Math.max(0.001, total), 0, 1);
        p.y = lerp(p.sy, p.ty, k2) + Math.sin(k2 * Math.PI) * (total * 0.28 + 2.5);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.z += (dz / dist) * step;
      }
      p.spin += dt * 7;
    }

    // 写实例
    let nb = 0, ns = 0;
    for (const p of this.list) {
      if (p.kind === 'bolt') {
        this._p.set(p.x, p.y, p.z);
        this._d.set(p.tx - p.x, p.ty - p.y, p.tz - p.z).normalize();
        this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._d);
        this._m.compose(this._p, this._q, this._s);
        if (nb < this.max) this.boltMesh.setMatrixAt(nb++, this._m);
      } else {
        this._p.set(p.x, p.y, p.z);
        this._q.setFromEuler(new THREE.Euler(p.spin, p.spin * 0.7, 0));
        this._m.compose(this._p, this._q, this._s);
        if (ns < 90) this.stoneMesh.setMatrixAt(ns++, this._m);
      }
    }
    this.boltMesh.count = nb;
    this.stoneMesh.count = ns;
    if (nb) this.boltMesh.instanceMatrix.needsUpdate = true;
    if (ns) this.stoneMesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.list.length = 0; this.boltMesh.count = 0; this.stoneMesh.count = 0; }
}
