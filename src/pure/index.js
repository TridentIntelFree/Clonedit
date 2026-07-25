/* Everything in this folder is pure: no DOM, no Web Audio, no app state. That
   is the whole point — it can be imported straight into Node and tested in
   milliseconds instead of driving a browser.

   The build bundles this into a classic script that runs BEFORE the engine and
   assigns each export to the global scope, so the engine keeps calling euclid()
   and morphPattern() exactly as it always did. As more logic moves here, the
   engine shrinks and the fast test suite grows. */
export * from './math.js';
export * from './pattern.js';
export * from './euclid.js';
export * from './scale.js';
export * from './groove.js';
export * from './morph.js';
export * from './ir.js';
export * from './install.js';
