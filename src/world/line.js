import { EPS } from '../config.js';
import { rng, rand, clamp } from '../utils.js';
import { addBox, addCp, level } from './world.js';

// ---------------------------------------------------------------- level: The Line (linear course along -Z)
let cx = 0, roofY = 0, z = 0;
export const HALF_W = 7;
function building(len, w = HALF_W * 2) { addBox(cx - w / 2, roofY - 90, z - len, cx + w / 2, roofY, z, 'building'); z -= len; }
function checkpoint(finish) { addCp(cx, roofY, z - 2, 0, { finish, plane: true }); }
function shift() { cx = clamp(cx + rand(-3, 3), -12, 12); }

const SEG = {
  gap() {
    z -= rand(6, 10); roofY += rand(-2.5, 1.2); shift(); checkpoint();
    const len = rand(26, 36), mid = z - len / 2; building(len);
    if (rng() < 0.6) addBox(cx - 3, roofY, mid - 0.4, cx + 3, roofY + 1, mid + 0.4, 'vault');
  },
  slide() {
    z -= rand(6, 8); shift(); checkpoint();
    const start = z; building(44);
    addBox(cx - 2.5, roofY, start - 6.4, cx + 2.5, roofY + 1.1, start - 5.6, 'vault');
    for (let k = 0; k < 3; k++) { const zz = start - 16 - k * 8; addBox(cx - HALF_W, roofY + 1.15, zz - 0.3, cx + HALF_W, roofY + 5, zz + 0.3, 'bar'); }
  },
  wallrun(n = 2) {
    const side = rng() < 0.5 ? -1 : 1, L = 13, off = 3.3, z0 = z;
    for (let i = 0; i < n; i++) {
      const s = i % 2 === 0 ? side : -side, za = z0 + 3 - i * (L - 1), x = cx + s * off;
      addBox(x - 0.3, roofY - 6, za - L, x + 0.3, roofY + 6, za, 'wall');
    }
    z -= n * (L - 1) + 3; roofY += rand(0, 1); checkpoint(); building(30);
  },
  grapple() {
    const g = rand(30, 36), ax = cx + rand(-3, 3);
    addBox(ax - 0.8, roofY + 11.2, z - g / 2 - 0.8, ax + 0.8, roofY + 12.8, z - g / 2 + 0.8, 'anchor');
    z -= g; roofY += rand(-1, 3); shift(); checkpoint(); building(30);
  },
  climb() { z -= rand(4, 5.5); roofY += rand(3, 3.8); checkpoint(); building(30); },
  drop() { z -= rand(9, 12); roofY -= rand(10, 13); shift(); checkpoint(); building(36); },
  shaft() {
    const rise = rand(6, 6.6), depth = 6, half = 2.6;
    addBox(cx - half, roofY - 90, z - depth, cx + half, roofY, z, 'building');
    addBox(cx - half - 0.8, roofY - 90, z - depth, cx - half, roofY + rise, z, 'building');
    addBox(cx + half, roofY - 90, z - depth, cx + half + 0.8, roofY + rise, z, 'building');
    z -= depth; roofY += rise; checkpoint(); building(32);
  },
};
export function lineCourse() {
  cx = 0; roofY = 0; z = 20; building(50);
  const seq = ['gap', 'gap', 'slide', 'wallrun', 'gap', 'grapple', 'climb', 'drop', 'wallrun3', 'shaft',
    'gap', 'grapple', 'slide', 'drop', 'wallrun', 'climb', 'grapple', 'gap'];
  for (const s of seq) s === 'wallrun3' ? SEG.wallrun(3) : SEG[s]();
  z -= 8; checkpoint(true); building(40);
  level.spawn = { x: 0, y: EPS, z: 12, yaw: 0 };
  return { x0: -25, x1: 25, z0: z, z1: 20, yRef: 0 };
}
