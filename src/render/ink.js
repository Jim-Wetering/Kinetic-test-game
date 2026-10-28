import * as THREE from 'three';

// ---------------------------------------------------------------- ink cel shader
// one hand-rolled toon shader for the whole world: a hard two-tone light with a brushy terminator, shadows
// tinted toward the theme's shadow colour instead of grey, screen-space halftone dots and ink hatching in the
// shade, and a faint paper mottle. lighting comes from these shared uniforms (set by applyTheme), not from
// three's lights, so the viewmodel pass gets the exact same look
export const INK = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
  uShade: { value: new THREE.Color(0.6, 0.6, 0.8) },
  uFogCol: { value: new THREE.Color() }, uFogNear: { value: 160 }, uFogFar: { value: 950 },
  uHalftone: { value: 0.6 }, uHatch: { value: 0.4 }, uInkCol: { value: new THREE.Color(0, 0, 0) },
  uPx: { value: 1 },
};

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }`;
export { NOISE };

const vertexShader = `
  uniform vec3 uBase;
  varying vec3 vN, vW, vC; varying float vDepth;
  void main() {
    #ifdef USE_COLOR
      vC = color;
    #else
      vC = uBase;
    #endif
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w; vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  uniform vec3 uSunDir, uSunCol, uShade, uFogCol, uInkCol;
  uniform float uFogNear, uFogFar, uHalftone, uHatch, uPx, uFog, uFlat;
  varying vec3 vN, vW, vC; varying float vDepth;
  ${NOISE}
  void main() {
    vec3 n = normalize(gl_FrontFacing ? vN : -vN);
    float ndl = dot(n, uSunDir);
    // painted terminator: the light/shadow edge wanders a little, like a wet brush edge
    float wob = noise(vW.xz * 0.3 + vW.y * 0.17) - 0.5;
    float lit = mix(smoothstep(-0.02, 0.04, ndl + wob * 0.12), 1.0, uFlat);
    vec3 col = mix(vC * uShade, vC * uSunCol, lit);
    // tops catch a touch more sky, so roofs pop against walls
    col *= 1.0 + max(n.y, 0.0) * 0.06;
    vec2 sp = gl_FragCoord.xy / uPx;
    // halftone dots in the shade, on a 45 degree screen grid
    vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * sp / 6.0;
    float dotR = length(fract(hp) - 0.5);
    // fade out with distance, where the dots would only shimmer
    float shadeAmt = (1.0 - lit) * uHalftone * (1.0 - uFlat) * (1.0 - smoothstep(60.0, 260.0, vDepth));
    col *= 1.0 - shadeAmt * 0.32 * (1.0 - smoothstep(0.24, 0.3, dotR));
    // ink hatching on faces turned well away from the sun
    float away = smoothstep(-0.15, -0.55, ndl) * uHatch * (1.0 - uFlat);
    float stroke = smoothstep(0.55, 0.75, abs(fract((sp.x + sp.y) / 7.0) * 2.0 - 1.0));
    stroke *= step(0.35, noise(sp / 22.0 + vW.xz * 0.01));
    col = mix(col, uInkCol, away * stroke * 0.55);
    // paper mottle in world space, so it sticks to surfaces
    col *= 0.95 + 0.08 * noise(vW.xz * 0.11 + vW.y * 0.07);
    float f = smoothstep(uFogNear, uFogFar, vDepth) * uFog;
    gl_FragColor = vec4(mix(col, uFogCol, f), 1.0);
  }`;

// vertexColors meshes read their colour per vertex; anything else uses `color`.
// fog: false for things that sit beyond the fog (clouds) or in the viewmodel pass. flat: 0..1, how much the
// shadow side is lifted toward the lit colour (1 ignores the sun)
export function inkMat({ color = 0xffffff, vertexColors = false, fog = true, flat = 0, polygonOffset = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...INK, uBase: { value: new THREE.Color(color) }, uFog: { value: fog ? 1 : 0 }, uFlat: { value: flat } },
    vertexShader, fragmentShader, vertexColors,
    polygonOffset, polygonOffsetFactor: polygonOffset ? 1 : 0, polygonOffsetUnits: polygonOffset ? 1 : 0,
  });
}
// the same material's colour, whatever kind it is
export const setColor = (m, hex) => (m.uniforms ? m.uniforms.uBase.value.set(hex) : m.color.set(hex));
