// 图谱 —— 五行、机关、凶兽、波次，全部数据都在这里
// 数值经过手工配平：早期宽松，中期考验组合，后期考验机力网络。

/* ------------------------------------------------------------------ 五行 */
export const ELEMENTS = {
  metal: { key: 'metal', name: '金', color: 0xe6dcc0, glow: 0xfff4d0, beats: 'wood' },
  wood: { key: 'wood', name: '木', color: 0x86c268, glow: 0xc4f09a, beats: 'earth' },
  earth: { key: 'earth', name: '土', color: 0xd6a35a, glow: 0xffd79a, beats: 'water' },
  water: { key: 'water', name: '水', color: 0x5ab4e8, glow: 0xa8e4ff, beats: 'fire' },
  fire: { key: 'fire', name: '火', color: 0xf07a3c, glow: 0xffc07a, beats: 'metal' },
  none: { key: 'none', name: '·', color: 0xbdb6a4, glow: 0xffffff, beats: null },
};

export const COUNTER_MULT = 1.85;   // 克制
export const COUNTERED_MULT = 0.62; // 被克

export function elementMult(atk, def) {
  if (!atk || !def || atk === 'none' || def === 'none') return 1;
  if (ELEMENTS[atk] && ELEMENTS[atk].beats === def) return COUNTER_MULT;
  if (ELEMENTS[def] && ELEMENTS[def].beats === atk) return COUNTERED_MULT;
  return 1;
}

