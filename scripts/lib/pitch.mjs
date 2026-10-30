/* What note is this, and is the thing asking even working?

   A first version of this read the lowest spectral peak above a fraction
   of the loudest one, and it was wrong on almost every real instrument:
   run against a manifest already known to be correct it reported errors
   of exactly +12.0, +19.0, +24.0 and +31.0 semitones, which are the
   second, third, fourth and sixth harmonics. A struck bar, a bowed
   string and a brass note all routinely put more energy in an upper
   partial than in the fundamental, so "the lowest strong peak" finds a
   harmonic and reports it with total confidence.

   Subharmonic summation does not care. For each candidate f0 it adds up
   the spectrum at f0, 2f0, 3f0 ... with a decaying weight, so the right
   answer wins on the strength of the whole harmonic series whether or
   not the fundamental is present at all. The decay is what stops f0/2
   from winning by explaining everything twice over.

   selfTest() is the point of the file as much as the detector is. It
   builds signals whose answers are known — including the missing
   fundamental case that broke the first version — and checks them. A
   measuring tool gets calibrated against a known answer before it is
   pointed at anything, because the alternative is what happened here:
   confident, uniform, wrong. */

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, hl = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < hl; k++) {
        const w = ang * k, wr = Math.cos(w), wi = Math.sin(w);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + hl] * wr - im[i + k + hl] * wi;
        const vi = re[i + k + hl] * wi + im[i + k + hl] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + hl] = ur - vr; im[i + k + hl] = ui - vi;
      }
    }
  }
}

export const midiOfHz = (f) => 69 + 12 * Math.log2(f / 440);
export const hzOfMidi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* Magnitude spectrum of one hann-windowed frame, taken a little after
   the start so the attack transient is past but the tone is still full. */
function spectrum(samples, sr, N, startSec) {
  const re = new Float64Array(N), im = new Float64Array(N);
  const off = Math.min(Math.max(0, samples.length - N), Math.floor(sr * startSec));
  let any = 0;
  for (let i = 0; i < N; i++) {
    const v = i + off < samples.length ? samples[i + off] : 0;
    if (v) any = 1;
    re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  }
  if (!any) return null;
  fft(re, im);
  const half = N >> 1, mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/* THE STRONGEST BIN NEAR WHERE A HARMONIC SHOULD BE, not the bin exactly
   there. Over a one-second frame a spectral peak is under 4Hz wide, so a
   candidate f0 that is half a grid step out has its second harmonic 1Hz
   off, its fifth 3Hz off, and its tenth nowhere near the peak at all —
   the error multiplies by the harmonic number. Scored exactly, the true
   f0 therefore loses to whatever wrong low candidate happens to catch a
   few peaks by accident, which is exactly what it did: 146Hz beat 220Hz
   on a signal built from 440/660/880/1100.
   Searching a small window instead makes the score tolerant of that, and
   of real instruments: a struck metal bar's partials are not integer
   multiples of anything, so an exact lookup would miss them even if the
   candidate were perfect. */
function magNear(mag, hz, binHz, tol) {
  const lo = Math.max(1, Math.floor(hz * (1 - tol) / binHz));
  const hi = Math.min(mag.length - 1, Math.ceil(hz * (1 + tol) / binHz));
  let best = 0;
  for (let i = lo; i <= hi; i++) if (mag[i] > best) best = mag[i];
  return best;
}

/* HOW MANY HARMONICS, AND HOW FAST THE WEIGHT DECAYS. With too slow a
   decay a candidate an octave below the truth scores just as well, since
   every real harmonic is also a harmonic of f0/2. 0.84^k over 12 terms
   separates them while still letting a weak fundamental be carried by
   its series. */
const NHARM = 12, DECAY = 0.84;
/* How far from its ideal position a harmonic may be found. Covers half a
   search step, instrument tuning, and the stretched partials of struck
   metal. Wider than this and a candidate an octave out starts matching
   everything too. */
const HTOL = 0.012;

export function fundamentalHz(samples, sr, opts = {}) {
  const N = opts.N || 16384;
  const fmin = opts.fmin || 25, fmax = opts.fmax || 4200;
  const mag = spectrum(samples, sr, N, opts.startSec == null ? 0.05 : opts.startSec);
  if (!mag) return null;
  const binHz = sr / N;

  /* a log-spaced grid: pitch is logarithmic, so a linear grid wastes
     almost all its resolution at the top */
  const cents = 10, steps = Math.round(1200 * Math.log2(fmax / fmin) / cents);
  let best = 0, bestScore = 0;
  for (let s = 0; s <= steps; s++) {
    const f0 = fmin * Math.pow(2, (s * cents) / 1200);
    let score = 0;
    for (let k = 1; k <= NHARM; k++) {
      const h = f0 * k;
      if (h > sr / 2) break;
      score += Math.pow(DECAY, k - 1) * magNear(mag, h, binHz, HTOL);
    }
    if (score > bestScore) { bestScore = score; best = f0; }
  }
  if (!best) return null;

  /* refine against the nearest real peak, so the answer carries the
     precision of the spectrum rather than of the search grid — but only
     if there is actually a peak there. On a note with no fundamental at
     all, this window holds nothing but leakage, and refining against it
     dragged a correct 220Hz answer out to 227Hz by snapping to the edge
     of the search window. With nothing to refine against, the grid value
     is already good to a few cents and is the better answer. */
  let gmax = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > gmax) gmax = mag[i];
  const b0 = best / binHz;
  let bi = Math.round(b0), bm = -1;
  for (let i = Math.max(1, Math.round(b0 * 0.97)); i <= Math.min(mag.length - 2, Math.round(b0 * 1.03)); i++) {
    if (mag[i] > bm) { bm = mag[i]; bi = i; }
  }
  if (bm < gmax * 0.02) return best;
  const a = mag[bi - 1], b = mag[bi], c = mag[bi + 1];
  const d = (a - 2 * b + c) !== 0 ? (a - c) / (2 * (a - 2 * b + c)) : 0;
  const refined = (bi + Math.max(-1, Math.min(1, d))) * binHz;
  /* only trust the refinement if it agrees with the search to within a
     semitone; otherwise it has snapped to a neighbouring partial */
  return Math.abs(1200 * Math.log2(refined / best)) < 100 ? refined : best;
}

