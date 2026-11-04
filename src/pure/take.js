/* WHAT A RECORDED TAKE ACTUALLY DID, measured off the buffer.

   Everything else in this app that judges timing reads the SCHEDULE —
   `pulse()` walks the steps the sequencer is going to play, which it
   knows exactly. A take the person sang or played onto a TRAX lane is
   audio off the mic bus, so none of those checks have anything to say
   about it, and the one moment feedback is worth most is the moment
   after a take stops.

   So this is the other half: onsets found in the audio, timing measured
   against the grid the click was playing, and the handful of faults
   that make a take unusable rather than merely imperfect.

   IT REPORTS, IT DOES NOT GRADE. The whole long warning in AGENTS.md is
   that every measure here is reasonable as a fault detector and harmful
   as a target — a track was pushed to a 12dB dynamic arc to satisfy a
   sentence in that file and came out worse than the one it was trying
   to beat. A take that is 20ms behind the click may be exactly the feel
   the person wants, and "you are late" is not a correction. The numbers
   are here so a producer can say what it HEARS and the person can say
   "keep it". Only the three in `faults` are brokenness rather than
   taste: silence, clipping, and a DC offset.

   VALIDATED ON REAL RECORDINGS, after passing fifteen tests on
   synthesised ones and being wrong anyway. The first onset detector
   here asked whether a window was 1.8x louder than the window before
   it; against twelve ESC-50 clips whose onsets samples/foundkit.json
   declares, it put the declared onset among those it found four times
   out of nine discrete events. The log-flux version below gets six, and
   the three it still "misses" are the interesting part: at the onset
   fk:snare declares, the audio is 73dB below that file's peak and the
   real attack is 107ms later; fk:can is 68dB down with the attack 150ms
   later; fk:hat has no transient within 400ms of its declared onset at
   all. The detector was right and the manifest was wrong, which is why
   scripts/audit-onsets.mjs exists and why those values are fixed.

   Synthetic tests could not have found that. They assert the thing you
   already believe. */

import { envelopeRms } from './timbre.js';

/* ---- ONSETS -------------------------------------------------------- */

/* WHERE THE SOUND STARTS, as seconds from the top of the buffer.

   Method: the RMS envelope, then a rise that clears a floor and beats
   the recent past by a clear margin, with a refractory gap after each
   hit. Spectral flux would be better at separating a pitch change on a
   held note from a new attack, and it needs an FFT per frame; this
   needs none and finds a struck or plucked or sung ATTACK, which is
   what a timing measurement is about.

   The three numbers all exist to stop it crying wolf, which is the
   failure mode that gets a check ignored:

     floor      a fraction of the take's own peak. Room tone and breath
                between phrases are not onsets. Relative rather than
                absolute because a take can arrive at any level — a
                fixed -40dBFS floor would find everything in a hot take
                and nothing in a quiet one.
     rise       how much louder than the preceding window it has to get.
                A sustained note wobbling in level is not a new note.
     refractory the shortest believable gap between two attacks. Without
                it, one attack with a ragged envelope reads as three,
                and a doubled onset is worse than a missed one here
                because it drags the timing median around. 30ms is
                faster than anyone plays and slow enough to coalesce
                the ragged edge of one hit. */
/* THE ONSET-STRENGTH ENVELOPE, exported because tempo wants it.
 *
 * `onsets()` computed this and threw it away, returning only the times
 * it picked. But picked times are the wrong input for finding a TEMPO:
 * thresholding discards how strongly each frame rose, and an
 * autocorrelation over a continuous strength curve finds a period that
 * a list of accepted peaks can miss entirely -- a quiet ghost note that
 * failed the threshold still carries the beat.
 *
 * So the rise in log energy is a function of its own now, and
 * `onsets()` is the thresholding step on top of it. One computation,
 * two questions. */
export function onsetStrength(data, sampleRate, opt) {
  const o = opt || {};
  const win = o.win || 0.005;
  const env = envelopeRms(data, sampleRate, win);
  if (env.length < 3) return { flux: [], winSec: win, peak: 0 };
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  if (peak <= 0) return { flux: [], winSec: win, peak: 0 };
  const eps = peak * 1e-4;
  const flux = new Array(env.length).fill(0);
  for (let i = 1; i < env.length; i++) {
    const d = Math.log(env[i] + eps) - Math.log(env[i - 1] + eps);
    flux[i] = d > 0 ? d : 0;
  }
  return { flux, env, winSec: win, peak };
}

