// ---------------------------------------------------------------- rng
// seeded so every level generates the same layout each time
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let gen = mulberry32(7331);
export const seedRng = (seed) => { gen = mulberry32(seed); };
export const rng = () => gen();
export const rand = (a, b) => a + (b - a) * rng();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- storage
export function load(k, d) { try { const v = localStorage.getItem('kinetic.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
export function save(k, v) { try { localStorage.setItem('kinetic.' + k, JSON.stringify(v)); } catch (e) {} }

export function fmt(t) { if (t === null) return '—'; const m = Math.floor(Math.abs(t) / 60), s = Math.abs(t) % 60; return (t < 0 ? '-' : '') + m + ':' + s.toFixed(2).padStart(5, '0'); }
