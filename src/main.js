import * as THREE from 'three';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './style.css';
import { EYE } from './config.js';
import { clamp, load } from './utils.js';
import { game, look, settings } from './state.js';
import { renderer, scene, cam, camDir, sky } from './render/scene.js';
import { camfx, rope, initResize, drawSpeedLines, updateShockwaves } from './render/effects.js';
import { anchors, cps } from './world/world.js';
import { LEVELS, loadLevel } from './world/levels.js';
import { footstep } from './audio.js';
import { keys, crouchDown, initInput } from './input.js';
import { P, right, tmp, hspeed } from './player/player.js';
import { findHookTarget } from './player/moves.js';
import { step } from './player/step.js';
import { style } from './ui/style.js';
import { updateHud } from './ui/hud.js';
import { initMenu } from './ui/menu.js';
import { restart, setState } from './game.js';

// ---------------------------------------------------------------- boot
initResize();
initInput();
initMenu();
game.levelIdx = game.selected = clamp(load('level', 0), 0, LEVELS.length - 1);
loadLevel(game.levelIdx); restart(); setState('menu');

// ---------------------------------------------------------------- main loop
const FIXED = 1 / 120;
let last = performance.now(), acc = 0, hookCheckT = 0, canHook = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (game.state === 'play') {
    acc += dt;
    while (acc >= FIXED) { step(FIXED); acc -= FIXED; }
    if (game.running) game.runTime += dt;
    if (style.meter > 0) style.meter = Math.max(0, style.meter - dt * (4 + style.meter * 0.12));
  }
  const hs = hspeed();
  if (game.state === 'play') {
    if (hs > 18) style.meter = Math.min(260, style.meter + dt * (hs - 18) * 0.6);
    if (game.running) game.topSpeed = Math.max(game.topSpeed, hs);
  }

  // camera
  const alpha = game.state === 'play' ? acc / FIXED : 1;
  P.eye += ((P.h - EYE) - P.eye) * Math.min(1, dt * 14);
  camfx.landDip += (0 - camfx.landDip) * Math.min(1, dt * 7);
  let bob = 0;
  // steps land on each half-cycle of the bob; cadence rises with speed but eases off so top speed isn't a drumroll
  const onFeet = game.state === 'play' && ((P.grounded && !P.sliding) || P.wr);
  if (onFeet && hs > 1) {
    const prevStep = Math.floor(camfx.bobT / Math.PI);
    camfx.bobT += dt * (4 + Math.min(hs, 32) * 0.55);
    if (P.grounded) bob = Math.sin(camfx.bobT) * 0.045 * Math.min(hs / 10, 1);
    if (Math.floor(camfx.bobT / Math.PI) !== prevStep) footstep(hs, crouchDown() && P.grounded, !!P.wr);
  }
  camfx.shakeAmt = Math.max(0, camfx.shakeAmt - dt * 1.5);
  const sh = camfx.shakeAmt * 0.25;
  cam.position.set(
    P.prev.x + (P.pos.x - P.prev.x) * alpha + (Math.random() - 0.5) * sh,
    P.prev.y + (P.pos.y - P.prev.y) * alpha + P.eye - camfx.landDip + bob + (Math.random() - 0.5) * sh,
    P.prev.z + (P.pos.z - P.prev.z) * alpha + (Math.random() - 0.5) * sh);
  right.set(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const rollT = P.wr ? -P.wrN.dot(right) * 0.2 : P.sliding ? 0.05 : -strafe * 0.015 * Math.min(hs / 10, 1.5);
  camfx.roll += (rollT - camfx.roll) * Math.min(1, dt * 8);
  cam.rotation.set(look.pitch, look.yaw, settings.fx ? camfx.roll : 0);
  camfx.fovKick = Math.max(0, camfx.fovKick - dt * 40);
  const targetH = settings.fov + clamp((hs - 10) * 0.75, 0, 28) + camfx.fovKick;
  camfx.curFov += (targetH - camfx.curFov) * Math.min(1, dt * 6);
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camfx.curFov) / 2) / cam.aspect));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  cam.getWorldDirection(camDir);
  sky.position.copy(cam.position);

  if ((hookCheckT -= dt) <= 0) { hookCheckT = 0.05; canHook = game.state === 'play' && !P.grapple && P.grappleCd <= 0 && !!findHookTarget(); }

  // world fx
  const t = now / 1000;
  for (const a of anchors) { a.mesh.rotation.y = t * 1.5; a.ring.rotation.x = t * 0.8; }
  const nc = cps[game.cpIndex];
  if (nc) nc.mesh.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
  updateShockwaves(dt);
  rope.visible = !!P.grapple;
  if (P.grapple) {
    const pa = rope.geometry.attributes.position;
    tmp.copy(cam.position).addScaledVector(right, 0.3); tmp.y -= 0.35;
    pa.setXYZ(0, tmp.x, tmp.y, tmp.z); pa.setXYZ(1, P.grapple.point.x, P.grapple.point.y, P.grapple.point.z); pa.needsUpdate = true;
  }

  updateHud(dt, hs, canHook);
  renderer.render(scene, cam);
  drawSpeedLines(hs);
}
requestAnimationFrame(frame);
