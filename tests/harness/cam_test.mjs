import * as THREE from 'three';
import RAGDOLL from 'ragdoll';
import { createCity } from './src/city.js';
import { createCameraRig, rayClear } from './src/camera.js';

let fail = 0;
const check = (n, ok, x = '') => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const scene = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
const city = createCity(scene, physics, { office: null, apartment: null });
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 180);
const cfg = { sensitivity: 0.005, walkDist: 7, carDist: 6.2, bikeDist: 5.0 };
const rig = createCameraRig(camera, city, cfg);
const boxes = city.colliders;
console.log(`\n=== camera rig (${boxes.length} building boxes in the world) ===`);

const inBox = (x, z, pad = 0) => boxes.some((b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
const clearLine = (x0, z0, x1, z1) => {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const pad = boxes.some((b) => x0 > b.minX - 0.45 && x0 < b.maxX + 0.45 && z0 > b.minZ - 0.45 && z0 < b.maxZ + 0.45) ? 0.02 : 0.40;
  return rayClear(boxes, x0, z0, x1 - x0, z1 - z0, d, pad) >= d - 0.50;  // 0.5 m margin matches the rig's own clearance
};

/* --- on foot, orbiting a full circle next to the buildings --- */
let inside = 0, below = 0, blocked = 0, maxStep = 0, worstStep = '';
const px = city.spawn.x, pz = city.spawn.z;
let prev = new THREE.Vector3();
for (let i = 0; i < 360; i++) {
  rig.drag(-8, 0, i * 16);
  const tx = px + Math.sin(i * 0.05) * 3, tz = pz + Math.cos(i * 0.05) * 3;
  rig.update(1 / 60, { mode: 'walk', x: tx, z: tz, y: 0.1, heading: i * 0.05, speed: 4, now: i * 16 });
  const c = camera.position;
  if (i > 30) {
    if (inBox(c.x, c.z, -0.1)) inside++;
    if (c.y < 0.5) below++;
    if (!clearLine(tx, tz, c.x, c.z)) blocked++;
    const step = c.distanceTo(prev);
    if (step > maxStep) { maxStep = step; worstStep = `frame ${i}`; }
  }
  prev.copy(c);
}
check('walk camera never inside a building', inside === 0, `${inside} frames`);
check('walk camera never below the road', below === 0, `${below} frames`);
check('walk camera line of sight is clear except a corner frame or two', blocked <= 2, `${blocked} frames`);
check('walk camera pull-in is bounded (walls win over smoothness)', maxStep < 3, `max ${maxStep.toFixed(3)} m/frame at ${worstStep}`);

/* --- walk distance limits --- */
rig.setWalkDist(20); check('walk distance clamps high', rig.state.dist <= 6.5, rig.state.dist.toFixed(2));
rig.setWalkDist(0.5); check('walk distance clamps low', rig.state.dist >= 2.2, rig.state.dist.toFixed(2));

/* --- pitch limits via drag --- */
for (let i = 0; i < 40; i++) rig.drag(0, 300);
check('look pitch clamped up', rig.state.pitch <= 1.05 + 1e-6, rig.state.pitch.toFixed(3));
for (let i = 0; i < 80; i++) rig.drag(0, -300);
check('look pitch clamped down', rig.state.pitch >= 0.10 - 1e-6, rig.state.pitch.toFixed(3));

/* --- car: an abrupt 90° turn must swoop, not snap --- */
rig.jump(0, 0.34);
let maxYawStep = 0, settle = -1;
let lastYaw = rig.state.carYaw;
for (let i = 0; i < 90; i++) {
  const heading = i < 3 ? 0 : Math.PI / 2;
  rig.update(1 / 60, { mode: 'car', x: 0, z: 0, y: 0.04, heading, speed: 12, now: i * 16 });
  const d = Math.abs(rig.state.carYaw - lastYaw);
  maxYawStep = Math.max(maxYawStep, d);
  lastYaw = rig.state.carYaw;
  if (settle < 0 && i > 10 && Math.abs(rig.state.carYaw - heading) < 0.02) settle = i;
}
check('car camera trails the turn smoothly', maxYawStep < 0.12, `max ${(maxYawStep * 57.3).toFixed(1)}°/frame`);
check('car camera catches up within 1.3 s', settle > 0 && settle < 78, `${(settle / 60).toFixed(2)} s`);
{
  const fwd = new THREE.Vector3(Math.sin(Math.PI / 2), 0, Math.cos(Math.PI / 2));
  const dot = camera.position.dot(fwd);
  check('car camera sits behind the car, looking down its heading', dot < -2, `behind by ${(-dot).toFixed(2)} m`);
}

/* --- car distance grows a little with speed --- */
const distAt = (speed) => {
  rig.jump(0, 0.34);
  for (let i = 0; i < 200; i++) rig.update(1 / 60, { mode: 'car', x: 0, z: 0, y: 0, heading: 0, speed, now: i * 16 });
  return rig.state.dist;
};
const slow = distAt(0), fast = distAt(26);
check('car distance grows gently with speed', fast > slow && fast - slow < 2.2, `${slow.toFixed(2)} → ${fast.toFixed(2)} m`);

/* --- bike: level horizon, rider/bike in frame --- */
rig.jump(1.2, 0.34);
let rolled = 0;
for (let i = 0; i < 120; i++) {
  rig.update(1 / 60, { mode: 'bike', x: 0, z: 0, y: 0, heading: 1.2 + Math.sin(i * 0.1) * 0.6, speed: 9, steer: 0.4, lean: 0.45, now: i * 16 });
  if (Math.abs(camera.up.x) > 1e-6 || Math.abs(camera.up.z) > 1e-6) rolled++;
}
check('bike camera never rolls the horizon', rolled === 0, `${rolled} rolled frames`);
const bikeDist = rig.state.dist;
check('bike camera sits closer than the car camera', bikeDist < slow + 0.4, `${bikeDist.toFixed(2)} m`);
const toBike = Math.hypot(camera.position.x, camera.position.z);
check('bike camera keeps the bike in frame', toBike > 3 && toBike < 12, `${toBike.toFixed(2)} m back`);

/* --- mode switch snaps instead of flying across the city --- */
rig.jump(0, 0.34);
rig.update(1 / 60, { mode: 'walk', x: 0, z: 0, y: 0, heading: 0, speed: 0, now: 0 });
const a = camera.position.clone();
rig.update(1 / 60, { mode: 'walk', x: 60, z: 60, y: 0, heading: 0, speed: 0, now: 16 });
check('long teleports do not leave the camera behind', camera.position.distanceTo(a) > 10 || rig.state.ready === false, camera.position.distanceTo(a).toFixed(1));

console.log(`\n${fail === 0 ? 'ALL CAMERA CHECKS PASSED' : fail + ' CAMERA CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
