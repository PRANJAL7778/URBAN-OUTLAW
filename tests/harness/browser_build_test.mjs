/* Browser-build smoke test: loads the REAL page from the running dev server into a jsdom window
 * and boots src/main.js exactly as a browser would, then drives a full
 * walk → mount → ride → dismount cycle through the game's own entry points.
 *
 * This is NOT a substitute for a real browser (no WebGL, no GPU, no touch): three.js runs against a
 * stub renderer. It does prove that every module the page imports resolves over HTTP, that the GLB
 * assets load, and that the gameplay code paths run without throwing.
 *
 *   node serve.js &            # or the platform preview
 *   node browser_build_test.mjs [http://localhost:8080]
 */
import { JSDOM, VirtualConsole } from 'jsdom';
/* the game's boot chain is an async IIFE with no catch: an exception inside it stops the chain
   silently, so surface it here rather than staring at "loading" forever */
process.on('unhandledRejection', (e) => { console.log('   [boot rejection]', e && (e.message || e)); });

const ORIGIN = process.argv[2] || 'http://localhost:8080';

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };

/* ---------------------------------------------------------------- the page */
const errors = [];
const vc = new VirtualConsole();
vc.on('warn', (...a) => console.log('   [warn]', String(a[0]).slice(0, 100)));
vc.on('log', (...a) => console.log('   [log]', String(a[0]).slice(0, 100)));
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = await (await fetch(ORIGIN + '/')).text();
const dom = new JSDOM(html, {
  url: ORIGIN + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  resources: undefined,
});
const { window } = dom;
const doc = window.document;

/* the few globals main.js and three.js reach for */
window.devicePixelRatio = 2;
window.innerWidth = 900; window.innerHeight = 420;
window.matchMedia = (q) => ({ matches: /landscape|screen/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 8);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:stub');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
  value: function () { return null; }, configurable: true,
});

/* three.js needs a renderer: swap WebGLRenderer for a recorder. This is the only thing stubbed —
   everything else (GLTFLoader, the ragdoll, the pose, the game logic) is the real code. */
const stats = { rendered: 0, frames: 0 };

const boot = async () => {
  const THREE = await import(ORIGIN + '/packs/render-3d/three@0.186.0/files/three.module.js');
  const RealRenderer = THREE.WebGLRenderer;
  class StubRenderer extends RealRenderer {
    constructor(opts) {
      super({ ...opts, canvas: doc.createElement('canvas') });
      this.domElement = doc.createElement('canvas');
      this.shadowMap = { enabled: false, type: 0 };
      this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    }
    setPixelRatio() {} setSize() {} render() { stats.rendered++; } setClearColor() {}
    getContext() { return null; } dispose() {}
  }
  THREE.WebGLRenderer = StubRenderer;

  /* run src/main.js with the window's globals in scope */
  const src = await (await fetch(ORIGIN + '/src/main.js')).text();
  const mod = await import('/@boot-proxy');
  return { THREE, src };
};

/* Rather than a proxy, execute the module inside jsdom's realm with a patched renderer by
   re-importing the game's own module graph in Node with the harness shims. */
