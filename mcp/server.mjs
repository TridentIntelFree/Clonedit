#!/usr/bin/env node
/* JBH-88 as MCP tools.

   The app is one self-contained HTML file with no backend, and everything it
   can do is already reachable from inside the page as window.JBH. So this
   server is deliberately thin: it owns a headless browser with the app loaded
   and forwards calls into it. There is no second implementation of anything —
   if a tool here disagreed with the app, the app would be right.

   WHAT THIS IS FOR. An agent that can build in the real engine instead of
   guessing at JSON: load the actual sounds, write the actual steps, render the
   actual mix and READ THE LEVEL BACK. That last part is the one that matters.
   An agent composing blind cannot tell that the hats came out inaudible; one
   that can call render() and see peak 0.004 can fix it before you ever hear it.

   WHAT THIS IS NOT. It cannot reach a copy of the app open on your phone. The
   browser here is its own instance, in this process, and nothing you do in it
   is audible to anyone — the audio renders offline. The way work gets to you
   is a file: save_session writes a .json you load from PROJ, or render writes
   a .wav you can just listen to. Driving the instance in your hand, live, needs
   a relay between two machines and is a different piece of work. */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
/* The app, resolved in the order that makes the common cases work without
   configuration: an explicit path, the checkout this server lives in, then the
   working directory. */
function findApp() {
  const tries = [
    process.env.JBH_APP,
    resolve(HERE, '..', 'index.html'),
    resolve(process.cwd(), 'index.html'),
  ].filter(Boolean);
  for (const t of tries) if (existsSync(t)) return t;
  throw new Error('Cannot find index.html. Set JBH_APP to the built app, e.g. '
    + 'JBH_APP=/path/to/Clonedit/index.html');
}
/* THIS SERVER COULD NOT START ON A MAC OR ON WINDOWS.

   The list that used to be here was /opt/pw-browsers and three paths
   under /usr/bin, and this repo depends on `playwright-core`, which
   deliberately ships NO browser binaries. So on either of the two
   platforms most people have, with Chrome sitting right there installed,
   it found nothing, fell through to "let playwright use its own
   download", and there was none. The entire point of this server is to
   let somebody's AI drive the app in front of them, and it could not
   boot.

   scripts/lib/find-chrome.mjs answers it for all three, takes its
   platform as a parameter so the Windows and macOS branches are tested
   from here rather than hoped at, and returns CANDIDATES in the order to
   try: an explicit CHROME_PATH, then real paths for this platform, then
   Playwright's `chrome` and `msedge` channels, then its own download.
   The last two cannot be stat-ed, so they are tried by launching. */
async function launchBrowser() {
  const { chromeCandidates, noBrowserMessage, hasDisplay } =
    await import('../scripts/lib/find-chrome.mjs');
  /* VISIBLE BY DEFAULT, which is the other half of being friendly to a
     person on a desktop. This launched headless, so an agent drove a
     browser nobody could see -- fine in CI and exactly wrong for
     somebody sitting in front of the app, who can also click in the
     same window and take over. Headless is still the answer where there
     is no screen: this container has none, and a headful launch there
     fails outright. JBH_HEADLESS forces either way. */
  const want = process.env.JBH_HEADLESS;
  const headless = want === '1' || want === 'true' ? true
    : want === '0' || want === 'false' ? false
      : !hasDisplay();
  const tried = [];
  for (const c of chromeCandidates()) {
    if (c.executablePath && !existsSync(c.executablePath)) continue;
    const opts = { headless };
    if (c.executablePath) opts.executablePath = c.executablePath;
    if (c.channel) opts.channel = c.channel;
    /* A window somebody is meant to watch should not open at a default
       800x600 with the app's tabs wrapped. Only when it is visible --
       a headless size is the viewport's business. */
    if (!headless) opts.args = ['--window-size=1280,900'];
    try {
      const b = await chromium.launch(opts);
      return { browser: b, how: c.why, headless };
    } catch (e) {
      tried.push(c.why + ': ' + String(e && e.message || e).split('\n')[0]);
    }
  }
  throw new Error(noBrowserMessage() + ' Tried: ' + tried.join(' | '));
}

/* THE APP IS SERVED OVER HTTP, NOT OPENED AS A FILE, and that was a
   functional hole rather than a preference.

   This loaded `file:///.../index.html`, and Chromium blocks fetch() to a
   file:// URL. The app fetches its sample packs — the manifest and then
   each sound — so EVERY PACK WAS UNREACHABLE OVER MCP:

     jbh_pack -> pack did not load: file:///.../samples/salamander.json

   which took jbh_packs, jbh_instrument and jbh_load_sound with it. An
   agent connecting to this server could use the 31 synthesised presets
   and nothing else, including `nakeddrums` — the recorded kit AGENTS.md
   insists on for drums, loaded with instrument(). The documented
   recommendation could not be followed through the documented
   interface, and no test had ever started this server to find out.

   The browser suites have served the app over HTTP from the start; this
   is the same few lines. Rooted at the directory the app lives in, so
   `samples/` sits beside it exactly as it does when deployed, and bound
   to 127.0.0.1 so nothing outside this machine can reach it. 127.0.0.1
   is also a secure context, so the service worker registers and the
   offline behaviour matches the real thing. */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let fileServer = null;
