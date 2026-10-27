import { EPS } from '../config.js';
import { rng, rand, clamp } from '../utils.js';
import { addBox, addCp, level } from './world.js';

// ---------------------------------------------------------------- set-piece courses
// a course is a hand-picked run of set pieces laid end to end, the way The Line is built. pieces are placed
// in course space from a cursor at the near edge of the next piece: u to the right of the heading, f forward
// along it. corners turn the heading, so a course can bend or close into a loop
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // -z, +x, +z, -x: each step is a right turn
const YAWS = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const C = {};
const fx = () => DIRS[C.d][0], fz = () => DIRS[C.d][1];

function box(u0, u1, f0, f1, y0, y1, kind) {
  const ax = C.x - fz() * u0 + fx() * f0, az = C.z + fx() * u0 + fz() * f0;
  const bx = C.x - fz() * u1 + fx() * f1, bz = C.z + fx() * u1 + fz() * f1;
  const b = addBox(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), kind);
  C.x0 = Math.min(C.x0, b.min.x); C.x1 = Math.max(C.x1, b.max.x); C.z0 = Math.min(C.z0, b.min.z); C.z1 = Math.max(C.z1, b.max.z);
  return b;
}
function advance(f) { C.x += fx() * f; C.z += fz() * f; }
function up(dy) { C.y = clamp(C.y + dy, C.ylo, C.yhi); }
// sideways drift of the course line, kept within maxLat of the axis it started on
function shift() {
  C.lat = clamp(C.lat + rand(-C.shift, C.shift), -C.maxLat, C.maxLat);
  if (fx() === 0) C.x = C.ox - fz() * C.lat; else C.z = C.oz + fx() * C.lat;
}
function turn(s) { C.d = (C.d + s + 4) % 4; C.ox = C.x; C.oz = C.z; C.lat = 0; }
function roofAt(len, w = C.hw * 2) {
  box(-w / 2, w / 2, 0, len, C.y - 90, C.y, 'building');
  C.y0 = Math.min(C.y0, C.y); C.y1 = Math.max(C.y1, C.y);
}
function roof(len, w) { roofAt(len, w); advance(len); }
function cp(finish) {
  addCp(C.x + fx() * 2, C.y, C.z + fz() * 2, YAWS[C.d], { finish, plane: true, dir: { x: fx(), z: fz() }, halfW: C.hw });
}
const anchor = (u, f, h) => box(u - 0.8, u + 0.8, f - 0.8, f + 0.8, C.y + h - 0.8, C.y + h + 0.8, 'anchor');

// ---------------------------------------------------------------- pieces
// defaults are The Line's tuning; a level overrides them per piece with `tune`, or per use in its sequence
const DEF = {
  gap: { g: [6, 10], dy: [-2.5, 1.2], len: [26, 36], vault: 0.6 },
  slide: { g: [6, 8], len: 44, bars: 3 },
  wallrun: { n: 2, L: 13, off: 3.3, dy: [0, 1], len: 30 },
  grapple: { g: [30, 36], hook: 12, dy: [-1, 3], len: 30 },
  climb: { g: [4, 5.5], dy: [3, 3.8], len: 30 },
  drop: { g: [9, 12], dy: [10, 13], len: 36 },
  shaft: { rise: [6, 6.6], len: 32 },
  beam: { g: [14, 20], len: [24, 32] },
  platforms: { g: [26, 32], dy: [-1, 1.5], len: [26, 32] },
  hooks: { g: [52, 62], hook: 12, dy: [-1, 2], len: 30 },
  steps: { n: 3, rise: 1.2, step: 7, len: 24 },
  long: { g: [11, 13.5], dy: [-1.5, 0], len: [28, 34] },
  corner: { g: 7, s: 1 },
};
const PIECES = {
  // jump to the next roof, sometimes with a vault block in the middle
  gap(t) {
    advance(rand(...t.g)); up(rand(...t.dy)); shift(); cp();
    const len = rand(...t.len); roof(len);
    if (rng() < t.vault) box(-3, 3, -len / 2 - 0.4, -len / 2 + 0.4, C.y, C.y + 1, 'vault');
  },
  // vault block, then hazard bars to slide under
  slide(t) {
    advance(rand(...t.g)); shift(); cp();
    roofAt(t.len);
    box(-2.5, 2.5, 5.6, 6.4, C.y, C.y + 1.1, 'vault');
    for (let k = 0; k < t.bars; k++) { const f = 16 + k * 8; box(-C.hw, C.hw, f - 0.3, f + 0.3, C.y + 1.15, C.y + 5, 'bar'); }
    advance(t.len);
  },
  // wallrun panels over the gap, alternating sides
  wallrun(t) {
    const side = rng() < 0.5 ? -1 : 1, L = t.L;
    for (let i = 0; i < t.n; i++) {
      const u = (i % 2 === 0 ? side : -side) * t.off, f = -3 + i * (L - 1);
      box(u - 0.3, u + 0.3, f, f + L, C.y - 6, C.y + 6, 'wall');
    }
    advance(t.n * (L - 1) + 3); up(rand(...t.dy)); cp(); roof(t.len);
  },
  // one hook over a wide gap
  grapple(t) {
    const g = rand(...t.g); anchor(rand(-3, 3), g / 2, t.hook);
    advance(g); up(rand(...t.dy)); shift(); cp(); roof(t.len);
  },
  climb(t) { advance(rand(...t.g)); up(rand(...t.dy)); cp(); roof(t.len); },
  drop(t) { advance(rand(...t.g)); up(-rand(...t.dy)); shift(); cp(); roof(t.len); },
  // walled pit: wall jump up and out
  shaft(t) {
    const rise = rand(...t.rise), depth = 6, half = 2.6;
    box(-half, half, 0, depth, C.y - 90, C.y, 'building');
    box(-half - 0.8, -half, 0, depth, C.y - 90, C.y + rise, 'building');
    box(half, half + 0.8, 0, depth, C.y - 90, C.y + rise, 'building');
    advance(depth); up(rise); cp(); roof(t.len);
  },
  // a narrow beam is the only way across
  beam(t) {
    const g = rand(...t.g), u = rand(-2, 2);
    box(u - 0.45, u + 0.45, 0, g, C.y - 0.5, C.y, 'beam');
    advance(g); cp(); roof(rand(...t.len));
  },
  // two floating slabs to hop across
  platforms(t) {
    const g = rand(...t.g);
    for (const k of [1, 2]) {
      const f = g * k / 3, u = rand(-3, 3), y = C.y + rand(-0.5, 1);
      box(u - 2.25, u + 2.25, f - 2.25, f + 2.25, y - 0.6, y, 'slab');
    }
    advance(g); up(rand(...t.dy)); cp(); roof(rand(...t.len));
  },
  // a chain of two hooks over a very wide gap, one each side
  hooks(t) {
    const g = rand(...t.g), side = rng() < 0.5 ? -1 : 1;
    anchor(side * rand(1, 3), g * 0.32, t.hook); anchor(-side * rand(1, 3), g * 0.68, t.hook);
    advance(g); up(rand(...t.dy)); shift(); cp(); roof(t.len);
  },
  // a staircase of speed-vault ledges
  steps(t) {
    advance(rand(5, 7)); cp(); roof(t.step);
    for (let k = 0; k < t.n; k++) { up(t.rise); roof(t.step); }
    roof(t.len);
  },
  // long jump: needs the speed (or a dash)
  long(t) { advance(rand(...t.g)); up(rand(...t.dy)); cp(); roof(rand(...t.len)); },
  // square corner roof; s = 1 turns right, -1 left
  corner(t) {
    const w = C.hw * 2;
    advance(t.g); cp(); roofAt(w);
    advance(w / 2); turn(t.s); advance(w / 2);
  },
};
// a sequence entry is a piece name, or [name, overrides]
function piece(s) {
  const [name, over] = typeof s === 'string' ? [s, null] : s;
  PIECES[name]({ ...DEF[name], ...C.tune[name], ...over });
}

