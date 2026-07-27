// 材料库 —— 全村共用一组材质，合并后只剩十来个 draw call
import * as THREE from 'three';
import { colorOf, normalOf, roughnessOf, alphaOf } from '../core/textures.js';
import { toonify } from '../core/toon.js';

// 世界材质的卡通量：比凶兽收敛，只把明暗交界收利落
const TOON_WORLD = 0.34;

function std(tex, opts = {}) {
  const {
    normal = 1.6, rough = [0.55, 0.98], roughInvert = false,
    metalness = 0, color = 0xffffff, normalScale = 1.0, toon = TOON_WORLD, ...rest
  } = opts;
  const m = new THREE.MeshStandardMaterial({
    map: colorOf(tex, 1),
    normalMap: normalOf(tex, normal, 1),
    roughnessMap: roughnessOf(tex, rough[0], rough[1], roughInvert, 1),
    roughness: 1.0,
    metalness,
    color,
    ...rest,
  });
  m.normalScale.set(normalScale, normalScale);
  m.userData = {};
  toonify(m, toon);
  return m;
}

let _shared = null;
// 全局共用一份材质，避免重复生成纹理
export function getMaterials() {
  if (!_shared) _shared = createMaterials();
  return _shared;
}

export function createMaterials() {
  const M = {};

  M.wood = std('wood', { normal: 1.9, rough: [0.62, 0.99], normalScale: 1.0 });
  M.woodDark = std('woodDark', { normal: 2.1, rough: [0.66, 1.0], normalScale: 1.1 });
  M.woodRed = std('woodRed', { normal: 1.5, rough: [0.48, 0.9], normalScale: 0.85 });
  M.plaster = std('plaster', { normal: 1.1, rough: [0.72, 1.0], normalScale: 0.6 });
  M.stone = std('rock', { normal: 2.2, rough: [0.7, 1.0], normalScale: 1.2 });
  M.stoneCut = std('flagstoneFine', { normal: 1.6, rough: [0.62, 0.98], normalScale: 0.9 });
  M.tile = std('roofTile', { normal: 2.6, rough: [0.36, 0.86], normalScale: 1.25, metalness: 0.06 });
  M.tileDark = std('roofTileDark', { normal: 2.6, rough: [0.32, 0.8], normalScale: 1.25, metalness: 0.08 });
  M.bronze = std('bronze', { normal: 1.3, rough: [0.24, 0.72], metalness: 0.86, normalScale: 0.8 });
  M.iron = std('iron', { normal: 1.4, rough: [0.3, 0.78], metalness: 0.9, normalScale: 0.9 });
  M.gold = std('gold', { normal: 1.0, rough: [0.14, 0.5], metalness: 0.95, normalScale: 0.6 });
  M.cloth = std('clothRed', { normal: 1.0, rough: [0.7, 1.0], normalScale: 0.5, side: THREE.DoubleSide });
  M.clothBlue = std('clothIndigo', { normal: 1.0, rough: [0.7, 1.0], normalScale: 0.5, side: THREE.DoubleSide });

  // 灯笼纸：夜间自发光
  M.paper = new THREE.MeshStandardMaterial({
    map: colorOf('paper', 1),
    roughness: 0.86, metalness: 0,
    emissive: new THREE.Color(0xff9a3c),
    emissiveIntensity: 0.0,
    side: THREE.DoubleSide,
  });
  M.paper.userData = { lantern: true };

  M.paperWhite = new THREE.MeshStandardMaterial({
    map: colorOf('paperWhite', 1),
    roughness: 0.9, metalness: 0,
    emissive: new THREE.Color(0xffd9a0),
    emissiveIntensity: 0.0,
    side: THREE.DoubleSide,
  });
  M.paperWhite.userData = { lantern: true };

  // 窗棂：镂空 + 内侧暗色
  const latticeAlpha = alphaOf('latticeGrid', 1);
  M.lattice = new THREE.MeshStandardMaterial({
    color: 0x3a2418,
    map: colorOf('woodDark', 1),
    alphaMap: latticeAlpha,
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.85,
  });
  M.lattice.userData = {};

  toonify(M.lattice, TOON_WORLD);

  const latticeIce = alphaOf('latticeIce', 1);
  M.latticeIce = M.lattice.clone();
  M.latticeIce.alphaMap = latticeIce;
  M.latticeIce.userData = {};
  toonify(M.latticeIce, TOON_WORLD);

  // 窗后的暗房间 —— 夜里透出灯光
  M.windowGlow = new THREE.MeshStandardMaterial({
    color: 0x1a120a,
    roughness: 1.0, metalness: 0,
    emissive: new THREE.Color(0xffab52),
    emissiveIntensity: 0.0,
    side: THREE.DoubleSide,
  });
  M.windowGlow.userData = { lantern: true, windowScale: 1.0 };

  M.leaf = new THREE.MeshStandardMaterial({
    map: colorOf('leafA', 1),
    alphaTest: 0.34,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  M.leafB = M.leaf.clone(); M.leafB.map = colorOf('leafB', 1);
  M.leafC = M.leaf.clone(); M.leafC.map = colorOf('leafC', 1);
  M.leafPine = M.leaf.clone(); M.leafPine.map = colorOf('leafPine', 1);
  M.grass = new THREE.MeshStandardMaterial({
    map: colorOf('grassTuft', 1),
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    roughness: 1.0,
  });
  // 叶片本就偏平，卡通量给足一点，团块感更像画出来的
  for (const k of ['leaf', 'leafB', 'leafC', 'leafPine', 'grass']) toonify(M[k], 0.46);
  for (const k of ['paper', 'paperWhite', 'windowGlow']) toonify(M[k], 0.22);

  for (const k of Object.keys(M)) if (!M[k].userData) M[k].userData = {};
  return M;
}

// 夜幕降临时点灯
export function setLanternLevel(materials, level) {
  for (const k of Object.keys(materials)) {
    const m = materials[k];
    if (m.userData && m.userData.lantern) {
      m.emissiveIntensity = level * (m.userData.windowScale ? 1.5 : 2.4);
    }
  }
}