async function appUrl() {
  const app = findApp();
  const root = dirname(app);
  if (!fileServer) {
    const { createServer } = await import('node:http');
    const { normalize, extname, basename, sep } = await import('node:path');
    const { statSync } = await import('node:fs');
    const srv = createServer((req, res) => {
      /* the path is normalised and confined to the root: this serves a
         sample library, not the filesystem */
      let p;
      try { p = resolve(root, '.' + normalize(decodeURIComponent(req.url.split('?')[0]))); }
      catch (e) { res.writeHead(400); return res.end(); }
      /* ROOT PLUS A SEPARATOR, not root as a prefix. `/home/me/Clonedit`
         is a prefix of `/home/me/Clonedit-private`, so a bare
         startsWith lets a sibling directory through -- on every
         platform, and the Windows case is worse because the separator
         differs. Confining to a directory means confining to its
         contents. */
      if ((p !== root && !p.startsWith(root + sep)) || !existsSync(p)
        || !statSync(p).isFile()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(readFileSync(p));
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    fileServer = { srv, port: srv.address().port, file: basename(app) };
  }
  return 'http://127.0.0.1:' + fileServer.port + '/' + fileServer.file;
}

let browser = null, page = null, booting = null;
async function app() {
  if (page) return page;
  if (booting) return booting;
  booting = (async () => {
    const got = await launchBrowser();
    browser = got.browser;
    /* Said on stderr rather than kept, because "I cannot see a window"
       is otherwise a mystery with no way in to it. */
    process.stderr.write('[jbh] browser: ' + got.how
      + (got.headless ? ' (headless \u2014 no display found)' : ' (visible)') + '\n');
    const ctx = await browser.newContext(got.headless ? {}
      : { viewport: null });   /* let the real window size drive it */
    /* The first-run tour would sit over everything and the install nudge
       steals a tap; neither means anything to a program. */
    await ctx.addInitScript(() => {
      try { localStorage.setItem('jbh_tour_v1', 'done'); } catch (e) {}
    });
    page = await ctx.newPage();
    await page.goto(await appUrl());
    await page.waitForFunction(() => typeof window.JBH !== 'undefined', null, { timeout: 30000 });
    /* Audio has to be started explicitly; a page nobody clicked has a
       suspended context and every render would come back silent. */
    await page.evaluate(async () => {
      ensureAudio();
      await new Promise(r => setTimeout(r, 400));
    });
    return page;
  })();
  return booting;
}

/* Every tool is this: hand a call to window.JBH and return what it said. */
async function jbh(method, args = []) {
  const p = await app();
  return p.evaluate(async ({ m, a }) => {
    const fn = window.JBH[m];
    if (typeof fn !== 'function') throw new Error('no such call: ' + m);
    const out = await fn.apply(window.JBH, a);
    /* Structured-clone cannot carry everything the app holds; JSON round-trip
       keeps the boundary honest about what actually crosses it. */
    return JSON.parse(JSON.stringify(out === undefined ? null : out));
  }, { m: method, a: args });
}

/* The tools, the music guidance and the tracks folder live in tools.mjs,
   shared with agent/jbh88-agent.mjs so the two servers cannot drift. */
import { TOOLS, GUIDANCE, dispatch, ok, makeTracks, tracksDir } from './tools.mjs';

/* THE VERSION OF THE APP THIS IS ACTUALLY DRIVING, not a constant nobody
   bumps. It read '1.0.0' while the app was on R255, which tells a client
   nothing and is wrong in a way that cannot be noticed. Parsed out of the
   built file, because that file IS the app. */
function appBuild() {
  try {
    const m = readFileSync(findApp(), 'utf8').match(/const BUILD *= *'([^']+)'/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

/* WHAT A CLIENT IS TOLD AT THE HANDSHAKE, which until now was nothing.

   `instructions` is part of the initialize result and is what a client
   puts in front of the model BEFORE its first call. The tool list alone
   cannot do that job: `jbh_howto`'s description has said "START HERE" all
   along and nothing made anyone start there, so an agent's first call was
   whatever looked most like the task — which is how a track got bounced
   with six of seventeen checks run.

   Kept short on purpose. These are the things that cost real work when
   they were not known, and every one of them is in AGENTS.md with the
   measurement behind it. */
const INSTRUCTIONS = [
  'JBH-88 is a complete groovebox driven in a real browser: these tools load actual',
  'sounds, write actual steps, render the actual mix and READ THE LEVEL BACK. Nothing',
  'here is simulated. THIS server runs its own copy of the app, so the person does not',
  'see or hear it — work reaches them as files: jbh_save_track writes an MP3, a WAV and',
  'a session .json into their tracks folder (' + tracksDir() + '), the only folder',
  'these tools can read or write. To drive the app the person has OPEN, live, they use',
  'agent/jbh88-agent.mjs instead.',
  '',
  GUIDANCE,
].join('\n');

const server = new Server(
  { name: 'jbh88', version: appBuild() || '0.0.0-unknown' },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

const tracks = makeTracks(tracksDir());

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const a = req.params.arguments || {};
  try {
    const r = await dispatch(req.params.name, a, { jbh, tracks });
    if (r !== undefined) return r;
    return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + req.params.name }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] };
  }
});

async function shutdown() {
  try { if (browser) await browser.close(); } catch (e) {}
  try { if (fileServer) fileServer.srv.close(); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
