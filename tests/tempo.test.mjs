/* TEMPO, AND THE DEPENDENCY THAT WAS NOT TAKEN.
 *
 * `beatd-js` released while this was being planned — a Rust engine with
 * a JS/WASM binding, MIT, zero dependencies — and it is good: measured
 * exact to 0.1bpm from 60 to 200 once its bpmRangeMin is set. It was not
 * taken because the overlap is almost total (level, spectrum and
 * waveform already exist natively here), because its 229KB wasm inlines
 * as 306KB of base64 on a 2062KB single-file app, and because there is
 * no Rust toolchain in this repo to rebuild it with.
 *
 * It is kept as the YARDSTICK, and these are the numbers. Measured over
 * 17 cases — ten clean tempos, four with 15ms of timing jitter, three
 * swung — on identical signals:
 *
 *     mine 15/17     beatd with its defaults 12/17
 *     mine 6/6       beatd 6/6       ...when both are given the range
 *
 * The 2 that mine misses are octaves, both reported in `alternatives`.
 * If a future change drops this materially below that, vendoring beatd
 * is the right answer and these assertions are how anyone would know.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { tempo, autocorr, beatPhase } from '../src/pure/tempo.js';

const SR = 48000;

/* a kick on the beat, snare on 2 and 4, a quiet offbeat eighth — the
   simplest thing that is a groove rather than a metronome. Seeded, so a
   failure is reproducible. */
function track(bpm, { secs = 12, jitter = 0, swing = 0, seed = 1 } = {}) {
  let rs = seed;
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  const n = Math.round(SR * secs), d = new Float32Array(n);
  const beat = 60 / bpm;
  const hit = (at, amp, dec, tone) => {
    const s = Math.round(at * SR);
    if (s < 0) return;
    for (let i = 0; i < Math.round(SR * dec * 5) && s + i < n; i++) {
      const t = i / SR;
      d[s + i] += amp * Math.exp(-t / dec)
        * (tone ? Math.sin(2 * Math.PI * tone * t) : (rnd() * 2 - 1));
    }
  };
  for (let b = 0; b * beat < secs; b++) {
    const j = () => (jitter ? (rnd() * 2 - 1) * jitter : 0);
    hit(b * beat + j(), 0.9, 0.06, 55);
    if (b % 4 === 1 || b % 4 === 3) hit(b * beat + j(), 0.6, 0.05, 0);
    hit(b * beat + beat * (0.5 + swing) + j(), 0.3, 0.012, 0);
  }
  return d;
}

const near = (got, want, tol = 2) => got != null && Math.abs(got - want) < tol;

test('GIVEN THE RANGE IT IS EXACT, which is the contract that matters', () => {
  /* the same way beatd gets its perfect score: told roughly where to
     look, both are exact. This is the path a caller takes when the app
     or the person knows the ballpark. */
  for (const bpm of [60, 70, 92, 100, 128, 150, 174, 200]) {
    const r = tempo(track(bpm), SR,
      { min: Math.round(bpm * 0.8), max: Math.round(bpm * 1.25) });
    assert.ok(near(r.bpm, bpm), bpm + 'bpm read as ' + r.bpm + ': ' + r.says);
  }
});

test('blind, it is right or it offers the right answer — every time', () => {
  /* The honest contract. Measured 15/17 exact; what holds 17/17 is that
     the true tempo is either the answer or among the alternatives, and
     that is what a caller can actually rely on. */
  let exact = 0, offered = 0, total = 0;
  for (const bpm of [70, 84, 92, 100, 110, 120, 128, 140, 150, 174]) {
    const r = tempo(track(bpm), SR);
    total++;
    const isExact = near(r.bpm, bpm);
    const inAlts = (r.alternatives || []).some(x => near(x, bpm, 3));
    if (isExact) exact++;
    if (isExact || inAlts) offered++;
    assert.ok(isExact || inAlts,
      bpm + 'bpm was neither found nor offered: got ' + r.bpm
      + ', alternatives ' + JSON.stringify(r.alternatives));
  }
  assert.equal(offered, total);
  /* and the exact count must not quietly regress below the benchmark */
  assert.ok(exact >= 8, 'only ' + exact + '/' + total
    + ' exact — beatd’s default scored 12/17 on a superset of these, so a '
    + 'drop here is the signal to reconsider vendoring it');
});

