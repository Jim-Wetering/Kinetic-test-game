import * as THREE from 'three';
import { renderer, scene, cam } from './scene.js';
import { NOISE, PAINT_NEAR, INK_NEAR, INK_FAR } from './ink.js';

// ---------------------------------------------------------------- ink post pass
// the world renders into a target with a depth texture, the viewmodel into its own transparent target, then one
// full-screen pass smooths edges (FXAA), draws thick, rough black brush lines at depth creases and silhouettes,
// lays the arms on top, and finishes with paper grain and an ink-wash vignette. the brush's swell and ragged edge
// are looked up in world space, so a stroke keeps its shape as you move instead of crawling or flickering
const target = () => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const rtWorld = target(), rtView = target();
rtWorld.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

export const postU = {
  tWorld: { value: rtWorld.texture }, tDepth: { value: rtWorld.depthTexture }, tView: { value: rtView.texture },
  uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uNear: { value: cam.near }, uFar: { value: cam.far },
  uInk: { value: new THREE.Color(0, 0, 0) }, uPaper: { value: 0.3 }, uPaperCol: { value: new THREE.Color(1, 0.97, 0.9) },
  uVig: { value: 0.5 }, uTime: { value: 0 },
  // brush radius in pixels at 1080p for something right in front of you; it thins out with distance
  uLine: { value: 6.5 },
  // camera-to-world matrix and tan of the half field of view (x, y), to rebuild each pixel's world position
  uCamWorld: { value: new THREE.Matrix4() }, uTan: { value: new THREE.Vector2(1, 1) },
};

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: postU, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tWorld, tDepth, tView;
    uniform vec2 uRes, uTan; uniform float uPx, uNear, uFar, uPaper, uVig, uLine, uTime;
    uniform vec3 uInk, uPaperCol; uniform mat4 uCamWorld;
    varying vec2 vUv;
    ${NOISE}
    float linZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return (uNear * uFar) / (uFar - d * (uFar - uNear));
    }
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
      float c = 1.0 / linZ(uv);
      float xp = 1.0 / linZ(uv + vec2(o.x, 0.0)), xm = 1.0 / linZ(uv - vec2(o.x, 0.0));
      float yp = 1.0 / linZ(uv + vec2(0.0, o.y)), ym = 1.0 / linZ(uv - vec2(0.0, o.y));
      return vec3((abs(xp + xm - 2.0 * c) + abs(yp + ym - 2.0 * c)) / c, xp - xm, yp - ym);
    }
    vec3 fxaa(vec2 uv, vec2 px) {
      vec3 nw = texture2D(tWorld, uv + vec2(-1.0, -1.0) * px).rgb, ne = texture2D(tWorld, uv + vec2(1.0, -1.0) * px).rgb;
      vec3 sw = texture2D(tWorld, uv + vec2(-1.0, 1.0) * px).rgb, se = texture2D(tWorld, uv + vec2(1.0, 1.0) * px).rgb;
      vec3 m = texture2D(tWorld, uv).rgb, L = vec3(0.299, 0.587, 0.114);
      float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
      float lo = min(lm, min(min(lnw, lne), min(lsw, lse))), hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
      vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
      float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * px;
      vec3 a = 0.5 * (texture2D(tWorld, uv - dir / 6.0).rgb + texture2D(tWorld, uv + dir / 6.0).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tWorld, uv - dir * 0.5).rgb + texture2D(tWorld, uv + dir * 0.5).rgb);
      float lb = dot(b, L);
      return (lb < lo || lb > hi) ? a : b;
    }
    void main() {
      vec2 px = 1.0 / uRes, sp = vUv * uRes / uPx;
      vec3 col = fxaa(vUv, px);
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
      vec3 wp = (uCamWorld * vec4((vUv * 2.0 - 1.0) * uTan * zn, -zn, 1.0)).xyz;
      // metres per pixel at that depth: world-space texture finer than a few pixels is faded out, never drawn
      float wpx = zn * 2.0 * uTan.y / uRes.y;
      // world alpha marks what to leave alone: below 1 where a brush ring is painted over the scene (see
      // brushRingMat), 0.5 on clouds, which are soft paint already. rings stay out of the ink, so they never get
      // outlined, and neither gets the frayed tops below
      float solid = texture2D(tWorld, vUv).a, canvas = step(0.99, solid);
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
        float own = step(abs(linZ(uvF) - zn) / zn, 0.05) * step(0.99, sF.a) * step(0.5, reach);
        col = mix(col, sF.rgb, own * paint);
      }
      // brush radius: fat up close and finer into the distance, swelling and thinning along the stroke
      float swell = noise(wp.xz * 0.5 + wp.y * 0.37) * 0.7 + noise(wp.xz * 0.13 - wp.y * 0.11) * 0.3;
      float R = uLine * (uRes.y / 1080.0) * mix(1.0, 0.45, smoothstep(30.0, 350.0, zn)) * (0.3 + 1.5 * swell);
      vec2 o = px * R;
      // painted by hand, not traced: the stroke drifts a few pixels off the true edge and back, slowly along its
      // length, so it wobbles, overshoots and sometimes leaves a sliver of the shape outside it
      vec2 drift = (vec2(noise(wp.xz * 0.21 + wp.y * 0.17), noise(wp.zy * 0.19 - wp.x * 0.23 + 4.0)) - 0.5)
                 * px * 6.0 * k1080 * mix(1.0, 0.3, smoothstep(30.0, 250.0, zn));
      vec2 uvE = vUv + drift;
      // the edge test is taken at two points a fraction of a pixel apart and averaged, so a stroke's edge covers
      // pixels partially instead of snapping on and off as the camera moves
      vec3 k1 = crease(uvE + px * vec2(0.3, 0.15), o), k2 = crease(uvE - px * vec2(0.3, 0.15), o);
      float lr = 0.5 * (k1.x + k2.x);
      // a ragged threshold gives the stroke a rough, bristly edge, and dry flecks of ink feather off it. each layer
      // of that detail is only used while it's several pixels across, so it never sparkles in the distance, and
      // every cut-off is a soft ramp rather than a hard step
      float k26 = 1.0 - smoothstep(0.12, 0.3, 2.6 * wpx), k9 = 1.0 - smoothstep(0.12, 0.3, 9.0 * wpx);
      float rough = 0.5 + (noise(wp.xy * 0.8 + wp.z * 0.6) - 0.5) * 0.6 + (noise(wp.xy * 2.6 + wp.z * 1.9) - 0.5) * 0.7 * k26
                  + (noise(wp.xy * 9.0 - wp.z * 7.3) - 0.5) * 0.45 * k9;
      float t = 0.014 * (0.5 + rough);
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
      edge *= mix(1.0, hairs * (1.0 - bite), (1.0 - core) * mix(0.35, 1.0, dry));
      // where the paint drags thin, the stroke shows grey streaks running along it, and the shape shows through
      // a little; the core stays solid black
      float drag = (1.0 - core) * (1.0 - smoothstep(0.35, 0.65, bristles(eAcross, eAlong, zn, 3.5))) * mix(0.3, 0.8, dry);
      vec3 inkCol = mix(uInk, mix(uInk, vec3(0.62), 0.55), drag);
      // everything keeps its black ink outline; far off it thins (the brush radius shrinks) and greys a touch
      col = mix(col, inkCol, edge * solid * (1.0 - drag * 0.25) * mix(1.0, 0.8, smoothstep(${INK_NEAR.toFixed(1)}, ${INK_FAR.toFixed(1)}, zn)));
      vec4 v = texture2D(tView, vUv);
      col = mix(col, v.rgb, v.a);
      // paper: fine grain plus long fibres, multiplied in like ink soaking into washi
      float grain = noise(sp * 0.9) * 0.5 + noise(sp * 0.23) * 0.3 + noise(vec2(sp.x * 0.05, sp.y * 0.6)) * 0.2;
      col *= mix(vec3(1.0), uPaperCol * (0.9 + 0.16 * grain), uPaper);
      // ink-wash vignette with a ragged, brushed rim
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
      float vig = length(q) + (noise(sp / 60.0) - 0.5) * 0.12;
      col = mix(col, uInk, smoothstep(0.62, 1.05, vig) * uVig);
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
quad.frustumCulled = false;
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(quad);

export function setPostSize(w, h) {
  const pr = renderer.getPixelRatio();
  rtWorld.setSize(w * pr, h * pr); rtView.setSize(w * pr, h * pr);
  postU.uRes.value.set(w * pr, h * pr); postU.uPx.value = pr;
}

// renderView draws the viewmodel into the target it's given
export function renderFrame(t, renderView) {
  postU.uTime.value = t;
  renderer.setRenderTarget(rtWorld); renderer.render(scene, cam);
  // after the render, so the matrix and the speed FOV kick match the depth just drawn
  const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  postU.uTan.value.set(ty * cam.aspect, ty); postU.uCamWorld.value.copy(cam.matrixWorld);
  renderer.setRenderTarget(rtView); renderer.setClearColor(0x000000, 0); renderer.clear(); renderView();
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
