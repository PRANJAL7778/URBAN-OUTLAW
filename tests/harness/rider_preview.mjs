// Rider preview: loads the real bobber + the new character, applies the riding pose with the
// project's own IK, CPU-skins the meshes using the posed skeleton, and dumps the result for
// tools/render_dump.py — so the pose can actually be looked at without a GPU.
//
//   node --import ./dist_shim.mjs rider_preview.mjs            # riding pose
//   STAND=1 node --import ./dist_shim.mjs rider_preview.mjs    # character standing (control)
//
globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { measureBike } from './src/pose.js';
import { createRiderPose, measureSaddle } from './src/riderpose.js';

const OUT = process.env.OUT || '/tmp/shots';
const BIKE_BACK = Number(process.env.BACK || 0);
const STAND = !!process.env.STAND;
const MIX = process.env.MIX !== undefined ? Number(process.env.MIX) : 1;
const SPEED = Number(process.env.SPEED || 0);
const ROLL = Number(process.env.ROLL || 0);
const GAME_Y = process.env.GAME_Y !== '0';  // the game puts the bike root at y = 0.04

const loader = new GLTFLoader();
const load = async (p) => {
  const b = fs.readFileSync(p);
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
};

/* ------------------------------------------------------------------ bike */
const bikeGltf = await load('/home/user/URBAN-OUTLAW/assets/bobber_lite.glb');
const inner = bikeGltf.scene.clone(true);
const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
inner.scale.multiplyScalar(2.2 / size.x);
inner.rotation.y = Math.PI / 2;
const bike = new THREE.Group();
if (GAME_Y) bike.position.y = 0.04;
bike.add(inner);
bike.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(bike), ctr = bb.getCenter(new THREE.Vector3());
inner.position.set(-ctr.x, -bb.min.y, -ctr.z);
bike.updateMatrixWorld(true);

