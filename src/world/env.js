// 环境光照探针 —— 把天空烘成 IBL，让金石木水都吃到真实的环境反射
import * as THREE from 'three';

export class EnvProbe {
  constructor(engine, sky) {
    this.engine = engine;
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.pmrem.compileEquirectangularShader();

    // 只装天空的临时场景
    this.probeScene = new THREE.Scene();
    this.skyClone = new THREE.Mesh(sky.mesh.geometry, sky.material);
    this.skyClone.frustumCulled = false;
    this.probeScene.add(this.skyClone);

    this.rt = null;
    this._lastKey = -999;
    this._cooldown = 0;
  }

  // hourKey 变化足够大时才重新烘焙（约每 0.35 小时一次）
  update(dt, hour, force = false) {
    this._cooldown -= dt;
    const key = Math.round(hour / 0.35);
    if (!force && (key === this._lastKey || this._cooldown > 0)) return;
    this._lastKey = key;
    this._cooldown = 0.25;
    this.bake();
  }

  bake() {
    const prev = this.rt;
    this.skyClone.position.set(0, 0, 0);
    this.skyClone.updateMatrixWorld(true);
    this.rt = this.pmrem.fromScene(this.probeScene, 0.02, 1, 2400);
    this.engine.scene.environment = this.rt.texture;
    if (prev) prev.dispose();
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    this.pmrem.dispose();
  }
}
