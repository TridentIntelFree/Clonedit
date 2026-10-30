/* MUSIC THEORY, FROM A LIBRARY RATHER THAN FROM A REGEX TABLE.

   harmony() carried its own chord parser: eighteen regexes mapping a
   symbol's tail to a set of intervals. It worked, and it had already
   produced one real fault — the list opened with /^(maj7|M7|Δ7?)$/i,
   which matches "m7", so every minor seventh in a piece was judged
   against a MAJOR seventh and the checker reported "Bm7 states no
   third" on bars whose third was sitting right there. It said that
   about a correct nocturne three times before anyone looked at the
   regex.

   That is the generic failure of a hand-rolled vocabulary: it is
   confidently wrong on the cases nobody thought to write a test for.
   tonal knows a few hundred chord symbols, is maintained, and was
   checked against the old table on every symbol the table knew —
   thirty of thirty agreed, none differed, and it reads a great many
   the table could not.

   This file is the whole of what the app uses, deliberately small.
   Samplebrain's manual warns what happens otherwise: "we gradually
   added more and more tweakable parameters until it became slightly
   out of control." A thin surface over a thick library is the point.

   It lives in src/pure/ because it is pure — no DOM, no audio, no app
   state — so the build publishes it as globals ahead of the engine and
   Node can import the real thing to test it. */

import { Chord, Note, Key, Progression, Scale, Midi } from 'tonal';

const pc = (n) => { const c = Note.chroma(n); return c == null ? null : c; };

/* What harmony() needs from a chord symbol, in the shape it already
   used: root pitch class, the set of pitch classes, which one is the
   third, and whether this is a dominant — a major third with a minor
   seventh, the chord whose job is tension and the only one where
   altered tensions are not a fault. */
/* tonal's alias coverage is uneven, and checking only one spelling per
   quality hid it. CM7 and CM11 read; CM9 and CM13 do not. Cmaj9 reads;
   Cmaj6 does not. Cm9 reads; Cmin9 does not. The table this replaced
   accepted every one of those, so handing tonal the symbol unchanged
   would have quietly regressed five spellings — and a chord that fails
   to parse throws, which at least fails loudly, but there was no
   reason to lose them.

   So the written-out words are canonicalised first. The case rule is
   the one the old table had to learn the hard way and is the only part
   that must not be relaxed: a bare `m` is MINOR and a bare `M` is
   MAJOR, so `M9` becomes `maj9` while `m9` is left exactly alone. */
function canonical(tail) {
  let t = tail;
  t = t.replace(/^(maj|Maj|MAJ|MA|Ma)(?=\d|$)/, 'maj');   // Maj9 MAJ9 MA9 -> maj9
  t = t.replace(/^M(?=\d|$)/, 'maj');                      // M9 M13 -> maj9 maj13
  t = t.replace(/^(min|Min|MIN)(?=\d|$|maj|Maj)/, 'm');    // min7 min9 -> m7 m9
  t = t.replace(/^mmaj(?=\d)/, 'mM');                      // minmaj7 -> mM7
  t = t.replace(/^maj6$/, '6');                            // maj6 -> 6
  t = t.replace(/^dom(?=\d)/, '');                          // dom7 -> 7
  t = t.replace(/^o$/, 'dim');                             // o -> dim
  return t;
}

export function chordInfo(sym) {
  const s = String(sym == null ? '' : sym).trim();
  if (!s) return null;
  let c = Chord.get(s);
  if (c.empty || !c.notes.length) {
    const m = /^([A-Ga-g][#b]?)(.*)$/.exec(s);
    if (m) {
      const alt = m[1] + canonical(m[2]);
      if (alt !== s) c = Chord.get(alt);
    }
  }
  if (c.empty || !c.notes.length) return null;
  const root = pc(c.tonic || c.notes[0]);
  if (root == null) return null;
  const pcs = [...new Set(c.notes.map(pc).filter((x) => x != null))];
  const iv = pcs.map((x) => (((x - root) % 12) + 12) % 12);
  const minorThird = iv.includes(3);
  const majorThird = iv.includes(4);
  return {
    sym: s,
    root,
    pcs,
    intervals: iv,
    third: minorThird ? (root + 3) % 12 : majorThird ? (root + 4) % 12 : null,
    hasThird: minorThird || majorThird,
    dominant: majorThird && iv.includes(10),
    quality: c.quality || '',
    name: c.name || s,
  };
}

/* The diatonic chords of a key, so "what could go here" is answerable
   without the person or the agent having to know. Modes beyond
   major/minor fall back to the parent scale's triads rather than
   throwing, because a dorian piece is a real thing to want. */
export function keyChords(tonic, mode) {
  const t = String(tonic || '').trim();
  if (!t) return [];
  const m = String(mode || 'major').toLowerCase();
  if (m === 'major') return Key.majorKey(t).chords.slice();
  if (m === 'minor') return Key.minorKey(t).natural.chords.slice();
  const sc = Scale.get(t + ' ' + m);
  if (!sc.notes.length) return [];
  /* build triads by stacking thirds within the mode */
  return sc.notes.map((_, i) => {
    const pick = [0, 2, 4].map((k) => sc.notes[(i + k) % sc.notes.length]);
    const d = Chord.detect(pick);
    return d.length ? d[0] : pick[0];
  });
}

/* Roman numerals to chord symbols in a key, and back. Writing a
   progression as I–V–vi–IV and reading it as what it actually spells
   is the difference between a progression you can discuss and a list
   of letters. */
export function fromRoman(tonic, numerals) {
  if (!tonic || !Array.isArray(numerals) || !numerals.length) return [];
  return Progression.fromRomanNumerals(String(tonic), numerals.map(String));
}
export function toRoman(tonic, chords) {
  if (!tonic || !Array.isArray(chords) || !chords.length) return [];
  return Progression.toRomanNumerals(String(tonic), chords.map(String));
}

/* Which scales contain exactly these notes. Useful in the other
   direction: given what is already written, what key is it in. Note
   this is an answer about the NOTES, so it must not be used to decide
   the harmony — inferring the harmony from the notes is what makes a
   wrong note look correct. It is for suggesting, not for checking. */
export function scalesFitting(notes) {
  if (!Array.isArray(notes) || !notes.length) return [];
  return Scale.detect(notes.map(String)).slice(0, 8);
}

/* MIDI number to a name a person can read, used wherever a finding
   names a pitch. */
export function midiName(m) {
  const n = Midi.midiToNoteName(m | 0, { sharps: true });
  return n || String(m);
}

/* Is this pitch a semitone ABOVE a chord tone — the interval that
   actually beats, and the one harmony() is built around. Exposed here
   so the rule lives in one place rather than being re-derived at each
   call site. */
export function rubsAgainst(midiOrPc, chord) {
  const info = typeof chord === 'string' ? chordInfo(chord) : chord;
  if (!info) return false;
  const p = ((((midiOrPc | 0) % 12) + 12) % 12);
  return info.pcs.some((t) => (((p - t) % 12) + 12) % 12 === 1);
}
