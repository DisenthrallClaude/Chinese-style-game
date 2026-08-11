// 山海舆图 —— 五关地理志
//
// 一关一册：山川的高程、水的性状、兽道的走向、草木的族属、屋舍的形制、
// 天时的色温，全部写在这里。世界与玩法都只认这一份事实。
//
// 高程函数签名统一为 height(x, z, H)，H 是地形引擎递过来的工具箱：
//   H.n1 / H.n2 / H.n3   三组噪声
//   H.clamp / H.lerp / H.smoothstep
//   H.dRiver(x, z)       到水道中心线的距离
//   H.dPath(x, z)        到最近兽道的距离
//   H.C                  谷心坐标
// 这样关卡数据不必反过来 import 布局模块，避免循环依赖。

// 各关石拱桥的桥面参数：y 是桥头高度，rise 是河心拱起的高度
const BR1 = { y: -0.2, rise: 2.4, span: 18, halfW: 3.2 };
const BR2 = { y: -0.9, rise: 2.2, span: 16, halfW: 3.2 };
const BR3 = { y: 0.4, rise: 2.4, span: 19, halfW: 3.4 };

/* ================================================================
   通用地貌零件
   ================================================================ */

// 台地踏步：把一段连续的坡切成 n 级
function terrace(t, steps, height, soft = 0.30) {
  const s = Math.max(0, Math.min(1, t)) * steps;
  const i = Math.floor(s);
  const f = s - i;
  const e = (x) => {
    const v = Math.max(0, Math.min(1, (x - soft) / (0.86 - soft)));
    return v * v * (3 - 2 * v);
  };
  return ((i + e(f)) / steps) * height;
}

// 岛屿／浮台：台地剖面 —— 外圈一道肩坡，肩以内是平的。
// 用幂函数 pow(t, edge) 画出来的是个通体倾斜的圆丘，岛上找不出一块平地摆机关；
// 改成 smoothstep 才是「顶平、侧陡」的台地，edge 即肩坡占半径的比例。
function island(x, z, o, H) {
  const { cx, cz, r, h, edge = 0.45, wobble = 0.22, seed = 0 } = o;
  const d = Math.hypot(x - cx, z - cz);
  // 轮廓不规则：按方位角扰动半径
  const ang = Math.atan2(z - cz, x - cx);
  const wob = 1 + (H.n2.simplex2(Math.cos(ang) * 1.7 + seed, Math.sin(ang) * 1.7) * wobble);
  const rr = r * wob;
  if (d > rr) return 0;
  const t = 1 - d / rr;
  return h * H.smoothstep(0, edge, t);
}

// 栈道／地峡：沿兽道抬起一条窄带，保证路永远走得通
function causeway(x, z, H, o = {}) {
  const { half = 7.5, feather = 12, y = 0 } = o;
  const d = H.dPath(x, z);
  const t = 1 - H.smoothstep(half, half + feather, d);
  return { t, y };
}

// 石拱桥的桥面高程。addArchBridge 画出来的桥面是
//   y + deckY + sin(PI * t) * rise，t 沿桥跨从 0 到 1，河心处 t = 0.5。
// 这里把兽道所在的那条窄带按同一条拱线抬起来，凶兽就走在桥面上，
// 而不是从桥拱底下穿过去。
//
// 抬起来的带子必须比桥身**窄**。以前羽化给了 4.5 米，土坡从桥两侧漫出来
// 一大截，看着就是一道土埂上摆了两排栏杆 —— 河（炎火之山是熔岩）也在那儿
// 被生生截断。现在收到 DECK_FEATHER，再由 village.js 把桥面加宽到把它整个
// 盖住，土就再也露不出来了。
const DECK_FEATHER = 1.1;

function bridgeDeck(h, x, z, H, B) {
  if (!B) return h;
  const dP = H.dPath(x, z);
  if (dP > B.halfW + DECK_FEATHER) return h;
  const dR = H.dRiver(x, z);
  const half = B.span * 0.5;
  if (dR > half + 6) return h;
  // 沿桥跨的参数：河心 0.5，桥头 0
  const t = Math.max(0, 0.5 - dR / B.span);
  const deck = B.y + Math.sin(Math.PI * t) * B.rise;
  // 只抬兽道那一条窄带，两侧留给水
  const w = 1 - H.smoothstep(B.halfW, B.halfW + DECK_FEATHER, dP);
  // 桥头之外平顺地接回地面
  const e = 1 - H.smoothstep(half, half + 6, dR);
  const k = w * e;
  return k > 0 ? Math.max(h, H.lerp(h, deck, k)) : h;
}

export { DECK_FEATHER };

/* ================================================================
   一 · 栖梧谷 —— 青山梯田，溪流穿谷
   ================================================================ */
