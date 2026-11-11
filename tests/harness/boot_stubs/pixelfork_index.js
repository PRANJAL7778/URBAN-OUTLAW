// Test double for pixelfork/index.js: records calls, does not touch the DOM or audio.
export const calls = { save:{}, loopPause:0, loopResume:0, audioMute:[], hapticsOn:[], sfx:[], vfx:[], hints:[] };
const handlers = {};
export const SCREEN = { onResize() {}, size: () => ({ width: 800, height: 360, dpr: 1 }) };
export const INPUT = { onKey: () => () => {}, onAxis() {}, onDrag: () => () => {}, onTap: () => () => {}, down: () => false, key: () => false, axis: () => ({ x: 0, y: 0 }), keys: new Set() };
export const SAVE = {
  get: (k, d) => (k in calls.save ? calls.save[k] : d),
  set: (k, v) => { calls.save[k] = v; },
};
export const HAPTICS = { on: (v) => calls.hapticsOn.push(v), tap() {}, bump() {}, success() {}, enabled: true };
export const AUDIO = { mute: (v) => calls.audioMute.push(v), muted: false, onChange() {}, play() {}, unlock() {} };
export const loop = {
  paused: false, opts: null,
  pause() { calls.loopPause++; loop.paused = true; },
  resume() { calls.loopResume++; loop.paused = false; },
  start() {}, stop() {},
};
export function startLoop(opts) { calls.loopOpts = opts; loop.opts = opts; return loop; }
export const PF = { report() {} };
export function hint(id, text) { calls.hints.push(id + ':' + text); }
export function onHint(fn) { handlers.hint = fn; }
export const BAG = { get: () => 0, add() {} };
