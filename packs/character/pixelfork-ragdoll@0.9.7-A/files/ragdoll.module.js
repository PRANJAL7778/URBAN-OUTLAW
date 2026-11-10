/* Pixelfork Ragdoll v0.9.7 · needs three@0.186.0 and crashcat@0.0.5 from the import map · © 2026 Pixelfork, see LICENSE */

// src/index.js
import { rigidBody as rigidBody4 } from "crashcat";

// src/names.js
var ANIMATIONS = [
  { name: "idle", loop: true, auto: true, whenToUse: "Standing still. Plays by itself when the character stops moving." },
  { name: "run", loop: true, auto: true, whenToUse: "Normal movement. Plays by itself while hero.move() has a direction." },
  { name: "sprint", loop: true, auto: true, whenToUse: "Fast movement. Plays while moving with hero.sprint(true)." },
  { name: "dash", loop: false, auto: false, whenToUse: "A short burst forward. hero.dash(); has a cooldown; once in the air per jump." },
  { name: "slide", loop: false, auto: false, whenToUse: "A feet-first slide along the ground while running, then getting up. hero.slide(); fits under things half its height." },
  { name: "wallclimb", loop: true, auto: true, whenToUse: "Climbing up, down or along a wall face, hand over hand. Plays by itself when it jumps at a wall too tall to pull up onto." },
  { name: "climb", loop: false, auto: true, whenToUse: "Climbing onto a ledge, hands on the edge. Plays by itself when it jumps at a wall it can climb (up to about 2.6 m)." },
  { name: "jump", loop: false, auto: false, whenToUse: "Take-off. hero.jump(); only from the ground (with a little grace time)." },
  { name: "fall", loop: true, auto: true, whenToUse: "In the air going down. Plays by itself after a jump or walking off a ledge." },
  { name: "land", loop: false, auto: true, whenToUse: "Touching down. Plays by itself; hard landings squash more." },
  { name: "hit", loop: false, auto: false, whenToUse: "Taking a hit. hero.hit({ from }): alive, it is knocked back; limp, the body is shoved." },
  { name: "death", loop: false, auto: false, whenToUse: "Dying. hero.die({ from }): goes fully limp and stays down until hero.revive()." }
];
var LOOKS = [
  { name: "boxy.default", whenToUse: "The standard boxy hero: medium build, 1.8 m tall." }
];

// src/looks.js
var LOOK_DATA = {
  "boxy.default": {
    height: 1.8,
    colors: { shirt: "#ff7a3d", pants: "#3b4a6b", skin: "#f2c9a0", shoes: "#2a2d36", eye: "#1b1d24" }
  }
};

// src/world.js
var HOOK = /* @__PURE__ */ Symbol.for("pixelfork.ragdoll.hook");
var PartTag = class {
  /** @param {object} owner the character's body (src/body.js) @param {number} index part index */
  constructor(owner, index) {
    this.owner = owner;
    this.index = index;
  }
};
var isPhysics = (p) => !!(p && p.world && p.layers && typeof p.step === "function" && typeof p.sync === "function");
function hookWorld(physics) {
  if (physics[HOOK]) return physics[HOOK];
  const hook = { chars: /* @__PURE__ */ new Set() };
  let gameListener = physics.listener;
  const validate = (a, b) => {
    const ta = a.userData, tb = b.userData;
    if (ta instanceof PartTag && tb instanceof PartTag && ta.owner === tb.owner && !ta.owner.collides(ta.index, tb.index)) return false;
    return gameListener && gameListener.onBodyPairValidate ? gameListener.onBodyPairValidate(a, b) : true;
  };
  const wrap3 = (l) => new Proxy(l || {}, {
    get: (t, k) => k === "onBodyPairValidate" ? validate : t[k],
    has: (t, k) => k === "onBodyPairValidate" || k in t
  });
  let merged = wrap3(gameListener);
  Object.defineProperty(physics, "listener", {
    configurable: true,
    enumerable: true,
    get: () => merged,
    set: (l) => {
      gameListener = l;
      merged = wrap3(l);
    }
  });
  const step = physics.step, sync = physics.sync;
  physics.step = function(dt) {
    for (const c of hook.chars) c.beforeStep(dt);
    step.call(this, dt);
    for (const c of hook.chars) c.afterStep(dt);
  };
  physics.sync = function(alpha = 1) {
    sync.call(this, alpha);
    for (const c of hook.chars) c.draw(alpha);
  };
  Object.defineProperty(physics, HOOK, { value: hook });
  return hook;
}

// src/body.js
import {
  rigidBody,
  box,
  compound,
  MotionType,
  MotionQuality,
  swingTwistConstraint,
  hingeConstraint,
  ConstraintSpace,
  SwingType
} from "crashcat";

// src/rig/humanoid.js
var L = 1;
var R = -1;
var SIDES = [["left", L], ["right", R]];
var PARTS = [
  { name: "hips", parent: null, mass: 11, boxes: [{ c: [0, 0.95, 0], h: [0.16, 0.09, 0.1], color: "pants", bone: "hips" }] },
  { name: "spine", parent: "hips", mass: 8, boxes: [{ c: [0, 1.12, 0], h: [0.14, 0.07, 0.09], color: "shirt", bone: "spine" }] },
  { name: "chest", parent: "spine", mass: 14, boxes: [{ c: [0, 1.33, 0], h: [0.19, 0.13, 0.11], color: "shirt", bone: "chest" }] },
  {
    name: "head",
    parent: "chest",
    mass: 5,
    boxes: [
      { c: [0, 1.66, 0.01], h: [0.11, 0.12, 0.12], color: "skin", bone: "head" },
      { c: [0, 1.5, 0], h: [0.05, 0.045, 0.05], color: "skin", bone: "neck", visual: true },
      { c: [0.045, 1.68, 0.13], h: [0.018, 0.026, 8e-3], color: "eye", visual: true },
      { c: [-0.045, 1.68, 0.13], h: [0.018, 0.026, 8e-3], color: "eye", visual: true }
    ]
  },
  ...SIDES.map(([side, s]) => ({
    name: `${side}UpperArm`,
    parent: "chest",
    mass: 2.5,
    boxes: [{ c: [s * 0.26, 1.3, 0], h: [0.05, 0.14, 0.055], color: "shirt", bone: `${side}UpperArm` }]
  })),
  ...SIDES.map(([side, s]) => ({
    name: `${side}LowerArm`,
    parent: `${side}UpperArm`,
    mass: 2,
    boxes: [
      { c: [s * 0.26, 1.03, 0], h: [0.045, 0.12, 0.05], color: "skin", bone: `${side}LowerArm` },
      { c: [s * 0.26, 0.85, 0], h: [0.045, 0.06, 0.035], color: "skin", bone: `${side}Hand` }
    ]
  })),
  ...SIDES.map(([side, s]) => ({
    name: `${side}UpperLeg`,
    parent: "hips",
    mass: 9,
    boxes: [{ c: [s * 0.095, 0.67, 0], h: [0.075, 0.19, 0.08], color: "pants", bone: `${side}UpperLeg` }]
  })),
  ...SIDES.map(([side, s]) => ({
    name: `${side}LowerLeg`,
    parent: `${side}UpperLeg`,
    mass: 5,
    boxes: [
      { c: [s * 0.095, 0.27, 0], h: [0.06, 0.19, 0.065], color: "pants", bone: `${side}LowerLeg` },
      { c: [s * 0.095, 0.04, 0.04], h: [0.06, 0.04, 0.11], color: "shoes", bone: `${side}Foot` }
    ]
  }))
];
var up = [0, 1, 0];
var down = [0, -1, 0];
var right = [1, 0, 0];
var fwd = [0, 0, 1];
var JOINTS = {
  spine: { type: "swing", pivot: [0, 1.045, 0], twist: up, plane: right, swing: [0.55, 0.35], twistRange: [-0.35, 0.35] },
  chest: { type: "swing", pivot: [0, 1.195, 0], twist: up, plane: right, swing: [0.45, 0.3], twistRange: [-0.35, 0.35] },
  head: { type: "swing", pivot: [0, 1.475, 0], twist: up, plane: right, swing: [0.7, 0.45], twistRange: [-1, 1] },
  ...Object.fromEntries(SIDES.flatMap(([side, s]) => [
    /* shoulder: a long cone, centred forward and a little out; swing[0] = sideways, swing[1] = forward/back (143°):
       the hands reach 165° overhead (climbing a wall) and swing 55° back (running); never across the chest or far
       back. Found by a search over every pose the clips and the climbing use (v0.8, AGENTS §6b). */
    [`${side}UpperArm`, { type: "swing", pivot: [s * 0.26, 1.42, 0], twist: down, center: [s * 0.1, -0.45, 0.8], plane: fwd, swing: [1.05, 2.5], twistRange: [-1.2, 1.2] }],
    /* elbow: bends forward only */
    [`${side}LowerArm`, { type: "hinge", pivot: [s * 0.26, 1.155, 0], axis: [-1, 0, 0], normal: fwd, range: [-0.05, 2.5] }],
    /* hip: cone centred forward so the leg swings far forward (~114°, knee up for climbing), 50° back; swing[0] =
       sideways, swing[1] = forward/back */
    [`${side}UpperLeg`, { type: "swing", pivot: [s * 0.095, 0.87, 0], twist: down, center: [s * 0.15, -1, 0.6], plane: fwd, swing: [0.8, 1.45], twistRange: [-0.5, 0.5] }],
    /* knee: bends backward only */
    [`${side}LowerLeg`, { type: "hinge", pivot: [s * 0.095, 0.47, 0], axis: [1, 0, 0], normal: fwd, range: [-0.05, 2.4] }]
  ]))
};
var RIG_HEIGHT = 1.8;

// src/math.js
var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var length = (a) => Math.hypot(a[0], a[1], a[2]);
var normalize = (a) => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
var orthogonalize = (a, n) => normalize(sub(a, scale(n, dot(a, n))));
var quatYaw = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
function rotate(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
var conjugate = (q) => [-q[0], -q[1], -q[2], q[3]];
function nlerp(out, a, b, t) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const x = a[0] + (s * b[0] - a[0]) * t, y = a[1] + (s * b[1] - a[1]) * t, z = a[2] + (s * b[2] - a[2]) * t, w = a[3] + (s * b[3] - a[3]) * t;
  const n = Math.hypot(x, y, z, w) || 1;
  out[0] = x / n;
  out[1] = y / n;
  out[2] = z / n;
  out[3] = w / n;
  return out;
}
var quatAxisAngle = (a, angle) => {
  const s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
};
function quatFromBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// src/body.js
var TUNING = {
  linearDamping: 0.05,
  angularDamping: 0.4,
  friction: 0.8,
  restitution: 0.05,
  /** N·m of friction in every joint when limp: a little keeps the body from wobbling forever */
  jointFriction: 2,
  /** solver passes for the joints (crashcat's world default: 10 velocity, 2 position). 30/8 passed tools/test-ragdoll.mjs;
   *  10/2 let the spine and knees overshoot 40°+ on hard landings. Costs ~0.2 ms per tumbling ragdoll per step on a laptop. */
  velocitySteps: 30,
  positionSteps: 8,
  /** 1 = continuous collision (fast parts can't sink into the floor on hard impacts), 0 = off */
  ccd: 0
};
var makeBox = (h) => box.create({ halfExtents: h, convexRadius: Math.min(0.02, Math.min(h[0], h[1], h[2]) * 0.5) });
function buildBody(physics, o) {
  const { world, layers } = physics;
  const s = o.height / RIG_HEIGHT;
  const q = quatYaw(o.facing);
  const toWorld = (p) => add(o.position, rotate(q, scale(p, s)));
  const dirWorld = (d) => rotate(q, normalize(d));
  const index = new Map(PARTS.map((p, i) => [p.name, i]));
  const n = PARTS.length;
  const noCollide = new Uint8Array(n * n);
  const owner = {
    scale: s,
    /** @type {{ name: string, def: typeof PARTS[number], body: any, prevP: number[], prevQ: number[], drawP: number[], drawQ: number[] }[]} */
    parts: [],
    /** @type {{ name: string, type: 'swing' | 'hinge', joint: typeof JOINTS[string], c: any }[]} */
    joints: [],
    collides: (i, j) => noCollide[i * n + j] === 0,
    /** remember where every part was before the physics step, to draw in between */
    savePrevious() {
      for (const p of owner.parts) {
        const b = p.body;
        p.prevP[0] = b.position[0];
        p.prevP[1] = b.position[1];
        p.prevP[2] = b.position[2];
        p.prevQ[0] = b.quaternion[0];
        p.prevQ[1] = b.quaternion[1];
        p.prevQ[2] = b.quaternion[2];
        p.prevQ[3] = b.quaternion[3];
      }
    },
    /** where every part is drawn: alpha 0 = before the last step, 1 = after it */
    interpolate(alpha) {
      const t = alpha > 0 ? alpha < 1 ? alpha : 1 : 0;
      for (const p of owner.parts) {
        const a = p.prevP, b = p.body.position;
        p.drawP[0] = a[0] + (b[0] - a[0]) * t;
        p.drawP[1] = a[1] + (b[1] - a[1]) * t;
        p.drawP[2] = a[2] + (b[2] - a[2]) * t;
        nlerp(p.drawQ, p.prevQ, p.body.quaternion, t);
      }
    },
    /** buckle: a limp body standing straight would balance on its feet, so start it falling like a person fainting
     *  (knees forward, hips down and back). `dir` = which way it falls: 1 backward, -1 forward */
    buckle(dir = 1) {
      const fwd2 = rotate(q, [0, 0, 1]);
      for (const p of owner.parts) {
        const n2 = p.name;
        let v = null;
        if (n2.endsWith("LowerLeg")) v = scale(fwd2, 0.9);
        else if (n2 === "hips") v = add(scale(fwd2, -0.4 * dir), [0, -0.6, 0]);
        else if (n2 === "chest" || n2 === "head") v = scale(fwd2, -0.6 * dir);
        if (v) rigidBody.addLinearVelocity(world, p.body, scale(v, s));
      }
    },
    /** put every part where a pose has it (from solvePose), moving the way the pose was moving: `prev` is the same pose
     *  one step of `dt` earlier. Used when a living character goes limp, so it carries its motion into the fall. */
    setPose(cur, prev, dt) {
      owner.parts.forEach((p, i) => {
        const c = cur[i], b = p.body;
        rigidBody.setTransform(world, b, c.drawP, c.drawQ, true);
        if (prev && dt > 0) {
          const pr = prev[i];
          rigidBody.setLinearVelocity(world, b, scale(sub(c.drawP, pr.drawP), 1 / dt));
          let d = quatMul(c.drawQ, conjugate(pr.drawQ));
          if (d[3] < 0) d = d.map((v) => -v);
          const sinHalf = Math.hypot(d[0], d[1], d[2]);
          const angle = 2 * Math.atan2(sinHalf, d[3]);
          rigidBody.setAngularVelocity(world, b, sinHalf > 1e-9 ? scale([d[0], d[1], d[2]], angle / sinHalf / dt) : [0, 0, 0]);
        }
        p.prevP = Array.from(b.position);
        p.prevQ = Array.from(b.quaternion);
      });
    },
    /** take everything out of the world */
    remove() {
      for (const j of owner.joints) (j.type === "hinge" ? hingeConstraint : swingTwistConstraint).remove(world, j.c);
      for (const p of owner.parts) rigidBody.remove(world, p.body);
      owner.joints.length = 0;
      owner.parts.length = 0;
    }
  };
  PARTS.forEach((def, i) => {
    const origin = def.boxes[0].c;
    const solid = def.boxes.filter((b) => !b.visual);
    const shape = solid.length === 1 ? makeBox(scale(solid[0].h, s)) : compound.create({ children: solid.map((b) => ({ position: scale(sub(b.c, origin), s), quaternion: [0, 0, 0, 1], shape: makeBox(scale(b.h, s)) })) });
    const body = rigidBody.create(world, {
      shape,
      motionType: MotionType.DYNAMIC,
      objectLayer: layers.moving,
      position: toWorld(origin),
      quaternion: q.slice(),
      mass: def.mass * s * s * s,
      linearDamping: TUNING.linearDamping,
      angularDamping: TUNING.angularDamping,
      friction: TUNING.friction,
      restitution: TUNING.restitution,
      motionQuality: TUNING.ccd ? MotionQuality.LINEAR_CAST : MotionQuality.DISCRETE,
      userData: new PartTag(owner, i)
    });
    owner.parts.push({ name: def.name, def, body, prevP: Array.from(body.position), prevQ: Array.from(body.quaternion), drawP: Array.from(body.position), drawQ: Array.from(body.quaternion) });
    if (def.parent !== null) {
      const pi = index.get(def.parent);
      noCollide[i * n + pi] = noCollide[pi * n + i] = 1;
    }
  });
  for (const def of PARTS) {
    if (def.parent === null) continue;
    const j = JOINTS[def.name];
    const a = owner.parts[index.get(def.parent)].body, b = owner.parts[index.get(def.name)].body;
    const pivot = toWorld(j.pivot);
    let c;
    if (j.type === "swing") {
      const twist = dirWorld(j.twist), center = j.center ? dirWorld(j.center) : twist, plane = dirWorld(j.plane);
      c = swingTwistConstraint.create(world, {
        bodyIdA: a.id,
        bodyIdB: b.id,
        space: ConstraintSpace.WORLD,
        position1: pivot,
        position2: pivot,
        twistAxis1: center,
        planeAxis1: orthogonalize(plane, center),
        twistAxis2: twist,
        planeAxis2: orthogonalize(plane, twist),
        swingType: SwingType.CONE,
        normalHalfConeAngle: j.swing[0],
        planeHalfConeAngle: j.swing[1],
        twistMinAngle: j.twistRange[0],
        twistMaxAngle: j.twistRange[1],
        maxFrictionTorque: TUNING.jointFriction,
        numVelocityStepsOverride: TUNING.velocitySteps,
        numPositionStepsOverride: TUNING.positionSteps
      });
    } else {
      const axis = dirWorld(j.axis), normal = dirWorld(j.normal);
      c = hingeConstraint.create(world, {
        bodyIdA: a.id,
        bodyIdB: b.id,
        space: ConstraintSpace.WORLD,
        pointA: pivot,
        pointB: pivot,
        hingeAxisA: axis,
        hingeAxisB: axis,
        normalAxisA: normal,
        normalAxisB: normal,
        limitsMin: j.range[0],
        limitsMax: j.range[1],
        maxFrictionTorque: TUNING.jointFriction,
        numVelocityStepsOverride: TUNING.velocitySteps,
        numPositionStepsOverride: TUNING.positionSteps
      });
    }
    owner.joints.push({ name: def.name, type: j.type, joint: j, c });
  }
  return owner;
}

// src/controller.js
import { kcc, capsule, filter as filterNs, castRay, createClosestCastRayCollector, createDefaultCastRaySettings, rigidBody as rigidBody2, MotionType as MotionType2 } from "crashcat";

