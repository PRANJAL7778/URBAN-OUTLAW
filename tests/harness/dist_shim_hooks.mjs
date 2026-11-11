// The loader hook registered by dist_shim.mjs. Kept in its own file because `register()` runs it
// on a separate module graph: it must not import anything from the game.
import { pathToFileURL } from 'node:url';

const HERE = new URL('./', import.meta.url);
const MAP = {
  three: 'three/three.module.js',
  ragdoll: 'ragdoll/ragdoll.module.js',
  crashcat: 'crashcat/crashcat.js',
  'crashcat/three': 'crashcat/crashcat-three.js',
};

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) {
    return { url: new URL('./node_modules/' + MAP[specifier], HERE).href, shortCircuit: true };
  }
  if (specifier.startsWith('three/addons/')) {
    return { url: new URL('./node_modules/three/addons/' + specifier.slice('three/addons/'.length), HERE).href, shortCircuit: true };
  }
  return next(specifier, context);
}
