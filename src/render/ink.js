import * as THREE from 'three';

// ---------------------------------------------------------------- ink cel shader
// one hand-rolled toon shader for the whole world: a hard two-tone light with a brushy terminator, shadows
// tinted toward the theme's shadow colour instead of grey, ink hatching in the deep shade and a faint paper
// mottle. lighting comes from these shared uniforms (set by applyTheme), not from three's lights, so the
// viewmodel pass gets the exact same look
export const INK = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
  uShade: { value: new THREE.Color(0.6, 0.6, 0.8) },
  uFogCol: { value: new THREE.Color() }, uFogNear: { value: 160 }, uFogFar: { value: 950 },
  uHatch: { value: 0.4 }, uInkCol: { value: new THREE.Color(0, 0, 0) },
  // facade windows: glass colour, the sky it reflects, warm lit-window colour and the share of windows lit
  uGlass: { value: new THREE.Color() }, uSkyRef: { value: new THREE.Color() }, uLitCol: { value: new THREE.Color(1, 0.85, 0.55) },
  uLit: { value: 0 },
};

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }`;
export { NOISE };

// window grid, in metres. floors are measured down from the roof, under a parapet band; bays are fitted to
// each face so every face starts and ends on a pier
export const FLOOR = 3.5, PARAPET = 1.4, BAY = 3.1;

const vertexShader = `
  uniform vec3 uBase;
  varying vec3 vN, vW, vC; varying float vDepth;
  #ifdef FACADE
    attribute vec4 aLo; attribute vec2 aFac;
    varying vec4 vLo; varying vec2 vFac;
  #endif
  void main() {
    #ifdef USE_COLOR
      vC = color;
    #else
      vC = uBase;
    #endif
    #ifdef FACADE
      vLo = aLo; vFac = aFac;
    #endif
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w; vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  uniform vec3 uSunDir, uSunCol, uShade, uFogCol, uInkCol, uGlass, uSkyRef, uLitCol;
  uniform float uFogNear, uFogFar, uHatch, uFog, uFlat, uLit;
  varying vec3 vN, vW, vC; varying float vDepth;
  #ifdef FACADE
    varying vec4 vLo; varying vec2 vFac;
  #endif
  ${NOISE}
  // 1 inside [a, b], with edges softened over w
  float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
  void main() {
    vec3 n = normalize(gl_FrontFacing ? vN : -vN);
    float ndl = dot(n, uSunDir);
    // painted terminator: the light/shadow edge wanders a little, like a wet brush edge
    float wob = noise(vW.xz * 0.3 + vW.y * 0.17) - 0.5;
    float lit = mix(smoothstep(-0.02, 0.04, ndl + wob * 0.12), 1.0, uFlat);
    vec3 light = mix(uShade, uSunCol, lit);
    vec3 base = vC;
    // weathering: soft vertical streaks run down walls, like rain-stained render
    float vert = 1.0 - abs(n.y);
    base *= 1.0 - vert * 0.07 * noise(vec2((vW.x + vW.z) * 0.9, vW.y * 0.04));
    vec3 col = base * light;
    #ifdef FACADE
      // windows: a grid of panes, inked frames and a pale stone sill, skipped on blank (party) walls
      bool xFace = abs(n.x) > 0.5;
      float side = xFace ? (n.x > 0.0 ? 0.0 : 1.0) : (n.z > 0.0 ? 2.0 : 3.0);
      float blank = mod(floor(vFac.y / pow(2.0, side)), 2.0);
      if (vert > 0.5 && blank < 0.5) {
        float along = xFace ? vW.z - vLo.y : vW.x - vLo.x;
        float len = xFace ? vLo.w - vLo.y : vLo.z - vLo.x;
        float bays = max(1.0, floor(len / ${BAY.toFixed(2)}));
        float bw = len / bays, cell = floor(along / bw), lu = fract(along / bw) * bw;
        float below = vFac.x - ${PARAPET.toFixed(2)} - vW.y, fl = floor(below / ${FLOOR.toFixed(2)});
        float lv = below - fl * ${FLOOR.toFixed(2)};
        float aa = max(fwidth(along), fwidth(vW.y)) * 0.75;
        float ww = min(bw * 0.28, 0.8), inside = step(0.0, below);
        float pane = inside * band(lu, ww, bw - ww, aa) * band(lv, 0.55, 2.25, aa);
        float frame = pane - inside * band(lu, ww + 0.09, bw - ww - 0.09, aa) * band(lv, 0.64, 2.16, aa);
        float sill = inside * band(lu, ww - 0.12, bw - ww + 0.12, aa) * band(lv, 2.25, 2.4, aa);
        float h = hash(vec2(cell, fl) + vLo.xy * 0.37);
        // glass reflects the sky, brighter toward the top of each pane, with a little variation per window
        vec3 glass = mix(uGlass, uSkyRef, 0.45 * (1.0 - (lv - 0.55) / 1.7) * (0.5 + h)) * mix(0.75, 1.0, lit);
        float on = step(1.0 - uLit, hash(vec2(fl, cell) + vLo.zw * 0.21 + 3.7));
        glass = mix(glass, uLitCol * (0.8 + 0.3 * h), on);
        // far away the grid only shimmers: fade it to its average tone
        float near = 1.0 - smoothstep(220.0, 520.0, vDepth);
        col = mix(col, glass, pane * near);
        // the thin frames and sills go first, before they're thinner than a pixel
        float fine = 1.0 - smoothstep(50.0, 130.0, vDepth);
        col = mix(col, uInkCol, frame * fine * 0.55);
        col = mix(col, base * 1.12 * light, sill * fine);
        col = mix(col, mix(col, uGlass, 0.3), (1.0 - near) * inside);
      }
      // roofs: rolled membrane in 1.2 m strips with dark seams, patched and rain-stained
      if (n.y > 0.5) {
        float d = abs(fract(vW.x / 1.2) - 0.5) * 1.2, fw = fwidth(vW.x);
        float seam = 1.0 - smoothstep(0.015, 0.03 + fw, d);
        float near = 1.0 - smoothstep(40.0, 160.0, vDepth);
        col *= 1.0 - seam * 0.12 * near;
        col *= 0.93 + 0.1 * noise(vW.xz * 0.15);
        col *= 1.0 - 0.1 * smoothstep(0.66, 0.72, noise(vW.xz * 0.07 + 5.0));
      }
    #endif
    // tops catch a touch more sky, so roofs pop against walls
    col *= 1.0 + max(n.y, 0.0) * 0.05;
    // ink hatching on faces turned well away from the sun: broken diagonal pen strokes drawn on the surface in
    // world space, so they stay put as you move. they fade out before they get fine enough to shimmer
    float away = smoothstep(-0.15, -0.55, ndl) * uHatch * (1.0 - uFlat);
    vec2 hp = vert > 0.5 ? vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y) : vW.xz;
    float hs = (hp.x + hp.y) / 0.3, hw = fwidth(hs);
    float stroke = smoothstep(0.36 - hw, 0.36 + hw, abs(fract(hs) - 0.5));
    stroke *= step(0.4, noise(vec2(hp.x - hp.y, hp.x + hp.y) * 0.7));
    stroke *= (1.0 - smoothstep(25.0, 80.0, vDepth)) * (1.0 - smoothstep(0.12, 0.3, hw));
    col = mix(col, uInkCol, away * stroke * 0.45);
    // paper mottle in world space, so it sticks to surfaces
    col *= 0.95 + 0.08 * noise(vW.xz * 0.11 + vW.y * 0.07);
    float f = smoothstep(uFogNear, uFogFar, vDepth) * uFog;
    gl_FragColor = vec4(mix(col, uFogCol, f), 1.0);
  }`;

// vertexColors meshes read their colour per vertex; anything else uses `color`.
// fog: false for things that sit beyond the fog (clouds) or in the viewmodel pass. flat: 0..1, how much the
// shadow side is lifted toward the lit colour (1 ignores the sun). facade: draw windows from the aLo / aFac
// attributes a facade Batch writes
export function inkMat({ color = 0xffffff, vertexColors = false, fog = true, flat = 0, polygonOffset = false, facade = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...INK, uBase: { value: new THREE.Color(color) }, uFog: { value: fog ? 1 : 0 }, uFlat: { value: flat } },
    vertexShader, fragmentShader, vertexColors, defines: facade ? { FACADE: '' } : {},
    polygonOffset, polygonOffsetFactor: polygonOffset ? 1 : 0, polygonOffsetUnits: polygonOffset ? 1 : 0,
  });
}
// the same material's colour, whatever kind it is
export const setColor = (m, hex) => (m.uniforms ? m.uniforms.uBase.value.set(hex) : m.color.set(hex));
