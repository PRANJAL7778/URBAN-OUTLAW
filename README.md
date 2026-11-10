# URBAN-OUTLAW
My own open world high graphics game 

---

## V3 overhaul (landscape UI, cameras, character + bike animation)

* **Changelog:** `CHANGELOG_V3_OVERHAUL.txt`
* **Test report (what was and was not verified):** `TEST_REPORT_V3_OVERHAUL.md`
* **Technical audit:** `REPORT.md`
* **Pre-overhaul build:** `backup/urban_outlaw_v3_working_build.zip` (tag `v3-working-baseline`)

New modules: `src/ui.js`, `src/ui.css`, `src/camera.js`, `src/ik.js`, `src/pose.js`.

Live build (GitHub Pages): <https://pranjal7778.github.io/URBAN-OUTLAW/>
_(if it still shows the pre-overhaul dashboard, the Pages *deploy* step is stuck — see section 8 of `TEST_REPORT_V3_OVERHAUL.md`)_

Run locally with `node serve.js` and open `http://localhost:8080/` (ES modules need a server —
do not open `index.html` from `file://`).

Re-run the automated tests with `cd tests/harness && bash setup.sh`, then see
`tests/harness/README.md`.
