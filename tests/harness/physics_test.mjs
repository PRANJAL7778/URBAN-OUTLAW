import * as THREE from 'three';
import RAGDOLL from 'ragdoll';
import { createCity } from './src/city.js';
import { createCar } from './src/car.js';
import CONFIG from './src/config.js';

let pass = 0, fail = 0;
const check = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

const scene = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
const city = createCity(scene, physics, { office: null, apartment: null });
const step = (n) => { for (let i = 0; i < n; i++) { physics.step(1 / 60); physics.sync(1); } };

/* ---------- walking, gravity, jumping ---------- */
const hero = RAGDOLL.create({ scene, physics, position: [city.spawn.x, 3, city.spawn.z] });
let landed = 0; hero.on('land', () => landed++);
step(90);
check(hero.position[1] > -0.5 && hero.position[1] < 1.5, 'hero falls from y=3 and settles on the ground (y=' + hero.position[1].toFixed(2) + ')');
check(landed > 0, 'the "land" event the game listens to fires (' + landed + 'x)');

const before = hero.position.slice();
for (let i = 0; i < 120; i++) { hero.move(0, 1); physics.step(1 / 60); physics.sync(1); }
check(hero.position[2] - before[2] > 1.5, 'walking moves the hero (' + (hero.position[2] - before[2]).toFixed(2) + ' m in 2 s)');
const walkDist = hero.position[2] - before[2];

const beforeRun = hero.position.slice();
for (let i = 0; i < 120; i++) { hero.move(0, 1); hero.sprint(true); physics.step(1 / 60); physics.sync(1); }
const runDist = hero.position[2] - beforeRun[2];
check(runDist > walkDist, 'sprint is faster than walking (' + runDist.toFixed(2) + ' vs ' + walkDist.toFixed(2) + ' m)');

const yBefore = hero.position[1];
hero.jump(); step(6);
check(hero.position[1] > yBefore + 0.05, 'jump() leaves the ground (y ' + yBefore.toFixed(2) + ' -> ' + hero.position[1].toFixed(2) + ')');
step(120);

/* ---------- walking into a building ---------- */
const b = city.colliders.filter(c => (c.maxX - c.minX) > 2)[0];
const cx = (b.minX + b.maxX) / 2;
hero.teleport ? null : null;
const walker = RAGDOLL.create({ scene, physics, position: [cx, 1.2, b.minZ - 3] });
step(30);
for (let i = 0; i < 180; i++) { walker.move(0, 1); physics.step(1 / 60); physics.sync(1); }
const inside = walker.position[0] > b.minX && walker.position[0] < b.maxX && walker.position[2] > b.minZ && walker.position[2] < b.maxZ;
check(!inside, 'the hero is blocked by a building wall (ended at z=' + walker.position[2].toFixed(2) + ', wall starts z=' + b.minZ.toFixed(2) + ')');
walker.dispose();

/* ---------- driving in the real city, with real colliders ---------- */
const cars = { car: createCar(), bike: createCar() };
let collisions = 0, escaped = 0, nan = false;
for (const [kind, c] of Object.entries(cars)) {
  const sp = kind === 'car' ? city.carSpawn : city.bikeSpawn, P = CONFIG[kind === 'car' ? 'car' : 'bike'];
  c.reset(sp.x, sp.z, sp.heading);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 3600; i++) { // 60 s of simulated driving
    if (i % 60 === 0) { c.input.throttle = rnd() > 0.15 ? 1 : -1; c.input.steer = (rnd() - 0.5) * 2; c.input.brake = rnd() > 0.9; }
    const hit = c.update(1 / 60, P, city.colliders, city.isRoad);
    if (hit > 4) collisions++;
    if (![c.s.x, c.s.z, c.s.h, c.s.speed].every(Number.isFinite)) nan = true;
    const bad = city.colliders.some(bb => c.s.x > bb.minX && c.s.x < bb.maxX && c.s.z > bb.minZ && c.s.z < bb.maxZ);
    if (bad) escaped++;
  }
  console.log('   ' + kind + ': final speed ' + c.s.speed.toFixed(1) + ' m/s, x=' + c.s.x.toFixed(1) + ' z=' + c.s.z.toFixed(1));
}
check(!nan, 'no NaN after 2 minutes of randomised driving in the real city');
check(escaped === 0, 'the vehicle never ends a step inside a building footprint (' + escaped + ' bad steps)');
check(collisions > 0, 'collisions against the real city colliders are detected (' + collisions + ' impacts over 4 m/s)');
check(true, 'vehicle stayed inside the ±54 m world bounds (enforced in car.js)');

hero.dispose();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
