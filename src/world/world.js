import * as THREE from 'three';
import { EPS } from '../config.js';
import { rng, rand } from '../utils.js';
import { scene } from '../render/scene.js';
import { Batch, Edges } from '../render/batch.js';
import { matToon, matFacade, matCopeX, matCopeZ, matCloud, matCloudHull, matHull, matWorldHull, matEdge, matGround, matAnchor, matAnchorRing, cpMats,
  brushRingGeo } from '../render/materials.js';
import { FLOOR, PARAPET, BAY } from '../render/ink.js';
import { Decals, artCell } from '../render/graffiti.js';
import { BrushTowers } from '../render/strokes.js';
import { theme, C, pick, jitter } from '../render/themes.js';

// ---------------------------------------------------------------- world
const world = new THREE.Group(); scene.add(world);
export const colliders = [], anchors = [], cps = [];
// spawn point and fall-out height of the loaded level, set by the generators and loadLevel
export const level = { spawn: { x: 0, y: EPS, z: 0, yaw: 0 }, killY: -60 };
let B, BF, HB, E, CL, CLH, D, ST, CPX, CPZ;
// skyline towers further than this (m) outside the course are painted as single brush strokes, not built
const STROKE_FROM = 130;

export function clearWorld() {
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world.clear();
  colliders.length = 0; anchors.length = 0; cps.length = 0;
}
// static geometry is batched into a few big meshes: start a fresh set, generate, then finish
export function beginBuild() { B = new Batch(); BF = new Batch(true); HB = new Batch(); E = new Edges(); CL = new Batch(); CLH = new Batch(); D = new Decals(); ST = new BrushTowers();
  CPX = new Batch(); CPZ = new Batch(); }
export function finishBuild() {
  world.add(B.build(matToon), BF.build(matFacade), HB.build(matWorldHull), E.build(matEdge), CL.build(matCloud), CLH.build(matCloudHull), D.build(), ST.build(),
    CPX.build(matCopeX), CPZ.build(matCopeZ));
}

// ---------------------------------------------------------------- dressing helpers
// decoration has its own generator seeded from the box, so it never shifts the level's seeded layout
function artRng(x, y, z) {
  let a = Math.imul(Math.round(x * 7), 73856093) ^ Math.imul(Math.round(y * 7), 19349663) ^ Math.imul(Math.round(z * 7), 83492791);
  return (lo = 0, hi = 1) => {
    a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return lo + (hi - lo) * (((t ^ t >>> 14) >>> 0) / 4294967296);
  };
}
const _sun = new THREE.Vector3();
// what a face with this normal is lit by: the sun colour, or the sun colour pushed into the theme's shadow tint
function faceLight(nx, ny, nz) {
  const T = theme.c;
  _sun.set(...theme.sun).normalize();
  return _sun.x * nx + _sun.y * ny + _sun.z * nz > 0.02 ? T.sunCol : T.sunCol.clone().multiply(T.shade);
}
// the four vertical faces of a box, in the order the facade shader's blank-wall bitmask uses
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// one vertical face of a box as an origin plus axes: o + along * t + out * d, with its length
function face(x0, z0, x1, z1, side) {
  const [nx, nz] = SIDES[side];
  if (nx) return { ox: nx > 0 ? x1 : x0, oz: z0, ax: 0, az: 1, nx, nz, len: z1 - z0 };
  return { ox: x0, oz: nz > 0 ? z1 : z0, ax: 1, az: 0, nx, nz, len: x1 - x0 };
}
// an axis-aligned box on a face: t0..t1 along it, d0..d1 out from it
function faceBox(F, t0, t1, d0, d1, y0, y1, col, hull = true) {
  const xa = F.ox + F.ax * t0 + F.nx * d0, xb = F.ox + F.ax * t1 + F.nx * d1;
  const za = F.oz + F.az * t0 + F.nz * d0, zb = F.oz + F.az * t1 + F.nz * d1;
  const lx = Math.min(xa, xb), hx = Math.max(xa, xb), lz = Math.min(za, zb), hz = Math.max(za, zb);
  B.box(lx, y0, lz, hx, y1, hz, col);
  if (hull) HB.box(lx - 0.04, y0 - 0.04, lz - 0.04, hx + 0.04, y1 + 0.04, hz + 0.04, col, null, true);
}
const faceLine = (F, t0, d0, y0, t1, d1, y1) => E.line(F.ox + F.ax * t0 + F.nx * d0, y0, F.oz + F.az * t0 + F.nz * d0,
  F.ox + F.ax * t1 + F.nx * d1, y1, F.oz + F.az * t1 + F.nz * d1);
