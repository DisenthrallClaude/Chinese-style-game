// 机关 —— 造型、瞄准、开火、升阶，以及贯通全谷的机力网络
import * as THREE from 'three';
import { Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { box, cyl, cone, sphere, torus, plane, frustum, T, beam } from '../world/geo.js';
import { gearGeo, ringGeo } from '../world/machinery.js';
import { getMaterials } from '../world/materials.js';
import { TOWER_BY_ID, TOWERS, ELEMENTS, RULES } from './config.js';
import { GroundBlobs } from './beasts.js';
import { LEVEL, distToRiver } from '../world/layout.js';

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
// 须弥座：圭角 + 下枭 + 束腰 + 上枭 + 压面石。
// 所有机关共用这一副台基，八角、有束腰、四角还嵌着与本气同色的宝石，
// 远看一眼就知道这是哪一门机关。
function makeBase(M, r = 1.9, h = 0.5) {
  const parts = [];
  // 圭角：八角落地的小方墩
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(T(box(r * 0.40, h * 0.34, r * 0.40, 0.9),
      Math.cos(a) * r * 0.90, h * 0.17, Math.sin(a) * r * 0.90, 0, -a, 0));
  }
  parts.push(T(cyl(r * 1.02, r * 1.06, h * 0.34, 8, 0.6), 0, h * 0.17, 0));      // 地栿
  parts.push(T(frustum(r * 1.78, r * 1.78, r * 2.02, r * 2.02, h * 0.30, 0.45), 0, h * 0.49, 0)); // 下枭
  parts.push(T(cyl(r * 0.80, r * 0.80, h * 0.46, 8, 0.7), 0, h * 0.87, 0));      // 束腰
  parts.push(T(frustum(r * 1.94, r * 1.94, r * 1.66, r * 1.66, h * 0.30, 0.45), 0, h * 1.25, 0)); // 上枭
  parts.push(T(box(r * 2.10, h * 0.20, r * 2.10, 0.55), 0, h * 1.50, 0, 0, Math.PI / 8, 0));      // 压面
  // 束腰上的八根小柱，砖缝的层次靠它撑起来
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(T(box(r * 0.13, h * 0.44, r * 0.13, 1.1),
      Math.cos(a) * r * 0.82, h * 0.87, Math.sin(a) * r * 0.82, 0, -a, 0));
  }
  return new THREE.Mesh(mergeList(parts), M.stoneCut);
}

// 每一门气的自发光材质，缓存在材质库里。
// 缓存键必须带上强度 —— 同一门气的「眼睛」与「一渠水」亮度差着好几倍，
// 只按元素缓存的话后来的那个会被前一个的强度吃掉。
function elMat(M, el, strength = 1.2) {
  const key = '_el_' + el + '_' + strength.toFixed(2);
  if (!M[key]) {
    const E = ELEMENTS[el] || ELEMENTS.none;
    M[key] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(E.color).multiplyScalar(0.22),
      emissive: new THREE.Color(E.glow),
      emissiveIntensity: strength,
      roughness: 0.34, metalness: 0.35,
    });
  }
  return M[key];
}

