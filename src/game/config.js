// 图谱 —— 五行、机关、凶兽、波次，全部数据都在这里
// 数值经过手工配平：早期宽松，中期考验组合，后期考验机力网络。

/* ------------------------------------------------------- 五行 · 玄六气
   两套相制之环，各自成圈，再彼此咬合：

     五行环   金 → 木 → 土 → 水 → 火 → 金
     玄气环   雷 → 风 → 毒 → 蛊 → 暗 → 空 → 雷

   环与环之间每一气再各制一行、各受一行之制，于是十一气结成一张网，
   没有哪一种机关是万能的，也没有哪一种是白摆的。
   beats 写成数组，elementMult 只查表，加新气不必改算法。            */
export const ELEMENTS = {
  /* ---- 五行 ---- */
  metal: {
    key: 'metal', ring: 'wuxing', name: '金', color: 0xe6dcc0, glow: 0xfff4d0,
    beats: ['wood', 'gu'], why: { wood: '金伐木', gu: '金石不蚀，虫无所噬' },
  },
  wood: {
    key: 'wood', ring: 'wuxing', name: '木', color: 0x7fc25c, glow: 0xc4f09a,
    beats: ['earth', 'wind'], why: { earth: '木克土', wind: '林深自御风' },
  },
  earth: {
    key: 'earth', ring: 'wuxing', name: '土', color: 0xd6a35a, glow: 0xffd79a,
    beats: ['water', 'void'], why: { water: '土掩水', void: '厚土填虚' },
  },
  water: {
    key: 'water', ring: 'wuxing', name: '水', color: 0x4fa8e8, glow: 0xa8e4ff,
    beats: ['fire', 'poison'], why: { fire: '水灭火', poison: '清流解毒' },
  },
  fire: {
    key: 'fire', ring: 'wuxing', name: '火', color: 0xf07a3c, glow: 0xffc07a,
    beats: ['metal', 'dark'], why: { metal: '火熔金', dark: '烈火破幽' },
  },
  /* ---- 玄六气 ---- */
  thunder: {
    key: 'thunder', ring: 'xuan', name: '雷', color: 0x8fd0ff, glow: 0xeaf7ff,
    beats: ['wind', 'water'], why: { wind: '迅雷裂罡风', water: '雷震九渊' },
  },
  wind: {
    key: 'wind', ring: 'xuan', name: '风', color: 0x7fe6cc, glow: 0xdcfff2,
    beats: ['poison', 'earth'], why: { poison: '罡风散瘴', earth: '风蚀成雅丹' },
  },
  poison: {
    key: 'poison', ring: 'xuan', name: '毒', color: 0xc4dc36, glow: 0xf2ff9a,
    beats: ['gu', 'wood'], why: { gu: '以毒毙蛊母', wood: '毒枯草木' },
  },
  gu: {
    key: 'gu', ring: 'xuan', name: '蛊', color: 0xb44ad8, glow: 0xf0b8ff,
    beats: ['dark', 'water'], why: { dark: '蛊噬幽暗而肥', water: '蛊毒污泉' },
  },
  dark: {
    key: 'dark', ring: 'xuan', name: '暗', color: 0x6a5ab0, glow: 0xb9a4ff,
    beats: ['void', 'metal'], why: { void: '幽冥吞虚', metal: '暗蚀金铁' },
  },
  void: {
    key: 'void', ring: 'xuan', name: '空', color: 0xdcd4ec, glow: 0xffffff,
    beats: ['thunder', 'fire'], why: { thunder: '虚空无所凭，雷自散', fire: '虚空无薪，火自熄' },
  },
  none: { key: 'none', ring: 'none', name: '·', color: 0xbdb6a4, glow: 0xffffff, beats: [] },
};

// 五行相生（只用来在界面上画环，不参与伤害）
export const WUXING_RING = ['metal', 'wood', 'earth', 'water', 'fire'];
export const XUAN_RING = ['thunder', 'wind', 'poison', 'gu', 'dark', 'void'];

export const COUNTER_MULT = 1.85;   // 克制
export const COUNTERED_MULT = 0.62; // 被克

export function elementMult(atk, def) {
  if (!atk || !def || atk === 'none' || def === 'none') return 1;
  const A = ELEMENTS[atk], D = ELEMENTS[def];
  if (!A || !D) return 1;
  if (A.beats.indexOf(def) >= 0) return COUNTER_MULT;
  if (D.beats.indexOf(atk) >= 0) return COUNTERED_MULT;
  return 1;
}

