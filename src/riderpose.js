/* Rider pose for the suit character (`assets/male_character_in_suit.glb`).
 *
 * The rig is a MetaHuman-style 74-joint skeleton:
 *   Hips_01 > Spine_02 > Spine1_03 > Spine2_04 > Neck_05 .. Head_08
 *   LeftShoulder_012 > LeftArm_013 > LeftForeArm_014 > LeftHand_017   (Right* mirrors)
 *   LeftUpLeg_063 > LeftLeg_064 > LeftFoot_065 > LeftToeBase_066     (Right* mirrors)
 * It faces +Z, is in metres (1.81 m tall, feet at y = 0) and ships with no animation clips, so the
 * riding pose is built procedurally here. Walking is untouched (the ragdoll owns that).
 *
 * All positions below are in the *bike's* space: the group the model is parented to, where +X is
 * right, +Y is up and +Z is forward — the space `measureBike()` reports in once mount time has
 * converted its inner-space results.
 */

import * as THREE from 'three';
import { solveTwoBone, alignBoneAxis } from './ik.js';

const SIDES = ['L', 'R'];
const J = {
  L: { arm: 'LeftArm_013', fore: 'LeftForeArm_014', hand: 'LeftHand_017', shoulder: 'LeftShoulder_012', thigh: 'LeftUpLeg_063', shin: 'LeftLeg_064', foot: 'LeftFoot_065', toe: 'LeftToeBase_066', out: 1, sfx: '0' },
  R: { arm: 'RightArm_039', fore: 'RightForeArm_040', hand: 'RightHand_043', shoulder: 'RightShoulder_038', thigh: 'RightUpLeg_068', shin: 'RightLeg_069', foot: 'RightFoot_070', toe: 'RightToeBase_071', out: -1, sfx: '0' },
};
const SPINE = ['Spine_02', 'Spine1_03', 'Spine2_04'];
const REQUIRED = ['Hips_01', 'Spine_02', 'Spine1_03', 'Spine2_04', 'Neck_05', 'Head_08']
  .concat(SIDES.flatMap((s) => [J[s].shoulder, J[s].arm, J[s].fore, J[s].hand, J[s].thigh, J[s].shin, J[s].foot]));

/** Finger chains, keyed by finger, for closing the hands around a grip. */
const FINGERS = {
  L: {
    Index: ['LeftHandIndex1_022', 'LeftHandIndex2_023', 'LeftHandIndex3_024', 'LeftHandIndex4_025'],
    Middle: ['LeftHandMiddle1_026', 'LeftHandMiddle2_027', 'LeftHandMiddle3_028', 'LeftHandMiddle4_029'],
    Ring: ['LeftHandRing1_030', 'LeftHandRing2_031', 'LeftHandRing3_032', 'LeftHandRing4_033'],
    Pinky: ['LeftHandPinky1_034', 'LeftHandPinky2_035', 'LeftHandPinky3_036', 'LeftHandPinky4_037'],
    Thumb: ['LeftHandThumb1_018', 'LeftHandThumb2_019', 'LeftHandThumb3_020', 'LeftHandThumb4_021'],
  },
  R: {
    Index: ['RightHandIndex1_048', 'RightHandIndex2_049', 'RightHandIndex3_050', 'RightHandIndex4_051'],
    Middle: ['RightHandMiddle1_052', 'RightHandMiddle2_00', 'RightHandMiddle3_053', 'RightHandMiddle4_054'],
    Ring: ['RightHandRing1_055', 'RightHandRing2_056', 'RightHandRing3_057', 'RightHandRing4_058'],
    Pinky: ['RightHandPinky1_059', 'RightHandPinky2_060', 'RightHandPinky3_061', 'RightHandPinky4_062'],
    Thumb: ['RightHandThumb1_044', 'RightHandThumb2_045', 'RightHandThumb3_046', 'RightHandThumb4_047'],
  },
};

