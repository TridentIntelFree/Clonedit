import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  polyCfg, isPoly, polyStepDur, polyEffectiveBpm, polyHitsPerBar,
  polyLockedHitsPerBar, polyDoesLock, polyRatio, polyEvents, polyIndexAt,
  mainBpmOf, POLY_MAX_CELLS, POLY_MIN_CELLS,
} from '../src/pure/poly.js';

const patWith = (p, c) => ({ poly: { [p]: c } });
const BAR = 2.4;                       // one bar at 100 BPM: 4 beats of 0.6s
const pad = (bpm, cells = 4, lock = true) =>
  polyCfg(patWith(0, { on: true, bpm, cells, lock }), 0);

test('a pad with no settings plays on the ordinary grid', () => {
  assert.equal(polyCfg({}, 0), null);
  assert.equal(polyCfg({ poly: {} }, 0), null);
  assert.equal(polyCfg(patWith(0, { on: false, bpm: 75, cells: 3 }), 0), null);
  assert.equal(isPoly(patWith(0, { on: true, bpm: 75, cells: 3 }), 0), true);
});

test('the project tempo reads back in the same units', () => {
  assert.ok(Math.abs(mainBpmOf(BAR) - 100) < 1e-9);
});

test('THE ONE MAPPING NOBODY SHOULD HAVE TO LEARN: same BPM, one hit per beat', () => {
  const c = pad(100);
  assert.ok(Math.abs(polyStepDur(c, BAR) - 0.6) < 1e-12, 'got ' + polyStepDur(c, BAR));
  assert.ok(Math.abs(polyHitsPerBar(c, BAR) - 4) < 1e-9);
  assert.deepEqual(polyRatio(c, BAR), { num: 1, den: 1 });
});

test('the musical cases come out right', () => {
  // eighths
  assert.ok(Math.abs(polyStepDur(pad(200), BAR) - 0.3) < 1e-12);
  assert.deepEqual(polyRatio(pad(200), BAR), { num: 2, den: 1 });
  // triplets: three per beat
  assert.ok(Math.abs(polyStepDur(pad(300), BAR) - 0.2) < 1e-12);
  assert.deepEqual(polyRatio(pad(300), BAR), { num: 3, den: 1 });
  // sixteenths
  assert.ok(Math.abs(polyStepDur(pad(400), BAR) - 0.15) < 1e-12);
  // THREE AGAINST FOUR: 75 against 100
  const three = pad(75);
  assert.ok(Math.abs(polyStepDur(three, BAR) - 0.8) < 1e-12);
  assert.ok(Math.abs(polyHitsPerBar(three, BAR) - 3) < 1e-9);
  assert.deepEqual(polyRatio(three, BAR), { num: 3, den: 4 });
});

test('CELLS is independent of speed', () => {
  /* The old design made one number mean both, which is most of why it was
     confusing. Changing the row length must not change the rate. */
  const a = pad(75, 3), b = pad(75, 5), c = pad(75, 16);
  assert.equal(polyStepDur(a, BAR), polyStepDur(b, BAR));
  assert.equal(polyStepDur(b, BAR), polyStepDur(c, BAR));
  // and changing the rate must not change the row length
  assert.equal(pad(75, 5).cells, 5);
  assert.equal(pad(300, 5).cells, 5);
});

test('LOCK rounds to a whole number of hits per bar', () => {
  // 137 against 100 is 5.48 hits per bar; locked, that becomes 5
  const free = pad(137, 4, false), locked = pad(137, 4, true);
  assert.ok(Math.abs(polyHitsPerBar(free, BAR) - 5.48) < 1e-9);
  assert.equal(polyLockedHitsPerBar(locked, BAR), 5);
  assert.ok(Math.abs(polyEffectiveBpm(locked, BAR) - 125) < 1e-9,
    'locked 137 should play at 125, got ' + polyEffectiveBpm(locked, BAR));
  // unlocked keeps exactly what was asked for
  assert.ok(Math.abs(polyEffectiveBpm(free, BAR) - 137) < 1e-9);
});

