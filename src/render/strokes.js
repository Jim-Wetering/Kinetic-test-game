import * as THREE from 'three';
import { INK, NOISE } from './ink.js';

// ---------------------------------------------------------------- brush-stroke towers
// the far skyline isn't built from boxes: each tower is one tall stroke of paint, drawn on an upright card that
// turns to face the camera. the stroke leans and wobbles a little, its sides are torn, its top splits into hairs
// where the brush landed, it carries a few dry dabs for windows, and it's outlined in black ink that runs dry in
// places. the card writes depth, so the city still layers properly; alpha 0.5 tells the post pass it's already
// painted
const TOP = 8; // metres of card above the tower's roof, room for the hairs

const vertexShader = `
  attribute vec2 aCorner, aSize; attribute float aSeed;
  varying vec2 vM, vSize; varying vec3 vC; varying float vSeed, vDepth;
  void main() {
    vec2 toCam = normalize(cameraPosition.xz - position.xz);
    vec3 right = vec3(-toCam.y, 0.0, toCam.x);
    // the card is wider than the tower, so the torn edge and its outline have room
    vec3 p = position + right * aCorner.x * aSize.x * 1.3 + vec3(0.0, aCorner.y * aSize.y, 0.0);
    // metres across from the centre line, and down from the top of the card
    vM = vec2(aCorner.x * aSize.x * 1.3, (1.0 - aCorner.y) * aSize.y);
    vSize = aSize; vC = color; vSeed = aSeed;
    vec4 mv = viewMatrix * vec4(p, 1.0); vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  uniform vec3 uSunCol, uShade, uFogCol, uInkCol, uGlass, uSkyRef, uLitCol;
  uniform float uFogNear, uFogFar, uLit;
  varying vec2 vM, vSize; varying vec3 vC; varying float vSeed, vDepth;
  ${NOISE}
  float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
  // fade a pattern of frequency f (cycles per metre along coord) out before it gets finer than a few pixels
  float keep(float f, float coord) { return 1.0 - smoothstep(0.12, 0.3, f * fwidth(coord)); }
  void main() {
    float W = vSize.x, x = vM.x, y = vM.y, s = vSeed;
    // the centre line drifts as the stroke runs down, and the width swells and thins
    float c = (noise(vec2(y * 0.012 + s, 1.0)) - 0.5) * W * 0.2;
    float hw = W * 0.5 * (0.88 + 0.24 * noise(vec2(y * 0.02, s * 3.0)));
    // torn sides: each side wanders at a coarse and a fine scale
    float sd = x > c ? 1.0 : 7.0;
    hw += (noise(vec2(y * 0.3, s + sd)) - 0.5) * W * 0.09 * keep(0.3, y) + (noise(vec2(y * 1.7, s + sd + 3.0)) - 0.5) * W * 0.035 * keep(1.7, y);
    float side = hw - abs(x - c);                       // > 0 inside, metres to the side edge
    // the top: the brush landed here and splits into strands, each reaching up to its own length
    float sw = W * 0.085, sx = (x - c + hw) / sw, strand = floor(sx);
    float reach = 6.5 * hash(vec2(strand, s)) * step(0.3, hash(vec2(strand, s + 1.0)));
    float topEdge = ${TOP.toFixed(1)} - reach + (noise(vec2(x * 0.7, s + 5.0)) - 0.5) * 1.2;
    float top = y - topEdge;                            // > 0 below the top edge
    // strands are separate hairs: gaps open between them above the solid body
    float gap = mix(1.0, band(fract(sx), 0.12, 0.88, max(0.08, fwidth(sx))), 1.0 - smoothstep(0.15, 0.35, fwidth(sx)));
    float body = step(0.0, side) * step(0.0, top) * mix(gap, 1.0, smoothstep(${TOP.toFixed(1)} - 0.5, ${TOP.toFixed(1)} + 1.5, y));
    if (body < 0.5) discard;
    // paint: one flat colour per tower, lit from a side picked per tower, with a couple of broad streaks
    vec3 col = vC * mix(uShade, uSunCol, 0.55 + 0.4 * hash(vec2(s, 9.0)));
    col *= 0.95 + 0.08 * noise(vec2((x - c) / W * 4.0, y * 0.015 + s));
    // windows: a few big dabs (~11 x 9 m), each five dry hairs side by side, lamplit by night
    vec2 dc = vec2((x - c + hw) / 11.0, (y - ${TOP.toFixed(1)} - 2.0) / 9.0), di = floor(dc), df = fract(dc);
    float on = step(0.6, hash(di + s * 3.7)) * step(0.0, y - ${TOP.toFixed(1)} - 2.0) * step(1.5, side);
    float hy = (df.y - 0.2) / 0.55 * 5.0, hRow = floor(hy), hf = fract(hy);
    float hx = (df.x - 0.08 - hash(di + hRow * 2.9) * 0.08) / (0.4 + 0.5 * hash(di + hRow * 1.7 + 4.2));
    float hairs = step(0.0, hy) * step(hy, 5.0) * band(hf, 0.1, 0.9, max(0.06, fwidth(hy))) * band(hx, 0.0, 1.0, max(0.04, fwidth(hx)));
    hairs *= step(smoothstep(0.5, 1.0, hx) * 0.85, noise(vec2(hx * 6.0, hRow * 3.1 + di.x)));
    float lamp = step(1.0 - min(1.0, uLit * 1.6), hash(di + 2.3));
    vec3 dab = mix(mix(uGlass, uSkyRef, 0.35), uLitCol, lamp);
    col = mix(col, dab, on * hairs);
    // the black ink outline: a band a few pixels wide inside the edge, never thinner than the stroke allows, that
    // runs dry into broken hairs along stretches of it
    float ow = max(fwidth(x) * 4.5, W * 0.05);
    float rim = 1.0 - smoothstep(ow * 0.7, ow, min(side, top));
    rim *= mix(1.0, step(0.35, noise(vec2(y * 0.6 + x * 0.6, s + 11.0))), smoothstep(0.4, 0.7, noise(vec2(y * 0.05, s + 13.0))) * keep(0.6, y));
    // haze washes the paint out more than the ink, so the outline still reads far off
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(mix(col, uFogCol, fog), mix(uInkCol, uFogCol, fog * 0.55), rim);
    gl_FragColor = vec4(col, 0.5);
  }`;

const material = new THREE.ShaderMaterial({ uniforms: { ...INK }, vertexShader, fragmentShader, vertexColors: true, side: THREE.DoubleSide });

export class BrushTowers {
  constructor() { this.p = []; this.corner = []; this.size = []; this.seed = []; this.c = []; }
  // a tower standing at (x, z), from y0 up to its roof at top, w metres wide
  add(x, z, y0, top, w, color, seed) {
    const h = top - y0 + TOP;
    for (const [cx, cy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]]) {
      this.p.push(x, y0, z); this.corner.push(cx, cy); this.size.push(w, h); this.seed.push(seed); this.c.push(color.r, color.g, color.b);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(this.corner, 2));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false; // the cards turn in the vertex shader, so the stored bounds don't hold
    return m;
  }
}
