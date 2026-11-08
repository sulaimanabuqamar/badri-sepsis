import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

/* World units are metres. x runs west→east, z runs north→south, the camera's default view looks north. */
const E = window.BadriEngine;
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { stowe: 0xEDE6DB, dove: 0x7F7A83, lake: 0x1C5469, ochre: 0xBF8945, raku: 0x5B595A, alert: 0xA8432F };

/* ---------- renderer, camera, light ---------- */
const host = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
host.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.stowe);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 300);
camera.position.set(0, 21, 16.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.0;
controls.maxDistance = 70;
controls.target.set(0, 0, -0.3);

scene.add(new THREE.HemisphereLight(0xfffaf2, 0xcdbfa9, 0.42));
const sun = new THREE.DirectionalLight(0xfff6ec, 1.05);
sun.position.set(-6, 26, 8);
sun.castShadow = true;
const LOWFX = /lowfx/.test(location.search);
sun.shadow.mapSize.set(LOWFX ? 1024 : 4096, LOWFX ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 13, bottom: -13, near: 4, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const roomLights = [];
for (const [x, z] of [[-8.5, -4.6], [-0.2, -5.2], [4.3, -5.2], [-8.5, 4.8], [2.2, 3.0], [10.5, -4.6]]) {
  const l = new THREE.PointLight(0xfff0dc, 0.9, 0, 2);
  l.position.set(x, 2.45, z); scene.add(l); roomLights.push(l);
}
// clinical ceiling light panels (soft area light, 4000 K-ish)
RectAreaLightUniformsLib.init();
for (const [x, z, w, d, i] of [[-8.5, -5.0, 1.2, 0.6, 9], [-8.5, -3.0, 1.2, 0.6, 6], [-1.5, -6.6, 1.2, 0.6, 7], [2.0, -6.6, 1.2, 0.6, 9], [5.5, -6.6, 1.2, 0.6, 7], [2.0, -3.4, 1.2, 0.6, 5], [-8.5, 5.0, 1.2, 0.6, 8], [2.25, 3.4, 1.8, 0.6, 7], [-6, 0.15, 1.2, 0.6, 4], [6, 0.15, 1.2, 0.6, 4]]) {
  const r = new THREE.RectAreaLight(0xfff5ea, i, w, d);
  r.position.set(x, 2.66, z); r.lookAt(x, 0, z); scene.add(r);
}
const alarmLight = new THREE.PointLight(C.alert, 0, 0, 2);
alarmLight.position.set(2.0, 1.9, -7.2);
scene.add(alarmLight);

/* ---------- textures & materials ---------- */
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const oakTex = canvasTex(1024, 1024, (g, w, h) => {
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * w * 0.6;
    while (x < w) {
      const len = w * (0.45 + rnd() * 0.5), k = 0.9 + rnd() * 0.15;
      g.fillStyle = `rgb(${Math.round(216 * k)},${Math.round(184 * k)},${Math.round(142 * k)})`;
      g.fillRect(x, r * rh, len, rh);
      for (let i = 0; i < 16; i++) {
        g.strokeStyle = `rgba(122,84,48,${0.04 + rnd() * 0.07})`; g.lineWidth = 0.5 + rnd() * 1.6;
        g.beginPath(); let y = r * rh + 2 + rnd() * (rh - 4); g.moveTo(x, y);
        for (let s = 1; s <= 8; s++) { y = Math.min(r * rh + rh - 2, Math.max(r * rh + 2, y + (rnd() - 0.5) * 3)); g.lineTo(x + (len * s) / 8, y); }
        g.stroke();
      }
      g.fillStyle = 'rgba(96,66,38,0.32)'; g.fillRect(Math.max(0, x), r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(96,66,38,0.28)'; g.fillRect(0, r * rh, w, 2);
  }
});
const tileTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#E9E3D9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(91,89,90,0.05)' : 'rgba(255,255,255,0.4)'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.fillStyle = 'rgba(91,89,90,0.2)';
  for (const p of [0, w / 2]) { g.fillRect(p, 0, 2, h); g.fillRect(0, p, w, 2); }
});
const ceilTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#F4F0E9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(91,89,90,0.08)'; g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2); }
  g.fillStyle = 'rgba(127,122,131,0.45)';
  for (const p of [0, w / 2]) { g.fillRect(p, 0, 3, h); g.fillRect(0, p, w, 3); }
});
const skyTex = canvasTex(256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#BFD9E3'); gr.addColorStop(0.65, '#E9EEE9'); gr.addColorStop(1, '#F3EADB');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(127,122,131,0.28)';
  for (let x = 0; x < w;) { const bw = 14 + rnd() * 30, bh = 30 + rnd() * 70; g.fillRect(x, h - bh, bw, bh); x += bw + 4; }
});
const glowTex = canvasTex(256, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.12, 'rgba(0,0,0,0)'); side.addColorStop(0.88, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, w, h);
});

const blobTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
blobTex.wrapS = blobTex.wrapT = THREE.ClampToEdgeWrapping;
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));
const M = {
  wall: mat(C.stowe, { roughness: 0.95 }),
  lakeWall: mat(C.lake, { roughness: 0.92 }),
  cap: mat(C.raku, { roughness: 0.9 }),
  skirting: mat(C.raku, { roughness: 0.6 }),
  oak: mat(0xffffff, { map: oakTex, roughness: 0.5 }),
  tile: mat(0xffffff, { map: tileTex, roughness: 0.32 }),
  ceiling: mat(0xffffff, { map: ceilTex, roughness: 0.95 }),
  ground: mat(0xD3CABC, { roughness: 1 }),
  stripe: mat(C.lake, { roughness: 0.7 }),
  hpl: mat(0xF1ECE3, { roughness: 0.55 }),
  top: mat(0xF8F5EF, { roughness: 0.3 }),
  flute: mat(0xD8BB90, { roughness: 0.48 }),
  oakPanel: mat(0xCFAF84, { roughness: 0.55 }),
  metal: mat(0xC4C1C5, { roughness: 0.3, metalness: 0.7 }),
  dark: mat(C.raku, { roughness: 0.5, metalness: 0.25 }),
  black: mat(0x232223, { roughness: 0.45 }),
  dove: mat(C.dove, { roughness: 0.8 }),
  ochre: mat(C.ochre, { roughness: 0.45 }),
  sheet: mat(0xF9F7F3, { roughness: 0.92 }),
  pillow: mat(0xFFFFFF, { roughness: 0.95 }),
  blanket: mat(0x3F7487, { roughness: 1 }),
  rail: mat(C.lake, { roughness: 0.4 }),
  board: mat(0xE4DACB, { roughness: 0.5 }),
  fabric: mat(C.lake, { roughness: 1 }),
  curtain: mat(0xC4BEC7, { roughness: 1, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0xD7E7EA, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }),
  frosted: new THREE.MeshStandardMaterial({ color: 0xE9EEEE, roughness: 0.3, transparent: true, opacity: 0.75 }),
  sky: new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }),
  leaf: mat(0x5E7A50, { roughness: 0.75, flatShading: true }),
  leaf2: mat(0x71905C, { roughness: 0.75, flatShading: true }),
  pot: mat(0xE7DFD3, { roughness: 0.6 }),
  led: new THREE.MeshStandardMaterial({ color: C.ochre, emissive: 0xF0B26A, emissiveIntensity: 2.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xFFE7C4, emissiveIntensity: 1.6 }),
  panelLight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xFFF6EA, emissiveIntensity: 1.1 }),
  wash: new THREE.MeshBasicMaterial({ map: glowTex, color: 0xE9A85E, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  green: mat(0x5E8E6A, { roughness: 0.5 }),
  clear: new THREE.MeshStandardMaterial({ color: 0xE6F0F2, roughness: 0.1, transparent: true, opacity: 0.55 }),
  paper: mat(0xFFFFFF, { roughness: 0.95 }),
  blob: new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false })
};
function contact(x, z, w, d, parent = scene, rotY = 0) {   // soft contact shadow on the floor
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.blob);
  m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, 0.006, z); m.renderOrder = 1; parent.add(m); return m;
}

/* ---------- geometry helpers ---------- */
function group(x = 0, y = 0, z = 0, rotY = 0, parent = scene) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g); return g;
}
function box(w, h, d, material, x, y, z, parent = scene, o = {}) {
  const r = o.round ? Math.min(o.round, Math.min(w, h, d) / 2 - 0.001) : 0;
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = o.cast !== false; m.receiveShadow = true;
  parent.add(m); return m;
}
function cyl(rt, rb, h, material, x, y, z, parent = scene, seg = 20, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), material);
  m.position.set(x, y, z); m.castShadow = o.cast !== false; m.receiveShadow = true;
  parent.add(m); return m;
}
function sphere(r, material, x, y, z, parent = scene, o = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, o.seg || 20, o.seg2 || 14, 0, Math.PI * 2, 0, o.theta || Math.PI), material);
  m.position.set(x, y, z); m.castShadow = o.cast !== false; parent.add(m); return m;
}
function plane(w, d, material, x, y, z, unitX = 1, unitZ = 1) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / unitX, uv.getY(i) * d / unitZ);
  const m = new THREE.Mesh(g, material);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
  scene.add(m); return m;
}
const halfCyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, -Math.PI / 2, Math.PI);
function fluted(parent, w, h, x, y, z) {
  const n = Math.max(3, Math.round(w / 0.07)), r = w / (2 * n);
  const im = new THREE.InstancedMesh(halfCyl, M.flute, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(r, h, r * 0.85);
  for (let i = 0; i < n; i++) { m4.compose(new THREE.Vector3(-w / 2 + r + i * 2 * r, 0, 0), q, s); im.setMatrixAt(i, m4); }
  im.castShadow = true; im.receiveShadow = true; im.position.set(x, y, z); parent.add(im); return im;
}
function screenPlane(w, h, tex, parent, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z); parent.add(m); return m;
}
function dynCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { c, g: c.getContext('2d'), t };
}

