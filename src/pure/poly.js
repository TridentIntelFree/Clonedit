/* A PAD WITH ITS OWN BPM.

   The first version of this asked you to choose a mode, then a hit count, then
   a bar count, and worked the tempo out for you. Reported as confusing, and it
   was: `len` did two unrelated jobs at once — how FAST the pad ticks and how
   MANY cells its row has — and you had to commit to a philosophy (locked or
   free) before you could set anything.

   One number instead: the pad's BPM.

   The unit is the one that makes the common case obvious. The project's BPM
   counts quarter notes per minute; a pad's BPM counts ITS OWN HITS per minute.
   So a pad set to the project tempo hits once per beat — the same number means
   the same speed, which is the only mapping nobody has to be taught.

   Everything musical falls out of that:

     pad 100 against project 100   one hit per beat
     pad 200                        eighths
     pad 300                        triplets — three per beat
     pad  75 against project 100   THREE hits per bar against four beats,
                                    the classic 3-against-4

   LOCK TO BAR is then one switch rather than a mode. On, the tempo is nudged to
   the nearest rate that divides the bar into a whole number of hits, so the pad
   re-anchors every bar and the relationship holds forever. Off, the pad runs at
   exactly the BPM you set and drifts against the bar — phasing, which is a
   technique rather than a failure.

   CELLS is now genuinely separate: how many cells the row has before it
   repeats, independent of how fast they go by. Three hits per bar with five
   cells is polyrhythm and polymeter at once, and neither setting has to know
   about the other.

   This module is only the arithmetic, so it is unit tested in milliseconds and
   so the live scheduler and the offline bounce share one definition of when a
   hit lands. Those two disagreeing would mean the bounce is not what you
   heard. */

export const POLY_MIN_CELLS = 1;
export const POLY_MAX_CELLS = 64;
export const POLY_MIN_BPM = 5;
export const POLY_MAX_BPM = 1200;   // 1200 hits/min = 20/s, past what a pad can articulate

const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v);
  return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const clampInt = (v, lo, hi, dflt) => Math.floor(clampNum(v, lo, hi, dflt));

/* Read a pad's settings, or null when it plays on the ordinary grid.

   Validated on the way out rather than trusted: these ride in saved projects,
   and a damaged or hand-edited one must degrade to something playable instead
   of dividing by zero inside the scheduler.

   Old-format settings (mode/len/bars, from the first version) are converted
   here rather than at load time, so a project saved by R144-R146 still opens
   and plays the same rhythm it always did. */
export function polyCfg(pat, p) {
  const all = pat && pat.poly;
  const c = all && all[p];
  if (!c || !c.on) return null;

  /* Told apart by what only the OLD format has. Requiring both new keys meant a
     damaged {bpm:'x', cells:null} fell through to the legacy branch and came
     back with no bpm at all. */
  if (c.mode == null && c.len == null && c.bars == null) {
    return {
      bpm: clampNum(c.bpm, POLY_MIN_BPM, POLY_MAX_BPM, 120),
      cells: clampInt(c.cells, POLY_MIN_CELLS, POLY_MAX_CELLS, 4),
      lock: c.lock !== false,
      /* null means "never split out of the grid row" — the caller does that,
         because it is a mutation and this module does not own the pattern. */
      row: Array.isArray(c.row) ? c.row : null,
    };
  }
  /* R144-R146: {mode:'lock'|'free', len, bars}. A locked track was `len` hits
     across `bars` bars, which is len/bars hits per bar; a free one counted its
     BPM in sixteenths, so its hit rate was bpm*4. Both convert exactly. */
  const legacyLen = clampInt(c.len, 1, POLY_MAX_CELLS, 4);
  const row = Array.isArray(c.row) ? c.row : null;
  if (c.mode === 'free') {
    return { bpm: clampNum(Number(c.bpm) * 4, POLY_MIN_BPM, POLY_MAX_BPM, 120),
      cells: legacyLen, lock: false, row, migrated: true };
  }
  const bars = clampInt(c.bars, 1, 8, 1);
  return { hitsPerBar: legacyLen / bars, cells: legacyLen, lock: true, row, migrated: true };
}

