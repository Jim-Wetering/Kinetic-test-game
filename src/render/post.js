import * as THREE from 'three';
import { renderer, scene, cam } from './scene.js';
import { NOISE, PAINT_NEAR, INK_NEAR, INK_FAR } from './ink.js';
import { clamp, load, save } from '../utils.js';

// ---------------------------------------------------------------- ink post pass
// the world renders into a target with a depth texture (the camera nudged by a fraction of a pixel each frame), the
// viewmodel into its own transparent target. then three full-screen passes:
// - ink: thick, rough black brush lines at depth creases and silhouettes. the brush's swell and ragged edge are
//   looked up in world space, so a stroke keeps its shape as you move instead of crawling or flickering
// - temporal anti-aliasing: each frame is blended into a history of the last several, carried along with the
//   camera's movement, so edges and fine detail settle into a steady average instead of stepping from pixel to
//   pixel as the view turns
// - composite: the arms on top, then paper grain and an ink-wash vignette
// the world, the ink and the history are drawn at the render size, which drops below the screen's when the GPU is
// short of time (see dynamic resolution below); the arms, the paper and the final image stay at the screen's size.
// when the render size changes, the history is resampled into the new size rather than thrown away
const target = (type = THREE.UnsignedByteType) => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type });
const rtWorld = target(), rtView = target(), rtInk = target(), rtPaper = target();
rtWorld.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
// half float, so a 10% blend can still move a channel by less than one 8-bit step
let rtHist = [target(THREE.HalfFloatType), target(THREE.HalfFloatType)];

export const postU = {
  tWorld: { value: rtWorld.texture }, tDepth: { value: rtWorld.depthTexture }, tView: { value: rtView.texture },
  uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uNear: { value: cam.near }, uFar: { value: cam.far },
  uInk: { value: new THREE.Color(0, 0, 0) }, uPaper: { value: 0.3 }, uPaperCol: { value: new THREE.Color(1, 0.97, 0.9) },
  uVig: { value: 0.5 }, uTime: { value: 0 },
  // the grade: shadow and highlight tints (split toning), and the theme's complementary scrape colour
  uLo: { value: new THREE.Color(0, 0, 0) }, uHi: { value: new THREE.Color(1, 1, 1) }, uScrape: { value: new THREE.Color(1, 0.5, 0.2) },
  // brush radius in pixels at 1080p for something right in front of you; it thins out with distance
  uLine: { value: 5.0 },
  // camera-to-world matrix and tan of the half field of view (x, y), to rebuild each pixel's world position, and
  // this frame's sub-pixel camera nudge in clip space
  uCamWorld: { value: new THREE.Matrix4() }, uTan: { value: new THREE.Vector2(1, 1) }, uJit: { value: new THREE.Vector2() },
  // temporal pass: this frame's inked image, last frame's history and the matrix that projects into last frame's
  // view; uReset drops the history (a level load, a respawn, a resize)
  tCur: { value: rtInk.texture }, tHist: { value: null }, uPrevVP: { value: new THREE.Matrix4() }, uReset: { value: 1 },
  // the screen's size in pixels (uRes is the render size)
  tPaper: { value: rtPaper.texture }, uOut: { value: new THREE.Vector2(1, 1) },
};

const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// shared by the passes that read depth: reciprocal depth, built from 1 - d, which is exact in a float for a 24-bit
// depth, where uFar - d * (uFar - uNear) cancels two numbers near 2400 and keeps only a few digits
const DEPTH = `
  float invZ(vec2 uv) { return 1.0 / uFar + (1.0 - texture2D(tDepth, uv).x) * (1.0 / uNear - 1.0 / uFar); }
  float linZ(vec2 uv) { return 1.0 / invZ(uv); }`;
const pass = (fragmentShader) => new THREE.ShaderMaterial({ uniforms: postU, depthTest: false, depthWrite: false, vertexShader, fragmentShader });

