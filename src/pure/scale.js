/* SCALE LOCK — a musical guard-rail.

   Pitch in the sequencer is a SEMITONE OFFSET from each pad's own sound, so
   offset 0 is that pad's tonic. Snapping sends every written or played offset
   to the nearest degree of the chosen scale: you can still play anything, it
   just lands in key. */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
  pmaj: [0, 2, 4, 7, 9], pmin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* Snap a semitone offset into `scaleName`. Ties resolve DOWNWARD by design:
   between two equally near degrees the lower one keeps the line from drifting
   sharp as it is repeatedly re-snapped. The octave above is considered too, so
   a note just under the octave does not get dragged back down a whole scale. */
export function snapSemitone(semi, scaleName) {
  const sc = SCALES[scaleName] || SCALES.minor;
  const oct = Math.floor(semi / 12), rem = semi - oct * 12;
  let best = sc[0], bd = Infinity;
  for (const d of sc) { const dist = Math.abs(d - rem); if (dist < bd) { bd = dist; best = d; } }
  if (Math.abs(12 - rem) < bd) return (oct + 1) * 12;
  return oct * 12 + best;
}
