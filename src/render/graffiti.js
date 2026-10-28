import * as THREE from 'three';
import '@fontsource/bangers/400.css';
import '@fontsource/permanent-marker/400.css';

// ---------------------------------------------------------------- graffiti atlas
// every decal is drawn once into one canvas atlas: bubble-letter pieces, marker tags with drips, red ink seals,
// brush circles, splatters and arrows. cells are 2:1 so a decal quad is twice as wide as it is tall
const COLS = 4, ROWS = 6, CW = 512, CH = 256;
export const CELLS = COLS * ROWS;
const canvas = document.createElement('canvas');
canvas.width = COLS * CW; canvas.height = ROWS * CH;
const g = canvas.getContext('2d');
export const atlas = new THREE.CanvasTexture(canvas);
atlas.anisotropy = 4;

// a fixed seed, so walls look the same every run
let s = 12345;
const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * r();
const pickR = (a) => a[(r() * a.length) | 0];

const WORDS = ['KINETIC', 'FLOW', 'RUSH', 'JUMP!', 'NO LIMIT', 'GO GO', 'SKY', 'ZOOM', 'LEAP', 'RUN!', 'FAST', 'WALL'];
const TAGS = ['kin', 'flo', 'Zip', 'rush', 'K!', 'hop', 'vlt', 'Rnr'];
const PAL = [['#ff2f8a', '#ffd21a'], ['#2ad8ff', '#7a3cff'], ['#7cff4a', '#00b0a0'], ['#ff7a1a', '#ff2f4a'],
  ['#ffe64a', '#ff5ad0'], ['#4affd8', '#2f6aff'], ['#ff4a4a', '#ffb02f'], ['#c04aff', '#ff4ab0']];
const INK = '#120c18';

// a brush stroke: overlapping blobs along a path whose width swells and thins, with dry gaps
function brush(pts, w, col) {
  g.fillStyle = col;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
    for (let k = 0; k < n; k++) {
      const t = (i + k / n) / (pts.length - 1), rad = w * (0.35 + Math.sin(t * Math.PI) * 0.75) * rr(0.85, 1.1);
      if (r() < 0.04) continue;
      g.beginPath(); g.arc(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, rad, 0, 7); g.fill();
    }
  }
}
function splat(x, y, size, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, size, 0, 7); g.fill();
  for (let i = 0; i < 14; i++) {
    const a = r() * 7, d = size * rr(1.1, 2.6), rad = size * rr(0.06, 0.25);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad, 0, 7); g.fill();
  }
}
function drips(x0, x1, y, col, n) {
  for (let i = 0; i < n; i++) {
    const x = rr(x0, x1), len = rr(14, 60), w = rr(4, 9);
    g.fillStyle = INK; g.fillRect(x - w / 2 - 3, y - 4, w + 6, len + 3);
    g.beginPath(); g.arc(x, y + len, w / 2 + 3, 0, 7); g.fill();
    g.fillStyle = col; g.fillRect(x - w / 2, y - 6, w, len);
    g.beginPath(); g.arc(x, y + len, w / 2, 0, 7); g.fill();
  }
}
function star(x, y, R, col) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, d = i % 2 ? R * 0.42 : R; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
}

