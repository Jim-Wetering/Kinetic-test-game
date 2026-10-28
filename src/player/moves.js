import {
  H_STAND, H_CROUCH, EPS, GRAV, RUN, FRICTION, STOP_SPEED, ROLL_REFILL, AIR_ACCEL, AIR_CAP, AIR_CONTROL,
  SLIDE_BOOST, SLIDE_MIN, SLAM_V, ROLL_WINDOW, HARD_LAND, WR_MIN, WR_ACCEL, WR_MAX, WR_TIME, WR_PUSH, WR_JUMP_V,
  WJ_PUSH, WJ_V, HOOK_RANGE, HOOK_PULL, MANTLE_REACH,
} from '../config.js';
import { clamp } from '../utils.js';
import { cam, camDir } from '../render/scene.js';
import { camfx, shake, shockwave } from '../render/effects.js';
import { anchors, colliders } from '../world/world.js';
import { keys, crouchDown } from '../input.js';
import { sfx } from '../audio.js';
import { style, addStyle } from '../ui/style.js';
import { flash } from '../ui/hud.js';
import { P, fwd, wish, tmp, tmp2, hspeed } from './player.js';
import { probeWalls, clearAt, rayBox } from './collision.js';
import { cue } from './anim.js';

// ---------------------------------------------------------------- ground / air movement
export function friction(dt, scale) {
  const sp = hspeed();
  if (sp < 0.05) { P.vel.x = P.vel.z = 0; return; }
  const ns = Math.max(sp - Math.max(sp, STOP_SPEED) * FRICTION * scale * dt, 0) / sp;
  P.vel.x *= ns; P.vel.z *= ns;
}
export function accelerate(wishSpeed, accel, dt) {
  const add = wishSpeed - (P.vel.x * wish.x + P.vel.z * wish.z);
  if (add <= 0) return;
  const a = Math.min(accel * wishSpeed * dt, add);
  P.vel.x += wish.x * a; P.vel.z += wish.z * a;
}
// Quake-style air accel: a tiny wish-speed cap lets strafing + turning build speed
export function airAccel(dt) {
  if (wish.lengthSq() === 0) return;
  let cur = P.vel.x * wish.x + P.vel.z * wish.z, add = AIR_CAP - cur;
  if (add > 0) { const a = Math.min(AIR_ACCEL * dt, add); P.vel.x += wish.x * a; P.vel.z += wish.z * a; }
  cur = P.vel.x * wish.x + P.vel.z * wish.z;
  const lim = RUN * 0.75;
  if (cur < lim) { const a = Math.min(AIR_CONTROL * dt, lim - cur); P.vel.x += wish.x * a; P.vel.z += wish.z * a; }
}

export function setHeight(h) { P.h = h; }

// ---------------------------------------------------------------- slide / slam
export function startSlide(noBoost) {
  P.sliding = true;
  const sp = hspeed();
  if (!noBoost && P.slideCd <= 0 && sp > 0.1) { P.vel.x += P.vel.x / sp * SLIDE_BOOST; P.vel.z += P.vel.z / sp * SLIDE_BOOST; P.slideCd = 1; }
  setHeight(H_CROUCH);
  addStyle('SLIDE', 4); sfx(300, 120, .25, 'sawtooth', .04);
}
export function startSlam() {
  P.slamming = true; P.slamT = 0; P.slamY = P.pos.y;
  P.preSlam.set(P.vel.x, 0, P.vel.z);
  P.vel.x *= 0.15; P.vel.z *= 0.15; P.vel.y = -SLAM_V;
  sfx(500, 80, .2, 'square', .06);
}