// src/pose.js
var DEG = Math.PI / 180;
var X = [1, 0, 0];
var Y = [0, 1, 0];
var Z = [0, 0, 1];
var NX = [-1, 0, 0];
var PART_INFO = PARTS.map((p) => {
  const side = p.name.startsWith("left") ? 1 : p.name.startsWith("right") ? -1 : 0;
  const j = JOINTS[p.name];
  const kind = p.parent === null ? "root" : j.type === "hinge" ? "hinge" : side ? "limb" : "trunk";
  return { name: p.name, parent: PARTS.findIndex((q) => q.name === p.parent), side, kind, joint: j, def: p };
});
var DOFS = { root: ["lift", "bend", "side", "turn"], trunk: ["bend", "side", "turn"], limb: ["swing", "out", "twist"], hinge: ["bend"] };
function partRotation(info, a) {
  if (!a) return [0, 0, 0, 1];
  if (info.kind === "hinge") return quatAxisAngle(normalize(info.joint.axis), (a.bend || 0) * DEG);
  if (info.kind === "limb") {
    const s = info.side;
    return quatMul(quatAxisAngle(NX, (a.swing || 0) * DEG), quatMul(quatAxisAngle(Z, s * (a.out || 0) * DEG), quatAxisAngle(Y, s * (a.twist || 0) * DEG)));
  }
  return quatMul(quatAxisAngle(Y, (a.turn || 0) * DEG), quatMul(quatAxisAngle(X, (a.bend || 0) * DEG), quatAxisAngle(Z, -(a.side || 0) * DEG)));
}
var FEET = PART_INFO.flatMap((info, i) => info.def.boxes.filter((b) => b.bone && b.bone.endsWith("Foot")).map((b) => [i, b]));
var CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])));
var createPoseOut = () => PART_INFO.map((i) => ({ name: i.name, def: i.def, drawP: [0, 0, 0], drawQ: [0, 0, 0, 1] }));
function solvePose(pose, root, out) {
  const s = root.scale;
  const lean = pose.root;
  let qYaw = quatYaw(root.yaw);
  if (lean && (lean.bank || lean.pitch)) qYaw = quatMul(qYaw, quatMul(quatAxisAngle(X, (lean.pitch || 0) * DEG), quatAxisAngle(Z, -(lean.bank || 0) * DEG)));
  for (let i = 0; i < PART_INFO.length; i++) {
    const info = PART_INFO[i], origin = info.def.boxes[0].c, o = out[i];
    const rel = partRotation(info, pose[info.name]);
    let q, p;
    if (info.kind === "root") {
      q = quatMul(qYaw, rel);
      p = add(root.position, rotate(qYaw, scale(origin, s)));
    } else {
      const parent = out[info.parent], parentOrigin = PART_INFO[info.parent].def.boxes[0].c;
      const pivot = info.joint.pivot;
      const worldPivot = add(parent.drawP, rotate(parent.drawQ, scale(sub(pivot, parentOrigin), s)));
      q = quatMul(parent.drawQ, rel);
      p = add(worldPivot, rotate(q, scale(sub(origin, pivot), s)));
    }
    o.drawP[0] = p[0];
    o.drawP[1] = p[1];
    o.drawP[2] = p[2];
    o.drawQ[0] = q[0];
    o.drawQ[1] = q[1];
    o.drawQ[2] = q[2];
    o.drawQ[3] = q[3];
  }
  const ground = pose.ground ?? 1;
  const lift = (pose.hips?.lift || 0) * s;
  let low = Infinity;
  if (ground > 0) {
    for (const [i, b] of FEET) {
      const o = out[i], origin = PART_INFO[i].def.boxes[0].c;
      for (const c of CORNERS) {
        const local = [(b.c[0] - origin[0] + c[0] * b.h[0]) * s, (b.c[1] - origin[1] + c[1] * b.h[1]) * s, (b.c[2] - origin[2] + c[2] * b.h[2]) * s];
        const y = o.drawP[1] + rotate(o.drawQ, local)[1];
        if (y < low) low = y;
      }
    }
  }
  const dy = (ground > 0 ? ground * (root.position[1] - low) : 0) + lift;
  if (dy) for (const o of out) o.drawP[1] += dy;
  return out;
}
var FRAMES = PART_INFO.map((info) => {
  const j = info.joint;
  if (!j || j.type !== "swing") return null;
  const twist = normalize(j.twist), center = j.center ? normalize(j.center) : twist, plane = normalize(j.plane);
  const frame2 = (x) => {
    const z = orthogonalize(plane, x);
    return quatFromBasis(x, cross(z, x), z);
  };
  return { f1: frame2(center), f2: frame2(twist) };
});
function limitUse(pose, only) {
  const res = [];
  PART_INFO.forEach((info, i) => {
    const j = info.joint;
    if (!j || only && !only.includes(info.name)) return;
    const rel = partRotation(info, pose[info.name]);
    if (j.type === "hinge") {
      const bend = (pose[info.name]?.bend || 0) * DEG;
      res.push({ part: info.name, use: bend >= 0 ? bend / j.range[1] : bend / j.range[0], what: "bend" });
      return;
    }
    const { f1, f2 } = FRAMES[i];
    let qc = quatMul(conjugate(f1), quatMul(rel, f2));
    if (qc[3] < 0) qc = qc.map((v) => -v);
    const tl = Math.hypot(qc[0], qc[3]) || 1;
    const twist = [qc[0] / tl, 0, 0, qc[3] / tl];
    const swing = quatMul(qc, conjugate(twist));
    const sy = swing[1] / Math.sin(j.swing[1] / 2), sz = swing[2] / Math.sin(j.swing[0] / 2);
    const swingUse = Math.hypot(sy, sz);
    const tAngle = 2 * Math.atan2(twist[0], twist[3]);
    const twistUse = tAngle >= 0 ? tAngle / j.twistRange[1] : tAngle / j.twistRange[0];
    res.push(swingUse >= twistUse ? { part: info.name, use: swingUse, what: "swing" } : { part: info.name, use: twistUse, what: "twist" });
  });
  return res;
}
var SOLID = PART_INFO.map((info) => info.def.boxes.filter((b) => !b.visual));
var JOINED = new Set(PART_INFO.flatMap((info, i) => info.parent >= 0 ? [`${i}:${info.parent}`, `${info.parent}:${i}`] : []));
function soleCorners(out, s) {
  return FEET.map(([i, b]) => {
    const o = out[i], origin = PART_INFO[i].def.boxes[0].c;
    return CORNERS.filter((c) => c[1] < 0).map((c) => add(o.drawP, rotate(o.drawQ, [(b.c[0] - origin[0] + c[0] * b.h[0]) * s, (b.c[1] - origin[1] - b.h[1]) * s, (b.c[2] - origin[2] + c[2] * b.h[2]) * s])));
  });
}
function soles(out, s = 1) {
  return soleCorners(out, s).map((cs, f) => {
    let k = 0;
    for (let j = 1; j < cs.length; j++) if (cs[j][1] < cs[k][1]) k = j;
    return { name: PART_INFO[FEET[f][0]].name, p: cs[k], corner: k };
  });
}

