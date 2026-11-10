import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import RAGDOLL from 'ragdoll';
import { prepareScanCharacter } from './src/character.js';
import { measureBike, createRiderPose, createHeroPose } from './src/pose.js';
import { createCity } from './src/city.js';
import fs from 'node:fs';

const loader = new GLTFLoader();
const load = async (f) => { const b = fs.readFileSync('./assets_nt/' + f); return await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const V = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const D = (a, b) => a.distanceTo(b).toFixed(3);
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

/* ================= A. rider on the bobber ================= */
console.log('\n=== A. rider pose on bobber_lite ===');
const scene = new THREE.Scene();
const src = (await load('bobber_lite.glb')).scene;
const root = new THREE.Group(), tilt = new THREE.Group();
root.add(tilt); scene.add(root);
const wrap = new THREE.Group(); tilt.add(wrap);
const inner = src.clone(true); wrap.add(inner);
const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
const k = 2.2 / size.x;
inner.scale.multiplyScalar(k);
inner.rotation.y = Math.PI / 2;
wrap.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(wrap), cc = bb.getCenter(new THREE.Vector3());
inner.position.set(-cc.x, -bb.min.y, -cc.z);
wrap.updateMatrixWorld(true);

const bike = measureBike(inner);
console.log('  grips(fork-local):', bike.gripsFork.map(V).join(' '));
console.log('  pegs(inner-local):', bike.pegsInner.map(V).join(' '));
console.log('  seat(inner-local):', V(bike.seatInner));
const box = new THREE.Box3().setFromObject(wrap);
console.log('  bike bbox (tilt):', `x[${box.min.x.toFixed(2)},${box.max.x.toFixed(2)}] y[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}] z[${box.min.z.toFixed(2)},${box.max.z.toFixed(2)}]`);
check('grips detected', bike.gripsFork.length === 2);
check('pegs detected', bike.pegsInner.length === 2);
check('seat near top of bike', bike.seatInner.y > 0, `y=${bike.seatInner.y.toFixed(3)}`);

const scanSrc = (await load('char_scan_lite.glb')).scene;
const rider = skClone(scanSrc);
rider.scale.setScalar(1.8 / 1.9);
tilt.add(rider);
const rp = createRiderPose(rider, bike, tilt);
check('rider pose rig built', rp.ok === true, rp.missing ? 'missing ' + rp.missing.join(',') : '');
const tune = { lean: 0.10, elbowOut: 0.85, handRoll: 0, hipLift: 0.02, ankleLift: 0.075, seatShift: 0.09 };
const lean = rp.calibrate(tune);
console.log('  calibrated torso lean:', lean.toFixed(3), 'rad, arm stretch needed', rp.stretch.toFixed(4));
check('arms reach the bars with <=6% stretch', rp.stretch <= 1.06, `stretch ${rp.stretch.toFixed(4)}`);
check('torso lean stays human (<0.9 rad)', lean < 0.9, `${lean.toFixed(3)} rad`);
for (let i = 0; i < 3; i++) rp.update(tune);
const B = rp.bones;
const W3 = (b) => b.getWorldPosition(new THREE.Vector3());
const T3 = (b) => tilt.worldToLocal(W3(b));
const gripsNow = rp.grips.map((g) => g.clone());
let maxHand = 0, maxFoot = 0; const handDots = [0, 0];
for (let i = 0; i < 2; i++) {
  const s = i === 0 ? 'left' : 'right';
  const wrist = T3(B[s + 'Hand']), foot = T3(B[s + 'Foot']);
  const el = T3(B[s + 'LowerArm']);
  const armLen = T3(B[s + 'UpperArm']).distanceTo(el) + el.distanceTo(wrist);
  const handLen = armLen * rp.handFrac;
  const hand = wrist;
  maxHand = Math.max(maxHand, Math.max(0, wrist.distanceTo(gripsNow[i]) - handLen * 0.55));
  const fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(B[s + 'Hand'].getWorldQuaternion(new THREE.Quaternion())).normalize();
  handDots[i] = Math.abs(fingers.dot(gripsNow[0].clone().sub(gripsNow[1]).normalize()));
  maxFoot = Math.max(maxFoot, foot.distanceTo(rp.pegs[i]));
  console.log(`  ${s.padEnd(5)} wrist${V(hand)}→grip${V(gripsNow[i])} d=${D(hand, gripsNow[i])}  foot→peg d=${D(foot, rp.pegs[i])}  elbow${V(el)}`);
}
const seatT = tilt.worldToLocal(inner.localToWorld(bike.seatInner.clone()));
console.log('  hips', V(T3(B.hips)), 'seat', V(seatT));
check('both hands on the grips (wrist within half a palm, <2cm over)', maxHand < 0.02, `max ${maxHand.toFixed(4)} m`);
check('fingers wrapped across the bar (>0.8 alignment)', Math.min(...handDots) > 0.8, `dots ${handDots.map((d) => d.toFixed(2)).join(', ')}`);
check('both ankles just above the pegs', Math.abs(maxFoot - 0.075) < 0.035, `ankle-peg ${maxFoot.toFixed(3)} m`);
const hipsT = T3(B.hips);
check('pelvis sits on the seat (<3cm above, shifted forward)', Math.abs(hipsT.y - seatT.y - 0.02) < 0.03 && Math.abs(hipsT.z - (seatT.z + 0.09)) < 0.04, `dy ${(hipsT.y-seatT.y).toFixed(3)} dz ${(hipsT.z-seatT.z).toFixed(3)}`);

// steering: turn the fork, the hands must follow the bars
const fork = bike.fork;
const AX = new THREE.Vector3(0.423, 0.906, 0).normalize();
const before = gripsNow.map((g) => g.clone());
fork.quaternion.setFromAxisAngle(AX, 0.5);
tune.steer = 0.5;   // the game rotates the fork by up to 0.6 rad, and the chest follows it
fork.updateWorldMatrix(true, true);
for (let i = 0; i < 2; i++) rp.update(tune);
let maxHand2 = 0, moved = 0;
for (let i = 0; i < 2; i++) {
  const s = i === 0 ? 'left' : 'right';
  const wrist2 = T3(B[s + 'Hand']);
  const el2 = T3(B[s + 'LowerArm']);
  const armLen2 = T3(B[s + 'UpperArm']).distanceTo(el2) + el2.distanceTo(wrist2);
  maxHand2 = Math.max(maxHand2, Math.max(0, wrist2.distanceTo(rp.grips[i]) - armLen2 * rp.handFrac * 0.55));
  moved = Math.max(moved, rp.grips[i].distanceTo(before[i]));
}
check('hands follow a steered fork (<2cm)', maxHand2 < 0.02, `max ${maxHand2.toFixed(4)} m`);
check('grips actually moved when steering', moved > 0.05, `${moved.toFixed(3)} m`);
// no NaN
let bad = 0;
for (const n of Object.keys(B)) { const p = W3(B[n]); if (!Number.isFinite(p.x + p.y + p.z)) bad++; }
check('no NaN joints', bad === 0);

/* ================= B. hero arms ================= */
console.log('\n=== B. hero arms ===');
const s2 = new THREE.Scene();
const physics = RAGDOLL.createPhysics({ gravity: [0, -9.81, 0] });
const city = createCity(s2, physics, { office: null, apartment: null });
const prep = prepareScanCharacter((await load('char_scan_lite.glb')).scene);
const hero = RAGDOLL.create({ scene: s2, physics, position: [city.spawn.x, 0.3, city.spawn.z], model: prep.model });
physics.step(1 / 60); physics.sync(1);
let model = null;
for (let i = 0; i < 40 && !model; i++) { physics.step(1 / 60); physics.sync(1); model = s2.getObjectByName('ragdoll-model'); }
const tuneArms = { swing: 1, out: 1, handRoll: 0.25 };
const hp = createHeroPose(model, hero, tuneArms);
check('hero arm rig built', hp.ok === true);

function measure(tag) {
  model.updateMatrixWorld(true);
  const HB = {};
  model.traverse((o) => { if (o.isBone) HB[o.name] = o; });
  const P = (n) => HB[n].getWorldPosition(new THREE.Vector3());
  const hips = P('hips'), head = P('head');
  const up = head.clone().sub(hips).normalize();
  const fwd = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const left = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const out = { tag, state: hero.state };
  for (const s of ['left', 'right']) {
    const S = P(s + 'UpperArm'), E = P(s + 'LowerArm'), W = P(s + 'Hand');
    const u = E.clone().sub(S).normalize(), v = W.clone().sub(E).normalize();
    out[s] = {
      elbowDeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1))),
      wristUp: W.clone().sub(hips).dot(up), wristOut: W.clone().sub(S).dot(left) * (s === 'left' ? 1 : -1),
      wristFwd: W.clone().sub(S).dot(fwd), hand: W,
    };
  }
  out.asym = out.left.hand.clone().sub(new THREE.Vector3().copy(out.right.hand).multiplyScalar(0)).length(); // placeholder
  out.mirror = (() => { const m = out.right.hand.clone(); m.x = -m.x; return out.left.hand.distanceTo(m); })();
  return out;
}
function report(o) {
  const f = (n) => `${o[n].elbowDeg.toFixed(0)}°`.padStart(5);
  console.log(`  ${o.tag.padEnd(10)} ${String(o.state).padEnd(6)} elbow L${f('left')} R${f('right')} | wristOut L${o.left.wristOut.toFixed(3)} R${o.right.wristOut.toFixed(3)} | wristFwd L${o.left.wristFwd.toFixed(3)} R${o.right.wristFwd.toFixed(3)} | mirror err ${o.mirror.toFixed(3)}`);
}

