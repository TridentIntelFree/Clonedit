/* EVERY SOUND IN A KIT SHOULD ARRIVE AT THE SAME LEVEL.

   CHAMBER shipped with a 22dB peak spread across its own pads — cello at
   -20.5dBFS, glockenspiel at -42.2 — because the kits were cast without
   being staged. The numbers below are that measurement, so these tests
   fail on the real defect rather than on an invented one. */

import { test } from 'node:test';
import assert from 'node:assert';
import { stagePads, GAIN_MAX } from '../src/pure/staging.js';

const lin = (dbv) => Math.pow(10, dbv / 20);
/* measured off CHAMBER, R281 */
const CHAMBER = [
  { pad: 8,  peak: lin(-28.7) }, { pad: 9,  peak: lin(-20.5) },
  { pad: 10, peak: lin(-21.4) }, { pad: 11, peak: lin(-24.4) },
  { pad: 15, peak: lin(-38.5) }, { pad: 16, peak: lin(-42.2) },
  { pad: 17, peak: lin(-37.3) }, { pad: 4,  peak: lin(-31.1) },
];

test('it closes the spread the kit shipped with', () => {
  const r = stagePads(CHAMBER);
  const after = CHAMBER.map(p => 20 * Math.log10(p.peak * r.gains[p.pad]));
  const spread = Math.max(...after) - Math.min(...after);
  assert.ok(r.spread > 20, 'the input really is the 22dB case: ' + r.spread);
  assert.ok(spread < r.spread, 'staging made it no better: ' + spread.toFixed(1));
});

test('a pad that cannot reach the target is NAMED, not clamped quietly', () => {
  const r = stagePads(CHAMBER);
  /* the glockenspiel at -42.2 needs +18dB against a +6dB cap */
  assert.ok(r.short.length > 0, 'nothing reported short, but the cap must bite here');
  const g = r.short.find(s => s.pad === 16);
  assert.ok(g, 'pad 16 (-42.2dB) should be short: ' + JSON.stringify(r.short));
  assert.ok(g.shortBy > 5, 'short by ' + g.shortBy + 'dB');
  assert.equal(r.gains[16], GAIN_MAX, 'it should still be pushed as far as it goes');
  assert.match(r.says, /could not reach/);
});

test('no gain is ever set above the cap, which is what the engine accepts', () => {
  for (const g of Object.values(stagePads(CHAMBER).gains))
    assert.ok(g <= GAIN_MAX && g > 0, 'gain out of range: ' + g);
});

test('the target is the median, so one bad recording cannot define the kit', () => {
  /* seven sane pads and one almost-silent outlier: the target should
     stay with the seven */
  const sane = Array.from({ length: 7 }, (_, i) => ({ pad: i, peak: lin(-12 - i * 0.2) }));
  const withOutlier = [...sane, { pad: 99, peak: lin(-55) }];
  const a = stagePads(sane).target, b = stagePads(withOutlier).target;
  assert.ok(Math.abs(a - b) < 2, 'the outlier moved the target from ' + a + ' to ' + b);
});

test('a near-silent pad does not get to define the target at all', () => {
  const r = stagePads([{ pad: 0, peak: lin(-12) }, { pad: 1, peak: lin(-80) }]);
  assert.ok(r.target > -30, 'target dragged down to ' + r.target);
});

test('it says peak is not loudness, because equal peak is not a mix', () => {
  assert.match(stagePads(CHAMBER).says, /not loudness/i);
});

test('it survives nothing to work with', () => {
  for (const bad of [null, [], [{ pad: 0, peak: 0 }], [null]]) {
    const r = stagePads(bad);
    assert.deepEqual(r.gains, {});
    assert.ok(r.says);
  }
});

test('an explicit target is honoured, for a caller that knows better', () => {
  const r = stagePads([{ pad: 0, peak: lin(-20) }], { targetDb: -14 });
  assert.equal(r.target, -14);
  assert.ok(Math.abs(r.gains[0] - lin(6)) < 0.01, 'gain ' + r.gains[0]);
});