/* ---------- floors, ceiling ---------- */
plane(90, 70, M.ground, 0, -0.012, 0);
plane(26, 16, M.oak, 0, 0, 0, 3.0, 1.52);
plane(12.94, 6.44, M.tile, 2.5, 0.002, -4.75, 1.2, 1.2);   // ward
plane(3.94, 6.44, M.tile, 11, 0.002, -4.75, 1.2, 1.2);     // lab
plane(8.94, 6.14, M.tile, -8.5, 0.002, 4.9, 1.2, 1.2);     // clinic
plane(24.6, 0.07, M.stripe, -0.2, 0.004, 1.42);            // wayfinding line
plane(0.07, 3.1, M.stripe, 12.06, 0.004, 2.95);
plane(1.4, 2.6, M.black, -12.2, 0.004, 0.15);              // entrance mat
const ceiling = new THREE.Group(); scene.add(ceiling);
{
  const geo = new THREE.PlaneGeometry(26, 16);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 26 / 1.2, uv.getY(i) * 16 / 1.2);
  const c = new THREE.Mesh(geo, M.ceiling); c.rotation.x = Math.PI / 2; c.position.set(0, 2.7, 0); ceiling.add(c);
  for (let x = -11.4; x <= 12; x += 2.4) for (const z of [-6.0, -3.3, 0.15, 3.6, 6.3]) box(0.58, 0.02, 0.58, M.panelLight, x, 2.69, z, ceiling, { cast: false });
}

/* ---------- walls ---------- */
const H = 2.7, T = 0.12;
function wall(x0, z0, x1, z1, material = M.wall) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = alongX ? len : T, d = alongX ? T : len;
  box(w, H, d, material, cx, H / 2, cz);
  box(w + 0.002, 0.012, d + 0.002, M.cap, cx, H + 0.006, cz, scene, { cast: false });
  box(alongX ? len : T + 0.03, 0.1, alongX ? T + 0.03 : len, M.skirting, cx, 0.05, cz, scene, { cast: false });
}
function lintel(x0, x1, z, alongX = true) {
  const w = Math.abs(x1 - x0), c = (x0 + x1) / 2;
  if (alongX) { box(w, 0.55, T, M.wall, c, 2.425, z); box(w, 0.05, T + 0.04, M.dark, c, 2.15, z); for (const x of [x0, x1]) box(0.06, 2.15, T + 0.05, M.dark, x, 1.075, z); }
  else { box(T, 0.55, w, M.wall, z, 2.425, c); box(T + 0.04, 0.05, w, M.dark, z, 2.15, c); for (const v of [x0, x1]) box(T + 0.05, 2.15, 0.06, M.dark, z, 1.075, v); }
}
wall(-13, -8, 13, -8);
wall(-13, -8, -13, -1.5); wall(-13, 1.8, -13, 8);
wall(13, -8, 13, 3.0); wall(13, 6.0, 13, 8);
wall(-13, 8, 13, 8);
wall(-13, -1.5, -9.6, -1.5); wall(-7.4, -1.5, -4, -1.5); lintel(-9.6, -7.4, -1.5);
wall(-4, -1.5, 1.0, -1.5); wall(3.0, -1.5, 9, -1.5); lintel(1.0, 3.0, -1.5);
wall(9, -1.5, 10, -1.5); wall(12, -1.5, 13, -1.5); lintel(10, 12, -1.5);
wall(-4, -8, -4, -1.5); wall(9, -8, 9, -1.5);
wall(-13, 1.8, -9.6, 1.8); wall(-7.4, 1.8, -4, 1.8); lintel(-9.6, -7.4, 1.8);
wall(-4, 1.8, -4, 8);
wall(-0.6, 5.2, 5.1, 5.2, M.lakeWall);   // nurse-station feature wall
lintel(3.0, 6.0, 13, false);
// open door leaves
box(0.04, 2.1, 1.0, M.board, -9.55, 1.05, -2.05);
box(0.04, 2.1, 1.0, M.board, -9.55, 1.05, 2.35);
box(0.04, 2.1, 0.95, M.board, 1.05, 1.05, -2.02); box(0.04, 2.1, 0.95, M.board, 2.95, 1.05, -2.02);
// feature panels on wall faces
box(8.86, 2.68, 0.02, M.lakeWall, -8.5, 1.35, -7.93, scene, { cast: false });           // triage back wall
box(12.86, 1.0, 0.02, M.lakeWall, 2.5, 0.5, -7.93, scene, { cast: false });             // ward wainscot
box(12.86, 0.06, 0.04, M.dark, 2.5, 1.0, -7.92, scene, { cast: false });
// entrance: glass storefront and sliding doors
box(T, 0.3, 3.3, M.dark, -13, 2.55, 0.15);
for (const z of [-1.5, 1.8]) box(0.1, 2.4, 0.1, M.dark, -13, 1.2, z);
const doorL = box(0.04, 2.35, 1.62, M.glass, -13, 1.18, -0.66, scene, { cast: false });
const doorR = box(0.04, 2.35, 1.62, M.glass, -13, 1.18, 0.96, scene, { cast: false });
for (const d of [doorL, doorR]) { box(0.06, 2.35, 0.04, M.dark, 0, 0, 0.79, d); box(0.06, 2.35, 0.04, M.dark, 0, 0, -0.79, d); }
// ICU doors and sign
const icuDoors = [];
for (const s of [-1, 1]) {
  const hinge = group(12.96, 0, 4.5 + 1.5 * s, 0);
  const leaf = box(0.05, 2.1, 1.46, M.hpl, 0, 1.05, -0.73 * s, hinge);
  box(0.06, 0.6, 0.35, M.frosted, 0, 1.45, -0.73 * s, hinge, { cast: false });
  box(0.07, 0.25, 0.12, M.metal, -0.01, 1.05, -1.25 * s, hinge);
  icuDoors.push({ hinge, s, open: 0 });
}
const icuSign = dynCanvas(256, 96);
const icuSignMesh = screenPlane(0.9, 0.34, icuSign.t, scene, 12.92, 2.42, 4.5);
icuSignMesh.rotation.y = -Math.PI / 2;
let icuFlash = false;
function drawIcuSign(on) {
  const g = icuSign.g; g.fillStyle = on ? '#A8432F' : '#1C5469'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#EDE6DB'; g.font = '700 52px "Inter Tight", Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ICU', 128, 50); icuSign.t.needsUpdate = true;
}
drawIcuSign(false);