/* ---------------------------------------------------------------- 机关谱 */
// kind: single 单体 / splash 溅射 / cone 锥形 / field 领域 / ring 环身 / chain 连锁
//       gen 发力 / relay 传动
export const TOWERS = [
  {
    id: 'crossbow', name: '连弩机', el: 'wood', kind: 'single', hotkey: '1',
    cost: 55, power: 5, range: 24, dmg: 15, rate: 2.05, projSpeed: 90,
    link: 0, glyph: '弩',
    desc: '连发短矢，射速极快。造价低廉，是护住第一道弯的骨干。',
    up: [
      { dmg: 15, rate: 2.05, range: 24, power: 5 },
      { dmg: 26, rate: 2.45, range: 26, power: 8, cost: 55 },
      { dmg: 44, rate: 2.95, range: 29, power: 12, cost: 118 },
    ],
    upName: ['一阶 · 单弩', '二阶 · 三连弩', '三阶 · 诸葛连弩'],
  },
  {
    id: 'catapult', name: '霹雳车', el: 'earth', kind: 'splash', hotkey: '2',
    cost: 115, power: 9, range: 31, dmg: 48, rate: 0.55, splash: 5.4, projSpeed: 42, arc: true,
    link: 0, glyph: '砲',
    desc: '抛石破阵，落点炸开一片。射速虽慢，成群的小兽最怕它。',
    up: [
      { dmg: 48, rate: 0.55, range: 31, power: 9, splash: 5.4 },
      { dmg: 82, rate: 0.62, range: 34, power: 14, splash: 6.4, cost: 105 },
      { dmg: 140, rate: 0.70, range: 38, power: 20, splash: 7.6, cost: 230 },
    ],
    upName: ['一阶 · 单梢砲', '二阶 · 五梢砲', '三阶 · 旋风砲'],
  },
  {
    id: 'flame', name: '流火筒', el: 'fire', kind: 'cone', hotkey: '3',
    cost: 95, power: 8, range: 15, dmg: 20, rate: 6.0, cone: 0.62, burn: 9, burnTime: 3,
    link: 0, glyph: '燧',
    desc: '喷吐猛火，灼烧持续不断。近身守隘口最见效，对金属之属尤利。',
    up: [
      { dmg: 20, rate: 6.0, range: 15, power: 8, burn: 9 },
      { dmg: 33, rate: 6.0, range: 17, power: 12, burn: 16, cost: 88 },
      { dmg: 52, rate: 6.5, range: 19, power: 18, burn: 27, cost: 190 },
    ],
    upName: ['一阶 · 火筒', '二阶 · 猛火油柜', '三阶 · 九龙吐火'],
  },
  {
    id: 'frost', name: '寒泉阵', el: 'water', kind: 'field', hotkey: '4',
    cost: 85, power: 7, range: 16, dmg: 9, rate: 2.0, slow: 0.42, slowTime: 1.6,
    link: 0, glyph: '泉',
    desc: '引地寒之气结阵，凡入阵者步履滞涩。伤害不高，却让别处机关多打几轮。',
    up: [
      { dmg: 9, rate: 2.0, range: 16, power: 7, slow: 0.42 },
      { dmg: 16, rate: 2.2, range: 19, power: 11, slow: 0.52, cost: 78 },
      { dmg: 27, rate: 2.4, range: 22, power: 16, slow: 0.62, cost: 165 },
    ],
    upName: ['一阶 · 寒泉', '二阶 · 玄冰阵', '三阶 · 北溟阵'],
  },
  {
    id: 'blade', name: '金锋轮', el: 'metal', kind: 'ring', hotkey: '5',
    cost: 135, power: 12, range: 9.5, dmg: 17, rate: 3.4,
    link: 0, glyph: '锋',
    desc: '铜轮生刃，绕身斩击，凡近身者尽数受创。贴着兽道摆才有威力。',
    up: [
      { dmg: 17, rate: 3.4, range: 9.5, power: 12 },
      { dmg: 29, rate: 3.8, range: 10.5, power: 18, cost: 125 },
      { dmg: 48, rate: 4.4, range: 12.0, power: 26, cost: 265 },
    ],
    upName: ['一阶 · 单锋轮', '二阶 · 双锋轮', '三阶 · 万刃轮'],
  },
  {
    id: 'thunder', name: '引雷桩', el: 'metal', kind: 'chain', hotkey: '6',
    cost: 185, power: 18, range: 27, dmg: 62, rate: 0.85, chain: 3, chainFall: 0.72,
    link: 0, glyph: '雷',
    desc: '铜柱引天雷，电光在群兽之间跳跃。极耗机力，务必先把水车摆够。',
    up: [
      { dmg: 62, rate: 0.85, range: 27, power: 18, chain: 3 },
      { dmg: 104, rate: 0.95, range: 30, power: 27, chain: 4, cost: 175 },
      { dmg: 178, rate: 1.1, range: 34, power: 38, chain: 6, cost: 370 },
    ],
    upName: ['一阶 · 引雷桩', '二阶 · 雷池', '三阶 · 九霄神雷'],
  },
  {
    id: 'wheel', name: '水车', el: 'none', kind: 'gen', hotkey: '7',
    cost: 70, power: -30, range: 0, link: 30, needs: 'water', glyph: '水',
    desc: '临溪而立，昼夜不息地吐出机力。只能架在溪畔，是整张机关网的源头。',
    up: [
      { power: -30, link: 30 },
      { power: -50, link: 33, cost: 65 },
      { power: -78, link: 37, cost: 140 },
    ],
    upName: ['一阶 · 立轮', '二阶 · 双轮', '三阶 · 连磨大轮'],
  },
  {
    id: 'windmill', name: '风车', el: 'none', kind: 'gen', hotkey: '8',
    cost: 100, power: -23, range: 0, link: 27, needs: 'open', glyph: '风',
    desc: '八面受风，何处皆可立。出力略逊水车，胜在不挑地方。',
    up: [
      { power: -23, link: 27 },
      { power: -38, link: 30, cost: 92 },
      { power: -60, link: 34, cost: 200 },
    ],
    upName: ['一阶 · 四扇', '二阶 · 六扇', '三阶 · 八扇'],
  },
  {
    id: 'relay', name: '传动枢', el: 'none', kind: 'relay', hotkey: '9',
    cost: 26, power: 1, range: 0, link: 26, glyph: '枢',
    desc: '一根立轴、几副齿轮，把机力接到远处。网断了，机关就都停了。',
    up: [
      { power: 1, link: 26 },
      { power: 2, link: 32, cost: 38 },
      { power: 3, link: 39, cost: 86 },
    ],
    upName: ['一阶 · 立轴', '二阶 · 长轴', '三阶 · 通天轴'],
  },
];

