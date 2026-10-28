import * as THREE from 'three';
import { scene } from './scene.js';
import { inkMat } from './ink.js';

// ---------------------------------------------------------------- ink materials
// polygon offset pushes faces back so the crease lines always win the depth test
export const matToon = inkMat({ vertexColors: true, polygonOffset: true });
// clouds stay bright and puffy: only a soft shade on the underside
export const matCloud = inkMat({ vertexColors: true, fog: false, flat: 0.65 });
// back-face hulls: the thick brush outline around every shape
export const matHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
export const matCloudHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, fog: false });
export const matEdge = new THREE.LineBasicMaterial({ color: 0x111111 });
export const matGround = inkMat({ color: 0x667788 });
export const matAnchor = inkMat({ color: 0x2fd8ff });
export const matAnchorRing = new THREE.MeshBasicMaterial({ color: 0x2fd8ff });
export const cpMats = {
  next: new THREE.MeshBasicMaterial({ color: 0xff3b1f }),
  later: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 }),
  done: new THREE.MeshBasicMaterial({ color: 0x2fdc7a, transparent: true, opacity: .35 }),
  finish: new THREE.MeshBasicMaterial({ color: 0xffc21a }),
};
// runner-vision beacon over the next checkpoint
export const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 400, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: .3, depthWrite: false, fog: false }));
scene.add(pillar);