const rows = [];
// idle
for (let i = 0; i < 60; i++) { physics.step(1 / 60); physics.sync(1); hp.update(1 / 60); }
rows.push(measure('posed/idle'));
// run — track the full swing range per arm, not one instant
{
  const HB = {}; model.traverse((o) => { if (o.isBone) HB[o.name] = o; });
  const Sw = (s) => HB[s + 'UpperArm'].getWorldPosition(new THREE.Vector3());
  const Wr = (s) => HB[s + 'Hand'].getWorldPosition(new THREE.Vector3());
  const rng = { left: { min: 9, max: -9, arm: 0 }, right: { min: 9, max: -9, arm: 0 } };
  for (let i = 0; i < 160; i++) {
    hero.move(0, 1); physics.step(1 / 60); physics.sync(1); hp.update(1 / 60);
    if (i < 40) continue;
    model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
    for (const s of ['left', 'right']) {
      const S = Sw(s), W = Wr(s);
      const arm = S.distanceTo(HB[s + 'LowerArm'].getWorldPosition(new THREE.Vector3())) +
        HB[s + 'LowerArm'].getWorldPosition(new THREE.Vector3()).distanceTo(W);
      rng[s].arm = arm;
      const f = W.clone().sub(S).dot(fwd) / arm;
      rng[s].min = Math.min(rng[s].min, f); rng[s].max = Math.max(rng[s].max, f);
    }
  }
  for (const s of ['left', 'right']) {
    const r = rng[s];
    console.log(`  swing ${s.padEnd(5)} ${r.min.toFixed(3)} .. ${r.max.toFixed(3)}  range ${(r.max - r.min).toFixed(3)} (arm ${r.arm.toFixed(3)})`);
  }
  const rangeL = rng.left.max - rng.left.min, rangeR = rng.right.max - rng.right.min;
  check('run swing amplitude matches on both arms (<0.06)', Math.abs(rangeL - rangeR) < 0.06, `L ${rangeL.toFixed(3)} R ${rangeR.toFixed(3)}`);
  const centreL = (rng.left.max + rng.left.min) / 2, centreR = (rng.right.max + rng.right.min) / 2;
  check('run swing centred the same on both arms (<0.05)', Math.abs(centreL - centreR) < 0.05, `L ${centreL.toFixed(3)} R ${centreR.toFixed(3)}`);
}
rows.push(measure('posed/run'));
// sprint
for (let i = 0; i < 90; i++) { hero.move(0, 1); hero.sprint(true); physics.step(1 / 60); physics.sync(1); hp.update(1 / 60); }
rows.push(measure('posed/sprint'));
// jump
hero.jump(); for (let i = 0; i < 12; i++) { physics.step(1 / 60); physics.sync(1); hp.update(1 / 60); }
rows.push(measure('posed/jump'));
rows.forEach(report);

const okElbow = rows.every((o) => o.left.elbowDeg > 20 && o.left.elbowDeg < 160 && o.right.elbowDeg > 20 && o.right.elbowDeg < 160);
check('elbows stay in a human range in every state', okElbow);
const okOut = rows.every((o) => o.left.wristOut > 0.02 && o.right.wristOut > 0.02);
check('hands stay outside the torso (not clipping the hips)', okOut);
const stillRows = rows.filter((o) => o.state === 'idle' || o.state === 'jump');
const elbowDelta = Math.max(...stillRows.map((o) => Math.abs(o.left.elbowDeg - o.right.elbowDeg)));
check('L/R elbow angles match within 12 deg when not swinging', elbowDelta < 12, `worst ${elbowDelta.toFixed(1)} deg`);
const idleJump = rows.filter((o) => o.state === 'idle' || o.state === 'jump');
check('idle/jump arms are near-mirrored (<6cm)', Math.max(...idleJump.map((o) => o.mirror)) < 0.06, `worst ${Math.max(...idleJump.map((o) => o.mirror)).toFixed(3)} m`);
console.log(`\n${fail === 0 ? 'ALL POSE CHECKS PASSED' : fail + ' POSE CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