/* ---------- furniture ---------- */
function counter(x, z, w, rotY) {
  const g = group(x, 0, z, rotY);
  const D = 0.75, Hc = 1.05;
  box(w, Hc - 0.07, D - 0.08, M.hpl, 0, 0.07 + (Hc - 0.07) / 2, -0.04, g);
  fluted(g, w - 0.02, Hc - 0.12, 0, 0.085 + (Hc - 0.12) / 2, D / 2 - 0.08);
  box(w + 0.08, 0.04, D + 0.06, M.top, 0, Hc + 0.02, 0, g, { round: 0.012 });
  box(w - 0.1, 0.03, 0.55, M.top, 0, 0.74, -D / 2 - 0.25, g, { round: 0.01 });
  for (const s of [-1, 1]) box(0.04, 0.72, 0.5, M.hpl, s * (w / 2 - 0.08), 0.37, -D / 2 - 0.25, g);
  box(w - 0.06, 0.02, 0.025, M.led, 0, 0.045, D / 2 - 0.05, g, { cast: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, 0.9), M.wash);
  wash.rotation.x = -Math.PI / 2; wash.position.set(0, 0.007, D / 2 + 0.4); g.add(wash);
  return g;
}
function pcMonitor(parent, x, y, z, rotY) {
  const g = group(x, y, z, rotY, parent);
  box(0.52, 0.31, 0.025, M.black, 0, 0.27, 0, g, { round: 0.008 });
  box(0.04, 0.12, 0.04, M.dark, 0, 0.07, -0.02, g); box(0.2, 0.012, 0.16, M.dark, 0, 0.006, -0.02, g);
  return g;
}
function officeChair(x, z, rotY) {
  const g = group(x, 0, z, rotY);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = box(0.03, 0.025, 0.3, M.dark, Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14, g); leg.rotation.y = a; }
  cyl(0.022, 0.022, 0.32, M.metal, 0, 0.22, 0, g, 10);
  box(0.48, 0.07, 0.46, M.fabric, 0, 0.405, -0.02, g, { round: 0.03 });
  box(0.45, 0.5, 0.06, M.fabric, 0, 0.74, -0.25, g, { round: 0.03 });
  return g;
}
function sideChair(x, z, rotY, fabric = M.fabric) {
  const g = group(x, 0, z, rotY);
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) cyl(0.014, 0.014, 0.4, M.metal, sx, 0.2, sz, g, 8);
  box(0.5, 0.06, 0.46, fabric, 0, 0.41, 0, g, { round: 0.025 });
  box(0.48, 0.42, 0.05, fabric, 0, 0.7, -0.22, g, { round: 0.022 });
  return g;
}
function plant(x, z, s = 1) {
  const g = group(x, 0, z, rnd() * 6);
  cyl(0.2 * s, 0.16 * s, 0.42 * s, M.pot, 0, 0.21 * s, 0, g, 18);
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 * s * (0.7 + rnd() * 0.6), 0), i % 2 ? M.leaf : M.leaf2);
    l.position.set((rnd() - 0.5) * 0.36 * s, (0.6 + rnd() * 0.75) * s, (rnd() - 0.5) * 0.36 * s);
    l.scale.set(1, 1.6, 0.6); l.rotation.set(rnd(), rnd() * 6, rnd()); l.castShadow = true; g.add(l);
  }
  return g;
}
function pendant(x, y, z) {
  cyl(0.004, 0.004, 2.7 - y, M.black, x, (2.7 + y) / 2, z, scene, 6, { cast: false });
  cyl(0.06, 0.13, 0.18, M.dark, x, y, z, scene, 20, { cast: false });
  cyl(0.12, 0.12, 0.01, M.lamp, x, y - 0.09, z, scene, 20, { cast: false });
}
function wallPanel(x, y, z, rotY) {   // BP gauge, otoscope and ophthalmoscope on a wall rail
  const g = group(x, y, z, rotY);
  box(0.9, 0.3, 0.03, M.hpl, 0, 0, 0, g);
  const gauge = cyl(0.08, 0.08, 0.04, M.top, -0.3, 0.02, 0.04, g, 24); gauge.rotation.x = Math.PI / 2;
  const rim = cyl(0.085, 0.085, 0.03, M.black, -0.3, 0.02, 0.025, g, 24); rim.rotation.x = Math.PI / 2;
  for (const dx of [0.05, 0.2]) { box(0.07, 0.1, 0.06, M.dark, dx, 0.05, 0.04, g); cyl(0.016, 0.016, 0.22, M.black, dx, -0.13, 0.05, g, 8); }
  box(0.1, 0.16, 0.08, M.top, 0.36, -0.02, 0.05, g);
  return g;
}
function sanitizer(x, y, z, rotY) { const g = group(x, y, z, rotY); box(0.1, 0.2, 0.08, M.top, 0, 0, 0.04, g, { round: 0.02 }); box(0.04, 0.03, 0.03, M.dark, 0, -0.1, 0.07, g); }
function windowOn(x, y, z, w, h, rotY) {
  const g = group(x, y, z, rotY);
  screenPlane(w, h, skyTex, g, 0, 0, 0.012).material = M.sky;
  box(w + 0.1, 0.05, 0.08, M.dark, 0, h / 2, 0.03, g); box(w + 0.1, 0.05, 0.16, M.top, 0, -h / 2, 0.06, g);
  for (const s of [-1, 0, 1]) box(0.045, h, 0.07, M.dark, s * w / 2, 0, 0.03, g);
  return g;
}

// TRIAGE: fluted desk in front of the Deep Lake wall, nurse behind it, patient chair, vitals stand
const triageDesk = counter(-8.5, -5.0, 2.0, 0);
pcMonitor(triageDesk, 0.45, 0.755, -0.75, Math.PI + 0.25);
officeChair(-8.5, -6.0, 0);
sideChair(-8.5, -3.97, Math.PI);
box(1.5, 0.05, 0.18, M.dark, -8.5, 2.67, -5.4, scene, { cast: false }); box(1.42, 0.012, 0.12, M.panelLight, -8.5, 2.64, -5.4, scene, { cast: false });
wallPanel(-8.5, 1.55, -7.91, 0);
sanitizer(-4.08, 1.25, -2.4, -Math.PI / 2);
plant(-12.4, -7.4, 1.2); plant(-4.6, -7.4);
for (const z of [-6.6, -5.9, -5.2]) sideChair(-12.55, z, Math.PI / 2);
const triageVitals = group(-9.6, 0, -3.55, 0.7);
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const l = box(0.025, 0.02, 0.24, M.dark, Math.sin(a) * 0.1, 0.04, Math.cos(a) * 0.1, triageVitals); l.rotation.y = a; }
cyl(0.015, 0.015, 1.05, M.metal, 0, 0.55, 0, triageVitals, 8);
box(0.3, 0.24, 0.1, M.top, 0, 1.15, 0, triageVitals, { round: 0.02 });
box(0.2, 0.1, 0.12, M.dove, 0, 0.92, 0.02, triageVitals, { round: 0.02 });
const triageScreen = dynCanvas(320, 240);
screenPlane(0.25, 0.188, triageScreen.t, triageVitals, 0, 1.155, 0.052);

// LAB
box(3.6, 0.9, 0.62, M.hpl, 11, 0.45, -7.6); box(3.7, 0.04, 0.68, M.top, 11, 0.92, -7.58, scene, { round: 0.01 });
box(0.6, 0.5, 0.5, M.top, 9.9, 1.19, -7.6, scene, { round: 0.03 }); box(0.4, 0.14, 0.02, M.black, 9.9, 1.3, -7.34);
cyl(0.18, 0.2, 0.26, M.top, 10.8, 1.07, -7.6, scene, 24);
box(0.8, 0.45, 0.45, M.top, 11.8, 1.17, -7.6, scene, { round: 0.03 });
box(0.75, 1.85, 0.65, M.hpl, 12.45, 0.925, -5.4, scene, { round: 0.02 }); box(0.02, 1.6, 0.5, M.frosted, 12.06, 0.95, -5.4, scene, { cast: false });
plant(9.5, -2.1, 0.9);

