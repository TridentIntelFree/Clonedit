/* WHAT NOTE IS THAT, measured off the audio.

   The app has never been able to answer this. It hears level, bands,
   onsets, attack and ring, and it cannot tell you what you played — so
   five analysers that are already calibrated against real corpora
   (`melody()` on 8,514 Essen folksongs, `motif()` on 8,196 of them,
   `counterpoint()` on 70 Palestrina scores, `harmony()` on 370 Bach
   chorales) can only ever look at steps the sequencer scheduled. Give
   them notes detected from a take and all five apply to something a
   person actually sang or played. One new measurement multiplying five
   that already exist is the best trade available here.

   MONOPHONIC, AND SAID OUT LOUD. One line at a time — a sung melody, a
   bass, a single-note lead. Polyphonic transcription is a research
   problem and pretending otherwise would produce confident nonsense on
   a strummed chord, so `detectPitch` reports its confidence and
   `pitchTrack` drops frames it cannot vouch for rather than guessing.

   THE METHOD IS CUMULATIVE-MEAN NORMALISED DIFFERENCE (the YIN family),
   not FFT peak-picking, and that choice is the whole reason this has a
   chance of being right. scripts/audit-pitch.mjs picks peaks out of a
   spectrum and its own header records what that costs: struck metal
   routinely has an upper partial louder than its fundamental, so the
   loudest peak reports a vibraphone an octave high, and it had to learn
   to take the "lowest strong partial" instead. A difference function
   measures PERIODICITY, which is the thing a pitch actually is, and
   does not care which harmonic happens to be loudest. It still has an
   octave failure mode — a period of 2T correlates almost as well as T —
   which is exactly what the absolute threshold below exists to resolve:
   take the FIRST dip under the threshold, not the deepest one, because
   the first is the shortest period and the deepest is often its octave
   down.

   MEASURED ON REAL RECORDINGS, not only on tones it was built to pass.
   Against nine Salamander Grand samples spanning the keyboard, each
   with the MIDI note its manifest declares, and with the range set to a
   piano's: EIGHT EXACT, including A0 at 27.35Hz. The one miss is C8,
   which AGENTS.md already records as the note where a hammer thud is
   louder than the fundamental, and it comes back `stable: false` with
   0.589 confidence rather than silently wrong. Every correct reading
   had three or more agreeing windows; every failure had one. That
   separation is why `stable` exists and why a caller must read it.

   A 120ms window was tried and is WORSE -- it loses A0 -- so the 90ms
   default is measured rather than assumed.

   THERE IS A CEILING AND IT IS MEASURED. Exact up to A7, 3520Hz, where
   one period is 12.5 samples at 44.1kHz; wrong by an octave at C8,
   4186Hz, where it is 10.5. Measuring periodicity in the time domain
   runs out when the period approaches a handful of samples, and no
   threshold fixes that -- it would want the frequency domain or
   upsampling. G6 is already above a soprano's top note, so this is far
   above the job, but it is a property and not a surprise.

   THE RANGE IS A DECLARATION, and the defaults are for the job this is
   for: a sung line, a bass, a single-note lead. A pitch outside
   [minHz, maxHz] cannot be found by a difference function searching
   only inside it, and what comes back is a plausible-looking wrong
   answer with low agreement -- which is what C8 is at the default
   1600Hz ceiling. Widen the range for an instrument that needs it, and
   read `stable` either way. */

/* MIDI and Hz, with A4 = 69 = 440Hz. Written out rather than inlined at
   four call sites, because an off-by-one in the 69 or a 12 in the wrong
   place is a whole-octave error that looks plausible in every log. */
