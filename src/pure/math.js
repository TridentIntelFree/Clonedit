/* Small numeric helpers. No DOM, no audio, no app state. */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* JavaScript's % keeps the sign of the dividend, which is wrong for wrapping a
   step index — the sequencer runs backwards at negative BPM and needs -1 to
   land on the last step, not on -1. */
export const posMod = (n, m) => ((n % m) + m) % m;

/* BPM is signed: negative means the sequencer runs backwards. Time maths always
   uses the magnitude; the sign only decides step order. */
/* NaN has no sign and no magnitude, and Math.abs(NaN) is NaN, which clamp
   passes straight through — so clampBpm(NaN) returned NaN, setBpm stored it,
   and the next write to an AudioParam threw. A tempo that cannot be read is
   not a tempo, so it falls back to the default rather than propagating. */
export function clampBpm(b, dflt = 120) {
  if (typeof b !== 'number' || !isFinite(b)) return dflt;
  const sign = b < 0 ? -1 : 1;
  return sign * clamp(Math.abs(b), 1, 999);
}

/* Deterministic PRNG. Impulse responses and the SCATTER morph order are
   generated from it, so the same seed has to give the same result on every
   device and in every render — otherwise a bounce would not match what was
   heard, and a morph would not repeat. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