export const TOWER_BY_ID = Object.fromEntries(TOWERS.map(t => [t.id, t]));

/* ---------------------------------------------------------------- 凶兽谱 */
export const ENEMIES = {
  huan: {
    id: 'huan', name: '讙', el: 'wood', hp: 108, speed: 7.2, armor: 0, bounty: 8,
    scale: 1.10, body: 0x6d8f3e, accent: 0xcfd882, kind: 'ground',
    desc: '状如狸而一目三尾，其行如风。',
  },
  yayu: {
    id: 'yayu', name: '猰貐', el: 'earth', hp: 265, speed: 4.2, armor: 2, bounty: 13,
    scale: 1.37, body: 0x87642f, accent: 0xffd884, kind: 'ground',
    desc: '龙首兽身，食人，走谷如走平地。',
  },
  luoyu: {
    id: 'luoyu', name: '蠃鱼', el: 'water', hp: 215, speed: 5.6, armor: 0, bounty: 12,
    scale: 1.23, body: 0x3b768f, accent: 0x62c6dc, kind: 'ground',
    traits: ['aquatic'],
    desc: '鱼身而鸟翼，所过之处必有大水。',
  },
  qitu: {
    id: 'qitu', name: '鵸鵌', el: 'wood', hp: 158, speed: 8.0, armor: 0, bounty: 14,
    scale: 1.04, body: 0x5b8c48, accent: 0xe8d868, kind: 'air',
    desc: '三首六尾之鸟，掠空而来，不循兽道。',
  },
  bifang: {
    id: 'bifang', name: '毕方', el: 'fire', hp: 260, speed: 6.2, armor: 1, bounty: 18,
    scale: 1.30, body: 0xc24a1c, accent: 0xffc450, kind: 'air',
    traits: ['ignite'],
    desc: '一足赤纹青质而白喙，见则其邑有讹火。',
  },
  huashe: {
    id: 'huashe', name: '化蛇', el: 'water', hp: 380, speed: 5.0, armor: 1, bounty: 20,
    scale: 1.30, body: 0x336a7e, accent: 0x6fc0d2, kind: 'ground',
    traits: ['flood'],
    desc: '人面豺身，其鸣如叱呼，见则其邑大水。',
  },
  xiangliu: {
    id: 'xiangliu', name: '相柳', el: 'water', hp: 620, speed: 3.8, armor: 3, bounty: 30,
    scale: 1.62, body: 0x2a5a52, accent: 0x5ed6a4, kind: 'ground',
    traits: ['split'],
    desc: '九首蛇身，所抵之处尽为溪泽。斩其一首，余首犹动。',
  },
  jiuwei: {
    id: 'jiuwei', name: '九尾狐', el: 'metal', hp: 540, speed: 4.8, armor: 2, bounty: 34,
    scale: 1.37, body: 0xc8a95a, accent: 0xfff4d0, kind: 'ground',
    traits: ['aura'],
    desc: '青丘之兽，九尾摇曳，同行者皆得其庇。',
  },
  taotie: {
    id: 'taotie', name: '饕餮', el: 'earth', hp: 1250, speed: 3.0, armor: 7, bounty: 42,
    scale: 1.95, body: 0x664a26, accent: 0xffa040, kind: 'ground',
    traits: ['devour'],
    desc: '羊身人面，目在腋下，贪食无厌，连机关也啃。',
  },
  dijiang: {
    id: 'dijiang', name: '帝江', el: 'fire', hp: 900, speed: 4.4, armor: 4, bounty: 40,
    scale: 1.56, body: 0x983524, accent: 0xffcf8a, kind: 'ground',
    traits: ['unslowable'],
    desc: '状如黄囊，赤如丹火，六足四翼，浑敦无面目，识歌舞。',
  },
  qiongqi: {
    id: 'qiongqi', name: '穷奇', el: 'metal', hp: 1900, speed: 5.4, armor: 9, bounty: 70,
    scale: 1.76, body: 0x87806e, accent: 0xe6c46a, kind: 'air',
    desc: '状如虎而有翼，食人从首始。四凶之一。',
  },
  zhulong: {
    id: 'zhulong', name: '烛龙', el: 'fire', hp: 12000, speed: 2.3, armor: 16, bounty: 400,
    scale: 2.99, body: 0x8b241a, accent: 0xffc44e, kind: 'ground', boss: true,
    traits: ['regen', 'daynight', 'unslowable'],
    desc: '钟山之神，人面蛇身而赤，视为昼，瞑为夜，吹为冬，呼为夏。',
  },
  kuifu: {
    id: 'kuifu', name: '夔', el: 'metal', hp: 6800, speed: 3.2, armor: 12, bounty: 260,
    scale: 2.47, body: 0x4c5763, accent: 0x6cbde8, kind: 'ground', boss: true,
    traits: ['shock'],
    desc: '状如牛，苍身而无角，一足，出入水则必风雨，其声如雷。',
  },
};

