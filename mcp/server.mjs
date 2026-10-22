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
  { name: 'jbh_howto', description:
      'START HERE. The order to do things in, the traps that are not guessable from the API, '
      + 'and the measured norms every check is scored against. Costs nothing and returns no '
      + 'audio. Read it before writing anything: the API will not tell you that a sample pack '
      + 'can lie about pitch by an octave, that gain is a multiplier on whatever the pad '
      + 'happens to hold, or that a beat can be perfectly on the grid and still inaudible.',
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
    inputSchema: { type: 'object', properties: { src: { type: 'string' } } } },

  { name: 'jbh_loudness', description:
      'PERCEIVED LOUDNESS PER PAD, WHICH IS NOT ENERGY. Renders each pad alone and reports LUFS '
      + 'beside raw RMS; the gap between them is what matters. The ear is 10-15dB more '
      + 'sensitive around 3kHz than at 100Hz, so bright metal and high mallets read far louder '
      + 'than any RMS meter says — one marimba came back +22dB and a triangle +16dB above their '
      + 'own energy, which is exactly what "that is louder than I expected" means. One render '
      + 'per pad, so prefer src:"pat".',
    inputSchema: { type: 'object', properties: {
      src: { type: 'string' }, loops: { type: 'integer' } } } },

  { name: 'jbh_translate', description:
      'WHAT SURVIVES A SMALL SPEAKER. Anything under about 400Hz is simply not reproduced on a '
      + 'phone, so energy living only in the sub is energy most listeners never hear. Reports '
      + 'the loss in dB and names the worst instrument. The fix it implies is always the same: '
      + 'a bass carries through its HARMONICS, so saturate a parallel copy into 150-800Hz and '
      + 'the ear reconstructs a fundamental the speaker cannot make.',
    inputSchema: { type: 'object', properties: { src: { type: 'string' } } } },

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

  { name: 'jbh_continuity', description:
      'HOLES IN A PART THAT IS SUPPOSED TO BE HELD. A string bed written as one note a bar '
      + 'stops inside each bar and reads as play, cut, silence, play. Real voices rest about a '
      + 'quarter of the time, so what matters is the PHASE of the gaps, not their presence.',
    inputSchema: { type: 'object', required: ['instrument'], properties: {
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
      src: { type: 'string' }, pads: { type: 'array', items: { type: 'integer' } } } } },

  { name: 'jbh_reference', description:
      'LOAD A FINISHED RECORDING TO BE JUDGED AGAINST. Do this BEFORE reviewing: without it, '
      + 'tonal balance is simply not checked and critique says so. Pass a URL the app can '
      + 'fetch, or null to clear.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },

  { name: 'jbh_compare', description:
      'THIS MIX AGAINST THE LOADED REFERENCE, band by band. Both sides are normalised against '
      + 'their OWN total, which is the only way two mixes are comparable — an absolute spectrum '
      + 'once showed a track fixed at the top while a 16dB hole sat at 500Hz.',
    inputSchema: { type: 'object', properties: { src: { type: 'string' } } } },

  { name: 'jbh_vs_dry', description:
      'WHAT A PAD\'S OWN CHAIN DID TO IT. Renders the pad twice from the same notes, velocity '
      + 'layers and transposition — once as it stands and once with the filter, drive, crusher, '
      + 'EQ and sends bypassed. The only difference left is the processing, so whatever the '
      + 'answer shows is the processing. Use it when a sound is not sitting right and you want '
      + 'to know whether the pad or the part is at fault.',
    inputSchema: { type: 'object', required: ['pad'], properties: {
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
      case 'jbh_poly':        return ok(await jbh('poly', [a.pad, a.props]));
      case 'jbh_pattern':     return ok(await jbh('pattern', [a.pattern, a.props]));
      case 'jbh_euclid':      return ok(await jbh('euclid', [a.pad, a.hits, a.steps, a.rot, a.vel, a.locks]));
      case 'jbh_params':      return ok(await jbh('params'));
      case 'jbh_instrument':  return ok(await jbh('instrument', [a.name, { pack: a.pack, match: a.match, lo: a.lo, hi: a.hi, max: a.max }]));
      case 'jbh_packs':       return ok(await jbh('packs'));
      case 'jbh_layer':       return ok(await jbh('layer', [a.pad, a.id]));
      case 'jbh_note':        return ok(await jbh('note', [a.name, a.midi, a.step, a.vel, a.locks]));
      case 'jbh_figure':      return ok(await jbh('figure', [a.name, { notes: a.notes, bpm: a.bpm, cells: a.cells, fire: a.fire, match: a.match, maxBend: a.maxBend }]));
      case 'jbh_schedule':    return ok(await jbh('schedule', [{ src: a.src, loops: a.loops, full: a.full }]));
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
      case 'jbh_review':      return ok(await jbh('review', [{ src: a.src || 'song',
                                instruments: a.instruments }]));
      case 'jbh_critique':    return ok(await jbh('critique', [{ src: a.src }]));
      case 'jbh_loudness':    return ok(await jbh('loudness', [{ src: a.src, loops: a.loops }]));
      case 'jbh_translate':   return ok(await jbh('translate', [{ src: a.src }]));
      case 'jbh_pulse':       return ok(await jbh('pulse', [{ src: a.src }]));
      case 'jbh_motif':       return ok(await jbh('motif', [a.instrument, { src: a.src }]));
      case 'jbh_melody':      return ok(await jbh('melody', [a.instrument, { src: a.src }]));
      case 'jbh_counterpoint':return ok(await jbh('counterpoint', [a.instruments, { src: a.src }]));
      case 'jbh_continuity':  return ok(await jbh('continuity', [a.instrument, { src: a.src }]));
      case 'jbh_dynamics':    return ok(await jbh('dynamics'));
      case 'jbh_spectrum':    return ok(await jbh('spectrum', [{ src: a.src, pads: a.pads }]));
      case 'jbh_reference':   return ok(await jbh('reference', [a.url === undefined ? null : a.url]));
      case 'jbh_compare':     return ok(await jbh('compare', [{ src: a.src }]));
      case 'jbh_vs_dry':      return ok(await jbh('vsDry', [a.pad, { src: a.src }]));
      case 'jbh_balance':     return ok(await jbh('balance', [{ src: a.src,
                                maxMoveDb: a.maxMoveDb, groups: a.groups }]));
      case 'jbh_mutate':      return ok(await jbh('mutate', [a.pad, { want: a.want,
                                population: a.population, generations: a.generations,
                                amount: a.amount, keep: a.keep, seed: a.seed,
                                src: a.src, knobs: a.knobs }]));
      case 'jbh_paint':       return ok(await jbh('paint', [{ pad: a.pad, seconds: a.seconds,
                                lo: a.lo, hi: a.hi, log: a.log, rows: a.rows,
                                partials: a.partials, midi: a.midi, name: a.name, seed: a.seed }]));
      case 'jbh_call':        return ok(await jbh(a.method, a.args || []));

      case 'jbh_render': {
        const r = await jbh('render', [{ src: a.src || 'pat', loops: a.loops || 1,
          only: a.only, loudness: !!a.loudness, wav: !!a.wav_path }]);
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
