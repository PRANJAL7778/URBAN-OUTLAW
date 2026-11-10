import * as THREE from 'three';
import RAGDOLL from 'ragdoll';

/* Maps the uploaded "characterrigged" skeleton (generic Bone/Bone001... names, one trunk bone, T-pose) onto the
   humanoid names RAGDOLL.create({ model }) looks for. It works on a COPY: the GLB file is never changed.
   Bone world transforms are preserved (attach), so the skin is not deformed. Returns null if the rig is not what we
   expect or the ragdoll still rejects it, and the caller keeps the boxy hero. */
const NAMES = {
  Bone001: 'hips', Bone: 'chest', Bone002: 'head',
  Bone005: 'leftUpperArm', Bone006: 'leftLowerArm', Bone007: 'leftHand',
  Bone004: 'rightUpperArm', Bone008: 'rightLowerArm', Bone009: 'rightHand',
  Bone013: 'leftUpperLeg', Bone014: 'leftLowerLeg', Bone016: 'leftFoot',
  Bone011: 'rightUpperLeg', Bone012: 'rightLowerLeg', Bone015: 'rightFoot',
};
/** @param {THREE.Object3D} source a fresh copy of the loaded model (MODELS.model(name).scene)
 *  @param {string} [tint] colour multiplied over the model's material (#ffffff = original) */
export function prepareCharacter(source, tint = '#ffffff', outfit = null) {
  /** @type {Record<string,THREE.Bone>} */ const byName = {};
  source.traverse(o => { if (/** @type {THREE.Bone} */ (o).isBone) byName[o.name] = /** @type {THREE.Bone} */ (o); });
  const missing = Object.keys(NAMES).filter(n => !byName[n]);
  if (missing.length) return { model: null, reason: 'unexpected rig, missing bones: ' + missing.join(', ') };
  source.updateMatrixWorld(true);
  const hips = byName.Bone001, chest = byName.Bone;
  const spine = new THREE.Bone(); spine.name = 'spine';
  hips.add(spine); spine.position.set(0, 0, 0); spine.updateMatrixWorld(true);
  spine.attach(chest);
  for (const [from, to] of Object.entries(NAMES)) byName[from].name = to;
  source.updateMatrixWorld(true);
  source.traverse(o => {
    const m = /** @type {THREE.Mesh} */ (o);
    if (!m.isMesh) return;
    m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    if (tint && tint.toLowerCase() !== '#ffffff' && !Array.isArray(m.material)) {
      m.material = m.material.clone(); /** @type {THREE.MeshStandardMaterial} */ (m.material).color.set(tint);
    }
  });
  let dressed = 'not dressed';
  if (outfit) { try { dressed = dress(source, outfit); } catch (error) { dressed = 'dressing failed: ' + (/** @type {Error} */ (error)).message; console.warn('[character] could not dress the model, keeping the plain mannequin:', error); } }
  const info = RAGDOLL.inspectModel(source);
  if (!info.ok) return { model: null, reason: 'ragdoll rejected the rig: ' + (info.error || 'unknown') };
  return { model: source, reason: '', info, dressed };
}