const inkMat = pass(`
    uniform sampler2D tWorld, tDepth;
    uniform vec2 uRes, uTan, uJit; uniform float uNear, uFar, uLine;
    uniform vec3 uInk; uniform mat4 uCamWorld;
    varying vec2 vUv;
    ${NOISE}
    ${DEPTH}
    // bristle streaks: world-anchored noise that varies fast across a stroke and slowly along it, so it reads as
    // parallel hairs of a dry brush. its world scale snaps to octaves by distance and crossfades between them, which
    // keeps the hairs about pxApart pixels apart near or far without shimmering as you move
    float bristles(float across, float along, float z, float pxApart) {
      float worldPx = z * 2.0 * uTan.y / uRes.y;
      float L = log2(max(pxApart * worldPx, 1e-4) / 0.02), l0 = floor(L);
      float p0 = 0.02 * exp2(l0), p1 = p0 * 2.0;
      float n0 = noise(vec2(across / p0, along / (p0 * 16.0)));
      float n1 = noise(vec2(across / p1 + 17.0, along / (p1 * 16.0) + 5.0));
      return mix(n0, n1, L - l0);
    }
    // the edge test at one point: reciprocal depth is affine across any plane in screen space, so its second
    // difference over a stencil of radius o is ~0 on flat faces and spikes at creases and silhouettes (a wide
    // stencil gives a wide stroke). returns that spike relative to depth, and the depth gradient (which way the
    // edge runs)
    vec3 crease(vec2 uv, vec2 o) {
      float c = invZ(uv);
      float xp = invZ(uv + vec2(o.x, 0.0)), xm = invZ(uv - vec2(o.x, 0.0));
      float yp = invZ(uv + vec2(0.0, o.y)), ym = invZ(uv - vec2(0.0, o.y));
      return vec3((abs(xp + xm - 2.0 * c) + abs(yp + ym - 2.0 * c)) / c, xp - xm, yp - ym);
    }
    void main() {
      vec2 px = 1.0 / uRes;
      vec3 col = texture2D(tWorld, vUv).rgb;
      // where this pixel is in the world: the nearest surface close by, so the strip of sky beside a silhouette
      // borrows the object's position and its stroke stays anchored too. the search reaches as far as a stroke is
      // wide: otherwise the outer part of a stroke would take its texture from whatever is behind, and flip
      // between the two as the edge moves across it (that crawls)
      float z0 = linZ(vUv), zn = z0;
      for (int i = 0; i < 2; i++) {
        vec2 r = px * (i == 0 ? 6.0 : 14.0) * (uRes.y / 1080.0);
        zn = min(zn, min(min(linZ(vUv + vec2(r.x, 0.0)), linZ(vUv - vec2(r.x, 0.0))),
                         min(linZ(vUv + vec2(0.0, r.y)), linZ(vUv - vec2(0.0, r.y)))));
      }
      // (the ray through this pixel without this frame's nudge, so the world position doesn't jitter with it)
      vec3 wp = (uCamWorld * vec4((vUv * 2.0 - 1.0 + uJit) * uTan * zn, -zn, 1.0)).xyz;
      // metres per pixel at that depth: world-space texture finer than a few pixels is faded out, never drawn
      float wpx = zn * 2.0 * uTan.y / uRes.y;
      // world alpha marks what to leave alone: below 1 where a brush ring is painted over the scene (see
      // brushRingMat), 0.5 on the brush-stroke skyline, which is soft paint already. rings stay out of the ink, so they never get
      // outlined, and neither gets the frayed tops below
      float solid = texture2D(tWorld, vUv).a;
      float k1080 = uRes.y / 1080.0;
      // far away, the facade shader has already painted towers as one flat colour with a few dabs for windows. all
      // that's left is the top of the stroke: just above a far silhouette, a few chunky hairs of the brush overshoot
      // into whatever is behind, each to its own length, so tops fray like a dry brush lifting off. a hair is only
      // drawn when the colour it reaches down for belongs to that same nearer surface. world-anchored, so it holds
      // still as you move
      float paint = smoothstep(${PAINT_NEAR.toFixed(1)}, ${(PAINT_NEAR + 140).toFixed(1)}, zn) * step(zn, 1900.0);
      if (paint > 0.0 && z0 / zn > 1.2) {
        float hairC = bristles(wp.x + wp.z, wp.y, zn, 6.0);
        float reach = smoothstep(0.5, 1.0, hairC) * 14.0 * k1080;
        vec2 uvF = vUv - vec2(0.0, px.y * reach);
        vec4 sF = texture2D(tWorld, uvF);
        // soft ramps, not hard cut-offs: a hair half on and half off holds still as the silhouette slides by a pixel
        float own = smoothstep(0.08, 0.03, abs(linZ(uvF) - zn) / zn) * step(0.99, sF.a) * smoothstep(0.5, 3.0, reach);
        col = mix(col, sF.rgb, own * paint);
      }
      // brush radius: fat up close and finer into the distance, swelling and thinning along the stroke
      float swell = noise(wp.xz * 0.5 + wp.y * 0.37) * 0.7 + noise(wp.xz * 0.13 - wp.y * 0.11) * 0.3;
      float R = uLine * (uRes.y / 1080.0) * mix(1.0, 0.45, smoothstep(30.0, 350.0, zn)) * (0.3 + 1.5 * swell);
      // a whole number of texels: depth is read unfiltered, so a fractional offset lands on the nearest texel on
      // each side, unevenly, and a flat roof seen at a low angle reads as bent. that showed as specks of ink
      // swimming over roofs as you ran
      vec2 o = px * max(1.0, floor(R + 0.5));
      // painted by hand, not traced: the stroke drifts a few pixels off the true edge and back, slowly along its
      // length, so it wobbles, overshoots and sometimes leaves a sliver of the shape outside it
      vec2 drift = (vec2(noise(wp.xz * 0.21 + wp.y * 0.17), noise(wp.zy * 0.19 - wp.x * 0.23 + 4.0)) - 0.5)
                 * px * 6.0 * k1080 * mix(1.0, 0.3, smoothstep(30.0, 250.0, zn));
      vec2 uvE = vUv + drift;
      // the edge test is taken at two points a fraction of a pixel apart and averaged, so a stroke's edge covers
      // pixels partially instead of snapping on and off as the camera moves
      vec3 k1 = crease(uvE + px * vec2(0.3, 0.15), o), k2 = crease(uvE - px * vec2(0.3, 0.15), o);
      // most of the screen is nowhere near an edge, and the brush texture below is the costly part of this pass:
      // below 0.001 not even the lowest threshold the roughness can reach is crossed, so there's nothing to draw
      if (max(k1.x, k2.x) > 0.001) {
        float lr = 0.5 * (k1.x + k2.x);
        // a ragged threshold gives the stroke a rough, bristly edge, and dry flecks of ink feather off it. each
        // layer of that detail is only used while it's several pixels across, so it never sparkles in the
        // distance, and every cut-off is a soft ramp rather than a hard step
        float k26 = 1.0 - smoothstep(0.12, 0.3, 2.6 * wpx), k9 = 1.0 - smoothstep(0.12, 0.3, 9.0 * wpx);
        float rough = 0.5 + (noise(wp.xy * 0.8 + wp.z * 0.6) - 0.5) * 0.6 + (noise(wp.xy * 2.6 + wp.z * 1.9) - 0.5) * 0.7 * k26
                    + (noise(wp.xy * 9.0 - wp.z * 7.3) - 0.5) * 0.45 * k9;
        // never below what the depth buffer's own steps can produce on a flat face (they grow with distance), or
        // the roughest parts of the threshold would ink plain roof
        float t = max(0.014 * (0.5 + rough), 5e-5 * zn);
        float edge = 0.5 * (smoothstep(t * 0.85, t * 1.6, k1.x) + smoothstep(t * 0.85, t * 1.6, k2.x));
        float fleck = smoothstep(0.66, 0.76, noise(wp.xy * 6.5 + wp.z * 5.3)) * (1.0 - smoothstep(0.12, 0.3, 6.5 * wpx));
        edge = max(edge, smoothstep(t * 0.6, t * 0.85, lr) * fleck);
        // like a loaded brush on paper: the middle of the stroke is solid ink, and only its thinner fringe goes
        // rough. there, stretches run dry and break into parallel hairs, and the edge is torn with irregular bites.
        // hairs run along the edge: for an upright edge they vary across in the horizontal, for a level one in the
        // vertical
        float core = smoothstep(t * 1.6, t * 3.5, lr);
        bool upright = abs(k1.y + k2.y) > abs(k1.z + k2.z);
        float eAcross = upright ? wp.x + wp.z : wp.y, eAlong = upright ? wp.y : wp.x + wp.z;
        float dry = smoothstep(0.3, 0.7, noise(vec2(eAlong * 0.12, eAcross * 0.05 + 3.0)));
        float hairs = smoothstep(0.24, 0.56, bristles(eAcross, eAlong, zn, 2.2));
        float bite = smoothstep(0.7, 0.8, bristles(eAlong, eAcross, zn, 14.0));
        edge *= mix(1.0, hairs * (1.0 - bite), (1.0 - core) * mix(0.6, 1.0, dry));
        // where the paint drags thin, the stroke shows grey streaks running along it, and the shape shows through
        // a little; the core stays solid black
        float drag = (1.0 - core) * (1.0 - smoothstep(0.35, 0.65, bristles(eAcross, eAlong, zn, 3.5))) * mix(0.3, 0.8, dry);
        vec3 inkCol = mix(uInk, mix(uInk, vec3(0.62), 0.55), drag);
        // everything keeps its black ink outline; far off it thins (the brush radius shrinks) and greys a touch
        col = mix(col, inkCol, edge * solid * (1.0 - drag * 0.25) * mix(1.0, 0.8, smoothstep(${INK_NEAR.toFixed(1)}, ${INK_FAR.toFixed(1)}, zn)));
      }
      gl_FragColor = vec4(col, 1.0);
    }`);

