import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  polyCfg, isPoly, polyStepDur, polyCycleDur, polyBpm, polyRatio,
  polyEvents, polyIndexAt, POLY_MAX, POLY_MIN,
} from '../src/pure/poly.js';

const patWith = (p, c) => ({ poly: { [p]: c } });
const BAR = 2.4;            // one bar at 100 BPM: 60/100*4

test('a track with no poly settings is an ordinary grid track', () => {
  assert.equal(polyCfg({}, 0), null);
  assert.equal(polyCfg({ poly: {} }, 0), null);
  assert.equal(polyCfg(patWith(0, { on: false, len: 3 }), 0), null);
  assert.equal(isPoly(patWith(0, { on: true, len: 3 }), 0), true);
});

test('damaged settings degrade to something playable rather than dividing by zero', () => {
  const bad = polyCfg(patWith(0, { on: true, len: 0, bars: -4 }), 0);
  assert.ok(bad.len >= POLY_MIN, 'len clamped up, got ' + bad.len);
  assert.ok(bad.bars >= 1, 'bars clamped up, got ' + bad.bars);
  assert.ok(polyStepDur(bad, BAR) > 0);

  const huge = polyCfg(patWith(0, { on: true, len: 9999, bars: 9999 }), 0);
  assert.equal(huge.len, POLY_MAX);
  assert.ok(huge.bars <= 8);

  const nan = polyCfg(patWith(0, { on: true, len: 'x', bars: null }), 0);
  assert.ok(nan.len >= POLY_MIN && isFinite(nan.len));

  const freeBad = polyCfg(patWith(0, { on: true, mode: 'free', bpm: 0 }), 0);
  assert.ok(freeBad.bpm > 0, 'a zero BPM would be an infinite step');
});

test('a locked cycle divides its bars evenly', () => {
  const three = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  assert.equal(polyCycleDur(three, BAR), BAR);
  assert.ok(Math.abs(polyStepDur(three, BAR) - BAR / 3) < 1e-12);

  const seven = polyCfg(patWith(0, { on: true, len: 7, bars: 2 }), 0);
  assert.equal(polyCycleDur(seven, BAR), BAR * 2);
  assert.ok(Math.abs(polyStepDur(seven, BAR) - (BAR * 2) / 7) < 1e-12);
});

test('16 in one bar is exactly the ordinary grid', () => {
  const c = polyCfg(patWith(0, { on: true, len: 16, bars: 1 }), 0);
  assert.ok(Math.abs(polyStepDur(c, BAR) - BAR / 16) < 1e-12);
  assert.deepEqual(polyRatio(c, 16), { num: 1, den: 1 });
});

test('a free track derives from its own BPM alone', () => {
  const c = polyCfg(patWith(0, { on: true, mode: 'free', bpm: 120, len: 4 }), 0);
  assert.ok(Math.abs(polyStepDur(c, BAR) - 60 / 120 / 4) < 1e-12);
  // and it ignores the main tempo entirely
  assert.equal(polyStepDur(c, BAR), polyStepDur(c, BAR * 3));
});

test('a free track at the main tempo lands on the grid', () => {
  // the mode should be obvious: same tempo, same spacing as an ordinary track
  const main = 100, bar = 60 / main * 4;
  const c = polyCfg(patWith(0, { on: true, mode: 'free', bpm: main, len: 16 }), 0);
  assert.ok(Math.abs(polyStepDur(c, bar) - bar / 16) < 1e-12);
});

test('the ratio reads the way a musician would say it', () => {
  const trip16 = polyCfg(patWith(0, { on: true, len: 12, bars: 1 }), 0);
  assert.deepEqual(polyRatio(trip16, 16), { num: 3, den: 4 });     // triplet sixteenths
  const three = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  assert.deepEqual(polyRatio(three, 16), { num: 3, den: 16 });
  const seven = polyCfg(patWith(0, { on: true, len: 7, bars: 2 }), 0);
  assert.deepEqual(polyRatio(seven, 16), { num: 7, den: 32 });
});

test('a locked track reports the tempo it amounts to', () => {
  // 12 hits per bar against a 16-step bar at 100 BPM is 75 BPM of sixteenths
  const c = polyCfg(patWith(0, { on: true, len: 12, bars: 1 }), 0);
  assert.ok(Math.abs(polyBpm(c, 100, 16) - 75) < 1e-9);
  // and the identity case reports the main tempo back
  const same = polyCfg(patWith(0, { on: true, len: 16, bars: 1 }), 0);
  assert.ok(Math.abs(polyBpm(same, 100, 16) - 100) < 1e-9);
});

test('THREE AGAINST FOUR coincides on the downbeat and nowhere else', () => {
  /* The property the whole feature exists for. Over four bars a 3-track and a
     4-track may only ever agree at a bar line; anywhere else would mean the
     ratio is wrong or something is rounding. */
  const three = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  const four = polyCfg(patWith(1, { on: true, len: 4, bars: 1 }), 1);
  const t0 = 0.05, end = t0 + BAR * 4;
  const a = polyEvents(three, t0, t0, end, BAR).map(e => e.when);
  const b = polyEvents(four, t0, t0, end, BAR).map(e => e.when);
  assert.equal(a.length, 12);
  assert.equal(b.length, 16);

  const coincide = a.filter(x => b.some(y => Math.abs(x - y) < 1e-9));
  assert.equal(coincide.length, 4, 'expected one coincidence per bar, got ' + coincide.length);
  coincide.forEach(w => {
    const barsIn = (w - t0) / BAR;
    assert.ok(Math.abs(barsIn - Math.round(barsIn)) < 1e-9,
      'coincidence at ' + w + ' is not on a bar line');
  });
});

