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
import { dirname, resolve, isAbsolute } from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

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
    const { normalize, extname, basename } = await import('node:path');
    const { statSync } = await import('node:fs');
    const srv = createServer((req, res) => {
      /* the path is normalised and confined to the root: this serves a
         sample library, not the filesystem */
      let p;
      try { p = resolve(root, '.' + normalize(decodeURIComponent(req.url.split('?')[0]))); }
      catch (e) { res.writeHead(400); return res.end(); }
      if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) {
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
    const exe = findBrowser();
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const ctx = await browser.newContext();
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

const TOOLS = [
  { name: 'jbh_howto', description:
      'START HERE. Costs nothing, returns no audio, and leads with the four things that '
      + 'decide whether what you make is music rather than how cleanly it is mixed — '
      + 'because a track bounced from this app passed every mixing check it has (no '
      + 'silence, -16.2 LUFS, four bands inside half a decibel of its reference, every pad '
      + 'owning a band) and was heard as "drone machine noise". Its bass held one pitch '
      + 'throughout, and NOTHING HERE MEASURES WHETHER THE HARMONY MOVES. `first` covers '
      + 'that: write chords that change and a melody with contour (magenta is installed '
      + 'for it), give real instruments real samples with velocity layers, do not expect a '
      + 'processed door knock to be a kick, distrust a pack named "real", and remember '
      + 'that every check in this app detects brokenness and none of them can hear music. '
      + 'Then the rest: the order to work in, the traps that are not guessable from the '
      + 'API — a pack can lie about pitch by an octave, gain is a multiplier on whatever '
      + 'the pad holds, a beat can be dead on the grid and still inaudible — and the '
      + 'measured norms every check is scored against.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_review', description:
      'EVERY CHECK AT ONCE, AND IT SAYS WHICH ONES IT COULD NOT RUN. This is the one to run '
      + 'before a bounce. It calls critique, loudness, translate, pulse, motif, melody, '
      + 'continuity, counterpoint and dynamics, keeps going when one of them throws, sorts the '
      + 'findings by severity and reports its own coverage. It exists because a finished track '
      + 'was bounced using six of the seventeen analysers here, and the three that would have '
      + 'caught what the listener then complained about were among the eleven not run. Choosing '
      + 'which checks to run by hand is where results stop being repeatable.',
    inputSchema: { type: 'object', properties: {
      quick: { type: 'boolean', description:
        'THE ONE TO USE WHILE BUILDING. Runs only the checks that render nothing — pulse, '
        + 'melody, motif, counterpoint, harmony — so it is instant and can be called after '
        + 'every pattern. Without it this renders audio per pad and takes about twenty minutes.' },
      chords: { type: 'array', items: { type: 'string' },
        description: 'check against a progression you have not committed to with jbh_chords' },
      maxPads: { type: 'integer', description: 'cap the per-pad loudness pass (default 16)' },
      padSrc: { type: 'string', enum: ['pat', 'song'] },
      loudnessSrc: { type: 'string', enum: ['pat', 'song'] },
      beatsPerBar: { type: 'integer' },
      src: { type: 'string', enum: ['pat', 'song', 'chain', 'morph'] },
      instruments: { type: 'array', items: { type: 'string' } } } } },

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

  { name: 'jbh_poly', description:
      'A pad with its OWN BPM — polyrhythm, which the step grid genuinely cannot express. '
      + 'The pad\'s bpm counts ITS hits per minute, so against a project at 100: 300 is '
      + 'triplets, 500 is quintuplets, 75 is three hits per bar against four beats. cells is '
      + 'how long the figure runs before repeating. row is [[cell, vel, locks]…] and those '
      + 'per-cell locks are where a pitch goes — without them a figure can only repeat one '
      + 'note. trig "step" (default) means a lit grid step fires the figure; "free" runs it '
      + 'on its own clock. Call with no props to read.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      pad: { type: 'integer' }, props: { type: 'object' } } } },

  { name: 'jbh_pattern', description:
      'A pattern\'s own shape, which nothing else reaches. plen is its length (16/32/48/64 '
      + 'steps, 16 to the bar). len is {pad: steps} — a shorter track than the pattern is '
      + 'POLYMETER and phases against it. bpm is a per-pattern tempo (null follows the '
      + 'session). sil is the silencer row. Also copyFrom, clear and select. No props reads.',
    inputSchema: { type: 'object', properties: {
      pattern: { type: 'integer' }, props: { type: 'object' } } } },

  { name: 'jbh_euclid', description:
      'Spread N hits as evenly as possible over K steps — the distribution behind tresillo, '
      + 'son clave and most Afro-Latin and Balkan rhythm. Setting steps shorter than the '
      + 'pattern also shortens that track, so 5-in-7 under a 16-step part phases for bars.',
    inputSchema: { type: 'object', required: ['pad', 'hits'], properties: {
      pad: { type: 'integer' }, hits: { type: 'integer' }, steps: { type: 'integer' },
      rot: { type: 'integer' }, vel: { type: 'number' }, locks: { type: 'object' } } } },

  { name: 'jbh_instrument', description:
      'LAY A PLAYABLE INSTRUMENT ACROSS PADS. Picks every sampled root in the loaded pack '
      + 'matching `match` inside [lo,hi], thins them evenly to `max`, loads each onto its own '
      + 'pad and tags them. Returns the pads, the range, and worstBend — the furthest any note '
      + 'will ever be transposed with this layout, worth reading BEFORE writing the part.',
    inputSchema: { type: 'object', required: ['name'], properties: {
      rr: { type: 'integer', description:
        'round robins per note. Alternates are takes of the SAME dynamic, so a repeat is not '
        + 'the same waveform twice; velocity layers are a different thing, counted from the '
        + 'sample count.' },
      xfade: { type: 'number', description: 'crossfade between layers; false to disable' },
      relGain: { type: 'number', description: 'level of the release samples, where the pack has them' },
      name: { type: 'string' }, pack: { type: 'string' }, match: { type: 'string' },
      lo: { type: 'integer' }, hi: { type: 'integer' }, max: { type: 'integer' } } } },

  { name: 'jbh_packs', description:
      'The sample packs this build knows about, what a pack URL may point at, and what is '
      + 'currently loaded. jbh_pack accepts a .json manifest OR an .sfz — the format nearly '
      + 'every free library ships, which states which recording plays at which note, dynamic '
      + 'and alternate, and which are release samples.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_layer', description:
      'Stack another recording of the SAME note on a pad. With the pad in layMode "vel" the '
      + 'engine picks between them by how hard the step was struck, which is what a real '
      + 'sampled instrument does and what no filter imitates: a fortissimo note is a different '
      + 'event, not a brighter one. jbh_instrument does this for you when the pack carries '
      + 'dynamics.',
    inputSchema: { type: 'object', required: ['pad', 'id'], properties: {
      pad: { type: 'integer' }, id: { type: 'string' } } } },

  { name: 'jbh_note', description:
      'WRITE A NOTE OR A CHORD BY MIDI NUMBER, on an instrument laid out by jbh_instrument. '
      + 'Resolves the pad and the semitone offset itself, and notes landing on one pad at one '
      + 'step become a chord rather than overwriting each other. midi is a number or an array.',
    inputSchema: { type: 'object', required: ['name', 'midi', 'step'], properties: {
      name: { type: 'string' },
      midi: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }] },
      step: { type: 'integer' }, vel: { type: 'number' }, locks: { type: 'object' } } } },

  { name: 'jbh_figure', description:
      'A POLY FIGURE WRITTEN IN NOTES: {notes:[[cell, midi, vel]], bpm, cells, fire:[steps]}. '
      + 'Cells are grouped by register and each group gets a pad whose sample is near them, so '
      + 'a run spanning an octave is never one sample stretched an octave. Pads are reused '
      + 'across patterns.',
    inputSchema: { type: 'object', required: ['name', 'notes'], properties: {
      lock: { type: 'boolean', description: 'false writes plain steps instead of step locks' },
      name: { type: 'string' }, notes: { type: 'array', items: { type: 'array' } },
      bpm: { type: 'number' }, cells: { type: 'integer' },
      fire: { type: 'array', items: { type: 'integer' } },
      match: { type: 'string' }, maxBend: { type: 'integer' } } } },

  { name: 'jbh_schedule', description:
      'WHEN EVERY NOTE LANDS — the bounce\'s own event list, returned from the same loop that '
      + 'builds the file: time, pad, pitch, MIDI note where the pad knows it, velocity. Use this '
      + 'instead of analysing the rendered WAV; the app already knows exactly, and an onset '
      + 'detector does not.',
    inputSchema: { type: 'object', properties: {
      stretchLimit: { type: 'number', description: 'flag a sample bent further than this many semitones (default 4)' },
      worstCase: { type: 'boolean' },
      src: { type: 'string', enum: ['pat', 'song', 'chain', 'morph'] },
      loops: { type: 'integer' }, full: { type: 'boolean' } } } },

  { name: 'jbh_automate', description:
      'A LINE THAT MOVES WHILE THE BAR PLAYS — crescendo, a filter opening across the pattern, '
      + 'a delay swelling into a gap. points are [[stepPosition, 0..1], …] and the value is '
      + 'NORMALISED, because every target has its own unit. Pass null to clear a lane. The '
      + 'result says whether that target is baked into the bounce or read live only.',
    inputSchema: { type: 'object', required: ['target'], properties: {
      target: { type: 'string' },
      points: { type: 'array', items: { type: 'array' } },
      pattern: { type: 'integer' } } } },

  { name: 'jbh_auto_targets', description:
      'What can be automated, what each is called, where it sits now, and whether it is baked '
      + 'into a bounce.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_levels', description:
      'A per-pad balance table in one call: peak, RMS, and dB relative to the full mix, plus a '
      + 'list of pads that are buried. One bounce per sounding pad underneath, so it is not '
      + 'cheap — but it is the difference between mixing and guessing.',
    inputSchema: { type: 'object', properties: {
      src: { type: 'string', enum: ['pat', 'song', 'chain', 'morph'] },
      loops: { type: 'integer' } } } },

  { name: 'jbh_nearest', description:
      'The sample in the loaded pack closest to a MIDI note, and how many semitones away it is. '
      + 'Pitch here is playback rate, so a piano moved a fifth stops sounding like a piano — '
      + 'load a root near every note instead of stretching one across an octave.',
    inputSchema: { type: 'object', required: ['note'], properties: {
      note: { type: 'integer' }, filter: { type: 'string' } } } },

  { name: 'jbh_batch', description:
      'Several calls in one crossing: [["step",0,4,1], ["pad",0,{"gain":0.8}], …]. Answers come '
      + 'back in order and a failure is reported in place rather than taking the batch down.',
    inputSchema: { type: 'object', required: ['calls'], properties: {
      calls: { type: 'array', items: { type: 'array' } } } } },

  { name: 'jbh_params', description:
      'EVERY writable field and what it is set to now, read off the live objects so it '
      + 'cannot drift: the session (reverb, delay, compressor, master chain, scale lock…), '
      + 'a pad (filter, drive, crush, EQ, LFO, envelopes, granular…), a tape lane, the LIVE '
      + 'instrument, the pattern and poly shapes, and the step-lock names. Call this before '
      + 'guessing a field name — everything here is reachable through jbh_set, jbh_pad, '
      + 'jbh_lane, jbh_live, jbh_pattern and jbh_poly.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_clear', description:
      'Start from an empty session. A freshly opened app holds a demo song, and any pad you '
      + 'do not overwrite stays loaded and is carried in every file you save.',
    inputSchema: { type: 'object', properties: {} } },

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
      + 'cannot hear is the most common thing to get wrong. Give a path to also write a .wav. '
      + '`only` renders just those pads, which is a STEM, the same length as the master. '
      + '`loudness` adds the terms a release is judged on: integrated LUFS, true peak in dBTP, '
      + 'crest, and how it sits against the -14 LUFS streaming target — peak and RMS cannot '
      + 'tell you a mix is loud but dead.',
    inputSchema: { type: 'object', properties: {
      depth: { type: 'integer', enum: [16, 24], description: 'bit depth of the WAV (default 16)' },
      noTail: { type: 'boolean', description: 'false lets reverb and delay ring out past the end' },
      src: { type: 'string', enum: ['pat', 'song', 'chain', 'morph'], description: 'default pat' },
      loops: { type: 'integer', description: 'default 1' },
      only: { type: 'array', items: { type: 'integer' }, description: 'pads to render alone — a stem' },
      loudness: { type: 'boolean' },
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

  { name: 'jbh_critique', description:
      'WHAT IS WRONG WITH THE MIX AS IT STANDS: settings outside their legal range, samples '
      + 'being pitch-shifted further than they survive, pads that are playing and cannot be '
      + 'heard, pads that own a band despite being quiet, and the distance from a loaded '
      + 'reference. jbh_review calls this; use it directly when you only want this part.',
    inputSchema: { type: 'object', properties: {
      balance: { type: 'boolean', description: 'set false to skip the group-balance pass' },
      loops: { type: 'integer' },
      maxBuried: { type: 'integer', description: 'how many buried pads to report (default 8)' }, src: { type: 'string' } } } },

  { name: 'jbh_loudness', description:
      'PERCEIVED LOUDNESS PER PAD, WHICH IS NOT ENERGY. Renders each pad alone and reports LUFS '
      + 'beside raw RMS; the gap between them is what matters. The ear is 10-15dB more '
      + 'sensitive around 3kHz than at 100Hz, so bright metal and high mallets read far louder '
      + 'than any RMS meter says — one marimba came back +22dB and a triangle +16dB above their '
      + 'own energy, which is exactly what "that is louder than I expected" means. One render '
      + 'per pad, so prefer src:"pat".',
    inputSchema: { type: 'object', properties: {
      max: { type: 'integer', description: 'stop after this many pads' },
      src: { type: 'string' }, loops: { type: 'integer' } } } },

  { name: 'jbh_translate', description:
      'WHAT SURVIVES A SMALL SPEAKER. Anything under about 400Hz is simply not reproduced on a '
      + 'phone, so energy living only in the sub is energy most listeners never hear. Reports '
      + 'the loss in dB and names the worst instrument. The fix it implies is always the same: '
      + 'a bass carries through its HARMONICS, so saturate a parallel copy into 150-800Hz and '
      + 'the ear reconstructs a fundamental the speaker cannot make.',
    inputSchema: { type: 'object', properties: {
      loops: { type: 'integer' }, src: { type: 'string' } } } },

  { name: 'jbh_pulse', description:
      'IS THERE A BEAT A LISTENER CAN FIND. Weighs every onset by how loud it actually is — '
      + 'velocity, pad gain AND the level of the sample the pad holds — then autocorrelates and '
      + 'reports what share of the audible weight lands on the bar, the beat, the eighth and '
      + 'the sixteenth. Being on the grid is not the same as being heard on the beat: a track '
      + 'can be 98% on the sixteenth grid with the metre buried under louder scattered parts.',
    inputSchema: { type: 'object', properties: { src: { type: 'string' } } } },

  { name: 'jbh_motif', description:
      'DOES THIS LINE EVER RESTATE ITSELF. Scored against 8196 Essen folk melodies as '
      + 'recurrence above the SAME intervals reshuffled, which controls for a line repeating by '
      + 'accident because it uses few pitches. A random walk scores about +7 and real melody '
      + 'about +28, rising to +51 for lines of 96 notes or more. melody() and counterpoint() '
      + 'both pass a random walk; this is the check that does not.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      n: { type: 'integer', description: 'motif length in notes (default 4)' },
      trials: { type: 'integer', description: 'reshuffles to score against (default 40)' },
      instrument: { type: 'string' }, src: { type: 'string' } } } },

  { name: 'jbh_melody', description:
      'THE SHAPE OF A LINE against real melody: how much of it repeats a pitch, steps, moves by '
      + 'a third, or leaps, and whether leaps are turned back from. Measured from the Essen '
      + 'Folksong Collection. A Bach subject will not match these and should not.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      instrument: { type: 'string' }, src: { type: 'string' } } } },

  { name: 'jbh_counterpoint', description:
      'HOW TWO OR MORE LINES MOVE AGAINST EACH OTHER, against 70 Palestrina scores: 68% of '
      + 'moves between a pair of real voices are oblique, one holding while the other goes. '
      + 'Parts written on the same grid positions read 0%. Catches parallel fifths and octaves '
      + 'too. Independence alone is not the goal — voices also need shared material, which is '
      + 'what jbh_motif measures.',
    inputSchema: { type: 'object', required: ['instruments'], properties: {
      instruments: { type: 'array', items: { type: 'string' } }, src: { type: 'string' } } } },

  { name: 'jbh_infill', description:
      'WRITE ONE VOICE INTO ONE SPAN OF BARS, AND OFFER ALTERNATIVES \u2014 not a generator. '
      + 'A model that hands over a finished piece overwhelms you with content and frustrates '
      + 'you with randomness; what helps is constraining generation to a particular voice over '
      + 'a particular span and offering several options to choose between. So this WRITES '
      + 'NOTHING by default. It returns candidates, each with the numbers it scores on and the '
      + 'seed that reproduces it exactly, and applying one is a second call naming that seed. '
      + 'It suggests; it does not apply, like jbh_balance. '
      + 'THE RHYTHM COMES FIRST: a musical figure is chosen per bar from a small library and '
      + 'the pitches are written into its slots, so every note has a real position and a real '
      + 'length. Generating pitches and dealing them onto invented step offsets is how a '
      + 'previous track here acquired an audible stumble. '
      + 'Everything is written against the DECLARED progression (jbh_chords) and checked before '
      + 'it is offered: no pitch a semitone above a chord tone, the third stated in each bar, '
      + 'the approach into the next bar chosen against both chords. Candidates are ranked by '
      + 'FAULT \u2014 minor ninths, then missing thirds, then distance from the Essen folk norms '
      + '\u2014 which is not the same as ranked by worth. Nothing here can hear them.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      instrument: { type: 'string' },
      from: { type: 'integer', description: 'first bar' },
      bars: { type: 'integer' },
      n: { type: 'integer', description: 'how many alternatives (default 4)' },
      role: { type: 'string', enum: ['bass', 'lead', 'pad', 'arp'] },
      lo: { type: 'integer' }, hi: { type: 'integer' },
      src: { type: 'string', enum: ['pat', 'song'] },
      seed: { type: 'integer' },
      /* SEVEN LEVERS WERE UNREACHABLE OVER MCP. infill() reads sixteen
         options and this schema forwarded nine, so density, octave,
         feel, gate, scale, shape and against existed, worked, and could
         not be set by an agent — including both levers added most
         recently. That is the trap AGENTS.md records in the other
         direction (a forwarded name the function does not read) and the
         coverage test only ever checked that direction. */
      density: { type: 'string', enum: ['sparse', 'normal', 'busy'] },
      octave: { type: 'integer', description: 'shift the register, in octaves' },
      feel: { type: 'string', description: "straight, or a cross-rhythm cycle: '3', '5', '6', '7', '9'" },
      gate: { type: 'number', description: 'scales note length; 0.25 clipped to 3 held' },
      scale: { type: 'string', description: "'penta' narrows the passing notes to five" },
      shape: { type: 'string', description: 'a contour to follow' },
      against: { type: 'array', description:
        'notes already sounding, as {midi, step, beats, inst} \u2014 switches on BOTH '
        + 'inter-voice filters: no semitone above a sounding voice, and no parallel '
        + 'fifths or octaves with it. Without it a voice is written as though it were '
        + 'alone in the pattern.',
        items: { type: 'object' } },
      apply: { type: 'integer', description: 'the seed of the candidate to write' } } } },

  /* THE WHOLE ARRANGEMENT AT ONCE, AND IT HAD NO TOOL AT ALL. ensemble()
     is the answer to "can write consider each layer of the sequence
     simultaneously"; it reads fourteen options and an agent over MCP
     could reach none of them. Found by a handshake test asserting the
     tool list, which is a check that did not exist because nothing had
     ever started this server. */
  { name: 'jbh_ensemble', description:
      'WRITE EVERY VOICE AT ONCE, EACH AGAINST THE OTHERS, and offer whole arrangements to '
      + 'choose between. jbh_infill stays one voice over one span because that constraint is '
      + 'what makes a suggestion usable; this does not throw it away — it writes the voices '
      + 'ONE AT A TIME, FOUNDATION FIRST, each knowing what the earlier ones already play. '
      + 'Order matters: the bass states the harmony so it goes first, and writing the lead '
      + 'first leaves the bass dodging a line that was not thinking about it. '
      + 'Two inter-voice rules are enforced rather than hoped for: no semitone between voices '
      + '(1.08% of Bach’s 179,005 sounding voice-pairs, the second rarest thing in the '
      + 'corpus) and no parallel fifths or octaves (0.235% and 0.111% in Palestrina, where '
      + 'generated parts measured ten to seventy times those rates before it was filtered). '
      + 'Oblique motion is SCORED and never forced. Like jbh_infill it writes nothing until '
      + 'you call again with `apply` set to a candidate seed — and an apply whose seed is '
      + 'not in the regenerated set is REFUSED rather than quietly substituted, because the '
      + 'nearest match is not the one that was chosen. '
      + 'A span past four bars does not fit one pattern; cut it into four-bar chunks yourself '
      + 'and write each into the next pattern along.',
    inputSchema: { type: 'object', required: ['voices'], properties: {
      voices: { type: 'array', description:
        'two or more, in any order — roles decide who goes first: '
        + '[{inst:"bass", role:"bass"}, {inst:"keys", role:"lead"}]',
        items: { type: 'object', properties: {
          inst: { type: 'string' },
          role: { type: 'string', enum: ['bass', 'lead', 'pad', 'arp'] } } } },
      from: { type: 'integer', description: 'first bar' },
      bars: { type: 'integer', description: 'at most 4 — one pattern holds four bars' },
      n: { type: 'integer', description: 'how many arrangements to offer' },
      src: { type: 'string', enum: ['pat', 'song'] },
      density: { type: 'string', enum: ['sparse', 'normal', 'busy'] },
      octave: { type: 'integer' },
      feel: { type: 'string', description: "straight, or '3', '5', '6', '7', '9'" },
      gate: { type: 'number', description: 'scales note length; 0.25 clipped to 3 held' },
      scale: { type: 'string', description: "'penta' narrows the passing notes" },
      shape: { type: 'string' },
      poly: { type: 'string', enum: ['none', 'spread', 'wide'], description:
        'cross-tempo lanes: each upper voice gets a lane at its own BPM while keeping the '
        + 'grid part written for it, so the timings conflict instead of replacing one another. '
        + 'The foundation never drifts — a sub that wanders off the beat takes the weight with it.' },
      converse: { type: 'boolean', description: 'voices answer each other rather than all playing through' },
      seed: { type: 'integer' },
      apply: { type: 'integer', description: 'the seed of the arrangement to write' } } } },

  { name: 'jbh_recipe', description:
      'LOAD A RECIPE AS SLOTS AND LEAVE THE PADS EMPTY. The other build call writes onto '
      + 'whatever pads are already loaded, so the recipe is shaped by the board; this is the '
      + 'other way round. The recipe says which slots it needs \u2014 low end here, a hat here, '
      + 'a synth here \u2014 the pads are created EMPTY under those names, and the sequencer '
      + 'plays the pattern whether or not anything is in them. Put a sound in a slot and that '
      + 'slot starts sounding; the pattern never changes, so one recipe plays on any kit. '
      + 'Seeded and composed rather than picked from a list: tempo, feel and density are drawn '
      + 'by FAMILY because they are correlated in real music, and it names itself after what it '
      + 'is rather than after a genre it has not earned. Each slot carries a BRIEF in measurable '
      + 'terms, so jbh_fit can tell you whether the sound you chose can do that job. '
      + 'The step patterns are composed, not measured, and every recipe says so.',
    inputSchema: { type: 'object', properties: {
      seed: { type: 'integer', description: 'reproduces a recipe you liked' },
      family: { type: 'string', enum: ['slow', 'midtempo', 'four', 'fast'] },
      bpm: { type: 'number' },
      feel: { type: 'string', description: "straight, or a cross-rhythm: '3', '5', '7'" },
      density: { type: 'string', enum: ['sparse', 'normal', 'busy'] } } } },

  { name: 'jbh_fit', description:
      'CAN THE SOUND IN THIS SLOT DO THE JOB. Measures whatever is in the pad now and checks '
      + 'it against the brief the recipe set, AT THE GAP that slot\u2019s notes sit at \u2014 the '
      + 'same sample can suit a pad slot and be inaudible in a hat slot, and only the gap tells '
      + 'them apart. It reports rather than refuses, because a brief gets broken on purpose; the '
      + 'one firm line is whether the sound can SPEAK at the rate it is played, which is '
      + 'brokenness rather than taste. On an empty slot it hands back the brief and the presets '
      + 'in the right family.',
    inputSchema: { type: 'object', required: ['slot'], properties: {
      slot: { description: 'the slot id or label, or its pad number' },
      bpm: { type: 'number' }, gap: { type: 'integer' } } } },

  { name: 'jbh_timbre', description:
      'WHAT A SOUND CAN ACTUALLY DO, before you write a part for it. The writing calls know '
      + 'an instrument\u2019s PITCH and nothing about its SOUND, so the same part gets written '
      + 'for a 90ms pluck and a two-second bowed swell. This measures the buffer the pad '
      + 'already holds \u2014 no render, no network \u2014 and reports how long it takes to SPEAK '
      + '(a note shorter than its own attack is not a quiet note, it is no note: at 174bpm a '
      + 'sixteenth is 86ms and a bowed string takes 150-300ms to arrive) and how long it RINGS '
      + '(which decides whether sixteen notes a bar overlap into mush, and is the same number '
      + 'the ringing-note problem turns on \u2014 a held note has to land in the chord it rings '
      + 'INTO). `minGap` is how many sixteenths apart the notes have to be for it to speak at '
      + 'all. Takes an instrument tag, a list of pads, or one pad.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      instrument: { description: 'an instrument tag, a pad number, or a list of pads' },
      bpm: { type: 'number', description: 'judge it at this tempo instead of the project\u2019s' },
      gap: { type: 'integer', description: 'sixteenths between notes to judge against' } } } },

  { name: 'jbh_inst_pads', description:
      'WHICH PADS AN INSTRUMENT SPANS. A sampled instrument is one sound laid across a pad '
      + 'per sampled note, and several calls need that list: jbh_place and jbh_audit take an '
      + 'instrument tag precisely because handing them the middle pad measured one note of a '
      + 'piano against the other ten notes of the same piano and reported it as absent. '
      + 'Returns [{pad, note}].',
    inputSchema: { type: 'object', required: ['instrument'],
      properties: { instrument: { type: 'string' } } } },

  /* THE OPTION NAMES BELOW ARE READ OFF THE FUNCTIONS, not guessed. The
     first draft of these three schemas invented `note`, `secs`, `to`,
     `mode` and `bars`, none of which any of them reads — the exact trap
     AGENTS.md records for jbh_resynth's `jumble`: a knob that looks
     settable, does nothing, and hides the ones that work. And the
     coverage test passed on all five, because its reverse check only
     walks the sound GENERATORS. */
  { name: 'jbh_bass', description:
      'MAKE A BASS, synthesised in the page, so it needs no pack and no connection. Styles are '
      + 'sub (a clean sine with just enough upper harmonic to carry on a small speaker, where '
      + 'nothing under about 400Hz is reproduced at all), reese, fm and pluck. Every style sets '
      + 'a lowpass with velocity routed to the cutoff, so a hard note comes out brighter and '
      + 'not merely louder — which on a single-sample pad is the only expression there is.',
    inputSchema: { type: 'object', properties: {
      pad: { type: 'integer' },
      style: { type: 'string', enum: ['sub', 'reese', 'fm', 'pluck'] },
      midi: { type: 'integer', description: 'the note it is sampled at' },
      fromMidi: { type: 'integer' },
      seconds: { type: 'number' },
      bright: { type: 'number' }, detune: { type: 'number' },
      fall: { type: 'number', description: 'pitch drop, in semitones' },
      wobbleHz: { type: 'number' },
      seed: { type: 'integer' } } } },

  { name: 'jbh_chop', description:
      'SLICE A PAD INTO N PIECES across the pads, which is how a break becomes playable '
      + 'material rather than one long sample. `floorDb` is what counts as silence between '
      + 'slices and `boredom` biases it away from reusing the same one.',
    inputSchema: { type: 'object', required: ['pad', 'n'], properties: {
      pad: { type: 'integer' }, n: { type: 'integer', description: 'how many slices' },
      floorDb: { type: 'number' }, boredom: { type: 'number' },
      window: { type: 'number' } } } },

  { name: 'jbh_phrase', description:
      'PHRASE A PART THAT IS ALREADY WRITTEN — shape its velocities and its timing across a '
      + 'span of steps, or put a swell through it. This is how a line stops sounding typed in: '
      + 'the notes are already there and what changes is how they are played. Takes an '
      + 'instrument tag or a pad number, the span, and a named shape or [[position, value], …].',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      instrument: { type: 'string', description: 'an instrument tag, or a pad number' },
      from: { type: 'integer', description: 'first step (default 0)' },
      to: { type: 'integer', description: 'last step (default the end of the pattern)' },
      vel: { description: 'a velocity shape: a name, or [[position, value], …]' },
      time: { description: 'a timing shape, same form — push and pull against the grid' },
      swell: { type: 'number' },
      only: { type: 'array', items: { type: 'integer' },
        description: 'restrict to these pads of the instrument' } } } },

  { name: 'jbh_check_mix', description:
      'THE MIX WARNINGS the app shows itself — clipping, a pad with nowhere to sit, a send '
      + 'turned up with nothing feeding it. Cheap: it reads state and renders nothing.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_key', description:
      'DECLARE THE KEY, or read it back. Until this existed the app stored no key anywhere and '
      + 'the harmony lived only in whatever the writer held in their head, which is why the '
      + 'checker had to be handed a progression as an argument and every song script kept a '
      + 'second copy of it that could drift from the first. Call with no arguments to read, '
      + 'with a tonic and mode to set, with null to clear. Declaring is half the value: a key '
      + 'you cannot write down is one you have not decided.',
    inputSchema: { type: 'object', properties: {
      tonic: { type: 'string', description: 'D, F#, Bb — omit to read back' },
      mode: { type: 'string', description: 'major, minor, dorian… default major' } } } },

  { name: 'jbh_chords', description:
      'WRITE THE PROGRESSION ONTO A PATTERN \u2014 one chord symbol per BAR of it, e.g. '
      + '["Bm7","Gmaj7","Dmaj7","A"] on a 64-step (4 bar) pattern. Per pattern rather than per '
      + 'song position, because a pattern is the reusable block here: carrying its own bars '
      + 'keeps it harmonically closed, so it can be dropped anywhere in the arrangement and '
      + 'still make sense, and the song\u2019s progression is then whatever its pattern order '
      + 'spells out. Chords written against absolute song bars would break the moment the '
      + 'arrangement changed. Omit the list to read a pattern back, omit everything to read all.',
    inputSchema: { type: 'object', properties: {
      pattern: { type: 'integer' },
      chords: { type: 'array', items: { type: 'string' } } } } },

  { name: 'jbh_progression', description:
      'THE DECLARED HARMONY, EXPANDED BAR BY BAR over the song or the current pattern. This is '
      + 'what jbh_harmony reads when it is not handed a list, and it is the thing that did not '
      + 'exist before: the actual chord sequence of the arrangement, derived from the song '
      + 'order rather than written out a second time beside it. Reports which patterns have no '
      + 'chords declared, because a half-declared harmony checked in the bars that have one and '
      + 'skipped in the bars that do not reads exactly like a harmony that passed. Free.',
    inputSchema: { type: 'object', properties: {
      src: { type: 'string', enum: ['pat', 'song'] } } } },

  { name: 'jbh_harmony', description:
      'DO THE NOTES FIT THE CHORDS. The one question the other melodic checks cannot ask: '
      + 'jbh_melody and jbh_motif measure a line against itself, jbh_counterpoint measures two '
      + 'lines against each other, and none of them knows what the chord is — so a part can '
      + 'score at the folk norm for contour and recurrence while sitting a semitone off the '
      + 'harmony in every bar. The progression is STORED now \u2014 declare it once with jbh_key and '
      + 'jbh_chords and this reads it; pass chords only for a one-off check against something you '
      + 'have not committed to. With nothing declared and nothing passed it refuses rather than '
      + 'guessing, because inferring the harmony from the notes is what makes a wrong note look '
      + 'correct. Reports three things. (1) '
      + 'MINOR NINTHS: a pitch sounding a semitone above a chord tone, which is the interval '
      + 'that actually beats and the reason the 4th is the avoid note over a major chord — not '
      + '"notes outside the chord", most good music is mostly non-chord tones. (2) FALSE '
      + 'RELATIONS: two voices a semitone apart at the same moment. (3) BARS WITH NO THIRD, '
      + 'where roots and fifths leave the chord quality unstated and a stray chromatic becomes '
      + 'the note defining it. It judges every chord a note is STILL RINGING IN, not just the '
      + 'one it started in, because a sampled piano decays across the bar line — but a held '
      + 'note is not a fault and must not be shortened, since that ring is what joins the bars: '
      + 'a carried note that belongs to the new chord is a common tone, one that steps onto a '
      + 'chord tone just after is a suspension and is not reported, and `carriedConsonant` '
      + 'counts the good ones. Free: reads the schedule, renders nothing.',
    inputSchema: { type: 'object', required: ['chords'], properties: {
      chords: { type: 'array', items: { type: 'string' }, description:
        'one chord per bar, cycled over the piece, e.g. ["Am","F","C","G"]. Known qualities: '
        + 'maj m 7 m7 maj7 m9 9 maj9 6 m6 dim dim7 aug sus2 sus4 m7b5 mmaj7. An unrecognised '
        + 'symbol throws rather than being skipped.' },
      beatsPerBar: { type: 'integer', description: 'default 4' },
      src: { type: 'string', enum: ['pat', 'song'] } } } },

  { name: 'jbh_continuity', description:
      'HOLES IN A PART THAT IS SUPPOSED TO BE HELD. A string bed written as one note a bar '
      + 'stops inside each bar and reads as play, cut, silence, play. Real voices rest about a '
      + 'quarter of the time, so what matters is the PHASE of the gaps, not their presence.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
      loops: { type: 'integer' },
      instrument: { type: 'string' }, src: { type: 'string' } } } },

  { name: 'jbh_dynamics', description:
      'WHETHER ANYTHING CHANGES ACROSS THE PIECE — loudness range, and whether sections differ '
      + 'from each other at all. A track that measures the same from end to end reads as flat '
      + 'however busy it is.',
    inputSchema: { type: 'object', properties: {} } },

  { name: 'jbh_spectrum', description:
      'THE NINE-BAND BALANCE of the mix, or of named pads alone, from one offline render. Use '
      + 'it to see where an instrument actually sits before deciding it needs EQ — a vibraphone '
      + 'struck with soft mallets is 80dB down above 8kHz and no filter will put air into it.',
    inputSchema: { type: 'object', properties: {
      from: { type: 'number', description: 'start of the window, in seconds' },
      seconds: { type: 'number', description: 'how much to measure (default 120)' },
      loops: { type: 'integer' }, noTail: { type: 'boolean' },
      src: { type: 'string' }, pads: { type: 'array', items: { type: 'integer' } } } } },

  { name: 'jbh_reference', description:
      'LOAD A FINISHED RECORDING TO BE JUDGED AGAINST. Do this BEFORE reviewing: without it, '
      + 'tonal balance is simply not checked and critique says so. Pass a URL the app can '
      + 'fetch, or null to clear.',
    inputSchema: { type: 'object', properties: {
      from: { type: 'number', description: 'skip into the file, in seconds' },
      seconds: { type: 'number', description: 'how much of it to measure (default 120)' }, url: { type: 'string' } } } },

  { name: 'jbh_compare', description:
      'THIS MIX AGAINST THE LOADED REFERENCE, band by band. Both sides are normalised against '
      + 'their OWN total, which is the only way two mixes are comparable — an absolute spectrum '
      + 'once showed a track fixed at the top while a 16dB hole sat at 500Hz.',
    inputSchema: { type: 'object', properties: {
      from: { type: 'number' }, seconds: { type: 'number' },
      loops: { type: 'integer' }, noTail: { type: 'boolean' }, src: { type: 'string' } } } },

  { name: 'jbh_vs_dry', description:
      'WHAT A PAD\'S OWN CHAIN DID TO IT. Renders the pad twice from the same notes, velocity '
      + 'layers and transposition — once as it stands and once with the filter, drive, crusher, '
      + 'EQ and sends bypassed. The only difference left is the processing, so whatever the '
      + 'answer shows is the processing. Use it when a sound is not sitting right and you want '
      + 'to know whether the pad or the part is at fault.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      loops: { type: 'integer' },
      pad: { type: 'integer' }, src: { type: 'string' } } } },

  { name: 'jbh_balance', description:
      'SOLVE THE GROUP LEVELS AGAINST A REFERENCE instead of guessing them. Renders each '
      + 'instrument group once, then fits gains so the mix lands on the reference\'s own band '
      + 'shape — after the renders it is arithmetic, so trying a thousand combinations costs '
      + 'nothing more. Five rounds of setting one track by ear each fixed one part of the '
      + 'spectrum and broke another; this put nine bands inside 1.7dB in a single pass. Needs '
      + 'jbh_reference loaded. Moves are capped (default 9dB) because an unconstrained fit does '
      + 'not balance a mix, it deletes from one — left alone it took an instrument down 49dB. '
      + 'A group pinned at the cap is reported: that means the part or the sound is wrong, not '
      + 'the level. It suggests, it does not apply.',
    inputSchema: { type: 'object', properties: {
      target: { type: 'array', items: { type: 'number' }, description:
        'nine band levels to solve against, instead of the loaded reference' },
      src: { type: 'string' }, maxMoveDb: { type: 'number' },
      groups: { type: 'array', items: { type: 'string' } } } } },

  { name: 'jbh_mutate', description:
      'MAKE VARIATIONS OF A SOUND, MEASURE THEM, KEEP THE ONE THAT WINS. Richard James described '
      + 'commissioning software that starts with a sound, analyses it, makes randomised '
      + 'variations and compares them against the original before picking the best; this is that, '
      + 'using the analysers already here as the fitness function. Randomising alone gives noise '
      + '— what makes it a tool is that every candidate is scored against the sound it came from. '
      + 'want: different (default), similar, brighter, darker, punchier, fuller. Costs '
      + 'population x generations renders of one pad. It restores the pad unless keep:true, so '
      + 'nothing is applied behind your back.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      loops: { type: 'integer' },
      toPad: { type: 'integer', description: 'write the winner to another pad and keep the original' },
      pad: { type: 'integer' },
      want: { type: 'string', enum: ['different', 'similar', 'brighter', 'darker', 'punchier', 'fuller'] },
      population: { type: 'integer' }, generations: { type: 'integer' },
      amount: { type: 'number' }, keep: { type: 'boolean' }, seed: { type: 'integer' },
      src: { type: 'string' }, knobs: { type: 'array', items: { type: 'string' } } } } },

  { name: 'jbh_paint', description:
      'DRAW A SOUND AS A SPECTRUM AND RESYNTHESISE IT, the way MetaSynth does — the program '
      + 'behind the face hidden in the spectrogram of Equation. An image IS a spectrogram: '
      + 'horizontal is time, vertical is frequency, brightness is level. Pass `rows` as a grid '
      + 'of 0..1 levels with the LOWEST frequency first, each row a partial and each column a '
      + 'moment; or `partials` for one tone at a time, which is how you build a bell with real '
      + 'inharmonic ratios. Frequency maps logarithmically by default — the detail that took '
      + 'people years to work out about that face, and the difference between a usable sound and '
      + 'everything crowded into the top octave. The result is a sample on a pad: pad it, chop '
      + 'it, mutate it like any other.',
    inputSchema: { type: 'object', properties: {
      pad: { type: 'integer' }, seconds: { type: 'number' },
      lo: { type: 'number' }, hi: { type: 'number' }, log: { type: 'boolean' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      partials: { type: 'array', items: { type: 'object' } },
      midi: { type: 'number' }, name: { type: 'string' }, seed: { type: 'integer' } } } },

  { name: 'jbh_resynth', description:
      'PLAY ONE SOUND USING THE PIECES OF ANOTHER — concatenative synthesis. Chops a corpus of '
      + 'pads (the brain) into short blocks, chops the target pad into blocks, and rebuilds the '
      + 'target by choosing whichever brain block sounds most like each moment of it. The result '
      + 'has the SHAPE of the target and the SUBSTANCE of the brain: a drum loop played in cello, '
      + 'a melody assembled from field recordings. Matching is on spectral shape with each block '
      + 'normalised against its own level, so a quiet corpus can stand in for a loud target and '
      + 'be scaled to fit. The idea is Samplebrain\'s — designed by Richard James, written by '
      + 'Dave Griffiths; this is an independent implementation of the published technique. '
      + 'Output is a sample on a pad like any other. '
      + 'MATCHING: bins (4-100 log-spaced spectral bands) and mfcc (0-1, blend in cepstral '
      + 'coefficients) set how finely two blocks are told apart — 8 bands cannot separate what '
      + '32 plus MFCC can, and that is the difference between a rebuild and a mush. binRange '
      + 'narrows it to a frequency subrange. ALGORITHM: basic searches everything; reversed '
      + 'takes the LEAST similar block; synaptic connects blocks into a similarity network and '
      + 'searches only the current block\'s neighbours, so the output wanders differently on '
      + 'each repetition of the target; slide does the same but holds a target block and plays '
      + 'on when nothing within slideError dB is in reach, which warps the timing. novelty '
      + 'biases against blocks already used, boredom sets how fast that bias decays, stickiness '
      + 'keeps a run of the source intact by taking whatever followed the last block when it is '
      + 'close enough. autotune bends the chosen block toward the target\'s pitch. stretch '
      + 'repeats each target block, which lengthens the output. blockMs and brainBlockMs are '
      + 'separate on purpose.',
    inputSchema: { type: 'object', required: ['target'], properties: {
      target: { type: 'integer' },
      brain: { type: 'array', items: { type: 'integer' } },
      pad: { type: 'integer' },
      blockMs: { type: 'number' }, brainBlockMs: { type: 'number' },
      overlap: { type: 'number' },
      window: { type: 'string', enum: ['hann', 'rect', 'dodgy'] },
      bins: { type: 'integer' }, mfcc: { type: 'number' },
      binRange: { type: 'array', items: { type: 'integer' } },
      match: { type: 'string', enum: ['shape', 'shape+level'] },
      algorithm: { type: 'string', enum: ['basic', 'reversed', 'synaptic', 'slide'] },
      synapses: { type: 'integer' }, slideError: { type: 'number' },
      novelty: { type: 'number' }, boredom: { type: 'number' },
      stickiness: { type: 'number' }, stretch: { type: 'integer' },
      autotune: { type: 'boolean' }, targetMix: { type: 'number' },
      stereo: { type: 'boolean' }, reversed: { type: 'boolean' },
      follow: { type: 'boolean' },
      name: { type: 'string' }, seed: { type: 'integer' } } } },

  { name: 'jbh_tape', description:
      'RUN A PAD TO TAPE — pitch that will not hold still. Everything this app makes is '
      + 'perfectly in tune for the whole length of a note, which never happened to any '
      + 'recording made on tape, and there is a humanDrift for timing with no equivalent for '
      + 'pitch. Three separate things, in cents: WOW is slow (under ~2Hz) and heard as the '
      + 'pitch sagging and recovering; FLUTTER is fast (5-15Hz) and heard as roughness rather '
      + 'than as pitch at all; DRIFT is neither periodic nor fast and never quite comes back. '
      + 'Saturation and the loss of the top octave come with it because they came with it on '
      + 'the machine. Defaults are small on purpose — real machines are subtle. Pass `pad` to '
      + 'write elsewhere; it replaces in place otherwise.',
    inputSchema: { type: 'object', required: ['from'], properties: {
      from: { type: 'integer' }, pad: { type: 'integer' },
      wow: { type: 'number' }, wowHz: { type: 'number' },
      flutter: { type: 'number' }, flutterHz: { type: 'number' },
      drift: { type: 'number' }, sat: { type: 'number' },
      hiLossHz: { type: 'number' }, hiss: { type: 'number' },
      name: { type: 'string' }, seed: { type: 'integer' } } } },

  { name: 'jbh_audit', description:
      'DID THE SOUND COME OUT THE WAY YOU MEANT IT TO. place() asks whether a sound has '
      + 'somewhere to sit among the others; this asks the earlier question — is the sound '
      + 'itself the colour you were trying to make. Renders the pad alone, takes its '
      + 'nine-band shape normalised against its own total, and sets it beside the shape you '
      + 'wanted, which can be a reference() already loaded or any {shape:[{band,rel}]} '
      + 'profile. It judges ONLY the bands the sound actually occupies — within 20dB of its '
      + 'own loudest — because a bass compared against a whole-mix target at 8-16kHz is '
      + 'being marked down for having no cymbals in it. One render of one pattern, so it is '
      + 'cheap enough to run on every sound as it is made, which is the only moment the '
      + 'answer is still cheap to act on. It measures a sound\'s COLOUR, not its '
      + 'CONTRIBUTION, and so predicts the finished mix only where that sound dominates the '
      + 'band: a bass audited at +8.4dB in 20-60Hz went on to measure +8.2dB in the bounce, '
      + 'while percussion audited at +29dB in 8-16k landed at -1.5dB because it sits 18dB '
      + 'down and contributes almost nothing. Read it next to place(), which says how the '
      + 'sound stands against the others; neither call answers the other\'s question.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      pad: { description: 'the sound to judge: an instrument tag from instrument(), a list '
        + 'of pads, or one pad index. A sampled instrument is one sound spread over a pad '
        + 'per note, so pass its name — judging one of those pads judges one note.',
        anyOf: [{ type: 'integer' }, { type: 'string' },
          { type: 'array', items: { type: 'integer' } }] },
      want: { type: 'object', description: 'target profile {shape:[{band,rel}]}; '
        + 'omit to use the loaded reference()' },
      src: { type: 'string', enum: ['pat', 'song'] },
      loops: { type: 'integer' } } } },

  { name: 'jbh_place', description:
      'DOES THIS ONE SOUND HAVE A PLACE, against everything already loaded. This is the '
      + 'check the one-sound-at-a-time method needs: you decided the song wanted a bass, you '
      + 'made the bass, and before you move on you want to know whether it actually sits '
      + 'anywhere. Two renders — the pad on its own, and everything else — then a band-by-band '
      + 'comparison. `owns` is the band it stands furthest above the rest in, which is its '
      + 'place; a sound whose best band is still 6dB under everything else owns nothing, and '
      + 'that is not a level problem — turning it up makes the mix louder without making room. '
      + 'Run it on every sound as it goes in, rather than discovering at the end that three '
      + 'things are fighting over 200-500Hz. Cheap enough to afford: two renders, not one per '
      + 'pad like critique(). PASS AN INSTRUMENT TAG for anything instrument() built: a '
      + 'sampled piano is one sound spread over a pad per sampled note, and placing one of '
      + 'those pads renders a single note and sets it against the other ten notes of the '
      + 'same piano — which reported a piano trio\'s melody as owning nothing, by -6.1dB, in '
      + 'a mix where the piano was the loudest thing in it.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
      pad: { description: 'the sound to judge: an instrument tag from instrument(), a list '
        + 'of pads, or one pad index',
        anyOf: [{ type: 'integer' }, { type: 'string' },
          { type: 'array', items: { type: 'integer' } }] },
      src: { type: 'string', enum: ['pat', 'song'], description: 'default pat' },
      loops: { type: 'integer' } } } },

  { name: 'jbh_freeze', description:
      'HOLD ONE MOMENT OF A SOUND for as long as you like. paint() can make anything provided '
      + 'you already know the partials you want, and usually you do not — but you have a sound '
      + 'whose colour is right for a fifth of a second and no way to keep it. This reads the '
      + 'spectrum at one instant, keeps the strongest partials and sustains them, so any '
      + 'one-shot becomes a pad: a door knock, a can, the moment a bell has stopped clanging '
      + 'and is only ringing. Nothing loops, because nothing is replayed — it is what that '
      + 'instant was made of, held still. `at` is how far through the source to look (0-1) and '
      + '`shimmer` gives each partial a few cents of its own drift, without which they sum to '
      + 'an organ.',
    inputSchema: { type: 'object', required: ['from'], properties: {
      from: { type: 'integer' }, pad: { type: 'integer' },
      at: { type: 'number' }, seconds: { type: 'number' },
      partials: { type: 'integer' }, shimmer: { type: 'number' },
      midi: { type: 'number' }, name: { type: 'string' }, seed: { type: 'integer' } } } },

  { name: 'jbh_call', description:
      'Escape hatch: call any window.JBH method by name with an array of arguments. Everything '
      + 'the app exposes is reachable this way, including anything added after these tools were '
      + 'written. Use jbh_call with method "calls" to list them.',
    inputSchema: { type: 'object', required: ['method'], properties: {
      method: { type: 'string' }, args: { type: 'array' } } } },
];

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
  'here is simulated, and nothing is audible to the user — work reaches them as a file',
  '(jbh_save_session writes a .json they open with PROJ, jbh_render writes a .wav).',
  'It cannot reach a copy of the app on their phone; there is no server in this project.',
  '',
  'Call jbh_howto first. It costs nothing and it is the order to work in.',
  '',
  'The things that cost the most when they were not known:',
  '1. Write MUSIC, not texture. Chords that change and a melody with contour. Nothing',
  '   here measures whether the harmony moves, so a well-mixed drone passes everything.',
  '2. ONE SOUND AT A TIME: make it, write its part, then jbh_place it against what is',
  '   already there — before starting the next. Placing everything blind and balancing',
  '   at the end is a problem you do not have to create.',
  '3. Declare the key and the progression (jbh_key, jbh_chords) or harmony is NOT',
  '   checked. It is never inferred from the notes, because inferring it is what makes',
  '   a wrong note look correct.',
  '4. jbh_pattern(n) configures a pattern; it does not select it unless you pass',
  '   select:true. Three tracks were bounced with every note piled into pattern 0.',
  '5. jbh_review({quick:true}) is free — it renders nothing — so run it after every',
  '   pattern rather than once at the end. The full review takes about twenty minutes.',
  '6. The checks detect BROKENNESS, not quality. Passing them all is not evidence that',
  '   anyone would want to hear it, and never move a musical parameter to improve a',
  '   number: every measure here is blind to whether the music is any good.',
].join('\n');

