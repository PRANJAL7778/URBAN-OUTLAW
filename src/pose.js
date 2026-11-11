/* Procedural posing for Urban Outlaw.
   Both jobs are driven by measurements taken from the real models — no guessed constants:

   1. measureBike()   reads seat, handlebar grips (in fork space, so they steer) and foot pegs
                      out of the bike model itself.
   2. createRiderPose seats the rider: pelvis on the seat, hands solved onto the grips, feet on
                      the pegs, torso lean calibrated so the arms actually reach the bars.
   3. createHeroPose  replaces the ragdoll's arm output on the walking hero with a clean, damped
                      swing expressed as fractions of each arm's own length (the supplied scan
                      rig has a 0.50 m left arm and a 0.56 m right arm).

   Uses src/ik.js; allocates nothing per frame after construction. */
import * as THREE from 'three';
import { aimBone, solveTwoBone, twistBone, alignBoneAxis, setAxisAngleWorld, bonesOf } from './ik.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _side = new THREE.Vector3();
const _target = new THREE.Vector3(), _pole = new THREE.Vector3(), _dir = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();

/* Hero arm poses per state. Distances are fractions of that arm's own length. */
/** palm length as a fraction of the whole arm (the hand BONE sits at the wrist) */
const HAND_FRAC = 0.165;

const HERO_POSE = {
  idle:   { swing: 0.030, forward: 0.090, out: 0.220, drop: 0.860, rate: 1.4 },
  run:    { swing: 0.360, forward: 0.060, out: 0.240, drop: 0.700, rate: 7.0 },
  sprint: { swing: 0.560, forward: 0.110, out: 0.265, drop: 0.620, rate: 8.8 },
  air:    { swing: 0.000, forward: 0.300, out: 0.340, drop: 0.700, rate: 3.0 },   // both arms up: no alternation in the air
};

/* ------------------------------------------------------------------ measuring */

/** Every mesh under `obj`, vertex positions expressed in `root`'s local space. */
function vertsIn(/** @type {THREE.Object3D} */ obj, /** @type {THREE.Object3D} */ root) {
  const out = [];
  const m = new THREE.Matrix4(), inv = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  obj.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (!mesh.isMesh || !mesh.geometry || !mesh.geometry.attributes.position) return;
    m.copy(inv).multiply(mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  return out;
}

/**
 * @param {THREE.Object3D} inner the bike model inside the wrap group
 * @returns {{fork:THREE.Object3D|null, inner:THREE.Object3D, gripsFork:THREE.Vector3[],
 *            pegsInner:THREE.Vector3[], seatInner:THREE.Vector3, ok:boolean}}
 */
export function measureBike(inner) {
  const fork = inner.getObjectByName('fork') || null;
  const out = { fork, inner, gripsFork: [], pegsInner: [], seatInner: new THREE.Vector3(), ok: false };
  inner.updateWorldMatrix(true, false);

  const toFork = (/** @type {THREE.Vector3} */ p) => {
    if (!fork) return p.clone();
    fork.updateWorldMatrix(true, false);
    return fork.worldToLocal(p.clone().applyMatrix4(inner.matrixWorld));
  };
  const outer = (/** @type {THREE.Vector3[]} */ g, /** @type {number} */ n) => {
    g.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const use = g.slice(0, Math.min(n, g.length));
    const c = new THREE.Vector3();
    for (const p of use) c.add(p);
    return c.multiplyScalar(1 / use.length);
  };

  /* grips: widest points of the fork's upper half, measured in the model's own space
     (the fork node itself is rotated, so its own frame is not axis-aligned) */
  if (fork) {
    const fv = vertsIn(fork, inner);
    const fb = new THREE.Box3(); for (const p of fv) fb.expandByPoint(p);
    const fy = fb.min.y + (fb.max.y - fb.min.y) * 0.62;
    const fz = Math.max(Math.abs(fb.min.z), Math.abs(fb.max.z));
    const band = fv.filter((p) => p.y >= fy && Math.abs(p.z) > fz * 0.72);
    const pos = band.filter((p) => p.z > 0), neg = band.filter((p) => p.z < 0);
    if (pos.length >= 3 && neg.length >= 3) out.gripsFork.push(toFork(outer(pos, 12)), toFork(outer(neg, 12)));
  }
  if (out.gripsFork.length !== 2) {
    const box = new THREE.Box3(); for (const p of vertsIn(inner, inner)) box.expandByPoint(p);
    const s = box.getSize(new THREE.Vector3());
    out.gripsFork.push(toFork(new THREE.Vector3(box.min.x + s.x * 0.16, box.min.y + s.y * 0.86, s.z * 0.5)),
      toFork(new THREE.Vector3(box.min.x + s.x * 0.16, box.min.y + s.y * 0.86, -s.z * 0.5)));
  }

  const bv = vertsIn(inner, inner);
  const bb = new THREE.Box3(); for (const p of bv) bb.expandByPoint(p);
  const size = bb.getSize(new THREE.Vector3());
  const zmax = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z));

  /* pegs: widest, mirror-symmetric points in the lower half */
  {
    const low = bv.filter((p) => p.y <= bb.min.y + size.y * 0.46 && Math.abs(p.z) > zmax * 0.60);
    const pr = outer(low.filter((p) => p.z > 0), 10), pl = outer(low.filter((p) => p.z < 0), 10);
    const mirrored = Math.abs(pr.x - pl.x) < 0.06 && Math.abs(pr.y - pl.y) < 0.06;
    if (low.filter((p) => p.z > 0).length >= 3 && low.filter((p) => p.z < 0).length >= 3 && mirrored) out.pegsInner.push(pr, pl);
    else out.pegsInner.push(
      new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y + size.y * 0.3, zmax * 0.55),
      new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y + size.y * 0.3, -zmax * 0.55));
  }

  /* seat: 40% of the wheelbase behind the front axle, at the top surface there */
  {
    const inv = new THREE.Matrix4().copy(inner.matrixWorld).invert();
    const centre = (/** @type {string} */ n) => {
      const o = inner.getObjectByName(n);
      return o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : null;
    };
    const fw = centre('frontWheel'), rw = centre('rearWheel');
    const frontX = fw ? fw.x : bb.min.x, rearX = rw ? rw.x : bb.max.x;
    const seatX = frontX + (rearX - frontX) * 0.40;
    const tol = Math.max(0.04, Math.abs(rearX - frontX) * 0.09);
    const near = bv.filter((p) => Math.abs(p.x - seatX) < tol && Math.abs(p.z) < zmax * 0.5);
    let top = -Infinity;
    for (const p of near) top = Math.max(top, p.y);
    out.seatInner.set(seatX, Number.isFinite(top) ? top : bb.max.y - size.y * 0.06, 0);
  }
  out.ok = out.gripsFork.length === 2;
  return out;
}

