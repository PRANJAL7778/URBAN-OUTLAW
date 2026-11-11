/* EXPERIMENT ONLY — not used by the game.
 *
 * Pulls the bobber's handlebar cluster back towards the saddle. It exists to answer one
 * question: would moving the bars (rather than distorting the rider's arms) give a better
 * riding pose? The conclusion was NO — the pose reads correctly on the original geometry
 * (see docs/rider_preview/rider_pose_preview.png), so the bike is left untouched and this
 * file is not imported anywhere in src/.
 *
 * Kept because the measurement technique (mesh-island bbox in bike space) is reusable.
 */
import * as THREE from 'three';

/**
 * Pull the handlebar cluster back towards the saddle so the rider can actually reach it.
 *
 * The bobber's bars sit ~0.85 m in front of the saddle at hip height — farther than a human arm
 * can reach, which is why a correctly seated rider ends up lying along the tank. Moving the BARS
 * (not the rider's arms) fixes it and reads as an ordinary aftermarket bar swap on a custom bike.
 *
 * The bar assembly is the widest mesh island inside the steering node. Its vertices are pushed
 * along the bike's -Z; the levers that belong to the same island come along with it.
 *
 * @param {THREE.Object3D} fork       the steering node inside the bike model
 * @param {THREE.Object3D} bikeRoot   the group the pose works in (defines "back")
 * @param {number} back               metres to move the bars towards the rider
 * @returns {{moved: number, from: THREE.Vector3|null}}
 */
export function setbackBars(fork, bikeRoot, back = 0.18) {
  if (!fork || !back) return { moved: 0, from: null };
  bikeRoot.updateMatrixWorld(true);
  const toBike = (v) => v.clone().applyMatrix4(new THREE.Matrix4().copy(bikeRoot.matrixWorld).invert());
  const v = new THREE.Vector3();
  let moved = 0, from = null;

  fork.traverse((/** @type {any} */ o) => {
    if (!o.isMesh || o.isSkinnedMesh || moved) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = pos.count;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const tris = idx ? idx.count / 3 : n / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      uni(i0, i1); uni(i1, i2);
    }
    // one pass: bounding box per island in bike space
    const islands = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const bw = toBike(v);
      const cur = islands.get(r);
      if (!cur) islands.set(r, { lo: bw.clone(), hi: bw.clone() });
      else { cur.lo.min(bw); cur.hi.max(bw); }
    }
    let best = null, bestRoot = -1;
    for (const [r, b] of islands) {
      if (!best || (b.hi.x - b.lo.x) > (best.hi.x - best.lo.x)) { best = b; bestRoot = r; }
    }
    // only the bar assembly: wide, and high up on the fork
    if (!best || (best.hi.x - best.lo.x) < 0.55 || best.lo.y < 0.55) return;
    from = new THREE.Vector3(0, (best.lo.y + best.hi.y) / 2, (best.lo.z + best.hi.z) / 2);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().copy(o.matrixWorld).invert()).normalize();
    for (let i = 0; i < n; i++) {
      if (find(i) !== bestRoot) continue;
      pos.setXYZ(i, pos.getX(i) + dir.x * back, pos.getY(i) + dir.y * back, pos.getZ(i) + dir.z * back);
    }
    pos.needsUpdate = true;
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
    moved = back;
  });
  bikeRoot.updateMatrixWorld(true);
  return { moved, from };
}

