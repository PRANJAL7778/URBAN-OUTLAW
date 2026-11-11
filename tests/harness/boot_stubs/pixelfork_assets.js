// Test double for pixelfork/assets-3d.js: loads the real GLBs from ./assets_nt/<id>.glb.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import fs from 'node:fs';

export const state = { missing: new Set(), loaded: [], failed: [] };
const loader = new GLTFLoader();
const cache = new Map();

export const MODELS = {
  async load(ids) {
    for (const id of ids) {
      if (state.missing.has(id)) { state.failed.push(id); throw new Error('simulated missing asset: ' + id); }
      if (cache.has(id)) continue;
      const file = './assets_nt/' + id + '.glb';
      if (!fs.existsSync(file)) { state.failed.push(id); throw new Error('no such asset: ' + id); }
      const b = fs.readFileSync(file);
      const gltf = await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
      cache.set(id, gltf);
      state.loaded.push(id);
    }
  },
  model(id) {
    const gltf = cache.get(id);
    if (!gltf) throw new Error('model not loaded: ' + id);
    return { scene: gltf.scene, animations: gltf.animations || [] };
  },
  clone(id) { return cloneSkeleton(cache.get(id).scene); },
};