const L1 = {
  id: 'qiwu',
  name: '栖梧谷',
  en: 'QIWU VALLEY',
  seal: '梧',
  subtitle: '昆仑之墟东南三百里',
  verse: '「引水为力，铸械为兵，守此一谷山川。」',
  lore: '谷民世代以机关术营生，引溪为力，驱轮为兵。凶兽破封而出，自左右两处山口奔涌而下，直取谷心的社树。',
  brief: '溪谷梯田，水车成列。机力最盛，五行齐备，是学机关术的起手处。',

  geo: {
    center: { x: 0, z: -14 },
    innerR: 118,
    buildR: 112,
    waterY: -1.9,
    plazaY: 0,
    tex: ['grassGround', 'soil', 'rock'],
    plazaTex: 'flagstone',
    macroWarm: [1.12, 1.02, 0.84],
    macroCool: [0.94, 1.00, 0.92],

    height(x, z, H) {
      const dxc = x - 0, dzc = z + 14;

      let h = H.n1.fbm2(x * 0.0125, z * 0.0125, 4) * 1.9
            + H.n1.fbm2(x * 0.052, z * 0.052, 3) * 0.42
            + H.n1.fbm2(x * 0.0068 + 30, z * 0.0068, 3) * 4.2;

      // 后山梯田
      h += terrace(H.smoothstep(-18, -104, z), 5, 30);

      // 环谷山体（椭圆距离）
      const ex = dxc / 106, ez = dzc / 94;
      const er = Math.sqrt(ex * ex + ez * ez);
      const rimT = H.smoothstep(1.02, 1.72, er);
      if (rimT > 0) {
        const ridge = H.n2.ridge2(x * 0.0072, z * 0.0072, 5, 2.1, 0.52);
        const ridge2 = H.n2.ridge2(x * 0.019 + 40, z * 0.019, 4, 2.2, 0.5);
        const peak = Math.pow(H.clamp(ridge, 0, 1), 0.62) * 52 + Math.pow(H.clamp(ridge2, 0, 1), 1.6) * 18;
        let rim = rimT * (16 + peak);
        const gorge = 1 - H.smoothstep(5, 30, H.dRiver(x, z));
        rim *= (1 - gorge * 0.86);
        h += rim;
      }

      // 远处峰林，向北开谷口
      const rr = Math.hypot(dxc, dzc);
      if (rr > 130) {
        const ang = Math.atan2(dxc, -dzc);
        const notch = 1 - 0.80 * Math.exp(-Math.pow(ang / 0.46, 2))
                        - 0.30 * Math.exp(-Math.pow(ang / 1.05, 2));
        const far = H.smoothstep(130, 400, rr);
        const rg = H.n2.ridge2(x * 0.0031 + 90, z * 0.0031, 6, 2.05, 0.5);
        const rg2 = H.n2.ridge2(x * 0.0088 + 300, z * 0.0088, 4, 2.2, 0.5);
        const strata = Math.sin(rg * 30) * 0.022;
        const peaks = Math.pow(H.clamp(rg, 0, 1), 0.5) * 330 + Math.pow(H.clamp(rg2, 0, 1), 1.7) * 90 + strata * 220;
        h += far * peaks * Math.max(0.12, notch);
        h += H.smoothstep(330, 820, rr) * Math.pow(H.clamp(H.n2.ridge2(x * 0.0016, z * 0.0016, 5), 0, 1), 0.62) * 460
             * Math.max(0.18, 1 - 0.62 * Math.exp(-Math.pow(ang / 0.62, 2)));
      }

      // 谷口走廊压低
      if (rr > 120) {
        const ang = Math.atan2(dxc, -dzc);
        const corridor = Math.exp(-Math.pow(ang / 0.40, 2));
        if (corridor > 0.015) {
          const spire = Math.pow(H.clamp(H.n2.simplex2(x * 0.0021 + 11, z * 0.0021 - 7), 0, 1), 2.6);
          const cap = 26 + rr * 0.050 + spire * 340 * H.smoothstep(430, 720, rr);
          h = H.lerp(h, Math.min(h, cap), corridor * H.smoothstep(120, 190, rr));
        }
      }

      // 河床下切与河岸缓坡 —— 与原作一致。
      // 水面穿帮不在这里治：水面网格会按河床自适应收窄（见 water.js）
      const dR = H.dRiver(x, z);
      h -= (1 - H.smoothstep(3.2, 12.0, dR)) * 4.4;
      h -= (1 - H.smoothstep(10, 22, dR)) * 0.5;

      // 兽道过河处：路面按石拱桥的拱线抬起来，凶兽才是「走在桥面上」，
      // 而不是从桥拱底下趟过去。窄窄一道，两侧照旧是水。
      h = bridgeDeck(h, x, z, H, BR1);
      return h;
    },

    surface(x, z, y, slope, H) {
      const dp = H.dPath(x, z), dr = H.dRiver(x, z);
      let rock = H.clamp(H.smoothstep(0.52, 1.05, slope) + H.smoothstep(26, 56, y), 0, 1);
      let soil = (1 - H.smoothstep(1.6, 5.4, dp)) * 0.95;
      soil = Math.max(soil, (1 - H.smoothstep(2.5, 9.0, dr)) * 0.8);
      soil = Math.max(soil, H.smoothstep(0.42, 0.78, H.n1.fbm2(x * 0.03, z * 0.03, 4) * 0.5 + 0.5) * 0.55);
      soil = H.clamp(soil * (1 - rock * 0.7), 0, 1);
      return [H.clamp(1 - rock - soil, 0, 1), soil, rock];
    },
  },

  gates: [
    { x: -36, z: -102, name: '左山口' },
    { x: 36, z: -102, name: '右山口' },
  ],
  branchL: [[-36, -102], [-33, -90], [-24, -78], [-27, -63], [-18, -50], [-8, -38], [-2, -30], [0, -26]],
  branchR: [[36, -102], [33, -88], [24, -76], [27, -61], [17, -48], [7, -37], [2, -30], [0, -26]],
  trunk: [[0, -26], [0, -16], [0, -6], [-20, -1], [-36, 8], [-34, 24], [-16, 31],
          [2, 27], [20, 32], [30, 44], [14, 52], [0, 47]],

  heart: { x: 0, z: 47 },
  plaza: { x0: -52, x1: 52, z0: -2, z1: 60 },

  water: {
    kind: 'river',
    pts: [[-150, -40], [-108, -30], [-70, -22], [-40, -17], [-14, -13],
          [16, -12], [46, -15], [82, -22], [124, -34], [160, -46]],
    halfWidth: 5.4,
    deep: 0x0e2123, shallow: 0x244d42, foam: 0xf0f7fa,
    opacity: 0.86, flow: 1.0,
  },
  bridge: { x: 0, z: -13.2, angle: 0.06, ...BR1 },

  climate: { fogMul: 1.0, fogTint: null, skyTint: null, cloudCover: 0, wind: 1.0 },

  flora: {
    broadleaf: 120, midTree: 220, pine: 420, bamboo: 46, bush: 520, grass: 1700,
    palette: 'green', deadwood: 0, crystal: 0,
  },

  weather: { dust: 0.10, fireflies: 1.0, petals: 0.30, birds: 20, snow: 0, ember: 0, sand: 0 },

  village: {
    theme: 'valley',
    roofA: 'tile', roofB: 'tileDark', wallA: 'woodDark', wallB: 'plaster',
    postMat: 'woodRed', stoneMat: 'stone', cutMat: 'stoneCut',
    pailou: { x: 0, z: 2.4, ry: 0.02, w: 10, h: 6.8 },
    gearTower: { x: 30, z: -16, ry: -0.22, H: 18, w: 5.0 },
    terraceRisers: [-36.3, -50.2, -61.9, -73.8, -88.7],
    sites: [
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
    ],
  },

  // 入门一关：五行齐备，另开罡风橐一味，先把「相克」这件事教会
  towers: ['crossbow', 'catapult', 'flame', 'frost', 'blade', 'thunder', 'gale', 'wheel', 'windmill', 'relay'],
  // 地脉：溪谷水足，机力最盛
  rules: { startGold: 480, startHeart: 20, fireMult: 1.0, slowBonus: 0 },
};

/* ================================================================
   二 · 炎火之山 —— 赤沙雅丹，熔岩为河
   ================================================================ */
