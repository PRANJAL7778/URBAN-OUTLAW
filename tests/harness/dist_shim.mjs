// Resolves the bare specifiers the game uses to the harness copies installed by setup.sh.
import { pathToFileURL } from 'node:url';
const here = new URL('./', import.meta.url);
const MAP = {
  three: 'three/three.module.js',
  ragdoll: 'ragdoll/ragdoll.module.js',
  crashcat: 'crashcat/crashcat.js',
  'crashcat/three': 'crashcat/crashcat-three.js',
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL('./node_modules/' + MAP[specifier], import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) {
    return { url: new URL('./node_modules/three/addons/' + specifier.slice('three/addons/'.length), import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