/* ---------------------------------------------------------------- 波次 */
// gate: 0 左山口 / 1 右山口 / 2 双口齐出
const W = (name, night, groups) => ({ name, night, groups });
const G = (id, count, gap = 0.9, delay = 0, gate = 2) => ({ id, count, gap, delay, gate });

export const WAVES = [
  W('探路之兽', false, [G('huan', 5, 1.4, 0, 0)]),
  W('林中疾影', false, [G('huan', 7, 1.0, 0, 2)]),
  W('土行之属', false, [G('yayu', 5, 1.3, 0, 0), G('huan', 6, 0.8, 3, 1)]),
  W('溯溪而上', false, [G('luoyu', 7, 1.0, 0, 2), G('yayu', 4, 1.4, 5, 0)]),
  W('鸟道横空', true, [G('qitu', 8, 0.8, 0, 2), G('huan', 8, 0.7, 4, 2)]),
  W('赤羽临谷', false, [G('bifang', 5, 1.3, 0, 2), G('yayu', 7, 1.0, 2, 2)]),
  W('大水将至', false, [G('huashe', 6, 1.1, 0, 2), G('luoyu', 8, 0.8, 4, 2)]),
  W('九首之患', true, [G('xiangliu', 3, 2.2, 0, 2), G('huan', 10, 0.6, 3, 2)]),
  W('青丘来客', false, [G('jiuwei', 3, 2.0, 0, 2), G('yayu', 10, 0.8, 2, 2), G('qitu', 6, 0.9, 6, 2)]),
  W('凶兽 · 夔', true, [G('kuifu', 1, 1, 0, 2), G('yayu', 8, 1.0, 6, 2), G('bifang', 5, 1.2, 10, 2)]),
  W('饕餮啖械', false, [G('taotie', 2, 3.0, 0, 2), G('huan', 12, 0.55, 2, 2)]),
  W('混沌无面', false, [G('dijiang', 4, 1.8, 0, 2), G('huashe', 8, 0.9, 4, 2)]),
  W('雷泽之夜', true, [G('bifang', 10, 0.8, 0, 2), G('qitu', 10, 0.7, 3, 2), G('jiuwei', 3, 2.0, 8, 2)]),
  W('九泽横流', false, [G('xiangliu', 5, 1.8, 0, 2), G('luoyu', 12, 0.6, 4, 2)]),
  W('虎翼掠空', false, [G('qiongqi', 3, 2.4, 0, 2), G('qitu', 12, 0.6, 3, 2)]),
  W('贪餮成群', true, [G('taotie', 4, 2.4, 0, 2), G('dijiang', 4, 1.6, 5, 2), G('huan', 14, 0.5, 2, 2)]),
  W('四凶前驱', false, [G('qiongqi', 4, 2.0, 0, 2), G('jiuwei', 5, 1.6, 3, 2), G('yayu', 12, 0.7, 5, 2)]),
  W('赤水滔天', false, [G('huashe', 14, 0.6, 0, 2), G('xiangliu', 6, 1.5, 4, 2)]),
  W('夔鼓再鸣', true, [G('kuifu', 2, 4.0, 0, 2), G('bifang', 12, 0.7, 4, 2), G('taotie', 3, 2.4, 8, 2)]),
  W('穷奇食人', false, [G('qiongqi', 6, 1.8, 0, 2), G('qitu', 16, 0.5, 2, 2), G('dijiang', 5, 1.6, 6, 2)]),
  W('百兽奔谷', false, [G('huan', 20, 0.4, 0, 2), G('yayu', 14, 0.6, 3, 2), G('luoyu', 14, 0.6, 5, 2)]),
  W('群凶并至', true, [G('taotie', 5, 2.0, 0, 2), G('jiuwei', 6, 1.4, 3, 2), G('xiangliu', 8, 1.2, 6, 2)]),
  W('钟山之兆', false, [G('qiongqi', 8, 1.4, 0, 2), G('dijiang', 8, 1.2, 3, 2), G('kuifu', 2, 4.0, 8, 2)]),
  W('烛龙出渊', true, [G('zhulong', 1, 1, 0, 2), G('qiongqi', 6, 1.6, 8, 2), G('taotie', 5, 2.0, 14, 2), G('bifang', 14, 0.6, 4, 2)]),
];

