/* HOW FAST IS THIS, measured off the audio.

   Nothing in this app could answer that. `pulse()` measures whether a
   beat can be FOUND at a tempo the app already knows, because the
   sequencer set it; it says nothing about a recording that arrived with
   a tempo of its own. So an uploaded loop could be played, chopped and
   pitched, and never lined up with anything — which is the whole of
   "I have a track I like, build around it".

   WHY THIS IS HERE RATHER THAN A DEPENDENCY. `beatd-js` dropped while
   this was being planned: a Rust engine with a JS/WASM binding, MIT,
   zero dependencies, and measured here at EXACT tempo — within 0.1bpm
   from 60 to 200 — once its `bpmRangeMin` is set. It is good, and it
   was not taken, for reasons that are about this app rather than about
   it:

     - the overlap is almost total. Level, spectrum and waveform already
       exist natively. BPM and beat offsets are the only new things.
     - the app ships as ONE self-contained index.html. Its 229KB wasm
       inlines as 306KB of base64, +15% on a 2062KB file.
     - there is no Rust toolchain in this repo, so that wasm would be an
       opaque binary nobody here can rebuild, from a project with 7
       stars and one author.

   It is kept as the YARDSTICK instead, which is worth more than the
   code: tests/tempo.test.mjs measures this against the same signals and
   states the gap. If this ever falls far behind, vendoring beatd is the
   right answer and the numbers will say so.

   THE METHOD is autocorrelation of the onset-strength envelope, which
   is the standard approach and the one the parts here were already
   three-quarters of the way to. `onsetStrength()` in take.js gives the
   rise in log energy per 5ms frame; a periodic rhythm makes that curve
   periodic, and the lag that best correlates with itself is the beat. */

import { onsetStrength } from './take.js';

/* THE TEMPO OCTAVE IS THE WHOLE PROBLEM, and it is worth saying plainly
   before the code. A rhythm at 140bpm correlates almost as well at 70
   and at 280, because every other beat still lines up — so a bare
   "strongest lag" answer is right about the RATIO and wrong about which
   multiple a person would tap. Measured on beatd with its defaults,
   that is exactly where it failed: 70 read as 140, 150 as 75, 174 as 87.
   Three of ten, all octaves, and all fixed by telling it the range.

   Two things resolve it here. A log-Gaussian PRIOR centred where people
   actually perceive tempo, which is the standard trick and is a real
   assumption rather than a fudge — stated, and settable. And HARMONIC
   SUPPORT: a candidate that also correlates at twice and three times
   its lag is more likely to be the beat than a lag that only works
   alone. */
const PRIOR_CENTRE = 120;   /* bpm; where a listener's tap clusters */
const PRIOR_WIDTH = 0.9;    /* in octaves — wide, because this is a nudge */

/* AND THE PRIOR CANNOT RESOLVE AN OCTAVE, which is worth writing down
   because two attempts were made to make it.

   A rule saying "if the lag twice as long correlates nearly as well,
   prefer the slower reading" is defensible on paper — a subdivision
   always correlates at the beat, while a beat need not correlate at its
   subdivision. Measured, it made things WORSE: 15 of 17 cases became
   14. It did not fix 70bpm reading as 140 or 92 as 184, and it broke
   174, which started reading as 87.

   Tracing why is the useful part. At 70bpm the quarter-note lag does
   correlate better than the eighth; it loses on the PRIOR, because 140
   sits nearer the 120 centre and collects a 1.4x boost against 70's
   0.69. The prior is doing exactly what it was designed to do and the
   answer is still wrong, and no centre fixes that: moving it down to
   favour 70 would break 140, which is a real tempo that people play.

   So this does not pretend to resolve it. The octave is reported —
   `alternatives` and `halfOrDouble` carry it, `confidence` is the margin
   over the runner-up rather than the correlation height, and `says`
   states plainly when it is a coin flip. A caller who knows the range
   passes `min` and `max`, which is also how beatd gets its perfect
   score: told the neighbourhood, it is exact, and so is this. Measured
   blind, this got 15 of 17 against beatd's 12. Measured with the
   neighbourhood given, both get everything.

   An honest "70 or 140, and I cannot tell which" is worth more than a
   confident wrong number, and for the case this exists for — somebody
   has uploaded a loop they already like — it is a question they can
   answer in a second. */

/* AUTOCORRELATION, normalised per lag.
   A raw autocorrelation falls away as the lag grows simply because
   fewer samples overlap, so the slowest tempo in the range always looks
   weakest. Dividing by the overlap count removes that and leaves only
   how well the curve matches itself. */
