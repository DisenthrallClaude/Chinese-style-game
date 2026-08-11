// 穹天 —— 解析式天空、云海、星河与月轮
import * as THREE from 'three';
import { buildTexture } from '../core/textures.js';

const vert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;   // 永远贴在远平面
  }
`;

const frag = /* glsl */`
  precision highp float;
  varying vec3 vDir;

  uniform vec3  uSunDir, uMoonDir;
  uniform vec3  uZenith, uHorizon, uGround, uSunColor, uMoonColor;
  uniform vec3  uCloudLit, uCloudDark;
  uniform float uSunIntensity, uMoonStrength, uStarStrength;
  uniform float uCloudCover, uCloudSpeed, uTime, uExposure;
  uniform sampler2D uStars;

  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.86, 0.5, -0.5, 0.86);
    for (int i = 0; i < 6; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // —— 基础天穹渐变
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);
    col = mix(uGround, col, smoothstep(-0.16, 0.05, h));

    // —— 星河（先画，让云与光晕覆盖其上）
    if (uStarStrength > 0.001) {
      vec2 suv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
      vec3 stars = texture2D(uStars, suv).rgb;
      float twinkle = 0.75 + 0.25 * sin(uTime * 2.1 + suv.x * 320.0) * sin(uTime * 1.4 + suv.y * 210.0);
      col += stars * uStarStrength * twinkle * smoothstep(-0.02, 0.24, h);
    }

    // —— 月轮
    float mmu = dot(d, uMoonDir);
    if (uMoonStrength > 0.001) {
      float ang = acos(clamp(mmu, -1.0, 1.0));
      float disc = smoothstep(0.030, 0.021, ang);
      float halo = pow(max(mmu, 0.0), 320.0) * 0.7 + pow(max(mmu, 0.0), 24.0) * 0.10;
      // 月面明暗
      vec2 mo = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))).xz;
      float shade = 0.82 + 0.30 * vnoise((d.xz - uMoonDir.xz) * 260.0);
      col += uMoonColor * (disc * 3.1 * shade + halo * 1.5) * uMoonStrength;
    }

    // —— 太阳与米氏散射光晕
    float mu = dot(d, uSunDir);
    float glow = pow(max(mu, 0.0), 7.0);
    float wide = pow(max(mu, 0.0), 1.7);
    col += uSunColor * (glow * 0.62 + wide * 0.16) * uSunIntensity;
    float sang = acos(clamp(mu, -1.0, 1.0));
    float sdisc = smoothstep(0.028, 0.017, sang);
    col += uSunColor * sdisc * 16.0 * uSunIntensity;

    // —— 云海：投影到一个虚拟云平面
    if (h > 0.005) {
      vec2 cuv = d.xz / max(h, 0.02) * 0.055;
      vec2 flow = vec2(1.0, 0.34) * uTime * uCloudSpeed;
      float n  = fbm(cuv * 1.0 + flow);
      float n2 = fbm(cuv * 2.7 - flow * 0.6);
      float dens = n * 0.72 + n2 * 0.28;

      float thr = 1.0 - uCloudCover;
      float cov = smoothstep(thr, thr + 0.20, dens);

      // 朝太阳方向再采一次密度 -> 银边
      vec2 sdir = normalize(uSunDir.xz + vec2(0.001));
      float ns = fbm((cuv + sdir * 0.055) * 1.0 + flow);
      float lit = clamp((dens - ns) * 3.0 + 0.52, 0.0, 1.0);
      lit = pow(lit, 1.25);

      vec3 cc = mix(uCloudDark, uCloudLit, lit);
      cc += uSunColor * pow(max(mu, 0.0), 12.0) * lit * 0.85;   // 逆光透亮

      float fade = smoothstep(0.005, 0.20, h) * smoothstep(1.0, 0.55, h * 0.9);
      col = mix(col, cc, clamp(cov * fade, 0.0, 1.0) * 0.92);
    }

    // —— 地平线雾气带，把远山与天缝合
    float band = exp(-abs(h) * 16.0) * 0.5;
    col = mix(col, uHorizon * 1.06, band * 0.55);

    gl_FragColor = vec4(col * uExposure, 1.0);
  }
`;

export class Sky {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(1200, 48, 32);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
        uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, 0.8).normalize() },
        uZenith: { value: new THREE.Color(0x2f6ec4) },
        uHorizon: { value: new THREE.Color(0xbcd4e6) },
        uGround: { value: new THREE.Color(0x8a9099) },
        uSunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
        uMoonColor: { value: new THREE.Color(0.78, 0.84, 1.0) },
        uCloudLit: { value: new THREE.Color(1.0, 0.98, 0.94) },
        uCloudDark: { value: new THREE.Color(0.48, 0.53, 0.62) },
        uSunIntensity: { value: 1.0 },
        uMoonStrength: { value: 0.0 },
        uStarStrength: { value: 0.0 },
        uCloudCover: { value: 0.42 },
        uCloudSpeed: { value: 0.0032 },
        uTime: { value: 0 },
        uExposure: { value: 1.0 },
        uStars: { value: buildTexture('stars') },
      },
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.material.uniforms.uStars.value.wrapS = THREE.RepeatWrapping;
    this.material.uniforms.uStars.value.wrapT = THREE.ClampToEdgeWrapping;
    this.material.uniforms.uStars.value.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  update(camera, time) {
    this.material.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
  }

  get u() { return this.material.uniforms; }
}