// a decal of w metres (half as tall) on a face, centred at t along it, its top `top` metres below y1
function faceDecal(F, t, y1, w, top, cell, off = 0.06) {
  const h = w / 2, cx = F.ox + F.ax * t + F.nx * off, cz = F.oz + F.az * t + F.nz * off;
  // the decal's right is up × normal, so it reads the right way round from outside
  D.quad(cx, y1 - top - h / 2, cz, F.nz * w, 0, -F.nx * w, 0, h, 0, cell, faceLight(F.nx, 0, F.nz));
}
// the window bays of a face, matching the shader's grid
const bays = (len) => { const n = Math.max(1, Math.floor(len / BAY)); return { n, w: len / n }; };

// ---------------------------------------------------------------- buildings
// a block of real proportions: rendered walls with a window grid (3.5 m floors under a parapet band), some
// blank party walls, and a stone coping around the roof edge. returns the blank-side mask
function block(x0, y0, z0, x1, y1, z1, c, roof, a) {
  let blank = 0;
  for (let s = 0; s < 4; s++) {
    const len = s < 2 ? z1 - z0 : x1 - x0;
    if (len < 4 || a() < (len < 9 ? 0.45 : 0.2)) blank |= 1 << s;
  }
  if (blank === 15) blank = 14;
  BF.box(x0, y0, z0, x1, y1, z1, c, roof, false, blank);
  HB.box(x0 - 0.18, y0, z0 - 0.18, x1 + 0.18, y1 + 0.18, z1 + 0.18, c);
  E.box(x0, y0, z0, x1, y1, z1);
  // coping: a pale cap a hair proud of the roof and lapping down the wall, painted as a dry-brush highlight
  // stroke along each edge (the bristles run along it), so every roof edge reads as a streak of light
  const cap = c.clone().lerp(C('#ebe7de'), 0.85), k = 0.75, o = 0.08, t = y1 + 0.03, b = y1 - 0.75;
  CPX.box(x0 - o, b, z0 - o, x1 + o, t, z0 + k, cap); CPX.box(x0 - o, b, z1 - k, x1 + o, t, z1 + o, cap);
  CPZ.box(x0 - o, b, z0 + k, x0 + k, t, z1 - k, cap); CPZ.box(x1 - k, b, z0 + k, x1 + o, t, z1 - k, cap);
  return blank;
}
// AC units under windows, a downpipe, sometimes a fire escape, and street art on the walls
function dressBlock(x0, y0, z0, x1, y1, z1, blank, a) {
  const T = theme.c, metal = T.prop, steel = T.steel;
  for (let s = 0; s < 4; s++) {
    const F = face(x0, z0, x1, z1, s), isBlank = blank >> s & 1, { n, w: bw } = bays(F.len);
    if (F.len < 4) continue;
    const floorTop = (k) => y1 - PARAPET - k * FLOOR; // top of floor k (0 = the top floor)
    if (!isBlank) {
      for (let i = 0, m = (a() * 4) | 0; i < m; i++) {
        const t = (((a() * n) | 0) + 0.5) * bw, y = floorTop(1 + ((a() * 7) | 0)) - 2.45;
        faceBox(F, t - 0.45, t + 0.45, 0, 0.55, y - 0.6, y, metal);
      }
      // fire escape: landings at each floor across two bays, railings, and stairs zig-zagging between them
      if (F.len >= 9 && a() < 0.3) {
        const b0 = Math.min(n - 2, (a() * (n - 1)) | 0), t0 = b0 * bw + 0.3, t1 = (b0 + 2) * bw - 0.3, D1 = 1.3;
        for (let k = 0; k < 9; k++) {
          const y = floorTop(k) - FLOOR + 0.05, r = y + 1.0;
          faceBox(F, t0, t1, 0.05, D1, y - 0.08, y, steel, false);
          faceLine(F, t0, D1, r, t1, D1, r); faceLine(F, t0, 0, r, t0, D1, r); faceLine(F, t1, 0, r, t1, D1, r);
          for (let p = t0; p <= t1 + 0.01; p += (t1 - t0) / 4) faceLine(F, p, D1, y, p, D1, r);
          if (k > 0) {
            const [sa, sb] = k % 2 ? [t0 + 0.4, t1 - 1.2] : [t1 - 0.4, t0 + 1.2];
            faceLine(F, sa, 0.35, y + FLOOR, sb, 0.35, y); faceLine(F, sa, 0.95, y + FLOOR, sb, 0.95, y);
          }
        }
        // gooseneck ladder up to the roof
        const yl = floorTop(0) - FLOOR + 0.05;
        for (const d of [0.25, 0.75]) faceLine(F, t0 + 0.6 + d * 0.5, 0.15, yl, t0 + 0.6 + d * 0.5, 0.15, y1 + 0.9);
        for (let y = yl + 0.3; y < y1 + 0.9; y += 0.35) faceLine(F, t0 + 0.72, 0.15, y, t0 + 0.98, 0.15, y);
      }
    }
    // street art: tags and throw-ups along the parapet ("heaven spots"), ghost signs and big pieces on blank walls
    if (isBlank && F.len >= 10 && a() < 0.55) {
      const w = Math.min(F.len * 0.82, 17), kind = a() < 0.55 ? 'ghost' : a() < 0.5 ? 'throw' : 'ad';
      faceDecal(F, F.len / 2, y1, w, a(1.5, 5), artCell(kind, a()));
    } else if (a() < 0.5) {
      const kind = a() < 0.55 ? 'tag' : a() < 0.75 ? 'throw' : 'stencil';
      const w = Math.min(F.len * 0.8, kind === 'throw' ? a(4.5, 7) : kind === 'tag' ? a(2.6, 4) : a(2, 3));
      faceDecal(F, a(w / 2, F.len - w / 2), y1, w, a(0.15, 0.6), artCell(kind, a()));
    }
  }
  // downpipe at a corner
  const F = face(x0, z0, x1, z1, (a() * 4) | 0);
  if (F.len >= 4) faceBox(F, 0.3, 0.48, 0.02, 0.2, y1 - 60, y1 - 0.1, theme.c.steel, false);
}
// rooftop plant on towers you can't reach: a stair/lift penthouse, a timber water tank on legs, aerial masts
function crown(x0, z0, x1, z1, y, c, a) {
  const w = x1 - x0, d = z1 - z0;
  if (a() < 0.55) {
    const pw = Math.min(w * 0.4, a(4, 8)), pd = Math.min(d * 0.4, a(4, 7)), px = a(x0 + 1, x1 - 1 - pw), pz = a(z0 + 1, z1 - 1 - pd);
    B.box(px, y, pz, px + pw, y + 3.6, pz + pd, c, theme.c.roof);
    HB.box(px - 0.15, y, pz - 0.15, px + pw + 0.15, y + 3.75, pz + pd + 0.15, c);
  }
  if (a() < 0.35) {
    const r = a(1.8, 2.8), cx = a(x0 + r + 1, x1 - r - 1), cz = a(z0 + r + 1, z1 - r - 1), legs = 2.4, h = a(3.5, 5);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box(cx + dx * r * 0.6 - 0.12, y, cz + dz * r * 0.6 - 0.12, cx + dx * r * 0.6 + 0.12, y + legs, cz + dz * r * 0.6 + 0.12, theme.c.steel);
    const wood = C('#7a5a40'), tank = new THREE.CylinderGeometry(r, r, h, 14, 1), cap = new THREE.ConeGeometry(r * 1.05, 1.4, 14, 1);
    tank.translate(cx, y + legs + h / 2, cz); cap.translate(cx, y + legs + h + 0.7, cz);
    B.geo(tank, wood); B.geo(cap, theme.c.steel);
    const hull = new THREE.CylinderGeometry(r + 0.15, r + 0.15, h + 0.3, 14, 1); hull.translate(cx, y + legs + h / 2, cz); HB.geo(hull, wood);
    for (let k = 1; k < 4; k++) { const yy = y + legs + h * k / 4; for (let q = 0; q < 14; q++) { const a0 = q / 14 * 6.283, a1 = (q + 1) / 14 * 6.283; E.line(cx + Math.cos(a0) * (r + 0.02), yy, cz + Math.sin(a0) * (r + 0.02), cx + Math.cos(a1) * (r + 0.02), yy, cz + Math.sin(a1) * (r + 0.02)); } }
  }
  if (a() < 0.3) {
    const mx = a(x0 + 1, x1 - 1), mz = a(z0 + 1, z1 - 1), h = a(8, 22);
    B.box(mx - 0.3, y, mz - 0.3, mx + 0.3, y + h, mz + 0.3, theme.c.steel);
    for (let k = 1; k <= 2; k++) E.line(mx - 1.2, y + h * (0.5 + k * 0.2), mz, mx + 1.2, y + h * (0.5 + k * 0.2), mz);
  }
}