// ---------------------------------------------------------------- courses
// o: { y: start height, hw: half width, shift / maxLat: sideways drift, ylo / yhi: height limits,
//      start / finish: first and last roof length, tune: { piece: overrides } }
function begin(o) {
  Object.assign(C, { x: 0, z: 20, d: 0, ox: 0, oz: 0, lat: 0, y: o.y || 0, hw: o.hw || 7, shift: o.shift ?? 3, maxLat: o.maxLat ?? 12,
    ylo: o.ylo ?? -Infinity, yhi: o.yhi ?? Infinity, tune: o.tune || {},
    x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity });
  level.spawn = { x: 0, y: C.y + EPS, z: 12, yaw: 0 };
  roof(o.start || 50);
}
const bounds = () => ({ x0: C.x0 - 10, x1: C.x1 + 10, z0: C.z0 - 10, z1: C.z1 + 10, yRef: (C.y0 + C.y1) / 2, end: C.z });

// a one-way course: start roof, the pieces in order, then the finish
export function course(o, seq) {
  begin(o);
  for (const s of seq) piece(s);
  advance(8); cp(true); roof(o.finish || 40);
  return bounds();
}

// distance ahead along the heading to the line at coordinate t (x when heading along x, z along z)
const ahead = (t) => (fx() ? (t - C.x) * fx() : (t - C.z) * fz());
// plain roof to cover leftover distance, with a gap first if there's room for one
function fill(len) {
  if (len > 24) { advance(6); up(rand(-1, 1)); cp(); len -= 6; }
  roof(len);
}
// a closed loop of right turns. each leg runs its pieces (cycling) toward the next corner, whose centre sits
// at leg.to along the heading. no piece is longer than ~95 m, so stopping 110 m out never overshoots; short
// gap jumps and a filler roof then land it exactly there. the home stretch ends back at the start roof
export function loopCourse(o, legs) {
  begin({ ...o, shift: 0 });
  const g = DEF.corner.g, w = C.hw * 2;
  for (const leg of legs) {
    const left = () => ahead(leg.to) - g - w / 2;
    for (let i = 0; left() > 110; i++) piece(leg.seq[i % leg.seq.length]);
    while (left() > 60) piece(['gap', { g: [6, 8], len: [20, 26] }]);
    fill(left());
    piece(['corner', { s: 1 }]);
  }
  while (ahead(20) - 7 > 60) piece(['gap', { g: [6, 8], len: [20, 26] }]);
  fill(ahead(20) - 7); advance(7);
  C.y = o.y || 0; cp(true);
  return bounds();
}
