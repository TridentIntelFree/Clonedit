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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';

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
function findBrowser() {
  for (const p of [process.env.CHROME_PATH, '/opt/pw-browsers/chromium',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (p && existsSync(p)) return p;
  }
  return null;          // let playwright use its own download if it has one
}

let browser = null, page = null, booting = null;
async function app() {
  if (page) return page;
  if (booting) return booting;
  booting = (async () => {
    const exe = findBrowser();
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const ctx = await browser.newContext();
    /* The first-run tour would sit over everything and the install nudge
       steals a tap; neither means anything to a program. */
    await ctx.addInitScript(() => {
      try { localStorage.setItem('jbh_tour_v1', 'done'); } catch (e) {}
    });
    page = await ctx.newPage();
    await page.goto(pathToFileURL(findApp()).href);
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

const TOOLS = [
  { name: 'jbh_state', description:
      'What is loaded and what is playing: tempo, pattern, how many pads and tape lanes hold '
      + 'audio, how many hits are in the current pattern, the LIVE voice, and the audio context. '
      + 'Call this first, and after anything that should have changed something.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_presets', description:
      'Every sound the app can synthesise in the page — drums, bass, keys, strings, brass and '
      + 'experimental. No network and no files, so these always work. Returns id, category, name '
      + 'and the MIDI note each was designed at.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_load_preset', description:
      'Render one of the synthesised presets onto a pad. Pads are 0-63. Give a MIDI note to '
      + 'render it at a different pitch than its default.',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string', description: 'preset id from jbh_presets, e.g. "dkick"' },
      pad: { type: 'integer', description: 'pad index 0-63 (default: the selected pad)' },
      note: { type: 'integer', description: 'MIDI note to render at (default: the preset’s own)' } } } },

  { name: 'jbh_pack', description:
      'Fetch a downloadable sample pack manifest, then list what is in it. Needs a connection '
      + 'once; downloaded sounds are kept on the device afterwards. Omit the url for the pack '
      + 'the app is already pointed at.',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'manifest url, e.g. samples/vsco-real.json' } } } },

  { name: 'jbh_load_sound', description:
      'Download a sound from the loaded pack if it is not already stored, then put it on a pad. '
      + 'Run jbh_pack first so there is a pack to pick from.',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string', description: 'sound id from jbh_pack' },
      pad: { type: 'integer', description: 'pad index 0-63' } } } },

  { name: 'jbh_step', description:
      'Write one step of the current pattern. Velocity 0 turns it off. Locks give THAT STEP its '
      + 'own sound: pitch (semitones), prob (0-1), rat (ratchet 2-6), nudge (-0.5 to 0.5 of a '
      + 'step), and the sound locks fcut, gain, pan, rel, start. Pass locks:null to clear them.',
    inputSchema: { type: 'object', required: ['pad', 'step'], properties: {
      pad: { type: 'integer' }, step: { type: 'integer', description: '0-63' },
      vel: { type: 'number', description: '0-1; 0 turns the step off' },
      locks: { type: ['object', 'null'], description: 'e.g. {pitch:7, fcut:0.2}' } } } },

  { name: 'jbh_pad', description:
      'Read a pad, or write to it. With no props it returns everything the pad holds. Useful '
      + 'fields: gain, pan, pitch, fine, ftype ("off"/"lowpass"/"highpass"/"bandpass"), fcut, '
      + 'fres, att, dec, sus, rel, rev, dly, reverse, keepTime, choke, mute.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      pad: { type: 'integer' }, props: { type: 'object' } } } },

  { name: 'jbh_lane', description:
      'Read or write a tape lane (0-7). Fields include gain, pan, mute, loop, and the clip: '
      + 'start (seconds after bar 1), tin/tout (trim, 0-1), fin/fout (fades, seconds).',
    inputSchema: { type: 'object', required: ['lane'], properties: {
      lane: { type: 'integer' }, props: { type: 'object' } } } },

  { name: 'jbh_live', description:
      'Read or write the LIVE instrument. voice is one of glass, saw, ep, pluck, phase, pulse, '
      + 'cluster, organ, super, vowel, wind, bell, piano. shape is that engine’s own main '
      + 'parameter. Also cut, res, att, rel, and the effects drv, cho, pha, tre, room, rmSize, rmDamp.',
    inputSchema: { type: 'object', properties: { props: { type: 'object' } } } },

  { name: 'jbh_set', description:
      'Session-level settings by name: bpm, swing (0-0.6), human (0-1), masterVol, revSize, '
      + 'delayFb, and the rest of the top-level state.',
    inputSchema: { type: 'object', required: ['props'], properties: { props: { type: 'object' } } } },

  { name: 'jbh_transport', description:
      'Start or stop the sequencer. Mostly useful before jbh_hit, so a played pad lands against '
      + 'something. Note that nothing here is audible to a person — the audio is offline.',
    inputSchema: { type: 'object', required: ['action'], properties: {
      action: { type: 'string', enum: ['play', 'stop'] } } } },

  { name: 'jbh_hit', description:
      'Play a pad now, the way a finger does, with an optional pitch offset in semitones.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      pad: { type: 'integer' }, vel: { type: 'number' }, pitch: { type: 'integer' } } } },

  { name: 'jbh_render', description:
      'Bounce the pattern or the song and report what came out: length, peak, RMS, whether it '
      + 'clipped and whether it was silent. THIS IS HOW YOU CHECK YOUR OWN WORK — a part you '
      + 'cannot hear is the most common thing to get wrong. Give a path to also write a .wav.',
    inputSchema: { type: 'object', properties: {
      src: { type: 'string', enum: ['pat', 'song'], description: 'default pat' },
      loops: { type: 'integer', description: 'default 1' },
      wav_path: { type: 'string', description: 'write the audio here as a 16-bit WAV' } } } },

  { name: 'jbh_save_session', description:
      'Write the whole session to a .json file — every pad, pattern, lock, tape lane and setting, '
      + 'with the audio embedded. THIS IS HOW WORK REACHES A PERSON: they open it with LOAD .JSON '
      + 'in the PROJ tab and get exactly this, sounds and all.',
    inputSchema: { type: 'object', required: ['path'], properties: {
      path: { type: 'string' }, name: { type: 'string', description: 'project name to save under' } } } },

  { name: 'jbh_load_session', description:
      'Load a session .json that was saved earlier, so you can carry on from it or remix it.',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } },

  { name: 'jbh_song_doc', description:
      'Export the current work as a compact song document — the app’s portable text format. '
      + 'Smaller than a session and readable, but it only describes the first sixteen pads and '
      + 'carries no tape lanes or LIVE instrument. Prefer jbh_save_session unless you need text.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_call', description:
      'Escape hatch: call any window.JBH method by name with an array of arguments. Everything '
      + 'the app exposes is reachable this way, including anything added after these tools were '
      + 'written. Use jbh_call with method "calls" to list them.',
    inputSchema: { type: 'object', required: ['method'], properties: {
      method: { type: 'string' }, args: { type: 'array' } } } },
];