test('a locked pad always returns to the downbeat; an off-grid free one does not', () => {
  assert.equal(polyDoesLock(pad(137, 4, true), BAR), true);
  assert.equal(polyDoesLock(pad(137, 4, false), BAR), false);
  /* But an unlocked pad that happens to divide the bar evenly DOES lock, and
     saying otherwise would be a lie the panel repeats back. */
  assert.equal(polyDoesLock(pad(200, 4, false), BAR), true);
  assert.equal(polyDoesLock(pad(75, 4, false), BAR), true);
});

test('damaged settings degrade to something playable', () => {
  const bad = polyCfg(patWith(0, { on: true, bpm: 0, cells: 0 }), 0);
  assert.ok(bad.bpm > 0 && bad.cells >= POLY_MIN_CELLS);
  assert.ok(polyStepDur(bad, BAR) > 0);
  const huge = polyCfg(patWith(0, { on: true, bpm: 1e9, cells: 1e9 }), 0);
  assert.equal(huge.cells, POLY_MAX_CELLS);
  assert.ok(huge.bpm <= 1200);
  const nan = polyCfg(patWith(0, { on: true, bpm: 'x', cells: null }), 0);
  assert.ok(isFinite(nan.bpm) && nan.bpm > 0 && isFinite(nan.cells));
  assert.ok(polyStepDur(nan, BAR) > 0);
});

test('projects saved by the first version still play the same rhythm', () => {
  /* R144-R146 stored {mode, len, bars}. Those settings exist in saved projects
     and must not change what they sound like. */
  const oldThree = polyCfg(patWith(0, { on: true, mode: 'lock', len: 3, bars: 1 }), 0);
  assert.ok(Math.abs(polyStepDur(oldThree, BAR) - BAR / 3) < 1e-12,
    '3-per-bar should still be a third of a bar');
  assert.equal(oldThree.cells, 3);

  const oldSeven = polyCfg(patWith(0, { on: true, mode: 'lock', len: 7, bars: 2 }), 0);
  assert.ok(Math.abs(polyStepDur(oldSeven, BAR) - (BAR * 2) / 7) < 1e-12,
    '7-over-2-bars should still be two bars divided by seven');

  /* The old free mode counted its BPM in sixteenths, so 137 there meant 548
     hits per minute. The number in the panel changes; the sound does not. */
  const oldFree = polyCfg(patWith(0, { on: true, mode: 'free', bpm: 137, len: 4 }), 0);
  assert.ok(Math.abs(polyStepDur(oldFree, BAR) - 60 / 137 / 4) < 1e-9,
    'old free spacing should be preserved, got ' + polyStepDur(oldFree, BAR));
  assert.equal(oldFree.lock, false);
});

test('THREE AGAINST FOUR coincides on the downbeat and nowhere else', () => {
  const three = pad(75, 3);            // 3 hits per bar
  const four = pad(100, 4);            // 4 hits per bar
  const t0 = 0.05, end = t0 + BAR * 4;
  const a = [], b = [];
  for (let bar = 0; bar < 4; bar++) {
    const at = t0 + bar * BAR;
    a.push(...polyEvents(three, at, bar * 3, at, at + BAR, BAR).map(e => e.when));
    b.push(...polyEvents(four, at, bar * 4, at, at + BAR, BAR).map(e => e.when));
  }
  assert.equal(a.length, 12);
  assert.equal(b.length, 16);
  const coincide = a.filter(x => b.some(y => Math.abs(x - y) < 1e-9));
  assert.equal(coincide.length, 4, 'expected one per bar, got ' + coincide.length);
  coincide.forEach(w => {
    const bars = (w - t0) / BAR;
    assert.ok(Math.abs(bars - Math.round(bars)) < 1e-9, 'coincidence at ' + w + ' is off the bar');
  });
});