export function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / 440); }
export function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiName(m) {
  const r = Math.round(m);
  return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

/* HOW FAR OFF THE NEAREST NOTE, in cents. Signed, sharp is positive.
   Kept separate from the detection so a caller can ask "what note" and
   "how well tuned" without conflating them — a singer 40 cents flat is
   singing the right note badly, not a different note, and those call
   for completely different things to be said. */
export function centsOff(hz) {
  const m = hzToMidi(hz);
  return Math.round((m - Math.round(m)) * 100);
}

/* ---- ONE WINDOW ---------------------------------------------------- */

/* THE DIFFERENCE FUNCTION over candidate lags, normalised so the dip
   depth means the same thing at any level.
 *
 *   d(tau)  = sum over the window of (x[i] - x[i+tau])^2
 *   d'(tau) = d(tau) / (mean of d(1..tau))
 *
 * The normalisation is what makes a single absolute threshold work
 * across a loud take and a quiet one. Without it the threshold has to
 * be tuned per recording, which is the same trap as a fixed -40dBFS
 * onset floor: it finds everything in a hot take and nothing in a
 * quiet one.
 */
export function difference(data, sampleRate, opt) {
  const o = opt || {};
  /* B0, which is the bottom of a five-string bass. 50 was the first
     default and it refused a four-string bass's low E at 41.2Hz
     outright -- correct behaviour for an out-of-range note and the
     wrong range. A window has to hold two periods of the lowest pitch
     it claims to find: 30Hz is a 33ms period, so the 90ms default
     window is the floor on this, not the number below. */
  const minHz = o.minHz || 30;
  const maxHz = o.maxHz || 1600;        /* above a soprano's top */
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(data.length / 2), Math.ceil(sampleRate / minHz));
  if (tauMax <= tauMin) return null;
  const n = Math.floor(data.length / 2);
  const d = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const diff = data[i] - data[i + tau]; s += diff * diff; }
    d[tau] = s;
  }
  /* cumulative mean normalisation, from tauMin so the early lags a
     window cannot support do not drag the mean down */
  const dn = new Float64Array(tauMax + 1).fill(1);
  let run = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    run += d[tau];
    dn[tau] = run > 0 ? d[tau] * (tau - tauMin + 1) / run : 1;
  }
  return { dn, tauMin, tauMax };
}

/* THE PITCH OF ONE WINDOW, or null when there is no periodicity worth
   reporting.
 *
 * `threshold` is the dip depth that counts as periodic. 0.1 is the
 * usual YIN value; higher finds more pitches and more of them wrong.
 *
 * THE FIRST DIP UNDER IT, NOT THE DEEPEST. A signal with period T also
 * repeats at 2T, 3T and so on, so the difference function dips at every
 * multiple and the dip at 2T is frequently a shade deeper than the one
 * at T. Taking the deepest is how a pitch tracker reports everything an
 * octave low, which is the single commonest failure in this whole
 * problem and the mirror image of what audit-pitch.mjs hit from the
 * spectral side.
 */
