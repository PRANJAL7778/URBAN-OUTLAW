// Resolves the bare specifiers the game uses to the harness copies installed by setup.sh.
//
// `node --import ./dist_shim.mjs <test>` previously did nothing: the file exported a `resolve`
// hook but never registered it, so tests only worked because their own imports happened to sit
// next to node_modules/. Files that import 'three' from tests/harness/src/ (or from anywhere
// outside tests/harness) failed with ERR_MODULE_NOT_FOUND. Registering the hook properly fixes
// that for every test.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HOOKS = new URL('./dist_shim_hooks.mjs', import.meta.url);
register(HOOKS, pathToFileURL('./'));
