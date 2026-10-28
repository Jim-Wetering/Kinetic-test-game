import * as THREE from 'three';
import { EPS } from '../config.js';
import { rng, rand } from '../utils.js';
import { scene } from '../render/scene.js';
import { Batch, Edges } from '../render/batch.js';
import { matToon, matCloud, matCloudHull, matHull, matEdge, matGround, matAnchor, matAnchorRing, cpMats } from '../render/materials.js';
import { Decals, CELLS } from '../render/graffiti.js';
import { theme, C, pick, jitter } from '../render/themes.js';

// ---------------------------------------------------------------- world
const world = new THREE.Group(); scene.add(world);
export const colliders = [], anchors = [], cps = [];
// spawn point and fall-out height of the loaded level, set by the generators and loadLevel
export const level = { spawn: { x: 0, y: EPS, z: 0, yaw: 0 }, killY: -60 };
let B, HB, E, CL, CLH, D;

export function clearWorld() {
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world.clear();
  colliders.length = 0; anchors.length = 0; cps.length = 0;
}
// static geometry is batched into a few big meshes: start a fresh set, generate, then finish
export function beginBuild() { B = new Batch(); HB = new Batch(); E = new Edges(); CL = new Batch(); CLH = new Batch(); D = new Decals(); }
export function finishBuild() { world.add(B.build(matToon), HB.build(matHull), E.build(matEdge), CL.build(matCloud), CLH.build(matCloudHull), D.build()); }

// ---------------------------------------------------------------- graffiti placement
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
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// a decal on one vertical face of a box, `top` metres below its upper edge and `off` out from the wall
function wallDecal(x0, y0, z0, x1, y1, z1, side, w, top, off, cell) {
  const [nx, nz] = SIDES[side], faceLen = nx ? z1 - z0 : x1 - x0;
  w = Math.min(w, faceLen * 0.9); const h = w / 2, cy = y1 - top - h / 2;
  if (w < 2.5 || cy - h / 2 < y0 + 0.3) return;
  const cx = nx ? (nx > 0 ? x1 + off : x0 - off) : (x0 + x1) / 2, cz = nz ? (nz > 0 ? z1 + off : z0 - off) : (z0 + z1) / 2;
  // the decal's right is up × normal, so it reads the right way round from outside
  D.quad(cx, cy, cz, nz * w, 0, -nx * w, 0, h, 0, cell, faceLight(nx, 0, nz));
}
function roofDecal(x0, z0, x1, z1, y, a) {
  const w = Math.min(x1 - x0, z1 - z0, 13) * 0.8;
  if (w < 4) return;
  const [ux, uz] = SIDES[(a() * 4) | 0], cx = a(x0 + w / 2, x1 - w / 2), cz = a(z0 + w / 2, z1 - w / 2);
  D.quad(cx, y + 0.03, cz, ux * w, 0, uz * w, uz * w / 2, 0, -ux * w / 2, (a() * CELLS) | 0, faceLight(0, 1, 0));
}

export function addBox(x0, y0, z0, x1, y1, z1, kind, color) {
  const b = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), kind };
  colliders.push(b);
  const T = theme.c;
  if (kind === 'building') {
    const c = color || jitter(pick(T.bld));
    B.box(x0, y0, z0, x1, y1, z1, c, jitter(T.roof, 0.02));
    HB.box(x0 - 0.18, y0, z0 - 0.18, x1 + 0.18, y1 + 0.18, z1 + 0.18, c);
    E.box(x0, y0, z0, x1, y1, z1);
    for (let k = 0, y = y1 - 2.6; k < 10 && y - 1.5 > y0 + 1; k++, y -= 4) B.box(x0 - 0.06, y - 1.5, z0 - 0.06, x1 + 0.06, y, z1 + 0.06, T.glass);
    const a = artRng(x0, y1, z0);
    for (let i = 0; i < 3; i++) if (a() < 0.75) wallDecal(x0, y0, z0, x1, y1, z1, (a() * 4) | 0, a(11, 20), a(0.6, 5), 0.12, (a() * CELLS) | 0);
    if (a() < 0.5) roofDecal(x0, z0, x1, z1, y1, a);
  } else if (kind === 'anchor') {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), matAnchor);
    mesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.34), matHull));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.07, 6, 40), matAnchorRing);
    mesh.add(ring);
    const center = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.position.copy(center); world.add(mesh);
    anchors.push({ center, mesh, ring });
  } else {
    const floating = kind === 'bar' || kind === 'beam' || kind === 'slab' || kind === 'sign';
    if (kind === 'bar') { // hazard stripes along the long axis
      const alongX = x1 - x0 > z1 - z0, a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
      for (let a = a0, k = 0; a < a1; a += 1.4, k++) {
        const e = Math.min(a + 1.4, a1), c = k % 2 ? C('#222222') : C('#ffc21a');
        alongX ? B.box(a, y0, z0, e, y1, z1, c, null, true) : B.box(x0, y0, a, x1, y1, e, c, null, true);
      }
    } else {
      const c = color || (kind === 'wall' || kind === 'beam' ? T.accent : T.prop);
      B.box(x0, y0, z0, x1, y1, z1, c, null, floating);
      // wallrun walls are the big canvases: one piece on both long faces
      if (kind === 'wall') {
        const a = artRng(x0, y0, z0), cell = (a() * CELLS) | 0;
        for (const side of x1 - x0 > z1 - z0 ? [2, 3] : [0, 1]) wallDecal(x0, y0, z0, x1, y1, z1, side, 40, (y1 - y0) * 0.12, 0.03, cell);
      }
    }
    const t = kind === 'wall' || kind === 'sign' ? 0.08 : 0.05;
    HB.box(x0 - t, y0 - (floating ? t : 0), z0 - t, x1 + t, y1 + t, z1 + t, T.prop, null, floating);
    E.box(x0, y0, z0, x1, y1, z1);
  }
  return b;
}

