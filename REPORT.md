# URBAN OUTLAW V3 — Setup & Technical Audit

**Date:** 2026-11-10
**Repository:** `PRANJAL7778/URBAN-OUTLAW`
**Branch:** `arena/89a95d54-urban-outlaw` (branched from `main` @ `88d827c`)
**Scope:** Phases 1–6 of the V3 initial setup + technical audit. **No game logic was redesigned, rewritten or removed.**

---

## 0. TL;DR

| Question | Answer |
|---|---|
| Could I reach the repo files? | Yes — `urban_outlaw_v3_project.zip` (5.13 MB) was at the repository root and I have a terminal. |
| Is the archive valid? | Yes — `unzip -t` reports no errors, 128 entries (94 files), 11.33 MB uncompressed. |
| Was it extracted? | Yes, into the repository root. All 94 files verified byte-identical (size + CRC32). |
| Is the original ZIP preserved? | Yes — `backup/urban_outlaw_v3_project.zip`, unchanged (same SHA-256). |
| Does the code parse and resolve? | Yes — 43 JS files parse, 53 imports resolve, 0 missing exports, 0 lint errors, all JSON valid, all asset paths correct. |
| Was it run in a real browser? | **No.** No browser binary exists in this sandbox and the browser-download CDN is unreachable. Rendering/touch/audio remain unverified — see §4.6. |
| Can it run without paid APIs? | Yes. No API keys, no keys, no external services. Only a Google-Fonts `@import` (cosmetic, falls back). |
| Was an APK built or a phone tested? | **No.** Nothing here is a claim of Android testing. |

---

## 1. Phase 1 — Extraction and setup

### 1.1 Archive verification

| Property | Value |
|---|---|
| Path (original) | `/urban_outlaw_v3_project.zip` (repo root) |
| Size | 5,384,109 bytes (5.13 MiB) |
| SHA-256 | `ef0d3896659e0c239c8306106c692a4f3bed8efc54b0ca787e3bc6542fba2b0f` |
| `unzip -t` | `No errors detected in compressed data` |
| `zipfile.testzip()` | `None` (no corrupt entries) |
| Entries | 128 (94 files + 34 directory entries) |
| Uncompressed | 11.33 MiB |
| Inner project directory | `urban_outlaw_v3_project/` (single root — no nesting surprises) |

### 1.2 What was done

1. `git mv urban_outlaw_v3_project.zip backup/urban_outlaw_v3_project.zip` — original preserved, still in git history, **not deleted**.
2. Extracted **once** into a temporary staging directory (`/tmp/uostage`), never twice.
3. Identified the inner project directory `urban_outlaw_v3_project/`.
4. **Moved** (not copied) its contents to the repository root, so `index.html` now sits at the top level. The staging directory was left empty — there is no duplicate copy of `assets/` or `packs/` anywhere in the repo.
5. Verified the result against the archive entry-by-entry.

### 1.3 Extraction fidelity check

```
files in archive: 94 · byte-identical on disk (size + CRC32): 94
missing after extraction: none
content mismatches:      none
added files (not in the archive): README.md (pre-existing), serve.js (new dev server)
```

Every GLB, texture, pack, tool and runtime file is bit-for-bit what was in the ZIP. Nothing was re-exported, re-encoded or replaced.

### 1.4 Final project structure

