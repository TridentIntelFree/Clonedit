/* BENDING A SAMPLE INTO A JOB, BY CHANGING THE AUDIO.

   mutate() was the obvious mechanism and it is not enough. Measured, on
   real samples from samples/jbh-drums.json, with the fit scored on the
   render rather than the buffer:

     ride           -> kick    0% ->  0%   0dB change, nothing moved in 15 tries
     snare_acoustic -> hat     70% -> 71%  5.48dB change, 32 seconds

   Which is exactly what AGENTS.md says about it: mutate turns the pad's
   own knobs and NEVER TOUCHES THE AUDIO, so "the most transformed thing
   it can return is your sample with a filter on it". A ride needs 66dB
   more body to hold a kick's place and no filter setting adds low end
   that was never recorded. The knob search is the wrong tool for this
   job and the person using it was right that it has little effect.

   So this changes the audio. It is an EQ MATCH: measure the sample's
   nine band levels, compare them with the measured mean shape of the
   job (ROLE_SHAPES, from scripts/study-role-shapes.mjs), and apply the
   difference as a fixed curve through an STFT. One static curve for the
   whole sample, not a per-frame normalisation, because the envelope is
   the sample's identity — a kick that has been dynamically flattened is
   not a kick, and the thing being changed here is COLOUR.

   WHAT IT STILL CANNOT DO, and this is a limit of physics rather than
   of effort: boosting a band that holds nothing amplifies noise. A ride
   is 74dB down at 60Hz and the kick template wants it at -6, so an
   honest match would ask for a 68dB boost and return a rumble with a
   cymbal on top. The boost is therefore capped, the cut is not, and the
   result reports the fit it actually reached. Cutting is where most of
   the real transformation lives anyway: take the air off a ride and
   what is left genuinely thumps. */

import { BANDS, fft } from './padprofile.js';

/* ---- the curve ----------------------------------------------------- */

/* HOW MUCH TO MOVE EACH BAND, in dB.

   `have` and `want` are both lists of {lo, hi, rel} over the same nine
   bands. A boost is capped and a cut is not, for the reason in the
   header: there is nothing in an empty band to bring up. */
export function eqCurve(have, want, opt) {
  const o = opt || {};
  const strength = o.strength == null ? 1 : Math.max(0, Math.min(1, o.strength));
  const maxBoost = o.maxBoost == null ? 18 : Math.max(0, o.maxBoost);
  const maxCut = o.maxCut == null ? 48 : Math.max(0, o.maxCut);
  if (!have || !want) return null;
  return BANDS.map(([lo, hi], i) => {
    const h = have[i], w = want[i];
    const d = ((w && w.rel) || 0) - ((h && h.rel) || 0);
    const g = d * strength;
    return { lo, hi, db: +Math.max(-maxCut, Math.min(maxBoost, g)).toFixed(2) };
  });
}

/* A PER-BIN GAIN, interpolated across band centres in LOG frequency.

   Interpolated rather than stepped, because a staircase of nine band
   gains is nine shelf filters at the band edges and those edges ring.
   Log spacing because the bands are log spaced: linear interpolation
   between 8k and 16k is almost flat while between 20 and 60 it is a
   cliff. */
export function binGains(curve, nBins, binHz) {
  const oct = f => Math.log2(Math.max(10, f) / 10);
  const pts = curve.map(c => ({ at: oct(Math.sqrt(c.lo * c.hi)), db: c.db }));
  const out = new Float64Array(nBins);
  for (let k = 0; k < nBins; k++) {
    const x = oct(Math.max(binHz, k * binHz));
    let db;
    if (x <= pts[0].at) db = pts[0].db;
    else if (x >= pts[pts.length - 1].at) db = pts[pts.length - 1].db;
    else {
      let j = 1; while (j < pts.length && pts[j].at < x) j++;
      const a = pts[j - 1], b = pts[j];
      const t = (x - a.at) / Math.max(1e-9, b.at - a.at);
      db = a.db + (b.db - a.db) * t;
    }
    out[k] = Math.pow(10, db / 20);
  }
  return out;
}

/* ---- the transform ------------------------------------------------- */

/* APPLY A FIXED GAIN CURVE TO A BUFFER, through an STFT.

   2048-sample blocks at a 512 hop — 75% overlap with a Hann window,
   which sums to a constant and so needs no normalisation pass, and is
   short enough that a drum transient is not smeared across the window.
   The output is rescaled to the input's peak, because this is about
   colour and a level change here would arrive as a surprise two steps
   later when the pad is staged. */
export function applyCurve(data, sampleRate, curve, opt) {
  const o = opt || {};
  if (!data || !data.length || !curve) return null;
  const N = o.block || 2048, HOP = o.hop || (N >> 2);
  const sr = sampleRate || 44100;
  const gains = binGains(curve, (N >> 1) + 1, sr / N);

  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  /* Hann at 75% overlap sums to 1.5 per sample */
  const wsum = 1.5;

  const out = new Float64Array(data.length + N);
  const re = new Float64Array(N), im = new Float64Array(N);

  for (let start = -N + HOP; start < data.length; start += HOP) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) {
      const s = start + i;
      if (s >= 0 && s < data.length) re[i] = data[s] * win[i];
    }
    fft(re, im);
    /* real input, so the spectrum is conjugate-symmetric: scale the
       lower half and mirror, or the inverse comes back complex */
    const half = N >> 1;
    for (let k = 0; k <= half; k++) {
      const g = gains[k];
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < half) { const m = N - k; re[m] *= g; im[m] *= g; }
    }
    /* inverse by conjugation: ifft(X) = conj(fft(conj(X)))/N */
    for (let k = 0; k < N; k++) im[k] = -im[k];
    fft(re, im);
    for (let i = 0; i < N; i++) {
      const s = start + i;
      if (s >= 0 && s < data.length) out[s] += (re[i] / N) * win[i] / wsum;
    }
  }

  let pkIn = 0, pkOut = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]); if (a > pkIn) pkIn = a;
    const b = Math.abs(out[i]); if (b > pkOut) pkOut = b;
  }
  const scale = pkOut > 1e-9 ? (pkIn / pkOut) : 1;
  const res = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) res[i] = out[i] * scale;
  return res;
}