// 哪些气克得动它 —— 波次预告与凶兽提示都要用
export function beatenBy(key) {
  const out = [];
  for (const k of Object.keys(ELEMENTS)) {
    if (k === 'none' || k === key) continue;
    if (ELEMENTS[k].beats.indexOf(key) >= 0) out.push(k);
  }
  return out;
}

/* ---------------------------------------------------------------- 机关谱 */
// kind: single 单体 / splash 溅射 / cone 锥形 / field 领域 / ring 环身 / chain 连锁
//       gust 罡风（扇形击退）/ venom 瘴沼（落点留毒）/ swarm 蛊虫（叠层附身）
//       curse 幽咒（领域易伤）/ warp 须弥（拽回兽道）/ pierce 穿刺（直线贯穿）
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
    id: 'thunder', name: '引雷桩', el: 'thunder', kind: 'chain', hotkey: '6',
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

  /* ================= 玄六气机关：风 · 毒 · 蛊 · 暗 · 空，与水系穿刺 ================= */
  {
    id: 'gust', name: '飓风橐', el: 'wind', kind: 'gust', hotkey: '7',
    cost: 125, power: 11, range: 22, dmg: 28, rate: 0.85, cone: 0.52, push: 4.4,
    link: 0, glyph: '罡',
    desc: '橐龠鼓风，罡风成刃。一记风压把当面的兽群连人带气推回去 —— 伤害不算高，' +
          '争到的那几息却够别处机关多打好几轮。',
    up: [
      { dmg: 28, rate: 0.85, range: 22, power: 11, push: 4.4, cone: 0.52 },
      { dmg: 48, rate: 0.95, range: 25, power: 16, push: 5.8, cone: 0.60, cost: 118 },
      { dmg: 82, rate: 1.10, range: 28, power: 23, push: 7.6, cone: 0.70, cost: 250 },
    ],
    upName: ['一阶 · 单橐', '二阶 · 双橐连鼓', '三阶 · 九霄罡风'],
  },
  {
    id: 'venom', name: '百毒瓮', el: 'poison', kind: 'venom', hotkey: '8',
    cost: 110, power: 9, range: 28, dmg: 14, rate: 0.72, projSpeed: 40, arc: true,
    splash: 6.0, venom: 24, venomTime: 6.0, sunder: 3, poolTime: 6.0,
    link: 0, glyph: '瘴',
    desc: '掷出封了五毒的陶瓮，碎处腾起一洼瘴气，久久不散。瘴中之兽气血不断流失，' +
          '皮甲也被蚀薄 —— 越是厚甲的重兽，越怕它。',
    up: [
      { dmg: 14, rate: 0.72, range: 28, power: 9, splash: 6.0, venom: 24, sunder: 3 },
      { dmg: 24, rate: 0.80, range: 31, power: 14, splash: 7.0, venom: 42, sunder: 5, cost: 104 },
      { dmg: 40, rate: 0.90, range: 34, power: 20, splash: 8.2, venom: 72, sunder: 8, cost: 222 },
    ],
    upName: ['一阶 · 五毒瓮', '二阶 · 瘴母瓮', '三阶 · 百毒炼瓮'],
  },
  {
    id: 'gu', name: '万蛊坛', el: 'gu', kind: 'swarm', hotkey: '9',
    cost: 155, power: 14, range: 24, dmg: 11, rate: 1.15, projSpeed: 30,
    stackMax: 6, stackDmg: 8, hop: 13,
    link: 0, glyph: '蛊',
    desc: '坛口一开，蛊虫认准一只便扑上去，越叮越多，伤势层层相叠。' +
          '宿主一死，蛊虫立刻扑向近旁下一只 —— 一坛蛊能顺着队伍一路吃下去。',
    up: [
      { dmg: 11, rate: 1.15, range: 24, power: 14, stackMax: 6, stackDmg: 8 },
      { dmg: 19, rate: 1.30, range: 27, power: 20, stackMax: 8, stackDmg: 14, cost: 148 },
      { dmg: 32, rate: 1.50, range: 30, power: 28, stackMax: 11, stackDmg: 24, cost: 310 },
    ],
    upName: ['一阶 · 蛊皿', '二阶 · 金蚕坛', '三阶 · 万蛊归宗'],
  },
  {
    id: 'shade', name: '幽冥幡', el: 'dark', kind: 'curse', hotkey: '0',
    cost: 135, power: 12, range: 18, dmg: 17, rate: 1.4, vuln: 0.30, vulnTime: 3.4,
    link: 0, glyph: '冥',
    desc: '玄幡一展，幡影所覆之处天光尽敛。凶兽被幽气缠身，此后受的每一记都重上三成 —— ' +
          '它自己打不疼谁，却能让全谷的机关都变利。',
    up: [
      { dmg: 17, rate: 1.4, range: 18, power: 12, vuln: 0.30 },
      { dmg: 29, rate: 1.6, range: 21, power: 18, vuln: 0.40, cost: 128 },
      { dmg: 48, rate: 1.8, range: 24, power: 26, vuln: 0.52, cost: 272 },
    ],
    upName: ['一阶 · 招魂幡', '二阶 · 玄冥幡', '三阶 · 幽都九幽幡'],
  },
  {
    id: 'sumeru', name: '须弥壶', el: 'void', kind: 'warp',
    cost: 215, power: 21, range: 20, dmg: 58, rate: 0.40, pull: 9.5,
    link: 0, glyph: '须',
    desc: '芥子纳须弥。壶口一开，方圆之内的凶兽连同脚下那段路一并被卷回去数丈。' +
          '极耗机力，却是守不住时的最后一手。',
    up: [
      { dmg: 58, rate: 0.40, range: 20, power: 21, pull: 9.5 },
      { dmg: 98, rate: 0.46, range: 23, power: 31, pull: 13.0, cost: 205 },
      { dmg: 168, rate: 0.54, range: 26, power: 44, pull: 17.5, cost: 430 },
    ],
    upName: ['一阶 · 芥子壶', '二阶 · 须弥壶', '三阶 · 周天须弥'],
  },
  {
    id: 'torrent', name: '蛟龙渠', el: 'water', kind: 'pierce',
    cost: 150, power: 13, range: 30, dmg: 44, rate: 1.05, pierceW: 2.6,
    link: 0, glyph: '蛟',
    desc: '引渠水成矢，一注贯穿整条兽道，沿途无论几只一并洗过。' +
          '摆在长而直的路口，一发抵得上半排连弩。',
    up: [
      { dmg: 44, rate: 1.05, range: 30, power: 13, pierceW: 2.6 },
      { dmg: 74, rate: 1.20, range: 33, power: 19, pierceW: 3.1, cost: 142 },
      { dmg: 124, rate: 1.35, range: 37, power: 27, pierceW: 3.8, cost: 300 },
    ],
    upName: ['一阶 · 引渠', '二阶 · 双龙渠', '三阶 · 九曲蛟龙'],
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

  /* ---------------- 各关专属的发力机关 ---------------- */
  {
    id: 'forge', name: '地火炉', el: 'none', kind: 'gen', hotkey: '7',
    cost: 88, power: -34, range: 0, link: 28, needs: 'open', glyph: '炉',
    desc: '引地脉之火鼓风推鞲，何处皆可安炉。炎火之山无水可引，全谷机力皆出于此。',
    up: [
      { power: -34, link: 28 },
      { power: -56, link: 31, cost: 80 },
      { power: -88, link: 35, cost: 168 },
    ],
    upName: ['一阶 · 单炉', '二阶 · 连鞲炉', '三阶 · 九龙炉'],
  },
  {
    id: 'tide', name: '潮汐轮', el: 'none', kind: 'gen', hotkey: '7',
    cost: 76, power: -40, range: 0, link: 32, needs: 'water', glyph: '潮',
    desc: '架于潮间，一涨一落皆是力。归墟潮信极大，出力冠绝诸关，只是非临海不可立。',
    up: [
      { power: -40, link: 32 },
      { power: -66, link: 35, cost: 72 },
      { power: -104, link: 40, cost: 155 },
    ],
    upName: ['一阶 · 单叶轮', '二阶 · 双叶轮', '三阶 · 八方潮轮'],
  },
  {
    id: 'aether', name: '云枢', el: 'none', kind: 'gen', hotkey: '7',
    cost: 120, power: -46, range: 0, link: 34, needs: 'open', glyph: '云',
    desc: '悬圃之上无水无薪，唯以玉枢承云气而转。造价虽高，出力绵长不绝。',
    up: [
      { power: -46, link: 34 },
      { power: -74, link: 38, cost: 110 },
      { power: -116, link: 43, cost: 235 },
    ],
    upName: ['一阶 · 云枢', '二阶 · 双璧枢', '三阶 · 周天枢'],
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
    id: 'xiangliu', name: '相柳', el: 'poison', hp: 620, speed: 3.8, armor: 3, bounty: 30,
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
    id: 'dijiang', name: '帝江', el: 'void', hp: 900, speed: 4.4, armor: 4, bounty: 40,
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
    id: 'kuifu', name: '夔', el: 'thunder', hp: 6800, speed: 3.2, armor: 12, bounty: 260,
    scale: 2.47, body: 0x4c5763, accent: 0x6cbde8, kind: 'ground', boss: true,
    traits: ['shock'],
    desc: '状如牛，苍身而无角，一足，出入水则必风雨，其声如雷。',
  },

  /* ---------------- 二 · 炎火之山 ---------------- */
  zheng: {
    id: 'zheng', name: '狰', el: 'fire', hp: 340, speed: 6.6, armor: 2, bounty: 17,
    scale: 1.28, body: 0xb8341c, accent: 0xffb03c, kind: 'ground',
    traits: ['ignite'],
    desc: '状如赤豹，五尾一角，其音如击石。所过之处，草木皆焦。',
  },
  qique: {
    id: 'qique', name: '鬿雀', el: 'fire', hp: 300, speed: 8.4, armor: 1, bounty: 22,
    scale: 1.14, body: 0xd2691e, accent: 0xffe08a, kind: 'air',
    desc: '状如鸡而白首，鼠足而虎爪，是食人。掠空而下，不循兽道。',
  },
  huoshu: {
    id: 'huoshu', name: '火鼠', el: 'fire', hp: 190, speed: 9.2, armor: 0, bounty: 11,
    scale: 0.96, body: 0x8c2b12, accent: 0xff8a3c, kind: 'ground',
    desc: '生于火中，其毛可织。行疾如火星迸溅，成群则势如燎原。',
  },
  zhuyan: {
    id: 'zhuyan', name: '朱厌', el: 'metal', hp: 8200, speed: 3.4, armor: 13, bounty: 300,
    scale: 2.62, body: 0xe8e2d4, accent: 0xc0281a, kind: 'ground', boss: true,
    traits: ['devour', 'shock'],
    desc: '状如猿，白首赤足，见则大兵。挥臂所及，机括俱碎。',
  },

  /* ---------------- 三 · 幽都寒渊 ---------------- */
  zhujian: {
    id: 'zhujian', name: '诸犍', el: 'earth', hp: 460, speed: 5.2, armor: 4, bounty: 21,
    scale: 1.42, body: 0x5c6470, accent: 0xa8c8dc, kind: 'ground',
    desc: '豹身人首，牛耳一目，善吼。行则衔其尾，居则蟠其尾。',
  },
  jiao: {
    id: 'jiao', name: '狡', el: 'wood', hp: 240, speed: 8.8, armor: 0, bounty: 14,
    scale: 1.08, body: 0x6b7a5e, accent: 0xd8e8a0, kind: 'ground',
    desc: '状如犬而豹文，其角如牛，其音如吠犬，见则其国大穰。',
  },
  hanba: {
    id: 'hanba', name: '寒鸮', el: 'water', hp: 330, speed: 8.0, armor: 1, bounty: 20,
    scale: 1.16, body: 0x38566e, accent: 0xbfe8ff, kind: 'air',
    traits: ['flood'],
    desc: '玄羽白瞳，翼过处泉眼尽冻。掠空而行，最恨临水之械。',
  },
  qiangliang: {
    id: 'qiangliang', name: '強良', el: 'thunder', hp: 9600, speed: 3.0, armor: 15, bounty: 340,
    scale: 2.78, body: 0x46525e, accent: 0x7fe0ff, kind: 'ground', boss: true,
    traits: ['shock', 'regen'],
    desc: '衔蛇操蛇，虎首人身，四蹄长肘。一步一雷，冰原为之震裂。',
  },

  /* ---------------- 四 · 归墟海眼 ---------------- */
  lingyu: {
    id: 'lingyu', name: '陵鱼', el: 'water', hp: 420, speed: 6.0, armor: 2, bounty: 20,
    scale: 1.30, body: 0x2f6f82, accent: 0x7fe8d8, kind: 'ground',
    traits: ['aquatic'],
    desc: '人面手足鱼身，在海中。潮来则随潮而上，登岸如履平地。',
  },
  shebishi: {
    id: 'shebishi', name: '奢比尸', el: 'poison', hp: 780, speed: 4.6, armor: 6, bounty: 32,
    scale: 1.62, body: 0x6a6250, accent: 0xe8c878, kind: 'ground',
    traits: ['devour'],
    desc: '兽身人面大耳，珥两青蛇。张口所向，机括为之停转。',
  },
  zhuanyu: {
    id: 'zhuanyu', name: '鱄鱼', el: 'fire', hp: 360, speed: 8.6, armor: 1, bounty: 24,
    scale: 1.18, body: 0x9c4a2c, accent: 0xffd07a, kind: 'air',
    desc: '状如鲋而彘毛，其音如豚，见则天下大旱。振鳍而飞，不循兽道。',
  },
  yuqiang: {
    id: 'yuqiang', name: '禺彊', el: 'wind', hp: 11200, speed: 2.8, armor: 16, bounty: 380,
    scale: 2.86, body: 0x1f4e5c, accent: 0x6fe0e8, kind: 'ground', boss: true,
    traits: ['flood', 'regen', 'unslowable'],
    desc: '北海之神，人面鸟身，珥两青蛇，践两青蛇。所至之处，潮涌没膝。',
  },

  /* ---------------- 五 · 昆仑天阙 ---------------- */
  tulou: {
    id: 'tulou', name: '土蝼', el: 'earth', hp: 620, speed: 5.0, armor: 6, bounty: 24,
    scale: 1.46, body: 0x8a7448, accent: 0xffd88a, kind: 'ground',
    desc: '状如羊而四角，是食人。昆仑之丘，其兽多此。',
  },
  yingzhao: {
    id: 'yingzhao', name: '英招', el: 'wind', hp: 560, speed: 9.0, armor: 3, bounty: 30,
    scale: 1.42, body: 0x5e7c52, accent: 0xf0e08a, kind: 'air',
    traits: ['aura'],
    desc: '马身而人面，虎文而鸟翼，徇于四海。振翼掠空，同行者皆得其庇。',
  },
  luwu: {
    id: 'luwu', name: '陆吾', el: 'metal', hp: 2400, speed: 4.8, armor: 10, bounty: 78,
    scale: 1.86, body: 0xc0a460, accent: 0xfff0c8, kind: 'ground',
    traits: ['aura'],
    desc: '虎身而九尾，人面而虎爪。司天之九部及帝之囿时。',
  },
  kaiming: {
    id: 'kaiming', name: '开明兽', el: 'earth', hp: 16800, speed: 2.6, armor: 20, bounty: 520,
    scale: 3.12, body: 0xb89a54, accent: 0xfff2c0, kind: 'ground', boss: true,
    traits: ['split', 'devour', 'regen', 'unslowable'],
    desc: '身大类虎而九首，皆人面，东向立昆仑上。九门之守，非其许不得入。',
  },

  /* ---------------- 玄六气之属：散在诸关，专克新机关 ---------------- */
  fei: {
    id: 'fei', name: '蜚', el: 'poison', hp: 720, speed: 4.0, armor: 7, bounty: 26,
    scale: 1.54, body: 0x9aa06a, accent: 0xe8f08a, kind: 'ground',
    traits: ['plague'],
    desc: '状如牛而白首，一目而蛇尾。行水则竭，行草则死，所行之国大疫。',
  },
  wangxiang: {
    id: 'wangxiang', name: '罔象', el: 'dark', hp: 430, speed: 7.4, armor: 3, bounty: 22,
    scale: 1.06, body: 0x453a5e, accent: 0xa88ce0, kind: 'ground',
    traits: ['dim'],
    desc: '状如小儿，赤黑色，赤爪大耳长臂。好食人肝，掩至而人不觉。',
  },
  gudiao: {
    id: 'gudiao', name: '蛊雕', el: 'gu', hp: 560, speed: 7.8, armor: 3, bounty: 28,
    scale: 1.34, body: 0x6a3c78, accent: 0xe0a0ff, kind: 'air',
    desc: '状如雕而有角，其音如婴儿之音，是食人。掠空而下，不循兽道。',
  },
  xuanfeng: {
    id: 'xuanfeng', name: '玄蜂', el: 'gu', hp: 210, speed: 10.2, armor: 0, bounty: 12,
    scale: 0.92, body: 0x2e2418, accent: 0xf0c020, kind: 'air',
    desc: '其大如壶，其状如螽。成群而至，声如雷动。',
  },
  guiche: {
    id: 'guiche', name: '鬼车', el: 'dark', hp: 1400, speed: 6.4, armor: 6, bounty: 46,
    scale: 1.62, body: 0x38304e, accent: 0xc0a8f0, kind: 'air',
    traits: ['dim', 'split'],
    desc: '九首之鸟，一首为犬所噬，滴血所至，其家有殃。夜飞昼藏。',
  },
  feiyi: {
    id: 'feiyi', name: '肥遗', el: 'void', hp: 980, speed: 4.6, armor: 8, bounty: 38,
    scale: 1.58, body: 0x7a7488, accent: 0xe8e0f8, kind: 'ground',
    traits: ['unslowable'],
    desc: '六足四翼，见则天下大旱。所过之处，泉眼自涸，机括生锈。',
  },
};