// fat bubble letters: drop shadow, black outline, white sticker border, gradient fill, shine and drips
function piece(word, [a, b]) {
  let size = 150;
  g.font = `${size}px Bangers, Impact, sans-serif`;
  while (g.measureText(word).width > CW * 0.82 && size > 60) { size -= 8; g.font = `${size}px Bangers, Impact, sans-serif`; }
  g.save(); g.translate(CW / 2, CH / 2 + size * 0.33); g.rotate(rr(-0.12, 0.08));
  g.textAlign = 'center'; g.lineJoin = 'round';
  splat(rr(-180, 180), -size * 0.4, rr(18, 30), b);
  g.fillStyle = INK; g.fillText(word, 9, 9);
  g.lineWidth = 30; g.strokeStyle = INK; g.strokeText(word, 0, 0);
  g.lineWidth = 16; g.strokeStyle = '#ffffff'; g.strokeText(word, 0, 0);
  g.lineWidth = 6; g.strokeStyle = INK; g.strokeText(word, 0, 0);
  const grad = g.createLinearGradient(0, -size * 0.8, 0, 0); grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillText(word, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-CW, -size * 0.75, CW * 2, size * 0.14);
  g.globalCompositeOperation = 'source-over';
  const w = g.measureText(word).width;
  drips(-w / 2 + 10, w / 2 - 10, 2, b, 5);
  if (r() < 0.6) star(w / 2 + 10, -size * 0.75, 26, '#ffffff');
  g.restore();
}
// a quick marker tag with an underline swoosh and drips
function tag(word, [a]) {
  g.save(); g.translate(CW / 2, CH / 2 + 30); g.rotate(rr(-0.25, 0.05));
  g.font = '120px "Permanent Marker", cursive'; g.textAlign = 'center';
  g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText(word, 0, 0);
  g.fillStyle = a; g.fillText(word, 0, 0);
  const w = g.measureText(word).width;
  brush([[-w / 2, 26], [0, 40], [w / 2 + 30, 14], [w / 2 + 60, -20]], 7, a);
  drips(-w / 2, w / 2, 8, a, 4);
  g.restore();
}
// red hanko-style seal next to a brush circle (enso): the ink-painting stamp
function seal() {
  const red = pickR(['#d8262a', '#c41e2e', '#e0402a']);
  const cx = CW * 0.38, cy = CH / 2;
  const pts = [];
  for (let i = 0, n = 34, a0 = rr(0, 6), sweep = rr(5.3, 5.9); i <= n; i++) {
    const a = a0 + sweep * i / n, R = 92 + Math.sin(i * 0.7) * 4;
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  brush(pts, 13, INK);
  splat(cx + rr(-60, 60), cy + rr(-60, 60), 6, INK);
  g.save(); g.translate(CW * 0.76, CH / 2); g.rotate(rr(-0.15, 0.15));
  g.fillStyle = red; g.beginPath(); g.roundRect ? g.roundRect(-58, -78, 116, 156, 10) : g.rect(-58, -78, 116, 156); g.fill();
  // carved white strokes: an abstract glyph, not a real character
  for (let k = 0; k < 4; k++) {
    const y = -52 + k * 34;
    brush([[-38, y + rr(-6, 6)], [rr(-10, 10), y + rr(-8, 8)], [38, y + rr(-6, 6)]], 5, '#fff3ea');
  }
  brush([[rr(-12, 12), -60], [rr(-8, 8), 0], [rr(-12, 12), 62]], 5, '#fff3ea');
  g.restore();
}
function burst([a, b]) {
  g.save(); g.translate(CW / 2, CH / 2);
  g.beginPath();
  for (let i = 0; i < 28; i++) { const ang = i * Math.PI / 14, d = i % 2 ? 70 : rr(110, 125); g.lineTo(Math.cos(ang) * d * 1.8, Math.sin(ang) * d); }
  g.closePath(); g.fillStyle = a; g.fill(); g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
  g.font = '110px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.lineWidth = 14; g.lineJoin = 'round';
  const word = pickR(['WOW!', 'GO!!', 'POW', 'YES!']);
  g.strokeStyle = INK; g.strokeText(word, 0, 38); g.fillStyle = b; g.fillText(word, 0, 38);
  g.restore();
}
function arrow([a, b]) {
  g.save(); g.translate(CW / 2, CH / 2); g.rotate(rr(-0.2, 0.2));
  const path = () => { g.beginPath(); g.moveTo(-200, -34); g.lineTo(80, -34); g.lineTo(80, -84); g.lineTo(210, 0); g.lineTo(80, 84); g.lineTo(80, 34); g.lineTo(-200, 34); g.closePath(); };
  g.translate(10, 10); path(); g.fillStyle = INK; g.fill(); g.translate(-10, -10);
  path(); const grad = g.createLinearGradient(-200, 0, 210, 0); grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fill(); g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
  for (let i = 0; i < 3; i++) g.fillRect(-250 - i * 34, -34 + i * 6, 18, 68 - i * 12);
  g.restore();
}
function inkSplash() {
  splat(CW / 2 + rr(-40, 40), CH / 2, rr(46, 62), INK);
  brush([[60, CH * 0.75], [CW * 0.4, CH * 0.6], [CW * 0.8, CH * 0.72], [CW - 40, CH * 0.5]], 16, INK);
  const red = '#d8262a';
  splat(CW * 0.78, CH * 0.3, 16, red);
}

function draw() {
  s = 12345;
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < CELLS; i++) {
    g.save(); g.translate((i % COLS) * CW, ((i / COLS) | 0) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    const pal = PAL[i % PAL.length], kind = i % 8;
    if (kind === 0 || kind === 3 || kind === 6) piece(WORDS[i % WORDS.length], pal);
    else if (kind === 1 || kind === 5) tag(TAGS[i % TAGS.length], pal);
    else if (kind === 2) seal();
    else if (kind === 4) burst(pal);
    else if (r() < 0.5) arrow(pal); else inkSplash();
    g.restore();
  }
  atlas.needsUpdate = true;
}
draw();
// the web fonts load after the first draw: redraw once they're ready
if (document.fonts) Promise.all([document.fonts.load('100px Bangers'), document.fonts.load('100px "Permanent Marker"')]).then(draw, () => {});

export const matDecal = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

// ---------------------------------------------------------------- decal batch
// quads on walls and roofs, all in one mesh. shade is the light on that face (lit or the theme's shadow tint)
export class Decals {
  constructor() { this.p = []; this.uv = []; this.c = []; }
  // centre, the quad's right and up axes (full width / height vectors), atlas cell, shade colour
  quad(cx, cy, cz, ux, uy, uz, vx, vy, vz, cell, shade) {
    const u0 = (cell % COLS) / COLS, v1 = 1 - ((cell / COLS) | 0) / ROWS, u1 = u0 + 1 / COLS, v0 = v1 - 1 / ROWS;
    const P = (a, b) => [cx + ux * a + vx * b, cy + uy * a + vy * b, cz + uz * a + vz * b];
    const vs = [[P(-0.5, -0.5), u0, v0], [P(0.5, -0.5), u1, v0], [P(0.5, 0.5), u1, v1], [P(-0.5, 0.5), u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const [p, u, v] = vs[k]; this.p.push(...p); this.uv.push(u, v); this.c.push(shade.r, shade.g, shade.b); }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(geo, matDecal); m.renderOrder = 1;
    return m;
  }
}
