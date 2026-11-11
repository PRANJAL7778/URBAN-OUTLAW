/* Three camera systems for Urban Outlaw — on foot, in a car, on the bobber.
   All of them share one smoothing primitive and one collision test against the city's
   building boxes, so the camera never ends up inside a wall or under the road. */
import * as THREE from 'three';

const _desired = new THREE.Vector3(), _dir = new THREE.Vector3(), _look = new THREE.Vector3();
const _from = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

/** frame-rate independent smoothing factor */
export const smooth = (/** @type {number} */ rate, /** @type {number} */ dt) => 1 - Math.exp(-rate * dt);

/** is this point inside any building box (grown by `pad`)? */
export function insideBox(/** @type {{minX:number,maxX:number,minZ:number,maxZ:number}[]} */ boxes,
  /** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ pad = 0) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
  }
  return false;
}

/** shortest signed angle difference, radians */
export function angleDelta(/** @type {number} */ a, /** @type {number} */ b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Distance along a horizontal ray before it enters a building box (or `max` if clear).
 * Boxes are XZ axis-aligned records from city.colliders.
 */
export function rayClear(/** @type {{minX:number,maxX:number,minZ:number,maxZ:number}[]} */ boxes,
  /** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ dx, /** @type {number} */ dz, /** @type {number} */ max,
  /** @type {number} */ pad = 0.45) {
  let best = max;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return best;
  const ux = dx / len, uz = dz / len;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    // grow the box by the camera's own radius so the lens never pokes through
    const minX = b.minX - pad, maxX = b.maxX + pad, minZ = b.minZ - pad, maxZ = b.maxZ + pad;
    let t0 = 0, t1 = best;
    if (Math.abs(ux) < 1e-6) { if (x < minX || x > maxX) continue; }
    else {
      let ta = (minX - x) / ux, tb = (maxX - x) / ux;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (Math.abs(uz) < 1e-6) { if (z < minZ || z > maxZ) continue; }
    else {
      let ta = (minZ - z) / uz, tb = (maxZ - z) / uz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1 && t0 > 0 && t0 < best) best = t0;
  }
  return best;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {{colliders:{minX:number,maxX:number,minZ:number,maxZ:number}[], ground?:number}} world
 * @param {{sensitivity:number, walkDist:number, carDist:number, bikeDist:number}} cfg
 */
export function createCameraRig(camera, world, cfg) {
  const st = {
    mode: /** @type {'walk'|'car'|'bike'} */ ('walk'),
    yaw: 0, pitch: 0.34,             // player-controlled orbit for on-foot
    dist: cfg.walkDist,              // smoothed distance
    lastDrag: -10,
    sensitivity: 1,
    carYaw: 0, bikeYaw: 0, eff: 0, tx: 0, ty: 0, tz: 0,
    pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false,
  };

  const api = {
    state: st,
    get yaw() { return st.yaw; },
    /** orbit the on-foot camera by a drag in pixels */
    drag(/** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ now = 0) {
      const k = (st.sensitivity || 1) * (cfg.sensitivity || 1);   // radians per pixel, set from settings
      st.yaw -= dx * k;
      st.pitch = clamp(st.pitch + dy * k * 0.8, 0.10, 1.05);
      st.lastDrag = now;
    },
    /** tilt the on-foot camera (same sensitivity, vertical only) */
    pitchTilt(/** @type {number} */ dy) {
      st.pitch = clamp(st.pitch + dy * (st.sensitivity || 1) * (cfg.sensitivity || 1) * 0.8, 0.10, 1.05);
    },
    /** snap the camera behind an entity (used on mode switches, never per frame) */
    jump(/** @type {number} */ yaw, /** @type {number} */ pitch = st.pitch) {
      st.yaw = yaw; st.pitch = pitch; st.carYaw = yaw; st.bikeYaw = yaw; st.ready = false; st.eff = 0;
    },
    /** @param {number} d */
    setWalkDist(d) { st.dist = clamp(d, 2.2, 6.5); },
    /**
     * @param {number} dt
     * @param {{mode:'walk'|'car'|'bike', x:number, z:number, y?:number, heading:number,
     *          speed:number, steer?:number, lean?:number, sprint?:boolean, now:number}} ctx
     */
    update(dt, ctx) {
      const m = ctx.mode;
      st.mode = m;
      const cx = ctx.x, cz = ctx.z, cy = ctx.y ?? 0;
      const pad = insideBox(world.colliders, cx, cz, 0.45) ? 0.02 : 0.40;   // hero hugging a wall

      let yaw, idealDist, height, lookAhead = 0, lookY = 1.15;

      if (m === 'walk') {
        // slow auto-align behind the hero once the player stops dragging
        if (ctx.speed > 0.4 && ctx.now - st.lastDrag > 1100) {
          st.yaw += angleDelta(st.yaw, ctx.heading) * smooth(1.6, dt) * 0.55;
        }
        const want = cfg.walkDist * (ctx.sprint ? 1.10 : 1.0);
        st.dist += (want - st.dist) * smooth(3.0, dt);
        yaw = st.yaw;
        idealDist = Math.cos(st.pitch) * st.dist;
        height = Math.sin(st.pitch) * st.dist + 0.90;
        lookY = 1.15;
      } else {
        const key = m === 'car' ? 'carYaw' : 'bikeYaw';
        // the camera trails the heading: slower in, so turns read as a swoop, never a snap
        const rate = (m === 'car' ? 3.2 : 3.8) + Math.min(2.6, Math.abs(ctx.speed) * 0.08);
        st[key] += angleDelta(st[key], ctx.heading) * smooth(rate, dt);
        const fast = clamp(ctx.speed / 26, 0, 1);
        const base = m === 'car' ? cfg.carDist : cfg.bikeDist;
        const want = base + fast * (m === 'car' ? 1.5 : 1.0);
        st.dist += (want - st.dist) * smooth(2.4, dt);
        yaw = st[key];
        idealDist = st.dist;
        height = m === 'car' ? 2.05 + fast * 0.35 : 1.62 + fast * 0.22;
        lookAhead = m === 'car' ? 6.5 + fast * 5 : 7.5 + fast * 6;
        lookY = m === 'car' ? 1.0 : 1.15;
      }

      _dir.set(Math.sin(yaw), 0, Math.cos(yaw));                 // the direction the camera looks along

      // Smooth the *target* first and derive the lens from it: the camera then always sits on the
      // ray it just tested, so it can never be swept through a wall while it is catching up.
      const kt = smooth(m === 'walk' ? 11 : 15, dt);
      if (!st.ready) { st.tx = cx; st.ty = cy; st.tz = cz; }
      else { st.tx += (cx - st.tx) * kt; st.ty += (cy - st.ty) * kt; st.tz += (cz - st.tz) * kt; }
      const padNow = insideBox(world.colliders, st.tx, st.tz, 0.45) ? 0.02 : 0.40;

      // how far back we may sit without a wall in the way (distance is smoothed, not position)
      const clear = rayClear(world.colliders, st.tx, st.tz, -_dir.x, -_dir.z, idealDist + 1.5, padNow);
      const allowed = Math.min(idealDist, Math.max(0.30, clear - 0.45));
      if (!(st.eff > 0)) st.eff = allowed;
      // pull in immediately when a wall cuts the line of sight (never show through geometry),
      // ease back out slowly when the way is clear again
      st.eff += (allowed - st.eff) * smooth(allowed < st.eff ? 60 : 4.5, dt);

      const shrink = idealDist > 1e-3 ? Math.min(1, st.eff / idealDist) : 1;
      _from.set(st.tx - _dir.x * st.eff, st.ty + (m === 'walk' ? 0.35 + height * shrink : height), st.tz - _dir.z * st.eff);
      _look.set(st.tx + _dir.x * lookAhead, st.ty + lookY, st.tz + _dir.z * lookAhead);
      _from.y = Math.max(_from.y, 0.55);
      st.pos.copy(_from);
      st.look.lerp(_look, smooth(m === 'walk' ? 12 : 16, dt));
      if (st.look.distanceTo(_look) > 4) st.look.copy(_look);
      camera.position.copy(st.pos);
      camera.up.set(0, 1, 0);                                      // level horizon, every mode
      camera.lookAt(st.look);
    },
  };
  return api;
}
