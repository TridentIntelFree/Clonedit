/* THE MCP SERVER HAS TO ACTUALLY START.

   `tests/mcp-coverage.test.mjs` reads `mcp/server.mjs` with readFileSync
   and checks its text — every tool present, every forwarded option real.
   That is a good check and it has caught real drift. What it cannot see
   is whether the file RUNS, because it never imports it.

   So it did not: `@modelcontextprotocol/sdk` was in neither
   `dependencies` nor `devDependencies` and was not installed, which
   means the very first line of the server threw MODULE_NOT_FOUND and
   the handshake this repo documents had never once happened. A whole
   suite named after the server, green, over a server that could not
   boot — the same shape as `offline.test.mjs` asserting the instrument
   keeps playing while the app could not open.

   This spawns it for real over stdio and completes the handshake. The
   browser is booted lazily on the first tool CALL, so initialize and
   tools/list cost nothing but a node process. */

import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SERVER = resolve(ROOT, 'mcp', 'server.mjs');

/* Skipped rather than failed when the SDK is genuinely absent, so a
   fresh checkout that has not run `npm install` yet does not report a
   fault in the server. The absence is itself asserted below. */
const haveSdk = existsSync(resolve(ROOT, 'node_modules', '@modelcontextprotocol', 'sdk'));

test('the SDK the server imports is declared as a dependency', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const imports = readFileSync(SERVER, 'utf8')
    /* ESCAPED, rather than a literal apostrophe, and that is not
       fussiness. scripts/lint-comments.mjs scans for a quote character
       and then skips to the matching one, so a REGEX carrying an ODD
       NUMBER of quote characters leaves its scanner inside a string for
       the rest of the file. The import-matching pattern below had three
       before this comment was written. The scanner then walks past the
       next comment opener without opening a comment, an apostrophe in
       that comment caused the stale string to end, and the comment
       CLOSER was reported as "a comment was closed that was never
       opened" — in a comment that is perfectly well formed, a hundred
       lines from the cause. Two of those were reported here, and the
       first thing I tried was rewording the prose, which is treating
       the symptom.

       Writing the closing marker into this comment to explain it then
       ENDED the comment and turned the rest of the prose into code,
       which is the fault the linter exists to catch, committed inside
       the fix for the linter. It is described rather than quoted now. */
    .match(/^import .*?from \x27([^\x27]+)\x27/gm)
    .map(l => l.match(/from \x27([^\x27]+)\x27/)[1])
    .filter(m => !m.startsWith('node:') && !m.startsWith('.'));
  for (const m of new Set(imports)) {
    /* subpath imports resolve against the package root */
    const base = m.startsWith('@') ? m.split('/').slice(0, 2).join('/') : m.split('/')[0];
    assert.ok(declared[base],
      'mcp/server.mjs imports "' + m + '" and package.json declares no "' + base + '"');
  }
});

test('it completes a handshake and lists its tools', { skip: !haveSdk }, async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER], cwd: ROOT,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'handshake-test', version: '1' });
  try {
    await client.connect(transport);

    const info = client.getServerVersion();
    assert.equal(info.name, 'jbh88', 'server name');
    /* THE VERSION HAS TO SAY WHICH APP. It read a frozen '1.0.0' while
       the app was on R255, which is information a client cannot use and
       cannot notice is wrong. */
    assert.ok(/^JBH-88 · R\d+/.test(info.version),
      'version should name the app build it is driving, got ' + JSON.stringify(info.version));

    /* AND THE HANDSHAKE HAS TO CARRY THE INSTRUCTIONS. The tool list
       cannot do this job: jbh_howto's description has said "START HERE"
       from the beginning and nothing made anyone start there. */
    const ins = client.getInstructions();
    assert.ok(ins && ins.length > 400, 'instructions should be present, got ' + (ins || '').length);
    for (const must of [/jbh_howto/, /select *: *true/i, /quick *: *true/i,
      /never infer|never inferred|not inferred|is never inferred/i]) {
      assert.ok(must.test(ins), 'instructions should mention ' + must);
    }

    const { tools } = await client.listTools();
    assert.ok(tools.length > 40, 'expected the full tool set, got ' + tools.length);
    const names = tools.map(t => t.name);
    for (const n of ['jbh_howto', 'jbh_review', 'jbh_infill', 'jbh_ensemble',
      'jbh_place', 'jbh_harmony', 'jbh_render', 'jbh_save_session']) {
      assert.ok(names.includes(n), 'missing tool ' + n);
    }
    /* every tool needs a description and a schema, or a client shows a
       bare name and a model has to guess what it takes */
    for (const t of tools) {
      assert.ok(t.description && t.description.length > 20, t.name + ' has no real description');
      assert.ok(t.inputSchema && t.inputSchema.type === 'object', t.name + ' has no input schema');
    }
  } finally {
    try { await client.close(); } catch (e) {}
    try { await transport.close(); } catch (e) {}
  }
});