export function pitchOfWindow(data, sampleRate, opt) {
  const o = opt || {};
  const threshold = o.threshold != null ? o.threshold : 0.1;
  const r = difference(data, sampleRate, o);
  if (!r) return null;
  const { dn, tauMin, tauMax } = r;
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (dn[t] < threshold) {
      /* walk down to the local bottom of THIS dip, so the interpolation
         below has a real minimum to work with rather than the shoulder */
      while (t + 1 <= tauMax && dn[t + 1] < dn[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    /* nothing cleared the threshold. Report the best dip and let the
       caller decide with `confidence` — refusing outright would lose
       quiet or breathy notes that are still perfectly identifiable. */
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (dn[t] < dn[best]) best = t;
    if (dn[best] >= 0.5) return null;           /* genuinely not pitched */
    tau = best;
  }
  /* PARABOLIC INTERPOLATION around the minimum. Without it the pitch is
     quantised to whole samples: at 44.1kHz a lag of 100 samples is
     441Hz and 99 is 445.5Hz, so a semitone near the top of the range is
     only a couple of lags wide and everything reads as the same note. */
  let refined = tau;
  if (tau > tauMin && tau < tauMax) {
    const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
    const denom = 2 * (2 * b - a - c);
    if (denom !== 0) refined = tau + (c - a) / denom;
  }
  const hz = sampleRate / refined;
  return { hz: +hz.toFixed(2), tau: refined,
    confidence: +(1 - Math.min(1, dn[tau])).toFixed(3) };
}

/* ---- ONE NOTE ------------------------------------------------------ */

/* THE PITCH OF A SAMPLE THAT HOLDS ONE NOTE.
 *
 * SKIPS THE ATTACK, which matters more than it sounds. A struck or
 * plucked attack is broadband noise — a hammer, a pick, a stick — and
 * it is the least periodic part of the whole recording. Measuring from
 * sample zero reads the transient and reports the wrong note or none;
 * `skip` starts after it. Several windows are then measured across the
 * body and the MEDIAN taken, so one bad window cannot decide the
 * answer.
 */
export function detectPitch(data, sampleRate, opt) {
  const o = opt || {};
  const skip = o.skip != null ? o.skip : 0.04;        /* seconds */
  const winSec = o.window || 0.09;                    /* ~4 periods at 50Hz */
  const hops = o.hops || 5;
  const win = Math.floor(sampleRate * winSec);
  const start = Math.floor(sampleRate * skip);
  if (data.length < start + win) {
    /* too short to skip the attack and still have a window: measure
       what there is rather than refusing, and say so */
    const p = pitchOfWindow(data, sampleRate, o);
    return p ? Object.assign({ short: true, windows: 1 }, withNote(p)) : null;
  }
  const span = data.length - start - win;
  const picks = [];
  for (let k = 0; k < hops; k++) {
    const at = start + Math.floor(span * (hops === 1 ? 0 : k / (hops - 1)));
    const p = pitchOfWindow(data.subarray(at, at + win), sampleRate, o);
    if (p && p.confidence > 0) picks.push(p);
  }
  if (!picks.length) return null;
  /* MEDIAN OF THE MIDI NUMBER, not of the frequency. A median in Hz is
     pulled around by octave errors in a way a median in semitones is
     not, because an octave is a factor of two down there and a constant
     twelve up here. */
  const sorted = picks.slice().sort((a, b) => a.hz - b.hz);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const conf = picks.reduce((a, p) => a + p.confidence, 0) / picks.length;
  /* AGREEMENT IS ITS OWN NUMBER. Five windows that all say the same
     note is a different claim from five that average to it, and an
     octave error in one window shows here and nowhere else. */
  const midis = picks.map(p => hzToMidi(p.hz));
  const agree = midis.filter(m => Math.abs(m - hzToMidi(mid.hz)) < 0.5).length;
  /* IS THE SIGNAL EVEN MOVING AT THIS RATE? A difference function
     searching 30-1600Hz cannot find a 4186Hz fundamental, and what it
     returns instead is a lower multiple of the true period -- a
     plausible note, with every window agreeing, so `agree` does not
     catch it. (The real piano's top C was caught only because the
     recording is noisy; a clean tone sails through.)

     Zero crossings bound the answer from the other side. A quasi-
     periodic signal crosses zero about twice per cycle of whatever
     dominates it, so crossings/2 estimates the frequency actually
     present. A true fundamental with harmonics above it gives a ratio
     near 1-2 -- struck metal whose second partial is six times the
     fundamental sits around 2 -- while a pitch missed by a factor of
     three or more cannot. The threshold is above the metal case on
     purpose, because that one has to keep working. */
  let crossings = 0;
  const from = Math.min(start, Math.max(0, data.length - 1));
  for (let i = from + 1; i < data.length; i++) {
    if ((data[i - 1] < 0 && data[i] >= 0) || (data[i - 1] >= 0 && data[i] < 0)) crossings++;
  }
  const zcrHz = crossings / (2 * Math.max(1e-6, (data.length - from) / sampleRate));
  const tooSlow = mid.hz > 0 && zcrHz / mid.hz > 2.8;
  const stable = agree >= Math.ceil(picks.length * 0.6) && picks.length >= 2 && !tooSlow;
  const n = withNote(mid);
  return Object.assign(n, {
    windows: picks.length, agree,
    confidence: +conf.toFixed(3),
    stable,
    says: (stable
      ? n.note + ' (' + n.hz + 'Hz)' + (Math.abs(n.cents) >= 20
        ? ', but ' + Math.abs(n.cents) + ' cents ' + (n.cents > 0 ? 'sharp' : 'flat')
          + ' \u2014 that is the right note played out of tune, not a different note'
        : ', in tune within ' + Math.abs(n.cents) + ' cents')
        + '. ' + agree + ' of ' + picks.length + ' windows agree.'
      : (tooSlow
        ? 'UNRELIABLE: ' + n.note + ' (' + n.hz + 'Hz) cannot be right \u2014 the signal '
          + 'crosses zero about ' + Math.round(zcrHz) + ' times a second, far faster than '
          + 'that note, so its real pitch is above the ' + (o.maxHz || 1600)
          + 'Hz ceiling being searched. Widen maxHz.'
        : 'UNRELIABLE: only ' + agree + ' of ' + picks.length + ' windows agree, so '
          + n.note + ' is a guess. Either the sound is not strongly pitched, or its '
          + 'pitch is outside the ' + (o.minHz || 30) + '-' + (o.maxHz || 1600)
          + 'Hz range being searched.')),
  });
}

function withNote(p) {
  const m = hzToMidi(p.hz);
  return { hz: p.hz, midi: Math.round(m), note: midiName(m),
    cents: centsOff(p.hz), confidence: p.confidence };
}

/* ---- A LINE --------------------------------------------------------- */

/* A SUNG OR PLAYED LINE AS NOTE EVENTS, which is the point of all of
 * the above: this is what `melody()`, `motif()` and `harmony()` can
 * read.
 *
 * Frames are measured at a fixed hop, dropped when they are not
 * confidently pitched, then runs of the same note are merged into one
 * event. The merge is what turns a pitch contour into music — without
 * it a two-second note is four hundred frames and no analyser wants
 * that.
 *
 * `minNoteSec` throws away runs too short to be notes. Vibrato, a
 * glide between two notes and a cracked attack all produce a frame or
 * two of a neighbouring pitch, and reporting those as grace notes would
 * fill a melody with things nobody played. The default is a 32nd at
 * 120bpm.
 */
export function pitchTrack(data, sampleRate, opt) {
  const o = opt || {};
  const hopSec = o.hop || 0.02;
  const winSec = o.window || 0.09;
  const minConf = o.minConfidence != null ? o.minConfidence : 0.6;
  const minNote = o.minNoteSec != null ? o.minNoteSec : 0.0625;
  const win = Math.floor(sampleRate * winSec);
  const hop = Math.max(1, Math.floor(sampleRate * hopSec));
  const frames = [];
  for (let at = 0; at + win <= data.length; at += hop) {
    const p = pitchOfWindow(data.subarray(at, at + win), sampleRate, o);
    frames.push(p && p.confidence >= minConf
      ? { t: at / sampleRate, midi: hzToMidi(p.hz), hz: p.hz, conf: p.confidence }
      : null);
  }
  const notes = [];
  let run = [], gap = 0;
  const gapFrames = o.gapFrames != null ? o.gapFrames : 3;
  const flush = () => {
    if (!run.length) return;
    const dur = run[run.length - 1].t - run[0].t + hopSec;
    if (dur >= minNote) {
      const ms = run.map(f => f.midi).sort((a, b) => a - b);
      const med = ms[Math.floor(ms.length / 2)];
      notes.push({
        at: +run[0].t.toFixed(3), seconds: +dur.toFixed(3),
        midi: Math.round(med), note: midiName(med),
        cents: Math.round((med - Math.round(med)) * 100),
        confidence: +(run.reduce((a, f) => a + f.conf, 0) / run.length).toFixed(3),
        frames: run.length,
      });
    }
    run = [];
  };
  for (const f of frames) {
    /* A NOTE IS NOT ENDED BY ONE BAD FRAME. Vibrato sweeps the pitch
       inside the analysis window, which smears the dip and drops the
       odd frame below the confidence floor; flushing on each one broke
       a steady sung note into fragments too short to survive
       minNoteSec, and a 1.5-second note came back as NOTHING. A short
       unvoiced gap is noise inside a note, not a boundary. */
    if (!f) { if (++gap > gapFrames) flush(); continue; }
    /* COMPARED TO THE RUN, NOT TO THE FRAME BEFORE IT. Against the
       previous frame, a gradual drift walks across a semitone without
       any single step exceeding the threshold -- so a line of C D E F G
       came back as C D F G, with E and F merged into one note whose
       median landed between them. The run's own reference pitch is what
       a new note has to differ from. */
    /* THE RUN'S CENTRE, not its first frame. Vibrato of a third of a
       semitone either way spans 0.7, so a run that happens to START at
       an extreme sees every frame at the far extreme as 0.7 away and
       splits on it -- which is how a steady 1.5-second sung note with
       ordinary vibrato came back as no notes at all. The running mean
       centres the comparison, and a real semitone step still clears it
       at once. */
    const ref = run.length
      ? run.reduce((a, x) => a + x.midi, 0) / run.length
      : f.midi;
    if (run.length && Math.abs(f.midi - ref) > 0.6) flush();
    gap = 0;
    run.push(f);
  }
  flush();
  const voiced = frames.filter(Boolean).length;
  return {
    notes, frames: frames.length, voiced,
    says: notes.length
      ? notes.length + ' note(s) over ' + frames.length + ' frames ('
        + Math.round(100 * voiced / Math.max(1, frames.length)) + '% pitched): '
        + notes.map(n => n.note).join(' ')
        + '. Monophonic only — a chord will come back as one of its notes '
        + 'or as nothing, not as a chord.'
      : 'nothing reliably pitched here. '
        + (voiced ? 'Some frames were pitched but no run lasted long enough to '
          + 'be a note.' : 'A strummed chord, a drum, or noise will all do this.'),
  };
}

