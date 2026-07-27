// 机关 —— 造型、瞄准、开火、升阶，以及贯通全谷的机力网络
import * as THREE from 'three';
import { Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { box, cyl, cone, sphere, torus, plane, T, beam } from '../world/geo.js';
import { gearGeo, ringGeo } from '../world/machinery.js';
import { getMaterials } from '../world/materials.js';
import { TOWER_BY_ID, TOWERS, ELEMENTS, RULES } from './config.js';
import { GroundBlobs } from './beasts.js';

function mergeList(list) {
  let count = 0, icount = 0;
  for (const g of list) { count += g.attributes.position.count; icount += g.index.count; }
  const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2), nor = new Float32Array(count * 3);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

/* ============================================================
   造型
   ============================================================ */
function makeBase(M, r = 1.9, h = 0.5) {
  const parts = [];
  const p1 = cyl(r, r * 1.12, h, 10, 0.6); T(p1, 0, h / 2, 0); parts.push(p1);
  const p2 = cyl(r * 0.86, r * 0.9, h * 0.42, 10, 0.7); T(p2, 0, h + h * 0.2, 0); parts.push(p2);
  return new THREE.Mesh(mergeList(parts), M.stoneCut);
}

function buildModel(id, level, M) {
  const g = new THREE.Group();
  const lv = level;
  const base = makeBase(M, 1.9, 0.48);
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);

  const turret = new THREE.Group();
  turret.position.y = 0.68;
  g.add(turret);
  const spins = [];
  let muzzle = new THREE.Vector3(0, 1.4, 1.2);
  const wood = [], metal = [], accent = [];

  const push = (arr, geo) => arr.push(geo);

  if (id === 'crossbow') {
    // 转台
    push(wood, T(cyl(0.72, 0.86, 0.34, 10, 0.7), 0, 0.17, 0));
    push(wood, T(box(0.34, 0.9, 0.34, 0.8), 0, 0.72, -0.1));
    // 弓臂
    const arms = 1 + lv;
    for (let i = 0; i < arms; i++) {
      const y = 1.05 + i * 0.34;
      push(wood, T(box(3.0 + lv * 0.4, 0.11, 0.14, 0.8), 0, y, 0.5, 0, 0, 0));
      push(metal, T(box(3.1 + lv * 0.4, 0.035, 0.035, 1.6), 0, y - 0.13, 0.5));
      push(wood, T(box(0.16, 0.14, 1.5, 0.9), 0, y, 1.0));
    }
    // 箭匣
    push(wood, T(box(0.5, 0.55, 1.0, 0.8), 0, 1.5 + lv * 0.14, -0.2));
    push(metal, T(cyl(0.16, 0.16, 0.6, 8, 1.0), 0, 0.9, -0.55, Math.PI / 2, 0, 0));
    muzzle = new THREE.Vector3(0, 1.15 + lv * 0.15, 1.7);
  } else if (id === 'catapult') {
    push(wood, T(box(2.6, 0.28, 3.0, 0.6), 0, 0.14, 0));
    for (const s of [-1, 1]) {
      push(wood, T(box(0.24, 2.3, 0.24, 0.7), s * 0.95, 1.15, -0.2, 0.22, 0, 0));
      push(wood, T(box(0.2, 0.2, 2.2, 0.7), s * 0.95, 0.55, 0.4, -0.5, 0, 0));
    }
    // 抛臂（开火时摆动）
    const arm = new THREE.Group();
    arm.position.set(0, 2.05, -0.6);
    const armGeo = [];
    push(armGeo, T(box(0.22, 0.22, 3.4 + lv * 0.4, 0.7), 0, 0, 1.3));
    push(armGeo, T(box(0.55, 0.55, 0.55, 0.9), 0, 0, -0.85));
    const armMesh = new THREE.Mesh(mergeList(armGeo), M.woodDark);
    armMesh.castShadow = true;
    arm.add(armMesh);
    const bucket = new THREE.Mesh(cyl(0.34, 0.28, 0.32, 8, 0.9), M.iron);
    bucket.position.set(0, 0.2, 2.9 + lv * 0.4);
    arm.add(bucket);
    turret.add(arm);
    g.userData.arm = arm;
    push(metal, T(torus(0.42, 0.06, 5, 12, 0.8), 0, 2.05, -0.6, 0, Math.PI / 2, 0));
    muzzle = new THREE.Vector3(0, 3.4, 1.4);
  } else if (id === 'flame') {
    push(wood, T(cyl(0.62, 0.78, 0.5, 10, 0.7), 0, 0.25, 0));
    push(metal, T(cyl(0.30, 0.34, 2.0 + lv * 0.2, 10, 0.8), 0, 1.0, 0.9, Math.PI / 2.4, 0, 0));
    push(metal, T(cone(0.36, 0.5, 8, 0.9), 0, 1.35, 1.75, Math.PI / 2, 0, 0));
    // 风箱
    push(wood, T(box(1.0, 0.7, 1.2, 0.7), -0.85, 0.75, -0.5));
    push(wood, T(box(0.9, 0.55, 1.0, 0.7), 0.85, 0.7, -0.5));
    for (let i = 0; i <= lv; i++)
      push(metal, T(torus(0.36, 0.05, 5, 10, 1.0), 0, 1.0 + i * 0.06, 0.5 + i * 0.5, Math.PI / 2.4, 0, 0));
    muzzle = new THREE.Vector3(0, 1.45, 2.0);
  } else if (id === 'frost') {
    push(wood, T(cyl(1.5, 1.6, 0.34, 14, 0.6), 0, 0.17, 0));
    push(metal, T(cyl(1.2, 1.24, 0.7, 14, 0.7), 0, 0.5, 0));
    // 悬浮玉环
    for (let i = 0; i <= lv + 1; i++) {
      const r = new THREE.Mesh(torus(0.85 - i * 0.14, 0.075, 6, 22, 1.0), M.gold);
      r.castShadow = false;
      r.position.y = 1.1 + i * 0.42;
      r.rotation.x = Math.PI / 2;
      turret.add(r);
      spins.push({ o: r, axis: 'z', sp: (i % 2 ? -1 : 1) * (0.7 + i * 0.3) });
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), M.frostCore);
    core.position.y = 1.5;
    turret.add(core);
    spins.push({ o: core, axis: 'y', sp: 0.9 });
    muzzle = new THREE.Vector3(0, 1.5, 0);
  } else if (id === 'blade') {
    push(wood, T(cyl(0.6, 0.8, 1.5, 10, 0.6), 0, 0.75, 0));
    push(metal, T(cyl(0.28, 0.28, 0.6, 10, 0.9), 0, 1.7, 0));
    const bladeGeo = [];
    const R = 1.5 + lv * 0.25;
    push(bladeGeo, ringGeo(R, R * 0.82, 0.10, 22, 0.7));
    const nb = 6 + lv * 2;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      const bl = box(0.9, 0.06, 0.34, 1.0);
      T(bl, Math.cos(a) * (R + 0.35), Math.sin(a) * (R + 0.35), 0, 0, 0, a + 0.5);
      push(bladeGeo, bl);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sp = box(R, 0.08, 0.08, 0.8);
      T(sp, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a);
      push(bladeGeo, sp);
    }
    const bm = new THREE.Mesh(mergeList(bladeGeo), M.iron);
    bm.castShadow = true;
    bm.position.y = 1.5;
    bm.rotation.x = Math.PI / 2;
    turret.add(bm);
    spins.push({ o: bm, axis: 'z', sp: 4.2 + lv * 1.6 });
    muzzle = new THREE.Vector3(0, 1.5, 0);
  } else if (id === 'thunder') {
    push(wood, T(cyl(0.7, 0.9, 0.6, 10, 0.7), 0, 0.3, 0));
    push(metal, T(cyl(0.24, 0.34, 3.4 + lv * 0.5, 10, 0.7), 0, 2.0 + lv * 0.25, 0));
    for (let i = 0; i <= lv + 1; i++) {
      const c = new THREE.Mesh(torus(0.55 - i * 0.05, 0.09, 6, 18, 0.8), M.bronze);
      c.castShadow = false;
      c.position.y = 1.5 + i * 0.85;
      c.rotation.x = Math.PI / 2;
      turret.add(c);
      spins.push({ o: c, axis: 'z', sp: (i % 2 ? 1 : -1) * 1.4 });
    }
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44 + lv * 0.06, 1), M.thunderCore);
    orb.position.y = 3.9 + lv * 0.5;
    turret.add(orb);
    g.userData.orb = orb;
    muzzle = new THREE.Vector3(0, 3.9 + lv * 0.5, 0);
  } else if (id === 'wheel') {
    push(wood, T(box(2.2, 0.5, 1.4, 0.6), 0, 0.25, 0));
    for (const s of [-1, 1]) push(wood, T(box(0.22, 2.0, 0.22, 0.7), s * 0.9, 1.2, 0, 0, 0, s * 0.12));
    const R = 1.35 + lv * 0.2;
    const wl = [];
    for (const side of [-1, 1]) {
      const rim = ringGeo(R, R * 0.86, 0.13, 20, 0.6); T(rim, 0, 0, side * 0.42); wl.push(rim);
    }
    const np = 12 + lv * 2;
    for (let i = 0; i < np; i++) {
      const a = (i / np) * Math.PI * 2;
      const pd = box(0.55, 0.07, 0.95, 0.7);
      T(pd, Math.cos(a) * (R - 0.28), Math.sin(a) * (R - 0.28), 0, 0, 0, a + 0.4);
      wl.push(pd);
      const sp = box(R, 0.08, 0.08, 0.7);
      T(sp, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a);
      wl.push(sp);
    }
    const wm = new THREE.Mesh(mergeList(wl), M.woodDark);
    wm.castShadow = true;
    wm.position.y = 1.5;
    turret.add(wm);
    spins.push({ o: wm, axis: 'z', sp: 1.1 });
    const gr = new THREE.Mesh(gearGeo(0.55, 10, 0.16), M.iron);
    gr.castShadow = false;
    gr.position.set(0.95, 1.5, 0);
    turret.add(gr);
    spins.push({ o: gr, axis: 'z', sp: -2.6 });
    muzzle = new THREE.Vector3(0, 1.5, 0);
  } else if (id === 'windmill') {
    push(wood, T(cyl(0.42, 0.62, 3.2 + lv * 0.3, 10, 0.6), 0, 1.6 + lv * 0.15, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      push(wood, beam(0, 2.0, 0, Math.cos(a) * 1.2, 0.1, Math.sin(a) * 1.2, 0.12, 0.12, 0.7));
    }
    const R = 1.7 + lv * 0.25;
    const bl = [];
    bl.push(T(cyl(0.2, 0.2, 0.4, 8, 0.9), 0, 0, 0, Math.PI / 2, 0, 0));
    const nb = 4 + lv * 2;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      const arm = box(R, 0.09, 0.09, 0.8); T(arm, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a); bl.push(arm);
      const sail = box(R * 0.52, 0.7, 0.04, 0.8); T(sail, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, 0.12, 0, 0, a); bl.push(sail);
    }
    const bm = new THREE.Mesh(mergeList(bl), M.wood);
    bm.castShadow = true;
    bm.position.y = 3.2 + lv * 0.3;
    turret.add(bm);
    spins.push({ o: bm, axis: 'z', sp: 1.5 });
    muzzle = new THREE.Vector3(0, 3.2, 0);
  } else {  // relay
    push(wood, T(cyl(0.34, 0.5, 2.4 + lv * 0.4, 10, 0.6), 0, 1.2 + lv * 0.2, 0));
    push(wood, T(box(1.6, 0.16, 0.16, 0.8), 0, 2.2 + lv * 0.4, 0));
    for (let i = 0; i <= lv; i++) {
      const gr = new THREE.Mesh(gearGeo(0.46 + i * 0.08, 10 + i * 2, 0.14), i % 2 ? M.iron : M.woodDark);
      gr.castShadow = false;
      gr.position.set(i % 2 ? 0.5 : -0.5, 1.6 + i * 0.55, 0);
      turret.add(gr);
      spins.push({ o: gr, axis: 'z', sp: (i % 2 ? -1 : 1) * (2.0 + i) });
    }
    muzzle = new THREE.Vector3(0, 2.2, 0);
  }

  if (wood.length) {
    const m = new THREE.Mesh(mergeList(wood), M.woodDark);
    m.castShadow = true; m.receiveShadow = true;
    turret.add(m);
  }
  if (metal.length) {
    const m = new THREE.Mesh(mergeList(metal), M.iron);
    m.castShadow = true; m.receiveShadow = true;
    turret.add(m);
  }
  if (accent.length) {
    const m = new THREE.Mesh(mergeList(accent), M.bronze);
    m.castShadow = true;
    turret.add(m);
  }

  g.userData.turret = turret;
  g.userData.spins = spins;
  g.userData.muzzle = muzzle;
  return g;
}

