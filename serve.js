#!/usr/bin/env node
/* Local dev server for URBAN OUTLAW — added during the V3 audit/setup (NOT part of the original archive).
   The game is an ES-module + fetch() project, so it needs to be served over http:// (opening index.html with
   file:// will not work). No dependencies.

     node serve.js            # http://localhost:8080
     PORT=3000 node serve.js  # another port

   It binds 0.0.0.0 so the page also works through a phone/emulator on the same network. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(url.parse(req.url).pathname || '/'); } catch { rel = '/'; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*', // the assets loader reads pictures with CORS
    });
    if (req.method === 'HEAD') { res.end(); return; } // proxies probe with HEAD; never pipe a body for it
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`URBAN OUTLAW on http://localhost:${PORT}/  (root: ${ROOT})`);
});
