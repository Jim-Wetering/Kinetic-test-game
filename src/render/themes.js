import * as THREE from 'three';
import { rng } from '../utils.js';
import { scene, skyU, sun, hemi } from './scene.js';
import { matHull, matEdge, matGround, cpMats, pillar } from './materials.js';

// ---------------------------------------------------------------- themes
const THEMES = {
  day: { top: '#2b78d8', hor: '#e6f6ff', low: '#9fb6c8', fog: '#d8ecfa', sun: [-0.4, 0.8, -0.45], sunCol: '#fff4d0', sunInt: 0.85,
    hemiSky: '#ffffff', hemiGround: '#7a8a99', hemiInt: 0.55, bld: ['#f7f7f4', '#eef1f3', '#e4e9ec', '#fafafa'], roof: '#c3ccd3',
    glass: '#4f9fd0', prop: '#8f9ba6', accent: '#ff3b1f', outline: '#1a1d24', ground: '#6b7a88', cloud: '#ffffff', lines: '20,30,45' },
  gold: { top: '#3d64b8', hor: '#ffd9a0', low: '#c49a7a', fog: '#f6d3a6', sun: [0.6, 0.3, -0.7], sunCol: '#ffe0a0', sunInt: 0.95,
    hemiSky: '#ffe9cc', hemiGround: '#6a5a6a', hemiInt: 0.5, bld: ['#fff3e3', '#f4e6d6', '#efe1cf', '#fffaf2'], roof: '#d6bfa4',
    glass: '#2f6f9a', prop: '#9a8676', accent: '#ff3b1f', outline: '#2a1c18', ground: '#5a4a52', cloud: '#fff1dc', lines: '60,30,20' },
  teal: { top: '#4f8794', hor: '#e3f2ec', low: '#93aaa3', fog: '#d3e6e0', sun: [-0.2, 0.9, 0.3], sunCol: '#ffffff', sunInt: 0.6,
    hemiSky: '#f0fff8', hemiGround: '#5f7570', hemiInt: 0.7, bld: ['#eef3ef', '#dfe8e3', '#e8ede9'], roof: '#b9c7c1',
    glass: '#2c7c78', prop: '#e2ad2a', accent: '#ff4a24', outline: '#14201e', ground: '#5a6e68', cloud: '#f4fbf8', lines: '15,35,30' },
  dusk: { top: '#2f2463', hor: '#ff9fb3', low: '#7a5a86', fog: '#e6a3c0', sun: [0.3, 0.15, -0.9], sunCol: '#ffd0c0', sunInt: 0.8,
    hemiSky: '#ffd6ea', hemiGround: '#4a3a66', hemiInt: 0.55, bld: ['#fbeef5', '#efe2f4', '#f6f0fb'], roof: '#cdb9d6',
    glass: '#6b4fb8', prop: '#8d7aa0', accent: '#ff3b5c', outline: '#1e1430', ground: '#463a5e', cloud: '#ffe6f0', lines: '40,20,60' },
  night: { top: '#0b1030', hor: '#3d4296', low: '#141633', fog: '#2a2d66', sun: [0.35, 0.6, 0.45], sunCol: '#c4d4ff', sunInt: 0.8,
    hemiSky: '#8fa0ff', hemiGround: '#2a2440', hemiInt: 0.65, bld: ['#d9dcf5', '#c9cdef', '#e2e4fa'], roof: '#9da3cf',
    glass: '#ffd36a', prop: '#6f74a8', accent: '#ff3b6b', outline: '#0a0b1a', ground: '#1c1f3a', cloud: '#5a5f9a', lines: '200,215,255' },
  sunset: { top: '#1f1d52', hor: '#ff8f55', low: '#5a2a48', fog: '#e8906a', sun: [-0.25, 0.1, -1], sunCol: '#ffd08a', sunInt: 0.9,
    hemiSky: '#ffc9a8', hemiGround: '#3a2a4a', hemiInt: 0.55, bld: ['#f2ecff', '#e4dcf5', '#ece8fa'], roof: '#bfb3d6',
    glass: '#4a3c9a', prop: '#8a7da8', accent: '#ff3b1f', outline: '#1a1430', ground: '#3a2a44', cloud: '#ffd9c0', lines: '50,20,40' },
};
export const C = (hex) => new THREE.Color(hex);
export const pick = (arr) => arr[(rng() * arr.length) | 0];
export const jitter = (c, a = 0.035) => c.clone().multiplyScalar(1 + (rng() * 2 - 1) * a);
export let theme = null;
export function applyTheme(name) {
  const T = THEMES[name];
  theme = Object.assign({}, T, { c: { bld: T.bld.map(C), roof: C(T.roof), glass: C(T.glass), prop: C(T.prop), accent: C(T.accent), cloud: C(T.cloud) } });
  skyU.top.value.set(T.top); skyU.hor.value.set(T.hor); skyU.low.value.set(T.low); skyU.sunCol.value.set(T.sunCol);
  skyU.sunDir.value.set(...T.sun).normalize();
  scene.fog.color.set(T.fog);
  // scaled so sun + sky on a lit roof stays just under 1.0 and the palette doesn't clip to white
  sun.position.set(...T.sun).multiplyScalar(100); sun.color.set(T.sunCol); sun.intensity = T.sunInt * 0.72;
  hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiInt * 0.8;
  matHull.color.set(T.outline); matEdge.color.set(T.outline); matGround.color.set(T.ground);
  cpMats.next.color.set(T.accent); pillar.material.color.set(T.accent);
}