const taaMat = pass(`
    uniform sampler2D tCur, tHist, tDepth;
    uniform vec2 uRes, uTan, uJit; uniform float uNear, uFar, uReset;
    uniform mat4 uCamWorld, uPrevVP;
    varying vec2 vUv;
    ${DEPTH}
    // the history read with a Catmull-Rom filter (five bilinear taps): plain bilinear softens the image a little
    // every frame it's carried along, and that blur would build up
    vec3 history(vec2 uv) {
      vec2 sp = uv * uRes, t1 = floor(sp - 0.5) + 0.5, f = sp - t1;
      vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
      vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
      vec2 w12 = w1 + w2, t0 = (t1 - 1.0) / uRes, t3 = (t1 + 2.0) / uRes, t12 = (t1 + w2 / w12) / uRes;
      vec3 c = texture2D(tHist, vec2(t12.x, t0.y)).rgb * w12.x * w0.y + texture2D(tHist, vec2(t0.x, t12.y)).rgb * w0.x * w12.y
             + texture2D(tHist, t12).rgb * w12.x * w12.y + texture2D(tHist, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
             + texture2D(tHist, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
      float w = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
      return max(c / w, 0.0);
    }
    void main() {
      vec2 px = 1.0 / uRes;
      vec3 c = texture2D(tCur, vUv).rgb, lo = c, hi = c;
      // the range of colours around this pixel now. the history is clamped into it, so whatever has changed (a
      // surface that was hidden, something moving) can't leave a ghost behind
      float zc = linZ(vUv);
      // (the four neighbours: the corners add little but cost as much again)
      for (int i = 0; i < 4; i++) {
        vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0) * px;
        vec3 s = texture2D(tCur, vUv + o).rgb; lo = min(lo, s); hi = max(hi, s);
        // the nearest depth around, so a pixel on the edge of something follows that thing rather than the background
        zc = min(zc, linZ(vUv + o));
      }
      // where this pixel's surface was on screen last frame
      vec3 world = (uCamWorld * vec4((vUv * 2.0 - 1.0 + uJit) * uTan * zc, -zc, 1.0)).xyz;
      vec4 pc = uPrevVP * vec4(world, 1.0);
      vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      float valid = step(0.0, pc.w) * step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0) * (1.0 - uReset);
      vec3 h = clamp(history(puv), lo, hi);
      // about a tenth of each new frame goes in, so the last ten or so are averaged; a little more while the view
      // is sweeping fast, where blur would show and there's less to steady
      float speed = length((puv - vUv) * uRes);
      float a = mix(0.1, 0.25, smoothstep(4.0, 40.0, speed));
      // each side weighted down by its brightness, so a lone bright pixel (a lit window, a glint) a few pixels
      // across can't flash in and out of the average as it lands on and off the pixel grid
      float wc = a / (1.0 + dot(c, vec3(0.3, 0.59, 0.11))), wh = (1.0 - a) / (1.0 + dot(h, vec3(0.3, 0.59, 0.11)));
      gl_FragColor = vec4(mix(c, (c * wc + h * wh) / (wc + wh), valid), 1.0);
    }`);