export function isPoly(pat, p) { return polyCfg(pat, p) !== null; }

/* THE POLY LANE IS NOT THE GRID ROW.

   R144-R148 kept a poly pad's cells in the pattern's own step row, so the step
   grid and the poly panel were two views of one array. Reported as "both
   screens do the same thing", which they did, exactly: turning POLY on
   re-labelled the main grid as three cells instead of sixteen and the pad lost
   its ordinary part.

   They are two lanes now. The grid keeps the pad's normal pattern at the
   project's tempo; the poly lane holds its own-tempo hits; the pad plays both,
   and neither has to agree with the other. That is what makes "put a triple
   hit on one pad" possible without giving up the part already written there.

   Splitting an old project MOVES the cells across rather than copying them.
   They were authored as poly cells, and leaving a copy in the grid would add
   hits to the ordinary pattern that nobody wrote — the app's one rule is that
   the grid shows exactly what it plays, and a silent duplicate breaks it in
   both directions at once. */
export function polyEmptyRow() { return new Array(POLY_MAX_CELLS).fill(0); }

export function polyNeedsSplit(c) { return !!(c && !Array.isArray(c.row)); }

export function polySplit(stepRow, cells) {
  const n = clampInt(cells, POLY_MIN_CELLS, POLY_MAX_CELLS, 4);
  const row = polyEmptyRow();
  if (!Array.isArray(stepRow)) return { row, steps: [] };   // nothing to move
  const steps = stepRow.slice();
  for (let i = 0; i < n; i++) {
    row[i] = steps[i] > 0 ? steps[i] : 0;
    steps[i] = 0;
  }
  return { row, steps };
}

/* Cells past the end are removed rather than hidden, the same rule the pattern
   length follows. Returns how many went, so the app can say so out loud. */
export function polyTrimRow(row, cells) {
  if (!Array.isArray(row)) return 0;
  const n = clampInt(cells, POLY_MIN_CELLS, POLY_MAX_CELLS, 4);
  let cut = 0;
  for (let i = n; i < row.length; i++) if (row[i] > 0) { row[i] = 0; cut++; }
  return cut;
}

/* The project's tempo in the same units, derived from the bar. A bar is four
   beats, so a pad matching this number hits once per beat. */
export function mainBpmOf(barDur) { return barDur > 0 ? 240 / barDur : 0; }

/* How many hits this pad places in one bar, before locking. */
export function polyHitsPerBar(cfg, barDur) {
  if (!cfg || !(barDur > 0)) return 0;
  if (cfg.hitsPerBar != null) return cfg.hitsPerBar;     // converted from the old format
  return cfg.bpm * barDur / 60;
}

/* What the pad actually runs at once LOCK has had its say.

   Locking rounds to a whole number of hits per bar. That is the entire meaning
   of the switch: a whole number divides the bar evenly, so the pad returns to
   the downbeat every time; anything else cannot, and drifts. */
export function polyLockedHitsPerBar(cfg, barDur) {
  const raw = polyHitsPerBar(cfg, barDur);
  if (!cfg || !cfg.lock) return raw;
  /* A converted setting already states its rate exactly — 7 hits over 2 bars is
     3.5 per bar, and rounding that to 4 would silently change what an existing
     project sounds like. Only a BPM somebody typed gets snapped. */
  if (cfg.hitsPerBar != null) return raw;
  return Math.max(1, Math.round(raw));
}

/* The pad's effective BPM — what it plays at, which is what the panel should
   show once locking has nudged it. */
export function polyEffectiveBpm(cfg, barDur) {
  if (!cfg || !(barDur > 0)) return 0;
  return polyLockedHitsPerBar(cfg, barDur) * 60 / barDur;
}

/* Seconds between hits. */
export function polyStepDur(cfg, barDur) {
  const h = polyLockedHitsPerBar(cfg, barDur);
  return h > 0 && barDur > 0 ? barDur / h : 0;
}

