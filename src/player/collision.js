import * as THREE from 'three';
import { R, EPS } from '../config.js';
import { colliders } from '../world/world.js';
import { P } from './player.js';

// colliders within 45 m of the player, refreshed every few steps so collision checks stay cheap
export let near = [];
export function refreshNear() {
  const px = P.pos.x, pz = P.pos.z;
  near = colliders.filter((b) => b.max.x > px - 45 && b.min.x < px + 45 && b.max.z > pz - 45 && b.min.z < pz + 45);
}
export function resetNear() { near = []; }

export function overlapsAt(x, y, zz, h, list = near) {
  for (const b of list) {
    if (x - R < b.max.x && x + R > b.min.x && y < b.max.y && y + h > b.min.y && zz - R < b.max.z && zz + R > b.min.z) return b;
  }
  return null;
}
export const clearAt = (x, y, zz, h) => !overlapsAt(x, y, zz, h);

export function collideAxis(ax, amt) {
  P.pos[ax] += amt;
  let hit = null;
  for (const b of near) {
    const p = P.pos;
    if (p.x - R < b.max.x && p.x + R > b.min.x && p.y < b.max.y && p.y + P.h > b.min.y && p.z - R < b.max.z && p.z + R > b.min.z) {
      if (ax === 'y') p.y = amt > 0 ? b.min.y - P.h - EPS : b.max.y + EPS;
      else p[ax] = amt > 0 ? b.min[ax] - R - EPS : b.max[ax] + R + EPS;
      hit = b;
    }
  }
  return hit;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function probeWalls(reach) {
  const out = [], p = P.pos;
  for (const [dx, dz] of DIRS) {
    const x = p.x + dx * reach, zz = p.z + dz * reach;
    for (const b of near) {
      if (x - R < b.max.x && x + R > b.min.x && p.y + 0.3 < b.max.y && p.y + P.h - 0.1 > b.min.y && zz - R < b.max.z && zz + R > b.min.z) {
        out.push({ n: new THREE.Vector3(-dx, 0, -dz), b }); break;
      }
    }
  }
  return out;
}

// is there a surface under the player within d metres?
export function groundWithin(d) {
  const p = P.pos;
  return near.some((b) => p.x + R > b.min.x && p.x - R < b.max.x && p.z + R > b.min.z && p.z - R < b.max.z &&
    b.max.y <= p.y + 0.05 && b.max.y > p.y - d);
}

export function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-8) { if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) return -1; continue; }
    let t1 = (b.min[ax] - o[ax]) / d[ax], t2 = (b.max[ax] - o[ax]) / d[ax];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}
