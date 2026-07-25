/* EUCLID — spread N hits as evenly as possible over K steps.

   The distribution behind tresillo, son clave, and most Afro-Latin and Balkan
   rhythm. Pairs with per-track length (polymeter): a 5-in-7 track against a
   16-step kick phrases for bars before it lines up again. */
import { clamp } from './math.js';

export function euclid(hits, steps, rot) {
  steps = Math.max(1, steps | 0);
  hits = clamp(hits | 0, 0, steps);
  const out = new Array(steps).fill(false);
  if (hits === 0) return out;
  if (hits === steps) { out.fill(true); return out; }
  /* Maximally even, and phased so step 0 is always a hit — otherwise "1 in 4"
     lands on the last step instead of the downbeat, which is the wrong bar. */
  for (let i = 0; i < steps; i++) out[i] = ((i * hits) % steps) < hits;
  if (rot) {
    const r = ((rot | 0) % steps + steps) % steps;
    return out.slice(r).concat(out.slice(0, r));
  }
  return out;
}
