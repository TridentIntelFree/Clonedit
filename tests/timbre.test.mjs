/* MEASURED AGAINST SIGNALS WHOSE ANSWERS ARE KNOWN.

   This is the rule `scripts/audit-pitch.mjs` had to learn the hard way:
   its first pitch detector read harmonics as fundamentals and declared a
   correct library twelve semitones out, and it refuses to report now
   until it has passed signals it already knows the answer for. A
   detector nobody has run against a known input is not a detector.

   So every buffer here is built with the attack and the ring written
   into it, and the assertion is that the measurement finds what was put
   there — not that two runs of the same code agree. */

import { test } from 'node:test';
import assert from 'node:assert';
import { envelopeRms, attackRing, timbreOf, stepMs, playable, minGap }
  from '../src/pure/timbre.js';

const SR = 44100;

/* a tone with a linear attack then an exponential decay, both in seconds */
function hit(attackSec, decaySec, { sr = SR, hz = 220, tail = 0.2 } = {}) {
  const n = Math.round(sr * (attackSec + decaySec + tail));
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let a;
    if (t < attackSec) a = attackSec > 0 ? t / attackSec : 1;
    else {
      /* -60dB over decaySec, so the 20dB point lands at a third of it */
      a = Math.pow(10, -3 * (t - attackSec) / decaySec);
    }
    d[i] = a * Math.sin(2 * Math.PI * hz * t);
  }
  return d;
}

test('the envelope has one window per 5ms and follows the amplitude', () => {
  const d = hit(0.1, 0.4);
  const env = envelopeRms(d, SR);
  assert.equal(env.length, Math.floor(d.length / Math.floor(SR * 0.005)));
  /* it has to RISE across the attack and FALL after it, or it is not an
     envelope however plausible the numbers look */
  assert.ok(env[2] < env[12], 'should rise through the attack');
  assert.ok(env[env.length - 2] < env[20], 'should fall after the peak');
});

test('a fast attack reads fast and a slow attack reads slow', () => {
  const fast = timbreOf(hit(0.002, 0.3), SR);
  const slow = timbreOf(hit(0.250, 0.3), SR);
  assert.ok(fast.attackMs <= 15, 'a 2ms attack should read near zero, got ' + fast.attackMs);
  /* 90% of the envelope peak on a linear ramp lands near the top of the
     ramp, so a 250ms attack reads in the 200s rather than at exactly 250 */
  assert.ok(slow.attackMs >= 180 && slow.attackMs <= 280,
    'a 250ms attack should read about 200-250ms, got ' + slow.attackMs);
  assert.ok(slow.attackMs > fast.attackMs * 10, 'and clearly slower than the fast one');
});

test('the ring tracks the decay it was built with', () => {
  const short = timbreOf(hit(0.002, 0.15), SR);
  const long = timbreOf(hit(0.002, 1.5), SR);
  /* -20dB is a third of the way down a -60dB decay */
  assert.ok(short.ringMs >= 25 && short.ringMs <= 90,
    '150ms to -60dB should ring about 50ms to -20dB, got ' + short.ringMs);
  assert.ok(long.ringMs >= 350 && long.ringMs <= 700,
    '1.5s to -60dB should ring about 500ms, got ' + long.ringMs);
  assert.ok(long.ringMs > short.ringMs * 5);
});

test('a sound still carrying at the end of the buffer says so', () => {
  /* a pad trimmed before it has decayed: reporting the buffer length as
     the decay would be a measurement of the TRIM, not of the sound */
  const n = Math.round(SR * 0.5);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / SR);
  const t = timbreOf(d, SR);
  assert.equal(t.ringClipped, true, 'should flag that it never reached -20dB');
  assert.ok(t.ringMs >= 400, 'and report at least the rest of the buffer');
});

test('digital silence is distinguished from instant and dry', () => {
  const t = timbreOf(new Float32Array(SR), SR);
  assert.equal(t.silent, true);
  assert.equal(t.peak, 0);
  /* and a real sound must NOT be flagged silent, or the flag is useless */
  assert.equal(timbreOf(hit(0.002, 0.2), SR).silent, false);
});

test('a sixteenth is the length the tempo says', () => {
  assert.equal(Math.round(stepMs(92)), 163);
  assert.equal(Math.round(stepMs(174)), 86);
  assert.equal(Math.round(stepMs(120)), 125);
});

/* ---- THE PART THAT CHANGES WHAT GETS WRITTEN ---------------------- */

test('a bowed swell is refused on a fast grid and allowed on a slow one', () => {
  const bowed = timbreOf(hit(0.220, 1.2), SR);     /* ~200ms to speak */
  const fast = playable(bowed, 174, 1);            /* sixteenths at 174 = 86ms */
  assert.equal(fast.speaks, false, 'should refuse: ' + JSON.stringify(fast));
  assert.match(fast.says, /will not be heard/);
  /* the same sound on whole notes at 92 has all the time it needs */
  assert.equal(playable(bowed, 92, 16).speaks, true);
});

test('a pluck is fine at any of it', () => {
  const pluck = timbreOf(hit(0.002, 0.12), SR);
  for (const bpm of [64, 92, 120, 174]) {
    assert.equal(playable(pluck, bpm, 1).speaks, true, 'pluck should speak at ' + bpm);
  }
});

test('overlap is reported as a fact, not as a fault', () => {
  const ringy = timbreOf(hit(0.002, 3.0), SR);
  const p = playable(ringy, 120, 1);
  assert.equal(p.speaks, true, 'it speaks — the attack is instant');
  assert.ok(p.overlap >= 2, 'and it piles up: ' + p.overlap);
  assert.match(p.says, /rings for/);
  /* and a dry sound reports no overlap at all rather than a small one */
  assert.equal(playable(timbreOf(hit(0.002, 0.1), SR), 92, 4).overlap, 0);
});

test('minGap says how far apart the notes have to be', () => {
  const bowed = timbreOf(hit(0.220, 1.2), SR);
  assert.equal(minGap(timbreOf(hit(0.002, 0.2), SR), 174), 1, 'a pluck needs no gap');
  const g = minGap(bowed, 174);
  assert.ok(g >= 4, 'a 200ms attack at 86ms sixteenths needs several steps, got ' + g);
  /* and the gap it names must actually work, or it is advice that fails */
  assert.equal(playable(bowed, 174, g).speaks, true,
    'the gap minGap() returns has to be one playable() accepts');
});

test('it does not throw on the degenerate inputs it will be handed', () => {
  assert.equal(timbreOf(new Float32Array(0), SR).silent, true);
  assert.equal(attackRing([], 0.005).silent, true);
  assert.equal(attackRing(null, 0.005).silent, true);
  assert.ok(playable(null, 120, 1).says.length > 0);
  assert.equal(minGap(null, 120), 1);
});
