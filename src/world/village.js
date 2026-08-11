// 聚落 —— 把楼阁、机关、桥梁、灯火按当关的形制编排成一幅画
//
// 建筑排布表来自 levels.js。这里做两件事：
//   plan()  —— 先筛掉站不住的宅基（压在兽道上、泡在水里、坡太陡、彼此重叠），
//              再登记台基让地形据此找平；
//   place() —— 地形建好后落成建筑与陈设。
// 所有摆件一律用 terrain.heightAt（含台基与兽道的最终高程）定位，
// 不用 baseHeight，否则会陷进地里或浮在半空。
import * as THREE from 'three';
import { Rng, lerp, clamp } from '../core/noise.js';
import { box, cyl, cone, sphere, plane, frustum, torus, T, beam, MeshBuilder } from './geo.js';
import { getMaterials, setLanternLevel } from './materials.js';
import {
  addBuilding, addRoof, addRailing, addArchBridge, addPlankBridge, addPailou, addWindow,
  addFortHouse, addLogHouse, addStiltHouse, addPalaceHall,
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
  LEVEL, HEART, GATES, BRIDGE, RIVER, WATER_Y, WATER_KIND, WATER_SHEET,
  addFootprint, PATHS, TRUNK_LINE, distToRiver, distToAnyPath, inFootprint,
} from './layout.js';
import { DECK_FEATHER } from './levels.js';

export function buildVillage(scene, terrain) {
  const v = new Village(scene, terrain);
  v.plan();
  return v;
}

