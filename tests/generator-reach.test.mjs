/* IS EVERY TOOL WE HAVE TO WRITE ACTUALLY USED BEFORE A SONG IS MADE?

   tests/discoverable.test.mjs asks whether an agent can FIND each call.
   This asks the next question, and it is a different one: when the app
   builds a track by itself — SURPRISE ME, writeSurprise() — does it
   REACH for what it has, or does it leave half the box shut?

   AGENTS.md keeps a section on exactly this failure and its example is
   this repo's: "poly() gives a pad its own BPM and produces real
   cross-rhythm, and six tracks were written in this repo before anyone
   used it, every one of them on a single 16-step grid at a single
   tempo." A capability nobody reaches for is indistinguishable from one
   that does not exist, and the way that survives is that nothing ever
   asks.

   What the audit that produced this file found, with the generator
   already reaching ensemble, infill, phrase, poly, key, chords, gate,
   feel, penta, converse, timbre, tape and the song chain:

     grooves  336 drum figures measured from 1,138 Groove MIDI takes,
              reachable only from recipe(). writeKit() was inventing
              drums next to a corpus it never opened.
     form()   the builder writes the only song chain in the app and was
              the one caller that could run form() — and did not. A
              piece can pass every other check here and be one loop.

   Both are wired now. The rest of this is the ratchet: a writing
   capability is either REACHED by the generator or named in EXEMPT with
   the reason it is not, and adding a name to EXEMPT is a decision
   somebody makes on purpose. Leaving one out of both is the oversight
   this exists to catch.

   It reads SOURCE, not a running page. That is a real limit — it proves
   the call is written down, not that it fired — and it is the right
   trade for a check that runs in milliseconds on every build. The
   browser suites prove the firing; tests/browser/musical-layer.test.mjs
   drives the button. */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leg = readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8');

/* the body of a function, by brace matching from its header — crude but
   exact enough, and it fails loudly rather than silently matching the
   whole file if a header moves */
function body(header) {
  const i = leg.indexOf(header);
  assert.ok(i >= 0, 'cannot find ' + JSON.stringify(header)
    + ' in src/legacy.js — this test is reading the wrong function');
  let d = 0, started = false;
  for (let j = leg.indexOf('{', i); j < leg.length; j++) {
    if (leg[j] === '{') { d++; started = true; }
    else if (leg[j] === '}') { d--; if (started && d === 0) return leg.slice(i, j + 1); }
  }
  throw new Error('unbalanced braces from ' + header);
}

/* THE GENERATOR'S REACH is everything the build runs, not just the top
   function: phrase() is reached through ensemble() and counts, and a
   test that only read writeSurprise() would report it missing and send
   somebody to wire a call that is already there.

   WALKED, NOT LISTED, and the difference caught a hole in the first
   draft of this file. That version joined a fixed list of function
   bodies, so when writeKit() was made to stop calling kitFrom() — the
   exact regression of unwiring the drum corpus from the build — every
   test still passed: kitFrom's body was in the list whether or not
   anything reached it, and DRUM_CORPUS still appeared in the joined
   text. The check was reading a vocabulary and claiming it was a call
   graph.

   So the walk starts at writeSurprise() and admits a function only once
   its name appears in text already admitted. Shallow — it matches names
   rather than resolving them — but it is transitive, and an orphan
   stays out. */
const CALLEES = {
  'writeKit': 'function writeKit(',
  'kitFrom': 'function kitFrom(',
  'mlVoices': 'function mlVoices()',
  'ensemble': '  async ensemble(voices, opt){',
  'infill': '  async infill(inst, opt){',
};

const REACH = (() => {
  let text = body('async function writeSurprise()');
  const left = new Map(Object.entries(CALLEES));
  for (let pass = 0; pass < left.size + 1 && left.size; pass++) {
    let grew = false;
    for (const [name, header] of [...left]) {
      if (!new RegExp('\\b' + name + '\\s*\\(').test(text)) continue;
      text += '\n' + body(header); left.delete(name); grew = true;
    }
    if (!grew) break;
  }
  /* An unreached callee is not an error here — it is simply not part of
     the build, and whatever it alone provides will show up as missing
     below, which is the finding worth reporting. */
  return text;
})();

/* Every writing capability in the app, and the token that proves the
   generator reached it. A bare name is matched as a call. */