// WARD: beds, headwalls, monitors, curtains, crash cart
function bed(x, angle) {
  const g = group(x, 0, 0, 0);
  const zH = -7.85, zF = -5.75, zHinge = -7.0;
  for (const sx of [-0.34, 0.34]) for (const sz of [zH + 0.2, zF - 0.2]) {
    cyl(0.012, 0.012, 0.14, M.metal, sx, 0.15, sz, g, 8);
    const w = cyl(0.055, 0.055, 0.04, M.black, sx, 0.058, sz, g, 16); w.rotation.z = Math.PI / 2;
  }
  box(0.78, 0.07, 1.9, M.dark, 0, 0.23, (zH + zF) / 2, g);
  box(0.2, 0.2, 0.5, M.dark, 0, 0.36, (zH + zF) / 2, g);
  box(0.9, 0.05, 2.02, M.metal, 0, 0.47, (zH + zF) / 2, g);
  box(0.86, 0.14, zF - zHinge - 0.03, M.sheet, 0, 0.55, (zHinge + zF) / 2 + 0.015, g, { round: 0.05 });
  const hp = group(0, 0.48, zHinge, 0, g); hp.rotation.x = angle;
  box(0.86, 0.14, 0.84, M.sheet, 0, 0.07, -0.43, hp, { round: 0.05 });
  box(0.56, 0.12, 0.34, M.pillow, 0, 0.19, -0.64, hp, { round: 0.05 });
  for (const s of [-1, 1]) box(0.035, 0.2, 0.62, M.rail, 0.465 * s, 0.24, -0.44, hp, { round: 0.014 });
  box(0.035, 0.15, 0.72, M.rail, 0.465, 0.66, -6.3, g, { round: 0.014 });
  box(0.96, 0.55, 0.045, M.board, 0, 0.75, zH - 0.03, g, { round: 0.02 });
  box(0.96, 0.4, 0.05, M.board, 0, 0.66, zF + 0.02, g, { round: 0.02 });
  // a thick hospital blanket from the waist down: long garments (abaya, kandura) stay hidden under it
  const blanket = box(0.95, 0.4, 1.36, M.blanket, 0, 0.81, -6.42, g, { round: 0.17 });
  box(0.95, 0.5, 0.5, M.blanket, 0, 0.06, 0.4, blanket, { round: 0.2 });
  const folded = box(0.86, 0.07, 0.42, M.blanket, 0, 0.655, -5.98, g, { round: 0.03 });
  folded.visible = false;
  // headwall
  box(1.3, 0.85, 0.035, M.oakPanel, 0, 1.45, -7.925, g);
  box(1.1, 0.09, 0.05, M.top, 0, 1.3, -7.9, g);
  cyl(0.022, 0.022, 0.09, M.green, -0.38, 1.22, -7.86, g, 12);
  cyl(0.05, 0.05, 0.15, M.clear, 0.38, 1.18, -7.84, g, 16);
  box(1.2, 0.025, 0.05, M.lamp, 0, 1.9, -7.9, g, { cast: false });
  const call = box(0.06, 0.06, 0.03, new THREE.MeshStandardMaterial({ color: 0x4a4849, emissive: C.alert, emissiveIntensity: 0 }), 0.55, 1.82, -7.89, g, { cast: false });
  return { g, blanket, folded, call };
}
function locker(x, z) { const g = group(x, 0, z, 0); box(0.44, 0.78, 0.44, M.hpl, 0, 0.39, 0, g, { round: 0.02 }); box(0.46, 0.03, 0.46, M.oakPanel, 0, 0.795, 0, g); box(0.38, 0.01, 0.01, M.dark, 0, 0.55, 0.225, g); cyl(0.045, 0.04, 0.2, M.clear, 0.08, 0.91, 0.05, g, 14); }
function monitorArm(x, canvasObj) {
  box(0.1, 0.14, 0.04, M.metal, x + 0.78, 1.72, -7.92);
  const arm = box(0.035, 0.035, 0.32, M.metal, x + 0.78, 1.74, -7.74); arm.castShadow = false;
  const g = group(x + 0.74, 1.76, -7.52, -0.42);
  box(0.42, 0.32, 0.07, M.top, 0, 0, 0, g, { round: 0.02 });
  screenPlane(0.36, 0.24, canvasObj.t, g, 0, 0.005, 0.036);
  return g;
}
const beds = [bed(-1.5, 0.35), bed(2.0, 0.6), bed(5.5, 0.4)];
for (const x of [-1.5, 2.0, 5.5]) contact(x, -6.8, 1.5, 2.8);
contact(-8.5, -5.0, 2.6, 1.3); contact(2.25, 3.0, 5.0, 1.3); contact(-8.5, 5.4, 2.0, 1.2); contact(8.3, -6.4, 0.9, 1.2); contact(8.3, -4.6, 0.8, 1.0); contact(11, -7.6, 3.9, 1.0); contact(-12.35, 5.2, 1.0, 2.3);
for (const [x, z] of [[-8.5, -3.97], [-8.5, -6.0], [-8.5, 4.28], [-8.5, 6.48], [1.35, 4.12], [3.15, 4.12]]) contact(x, z, 0.75, 0.75);
const bed2 = beds[1];
locker(-2.25, -7.6); locker(4.75, -7.6);
const monCanvas = [dynCanvas(480, 320), dynCanvas(480, 320), dynCanvas(480, 320)];
beds.forEach((b, i) => monitorArm([-1.5, 2.0, 5.5][i], monCanvas[i]));
// curtains: ceiling tracks with bunched fabric
function curtain(x) {
  box(0.03, 0.03, 4.0, M.metal, x, 2.6, -5.9, scene, { cast: false });
  const geo = new THREE.PlaneGeometry(0.9, 2.2, 28, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 34) * 0.045);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M.curtain); m.rotation.y = Math.PI / 2; m.position.set(x, 1.48, -7.3); m.castShadow = true; scene.add(m);
}
curtain(0.25); curtain(3.75);
// IV pole at bed 2 (bag + line appear when treatment starts)
const iv = group(2.62, 0, -7.2, 0);
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const l = box(0.025, 0.02, 0.26, M.dark, Math.sin(a) * 0.11, 0.05, Math.cos(a) * 0.11, iv); l.rotation.y = a; }
cyl(0.012, 0.012, 1.95, M.metal, 0, 1.0, 0, iv, 8);
box(0.2, 0.012, 0.012, M.metal, 0, 1.96, 0, iv);
box(0.15, 0.2, 0.12, M.top, 0, 1.15, 0.07, iv, { round: 0.02 });
const pumpScreen = box(0.09, 0.05, 0.005, new THREE.MeshStandardMaterial({ color: 0x1b2a2e, emissive: 0x000000 }), 0, 1.19, 0.132, iv, { cast: false });
const ivBag = box(0.12, 0.2, 0.04, M.clear, 0.08, 1.82, 0, iv, { round: 0.02, cast: false });
const ivLine = cyl(0.004, 0.004, 1.05, M.clear, -0.15, 1.2, 0.25, iv, 6, { cast: false });
ivLine.rotation.x = 0.5; ivLine.rotation.z = 0.35;
// crash cart (Red Ochre) and supply cart
{
  const g = group(8.3, 0, -6.4, -Math.PI / 2);
  box(0.72, 0.92, 0.52, M.ochre, 0, 0.56, 0, g, { round: 0.03 });
  for (let i = 0; i < 5; i++) { box(0.68, 0.012, 0.01, M.dark, 0, 0.2 + i * 0.17, 0.262, g, { cast: false }); box(0.34, 0.025, 0.03, M.metal, 0, 0.27 + i * 0.17, 0.275, g); }
  box(0.78, 0.04, 0.56, M.dark, 0, 1.04, 0, g, { round: 0.01 });
  box(0.36, 0.22, 0.26, M.dark, -0.1, 1.17, 0, g, { round: 0.03 });
  box(0.14, 0.09, 0.005, new THREE.MeshBasicMaterial({ color: 0x2c3b2c }), -0.12, 1.2, 0.131, g, { cast: false });
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.2, 0.2]) { const w = cyl(0.045, 0.045, 0.035, M.black, sx, 0.05, sz, g, 14); w.rotation.z = Math.PI / 2; }
  const s = group(8.3, 0, -4.6, -Math.PI / 2);
  box(0.6, 1.05, 0.48, M.dove, 0, 0.6, 0, s, { round: 0.03 });
  for (let i = 0; i < 6; i++) box(0.56, 0.01, 0.01, M.dark, 0, 0.18 + i * 0.16, 0.242, s, { cast: false });
  for (const sx of [-0.24, 0.24]) for (const sz of [-0.18, 0.18]) { const w = cyl(0.04, 0.04, 0.03, M.black, sx, 0.045, sz, s, 14); w.rotation.z = Math.PI / 2; }
}
box(0.18, 0.24, 0.12, M.ochre, 8.92, 1.25, -2.4, scene, { round: 0.02 });   // sharps bin
sanitizer(3.15, 1.25, -1.58, Math.PI);
// ward clock (face shows the simulation time)
const clockCanvas = dynCanvas(256, 256);
{
  const rim = cyl(0.17, 0.17, 0.04, M.dark, 3.75, 2.22, -7.92, scene, 32, { cast: false }); rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 40), new THREE.MeshBasicMaterial({ map: clockCanvas.t }));
  face.position.set(3.75, 2.22, -7.895); scene.add(face);
}
let lastClockMin = -1;
function drawClock(minOfDay) {
  if (minOfDay === lastClockMin) return; lastClockMin = minOfDay;
  const g = clockCanvas.g; g.fillStyle = '#F8F5EF'; g.fillRect(0, 0, 256, 256);
  g.translate(128, 128); g.strokeStyle = '#3F3D3E';
  for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.lineWidth = i % 3 ? 4 : 8; g.beginPath(); g.moveTo(0, -112); g.lineTo(0, -92); g.stroke(); g.restore(); }
  const hA = ((minOfDay / 60) % 12) / 12 * Math.PI * 2, mA = (minOfDay % 60) / 60 * Math.PI * 2;
  g.lineCap = 'round'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(hA) * 58, -Math.cos(hA) * 58); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(mA) * 88, -Math.cos(mA) * 88); g.stroke();
  g.fillStyle = '#BF8945'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0); clockCanvas.t.needsUpdate = true;
}

// CLINIC
{
  const d = group(-8.5, 0, 5.4, 0);
  box(1.6, 0.04, 0.75, M.oakPanel, 0, 0.74, 0, d, { round: 0.01 });
  for (const sx of [-0.75, 0.75]) box(0.04, 0.72, 0.7, M.dark, sx, 0.36, 0, d);
  pcMonitor(d, -0.35, 0.76, 0.12, Math.PI - 0.3);
  officeChair(-8.5, 6.48, Math.PI);
  sideChair(-8.5, 4.28, 0);
  const couch = group(-12.35, 0, 5.2, 0);
  box(0.62, 0.55, 1.85, M.hpl, 0, 0.3, 0, couch, { round: 0.03 });
  box(0.66, 0.1, 1.9, M.fabric, 0, 0.62, 0, couch, { round: 0.04 });
  box(0.5, 0.012, 1.7, M.paper, 0, 0.675, 0, couch, { cast: false });
  wallPanel(-12.93, 1.55, 6.8, Math.PI / 2);
  box(0.9, 0.85, 0.55, M.hpl, -12.6, 0.43, 7.35, scene, { round: 0.02 }); box(0.95, 0.04, 0.6, M.top, -12.6, 0.875, 7.35);
  windowOn(-9.0, 1.55, 7.94, 2.2, 1.3, Math.PI);
  plant(-4.6, 7.4, 1.1);
  sanitizer(-4.08, 1.25, 2.4, -Math.PI / 2);
}

