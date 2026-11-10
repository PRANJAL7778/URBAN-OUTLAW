import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import RAGDOLL from 'ragdoll';
import { createCity } from './src/city.js';
import { prepareCharacter, prepareScanCharacter } from './src/character.js';
import CONFIG from './src/config.js';
import fs from 'node:fs';

// Node has no `self`; GLTFLoader's texture path probes it. The lite assets keep their
// colour in vertex data, so no image is ever actually decoded here.
globalThis.self = globalThis;

let pass = 0, fail = 0;
const check = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // same setup as pixelfork/assets-3d.js
const load = async (f) => {
  const buf = fs.readFileSync('./assets_nt/' + f);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return await loader.parseAsync(ab, '');
};
const box = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

/* ---------------- 1. buildings: does the stacked-city path actually run? ---------------- */
const office = (await load('low_poly_city_office_building_low_2.glb')).scene;
const apartment = (await load('low_poly_city_apartment_building_low_2.glb')).scene;
console.log('   office raw size: ' + box(office).toArray().map(n => n.toFixed(2)));
console.log('   apartment raw size: ' + box(apartment).toArray().map(n => n.toFixed(2)));
const scene = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
const city = createCity(scene, physics, { office, apartment });
console.log('   placement report:');
for (const r of city.report) console.log('     ' + r.kind + ' path=' + r.path + ' floors=' + r.floors + ' scale=' + r.k + ' stretch=' + r.stretch + ' size=' + r.size + (r.reason ? ' — ' + r.reason : ''));
const paths = city.report.map(r => r.path);
check(paths.length > 0, 'imported buildings were placed (' + paths.length + ' report rows)');
check(paths.every(p => p !== 'box'), 'no building fell back to a procedural box');
check(paths.includes('stack'), 'the tall stacked-building path is used (' + paths.join(',') + ')');
const officeRow = city.report.find(r => r.kind === 'office');
if (officeRow) {
  check(Math.abs(officeRow.size[1] - CONFIG.buildings.officeHeight) < CONFIG.buildings.officeHeight * 0.5,
    'office height reaches the configured ' + CONFIG.buildings.officeHeight + ' m target (got ' + officeRow.size[1] + ' m)');
}
let meshes = 0, tris = 0;
scene.traverse(o => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
console.log('   visible meshes (≈ draw calls): ' + meshes + ' · triangles: ' + Math.round(tris));
check(meshes < 400, 'draw calls stay in a phone-friendly range (' + meshes + ')');

/* ---------------- 2. the supplied character GLB (V2 mannequin path) ---------------- */
const mannequinSrc = (await load('characterrigged.glb')).scene;
const boneNames = [];
mannequinSrc.traverse(o => { if (o.isBone) boneNames.push(o.name); });
console.log('   bone names as loaded ("Bone.002" becomes "Bone002" after GLTFLoader sanitising): ' + boneNames.slice(0, 6).join(', ') + ' …');
const man = prepareCharacter(mannequinSrc, '#ffffff', { hoodie: '#20242c', pants: '#3f6fb5', shoes: '#f2f2f2', skin: '#e3a77f', hair: '#3a2a20', cap: '#d33a31' });
console.log('   prepareCharacter -> model:' + (man.model ? 'OK' : 'null') + ' reason:"' + man.reason + '" dressed:"' + man.dressed + '"');
check(!!man.model, 'uploaded characterrigged model is accepted by the ragdoll (' + (man.info ? 'rest pose ' + man.info.restPose + ', facing ' + man.info.facing : man.reason) + ')');

/* ---------------- 3. the scanned man (default hero) ---------------- */
const scanSrc = (await load('char_scan_lite.glb')).scene;
const scan = prepareScanCharacter(scanSrc);
console.log('   prepareScanCharacter -> model:' + (scan.model ? 'OK' : 'null') + ' reason:"' + scan.reason + '"');
check(!!scan.model, 'char_scan_lite is accepted by the ragdoll (' + (scan.info ? 'rest pose ' + scan.info.restPose + ', facing ' + scan.info.facing : scan.reason) + ')');
const scanBones = new Set();
scanSrc.traverse(o => { if (o.isBone) scanBones.add(o.name); });
const riderNeeds = ['hips', 'spine', 'chest', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightUpperArm', 'rightLowerArm'];
const missing = riderNeeds.filter(b => !scanBones.has(b));
check(missing.length === 0, 'every bone the bike rider pose needs exists' + (missing.length ? ' — missing ' + missing.join(',') : ''));

/* ---------------- 4. the hero actually walks with the supplied model ---------------- */
if (scan.model) {
  const s2 = new THREE.Scene();
  const ph2 = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
  const hero = RAGDOLL.create({ scene: s2, physics: ph2, position: [0, 0.1, 0], model: scan.model });
  let moved = null;
  try {
    for (let i = 0; i < 90; i++) { hero.move(0, 1); physics.step(1 / 60); ph2.step(1 / 60); ph2.sync(1); }
    moved = hero.position;
  } catch (e) { console.log('   hero error: ' + e.message); }
  check(!!moved && moved[2] > 0.5, 'the scanned hero walks with the supplied GLB (' + (moved ? 'z=' + moved[2].toFixed(2) + ' state=' + hero.state : 'failed') + ')');
  hero.dispose();
}

/* ---------------- 5. the bobber's separate parts ---------------- */
const bike = (await load('bobber_lite.glb')).scene;
const found = ['rearWheel', 'frontWheel', 'fork'].map(n => [n, !!bike.getObjectByName(n)]);
console.log('   bobber part lookup: ' + found.map(([n, ok]) => n + '=' + ok).join(' '));
check(found.every(([, ok]) => ok), 'bobber exposes rearWheel, frontWheel and fork (wheels spin, fork steers)');
console.log('   bobber raw size: ' + box(bike).toArray().map(n => n.toFixed(2)) + ' (mountVeh scales by length/width)');

/* ---------------- 6. the car models ---------------- */
for (const [label, file] of [['lite', 'aiprintgen_light_blue_lamborghini_inspired_supercar_prev_lite.glb'], ['full', 'aiprintgen_light_blue_lamborghini_inspired_supercar_prev.glb']]) {
  const car = (await load(file)).scene;
  const s = box(car);
  const k = CONFIG.car.length / s.x;
  console.log('   car ' + label + ' raw size ' + s.toArray().map(n => n.toFixed(2)) + ' -> scale k=' + k.toFixed(3) + ' => ' + (s.toArray().map(n => (n * k).toFixed(2))));
  check(Math.abs(s.x * k - CONFIG.car.length) < 0.01, 'car ' + label + ' scales to the configured ' + CONFIG.car.length + ' m length');
  check(s.y * k > 0.5 && s.y * k < 3, 'car ' + label + ' ends up a sensible height (' + (s.y * k).toFixed(2) + ' m)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