const WRITES = {
  'infill()':      /\binfill\s*\(/,
  'ensemble()':    /\bensemble\s*\(/,
  'phrase()':      /\bphrase\s*\(/,
  'note()':        /\bnote\s*\(|\bnotes\b/,
  'step()':        /\.step\s*\(/,
  'poly':          /\bpoly\s*[:(]/,
  'key()':         /MVX\.key\s*\(/,
  'chords()':      /MVX\.chords\s*\(/,
  'pattern()':     /MVX\.pattern\s*\(/,
  'song chain':    /\bsong\s*:/,
  'gate':          /\bgate\s*[:=]/,
  'feel':          /\bfeel\s*[:=]/,
  'penta scale':   /penta/,
  'converse':      /\bconverse\b/,
  'swing/human':   /\bswing\s*:/,
  'timbre()':      /\btimbre\s*\(/,
  'tape()':        /\btape\s*\(/,
  'instPads()':    /instPads\s*\(/,
  'drum corpus':   /DRUM_CORPUS/,
  'figureFor()':   /\bfigureFor\s*\(/,
  'figureSteps()': /\bfigureSteps\s*\(/,
  'form()':        /MVX\.form\s*\(/,
  /* what each pad IS, which is the half timbre() cannot reach */
  'learn()':       /MVX\.learn\s*\(/,
  'assignKit()':   /\bassignKit\s*\(/,
};

/* NOT REACHED, ON PURPOSE. Each line is a decision, and the reason has
   to say why the generator is right not to call it — "we did not get
   round to it" is not one of these, it is a gap, and it belongs above. */
const EXEMPT = {
  'euclid()':
    'A Euclidean spread is a COMPOSITIONAL choice, not a default. The '
    + 'generator writes drums from either a measured corpus bar or the '
    + 'genre table, and overlaying n-hits-over-k on top of a figure a '
    + 'drummer actually played would be replacing a measurement with a '
    + 'formula. It is on the EUCL panel for a person who wants it.',
  'figure()':
    'figure() is the other route to a cross-rhythm: it lays a poly '
    + 'figure across several pads by register. The generator already '
    + 'reaches cross-rhythm through the `poly` option, which ensemble() '
    + 'applies to the voices it just wrote. Two routes to one result, '
    + 'and the build takes the one that knows what the notes are.',
  'recipe() / fit() / slot()':
    'A recipe names the slots a track NEEDS and ranks your pads against '
    + 'them. The generator starts from the pads already on the board and '
    + 'assigns roles by sampled pitch, so it answers the same question '
    + 'from the other end. Running both would have the build silently '
    + 'reassign pads the person had chosen.',
  'mutate() / resynth() / paint() / chop() / freeze()':
    'These change what a SOUND is, and the build writes PARTS. '
    + 'Rewriting somebody\x27s sample because a track was generated over '
    + 'it is taking more than was asked for — the same reason the '
    + 'velocity-filter pass skips any pad whose filter the person set.',
  'live() / hit()':
    'Performance, not writing. Both make a sound at the moment they are '
    + 'called and leave nothing in a pattern, so there is nothing for a '
    + 'build to have written. A generator that fired them would make '
    + 'noise while it worked and the track would be no different for it.',
};

test('every writing tool is reached by the generator, or exempt with a reason', () => {
  const missing = [];
  for (const [name, re] of Object.entries(WRITES))
    if (!re.test(REACH)) missing.push(name);
  assert.deepEqual(missing, [],
    'the app can do this and the one-tap build never asks for it:\n  '
    + missing.join('\n  '));
});

test('nothing is both reached and exempt', () => {
  const both = Object.keys(EXEMPT).filter(k => k in WRITES);
  assert.deepEqual(both, [], 'listed twice, so one of them is stale: ' + both);
});

test('every exemption carries a reason, not a shrug', () => {
  for (const [name, why] of Object.entries(EXEMPT)) {
    assert.ok(why.length > 80, name + ': a one-liner is not a reason');
    assert.ok(!/\b(todo|later|yet|not round to|for now)\b/i.test(why),
      name + ': that is a gap wearing an exemption — move it to WRITES '
      + 'and wire it, or say why the generator is RIGHT not to call it');
  }
});

/* The two the audit found. Named outright, because the general test
   above passes the moment somebody deletes a line from WRITES. */
test('the drum corpus reaches the song builder, not just recipe()', () => {
  const kit = body('function kitFrom(');
  assert.match(kit, /DRUM_CORPUS\.styles/);
  assert.match(kit, /st\.thin/, 'a style under twenty takes is one or two '
    + 'drummers and must not be presented as a genre');
  assert.match(kit, /bpm\[0\][\s\S]*bpm\[2\]/,
    'a style has a measured tempo range and the gate has to respect it');

  /* and the claim is only made when the corpus actually answered */
  const sur = body('async function writeSurprise()');
  assert.match(sur, /kitDrew/, 'the build should say which drums are measured');
});

/* THE KIT FOLLOWS THE SOUNDS, which is the third thing the audit found
   and the one a listener hears first. */
test('the kit is assigned by measurement, not by pad index', () => {
  const sur = body('async function writeSurprise()');
  assert.ok(!/loose\.slice\(0,\s*3\)[^;]*;\s*$/m.test(sur)
    || /assignKit/.test(sur),
    'drums must not be taken straight off the top of the free-pad list');
  const i = sur.indexOf("MVX.learn(");
  const j = sur.indexOf('mlVoices()');
  assert.ok(i > 0 && j > 0 && i < j,
    'learn() has to run BEFORE the voices are chosen, or the kit pads are '
    + 'already gone and a drum gets dealt a melody');
  assert.match(sur, /kitReserved/,
    'percussive pads have to be held back from the voice pool');
});

/* A pad index is a NUMBER and A01 is 0, so truthiness silently drops it.
   This was live for as long as writeKit existed: the kick was usually
   pad 0, so the commonest board had no kick and the report named one. */
test('writeKit tests its pads against null, never for truthiness', () => {
  const kit = body('function writeKit(');
  const bad = [...kit.matchAll(/if\s*\(\s*(?:fill\s*&&\s*)?drums\[\d\]\s*[){&]/g)]
    .map(m => m[0]);
  assert.deepEqual(bad, [],
    'pad A01 is index 0 and these are false for it, so its part is never '
    + 'written:\n  ' + bad.join('\n  '));
});

test('the builder checks the form of the arrangement it just wrote', () => {
  const sur = body('async function writeSurprise()');
  const i = sur.indexOf('songOn:true');
  assert.ok(i > 0, 'writeSurprise no longer sets a song chain');
  assert.ok(sur.indexOf('MVX.form(') > i,
    'form() has to run AFTER the arrangement exists — before it, there is '
    + 'nothing for it to read and it reports no-arrangement on every build');
});