/** Starting point for the pose. All metres / radians; every value can be overridden by `tune`. */
export const RIDER_DEFAULTS = {
  seatGap: 0.045,     // hip joint centre above the surface under it
  seatFwd: 0.24,      // how far forward of the deepest saddle point the rider sits (the saddle nose)
  lean: 0.42,         // torso lean from vertical
  spineCurve: 0.34,   // share of the lean spread over the three spine bones
  kneeOut: 0.30,      // lateral bias of the knee pole (relative)
  kneeFwd: 1.00,      // forward bias of the knee pole (relative) — knees lead around the tank
  ankleLift: 0.080,   // ankle bone above the peg
  ankleOut: 0.045,    // ankle bone outboard of the peg centre
  wristIn: 0.050,     // wrist bone inboard of the palm centre
  wristUp: 0.012,
  elbowDown: 0.80,
  elbowOut: 0.55,
  headLevel: 0.70,
  fingerCurl: 0.62,
  thumbCurl: 0.40,

  /* --- live riding motion (all applied on top of the static seated pose) --- */
  speedLean: 0.17,      // extra forward lean at top speed, radians (a bobber tucks ~30 deg, no more)
  turnLean: 1.00,       // share of the bike's roll the rider's torso follows
  accelLean: 0.008,     // radians per m/s^2 of acceleration (sit back when pulling away)
  braceMax: 0.05,       // cap on that weight shift: it must never cancel the speed tuck
  headHold: 0.55,       // how much the head resists the torso lean (eyes stay level)
  blendRate: 8.0,       // mount/dismount blend speed (1/s)
  seatGapMount: 0.34,   // how far above the saddle the hips start when mounting
  mountSide: 0.42,      // how far out to the side the hips start (the rider steps up from the left)
  mountBack: 0.10,      // and a little behind the saddle
};

/**
 * Find the saddle on the actual bike: the trough in the up-facing surface between the tank
 * (the highest plateau near the middle) and the rear mudguard. `measureBike()`'s
 * "40% of the wheelbase" rule lands on the tank on this model, so the saddle is re-measured.
 *
 * @param {THREE.Object3D} bikeRoot the group the bike model is parented to (the pose's space)
 * @param {THREE.Object3D} model    the bike model itself
 * @returns {{seat: THREE.Vector3, profile: {z:number, y:number}[], ok: boolean}}
 */
export function measureSaddle(bikeRoot, model) {
  bikeRoot.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const top = new Map();                       // z bin -> highest up-facing point on the centreline
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const mid = new THREE.Vector3(), local = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
      if (Math.abs(n.y) < 0.55) continue;                       // up-facing only: no side panels or wheels
      mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      local.copy(mid).applyMatrix4(new THREE.Matrix4().copy(bikeRoot.matrixWorld).invert());
      if (Math.abs(local.x) > 0.13) continue;                   // centreline strip
      const bin = Math.round(local.z * 20) / 20;
      const cur = top.get(bin);
      if (!cur || local.y > cur) top.set(bin, local.y);
    }
  });
  const profile = [...top.entries()].map(([z, y]) => ({ z, y })).sort((p, q) => p.z - q.z);
  if (profile.length < 8) return { seat: new THREE.Vector3(0, 0.6, -0.2), profile, ok: false };
  // the tank: the highest plateau towards the front half of the bike
  let tank = profile[0];
  for (const p of profile) if (p.y > tank.y) tank = p;
  // The saddle: the shallow trough behind the tank and in front of the rear mudguard rise.
  // The window matters — further back the mudguard keeps dropping and would win by accident.
  const behind = profile.filter((p) => p.z < tank.z - 0.30 && p.z > tank.z - 1.00);
  if (!behind.length) return { seat: new THREE.Vector3(0, tank.y - 0.2, tank.z - 0.4), profile, ok: false };
  let saddle = behind[0];
  for (const p of behind) if (p.y < saddle.y) saddle = p;
  // average over the shallow dip either side of the lowest sample, so one stray triangle cannot win
  const near = behind.filter((p) => Math.abs(p.z - saddle.z) <= 0.10);
  const y = near.reduce((s, p) => s + p.y, 0) / near.length;
  return { seat: new THREE.Vector3(0, y, saddle.z), profile, ok: true, tank };
}

