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

   THE OFFSET is 9, measured rather than assumed: commit 500d4e4 is the
   276th on main and its label says R267. The R numbers predate the
   repository's current history, so they are not the commit count — they
   are the commit count minus a constant, and the constant is what that
   pair fixes.

   Run: node scripts/check-build-label.mjs [--pending]
*/

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PENDING = process.argv.includes('--pending');

/* R = (commits on main) - OFFSET. Fixed by 500d4e4: the 276th commit,
   labelled R267. */
const OFFSET = 9;

const src = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');
const m = src.match(/const BUILD\s*=\s*'([^']*)'/);
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

let count;
try {
  count = +execFileSync('git', ['rev-list', '--count', 'HEAD'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
} catch (e) {
  /* a tarball with no git history cannot answer this, and failing the
     build for that would be worse than skipping it */
  console.log('no git history here, so the version cannot be checked. Skipped.');
  process.exit(0);
}

/* PENDING OR SHIPPED, WORKED OUT RATHER THAN DECLARED.

   A build runs before its commit, so locally the label describes a
   commit that does not exist yet and HEAD is its parent; in CI the
   commit exists and HEAD *is* it. The difference is exactly whether the
   tree is dirty, so asking git removes the flag and lets this run in
   both places — which matters, because a check that only runs in CI is
   a check nobody sees until after they have pushed. */
let dirty = false;
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'index.html'],
    { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
} catch (e) { /* no git history: handled above */ }

const pending = PENDING || dirty;
const expect = count - OFFSET + (pending ? 1 : 0);

/* AND THE DATE, because a stale date is the same lie in a second field.
   Only its shape is checked here; whether it is TODAY is not something
   CI can know for a commit made yesterday. */
const date = label.match(/\b(\d{4}-\d{2}-\d{2})\b/);

if (shown !== expect) {
  const behind = expect - shown;
  console.error('THE VERSION LABEL IS ' + (behind > 0 ? behind + ' BEHIND' : 'AHEAD') + '.');
  console.error('');
  console.error('  src/legacy.js says   R' + shown);
  console.error('  this commit is       R' + expect
    + '   (' + count + ' commits on main' + (pending ? ' + the one you are making' : '')
    + ' − ' + OFFSET + ')');
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
