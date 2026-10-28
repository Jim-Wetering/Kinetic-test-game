import * as THREE from 'three';
import { scene } from './scene.js';
import { inkMat } from './ink.js';

// ---------------------------------------------------------------- ink materials
// polygon offset pushes faces back so the crease lines always win the depth test
export const matToon = inkMat({ vertexColors: true, polygonOffset: true });
// building walls: the same ink shading plus a window grid
export const matFacade = inkMat({ vertexColors: true, polygonOffset: true, facade: true });
// clouds stay bright and puffy: only a soft shade on the underside
export const matCloud = inkMat({ vertexColors: true, fog: false, flat: 0.65 });
// back-face hulls: the thick brush outline around every shape
export const matHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
export const matCloudHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, fog: false });
export const matEdge = new THREE.LineBasicMaterial({ color: 0x111111 });
export const matGround = inkMat({ color: 0x667788 });
// grapple points are crane hooks: a yellow hook block, with a thin target ring so they still read from afar
export const matAnchor = inkMat({ color: 0xe0a526 });
export const matAnchorRing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 });
export const cpMats = {
  next: new THREE.MeshBasicMaterial({ color: 0xff3b1f }),
  later: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 }),
  done: new THREE.MeshBasicMaterial({ color: 0x9cc48e, transparent: true, opacity: .35 }),
  finish: new THREE.MeshBasicMaterial({ color: 0xe2b45a }),
};
// runner-vision beacon over the next checkpoint
export const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 400, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: .3, depthWrite: false, fog: false }));
scene.add(pillar);
