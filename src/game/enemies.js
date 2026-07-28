// 兽潮 —— 凶兽的行进、状态、死亡与特性
import * as THREE from 'three';
import { Rng, clamp, lerp, smoothstep } from '../core/noise.js';
import { ENEMIES, RULES, elementMult } from './config.js';
import {
  buildBeastGeometry, makeBeastMaterial, makeBeastOutlineMaterial, beastUniforms,
  HealthBars, GroundBlobs,
} from './beasts.js';
import { PATHS, HEART, GATES, walkY, LEVEL, distToRiver } from '../world/layout.js';

const MAX_PER_TYPE = 46;

class TypePool {
  constructor(scene, def, material, outlineMaterial) {
    this.def = def;
    const geo = buildBeastGeometry(def);
    this.geo = geo;
    this.max = def.boss ? 8 : MAX_PER_TYPE;
    this.aPhase = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
    this.aGait = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
    this.aState = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.aPhase.setUsage(THREE.DynamicDrawUsage);
    this.aGait.setUsage(THREE.DynamicDrawUsage);
    this.aState.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPhase', this.aPhase);
    geo.setAttribute('aGait', this.aGait);
    geo.setAttribute('aState', this.aState);
    this.mesh = new THREE.InstancedMesh(geo, material, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    // 描边壳：与本体共用同一份实例矩阵，永远同步
    this.outline = new THREE.InstancedMesh(geo, outlineMaterial, this.max);
    this.outline.instanceMatrix = this.mesh.instanceMatrix;
    this.outline.castShadow = false;
    this.outline.receiveShadow = false;
    this.outline.frustumCulled = false;
    this.outline.renderOrder = -1;
    this.outline.count = 0;
    scene.add(this.outline);

    this.list = [];
  }
}

let uid = 1;

export class Enemy {
  constructor(def, opts) {
    this.id = uid++;
    this.def = def;
    this.type = def.id;
    this.el = def.el;
    this.kind = def.kind;
    const scale = opts.scale || 1;
    this.maxHp = def.hp * scale;
    this.hp = this.maxHp;
    this.baseSpeed = def.speed * (opts.speedMult || 1);
    this.armor = def.armor * (opts.armorMult || 1);
    this.bounty = Math.round(def.bounty * (opts.bountyMult || 1));
    this.traits = def.traits || [];
    this.boss = !!def.boss;
    this.scale = def.scale || 1;

    this.path = opts.path;
    this.dist = opts.dist || 0;
    this.lateral = opts.lateral || 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.angle = 0;
    this.slow = 0; this.slowT = 0;
    this.freeze = 0;
    this.stun = 0;
    this.burn = 0; this.burnT = 0;
    // 玄六气带来的状态
    this.venom = 0; this.venomT = 0;      // 瘴：持续真伤
    this.sunder = 0; this.sunderT = 0;    // 蚀甲：皮甲被毒瘴啃薄
    this.vuln = 0; this.vulnT = 0;        // 易伤：幽冥幡缠身，受创加重
    this.gu = 0; this.guT = 0;            // 蛊：层数越叠越疼
    this.guDmg = 0; this.guHop = 0; this.guMax = 0;
    this.warpT = 0;                       // 刚被须弥壶卷过：留个尾迹的计时
    this.iceSlip = 0;                     // 冰面打滑的加速
    this.flash = 0;
    this.dying = 0;
    this.dead = false;
    this.leaked = false;
    this.buff = 0;
    this.phase = Math.random() * 12;
    this.bob = Math.random() * 6;
    this.traitTimer = Math.random() * 2;
    this.flyH = def.kind === 'air' ? 8 + Math.random() * 5 : 0;
    this.spawnT = 0;
  }