// WAITING AREA + NURSE STATION + ICU ZONE
for (const z of [3.2, 4.4]) for (let i = 0; i < 4; i++) sideChair(-3.4 + i * 0.58, z, Math.PI);
plant(-3.4, 7.3); plant(-0.9, 7.3, 0.9);
const stationDesk = counter(2.25, 3.0, 4.5, Math.PI);
pcMonitor(stationDesk, -0.9, 0.755, -0.72, 0.15); pcMonitor(stationDesk, 0.9, 0.755, -0.72, -0.15);
officeChair(1.35, 4.12, Math.PI); officeChair(3.15, 4.12, Math.PI);
const board = dynCanvas(1024, 576);
const boardG = group(2.25, 1.78, 5.13, Math.PI);
box(1.86, 1.06, 0.05, M.black, 0, 0, 0.0, boardG, { round: 0.015 });
screenPlane(1.78, 1.0, board.t, boardG, 0, 0, 0.027);
for (const x of [8.0, 9.6]) sideChair(x, 7.4, Math.PI);
plant(11.9, 7.2, 1.1); plant(6.7, 7.3);
// outside
for (const z of [-2.4, 2.7]) { plant(-14.2, z, 1.2); }

/* ---------- people ---------- */
const SKIN = [0xC68C6A, 0x8D5A3B, 0xE0B18F, 0xB07A55, 0xD9A17C, 0xA86F4C, 0x6E4630];
const HIP = 0.9, SIT_Y = -0.38;
function capsule(r, len, m, x, y, z, parent) {
  const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), m);
  c.position.set(x, y, z); c.castShadow = true; parent.add(c); return c;
}
function person(o) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); scene.add(g);
  const mm = (c, extra) => mat(c, Object.assign({ roughness: 0.9 }, extra));
  const mTop = mm(o.top), mBot = mm(o.bottom ?? o.top), mSkin = mm(o.skin, { roughness: 0.6 }), mShoe = mm(o.shoes ?? 0x2f2e2f, { roughness: 0.5 });
  const mSleeve = o.coat ? mm(o.coat) : mTop;
  const legs = [], arms = [], shoes = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.09 * s, HIP, 0); inner.add(hip);
    capsule(0.07, 0.43, mBot, 0, -0.215, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    capsule(0.056, 0.41, mBot, 0, -0.205, 0, knee);
    shoes.push(box(0.1, 0.07, 0.24, mShoe, 0, -0.432, 0.045, knee, { round: 0.03 }));
    legs.push({ hip, knee });
  }
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.1, 4, 12), mBot);
  pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.85); pelvis.position.y = HIP + 0.03; pelvis.castShadow = true; inner.add(pelvis);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.36, 6, 16), o.coat ? mSleeve : mTop);
  torso.scale.set(1.12, 1, 0.72); torso.position.y = HIP + 0.3; torso.castShadow = true; inner.add(torso);
  if (o.coat) {   // coat over a scrub top: show the scrub V at the neck
    const v = new THREE.Mesh(new THREE.CircleGeometry(0.07, 3), mTop); v.rotation.z = Math.PI; v.position.set(0, HIP + 0.55, 0.112); inner.add(v);
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.22, o.coatLen || 0.42, 24, 1, true), mm(o.coat, { side: THREE.DoubleSide }));
    sk.position.y = HIP - (o.coatLen || 0.42) / 2 + 0.07; sk.castShadow = true; inner.add(sk);
  }
  cyl(0.045, 0.05, 0.1, mSkin, 0, HIP + 0.66, 0, inner, 12);
  const headY = HIP + 0.79;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 20), mSkin);
  head.scale.set(0.92, 1.08, 1); head.position.y = headY; head.castShadow = true; inner.add(head);
  sphere(0.017, mSkin, 0, headY - 0.012, 0.1, inner, { seg: 10, seg2: 8 });
  for (const s of [-1, 1]) { sphere(0.011, M.black, 0.036 * s, headY + 0.012, 0.087, inner, { seg: 10, seg2: 8, cast: false }); box(0.034, 0.007, 0.01, mm(o.hair ?? o.cap ?? 0x2a2523), 0.037 * s, headY + 0.04, 0.089, inner, { cast: false }); }
  for (const s of [-1, 1]) sphere(0.022, mSkin, 0.097 * s, headY - 0.005, -0.005, inner, { seg: 10, seg2: 8 });
  if (o.scarf) {
    const m = mm(o.scarf, { side: THREE.DoubleSide });
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.122, 28, 18, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.8), m);
    sc.scale.set(0.95, 1.1, 1.05); sc.position.set(0, headY + 0.005, -0.006); sc.castShadow = true; inner.add(sc);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.15, 24, 1, true), m);
    drape.position.y = HIP + 0.62; inner.add(drape);
  } else if (o.cap != null) {
    const cp = new THREE.Mesh(new THREE.SphereGeometry(0.113, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), mm(o.cap));
    cp.scale.set(0.95, 1.1, 1.04); cp.position.set(0, headY + 0.008, -0.004); inner.add(cp);
  } else if (o.hair != null) {
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.111, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), mm(o.hair));
    hr.scale.set(0.95, 1.1, 1.04); hr.position.set(0, headY + 0.012, -0.014); inner.add(hr);
    if (o.bun) sphere(0.05, mm(o.hair), 0, headY + 0.03, -0.12, inner, { seg: 12, seg2: 10 });
  }
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.205 * s, HIP + 0.5, 0); inner.add(sh);
    capsule(0.048, 0.27, mSleeve, 0, -0.135, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    capsule(0.042, 0.23, o.shortSleeve ? mSkin : mSleeve, 0, -0.12, 0, el);
    const hand = sphere(0.046, mSkin, 0, -0.27, 0.005, el, { seg: 12, seg2: 10 }); hand.scale.set(0.8, 1.15, 0.55);
    sh.rotation.z = 0.06 * s;
    arms.push({ sh, el, s });
  }
  if (o.steth) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 8, 32, Math.PI * 1.15), mm(0x2a2a2b));
    t.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 1.07); t.position.set(0, HIP + 0.58, 0.02); inner.add(t);
    cyl(0.022, 0.022, 0.012, M.metal, 0.06, HIP + 0.38, 0.115, inner, 12).rotation.x = Math.PI / 2;
  }
  if (o.badge) box(0.05, 0.07, 0.008, M.top, -0.09, HIP + 0.42, 0.112, inner, { cast: false });
  const el = document.createElement('div'); el.className = 'bubble hidden';
  const bubble = new CSS2DObject(el); bubble.position.set(0, 2.02, 0); g.add(bubble);
  return { g, inner, legs, arms, shoes, bubble, bubbleEl: el, bubbleUntil: 0, node: null, tween: null, pose: 'stand', recline: 0, hidden: false, phase: rnd() * 6, yaw: 0, name: o.name };
}
const people = {
  nurse1: person({ name: 'Triage nurse', top: C.lake, skin: SKIN[1], cap: 0x2E6A80, shortSleeve: true, badge: true }),
  nurse2: person({ name: 'Ward nurse', top: C.lake, skin: SKIN[2], hair: 0x2B1E16, bun: true, shortSleeve: true, badge: true }),
  doctor: person({ name: 'ER doctor', top: 0x9DB4BC, bottom: C.raku, coat: 0xF4F1EB, coatLen: 0.5, skin: SKIN[3], hair: 0x1C1917, steth: true, badge: true }),
  anaes: person({ name: 'Anaesthetist', top: C.dove, skin: SKIN[6], cap: 0x6C6770, shortSleeve: true, badge: true })
};
const PATIENT_LOOK = {
  er: { name: 'Patient', top: C.ochre, bottom: 0x3B4650, skin: SKIN[0], hair: 0x1D1A18 },
  checkup: { name: 'Patient', top: 0x6F6874, bottom: 0x5E5862, coat: 0x6F6874, coatLen: 0.8, skin: SKIN[4], scarf: 0x4E4C4D },
  healthy: { name: 'Patient', top: 0xC9B79C, bottom: 0x46566A, skin: SKIN[2], hair: 0x3A2A1F, bun: true },
  try: { name: 'Patient', top: 0x9DB6BE, skin: SKIN[5], hair: 0x2A2522 }
};
const patients = {};
for (const [k, look] of Object.entries(PATIENT_LOOK)) { patients[k] = person(look); patients[k].g.visible = false; }
people.patient = patients.er;
// two other patients already in beds 1 and 3
const bystanders = [person({ top: 0x9DB6BE, skin: SKIN[6], hair: 0x9a9590 }), person({ top: 0x9DB6BE, skin: SKIN[3], hair: 0x231d1a })];
// the Badri patch: disposable microneedle patch with a reusable Bluetooth reader on top
const patch = new THREE.Group();
box(0.012, 0.085, 0.07, M.sheet, 0, 0, 0, patch, { round: 0.004, cast: false });
const reader = cyl(0.028, 0.028, 0.016, M.rail, -0.01, 0, 0, patch, 24, { cast: false }); reader.rotation.z = Math.PI / 2;
const patchLed = sphere(0.0075, new THREE.MeshBasicMaterial({ color: 0x8FD3E3, toneMapped: false }), -0.019, 0.012, 0, patch, { seg: 8, seg2: 6, cast: false });
patch.position.set(-0.052, -0.11, 0.0); patch.visible = false;
function attachPatch(P) {
  if (P.av) { placePatchOnAvatar(P); return; }
  P.arms[0].sh.add(patch); patch.position.set(-0.052, -0.11, 0); patch.quaternion.identity(); patch.scale.setScalar(1);
}
attachPatch(people.patient);
let patchPulse = 0;

