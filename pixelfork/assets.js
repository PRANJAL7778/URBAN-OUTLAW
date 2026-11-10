/* Pixelfork assets (platform file: the AI reads it, never changes it).
   The game's files are listed in assets/manifest.json and used by name, never by file path:

     await ASSETS.load();                                   // everything (or ASSETS.load(["hero", "coin"])), with progress: ASSETS.load(null, (done, total) => ...)
     ASSETS.image("ring_gold")                              // an <img>, ready to draw
     const hero = ASSETS.sprite("hero_sheet");              // a sprite sheet set up in Assets (frames + named animations)
     hero.draw(ctx, "run", time, x, y, { scale: 2, flipX: true });
     ASSETS.parallax("forest").draw(ctx, cameraX, width, height);   // layers, each at its own speed
     ASSETS.sound("jump").play();                           // a Howl (the person's own sound files); built-in sounds use SFX.play(name)
     ASSETS.json("level1"), ASSETS.text("dialog"), ASSETS.url("font_main"), ASSETS.info("hero_sheet")
   3D models: see assets-3d.js.
   An unknown name throws an error that lists the names that do exist. */

/**
 * @typedef {{ frames: number[], fps: number, loop?: boolean }} SpriteAnim
 * @typedef {{ file?: string, type: string, facts?: Record<string, any>, settings?: Record<string, any> }} Entry
 */

const base = new URL("assets/", document.baseURI);
/** @type {Record<string, Entry> | null} */ let manifest = null;
/** @type {Map<string, any>} */ const loaded = new Map();

async function readManifest() {
  if (manifest) return manifest;
  const r = await fetch(new URL("manifest.json", base));
  if (!r.ok) throw new Error(`assets: couldn't read assets/manifest.json (${r.status})`);
  manifest = await r.json();
  return /** @type {Record<string, Entry>} */ (manifest);
}
const entry = (/** @type {string} */ name) => {
  if (!manifest) throw new Error(`assets: call "await ASSETS.load()" before using "${name}"`);
  const e = manifest[name];
  if (!e) throw new Error(`assets: there's no asset named "${name}". Assets in this game: ${Object.keys(manifest).join(", ") || "none"}`);
  return e;
};
const got = (/** @type {string} */ name, /** @type {string} */ want) => {
  const e = entry(name);
  if (want && e.type !== want) throw new Error(`assets: "${name}" is a ${e.type}, not a ${want}`);
  if (!loaded.has(name)) throw new Error(`assets: "${name}" isn't loaded yet; include it in ASSETS.load()`);
  return loaded.get(name);
};
const img = (/** @type {string} */ file) => new Promise((res, rej) => {
  const i = new Image();
  i.decoding = "async";
  /* read with CORS, so the game's canvas stays readable when it draws pictures: the dashboard's preview runs the game in
     a sandbox, where its own files count as another site's, and a screenshot (the chat's "Screenshot of the game")
     would otherwise fail. The game's server allows it; a file:// page (an app) loads pictures as before. */
  if (location.protocol.startsWith("http")) i.crossOrigin = "anonymous";
  i.onload = () => res(i);
  i.onerror = () => rej(new Error(`assets: couldn't load ${file}`));
  i.src = new URL(file, base).href;
});

/* sprite sheet: frames cut from a grid (settings.frame = [w, h]) or listed exactly (settings.rects from an atlas file) */
function makeSprite(/** @type {HTMLImageElement} */ image, /** @type {Record<string, any>} */ s, /** @type {string} */ name) {
  const [fw, fh] = s.frame || [image.naturalWidth, image.naturalHeight];
  const cols = Math.max(1, Math.floor(image.naturalWidth / fw));
  const rects = s.rects || Array.from({ length: s.count || cols * Math.max(1, Math.floor(image.naturalHeight / fh)) }, (_, i) => [(i % cols) * fw, Math.floor(i / cols) * fh, fw, fh]);
  /** @type {Record<string, SpriteAnim>} */ const anims = s.animations || {};
  return {
    image, frameWidth: fw, frameHeight: fh, frameCount: rects.length, animations: Object.keys(anims),
    /** @param {string} anim */
    anim(anim) {
      const a = anims[anim];
      if (!a) throw new Error(`assets: sprite "${name}" has no animation "${anim}". It has: ${Object.keys(anims).join(", ") || "none"}`);
      return a;
    },
    /** which frame an animation shows at a time (seconds) */
    frameAt(/** @type {string} */ anim, /** @type {number} */ time) {
      const a = this.anim(anim), n = a.frames.length, i = Math.floor(time * a.fps);
      return a.frames[a.loop === false ? Math.min(n - 1, i) : ((i % n) + n) % n];
    },
    /**
     * Draw an animation frame, centred on x, y (anchor 0.5, 0.5 by default)
     * @param {CanvasRenderingContext2D} ctx @param {string} anim @param {number} time @param {number} x @param {number} y
     * @param {{ scale?: number, flipX?: boolean, anchorX?: number, anchorY?: number, alpha?: number }} [o]
     */
    draw(ctx, anim, time, x, y, o = {}) {
      const r = rects[this.frameAt(anim, time)], sc = o.scale ?? 1, w = r[2] * sc, h = r[3] * sc;
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.translate(x, y);
      if (o.flipX) ctx.scale(-1, 1);
      ctx.drawImage(image, r[0], r[1], r[2], r[3], -w * (o.anchorX ?? 0.5), -h * (o.anchorY ?? 0.5), w, h);
      ctx.restore();
    },
  };
}