/** Height of the bike's up-facing surface at a given z, from the profile measureSaddle() built. */
function surfaceAt(bikeGeom, z) {
  const prof = bikeGeom.profile;
  if (!prof || !prof.length) return bikeGeom.seat.y;
  let best = prof[0], bestD = 1e9;
  for (const p of prof) { const d = Math.abs(p.z - z); if (d < bestD) { bestD = d; best = p; } }
  return bestD <= 0.12 ? best.y : bikeGeom.seat.y;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();

/**
 * @param {THREE.Object3D} rig   the character root (its bones are posed in place)
 * @param {{seat:THREE.Vector3, pegs:THREE.Vector3[], grips:THREE.Vector3[]}} bikeGeom  bike-space
 * @param {Partial<typeof RIDER_DEFAULTS>} tune
 */
export function createRiderPose(rig, bikeGeom, tune = {}) {
  const t = { ...RIDER_DEFAULTS, ...tune };
  const B = {};
  rig.traverse((o) => { if (o.isBone) B[o.name] = o; });
  const missing = REQUIRED.filter((n) => !B[n]).concat(
    SIDES.flatMap((s) => Object.values(FINGERS[s]).flat().filter((n) => !B[n])),
  );
  if (missing.length) return { ok: false, missing, update() {}, calibrate: () => t, reach: () => 0 };

  // rest pose, captured once so the pose is always rebuilt from a clean base
  const restPos = new Map(), restQuat = new Map();
  for (const name of Object.keys(B)) {
    restPos.set(name, B[name].position.clone());
    restQuat.set(name, B[name].quaternion.clone());
  }
  const bones = Object.values(B);
  const hipWorld = () => { rig.updateWorldMatrix(true, true); return B.Hips_01.getWorldPosition(new THREE.Vector3()); };
  const g2w = (p) => p.clone().applyMatrix4(rig.parent ? rig.parent.matrixWorld : rig.matrixWorld);
  const w2g = (p) => (rig.parent ? rig.parent.worldToLocal(p.clone()) : p.clone());

  /**
   * Reset every bone we touch to the bind pose. This has to be a complete reset: the two-bone
   * solver writes absolute orientations, so any pose left behind by a previous frame (or a
   * calibration trial) would be measured instead of the pose being built.
   */
  function reset() {
    for (const name of Object.keys(B)) {
      B[name].position.copy(restPos.get(name));
      B[name].quaternion.copy(restQuat.get(name));
      B[name].scale.set(1, 1, 1);
    }
    rig.updateWorldMatrix(true, true);
  }

  /** rotate a bone about a world-space axis */
  const rotW = (bone, axis, angle) => { bone.rotateOnWorldAxis(axis, angle); bone.updateWorldMatrix(false, true); };

  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

  /** how far the torso leans: solved so the hands can actually reach the grips */
  function reachAt(lean) {
    // shoulder position for a given lean, from the hips
    const hips = g2w(bikeGeom.seat).add(new THREE.Vector3(0, t.seatGap, t.seatFwd));
    const up = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
    // distance from the hip joint to the shoulder joint in the rig (measured once)
    const chestH = restChestH;
    const shoulderY = hips.clone().addScaledVector(up, chestH);
    const shoulderX = restShoulderX;
    const grip = bikeGeom.grips[0];
    const mid = grip.clone().add(bikeGeom.grips[1]).multiplyScalar(0.5);
    const side = Math.abs(grip.x - mid.x);
    const sh = new THREE.Vector3(Math.sign(mid.x || 1) * side, shoulderY.y, shoulderY.z);
    sh.z = shoulderY.z;
    const d = sh.distanceTo(grip);
    return { d, arm: restArmLen, ok: d <= restArmLen * 0.985 };
  }

  let restChestH = 0.30, restShoulderX = 0.18, restArmLen = 0.52, restLegLen = 0.85, restHipX = 0.10;
  {
    const hips = B.Hips_01.getWorldPosition(new THREE.Vector3());
    const chest = B.Spine2_04.getWorldPosition(new THREE.Vector3());
    const arm = B[J.L.arm].getWorldPosition(new THREE.Vector3());
    const fore = B[J.L.fore].getWorldPosition(new THREE.Vector3());
    const hand = B[J.L.hand].getWorldPosition(new THREE.Vector3());
    restChestH = chest.y - hips.y;
    restShoulderX = Math.abs(arm.x - chest.x);
    restArmLen = arm.distanceTo(fore) + fore.distanceTo(hand);
    const thigh = B[J.L.thigh].getWorldPosition(new THREE.Vector3());
    const shin = B[J.L.shin].getWorldPosition(new THREE.Vector3());
    const foot = B[J.L.foot].getWorldPosition(new THREE.Vector3());
    restLegLen = thigh.distanceTo(shin) + shin.distanceTo(foot);
    restHipX = Math.abs(B[J.L.thigh].getWorldPosition(new THREE.Vector3()).x - hips.x);
  }

  let lean = t.lean;          // the lean in use this frame
  let baseLean = t.lean;      // the calibrated seated lean: ride() blends around this
  let calibrated = false;
  let reach = 0;
  /** angle of the chest (shoulder midpoint) from the hips, in radians from vertical */
  function chestLean() {
    const hips = B.Hips_01.getWorldPosition(new THREE.Vector3());
    const a = B[J.L.arm].getWorldPosition(new THREE.Vector3());
    const b = B[J.R.arm].getWorldPosition(new THREE.Vector3());
    const chest = a.add(b).multiplyScalar(0.5);
    const up = chest.sub(hips).normalize();
    return Math.acos(Math.min(1, Math.abs(up.y)));
  }

  /** Rebuild the whole riding pose from the bind pose.
   *  @param {number} [leanOverride] torso lean in radians
   *  @param {number} [rollOverride] extra roll about the bike's forward axis (rad)
   *  @param {number} [mix] 0 = standing beside the bike, 1 = fully seated. Used for mount/dismount. */
  function update(leanOverride, rollOverride, mix) {
    if (typeof leanOverride === 'number') lean = leanOverride;
    else if (typeof t.lean === 'number' && !calibrated) lean = t.lean;
    reset();
    const seat = bikeGeom.seat;
    // sit on the nose of the saddle: the hips land where the surface actually is, not at the
    // saddle's deepest point (the bars are far enough forward that the arms cannot reach otherwise)
    const hipZ = seat.z + t.seatFwd;
    const surfaceY = surfaceAt(bikeGeom, hipZ);
    const pelvisTarget = new THREE.Vector3(seat.x, surfaceY + t.seatGap, hipZ);
    /* mount / dismount: the pelvis rises off the saddle and the whole body stands up. `mix` is
       smoothed by ride(), so this is only ever read as a 0..1 position along that path. */
    const m0 = typeof mix === 'number' ? Math.max(0, Math.min(1, mix)) : 1;
    const stand = 1 - m0;
    if (stand > 0.001) {
      // rise straight up out of the saddle and move out to the left of the bike
      pelvisTarget.y += stand * t.seatGapMount;
      pelvisTarget.x += stand * t.mountSide;
      pelvisTarget.z += stand * t.mountBack;
    }

    const liveLean = lean * m0;

    /* ---- 1. pelvis: put the hips on the saddle nose, then pitch the whole body forward ---- */
    const hips = B.Hips_01;
    hips.quaternion.copy(restQuat.get('Hips_01'));
    hips.position.copy(restPos.get('Hips_01'));
    hips.updateWorldMatrix(true, true);
    // slide the hips (in their parent's space) so the hip joint lands on the seating point
    const slide = pelvisTarget.clone().sub(hips.getWorldPosition(_a)).applyMatrix4(
      new THREE.Matrix4().copy(hips.parent.matrixWorld).invert().extractRotation(hips.parent.matrixWorld).invert(),
    );
    hips.position.add(slide);
    hips.updateWorldMatrix(true, true);
    // one rotation on the hips tips the entire body: this is the pose's main lever
    rotW(hips, X, liveLean);

    /* ---- 2. spine: a small extra curve so the back is not a straight plank ---- */
    SPINE.forEach((n, i) => rotW(B[n], X, liveLean * t.spineCurve * (i === 0 ? 0.20 : i === 1 ? 0.16 : 0.12)));

    /* ---- 2b. counter-roll: the bike lays into a turn, the rider's shoulders stay closer to
       upright, which is what stops a pillion-style "tipping over" look at low speed ---- */
    if (rollOverride) {
      const axisF = new THREE.Vector3(0, 0, 1);
      SPINE.forEach((n) => rotW(B[n], axisF, rollOverride * 0.5));
      rotW(B.Neck_05, axisF, rollOverride * 0.3);
      rotW(B.Head_08, axisF, rollOverride * 0.2);
    }

    /* ---- 3. neck / head: keep the eyes on the road instead of staring at the tank ---- */
    rotW(B.Neck_05, X, -liveLean * t.headLevel * 0.55);
    rotW(B.Head_08, X, -liveLean * t.headLevel * 0.45);

    /* ---- 4. legs: knee out and forward around the tank, ankle on the measured peg ---- */
    for (const s of SIDES) {
      const jd = J[s];
      const peg = bikeGeom.pegs.find((p) => Math.sign(p.x) === jd.out) || bikeGeom.pegs[0];
      const ankle = new THREE.Vector3(peg.x + jd.out * t.ankleOut, peg.y + t.ankleLift, peg.z);
      if (stand > 0.001) {
        // a standing foot: straight down under the hip, at the saddle gap's foot level
        const px = pelvisTarget.x + jd.out * restHipX;
        ankle.lerp(new THREE.Vector3(px, pelvisTarget.y - restLegLen, pelvisTarget.z + stand * 0.10), stand);
      }
      const hip = B[jd.thigh].getWorldPosition(new THREE.Vector3());
      const ankleW = g2w(ankle);
      const mid = hip.clone().add(ankleW).multiplyScalar(0.5);
      // The knee must lead OUT (away from the bike's centre line) and forward, not inboard.
      // The pole is measured from the hip->ankle axis so it is independent of how far the
      // ankle ends up; `kneeOut`/`kneeFwd` are in metres of lateral/forward bias at the knee.
      const axis = ankleW.clone().sub(hip).normalize();
      // knees lead FORWARD and a little outboard, never splayed sideways
      const pole = new THREE.Vector3(jd.out * t.kneeOut, 0.08, t.kneeFwd).normalize();
      solveTwoBone(B[jd.thigh], B[jd.shin], B[jd.foot], ankleW, pole);
      rig.updateWorldMatrix(true, true);
      // foot flat on the peg, toes a touch down
      const footW = B[jd.foot].getWorldPosition(new THREE.Vector3());
      alignBoneAxis(B[jd.foot], 2, footW.add(new THREE.Vector3(0, -0.12, 1).normalize()));
      rig.updateWorldMatrix(true, true);
    }

    /* ---- 5. arms: elbows out, hands on the grips ---- */
    reach = 0;
    for (const s of SIDES) {
      const jd = J[s];
      const grip = bikeGeom.grips.find((g) => Math.sign(g.x) === jd.out) || bikeGeom.grips[s === 'L' ? 0 : 1];
      const palm = g2w(grip);
      const wrist = palm.clone().add(new THREE.Vector3(-jd.out * t.wristIn, t.wristUp, 0));
      if (stand > 0.001) {
        // arms hang by the sides while standing on the pegs / beside the bike
        const shNow = B[jd.arm].getWorldPosition(new THREE.Vector3());
        wrist.lerp(shNow.add(new THREE.Vector3(jd.out * 0.20, -restArmLen * 0.92, 0.02)), stand);
      }
      const sh = B[jd.arm].getWorldPosition(new THREE.Vector3());
      reach = Math.max(reach, sh.distanceTo(wrist) / (restArmLen || 1));
      const pole = new THREE.Vector3(jd.out * t.elbowOut, -t.elbowDown, -0.15).normalize();
      solveTwoBone(B[jd.arm], B[jd.fore], B[jd.hand], wrist, pole);
      rig.updateWorldMatrix(true, true);
      // hand around the bar: fingers curl, thumb closes over the top
      for (const [finger, chain] of Object.entries(FINGERS[s])) {
        const curl = (finger === 'Thumb' ? t.thumbCurl : t.fingerCurl) * (0.18 + 0.82 * m0);
        for (const b of chain) if (B[b]) rotW(B[b], X, curl * (finger === 'Thumb' ? 0.6 : 1));
      }
      rig.updateWorldMatrix(true, true);
    }
    return { lean, reach };
  }

  /**
   * Pick the seated lean. The calibrated default (`t.lean`) is the value verified against the real
   * bobber, so it is used as-is; the search below only runs if that lean cannot reach the bars at
   * all (a different bike, or a model with shorter arms). The previous version always searched
   * from 0.20 rad, which silently replaced the verified pose with a badly-stretched one.
   */
  function calibrate(over = {}) {
    Object.assign(t, over);
    update(t.lean, 0, 1);
    if (reach <= 0.985) { baseLean = t.lean; lean = t.lean; calibrated = true; return { lean, reach }; }
    let best = { score: Infinity, lean: t.lean, reach };
    for (let cand = t.lean; cand <= 0.85; cand += 0.02) {
      update(cand, 0, 1);
      const score = Math.abs(reach - 0.94) + Math.max(0, reach - 0.985) * 20;
      if (score < best.score - 1e-9) best = { score, lean: cand, reach };
      if (reach <= 0.985) break;              // first lean that reaches: no need to go further
    }
    lean = best.lean; baseLean = best.lean; calibrated = true;
    update(lean, 0, 1);
    return { lean, reach };
  }

  /**
   * How much saddle is actually under the rider (0..1): the share of the surface directly below
   * the pelvis that is within a hand's width of the seating height. Sitting on the saddle nose
   * of a long bike scores low; hovering in front of the tank scores ~0.
   */
  function seatContact() {
    const prof = bikeGeom.profile;
    if (!prof || !prof.length) return 0.5;
    const hip = B.Hips_01.getWorldPosition(new THREE.Vector3());
    const hipG = w2g(hip);
    const under = prof.filter((p) => Math.abs(p.z - hipG.z) <= 0.16);
    if (!under.length) return 0;
    const low = Math.min(...under.map((p) => p.y));
    const contact = under.filter((p) => p.y <= low + 0.05).length / under.length;
    const behind = prof.some((p) => p.z < hipG.z - 0.02 && p.y <= hipG.y);
    return Math.min(1, contact + (behind ? 0.15 : 0));
  }

  /** Pose for a candidate seating position without committing to it; returns the strain figures. */
  function trial(over = {}) {
    const save = { ...t }, saveLean = lean;
    Object.assign(t, over);
    update(over.lean);
    const hip = B.Hips_01.getWorldPosition(new THREE.Vector3());
    const hipG = w2g(hip);
    const grip = bikeGeom.grips.find((g) => Math.sign(g.x) === 1) || bikeGeom.grips[0];
    const peg = bikeGeom.pegs.find((p) => Math.sign(p.x) === 1) || bikeGeom.pegs[0];
    const sh = B[J.R.arm].getWorldPosition(new THREE.Vector3());
    const arm = sh.distanceTo(g2w(grip)) / (restArmLen || 1);
    const chest = chestLean();
    const ankle = new THREE.Vector3(peg.x + J.R.out * t.ankleOut, peg.y + t.ankleLift, peg.z);
    const leg = hip.clone().add(new THREE.Vector3(J.R.out * 0.072, -0.01, 0.014)).distanceTo(g2w(ankle)) / (restLegLen || 1);
    Object.assign(t, save); lean = saveLean;
    return { arm, leg, hip: hipG, chest };
  }

  /** commit tuning values (used after a search outside this module) */
  function setTune(over = {}) { Object.assign(t, over); if (typeof over.lean === 'number') { lean = over.lean; baseLean = over.lean; } calibrated = true; return t; }

  /* ------------------------------------------------------------------ live riding */

  /**
   * The pose the game actually plays each frame: the verified static seated pose plus a small,
   * damped amount of motion. Everything here is additive on top of `update()`, so the verified
   * contact (hands on grips, feet on pegs, hips on saddle) never changes.
   *
   * @param {number} dt      seconds
   * @param {{speed:number, accel:number, roll:number, steer:number, mix:number}} m
   *        speed  m/s · accel m/s^2 · roll the bike's current lean (rad) · steer (rad)
   *        mix 0..1 how far into the riding pose we are (mount/dismount blend)
   */
  function ride(dt, m) {
    if (!t._mounted) { reset(); t._mounted = true; t._mix = 0; t._smSpeed = 0; t._smAccel = 0; }
    const target = Math.max(0, Math.min(1, m.mix === undefined ? 1 : m.mix));
    // smooth the blend so a mount/dismount never snaps
    const k = 1 - Math.exp(-t.blendRate * Math.max(0, Math.min(0.1, dt)));
    t._mix = t._mix === undefined ? target : t._mix + (target - t._mix) * k;
    // smooth speed and acceleration: the bike's own numbers are noisy frame to frame
    const a = 1 - Math.exp(-6 * Math.max(0, Math.min(0.1, dt)));
    t._smSpeed += ((m.speed || 0) - t._smSpeed) * a;
    t._smAccel += ((m.accel || 0) - t._smAccel) * a;

    /* speed: tuck down progressively (never more than `speedLean`), 0 at a standstill */
    const speedF = Math.min(1, Math.abs(t._smSpeed) / 22);
    const tuck = t.speedLean * speedF * speedF;
    /* going faster tucks you down, and that must dominate. The weight shift under acceleration is
       real but small: an earlier version allowed -0.18 rad here, which cancelled the whole speed
       tuck and made the rider sit UP as he accelerated. It is now capped well below the tuck. */
    const accel = Math.max(-9, Math.min(9, t._smAccel));
    const brace = Math.max(-t.braceMax, Math.min(t.braceMax, -accel * t.accelLean));
    /* a turn rolls the whole bike (the rider is parented to it); the rider's spine gives back a
       fraction of that so his head stays nearer level instead of being thrown sideways */
    const roll = (m.roll || 0) * -t.headHold * (1 - 0.55 * speedF);

    const live = baseLean + tuck + brace;
    /* Rebuilding costs ~0.3 ms of CPU, so skip it when the inputs would not visibly change the
       pose. A seated rider at a steady speed then costs nothing, which is most of the time. */
    const mixNow = t._mix;
    if (!t._drawn || Math.abs(live - t._drawnLean) > 0.008 || Math.abs(roll - t._drawnRoll) > 0.008
        || Math.abs(mixNow - t._drawnMix) > 0.004) {
      update(live, roll, mixNow);
      t._drawnLean = live; t._drawnRoll = roll; t._drawnMix = mixNow; t._drawn = true;
    }
    return t._mix;
  }

  /** drop back to the neutral state (called when the rider is removed) */
  function unmount() { t._mounted = false; t._mix = 0; t._drawn = false; }

  return { ok: true, update, calibrate, reach: () => reach, bones: B, tune: t, trial, seatContact, setTune,
    leanNow: () => lean, ride, unmount, chestLean };
}
