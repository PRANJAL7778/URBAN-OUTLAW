URBAN OUTLAW — RECOVERED WEB GAME PROJECT

What this is
- A copy of the game's web payload recovered from the uploaded APK.
- The app's HTML, JavaScript source, Pixelfork runtime packs, configuration, manifests, and bundled GLB assets are included.
- The original 3D asset files have been preserved as found in the APK; they have not been replaced or modified.

Main editable files
- src/main.js: main game logic, menu/HUD, controls, camera, scoring, startup
- src/city.js: roads, city blocks, trees, building placement and colliders
- src/config.js: world, building, camera, player, token and color settings
- assets/manifest.json: registered model assets
- index.html: web entry point and runtime imports
- game.json: Pixelfork pack declarations

Important caveats
- This is NOT a ZIP exported by Pixelfork, so Pixelfork may not accept it as an importable project directly.
- It is genuine, readable game source extracted from the APK payload, but it may still depend on Pixelfork runtime/platform APIs.
- Do not open index.html directly with file:// and expect it to work reliably; JavaScript modules and fetch() generally need a local web server or hosting.
- Keep the original APK and Pixelfork project as backups.

Assets note
- Character, two apartment models, two office models, and the light-blue supercar GLB are in assets/.
- The current main game logic creates its playable hero using the Pixelfork ragdoll runtime. The registered character GLB and supercar GLB are bundled but do not appear to be instantiated by src/main.js yet.
- The bundled SFX library has generic built-in sounds. No separate custom .mp3/.wav files were found in the APK.

Suggested AI workflow
1. Extract this ZIP before editing.
2. Give the AI src/main.js, src/city.js, src/config.js, assets/manifest.json, and this README first, plus specific requested model assets if needed.
3. Ask it to preserve existing assets and modify the code minimally, then return the complete updated project folder/ZIP.
4. Test a web build before replacing your working APK.
