/* IS OUR MELODIC MATERIAL ALREADY 1/f, AND DOES IT ALREADY MATCH THE
   INTERVAL NORMS?

   Two pieces of generative advice arrived together:

     "Move beyond basic Markov chains: use higher-order Markov chains,
      n-grams, or Variable-Order Markov Models that look back 4 to 8
      notes rather than just the immediate predecessor."

     "Incorporate Pink Noise (1/f): use pink noise distributions instead
      of uniform random choices for picking note durations and pitch
      intervals. It mimics the natural statistical balance of real human
      music — where large leaps are rare and small steps are common."

   Both are sound advice in general and both are testable here, which is
   the only reason to have an opinion. This script answers them with
   numbers instead of a view.

   WHAT IT MEASURES, on src/pure/contours.js — the baked magenta
   chord_pitches_improv contours that infill() and ensemble() write from:

   1. THE INTERVAL DISTRIBUTION, in the four classes
      scripts/study-melody.py counted over 441,316 intervals of the
      Essen Folksong Collection. "Small steps common, large leaps rare"
      is not a thing to approximate with pink noise here — it is a thing
      this repo already measured, and the question is whether our
      material matches it.

   2. THE SPECTRAL SLOPE beta of the pitch walk, fitted as log power
      against log frequency. This is the half of the 1/f claim that a
      histogram CANNOT capture: a sequence can have a perfect interval
      distribution and still be white noise in its ordering. Voss &
      Clarke (1975) found real music sits near beta = 1. White noise is
      0, a random walk is 2, and the controls below are generated here
      rather than quoted so the numbers are comparable.

   Run: node scripts/study-contour-noise.mjs
   It only reads, prints, and writes nothing. */

import { MAGENTA_CONTOURS } from '../src/pure/contours.js';

/* the norms as measured in scripts/study-melody.py and stored in
   MELODY_NORMS in src/legacy.js */
const ESSEN = { repeat: 21.1, step: 46.9, third: 19.0, leap: 13.1 };
const SOURCE = 'Essen Folksong Collection, 8514 melodies, 441,316 intervals';

/* ---- 1. the interval distribution ---------------------------------- */

function classOf(semitones) {
  const a = Math.abs(semitones);
  return a === 0 ? 'repeat' : a <= 2 ? 'step' : a <= 4 ? 'third' : 'leap';
}

let n = 0;
const count = { repeat: 0, step: 0, third: 0, leap: 0 };
const lens = [];
for (const c of MAGENTA_CONTOURS) {
  lens.push(c.iv.length + 1);
  for (const d of c.iv) { count[classOf(d)]++; n++; }
}
lens.sort((a, b) => a - b);

console.log('contours: ' + MAGENTA_CONTOURS.length + ', intervals: ' + n);
console.log('notes per contour: min ' + lens[0] + ', median ' + lens[lens.length >> 1]
  + ', max ' + lens[lens.length - 1]);
console.log('\nINTERVAL CLASS   ours    ' + 'Essen'.padStart(6) + '   diff');
let worst = 0;
for (const k of ['repeat', 'step', 'third', 'leap']) {
  const p = 100 * count[k] / n, d = p - ESSEN[k];
  worst = Math.max(worst, Math.abs(d));
  console.log('  ' + k.padEnd(13) + p.toFixed(1).padStart(5)
    + ESSEN[k].toFixed(1).padStart(9) + ((d >= 0 ? '  +' : '  ') + d.toFixed(1)).padStart(8));
}
console.log('  source: ' + SOURCE);
console.log('  worst class is ' + worst.toFixed(1) + ' points out.');

/* ---- 2. the spectral slope ----------------------------------------- */

/* beta from a log-log fit of the periodogram. A naive DFT, because the
   longest sequence here is 48 points and an FFT would need padding that
   changes the low-frequency bins this measurement lives in. */
function beta(x) {
  const N = x.length;
  if (N < MIN) return null;
  const mean = x.reduce((a, b) => a + b, 0) / N;
  const pts = [];
  for (let k = 1; k < N / 2; k++) {
    let sr = 0, si = 0;
    for (let t = 0; t < N; t++) {
      const a = -2 * Math.PI * k * t / N;
      sr += (x[t] - mean) * Math.cos(a);
      si += (x[t] - mean) * Math.sin(a);
    }
    const p = (sr * sr + si * si) / N;
    if (p > 1e-12) pts.push([Math.log(k / N), Math.log(p)]);
  }
  if (pts.length < 5) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const p of pts) { num += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) ** 2; }
  return den > 0 ? -num / den : null;
}

const MIN = 16;
const walkOf = iv => {
  const w = [0];
  for (const d of iv) w.push(w[w.length - 1] + d);
  return w;
};

const bs = [];
for (const c of MAGENTA_CONTOURS) {
  const b = beta(walkOf(c.iv));
  if (b != null && isFinite(b)) bs.push(b);
}
bs.sort((a, b) => a - b);

/* CONTROLS GENERATED HERE, not quoted, so they are measured by exactly
   the same estimator on exactly the same lengths. A beta from one
   method set against a beta from another is the "two measurements
   wearing the same word" mistake AGENTS.md warns about over pulse(). */
let seed = 12345;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const sampleLens = bs.length ? MAGENTA_CONTOURS.filter(c => c.iv.length + 1 >= MIN)
  .map(c => c.iv.length + 1) : [];
function control(kind) {
  const out = [];
  for (let r = 0; r < 20; r++) for (const L of sampleLens) {
    const iv = [];
    for (let i = 0; i < L - 1; i++) iv.push((rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)));
    /* `white` makes the PITCHES uncorrelated; `walk` sums the intervals,
       which is what the contours' own walk does */
    const b = beta(kind === 'white' ? iv.map((v, i) => v) : walkOf(iv));
    if (b != null && isFinite(b)) out.push(b);
  }
  out.sort((a, b) => a - b);
  return out;
}
const white = control('white'), walk = control('walk');
const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;

console.log('\nSPECTRAL SLOPE beta of the pitch walk  (sequences of ' + MIN + '+ notes)');
console.log('                        n     p15   median    p85');
const row = (name, a) => console.log('  ' + name.padEnd(20)
  + String(a.length).padStart(4) + q(a, 0.15).toFixed(2).padStart(8)
  + q(a, 0.5).toFixed(2).padStart(9) + q(a, 0.85).toFixed(2).padStart(7));
row('our contours', bs);
row('white-noise control', white);
row('random-walk control', walk);
console.log('  pink noise (1/f) would be 1.00; Voss & Clarke put real music near it.');

console.log('\nREAD IT AS: ' + (q(bs, 0.5) > 0.7 && q(bs, 0.5) < 1.8
  ? 'the contours already sit in the 1/f region, between pink and brownian\n'
    + '  and nowhere near white. The LSTM inherited it from real melody, so\n'
    + '  substituting synthesised pink noise would be swapping measured\n'
    + '  structure for an approximation of one of its statistics.'
  : 'the contours are NOT in the 1/f region, so the pink-noise advice has\n'
    + '  something real to offer here and is worth trying.'));
console.log('\nCAVEAT: ' + bs.length + ' of ' + MAGENTA_CONTOURS.length
  + ' contours are long enough to estimate a slope from, and a slope fitted\n'
  + '  over fewer than two decades of frequency is indicative rather than\n'
  + '  precise. The interval distribution above rests on all ' + n + '.');
