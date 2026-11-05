/* WHAT IS ON THIS PAD, measured rather than guessed from its name.

   The song builder assigned kick, snare and hat BY PAD INDEX:

     const drums = free.filter(...).slice(0, 3);
     //   drums[0] -> kick figure, [1] -> snare, [2] -> hat

   So whichever three pads happened to be free, in pad order, got the
   three voices. Load a hat on A01 and a kick on A03 and the measured
   hiphop kick bar lands on the hat while the hat pattern fires the
   kick — and every check in the repo passes, because the steps are on
   the grid and the harmony is untouched. Nothing was broken. It just
   was not the kit anybody loaded.

   `timbre()` already measures attack and ring and that is not enough to
   tell those apart: a kick and a closed hat can both be a 10ms attack
   and a 90ms tail. The difference is entirely SPECTRAL — where the
   energy sits — which nothing in this folder measured.

   WHY AN FFT LIVES HERE when the engine has one. `fftInPlace()` is in
   legacy.js, and src/pure/ is bundled and published BEFORE the engine
   runs, so pure code cannot call it; it is also inside legacy's
   block-scoped half. The whole argument for this folder is that it is
   importable into Node and tested in milliseconds against signals whose
   answers are known, and that is worth twenty lines of radix-2 more than
   it is worth a dependency that can only be exercised in a browser. */

/* ---- the transform ------------------------------------------------- */

/* In-place radix-2 Cooley-Tukey. Length must be a power of two; callers
   below guarantee it by zero-padding a window. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2], bi = im[i + k + len / 2];
        const tr = br * cr - bi * ci, ti = br * ci + bi * cr;
        re[i + k] = ar + tr; im[i + k] = ai + ti;
        re[i + k + len / 2] = ar - tr; im[i + k + len / 2] = ai - ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  return re;
}

/* The same nine bands scripts/timbre-atlas.mjs uses, so a pad measured
   in the app and a sample measured offline are comparable. Changing this
   list silently makes every stored profile mean something else. */
export const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500],
  [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];

export function bandName([a, b]) {
  const s = n => n >= 1000 ? (n / 1000) + 'k' : '' + n;
  return s(a) + '-' + s(b);
}

/* ENERGY PER BAND, RELATIVE TO THE TOTAL, in dB.

   Relative on purpose and the reason is in AGENTS.md: "Read spectra
   normalised, never absolute. An absolute reading once showed a track
   fixed at the top while a 16 dB hole sat at 500 Hz." A pad's absolute
   level is `peakDb`, which is reported separately because it answers a
   different question — staging, not identity.

   Measured over the window where the sound actually IS. A found
   recording can be four seconds of room tone around a fifth of a second
   of event, and averaging the whole file describes the room. */
export function bandEnergies(data, sampleRate, opt) {
  const o = opt || {};
  const sr = sampleRate || 44100;
  if (!data || !data.length) return null;

  /* find the loudest 186ms and measure there */
  const winN = Math.max(256, Math.round(sr * (o.window || 0.186)));
  let at = 0;
  if (data.length > winN) {
    const hop = Math.max(1, Math.round(winN / 4));
    let best = -1;
    for (let s = 0; s + winN <= data.length; s += hop) {
      let e = 0;
      for (let i = s; i < s + winN; i += 4) e += data[i] * data[i];
      if (e > best) { best = e; at = s; }
    }
  }

  let N = 1; while (N < winN) N <<= 1;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < winN && at + i < data.length; i++) {
    /* Hann, or the window edges ring across every band and a kick reads
       as having air it does not have */
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (winN - 1));
    re[i] = data[at + i] * w;
  }
  fft(re, im);

  const half = N >> 1, binHz = sr / N;
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k++) mag[k] = re[k] * re[k] + im[k] * im[k];

  const raw = BANDS.map(([lo, hi]) => {
    let e = 0;
    const a = Math.max(1, Math.round(lo / binHz)), b = Math.min(half - 1, Math.round(hi / binHz));
    for (let k = a; k <= b; k++) e += mag[k];
    return e;
  });
  let total = 0; for (const e of raw) total += e;
  if (!(total > 0)) return null;

  /* spectral centroid over the measured range — one number for "how
     bright", which is what separates a kick from a hat */
  let num = 0, den = 0;
  for (let k = Math.max(1, Math.round(20 / binHz)); k < half; k++) {
    num += k * binHz * mag[k]; den += mag[k];
  }

  let air = 0, body = 0;
  BANDS.forEach(([lo], i) => { if (lo >= 2000) air += raw[i]; else if (lo < 500) body += raw[i]; });

  return {
    /* `lo` AND `hi` TRAVEL WITH EACH BAND, and leaving them off made
       fromShape() read every band as sitting at 0Hz — so air-vs-body
       came back as the -120dB floor for every sound and a bend measured
       identical before and after. The engine's own specShape() carries
       them; two shapes of the same shape is how that went unnoticed. */
    bands: BANDS.map((b, i) => ({
      band: bandName(b), lo: b[0], hi: b[1],
      rel: +(10 * Math.log10(Math.max(raw[i], 1e-12) / total)).toFixed(1),
    })),
    owns: bandName(BANDS[raw.indexOf(Math.max(...raw))]),
    centroidHz: den > 0 ? Math.round(num / den) : 0,
    airVsBodyDb: +(10 * Math.log10(Math.max(air, 1e-12) / Math.max(body, 1e-12))).toFixed(1),
    atSec: +(at / sr).toFixed(3),
  };
}

