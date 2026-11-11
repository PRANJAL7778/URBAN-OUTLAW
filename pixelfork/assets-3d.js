/* Pixelfork 3D models (platform file: the AI reads it, never changes it). Needs the three.js pack.
   MODELS comes from this file, not from ../pixelfork/index.js (2D games share index.js and have no three.js):

     import { MODELS } from "../pixelfork/assets-3d.js";
     await MODELS.load();                         // every model in assets/manifest.json (or MODELS.load(["fox_runner"]))
     const fox = MODELS.model("fox_runner");      // a fresh copy each call, animations ready
     scene.add(fox.scene);
     fox.play("Run");                             // the model's own animation names (see Assets); a wrong name lists the real ones
     // every frame: fox.update(dt)

   Models compressed with meshopt load too (a Draco model added to the game is stored that way). */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { ASSETS } from "./assets.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** @type {Map<string, { scene: THREE.Group, animations: THREE.AnimationClip[] }>} */ const gltfs = new Map();

export const MODELS = {
  /** @param {string[]} [names] @param {(done: number, total: number) => void} [onProgress] */
  async load(names, onProgress) {
    const m = await ASSETS._manifest();
    const list = names || Object.keys(m).filter((n) => m[n].type === "model");
    let done = 0;
    await Promise.all(list.map(async (n) => {
      if (!m[n]) throw new Error(`models: there's no asset named "${n}". Models in this game: ${Object.keys(m).filter((k) => m[k].type === "model").join(", ") || "none"}`);
      if (m[n].type !== "model") throw new Error(`models: "${n}" is a ${m[n].type}, not a model`);
      if (!gltfs.has(n)) {
        const g = await loader.loadAsync(ASSETS.url(n));
        gltfs.set(n, { scene: g.scene, animations: g.animations });
      }
      onProgress && onProgress(++done, list.length);
    }));
  },
  /** the names of a model's animations */
  /** @param {string} name */ animations: (name) => (gltfs.get(name) || { animations: [] }).animations.map((a) => a.name),
  /**
   * A new copy of a model (skinned models are copied properly), with its own animation player.
   * @param {string} name
   */
  model(name) {
    const g = gltfs.get(name);
    if (!g) throw new Error(`models: "${name}" isn't loaded; call "await MODELS.load()" first`);
    const scene = /** @type {THREE.Group} */ (SkeletonUtils.clone(g.scene));
    const mixer = new THREE.AnimationMixer(scene);
    /** @type {THREE.AnimationAction | null} */ let current = null;
    return {
      scene, mixer, clips: g.animations,
      /** play an animation by its name, fading from the one playing @param {string} clip @param {{ loop?: boolean, fade?: number, speed?: number }} [o] */
      play(clip, o = {}) {
        const c = g.animations.find((a) => a.name === clip);
        if (!c) throw new Error(`models: "${name}" has no animation "${clip}". It has: ${g.animations.map((a) => a.name).join(", ") || "none"}`);
        const next = mixer.clipAction(c);
        next.reset();
        next.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = o.loop === false;
        next.timeScale = o.speed ?? 1;
        next.play();
        if (current && current !== next) current.crossFadeTo(next, o.fade ?? 0.2, false);
        current = next;
        return next;
      },
      /** advance the animations; call every frame @param {number} dt */
      update(dt) { mixer.update(dt); },
    };
  },
};