export function autocorr(flux, minLag, maxLag) {
  const n = flux.length;
  const out = new Array(maxLag + 1).fill(0);
  let mean = 0;
  for (const v of flux) mean += v;
  mean /= Math.max(1, n);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, c = 0;
    for (let i = lag; i < n; i++) { s += (flux[i] - mean) * (flux[i - lag] - mean); c++; }
    out[lag] = c > 0 ? s / c : 0;
  }
  return out;
}

/* WHERE THE BEATS FALL, once the period is known.
   The tempo says how far apart they are and nothing about where they
   start, and for lining an uploaded loop up with a grid the offset
   matters exactly as much. Found by trying every offset within one
   period and keeping the one whose beat positions collect the most
   onset strength. */
export function beatPhase(flux, winSec, periodFrames) {
  if (!flux.length || !(periodFrames > 0)) return 0;
  let best = 0, bestScore = -1;
  const step = Math.max(1, Math.round(periodFrames / 48));
  for (let off = 0; off < periodFrames; off += step) {
    let s = 0;
    for (let at = off; at < flux.length; at += periodFrames) {
      const i = Math.round(at);
      /* a window of one frame either side, because a beat does not land
         exactly on a 5ms boundary */
      s += (flux[i] || 0) + 0.5 * ((flux[i - 1] || 0) + (flux[i + 1] || 0));
    }
    if (s > bestScore) { bestScore = s; best = off; }
  }
  return +(best * winSec).toFixed(4);
}

/* THE CALL: a buffer in, a tempo out, with its working shown.
 *
 * `min` and `max` bound the search. They are a real constraint rather
 * than a formality — a tempo outside them cannot be found, and the
 * defaults span what music is actually played at.
 */