const L2 = {
  id: 'yanhuo',
  name: '炎火之山',
  en: 'FLAME MOUNT',
  seal: '炎',
  subtitle: '昆仑之丘，其外有炎火之山',
  verse: '「投物辄然，其火不灭，昼夜赤光烛天。」',
  lore: '大荒之西，有山赤如丹砂，投物即燃。风蚀成柱，沙起如浪。谷中无水，唯熔岩一道自火口奔流而下——谷民引火为力，铸炉为兵。',
  brief: '赤沙雅丹，熔岩成河。无水可引，唯地火炉出力；炉火烘着，机关射速 +10%，寒气却难留（减速 −25%）。两口各行其道，只在火峡桥头挤成一股。',

  geo: {
    center: { x: 0, z: -10 },
    innerR: 122,
    buildR: 116,
    waterY: -2.6,
    plazaY: 0,
    tex: ['sand', 'soilRed', 'rockRed'],
    plazaTex: 'flagstoneRed',
    macroWarm: [1.18, 0.96, 0.74],
    macroCool: [1.00, 0.92, 0.80],

    height(x, z, H) {
      const dxc = x, dzc = z + 10;
      const rr = Math.hypot(dxc, dzc);

      // 沙丘：长波沙脊 + 细碎风纹，风向自西北
      const wx = x * 0.866 + z * 0.5, wz = -x * 0.5 + z * 0.866;
      let h = Math.abs(Math.sin(wx * 0.020 + H.n1.fbm2(x * 0.006, z * 0.006, 3) * 2.2)) * 3.4
            + H.n1.fbm2(x * 0.011, z * 0.011, 4) * 3.0
            + H.n1.fbm2(x * 0.06, z * 0.06, 3) * 0.55;
      // 沙脊的迎风面缓、背风面陡
      h += Math.pow(H.clamp(Math.sin(wz * 0.014) * 0.5 + 0.5, 0, 1), 2.4) * 4.2;

      // 雅丹风蚀台：一列列被风削平的方台，走向与风一致
      const yard = H.n2.fbm2(wx * 0.0125, wz * 0.0042, 4) * 0.5 + 0.5;
      const yardMask = H.smoothstep(0.54, 0.78, yard) * H.smoothstep(30, 70, rr) * (1 - H.smoothstep(150, 215, rr));
      if (yardMask > 0.001) {
        const top = 7 + Math.pow(yard, 2.0) * 20;
        h += yardMask * terrace(H.clamp(yard * 1.6 - 0.3, 0, 1), 3, top, 0.42);
      }

      // 环谷赤岩壁：比栖梧谷矮而更陡，露出层理
      const ex = dxc / 112, ez = dzc / 100;
      const er = Math.sqrt(ex * ex + ez * ez);
      const rimT = H.smoothstep(1.00, 1.55, er);
      if (rimT > 0) {
        const ridge = H.n2.ridge2(x * 0.0062, z * 0.0062, 5, 2.2, 0.5);
        const strata = Math.sin(H.n2.fbm2(x * 0.004, z * 0.004, 3) * 26) * 0.06;
        const peak = Math.pow(H.clamp(ridge + strata, 0, 1), 0.5) * 62;
        let rim = rimT * (13 + peak);
        // 熔岩出谷处劈开一道火峡
        rim *= (1 - (1 - H.smoothstep(6, 34, H.dRiver(x, z))) * 0.92);
        h += rim;
      }

      // 远景：火口锥与赤色峰林，向北开口
      if (rr > 140) {
        const ang = Math.atan2(dxc, -dzc);
        const notch = 1 - 0.84 * Math.exp(-Math.pow(ang / 0.42, 2));
        const far = H.smoothstep(140, 420, rr);
        const rg = H.n2.ridge2(x * 0.0027 + 60, z * 0.0027, 6, 2.1, 0.5);
        h += far * Math.pow(H.clamp(rg, 0, 1), 0.56) * 300 * Math.max(0.10, notch);
        // 主火山锥：偏东南，一个巨大的截顶锥
        const vd = Math.hypot(x - 210, z - 250);
        if (vd < 340) {
          const t = 1 - vd / 340;
          const cone = Math.pow(t, 1.5) * 430;
          const crater = Math.max(0, 1 - vd / 66) * 150;   // 顶上凹下去一个火口
          h += cone - crater;
        }
        h += H.smoothstep(340, 800, rr) * Math.pow(H.clamp(H.n2.ridge2(x * 0.0014, z * 0.0014, 5), 0, 1), 0.6) * 380
             * Math.max(0.16, 1 - 0.66 * Math.exp(-Math.pow(ang / 0.58, 2)));
      }

      // 熔岩沟：压到定深（窄而深），沟沿翻起一道冷却的黑壳
      const dR = H.dRiver(x, z);
      // 熔岩沟：全宽压到定深，整条沟才是连贯的
      const lavaBed = 1 - H.smoothstep(7.5, 19.0, dR);
      if (lavaBed > 0) h = H.lerp(h, -6.2, lavaBed);
      h += (1 - H.smoothstep(10.0, 19.0, dR)) * H.smoothstep(7.0, 10.5, dR) * 2.1;

      // 兽道踩成的硬土带，比周围略低
      h -= (1 - H.smoothstep(0, 6.0, H.dPath(x, z))) * 0.55;
      h = bridgeDeck(h, x, z, H, BR2);
      return h;
    },

    surface(x, z, y, slope, H) {
      const dp = H.dPath(x, z), dr = H.dRiver(x, z);
      // 岩：陡坡与高处
      let rock = H.clamp(H.smoothstep(0.46, 0.92, slope) + H.smoothstep(22, 46, y), 0, 1);
      // 焦土：熔岩沟两侧与兽道
      let scorch = (1 - H.smoothstep(3.0, 14.0, dr)) * 0.98;
      scorch = Math.max(scorch, (1 - H.smoothstep(1.8, 6.0, dp)) * 0.85);
      scorch = H.clamp(scorch * (1 - rock * 0.55), 0, 1);
      // 其余全是沙
      return [H.clamp(1 - rock - scorch, 0, 1), scorch, rock];
    },
  },

  gates: [
    { x: -44, z: -104, name: '焦石口' },
    { x: 40, z: -106, name: '风蚀口' },
  ],
  // 沙漏形路网：两口各行其道，在火峡的独木桥上挤成一股，出峡又分东西两路，
  // 直到社树前才再合。所以这一关只有「桥头」一个真正的隘口 ——
  // 那一处值得把家底都押上，别处却要两边各守一摊。
  branchL: [[-44, -104], [-46, -90], [-38, -78], [-42, -64], [-30, -52], [-16, -42], [-6, -32],
            [1, -22], [1, -13], [-12, -6], [-42, 2], [-46, 18], [-34, 28], [-14, 26], [0, 26]],
  branchR: [[40, -106], [44, -92], [36, -80], [40, -66], [26, -53], [12, -42], [4, -32],
            [1, -22], [1, -13], [14, -6], [44, 2], [48, 18], [36, 28], [16, 26], [0, 26]],
  trunk: [[0, 26], [0, 33], [0, 40], [0, 46]],

  heart: { x: 0, z: 46 },
  plaza: { x0: -50, x1: 50, z0: -4, z1: 58 },

  water: {
    kind: 'lava',
    pts: [[-160, -48], [-116, -36], [-74, -26], [-42, -20], [-14, -16],
          [18, -15], [50, -19], [88, -27], [130, -40], [168, -52]],
    halfWidth: 5.8,
    deep: 0x4a0d03, shallow: 0xd63a08, foam: 0xffd070,
    opacity: 0.98, flow: 0.35, emissive: 1.0,
  },
  bridge: { x: 1, z: -17.0, angle: 0.10, ...BR2 },

  climate: {
    fogMul: 1.45, fogTint: 0xd07a44, skyTint: 0xffb070, sunTint: 0xffd0a0,
    cloudCover: -0.14, wind: 1.7, exposure: 1.03,
  },

  flora: {
    broadleaf: 0, midTree: 26, pine: 0, bamboo: 0, bush: 190, grass: 320,
    palette: 'ash', deadwood: 240, crystal: 90,
  },

  weather: { dust: 0.30, fireflies: 0.25, petals: 0, birds: 8, snow: 0, ember: 1.0, sand: 1.0 },

  village: {
    theme: 'desert',
    roofA: 'tileDark', roofB: 'tileDark', wallA: 'plasterRed', wallB: 'plasterRed',
    postMat: 'woodDark', stoneMat: 'stone', cutMat: 'stoneCut',
    flatRoof: true,               // 夯土平顶，只在大屋加坡顶
    pailou: { x: -2, z: 2.0, ry: 0.03, w: 10.5, h: 7.2 },
    gearTower: { x: 34, z: -14, ry: -0.26, H: 20, w: 5.4 },
    terraceRisers: [],
    sites: [
      { id: 'main', x: 2, z: -34, ry: -0.08, w: 16, d: 11, floors: 2, floorH: 3.8, balcony: true, roofH: 3.4, hip: true, big: true },
      { id: 'hallL', x: -26, z: -30, ry: 0.26, w: 11.5, d: 8.5, floors: 1, floorH: 3.9, roofH: 2.6, hip: true },
      { id: 'hallR', x: 32, z: -32, ry: -0.34, w: 10.5, d: 8, floors: 1, floorH: 3.7, roofH: 2.5, hip: true },
      { id: 'h1', x: -46, z: -44, ry: 0.46, w: 9, d: 7, floors: 1, floorH: 3.4, roofH: 2.2, hip: false },
      { id: 'h2', x: -16, z: -50, ry: -0.16, w: 9.5, d: 7, floors: 2, floorH: 3.2, roofH: 2.3, hip: false },
      { id: 'h3', x: 22, z: -50, ry: 0.20, w: 8.5, d: 6.5, floors: 1, floorH: 3.3, roofH: 2.1, hip: false },
      { id: 'h4', x: 48, z: -46, ry: -0.52, w: 9, d: 6.5, floors: 1, floorH: 3.4, roofH: 2.2, hip: true },
      { id: 'h5', x: -38, z: -62, ry: 0.12, w: 8, d: 6.5, floors: 2, floorH: 3.1, roofH: 2.0, hip: false },
      { id: 'h6', x: 8, z: -64, ry: 0.36, w: 8.5, d: 6.5, floors: 1, floorH: 3.3, roofH: 2.1, hip: false },
      { id: 'h7', x: 38, z: -68, ry: -0.24, w: 7.5, d: 6, floors: 1, floorH: 3.1, roofH: 2.0, hip: false },
      { id: 'h8', x: -24, z: -78, ry: 0.52, w: 7.5, d: 6, floors: 1, floorH: 3.1, roofH: 2.0, hip: false },
      // 两条外环从东西两侧兜过来，作坊得挪进环内的空当里
      { id: 'shopL', x: -22, z: 14, ry: 0.34, w: 12.5, d: 8.5, floors: 1, floorH: 4.0, roofH: 2.7, hip: true, big: true },
      { id: 'shopR', x: 24, z: 12, ry: -0.38, w: 11.5, d: 8, floors: 1, floorH: 3.9, roofH: 2.6, hip: true, big: true },
      { id: 'shopS', x: 0, z: 8, ry: 0.14, w: 8.5, d: 6.5, floors: 1, floorH: 3.3, roofH: 2.1, hip: false },
      { id: 'eaveL', x: -60, z: 58, ry: 0.32, w: 16, d: 7, floors: 1, floorH: 4.6, roofH: 3.0, hip: false, corridor: true, big: true },
      { id: 'eaveR', x: 60, z: 60, ry: -0.28, w: 16, d: 7, floors: 1, floorH: 4.6, roofH: 3.0, hip: false, corridor: true, big: true },
    ],
  },

  // 满山火属，流火筒在这儿等于白打 —— 换成瘴烟炉与须弥壶
  towers: ['crossbow', 'catapult', 'frost', 'blade', 'thunder', 'gale', 'miasma', 'voidjar', 'forge', 'windmill', 'relay'],
  // 地脉：炉火烘着，机括热得快，射速自带一成；但谷中无水，寒气也养不住
  rules: { startGold: 560, startHeart: 20, fireMult: 1.10, slowBonus: -0.25 },
};

