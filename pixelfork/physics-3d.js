/* Pixelfork 3D physics (platform file: the AI reads it, never changes it). Needs the crashcat pack (3D games).
   Sets up crashcat the same way in every 3D game. Bodies, shapes, forces and ray casts use crashcat's own API, from "crashcat":

     import { rigidBody, box, sphere, MotionType } from "crashcat";
     import { createWorld3d } from "../pixelfork/physics-3d.js";
     const physics = createWorld3d({ gravity: [0, -CONFIG.physics.gravity, 0], scene });   // scene: for the debug view
     rigidBody.create(physics.world, { shape: box.create({ halfExtents: [10, 0.5, 10] }), motionType: MotionType.STATIC, objectLayer: physics.layers.static, position: [0, -0.5, 0] });
     const ball = rigidBody.create(physics.world, { shape: sphere.create({ radius: 0.5 }), motionType: MotionType.DYNAMIC, objectLayer: physics.layers.moving, position: [0, 4, 0] });
     physics.link(ballMesh, ball);                  // the three.js mesh follows the body, smoothly between steps
     startLoop({
       update(dt) { physics.step(dt); },            // exactly one physics step per call
       render(alpha) { physics.sync(alpha); renderer.render(scene, camera); },
     });
     CONFIG.on("physics.gravity", (g) => physics.setGravity(0, -g, 0));

   Good to know (crashcat 0.0.5):
   - Vectors are plain arrays: positions [x, y, z], rotations are quaternions [x, y, z, w]. Never pass a three.js Vector3
     (use v.toArray()); crashcat has no vec3 or quat helpers to import.
   - objectLayer: physics.layers.static for static bodies, physics.layers.moving for dynamic and kinematic ones.
     To keep two kinds of bodies from touching, use crashcat's collisionGroups / collisionMask with bitmask.createFlags([...]).
   - Mass comes from the shape's volume at 1000 kg per cubic metre: set mass (kg) on the body, or density on the shape.
   - crashcat reuses removed bodies: to find one again later, keep body.id and use rigidBody.get(physics.world, id).
   - Contacts: physics.listener = { onContactAdded(bodyA, bodyB, manifold, settings) { ... } }. Never remove a body inside it:
     note it, then remove it after physics.step(). A sleeping body ignores changes: physics.wakeAll() after changing friction etc.
   - Everything else is crashcat's own settings, read live: physics.world.settings.solver.velocityIterations = 12.
   - The dashboard's "physics shapes" switch draws every body's shape over the scene (green moving, blue static, yellow kinematic). */
import { addBroadphaseLayer, addObjectLayer, createWorld, createWorldSettings, enableCollision, registerAll, rigidBody, updateWorld } from "crashcat";

/**
 * @typedef {import("crashcat").World} World
 * @typedef {import("crashcat").RigidBody} RigidBody
 * @typedef {import("crashcat").Listener} Listener
 * @typedef {import("three").Object3D} Object3D
 */

/* every shape and constraint type crashcat has; without this, shapes collide with nothing */
registerAll();

/* the dashboard's "physics shapes" switch, remembered so a world made later starts the same way */
const PF = /** @type {any} */ (globalThis).PF;
let shapesWanted = false;
/** @type {Set<(on: boolean) => void>} */ const shapeSwitches = new Set();
if (PF) PF.on("debug-physics", (/** @type {{ on?: boolean } | null} */ d) => {
  shapesWanted = d && typeof d.on === "boolean" ? d.on : !shapesWanted;
  shapeSwitches.forEach((fn) => fn(shapesWanted));
});

/**
 * Create the physics world. Bodies go in with crashcat's own rigidBody.create(physics.world, { ... }).
 * @param {{ gravity?: [number, number, number], scene?: Object3D, listener?: Listener }} [o]
 *   gravity in m/s² (default [0, -9.81, 0]) · scene: where the debug view draws · listener: crashcat's contact callbacks
 */
