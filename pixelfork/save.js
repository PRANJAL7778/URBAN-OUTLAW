/* Pixelfork save (platform file: the AI reads it, never changes it). High scores and progress, kept on the player's device.
     SAVE.get("best", 0) · SAVE.set("best", 120) · SAVE.remove("best")
   Each game keeps its own saves, by the game's id (they never mix, even between games with the same name on one address).
   Works in the browser and in the Android app. Names starting with "_" belong to the platform (AUDIO keeps "_muted", "_music" and "_sounds", HAPTICS "_haptics"). */
const game = document.querySelector('meta[name="pf-game"]')?.getAttribute("content") || location.pathname;
const key = (/** @type {string} */ k) => `pf:${game}:${k}`;
export const SAVE = {
  /** @template T @param {string} k @param {T} fallback @returns {T} */
  get(k, fallback) {
    try { const v = localStorage.getItem(key(k)); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  /** @param {string} k @param {unknown} v */ set(k, v) { try { localStorage.setItem(key(k), JSON.stringify(v)); } catch { /* full or blocked: the game goes on */ } },
  /** @param {string} k */ remove(k) { try { localStorage.removeItem(key(k)); } catch { /* ignore */ } },
};
