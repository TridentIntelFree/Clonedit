/* ONSETS PUT WHERE THE ANSWER IS KNOWN, then found again.

   The rule this repo paid for twice: scripts/audit-pitch.mjs declared a
   correct library twelve semitones out because its first detector read
   harmonics as fundamentals, and it refuses to report now until it has
   passed signals whose answers it already knows. So every buffer here
   is built with its onsets at stated times and the assertion is that
   the detector finds those times — not that two runs agree. */

import { test } from 'node:test';
import assert from 'node:assert';
import { onsets, takeTiming, takeHealth, measureTake, sixteenthSec }
  from '../src/pure/take.js';

const SR = 44100;

/* a take with hits at the given times (seconds), each a short decaying
   tone, over a floor of room tone so nothing is being handed silence */
function take(times, { sr = SR, secs = null, hz = 200, decay = 0.08,
  amp = 0.7, noise = 0.002 } = {}) {
  const dur = secs != null ? secs : (Math.max(...times) + 0.5);
  const n = Math.round(sr * dur);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * noise;
  for (const t0 of times) {
    const start = Math.round(t0 * sr);
    for (let i = 0; i < Math.round(sr * decay * 6) && start + i < n; i++) {
      const tt = i / sr;
      d[start + i] += amp * Math.exp(-tt / decay) * Math.sin(2 * Math.PI * hz * tt);
    }
  }
  return d;
}

test('it finds the onsets that were put there, and not extra ones', () => {
  const times = [0.1, 0.35, 0.6, 0.85, 1.1];
  const found = onsets(take(times), SR);
  assert.equal(found.length, times.length,
    'expected ' + times.length + ' onsets, got ' + found.length + ': ' + found);
  found.forEach((t, i) => {
    assert.ok(Math.abs(t - times[i]) <= 0.012,
      'onset ' + i + ' at ' + t + ' should be near ' + times[i]);
  });
});

test('ROOM TONE AND BREATH ARE NOT ONSETS', () => {
  /* the floor is a fraction of the take's OWN peak, because a fixed
     threshold finds everything in a hot take and nothing in a quiet one */
  const quiet = take([0.2, 0.7], { amp: 0.04, noise: 0.004 });
  assert.equal(onsets(quiet, SR).length, 2, 'a quiet take still has two hits');
  /* and a take that is nothing BUT noise has none */
  const n = Math.round(SR * 2);
  const hiss = new Float32Array(n);
  for (let i = 0; i < n; i++) hiss[i] = (Math.random() * 2 - 1) * 0.01;
  assert.equal(onsets(hiss, SR).length, 0,
    'hiss alone should give no onsets, got ' + onsets(hiss, SR).length);
});

test('a sustained note is one onset, not a stream of them', () => {
  /* the fault that makes a timing median meaningless: a held note whose
     level wobbles, read as a new attack every few windows */
  const n = Math.round(SR * 2);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wobble = 1 + 0.25 * Math.sin(2 * Math.PI * 5 * t);
    const atk = Math.min(1, t / 0.02);
    d[i] = 0.5 * atk * wobble * Math.sin(2 * Math.PI * 220 * t);
  }
  const found = onsets(d, SR);
  assert.ok(found.length <= 2,
    'a wobbling held note should not read as many attacks, got ' + found.length);
});

test('one ragged attack is one onset', () => {
  /* a doubled onset is worse than a missed one, because it drags the
     timing median around — that is what the refractory gap is for */
  const n = Math.round(SR * 1);
  const d = new Float32Array(n);
  const start = Math.round(SR * 0.2);
  for (let i = 0; i < n - start; i++) {
    const t = i / SR;
    /* a scratchy attack: two bursts 8ms apart, which is one stroke */
    const a = Math.exp(-t / 0.1) * (1 + (t > 0.008 && t < 0.012 ? 0.6 : 0));
    d[start + i] = 0.7 * a * Math.sin(2 * Math.PI * 180 * t);
  }
  assert.equal(onsets(d, SR).length, 1, 'got ' + onsets(d, SR));
});

/* ---- TIMING -------------------------------------------------------- */

test('a take exactly on the grid reads as on the grid', () => {
  const bpm = 100, s16 = sixteenthSec(bpm);          /* 0.15s */
  const times = [0, 1, 2, 3, 4, 5, 6, 7].map(i => +(i * s16).toFixed(4));
  const t = takeTiming(times, bpm);
  assert.equal(t.onsets, 8);
  assert.ok(Math.abs(t.offsetMs) <= 2, 'offset should be ~0, got ' + t.offsetMs);
  assert.ok(Math.abs(t.spreadMs) <= 2, 'spread should be ~0, got ' + t.spreadMs);
  assert.equal(t.tight, true);
});

test('A CONSTANT LAG IS REPORTED SEPARATELY FROM A LOOSE ONE', () => {
  /* the distinction the whole measurement exists for. A player 30ms
     behind the click all the way through is TIGHT and can be nudged in
     one move; a player averaging zero with a wide spread cannot. The
     corpus study had to learn this — its first run reported every
     position early by the same 9.3ms, which is a constant, not a
     groove. */
  const bpm = 100, s16 = sixteenthSec(bpm);
  const steady = [0, 1, 2, 3, 4, 5, 6, 7].map(i => i * s16 + 0.030);
  const a = takeTiming(steady, bpm);
  assert.ok(a.offsetMs >= 25 && a.offsetMs <= 35, 'offset ' + a.offsetMs);
  assert.ok(a.spreadMs <= 3, 'a steady lag should have no spread, got ' + a.spreadMs);
  assert.equal(a.tight, true, 'steady and late is still tight: ' + a.says);
  assert.match(a.says, /behind the click/);

  /* the same mean, scattered */
  const loose = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i, k) => i * s16 + (k % 2 ? 0.075 : -0.015));
  const b = takeTiming(loose, bpm);
  assert.ok(b.spreadMs > 25, 'scattered playing should show spread, got ' + b.spreadMs);
  assert.equal(b.tight, false);
  assert.match(b.says, /loose/);
});

