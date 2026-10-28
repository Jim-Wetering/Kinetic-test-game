import { game } from '../state.js';

// ---------------------------------------------------------------- style meter
export const RANKS = [['D', 0, '#d8d2e6'], ['C', 15, '#2ae0ff'], ['B', 40, '#7cff4a'], ['A', 70, '#ffc21a'],
  ['S', 105, '#ff8a1a'], ['SS', 150, '#ff3d3d'], ['SSS', 200, '#ff2f8a']];
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
