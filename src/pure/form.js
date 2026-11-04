/* DOES THIS PIECE HAVE A SHAPE, or is it one loop for three minutes.

   The arrangement here is `S.song`: a list of {pat, reps}, a pattern
   repeated so many times, then the next. Everything in this app looks
   INSIDE a pattern — pulse() at the steps, melody() and motif() at one
   voice's notes, harmony() at the chords of a bar — and nothing has
   ever looked at that list. AGENTS.md says it plainly: form could only
   be measured outside the app, by one script, from exported MIDI.

   So a track could pass every check in the repo and be one pattern
   looping. That is the same failure as the bounce whose verdict was
   "drone machine noise": nine bands of spectral analysis called it
   fine because nothing measured whether the HARMONY moved. This is the
   same question one level up — whether the ARRANGEMENT moves.

   IT REPORTS STRUCTURE AND REFUSES TO INVENT A NORM, and that is a
   deliberate limit rather than laziness. samples/form-norms.json is
   what this repo measured when it went looking, and most of it carries
   a field-level warning:

     "Every field named UNSOUND_* is kept as evidence and must NOT be
      used as a norm."

   What survived is Bach phrase length by fermata — commonest 2 bars,
   67.8% of 2,538 phrases — and that is a fact about chorales, not
   about how long a section of a groovebox track should be. The same
   file records that only 6.7% of those phrases are four or eight bars,
   so even the familiar "eight-bar section" is unsupported by the one
   corpus here. Inventing a target from that would be exactly the
   Goodhart failure the longest section of AGENTS.md is about.

   So nothing below says a section is too long or too short. It says
   what the shape IS, and names the three things that are BROKENNESS
   rather than taste: one pattern looping, nothing ever coming back,
   and consecutive sections that are identical in content. */

/* HOW DIFFERENT ARE TWO PATTERNS, 0 (identical) to 1 (nothing shared).
   Jaccard over the set of played steps, which is exact and free: the
   app knows every step it is going to play. A pattern pair that shares
   nothing scores 1; the same pattern against itself scores 0. */
export function patternDistance(a, b) {
  const A = new Set(a || []), B = new Set(b || []);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const k of A) if (B.has(k)) inter++;
  const union = A.size + B.size - inter;
  return union ? +(1 - inter / union).toFixed(3) : 0;
}

/* A B A C — the sequence as letters, which is how anybody describes a
   form out loud and is far easier to read than a list of indices. */
export function sequenceLetters(song) {
  const seen = new Map();
  return (song || []).map(s => {
    if (!seen.has(s.pat)) {
      /* past Z it keeps counting rather than wrapping, because A
         appearing twice for different patterns would be a lie about
         the one thing this string is for */
      const n = seen.size;
      seen.set(s.pat, n < 26 ? String.fromCharCode(65 + n) : 'P' + (n + 1));
    }
    return seen.get(s.pat);
  });
}

/* THE MEASUREMENT.
 *
 *   song   [{pat, reps}]
 *   prints  per pattern index, the steps it plays as comparable keys
 *           (anything stable — 'pad:step' is what the engine passes)
 *   opt     {barsPerPattern, bpm} for turning sections into time
 */
export function formOf(song, prints, opt) {
  const o = opt || {};
  const list = Array.isArray(song) ? song.filter(s => s && s.pat != null) : [];
  const barsOf = (p) => (o.barsPerPattern && o.barsPerPattern[p]) || 1;
  const bpm = Math.abs(o.bpm || 120);

  if (!list.length) {
    return {
      sections: 0, bars: 0, seconds: 0, sequence: '', distinct: 0,
      faults: ['no-arrangement'],
      says: 'there is no arrangement — the song chain is empty, so the piece is '
        + 'whichever pattern is selected, looping forever. That is a fine way to '
        + 'sketch and it is not a form. Add sections to the SONG chain.',
    };
  }

  const letters = sequenceLetters(list);
  const pats = list.map(s => s.pat);
  const distinct = new Set(pats).size;
  const bars = list.reduce((a, s) => a + barsOf(s.pat) * Math.max(1, s.reps | 0), 0);
  const seconds = +(bars * 4 * 60 / bpm).toFixed(1);

  /* DOES ANYTHING COME BACK. motif() asks this of a melody and measures
     it against the Essen corpus; at this level it is simply true or
     false, because there is no sound corpus here to compare against
     and a made-up threshold would be worse than a plain fact. */
  const counts = new Map();
  for (const p of pats) counts.set(p, (counts.get(p) || 0) + 1);
  const returns = [...counts.values()].some(c => c > 1);

  /* the longest stretch of the same pattern back to back, which is
     where "it never changes" actually lives — a chain of A A A A A is
     not an arrangement however many entries it has */
  let longestRun = 1, run = 1;
  for (let i = 1; i < pats.length; i++) {
    run = pats[i] === pats[i - 1] ? run + 1 : 1;
    if (run > longestRun) longestRun = run;
  }

  /* CONTRAST AT EVERY JOIN. Two different pattern indices whose steps
     are identical are the same section wearing two numbers, and the
     letters would hide that — the sequence would read A B while the
     listener hears A A. */
  const joins = [];
  for (let i = 1; i < pats.length; i++) {
    if (pats[i] === pats[i - 1]) continue;
    joins.push({ at: i, from: letters[i - 1], to: letters[i],
      distance: patternDistance(prints && prints[pats[i - 1]], prints && prints[pats[i]]) });
  }
  const sameContent = joins.filter(j => j.distance < 0.05);

  const faults = [];
  if (distinct === 1) faults.push('one-pattern');
  if (!returns && list.length > 2) faults.push('no-return');
  if (sameContent.length) faults.push('sections-identical');

  const seq = letters.join(' ');
  const repsSpread = (() => {
    const r = list.map(s => Math.max(1, s.reps | 0));
    return { min: Math.min(...r), max: Math.max(...r) };
  })();

  let says;
  if (distinct === 1) {
    says = seq + ' — one pattern, ' + list.length + ' section'
      + (list.length === 1 ? '' : 's') + ', ' + bars + ' bars. Every check in this '
      + 'app looks inside a pattern, so a piece built this way passes all of them '
      + 'and is a loop. Whatever else is true of it, nothing about it changes.';
  } else {
    says = seq + ' — ' + distinct + ' patterns over ' + list.length
      + ' sections, ' + bars + ' bars, about ' + seconds + 's at ' + bpm + 'bpm.'
      + (returns ? ' Something comes back, so it has a shape rather than just a sequence.'
        : ' NOTHING COMES BACK: every section is new, which reads as wandering rather '
          + 'than as a form. A listener needs something to recognise.')
      + (longestRun >= 4 ? ' ' + longestRun + ' of the same pattern run back to back, '
        + 'which is a long time on one idea.' : '')
      + (sameContent.length ? ' And ' + sameContent.length + ' join'
        + (sameContent.length === 1 ? ' is' : 's are')
        + ' between patterns whose steps are identical ('
        + sameContent.map(j => j.from + '→' + j.to).join(', ')
        + '), so the letters claim a change the listener cannot hear.' : '');
  }
  /* No norm is quoted on purpose; see the header. */
  says += ' No section length is judged here — the only form norms this repo '
    + 'measured are Bach phrase lengths, which say nothing about a groovebox.';

  return {
    sections: list.length, bars, seconds,
    sequence: seq, letters, distinct,
    returns, longestRun, joins, repsSpread,
    faults, says,
  };
}
