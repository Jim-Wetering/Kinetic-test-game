import * as THREE from 'three';
import { renderer, scene, cam } from './scene.js';
import { NOISE, INK } from './ink.js';

// ---------------------------------------------------------------- ink post pass
// the world renders into a target with a depth texture, the viewmodel into its own transparent target, then one
// full-screen pass smooths edges (FXAA), draws brushy ink lines at depth creases and silhouettes, lays the arms on
// top, and finishes with paper grain and an ink-wash vignette
const target = () => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const rtWorld = target(), rtView = target();
rtWorld.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

export const postU = {
  tWorld: { value: rtWorld.texture }, tDepth: { value: rtWorld.depthTexture }, tView: { value: rtView.texture },
  uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uNear: { value: cam.near }, uFar: { value: cam.far },
  uInk: { value: new THREE.Color(0, 0, 0) }, uPaper: { value: 0.3 }, uPaperCol: { value: new THREE.Color(1, 0.97, 0.9) },
  uVig: { value: 0.5 }, uLine: { value: 1 }, uTime: { value: 0 },
};

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: postU, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tWorld, tDepth, tView;
    uniform vec2 uRes; uniform float uPx, uNear, uFar, uPaper, uVig, uLine, uTime;
    uniform vec3 uInk, uPaperCol;
    varying vec2 vUv;
    ${NOISE}
    // reciprocal view depth: affine across any plane in screen space, so its second difference is ~0 on flat
    // faces and spikes at creases and silhouettes
    float invZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
      return 1.0 / z;
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
      // ink lines: the brush width swells and thins along the line, and the whole drawing "boils" a few times a second
      float boil = floor(uTime * 6.0);
      float w = uLine * uPx * (0.9 + 1.1 * noise(sp / 38.0 + boil * 7.13));
      vec2 o = px * w;
      float c = invZ(vUv);
      float lap = abs(invZ(vUv + vec2(o.x, 0.0)) + invZ(vUv - vec2(o.x, 0.0)) - 2.0 * c)
                + abs(invZ(vUv + vec2(0.0, o.y)) + invZ(vUv - vec2(0.0, o.y)) - 2.0 * c);
      float edge = smoothstep(0.012, 0.05, lap / c);
      // dry-brush breaks along the stroke: long, sparse gaps, so lines don't turn into dashes
      edge *= smoothstep(0.08, 0.28, noise(sp / 16.0 + boil * 3.1));
      col = mix(col, uInk, edge * 0.92);
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
  postU.uRes.value.set(w * pr, h * pr); postU.uPx.value = INK.uPx.value = pr;
}

// renderView draws the viewmodel into the target it's given
export function renderFrame(t, renderView) {
  postU.uTime.value = t;
  renderer.setRenderTarget(rtWorld); renderer.render(scene, cam);
  renderer.setRenderTarget(rtView); renderer.setClearColor(0x000000, 0); renderer.clear(); renderView();
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
