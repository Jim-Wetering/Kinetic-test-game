import * as THREE from 'three';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/700.css';

// ---------------------------------------------------------------- street art atlas
// every decal is drawn once into one canvas atlas, as the things you'd really find on city roofs and walls:
// marker and spray tags, two-colour throw-ups, stencils, layers of wheatpasted flyers, weathered billboard
// posters and faded painted ghost signs. everything is sun-bleached and chipped. cells are 2:1, so a decal
// quad is twice as wide as it is tall
const COLS = 4, ROWS = 6, CW = 512, CH = 256;
const canvas = document.createElement('canvas');
canvas.width = COLS * CW; canvas.height = ROWS * CH;
const g = canvas.getContext('2d');
export const atlas = new THREE.CanvasTexture(canvas);
atlas.anisotropy = 4;

// cell ranges per kind of decal: [first, end)
export const ART = { tag: [0, 5], throw: [5, 10], stencil: [10, 13], paste: [13, 17], ad: [17, 21], ghost: [21, 24] };
const KIND_OF = [];
for (const [k, [a, b]] of Object.entries(ART)) for (let i = a; i < b; i++) KIND_OF[i] = k;
// a random cell of one kind, from a 0..1 random number
export const artCell = (kind, u) => { const [a, b] = ART[kind]; return a + Math.min(b - a - 1, (u * (b - a)) | 0); };

// a fixed seed, so walls look the same every run
let s = 12345;
const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * r();
const pickR = (a) => a[(r() * a.length) | 0];

// spray-can colours, slightly dulled the way paint is after a few summers
const PAINT = { black: '#1b1a1a', white: '#ece8de', silver: '#c4c7c8', red: '#b8382c', blue: '#2e4e8a', sky: '#6a9cc4',
  yellow: '#d8b440', green: '#3f7a4a', orange: '#d06a2c', purple: '#5e4a86', pink: '#c46a8a' };
const NAMES = ['RIVO', 'KEMS', 'DOAK', 'SPEL', 'ZIEK', 'ORBY', 'TENU', 'MOLK', 'VASK', 'ELOR'];
const CREWS = ['KTC', 'RFC', 'NB5', 'DTR', 'SVK'];
const MARKER = '"Permanent Marker", "Segoe Print", cursive';
const SIGN = 'Oswald, "Arial Narrow", sans-serif';
const BLOCK = '900 150px "Arial Black", "Arial", sans-serif';

// ---------------------------------------------------------------- weathering
// chip and fade what's been drawn: speckled paint loss, a few flaked patches, and rain streaks washing down
function wear(amount) {
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 500 * amount; i++) {
    g.globalAlpha = rr(0.15, 0.9);
    g.beginPath(); g.ellipse(rr(0, CW), rr(0, CH), rr(0.6, 3), rr(0.6, 2.4), r() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 6 * amount; i++) {
    g.globalAlpha = rr(0.3, 0.8); const x = rr(0, CW), y = rr(0, CH);
    g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, d = rr(4, 16); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.fill();
  }
  for (let i = 0; i < 18 * amount; i++) { g.globalAlpha = rr(0.05, 0.25); g.fillRect(rr(0, CW), rr(0, CH * 0.6), rr(2, 7), rr(40, 160)); }
  g.restore();
}
// thin paint runs below a line
function drips(x0, x1, y, col, n) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) { const x = rr(x0, x1), len = rr(8, 40), w = rr(1.5, 3.2); g.fillRect(x - w / 2, y, w, len); g.beginPath(); g.arc(x, y + len, w * 0.8, 0, 7); g.fill(); }
}
// soft overspray around whatever is drawn while it's on
const spray = (col, blur) => { g.shadowColor = col; g.shadowBlur = blur; };
const noSpray = () => { g.shadowBlur = 0; g.shadowColor = 'transparent'; };

