/* Pixelfork bridge (platform file: the AI reads it, never changes it).
   Connects a running game to the Pixelfork dashboard it's shown in, through window.postMessage:
     game → dashboard: ready, console lines and errors, game state (for the play tests), frames per second, the Mechanics schema, screenshots
     dashboard → game: set / reset a Mechanics value, pause, resume, restart, take a screenshot, show physics shapes, mute
   Loaded first, as a plain script, so it catches every error from the very start. When the game runs on its own
   (a published link, an exported app) there's no dashboard and the bridge only keeps quiet records. */
(function () {
  "use strict";
  var host = window.parent && window.parent !== window ? window.parent : null;
  var listeners = {};
  /** @type {Record<string, any>} */ var switches = {};
  var send = function (type, data) {
    if (type === "shot") shooting = false;                                          // a screenshot taken while paused is done
    if (!host) return;
    try { host.postMessage({ pf: 1, type: type, data: data === undefined ? null : data }, "*"); } catch (e) { /* the dashboard is gone */ }
  };

  /* ---------- console and errors: every line goes to the dashboard's console, with the file and line when known ---------- */
  var MAX = 2000;
  var show = function (v, depth) {
    if (v instanceof Error) return (v.name || "Error") + ": " + v.message;
    if (typeof v === "string") return v.length > MAX ? v.slice(0, MAX) + "…" : v;
    if (typeof v === "number" || typeof v === "boolean" || v == null) return String(v);
    if (typeof v === "function") return "function " + (v.name || "");
    if ((depth || 0) > 2) return Array.isArray(v) ? "[…]" : "{…}";
    try {
      var seen = [];
      var s = JSON.stringify(v, function (k, x) {
        if (x && typeof x === "object") { if (seen.indexOf(x) >= 0) return "[circular]"; seen.push(x); }
        return x;
      });
      return s && s.length > MAX ? s.slice(0, MAX) + "…" : String(s);
    } catch (e) { return Object.prototype.toString.call(v); }
  };
  /* a library's own startup banner (the VFX particle engine prints one on every load) isn't news for the dashboard */
  var BANNERS = [/^(%c)?\s*Particle system powered by three\.quarks/];
  var banner = function (args) { return typeof args[0] === "string" && BANNERS.some(function (re) { return re.test(args[0]); }); };
  /* console styling ("%c" plus one CSS argument each) is for the browser's own console only */
  var line = function (args) {
    if (typeof args[0] === "string" && args[0].indexOf("%c") >= 0) args = [args[0].replace(/%c/g, "")].concat(args.slice(args[0].split("%c").length));
    return args.map(function (a) { return show(a); }).join(" ");
  };
  ["log", "info", "warn", "error", "debug"].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      original.apply(null, args);
      if (banner(args)) return;
      var err = args.find ? args.find(function (a) { return a instanceof Error; }) : null;
      send("console", { level: level, text: line(args), stack: err && err.stack ? String(err.stack).slice(0, 4000) : null, t: Date.now() });
    };
  });
  /* Safari hides the details of an error from a game shown in the dashboard's locked-down frame: it arrives as
     "Script error." with no file or line (Farid 2026-09-24, the Console). So inside the dashboard the game's frames,
     timers and events run inside a try/catch that reports the real error, with its file and line, and then lets it go
     on exactly as before; the browser's own report of that same error (emptied by Safari) is skipped. */
  var lastCaught = 0;
  /** @param {any} stack */
  var placeOf = function (stack) {
    var m = stack ? /((?:https?:\/\/|\/)[^\s()@]+):(\d+):(\d+)/.exec(String(stack)) : null;
    return m ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : { file: null, line: null, col: null };
  };
  /** @param {any} err */
  var caught = function (err) {
    if (!err || typeof err !== "object" || err.__pfSent) return;
    try { Object.defineProperty(err, "__pfSent", { value: true }); } catch (x) { /* a frozen error is reported again, at most once more */ }
    lastCaught = Date.now();
    var at = placeOf(err.stack);
    send("error", { text: (err.name || "Error") + ": " + (err.message || String(err)), file: at.file, line: at.line, col: at.col, stack: err.stack ? String(err.stack).slice(0, 4000) : null, t: lastCaught });
  };
  if (host) {
    /** @param {any} fn @returns {any} */
    var wrap = function (fn) {
      if (typeof fn !== "function") return fn;
      if (fn.__pfw) return fn.__pfw;
      /** @this {any} */
      var w = function () { try { return fn.apply(this, arguments); } catch (err) { caught(err); throw err; } };
      try { Object.defineProperty(fn, "__pfw", { value: w }); } catch (x) { return fn; }
      return w;
    };
    ["setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask"].forEach(function (name) {
      /** @type {any} */ var w = window, original = w[name];
      if (typeof original === "function") w[name] = function () { var a = Array.prototype.slice.call(arguments); a[0] = wrap(a[0]); return original.apply(window, a); };
    });
    var add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    /** @this {EventTarget} @param {string} type @param {any} fn @param {any} [options] */
    EventTarget.prototype.addEventListener = function (type, fn, options) { return add.call(this, type, wrap(fn), options); };
    /** @this {EventTarget} @param {string} type @param {any} fn @param {any} [options] */
    EventTarget.prototype.removeEventListener = function (type, fn, options) { return remove.call(this, type, (fn && fn.__pfw) || fn, options); };
  }

  /* ---------- the dashboard's Pause stops everything (Farid, 2026-09-26): the game's frames are held (its drawing, its
     loop, the effects), its sound is suspended, taps and keys don't reach it and its animations stop; Play goes on from
     the same moment. Only inside the dashboard (a published game has no dashboard Pause). ---------- */
  var frozen = false, shooting = false;
  /** @type {Array<[number, FrameRequestCallback]>} */ var held = [];
  /** @type {Record<number, number>} */ var moved = {};
  var nextHeld = -1, contexts = new Set(), media = new Set(), stilled = new Set(), stopped = new Set();
  var raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame, play = HTMLMediaElement.prototype.play;
  if (host) {
    /* a frame asked for while paused waits (a negative id, so it can still be cancelled) */
    /** @param {FrameRequestCallback} cb */
    window.requestAnimationFrame = function (cb) { if (!frozen || shooting) return raf.call(window, cb); var id = nextHeld--; held.push([id, cb]); return id; };
    /** @param {number} id */
    window.cancelAnimationFrame = function (id) { if (id < 0) { if (moved[id]) caf.call(window, moved[id]); held = held.filter(function (h) { return h[0] !== id; }); return; } return caf.call(window, id); };
    /* every sound engine (the SFX library, Howler, the car's engine) plays through an AudioContext or an audio element */
    ["AudioContext", "webkitAudioContext"].forEach(function (name) {
      /** @type {any} */ var w = window, C = w[name];
      if (typeof C !== "function") return;
      var P = function () { var c = Reflect.construct(C, arguments); contexts.add(c); return c; };
      P.prototype = C.prototype;
      w[name] = P;
    });
    /** @this {HTMLMediaElement} */
    HTMLMediaElement.prototype.play = function () { media.add(this); return frozen ? Promise.resolve() : play.call(this); };
    /* taps and keys wait too (letting go of a key or a finger still arrives, so nothing stays held down) */
    ["keydown", "keypress", "pointerdown", "pointermove", "mousedown", "mousemove", "click", "dblclick", "touchstart", "touchmove", "wheel", "contextmenu"].forEach(function (type) {
      window.addEventListener(type, function (e) { if (!frozen) return; e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }, { capture: true, passive: false });
    });
    var still = document.createElement("style");
    still.textContent = "html.pf-frozen *,html.pf-frozen *::before,html.pf-frozen *::after{animation-play-state:paused!important}";
    (document.head || document.documentElement).appendChild(still);
  }
  /** @param {boolean} on */
  var freeze = function (on) {
    if (!host || on === frozen) return;
    frozen = on;
    document.documentElement.classList.toggle("pf-frozen", on);
    if (on) {
      contexts.forEach(function (c) { if (c.state === "running") { stilled.add(c); c.suspend().catch(function () {}); } });
      media.forEach(function (m) { if (!m.paused) { stopped.add(m); m.pause(); } });
      return;
    }
    stilled.forEach(function (c) { c.resume().catch(function () {}); }); stilled.clear();
    stopped.forEach(function (m) { play.call(m).catch(function () {}); }); stopped.clear();
    var waiting = held; held = []; moved = {};
    waiting.forEach(function (h) { moved[h[0]] = raf.call(window, h[1]); });
  };
  /* a paused game that gets a new size (the Mechanics panel opening, another tab and back) has its canvas cleared by its
     own resize, and nothing would draw it again: it draws one frame, still paused (its loop is paused too, so nothing
     moves; Farid, 2026-09-27: the game went black with only its buttons showing) */
  var redraw = 0;
  if (host) window.addEventListener("resize", function () {
    if (!frozen || redraw) return;
    redraw = raf.call(window, function (t) {
      redraw = 0;
      if (!frozen) return;
      var waiting = held; held = [];
      waiting.forEach(function (h) { try { h[1](t); } catch (err) { console.error(err); } });
    });
  });
  window.addEventListener("error", function (e) {
    /** @type {any} */ var el = e.target;
    if (e.error && e.error.__pfSent) return;                                                         // reported with its details already
    if (!e.error && /^(Uncaught )?Script error\.?$/.test(e.message || "") && Date.now() - lastCaught < 2000) return;   // Safari's emptied copy of it
    if (e.error || e.message) send("error", { text: e.message || String(e.error), file: e.filename || null, line: e.lineno || null, col: e.colno || null, stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 4000) : null, t: Date.now() });
    /* a file that failed to load (script, image, sound): the dashboard reports the missing file */
    else if (el && el !== window && (el.src || el.href)) send("error", { text: "Couldn't load " + (el.src || el.href), file: el.src || el.href, line: null, col: null, stack: null, t: Date.now() });
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    send("error", { text: "Unhandled promise rejection: " + show(r), file: null, line: null, col: null, stack: r && r.stack ? String(r.stack).slice(0, 4000) : null, t: Date.now() });
  });

  /* ---------- the game's own events, for the dashboard and the automatic play tests ---------- */
  var PF = {
    /** true when the game runs inside the Pixelfork dashboard or a play test */
    inDashboard: !!host,
    /** Report what's happening: PF.report("started"), PF.report("score", { score: 12 }), PF.report("gameover", { score: 40 }).
        The play test uses these to know that a tap or a swipe really did something. */
    report: function (name, data) {
      send("state", { name: String(name), data: data === undefined ? null : data, t: Date.now() });
      /* a run that ends takes the UI kit's tutorial hand with it, whatever the game forgot (Farid, 2026-09-26: it stayed
         over "New best" and into the next run in 11 of 19 games that showed it) */
      if (name === "gameover") { var sc = /** @type {any} */ (window).SC; try { if (sc && sc.tutorial && sc.tutorial.active) sc.tutorial.clear(); } catch (err) { console.error(err); } }
    },
    /** listen to the dashboard: PF.on("pause", fn) · "resume" · "restart" · "config-set" · "config-reset" · "debug-physics" · "mute".
        The dashboard's switches (pause, mute, physics shapes) are remembered: a listener added later hears the latest one at once. */
    on: function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      if (Object.prototype.hasOwnProperty.call(switches, type)) { try { fn(switches[type]); } catch (err) { console.error(err); } }
      return function () { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; }); };
    },
    /** used by the other platform files; games don't need it */
    send: send,
  };
  /** @type {any} */ (window).PF = PF;

  window.addEventListener("message", function (e) {
    if (!host || e.source !== host) return;                                         // only the dashboard that shows this game
    var m = e.data;
    if (!m || m.pf !== 1 || typeof m.type !== "string") return;
    if (m.type === "shot") { shooting = true; shot(m.data && m.data.id); return; }
    if (m.type === "restart") { location.reload(); return; }
    remember(m.type, m.data);
    if (m.type === "pause") freeze(true);
    else if (m.type === "resume") freeze(false);
    (listeners[m.type] || []).forEach(function (fn) { try { fn(m.data); } catch (err) { console.error(err); } });
  });

  /* the dashboard's switches, kept for listeners added later (the game's code loads after this file, and after a restart
     the dashboard sends them again straight away) */
  function remember(type, data) {
    if (type === "pause") switches.pause = null;
    else if (type === "resume") delete switches.pause;
    else if ((type === "mute" || type === "debug-physics") && data && typeof data.on === "boolean") switches[type] = { on: data.on };
  }

  /* ---------- screenshots: the whole screen as the player sees it (the game's canvas and the menus, buttons and pictures
     over it), for the chat's "Screenshot of the game", thumbnails and version pictures. The page is drawn into a picture
     by modern-screenshot (MIT, a pinned pack loaded only when a screenshot is asked for); if that can't be done (no
     connection, a browser that refuses), the canvas alone, as before ---------- */
  var SHOT_LIB = "/packs/tools/modern-screenshot@4.7.0/files/modern-screenshot.js", shotLib = null;
  function loadShotLib() {
    shotLib = shotLib || new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = SHOT_LIB; s.onload = function () { ok(/** @type {any} */ (window).modernScreenshot); }; s.onerror = no;
      document.head.appendChild(s);
    });
    return shotLib;
  }
  function shot(id) {
    /* a WebGL canvas is empty between frames: the 3D setup listens to "before-shot" and draws one frame right now */
    (listeners["before-shot"] || []).forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
    var c = document.querySelector("canvas");
    var frame = null;
    try { frame = c ? c.toDataURL("image/png") : null; } catch (e) { frame = null; }
    var W = window.innerWidth, H = window.innerHeight;
    var canvasOnly = function () {
      var url = null;
      try { url = c ? c.toDataURL("image/jpeg", 0.85) : null; } catch (e) { url = null; }
      send("shot", { id: id || null, url: url, w: c ? c.width : 0, h: c ? c.height : 0, whole: false });
    };
    /* the frame just drawn stands in for the canvas while the page is copied (a WebGL canvas would be empty again by then) */
    var still = null;
    if (c && frame) {
      var r = c.getBoundingClientRect();
      still = document.createElement("img");
      still.src = frame;
      still.style.cssText = "position:fixed;margin:0;padding:0;border:0;pointer-events:none;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px;z-index:" + (getComputedStyle(c).zIndex === "auto" ? 0 : getComputedStyle(c).zIndex);
      c.parentNode && c.parentNode.insertBefore(still, c.nextSibling);
      c.style.visibility = "hidden";
    }
    var undo = function () { if (still && c) { still.remove(); c.style.visibility = ""; } };
    loadShotLib()
      .then(function (lib) {
        /* at the screen's own size (a Retina copy was three times the file and no clearer to the AI); Safari redraws once
           per picture on the page to let them decode, 100 ms apart by default: 20 ms keeps a menu with many pictures near 2 seconds */
        return lib.createContext(document.documentElement, { type: "image/jpeg", width: W, height: H, scale: 1, quality: 0.85, backgroundColor: getComputedStyle(document.body).backgroundColor || "#000", timeout: 5000, drawImageInterval: 20 })
          .then(function (/** @type {any} */ ctx) {
            /* the library reads default styles from a frame of its own, which a sandboxed game can't open: without one it
               copies every style instead (a little slower, the same picture) */
            ctx.sandbox = { contentWindow: null };
            return lib.domToJpeg(ctx).then(function (/** @type {string} */ url) { try { lib.destroyContext(ctx); } catch (e) { /* nothing to free */ } return url; });
          });
      })
      .then(function (url) { undo(); send("shot", { id: id || null, url: url, w: W, h: H, whole: true }); })
      .catch(function () { undo(); canvasOnly(); });
  }

  send("hello", { skeleton: "1", url: location.pathname });
})();
