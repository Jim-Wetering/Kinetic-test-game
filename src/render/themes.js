import * as THREE from 'three';
import { rng } from '../utils.js';
import { scene, skyU, sun, hemi } from './scene.js';
import { matHull, matGround } from './materials.js';
import { INK, setColor } from './ink.js';
import { postU } from './post.js';

// ---------------------------------------------------------------- themes
// real city materials (brick, render, concrete, sandstone, tar roofs, galvanised steel) painted in ink and wash.
// shade: what lit colours are multiplied by in shadow (a colour, never grey). paper/hatch/vig: 0..1 amounts of
// each ink effect. mount: the ink-wash hills on the horizon. disc: the sun's flat disc colour. glass / lit /
// litCol: window panes, the share of windows lit and their colour. steel / primer / safety: bare steel, red-oxide
// primed girders and safety-yellow paint
const THEMES = {
  // clear midday: warm brick and pale render under a deep blue sky, cool blue shadows
  day: { top: '#3b78c4', hor: '#dde8ee', low: '#7d8a92', fog: '#cfdde6', sun: [-0.4, 0.8, -0.45], sunCol: '#fff8ea', disc: '#fffbea', sunR: 0.05,
    shade: '#8492b8', bld: ['#b5654a', '#c98a68', '#d9cfbd', '#e6dfd0', '#a9aaa4', '#cdb48c'], roof: '#8a8783', glass: '#4f6a80',
    lit: 0, litCol: '#ffe2a8', prop: '#9aa0a4', steel: '#4a4f55', primer: '#8e3b2a', safety: '#e2b12a', accent: '#d8402a',
    ink: '#1c1a18', ground: '#5c5f60', cloud: '#ffffff', streak: '#ffffff', mount: '#8fa6bc', paper: 0.3, hatch: 0.3, vig: 0.35, lines: '28,26,24' },
  // late afternoon in sepia ink: sandstone towers and smoked glass, heavy paper
  gold: { top: '#cdb48a', hor: '#f6ead2', low: '#a88e6c', fog: '#ecdcbc', sun: [0.6, 0.3, -0.7], sunCol: '#fff2d8', disc: '#d8452c', sunR: 0.055,
    shade: '#a58266', bld: ['#e6d5b4', '#d6bf98', '#c79a74', '#ece2cc', '#b88a66'], roof: '#76644f', glass: '#3e4a50',
    lit: 0.02, litCol: '#ffd9a0', prop: '#6e655a', steel: '#3a332c', primer: '#8a3a26', safety: '#c99a2a', accent: '#c4302a',
    ink: '#1a110b', ground: '#8a7458', cloud: '#fff6e6', streak: '#fffaf0', mount: '#6a5844', paper: 0.85, hatch: 0.7, vig: 0.6, lines: '40,26,14' },
  // overcast construction site: raw concrete, safety yellow, flat grey-green light
  teal: { top: '#7f9a9c', hor: '#dfe5df', low: '#68756f', fog: '#d2dad4', sun: [-0.2, 0.9, 0.3], sunCol: '#f4f6f0', disc: '#f8f8f2', sunR: 0.045,
    shade: '#8a9aa6', bld: ['#b9bcb5', '#a6aca6', '#cfcabb', '#9b9e98', '#c2b6a2'], roof: '#6f726e', glass: '#4b5f66',
    lit: 0.03, litCol: '#ffe8b8', prop: '#8f9496', steel: '#3d4246', primer: '#9a4a2c', safety: '#e0a526', accent: '#e8662a',
    ink: '#151a1c', ground: '#5b625e', cloud: '#f2f4f2', streak: '#ffffff', mount: '#8a9c98', paper: 0.4, hatch: 0.35, vig: 0.35, lines: '21,26,28' },
  // dusk: rose brick and lilac shadows, the first windows coming on
  dusk: { top: '#3c3768', hor: '#eea47e', low: '#5a4360', fog: '#d89a8a', sun: [0.3, 0.15, -0.9], sunCol: '#ffd8b4', disc: '#ffe6c4', sunR: 0.065,
    shade: '#6e5e90', bld: ['#c48e76', '#b8a4a2', '#d8c0a6', '#9e8a92', '#a8705e'], roof: '#5a4e56', glass: '#3a3a56',
    lit: 0.14, litCol: '#ffcf8a', prop: '#857a80', steel: '#352f3a', primer: '#8a3a30', safety: '#d8a030', accent: '#e8583a',
    ink: '#1d1424', ground: '#4a3a4e', cloud: '#f2c8c0', streak: '#ffe0c8', mount: '#6a4a72', paper: 0.3, hatch: 0.4, vig: 0.45, lines: '29,20,36' },
  // night: blue-grey towers, warm lit windows, sodium-orange accents and a pale moon
  night: { top: '#080b18', hor: '#26304e', low: '#0b0e18', fog: '#1c2338', sun: [0.35, 0.6, 0.45], sunCol: '#aabbdd', disc: '#eef0f6', sunR: 0.035,
    shade: '#3a4466', bld: ['#5a6070', '#4e5566', '#666a74', '#585454'], roof: '#2e3240', glass: '#1a2234',
    lit: 0.4, litCol: '#ffcf86', prop: '#5a6068', steel: '#22262e', primer: '#5e2a24', safety: '#b8902a', accent: '#ff8a3a',
    ink: '#06070c', ground: '#121626', cloud: '#2e3654', streak: '#46507a', mount: '#151b30', paper: 0.12, hatch: 0.3, vig: 0.5, lines: '200,210,235' },
  // a huge red sun over ink-dark towers: the sumi-e level
  sunset: { top: '#2e2236', hor: '#ee8a56', low: '#3a1c24', fog: '#d8805e', sun: [-0.25, 0.1, -1], sunCol: '#ffd6a8', disc: '#d8232a', sunR: 0.09,
    shade: '#7a4a5a', bld: ['#e6d6c0', '#d6bea4', '#c4a488', '#b08470'], roof: '#4a3a3a', glass: '#2a2026',
    lit: 0.06, litCol: '#ffc880', prop: '#5a4a4c', steel: '#2a2024', primer: '#7a2a22', safety: '#c8902a', accent: '#d8232a',
    ink: '#14080c', ground: '#3a1c24', cloud: '#f2a888', streak: '#ffd0a8', mount: '#3a1c2a', paper: 0.7, hatch: 0.6, vig: 0.55, lines: '20,8,12' },
};
export const C = (hex) => new THREE.Color(hex);
export const pick = (arr) => arr[(rng() * arr.length) | 0];
export const jitter = (c, a = 0.035) => c.clone().multiplyScalar(1 + (rng() * 2 - 1) * a);
export let theme = null;
export function applyTheme(name) {
  const T = THEMES[name];
  theme = Object.assign({}, T, { c: { bld: T.bld.map(C), roof: C(T.roof), glass: C(T.glass), prop: C(T.prop), accent: C(T.accent),
    cloud: C(T.cloud), ink: C(T.ink), shade: C(T.shade), sunCol: C(T.sunCol), steel: C(T.steel), primer: C(T.primer), safety: C(T.safety) } });
  skyU.top.value.set(T.top); skyU.hor.value.set(T.hor); skyU.low.value.set(T.low); skyU.sunCol.value.set(T.disc);
  skyU.mount.value.set(T.mount); skyU.ink.value.set(T.ink); skyU.streak.value.set(T.streak); skyU.sunR.value = T.sunR;
  skyU.sunDir.value.set(...T.sun).normalize();
  scene.fog.color.set(T.fog);
  INK.uSunDir.value.set(...T.sun).normalize(); INK.uSunCol.value.set(T.sunCol); INK.uShade.value.set(T.shade);
  INK.uFogCol.value.set(T.fog); INK.uFogNear.value = scene.fog.near; INK.uFogFar.value = scene.fog.far;
  INK.uHatch.value = T.hatch; INK.uInkCol.value.set(T.ink);
  INK.uGlass.value.set(T.glass); INK.uSkyRef.value.set(T.hor); INK.uLitCol.value.set(T.litCol); INK.uLit.value = T.lit;
  postU.uInk.value.set(T.ink); postU.uPaper.value = T.paper; postU.uVig.value = T.vig;
  sun.position.set(...T.sun).multiplyScalar(100); sun.color.set(T.sunCol);
  hemi.color.set(T.hor); hemi.groundColor.set(T.shade);
  matHull.color.set(T.ink); setColor(matGround, T.ground);
}