/* ---------------------------------------------------------------- 波次 */
// gate: 0 左山口 / 1 右山口 / 2 双口齐出
const W = (name, night, groups) => ({ name, night, groups });
const G = (id, count, gap = 0.9, delay = 0, gate = 2) => ({ id, count, gap, delay, gate });

const WAVES_QIWU = [
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

/* ---- 二 · 炎火之山：火属压倒性，须以水阵与寒泉相抗 ---- */
const WAVES_YANHUO = [
  W('焦石先驱', false, [G('huoshu', 8, 1.0, 0, 0)]),
  W('赤沙疾走', false, [G('huoshu', 12, 0.7, 0, 2), G('huan', 6, 1.0, 4, 2)]),
  W('五尾之狰', false, [G('zheng', 5, 1.4, 0, 2), G('huoshu', 10, 0.7, 3, 2)]),
  W('白首赤足', true, [G('zheng', 7, 1.2, 0, 2), G('yayu', 8, 1.0, 3, 2)]),
  W('鬿雀掠空', false, [G('qique', 8, 0.9, 0, 2), G('huoshu', 14, 0.6, 2, 2)]),
  W('讹火临谷', false, [G('bifang', 8, 1.1, 0, 2), G('zheng', 8, 1.1, 4, 2)]),
  W('雅丹群行', true, [G('yayu', 12, 0.8, 0, 2), G('qique', 10, 0.8, 4, 2), G('zheng', 6, 1.3, 8, 2)]),
  W('大旱之兆', false, [G('feiyi', 5, 1.6, 0, 2), G('huoshu', 14, 0.6, 3, 2)]),
  W('贪餮啖炉', false, [G('taotie', 3, 2.6, 0, 2), G('huoshu', 18, 0.5, 2, 2)]),
  W('混沌无面', false, [G('dijiang', 6, 1.5, 0, 2), G('qique', 12, 0.7, 3, 2), G('feiyi', 4, 1.8, 6, 2)]),
  W('白首一目', false, [G('fei', 6, 1.5, 0, 2), G('zheng', 8, 1.1, 4, 2)]),
  W('赤焰蔽日', true, [G('bifang', 14, 0.6, 0, 2), G('zheng', 10, 1.0, 4, 2), G('taotie', 4, 2.2, 9, 2)]),
  W('虎翼入火', false, [G('qiongqi', 5, 1.8, 0, 2), G('huoshu', 20, 0.45, 2, 2)]),
  W('凶兽 · 朱厌', true, [G('zhuyan', 1, 1, 0, 2), G('zheng', 10, 1.0, 6, 2), G('qique', 12, 0.7, 10, 2)]),
  W('火山将崩', false, [G('dijiang', 8, 1.3, 0, 2), G('taotie', 6, 2.0, 4, 2), G('qiongqi', 5, 1.8, 8, 2), G('fei', 6, 1.5, 12, 2)]),
  W('炎火尽出', true, [G('zhuyan', 2, 4.0, 0, 2), G('bifang', 16, 0.55, 4, 2), G('zheng', 12, 0.9, 8, 2), G('qique', 14, 0.6, 12, 2), G('feiyi', 6, 1.6, 16, 2)]),
];

/* ---- 三 · 幽都寒渊：夜战为主，凶兽厚甲高血 ---- */
const WAVES_YOUDU = [
  W('冰原之犬', false, [G('jiao', 8, 1.1, 0, 0)]),
  W('雪中疾影', true, [G('jiao', 12, 0.7, 0, 2), G('huan', 8, 0.9, 3, 2)]),
  W('一目诸犍', false, [G('zhujian', 6, 1.3, 0, 2), G('jiao', 10, 0.8, 3, 2)]),
  W('寒鸮临渊', true, [G('hanba', 8, 0.9, 0, 2), G('zhujian', 6, 1.3, 4, 2)]),
  W('黑水罔象', true, [G('wangxiang', 10, 0.8, 0, 2), G('jiao', 10, 0.8, 3, 2)]),
  W('冻河横流', false, [G('huashe', 10, 0.9, 0, 2), G('luoyu', 12, 0.7, 4, 2)]),
  W('九首之患', true, [G('xiangliu', 5, 1.8, 0, 2), G('jiao', 14, 0.6, 3, 2)]),
  W('青丘踏雪', false, [G('jiuwei', 5, 1.6, 0, 2), G('zhujian', 10, 1.0, 3, 2), G('hanba', 8, 0.9, 7, 2), G('wangxiang', 10, 0.7, 4, 2)]),
  W('夔鼓震冰', true, [G('kuifu', 2, 3.5, 0, 2), G('zhujian', 10, 1.0, 5, 2), G('hanba', 10, 0.8, 9, 2)]),
  W('玄冰崩裂', false, [G('taotie', 5, 2.2, 0, 2), G('xiangliu', 6, 1.5, 4, 2)]),
  W('极夜将临', true, [G('hanba', 16, 0.55, 0, 2), G('jiuwei', 6, 1.4, 4, 2), G('zhujian', 12, 0.9, 8, 2), G('wangxiang', 14, 0.6, 2, 2)]),
  W('穷奇踏霜', false, [G('qiongqi', 6, 1.7, 0, 2), G('jiao', 18, 0.5, 2, 2)]),
  W('凶兽 · 強良', true, [G('qiangliang', 1, 1, 0, 2), G('kuifu', 1, 1, 8, 2), G('zhujian', 12, 0.9, 5, 2)]),
  W('幽都倾巢', false, [G('xiangliu', 8, 1.3, 0, 2), G('taotie', 6, 2.0, 4, 2), G('hanba', 14, 0.6, 8, 2)]),
  W('寒渊之底', true, [G('qiangliang', 2, 4.5, 0, 2), G('qiongqi', 8, 1.4, 5, 2), G('jiuwei', 8, 1.2, 9, 2), G('hanba', 16, 0.5, 12, 2), G('wangxiang', 16, 0.5, 3, 2)]),
];

/* ---- 四 · 归墟海眼：地窄路长，飞兽比例极高 ---- */
const WAVES_GUIXU = [
  W('潮头之鱼', false, [G('lingyu', 7, 1.2, 0, 0)]),
  W('随潮而上', false, [G('lingyu', 12, 0.8, 0, 2), G('luoyu', 10, 0.9, 3, 2)]),
  W('鱄鱼振鳍', true, [G('zhuanyu', 10, 0.8, 0, 2), G('lingyu', 10, 0.9, 3, 2)]),
  W('玄蜂蔽日', false, [G('xuanfeng', 16, 0.5, 0, 2), G('lingyu', 8, 1.0, 4, 2)]),
  W('奢比之尸', false, [G('shebishi', 5, 1.6, 0, 2), G('lingyu', 12, 0.8, 3, 2)]),
  W('大水将至', false, [G('huashe', 12, 0.8, 0, 2), G('zhuanyu', 12, 0.7, 4, 2)]),
  W('九首缠礁', true, [G('xiangliu', 6, 1.6, 0, 2), G('lingyu', 14, 0.7, 3, 2)]),
  W('海眼吞舟', false, [G('shebishi', 8, 1.4, 0, 2), G('dijiang', 6, 1.5, 4, 2), G('zhuanyu', 12, 0.7, 8, 2)]),
  W('婴啼之雕', true, [G('gudiao', 8, 1.2, 0, 2), G('xuanfeng', 14, 0.55, 3, 2)]),
  W('虎翼掠海', true, [G('qiongqi', 6, 1.7, 0, 2), G('zhuanyu', 16, 0.55, 2, 2)]),
  W('贪餮食舟', false, [G('taotie', 6, 2.0, 0, 2), G('lingyu', 16, 0.6, 3, 2), G('fei', 6, 1.5, 6, 2)]),
  W('潮信大作', true, [G('huashe', 16, 0.6, 0, 2), G('shebishi', 10, 1.2, 4, 2), G('xiangliu', 8, 1.3, 9, 2)]),
  W('鸟身之神', false, [G('yuqiang', 1, 1, 0, 2), G('zhuanyu', 14, 0.6, 6, 2)]),
  W('万水朝宗', true, [G('xiangliu', 10, 1.2, 0, 2), G('qiongqi', 8, 1.4, 4, 2), G('shebishi', 12, 1.0, 8, 2), G('gudiao', 10, 1.0, 2, 2)]),
  W('归墟无底', false, [G('yuqiang', 2, 4.5, 0, 2), G('taotie', 8, 1.8, 5, 2), G('zhuanyu', 18, 0.5, 9, 2), G('lingyu', 18, 0.5, 12, 2), G('gudiao', 10, 1.0, 3, 2), G('fei', 8, 1.4, 7, 2)]),
];

/* ---- 五 · 昆仑天阙：可建之地极狭，全是硬仗 ---- */
const WAVES_KUNLUN = [
  W('四角土蝼', false, [G('tulou', 8, 1.1, 0, 0)]),
  W('虎文鸟翼', false, [G('yingzhao', 8, 1.0, 0, 2), G('tulou', 10, 0.9, 3, 2)]),
  W('九尾陆吾', true, [G('luwu', 4, 2.0, 0, 2), G('tulou', 12, 0.8, 3, 2)]),
  W('天梯攀援', false, [G('qiongqi', 5, 1.8, 0, 2), G('yingzhao', 10, 0.8, 3, 2)]),
  W('九首夜飞', true, [G('guiche', 5, 1.8, 0, 2), G('feiyi', 6, 1.5, 4, 2)]),
  W('百神来朝', true, [G('luwu', 6, 1.6, 0, 2), G('jiuwei', 8, 1.2, 4, 2), G('yingzhao', 10, 0.8, 8, 2)]),
  W('饕餮登台', false, [G('taotie', 8, 1.8, 0, 2), G('tulou', 14, 0.7, 3, 2), G('feiyi', 8, 1.3, 6, 2)]),
  W('玉阶浴血', true, [G('qiongqi', 8, 1.4, 0, 2), G('luwu', 8, 1.4, 4, 2), G('yingzhao', 12, 0.7, 8, 2)]),
  W('夔与強良', false, [G('kuifu', 2, 3.5, 0, 2), G('qiangliang', 1, 1, 6, 2), G('tulou', 14, 0.7, 3, 2)]),
  W('烛龙升天', true, [G('zhulong', 1, 1, 0, 2), G('luwu', 8, 1.4, 6, 2), G('qiongqi', 8, 1.4, 10, 2)]),
  W('九门将启', false, [G('taotie', 10, 1.6, 0, 2), G('dijiang', 10, 1.1, 4, 2), G('yingzhao', 14, 0.6, 8, 2), G('guiche', 8, 1.3, 2, 2)]),
  W('开明兽 · 上', true, [G('kaiming', 1, 1, 0, 2), G('luwu', 10, 1.2, 6, 2), G('tulou', 16, 0.6, 3, 2)]),
  W('帝之下都', false, [G('qiongqi', 12, 1.1, 0, 2), G('zhulong', 1, 1, 5, 2), G('qiangliang', 2, 4.0, 10, 2)]),
  W('开明兽 · 终', true, [G('kaiming', 2, 5.0, 0, 2), G('luwu', 12, 1.0, 6, 2), G('qiongqi', 10, 1.2, 10, 2), G('yingzhao', 16, 0.5, 14, 2), G('guiche', 10, 1.1, 3, 2), G('feiyi', 10, 1.2, 8, 2)]),
];

// 关卡 id -> 波次表
export const LEVEL_WAVES = {
  qiwu: WAVES_QIWU,
  yanhuo: WAVES_YANHUO,
  youdu: WAVES_YOUDU,
  guixu: WAVES_GUIXU,
  kunlun: WAVES_KUNLUN,
};

// 各关无尽模式的兽群池
const ENDLESS_POOL = {
  qiwu: ['huan', 'yayu', 'luoyu', 'qitu', 'bifang', 'huashe', 'xiangliu', 'jiuwei', 'taotie', 'dijiang', 'qiongqi'],
  yanhuo: ['huoshu', 'zheng', 'qique', 'bifang', 'yayu', 'taotie', 'dijiang', 'qiongqi', 'fei', 'feiyi'],
  youdu: ['jiao', 'zhujian', 'hanba', 'huashe', 'xiangliu', 'jiuwei', 'taotie', 'qiongqi', 'wangxiang'],
  guixu: ['lingyu', 'zhuanyu', 'shebishi', 'huashe', 'luoyu', 'xiangliu', 'taotie', 'qiongqi', 'xuanfeng', 'gudiao', 'fei'],
  kunlun: ['tulou', 'yingzhao', 'luwu', 'qiongqi', 'taotie', 'dijiang', 'jiuwei', 'guiche', 'feiyi'],
};
const ENDLESS_BOSS = {
  qiwu: ['kuifu', 'zhulong'],
  yanhuo: ['zhuyan', 'kuifu'],
  youdu: ['qiangliang', 'kuifu'],
  guixu: ['yuqiang', 'zhulong'],
  kunlun: ['kaiming', 'qiangliang'],
};

export function wavesOf(levelId) { return LEVEL_WAVES[levelId] || WAVES_QIWU; }

// 无尽模式：打完固定波次后按公式生成
export function endlessWave(n, levelId = 'qiwu') {
  const table = wavesOf(levelId);
  const pool = ENDLESS_POOL[levelId] || ENDLESS_POOL.qiwu;
  const bosses = ENDLESS_BOSS[levelId] || ENDLESS_BOSS.qiwu;
  const k = n - table.length;
  const groups = [];
  const cnt = 3 + Math.min(3, Math.floor(k / 3));
  for (let i = 0; i < cnt; i++) {
    const id = pool[(k * 3 + i * 5) % pool.length];
    groups.push(G(id, 6 + Math.floor(k * 1.2) + i * 2, 0.5, i * 2.5, 2));
  }
  if (k % 4 === 3) groups.push(G(bosses[k % 8 === 7 ? 1 : 0], 1 + Math.floor(k / 8), 3.0, 6, 2));
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