// ---------------------------------------------------------------- tags
// a patch of wall that's been tagged a few times over: handstyles in marker and spray, a crew name, drips
function tags() {
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const col = pickR([PAINT.black, PAINT.black, PAINT.white, PAINT.red, PAINT.blue, PAINT.silver]);
    const size = rr(56, 110), word = r() < 0.75 ? pickR(NAMES).toLowerCase() : pickR(CREWS);
    g.save(); g.translate(rr(CW * 0.28, CW * 0.72), rr(CH * 0.35, CH * 0.8)); g.rotate(rr(-0.2, 0.1)); g.transform(1, 0, rr(-0.35, -0.1), 1, 0, 0);
    g.font = `${size}px ${MARKER}`; g.textAlign = 'center'; spray(col, 3);
    g.fillStyle = col; g.fillText(word, 0, 0);
    const w = g.measureText(word).width;
    g.lineWidth = rr(2, 4); g.strokeStyle = col; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-w / 2, size * 0.18); g.quadraticCurveTo(0, size * 0.32, w / 2 + rr(10, 40), size * 0.05); g.stroke();
    noSpray(); drips(-w / 2, w / 2, size * 0.05, col, (r() * 4) | 0);
    g.restore();
  }
  wear(0.6);
}

// ---------------------------------------------------------------- throw-ups
// fat, quickly-filled bubble letters: an outer line, a flat fill, an outline, the odd paint run
function throwUp() {
  const [fill, line, outer] = pickR([[PAINT.silver, PAINT.black, null], [PAINT.white, PAINT.black, PAINT.red],
    [PAINT.silver, PAINT.blue, PAINT.black], [PAINT.yellow, PAINT.black, null], [PAINT.white, PAINT.purple, null], [PAINT.orange, PAINT.black, PAINT.white]]);
  const word = pickR(NAMES).slice(0, 3 + ((r() * 2) | 0));
  g.save(); g.translate(CW / 2, CH / 2 + 48); g.font = BLOCK; g.textAlign = 'left'; g.lineJoin = 'round';
  const ws = [...word].map((ch) => g.measureText(ch).width * 0.8), total = ws.reduce((a, b) => a + b, 0), k = Math.min(1, CW * 0.74 / total);
  g.scale(k, k * rr(0.95, 1.15));
  const letters = []; let x = -total / 2;
  for (let i = 0; i < word.length; i++) { letters.push({ ch: word[i], x, y: rr(-10, 10), a: rr(-0.12, 0.12) }); x += ws[i]; }
  const pass = (fn) => { for (const L of letters) { g.save(); g.translate(L.x, L.y); g.rotate(L.a); fn(L.ch); g.restore(); } };
  if (outer) { spray(outer, 6); g.lineWidth = 58; g.strokeStyle = outer; pass((ch) => g.strokeText(ch, 0, 0)); }
  spray(line, 4); g.lineWidth = 40; g.strokeStyle = line; pass((ch) => g.strokeText(ch, 0, 0));
  noSpray(); g.lineWidth = 24; g.strokeStyle = fill; pass((ch) => g.strokeText(ch, 0, 0));
  g.fillStyle = fill; pass((ch) => g.fillText(ch, 0, 0));
  // a quick inner highlight stroke on a few letters, like a lighter can passed over the fill
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5; g.lineCap = 'round';
  pass(() => { if (r() < 0.5) { g.beginPath(); g.moveTo(14, -88); g.lineTo(30, -96); g.stroke(); } });
  drips(-total / 2 + 20, total / 2 - 20, 26, line, 2 + ((r() * 3) | 0));
  g.restore();
  wear(0.8);
}