/* ------------------------------------------------------------------ rider */

/**
 * @param {THREE.Object3D} rider a fresh clone with its own skeleton
 * @param {ReturnType<typeof measureBike>} bike
 * @param {THREE.Object3D} tilt the bike's tilt group (the rider's parent)
 */
export function createRiderPose(rider, bike, tilt) {

  const B = bonesOf(rider);
  const need = ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
  const missing = need.filter((n) => !B[n]);
  if (missing.length) return { ok: false, missing, update() {}, calibrate() {}, lean: 0, stretch: 1 };

  const bind = new Map(need.map((n) => [n, B[n].quaternion.clone()]));
  const bindScale = new Map(need.map((n) => [n, B[n].scale.clone()]));
  const restore = (/** @type {string[]} */ names) => { for (const n of names) { B[n].quaternion.copy(bind.get(n)); B[n].scale.copy(bindScale.get(n)); } };
  const TORSO = ['spine', 'chest', 'head'];
  const ARM_L = ['leftUpperArm', 'leftLowerArm', 'leftHand'];
  const ARM_R = ['rightUpperArm', 'rightLowerArm', 'rightHand'];
  const grips = [new THREE.Vector3(), new THREE.Vector3()];
  const pegs = [new THREE.Vector3(), new THREE.Vector3()];
  const seatNow = new THREE.Vector3();
  const api = { ok: true, bones: B, grips, pegs, lean: 0, stretch: 1, handFrac: HAND_FRAC, update(/** @type {any} */ tune) {}, calibrate(/** @type {any} */ tune) {} };

  const innerToTilt = (/** @type {THREE.Vector3} */ src, /** @type {THREE.Vector3} */ dst) => {
    if (!bike.inner) return dst.copy(src);
    bike.inner.updateWorldMatrix(true, false);
    return tilt.worldToLocal(dst.copy(src).applyMatrix4(bike.inner.matrixWorld));
  };

  function frames() {
    tilt.getWorldQuaternion(_q);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _side.set(1, 0, 0).applyQuaternion(_q);
  }

  function gripsNow() {
    if (!bike.fork) { for (let i = 0; i < 2; i++) grips[i].copy(bike.gripsFork[i]); return; }
    bike.fork.updateWorldMatrix(true, false);
    for (let i = 0; i < 2; i++) {
      grips[i].copy(bike.gripsFork[i]).applyMatrix4(bike.fork.matrixWorld);
      tilt.worldToLocal(grips[i]);
    }
  }

  /** torso lean + both arms; returns the worst stretch factor needed (1 = reaches without help) */
  function poseUpper(/** @type {number} */ lean, /** @type {{elbowOut:number, handRoll:number}} */ tune) {
    restore(TORSO); restore(ARM_L); restore(ARM_R);
    rider.updateMatrixWorld(true);
    setAxisAngleWorld(B['spine'], _side, lean);
    setAxisAngleWorld(B['chest'], _side, lean * 0.35);
    if (tune.steer) { setAxisAngleWorld(B['hips'], _up, tune.steer * 0.32); setAxisAngleWorld(B['chest'], _up, tune.steer * 0.95); }  // shoulders follow the bars
    setAxisAngleWorld(B['head'], _side, -lean * 0.80);      // eyes stay on the road
    rider.updateMatrixWorld(true);
    gripsNow();
    let worst = 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'left' : 'right';
      const side = s === 'left' ? 1 : -1;
      const Sw = B[s + 'UpperArm'].getWorldPosition(_a);
      const arm = Sw.distanceTo(B[s + 'LowerArm'].getWorldPosition(_b)) + B[s + 'LowerArm'].getWorldPosition(_b).distanceTo(B[s + 'Hand'].getWorldPosition(_c));
      // the wrist sits inboard of the bar by roughly half a palm; the fingers wrap outward around it
      const handLen = arm * HAND_FRAC;
      _target.copy(grips[i]).addScaledVector(_side, -side * handLen * 0.55);
      const need = THREE.MathUtils.clamp(Sw.distanceTo(_target) / (arm * 0.985), 1, 1.09);
      worst = Math.max(worst, need);
      // if the bar is out of reach (short left arm / full lock) extend the arm slightly instead of
      // letting the hand float off the grip — capped at 9% so the limb never looks stretched
      if (need > 1.0005) {
        B[s + 'UpperArm'].scale.multiplyScalar(need);
        B[s + 'UpperArm'].updateWorldMatrix(false, true);
      }
      _pole.copy(_side).multiplyScalar(side * tune.elbowOut).addScaledVector(_up, -0.6).addScaledVector(_fwd, -0.15).normalize();
      solveTwoBone(B[s + 'UpperArm'], B[s + 'LowerArm'], B[s + 'Hand'], _target, _pole);
      alignBoneAxis(B[s + 'Hand'], 1, _target.copy(_side).multiplyScalar(side));   // fingers across the grip
      twistBone(B[s + 'Hand'], B[s + 'Hand'], tune.handRoll * side);
    }
    return worst;
  }

  /** find the smallest forward lean at which both arms reach the bars */
  api.calibrate = (/** @type {any} */ tune) => {
    api.lean = tune.lean || 0;
    api.update(tune);                       // seat the rider first, then measure the real reach
    let lean = api.lean, stretch = 1.09;
    for (let i = 0; i < 22; i++) {
      stretch = poseUpper(lean, tune);
      if (stretch <= 1.055) break;      // low bars: allow ≤5.5% arm extension rather than a 60° tuck
      lean += 0.030;
    }
    api.lean = lean;
    api.stretch = stretch;
    api.update(tune);
    return lean;
  };

  /** measure-only pass (no posing) so `deficit` reflects the final rig */
  function position(/** @type {number} */ lean, /** @type {any} */ tune) {
    frames();
    gripsNow();
    let worst = 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'left' : 'right';
      const Sw = B[s + 'UpperArm'].getWorldPosition(_a);
      const arm = Sw.distanceTo(B[s + 'LowerArm'].getWorldPosition(_b)) + B[s + 'LowerArm'].getWorldPosition(_b).distanceTo(B[s + 'Hand'].getWorldPosition(_c));
      worst = Math.max(worst, Sw.distanceTo(grips[i]) - arm * 0.97 - arm * HAND_FRAC * 0.6);
    }
    return worst;
  }

  api.update = (/** @type {any} */ tune) => {
    for (const n of need) { B[n].quaternion.copy(bind.get(n)); B[n].scale.copy(bindScale.get(n)); }
    rider.updateMatrixWorld(true);
    frames();
    for (let i = 0; i < 2; i++) innerToTilt(bike.pegsInner[i] || new THREE.Vector3(), pegs[i]);
    innerToTilt(bike.seatInner, seatNow);

    /* pelvis onto the seat first, so every limb is then solved in its final place */
    /* the pelvis sits a little forward of the seat centre — that is how a rider actually sits on a bobber */
    rider.position.add(_b.copy(seatNow).addScaledVector(_up, tune.hipLift).addScaledVector(_fwd, tune.seatShift || 0)
      .sub(tilt.worldToLocal(B['hips'].getWorldPosition(_a).clone())));
    rider.updateMatrixWorld(true);

    /* legs: ankle just above each peg, sole resting on it */
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'left' : 'right';
      _pole.copy(_side).multiplyScalar(s === 'left' ? 1 : -1).addScaledVector(_fwd, 0.55).addScaledVector(_up, 0.1).normalize();
      _target.copy(pegs[i]).addScaledVector(_up, tune.ankleLift);
      solveTwoBone(B[s + 'UpperLeg'], B[s + 'LowerLeg'], B[s + 'Foot'], _target, _pole);
      aimBone(B[s + 'LowerLeg'], B[s + 'Foot'], _target);
    }

    poseUpper(api.lean || tune.lean || 0, tune);
    return grips;
  };

  return api;
}