/* ---- WHAT JOB CAN THIS SOUND DO ------------------------------------ */

/* AIR-VS-BODY IS THE AXIS, AND THE FIRST VERSION OF THIS GOT IT WRONG.

   That version scored mostly on the spectral centroid: under 150Hz a
   kick, 300-2500Hz a snare, above 2500Hz a hat. It passed every
   synthesised fixture and then measured a real pack of 27 drums, and
   **every single snare came back as a hat**:

     sample              truth  read   owns      centroid   air
     jbh:snare_909       snare  hat    120-250       3798   -1.9
     jbh:snare_acoustic  snare  hat    8k-16k        6716    8.7
     jbh:snare_tight     snare  hat    250-500       4675   -1.3
     jbh:snare_rim       snare  hat    8k-16k        7671    9.6
     jbh:clap            snare  hat    4k-8k         6601   21.7

   A real snare is BRIGHT. The wire buzz puts its centroid at 3.8-7.7kHz,
   which is exactly where the hats sit (hat_closed 3033, ride 4215,
   hat_open 5551), so the centroid cannot separate those two at all. The
   assumption that a snare is a "mid" sound came from nowhere but
   intuition, which is the failure AGENTS.md describes as a plausible
   number reading later as a measurement.

   What DOES separate them, cleanly, across the same 27 samples:

     kick    air-vs-body  -95.6 .. -41.8     all body, no air
     snare                -10.9 .. +21.7     shell tone AND wire buzz
     hat                  +31.0 .. +82.8     all air, no body

   That is not a curiosity of one pack, it is what the instruments are: a
   kick drum is a tuned membrane with nothing above it, a cymbal is
   nothing but overtones, and a snare is the one that has both at once.
   Being a RATIO it is also level-independent, so a pack staged 20dB
   quieter measures the same — which the centroid is not, but the gain
   test below pins that down anyway.

   STATUS OF THESE NUMBERS, stated plainly because this repo has been
   burnt by not stating it: the three bands are calibrated against
   samples/jbh-drums.json, 22 of whose 27 samples have an unambiguous
   name, and verified not to regress on the found-sound packs. They are
   not a corpus norm. The boundaries sit in the wide gaps between the
   observed ranges (-25 and +28, against gaps of 31dB and 9dB) rather
   than being fitted to the edges, so a sound somewhat outside anything
   measured here still lands in the right band.

   And it RANKS rather than decides. It returns a score per role and the
   caller takes the best available assignment, so three pads always
   produce three voices even when none is a textbook example —
   `confident` says whether the winner actually looked like the thing. A
   board of three marimba notes gets a kit and is told it is a guess. */
export function kitRoleOf(p) {
  if (!p || p.silent || !p.centroidHz) return null;
  const c = p.centroidHz, air = p.airVsBodyDb, ring = p.ringMs || 0;
  const score = {
    /* ALL BODY. The centroid still contributes, because a kick really is
       the one voice whose fundamental is where its energy is, and it
       breaks ties among several dark sounds — but it no longer decides. */
    kick: (air < -25 ? 3 : air < -12 ? 1.5 : 0)
      + (c < 150 ? 2 : c < 400 ? 1 : 0)
      + (ring < 600 ? 0.5 : 0),
    /* BOTH AT ONCE: a shell tone with a wire buzz over it. This is the
       middle of the one axis that separates the three, so it is defined
       by the band rather than by a direction. */
    snare: (air >= -25 && air < 28 ? 3 : 0)
      + (c >= 400 ? 1 : 0)
      + (ring < 800 ? 0.5 : 0),
    /* ALL AIR. Short for a closed hat, long for an open one or a ride,
       so ring deliberately does not feature. */
    hat: (air >= 28 ? 3 : air >= 14 ? 1 : 0)
      + (c >= 2000 ? 1 : 0),
  };
  const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
  return { role: best, score, confident: score[best] >= 4,
    says: 'air-vs-body ' + air + 'dB, centroid ' + c + 'Hz, ring '
      + Math.round(ring) + 'ms' };
}

