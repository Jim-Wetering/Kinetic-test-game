import {
  H_STAND, H_CROUCH, GRAV, JUMP_V, MAX_SPEED, RUN, CROUCH_SPEED, G_ACCEL, STAMINA_REGEN, STAMINA_DELAY, DASH_COST,
  AIR_JUMP_COST, AIR_JUMP_V, MOMENTUM_TURN, RUN_START, RUN_BUILD, RUN_SOFT, TURN_SCRUB, SLIDE_FRICTION, SLIDE_MIN,
  DASH_SPEED, DASH_T, SLAM_V,
} from '../config.js';
import { look } from '../state.js';
import { level } from '../world/world.js';
import { camfx } from '../render/effects.js';
import { keys, input, crouchDown } from '../input.js';
import { sfx } from '../audio.js';
import { addStyle } from '../ui/style.js';
import { checkCheckpoint, respawn } from '../game.js';
import { P, fwd, right, wish, hspeed } from './player.js';
import { near, refreshNear, overlapsAt, clearAt, collideAxis, probeWalls, groundWithin } from './collision.js';
import {
  friction, accelerate, airAccel, setHeight, startSlide, startSlam, endWallrun, tryStartWallrun, wallrunStep, wallrunJump,
  wallJump, findHookTarget, releaseGrapple, grappleStep, tryLedge, mantleStep, land,
} from './moves.js';
import { cue } from './anim.js';