function buildModel(id, level, M) {
  const g = new THREE.Group();
  const lv = level;
  const base = makeBase(M, 1.9, 0.48);
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);

  const turret = new THREE.Group();
  turret.position.y = 0.74;
  g.add(turret);
  const spins = [];
  let muzzle = new THREE.Vector3(0, 1.4, 1.2);
  const wood = [], metal = [], accent = [];

  const push = (arr, geo) => arr.push(geo);

  // 台基四角的气石：本门机关的属性色，夜里看得见
  const def = TOWER_BY_ID[id];
  if (def && def.el && def.el !== 'none') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), elMat(M, def.el, 0.9));
    gem.castShadow = false;
    gem.position.set(0, -0.22, 1.62);
    turret.add(gem);
    spins.push({ o: gem, axis: 'y', sp: 1.1 });
    for (const a of [Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
      const m2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), elMat(M, def.el, 0.9));
      m2.castShadow = false;
      m2.position.set(Math.sin(a) * 1.62, -0.22, Math.cos(a) * 1.62);
      turret.add(m2);
      spins.push({ o: m2, axis: 'y', sp: -0.8 });
    }
  }

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
  } else if (id === 'gust') {
    // 飓风橐 —— 橐龠鼓风。皮橐一鼓一收，风从铜龠里旋着吐出去
    push(wood, T(cyl(0.80, 0.96, 0.42, 10, 0.7), 0, 0.21, 0));
    for (const s of [-1, 1]) {
      push(wood, T(box(0.22, 1.9, 0.22, 0.7), s * 0.86, 1.05, -0.35, 0.10, 0, 0));
      push(wood, T(box(0.18, 0.18, 1.7, 0.8), s * 0.86, 1.95, 0.25));
    }
    // 皮橐：一阶一具，逐具后移，都在鼓动
    const nBag = 1 + lv;
    for (let i = 0; i < nBag; i++) {
      const bag = new THREE.Mesh(box(1.28 - i * 0.10, 0.92 - i * 0.06, 1.35, 0.7), M.woodDark);
      bag.castShadow = true;
      bag.position.set(0, 1.16 + i * 0.02, -0.55 - i * 1.05);
      turret.add(bag);
      spins.push({ o: bag, axis: 'z', sp: 0, pump: 1.0, phase: i * 1.9 });
      // 橐上的箍与拉杆
      push(metal, T(torus(0.70 - i * 0.05, 0.045, 5, 12, 1.0), 0, 1.16, -0.55 - i * 1.05, Math.PI / 2, 0, 0));
      push(wood, T(box(0.10, 0.10, 0.9, 0.9), 0, 1.72, -0.55 - i * 1.05, 0.3, 0, 0));
    }
    // 铜龠：束颈之后猛地张口
    push(metal, T(cyl(0.34, 0.52, 1.25, 12, 0.8), 0, 1.16, 0.62, Math.PI / 2, 0, 0));
    push(metal, T(cyl(0.72, 0.34, 0.85, 12, 0.8), 0, 1.16, 1.62, Math.PI / 2, 0, 0));
    push(accent, T(torus(0.74, 0.075, 6, 16, 1.0), 0, 1.16, 1.98, Math.PI / 2, 0, 0));
    // 龠口里的螺旋叶：风就是被它绞出来的
    const vane = [];
    const nv = 5 + lv;
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * Math.PI * 2;
      const bl = box(0.60, 0.05, 0.34, 1.0);
      T(bl, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, 0, 0, a + 0.7);
      vane.push(bl);
    }
    vane.push(T(cyl(0.10, 0.10, 0.42, 8, 1.0), 0, 0, 0, Math.PI / 2, 0, 0));
    const vm = new THREE.Mesh(mergeList(vane), M.bronze);
    vm.castShadow = false;
    vm.position.set(0, 1.16, 1.72);
    turret.add(vm);
    spins.push({ o: vm, axis: 'z', sp: 7.5 + lv * 2.5 });
    // 檐角的风幡：一眼看出是吃风的
    for (const s of [-1, 1]) {
      push(wood, T(cyl(0.055, 0.055, 1.1, 5, 1.2), s * 0.98, 2.35, 0.25));
      push(accent, T(plane(0.34, 0.72, 1.2), s * 0.98, 2.62, 0.42, 0, s * 0.5, 0));
    }
    muzzle = new THREE.Vector3(0, 1.90, 2.1);
  } else if (id === 'venom') {
    // 百毒瓮 —— 三足石鼎里熬着瘴，长臂把封好的陶瓮甩出去
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      push(metal, T(cyl(0.14, 0.20, 1.05, 7, 0.7), Math.cos(a) * 0.86, 0.52, Math.sin(a) * 0.86, 0.10, 0, 0));
      push(metal, T(box(0.26, 0.16, 0.34, 0.9), Math.cos(a) * 0.94, 0.06, Math.sin(a) * 0.94, 0, -a, 0));
    }
    push(metal, T(frustum(1.55, 1.55, 1.05, 1.05, 0.95 + lv * 0.08, 0.5), 0, 1.52, 0));
    push(accent, T(torus(0.80, 0.085, 6, 16, 1.0), 0, 1.98, 0, Math.PI / 2, 0, 0));
    for (const s of [-1, 1]) push(accent, T(torus(0.22, 0.05, 5, 10, 1.0), s * 0.82, 1.86, 0, 0, Math.PI / 2, 0));
    // 鼎里那一汪绿
    const brew = new THREE.Mesh(cyl(0.72, 0.72, 0.10, 14, 1.0), elMat(M, 'poison', 0.62));
    brew.castShadow = false;
    brew.position.y = 1.96;
    turret.add(brew);
    // 甩瓮的长臂
    const arm = new THREE.Group();
    arm.position.set(0, 1.55, -0.85);
    const armGeo = [];
    push(armGeo, T(box(0.17, 0.17, 2.5 + lv * 0.3, 0.8), 0, 0, 1.05));
    push(armGeo, T(box(0.40, 0.40, 0.40, 1.0), 0, 0, -0.62));
    const armMesh = new THREE.Mesh(mergeList(armGeo), M.woodDark);
    armMesh.castShadow = true;
    arm.add(armMesh);
    const cradle = new THREE.Mesh(cyl(0.30, 0.24, 0.30, 8, 1.0), M.iron);
    cradle.position.set(0, 0.16, 2.15 + lv * 0.3);
    arm.add(cradle);
    turret.add(arm);
    g.userData.arm = arm;
    for (const s of [-1, 1]) push(wood, T(box(0.18, 1.5, 0.18, 0.8), s * 0.62, 0.95, -0.85, -0.18, 0, 0));
    // 备用的毒瓮，码在一旁
    for (let i = 0; i <= lv + 1; i++) {
      const a = 2.1 + i * 0.7;
      const jx = Math.cos(a) * 1.35, jz = Math.sin(a) * 1.35;
      push(wood, T(sphere(0.26, 8, 6, 1.0), jx, 0.28, jz));
      push(wood, T(cyl(0.10, 0.15, 0.18, 6, 1.0), jx, 0.54, jz));
      const cap = new THREE.Mesh(cyl(0.12, 0.12, 0.05, 6, 1.0), elMat(M, 'poison', 0.75));
      cap.castShadow = false;
      cap.position.set(jx, 0.64, jz);
      turret.add(cap);
    }
    muzzle = new THREE.Vector3(0, 2.6, 1.2);
  } else if (id === 'gu') {
    // 万蛊坛 —— 铁箍缠身的大坛，坛口虚掩，幽紫的虫气从缝里溢出来
    push(wood, T(cyl(1.05, 1.20, 0.32, 12, 0.7), 0, 0.16, 0));
    const H = 1.65 + lv * 0.2;
    push(wood, T(frustum(1.12, 1.12, 0.86, 0.86, H * 0.55, 0.45), 0, 0.32 + H * 0.275, 0));
    push(wood, T(frustum(0.74, 0.74, 1.14, 1.14, H * 0.45, 0.45), 0, 0.32 + H * 0.775, 0));
    for (let i = 0; i <= lv + 2; i++) {
      const t = i / (lv + 2);
      push(metal, T(torus(0.60 + Math.sin(t * Math.PI) * 0.44, 0.055, 5, 16, 1.0),
        0, 0.42 + t * H * 0.94, 0, Math.PI / 2, 0, 0));
    }
    // 坛口：微微掀起的盖子与底下的光
    const mouth = new THREE.Mesh(cyl(0.62, 0.62, 0.08, 14, 1.0), elMat(M, 'gu', 0.85));
    mouth.castShadow = false;
    mouth.position.y = 0.34 + H;
    turret.add(mouth);
    push(wood, T(cyl(0.70, 0.62, 0.16, 12, 0.9), 0.16, 0.34 + H + 0.26, 0.10, 0.20, 0, 0.14));
    push(accent, T(sphere(0.11, 7, 6, 1.2), 0.16, 0.34 + H + 0.40, 0.10));
    // 绕坛口盘旋的蛊虫
    const swarm = new THREE.Group();
    const bugs = [];
    const nb = 7 + lv * 4;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 * 2.4;
      const rr = 0.85 + (i % 3) * 0.22;
      const b = box(0.13, 0.07, 0.20, 1.4);
      T(b, Math.cos(a) * rr, ((i % 4) - 1.5) * 0.16, Math.sin(a) * rr, 0, -a, 0);
      bugs.push(b);
    }
    const bugMesh = new THREE.Mesh(mergeList(bugs), elMat(M, 'gu', 0.55));
    bugMesh.castShadow = false;
    swarm.add(bugMesh);
    swarm.position.y = 0.34 + H + 0.12;
    turret.add(swarm);
    spins.push({ o: swarm, axis: 'y', sp: 2.1 + lv * 0.6 });
    // 陪坛
    for (let i = 0; i <= lv; i++) {
      const a = 2.4 + i * 1.5;
      const px = Math.cos(a) * 1.45, pz = Math.sin(a) * 1.45;
      push(wood, T(frustum(0.46, 0.46, 0.34, 0.34, 0.62, 0.6), px, 0.31, pz));
      push(metal, T(torus(0.24, 0.035, 5, 10, 1.2), px, 0.44, pz, Math.PI / 2, 0, 0));
      const lid = new THREE.Mesh(cyl(0.24, 0.24, 0.05, 8, 1.0), elMat(M, 'gu', 0.7));
      lid.castShadow = false;
      lid.position.set(px, 0.64, pz);
      turret.add(lid);
    }
    muzzle = new THREE.Vector3(0, 0.34 + H + 0.2, 0.5);
  } else if (id === 'shade') {
    // 幽冥幡 —— 一杆玄幡，幡影所覆处天光尽敛
    push(metal, T(frustum(1.15, 1.15, 1.45, 1.45, 0.36, 0.5), 0, 0.18, 0));
    const PH = 4.0 + lv * 0.55;
    push(wood, T(cyl(0.13, 0.19, PH, 9, 0.6), 0, 0.36 + PH / 2, 0));
    // 横杆与幡首
    push(wood, T(box(2.1 + lv * 0.35, 0.11, 0.11, 0.9), 0, 0.36 + PH * 0.92, 0));
    push(accent, T(cone(0.15, 0.52, 6, 1.0), 0, 0.36 + PH + 0.30, 0));
    for (const s of [-1, 1]) push(accent, T(sphere(0.09, 7, 6, 1.2), s * (1.05 + lv * 0.18), 0.36 + PH * 0.92, 0));
    // 幡面：一阶一幅，长短错开
    const nf = 1 + lv;
    for (let i = 0; i < nf; i++) {
      const px = nf === 1 ? 0 : (i / (nf - 1) - 0.5) * (1.7 + lv * 0.3);
      const fh = 2.4 - Math.abs(px) * 0.35;
      const cloth = new THREE.Mesh(plane(0.78, fh, 1.0), M.shadeCloth);
      cloth.castShadow = false;
      cloth.position.set(px, 0.36 + PH * 0.92 - fh / 2 - 0.12, 0.02);
      turret.add(cloth);
      spins.push({ o: cloth, axis: 'y', sp: 0, sway: 0.14, phase: i * 1.3 });
      // 幡下的坠子
      push(accent, T(sphere(0.07, 6, 5, 1.2), px, 0.36 + PH * 0.92 - fh - 0.22, 0.02));
    }
    // 幡心的幽珠与绕行的鬼火
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30 + lv * 0.05, 1), elMat(M, 'dark', 1.1));
    orb.position.y = 0.36 + PH * 0.62;
    turret.add(orb);
    g.userData.orb = orb;
    for (let i = 0; i <= lv + 1; i++) {
      const holder = new THREE.Group();
      const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.105, 0), elMat(M, 'dark', 1.5));
      fire.castShadow = false;
      fire.position.set(0.95 + i * 0.24, 0, 0);
      holder.add(fire);
      holder.position.y = 0.36 + PH * (0.40 + i * 0.14);
      holder.rotation.z = i * 0.4;
      turret.add(holder);
      spins.push({ o: holder, axis: 'y', sp: (i % 2 ? -1 : 1) * (1.0 + i * 0.4) });
    }
    // 拉索
    for (const s of [-1, 1]) {
      push(metal, beam(s * 1.0, 0.40, 0, 0, 0.36 + PH * 0.55, 0, 0.035, 0.035, 1.4));
      push(metal, T(cyl(0.10, 0.14, 0.26, 6, 1.0), s * 1.0, 0.40, 0));
    }
    muzzle = new THREE.Vector3(0, 0.36 + PH * 0.62, 0);
  } else if (id === 'sumeru') {
    // 须弥壶 —— 莲座托一只玉壶，壶口之上悬着一座小小的须弥山
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      push(accent, T(cone(0.30, 0.52, 5, 1.0), Math.cos(a) * 0.82, 0.26, Math.sin(a) * 0.82, 0.9, -a, 0));
    }
    push(metal, T(cyl(0.86, 1.00, 0.30, 12, 0.7), 0, 0.15, 0));
    // 壶：下腹大、上腹小、束颈
    push(metal, T(sphere(0.86, 14, 10, 0.8), 0, 1.15, 0, 0, 0, 0, 1, 0.86, 1));
    push(metal, T(sphere(0.56, 12, 9, 0.8), 0, 1.92, 0, 0, 0, 0, 1, 0.82, 1));
    push(metal, T(cyl(0.26, 0.34, 0.34, 10, 0.9), 0, 1.62, 0));
    push(accent, T(torus(0.40, 0.06, 6, 14, 1.0), 0, 1.62, 0, Math.PI / 2, 0, 0));
    push(metal, T(cyl(0.40, 0.30, 0.26, 10, 0.9), 0, 2.32, 0));
    push(accent, T(torus(0.42, 0.055, 6, 16, 1.0), 0, 2.44, 0, Math.PI / 2, 0, 0));
    // 壶口的虚空：一片吞光的黑
    const maw = new THREE.Mesh(cyl(0.33, 0.33, 0.04, 14, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x0a0714 }));
    maw.castShadow = false;
    maw.position.y = 2.47;
    turret.add(maw);
    // 悬在壶口上的须弥山：上宽下窄的倒锥台，正是经里说的样子
    const peak = new THREE.Group();
    const pk = [];
    push(pk, T(frustum(0.70, 0.70, 0.26, 0.26, 0.62, 0.6), 0, 0.31, 0));
    push(pk, T(frustum(0.44, 0.44, 0.74, 0.74, 0.34, 0.6), 0, 0.79, 0));
    push(pk, T(cone(0.30, 0.44, 6, 0.8), 0, 1.16, 0));
    const pkMesh = new THREE.Mesh(mergeList(pk), elMat(M, 'void', 0.55));
    pkMesh.castShadow = false;
    peak.add(pkMesh);
    peak.position.y = 2.92 + lv * 0.12;
    turret.add(peak);
    spins.push({ o: peak, axis: 'y', sp: 0.55 });
    // 环壶而转的玉璧，一阶一重
    for (let i = 0; i <= lv; i++) {
      const holder = new THREE.Group();
      const rg = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.34, 0.055, 7, 30), M.gold);
      rg.castShadow = false;
      holder.add(rg);
      holder.position.y = 2.0 + i * 0.42;
      holder.rotation.set(1.2 - i * 0.35, 0, i * 0.5);
      turret.add(holder);
      spins.push({ o: holder, axis: i % 2 ? 'x' : 'y', sp: (i % 2 ? -1 : 1) * (0.6 + i * 0.45) });
    }
    muzzle = new THREE.Vector3(0, 2.5, 0);
  } else if (id === 'torrent') {
    // 蛟龙渠 —— 石渠架在木撑上，渠首一颗蛟首，水从它口里射出去
    push(wood, T(box(1.9, 0.30, 3.2, 0.5), 0, 0.15, -0.2));
    for (const s of [-1, 1]) {
      push(wood, T(box(0.20, 1.25, 0.20, 0.7), s * 0.72, 0.78, -1.05, -0.16, 0, 0));
      push(wood, T(box(0.16, 0.16, 1.6, 0.8), s * 0.72, 1.30, 0.10, 0.18, 0, 0));
    }
    // 石渠：一道上翘的槽
    push(metal, T(box(1.05, 0.20, 3.0, 0.5), 0, 1.32, 0.35, 0.16, 0, 0));
    for (const s of [-1, 1]) push(metal, T(box(0.14, 0.42, 3.0, 0.6), s * 0.52, 1.46, 0.35, 0.16, 0, 0));
    // 渠里的水
    const flow = new THREE.Mesh(box(0.86, 0.07, 2.7, 0.6), elMat(M, 'water', 0.5));
    flow.castShadow = false;
    flow.position.set(0, 1.45, 0.35);
    flow.rotation.x = 0.16;
    turret.add(flow);
    // 蛟首：额、吻、下颌、角、须
    const nHead = 1 + lv;
    for (let i = 0; i < nHead; i++) {
      const hx = nHead === 1 ? 0 : (i / (nHead - 1) - 0.5) * 0.92;
      const hy = 1.72 - Math.abs(hx) * 0.16;
      const hz = 1.72 - Math.abs(hx) * 0.22;
      push(accent, T(box(0.46, 0.40, 0.62, 0.9), hx, hy, hz, -0.14, 0, 0));
      push(accent, T(frustum(0.30, 0.26, 0.42, 0.36, 0.52, 0.8), hx, hy - 0.06, hz + 0.52, Math.PI / 2 - 0.14, 0, 0));
      push(accent, T(box(0.34, 0.14, 0.42, 0.9), hx, hy - 0.22, hz + 0.44, -0.30, 0, 0));   // 下颌
      for (const s of [-1, 1]) {
        push(accent, T(cone(0.06, 0.40, 5, 1.0), hx + s * 0.17, hy + 0.32, hz - 0.10, -0.5, 0, s * 0.35));  // 角
        push(metal, T(cyl(0.022, 0.022, 0.72, 4, 1.4), hx + s * 0.22, hy - 0.02, hz + 0.62, 0.5, s * 0.6, 0)); // 须
        const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 0), elMat(M, 'water', 1.6));
        eye.castShadow = false;
        eye.position.set(hx + s * 0.20, hy + 0.12, hz + 0.24);
        turret.add(eye);
      }
      const jaw = new THREE.Mesh(cyl(0.15, 0.15, 0.05, 8, 1.0), elMat(M, 'water', 1.6));
      jaw.castShadow = false;
      jaw.position.set(hx, hy - 0.08, hz + 0.78);
      jaw.rotation.x = Math.PI / 2;
      turret.add(jaw);
    }
    // 闸轮：开合水量的那副绞盘
    const valve = new THREE.Mesh(gearGeo(0.46, 10, 0.14), M.bronze);
    valve.castShadow = false;
    valve.position.set(0.84, 1.18, -0.95);
    turret.add(valve);
    spins.push({ o: valve, axis: 'z', sp: -1.9 });
    push(metal, T(cyl(0.07, 0.07, 1.0, 6, 1.0), 0.84, 1.18, -0.95, 0, 0, Math.PI / 2));
    muzzle = new THREE.Vector3(0, 1.66, 2.6);
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
  } else if (id === 'forge') {
    // 地火炉：石砌炉膛 + 风箱 + 熔口。等阶越高，炉口越多
    push(metal, T(frustum(1.5, 1.5, 1.9, 1.9, 0.42, 0.5), 0, 0.21, 0));
    push(wood, T(frustum(1.15, 1.15, 1.5, 1.5, 1.5 + lv * 0.18, 0.45), 0, 0.95 + lv * 0.09, 0));
    // 炉膛口：朝前一个方洞，里面是熔岩
    const mouth = new THREE.Mesh(box(0.72, 0.62, 0.16, 1.0), M.magma || M.iron);
    mouth.position.set(0, 0.92, 0.78);
    turret.add(mouth);
    // 烟囱
    push(metal, T(cyl(0.26, 0.34, 1.5 + lv * 0.35, 9, 0.6), -0.42, 2.35 + lv * 0.3, -0.42));
    push(metal, T(cyl(0.36, 0.30, 0.22, 9, 0.9), -0.42, 3.16 + lv * 0.45, -0.42));
    // 风箱：随出力鼓动
    const bellow = new THREE.Mesh(box(0.9, 0.62, 1.25, 0.7), M.woodDark);
    bellow.position.set(1.05, 0.78, 0);
    turret.add(bellow);
    spins.push({ o: bellow, axis: 'x', sp: 0, pump: 0.9 });
    push(wood, T(box(0.14, 0.14, 1.9, 0.8), 1.05, 1.34, 0.2, 0.22, 0, 0));
    // 传动轮
    for (let i = 0; i <= lv; i++) {
      const gr = new THREE.Mesh(gearGeo(0.44 + i * 0.09, 10 + i * 2, 0.15), i % 2 ? M.iron : M.bronze);
      gr.position.set(-1.0, 0.68 + i * 0.5, 0.35);
      turret.add(gr);
      spins.push({ o: gr, axis: 'z', sp: (i % 2 ? -1 : 1) * (2.2 + i * 0.8) });
    }
    muzzle = new THREE.Vector3(0, 1.4, 0);
  } else if (id === 'tide') {
    // 潮汐轮：卧式叶轮，随潮起落。轴横在水面上
    push(metal, T(box(2.4, 0.42, 1.6, 0.6), 0, 0.21, 0));
    for (const s of [-1, 1]) {
      push(wood, T(box(0.24, 2.2, 0.24, 0.7), s * 1.0, 1.3, 0, 0, 0, s * 0.10));
      push(wood, T(box(0.18, 0.18, 1.4, 0.8), s * 1.0, 2.3, 0));
    }
    const R = 1.25 + lv * 0.22;
    const wl = [];
    for (const side of [-1, 1]) {
      const rim = ringGeo(R, R * 0.82, 0.12, 22, 0.6); T(rim, 0, 0, side * 0.50); wl.push(rim);
    }
    const nb = 8 + lv * 3;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      // 叶片是弯的：兜得住水
      const bd = box(0.62, 0.06, 1.05, 0.7);
      T(bd, Math.cos(a) * (R - 0.30), Math.sin(a) * (R - 0.30), 0, 0, 0, a + 0.75);
      wl.push(bd);
      const sp = box(R, 0.075, 0.075, 0.7);
      T(sp, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a);
      wl.push(sp);
    }
    const wm = new THREE.Mesh(mergeList(wl), M.wood);
    wm.castShadow = true;
    wm.position.y = 1.45;
    turret.add(wm);
    spins.push({ o: wm, axis: 'z', sp: 0.85 });
    // 铜轴与齿
    push(metal, T(cyl(0.14, 0.14, 2.4, 8, 1.0), 0, 1.45, 0, 0, 0, Math.PI / 2));
    const gr = new THREE.Mesh(gearGeo(0.52 + lv * 0.06, 12, 0.16), M.bronze);
    gr.position.set(1.15, 1.45, 0);
    turret.add(gr);
    spins.push({ o: gr, axis: 'z', sp: -2.2 });
    muzzle = new THREE.Vector3(0, 1.45, 0);
  } else if (id === 'aether') {
    // 云枢：玉柱托起数重同心璧，承云气而转
    push(metal, T(frustum(1.3, 1.3, 1.7, 1.7, 0.40, 0.5), 0, 0.20, 0));
    push(wood, T(cyl(0.30, 0.42, 2.5 + lv * 0.3, 10, 0.6), 0, 1.45 + lv * 0.15, 0));
    // 同心璧：一阶一重，各转各的
    const rings = 1 + lv;
    for (let i = 0; i < rings; i++) {
      const r = 0.95 + i * 0.42;
      const rg = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 8, 34), i % 2 ? M.gold : M.bronze);
      rg.castShadow = false;
      const holder = new THREE.Group();
      holder.add(rg);
      holder.position.y = 3.0 + lv * 0.3;
      holder.rotation.set(i === 1 ? Math.PI / 2 : 0, 0, i === 2 ? Math.PI / 3 : 0);
      turret.add(holder);
      spins.push({ o: holder, axis: i === 1 ? 'x' : (i === 2 ? 'z' : 'y'), sp: 0.7 + i * 0.55 });
    }
    // 枢心
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + lv * 0.05, 1),
      new THREE.MeshStandardMaterial({
        color: 0x2a2440, emissive: new THREE.Color(0xb8a0ff),
        emissiveIntensity: 1.8, roughness: 0.35, metalness: 0.5,
      }));
    core.position.y = 3.0 + lv * 0.3;
    turret.add(core);
    spins.push({ o: core, axis: 'y', sp: 0.4 });
    // 四角承露的小柱
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      push(metal, T(cyl(0.10, 0.13, 1.1, 7, 0.7), Math.cos(a) * 0.95, 0.75, Math.sin(a) * 0.95));
    }
    muzzle = new THREE.Vector3(0, 3.0, 0);
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

