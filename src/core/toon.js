// 卡通着色 —— 把直射光压成几段平面色，明暗交界变利落，但不至于硬到出色块

// 全局档位：一处调，全场跟着变
export const toonUniforms = {
  uToonSteps: { value: 3.0 },
};

export const TOON_PARS = /* glsl */`
  uniform float uToon;
  uniform float uToonSteps;
`;

// 用「直射光占总光量的比例」做量化 —— 与曝光、时辰无关，
// 所以正午和夜里看到的层数是一样的。
export const TOON_BODY = /* glsl */`
  #ifdef TOON_SHADE
  {
    vec3 dLit = reflectedLight.directDiffuse;
    float dm = max(max(dLit.r, dLit.g), dLit.b);
    vec3 iLit = reflectedLight.indirectDiffuse;
    float im = max(max(iLit.r, iLit.g), iLit.b);
    float total = dm + im + 1e-4;
    float x = dm / total;
    float s = x * uToonSteps;
    float f = floor(s);
    float q = (f + smoothstep(0.30, 0.70, s - f)) / uToonSteps;
    // 量化后的比值留个下限，暗部不至于被压成死黑
    float k = max(q / max(x, 1e-4), 0.42);
    reflectedLight.directDiffuse = dLit * mix(1.0, k, uToon);
    // 明暗交界处补一道极窄的暖光，像手绘的高光边
    float edge = smoothstep(0.42, 0.50, x) * (1.0 - smoothstep(0.50, 0.62, x));
    reflectedLight.directDiffuse += dLit * edge * uToon * 0.28;
  }
  #endif
`;

// 给任意 MeshStandardMaterial 挂上卡通光照
export function toonify(material, amount = 0.38) {
  if (amount <= 0.001 || material.__toon !== undefined) return material;
  material.__toon = amount;   // clone() 不复制它 —— 副本需要自己再挂一次
  const prev = material.onBeforeCompile;
  material.defines = Object.assign({}, material.defines, { TOON_SHADE: '' });
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uToon = { value: amount };
    shader.uniforms.uToonSteps = toonUniforms.uToonSteps;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TOON_PARS}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${TOON_BODY}`);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () =>
    (prevKey ? prevKey.call(material) : '') + '|toon' + amount.toFixed(2);
  return material;
}
