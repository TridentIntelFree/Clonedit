/* TWO FILES EXPORTED THE SAME NAME AND THE APP LOST BOTH.

   src/pure/ is published to the page as globals: vite.config.js bundles
   src/pure/index.js — which is nothing but `export *` lines — to an IIFE
   and does `Object.assign(globalThis, __JBH_PURE)`. The engine then calls
   euclid(), SCALES, GROOVES and the rest as bare names.

   `export *` has one rule that bites here: when two re-exported modules
   export the SAME name, that name is AMBIGUOUS and the star export
   silently omits it. Not an error, not a warning — the key is simply not
   on the namespace object, so the global never gets assigned.

   That happened. src/pure/groove.js exports GROOVES, the swing and feel
   templates the GROOVE panel is built from (STRAIGHT, SWING 58%,
   OFF-GRID, LATIN PUSH, REGGAE DRAG). A later commit added
   src/pure/grooves.js — the measured drum corpus — and it also exported
   GROOVES. From that commit on:

     grooveApply()  ->  ReferenceError: GROOVES is not defined

   The whole feel panel threw on every use, in the shipped index.html,
   and nothing failed. The unit tests import each module DIRECTLY by
   path, so both files' tests stayed green while the thing they describe
   was unreachable. The browser suites never touched that control.

   So this asserts the published surface rather than the modules: every
   name src/pure/ means to publish has to actually arrive. It bundles
   exactly the way the build does, which is the only way to see an
   ambiguity that both halves of the source are innocent of. */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PURE = resolve(ROOT, 'src', 'pure');

/* the names each file declares, read from source — the set that SHOULD
   arrive, independent of what the bundler decides to do with them */
function declaredExports(file) {
  const src = readFileSync(resolve(PURE, file), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm))
    names.add(m[1]);
  return names;
}

const files = readdirSync(PURE).filter(f => f.endsWith('.js') && f !== 'index.js');

/* bundled exactly as vite.config.js does it */
const bundled = await build({
  entryPoints: [resolve(PURE, 'index.js')],
  bundle: true, format: 'iife', globalName: '__P', write: false,
});
const PUB = new Function(
  new TextDecoder().decode(bundled.outputFiles[0].contents) + ';return __P;')();

test('no two files in src/pure export the same name', () => {
  const owner = new Map(), clashes = [];
  for (const f of files)
    for (const n of declaredExports(f)) {
      if (owner.has(n)) clashes.push(n + ': ' + owner.get(n) + ' and ' + f);
      else owner.set(n, f);
    }
  assert.deepEqual(clashes, [],
    'an `export *` drops an ambiguous name silently, so each of these is a '
    + 'global the page never receives:\n  ' + clashes.join('\n  '));
});

test('every name src/pure declares arrives as a global', () => {
  const missing = [];
  for (const f of files)
    for (const n of declaredExports(f))
      if (!(n in PUB)) missing.push(n + ' (' + f + ')');
  assert.deepEqual(missing, [],
    'declared in src/pure and absent from the published namespace, so the '
    + 'engine calling it by bare name throws:\n  ' + missing.join('\n  '));
});

/* The two that collided, named outright. The test above is the general
   rule; these are the regression, and they say which is which — the
   distinction the clash destroyed. */
test('GROOVES is the feel templates and DRUM_CORPUS is the measurement', () => {
  assert.equal(typeof PUB.GROOVES, 'object');
  assert.ok(PUB.GROOVES.straight, 'GROOVES.straight — the feel panel reads this');
  assert.ok(Array.isArray(PUB.GROOVES.straight.t), 'feel templates carry timing rows');

  assert.equal(typeof PUB.DRUM_CORPUS, 'object');
  assert.match(PUB.DRUM_CORPUS.source, /Groove MIDI Dataset/);
  assert.ok(PUB.DRUM_CORPUS.styles.rock.takes > 300,
    'the measured corpus, not the feel table');
});