export function createWorld3d(o = {}) {
  const settings = createWorldSettings();
  /* two layers: moving things collide with everything, static things only with moving ones */
  const moving = addObjectLayer(settings, addBroadphaseLayer(settings));
  const still = addObjectLayer(settings, addBroadphaseLayer(settings));
  enableCollision(settings, moving, still);
  enableCollision(settings, moving, moving);
  const world = createWorld(settings);
  const g = o.gravity || [0, -9.81, 0];
  world.settings.gravity = [Number(g[0]) || 0, Number(g[1]) || 0, Number(g[2]) || 0];

  /* three.js objects that follow bodies: the body's id and where it was before the last step, to draw in between */
  /** @type {Map<Object3D, { id: number, p: number[], q: number[] }>} */ const links = new Map();

  /* the debug view: crashcat/three's debug renderer, loaded the first time the shapes are shown */
  const dbg = { on: false, loading: false, lib: /** @type {typeof import("crashcat/three") | null} */ (null), state: /** @type {import("crashcat/three").debugRenderer.State | null} */ (null) };
  let disposed = false;
  const drawShapes = () => {
    const { lib, state } = dbg;
    if (!lib || !state) return;
    lib.debugRenderer.update(state, world);
    /* outlines on top of everything, so a shape inside or behind a model still shows */
    const line = /** @type {any} */ (state.bodies.edgeWireframeContainer.children[0]);
    if (line && line.material.depthTest) Object.assign(line.material, { depthTest: false, depthWrite: false, transparent: true });
  };
  const showShapes = (/** @type {boolean} */ on) => {
    dbg.on = !!on;
    if (dbg.state) { dbg.state.object3d.visible = dbg.on; if (dbg.on) drawShapes(); return; }
    if (!dbg.on || dbg.loading) return;
    const scene = o.scene;
    if (!scene) { console.warn("physics: pass { scene } to createWorld3d() to see the physics shapes"); return; }
    dbg.loading = true;
    import("crashcat/three").then((lib) => {
      if (disposed) return;
      const opts = lib.debugRenderer.createDefaultOptions();
      opts.bodies.wireframe = true;
      opts.bodies.color = lib.debugRenderer.BodyColorMode.MOTION_TYPE;
      dbg.lib = lib;
      dbg.state = lib.debugRenderer.init(opts);
      scene.add(dbg.state.object3d);
      showShapes(dbg.on);
    }, (e) => { dbg.loading = false; console.error("physics: couldn't load the physics shapes view (crashcat/three)", e); });
  };
  shapeSwitches.add(showShapes);

  const api = {
    /** the crashcat world: rigidBody.create(physics.world, ...), castRay(physics.world, ...), physics.world.settings */
    world,
    /** objectLayer for rigidBody.create: static (never moves) or moving (dynamic and kinematic) */
    layers: Object.freeze({ moving, static: still }),
    /** crashcat's contact callbacks (onContactAdded, onContactPersisted, onContactRemoved, ...), used by every step
     *  @type {Listener | undefined} */
    listener: o.listener,

    /** advance the simulation by dt seconds: exactly one crashcat step. Call it from the loop's update(dt).
     *  @param {number} dt */
    step(dt) {
      if (!(dt > 0)) return;
      for (const l of links.values()) {
        const b = rigidBody.get(world, l.id);
        if (b) { l.p[0] = b.position[0]; l.p[1] = b.position[1]; l.p[2] = b.position[2]; l.q[0] = b.quaternion[0]; l.q[1] = b.quaternion[1]; l.q[2] = b.quaternion[2]; l.q[3] = b.quaternion[3]; }
      }
      updateWorld(world, api.listener, dt);
      if (dbg.on && dbg.state) drawShapes();
    },

    /** change gravity (m/s²) while the game runs; sleeping bodies wake up so they feel it
     *  @param {number} x @param {number} y @param {number} z */
    setGravity(x, y, z) {
      const gr = world.settings.gravity;
      gr[0] = Number(x) || 0; gr[1] = Number(y) || 0; gr[2] = Number(z) || 0;
      api.wakeAll();
    },

    /** wake every sleeping body (after changing friction, bounciness or anything else they should react to now) */
    wakeAll() {
      for (const b of rigidBody.iterate(world)) if (b.sleeping) rigidBody.wake(world, b);
    },

    /**
     * Make a three.js object follow a body (the object should sit directly in the scene). Returns the object.
     * It stops following by itself when the body is removed.
     * @template {Object3D} T @param {T} object @param {RigidBody | number} body a body or its id
     * @returns {T}
     */
    link(object, body) {
      const b = rigidBody.get(world, typeof body === "number" ? body : body && body.id);
      if (!b) throw new Error("physics.link: that body isn't in this world (was it removed?)");
      links.set(object, { id: b.id, p: Array.from(b.position), q: Array.from(b.quaternion) });
      object.position.set(b.position[0], b.position[1], b.position[2]);
      object.quaternion.set(b.quaternion[0], b.quaternion[1], b.quaternion[2], b.quaternion[3]);
      return object;
    },
    /** @param {Object3D} object stop following */
    unlink(object) { links.delete(object); },

    /** move every linked object to its body; alpha (0 to 1, from the loop's render) draws between the last two steps
     *  @param {number} [alpha] */
    sync(alpha = 1) {
      const t = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
      for (const [obj, l] of links) {
        const b = rigidBody.get(world, l.id);
        if (!b) { links.delete(obj); continue; }
        const p = b.position, q = b.quaternion, a = l.q;
        obj.position.set(l.p[0] + (p[0] - l.p[0]) * t, l.p[1] + (p[1] - l.p[1]) * t, l.p[2] + (p[2] - l.p[2]) * t);
        const s = a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3] < 0 ? -1 : 1;   // the short way round
        const x = a[0] + (s * q[0] - a[0]) * t, y = a[1] + (s * q[1] - a[1]) * t, z = a[2] + (s * q[2] - a[2]) * t, w = a[3] + (s * q[3] - a[3]) * t;
        const n = Math.hypot(x, y, z, w) || 1;
        obj.quaternion.set(x / n, y / n, z / n, w / n);
      }
    },

    /** show or hide every body's shape (the dashboard's "physics shapes" switch does the same)
     *  @param {boolean} on */
    showShapes,
    /** true while the physics shapes are shown (same name as in physics-2d.js) */
    get debug() { return dbg.on; },

    /** stop this world: forget linked objects, remove the debug view, stop listening to the dashboard */
    dispose() {
      disposed = true;
      shapeSwitches.delete(showShapes);
      links.clear();
      if (dbg.lib && dbg.state) dbg.lib.debugRenderer.dispose(dbg.state);
      dbg.state = null; dbg.on = false;
    },
  };
  if (shapesWanted) showShapes(true);
  return api;
}
