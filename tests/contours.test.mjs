/* THE FILTER IS THE FEATURE.

   src/pure/contours.js holds 130 melodic shapes from magenta's
   chord_pitches_improv. The model itself is not the value — measured over
   256 draws at the same temperature it gave offNorm 3.4 on one and 27.9 on
   the next, and it writes drones about as often as it writes tunes. 109
   draws were thrown out to get these 130.

   So what has to be defended is not "magenta was used" but "what survived
   the filter is still what the filter promised". A regenerated corpus with
   the thresholds loosened would look identical from the outside, pass every
   other test in the repo, and quietly put the drones back. These assertions
   are the thresholds, written down where a regeneration has to meet them. */
import { test } from 'node:test';
import assert from 'node:assert';
import { MAGENTA_CONTOURS, pickContour } from '../src/pure/contours.js';

const ESSEN = { repeat: 21.1, step: 46.9, third: 19.0, leap: 13.1 };

test('every contour survived the filter it claims to have survived', () => {
  assert.ok(MAGENTA_CONTOURS.length >= 100, 'only ' + MAGENTA_CONTOURS.length);
  for (const c of MAGENTA_CONTOURS) {
    assert.ok(Array.isArray(c.iv) && c.iv.length >= 4,
      'a shape needs intervals to be a shape: ' + JSON.stringify(c.iv));
    assert.ok(c.iv.every(Number.isInteger), 'intervals are semitones, so integers');
    assert.ok(c.range >= 5, 'range ' + c.range + 'st — under 5 is not a contour');
    assert.ok(c.repeat <= 45, 'repeat ' + c.repeat + '% — over 45 is a drone');
    assert.ok(c.off <= 12, 'offNorm ' + c.off + ' — the filter was 12');
    /* the stored numbers must describe the stored intervals, or the ranking
       is sorting on something else entirely */
    const a = c.iv.map(Math.abs);
    const pct = (f) => 100 * a.filter(f).length / a.length;
    assert.ok(Math.abs(pct((d) => d === 0) - c.repeat) < 0.6,
      'stored repeat ' + c.repeat + ' vs measured ' + pct((d) => d === 0).toFixed(1));
    assert.ok(Math.abs(pct((d) => d === 1 || d === 2) - c.step) < 0.6,
      'stored step ' + c.step + ' vs measured ' + pct((d) => d === 1 || d === 2).toFixed(1));
  }
});

test('the corpus as a whole sits on the Essen norms', () => {
  const mean = (k) => MAGENTA_CONTOURS.reduce((s, c) => s + c[k], 0) / MAGENTA_CONTOURS.length;
  /* this is the claim the header makes and the reason the shapes are worth
     following at all — infill()'s own chooser cannot get here, because two
     chord tones are a third apart by construction */
  for (const [k, norm] of Object.entries(ESSEN)) {
    if (k === 'third') continue;            // not stored per contour pre-filter
    const got = mean(k);
    assert.ok(Math.abs(got - norm) < 6,
      k + ' mean ' + got.toFixed(1) + '% against the norm ' + norm + '%');
  }
});

test('pickContour is deterministic, and long enough for what was asked', () => {
  assert.equal(pickContour(7, 12).iv.join(), pickContour(7, 12).iv.join(),
    'the same seed must reproduce the same shape, or a candidate seed is a lie');
  assert.notEqual(pickContour(7, 12).iv.join(), pickContour(8, 12).iv.join());
  for (const want of [2, 8, 20, 40]) {
    const c = pickContour(3, want);
    assert.ok(c && c.iv.length >= Math.min(want - 1, 4),
      'asked for ' + want + ' notes, got ' + c.iv.length + ' intervals');
  }
  /* asked for more than anything in the corpus, it must still return a shape
     rather than null — a caller that wanted one has nothing to fall back on */
  const huge = pickContour(1, 10000);
  assert.ok(huge && huge.iv.length >= 4, 'must fall back, not return null');
});
