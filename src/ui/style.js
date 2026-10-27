import { game } from '../state.js';

// ---------------------------------------------------------------- style meter
export const RANKS = [['D', 0, '#9aa3b5'], ['C', 15, '#7ad8ff'], ['B', 40, '#7aff9c'], ['A', 70, '#ffe27a'],
  ['S', 105, '#ff9f4a'], ['SS', 150, '#ff5a3a'], ['SSS', 200, '#ff2e6a']];
export const style = { meter: 0, total: 0, feed: [], last: [] };
export function rankOf(m) { let r = RANKS[0]; for (const k of RANKS) if (m >= k[1]) r = k; return r; }
export function addStyle(name, pts) {
  if (!game.running) return;
  const rep = style.last.filter((n) => n === name).length; // variety beats spam
  const v = Math.round(pts * (rep === 0 ? 1 : rep === 1 ? 0.6 : 0.3));
  style.last.push(name); if (style.last.length > 4) style.last.shift();
  style.meter = Math.min(style.meter + v, 260);
  style.total += v * (1 + RANKS.indexOf(rankOf(style.meter)) * 0.25);
  style.feed.unshift({ name, v, t: 2.2 }); if (style.feed.length > 6) style.feed.pop();
}
