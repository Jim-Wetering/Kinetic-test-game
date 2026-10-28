import * as THREE from 'three';
import { scene } from './scene.js';
import { inkMat, inkHullMat, inkLineMat, NOISE } from './ink.js';

// ---------------------------------------------------------------- ink materials
// polygon offset pushes faces back so the crease lines always win the depth test
export const matToon = inkMat({ vertexColors: true, polygonOffset: true });
// building walls: the same ink shading plus a window grid
export const matFacade = inkMat({ vertexColors: true, polygonOffset: true, facade: true });
// clouds stay bright and puffy: only a soft shade on the underside
export const matCloud = inkMat({ vertexColors: true, fog: false, flat: 0.65 });
// back-face hulls: the thick brush outline around every shape. the batched world's hulls and ink lines turn
// into paint with distance; the viewmodel and hook blocks are always close, so they keep plain ink
export const matHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
export const matWorldHull = inkHullMat();
export const matCloudHull = inkHullMat({ fog: false });
export const matEdge = inkLineMat();
export const matGround = inkMat({ color: 0x667788 });
// grapple points are crane hooks: a yellow hook block, with a thin target ring so they still read from afar
export const matAnchor = inkMat({ color: 0xe0a526 });

// ---------------------------------------------------------------- brush rings
// checkpoint and hook rings are painted circles (enso): one stroke of a loaded brush that lands fat, runs round
// thinning, its bristles drying into streaks and gaps, and lifts off just short of closing. they don't write
// depth, so the outline pass never inks around them
export function brushRingGeo(r, w) {
  const g = new THREE.RingGeometry(r - w * 1.6, r + w * 1.6, 128, 1);
  const n = g.attributes.position.count;
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? w : r)), 2));
  return g;
}
function brushRingMat(color, opacity) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // normal colour blending, but alpha is knocked down where a ring is painted, so the post pass can tell and
    // leaves those pixels out of its smearing and ink lines
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec2 aRing; varying vec2 vP, vRing;
      void main() { vP = position.xy; vRing = aRing; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vP, vRing;
      ${NOISE}
      void main() {
        // s: how far round the stroke (0..1), t: across it, in brush half-widths
        float s = atan(vP.y, vP.x) / 6.28318 + 0.5, t = (length(vP) - vRing.x) / vRing.y;
        float land = smoothstep(0.0, 0.04, s), lift = 1.0 - smoothstep(0.72, 0.96, s);
        float w = (0.6 + 0.5 * land) * mix(0.3, 1.0, lift) * (0.85 + 0.3 * noise(vec2(s * 22.0, 3.1)));
        float tc = t + (noise(vec2(s * 10.0, 7.0)) - 0.5) * 0.5;
        float body = 1.0 - smoothstep(w - 0.15, w + 0.05, abs(tc));
        // bristle streaks along the stroke, opening into dry gaps as the brush runs out of ink
        float bristle = noise(vec2(s * 5.0, t * 7.0));
        float dry = smoothstep(0.4, 0.95, s) * 0.55;
        body *= smoothstep(dry, dry + 0.08, noise(vec2(s * 12.0, t * 5.0)) * 0.75 + bristle * 0.25);
        float a = body * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor * (0.78 + 0.32 * bristle), a);
      }`,
  });
  m.color = m.uniforms.uColor.value; // so game code can read and set .color like a basic material
  return m;
}
export const matAnchorRing = brushRingMat(0xf2ece0, 0.75);
// one vermilion on every level, like a seal stamp. next is the one to run for; later ones are a faint wash; done
// ones nearly dry
export const cpMats = { next: brushRingMat(0xc8382a, 1), later: brushRingMat(0xc8382a, 0.4), done: brushRingMat(0xc8382a, 0.14),
  finish: brushRingMat(0xc8382a, 1) };
// runner-vision beacon over the next checkpoint
export const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 400, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xc8382a, transparent: true, opacity: .3, depthWrite: false, fog: false }));
scene.add(pillar);
