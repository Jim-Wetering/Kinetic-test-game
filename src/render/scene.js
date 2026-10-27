import * as THREE from 'three';

// ---------------------------------------------------------------- renderer
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 160, 950);
export const cam = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 2400);
cam.rotation.order = 'YXZ';
export const camDir = new THREE.Vector3(); // where the camera looks, updated every frame

export const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.55);
export const sun = new THREE.DirectionalLight(0xffffff, 0.85);
scene.add(hemi, sun);

export const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, low: { value: new THREE.Color() },
  sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) } };
export const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top, hor, low, sunCol, sunDir; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      float t = floor(clamp(h / 0.5, 0.0, 1.0) * 5.0) / 5.0;            // banded, cel-style gradient
      vec3 c = h > 0.0 ? mix(hor, top, t) : mix(hor, low, step(0.02, -h));
      float s = dot(d, normalize(sunDir));
      c = mix(c, mix(c, sunCol, 0.45), step(0.982, s));
      c = mix(c, vec3(1.0, 0.99, 0.94), step(0.9975, s));
      gl_FragColor = vec4(c, 1.0);
    }`
}));
scene.add(sky);
