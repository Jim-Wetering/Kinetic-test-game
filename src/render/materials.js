import * as THREE from 'three';
import { scene } from './scene.js';
import { inkMat, inkHullMat, inkLineMat, NOISE } from './ink.js';

// ---------------------------------------------------------------- ink materials
// polygon offset pushes faces back so the crease lines always win the depth test
export const matToon = inkMat({ vertexColors: true, polygonOffset: true, grime: true });
// roof copings: a pale dry-brush highlight stroke along each edge, one material per direction of the bristles
export const matCopeX = inkMat({ vertexColors: true, polygonOffset: true, streak: 'x', grime: true });
export const matCopeZ = inkMat({ vertexColors: true, polygonOffset: true, streak: 'z', grime: true });
// building walls: the same ink shading plus a window grid
export const matFacade = inkMat({ vertexColors: true, polygonOffset: true, facade: true, grime: true });
// back-face hulls: the thick brush outline around every shape. the batched world's hulls and ink lines turn
// into paint with distance; the viewmodel and hook blocks are always close, so they keep plain ink
export const matHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
export const matWorldHull = inkHullMat();
export const matEdge = inkLineMat();
export const matGround = inkMat({ color: 0x667788, grime: true });
// grapple points are crane hooks: a yellow hook block, with a thin target ring so they still read from afar
export const matAnchor = inkMat({ color: 0xe0a526 });

// ---------------------------------------------------------------- brush rings
// checkpoint and hook rings are painted circles (enso): one stroke of a loaded brush that lands heavy, runs round
// with torn edges, splits into hairs as it runs dry, and lifts off just short of closing. they don't write depth,
// so the outline pass never inks around them
export function brushRingGeo(r, w) {
  const g = new THREE.RingGeometry(r - w * 2.1, r + w * 2.1, 128, 1);
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
        // a heavy, blunt landing, a full body, then thinning as the brush lifts
        float w = smoothstep(0.0, 0.012, s) * 1.05 * mix(0.35, 1.0, 1.0 - smoothstep(0.6, 0.97, s));
        float tc = t + (noise(vec2(s * 8.0, 7.0)) - 0.5) * 0.3;
        // torn edges: the inner and outer edge each wander at two scales, so they look ripped rather than wavy
        float side = tc > 0.0 ? 1.0 : 5.0;
        float torn = (noise(vec2(s * 40.0, side)) - 0.5) * 0.35 + (noise(vec2(s * 170.0, side + 8.0)) - 0.5) * 0.2;
        float body = 1.0 - smoothstep(w + torn - 0.04, w + torn + 0.02, abs(tc));
        // the tail splits into separate hairs: strands across the stroke, each running out at its own point, with
        // streaky gaps opening between them
        float strand = floor((tc + 1.5) * 4.0);
        float tail = smoothstep(0.55, 0.78, s);
        float strandOn = step(s, 0.74 + 0.23 * hash(vec2(strand, 3.0))) * step(0.42, noise(vec2(s * 30.0, tc * 9.0)));
        body *= mix(1.0, strandOn, tail);
        // a few specks of ink flicked off the brush beside the stroke
        float speck = step(0.965, noise(vec2(s * 260.0, t * 6.0))) * step(abs(tc), w + 0.9) * (1.0 - body);
        float a = max(body, speck) * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor * (0.9 + 0.15 * noise(vec2(s * 6.0, t * 5.0))), a);
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
