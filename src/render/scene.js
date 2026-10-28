import * as THREE from 'three';
import { NOISE } from './ink.js';

// ---------------------------------------------------------------- renderer
export const renderer = new THREE.WebGLRenderer({ antialias: false });
// drawn at the screen's own pixel density (capped at 2x): the ink pass reads the depth texture, which rules out
// multisampling, so edges and fine brushwork are smoothed by the temporal pass in post.js instead. drawing at 1.5-2x
// and scaling down did the same job at twice the cost or more, and still shimmered as the view turned
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1), 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 160, 950);
export const cam = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 2400);
cam.rotation.order = 'YXZ';
export const camDir = new THREE.Vector3(); // where the camera looks, updated every frame

// three's lights only light the toon materials still left (none in the world); the ink shader reads INK uniforms
export const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.55);
export const sun = new THREE.DirectionalLight(0xffffff, 0.85);
scene.add(hemi, sun);

// ---------------------------------------------------------------- painted sky
// a grubby wall of paint rather than a sky: a wash scraped on in wide horizontal passes of a dry palette knife,
// rust and smoke stains soaked into it, runs dripping down, a low band of smog over the rooftops
// and the sun as a blown-out smear of light
export const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, low: { value: new THREE.Color() },
  sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stain: { value: new THREE.Color() },
  smog: { value: new THREE.Color() }, ink: { value: new THREE.Color() }, sunR: { value: 0.06 } };
// it's drawn last, pinned to the far plane, so it's only painted where nothing else covers the screen: its brushwork
// is costly per pixel, and drawn first it was painted under every building too
export const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 top, hor, low, sunCol, sunDir, stain, smog, ink; uniform float sunR; varying vec3 vDir;
    ${NOISE}
    float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.28 + noise(p * 4.3) * 0.17; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      // position round the horizon in radians, and that wrapped onto a circle so the noise has no seam behind you
      vec2 ring = normalize(d.xz + 1e-5);
      // the wash: horizon colour up to the top colour, its height dragged unevenly sideways by the knife
      float t = clamp(h / 0.55 + (fbm(ring * 2.5 + h * 6.0) - 0.5) * 0.18, 0.0, 1.0);
      vec3 c = mix(hor, top, smoothstep(0.0, 1.0, t));
      // scraped passes: long horizontal bands where the knife dragged lighter or darker paint over what's there,
      // each broken up along its length by the dry grain of the knife, which runs sideways
      // (slow round the horizon and fast with height, so the passes lie flat instead of fanning out like rays)
      float pass = fbm(vec2(ring.x * 0.6 + ring.y * 0.8, h * 24.0));
      float grain = noise(vec2(ring.x * 3.0 - ring.y * 2.0, h * 140.0)) * 0.6 + noise(vec2(ring.y * 7.0, h * 310.0)) * 0.4;
      float drag = smoothstep(0.45, 0.75, pass) * smoothstep(0.35, 0.65, grain);
      // (kept low in the sky: higher up, bands of equal height bend into arcs on screen)
      c = mix(c, mix(hor, top, 0.35) * 1.12, drag * 0.45 * smoothstep(-0.02, 0.06, h) * smoothstep(0.4, 0.2, h));
      // stains of rust and smoke soaked into the wash: big soft blotches with a darker tide-line where they dried.
      // looked up in the direction itself, so they're round blots wherever you look rather than bands
      float s = fbm(vec2(d.x * 2.6 + d.y * 1.3, d.z * 2.6 - d.y * 1.9) + 3.0);
      float blot = smoothstep(0.56, 0.7, s), tide = smoothstep(0.54, 0.58, s) * (1.0 - smoothstep(0.6, 0.66, s));
      c = mix(c, stain, blot * 0.42 * smoothstep(0.0, 0.18, h));
      c = mix(c, stain * 0.7, tide * 0.25 * smoothstep(0.0, 0.18, h));
      // runs: thin streaks of paint dripping down from the stains, each to its own length
      float col = floor((atan(d.z, d.x) + 3.1416) * 90.0);
      float runLen = 0.08 + 0.25 * hash(vec2(col, 4.0));
      float run = step(0.86, hash(vec2(col, 1.0))) * step(0.5, fract((atan(d.z, d.x) + 3.1416) * 90.0) * 2.0 - 0.5)
                * smoothstep(0.45, 0.9, h) * step(0.9 - runLen, h);
      c = mix(c, stain * 0.8, run * 0.3);
      // the sun: a blown-out smear of light, wider than it is tall, with a hot core and no outline
      vec3 sd = normalize(sunDir);
      vec3 rel = d - sd;
      float a = length(vec2(length(rel.xz) * 0.6, rel.y * 1.4));
      c = mix(c, sunCol, smoothstep(sunR * 6.0, 0.0, a) * 0.35);
      float smear = sunR * (1.0 + 0.6 * (noise(vec2(atan(rel.y, length(rel.xz)) * 3.0, 1.0)) - 0.5));
      c = mix(c, sunCol, smoothstep(smear * 1.1, smear * 0.6, a));
      // a low band of smog: a thick brushed stripe sat on the rooftops, its top edge torn
      float band = 0.05 + (fbm(ring * 4.0 + 7.0) - 0.5) * 0.06 + (noise(ring * 40.0) - 0.5) * 0.008;
      c = mix(c, smog, smoothstep(band + 0.03, band - 0.01, h) * 0.75);
      if (h < 0.0) c = mix(c, low, smoothstep(0.0, -0.04, h));
      gl_FragColor = vec4(c, 1.0);
    }`
}));
sky.renderOrder = 10; sky.frustumCulled = false;
scene.add(sky);