const server = new Server(
  { name: 'jbh88', version: appBuild() || '0.0.0-unknown' },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
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
      case 'jbh_poly':        return ok(await jbh('poly', [a.pad, a.props]));
      case 'jbh_pattern':     return ok(await jbh('pattern', [a.pattern, a.props]));
      case 'jbh_euclid':      return ok(await jbh('euclid', [a.pad, a.hits, a.steps, a.rot, a.vel, a.locks]));
      case 'jbh_params':      return ok(await jbh('params'));
      case 'jbh_instrument':  return ok(await jbh('instrument', [a.name, { pack: a.pack,
                                match: a.match, lo: a.lo, hi: a.hi, max: a.max,
                                rr: a.rr, xfade: a.xfade, relGain: a.relGain }]));
      case 'jbh_packs':       return ok(await jbh('packs'));
      case 'jbh_layer':       return ok(await jbh('layer', [a.pad, a.id]));
      case 'jbh_note':        return ok(await jbh('note', [a.name, a.midi, a.step, a.vel, a.locks]));
      case 'jbh_figure':      return ok(await jbh('figure', [a.name, { notes: a.notes, bpm: a.bpm, cells: a.cells, fire: a.fire, match: a.match, maxBend: a.maxBend, lock: a.lock }]));
      case 'jbh_schedule':    return ok(await jbh('schedule', [{ src: a.src, loops: a.loops,
                                full: a.full, stretchLimit: a.stretchLimit,
                                worstCase: a.worstCase }]));
      case 'jbh_levels':      return ok(await jbh('levels', [{ src: a.src, loops: a.loops }]));
      case 'jbh_automate':    return ok(await jbh('automate', [a.target, a.points === undefined ? null : a.points, { pattern: a.pattern }]));
      case 'jbh_auto_targets':return ok(await jbh('autoTargets'));
      case 'jbh_nearest':     return ok(await jbh('nearest', [a.note, a.filter]));
      case 'jbh_batch':       return ok(await jbh('batch', [a.calls]));
      case 'jbh_clear':       return ok(await jbh('clear'));
      case 'jbh_set':         return ok(await jbh('set', [a.props]));
      case 'jbh_transport':   return ok(await jbh(a.action === 'stop' ? 'stop' : 'play'));
      case 'jbh_hit':         return ok(await jbh('hit', [a.pad, a.vel, a.pitch]));
      case 'jbh_song_doc':    return ok(await jbh('export'));
      case 'jbh_howto':       return ok(await jbh('howto'));
      /* `quick` WAS NOT FORWARDED, and that one omission made the method
         this repo recommends impossible over MCP: review({quick:true})
         renders nothing and is meant to run after every pattern, while
         the full pass takes about twenty minutes. An agent that cannot
         ask for the cheap one checks once at the end, which is the exact
         failure AGENTS.md was written to prevent. */
      case 'jbh_review':      return ok(await jbh('review', [{ src: a.src || 'song',
                                instruments: a.instruments, quick: a.quick,
                                chords: a.chords, maxPads: a.maxPads,
                                padSrc: a.padSrc, loudnessSrc: a.loudnessSrc,
                                beatsPerBar: a.beatsPerBar }]));
      case 'jbh_critique':    return ok(await jbh('critique', [{ src: a.src,
                                balance: a.balance, loops: a.loops,
                                maxBuried: a.maxBuried }]));
      case 'jbh_loudness':    return ok(await jbh('loudness', [{ src: a.src, loops: a.loops, max: a.max }]));
      case 'jbh_translate':   return ok(await jbh('translate', [{ src: a.src, loops: a.loops }]));
      case 'jbh_pulse':       return ok(await jbh('pulse', [{ src: a.src }]));
      case 'jbh_infill':      return ok(await jbh('infill', [a.instrument, {
                                from: a.from, bars: a.bars, n: a.n, role: a.role,
                                lo: a.lo, hi: a.hi, src: a.src, seed: a.seed,
                                density: a.density, octave: a.octave, feel: a.feel,
                                gate: a.gate, scale: a.scale, shape: a.shape,
                                against: a.against,
                                apply: a.apply }]));
      case 'jbh_ensemble':    return ok(await jbh('ensemble', [a.voices, {
                                from: a.from, bars: a.bars, n: a.n, src: a.src,
                                density: a.density, octave: a.octave, feel: a.feel,
                                gate: a.gate, scale: a.scale, shape: a.shape,
                                poly: a.poly, converse: a.converse,
                                seed: a.seed, apply: a.apply }]));
      case 'jbh_recipe':      return ok(await jbh('recipe', [{ seed: a.seed,
                                family: a.family, bpm: a.bpm, feel: a.feel,
                                density: a.density }]));
      case 'jbh_fit':         return ok(await jbh('fit', [a.slot, { bpm: a.bpm, gap: a.gap }]));
      case 'jbh_timbre':      return ok(await jbh('timbre', [a.instrument,
                                { bpm: a.bpm, gap: a.gap }]));
      case 'jbh_inst_pads':   return ok(await jbh('instPads', [a.instrument]));
      case 'jbh_bass':        return ok(await jbh('bass', [{ pad: a.pad, style: a.style,
                                midi: a.midi, fromMidi: a.fromMidi, seconds: a.seconds,
                                bright: a.bright, detune: a.detune, fall: a.fall,
                                wobbleHz: a.wobbleHz, seed: a.seed }]));
      case 'jbh_chop':        return ok(await jbh('chop', [a.pad, a.n,
                                { floorDb: a.floorDb, boredom: a.boredom, window: a.window }]));
      case 'jbh_phrase':      return ok(await jbh('phrase', [a.instrument, a.from, a.to,
                                { vel: a.vel, time: a.time, swell: a.swell, only: a.only }]));
      case 'jbh_check_mix':   return ok(await jbh('checkMix', []));
      case 'jbh_key':         return ok(await jbh('key', a.tonic===undefined?[]:[a.tonic, a.mode]));
      case 'jbh_chords':      return ok(await jbh('chords',
                                a.pattern===undefined?[]:[a.pattern, a.chords]));
      case 'jbh_progression': return ok(await jbh('progression', [{ src: a.src }]));
      case 'jbh_harmony':     return ok(await jbh('harmony', [{ chords: a.chords,
                                beatsPerBar: a.beatsPerBar, src: a.src }]));
      case 'jbh_motif':       return ok(await jbh('motif', [a.instrument, { src: a.src, n: a.n, trials: a.trials }]));
      case 'jbh_melody':      return ok(await jbh('melody', [a.instrument, { src: a.src }]));
      case 'jbh_counterpoint':return ok(await jbh('counterpoint', [a.instruments, { src: a.src }]));
      case 'jbh_continuity':  return ok(await jbh('continuity', [a.instrument, { src: a.src, loops: a.loops }]));
      case 'jbh_dynamics':    return ok(await jbh('dynamics'));
      case 'jbh_spectrum':    return ok(await jbh('spectrum', [{ src: a.src, pads: a.pads,
                                from: a.from, seconds: a.seconds, loops: a.loops,
                                noTail: a.noTail }]));
      case 'jbh_reference':   return ok(await jbh('reference', [a.url === undefined ? null : a.url,
                                { from: a.from, seconds: a.seconds }]));
      case 'jbh_compare':     return ok(await jbh('compare', [{ src: a.src,
                                from: a.from, seconds: a.seconds, loops: a.loops,
                                noTail: a.noTail }]));
      case 'jbh_vs_dry':      return ok(await jbh('vsDry', [a.pad, { src: a.src, loops: a.loops }]));
      case 'jbh_balance':     return ok(await jbh('balance', [{ src: a.src,
                                maxMoveDb: a.maxMoveDb, groups: a.groups,
                                target: a.target }]));
      case 'jbh_mutate':      return ok(await jbh('mutate', [a.pad, { want: a.want,
                                population: a.population, generations: a.generations,
                                amount: a.amount, keep: a.keep, seed: a.seed,
                                src: a.src, knobs: a.knobs,
                                loops: a.loops, toPad: a.toPad }]));
      case 'jbh_paint':       return ok(await jbh('paint', [{ pad: a.pad, seconds: a.seconds,
                                lo: a.lo, hi: a.hi, log: a.log, rows: a.rows,
                                partials: a.partials, midi: a.midi, name: a.name, seed: a.seed }]));
      /* `jumble` was passed here for a long time and resynth() has no
         such option — it was replaced by novelty/boredom/stickiness and
         the MCP surface was never updated. So an agent working over MCP
         could set a parameter that did nothing and could not reach the
         seven that worked. mcp-coverage.test.mjs now checks every name
         passed from here against the options the function actually
         reads, which is the test that would have caught it. */
      case 'jbh_resynth':     return ok(await jbh('resynth', [{ target: a.target,
                                brain: a.brain, pad: a.pad,
                                blockMs: a.blockMs, brainBlockMs: a.brainBlockMs,
                                overlap: a.overlap, window: a.window,
                                bins: a.bins, mfcc: a.mfcc, binRange: a.binRange,
                                match: a.match, algorithm: a.algorithm,
                                synapses: a.synapses, slideError: a.slideError,
                                novelty: a.novelty, boredom: a.boredom,
                                stickiness: a.stickiness, stretch: a.stretch,
                                autotune: a.autotune, targetMix: a.targetMix,
                                stereo: a.stereo, reversed: a.reversed,
                                follow: a.follow, name: a.name, seed: a.seed }]));
      case 'jbh_tape':        return ok(await jbh('tape', [a.from, { pad: a.pad,
                                wow: a.wow, wowHz: a.wowHz, flutter: a.flutter,
                                flutterHz: a.flutterHz, drift: a.drift, sat: a.sat,
                                hiLossHz: a.hiLossHz, hiss: a.hiss, name: a.name, seed: a.seed }]));
      case 'jbh_audit':       return ok(await jbh('audit', [a.pad,
                                { want: a.want, src: a.src, loops: a.loops }]));
      case 'jbh_place':       return ok(await jbh('place', [a.pad,
                                { src: a.src, loops: a.loops }]));
      case 'jbh_freeze':      return ok(await jbh('freeze', [a.from, { pad: a.pad, at: a.at,
                                seconds: a.seconds, partials: a.partials, shimmer: a.shimmer,
                                midi: a.midi, name: a.name, seed: a.seed }]));
      case 'jbh_call':        return ok(await jbh(a.method, a.args || []));

      case 'jbh_render': {
        const r = await jbh('render', [{ src: a.src || 'pat', loops: a.loops || 1,
          only: a.only, loudness: !!a.loudness, wav: !!a.wav_path,
          depth: a.depth, noTail: a.noTail }]);
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

async function shutdown() {
  try { if (browser) await browser.close(); } catch (e) {}
  try { if (fileServer) fileServer.srv.close(); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