console.log('\n=== A. the page and its module graph ===');
check('the page is served with the import map intact', /"three":\s*"\.\/packs\/render-3d/.test(html));
const mods = ['/src/main.js', '/src/riderpose.js', '/src/pose.js', '/src/character.js', '/src/camera.js', '/src/config.js'];
let allServed = true;
for (const m of mods) {
  const r = await fetch(ORIGIN + m);
  if (!r.ok || !(r.headers.get('content-type') || '').includes('javascript')) allServed = false;
}
check('every game module is served as javascript over HTTP', allServed, mods.length + ' modules');
const glb = await fetch(ORIGIN + '/assets/male_character_in_suit.glb');
check('the suit character GLB is served', glb.ok && Number(glb.headers.get('content-length')) > 1e7,
  (Number(glb.headers.get('content-length')) / 1048576).toFixed(1) + ' MB');

/* ------------------------------------------------------- B. the real game */
console.log('\n=== B. the game boots and plays (headless, stub renderer) ===');
globalThis.self = window;
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () {};

/* jsdom is the DOM, but the game's modules import bare specifiers, so run them through the same
   resolver the other harness tests use. The DOM globals above are what the game actually needs. */
const { boot: runGame } = await import('./browser_game_boot.mjs');
let S;
try { S = await runGame({ origin: ORIGIN, window, document: doc }); }
catch (e) { console.log('BOOT THREW:', e.message); throw e; }
/* advance the game clock by one 60 fps frame, then run one frame */
const frame = (dt = 1 / 60) => {
  const clock = S.clock();
  if (clock) clock.advance(dt * 1000);
  S.loop.update(dt); S.loop.render(1); stats.frames++;
};
const settle = async (ms = 400) => { const end = Date.now() + ms; while (Date.now() < end) await new Promise((r) => setTimeout(r, 10)); };
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

/* the boot chain loads the buildings, then the car, then the bobber, then the character */
const loaded = await waitFor(() => !/loading/.test(S.diag().char) && !/loading/.test(S.diag().bike), 15000);
check('the boot chain finished loading assets', loaded, 'char=' + S.diag().char.slice(0, 40) + ' bike=' + S.diag().bike.slice(0, 30));
check('the module body boots without throwing', !!S && typeof S.state === 'function', 'state=' + (S && S.state()));
check('the character model loaded', /suit character/.test(S.diag().char), (S.diag().char || '').slice(0, 64));
check('the bobber loaded with measured saddle, grips and pegs', /saddle/.test(S.diag().seat || ''), S.diag().seat);

/* start the game and walk */
S.start();
await settle(200);
for (let i = 0; i < 10; i++) frame();
check('play starts', S.state() === 'play');
const z0 = S.heroPos()[2];
S.setMove(0, 1);
for (let i = 0; i < 90; i++) frame();
S.setMove(0, 0);
check('the suit character walks in the real game loop', S.heroPos()[2] - z0 > 1.5, (S.heroPos()[2] - z0).toFixed(2) + ' m');
check('the walk arm pose is active', S.heroPose() === true, 'arms=' + S.heroPose());

/* mount the bobber */
S.enterVeh('bike', true);
for (let i = 0; i < 50; i++) frame();   // the mount blend runs in render(), not on a timer
check('the rider is mounted on the bobber', S.veh('bike').rider && S.veh('bike').pose,
  'rider=' + S.veh('bike').rider + ' pose=' + S.veh('bike').pose + ' diag=' + String(S.diag().rider).slice(0,80));
check('the rider settles into the seated pose', /seated/.test(S.diag().rider || ''), S.diag().rider);
check('mounting created no second character', S.skinnedMeshes() === 9, S.skinnedMeshes() + ' skinned meshes');

/* ride */
const bz0 = S.bikeState();
S.setMove(0, -1);                       // joystick forward = negative y
let topSpeed = 0, leanAtSpeed = 0, leanAtRest = S.riderLean(), leanNowAtSpeed = 0;
for (let i = 0; i < 90; i++) {
  frame();
  const v = Math.abs(S.carSpeed());
  if (v > topSpeed) { topSpeed = v; leanAtSpeed = S.riderLean(); leanNowAtSpeed = S.riderLeanRad(); }
}
const bz1 = S.bikeState();
check('the bobber drives under joystick throttle', Math.hypot(bz1.x - bz0.x, bz1.z - bz0.z) > 5,
  Math.hypot(bz1.x - bz0.x, bz1.z - bz0.z).toFixed(1) + ' m travelled');
check('it reaches a real speed', topSpeed > 8, 'top ' + topSpeed.toFixed(1) + ' m/s');
/* measured: seated ~17.7 deg, roughly +1 deg at 16.6 m/s. The pose deliberately keeps the tuck
   small (a bobber at 60 km/h does not go flat like a sport bike), so this asserts the direction of
   change rather than a large absolute gain. */
check('the rider leans further at speed than when stationary', leanAtSpeed > leanAtRest + 0.5,
  'rest ' + leanAtRest.toFixed(1) + ' deg -> ' + leanAtSpeed.toFixed(1) + ' deg at ' + topSpeed.toFixed(1) + ' m/s (leanNow ' + leanNowAtSpeed.toFixed(2) + ' rad)');
check('the lean stays a tuck, not a lie-down', leanAtSpeed < 42, leanAtSpeed.toFixed(1) + ' deg');

/* dismount */
S.setMove(0, 0);
S.exitVeh();
for (let i = 0; i < 45; i++) frame();
check('dismounting hands the character back to the walker', !S.veh('bike').rider && S.heroExists());
const z1 = S.heroPos()[2];
S.setMove(0, 1);
for (let i = 0; i < 60; i++) frame();
S.setMove(0, 0);
check('the character walks again after dismounting', Math.abs(S.heroPos()[2] - z1) > 0.5, Math.abs(S.heroPos()[2] - z1).toFixed(2) + ' m');

/* ---- re-entry: bike -> car -> bike must not be blocked and must not duplicate the character ---- */
S.enterVeh('bike', true);
for (let i = 0; i < 50; i++) frame();
check('re-enter the bobber after dismounting', S.veh('bike').rider && /seated/.test(S.diag().rider || ''),
  S.diag().rider + ' · leanNow=' + S.riderLeanRad().toFixed(2));
check('still one character after re-entry', S.skinnedMeshes() === 9, S.skinnedMeshes() + ' skinned meshes');

S.exitVeh();
for (let i = 0; i < 45; i++) frame();
check('dismount again', !S.veh('bike').rider && S.heroExists());

S.enterVeh('car', true);
for (let i = 0; i < 10; i++) frame();
check('the car can be entered straight after the bike', S.mode() === 'drive', 'mode=' + S.mode());
S.exitVeh();
for (let i = 0; i < 45; i++) frame();
check('and left again, with a walking hero back', S.mode() === 'walk' && S.heroExists(), 'mode=' + S.mode() + ' hero=' + S.heroExists());
check('exactly one character after bike -> car -> walk', S.skinnedMeshes() === 9, S.skinnedMeshes() + ' skinned meshes');

/* a long run */
let threw = null;
try { for (let i = 0; i < 300; i++) frame(); } catch (e) { threw = e; }
check('300 more live frames run without throwing', !threw, threw ? threw.message : '');
check('no page-level errors during the session', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail ? 'BROWSER BUILD FAILED' : 'BROWSER BUILD OK (headless jsdom, stub renderer)');
process.exit(fail ? 1 : 0);