/* ================================================================
   三 · 幽都寒渊 —— 冰川塔林，冻河如镜
   ================================================================ */
const L3 = {
  id: 'youdu',
  name: '幽都寒渊',
  en: 'FROZEN ABYSS',
  seal: '幽',
  subtitle: '北海之内，有山名曰幽都之山',
  verse: '「大荒之中，有山名曰不咸。冰厚千尺，日不能照。」',
  lore: '北海之内，黑水之滨。冰川自天而下，裂如刀劈；冻河深不见底，映得出人影。谷民凿冰为渠，以寒气驭机——此地机关不惧过热，却怕冻死。',
  brief: '冰川塔林，冻河如镜。酷寒使机括发脆，射速 −12%；但冰面极滑，一切减速 +55%。兽道贴着冰坎来回折三趟 —— 摆在中间的机关能连打三遍。',

  geo: {
    center: { x: 0, z: -16 },
    innerR: 120,
    buildR: 114,
    waterY: -1.2,
    plazaY: 0,
    tex: ['snow', 'ice', 'rockDark'],
    plazaTex: 'flagstoneIce',
    // 雪的反照率本来就高，再乘一个大于一的宏观色偏，整关立刻白到糊。
    // 这两组压到一附近，雪才是「冷而暗的雪」，不是一张过曝的纸 ——
    // 但也别压狠了，压过头整关就成了一片看不清东西的深蓝。
    macroWarm: [0.94, 0.98, 1.06],
    macroCool: [0.80, 0.86, 0.99],

    height(x, z, H) {
      const dxc = x, dzc = z + 16;
      const rr = Math.hypot(dxc, dzc);

      // 冰川谷底：U 形，比 V 形谷宽而平
      let h = H.n1.fbm2(x * 0.010, z * 0.010, 4) * 1.5
            + H.n1.fbm2(x * 0.045, z * 0.045, 3) * 0.34;

      // 冰川自北向南推下，留下一级级冰坎。兽道所过之处把坎口摊平成缓坡，
      // 否则一级 5 米多的坎横在路上，凶兽是贴着墙面爬上去的
      const rampT = H.smoothstep(3.5, 16.0, H.dPath(x, z));
      h += terrace(H.smoothstep(-10, -108, z), 6, 34, 0.24) * (0.30 + 0.70 * rampT)
         + H.smoothstep(-10, -108, z) * 34 * 0.70 * (1 - rampT);

      // 冰塔林（seracs）：谷中一片密集的尖冰塔，只长在坡上
      const ser = H.n2.ridge2(x * 0.055 + 12, z * 0.055, 3, 2.3, 0.5);
      const serMask = H.smoothstep(46, 78, rr) * (1 - H.smoothstep(140, 190, rr));
      h += Math.pow(H.clamp(ser, 0, 1), 3.2) * 17 * serMask;

      // 冰裂缝：细而深的一道道口子，横切冰川走向
      const cre = Math.abs(H.n2.simplex2(x * 0.0125, z * 0.030 + 40));
      const creDepth = (1 - H.smoothstep(0.0, 0.055, cre)) * H.smoothstep(24, 60, rr);
      h -= creDepth * 9.5 * (1 - H.smoothstep(0, 14, H.dPath(x, z)) * 0.0);
      // 兽道上不许开裂缝，否则无路可走
      h += creDepth * 9.5 * (1 - H.smoothstep(5.0, 13.0, H.dPath(x, z)));

      // 环谷冰壁：高而近乎垂直
      const ex = dxc / 104, ez = dzc / 96;
      const er = Math.sqrt(ex * ex + ez * ez);
      const rimT = H.smoothstep(1.04, 1.46, er);
      if (rimT > 0) {
        const ridge = H.n2.ridge2(x * 0.0068 + 7, z * 0.0068, 5, 2.15, 0.52);
        const peak = Math.pow(H.clamp(ridge, 0, 1), 0.48) * 78;
        let rim = rimT * (22 + peak);
        rim *= (1 - (1 - H.smoothstep(6, 30, H.dRiver(x, z))) * 0.88);
        h += rim;
      }

      // 远景雪峰：更高更尖，向北留一线天光
      if (rr > 132) {
        const ang = Math.atan2(dxc, -dzc);
        const notch = 1 - 0.78 * Math.exp(-Math.pow(ang / 0.40, 2));
        const far = H.smoothstep(132, 400, rr);
        const rg = H.n2.ridge2(x * 0.0030 + 130, z * 0.0030, 6, 2.1, 0.5);
        h += far * Math.pow(H.clamp(rg, 0, 1), 0.44) * 400 * Math.max(0.12, notch);
        h += H.smoothstep(330, 780, rr) * Math.pow(H.clamp(H.n2.ridge2(x * 0.0015 + 9, z * 0.0015, 5), 0, 1), 0.55) * 520
             * Math.max(0.14, 1 - 0.6 * Math.exp(-Math.pow(ang / 0.55, 2)));
      }

      // 冻河：河面结冰，几乎与岸齐平，但河床仍压到定深免得冰面插进地形
      const dR = H.dRiver(x, z);
      // 冻河：河床压到定深，冰面才不会大半埋在岸里
      const iceBed = 1 - H.smoothstep(9.5, 21.0, dR);
      if (iceBed > 0) h = H.lerp(h, -3.4, iceBed);
      h = bridgeDeck(h, x, z, H, BR3);
      return h;
    },

    surface(x, z, y, slope, H) {
      const dp = H.dPath(x, z), dr = H.dRiver(x, z);
      // 裸岩：只在最陡处露出来
      let rock = H.clamp(H.smoothstep(0.72, 1.25, slope), 0, 1);
      // 蓝冰：冻河、裂缝边、被踩实的兽道
      let ice = (1 - H.smoothstep(2.0, 11.0, dr)) * 1.0;
      ice = Math.max(ice, (1 - H.smoothstep(2.2, 6.4, dp)) * 0.8);
      ice = Math.max(ice, H.smoothstep(0.42, 0.66, slope) * 0.6);
      ice = H.clamp(ice * (1 - rock * 0.6), 0, 1);
      return [H.clamp(1 - rock - ice, 0, 1), ice, rock];
    },
  },

  gates: [
    { x: -40, z: -106, name: '玄冰口' },
    { x: 42, z: -100, name: '黑水口' },
  ],
  // 回头路：冰川把谷底刮成一级级横向的坎，兽道只能贴着坎口来回折。
  // 三道横扫的折返叠在一块地上 —— 摆在中间的机关能连打三趟，
  // 但路也长得多，撑不住的话就是一波接一波地漏。
  branchL: [[-40, -106], [-36, -92], [-28, -80], [-32, -66], [-22, -52], [-10, -40], [-3, -32], [0, -27]],
  branchR: [[42, -100], [38, -88], [30, -78], [33, -62], [20, -50], [8, -39], [2, -32], [0, -27]],
  trunk: [[0, -27], [0, -12], [-6, -2], [-44, 4], [-46, 20], [40, 26], [44, 42],
          [-30, 48], [-6, 54], [0, 48]],

  heart: { x: 0, z: 48 },
  plaza: { x0: -48, x1: 48, z0: 0, z1: 60 },

  water: {
    kind: 'ice',
    pts: [[-158, -44], [-112, -34], [-72, -25], [-40, -19], [-12, -15],
          [20, -14], [52, -18], [90, -26], [132, -38], [170, -50]],
    halfWidth: 6.6,
    deep: 0x123448, shallow: 0x3f7f96, foam: 0xe4f6ff,
    opacity: 0.80, flow: 0.16,
  },
  bridge: { x: -3, z: -16.0, angle: -0.05, ...BR3 },

  climate: {
    fogMul: 1.28, fogTint: 0x5c7290, skyTint: 0x5e7a9e, sunTint: 0xa8bcd6,
    cloudCover: 0.34, wind: 1.4, exposure: 0.73, aurora: 1.0,
    // 幽都不是没有光，是光都被雪吃掉了：日头收两成，辉光减四成，
    // 对比度提上来 —— 这样屋子与雪面才分得开，又不至于糊成一片白
    lightMul: 0.74, bloomMul: 0.52, bloomThr: 0.58, contrast: 1.11, sat: 0.95,
  },

  flora: {
    broadleaf: 0, midTree: 40, pine: 300, bamboo: 0, bush: 150, grass: 260,
    palette: 'frost', deadwood: 120, crystal: 210,
  },

  weather: { dust: 0.16, fireflies: 0.5, petals: 0, birds: 10, snow: 1.0, ember: 0, sand: 0 },

  village: {
    theme: 'snow',
    roofA: 'tileDark', roofB: 'tileDark', wallA: 'woodDark', wallB: 'woodDark',
    postMat: 'woodDark', stoneMat: 'rockDark', cutMat: 'stoneCut',
    snowCap: true,                // 屋顶压一层积雪
    pailou: { x: 2, z: 3.0, ry: -0.02, w: 10, h: 6.6 },
    gearTower: { x: -32, z: -14, ry: 0.24, H: 17, w: 5.0 },
    terraceRisers: [-34.0, -48.5, -60.0, -72.0, -86.0, -98.0],
    sites: [
      { id: 'main', x: -2, z: -33, ry: 0.05, w: 15, d: 11, floors: 2, floorH: 3.6, balcony: true, roofH: 4.2, hip: true, big: true },
      { id: 'hallL', x: -28, z: -28, ry: 0.20, w: 11, d: 8, floors: 1, floorH: 3.5, roofH: 3.2, hip: true },
      { id: 'hallR', x: 28, z: -30, ry: -0.28, w: 10, d: 7.5, floors: 1, floorH: 3.4, roofH: 3.1, hip: true },
      { id: 'h1', x: -44, z: -40, ry: 0.40, w: 8.5, d: 6.5, floors: 1, floorH: 3.1, roofH: 2.8, hip: false },
      { id: 'h2', x: -12, z: -46, ry: -0.12, w: 9, d: 6.5, floors: 1, floorH: 3.2, roofH: 2.9, hip: true },
      { id: 'h3', x: 18, z: -46, ry: 0.16, w: 8, d: 6, floors: 1, floorH: 3.0, roofH: 2.7, hip: false },
      { id: 'h4', x: 42, z: -42, ry: -0.48, w: 8.5, d: 6.2, floors: 1, floorH: 3.1, roofH: 2.8, hip: true },
      { id: 'h5', x: -34, z: -58, ry: 0.10, w: 7.5, d: 6, floors: 1, floorH: 2.9, roofH: 2.6, hip: false },
      { id: 'h6', x: 4, z: -60, ry: 0.32, w: 8, d: 6, floors: 1, floorH: 3.0, roofH: 2.7, hip: true },
      { id: 'h7', x: 32, z: -64, ry: -0.20, w: 7, d: 5.5, floors: 1, floorH: 2.8, roofH: 2.5, hip: false },
      { id: 'h8', x: -22, z: -74, ry: 0.48, w: 7, d: 5.5, floors: 1, floorH: 2.8, roofH: 2.5, hip: false },
      // 折返的三道兽道横在广场上，作坊只能落在两道之间的空带里
      { id: 'shopL', x: -22, z: 12, ry: 0.30, w: 12, d: 8, floors: 1, floorH: 3.7, roofH: 3.2, hip: true, big: true },
      { id: 'shopR', x: 20, z: 11, ry: -0.34, w: 11, d: 7.5, floors: 1, floorH: 3.6, roofH: 3.1, hip: true, big: true },
      { id: 'shopS', x: 26, z: 34, ry: 0.10, w: 8, d: 6, floors: 1, floorH: 3.0, roofH: 2.6, hip: false },
      { id: 'eaveL', x: -58, z: 60, ry: 0.30, w: 16, d: 7, floors: 1, floorH: 4.4, roofH: 3.4, hip: false, corridor: true, big: true },
      { id: 'eaveR', x: 58, z: 62, ry: -0.26, w: 16, d: 7, floors: 1, floorH: 4.4, roofH: 3.4, hip: false, corridor: true, big: true },
    ],
  },

  // 冰原上再引寒气也无用，寒泉阵不开；换蚀影幢与养蛊瓮对付厚甲
  towers: ['crossbow', 'catapult', 'flame', 'blade', 'thunder', 'miasma', 'guwen', 'umbra', 'wheel', 'windmill', 'relay'],
  // 地脉：极寒。铜铁发脆、油脂凝住，射速要打个折；
  //       但冰面极滑，凡是减速的手段都格外见效
  rules: { startGold: 600, startHeart: 18, fireMult: 0.88, slowBonus: 0.55 },
};

