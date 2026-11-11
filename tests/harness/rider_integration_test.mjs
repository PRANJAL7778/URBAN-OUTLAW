/* Rider integration: mounting, riding, dismounting and walking with the suit character.
 *
 * Every cycle is driven through the REAL ragdoll and the REAL riding pose, so this catches the
 * failures that a unit test on the maths alone would miss: duplicate characters, a hero record
 * left pointing at a disposed body, contact slipping while the bike moves, and a mount that
 * cannot be repeated.
 *
 *   node --import ./dist_shim.mjs rider_integration_test.mjs
 */
globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAGDOLL from 'ragdoll';
import { rigidBody, box, MotionType } from 'crashcat';
import fs from 'node:fs';
import { measureBike } from './src/pose.js';
import { createRiderPose, measureSaddle } from './src/riderpose.js';

const loader = new GLTFLoader();
const load = async (f) => {
  const b = fs.readFileSync('./assets_nt/' + f);
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
};
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

/* ---------------------------------------------------------------- the world */
const scene = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
rigidBody.create(physics.world, {
  shape: box.create({ halfExtents: [64, 0.5, 64] }), motionType: MotionType.STATIC,
  objectLayer: physics.layers.static, position: [0, -0.5, 0],
});

/* the bike, mounted exactly as src/main.js mounts it */
const bikeRoot = new THREE.Group(), tilt = new THREE.Group();
bikeRoot.add(tilt); scene.add(bikeRoot);
const bikeInner = (await load('bobber_lite.glb')).scene;
tilt.add(bikeInner);
const bsize = new THREE.Box3().setFromObject(bikeInner).getSize(new THREE.Vector3());
bikeInner.scale.multiplyScalar(2.2 / bsize.x);
bikeInner.rotation.y = Math.PI / 2;
bikeRoot.updateMatrixWorld(true);
const bbox = new THREE.Box3().setFromObject(bikeInner), bc = bbox.getCenter(new THREE.Vector3());
bikeInner.position.set(-bc.x, -bbox.min.y, -bc.z);
bikeRoot.updateMatrixWorld(true);

const raw = measureBike(bikeInner);
const fork = bikeInner.getObjectByName('fork');
const saddle = measureSaddle(bikeRoot, bikeInner);
const bikeGeom = {
  seat: saddle.seat, profile: saddle.profile,
  grips: raw.gripsFork.map((p) => tilt.worldToLocal(p.clone().applyMatrix4(fork.matrixWorld))),
  pegs: raw.pegsInner.map((p) => tilt.worldToLocal(p.clone().applyMatrix4(bikeInner.matrixWorld))),
};

/* ------------------------------------------------- the character lifecycle */
const suitSrc = (await load('male_character_in_suit.glb')).scene;
let hero = null, rider = null, riderPose = null, mountT = 0;

const ragdollRoot = () => scene.getObjectByName('ragdoll-model') || scene.getObjectByName('ragdoll');
const countSkinned = () => { let n = 0; scene.traverse((o) => { if (o.isSkinnedMesh) n++; }); return n; };

function makeHero(x, y, z) { return RAGDOLL.create({ scene, physics, position: [x, y, z], model: suitSrc }); }
function disposeHero() { if (hero) { hero.dispose(); hero = null; } }

