import * as THREE from 'three';
import { H_STAND, EYE } from '../config.js';
import { look } from '../state.js';

// ---------------------------------------------------------------- player
export const P = {};
export function resetPlayer(x, y, zz, yw = 0) {
  Object.assign(P, {
    pos: new THREE.Vector3(x, y, zz), prev: new THREE.Vector3(x, y, zz), vel: new THREE.Vector3(), h: H_STAND, eye: H_STAND - EYE,
    grounded: false, coyote: 0, airT: 0, groundT: 0,
    sliding: false, slideCd: 0, slamming: false, slamT: 0, slamY: 0, preSlam: new THREE.Vector3(), slamWin: 0, slamPow: 0,
    dashT: 0, dashDir: new THREE.Vector3(), preDash: 0, wallJumps: 3,
    stamina: 100, staminaIdle: 0,
    wr: false, wrT: 0, wrN: new THREE.Vector3(), wrAlong: new THREE.Vector3(), wrBox: null, lastWrBox: null,
    mantle: null, grapple: null, grappleCd: 0, stun: 0,
  });
  look.yaw = yw; look.pitch = 0;
}

// scratch vectors: fwd/right/wish are rebuilt from input every physics step
export const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
export const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
export const hspeed = () => Math.hypot(P.vel.x, P.vel.z);
