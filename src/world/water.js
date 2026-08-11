// 溪流 —— 河面着色、岸边浪花、飞瀑与水沫
import * as THREE from 'three';
import { buildTexture, colorOf, normalOf } from '../core/textures.js';
import { LEVEL, RIVER, WATER_Y, WATER_KIND, WATER_SHEET, VALLEY_C } from './layout.js';
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
  uniform float uEmissive, uFlowScale, uCrack;
  uniform vec3 uCameraP;

  #include <common>
  #include <fog_pars_fragment>

  vec3 sampleNormal(vec2 uv, float scale, vec2 flow) {
    vec3 n = texture2D(tNormal, uv * scale + flow).xyz * 2.0 - 1.0;
    return n;
  }

  void main() {
    vec2 base = vWorld.xz;
    vec2 f1 = vec2(-uTime * 0.055, uTime * 0.021) * uFlowScale;
    vec2 f2 = vec2(-uTime * 0.033, -uTime * 0.014) * uFlowScale;
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

    // 熔岩：结壳的黑与裂缝里透出的橙红。裂纹用同一张噪声的脊线取出来。
    if (uEmissive > 0.001) {
      // 表面大半是冷却的黑壳，只有裂缝里透出橙红。
      // 壳给得不够多，整条河就会糊成一块均匀的红。
      float cn = fnoise * 0.55 + fnoise2 * 0.45;
      float crust = smoothstep(0.16, 0.56, cn);
      // 裂纹：噪声的脊线，窄而亮
      float vein = 1.0 - smoothstep(0.0, 0.055, abs(fnoise2 - 0.5));
      vein = max(vein, 1.0 - smoothstep(0.0, 0.040, abs(fnoise - 0.46)));
      vein *= (1.0 - crust * 0.82);
      // 流动的明暗：让它看着是在淌，不是铺着
      float flow = 0.7 + 0.3 * sin(base.x * 0.09 + base.y * 0.05 - uTime * 0.6);
      vec3 crustCol = mix(uDeep * 1.5, uDeep * 0.55, crust);
      col = mix(crustCol, mix(uShallow, uFoam, pow(vein, 2.0)), clamp(vein * 1.3, 0.0, 1.0));
      col += uShallow * vein * 1.5 * uEmissive * flow;
      // 岸边最烫
      col += uFoam * shoreBand * shoreBand * 0.55 * uEmissive;
      alpha = 1.0;
    }

    // 冰面：一层薄薄的裂纹，反射压得比水低
    if (uCrack > 0.001) {
      float cr = 1.0 - smoothstep(0.0, 0.05, abs(fnoise - 0.5));
      col = mix(col, uFoam, cr * 0.45 * uCrack);
      col = mix(col, uFoam, shoreBand * 0.30 * uCrack);
    }

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export class River {
  constructor(scene, terrain) {
    this.scene = scene;
    this.kind = WATER_KIND;
    const W = LEVEL.water;
    const g = WATER_SHEET ? this._sheetGeometry(terrain, W) : this._channelGeometry(W, terrain);

    const nrm = normalOf('waterHeight', 2.6, 1);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    const noiseT = colorOf('noiseRGBA', 1);

    const isLava = this.kind === 'lava';
    const isIce = this.kind === 'ice';

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
          uDeep: { value: new THREE.Color(W.deep) },
          uShallow: { value: new THREE.Color(W.shallow) },
          uFoam: { value: new THREE.Color(W.foam) },
          uTime: { value: 0 },
          uSunPower: { value: isIce ? 180 : 92 },
          uOpacity: { value: W.opacity },
          uNightMix: { value: 0 },
          uEmissive: { value: isLava ? (W.emissive || 1.0) : 0.0 },
          uFlowScale: { value: W.flow !== undefined ? W.flow : 1.0 },
          uCrack: { value: isIce ? 1.0 : 0.0 },
          uCameraP: { value: new THREE.Vector3() },
        },
      ]),
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: !isLava,
      fog: true,
      side: THREE.DoubleSide,
      depthWrite: isLava,
      toneMapped: true,
    });
    this.material.uniforms.tNormal.value = nrm;
    this.material.uniforms.tNoise.value = noiseT;
    this.baseDeep = new THREE.Color(W.deep);
    this.baseShallow = new THREE.Color(W.shallow);
    this.baseFoam = new THREE.Color(W.foam);

    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);

    // 熔岩自己会照亮两岸
    if (isLava) {
      this.glow = new THREE.PointLight(0xff5a12, 26, 90, 1.7);
      this.glow.position.set(VALLEY_C.x, WATER_Y + 3, VALLEY_C.z + 4);
      scene.add(this.glow);
    }
  }

  // ---- 河道：沿中心线放样出一条带 ----
  // 河宽不是给死的，而是每一道横断面向两侧试探，量到河床爬出水面为止。
  // 这样水面永远贴着自己的河床，不会插进岸里，也不会在浅段整条埋掉。
  _channelGeometry(W, terrain) {
    const pts = RIVER.pts;
    const cols = 11;
    const pos = [], shore = [], flow = [], idx = [];
    const halfBase = W.halfWidth;
    const widths = [];
    const alive = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(pts.length - 1, i + 1)];
      let tx = pb[0] - pa[0], tz = pb[1] - pa[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      // 名义宽度随位置起伏
      let w = halfBase * (1 + Math.sin(i * 0.09) * 0.24 + Math.cos(i * 0.037) * 0.16);
      if (terrain) {
        // 向两侧步进，找河床仍在水面之下的最远处
        let lim = 0.6;
        for (let side = -1; side <= 1; side += 2) {
          let far = 0.6;
          for (let d = 0.6; d <= w; d += 0.35) {
            const gx = p[0] + nx * side * d, gz = p[1] + nz * side * d;
            if (terrain.heightAt(gx, gz) > WATER_Y - 0.10) break;
            far = d;
          }
          lim = Math.max(lim, far);
        }
        // 只收窄、不掐断 —— 宽度贴着河床走，整段剔除会把河截成几节。
        // 再给一个下限：桥下那一小段河床本来就被抬起来了，探到的宽度会
        // 掉到几乎为零；照单全收的话，整条河（炎火之山是整条熔岩）就在
        // 桥那儿断成两截。留住三成宽度，桥身自会把它盖住。
        w = Math.min(w, Math.max(lim, w * 0.30));
      }
      widths.push(w);
      alive.push(true);   // 整段剔除会把河截成几节，改为一律保留
    }
    // 沿河做一次宽度平滑：单个断面被桥或台基掐一下，不该让整条河出现一个尖角
    const sw = widths.slice();
    for (let i = 0; i < widths.length; i++) {
      const a = widths[Math.max(0, i - 1)], b = widths[i], c = widths[Math.min(widths.length - 1, i + 1)];
      sw[i] = Math.max(b, (a + c) * 0.5 * 0.82);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(pts.length - 1, i + 1)];
      let tx = pb[0] - pa[0], tz = pb[1] - pa[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      const w = sw[i];
      for (let j = 0; j < cols; j++) {
        const t = j / (cols - 1);
        const lat = (t - 0.5) * 2;
        pos.push(p[0] + nx * lat * w, WATER_Y, p[1] + nz * lat * w);
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
    return g;
  }

  // ---- 整片的海／云海：aShore 由水深反推，岛缘自然出现浅滩与浪花 ----
  _sheetGeometry(terrain, W) {
    const half = W.halfWidth;
    const n = 160;
    const pos = [], shore = [], flow = [], idx = [];
    const DEPTH = 7.0;
    for (let j = 0; j <= n; j++) {
      const z = VALLEY_C.z + (j / n - 0.5) * half * 2;
      for (let i = 0; i <= n; i++) {
        const x = VALLEY_C.x + (i / n - 0.5) * half * 2;
        pos.push(x, WATER_Y, z);
        // 水越浅越接近 1，浪花与浅色就压在岛缘一圈
        const depth = WATER_Y - terrain.heightAt(x, z);
        shore.push(clamp(1 - depth / DEPTH, 0, 1));
        flow.push((x + z) * 0.5);
      }
    }
    const row = n + 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * row + i, b = a + row;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  update(t, camera, dayNight) {
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uCameraP.value.copy(camera.position);
    if (!dayNight || !dayNight.state) return;
    const s = dayNight.state;
    u.uSunDir.value.copy(s.sunEl < -3 ? dayNight.moonWorld : dayNight.sunWorld);
    // 夜里主光是月，别让水面炸成一条白带
    const night = clamp(dayNight.lanternLevel, 0, 1);
    u.uSunColor.value.copy(s.sun)
      .multiplyScalar(clamp(s.sunI / 5.5, 0.05, 1.05) * (1 - night * 0.80));
    u.uSkyLow.value.copy(s.hor);
    u.uSkyHigh.value.copy(s.zen);
    // 熔岩自身发光，入夜反而更亮，不跟着压暗
    if (this.kind === 'lava') {
      u.uEmissive.value = 1.0 + night * 0.55;
      if (this.glow) this.glow.intensity = 22 + night * 16 + Math.sin(t * 1.1) * 3;
      return;
    }
    u.uDeep.value.copy(this.baseDeep).lerp(NIGHT_DEEP, night);
    u.uShallow.value.copy(this.baseShallow).lerp(NIGHT_SHALLOW, night);
    u.uFoam.value.copy(this.baseFoam).lerp(NIGHT_FOAM, night);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
    if (this.glow) this.scene.remove(this.glow);
  }
}

const NIGHT_DEEP = new THREE.Color(0.012, 0.024, 0.055);
const NIGHT_SHALLOW = new THREE.Color(0.030, 0.055, 0.10);
const NIGHT_FOAM = new THREE.Color(0.13, 0.20, 0.34);

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
