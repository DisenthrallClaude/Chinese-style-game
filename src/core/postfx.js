// 后期处理 —— 丁达尔光柱与电影级调色
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ==================================================================
   体积光 / 丁达尔效应
   利用深度缓冲区分「天空」与「遮挡物」，把天空亮度沿太阳方向径向拖尾。
   树冠缝隙、屋檐边缘会自然透出光柱。
   ================================================================== */
const godRayShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.8) },
    uIntensity: { value: 0.85 },
    uDecay: { value: 0.955 },
    uDensity: { value: 0.72 },
    uWeight: { value: 0.32 },
    uSunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uVisible: { value: 1.0 },
    uThreshold: { value: 0.55 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2  uSunScreen;
    uniform float uIntensity, uDecay, uDensity, uWeight, uVisible, uThreshold;
    uniform vec3  uSunColor;
    varying vec2 vUv;

    const int SAMPLES = 48;

    // 只有「天空」像素才能当光源；亮度越高贡献越大
    float lightMask(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float sky = step(0.99995, d);
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return sky * smoothstep(uThreshold, uThreshold + 1.6, l);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uVisible <= 0.001 || uIntensity <= 0.001) { gl_FragColor = base; return; }

      vec2 delta = (vUv - uSunScreen) * (uDensity / float(SAMPLES));
      vec2 uv = vUv;
      float illum = 1.0;
      float accum = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        vec2 cuv = clamp(uv, vec2(0.0), vec2(1.0));
        accum += lightMask(cuv) * illum * uWeight;
        illum *= uDecay;
      }
      accum /= float(SAMPLES) * 0.42;

      // 距太阳越远衰减越快，避免整屏发白
      float dist = length((vUv - uSunScreen) * vec2(1.0, 0.72));
      float falloff = exp(-dist * 1.55);

      vec3 rays = uSunColor * accum * uIntensity * uVisible * (0.35 + falloff);
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }
  `,
};

export class GodRayPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(godRayShader.uniforms),
      vertexShader: godRayShader.vertexShader,
      fragmentShader: godRayShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.uniforms = this.material.uniforms;
    this.fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize() {}

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    if (!readBuffer.depthTexture) {
      // 没有深度纹理就直接透传，避免黑屏
      this.uniforms.uIntensity.value = 0;
    }
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ==================================================================
   调色 —— 分离色调 / 对比 / 饱和 / 暗角 / 色散 / 胶片颗粒 / ACES
   composer 缓冲里是线性 HDR，这里做最终的映射与编码。
   ================================================================== */
const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.09 },
    uSaturation: { value: 1.14 },
    uLift: { value: new THREE.Color(0.020, 0.030, 0.055) },   // 阴影偏冷
    uGain: { value: new THREE.Color(1.045, 1.005, 0.955) },   // 高光偏暖
    uVignette: { value: 0.42 },
    uGrain: { value: 0.026 },
    uAberration: { value: 0.0016 },
    uBleach: { value: 0.0 },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uHurt: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2  uResolution;
    uniform float uTime, uExposure, uContrast, uSaturation, uVignette, uGrain, uAberration, uBleach, uHurt;
    uniform vec3  uLift, uGain, uFlash;
    varying vec2 vUv;

    // ACES filmic tonemap (Stephen Hill fit)
    const mat3 ACESInput = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777
    );
    const mat3 ACESOutput = mat3(
       1.60475, -0.10208, -0.00327,
      -0.53108,  1.10813, -0.07276,
      -0.07367, -0.00605,  1.07602
    );
    vec3 RRTODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFitted(vec3 c) {
      c = ACESInput * c;
      c = RRTODTFit(c);
      c = ACESOutput * c;
      return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0/2.4)) - 0.055,
                 step(0.0031308, c));
    }
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // 边缘色散（镜头味）
      float ab = uAberration * (1.0 + uHurt * 6.0);
      vec2 dir = c * r2 * ab * 3.4;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;

      col *= uExposure;

      // lift / gain 分离色调（线性空间）
      col = col * uGain + uLift * (1.0 - smoothstep(0.0, 0.55, dot(col, vec3(0.333))));

      // ACES
      col = acesFitted(col);

      // 对比（围绕中灰的 S 曲线）
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);

      // 饱和
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // 漂白（受击/爆发时）
      col = mix(col, vec3(l), uBleach);

      // 屏幕闪色（法术、受伤）
      col += uFlash;
      col = mix(col, vec3(0.62, 0.06, 0.08) * 0.55 + col * 0.45, uHurt * 0.7);

      // 暗角
      float vig = smoothstep(0.92, 0.16, r2 * (1.0 + uHurt * 0.6));
      col *= mix(1.0, vig, uVignette);

      // 胶片颗粒
      float g = hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (1.0 - l * 0.65);

      gl_FragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
    }
  `,
};

export class GradePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(gradeShader.uniforms),
      vertexShader: gradeShader.vertexShader,
      fragmentShader: gradeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.uniforms = this.material.uniforms;
    this.fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uTime.value += deltaTime || 0.016;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