test('positive is late, the same way the corpus study means it', () => {
  const bpm = 120, s16 = sixteenthSec(bpm);
  assert.ok(takeTiming([s16 + 0.02, 2 * s16 + 0.02], bpm).offsetMs > 0, 'late is positive');
  assert.ok(takeTiming([s16 - 0.02, 2 * s16 - 0.02], bpm).offsetMs < 0, 'early is negative');
});

test('tight is judged against measured human playing, not against zero', () => {
  /* a drummer scoring zero would be a machine, and pulse() already
     reports 100% for a human because its window is five times wider
     than the thing being measured */
  const bpm = 84, s16 = sixteenthSec(bpm);
  const human = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i, k) => i * s16 + [0.004, -0.006, 0.009, -0.003, 0.007, -0.008, 0.002, -0.005][k]);
  const t = takeTiming(human, bpm);
  assert.equal(t.tight, true, 'human-sized deviation should pass: ' + t.says);
  assert.equal(t.humanFrac, 0.075);
  assert.ok(t.spreadFrac <= 0.075, 'spreadFrac ' + t.spreadFrac);
});

test('nothing found is said plainly, not reported as perfect timing', () => {
  const t = takeTiming([], 120);
  assert.equal(t.onsets, 0);
  assert.match(t.says, /nothing to measure/);
  assert.equal(t.offsetMs, undefined, 'it must not invent a zero offset');
});

/* ---- HEALTH -------------------------------------------------------- */

test('silence is caught and named as the recording fault it is', () => {
  const h = takeHealth(new Float32Array(SR), SR);
  assert.equal(h.silent, true);
  assert.deepEqual(h.faults, ['silent']);
  assert.match(h.says, /arm|input|mic/);
  assert.equal(takeHealth(new Float32Array(0), SR).empty, true);
});

test('CLIPPING IS COUNTED IN RUNS, because one sample at the rail is a transient', () => {
  const clean = take([0.2, 0.5], { amp: 0.95 });
  /* a single sample pinned at full scale must NOT be called clipping */
  clean[1000] = 1.0;
  const a = takeHealth(clean, SR);
  assert.equal(a.clipRuns, 0, 'one sample is a transient, not distortion');
  assert.ok(!a.faults.includes('clipped'));

  /* forty in a row is a square wave */
  const bad = take([0.2], { amp: 0.95 });
  for (let i = 2000; i < 2040; i++) bad[i] = 1.0;
  const b = takeHealth(bad, SR);
  assert.ok(b.clipRuns >= 1, 'a 40-sample run is clipping');
  assert.ok(b.faults.includes('clipped'));
  assert.match(b.says, /distortion, not loudness/);
});

test('a DC offset is caught, because it is invisible by ear', () => {
  const d = take([0.2, 0.6]);
  for (let i = 0; i < d.length; i++) d[i] += 0.05;
  const h = takeHealth(d, SR);
  assert.ok(h.faults.includes('dc'), JSON.stringify(h.faults));
  assert.match(h.says, /headroom/);
  /* and a clean take must not be flagged, or the check is noise */
  assert.deepEqual(takeHealth(take([0.2, 0.6]), SR).faults, []);
});

test('a clean take is reported clean, with the numbers', () => {
  const h = takeHealth(take([0.2, 0.5, 0.8]), SR);
  assert.equal(h.silent, false);
  assert.deepEqual(h.faults, []);
  assert.match(h.says, /clean/);
  assert.ok(h.peakDb < 0 && h.peakDb > -20, 'peakDb ' + h.peakDb);
  assert.ok(h.rmsDb < h.peakDb, 'rms must sit below peak');
});

/* ---- THE WHOLE CALL ------------------------------------------------ */

test('health comes first, and a silent take gets no timing report', () => {
  /* a timing report on a silent take is noise about nothing — the same
     fault review() was fixed for twice, burying real findings under
     spurious ones */
  const m = measureTake(new Float32Array(SR), SR, 120);
  assert.equal(m.timing, null);
  assert.match(m.says, /nothing audible/);
  assert.ok(!/onsets\./.test(m.says), 'it should not also discuss timing');
});

test('a real take comes back with both halves and a sentence', () => {
  const bpm = 100, s16 = sixteenthSec(bpm);
  const times = [0, 2, 4, 6, 8].map(i => +(i * s16 + 0.018).toFixed(4));
  const m = measureTake(take(times), SR, bpm);
  assert.deepEqual(m.faults, []);
  assert.equal(m.timing.onsets, times.length);
  assert.ok(m.timing.offsetMs >= 10 && m.timing.offsetMs <= 28,
    'should see the 18ms lag, got ' + m.timing.offsetMs);
  assert.match(m.says, /clean/);
  assert.match(m.says, /behind the click/);
  /* and it must say the feel is allowed to be the point */
  assert.match(m.says, /if the feel is|neither is wrong/);
});
