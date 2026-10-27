import * as THREE from 'three';
import { scene } from './scene.js';

// ---------------------------------------------------------------- toon materials
// 3 hard light bands; RGBA so the toon shader's .rgb lookup is grey, not red-only
export const toonRamp = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
toonRamp.generateMipmaps = false; toonRamp.needsUpdate = true;
// polygon offset pushes faces back so the crease lines always win the depth test
export const matToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
export const matCloud = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp, fog: false });
export const matHull = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
export const matEdge = new THREE.LineBasicMaterial({ color: 0x111111 });
export const matGround = new THREE.MeshToonMaterial({ color: 0x667788, gradientMap: toonRamp });
export const matAnchor = new THREE.MeshToonMaterial({ color: 0x2fd8ff, gradientMap: toonRamp });
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