export function addCp(x, top, zz, yaw, opts = {}) {
  const finish = !!opts.finish;
  // plane checkpoints are gates across a course: crossed by passing them along dir within halfW of the line
  const c = { x, y: top + 3, z: zz, top, yaw, finish, plane: !!opts.plane, dir: opts.dir || { x: 0, z: -1 }, halfW: opts.halfW || 7 };
  c.mesh = new THREE.Mesh(new THREE.TorusGeometry(finish ? 5 : 3.4, finish ? 0.3 : 0.2, 8, 48), cpMats.later);
  c.mesh.position.set(x, c.y, zz); c.mesh.rotation.y = yaw;
  world.add(c.mesh); cps.push(c);
}

// distant skyline and clouds, outside the playable bounds
export function backdrop(bd) {
  const T = theme.c;
  for (let i = 0, tries = 0; i < 260 && tries < 3000; tries++) {
    const x = rand(bd.x0 - 450, bd.x1 + 450), zz = rand(bd.z0 - 450, bd.z1 + 450);
    if (x > bd.x0 - 45 && x < bd.x1 + 45 && zz > bd.z0 - 45 && zz < bd.z1 + 45) continue;
    i++;
    const w = rand(14, 42), d = rand(14, 42), top = bd.yRef + rand(-30, 130), c = jitter(pick(T.bld));
    B.box(x - w / 2, -90, zz - d / 2, x + w / 2, top, zz + d / 2, c, T.roof);
    HB.box(x - w / 2 - 0.6, -90, zz - d / 2 - 0.6, x + w / 2 + 0.6, top + 0.6, zz + d / 2 + 0.6, c);
    for (let k = 0, y = top - 3; k < 12 && y > -85; k++, y -= 6) B.box(x - w / 2 - 0.1, y - 2.2, zz - d / 2 - 0.1, x + w / 2 + 0.1, y, zz + d / 2 + 0.1, T.glass);
    const a = artRng(x, top, zz);
    if (a() < 0.35) wallDecal(x - w / 2, -90, zz - d / 2, x + w / 2, top, zz + d / 2, (a() * 4) | 0, 30, a(2, 12), 0.25, (a() * CELLS) | 0);
  }
  const cx0 = (bd.x0 + bd.x1) / 2, cz0 = (bd.z0 + bd.z1) / 2;
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = rand(500, 900), cx1 = cx0 + Math.cos(a) * r, cz1 = cz0 + Math.sin(a) * r, cy = bd.yRef + rand(140, 260);
    for (let k = 0, n = 4 + (rng() * 4 | 0); k < n; k++) {
      const s = rand(18, 40), g = new THREE.IcosahedronGeometry(1, 1), h = new THREE.IcosahedronGeometry(1, 1);
      const px = cx1 + rand(-50, 50), py = cy + rand(-6, 10), pz = cz1 + rand(-30, 30);
      g.scale(s * 1.4, s * 0.6, s); g.translate(px, py, pz);
      h.scale(s * 1.4 + 1.6, s * 0.6 + 1.6, s + 1.6); h.translate(px, py, pz); // ink outline hull
      CL.geo(g, T.cloud); CLH.geo(h, T.cloud);
    }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), matGround);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -90; world.add(ground);
}
