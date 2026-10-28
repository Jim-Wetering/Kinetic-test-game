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
  const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 40), new THREE.MeshBasicMaterial({ color: theme.ink, transparent: true, side: THREE.DoubleSide }));
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

// speed lines as dry pen strokes: thin ink slivers, fat at the outer end and tapering toward the centre. each one
// lives for a moment and glides outward, swelling in and thinning out, instead of the whole set re-rolling every
// frame (which strobes)
const streaks = Array.from({ length: 60 }, () => ({ p: Math.random() }));
function respawn(st) { st.a = Math.random() * Math.PI * 2; st.len = 0.4 + Math.random(); st.w = 0.8 + Math.random() * 2.2; st.v = 0.7 + Math.random() * 0.6; }
streaks.forEach(respawn);
let lastT = performance.now();
export function drawSpeedLines(hs) {
  const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
  lctx.clearRect(0, 0, lines.width, lines.height);
  if (!settings.fx || hs < 15 || game.state !== 'play') return;
  const w = lines.width, h = lines.height, cxs = w / 2, cys = h / 2, diag = Math.hypot(w, h) / 2;
  const k = Math.min((hs - 15) / 30, 1), count = Math.round(14 + k * 46);
  lctx.fillStyle = `rgba(${theme.lines},${0.14 + k * 0.3})`;
  lctx.beginPath();
  for (let i = 0; i < count; i++) {
    const st = streaks[i];
    st.p += dt * (1.2 + k * 2.4) * st.v;
    if (st.p > 1) { st.p -= 1; respawn(st); }
    const r0 = diag * (0.5 + st.p * 0.45), r1 = r0 + diag * (0.1 + k * 0.35) * st.len;
    const half = st.w * (0.5 + k) * Math.sin(st.p * Math.PI) / r1;
    lctx.moveTo(cxs + Math.cos(st.a) * r0, cys + Math.sin(st.a) * r0);
    lctx.lineTo(cxs + Math.cos(st.a + half) * r1, cys + Math.sin(st.a + half) * r1);
    lctx.lineTo(cxs + Math.cos(st.a - half) * r1, cys + Math.sin(st.a - half) * r1);
    lctx.closePath();
  }
  lctx.fill();
}
