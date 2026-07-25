import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, NOTE_NAMES, snapSemitone } from '../src/pure/scale.js';

const names = Object.keys(SCALES);

test('every scale is sorted, in range, and has no duplicates', () => {
  for (const n of names) {
    const sc = SCALES[n];
    assert.ok(sc.length >= 5, n);
    assert.equal(sc[0], 0, n + ' must start on the root');
    assert.deepEqual([...sc].sort((a, b) => a - b), sc, n + ' is unsorted');
    assert.equal(new Set(sc).size, sc.length, n + ' has duplicates');
    assert.ok(sc.every(d => d >= 0 && d < 12), n + ' has an out-of-octave degree');
  }
  assert.equal(NOTE_NAMES.length, 12);
});

test('snapping always lands on a degree of the scale', () => {
  for (const n of names) {
    for (let s = -36; s <= 36; s++) {
      const out = snapSemitone(s, n);
      const deg = ((out % 12) + 12) % 12;
      assert.ok(SCALES[n].includes(deg), `${n}: ${s} snapped to ${out} (degree ${deg})`);
    }
  }
});

test('snapping is idempotent — re-snapping never drifts', () => {
  // this is the property that matters in use: pitches get re-snapped every time
  // the pattern is edited, and a non-idempotent snap would walk the line away
  for (const n of names)
    for (let s = -36; s <= 36; s++) {
      const once = snapSemitone(s, n);
      assert.equal(snapSemitone(once, n), once, `${n}: ${s} -> ${once} moved again`);
    }
});

test('a note in the scale is left exactly where it is', () => {
  for (const n of names)
    for (const oct of [-2, -1, 0, 1, 2])
      for (const d of SCALES[n])
        assert.equal(snapSemitone(oct * 12 + d, n), oct * 12 + d);
});

test('it moves a note by less than a whole tone', () => {
  for (const n of names)
    for (let s = -36; s <= 36; s++)
      assert.ok(Math.abs(snapSemitone(s, n) - s) <= 2, `${n}: ${s} moved too far`);
});

test('ties resolve downward, by design', () => {
  // minor has no 2nd degree at 1; semitone 1 sits equally between 0 and 2.
  // Choosing the lower one stops a repeatedly re-snapped line drifting sharp.
  assert.equal(snapSemitone(1, 'minor'), 0);
  assert.equal(snapSemitone(-1, 'minor'), -2);
});

test('a note just under the octave snaps up, not back down the scale', () => {
  // major has no degree at 11 above the 7th at 11... use pentatonic, which
  // leaves a gap of three semitones below the octave
  assert.equal(snapSemitone(11, 'pmaj'), 12, 'should reach the octave above');
});

test('an unknown scale name falls back to minor rather than throwing', () => {
  assert.equal(snapSemitone(1, 'nonsense'), snapSemitone(1, 'minor'));
  assert.equal(snapSemitone(5, undefined), snapSemitone(5, 'minor'));
});
