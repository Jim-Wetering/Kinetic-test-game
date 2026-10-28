import * as THREE from 'three';
import { renderer, scene, cam } from './scene.js';
import { theme } from './themes.js';
import { setPostSize } from './post.js';
import { game, settings } from '../state.js';

// ---------------------------------------------------------------- fx
// camera feel, written by the player (landings, dashes) and eased back by the main loop
export const camfx = { landDip: 0, shakeAmt: 0, fovKick: 0, roll: 0, bobT: 0, curFov: settings.fov };
const shockwaves = [];
export function shake(a) { if (settings.fx) camfx.shakeAmt = Math.max(camfx.shakeAmt, a); }
export function shockwave(pos) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 40), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + 0.05, pos.z); scene.add(m);
  shockwaves.push({ m, t: 0 });
}
export function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i]; s.t += dt;
    s.m.scale.setScalar(1 + s.t * 30); s.m.material.opacity = Math.max(0, 1 - s.t * 2.5);
    if (s.t > 0.4) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); shockwaves.splice(i, 1); }
  }
}

export const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x3ef0ff }));
rope.frustumCulled = false; scene.add(rope);

const lines = document.getElementById('lines'), lctx = lines.getContext('2d');
function resize() {
  renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight;
  setPostSize(innerWidth, innerHeight);
  lines.width = innerWidth; lines.height = innerHeight;
}
export function initResize() { addEventListener('resize', resize); resize(); }

// manga speed lines as brush strokes: each one is a sliver that's fat at the screen edge and tapers to a point
// toward the centre. a few in the level's accent colour
export function drawSpeedLines(hs) {
  lctx.clearRect(0, 0, lines.width, lines.height);
  if (!settings.fx || hs < 15 || game.state !== 'play') return;
  const w = lines.width, h = lines.height, cxs = w / 2, cys = h / 2, diag = Math.hypot(w, h) / 2;
  const k = Math.min((hs - 15) / 30, 1), count = 16 + k * 60;
  for (const accent of [false, true]) {
    lctx.fillStyle = accent ? theme.accent : `rgba(${theme.lines},${0.18 + k * 0.4})`;
    lctx.globalAlpha = accent ? 0.35 + k * 0.4 : 1;
    lctx.beginPath();
    for (let i = 0, n = accent ? count * 0.15 : count; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r0 = diag * (0.5 + Math.random() * 0.35), r1 = r0 + diag * (0.12 + k * 0.4) * (0.4 + Math.random());
      const half = (2 + Math.random() * 5 * (0.5 + k)) / r1, c = Math.cos(a), s = Math.sin(a);
      lctx.moveTo(cxs + c * r0, cys + s * r0);
      lctx.lineTo(cxs + Math.cos(a + half) * r1, cys + Math.sin(a + half) * r1);
      lctx.lineTo(cxs + Math.cos(a - half) * r1, cys + Math.sin(a - half) * r1);
      lctx.closePath();
    }
    lctx.fill();
  }
  lctx.globalAlpha = 1;
}