// src/ik.js
var DEG2 = 180 / Math.PI;
var LIMBS = {};
for (const side of ["left", "right"]) {
  for (const [kind, upper, lower, endBone] of [["arm", `${side}UpperArm`, `${side}LowerArm`, `${side}Hand`], ["leg", `${side}UpperLeg`, `${side}LowerLeg`, `${side}Foot`]]) {
    const u = PART_INFO.findIndex((p) => p.name === upper), l = PART_INFO.findIndex((p) => p.name === lower);
    const pu = PART_INFO[u].joint.pivot, pl = PART_INFO[l].joint.pivot;
    const endBox = PART_INFO[l].def.boxes.find((b) => b.bone === endBone);
    const end = kind === "arm" ? endBox.c : [endBox.c[0], endBox.c[1] - endBox.h[1], endBox.c[2]];
    LIMBS[`${side}${kind === "arm" ? "Hand" : "Foot"}`] = {
      upper: u,
      lower: l,
      side: side === "left" ? 1 : -1,
      l1: length(sub(pu, pl)),
      l2: length(sub(pl, end)),
      /* the lower bone from its hinge to the touching point (a foot's sole sits a little forward of the shin) */
      v2: sub(end, pl),
      /* the hinge turns around +x or -x: sigma; and its range (radians) */
      sigma: PART_INFO[l].joint.axis[0] > 0 ? 1 : -1,
      range: PART_INFO[l].joint.range,
      pivot: pu
    };
  }
}
var LIMB_NAMES = Object.keys(LIMBS);
function readLimbAngles(q, side) {
  const [x, y, z, w] = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
  const m11 = 1 - 2 * (x * x + z * z), m21 = 2 * (y * z + x * w);
  const a = Math.atan2(m21, m11), b = Math.asin(Math.max(-1, Math.min(1, -m01))), c = Math.atan2(m02, m00);
  return { swing: -a * DEG2, out: b * DEG2 / side, twist: c * DEG2 / side };
}
var anyPerp = (a) => normalize(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
function limbAngles(name, target, pole, solved, s) {
  const L2 = LIMBS[name];
  const info = PART_INFO[L2.upper], parent = solved[info.parent], parentOrigin = PART_INFO[info.parent].def.boxes[0].c;
  const shoulder = add(parent.drawP, rotate(parent.drawQ, scale(sub(L2.pivot, parentOrigin), s)));
  const inv = conjugate(parent.drawQ);
  const t = scale(rotate(inv, sub(target, shoulder)), 1 / s);
  const poleL = rotate(inv, pole);
  const want = length(t);
  const d = Math.min(Math.max(want, Math.abs(L2.l1 - L2.l2) + 1e-3), (L2.l1 + L2.l2) * 0.999);
  const [vx, vy, vz] = L2.v2;
  const Y2 = (L2.l1 * L2.l1 + L2.l2 * L2.l2 - d * d) / (2 * L2.l1);
  const alpha = Math.atan2(vz, vy);
  const c = Math.acos(Math.max(-1, Math.min(1, Y2 / L2.l2)));
  const cands = [c - alpha, -c - alpha].map((phi2) => Math.atan2(Math.sin(L2.sigma * phi2), Math.cos(L2.sigma * phi2)));
  const off = (b) => (b < 0 ? -b + 1e-3 : 0) + Math.max(0, b - L2.range[1]);
  const bend = off(cands[0]) <= off(cands[1]) ? cands[0] : cands[1];
  const phi = L2.sigma * bend;
  const endL = [vx, -L2.l1 + vy * Math.cos(phi) - vz * Math.sin(phi), vy * Math.sin(phi) + vz * Math.cos(phi)];
  const aL = normalize(endL);
  let eL = sub([0, 0, L2.sigma], scale(aL, dot([0, 0, L2.sigma], aL)));
  eL = length(eL) > 1e-6 ? normalize(eL) : anyPerp(aL);
  const aW = want > 1e-6 ? normalize(t) : [0, -1, 0];
  let pW = sub(poleL, scale(aW, dot(poleL, aW)));
  pW = length(pW) > 1e-6 ? normalize(pW) : anyPerp(aW);
  const q = quatMul(quatFromBasis(aW, pW, cross(aW, pW)), conjugate(quatFromBasis(aL, eL, cross(aL, eL))));
  return { upper: readLimbAngles(q, L2.side), bend: bend * DEG2, reach: Math.max(0, (want - d) * s) };
}
function reachWith(pose, name, target, pole, weight, solved, s, maxUse = 0.97) {
  if (!(weight > 0)) return 0;
  const L2 = LIMBS[name];
  const up2 = PART_INFO[L2.upper].name, lo = PART_INFO[L2.lower].name;
  const sol = limbAngles(name, target, pole, solved, s);
  const base = { ...pose[up2] || {} }, baseBend = pose[lo]?.bend || 0;
  const apply = (w2) => {
    const u = pose[up2] ||= {};
    for (const k of ["swing", "out", "twist"]) u[k] = (base[k] || 0) + ((sol.upper[k] || 0) - (base[k] || 0)) * w2;
    (pose[lo] ||= {}).bend = baseBend + (sol.bend - baseBend) * w2;
  };
  const both = [up2, lo];
  const use = () => Math.max(...limitUse(pose, both).map((x) => x.use));
  let w = Math.min(1, weight);
  apply(w);
  if (use() <= maxUse) return w;
  let lo_ = 0, hi = w;
  for (let i = 0; i < 6; i++) {
    const mid = (lo_ + hi) / 2;
    apply(mid);
    if (use() <= maxUse) lo_ = mid;
    else hi = mid;
  }
  apply(lo_);
  return lo_;
}

// src/clip.js
var MIRROR = Object.fromEntries(PART_INFO.filter((p) => p.side === 1).map((p) => [p.name, p.name.replace(/^left/, "right")]));
function compileClip(def) {
  const tracks = {};
  const add2 = (part, dof, t, v) => {
    ((tracks[part] ||= {})[dof] ||= []).push([t, v]);
  };
  for (const key2 of def.keys) {
    for (const [part, angles] of Object.entries(key2.pose)) {
      if (part === "ground") continue;
      const info = PART_INFO.find((p) => p.name === part);
      if (!info) throw new Error(`clip "${def.name}": unknown part "${part}"`);
      for (const [dof, v] of Object.entries(angles)) {
        if (!DOFS[info.kind].includes(dof)) throw new Error(`clip "${def.name}": ${part} has no "${dof}" (it has: ${DOFS[info.kind].join(", ")})`);
        if (!Number.isFinite(v)) throw new Error(`clip "${def.name}": ${part}.${dof} is not a number`);
        add2(part, dof, key2.t, v);
        if (def.mirror && MIRROR[part] && !def.keys.some((k) => k.pose[MIRROR[part]])) add2(MIRROR[part], dof, (key2.t + 0.5) % 1, v);
      }
    }
    if (key2.pose.ground !== void 0) add2("_", "ground", key2.t, key2.pose.ground);
  }
  for (const part of Object.values(tracks)) for (const list of Object.values(part)) list.sort((a, b) => a[0] - b[0]);
  return { ...def, tracks };
}
function sampleTrack(list, t, loop = false) {
  const n = list.length;
  if (n === 1) return list[0][1];
  let i = 0;
  while (i < n && list[i][0] <= t) i++;
  let k1 = i - 1, k2 = i;
  if (!loop) {
    if (k1 < 0) return list[0][1];
    if (k2 >= n) return list[n - 1][1];
  }
  const key2 = (k) => {
    if (!loop) {
      const c = Math.max(0, Math.min(n - 1, k));
      return [list[c][0] + (k - c) * 1e-3, list[c][1]];
    }
    const w = Math.floor(k / n);
    return [list[k - w * n][0] + w, list[k - w * n][1]];
  };
  if (loop && k1 < 0) {
    k1 += n;
    k2 += n;
    t += 1;
  }
  const [t0, p0] = key2(k1 - 1), [t1, p1] = key2(k1), [t2, p2] = key2(k2), [t3, p3] = key2(k2 + 1);
  const h = t2 - t1;
  if (!(h > 0)) return p1;
  const s0 = (p1 - p0) / (t1 - t0 || 1), s1 = (p2 - p1) / h, s2 = (p3 - p2) / (t3 - t2 || 1);
  const m1 = s0 * s1 <= 0 ? 0 : Math.sign(s1) * Math.min(Math.abs((s0 + s1) / 2), 3 * Math.abs(s0), 3 * Math.abs(s1));
  const m2 = s1 * s2 <= 0 ? 0 : Math.sign(s1) * Math.min(Math.abs((s1 + s2) / 2), 3 * Math.abs(s1), 3 * Math.abs(s2));
  const u = (t - t1) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * h * m2;
}
function sampleClip(clip, t, out = {}) {
  for (const k of Object.keys(out)) if (k !== "ground") for (const d of Object.keys(out[k])) out[k][d] = 0;
  for (const [part, dofs] of Object.entries(clip.tracks)) {
    if (part === "_") {
      out.ground = sampleTrack(dofs.ground, t, clip.loop);
      continue;
    }
    const o = out[part] ||= {};
    for (const [dof, list] of Object.entries(dofs)) o[dof] = sampleTrack(list, t, clip.loop);
  }
  if (!clip.tracks._) out.ground = 1;
  return out;
}

// src/climb.js
var ease = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
var window4 = (u, a, b, c, d) => Math.min(ease((u - a) / (b - a)), 1 - ease((u - c) / (d - c)));
var wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
var lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
var FOLD = 0.76;
var weightAt = (keys, u) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) {
    const [t0, a] = keys[i - 1], [t1, b] = keys[i];
    return a + (b - a) * ease((u - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
};
function planClimb(o) {
  const s = o.scale, top = o.top;
  const f = [Math.sin(o.wallYaw), 0, Math.cos(o.wallYaw)], left = [f[2], 0, -f[0]];
  const dist = (o.face[0] - o.start[0]) * f[0] + (o.face[2] - o.start[2]) * f[2];
  const edge = [o.start[0] + f[0] * dist, top, o.start[2] + f[2] * dist];
  const up2 = top - o.start[1];
  const high = up2 > 1.25 * s;
  const duration = high ? 1.35 : 0.6 + 0.3 * Math.max(0, Math.min(1, (up2 / s - 0.5) / 1));
  const hipsUp = 0.95 * s;
  const low = Math.max(0, Math.min(1, (1.3 * s - up2) / (0.8 * s)));
  const hips0 = [o.start[0], o.start[1] + hipsUp, o.start[2]];
  const at = (d, y) => [edge[0] + f[0] * d, y, edge[2] + f[2] * d];
  const hangY = Math.min(hips0[1] + 0.04 * s, Math.max(top - 0.18 * s + low * 0.33 * s, top - 0.18 * s));
  const hang = at(-(high ? 0.34 : 0.3 - 0.04 * low) * s, high ? Math.max(hips0[1] + 0.04 * s, top - 0.18 * s) : hangY);
  const reach = [hips0[0] + (hang[0] - hips0[0]) * 0.35, hips0[1] + (hang[1] - hips0[1]) * 0.35, hips0[2] + (hang[2] - hips0[2]) * 0.35];
  const press = at(-0.16 * s, top + (0.24 + 0.05 * low) * s);
  const stand = at(o.radius + 0.14 * s, top);
  const rising = at(o.radius * 0.7, top + 0.62 * s);
  const standHips = add(stand, [0, hipsUp, 0]);
  const pressT = high ? FOLD : 0.72 + (0.6 - 0.72) * low;
  const floorY = o.air ? -Infinity : o.start[1];
  const hangLowY = Math.max(top - 0.66 * s, o.air ? -Infinity : hips0[1] + 0.04 * s);
  const hangLow = at(-0.33 * s, hangLowY);
  const hangPull = at(-0.33 * s, hangLowY + 0.06 * s);
  const kneeUp = at(-0.32 * s, Math.max(top - 0.38 * s, hangLowY + 0.16 * s));
  const pressHigh = at(-0.1 * s, top + 0.2 * s);
  const keys = high ? [[0, hips0], [0.12, lerp3(hips0, hangLow, 0.35)], [0.24, hangLow], [0.44, hangPull], [0.6, kneeUp], [pressT, pressHigh], [pressT + 0.12, rising], [1, standHips]] : [[0, hips0], [0.15, reach], [Math.min(0.45, pressT - 0.12), hang], [pressT, press], [pressT + 0.14, rising], [1, standHips]];
  const track = [0, 1, 2].map((k) => keys.map(([t, p]) => [t, p[k]]));
  const onTop = 0.035 * s;
  const hands = { leftHand: add(add(edge, scale(left, 0.2 * s)), [f[0] * 0.1 * s, onTop, f[2] * 0.1 * s]), rightHand: add(add(edge, scale(left, -0.2 * s)), [f[0] * 0.1 * s, onTop, f[2] * 0.1 * s]) };
  const floorAt = (side) => add(add(o.start, scale(left, side * 0.095 * s)), [f[0] * 0.04 * s, 0, f[2] * 0.04 * s]);
  const elbowPole = (side) => [-f[0] * 0.7 + left[0] * side * 0.7, -0.3, -f[2] * 0.7 + left[2] * side * 0.7];
  const kneePole = [f[0], 0.4, f[2]];
  const kneelPole = [f[0], 0.9, f[2]];
  const splay = (side) => [f[0] + left[0] * side * 0.25, 0.6, f[2] + left[2] * side * 0.25];
  const hipAt = (u, side) => {
    const h = track.map((tr) => sampleTrack(tr, Math.max(0, Math.min(1, u))));
    return add([h[0], h[1] - 0.08 * s, h[2]], scale(left, side * 0.095 * s));
  };
  const reachLeg = 0.62 * s;
  const hold = (u, side) => {
    const p = hipAt(u, side);
    const along = (p[0] - edge[0]) * f[0] + (p[2] - edge[2]) * f[2];
    const above = p[1] - top;
    const lateral = scale(left, side * 0.11 * s);
    if (above > 0.22 * s) {
      const ahead = Math.sqrt(Math.max(25e-4, reachLeg * reachLeg - above * above));
      return add(add(edge, lateral), scale(f, Math.max(0.14 * s, along + ahead * 0.7)));
    }
    const back = Math.max(0.05 * s, -along + 0.03 * s);
    const drop = Math.sqrt(Math.max(0.09 * s * s, reachLeg * reachLeg - back * back));
    const y = Math.max(o.start[1] + 0.08 * s, Math.min(p[1] - drop, top - 0.14 * s));
    return add([edge[0] - f[0] * 0.03 * s, y, edge[2] - f[2] * 0.03 * s], lateral);
  };
  const onFloor = !o.air && !high;
  const steps = [["L", pressT - 0.06, pressT + 0.05], ["R", pressT - 0.02, pressT + 0.1]];
  const pathOf = (side) => {
    const keys2 = [];
    const mine = steps.filter((x) => x[0] === (side === 1 ? "L" : "R"));
    let at2 = onFloor ? floorAt(side) : null;
    if (at2) keys2.push([0, at2]);
    for (const [, from, to] of mine) {
      const next = hold(to, side);
      if (at2) keys2.push([from, at2]);
      keys2.push([to, next]);
      at2 = next;
    }
    return keys2;
  };
  const envelope = (side) => {
    const first = steps.find((x) => x[0] === (side === 1 ? "L" : "R"));
    return side === 1 ? onFloor ? [[0, 1], [0.9, 1], [0.97, 0]] : [[first[1], 0], [first[2], 1], [0.9, 1], [0.97, 0]] : onFloor ? [[0, 1], [0.92, 1], [1, 0]] : [[first[1], 0], [first[2], 1], [0.92, 1], [1, 0]];
  };
  const wallAt = (y, side) => add([edge[0] - f[0] * 0.03 * s, Math.max(floorY + 0.08 * s, y), edge[2] - f[2] * 0.03 * s], scale(left, side * 0.11 * s));
  const highFeet = () => {
    const aL = wallAt(hangLowY - 0.68 * s, 1), aR = wallAt(hangLowY - 0.7 * s, -1);
    const bL = wallAt(Math.min(kneeUp[1] - 0.42 * s, top - 0.14 * s), 1);
    const kneel = add([edge[0] - f[0] * 0.08 * s, top - 0.16 * s, edge[2] - f[2] * 0.08 * s], scale(left, 0.11 * s));
    const hangR = hipAt(0.8, -1);
    const along = (hangR[0] - edge[0]) * f[0] + (hangR[2] - edge[2]) * f[2];
    const hangRAt = add([hangR[0], hangR[1] - 0.8 * s, hangR[2]], scale(f, Math.min(0, -0.07 * s - along)));
    return [
      [
        "leftFoot",
        [[0.08, aL], [0.44, aL], [0.56, bL], [0.68, bL], [0.78, kneel], [0.84, kneel], [0.94, hold(0.94, 1)]],
        [[0.08, 0], [0.2, 1], [0.9, 1], [0.97, 0]]
      ],
      [
        "rightFoot",
        [[0.1, aR], [0.52, aR], [0.8, hangRAt], [0.94, hold(0.94, -1)]],
        [[0.1, 0], [0.22, 1], [0.44, 1], [0.52, 0], [0.8, 0], [0.86, 1], [0.92, 1], [1, 0]]
      ]
    ];
  };
  const feetPaths = high ? highFeet() : [["leftFoot", pathOf(1), envelope(1)], ["rightFoot", pathOf(-1), envelope(-1)]];
  const followPath = (path, u) => {
    if (u <= path[0][0]) return path[0][1];
    for (let i = 1; i < path.length; i++) {
      const [t0, a] = path[i - 1], [t1, b] = path[i];
      if (u <= t1) {
        const k = (u - t0) / Math.max(1e-6, t1 - t0);
        const rising2 = b[1] - a[1] > 0.15 * s;
        const ky = rising2 ? ease(k / 0.65) : ease(k), kh = rising2 ? ease((k - 0.45) / 0.55) : ease(k);
        const lift = a === b ? 0 : Math.sin(Math.PI * k) * 0.06 * s;
        return [a[0] + (b[0] - a[0]) * kh, a[1] + (b[1] - a[1]) * ky + lift, a[2] + (b[2] - a[2]) * kh];
      }
    }
    return path[path.length - 1][1];
  };
  const lean = (u) => low * window4(u, 0, 0.13, 0.7, 0.9);
  const work = createPoseOut();
  const pose = {};
  return {
    duration,
    high,
    height: up2,
    edge,
    stand,
    /** what the IK was asked for and managed in the last pose() (for tests): { name, target, want, got } */
    last: [],
    /** feet position at u (0..1): where the controller puts the capsule */
    feet(u) {
      const h = track.map((tr) => sampleTrack(tr, Math.max(0, Math.min(1, u))));
      return [h[0], h[1] - hipsUp, h[2]];
    },
    /** which way it faces at u: turns square to the wall in the first moments */
    yaw(u) {
      return o.yaw + wrap(o.wallYaw - o.yaw) * ease(u / 0.18);
    },
    /**
     * The pose at u. `base` is what the animator shows now (blended in at the start and back to at the end, so the
     * climb never pops). Returns a pose object (reused) with `ground` set.
     */
    pose(u, base) {
      for (const k2 of Object.keys(pose)) delete pose[k2];
      const clip = o.clip.tracks;
      const clipU = u <= pressT ? u * FOLD / pressT : FOLD + (u - pressT) * (1 - FOLD) / (1 - pressT);
      for (const [part, dofs] of Object.entries(clip)) {
        if (part === "_") continue;
        pose[part] = {};
        for (const [d, list] of Object.entries(dofs)) pose[part][d] = sampleTrack(list, clipU);
      }
      pose.ground = 0;
      const bendIn = lean(u);
      if (bendIn) {
        (pose.hips ||= {}).bend = (pose.hips.bend || 0) + 12 * bendIn;
        (pose.spine ||= {}).bend = (pose.spine.bend || 0) + 18 * bendIn;
        (pose.chest ||= {}).bend = (pose.chest.bend || 0) + 13 * bendIn;
        (pose.head ||= {}).bend = (pose.head.bend || 0) - 16 * bendIn;
      }
      if (pose.spine) pose.spine.bend = Math.min(pose.spine.bend || 0, 28);
      if (pose.chest) pose.chest.bend = Math.min(pose.chest.bend || 0, 23);
      const root = { position: this.feet(u), yaw: this.yaw(u), scale: s };
      solvePose(pose, root, work);
      const ik = (name, target, pole, w) => {
        const got = reachWith(pose, name, target, pole, w, work, s);
        if (w > 0) this.last.push({ name, target, want: w, got });
      };
      this.last = [];
      const wArm = window4(u, 0, 0.14 + 0.12 * low, pressT - 0.04, pressT + 0.06);
      ik("leftHand", hands.leftHand, elbowPole(1), wArm);
      ik("rightHand", hands.rightHand, elbowPole(-1), wArm);
      for (const [name, path, env] of feetPaths) {
        let w = weightAt(env, u);
        const target = followPath(path, u);
        const pivot = hipAt(u, name === "leftFoot" ? 1 : -1);
        const d = Math.hypot(target[0] - pivot[0], target[1] - pivot[1], target[2] - pivot[2]);
        w *= 1 - ease((d - 0.8 * s) / (0.1 * s));
        if (w > 0) ik(name, target, high && name === "leftFoot" && u > 0.68 && u < 0.9 ? kneelPole : kneePole, w);
      }
      const k = u < 0.5 ? 1 - ease(u / 0.1) : ease((u - 0.82) / 0.18);
      if (k > 0 && base) {
        for (const [part, dofs] of Object.entries(base)) {
          if (part === "ground" || part === "root") continue;
          const p = pose[part] ||= {};
          for (const [d, v] of Object.entries(dofs)) p[d] = (p[d] || 0) + (v - (p[d] || 0)) * k;
        }
        for (const [part, dofs] of Object.entries(pose)) {
          if (part === "ground" || base[part]) continue;
          for (const d of Object.keys(dofs)) dofs[d] *= 1 - k;
        }
      }
      pose.ground = u < 0.5 ? 0 : ease((u - 0.84) / 0.16);
      return pose;
    }
  };
}

// src/wall.js
var ease2 = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
var HOME = { leftHand: [0.24, 0.8], rightHand: [-0.24, 0.8], leftFoot: [0.15, -0.64], rightFoot: [-0.15, -0.64] };
var AHEAD = { leftHand: 0.26, rightHand: 0.26, leftFoot: 0.2, rightFoot: 0.2 };
var PAIRS = [["leftHand", "rightFoot"], ["rightHand", "leftFoot"]];
var LIMBS2 = Object.keys(HOME);
function createWallClimb(o) {
  const s = o.scale;
  const holds = {};
  let turn = 0, moving = -1, wallF = [0, 0, 1], wallLeft = [1, 0, 0], face = [0, 0, 0], feetNow = [0, 0, 0], yawNow = 0;
  let travel = [0, 0];
  const work = createPoseOut();
  const pose = {};
  const STEP_TIME = 0.24, TOO_FAR = 0.26 * s;
  const onWall = (hips, side, up2) => {
    const toFace = (face[0] - hips[0]) * wallF[0] + (face[2] - hips[2]) * wallF[2];
    return [hips[0] + wallF[0] * (toFace - 0.03 * s) + wallLeft[0] * side * s, hips[1] + up2 * s, hips[2] + wallF[2] * (toFace - 0.03 * s) + wallLeft[2] * side * s];
  };
  const hipsOf = (feet) => [feet[0], feet[1] + 0.95 * s, feet[2]];
  const wall = {
    /** grabbing the wall: every limb takes the hold it is comfortable at */
    grab(feet, yaw, f, point) {
      wall.update(feet, yaw, f, point, [0, 0], 0);
      const hips = hipsOf(feet);
      for (const k of LIMBS2) {
        const p = onWall(hips, HOME[k][0], HOME[k][1]);
        holds[k] = { at: p, from: p, to: p, t: 1 };
      }
      moving = -1;
    },
    /**
     * After the controller moved the body: `v` = [sideways, up] speed on the wall (m/s). Moves a pair of limbs to new
     * holds when they have drifted too far (or stay put when the body is still).
     */
    update(feet, yaw, f, point, v, dt) {
      feetNow = feet;
      yawNow = yaw;
      wallF = f;
      wallLeft = [f[2], 0, -f[0]];
      face = point;
      travel = v;
      if (!holds.leftHand) return;
      const hips = hipsOf(feet);
      if (moving >= 0) {
        let done = true;
        for (const k of PAIRS[moving]) {
          const h = holds[k];
          h.t = Math.min(1, h.t + dt / STEP_TIME);
          if (h.t < 1) done = false;
        }
        if (done) {
          moving = -1;
          turn = 1 - turn;
        }
      }
      for (const k of LIMBS2) {
        const h = holds[k], t = ease2(h.t);
        h.at = [h.from[0] + (h.to[0] - h.from[0]) * t, h.from[1] + (h.to[1] - h.from[1]) * t, h.from[2] + (h.to[2] - h.from[2]) * t];
      }
      if (moving >= 0) return;
      const drift = (k) => {
        const h = holds[k].at, rel = sub(h, hips);
        const side = rel[0] * wallLeft[0] + rel[2] * wallLeft[2];
        return Math.hypot(side - HOME[k][0] * s, rel[1] - HOME[k][1] * s);
      };
      const outOfReach = (k) => {
        const up2 = holds[k].at[1] - hips[1];
        return k.endsWith("Hand") ? up2 > 0.88 * s : up2 > -0.46 * s;
      };
      const moving0 = Math.hypot(v[0], v[1]) > 0.05 * s;
      for (const p of [turn, 1 - turn]) {
        const worst = Math.max(...PAIRS[p].map(drift));
        if (worst > TOO_FAR || PAIRS[p].some(outOfReach) || moving0 && worst > TOO_FAR * 0.6 && p === turn) {
          const len = Math.hypot(v[0], v[1]) || 1;
          const dir = moving0 ? [v[0] / len, v[1] / len] : [0, 0];
          for (const k of PAIRS[p]) {
            const h = holds[k];
            h.from = h.at;
            const ahead = AHEAD[k] * (0.55 + 0.45 * Math.abs(dir[1]));
            h.to = onWall(hips, HOME[k][0] + dir[0] * ahead, HOME[k][1] + dir[1] * ahead);
            h.t = 0;
          }
          moving = p;
          break;
        }
      }
    },
    /** the pose now: base (trunk from the caller) + IK hands and feet on their holds (a moving limb arcs out) */
    pose(base) {
      for (const k of Object.keys(pose)) delete pose[k];
      if (base) {
        for (const [part, dofs] of Object.entries(base)) if (part !== "ground" && part !== "root") pose[part] = { ...dofs };
      }
      const lean = Math.max(-1, Math.min(1, travel[0] / (1 * s)));
      pose.hips = { bend: 16, side: -4 * lean };
      pose.spine = { bend: 2, side: 3 * lean };
      pose.chest = { bend: -4 };
      pose.head = { bend: -34, turn: 8 * lean };
      pose.ground = 0;
      const root = { position: feetNow, yaw: yawNow, scale: s };
      solvePose(pose, root, work);
      for (const k of LIMBS2) {
        const h = holds[k];
        let target = h.at;
        const out = h.t < 1 ? Math.sin(Math.PI * ease2(h.t)) * 0.1 * s : 0;
        target = add(target, scale(wallF, -out));
        const isHand = k.endsWith("Hand"), side = k.startsWith("left") ? 1 : -1;
        const pole = isHand ? [wallLeft[0] * side * 0.3, -1, wallLeft[2] * side * 0.3] : [wallF[0], 0.8, wallF[2]];
        reachWith(pose, k, target, pole, 1, work, s);
      }
      return pose;
    },
    /** the current holds (world points) — for tests */
    get holds() {
      return Object.fromEntries(LIMBS2.map((k) => [k, holds[k] ? holds[k].at.slice() : null]));
    },
    get busy() {
      return moving >= 0;
    }
  };
  return wall;
}

// src/controller.js
var MOVE = {
  /** m/s */
  run: 4.5,
  sprint: 7.5,
  /** getting up to speed and slowing down, m/s² (ground); steering in the air */
  accel: 15,
  decel: 20,
  airAccel: 7,
  /** turning: fastest turn standing (rad/s), how hard it can curve while moving (m/s² sideways), how quickly a turn
   *  starts and stops (rad/s²) */
  turn: 11,
  grip: 45,
  turnAccel: 90,
  /** jump height (m), forgiveness windows (s) */
  jump: 1.1,
  coyote: 0.12,
  buffer: 0.12,
  /** dash: speed (m/s), how long (s), wait before the next (s) */
  dash: 14,
  dashTime: 0.2,
  dashCooldown: 0.6,
  /** slide: least speed to start (m/s), how much faster than it came in, how quickly it slows (m/s²), longest (s),
   *  height of the capsule while sliding (share of the height) */
  slideFrom: 2.5,
  slideBoost: 1.15,
  slideFriction: 6,
  slideTime: 0.8,
  slideHeight: 0.5,
  /** climb: the highest ledge top above the feet it can grab from the ground / the air (m); timing is in src/climb.js */
  climbGround: 1.45,
  climbAir: 1.5,
  /** wall climbing (walls too tall to pull up onto): speed up / down, sideways (m/s); a top this far above the feet
   *  (m) is in reach from the wall, and it pulls over; push-off speed from the wall (m/s) */
  climbUp: 1.3,
  climbSide: 1.1,
  /** how far the hips hang from a wall face while climbing it (m) */
  wallGap: 0.46,
  wallTopReach: 1.85,
  pushOff: 3.5,
  /** capsule radius as a share of the height */
  radius: 0.17
};
var wrap2 = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function createController(physics, o) {
  const { world } = physics;
  const s = o.scale, height = 1.8 * s, r = MOVE.radius * height;
  const capsuleOf = (h) => capsule.create({ halfHeightOfCylinder: Math.max(0.01, h / 2 - r), radius: r });
  const tall = capsuleOf(height), low = capsuleOf(height * MOVE.slideHeight);
  const character = kcc.create({
    shape: tall,
    shapeOffset: [0, height / 2, 0],
    mass: 70 * s * s * s,
    maxStrength: 250 * s * s * s,
    maxSlopeAngle: 50 * Math.PI / 180,
    /* only contacts near the bottom of the capsule hold the character up */
    supportingVolumePlane: [0, 1, 0, -r],
    innerRigidBody: { shape: tall, objectLayer: physics.layers.moving }
  }, o.position.slice(), [0, 0, 0, 1]);
  kcc.add(world, character);
  const filter = filterNs.forWorld(world);
  filter.bodyFilter = (b) => !(b.userData instanceof PartTag) && b.id !== character.innerRigidBodyId;
  const ledgeFilter = filterNs.forWorld(world);
  ledgeFilter.bodyFilter = (b) => b.motionType !== MotionType2.DYNAMIC && !(b.userData instanceof PartTag) && b.id !== character.innerRigidBodyId;
  const settings = kcc.createDefaultUpdateSettings();
  settings.walkStairsStepUp = [0, 0.4 * s, 0];
  settings.stickToFloorStepDown = [0, -0.5 * s, 0];
  const rayHit = createClosestCastRayCollector(), raySet = createDefaultCastRaySettings();
  const normal = [0, 0, 0];
  function ray(origin, dir, length2, f = ledgeFilter) {
    rayHit.reset();
    castRay(world, rayHit, raySet, origin, dir, length2, f);
    if (rayHit.hit.status !== 1) return null;
    const d = rayHit.hit.fraction * length2;
    return { distance: d, point: [origin[0] + dir[0] * d, origin[1] + dir[1] * d, origin[2] + dir[2] * d], body: rigidBody2.get(world, rayHit.hit.bodyIdB), sub: rayHit.hit.subShapeId };
  }
  function findLedge(maxUp) {
    const p = character.position, f = [Math.sin(ctl.yaw), 0, Math.cos(ctl.yaw)];
    const reach = r + 0.5 * s;
    const from = [p[0] + f[0] * (reach + 0.05 * s), p[1] + maxUp + 0.3 * s, p[2] + f[2] * (reach + 0.05 * s)];
    const top = ray(from, [0, -1, 0], maxUp + 0.3 * s - 0.45 * s);
    if (!top || top.distance < 0.02 * s || !top.body) return null;
    rigidBody2.getSurfaceNormal(normal, top.body, top.point, top.sub);
    if (normal[1] < Math.cos(40 * Math.PI / 180)) return null;
    const up2 = top.point[1] - p[1];
    const face = ray([p[0], p[1] + up2 - 0.12 * s, p[2]], f, reach + 0.1 * s);
    if (!face) return null;
    const deeper = ray([p[0] + f[0] * (face.distance + 0.45 * s), p[1] + up2 + 0.3 * s, p[2] + f[2] * (face.distance + 0.45 * s)], [0, -1, 0], 0.5 * s);
    if (!deeper || Math.abs(deeper.point[1] - top.point[1]) > 0.12 * s) return null;
    const stand = [p[0] + f[0] * (face.distance + r + 0.12 * s), top.point[1], p[2] + f[2] * (face.distance + r + 0.12 * s)];
    if (ray([stand[0], stand[1] + 0.05 * s, stand[2]], [0, 1, 0], height, filter)) return null;
    const wallN = [0, 0, 0];
    rigidBody2.getSurfaceNormal(wallN, face.body, face.point, face.sub);
    const nl = Math.hypot(wallN[0], wallN[2]);
    if (nl < 0.5 || (-wallN[0] * f[0] - wallN[2] * f[2]) / nl < Math.cos(55 * Math.PI / 180)) return null;
    return { up: up2, stand, top: top.point[1], face: face.point, wallYaw: Math.atan2(-wallN[0] / nl, -wallN[2] / nl) };
  }
  function findWall(maxDist = r + 0.45 * s) {
    const p = character.position, f = [Math.sin(ctl.yaw), 0, Math.cos(ctl.yaw)];
    const hit = ray([p[0], p[1] + 1.1 * s, p[2]], f, maxDist);
    if (!hit || !hit.body) return null;
    const n = [0, 0, 0];
    rigidBody2.getSurfaceNormal(n, hit.body, hit.point, hit.sub);
    const nl = Math.hypot(n[0], n[2]);
    if (nl < 0.94 || (-n[0] * f[0] - n[2] * f[2]) / nl < Math.cos(50 * Math.PI / 180)) return null;
    return { point: hit.point, distance: hit.distance, f: [-n[0] / nl, 0, -n[2] / nl] };
  }
  let coyote = 0, buffer = 0, wasGrounded = true, airTime = 0, fallSpeed = 0, groundSpeed = 0;
  let dashCool = 0, airDash = true, modeTime = 0, modeSpeed = 0, climbAgain = 0;
  let pending = null;
  let climb = null;
  const wallClimb = createWallClimb({ scale: s });
  let wallF = [0, 0, 1];
  function setHeight(h) {
    const old = character.shapeOffset.slice();
    character.shapeOffset = [0, h / 2, 0];
    if (kcc.setShape(world, character, h === height ? tall : low, filter, void 0, 0.02 * s)) return true;
    character.shapeOffset = old;
    return false;
  }
  const ctl = {
    character,
    /** wanted direction on the ground, each -1..1 */
    input: [0, 0],
    sprinting: false,
    /** 'move' | 'dash' | 'slide' | 'wall' | 'climb' */
    mode: "move",
    /** which way it faces (radians around y, 0 = +z) and how fast that is turning (rad/s, + = to its left) */
    yaw: o.facing,
    yawRate: 0,
    /** horizontal speed it actually moved this step (m/s): walking into a wall is 0 */
    speed: 0,
    /** how fast its speed changes along its facing (m/s², + = speeding up) */
    accel: 0,
    grounded: true,
    /** what happened this step: 'jump' | 'land' | 'dash' | 'slide' | 'stand' (slide over) | 'grab' (a wall) |
     *  'pushoff' | 'letgo' | 'climb' (pull over a ledge starts) | 'climbed' */
    event: (
      /** @type {null | string} */
      null
    ),
    /** speed it hit the floor with on the last landing (m/s) */
    landSpeed: 0,
    /** the current climb (its plan, see src/climb.js) and how far through it is (0..1) */
    get climb() {
      return ctl.mode === "climb" ? climb : null;
    },
    /** the wall-climbing limbs (src/wall.js) while on a wall face */
    get wall() {
      return ctl.mode === "wall" ? wallClimb : null;
    },
    climbU: 0,
    /** how high the ledge of the current climb is above where it grabbed (m) */
    get climbHeight() {
      return climb ? climb.height : 0;
    },
    get airTime() {
      return airTime;
    },
    /** velocity it actually moved with (m/s) */
    velocity: [0, 0, 0],
    /** a push from outside (a hit): added to the velocity, fades out */
    push: [0, 0, 0],
    /** ask for a jump: happens now if it can, or within a moment (landing, ledge); at a ledge it climbs instead */
    jump() {
      buffer = MOVE.buffer;
    },
    /** a burst forward; false while it can't (cooldown, already used in this jump, climbing) */
    dash() {
      if (dashCool > 0 || ctl.mode === "climb" || ctl.mode === "dash" || !ctl.grounded && !airDash) return false;
      if (ctl.mode === "slide" && !setHeight(height)) return false;
      const [ix, iz] = ctl.input;
      if (Math.hypot(ix, iz) > 0.1) ctl.yaw = Math.atan2(ix, iz);
      if (!ctl.grounded) airDash = false;
      ctl.mode = "dash";
      modeTime = 0;
      dashCool = MOVE.dashCooldown;
      ctl.yawRate = 0;
      pending = "dash";
      return true;
    },
    /** a low slide; only on the ground while moving */
    slide() {
      if (ctl.mode !== "move" || !ctl.grounded || ctl.speed < MOVE.slideFrom * s) return false;
      setHeight(height * MOVE.slideHeight);
      ctl.mode = "slide";
      modeTime = 0;
      modeSpeed = Math.max(ctl.speed, MOVE.run * s) * MOVE.slideBoost;
      pending = "slide";
      return true;
    },
    step(dt) {
      ctl.event = pending;
      pending = null;
      const g = world.settings.gravity;
      const [ix, iz] = ctl.input;
      const len = Math.hypot(ix, iz);
      const want = Math.min(1, len) * (ctl.sprinting ? MOVE.sprint : MOVE.run) * s;
      const v = character.linearVelocity;
      const supported = kcc.isSupported(character);
      const hx = v[0] - ctl.push[0], hz = v[2] - ctl.push[2];
      const hSpeed = Math.hypot(hx, hz);
      dashCool = Math.max(0, dashCool - dt);
      climbAgain = Math.max(0, climbAgain - dt);
      buffer = Math.max(0, buffer - dt);
      modeTime += dt;
      if (supported) airDash = true;
      if (ctl.mode === "climb") {
        const u = Math.min(1, modeTime / climb.duration);
        const before2 = character.position.slice();
        kcc.setPosition(world, character, climb.feet(u));
        ctl.yaw = climb.yaw(u);
        character.linearVelocity = [0, 0, 0];
        const now = character.position;
        ctl.velocity = [(now[0] - before2[0]) / dt, (now[1] - before2[1]) / dt, (now[2] - before2[2]) / dt];
        ctl.speed = 0;
        ctl.yawRate = 0;
        ctl.accel = 0;
        ctl.grounded = false;
        ctl.climbU = u;
        if (u >= 1) {
          ctl.mode = "move";
          groundSpeed = 0;
          climbAgain = 0.3;
          airTime = 0;
          fallSpeed = 0;
          wasGrounded = true;
          ctl.grounded = true;
          ctl.event = "climbed";
        }
        kcc.setQuaternion(world, character, quatYaw(ctl.yaw));
        return;
      }
      if (ctl.mode === "wall") {
        const fw = wallF, leftW = [fw[2], 0, -fw[0]];
        const up2 = len > 0.1 ? (ix * fw[0] + iz * fw[2]) / Math.max(1, len) : 0;
        const sideL = len > 0.1 ? (ix * leftW[0] + iz * leftW[2]) / Math.max(1, len) : 0;
        const vUp = (Math.abs(up2) > 0.3 ? up2 : 0) * MOVE.climbUp * s, vLeft = (Math.abs(sideL) > 0.3 ? sideL : 0) * MOVE.climbSide * s;
        const p2 = character.position;
        if (buffer > 0) {
          buffer = 0;
          ctl.mode = "move";
          climbAgain = 0.5;
          airTime = 0.1;
          character.linearVelocity = [-fw[0] * MOVE.pushOff * s, 4 * s, -fw[2] * MOVE.pushOff * s];
          ctl.yaw = wrap2(ctl.yaw + Math.PI);
          ctl.event = "pushoff";
          kcc.setQuaternion(world, character, quatYaw(ctl.yaw));
          return;
        }
        const ledge = findLedge(MOVE.wallTopReach * s);
        if (ledge && vUp >= 0) {
          climb = planClimb({ start: p2.slice(), yaw: ctl.yaw, wallYaw: ledge.wallYaw, face: ledge.face, top: ledge.top, radius: r, scale: s, clip: o.climbClip, air: true });
          ctl.mode = "climb";
          modeTime = 0;
          ctl.climbU = 0;
          ctl.event = "climb";
          return;
        }
        const wallAt = (q2) => {
          const save = character.position;
          character.position = q2;
          const w2 = findWall(r + 0.7 * s);
          character.position = save;
          return w2;
        };
        let q = [p2[0] + leftW[0] * vLeft * dt, p2[1] + vUp * dt, p2[2] + leftW[2] * vLeft * dt];
        let w = wallAt(q);
        if (!w && vLeft) {
          q = [p2[0], p2[1] + vUp * dt, p2[2]];
          w = wallAt(q);
        }
        if (!w) {
          q = p2.slice();
          w = wallAt(q);
        }
        if (vUp < 0) {
          const floor = ray([q[0], q[1] + 0.1 * s, q[2]], [0, -1, 0], 0.2 * s, filter);
          if (floor) {
            ctl.mode = "move";
            groundSpeed = 0;
            ctl.event = "letgo";
            return;
          }
        }
        if (!w) {
          ctl.mode = "move";
          climbAgain = 0.4;
          ctl.event = "letgo";
          return;
        }
        const gap = w.distance - MOVE.wallGap * s;
        q = [q[0] + w.f[0] * gap, q[1], q[2] + w.f[2] * gap];
        wallF = w.f;
        ctl.yaw = Math.atan2(w.f[0], w.f[2]);
        const before2 = p2.slice();
        kcc.setPosition(world, character, q);
        kcc.setQuaternion(world, character, quatYaw(ctl.yaw));
        character.linearVelocity = [0, 0, 0];
        ctl.velocity = [(q[0] - before2[0]) / dt, (q[1] - before2[1]) / dt, (q[2] - before2[2]) / dt];
        ctl.speed = 0;
        ctl.yawRate = 0;
        ctl.accel = 0;
        ctl.grounded = false;
        airTime = 0;
        fallSpeed = 0;
        wallClimb.update(q, ctl.yaw, wallF, w.point, [vLeft, vUp], dt);
        return;
      }
      if (ctl.mode === "move" && !supported && airTime > 0.05 && climbAgain <= 0 && len > 0.1) {
        const toward = Math.cos(wrap2(Math.atan2(ix, iz) - ctl.yaw));
        if (toward > 0.5 && !findLedge(MOVE.climbAir * s)) {
          const w = findWall();
          if (w) {
            wallF = w.f;
            ctl.yaw = Math.atan2(w.f[0], w.f[2]);
            const p2 = character.position, gap = w.distance - MOVE.wallGap * s;
            kcc.setPosition(world, character, [p2[0] + w.f[0] * gap, p2[1], p2[2] + w.f[2] * gap]);
            kcc.setQuaternion(world, character, quatYaw(ctl.yaw));
            character.linearVelocity = [0, 0, 0];
            ctl.mode = "wall";
            ctl.event = "grab";
            ctl.grounded = false;
            wallClimb.grab(character.position.slice(), ctl.yaw, wallF, w.point);
            return;
          }
        }
      }
      if (ctl.mode === "move" || ctl.mode === "dash") {
        const toward = len > 0.1 ? Math.cos(wrap2(Math.atan2(ix, iz) - ctl.yaw)) : 0;
        const wantsUp = supported && buffer > 0 && (len < 0.1 || toward > 0.5) || !supported && airTime > 0.05 && toward > 0.5 && v[1] < 3 * s;
        if (wantsUp && climbAgain <= 0) {
          const ledge = findLedge((supported ? MOVE.climbGround : MOVE.climbAir) * s);
          if (ledge && ledge.up > (supported ? 0.5 : 0.3) * s) {
            buffer = 0;
            climb = planClimb({ start: character.position.slice(), yaw: ctl.yaw, wallYaw: ledge.wallYaw, face: ledge.face, top: ledge.top, radius: r, scale: s, clip: o.climbClip, air: !supported });
            ctl.mode = "climb";
            modeTime = 0;
            ctl.climbU = 0;
            ctl.event = "climb";
            character.linearVelocity = [0, 0, 0];
            ctl.velocity = [0, 0, 0];
            ctl.speed = 0;
            ctl.yawRate = 0;
            ctl.grounded = false;
            return;
          }
        }
      }
      let diff = 0;
      if (len > 0.1) diff = wrap2(Math.atan2(ix, iz) - ctl.yaw);
      if (ctl.mode === "move" || ctl.mode === "slide") {
        let rateGoal = 0;
        if (len > 0.1) {
          const cap = ctl.mode === "slide" ? MOVE.turn * 0.2 : supported ? Math.min(MOVE.turn, MOVE.grip * s / Math.max(0.5, hSpeed)) : MOVE.turn * 0.35;
          rateGoal = Math.max(-cap, Math.min(cap, diff * 9));
        }
        const dRate = MOVE.turnAccel * dt;
        ctl.yawRate += Math.max(-dRate, Math.min(dRate, rateGoal - ctl.yawRate));
        if (len > 0.1 && Math.abs(ctl.yawRate * dt) > Math.abs(diff)) ctl.yawRate = diff / dt;
        ctl.yaw = wrap2(ctl.yaw + ctl.yawRate * dt);
      }
      const fx = Math.sin(ctl.yaw), fz = Math.cos(ctl.yaw);
      let vx, vz, vy = v[1];
      if (ctl.mode === "dash") {
        vx = fx * MOVE.dash * s;
        vz = fz * MOVE.dash * s;
        if (modeTime >= MOVE.dashTime) {
          ctl.mode = "move";
          groundSpeed = Math.max(want, Math.min(MOVE.run * s, hSpeed));
        }
      } else if (ctl.mode === "slide") {
        modeSpeed = Math.max(0, modeSpeed - MOVE.slideFriction * s * dt);
        vx = fx * modeSpeed;
        vz = fz * modeSpeed;
        const over = modeTime >= MOVE.slideTime || modeSpeed < 1.5 * s || buffer > 0 || !supported && airTime > 0.15;
        if (over) {
          if (setHeight(height)) {
            ctl.mode = "move";
            groundSpeed = modeSpeed;
            ctl.event = "stand";
          } else modeSpeed = Math.max(modeSpeed, 1.2 * s);
        }
      } else if (supported) {
        if (!wasGrounded) groundSpeed = Math.max(0, hx * fx + hz * fz);
        const along = len > 0.1 ? Math.max(0.15, Math.cos(Math.min(Math.PI / 2, Math.abs(diff) * 0.46))) : 0;
        const goal = want * along;
        const a = (goal > groundSpeed ? MOVE.accel : MOVE.decel) * s * dt;
        groundSpeed += Math.max(-a, Math.min(a, goal - groundSpeed));
        vx = fx * groundSpeed;
        vz = fz * groundSpeed;
      } else {
        const tx = len > 0.1 ? ix / Math.max(1, len) * want : hx, tz = len > 0.1 ? iz / Math.max(1, len) * want : hz;
        const dx = tx - hx, dz = tz - hz, d = Math.hypot(dx, dz);
        const a = MOVE.airAccel * s * dt;
        const k = d > a ? a / d : 1;
        vx = hx + dx * k;
        vz = hz + dz * k;
      }
      const fade = Math.exp(-6 * dt);
      ctl.push[0] *= fade;
      ctl.push[2] *= fade;
      vx += ctl.push[0];
      vz += ctl.push[2];
      coyote = supported ? MOVE.coyote : Math.max(0, coyote - dt);
      if (ctl.mode === "move" && buffer > 0 && coyote > 0 && vy <= 0.5) {
        vy = Math.sqrt(2 * -g[1] * MOVE.jump * s);
        buffer = 0;
        coyote = 0;
        ctl.event = "jump";
      } else if (ctl.mode === "dash" && !supported) vy = 0;
      else if (supported && vy <= 0) vy = character.ground.velocity[1];
      else vy += g[1] * dt;
      vy += ctl.push[1];
      ctl.push[1] = 0;
      if (!supported) fallSpeed = Math.max(fallSpeed, -vy);
      character.linearVelocity = [vx, vy, vz];
      const before = character.position.slice();
      const speedBefore = ctl.speed;
      kcc.update(world, character, dt, g, settings, void 0, filter);
      const p = character.position;
      ctl.velocity = [(p[0] - before[0]) / dt, (p[1] - before[1]) / dt, (p[2] - before[2]) / dt];
      ctl.speed = Math.hypot(ctl.velocity[0], ctl.velocity[2]);
      if (supported && ctl.mode === "move") groundSpeed = Math.min(groundSpeed, ctl.speed + 0.3 * s);
      if (ctl.mode === "slide" && supported) modeSpeed = Math.min(modeSpeed, ctl.speed + 0.3 * s);
      ctl.accel = ctl.accel + ((ctl.speed - speedBefore) / dt - ctl.accel) * Math.min(1, dt * 12);
      ctl.grounded = kcc.isSupported(character);
      if (ctl.grounded) {
        if (!wasGrounded && airTime > 0.08 && !ctl.event) {
          ctl.event = "land";
          ctl.landSpeed = fallSpeed;
        }
        airTime = 0;
        fallSpeed = 0;
      } else airTime += dt;
      wasGrounded = ctl.grounded;
      kcc.setQuaternion(world, character, quatYaw(ctl.yaw));
    },
    remove() {
      kcc.remove(world, character);
    }
  };
  return ctl;
}

// src/animator.js
var LOCO = ["idle", "run", "sprint"];
var BLEND = { idleTo: 0.15, runFrom: 1.6, sprintFrom: 5, sprintTo: 6.8, ease: 0.12 };
var MIN_CADENCE = 0.6;
var smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var ease3 = (w) => w * w * (3 - 2 * w);
function createAnimator(defs) {
  const clips = Object.fromEntries(defs.map((d) => [d.name, compileClip(d)]));
  const has = (n) => !!clips[n];
  const stride = (n) => clips[n] ? clips[n].speed * clips[n].duration : 1;
  const w = { idle: 1, run: 0, sprint: 0 }, target = { idle: 1, run: 0, sprint: 0 };
  let phase = 0, idleT = 0, forced = null, speedNow = 0;
  const act = { clip: null, t: 0, weight: 0, to: 0, fade: 0.15, strength: 1, hold: null, rate: 1 };
  const scratch = { idle: {}, run: {}, sprint: {}, action: {} };
  const out = {};
  function setTargets(speed) {
    if (forced) {
      for (const n of LOCO) target[n] = n === forced ? 1 : 0;
      return;
    }
    const moving = smooth(BLEND.idleTo, BLEND.runFrom, speed);
    const fast = smooth(BLEND.sprintFrom, BLEND.sprintTo, speed);
    target.idle = 1 - moving;
    target.run = moving * (1 - fast);
    target.sprint = moving * fast;
  }
  const anim = {
    clips,
    /** what shows most: the action if it is fading in, else the heaviest of idle / run / sprint */
    get state() {
      if (act.clip && act.to > 0 && act.weight > 0.3) return act.clip.name;
      let best = "idle";
      for (const n of LOCO) if (w[n] > w[best]) best = n;
      return best;
    },
    /** 0..1 through the step cycle (or through the action) */
    get phase() {
      return act.clip && act.to > 0 ? act.t : forced === "idle" ? idleT : phase;
    },
    /** the action playing (null if none) and whether a one-shot action reached its end */
    get action() {
      return act.clip && act.to > 0 ? act.clip.name : null;
    },
    get finished() {
      return !!act.clip && !act.clip.loop && act.t >= 1;
    },
    /** the locomotion weights now (for the viewer) */
    weights: w,
    /** idle / run / sprint from speed (m/s, as for a 1.8 m character). `sprinting` is not needed: speed says it */
    locomotion(speed) {
      forced = null;
      speedNow = speed;
      return true;
    },
    /** show one clip: a locomotion clip on its own (the clip viewer), or an action over the locomotion.
     *  o.fade: seconds to ease in · o.strength: 0..1 how much of the action shows · o.restart
     *  · o.hold: the action waits at its clip's `hold` point until go() (a slide lasts as long as the game says) */
    play(name, o = {}) {
      if (!has(name)) return false;
      if (LOCO.includes(name)) {
        forced = name;
        if (o.fade === 0) for (const n of LOCO) w[n] = n === name ? 1 : 0;
        if (act.to > 0) anim.release(o.fade ?? 0.15);
        return true;
      }
      if (act.clip === clips[name] && act.to > 0 && !o.restart) return true;
      act.clip = clips[name];
      act.t = 0;
      act.to = 1;
      act.fade = o.fade ?? 0.15;
      act.strength = o.strength ?? 1;
      act.hold = o.hold && act.clip.hold != null ? act.clip.hold : null;
      act.rate = 1;
      if (o.fade === 0) act.weight = 1;
      return true;
    },
    /** a held action goes on past its hold point, `rate` times as fast */
    go(rate = 1) {
      act.hold = null;
      act.rate = rate;
    },
    /** ease the action out, back to locomotion */
    release(fade = 0.2) {
      if (act.clip) {
        act.to = 0;
        act.fade = fade;
      }
    },
    /** jump to a point (0..1) of what is showing (the clip viewer's scrubber) */
    seek(t) {
      if (act.clip && act.to > 0) {
        act.t = Math.max(0, Math.min(1, t));
        act.weight = 1;
        return;
      }
      const v = (t % 1 + 1) % 1;
      if (forced === "idle") idleT = v;
      else phase = v;
      for (const n of LOCO) w[n] = target[n];
    },
    /** advance time. `speed` in m/s as for a 1.8 m character (the game divides by its scale) */
    update(dt, speed = speedNow) {
      speedNow = speed;
      setTargets(speed);
      const k = 1 - Math.exp(-dt / BLEND.ease);
      for (const n of LOCO) w[n] += (target[n] - w[n]) * k;
      const moving = w.run + w.sprint;
      if (moving > 1e-4) {
        const len = (w.run * stride("run") + w.sprint * stride("sprint")) / moving;
        const cadence = (w.run * (1 / clips.run.duration) + w.sprint * (1 / clips.sprint.duration)) / moving;
        const v = forced ? forced === "sprint" ? clips.sprint.speed : clips.run.speed : speed;
        phase = (phase + dt * Math.max(v / len, MIN_CADENCE * cadence)) % 1;
      }
      if (has("idle")) idleT = (idleT + dt / clips.idle.duration) % 1;
      if (act.clip) {
        act.t += dt * act.rate / act.clip.duration;
        if (act.hold != null && act.t > act.hold) act.t = act.hold;
        if (act.clip.loop) act.t %= 1;
        else if (act.t > 1) act.t = 1;
        const step = dt / Math.max(1e-3, act.fade);
        act.weight = act.to > act.weight ? Math.min(act.to, act.weight + step) : Math.max(act.to, act.weight - step);
        if (act.weight <= 0 && act.to === 0) act.clip = null;
      }
      return anim;
    },
    /** the pose now (a reused object: copy it to keep it) */
    pose() {
      for (const k of Object.keys(out)) if (k !== "ground") for (const d of Object.keys(out[k])) out[k][d] = 0;
      out.ground = 0;
      let total = 0;
      for (const n of LOCO) total += w[n];
      for (const n of LOCO) {
        if (!(w[n] > 1e-4) || !has(n)) continue;
        const p = sampleClip(clips[n], n === "idle" ? idleT : phase, scratch[n]);
        addPose(out, p, w[n] / total);
      }
      if (act.clip && act.weight > 0) {
        const a = ease3(act.weight) * act.strength;
        const p = sampleClip(act.clip, act.t, scratch.action);
        for (const [part, dofs] of Object.entries(out)) {
          if (part === "ground") continue;
          for (const d of Object.keys(dofs)) dofs[d] *= 1 - a;
        }
        out.ground *= 1 - a;
        addPose(out, p, a);
      }
      return out;
    }
  };
  return anim;
}
function addPose(out, p, k) {
  for (const [part, dofs] of Object.entries(p)) {
    if (part === "ground") {
      out.ground += k * dofs;
      continue;
    }
    const o = out[part] ||= {};
    for (const [d, v] of Object.entries(dofs)) o[d] = (o[d] || 0) + k * v;
  }
}

// src/clips/idle.js
var idle_default = {
  name: "idle",
  loop: true,
  duration: 3.6,
  keys: [
    {
      t: 0,
      pose: {
        hips: { bend: 2, side: 0 },
        spine: { bend: 1, side: 0 },
        chest: { bend: -1 },
        head: { bend: 2, turn: 0 },
        leftUpperLeg: { out: 4, swing: 2 },
        rightUpperLeg: { out: 4, swing: 2 },
        leftLowerLeg: { bend: 4 },
        rightLowerLeg: { bend: 4 },
        leftUpperArm: { out: 7, swing: 3 },
        rightUpperArm: { out: 7, swing: 3 },
        leftLowerArm: { bend: 10 },
        rightLowerArm: { bend: 10 }
      }
    },
    {
      t: 0.25,
      pose: {
        hips: { side: 1.2 },
        spine: { side: -0.8 },
        chest: { bend: 1.5 },
        head: { bend: 0, turn: 7 },
        leftUpperLeg: { out: 5.2 },
        rightUpperLeg: { out: 2.8 },
        leftUpperArm: { out: 8.5 },
        rightUpperArm: { out: 8.5 },
        leftLowerArm: { bend: 12 },
        rightLowerArm: { bend: 12 }
      }
    },
    {
      t: 0.5,
      pose: {
        hips: { side: 0 },
        spine: { side: 0 },
        chest: { bend: -1 },
        head: { bend: 2, turn: 0 },
        leftUpperLeg: { out: 4 },
        rightUpperLeg: { out: 4 },
        leftUpperArm: { out: 7 },
        rightUpperArm: { out: 7 },
        leftLowerArm: { bend: 10 },
        rightLowerArm: { bend: 10 }
      }
    },
    {
      t: 0.75,
      pose: {
        hips: { side: -1.2 },
        spine: { side: 0.8 },
        chest: { bend: 1.5 },
        head: { bend: 1, turn: -6 },
        leftUpperLeg: { out: 2.8 },
        rightUpperLeg: { out: 5.2 },
        leftUpperArm: { out: 8.5 },
        rightUpperArm: { out: 8.5 },
        leftLowerArm: { bend: 12 },
        rightLowerArm: { bend: 12 }
      }
    }
  ]
};

// src/clips/run.js
var run_default = {
  name: "run",
  loop: true,
  duration: 0.58,
  speed: 3.7,
  mirror: true,
  keys: [
    {
      t: 0,
      pose: {
        leftUpperLeg: { swing: 32 },
        leftLowerLeg: { bend: 12 },
        leftUpperArm: { swing: -35, out: 10 },
        leftLowerArm: { bend: 95 },
        hips: { bend: 3, turn: -7, lift: 0 },
        spine: { bend: 8, turn: 5 },
        chest: { bend: 5, turn: 9 },
        head: { bend: -13, turn: -7 }
      }
    },
    { t: 0.12, pose: { leftUpperLeg: { swing: 16 }, leftLowerLeg: { bend: 28 } } },
    {
      t: 0.25,
      pose: {
        leftUpperArm: { swing: -5, out: 10 },
        leftLowerArm: { bend: 85 },
        hips: { turn: 0 },
        spine: { turn: 0 },
        chest: { turn: 0 },
        head: { turn: 0 }
      }
    },
    { t: 0.28, pose: { leftUpperLeg: { swing: -8 }, leftLowerLeg: { bend: 16 }, hips: { lift: 0 } } },
    { t: 0.38, pose: { leftUpperLeg: { swing: -20 }, leftLowerLeg: { bend: 10 } } },
    { t: 0.44, pose: { hips: { lift: 0.045 } } },
    {
      t: 0.5,
      pose: {
        leftUpperArm: { swing: 45, out: 10 },
        leftLowerArm: { bend: 100 },
        hips: { turn: 7 },
        spine: { turn: -5 },
        chest: { turn: -9 },
        head: { turn: 7 }
      }
    },
    { t: 0.52, pose: { leftUpperLeg: { swing: -18 }, leftLowerLeg: { bend: 65 }, hips: { lift: 0 } } },
    { t: 0.66, pose: { leftUpperLeg: { swing: 10 }, leftLowerLeg: { bend: 105 } } },
    {
      t: 0.75,
      pose: {
        leftUpperArm: { swing: 10, out: 10 },
        leftLowerArm: { bend: 85 },
        hips: { turn: 0 },
        spine: { turn: 0 },
        chest: { turn: 0 },
        head: { turn: 0 }
      }
    },
    { t: 0.78, pose: { hips: { lift: 0 } } },
    { t: 0.8, pose: { leftUpperLeg: { swing: 44 }, leftLowerLeg: { bend: 90 } } },
    { t: 0.9, pose: { leftUpperLeg: { swing: 42 }, leftLowerLeg: { bend: 55 } } },
    { t: 0.96, pose: { leftUpperLeg: { swing: 36 }, leftLowerLeg: { bend: 25 } } },
    { t: 0.94, pose: { hips: { lift: 0.045 } } }
  ]
};

// src/clips/sprint.js
var sprint_default = {
  name: "sprint",
  loop: true,
  duration: 0.46,
  speed: 6.2,
  mirror: true,
  keys: [
    {
      t: 0,
      pose: {
        leftUpperLeg: { swing: 45 },
        leftLowerLeg: { bend: 15 },
        leftUpperArm: { swing: -50, out: 8 },
        leftLowerArm: { bend: 90 },
        hips: { bend: 5, turn: -9, lift: 0 },
        spine: { bend: 13, turn: 6 },
        chest: { bend: 10, turn: 12 },
        head: { bend: -24, turn: -9 }
      }
    },
    { t: 0.12, pose: { leftUpperLeg: { swing: 25 }, leftLowerLeg: { bend: 30 } } },
    {
      t: 0.25,
      pose: {
        leftUpperArm: { swing: 0, out: 8 },
        leftLowerArm: { bend: 80 },
        hips: { turn: 0 },
        spine: { turn: 0 },
        chest: { turn: 0 },
        head: { turn: 0 }
      }
    },
    { t: 0.28, pose: { leftUpperLeg: { swing: -10 }, leftLowerLeg: { bend: 15 }, hips: { lift: 0 } } },
    { t: 0.38, pose: { leftUpperLeg: { swing: -25 }, leftLowerLeg: { bend: 8 } } },
    { t: 0.44, pose: { hips: { lift: 0.07 } } },
    {
      t: 0.5,
      pose: {
        leftUpperArm: { swing: 70, out: 8 },
        leftLowerArm: { bend: 100 },
        hips: { turn: 9 },
        spine: { turn: -6 },
        chest: { turn: -12 },
        head: { turn: 9 }
      }
    },
    { t: 0.52, pose: { leftUpperLeg: { swing: -20 }, leftLowerLeg: { bend: 90 }, hips: { lift: 0 } } },
    { t: 0.66, pose: { leftUpperLeg: { swing: 20 }, leftLowerLeg: { bend: 125 } } },
    {
      t: 0.75,
      pose: {
        leftUpperArm: { swing: 5, out: 8 },
        leftLowerArm: { bend: 80 },
        hips: { turn: 0 },
        spine: { turn: 0 },
        chest: { turn: 0 },
        head: { turn: 0 }
      }
    },
    { t: 0.78, pose: { hips: { lift: 0 } } },
    { t: 0.8, pose: { leftUpperLeg: { swing: 68 }, leftLowerLeg: { bend: 110 } } },
    { t: 0.9, pose: { leftUpperLeg: { swing: 62 }, leftLowerLeg: { bend: 70 } } },
    { t: 0.96, pose: { leftUpperLeg: { swing: 52 }, leftLowerLeg: { bend: 30 } } },
    { t: 0.94, pose: { hips: { lift: 0.07 } } }
  ]
};

// src/clips/jump.js
var jump_default = {
  name: "jump",
  loop: false,
  duration: 0.45,
  keys: [
    {
      t: 0,
      pose: {
        ground: 0.6,
        hips: { bend: 0 },
        spine: { bend: 6 },
        chest: { bend: 2 },
        head: { bend: -6 },
        leftUpperLeg: { swing: 30 },
        leftLowerLeg: { bend: 55 },
        rightUpperLeg: { swing: -12 },
        rightLowerLeg: { bend: 12 },
        leftUpperArm: { swing: -20, out: 15 },
        rightUpperArm: { swing: 30, out: 15 },
        leftLowerArm: { bend: 60 },
        rightLowerArm: { bend: 60 }
      }
    },
    {
      t: 0.35,
      pose: {
        ground: 0,
        spine: { bend: 6 },
        chest: { bend: 0 },
        head: { bend: -10 },
        leftUpperLeg: { swing: 55 },
        leftLowerLeg: { bend: 95 },
        rightUpperLeg: { swing: 0 },
        rightLowerLeg: { bend: 45 },
        leftUpperArm: { swing: 55, out: 25 },
        rightUpperArm: { swing: 60, out: 25 },
        leftLowerArm: { bend: 40 },
        rightLowerArm: { bend: 40 }
      }
    },
    {
      t: 1,
      pose: {
        ground: 0,
        spine: { bend: 8 },
        chest: { bend: 1 },
        head: { bend: -8 },
        leftUpperLeg: { swing: 45 },
        leftLowerLeg: { bend: 90 },
        rightUpperLeg: { swing: 25 },
        rightLowerLeg: { bend: 80 },
        leftUpperArm: { swing: 35, out: 32 },
        rightUpperArm: { swing: 35, out: 32 },
        leftLowerArm: { bend: 35 },
        rightLowerArm: { bend: 35 }
      }
    }
  ]
};

// src/clips/fall.js
var fall_default = {
  name: "fall",
  loop: true,
  duration: 0.9,
  keys: [
    {
      t: 0,
      pose: {
        ground: 0,
        spine: { bend: 9 },
        chest: { bend: 2 },
        head: { bend: -8 },
        leftUpperLeg: { swing: 40 },
        leftLowerLeg: { bend: 75 },
        rightUpperLeg: { swing: 8 },
        rightLowerLeg: { bend: 55 },
        leftUpperArm: { swing: 30, out: 55 },
        rightUpperArm: { swing: 18, out: 48 },
        leftLowerArm: { bend: 35 },
        rightLowerArm: { bend: 40 }
      }
    },
    {
      t: 0.5,
      pose: {
        spine: { bend: 11 },
        chest: { bend: 3 },
        head: { bend: -9 },
        leftUpperLeg: { swing: 12 },
        leftLowerLeg: { bend: 58 },
        rightUpperLeg: { swing: 36 },
        rightLowerLeg: { bend: 72 },
        leftUpperArm: { swing: 18, out: 48 },
        rightUpperArm: { swing: 30, out: 56 },
        leftLowerArm: { bend: 40 },
        rightLowerArm: { bend: 33 }
      }
    }
  ]
};

// src/clips/land.js
var land_default = {
  name: "land",
  loop: false,
  duration: 0.4,
  keys: [
    {
      t: 0,
      pose: {
        spine: { bend: 6 },
        chest: { bend: 2 },
        head: { bend: -4 },
        leftUpperLeg: { swing: 25, out: 4 },
        leftLowerLeg: { bend: 45 },
        rightUpperLeg: { swing: 25, out: 4 },
        rightLowerLeg: { bend: 45 },
        leftUpperArm: { swing: 20, out: 30 },
        rightUpperArm: { swing: 20, out: 30 },
        leftLowerArm: { bend: 30 },
        rightLowerArm: { bend: 30 }
      }
    },
    {
      t: 0.3,
      pose: {
        spine: { bend: 16 },
        chest: { bend: 8 },
        head: { bend: -14 },
        leftUpperLeg: { swing: 55, out: 6 },
        leftLowerLeg: { bend: 95 },
        rightUpperLeg: { swing: 55, out: 6 },
        rightLowerLeg: { bend: 95 },
        leftUpperArm: { swing: 30, out: 22 },
        rightUpperArm: { swing: 30, out: 22 },
        leftLowerArm: { bend: 45 },
        rightLowerArm: { bend: 45 }
      }
    },
    {
      t: 1,
      pose: {
        spine: { bend: 3 },
        chest: { bend: 0 },
        head: { bend: 0 },
        leftUpperLeg: { swing: 8, out: 4 },
        leftLowerLeg: { bend: 12 },
        rightUpperLeg: { swing: 8, out: 4 },
        rightLowerLeg: { bend: 12 },
        leftUpperArm: { swing: 5, out: 10 },
        rightUpperArm: { swing: 5, out: 10 },
        leftLowerArm: { bend: 15 },
        rightLowerArm: { bend: 15 }
      }
    }
  ]
};

// src/clips/dash.js
var dash_default = {
  name: "dash",
  loop: false,
  duration: 0.3,
  keys: [
    {
      t: 0,
      pose: {
        spine: { bend: 18 },
        chest: { bend: 10 },
        head: { bend: -22 },
        leftUpperLeg: { swing: 45 },
        leftLowerLeg: { bend: 70 },
        rightUpperLeg: { swing: -22 },
        rightLowerLeg: { bend: 30 },
        leftUpperArm: { swing: -45, out: 18 },
        rightUpperArm: { swing: -50, out: 18 },
        leftLowerArm: { bend: 25 },
        rightLowerArm: { bend: 25 }
      }
    },
    {
      t: 1,
      pose: {
        spine: { bend: 14 },
        chest: { bend: 8 },
        head: { bend: -18 },
        leftUpperLeg: { swing: 35 },
        leftLowerLeg: { bend: 60 },
        rightUpperLeg: { swing: -15 },
        rightLowerLeg: { bend: 35 },
        leftUpperArm: { swing: -35, out: 15 },
        rightUpperArm: { swing: -40, out: 15 },
        leftLowerArm: { bend: 35 },
        rightLowerArm: { bend: 35 }
      }
    }
  ]
};

// src/clips/slide.js
var slide_default = {
  name: "slide",
  loop: false,
  duration: 1.15,
  /** the slide itself waits at this point (frame 3) until the character stands up (src/index.js) */
  hold: 0.5,
  keys: [
    {
      /* 1 dropping in: a lunge, right foot planted in front, left leg trailing, trunk forward, arms opposite */
      t: 0,
      pose: {
        ground: 1,
        hips: { bend: 5, lift: 0, side: 0 },
        spine: { bend: 12 },
        chest: { bend: 13 },
        head: { bend: 15 },
        rightUpperLeg: { swing: 77, out: 0 },
        rightLowerLeg: { bend: 70 },
        leftUpperLeg: { swing: -45, out: 0 },
        leftLowerLeg: { bend: 25 },
        rightUpperArm: { swing: -41, out: 10 },
        rightLowerArm: { bend: 31 },
        leftUpperArm: { swing: 37, out: 10 },
        leftLowerArm: { bend: 62 }
      }
    },
    {
      /* (the lunge holds a moment, so it shows through the blend from the run) */
      t: 0.05,
      pose: {
        ground: 1,
        hips: { bend: 5, lift: 0, side: 0 },
        spine: { bend: 12 },
        chest: { bend: 13 },
        head: { bend: 15 },
        rightUpperLeg: { swing: 77, out: 0 },
        rightLowerLeg: { bend: 70 },
        leftUpperLeg: { swing: -45, out: 0 },
        leftLowerLeg: { bend: 25 },
        rightUpperArm: { swing: -41, out: 10 },
        rightLowerArm: { bend: 31 },
        leftUpperArm: { swing: 37, out: 10 },
        leftLowerArm: { bend: 62 }
      }
    },
    {
      /* dropping: the front knee folds, the trailing leg swings through with its knee bent (its foot stays off the floor) */
      t: 0.1,
      pose: {
        ground: 0,
        hips: { bend: -8, lift: -0.35, side: -4 },
        spine: { bend: 0 },
        chest: { bend: 0 },
        head: { bend: 22 },
        rightUpperLeg: { swing: 62, out: 3 },
        rightLowerLeg: { bend: 105 },
        leftUpperLeg: { swing: 30, out: 0 },
        leftLowerLeg: { bend: 118 },
        rightUpperArm: { swing: -48, out: 16 },
        rightLowerArm: { bend: 18 },
        leftUpperArm: { swing: 45, out: 10 },
        leftLowerArm: { bend: 35 }
      }
    },
    {
      /* touching down: both legs coming forward, still bent */
      t: 0.14,
      pose: {
        ground: 0,
        hips: { bend: -22, lift: -0.38, side: -8 },
        spine: { bend: -6 },
        chest: { bend: -6 },
        head: { bend: 30 },
        leftUpperLeg: { swing: 42, out: 0 },
        leftLowerLeg: { bend: 75 },
        rightUpperLeg: { swing: 30, out: 5 },
        rightLowerLeg: { bend: 122 },
        rightUpperArm: { swing: -50, out: 20 },
        rightLowerArm: { bend: 20 },
        leftUpperArm: { swing: 44, out: 10 },
        leftLowerArm: { bend: 20 }
      }
    },
    {
      /* 2 sliding: tipped back on the right hip, left leg out in front, right knee down (shin tucked), right hand down
         behind, left arm forward and up */
      t: 0.19,
      pose: {
        ground: 0,
        hips: { bend: -36, lift: -0.55, side: -12 },
        spine: { bend: -12 },
        chest: { bend: -12 },
        head: { bend: 36 },
        leftUpperLeg: { swing: 50, out: 0 },
        leftLowerLeg: { bend: 27 },
        rightUpperLeg: { swing: 2, out: 6 },
        rightLowerLeg: { bend: 128 },
        rightUpperArm: { swing: -50, out: 24 },
        rightLowerArm: { bend: 20 },
        leftUpperArm: { swing: 43, out: 10 },
        leftLowerArm: { bend: 7 }
      }
    },
    {
      /* the tucked right leg comes out: knee up first, then the shin swings forward (it never pokes down through the floor) */
      t: 0.32,
      pose: {
        ground: 0,
        hips: { bend: -36, lift: -0.68, side: -12 },
        spine: { bend: -9 },
        chest: { bend: -9 },
        head: { bend: 36 },
        leftUpperLeg: { swing: 58, out: 0 },
        leftLowerLeg: { bend: 35 },
        rightUpperLeg: { swing: 70, out: 6 },
        rightLowerLeg: { bend: 120 },
        rightUpperArm: { swing: -50, out: 26 },
        rightLowerArm: { bend: 30 },
        leftUpperArm: { swing: 44, out: 9 },
        leftLowerArm: { bend: 6 }
      }
    },
    {
      t: 0.41,
      pose: {
        ground: 0,
        hips: { bend: -38, lift: -0.73, side: -12 },
        spine: { bend: -8 },
        chest: { bend: -8 },
        head: { bend: 36 },
        leftUpperLeg: { swing: 60, out: 0 },
        leftLowerLeg: { bend: 32 },
        rightUpperLeg: { swing: 62, out: 5 },
        rightLowerLeg: { bend: 45 },
        rightUpperArm: { swing: -50, out: 27 },
        rightLowerArm: { bend: 45 },
        leftUpperArm: { swing: 42, out: 8 },
        leftLowerArm: { bend: 5 }
      }
    },
    {
      /* 3 lying back, lower: both legs out in front (right straight along the floor, left knee up), right hand on the
         floor behind, left arm forward. The slide waits here. */
      t: 0.5,
      pose: {
        ground: 0,
        hips: { bend: -44, lift: -0.77, side: -12 },
        spine: { bend: -11 },
        chest: { bend: -11 },
        head: { bend: 36 },
        rightUpperLeg: { swing: 44, out: 4 },
        rightLowerLeg: { bend: 2 },
        leftUpperLeg: { swing: 66, out: 0 },
        leftLowerLeg: { bend: 48 },
        rightUpperArm: { swing: -50, out: 28 },
        rightLowerArm: { bend: 55 },
        leftUpperArm: { swing: 40, out: 8 },
        leftLowerArm: { bend: 5 }
      }
    },
    {
      /* sitting up: trunk upright, both knees up with the feet pulled in to the hips, the right hand on the floor
         behind (a knee comes UP to fold its leg: a shin folding down from a leg lying on the floor would go through it) */
      t: 0.62,
      pose: {
        ground: 1,
        hips: { bend: -25, lift: 0, side: -4 },
        spine: { bend: 8 },
        chest: { bend: 8 },
        head: { bend: 15 },
        rightUpperLeg: { swing: 95, out: 4 },
        rightLowerLeg: { bend: 125 },
        leftUpperLeg: { swing: 90, out: 0 },
        leftLowerLeg: { bend: 120 },
        rightUpperArm: { swing: -30, out: 20 },
        rightLowerArm: { bend: 10 },
        leftUpperArm: { swing: 45, out: 10 },
        leftLowerArm: { bend: 30 }
      }
    },
    /* (the right foot sweeps down between these two keys and would bob the body up: sink it that moment) */
    { t: 0.65, pose: { hips: { lift: -0.09 } } },
    {
      /* rolling forward onto the right knee */
      t: 0.68,
      pose: {
        ground: 1,
        hips: { bend: 0, lift: 0, side: -2 },
        spine: { bend: 18 },
        chest: { bend: 18 },
        head: { bend: 18 },
        rightUpperLeg: { swing: 25, out: 2 },
        rightLowerLeg: { bend: 124 },
        leftUpperLeg: { swing: 106, out: 0 },
        leftLowerLeg: { bend: 115 },
        rightUpperArm: { swing: 40, out: 25 },
        rightLowerArm: { bend: 0 },
        leftUpperArm: { swing: 55, out: 25 },
        leftLowerArm: { bend: 30 }
      }
    },
    {
      /* 4 getting up: rolled forward over the legs, right knee down, left foot planted in front, right hand on the floor */
      t: 0.8,
      pose: {
        ground: 1,
        hips: { bend: 10, lift: 0, side: 0 },
        spine: { bend: 24 },
        chest: { bend: 24 },
        head: { bend: 20 },
        rightUpperLeg: { swing: 10, out: 0 },
        rightLowerLeg: { bend: 122 },
        leftUpperLeg: { swing: 104, out: 0 },
        leftLowerLeg: { bend: 100 },
        rightUpperArm: { swing: 55, out: 22 },
        rightLowerArm: { bend: 0 },
        leftUpperArm: { swing: 60, out: 35 },
        leftLowerArm: { bend: 35 }
      }
    },
    {
      /* 5 kneeling, rising: right knee down, left foot in front, trunk nearly upright, arms hanging */
      t: 1,
      pose: {
        ground: 1,
        hips: { bend: 4, lift: 0, side: 0 },
        spine: { bend: 8 },
        chest: { bend: 6 },
        head: { bend: 22 },
        rightUpperLeg: { swing: 4, out: 0 },
        rightLowerLeg: { bend: 120 },
        leftUpperLeg: { swing: 99, out: 0 },
        leftLowerLeg: { bend: 99 },
        rightUpperArm: { swing: 23, out: 12 },
        rightLowerArm: { bend: 20 },
        leftUpperArm: { swing: 33, out: 10 },
        leftLowerArm: { bend: 25 }
      }
    }
  ]
};

// src/clips/climb.js
var climb_default = {
  name: "climb",
  loop: false,
  duration: 0.75,
  keys: [
    {
      /* reaching for the edge: looking up at it */
      t: 0,
      pose: {
        ground: 0,
        hips: { bend: 10 },
        spine: { bend: 4 },
        chest: { bend: 0 },
        head: { bend: -22 },
        leftUpperArm: { swing: 110, out: 12 },
        rightUpperArm: { swing: 110, out: 12 },
        leftLowerArm: { bend: 20 },
        rightLowerArm: { bend: 20 },
        leftUpperLeg: { swing: 12 },
        leftLowerLeg: { bend: 35 },
        rightUpperLeg: { swing: 28 },
        rightLowerLeg: { bend: 55 }
      }
    },
    {
      /* 1 hanging: body upright and close, elbows bent, knees bent with the feet on the wall, looking at the edge */
      t: 0.24,
      pose: {
        ground: 0,
        hips: { bend: 4 },
        spine: { bend: 2 },
        chest: { bend: 0 },
        head: { bend: -12 },
        leftUpperArm: { swing: 70, out: 12 },
        rightUpperArm: { swing: 70, out: 12 },
        leftLowerArm: { bend: 105 },
        rightLowerArm: { bend: 105 },
        leftUpperLeg: { swing: 48 },
        leftLowerLeg: { bend: 60 },
        rightUpperLeg: { swing: 46 },
        rightLowerLeg: { bend: 58 }
      }
    },
    {
      /* 2 knee up: the left knee high (foot on the wall under the edge), the right leg hanging, chest rising to the edge */
      t: 0.58,
      pose: {
        ground: 0,
        hips: { bend: -6 },
        spine: { bend: 14 },
        chest: { bend: 10 },
        head: { bend: 2 },
        leftUpperArm: { swing: 20, out: 14 },
        rightUpperArm: { swing: 20, out: 14 },
        leftLowerArm: { bend: 125 },
        rightLowerArm: { bend: 125 },
        leftUpperLeg: { swing: 88 },
        leftLowerLeg: { bend: 118 },
        rightUpperLeg: { swing: 22 },
        rightLowerLeg: { bend: 20 }
      }
    },
    {
      /* 3 over the edge: the trunk folds forward over the top, head down, arms pressing, the left knee on the top, the
         right leg hanging down the face */
      t: 0.76,
      pose: {
        ground: 0.3,
        hips: { bend: 26 },
        spine: { bend: 18 },
        chest: { bend: 14 },
        head: { bend: 24 },
        leftUpperArm: { swing: 45, out: 16 },
        rightUpperArm: { swing: 45, out: 16 },
        leftLowerArm: { bend: 20 },
        rightLowerArm: { bend: 20 },
        leftUpperLeg: { swing: 88 },
        leftLowerLeg: { bend: 125 },
        rightUpperLeg: { swing: 26 },
        rightLowerLeg: { bend: 18 }
      }
    },
    {
      /* 4 standing up on top */
      t: 1,
      pose: {
        ground: 1,
        hips: { bend: 2 },
        spine: { bend: 4 },
        chest: { bend: 1 },
        head: { bend: -2 },
        leftUpperArm: { swing: 5, out: 12 },
        rightUpperArm: { swing: 5, out: 12 },
        leftLowerArm: { bend: 20 },
        rightLowerArm: { bend: 20 },
        leftUpperLeg: { swing: 20 },
        leftLowerLeg: { bend: 35 },
        rightUpperLeg: { swing: 4 },
        rightLowerLeg: { bend: 10 }
      }
    }
  ]
};

// src/clips/index.js
var CLIPS = [idle_default, run_default, sprint_default, jump_default, fall_default, land_default, dash_default, slide_default, climb_default];

// src/physics.js
import { addBroadphaseLayer, addObjectLayer, createWorld, createWorldSettings, enableCollision, registerAll, rigidBody as rigidBody3, updateWorld, box as box2, MotionType as MotionType3 } from "crashcat";
var registered = false;
function createPhysics(o = {}) {
  if (!registered) {
    registerAll();
    registered = true;
  }
  const settings = createWorldSettings();
  const moving = addObjectLayer(settings, addBroadphaseLayer(settings));
  const still = addObjectLayer(settings, addBroadphaseLayer(settings));
  enableCollision(settings, moving, still);
  enableCollision(settings, moving, moving);
  const world = createWorld(settings);
  const g = Array.isArray(o.gravity) && o.gravity.length === 3 ? o.gravity : [0, -9.81, 0];
  world.settings.gravity = g.map((v) => Number(v) || 0);
  const links = /* @__PURE__ */ new Map();
  const physics = {
    /** the crashcat world: rigidBody.create(physics.world, ...), castRay(physics.world, ...) */
    world,
    /** objectLayer for rigidBody.create: static (never moves) or moving (dynamic and kinematic) */
    layers: Object.freeze({ moving, static: still }),
    /** crashcat contact callbacks (onContactAdded, ...); the ragdoll library adds its own without replacing yours */
    listener: void 0,
    /** advance by dt seconds (use a fixed step, e.g. 1/60) */
    step(dt) {
      if (!(dt > 0)) return;
      for (const l of links.values()) {
        const b = rigidBody3.get(world, l.id);
        if (b) {
          l.p = Array.from(b.position);
          l.q = Array.from(b.quaternion);
        }
      }
      updateWorld(world, physics.listener, dt);
    },
    /** move linked meshes to their bodies; alpha 0..1 draws between the last two steps */
    sync(alpha = 1) {
      const t = alpha > 0 ? alpha < 1 ? alpha : 1 : 0;
      for (const [obj, l] of links) {
        const b = rigidBody3.get(world, l.id);
        if (!b) {
          links.delete(obj);
          continue;
        }
        const p = b.position, q = b.quaternion, a = l.q;
        obj.position.set(l.p[0] + (p[0] - l.p[0]) * t, l.p[1] + (p[1] - l.p[1]) * t, l.p[2] + (p[2] - l.p[2]) * t);
        const sg = a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3] < 0 ? -1 : 1;
        const x = a[0] + (sg * q[0] - a[0]) * t, y = a[1] + (sg * q[1] - a[1]) * t, z = a[2] + (sg * q[2] - a[2]) * t, w = a[3] + (sg * q[3] - a[3]) * t;
        const n = Math.hypot(x, y, z, w) || 1;
        obj.quaternion.set(x / n, y / n, z / n, w / n);
      }
    },
    /** make a three.js object follow a crashcat body; returns the object */
    link(object, body) {
      const b = rigidBody3.get(world, typeof body === "number" ? body : body && body.id);
      if (!b) throw new Error("physics.link: that body is not in this world");
      links.set(object, { id: b.id, p: Array.from(b.position), q: Array.from(b.quaternion) });
      return object;
    }
  };
  if (o.floor) {
    const h = Math.max(1, Number(o.floor) || 100) / 2;
    rigidBody3.create(world, { shape: box2.create({ halfExtents: [h, 0.5, h] }), motionType: MotionType3.STATIC, objectLayer: still, position: [0, -0.5, 0] });
  }
  return physics;
}

// src/skin/boxes.js
import * as THREE from "three";
var unitBox = null;
var materials = /* @__PURE__ */ new Map();
function material(hex) {
  let m = materials.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0 });
    materials.set(hex, m);
  }
  return m;
}
function createBoxSkin(parts, colors, s) {
  unitBox ||= new THREE.BoxGeometry(1, 1, 1);
  const root = new THREE.Group();
  root.name = "ragdoll";
  const groups = parts.map((p) => {
    const g = new THREE.Group();
    g.name = p.def.name;
    const origin = p.def.boxes[0].c;
    for (const b of p.def.boxes) {
      const mesh = new THREE.Mesh(unitBox, material(colors[b.color] || "#ff00ff"));
      mesh.name = b.bone || b.color;
      mesh.position.set((b.c[0] - origin[0]) * s, (b.c[1] - origin[1]) * s, (b.c[2] - origin[2]) * s);
      mesh.scale.set(b.h[0] * 2 * s, b.h[1] * 2 * s, b.h[2] * 2 * s);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    root.add(g);
    return g;
  });
  return {
    object3d: root,
    /** move every part group to its body's draw transform */
    update(bodyParts) {
      for (let i = 0; i < groups.length; i++) {
        const p = bodyParts[i];
        groups[i].position.set(p.drawP[0], p.drawP[1], p.drawP[2]);
        groups[i].quaternion.set(p.drawQ[0], p.drawQ[1], p.drawQ[2], p.drawQ[3]);
      }
    },
    dispose() {
      root.removeFromParent();
    }
  };
}

// src/skin/model.js
import * as THREE2 from "three";
var ALIASES = {
  hips: ["hips", "hip", "pelvis"],
  head: ["head"],
  UpperArm: ["upperarm", "arm", "uparm"],
  LowerArm: ["lowerarm", "forearm"],
  UpperLeg: ["upperleg", "upleg", "thigh"],
  LowerLeg: ["lowerleg", "leg", "calf", "shin"],
  Hand: ["hand", "wrist"],
  Foot: ["foot", "ankle"]
};
var NOISE = /* @__PURE__ */ new Set(["mixamorig", "j", "bip", "bip01", "cc", "base", "def", "org", "mch", "b", "jnt", "bn", "sk", "armature", "rig", "bone"]);
var SIDE = { left: "left", l: "left", right: "right", r: "right" };
function boneWords(name) {
  const words = String(name).replace(/^.*[:|]/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let side = null;
  const core = [];
  for (const w of words) {
    if (SIDE[w]) side = SIDE[w];
    else if (!NOISE.has(w) && !/^\d+$/.test(w)) core.push(w);
  }
  return { side, core: core.join("") };
}
var depth = (o) => {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
};
var isAncestor = (a, b) => {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
};
function mapBones(root) {
  const all = [];
  root.traverse((o) => {
    if (o.isBone) all.push(o);
  });
  const find = (key2, side) => all.filter((b) => {
    const w = boneWords(b.name);
    return ALIASES[key2].includes(w.core) && (side ? w.side === side : !w.side);
  }).sort((a, b) => depth(a) - depth(b))[0] || null;
  const bones = {}, hand = {}, foot = {};
  bones.hips = find("hips");
  bones.head = find("head");
  const chain = [];
  if (bones.hips && bones.head && isAncestor(bones.hips, bones.head)) {
    for (let p = bones.head.parent; p && p !== bones.hips; p = p.parent) if (p.isBone) chain.unshift(p);
  }
  const trunk = chain.filter((b) => !boneWords(b.name).core.includes("neck"));
  bones.spine = trunk[0] || null;
  bones.chest = trunk.length > 1 ? trunk[trunk.length - 1] : null;
  for (const side of ["left", "right"]) {
    for (const k of ["UpperArm", "LowerArm", "UpperLeg", "LowerLeg"]) bones[`${side}${k}`] = find(k, side);
    hand[side] = find("Hand", side);
    foot[side] = find("Foot", side);
    for (const [u, l] of [["UpperArm", "LowerArm"], ["UpperLeg", "LowerLeg"]]) {
      if (bones[`${side}${u}`] && bones[`${side}${l}`] && !isAncestor(bones[`${side}${u}`], bones[`${side}${l}`])) bones[`${side}${l}`] = null;
    }
  }
  const missing = PARTS.map((p) => p.name).filter((n) => !bones[n] && n !== "spine");
  return { bones, hand, foot, missing };
}
function cloneModel(source) {
  const copy = source.clone(true);
  const pairs = /* @__PURE__ */ new Map();
  const walk = (a, b) => {
    pairs.set(a, b);
    a.children.forEach((c, i) => walk(c, b.children[i]));
  };
  walk(source, copy);
  source.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const mesh = pairs.get(o);
    mesh.bind(new THREE2.Skeleton(o.skeleton.bones.map((b) => pairs.get(b)), o.skeleton.boneInverses), o.bindMatrix);
  });
  return copy;
}
function inspectModel(model) {
  if (!model || typeof model.traverse !== "function") return { ok: false, error: "model must be a three.js Object3D (e.g. gltf.scene)", bones: {}, missing: [] };
  let skinned = 0;
  model.traverse((o) => {
    if (o.isSkinnedMesh) skinned++;
  });
  const map = mapBones(model);
  model.updateMatrixWorld(true);
  const box3 = new THREE2.Box3().setFromObject(model);
  const wp = (b) => b.getWorldPosition(new THREE2.Vector3());
  let facing = "+z", restPose = "unknown";
  if (map.bones.leftUpperLeg && map.bones.rightUpperLeg) facing = wp(map.bones.leftUpperLeg).x >= wp(map.bones.rightUpperLeg).x ? "+z" : "-z";
  if (map.bones.leftUpperArm && map.bones.leftLowerArm) {
    const d = wp(map.bones.leftLowerArm).sub(wp(map.bones.leftUpperArm)).normalize();
    const fromDown = Math.acos(Math.max(-1, Math.min(1, -d.y))) * 180 / Math.PI;
    restPose = fromDown > 70 ? "T-pose" : fromDown > 25 ? "A-pose" : "arms down";
  }
  const bones = Object.fromEntries(PARTS.map((p) => [p.name, map.bones[p.name]?.name ?? null]));
  const ok = skinned > 0 && map.missing.length === 0;
  return {
    ok,
    bones,
    missing: map.missing,
    skinnedMeshes: skinned,
    height: +(box3.max.y - box3.min.y).toFixed(3),
    facing,
    restPose,
    ...ok ? {} : { error: skinned ? `no bone found for: ${map.missing.join(", ")}` : "no skinned mesh (the model is not rigged)" }
  };
}
var UP = new THREE2.Vector3(0, 1, 0);
var DOWN = new THREE2.Vector3(0, -1, 0);
var FWD = new THREE2.Vector3(0, 0, 1);
var REST_DIR = { hips: UP, spine: UP, chest: UP, head: UP };
for (const s of ["left", "right"]) for (const k of ["UpperArm", "LowerArm", "UpperLeg", "LowerLeg"]) REST_DIR[`${s}${k}`] = DOWN;
function frame(dir, hint) {
  const y = dir.clone().normalize();
  const z = hint.clone().sub(y.clone().multiplyScalar(hint.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
  z.normalize();
  const x = new THREE2.Vector3().crossVectors(y, z);
  return new THREE2.Quaternion().setFromRotationMatrix(new THREE2.Matrix4().makeBasis(x, y, z));
}
var curves = /* @__PURE__ */ new WeakMap();
function clipCurves(clip, hipsName) {
  let c = curves.get(clip);
  if (!c) {
    c = [];
    for (const t of clip.tracks) {
      const dot2 = t.name.lastIndexOf("."), bone = t.name.slice(0, dot2), what = t.name.slice(dot2 + 1);
      if (what === "quaternion" || what === "position" && bone === hipsName) c.push({ bone, what, curve: t.createInterpolant() });
    }
    curves.set(clip, c);
  }
  return c;
}
function createModelSkin(source, o) {
  const info = inspectModel(source);
  if (!info.ok) return null;
  const s = o.s;
  const object3d = new THREE2.Group();
  object3d.name = "ragdoll-model";
  const model = cloneModel(source);
  if (info.facing === "-z") model.rotation.y = Math.PI;
  object3d.add(model);
  object3d.scale.setScalar(o.height / info.height);
  object3d.updateMatrixWorld(true);
  model.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });
  const { bones, hand, foot } = mapBones(model);
  const names = PARTS.map((p) => p.name);
  const wp = (b) => b.getWorldPosition(new THREE2.Vector3());
  const wq = (b) => b.getWorldQuaternion(new THREE2.Quaternion());
  const child = {
    hips: bones.spine || bones.chest || bones.head,
    spine: bones.chest || bones.head,
    chest: bones.head,
    leftUpperArm: bones.leftLowerArm,
    leftLowerArm: hand.left,
    rightUpperArm: bones.rightLowerArm,
    rightLowerArm: hand.right,
    leftUpperLeg: bones.leftLowerLeg,
    leftLowerLeg: foot.left,
    rightUpperLeg: bones.rightLowerLeg,
    rightLowerLeg: foot.right
  };
  const drive = [];
  for (let i = 0; i < names.length; i++) {
    const part = names[i], bone = bones[part];
    if (!bone) continue;
    let dir2 = null;
    const c = child[part] || bone.children.find((x) => x.isBone);
    if (c && part !== "head") dir2 = wp(c).sub(wp(bone));
    if (!dir2 || dir2.lengthSq() < 1e-10) dir2 = part.includes("Leg") || part.includes("Arm") ? DOWN.clone() : UP.clone();
    const rest = wq(bone);
    const align = frame(REST_DIR[part], FWD).multiply(frame(dir2, FWD).invert());
    drive.push({ i, part, bone, rest, align, local: new THREE2.Quaternion(), world: new THREE2.Quaternion(), up: null, between: new THREE2.Quaternion() });
  }
  const hipsParentWorld = wq(bones.hips.parent);
  for (const d of drive) {
    const between = new THREE2.Quaternion();
    let p = d.bone.parent;
    const chain = [];
    while (p && !drive.some((x) => x.bone === p) && p !== bones.hips.parent) {
      chain.unshift(p);
      p = p.parent;
    }
    d.up = drive.find((x) => x.bone === p) || null;
    for (const b of chain) between.multiply(b.quaternion);
    d.between.copy(d.up ? between : hipsParentWorld.clone().multiply(between));
  }
  const box3 = new THREE2.Box3().setFromObject(model);
  const legMidModel = wp(bones.leftUpperLeg).add(wp(bones.rightUpperLeg)).multiplyScalar(0.5);
  const legScale = (legMidModel.y - box3.min.y) / (JOINTS.leftUpperLeg.pivot[1] * s);
  const hipsFromLegMid = wp(bones.hips).sub(legMidModel);
  const hipsParentInverse = bones.hips.parent.matrixWorld.clone().invert();
  const partOrigin = (name) => PARTS.find((p) => p.name === name).boxes[0].c;
  const local = (name, point) => new THREE2.Vector3(...point).sub(new THREE2.Vector3(...partOrigin(name))).multiplyScalar(s);
  const hipPivot = { left: local("leftUpperLeg", JOINTS.leftUpperLeg.pivot), right: local("rightUpperLeg", JOINTS.rightUpperLeg.pivot) };
  const soleOf = (side2) => {
    const f = PARTS.find((p) => p.name === `${side2}LowerLeg`).boxes[1];
    return local(`${side2}LowerLeg`, [f.c[0], f.c[1] - f.h[1], f.c[2]]);
  };
  const sole = { left: soleOf("left"), right: soleOf("right") };
  const iOf = Object.fromEntries(names.map((n, i) => [n, i]));
  const endOf = (name) => {
    const b = PARTS.find((p) => p.name === name).boxes[0];
    return local(name, [b.c[0], b.c[1] - b.h[1], b.c[2]]);
  };
  const limbs = [];
  for (const side2 of ["left", "right"]) {
    for (const [up2, low, end] of [["UpperArm", "LowerArm", hand[side2]], ["UpperLeg", "LowerLeg", foot[side2]]]) {
      const a = bones[`${side2}${up2}`], b = bones[`${side2}${low}`];
      if (!a || !b || !end) continue;
      limbs.push({
        a,
        b,
        end,
        lower: iOf[`${side2}${low}`],
        upper: iOf[`${side2}${up2}`],
        body: iOf[up2 === "UpperArm" ? "chest" : "hips"],
        root: local(`${side2}${up2}`, JOINTS[`${side2}${up2}`].pivot),
        mid: local(`${side2}${low}`, JOINTS[`${side2}${low}`].pivot),
        tip: endOf(`${side2}${low}`),
        l1: wp(b).distanceTo(wp(a)),
        l2: wp(end).distanceTo(wp(b))
      });
    }
  }
  const S = new THREE2.Vector3(), E = new THREE2.Vector3(), W = new THREE2.Vector3(), T = new THREE2.Vector3(), P = new THREE2.Vector3();
  const dir = new THREE2.Vector3(), want = new THREE2.Vector3(), turn = new THREE2.Quaternion(), pw = new THREE2.Quaternion(), bw = new THREE2.Quaternion();
  const side = new THREE2.Vector3(), shift = new THREE2.Vector3();
  const turnBone = (x, rot) => {
    x.getWorldQuaternion(bw);
    x.parent.getWorldQuaternion(pw);
    x.quaternion.copy(pw.invert().multiply(rot.clone().multiply(bw)));
    x.updateMatrixWorld(true);
  };
  function reach(limb, parts) {
    const part = parts[limb.lower];
    limb.a.getWorldPosition(S);
    limb.b.getWorldPosition(E);
    limb.end.getWorldPosition(W);
    side.set(1, 0, 0).applyQuaternion(partQ(parts[limb.body]));
    shift.copy(side).multiplyScalar(side.dot(dir.copy(S).sub(pointOf(parts[limb.upper], limb.root))));
    T.copy(pointOf(part, limb.tip)).add(shift);
    P.copy(pointOf(part, limb.mid)).add(shift);
    dir.copy(T).sub(S);
    const d = Math.min(Math.max(dir.length(), Math.abs(limb.l1 - limb.l2) + 1e-4), (limb.l1 + limb.l2) * 0.9995);
    dir.normalize();
    const along = (limb.l1 * limb.l1 - limb.l2 * limb.l2 + d * d) / (2 * d);
    const out = Math.sqrt(Math.max(0, limb.l1 * limb.l1 - along * along));
    P.sub(S);
    P.addScaledVector(dir, -P.dot(dir));
    if (P.lengthSq() < 1e-10) {
      P.copy(E).sub(S);
      P.addScaledVector(dir, -P.dot(dir));
    }
    P.normalize();
    want.copy(S).addScaledVector(dir, along).addScaledVector(P, out);
    turn.setFromUnitVectors(E.sub(S).normalize(), T.copy(want).sub(S).normalize());
    turnBone(limb.a, turn);
    limb.b.getWorldPosition(E);
    limb.end.getWorldPosition(W);
    T.copy(pointOf(part, limb.tip)).add(shift);
    turn.setFromUnitVectors(W.sub(E).normalize(), T.sub(E).normalize());
    turnBone(limb.b, turn);
  }
  const hipsParent = bones.hips.parent;
  const hipsParentMatrix = hipsParent.matrixWorld.clone();
  const restFloor = box3.min.y;
  const actBones = [];
  bones.hips.traverse((b) => {
    if (b.isBone) actBones.push({ bone: b, upper: false, ours: new THREE2.Quaternion(), rest: b.quaternion.clone(), driven: drive.some((d) => d.bone === b) });
  });
  const loose = actBones.filter((a) => !a.driven);
  let touched = false;
  const upperRoot = bones.spine || bones.chest;
  if (upperRoot) upperRoot.traverse((b) => {
    const x = actBones.find((a) => a.bone === b);
    if (x) x.upper = true;
  });
  const byName = new Map(actBones.map((a) => [a.bone.name, a]));
  for (const a of actBones) a.goal = new THREE2.Quaternion();
  const clips = /* @__PURE__ */ new Map();
  for (const c of Array.isArray(o.animations) ? o.animations : []) {
    if (c && Array.isArray(c.tracks) && typeof c.name === "string" && !clips.has(c.name)) clips.set(c.name, c);
  }
  const bound = /* @__PURE__ */ new Map();
  const bind = (name) => {
    if (!bound.has(name)) {
      bound.set(name, clipCurves(clips.get(name), bones.hips.name).filter((x) => byName.has(x.bone) && x.bone !== hipsParent.name).map((x) => ({ ...x, a: byName.get(x.bone) })));
    }
    return bound.get(name);
  };
  const oursHips = new THREE2.Vector3(), goalHips = new THREE2.Vector3(), yawQ = new THREE2.Quaternion();
  const hipsParentQ = wq(hipsParent), hipsParentQInv = hipsParentQ.clone().invert();
  const Y2 = new THREE2.Vector3(0, 1, 0), clipHips = new THREE2.Vector3(), cq = new THREE2.Quaternion(), cp = new THREE2.Vector3();
  function applyAct(act) {
    const slots = act.slots.filter((x) => clips.has(x.name) && x.weight > 0);
    if (!slots.length || !(act.up > 0 || act.low > 0)) return;
    for (const a of actBones) {
      a.ours.copy(a.bone.quaternion);
      a.goal.copy(a.ours);
      a.got = 0;
    }
    oursHips.copy(bones.hips.position);
    let hipsGot = 0;
    for (const slot of slots) {
      const t = Math.min(slot.time, clips.get(slot.name).duration);
      for (const x of bind(slot.name)) {
        const r = x.curve.evaluate(t);
        if (x.what === "quaternion") {
          cq.fromArray(r);
          if (!x.a.got) x.a.goal.copy(cq);
          else x.a.goal.slerp(cq, slot.weight / (x.a.got + slot.weight));
          x.a.got += slot.weight;
        } else {
          cp.fromArray(r);
          if (!hipsGot) goalHips.copy(cp);
          else goalHips.lerp(cp, slot.weight / (hipsGot + slot.weight));
          hipsGot += slot.weight;
        }
      }
    }
    yawQ.setFromAxisAngle(Y2, act.yaw);
    const hipsA = byName.get(bones.hips.name);
    if (hipsA.got) hipsA.goal.premultiply(hipsParentQ).premultiply(yawQ).premultiply(hipsParentQInv);
    if (hipsGot) {
      clipHips.copy(goalHips).applyMatrix4(hipsParentMatrix);
      clipHips.y -= restFloor;
      clipHips.applyQuaternion(yawQ).add(v.set(act.feet[0], act.feet[1], act.feet[2]));
      bones.hips.position.copy(clipHips.applyMatrix4(hipsParentInverse)).lerp(oursHips, 1 - act.low);
    }
    for (const a of actBones) a.bone.quaternion.copy(a.ours).slerp(a.goal, a.upper ? act.up : act.low);
  }
  const cycles = /* @__PURE__ */ new Map();
  let probe = null;
  function cycle(name) {
    if (cycles.has(name)) return cycles.get(name);
    const clip = clips.get(name);
    probe ||= source.clone(true);
    const pm = mapBones(probe), pBy = /* @__PURE__ */ new Map();
    probe.traverse((b) => {
      if (b.isBone) pBy.set(b.name, b);
    });
    const feet = [pm.foot.left || pm.bones.leftLowerLeg, pm.foot.right || pm.bones.rightLowerLeg];
    const sign = info.facing === "-z" ? -1 : 1, N = 96, dt = clip.duration / N, P2 = new THREE2.Vector3();
    const rest = [...pBy.values()].map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    const samples = [];
    for (let i = 0; i <= N; i++) {
      for (const x of clipCurves(clip, bones.hips.name)) {
        const b = pBy.get(x.bone);
        if (!b) continue;
        const r = x.curve.evaluate(i * dt);
        if (x.what === "quaternion") b.quaternion.fromArray(r);
        else b.position.fromArray(r);
      }
      probe.updateMatrixWorld(true);
      samples.push(feet.map((f) => {
        f.getWorldPosition(P2);
        const toe = f.children.find((c2) => c2.isBone);
        let y = P2.y, z = P2.z * sign;
        if (toe) {
          toe.getWorldPosition(P2);
          if (P2.y < y) {
            y = P2.y;
            z = P2.z * sign;
          }
        }
        return [y, z];
      }));
    }
    for (const [b, q0, p0] of rest) {
      b.quaternion.copy(q0);
      b.position.copy(p0);
    }
    let sum = 0, n = 0, front = 0;
    const lowest = [0, 1].map((f) => Math.min(...samples.map((x) => x[f][0])));
    for (let i = 0; i < N; i++) {
      for (const f of [0, 1]) {
        if (samples[i][f][0] < lowest[f] + 0.025 && samples[i + 1][f][0] < lowest[f] + 0.025) {
          sum += -(samples[i + 1][f][1] - samples[i][f][1]) / dt;
          n++;
        }
      }
      if (samples[i][0][1] > samples[front][0][1]) front = i;
    }
    const speed = n ? Math.max(0, sum / n) * (o.height / info.height) : 0;
    const c = { duration: clip.duration, speed: speed > 0.2 ? speed : 0, phase0: front / N };
    cycles.set(name, c);
    return c;
  }
  const q = new THREE2.Quaternion(), inv = new THREE2.Quaternion(), v = new THREE2.Vector3(), mid = new THREE2.Vector3(), anchor = new THREE2.Vector3();
  const partQ = (p) => q.set(p.drawQ[0], p.drawQ[1], p.drawQ[2], p.drawQ[3]);
  const pointOf = (p, offset) => v.copy(offset).applyQuaternion(partQ(p)).add(new THREE2.Vector3(p.drawP[0], p.drawP[1], p.drawP[2]));
  return {
    object3d,
    info,
    /** the names of the model's own animations (hero.act) */
    acts: [...clips.keys()],
    /** how long one of them lasts (s) */
    clipDuration: (name) => clips.get(name)?.duration ?? 0,
    /** a clip's cycle: { duration, speed (m/s it shows, 0 = in place), phase0 (left foot furthest forward, 0..1) } */
    cycle: (name) => clips.has(name) ? cycle(name) : null,
    /**
     * Pose every driven bone like its part (parts: the character's drawn parts or the limp bodies, in rig order).
     * support: 1 = standing on its feet, 0 = hanging from its hands (climbing), eased in between by the caller.
     * layers: the model's own animations over it, in order (see applyAct): its moves, then an act; null = none.
     */
    update(parts, support = 1, layers = null) {
      if (touched) for (const a of loose) a.bone.quaternion.copy(a.rest);
      for (const d of drive) {
        d.world.copy(partQ(parts[d.i])).multiply(d.align).multiply(d.rest);
        const parentWorld = d.up ? inv.copy(d.up.world).multiply(d.between) : inv.copy(d.between);
        d.local.copy(parentWorld.invert()).multiply(d.world);
        d.bone.quaternion.copy(d.local);
      }
      mid.copy(pointOf(parts[iOf.leftUpperLeg], hipPivot.left)).add(pointOf(parts[iOf.rightUpperLeg], hipPivot.right)).multiplyScalar(0.5);
      const lowY = Math.min(pointOf(parts[iOf.leftLowerLeg], sole.left).y, pointOf(parts[iOf.rightLowerLeg], sole.right).y);
      anchor.set(mid.x, lowY, mid.z);
      mid.sub(anchor).multiplyScalar(1 + (legScale - 1) * support).add(anchor);
      const hipsTurn = drive[0].part === "hips" ? q.copy(drive[0].world).multiply(inv.copy(drive[0].rest).invert()) : q.identity();
      mid.add(v.copy(hipsFromLegMid).applyQuaternion(hipsTurn));
      bones.hips.position.copy(mid.applyMatrix4(hipsParentInverse));
      object3d.updateMatrixWorld(true);
      for (const limb of limbs) reach(limb, parts);
      if (layers && clips.size) {
        let any = false;
        for (const l of layers) if (l) {
          applyAct(l);
          any = true;
        }
        if (any) {
          touched = true;
          object3d.updateMatrixWorld(true);
        }
      }
    },
    dispose() {
      object3d.removeFromParent();
    }
  };
}