// ---------------------------------------------------------------- props
// a crane hook block on its cable, with a thin target ring
function hookBlock(center) {
  const mesh = new THREE.Group();
  const blockM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.7), matAnchor);
  blockM.add(new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.64, 0.84), matHull));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.13, 8, 20, Math.PI * 1.4), matAnchor);
  hook.position.set(0, -1.25, 0); hook.rotation.z = -Math.PI * 0.2;
  hook.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.2, 8, 20, Math.PI * 1.4), matHull));
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0.75, 0), new THREE.Vector3(-0.2, 160, 0),
    new THREE.Vector3(0.2, 160, 0), new THREE.Vector3(0.2, 0.75, 0)]), matEdge);
  mesh.add(blockM, hook, cable);
  const ring = new THREE.Mesh(brushRingGeo(2.2, 0.1), matAnchorRing);
  mesh.add(ring);
  mesh.position.copy(center); world.add(mesh);
  return { mesh, ring };
}

export function addBox(x0, y0, z0, x1, y1, z1, kind, color) {
  const b = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), kind };
  colliders.push(b);
  const T = theme.c, a = artRng(x0, y1, z0);
  const alongX = x1 - x0 > z1 - z0;
  if (kind === 'building') {
    const c = color || jitter(pick(T.bld));
    const blank = block(x0, y0, z0, x1, y1, z1, c, jitter(T.roof, 0.03), a);
    dressBlock(x0, y0, z0, x1, y1, z1, blank, a);
  } else if (kind === 'anchor') {
    const center = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const { mesh, ring } = hookBlock(center);
    anchors.push({ center, mesh, ring });
  } else if (kind === 'beam') {
    // a red-oxide primed I-beam: flanges and a web, bolted plates every few metres
    const fl = 0.07, wc = (alongX ? (z0 + z1) / 2 : (x0 + x1) / 2), web = 0.07;
    B.box(x0, y1 - fl, z0, x1, y1, z1, T.primer, null, true); B.box(x0, y0, z0, x1, y0 + fl, z1, T.primer, null, true);
    if (alongX) B.box(x0, y0 + fl, wc - web, x1, y1 - fl, wc + web, T.primer.clone().multiplyScalar(0.8));
    else B.box(wc - web, y0 + fl, z0, wc + web, y1 - fl, z1, T.primer.clone().multiplyScalar(0.8));
    HB.box(x0 - 0.04, y1 - fl - 0.04, z0 - 0.04, x1 + 0.04, y1 + 0.04, z1 + 0.04, T.primer, null, true);
    HB.box(x0 - 0.04, y0 - 0.04, z0 - 0.04, x1 + 0.04, y0 + fl + 0.04, z1 + 0.04, T.primer, null, true);
    E.box(x0, y1 - fl, z0, x1, y1, z1); E.box(x0, y0, z0, x1, y0 + fl, z1);
  } else if (kind === 'bar') {
    // a construction hoarding hung across the roof: plywood with pasted flyers, a hazard band along its low
    // edge, and steel posts bolted to the walls either side
    const ply = C('#a88e68'), band = 0.45;
    B.box(x0, y0 + band, z0, x1, y1, z1, ply, null, true);
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    for (let p = a0, k = 0; p < a1; p += 0.9, k++) {
      const e = Math.min(p + 0.9, a1), c = k % 2 ? C('#1e1e1e') : T.safety;
      alongX ? B.box(p, y0, z0, e, y0 + band, z1, c, null, true) : B.box(x0, y0, p, x1, y0 + band, e, c, null, true);
    }
    HB.box(x0 - 0.06, y0 - 0.06, z0 - 0.06, x1 + 0.06, y1 + 0.06, z1 + 0.06, ply, null, true);
    E.box(x0, y0, z0, x1, y1, z1);
    for (const p of [a0 - 0.25, a1 + 0.05]) {
      alongX ? B.box(p, y0 - 3, z0 + 0.1, p + 0.2, y1, z1 - 0.1, T.steel) : B.box(x0 + 0.1, y0 - 3, p, x1 - 0.1, y1, p + 0.2, T.steel);
    }
    for (const side of alongX ? [2, 3] : [0, 1]) {
      const F = face(x0, z0, x1, z1, side), w = Math.min(F.len * 0.5, 7);
      faceDecal(F, a(w / 2, F.len - w / 2), y1, w, 0.25, artCell('paste', a()), 0.03);
    }
  } else if (kind === 'wall') {
    // wallrun panels are billboards: a steel-framed hoarding with two posters a side, on lattice legs down into
    // the street, with lamp arms along the top
    B.box(x0, y0, z0, x1, y1, z1, T.steel, null, true);
    HB.box(x0 - 0.08, y0 - 0.08, z0 - 0.08, x1 + 0.08, y1 + 0.08, z1 + 0.08, T.steel, null, true);
    E.box(x0, y0, z0, x1, y1, z1);
    for (const side of alongX ? [2, 3] : [0, 1]) {
      const F = face(x0, z0, x1, z1, side), H = y1 - y0, w = Math.min(F.len * 0.92, H - 1.2);
      faceDecal(F, F.len / 2, y1, w, 0.4, artCell('ad', a()), 0.03);
      faceDecal(F, F.len / 2, y1, w, 0.8 + w / 2, artCell(a() < 0.6 ? 'ad' : 'throw', a()), 0.03);
      for (let t = 1.5; t < F.len; t += 3.5) faceLine(F, t, 0.03, y1, t, 1.0, y1 + 0.6);
    }
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1, mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    for (const f of [0.22, 0.78]) {
      const p = a0 + (a1 - a0) * f;
      alongX ? B.box(p - 0.2, y0 - 45, mid - 0.2, p + 0.2, y0, mid + 0.2, T.steel) : B.box(mid - 0.2, y0 - 45, p - 0.2, mid + 0.2, y0, p + 0.2, T.steel);
    }
    const pa = a0 + (a1 - a0) * 0.22, pb = a0 + (a1 - a0) * 0.78;
    for (let y = y0; y > y0 - 45; y -= 5) {
      alongX ? (E.line(pa, y, mid, pb, y - 5, mid), E.line(pb, y, mid, pa, y - 5, mid)) : (E.line(mid, y, pa, mid, y - 5, pb), E.line(mid, y, pb, mid, y - 5, pa));
    }
  } else if (kind === 'slab') {
    // a precast concrete panel slung from a crane: four chains up to a shackle
    const conc = C('#a8a49a');
    B.box(x0, y0, z0, x1, y1, z1, conc, null, true);
    HB.box(x0 - 0.06, y0 - 0.06, z0 - 0.06, x1 + 0.06, y1 + 0.06, z1 + 0.06, conc, null, true);
    E.box(x0, y0, z0, x1, y1, z1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = y1 + 6;
    for (const [x, z] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x1 - 0.4, z1 - 0.4], [x0 + 0.4, z1 - 0.4]]) E.line(x, y1, z, cx, top, cz);
    E.line(cx, top, cz, cx, top + 150, cz);
  } else if (kind === 'vault') {
    // rooftop AC condenser: a galvanised cabinet on a plinth, louvred sides, fan grilles on top
    const body = T.prop, plinth = 0.15;
    B.box(x0 + 0.08, y0, z0 + 0.08, x1 - 0.08, y0 + plinth, z1 - 0.08, T.steel);
    B.box(x0, y0 + plinth, z0, x1, y1, z1, body, body.clone().multiplyScalar(1.05));
    HB.box(x0 - 0.05, y0, z0 - 0.05, x1 + 0.05, y1 + 0.05, z1 + 0.05, body);
    E.box(x0, y0 + plinth, z0, x1, y1, z1);
    for (let y = y0 + 0.35; y < y1 - 0.1; y += 0.16) {
      if (alongX) { E.line(x0 + 0.2, y, z0 - 0.01, x1 - 0.2, y, z0 - 0.01); E.line(x0 + 0.2, y, z1 + 0.01, x1 - 0.2, y, z1 + 0.01); }
      else { E.line(x0 - 0.01, y, z0 + 0.2, x0 - 0.01, y, z1 - 0.2); E.line(x1 + 0.01, y, z0 + 0.2, x1 + 0.01, y, z1 - 0.2); }
    }
    const len = alongX ? x1 - x0 : z1 - z0, r = Math.min(0.42, (alongX ? z1 - z0 : x1 - x0) * 0.42);
    for (let p = r + 0.3; p < len - r - 0.2; p += r * 2 + 0.5) {
      const cx = alongX ? x0 + p : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0 + p;
      for (let q = 0; q < 12; q++) { const u0 = q / 12 * 6.283, u1 = (q + 1) / 12 * 6.283; E.line(cx + Math.cos(u0) * r, y1 + 0.01, cz + Math.sin(u0) * r, cx + Math.cos(u1) * r, y1 + 0.01, cz + Math.sin(u1) * r); }
      E.line(cx - r, y1 + 0.01, cz, cx + r, y1 + 0.01, cz); E.line(cx, y1 + 0.01, cz - r, cx, y1 + 0.01, cz + r);
    }
  } else {
    const floating = kind === 'sign';
    const c = color || T.prop;
    B.box(x0, y0, z0, x1, y1, z1, c, null, floating);
    HB.box(x0 - 0.05, y0 - (floating ? 0.05 : 0), z0 - 0.05, x1 + 0.05, y1 + 0.05, z1 + 0.05, c, null, floating);
    E.box(x0, y0, z0, x1, y1, z1);
  }
  return b;
}

