/* WHAT A SAMPLE CAN ACTUALLY DO, measured from the sample.

   WRITE knows each instrument's PITCH and nothing about its SOUND. The
   register comes from the pad's sampled note and the role from the mean
   of those notes, and that is the whole of what `infill()` and
   `ensemble()` know about the thing they are writing for. So a part gets
   written identically for a 90ms pluck and a two-second bowed swell, and
   whether it can be played at all is discovered by listening.

   Two of the measurements in `scripts/timbre-atlas.mjs` decide that, and
   neither needs a render or a Fourier transform — just the envelope of
   the buffer the pad already holds:

     attack   how long before the sound is established. A note shorter
              than its own attack never speaks. At 174bpm a sixteenth is
              86ms, and a bowed cello takes 150-300ms to arrive, so a
              generated dnb part on strings is silence with the shape of
              a part.

     ring     how long it carries after its peak, taken 20dB down —
              where a sound stops carrying rather than where it
              technically ends. This is what decides whether sixteen
              notes a bar overlap into mush, and it is the same number
              the ringing-note problem in AGENTS.md turns on: a held
              note has to land somewhere in the chord it rings INTO.

   THE METHOD IS THE ATLAS'S, DELIBERATELY. 5ms RMS windows, attack to
   90% of the envelope peak, ring from the peak down 20dB. If these
   disagreed with `samples/atlas-*.json` there would be two answers to
   the same question about the same sound, and the atlas is the one with
   packs already measured against it. A 10ms window was once too coarse
   to see a cello's attack at all, which is why it is 5.

   No FFT here. The band a sound owns and its air-against-body are the
   atlas's other two measurements and they are about choosing a sound for
   a job, not about whether a part is playable; they want a transform and
   they can come later rather than be half-done now. */

/* RMS in fixed windows. Takes a Float32Array (or any indexable of
   -1..1 floats), which is what an AudioBuffer channel is, so the engine
   hands this its own audio with no conversion. */
export function envelopeRms(data, sampleRate, winSec = 0.005) {
  const n = data.length | 0;
  const w = Math.max(1, Math.floor(sampleRate * winSec));
  const out = [];
  for (let i = 0; i + w <= n; i += w) {
    let s = 0;
    for (let j = i; j < i + w; j++) { const v = data[j]; s += v * v; }
    out.push(Math.sqrt(s / w));
  }
  return out;
}

/* ATTACK AND RING, in milliseconds, from an envelope.

   `winSec` has to be the one the envelope was built with or every number
   is wrong by that ratio — it is passed rather than assumed for exactly
   that reason. */
export function attackRing(env, winSec = 0.005) {
  const ms = winSec * 1000;
  if (!env || !env.length) return { attackMs: 0, ringMs: 0, peakAt: 0, silent: true };
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
  /* A buffer of digital silence has no attack and no ring, and saying 0
     for both would read as "instant and dry" rather than "nothing here".
     The caller needs to be able to tell those apart. */
  if (peak <= 0) return { attackMs: 0, ringMs: 0, peakAt: 0, silent: true };

  /* WHERE IT REACHES ITS LEVEL, not the single largest window.

     Taken as the strict argmax, a SUSTAINED sound breaks the
     measurement: its envelope is flat, so which window is numerically
     largest is floating-point noise and can be the last one — and then
     the ring is measured from the end of the buffer and comes back as
     about zero. A held organ note read as instant and dry.

     Found by testing against a constant-amplitude sine, which is the
     one shape where "the peak" has no single answer. The first window
     within 1% of the peak is the same index on a struck sound and the
     START on a sustained one, which is what both cases want. */
  let peakAt = 0;
  for (let i = 0; i < env.length; i++) if (env[i] >= peak * 0.99) { peakAt = i; break; }

  let a = peakAt;
  for (let i = 0; i <= peakAt; i++) if (env[i] >= peak * 0.9) { a = i; break; }
  /* 20dB down is 10% of amplitude. If it never gets there the sound is
     still carrying when the buffer ends, so the ring is AT LEAST the
     rest of the buffer — reported with `ringClipped` rather than as a
     measurement, because a sustained pad trimmed to two seconds would
     otherwise read as a two-second decay. */
  let d = -1;
  for (let i = peakAt; i < env.length; i++) if (env[i] <= peak * 0.1) { d = i; break; }
  const clipped = d < 0;
  if (clipped) d = env.length - 1;
  return {
    attackMs: Math.round(a * ms),
    ringMs: Math.round((d - peakAt) * ms),
    ringClipped: clipped,
    peakAt: Math.round(peakAt * ms),
    silent: false,
  };
}

