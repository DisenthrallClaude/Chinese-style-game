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

// 毒瓮：束口鼓腹的小陶罐，颈上还缠着一道封绳
function jarGeo() {
  const list = [
    T(sphere(0.30, 10, 8, 1.0), 0, 0, 0, 0, 0, 0),
    T(cyl(0.12, 0.19, 0.22, 8, 1.0), 0, 0.30, 0),
    T(cyl(0.17, 0.15, 0.07, 8, 1.0), 0, 0.42, 0),
    T(cyl(0.32, 0.32, 0.05, 10, 1.0), 0, 0.02, 0),
  ];
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
    // 毒瓮：一只封了口的小陶罐，飞在空中还渗着绿气
    this.jarMat = new THREE.MeshStandardMaterial({
      color: 0x4a5424, emissive: new THREE.Color(0xa8e030), emissiveIntensity: 0.55,
      roughness: 0.72, metalness: 0.08,
    });
    this.jarMesh = new THREE.InstancedMesh(jarGeo(), this.jarMat, 60);
    // 蛊：一团挤在一起的虫子，通体幽紫
    this.guMat = new THREE.MeshStandardMaterial({
      color: 0x3a1c48, emissive: new THREE.Color(0xc86ae8), emissiveIntensity: 1.6,
      roughness: 0.5, metalness: 0.2,
    });
    this.guMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1), this.guMat, 80);
    for (const m of [this.boltMesh, this.stoneMesh, this.jarMesh, this.guMesh]) {
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
      venom: opts.venom || 0, venomTime: opts.venomTime || 0,
      sunder: opts.sunder || 0, poolTime: opts.poolTime || 0,
      stacks: opts.stacks || 0, stackDmg: opts.stackDmg || 0,
      stackMax: opts.stackMax || 0, hop: opts.hop || 0,
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
    let nb = 0, ns = 0, nj = 0, ng = 0;
    for (const p of this.list) {
      this._p.set(p.x, p.y, p.z);
      if (p.kind === 'bolt') {
        this._d.set(p.tx - p.x, p.ty - p.y, p.tz - p.z).normalize();
        this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._d);
        this._m.compose(this._p, this._q, this._s);
        if (nb < this.max) this.boltMesh.setMatrixAt(nb++, this._m);
      } else if (p.kind === 'jar') {
        this._q.setFromEuler(new THREE.Euler(p.spin * 0.6, p.spin, p.spin * 0.4));
        this._m.compose(this._p, this._q, this._s);
        if (nj < 60) this.jarMesh.setMatrixAt(nj++, this._m);
      } else if (p.kind === 'gu') {
        // 虫团一路在抖
        const w = 1 + Math.sin(p.spin * 3.1) * 0.22;
        this._q.setFromEuler(new THREE.Euler(p.spin * 1.7, p.spin * 2.3, 0));
        this._m.compose(this._p, this._q, this._s.set(w, 2 - w, w));
        if (ng < 80) this.guMesh.setMatrixAt(ng++, this._m);
        this._s.set(1, 1, 1);
      } else {
        this._q.setFromEuler(new THREE.Euler(p.spin, p.spin * 0.7, 0));
        this._m.compose(this._p, this._q, this._s);
        if (ns < 90) this.stoneMesh.setMatrixAt(ns++, this._m);
      }
    }
    this.boltMesh.count = nb;
    this.stoneMesh.count = ns;
    this.jarMesh.count = nj;
    this.guMesh.count = ng;
    if (nb) this.boltMesh.instanceMatrix.needsUpdate = true;
    if (ns) this.stoneMesh.instanceMatrix.needsUpdate = true;
    if (nj) this.jarMesh.instanceMatrix.needsUpdate = true;
    if (ng) this.guMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.boltMesh.count = 0; this.stoneMesh.count = 0;
    this.jarMesh.count = 0; this.guMesh.count = 0;
  }
}
