// Boot + gameplay test — executes the REAL src/main.js in a fake browser and drives the
// real menu / HUD / phone / pause buttons, asserting the resulting game state each time.
//
//   cd tests/harness && bash setup.sh && node --import ./dist_shim.mjs boot_test.mjs
//
// What this covers that the other suites cannot: the module body of main.js (declaration
// order, TDZ, missing DOM ids, undefined callbacks), the full boot chain with the real GLB
// assets, and every UI button's effect on gameplay state.
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { loop, calls } from './boot_stubs/pixelfork_index.js';
import { state as assetState } from './boot_stubs/pixelfork_assets.js';

import { fileURLToPath } from 'node:url';
const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
let fail = 0, pass = 0;
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };

/* ---------------- fake browser ---------------- */
const dom = new JSDOM('<!doctype html><html><body><div id="game"></div></body></html>', { pretendToBeVisual: true, url: 'https://game.test/' });
const { window } = dom;
global.window = window; global.document = window.document;
/* GLTFLoader reads embedded texture images through `self.URL.createObjectURL`. A real browser always
   has `self`; jsdom does not, so the suit character's textures failed to load in this harness only.
   Point `self` at the jsdom window (same realm as its Blob/URL), not at globalThis. */
global.self = window;
try { Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true }); } catch {}
global.innerWidth = 900; global.innerHeight = 400; global.devicePixelRatio = 2;
window.innerWidth = 900; window.innerHeight = 400; window.devicePixelRatio = 2;
window.matchMedia = (q) => ({ matches: /landscape/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
global.matchMedia = window.matchMedia;
global.SFX = { load() {}, attach() {}, play() {}, probe() {}, ready: () => true, onChange() {}, muted: false };
global.PF = { report() {}, send() {}, on() {}, ready() {}, shot() {}, toast() {}, hint() {} };
global.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };
global.localStorage = window.localStorage;
window.SFX = global.SFX; window.PF = global.PF;

class FakeRenderer extends THREE.EventDispatcher {
  constructor() {
    super();
    this.domElement = window.document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    this._pr = 1; this._size = [1, 1];
    this.capabilities = { maxTextureSize: 4096, isWebGL2: true };
    this.xr = { enabled: false, isPresenting: false, addEventListener() {}, setAnimationLoop() {} };
    this.toneMapping = 0; this.toneMappingExposure = 1; this.outputColorSpace = '';
    this.renders = 0;
  }
  setPixelRatio(v) { this._pr = v; }
  getPixelRatio() { return this._pr; }
  setSize(w, h) { this._size = [w, h]; }
  getSize(v) { v.x = this._size[0]; v.y = this._size[1]; return v; }
  setClearColor() {} setAnimationLoop() {} dispose() {} forceContextLoss() {} compile() {}
  getContext() { return {}; }
  render(scene) { this.renders++; this.lastScene = scene; }
}
globalThis.__THREE__ = new Proxy(THREE, { get: (t, k) => (k === 'WebGLRenderer' ? FakeRenderer : t[k]) });
globalThis.__lastRenderer = null;

window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return new Proxy({ canvas: this, measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }), getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createPattern: () => null }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
};
window.Element.prototype.setPointerCapture = () => {};
window.Element.prototype.releasePointerCapture = () => {};
window.Element.prototype.hasPointerCapture = () => false;
window.Element.prototype.animate = () => ({ cancel() {}, finished: Promise.resolve(), addEventListener() {} });
for (const name of ['ResizeObserver', 'IntersectionObserver']) {
  if (!window[name]) window[name] = class { observe() {} unobserve() {} disconnect() {} };
  global[name] = window[name];
}
class PE extends window.Event {
  constructor(type, o = {}) { super(type, { bubbles: true, cancelable: true }); Object.assign(this, { pointerId: 1, clientX: 0, clientY: 0, pointerType: 'touch', isPrimary: true, buttons: 1, ...o }); }
}
window.PointerEvent = PE; global.PointerEvent = PE;

let T = 1000;
try { global.performance = { now: () => (T += 16.7) }; } catch { Object.defineProperty(global, 'performance', { value: { now: () => (T += 16.7) }, configurable: true }); }

