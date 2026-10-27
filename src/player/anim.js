import * as THREE from 'three';
import { R } from '../config.js';
import { clamp } from '../utils.js';
import { look, settings } from '../state.js';
import { cam } from '../render/scene.js';
import { camfx } from '../render/effects.js';
import { crouchDown } from '../input.js';
import { P, hspeed } from './player.js';

// ---------------------------------------------------------------- first-person body animation
// hands live in camera space (x right, y up, -z forward). feet, hips and chest live in body space (feet at
// the origin, facing -z along the view yaw). poses are written for the right side with +x pointing outward
// and mirrored for the left. render/rig.js turns the result into arms and legs with two-bone IK.
export const VM_FOV = 62; // vertical FOV of the arms pass
export const SHOULDER = [0.2, -0.26, 0.1];
export const HIP_W = 0.1;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// wrist position, finger direction, palm direction, finger curl (0 open, 1 fist), elbow bend direction
const hand = (p = [0, 0, 0], f = [0, 0, -1], n = [-1, 0, 0], c = 0, e = [1, -1, 0]) =>
  ({ pos: V(...p), fin: V(...f).normalize(), palm: V(...n).normalize(), curl: c, pole: V(...e).normalize() });
// ankle position, toe direction, knee bend direction
const foot = () => ({ pos: V(0, 0.08, 0), toe: V(0, 0, -1), pole: V(0, 0, -1) });

// key poses for the right hand
const H = {
  idle: hand([0.22, -0.37, -0.27], [0.1, -0.5, -1], [-1, -0.3, 0], 0.35, [1, -1, 0.4]),
  runF: hand([0.1, -0.18, -0.42], [-0.35, 0.3, -1], [-0.7, -0.7, 0], 0.2, [1, -1, 0.4]), // blade hand driving forward
  runB: hand([0.27, -0.46, -0.05], [0.05, -0.8, -1], [-1, 0, 0], 0.3, [1, -0.5, 1]),
  rise: hand([0.2, -0.12, -0.4], [0, 0.6, -1], [-0.6, -0.5, 0], 0.25, [1, -1, 0.3]),
  fall: hand([0.3, -0.06, -0.34], [0.35, 0.7, -0.7], [0, -1, 0.2], 0.1, [1, -0.4, 0.2]), // arms up and wide
  crouch: hand([0.17, -0.33, -0.34], [-0.15, -0.2, -1], [-1, -0.4, 0], 0.3, [1, -1, 0.3]),
  slideF: hand([0.2, -0.2, -0.43], [-0.2, 0.15, -1], [-0.2, -1, 0], 0.15, [1, -1, 0.2]),
  slideB: hand([0.4, -0.55, -0.15], [0.3, -0.6, -1], [0, -1, 0], 0.2, [1, 0, 0.6]), // trailing low by the floor
  slam: hand([0.16, 0.03, -0.32], [0, 1, -0.25], [-1, 0, 0], 1, [1, -0.3, 0.4]), // fists up
  punch: hand([0.13, -0.34, -0.43], [0, -1, -0.6], [-1, 0, 0], 1, [1, 0, 0.5]), // fists driven down
  sweep: hand([0.3, -0.44, 0], [0.1, -1, -0.2], [-1, 0, 0], 0.15, [1, -0.3, 1]), // swept back and low
  brace: hand([0.2, -0.2, -0.45], [0, -0.3, -1], [0, -1, 0], 0, [1, -1, 0]), // palms down to catch a landing
  tuck: hand([0.1, -0.22, -0.38], [-0.7, 0, -1], [0, -1, 0], 0.5, [1, -1, 0]),
  plant: hand([0.15, -0.26, -0.47], [0, -0.1, -1], [0, -1, 0], 0.1, [1, -0.6, 0.3]), // vault: palms flat on the ledge
  grab: hand([0.17, -0.1, -0.45], [0, -0.6, -1], [0, -1, 0], 0.55, [1, -0.6, 0.3]), // mantle: fingers hooked over it
};

