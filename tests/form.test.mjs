/* A PIECE CAN PASS EVERY CHECK IN THIS REPO AND BE ONE LOOP.
 *
 * Everything else looks inside a pattern. This looks at the chain of
 * them, which is the thing AGENTS.md records as measurable only
 * outside the app, from exported MIDI, by one script.
 *
 * What it must NOT do is invent a norm. samples/form-norms.json carries
 * a field-level warning that every UNSOUND_* field must not be used as
 * one, and what survived is Bach phrase length — a fact about chorales,
 * not about how long a section should be. These assert that no such
 * judgement is made.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { formOf, patternDistance, sequenceLetters } from '../src/pure/form.js';

/* steps as the engine passes them: 'pad:step' keys */
const P = {
  0: ['0:0', '0:4', '0:8', '0:12', '1:4', '1:12'],          /* a beat */
  1: ['0:0', '0:4', '0:8', '0:12', '1:4', '1:12', '2:2'],   /* nearly the same */
  2: ['3:0', '3:3', '3:6', '3:10', '4:8'],                  /* something else */
  3: ['0:0', '0:4', '0:8', '0:12', '1:4', '1:12'],          /* identical to 0 */
};
const song = (...pairs) => pairs.map(([pat, reps]) => ({ pat, reps }));

test('distance is 0 for the same steps and 1 for nothing shared', () => {
  assert.equal(patternDistance(P[0], P[0]), 0);
  assert.equal(patternDistance(P[0], P[3]), 0, 'two indices, identical content');
  assert.equal(patternDistance(P[0], P[2]), 1, 'no step in common');
  assert.ok(patternDistance(P[0], P[1]) > 0 && patternDistance(P[0], P[1]) < 0.3,
    'one extra step is a small difference: ' + patternDistance(P[0], P[1]));
  assert.equal(patternDistance([], []), 0);
  assert.equal(patternDistance(null, null), 0);
});

test('the sequence reads as letters, and a letter means one pattern', () => {
  assert.deepEqual(sequenceLetters(song([0, 4], [1, 4], [0, 4], [2, 2])),
    ['A', 'B', 'A', 'C']);
  /* past 26 it must not wrap, or A would mean two different things in
     the one string the whole call exists to produce */
  const many = sequenceLetters(Array.from({ length: 30 }, (_, i) => ({ pat: i, reps: 1 })));
  assert.equal(new Set(many).size, 30, 'letters collided');
  assert.equal(many[0], 'A');
  assert.equal(many[26], 'P27');
});

test('AN EMPTY CHAIN IS NAMED AS NO ARRANGEMENT, not reported as fine', () => {
  const f = formOf([], P, {});
  assert.deepEqual(f.faults, ['no-arrangement']);
  assert.equal(f.sections, 0);
  assert.match(f.says, /no arrangement/);
  /* and it says what that actually means rather than scolding: it is a
     legitimate way to sketch */
  assert.match(f.says, /fine way to sketch/);
  assert.match(f.says, /SONG chain/);
});

test('ONE PATTERN LOOPING IS THE FAULT THIS EXISTS TO CATCH', () => {
  const f = formOf(song([0, 8], [0, 8], [0, 8]), P, { bpm: 120 });
  assert.ok(f.faults.includes('one-pattern'), JSON.stringify(f.faults));
  assert.equal(f.distinct, 1);
  assert.equal(f.sequence, 'A A A');
  /* the sentence has to make the point that the other checks cannot
     see this, or the finding reads as pedantry */
  assert.match(f.says, /passes all of them|nothing about it changes/);
});

test('a real form is reported as one, with its shape', () => {
  const f = formOf(song([0, 4], [2, 4], [0, 4], [1, 2]), P, { bpm: 120 });
  assert.deepEqual(f.faults, [], 'clean form flagged: ' + JSON.stringify(f.faults));
  assert.equal(f.sequence, 'A B A C');
  assert.equal(f.distinct, 3);
  assert.equal(f.returns, true);
  assert.match(f.says, /comes back/);
});

test('nothing coming back is a finding, because a listener needs to recognise something', () => {
  const f = formOf(song([0, 4], [1, 4], [2, 4]), P, { bpm: 120 });
  assert.ok(f.faults.includes('no-return'), JSON.stringify(f.faults));
  assert.equal(f.returns, false);
  assert.match(f.says, /NOTHING COMES BACK/);
  /* two sections are too few to call wandering */
  assert.ok(!formOf(song([0, 4], [2, 4]), P, {}).faults.includes('no-return'));
});

test('TWO PATTERN NUMBERS WITH THE SAME STEPS ARE ONE SECTION, and the letters lie', () => {
  /* the case the sequence string cannot show on its own: A B reads as
     a change and sounds like A A */
  const f = formOf(song([0, 4], [3, 4], [2, 4], [0, 4]), P, { bpm: 120 });
  assert.ok(f.faults.includes('sections-identical'), JSON.stringify(f.faults));
  assert.match(f.says, /the letters claim a change the listener cannot hear/);
  const join = f.joins.find(j => j.from === 'A' && j.to === 'B');
  assert.ok(join && join.distance < 0.05, JSON.stringify(f.joins));
});

test('a long run on one pattern is mentioned without being called wrong', () => {
  const f = formOf(song([0, 2], [0, 2], [0, 2], [0, 2], [2, 4]), P, { bpm: 120 });
  assert.equal(f.longestRun, 4);
  assert.match(f.says, /back to back/);
  /* it is a remark, not a fault — four bars of one idea is a choice */
  assert.ok(!f.faults.includes('long-run'));
});

test('length is counted in bars and in seconds at the real tempo', () => {
  const f = formOf(song([0, 4], [2, 4]), P, { bpm: 120, barsPerPattern: { 0: 1, 2: 1 } });
  assert.equal(f.bars, 8);
  /* 8 bars of 4 beats at 120bpm is 16 seconds */
  assert.equal(f.seconds, 16);
  const slow = formOf(song([0, 4], [2, 4]), P, { bpm: 60, barsPerPattern: { 0: 1, 2: 1 } });
  assert.equal(slow.seconds, 32);
  /* a pattern that is four bars long counts as four */
  const long = formOf(song([0, 2]), P, { bpm: 120, barsPerPattern: { 0: 4 } });
  assert.equal(long.bars, 8);
});

test('IT NEVER JUDGES A SECTION LENGTH, because no sound norm for one exists here', () => {
  /* samples/form-norms.json: every UNSOUND_* field must not be used as
     a norm, and the one that survived is Bach phrase length by fermata
     — commonest 2 bars, and only 6.7% of those phrases are 4 or 8. An
     "eight-bar section" target would be invented, which is the exact
     Goodhart failure this repo has already paid for once. */
  for (const reps of [1, 2, 3, 7, 16, 64]) {
    const f = formOf(song([0, reps], [2, reps]), P, { bpm: 120 });
    assert.ok(!/too (long|short)|should be|ideal|recommended/i.test(f.says),
      reps + ' reps drew a judgement: ' + f.says);
    assert.deepEqual(f.faults, [], reps + ' reps produced a fault');
  }
  /* and it says so out loud, so nobody adds one later thinking it was
     an oversight */
  assert.match(formOf(song([0, 4], [2, 4]), P, {}).says, /No section length is judged/);
});