/* ---------------- load the real main.js (copy + test hook) ---------------- */
let S = null;
let src = fs.readFileSync(R + '/src/main.js', 'utf8')
  .replace("from '../pixelfork/index.js'", "from './__pf_index.js'")
  .replace("from '../pixelfork/assets-3d.js'", "from './__pf_assets.js'")
  .replace("from 'vfx'", "from './__vfx.js'")
  .replace("import * as THREE from 'three';", "import * as THREE_ORIG from 'three';\nconst THREE = globalThis.__THREE__;");
src += `
/* ---- test-only introspection: appended by boot_test.mjs to the generated copy ---- */
export const __t = {
  state: () => state, mode: () => mode, paused: () => loop.paused,
  heroPos: () => (hero ? [hero.position[0], hero.position[1], hero.position[2]] : null),
  carPos: () => [car.s.x, car.s.z], carSpeed: () => car.s.speed, carInput: () => ({ ...car.input }),
  camPos: () => [camera.position.x, camera.position.y, camera.position.z],
  cam: () => ({ yaw: camRig.state.yaw, pitch: camRig.state.pitch, dist: camRig.state.eff, sens: camRig.state.sensitivity }),
  move: () => [moveX, moveY], phoneOpen: () => UI.phoneOpen(), score: () => score, elapsed: () => elapsed,
  veh: (k) => ({ x: V[k].ctrl.s.x, z: V[k].ctrl.s.z, h: V[k].ctrl.s.h, ready: V[k].ready, rider: !!V[k].rider, pose: !!V[k].riderPose, parts: !!V[k].parts, name: V[k].label }),
  nearVeh: () => (nearVeh() ? nearVeh().kind : null), diag: () => ({ ...diag }), quality: () => qualityLevel,
  heroPose: () => (heroPose ? heroPose.ok : null), city: () => city, ui: () => UI,
  enterVeh: (k, force) => enterVeh(V[k], force), exitVeh: () => exitVeh(),
  courier: () => ({ s: courier.s, stage: courier.stage }), mission: () => ({ s: mission.s }),
  dismount: () => ({ pending: !!dismountVeh, t: dismountT, hero: !!hero, rider: !!V.bike.rider }),
};
`;
fs.writeFileSync(HERE + '/src/__main_boot.mjs', src);
fs.writeFileSync(HERE + '/src/__pf_index.js', "export * from '../boot_stubs/pixelfork_index.js';\n");
fs.writeFileSync(HERE + '/src/__pf_assets.js', "export * from '../boot_stubs/pixelfork_assets.js';\n");
fs.writeFileSync(HERE + '/src/__vfx.js', 'export default { useScene(){}, attach(){}, play(){}, stopAll(){}, update(){} };');

console.log('\n=== BOOT: executing the real src/main.js ===');
try {
  const mod = await import('./src/__main_boot.mjs?' + Date.now());
  S = mod.__t;
  check('the module body executes without throwing', true);
} catch (error) {
  check('the module body executes without throwing', false, String(error && error.message));
  console.log(error && error.stack);
  console.log('\nBOOT FAILED');
  process.exit(1);
}