/* IS THIS A PITCHED SOUND OR A NOISE. Only used to keep a tuned
   instrument out of the drum slots and a cymbal out of a melody, and it
   is deliberately shy: `null` where the evidence is thin, because
   guessing wrong in either direction is worse than saying nothing and
   letting the existing `inst` tag decide. */
export function pitchedness(p) {
  if (!p || p.silent) return null;
  if (p.ringMs == null || !p.centroidHz) return null;

  /* A LONG LOW TAIL IS AMBIGUOUS AND MUST STAY THAT WAY.

     The first version called anything with a 500ms+ tail and a centroid
     under 3kHz `pitched`, and a 909 kick is exactly that: it rings for
     about 600ms with its energy at 62Hz. So the song builder read the
     kick as a melodic voice, dealt it a bass line, and left the kit
     without one — reported as `kick=—` on a board whose kick was sitting
     right there and had been correctly identified as a kick by the other
     half of this file one line earlier.

     The deeper reason is that there is nothing to detect. An 808 kick
     and an 808 bass note are the SAME SIGNAL; which one it is depends on
     what you play it as. samples/jbh-drums.json ships both and they
     measure alike — kick_808 at 62Hz and bass808_C1 at 36Hz, both all
     body, both ringing. No spectrum tells them apart, so claiming to is
     a fabrication, and the caller has two better sources of truth: the
     `inst` tag, which is the person saying outright that a pad is an
     instrument, and the kit scores, which say what it would be good at.

     So below 300Hz this returns null — not sure — and lets them
     decide. */
  if (p.centroidHz < 300) return null;

  /* a long tail with the energy in the mid is a note; a short burst, or
     a short burst with air on it, is a hit */
  if (p.ringMs >= 500 && p.centroidHz < 3000) return 'pitched';
  if (p.ringMs < 250 && p.airVsBodyDb > -4) return 'percussive';
  if (p.ringMs < 150) return 'percussive';
  return null;
}

/* ONE PAD'S PROFILE: level, envelope, spectrum, and what it is for.
   `t` is a timbre() result (attackMs, ringMs, peak, peakDb, silent). */
export function profileOf(t, data, sampleRate) {
  const sp = bandEnergies(data, sampleRate) || {};
  const p = Object.assign({}, t || {}, sp);
  p.kit = kitRoleOf(p);
  p.kind = pitchedness(p);
  return p;
}

/* ASSIGN THE KIT, best-first, one pad per voice.

   Greedy over the whole score matrix rather than per voice in turn,
   because picking the kick first and then the best remaining snare gives
   a worse assignment whenever one pad is the top candidate for two
   voices. `profiles` is a map of pad index -> profileOf result. */
export function assignKit(profiles, pads) {
  const want = ['kick', 'snare', 'hat'];
  const cand = [];
  for (const pad of pads || []) {
    const p = profiles[pad];
    if (!p || !p.kit) continue;
    for (const v of want) cand.push({ pad, voice: v, score: p.kit.score[v] });
  }
  cand.sort((a, b) => b.score - a.score || a.pad - b.pad);
  const out = {}, takenPad = new Set();
  for (const c of cand) {
    if (out[c.voice] != null || takenPad.has(c.pad)) continue;
    out[c.voice] = c.pad; takenPad.add(c.pad);
  }
  /* Anything the measurement could not speak for keeps the old
     behaviour: the next free pad in index order. A kit of nothing is
     worse than a kit that is a guess, and the caller is told which. */
  const spare = (pads || []).filter(p => !takenPad.has(p));
  for (const v of want) if (out[v] == null && spare.length) {
    out[v] = spare.shift(); out.guessed = (out.guessed || []).concat(v);
  }
  return out;
}

/* ---- BEND TO MY WILL ----------------------------------------------- */

/* "A bend-to-my-will button that FORCES pads into parameters as best I
   can, as opposed to selecting the best available."

   CHECK MY SOUNDS and the kit assignment both pick: they rank the pads
   you have against each job and take the best fit. This is the other
   verb. You name the job, and the sound is pushed toward it with the
   pad's own controls until it measures like the thing — a ride cymbal
   dragged down into something that can hold a kick's place, rather than
   being told it is the wrong sound.

   What makes it possible is that kitRoleOf() turned "is this a kick"
   into two numbers. A target is therefore a RANGE on each of those
   numbers, and bending is a search for knob settings that land inside
   it. mutate() is already that search — it renders a candidate, measures
   it, scores it and keeps the best — so this supplies the objective and
   mutate does the work. AGENTS.md: check whether the thing you want
   already exists and has simply never been reached for.

   The bands are the ones measured off samples/jbh-drums.json and written
   up beside kitRoleOf(), so a bend aims at the same definition the
   detector reads back. The two melodic roles are not measured in that
   sense and say so: `bass` and `lead` are stated as the registers the
   write path already assigns by sampled pitch. */
