/* WHERE MELODIC NOTES FALL AND HOW LONG THEY ARE.

   The rhythm cell library in mlWrite() was hand-authored and said so,
   and it was the last unmeasured thing in the write path: melody
   intervals come from 8,514 Essen folksongs, harmony from 370 Bach
   chorales, counterpoint from 70 Palestrina scores, drum figures from
   1,138 Groove MIDI takes, and the rhythm of a melodic part came from
   somebody's judgement.

   scripts/study-cells.py measures it from the same Essen collection:
   78,556 duple-meter bars, 277,508 notes, as whole bars of
   [step, beats]. Placement and duration TOGETHER, because separately
   they mean nothing — a duration drawn from any distribution, pink
   noise included, has the right histogram and does not know where the
   downbeat is.

   These tests guard the generated table and the selector. The table is
   generated and could be regenerated wrong; a table nobody checks is a
   table that will one day say something absurd quietly. */

import { test } from 'node:test';
import assert from 'node:assert';
import { MELODY_CELLS } from '../src/pure/cells.js';
import { melodyCellsFor, melodyCellSource } from '../src/pure/recipes.js';

const STEPS = 16;

test('it rests on the corpus it claims, at the size it claims', () => {
  assert.match(MELODY_CELLS.source, /Essen Folksong/);
  const m = MELODY_CELLS.measured;
  assert.equal(m.steps, STEPS);
  assert.ok(m.tunes > 8000, 'tunes: ' + m.tunes);
  assert.ok(m.bars > 50000, 'bars: ' + m.bars);
  assert.ok(m.notes > 200000, 'notes: ' + m.notes);
  /* the same corpus MELODY_NORMS was measured from, so the two agree
     about what they are describing */
  assert.equal(m.tunes, 8514, 'MELODY_NORMS says 8514 melodies');
});

test('it says what it threw away, rather than only what it kept', () => {
  const s = MELODY_CELLS.skipped;
  assert.ok(s && typeof s === 'object');
  /* A 16-step bar does not divide into 3, so triple meters were excluded
     rather than squeezed onto a grid that cannot hold them. If that
     count were ever zero, either the corpus changed or the exclusion
     stopped working — and a 3/4 bar stretched over 16 steps is a bar
     nobody played. */
  assert.ok(s.odd_meter > 0 || s.triple_meter > 0,
    'nothing was excluded for meter: ' + JSON.stringify(s));
  assert.ok(s.unquantizable_bar > 0,
    'no bar failed to quantize, which would mean the tolerance is doing nothing');
});

test('ONSETS LAND ON THE BEAT, which is what melodic rhythm looks like', () => {
  const on = MELODY_CELLS.onsetPct;
  assert.equal(on.length, STEPS);
  assert.ok(Math.abs(on.reduce((a, b) => a + b, 0) - 100) < 0.5,
    'shares sum to ' + on.reduce((a, b) => a + b, 0));
  const quarters = [0, 4, 8, 12].reduce((a, s) => a + on[s], 0);
  const oddSixteenths = [1, 3, 5, 7, 9, 11, 13, 15].reduce((a, s) => a + on[s], 0);
  assert.ok(quarters > 70, 'quarter positions hold only ' + quarters.toFixed(1) + '%');
  assert.ok(quarters > oddSixteenths * 10,
    quarters.toFixed(1) + '% on quarters vs ' + oddSixteenths.toFixed(1) + '% on odd sixteenths');
  assert.equal(on.indexOf(Math.max(...on)), 0, 'the downbeat must be the commonest onset');
});

test('and durations are dominated by the quarter and the eighth', () => {
  const d = MELODY_CELLS.durationPct;
  assert.ok(d.length >= 4);
  assert.equal(d[0].steps, 4, 'commonest duration is ' + d[0].steps + ' steps, not a quarter');
  assert.ok(d[0].pct > 40, 'quarter notes are only ' + d[0].pct + '%');
  const byLen = {};
  for (const r of d) byLen[r.steps] = r.pct;
  assert.ok((byLen[2] || 0) > 20, 'eighths are ' + byLen[2] + '%');
  /* the thing the hand library leaned on, for the record: a 0.75-beat
     note is 3 steps, and it is rare in real melody */
  assert.ok((byLen[3] || 0) < 5, 'three-step notes are ' + byLen[3] + '%');
});

