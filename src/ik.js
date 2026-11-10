/* Minimal 2-bone IK + bone aiming for Urban Outlaw.
   Used by pose.js for the hero's arms and for seating the rider on the bobber with hands on the grips.
   Pure maths on Object3D/Bone — no per-frame allocations, no dependency beyond three. */
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _dir = new THREE.Vector3(), _axis = new THREE.Vector3(), _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion(), _pqInv = new THREE.Quaternion(), _local = new THREE.Quaternion();
const _perp = new THREE.Vector3(), _elbow = new THREE.Vector3(), _tmp = new THREE.Vector3();

/** Apply a world-space delta rotation to a bone, converted into its parent's space. */
function applyWorldDelta(/** @type {THREE.Bone} */ bone, /** @type {THREE.Quaternion} */ qWorld) {
  if (!bone.parent) { bone.quaternion.premultiply(qWorld); return; }
  bone.parent.getWorldQuaternion(_pq);
  _pqInv.copy(_pq).invert();
  _local.copy(_pqInv).multiply(qWorld).multiply(_pq);
  bone.quaternion.premultiply(_local);
  bone.updateWorldMatrix(false, true);
}

/** Rotate `bone` in world space so the direction bone→child matches `target` (world point). */
export function aimBone(/** @type {THREE.Bone} */ bone, /** @type {THREE.Bone} */ child, /** @type {THREE.Vector3} */ target) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _dir.copy(_b).sub(_a);
  _c.copy(target).sub(_a);
  if (_dir.lengthSq() < 1e-10 || _c.lengthSq() < 1e-10) return;
  _dir.normalize(); _c.normalize();
  _q.setFromUnitVectors(_dir, _c);
  applyWorldDelta(bone, _q);
}

/** Roll a bone about its own length axis (world-space) — fixes a twisted forearm/hand. */
export function twistBone(/** @type {THREE.Bone} */ bone, /** @type {THREE.Bone} */ child, /** @type {number} */ angle) {
  if (!angle) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  _axis.copy(_b).sub(_a);
  if (_axis.lengthSq() < 1e-10) return;
  _axis.normalize();
  _q.setFromAxisAngle(_axis, angle);
  applyWorldDelta(bone, _q);
}

/** Apply a world axis/angle rotation to a bone. */
export function setAxisAngleWorld(/** @type {THREE.Bone} */ bone, /** @type {THREE.Vector3} */ axisWorld, /** @type {number} */ angle) {
  if (!angle) return;
  _q.setFromAxisAngle(axisWorld, angle);
  applyWorldDelta(bone, _q);
}

/** Bend a two-bone chain so its tip reaches `target`; the middle joint is pushed toward `pole`. */
export function solveTwoBone(
  /** @type {THREE.Bone} */ upper, /** @type {THREE.Bone} */ lower, /** @type {THREE.Bone} */ end,
  /** @type {THREE.Vector3} */ target, /** @type {THREE.Vector3} */ pole
) {
  upper.updateWorldMatrix(true, false);
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  if (l1 < 1e-4 || l2 < 1e-4) return;
  _dir.copy(target).sub(_a);
  let d = _dir.length();
  if (d < 1e-5) return;
  _dir.normalize();
  const min = Math.abs(l1 - l2) + 1e-3, max = (l1 + l2) * 0.999;
  d = Math.min(max, Math.max(min, d));
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _axis.crossVectors(_dir, pole);
  if (_axis.lengthSq() < 1e-8) _axis.set(0, 0, 1);
  _axis.normalize();
  _perp.crossVectors(_axis, _dir);                       // unit, points toward the pole
  _elbow.copy(_a).addScaledVector(_dir, l1 * cosA).addScaledVector(_perp, l1 * sinA);
  aimBone(upper, lower, _elbow);
  // re-read the (now moved) elbow so the forearm aims from the real position
  aimBone(lower, end, target);
}

/** Align a bone's local axis (0=x, 1=y, 2=z) with a world direction — hand around a handlebar grip. */
export function alignBoneAxis(/** @type {THREE.Bone} */ bone, /** @type {number} */ localAxis, /** @type {THREE.Vector3} */ worldDir) {
  bone.updateWorldMatrix(true, false);
  _tmp.set(localAxis === 0 ? 1 : 0, localAxis === 1 ? 1 : 0, localAxis === 2 ? 1 : 0)
    .applyQuaternion(bone.getWorldQuaternion(_pq)).normalize();
  _dir.copy(worldDir);
  if (_dir.lengthSq() < 1e-10) return;
  _dir.normalize();
  _q.setFromUnitVectors(_tmp, _dir);
  applyWorldDelta(bone, _q);
}

/** Bone lookup map from any object (name → Bone). */
export function bonesOf(/** @type {THREE.Object3D} */ root) {
  /** @type {Record<string, THREE.Bone>} */ const map = {};
  root.traverse((o) => { if (/** @type {THREE.Bone} */ (o).isBone) map[o.name] = /** @type {THREE.Bone} */ (o); });
  return map;
}