// ---------------------------------------------------------------- wallrun / wall jump
export function endWallrun() {
  if (!P.wr) return;
  P.wr = false; P.lastWrBox = P.wrBox;
}
export function tryStartWallrun() {
  const hs = hspeed();
  if (hs < WR_MIN || P.vel.y < -14) return;
  const vx = P.vel.x / hs, vz = P.vel.z / hs;
  for (const w of probeWalls(0.3)) {
    if (w.b === P.lastWrBox) continue;
    const d = vx * w.n.x + vz * w.n.z;
    if (Math.abs(d) > 0.8) continue; // too head-on: that's a wall jump / mantle, not a wallrun
    let ax = -w.n.z, az = w.n.x;
    if (ax * vx + az * vz < 0) { ax = -ax; az = -az; }
    const sp = Math.max(ax * P.vel.x + az * P.vel.z, hs * 0.85);
    P.wr = true; P.wrT = 0; P.wrN.copy(w.n); P.wrAlong.set(ax, 0, az); P.wrBox = w.b;
    P.vel.set(ax * sp, clamp(P.vel.y, 1.2, 4), az * sp);
    P.wallJumps = 3;
    addStyle('WALLRUN', 8); sfx(200, 400, .2, 'triangle', .07);
    return;
  }
}
export function wallrunStep(dt) {
  P.wrT += dt;
  let sp = P.vel.x * P.wrAlong.x + P.vel.z * P.wrAlong.z;
  if (sp < WR_MAX) sp = Math.min(WR_MAX, sp + WR_ACCEL * dt);
  P.vel.x = P.wrAlong.x * sp - P.wrN.x * 1.5;
  P.vel.z = P.wrAlong.z * sp - P.wrN.z * 1.5;
  const gs = P.wrT < 0.7 ? 0.06 : 0.06 + (P.wrT - 0.7) * 0.9;
  P.vel.y = Math.max(P.vel.y - GRAV * gs * dt, -8);
  if (P.wrT > WR_TIME || !keys.KeyW) endWallrun();
}
export function wallrunJump() {
  const sp = Math.max(P.vel.x * P.wrAlong.x + P.vel.z * P.wrAlong.z, 0) + 1.5;
  P.vel.x = P.wrAlong.x * sp + P.wrN.x * WR_PUSH + fwd.x * 3;
  P.vel.z = P.wrAlong.z * sp + P.wrN.z * WR_PUSH + fwd.z * 3;
  P.vel.y = WR_JUMP_V;
  cue('push', { n: P.wrN.clone() });
  endWallrun(); addStyle('WALL HOP', 8);
}
export function wallJump(n) {
  const into = P.vel.x * n.x + P.vel.z * n.z;
  if (into < 0) { P.vel.x -= n.x * into; P.vel.z -= n.z * into; }
  P.vel.x += n.x * WJ_PUSH; P.vel.z += n.z * WJ_PUSH; P.vel.y = Math.max(P.vel.y, WJ_V);
  P.wallJumps--; addStyle('WALL JUMP', 7); cue('push', { n: n.clone() });
}

// ---------------------------------------------------------------- grapple
export function findHookTarget() {
  const o = cam.position;
  let best = null;
  for (const a of anchors) { // aim assist toward anchors
    tmp.subVectors(a.center, o); const dist = tmp.length();
    if (dist > HOOK_RANGE + 12) continue;
    if (tmp.dot(camDir) / dist > 0.985 && (!best || dist < best.dist)) best = { point: a.center.clone(), dist };
  }
  if (best) return best;
  let tBest = HOOK_RANGE;
  for (const b of colliders) {
    const t = rayBox(o, camDir, b, tBest);
    if (t > 0 && t < tBest) { tBest = t; best = { point: o.clone().addScaledVector(camDir, t), dist: t }; }
  }
  return best;
}
export function releaseGrapple(hop) {
  if (!P.grapple) return;
  P.grapple = null; P.grappleCd = 0.5;
  if (hop) { P.vel.y = Math.max(P.vel.y, 0) + 7; addStyle('HOOK HOP', 8); }
}
export function grappleStep(dt) {
  tmp.set(P.pos.x, P.pos.y + P.h * 0.8, P.pos.z);
  tmp2.subVectors(P.grapple.point, tmp);
  const dist = tmp2.length(); tmp2.divideScalar(dist);
  P.vel.addScaledVector(tmp2, HOOK_PULL * dt);
  const along = P.vel.dot(tmp2); // damp sideways swing so the pull feels direct
  tmp.copy(P.vel).addScaledVector(tmp2, -along);
  P.vel.addScaledVector(tmp, -1.5 * dt);
  if (along > 40) P.vel.addScaledVector(tmp2, 40 - along);
  P.vel.y -= GRAV * 0.35 * dt;
  airAccel(dt);
  if (dist < 2.5) { releaseGrapple(false); P.vel.y += 5; }
}