/** the game's mount path */
function mount() {
  const model = ragdollRoot();
  disposeHero();
  if (rider) return true;
  if (!model) return false;
  model.removeFromParent();
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.setScalar(1);
  tilt.add(model);
  rider = model;
  riderPose = createRiderPose(rider, bikeGeom, {});
  if (!riderPose.ok) { rider.removeFromParent(); scene.add(rider); rider = null; riderPose = null; return false; }
  riderPose.calibrate();
  riderPose.update(undefined, 0, 0);
  mountT = 0;
  return true;
}
/** the game's per-frame riding pose */
function rideFrame(dt, speed, accel, roll) {
  if (!rider || !riderPose) return;
  mountT = Math.min(1, mountT + dt / 0.55);
  riderPose.ride(dt, { mix: mountT, speed, accel, roll, steer: 0 });
}
/** the game's dismount: blend, then hand the body back to a fresh ragdoll */
function dismountBlend(dt, seconds) {
  let t = seconds;
  while (t > 0) {
    const d = Math.min(dt, t);
    mountT = Math.max(0, Math.min(1, t / seconds));
    if (riderPose) riderPose.ride(d, { mix: mountT, speed: 0, accel: 0, roll: 0, steer: 0 });
    t -= d;
  }
  if (rider) rider.removeFromParent();
  rider = null; riderPose = null; mountT = 0;
  hero = makeHero(1.7, 0.3, 0);
}

/* -------------------------------------------------------------- A. walking */
console.log('\n=== A. the suit character walks ===');
hero = makeHero(0, 0.2, 0);
check('the suit rig becomes the walking hero', !!ragdollRoot(), 'root=' + (ragdollRoot() || {}).name);
const walkStart = hero.position[2];
for (let i = 0; i < 90; i++) { hero.move(0, 1); physics.step(1 / 60); }
check('it walks forward under input', hero.position[2] - walkStart > 2, 'travelled ' + (hero.position[2] - walkStart).toFixed(2) + ' m');
check('it stays on the ground while walking', Math.abs(hero.position[1]) < 0.35, 'y=' + hero.position[1].toFixed(2));
check('the walk state is running, not falling', hero.state === 'run' || hero.state === 'sprint', 'state=' + hero.state);
for (let i = 0; i < 60; i++) { hero.move(0, 0); physics.step(1 / 60); }
check('it comes to rest when the input stops', hero.state === 'idle', 'state=' + hero.state);
check('one character in the scene while walking', countSkinned() === 9, countSkinned() + ' skinned meshes');

/* --------------------------------------------------- B. mount, ride, dismount */
console.log('\n=== B. mount -> ride -> dismount, repeated ===');
for (let cycle = 1; cycle <= 3; cycle++) {
  const skinnedBefore = countSkinned();
  const okMount = mount();
  check(`cycle ${cycle}: mounts and inherits the walking body`, okMount && !!rider && rider.parent === tilt,
    'rider=' + !!rider + ' parent=' + (rider && rider.parent ? rider.parent.type : 'none'));
  check(`cycle ${cycle}: no second copy of the character was created`, countSkinned() === skinnedBefore,
    skinnedBefore + ' -> ' + countSkinned() + ' skinned meshes');
  check(`cycle ${cycle}: the hero record is released on mount`, !hero);

  for (let i = 0; i < 40; i++) rideFrame(1 / 60, 0, 0, 0);
  check(`cycle ${cycle}: the mount blend reaches the saddle`, mountT >= 1, 'mix=' + mountT.toFixed(2));

  const B = riderPose.bones;
  const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
  const gL = bikeGeom.grips.find((g) => g.x > 0), pL = bikeGeom.pegs.find((p) => p.x > 0);
  check(`cycle ${cycle}: hands are on the grips`, P('LeftHand_017').distanceTo(gL) < 0.09,
    P('LeftHand_017').distanceTo(gL).toFixed(3) + ' m');
  check(`cycle ${cycle}: feet are on the pegs`, P('LeftFoot_065').distanceTo(pL) < 0.13,
    P('LeftFoot_065').distanceTo(pL).toFixed(3) + ' m');
  const hips = P('Hips_01');
  check(`cycle ${cycle}: hips sit on the saddle`, Math.abs(hips.y - (saddle.seat.y + 0.056)) < 0.07,
    'hips y=' + hips.y.toFixed(2) + ' saddle y=' + saddle.seat.y.toFixed(2));

  dismountBlend(1 / 60, 0.42);
  check(`cycle ${cycle}: dismounts back to a walking hero`, !rider && !!hero, 'rider=' + !!rider + ' hero=' + !!hero);
  check(`cycle ${cycle}: the walk still works after dismounting`,
    (() => { const z0 = hero.position[2]; for (let i = 0; i < 45; i++) { hero.move(0, 1); physics.step(1 / 60); } return hero.position[2] - z0 > 1; })(),
    'y=' + hero.position[1].toFixed(2));
}