// the canvas grain, the vignette's ragged rim and the grunge laid over the picture are fixed to the screen, so
// they're painted once per window size into a texture rather than worked out again every frame: grain in red,
// vignette in green, dark grunge (dry-brush scrapes, splatter) in blue, pale grunge (scratches, a dragged lighter
// brush) in alpha
const paperMat = pass(`
    uniform vec2 uOut; uniform float uPx;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 sp = vUv * uOut / uPx;
      // canvas: fine grain plus long fibres
      float grain = noise(sp * 0.9) * 0.5 + noise(sp * 0.23) * 0.3 + noise(vec2(sp.x * 0.05, sp.y * 0.6)) * 0.2;
      // the same layout at any resolution: units of a 1080-pixel-tall screen
      vec2 p = vec2(vUv.x * uOut.x / uOut.y, vUv.y) * 1080.0;
      vec2 q = vUv - 0.5; q.x *= uOut.x / uOut.y;
      // a brushed vignette: the rim is dragged sideways in streaks, like the edge of a rough wash
      float vig = length(q) + (noise(sp / 60.0) - 0.5) * 0.12 + (noise(vec2(p.x / 400.0, p.y / 9.0)) - 0.5) * 0.1;
      // the grunge gathers toward the edges and corners; the middle, where you're looking, stays mostly clean
      float rim = smoothstep(0.32, 0.8, length(q * vec2(0.85, 1.15)));
      // dry-brush scrapes: wide horizontal drags of a near-dry brush, broken into hairs and gaps along their length
      float drag = smoothstep(0.55, 0.75, noise(vec2(p.x / 520.0, p.y / 70.0) + 3.0));
      float hairs = smoothstep(0.5, 0.7, noise(vec2(p.x / 180.0, p.y / 1.6))) * smoothstep(0.35, 0.6, noise(vec2(p.x / 60.0, p.y / 6.0) + 9.0));
      float scrape = drag * hairs;
      // splatter: clusters of flicked drops, a few big and many small
      float cluster = smoothstep(0.62, 0.85, noise(p / 220.0 + 17.0));
      float drops = smoothstep(0.84, 0.88, noise(p / 4.0)) + smoothstep(0.88, 0.92, noise(p / 11.0 + 5.0));
      float splat = min(1.0, drops) * cluster;
      // scratches: thin, broken vertical scores through the paint
      float col = floor(p.x / 3.0);
      float scratch = step(0.994, hash(vec2(col, 2.0))) * smoothstep(0.55, 0.75, noise(vec2(col, p.y / 120.0)));
      // pale: a lighter brush dragged across the top in a few places
      float pale = smoothstep(0.62, 0.8, noise(vec2(p.x / 700.0, p.y / 50.0) + 41.0)) * hairs;
      gl_FragColor = vec4(grain, smoothstep(0.55, 1.0, vig), clamp((scrape * 0.8 * mix(0.1, 1.0, rim) + splat * rim), 0.0, 1.0),
        clamp((scratch * 0.6 + pale * 0.8) * mix(0.2, 1.0, rim), 0.0, 1.0));
    }`);