export const ROLE_TARGETS = {
  kick:  { air: [-100, -40], centroid: [25, 160],
    says: 'all body and no air — a tuned membrane with nothing above it' },
  snare: { air: [-25, 26], centroid: [350, 7500],
    says: 'shell tone AND wire buzz, the one voice that has both' },
  hat:   { air: [26, 90], centroid: [1800, 13000],
    says: 'all air and no body — overtones with no fundamental' },
  bass:  { air: [-100, -28], centroid: [25, 320],
    says: 'low and sustaining; the register, not a measured drum class' },
  lead:  { air: [-18, 24], centroid: [450, 4500],
    says: 'mid register with some air; the register, not a measured class' },
};

/* AIR-VS-BODY AND A CENTROID OUT OF A BAND TABLE.

   specReport() in the engine hands back `shape` — nine bands as dB
   relative to the total — and not these two numbers, while
   bandEnergies() above computes them from a raw buffer and cannot see a
   RENDERED candidate. One definition, two call sites, so it lives here
   rather than being re-derived in the search where nothing could test
   it. The centroid is the band-energy-weighted geometric mean of each
   band's edges, which is coarser than the per-bin figure bandEnergies()
   reports and is monotonic in the same direction — enough to steer a
   search, and not comparable digit-for-digit with the fine one. */
export function fromShape(shape) {
  if (!shape || !shape.length) return null;
  let air = 0, body = 0, num = 0, den = 0;
  for (const b of shape) {
    const e = Math.pow(10, (b.rel || 0) / 10);
    const lo = b.lo != null ? b.lo : 0, hi = b.hi != null ? b.hi : lo;
    const mid = lo > 0 && hi > lo ? Math.sqrt(lo * hi) : (lo || hi);
    if (lo >= 2000) air += e; else if (lo < 500) body += e;
    num += mid * e; den += e;
  }
  return {
    airVsBodyDb: +(10 * Math.log10(Math.max(air, 1e-12) / Math.max(body, 1e-12))).toFixed(1),
    centroidHz: den > 0 ? Math.round(num / den) : 0,
  };
}

/* HOW CLOSE IS THIS TO THE JOB, 0 to 1, and what is still wrong.

   Inside the range scores 1 on that axis. Outside, it falls off over a
   span wide enough that the search can always tell which way is better —
   a hard zero outside the band gives a flat landscape and the search has
   nothing to climb, which is how a knob hunt stalls on its first
   candidate. */
export function roleFit(p, role) {
  const T = ROLE_TARGETS[role];
  if (!T) return null;
  if (!p || p.centroidHz == null || p.airVsBodyDb == null) return null;
  const axis = (v, [lo, hi], span) => {
    if (v >= lo && v <= hi) return 1;
    const off = v < lo ? lo - v : v - hi;
    return Math.max(0, 1 - off / span);
  };
  /* octaves for the centroid, decibels for the ratio: the two are on
     different scales and treating Hz linearly would make every change
     down at 60Hz look like nothing */
  const oct = v => Math.log2(Math.max(20, v) / 20);
  const fAir = axis(p.airVsBodyDb, T.air, 45);
  const fCen = axis(oct(p.centroidHz), T.centroid.map(oct), 2.5);
  const fit = +(0.6 * fAir + 0.4 * fCen).toFixed(3);
  const miss = [];
  if (fAir < 1) miss.push(p.airVsBodyDb < T.air[0]
    ? 'needs ' + Math.round(T.air[0] - p.airVsBodyDb) + 'dB more air'
    : 'needs ' + Math.round(p.airVsBodyDb - T.air[1]) + 'dB more body');
  if (fCen < 1) miss.push(p.centroidHz < T.centroid[0]
    ? 'brighter: ' + p.centroidHz + 'Hz, wants ' + T.centroid[0] + '+'
    : 'darker: ' + p.centroidHz + 'Hz, wants under ' + T.centroid[1]);
  return { fit, air: +fAir.toFixed(3), centroid: +fCen.toFixed(3), miss,
    says: role + ' wants ' + T.says + '. '
      + (miss.length ? 'This one ' + miss.join(' and ') + '.'
        : 'This one already measures like one.') };
}