const copyH = (o, a) => {
  o.pos.copy(a.pos); o.fin.copy(a.fin); o.palm.copy(a.palm); o.curl = a.curl; o.pole.copy(a.pole); return o;
};
const mixH = (o, b, t) => {
  o.pos.lerp(b.pos, t); o.fin.lerp(b.fin, t); o.palm.lerp(b.palm, t); o.curl += (b.curl - o.curl) * t; o.pole.lerp(b.pole, t); return o;
};
const mixF = (o, b, t) => { o.pos.lerp(b.pos, t); o.toe.lerp(b.toe, t); o.pole.lerp(b.pole, t); return o; };
const flipH = (o) => { o.pos.x = -o.pos.x; o.fin.x = -o.fin.x; o.palm.x = -o.palm.x; o.pole.x = -o.pole.x; return o; };
const flipF = (o) => { o.pos.x = -o.pos.x; o.toe.x = -o.toe.x; o.pole.x = -o.pole.x; return o; };
const smooth = (x) => x * x * (3 - 2 * x);
// 0 → 1 over the first `a` of an action, then back to 0 by its end
const env = (k, a) => (k < a ? smooth(k / a) : smooth(1 - (k - a) / (1 - a)));

// the two passes use different FOVs, so map points through the screen: same pixel, same depth
const fovRatio = () => Math.tan(VM_FOV * Math.PI / 360) / Math.tan(cam.fov * Math.PI / 360);
export function worldToView(p, out) {
  out.copy(p).applyMatrix4(cam.matrixWorldInverse);
  const r = fovRatio(); out.x *= r; out.y *= r; return out;
}
export function viewToWorld(p, out) {
  const r = fovRatio(); out.set(p.x / r, p.y / r, p.z); return cam.localToWorld(out);
}
const toView = (d) => d.transformDirection(cam.matrixWorldInverse);
const toWorld = (d) => d.transformDirection(cam.matrixWorld);

const cur = [hand(), hand()], goal = [hand(), hand()], tmpH = hand();
const fcur = [foot(), foot()], fgoal = [foot(), foot()], tmpF = foot();
// what rig.js draws; index 0 is the left limb, 1 the right
export const pose = { hands: cur, feet: fcur, hips: V(0, 0.95, 0.2), chest: V(0, 1.65, 0.3), camPitch: 0, hideBody: false };
const hipsGoal = V(), chestGoal = V(), tw = V(), tv = V(), shoulderR = V(...SHOULDER);

// which side of the screen the wall is on during a wallrun: 1 right, -1 left
const wallSide = () => (-P.wrN.x * Math.cos(look.yaw) + P.wrN.z * Math.sin(look.yaw) > 0 ? 1 : -1);

// ---------------------------------------------------------------- one-shot actions
// cue() starts one; it blends over the base pose with env(k, a). higher pri can't be cut off by lower
const ACTS = {
  jump: { dur: 0.3, a: 0.3, hand: (g) => (copyH(g, H.rise), 0.8) },
  airjump: { dur: 0.4, a: 0.15, hand: (g, s, k) => { copyH(g, H.fall); mixH(g, H.sweep, smooth(clamp(k * 1.6, 0, 1))); return 1; } },
  dash: { dur: 0.32, a: 0.2, hand: (g) => (copyH(g, H.sweep), 1) },
  // palm against the wall, arm straightening as you leave it
  push: { dur: 0.32, a: 0.15, hand(g, s, k, d) {
    toView(tw.copy(d.n).negate());
    if (s < 0) tw.x = -tw.x;
    const w = clamp(tw.x * 2.5 + (tw.z < -0.5 ? 1 : 0), 0, 1); // the hand on the wall's side, both if it's ahead
    if (!w) return 0;
    g.pos.copy(shoulderR).addScaledVector(tw, 0.32 + 0.22 * k); g.pos.y += 0.06;
    g.fin.set(0, 1, -0.2).normalize(); g.palm.copy(tw); g.curl = 0; g.pole.set(1, -1, 0).normalize();
    return w;
  } },
  // vault / mantle: the hands plant just in front of you, then stay pinned in the world while you pass over
  ledge: { dur: 0.3, a: 0.08, pri: 1, hand(g, s, k, d) {
    const key = s > 0 ? 'r' : 'l';
    if (!d[key]) {
      copyH(g, d.vault ? H.plant : H.grab);
      if (s < 0) flipH(g);
      d[key] = { pos: viewToWorld(g.pos, V()), fin: toWorld(g.fin.clone()), palm: toWorld(g.palm.clone()) };
    }
    const w = d[key];
    worldToView(w.pos, g.pos); toView(g.fin.copy(w.fin)); toView(g.palm.copy(w.palm));
    if (s < 0) flipH(g);
    return 1;
  },
  foot(g, s, k, d, hipsY) { // speed vault: knees tuck up and to the side to clear the ledge
    if (!d.vault) return 0;
    g.pos.set(0.26, hipsY - 0.32, -0.12); g.toe.set(0.3, 0, -1).normalize(); g.pole.set(1, 0.5, -0.3).normalize();
    return 1;
  },
  cam: (k, w, d) => (d.vault ? -0.05 : -0.08) * w },
  slam: { dur: 0.35, a: 0.1, drop: 0.2, hand: (g) => (copyH(g, H.punch), 1), cam: (k, w) => -0.12 * w },
  hardland: { dur: 0.5, a: 0.12, drop: 0.32, hand: (g) => (copyH(g, H.brace), 1), cam: (k, w) => -0.25 * w },
  // forward roll: a full flip of the view with fx on, a short nod with them off
  roll: { dur: 0.55, a: 0.2, pri: 2, drop: 0.35, hand: (g) => (copyH(g, H.tuck), 1),
    foot(g, s, k, d, hipsY) { g.pos.set(0.12, hipsY - 0.35, -0.25); g.pole.set(0.2, 0.3, -1).normalize(); return 1; },
    cam: (k, w) => (settings.fx ? -Math.PI * 2 * smooth(k) : -0.3 * w) },
};
let act = null;
export function cue(name, d = {}) {
  const A = ACTS[name];
  if (act && (ACTS[act.name].pri || 0) > (A.pri || 0)) return;
  act = { name, t: 0, dur: A.dur + (d.dur || 0), d };
}

