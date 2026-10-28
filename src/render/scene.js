import * as THREE from 'three';
import { NOISE } from './ink.js';

// ---------------------------------------------------------------- renderer
export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
// a brushed gradient, three layers of ink-wash mountains on the horizon, a flat sun disc with an ink ring
// and long dry-brush cloud streaks
export const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, low: { value: new THREE.Color() },
  sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, mount: { value: new THREE.Color() },
  ink: { value: new THREE.Color() }, streak: { value: new THREE.Color() }, sunR: { value: 0.06 } };
export const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top, hor, low, sunCol, sunDir, mount, ink, streak; uniform float sunR; varying vec3 vDir;
    ${NOISE}
    float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.28 + noise(p * 4.3) * 0.17; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      // azimuth on a circle, so the noise wraps with no seam behind you
      vec2 ring = normalize(d.xz + 1e-5);
      // brushed bands: the gradient steps, and each step edge is dragged sideways like a wide wet brush
      float t = clamp(h / 0.6 + (fbm(ring * 3.0 + h * 9.0) - 0.5) * 0.08, 0.0, 1.0);
      t = (floor(t * 5.0) + smoothstep(0.75, 1.0, fract(t * 5.0))) / 5.0;
      vec3 c = mix(hor, top, t);
      // dry-brush cloud streaks
      float st = fbm(vec2(ring.x * 4.0 + ring.y * 2.0, h * 26.0)) * smoothstep(0.04, 0.16, h) * smoothstep(0.55, 0.25, h);
      c = mix(c, streak, smoothstep(0.58, 0.72, st) * 0.75);
      // sun: flat disc, an ink ring and a pale halo band
      float a = acos(clamp(dot(d, normalize(sunDir)), -1.0, 1.0));
      c = mix(c, mix(c, sunCol, 0.35), smoothstep(sunR * 2.2, sunR * 2.0, a));
      c = mix(c, sunCol, smoothstep(sunR + 0.002, sunR, a));
      c = mix(c, ink, smoothstep(sunR + 0.010, sunR + 0.004, a) * smoothstep(sunR - 0.002, sunR + 0.003, a));
      // sumi-e mountains: far ranges fade into the horizon colour, near ranges are darker with a wet top edge
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float ridge = 0.085 - fi * 0.025 + fbm(ring * (2.0 + fi * 1.7) + fi * 11.0) * (0.05 + fi * 0.02);
        float inside = smoothstep(ridge + 0.002, ridge - 0.002, h);
        float wash = smoothstep(ridge - 0.09, ridge, h);          // darker at the brushed top edge
        vec3 mc = mix(hor, mount, 0.35 + fi * 0.3) * (0.88 + 0.12 * (1.0 - wash));
        c = mix(c, mc, inside);
      }
      if (h < 0.0) c = mix(c, low, smoothstep(0.0, -0.04, h));
      gl_FragColor = vec4(c, 1.0);
    }`
}));
scene.add(sky);