export function onsets(data, sampleRate, opt) {
  const o = opt || {};
  const win = o.win || 0.005;
  const refractory = o.refractory != null ? o.refractory : 0.03;
  const delta = o.delta != null ? o.delta : 0.22;
  const floorFrac = o.floor != null ? o.floor : 0.02;
  const env = envelopeRms(data, sampleRate, win);
  if (env.length < 3) return [];
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  if (peak <= 0) return [];

  /* ONSET STRENGTH as the RISE IN LOG ENERGY, which is the one change
     that made this work on real recordings.

     The first version asked whether a window was `rise` times louder
     than the one before it. On synthesised hits that is fine and it
     passed fifteen tests. On twelve real ESC-50 clips with onsets the
     manifest declares, it put the declared onset among those it found
     four times out of nine, and the ratio test is why: a single
     neighbouring window is not a baseline. A hit arriving over three
     windows never shows a big step between any adjacent pair, and a
     noisy floor produces huge ratios between two quiet windows.

     Log energy makes the measure relative at every level, so a hit 30dB
     down reads the same as a loud one, and the threshold is LOCAL —
     the median of the surrounding strengths plus a margin — so a dense
     passage needs a bigger rise to count than a sparse one. That is
     what separates a new attack from a sustained note getting louder. */
  const eps = peak * 1e-4;
  const flux = new Array(env.length).fill(0);
  for (let i = 1; i < env.length; i++) {
    const d = Math.log(env[i] + eps) - Math.log(env[i - 1] + eps);
    flux[i] = d > 0 ? d : 0;
  }
  /* a local median over about a fifth of a second either side */
  const half = Math.max(2, Math.round(0.1 / win));
  const med = (i) => {
    const lo = Math.max(0, i - half), hi = Math.min(flux.length, i + half + 1);
    const w = flux.slice(lo, hi).sort((x, y) => x - y);
    return w[Math.floor(w.length / 2)];
  };
  const minGapWins = Math.max(1, Math.round(refractory / win));
  const floor = peak * floorFrac;
  const out = [];
  let last = -1e9;
  for (let i = 1; i < flux.length - 1; i++) {
    if (env[i] < floor) continue;                 /* nothing audible here */
    if (flux[i] <= 0) continue;
    /* a LOCAL MAXIMUM of the strength, not merely a value over the
       threshold: without this one attack trips every window on its way
       up, and a doubled onset drags the timing median around, which is
       worse here than a missed one */
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    if (flux[i] < med(i) + delta) continue;
    if (i - last < minGapWins) continue;
    last = i;
    out.push(+(i * win).toFixed(4));
  }
  return out;
}

/* ---- TIMING AGAINST THE GRID --------------------------------------- */

/* A sixteenth in seconds. `stepMs` in timbre.js is the same number in
   milliseconds; both exist because one is what a listener feels and the
   other is what arithmetic on a buffer wants, and converting at every
   call site is how a factor of 1000 gets lost. */
export function sixteenthSec(bpm) { return 15 / Math.max(1, Math.abs(bpm)); }

/* HOW A TAKE SITS AGAINST THE CLICK.

   Signed, and POSITIVE IS LATE, which is the same convention
   scripts/study-groove.py uses on the Groove corpus so the two can be
   compared at all.

   `offset` is the take's own constant — a player sitting ahead of or
   behind the click for the whole pass, or latency in the capture path,
   which are indistinguishable from here and should not be confused with
   feel. `spread` is what is left after that constant is removed, and it
   is the one that says whether the playing is TIGHT: a player 30ms
   behind the click all the way through is consistent and can be nudged
   back in one move, while a player averaging zero with a 60ms spread
   cannot.

   That distinction is the whole reason the corpus study de-means each
   performance against itself. Its first run reported every position
   early by the same 9.3ms and that was a constant, not a groove. */