export function tempo(data, sampleRate, opt) {
  const o = opt || {};
  const minBpm = o.min != null ? +o.min : 50;
  const maxBpm = o.max != null ? +o.max : 210;
  const centre = o.centre != null ? +o.centre : PRIOR_CENTRE;
  const st = onsetStrength(data, sampleRate, o);
  const flux = st.flux;
  const winSec = st.winSec;
  if (!flux.length) {
    return { bpm: null, confidence: 0, says: 'nothing audible — no tempo to find.' };
  }
  const fps = 1 / winSec;
  const minLag = Math.max(2, Math.floor(fps * 60 / maxBpm));
  const maxLag = Math.min(flux.length - 2, Math.ceil(fps * 60 / minBpm));
  if (maxLag <= minLag) {
    return { bpm: null, confidence: 0,
      says: 'too short to measure a tempo: ' + (data.length / sampleRate).toFixed(1)
        + 's of audio cannot hold two beats at ' + minBpm + 'bpm.' };
  }
  const ac = autocorr(flux, minLag, maxLag);
  let acMax = 0;
  for (let l = minLag; l <= maxLag; l++) if (ac[l] > acMax) acMax = ac[l];
  if (acMax <= 0) {
    return { bpm: null, confidence: 0,
      says: 'no periodicity found. A single sustained sound, noise, or a '
        + 'free-time performance will all do this.' };
  }

  /* LOCAL PEAKS ONLY. Every lag near a good one also correlates well,
     so without this the top of the list is twenty neighbours of one
     answer and the real alternatives — the half and the double, which
     are the thing that has to be weighed — never appear. */
  const peaks = [];
  for (let l = minLag + 1; l < maxLag; l++) {
    if (ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1] && ac[l] > acMax * 0.1) {
      peaks.push(l);
    }
  }
  if (!peaks.length) peaks.push(ac.indexOf(acMax));

  const score = (lag) => {
    const base = ac[lag] / acMax;
    /* HARMONIC SUPPORT: a real beat period also shows at twice and
       three times the lag, because two and three beats apart is still
       periodic. A spurious lag usually does not. */
    let harm = 0, hits = 0;
    for (const m of [2, 3, 4]) {
      const l2 = Math.round(lag * m);
      if (l2 <= maxLag) { harm += Math.max(0, ac[l2]) / acMax; hits++; }
    }
    const support = hits ? harm / hits : 0;
    const bpm = 60 * fps / lag;
    /* the prior, in octaves from the centre */
    const oct = Math.log2(bpm / centre);
    const prior = Math.exp(-0.5 * (oct / PRIOR_WIDTH) ** 2);
    return { lag, bpm, base, support, prior, total: (base + 0.5 * support) * prior };
  };

  const ranked = peaks.map(score).sort((a, b) => b.total - a.total);
  const best = ranked[0];
  /* PARABOLIC INTERPOLATION on the winning lag, because a 5ms frame is
     a coarse grid for a tempo: at 120bpm the period is 100 frames and
     one frame either way is 1.2bpm. */
  let lag = best.lag;
  if (lag > minLag && lag < maxLag) {
    const a = ac[lag - 1], b = ac[lag], c = ac[lag + 1];
    const den = 2 * (2 * b - a - c);
    if (den !== 0) lag = lag + (c - a) / den;
  }
  const bpm = 60 * fps / lag;
  /* CONFIDENCE IS THE MARGIN OVER THE RUNNER-UP, not the correlation
     height. A strongly periodic track whose half-tempo scores almost as
     well is exactly the case a caller needs warned about, and the
     correlation height says nothing about it. */
  const second = ranked[1];
  /* A SINGLE CANDIDATE IS NO INFORMATION, NOT CERTAINTY. With no
     runner-up this returned a margin of 1, so 0.3 seconds of audio came
     back as "206.9bpm, confidence 1" — the most confident answer the
     function could produce, from one and a half beats. Nothing to
     compare against is the weakest evidence there is, not the
     strongest. */
  const margin = second ? (best.total - second.total) / best.total : 0.5;
  /* AND A TEMPO IS A REPEATED INTERVAL. Two events give one interval,
     which is not evidence of a period at all; the confidence has to know
     how many times the thing actually repeated. Below three periods it
     refuses outright, and up to eight the confidence is scaled by how
     much there was to see. */
  const periods = (data.length / sampleRate) / (lag / fps);
  if (periods < 3) {
    return { bpm: null, confidence: 0, seconds: +(data.length / sampleRate).toFixed(2),
      says: 'too short to call it a tempo: ' + (data.length / sampleRate).toFixed(2)
        + 's holds about ' + periods.toFixed(1) + ' beats at the only period that '
        + 'correlated. Three is the minimum worth reporting \u2014 two events make '
        + 'one interval, which is not a repeat.' };
  }
  const evidence = Math.min(1, periods / 8);
  const alt = ranked.slice(1, 4).map(r => +r.bpm.toFixed(1));
  return {
    bpm: +bpm.toFixed(1),
    confidence: +Math.max(0, Math.min(1, margin * evidence)).toFixed(3),
    beats: +periods.toFixed(1),
    phaseSec: beatPhase(flux, winSec, lag),
    alternatives: alt,
    /* the octave neighbours, named, because they are the likely error */
    halfOrDouble: alt.filter(x => Math.abs(x / bpm - 2) < 0.08
      || Math.abs(x / bpm - 0.5) < 0.04),
    seconds: +(data.length / sampleRate).toFixed(2),
    /* THE HALF OR DOUBLE IS NAMED EVERY TIME IT EXISTS, and that is not
       a hedge — it is the measured epistemic state.

       The first version said so only when the margin was thin, on the
       assumption that a confident answer is a right one. Measured over
       ten tempos: the two WRONG answers came back at 0.57 and 0.31
       confidence while the eight right ones spanned 0.30 to 0.70. The
       margin does not separate them, so there is no threshold that
       warns on the wrong ones and stays quiet on the rest.

       What IS true every time: the right answer was either exact or
       sitting in `alternatives`, 10 out of 10. So the useful thing to
       say is both numbers. "About 140, or 70, and I cannot tell which"
       is worth more than a confident wrong number, and for the case
       this exists for — somebody has uploaded a loop they already like
       — it is a question they answer in a second. Given `min` and
       `max`, this is exact: 6 of 6, the same as beatd told the same. */
    says: 'about ' + bpm.toFixed(1) + 'bpm'
      + (alt.filter(x => Math.abs(x / bpm - 2) < 0.08 || Math.abs(x / bpm - 0.5) < 0.04)
        .length
        ? ' \u2014 or ' + alt.filter(x => Math.abs(x / bpm - 2) < 0.08
          || Math.abs(x / bpm - 0.5) < 0.04).join(' or ')
          + 'bpm, which is the same rhythm counted half or twice as fast. '
          + 'Nothing in the audio settles which a person would tap, so if you '
          + 'know roughly what it should be, pass min and max and this is exact.'
        : ', with no half-or-double reading close behind it.')
      + ' First beat at ' + beatPhase(flux, winSec, lag) + 's.',
  };
}
