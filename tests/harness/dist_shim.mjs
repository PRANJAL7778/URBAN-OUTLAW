// Resolves the bare specifiers main.js uses to the harness copies installed by setup.sh.
import { pathToFileURL } from 'node:url';
const here = new URL('./', import.meta.url);
const MAP = {
  three: 'three/three.module.js',
  ragdoll: 'ragdoll/ragdoll.module.js',
  crashcat: 'crashcat/crashcat.js',
  'crashcat/three': 'crashcat/crashcat-three.js',
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL('node_modules/' + MAP[specifier], here).href, shortCircuit: true };
  return next(specifier, context);
}
