// 栖梧谷 —— 把楼阁、水车、齿轮塔、廊桥、灯火编排成一幅画
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, plane, frustum, T, beam, MeshBuilder } from './geo.js';
import { getMaterials, setLanternLevel } from './materials.js';
import {
  addBuilding, addRoof, addRailing, addArchBridge, addPlankBridge, addPailou, addWindow,
} from './architecture.js';
import {
  Machinery, addWaterwheel, addGearTower, addDriveShaft, addTripHammers,
  addCrane, addMill, addWindmill,
} from './machinery.js';
import {
  Lanterns, addBanner, makeClothMaterial, clothUniforms, addStoneLion, addBarrel, addCrate,
  addWorkbench, addWell, addFence, addCart, addIncenseBurner, addRockCluster, addRopeLine, addSignboard,
} from './props.js';
import {
  HEART, GATES, BRIDGE, RIVER, WATER_Y, addFootprint, PATHS, TRUNK_LINE, distToRiver,
} from './layout.js';

// 建筑排布表（先登记台基，再造地形，最后落地）
const SITES = [
  // ---- 溪北台地：主寨
  { id: 'main', x: 4, z: -32, ry: -0.06, w: 15, d: 10.5, floors: 2, floorH: 4.0, balcony: true, roofH: 3.6, hip: true, big: true },
  { id: 'hallL', x: -22, z: -28, ry: 0.22, w: 11, d: 8, floors: 1, floorH: 3.8, roofH: 2.9, hip: true },
  { id: 'hallR', x: 30, z: -30, ry: -0.30, w: 10, d: 7.5, floors: 1, floorH: 3.6, roofH: 2.8, hip: true },
  { id: 'h1', x: -40, z: -42, ry: 0.42, w: 8.5, d: 6.5, floors: 1, floorH: 3.3, roofH: 2.4, hip: false },
  { id: 'h2', x: -14, z: -48, ry: -0.14, w: 9, d: 6.5, floors: 1, floorH: 3.4, roofH: 2.5, hip: true },
  { id: 'h3', x: 20, z: -48, ry: 0.18, w: 8, d: 6, floors: 1, floorH: 3.2, roofH: 2.3, hip: false },
  { id: 'h4', x: 44, z: -44, ry: -0.5, w: 8.5, d: 6.2, floors: 1, floorH: 3.3, roofH: 2.4, hip: true },
  { id: 'h5', x: -34, z: -60, ry: 0.1, w: 7.5, d: 6, floors: 1, floorH: 3.1, roofH: 2.2, hip: false },
  { id: 'h6', x: 6, z: -62, ry: 0.34, w: 8, d: 6, floors: 1, floorH: 3.2, roofH: 2.3, hip: true },
  { id: 'h7', x: 34, z: -66, ry: -0.22, w: 7, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.1, hip: false },
  { id: 'h8', x: -20, z: -76, ry: 0.5, w: 7, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.1, hip: false },
  { id: 'h9', x: 18, z: -82, ry: -0.4, w: 6.5, d: 5, floors: 1, floorH: 2.9, roofH: 2.0, hip: false },
  // ---- 溪南广场：作坊
  { id: 'shopL', x: -40, z: 14, ry: 0.32, w: 12, d: 8, floors: 1, floorH: 3.9, roofH: 2.9, hip: true, big: true },
  { id: 'shopR', x: 42, z: 10, ry: -0.36, w: 11, d: 7.5, floors: 1, floorH: 3.8, roofH: 2.8, hip: true, big: true },
  { id: 'shopS', x: 26, z: -2, ry: 0.12, w: 8, d: 6, floors: 1, floorH: 3.2, roofH: 2.3, hip: false },
  // ---- 前景檐廊（构图框景）
  { id: 'eaveL', x: -58, z: 60, ry: 0.30, w: 16, d: 7, floors: 1, floorH: 4.6, roofH: 3.2, hip: false, corridor: true, big: true },
  { id: 'eaveR', x: 58, z: 62, ry: -0.26, w: 16, d: 7, floors: 1, floorH: 4.6, roofH: 3.2, hip: false, corridor: true, big: true },
];

export function buildVillage(scene, terrain) {
  const v = new Village(scene, terrain);
  v.plan();
  return v;
}

