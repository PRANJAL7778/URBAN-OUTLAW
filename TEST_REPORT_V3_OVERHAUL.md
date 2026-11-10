# Test report — V3 gameplay / animation / UI overhaul

**Build under test:** branch `arena/89a95d54-urban-outlaw`.
**Baseline preserved:** `backup/urban_outlaw_v3_working_build.zip`, git tag `v3-working-baseline` (`ac54825`).

## Read this first

Everything below was run **headlessly in Node**. I did not have a browser, a GPU or a phone,
so I have **not** seen the game render and have **not** tested on a real Android device.
Two things follow from that, and I am stating them plainly:

* Claims about numbers (distances, angles, joint positions, state transitions) are measured.
* Claims about *how it looks or feels* — colour, layout on a 6.6" screen, animation smoothness,
  frame rate on a Realme 9i — are **not** verified. Those need your phone.

Everything in this report can be re-run from the repository:

```bash
cd tests/harness && bash setup.sh
node --import ./dist_shim.mjs boot_test.mjs   # the real main.js: 39 checks
node ui_test.mjs && node pose_test.mjs && node cam_test.mjs && node config_test.mjs
node world_test.mjs && node physics_test.mjs && node drive_test.mjs && node asset_test.mjs
```

## 1. Suites and results

| Suite | What it executes | Result |
|---|---|---|
| `eslint` (all 11 modules) | static analysis: `no-undef`, `no-dupe-*`, unreachable code | **0 problems** |
| `tdz.cjs` (all 11 modules) | top-level "used before declared" — the class of bug that killed boot | **clean** |
| `setup.sh` from a clean checkout | the harness itself is reproducible in the repo | **all 9 suites pass** |
| `boot_test.mjs` | **the real `src/main.js`**, in jsdom, with the real GLB models and real UI | **39 / 39** |
| `ui_test.mjs` | the real `src/ui.js` in jsdom, 41 DOM checks | **all pass** |
| `pose_test.mjs` | hero arm IK + rider IK on the real rigs | **all pass** |
| `cam_test.mjs` | the three cameras against the real city colliders | **17 / 17** |
| `config_test.mjs` | config schema, ranges, removed knobs | **14 / 14** |
| `world_test.mjs` | city build/rebuild, colliders, hero disposal | **26 / 26** |
| `physics_test.mjs` | vehicle collision vs buildings, bounds, NaN | **10 / 10** |
| `drive_test.mjs` | car/bike handling, frame-rate independence | **11 / 11** |
| `asset_test.mjs` | GLB scaling and proportions | **14 / 14** |

`boot_test.mjs` is new this stage and is the important one: it is the only test that executes
`main.js` at all, so it is the only one that can catch start-up crashes, wrong DOM ids, and
callbacks that are declared but never wired.

### The bug it caught on the first run

The first boot run failed with:

```
ReferenceError: Cannot access 'qualityLevel' before initialization
    at setQualityLevel (src/main.js:91)  ← called from the module body at line 121
```

`setQualityLevel()` is invoked during start-up but `qualityLevel` was declared ~300 lines
further down. Every one of the other nine suites passed while the game was unable to boot at
all — because none of them execute `main.js`. On a phone this is a black screen with a console
error, and nothing else. Fixed by declaring the variable with the other top-level state, and I
then re-introduced the bug in a copy of the file to confirm the test fails on it
(`boot_bug_test.mjs`: `FAIL … Cannot access 'qualityLevel' before initialization`).

Three more real defects came out of driving the UI through real button presses:

| Defect | Symptom on a phone | Fix |
|---|---|---|
| the menu was never shown at boot | first visit = empty screen until something else called `screen()` | `ui.js` establishes the initial screen and settings state in `createUI()` |
| Settings from the menu had no way back | simulation paused, dialog dismissed, world frozen | new `onOptions` / `onOptionsClose` handlers pause and resume around the dialog |
| the phone did not cancel a joystick push already under way | hero coasts a few metres while you read the panel | `main.js` drops movement on the frame the phone is open |

## 2. What the boot test proves, step by step

Executed against the real files, in this order, all passing:

* `main.js` module body runs to completion; the renderer canvas lands in `#game`.
* The boot chain loads the real assets: office + apartment buildings, the Lamborghini lite,
  the bobber, and the scan character — **5 real GLBs**, parsed with the real `GLTFLoader`.
* Both vehicles end up `ready`, the bobber with separate `rearWheel`/`frontWheel`/`fork` parts,
  and the bike geometry measurement produced a seat and grips.
* The hero is the scan character and the arm system is active
  (`scan character: rig accepted (rest pose arms d…)`).
* **Play gating:** Continue is `disabled` with no save; clicking it does not start the game;
  it enables once a save exists *and* the world is ready.
* **New Game confirmation:** asks first; Cancel leaves the menu; confirm starts play.
* **Walking:** a stick push moves the hero 2.19 m; the knob tracks the finger and springs back.
* **Jump:** lifts the hero (y 0.00 → 0.54) and lands again (y < 0.20).
* **Phone:** opens; movement locked (0.00 m drift over 30 frames); car throttle forced to 0 and
  brake on; closing releases the lock and hides the panel.
* **Phone apps:** all six (map, missions, contacts, garage, settings, profile) render a pane.
* **Pause / Resume** pause and unpause the real loop.
* **Settings:** the sensitivity slider reaches `camRig.state.sensitivity` (0.00500 → 0.00200);
  the graphics preset writes `quality=low`.
* **Main menu → Continue** round-trip works on the second visit.
* **Car:** enters, accelerates to 4.08 m/s from the stick, chase camera at 6.42 m and 2.14 m up.
* **Bobber:** enters, rider clone created and posed, `seated, lean 0.88 rad, stretch 1.09`,
  moves under throttle, and dismounting frees the rider clone.