```
URBAN-OUTLAW/
├── index.html                     ← entry point (import map + Pixelfork packs + src/main.js)
├── game.json                      ← Pixelfork pack declarations (three 0.186, crashcat 0.0.5, …)
├── README.md                      ← your original 2-line README (untouched)
├── serve.js                       ← ADDED BY THIS AUDIT: dependency-free static dev server
├── CHANGELOG_V3.txt               ← from the archive
├── CLAUDE_HANDOFF_PROMPT.txt      ← from the archive
├── RECOVERY_README.txt            ← from the archive
├── backup/
│   └── urban_outlaw_v3_project.zip   ← the original archive, untouched
├── assets/
│   ├── manifest.json              ← 9 registered models
│   ├── aiprintgen_light_blue_lamborghini_inspired_supercar_prev.glb       1.23 MB · 175,320 tris · meshopt+WebP+quantised
│   ├── aiprintgen_light_blue_lamborghini_inspired_supercar_prev_lite.glb  557 KB ·  24,000 tris · vertex colours (default)
│   ├── bobber_lite.glb                                                     683 KB ·  27,998 tris · body/rearWheel/fork/frontWheel
│   ├── char_scan_lite.glb                                                  917 KB ·  26,000 tris · 16-bone rig (default hero)
│   ├── characterrigged.glb                                                 993 KB ·   9,344 tris · 15-bone generic rig (V2 hero)
│   └── low_poly_city_{office,apartment}_building_low[_2].glb               20–22 KB each · 3–4 materials, 64×64 PNG textures
├── src/                           ← the game itself (2,470 lines total)
│   ├── main.js        48 KB / 548 lines — world bootstrap, hero, vehicles, missions, HUD, camera, loop
│   ├── city.js        16 KB / 247 lines — roads, blocks, buildings, trees, colliders, mission points
│   ├── config.js       9 KB / 129 lines — every tunable value (Mechanics schema)
│   ├── character.js    8 KB / 120 lines — rig remapping, clothing bake, scan-character prep
│   ├── wheel.js       16 KB / 134 lines — quick wheel + in-game phone (Map/Phone/Vehicles/Missions)
│   ├── vehicles.js     8 KB /  93 lines — procedural parked traffic (sedan/taxi/hatch/SUV/pickup/van)
│   └── car.js          5 KB /  88 lines — arcade vehicle controller (shared by car + bobber)
├── pixelfork/                     ← platform runtime adapters (bridge, config, loop, input, save, screen,
│                                     assets, assets-3d, audio, haptics, physics-3d, index)
├── packs/                         ← pinned dependencies (11 file groups)
│   ├── render-3d/three@0.186.0/       three.module.js + three.core.js + addons (GLTFLoader, SkeletonUtils,
│   │                                  BufferGeometryUtils, meshopt decoder)
│   ├── physics-3d/crashcat@0.0.5/     crashcat.js (1.35 MB, pure JS — no WASM) + crashcat-three.js
│   ├── character/pixelfork-ragdoll@0.9.7-A/  ragdoll.module.js (procedural humanoid animation + physics)
│   ├── vfx/pixelfork-vfx@0.8.1-A/     vfx.module.js (302 KB, three.quarks) + vfx.js (1 MB, unused copy)
│   ├── sfx/pixelfork-sfx@0.9.0-A/     sfx.js + casual.json (260 KB, 659 sounds) + packs/core.webm (890 KB)
│   ├── audio/howler@2.2.4/            howler.min.js
│   └── ui/clean-flat@0.3.0-A/         kit.css / kit.js / 28 icon PNGs
└── tools/                         ← the authoring pipeline used to make the "lite" assets
    ├── extract_model.js, qem.js, bake.js, glbwrite.js, bundle.js   (decimate → bake → write GLB)
    ├── char_rig_build.js, char_rig.json, char_lite.js              (auto-rig the scan)
    └── bike_groups.js, bike_lite.js                                (split bobber into wheels/fork)
```

Repo size: ~12 MB extracted + 5.2 MB archive. No file exceeds 1.5 MB.

---

## 2. Phase 2 — How the game actually works

### 2.1 Runtime model

It is a **browser game running on the "Pixelfork" game platform**, not a bespoke engine:

