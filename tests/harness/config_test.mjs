import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
let fail = 0;
const check = (n, ok, x = '') => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const src = fs.readFileSync(REPO + '/src/config.js', 'utf8');
fs.writeFileSync('./src/config_copy.mjs', src);
const { default: CONFIG } = await import('./src/config_copy.mjs?' + Date.now());
console.log('\n=== config ===');
const keys = [
  ['camera.carDistance', 4, 12], ['camera.bikeDistance', 3.5, 11],
  ['character.armSwing', 0, 2], ['character.armOut', 0.3, 1.8], ['character.armRoll', -1, 1],
  ['bike.hipLift', -0.1, 0.25], ['bike.seatShift', -0.2, 0.3], ['bike.ankleLift', 0, 0.2],
  ['bike.elbowOut', 0.3, 1.6], ['bike.handRoll', -0.8, 0.8], ['bike.riderLean', 0, 0.9],
];
for (const [k, lo, hi] of keys) {
  const v = k.split('.').reduce((o, p) => o?.[p], CONFIG);
  check(`${k} is in range ${lo}..${hi}`, typeof v === 'number' && v >= lo && v <= hi, String(v));
}
const gone = ['riderLift', 'riderShift', 'riderTilt', 'riderThigh', 'riderShin', 'riderArm', 'riderForearm'];
check('legacy manual rider angles removed (the pose is solved from geometry now)', gone.every((k) => !CONFIG.bike[k]));
check('sanity: existing gameplay knobs still present', ['length', 'maxSpeed', 'acceleration', 'steering', 'enterRadius'].every((k) => typeof CONFIG.bike[k] === 'number'));
check('sanity: camera + character groups intact', typeof CONFIG.camera.sensitivity === 'number' && typeof CONFIG.character.useModel === 'boolean');
console.log(`\n${fail === 0 ? 'ALL CONFIG CHECKS PASSED' : fail + ' CONFIG CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