/* ---------- places and walking ---------- */
const V = (x, z) => new THREE.Vector3(x, 0, z);
const N = {
  entrance: { p: V(-15.5, 0.15), door: V(-11.8, 0.15) },
  exit: { p: V(-15.5, 0.15), door: V(-11.8, 0.15) },
  triageChair: { p: V(-8.5, -4.05), door: V(-8.5, 0.15) },
  triageNurse: { p: V(-8.5, -5.95), door: V(-8.5, 0.15), via: [V(-9.2, -2.0), V(-10.1, -3.4), V(-10.1, -5.95)] },
  clinicChair: { p: V(-8.5, 4.35), door: V(-8.5, 0.15) },
  doctorHome: { p: V(-8.5, 6.4), door: V(-8.5, 0.15), via: [V(-9.2, 2.3), V(-10.1, 3.6), V(-10.1, 6.4)] },
  doctorStation: { p: V(3.15, 4.02), door: V(5.2, 0.15), via: [V(5.2, 1.4), V(5.2, 4.02)] },
  station: { p: V(1.35, 4.02), door: V(5.2, 0.15), via: [V(5.2, 1.4), V(5.2, 4.02)] },
  bed: { p: V(2.0, -4.6), door: V(2.0, 0.15), via: [V(2.0, -2.0)] },
  bedNurse: { p: V(1.2, -6.45), door: V(2.0, 0.15), via: [V(2.0, -2.0), V(1.05, -5.0)] },
  bedDoctor: { p: V(2.84, -6.45), door: V(2.0, 0.15), via: [V(2.0, -2.0), V(2.95, -5.0)] },
  bedAnaes: { p: V(1.24, -7.38), door: V(2.0, 0.15), via: [V(2.0, -2.0), V(0.95, -5.0), V(0.92, -7.0)] },
  otherBed: { p: V(4.72, -6.45), door: V(2.0, 0.15), via: [V(2.0, -2.0), V(4.62, -4.6)] },
  icuDoor: { p: V(12.3, 4.5), door: V(11.4, 0.15), via: [V(11.4, 4.5)] }
};
const FACE = { triageNurse: 0, triageChair: Math.PI, clinicChair: 0, doctorHome: Math.PI, station: Math.PI, doctorStation: Math.PI, bedNurse: Math.PI / 2, bedDoctor: -Math.PI / 2, otherBed: Math.PI / 2, bedAnaes: Math.PI / 2, icuDoor: -Math.PI / 2, bed: Math.PI, entrance: Math.PI / 2 };
const SIT = new Set(['triageChair', 'triageNurse', 'clinicChair', 'doctorHome', 'station', 'doctorStation']);
const faceFor = (n) => FACE[n] ?? 0;
function route(fromNode, fromPos, toName) {
  const a = fromNode ? N[fromNode] : null, b = N[toName];
  const pts = [fromPos.clone()];
  const sameDoor = a && a.door.distanceTo(b.door) < 0.01;
  if (a && fromNode !== toName) { if (a.via) for (const p of [...a.via].reverse()) pts.push(p.clone()); if (!sameDoor) pts.push(a.door.clone()); }
  if (!sameDoor) pts.push(b.door.clone());
  if (b.via) for (const p of b.via) pts.push(p.clone());
  pts.push(b.p.clone());
  const out = [pts[0]];
  for (const p of pts.slice(1)) if (p.distanceTo(out[out.length - 1]) > 0.05) out.push(p);
  return out;
}
function reclineAt(P, x, a) {
  P.pose = 'recline'; P.recline = a; P.tween = null;
  P.g.visible = true; P.hidden = false;
  P.g.position.set(x, 0.73, -7.0); P.g.rotation.y = 0; P.yaw = 0;
  applyPose(P, 0);
}
function lieInBed(P) { reclineAt(P, 2.0, 0.6); P.node = 'bed'; bedOccupied(true); }
function bedOccupied(on) { bed2.blanket.visible = on; bed2.folded.visible = !on; }
function place(who, node) {
  const P = people[who];
  P.tween = null; P.node = node; P.hidden = false; P.g.visible = true;
  P.g.position.copy(N[node].p); P.g.rotation.y = P.yaw = faceFor(node);
  P.pose = SIT.has(node) ? 'sit' : 'stand';
  applyPose(P, 0);
}
function finishTween(P) {
  const tw = P.tween; if (!tw) return;
  P.tween = null; P.node = tw.to;
  P.g.position.copy(tw.pts[tw.pts.length - 1]);
  if (tw.then === 'lie') lieInBed(P);
  else if (tw.then === 'hide') { P.hidden = true; P.g.visible = false; }
  else { P.g.rotation.y = P.yaw = faceFor(tw.to); P.pose = SIT.has(tw.to) ? 'sit' : 'stand'; }
  applyPose(P, 0);
}
function walk(who, to, then, delay = 0) {
  const P = people[who];
  finishTween(P);
  if (P.pose === 'recline') { P.g.position.copy(N.bed.p); P.node = 'bed'; if (who === 'patient') bedOccupied(false); }
  if (!delay) P.pose = 'stand';
  const pts = route(P.node, P.g.position.clone().setY(0), to);
  const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  P.tween = { pts, lens, total: Math.max(0.01, lens[lens.length - 1]), d: 0, then, to, delay };
  P.g.visible = true; P.hidden = false; P.g.position.y = 0;
}
function stepWalker(P, dt, speed) {
  const tw = P.tween; if (!tw) return;
  if (tw.delay > 0) { tw.delay -= dt; return; }
  P.pose = 'stand';
  P.walkSpeed = speed;
  tw.d = Math.min(tw.total, tw.d + dt * speed);
  let i = 1; while (i < tw.lens.length - 1 && tw.lens[i] < tw.d) i++;
  const a = tw.pts[i - 1], b = tw.pts[i];
  const k = Math.min(1, Math.max(0, (tw.d - tw.lens[i - 1]) / Math.max(1e-6, tw.lens[i] - tw.lens[i - 1])));
  P.g.position.lerpVectors(a, b, k);
  if (b.distanceTo(a) > 0.01) P.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  let dy = P.yaw - P.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  P.g.rotation.y += dy * Math.min(1, dt * 10);
  if (tw.d >= tw.total) finishTween(P);
}
const tmpV = new THREE.Vector3(), tmpE = new THREE.Euler();
function applyPose(P, dt) {
  if (P.av) {
    if (!P.g.visible && dt) return;
    avatarPose(P, dt);
    if (P.pose === 'recline') P.bubble.position.set(0, 1.0, -0.55); else P.bubble.position.set(0, P.pose === 'sit' ? 1.55 : 2.02, 0);
    return;
  }
  const L = P.legs, A = P.arms;
  let hip = [0, 0], knee = [0, 0], sh = [0, 0], el = [-0.12, -0.12], y = 0, rx = 0;
  if (P.pose === 'sit') { hip = [-1.52, -1.52]; knee = [1.48, 1.48]; sh = [-0.3, -0.3]; el = [-1.0, -1.0]; y = SIT_Y; }
  else if (P.pose === 'recline') { const a = P.recline; rx = -(Math.PI / 2 - a); hip = [-a, -a]; knee = [0.04, 0.04]; sh = [0.1, 0.1]; el = [-0.3, -0.3]; }
  else if (P.tween) {
    P.phase += dt * 8.5;
    const s = Math.sin(P.phase), c = Math.cos(P.phase);
    hip = [0.42 * s, -0.42 * s]; knee = [0.8 * Math.max(0, -c), 0.8 * Math.max(0, c)];
    sh = [-0.32 * s, 0.32 * s]; el = [-0.28, -0.28]; y = 0.022 * Math.abs(c);
  }
  for (let i = 0; i < 2; i++) { L[i].hip.rotation.x = hip[i]; L[i].knee.rotation.x = knee[i]; A[i].sh.rotation.x = sh[i]; A[i].el.rotation.x = el[i]; }
  for (const s of P.shoes) s.visible = P.pose !== 'recline';
  P.inner.rotation.x = rx;
  if (P.pose === 'recline') {
    tmpV.set(0, HIP, 0).applyEuler(tmpE.set(rx, 0, 0));
    P.inner.position.set(0, -tmpV.y, -tmpV.z);
    P.bubble.position.set(0, 1.0, -0.55);
  } else {
    P.inner.position.set(0, y, 0);
    P.bubble.position.set(0, P.pose === 'sit' ? 1.62 : 2.02, 0);
  }
}
bystanders.forEach((P, i) => reclineAt(P, [-1.5, 5.5][i], [0.35, 0.4][i]));
function bubble(who, text, badri) {
  const P = people[who]; if (!P) return;
  P.bubbleEl.innerHTML = '';
  const b = document.createElement('b'); b.textContent = badri ? 'Badri' : P.name;
  P.bubbleEl.append(b, document.createTextNode(text));
  P.bubbleEl.classList.toggle('badri', !!badri);
  P.bubbleEl.classList.remove('hidden');
  P.bubbleUntil = performance.now() + 4200;
}

