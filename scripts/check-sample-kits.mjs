/* DOES EVERY KIT VOICE POINT AT A SOUND THAT IS THERE?

   A kit in src/pure/samplekits.js casts recordings into roles by matching
   a regex against sample IDs in a named manifest. That is a claim about
   another file, and this repo has a long record of claims about other
   files going stale quietly: a button for a call that does not exist, a
   manifest nobody listed, a control named in a hint that was never in the
   markup. A kit whose bass matches nothing does not throw — it loads with
   no bass and the track comes out missing its foundation.

   So every voice is re-resolved here against the manifest it names, the
   same way instrument() will resolve it at load time: regex against the
   ID, skip release samples, keep what is inside lo..hi, thin to `max`
   NOTES rather than samples, and group equal notes as velocity layers on
   one pad.

   It reports what each voice would actually get. Read that, not just the
   exit code: a bass that resolves to one note is technically fine and
   musically a drone, and the number is the only place that shows.

   Run: node scripts/check-sample-kits.mjs
   Exit 1 if any voice resolves to nothing, names a missing pack, or
   declares a role the engine does not know. */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { SAMPLE_KITS, KIT_ROLES, KIT_DRUM_ROLES } =
  await import(resolve(ROOT, 'src', 'pure', 'samplekits.js'));

/* sampleNote() in the engine, reproduced: a pack says the pitch in `note`.
   Anything without one is unpitched and instrument() will not place it. */
const noteOf = (s) => (s && s.note != null ? s.note : null);

const manifests = new Map();
function load(file) {
  if (manifests.has(file)) return manifests.get(file);
  const p = resolve(ROOT, file);
  const m = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  manifests.set(file, m);
  return m;
}

let bad = 0;
const warn = [];

