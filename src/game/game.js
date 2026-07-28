// 玩法核心 —— 资源、建造、波次、开火、秘术、胜负
import * as THREE from 'three';
import { clamp, lerp, smoothstep, Rng } from '../core/noise.js';
import { audio } from '../core/audio.js';
import {
  TOWERS, TOWER_BY_ID, ENEMIES, SKILLS, RULES, ELEMENTS,
  elementMult, endlessWave, wavesOf,
} from './config.js';
import { BuildGrid } from './grid.js';
import { TowerManager } from './towers.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Sparks, Rings, Bolts, FloatText } from './fx.js';
import { LEVEL, HEART, GATES, PATHS } from '../world/layout.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);   // engine, terrain, rig, dayNight, village, atmo
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;

    this.grid = new BuildGrid(this.scene, this.terrain);
    this.towers = new TowerManager(this.scene, this.terrain, this.grid, this);
    this.enemies = new EnemyManager(this.scene, this.terrain, this);
    this.projectiles = new Projectiles(this.scene, this);
    this.sparks = new Sparks(this.scene, 3600);
    this.smoke = new Sparks(this.scene, 900, THREE.NormalBlending);
    this.rings = new Rings(this.scene, 56);
    this.bolts = new Bolts(this.scene, 26, 9);

    this.state = 'menu';           // menu | build | wave | over
    const R = LEVEL.rules || RULES;
    this.gold = R.startGold;
    this.heart = R.startHeart;
    this.maxHeart = R.startHeart;
    this.levelIndex = LEVEL.index;
    this.cleared = [];             // 已通关的关卡序号
    this.waveIndex = 0;
    this.speed = 1;
    this.surge = 0;
    this.hurt = 0;
    this.selectedTowerId = null;
    this.selected = null;
    this.hoverSlot = null;
    this.armedSkill = null;
    this.skillCd = {};
    for (const s of SKILLS) this.skillCd[s.id] = 0;
    this.spawnQueue = [];
    this.waveActive = false;
    this.waveTimer = 0;
    this.stats = { kills: 0, built: 0, gold: 0, best: 0 };
    this.time = 0;
    this._ray = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this.cursorWorld = new THREE.Vector3();
    this.showLinks = false;
    this.endlessAnnounced = false;
    this.pools = [];               // 瘴沼：百毒瓮砸出来的那一洼
    this._bindInput();
    this.heartPos = new THREE.Vector3(HEART.x, this.terrain.plazaY + 2.5, HEART.z);
  }

  attachHUD(hud) {
    this.hud = hud;
    this.floats = new FloatText(hud.floatLayer, this.camera);
  }

  /* ------------------------------------------------------ 输入 */
  _bindInput() {
    const dom = this.engine.renderer.domElement;
    dom.addEventListener('pointermove', (e) => {
      this._pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pointerPx = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.shiftKey) return;
      this._downAt = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this._downAt) return;
      const moved = Math.hypot(e.clientX - this._downAt.x, e.clientY - this._downAt.y);
      this._downAt = null;
      if (moved > 6) return;
      this.onClick();
    });
    addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      this.onKey(e);
    });
  }

  onKey(e) {
    const k = e.code;
    if (this.state === 'menu' || this.state === 'over') {
      if (k === 'KeyM') { audio.setMuted(!audio.muted); }
      return;
    }
    if (k === 'Escape') {
      if (this.armedSkill) { this.armedSkill = null; this.hud && this.hud.refreshSkills(); }
      else { this.selectTowerType(null); this.select(null); }
      return;
    }
    if (k.startsWith('Digit')) {
      // 一关最多开十二种机关，1~9 各占一种，0 是第十种，再多的只能点
      const d = parseInt(k.slice(5), 10);
      const n = d === 0 ? 10 : d;
      const list = this.towerList;
      if (n >= 1 && n <= list.length) { this.selectTowerType(list[n - 1].id); audio.click(); }
      return;
    }
    if (k === 'KeyQ') { this.armSkill('bolt'); return; }
    if (k === 'KeyF') { this.armSkill('freeze'); return; }
    if (k === 'KeyG') { this.armSkill('surge'); return; }
    if (k === 'KeyR') { this.rig.reset(); return; }
    if (k === 'Space') {
      e.preventDefault();
      if (!this.waveActive) this.startWave(); else this.cycleSpeed();
      return;
    }
    if (k === 'KeyN') { this.toggleDayNight(); return; }
    if (k === 'KeyL') { this.showLinks = !this.showLinks; this.toast(this.showLinks ? '显示机力网络' : '隐藏机力网络'); return; }
    if (k === 'KeyX' && this.selected) { this.sellSelected(); return; }
    if (k === 'KeyC' && this.selected) { this.upgradeSelected(); return; }
    if (k === 'KeyM') { audio.setMuted(!audio.muted); this.toast(audio.muted ? '已静音' : '已开声'); return; }
  }

  onClick() {
    if (this.state === 'menu' || this.state === 'over') return;
    audio.resume();
    if (this.armedSkill) { this.castSkill(this.armedSkill, this.cursorWorld); return; }
    if (this.selectedTowerId && this.hoverSlot) { this.tryBuild(this.selectedTowerId, this.hoverSlot); return; }
    this.select(this.pickTower());
  }

  pickTower() {
    let best = null, bd = 4.6 * 4.6;
    for (const t of this.towers.towers) {
      const dx = t.x - this.cursorWorld.x, dz = t.z - this.cursorWorld.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  select(t) {
    this.selected = t;
    if (t) { this.selectedTowerId = null; audio.click(); }
    if (this.hud) { this.hud.refreshSelection(); this.hud.refreshBuildBar(); }
  }

  selectTowerType(id) {
    this.selectedTowerId = (this.selectedTowerId === id) ? null : id;
    if (this.selectedTowerId) { this.selected = null; this.armedSkill = null; }
    if (this.hud) { this.hud.refreshBuildBar(); this.hud.refreshSelection(); this.hud.refreshSkills(); }
  }

  armSkill(id) {
    const s = SKILLS.find(x => x.id === id);
    if (!s) return;
    if (this.skillCd[id] > 0) { audio.denied(); this.toast('秘术尚未复原', 'bad'); return; }
    if (!s.targeted) { this.castSkill(id, null); return; }
    this.armedSkill = this.armedSkill === id ? null : id;
    this.selectedTowerId = null;
    audio.click();
    if (this.hud) { this.hud.refreshSkills(); this.hud.refreshBuildBar(); }
  }

  /* ------------------------------------------------------ 建造 */
  tryBuild(id, slot) {
    const def = TOWER_BY_ID[id];
    if (!def) return;
    if (!this.towers.canPlaceAt(def, slot)) {
      audio.denied();
      this.toast(def.needs === 'water' ? '水车须临溪而立' : '此处不可安放', 'bad');
      return;
    }
    if (this.gold < def.cost) { audio.denied(); this.toast('灵石不足', 'bad'); return; }
    this.gold -= def.cost;
    const t = this.towers.place(id, slot);
    if (!t) { this.gold += def.cost; return; }
    this.stats.built++;
    audio.build();
    this.sparks.emit(slot.x, slot.y + 0.6, slot.z, 26, {
      speed: 5, color: 0xd8b060, color2: 0xfff0c0, size: 5, life: 0.7, gravity: 0.5, up: 0.9,
    });
    this.rings.spawn(slot.x, slot.y + 0.12, slot.z, 0.6, 4.4, 0.6, 0xffcf7a, 0.9);
    this.rig.shake(0.06);
    if (this.hud) this.hud.refreshBuildBar();
  }

  upgradeSelected() {
    const t = this.selected;
    if (!t) return;
    const cost = t.upgradeCost();
    if (cost === null) { this.toast('已至极阶', 'bad'); audio.denied(); return; }
    if (this.gold < cost) { this.toast('灵石不足', 'bad'); audio.denied(); return; }
    this.gold -= cost;
    t.upgrade(this.scene);
    this.towers.networkDirty = true;
    audio.upgrade();
    this.sparks.emit(t.x, t.y + 1.4, t.z, 34, {
      speed: 6, color: 0xffe0a0, color2: 0xfff8e0, size: 6, life: 0.8, gravity: 0.3, up: 1.0,
    });
    this.rings.spawn(t.x, t.y + 0.14, t.z, 0.8, 5.0, 0.7, 0xffe0a0, 1.0);
    if (this.hud) { this.hud.refreshSelection(); this.hud.refreshBuildBar(); }
  }

  sellSelected() {
    const t = this.selected;
    if (!t) return;
    const refund = this.towers.sell(t);
    this.gold += refund;
    audio.sell();
    this.sparks.emit(t.x, t.y + 0.8, t.z, 20, {
      speed: 4.5, color: 0x9a8a70, color2: 0xd0c0a0, size: 5, life: 0.7, gravity: 0.8, up: 0.6,
    });
    this.floats && this.floats.spawn(t.x, t.y + 1.5, t.z, '+' + refund, 'gold');
    this.select(null);
    if (this.hud) this.hud.refreshBuildBar();
  }

  /* ------------------------------------------------------ 开火 */
  fire(tw, target, enemies) {
    const st = tw.stats;
    const dmg = st.dmg !== undefined ? st.dmg : tw.def.dmg;
    const el = tw.def.el;
    const kind = tw.def.kind;
    const mz = tw.muzzleWorld();

    if (kind === 'single') {
      if (!target) return false;
      this.projectiles.fire('bolt', mz, target, { speed: tw.def.projSpeed, dmg, el, tower: tw });
      audio.shootBolt();
      this.sparks.emit(mz.x, mz.y, mz.z, 3, { speed: 3, color: 0xffd090, size: 3, life: 0.18, gravity: 0.1, up: 0.4 });
      return true;
    }
    if (kind === 'splash') {
      if (!target) return false;
      this.projectiles.fire('stone', mz, target, {
        speed: tw.def.projSpeed, dmg, el, splash: st.splash || tw.def.splash, arc: true, tower: tw,
      });
      audio.shootStone();
      this.rig.shake(0.05);
      return true;
    }
    if (kind === 'cone') {
      if (!target) return false;
      const range = tw.range;
      const dirX = Math.sin(tw.angle), dirZ = Math.cos(tw.angle);
      const half = Math.cos(tw.def.cone);
      const hits = enemies.query(tw.x, tw.z, range, (e) => {
        const dx = e.x - tw.x, dz = e.z - tw.z;
        const l = Math.hypot(dx, dz) || 1;
        return (dx / l) * dirX + (dz / l) * dirZ > half;
      });
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        e.burn = Math.max(e.burn, st.burn || tw.def.burn);
        e.burnT = tw.def.burnTime;
      }
      audio.flame();
      for (let i = 0; i < 7; i++) {
        const a = tw.angle + (Math.random() - 0.5) * tw.def.cone * 1.4;
        this.sparks.emit(mz.x, mz.y, mz.z, 2, {
          speed: 3, color: 0xff8a30, color2: 0xffe090, size: 11,
          life: 0.38, gravity: -0.12, up: 0.1,
          dirX: Math.sin(a), dirY: 0.12, dirZ: Math.cos(a), dirW: 16,
        });
      }
      return hits.length > 0;
    }
    if (kind === 'field') {
      const range = tw.range;
      const hits = enemies.query(tw.x, tw.z, range);
      if (!hits.length) return false;
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        if (!e.traits.includes('unslowable')) {
          e.slow = Math.max(e.slow, st.slow || tw.def.slow);
          e.slowT = tw.def.slowTime;
        }
      }
      this.rings.spawn(tw.x, tw.y + 0.3, tw.z, range * 0.2, range, 0.55, 0x7ad8ff, 0.55);
      audio.frost();
      this.sparks.emit(tw.x, tw.y + 1.6, tw.z, 8, {
        speed: 7, color: 0x9fe8ff, color2: 0xffffff, size: 5, life: 0.6, gravity: -0.05, up: 0.8,
      });
      return true;
    }
    if (kind === 'ring') {
      const range = tw.range;
      const hits = enemies.query(tw.x, tw.z, range);
      if (!hits.length) return false;
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        this.sparks.emit(e.x, e.y + 1.0, e.z, 4, {
          speed: 7, color: 0xfff0c0, color2: 0xffb060, size: 4, life: 0.28, gravity: 0.6, up: 0.5,
        });
      }
      this.rings.spawn(tw.x, tw.y + 0.6, tw.z, range * 0.7, range, 0.3, 0xffe8b0, 0.5);
      audio.blade();
      return true;
    }
    if (kind === 'chain') {
      if (!target) return false;
      const chain = st.chain || tw.def.chain;
      let cur = target, d = dmg;
      const seen = new Set();
      let from = mz.clone();
      for (let i = 0; i < chain && cur; i++) {
        seen.add(cur.id);
        tw.damageDone += enemies.damage(cur, d, el);
        V.set(cur.x, cur.y + 1.2, cur.z);
        this.bolts.spawn(from, V, { life: 0.26, width: 0.5 - i * 0.05, jitter: 1.5, color: 0xbfe4ff });
        this.sparks.emit(cur.x, cur.y + 1.2, cur.z, 10, {
          speed: 9, color: 0xbfe4ff, color2: 0xffffff, size: 5, life: 0.3, gravity: 0.2, up: 0.7,
        });
        from = V.clone();
        d *= tw.def.chainFall;
        const next = enemies.query(cur.x, cur.z, 13, (e) => !seen.has(e.id));
        cur = next.length ? next[0] : null;
      }
      audio.thunder();
      this.rig.shake(0.08);
      return true;
    }

    /* ---------------- 玄六气 ---------------- */
    if (kind === 'gust') {
      // 罡风：正前方一个扇面，打伤之外还把兽群整片推回去
      const range = tw.range;
      const spread = st.cone !== undefined ? st.cone : tw.def.cone;
      const dirX = Math.sin(tw.angle), dirZ = Math.cos(tw.angle);
      const halfC = Math.cos(spread);
      const hits = enemies.query(tw.x, tw.z, range, (e) => {
        const dx = e.x - tw.x, dz = e.z - tw.z;
        const l = Math.hypot(dx, dz) || 1;
        return (dx / l) * dirX + (dz / l) * dirZ > halfC;
      });
      if (!hits.length) return false;
      const push = st.push !== undefined ? st.push : tw.def.push;
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        const moved = enemies.shove(e, push);
        if (moved > 0.3) {
          this.floats && Math.random() < 0.25 &&
            this.floats.spawn(e.x, e.y + 2.2 * e.scale, e.z, '退', 'good');
        }
      }
      // 风刃：几道贴地掠出去的白气
      for (let i = 0; i < 9; i++) {
        const a = tw.angle + (Math.random() - 0.5) * spread * 1.8;
        this.sparks.emit(mz.x, mz.y - 0.2 + Math.random() * 0.8, mz.z, 2, {
          speed: 4, color: 0xbdf5e4, color2: 0xffffff, size: 9,
          life: 0.42, gravity: -0.02, up: 0.05,
          dirX: Math.sin(a), dirY: 0.05, dirZ: Math.cos(a), dirW: 26,
        });
      }
      this.rings.spawn(tw.x, tw.y + 0.5, tw.z, range * 0.25, range * 0.92, 0.34, 0xa8f0dc, 0.55);
      audio.flame();
      this.rig.shake(0.04);
      return true;
    }

    if (kind === 'venom') {
      if (!target) return false;
      this.projectiles.fire('jar', mz, target, {
        speed: tw.def.projSpeed, dmg, el, arc: true, tower: tw,
        splash: st.splash !== undefined ? st.splash : tw.def.splash,
        venom: st.venom !== undefined ? st.venom : tw.def.venom,
        venomTime: tw.def.venomTime, poolTime: tw.def.poolTime,
        sunder: st.sunder !== undefined ? st.sunder : tw.def.sunder,
      });
      audio.shootStone();
      this.sparks.emit(mz.x, mz.y, mz.z, 5, {
        speed: 3, color: 0xa8e030, color2: 0xe8ffa0, size: 5, life: 0.3, gravity: 0.2, up: 0.6,
      });
      return true;
    }

    if (kind === 'swarm') {
      if (!target) return false;
      this.projectiles.fire('gu', mz, target, {
        speed: tw.def.projSpeed, dmg, el, tower: tw,
        stacks: 1, hop: tw.def.hop,
        stackDmg: st.stackDmg !== undefined ? st.stackDmg : tw.def.stackDmg,
        stackMax: st.stackMax !== undefined ? st.stackMax : tw.def.stackMax,
      });
      audio.shootBolt();
      this.sparks.emit(mz.x, mz.y, mz.z, 6, {
        speed: 4, color: 0xc86ae8, color2: 0xf0c0ff, size: 4, life: 0.35, gravity: 0.1, up: 0.7,
      });
      return true;
    }

    if (kind === 'curse') {
      const range = tw.range;
      const hits = enemies.query(tw.x, tw.z, range);
      if (!hits.length) return false;
      const v = st.vuln !== undefined ? st.vuln : tw.def.vuln;
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        e.vuln = Math.max(e.vuln, v);
        e.vulnT = tw.def.vulnTime;
        this.sparks.emit(e.x, e.y + 1.4 * e.scale, e.z, 3, {
          speed: 2.4, color: 0x8a6ad0, color2: 0x1a1030, size: 9,
          life: 0.7, gravity: -0.06, up: 0.5,
        });
      }
      this.rings.spawn(tw.x, tw.y + 0.25, tw.z, range * 0.15, range, 0.75, 0x9a7ae8, 0.5);
      audio.frost();
      return true;
    }

    if (kind === 'warp') {
      const range = tw.range;
      const hits = enemies.query(tw.x, tw.z, range);
      if (!hits.length) return false;
      const pull = st.pull !== undefined ? st.pull : tw.def.pull;
      for (const e of hits) {
        V.set(e.x, e.y + 1.2 * e.scale, e.z);
        tw.damageDone += enemies.damage(e, dmg, el);
        const moved = enemies.shove(e, pull, { warp: true, ignoreResist: true });
        if (moved > 0.4) {
          V2.set(e.x, e.y + 1.2 * e.scale, e.z);
          // 一道把它拽回去的虚空尾迹
          this.bolts.spawn(V, V2, { life: 0.34, width: 0.7, jitter: 0.6, color: 0xd8ccff });
          this.sparks.emit(e.x, e.y + 1.0 * e.scale, e.z, 8, {
            speed: 6, color: 0xe6dcff, color2: 0x5a4a90, size: 6, life: 0.5, gravity: 0.1, up: 0.8,
          });
        }
      }
      // 壶口：一圈向内收的白环
      this.rings.spawn(tw.x, tw.y + 0.4, tw.z, range, range * 0.12, 0.6, 0xe8e0ff, 0.9);
      audio.skill('freeze');
      this.rig.shake(0.14);
      return true;
    }

    if (kind === 'pierce') {
      if (!target) return false;
      const range = tw.range;
      const w = st.pierceW !== undefined ? st.pierceW : tw.def.pierceW;
      const dirX = Math.sin(tw.angle), dirZ = Math.cos(tw.angle);
      const hits = enemies.query(tw.x, tw.z, range, (e) => {
        const dx = e.x - tw.x, dz = e.z - tw.z;
        if (dx * dirX + dz * dirZ < 0) return false;                 // 只打身前
        return Math.abs(dx * dirZ - dz * dirX) <= w;                 // 离轴线够近
      });
      if (!hits.length) return false;
      for (const e of hits) {
        tw.damageDone += enemies.damage(e, dmg, el);
        this.sparks.emit(e.x, e.y + 1.0 * e.scale, e.z, 7, {
          speed: 8, color: 0x8fe4ff, color2: 0xffffff, size: 5, life: 0.32, gravity: 0.5, up: 0.6,
        });
      }
      V.copy(mz);
      V2.set(tw.x + dirX * range, mz.y - 0.3, tw.z + dirZ * range);
      this.bolts.spawn(V, V2, { life: 0.26, width: 0.85, jitter: 0.45, color: 0x7fd8ff });
      this.bolts.spawn(V, V2, { life: 0.20, width: 0.35, jitter: 0.15, color: 0xffffff });
      audio.frost();
      this.rig.shake(0.05);
      return true;
    }
    return false;
  }

  /* ---------------- 瘴沼：百毒瓮砸碎之后留在地上的那一洼 ---------------- */
  spawnPool(x, z, o) {
    const gy = this.terrain.heightFast(x, z);
    this.pools.push({
      x, y: gy, z, r: o.r, t: 0, life: o.life,
      venom: o.venom, sunder: o.sunder, tower: o.tower, tick: 0,
    });
    if (this.pools.length > 12) this.pools.shift();
  }

  updatePools(dt) {
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const P = this.pools[i];
      P.t += dt;
      if (P.t >= P.life) { this.pools.splice(i, 1); continue; }
      P.tick -= dt;
      if (P.tick > 0) continue;
      P.tick = 0.55;
      const fade = 1 - P.t / P.life;
      for (const e of this.enemies.query(P.x, P.z, P.r)) {
        e.venom = Math.max(e.venom, P.venom);
        e.venomT = Math.max(e.venomT, 2.4);
        e.sunder = Math.max(e.sunder, P.sunder);
        e.sunderT = Math.max(e.sunderT, 3.2);
      }
      this.rings.spawn(P.x, P.y + 0.16, P.z, P.r * 0.82, P.r, 0.6, 0xa8e030, 0.34 * fade);
      this.smoke.emit(P.x, P.y + 0.3, P.z, 4, {
        speed: 1.6, color: 0x6f8a28, color2: 0xc4e060, size: 20,
        life: 1.6, gravity: -0.04, up: 0.9,
      });
    }
  }

  // 蛊虫改换门庭
  onGuHop(from, to) {
    V.set(from.x, from.y + 1.2 * from.scale, from.z);
    V2.set(to.x, to.y + 1.2 * to.scale, to.z);
    this.bolts.spawn(V, V2, { life: 0.3, width: 0.3, jitter: 1.1, color: 0xd07aff });
    this.sparks.emit(to.x, to.y + 1.2 * to.scale, to.z, 10, {
      speed: 6, color: 0xc86ae8, color2: 0xf0c0ff, size: 4, life: 0.45, gravity: 0.3, up: 0.7,
    });
  }

  onProjectileHit(p, enemies) {
    // 毒瓮：碎处腾起瘴气，还在地上留一洼
    if (p.kind === 'jar') {
      const gy = this.terrain.heightFast(p.tx, p.tz);
      for (const e of enemies.query(p.tx, p.tz, p.splash)) {
        const d = enemies.damage(e, p.dmg, p.el);
        if (p.tower) p.tower.damageDone += d;
        e.venom = Math.max(e.venom, p.venom);
        e.venomT = Math.max(e.venomT, p.venomTime);
        e.sunder = Math.max(e.sunder, p.sunder);
        e.sunderT = Math.max(e.sunderT, p.venomTime);
      }
      this.spawnPool(p.tx, p.tz, {
        r: p.splash, life: p.poolTime, venom: p.venom * 0.6, sunder: p.sunder, tower: p.tower,
      });
      this.rings.spawn(p.tx, gy + 0.2, p.tz, 0.5, p.splash * 1.35, 0.5, 0xb8e83c, 0.9);
      this.sparks.emit(p.tx, gy + 0.5, p.tz, 30, {
        speed: 9, color: 0x88a828, color2: 0xe8ff90, size: 7, life: 0.9, gravity: 0.7, up: 1.0,
      });
      this.smoke.emit(p.tx, gy + 0.6, p.tz, 12, {
        speed: 3, color: 0x6f8a28, color2: 0xbcd868, size: 24, life: 1.9, gravity: -0.05, up: 1.0,
      });
      audio.hit();
      return;
    }
    // 蛊：叮上去，层数越叠越疼
    if (p.kind === 'gu') {
      if (!p.target || !p.target.alive) return;
      const e = p.target;
      const d = enemies.damage(e, p.dmg, p.el);
      if (p.tower) p.tower.damageDone += d;
      e.gu = Math.min(p.stackMax, e.gu + p.stacks);
      e.guT = 6.0;
      e.guDmg = Math.max(e.guDmg, p.stackDmg);
      e.guHop = p.hop;
      e.guMax = p.stackMax;
      this.sparks.emit(e.x, e.y + 1.2 * e.scale, e.z, 5 + e.gu * 2, {
        speed: 5, color: 0xc86ae8, color2: 0x60208a, size: 4, life: 0.4, gravity: 0.4, up: 0.6,
      });
      audio.hit();
      return;
    }
    if (p.splash > 0) {
      const hits = enemies.query(p.tx, p.tz, p.splash);
      for (const e of hits) {
        const dx = e.x - p.tx, dz = e.z - p.tz;
        const f = 1 - clamp(Math.hypot(dx, dz) / p.splash, 0, 1) * 0.5;
        const d = enemies.damage(e, p.dmg * f, p.el);
        if (p.tower) p.tower.damageDone += d;
      }
      const gy = this.terrain.heightFast(p.tx, p.tz);
      this.rings.spawn(p.tx, gy + 0.2, p.tz, 0.6, p.splash * 1.5, 0.45, 0xffb060, 0.9);
      this.sparks.emit(p.tx, gy + 0.4, p.tz, 40, {
        speed: 13, color: 0xc09060, color2: 0xffd0a0, size: 8, life: 0.75, gravity: 1.1, up: 1.0,
      });
      this.smoke.emit(p.tx, gy + 0.6, p.tz, 14, {
        speed: 3.5, color: 0x8a8078, color2: 0xc8c0b4, size: 22, life: 1.5, gravity: -0.05, up: 1.0,
      });
      audio.hit();
      this.rig.shake(0.09);
    } else if (p.target && p.target.alive) {
      const d = enemies.damage(p.target, p.dmg, p.el);
      if (p.tower) p.tower.damageDone += d;
      if (p.burn) { p.target.burn = Math.max(p.target.burn, p.burn); p.target.burnT = p.burnTime; }
      this.sparks.emit(p.x, p.y, p.z, 6, {
        speed: 6, color: 0xffcf90, color2: 0xff8040, size: 4, life: 0.3, gravity: 0.9, up: 0.5,
      });
      audio.hit();
    }
  }

  /* ------------------------------------------------------ 秘术 */
  castSkill(id, at) {
    const s = SKILLS.find(x => x.id === id);
    if (!s || this.skillCd[id] > 0) { audio.denied(); return; }
    this.skillCd[id] = s.cd;
    this.armedSkill = null;
    audio.skill(id);
    const g = this.engine.grade.uniforms;

    if (id === 'bolt') {
      const x = at.x, z = at.z;
      const gy = this.terrain.heightFast(x, z);
      for (const e of this.enemies.query(x, z, s.radius)) {
        this.enemies.damage(e, 360, 'metal', { trueDamage: true });
        e.stun = Math.max(e.stun, 1.5);
      }
      for (let i = 0; i < 5; i++) {
        V.set(x + (Math.random() - 0.5) * 6, gy + 60, z + (Math.random() - 0.5) * 6);
        V2.set(x + (Math.random() - 0.5) * 4, gy + 0.5, z + (Math.random() - 0.5) * 4);
        this.bolts.spawn(V, V2, { life: 0.42, width: 1.1, jitter: 5.5, color: 0xcfe8ff });
      }
      this.rings.spawn(x, gy + 0.2, z, 1, s.radius * 2.2, 0.7, 0xbfe0ff, 1.0);
      this.sparks.emit(x, gy + 1, z, 90, {
        speed: 22, color: 0xbfe4ff, color2: 0xffffff, size: 9, life: 0.9, gravity: 0.9, up: 1.0,
      });
      this.rig.shake(0.55);
      g.uFlash.value.setRGB(0.28, 0.34, 0.45);
    } else if (id === 'freeze') {
      const x = at.x, z = at.z;
      const gy = this.terrain.heightFast(x, z);
      for (const e of this.enemies.query(x, z, s.radius)) {
        e.freeze = Math.max(e.freeze, 3.5);
        if (!e.traits.includes('unslowable')) { e.slow = Math.max(e.slow, 0.5); e.slowT = 5.5; }
        this.enemies.damage(e, 40, 'water');
      }
      this.rings.spawn(x, gy + 0.2, z, 1, s.radius * 2.2, 1.1, 0x9fe0ff, 0.9);
      this.sparks.emit(x, gy + 1.2, z, 70, {
        speed: 12, color: 0x9fe0ff, color2: 0xffffff, size: 7, life: 1.4, gravity: 0.12, up: 1.0,
      });
      g.uFlash.value.setRGB(0.16, 0.26, 0.38);
      this.rig.shake(0.2);
    } else {
      this.surge = 10;
      for (const t of this.towers.towers) {
        this.sparks.emit(t.x, t.y + 1.6, t.z, 14, {
          speed: 7, color: 0xffd070, color2: 0xfff6d0, size: 6, life: 0.8, gravity: -0.1, up: 1.0,
        });
      }
      this.rings.spawn(HEART.x, this.terrain.plazaY + 1.4, HEART.z, 2, 90, 1.4, 0xffcf7a, 0.8);
      g.uFlash.value.setRGB(0.24, 0.18, 0.06);
      this.toast('归元 · 机力充盈', 'good');
    }
    if (this.hud) this.hud.refreshSkills();
  }

  /* ------------------------------------------------------ 波次 */
  get level() { return LEVEL; }
  get waves() { return wavesOf(LEVEL.id); }
  get waveCount() { return this.waves.length; }
  // 本关开放的机关谱
  get towerList() { return LEVEL.towers.map(id => TOWER_BY_ID[id]).filter(Boolean); }

  get waveDef() {
    const W = this.waves;
    return this.waveIndex < W.length ? W[this.waveIndex] : endlessWave(this.waveIndex + 1, LEVEL.id);
  }

  startWave() {
    if (this.waveActive || this.state === 'over' || this.state === 'menu') return;
    const def = this.waveDef;
    this.waveActive = true;
    this.state = 'wave';
    const scale = def.scale || (1 + this.waveIndex * 0.035);
    const night = def.night;
    if (night) this.dayNight.toNight(); else this.dayNight.toDay();
    this.spawnQueue = [];
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) {
        this.spawnQueue.push({
          id: g.id, t: g.delay + i * g.gap, gate: g.gate === 2 ? (i % 2) : g.gate,
          hpScale: scale * (night ? RULES.nightHpMult : 1),
          speedMult: night ? RULES.nightSpeedMult : 1,
          bountyMult: 1 + this.waveIndex * 0.02,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.waveTimer = 0;
    audio.waveStart();
    if (this.hud) { this.hud.announceWave(this.waveIndex + 1, def.name); this.hud.refreshWave(); }
  }

  endWave() {
    this.waveActive = false;
    this.state = 'build';
    const reward = RULES.waveGoldBase + this.waveIndex * RULES.waveGoldPerWave;
    this.gold += reward;
    this.stats.gold += reward;
    this.waveIndex++;
    this.stats.best = Math.max(this.stats.best, this.waveIndex);
    this.dayNight.toDay();
    this.toast(`本波平定 · 得灵石 ${reward}`, 'good');
    this.floats && this.floats.spawn(HEART.x, this.terrain.plazaY + 9, HEART.z, '+' + reward, 'gold big');
    if (this.waveIndex >= this.waveCount && !this.endlessAnnounced) {
      this.endlessAnnounced = true;
      if (!this.cleared.includes(this.levelIndex)) this.cleared.push(this.levelIndex);
      this.finish(true);
      return;
    }
    if (this.hud) { this.hud.refreshBuildBar(); this.hud.refreshWave(); }
  }

  onKill(e) {
    this.gold += e.bounty;
    this.stats.gold += e.bounty;
    this.stats.kills++;
    audio.kill();
    const col = ELEMENTS[e.el] ? ELEMENTS[e.el].color : 0xffffff;
    this.sparks.emit(e.x, e.y + 1.2 * e.scale, e.z, e.boss ? 120 : 26, {
      speed: e.boss ? 20 : 9, color: col, color2: 0xfff0d0, size: e.boss ? 12 : 6,
      life: e.boss ? 1.4 : 0.7, gravity: 0.9, up: 0.9,
    });
    if (e.boss) {
      this.rings.spawn(e.x, e.y + 0.4, e.z, 1, 34, 1.2, col, 1.0);
      this.rig.shake(0.5);
      audio.bossRoar();
    }
    this.floats && this.floats.spawn(e.x, e.y + 2.4 * e.scale, e.z, '+' + e.bounty, 'gold');
    if (this.hud) this.hud.refreshBuildBar();
  }

  onLeak(e) {
    const dmg = e.boss ? RULES.bossLeakDamage : RULES.leakDamage;
    this.heart = Math.max(0, this.heart - dmg);
    audio.heartHit();
    this.rig.shake(0.45);
    this.hurt = 1;
    this.rings.spawn(HEART.x, this.terrain.plazaY + 1.4, HEART.z, 2, 26, 0.8, 0xff5a3a, 1.0);
    this.sparks.emit(HEART.x, this.terrain.plazaY + 4, HEART.z, 40, {
      speed: 11, color: 0xff5a3a, color2: 0xffc080, size: 8, life: 0.9, gravity: 0.6, up: 1.0,
    });
    this.floats && this.floats.spawn(HEART.x, this.terrain.plazaY + 7, HEART.z, '-' + dmg, 'bad big');
    this.toast(`${e.def.name} 冲入村寨！`, 'bad');
    if (this.heart <= 0) this.finish(false);
  }

  onEnemyTrait(e) {
    if (e.traits.includes('devour')) {
      let best = null, bd = 12 * 12;
      for (const t of this.towers.towers) {
        const dx = t.x - e.x, dz = t.z - e.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = t; }
      }
      if (best) {
        best.disabled = Math.max(best.disabled, 2.6);
        this.sparks.emit(best.x, best.y + 1.4, best.z, 14, {
          speed: 6, color: 0xff8040, color2: 0x603020, size: 6, life: 0.6, gravity: 0.8, up: 0.6,
        });
        this.floats && this.floats.spawn(best.x, best.y + 2.6, best.z, '机关卡死', 'bad');
      }
    }
    if (e.traits.includes('flood')) {
      for (const t of this.towers.towers) {
        if (t.def.id !== 'wheel') continue;
        const dx = t.x - e.x, dz = t.z - e.z;
        if (dx * dx + dz * dz < 400) {
          t.disabled = Math.max(t.disabled, 3.0);
          this.sparks.emit(t.x, t.y + 1.2, t.z, 12, {
            speed: 5, color: 0x60b0d0, color2: 0xd0f0ff, size: 7, life: 0.7, gravity: 0.7, up: 0.7,
          });
        }
      }
    }
    if (e.traits.includes('plague')) {
      // 蜚：所行之国大疫 —— 近旁的机关害起病来，射速大减
      for (const t of this.towers.towers) {
        const dx = t.x - e.x, dz = t.z - e.z;
        if (dx * dx + dz * dz < 18 * 18) {
          t.hobble = Math.max(t.hobble, 4.5);
          this.smoke.emit(t.x, t.y + 1.4, t.z, 6, {
            speed: 2.2, color: 0x7a8a34, color2: 0xc8d878, size: 16, life: 1.2, gravity: -0.05, up: 0.8,
          });
        }
      }
    }
    if (e.traits.includes('dim')) {
      // 罔象、鬼车：掩至而人不觉 —— 机关看不远，射程缩水
      for (const t of this.towers.towers) {
        const dx = t.x - e.x, dz = t.z - e.z;
        if (dx * dx + dz * dz < 20 * 20) {
          t.blind = Math.max(t.blind, 4.0);
          this.smoke.emit(t.x, t.y + 1.6, t.z, 5, {
            speed: 2.0, color: 0x2a2038, color2: 0x6a5aa0, size: 18, life: 1.4, gravity: -0.04, up: 0.7,
          });
        }
      }
    }
    if (e.traits.includes('shock')) {
      let n = 0;
      for (const t of this.towers.towers) {
        const dx = t.x - e.x, dz = t.z - e.z;
        if (dx * dx + dz * dz < 22 * 22) {
          t.disabled = Math.max(t.disabled, 1.8);
          V.set(e.x, e.y + 3, e.z); V2.set(t.x, t.y + 1.6, t.z);
          this.bolts.spawn(V, V2, { life: 0.3, width: 0.36, jitter: 1.8, color: 0x9fd8ff });
          n++;
        }
      }
      if (n) audio.thunder();
    }
  }

  bossFlipTime() {
    if (this.dayNight.isNight) this.dayNight.toDay(); else this.dayNight.toNight();
    this.toast('烛龙睁目 —— 昼夜倒转！', 'bad');
  }

  finish(won) {
    this.state = 'over';
    this.waveActive = false;
    if (won) audio.victory(); else audio.defeat();
    if (this.hud) this.hud.showEnd(won);
  }

  restart() {
    this.towers.clear();
    this.enemies.clear();
    this.projectiles.clear();
    this.pools.length = 0;
    const R = LEVEL.rules || RULES;
    this.gold = R.startGold;
    this.maxHeart = R.startHeart;
    this.heart = this.maxHeart;
    this.waveIndex = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.state = 'build';
    this.surge = 0;
    this.hurt = 0;
    this.endlessAnnounced = false;
    for (const s of SKILLS) this.skillCd[s.id] = 0;
    this.stats = { kills: 0, built: 0, gold: 0, best: 0 };
    this.dayNight.toDay();
    this.selected = null;
    this.selectedTowerId = null;
    this.rig.reset();
    if (this.hud) this.hud.refreshAll();
  }

  begin() {
    this.state = 'build';
    audio.resume();
    if (this.hud) this.hud.refreshAll();
  }

  /* --------------------------------------------- 换关：接上新的世界 */
  setWorld(ctx) {
    // 旧的格位、机关、兽群全部拆掉
    this.towers.dispose();
    this.enemies.dispose();
    this.projectiles.clear();
    this.pools.length = 0;
    this.grid.dispose();

    Object.assign(this, ctx);
    this.levelIndex = LEVEL.index;
    this.grid = new BuildGrid(this.scene, this.terrain);
    this.towers = new TowerManager(this.scene, this.terrain, this.grid, this);
    this.enemies = new EnemyManager(this.scene, this.terrain, this);
    this.heartPos.set(HEART.x, this.terrain.plazaY + 2.5, HEART.z);

    const R = LEVEL.rules || RULES;
    this.gold = R.startGold;
    this.maxHeart = R.startHeart;
    this.heart = this.maxHeart;
    this.waveIndex = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.surge = 0;
    this.hurt = 0;
    this.endlessAnnounced = false;
    this.selected = null;
    this.selectedTowerId = null;
    this.armedSkill = null;
    for (const s of SKILLS) this.skillCd[s.id] = 0;
    this.stats = { kills: 0, built: 0, gold: 0, best: 0 };
    this.state = 'build';
    this.dayNight.toDay();
    if (this.hud) this.hud.rebuildForLevel();
  }

  // 还有没有下一关
  get nextLevelIndex() {
    return this.levelIndex + 1 < 5 ? this.levelIndex + 1 : -1;
  }

  // 中途出关：把这一局停干净，世界留着不动（回舆图再选）
  abandon() {
    this.waveActive = false;
    this.spawnQueue = [];
    this.enemies.clear();
    this.projectiles.clear();
    this.pools.length = 0;
    this.towers.clear();
    this.selected = null;
    this.selectedTowerId = null;
    this.armedSkill = null;
    this.surge = 0;
    this.hurt = 0;
    this.speed = 1;
    this.state = 'menu';
    this.dayNight.autoRun = false;
    this.dayNight.toDay();
  }

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : (this.speed === 2 ? 3 : 1);
    if (this.hud) this.hud.refreshSpeed();
  }

  toggleDayNight() {
    if (this.dayNight.isNight) this.dayNight.toDay(); else this.dayNight.toNight();
  }

  toast(text, cls = '') { if (this.hud) this.hud.toast(text, cls); }

  /* ------------------------------------------------------ 主更新 */
  update(rawDt, t) {
    this.time = t;
    const playing = this.state === 'build' || this.state === 'wave';
    const dt = rawDt * (playing ? this.speed : 1);

    // 光标 -> 地面（沿射线步进求交）
    this._ray.setFromCamera(this._pointer, this.camera);
    const dir = this._ray.ray.direction, org = this._ray.ray.origin;
    let hit = null;
    const T2 = this.terrain;
    const at = (d) => {
      const px = org.x + dir.x * d, pz = org.z + dir.z * d;
      return (org.y + dir.y * d) - T2.heightFast(px, pz);
    };
    const STEP = 7.0;
    let prev = at(0), d0 = 0;
    for (let d = STEP; d < 480; d += STEP) {
      const cur = at(d);
      if (cur <= 0 && prev > 0) {
        // 二分细化
        let lo = d0, hi = d;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          if (at(mid) > 0) lo = mid; else hi = mid;
        }
        const dd = (lo + hi) / 2;
        const px = org.x + dir.x * dd, pz = org.z + dir.z * dd;
        hit = V.set(px, T2.heightFast(px, pz), pz).clone();
        break;
      }
      prev = cur; d0 = d;
    }
    if (hit) this.cursorWorld.copy(hit);

    const buildMode = !!this.selectedTowerId;
    const def = buildMode ? TOWER_BY_ID[this.selectedTowerId] : null;
    this.hoverSlot = buildMode && hit ? this.grid.nearest(hit.x, hit.z, 7.0) : null;
    this.grid.setBuildMode(playing && (buildMode || this.showLinks), true);
    this.grid.update(rawDt, t, this.hoverSlot, def ? (s) => this.towers.canPlaceAt(def, s) : null);

    if (playing) {
      if (this.waveActive) {
        this.waveTimer += dt;
        while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTimer) {
          const q = this.spawnQueue.shift();
          this.enemies.spawn(q.id, q.gate, q);
        }
        if (!this.spawnQueue.length && this.enemies.count === 0) this.endWave();
      }
      for (const s of Object.keys(this.skillCd)) {
        if (this.skillCd[s] > 0) this.skillCd[s] = Math.max(0, this.skillCd[s] - dt);
      }
      if (this.surge > 0) this.surge = Math.max(0, this.surge - dt);

      this.towers.update(dt, t, this.enemies, this.showLinks || buildMode);
      this.enemies.update(dt, t);
      this.projectiles.update(dt, this.enemies);
      this.updatePools(dt);
    }

    this.sparks.update(t);
    this.smoke.update(t);
    this.rings.update(t);
    this.bolts.update(rawDt, this.camera);
    if (this.floats) this.floats.update(rawDt);

    const g = this.engine.grade.uniforms;
    g.uFlash.value.multiplyScalar(Math.max(0, 1 - rawDt * 3.2));
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - rawDt * 1.4);
    g.uHurt.value = this.hurt + (1 - clamp(this.heart / this.maxHeart, 0, 1)) * 0.16;
  }
}