/* ---------- screens: bedside monitors, triage vitals, ward board ---------- */
const LEVEL_HEX = { arriving: '#1C5469', routine: '#1C5469', watch: '#BF8945', alert: '#A8432F', respond: '#1C5469', confirmed: '#A8432F' };
function ecg(x, beat) { const p = ((x / beat) % 1 + 1) % 1; if (p < 0.08) return Math.sin(p / 0.08 * Math.PI) * 0.12; if (p < 0.12) return 0; if (p < 0.135) return -0.18; if (p < 0.16) return 1; if (p < 0.185) return -0.3; if (p < 0.3) return 0; if (p < 0.42) return Math.sin((p - 0.3) / 0.12 * Math.PI) * 0.25; return 0; }
function drawMonitor(cv, v, o) {
  const g = cv.g, w = cv.c.width, h = cv.c.height;
  g.fillStyle = '#0A1215'; g.fillRect(0, 0, w, h);
  const alarm = o.alarm && Math.floor(performance.now() / 450) % 2 === 0;
  g.fillStyle = alarm ? '#A8432F' : '#13252B'; g.fillRect(0, 0, w, 34);
  g.fillStyle = '#EDE6DB'; g.font = '600 18px Inter, sans-serif'; g.textBaseline = 'middle';
  g.fillText(o.title, 12, 18);
  g.textAlign = 'right'; g.fillText(o.right || '', w - 12, 18); g.textAlign = 'left';
  const t = performance.now() / 1000, hr = v.hr || 75, wW = w * 0.6;
  const traces = [['#7BD389', 62, (x) => ecg(x / 90 + t * hr / 60, 1)], ['#62C3DA', 140, (x) => Math.max(0, Math.sin(((x / 90 + t * hr / 60) % 1) * Math.PI)) ** 1.6], ['#E3C46A', 214, (x) => Math.sin((x / 160 + t * (v.rr || 16) / 60) * Math.PI * 2) * 0.5 + 0.5]];
  for (const [col, y0, f] of traces) {
    g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath();
    for (let x = 8; x < wW; x += 2) { const yy = y0 + 22 - f(x) * 40; x === 8 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
    g.stroke();
  }
  const num = (label, val, col, x, y, size = 46, unit = '') => {
    g.fillStyle = col; g.font = '600 13px Inter, sans-serif'; g.fillText(label, x, y);
    g.font = `600 ${size}px "Inter Tight", Inter, sans-serif`; g.fillText(val, x, y + size * 0.62 + 8);
    if (unit) { g.font = '500 12px Inter, sans-serif'; g.fillText(unit, x + g.measureText(val).width * 0 + 2, y + size + 16); }
  };
  const f0 = (x) => (x == null ? '--' : String(Math.round(x)));
  num('HR', f0(v.hr), '#7BD389', wW + 10, 50);
  num('SpO₂', f0(v.spo2), '#62C3DA', wW + 10, 122, 38);
  num('RR', f0(v.rr), '#E3C46A', wW + 100, 122, 38);
  g.fillStyle = '#EDE6DB'; g.font = '600 13px Inter, sans-serif'; g.fillText('NIBP', 10, 262);
  g.font = '600 30px "Inter Tight", Inter, sans-serif'; g.fillText(v.sbp != null ? `${Math.round(v.sbp)}/${Math.round(v.dbp)}` : '--/--', 10, 294);
  g.font = '600 13px Inter, sans-serif'; g.fillText('TEMP', 160, 262);
  g.font = '600 30px "Inter Tight", Inter, sans-serif'; g.fillText(v.temp != null ? v.temp.toFixed(1) : '--', 160, 294);
  if (o.lactate !== false) {
    g.fillStyle = '#D9A35F'; g.font = '600 13px Inter, sans-serif'; g.fillText('LACTATE · BADRI', wW + 10, 200);
    g.font = '600 40px "Inter Tight", Inter, sans-serif'; g.fillText(v.lac != null ? v.lac.toFixed(1) : '--', wW + 10, 240);
    g.font = '500 12px Inter, sans-serif'; g.fillText('mmol/L', wW + 10, 270);
  }
  cv.t.needsUpdate = true;
}
const NORMAL_A = { hr: 78, spo2: 97, rr: 15, sbp: 124, dbp: 76, temp: 36.8, lac: null };
const NORMAL_B = { hr: 86, spo2: 96, rr: 17, sbp: 131, dbp: 80, temp: 37.1, lac: null };
function drawBoard(level, sim) {
  const g = board.g, w = 1024, h = 576;
  const alarm = (level === 'alert') && Math.floor(performance.now() / 500) % 2 === 0;
  g.fillStyle = level === 'alert' ? (alarm ? '#A8432F' : '#7E3426') : '#1C5469'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(237,230,219,0.7)'; g.font = '600 26px Inter, sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText('BADRI  ·  WARD BOARD', 48, 64);
  g.textAlign = 'right'; g.fillText(sim ? sim.clock() : '', w - 48, 64); g.textAlign = 'left';
  const rows = [['Bed 1', 'No patch · routine', '#EDE6DB'], ['Bed 2', '', '#EDE6DB'], ['Bed 3', 'No patch · routine', '#EDE6DB']];
  const s2 = { arriving: 'Empty', routine: 'Empty', watch: 'Patch on · watching', alert: 'SEPSIS ALERT', respond: 'First hour running', confirmed: 'Sepsis · treated early' }[level] || '';
  rows[1][1] = s2; if (level === 'watch') rows[1][2] = '#E8B77A'; if (level === 'alert') rows[1][2] = '#FFFFFF';
  rows.forEach(([bedName, text, col], i) => {
    const y = 150 + i * 120;
    g.fillStyle = 'rgba(237,230,219,0.12)'; g.fillRect(48, y - 62, w - 96, 96);
    g.fillStyle = col; g.font = '600 44px "Inter Tight", Inter, sans-serif'; g.fillText(bedName, 76, y);
    g.font = i === 1 ? '600 44px "Inter Tight", Inter, sans-serif' : '500 34px Inter, sans-serif'; g.fillText(text, 290, y);
  });
  g.fillStyle = 'rgba(237,230,219,0.7)'; g.font = '500 24px Inter, sans-serif';
  g.fillText(sim && sim.patch ? `Patch reads and re-scores every ${sim.interval} min` : 'Triage scores every patient on arrival', 48, h - 40);
  board.t.needsUpdate = true;
}

/* ---------- labels (overview only) ---------- */
const zoneLabels = [];
function label(text, x, z) {
  const el = document.createElement('div'); el.className = 'zone'; el.textContent = text;
  const o = new CSS2DObject(el); o.position.set(x, 0.05, z); scene.add(o); zoneLabels.push(o); return o;
}
label('Entrance', -14.6, 1.5); label('Triage', -8.5, -1.0); label('Ward · beds 1–3', 2.0, -1.0); label('Lab', 11, -1.0);
label('Clinic', -8.5, 2.3); label('Waiting', -2.2, 2.3); label('Nurse station', 2.25, 1.95); const icuLabel = label('ICU', 11.6, 3.2);

/* ---------- scene reactions to the engine's animation commands ---------- */
let level = 'arriving', alarmOn = false, treated = false, patchJustOn = false;
function setLevel(l) {
  level = l;
  const col = new THREE.Color(LEVEL_HEX[l] || '#1C5469');
  patchLed.material.color.copy(l === 'alert' || l === 'confirmed' ? new THREE.Color('#E0745E') : new THREE.Color('#8FD3E3'));
  bed2.call.material.emissiveIntensity = 0;
}
function resetScene(opts, caseId) {
  for (const [k, P] of Object.entries(patients)) { P.g.visible = false; P.hidden = true; P.tween = null; }
  people.patient = patients[caseId] || patients.er;
  attachPatch(people.patient);
  place('patient', 'entrance');
  place('nurse1', 'triageNurse');
  place('nurse2', opts.nurseBusy ? 'otherBed' : 'station');
  place('doctor', caseId === 'healthy' ? 'doctorHome' : 'doctorStation');
  place('anaes', 'icuDoor'); people.anaes.g.visible = false; people.anaes.hidden = true;
  for (const P of Object.values(people)) { P.bubbleEl.classList.add('hidden'); P.bubbleUntil = 0; }
  patch.visible = false; treated = false; ivBag.visible = false; ivLine.visible = false;
  pumpScreen.material.emissive.setHex(0x000000);
  alarmOn = false; icuFlash = false; drawIcuSign(false); icuLabel.element.classList.remove('flash');
  bedOccupied(false);
  if (opts.inBed) lieInBed(people.patient);
  setLevel('arriving');
}
function applyAnim(a, caseId) {
  switch (a.cmd) {
    case 'reset': resetScene(a, caseId); break;
    case 'walk': walk(a.who, a.to, a.then, a.who === 'patient' && patchJustOn ? 3.2 : 0); break;
    case 'say': bubble(a.who, a.text); break;
    case 'patch': patch.visible = a.on; patchPulse = 1; patchJustOn = a.on; break;
    case 'status': setLevel(a.level); break;
    case 'alarm': alarmOn = a.on; if (a.on) bubble('patient', 'Alert sent to the ward nurse', true); break;
    case 'page':
      if (a.role === 'doctor') bubble('doctor', 'Paged by Badri: bed 2, sepsis alert');
      else { icuFlash = true; icuLabel.element.classList.add('flash'); }
      break;
    case 'appear': { place(a.who, a.at); break; }
    case 'sample': patchPulse = 1; break;
    case 'treat': treated = true; ivBag.visible = true; ivLine.visible = true; pumpScreen.material.emissive.setHex(0x3f9a5a); break;
  }
}

/* ---------- camera shots ---------- */
const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOTS = {
  overview: { pos: P3(0, 21, 16.5), tgt: P3(0, 0, -0.3), wide: true },
  arrive: { pos: P3(-5.6, 1.7, 1.25), tgt: P3(-12.2, 1.05, -0.4) },
  triage: { pos: P3(-8.12, 1.5, -6.95), tgt: P3(-8.55, 1.2, -4.05), zoom: 1.35 },
  patch: { pos: P3(-6.8, 1.32, -4.8), tgt: P3(-8.36, 1.02, -4.0), zoom: 1.2 },
  bay: { pos: P3(1.05, 1.55, -5.15), tgt: P3(2.0, 1.02, -7.55), zoom: 1.1 },
  bayWide: { pos: P3(0.6, 1.72, -3.7), tgt: P3(2.9, 1.0, -6.9) },
  station: { pos: P3(2.25, 1.82, 0.55), tgt: P3(2.25, 1.2, 4.2) },
  bundle: { pos: P3(3.55, 1.62, -4.85), tgt: P3(1.85, 1.05, -7.2) },
  treated: { pos: P3(0.95, 1.5, -5.55), tgt: P3(2.35, 1.15, -7.55) },
  confirmed: { pos: P3(0.45, 1.85, -4.3), tgt: P3(2.2, 1.0, -7.1) },
  clinic: { pos: P3(-7.45, 1.45, 6.15), tgt: P3(-8.5, 1.15, 4.35), zoom: 1.25 }
};
let camAnim = null, currentShot = null, userCam = false;
controls.addEventListener('start', () => { userCam = true; camAnim = null; });
function shotPose(name) {
  const S = SHOTS[name] || SHOTS.overview;
  const pos = S.pos.clone(), tgt = S.tgt.clone();
  if (S.wide) { const k = Math.max(1, 1.55 / camera.aspect); pos.sub(tgt).multiplyScalar(k).add(tgt); }
  return { pos, tgt, zoom: S.zoom || 1 };
}
function flyTo(name, instant) {
  currentShot = name;
  const to = shotPose(name);
  if (instant || reduceMotion) { camera.position.copy(to.pos); controls.target.copy(to.tgt); camera.zoom = to.zoom; camera.updateProjectionMatrix(); camAnim = null; return; }
  const from = { pos: camera.position.clone(), tgt: controls.target.clone(), zoom: camera.zoom };
  const dist = from.pos.distanceTo(to.pos);
  const interiorHop = Math.min(from.pos.y, to.pos.y) < 3 && dist > 2.5;
  camAnim = { t0: performance.now(), dur: Math.min(2600, 1200 + dist * 55), from, to, lift: interiorHop ? Math.max(3.2, dist * 0.32) : 0 };
}
function stepCamera(now) {
  if (!camAnim) return;
  const k = Math.min(1, (now - camAnim.t0) / camAnim.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(camAnim.from.pos, camAnim.to.pos, e);
  camera.position.y += camAnim.lift * Math.sin(Math.PI * e);
  controls.target.lerpVectors(camAnim.from.tgt, camAnim.to.tgt, e);
  camera.zoom = camAnim.from.zoom + (camAnim.to.zoom - camAnim.from.zoom) * e; camera.updateProjectionMatrix();
  if (k >= 1) camAnim = null;
}
function resize() {
  const r = host.getBoundingClientRect();
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 64 : camera.aspect < 1.3 ? 52 : 42;
  if (w > 900) camera.setViewOffset(w, h, -w * 0.07, h * 0.03, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if (currentShot && !userCam) flyTo(currentShot, true);
}
new ResizeObserver(resize).observe(host);
resize();
flyTo('overview', true);

/* ---------- theme ---------- */
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true; if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme() { scene.background = new THREE.Color(isDark() ? 0x1D1C1D : C.stowe); M.ground.color.setHex(isDark() ? 0x3A3838 : 0xD3CABC); }
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- per-frame world update ---------- */
let lastScreen = 0;
function updateWorld(now, dt, sim, walkSpeed) {
  for (const P of Object.values(people)) { if (P.tween) stepWalker(P, dt, walkSpeed); applyPose(P, dt); }
  for (const P of bystanders) applyPose(P, dt);
  // entrance and ICU doors
  const near = (x, z, r) => Object.values(people).some(P => P.g.visible && Math.hypot(P.g.position.x - x, P.g.position.z - z) < r);
  const open = near(-13, 0.15, 2.4) ? 1 : 0;
  doorL.position.z += ((-0.66 - 1.3 * open) - doorL.position.z) * Math.min(1, dt * 5);
  doorR.position.z += ((0.96 + 1.3 * open) - doorR.position.z) * Math.min(1, dt * 5);
  const icuOpen = near(12.6, 4.5, 1.6) ? 1 : 0;
  for (const d of icuDoors) { d.open += (icuOpen - d.open) * Math.min(1, dt * 4); d.hinge.rotation.y = d.s * -1.3 * d.open; }
  // patch pulse, alarm, ICU sign
  patchPulse = Math.max(0, patchPulse - dt * 1.4);
  patchLed.scale.setScalar(1 + patchPulse * 0.7);
  const blink = alarmOn ? (reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(now / 160)) : 0;
  alarmLight.intensity = alarmOn ? 0.25 + 0.6 * blink : 0;
  bed2.call.material.emissiveIntensity = alarmOn ? 2.5 * blink : 0;
  if (icuFlash) drawIcuSign(Math.floor(now / 400) % 2 === 0);
  // screens about 8 times a second
  if (now - lastScreen > 120) {
    lastScreen = now;
    const v = sim ? sim.values() : {};
    const onBed = sim && sim.location === 'ward';
    drawMonitor(monCanvas[1], onBed ? v : {}, { title: 'BED 2', right: sim ? sim.clock() : '', alarm: alarmOn });
    drawMonitor(monCanvas[0], NORMAL_A, { title: 'BED 1', right: sim ? sim.clock() : '', lactate: false });
    drawMonitor(monCanvas[2], NORMAL_B, { title: 'BED 3', right: sim ? sim.clock() : '', lactate: false });
    const tv = sim && sim.triage ? v : {};
    drawMonitor(triageScreen, { hr: tv.hr, spo2: tv.spo2, rr: tv.rr, sbp: tv.sbp, dbp: tv.dbp, temp: tv.temp }, { title: 'TRIAGE', right: sim && sim.triage ? `qSOFA ${sim.triage.q.score}/3` : '', lactate: false });
    drawBoard(level, sim);
    if (sim) { const m = Math.round(sim.def.startClock + sim.t); drawClock(m % (24 * 60)); }
  }
  for (const P of [...Object.values(people), ...bystanders]) if (P.bubbleUntil && now > P.bubbleUntil) { P.bubbleEl.classList.add('hidden'); P.bubbleUntil = 0; }
}
function cameraDependent() {   // what is drawn depends on where the camera is
  const inside = camera.position.y < 2.62;
  ceiling.visible = inside;
  for (const l of zoneLabels) l.visible = !inside;
  const focus = controls.target;
  for (const P of [...Object.values(people), ...bystanders]) P.bubble.visible = P.g.visible && (!inside || P.g.position.distanceTo(focus) < 6.5);
}
function finishAllWalks() { for (const P of Object.values(people)) finishTween(P); }
function anyWalking(names) { return names.some(n => people[n].tween); }
function longWalk(names) { return names.some(n => people[n].tween && !(people[n].tween.delay > 0) && people[n].tween.total - people[n].tween.d > 5); }
function render() { stepCamera(performance.now()); controls.update(); cameraDependent(); renderer.render(scene, camera); labelRenderer.render(scene, camera); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastClockMin = -1; drawIcuSign(false); });