// src/moves.js
var NAMES = {
  idle: ["idle_loop", "idle", "idle_01", "standing_idle"],
  walk: ["walk_loop", "walk", "walk_fwd_loop", "walking"],
  run: ["jog_fwd_loop", "run_loop", "run", "run_fwd_loop", "jog_loop", "jog", "running"],
  sprint: ["sprint_loop", "sprint", "sprinting"],
  jump: ["jump_start", "jump", "jumping"],
  fall: ["jump_loop", "fall_loop", "falling", "fall", "jump_idle"],
  land: ["jump_land", "land", "landing"],
  slideStart: ["slide_start"],
  slide: ["slide_loop", "slide"],
  slideEnd: ["slide_exit", "slide_end"],
  climb: ["climbup_1m", "climb_up", "climbup", "climbing"]
};
var key = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, "");
function findMoves(names) {
  const byKey = new Map(names.map((n) => [key(n), n]));
  const found = {};
  for (const [move, list] of Object.entries(NAMES)) for (const c of list) if (byKey.has(key(c))) {
    found[move] = byKey.get(key(c));
    break;
  }
  if (!found.idle || !(found.walk || found.run || found.sprint)) for (const m of ["idle", "walk", "run", "sprint"]) delete found[m];
  return found;
}
var MOVES = { fade: 0.15, jumpFrom: 0.12, climbMax: 1.4, landFrom: 3.5, slideStartRate: 1.4, landMoving: 0.25 };
function createMoves(M, skin, s) {
  const cyc = (n) => skin.cycle(n);
  const LOCO2 = ["idle", "walk", "run", "sprint"].filter((m) => M[m]);
  const moving = LOCO2.filter((m) => m !== "idle" && cyc(M[m]).speed > 0).sort((a, b) => cyc(M[a]).speed - cyc(M[b]).speed);
  const loco = { phase: 0, prevPhase: 0, idleT: 0, prevIdle: 0, w: {} };
  let tracks = [{ kind: "loco", w: 1 }];
  const top = () => tracks[tracks.length - 1];
  const clipTrack = (move, o = {}) => ({ kind: "clip", move, name: M[move], time: o.from || 0, prev: o.from || 0, rate: o.rate || 1, loop: !!o.loop, w: 0 });
  const OURS = { kind: "ours" };
  function show(t) {
    const cur = top();
    if (t.kind === cur.kind && (t.kind === "ours" || t.kind === "loco" || t.move === cur.move) && !t.restart) return;
    t.w = 0;
    tracks.push(t);
    if (tracks.length > 3) tracks.shift();
  }
  function locoWeights(v) {
    const w = {};
    for (const m of LOCO2) w[m] = 0;
    if (!moving.length || v < 0.05 || !M.idle) {
      w[M.idle ? "idle" : moving[0]] = 1;
      return w;
    }
    const sp = moving.map((m) => cyc(M[m]).speed);
    if (v <= sp[0]) {
      const k = v / sp[0];
      w.idle = 1 - k;
      w[moving[0]] = k;
      return w;
    }
    for (let i = 1; i < moving.length; i++) {
      if (v <= sp[i]) {
        const k = (v - sp[i - 1]) / (sp[i] - sp[i - 1]);
        w[moving[i - 1]] = 1 - k;
        w[moving[i]] = k;
        return w;
      }
    }
    w[moving[moving.length - 1]] = 1;
    return w;
  }
  return {
    /** which moves the model plays itself */
    found: Object.keys(M),
    /** start again (revive, a new stand) */
    reset() {
      tracks = [{ kind: "loco", w: 1 }];
    },
    /**
     * One physics step. ctl: the controller (after its step); ev: its event this step; speed: ground speed (m/s).
     */
    step(dt, ctl, ev, speed) {
      const cur = top();
      const playing = (move) => cur.kind === "clip" && cur.move === move;
      const done = cur.kind === "clip" && !cur.loop && cur.time >= skin.cycle(cur.name).duration - 1e-3;
      if (ctl.wall) show(OURS);
      else if (ctl.climb) show(M.climb && ctl.climbHeight <= MOVES.climbMax * s ? { kind: "climb", name: M.climb, u: ctl.climbU, prevU: ctl.climbU } : OURS);
      else if (ctl.mode === "dash") show(OURS);
      else if (ctl.mode === "slide") {
        if (ev === "slide") show(M.slideStart ? clipTrack("slideStart", { rate: MOVES.slideStartRate }) : M.slide ? clipTrack("slide", { loop: true }) : OURS);
        else if (playing("slideStart") && done) show(M.slide ? clipTrack("slide", { loop: true }) : cur);
      } else if (ev === "stand") show(M.slideEnd ? clipTrack("slideEnd") : { kind: "loco" });
      else if (ev === "jump" || ev === "pushoff") show(M.jump ? { ...clipTrack("jump", { from: MOVES.jumpFrom }), restart: true } : OURS);
      else if (ev === "land") {
        if (M.land && ctl.landSpeed >= MOVES.landFrom * Math.sqrt(s)) show({ ...clipTrack("land"), restart: true });
        else show({ kind: "loco" });
      } else if (!ctl.grounded) {
        if (!(playing("jump") && !done) && ctl.airTime > 0.12) show(M.fall ? clipTrack("fall", { loop: true }) : OURS);
      } else if (cur.kind === "clip") {
        const early = playing("land") && speed > 1.5 * s && cur.time > MOVES.landMoving || !playing("land") && !playing("slideEnd");
        if (done || early) show({ kind: "loco" });
      } else if (cur.kind === "ours" || cur.kind === "climb") show({ kind: "loco" });
      const k = Math.min(1, dt / MOVES.fade);
      for (const t of tracks) {
        if (t.kind === "clip") {
          const d = skin.cycle(t.name).duration;
          t.prev = t.time;
          t.time += dt * t.rate;
          if (t.loop && t.time >= d) {
            t.time -= d;
            t.prev -= d;
          } else if (!t.loop && t.time > d) t.time = d;
        } else if (t.kind === "climb") {
          t.prevU = t.u;
          t.u = ctl.climb ? ctl.climbU : 1;
        }
      }
      loco.prevPhase = loco.phase;
      loco.prevIdle = loco.idleT;
      loco.w = locoWeights(speed);
      let stride = 0, cadence = 0, mw = 0;
      for (const m of moving) {
        const c = cyc(M[m]);
        stride += loco.w[m] * c.speed * c.duration;
        cadence += loco.w[m] / c.duration;
        mw += loco.w[m];
      }
      if (mw > 1e-3) loco.phase = (loco.phase + dt * Math.max(speed / (stride / mw), 0.6 * (cadence / mw))) % 1;
      if (M.idle) loco.idleT = (loco.idleT + dt) % cyc(M.idle).duration;
      const t0 = top();
      t0.w = Math.min(1, t0.w + k);
      const rest = tracks.slice(0, -1), sum = rest.reduce((a, t) => a + t.w, 0);
      for (const t of rest) t.w = sum > 0 ? t.w / sum * (1 - t0.w) : 0;
      tracks = tracks.filter((t) => t === t0 || t.w > 1e-3);
    },
    /** the layer to draw (t: 0..1 between the last two steps), or null when only our pose shows */
    frame(t, yaw, feet) {
      const slots = [];
      let total = 0;
      for (const tr of tracks) {
        if (tr.kind === "ours" || !(tr.w > 0)) continue;
        total += tr.w;
        if (tr.kind === "clip") slots.push({ name: tr.name, time: Math.max(0, tr.prev + (tr.time - tr.prev) * t), weight: tr.w });
        else if (tr.kind === "climb") slots.push({ name: tr.name, time: (tr.prevU + (tr.u - tr.prevU) * t) * cyc(tr.name).duration, weight: tr.w });
        else {
          let dp = loco.phase - loco.prevPhase;
          if (dp < 0) dp += 1;
          const ph = loco.prevPhase + dp * t;
          for (const m of LOCO2) {
            const w = loco.w[m];
            if (!(w > 1e-3)) continue;
            const c = cyc(M[m]);
            const time = m === "idle" ? loco.idleT : (ph + c.phase0) % 1 * c.duration;
            slots.push({ name: M[m], time, weight: tr.w * w });
          }
        }
      }
      if (!slots.length) return null;
      return { slots, up: total, low: total, yaw, feet };
    }
  };
}