/* ============================================================
   机关实体
   ============================================================ */
let tid = 1;
export class Tower {
  constructor(def, slot, M, scene) {
    this.id = tid++;
    this.def = def;
    this.slot = slot;
    this.level = 0;
    this.x = slot.x; this.y = slot.y; this.z = slot.z;
    this.cool = 0;
    this.angle = 0;
    this.recoil = 0;
    this.armAnim = 0;
    this.charge = 0;
    this.powered = false;
    this.disabled = 0;
    this.kills = 0;
    this.damageDone = 0;
    this.buildAnim = 0;
    this.model = buildModel(def.id, 0, M);
    this.model.position.set(this.x, this.y, this.z);
    scene.add(this.model);
    slot.tower = this;
    this.M = M;
    this.scene = scene;
    this._muzzleW = new THREE.Vector3();
  }

  get stats() { return this.def.up[this.level]; }
  get range() { return this.stats.range !== undefined ? this.stats.range : this.def.range; }
  get power() { return this.stats.power !== undefined ? this.stats.power : this.def.power; }
  get link() { return this.stats.link !== undefined ? this.stats.link : (this.def.link || 0); }
  get isGen() { return this.def.kind === 'gen'; }
  get isRelay() { return this.def.kind === 'relay'; }
  get isAttack() { return !this.isGen && !this.isRelay; }
  get value() {
    let v = this.def.cost;
    for (let i = 1; i <= this.level; i++) v += this.def.up[i].cost || 0;
    return v;
  }
  upgradeCost() {
    if (this.level >= this.def.up.length - 1) return null;
    return this.def.up[this.level + 1].cost || 0;
  }