const server = new Server({ name: 'jbh88', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });

function outPath(p) {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return abs;
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const a = req.params.arguments || {};
  try {
    switch (req.params.name) {
      case 'jbh_state':       return ok(await jbh('state'));
      case 'jbh_presets':     return ok(await jbh('presets'));
      case 'jbh_load_preset': return ok(await jbh('preset', [a.id, a.pad, a.note]));
      case 'jbh_pack':        return ok(await jbh('pack', [a.url]));
      case 'jbh_load_sound':  return ok(await jbh('sound', [a.id, a.pad]));
      case 'jbh_step':        return ok(await jbh('step', [a.pad, a.step, a.vel == null ? 1 : a.vel,
                                        a.locks === undefined ? undefined : a.locks]));
      case 'jbh_pad':         return ok(await jbh('pad', [a.pad, a.props]));
      case 'jbh_lane':        return ok(await jbh('lane', [a.lane, a.props]));
      case 'jbh_live':        return ok(await jbh('live', [a.props]));
      case 'jbh_set':         return ok(await jbh('set', [a.props]));
      case 'jbh_transport':   return ok(await jbh(a.action === 'stop' ? 'stop' : 'play'));
      case 'jbh_hit':         return ok(await jbh('hit', [a.pad, a.vel, a.pitch]));
      case 'jbh_song_doc':    return ok(await jbh('export'));
      case 'jbh_call':        return ok(await jbh(a.method, a.args || []));

      case 'jbh_render': {
        const r = await jbh('render', [{ src: a.src || 'pat', loops: a.loops || 1,
          wav: !!a.wav_path }]);
        if (!r) return ok({ rendered: false, why: 'nothing to render — no pattern hits and no tape lanes' });
        if (a.wav_path && r.wavBase64) {
          const p = outPath(a.wav_path);
          writeFileSync(p, Buffer.from(r.wavBase64, 'base64'));
          delete r.wavBase64;
          r.wav_written = p;
        }
        return ok(r);
      }

      case 'jbh_save_session': {
        const p = await app();
        /* JBH.sessionFile() and the app's own SAVE PROJECT button are the same
           function. The first version of this used snapshotSession(), which
           holds the audio as ArrayBuffers for IndexedDB — JSON.stringify turns
           those into {} and the file came back structurally perfect and
           completely silent. */
        const doc = await p.evaluate((nm) => JBH.sessionFile(nm), a.name || null);
        const dest = outPath(a.path);
        writeFileSync(dest, JSON.stringify(doc));
        return ok({ saved: dest, name: doc.name,
          pads: (doc.pads || []).filter(x => x && x.bufId >= 0).length,
          note: 'Open it in the app with PROJ → LOAD .JSON.' });
      }

      case 'jbh_load_session': {
        const p = await app();
        const { readFileSync } = await import('node:fs');
        const doc = JSON.parse(readFileSync(outPath(a.path), 'utf8'));
        /* JBH.loadFile is the same path the app's LOAD .JSON button takes,
           base64 decoder and version gate included. Reaching past it to
           applySessionDoc + docToBuffers picked the decoder for the IndexedDB
           shape and restored a project with no audio in it. */
        const r = await p.evaluate(async (d) => {
          const st = window.JBH.loadFile(d);
          await new Promise(x => setTimeout(x, 600));
          return st || { refused: true };
        }, doc);
        return ok(r);
      }

      default:
        return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + req.params.name }] };
    }
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] };
  }
});

process.on('SIGINT', async () => { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });
process.on('SIGTERM', async () => { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });

await server.connect(new StdioServerTransport());
