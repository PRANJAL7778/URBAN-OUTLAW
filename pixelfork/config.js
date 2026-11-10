/* Pixelfork config (platform file: the AI reads it, never changes it).
   Every value a person might tweak lives in the game's src/config.js, described once:

     import { defineConfig } from "../pixelfork/config.js";
     export default defineConfig({
       player: { label: "Player",
         runSpeed:   { value: 5, min: 1, max: 12, step: 0.5, label: "Run speed" },
         jumpHeight: { value: 12, min: 4, max: 30, step: 1, unit: "px", label: "Jump height" },
         color:      { value: "#e2502a", type: "color", label: "Fox color" },
         doubleJump: { value: false, type: "toggle", label: "Double jump" },
         difficulty: { value: "normal", type: "choice", options: ["easy", "normal", "hard"], label: "Difficulty" },
       },
     });

   The game reads values through it, always current: CONFIG.player.runSpeed.
   Mechanics in the dashboard changes them live (no reload, no AI), and CONFIG.on("player.runSpeed", fn) hears about it.
   Saving in Mechanics rewrites only the value: numbers in src/config.js (done by Pixelfork, not the AI). */

/**
 * @typedef {{ value: number, min: number, max: number, step?: number, unit?: string, label: string, type?: "number" }} NumberField
 * @typedef {{ value: string, type: "color", label: string }} ColorField
 * @typedef {{ value: boolean, type: "toggle", label: string }} ToggleField
 * @typedef {{ value: string, type: "choice", options: string[], label: string }} ChoiceField
 * @typedef {{ value: string, type: "text", label: string, maxLength?: number }} TextField
 * @typedef {NumberField | ColorField | ToggleField | ChoiceField | TextField} Field
 * @typedef {{ label: string } & Record<string, Field | string>} Group
 */

const HEX = /^#[0-9a-f]{6}$/i;
const typeOf = (/** @type {Field} */ f) => f.type || "number";

/** keep a value inside what its field allows */
function clean(/** @type {Field} */ f, /** @type {unknown} */ v) {
  switch (typeOf(f)) {
    case "number": {
      const n = /** @type {NumberField} */ (f);
      let x = typeof v === "number" && isFinite(v) ? v : Number(v);
      if (!isFinite(x)) return n.value;
      x = Math.min(n.max, Math.max(n.min, x));
      if (n.step) x = Math.round((x - n.min) / n.step) * n.step + n.min;
      return +x.toFixed(6);
    }
    case "color": return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : f.value;
    case "toggle": return !!v;
    case "choice": return /** @type {ChoiceField} */ (f).options.includes(/** @type {string} */ (v)) ? v : f.value;
    case "text": return String(v ?? "").slice(0, /** @type {TextField} */ (f).maxLength || 200);
  }
  return f.value;
}

/**
 * Describe the game's tweakable values. Returns the live values, grouped the same way, plus on / set / reset / schema.
 * @template {Record<string, Group>} S
 * @param {S} schema
 * @returns {{ [G in keyof S]: { readonly [K in Exclude<keyof S[G], "label">]: S[G][K] extends { value: infer V } ? (V extends number ? number : V extends boolean ? boolean : string) : never } }
 *   & { on(path: string, fn: (value: unknown) => void): () => void, set(path: string, value: unknown): void, reset(path?: string): void, schema(): object }}
 */
export function defineConfig(schema) {
  /** @type {Record<string, Record<string, unknown>>} */ const values = {};
  /** @type {Record<string, Field>} */ const fields = {};
  /** @type {Record<string, Array<(v: unknown) => void>>} */ const subs = {};
  for (const [g, group] of Object.entries(schema)) {
    values[g] = {};
    for (const [k, f] of Object.entries(group)) {
      if (k === "label" || typeof f !== "object") continue;
      fields[g + "." + k] = /** @type {Field} */ (f);
      values[g][k] = clean(/** @type {Field} */ (f), /** @type {Field} */ (f).value);
    }
  }
  const set = (/** @type {string} */ path, /** @type {unknown} */ value) => {
    const f = fields[path];
    if (!f) { console.warn(`config: there's no "${path}" (known: ${Object.keys(fields).join(", ")})`); return; }
    const [g, k] = path.split(".");
    const v = clean(f, value);
    if (values[g][k] === v) return;
    values[g][k] = v;
    (subs[path] || []).forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });
    (subs["*"] || []).forEach((fn) => { try { fn({ path, value: v }); } catch (e) { console.error(e); } });
  };
  const reset = (/** @type {string=} */ path) => {
    for (const p of path ? [path] : Object.keys(fields)) if (fields[p]) set(p, fields[p].value);
  };
  /** the schema as plain data, for the Mechanics panel (groups in order, each with its fields and their current values) */
  const describe = () => Object.entries(schema).map(([g, group]) => ({
    key: g, label: group.label || g,
    fields: Object.entries(group).filter(([k, f]) => k !== "label" && typeof f === "object").map(([k, f]) => ({ key: k, path: g + "." + k, ...(/** @type {object} */ (f)), type: typeOf(/** @type {Field} */ (f)), current: values[g][k] })),
  }));

  /** @type {any} */ const api = {};
  for (const g of Object.keys(values)) {
    const view = {};
    for (const k of Object.keys(values[g])) Object.defineProperty(view, k, { get: () => values[g][k], enumerable: true });
    api[g] = Object.freeze(view);
  }
  api.on = (/** @type {string} */ path, /** @type {(v: unknown) => void} */ fn) => { (subs[path] = subs[path] || []).push(fn); return () => { subs[path] = subs[path].filter((f) => f !== fn); }; };
  api.set = set;
  api.reset = reset;
  api.schema = describe;
  Object.freeze(api);

  /* the dashboard: send the schema once, then take live changes from Mechanics */
  const PF = /** @type {any} */ (globalThis).PF;
  if (PF) {
    PF.send("config-schema", describe());
    PF.on("config-set", (/** @type {{ path: string, value: unknown }} */ d) => d && set(d.path, d.value));
    PF.on("config-reset", (/** @type {{ path?: string } | null} */ d) => reset(d ? d.path : undefined));
  }
  return api;
}