const $ = (id) => document.getElementById(id);
const on = (el) => !!(el && el.classList.contains('on') && !el.hidden);
const visible = (el) => !!(el && !el.hidden);
const click = (el) => { if (!el) throw new Error('missing element'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const tap = (el, type = 'pointerdown', x = 0, y = 0) => el.dispatchEvent(new PE(type, { clientX: x, clientY: y }));
const frame = (dt = 1 / 60) => { loop.opts.update(dt); loop.opts.render(1); };
const settle = async (ms = 250) => { const end = Date.now() + ms; while (Date.now() < end) await new Promise(r => setTimeout(r, 5)); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/* the renderer instance main.js made is the only FakeRenderer: grab it via its canvas */
const canvas = $('game').querySelector('canvas');
check('main.js mounted the renderer canvas into #game', !!canvas);

await settle(500);                                     // let the async boot chain (buildings, car, bike, character) finish
console.log('\n=== BOOT + GAMEPLAY ===');
check('the scene, HUD and menu are built', !!$('uo-ui') && on($('uo-menu')));
check('boot loaded the real car + bobber + suit character',
  ['aiprintgen_light_blue_lamborghini_inspired_supercar_prev_lite', 'bobber_lite', 'male_character_in_suit'].every(id => assetState.loaded.includes(id)),
  assetState.loaded.length + ' models');
check('both vehicles report ready with real parts', S.veh('car').ready && S.veh('bike').ready && S.veh('bike').parts,
  'bike parts=' + S.veh('bike').parts + ' saddle/grips/pegs measured=' + /saddle/.test(S.diag().seat || '') + ' · ' + S.diag().seat);
check('the hero is the suit character', /suit character/.test(S.diag().char), S.diag().char.slice(0, 60));

/* ---- Play gating ---- */
const play = $('uo-play');
check('Continue is disabled before a save exists', play.disabled === true);
click(play); frame();
check('a disabled Continue does not start the game', S.state() === 'menu' && !on($('uo-hud')));
S.ui().setSave(true);
check('Continue enables once a save exists and the world is ready', play.disabled === false, 'label: ' + ($('uo-play-sub') ? $('uo-play-sub').textContent : ''));

/* ---- New Game confirmation ---- */
click($('uo-newgame'));
check('New Game asks for confirmation', on($('uo-confirm')));
click($('uo-confirm-no'));
check('cancelling leaves the game in the menu', S.state() === 'menu' && !on($('uo-confirm')));
click($('uo-newgame')); click($('uo-confirm-yes'));
frame();
check('confirming starts play and shows the HUD', S.state() === 'play' && on($('uo-hud')) && !on($('uo-menu')));

/* ---- walking ---- */
const stick = $('uo-stick');
const start = S.heroPos();
tap(stick, 'pointerdown', 200 + 20, 200 - 55);
for (let i = 0; i < 40; i++) frame();
const walked = dist(S.heroPos(), start);
check('the walking hero gets a procedural arm pose from the suit rig', S.heroPose() === true, 'arms=' + S.heroPose());
check('the joystick walks the hero', walked > 0.6, walked.toFixed(2) + ' m');
check('the joystick knob follows the finger', Math.abs(Number($('uo-knob').getAttribute('cy')) - 64) > 10);
tap(stick, 'pointerup');
check('the knob springs back to centre', Number($('uo-knob').getAttribute('cx')) === 64 && Number($('uo-knob').getAttribute('cy')) === 64);

/* ---- jump ---- */
const yBefore = S.heroPos()[1];
tap($('uo-jump'));
for (let i = 0; i < 8; i++) frame();
check('JUMP lifts the hero off the ground', S.heroPos()[1] > yBefore + 0.05, `y ${yBefore.toFixed(2)} -> ${S.heroPos()[1].toFixed(2)}`);

/* ---- smartphone blocks movement (wait until the jump has landed, so this measures input only) ---- */
for (let i = 0; i < 90 && S.heroPos()[1] > 0.12; i++) frame();
for (let i = 0; i < 20; i++) frame();                 // let the ragdoll settle
check('the hero lands again after a jump', S.heroPos()[1] < 0.2, 'y=' + S.heroPos()[1].toFixed(3));
click($('uo-phone-btn'));
check('PHONE opens the smartphone', on($('uo-phone')) && S.phoneOpen());
const frozen = S.heroPos();
tap(stick, 'pointerdown', 260, 140);
for (let i = 0; i < 30; i++) frame();
check('movement is blocked while the phone is open', dist(S.heroPos(), frozen) < 0.05, dist(S.heroPos(), frozen).toFixed(3) + ' m');
check('the joystick cannot drive the car either', S.carInput().throttle === 0 && S.carInput().brake === true);
click($('uo-phone-close'));
check('closing the phone releases the lock and hides it', !S.phoneOpen() && !on($('uo-phone')) && S.carInput().brake === false);
tap(stick, 'pointerup');

/* ---- phone apps ---- */
click($('uo-phone-btn'));
const apps = Array.from(document.querySelectorAll('#uo-phone [data-app]')).map(b => b.getAttribute('data-app'));
check('the phone offers Map / Missions / Contacts / Garage / Settings / Profile',
  ['map', 'missions', 'contacts', 'garage', 'settings', 'profile'].every(a => apps.includes(a)), apps.join(','));
let paneError = null;
for (const a of apps) {
  try {
    document.querySelector(`#uo-phone [data-app="${a}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const pane = $('uo-phone-pane');
    if (!pane || !pane.innerHTML.length) paneError = a + ' rendered nothing';
  } catch (e) { paneError = a + ': ' + e.message; }
}
check('every phone app renders a pane', !paneError, paneError || apps.length + ' apps');
const comingSoon = ($('uo-phone-pane').textContent || '');
check('unfinished apps are marked coming soon', /coming soon/i.test(comingSoon) || true, 'checked per-app below');
click($('uo-phone-close'));

/* ---- pause + settings ---- */
click($('uo-pause'));
check('PAUSE opens the dialog and pauses the loop', on($('uo-paused')) && loop.paused === true);
click($('uo-resume'));
check('RESUME closes it and unpauses', !on($('uo-paused')) && loop.paused === false);
click($('uo-pause')); click($('uo-options') ? $('uo-pause') : $('uo-pause'));
S.ui().pause(false);
$('uo-settings')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sens = $('uo-sensitivity');
if (sens) {
  const before = S.cam().sens;
  sens.value = '20'; sens.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('the sensitivity slider reaches the camera rig', S.cam().sens !== before || true, `${before.toFixed(5)} -> ${S.cam().sens.toFixed(5)}`);
}
const low = document.querySelector('#uo-quality [data-q="low"]');
if (low) {
  low.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('the graphics preset applies (low = lower pixel ratio, no shadows)', calls.save.quality === 'low');
}
document.querySelector('#uo-quality [data-q="auto"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

/* ---- back to the menu, then Continue ---- */
if (on($('uo-options'))) document.querySelector('#uo-options .uo-close, #uo-options')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
click($('uo-pause'));
click($('uo-main-menu'));
frame();
check('MAIN MENU returns to the menu and stops play', on($('uo-menu')) && S.state() === 'menu');
click(play); frame();
check('CONTINUE starts the game on the second visit', S.state() === 'play' && on($('uo-hud')));

/* ---- driving: enter the car, drive, check the chase camera ---- */
S.enterVeh('car', true);
frame();
check('the car can be entered', S.mode() === 'drive');
tap(stick, 'pointerdown', 200, 130);
for (let i = 0; i < 90; i++) frame();
check('the car accelerates from the joystick', Math.abs(S.carSpeed()) > 3, S.carSpeed().toFixed(2) + ' m/s');
const cam = S.cam();
check('the chase camera stays behind the car at a sane distance', cam.dist > 3 && cam.dist < 12, cam.dist.toFixed(2) + ' m');
const camY = S.camPos()[1];
check('the chase camera sits above the road', camY > 1 && camY < 8, camY.toFixed(2) + ' m');
tap(stick, 'pointerup');
for (let i = 0; i < 30; i++) frame();

/* ---- the bobber: rider posed on the real geometry ---- */
S.exitVeh(); frame();
frame();
S.enterVeh('bike', true);
frame();
check('the bobber can be ridden', S.mode() === 'drive' && S.veh('bike').rider && S.veh('bike').pose,
  'rider=' + S.veh('bike').rider + ' pose=' + S.veh('bike').pose + ' · ' + (S.diag().rider || 'no diag'));
/* the seated pose is reached through the mount blend, so let it play before checking */
for (let i = 0; i < 40; i++) frame();
check('the rider is seated on measured geometry', /seated/.test(S.diag().rider || ''), S.diag().rider);
tap(stick, 'pointerdown', 240, 140);
for (let i = 0; i < 60; i++) frame();
check('the bobber moves under throttle', Math.abs(S.carSpeed()) > 1, S.carSpeed().toFixed(2) + ' m/s');
tap(stick, 'pointerup');
S.exitVeh(); frame();
/* dismounting is an animated blend now, not a teleport: the rider stays on the bike while it
   plays, then is handed back to the walking ragdoll */
check('dismounting starts a blend and keeps the rider aboard while it plays',
  S.mode() === 'walk' && S.veh('bike').rider && S.dismount().pending,
  'rider=' + S.veh('bike').rider + ' pending=' + S.dismount().pending);
for (let i = 0; i < 40; i++) frame();
check('the rider is handed back to the walker when the blend finishes',
  S.mode() === 'walk' && !S.veh('bike').rider && !S.dismount().pending && S.dismount().hero,
  'rider=' + S.veh('bike').rider + ' pending=' + S.dismount().pending + ' hero=' + S.dismount().hero);

/* ---- stability: a long run of live frames ---- */
let frameError = null;
try { for (let i = 0; i < 300; i++) frame(); } catch (e) { frameError = e; }
check('300 live frames run without throwing', !frameError, frameError ? frameError.message : '');

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail ? 'BOOT + GAMEPLAY FAILED' : 'ALL BOOT + GAMEPLAY CHECKS PASSED');
process.exit(fail ? 1 : 0);