// 无尽模式：第 25 波起按公式生成
export function endlessWave(n) {
  const pool = ['huan', 'yayu', 'luoyu', 'qitu', 'bifang', 'huashe', 'xiangliu', 'jiuwei', 'taotie', 'dijiang', 'qiongqi'];
  const k = n - WAVES.length;
  const groups = [];
  const cnt = 3 + Math.min(3, Math.floor(k / 3));
  for (let i = 0; i < cnt; i++) {
    const id = pool[(k * 3 + i * 5) % pool.length];
    groups.push(G(id, 6 + Math.floor(k * 1.2) + i * 2, 0.5, i * 2.5, 2));
  }
  if (k % 4 === 3) groups.push(G(k % 8 === 7 ? 'zhulong' : 'kuifu', 1 + Math.floor(k / 8), 3.0, 6, 2));
  return { name: `无尽 · 第 ${k} 潮`, night: k % 2 === 1, groups, endless: true, scale: 1 + k * 0.28 };
}

/* ---------------------------------------------------------------- 秘术 */
export const SKILLS = [
  {
    id: 'bolt', name: '天雷', glyph: '雷', key: 'Q', cd: 38, targeted: true, radius: 11,
    desc: '引落九天神雷，范围内造成 <b>360</b> 点真实伤害并震慑 1.5 秒。',
  },
  {
    id: 'freeze', name: '玄冰', glyph: '冰', key: 'W', cd: 52, targeted: true, radius: 15,
    desc: '冻结范围内所有凶兽 <b>3.5 秒</b>，解冻后仍减速数息。',
  },
  {
    id: 'surge', name: '归元', glyph: '元', key: 'E', cd: 62, targeted: false,
    desc: '十息之内机力充沛，全谷机关射速 <b>+70%</b>，且不受断网影响。',
  },
];

/* ---------------------------------------------------------------- 常量 */
export const RULES = {
  startGold: 480,
  startHeart: 20,
  sellRatio: 0.62,
  waveGoldBase: 58,
  waveGoldPerWave: 12,
  minEfficiency: 0.22,
  nightHpMult: 1.14,
  nightSpeedMult: 1.06,
  nightFireBonus: 0.12,     // 夜里灯火通明：射速加成
  leakDamage: 1,            // 每只漏怪扣的社树命
  bossLeakDamage: 6,
};
