import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Lightweight parked-car models generated in code (no extra files to download). Each vehicle is ONE merged mesh
   (vertex colours, one shared material) of roughly 1000 triangles, so a parked car costs a single draw call.
   Local axes: x = width, y = up, z = forward (front of the car is +z). */

const C = { glass: '#1c2a38', trim: '#15191e', chrome: '#b9c2cc', lampF: '#fff4c8', lampR: '#d92b2b', plate: '#f3f3ef', tire: '#101215', hub: '#aeb6bf', amber: '#ffae2a' };
export const VEHICLE_SIZE = {
  sedan: { L: 4.5, W: 1.8 }, taxi: { L: 4.5, W: 1.8 }, hatch: { L: 3.8, W: 1.7 }, suv: { L: 4.4, W: 1.95 }, pickup: { L: 5.0, W: 1.95 }, van: { L: 4.6, W: 1.9 },
};
export const VEHICLE_TYPES = Object.keys(VEHICLE_SIZE);

/** @param {THREE.BufferGeometry} geo @param {string} hex */
function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/** @param {THREE.BufferGeometry[]} p */
const box = (p, hex, w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); p.push(tint(g, hex)); };
/** Side profile [z,y] points (front is +z) extruded across the car's width, with a small bevel so edges catch the light. */
const prism = (/** @type {THREE.BufferGeometry[]} */ p, /** @type {string} */ hex, /** @type {number[][]} */ pts, /** @type {number} */ width, bevel = 0.04) => {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y))); s.closePath();
  const depth = width - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); p.push(tint(g, hex));
};
const wheel = (/** @type {THREE.BufferGeometry[]} */ p, x, z, r, w) => {
  const t = new THREE.CylinderGeometry(r, r, w, 12); t.rotateZ(Math.PI / 2); t.translate(x, r, z); p.push(tint(t, C.tire));
  const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.03, 10); h.rotateZ(Math.PI / 2); h.translate(x, r, z); p.push(tint(h, C.hub));
};
const wheels = (/** @type {THREE.BufferGeometry[]} */ p, track, base, r, w) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, sx * track / 2, sz * base / 2, r, w); };
/** headlights, tail lights, grille, bumpers, plates */
function details(/** @type {THREE.BufferGeometry[]} */ p, W, zF, zR, yL, lampW = 0.3) {
  for (const sx of [-1, 1]) { box(p, C.lampF, lampW, 0.13, 0.06, sx * (W / 2 - 0.3), yL, zF); box(p, C.lampR, lampW, 0.12, 0.06, sx * (W / 2 - 0.27), yL + 0.02, zR); }
  box(p, C.trim, W * 0.34, 0.15, 0.06, 0, yL - 0.06, zF + 0.01); box(p, C.trim, W * 0.96, 0.14, 0.14, 0, 0.34, zF - 0.02); box(p, C.trim, W * 0.96, 0.14, 0.14, 0, 0.34, zR + 0.02);
  box(p, C.plate, 0.5, 0.12, 0.03, 0, 0.42, zF + 0.04); box(p, C.plate, 0.5, 0.12, 0.03, 0, 0.46, zR - 0.04);
}
const mirrors = (/** @type {THREE.BufferGeometry[]} */ p, /** @type {string} */ body, W, y, z) => { for (const sx of [-1, 1]) box(p, body, 0.1, 0.12, 0.16, sx * (W / 2 + 0.06), y, z); };
/** greenhouse (glass) + roof plate + pillars */
function cabin(/** @type {THREE.BufferGeometry[]} */ p, /** @type {string} */ body, /** @type {number[][]} */ pts, W, yTop, roofZ0, roofZ1) {
  prism(p, C.glass, pts, W * 0.9, 0.025);
  box(p, body, W * 0.88, 0.07, roofZ1 - roofZ0, 0, yTop + 0.02, (roofZ0 + roofZ1) / 2);
  for (const sx of [-1, 1]) for (const z of [pts[1][0] + 0.02, (pts[1][0] + pts[2][0]) / 2, pts[2][0] - 0.02]) box(p, body, 0.06, (yTop - pts[0][1]) * 0.98, 0.09, sx * W * 0.46, (yTop + pts[0][1]) / 2, z);
}

