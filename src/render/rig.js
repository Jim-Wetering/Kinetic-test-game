import * as THREE from 'three';
import { renderer, scene, cam } from './scene.js';
import { matHull } from './materials.js';
import { inkMat } from './ink.js';
import { look } from '../state.js';
import { pose, VM_FOV, SHOULDER, HIP_W, viewToWorld } from '../player/anim.js';

// ---------------------------------------------------------------- player rig
// the arms draw in their own pass on top of the world with a fixed FOV, so they never clip into walls or
// stretch with the speed FOV kick. legs and torso stand in the world, so floors and walls hide them
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(VM_FOV, 1, 0.01, 10);
vmScene.add(vmCam);
const body = new THREE.Group(); scene.add(body);

// street-runner outfit: a worn olive jacket, charcoal cargo pants, a burnt-orange trim and grey trainers. the ink shader lights
// both passes from the theme; the arms skip fog since they're always right in front of you
const toon = (hex, fog = true) => inkMat({ color: hex, fog });
const M = { sleeve: toon(0x5a5e46, false), skin: toon(0xb08468, false), glove: toon(0x2a2a2c, false), accent: toon(0xc8602a, false),
  pants: toon(0x34363a), sole: toon(0xe6e2d8), torso: toon(0x5a5e46), kicks: toon(0x8a8c8e) };
const ARM_A = 0.3, ARM_B = 0.28, LEG_A = 0.46, LEG_B = 0.45, INK_ARM = 0.009, INK_HAND = 0.005, INK_LEG = 0.016;

// a mesh with a slightly bigger back-face hull: the same ink outline the world uses
function inked(geo, hull, mat) { const m = new THREE.Mesh(geo, mat); m.add(new THREE.Mesh(hull, matHull)); return m; }
const box = (w, h, d, x, y, z, mat, ink) => inked(new THREE.BoxGeometry(w, h, d).translate(x, y, z),
  new THREE.BoxGeometry(w + ink * 2, h + ink * 2, d + ink * 2).translate(x, y, z), mat);
// limb segment from its joint along +y (r0 at the joint, r1 at the far end), aimed with setFromUnitVectors
function limb(r0, r1, len, mat, ink, endMat = mat) {
  const m = inked(new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0),
    new THREE.CylinderGeometry(r1 + ink, r0 + ink, len + ink * 2, 8).translate(0, len / 2, 0), mat);
  const j = inked(new THREE.SphereGeometry(r1, 8, 6), new THREE.SphereGeometry(r1 + ink, 8, 6), endMat); // elbow / knee
  j.position.y = len; m.add(j);
  return m;
}

// fingerless glove, wrist at the origin, fingers along -z, palm facing -y. thumb on the inside (-x for the right)
function makeHand(s) {
  const g = new THREE.Group(), fingers = [];
  g.add(box(0.075, 0.032, 0.085, 0, 0, -0.045, M.glove, INK_HAND));
  g.add(box(0.077, 0.01, 0.02, 0, 0.017, -0.076, M.accent, INK_HAND)); // knuckle guard
  // index → pinky: x, proximal length, distal length
  for (const [x, l1, l2] of [[-0.027, 0.04, 0.032], [-0.009, 0.046, 0.036], [0.009, 0.044, 0.034], [0.027, 0.034, 0.028]]) {
    const base = new THREE.Group(), mid = new THREE.Group();
    base.position.set(x * s, 0, -0.087); mid.position.z = -l1;
    base.add(box(0.017, 0.019, l1, 0, 0, -l1 / 2, M.skin, INK_HAND), mid);
    mid.add(box(0.016, 0.017, l2, 0, 0, -l2 / 2, M.skin, INK_HAND));
    g.add(base); fingers.push([base, mid]);
  }
  const thumb = new THREE.Group(), tip = new THREE.Group();
  thumb.position.set(-0.035 * s, -0.006, -0.025); thumb.rotation.order = 'YXZ';
  tip.position.z = -0.04;
  thumb.add(box(0.021, 0.021, 0.04, 0, 0, -0.02, M.glove, INK_HAND), tip);
  tip.add(box(0.019, 0.019, 0.03, 0, 0, -0.015, M.skin, INK_HAND));
  g.add(thumb);
  return { g, fingers, thumb, tip, s };
}
function curlHand(h, c) {
  for (const [base, mid] of h.fingers) { base.rotation.x = -c * 1.4; mid.rotation.x = -c * 1.6; }
  h.thumb.rotation.y = h.s * (0.5 + c * 0.6); h.thumb.rotation.x = -0.3 - c * 0.6; h.tip.rotation.x = -c * 0.9;
}

