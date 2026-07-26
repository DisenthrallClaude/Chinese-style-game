// 溪流 —— 河面着色、岸边浪花、飞瀑与水沫
import * as THREE from 'three';
import { buildTexture, colorOf, normalOf } from '../core/textures.js';
import { RIVER, WATER_Y } from './layout.js';
import { Rng, clamp } from '../core/noise.js';

const waterVert = /* glsl */`
  varying vec3 vWorld;
  varying vec2 vFlow;
  varying float vShore;
  attribute float aShore;
  attribute float aFlow;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vShore = aShore;
    vec3 p = position;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vFlow = vec2(aFlow, aShore);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFrag = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  varying vec2 vFlow;
  varying float vShore;

  uniform sampler2D tNormal;
  uniform sampler2D tNoise;
  uniform vec3 uSunDir, uSunColor, uSkyLow, uSkyHigh, uDeep, uShallow, uFoam;
  uniform float uTime, uSunPower, uOpacity, uNightMix;
  uniform vec3 uCameraP;

  #include <common>
  #include <fog_pars_fragment>

  vec3 sampleNormal(vec2 uv, float scale, vec2 flow) {
    vec3 n = texture2D(tNormal, uv * scale + flow).xyz * 2.0 - 1.0;
    return n;
  }

  void main() {
    vec2 base = vWorld.xz;
    vec2 f1 = vec2(-uTime * 0.055, uTime * 0.021);
    vec2 f2 = vec2(-uTime * 0.033, -uTime * 0.014);
    vec3 n1 = sampleNormal(base, 0.085, f1);
    vec3 n2 = sampleNormal(base, 0.031, f2);
    vec3 n3 = sampleNormal(base, 0.21, f1 * 2.3);
    vec3 nrm = normalize(vec3(
      (n1.x * 1.0 + n2.x * 0.75 + n3.x * 0.42),
      2.4,
      (n1.y * 1.0 + n2.y * 0.75 + n3.y * 0.42)
    ));

    vec3 V = normalize(uCameraP - vWorld);
    float fres = pow(1.0 - clamp(dot(V, nrm), 0.0, 1.0), 3.4);
    fres = clamp(fres * 0.92 + 0.055, 0.0, 1.0);

    // 反射：按反射光线的仰角在天空梯度上取色
    vec3 R = reflect(-V, nrm);
    float sky_t = clamp(R.y * 1.35, 0.0, 1.0);
    vec3 refl = mix(uSkyLow, uSkyHigh, pow(sky_t, 0.6));

    // 水体本身（浅处偏绿，深处偏青黑）
    float depthT = smoothstep(0.15, 1.0, vShore);
    vec3 body = mix(uDeep, uShallow, depthT);

    vec3 col = mix(body, refl, fres);

    // 阳光镜面
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(nrm, H), 0.0), uSunPower);
    col += uSunColor * spec * 2.6;
    // 细碎波光
    float glint = pow(max(dot(nrm, H), 0.0), 220.0);
    col += uSunColor * glint * 6.0;

    // 岸边浪花
    float fnoise = texture2D(tNoise, base * 0.10 + vec2(uTime * 0.05, uTime * 0.02)).r;
    float fnoise2 = texture2D(tNoise, base * 0.26 - vec2(uTime * 0.08, 0.0)).g;
    float shoreBand = smoothstep(0.62, 0.99, vShore);
    float foam = shoreBand * smoothstep(0.35, 0.75, fnoise * 0.6 + fnoise2 * 0.4);
    col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);

    // 缓流处的白色纹路
    float streak = smoothstep(0.80, 0.98, fnoise2) * (1.0 - shoreBand) * 0.22;
    col += uFoam * streak;

    float alpha = mix(uOpacity, 0.97, clamp(foam + fres * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export class River {
  constructor(scene, terrain) {
    this.scene = scene;
    const pts = RIVER.pts;
    const cols = 11;
    const pos = [], shore = [], flow = [], idx = [];
    const halfBase = 5.4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(pts.length - 1, i + 1)];
      let tx = pb[0] - pa[0], tz = pb[1] - pa[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      // 宽度随位置起伏
      const w = halfBase * (1 + Math.sin(i * 0.09) * 0.24 + Math.cos(i * 0.037) * 0.16);
      for (let j = 0; j < cols; j++) {
        const t = j / (cols - 1);
        const lat = (t - 0.5) * 2;
        const x = p[0] + nx * lat * w;
        const z = p[1] + nz * lat * w;
        pos.push(x, WATER_Y, z);
        shore.push(Math.abs(lat));
        flow.push(RIVER.cum[i] || i * 1.6);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = a + cols;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    g.setIndex(idx);
    g.computeVertexNormals();

    const nrm = normalOf('waterHeight', 2.6, 1);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    const noiseT = colorOf('noiseRGBA', 1);

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          tNormal: { value: nrm },
          tNoise: { value: noiseT },
          uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
          uSunColor: { value: new THREE.Color(1.0, 0.88, 0.7) },
          uSkyLow: { value: new THREE.Color(0.72, 0.82, 0.9) },
          uSkyHigh: { value: new THREE.Color(0.24, 0.44, 0.86) },
          uDeep: { value: new THREE.Color(0.055, 0.13, 0.135) },
          uShallow: { value: new THREE.Color(0.14, 0.30, 0.26) },
          uFoam: { value: new THREE.Color(0.94, 0.97, 0.98) },
          uTime: { value: 0 },
          uSunPower: { value: 92 },
          uOpacity: { value: 0.86 },
          uNightMix: { value: 0 },
          uCameraP: { value: new THREE.Vector3() },
        },
      ]),
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      fog: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.material.uniforms.tNormal.value = nrm;
    this.material.uniforms.tNoise.value = noiseT;

    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  update(t, camera, dayNight) {
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uCameraP.value.copy(camera.position);
    if (dayNight && dayNight.state) {
      const s = dayNight.state;
      u.uSunDir.value.copy(dayNight.state.sunEl < -3 ? dayNight.moonWorld : dayNight.sunWorld);
      u.uSunColor.value.copy(s.sun).multiplyScalar(clamp(s.sunI / 3.0, 0.06, 1.1));
      u.uSkyLow.value.copy(s.hor);
      u.uSkyHigh.value.copy(s.zen);
      const night = clamp(1 - s.sunI / 1.4, 0, 1);
      u.uDeep.value.setRGB(0.055, 0.13, 0.135).lerp(new THREE.Color(0.02, 0.035, 0.07), night);
      u.uShallow.value.setRGB(0.14, 0.30, 0.26).lerp(new THREE.Color(0.05, 0.09, 0.15), night);
      u.uFoam.value.setRGB(0.94, 0.97, 0.98).lerp(new THREE.Color(0.55, 0.65, 0.85), night);
    }
  }
}

/* ============================================================
   飞瀑 / 水帘 —— 挂在水车与渡槽下的落水
   ============================================================ */
const fallVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const fallFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  uniform sampler2D tNoise;
  uniform float uTime, uSpeed, uOpacity;
  uniform vec3 uColor, uHighlight;
  void main() {
    vec2 uv = vUv;
    float t = uTime * uSpeed;
    float n1 = texture2D(tNoise, vec2(uv.x * 2.6, uv.y * 0.55 - t)).r;
    float n2 = texture2D(tNoise, vec2(uv.x * 5.4 + 0.3, uv.y * 0.9 - t * 1.55)).g;
    float n3 = texture2D(tNoise, vec2(uv.x * 1.2, uv.y * 0.3 - t * 0.7)).b;
    float streak = smoothstep(0.30, 0.85, n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
    // 顶部成束，底部散开
    float spread = smoothstep(0.0, 1.0, uv.y);
    float edge = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.84, uv.x);
    float a = streak * edge * mix(1.0, 0.42, spread) * uOpacity;
    a *= smoothstep(0.0, 0.08, uv.y);
    vec3 col = mix(uColor, uHighlight, streak * 0.85 + spread * 0.25);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    if (gl_FragColor.a < 0.01) discard;
  }
`;

export class FallingWater {
  constructor(width, height, opts = {}) {
    const g = new THREE.PlaneGeometry(width, height, 1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tNoise: { value: colorOf('noiseRGBA', 1) },
        uTime: { value: 0 },
        uSpeed: { value: opts.speed || 0.85 },
        uOpacity: { value: opts.opacity || 0.9 },
        uColor: { value: new THREE.Color(opts.color || 0x9fc4c8) },
        uHighlight: { value: new THREE.Color(opts.highlight || 0xf2fbff) },
      },
      vertexShader: fallVert,
      fragmentShader: fallFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 5;
  }
  update(t) { this.material.uniforms.uTime.value = t; }
}
