/* Pixelfork audio (platform file: the AI reads it, never changes it).
   Built-in sounds and music: the Pixelfork SFX library (SFX.play("coin.collect"), SFX.music("music.casual.1")).
   The person's own sound files: ASSETS.sound(name) (Howler). This keeps both under one mute and one volume:
     AUDIO.mute(true) · AUDIO.muted · AUDIO.volume(0.8)
     AUDIO.onChange((muted) => showSoundIcon(muted));   // any change: the game's own button or the dashboard's
     AUDIO.musicVolume(0.5) · AUDIO.soundVolume(0.5)     // a settings screen's sliders (0 to 1); without a value, they return it
   Mute and the music and sound volumes are remembered for this game on this device (not shared with other games), and
   applied when the game starts. The mix starts quiet, the way players expect on a phone: music well under the sounds
   (0.3), sounds at 0.7. Keep it that way: never raise the music, pass volume above 1, or play a sound every frame.
   A sound that plays often (each tap, step, tick, small collect) takes { volume: 0.3 } to { volume: 0.5 }; full volume
   is for rare big moments (a win, game over). A settings slider goes through musicVolume and soundVolume, not SFX.volume.
   Sound starts after the player's first tap (phones require it); both libraries wait for that by themselves. */
import { SAVE } from "./save.js";

const G = /** @type {any} */ (globalThis);
let muted = !!SAVE.get("_muted", false), volume = 1;
/* the quiet mix (Farid: music and some sounds were too loud); a person's own settings for this game win */
const MIX = { music: 0.3, sounds: 0.7 };
let music = Number(SAVE.get("_music", MIX.music)), sounds = Number(SAVE.get("_sounds", MIX.sounds));
const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(1, Number(v) || 0));
const applyMix = () => {
  if (!G.SFX || typeof G.SFX.volume !== "function") return;
  G.SFX.volume("music", music);
  for (const c of ["ui", "game", "reward"]) G.SFX.volume(c, sounds);
};
/** @type {Array<(muted: boolean) => void>} */ const subs = [];
const apply = () => {
  if (G.SFX && typeof G.SFX.mute === "function") G.SFX.mute(muted);
  if (G.Howler) G.Howler.mute(muted);
};
export const AUDIO = {
  get muted() { return muted; },
  /** @param {boolean} [on] toggles when left out; returns the new state */
  mute(on) {
    const was = muted;
    muted = on === undefined ? !muted : !!on;
    apply();
    SAVE.set("_muted", muted);
    if (muted !== was) subs.forEach((fn) => { try { fn(muted); } catch (e) { console.error(e); } });
    return muted;
  },
  /** @param {(muted: boolean) => void} fn called on every change; returns a function that stops it */
  onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  /** @param {number} v from 0 to 1 */
  volume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (G.SFX && typeof G.SFX.volume === "function") G.SFX.volume("master", volume);
    if (G.Howler) G.Howler.volume(volume);
    return volume;
  },
  /** the music's volume, 0 to 1 (0.3 unless the player changed it); remembered for this game @param {number} [v] */
  musicVolume(v) { if (v !== undefined) { music = clamp(v); applyMix(); SAVE.set("_music", music); } return music; },
  /** every sound's volume but the music's, 0 to 1 (0.7 unless the player changed it); remembered for this game @param {number} [v] */
  soundVolume(v) { if (v !== undefined) { sounds = clamp(v); applyMix(); SAVE.set("_sounds", sounds); } return sounds; },
};
/* start the way this game was left (the SFX library alone would carry one game's mute and volumes over to every other game) */
apply();
applyMix();
/* the dashboard's mute button */
if (G.PF) G.PF.on("mute", (/** @type {{ on?: boolean } | null} */ d) => AUDIO.mute(d ? d.on : undefined));
