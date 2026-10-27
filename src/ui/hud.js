import { DASH_COST } from '../config.js';
import { clamp, fmt } from '../utils.js';
import { game, look } from '../state.js';
import { cps } from '../world/world.js';
import { LEVELS, lapsOf } from '../world/levels.js';
import { P } from '../player/player.js';
import { RANKS, style, rankOf } from './style.js';

// ---------------------------------------------------------------- hud
const $ = (id) => document.getElementById(id);
const hud = { timer: $('timer'), cp: $('cpText'), best: $('best'), speed: $('speed'), kmh: $('kmh'), bar: $('speedBar').firstElementChild,
  stam: $('stam'), wj: [...$('wj').querySelectorAll('i')], hook: $('hook'), cross: $('cross'),
  rank: $('rank'), meter: $('meter').firstElementChild, feed: $('feed'), lvl: $('lvlName'), nav: $('nav'), navArrow: $('navArrow'), navDist: $('navDist') };

const msgEl = $('msg');
let msgT = 0;
export function flash(text, color) { msgEl.textContent = text; msgEl.style.color = color; msgEl.style.opacity = 1; msgT = 1.6; }

let feedTick = 0;
export function updateHud(dt, hs, canHook) {
  hud.timer.textContent = fmt(game.runTime);
  hud.cp.textContent = (lapsOf() > 1 ? `LAP ${game.lap}/${lapsOf()} · ` : '') + `CHECKPOINT ${Math.min(game.cpIndex, cps.length)}/${cps.length}`;
  hud.best.textContent = 'BEST ' + fmt(game.best);
  hud.lvl.textContent = LEVELS[game.levelIdx].name.toUpperCase();
  const nc = cps[game.cpIndex];
  hud.nav.style.display = nc ? '' : 'none';
  if (nc) { // compass toward the next checkpoint, relative to where you're looking
    const dx = nc.x - P.pos.x, dz = nc.z - P.pos.z;
    let rel = Math.atan2(-dx, -dz) - look.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    hud.navArrow.style.transform = `rotate(${-rel}rad)`;
    hud.navDist.textContent = Math.round(Math.hypot(dx, dz)) + ' M';
  }
  hud.speed.textContent = hs.toFixed(0); hud.kmh.textContent = (hs * 3.6).toFixed(0);
  hud.bar.style.width = Math.min(hs / 45, 1) * 100 + '%';
  hud.stam.firstElementChild.style.width = P.stamina + '%';
  hud.stam.classList.toggle('low', P.stamina < DASH_COST);
  hud.wj.forEach((p, i) => { p.style.width = (i < P.wallJumps ? 100 : 0) + '%'; });
  hud.hook.textContent = P.grapple ? 'ATTACHED' : P.grappleCd > 0 ? 'COOLDOWN' : 'READY';
  hud.hook.className = P.grappleCd > 0 && !P.grapple ? 'cd' : '';
  hud.cross.classList.toggle('hook', canHook);
  const r = rankOf(style.meter), ri = RANKS.indexOf(r), nextT = RANKS[ri + 1] ? RANKS[ri + 1][1] : 260;
  hud.rank.textContent = r[0]; hud.rank.style.color = r[2]; hud.meter.parentElement.style.color = r[2];
  hud.meter.style.width = clamp((style.meter - r[1]) / (nextT - r[1]), 0, 1) * 100 + '%';
  style.feed.forEach((f) => { f.t -= dt; });
  while (style.feed.length && style.feed[style.feed.length - 1].t <= 0) style.feed.pop();
  if ((feedTick += dt) > 0.1) {
    feedTick = 0;
    hud.feed.innerHTML = style.feed.map((f) => `<div style="opacity:${Math.min(f.t, 1)}">+ ${f.name}<span>${f.v}</span></div>`).join('');
  }
  if (msgT > 0 && (msgT -= dt) <= 0) msgEl.style.opacity = 0;
}
