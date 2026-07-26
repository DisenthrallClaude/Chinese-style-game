// 渲染引擎 —— 相机、光照、后期，负责把「视觉盛宴」端上桌
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GodRayPass, GradePass } from './postfx.js';
import { clamp, lerp } from './noise.js';

export class Engine {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.scene.environmentIntensity = 0.62;

    this.camera = new THREE.PerspectiveCamera(47, innerWidth / innerHeight, 0.6, 3000);
    this.camera.position.set(0, 46, 96);

    this._setupLights();
    this._setupComposer();

    this.clock = new THREE.Clock();
    this.frame = 0;
    this._fpsAccum = 0; this._fpsFrames = 0; this.fps = 60;
    // 自适应画质：帧率掉下去就降分辨率倍率
    this.renderScale = 1.0;
    this._perfSamples = [];

    addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    // 主光：太阳 / 月亮
    this.sun = new THREE.DirectionalLight(0xffe6bd, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 86;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 8;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.42;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 天空光：上蓝下暖，模拟半球环境
    this.hemi = new THREE.HemisphereLight(0xa8c8ff, 0x4a3a26, 1.1);
    this.scene.add(this.hemi);

    // 补光：从相机方向轻微填充，避免阴面死黑
    this.fill = new THREE.DirectionalLight(0x8fb4e8, 0.55);
    this.fill.position.set(-40, 30, 60);
    this.scene.add(this.fill);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(this.ambient);
  }

  _makeDepthTexture(w, h) {
    const dt = new THREE.DepthTexture(w, h);
    dt.type = THREE.UnsignedIntType;
    dt.format = THREE.DepthFormat;
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    return dt;
  }

  _setupComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const w = Math.max(2, Math.floor(size.x)), h = Math.max(2, Math.floor(size.y));
    const rtOpts = {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: Math.min(4, this.renderer.capabilities.maxSamples || 0),
      depthBuffer: true,
    };
    const rt = new THREE.WebGLRenderTarget(w, h, rtOpts);
    rt.depthTexture = this._makeDepthTexture(w, h);

    this.composer = new EffectComposer(this.renderer, rt);
    // clone() 会共享同一张深度纹理 —— 必须拆开，否则读写冲突
    this.composer.renderTarget2.depthTexture = this._makeDepthTexture(w, h);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 体积光（丁达尔光柱）
    this.godRay = new GodRayPass();
    this.composer.addPass(this.godRay);

    // 泛光
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.62, 0.72);
    this.composer.addPass(this.bloom);

    this.godRay.setSize(w, h);

    // 调色 + 暗角 + 颗粒 + 色散 + 色调映射输出
    this.grade = new GradePass();
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = Math.min(devicePixelRatio, 1.75) * this.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w * pr, h * pr);
    this.godRay.setSize(w, h);
    this.grade.uniforms.uResolution.value.set(w * pr, h * pr);
  }

  // 帧率自适应：连续低帧则降低内部渲染分辨率
  _adaptQuality(dt) {
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0; this._fpsFrames = 0;
      this._perfSamples.push(this.fps);
      if (this._perfSamples.length > 6) this._perfSamples.shift();
      if (this._perfSamples.length >= 5) {
        const avg = this._perfSamples.reduce((a, b) => a + b, 0) / this._perfSamples.length;
        if (avg < 34 && this.renderScale > 0.55) {
          this.renderScale = Math.max(0.55, this.renderScale - 0.16);
          this._perfSamples.length = 0;
          this.resize();
        } else if (avg > 57 && this.renderScale < 1.0) {
          this.renderScale = Math.min(1.0, this.renderScale + 0.09);
          this._perfSamples.length = 0;
          this.resize();
        }
      }
    }
  }

  render(dt) {
    this.frame++;
    this._adaptQuality(dt);
    this.composer.render(dt);
  }
}