for (const kit of SAMPLE_KITS) {
  console.log('\n' + kit.name + '  (' + kit.id + ')  ' + kit.bpm + 'bpm — ' + kit.note);
  const seen = new Set();
  for (const v of kit.voices) {
    const where = kit.id + '/' + v.role;
    if (!KIT_ROLES.includes(v.role)) {
      console.log('  ' + v.role.padEnd(8) + 'UNKNOWN ROLE — not one of ' + KIT_ROLES.join(', '));
      bad++; continue;
    }
    if (seen.has(v.role)) warn.push(where + ': two voices share the role "' + v.role + '"');
    seen.add(v.role);

    const man = load(v.pack);
    if (!man || !Array.isArray(man.samples)) {
      console.log('  ' + v.role.padEnd(8) + 'MISSING PACK ' + v.pack);
      bad++; continue;
    }
    let re;
    try { re = new RegExp(v.match, 'i'); }
    catch (e) { console.log('  ' + v.role.padEnd(8) + 'BAD REGEX ' + v.match); bad++; continue; }

    /* THREE REASONS A VOICE CAN COME BACK EMPTY, AND THEY NEED DIFFERENT
       FIXES. The first version of this collapsed them into "matches no
       sample id at all" and printed that for /^vc:timp/, which matches
       204 ids — every one of them unpitched. A diagnosis that names the
       wrong cause costs more than no diagnosis, which is the lesson from
       the tape() trap one file over. */
    const anyId = man.samples.filter(s => !s.rel && re.test(s.id));
    if (!anyId.length) {
      console.log('  ' + v.role.padEnd(8) + 'NO SUCH ID — /' + v.match + '/ matches nothing in '
        + v.pack.replace('samples/', ''));
      bad++; continue;
    }

    /* PITCHED OR NOT, WORKED OUT RATHER THAN DECLARED. instrument() needs
       a note per sample and places one pad per note; a timpani or a brake
       drum has no note in the manifest, so it is placed directly instead
       and its several takes become velocity layers on the one pad. Making
       this a field would be one more thing to get wrong — the manifest
       already knows. */
    const pitchedAll = anyId.filter(s => noteOf(s) != null);
    const drum = KIT_DRUM_ROLES.includes(v.role);

    if (!pitchedAll.length) {
      /* unpitched: one pad, and the takes that differ only by velocity or
         round robin ride along as layers */
      const base = (id) => id.replace(/_v\d+/ig, '').replace(/_rr\d+/ig, '');
      const first = anyId.map(s => s.id).sort()[0];
      const layers = anyId.filter(s => base(s.id) === base(first)).length;
      if (!drum) warn.push(where + ': unpitched samples cast as a melodic voice — '
        + 'it can be triggered but not played a tune on');
      /* NAME THE SAMPLE IT ACTUALLY CASTS, which the first version did
         not, and that omission shipped two wrong drums. /-TopOne/ in
         Naked Drums matched "Tom 1" rather than "Snare Tops" and was
         loaded as the snare; /^vc:brake/ sorts to BrakeDrum1_BOWED, a
         sustained tone, and was loaded as a snare too. Both printed as a
         confident "1 pad · N samples · unpitched" and both were only
         caught by loading the kit and reading the pad names off the
         grid. A check that reports a count while hiding the choice is
         reporting the easy half. */
      const chosen = anyId.find(s => s.id === first);
      console.log('  ' + v.role.padEnd(8) + ' 1 pad  · ' + String(anyId.length).padStart(3)
        + ' samples · unpitched' + (layers > 1 ? ' · ' + layers + ' takes layered' : '')
        + '   ' + v.pack.replace('samples/', '')
        + '\n' + ' '.repeat(12) + 'plays: ' + JSON.stringify((chosen && chosen.name) || '?')
        + '  ' + first);
      continue;
    }

    const hit = pitchedAll.filter(s =>
      (v.lo == null || noteOf(s) >= v.lo) && (v.hi == null || noteOf(s) <= v.hi));
    if (!hit.length) {
      const at = [...new Set(pitchedAll.map(noteOf))].sort((a, b) => a - b);
      console.log('  ' + v.role.padEnd(8) + 'RANGE IS EMPTY — /' + v.match + '/ matches '
        + pitchedAll.length + ' pitched samples but none inside ' + v.lo + '..' + v.hi
        + ' (they are at ' + at.join(',') + ')');
      bad++; continue;
    }

    const notes = [...new Set(hit.map(noteOf))].sort((a, b) => a - b);
    const pads = Math.min(v.max || notes.length, notes.length);
    const layers = Math.round(hit.length / notes.length);
    console.log('  ' + v.role.padEnd(8) + String(pads).padStart(2) + ' pad' + (pads === 1 ? ' ' : 's')
      + ' · ' + String(hit.length).padStart(3) + ' samples'
      + ' · notes ' + notes[0] + '-' + notes[notes.length - 1]
      + (layers > 1 ? ' · ' + layers + ' per note' : '')
      + '   ' + v.pack.replace('samples/', ''));

    /* A MELODIC VOICE ON ONE PAD IS A DRONE WAITING TO HAPPEN. infill()
       centres a one-pad instrument on its own note and allows a fifth
       either way, because a sample dragged further stops sounding like
       the instrument — so a kit that casts a lead onto one recording has
       cast a part it cannot play. Worth saying; not worth failing. */
    if (!drum && pads < 3)
      warn.push(where + ': ' + pads + ' pad' + (pads === 1 ? '' : 's')
        + ' for a melodic voice — it can only reach a fifth either side');
    if (drum && layers > 1 && pads === 1) { /* the good case: velocity layers */ }
  }
  for (const r of ['kick', 'bass'])
    if (!kit.voices.some(v => v.role === r))
      warn.push(kit.id + ': no ' + r + ' — WRITE builds a track around both');
}

if (warn.length) {
  console.log('\nWorth knowing:');
  for (const w of warn) console.log('  ' + w);
}

console.log('\n' + SAMPLE_KITS.length + ' kits, '
  + SAMPLE_KITS.reduce((a, k) => a + k.voices.length, 0) + ' voices, '
  + (bad ? bad + ' BROKEN' : 'every voice resolves to real samples'));
process.exit(bad ? 1 : 0);