// ---------------------------------------------------------------- base poses from movement state
function baseHand(g, s, t) {
  const hs = hspeed(), ph = camfx.bobT + (s > 0 ? 0 : Math.PI);
  if (P.slamming) return copyH(g, H.slam);
  if (P.grapple && s > 0) { // arm out at the hook, fist on the line
    worldToView(P.grapple.point, tv).sub(shoulderR).normalize();
    g.pos.copy(shoulderR).addScaledVector(tv, 0.62); g.fin.copy(tv); g.palm.set(-1, -0.3, 0).normalize();
    g.curl = 0.9; g.pole.set(1, -1, 0).normalize();
    return g;
  }
  if (P.wr && wallSide() === s) { // palm flat on the wall just ahead, sliding along with the run
    tw.copy(cam.position).addScaledVector(P.wrN, -R).addScaledVector(P.wrAlong, 0.38); tw.y -= 0.1;
    worldToView(tw, g.pos);
    toView(g.fin.copy(P.wrAlong).setY(0.7)); toView(g.palm.copy(P.wrN).negate());
    g.curl = 0.05; g.pole.set(0, -1, 0.5).normalize();
    return s < 0 ? flipH(g) : g;
  }
  if (P.grounded && P.sliding) return copyH(g, s > 0 ? H.slideF : H.slideB);
  if (P.grounded || P.wr) {
    // a loose jog swing that turns into a full sprint drive the faster you go
    const amp = clamp((hs - 1) / 11, 0, 1);
    copyH(g, H.runB); mixH(g, H.runF, 0.5 - 0.5 * Math.cos(ph) * amp);
    g.pos.y += Math.sin(ph) * 0.02 * amp;
    if (P.wr) g.pos.x += 0.08; // the free hand swings wide for balance
    const crouch = crouchDown() && !P.wr;
    if (crouch) mixH(g, H.crouch, 0.6);
    const still = 1 - clamp((hs - 0.3) / 3, 0, 1);
    if (still) { mixH(g, crouch ? H.crouch : H.idle, still); g.pos.y += Math.sin(t * 2) * 0.006 * still; }
    return g;
  }
  // in the air: arms come up for balance, higher and wider the faster you fall
  copyH(g, H.rise);
  return mixH(g, H.fall, clamp(-P.vel.y / 16, 0, 1));
}