  upgrade(scene) {
    if (this.level >= this.def.up.length - 1) return false;
    this.level++;
    this.scene.remove(this.model);
    disposeModel(this.model);
    this.model = buildModel(this.def.id, this.level, this.M);
    this.model.position.set(this.x, this.y, this.z);
    this.model.rotation.y = 0;
    this.scene.add(this.model);
    this.buildAnim = 0;
    return true;
  }

  muzzleWorld() {
    const m = this.def.kind === 'ring' || this.def.kind === 'field'
      ? this.model.userData.muzzle : this.model.userData.muzzle;
    this._muzzleW.copy(m);
    this._muzzleW.applyEuler(new THREE.Euler(0, this.angle, 0));
    this._muzzleW.add(this.model.position);
    this._muzzleW.y += 0.68;
    return this._muzzleW;
  }

  dispose(scene) {
    scene.remove(this.model);
    disposeModel(this.model);
    this.slot.tower = null;
  }
}

function disposeModel(g) {
  g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
}

/* ============================================================
   机力网络的连线可视化
   ============================================================ */
const linkVert = /* glsl */`
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  void main() {
    vT = aT; vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const linkFrag = /* glsl */`
  precision highp float;
  varying float vT; varying float vSeed;
  uniform float uTime, uAlpha;
  uniform vec3 uColor;
  void main() {
    float flow = fract(vT * 2.4 - uTime * 0.9 + vSeed);
    float pulse = pow(1.0 - abs(flow * 2.0 - 1.0), 5.0);
    float base = 0.16;
    float a = (base + pulse * 0.9) * uAlpha;
    if (a < 0.006) discard;
    gl_FragColor = vec4(uColor * (0.6 + pulse * 1.9), a);
  }
