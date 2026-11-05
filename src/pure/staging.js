/* EVERY SOUND IN A KIT SHOULD ARRIVE AT THE SAME LEVEL.

   Measured on CHAMBER as it first shipped, peak dBFS per pad:

     Cellos 47      -20.5        Contrabass 45  -22.5
     Cellos 67      -21.4        Contrabass 30  -36.8
     Glockenspiel 7 -38.5        Glockenspiel 8 -42.2

   A 22dB spread inside one kit. AGENTS.md is explicit that gain is a
   multiplier on whatever the pad holds and that sources here differ by
   35dB on disk, so staging from each sample's measured peak comes first
   and balancing by ear comes after — and the kits shipped with neither.
   Someone loading CHAMBER and writing a part gets a cello fifteen
   decibels over the glockenspiel before a single mixing decision has
   been made.

   THE TARGET IS THE MEDIAN, NOT THE LOUDEST OR THE QUIETEST. Aiming at
   the loudest asks the quiet pads for gain they cannot have — the
   glockenspiel would need +18dB and the cap is +6 — and aiming at the
   quietest drags the whole kit down to its worst recording and throws
   away headroom. The median moves the most pads the least, and the ones
   that cannot reach it are named rather than silently clamped, which is
   the rule AGENTS.md sets out under "let it fail loudly": a clamped gain
   looks like a staged level and is not one.

   PEAK IS NOT LOUDNESS AND THIS DOES NOT PRETEND OTHERWISE. A 25ms
   glockenspiel tick and a 5-second cello swell at the same peak are not
   equally loud — the ear integrates over time and the cello wins easily.
   Equal peak is a STARTING POINT that removes a 22dB accident; it is not
   a mix. The honest thing is to say so, which `says` does, rather than
   to reach for per-pad LUFS, which AGENTS.md shows reads frequency as
   loudness and would rank a busy hat over a kick.                      */

/* the engine's cap; a gain above this cannot be set at all */
export const GAIN_MAX = 2;

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/* `pads` is [{pad, peak}] with peak LINEAR, as bufPeak() returns it.
   Returns a gain per pad plus what could not be reached.

   `floorDb` stops a single near-silent pad from defining the target: a
   pad measuring below it is staged as far as the cap allows and then
   reported, instead of dragging the median down with it. */
export function stagePads(pads, opt) {
  const o = opt || {};
  const maxGain = o.maxGain || GAIN_MAX;
  const floorDb = o.floorDb != null ? o.floorDb : -60;

  const live = (pads || []).filter(p => p && p.peak > 0 && db(p.peak) > floorDb);
  if (!live.length) return { target: null, gains: {}, short: [], says: 'nothing to stage' };

  const peaks = live.map(p => db(p.peak)).sort((a, b) => a - b);
  const target = o.targetDb != null ? o.targetDb
    : peaks[Math.floor(peaks.length / 2)];

  const gains = {}, short = [];
  for (const p of (pads || [])) {
    if (!p || !(p.peak > 0)) continue;
    const have = db(p.peak);
    const want = Math.pow(10, (target - have) / 20);
    if (want > maxGain) {
      /* NAMED, NOT CLAMPED. The bell tree in this repo was pushed to
         maximum and stayed inaudible because it peaks at -40dBFS and no
         gain setting reaches the job; reporting that is the difference
         between "this is staged" and "this is as close as it gets". */
      gains[p.pad] = maxGain;
      short.push({ pad: p.pad, peakDb: +have.toFixed(1),
        shortBy: +(target - have - db(maxGain)).toFixed(1) });
    } else {
      gains[p.pad] = +Math.max(0.02, want).toFixed(3);
    }
  }

  const spread = +(peaks[peaks.length - 1] - peaks[0]).toFixed(1);
  let says = 'staged ' + Object.keys(gains).length + ' pads to '
    + target.toFixed(1) + 'dB peak, closing a ' + spread + 'dB spread';
  if (short.length) says += '. ' + short.length + ' could not reach it: '
    + short.map(s => 'pad ' + s.pad + ' is ' + s.shortBy + 'dB short').join(', ')
    + ' — those samples are quiet on disk and gain stops at ' + maxGain;
  says += '. Peak is not loudness, so a long sound will still read louder '
    + 'than a short one at the same number.';

  return { target: +target.toFixed(1), gains, short, spread, says };
}
