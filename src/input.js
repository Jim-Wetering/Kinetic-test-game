import { clamp } from './utils.js';
import { game, look, settings } from './state.js';
import { renderer } from './render/scene.js';
import { restart, setState } from './game.js';
import { lockAndPlay } from './ui/menu.js';

// ---------------------------------------------------------------- input
export const keys = {};
export const input = { jumpBuf: 0, dashQ: false, crouchQ: false, grappleQ: false, rmb: false };

const isCrouchKey = (code) => code === 'ControlLeft' || code === 'ControlRight' || code === 'KeyC';
export const crouchDown = () => !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);

export function initInput() {
  addEventListener('keydown', (e) => {
    // while playing, swallow browser shortcuts (Ctrl+W/S/D...) so Ctrl works as crouch
    if (e.code === 'Space' || (game.state === 'play' && (e.ctrlKey || e.code.startsWith('Control')))) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Escape') { // straight to the menu / level select
      if (game.state === 'play') { game.selected = game.levelIdx; setState('paused'); if (document.exitPointerLock) document.exitPointerLock(); }
      else if (game.state === 'done') { game.selected = game.levelIdx; restart(); }
      return;
    }
    if (e.code === 'KeyR' && (game.state === 'play' || game.state === 'done')) { const wasDone = game.state === 'done'; restart(); if (wasDone) lockAndPlay(); return; }
    if (game.state !== 'play') return;
    if (e.code === 'Space') input.jumpBuf = 0.13;
    else if (isCrouchKey(e.code)) input.crouchQ = true;
    else if (e.code === 'KeyE') input.grappleQ = true;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.dashQ = true;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) game.running = true;
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.rmb = false; });
  addEventListener('mousedown', (e) => { if (game.state === 'play' && e.button === 2) { input.rmb = true; input.grappleQ = true; } });
  addEventListener('mouseup', (e) => { if (e.button === 2) input.rmb = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (game.state !== 'play' || !(look.locked || e.buttons)) return;
    look.yaw -= e.movementX * 0.0022 * settings.sens;
    look.pitch = clamp(look.pitch - e.movementY * 0.0022 * settings.sens, -1.55, 1.55);
  });
  document.addEventListener('pointerlockchange', () => {
    look.locked = document.pointerLockElement === renderer.domElement;
    if (!look.locked && game.state === 'play') setState('paused');
  });
}
