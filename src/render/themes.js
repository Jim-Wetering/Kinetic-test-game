import * as THREE from 'three';
import { rng } from '../utils.js';
import { scene, skyU, sun, hemi } from './scene.js';
import { matHull, matGround } from './materials.js';
import { INK, setColor } from './ink.js';
import { postU } from './post.js';

// ---------------------------------------------------------------- themes
// grunge street painting: a few dirty, complementary colours laid on with a loaded brush. shadows go deep and
// cool (slate blue, teal), light comes in warm (rust, sodium, bleached cream), and everything is stained.
// shade: what lit colours are multiplied by in shadow (a colour, never grey). paper/hatch/vig: 0..1 amounts of
// each effect. disc: the sun's smeared glow. stain: rust/smoke blotches soaked into the sky. smog: the low band of
// haze over the horizon. glass / lit / litCol: window panes, the share of windows lit and their colour. steel /
// primer / safety: bare steel, red-oxide primed girders and safety-yellow paint. dirt: grime that runs down walls
// and pools at their feet. scrape: the complementary colour dragged over walls in dry-brush scrapes. grime: 0..1,
// how filthy the surfaces are. lo / hi: the grade's shadow and highlight tints (split toning)
const THEMES = {
  // smoggy noon: bleached cream sky stained with rust, slate-blue walls and rust brick, deep blue shadow
  day: { top: '#8ea6b2', hor: '#ece2cc', low: '#3a3c40', fog: '#d6ccb6', sun: [-0.4, 0.8, -0.45], sunCol: '#fff1da', disc: '#fff8ea', sunR: 0.06,
    shade: '#5a7394', bld: ['#4f6a86', '#b0643a', '#cdbf9e', '#6b767c', '#8f4c34', '#ddd2b8'], roof: '#5e5c58', glass: '#2c3e50',
    lit: 0, litCol: '#ffcf86', prop: '#7e868a', steel: '#2e3338', primer: '#8e3b2a', safety: '#e0a82a', accent: '#d8582a',
    ink: '#14161a', ground: '#3a3c3e', stain: '#c8743a', smog: '#9a9486', dirt: '#2a241e', scrape: '#d8773a',
    grime: 0.8, lo: '#1e3a5a', hi: '#ffe6c0', paper: 0.35, hatch: 0.12, vig: 0.55, lines: '24,22,20' },
  // rust alley at golden hour: amber haze, umber walls and teal-black shadows
  gold: { top: '#a8784a', hor: '#f2cf94', low: '#3a2a1c', fog: '#d8ae78', sun: [0.6, 0.3, -0.7], sunCol: '#ffd9a0', disc: '#fff0cc', sunR: 0.07,
    shade: '#3e5a66', bld: ['#c8945e', '#8a5a3a', '#d8b88a', '#5e5a50', '#a86a40'], roof: '#4a3c30', glass: '#1e2a2e',
    lit: 0.06, litCol: '#ffc070', prop: '#6e655a', steel: '#2a241e', primer: '#8a3a26', safety: '#d8a030', accent: '#e0602a',
    ink: '#160e08', ground: '#3a2c20', stain: '#7a3a1a', smog: '#b88a5a', dirt: '#24180e', scrape: '#4a8a96',
    grime: 0.9, lo: '#1a3438', hi: '#ffd8a0', paper: 0.6, hatch: 0.12, vig: 0.6, lines: '30,20,12' },
  // wet concrete under an overcast sky: teal greys, streaked render and safety-orange paint
  teal: { top: '#5e7a7c', hor: '#c8d2c8', low: '#2a3230', fog: '#a8b6b0', sun: [-0.2, 0.9, 0.3], sunCol: '#eef0e6', disc: '#f6f6ee', sunR: 0.05,
    shade: '#4a6670', bld: ['#8a9a96', '#6a7a7a', '#b4ae9a', '#56625f', '#a88a6a'], roof: '#454c4a', glass: '#1e2c30',
    lit: 0.05, litCol: '#ffd890', prop: '#6e7476', steel: '#262c2e', primer: '#9a4a2c', safety: '#e8902a', accent: '#e8662a',
    ink: '#0e1414', ground: '#2e3432', stain: '#a8683a', smog: '#7e8a84', dirt: '#1a201e', scrape: '#d8823a',
    grime: 0.85, lo: '#16343a', hi: '#f4ecd8', paper: 0.4, hatch: 0.12, vig: 0.55, lines: '16,22,22' },
  // dusk: sodium lamps coming on under a bruised violet sky
  dusk: { top: '#2c2448', hor: '#e88a5a', low: '#24182a', fog: '#a86a6a', sun: [0.3, 0.15, -0.9], sunCol: '#ffc890', disc: '#ffe0b0', sunR: 0.075,
    shade: '#4a4878', bld: ['#a86a56', '#6a5a76', '#c49a7a', '#4e4a5e', '#8a4a40'], roof: '#3a3040', glass: '#1e1e34',
    lit: 0.22, litCol: '#ffb860', prop: '#6a6070', steel: '#262230', primer: '#8a3a30', safety: '#d8a030', accent: '#ff6a3a',
    ink: '#120c18', ground: '#2a2030', stain: '#d8603a', smog: '#7a4e62', dirt: '#1a1218', scrape: '#5a8ab0',
    grime: 0.85, lo: '#221a48', hi: '#ffc890', paper: 0.3, hatch: 0.12, vig: 0.6, lines: '24,16,30' },
  // night: wet blue-black walls, sodium-orange windows and red neon spill
  night: { top: '#06080e', hor: '#22303e', low: '#06080c', fog: '#16202c', sun: [0.35, 0.6, 0.45], sunCol: '#8aa4c4', disc: '#c8d4e4', sunR: 0.04,
    shade: '#24344c', bld: ['#3a4656', '#2e3846', '#4a4e56', '#46383a'], roof: '#1e2430', glass: '#0e1622',
    lit: 0.45, litCol: '#ffa448', prop: '#3e464e', steel: '#181c22', primer: '#5e2a24', safety: '#b8802a', accent: '#ff4a4a',
    ink: '#040508', ground: '#0c1018', stain: '#8a3a2a', smog: '#2a3442', dirt: '#06080a', scrape: '#c8603a',
    grime: 0.9, lo: '#0a1a2e', hi: '#ffc080', paper: 0.15, hatch: 0.1, vig: 0.65, lines: '200,190,170' },
  // burnt smog at sundown: a red-hot sky over near-black towers
  sunset: { top: '#2a1418', hor: '#e86a34', low: '#1e0e10', fog: '#b0503a', sun: [-0.25, 0.1, -1], sunCol: '#ffbe84', disc: '#fff0c8', sunR: 0.1,
    shade: '#3e2e48', bld: ['#5a3a36', '#7a4a3a', '#3e3036', '#9a6a4e'], roof: '#2a1c1e', glass: '#1a1216',
    lit: 0.1, litCol: '#ffb060', prop: '#4a3a3c', steel: '#1e1416', primer: '#7a2a22', safety: '#c8902a', accent: '#ff5a2a',
    ink: '#0e0608', ground: '#1e0e10', stain: '#5a1a14', smog: '#8a3a2a', dirt: '#120808', scrape: '#4a7a8a',
    grime: 0.9, lo: '#2a1430', hi: '#ffd0a0', paper: 0.5, hatch: 0.1, vig: 0.65, lines: '20,8,10' },
};
export const C = (hex) => new THREE.Color(hex);
export const pick = (arr) => arr[(rng() * arr.length) | 0];
export const jitter = (c, a = 0.035) => c.clone().multiplyScalar(1 + (rng() * 2 - 1) * a);
export let theme = null;
export function applyTheme(name) {
  const T = THEMES[name];
  theme = Object.assign({}, T, { c: { bld: T.bld.map(C), roof: C(T.roof), glass: C(T.glass), prop: C(T.prop), accent: C(T.accent),
    ink: C(T.ink), shade: C(T.shade), sunCol: C(T.sunCol), steel: C(T.steel), primer: C(T.primer), safety: C(T.safety) } });
  skyU.top.value.set(T.top); skyU.hor.value.set(T.hor); skyU.low.value.set(T.low); skyU.sunCol.value.set(T.disc);
  skyU.stain.value.set(T.stain); skyU.smog.value.set(T.smog); skyU.ink.value.set(T.ink); skyU.sunR.value = T.sunR;
  skyU.sunDir.value.set(...T.sun).normalize();
  scene.fog.color.set(T.fog);
  INK.uSunDir.value.set(...T.sun).normalize(); INK.uSunCol.value.set(T.sunCol); INK.uShade.value.set(T.shade);
  INK.uFogCol.value.set(T.fog); INK.uFogNear.value = scene.fog.near; INK.uFogFar.value = scene.fog.far;
  INK.uHatch.value = T.hatch; INK.uInkCol.value.set(T.ink);
  INK.uGlass.value.set(T.glass); INK.uSkyRef.value.set(T.hor); INK.uLitCol.value.set(T.litCol); INK.uLit.value = T.lit;
  INK.uDirt.value.set(T.dirt); INK.uScrape.value.set(T.scrape); INK.uGrime.value = T.grime;
  postU.uInk.value.set(T.ink); postU.uPaper.value = T.paper; postU.uVig.value = T.vig;
  postU.uLo.value.set(T.lo); postU.uHi.value.set(T.hi); postU.uScrape.value.set(T.scrape);
  sun.position.set(...T.sun).multiplyScalar(100); sun.color.set(T.sunCol);
  hemi.color.set(T.hor); hemi.groundColor.set(T.shade);
  matHull.color.set(T.ink); setColor(matGround, T.ground);
}