export class Village {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.L = LEVEL;
    this.V = LEVEL.village;
    this.theme = this.V.theme;
    this.M = getMaterials();
    this.M.bannerRed = makeClothMaterial(this.M.cloth);
    this.M.bannerBlue = makeClothMaterial(this.M.clothBlue);
    this.M.bannerPale = makeClothMaterial(this.M.paperWhite);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lanterns = new Lanterns(this.M, 300);
    this.mac = new Machinery(this.M);
    this.smokeSpots = [];
    this.sites = {};
    this.placed = [];
    this.lights = [];
  }

  /* ============================================================
     第一步：选址 —— 站不住的宅基直接弃掉
     ============================================================ */
  plan() {
    const T2 = this.terrain;
    const waterY = WATER_Y;
    // 各形制在墙外还要占出去多少：玉阙有三层台阶与栏板，干栏有晒台和下地
    // 的木梯，井干木屋有毛石基座与门廊。不把这一圈算进来，屋子之间、屋子
    // 与玉阶之间就会插在一起。
    const SKIRT = { palace: 3.4, stilt: 2.6, snow: 1.6, desert: 0.8, valley: 0.6 }[this.theme] || 0.6;

    for (const src of this.V.sites) {
      const s = { ...src };
      // 屋子是个矩形，用半对角线当碰撞半径，比 max(w,d)/2 贴合得多；
      // 再加上形制自带的那一圈裙房
      const rad = Math.hypot(s.w, s.d) / 2 + SKIRT;
      s._skirt = SKIRT;
      const clearPath = rad + 1.6;

      // 1. 压在兽道上的先想办法推开，推不动才弃 ——
      //    一上来就丢掉，整个村寨会空掉一大半
      if (distToAnyPath(s.x, s.z) < clearPath) {
        let fixed = false;
        for (let step = 3; step <= 16 && !fixed; step += 2.5) {
          for (const ang of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, 3.14]) {
            const away = this._pathNormal(s.x, s.z);
            const nx = away[0] * Math.cos(ang) - away[1] * Math.sin(ang);
            const nz = away[0] * Math.sin(ang) + away[1] * Math.cos(ang);
            const cx = s.x + nx * step, cz = s.z + nz * step;
            if (distToAnyPath(cx, cz) >= clearPath) { s.x = cx; s.z = cz; fixed = true; break; }
          }
        }
        if (!fixed) continue;
      }

      // 必须用 groundY（含广场找平），不能用 baseHeight ——
      // 否则广场里的宅基会比找平后的广场面高低几米，凭空出现深坑与高台
      const y = T2.groundY(s.x, s.z);

      // 2. 不能泡在水里（云海／熔岩同理）
      if (y < waterY + 1.2) continue;
      // 3. 不能骑在河上
      if (!WATER_SHEET && distToRiver(s.x, s.z) < rad + 1.5) continue;
      // 4. 社树周围留空
      if (Math.hypot(s.x - HEART.x, s.z - HEART.z) < rad + 7) continue;
      // 5. 坡太陡就别硬垫了 —— 台基会露出一大截悬空的边
      if (T2.slopeAt(s.x, s.z, rad * 0.7) > 1.35) continue;
      // 6. 不与已选中的宅基重叠。系数从 0.82 提到 0.94 ——
      //    新形制的台基比墙宽出去一大截，宽松的判定会让两栋楼咬在一起
      let clash = false;
      for (const p of this.placed) {
        const need = (rad + Math.hypot(p.w, p.d) / 2 + (p._skirt || 0)) * 0.94;
        if (Math.hypot(s.x - p.x, s.z - p.z) < need) { clash = true; break; }
      }
      if (clash) continue;

      s.y = Math.round(y * 4) / 4;
      const rx = s.w / 2 + 2.0 + SKIRT, rz = s.d / 2 + 2.0 + SKIRT;
      T2.registerPad(s.x, s.z, rx, rz, s.ry, s.y, 4.5);
      addFootprint(s.x, s.z, rx + 0.5, rz + 0.5, s.ry);
      this.sites[s.id] = s;
      this.placed.push(s);
    }

    // 齿轮塔地台
    const gt = this.V.gearTower;
    if (gt) {
      const okPath = distToAnyPath(gt.x, gt.z) > 8;
      const y = T2.groundY(gt.x, gt.z);
      if (okPath && y > waterY + 1.4) {
        this.towerSite = { ...gt, y: Math.round(y * 4) / 4 };
        T2.registerPad(gt.x, gt.z, 5.4, 5.4, 0, this.towerSite.y, 3.5);
        addFootprint(gt.x, gt.z, 6, 6, 0);
      }
    }

    // 社树平台：一律压到广场基准面
    T2.registerPad(HEART.x, HEART.z, 7.0, 7.0, 0, T2.plazaY, 4);
    addFootprint(HEART.x, HEART.z, 7, 7, 0);

    // 山口关隘
    for (const g of GATES) {
      g.y = Math.round(T2.groundY(g.x, g.z) * 4) / 4;
      T2.registerPad(g.x, g.z, 8, 5, 0, g.y, 4);
    }
  }

  // 从兽道指向外侧的单位向量：把宅基往这个方向推最省事
  _pathNormal(x, z) {
    const e = 2.0;
    const d0 = distToAnyPath(x, z);
    const gx = distToAnyPath(x + e, z) - d0;
    const gz = distToAnyPath(x, z + e) - d0;
    const l = Math.hypot(gx, gz);
    if (l < 1e-4) return [1, 0];
    return [gx / l, gz / l];
  }

  /* ============================================================
     第二步：落成
     ============================================================ */
  place() {
    const B = new MeshBuilder();
    const rng = new Rng(20240901 + this.L.index * 7717);
    const T2 = this.terrain;
    const L = this.lanterns;
    const V = this.V;

    // ---------------- 楼阁 ----------------
    for (const s of this.placed) {
      if (s.corridor) { this._corridor(B, s); continue; }
      this._house(B, s, rng);

      const eaveY = s.y + 0.75 + s.floors * s.floorH + 0.25;
      const hw = s.w / 2 + 1.3, hd = s.d / 2 + 1.3;
      const cos = Math.cos(s.ry), sin = Math.sin(s.ry);
      for (const [lx, lz] of [[-hw, hd], [hw, hd]]) {
        const wx = s.x + cos * lx + sin * lz, wz = s.z - sin * lx + cos * lz;
        L.add(wx, eaveY - 1.0, wz, rng.range(0.85, 1.15));
      }
      if (s.big) {
        L.add(s.x + sin * hd, eaveY - 1.1, s.z + cos * hd, 1.25);
      }
      if (rng.chance(0.45)) {
        this.smokeSpots.push([
          s.x + rng.range(-2, 2),
          s.y + 0.75 + s.floors * s.floorH + s.roofH + 1.2,
          s.z + rng.range(-2, 2),
        ]);
      }
      if (s.big && s.floors >= 1) {
        const fz = s.d / 2 + 1.0;
        addSignboard(B, s.x + sin * fz, s.y + 0.75 + s.floorH - 0.55, s.z + cos * fz, s.ry, 2.8, 0.9);
      }
      // 干栏船屋自带一整套木桩，不必再补
      if (V.stilts && this.theme !== 'stilt') this._stilts(B, s);
      // 雪顶：屋脊上压一层积雪
      if (V.snowCap) this._snowCap(B, s);
    }

    // 主楼幡旗
    const ms = this.sites.main;
    if (ms) {
      // 幡杆立在屋檐之外：挂在 d/2 + 出檐 之内的话，幡布会直接穿过自家瓦面
      const cos = Math.cos(ms.ry), sin = Math.sin(ms.ry);
      const outX = ms.w / 2 + 3.4, outZ = ms.d / 2 + 3.2;
      const poleY = ms.y + 0.6;
      for (const [sx, mat] of [[-1, 'bannerRed'], [1, 'bannerBlue']]) {
        const wx = ms.x + cos * (sx * outX) + sin * outZ;
        const wz = ms.z - sin * (sx * outX) + cos * outZ;
        const gy = this.terrain.heightAt(wx, wz);
        B.add('woodDark', T(cyl(0.16, 0.22, 11.0, 8, 0.6), wx, gy + 5.5, wz));
        addBanner(B, wx, gy + 9.6, wz, ms.ry, 1.1, 5.0, mat);
        addFootprint(wx, wz, 1.0, 1.0, 0);
      }
    }

    // ---------------- 桥 ----------------
    this._bridges(B, rng);

    // ---------------- 牌坊 ----------------
    if (V.pailou) {
      const p = V.pailou;
      const py = T2.heightAt(p.x, p.z);
      addPailou(B, { x: p.x, y: py + 0.05, z: p.z, ry: p.ry, w: p.w, h: p.h });
      addFootprint(p.x, p.z, p.w / 2 + 1.2, 2.2, p.ry);
    }

    // ---------------- 山口关隘 ----------------
    this._gateForts(B, L);

    // ---------------- 机关群 ----------------
    this._machinery(B, rng);

    // ---------------- 社树 ----------------
    this._heart(B);

    // ---------------- 陈设 ----------------
    this._plazaProps(B, rng);
    this._pathLamps(B, rng);
    this._pathEdging(B);
    this._terraceWalls(B);
    this._themeProps(B, rng);

    // 合并
    this.group.add(B.merge(this.M));
    this.group.add(this.lanterns.group);
    this.group.add(this.mac.build());

    // 夜景暖光：均匀挑几盏做实光源
    const picks = [];
    const cx = HEART.x, cz = HEART.z;
    for (let i = 0; i < this.lanterns.items.length; i++) {
      const it = this.lanterns.items[i];
      if (Math.hypot(it.x - cx, it.z - cz) < 70) picks.push(i);
    }
    const chosen = [];
    for (let i = 0; i < 7 && picks.length; i++) chosen.push(picks[Math.floor(i * picks.length / 7)]);
    this.lanterns.addLights(this.scene, chosen);
  }

  /* ============================================================
     一栋屋子 —— 按当关的形制选骨架
     ------------------------------------------------------------
     五关不共用同一栋房子。栖梧谷是木构楼阁；炎火之山是夯土碉楼；
     幽都寒渊是井干木屋；归墟海眼是干栏船屋；昆仑天阙是玉阙敞轩。
     剪影分别是「檐、方、尖、翘、阔」，远远一看就知道到了哪一关。
     ============================================================ */
  _house(B, s, rng) {
    const V = this.V;
    const seed = s.x * 13 + s.z;

    if (this.theme === 'desert') {
      addFortHouse(B, {
        x: s.x, y: s.y, z: s.z, ry: s.ry, w: s.w, d: s.d,
        floors: s.floors, floorH: s.floorH,
        wallMat: rng.chance(0.7) ? V.wallA : V.wallB,
        postMat: V.postMat, stoneMat: V.stoneMat, cutMat: V.cutMat,
        seed, big: s.big,
      });
      return;
    }
    if (this.theme === 'snow') {
      addLogHouse(B, {
        x: s.x, y: s.y, z: s.z, ry: s.ry, w: s.w, d: s.d,
        floors: s.floors, floorH: s.floorH, roofH: s.roofH + 1.1,
        logMat: rng.chance(0.35) ? 'wood' : 'woodDark',
        roofMat: V.roofA, stoneMat: V.stoneMat, cutMat: V.cutMat,
        seed, big: s.big,
      });
      return;
    }
    if (this.theme === 'stilt') {
      addStiltHouse(B, {
        x: s.x, y: s.y, z: s.z, ry: s.ry, w: s.w, d: s.d,
        floors: s.floors, floorH: s.floorH, roofH: s.roofH,
        lift: s.big ? 2.6 : 2.1,
        postMat: V.postMat, wallMat: rng.chance(0.6) ? V.wallA : V.wallB,
        roofMat: rng.chance(0.4) ? V.roofB : V.roofA,
        groundY: this.terrain.heightAt(s.x, s.z),
        seed, big: s.big,
      });
      return;
    }
    if (this.theme === 'palace') {
      addPalaceHall(B, {
        x: s.x, y: s.y, z: s.z, ry: s.ry, w: s.w, d: s.d,
        floors: s.floors, floorH: s.floorH, roofH: s.roofH,
        jadeMat: V.cutMat, postMat: V.postMat, roofMat: V.roofA, cutMat: V.cutMat,
        seed, big: s.big,
      });
      return;
    }
    // 栖梧谷：老样子的木构楼阁
    addBuilding(B, {
      x: s.x, y: s.y, z: s.z, ry: s.ry,
      w: s.w, d: s.d, floors: s.floors, floorH: s.floorH,
      hip: s.hip, roofH: s.roofH, overhang: s.big ? 1.9 : 1.5,
      balcony: s.balcony, skirtRoof: s.floors > 1,
      tileMat: rng.chance(0.35) ? V.roofB : V.roofA,
      wallMat: rng.chance(0.72) ? V.wallA : V.wallB,
      postMat: rng.chance(0.3) ? V.postMat : 'woodDark',
      seed,
    });
  }

  /* ---- 干栏木桩：台基悬空的一侧支起柱子，不再是一块飘着的板 ---- */
  _stilts(B, s) {
    const T2 = this.terrain;
    const cos = Math.cos(s.ry), sin = Math.sin(s.ry);
    const hw = s.w / 2 + 0.8, hd = s.d / 2 + 0.8;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const lx = i * hw, lz = j * hd;
        const wx = s.x + cos * lx + sin * lz, wz = s.z - sin * lx + cos * lz;
        const gy = T2.heightAt(wx, wz);
        const top = s.y + 0.5;
        if (top - gy < 0.5) continue;               // 贴着地就不用桩
        const h = top - gy + 0.4;
        B.add('wood', T(cyl(0.20, 0.26, h, 8, 0.6), wx, gy + h / 2 - 0.2, wz));
        // 斜撑
        if (Math.abs(i) + Math.abs(j) === 1) {
          B.add('wood', beam(wx, gy + h * 0.35, wz, s.x + cos * lx * 0.4 + sin * lz * 0.4,
            top, s.z - sin * lx * 0.4 + cos * lz * 0.4, 0.10, 0.10, 0.8));
        }
      }
    }
  }

  /* ---- 屋顶积雪 ---- */
  // 井干木屋的屋面又陡又高，基座也厚，积雪得照它的尺寸落，
  // 否则那块雪会浮在半空或埋进屋脊里
  _snowCap(B, s) {
    const logBase = 1.05 + 0.1;                       // addLogHouse 的石基
    const eaveY = s.y + logBase + s.floors * s.floorH + 0.2;
    const roofH = s.roofH + 1.1;
    const rng = new Rng(s.x * 31 + s.z * 17 + 5);
    const cos = Math.cos(s.ry), sin = Math.sin(s.ry);

    // 沿两面坡各压两条雪带，只贴着屋脊那一段。
    // 铺满整个坡面的话，屋子远看就是一块白板 —— 陡坡、压石、山墙全糊掉了，
    // 五关又变成「同一栋房子换了个颜色」。檐口那一截一定要留出深色的瓦。
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const t = 0.16 + i * 0.26;                    // 0 脊 -> 1 檐，只走到四成
        const lz = sd * t * (s.d / 2 + 1.0);
        const yy = eaveY + roofH * (1 - Math.pow(t, 1.25)) + 0.09;
        const wxs = s.w * (0.72 - i * 0.10);
        const wx = s.x + sin * lz, wz = s.z + cos * lz;
        B.add('snowM', T(box(wxs, 0.16, (s.d + 2.0) * 0.15, 0.4),
          wx, yy, wz, sd * 0.46, s.ry, 0));
      }
    }
    // 檐口积起来的一道雪唇：断断续续，不连成一条直线
    for (const sd of [-1, 1]) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        if (rng.chance(0.35)) continue;
        const lx = ((i + 0.5) / n - 0.5) * s.w * 1.05;
        const lz = sd * (s.d / 2 + 0.95);
        const wx = s.x + cos * lx + sin * lz, wz = s.z - sin * lx + cos * lz;
        B.add('snowM', T(box(s.w / n * 0.86, 0.14, 0.44, 0.5), wx, eaveY + 0.22, wz, 0, s.ry, 0));
      }
    }
    // 檐口垂下的冰凌
    for (let i = 0; i < 12; i++) {
      const lx = rng.range(-1, 1) * (s.w / 2 + 0.9);
      const lz = (rng.chance(0.5) ? 1 : -1) * (s.d / 2 + 1.0);
      const wx = s.x + cos * lx + sin * lz, wz = s.z - sin * lx + cos * lz;
      const len = rng.range(0.4, 1.1);
      B.add('iceM', T(cone(0.075, len, 5, 1.4), wx, eaveY + 0.15 - len / 2, wz, Math.PI, 0, 0));
    }
  }

  /* ---- 前景檐廊：给画面加个「框」 ---- */
  _corridor(B, s) {
    const { x, y, z, ry, w, d } = s;
    const V = this.V;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const rot = (px, pz) => [x + cos * px + sin * pz, z - sin * px + cos * pz];
    const H = 4.7;
    B.add(V.cutMat, T(box(w + 2.4, 0.5, d + 1.6, 0.4), x, y + 0.25, z, 0, ry, 0));
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const px = (i / n - 0.5) * w;
      for (const sz of [-1, 1]) {
        const [wx, wz] = rot(px, sz * d / 2);
        B.add(V.postMat, T(cyl(0.24, 0.28, H, 10, 0.5), wx, y + H / 2 + 0.5, wz));
        B.add(V.stoneMat, T(cyl(0.34, 0.38, 0.24, 10, 0.9), wx, y + 0.62, wz));
      }
    }
    for (const sz of [-1, 1]) {
      const [ax, az] = rot(-w / 2, sz * d / 2), [bx, bz] = rot(w / 2, sz * d / 2);
      B.add('woodDark', beam(ax, y + H + 0.36, az, bx, y + H + 0.36, bz, 0.28, 0.42, 0.5));
    }
    for (let i = 0; i <= n; i++) {
      const px = (i / n - 0.5) * w;
      const [ax, az] = rot(px, -d / 2), [bx, bz] = rot(px, d / 2);
      B.add('woodDark', beam(ax, y + H + 0.2, az, bx, y + H + 0.2, bz, 0.22, 0.3, 0.5));
    }
    addRoof(B, x, y + H + 0.6, z, w + 0.6, d + 0.6, {
      hip: false, roofH: s.roofH, overhang: 2.1, upturn: 1.0, ry, tileMat: V.roofB,
    });
    const [r0x, r0z] = rot(-w / 2, -d / 2), [r1x, r1z] = rot(w / 2, -d / 2);
    addRailing(B, r0x, r0z, r1x, r1z, y + 0.5, { h: 0.85, mat: V.postMat, panel: 'latticeIce' });
    for (let i = 0; i <= n; i += 2) {
      const px = (i / n - 0.5) * w;
      const [wx, wz] = rot(px, d / 2 + 0.4);
      this.lanterns.add(wx, y + H - 0.35, wz, 1.35);
    }
  }

  /* ---- 桥 ---- */
  _bridges(B, rng) {
    const T2 = this.terrain;
    if (BRIDGE) {
      // 桥面高程与 levels.js 的 bridgeDeck 用同一组参数，
      // 两边对不上的话凶兽就会从桥拱底下穿过去。
      // 桥面还必须比被抬起来的那条土带更宽（halfW + DECK_FEATHER），
      // 再加侧墙砌到水下，桥下的土才不会从两边漏出来把河截断。
      const halfDeck = BRIDGE.halfW + DECK_FEATHER;
      addArchBridge(B, {
        x: BRIDGE.x, y: 0, z: BRIDGE.z, ry: BRIDGE.angle,
        span: BRIDGE.span, width: halfDeck * 2 + 0.9,
        rise: BRIDGE.rise, deckY: BRIDGE.y,
        skirtY: WATER_Y - 2.2,
        stoneMat: this.V.stoneMat, cutMat: this.V.cutMat,
      });
      addStoneLion(B, BRIDGE.x - 4.0, T2.heightAt(BRIDGE.x - 4, BRIDGE.z + 10) + 0.1, BRIDGE.z + 10, 0.1, 0.9);
      addStoneLion(B, BRIDGE.x + 4.0, T2.heightAt(BRIDGE.x + 4, BRIDGE.z + 10) + 0.1, BRIDGE.z + 10, 0.1, 0.9);
    }
    // 溪上的两道便桥（只在有明确河道的关卡）
    if (!WATER_SHEET) {
      for (const [bx, bz, ry, span, wd] of [[-44, -17.6, 0.06, 15, 3.2], [52, -15.4, -0.1, 15, 2.8]]) {
        const p = RIVER.distanceTo(bx, bz);
        if (p > 14) continue;                       // 河不在这儿就别架桥
        addPlankBridge(B, { x: bx, y: WATER_Y + 2.0, z: bz, ry, span, width: wd, sag: 0.35 });
      }
    }
  }

  /* ---- 山口关隘 ---- */
  _gateForts(B, L) {
    const V = this.V;
    for (const g of GATES) {
      for (const s2 of [-1, 1]) {
        const px = g.x + s2 * 6.5;
        B.add(V.stoneMat, T(frustum(3.0, 3.2, 4.2, 4.4, 7.0, 0.3), px, g.y + 3.5, g.z));
        B.add(V.cutMat, T(box(4.6, 0.5, 4.8, 0.4), px, g.y + 7.2, g.z));
        addRockCluster(B, px + s2 * 3.4, this.terrain.heightAt(px + s2 * 3.4, g.z + 2.0), g.z + 2.0, 1.5, g.x + s2);
      }
      B.add('woodDark', T(box(16.5, 1.0, 1.1, 0.5), g.x, g.y + 7.9, g.z));
      B.add('woodDark', T(box(14.5, 0.7, 0.9, 0.5), g.x, g.y + 6.6, g.z));
      addRoof(B, g.x, g.y + 8.4, g.z, 12, 2.4, {
        hip: false, roofH: 1.3, overhang: 1.4, upturn: 0.8, ornaments: false, tileMat: V.roofB,
      });
      L.add(g.x - 5.6, g.y + 7.2, g.z + 0.4, 1.2);
      L.add(g.x + 5.6, g.y + 7.2, g.z + 0.4, 1.2);
    }
  }

  /* ---- 机关群：按当关的动力来源换样 ---- */
  _machinery(B, rng) {
    const mac = this.mac;
    const T2 = this.terrain;
    const ts = this.towerSite;

    if (ts) {
      addGearTower(mac, { x: ts.x, y: ts.y, z: ts.z, ry: ts.ry, H: ts.H, w: ts.w });
      addBanner(B, ts.x + 3.6, ts.y + ts.H * 0.83, ts.z + 1.0, ts.ry, 1.3, 6.4, 'bannerPale');
      this.lanterns.add(ts.x - 2.6, ts.y + ts.H * 0.69, ts.z + 2.2, 1.2);
      this.lanterns.add(ts.x + 2.6, ts.y + ts.H * 0.69, ts.z + 2.2, 1.2);
    }

    // 临水的关卡才有水车
    if (WATER_KIND === 'river') {
      const wx = -26, wz = -15.4;
      const wy = WATER_Y - 0.6;
      addWaterwheel(mac, { x: wx, y: wy, z: wz, ry: 0.06, R: 5.6, width: 2.3, paddles: 20, speed: 0.36, flumeLen: 15, flumeH: 7.2 });
      addFootprint(wx, wz, 7.0, 4.0, 0.06);
      addDriveShaft(mac, wx, wy + 5.3, wz + 3.4, wx + 1.2, wy + 5.3, wz + 15, { r: 0.18, speed: 0.36, groundY: 0.4 });
      mac.gear('woodDark', wx + 1.3, wy + 5.3, wz + 15.6, 1.5, 14, 0.3, { speed: 0.36, ry: 0 });
      mac.gear('wood', wx + 1.3, wy + 3.2, wz + 15.6, 0.8, 8, 0.28, { speed: -0.68, ry: 0 });
      addWaterwheel(mac, { x: 40, y: WATER_Y - 0.5, z: -14.2, ry: -0.12, R: 3.4, width: 1.5, paddles: 14, speed: 0.52, flume: false });
      addFootprint(40, -14.2, 4.6, 3.0, -0.12);
    }

    // 风车：哪一关都立得住，风大的关卡多摆几架
    const windCount = this.L.climate.wind > 1.4 ? 4 : 2;
    const spots = [[-54, -34, 0.6, 8.5, 3.8, 0.42], [56, -40, -0.4, 7.8, 3.4, -0.36],
                   [-64, 10, 0.9, 9.2, 4.0, 0.34], [66, 6, -0.8, 8.6, 3.6, -0.44]];
    for (let i = 0; i < windCount; i++) {
      const [mx, mz, mry, mh, mr, msp] = spots[i];
      if (distToAnyPath(mx, mz) < 8) continue;
      const y = T2.heightAt(mx, mz);
      if (y < WATER_Y + 1.0) continue;
      addWindmill(mac, { x: mx, y, z: mz, ry: mry, H: mh, R: mr, speed: msp });
      addFootprint(mx, mz, mr + 1.4, mr + 1.4, 0);
    }

    // 作坊：广场基准面上的连机碓、石磨、起重架
    const py = T2.plazaY;
    const shop = (fn, x, z, o, fx = 3.0, fz = 3.0) => {
      if (distToAnyPath(x, z) < 6 || inFootprint(x, z, 2)) return;
      if (T2.heightAt(x, z) < WATER_Y + 1.0) return;
      // 平底构件摆在坎上会一角翘起来，先看这块地平不平
      if (T2.reliefAt(x, z, Math.max(fx, fz) * 0.8) > 0.7) return;
      fn(mac, { x, y: T2.surfaceY(x, z) + 0.02, z, ...o });
      addFootprint(x, z, fx, fz, 0);
    };
    shop(addTripHammers, -30, 6, { ry: 0.32, count: 3, speed: 0.85 }, 4.5, 3.4);
    shop(addMill, -16, 18, { speed: 0.5 }, 3.0, 3.0);
    shop(addMill, 34, 20, { speed: -0.42 }, 3.0, 3.0);
    shop(addCrane, 20, 14, { ry: 2.2, H: 9.0, reach: 5.8 }, 6.4, 6.4);
    shop(addCrane, -46, -6, { ry: -0.7, H: 7.4, reach: 4.6 }, 5.2, 5.2);

    // 齿轮塔通向广场的长传动轴
    if (ts) {
      const ex = -2, ez = 12;
      const ey = T2.heightAt(ex, ez) + 4.2;
      addDriveShaft(mac, ts.x - 2.0, ts.y + 4.2, ts.z + 2.0, ex, ey, ez, { r: 0.16, speed: 0.5, groundY: 0.2 });
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 7;
        const px = lerp(ts.x - 2.0, ex, t), pz = lerp(ts.z + 2.0, ez, t);
        const gy = T2.heightAt(px, pz);
        const topY = lerp(ts.y + 4.2, ey, t);
        if (topY - gy < 1.0) continue;
        const hgt = topY - gy;
        B.add('woodDark', T(cyl(0.15, 0.20, hgt, 8, 0.6), px, gy + hgt / 2, pz));
        B.add('wood', beam(px - 0.9, topY - 0.2, pz, px + 0.9, topY - 0.2, pz, 0.14, 0.14, 0.7));
      }
      mac.gear('iron', ex - 0.6, ey, ez + 0.6, 1.1, 12, 0.28, { speed: -0.72, ry: 0 });
      mac.gear('wood', ex - 0.6, ey - 2.0, ez + 0.6, 0.75, 8, 0.26, { speed: 1.05, ry: 0 });
    }
  }

  /* ---- 社树 · 机枢（村心）---- */
  _heart(B) {
    const { x, z } = HEART;
    const y = this.terrain.plazaY;
    const V = this.V;
    const theme = this.theme;

    // 须弥座
    B.add(V.cutMat, T(frustum(11.5, 11.5, 13.0, 13.0, 0.55, 0.34), x, y + 0.27, z));
    B.add(V.stoneMat, T(frustum(9.8, 9.8, 11.2, 11.2, 0.5, 0.34), x, y + 0.8, z));

    // 八角栏杆
    const R = 6.0;
    for (let i = 0; i < 8; i++) {
      if (i === 6) continue;   // 留出入口
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      addRailing(B, x + Math.cos(a0) * R, z + Math.sin(a0) * R, x + Math.cos(a1) * R, z + Math.sin(a1) * R,
        y + 1.05, { h: 0.9, mat: V.postMat, panel: 'latticeIce', postEvery: 2.4 });
    }

    // 神木：各关形制不同
    const trunkMat = theme === 'palace' ? 'jadeM' : (theme === 'stilt' ? 'coralM' : 'woodDark');
    const leafA = theme === 'desert' ? 'leafPine' : (theme === 'snow' ? 'leafPine' : 'leafC');
    const leafB = theme === 'desert' ? 'leafC' : 'leaf';
    const trunkH = theme === 'desert' ? 15 : 19;

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.add(trunkMat, beam(x + Math.cos(a) * 2.3, y + 1.0, z + Math.sin(a) * 2.3,
        x + Math.cos(a) * 0.5, y + 5.6, z + Math.sin(a) * 0.5, 1.0, 1.0, 0.5));
    }
    B.add(trunkMat, T(cyl(1.15, 2.1, trunkH, 14, 0.45), x, y + 1.0 + trunkH / 2, z));

    const rng = new Rng(88 + this.L.index * 13);
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2), t = rng.range(0.5, 0.95);
      const bl = rng.range(5.0, 8.5);
      B.add(trunkMat, beam(x, y + 1 + trunkH * t, z,
        x + Math.cos(a) * bl, y + 1 + trunkH * t + bl * 0.55, z + Math.sin(a) * bl, 0.46, 0.46, 0.6));
    }

    // 树冠：炎火之山的社树已成焦木，只挂零星的火叶
    const crownN = theme === 'desert' ? 22 : 58;
    for (let i = 0; i < crownN; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.pow(rng.next(), 0.55) * 8.6;
      const s = rng.range(2.6, 4.6) * (1 - rr / 14);
      const yy = y + trunkH + rng.range(-3.0, 5.0) - rr * 0.26;
      B.add(rng.chance(0.5) ? leafA : leafB, T(plane(s, s, 1 / s),
        x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr,
        rng.range(-0.5, 0.5), rng.range(0, 6.28), rng.range(-0.4, 0.4)));
    }
    // 冰封的社树：枝上挂冰
    if (theme === 'snow') {
      for (let i = 0; i < 26; i++) {
        const a = rng.range(0, Math.PI * 2), rr = rng.range(1.5, 8.0);
        const len = rng.range(0.6, 1.8);
        B.add('iceM', T(cone(0.10, len, 5, 1.2),
          x + Math.cos(a) * rr, y + trunkH * rng.range(0.5, 1.0), z + Math.sin(a) * rr, Math.PI, 0, 0));
      }
    }

    // 祈愿红绸
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rr = 2.4 + (i % 3) * 1.1;
      B.add('bannerRed', T(plane(0.42, 2.6, 1.6),
        x + Math.cos(a) * rr, y + 8.4 - (i % 4) * 0.6, z + Math.sin(a) * rr, 0, a + Math.PI / 2, 0));
    }

    // 中央机枢（浑天仪式样）
    B.add(V.stoneMat, T(cyl(2.0, 2.3, 0.8, 16, 0.5), x, y + 1.3, z));
    B.add('bronze', T(cyl(0.4, 0.55, 2.4, 12, 0.7), x, y + 2.9, z));
    this.heartCore = new THREE.Group();
    const ringMat = this.M.gold;
    for (let i = 0; i < 3; i++) {
      const r = 1.7 - i * 0.30;
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 8, 40), ringMat);
      m.castShadow = true;
      m.rotation.set(Math.PI / 2 * (i === 0 ? 1 : 0), 0, i === 2 ? Math.PI / 3 : (i === 1 ? Math.PI / 2 : 0));
      const holder = new THREE.Group();
      holder.add(m);
      holder.userData.spin = 0.25 + i * 0.22;
      holder.userData.axis = i === 0 ? 'y' : (i === 1 ? 'x' : 'z');
      this.heartCore.add(holder);
    }
    const orbColor = { valley: 0xffb347, desert: 0xff6a22, snow: 0x7fd8ff, stilt: 0x54e0c8, palace: 0xc9a6ff }[theme];
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshStandardMaterial({
      color: 0x3a2a12, emissive: new THREE.Color(orbColor), emissiveIntensity: 2.4,
      roughness: 0.4, metalness: 0.6,
    }));
    this.heartOrb = core;
    this.heartCore.add(core);
    this.heartCore.position.set(x, y + 5.2, z);
    this.group.add(this.heartCore);
    this.heartLight = new THREE.PointLight(orbColor, 12, 26, 2.0);
    this.heartLight.position.set(x, y + 5.4, z);
    this.scene.add(this.heartLight);
    this.lights.push(this.heartLight);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      this.lanterns.add(x + Math.cos(a) * 5.4, y + 3.3, z + Math.sin(a) * 5.4, 1.1);
      B.add('woodDark', T(cyl(0.10, 0.13, 3.3, 8, 0.7), x + Math.cos(a) * 5.4, y + 1.9, z + Math.sin(a) * 5.4));
    }
    addIncenseBurner(B, x, y + 1.0, z + 5.0, 1.2);
  }

  /* ---- 广场陈设 ---- */
  _plazaProps(B, rng) {
    const T2 = this.terrain;
    const py = T2.plazaY;
    const ok = (x, z, pad = 3) =>
      distToAnyPath(x, z) > 4.2 &&
      !inFootprint(x, z, pad) &&
      distToRiver(x, z) > 7.0 &&
      T2.surfaceY(x, z) > WATER_Y + 0.8 &&
      Math.hypot(x - HEART.x, z - HEART.z) > 9 &&
      T2.isFlat(x, z, 1.8, 0.6);

    const put = (fn, x, z, ...rest) => { if (ok(x, z)) fn(B, x, T2.surfaceY(x, z) + 0.02, z, ...rest); };
    if (this.theme !== 'palace') put(addWell, -12, 30);
    put(addWorkbench, 14, 26, 0.4);
    put(addWorkbench, -34, 22, -0.6);
    put(addWorkbench, 30, -6, 1.2);
    put(addCart, -22, 40, 0.8);
    put(addCart, 24, 44, -1.1);

    // 桶与箱
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(12, 46);
      const x = HEART.x + Math.cos(a) * r, z = HEART.z - 25 + Math.sin(a) * r * 0.7;
      if (!ok(x, z, 2)) continue;
      const y = T2.surfaceY(x, z);
      if (rng.chance(0.5)) addBarrel(B, x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.2));
      else addCrate(B, x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    }

    // 石堆：只落在平处，坡上一半悬空最难看
    for (let i = 0; i < 30; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(24, 108);
      const x = Math.cos(a) * r, z = this.L.geo.center.z + Math.sin(a) * r;
      if (distToAnyPath(x, z) < 4.5) continue;
      if (inFootprint(x, z, 1.5)) continue;
      if (distToRiver(x, z) < 6.5) continue;
      const y = T2.surfaceY(x, z);
      if (y < WATER_Y + 0.6) continue;
      if (!T2.isFlat(x, z, 2.0, 1.1)) continue;
      addRockCluster(B, x, y, z, rng.range(0.7, 1.8), i * 31 + 5);
    }

    // 栅栏
    for (const [x0, z0, x1, z1] of [[-14, 4.5, 16, 4.0], [-60, 8, -46, 12]]) {
      if (!ok(x0, z0, 2) || !ok(x1, z1, 2)) continue;
      addFence(B, x0, z0, x1, z1, T2.heightAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.05, 1.0);
    }
  }

  /* ---- 兽道两侧的灯柱 ---- */
  _pathLamps(B, rng) {
    const line = TRUNK_LINE;
    const T2 = this.terrain;
    const n = 12;
    for (let i = 1; i < n; i++) {
      const d = (i / n) * line.length;
      const [x, z] = line.at(d);
      const [tx, tz] = line.tangentAt(d);
      const nx = -tz, nz = tx;
      for (const s of [-1, 1]) {
        if (rng.chance(0.42)) continue;
        const px = x + nx * s * 4.6, pz = z + nz * s * 4.6;
        const y = T2.surfaceY(px, pz);
        if (y < WATER_Y + 0.8) continue;
        if (inFootprint(px, pz, 0.8)) continue;
        if (T2.reliefAt(px, pz, 1.0) > 0.9) continue;
        B.add(this.V.stoneMat, T(cyl(0.22, 0.30, 2.9, 8, 0.6), px, y + 1.45, pz));
        B.add(this.V.cutMat, T(box(0.75, 0.14, 0.75, 0.8), px, y + 2.95, pz));
        B.add('paper', T(box(0.55, 0.7, 0.55, 1.0), px, y + 3.35, pz));
        B.add(this.V.roofB, T(cone(0.62, 0.42, 4, 0.9), px, y + 3.9, pz, 0, 0.78, 0));
      }
    }
  }

  /* ---- 兽道石牙：路沿一线错落的碎石 ---- */
  _pathEdging(B) {
    const T2 = this.terrain;
    const V = this.V;
    const rng = new Rng(7712 + this.L.index * 91);
    const trunkLen = TRUNK_LINE.length;
    const runs = [
      [PATHS.left, 2, PATHS.left.length - trunkLen],
      [PATHS.right, 2, PATHS.right.length - trunkLen],
      [TRUNK_LINE, 1, trunkLen - 1],
    ];
    // 栈桥关卡：石牙换成栏板，路边才不至于是一道断崖
    const rail = !!V.railPath;
    for (const [line, from, to] of runs) {
      for (let d = from; d < to; d += rail ? 3.2 : 1.95) {
        const [x, z] = line.at(d);
        const [tx, tz] = line.tangentAt(d);
        const nx = -tz, nz = tx;
        const ang = Math.atan2(tx, tz);
        for (const sd of [-1, 1]) {
          if (!rail && rng.chance(0.14)) continue;   // 缺几颗才像用了很多年
          const off = rail ? 4.4 : 3.6 + rng.range(-0.25, 0.25);
          const px = x + nx * sd * off, pz = z + nz * sd * off;
          if (distToRiver(px, pz) < 5.0) continue;
          if (inFootprint(px, pz, 0.6)) continue;
          const y = T2.surfaceY(px, pz);
          if (y < WATER_Y + 0.6) continue;
          if (rail) {
            // 栏板：望柱 + 云纹板
            B.add(V.cutMat, T(box(0.34, 1.05, 0.34, 0.8), px, y + 0.52, pz, 0, ang, 0));
            B.add(V.cutMat, T(box(0.44, 0.16, 0.44, 0.9), px, y + 1.12, pz, 0, ang + 0.4, 0));
            B.add(V.stoneMat, T(box(0.16, 0.52, 3.0, 0.7), px, y + 0.62, pz, 0, ang, 0));
          } else {
            const w = rng.range(0.52, 0.94), h = rng.range(0.24, 0.44);
            B.add(rng.chance(0.45) ? V.stoneMat : V.cutMat, T(
              box(w, h + 0.3, 0.46, 0.9), px, y + h * 0.36, pz,
              rng.range(-0.07, 0.07), ang + rng.range(-0.2, 0.2), rng.range(-0.06, 0.06)));
          }
        }
      }
    }
  }

  /* ---- 梯田／冰坎的石砌坎口 ---- */
  _terraceWalls(B) {
    const risers = this.V.terraceRisers;
    if (!risers || !risers.length) return;
    const T2 = this.terrain;
    const V = this.V;
    const rng = new Rng(4531 + this.L.index * 37);
    for (const zr of risers) {
      let gap = 0;
      for (let x = -74; x <= 74; x += 2.9) {
        if (gap > 0) { gap--; continue; }
        if (rng.chance(0.13)) { gap = 1 + (rng.next() * 2 | 0); continue; }
        const zz = zr + Math.sin(x * 0.07) * 1.6;
        const yHi = T2.heightAt(x, zz - 1.7);
        const yLo = T2.heightAt(x, zz + 1.7);
        const drop = yHi - yLo;
        if (drop < 1.3 || drop > 7) continue;
        if (distToRiver(x, zz) < 8) continue;
        if (inFootprint(x, zz, 1.2)) continue;
        if (distToAnyPath(x, zz) < 4.5) continue;
        const top = yHi + 0.16, bot = yLo - 0.7;
        B.add(V.cutMat, T(box(2.9, top - bot, 0.95, 0.62), x, (top + bot) / 2, zz, 0, rng.range(-0.05, 0.05), 0));
        B.add(V.stoneMat, T(box(2.95, 0.18, 1.18, 0.75), x, top - 0.09, zz, 0, 0, 0));
      }
    }
  }

  /* ============================================================
     各关的招牌陈设
     ============================================================ */
  _themeProps(B, rng) {
    const T2 = this.terrain;
    const V = this.V;
    const put = (x, z, pad = 2) =>
      distToAnyPath(x, z) > 5 && !inFootprint(x, z, pad) &&
      distToRiver(x, z) > 7.0 &&
      T2.surfaceY(x, z) > WATER_Y + 0.8 && T2.isFlat(x, z, 2.0, 0.9);

    if (this.theme === 'desert') {
      // 火盆：绕广场一圈的长明火
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = HEART.x + Math.cos(a) * 22, z = HEART.z - 12 + Math.sin(a) * 18;
        if (!put(x, z)) continue;
        const y = T2.heightAt(x, z);
        B.add(V.stoneMat, T(cyl(0.5, 0.72, 1.5, 8, 0.6), x, y + 0.75, z));
        B.add('bronze', T(cyl(1.05, 0.62, 0.62, 12, 0.6), x, y + 1.72, z));
        B.add('magma', T(cyl(0.86, 0.86, 0.18, 12, 0.6), x, y + 1.96, z));
        this.lanterns.add(x, y + 2.3, z, 1.5);
      }
      // 风蚀石柱：谷中散落的雅丹残柱
      for (let i = 0; i < 26; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(30, 105);
        const x = Math.cos(a) * r, z = -10 + Math.sin(a) * r;
        if (!put(x, z, 3)) continue;
        const y = T2.surfaceY(x, z);
        const h = rng.range(3.0, 9.0), w = rng.range(1.4, 3.2);
        // 上大下小：风把根部掏细了，这是雅丹的样子
        B.add('rockRedM', T(frustum(w * 1.15, w * 0.95, w * 0.52, w * 0.46, h, 0.35), x, y + h / 2, z, 0, rng.range(0, 3.14), 0));
        B.add('rockRedM', T(box(w * 1.3, 0.42, w * 1.1, 0.5), x, y + h - 0.1, z, 0, rng.range(0, 3.14), 0));
      }
      // 冷却的熔岩壳：熔岩沟两侧翻起的黑色碎块
      for (let i = 0; i < 40; i++) {
        const d = rng.range(4, RIVER.length - 4);
        const [rx, rz] = RIVER.at(d);
        const [tx, tz] = RIVER.tangentAt(d);
        const off = (rng.chance(0.5) ? 1 : -1) * rng.range(6, 12);
        const x = rx - tz * off, z = rz + tx * off;
        if (Math.hypot(x, z + 10) > 120) continue;
        const y = T2.surfaceY(x, z);
        if (y < WATER_Y) continue;
        B.add('obsidian', T(box(rng.range(1.2, 3.0), rng.range(0.5, 1.4), rng.range(1.0, 2.4), 0.5),
          x, y + 0.3, z, rng.range(-0.3, 0.3), rng.range(0, 3.14), rng.range(-0.3, 0.3)));
      }
    }

    if (this.theme === 'snow') {
      // 冰塔林：谷中散布的冰笋
      for (let i = 0; i < 44; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(34, 110);
        const x = Math.cos(a) * r, z = -16 + Math.sin(a) * r;
        if (distToAnyPath(x, z) < 5 || inFootprint(x, z, 2)) continue;
        const y = T2.surfaceY(x, z);
        if (y < WATER_Y + 0.6) continue;
        const h = rng.range(2.4, 7.5);
        B.add('iceM', T(cone(rng.range(0.6, 1.5), h, 6, 0.7), x, y + h / 2, z, rng.range(-0.12, 0.12), rng.range(0, 3.14), rng.range(-0.12, 0.12)));
        if (rng.chance(0.5)) {
          const h2 = h * rng.range(0.4, 0.7);
          B.add('iceM', T(cone(rng.range(0.4, 0.9), h2, 5, 0.8), x + rng.range(-1.4, 1.4), y + h2 / 2, z + rng.range(-1.4, 1.4), 0, rng.range(0, 3.14), 0));
        }
      }
      // 雪堆：贴着屋角与石头堆起来的一坨坨
      for (let i = 0; i < 60; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(14, 90);
        const x = Math.cos(a) * r, z = -16 + Math.sin(a) * r;
        if (distToAnyPath(x, z) < 3.4) continue;
        const y = T2.surfaceY(x, z);
        if (y < WATER_Y + 0.6) continue;
        const s = rng.range(0.9, 2.4);
        B.add('snowM', T(sphere(s, 9, 6, 0.5), x, y + s * 0.22, z, 0, 0, 0, 1, 0.42, 1));
      }
      // 暖炉：广场上供人烤火的铜炉
      for (const [x, z] of [[-16, 22], [18, 26], [0, 8]]) {
        if (!put(x, z)) continue;
        const y = T2.heightAt(x, z);
        B.add(V.stoneMat, T(cyl(0.62, 0.86, 1.1, 10, 0.6), x, y + 0.55, z));
        B.add('bronze', T(cyl(1.0, 0.7, 0.7, 12, 0.6), x, y + 1.42, z));
        B.add('magma', T(cyl(0.8, 0.8, 0.16, 12, 0.6), x, y + 1.7, z));
        this.lanterns.add(x, y + 2.1, z, 1.4);
      }
    }

    if (this.theme === 'stilt') {
      // 渔网与鱼干架
      for (let i = 0; i < 14; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(16, 60);
        const x = HEART.x + Math.cos(a) * r, z = HEART.z + Math.sin(a) * r * 0.8;
        if (!put(x, z)) continue;
        const y = T2.heightAt(x, z);
        const w = rng.range(3.0, 5.0);
        B.add('wood', T(cyl(0.11, 0.14, 2.6, 7, 0.7), x - w / 2, y + 1.3, z));
        B.add('wood', T(cyl(0.11, 0.14, 2.6, 7, 0.7), x + w / 2, y + 1.3, z));
        addRopeLine(B, x - w / 2, y + 2.5, z, x + w / 2, y + 2.5, z, 0.3, 6);
        for (let k = 0; k < 5; k++) {
          const t = (k + 0.5) / 5;
          B.add('paperWhite', T(plane(0.34, 0.7, 1.4), lerp(x - w / 2, x + w / 2, t), y + 2.1, z, 0, rng.range(-0.3, 0.3), 0));
        }
      }
      // 系缆桩与小舟
      for (let i = 0; i < 18; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(30, 95);
        const x = Math.cos(a) * r, z = -12 + Math.sin(a) * r;
        const y = T2.surfaceY(x, z);
        if (y < WATER_Y - 0.4 || y > WATER_Y + 2.2) continue;   // 只摆在水线附近
        if (distToAnyPath(x, z) < 4) continue;
        B.add('wood', T(cyl(0.20, 0.26, 1.6, 8, 0.7), x, y + 0.7, z, rng.range(-0.1, 0.1), 0, rng.range(-0.1, 0.1)));
        B.add('iron', T(torus(0.22, 0.045, 6, 14, 0.8), x, y + 1.4, z, Math.PI / 2, 0, 0));
      }
      // 珊瑚丛
      for (let i = 0; i < 40; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(20, 110);
        const x = Math.cos(a) * r, z = -12 + Math.sin(a) * r;
        const y = T2.surfaceY(x, z);
        if (y < WATER_Y - 1.0 || y > WATER_Y + 3.0) continue;
        if (distToAnyPath(x, z) < 4) continue;
        const n = rng.int(3, 6);
        for (let k = 0; k < n; k++) {
          const h = rng.range(0.5, 1.7);
          B.add('coralM', T(cone(rng.range(0.16, 0.34), h, 6, 1.0),
            x + rng.range(-1.1, 1.1), y + h / 2, z + rng.range(-1.1, 1.1),
            rng.range(-0.4, 0.4), rng.range(0, 3.14), rng.range(-0.4, 0.4)));
        }
      }
    }

    if (this.theme === 'palace') {
      // 华表：主台前一对
      if (V.huabiao) {
        for (const s of [-1, 1]) {
          const x = HEART.x + s * 13, z = HEART.z - 14;
          const y = T2.heightAt(x, z);
          B.add('jadeM', T(frustum(2.0, 2.0, 2.6, 2.6, 0.6, 0.4), x, y + 0.3, z));
          B.add('jadeM', T(cyl(0.42, 0.52, 11.0, 12, 0.5), x, y + 6.1, z));
          // 缠柱云纹
          for (let i = 0; i < 9; i++) {
            const a = i * 0.86, yy = y + 1.4 + i * 1.05;
            B.add('gold', T(box(1.25, 0.16, 0.30, 0.8), x, yy, z, 0, a, 0.10));
          }
          B.add('jadeM', T(box(3.4, 0.30, 0.7, 0.6), x, y + 10.4, z, 0, 0.5 * s, 0));
          B.add('gold', T(sphere(0.62, 12, 8, 0.5), x, y + 12.0, z));
          this.lanterns.add(x, y + 8.4, z, 1.3);
        }
      }
      // 玉阶：社树南面拾级而上。整级横过来一路取样再决定铺不铺 ——
      // 只查三点的话，一级台阶的中段照样会插进配殿的台基里
      for (let i = 0; i < 7; i++) {
        const zz = HEART.z - 9 - i * 2.1;
        const wdt = 13.0 - i * 0.5;
        let blocked = false;
        for (let k = 0; k <= 8 && !blocked; k++) {
          const px = HEART.x + (k / 8 - 0.5) * wdt;
          // 前后两条边也要查，台阶有 2 米深
          if (inFootprint(px, zz - 1.0, 0.8) || inFootprint(px, zz + 1.0, 0.8)) blocked = true;
        }
        if (blocked) continue;
        const y = T2.heightAt(HEART.x, zz);
        B.add('jadeM', T(box(wdt, 0.34, 2.0, 0.5), HEART.x, y + 0.17, zz));
        // 铺过的地方登记下来，云纹灯柱、灵芝石座就不会再压上去
        addFootprint(HEART.x, zz, wdt / 2 + 0.4, 1.4, 0);
      }
      // 云纹灯柱
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = HEART.x + Math.cos(a) * 26, z = HEART.z - 8 + Math.sin(a) * 22;
        if (!put(x, z)) continue;
        const y = T2.heightAt(x, z);
        B.add('jadeM', T(cyl(0.16, 0.24, 4.2, 8, 0.6), x, y + 2.1, z));
        B.add('gold', T(torus(0.42, 0.06, 6, 16, 0.8), x, y + 4.3, z, Math.PI / 2, 0, 0));
        this.lanterns.add(x, y + 4.6, z, 1.3);
      }
      // 灵芝仙草石座
      for (let i = 0; i < 16; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(18, 70);
        const x = Math.cos(a) * r, z = HEART.z - 20 + Math.sin(a) * r * 0.8;
        if (!put(x, z)) continue;
        const y = T2.heightAt(x, z);
        B.add('rockPaleM', T(frustum(1.5, 1.5, 1.9, 1.9, 0.7, 0.5), x, y + 0.35, z, 0, rng.range(0, 3.14), 0));
        for (let k = 0; k < 3; k++) {
          const h = rng.range(0.5, 1.0);
          B.add('jadeM', T(cyl(0.06, 0.08, h, 6, 0.8), x + rng.range(-0.4, 0.4), y + 0.7 + h / 2, z + rng.range(-0.4, 0.4)));
          B.add('leafC', T(plane(0.7, 0.5, 1.4), x + rng.range(-0.4, 0.4), y + 0.7 + h, z + rng.range(-0.4, 0.4), 0.4, rng.range(0, 3.14), 0));
        }
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
      this.heartOrb.material.emissiveIntensity = 1.9 + Math.sin(t * 1.6) * 0.5;
      this.heartLight.intensity = 8 + Math.sin(t * 1.6) * 2.4 + dayNight.lanternLevel * 12;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m.userData && m.userData._owned) m.dispose();
      }
    });
    this.scene.remove(this.group);
    for (const l of this.lights) this.scene.remove(l);
    this.lanterns.dispose && this.lanterns.dispose(this.scene);
  }
}