test('every stored bar fits inside the bar', () => {
  for (const row of MELODY_CELLS.bars) {
    assert.equal(row.cells.length, row.notes, JSON.stringify(row));
    let last = -1;
    for (const [step, beats] of row.cells) {
      assert.ok(Number.isInteger(step) && step >= 0 && step < STEPS,
        'step ' + step + ' in ' + JSON.stringify(row.cells));
      assert.ok(step > last, 'steps must ascend: ' + JSON.stringify(row.cells));
      last = step;
      assert.ok(beats > 0 && beats <= 4,
        beats + ' beats in ' + JSON.stringify(row.cells));
    }
  }
});

test('the shares are ordered and plausible', () => {
  const p = MELODY_CELLS.bars.map(r => r.pct);
  for (let i = 1; i < p.length; i++)
    assert.ok(p[i] <= p[i - 1] + 1e-9, 'not sorted by share at ' + i);
  assert.ok(p[0] > 5 && p[0] < 40, 'commonest bar holds ' + p[0] + '% of bars');
});

/* ---- the selector -------------------------------------------------- */

test('a density band gets figures of that density', () => {
  const count = cells => cells.length;
  const normal = melodyCellsFor('normal').map(count);
  const busy = melodyCellsFor('busy').map(count);
  assert.ok(normal.length && busy.length);
  assert.ok(Math.min(...normal) >= 3 && Math.max(...normal) <= 4,
    'normal spans ' + Math.min(...normal) + '-' + Math.max(...normal));
  assert.ok(Math.min(...busy) >= 5, 'busy has a bar of ' + Math.min(...busy) + ' notes');
});

/* THE FLOOR, AND WHY SPARSE GETS NOTHING.

   infill() places a third on a strong beat and with two or three slots
   it can run out of places to put one. Offering these cells without a
   floor left 3 bars of 12 candidates with no third at all, against the
   measured norm that 94.6% of Bach sonorities state one; the browser
   suite caught it and disabling the wiring confirmed the cause.

   An earlier fix applied the floor as a filter ON TOP of the bands,
   which collided with sparse — every sparse bar is under the floor, the
   empty-band fallback kicked in, and `sparse` came back with six-note
   bars, busier than `normal`. Its own unit test caught that. So sparse
   returns nothing and the hand-authored cells cover that density. */
test('every measured cell can carry a third, and sparse defers', () => {
  assert.deepEqual(melodyCellsFor('sparse'), [],
    'sparse bars are under the harmonic floor and must not be widened into it');
  for (const d of ['normal', 'busy'])
    for (const cell of melodyCellsFor(d))
      assert.ok(cell.length >= 4, d + ' offers a ' + cell.length + '-note bar');
  /* and the floor is adjustable, for a caller that does not need harmony */
  assert.ok(melodyCellsFor('normal', { minNotes: 3 }).length
    >= melodyCellsFor('normal').length);
});

test('IT DOES NOT COLLAPSE TO THE COMMONEST BAR', () => {
  /* Essen's commonest bar is four quarter notes at 19.1% of all bars.
     Choosing by share alone would hand that to every part in every
     track, which is plainer rather than better — the Goodhart failure
     AGENTS.md is longest about, reached by diligence. */
  for (const d of ['normal', 'busy']) {
    const got = melodyCellsFor(d);
    const shapes = new Set(got.map(c => JSON.stringify(c)));
    assert.ok(shapes.size >= 4, d + ' offers only ' + shapes.size + ' distinct figures');
  }
  const busy = melodyCellsFor('busy');
  assert.ok(!busy.some(c => JSON.stringify(c) === JSON.stringify([[0, 1], [4, 1], [8, 1], [12, 1]])),
    'four plain quarters must not be offered as a BUSY figure');
});

test('an unknown density is treated as normal rather than refused', () => {
  const b = melodyCellsFor('normal');
  assert.deepEqual(melodyCellsFor('wat'), b);
  assert.deepEqual(melodyCellsFor(), b);
  assert.ok(b.length, 'normal must offer something');
});

test('the cells it hands back are the shape mlWrite consumes', () => {
  /* [[step, beats], ...] — the same shape as the hand-authored CELLS,
     because they go into one pool and the timbre filter walks both */
  for (const cell of melodyCellsFor('normal')) {
    assert.ok(Array.isArray(cell) && cell.length);
    for (const c of cell) {
      assert.equal(c.length, 2);
      assert.ok(Number.isInteger(c[0]));
      assert.ok(typeof c[1] === 'number' && c[1] > 0);
    }
  }
});

test('the measurement can be printed, not just used', () => {
  const s = melodyCellSource();
  assert.match(s.source, /Essen/);
  assert.equal(s.onsetPct.length, STEPS);
  assert.ok(s.notes > 200000);
  assert.ok(s.durationPct.length >= 4);
});