/* ================================================================
   四 · 归墟海眼 —— 群岛栈桥，巨涡吞天
   ================================================================ */
// 海床基准约 -9，岛高即「露出水面多少 + 9」
const ISLES = [
  { cx: 0, cz: 44, r: 54, h: 25.0, edge: 0.62, seed: 1 },     // 社树主岛
  { cx: -40, cz: 2, r: 40, h: 21.0, edge: 0.62, seed: 2 },
  { cx: 42, cz: 4, r: 38, h: 20.5, edge: 0.62, seed: 3 },
  { cx: -30, cz: -48, r: 35, h: 22.0, edge: 0.62, seed: 4 },
  { cx: 32, cz: -50, r: 34, h: 21.5, edge: 0.62, seed: 5 },
  { cx: -44, cz: -96, r: 30, h: 23.0, edge: 0.62, seed: 6 },  // 左口岛
  { cx: 46, cz: -94, r: 30, h: 23.0, edge: 0.62, seed: 7 },   // 右口岛
  { cx: -78, cz: -28, r: 23, h: 17.0, edge: 0.62, seed: 8 },
  { cx: 80, cz: -26, r: 22, h: 16.5, edge: 0.62, seed: 9 },
  { cx: -6, cz: -26, r: 28, h: 19.0, edge: 0.62, seed: 10 },
];