// 这几门机关是就地发作的领域，不用转向瞄人
const NO_AIM = { ring: 1, field: 1, curse: 1, warp: 1 };

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
    this.hobble = 0;      // 疫：射速大减
    this.blind = 0;       // 幽：射程缩水
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
  get range() {
    const r = this.stats.range !== undefined ? this.stats.range : this.def.range;
    return this.blind > 0 ? r * 0.62 : r;      // 罔象一来，机关就看不远了
  }
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
  dispose(scene) {
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); scene.remove(this.mesh); }
    if (this.shaftGroup) {
      this.shaftGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      scene.remove(this.shaftGroup);
    }
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
    // 幽冥幡的幡面：正反都要看得见，压得极暗
    this.M.shadeCloth = new THREE.MeshStandardMaterial({
      color: 0x16101f, emissive: new THREE.Color(0x5a48a0), emissiveIntensity: 0.55,
      roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide,
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

    const lavaRule = LEVEL && LEVEL.rule && LEVEL.rule.id === 'lava' ? LEVEL.rule : null;

    this.blobs.begin();
    for (const tw of this.towers) {
      tw.buildAnim = Math.min(1, tw.buildAnim + dt * 3.2);
      const s = smoothstep(0, 1, tw.buildAnim);
      tw.model.scale.setScalar(0.15 + s * 0.85);
      tw.model.position.y = tw.y - (1 - s) * 1.2;
      this.blobs.add(tw.x, tw.y, tw.z, 2.5 * s, 0.40 * s);

      if (tw.disabled > 0) { tw.disabled -= dt; }
      if (tw.hobble > 0) tw.hobble -= dt;
      if (tw.blind > 0) tw.blind -= dt;
      const active = tw.powered && tw.disabled <= 0;

      // 转动件
      const spinRate = (tw.isGen ? 1 : (active ? rateMult : 0.05)) * (tw.isGen ? 1 : 1);
      for (const sp of tw.model.userData.spins) {
        if (sp.pump !== undefined) {
          // 风箱／皮橐：往复鼓动，不是转
          sp.phase = (sp.phase || 0) + dt * 2.6 * (tw.isGen ? 1 : Math.max(0.15, spinRate));
          sp.o.scale.z = 1 + Math.sin(sp.phase) * 0.22 * sp.pump;
          sp.o.position.z = (sp.z0 === undefined ? (sp.z0 = sp.o.position.z) : sp.z0)
            + Math.sin(sp.phase) * 0.16 * sp.pump;
          continue;
        }
        if (sp.sway !== undefined) {
          // 幡面：随风摆，不是转
          sp.phase = (sp.phase || 0) + dt * 1.5;
          sp.o.rotation.z = Math.sin(sp.phase) * sp.sway;
          sp.o.rotation.x = Math.cos(sp.phase * 0.7) * sp.sway * 0.5;
          continue;
        }
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
      // 蜚过之后，机关像害了病，转得慢一半
      let rate = (st.rate !== undefined ? st.rate : tw.def.rate) * rateMult * (tw.hobble > 0 ? 0.5 : 1);
      // 炎火之山：贴着熔岩沟的机关借地火之势，转得更快
      if (lavaRule) {
        if (tw._lava === undefined) tw._lava = distToRiver(tw.x, tw.z) < lavaRule.nearRiver;
        if (tw._lava) rate *= (1 + lavaRule.fireBonus);
      }
      tw.cool -= dt;

      // 瞄准
      const range = tw.range;
      const target = enemies.nearestAhead(tw.x, tw.z, range);
      if (target && !NO_AIM[tw.def.kind]) {
        const want = Math.atan2(target.x - tw.x, target.z - tw.z);
        let d = want - tw.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        tw.angle += clamp(d, -dt * 5.2, dt * 5.2);
        tw.model.rotation.y = tw.angle;
      }
      const turret = tw.model.userData.turret;
      if (turret) turret.position.z = -tw.recoil * 0.35;

      if (tw.cool <= 0 && (target || NO_AIM[tw.def.kind])) {
        const fired = this.game.fire(tw, target, enemies);
        if (fired) {
          tw.cool = 1 / Math.max(0.05, rate);
          tw.recoil = 1;
          if (tw.def.kind === 'splash' || tw.def.kind === 'venom') tw.armAnim = 1;
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

  // 换关：连机关网络与射程环一并拆掉
  dispose() {
    this.clear();
    if (this.links && this.links.dispose) this.links.dispose(this.scene);
    if (this.blobs && this.blobs.dispose) this.blobs.dispose(this.scene);
    if (this.rangeRing && this.rangeRing.parent) this.rangeRing.parent.remove(this.rangeRing);
  }
}

export { buildModel };
