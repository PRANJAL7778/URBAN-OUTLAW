import { createCar } from './car.js';
const P = { maxSpeed: 24, reverseSpeed: 7, acceleration: 14, braking: 30, steering: 0.6, grip: 7, handbrakeGrip: 1.4, offroad: 0.55, length: 4.5, radius: 1.05, span: 1.35 };
const B = { maxSpeed: 27, reverseSpeed: 3, acceleration: 17, braking: 26, steering: 0.75, grip: 6, handbrakeGrip: 1.6, offroad: 0.6, length: 2.2, radius: 0.55, span: 0.7 };
const dt = 1 / 60, cols = [{ minX: -5, maxX: 5, minZ: 20, maxZ: 30 }];
const road = () => true, grass = () => false;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
let pass = 0, fail = 0;
const check = (c, m) => { c ? pass++ : fail++; ok(c, m); };

// 1. acceleration + top speed
let c = createCar(); c.reset(0, -50, 0); c.input.throttle = 1;
for (let i = 0; i < 240; i++) c.update(dt, P, [], road);
check(c.s.speed > P.maxSpeed * 0.9 && c.s.speed <= P.maxSpeed * 1.001, 'top speed reaches ~max on road (' + c.s.speed.toFixed(2) + ' of ' + P.maxSpeed + ')');

// 2. deceleration when throttle released
for (let i = 0; i < 400; i++) c.update(dt, P, [], road);
check(c.s.speed < 0.5, 'coasts to a stop when the throttle is released (' + c.s.speed.toFixed(2) + ' m/s)');

// 3. steering turns the heading
c = createCar(); c.reset(0, 0, 0); c.input.throttle = 1; c.input.steer = 1;
const h0 = c.s.h; for (let i = 0; i < 120; i++) c.update(dt, P, [], road);
check(Math.abs(c.s.h - h0) > 0.2, 'steering changes heading (dh=' + (c.s.h - h0).toFixed(2) + ' rad)');

// 4. wall collision stops the car and reports impact
c = createCar(); c.reset(0, 10, 0); c.input.throttle = 1;
let maxHit = 0; for (let i = 0; i < 240; i++) maxHit = Math.max(maxHit, c.update(dt, P, cols, road));
check(c.s.z < 20, 'car cannot pass through a building footprint (z=' + c.s.z.toFixed(2) + ')');
check(maxHit > 0, 'collision reports an impact speed (' + maxHit.toFixed(2) + ' m/s)');

// 5. world bounds
c = createCar(); c.reset(0, 0, Math.PI / 2); c.input.throttle = 1;
for (let i = 0; i < 900; i++) c.update(dt, P, [], road);
check(c.s.x <= 54.0001, 'stays inside the world bounds (x=' + c.s.x.toFixed(2) + ')');

// 6. handbrake drift vs grip
function lateral(brake) {
  const k = createCar(); k.reset(0, 0, 0); k.input.throttle = 1;
  for (let i = 0; i < 180; i++) k.update(dt, P, [], road);
  k.input.steer = 1; for (let i = 0; i < 60; i++) k.update(dt, P, [], road);
  k.input.throttle = 0.6; k.input.brake = brake; for (let i = 0; i < 30; i++) k.update(dt, P, [], road);
  const fx = Math.sin(k.s.h), fz = Math.cos(k.s.h);
  return Math.abs(k.s.vx * -fz + k.s.vz * fx);
}
const lg = lateral(false), lb = lateral(true);
check(lb > lg, 'handbrake creates more sideways slide (grip ' + lg.toFixed(2) + ' < handbrake ' + lb.toFixed(2) + ' m/s)');

// 7. off-road slows the car
const onRoad = createCar(); onRoad.reset(0, -50, 0); onRoad.input.throttle = 1; for (let i = 0; i < 240; i++) onRoad.update(dt, P, [], road);
const offRoad = createCar(); offRoad.reset(0, -50, 0); offRoad.input.throttle = 1; for (let i = 0; i < 240; i++) offRoad.update(dt, P, [], grass);
check(offRoad.s.speed < onRoad.s.speed && offRoad.s.speed <= P.maxSpeed * P.offroad + 0.01, 'off-road top speed limited (' + offRoad.s.speed.toFixed(2) + ' vs ' + onRoad.s.speed.toFixed(2) + ' m/s)');

// 8. the bobber settings drive the same controller
const b = createCar(); b.reset(0, -50, 0); b.input.throttle = 1; for (let i = 0; i < 240; i++) b.update(dt, B, [], road);
check(b.s.speed > 18 && b.s.speed <= B.maxSpeed, 'bike settings reach their own top speed (' + b.s.speed.toFixed(2) + ' of ' + B.maxSpeed + ')');

// 9. frame-rate independence
const a1 = createCar(); a1.reset(0, 0, 0); a1.input.throttle = 1; for (let i = 0; i < 300; i++) a1.update(1 / 30, P, [], road);
const a2 = createCar(); a2.reset(0, 0, 0); a2.input.throttle = 1; for (let i = 0; i < 600; i++) a2.update(1 / 60, P, [], road);
check(Math.abs(a1.s.z - a2.s.z) < 0.5, 'step-independent at 30 vs 60 fps (' + a1.s.z.toFixed(2) + ' vs ' + a2.s.z.toFixed(2) + ' m)');

// 10. no NaN after heavy mixed input
const n = createCar(); n.reset(0, 0, 0); let bad = false;
for (let i = 0; i < 2000; i++) {
  n.input.throttle = Math.sin(i / 7); n.input.steer = Math.cos(i / 11); n.input.brake = i % 97 === 0;
  n.update(dt, P, cols, road);
  if (![n.s.x, n.s.z, n.s.h, n.s.speed, n.s.vx, n.s.vz].every(Number.isFinite)) bad = true;
}
check(!bad, 'no NaN in the car state after 2000 randomised steps');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