// ---------------------------------------------------------------- ledges: step up, vault, mantle
export function tryLedge(b, ax, sgn, preVel) {
  const ledge = b.max.y - P.pos.y;
  if (ledge <= 0.001) return null;
  const dx = ax === 'x' ? sgn : 0, dz = ax === 'z' ? sgn : 0;
  if (P.grounded && ledge <= 0.5) {
    if (clearAt(P.pos.x + dx * 0.05, b.max.y + EPS, P.pos.z + dz * 0.05, P.h)) { P.pos.y = b.max.y + EPS; return 'step'; }
    return null;
  }
  if (ledge > MANTLE_REACH || P.slamming || wish.x * dx + wish.z * dz < 0.3) return null;
  const tx = P.pos.x + dx * 0.75, tz = P.pos.z + dz * 0.75, ty = b.max.y + EPS;
  let h = H_STAND;
  if (!clearAt(tx, ty, tz, H_STAND)) { if (!clearAt(tx, ty, tz, H_CROUCH)) return null; h = H_CROUCH; }
  if (!clearAt(P.pos.x, P.pos.y, P.pos.z, ty - P.pos.y + h)) return null;
  // keep the full pre-impact horizontal speed (speed vault), but make sure we carry over the ledge
  let vx = preVel.x, vz = preVel.z;
  const into = vx * dx + vz * dz;
  if (into < 6) { vx += dx * (6 - into); vz += dz * (6 - into); }
  const vault = ledge < 1.3;
  P.mantle = { sx: P.pos.x, sy: P.pos.y, sz: P.pos.z, ex: tx, ey: ty, ez: tz, t: 0, dur: vault ? 0.12 : 0.1 + ledge * 0.07, vx, vz };
  setHeight(h);
  endWallrun(); releaseGrapple(false); P.dashT = 0;
  cue('ledge', { vault, dur: P.mantle.dur });
  addStyle(vault ? 'SPEED VAULT' : 'MANTLE', vault ? 7 : 6);
  sfx(vault ? 600 : 300, vault ? 900 : 500, .12, 'triangle', .06);
  return 'mantle';
}
export function mantleStep(dt) {
  const m = P.mantle; m.t += dt;
  const k = Math.min(m.t / m.dur, 1), ky = 1 - Math.pow(1 - Math.min(k * 1.4, 1), 2), kx = k * k;
  P.pos.set(m.sx + (m.ex - m.sx) * kx, m.sy + (m.ey - m.sy) * ky, m.sz + (m.ez - m.sz) * kx);
  if (k >= 1) {
    P.mantle = null; P.vel.set(m.vx, 0, m.vz);
    P.grounded = true; P.groundT = 0; P.wallJumps = 3; P.lastWrBox = null;
  }
}

// ---------------------------------------------------------------- landing: roll, slam, hard landing
export function land(vy) {
  const impact = -vy;
  P.wallJumps = 3; P.lastWrBox = null; endWallrun();
  if (P.slamming) {
    P.slamming = false;
    if (P.slamT < ROLL_WINDOW) {
      P.vel.x = P.preSlam.x * 1.05; P.vel.z = P.preSlam.z * 1.05;
      if (crouchDown() && hspeed() > SLIDE_MIN) startSlide(true);
      P.stamina = Math.min(100, P.stamina + ROLL_REFILL);
      addStyle('ROLL', 10); cue('roll'); sfx(250, 120, .2, 'triangle', .08);
    } else {
      P.slamPow = Math.min(4 + (P.slamY - P.pos.y) * 0.8, 24); P.slamWin = 0.25;
      shockwave(P.pos); shake(0.45); addStyle('SLAM', 8); cue('slam'); sfx(120, 30, .4, 'sawtooth', .12);
    }
  } else if (impact > HARD_LAND) {
    P.vel.x *= 0.35; P.vel.z *= 0.35; P.stun = 0.3; shake(0.5); cue('hardland');
    style.meter *= 0.5; flash('HARD LANDING · tap Ctrl just before impact to roll', '#ff2f8a');
    sfx(90, 40, .3, 'square', .1);
  } else if (impact > 6) sfx(140, 60, .08, 'sine', .08);
  camfx.landDip = Math.min(impact * 0.01, 0.3);
}
