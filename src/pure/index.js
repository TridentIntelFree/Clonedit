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
export * from './poly.js';
export * from './ir.js';
export * from './install.js';
export * from './sfz.js';
/* what a sample can actually do — attack, ring, and whether a part is
   playable on it at a given tempo. Pure maths over a channel of audio,
   so it is tested in Node against signals whose answers are known. */
export * from './timbre.js';
/* what a RECORDED take did: onsets off the buffer, timing against the
   grid, and the three faults that make a take unusable. The schedule
   checks next door cannot see a take at all -- they read the sequencer,
   and a take is audio off the mic bus. */
export * from './take.js';
/* recipes: slots with a measurable brief, and a seeded generator */
export * from './recipes.js';
/* the measured drum figures the recipes draw from. Exported rather than
   left as recipes.js's private import, because the whole point of
   measuring something is that you can go and read the numbers — this
   repo's recurring mistake is a capability with no way in, and a table
   nobody can print is that same fault wearing a different hat. */
export * from './grooves.js';
/* tonal is bundled in through here: pure, testable from Node, and
   published as globals ahead of the engine like everything else in
   this folder. */
export * from './theory.js';
/* melodic shapes from magenta, generated and filtered offline — see the
   header there for why they are intervals and why they are baked in */
export * from './contours.js';