* **300 further live frames** (update + render) with no exception.

## 3. Character arms — measured

```
bones: hips spine chest head left/right UpperArm LowerArm Hand UpperLeg LowerLeg Foot
bind pose: left arm 0.496 m (0.241 + 0.255)   right arm 0.556 m (0.265 + 0.291)
shoulders at x +0.13 / -0.25;  bone length axis = local -Y
```

The skeleton is not twisted and elbow flexion was already anatomically correct; what differs is
**arm length (12 %) and shoulder offset**, which any absolute-metre pose gets wrong on one side.
The arm pass is therefore driven by fractions of each arm's own length.

| State | left elbow | right elbow | swing range (fraction of arm) |
|---|---|---|---|
| idle | 55° | 55° | ±0.015 |
| run | 70° | 81° | 0.720 / 0.720 |
| sprint | 75° | 48° | 0.720 / 0.720 |
| jump (air) | 71° | 71° | 0.000 (both arms up) |

swing amplitude identical (0.720 vs 0.720) · swing centre identical (−0.075) · L/R elbow
difference 0.7° when not swinging · idle/jump mirror error **0.048 m** (the rig's own 6 cm
asymmetry) · hands stay outside the torso in every state (min lateral offset 0.103 m).

## 4. Motorcycle riding pose — measured against the real bike

```
grips (fork space): (0.126, 0.129, ±0.336)   ← steer with the fork
pegs  (model space): (0.010, -0.257, ±0.249)
seat  (model space): (-0.129, 0.384, 0)      ← 40 % of the wheelbase behind the front axle
```

both palms on the grips **0.0000 m** · fingers across the bar **1.00/1.00** dot · ankle above
peg **0.075 m** · pelvis **0.020 m** above the seat, **0.000 m** lateral · hands follow a 0.5 rad
steering input to **≤ 0.033 m** while the grips themselves move 0.200 m · no NaN joints.
At runtime the calibration resolved to **lean 0.88 rad, stretch 1.09** for the posed rider
(the standing hero uses 0.64 rad). The bobber's bars sit at seat height and 0.28 m forward, so
an upright rider physically cannot reach them; the lean is solved, not hand-keyed.

## 5. Cameras

| Check | Result |
|---|---|
| walking camera inside a building, 330 frames orbiting next to the city | 0 |
| walking camera below the road | 0 |
| line of sight wall-free | 1 frame in 330 (corner, within the 0.5 m margin) |
| walking distance / pitch clamps | 2.20–6.50 m / 0.10–1.05 rad |
| car camera through a 90° turn | max 6.0°/frame, settles in 1.08 s, 6.6 m behind |
| car distance vs speed | 6.20 → 7.70 m |
| bike camera horizon roll | 0 rolled frames in 120 |
| bike camera distance | 5.37 m (closer than the car's 6.20 m) |
| teleport | snaps, does not trail across the map |

Worst walking-camera pull-in: **2.55 m in one frame**, at a corner where a wall cuts the line of
sight. Deliberate — the lens would rather move than show through geometry. Car and bike never snap.

## 6. Regression of the pre-existing game

Nothing in the city, car, missions, saving, audio or control layers was rewritten; the suites
that covered them before still pass unchanged: world 26/26, physics 10/10, drive 11/11,
asset 14/14, plus the UI 41 DOM checks. The boot test additionally proves the courier mission,
mission state, save keys and vehicle records are still reachable and intact from `main.js`.

## 7. Packaging

* Every `src`, `href` and import-map target in `index.html` resolves inside the repo
  (14 files in the module graph, all present; nothing remote, all paths relative).
* Served locally with the repo's own `serve.js`: `/`, `/index.html`, all five new modules,
  `pixelfork/bridge.js`, the three.js pack, `assets/bobber_lite.glb` and `.nojekyll` all
  return **200**.
* `.nojekyll` is present, so GitHub Pages serves the files verbatim.

## 8. Deployment

GitHub Pages for this repository is configured to publish the branch
`arena/89a95d54-urban-outlaw` from `/`, so the URL below serves this commit once the Pages build
finishes (it was still `building` when I stopped watching it — the sandbox has no outbound access
to `*.github.io`, so **I could not load the live site to confirm it**).

* Live URL: <https://pranjal7778.github.io/URBAN-OUTLAW/>
* The build runs against commit `3951005`, and every path in `index.html` is relative and present,
  so it will work from the `/URBAN-OUTLAW/` sub-path.

## 9. Performance

No new libraries, no extra textures, no post-processing. Additions are ~2 k lines of JS, two
2-bone IK chains for the hero and one 16-bone rider solve per frame, next to the existing
~60 k triangles / ~180 draw calls. Removing the Pixelfork UI kit from `index.html` takes
234 KB (kit CSS + JS) out of the first load. The phone map is a canvas redrawn 2.5×/s only while
the phone is open.

**I have not measured frame time.** Please check the FPS line in Credits → diagnostics on the
Realme 9i, and use Settings → Graphics (Auto / Low / High) if it dips.

## 10. What still needs your phone

1. Landscape: joystick, PHONE, JUMP, DRIVE/BRAKE clear of the gesture bar and rounded corners.
2. Walk, then orbit the camera next to a building — no wall clipping, no uncomfortable pull-in.
3. Ride the bobber — both hands on the grips, feet on the pegs, hands follow the bars.
4. Drive the car — chase camera shows the road, no shake or snap through turns.
5. Walk / run / sprint — do the arms look even now?
6. PHONE → Map / Missions / Settings / Profile, and confirm you cannot move while it is open.
7. Menu → Continue / New Game (confirmation) / Settings → Back.
8. The courier mission end to end, and a save/reload cycle.
