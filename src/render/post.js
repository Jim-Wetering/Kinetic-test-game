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
  uLine: { value: 4.6 },
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
      // borrows the object's position and its stroke stays anchored too
      float z0 = linZ(vUv), nb = 4.0;
      float zn = min(z0, min(min(linZ(vUv + vec2(px.x * nb, 0.0)), linZ(vUv - vec2(px.x * nb, 0.0))),
                             min(linZ(vUv + vec2(0.0, px.y * nb)), linZ(vUv - vec2(0.0, px.y * nb)))));
      vec3 wp = (uCamWorld * vec4((vUv * 2.0 - 1.0) * uTan * zn, -zn, 1.0)).xyz;
      // far away, paint instead of draw: the image is dragged into short strokes of its own colour. each sample
      // along a stroke only takes colour from the same surface, so shapes hold while windows and detail smear into
      // a few bands of paint; silhouettes go ragged. stroke angle, length and bristles are looked up in world space
      // so the paint stays put as you move. the sky (past 1900 m) is already painted
      // world alpha drops below 1 where a brush ring is painted over the scene (see brushRingMat): those pixels and
      // samples are left out of the smear and the ink, so the rings stay crisp and never get outlined
      float solid = texture2D(tWorld, vUv).a;
      float k1080 = uRes.y / 1080.0;
      float paint = smoothstep(${PAINT_NEAR.toFixed(1)}, ${(PAINT_NEAR + 140).toFixed(1)}, z0) * (1.0 - step(1900.0, z0)) * solid;
      if (paint > 0.0) {
        float ang = (noise(wp.xz * 0.015 + wp.y * 0.02) - 0.5) * 0.8;
        float len = k1080 * mix(2.5, 7.0, smoothstep(${(PAINT_NEAR + 60).toFixed(1)}, 600.0, z0)) * (0.6 + 0.8 * noise(wp.xz * 0.04 - wp.y * 0.05));
        vec2 dir = vec2(cos(ang), sin(ang)) * px * len;
        vec2 jit = (vec2(noise(wp.xy * 0.35 + wp.z * 0.2), noise(wp.zy * 0.35 - wp.x * 0.2)) - 0.5) * px * 5.0 * k1080 * paint;
        vec2 uv0 = vUv + jit;
        float zc = linZ(uv0);
        vec4 s0 = texture2D(tWorld, uv0);
        vec3 acc = s0.rgb * s0.a; float wsum = s0.a;
        for (int i = 1; i <= 4; i++) {
          for (int k = 0; k < 2; k++) {
            vec2 uv2 = uv0 + dir * float(i) * (k == 0 ? 1.0 : -1.0);
            vec4 s2 = texture2D(tWorld, uv2);
            float same = (1.0 - smoothstep(0.02, 0.06, abs(linZ(uv2) - zc) / zc)) * s2.a;
            acc += s2.rgb * same; wsum += same;
          }
        }
        // bristle streaks running with the stroke, coarse enough not to alias far off
        vec3 smear = acc / max(wsum, 1e-3) * (0.9 + 0.18 * noise(vec2((wp.x + wp.z) * 0.03, wp.y * 0.25)));
        col = mix(col, smear, paint * step(0.01, wsum));
      }
      // brush radius: fat up close and finer into the distance, swelling and thinning along the stroke
      float swell = noise(wp.xz * 0.5 + wp.y * 0.37) * 0.7 + noise(wp.xz * 0.13 - wp.y * 0.11) * 0.3;
      float R = uLine * (uRes.y / 1080.0) * mix(1.0, 0.3, smoothstep(20.0, 320.0, zn)) * (0.3 + 1.5 * swell);
      // reciprocal depth is affine across any plane in screen space, so its second difference is ~0 on flat
      // faces and spikes at creases and silhouettes; a wide stencil gives a wide stroke
      vec2 o = px * R;
      float c = 1.0 / z0;
      float lap = abs(1.0 / linZ(vUv + vec2(o.x, 0.0)) + 1.0 / linZ(vUv - vec2(o.x, 0.0)) - 2.0 * c)
                + abs(1.0 / linZ(vUv + vec2(0.0, o.y)) + 1.0 / linZ(vUv - vec2(0.0, o.y)) - 2.0 * c);
      // a ragged threshold gives the stroke a rough, bristly edge, and dry flecks of ink feather off it. the fine
      // detail is only used up close, where it's bigger than a pixel, so it never sparkles in the distance
      float closeUp = 1.0 - smoothstep(12.0, 60.0, zn);
      float rough = mix(noise(wp.xy * 2.6 + wp.z * 1.9), noise(wp.xy * 9.0 - wp.z * 7.3), 0.45 * closeUp);
      float t = 0.014 * (0.5 + rough);
      float edge = smoothstep(t, t * 1.4, lap / c);
      float fleck = step(0.7, noise(wp.xy * 6.5 + wp.z * 5.3)) * closeUp;
      edge = max(edge, smoothstep(t * 0.6, t * 0.8, lap / c) * fleck);
      // black ink is for things close by; far shapes are left as strokes of their own colour
      col = mix(col, uInk, edge * solid * (1.0 - smoothstep(${INK_NEAR.toFixed(1)}, ${INK_FAR.toFixed(1)}, zn)));
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