// ---------------------------------------------------------------- stencils
function stencil(i) {
  const col = pickR([PAINT.black, PAINT.black, PAINT.white, PAINT.red]);
  g.save(); g.fillStyle = col; g.strokeStyle = col; spray(col, 5);
  if (i === 0) {
    // a runner mid-leap: limbs as thick strokes, head as a disc
    g.translate(CW / 2, CH / 2 + 10); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 22;
    const P = (pts) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
    P([[-10, -40], [16, 20]]);                          // torso
    P([[-6, -30], [-56, -16], [-86, -52]]);             // back arm
    P([[-4, -32], [40, -56], [76, -40]]);               // front arm
    P([[16, 20], [68, 14], [90, 58]]);                  // front leg
    P([[16, 20], [-26, 52], [-74, 40]]);                // trailing leg
    g.beginPath(); g.arc(-16, -74, 21, 0, 7); g.fill();
    g.lineWidth = 6; P([[-150, 96], [150, 96]]);         // ground line
  } else if (i === 1) {
    // a crow on a wire
    g.translate(CW / 2, CH / 2);
    g.beginPath(); g.moveTo(-90, 10); g.quadraticCurveTo(-40, -50, 20, -46); g.quadraticCurveTo(46, -76, 74, -54);
    g.lineTo(110, -50); g.lineTo(78, -38); g.quadraticCurveTo(70, 10, 20, 30); g.lineTo(-30, 40); g.lineTo(-120, 40); g.closePath(); g.fill();
    g.lineWidth = 5; g.beginPath(); g.moveTo(-10, 36); g.lineTo(-14, 70); g.moveTo(14, 30); g.lineTo(12, 70); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(-250, 72); g.quadraticCurveTo(0, 82, 250, 68); g.stroke();
  } else {
    // stencilled lettering, with the bridges a stencil leaves in the letters
    g.translate(CW / 2, CH / 2); g.font = `700 92px ${SIGN}`; g.textAlign = 'center';
    g.fillText('KEEP MOVING', 0, 6); g.font = `500 34px ${SIGN}`; g.fillText('— ROOF ACCESS ONLY —', 0, 64);
    noSpray(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-260, -32, 520, 5);
  }
  g.restore(); noSpray();
  wear(0.7);
}

// ---------------------------------------------------------------- wheatpaste
// overlapping flyers pasted up in layers: printed blocks of colour and type, torn corners, curling edges
const FLYERS = [['LIVE', 'FRI · 9PM'], ['NIGHT', 'MARKET'], ['ROOM', 'TO LET'], ['OPEN', 'STUDIO'], ['RADIO', '94.6 FM'], ['CLUB', 'NOVA'], ['FLEA', 'SUNDAY']];
function paste() {
  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const w = rr(110, 170), h = w * 1.4, x = rr(20, CW - w - 20), y = rr(-20, CH - h + 30);
    const paper = pickR(['#ece4d0', '#e8dcc0', '#d8d2c4', '#e8c8a0', '#c8d4cc']), ink = pickR(['#1c1a1a', '#b8382c', '#2e4e8a']);
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rr(-0.05, 0.05)); g.translate(-w / 2, -h / 2);
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.fillStyle = ink; const [t1, t2] = pickR(FLYERS);
    if (r() < 0.5) g.fillRect(10, 10, w - 20, h * 0.42); else { g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.28, 0, 7); g.fill(); }
    g.font = `700 ${w * 0.26}px ${SIGN}`; g.textAlign = 'center'; g.fillText(t1, w / 2, h * 0.68);
    g.font = `500 ${w * 0.13}px ${SIGN}`; g.fillText(t2, w / 2, h * 0.82);
    for (let k = 0; k < 3; k++) g.fillRect(16, h * 0.88 + k * 6, rr(w * 0.3, w - 32), 2);
    // a torn corner, and paste wrinkles
    g.globalCompositeOperation = 'destination-out'; g.beginPath();
    const cx = r() < 0.5 ? 0 : w, cy = r() < 0.5 ? 0 : h, d = rr(18, 40);
    g.moveTo(cx, cy); g.lineTo(cx + (cx ? -d : d), cy); g.lineTo(cx, cy + (cy ? -d * 1.3 : d * 1.3)); g.fill();
    g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(rr(0, w), 0); g.lineTo(rr(0, w), h); g.stroke(); }
    g.restore();
  }
  wear(0.9);
}