/* ------------------------------------------- C. contact through a speed sweep */
console.log('\n=== C. contact holds while riding at speed ===');
mount();
for (let i = 0; i < 40; i++) rideFrame(1 / 60, 0, 0, 0);
const B = riderPose.bones;
const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
const gL = bikeGeom.grips.find((g) => g.x > 0), pL = bikeGeom.pegs.find((p) => p.x > 0);
const gR = bikeGeom.grips.find((g) => g.x < 0), pR = bikeGeom.pegs.find((p) => p.x < 0);
let worstHand = 0, worstFoot = 0, minKnee = 9, minHead = 9;
const leans = [];
for (const [speed, roll] of [[0, 0], [5, 0], [12, 0.10], [20, 0.22], [27, 0.35]]) {
  for (let i = 0; i < 50; i++) rideFrame(1 / 60, speed, 0, roll);
  worstHand = Math.max(worstHand, P('LeftHand_017').distanceTo(gL), P('RightHand_043').distanceTo(gR));
  worstFoot = Math.max(worstFoot, P('LeftFoot_065').distanceTo(pL), P('RightFoot_070').distanceTo(pR));
  minKnee = Math.min(minKnee, Math.abs(P('LeftLeg_064').x));
  minHead = Math.min(minHead, P('Head_08').y);
  leans.push([speed, riderPose.chestLean() * 57.3]);
}
check('hands stay on the grips through the whole speed range', worstHand < 0.09, 'worst ' + worstHand.toFixed(3) + ' m');
check('feet stay on the pegs through the whole speed range', worstFoot < 0.13, 'worst ' + worstFoot.toFixed(3) + ' m');
check('knees stay outboard of the bike centre line', minKnee > 0.12, 'min |x| ' + minKnee.toFixed(3) + ' m');
check('the head never sinks into the tank', minHead > 1.0, 'min head y ' + minHead.toFixed(2) + ' m');
const lean0 = leans[0][1], leanMax = leans[leans.length - 1][1];
check('the rider sits upright when stationary', lean0 > 12 && lean0 < 32, lean0.toFixed(1) + ' deg from vertical');
check('the rider leans further as speed rises', leanMax > lean0 + 5, lean0.toFixed(1) + ' -> ' + leanMax.toFixed(1) + ' deg');
check('the lean never becomes a lie-down', leanMax < 42, 'max ' + leanMax.toFixed(1) + ' deg');

/* ----------------------------------------------------- D. stability and leaks */
console.log('\n=== D. stability ===');
let threw = null;
try {
  for (let i = 0; i < 600; i++) rideFrame(1 / 60, 15 + Math.sin(i / 9) * 8, Math.cos(i / 13) * 4, Math.sin(i / 17) * 0.3);
} catch (e) { threw = e; }
check('600 riding frames run without throwing', !threw, threw ? threw.message : '');
const finite = Object.keys(riderPose.bones).every((n) => {
  const p = riderPose.bones[n].getWorldPosition(new THREE.Vector3());
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
});
check('no bone position becomes NaN', finite);
dismountBlend(1 / 60, 0.42);
check('the character is still present after long riding', !!hero, 'hero=' + !!hero);
check('a stationary bike does not make the rider lean', (() => {
  mount();
  for (let i = 0; i < 60; i++) rideFrame(1 / 60, 0, 0, 0);
  const a = riderPose.chestLean() * 57.3;
  dismountBlend(1 / 60, 0.42);
  return a > 12 && a < 32;
})(), 'seated lean in range');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
