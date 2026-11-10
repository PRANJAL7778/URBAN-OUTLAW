#!/bin/bash
# Builds a headless test environment from the repo's own pack files.
# Nothing here is needed to play the game — it exists so every claim in
# TEST_REPORT_V3_OVERHAUL.md can be re-run on any machine with Node 20+.
#
#   cd tests/harness && bash setup.sh && node --import ./dist_shim.mjs boot_test.mjs
set -e
H="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$H/../.." && pwd)"

mkdir -p "$H/node_modules/three" "$H/node_modules/crashcat" "$H/node_modules/ragdoll" "$H/src" "$H/pixelfork" "$H/assets_nt"
cp "$R/packs/render-3d/three@0.186.0/files/three.module.js" "$R/packs/render-3d/three@0.186.0/files/three.core.js" "$H/node_modules/three/"
cp -r "$R/packs/render-3d/three@0.186.0/files/addons" "$H/node_modules/three/addons"
cat > "$H/node_modules/three/package.json" <<'J'
{"name":"three","version":"0.186.0","type":"module","exports":{".":"./three.module.js","./addons/*":"./addons/*"}}
J
cp "$R/packs/physics-3d/crashcat@0.0.5/files/crashcat.js" "$R/packs/physics-3d/crashcat@0.0.5/files/crashcat-three.js" "$H/node_modules/crashcat/"
cat > "$H/node_modules/crashcat/package.json" <<'J'
{"name":"crashcat","version":"0.0.5","type":"module","exports":{".":"./crashcat.js","./three":"./crashcat-three.js"}}
J
cp "$R/packs/character/pixelfork-ragdoll@0.9.7-A/files/ragdoll.module.js" "$H/node_modules/ragdoll/"
cat > "$H/node_modules/ragdoll/package.json" <<'J'
{"name":"ragdoll","version":"0.9.7","type":"module","exports":{".":"./ragdoll.module.js"}}
J
echo '{"type":"module"}' > "$H/package.json"
[ -d "$H/node_modules/jsdom" ] || (cd "$H" && npm install --no-audit --no-fund jsdom@27 >/dev/null 2>&1)
cp "$R/src/"*.js "$H/src/"
cp "$R/src/config.js" "$H/src/config_copy.mjs"
cp "$R/src/car.js" "$H/car.js"
cp "$R/pixelfork/config.js" "$H/pixelfork/config.js"
cp "$R/assets/"*.glb "$H/assets_nt/" 2>/dev/null || true
node -e "const l=require('fs').readdirSync('$H/assets_nt'); console.log('harness ready · ' + l.length + ' assets · three ' + require('$H/node_modules/three/package.json').version);"