// ---------------------------------------------------------------- billboard posters
// paper billboards: a flat colour field, one big graphic, a headline and the brand, pasted in vertical strips
const ADS = [
  { bg: '#d8c49a', fg: '#2a2420', hi: '#b8382c', head: 'GOOD MORNING', brand: 'ARCA COFFEE', art: 'cup' },
  { bg: '#2e4e6a', fg: '#ece4d0', hi: '#d8b440', head: 'THE CITY, ON TIME', brand: 'NORTHLINE TRANSIT', art: 'line' },
  { bg: '#ece4d0', fg: '#1c1a1a', hi: '#c46a3a', head: 'TUNE IN', brand: 'RADIO 94.6 FM', art: 'wave' },
  { bg: '#6a8a7a', fg: '#f2ecdc', hi: '#f2ecdc', head: 'STAY COOL', brand: 'SOLA SPRING WATER', art: 'sun' },
];
function ad(i) {
  const A = ADS[i % ADS.length];
  g.fillStyle = A.bg; g.fillRect(6, 6, CW - 12, CH - 12);
  g.fillStyle = A.hi; g.strokeStyle = A.hi;
  if (A.art === 'cup') { g.fillRect(CW * 0.66, 70, 90, 110); g.lineWidth = 14; g.beginPath(); g.arc(CW * 0.66 + 98, 120, 26, -1.4, 1.4); g.stroke(); }
  else if (A.art === 'line') { g.lineWidth = 16; g.beginPath(); g.moveTo(CW * 0.55, 190); g.lineTo(CW * 0.72, 90); g.lineTo(CW * 0.95, 90); g.stroke(); for (const x of [0.55, 0.72, 0.95]) { g.beginPath(); g.arc(CW * x, x === 0.55 ? 190 : 90, 16, 0, 7); g.fill(); } }
  else if (A.art === 'wave') { g.lineWidth = 10; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(CW * 0.78, 128, 26 + k * 24, -0.8, 0.8); g.stroke(); } }
  else { g.beginPath(); g.arc(CW * 0.78, 110, 56, 0, 7); g.fill(); g.fillRect(CW * 0.6, 182, CW * 0.36, 8); }
  g.fillStyle = A.fg; g.textAlign = 'left';
  g.font = `700 50px ${SIGN}`; g.fillText(A.head, 34, 112);
  g.font = `500 26px ${SIGN}`; g.fillText(A.brand, 36, 196);
  // paste seams and a little peeling along them
  g.fillStyle = 'rgba(0,0,0,.14)'; for (let k = 1; k < 4; k++) g.fillRect((CW / 4) * k, 6, 2, CH - 12);
  wear(1.0);
}

// ---------------------------------------------------------------- ghost signs
// old hand-painted advertising on a blank brick wall, faded almost into it
const GHOSTS = [['HOTEL CARLTON', 'ROOMS BY THE WEEK'], ['DRY GOODS', '& HARDWARE'], ['COAL · ICE', 'DELIVERED DAILY']];
function ghost(i) {
  const [a, b] = GHOSTS[i % GHOSTS.length];
  g.save(); g.globalAlpha = 0.62; g.fillStyle = '#ece4d0'; g.strokeStyle = '#ece4d0';
  g.lineWidth = 7; g.strokeRect(18, 18, CW - 36, CH - 36);
  g.textAlign = 'center'; g.font = `700 70px Georgia, "Times New Roman", serif`;
  g.fillText(a, CW / 2, 120, CW - 70);
  g.font = `italic 38px Georgia, "Times New Roman", serif`; g.fillText(b, CW / 2, 186, CW - 90);
  g.fillRect(CW * 0.3, 140, CW * 0.4, 4);
  g.restore();
  wear(1.4);
}

function draw() {
  s = 12345;
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < COLS * ROWS; i++) {
    g.save(); g.translate((i % COLS) * CW, ((i / COLS) | 0) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    const kind = KIND_OF[i], k = i - ART[kind][0];
    if (kind === 'tag') tags();
    else if (kind === 'throw') throwUp();
    else if (kind === 'stencil') stencil(k);
    else if (kind === 'paste') paste();
    else if (kind === 'ad') ad(k);
    else ghost(k);
    g.restore();
  }
  atlas.needsUpdate = true;
}
draw();
// the web fonts load after the first draw: redraw once they're ready
if (document.fonts) Promise.all([document.fonts.load(`100px ${MARKER}`), document.fonts.load(`700 100px ${SIGN}`), document.fonts.load(`500 100px ${SIGN}`)]).then(draw, () => {});

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
