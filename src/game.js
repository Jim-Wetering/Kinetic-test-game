import { EPS } from './config.js';
import { save, fmt } from './utils.js';
import { game } from './state.js';
import { cpMats, pillar } from './render/materials.js';
import { cps, level } from './world/world.js';
import { HALF_W } from './world/line.js';
import { LEVELS, lapsOf } from './world/levels.js';
import { sfx } from './audio.js';
import { P, resetPlayer } from './player/player.js';
import { refreshNear } from './player/collision.js';
import { style } from './ui/style.js';
import { flash } from './ui/hud.js';
import { renderLevels } from './ui/menu.js';

// ---------------------------------------------------------------- game flow: checkpoints, laps, restart, finish
export function setCpMats() {
  cps.forEach((c, i) => { c.mesh.material = i < game.cpIndex ? cpMats.done : i === game.cpIndex ? (c.finish ? cpMats.finish : cpMats.next) : cpMats.later; });
  const n = cps[game.cpIndex];
  pillar.visible = !!n;
  if (n) { pillar.position.set(n.x, n.top + 200, n.z); pillar.material.color.copy((n.finish ? cpMats.finish : cpMats.next).color); }
}
export function checkCheckpoint() {
  const c = cps[game.cpIndex];
  if (!c) return;
  const hit = c.plane ? P.pos.z < c.z && Math.abs(P.pos.x - c.x) < HALF_W + 3 && P.pos.y > c.y - 12
    : Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 5.5 && P.pos.y > c.top - 2 && P.pos.y < c.top + 9;
  if (hit) {
    game.cpIndex++;
    if (c.finish) {
      const lt = game.runTime - game.lapStart;
      if (game.bestLap === null || lt < game.bestLap) game.bestLap = lt;
      if (game.lap < lapsOf()) {
        game.lap++; game.lapStart = game.runTime; game.cpIndex = 0; setCpMats();
        flash(`LAP ${game.lap}/${lapsOf()} · LAST LAP ${fmt(lt)}`, '#ffd34a');
        sfx(523, 1046, .3, 'triangle', .1);
        return;
      }
      setCpMats(); finish(); return;
    }
    setCpMats();
    flash(`CHECKPOINT ${game.cpIndex} · ${fmt(game.runTime)}`, '#ffffff');
    sfx(660, 990, .18, 'triangle', .08);
  }
}
export function respawn() {
  // on lap 2+ the last checkpoint passed before index 0 is the start/finish line
  const c = cps[game.cpIndex - 1] || (game.lap > 1 ? cps[cps.length - 1] : null);
  const s = level.spawn;
  if (c) resetPlayer(c.x, c.top + EPS, c.plane ? c.z - 1 : c.z, c.yaw); else resetPlayer(s.x, s.y, s.z, s.yaw);
  game.falls++; style.meter = 0; refreshNear();
  flash('RESPAWN', '#ff9a7a');
}
export function restart() {
  const s = level.spawn;
  resetPlayer(s.x, s.y, s.z, s.yaw);
  Object.assign(game, { running: false, runTime: 0, cpIndex: 0, falls: 0, topSpeed: 0, lap: 1, lapStart: 0, bestLap: null });
  style.meter = 0; style.total = 0; style.feed.length = 0; style.last.length = 0;
  setCpMats(); refreshNear();
  if (game.state === 'done') setState('menu');
}
function finish() {
  game.running = false;
  const isBest = game.best === null || game.runTime < game.best;
  if (isBest) { game.best = game.runTime; save('best.' + LEVELS[game.levelIdx].id, game.best); }
  document.getElementById('resLevel').textContent = LEVELS[game.levelIdx].name;
  document.getElementById('rTime').textContent = fmt(game.runTime);
  document.getElementById('rBest').textContent = fmt(game.best);
  document.getElementById('rStyle').textContent = Math.round(style.total);
  document.getElementById('rTop').textContent = game.topSpeed.toFixed(1) + ' m/s';
  document.getElementById('rFalls').textContent = game.falls;
  document.getElementById('resTag').textContent = (isBest ? 'New personal best.' : `${fmt(game.runTime - game.best)} off your best.`)
    + (lapsOf() > 1 ? ` Fastest lap ${fmt(game.bestLap)}.` : '');
  sfx(523, 1046, .5, 'triangle', .1);
  setState('done');
  if (document.exitPointerLock) document.exitPointerLock();
}
export function setState(s) {
  game.state = s;
  document.getElementById('menu').classList.toggle('show', s === 'menu' || s === 'paused');
  document.getElementById('results').classList.toggle('show', s === 'done');
  document.getElementById('menuTitle').textContent = s === 'paused' ? 'PAUSED' : 'KINETIC';
  renderLevels();
}