const compMat = pass(`
    uniform sampler2D tHist, tView, tPaper;
    uniform float uPaper, uVig;
    uniform vec3 uInk, uPaperCol, uLo, uHi, uScrape;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tHist, vUv).rgb;
      vec4 pv = texture2D(tPaper, vUv);
      // the grade, on the world only: a little more contrast, then split toning, where part of the colour is swapped
      // for its brightness tinted cool in the shadows and warm in the light, so the whole picture shares one dirty
      // palette
      vec3 W = vec3(0.3, 0.59, 0.11);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
      float L = dot(col, W);
      vec3 lo = uLo / max(dot(uLo, W), 0.01), hi = uHi / max(dot(uHi, W), 0.01);
      col = mix(col, L * mix(lo, hi, smoothstep(0.08, 0.7, L)), 0.28);
      // the grunge over it: dark dry-brush scrapes and splatter, then pale scratches and drags in a mix of the
      // canvas and the theme's scrape colour
      col = mix(col, uInk, pv.b * 0.6);
      col = mix(col, mix(uPaperCol * 0.9, uScrape, 0.45), pv.a * 0.4);
      // the arms and legs go on top, untouched by any of that
      vec4 v = texture2D(tView, vUv);
      col = mix(col, v.rgb, v.a);
      // the canvas multiplied in, then the vignette
      col *= mix(vec3(1.0), uPaperCol * (0.9 + 0.16 * pv.r), uPaper);
      col = mix(col, uInk, pv.g * uVig);
      gl_FragColor = vec4(col, 1.0);
    }`);

