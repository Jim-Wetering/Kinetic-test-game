import { EPS } from '../config.js';
import { rng, rand } from '../utils.js';
import { theme, C, pick, jitter } from '../render/themes.js';
import { addBox, addCp, level } from './world.js';

// ---------------------------------------------------------------- level: open rooftop district
// City blocks on a grid with varied street widths. A guaranteed route links the checkpoints; extra
// beams, wallrun panels and grapple hooks on other streets make alternate lines.
export function district(o) {
  const { cols, rows } = o, T = theme.c;
  const cw = [], sx = [], rd = [], sz = [];
  for (let i = 0; i < cols; i++) { cw.push(rand(...o.cell)); sx.push(rand(...o.street)); }
  for (let j = 0; j < rows; j++) { rd.push(rand(...o.cell)); sz.push(rand(...o.street)); }
  const X0 = [], Z1 = [];
  let acc = -(cw.reduce((s, v) => s + v, 0) + sx.slice(0, cols - 1).reduce((s, v) => s + v, 0)) / 2;
  for (let i = 0; i < cols; i++) { X0.push(acc); acc += cw[i] + sx[i]; }
  acc = 20; for (let j = 0; j < rows; j++) { Z1.push(acc); acc -= rd[j] + sz[j]; }
  const cell = (i, j) => ({ x0: X0[i], x1: X0[i] + cw[i], z0: Z1[j] - rd[j], z1: Z1[j], cx: X0[i] + cw[i] / 2, cz: Z1[j] - rd[j] / 2 });
  const grid = (f) => Array.from({ length: cols }, (_, i) => Array.from({ length: rows }, (_, j) => f(i, j)));
  const raw = grid(() => rng());
  const H = grid((i, j) => {
    let s = 0, n = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const r = raw[i + di] && raw[i + di][j + dj];
      if (r !== undefined) { s += r; n++; }
    }
    return o.base + (s / n - 0.5) * 6 * o.amp + j * o.slope + rand(-o.jit, o.jit);
  });
  const empty = grid((i, j) => j > 0 && rng() < o.voids);
  const frame = grid(() => rng() < (o.frames || 0));

  let route;
  if (o.loop) {
    // circuit: once around the outer ring of blocks, starting mid-way along the front row heading +x
    const mid = cols >> 1;
    route = [];
    for (let i = mid; i < cols; i++) route.push([i, 0]);
    for (let j = 1; j < rows; j++) route.push([cols - 1, j]);
    for (let i = cols - 2; i >= 0; i--) route.push([i, rows - 1]);
    for (let j = rows - 2; j >= 0; j--) route.push([0, j]);
    for (let i = 1; i < mid; i++) route.push([i, 0]);
    for (const [i, j] of route) empty[i][j] = false;
    frame[mid][0] = false;
  } else {
    // route: mostly forward (-z), with occasional sideways steps
    let ci = cols >> 1, cj = 0, side = false;
    route = [[ci, cj]];
    const seen = new Set([ci + ',' + cj]);
    empty[ci][cj] = false; frame[ci][cj] = false;
    while (cj < rows - 1) {
      let ni = ci, nj = cj + 1;
      if (!side && rng() < o.turn) {
        const ti = ci + (rng() < 0.5 ? -1 : 1);
        if (ti >= 0 && ti < cols && !seen.has(ti + ',' + cj)) { ni = ti; nj = cj; }
      }
      side = nj === cj; ci = ni; cj = nj;
      route.push([ci, cj]); seen.add(ci + ',' + cj); empty[ci][cj] = false;
    }
  }
  // consecutive route pairs; a loop also links the last cell back to the start
  const legs = [];
  for (let k = 0; k < route.length - 1; k++) legs.push([route[k], route[k + 1]]);
  if (o.loop) legs.push([route[route.length - 1], route[0]]);
  // keep the route climbable: big rises get flattened, medium ones get a crate step
  const crates = new Set();
  legs.forEach(([[ai, aj], [bi, bj]], k) => {
    const closing = o.loop && k === legs.length - 1; // can't move the start roof, so adjust the last one instead
    let up = H[bi][bj] - H[ai][aj];
    if (up > 6.5) { if (closing) H[ai][aj] = H[bi][bj] - rand(0.5, 2.5); else H[bi][bj] = H[ai][aj] + rand(0.5, 2.5); up = H[bi][bj] - H[ai][aj]; }
    if (up > 3) crates.add(k);
    if (H[ai][aj] - H[bi][bj] > 14) { if (closing) H[ai][aj] = H[bi][bj] + rand(8, 13); else H[bi][bj] = H[ai][aj] - rand(8, 13); }
  });

  const clearPts = []; // spots props must stay away from (crossings, spawn)
  function crossing(ai, aj, bi, bj) {
    const A = cell(ai, aj), Bc = cell(bi, bj);
    if (bj !== aj) {
      const dir = bj > aj ? -1 : 1, ea = dir < 0 ? A.z0 : A.z1, eb = dir < 0 ? Bc.z1 : Bc.z0;
      const p = A.cx + rand(-0.2, 0.2) * cw[ai];
      return { axis: 'z', dir, ea, eb, gap: Math.abs(ea - eb), p, mid: (ea + eb) / 2, pt: { x: p, z: (ea + eb) / 2 } };
    }
    const dir = bi > ai ? 1 : -1, ea = dir > 0 ? A.x1 : A.x0, eb = dir > 0 ? Bc.x0 : Bc.x1;
    const p = A.cz + rand(-0.2, 0.2) * rd[aj];
    return { axis: 'x', dir, ea, eb, gap: Math.abs(eb - ea), p, mid: (ea + eb) / 2, pt: { x: (ea + eb) / 2, z: p } };
  }
  // box in crossing space: t runs along the travel axis, l across it
  function boxTL(c, t0, t1, l0, l1, y0, y1, kind, color) {
    const ta = Math.min(t0, t1), tb = Math.max(t0, t1);
    return c.axis === 'z' ? addBox(l0, y0, ta, l1, y1, tb, kind, color) : addBox(ta, y0, l0, tb, y1, l1, kind, color);
  }
  function weighted(opts) {
    let s = opts.reduce((a, o2) => a + o2[1], 0), r = rng() * s;
    for (const [k, w] of opts) if ((r -= w) <= 0) return k;
    return opts[opts.length - 1][0];
  }
  function aid(c, ha, hb) {
    const lo = Math.min(ha, hb), hi = Math.max(ha, hb), dEff = ha - hb + 2.3;
    const reach = dEff > -1.5 ? 10 * (10 + Math.sqrt(Math.max(0, 100 + 56 * dEff))) / 28 * 0.85 : 0;
    if (c.gap < reach) return;
    let type;
    if (hb - ha > 1) type = 'anchor';
    else {
      const w = o.aids, opts = [];
      if (hi - lo < 1.5 && c.gap < 15) opts.push(['beam', w.beam]);
      if (c.gap < 14) opts.push(['wall', w.wall]);
      opts.push(['anchor', w.anchor]);
      type = weighted(opts);
    }
    if (type === 'beam') boxTL(c, c.ea - c.dir * 0.5, c.eb + c.dir * 0.5, c.p - 0.6, c.p + 0.6, lo - 0.4, lo, 'beam');
    else if (type === 'wall') {
      const l = c.p + (rng() < 0.5 ? -1 : 1) * 3.2;
      boxTL(c, c.ea - c.dir * 3, c.eb + c.dir * 3, l - 0.3, l + 0.3, lo - 6, hi + 5, 'wall');
    } else {
      const y = hi + rand(8.5, 10.5);
      c.axis === 'z' ? addBox(c.p - 0.8, y - 0.8, c.mid - 0.8, c.p + 0.8, y + 0.8, c.mid + 0.8, 'anchor')
        : addBox(c.mid - 0.8, y - 0.8, c.p - 0.8, c.mid + 0.8, y + 0.8, c.p + 0.8, 'anchor');
    }
  }

  const onRoute = new Set();
  for (let k = 0; k < legs.length; k++) {
    const [[ai, aj], [bi, bj]] = legs[k];
    onRoute.add(`${ai},${aj}>${bi},${bj}`); onRoute.add(`${bi},${bj}>${ai},${aj}`);
    const c = crossing(ai, aj, bi, bj);
    clearPts.push(c.pt);
    let ha = H[ai][aj];
    if (crates.has(k) && H[bi][bj] - ha > 3) {
      const ch = (H[bi][bj] - ha) / 2 + 0.3;
      boxTL(c, c.ea - c.dir * 3.8, c.ea - c.dir * 1.2, c.p - 1.3, c.p + 1.3, ha, ha + ch, 'crate', T.accent);
      ha += ch;
    }
    aid(c, ha, H[bi][bj]);
  }
  // optional connections between other neighbouring blocks
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    for (const [bi, bj] of [[i + 1, j], [i, j + 1]]) {
      if (bi >= cols || bj >= rows || empty[i][j] || empty[bi][bj] || onRoute.has(`${i},${j}>${bi},${bj}`)) continue;
      if (rng() > o.connect) continue;
      const [ai, aj, ti, tj] = H[i][j] >= H[bi][bj] ? [i, j, bi, bj] : [bi, bj, i, j];
      const c = crossing(ai, aj, ti, tj);
      clearPts.push(c.pt);
      aid(c, H[ai][aj], H[ti][tj]);
    }
  }
  // free-standing hooks over street intersections
  for (let k = 0; k < (o.anchors || 0); k++) {
    const i = (rng() * (cols - 1)) | 0, j = (rng() * (rows - 1)) | 0;
    const x = X0[i] + cw[i] + sx[i] / 2, zz = Z1[j] - rd[j] - sz[j] / 2;
    const y = Math.max(H[i][j], H[i + 1][j], H[i][j + 1], H[i + 1][j + 1]) + rand(8, 12);
    addBox(x - 0.8, y - 0.8, zz - 0.8, x + 0.8, y + 0.8, zz + 0.8, 'anchor');
  }

  const c0 = cell(route[0][0], 0);
  level.spawn = o.loop ? { x: c0.x0 + 3, y: H[route[0][0]][0] + EPS, z: c0.cz, yaw: -Math.PI / 2 }
    : { x: c0.cx, y: H[route[0][0]][0] + EPS, z: c0.z1 - 3, yaw: 0 };
  clearPts.push({ x: level.spawn.x, z: level.spawn.z });

  function props(c, top) {
    const n = Math.round((c.x1 - c.x0) * (c.z1 - c.z0) / 110 * o.props);
    for (let k = 0; k < n; k++) {
      const r = rng();
      let w, d, h, color = null;
      if (r < 0.45) { w = rand(1.4, 2.6); d = rand(1, 2); h = rand(0.8, 1.3); }       // AC unit: vault it
      else if (r < 0.62) { w = d = rand(0.6, 1); h = 0.6; }                           // vent
      else if (r < 0.84) { w = rand(0.35, 0.45); d = rand(5, 10); h = 0.45; if (rng() < 0.5) [w, d] = [d, w]; } // pipe: step over
      else { w = rand(3, 4.5); d = rand(3, 4.5); h = rand(2.6, 3.2); color = jitter(pick(T.bld)); } // stair hut: mantle it
      const x = rand(c.x0 + 1.5 + w / 2, c.x1 - 1.5 - w / 2), zz = rand(c.z0 + 1.5 + d / 2, c.z1 - 1.5 - d / 2);
      if (!(x === x && zz === zz)) continue; // prop wider than the roof
      if (Math.hypot(x - c.cx, zz - c.cz) < 5 + Math.max(w, d) / 2) continue; // keep checkpoint spots clear
      if (clearPts.some((p) => Math.hypot(p.x - x, p.z - zz) < (h > 1.5 ? 9 : 4) + Math.max(w, d) / 2)) continue;
      addBox(x - w / 2, top, zz - d / 2, x + w / 2, top + h, zz + d / 2, 'prop', color);
    }
    if (rng() < 0.15 * o.props) { // billboard on legs along the back edge: walk under it, wallrun it
      const x = c.cx + rand(-2, 2), zz = c.z0 + 1;
      if (!clearPts.some((p) => Math.hypot(p.x - x, p.z - zz) < 10)) {
        const col = C(pick(['#ff3b1f', '#ffc21a', '#29c3ff', '#ff6fb0', '#36d17a']));
        addBox(x - 4, top + 2.4, zz - 0.2, x + 4, top + 7, zz + 0.2, 'sign', col);
        addBox(x - 3.4, top, zz - 0.15, x - 3.1, top + 2.4, zz + 0.15, 'prop');
        addBox(x + 3.1, top, zz - 0.15, x + 3.4, top + 2.4, zz + 0.15, 'prop');
      }
    }
  }
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (empty[i][j]) continue;
    const c = cell(i, j), top = H[i][j];
    if (frame[i][j]) { // unfinished building: open floors on corner pillars
      const concrete = jitter(pick(T.bld), 0.08).multiplyScalar(0.85);
      addBox(c.x0, -90, c.z0, c.x1, top - 8, c.z1, 'building');
      addBox(c.x0, top - 4.4, c.z0, c.x1, top - 4, c.z1, 'slab', concrete);
      addBox(c.x0, top - 0.4, c.z0, c.x1, top, c.z1, 'slab', concrete);
      for (const [px, pz] of [[c.x0, c.z0], [c.x1 - 1, c.z0], [c.x0, c.z1 - 1], [c.x1 - 1, c.z1 - 1]]) {
        addBox(px, top - 8, pz, px + 1, top - 4.4, pz + 1, 'prop', concrete);
        addBox(px, top - 4, pz, px + 1, top - 0.4, pz + 1, 'prop', concrete);
      }
    } else addBox(c.x0, -90, c.z0, c.x1, top, c.z1, 'building');
    props(c, top);
  }

  // a circuit gets a checkpoint on every corner and every other straight block; its last one is the start/finish line
  const yawOf = ([ai, aj], [bi, bj]) => bj > aj ? 0 : bj < aj ? Math.PI : bi > ai ? -Math.PI / 2 : Math.PI / 2;
  legs.forEach(([a, b], k) => {
    const last = k === legs.length - 1, c = cell(b[0], b[1]);
    if (o.loop && !last) {
      const nb = legs[k + 1][1], corner = yawOf(a, b) !== yawOf(b, nb);
      if (!corner && k % 2 === 1) return;
    }
    addCp(c.cx, H[b[0]][b[1]], c.cz, yawOf(a, b), { finish: last });
  });
  let ySum = 0; for (const [i, j] of route) ySum += H[i][j];
  return { x0: X0[0], x1: X0[cols - 1] + cw[cols - 1], z0: Z1[rows - 1] - rd[rows - 1], z1: Z1[0], yRef: ySum / route.length };
}