/** Colour zones for the clothing, painted per vertex from the skin weights of a COPY of the geometry (the GLB is untouched). */
/** @param {THREE.Object3D} source @param {Record<string,string>} o */
function dress(source, o) {
  /** @type {THREE.SkinnedMesh|null} */ let sm = null;
  source.traverse(n => { if (/** @type {THREE.SkinnedMesh} */ (n).isSkinnedMesh) sm = /** @type {THREE.SkinnedMesh} */ (n); });
  if (!sm) return 'no skinned mesh found';
  const geo = sm.geometry = sm.geometry.clone();
  const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, n = P.count, bones = sm.skeleton.bones;
  /** @type {Record<string,{minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number}>} */ const ext = {};
  const dom = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
    dom[i] = best;
    const nm = bones[best].name, x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const e = ext[nm] || (ext[nm] = { minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z });
    e.minX = Math.min(e.minX, x); e.maxX = Math.max(e.maxX, x); e.minY = Math.min(e.minY, y); e.maxY = Math.max(e.maxY, y); e.minZ = Math.min(e.minZ, z); e.maxZ = Math.max(e.maxZ, z);
  }
  geo.computeBoundingBox();
  const bb = /** @type {THREE.Box3} */ (geo.boundingBox), hemY = bb.min.y + (bb.max.y - bb.min.y) * 0.525;
  const hoodie = new THREE.Color(o.hoodie), hoodieDark = hoodie.clone().multiplyScalar(0.72), pants = new THREE.Color(o.pants), pantsDark = pants.clone().multiplyScalar(0.78);
  const skin = new THREE.Color(o.skin), hair = new THREE.Color(o.hair), shoe = new THREE.Color(o.shoes), sole = new THREE.Color('#3a3d44');
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const nm = bones[dom[i]].name, e = ext[nm], x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let c = skin;
    if (nm === 'head') {
      const zc = (e.minZ + e.maxZ) / 2, half = (e.maxZ - e.minZ) / 2;
      if (y < e.minY + 0.55) c = skin;
      else if (y > e.maxY - 1.2 || z < zc - 0.15 * half) c = hair;
    } else if (nm === 'chest') {
      c = y > e.maxY - 0.5 ? hoodieDark : Math.abs(y - hemY) < 0.3 ? hoodieDark : hoodie;
    } else if (nm === 'hips') {
      c = y > hemY + 0.3 ? hoodie : y > hemY - 0.3 ? hoodieDark : pants;
    } else if (/UpperArm$/.test(nm)) c = hoodie;
    else if (/LowerArm$/.test(nm)) c = Math.abs(x) > Math.max(Math.abs(e.minX), Math.abs(e.maxX)) - 0.55 ? hoodieDark : hoodie;
    else if (/Hand$/.test(nm)) c = skin;
    else if (/UpperLeg$/.test(nm)) c = pants;
    else if (/LowerLeg$/.test(nm)) c = y < e.minY + 0.5 ? pantsDark : pants;
    else if (/Foot$/.test(nm)) c = y < e.minY + 0.55 ? sole : shoe;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sm.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  // a cap on the head bone (moves with the head)
  const head = bones.find(b => b.name === 'head');
  if (head) {
    source.updateMatrixWorld(true);
    const wb = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) if (bones[dom[i]] === head) { v.fromBufferAttribute(P, i); sm.applyBoneTransform(i, v); v.applyMatrix4(sm.matrixWorld); wb.expandByPoint(v); } // true rendered position of the head vertices
    const size = wb.getSize(new THREE.Vector3()), cen = wb.getCenter(new THREE.Vector3());
    const capMat = new THREE.MeshStandardMaterial({ color: o.cap, roughness: 0.8 });
    const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(size.x * 0.56, size.y * 0.5, size.z * 0.58);
    const brim = new THREE.BoxGeometry(size.x * 0.85, size.y * 0.06, size.z * 0.5); brim.rotateX(0.14); brim.translate(0, 0, size.z * 0.5);
    dome.translate(0, 0, 0); // base of the dome sits at y = 0 of the cap group
    const cap = new THREE.Group(); cap.name = 'cap';
    const domeMesh = new THREE.Mesh(dome, capMat), brimMesh = new THREE.Mesh(brim, capMat);
    cap.add(domeMesh, brimMesh); cap.position.set(cen.x, wb.max.y - size.y * 0.42, cen.z);
    domeMesh.castShadow = brimMesh.castShadow = false;
    source.add(cap); head.attach(cap);
  }
  return 'clothing painted (hoodie, jeans, sneakers) + cap';
}

/** The new scanned man ("char_scan_lite"): already rigged with the humanoid bone names the ragdoll expects and already clothed
 *  (colours baked into the vertices), so it only needs checking and shadow flags. Returns model:null if the ragdoll rejects it. */
/** @param {THREE.Object3D} source */
export function prepareScanCharacter(source) {
  /** @type {THREE.SkinnedMesh|null} */ let sm = null;
  source.traverse(n => { if (/** @type {THREE.SkinnedMesh} */ (n).isSkinnedMesh) sm = /** @type {THREE.SkinnedMesh} */ (n); });
  if (!sm) return { model: null, reason: 'scan character has no skinned mesh' };
  sm.frustumCulled = false; sm.castShadow = true; sm.receiveShadow = false;
  const info = RAGDOLL.inspectModel(source);
  if (!info.ok) return { model: null, reason: 'ragdoll rejected the scan rig: ' + (info.error || 'unknown') };
  return { model: source, reason: '', info, dressed: 'scan character (colours baked in, no repainting)' };
}
