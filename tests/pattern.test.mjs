import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NPADS, NSTEPS, MAXSTEPS, PATLENS, newPattern, patLen, trackLen, rowUsed, stepHasLock } from '../src/pure/pattern.js';

test('a new pattern allocates full capacity whatever its length', () => {
  // growing a pattern must never reallocate or lose what was written past the
  // old end, so rows are always MAXSTEPS long
  for (const n of PATLENS) {
    const p = newPattern(n);
    assert.equal(patLen(p), n);
    assert.equal(p.steps.length, NPADS);
    assert.ok(p.steps.every(r => r.length === MAXSTEPS), 'row not at full capacity');
    assert.equal(p.sil.length, MAXSTEPS);
  }
});

test('a junk or missing length degrades to one bar', () => {
  for (const bad of [undefined, null, 0, 7, 17, -16, 'x', 1e9])
    assert.equal(patLen(newPattern(bad)), NSTEPS, String(bad));
  assert.equal(patLen(undefined), NSTEPS);
  assert.equal(patLen({}), NSTEPS);
  assert.equal(patLen({ plen: 999 }), NSTEPS);
});

test('track length is polymeter, clamped inside the pattern', () => {
  const p = newPattern(32);
  assert.equal(trackLen(p, 0), 32);
  p.len[0] = 7;   assert.equal(trackLen(p, 0), 7, 'a 7 against a 32 is the point');
  p.len[1] = 999; assert.equal(trackLen(p, 1), 32, 'cannot exceed the pattern');
  p.len[2] = 0;   assert.equal(trackLen(p, 2), 32, 'zero would never advance');
  p.len[3] = -4;  assert.equal(trackLen(p, 3), 32);
});

test('rowUsed only counts positive velocities', () => {
  const p = newPattern(16);
  assert.equal(rowUsed(p, 0), false);
  p.steps[0][5] = 0;    assert.equal(rowUsed(p, 0), false);
  p.steps[0][5] = 0.01; assert.equal(rowUsed(p, 0), true);
  assert.equal(rowUsed(p, 99), false, 'out of range must not throw');
  assert.equal(rowUsed(null, 0), false);
});

test('stepHasLock ignores an empty lock object', () => {
  assert.equal(stepHasLock(undefined), false);
  assert.equal(stepHasLock({}), false);
  assert.equal(stepHasLock({ pitch: 0 }), false, 'pitch 0 is the default, not a lock');
  assert.equal(stepHasLock({ pitch: 3 }), true);
  assert.equal(stepHasLock({ prob: 0 }), true, 'probability 0 IS a lock');
  assert.equal(stepHasLock({ rat: 1 }), false);
  assert.equal(stepHasLock({ rat: 2 }), true);
  assert.equal(stepHasLock({ nudge: -0.1 }), true);
});