/* EVERY CALL THE APP HAS MUST BE REACHABLE, OR SAID NOT TO BE.

   `jbh_ensemble` did not exist. The whole "write every layer at once"
   feature — the thing that was asked for in those words — had no tool,
   and neither did chop, bass, instPads, phrase or checkMix. Six calls,
   invisible to any agent.

   mcp-coverage.test.mjs could not catch that: it checks the options of
   the tools that DO exist. Nothing compared the tool list against the
   app's own API, so a call added to window.MVX simply never appeared.

   Driven off the DISPATCH rather than tool names, because the mapping is
   not derivable from the name — jbh_load_preset calls preset(),
   jbh_inst_pads calls instPads() — and a name-matching version of this
   check reported ten false gaps. `jbh('<method>'` is exact.

   jbh_call can reach anything by name, so nothing here is strictly
   unreachable. That is not the point: a tool is what makes a call
   DISCOVERABLE and gives it a schema, and a headline feature behind an
   escape hatch is a headline feature nobody finds. */
test('every app call has a tool, or is listed as deliberately not exposed', async () => {
  const { readFileSync } = await import('node:fs');
  const leg = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');
  const a = leg.indexOf('window.MVX={'), b = leg.indexOf('window.JBH=window.MVX;');
  assert.ok(a > 0 && b > a, 'could not find the API object');
  /* THE API IS NOT ONLY THE OBJECT LITERAL, and taking it to be one hid
     a whole feature.

     Methods added later as `window.MVX.name = function` sit after the
     `window.JBH=window.MVX;` line, outside this slice. There are ten of
     them, and this test saw none: say, tell, messages, events, peers,
     listen, ping and the rest. So the entire conversational surface of
     the app — the thing that lets a person and an agent talk to each
     other — could be reachable from the browser console and reachable
     from no tool at all, while the suite that exists to catch exactly
     that stayed green.

     It is the same blind spot as the one below, where an option read
     one layer down in src/pure was invisible: a parser that is wrong
     about where the thing it is checking ENDS reports faults that are
     its own, and worse, reports none. */
  const api = [...new Set([
    ...[...leg.slice(a, b)
      .matchAll(/^ {2}(?:async +)?([a-zA-Z][a-zA-Z0-9_]*)\s*[(:]/gm)].map(m => m[1]),
    ...[...leg.matchAll(/^window\.MVX\.([a-zA-Z][a-zA-Z0-9_]*)\s*=/gm)].map(m => m[1]),
  ])];
  assert.ok(api.length > 50, 'expected the whole API, parsed ' + api.length);
  /* the later assignments must actually be in there, or this widening
     silently did nothing and we are back where we started */
  for (const late of ['tell', 'messages', 'events', 'take']) {
    assert.ok(api.includes(late),
      'the parser is still missing window.MVX.' + late + ' — widen it, do not '
      + 'add it to API_ONLY');
  }

  const mcp = readFileSync(SERVER, 'utf8');
  const reachable = new Set([...mcp.matchAll(/jbh\('([a-zA-Z0-9_]+)'/g)].map(m => m[1]));

  /* Deliberate omissions, each with the reason it is one. Adding a name
     here is a decision; leaving one out is an oversight, and that is the
     distinction this test exists to force. */
  const API_ONLY = {
    attack: 'a held note needs a matching release; one-shot over a tool call is not playing',
    release: 'the other half of attack',
    bowAttack: 'same — a bowed note is held, not triggered',
    sounds: 'returned by jbh_pack already, which is where an agent is looking',
    load: 'the older one-way song-document flow; jbh_save_session / jbh_load_session is the live path',
    /* The five the widened parser exposed. Each is a decision, and the
       first one is the only interesting one. */
    say: 'this is the PERSON speaking to the agent, and it writes into their '
      + 'own transcript as "you". An agent calling it would be putting words in '
      + 'their mouth in their own UI. jbh_tell is the agent\x27s half; this half '
      + 'is deliberately theirs alone',
    calls: 'returns the list of available calls, which an MCP client already has '
      + 'as its tool list and in more detail',
    sessionFile: 'the file-based save; jbh_save_session is the live path and does '
      + 'not make the person handle a download',
    loadFile: 'the other half of sessionFile, and it needs a File object, which '
      + 'cannot cross a JSON boundary',
  };
  const missing = api.filter(n => !reachable.has(n) && !API_ONLY[n]);
  assert.deepEqual(missing, [],
    'these app calls have no MCP tool and no stated reason: ' + missing.join(', ')
    + ' — add a tool, or add it to API_ONLY with why');

  /* and the allowlist must not rot: a name listed as unexposed that has
     since been exposed is a stale reason nobody will reread */
  const stale = Object.keys(API_ONLY).filter(n => reachable.has(n));
  assert.deepEqual(stale, [], 'API_ONLY lists calls that DO have a tool now: ' + stale.join(', '));
  const gone = Object.keys(API_ONLY).filter(n => !api.includes(n));
  assert.deepEqual(gone, [], 'API_ONLY lists calls the app no longer has: ' + gone.join(', '));
});

/* AND EVERY OPTION THE FUNCTION READS MUST BE REACHABLE.

   mcp-coverage checks one direction: no forwarded name that the function
   does not read. Nothing checked the other, and seventeen tools could
   not reach everything their function takes. The worst was jbh_review,
   which forwarded two of eight and so left out `quick` — the option that
   turns a twenty-minute render into an instant read of the schedule, and
   the thing AGENTS.md tells you to run after every pattern. An agent
   that cannot ask for the cheap review checks once at the end, which is
   the precise failure that document exists to prevent.

   The schema matters as much as the forward: a client validates against
   it, and an option with no property is one a model never learns about.
   Both are asserted.

   `o.` reads catch any local named `o`, so false positives are real:
   packs() maps over DOM options (`o.value`, `o.textContent`) and
   spectrum() names `o.pad` and `o.only` ONLY to refuse them. Those go in
   NOT_AN_OPTION with the reason. */
test('every option a function reads is reachable through its tool', async () => {
  const { readFileSync } = await import('node:fs');
  const leg = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');
  const a = leg.indexOf('window.MVX={'), b = leg.indexOf('window.JBH=window.MVX;');
  const API = leg.slice(a, b);
  const starts = [...API.matchAll(/^ {2}(?:async +)?([a-zA-Z][a-zA-Z0-9_]*)\s*\(/gm)]
    .map(m => [m[1], m.index]);
  const reads = {};
  starts.forEach(([name, pos], i) => {
    const end = i + 1 < starts.length ? starts[i + 1][1] : API.length;
    reads[name] = new Set([...API.slice(pos, end).matchAll(/\bo\.([a-zA-Z][a-zA-Z0-9_]*)/g)]
      .map(m => m[1]));
  });

  /* AN OPTION CAN BE READ ONE LAYER DOWN, and scanning only legacy.js is
     blind to every one of them.

     `recipe()` hands its whole options object to `makeRecipe(seed, o)` in
     src/pure/recipes.js, so every option THAT function reads is a
     recipe() option — and none of them appear as `o.` in legacy.js. This
     check was therefore blind to family, bpm, feel, density and style
     alike; it passed while `style` was reachable from the browser
     console and unreachable over MCP, which is precisely the gap the
     whole test exists to close. Found by adding `style` and noticing
     the suite stayed green.

     So: where an API method passes its options object wholesale into a
     function exported from src/pure, that function's reads count as the
     method's. Matched on the object being passed as a bare argument,
     since that is what makes them the same options. */
  const pureSrc = [];
  {
    const { readdirSync } = await import('node:fs');
    const dir = resolve(ROOT, 'src', 'pure');
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.js')) pureSrc.push(readFileSync(resolve(dir, f), 'utf8'));
    }
  }
  const pureReads = (fn) => {
    for (const src of pureSrc) {
      const re = new RegExp('export function ' + fn + '\\s*\\(', 'g');
      const m = re.exec(src);
      if (!m) continue;
      /* to the next top-level export, which is where the function ends
         for the purposes of a text scan */
      const from = m.index;
      const nxt = src.indexOf('\nexport ', from + 10);
      const body = src.slice(from, nxt > 0 ? nxt : src.length);
      return new Set([...body.matchAll(/\bo\.([a-zA-Z][a-zA-Z0-9_]*)/g)].map(x => x[1]));
    }
    return null;
  };
  starts.forEach(([name, pos], i) => {
    const end = i + 1 < starts.length ? starts[i + 1][1] : API.length;
    const body = API.slice(pos, end);
    for (const [, fn] of body.matchAll(/\b([a-zA-Z][a-zA-Z0-9_]*)\s*\([^()]*\bo\s*\)/g)) {
      const down = pureReads(fn);
      if (down) for (const k of down) reads[name].add(k);
    }
  });

  const NOT_AN_OPTION = {
    'packs.value': 'a .map(o => …) over DOM select options, not the options object',
    'packs.textContent': 'the same map',
    'spectrum.pad': 'named only to REFUSE a pad filter — it has no effect to expose',
    'spectrum.only': 'the same refusal',
    'spectrum.pads': 'the same refusal (forwarded anyway, so the refusal is reachable)',
    'mutate.onStep': 'a callback function; it cannot cross a JSON boundary',
    'render.wav': 'driven by wav_path, which also writes the file',
  };

  const mcp = readFileSync(SERVER, 'utf8');
  const cases = [...mcp.matchAll(
    /case \x27(jbh_[a-z_0-9]+)\x27:([\s\S]*?)(?=\n {6}case \x27|\n {6}default:)/g)];
  const bad = [];
  for (const [, tool, body] of cases) {
    const m = body.match(/jbh\(\x27([a-zA-Z0-9_]+)\x27/);
    if (!m) continue;
    const want = reads[m[1]];
    if (!want) continue;
    const fwd = new Set([...body.matchAll(/\ba\.([a-zA-Z][a-zA-Z0-9_]*)/g)].map(x => x[1]));
    /* The tool's own schema, cut at the NEXT tool rather than at a
       closing-brace sequence: a nested object (ensemble's `voices`,
       paint's `partials`) closes with the same `} } },` and truncated
       the slice, which reported seventeen declared options as missing.
       A parser that is wrong about where a thing ends reports faults
       that are its own. */
    const at = mcp.indexOf("{ name: '" + tool + "'");
    const nxt = mcp.indexOf("{ name: 'jbh_", at + 10);
    const schema = mcp.slice(at, nxt > 0 ? nxt : mcp.length);
    for (const opt of [...want].sort()) {
      if (NOT_AN_OPTION[m[1] + '.' + opt]) continue;
      if (!fwd.has(opt)) bad.push(tool + ' does not forward ' + m[1] + '() option "' + opt + '"');
      else if (!new RegExp('\\b' + opt + ' *:').test(schema))
        bad.push(tool + ' forwards "' + opt + '" but its schema never declares it');
    }
  }
  assert.deepEqual(bad, [], bad.length + ' gap(s):\n  ' + bad.join('\n  '));
});