/* Whether this pad genuinely returns to the downbeat. True when locked, and
   also true unlocked if the tempo happens to divide the bar evenly — which is
   worth saying, because setting an unlocked pad to exactly twice the project
   tempo should not claim to drift. */
export function polyDoesLock(cfg, barDur) {
  if (!cfg) return false;
  const h = polyLockedHitsPerBar(cfg, barDur);
  if (!(h > 0)) return false;
  /* Returning to the downbeat within a few bars still counts. 3.5 hits per bar
     comes round every two — a listener hears that as locked, and calling it
     drifting would be the panel telling them something they can hear is false. */
  for (let bars = 1; bars <= 8; bars++) {
    const n = h * bars;
    if (Math.abs(n - Math.round(n)) < 1e-9) return true;
  }
  return false;
}
/* How many bars until it comes back to the downbeat. 0 when it never does. */
export function polyCycleBars(cfg, barDur) {
  const h = polyLockedHitsPerBar(cfg, barDur);
  if (!(h > 0)) return 0;
  for (let bars = 1; bars <= 8; bars++) {
    const n = h * bars;
    if (Math.abs(n - Math.round(n)) < 1e-9) return bars;
  }
  return 0;
}

/* How the pad's rate compares with the project's, as a ratio in lowest terms
   when there is a tidy one. 3:4 is what a musician calls three-against-four. */
export function polyRatio(cfg, barDur) {
  if (!cfg || !(barDur > 0)) return null;
  const beats = polyEffectiveBpm(cfg, barDur) / mainBpmOf(barDur);   // hits per beat
  for (let den = 1; den <= 16; den++) {
    const num = beats * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const g = gcd(Math.round(num), den);
      return { num: Math.round(num) / g, den: den / g };
    }
  }
  return null;                                            // no small ratio: it drifts
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }

/* 1ns. The live scheduler builds its window boundaries by ACCUMULATING while
   the anchor is derived by SUBTRACTING from that accumulation; both reach the
   same instant and differ in the last bits, so a hit sitting exactly on a
   window edge — which the first hit of every bar does, by definition — was
   dropped by both windows or fired by both. It showed up as an intermittently
   missing hit: 17 evenly spaced one run, 15 with an 800ms hole the next.
   Five orders of magnitude below one sample at 44.1kHz, far above float noise,
   and applied to BOTH bounds so a hit near a boundary belongs to exactly one
   window. */
const EPS = 1e-9;

/* Every hit between two times.

   `anchor` is a known hit time and `anchorIdx` its position in the endless
   series, so the caller decides what the pad is measured from: a locked pad is
   anchored to the current bar (which re-anchors it, and carries it through a
   tempo change), a free one to when the sequence started (which is what makes
   it free). The cell each hit lands on is its series position modulo CELLS, so
   the row length is independent of the rate. */
export function polyEvents(cfg, anchor, anchorIdx, from, to, barDur) {
  const out = [];
  if (!cfg || !(barDur > 0) || !(to > from)) return out;
  const step = polyStepDur(cfg, barDur);
  if (!(step > 0)) return out;
  const cells = cfg.cells;

  let k = Math.floor((from - anchor) / step) - 1;
  for (;;) {
    const when = anchor + k * step;
    if (when >= to - EPS) break;
    if (when >= from - EPS) {
      const series = anchorIdx + k;
      out.push({ when, idx: ((series % cells) + cells) % cells });
    }
    k++;
    if (out.length > 100000) break;      // a runaway rate cannot hang the audio thread
  }
  return out;
}

/* Which cell is sounding now, for drawing. -1 before the sequence starts. */
export function polyIndexAt(cfg, anchor, anchorIdx, now, barDur) {
  if (!cfg || !(barDur > 0)) return -1;
  const step = polyStepDur(cfg, barDur);
  if (!(step > 0) || now < anchor - step) return -1;
  const series = anchorIdx + Math.floor((now - anchor) / step);
  return ((series % cfg.cells) + cfg.cells) % cfg.cells;
}
