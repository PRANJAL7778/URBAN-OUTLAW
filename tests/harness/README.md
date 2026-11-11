# Headless test harness

These are the tests behind `TEST_REPORT_V3_OVERHAUL.md`. They need **Node 20+** and nothing else:
no browser, no GPU, no network. Everything they import comes from this repository's own
`packs/` directory.

```bash
cd tests/harness
bash setup.sh                       # copies three.js / crashcat / ragdoll + the GLBs, installs jsdom
node --import ./dist_shim.mjs boot_test.mjs   # the important one: runs the real src/main.js
node ui_test.mjs                    # main menu, dialogs, HUD, phone (jsdom)
node pose_test.mjs                  # hero arm IK + motorcycle rider IK
node cam_test.mjs                   # the three camera rigs against the real city
node config_test.mjs                # config ranges / removed knobs
node world_test.mjs                 # city build + rebuild, colliders
node physics_test.mjs               # vehicle collisions, bounds, NaN
node drive_test.mjs                 # handling, frame-rate independence
node asset_test.mjs                 # GLB scaling
```

`setup.sh` re-copies `src/*.js` every time it runs, so after editing the game run it again
before re-running a suite. Generated files (`src/__*.js`, `node_modules/`, `assets_nt/`,
`pixelfork/config.js`) are ignored by git.

## What each suite cannot tell you

`boot_test.mjs` executes the real `main.js` in jsdom with a stubbed `WebGLRenderer`, so it
proves start-up order, DOM wiring, UI callbacks and gameplay state — but it cannot render a
pixel. Nothing here measures frame rate, colour, layout on a real screen, or touch feel.
Those need a browser and a phone (see section 10 of the test report).

`tdz.cjs` is a small independent checker for top-level "used before declared" bugs in a module
(`node tdz.cjs ../../src/main.js`). It exists because that class of bug is invisible to every
other static tool here and fatal at run time.