/* parallax: layers back to front, each moving at its own speed (0 = still, 1 = with the camera) and repeating sideways;
   a layer marked mirror repeats with every other copy flipped, so its copies always meet without a join */
function makeParallax(/** @type {{ image: HTMLImageElement, speed: number, y?: number, mirror?: boolean }[]} */ layers) {
  return {
    layers,
    /** @param {CanvasRenderingContext2D} ctx @param {number} scrollX @param {number} width @param {number} height */
    draw(ctx, scrollX, width, height) {
      for (const l of layers) {
        const s = height / l.image.naturalHeight, w = l.image.naturalWidth * s;
        const off = scrollX * l.speed;
        let k = Math.floor(off / w), x = k * w - off;
        for (; x < width; x += w, k++) {
          if (!l.mirror || k % 2 === 0) { ctx.drawImage(l.image, Math.floor(x), l.y ?? 0, Math.ceil(w) + 1, height); continue; }
          ctx.save(); ctx.translate(Math.floor(x) + Math.ceil(w) + 1, l.y ?? 0); ctx.scale(-1, 1); ctx.drawImage(l.image, 0, 0, Math.ceil(w) + 1, height); ctx.restore();
        }
      }
    },
  };
}

async function loadOne(/** @type {string} */ name) {
  const e = entry(name);
  switch (e.type) {
    case "image": return img(/** @type {string} */ (e.file));
    case "sprite": return makeSprite(/** @type {HTMLImageElement} */ (await img(/** @type {string} */ (e.file))), e.settings || {}, name);
    case "parallax": {
      const layers = (e.settings && e.settings.layers) || [];
      return makeParallax(await Promise.all(layers.map(async (/** @type {any} */ l) => ({ image: /** @type {HTMLImageElement} */ (await img(l.file)), speed: l.speed ?? 0.5, y: l.y, mirror: !!l.mirror }))));
    }
    case "audio": {
      const H = /** @type {any} */ (globalThis).Howl;
      if (!H) throw new Error("assets: sounds need the audio pack (Howler)");
      return new Promise((res, rej) => {
        const h = new H({ src: [new URL(/** @type {string} */ (e.file), base).href], preload: true, onload: () => res(h), onloaderror: (/** @type {any} */ _id, /** @type {any} */ err) => rej(new Error(`assets: couldn't load ${e.file} (${err})`)) });
      });
    }
    case "data": {
      const r = await fetch(new URL(/** @type {string} */ (e.file), base));
      if (!r.ok) throw new Error(`assets: couldn't load ${e.file}`);
      return /\.json$/i.test(/** @type {string} */ (e.file)) ? r.json() : r.text();
    }
    default: return new URL(/** @type {string} */ (e.file), base).href;   // models (assets-3d.js), fonts, videos: their address
  }
}

export const ASSETS = {
  /**
   * Load assets before using them. No names = everything except 3D models (those load through MODELS in assets-3d.js).
   * @param {string[] | null} [names] @param {(done: number, total: number) => void} [onProgress]
   */
  async load(names, onProgress) {
    const m = await readManifest();
    const list = names || Object.keys(m).filter((n) => m[n].type !== "model");
    let done = 0;
    await Promise.all(list.map(async (n) => {
      if (!loaded.has(n)) loaded.set(n, await loadOne(n));
      onProgress && onProgress(++done, list.length);
    }));
  },
  /** @param {string} name */ has: (name) => !!(manifest && manifest[name]),
  /** @param {string} [type] */ names: (type) => (manifest ? Object.keys(manifest).filter((n) => !type || /** @type {Record<string, Entry>} */ (manifest)[n].type === type) : []),
  /** @param {string} name @returns {HTMLImageElement} */ image: (name) => got(name, "image"),
  /** @param {string} name @returns {ReturnType<typeof makeSprite>} */ sprite: (name) => got(name, "sprite"),
  /** @param {string} name @returns {ReturnType<typeof makeParallax>} */ parallax: (name) => got(name, "parallax"),
  /** @param {string} name @returns {any} a Howl */ sound: (name) => got(name, "audio"),
  /** @param {string} name */ json: (name) => got(name, "data"),
  /** @param {string} name @returns {string} */ text: (name) => got(name, "data"),
  /** @param {string} name */ url: (name) => new URL(/** @type {string} */ (entry(name).file), base).href,
  /** @param {string} name */ info: (name) => ({ ...entry(name) }),
  /** @internal the manifest, for assets-3d.js */ _manifest: readManifest,
};