export function addCp(x, top, zz, yaw, opts = {}) {
  const finish = !!opts.finish;
  // plane checkpoints are gates across a course: crossed by passing them along dir within halfW of the line
  const c = { x, y: top + 3, z: zz, top, yaw, finish, plane: !!opts.plane, dir: opts.dir || { x: 0, z: -1 }, halfW: opts.halfW || 7 };
  c.mesh = new THREE.Mesh(brushRingGeo(finish ? 5 : 3.4, finish ? 0.42 : 0.3), cpMats.later);
  // each ring's stroke starts somewhere different round the circle
  c.mesh.position.set(x, c.y, zz); c.mesh.rotation.set(0, yaw, artRng(x, top, zz)() * Math.PI * 2);
  world.add(c.mesh); cps.push(c);
}

// distant skyline and clouds, outside the playable bounds: towers on podiums, setbacks and rooftop plant
export function backdrop(bd) {
  const T = theme.c;
  for (let i = 0, tries = 0; i < 260 && tries < 3000; tries++) {
    const x = rand(bd.x0 - 450, bd.x1 + 450), zz = rand(bd.z0 - 450, bd.z1 + 450);
    if (x > bd.x0 - 45 && x < bd.x1 + 45 && zz > bd.z0 - 45 && zz < bd.z1 + 45) continue;
    i++;
    const w = rand(14, 42), d = rand(14, 42), top = bd.yRef + rand(-30, 130), c = jitter(pick(T.bld));
    const a = artRng(x, top, zz), x0 = x - w / 2, x1 = x + w / 2, z0 = zz - d / 2, z1 = zz + d / 2;
    // far from the course a tower is just one big brush stroke; nearer ones are built properly
    const off = Math.hypot(Math.max(bd.x0 - x, 0, x - bd.x1), Math.max(bd.z0 - zz, 0, zz - bd.z1));
    if (off > STROKE_FROM) {
      ST.add(x, zz, -90, top, (w + d) / 2, c, a() * 100);
    } else if (a() < 0.4 && Math.min(w, d) > 20) {
      // a podium with a slimmer tower set back on it
      const mid = top - a(14, 45), ins = a(3, Math.min(w, d) * 0.22), c2 = a() < 0.5 ? c : jitter(pick(T.bld));
      const bl = block(x0, -90, z0, x1, mid, z1, c, T.roof, a);
      block(x0 + ins, mid, z0 + ins, x1 - ins, top, z1 - ins, c2, T.roof, a);
      crown(x0 + ins, z0 + ins, x1 - ins, z1 - ins, top, c2, a);
      if (bl !== 0 && a() < 0.4) backdropArt(x0, z0, x1, z1, mid, bl, a);
    } else {
      const bl = block(x0, -90, z0, x1, top, z1, c, T.roof, a);
      crown(x0, z0, x1, z1, top, c, a);
      if (bl !== 0 && a() < 0.4) backdropArt(x0, z0, x1, z1, top, bl, a);
    }
  }
  const cx0 = (bd.x0 + bd.x1) / 2, cz0 = (bd.z0 + bd.z1) / 2;
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = rand(500, 900), cx1 = cx0 + Math.cos(a) * r, cz1 = cz0 + Math.sin(a) * r, cy = bd.yRef + rand(140, 260);
    for (let k = 0, n = 4 + (rng() * 4 | 0); k < n; k++) {
      const s = rand(18, 40), g = new THREE.IcosahedronGeometry(1, 1), h = new THREE.IcosahedronGeometry(1, 1);
      const px = cx1 + rand(-50, 50), py = cy + rand(-6, 10), pz = cz1 + rand(-30, 30);
      g.scale(s * 1.6, s * 0.45, s); g.translate(px, py, pz);
      h.scale(s * 1.6 + 1.6, s * 0.45 + 1.6, s + 1.6); h.translate(px, py, pz); // ink outline hull
      CL.geo(g, T.cloud); CLH.geo(h, T.cloud);
    }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), matGround);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -90; world.add(ground);
}
// a painted sign or a mural on one of a skyline tower's blank walls
function backdropArt(x0, z0, x1, z1, y1, blank, a) {
  for (let s = 0; s < 4; s++) {
    if (!(blank >> s & 1)) continue;
    const F = face(x0, z0, x1, z1, s), w = Math.min(F.len * 0.8, 28);
    if (w > 8) faceDecal(F, F.len / 2, y1, w, a(2, 10), artCell(a() < 0.6 ? 'ghost' : 'ad', a()), 0.2);
    return;
  }
}
