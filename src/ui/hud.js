import { DASH_COST, MAX_HSPEED } from '../config.js';
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

// the page is only written to when a value has actually changed: every write makes the browser restyle, lay out and
// repaint the HUD, and on a slow machine doing that for twenty unchanged values a frame cost more than the game.
// bars fill with a transform rather than a width, which skips layout altogether
const shown = new WeakMap();
function put(el, key, v) {
  let s = shown.get(el);
  if (!s) shown.set(el, s = {});
  if (s[key] === v) return;
  s[key] = v;
  if (key === 'text') el.textContent = v; else if (key === 'html') el.innerHTML = v; else if (key === 'class') el.className = v; else el.style[key] = v;
}
const fill = (el, f) => put(el, 'transform', `scaleX(${clamp(f, 0, 1).toFixed(3)})`);

let feedTick = 0, textTick = 0;
export function updateHud(dt, hs, canHook) {
  // the numbers that change every frame (the timer's hundredths, the speed, the distance) are redrawn 30 times a
  // second: faster than that can't be read, and each redraw repaints their brushed lettering
  const tick = (textTick += dt) >= 1 / 30;
  if (tick) textTick = 0;
  if (tick || !game.running) put(hud.timer, 'text', fmt(game.runTime));
  put(hud.cp, 'text', (lapsOf() > 1 ? `LAP ${game.lap}/${lapsOf()} · ` : '') + `CHECKPOINT ${Math.min(game.cpIndex, cps.length)}/${cps.length}`);
  put(hud.best, 'text', 'BEST ' + fmt(game.best));
  put(hud.lvl, 'text', LEVELS[game.levelIdx].name.toUpperCase());
  const nc = cps[game.cpIndex];
  put(hud.nav, 'display', nc ? '' : 'none');
  if (nc) { // compass toward the next checkpoint, relative to where you're looking
    const dx = nc.x - P.pos.x, dz = nc.z - P.pos.z;
    let rel = Math.atan2(-dx, -dz) - look.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    put(hud.navArrow, 'transform', `rotate(${(-rel).toFixed(3)}rad)`);
    if (tick) put(hud.navDist, 'text', Math.round(Math.hypot(dx, dz)) + ' M');
  }
  if (tick) { put(hud.speed, 'text', hs.toFixed(0)); put(hud.kmh, 'text', (hs * 3.6).toFixed(0)); }
  fill(hud.bar, hs / MAX_HSPEED);
  fill(hud.stam.firstElementChild, P.stamina / 100);
  put(hud.stam, 'class', P.stamina < DASH_COST ? 'low' : '');
  hud.wj.forEach((p, i) => fill(p, i < P.wallJumps ? 1 : 0));
  put(hud.hook, 'text', P.grapple ? 'ATTACHED' : P.grappleCd > 0 ? 'COOLDOWN' : 'READY');
  put(hud.hook, 'class', P.grappleCd > 0 && !P.grapple ? 'cd' : '');
  hud.cross.classList.toggle('hook', canHook);
  const r = rankOf(style.meter), ri = RANKS.indexOf(r), nextT = RANKS[ri + 1] ? RANKS[ri + 1][1] : 260;
  put(hud.rank, 'text', r[0]); put(hud.rank, 'color', r[2]); put(hud.meter.parentElement, 'color', r[2]);
  fill(hud.meter, (style.meter - r[1]) / (nextT - r[1]));
  style.feed.forEach((f) => { f.t -= dt; });
  while (style.feed.length && style.feed[style.feed.length - 1].t <= 0) style.feed.pop();
  if ((feedTick += dt) > 0.1) {
    feedTick = 0;
    put(hud.feed, 'html', style.feed.map((f) => `<div style="opacity:${Math.min(f.t, 1).toFixed(2)}">+ ${f.name}<span>${f.v}</span></div>`).join(''));
  }
  if (msgT > 0 && (msgT -= dt) <= 0) msgEl.style.opacity = 0;
}