  get alive() { return !this.dead && this.dying <= 0; }
  get speed() {
    if (this.stun > 0 || this.freeze > 0) return 0;
    const s = this.slow > 0 && !this.traits.includes('unslowable') ? (1 - this.slow) : 1;
    return this.baseSpeed * s * (1 + this.buff * 0.25 + (this.iceSlip || 0));
  }
}

export class EnemyManager {
  constructor(scene, terrain, game) {
    this.scene = scene;
    this.terrain = terrain;
    this.game = game;
    this.material = makeBeastMaterial();
    this.outlineMaterial = makeBeastOutlineMaterial();
    this.pools = {};
    for (const key of Object.keys(ENEMIES)) {
      this.pools[key] = new TypePool(scene, ENEMIES[key], this.material, this.outlineMaterial);
    }
    this.bars = new HealthBars(scene, 200);
    this.blobs = new GroundBlobs(scene, 220);
    this.all = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.killCount = 0;
    this.leakCount = 0;
  }

  spawn(typeId, gate, opts = {}) {
    const def = ENEMIES[typeId];
    if (!def) return null;
    const pool = this.pools[typeId];
    if (pool.list.length >= pool.max) return null;
    const path = gate === 0 ? PATHS.left : PATHS.right;
    const e = new Enemy(def, {
      path,
      dist: opts.dist || 0,
      lateral: (Math.random() - 0.5) * (def.boss ? 1.2 : 4.2),
      scale: opts.hpScale || 1,
      speedMult: opts.speedMult || 1,
      bountyMult: opts.bountyMult || 1,
      armorMult: opts.armorMult || 1,
    });
    e.pool = pool;
    pool.list.push(e);
    this.all.push(e);
    this._place(e, 0);
    if (e.traits.includes('daynight') && this.game) this.game.bossFlipTime();
    return e;
  }

  _place(e, dt) {
    const p = e.path;
    const d = clamp(e.dist, 0, p.length);
    const [px, pz] = p.at(d);
    const [tx, tz] = p.tangentAt(d);
    const nx = -tz, nz = tx;
    let x = px + nx * e.lateral;
    let z = pz + nz * e.lateral;
    let y;
    if (e.kind === 'air') {
      // 飞行：从山口直扑社树，无视兽道
      const t = clamp(e.dist / p.length, 0, 1);
      const gate = p === PATHS.left ? GATES[0] : GATES[1];
      x = lerp(gate.x, HEART.x, t) + e.lateral * 1.4;
      z = lerp(gate.z, HEART.z, t);
      const g = this.terrain.heightFast(x, z);
      y = Math.max(g, lerp(gate.y || 24, 2, t)) + e.flyH + Math.sin(e.bob + performance.now() * 0.0016) * 0.9;
      e.angle = Math.atan2(HEART.x - x, HEART.z - z);
    } else {
      // 桥面另有一份高程：过河时踩的是桥，不是河床
      y = walkY(this.terrain.heightFast(x, z), x, z);
      e.angle = Math.atan2(tx, tz);
    }
    e.x = x; e.y = y; e.z = z;
  }

  damage(e, amount, element, opts = {}) {
    if (!e.alive) return 0;
    const mult = elementMult(element, e.el);
    // 幽冥幡的易伤是乘在相克之后的：先看属性对不对，再看有没有被幡影罩住
    let dmg = amount * mult * (1 + (e.vuln || 0));
    if (!opts.trueDamage) {
      const ar = Math.max(0, e.armor - (e.sunder || 0));
      dmg = Math.max(dmg * 0.16, dmg - ar);
    }
    e.hp -= dmg;
    e.flash = Math.min(1, e.flash + 0.55);
    if (e.hp <= 0) this.kill(e);
    return dmg;
  }

  kill(e, silent = false) {
    if (e.dead || e.dying > 0) return;
    e.dying = 0.001;
    e.hp = 0;
    this.killCount++;
    if (!silent && this.game) this.game.onKill(e);
    // 蛊：宿主一死，虫子带着已叠的层数扑向最近的一只
    if (e.gu > 0 && e.guHop > 0) {
      let best = null, bd = e.guHop * e.guHop;
      for (const o of this.all) {
        if (o === e || !o.alive) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        best.gu = Math.min(e.guMax || e.gu, best.gu + e.gu);
        best.guT = Math.max(best.guT, 6.0);
        best.guDmg = Math.max(best.guDmg, e.guDmg);
        best.guHop = e.guHop; best.guMax = e.guMax;
        if (this.game) this.game.onGuHop(e, best);
      }
    }
    // 相柳：斩其一首，余首犹动
    if (e.traits.includes('split') && !e._noSplit) {
      for (let i = 0; i < 3; i++) {
        const c = this.spawn('huashe', e.path === PATHS.left ? 0 : 1, {
          dist: Math.max(0, e.dist - 1 - i * 0.8),
          hpScale: 0.28, speedMult: 1.25, bountyMult: 0.3,
        });
        if (c) { c._noSplit = true; c.scale *= 0.7; }
      }
    }
  }