// ---------------------------------------------------------------- one fixed physics step
let nearTick = 0;
export function step(dt) {
  P.prev.copy(P.pos);
  if (++nearTick % 6 === 0 || !near.length) refreshNear();
  P.slideCd -= dt; P.grappleCd -= dt; P.stun -= dt; P.slamWin -= dt; P.coyote -= dt; input.jumpBuf -= dt;
  if (P.grounded) { P.groundT += dt; P.airT = 0; } else { P.airT += dt; P.groundT = 0; }

  const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  fwd.set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)); right.set(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
  wish.set(0, 0, 0).addScaledVector(fwd, fw).addScaledVector(right, st);
  if (wish.lengthSq() > 0) wish.normalize();
  if (P.stun > 0) wish.set(0, 0, 0);
  const crouchHeld = crouchDown(), hookHeld = !!keys.KeyE || input.rmb;

  // stamina refills after a short pause since the last dash or air jump
  if ((P.staminaIdle += dt) > STAMINA_DELAY) P.stamina = Math.min(100, P.stamina + STAMINA_REGEN * dt);

  if (P.mantle) { mantleStep(dt); input.dashQ = input.crouchQ = input.grappleQ = false; return; }

  // grapple
  if (P.grapple && !hookHeld) releaseGrapple(false);
  if (input.grappleQ) {
    input.grappleQ = false;
    if (!P.grapple && P.grappleCd <= 0) {
      const t = findHookTarget();
      if (t) {
        P.grapple = { point: t.point }; endWallrun(); P.slamming = false; P.dashT = 0; P.grounded = false;
        addStyle('GRAPPLE', 8); sfx(900, 300, .15, 'square', .05);
      } else sfx(150, 100, .08, 'square', .04);
    }
  }
  // dash
  if (input.dashQ) {
    input.dashQ = false;
    if (P.stamina >= DASH_COST && P.stun <= 0) {
      P.stamina -= DASH_COST; P.staminaIdle = 0; P.dashT = DASH_T; P.preDash = hspeed();
      P.dashDir.copy(wish.lengthSq() > 0 ? wish : fwd); // the way you're holding, forward if nothing
      endWallrun(); P.slamming = false; releaseGrapple(false);
      addStyle('DASH', 5); cue('dash'); camfx.fovKick = 10; sfx(200, 1200, .15, 'sawtooth', .05);
    }
  }
  // crouch tap in the air: slam, or drop off a wallrun
  if (input.crouchQ) {
    input.crouchQ = false;
    if (!P.grounded && !P.grapple) { if (P.wr) endWallrun(); else if (!P.slamming && P.dashT <= 0) startSlam(); }
  }

  // jump priority: slam jump > dash jump > hook hop > wallrun hop > ground/coyote > wall jump > air jump
  let jumped = false;
  if (input.jumpBuf > 0) {
    // ground, slam, dash and hook jumps swing the arms up; wall and air jumps cue their own animation
    const plainJump = !P.wr && (P.grapple || P.grounded || P.coyote > 0);
    if (P.grounded && P.slamWin > 0) { P.vel.y = JUMP_V + P.slamPow; addStyle('SLAM JUMP', 18); jumped = true; }
    else if (P.dashT > 0 && (P.grounded || P.coyote > 0)) {
      const sp = DASH_SPEED * 0.85;
      P.vel.set(P.dashDir.x * sp, JUMP_V * 0.85, P.dashDir.z * sp); P.dashT = 0;
      addStyle('DASH JUMP', 14); jumped = true;
    }
    else if (P.grapple) { releaseGrapple(true); jumped = true; }
    else if (P.wr) { wallrunJump(); jumped = true; }
    else if (P.grounded || P.coyote > 0) {
      if (P.sliding) { P.sliding = false; addStyle('SLIDE JUMP', 10); }
      else if (P.groundT < 0.06 && hspeed() > RUN + 1.5) addStyle('BHOP', 6);
      P.vel.y = JUMP_V; jumped = true;
    } else {
      const walls = P.wallJumps > 0 ? probeWalls(0.35) : [];
      if (walls.length) { wallJump(walls[0].n); jumped = true; }
      // air jump for stamina, unless we'll land inside the jump buffer window (that press is a bhop)
      else if (!P.slamming && P.stamina >= AIR_JUMP_COST && !groundWithin(Math.max(0.5, -P.vel.y * 0.13))) {
        P.stamina -= AIR_JUMP_COST; P.staminaIdle = 0; P.dashT = 0;
        P.vel.y = Math.max(P.vel.y, AIR_JUMP_V); addStyle('AIR JUMP', 6); cue('airjump'); jumped = true;
      }
    }
    if (jumped && plainJump) cue('jump');
    if (jumped) { input.jumpBuf = 0; P.grounded = false; P.coyote = 0; P.slamWin = 0; sfx(420, 640, .1, 'triangle', .05); }
  }

  // slide / crouch
  if (P.grounded && !jumped && crouchHeld && !P.sliding && hspeed() > SLIDE_MIN && P.dashT <= 0) startSlide(false);
  if (P.sliding && (!crouchHeld || hspeed() < 3.5 || !P.grounded)) P.sliding = false;
  if (P.sliding || (crouchHeld && P.grounded)) setHeight(H_CROUCH);
  else if (P.h < H_STAND && clearAt(P.pos.x, P.pos.y, P.pos.z, H_STAND)) setHeight(H_STAND);

  // velocity
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vel.set(P.dashDir.x * DASH_SPEED, 0, P.dashDir.z * DASH_SPEED);
    if (P.dashT <= 0) { const keep = Math.max(P.preDash, 16); P.vel.x = P.dashDir.x * keep; P.vel.z = P.dashDir.z * keep; }
  } else if (P.grapple) grappleStep(dt);
  else if (P.wr) wallrunStep(dt);
  else if (P.slamming) { P.slamT += dt; P.vel.y = -SLAM_V; }
  else if (P.grounded && !jumped) {
    // running: start at a jog and keep gaining speed in whatever direction you hold
    const hs = hspeed();
    const braking = hs > 0.1 && (P.vel.x * wish.x + P.vel.z * wish.z) / hs < -0.3; // holding back on purpose
    if (!P.sliding && !crouchHeld && P.stun <= 0 && wish.lengthSq() > 0 && hs > RUN_START - 0.5 && !braking) {
      // each extra km/h takes longer but there's no ceiling; steer toward the input, turning hard scrubs speed
      const align = (P.vel.x * wish.x + P.vel.z * wish.z) / hs;
      const gain = RUN_BUILD / (1 + hs / RUN_SOFT);
      const ns = Math.max(RUN_START, hs + (align > 0.5 ? gain * align : -TURN_SCRUB * (0.5 - align)) * dt);
      const nx = P.vel.x / hs + wish.x * MOMENTUM_TURN * dt, nz = P.vel.z / hs + wish.z * MOMENTUM_TURN * dt, l = Math.hypot(nx, nz);
      P.vel.x = nx / l * ns; P.vel.z = nz / l * ns;
    } else if (!P.sliding) {
      friction(dt, 1);
      accelerate(crouchHeld ? CROUCH_SPEED : RUN_START, G_ACCEL, dt);
    } else friction(dt, SLIDE_FRICTION);
    if (P.sliding) {
      const hs = hspeed();
      if (hs > 0.1 && wish.lengthSq() > 0) {
        const nx = P.vel.x / hs + wish.x * 2.2 * dt, nz = P.vel.z / hs + wish.z * 2.2 * dt, l = Math.hypot(nx, nz);
        P.vel.x = nx / l * hs; P.vel.z = nz / l * hs;
      }
    }
    P.vel.y -= GRAV * dt;
  } else {
    airAccel(dt);
    if (!jumped) P.vel.y = Math.max(P.vel.y - GRAV * dt, -55);
  }

  if (!P.grounded && !P.wr && !P.grapple && !P.slamming && P.dashT <= 0 && fw > 0 && P.airT > 0.06) tryStartWallrun();

  const total = P.vel.length();
  if (total > MAX_SPEED) P.vel.multiplyScalar(MAX_SPEED / total);

  // integrate with collision: horizontal in sub-steps, then vertical
  const preVel = P.vel.clone(), preVy = P.vel.y;
  const dx = P.vel.x * dt, dz = P.vel.z * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.25));
  for (let i = 0; i < n; i++) {
    for (const ax of ['x', 'z']) {
      const amt = (ax === 'x' ? dx : dz) / n;
      if (!amt || P.vel[ax] === 0) continue;
      const hit = collideAxis(ax, amt);
      if (!hit) continue;
      const r = tryLedge(hit, ax, Math.sign(amt), preVel);
      if (r === 'mantle') return;
      if (r !== 'step') P.vel[ax] = 0;
    }
  }
  const hitY = collideAxis('y', P.vel.y * dt);
  if (hitY) P.vel.y = 0;

  const was = P.grounded;
  const g = P.vel.y <= 0.01 && !!overlapsAt(P.pos.x, P.pos.y - 0.05, P.pos.z, P.h);
  if (g && !was) land(preVy);
  if (!g && was && !jumped) P.coyote = 0.1;
  P.grounded = g;
  if (g) { P.sliding = P.sliding && crouchHeld; if (P.vel.y < 0) P.vel.y = 0; }

  if (P.wr && !probeWalls(0.3).some((w) => w.n.equals(P.wrN))) endWallrun();
  if (P.wr && P.grounded) endWallrun();

  checkCheckpoint();
  if (P.pos.y < level.killY) respawn();
}
