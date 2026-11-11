/* Pixelfork haptics (platform file: the AI reads it, never changes it). The phone vibrates at the moments a player
   should feel (Farid: games should vibrate on phones):
     HAPTICS.tap()       // a light tick: a piece placed, a small collect, a successful tap on the game
     HAPTICS.bump()      // medium: a hit, a landing, a match, a merge
     HAPTICS.heavy()     // strong: a crash, an explosion, a life lost
     HAPTICS.success()   // a win, a level cleared, a new best
     HAPTICS.fail()      // game over, a wrong move
     HAPTICS.on(false) · HAPTICS.enabled   // a settings screen's vibration switch; remembered for this game on this device
   Every game uses it: at least on its main action and on winning and losing. Keep it for moments, never every frame or
   on a timer; calls closer together than 40 ms count once. Android phones vibrate through navigator.vibrate; iPhones
   (Safari 18 and later) through the system's switch tick, which only works during a tap, so call it from the tap's own
   handler when you can. A phone that can do neither simply doesn't vibrate; nothing to check first. */
import { SAVE } from "./save.js";

let enabled = !!SAVE.get("_haptics", true), last = 0;
/** @type {HTMLLabelElement | null} */ let tick = null;

/* iPhones: tapping a switch control gives a system tick; a hidden one does it for the game */
function iosTick() {
  if (!tick) {
    tick = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox"; input.setAttribute("switch", ""); input.tabIndex = -1;
    tick.append(input);
    tick.setAttribute("aria-hidden", "true");
    tick.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    for (const t of ["click", "change", "input"]) tick.addEventListener(t, (e) => e.stopPropagation());
    document.body.append(tick);
  }
  tick.click();
}

/** @param {number[]} pattern milliseconds on, off, on... (an iPhone ticks once per "on") */
function buzz(pattern) {
  if (!enabled) return;
  const now = performance.now();
  if (now - last < 40) return;
  last = now;
  try {
    if (typeof navigator.vibrate === "function") { navigator.vibrate(pattern); return; }
    let at = 0;
    pattern.forEach((ms, i) => { if (i % 2 === 0) { if (at === 0) iosTick(); else setTimeout(iosTick, at); } at += ms; });
  } catch { /* no vibration here: the game goes on */ }
}

export const HAPTICS = {
  get enabled() { return enabled; },
  /** @param {boolean} [on] toggles when left out; returns the new state */
  on(on) { enabled = on === undefined ? !enabled : !!on; SAVE.set("_haptics", enabled); return enabled; },
  tap() { buzz([10]); },
  bump() { buzz([22]); },
  heavy() { buzz([45]); },
  success() { buzz([15, 70, 30]); },
  fail() { buzz([40, 80, 40]); },
};
