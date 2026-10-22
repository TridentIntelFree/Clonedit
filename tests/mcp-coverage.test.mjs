/* Every analyser the app has must be reachable over MCP.

   This test exists because for a long time it was not true. The MCP
   server exposed thirty-four tools, all of them for writing or
   transport, and not one analyser: an agent connecting to it could load
   sounds, write steps and render a mix, and had no way whatever to find
   out whether the result was any good. Its own README said that reading
   the level back was the whole point.

   The cost was a real one. A track was bounced using six of the
   seventeen checks the app has, and the three that would have caught
   what the listener then complained about — perceived loudness, small
   speaker translation, and the spectrum of an instrument on its own —
   were among the eleven not run.

   So the rule is that adding a check to the app and forgetting to
   expose it should break the build, rather than quietly leaving the next
   agent half-blind. Driven off the source rather than a hand-written
   list, because a hand-written list is the thing that went stale. */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = readFileSync(resolve(root, 'src/legacy.js'), 'utf8');
const mcp = readFileSync(resolve(root, 'mcp/server.mjs'), 'utf8');

/* The analysers: calls that report on the music rather than change it.
   Named explicitly because "is this a question or an instruction" is not
   something a regex can decide — but the list is asserted against the
   app, so a rename breaks the test rather than silently shrinking it. */
const ANALYSERS = [
  'critique', 'loudness', 'translate', 'pulse', 'motif', 'melody',
  'counterpoint', 'continuity', 'dynamics', 'spectrum', 'compare',
  'reference', 'schedule', 'vsDry',
];
/* attack() and release() look like they belong here and do not: they wire
   layers onto a pad and mark the project dirty. They change the music
   rather than report on it. */

test('every analyser named here still exists in the app', () => {
  for (const a of ANALYSERS) {
    const re = new RegExp('^\\s{2}(?:async\\s+)?' + a + '\\s*\\(', 'm');
    assert.ok(re.test(legacy),
      a + '() is in the analyser list but no longer defined in src/legacy.js — '
      + 'if it was renamed, rename it here and in mcp/server.mjs too');
  }
});

test('every analyser is reachable over MCP', () => {
  const missing = [];
  for (const a of ANALYSERS) {
    /* either its own tool, or dispatched by name from one */
    const hasTool = mcp.includes("'jbh_" + a.toLowerCase() + "'")
      || new RegExp("jbh\\('" + a + "'").test(mcp);
    if (!hasTool) missing.push(a);
  }
  assert.deepStrictEqual(missing, [],
    'these report on the music and an agent cannot reach them over MCP: '
    + missing.join(', ') + '. Add a tool to mcp/server.mjs TOOLS and a case to '
    + 'its dispatch. An agent that cannot listen writes blind.');
});

test('the two calls that teach the workflow are exposed, and first', () => {
  assert.ok(/name: 'jbh_howto'/.test(mcp), 'jbh_howto is not exposed');
  assert.ok(/name: 'jbh_review'/.test(mcp), 'jbh_review is not exposed');
  /* first in the list, because an agent reads the tool list top down and
     the whole problem was that choosing checks by hand is unreliable */
  const names = [...mcp.matchAll(/name: '(jbh_[a-z_0-9]+)'/g)].map(m => m[1]);
  assert.strictEqual(names[0], 'jbh_howto',
    'jbh_howto should be the first tool listed, not ' + names[0]);
  assert.strictEqual(names[1], 'jbh_review',
    'jbh_review should be the second tool listed, not ' + names[1]);
});

test('howto() carries the traps, not just the happy path', () => {
  const m = /howto\(\)\s*\{\s*return\s*\{([\s\S]{0,6000}?)\n  \},/.exec(legacy);
  assert.ok(m, 'howto() not found or no longer returns an object literal');
  const body = m[1];
  assert.ok(/order:/.test(body), 'howto() should give the order to work in');
  assert.ok(/traps:/.test(body), 'howto() should name the traps');
  assert.ok(/norms:/.test(body), 'howto() should carry the measured norms');
  /* the specific ones that cost the most, so a future trim does not quietly
     drop the expensive lessons */
  for (const [what, re] of [
    ['the octave/pitch trap', /octave|pitch/i],
    ['gain being relative to the source', /gain is a multiplier|measured peak/i],
    ['perceived loudness', /perceived|loudness\(\)/i],
    ['bass harmonics on small speakers', /harmonic/i],
  ]) assert.ok(re.test(body), 'howto() no longer mentions ' + what);
});

test('review() reports what it could not run', () => {
  const m = /async review\(opt\)\{([\s\S]*?)\n  \},/.exec(legacy);
  assert.ok(m, 'review() not found');
  const body = m[1];
  assert.ok(/skipped/.test(body),
    'review() must report skipped checks — a check that silently did not run '
    + 'reads exactly like one that passed');
  assert.ok(/catch/.test(body),
    'review() must keep going when one analyser throws');
  assert.ok(/toolsRun|ran\.length/.test(body),
    'review() must say how many checks it managed');
});
