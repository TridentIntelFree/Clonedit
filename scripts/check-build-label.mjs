/* IS THE VERSION THE APP SHOWS THE VERSION IT IS?

   Reported: "I've been stuck on version 267 for several sessions."

   Nothing was stuck. R267 was written by hand in src/legacy.js for
   commit 500d4e4, and the SEVEN commits after it each shipped without
   touching that line — so the app kept introducing itself as R267 while
   the code underneath it changed completely. Every one of those builds
   deployed correctly. The label lied, and a label that lies about the
   version is worse than no label: it makes a person doubt work that is
   actually in front of them.

   WHY IT IS NOT INJECTED AT BUILD TIME, which was the first instinct.
   `index.html` is committed, and CI rebuilds it and requires the result
   to be byte-identical:

     if ! git diff --quiet -- index.html; then  ...  exit 1

   A build happens BEFORE the commit it ships with, so `git rev-list
   --count HEAD` locally is the parent's count and in CI it is the
   commit's own. Injecting a count, a SHA or a timestamp therefore makes
   the local and CI builds differ by construction, and the drift check
   fails on every push. Anything derived from history has to be CHECKED
   rather than injected.

   So this checks. In CI, HEAD *is* the commit being shipped, so the
   arithmetic is exact and the off-by-one does not exist. Run locally
   with --pending to account for the commit you are about to make.

   (That is superseded below: the label is checked against the previous
   commit's, not against a count. See WHAT THE LABEL IS CHECKED AGAINST.)

   Run: node scripts/check-build-label.mjs [--pending]
*/

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PENDING = process.argv.includes('--pending');


const src = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');
const m = src.match(/const BUILD\s*=\s*\x27([^\x27]*)\x27/);
if (!m) {
  console.error('no BUILD line in src/legacy.js — this check cannot read the version.');
  process.exit(2);
}
const label = m[1];

const rev = label.match(/\bR(\d+)\b/);
if (!rev) {
  console.error('the BUILD line carries no R number: ' + JSON.stringify(label));
  process.exit(2);
}
const shown = +rev[1];

/* WHAT THE LABEL IS CHECKED AGAINST: THE COMMIT BEFORE IT, NOT A COUNT.

   This used to compute R = (commits on main) - 9. It could not work in the
   one place it was meant to: CI checks out with fetch-depth 1, where
   `git rev-list --count HEAD` is 1, so it demanded R-8 and FAILED EVERY
   PUSH from R285 onward. It was not even right locally — the count depends
   on how deep the clone is (a shallow one gave 296, the full history 445),
   so the offset measured on one clone was wrong on the next.

   What is actually wanted is that the number MOVES when the app changes and
   does not go backwards, and that only needs the previous commit's label:

     - a change in progress (src/ or index.html dirty) must be R(HEAD) + 1;
     - in CI, HEAD is the shipping commit, and it must be R(HEAD~1) + 1 if
       it touched src/ or index.html, else equal. ci.yml fetches depth 2;
     - with no parent to read (a depth-1 clone, a tarball) it is skipped and
       says so, rather than inventing a number. */
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const labelAt = (rev) => {
  try {
    const t = git(['show', rev + ':src/legacy.js']);
    const mm = t.match(/const BUILD\s*=\s*\x27[^\x27]*\bR(\d+)\b/);
    return mm ? +mm[1] : null;
  } catch (e) { return null; }
};
let dirty = false, inGit = true;
try {
  dirty = git(['status', '--porcelain', '--', 'src', 'index.html']).trim().length > 0;
} catch (e) { inGit = false; }
if (!inGit) {
  console.log('no git history here, so the version cannot be checked. Skipped.');
  process.exit(0);
}
const pending = PENDING || dirty;
let base, changed;
if (pending) { base = labelAt('HEAD'); changed = true; }
else {
  base = labelAt('HEAD~1');
  try { changed = git(['diff', '--name-only', 'HEAD~1', 'HEAD', '--', 'src', 'index.html']).trim().length > 0; }
  catch (e) { changed = true; }
}
if (base == null) {
  console.log('the previous commit is not in this clone, so there is no label to compare R'
    + shown + ' against. Skipped (CI fetches depth 2 for this).');
  process.exit(0);
}
const expect = changed ? base + 1 : base;
const date = label.match(/\b(\d{4}-\d{2}-\d{2})\b/);

if (shown !== expect) {
  console.error('THE VERSION LABEL IS ' + (shown < expect ? 'BEHIND' : 'AHEAD') + '.');
  console.error('');
  console.error('  src/legacy.js says   R' + shown);
  console.error('  it should say        R' + expect + '   (the previous commit was R' + base
    + (changed ? ', and the app changed' : ', and the app did not change') + ')');
  console.error('');
  console.error('The app introduces itself with that line, so leaving it behind means');
  console.error('somebody looks at new work and sees an old version number. Edit the');
  console.error('BUILD line in src/legacy.js, then rebuild:');
  console.error('');
  console.error("  const BUILD = 'JBH-88 · R" + expect + ' · '
    + new Date().toISOString().slice(0, 10) + " · <what changed, in plain words>';");
  process.exit(1);
}

if (!date) {
  console.error('the BUILD line carries no YYYY-MM-DD date: ' + JSON.stringify(label));
  process.exit(1);
}

console.log('version label is R' + shown + ', which matches '
  + (pending ? 'the commit you are about to make. ' : 'this commit. ')
  + JSON.stringify(label));