/* THE MEDIAN OF SEVERAL FRAMES, which is what real recordings need.
   One frame taken just after the start is enough for a synthesised tone
   and wrong often enough on real material to matter: these libraries
   record soft eased-in entries whose first 90ms is some 22dB below the
   body of the note, so an early frame can be mostly breath and bow
   noise, and a vibrato wide enough to smear a whole semitone will read
   differently depending where it is caught. Sampling across the note and
   taking the median throws out both, and disagreement between the frames
   is itself worth knowing — it is returned as `spread`. */
export function fundamentalRobust(samples, sr, opts = {}) {
  const at = opts.at || [0.10, 0.30, 0.50, 0.70];
  const dur = samples.length / sr;
  const got = [];
  for (const frac of at) {
    const start = dur * frac;
    /* a frame that would run off the end tells you nothing new */
    if (start + 0.3 > dur) continue;
    const hz = fundamentalHz(samples, sr, { ...opts, startSec: start });
    if (hz) got.push(hz);
  }
  if (!got.length) return null;
  const cents = got.map(h => 1200 * Math.log2(h / got[0])).sort((a, b) => a - b);
  const sorted = [...got].sort((a, b) => a - b);
  return {
    hz: sorted[sorted.length >> 1],
    n: got.length,
    spread: (cents[cents.length - 1] - cents[0]) / 100,
  };
}

/* ---- calibration ------------------------------------------------------ */

function tone(sr, secs, parts) {
  const n = Math.floor(sr * secs), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const [hz, amp] of parts) v += amp * Math.sin(2 * Math.PI * hz * i / sr);
    out[i] = v * 8000;
  }
  return out;
}

export function selfTest(sr = 16000) {
  const cases = [
    ['pure 220Hz', 220, [[220, 1]]],
    ['220Hz, full series', 220, [[220, 1], [440, 0.6], [660, 0.4], [880, 0.25]]],
    /* the one that broke the first detector: nothing at all at f0 */
    ['220Hz, MISSING fundamental', 220, [[440, 1], [660, 0.8], [880, 0.6], [1100, 0.4]]],
    /* and the one that broke it in practice: f0 present but far quieter
       than its partials, which is what a struck bar actually looks like */
    ['220Hz, fundamental 22dB down', 220, [[220, 0.08], [440, 1], [660, 0.9], [880, 0.5]]],
    ['C2 65.4Hz, weak f0', 65.4, [[65.4, 0.3], [130.8, 1], [196.2, 0.7]]],
    ['C6 1046.5Hz', 1046.5, [[1046.5, 1], [2093, 0.5]]],
    ['A4 440Hz, inharmonic metal', 440, [[440, 1], [1150, 0.9], [2210, 0.7]]],
  ];
  const rows = [];
  let worst = 0;
  for (const [name, want, parts] of cases) {
    const got = fundamentalHz(tone(sr, 1.5, parts), sr);
    const err = got ? 1200 * Math.log2(got / want) / 100 : NaN;
    if (!Number.isFinite(err) || Math.abs(err) > Math.abs(worst)) worst = Number.isFinite(err) ? err : 99;
    rows.push({ name, want, got, err });
  }
  return { rows, worst, ok: Math.abs(worst) <= 0.5 };
}