/** @param {string} type @param {string} body paint colour @return {THREE.BufferGeometry} */
function build(type, body) {
  /** @type {THREE.BufferGeometry[]} */ const p = [];
  const { L, W } = VEHICLE_SIZE[/** @type {keyof typeof VEHICLE_SIZE} */ (type)], h = L / 2;
  box(p, C.trim, W * 0.9, 0.12, L * 0.9, 0, 0.22, 0); // underbody
  if (type === 'sedan' || type === 'taxi') {
    prism(p, body, [[-h, 0.3], [h, 0.3], [h + 0.03, 0.62], [h - 0.15, 0.8], [0.95, 0.88], [-1.7, 0.88], [-h + 0.05, 0.82], [-h - 0.03, 0.62]], W);
    cabin(p, body, [[-1.3, 0.88], [-0.85, 1.4], [0.5, 1.4], [1.15, 0.88]], W, 1.4, -0.95, 0.55);
    wheels(p, W - 0.2, 2.7, 0.34, 0.24); details(p, W, h + 0.03, -h - 0.03, 0.64); mirrors(p, body, W, 1.0, 0.95);
    if (type === 'taxi') { box(p, '#f4f4f0', 0.5, 0.16, 0.22, 0, 1.54, -0.2); box(p, C.trim, 0.5, 0.05, 0.23, 0, 1.54, -0.2); box(p, C.trim, W * 0.9, 0.06, 0.4, 0, 0.62, 0.0); }
  } else if (type === 'hatch') {
    prism(p, body, [[-h, 0.3], [h, 0.3], [h + 0.03, 0.6], [h - 0.12, 0.78], [0.95, 0.86], [-1.7, 0.86], [-h + 0.02, 0.8], [-h - 0.03, 0.6]], W);
    cabin(p, body, [[-1.75, 0.86], [-1.6, 1.46], [0.4, 1.46], [1.05, 0.86]], W, 1.46, -1.65, 0.45);
    wheels(p, W - 0.2, 2.3, 0.31, 0.22); details(p, W, h + 0.03, -h - 0.03, 0.62, 0.26); mirrors(p, body, W, 1.0, 0.9);
  } else if (type === 'suv') {
    prism(p, body, [[-h, 0.36], [h, 0.36], [h + 0.03, 0.85], [h - 0.15, 1.02], [1.05, 1.1], [-2.0, 1.1], [-h + 0.02, 1.0], [-h - 0.03, 0.85]], W);
    cabin(p, body, [[-2.1, 1.1], [-1.95, 1.72], [0.6, 1.72], [1.3, 1.1]], W, 1.72, -2.0, 0.7);
    for (const sx of [-1, 1]) box(p, C.trim, 0.06, 0.06, 2.4, sx * (W * 0.4), 1.82, -0.65); // roof rails
    wheels(p, W - 0.15, 2.7, 0.4, 0.28); details(p, W, h + 0.03, -h - 0.03, 0.82, 0.32); mirrors(p, body, W, 1.15, 1.05);
    box(p, C.trim, W * 0.96, 0.2, 0.05, 0, 0.55, h + 0.02);
  } else if (type === 'pickup') {
    prism(p, body, [[-0.4, 0.4], [h, 0.4], [h + 0.03, 0.9], [h - 0.15, 1.04], [1.3, 1.12], [-0.4, 1.12]], W); // hood + cab base
    prism(p, body, [[-h, 0.4], [-0.4, 0.4], [-0.4, 0.84], [-h, 0.84]], W); // bed base
    cabin(p, body, [[-0.35, 1.12], [0.05, 1.7], [0.95, 1.7], [1.5, 1.12]], W, 1.7, -0.1, 1.0);
    box(p, C.trim, W * 0.82, 0.04, 2.0, 0, 0.88, -1.45); // bed floor
    for (const sx of [-1, 1]) box(p, body, 0.08, 0.36, 2.1, sx * (W / 2 - 0.05), 1.04, -1.45);
    box(p, body, W * 0.96, 0.36, 0.08, 0, 1.04, -h + 0.04); box(p, body, W * 0.96, 0.4, 0.08, 0, 1.06, -0.42);
    wheels(p, W - 0.15, 3.0, 0.4, 0.28); details(p, W, h + 0.03, -h - 0.03, 0.84, 0.3); mirrors(p, body, W, 1.15, 0.9);
  } else { // van
    prism(p, body, [[-h, 0.32], [h, 0.32], [h + 0.03, 0.78], [h - 0.2, 1.0], [1.5, 1.62], [1.38, 2.05], [-h + 0.05, 2.1], [-h - 0.03, 0.8]], W);
    box(p, C.glass, W * 0.92, 0.55, 0.05, 0, 1.52, 1.66, -0.62); // windshield
    for (const sx of [-1, 1]) { box(p, C.glass, 0.04, 0.5, 1.0, sx * (W / 2 + 0.01), 1.45, 0.85); box(p, '#2a5db8', 0.04, 0.18, 3.4, sx * (W / 2 + 0.015), 0.95, -0.4); }
    wheels(p, W - 0.15, 2.9, 0.37, 0.26); details(p, W, h + 0.03, -h - 0.03, 0.7, 0.3); mirrors(p, body, W, 1.35, 1.5);
  }
  const g = mergeGeometries(p, false); p.forEach(x => x.dispose()); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}

const cache = new Map(); /** @type {THREE.MeshStandardMaterial|null} */ let material = null;
/** @param {string} type one of VEHICLE_TYPES @param {string} color paint colour @return {THREE.Mesh} */
export function makeVehicle(type, color) {
  const t = type in VEHICLE_SIZE ? type : 'sedan', key = t + color; let g = cache.get(key);
  if (!g) { g = build(t, t === 'taxi' ? '#f4c20d' : color); cache.set(key, g); }
  if (!material) material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12 });
  const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = false; m.name = 'vehicle-' + t; return m;
}