test('a locked track re-anchors instead of accumulating', () => {
  /* Derived from the cycle each time, so the thousandth bar is as exact as the
     first. An accumulating scheduler drifts here. */
  const c = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  const t0 = 0.05;
  const far = polyEvents(c, t0, t0 + BAR * 1000, t0 + BAR * 1001, BAR);
  assert.equal(far.length, 3);
  assert.ok(Math.abs(far[0].when - (t0 + BAR * 1000)) < 1e-9,
    'first hit of bar 1000 is off by ' + (far[0].when - (t0 + BAR * 1000)));
});

test('a free track deliberately does NOT re-anchor', () => {
  const c = polyCfg(patWith(0, { on: true, mode: 'free', bpm: 137, len: 4 }), 0);
  const t0 = 0, step = polyStepDur(c, BAR);
  const ev = polyEvents(c, t0, t0, t0 + step * 10.5, BAR);
  assert.equal(ev.length, 11);
  ev.forEach((e, i) => assert.ok(Math.abs(e.when - i * step) < 1e-9));
  // its phase against the bar keeps moving
  const phase = w => ((w % BAR) + BAR) % BAR;
  assert.ok(Math.abs(phase(ev[0].when) - phase(ev[10].when)) > 1e-6,
    'a free track that returns to the same phase is not free-running');
});

test('adjacent windows fire every hit exactly once', () => {
  /* The scheduler calls this repeatedly over abutting windows. A closed
     interval at both ends would double-trigger on the boundary, which is an
     audible flam rather than a rounding detail. */
  for (const cfg of [
    polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0),
    polyCfg(patWith(0, { on: true, len: 5, bars: 2 }), 0),
    polyCfg(patWith(0, { on: true, mode: 'free', bpm: 137, len: 4 }), 0),
  ]) {
    const t0 = 0.05, end = t0 + BAR * 4;
    const whole = polyEvents(cfg, t0, t0, end, BAR).map(e => e.when);
    const pieces = [];
    const W = 0.12;                                   // the live lookahead window
    for (let a = t0; a < end; a += W) pieces.push(...polyEvents(cfg, t0, a, Math.min(a + W, end), BAR).map(e => e.when));
    assert.equal(pieces.length, whole.length,
      cfg.mode + ' ' + cfg.len + ': windowed gave ' + pieces.length + ', whole gave ' + whole.length);
    whole.forEach((w, i) => assert.ok(Math.abs(w - pieces[i]) < 1e-9));
    // and no duplicates
    assert.equal(new Set(pieces.map(x => x.toFixed(9))).size, pieces.length, 'a hit fired twice');
  }
});

test('cell indices cycle through the row', () => {
  const c = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  const ev = polyEvents(c, 0, 0, BAR * 2, BAR);
  assert.deepEqual(ev.map(e => e.idx), [0, 1, 2, 0, 1, 2]);
});

test('the playhead tracks the same clock the hits use', () => {
  const c = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  const step = polyStepDur(c, BAR);
  assert.equal(polyIndexAt(c, 0, 0, BAR), 0);
  assert.equal(polyIndexAt(c, 0, step * 1.5, BAR), 1);
  assert.equal(polyIndexAt(c, 0, step * 2.5, BAR), 2);
  assert.equal(polyIndexAt(c, 0, step * 3.5, BAR), 0);
  assert.equal(polyIndexAt(c, 0, -1, BAR), -1, 'nothing is playing before the start');
});

test('nothing is produced for a nonsense window or tempo', () => {
  const c = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  assert.deepEqual(polyEvents(c, 0, 1, 1, BAR), []);
  assert.deepEqual(polyEvents(c, 0, 2, 1, BAR), []);
  assert.deepEqual(polyEvents(c, 0, 0, 10, 0), []);
  assert.deepEqual(polyEvents(null, 0, 0, 10, BAR), []);
});

test('a hit exactly on a window boundary is never lost or doubled', () => {
  /* The live scheduler asks one step at a time, and it builds each window by
     ACCUMULATING (nextStepTime += stepDur) while deriving the cycle start by
     SUBTRACTING from that accumulated value. Those two routes to the same
     instant differ in the last bits, so a hit sitting exactly on a window edge
     — which the first hit of every cycle does, by definition — can fall through
     the crack between two windows and simply not sound.

     It showed up as an intermittently missing hit in the browser: one run gave
     17 evenly spaced hits, the next gave 15 with an 800ms hole. Reproduced here
     by walking windows the same way the scheduler does. */
  const cfg = polyCfg(patWith(0, { on: true, len: 3, bars: 1 }), 0);
  const STEPS = 16, sd = BAR / STEPS;
  for (const start of [0.05, 0.0812345, 1.7300000001, 12.345678]) {
    let t = start, fired = [];
    for (let st = 0; st < STEPS * 8; st++) {
      const cycleStart = t - (st % STEPS) * sd;       // exactly what schedStep does
      for (const e of polyEvents(cfg, cycleStart, t, t + sd, BAR)) fired.push(e.when);
      t += sd;                                        // accumulated, like nextStepTime
    }
    const expect = 8 * 3;
    assert.equal(fired.length, expect,
      'start ' + start + ': fired ' + fired.length + ' of ' + expect);
    fired.sort((a, b) => a - b);
    for (let i = 1; i < fired.length; i++) {
      const gap = fired[i] - fired[i - 1];
      assert.ok(Math.abs(gap - BAR / 3) < 1e-6,
        'start ' + start + ': gap ' + gap.toFixed(6) + ' at hit ' + i + ' (expected ' + (BAR / 3).toFixed(6) + ')');
    }
  }
});