export class Village {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.M = getMaterials();
    this.M.bannerRed = makeClothMaterial(this.M.cloth);
    this.M.bannerBlue = makeClothMaterial(this.M.clothBlue);
    this.M.bannerPale = makeClothMaterial(this.M.paperWhite);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lanterns = new Lanterns(this.M, 260);
    this.mac = new Machinery(this.M);
    this.smokeSpots = [];
    this.sites = {};
  }

  // ---- 第一步：登记台基，让地形据此找平
  plan() {
    const T2 = this.terrain;
    for (const s of SITES) {
      const y = Math.round(T2.baseHeight(s.x, s.z) * 4) / 4;
      s.y = y;
      const rx = s.w / 2 + 2.0, rz = s.d / 2 + 2.0;
      T2.registerPad(s.x, s.z, rx, rz, s.ry, y, 4.5);
      addFootprint(s.x, s.z, rx + 0.5, rz + 0.5, s.ry);
      this.sites[s.id] = s;
    }
    // 齿轮塔与水车的地台
    this.towerSite = { x: 30, z: -16, ry: -0.22 };
    this.towerSite.y = Math.round(T2.baseHeight(30, -16) * 4) / 4;
    T2.registerPad(30, -16, 5.4, 5.4, 0, this.towerSite.y, 3.5);
    addFootprint(30, -16, 6, 6, 0);

    // 社树平台
    T2.registerPad(HEART.x, HEART.z, 7.0, 7.0, 0, 0, 4);
    addFootprint(HEART.x, HEART.z, 7, 7, 0);

    // 山口关隘
    for (const g of GATES) {
      const y = Math.round(T2.baseHeight(g.x, g.z) * 4) / 4;
      g.y = y;
      T2.registerPad(g.x, g.z, 8, 5, 0, y, 4);
    }
  }

  // ---- 第二步：地形建好后落成建筑
  place() {
    const B = new MeshBuilder();
    const rng = new Rng(20240901);
    const T2 = this.terrain;
    const L = this.lanterns;

    // ============ 楼阁 ============
    for (const s of SITES) {
      if (s.corridor) { this._corridor(B, s); continue; }
      addBuilding(B, {
        x: s.x, y: s.y, z: s.z, ry: s.ry,
        w: s.w, d: s.d, floors: s.floors, floorH: s.floorH,
        hip: s.hip, roofH: s.roofH, overhang: s.big ? 1.9 : 1.5,
        balcony: s.balcony, skirtRoof: s.floors > 1,
        tileMat: rng.chance(0.35) ? 'tileDark' : 'tile',
        wallMat: rng.chance(0.72) ? 'woodDark' : 'plaster',
        postMat: rng.chance(0.3) ? 'woodRed' : 'woodDark',
        seed: s.x * 13 + s.z,
      });
      // 檐下灯笼
      const eaveY = s.y + 0.75 + s.floors * s.floorH + 0.25;
      const hw = s.w / 2 + 1.3, hd = s.d / 2 + 1.3;
      const cos = Math.cos(s.ry), sin = Math.sin(s.ry);
      for (const [lx, lz] of [[-hw, hd], [hw, hd]]) {
        const wx = s.x + cos * lx + sin * lz, wz = s.z - sin * lx + cos * lz;
        L.add(wx, eaveY - 1.0, wz, rng.range(0.85, 1.15));
      }
      if (s.big) {
        const wx = s.x + sin * hd, wz = s.z + cos * hd;
        L.add(wx, eaveY - 1.1, wz, 1.25);
      }
      // 炊烟
      if (rng.chance(0.45)) {
        this.smokeSpots.push([s.x + rng.range(-2, 2), s.y + 0.75 + s.floors * s.floorH + s.roofH + 1.2, s.z + rng.range(-2, 2)]);
      }
      // 匾额与旗
      if (s.big && s.floors >= 1) {
        const fz = s.d / 2 + 1.0;
        const wx = s.x + sin * fz, wz = s.z + cos * fz;
        addSignboard(B, wx, s.y + 0.75 + s.floorH - 0.55, wz, s.ry, 2.8, 0.9);
      }
    }

    // 主楼幡旗
    const ms = this.sites.main;
    addBanner(B, ms.x - 8.6, ms.y + 10.5, ms.z + 5.4, ms.ry, 1.1, 5.0, 'bannerRed');
    addBanner(B, ms.x + 8.6, ms.y + 10.5, ms.z + 5.4, ms.ry, 1.1, 5.0, 'bannerBlue');

    // ============ 溪上桥梁 ============
    addArchBridge(B, { x: BRIDGE.x, y: WATER_Y - 0.2, z: BRIDGE.z, ry: BRIDGE.angle, span: 18, width: 6.0, rise: 2.4, deckY: 1.9 });
    addPlankBridge(B, { x: -44, y: WATER_Y + 2.0, z: -17.6, ry: 0.06, span: 15, width: 3.2, sag: 0.35 });
    addPlankBridge(B, { x: 52, y: WATER_Y + 2.0, z: -15.4, ry: -0.1, span: 15, width: 2.8, sag: 0.35 });

    // 桥头石狮
    addStoneLion(B, -4.0, 0.1, -3.4, 0.1, 0.9);
    addStoneLion(B, 4.0, 0.1, -3.4, 0.1, 0.9);

    // ============ 牌坊（广场入口）============
    addPailou(B, { x: 0, y: 0.05, z: 2.4, ry: 0.02, w: 10, h: 6.8 });

    // ============ 山口关隘 ============
    for (const g of GATES) {
      const dir = g.x < 0 ? 1 : -1;
      for (const s2 of [-1, 1]) {
        const px = g.x + s2 * 6.5;
        B.add('stone', T(frustum(3.0, 3.2, 4.2, 4.4, 7.0, 0.3), px, g.y + 3.5, g.z));
        B.add('stoneCut', T(box(4.6, 0.5, 4.8, 0.4), px, g.y + 7.2, g.z));
        addRockCluster(B, px + s2 * 3.4, g.y, g.z + 2.0, 1.5, g.x + s2);
      }
      B.add('woodDark', T(box(16.5, 1.0, 1.1, 0.5), g.x, g.y + 7.9, g.z));
      B.add('woodDark', T(box(14.5, 0.7, 0.9, 0.5), g.x, g.y + 6.6, g.z));
      addRoof(B, g.x, g.y + 8.4, g.z, 12, 2.4, { hip: false, roofH: 1.3, overhang: 1.4, upturn: 0.8, ornaments: false, tileMat: 'tileDark' });
      L.add(g.x - 5.6, g.y + 7.2, g.z + 0.4, 1.2);
      L.add(g.x + 5.6, g.y + 7.2, g.z + 0.4, 1.2);
    }

    // ============ 机关 ============
    this._machinery(B, rng);

    // ============ 社树平台（村心）============
    this._heart(B);

    // ============ 广场陈设 ============
    this._plazaProps(B, rng);

    // ============ 沿途灯柱 ============
    this._pathLamps(B, rng);

    // 合并
    const merged = B.merge(this.M);
    this.group.add(merged);
    this.group.add(this.lanterns.group);
    this.group.add(this.mac.build());

    // 少量点光源（夜景暖光）
    const picks = [];
    for (let i = 0; i < this.lanterns.items.length; i++) {
      const it = this.lanterns.items[i];
      if (Math.abs(it.x) < 46 && it.z > -22 && it.z < 56) picks.push(i);
    }
    // 均匀挑 7 盏
    const chosen = [];
    for (let i = 0; i < 7 && picks.length; i++) chosen.push(picks[Math.floor(i * picks.length / 7)]);
    this.lanterns.addLights(this.scene, chosen);
  }

  // ---- 前景檐廊：给画面加个「框」
  _corridor(B, s) {
    const { x, y, z, ry, w, d } = s;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const rot = (px, pz) => [x + cos * px + sin * pz, z - sin * px + cos * pz];
    const H = 4.7;
    // 台基
    B.add('stoneCut', T(box(w + 2.4, 0.5, d + 1.6, 0.4), x, y + 0.25, z, 0, ry, 0));
    // 柱列
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const px = (i / n - 0.5) * w;
      for (const sz of [-1, 1]) {
        const [wx, wz] = rot(px, sz * d / 2);
        B.add('woodRed', T(cyl(0.24, 0.28, H, 10, 0.5), wx, y + H / 2 + 0.5, wz));
        B.add('stone', T(cyl(0.34, 0.38, 0.24, 10, 0.9), wx, y + 0.62, wz));
      }
    }
    // 梁
    for (const sz of [-1, 1]) {
      const [ax, az] = rot(-w / 2, sz * d / 2), [bx, bz] = rot(w / 2, sz * d / 2);
      B.add('woodDark', beam(ax, y + H + 0.36, az, bx, y + H + 0.36, bz, 0.28, 0.42, 0.5));
    }
    for (let i = 0; i <= n; i++) {
      const px = (i / n - 0.5) * w;
      const [ax, az] = rot(px, -d / 2), [bx, bz] = rot(px, d / 2);
      B.add('woodDark', beam(ax, y + H + 0.2, az, bx, y + H + 0.2, bz, 0.22, 0.3, 0.5));
    }
    // 顶
    addRoof(B, x, y + H + 0.6, z, w + 0.6, d + 0.6, {
      hip: false, roofH: s.roofH, overhang: 2.1, upturn: 1.0, ry, tileMat: 'tileDark',
    });
    // 靠背栏杆
    const [r0x, r0z] = rot(-w / 2, -d / 2), [r1x, r1z] = rot(w / 2, -d / 2);
    addRailing(B, r0x, r0z, r1x, r1z, y + 0.5, { h: 0.85, mat: 'woodRed', panel: 'latticeIce' });
    // 挂灯
    for (let i = 0; i <= n; i++) {
      if (i % 2) continue;
      const px = (i / n - 0.5) * w;
      const [wx, wz] = rot(px, d / 2 + 0.4);
      this.lanterns.add(wx, y + H - 0.35, wz, 1.35);
    }
  }

  // ---- 机关群
  _machinery(B, rng) {
    const mac = this.mac;
    const T2 = this.terrain;

    // 大水车（溪上）
    const wx = -26, wz = -15.4;
    const wy = WATER_Y - 0.6;
    addWaterwheel(mac, { x: wx, y: wy, z: wz, ry: 0.06, R: 5.6, width: 2.3, paddles: 20, speed: 0.36, flumeLen: 15, flumeH: 7.2 });
    // 水车传动 -> 岸上碓房
    addDriveShaft(mac, wx, wy + 5.3, wz + 3.4, wx + 1.2, wy + 5.3, wz + 15, { r: 0.18, speed: 0.36, groundY: 0.4 });
    mac.gear('woodDark', wx + 1.3, wy + 5.3, wz + 15.6, 1.5, 14, 0.3, { speed: 0.36, ry: 0 });
    mac.gear('wood', wx + 1.3, wy + 3.2, wz + 15.6, 0.8, 8, 0.28, { speed: -0.68, ry: 0 });

    // 第二座小水车（右侧）
    addWaterwheel(mac, { x: 40, y: WATER_Y - 0.5, z: -14.2, ry: -0.12, R: 3.4, width: 1.5, paddles: 14, speed: 0.52, flume: false });

    // 齿轮塔
    const ts = this.towerSite;
    addGearTower(mac, { x: ts.x, y: ts.y, z: ts.z, ry: ts.ry, H: 18, w: 5.0 });
    addBanner(B, ts.x + 3.6, ts.y + 15.0, ts.z + 1.0, ts.ry, 1.3, 6.4, 'bannerPale');
    this.lanterns.add(ts.x - 2.6, ts.y + 12.4, ts.z + 2.2, 1.2);
    this.lanterns.add(ts.x + 2.6, ts.y + 12.4, ts.z + 2.2, 1.2);

    // 连机碓（广场西）
    addTripHammers(mac, { x: -30, y: 0.02, z: 6, ry: 0.32, count: 3, speed: 0.85 });
    // 石磨
    addMill(mac, { x: -16, y: 0.02, z: 18, speed: 0.5 });
    addMill(mac, { x: 34, y: 0.02, z: 20, speed: -0.42 });
    // 起重架
    addCrane(mac, { x: 20, y: 0.02, z: 14, ry: 2.2, H: 9.0, reach: 5.8 });
    addCrane(mac, { x: -46, y: 0.02, z: -6, ry: -0.7, H: 7.4, reach: 4.6 });
    // 风车（高处）
    addWindmill(mac, { x: -54, y: this.terrain.baseHeight(-54, -34), z: -34, ry: 0.6, H: 8.5, R: 3.8, speed: 0.42 });
    addWindmill(mac, { x: 56, y: this.terrain.baseHeight(56, -40), z: -40, ry: -0.4, H: 7.8, R: 3.4, speed: -0.36 });

    // 长传动轴：从齿轮塔连到广场
    addDriveShaft(mac, ts.x - 2.0, ts.y + 4.2, ts.z + 2.0, -2, 4.2, 12, { r: 0.16, speed: 0.5, groundY: 0.2 });
    for (let i = 0; i < 6; i++) {
      const t = (i + 1) / 7;
      const px = lerp(ts.x - 2.0, -2, t), pz = lerp(ts.z + 2.0, 12, t);
      B.add('woodDark', T(cyl(0.15, 0.20, 4.2, 8, 0.6), px, 2.1, pz));
      B.add('wood', beam(px - 0.9, 4.0, pz, px + 0.9, 4.0, pz, 0.14, 0.14, 0.7));
    }
    mac.gear('iron', -2.6, 4.2, 12.6, 1.1, 12, 0.28, { speed: -0.72, ry: 0 });
    mac.gear('wood', -2.6, 2.2, 12.6, 0.75, 8, 0.26, { speed: 1.05, ry: 0 });

    // 水渠（石槽）沿溪北岸
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const px = lerp(-52, -12, t);
      const pz = lerp(-21.5, -19.0, t) - Math.sin(t * 3) * 0.8;
      B.add('stoneCut', T(box(5.2, 0.6, 1.3, 0.5), px, 0.35, pz, 0, 0.06, 0));
      B.add('stone', T(box(5.2, 0.35, 0.28, 0.6), px, 0.72, pz - 0.5, 0, 0.06, 0));
      B.add('stone', T(box(5.2, 0.35, 0.28, 0.6), px, 0.72, pz + 0.5, 0, 0.06, 0));
    }
  }

  // ---- 社树 · 机枢（村心）
  _heart(B) {
    const { x, z } = HEART;
    const y = 0;
    // 须弥座
    B.add('stoneCut', T(frustum(11.5, 11.5, 13.0, 13.0, 0.55, 0.34), x, y + 0.27, z));
    B.add('stone', T(frustum(9.8, 9.8, 11.2, 11.2, 0.5, 0.34), x, y + 0.8, z));
    // 八角栏杆
    const R = 6.0;
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      if (i === 6) continue;   // 留出入口
      addRailing(B, x + Math.cos(a0) * R, z + Math.sin(a0) * R, x + Math.cos(a1) * R, z + Math.sin(a1) * R,
        y + 1.05, { h: 0.9, mat: 'woodRed', panel: 'latticeIce', postEvery: 2.4 });
    }
    // 古树
    const trunkH = 19;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.add('woodDark', beam(x + Math.cos(a) * 2.3, y + 1.0, z + Math.sin(a) * 2.3,
        x + Math.cos(a) * 0.5, y + 5.6, z + Math.sin(a) * 0.5, 1.0, 1.0, 0.5));
    }
    B.add('woodDark', T(cyl(1.15, 2.1, trunkH, 14, 0.45), x, y + 1.0 + trunkH / 2, z));
    const rng = new Rng(88);
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2), t = rng.range(0.5, 0.95);
      const bl = rng.range(5.0, 8.5);
      B.add('woodDark', beam(x, y + 1 + trunkH * t, z,
        x + Math.cos(a) * bl, y + 1 + trunkH * t + bl * 0.55, z + Math.sin(a) * bl, 0.46, 0.46, 0.6));
    }
    // 树冠
    for (let i = 0; i < 58; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.pow(rng.next(), 0.55) * 8.6;
      const s = rng.range(2.6, 4.6) * (1 - rr / 14);
      const yy = y + trunkH + rng.range(-3.0, 5.0) - rr * 0.26;
      B.add(rng.chance(0.5) ? 'leafC' : 'leaf', T(plane(s, s, 1 / s),
        x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr,
        rng.range(-0.5, 0.5), rng.range(0, 6.28), rng.range(-0.4, 0.4)));
    }
    // 祈愿红绸
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rr = 2.4 + (i % 3) * 1.1;
      B.add('bannerRed', T(plane(0.42, 2.6, 1.6),
        x + Math.cos(a) * rr, y + 8.4 - (i % 4) * 0.6, z + Math.sin(a) * rr, 0, a + Math.PI / 2, 0));
    }
    // 中央机枢（青铜浑天仪式样）
    B.add('stone', T(cyl(2.0, 2.3, 0.8, 16, 0.5), x, y + 1.3, z));
    B.add('bronze', T(cyl(0.4, 0.55, 2.4, 12, 0.7), x, y + 2.9, z));
    this.heartCore = new THREE.Group();
    const ringMat = this.M.gold;
    for (let i = 0; i < 3; i++) {
      const r = 1.7 - i * 0.30;
      const g = new THREE.TorusGeometry(r, 0.075, 8, 40);
      const m = new THREE.Mesh(g, ringMat);
      m.castShadow = true;
      m.rotation.set(Math.PI / 2 * (i === 0 ? 1 : 0), 0, i === 2 ? Math.PI / 3 : (i === 1 ? Math.PI / 2 : 0));
      const holder = new THREE.Group();
      holder.add(m);
      holder.userData.spin = 0.25 + i * 0.22;
      holder.userData.axis = i === 0 ? 'y' : (i === 1 ? 'x' : 'z');
      this.heartCore.add(holder);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshStandardMaterial({
      color: 0x3a2a12, emissive: new THREE.Color(0xffb347), emissiveIntensity: 2.4,
      roughness: 0.4, metalness: 0.6,
    }));
    this.heartOrb = core;
    this.heartCore.add(core);
    this.heartCore.position.set(x, y + 5.2, z);
    this.group.add(this.heartCore);
    this.heartLight = new THREE.PointLight(0xffb347, 12, 26, 2.0);
    this.heartLight.position.set(x, y + 5.4, z);
    this.scene.add(this.heartLight);

    // 灯与香炉
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      this.lanterns.add(x + Math.cos(a) * 5.4, y + 3.3, z + Math.sin(a) * 5.4, 1.1);
      B.add('woodDark', T(cyl(0.10, 0.13, 3.3, 8, 0.7), x + Math.cos(a) * 5.4, y + 1.9, z + Math.sin(a) * 5.4));
    }
    addIncenseBurner(B, x, y + 1.0, z + 5.0, 1.2);
  }

  // ---- 广场陈设
  _plazaProps(B, rng) {
    const T2 = this.terrain;
    addWell(B, -12, 0.02, 30);
    addWorkbench(B, 14, 0.02, 26, 0.4);
    addWorkbench(B, -34, 0.02, 22, -0.6);
    addWorkbench(B, 30, 0.02, -6, 1.2);
    addCart(B, -22, 0.02, 40, 0.8);
    addCart(B, 24, 0.02, 44, -1.1);

    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(12, 46);
      const x = Math.cos(a) * r, z = 22 + Math.sin(a) * r * 0.7;
      if (Math.hypot(x - HEART.x, z - HEART.z) < 9) continue;
      if (Math.min(PATHS.left.distanceTo(x, z), PATHS.right.distanceTo(x, z)) < 4.2) continue;
      const y = T2.heightAt(x, z);
      if (rng.chance(0.5)) addBarrel(B, x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.2));
      else addCrate(B, x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    }
    // 石堆
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(24, 108);
      const x = Math.cos(a) * r, z = -14 + Math.sin(a) * r;
      if (Math.min(PATHS.left.distanceTo(x, z), PATHS.right.distanceTo(x, z)) < 4.5) continue;
      addRockCluster(B, x, T2.heightAt(x, z), z, rng.range(0.7, 1.8), i * 31 + 5);
    }
    // 溪边栅栏
    addFence(B, -14, 4.5, 16, 4.0, 0.05, 1.0);
    addFence(B, -60, 8, -46, 12, 0.05, 1.0);
  }

  // ---- 兽道两侧的灯柱
  _pathLamps(B, rng) {
    const line = TRUNK_LINE;
    const n = 12;
    for (let i = 1; i < n; i++) {
      const d = (i / n) * line.length;
      const [x, z] = line.at(d);
      const [tx, tz] = line.tangentAt(d);
      const nx = -tz, nz = tx;
      for (const s of [-1, 1]) {
        if (rng.chance(0.42)) continue;
        const px = x + nx * s * 4.6, pz = z + nz * s * 4.6;
        const y = this.terrain.heightAt(px, pz);
        if (y < -1) continue;
        B.add('stone', T(cyl(0.22, 0.30, 2.9, 8, 0.6), px, y + 1.45, pz));
        B.add('stoneCut', T(box(0.75, 0.14, 0.75, 0.8), px, y + 2.95, pz));
        B.add('paper', T(box(0.55, 0.7, 0.55, 1.0), px, y + 3.35, pz));
        B.add('tileDark', T(cone(0.62, 0.42, 4, 0.9), px, y + 3.9, pz, 0, 0.78, 0));
      }
    }
  }

  update(dt, t, dayNight) {
    this.mac.update(dt, t);
    this.lanterns.update(t, dayNight.lanternLevel);
    setLanternLevel(this.M, dayNight.lanternLevel);
    clothUniforms.uTime.value = t;
    if (this.heartCore) {
      for (const h of this.heartCore.children) {
        if (h.userData.spin) h.rotation[h.userData.axis] += dt * h.userData.spin;
      }
      const pulse = 1.9 + Math.sin(t * 1.6) * 0.5;
      this.heartOrb.material.emissiveIntensity = pulse;
      this.heartLight.intensity = 8 + Math.sin(t * 1.6) * 2.4 + dayNight.lanternLevel * 12;
    }
  }
}