/* ------------------------------------------------------------------ hero */

/**
 * Bone aliases for the arms and head, so the hero pose works on any humanoid rig in the game.
 * The ragdoll accepts several character models and keeps their own bone names: the V2 scan uses
 * `leftUpperArm`, the MetaHuman-style suit rig uses `LeftArm_013`. Resolving through aliases means
 * the walk never silently loses its arm animation when the character model is swapped.
 */
const HERO_ALIASES = {
  hips: ['hips', 'Hips_01'],
  head: ['head', 'Head_08'],
  leftUpperArm: ['leftUpperArm', 'LeftArm_013'],
  leftLowerArm: ['leftLowerArm', 'LeftForeArm_014'],
  leftHand: ['leftHand', 'LeftHand_017'],
  rightUpperArm: ['rightUpperArm', 'RightArm_039'],
  rightLowerArm: ['rightLowerArm', 'RightForeArm_040'],
  rightHand: ['rightHand', 'RightHand_043'],
};

/**
 * @param {THREE.Object3D} model the 'ragdoll-model' object
 * @param {any} hero ragdoll character
 * @param {{swing:number, out:number, handRoll:number}} tune
 */
export function createHeroPose(model, hero, tune) {
  const all = bonesOf(model);
  /** @type {Record<string, THREE.Bone>} */ const B = {};
  let missing = false;
  for (const [key, names] of Object.entries(HERO_ALIASES)) {
    const found = names.map((n) => all[n]).find(Boolean);
    if (found) B[key] = found; else missing = true;
  }
  if (missing) return { ok: false, update() {} };
  let phase = 0;
  const SIDES = [{ s: 'left', sign: 1 }, { s: 'right', sign: -1 }];
  const S = new THREE.Vector3(), E = new THREE.Vector3(), Hd = new THREE.Vector3();

  return {
    ok: true,
    /** @param {number} dt */
    update(dt) {
      const st = hero.state;
      const key = st === 'run' || st === 'sprint' ? st : (st === 'jump' || st === 'fall') ? 'air' : 'idle';
      const p = HERO_POSE[key];
      const speed = Math.abs(hero.speed || 0);
      phase += dt * (key === 'run' || key === 'sprint' ? p.rate + speed * 0.32 : p.rate);
      const swing = (key === 'air' ? 0 : Math.sin(phase)) * p.swing * tune.swing;

      B['hips'].getWorldPosition(_a);
      B['head'].getWorldPosition(_b);
      _up.copy(_b).sub(_a).normalize();
      _fwd.set(Math.sin(hero.facing), 0, Math.cos(hero.facing)).normalize();
      _side.crossVectors(_up, _fwd).normalize();      // +x = the model's left (measured on this rig)

      for (const { s, sign } of SIDES) {
        B[s + 'UpperArm'].getWorldPosition(S);
        B[s + 'LowerArm'].getWorldPosition(E);
        B[s + 'Hand'].getWorldPosition(Hd);
        const arm = S.distanceTo(E) + E.distanceTo(Hd);
        // every offset is a fraction of this arm's own length → both arms behave identically
        _target.copy(S)
          .addScaledVector(_fwd, arm * (p.forward + swing * sign))
          .addScaledVector(_side, sign * arm * p.out * tune.out)
          .addScaledVector(_up, -arm * p.drop);
        _dir.copy(_target).sub(S);
        const d = THREE.MathUtils.clamp(_dir.length(), arm * 0.42, arm * 0.985);
        _dir.normalize();
        _target.copy(S).addScaledVector(_dir, d);

        _pole.copy(_fwd).multiplyScalar(-0.55).addScaledVector(_side, sign * 0.9).addScaledVector(_up, -0.12).normalize();
        solveTwoBone(B[s + 'UpperArm'], B[s + 'LowerArm'], B[s + 'Hand'], _target, _pole);

        B[s + 'LowerArm'].getWorldPosition(_a);
        B[s + 'Hand'].getWorldPosition(_b);
        _dir.copy(_b).sub(_a).normalize();
        alignBoneAxis(B[s + 'Hand'], 1, _dir);          // fingers continue the forearm
        twistBone(B[s + 'Hand'], B[s + 'Hand'], sign * tune.handRoll);
      }
      return key;
    },
  };
}
