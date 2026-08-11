// 机关 —— 造型、瞄准、开火、升阶，以及贯通全谷的机力网络
import * as THREE from 'three';
import { Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { box, cyl, cone, sphere, torus, plane, frustum, T, beam } from '../world/geo.js';
import { gearGeo, ringGeo } from '../world/machinery.js';
import { getMaterials } from '../world/materials.js';
import { TOWER_BY_ID, TOWERS, ELEMENTS, RULES } from './config.js';
import { GroundBlobs } from './beasts.js';
import { LEVEL } from '../world/layout.js';

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

// 椭球：兽蹄、虫身、云头这类圆而不正的零件到处都要用
function ellip2(rx, ry, rz, seg = 10) {
  const g = sphere(1, seg, Math.max(7, seg - 3), 0.6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  g.computeVertexNormals();
  return g;
}

/* ============================================================
   发光芯：新机关的「气」都靠它。一次建好，全局共用
   ============================================================ */
let _cores = null;
function cores() {
  if (_cores) return _cores;
  const mk = (color, emissive, intensity, rough = 0.3, metal = 0.5, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color, emissive: new THREE.Color(emissive), emissiveIntensity: intensity,
      roughness: rough, metalness: metal, ...extra,
    });
  _cores = {
    frostCore: mk(0x1a3a4a, 0x6ad8ff, 2.2, 0.25, 0.4),
    thunderCore: mk(0x2a2a3a, 0xaad4ff, 2.6, 0.2, 0.6),
    // 气与雾的芯压得很低：亮过头会把机关本身的形制糊掉，只剩一团光
    windCore: mk(0x14322a, 0x7fe8c8, 0.85, 0.34, 0.3,
      { transparent: true, opacity: 0.46, depthWrite: false }),
    venomCore: mk(0x1e2a0c, 0x8ac02a, 0.70, 0.46, 0.15,
      { transparent: true, opacity: 0.40, depthWrite: false }),
    guCore: mk(0x2c0a24, 0xd04aa0, 1.4, 0.28, 0.4),
    darkCore: mk(0x0a0712, 0x6a50b8, 0.9, 0.18, 0.7),
    voidCore: mk(0x05030c, 0x6a5ac0, 0.55, 0.10, 0.9),
    voidHalo: mk(0x1a1630, 0xbcb4e0, 1.0, 0.2, 0.5,
      { transparent: true, opacity: 0.34, depthWrite: false }),
    emberCore: mk(0x2a1008, 0xff7a2a, 1.6, 0.5, 0.1),
  };
  return _cores;
}

/* ============================================================
   造型
   ============================================================ */
// 须弥座式的塔基：叠涩三层 + 一圈压顶石，比一只圆饼耐看
function makeBase(M, r = 1.9, h = 0.5) {
  const parts = [];
  const p0 = cyl(r * 1.04, r * 1.16, h * 0.34, 12, 0.6); T(p0, 0, h * 0.17, 0); parts.push(p0);
  const p1 = cyl(r * 0.88, r * 0.96, h * 0.44, 12, 0.6); T(p1, 0, h * 0.56, 0); parts.push(p1);   // 束腰
  const p2 = cyl(r * 1.02, r * 0.92, h * 0.30, 12, 0.7); T(p2, 0, h * 0.93, 0); parts.push(p2);
  const p3 = cyl(r * 0.90, r * 0.94, h * 0.20, 12, 0.8); T(p3, 0, h * 1.16, 0); parts.push(p3);
  // 四角的角石：剪影上多四个咬口
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const g = box(r * 0.30, h * 0.34, r * 0.30, 0.8);
    T(g, Math.cos(a) * r * 0.94, h * 1.16, Math.sin(a) * r * 0.94, 0, a, 0);
    parts.push(g);
  }
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
  // 按材质分桶，最后每桶合并成一次 draw call
  const wood = [], metal = [], accent = [], woodR = [], rock = [], jade = [], cloth = [];
  const C = cores();

  const push = (arr, geo) => arr.push(geo);

  if (id === 'crossbow') {
    // 转台：铜齿圈坐在木盘上，转起来看得见齿
    push(wood, T(cyl(0.76, 0.90, 0.30, 12, 0.7), 0, 0.15, 0));
    const ring = new THREE.Mesh(gearGeo(0.68, 22, 0.14, { spokes: 6 }), M.bronze);
    ring.position.y = 0.36; ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    turret.add(ring);
    spins.push({ o: ring, axis: 'z', sp: 0.8 });
    // 立柱与摇架
    push(wood, T(box(0.32, 1.0, 0.32, 0.8), 0, 0.86, -0.14));
    for (const s of [-1, 1]) push(wood, beam(s * 0.30, 0.44, -0.10, s * 0.16, 1.30, -0.16, 0.10, 0.10, 0.9));

    // 弓臂：反曲。三段折线拼出来，比一根直棍像弩
    const arms = 1 + lv;
    const span = 1.55 + lv * 0.22;
    for (let i = 0; i < arms; i++) {
      const y = 1.06 + i * 0.32;
      for (const s of [-1, 1]) {
        push(wood, beam(0, y, 0.52, s * span * 0.62, y + 0.04, 0.44, 0.13, 0.11, 0.9));
        push(wood, beam(s * span * 0.62, y + 0.04, 0.44, s * span, y + 0.16, 0.60, 0.10, 0.09, 0.9));
        // 弓弭
        push(metal, T(cyl(0.05, 0.05, 0.16, 6, 1.4), s * span, y + 0.18, 0.62));
      }
      // 弦：绷在两端，中间被弩机勾住
      push(metal, beam(-span, y + 0.18, 0.62, 0, y + 0.12, 0.94, 0.028, 0.028, 1.8));
      push(metal, beam(span, y + 0.18, 0.62, 0, y + 0.12, 0.94, 0.028, 0.028, 1.8));
      // 臂槽与已上膛的箭
      push(wood, T(box(0.17, 0.13, 1.55, 0.9), 0, y, 1.06));
      push(metal, T(cyl(0.035, 0.035, 1.0, 5, 1.6), 0, y + 0.10, 1.32, Math.PI / 2, 0, 0));
      push(metal, T(cone(0.065, 0.20, 5, 1.4), 0, y + 0.10, 1.90, Math.PI / 2, 0, 0));
    }
    // 箭匣：盖板半开，露出一排箭尾
    push(wood, T(box(0.54, 0.60, 1.05, 0.8), 0, 1.48 + lv * 0.14, -0.22));
    push(woodR, T(box(0.58, 0.06, 1.10, 0.9), 0, 1.80 + lv * 0.14, -0.22, -0.22, 0, 0));
    for (let i = -1; i <= 1; i++) {
      push(metal, T(cyl(0.028, 0.028, 0.46, 5, 1.6), i * 0.15, 1.86 + lv * 0.14, -0.36, 0.35, 0, 0));
    }
    // 望山（照门）与扳机
    push(metal, T(box(0.06, 0.26, 0.05, 1.6), 0, 1.20 + lv * 0.32, 0.18));
    push(metal, T(box(0.07, 0.22, 0.07, 1.4), 0, 0.86, 0.30, 0.4, 0, 0));
    // 绞轴与摇柄
    const crank = new THREE.Mesh(mergeList([
      T(cyl(0.09, 0.09, 0.9, 8, 1.0), 0, 0, 0, 0, 0, Math.PI / 2),
      T(box(0.06, 0.30, 0.06, 1.2), 0.50, 0.14, 0),
      T(box(0.06, 0.06, 0.24, 1.2), 0.50, 0.28, 0.12),
    ]), M.iron);
    crank.position.set(0, 0.72, -0.62);
    crank.castShadow = false;
    turret.add(crank);
    spins.push({ o: crank, axis: 'x', sp: 1.6 });
    muzzle = new THREE.Vector3(0, 1.18 + lv * 0.16, 1.95);
  } else if (id === 'catapult') {
    // 车架 + 四只木轮：霹雳车本来就是推着走的
    push(wood, T(box(2.5, 0.26, 3.0, 0.6), 0, 0.14, 0));
    for (const s of [-1, 1]) {
      push(wood, T(box(0.20, 0.20, 3.2, 0.7), s * 1.10, 0.28, 0));
      for (const zz of [1.05, -1.05]) {
        const wh = new THREE.Mesh(mergeList([
          ringGeo(0.44, 0.32, 0.13, 14, 0.7),
          ...[0, 1, 2, 3, 4].map(k => {
            const a = (k / 5) * Math.PI * 2;
            return T(box(0.38, 0.07, 0.07, 0.9), Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0, 0, 0, a);
          }),
        ]), M.woodDark);
        wh.position.set(s * 1.24, 0.40, zz);
        wh.rotation.y = Math.PI / 2;
        wh.castShadow = true;
        turret.add(wh);
        spins.push({ o: wh, axis: 'z', sp: 0 });   // 静止的轮子，只为形制
      }
      // 人字支架
      push(wood, beam(s * 0.95, 0.30, -0.9, s * 0.42, 2.05, -0.6, 0.20, 0.20, 0.8));
      push(wood, beam(s * 0.95, 0.30, 0.55, s * 0.42, 2.05, -0.6, 0.20, 0.20, 0.8));
      push(metal, T(box(0.34, 0.30, 0.30, 1.2), s * 0.42, 2.05, -0.6));
    }
    // 抛臂（开火时摆动）：梢是一束杆子绑起来的，阶数越高绑得越多
    const arm = new THREE.Group();
    arm.position.set(0, 2.05, -0.6);
    const armGeo = [];
    const poles = 1 + lv * 2;
    for (let i = 0; i < poles; i++) {
      const off = (i - (poles - 1) / 2) * 0.11;
      push(armGeo, T(box(0.15, 0.15, 3.4 + lv * 0.4, 0.7), off, Math.abs(off) * 0.25, 1.3));
    }
    push(armGeo, T(box(0.58, 0.58, 0.58, 0.9), 0, 0, -0.85));       // 配重
    for (const t of [0.35, 0.62, 0.86]) {                            // 绑绳
      push(armGeo, T(torus(0.20 + poles * 0.03, 0.035, 5, 10, 1.4), 0, 0, -0.4 + t * 3.2, 0, Math.PI / 2, 0));
    }
    const armMesh = new THREE.Mesh(mergeList(armGeo), M.woodDark);
    armMesh.castShadow = true;
    arm.add(armMesh);
    // 皮兜
    const bucket = new THREE.Mesh(mergeList([
      T(cyl(0.36, 0.24, 0.34, 9, 0.9), 0, 0, 0),
      T(cyl(0.05, 0.05, 0.5, 5, 1.4), 0.22, 0.30, -0.16, 0, 0, 0.5),
      T(cyl(0.05, 0.05, 0.5, 5, 1.4), -0.22, 0.30, -0.16, 0, 0, -0.5),
    ]), M.iron);
    bucket.position.set(0, 0.2, 2.9 + lv * 0.4);
    arm.add(bucket);
    turret.add(arm);
    g.userData.arm = arm;
    push(metal, T(torus(0.42, 0.06, 5, 12, 0.8), 0, 2.05, -0.6, 0, Math.PI / 2, 0));
    // 绞盘与拉索
    const winch = new THREE.Mesh(mergeList([
      T(cyl(0.24, 0.24, 0.8, 10, 0.9), 0, 0, 0, 0, 0, Math.PI / 2),
      T(box(0.06, 0.44, 0.06, 1.2), 0.46, 0.20, 0),
    ]), M.iron);
    winch.position.set(0, 0.62, 1.24);
    winch.castShadow = false;
    turret.add(winch);
    spins.push({ o: winch, axis: 'x', sp: 1.1 });
    push(metal, beam(0, 0.62, 1.24, 0, 1.60, 0.30, 0.035, 0.035, 1.8));
    muzzle = new THREE.Vector3(0, 3.4, 1.4);
  } else if (id === 'flame') {
    // 猛火油柜：木柜箍铁，前头一枚龙首铜嘴
    push(wood, T(cyl(0.66, 0.82, 0.46, 12, 0.7), 0, 0.23, 0));
    push(wood, T(box(1.15, 0.90, 1.55, 0.7), 0, 0.92, -0.42));
    for (const t of [-0.5, 0, 0.5]) push(metal, T(box(1.22, 0.10, 0.14, 1.4), 0, 0.92 + t * 0.62, -0.42));
    // 铜管：从柜子绕到炮口
    push(accent, T(cyl(0.11, 0.11, 1.5, 8, 1.0), 0.44, 1.20, -0.10, 0.9, 0, 0));
    push(accent, T(cyl(0.28, 0.32, 1.85 + lv * 0.2, 12, 0.8), 0, 1.06, 0.92, Math.PI / 2.5, 0, 0));
    // 龙首喷口：额、须、张开的口
    push(accent, T(cone(0.40, 0.56, 8, 0.9), 0, 1.40, 1.78, Math.PI / 2, 0, 0));
    push(accent, T(ringGeo(0.40, 0.30, 0.10, 10, 1.2), 0, 1.42, 2.02, Math.PI / 2, 0, 0));
    for (const s of [-1, 1]) {
      push(accent, T(cone(0.05, 0.44, 5, 1.2), s * 0.24, 1.58, 1.86, -1.1, 0, s * 0.5));   // 龙角
      push(accent, T(ellip2(0.07, 0.07, 0.09), s * 0.19, 1.52, 1.94));                      // 龙目
    }
    // 火种：常年不灭的一小簇
    const pilot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), C.emberCore);
    pilot.position.set(0, 1.42, 2.06);
    turret.add(pilot);
    g.userData.orb = pilot;
    // 双活塞风箱：踏板一上一下
    for (const s of [-1, 1]) {
      const bel = new THREE.Mesh(box(0.62, 0.46, 0.86, 0.7), M.woodDark);
      bel.position.set(s * 0.92, 0.72, -0.34);
      bel.castShadow = true;
      turret.add(bel);
      spins.push({ o: bel, axis: 'y', sp: 0, pump: 0.7, phase: s > 0 ? 0 : Math.PI });
      push(wood, T(box(0.10, 0.10, 1.4, 0.9), s * 0.92, 1.22, -0.22, 0.26, 0, 0));
    }
    // 阶数：多一圈炮箍与一支副喷嘴
    for (let i = 0; i <= lv; i++)
      push(metal, T(torus(0.34, 0.05, 5, 10, 1.0), 0, 1.02 + i * 0.06, 0.44 + i * 0.52, Math.PI / 2.5, 0, 0));
    for (let i = 0; i < lv; i++) {
      const s = i === 0 ? -1 : 1;
      push(accent, T(cyl(0.13, 0.15, 1.1, 8, 0.9), s * 0.36, 1.20, 1.30, Math.PI / 2.4, 0, 0));
      push(accent, T(cone(0.18, 0.26, 6, 1.0), s * 0.36, 1.36, 1.82, Math.PI / 2, 0, 0));
    }
    muzzle = new THREE.Vector3(0, 1.48, 2.15);
  } else if (id === 'frost') {
    // 八角石台 + 一圈水槽
    push(rock, T(cyl(1.55, 1.66, 0.30, 8, 0.6), 0, 0.15, 0));
    push(rock, T(cyl(1.32, 1.36, 0.46, 8, 0.7), 0, 0.52, 0));
    push(accent, T(ringGeo(1.30, 1.10, 0.22, 8, 0.8), 0, 0.78, 0, Math.PI / 2, 0, 0));
    // 槽里的水：一层发光的浅蓝
    const pool = new THREE.Mesh(cyl(1.08, 1.08, 0.06, 20, 0.8), C.frostCore);
    pool.position.y = 0.80;
    turret.add(pool);
    // 四角出水的螭首
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      push(rock, T(cyl(0.16, 0.20, 0.62, 8, 0.9), Math.cos(a) * 1.34, 0.62, Math.sin(a) * 1.34, Math.PI / 2, -a, 0));
      push(accent, T(cone(0.13, 0.20, 6, 1.0), Math.cos(a) * 1.62, 0.62, Math.sin(a) * 1.62, Math.PI / 2, -a, 0));
    }
    // 悬浮玉环
    for (let i = 0; i <= lv + 1; i++) {
      const r = new THREE.Mesh(torus(0.88 - i * 0.14, 0.075, 8, 26, 1.0), M.gold);
      r.castShadow = false;
      r.position.y = 1.16 + i * 0.42;
      r.rotation.x = Math.PI / 2;
      turret.add(r);
      spins.push({ o: r, axis: 'z', sp: (i % 2 ? -1 : 1) * (0.7 + i * 0.3) });
      // 环上的凝霜：几枚小冰棱
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + i;
        push(metal, T(cone(0.05, 0.20, 4, 1.2),
          Math.cos(a) * (0.88 - i * 0.14), 1.16 + i * 0.42, Math.sin(a) * (0.88 - i * 0.14)));
      }
    }
    // 冰核：一颗多面的晶，外面还罩一层更大的透明壳
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), C.frostCore);
    core.position.y = 1.54;
    turret.add(core);
    spins.push({ o: core, axis: 'y', sp: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      push(metal, T(cone(0.09, 0.66, 4, 1.0),
        Math.cos(a) * 0.42, 1.54 + (i % 2 ? 0.3 : -0.3), Math.sin(a) * 0.42,
        (i % 2 ? -0.5 : 0.5), a, 0));
    }
    muzzle = new THREE.Vector3(0, 1.54, 0);
  } else if (id === 'blade') {
    // 立轴 + 齿轮传动，轮子是被带起来的，不是凭空转
    push(rock, T(cyl(0.72, 0.92, 0.42, 12, 0.7), 0, 0.21, 0));
    push(wood, T(cyl(0.52, 0.68, 1.30, 12, 0.6), 0, 1.02, 0));
    push(metal, T(cyl(0.26, 0.26, 0.70, 10, 0.9), 0, 1.72, 0));
    for (const s of [-1, 1]) push(wood, beam(s * 0.62, 0.44, 0, s * 0.20, 1.56, 0, 0.12, 0.12, 0.9));
    // 侧齿轮：与轮盘啮合
    const drive = new THREE.Mesh(gearGeo(0.42, 12, 0.16), M.bronze);
    drive.position.set(0.96, 1.10, 0);
    drive.rotation.x = Math.PI / 2;
    drive.castShadow = false;
    turret.add(drive);
    spins.push({ o: drive, axis: 'z', sp: -(4.2 + lv * 1.6) * 2.2 });

    // 刃轮：戈形刃片，阶数越高刃越多、越长
    const bladeGeo = [];
    const R = 1.5 + lv * 0.25;
    push(bladeGeo, ringGeo(R, R * 0.80, 0.12, 26, 0.7));
    push(bladeGeo, ringGeo(R * 0.42, R * 0.30, 0.16, 16, 0.7));
    const nb = 6 + lv * 2;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      // 刃身：外缘一段带弧的薄片 + 一个内钩
      const bl = box(0.95 + lv * 0.12, 0.055, 0.30, 1.0);
      T(bl, Math.cos(a) * (R + 0.36), Math.sin(a) * (R + 0.36), 0, 0, 0, a + 0.52);
      push(bladeGeo, bl);
      const hook = box(0.34, 0.05, 0.20, 1.0);
      T(hook, Math.cos(a) * (R + 0.72), Math.sin(a) * (R + 0.72), 0, 0, 0, a + 1.15);
      push(bladeGeo, hook);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = box(R * 0.72, 0.075, 0.075, 0.8);
      T(sp, Math.cos(a) * R * 0.68, Math.sin(a) * R * 0.68, 0, 0, 0, a);
      push(bladeGeo, sp);
    }
    const bm = new THREE.Mesh(mergeList(bladeGeo), M.iron);
    bm.castShadow = true;
    bm.position.y = 1.5;
    bm.rotation.x = Math.PI / 2;
    turret.add(bm);
    spins.push({ o: bm, axis: 'z', sp: 4.2 + lv * 1.6 });
    // 二阶起加一层反向的刃轮
    if (lv >= 1) {
      const bm2 = new THREE.Mesh(mergeList([
        ringGeo(R * 0.74, R * 0.60, 0.10, 20, 0.7),
        ...Array.from({ length: nb }, (_, i) => {
          const a = (i / nb) * Math.PI * 2 + 0.4;
          const bl = box(0.62, 0.05, 0.24, 1.0);
          return T(bl, Math.cos(a) * (R * 0.74 + 0.26), Math.sin(a) * (R * 0.74 + 0.26), 0, 0, 0, a + 0.52);
        }),
      ]), M.bronze);
      bm2.position.y = 1.5 + 0.30;
      bm2.rotation.x = Math.PI / 2;
      bm2.castShadow = true;
      turret.add(bm2);
      spins.push({ o: bm2, axis: 'z', sp: -(3.4 + lv * 1.4) });
    }
    muzzle = new THREE.Vector3(0, 1.5, 0);
  } else if (id === 'thunder') {
    // 陶座 + 绝缘子：雷得有地方泄，不然只是根棍子
    push(rock, T(cyl(0.82, 1.00, 0.46, 12, 0.7), 0, 0.23, 0));
    for (let i = 0; i < 3; i++)
      push(accent, T(cyl(0.30 - i * 0.03, 0.34 - i * 0.03, 0.14, 12, 1.0), 0, 0.54 + i * 0.20, 0));
    // 铜柱：分节，节间有云雷纹箍
    const H = 3.4 + lv * 0.5;
    push(metal, T(cyl(0.20, 0.30, H, 12, 0.7), 0, 1.10 + H / 2, 0));
    for (let i = 0; i < 4 + lv; i++)
      push(accent, T(ringGeo(0.30, 0.23, 0.09, 12, 1.2), 0, 1.35 + i * (H / (4 + lv)), 0, Math.PI / 2, 0, 0));
    // 缠柱铜线：一条真的螺旋
    const helix = [];
    const turns = 5 + lv;
    for (let i = 0; i < turns * 10; i++) {
      const t0 = i / (turns * 10), t1 = (i + 1) / (turns * 10);
      const a0 = t0 * Math.PI * 2 * turns, a1 = t1 * Math.PI * 2 * turns;
      const r0 = 0.34, y0 = 1.20 + t0 * H * 0.86, y1 = 1.20 + t1 * H * 0.86;
      helix.push(beam(Math.cos(a0) * r0, y0, Math.sin(a0) * r0,
        Math.cos(a1) * r0, y1, Math.sin(a1) * r0, 0.045, 0.045, 1.6));
    }
    push(accent, mergeList(helix));
    // 铜环：一层层张开的受雷环
    for (let i = 0; i <= lv + 1; i++) {
      const c = new THREE.Mesh(torus(0.58 - i * 0.05, 0.09, 8, 22, 0.8), M.bronze);
      c.castShadow = false;
      c.position.y = 1.5 + i * 0.85;
      c.rotation.x = Math.PI / 2;
      turret.add(c);
      spins.push({ o: c, axis: 'z', sp: (i % 2 ? 1 : -1) * 1.4 });
      // 环上的四枚尖端
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + i * 0.4;
        push(metal, T(cone(0.045, 0.22, 4, 1.2),
          Math.cos(a) * (0.58 - i * 0.05), 1.5 + i * 0.85, Math.sin(a) * (0.58 - i * 0.05),
          Math.PI / 2, -a, 0));
      }
    }
    // 顶端的引雷球与四根尖刺
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44 + lv * 0.06, 1), C.thunderCore);
    orb.position.y = 3.9 + lv * 0.5;
    turret.add(orb);
    g.userData.orb = orb;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      push(metal, T(cone(0.05, 0.70, 4, 1.0),
        Math.cos(a) * 0.30, 4.25 + lv * 0.5, Math.sin(a) * 0.30, -0.42, -a, 0));
    }
    // 接地铜链
    for (const s of [-1, 1])
      push(accent, beam(s * 0.28, 1.10, 0, s * 0.90, 0.10, s * 0.30, 0.05, 0.05, 1.6));
    muzzle = new THREE.Vector3(0, 3.9 + lv * 0.5, 0);

  /* ================= 六气机关 ================= */
  } else if (id === 'gale') {
    // 罡风橐：一具巨大的木风箱，前头接铜喇叭口
    push(wood, T(box(2.0, 0.30, 1.5, 0.6), 0, 0.15, 0));
    for (const s of [-1, 1]) push(wood, T(box(0.20, 1.5, 0.20, 0.8), s * 0.86, 0.90, -0.52));
    // 橐身：会鼓动的箱体，阶数越高越多具
    const boxes = 1 + Math.min(2, lv);
    for (let i = 0; i < boxes; i++) {
      const off = (i - (boxes - 1) / 2) * 0.78;
      const bel = new THREE.Mesh(mergeList([
        box(0.68, 0.86, 1.30, 0.7),
        T(box(0.74, 0.10, 0.16, 1.2), 0, 0.30, 0),
        T(box(0.74, 0.10, 0.16, 1.2), 0, -0.30, 0),
      ]), M.woodDark);
      bel.position.set(off, 1.00, -0.42);
      bel.castShadow = true;
      turret.add(bel);
      spins.push({ o: bel, axis: 'y', sp: 0, pump: 1.0, phase: i * 2.1 });
      // 摇杆
      push(wood, T(box(0.10, 0.10, 1.5, 0.9), off, 1.56, -0.10, 0.30, 0, 0));
    }
    // 送风管与铜喇叭
    push(accent, T(cyl(0.34, 0.42, 1.30, 12, 0.8), 0, 1.10, 0.62, Math.PI / 2.3, 0, 0));
    const bell = frustum(1.55, 1.55, 0.62, 0.62, 1.10, 0.6);
    T(bell, 0, 1.36, 1.62, Math.PI / 2, 0, 0);
    push(accent, bell);
    push(accent, T(ringGeo(0.82, 0.72, 0.12, 16, 1.0), 0, 1.40, 2.14, Math.PI / 2, 0, 0));
    // 喇叭里的螺旋叶轮：真的在转
    const fanGeo = [];
    const nb = 5 + lv * 2;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      const bl = box(0.62, 0.05, 0.44, 0.9);
      T(bl, Math.cos(a) * 0.40, Math.sin(a) * 0.40, 0, 0, 0, a + 0.7);
      fanGeo.push(bl);
    }
    fanGeo.push(T(cyl(0.14, 0.14, 0.28, 8, 1.0), 0, 0, 0, Math.PI / 2, 0, 0));
    const fan = new THREE.Mesh(mergeList(fanGeo), M.iron);
    fan.position.set(0, 1.38, 1.86);
    fan.castShadow = false;
    turret.add(fan);
    spins.push({ o: fan, axis: 'z', sp: 7.0 + lv * 2.5 });
    // 风：喇叭口一圈半透明的旋气
    const swirl = new THREE.Mesh(torus(0.90, 0.10, 6, 22, 1.0), C.windCore);
    swirl.position.set(0, 1.40, 2.10);
    swirl.rotation.x = Math.PI / 2;
    turret.add(swirl);
    spins.push({ o: swirl, axis: 'z', sp: 3.2 });
    // 风向旗：随风摆
    push(wood, T(cyl(0.06, 0.08, 1.7, 6, 0.9), -0.86, 2.30, -0.52));
    const flag = new THREE.Mesh(plane(0.9, 0.42, 1.2), M.cloth);
    flag.position.set(-0.42, 2.95, -0.52);
    flag.rotation.y = Math.PI / 2;
    turret.add(flag);
    spins.push({ o: flag, axis: 'y', sp: 0, wave: 0.34 });
    muzzle = new THREE.Vector3(0, 1.40, 2.25);

  } else if (id === 'miasma') {
    // 瘴烟炉：三足青铜鼎，鼎里煨着南荒的瘴
    push(rock, T(cyl(1.30, 1.44, 0.26, 12, 0.7), 0, 0.13, 0));
    // 炭盆：鼎底下的火
    const coal = new THREE.Mesh(cyl(0.62, 0.62, 0.10, 12, 0.8), C.emberCore);
    coal.position.y = 0.30;
    turret.add(coal);
    // 三足
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      push(accent, T(cyl(0.13, 0.19, 0.86, 8, 0.8), Math.cos(a) * 0.72, 0.62, Math.sin(a) * 0.72, 0, 0, -0.10));
      push(accent, T(ellip2(0.17, 0.13, 0.22), Math.cos(a) * 0.80, 0.24, Math.sin(a) * 0.80));   // 兽蹄
    }
    // 鼎腹：上大下小，腰上一道饕餮纹
    push(accent, T(frustum(1.60, 1.60, 1.06, 1.06, 1.10, 0.5), 0, 1.60, 0));
    push(accent, T(ringGeo(0.86, 0.74, 0.16, 14, 1.0), 0, 1.42, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      push(accent, T(box(0.16, 0.22, 0.07, 1.4), Math.cos(a) * 0.82, 1.62, Math.sin(a) * 0.82, 0, -a, 0));
    }
    // 双耳
    for (const s of [-1, 1])
      push(accent, T(torus(0.26, 0.07, 6, 14, 1.0), s * 0.86, 2.22, 0, 0, Math.PI / 2, 0));
    // 鼎口与盖：盖半开，绿雾从缝里溢出来
    push(accent, T(ringGeo(0.84, 0.66, 0.12, 16, 1.0), 0, 2.16, 0, Math.PI / 2, 0, 0));
    push(accent, T(cone(0.78, 0.44, 10, 0.8), 0, 2.44, -0.10, 0.22, 0, 0));
    push(accent, T(ellip2(0.16, 0.20, 0.16), 0, 2.72, -0.14));
    // 瘴：鼎口一团慢慢转的绿雾，阶数越高越浓
    for (let i = 0; i <= lv + 1; i++) {
      const fog = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36 + i * 0.10, 1), C.venomCore);
      fog.position.set(Math.sin(i * 2.1) * 0.22, 2.36 + i * 0.34, Math.cos(i * 2.1) * 0.22);
      fog.castShadow = false;
      turret.add(fog);
      spins.push({ o: fog, axis: i % 2 ? 'y' : 'x', sp: (i % 2 ? 0.6 : -0.45) });
    }
    // 侧面的风门与拉杆
    push(wood, T(box(0.44, 0.52, 0.10, 0.9), 0, 1.50, 0.86));
    push(metal, T(cyl(0.05, 0.05, 0.9, 6, 1.2), 0, 1.86, 1.00, 0.5, 0, 0));
    // 装瘴的药瓮，摆在脚边
    for (const s of [-1, 1]) {
      push(rock, T(frustum(0.34, 0.34, 0.44, 0.44, 0.52, 0.8), s * 1.42, 0.26, 0.52));
      push(cloth, T(plane(0.34, 0.34, 1.4), s * 1.42, 0.53, 0.52, -Math.PI / 2, 0, 0));
    }
    muzzle = new THREE.Vector3(0, 2.50, 0.2);

  } else if (id === 'guwen') {
    // 养蛊瓮：陶瓮封着符纸，虫从缝里钻出来
    push(rock, T(cyl(1.16, 1.30, 0.26, 12, 0.7), 0, 0.13, 0));
    // 木架
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      push(wood, T(cyl(0.10, 0.13, 1.9, 7, 0.8), Math.cos(a) * 0.92, 1.05, Math.sin(a) * 0.92, 0, 0, -0.07));
    }
    for (const yy of [0.72, 1.72])
      push(wood, T(ringGeo(0.98, 0.88, 0.10, 12, 1.0), 0, yy, 0, Math.PI / 2, 0, 0));
    // 瓮身：鼓腹束颈
    push(rock, T(frustum(1.30, 1.30, 0.90, 0.90, 0.80, 0.5), 0, 0.86, 0));
    push(rock, T(frustum(0.72, 0.72, 1.34, 1.34, 0.72, 0.5), 0, 1.62, 0));
    push(rock, T(ringGeo(0.44, 0.34, 0.14, 12, 1.0), 0, 2.02, 0, Math.PI / 2, 0, 0));
    // 封口符纸：一张斜贴的黄纸
    push(cloth, T(plane(0.74, 0.30, 1.2), 0, 2.06, 0, -Math.PI / 2, 0.4, 0));
    // 绳网
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      push(wood, beam(Math.cos(a) * 0.62, 2.02, Math.sin(a) * 0.62,
        Math.cos(a + 0.9) * 0.64, 0.90, Math.sin(a + 0.9) * 0.64, 0.035, 0.035, 1.6));
    }
    // 蛊虫：绕着瓮口飞的一串光点，阶数越高越多
    const swarm = new THREE.Group();
    swarm.position.y = 2.18;
    const bugs = 5 + lv * 4;
    for (let i = 0; i < bugs; i++) {
      const a = (i / bugs) * Math.PI * 2;
      const rr = 0.55 + (i % 3) * 0.18;
      const b = new THREE.Mesh(ellip2(0.055, 0.045, 0.11), C.guCore);
      b.position.set(Math.cos(a) * rr, Math.sin(i * 1.7) * 0.34, Math.sin(a) * rr);
      b.rotation.y = -a;
      b.castShadow = false;
      swarm.add(b);
    }
    turret.add(swarm);
    spins.push({ o: swarm, axis: 'y', sp: 1.9 + lv * 0.5 });
    // 瓮口的蛊光
    const glow = new THREE.Mesh(cyl(0.36, 0.30, 0.08, 12, 1.0), C.guCore);
    glow.position.y = 2.04;
    turret.add(glow);
    g.userData.orb = glow;
    // 二阶起：旁边再立一只小瓮，两瓮相噬
    if (lv >= 1) {
      push(rock, T(frustum(0.80, 0.80, 0.56, 0.56, 0.52, 0.6), 1.32, 0.52, 0.28));
      push(rock, T(frustum(0.44, 0.44, 0.82, 0.82, 0.44, 0.6), 1.32, 1.00, 0.28));
      push(cloth, T(plane(0.42, 0.20, 1.2), 1.32, 1.23, 0.28, -Math.PI / 2, -0.3, 0));
    }
    muzzle = new THREE.Vector3(0, 2.20, 0.30);

  } else if (id === 'umbra') {
    // 蚀影幢：一座石经幢，层层出檐，顶上悬一颗吞光的黑曜石
    push(rock, T(cyl(1.42, 1.56, 0.28, 8, 0.6), 0, 0.14, 0));
    // 覆莲座
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      push(rock, T(ellip2(0.30, 0.16, 0.42), Math.cos(a) * 1.06, 0.40, Math.sin(a) * 1.06, 0.35, -a, 0));
    }
    // 幢身：三到五层八角柱，每层一道出檐
    const tiers = 3 + lv;
    let yy = 0.58;
    for (let i = 0; i < tiers; i++) {
      const t = i / Math.max(1, tiers - 1);
      const r = 0.62 - t * 0.20;
      const h = 0.74 - t * 0.10;
      push(rock, T(cyl(r * 0.94, r, h, 8, 0.7), 0, yy + h / 2, 0, 0, i * 0.4, 0));
      // 幢面刻的经文：一圈细窄的凹槽
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + i * 0.4;
        push(metal, T(box(0.05, h * 0.7, 0.03, 1.6), Math.cos(a) * r * 0.97, yy + h / 2, Math.sin(a) * r * 0.97, 0, -a, 0));
      }
      yy += h;
      // 出檐
      push(rock, T(cone(r * 1.85, 0.28, 8, 0.8), 0, yy + 0.12, 0, 0, i * 0.4 + 0.39, 0));
      push(rock, T(cyl(r * 1.10, r * 1.30, 0.12, 8, 0.9), 0, yy + 0.30, 0, 0, i * 0.4, 0));
      // 檐角垂下的黑幡
      if (i < tiers - 1) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + i * 0.4 + 0.39;
          const ban = new THREE.Mesh(plane(0.26, 0.62, 1.2), M.clothBlue || M.cloth);
          ban.position.set(Math.cos(a) * r * 1.7, yy - 0.14, Math.sin(a) * r * 1.7);
          ban.rotation.y = -a + Math.PI / 2;
          turret.add(ban);
          spins.push({ o: ban, axis: 'y', sp: 0, wave: 0.22, phase: k + i });
        }
      }
      yy += 0.40;
    }
    // 顶：黑曜石球 + 一圈内旋的暗环
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44 + lv * 0.05, 1), C.darkCore);
    stone.position.y = yy + 0.42;
    turret.add(stone);
    spins.push({ o: stone, axis: 'y', sp: -0.7 });
    g.userData.orb = stone;
    for (let i = 0; i <= lv; i++) {
      const rg = new THREE.Mesh(torus(0.72 + i * 0.26, 0.055, 6, 26, 1.0), C.darkCore);
      rg.castShadow = false;
      const holder = new THREE.Group();
      holder.add(rg);
      holder.position.y = yy + 0.42;
      holder.rotation.set(0.5 + i * 0.5, 0, i * 0.7);
      turret.add(holder);
      spins.push({ o: holder, axis: i % 2 ? 'x' : 'y', sp: (i % 2 ? -0.9 : 0.6) });
    }
    // 地上的影：一圈压暗的石板
    push(rock, T(ringGeo(2.05, 1.60, 0.06, 20, 0.7), 0, -0.60, 0, Math.PI / 2, 0, 0));
    muzzle = new THREE.Vector3(0, yy * 0.5, 0);

  } else if (id === 'voidjar') {
    // 须弥壶：三足铜架托一只玉壶，壶口开着一处向内塌陷的地方
    push(rock, T(cyl(1.38, 1.52, 0.26, 12, 0.7), 0, 0.13, 0));
    // 八卦盘：底座上一圈刻纹
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      push(metal, T(box(0.34, 0.04, 0.10, 1.4), Math.cos(a) * 1.06, 0.28, Math.sin(a) * 1.06, 0, -a, 0));
      push(metal, T(box(0.34, 0.04, 0.10, 1.4), Math.cos(a) * 1.06, 0.28, Math.sin(a) * 1.06, 0, -a, 0));
    }
    // 三足铜架
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.52;
      push(accent, beam(Math.cos(a) * 0.96, 0.24, Math.sin(a) * 0.96,
        Math.cos(a) * 0.40, 1.62, Math.sin(a) * 0.40, 0.13, 0.13, 0.8));
      push(accent, T(ellip2(0.16, 0.12, 0.20), Math.cos(a) * 1.00, 0.22, Math.sin(a) * 1.00));
      // 架上的云纹
      push(accent, T(box(0.30, 0.06, 0.12, 1.4), Math.cos(a) * 0.72, 0.92, Math.sin(a) * 0.72, 0, -a, 0.4));
    }
    // 玉壶：鼓腹、束颈、侈口
    push(jade, T(frustum(1.16, 1.16, 0.70, 0.70, 0.62, 0.5), 0, 1.94, 0));
    push(jade, T(frustum(0.56, 0.56, 1.14, 1.14, 0.54, 0.5), 0, 2.52, 0));
    push(jade, T(ringGeo(0.62, 0.44, 0.14, 14, 1.0), 0, 2.86, 0, Math.PI / 2, 0, 0));
    push(accent, T(ringGeo(0.62, 0.52, 0.10, 14, 1.2), 0, 1.62, 0, Math.PI / 2, 0, 0));
    // 壶口的虚空：一颗吞光的球，外面罩一层将散未散的光晕
    const hole = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + lv * 0.05, 2), C.voidCore);
    hole.position.y = 3.02;
    turret.add(hole);
    spins.push({ o: hole, axis: 'y', sp: 0.5 });
    g.userData.orb = hole;
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56 + lv * 0.07, 1), C.voidHalo);
    halo.position.y = 3.02;
    halo.castShadow = false;
    turret.add(halo);
    spins.push({ o: halo, axis: 'x', sp: -0.8 });
    // 三重玉环，各转各的轴
    const rings = 1 + lv;
    for (let i = 0; i < rings; i++) {
      const rg = new THREE.Mesh(new THREE.TorusGeometry(0.80 + i * 0.34, 0.065, 8, 32),
        i % 2 ? M.gold : (M.jadeM || M.bronze));
      rg.castShadow = false;
      const holder = new THREE.Group();
      holder.add(rg);
      holder.position.y = 3.02;
      holder.rotation.set(i === 1 ? Math.PI / 2 : 0.4, 0, i === 2 ? Math.PI / 3 : 0);
      turret.add(holder);
      spins.push({ o: holder, axis: i === 1 ? 'x' : (i === 2 ? 'z' : 'y'), sp: 0.6 + i * 0.5 });
    }
    // 被吸进去的星点：一圈向心排布的小玉粒
    const motes = new THREE.Group();
    motes.position.y = 3.02;
    for (let i = 0; i < 10 + lv * 4; i++) {
      const a = (i / (10 + lv * 4)) * Math.PI * 2 * 2.4;
      const rr = 1.35 - (i % 6) * 0.16;
      const m2 = new THREE.Mesh(ellip2(0.055, 0.055, 0.055), C.voidHalo);
      m2.position.set(Math.cos(a) * rr, Math.sin(i * 1.3) * 0.5, Math.sin(a) * rr);
      m2.castShadow = false;
      motes.add(m2);
    }
    turret.add(motes);
    spins.push({ o: motes, axis: 'y', sp: -1.5 });
    muzzle = new THREE.Vector3(0, 3.02, 0);

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

  for (const [list, mat, shadow] of [
    [wood, M.woodDark, true], [metal, M.iron, true], [accent, M.bronze, true],
    [woodR, M.woodRed, true], [rock, M.stoneCut, true],
    [jade, M.jadeM || M.stone, true], [cloth, M.cloth, false],
  ]) {
    if (!list.length || !mat) continue;
    const m = new THREE.Mesh(mergeList(list), mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    turret.add(m);
  }

  // 芯是全局共用的材质，脉动强度得各归各的，否则一座塔的呼吸会带着全谷一起闪
  if (g.userData.orb) g.userData.orb.material = g.userData.orb.material.clone();

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
    Object.assign(this.M, cores());   // 各机关的发光芯
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
    // 地脉：炎火之山炉火烘着射速偏快，幽都寒渊冻得发脆偏慢（见 levels.js 的 rules）
    const geoMult = (LEVEL.rules && LEVEL.rules.fireMult) || 1;
    const rateMult = eff * (1 + nightBonus + surge) * geoMult;

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
        if (sp.pump !== undefined) {
          // 风箱：往复鼓动，不是转
          sp.phase = (sp.phase || 0) + dt * 2.6 * (tw.isGen ? 1 : Math.max(0.15, spinRate));
          if (sp.z0 === undefined) sp.z0 = sp.o.position.z;
          sp.o.scale.z = 1 + Math.sin(sp.phase) * 0.22 * sp.pump;
          sp.o.position.z = sp.z0 + Math.sin(sp.phase) * 0.16 * sp.pump;
          continue;
        }
        if (sp.wave !== undefined) {
          // 幡与旗：只是摆，不转
          sp.phase = (sp.phase || 0) + dt * 1.6;
          if (sp.r0 === undefined) sp.r0 = sp.o.rotation.y;
          sp.o.rotation.y = sp.r0 + Math.sin(sp.phase) * sp.wave;
          sp.o.rotation.z = Math.sin(sp.phase * 1.7) * sp.wave * 0.4;
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

  // 换关：连机关网络与射程环一并拆掉
  dispose() {
    this.clear();
    if (this.links && this.links.dispose) this.links.dispose(this.scene);
    if (this.blobs && this.blobs.dispose) this.blobs.dispose(this.scene);
    if (this.rangeRing && this.rangeRing.parent) this.rangeRing.parent.remove(this.rangeRing);
  }
}

export { buildModel };
