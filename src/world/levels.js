import { seedRng, load, save } from '../utils.js';
import { game } from '../state.js';
import { applyTheme } from '../render/themes.js';
import { colliders, level, clearWorld, beginBuild, finishBuild, backdrop } from './world.js';
import { district } from './district.js';
import { lineCourse } from './line.js';
import { resetNear } from '../player/collision.js';

// ---------------------------------------------------------------- levels
export const LEVELS = [
  { id: 'rooftops', name: 'Rooftops', theme: 'day', seed: 101,
    blurb: 'Wide, forgiving roofs in the midday sun. Learn the moves and find your own line.',
    gen: () => district({ cols: 5, rows: 9, cell: [16, 26], street: [4, 9], base: 0, amp: 3, slope: 0.4, jit: 1, voids: 0.05,
      turn: 0.35, props: 1, connect: 0.55, aids: { beam: 2, wall: 2, anchor: 1 }, anchors: 2 }) },
  { id: 'canyon', name: 'Glass Canyon', theme: 'gold', seed: 202,
    blurb: 'Tall towers and wide streets at golden hour. Wallrun and grapple across the gaps.',
    gen: () => district({ cols: 5, rows: 10, cell: [14, 22], street: [7, 13], base: 10, amp: 9, slope: 0.8, jit: 2, voids: 0.1,
      turn: 0.4, props: 0.7, connect: 0.6, aids: { beam: 0.5, wall: 3, anchor: 2 }, anchors: 6 }) },
  { id: 'scaffold', name: 'Scaffold', theme: 'teal', seed: 303,
    blurb: 'A construction district: beams, open floors and crane hooks everywhere.',
    gen: () => district({ cols: 6, rows: 9, cell: [12, 20], street: [5, 11], base: 5, amp: 5, slope: 0.6, jit: 1.5, voids: 0.12,
      turn: 0.45, props: 1.3, connect: 0.7, aids: { beam: 3, wall: 1, anchor: 2 }, anchors: 8, frames: 0.35 }) },
  { id: 'descent', name: 'Descent', theme: 'dusk', seed: 404,
    blurb: 'Start at the top, finish at the bottom. Roll your landings and keep the speed.',
    gen: () => district({ cols: 5, rows: 10, cell: [14, 22], street: [5, 10], base: 40, amp: 4, slope: -6, jit: 2, voids: 0.08,
      turn: 0.35, props: 0.9, connect: 0.5, aids: { beam: 1, wall: 2, anchor: 1 }, anchors: 3 }) },
  { id: 'circuit', name: 'Circuit', theme: 'night', seed: 505, laps: 3,
    blurb: 'Three laps around a night-time block. Learn the loop, then cut the corners.',
    gen: () => district({ cols: 6, rows: 6, cell: [14, 22], street: [4, 10], base: 0, amp: 4, slope: 0, jit: 1.5, voids: 0.15,
      props: 1, connect: 0.6, aids: { beam: 2, wall: 2, anchor: 1 }, anchors: 4, loop: true }) },
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
