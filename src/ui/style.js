import { game } from '../state.js';

// ---------------------------------------------------------------- style meter
export const RANKS = [['D', 0, '#cfc8bb'], ['C', 15, '#9fd6e2'], ['B', 40, '#c6d79a'], ['A', 70, '#e2b45a'],
  ['S', 105, '#e08a4a'], ['SS', 150, '#e0603a'], ['SSS', 200, '#e84a3a']];
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