`;

export class PowerLinks {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAlpha: { value: 0.9 },
        uColor: { value: new THREE.Color(0xffc36a) },
      },
      vertexShader: linkVert, fragmentShader: linkFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.shaftGroup = new THREE.Group();
    scene.add(this.shaftGroup);
    this.shaftMesh = null;
  }

  rebuild(links, M) {
    const pos = [], ts = [], seeds = [], idx = [];
    const shafts = [];
    let n = 0;
    const up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), s = new THREE.Vector3();
    for (let li = 0; li < links.length; li++) {
      const L = links[li];
      a.set(L.ax, L.ay, L.az); b.set(L.bx, L.by, L.bz);
      d.copy(b).sub(a);
      const len = d.length();
      if (len < 0.2) continue;
      d.normalize();
      s.copy(d).cross(up).normalize().multiplyScalar(0.16);
      const segs = Math.max(2, Math.round(len / 3));
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const px = lerp(L.ax, L.bx, t), py = lerp(L.ay, L.by, t) + Math.sin(t * Math.PI) * 0.35, pz = lerp(L.az, L.bz, t);
        pos.push(px - s.x, py - s.y, pz - s.z, px + s.x, py + s.y, pz + s.z);
        ts.push(t, t); seeds.push(li * 0.37, li * 0.37);
      }
      for (let i = 0; i < segs; i++) {
        const q = n + i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
      n += (segs + 1) * 2;
      shafts.push(beam(L.ax, L.ay, L.az, L.bx, L.by, L.bz, 0.075, 0.075, 1.4));
    }
    this.geo.dispose();
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    this.geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 600);
    this.mesh.geometry = this.geo;

    if (this.shaftMesh) {
      this.shaftGroup.remove(this.shaftMesh);
      this.shaftMesh.geometry.dispose();
      this.shaftMesh = null;
    }
    if (shafts.length) {
      this.shaftMesh = new THREE.Mesh(mergeList(shafts), M.iron);
      this.shaftMesh.castShadow = false;
      this.shaftGroup.add(this.shaftMesh);
    }
  }

  update(t, alpha) {
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uAlpha.value = alpha;
  }
}

/* ============================================================
   机关总管：放置、网络求解、开火
   ============================================================ */
export class TowerManager {
  constructor(scene, terrain, grid, game) {
    this.scene = scene;
    this.terrain = terrain;
    this.grid = grid;
    this.game = game;
    this.M = getMaterials();
    // 两个特殊发光材质
    this.M.frostCore = new THREE.MeshStandardMaterial({
      color: 0x1a3a4a, emissive: new THREE.Color(0x6ad8ff), emissiveIntensity: 2.2,
      roughness: 0.25, metalness: 0.4,
    });
    this.M.thunderCore = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a, emissive: new THREE.Color(0xaad4ff), emissiveIntensity: 2.6,
      roughness: 0.2, metalness: 0.6,
    });
    this.towers = [];
    this.links = new PowerLinks(scene);
    this.blobs = new GroundBlobs(scene, 140);
    this.supply = 0;
    this.demand = 0;
    this.efficiency = 1;
    this.networkDirty = true;
    this._tmp = new THREE.Vector3();
  }

  canPlaceAt(def, slot) {
    if (!slot || slot.tower) return false;
    if (def.needs === 'water' && slot.type !== 'water') return false;
    if (def.needs === 'open' && slot.type === 'water') return false;
    return true;
  }

  place(defId, slot) {
    const def = TOWER_BY_ID[defId];
    if (!this.canPlaceAt(def, slot)) return null;
    const t = new Tower(def, slot, this.M, this.scene);
    this.towers.push(t);
    this.networkDirty = true;
    return t;
  }

  sell(tower) {
    const i = this.towers.indexOf(tower);
    if (i < 0) return 0;
    this.towers.splice(i, 1);
    const refund = Math.round(tower.value * RULES.sellRatio);
    tower.dispose(this.scene);
    this.networkDirty = true;
    return refund;
  }

  // 广度优先：从发力机关出发，沿连接半径把机力送到各处
  solveNetwork() {
    this.networkDirty = false;
    const towers = this.towers;
    for (const t of towers) t.powered = false;
    const gens = towers.filter(t => t.isGen);
    const nodes = towers.filter(t => t.isGen || t.isRelay);
    const linkList = [];
    const queue = [];
    for (const g of gens) { g.powered = true; queue.push(g); }
    const visited = new Set(gens.map(g => g.id));
    while (queue.length) {
      const n = queue.shift();
      const r = n.link;
      const r2 = r * r;
      for (const other of nodes) {
        if (visited.has(other.id)) continue;
        const dx = other.x - n.x, dz = other.z - n.z, dy = other.y - n.y;
        if (dx * dx + dz * dz + dy * dy * 0.25 <= r2) {
          visited.add(other.id);
          other.powered = true;
          queue.push(other);
          linkList.push({ ax: n.x, ay: n.y + 1.6, az: n.z, bx: other.x, by: other.y + 1.6, bz: other.z });
        }
      }
    }
    // 攻击机关接到任一通电节点上
    for (const t of towers) {
      if (!t.isAttack) continue;
      let best = null, bd = Infinity;
      for (const n of nodes) {
        if (!n.powered) continue;
        const dx = t.x - n.x, dz = t.z - n.z, dy = t.y - n.y;
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (d <= n.link * n.link && d < bd) { bd = d; best = n; }
      }
      if (best) {
        t.powered = true;
        linkList.push({ ax: best.x, ay: best.y + 1.6, az: best.z, bx: t.x, by: t.y + 1.4, bz: t.z });
      }
    }

    let supply = 0, demand = 0;
    for (const t of towers) {
      const p = t.power;
      if (p < 0) supply += -p;
      else if (t.powered) demand += p;
    }
    this.supply = supply;
    this.demand = demand;
    this.efficiency = demand <= 0 ? 1 : clamp(supply / demand, RULES.minEfficiency, 1);
    this.links.rebuild(linkList, this.M);
  }

  update(dt, t, enemies, showLinks) {
    if (this.networkDirty) this.solveNetwork();
    const eff = this.game.surge > 0 ? 1 : this.efficiency;
    const nightBonus = this.game.dayNight.isNight ? RULES.nightFireBonus : 0;
    const surge = this.game.surge > 0 ? 0.7 : 0;
    const rateMult = eff * (1 + nightBonus + surge);

    this.blobs.begin();
    for (const tw of this.towers) {
      tw.buildAnim = Math.min(1, tw.buildAnim + dt * 3.2);
      const s = smoothstep(0, 1, tw.buildAnim);
      tw.model.scale.setScalar(0.15 + s * 0.85);
      tw.model.position.y = tw.y - (1 - s) * 1.2;
      this.blobs.add(tw.x, tw.y, tw.z, 2.5 * s, 0.40 * s);

      if (tw.disabled > 0) { tw.disabled -= dt; }
      const active = tw.powered && tw.disabled <= 0;

      // 转动件
      const spinRate = (tw.isGen ? 1 : (active ? rateMult : 0.05)) * (tw.isGen ? 1 : 1);
      for (const sp of tw.model.userData.spins) {
        sp.o.rotation[sp.axis] += sp.sp * dt * (tw.isGen ? 1 : Math.max(0.08, spinRate));
      }
      if (tw.model.userData.orb) {
        tw.model.userData.orb.material.emissiveIntensity = active ? 2.2 + Math.sin(t * 6 + tw.id) * 0.9 : 0.15;
      }

      if (!tw.isAttack) continue;
      if (!active) { tw.cool = Math.max(tw.cool, 0.25); continue; }

      // 回复动画
      tw.recoil = Math.max(0, tw.recoil - dt * 4.5);
      if (tw.armAnim > 0) {
        tw.armAnim = Math.max(0, tw.armAnim - dt * 2.6);
        const arm = tw.model.userData.arm;
        if (arm) arm.rotation.x = -1.45 * Math.sin(tw.armAnim * Math.PI);
      }

      const st = tw.stats;
      const rate = (st.rate !== undefined ? st.rate : tw.def.rate) * rateMult;
      tw.cool -= dt;

      // 瞄准
      const range = tw.range;
      let target = null;
      if (tw.def.kind === 'ring' || tw.def.kind === 'field') {
        target = enemies.nearestAhead(tw.x, tw.z, range);
      } else {
        target = enemies.nearestAhead(tw.x, tw.z, range);
      }
      if (target) {
        const want = Math.atan2(target.x - tw.x, target.z - tw.z);
        let d = want - tw.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        tw.angle += clamp(d, -dt * 5.2, dt * 5.2);
        if (tw.def.kind !== 'ring' && tw.def.kind !== 'field') {
          tw.model.rotation.y = tw.angle;
        }
      }
      const turret = tw.model.userData.turret;
      if (turret) turret.position.z = -tw.recoil * 0.35;

      if (tw.cool <= 0 && (target || tw.def.kind === 'ring' || tw.def.kind === 'field')) {
        const fired = this.game.fire(tw, target, enemies);
        if (fired) {
          tw.cool = 1 / Math.max(0.05, rate);
          tw.recoil = 1;
          if (tw.def.kind === 'splash') tw.armAnim = 1;
        } else {
          tw.cool = 0.12;
        }
      }
    }

    this.blobs.end();
    this.links.update(t, showLinks ? 0.95 : 0.30);
    this.links.shaftGroup.visible = true;
  }

  clear() {
    for (const t of this.towers) t.dispose(this.scene);
    this.towers.length = 0;
    this.networkDirty = true;
    this.solveNetwork();
  }
}

export { buildModel };
