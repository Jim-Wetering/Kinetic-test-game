import { seedRng, load, save } from '../utils.js';
import { game } from '../state.js';
import { applyTheme } from '../render/themes.js';
import { colliders, level, clearWorld, beginBuild, finishBuild, backdrop } from './world.js';
import { course, loopCourse } from './course.js';
import { lineCourse } from './line.js';
import { resetNear } from '../player/collision.js';

// ---------------------------------------------------------------- levels
// every level is a hand-picked run of set pieces (see course.js), each with its own tuning and rhythm.
// ids carry -v2 so best times from the old open-district layouts don't carry over
export const LEVELS = [
  { id: 'rooftops-v2', name: 'Rooftops', theme: 'day', seed: 101,
    blurb: 'Wide, forgiving roofs in the midday sun. Every move in turn, with room to learn them.',
    gen: () => course({ hw: 9, tune: { gap: { g: [5, 8], dy: [-1.5, 1], vault: 0.5 }, grapple: { g: [26, 30] },
      drop: { g: [7, 9], dy: [4, 6] }, long: { g: [9, 11] } } },
    ['gap', 'gap', 'steps', 'gap', 'slide', ['corner', { s: -1 }], 'gap', 'wallrun', 'gap', 'long', 'grapple',
      ['corner', { s: 1 }], 'gap', 'climb', 'gap', 'drop', 'slide', 'gap']) },
  { id: 'canyon-v2', name: 'Glass Canyon', theme: 'gold', seed: 202,
    blurb: 'Narrow towers high above wide streets. Chain long wallruns and grapples across the gaps.',
    gen: () => course({ y: 30, hw: 5.5, maxLat: 8, tune: { gap: { g: [8, 12], dy: [-3, 1], len: [22, 30] },
      wallrun: { L: 15, len: 26 }, grapple: { g: [34, 42], hook: 14 }, drop: { dy: [8, 11] } } },
    ['gap', ['wallrun', { n: 3 }], 'grapple', 'gap', 'shaft', ['wallrun', { n: 4 }], 'hooks', 'long', 'climb',
      ['wallrun', { n: 3 }], 'grapple', ['corner', { s: 1 }], 'gap', 'drop', 'wallrun', 'hooks', 'gap']) },
  { id: 'scaffold-v2', name: 'Scaffold', theme: 'teal', seed: 303,
    blurb: 'A construction site in the sky: balance beams, hanging slabs, crane hooks and hazard bars.',
    gen: () => course({ y: 5, hw: 6, tune: { slide: { bars: 4 } } },
    ['beam', 'platforms', 'slide', 'beam', 'hooks', 'gap', 'platforms', 'climb', ['beam', { g: [18, 24] }], 'wallrun',
      'slide', 'hooks', 'beam', 'drop', 'platforms', 'gap']) },
  { id: 'descent-v2', name: 'Descent', theme: 'dusk', seed: 404,
    blurb: 'Start at the top, finish at the bottom. Big drops all the way: roll every landing.',
    gen: () => course({ y: 80, tune: { drop: { g: [8, 11], dy: [9, 12], len: 30 }, gap: { dy: [-4, -1] },
      grapple: { dy: [-4, -1] }, wallrun: { dy: [-3, -1] } } },
    ['drop', 'gap', 'slide', 'drop', 'wallrun', 'drop', 'gap', 'grapple', 'drop', 'slide', 'beam', 'drop',
      ['wallrun', { n: 3 }], 'drop', 'gap', 'drop']) },
  { id: 'circuit-v2', name: 'Circuit', theme: 'night', seed: 505, laps: 3,
    blurb: 'Three laps of a night-time loop. Learn every piece, then carry your speed through the corners.',
    gen: () => loopCourse({ start: 30, ylo: -2, yhi: 2 }, [
      { to: -230, seq: ['gap', 'slide', 'wallrun', 'gap', 'grapple'] },
      { to: 160, seq: ['beam', 'gap', 'platforms'] },
      { to: 90, seq: ['gap', 'wallrun', 'long', 'slide', 'gap', 'hooks'] },
      { to: 0, seq: ['gap', 'platforms', 'beam'] },
    ]) },
  { id: 'line', name: 'The Line', theme: 'sunset', seed: 7331,
    blurb: 'The original sprint: one straight, unforgiving route. Pure speed.',
    gen: lineCourse },
];
export const lapsOf = () => LEVELS[game.levelIdx].laps || 1;

export function loadLevel(idx) {
  clearWorld();
  game.levelIdx = idx; save('level', idx);
  const L = LEVELS[idx];
  applyTheme(L.theme);
  seedRng(L.seed);
  beginBuild();
  const bd = L.gen();
  backdrop(bd);
  finishBuild();
  let minTop = Infinity;
  for (const b of colliders) if (b.kind === 'building') minTop = Math.min(minTop, b.max.y);
  level.killY = minTop - 30;
  game.best = load('best.' + L.id, null);
  resetNear();
}
