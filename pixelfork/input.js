/* Pixelfork input (platform file: the AI reads it, never changes it). One way to read touch, mouse and keyboard.

     INPUT.onPress((x, y) => flap());                  // the moment a finger touches (onTap waits for it to lift)
     INPUT.onTap((x, y) => jump());                    // a quick tap or click
     INPUT.onSwipe((dir) => { if (dir === "left") lane--; });   // "left" | "right" | "up" | "down"
     INPUT.onDrag((dx, dy, phase) => ...);             // phase: "start" | "move" | "end"
     INPUT.key("ArrowLeft") / INPUT.key("KeyA")        // held right now (KeyboardEvent.code)
     INPUT.onKey("Space", () => jump());               // pressed
     INPUT.pointer                                      // { x, y, down } in CSS pixels
     INPUT.axis()                                       // { x, y } from -1 to 1: arrow keys / WASD, or dragging on touch (a simple joystick)

   Only touches on the game itself count: a press on a button or other UI over the game (the UI kit's screens, HUD
   buttons) is left to that UI, so it never also jumps, throws or drops. */
const held = new Set();
/** @type {Record<string, Array<() => void>>} */ const keyFns = {};
/** @type {Array<(x: number, y: number) => void>} */ const presses = [];
/** @type {Array<(x: number, y: number) => void>} */ const taps = [];
/** @type {Array<(dir: "left" | "right" | "up" | "down") => void>} */ const swipes = [];
/** @type {Array<(dx: number, dy: number, phase: "start" | "move" | "end") => void>} */ const drags = [];
const pointer = { x: 0, y: 0, down: false };
let start = { x: 0, y: 0, t: 0 }, dragging = false, stick = { x: 0, y: 0 };
/** the game itself: its canvas (2D or three.js), or the empty page around it */
const onGame = (/** @type {EventTarget | null} */ t) => t instanceof HTMLCanvasElement || t === document.body || t === document.documentElement || (t instanceof HTMLElement && t.id === "game");

addEventListener("keydown", (e) => { if (!e.repeat) (keyFns[e.code] || []).forEach((f) => f()); held.add(e.code); });
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());
addEventListener("pointerdown", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (!onGame(e.target)) return;
  pointer.down = true;
  start = { x: e.clientX, y: e.clientY, t: performance.now() }; dragging = false;
  presses.forEach((f) => f(e.clientX, e.clientY));
});
addEventListener("pointermove", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (!pointer.down) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (!dragging && Math.hypot(dx, dy) > 10) { dragging = true; drags.forEach((f) => f(0, 0, "start")); }
  if (dragging) { drags.forEach((f) => f(dx, dy, "move")); stick = { x: Math.max(-1, Math.min(1, dx / 60)), y: Math.max(-1, Math.min(1, dy / 60)) }; }
});
const up = (/** @type {PointerEvent} */ e) => {
  if (!pointer.down) return;
  pointer.down = false;
  const dx = e.clientX - start.x, dy = e.clientY - start.y, ms = performance.now() - start.t, dist = Math.hypot(dx, dy);
  if (dragging) drags.forEach((f) => f(dx, dy, "end"));
  stick = { x: 0, y: 0 };
  if (dist < 10 && ms < 300) taps.forEach((f) => f(e.clientX, e.clientY));
  else if (dist >= 30 && ms < 600) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    swipes.forEach((f) => f(dir));
  }
};
addEventListener("pointerup", up);
addEventListener("pointercancel", up);

export const INPUT = {
  pointer,
  /** @param {string} code KeyboardEvent.code, like "ArrowLeft", "KeyA", "Space" */ key: (code) => held.has(code),
  /** @param {string} code @param {() => void} fn */ onKey(code, fn) { (keyFns[code] = keyFns[code] || []).push(fn); },
  /** @param {(x: number, y: number) => void} fn */ onPress(fn) { presses.push(fn); },
  /** @param {(x: number, y: number) => void} fn */ onTap(fn) { taps.push(fn); },
  /** @param {(dir: "left" | "right" | "up" | "down") => void} fn */ onSwipe(fn) { swipes.push(fn); },
  /** @param {(dx: number, dy: number, phase: "start" | "move" | "end") => void} fn */ onDrag(fn) { drags.push(fn); },
  /** arrow keys / WASD, or dragging on touch: { x, y } from -1 to 1 */
  axis() {
    const k = { x: (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0), y: (held.has("ArrowDown") || held.has("KeyS") ? 1 : 0) - (held.has("ArrowUp") || held.has("KeyW") ? 1 : 0) };
    return k.x || k.y ? k : { ...stick };
  },
};
