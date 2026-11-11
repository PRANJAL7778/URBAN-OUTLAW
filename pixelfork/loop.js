/* Pixelfork game loop (platform file: the AI reads it, never changes it).
   A fixed step for game logic and physics (the same speed on every phone), drawing once per screen frame.

     import { startLoop } from "../pixelfork/loop.js";
     const loop = startLoop({
       update(dt) { ... },          // game logic, dt is always the same (1/60 s by default)
       render(alpha) { ... },       // draw; alpha (0 to 1) is how far between two steps, for smooth movement
     });
     loop.pause(); loop.resume(); loop.timeScale = 0.5;   // slow motion

   It pauses by itself when the tab or app goes to the background, and when the dashboard says so.
   A pause menu: loop.pause() and SC.popup.open("pause"). However the player closes that popup (its Resume button, its X,
   a tap outside it, Escape), the game plays on by itself; a popup opened from it (settings) carries that on until it closes
   too. It stays paused when the popup closes to a full-page screen with a backdrop (the menu, a result screen): the game
   decides when to play again. Pause with loop.pause() only, never with a flag of your own, so this always works.
   It reports frames per second to the dashboard once a second. */

/**
 * @param {{ update: (dt: number) => void, render?: (alpha: number) => void, step?: number, maxFrame?: number }} o
 * @returns {{ pause(): void, resume(): void, readonly paused: boolean, timeScale: number, readonly time: number, stop(): void }}
 */
export function startLoop(o) {
  const step = o.step || 1 / 60, maxFrame = o.maxFrame || 0.25;
  let acc = 0, last = performance.now(), raf = 0, frames = 0, fpsT = last, time = 0, stopped = false, broken = false;
  const pausedBy = new Set(); // "person" (pause()), "hidden" (background), "dashboard"
  const state = {
    timeScale: 1,
    get paused() { return pausedBy.size > 0; },
    get time() { return time; },
    pause() { pausedBy.add("person"); },
    resume() { if (broken) return; pausedBy.delete("person"); last = performance.now(); },
    stop() { stopped = true; cancelAnimationFrame(raf); },
  };
  const PF = /** @type {any} */ (globalThis).PF;

  /* the popups open right after pause() are the pause menu: closing it any way resumes (Farid: closing a pause menu with
     its X left some games paused for good) */
  /** @type {Set<Element>} */ const menus = new Set();
  const openOnes = (/** @type {string} */ sel) => [...document.querySelectorAll(sel)].filter((e) => !(/** @type {HTMLElement} */ (e)).hidden && !e.classList.contains("sc-closing"));
  const pause = state.pause;
  state.pause = () => { pause(); setTimeout(() => { if (pausedBy.has("person")) openOnes(".sc-popup").forEach((e) => menus.add(e)); }, 0); };
  state.resume = ((resume) => () => { menus.clear(); resume(); })(state.resume);
  document.addEventListener("close", (e) => {
    const el = /** @type {Element} */ (e.target);
    if (!menus.delete(el) || !pausedBy.has("person")) return;
    const popups = openOnes(".sc-popup");
    if (popups.length) { popups.forEach((p) => menus.add(p)); return; }
    if (menus.size) return;
    if (openOnes(".sc-screen").some((s) => { const b = (/** @type {HTMLElement} */ (s)).dataset.backdrop; return !!b && b !== "none"; })) return;
    state.resume();
  });
  const frame = (/** @type {number} */ now) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    let dt = Math.min(maxFrame, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      acc += dt * state.timeScale;
      while (acc >= step) {
        /* an error in the game's update stops the game (so it can't run on broken) and goes to the console once */
        try { o.update(step); } catch (e) { console.error(e); broken = true; state.pause(); break; }
        acc -= step; time += step;
      }
    }
    /* same for drawing: one error, reported once, not sixty times a second */
    if (o.render && !broken) { try { o.render(state.paused ? 0 : acc / step); } catch (e) { console.error(e); broken = true; state.pause(); } }
    frames++;
    if (now - fpsT >= 1000) { PF && PF.send("fps", { fps: Math.round((frames * 1000) / (now - fpsT)) }); frames = 0; fpsT = now; }
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) pausedBy.add("hidden"); else { pausedBy.delete("hidden"); last = performance.now(); } });
  if (PF) {
    PF.on("pause", () => pausedBy.add("dashboard"));
    PF.on("resume", () => { pausedBy.delete("dashboard"); last = performance.now(); });
  }
  raf = requestAnimationFrame(frame);
  return state;
}