  // 击退 / 回溯：沿兽道往回推。boss 身沉，只吃四成
  shove(e, dist, opts = {}) {
    if (!e.alive || dist <= 0) return 0;
    let k = e.boss ? 0.34 : 1;
    // 「不可减速」挡得住风，挡不住须弥壶 —— 空之气连路一起卷走
    if (!opts.ignoreResist && e.traits.includes('unslowable')) k *= 0.45;
    const before = e.dist;
    e.dist = Math.max(0, e.dist - dist * k);
    if (opts.warp) e.warpT = 0.5;
    this._place(e, 0);
    return before - e.dist;
  }

  // 范围查询（怪物数量有限，线性即可）
  query(x, z, r, filter) {
    const out = [];
    const r2 = r * r;
    for (const e of this.all) {
      if (!e.alive) continue;
      if (filter && !filter(e)) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= r2) out.push(e);
    }
    return out;
  }

  nearestAhead(x, z, r, filter) {
    let best = null, bestD = -1;
    const r2 = r * r;
    for (const e of this.all) {
      if (!e.alive) continue;
      if (filter && !filter(e)) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (e.dist > bestD) { bestD = e.dist; best = e; }
    }
    return best;
  }

  update(dt, t) {
    beastUniforms.uTime.value = t;
    const G = this.game;
    const iceRule = LEVEL && LEVEL.rule && LEVEL.rule.id === 'ice' ? LEVEL.rule : null;

    // 九尾狐的光环
    let auras = null;
    for (const e of this.all) {
      if (e.alive && e.traits.includes('aura')) { (auras || (auras = [])).push(e); }
    }
    for (const e of this.all) e.buff = 0;
    if (auras) {
      for (const a of auras) {
        for (const e of this.all) {
          if (e === a || !e.alive) continue;
          const dx = e.x - a.x, dz = e.z - a.z;
          if (dx * dx + dz * dz < 196) e.buff = 1;
        }
      }
    }

    for (let i = this.all.length - 1; i >= 0; i--) {
      const e = this.all[i];
      e.spawnT += dt;

      if (e.dying > 0) {
        e.dying += dt * 2.6;
        if (e.dying >= 1) { e.dead = true; }
      }

      if (e.alive) {
        // 状态衰减
        if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
        // 幽都寒渊：踏上冻河与冰道的，脚下打滑跑得飞快；一旦被冻住又格外难挣
        if (iceRule) {
          const onIce = distToRiver(e.x, e.z) < iceRule.nearRiver;
          e.iceSlip = onIce ? iceRule.speedBonus : 0;
          if (onIce && e.slow > 0) e.slow = Math.min(0.92, e.slow * (1 + iceRule.slowBonus));
        }
        if (e.freeze > 0) e.freeze -= dt;
        if (e.stun > 0) e.stun -= dt;
        if (e.burnT > 0) {
          e.burnT -= dt;
          this.damage(e, e.burn * dt, 'fire', { trueDamage: true });
          if (e.burnT <= 0) e.burn = 0;
        }
        // 瘴 / 蚀甲 / 易伤 / 蛊
        if (e.venomT > 0) {
          e.venomT -= dt;
          this.damage(e, e.venom * dt, 'poison', { trueDamage: true });
          if (e.venomT <= 0) e.venom = 0;
        }
        if (e.sunderT > 0) { e.sunderT -= dt; if (e.sunderT <= 0) e.sunder = 0; }
        if (e.vulnT > 0) { e.vulnT -= dt; if (e.vulnT <= 0) e.vuln = 0; }
        if (e.guT > 0) {
          e.guT -= dt;
          this.damage(e, e.gu * e.guDmg * dt, 'gu', { trueDamage: true });
          if (e.guT <= 0) { e.gu = 0; e.guDmg = 0; }
        }
        if (e.warpT > 0) e.warpT -= dt;
        if (e.traits.includes('regen')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.006 * dt);

        // 行进
        e.dist += e.speed * dt;
        this._place(e, dt);

        if (e.dist >= e.path.length) {
          e.leaked = true;
          this.leakCount++;
          if (G) G.onLeak(e);
          e.dead = true;
        }

        // 特性计时
        e.traitTimer -= dt;
        if (e.traitTimer <= 0) {
          e.traitTimer = e.boss ? 4.5 : 6.5;
          if (G) G.onEnemyTrait(e);
        }
      }
      e.flash = Math.max(0, e.flash - dt * 3.4);

      if (e.dead) {
        this.all.splice(i, 1);
        const L = e.pool.list;
        const k = L.indexOf(e);
        if (k >= 0) L.splice(k, 1);
      }
    }

    // 写实例数据
    this.bars.begin();
    this.blobs.begin();
    for (const key of Object.keys(this.pools)) {
      const pool = this.pools[key];
      const L = pool.list;
      pool.mesh.count = L.length;
      pool.outline.count = L.length;
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        const spawnScale = smoothstep(0, 0.45, e.spawnT);
        const s = spawnScale * (1 - e.dying * 0.35);
        this._e.set(0, e.angle, e.dying > 0 ? e.dying * 0.9 : 0);
        this._q.setFromEuler(this._e);
        this._p.set(e.x, e.y - (1 - spawnScale) * 1.5, e.z);
        this._s.set(s, s, s);
        this._m.compose(this._p, this._q, this._s);
        pool.mesh.setMatrixAt(i, this._m);
        pool.aPhase.array[i] = e.phase;
        pool.aGait.array[i] = clamp(e.speed / 8, 0, 1);
        pool.aState.array[i * 3] = e.flash;
        pool.aState.array[i * 3 + 1] = e.freeze > 0 ? 1 : 0;
        pool.aState.array[i * 3 + 2] = e.dying;
        // 接地阴影：飞行的挂在地面上、随高度扩散变淡
        if (e.alive || e.dying > 0) {
          const gy = walkY(this.terrain.heightFast(e.x, e.z), e.x, e.z);
          const lift = clamp(e.y - gy, 0, 26);
          const spread = 1 + lift * 0.075;
          this.blobs.add(e.x, gy, e.z, (1.5 + e.scale * 1.5) * spread * s,
            (0.46 - lift * 0.014) * (1 - e.dying));
        }
        if (e.alive && e.hp < e.maxHp * 0.999) {
          const h = e.def.boss ? 5.4 * e.scale : 2.6 * e.scale;
          this.bars.add(e.x, e.y + h + 1.0, e.z, clamp(e.hp / e.maxHp, 0, 1),
            e.boss ? 3.4 : 1.5, 1);
        }
      }
      if (L.length) {
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.aPhase.needsUpdate = true;
        pool.aGait.needsUpdate = true;
        pool.aState.needsUpdate = true;
      }
    }
    this.bars.end();
    this.blobs.end();
  }

  clear() {
    for (const e of this.all) { e.dead = true; }
    this.all.length = 0;
    for (const k of Object.keys(this.pools)) {
      this.pools[k].list.length = 0;
      this.pools[k].mesh.count = 0;
      this.pools[k].outline.count = 0;
    }
    this.bars.begin(); this.bars.end();
    this.blobs.begin(); this.blobs.end();
  }

  dispose() {
    this.clear();
    for (const k of Object.keys(this.pools)) {
      const pool = this.pools[k];
      pool.geo.dispose();
      this.scene.remove(pool.mesh);
      this.scene.remove(pool.outline);
    }
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.bars.dispose && this.bars.dispose(this.scene);
    this.blobs.dispose && this.blobs.dispose(this.scene);
    this.pools = {};
  }

  get count() { return this.all.filter(e => e.alive).length; }
}
