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
// distances (m) where drawing gives way to painting: past PAINT_NEAR detail turns into brush strokes of colour,
// and black ink outlines fade out between INK_NEAR and INK_FAR, leaving far shapes as strokes of their own colour
export const PAINT_NEAR = 110, INK_NEAR = 130, INK_FAR = 300;

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
  uniform float uFogNear, uFogFar, uHatch, uFog, uFlat, uLit, uMark;
  varying vec3 vN, vW, vC; varying float vDepth;
  #ifdef FACADE
    varying vec4 vLo; varying vec2 vFac;
  #endif
  ${NOISE}
  // 1 inside [a, b], with edges softened over w
  float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
  // how much of a pattern with frequency f (cycles per metre along coord) to keep: all of it while a cycle spans
  // several pixels, fading to none before it gets down to a few, so no detail is ever finer than the screen can
  // hold (that is what shimmers when you move)
  float keep(float f, float coord) { return 1.0 - smoothstep(0.12, 0.3, f * fwidth(coord)); }
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
    base *= 1.0 - vert * 0.07 * noise(vec2((vW.x + vW.z) * 0.9, vW.y * 0.04)) * keep(0.9, vW.x + vW.z);
    // broad brushwork over big flat areas: long strokes about a metre wide, up and down on walls and diagonal on
    // roofs, a shade lighter or darker than their neighbours. gone by mid-distance, where it would only shimmer
    vec2 bp = vert > 0.5 ? vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y) : vec2(vW.x + vW.z, vW.x - vW.z) * 0.7071;
    float broad = 0.5 + (noise(vec2(bp.x * 1.1, bp.y * 0.06)) - 0.5) * 0.7 * keep(1.1, bp.x)
                + (noise(vec2(bp.x * 3.1, bp.y * 0.15)) - 0.5) * 0.3 * keep(3.1, bp.x);
    base *= 1.0 + (broad - 0.5) * 0.1 * (1.0 - smoothstep(110.0, 220.0, vDepth));
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
        col = mix(col, glass, pane);
        // the thin frames and sills go first, before they're thinner than a pixel
        float fine = 1.0 - smoothstep(50.0, 130.0, vDepth);
        col = mix(col, uInkCol, frame * fine * 0.55);
        col = mix(col, base * 1.12 * light, sill * fine);
        // in the distance the grid gives way to painting: the wall goes to one flat colour and the windows become
        // a few big dabs on a coarse grid (~11 x 9 m), each a handful of brush hairs laid side by side. at night they're
        // lamplight; by day, glass with the odd sun glint
        float far = smoothstep(${PAINT_NEAR.toFixed(1)}, ${PAINT_NEAR.toFixed(1)} + 110.0, vDepth);
        vec2 dc = vec2(along / 11.0, below / 9.0), di = floor(dc), df = fract(dc);
        float dabOn = step(0.58, hash(di + vLo.xy * 0.13 + side * 3.1)) * inside;
        // five hairs per dab, each starting a little further in and running its own length
        float hy = (df.y - 0.2) / 0.55 * 5.0, hRow = floor(hy), hf = fract(hy);
        float hl = 0.4 + 0.5 * hash(di + hRow * 1.7 + 4.2);
        float hx = (df.x - 0.08 - hash(di + hRow * 2.9) * 0.08) / hl;
        // once the hairs are thinner than a pixel their edges blur together instead of shimmering
        float hw = max(0.06, fwidth(hy)), xw = max(0.04, fwidth(hx));
        float hair = step(0.0, hy) * step(hy, 5.0) * band(hf, 0.1, 0.9, hw) * band(hx, 0.0, 1.0, xw);
        // the brush runs dry toward the end of each hair: gaps open up along its last stretch
        hair *= step(smoothstep(0.5, 1.0, hx) * 0.85, noise(vec2(hx * 6.0, hRow * 3.1 + di.x)));
        float dab = dabOn * hair;
        float lamp = step(1.0 - min(1.0, uLit * 1.6), hash(di + 2.3)), glint = step(0.55, hash(di + 5.1)) * lit;
        vec3 dabCol = mix(mix(mix(uGlass, uSkyRef, 0.35), uSunCol * 0.95, glint), uLitCol, lamp);
        // the wall itself is left as one flat colour: no weathering, no grid
        col = mix(col, mix(vC * light, dabCol, dab), far);
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
    #if defined(STREAK_X) || defined(STREAK_Z)
      // a pale highlight laid on with a dry brush: bristle streaks run the length of the strip, the paint thinning
      // to the colour underneath in long dashes. fades to plain paint where the streaks would be under a pixel
      #ifdef STREAK_X
        float sAlong = vW.x, sAcross = vert > 0.5 ? vW.y : vW.z;
      #else
        float sAlong = vW.z, sAcross = vert > 0.5 ? vW.y : vW.x;
      #endif
      float br = 0.5 + (noise(vec2(sAcross * 11.0, sAlong * 0.22)) - 0.5) * 0.6 * keep(11.0, sAcross)
               + (noise(vec2(sAcross * 31.0, sAlong * 0.5)) - 0.5) * 0.4 * keep(31.0, sAcross);
      float thin = smoothstep(0.55, 0.75, noise(vec2(sAlong * 0.35, sAcross * 2.0 + 7.0))) * smoothstep(0.25, 0.5, br);
      float streakNear = 1.0 - smoothstep(25.0, 110.0, vDepth);
      col *= mix(1.0, 0.8 + 0.32 * br, streakNear);
      col = mix(col, col * uShade * 0.85, thin * streakNear * 0.7);
    #endif
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
    // alpha tells the post pass what to leave alone: 0.5 marks shapes that are already soft paint (clouds)
    gl_FragColor = vec4(mix(col, uFogCol, f), uMark);
  }`;

// vertexColors meshes read their colour per vertex; anything else uses `color`.
// fog: false for things that sit beyond the fog (clouds) or in the viewmodel pass. flat: 0..1, how much the
// shadow side is lifted toward the lit colour (1 ignores the sun). facade: draw windows from the aLo / aFac
// attributes a facade Batch writes
// painted: already soft paint (clouds), so the post pass skips its distance streaking
// streak: 'x' or 'z' for a dry-brush highlight whose bristles run along that axis (roof copings)
export function inkMat({ color = 0xffffff, vertexColors = false, fog = true, flat = 0, polygonOffset = false, facade = false, painted = false, streak = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...INK, uBase: { value: new THREE.Color(color) }, uFog: { value: fog ? 1 : 0 }, uFlat: { value: flat }, uMark: { value: painted ? 0.5 : 1 } },
    vertexShader, fragmentShader, vertexColors,
    defines: { ...(facade ? { FACADE: '' } : {}), ...(streak ? { ['STREAK_' + streak.toUpperCase()]: '' } : {}) },
    polygonOffset, polygonOffsetFactor: polygonOffset ? 1 : 0, polygonOffsetUnits: polygonOffset ? 1 : 0,
  });
}
// the same material's colour, whatever kind it is
export const setColor = (m, hex) => (m.uniforms ? m.uniforms.uBase.value.set(hex) : m.color.set(hex));

// back-face hull for the batched world: an ink outline. with paintFar (clouds) it takes the shape's own (lit)
// colour with distance, so a far silhouette is a soft stroke of paint rather than a black line
export function inkHullMat({ fog = true, painted = false, paintFar = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...INK, uFog: { value: fog ? 1 : 0 }, uMark: { value: painted ? 0.5 : 1 }, uPaintFar: { value: paintFar ? 1 : 0 } },
    side: THREE.BackSide, vertexColors: true,
    vertexShader: `varying vec3 vC; varying float vDepth;
      void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uInkCol, uSunCol, uShade, uFogCol; uniform float uFogNear, uFogFar, uFog, uMark, uPaintFar; varying vec3 vC; varying float vDepth;
      void main() {
        vec3 col = mix(uInkCol, vC * mix(uShade, uSunCol, 0.55), uPaintFar * smoothstep(${INK_NEAR.toFixed(1)}, ${INK_FAR.toFixed(1)}, vDepth));
        gl_FragColor = vec4(mix(col, uFogCol, smoothstep(uFogNear, uFogFar, vDepth) * uFog), uMark);
      }`,
  });
}
// ink lines (crease edges, cables, rails). they are a single pixel wide, so they crawl once the thing they draw
// is small on screen: they fade out from 50 to 130 m
export function inkLineMat() {
  return new THREE.ShaderMaterial({
    uniforms: { ...INK }, transparent: true,
    vertexShader: `varying float vDepth;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uInkCol; varying float vDepth;
      void main() { gl_FragColor = vec4(uInkCol, 1.0 - smoothstep(50.0, 130.0, vDepth)); }`,
  });
}