/* THE ONE CALL THE ENGINE WANTS: a channel in, the numbers out. */
export function timbreOf(data, sampleRate, winSec = 0.005) {
  let peak = 0;
  /* strided, because a stack-blowing Math.max(...buffer) is a mistake
     already made once in this repo on a multi-megabyte buffer */
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  const env = envelopeRms(data, sampleRate, winSec);
  const ar = attackRing(env, winSec);
  return Object.assign({
    peak: +peak.toFixed(4),
    peakDb: peak > 0 ? +(20 * Math.log10(peak)).toFixed(1) : -Infinity,
    seconds: +(data.length / sampleRate).toFixed(3),
  }, ar);
}

/* ---- WHAT IT MEANS FOR A PART ------------------------------------- */

/* A SIXTEENTH, IN MILLISECONDS. Written out because getting it wrong is
   invisible: at 92bpm it is 163ms and at 174bpm it is 86ms, and a sound
   that is fine on one is inaudible on the other. */
export function stepMs(bpm) { return 15000 / Math.max(1, Math.abs(bpm)); }

/* CAN THIS SOUND BE PLAYED AT THIS RATE, and how long may a note be.

   `gap` is how many sixteenths apart the notes are, so 1 is sixteenths
   and 4 is quarter notes.

   It reports rather than decides. The one thing it is firm about is the
   attack: a note shorter than the time the sound takes to establish is
   not a quiet note, it is no note, and that is brokenness rather than
   taste — the distinction the whole check layer here rests on. The ring
   is returned as a fact about overlap, because overlap is sometimes the
   point. A trio holds its bar lines together with it. */
export function playable(timbre, bpm, gap = 1) {
  const sm = stepMs(bpm);
  const noteMs = sm * Math.max(1, gap);
  const t = timbre || {};
  const attackMs = t.attackMs || 0;
  const ringMs = t.ringMs || 0;
  /* HALF, not all of it. A note has to last long enough for the sound to
     be established, and a note exactly as long as its own attack is cut
     off at the moment it arrives. Half is the point where it is audibly
     a note rather than a click. */
  const speaks = attackMs <= noteMs * 0.5;
  const overlap = ringMs > noteMs ? +(ringMs / noteMs).toFixed(2) : 0;
  const says = !speaks
    ? ('this sound takes ' + attackMs + 'ms to speak and a note here is '
      + Math.round(noteMs) + 'ms, so it will not be heard. Write it slower '
      + '(a wider gap), take the tempo down, or trim the pad’s start.')
    : overlap >= 2
      ? ('it rings for ' + ringMs + 'ms over a ' + Math.round(noteMs)
        + 'ms note, so about ' + Math.ceil(overlap) + ' notes sound at once. '
        + 'That is glue in a trio and mud in a fast part — every note late '
        + 'in a bar has to land in the chord it rings into.')
      : 'it speaks in time and does not pile up at this rate.';
  return { speaks, noteMs: Math.round(noteMs), attackMs, ringMs, overlap, says };
}

/* THE WIDEST GAP WORTH ASKING FOR, or rather the narrowest that works:
   how many sixteenths apart notes have to be for this sound to speak. 1
   means sixteenths are fine. Capped, because past a bar the answer is
   that the sound is wrong for the job and not that the part should be
   slower. */
export function minGap(timbre, bpm, cap = 16) {
  const sm = stepMs(bpm);
  const attackMs = (timbre && timbre.attackMs) || 0;
  const need = Math.ceil(attackMs / (sm * 0.5));
  return Math.max(1, Math.min(cap, need || 1));
}