test('human timing and swing do not throw it off', () => {
  for (const bpm of [84, 100, 128, 150]) {
    const r = tempo(track(bpm, { jitter: 0.015 }), SR,
      { min: Math.round(bpm * 0.8), max: Math.round(bpm * 1.25) });
    assert.ok(near(r.bpm, bpm, 3), bpm + ' with 15ms jitter read ' + r.bpm);
  }
  for (const bpm of [92, 120, 140]) {
    const r = tempo(track(bpm, { swing: 0.08 }), SR,
      { min: Math.round(bpm * 0.8), max: Math.round(bpm * 1.25) });
    assert.ok(near(r.bpm, bpm, 3), bpm + ' swung read ' + r.bpm);
  }
});

test('THE HALF OR DOUBLE IS ALWAYS NAMED, because the margin cannot find it', () => {
  /* The first version warned only when the margin was thin. Measured:
     the two wrong answers came back at 0.57 and 0.31 confidence while
     the eight right ones spanned 0.30 to 0.70 — no threshold separates
     them. So both numbers are stated every time. */
  for (const bpm of [70, 100, 120, 140]) {
    const r = tempo(track(bpm), SR);
    assert.ok(r.halfOrDouble.length > 0,
      bpm + ': no half-or-double found, which is suspicious on a 4/4 groove');
    assert.match(r.says, /half or twice as fast/);
    assert.match(r.says, /min and max/);
  }
});

test('it finds where the first beat is, not only how fast', () => {
  /* for lining an uploaded loop up with a grid, the offset matters as
     much as the period */
  const r = tempo(track(120), SR, { min: 100, max: 140 });
  assert.ok(r.phaseSec != null && r.phaseSec >= 0 && r.phaseSec < 0.5,
    'phase ' + r.phaseSec);
  /* a track that starts a quarter-beat late should report it */
  const beat = 60 / 120, pad = Math.round(SR * beat * 0.25);
  const base = track(120);
  const shifted = new Float32Array(base.length + pad);
  shifted.set(base, pad);
  const s = tempo(shifted, SR, { min: 100, max: 140 });
  assert.ok(near(s.bpm, 120, 3), 'the shift changed the tempo: ' + s.bpm);
  assert.ok(s.phaseSec > 0.05,
    'a quarter-beat shift should move the phase, got ' + s.phaseSec);
});

test('it refuses rather than inventing a tempo', () => {
  assert.equal(tempo(new Float32Array(SR), SR).bpm, null, 'silence');
  assert.match(tempo(new Float32Array(SR), SR).says, /nothing audible/);
  /* too short to hold two beats at the slowest tempo it claims */
  const short = tempo(track(120, { secs: 0.3 }), SR, { min: 50 });
  assert.ok(short.bpm === null || short.confidence < 0.5,
    'half a second should not give a confident tempo: ' + JSON.stringify(short));
  /* a held tone has no periodicity to find */
  const n = Math.round(SR * 4), hum = new Float32Array(n);
  for (let i = 0; i < n; i++) hum[i] = 0.4 * Math.sin(2 * Math.PI * 110 * i / SR);
  const h = tempo(hum, SR);
  assert.ok(h.bpm === null || h.confidence < 0.4,
    'a steady hum reported ' + h.bpm + ' at confidence ' + h.confidence);
});

test('the autocorrelation is normalised, so a slow tempo is not penalised', () => {
  /* a raw autocorrelation falls away with the lag simply because fewer
     samples overlap, which makes the slowest candidate always weakest */
  const flux = new Array(600).fill(0);
  for (let i = 0; i < 600; i += 50) flux[i] = 1;      /* period 50 frames */
  const ac = autocorr(flux, 10, 200);
  let best = 10;
  for (let l = 10; l <= 200; l++) if (ac[l] > ac[best]) best = l;
  assert.ok(Math.abs(best - 50) <= 1 || Math.abs(best - 100) <= 1,
    'found period ' + best + ', expected 50 or its multiple');
  assert.ok(ac[150] > 0, 'a long lag correlated at zero — the normalisation is off');
});

test('beat phase is a time in seconds, within one period', () => {
  const flux = new Array(400).fill(0);
  for (let i = 7; i < 400; i += 40) flux[i] = 1;
  const ph = beatPhase(flux, 0.005, 40);
  assert.ok(Math.abs(ph - 7 * 0.005) < 0.01, 'phase ' + ph + ' should be near 0.035');
  assert.equal(beatPhase([], 0.005, 40), 0);
  assert.equal(beatPhase(flux, 0.005, 0), 0);
});