// carries the history over into a new render size
const copyMat = pass(`uniform sampler2D tHist; varying vec2 vUv; void main() { gl_FragColor = texture2D(tHist, vUv); }`);

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkMat);
quad.frustumCulled = false;
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(quad);

// the screen's own pixel density, as scene.js set it; the output drops below it only on a slow GPU (see below)
const FULL = renderer.getPixelRatio();
export function setPostSize(w, h) {
  const pr = FULL * Math.min(1, dyn.scale / OUT_KNEE);
  if (renderer.getPixelRatio() !== pr) { renderer.setPixelRatio(pr); renderer.setSize(w, h); }
  const ow = Math.round(w * pr), oh = Math.round(h * pr);
  for (const rt of [rtView, rtPaper]) rt.setSize(ow, oh);
  postU.uOut.value.set(ow, oh); postU.uPx.value = pr;
  sizeRender(w, h);
  quad.material = paperMat; renderer.setRenderTarget(rtPaper); renderer.render(postScene, postCam); renderer.setRenderTarget(null);
}
// the world, ink and history targets at the current fraction of the screen's size. the history moves into a fresh
// pair of targets through a resampling pass, since resizing a target clears it
function sizeRender(w, h) {
  const rw = Math.max(1, Math.round(w * FULL * dyn.scale)), rh = Math.max(1, Math.round(h * FULL * dyn.scale));
  rtWorld.setSize(rw, rh); rtInk.setSize(rw, rh); postU.uRes.value.set(rw, rh);
  const old = rtHist;
  rtHist = [target(THREE.HalfFloatType), target(THREE.HalfFloatType)];
  rtHist.forEach((rt) => rt.setSize(rw, rh));
  postU.tHist.value = old[cur].texture; quad.material = copyMat;
  renderer.setRenderTarget(rtHist[cur]); renderer.render(postScene, postCam); renderer.setRenderTarget(null);
  old.forEach((rt) => rt.dispose());
}

// sub-pixel camera nudges: the first 8 points of the Halton (2, 3) sequence, spread evenly over a pixel
const JITTER = Array.from({ length: 8 }, (_, i) => {
  const h = (b, n) => { let f = 1, r = 0; for (n += 1; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); } return r; };
  return [h(2, i) - 0.5, h(3, i) - 0.5];
});
let frame = 0, cur = 0;
const prevPos = new THREE.Vector3();