// src/index.js
var version = true ? "0.9.7" : "dev";
var animations = ANIMATIONS.map((a) => a.name);
var looks = LOOKS.map((l) => l.name);
var warned = /* @__PURE__ */ new Set();
function warnOnce(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[ragdoll] ${msg}`);
}
var noop = () => {
};
function inert() {
  const c = {
    state: "idle",
    alive: true,
    position: [0, 0, 0],
    drawPosition: [0, 0, 0],
    object3d: null,
    parts: {},
    acts: [],
    acting: null,
    moves: [],
    move: noop,
    sprint: noop,
    jump: noop,
    dash: noop,
    slide: noop,
    act: () => false,
    hit: noop,
    die: noop,
    revive: noop,
    on: () => c,
    off: () => c,
    dispose: noop
  };
  return c;
}
var isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
var SWITCH_BLEND = 0.15;
var ease01 = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
var copyPose = (p) => p ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "object" ? { ...v } : v])) : null;
function mixPose(a, b, k) {
  const out = {};
  for (const key2 of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key2], y = b[key2];
    if (typeof x === "number" || typeof y === "number") {
      out[key2] = (x ?? 0) + ((y ?? 0) - (x ?? 0)) * k;
      continue;
    }
    const o = out[key2] = {};
    for (const d of /* @__PURE__ */ new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) o[d] = (x?.[d] ?? 0) + ((y?.[d] ?? 0) - (x?.[d] ?? 0)) * k;
  }
  return out;
}
var LEAN = { bank: 6, bankShare: 0.18, pitch: 4, pitchShare: 0.35 };
var HIT_IMPULSE = 90;
function create(o = {}) {
  if (!isPhysics(o.physics)) {
    warnOnce("create() needs { physics }: the game's crashcat world object ({ world, layers, step, sync }) or RAGDOLL.createPhysics(). Returning an inert character");
    return inert();
  }
  let lookName = o.look ?? looks[0];
  if (!LOOK_DATA[lookName]) {
    warnOnce(`unknown look "${lookName}", using "${looks[0]}". Known: ${looks.join(", ")}`);
    lookName = looks[0];
  }
  const look = LOOK_DATA[lookName];
  let position = o.position ?? [0, 0, 0];
  if (!isVec3(position)) {
    warnOnce("position must be [x, y, z] (feet, in metres); using [0, 0, 0]");
    position = [0, 0, 0];
  }
  let facing = o.facing ?? 0;
  if (!Number.isFinite(facing)) {
    warnOnce("facing must be an angle in radians (0 = facing +z); using 0");
    facing = 0;
  }
  let height = o.height ?? look.height;
  if (!(Number.isFinite(height) && height >= 0.3 && height <= 10)) {
    warnOnce(`height must be metres between 0.3 and 10; using ${look.height}`);
    height = look.height;
  }
  const colors = { ...look.colors };
  if (o.color !== void 0) {
    if (typeof o.color === "string" || typeof o.color === "number") colors.shirt = o.color;
    else warnOnce(`color must be a colour like "#ff7a3d"; using the look's colour`);
  }
  const physics = o.physics;
  const hook = hookWorld(physics);
  const s = height / RIG_HEIGHT;
  const anim = createAnimator(CLIPS);
  const poses = [createPoseOut(), createPoseOut()];
  const drawn = createPoseOut();
  let cur = 0, lastDt = 1 / 60;
  let support = 1;
  let ctl = null;
  let body = null;
  let partByName = {};
  let skin = null;
  if (o.model !== void 0 && o.model !== null) {
    skin = createModelSkin(o.model, { height, s, animations: o.animations });
    if (!skin) warnOnce(`model can't be used (${inspectModel(o.model).error}); drawing boxes. RAGDOLL.inspectModel(model) tells what it found`);
  }
  skin ||= createBoxSkin(drawn, colors, s);
  if (o.animations !== void 0 && !Array.isArray(o.animations)) warnOnce("animations must be an array of three.js AnimationClips (e.g. gltf.animations)");
  else if (o.animations?.length && !skin.acts) warnOnce("animations need a model: pass { model } too (boxes have no bones to play them on)");
  const actNames = skin.acts || [];
  const moveClips = actNames.length && o.moves !== false ? findMoves(actNames) : {};
  const moves = Object.keys(moveClips).length ? createMoves(moveClips, skin, s) : null;
  const act = {
    slots: [],
    /** { name, time, prev, duration, loop, speed, weight } */
    up: 0,
    low: 0,
    want: 0,
    fade: 0.2,
    full: 0
  };
  const actFrame = { slots: [], up: 0, low: 0, yaw: 0, feet: [0, 0, 0] };
  const yawAt = [0, 0];
  const isLoopName = (n) => /(^|[_\s-])loop$/i.test(n);
  if (o.scene && typeof o.scene.add === "function") o.scene.add(skin.object3d);
  else warnOnce("create(): pass { scene } to see the character (it is in the physics world, but not drawn)");
  const listeners = /* @__PURE__ */ new Map();
  const emit = (name, e) => {
    const set = listeners.get(name);
    if (set) for (const fn of set) {
      try {
        fn(e);
      } catch (err) {
        console.error(err);
      }
    }
  };
  let disposed = false, alive = true, state = "idle", plantedFoot = -1;
  const feetAt = [[0, 0, 0], [0, 0, 0]];
  let drawnFeet = [0, 0, 0];
  const poseNow = () => solvePose(anim.pose(), { position: ctl.character.position, yaw: ctl.yaw, scale: s }, poses[cur]);
  function stand(at, yaw) {
    ctl = createController(physics, { position: at, facing: yaw, scale: s, climbClip: anim.clips.climb });
    anim.release(0);
    anim.locomotion(0);
    anim.update(0, 0);
    poseNow();
    for (let i = 0; i < drawn.length; i++) {
      poses[1 - cur][i].drawP = poses[cur][i].drawP.slice();
      poses[1 - cur][i].drawQ = poses[cur][i].drawQ.slice();
    }
    feetAt[0] = at.slice();
    feetAt[1] = at.slice();
    drawnFeet = at.slice();
    yawAt[0] = yaw;
    yawAt[1] = yaw;
    moves?.reset();
  }
  stand(position.slice(), facing);
  let lastPose = null, blendFrom = null, blendT = 0, lastSource = "anim";
  const lean = { bank: 0, pitch: 0, look: 0 };
  function stepAct(dt) {
    if (!act.slots.length) return;
    const k = Math.min(1, dt / Math.max(0.01, act.fade));
    for (const x of act.slots) {
      x.prev = x.time;
      x.time += dt * x.speed;
      if (x.loop) {
        if (x.time >= x.duration) {
          x.time -= x.duration;
          x.prev -= x.duration;
        }
      } else if (x.time >= x.duration) x.time = x.duration;
    }
    const top = act.slots[act.slots.length - 1];
    top.weight = Math.min(1, top.weight + k);
    if (act.slots.length > 1) {
      act.slots[0].weight = 1 - top.weight;
      if (top.weight >= 1) act.slots.shift();
    }
    if (!top.loop && top.time >= top.duration && act.want > 0) {
      act.want = 0;
      emit("actend", { name: top.name });
    }
    const free = ctl && !ctl.climb && !ctl.wall && ctl.mode === "move";
    const still = free && ctl.grounded && ctl.speed / s < 0.4;
    act.full += ((still ? 1 : 0) - act.full) * Math.min(1, dt / 0.2);
    const upGoal = free ? act.want : 0;
    act.up = upGoal > act.up ? Math.min(upGoal, act.up + k) : Math.max(upGoal, act.up - Math.min(1, dt / (free ? act.fade : 0.1)));
    act.low = act.up * act.full;
    if (act.want === 0 && act.up <= 0) act.slots.length = 0;
  }
  function actNow(t) {
    if (!act.slots.length || !(act.up > 0)) return null;
    actFrame.slots = act.slots.map((x) => ({ name: x.name, weight: x.weight, time: x.prev + (x.time - x.prev) * t }));
    actFrame.up = act.up;
    actFrame.low = act.low;
    actFrame.yaw = yawNow(t);
    actFrame.feet = drawnFeet;
    return actFrame;
  }
  function yawNow(t) {
    let dy = yawAt[cur] - yawAt[1 - cur];
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return yawAt[1 - cur] + dy * t;
  }
  const layers = [null, null];
  function stopAct() {
    if (act.want > 0 && act.slots.length) emit("actend", { name: act.slots[act.slots.length - 1].name });
    act.want = 0;
  }
  const runner = {
    beforeStep(dt) {
      if (body) {
        body.savePrevious();
        return;
      }
      lastDt = dt;
      ctl.step(dt);
      const onFeet = ctl.wall ? 0 : ctl.climb ? ease01((ctl.climbU - 0.78) / 0.18) : 1;
      support += (onFeet - support) * Math.min(1, dt / 0.12);
      const speed = ctl.speed / s;
      const animSpeed = ctl.grounded ? Math.max(speed, Math.min(1, Math.abs(ctl.yawRate) * 0.1)) : speed;
      anim.locomotion(animSpeed);
      const ev = ctl.event, a = anim.action, mode = ctl.mode;
      if (ev === "dash") {
        anim.play("dash", { fade: 0.05, restart: true });
        emit("dash", {});
      } else if (ev === "slide") {
        anim.play("slide", { fade: 0.08, restart: true, hold: true });
        emit("slide", {});
      } else if (ev === "climb") {
        anim.release(0.1);
        emit("climb", { height: ctl.climbHeight });
      } else if (ev === "grab") {
        anim.release(0.1);
        emit("grab", {});
      } else if (ev === "pushoff") anim.play("jump", { fade: 0.1, restart: true });
      else if (ev === "jump") {
        anim.play("jump", { fade: 0.08, restart: true });
        emit("jump", {});
      } else if (ev === "land") {
        const hard = Math.min(1, Math.max(0.35, ctl.landSpeed / (9 * Math.sqrt(s))));
        anim.play("land", { fade: 0.05, restart: true, strength: hard });
        emit("land", { speed: ctl.landSpeed });
      } else if (ev === "stand") {
        if (a === "slide") anim.go(ctl.speed / s > 2 ? 1.8 : 1);
        else anim.release(0.25);
      } else if (mode === "move") {
        if (a === "dash") anim.release(ctl.grounded ? 0.2 : 0.3);
        else if (a === "climb") anim.release(0.25);
        else if (a === "slide" && ctl.grounded) {
          if (anim.finished) anim.release(0.3);
        } else if (!ctl.grounded && ctl.airTime > 0.1) {
          const rising = ctl.velocity[1] > 0.5;
          if (a !== "fall" && !(a === "jump" && (rising || !anim.finished))) anim.play("fall", { fade: 0.3 });
        } else if (ctl.grounded) {
          if (a === "land" && anim.finished) anim.release(0.25);
          else if (a === "fall" || a === "jump" && ctl.airTime === 0 && anim.finished) anim.release(0.15);
        }
      }
      anim.update(dt, animSpeed);
      stepAct(dt);
      if (moves) moves.step(dt, ctl, ev, ctl.speed);
      const k = 1 - Math.exp(-dt / 0.12);
      const air = ctl.grounded && ctl.mode === "move" ? 1 : 0.3;
      const bankGoal = Math.max(-LEAN.bank, Math.min(LEAN.bank, Math.atan(ctl.speed * ctl.yawRate / 9.81) * 180 / Math.PI * LEAN.bankShare)) * air;
      const pitchGoal = Math.max(-LEAN.pitch, Math.min(LEAN.pitch, ctl.accel * LEAN.pitchShare)) * air;
      lean.bank += (bankGoal - lean.bank) * k;
      lean.pitch += (pitchGoal - lean.pitch) * k;
      lean.look += (Math.max(-1.5, Math.min(1.5, ctl.yawRate)) - lean.look) * k;
      let pose = anim.pose();
      if (ctl.climb) pose = ctl.climb.pose(ctl.climbU, pose);
      else if (ctl.wall) pose = ctl.wall.pose(null);
      const source = ctl.climb ? "climb" : ctl.wall ? "wall" : "anim";
      if (source !== lastSource) {
        blendFrom = copyPose(lastPose);
        blendT = 0;
        lastSource = source;
      }
      if (blendFrom && blendT < SWITCH_BLEND) {
        blendT += dt;
        pose = mixPose(blendFrom, pose, ease01(blendT / SWITCH_BLEND));
      }
      lastPose = copyPose(pose);
      if (ctl.climb || ctl.wall) {
        lean.bank = 0;
        lean.pitch = 0;
        lean.look = 0;
      } else {
        pose.root = pose.root || {};
        pose.root.bank = lean.bank;
        pose.root.pitch = lean.pitch;
        (pose.chest ||= {}).turn = (pose.chest.turn || 0) + lean.look * 5;
        (pose.head ||= {}).turn = (pose.head.turn || 0) + lean.look * 9;
      }
      cur = 1 - cur;
      solvePose(pose, { position: ctl.character.position, yaw: ctl.yaw, scale: s }, poses[cur]);
      feetAt[cur] = ctl.character.position.slice();
      yawAt[cur] = ctl.yaw;
      const nowState = ctl.climb ? "climb" : ctl.wall ? "wallclimb" : anim.state;
      if (nowState !== state) {
        state = nowState;
        emit("state", { state });
      }
      const feet = soles(poses[cur], s), ground = ctl.character.position[1] + 0.01 * s;
      const down2 = feet[0].p[1] <= feet[1].p[1] ? 0 : 1;
      const planted = ctl.grounded && feet[down2].p[1] < ground ? down2 : -1;
      if (planted >= 0 && planted !== plantedFoot && speed > 0.5) emit("footstep", { foot: planted ? "right" : "left", speed: ctl.speed });
      plantedFoot = planted;
    },
    afterStep() {
    },
    draw(alpha) {
      if (body) {
        body.interpolate(alpha);
        skin.update(body.parts);
        let low = Infinity;
        for (const q of body.parts) low = Math.min(low, q.drawP[1]);
        drawnFeet = [body.parts[0].drawP[0], low - 0.06 * s, body.parts[0].drawP[2]];
        return;
      }
      const t = alpha > 0 ? alpha < 1 ? alpha : 1 : 0, a = poses[1 - cur], b = poses[cur];
      const fa = feetAt[1 - cur], fb = feetAt[cur];
      drawnFeet = [fa[0] + (fb[0] - fa[0]) * t, fa[1] + (fb[1] - fa[1]) * t, fa[2] + (fb[2] - fa[2]) * t];
      for (let i = 0; i < drawn.length; i++) {
        const pa = a[i].drawP, pb = b[i].drawP, d = drawn[i].drawP;
        d[0] = pa[0] + (pb[0] - pa[0]) * t;
        d[1] = pa[1] + (pb[1] - pa[1]) * t;
        d[2] = pa[2] + (pb[2] - pa[2]) * t;
        nlerp(drawn[i].drawQ, a[i].drawQ, b[i].drawQ, t);
      }
      layers[0] = moves ? moves.frame(t, yawNow(t), drawnFeet) : null;
      layers[1] = actNow(t);
      skin.update(drawn, support, layers);
    }
  };
  runner.draw(1);
  hook.chars.add(runner);
  function nearestPart(from) {
    const list = body ? body.parts.map((p) => [p.name, p.body.position]) : poses[cur].map((p) => [p.name, p.drawP]);
    let best = Infinity, name = "chest";
    for (const [n, p] of list) {
      const d = length(sub(p, from));
      if (d < best) {
        best = d;
        name = n;
      }
    }
    return name;
  }
  function push(from, force, part) {
    const f = Number.isFinite(force) ? Math.max(0, force) : 1;
    let name = "chest";
    if (part !== void 0) {
      if (partByName[part]) name = part;
      else warnOnce(`hit/die: unknown part "${part}". Known: ${Object.keys(partByName).join(", ")}`);
    } else if (isVec3(from)) name = nearestPart(from);
    const target = partByName[name];
    let dir = rotate(target.quaternion, [0, 0.3, -1]);
    if (isVec3(from)) {
      dir = sub(target.position, from);
      dir[1] = Math.max(dir[1], 0) + 0.3 * length(dir);
    } else if (from !== void 0) warnOnce("hit/die: from must be [x, y, z], the position the hit comes from");
    rigidBody4.addImpulse(physics.world, target, scale(normalize(dir), HIT_IMPULSE * f * s ** 3));
    return name;
  }
  const character = {
    /** the animation playing now ('death' while limp) */
    get state() {
      return alive ? state : "death";
    },
    get alive() {
      return alive;
    },
    /** feet position [x, y, z] (limp: under the hips) */
    get position() {
      if (ctl) return ctl.character.position.slice();
      const p = body.parts[0].body.position;
      let low = Infinity;
      for (const q of body.parts) low = Math.min(low, q.body.position[1]);
      return [p[0], low - 0.06 * s, p[2]];
    },
    /** feet position as drawn this frame (between physics steps): follow THIS with a camera, not `position` */
    get drawPosition() {
      return drawnFeet.slice();
    },
    /** which way it faces, radians around y (0 = +z) */
    get facing() {
      return ctl ? ctl.yaw : 0;
    },
    /** how fast it moves over the ground (m/s) */
    get speed() {
      return ctl ? ctl.speed : 0;
    },
    /** the three.js group holding the boxes (read-only: the character moves it) */
    object3d: skin.object3d,
    /** the names of the model's own animations, for act() (empty for boxes, or a model given no animations) */
    get acts() {
      return actNames.slice();
    },
    /** the moves the model plays with its own animations (idle, walk, run, sprint, jump, fall, land, slide…); the rest are ours */
    get moves() {
      return moves ? moves.found.slice() : [];
    },
    /** the act() animation playing now, or null */
    get acting() {
      return act.want > 0 && act.slots.length ? act.slots[act.slots.length - 1].name : null;
    },
    /** advanced: the crashcat body of each part while limp, by name (empty while alive) */
    get parts() {
      return partByName;
    },
    /** walk: a direction on the ground in world axes, each -1..1 (length 1 = full speed); (0, 0) stops */
    move(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        warnOnce("move(x, z): both must be numbers");
        return;
      }
      if (ctl) {
        ctl.input[0] = x;
        ctl.input[1] = z;
      }
    },
    /** run faster while on */
    sprint(on = true) {
      if (ctl) ctl.sprinting = !!on;
    },
    /** jump (only from the ground; pressed a moment early or just after leaving a ledge still counts) */
    jump() {
      if (ctl) ctl.jump();
    },
    /** a quick burst (the way it is steered, else the way it faces); cooldown 0.6 s; once in the air per jump */
    dash() {
      if (ctl) ctl.dash();
    },
    /** a low slide while running (fits under things half its height); jump ends it early */
    slide() {
      if (ctl) ctl.slide();
    },
    /** play one of the model's own animations (create({ model, animations })) over what it does: the whole body while
     *  it stands, the upper body while it moves (the legs keep running). A name ending in "Loop" loops until act(null)
     *  or another act; others play once. act(null) stops. Returns false if it can't. */
    act(name, o2 = {}) {
      if (disposed || !alive) return false;
      if (name === null || name === void 0) {
        stopAct();
        return true;
      }
      if (!actNames.length) {
        warnOnce("act() plays a model's own animations: create({ model: gltf.scene, animations: gltf.animations })");
        return false;
      }
      if (!actNames.includes(name)) {
        warnOnce(`act("${name}"): unknown. This model has: ${actNames.join(", ")}`);
        return false;
      }
      const speed = Number.isFinite(o2.speed) && o2.speed > 0 ? o2.speed : 1;
      const fade = Number.isFinite(o2.fade) && o2.fade >= 0 ? o2.fade : 0.2;
      const loop = typeof o2.loop === "boolean" ? o2.loop : isLoopName(name);
      if (act.want > 0 && act.slots.length) emit("actend", { name: act.slots[act.slots.length - 1].name });
      const duration = skin.clipDuration(name);
      if (!(act.up > 0)) act.slots.length = 0;
      act.slots = act.slots.slice(-1);
      if (act.slots[0]) act.slots[0].weight = 1;
      act.slots.push({ name, time: 0, prev: 0, duration, loop, speed, weight: act.slots.length ? 0 : 1 });
      act.fade = fade;
      act.want = 1;
      emit("act", { name });
      return true;
    },
    /** a hit from the position `from` on `part` (default: the part nearest `from`); force 1 = a solid punch.
     *  Alive: a knock-back (a physical flinch arrives in v0.5). Limp: the body takes the push. */
    hit(e = {}) {
      if (disposed) return;
      const f = Number.isFinite(e.force) ? Math.max(0, e.force) : 1;
      let name;
      if (body) name = push(e.from, f, e.part);
      else {
        name = e.part && poses[cur].some((p) => p.name === e.part) ? e.part : isVec3(e.from) ? nearestPart(e.from) : "chest";
        let dir = rotate([0, Math.sin(ctl.yaw / 2), 0, Math.cos(ctl.yaw / 2)], [0, 0, -1]);
        if (isVec3(e.from)) {
          const d = sub(ctl.character.position, e.from);
          d[1] = 0;
          if (length(d) > 1e-6) dir = normalize(d);
        }
        ctl.push[0] += dir[0] * 4 * f * s;
        ctl.push[2] += dir[2] * 4 * f * s;
      }
      emit("hit", { part: name, from: e.from, force: f });
    },
    /** go limp: the ragdoll takes over from the current pose and motion, and takes the push if one is given */
    die(e = {}) {
      if (disposed) return;
      const pushed = e.from !== void 0 || e.force !== void 0 || e.part !== void 0;
      if (!body) {
        const at = ctl.character.position.slice();
        body = buildBody(physics, { position: at, facing: ctl.yaw, height });
        body.setPose(poses[cur], poses[1 - cur], lastDt);
        ctl.remove();
        ctl = null;
        partByName = Object.fromEntries(body.parts.map((p) => [p.name, p.body]));
        if (!pushed && length(body.parts[0].body.motionProperties.linearVelocity) < 1) body.buckle(1);
      }
      if (pushed) push(e.from, e.force ?? 1, e.part);
      stopAct();
      act.slots.length = 0;
      act.up = 0;
      act.low = 0;
      if (alive) {
        alive = false;
        emit("state", { state: "death" });
        emit("dead", {});
      }
    },
    /** stand up again where the body lies, alive */
    revive() {
      if (disposed || !body) return;
      const hips = body.parts[0].body;
      let low = Infinity;
      for (const p of body.parts) low = Math.min(low, p.body.position[1]);
      const fwd2 = rotate(hips.quaternion, [0, 0, 1]);
      const yaw = Math.hypot(fwd2[0], fwd2[2]) > 0.2 ? Math.atan2(fwd2[0], fwd2[2]) : 0;
      const at = [hips.position[0], low - 0.1 * s + 0.05, hips.position[2]];
      body.remove();
      body = null;
      partByName = {};
      stand(at, yaw);
      alive = true;
      state = "idle";
      emit("state", { state });
    },
    on(name, fn) {
      if (typeof fn !== "function") {
        warnOnce(`on("${name}"): the second argument must be a function`);
        return character;
      }
      if (!listeners.has(name)) listeners.set(name, /* @__PURE__ */ new Set());
      listeners.get(name).add(fn);
      return character;
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
      return character;
    },
    /** remove the character from the world and the scene */
    dispose() {
      if (disposed) return;
      disposed = true;
      hook.chars.delete(runner);
      if (body) body.remove();
      if (ctl) ctl.remove();
      skin.dispose();
      listeners.clear();
    }
  };
  return character;
}
var RAGDOLL = { version, animations, looks, create, createPhysics, inspectModel };
var index_default = RAGDOLL;
export {
  LEAN,
  animations,
  create,
  createPhysics,
  index_default as default,
  inspectModel,
  looks,
  version,
  warnOnce
};
