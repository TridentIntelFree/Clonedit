/* The SFZ subset, against the shapes real libraries actually write.

   These are not invented: the opcode spellings, the inheritance and the
   awkward cases below are taken from how Salamander, Naked Drums and the
   SFZ v1 spec lay their instruments out. A parser that only handles tidy
   input is a parser that works on one library. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSfz, sfzNote, sfzRoundRobin, sampleFromName, packFromNames } from '../src/pure/sfz.js';

test('note names and numbers both resolve, with middle C at 60', () => {
  assert.equal(sfzNote('60'), 60);
  assert.equal(sfzNote('c4'), 60);
  assert.equal(sfzNote('C4'), 60);
  assert.equal(sfzNote('a4'), 69);
  assert.equal(sfzNote('f#3'), 54);
  assert.equal(sfzNote('Bb3'), 58);
  assert.equal(sfzNote('c-1'), 0, 'the bottom of MIDI is a legal note name');
  assert.equal(sfzNote('nonsense'), null);
  assert.equal(sfzNote(null), null);
});

test('opcodes inherit global then group, and a region overrides both', () => {
  const r = parseSfz(`
    <global> volume=-3 loop_mode=one_shot
    <group> lovel=1 hivel=63
    <region> sample=soft.wav key=60
    <region> sample=loud.wav key=60 lovel=64 hivel=127
  `);
  assert.equal(r.samples.length, 2);
  assert.equal(r.samples[0].db, -3, 'the global volume reaches the region');
  assert.ok(r.samples[0].vel < r.samples[1].vel, 'the region overrode the group band');
});

test('a value may contain spaces — libraries do name files that way', () => {
  const r = parseSfz('<region> sample=Grand Piano/A 4 v3.wav key=69');
  assert.equal(r.samples[0].file, 'Grand Piano/A 4 v3.wav');
  assert.equal(r.samples[0].note, 69);
});

test('default_path is prepended and backslashes become slashes', () => {
  const r = parseSfz('<control> default_path=Samples\\Piano\\ \n<region> sample=A4.wav key=69');
  assert.equal(r.samples[0].file, 'Samples/Piano/A4.wav');
});

test('comments cannot contribute opcodes', () => {
  const r = parseSfz(`
    // <region> sample=commented.wav key=60
    /* <region> sample=blockcommented.wav key=62 */
    <region> sample=real.wav key=64
  `);
  assert.equal(r.samples.length, 1);
  assert.equal(r.samples[0].file, 'real.wav');
});

test('a release region is marked and carries no pitch', () => {
  const r = parseSfz(`
    <region> sample=note.wav key=60
    <region> sample=damper.wav trigger=release
  `);
  const rel = r.samples.find(s => s.rel);
  assert.ok(rel, 'the release region survived');
  assert.equal(rel.note, undefined, 'a damper is not a note');
  assert.equal(rel.cat, 'REL');
});

test('pitch_keycenter wins over key, and lokey is the last resort', () => {
  assert.equal(parseSfz('<region> sample=a.wav key=48 pitch_keycenter=60').samples[0].note, 60);
  assert.equal(parseSfz('<region> sample=a.wav lokey=36 hikey=40').samples[0].note, 36);
});

test('a region naming no pitch at all is skipped rather than guessed', () => {
  const r = parseSfz('<region> sample=mystery.wav lovel=1 hivel=127');
  assert.equal(r.samples.length, 0);
  assert.equal(r.skipped, 1, 'and it is counted, so the caller can say so');
});

test('ids stay unique when two libraries use the same filename', () => {
  const r = parseSfz(`
    <region> sample=kick/hit.wav key=36
    <region> sample=snare/hit.wav key=38
  `);
  assert.notEqual(r.samples[0].id, r.samples[1].id,
    'downloads are cached under the id — a collision would serve the wrong audio');
});

test('round robin is the commonest count, not the maximum', () => {
  /* Three alternates on every note, and one stray fourth region. Taking the
     maximum would tell the engine every band has four and leave a silent
     slot wherever the fourth is missing. */
  const s = [];
  for (const note of [36, 38, 42]) for (const q of [1, 2, 3])
    s.push({ note, vel: 0.5, rr: q });
  s.push({ note: 36, vel: 0.5, rr: 4 });
  assert.equal(sfzRoundRobin(s), 3);
  assert.equal(sfzRoundRobin([{ note: 60, vel: 0.5 }]), 1, 'one take is not a round robin');
  assert.equal(sfzRoundRobin([]), 1);
  assert.equal(sfzRoundRobin([{ rel: true }]), 1, 'releases do not count as alternates');
});

test('a Salamander-shaped instrument reads as velocity layers', () => {
  let sfz = '<control> default_path=samples/\n<global> ampeg_release=0.4\n';
  for (const v of [[1, 31], [32, 63], [64, 95], [96, 127]])
    sfz += `<region> sample=A4v${v[0]}.flac lokey=69 hikey=69 pitch_keycenter=69 lovel=${v[0]} hivel=${v[1]}\n`;
  sfz += '<region> sample=rel1.flac trigger=release\n';
  const r = parseSfz(sfz, { prefix: 'sal' });
  const notes = r.samples.filter(s => !s.rel);
  assert.equal(notes.length, 4);
  assert.ok(notes.every(s => s.note === 69));
  const vels = notes.map(s => s.vel);
  assert.deepEqual(vels.slice().sort((a, b) => a - b), vels, 'dynamics come out in order');
  assert.equal(r.samples.filter(s => s.rel).length, 1);
  assert.ok(notes[0].file.startsWith('samples/'));
});

test('filenames are read where a library ships no SFZ', () => {
  assert.equal(sampleFromName('A4v8.mp3').note, 69);
  assert.equal(sampleFromName('A4v8.mp3').velIdx, 8);
  assert.equal(sampleFromName('piano-C#3.wav').note, 49);
  assert.equal(sampleFromName('Snare_mf_rr3.wav').rr, 3);
  assert.ok(sampleFromName('Snare_mf_rr3.wav').vel > 0.5);
  assert.ok(sampleFromName('rel1.mp3').rel);
  assert.ok(sampleFromName('pedalU1.mp3').rel);
  assert.equal(sampleFromName('kick4.wav').note, undefined,
    'the 4 in kick4 is not an octave — a wrong note is worse than none');
});

test('velocity indexes are spread across the range once the set is known', () => {
  /* v1..v4 and v1..v16 both mean "softest to loudest"; neither says so, and
     reading the index as an absolute would put a four-layer library all in
     the bottom quarter. */
  const four = packFromNames(['A4v1.wav','A4v2.wav','A4v3.wav','A4v4.wav']);
  const v = four.samples.map(s => s.vel);
  assert.equal(v.length, 4);
  assert.ok(v[0] < 0.2 && v[3] > 0.8, 'spans the range: ' + v.join(','));
  assert.equal(four.velocitySteps, 4);
});

test('a file naming no note is counted, not silently dropped', () => {
  const r = packFromNames(['A4v1.wav', 'readme.wav']);
  assert.equal(r.read, 2);
  assert.equal(r.mapped, 1);
});

test('a release token must not be the start of a longer word', () => {
  assert.ok(sampleFromName('pedalU1.mp3').rel, 'a capital after it is still a boundary');
  assert.ok(sampleFromName('relD2.wav').rel);
  assert.ok(!sampleFromName('reload-A4.wav').rel, '"reload" is not a release');
  assert.ok(!sampleFromName('relative_C3.wav').rel);
});