function baseFoot(g, s, hipsY) {
  const hs = hspeed();
  g.toe.set(0, 0, -1); g.pole.set(0.15, 0, -1).normalize();
  if (P.grounded && P.sliding) {
    if (s < 0) { g.pos.set(0.08, 0.38, -0.8); g.toe.set(0, 0.6, -1).normalize(); } // left leg leads, clear of the right hand
    else { g.pos.set(0.2, 0.07, -0.32); g.pole.set(1, 0.8, -0.2).normalize(); } // the other tucked under
    return g;
  }
  if (P.slamming) { g.pos.set(0.14, hipsY - 0.86, -0.05); g.toe.set(0, -0.4, -1).normalize(); return g; }
  if (!P.grounded && !P.wr) {
    // tucked on the way up, reaching down for the landing on the way down
    const fall = clamp(-P.vel.y / 14, 0, 1);
    g.pos.set(0.13, hipsY - 0.55 - fall * 0.3, -0.18 + s * 0.06);
    if (P.grapple) { g.pos.y -= 0.15; g.pos.z += 0.3; }
    return g;
  }
  // gait along the way you're moving in body space, so strafing and backpedalling step the right way.
  // a step lands each time bobT crosses a multiple of pi, in time with the footstep sounds
  const ph = camfx.bobT + (s > 0 ? Math.PI : 0), c = Math.cos(look.yaw), sn = Math.sin(look.yaw);
  const gw = clamp(hs / 2, 0, 1), stride = Math.min(0.25 + hs * 0.045, 1.3) * gw, lift = (0.08 + Math.min(hs, 30) * 0.012) * gw;
  const along = -Math.cos(ph) * stride / 2;
  g.pos.set(0.12, 0.08 + Math.max(0, Math.sin(ph)) * lift, -0.04);
  if (hs > 0.05) {
    g.pos.x += (P.vel.x * c - P.vel.z * sn) / hs * along * s;
    g.pos.z += (P.vel.x * sn + P.vel.z * c) / hs * along;
  }
  return g;
}

// ---------------------------------------------------------------- per frame
let clock = 0, lastYaw = null, lastPitch = 0, nod = 0;
const sway = V();
export function animate(dt) {
  clock += dt;
  if (act && (act.t += dt) >= act.dur) act = null;
  const A = act && ACTS[act.name], k = act ? act.t / act.dur : 0, w = act ? env(k, A.a) : 0;

  // body: hips track eye height (0.85 crouched → 0.45, 1.65 standing → 0.95). the eye sits ahead of the hips
  // and chest the way a head leans over them, so looking down shows your legs instead of a wall of torso
  const slide = P.grounded && P.sliding;
  let hipsY = slide ? 0.3 : 0.45 + (P.eye - 0.85) * 0.625;
  if (A && A.drop) hipsY -= A.drop * w;
  hipsGoal.set(0, hipsY, slide ? 0.22 : 0.2);
  chestGoal.set(0, P.eye, slide ? 0.45 : 0.3);
  pose.hideBody = !!(A && A.name === 'roll' && settings.fx); // the flip would swing the camera through it

  // look sway: the arms lag a little behind fast turns
  if (lastYaw === null) lastYaw = look.yaw;
  const dYaw = Math.atan2(Math.sin(look.yaw - lastYaw), Math.cos(look.yaw - lastYaw)), dPitch = look.pitch - lastPitch;
  lastYaw = look.yaw; lastPitch = look.pitch;
  const inv = dt > 0 ? 1 / dt : 0, sk = Math.min(1, dt * 10);
  sway.x += (clamp(dYaw * inv * 0.006, -0.05, 0.05) - sway.x) * sk;
  sway.y += (clamp(-dPitch * inv * 0.006, -0.05, 0.05) - sway.y) * sk;

  const hk = 1 - Math.exp(-(A ? 32 : 20) * dt), fk = 1 - Math.exp(-28 * dt); // actions snap in faster
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, g = goal[i], f = fgoal[i];
    baseHand(g, s, clock);
    if (A && A.hand) { const hw = A.hand(copyH(tmpH, g), s, k, act.d) * w; if (hw > 0) mixH(g, tmpH, hw); }
    if (s < 0) flipH(g);
    g.pos.x += sway.x; g.pos.y += sway.y - camfx.landDip * 0.5;
    mixH(cur[i], g, hk);

    baseFoot(f, s, hipsY);
    if (A && A.foot) {
      tmpF.pos.copy(f.pos); tmpF.toe.copy(f.toe); tmpF.pole.copy(f.pole);
      const fw = A.foot(tmpF, s, k, act.d, hipsY) * w;
      if (fw > 0) mixF(f, tmpF, fw);
    }
    if (s < 0) flipF(f);
    mixF(fcur[i], f, fk);
  }
  pose.hips.lerp(hipsGoal, fk); pose.chest.lerp(chestGoal, fk);
  // the head tips forward a little in a slide so the lead leg is in view
  nod += ((slide ? -0.1 : 0) - nod) * Math.min(1, dt * 8);
  pose.camPitch = nod + (A && A.cam ? A.cam(k, w, act.d) : 0);
}
