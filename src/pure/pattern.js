/* The pattern data model: sizes, construction, and the two length questions
   ("how long is this pattern" vs "how long is this one track"). Plain data —
   nothing here knows about audio or the DOM. */

export const NPADS = 64;      // pads in a project (4 banks of 16)
export const NSTEPS = 16;     // steps per BAR — a timing constant, not a capacity
export const NPAT = 8;        // pattern slots
export const MAXSTEPS = 64;   // capacity: a pattern may be 16/32/48/64 steps long
export const PATLENS = [16, 32, 48, 64];

/* A pattern's own length, defaulting to one bar. Anything not in PATLENS is
   treated as absent, so an old save or a corrupt value degrades to 16 rather
   than producing a pattern of unplayable length. */
export function patLen(pat) {
  const n = pat && pat.plen;
  return PATLENS.indexOf(n) >= 0 ? n : NSTEPS;
}

/* How long ONE track runs before it repeats. Shorter than the pattern is
   polymeter: a 7-step hat against a 16-step kick phrases for bars.

   Anything that is not a usable length means "as long as the pattern". The
   previous form — `(pat.len[p] || L)` then clamped to [1, L] — treated 0 and a
   negative differently, because 0 is falsy and -4 is not: a missing length gave
   the full pattern, but a corrupt negative one gave 1, a track firing on every
   single step. Not reachable from the UI, but reachable from a hand-edited or
   damaged save. */
export function trackLen(pat, p) {
  const L = patLen(pat);
  const n = pat && pat.len && pat.len[p];
  return (typeof n === 'number' && isFinite(n) && n >= 1) ? Math.min(Math.floor(n), L) : L;
}

export function rowUsed(pat, p) {
  const r = pat && pat.steps && pat.steps[p];
  if (!r) return false;
  for (let i = 0; i < r.length; i++) if (r[i] > 0) return true;
  return false;
}

/* Rows are always allocated to MAXSTEPS regardless of the pattern's length, so
   growing a pattern never has to reallocate and never loses what was written
   past the old end. */
export function newPattern(len) {
  const n = PATLENS.indexOf(len) >= 0 ? len : NSTEPS;
  const s = [];
  for (let p = 0; p < NPADS; p++) s.push(new Array(MAXSTEPS).fill(0));
  return { steps: s, bpm: null, plen: n, len: new Array(NPADS).fill(n), locks: {}, sil: new Array(MAXSTEPS).fill(0) };
}

export function stepLock(pat, p, st) { return pat.locks && pat.locks[p + ':' + st]; }
export function stepHasLock(lk) { return !!(lk && (lk.pitch || (lk.prob != null) || lk.rat > 1 || lk.nudge)); }