const arms = [-1, 1].map((s, i) => {
  const upper = limb(0.052, 0.045, ARM_A, M.sleeve, INK_ARM), fore = limb(0.044, 0.034, ARM_B, M.skin, INK_ARM, M.glove);
  fore.add(inked(new THREE.CylinderGeometry(0.037, 0.039, 0.035, 8).translate(0, ARM_B - 0.03, 0), // wrist wrap
    new THREE.CylinderGeometry(0.037 + INK_HAND, 0.039 + INK_HAND, 0.035 + INK_HAND * 2, 8).translate(0, ARM_B - 0.03, 0), M.accent));
  const h = makeHand(s);
  vmCam.add(upper, fore, h.g);
  return { i, upper, fore, hand: h, shoulder: new THREE.Vector3(SHOULDER[0] * s, SHOULDER[1], SHOULDER[2]) };
});
const pelvis = box(0.3, 0.17, 0.2, 0, 0, 0, M.pants, INK_LEG);
const torso = box(0.32, 0.4, 0.18, 0, 0.2, 0, M.torso, INK_LEG);
body.add(pelvis, torso);
const legs = [-1, 1].map((s, i) => {
  const thigh = limb(0.075, 0.058, LEG_A, M.pants, INK_LEG), shin = limb(0.058, 0.045, LEG_B, M.pants, INK_LEG);
  const shoe = new THREE.Group();
  shoe.add(box(0.1, 0.085, 0.26, 0, -0.03, -0.07, M.kicks, INK_LEG), box(0.104, 0.025, 0.264, 0, -0.075, -0.07, M.sole, INK_LEG));
  body.add(thigh, shin, shoe);
  return { i, s, thigh, shin, shoe };
});

// ---------------------------------------------------------------- ik
const Y = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _u = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const mid = new THREE.Vector3(), end = new THREE.Vector3(), hip = new THREE.Vector3();
// two-bone IK: the elbow/knee for a root, target and bend direction. out-of-reach targets get a straight limb
function solve(root, target, a, b, pole) {
  _u.subVectors(target, root);
  const d = THREE.MathUtils.clamp(_u.length(), Math.abs(a - b) + 1e-3, a + b - 1e-4);
  if (_u.lengthSq() < 1e-10) _u.set(0, 0, -1); else _u.normalize();
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0).addScaledVector(_u, _u.y);
  _p.normalize();
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  mid.copy(root).addScaledVector(_u, a * ca).addScaledVector(_p, a * sa);
  end.copy(root).addScaledVector(_u, d);
}
function aim(m, from, to) {
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(Y, _d.subVectors(to, from).normalize());
}
// local -z along `fwd`, local -y along `under` (palm / sole)
function orient(o, fwd, under) {
  _z.copy(fwd).negate().normalize();
  _y.copy(under).negate().addScaledVector(_z, under.dot(_z));
  if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
  _y.normalize(); _x.crossVectors(_y, _z);
  o.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

// feet: the interpolated player position this frame (the camera sits right above it)
export function updateRig(feet) {
  vmCam.quaternion.copy(cam.quaternion);
  if (vmCam.aspect !== cam.aspect) { vmCam.aspect = cam.aspect; vmCam.updateProjectionMatrix(); }
  for (const a of arms) {
    const h = pose.hands[a.i];
    solve(a.shoulder, h.pos, ARM_A, ARM_B, h.pole);
    aim(a.upper, a.shoulder, mid); aim(a.fore, mid, end);
    a.hand.g.position.copy(end); orient(a.hand.g, h.fin, h.palm); curlHand(a.hand, h.curl);
  }
  body.position.copy(feet); body.rotation.y = look.yaw; body.visible = !pose.hideBody;
  pelvis.position.copy(pose.hips); aim(torso, pose.hips, pose.chest);
  for (const l of legs) {
    const f = pose.feet[l.i];
    hip.set(pose.hips.x + HIP_W * l.s, pose.hips.y - 0.05, pose.hips.z);
    solve(hip, f.pos, LEG_A, LEG_B, f.pole);
    aim(l.thigh, hip, mid); aim(l.shin, mid, end);
    l.shoe.position.copy(end); orient(l.shoe, f.toe, DOWN);
  }
}

// draws into whatever render target is current: the post pass hands it the viewmodel target
export function renderViewmodel() { renderer.render(vmScene, vmCam); }

// world-space point in the right fist, where the grapple line starts
const grip = new THREE.Vector3();
export function gripPoint(out) {
  grip.copy(arms[1].hand.g.position).addScaledVector(_d.copy(pose.hands[1].fin).normalize(), 0.06);
  return viewToWorld(grip, out);
}
