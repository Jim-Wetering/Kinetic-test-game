import * as THREE from 'three';
import { rng } from '../utils.js';
import { scene, skyU, sun, hemi } from './scene.js';
import { matHull, matCloudHull, matEdge, matGround, cpMats, pillar } from './materials.js';
import { INK, setColor } from './ink.js';
import { postU } from './post.js';

// ---------------------------------------------------------------- themes
// street-graffiti colour, cel-shaded seaside brightness and sumi-e ink on paper, mixed differently per level.
// shade: what lit colours are multiplied by in shadow (a colour, never grey). paper/halftone/hatch/vig: 0..1
// amounts of each ink effect. mount: the ink-wash mountain colour. disc: the sun's flat disc colour
const THEMES = {
  // bright seaside cel-shading: candy towers, deep blue sky, violet shadows
  day: { top: '#1c63d8', hor: '#c4f1ff', low: '#2f86c4', fog: '#cfefff', sun: [-0.4, 0.8, -0.45], sunCol: '#fffbec', disc: '#fff6c8', sunR: 0.07,
    shade: '#8f8fe0', bld: ['#fff0c4', '#ffd3e1', '#c4f3e2', '#ffe48c', '#d6e4ff'], roof: '#f6f1e6', glass: '#2fb2ff',
    prop: '#ff9a3c', accent: '#ff3d6e', ink: '#1b1430', ground: '#2f86c4', cloud: '#ffffff', streak: '#ffffff', mount: '#6fa8e0',
    paper: 0.22, halftone: 0.55, hatch: 0.2, vig: 0.35, lines: '27,20,48' },
  // parchment and vermilion: cream walls, red roofs, sepia ink, heavy paper
  gold: { top: '#d9c08e', hor: '#fbf0d6', low: '#b89668', fog: '#f1e2bf', sun: [0.6, 0.3, -0.7], sunCol: '#fff4dc', disc: '#e8452c', sunR: 0.065,
    shade: '#c49a74', bld: ['#fbf3df', '#f3e5c6', '#efdfbf', '#f7ecd4'], roof: '#c94a30', glass: '#2c241d',
    prop: '#3a2e26', accent: '#d42a26', ink: '#1a110b', ground: '#a88a60', cloud: '#fff8ea', streak: '#fffaf0', mount: '#5c4a38',
    paper: 0.85, halftone: 0, hatch: 0.75, vig: 0.6, lines: '40,26,14' },
  // sticker-bright construction site: acid yellow, mint, hot pink windows, teal shadows
  teal: { top: '#12b8a8', hor: '#f4ffb4', low: '#23756d', fog: '#daf6c8', sun: [-0.2, 0.9, 0.3], sunCol: '#ffffff', disc: '#ffffff', sunR: 0.06,
    shade: '#5fb0c8', bld: ['#f5ff7c', '#7cffd6', '#ffffff', '#ffb6e8'], roof: '#ece6ff', glass: '#ff2f9e',
    prop: '#ffcf1a', accent: '#ff2f8a', ink: '#0f1a22', ground: '#23756d', cloud: '#ffffff', streak: '#ffffff', mount: '#24907f',
    paper: 0.15, halftone: 0.9, hatch: 0.15, vig: 0.3, lines: '15,26,34' },
  // street-at-dusk: purple sky into orange, pink and lilac walls, yellow roofs
  dusk: { top: '#5a2bd8', hor: '#ffb06a', low: '#6e2c80', fog: '#ffa894', sun: [0.3, 0.15, -0.9], sunCol: '#ffe2b0', disc: '#fff0c0', sunR: 0.08,
    shade: '#9a62d8', bld: ['#ffe7f3', '#ffd2a8', '#cbbaff', '#ffffff'], roof: '#ffd84a', glass: '#ff4fa8',
    prop: '#2ad8ff', accent: '#ff2f6a', ink: '#1d0f2e', ground: '#5a2a70', cloud: '#ffd6e8', streak: '#ffe0c8', mount: '#7e3aa0',
    paper: 0.2, halftone: 0.8, hatch: 0.3, vig: 0.4, lines: '29,15,46' },
  // neon night: indigo towers with lit window bands, magenta and cyan accents, a pale moon
  night: { top: '#06061a', hor: '#40208a', low: '#0b0b20', fog: '#271255', sun: [0.35, 0.6, 0.45], sunCol: '#b4dcff', disc: '#f4f2ff', sunR: 0.05,
    shade: '#5a3ab0', bld: ['#5f63cc', '#7055c6', '#4f73d4'], roof: '#9196ee', glass: '#ffe24a',
    prop: '#2affd5', accent: '#ff2fb0', ink: '#07051a', ground: '#140c33', cloud: '#3e3384', streak: '#6a4fc0', mount: '#1a1046',
    paper: 0.1, halftone: 0.7, hatch: 0.25, vig: 0.5, lines: '255,120,230' },
  // a huge red sun over ink-black towers' shadows: the sumi-e level
  sunset: { top: '#2a1838', hor: '#ff7c3c', low: '#3a1420', fog: '#ea7550', sun: [-0.25, 0.1, -1], sunCol: '#ffd4a4', disc: '#e8232a', sunR: 0.1,
    shade: '#8a3a66', bld: ['#fff0dc', '#f6dfc6', '#ffe6d0'], roof: '#e2c2ae', glass: '#1c1018',
    prop: '#3a2430', accent: '#e8232a', ink: '#14080c', ground: '#3a1420', cloud: '#ffb48a', streak: '#ffd0a8', mount: '#3a1424',
    paper: 0.7, halftone: 0.2, hatch: 0.6, vig: 0.55, lines: '20,8,12' },
};
export const C = (hex) => new THREE.Color(hex);
export const pick = (arr) => arr[(rng() * arr.length) | 0];
export const jitter = (c, a = 0.035) => c.clone().multiplyScalar(1 + (rng() * 2 - 1) * a);
export let theme = null;
export function applyTheme(name) {
  const T = THEMES[name];
  theme = Object.assign({}, T, { c: { bld: T.bld.map(C), roof: C(T.roof), glass: C(T.glass), prop: C(T.prop), accent: C(T.accent),
    cloud: C(T.cloud), ink: C(T.ink), shade: C(T.shade), sunCol: C(T.sunCol) } });
  skyU.top.value.set(T.top); skyU.hor.value.set(T.hor); skyU.low.value.set(T.low); skyU.sunCol.value.set(T.disc);
  skyU.mount.value.set(T.mount); skyU.ink.value.set(T.ink); skyU.streak.value.set(T.streak); skyU.sunR.value = T.sunR;
  skyU.sunDir.value.set(...T.sun).normalize();
  scene.fog.color.set(T.fog);
  INK.uSunDir.value.set(...T.sun).normalize(); INK.uSunCol.value.set(T.sunCol); INK.uShade.value.set(T.shade);
  INK.uFogCol.value.set(T.fog); INK.uFogNear.value = scene.fog.near; INK.uFogFar.value = scene.fog.far;
  INK.uHalftone.value = T.halftone; INK.uHatch.value = T.hatch; INK.uInkCol.value.set(T.ink);
  postU.uInk.value.set(T.ink); postU.uPaper.value = T.paper; postU.uVig.value = T.vig;
  sun.position.set(...T.sun).multiplyScalar(100); sun.color.set(T.sunCol);
  hemi.color.set(T.hor); hemi.groundColor.set(T.shade);
  matHull.color.set(T.ink); matCloudHull.color.set(T.ink); matEdge.color.set(T.ink); setColor(matGround, T.ground);
  cpMats.next.color.set(T.accent); pillar.material.color.set(T.accent);
}
