/* Arcade car for Urban Outlaw: bicycle-style steering, sideways tyre grip (drifts with the handbrake) and
   circle-vs-box collision against the city's solid footprints. Plain numbers only, nothing is allocated per step.
   Convention: heading h, forward = (sin h, cos h) on (x, z); steering right makes h smaller. */
const STEP_MAX = 1 / 50;

export function createCar() {
  const s = { x: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 0, steer: 0, yawRate: 0, accel: 0, offroad: false, impact: 0 };
  const input = { throttle: 0, steer: 0, brake: false };
  const OFFS = [-1.35, 0, 1.35]; let R = 1.05;

  /** @param {number} x @param {number} z @param {number} h */
  function reset(x, z, h) { s.x = x; s.z = z; s.h = h; s.vx = s.vz = s.speed = s.steer = s.yawRate = s.accel = s.impact = 0; }

  /** @param {number} dt @param {any} P car settings @param {{minX:number,maxX:number,minZ:number,maxZ:number}[]} cols @param {(x:number,z:number)=>boolean} isRoad
   *  @return {number} strongest impact speed (m/s) during this call, 0 when nothing was hit */
  function update(dt, P, cols, isRoad) {
    let hit = 0;
    const n = Math.max(1, Math.ceil(dt / STEP_MAX)), h = dt / n;
    for (let i = 0; i < n; i++) hit = Math.max(hit, sub(h, P, cols, isRoad));
    s.impact = hit;
    return hit;
  }

  function sub(dt, P, cols, isRoad) {
    const fx = Math.sin(s.h), fz = Math.cos(s.h), rx = -fz, rz = fx;
    let vf = s.vx * fx + s.vz * fz, vr = s.vx * rx + s.vz * rz;
    const off = !isRoad(s.x, s.z); s.offroad = off;
    const maxF = P.maxSpeed * (off ? P.offroad : 1), t = input.throttle;
    const vf0 = vf;
    let a = 0;
    if (t > 0.05) a = vf < -0.5 ? P.braking * t : P.acceleration * t * (1 - Math.max(0, vf) / maxF);
    else if (t < -0.05) a = vf > 0.5 ? -P.braking * -t : -P.acceleration * 0.7 * -t * (1 - Math.max(0, -vf) / P.reverseSpeed);
    if (Math.abs(t) <= 0.05) { const drag = Math.min(Math.abs(vf), (1.2 + 0.012 * vf * vf) * dt); vf -= Math.sign(vf) * drag; }
    if (input.brake) { const b = Math.min(Math.abs(vf), P.braking * 0.8 * dt); vf -= Math.sign(vf) * b; }
    vf += a * dt;
    if (vf > maxF) vf = Math.max(maxF, vf - (vf - maxF) * Math.min(1, dt * 2.5));
    if (vf < -P.reverseSpeed) vf = -P.reverseSpeed;
    s.accel = (vf - vf0) / dt;
    // sideways grip: low with the handbrake so the car slides
    vr *= Math.exp(-(input.brake ? P.handbrakeGrip : P.grip) * dt);
    s.vx = fx * vf + rx * vr; s.vz = fz * vf + rz * vr; s.speed = vf;
    // steering (bicycle model, less lock at speed)
    const wheelbase = 0.6 * P.length;
    const target = input.steer * P.steering / (1 + (vf / 11) * (vf / 11));
    s.steer += (target - s.steer) * Math.min(1, dt * 10);
    let w = vf * Math.tan(s.steer) / wheelbase;
    if (input.brake && Math.abs(vf) > 3) w *= 1.5;
    s.yawRate = w; s.h -= w * dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    R = P.radius || 1.05; const span = P.span || 1.35; OFFS[0] = -span; OFFS[2] = span;
    return collide(cols);
  }

  function collide(cols) {
    let hit = 0;
    for (let iter = 0; iter < 2; iter++) {
      const fx = Math.sin(s.h), fz = Math.cos(s.h);
      for (let c = 0; c < 3; c++) {
        const cx = s.x + fx * OFFS[c], cz = s.z + fz * OFFS[c];
        for (let i = 0; i < cols.length; i++) {
          const b = cols[i];
          if (cx < b.minX - R || cx > b.maxX + R || cz < b.minZ - R || cz > b.maxZ + R) continue;
          const px = cx < b.minX ? b.minX : cx > b.maxX ? b.maxX : cx, pz = cz < b.minZ ? b.minZ : cz > b.maxZ ? b.maxZ : cz;
          let dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz);
          if (d >= R) continue;
          if (d < 1e-6) { // centre inside the box: push out along the shallowest side
            const l = cx - b.minX, r = b.maxX - cx, u = cz - b.minZ, v = b.maxZ - cz, m = Math.min(l, r, u, v);
            dx = m === l ? -1 : m === r ? 1 : 0; dz = m === u ? -1 : m === v ? 1 : 0; d = -m;
          } else { dx /= d; dz /= d; }
          const pen = R - d;
          s.x += dx * pen; s.z += dz * pen;
          const vn = s.vx * dx + s.vz * dz;
          if (vn < 0) {
            hit = Math.max(hit, -vn);
            s.vx -= (1.12) * vn * dx; s.vz -= (1.12) * vn * dz;
            s.vx *= 0.985; s.vz *= 0.985;
            const fwd = Math.sin(s.h), fwz = Math.cos(s.h); s.speed = s.vx * fwd + s.vz * fwz;
          }
        }
      }
    }
    if (s.x > 54) { s.x = 54; if (s.vx > 0) s.vx = 0; } else if (s.x < -54) { s.x = -54; if (s.vx < 0) s.vx = 0; }
    if (s.z > 54) { s.z = 54; if (s.vz > 0) s.vz = 0; } else if (s.z < -54) { s.z = -54; if (s.vz < 0) s.vz = 0; }
    return hit;
  }

  return { s, input, reset, update };
}