const L4 = {
  id: 'guixu',
  name: '归墟海眼',
  en: 'GUIXU MAELSTROM',
  seal: '墟',
  subtitle: '渤海之东，不知几亿万里，有大壑焉',
  verse: '「八纮九野之水，天汉之流，莫不注之，而无增无减。」',
  lore: '东海之东有大壑，名曰归墟。众水注之而不盈，其下有眼，昼夜吞吐。岛屿浮沉其间，谷民架栈桥相连，以潮汐驱轮。',
  brief: '群岛栈桥，潮汐为力。地窄路长，机关只能沿桥摆开；潮气锈铜，射速 −5%。飞兽成群，罡风橐是这一关的命。',

  geo: {
    center: { x: 0, z: -12 },
    innerR: 130,
    buildR: 120,
    waterY: 0.0,
    seaLevel: 0.0,
    plazaY: 14.5,
    tex: ['sandPale', 'coral', 'rockWet'],
    plazaTex: 'flagstone',
    macroWarm: [1.08, 1.04, 0.92],
    macroCool: [0.88, 1.00, 1.06],

    height(x, z, H) {
      const rr = Math.hypot(x, z + 12);

      // 海床：向外越来越深
      let h = -9 - H.smoothstep(60, 240, rr) * 32
            + H.n1.fbm2(x * 0.016, z * 0.016, 4) * 2.6;

      // 岛屿
      let isle = 0;
      for (let i = 0; i < ISLES.length; i++) isle = Math.max(isle, island(x, z, ISLES[i], H));
      h += isle;

      // 栈道地峡：沿兽道把海床抬到水面之上，保证路走得通
      const cw = causeway(x, z, H, { half: 9.5, feather: 11 });
      if (cw.t > 0) {
        const deck = 6.5 + H.n1.fbm2(x * 0.05, z * 0.05, 2) * 0.4;
        h = H.lerp(h, Math.max(h, deck), cw.t);
      }

      // 岛上起伏与礁石
      if (h > -2) {
        h += H.n1.fbm2(x * 0.030, z * 0.030, 4) * 1.3 * H.smoothstep(-2, 4, h);
        // 礁岩只长在远离兽道的地方，岛心留出平整的营造面
        h += Math.pow(H.clamp(H.n2.ridge2(x * 0.042 + 3, z * 0.042, 3, 2.2, 0.5), 0, 1), 2.6) * 4.2
             * H.smoothstep(0, 6, h) * H.smoothstep(6, 18, H.dPath(x, z));
      }

      // 海蚀礁：立在浅水里的几处矮岩。别做得又高又细 ——
      // 网格三角形有好几米宽，细高的柱子只会变成一根白色的尖刺
      const st = H.n2.ridge2(x * 0.018 + 90, z * 0.018, 2, 2.4, 0.5);
      const stackMask = H.smoothstep(0.72, 0.96, st) * H.smoothstep(70, 110, rr) * (1 - H.smoothstep(190, 240, rr));
      h += stackMask * 15;

      // 归墟之眼：谷心以北的巨大漩涡，海床向下扭成一个漏斗
      const vd = Math.hypot(x - 0, z + 128);
      if (vd < 78) {
        const t = 1 - vd / 78;
        h -= Math.pow(t, 1.8) * 44;
      }

      // 远景：环抱的海蚀崖与雾中列岛
      if (rr > 170) {
        const ang = Math.atan2(x, -(z + 12));
        const notch = 1 - 0.86 * Math.exp(-Math.pow(ang / 0.44, 2));
        const far = H.smoothstep(170, 460, rr);
        const rg = H.n2.ridge2(x * 0.0034 + 210, z * 0.0034, 5, 2.1, 0.5);
        h += far * Math.pow(H.clamp(rg, 0, 1), 0.7) * 260 * Math.max(0.06, notch);
        h += H.smoothstep(380, 820, rr) * Math.pow(H.clamp(H.n2.ridge2(x * 0.0016 + 40, z * 0.0016, 5), 0, 1), 0.66) * 340
             * Math.max(0.10, 1 - 0.7 * Math.exp(-Math.pow(ang / 0.6, 2)));
      }
      return h;
    },

    surface(x, z, y, slope, H) {
      const dp = H.dPath(x, z);
      // 湿岩：陡坡与潮线以下
      let rock = H.clamp(H.smoothstep(0.58, 1.06, slope) + (1 - H.smoothstep(0.6, 3.2, y)) * 0.7, 0, 1);
      // 珊瑚／海藻：贴着水线一圈
      let coral = (1 - H.smoothstep(1.0, 5.5, Math.abs(y - 1.2))) * 0.9;
      coral = Math.max(coral, (1 - H.smoothstep(2.0, 6.0, dp)) * 0.45);
      coral = H.clamp(coral * (1 - rock * 0.5), 0, 1);
      return [H.clamp(1 - rock - coral, 0, 1), coral, rock];
    },
  },

  gates: [
    { x: -44, z: -96, name: '沉舟屿' },
    { x: 46, z: -94, name: '望潮屿' },
  ],
  branchL: [[-44, -96], [-42, -84], [-34, -72], [-32, -56], [-34, -44], [-22, -34], [-10, -28], [-6, -26]],
  branchR: [[46, -94], [42, -82], [34, -70], [32, -56], [32, -44], [20, -33], [6, -28], [-6, -26]],
  trunk: [[-6, -26], [-14, -18], [-30, -8], [-40, 2], [-38, 16], [-22, 28],
          [-4, 32], [16, 26], [38, 10], [44, 26], [30, 44], [12, 52], [0, 44]],

  heart: { x: 0, z: 44 },
  plaza: { x0: -34, x1: 34, z0: 20, z1: 66 },

  water: {
    kind: 'sea',
    pts: [[-260, -170], [-200, -120], [-150, -74], [-96, -40], [-40, -18],
          [20, -10], [80, -20], [140, -50], [200, -100], [262, -164]],
    halfWidth: 240,
    sheet: true,                // 铺成一整片海，不是一条带
    deep: 0x062434, shallow: 0x1e7f8e, foam: 0xf2fdff,
    opacity: 0.90, flow: 0.7,
  },
  bridge: null,

  climate: {
    fogMul: 1.20, fogTint: 0x94bccc, skyTint: 0x9fd0e0, sunTint: 0xfff0d8,
    cloudCover: 0.14, wind: 1.9, exposure: 1.02,
  },

  flora: {
    broadleaf: 34, midTree: 60, pine: 40, bamboo: 20, bush: 260, grass: 900,
    palette: 'sea', deadwood: 40, crystal: 60,
  },

  weather: { dust: 0.12, fireflies: 0.7, petals: 0.1, birds: 30, snow: 0, ember: 0, sand: 0, spray: 1.0 },

  village: {
    theme: 'stilt',
    roofA: 'tile', roofB: 'tileDark', wallA: 'wood', wallB: 'woodDark',
    postMat: 'wood', stoneMat: 'rockWetM', cutMat: 'stoneCut',
    stilts: true,                 // 干栏式：台基下露出一排木桩
    railPath: true,               // 兽道沿途加栈桥栏杆
    pailou: { x: 0, z: 24.0, ry: 0.0, w: 10, h: 6.6 },
    gearTower: { x: 26, z: 54, ry: -0.30, H: 16, w: 4.6 },
    terraceRisers: [],
    sites: [
      { id: 'main', x: -22, z: 56, ry: 0.16, w: 14, d: 10, floors: 2, floorH: 3.6, balcony: true, roofH: 3.4, hip: true, big: true },
      { id: 'shopR', x: 20, z: 60, ry: -0.20, w: 11, d: 8, floors: 1, floorH: 3.6, roofH: 2.8, hip: true, big: true },
      { id: 'h1', x: -34, z: 38, ry: 0.34, w: 8, d: 6, floors: 1, floorH: 3.1, roofH: 2.3, hip: false },
      { id: 'h2', x: 34, z: 40, ry: -0.36, w: 8, d: 6, floors: 1, floorH: 3.1, roofH: 2.3, hip: false },
      { id: 'hallL', x: -52, z: -2, ry: 0.30, w: 10.5, d: 7.5, floors: 1, floorH: 3.5, roofH: 2.7, hip: true },
      { id: 'h3', x: -28, z: 8, ry: -0.24, w: 8, d: 6, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'hallR', x: 52, z: 0, ry: -0.32, w: 10.5, d: 7.5, floors: 1, floorH: 3.5, roofH: 2.7, hip: true },
      { id: 'h4', x: 30, z: -2, ry: 0.22, w: 8, d: 6, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h5', x: -18, z: -52, ry: 0.44, w: 7.5, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'h6', x: -42, z: -54, ry: -0.30, w: 7.5, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'h7', x: 20, z: -54, ry: -0.44, w: 7.5, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'h8', x: 44, z: -56, ry: 0.30, w: 7.5, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'h9', x: -80, z: -30, ry: 0.5, w: 7, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'h10', x: 82, z: -28, ry: -0.5, w: 7, d: 5.5, floors: 1, floorH: 2.9, roofH: 2.1, hip: false },
      { id: 'eaveL', x: -46, z: 72, ry: 0.34, w: 15, d: 6.5, floors: 1, floorH: 4.4, roofH: 3.0, hip: false, corridor: true, big: true },
      { id: 'eaveR', x: 46, z: 74, ry: -0.30, w: 15, d: 6.5, floors: 1, floorH: 4.4, roofH: 3.0, hip: false, corridor: true, big: true },
    ],
  },

  // 雷入大海即散，引雷桩不开；飞兽成群，罡风橐是这一关的主力
  towers: ['crossbow', 'catapult', 'flame', 'frost', 'blade', 'gale', 'guwen', 'umbra', 'voidjar', 'tide', 'windmill', 'relay'],
  // 地脉：潮气重，铜锈得快，射速略减；海风把减速的雾气吹散一些
  rules: { startGold: 640, startHeart: 16, fireMult: 0.95, slowBonus: -0.10 },
};

/* ================================================================
   五 · 昆仑天阙 —— 悬圃浮空，云海为渊
   ================================================================ */
const PLATFORMS = [
  { cx: 0, cz: 46, r: 51, h: 30, edge: 0.30, wobble: 0.14, seed: 21 },   // 天阙主台
  { cx: -38, cz: 4, r: 35, h: 26, edge: 0.28, wobble: 0.16, seed: 22 },
  { cx: 40, cz: 6, r: 34, h: 26, edge: 0.28, wobble: 0.16, seed: 23 },
  { cx: -26, cz: -46, r: 31, h: 22, edge: 0.26, wobble: 0.18, seed: 24 },
  { cx: 30, cz: -48, r: 30, h: 22, edge: 0.26, wobble: 0.18, seed: 25 },
  { cx: -42, cz: -98, r: 28, h: 18, edge: 0.26, wobble: 0.18, seed: 26 },
  { cx: 44, cz: -96, r: 28, h: 18, edge: 0.26, wobble: 0.18, seed: 27 },
  { cx: -4, cz: -24, r: 30, h: 24, edge: 0.28, wobble: 0.16, seed: 28 },
  { cx: -74, cz: -30, r: 20, h: 20, edge: 0.30, wobble: 0.20, seed: 29 },
  { cx: 76, cz: -28, r: 20, h: 20, edge: 0.30, wobble: 0.20, seed: 30 },
];

const L5 = {
  id: 'kunlun',
  name: '昆仑天阙',
  en: 'KUNLUN SKYGATE',
  seal: '昆',
  subtitle: '昆仑之丘，是实惟帝之下都',
  verse: '「面有九井，以玉为槛；面有九门，门有开明兽守之。」',
  lore: '昆仑之巅，玉台悬于云海之上，以石梁相连，下临无地。开明兽守九门，百神所在。凶兽自天梯攀援而上——此处一步失守，便是万丈。',
  brief: '悬圃浮空，云海为渊。可建之地极狭，唯石梁与玉台；然玉枢自转，机关射速 +15%。十一属机关俱在此关开放。',

  geo: {
    center: { x: 0, z: -10 },
    innerR: 128,
    buildR: 118,
    waterY: -26,               // 云海面
    plazaY: 34.0,
    tex: ['jadeStone', 'flagstoneJade', 'rockPale'],
    plazaTex: 'flagstoneJade',
    macroWarm: [1.10, 1.06, 1.00],
    macroCool: [0.94, 0.98, 1.12],

    height(x, z, H) {
      const rr = Math.hypot(x, z + 10);

      // 底下是虚空：一律沉到云海之下
      let h = -62 - H.smoothstep(40, 200, rr) * 30;

      // 玉台：顶面平、侧壁近乎垂直
      let plat = 0, top = 0;
      for (let i = 0; i < PLATFORMS.length; i++) {
        const v = island(x, z, PLATFORMS[i], H);
        if (v > plat) { plat = v; top = PLATFORMS[i].h; }
      }
      if (plat > 0) {
        // 顶面收平，只留一点点起伏
        const flat = top - 2.0 + H.n1.fbm2(x * 0.05, z * 0.05, 3) * 1.1;
        h = Math.max(h, H.lerp(plat - 40, flat, H.smoothstep(0.55, 0.95, plat / Math.max(1, top))));
        h = Math.max(h, plat - 34);
      }

      // 石梁：兽道所过之处架起一道窄桥，两侧陡落。梁面比台面略低一线，
      // 走上玉台时才有「拾级而上」的一坎。
      const cw = causeway(x, z, H, { half: 8.0, feather: 6.5 });
      if (cw.t > 0) {
        const deck = 25.0 + H.n1.fbm2(x * 0.04, z * 0.04, 2) * 0.5;
        h = H.lerp(h, Math.max(h, deck), Math.pow(cw.t, 0.55));
      }

      // 台面上的玉阶：一级级向社树抬升
      if (h > 6) {
        const tt = H.clamp(1 - Math.hypot(x, z - 46) / 60, 0, 1);
        h += terrace(tt, 4, 7.0, 0.34) * H.smoothstep(6, 12, h);
        h += Math.pow(H.clamp(H.n2.ridge2(x * 0.05 + 5, z * 0.05, 3, 2.2, 0.5), 0, 1), 3.0) * 3.4
             * H.smoothstep(5, 15, H.dPath(x, z));
      }

      // 天柱：远处几根撑天的巨柱
      const pil = H.n2.ridge2(x * 0.0072 + 300, z * 0.0072, 2, 2.5, 0.5);
      const pilMask = H.smoothstep(0.80, 0.97, pil) * H.smoothstep(150, 200, rr) * (1 - H.smoothstep(420, 520, rr));
      h += pilMask * 210;

      // 远景：云上仙山，几乎悬在半空
      if (rr > 190) {
        const ang = Math.atan2(x, -(z + 10));
        const notch = 1 - 0.80 * Math.exp(-Math.pow(ang / 0.40, 2));
        const far = H.smoothstep(190, 520, rr);
        const rg = H.n2.ridge2(x * 0.0026 + 420, z * 0.0026, 6, 2.1, 0.5);
        h += far * Math.pow(H.clamp(rg, 0, 1), 0.40) * 520 * Math.max(0.10, notch);
        h += H.smoothstep(420, 900, rr) * Math.pow(H.clamp(H.n2.ridge2(x * 0.0013 + 77, z * 0.0013, 5), 0, 1), 0.5) * 620
             * Math.max(0.12, 1 - 0.64 * Math.exp(-Math.pow(ang / 0.52, 2)));
      }
      return h;
    },

    surface(x, z, y, slope, H) {
      const dp = H.dPath(x, z);
      // 白岩：崖壁
      let rock = H.clamp(H.smoothstep(0.62, 1.15, slope), 0, 1);
      // 玉砖：台面与石梁
      let jade = (1 - H.smoothstep(2.4, 7.0, dp)) * 0.92;
      jade = Math.max(jade, H.smoothstep(0.30, 0.05, slope) * H.smoothstep(8, 16, y) * 0.75);
      jade = H.clamp(jade * (1 - rock * 0.7), 0, 1);
      return [H.clamp(1 - rock - jade, 0, 1), jade, rock];
    },
  },

  gates: [
    { x: -42, z: -98, name: '阊阖门' },
    { x: 44, z: -96, name: '闾阖门' },
  ],
  branchL: [[-42, -98], [-40, -86], [-32, -74], [-28, -60], [-26, -46], [-18, -36], [-8, -28], [-4, -24]],
  branchR: [[44, -96], [42, -84], [34, -72], [30, -60], [30, -48], [18, -35], [4, -27], [-4, -24]],
  trunk: [[-4, -24], [-12, -16], [-26, -6], [-38, 4], [-36, 16], [-20, 26],
          [-2, 30], [18, 24], [40, 6], [44, 24], [28, 42], [10, 50], [0, 46]],

  heart: { x: 0, z: 46 },
  plaza: { x0: -32, x1: 32, z0: 24, z1: 68 },

  water: {
    kind: 'cloud',
    pts: [[-280, -180], [-210, -126], [-150, -76], [-90, -38], [-30, -16],
          [30, -12], [90, -26], [150, -60], [210, -116], [280, -176]],
    halfWidth: 270,
    sheet: true,
    deep: 0x2a3560, shallow: 0xa9b6e8, foam: 0xffffff,
    opacity: 0.72, flow: 0.22,
  },
  bridge: null,

  climate: {
    fogMul: 0.80, fogTint: 0xc4c8f0, skyTint: 0xc8b8f0, sunTint: 0xfff2d0,
    cloudCover: 0.22, wind: 1.5, exposure: 1.06,
  },

  flora: {
    broadleaf: 30, midTree: 46, pine: 90, bamboo: 26, bush: 180, grass: 620,
    palette: 'jade', deadwood: 0, crystal: 260,
  },

  weather: { dust: 0.24, fireflies: 1.2, petals: 0.55, birds: 22, snow: 0, ember: 0, sand: 0, motes: 1.0 },

  village: {
    theme: 'palace',
    roofA: 'tileJade', roofB: 'tile', wallA: 'woodRed', wallB: 'plaster',
    postMat: 'woodRed', stoneMat: 'rockPaleM', cutMat: 'jadeM',
    railPath: true,               // 石梁两侧的云纹栏板
    huabiao: true,                // 华表
    pailou: { x: 0, z: 26.0, ry: 0.0, w: 11, h: 7.6 },
    gearTower: { x: -28, z: 56, ry: 0.28, H: 19, w: 5.0 },
    terraceRisers: [],
    sites: [
      { id: 'main', x: 0, z: 62, ry: 0.0, w: 18, d: 12, floors: 2, floorH: 4.2, balcony: true, roofH: 4.0, hip: true, big: true },
      { id: 'hallL', x: -26, z: 50, ry: 0.24, w: 11, d: 8, floors: 1, floorH: 3.9, roofH: 3.0, hip: true, big: true },
      { id: 'hallR', x: 26, z: 50, ry: -0.24, w: 11, d: 8, floors: 1, floorH: 3.9, roofH: 3.0, hip: true, big: true },
      { id: 'h1', x: -34, z: 34, ry: 0.40, w: 8, d: 6, floors: 1, floorH: 3.3, roofH: 2.4, hip: false },
      { id: 'h2', x: 34, z: 34, ry: -0.40, w: 8, d: 6, floors: 1, floorH: 3.3, roofH: 2.4, hip: false },
      { id: 'h3', x: -50, z: 2, ry: 0.34, w: 9, d: 6.5, floors: 1, floorH: 3.4, roofH: 2.5, hip: true },
      { id: 'h4', x: 52, z: 4, ry: -0.34, w: 9, d: 6.5, floors: 1, floorH: 3.4, roofH: 2.5, hip: true },
      { id: 'h5', x: -26, z: 10, ry: -0.20, w: 7.5, d: 5.5, floors: 1, floorH: 3.1, roofH: 2.2, hip: false },
      { id: 'h6', x: 28, z: 12, ry: 0.20, w: 7.5, d: 5.5, floors: 1, floorH: 3.1, roofH: 2.2, hip: false },
      { id: 'h7', x: -14, z: -50, ry: 0.42, w: 7.5, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h8', x: -38, z: -52, ry: -0.28, w: 7.5, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h9', x: 18, z: -52, ry: -0.42, w: 7.5, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h10', x: 42, z: -54, ry: 0.28, w: 7.5, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h11', x: -76, z: -32, ry: 0.5, w: 7, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'h12', x: 78, z: -30, ry: -0.5, w: 7, d: 5.5, floors: 1, floorH: 3.0, roofH: 2.2, hip: false },
      { id: 'eaveL', x: -34, z: 76, ry: 0.36, w: 15, d: 6.5, floors: 1, floorH: 4.6, roofH: 3.2, hip: false, corridor: true, big: true },
      { id: 'eaveR', x: 34, z: 78, ry: -0.32, w: 15, d: 6.5, floors: 1, floorH: 4.6, roofH: 3.2, hip: false, corridor: true, big: true },
    ],
  },

  // 帝之下都，十一属俱在 —— 全谱开放，可建之地却极狭
  towers: ['crossbow', 'catapult', 'flame', 'frost', 'blade', 'thunder', 'gale', 'miasma', 'guwen', 'umbra', 'voidjar', 'aether', 'relay'],
  // 地脉：帝之下都，玉枢自转，机括如飞；只是可建之地极狭
  rules: { startGold: 700, startHeart: 16, fireMult: 1.15, slowBonus: 0.15 },
};

/* ================================================================ */
export const LEVELS = [L1, L2, L3, L4, L5];
LEVELS.forEach((L, i) => {
  L.index = i;
  L.num = i + 1;
  L.numCN = ['一', '二', '三', '四', '五'][i];
});

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map(L => [L.id, L]));
export { terrace, island, causeway };