const fork = inner.getObjectByName('fork');
// The bike is used exactly as shipped. The bar-setback experiment lives in
// tests/experiments/setbackBars.js and is deliberately NOT wired in here: the pose reads
// correctly on the original geometry, so the motorcycle must not be modified.
if (BIKE_BACK) console.warn('BACK is ignored — the handlebars are never modified (see tests/experiments)');
const geom = measureBike(inner);
bike.updateMatrixWorld(true);
const toBike = (v) => bike.worldToLocal(v.clone().applyMatrix4(inner.matrixWorld));
const grips = geom.gripsFork.map((g) => bike.worldToLocal((fork ? g.clone().applyMatrix4(fork.matrixWorld) : g.clone())));
const pegs = geom.pegsInner.map((p) => toBike(p));
const saddle = measureSaddle(bike, inner);
console.log(`bike grips ${grips.map((v) => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`).join(' ')}`);
console.log(`bike pegs  ${pegs.map((v) => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`).join(' ')}`);
console.log(`saddle     (${saddle.seat.x.toFixed(2)},${saddle.seat.y.toFixed(2)},${saddle.seat.z.toFixed(2)}) ok=${saddle.ok}`);

/* --------------------------------------------------------------- character */
const charGltf = await load('/home/user/URBAN-OUTLAW/assets/male_character_in_suit.glb');
const root = charGltf.scene;
root.updateMatrixWorld(true);
const B = {};
root.traverse((o) => { if (o.isBone) B[o.name] = o; });
const skinned = [];
root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
console.log(`character: ${Object.keys(B).length} bones · ${skinned.length} skinned meshes`);

let pose = null;
let cal = null;
let bikeGeom = { seat: saddle.seat, profile: saddle.profile, pegs, grips };
if (!STAND) {
  // accept/reject seating positions: prefer a real contact patch with comfortable reach
  pose = createRiderPose(root, bikeGeom, {});
  if (!pose.ok) { console.error('pose missing bones:', pose.missing); process.exit(1); }
  const cands = [];
  for (let fwd = 0.10; fwd <= 0.42; fwd += 0.02) {
    for (let lean = 0.16; lean <= 0.70; lean += 0.04) {
      const r = pose.trial({ seatFwd: fwd, lean });
      if (!r) continue;
      const seated = pose.seatContact();
      cands.push({
        fwd, lean, arm: r.arm, leg: r.leg, seated, chest: r.chest,
        score: Math.abs(r.arm - 0.95) * 2.5 + Math.abs(r.leg - 0.90) * 1.5 + Math.abs(r.chest - 0.34) * 1.0 - seated * 0.40,
      });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const best = cands[0];
  pose.setTune({ seatFwd: best.fwd, lean: best.lean });
  pose.update(undefined, 0, MIX);
  if (SPEED || ROLL) {
    // settle the smoothed speed the way the game would, then take one posed frame
    for (let i = 0; i < 90; i++) pose.ride(1/60, { mix: 1, speed: SPEED, accel: 0, roll: ROLL, steer: 0 });
    pose.tune._drawn = false;
    pose.ride(1/60, { mix: 1, speed: SPEED, accel: 0, roll: ROLL, steer: 0 });
  }
  cal = best;
  console.log(`chosen: seatFwd ${best.fwd.toFixed(2)} m · chest ${(best.chest * 57.3).toFixed(0)}° · arm ${(best.arm * 100).toFixed(0)}% · leg ${(best.leg * 100).toFixed(0)}% · seated ${best.seated.toFixed(2)}`);
} else {
  // standing control: place the rig at the origin, bind pose
  console.log('STAND control: bind pose, no pose applied');
}
root.updateMatrixWorld(true);

/* --------------------------------------------------------------- contacts */
const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
const near = (a, b) => P(a).distanceTo(b);
if (!STAND) {
  const gripL = bikeGeom.grips.find((g) => g.x > 0), gripR = bikeGeom.grips.find((g) => g.x < 0);
  const pegL = bikeGeom.pegs.find((p) => p.x > 0), pegR = bikeGeom.pegs.find((p) => p.x < 0);
  const seatPt = new THREE.Vector3(saddle.seat.x, saddle.seat.y, P('Hips_01').z);
  console.log('\n--- contact (bike space) ---');
  console.log(`  hips above saddle surface : ${(P('Hips_01').y - saddle.seat.y).toFixed(3)} m   (hip joint; a seated rider is ~0.10 m)`);
  console.log(`  wrist -> grip             : L ${near('LeftHand_017', gripL).toFixed(3)}  R ${near('RightHand_043', gripR).toFixed(3)} m`);
  console.log(`  ankle -> peg              : L ${near('LeftFoot_065', pegL).toFixed(3)}  R ${near('RightFoot_070', pegR).toFixed(3)} m`);
  console.log(`  knee  -> bike centreline  : L ${P('LeftLeg_064').x.toFixed(3)}  R ${P('RightLeg_069').x.toFixed(3)} m (outside the tank)`);
  console.log(`  knee forward of hips      : ${(P('LeftLeg_064').z - P('Hips_01').z).toFixed(3)} m`);
}

/* ------------------------------------------------------- CPU skin the pose */
const out = new THREE.Group();
if (!STAND) out.add(bike.clone(true));
const charOut = new THREE.Group();
charOut.name = 'character';
for (const sm of skinned) {
  sm.skeleton.update();
  const g = sm.geometry;
  const pos = g.attributes.position;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = sm.skeleton.bones, bm = sm.skeleton.boneMatrices;
  const arr = new Float32Array(pos.count * 3);
  const bind = sm.bindMatrix, bindInv = sm.bindMatrixInverse;
  const v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3(), m4 = new THREE.Matrix4();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(bind);
    acc.set(0, 0, 0);
    let wsum = 0;
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(i, j);
      if (w === 0) continue;
      m4.fromArray(bm, si.getComponent(i, j) * 16);
      t.copy(v).applyMatrix4(m4);
      acc.addScaledVector(t, w);
      wsum += w;
    }
    if (wsum > 0 && Math.abs(wsum - 1) > 1e-4) acc.multiplyScalar(1 / wsum);
    acc.applyMatrix4(bindInv);
    arr[i * 3] = acc.x; arr[i * 3 + 1] = acc.y; arr[i * 3 + 2] = acc.z;
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) ng.setAttribute('uv', g.attributes.uv);
  if (g.index) ng.setIndex(g.index);
  ng.computeVertexNormals();
  const m = new THREE.Mesh(ng, sm.material);
  m.name = sm.name;
  charOut.add(m);
}
out.add(charOut);

/* ------------------------------------------- is the skin actually posed?  */
{
  const box = new THREE.Box3().setFromObject(charOut);
  const sz = box.getSize(new THREE.Vector3());
  const handL = B['LeftHand_017'].getWorldPosition(new THREE.Vector3());
  const head = B['Head_08'].getWorldPosition(new THREE.Vector3());
  const meshHandZ = handL.z;
  console.log(`\nSKIN CHECK  mesh bbox size (${sz.x.toFixed(2)}, ${sz.y.toFixed(2)}, ${sz.z.toFixed(2)})  y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}`);
  console.log(`            wrist bone (${handL.x.toFixed(2)}, ${handL.y.toFixed(2)}, ${handL.z.toFixed(2)}) · head bone (${head.x.toFixed(2)}, ${head.y.toFixed(2)}, ${head.z.toFixed(2)})`);
  const tpose = (sz.x > 1.5 && sz.y > 1.7);
  console.log(`            ${tpose ? 'STILL IN BIND POSE — skinning is NOT following the rig' : 'posed (not a T-stand)'}`);
}

/* ---------------------------------------------------------- scene dump */
const meta = [];
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
function addMesh(mesh, src) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry, pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
  }
  const uv = g.attributes.uv ? new Float32Array(g.attributes.uv.array) : new Float32Array(pos.count * 2);
  const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  meta.push({ name: mesh.name || '', material: mat?.name || '', src, pos: b64(arr), uv: b64(uv), idx: b64(idx), count: pos.count });
}
if (!STAND) for (const m of bike.clone(true).children) out.add(m), out.children.pop();
const bikeOut = STAND ? null : out.children.find((o) => o !== charOut);
if (bikeOut) bikeOut.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) addMesh(o, 'bike'); });
charOut.children.forEach((m) => addMesh(m, 'char'));
fs.writeFileSync(`${OUT}/pose_dump.json.gz`, zlib.gzipSync(Buffer.from(JSON.stringify({ meshes: meta }))));
console.log(`\nwrote ${OUT}/pose_dump.json.gz · ${meta.length} meshes · ${(fs.statSync(`${OUT}/pose_dump.json.gz`).size / 1048576).toFixed(2)} MB`);
