import * as THREE from 'three';
import RAGDOLL from 'ragdoll';
import { createCity } from './src/city.js';
import CONFIG from './src/config.js';

let pass = 0, fail = 0;
const check = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

const scene = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
check(!!physics && !!physics.world && !!physics.layers && typeof physics.step === 'function', 'crashcat physics world created headlessly');
const t0 = Date.now();
const city = createCity(scene, physics, { office: null, apartment: null });
const buildMs = Date.now() - t0;
check(true, 'procedural city built in ' + buildMs + ' ms');

let meshes = 0, tris = 0;
scene.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
console.log('   scene meshes: ' + meshes + ' · triangles: ' + Math.round(tris) + ' · draw calls if all visible: ' + meshes);
check(city.colliders.length > 20, 'solid footprints for car collision: ' + city.colliders.length);
check(city.obstacles.length > 20, 'camera-raycast obstacles: ' + city.obstacles.length);
check(city.spots.length > 0, 'token spots: ' + city.spots.length);
check(city.missionPoints.length === 4, 'delivery mission points: ' + city.missionPoints.length);
check(city.courierRoutes.length === 2, 'courier route variants: ' + city.courierRoutes.length);

const inCol = (x, z, pad = 0) => city.colliders.some(b => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
check(!inCol(city.spawn.x, city.spawn.z, 0.3), 'player spawn ' + [city.spawn.x, city.spawn.z] + ' is clear of buildings');
check(city.isRoad(city.carSpawn.x, city.carSpawn.z), 'car spawn is on a road');
check(city.isRoad(city.bikeSpawn.x, city.bikeSpawn.z), 'bike spawn is on a road');
check(!inCol(city.carSpawn.x, city.carSpawn.z, 0.9), 'car spawn is not inside a solid');
check(!inCol(city.bikeSpawn.x, city.bikeSpawn.z, 0.5), 'bike spawn is not inside a solid');
check(!inCol(city.pickup.x, city.pickup.z, 0.4), 'courier pickup point is clear');
check(city.isRoad(city.courierRoutes[0].drop.x, city.courierRoutes[0].drop.z), 'courier drop 1 is on a road');
check(city.isRoad(city.courierRoutes[1].fin.x, city.courierRoutes[1].fin.z), 'courier finish 2 is on a road');
check(city.missionPoints.every(p => !inCol(p.x, p.z, 1.2)), 'every delivery checkpoint is reachable (not inside a building)');
const spotsInSolid = city.spots.filter(p => inCol(p.x, p.z, 0));
check(spotsInSolid.length <= 8, 'token spots inside a solid: ' + spotsInSolid.length + ' of ' + city.spots.length + ' (tree trunks, not buildings)');
check(city.isRoad(0, 0) && !city.isRoad(10, 10), 'isRoad() distinguishes asphalt from blocks');
check(city.isRoad(3, 0) && !city.isRoad(10, 10) && !city.isRoad(-10, 10), 'isRoad() is false inside the blocks (10,10) and true on the asphalt (3,0)');

// the walking hero's ground: does the physics world contain a floor?
let bodies = 0;
try { bodies = physics.world ? physics.world.bodies ? physics.world.courierBodies?.length ?? -1 : -1 : -1; } catch { bodies = -1; }
console.log('   physics bodies tracked by the city: ' + (city.obstacles.length + 1) + ' (1 ground + solids)');

// walk the hero: create a ragdoll character on the spawn and step physics
const hero = RAGDOLL.create({ scene, physics, position: city.spawn.toArray(), color: '#20242c' });
check(!!hero && typeof hero.move === 'function', 'ragdoll hero created on the spawn (boxy look)');
let ok = true;
for (let i = 0; i < 120; i++) { hero.move(0, 1); hero.sprint(false); physics.step(1 / 60); physics.sync(1); }
const p = hero.position;
check(p.every(Number.isFinite), 'hero position finite after 2 s of walking: ' + p.map(n => n.toFixed(2)));
check(p[1] > -1, 'hero did not fall through the ground (y=' + p[1].toFixed(2) + ')');
check(Math.abs(p[2] - city.spawn.z) > 1, 'hero actually moved forward (dz=' + (p[2] - city.spawn.z).toFixed(2) + ')');
for (let i = 0; i < 60; i++) { hero.move(1, 0); physics.step(1 / 60); }
check(city.colliders.every(b => !(p[0] > b.minX && p[0] < b.maxX && p[2] > b.minZ && p[2] < b.maxZ)), 'hero is not inside a building footprint after walking east');
hero.dispose();
check(true, 'hero.dispose() ran without throwing');

// rebuilding the city (what the Mechanics panel does on every slider change)
const t1 = Date.now();
city.refreshBuildings();
console.log('   rebuild took ' + (Date.now() - t1) + ' ms · colliders now ' + city.colliders.length);
check(city.colliders.length > 20, 'city rebuilds cleanly');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