// ---------------------------------------------------------------- dynamic resolution
// holds 60 fps by drawing the world at a little under the screen's resolution when the GPU can't keep up (a laptop
// running hot or on battery slows down a lot), and back up when it can; the temporal pass fills the detail back in.
// the GPU's own frame time is read where the browser allows it, since at a capped 60 fps the time between frames
// can't tell how much room there is to spare. below OUT_KNEE the final image (the arms, the composite, and the
// canvas the browser has to put on screen) shrinks along with it: those cost the same at any render size, and on
// a weak GPU they'd be a good share of the frame on their own
// the budget leaves a clear margin under a 60 Hz frame (16.7 ms), and fits a frame inside two refreshes of a 144 or
// 165 Hz screen (13.9, 12.1 ms): a frame that only just fits keeps slipping to the next refresh and back, and the
// uneven pacing reads as stutter even when the average is over 60
const MIN_SCALE = 0.35, OUT_KNEE = 0.7, BUDGET = 11; // ms of GPU time to aim under
const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
// it starts from where it settled last time, so a slow machine doesn't stutter through its first second
// ceil: the highest scale to try going back up to, lowered when a scale turns out to stutter (see below)
const dyn = { scale: clamp(load('renderScale', 1), MIN_SCALE, 1), pending: [], gpu: [], dts: [], last: 0, hold: 0, ceil: 1, ceilT: 0 };
function setScale(s) { dyn.scale = s; save('renderScale', s); setPostSize(innerWidth, innerHeight); dyn.gpu.length = dyn.dts.length = 0; }
// dev server only (stripped from builds): lets a test pin the render scale (dyn.pin) and read the GPU frame times
if (import.meta.env.DEV) window.__dynres = { dyn, setScale };
function adaptResolution(now) {
  const dt = now - dyn.last; dyn.last = now;
  // a hidden window or a load hitch says nothing about the steady frame rate
  if (dt > 0 && dt < 100 && document.visibilityState === 'visible') dyn.dts.push(dt);
  for (let i = dyn.pending.length - 1; i >= 0; i--) {
    const q = dyn.pending[i];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) dyn.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(q); dyn.pending.splice(i, 1);
  }
  if (dyn.pin) { dyn.gpu.splice(0, dyn.gpu.length - 120); dyn.dts.splice(0, dyn.dts.length - 120); return; }
  if (now < dyn.hold || dyn.dts.length < 30) return;
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const dtAvg = avg(dyn.dts), gpu = dyn.gpu.length >= 10 ? avg(dyn.gpu) : null;
  // the share of frames that missed a 60 Hz refresh. the GPU timer only sees the game's own drawing; the browser
  // still has to lay the HUD over the canvas and put it on screen, and on a weak GPU that alone can make frames
  // arrive unevenly (one quick, one late) while the timer reads fine. a large canvas is what makes that costly
  const late = dyn.dts.filter((d) => d > 20).length / dyn.dts.length;
  dyn.dts.length = dyn.gpu.length = 0;
  // a scale that stuttered isn't retried for half a minute
  if (now > dyn.ceilT) dyn.ceil = 1;
  if ((gpu !== null && gpu > BUDGET + 1.5) || dtAvg > 18.5 || late > 0.08) {
    // too slow: step down in proportion to how far over, and give it a second to settle
    const want = gpu !== null && gpu > BUDGET ? dyn.scale * Math.sqrt(BUDGET / gpu) : dyn.scale - 0.1;
    if (late > 0.08) { dyn.ceil = dyn.scale - 0.05; dyn.ceilT = now + 30000; }
    if (dyn.scale > MIN_SCALE) setScale(Math.max(MIN_SCALE, Math.min(dyn.scale - 0.05, want)));
    dyn.hold = now + 1000;
  } else if (gpu !== null && late < 0.02 && dyn.scale + 0.05 <= dyn.ceil + 1e-6 && gpu * ((dyn.scale + 0.05) / dyn.scale) ** 2 < BUDGET - 2) {
    // room to spare even one step up: go up, slowly, so it doesn't bounce
    setScale(Math.min(1, dyn.scale + 0.05)); dyn.hold = now + 2000;
  }
}

// renderView draws the viewmodel into the target it's given
export function renderFrame(t, renderView) {
  postU.uTime.value = t;
  adaptResolution(performance.now());
  // one GPU timer around the whole frame, if none is still waiting on its result
  let q = null;
  if (timer && !dyn.noTimer && dyn.pending.length < 3) { q = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, q); }
  const W = postU.uRes.value.x, H = postU.uRes.value.y, [jx, jy] = JITTER[frame++ % JITTER.length];
  // a jump of more than a few metres in one frame is a respawn or a restart: nothing on screen came from last frame
  if (cam.position.distanceTo(prevPos) > 6) postU.uReset.value = 1;
  prevPos.copy(cam.position);
  cam.setViewOffset(W, H, jx, jy, W, H); cam.updateProjectionMatrix();
  renderer.setRenderTarget(rtWorld); renderer.render(scene, cam);
  cam.clearViewOffset(); cam.updateProjectionMatrix();
  // after the render, so the matrix and the speed FOV kick match the depth just drawn
  const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  postU.uTan.value.set(ty * cam.aspect, ty); postU.uCamWorld.value.copy(cam.matrixWorld);
  postU.uJit.value.set(2 * jx / W, -2 * jy / H);
  renderer.setRenderTarget(rtView); renderer.setClearColor(0x000000, 0); renderer.clear(); renderView();
  quad.material = inkMat; renderer.setRenderTarget(rtInk); renderer.render(postScene, postCam);
  const prev = rtHist[cur], next = rtHist[cur ^= 1];
  postU.tHist.value = prev.texture; quad.material = taaMat; renderer.setRenderTarget(next); renderer.render(postScene, postCam);
  postU.tHist.value = next.texture; quad.material = compMat; renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  postU.uReset.value = 0;
  if (q) { gl.endQuery(timer.TIME_ELAPSED_EXT); dyn.pending.push(q); }
  // where this frame's view (without the nudge) projects to, for carrying the history along next frame
  postU.uPrevVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
}