export function takeTiming(onsetTimes, bpm, opt) {
  const o = opt || {};
  const div = o.div || 4;                       /* 4 = sixteenths */
  const step = sixteenthSec(bpm) * (4 / div);
  const n = onsetTimes.length;
  if (!n) {
    return { onsets: 0, says: 'nothing to measure — no onsets were found.' };
  }
  const devs = onsetTimes.map((t) => {
    const near = Math.round(t / step);
    return (t - near * step);                   /* seconds, signed */
  });
  const sorted = devs.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  /* spread AFTER removing the take's constant, as a mean absolute
     deviation — not a standard deviation, which one wild onset
     dominates, and a ragged take has wild onsets by definition */
  const rel = devs.map((d) => d - med);
  const spread = rel.reduce((a, d) => a + Math.abs(d), 0) / rel.length;
  const asFrac = (s) => +(s / step).toFixed(3);
  /* MEASURED, NOT RECALLED: the median human micro-timing across 1,150
     performances in the Groove corpus is 0.075 of a sixteenth. It is
     here so the report can say what tight means instead of implying
     that zero is the target — a drummer scoring zero would be a
     machine, and this repo has already learned that `pulse()` gives a
     human 100% because its window is five times wider than the thing
     being measured. */
  const HUMAN_FRAC = 0.075;
  const tight = asFrac(spread) <= HUMAN_FRAC;
  const ms = (s) => Math.round(s * 1000);
  return {
    onsets: n,
    offsetMs: ms(med), offsetFrac: asFrac(med),
    spreadMs: ms(spread), spreadFrac: asFrac(spread),
    humanFrac: HUMAN_FRAC, tight,
    says: n + ' onsets. It sits ' + Math.abs(ms(med)) + 'ms '
      + (med >= 0 ? 'behind' : 'ahead of') + ' the click on average, give or '
      + 'take ' + ms(spread) + 'ms. ' + (tight
        ? 'That spread is inside what human playing measures in the Groove '
          + 'corpus (0.075 of a sixteenth), so the timing is not the problem.'
        : 'That is wider than the 0.075 of a sixteenth human playing '
          + 'measures in the Groove corpus, so it will read as loose.')
      + ' The average is a constant and can be nudged in one move; only the '
      + 'spread needs playing again, and neither is wrong if the feel is '
      + 'what you wanted.',
  };
}

/* ---- IS THE TAKE USABLE AT ALL ------------------------------------- */

/* THE THREE THAT ARE BROKENNESS AND NOT TASTE.

   A take can be late, thin, sparse or dull and still be the one you
   keep. It cannot be any of these:

     silent     the commonest recording fault there is, and TRAX already
                guards it on its own path. Reported here too, because
                the number that proves it — the peak — is the same one
                every other line needs.
     clipped    counted as RUNS of samples at the rail rather than as
                single samples. One sample at full scale is a cymbal
                transient; forty in a row is a square wave. Counting
                samples alone calls a loud take broken.
     dc         a mic path with an offset wastes headroom and makes
                every later level measurement wrong. Caught here because
                it is invisible by ear until something downstream
                distorts. */
export function takeHealth(data, sampleRate) {
  const n = data.length | 0;
  if (!n) return { empty: true, silent: true, faults: ['silent'],
    says: 'the take is empty — nothing was recorded.' };
  let peak = 0, sum = 0, sumsq = 0, clipRuns = 0, run = 0, longest = 0;
  for (let i = 0; i < n; i++) {
    const v = data[i], a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v; sumsq += v * v;
    if (a >= 0.999) {
      run++;
      if (run > longest) longest = run;
      if (run === 4) clipRuns++;      /* count a run once, when it qualifies */
    } else run = 0;
  }
  const rms = Math.sqrt(sumsq / n);
  const dc = sum / n;
  const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -Infinity);
  const faults = [];
  /* -60dBFS peak over a whole take is room tone, not a performance */
  const silent = peak < 0.001;
  if (silent) faults.push('silent');
  if (clipRuns > 0) faults.push('clipped');
  if (Math.abs(dc) > 0.01) faults.push('dc');
  const says = silent
    ? 'nothing audible in the take — peak is ' + db(peak) + 'dBFS. Check the '
      + 'input, the arm and the mic permission before playing it again.'
    : (faults.length
      ? 'usable but faulty: '
        + (clipRuns ? clipRuns + ' clipped runs (longest ' + longest
          + ' samples) — that is distortion, not loudness. ' : '')
        + (Math.abs(dc) > 0.01 ? 'a DC offset of ' + dc.toFixed(3)
          + ' is eating headroom and will skew every level reading. ' : '')
      : 'the take is clean: peak ' + db(peak) + 'dBFS, rms ' + db(rms)
        + 'dBFS, no clipping and no offset.');
  return {
    seconds: +(n / sampleRate).toFixed(3),
    peak: +peak.toFixed(4), peakDb: db(peak), rmsDb: db(rms),
    dc: +dc.toFixed(4), clipRuns, longestClipRun: longest,
    silent, faults, says,
  };
}

/* ---- THE ONE CALL A PRODUCER WANTS -------------------------------- */

/* Health first, because a timing report on a silent take is noise about
   nothing — and that ordering is the same mistake `review()` had to be
   fixed for twice: it ran melodic checks on shakers and buried four
   real findings under thirty-two spurious ones. */
export function measureTake(data, sampleRate, bpm, opt) {
  const health = takeHealth(data, sampleRate);
  if (health.silent) {
    return { health, timing: null, faults: health.faults, says: health.says };
  }
  const found = onsets(data, sampleRate, opt);
  const timing = takeTiming(found, bpm, opt);
  return {
    health, timing, onsetTimes: found, faults: health.faults,
    says: health.says + ' ' + timing.says,
  };
}
