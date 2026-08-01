/* POLYRHYTHM — a track that runs on its own pulse.

   The app already had POLYMETER: per-track LEN, so a 15-step hat drifts against
   a 16-step kick. Same pulse, different cycle lengths. What it could not express
   is POLYRHYTHM — a different subdivision of the same span. Three evenly spaced
   hits in the time of four cannot be written on a 16-step grid, because 16 is
   not divisible by 3. Euclid 3-in-16 spaces them 5-5-6, which is a groove but is
   not a triplet and never will be.

   A poly track keeps its ordinary row of hits. What changes is only WHEN its
   cells fall, and there are two musically distinct answers:

   LOCKED — the track's cycle is pinned to the bar. `len` hits spread evenly
   across `bars` bars, re-anchored every cycle, so 3-against-4 is exact and stays
   exact forever. This is what a tuplet IS: N in the space of M. Nesting comes
   from the ratchet lock that already exists — a step of a 3-track ratcheted by 5
   is five hits inside one third of a bar.

   FREE — the track ticks at its own BPM and never re-anchors. Main at 100, pad
   at 137: they agree on the first beat and then drift apart for good. That is a
   different technique (phasing), not a broken version of the first one, which is
   why it is a mode rather than a tolerance.

   This module is only the arithmetic, so it can be unit tested without a
   browser and so the live scheduler and the offline bounce can share one
   definition of when a hit lands. Those two disagreeing is the worst bug this
   app can have — it would mean the bounce is not what you heard. */

export const POLY_MIN = 2;
export const POLY_MAX = 64;      // cells in a poly row
export const POLY_MAX_BARS = 8;  // how many bars one locked cycle may span
export const POLY_MIN_BPM = 10;
export const POLY_MAX_BPM = 999;

const clampInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

/* Read a track's poly settings, or null when it plays on the ordinary grid.

   Everything is validated on the way out rather than trusted, because these
   values ride in saved projects and a damaged or hand-edited one must degrade
   to something playable instead of producing a division by zero in the
   scheduler. */
export function polyCfg(pat, p) {
  const all = pat && pat.poly;
  const c = all && all[p];
  if (!c || !c.on) return null;
  const free = c.mode === 'free';
  return {
    mode: free ? 'free' : 'lock',
    len: clampInt(c.len, POLY_MIN, POLY_MAX),
    bars: free ? 1 : clampInt(c.bars, 1, POLY_MAX_BARS),
    bpm: free ? Math.max(POLY_MIN_BPM, Math.min(POLY_MAX_BPM, Number(c.bpm) || 120)) : 0,
  };
}

export function isPoly(pat, p) { return polyCfg(pat, p) !== null; }

/* Seconds between two hits of this track.

   LOCKED derives from the main sequence, so a tempo change carries the track
   with it and the ratio is preserved: one cycle is `bars` bars, cut into `len`.
   FREE derives from its own BPM alone, in the app's convention that a step is a
   sixteenth — so a free track at the main tempo lands exactly on the grid, which
   makes it obvious the mode is doing what it says. */
export function polyStepDur(cfg, barDur) {
  if (!cfg) return 0;
  if (cfg.mode === 'free') return 60 / cfg.bpm / 4;
  return (barDur * cfg.bars) / cfg.len;
}

/* Seconds for one full cycle. Only locked tracks have one — a free track never
   returns to the same place relative to the bar, which is the point of it. */
export function polyCycleDur(cfg, barDur) {
  if (!cfg) return 0;
  return cfg.mode === 'free' ? polyStepDur(cfg, barDur) * cfg.len : barDur * cfg.bars;
}

/* What a locked track works out to in the units the other mode uses, so the
   panel can show a ratio and a tempo at once and neither has to be imagined. */
export function polyBpm(cfg, mainBpm, stepsPerBar) {
  if (!cfg) return 0;
  if (cfg.mode === 'free') return cfg.bpm;
  const bars = cfg.bars || 1;
  return Math.abs(mainBpm) * cfg.len / (bars * (stepsPerBar || 16));
}

/* The ratio against the main grid, in lowest terms: len hits per bars*steps
   grid slots. 3 in one 16-step bar reads 3:16, and 12 reads 3:4 — which is the
   form a musician recognises as triplet sixteenths. */
export function polyRatio(cfg, stepsPerBar) {
  if (!cfg) return null;
  const a = cfg.len, b = (cfg.bars || 1) * (stepsPerBar || 16);
  const g = gcd(a, b);
  return { num: a / g, den: b / g };
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }

/* Every hit of one poly track between two absolute times.

   `t0` is when the sequence started; everything is measured from it so the live
   scheduler and the bounce can ask the same question and get the same answer.
   Locked tracks re-anchor to their cycle rather than accumulating, so a long
   session cannot drift the tuplet off the bar.

   Returns [{when, idx}] where idx is the cell in the track's row — the caller
   still owns velocity, locks, humanize and everything else about the hit.

   Half-open [from, to), so calling this over adjacent windows fires each hit
   exactly once — but only with EPS, and that is not a rounding nicety.

   The live scheduler builds each window by ACCUMULATING (nextStepTime += sd)
   while deriving the cycle start by SUBTRACTING from that accumulated value.
   Both routes reach the same instant mathematically and differ in the last
   bits, so a hit sitting exactly on a window edge — which the first hit of
   every cycle does, by definition — lands microscopically either side of the
   boundary depending on the arithmetic. Without a tolerance it is dropped by
   both windows or fired by both. In the browser that showed up as an
   intermittently missing hit: one run 17 evenly spaced, the next 15 with an
   800ms hole.

   1e-9 s is a nanosecond: five orders of magnitude below one sample at 44.1kHz
   and far above the ~1e-13 s of float noise at these magnitudes. Applied to
   BOTH bounds so a hit near a boundary belongs to exactly one window. */
const EPS = 1e-9;

export function polyEvents(cfg, t0, from, to, barDur) {
  const out = [];
  if (!cfg || !(barDur > 0) || !(to > from)) return out;
  const step = polyStepDur(cfg, barDur);
  if (!(step > 0)) return out;
  const len = cfg.len;

  if (cfg.mode === 'free') {
    /* One unbroken series from the start; the index wraps but the clock does
       not. No re-anchoring is the whole definition of this mode. */
    let k = Math.max(0, Math.floor((from - t0) / step) - 1);   // start below and let the bounds filter
    for (;;) {
      const when = t0 + k * step;
      if (when >= to - EPS) break;
      if (when >= from - EPS) out.push({ when, idx: k % len });
      k++;
      if (out.length > 100000) break;                 // a runaway rate cannot hang the audio thread
    }
    return out;
  }

  const cycle = barDur * cfg.bars;
  let c = Math.max(0, Math.floor((from - t0) / cycle));
  for (;;) {
    const cStart = t0 + c * cycle;
    if (cStart >= to - EPS) break;
    for (let k = 0; k < len; k++) {
      const when = cStart + k * (cycle / len);       // re-derived from the cycle, never accumulated
      if (when >= to - EPS) break;
      if (when >= from - EPS) out.push({ when, idx: k });
    }
    c++;
    if (out.length > 100000) break;
  }
  return out;
}

/* Where a poly track's playhead is at a given moment, for drawing. Returns -1
   before the sequence starts. */
export function polyIndexAt(cfg, t0, now, barDur) {
  if (!cfg || now < t0 || !(barDur > 0)) return -1;
  const step = polyStepDur(cfg, barDur);
  if (!(step > 0)) return -1;
  return Math.floor((now - t0) / step) % cfg.len;
}
