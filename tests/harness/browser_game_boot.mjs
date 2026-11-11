/* Boots the REAL src/main.js for browser_build_test.mjs.
 *
 * Uses the same technique as boot_test.mjs: jsdom supplies the DOM, a stub renderer replaces the
 * WebGL one, and the module is imported through the harness resolver. The difference is that the
 * asset stub here fetches over HTTP from the running dev server, so it proves the served build
 * works — not just the files on disk.
 */
export async function boot({ origin, window, document }) {
  globalThis.window = window;
  globalThis.document = document;
  globalThis.self = window;
  try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch {}
  globalThis.innerWidth = 900; globalThis.innerHeight = 420; globalThis.devicePixelRatio = 2;
  if (!window.matchMedia) window.matchMedia = (q) => ({ matches: /landscape|screen/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.matchMedia = window.matchMedia;
  globalThis.SFX = { load() {}, attach() {}, play() {}, probe() {}, ready: () => true, onChange() {}, muted: false };
  globalThis.PF = { report() {}, send() {}, on() {}, ready() {}, shot() {}, toast() {}, hint() {} };
  globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };

  const THREE = await import('three');
  const fakeCtx = () => ({
    canvas: document.createElement('canvas'), fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '', globalCompositeOperation: '',
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
    rect() {}, fill() {}, stroke() {}, clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
    translate() {}, rotate() {}, scale() {}, setTransform() {}, drawImage() {}, clip() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}), getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {},
    measureText: () => ({ width: 10 }), setLineDash() {}, getLineDash: () => [],
  });
  /* jsdom has no PNG decoder, so a GLB with embedded textures (the city buildings) never finishes
     loading its images and its parse promise hangs. A 1x1 stub image keeps the parse resolvable;
     geometry, materials and skeleton are all still real. Textures are not part of what these tests
     check (nothing here inspects pixels). */
  const RealImage = window.Image;
  window.Image = class StubImage {
    constructor() { this.width = 1; this.height = 1; this.naturalWidth = 1; this.naturalHeight = 1; this.complete = true; this.src = ''; this._handlers = {}; }
    set src(v) { this._src = v; setTimeout(() => { this.complete = true; this.onload && this.onload({ target: this }); this.onload && this.dispatchEvent && this.dispatchEvent({ type: 'load' }); }, 0); }
    get src() { return this._src; }
    addEventListener(t, f) { if (t === 'load') this.onload = f; if (t === 'error') this.onerror = f; }
    removeEventListener() {}
    decode() { return Promise.resolve(); }
  };

  const realGetContext = window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/i.test(String(type))) return null;        // no GPU here, and the renderer is stubbed
    const real = realGetContext ? realGetContext.call(this, type, ...rest) : null;
    return real || fakeCtx();                             // 2D is needed to decode GLB textures
  };

  /* stub renderer: no WebGL available headless, but the rest of three.js is the real thing */
  class StubRenderer {
    constructor() {
      this.domElement = document.createElement('canvas');
      this.shadowMap = { enabled: false, type: 0 };
      this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
      this.outputColorSpace = ''; this.toneMapping = 0; this.toneMappingExposure = 1;
    }
    setPixelRatio() {} setSize() {} setClearColor() {} setClearAlpha() {} clear() {}
    render() {} compile() {} dispose() {} getContext() { return null; }
    setAnimationLoop() {} setScissorTest() {} getSize(t) { return t && t.set(900, 420), t; }
  }
  /* ES module namespaces are frozen, so patch the copy main.js imports instead: main.js is
     rewritten below to take WebGLRenderer from a shim module. */
  const { writeFileSync: wf, mkdirSync } = await import('node:fs');
  mkdirSync(new URL('./src/', import.meta.url), { recursive: true });
  wf(new URL('./src/__vfx.js', import.meta.url), 'export default { useScene(){}, attach(){}, play(){}, stopAll(){}, update(){} };\n');
  wf(new URL('./src/__pf_index.js', import.meta.url), "export * from '../boot_stubs/pixelfork_index.js';\n");
  wf(new URL('./src/__pf_assets.js', import.meta.url), "export * from '../boot_stubs/pixelfork_assets.js';\n");
  /* the asset stub's loader is instrumented so a stalled GLB parse is identifiable */
  wf(new URL('./src/__pf_assets.js', import.meta.url), `
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import fs from 'node:fs';
const loader = new GLTFLoader();
const cache = new Map();
export const state = { missing: new Set(), loaded: [], failed: [] };

/* jsdom has no image decoder, so any GLB with embedded textures (the city buildings, the suit
   character) never finishes decoding and its parse promise hangs forever. Strip the texture
   references before parsing: geometry, skin, skeleton and materials stay real, only the pixel maps
   are dropped. Nothing in these tests inspects a texel — they check rigs, poses and game logic. */
function withoutTextures(buf) {
  const b = Buffer.from(buf);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  for (const m of json.materials || []) {
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  json.images = []; json.textures = []; json.samplers = [];
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (js.length % 4)) % 4;
  js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const rest = b.subarray(20 + jl);
  const head = Buffer.from(b.subarray(0, 20));
  head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, js, rest]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export const MODELS = {
  async load(ids) {
    for (const id of ids) {
      if (cache.has(id)) continue;
      const b = fs.readFileSync('./assets_nt/' + id + '.glb');
      const gltf = await loader.parseAsync(withoutTextures(b), '');
      cache.set(id, gltf); state.loaded.push(id);
    }
  },
  model(id) {
    const g = cache.get(id);
    if (!g) throw new Error('model not loaded: ' + id);
    return { scene: g.scene, animations: g.animations || [] };
  },
  clone(id) { return cloneSkeleton(cache.get(id).scene); },
};
`);
  wf(new URL('./src/__three_stub.mjs', import.meta.url),
    `export * from 'three';\n` +
    `export class WebGLRenderer {\n` +
    `  constructor(){ this.domElement=document.createElement('canvas'); this.shadowMap={enabled:false,type:0};\n` +
    `    this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}}; this.outputColorSpace=''; this.toneMapping=0; }\n` +
    `  setPixelRatio(){} setSize(){} setClearColor(){} setClearAlpha(){} clear(){} render(){} compile(){} dispose(){}\n` +
    `  getContext(){ return null; } setAnimationLoop(){} setScissorTest(){} getSize(t){ if(t) t.set(900,420); return t; }\n` +
    `  getPixelRatio(){ return 1; } setViewport(){} getViewport(t){ return t; } setClearAlpha(){} capabilities={ isWebGL2:true, getMaxAnisotropy:()=>1 };\n` +
    `}\n`);

  /* The game derives its frame delta from performance.now(). A test that calls frame() in a tight
     loop barely advances the real clock, so the mount blend would never progress. Give it a clock
     the test can step, which is exactly what a real browser's 16.7 ms frame gap looks like. */
  let fakeNow = 0;
  const clock = { advance(ms) { fakeNow += ms; }, now: () => fakeNow };
  /* main.js runs in Node's realm, so it reads globalThis.performance — patch that (and the jsdom
     window's, for anything reading through window). Both must agree or the frame delta is wrong. */
  const fakePerf = { now: clock.now, timeOrigin: 0, mark() {}, measure() {}, getEntriesByName: () => [], markResourceTiming() {} };
  for (const target of [globalThis, window]) {
    try { Object.defineProperty(target, 'performance', { value: fakePerf, configurable: true, writable: true }); } catch {}
  }
  globalThis.__gameClock = clock;

  /* the page's own main.js, with its imports pointed at the harness copies of the packs */
  const res = await fetch(origin + '/src/main.js');
  let src = await res.text();
  /* instrument the un-caught boot IIFE so a stall is visible */
  src = src.replace('const office=await loadBuilding(', 'console.log("[boot] buildings start"); const office=await loadBuilding(')
           .replace('async function loadBuilding(kind,name) {', 'async function loadBuilding(kind,name) { console.log("[boot] loadBuilding " + name);')
           .replace('await MODELS.load([name]);', 'console.log("[boot] awaiting MODELS.load"); const _p = MODELS.load([name]); console.log("[boot] promise made", typeof _p, _p && typeof _p.then); await Promise.race([_p, new Promise(r=>setTimeout(()=>{console.log("[boot] TIMEOUT on MODELS.load"); r();}, 4000))]);')
           .replace('await loadExtras();', 'console.log("[boot] extras start"); await loadExtras(); console.log("[boot] extras done");');
  src = src
    /* only the main module takes the renderer stub; everything else keeps the real three */
    .replace(/^import \* as THREE from 'three';$/m, "import * as THREE from './__three_stub.mjs';")
    .replace(/from '\.\.\/pixelfork\/index\.js'/g, "from './__pf_index.js'")
    .replace(/from '\.\.\/pixelfork\/assets-3d\.js'/g, "from './__pf_assets.js'")
    .replace(/from 'vfx'/g, "from './__vfx.js'");
  /* expose the internals the test drives, exactly like boot_test.mjs does */
  src += `
export const __t = {
  loop: loop.opts, clock: () => globalThis.__gameClock, state: () => state, mode: () => mode, diag: () => ({ ...diag }),
  start: () => { state='play'; }, 
  heroPos: () => (hero ? [hero.position[0], hero.position[1], hero.position[2]] : null),
  heroExists: () => !!hero, heroPose: () => (heroPose ? heroPose.ok : null),
  veh: (k) => ({ rider: !!V[k].rider, pose: !!V[k].riderPose, ready: V[k].ready }),
  carSpeed: () => (V.bike.ctrl.s.speed),
  drive: (v) => { V.bike.ctrl.input.throttle = v; V.bike.ctrl.input.steer = 0; },
  riderLean: () => (V.bike.riderPose ? V.bike.riderPose.chestLean() * 57.2958 : 0),
  skinnedMeshes: () => { let n=0; scene.traverse(o=>{ if(o.isSkinnedMesh) n++; }); return n; },
  setMove: (x, y) => { moveX = x; moveY = y; },
  moveNow: () => [moveX, moveY],
  charDiag: () => diag.char, charModelObj: () => (charModel ? { uuid: charModel.uuid, parent: charModel.parent && charModel.parent.type } : null),
  riderMix: () => (V.bike.riderPose ? V.bike.riderPose.tune._mix : -1),
  riderLeanRad: () => (V.bike.riderPose ? V.bike.riderPose.leanNow() : -1),
  bikeState: () => ({ x: V.bike.ctrl.s.x, z: V.bike.ctrl.s.z, h: V.bike.ctrl.s.h, speed: V.bike.ctrl.s.speed, offroad: V.bike.ctrl.s.offroad, brake: V.bike.ctrl.input.brake }), phoneOpen: () => UI.phoneOpen(), brakes: () => ({ held: brakeHeld, throttle: V.bike.ctrl.input.throttle }),
  enterVeh: (k, f) => enterVeh(V[k], f), exitVeh: () => exitVeh(),
};
`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL('./src/__main_browser.mjs', import.meta.url), src);
  const mod = await import('./src/__main_browser.mjs?' + Date.now());
  const T = mod.__t;
  T.bootErrors = [];
  return T;
}
