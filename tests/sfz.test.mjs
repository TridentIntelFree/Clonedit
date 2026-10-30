/* The SFZ subset, against the shapes real libraries actually write.

   These are not invented: the opcode spellings, the inheritance and the
   awkward cases below are taken from how Salamander, Naked Drums and the
   SFZ v1 spec lay their instruments out. A parser that only handles tidy
   input is a parser that works on one library. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSfz, sfzNote, sfzRoundRobin, sampleFromName, packFromNames,
  sfzAssemble, sfzIncludes, sfzMacros, sfzResolve } from '../src/pure/sfz.js';

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

test('includes resolve against the MAIN sfz, which is what ARIA does', () => {
  /* Taken from Naked Drums: a fragment inside Data/stereo/ writes
     "../Data/group/x.txt", which only lands on a real file if ".." is
     counted from the ENTRY's folder. Resolved from the fragment it becomes
     Data/Data/group/x.txt — 42 of this library's 90 pieces went missing
     that way, and the kit parsed to nothing at all. */
  const files = {
    'Kit/Stereo/kit.sfz': '#include "../Data/stereo/DI_Snare.txt"',
    'Kit/Data/stereo/DI_Snare.txt': '#include "../Data/group/snare.txt"',
    'Kit/Data/group/snare.txt': '<region> sample=snare.wav key=38',
  };
  const r = sfzAssemble('Kit/Stereo/kit.sfz', files);
  assert.deepEqual(r.missing, [], 'nothing should be missing');
  assert.equal(parseSfz(r.text).samples.length, 1);
});

test('and the other convention still works where a library uses it', () => {
  const files = {
    'inst/kit.sfz': '#include "parts/a.txt"',
    'inst/parts/a.txt': '#include "b.txt"',          // sibling, relative to itself
    'inst/parts/b.txt': '<region> sample=a.wav key=36',
  };
  const r = sfzAssemble('inst/kit.sfz', files);
  assert.deepEqual(r.missing, []);
  assert.equal(parseSfz(r.text).samples.length, 1);
});

test('a diamond include is spliced once, not nine times', () => {
  const files = {
    'a.sfz': '#include "k.txt"\n#include "b.txt"\n#include "c.txt"',
    'b.txt': '#include "k.txt"\n<region> sample=b.wav key=40',
    'c.txt': '#include "k.txt"\n<region> sample=c.wav key=41',
    'k.txt': '<global> volume=-1',
  };
  const r = sfzAssemble('a.sfz', files);
  assert.equal((r.text.match(/volume=-1/g) || []).length, 1);
  assert.equal(r.included, 4);
});

test('a missing include is reported rather than silently dropping a kit', () => {
  const r = sfzAssemble('a.sfz', { 'a.sfz': '#include "gone.txt"\n<region> sample=x.wav key=36' });
  assert.deepEqual(r.missing, ['gone.txt']);
  assert.equal(parseSfz(r.text).samples.length, 1, 'what did resolve still parses');
});

test('sfzIncludes offers both conventions as candidates to fetch', () => {
  const got = sfzIncludes('#include "../Data/keymap.txt"', 'Kit/Data/stereo/x.txt', 'Kit/Stereo');
  assert.ok(got.includes('Kit/Data/keymap.txt'), 'entry-relative first: ' + got.join(' '));
  assert.ok(got.includes('Kit/Data/Data/keymap.txt'), 'and the other, in case');
});

test('macros substitute in values AND in opcode names', () => {
  const src = `
    #define $dir ../Samples
    #define $ext flac
    #define $VOL_DI 20
    <region> locc$VOL_DI=1 sample=$dir/snare/hit.$ext key=38
  `;
  const { text, defs } = sfzMacros(src);
  assert.equal(defs.get('$dir'), '../Samples');
  assert.ok(text.includes('locc20=1'), 'a macro inside an opcode NAME was substituted');
  const r = parseSfz(text);
  assert.equal(r.samples[0].file, '../Samples/snare/hit.flac');
});

test('the longest macro name wins — $VOL must not eat $VOL_DI', () => {
  const { text } = sfzMacros('#define $VOL 7\n#define $VOL_DI 20\n<region> locc$VOL_DI=1 sample=a.wav key=36');
  assert.ok(text.includes('locc20=1'), text);
});

test('macros defined in terms of other macros resolve, and cycles terminate', () => {
  const { text } = sfzMacros('#define $root base\n#define $dir $root/Samples\n<region> sample=$dir/a.wav key=36');
  assert.equal(parseSfz(text).samples[0].file, 'base/Samples/a.wav');
  const spin = sfzMacros('#define $a $b\n#define $b $a\n<region> sample=$a.wav key=36');
  assert.ok(typeof spin.text === 'string', 'a cycle must not hang the parser');
});

test('a #define written mid-region is still a define', () => {
  /* Verbatim shape from Naked Drums. Anchoring to whole lines left $V51H
     unresolved — so hivel fell back to 127 and a five-layer kit read as a
     single band — and left the literal text to be swallowed as lovel's
     value, so every region also claimed velocity 1. */
  const src = '<group> key=36\n' +
    '<region> lovel=1   #define $V51H 27   hivel=$V51H seq_position=3 sample=a.flac\n' +
    '<region> lovel=28  #define $V52H 52   hivel=$V52H seq_position=3 sample=b.flac\n';
  const { text } = sfzMacros(src);
  const r = parseSfz(text);
  assert.equal(r.samples.length, 2);
  assert.ok(r.samples[0].vel < r.samples[1].vel,
    'the two dynamics must differ: ' + r.samples.map(s => s.vel.toFixed(3)).join(' '));
  assert.ok(r.samples[0].vel < 0.15, 'lovel 1 to hivel 27 is a quiet band, got ' + r.samples[0].vel);
  assert.equal(r.samples[0].rr, 3);
  assert.equal(r.samples[0].file, 'a.flac', 'the sample name survived the define beside it');
});

test('a redefinition applies only AFTER it, which is the whole game', () => {
  /* Naked Drums has 144 fragments that each redefine the same few names for
     the regions that follow. A global map gives every region the LAST
     fragment's values: the kit parses cleanly, reports a full count, and
     points nearly all of it at filenames that do not exist. */
  const src = [
    '#define $MIC Close', '#define $TAKE one',
    '<region> sample=$MIC_$TAKE.flac key=36',
    '#define $TAKE two',
    '<region> sample=$MIC_$TAKE.flac key=38',
    '#define $MIC Far',
    '<region> sample=$MIC_$TAKE.flac key=40',
  ].join('\n');
  const r = parseSfz(sfzMacros(src).text);
  assert.deepEqual(r.samples.map(s => s.file),
    ['Close_one.flac', 'Close_two.flac', 'Far_two.flac']);
});

test('a macro defined from another resolves at the point of definition', () => {
  const src = '#define $a X\n#define $b $a/deep\n#define $a Y\n<region> sample=$b.wav key=36';
  assert.equal(parseSfz(sfzMacros(src).text).samples[0].file, 'X/deep.wav',
    '$b was fixed when it was written, not re-evaluated later');
});
