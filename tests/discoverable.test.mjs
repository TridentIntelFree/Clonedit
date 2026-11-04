/* A TOOL AN AGENT IS NEVER TOLD ABOUT IS A TOOL IT WILL REBUILD.

   The MCP server exposes 73 tools, each with a careful description, and
   an agent does not read 73 descriptions before deciding what to do. It
   reads the handshake instructions, which say "Call jbh_howto first",
   and then it reads howto(). That chain is the only path by which a
   capability becomes a thing an agent KNOWS it has.

   Measured when this test was written: the instructions named none of
   infill, ensemble, recipe, fit, take, events or tell, and howto()
   named none of them either. So the newest and most useful half of the
   app — writing parts, producing while somebody plays, slots with a
   measurable brief — was reachable from 73 tools and discoverable from
   nothing. AGENTS.md's own rule is to check whether the thing you want
   already exists and has simply never been reached for; an agent cannot
   check what it was never told.

   This asserts the chain rather than the tools. Each call has to be
   NAMED in the handshake instructions or in howto(), or carry a stated
   reason for being too small to mention. Adding a name to EXEMPT is a
   decision; leaving a call out of both is an oversight, and that is the
   distinction this exists to force. */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leg = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');
const mcp = readFileSync(resolve(ROOT, 'mcp', 'server.mjs'), 'utf8');

/* every call an MCP tool actually forwards to — the set an agent can
   reach, which is the set it should be able to find */
const reachable = [...new Set([...mcp.matchAll(/jbh\('([a-zA-Z0-9_]+)'/g)].map(m => m[1]))];

/* the two places an agent reads before it starts */
const instructions = (mcp.match(/const INSTRUCTIONS\s*=\s*([\s\S]*?);\n/) || [])[1] || '';
const hi = leg.indexOf('  howto(){');
const howtoEnd = leg.indexOf('\n  },', hi);
const howto = hi > 0 ? leg.slice(hi, howtoEnd) : '';

/* Too small to earn a line in a document a person pays for by the
   token. Each is either plumbing, or named inline by the call that
   needs it. */
const EXEMPT = {
  state: 'plumbing: every call returns it',
  batch: 'plumbing: a list of other calls',
  nearest: 'a helper inside note(); never the thing you set out to do',
  readBack: 'plumbing: what a write returns',
  presets: 'listed by preset() and by the tool description',
  preset: 'named by the order section as how a sound arrives',
  packs: 'listed by pack()',
  layer: 'part of instrument(); velocity layers are described there',
  lane: 'part of the TRAX section rather than a call you reach for',
  vsDry: 'a comparison inside audit(); not a starting point',
  figure: 'internal to infill()’s rhythm choice',
  checkMix: 'an alias for the mix half of review()',
  save: 'session plumbing',
  load: 'session plumbing',
  saveSession: 'session plumbing',
  loadSession: 'session plumbing',
  clear: 'session plumbing',
  set: 'plumbing: tempo and swing, named wherever they matter',
  hit: 'live playing, named in the live section',
  stop: 'transport plumbing',
  play: 'transport plumbing',
  ping: 'refreshes peers(); peers is the question, this is the plumbing',
  listen: 'the link toggle; named by the agent-link section it belongs to',
  peers: 'named beside tell() where it is relevant',
  messages: 'named beside tell()',
  progression: 'reads back what chords() set',
  instPads: 'plumbing: which pads carry a tag',
  howto: 'this is the document',
  review: 'named everywhere, including the instructions',
};

test('EVERY REACHABLE CALL IS NAMED WHERE AN AGENT WILL READ IT', () => {
  const named = (n) => new RegExp('\\b' + n + '\\b').test(instructions)
    || new RegExp('\\b' + n + '\\b').test(howto);
  assert.ok(instructions.length > 500, 'could not read the handshake instructions');
  assert.ok(howto.length > 2000, 'could not read howto(), got ' + howto.length + ' chars');

  const hidden = reachable.filter(n => !named(n) && !EXEMPT[n]);
  assert.deepEqual(hidden, [],
    hidden.length + ' call(s) an agent can use and will never hear about:\n  '
    + hidden.join('\n  ')
    + '\nName each in the handshake instructions or in howto(), or add it to '
    + 'EXEMPT with the reason it is too small to mention.');
});

test('and the headline capabilities are named, not merely not-missing', () => {
  /* EXEMPT is an escape hatch, so the calls that matter most are
     asserted positively: a future edit that moved one into EXEMPT
     rather than documenting it would otherwise pass. */
  const must = ['infill', 'ensemble', 'recipe', 'fit', 'take', 'events', 'tell',
    'timbre', 'key', 'chords', 'place', 'pulse', 'harmony', 'render'];
  const missing = must.filter(n => !(new RegExp('\\b' + n + '\\b').test(instructions)
    || new RegExp('\\b' + n + '\\b').test(howto)));
  assert.deepEqual(missing, [],
    'these are the reasons somebody would use this app and they are not '
    + 'mentioned in the handshake or in howto(): ' + missing.join(', '));
});