* `index.html` defines an **import map** that maps bare specifiers (`three`, `crashcat`, `crashcat/three`, `vfx`, `ragdoll`, `three/addons/`) to files inside `packs/`. There is **no bundler and no build step** — the browser loads the ES modules directly.
* Three **classic (non-module) scripts** are loaded first and provide globals the game uses: `pixelfork/bridge.js` → `window.PF` (dashboard bridge), `packs/…/kit.js` → `window.SC` (UI kit), `packs/…/sfx.js` → `window.SFX` (sound library).
* `pixelfork/` is the platform adapter layer (the "Pixelfork skeleton"): fixed-step loop, input, save, screen sizing, asset registry, audio, haptics, physics wrapper.
* Because it uses `fetch()` and ES modules, **it must be served over HTTP** — opening `index.html` from disk does not work (the archive's own `RECOVERY_README.txt` says the same).

### 2.2 Boot sequence (traced through `src/main.js`)

1. Renderer + scene + camera: `WebGLRenderer({antialias:true})`, `PCFShadowMap`, hemisphere + one shadow-casting directional sun (1024², ortho 76×76, follows the player in 6 m steps).
2. Physics: `RAGDOLL.createPhysics({gravity})` → a crashcat world (`world`, `layers`, `step`, `sync`).
3. `createCity(scene, physics, importedBuildings)` → ground, 3×3 road grid, 4 blocks, procedural/floating buildings, trees, lamps, 9 parked cars, colliders, token spots, mission points.
4. `makeHero(...)` → `RAGDOLL.create({scene, physics, position, model})`. The hero is **procedural-animated**: the ragdoll runtime drives idle/run/sprint/jump/fall/land itself, so the GLBs need no animation clips (and indeed none of them contain any).
5. Two vehicles are registry records `V.car` / `V.bike`, each with **its own `createCar()` controller**, a mesh group, a parked physics body and a marker. `car.js` is generic — the Lamborghini and the bobber differ only by `CONFIG.car.*` / `CONFIG.bike.*` values.
6. Missions, quick wheel, HUD, settings, save; then `startLoop({update, render})` — fixed 1/60 s logic steps, one render per frame with interpolation `alpha`.

### 2.3 Systems and where they live

| System | Implementation | Notes |
|---|---|---|
| Player movement | `RAGDOLL.create` character; `hero.move(x,z)`, `hero.sprint(bool)`, `hero.jump()`; `physics.step/sync` | Walking, sprint and jump all verified headlessly (§4.5) |
| Fall recovery | `hero.position[1] < CONFIG.player.recoveryDepth` → dispose + respawn at spawn | Present |
| Vehicle controller | `src/car.js`: bicycle steering, forward/lateral velocity split, tyre grip, handbrake drift, off-road factor, 3-circle vs AABB collision, ±54 m world clamp | No per-step allocation; substeps at ≤1/50 s |
| Lamborghini | GLB `…_lite` by default (`CONFIG.car.model` can select `full`), scaled to `length/size.x`, rotated ±90°, config-driven tilt/roll | Box-car fallback if the GLB fails |
| Bobber | `bobber_lite.glb` with separate `rearWheel` / `frontWheel` / `fork` nodes; wheels roll from simulated distance; fork steers around a fixed axis; leans into turns | Box-bike fallback |
| Rider | Fresh copy of the scan model, posed per `CONFIG.bike.rider*` and parented to the bike's tilt group | Only when the scan character loaded |
| Camera | Third person: walk (7 m, smoothing 9) vs drive (chase, distance grows with speed, swipe offset eases back); raycast against `city.obstacles` pulls the camera in | Unverified visually |
| City & collision | Axis-aligned footprint list `city.colliders` for vehicles; crashcat static boxes for the walking hero; `isRoad()` for the off-road factor | 54 footprints, 31 raycast obstacles |
| Imported buildings | `partsOf()` splits the model into wall/ground/roof by node name, then **stacks N floors** to hit a target height (`office 32 m`, `apartments 14 m`), merges per material → few draw calls; falls back to "single model", then to a procedural box | **Verified: all 5 placements use the `stack` path** (§4.5) |
| Delivery mission | Enter any vehicle → a checkpoint 40 m+ away, `CONFIG.mission.time` = 45 s, +500 pts, auto-repeats | Code-verified, runtime unverified |
| Courier mission | 3 stages: pick up on foot (+100) → deliver by vehicle within 50 s (+300) → final run within 28 s (+400); stats saved | Code-verified, runtime unverified |
| Quick wheel | `src/wheel.js`: SVG radial menu (Map / Phone / Vehicles / Missions), pauses the game; opens from a HUD button or `Q` | DOM/SVG only |
| Phone | Map tile canvas, phone shell with Dispatch / Garage / Stats apps, vehicle "call to me" / "switch" | DOM only |
| Garage / vehicle info | Vehicles tab + Garage app: name, in-use state, distance, one-line blurb | DOM only |
| Touch controls | Left SVG joystick (`#uo-stick`) for movement, drag anywhere else to look, Jump / Drive / BRAKE buttons, pause, quick wheel | Unverified on device |
| Keyboard | WASD/arrows, Space (jump / handbrake), E (enter/exit), Q (wheel) | Present |
| Saving | `localStorage` under `pf:<game-id>:*`: `best`, `lookLevel`, `tutorialDone`, `courier{done,best}`, `_muted`, `_haptics`, `_music`, `_sounds` | Persists score/settings/stats — **not** world position or vehicle state |
| Menu / settings | Play / Settings / Credits; Settings = sound, vibration, look sensitivity; Credits shows asset load status + live diagnostics | Present |
| Performance guard | EMA frame-time; after 4 s below ~24 fps: pixel-ratio → 1.0, then → 0.85 and shadows off | 2 levels only |

---

## 3. Phase 3 — Feature status

Legend: **✔ verified** = I ran code/logic checks on it; **◐ code-verified** = read and cross-checked, logic looks sound, but it needs a screen to confirm; **○ unverified** = needs a device/browser.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Player character (scan) | ✔ headless | `char_scan_lite.glb` accepted by the ragdoll (`rest pose arms down, facing +z`); walks 8.4 m in 2 s |
| 1b | Fallback character (boxy hero) | ✔ headless | `RAGDOLL.create` without a model works; `makeHero` catches failures and re-creates |
| 1c | Supplied `characterrigged.glb` | ✔ headless | 15 bones load as `Bone`, `Bone002`… (three strips the dots); `prepareCharacter` accepts it, `rest pose T-pose`; clothing bake reports `clothing painted + cap` |
| 2 | Character animations | ◐ | **No GLB contains animation clips** — animation is procedural inside the ragdoll pack (idle/run/sprint/jump/fall/land/hit/death). `land` event fires (verified) |
| 3 | Lamborghini + driving | ✔ headless | Controller: 11/11 tests (accel, top speed, braking, steering, handbrake drift, off-road, collision, bounds, 30 vs 60 fps parity, no NaN). Model scales to 4.50 m × 1.14 m × 2.08 m in both `lite` and `full` |
| 4 | Bobber + separate parts | ✔ headless | `rearWheel`, `frontWheel`, `fork` all found in the GLB (this is what makes wheels spin and the fork steer) |
| 5 | Motorcycle steering / rider pose | ◐ | Fork axis + 10 `CONFIG.bike.rider*` pose values are wired; every bone the rider pose touches exists. **The pose itself is a visual judgement — not verified** |
| 6 | Third-person camera | ○ | Logic present (follow, chase, swipe offset, raycast pull-in). Cannot be verified without a renderer |
| 7 | City + collision | ✔ headless | 26/26 world tests: 54 footprints, spawns on road and clear, hero blocked by walls, ramps onto ground correctly, city rebuilds in 2 ms |
| 8 | Driving mission | ◐ | State machine complete; checkpoints all placed on reachable road; `mode==='drive'` gate correct |
| 9 | Courier mission | ◐ | 3 stages wired; pickup point is clear; both route finishes are on road |
| 10 | Quick wheel | ◐ | Complete SVG menu + pause/resume wiring; all 26 DOM ids it uses exist |
| 11 | In-game phone (Dispatch/Garage/Stats) | ◐ | Rendered into the wheel panel; all app buttons are wired |
| 12 | Garage / vehicle info | ◐ | Vehicles tab + Garage app; "call to me" searches 8 directions × 5 distances for a legal parking spot |
| 13 | Mobile touch controls | ○ | Joystick, swipe-look, jump/drive/brake exist in the DOM. **Not tested on a touchscreen** |
| 14 | Saving / loading | ◐ | 8 localStorage keys, read at boot, written on change. Not tested in a browser |
| 15 | Main menu + settings | ◐ | Menu, credits, settings popup (sound/vibration/sensitivity) wired to platform APIs |

---

## 4. Phase 4 — Technical testing

### 4.1 Static analysis (all passed)

| Check | Method | Result |
|---|---|---|
| JavaScript syntax | `node --check` on all **43** `.js` files | 0 errors |
| Undefined identifiers, duplicate keys, unreachable code, `const` reassignment | ESLint 9 (`no-undef` + 10 correctness rules) on the 19 game/platform files + `serve.js` | **0 errors, 0 warnings** |
| Import graph | Script resolving every `import … from` against the import map and the filesystem, then checking named exports exist | **53 imports, 0 problems** |
| JSON validity | `json.load` on `game.json`, `assets/manifest.json`, `tools/char_rig.json`, `packs/sfx/…/casual.json` | All valid |
| Asset references | 9 manifest entries → files on disk; every model name used in `src/` exists in the manifest; `ASSETS._manifest` / `ASSETS.url` used by `assets-3d.js` exist | All present |
| DOM contract | Every `$('id')` / `getElementById` used by `main.js` + `wheel.js` (26 ids) exists in the generated markup | 0 missing |
| UI kit contract | 4 `data-icon` names, 5 `data-color` values, `data-sfx`, `data-vfx` | All exist in the kit / SFX pack / VFX registry |
| Sound & effect names | `move.jump`, `move.land`, `pickup.coin`, `impact.punch` vs `casual.json` (659 sounds); `move.land`, `pickup.coin`, `ui.pop` vs the VFX registry | All present |
| External dependencies | Grep for `http(s)://` in game code and API-key patterns | **None in game code.** One Google Fonts `@import` inside the UI kit's `kit.css` (cosmetic, falls back to system fonts) |

### 4.2 HTTP serving test

Served the project with `node serve.js` and fetched every URL the game asks for at runtime:

```
URLs fetched: 47 · failures: 0 · bytes: 8.59 MB
text/javascript for .js, model/gltf-binary for .glb, application/json for .json, audio/webm for .webm
```

So every relative path, MIME type and pack reference is correct as served.

### 4.3 Headless functional tests

Because `crashcat` is pure JavaScript (no WASM) and the GLBs load without a DOM, I could run the **real shipped modules** in Node against the **real GLBs**, using a throwaway harness (`src/car.js`, `src/city.js`, `src/character.js`, `ragdoll`, `three` r186, `GLTFLoader` + meshopt decoder — exactly the files in the repo; textures stripped *only in the harness copy* of the building GLBs so they parse without a browser image decoder).

| Suite | What it proves | Result |
|---|---|---|
| Vehicle controller (`src/car.js`) | acceleration → top speed on/off road, coasting, steering, handbrake slide, building collision + impact speed, world clamp, bike settings, 30 vs 60 fps parity, 2,000 randomised steps without NaN | **11 / 11** |
| World (`src/city.js` + physics) | physics world creation, city build (48 ms), mesh/triangle counts, footprints, spawn legality, mission/courier points, `isRoad`, hero walks + lands + jumps + is blocked by a wall, rebuild | **26 / 26** |
| Assets + models | building stacking path, character rigs, bobber parts, car scaling | **14 / 14** |
| Physics integration | gravity/landing, walk vs sprint distance, jump arc, wall blocking, 2 minutes of randomised driving in the real city with real colliders, 0 bad steps inside buildings, 16 impacts detected | **10 / 10** |
| Hero lifecycle | same cached character model survives 25 dispose/re-create cycles (mount/dismount), 12,974 vertices intact | **Pass** |

Measured world numbers (default assets in place):

```
city placement report:
  office    path=stack floors=3 scale=2.903 stretch=1.134 size=18 × 32.0 × 12.2 m
  apartment path=stack floors=3 scale=1.538 stretch=0.985 size= 8 × 14.0 ×  9.5 m   (×4)
visible meshes (≈ draw calls): 174 · triangles: 9,928   (procedural-only fallback: 251 meshes)
```

### 4.4 External-service check

* No paid API, no key, no account, no network call in the game code.
* Only external request: fonts (Google Fonts) from the UI kit CSS — blocked/offline just changes the typeface.
* All 3D models, sounds, UI icons and shaders are local files.

### 4.5 What is *not* verified — stated plainly

I could not render a single frame. Concretely:

* **No browser exists in this sandbox** (no Chromium/Firefox/WebKit binary) and the browser-binary CDNs are blocked (`cdn.playwright.dev` unreachable; only npm/github/pypi are allowed). A headless WebGL test was therefore impossible.
* Consequently **not tested**: actual rendering, shader compilation, materials/lighting look, model orientation on screen (e.g. whether the car's nose points forward), the rider pose, camera feel/collision, HUD layout, touch input, audio playback, localStorage in-browser, iOS Safari / Android Chrome quirks, and anything at all on a physical phone.
* No APK was built and no Android device was used. Any statement about "smooth on a 4 GB phone" would be a guess, not a result.

**How you can close this gap in one minute:** the dev server is running — open the live preview (or run `node serve.js` locally and open `http://localhost:8080`). The Credits screen has a built-in diagnostics panel (`FPS … pixel ratio … draw calls … triangles` and a per-building `path/floors/size` report) which exactly shows whether the buildings loaded and how the frame rate holds on your phone.

---

## 5. Phase 5 — Android / 4 GB performance review

### 5.1 First-load payload (measured, served over HTTP)

| Group | Size |
|---|---|
| three.js (`three.core.js` 1.46 MB + `three.module.js` 663 KB) + addons | ~2.2 MB |
| crashcat physics (1.35 MB + 117 KB) | 1.47 MB |
| VFX (302 KB) + ragdoll (148 KB) | 450 KB |
| SFX library: `casual.json` 260 KB + `core.webm` 890 KB + `sfx.js` 39 KB | 1.19 MB |
| UI kit (`kit.css` 129 KB + `kit.js` 104 KB + icons) + howler + bridge | ~270 KB |
| game code (`src/` + `pixelfork/`) | ~140 KB |
| buildings (2 × 22 KB) + manifest | 46 KB |
| hero `char_scan_lite` 917 KB + `bobber_lite` 683 KB + `car_lite` 557 KB | 2.11 MB |
| **Total first run** | **≈ 7.8 MB** |

### 5.2 Geometry & texture budget (measured from the GLB files)

| Asset | Triangles | Notes |
|---|---|---|
| City (imported buildings in use) | ~9.9 k | 174 draw calls, merged per material |
| Hero `char_scan_lite` | 26 k | 1 skinned mesh, 16 bones, vertex colours |
| Rider (a second copy) | +26 k | only while riding the bobber |
| Car `lite` (default) | 24 k | 1 mesh, vertex colours, **no textures** |
| Bobber `lite` | 28 k | 4 meshes |
| **Typical frame while driving** | **~60 k tris, ~180 draw calls** | very comfortable for a 4 GB phone |
| Car `full` (**optional**, `CONFIG.car.model='full'`) | 175 k | + one 1024×1024 WebP (70 KB file, ~4 MB decoded RGBA) |
| Building textures | 64×64 PNG | negligible |

Other rendering facts: one 1024² PCF shadow map, and shadows are **off** for buildings, vehicles and the rider (only the hero casts) — a good call. Pixel ratio capped at 1.5 (SCREEN caps at 2), `antialias:true`, auto-quality drops pixel ratio → 1.0 → 0.85 and disables shadows if the frame rate stays low.

### 5.3 Risks for a 4 GB Android phone

| Risk | Severity | Detail |
|---|---|---|
| **Not yet rendered on any device** | **High** | Every performance number above is static. Nothing is known about actual frame time, GPU tier or thermal throttling. |
| 7.8 MB blocking-ish load, no progress UI | Medium | Buildings load before Play is enabled (46 KB, fast), then car → bobber → character load **sequentially** with no spinner. On a slow connection the player can enter a world where the hero is still the boxy placeholder and the car isn't there yet. |
| `antialias:true` + DPR 1.5 on a 1080p+ panel | Medium | ~2.9 M pixels of MSAA; auto-quality only reacts after ~4 s of sustained slowness, and only has two levels. |
| `full` car option | Medium | 175 k tris + 1024² texture would be a real regression on a 4 GB device — keep `lite` as default (it is). |
| Shipped-but-unused bytes | Low | `…_prev.glb` (1.23 MB), `characterrigged.glb` (0.99 MB), the duplicated `_low` building pair, and the 1 MB non-module `vfx.js` all ship but are never fetched. They inflate the APK/download, not the runtime. |
| Audio cannot be verified offline | Low | SFX loads a 1.15 MB sprite at boot. Fine on mobile data? Probably, but unmeasured. |
| Rain/particles? none | — | No particle systems are used per frame; VFX only fires on land/coin events. |
| Per-frame allocations | Low | `car.js` is allocation-free; the render loop reuses vectors and rays. The only per-frame work of note is one raycast against 31 obstacles. |

### 5.4 Mobile / landscape / touch specifics

* `index.html` uses `viewport-fit=cover`, `overflow:hidden`, `user-scalable=no`, `touch-action:none` on the canvas — correct for a game.
* The joystick is a fixed 128 px SVG at `left:18px; bottom:32px`; BRAKE at `right:22px; bottom:34px`; Drive/Ride at `bottom:140px`; quick-wheel button at `left:58px; top:10px`. Hit areas are ≥ 42 px — acceptable.
* **`SCREEN.safeArea()` exists in the platform layer but the game never calls it.** On phones with a gesture bar or a notch, the joystick and BRAKE sit ~32–34 px from the bottom edge, which is inside the typical system-gesture area. This is a genuine layout risk (no orientation lock either — the UI is designed to adapt, but nobody has looked at it in landscape).

### 5.5 Practical optimisations (recommendations for V4 — **not applied**)

1. Show a loading progress screen while `loadExtras()` runs and gate Play on *hero + car ready*, not just buildings.
2. Load car/bike/hero in parallel (`Promise.all`) instead of three sequential awaits.
3. Load only the selected car variant and skip the `_low` duplicates — a trim list, no code change.
4. Adapt quality *before* the first frame: read `devicePixelRatio`/`hardwareConcurrency`/`WEBGL_debug_renderer_info`; start at DPR 1.0 + no MSAA on low-end GPUs.
5. Use `SCREEN.safeArea()` to inset the joystick, BRAKE and Drive buttons (and a landscape HUD pass).
6. Consider `powerPreference: 'high-performance'` and shader pre-compilation (`renderer.compile`) during the load screen to avoid hitches.
7. If draw calls ever climb: instanced lamp posts/trees (currently ~31 separate meshes).
8. Defer the 1.15 MB SFX sprite until the first sound is actually needed.

---

## 6. Phase 6 — Bugs and issues found

Nothing here blocks the game from booting; ordered by practical impact.

| # | Severity | Issue | Where | Detail |
|---|---|---|---|---|
| 1 | Medium | **No device/browser verification exists yet** | — | The biggest risk on the list. Everything below is secondary to seeing it run. |
| 2 | Low–Medium | HUD ignores the phone's safe areas | `src/main.js` (fixed inline styles), `pixelfork/screen.js` (`safeArea()` unused) | Joystick and BRAKE can sit under the gesture bar/notch. |
| 3 | Low–Medium | Play is enabled before the hero and vehicles finish loading | `main.js` `loadExtras()` / `$('uo-play')` | Player may start with the boxy placeholder hero, which later swaps to the scanned man (`swapHero`). No loading indicator. |
| 4 | Low | 8 of 16 token spots are inside a tree trunk | `src/city.js` `build()` — tree spots pushed at the trunk position while a 0.8 m collider is added there | Collectable (radius 1.4 m) but visually embedded; the token beam intersects the tree. |
| 5 | Low | Car has no `radius`/`span` in config, the bike does | `src/config.js` `car` group vs `car.js` defaults `1.05/1.35` | Asymmetric tuning: car collision cannot be adjusted from Mechanics. |
| 6 | Low | Mounting a vehicle again after changing `length`/`flipFront` does not dispose the previous clone | `main.js` `mountVeh()` | Small GPU leak, only on a config change (Mechanics panel). |
| 7 | Info | `full` car model is a heavy option | `CONFIG.car.model` | 175 k tris + 1024² texture; fine as an option, bad as a default on 4 GB. |
| 8 | Info | Player-facing Credits shows internal diagnostics | `main.js` diag panel | Deliberate debug aid (useful for you), but it exposes file paths/floor counts to players. |
| 9 | Info | `characterrigged.glb` is 17.93 raw units tall | asset | The ragdoll normalises it (accepted, rest pose T-pose), but any future scaling work must account for it. |
| 10 | Info | Google Fonts is the only external request | `packs/ui/…/kit.css` | Cosmetic; offline → system font. |
| 11 | Info | SFX choice of 659 sounds for 4 used effects | `SFX.load('casual')` | Loads 1.15 MB to play 4 names. |
| 12 | Info | `not a bug, noted`: mission timers keep running while the quick wheel/pause is open? | `loop.pause()` on wheel open | Verified intended: pause stops `update`, so timers freeze. Correct behaviour. |

---

## 7. Missing assets and dependencies

**Nothing required is missing.** All 9 manifest models, all packs, all 28 UI icons, the SFX sprite and all JSON resolved correctly.

For the record, what the project intentionally does *not* contain (so V4 doesn't assume it):

* **No animation clips in any GLB** — animation is procedural (ragdoll). Custom clips would need a rig/retarget decision.
* **No music, no vehicle engine loop, no ambient beds** — only the built-in SFX sprite.
* **No skybox/HDR/environment map** (sky is a flat colour), no post-processing, no LUTs.
* **No interiors, no pedestrians/NPC AI, no traffic simulation** — parked "traffic" is static geometry with colliders.
* **No LODs or texture atlases** anywhere; no baked lightmaps.
* The two `…_low` building pairs are byte-identical duplicates (kept because they were in the original payload).
* Packs `vfx`, `sfx`, `ui`, `ragdoll` ship without LICENSE files (three, crashcat and howler have theirs); the CC BY 4.0 credits for the scanned man and the bobber are shown in the in-game Credits screen and in `CHANGELOG_V3.txt`.

---

## 8. Recommended V4 priorities

Ordered by risk reduction first, spectacle second.

**P0 — see it run (before any development)**
1. Open it in Chrome on your Android phone via the preview, and read the Credits diagnostics (FPS, pixel ratio, draw calls, building path). That single datapoint decides what V4 can afford.
2. Fix whatever that reveals (if anything): orientation, safe areas, frame rate.

**P1 — foundations (cheap, high value)**
3. Loading screen with progress + "hero/car ready" gating (fixes bug 3), parallel asset loading.
4. Mobile HUD pass: safe-area insets, landscape layout, thumb-reach grouping, larger pause/wheel targets.
5. Trim the shipped payload (drop unused variants) and give the Mechanics panel a quality preset (Low / Medium / High) that also covers `antialias` and DPR at boot.

**P2 — world & feel**
6. Camera polish: obstacle avoidance damping, speed-based FOV, collision shake — the current chase logic is a good base but unverified.
7. Collision detail: fix the tree-token overlap (bug 4), add kerbs/sidewalk colliders so the car has a defined road edge, expose car collision radius/span in config (bug 5).
8. Mission depth: waypoint arrows/route line in the world, courier route variety, a third mission type; save slots instead of a single score.

**P3 — visual upgrade (the part you're waiting on)**
9. Do it **inside the existing budget**: keep draw calls < 200 and the frame under ~65 k tris; the cheap wins are a gradient sky + fog matched to the horizon, better road/kerb materials, a single tiling asphalt texture instead of the current flat colour, tinted storefront/emissive windows on the procedural blocks, and contact shadows.
10. Add real lighting shape (a second non-shadowing fill light + subtle sun colour grading) rather than more geometry.
11. Only then consider: one LOD level for the car, an environment map for the Lamborghini paint, particles for dust/tyres.

**P4 — packaging**
12. Music + engine/POV audio, then APK build, then a device performance pass on the 4 GB target.

---

## 9. What I changed (complete list)

| Change | Why |
|---|---|
| `urban_outlaw_v3_project.zip` → `backup/urban_outlaw_v3_project.zip` | Preserve the original archive, keep it out of the way, keep the hash (unchanged). |
| Archive contents moved to the repository root | `index.html` and the project are now easy to locate; no duplicated assets. |
| **Added `serve.js`** (new file, ~50 lines, no dependencies) | The game cannot run from `file://`; this lets you (and me) serve it over HTTP on any port. **This is the only file I created.** |
| **Added `REPORT.md`** (this document) | The audit deliverable. |
| Nothing else | `src/`, `pixelfork/`, `packs/`, `assets/`, `tools/`, `game.json`, `index.html`, `README.md` are byte-identical to the archive. No game logic was edited, no asset replaced, no feature removed. |

The work is committed on `arena/89a95d54-urban-outlaw` (a working branch, **not** `main`) and is **not merged**.

## 10. How to run it

```bash
node serve.js          # http://localhost:8080
PORT=3000 node serve.js
```

Then open the URL in a browser (desktop Chrome for a quick look, your Android Chrome for the real test). Keyboard: `WASD`/arrows to move, `Space` jump, `E` enter/exit vehicle, `Q` quick wheel.

---

## 11. Waiting on you

* **Approval to start V4 development and the graphics upgrade** — I have not started it.
* Ideally also: one run on your phone with the FPS/draw-call numbers from the Credits panel, so the V4 visual budget is set from data rather than from my estimates.

---

## V3 OVERHAUL (implementation notes)

Stages delivered on top of this audit, without changing the city, car, mission, save or
audio systems:

1. `src/camera.js` — three rigs (on foot / car / bike) sharing one collision test against
   `city.colliders`. The smoothed quantity is the camera *distance*, so the lens always sits on
   the ray that was just tested; walls pull it in immediately and it eases back out at 4.5/s.
2. `src/ik.js` + `src/pose.js` — two-bone IK and bone aiming. The hero's arms are driven by
   fractions of each arm's own length (the scan rig has a 0.50 m left arm and a 0.56 m right arm,
   which the shared clips do not account for). The rider is posed from geometry measured off the
   bobber (grips in fork space, pegs, seat at 40 % of the wheelbase).
3. `src/ui.js` + `src/ui.css` — landscape-first HUD with safe-area insets, cinematic main menu,
   dialogs, and the in-game smartphone (Map / Missions / Contacts / Garage / Settings / Profile).
   The Pixelfork UI kit is no longer loaded; `main.js` no longer touches `window.SC`.
4. `src/main.js` — wiring only: UI callbacks, camera rig, pose hooks, phone input lock, and Play
   gating on real asset readiness. Missions, courier, save keys, collisions, VFX/SFX untouched.

Measured results and the limits of what could be verified here are in
`TEST_REPORT_V3_OVERHAUL.md`.
