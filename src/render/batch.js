import * as THREE from 'three';

// ---------------------------------------------------------------- geometry batching
// box faces as quads of min/max selectors; winding is fixed up below so every face points outward
const FACES = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]]],
  [[0, 1, 0], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]],
];
for (const [n, q] of FACES) {
  const e1 = q[1].map((v, i) => v - q[0][i]), e2 = q[2].map((v, i) => v - q[0][i]);
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) q.reverse();
}
export class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; }
  box(x0, y0, z0, x1, y1, z1, side, topCol, bottom = false) {
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    FACES.forEach(([n, q], fi) => {
      if (fi === 3 && !bottom) return;
      const c = fi === 2 && topCol ? topCol : side;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = q[k];
        this.p.push(v[0] ? hi[0] : lo[0], v[1] ? hi[1] : lo[1], v[2] ? hi[2] : lo[2]);
        this.n.push(n[0], n[1], n[2]); this.c.push(c.r, c.g, c.b);
      }
    });
  }
  geo(g, c) {
    const ng = g.index ? g.toNonIndexed() : g, pa = ng.attributes.position.array, na = ng.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { this.p.push(pa[i]); this.n.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) this.c.push(c.r, c.g, c.b);
  }
  build(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return new THREE.Mesh(g, mat);
  }
}
export class Edges {
  constructor() { this.p = []; }
  box(x0, y0, z0, x1, y1, z1) {
    const r = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let k = 0; k < 4; k++) {
      const a = r[k], b = r[(k + 1) % 4];
      this.p.push(a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]);
    }
  }
  build(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    return new THREE.LineSegments(g, mat);
  }
}