test('the cell walks on independently of the bar', () => {
  /* 3 hits per bar into a 5-cell row: the times lock to the bar, the cells take
     five hits to come round. Polyrhythm and polymeter at once. */
  const c = pad(75, 5);
  const idx = [];
  for (let bar = 0; bar < 3; bar++) {
    const at = bar * BAR;
    idx.push(...polyEvents(c, at, bar * 3, at, at + BAR, BAR).map(e => e.idx));
  }
  assert.deepEqual(idx, [0, 1, 2, 3, 4, 0, 1, 2, 3]);
});

test('a free pad drifts against the bar', () => {
  const c = pad(137, 4, false);
  const step = polyStepDur(c, BAR);
  const ev = polyEvents(c, 0, 0, 0, step * 10.5, BAR);
  assert.equal(ev.length, 11);
  ev.forEach((e, i) => assert.ok(Math.abs(e.when - i * step) < 1e-9));
  const phase = w => ((w % BAR) + BAR) % BAR;
  assert.ok(Math.abs(phase(ev[0].when) - phase(ev[10].when)) > 1e-6);
});

test('adjacent windows fire every hit exactly once', () => {
  for (const c of [pad(75, 3), pad(300, 5), pad(137, 4, false)]) {
    const t0 = 0.05, end = t0 + BAR * 4;
    const whole = polyEvents(c, t0, 0, t0, end, BAR).map(e => e.when);
    const pieces = [];
    const W = 0.12;
    for (let a = t0; a < end; a += W)
      pieces.push(...polyEvents(c, t0, 0, a, Math.min(a + W, end), BAR).map(e => e.when));
    assert.equal(pieces.length, whole.length,
      c.bpm + ' BPM: windowed ' + pieces.length + ' vs whole ' + whole.length);
    whole.forEach((w, i) => assert.ok(Math.abs(w - pieces[i]) < 1e-9));
    assert.equal(new Set(pieces.map(x => x.toFixed(9))).size, pieces.length, 'a hit fired twice');
  }
});

test('a hit exactly on a window boundary is never lost or doubled', () => {
  /* The live scheduler accumulates its windows while deriving the anchor by
     subtraction; the two differ in the last bits and the first hit of every bar
     sits exactly on the seam. Without a tolerance it is dropped by both windows
     or fired by both — an intermittently missing hit. */
  const c = pad(75, 3);
  const STEPS = 16, sd = BAR / STEPS;
  for (const start of [0.05, 0.0812345, 1.7300000001, 12.345678]) {
    let t = start; const fired = [];
    for (let st = 0; st < STEPS * 8; st++) {
      const bar = Math.floor(st / STEPS);
      const barStart = t - (st % STEPS) * sd;
      for (const e of polyEvents(c, barStart, bar * 3, t, t + sd, BAR)) fired.push(e.when);
      t += sd;
    }
    assert.equal(fired.length, 8 * 3, 'start ' + start + ': fired ' + fired.length + ' of 24');
    fired.sort((a, b) => a - b);
    for (let i = 1; i < fired.length; i++)
      assert.ok(Math.abs((fired[i] - fired[i - 1]) - BAR / 3) < 1e-6,
        'start ' + start + ': gap ' + (fired[i] - fired[i - 1]));
  }
});

test('the playhead uses the same clock as the hits', () => {
  const c = pad(75, 3);
  const step = polyStepDur(c, BAR);
  assert.equal(polyIndexAt(c, 0, 0, 0, BAR), 0);
  assert.equal(polyIndexAt(c, 0, 0, step * 1.5, BAR), 1);
  assert.equal(polyIndexAt(c, 0, 0, step * 2.5, BAR), 2);
  assert.equal(polyIndexAt(c, 0, 0, step * 3.5, BAR), 0);
});

test('nothing is produced for a nonsense window or tempo', () => {
  const c = pad(75, 3);
  assert.deepEqual(polyEvents(c, 0, 0, 1, 1, BAR), []);
  assert.deepEqual(polyEvents(c, 0, 0, 2, 1, BAR), []);
  assert.deepEqual(polyEvents(c, 0, 0, 0, 10, 0), []);
  assert.deepEqual(polyEvents(null, 0, 0, 0, 10, BAR), []);
});
