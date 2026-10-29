/* The chord vocabulary, which used to be eighteen regexes written here.

   That table produced a real fault twice by the same mechanism: it
   opened with /^(maj7|M7|Δ7?)$/i, which matches "m7", so every minor
   seventh was judged against a MAJOR seventh and harmony() reported
   "Bm7 states no third" on bars whose third was present. /^(m9|min9|
   -9)$/i swallowed M9 identically. Both were patched by making those
   forms case-sensitive, which fixed the two symbols anyone had noticed
   and left the next one waiting.

   So the first thing this file does is pin the case distinction, and
   the second is check the replacement agrees with the table it
   replaced on every symbol the table knew. A library is only an
   improvement if it gets the old cases right as well as the new ones. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { chordInfo, keyChords, fromRoman, toRoman, scalesFitting, rubsAgainst, midiName }
  from '../src/pure/theory.js';

const pcs = (s) => chordInfo(s).pcs.slice().sort((a, b) => a - b).join(',');

test('case is the distinction: m7 is minor, M7 is major', () => {
  assert.equal(pcs('Bm7'), '2,6,9,11', 'Bm7 is B D F# A');
  assert.equal(pcs('BM7'), '3,6,10,11', 'BM7 is B D# F# A#');
  assert.equal(chordInfo('Bm7').third, 2, 'the third of Bm7 is D');
  assert.equal(chordInfo('BM7').third, 3, 'the third of BM7 is D#');
  assert.notEqual(chordInfo('Bm7').third, chordInfo('BM7').third,
    'if these ever agree, the bug that reported "Bm7 states no third" is back');
  assert.equal(pcs('Cm9'), '0,2,3,7,10');
  assert.equal(pcs('CM9'), '0,2,4,7,11', 'M9 must not be swallowed by the m9 case');
});

test('it agrees with the hand-written table on EVERY ALIAS that table knew', () => {
  /* Transcribed from the regex table this replaced — and from its
     alternations, not one spelling per quality. The first version of
     this test took the canonical spelling of each chord, reported
     "thirty of thirty agree", and missed that tonal reads CM7 but not
     CM9, Cmaj9 but not Cmaj6, and Cm9 but not Cmin9. Five spellings
     the old table accepted would have silently stopped parsing.
     An alias is part of the vocabulary; a check that skips the
     aliases is not checking the vocabulary. */
  const OLD = {
    maj7: [0, 4, 7, 11], Maj7: [0, 4, 7, 11], MAJ7: [0, 4, 7, 11], M7: [0, 4, 7, 11],
    m7b5: [0, 3, 6, 10], min7b5: [0, 3, 6, 10],
    dim7: [0, 3, 6, 9], o7: [0, 3, 6, 9], dim: [0, 3, 6],
    aug: [0, 4, 8], '+': [0, 4, 8],
    mM7: [0, 3, 7, 11], mmaj7: [0, 3, 7, 11], minmaj7: [0, 3, 7, 11],
    m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], '-7': [0, 3, 7, 10],
    m6: [0, 3, 7, 9], min6: [0, 3, 7, 9], '-6': [0, 3, 7, 9],
    m9: [0, 3, 7, 10, 2], min9: [0, 3, 7, 10, 2], '-9': [0, 3, 7, 10, 2],
    maj9: [0, 4, 7, 11, 2], Maj9: [0, 4, 7, 11, 2], MAJ9: [0, 4, 7, 11, 2],
    M9: [0, 4, 7, 11, 2],
    m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
    sus4: [0, 5, 7], sus: [0, 5, 7], sus2: [0, 2, 7],
    6: [0, 4, 7, 9], 7: [0, 4, 7, 10], dom7: [0, 4, 7, 10],
    9: [0, 4, 7, 10, 2], '': [0, 4, 7],
  };
  for (const [tail, iv] of Object.entries(OLD)) {
    for (const root of ['C', 'F#', 'Bb', 'E']) {
      const sym = root + tail;
      const info = chordInfo(sym);
      assert.ok(info, sym + ' must be readable');
      const want = [...new Set(iv.map((x) => (info.root + x) % 12))].sort((a, b) => a - b);
      assert.deepEqual(info.pcs.slice().sort((a, b) => a - b), want,
        sym + ' disagrees with the table it replaced');
    }
  }
});

test('it reads symbols the old table could not', () => {
  for (const s of ['C7b9', 'C13', 'C7#11', 'Cm11', 'C69', 'Cadd9', 'C7#9', 'C7b13']) {
    assert.ok(chordInfo(s), s + ' should be readable now');
  }
  /* The altered tensions matter specifically: AGENTS.md records that
     the minor-ninth rule over-fires on a dominant, because a b9 IS a
     semitone above the root, and that E7b9 resolving to Am came back
     as a fault the first time the check ran on real music. The
     exemption keys off `dominant`, so these must read as dominants. */
  for (const s of ['E7b9', 'E7#9', 'E7b13', 'E13']) {
    const i = chordInfo(s);
    assert.ok(i, s + ' must be readable');
    assert.equal(i.dominant, true, s + ' must read as a dominant or the b9 exemption misses it');
  }
  /* "alt" alone is shorthand tonal does not take, and that is fine:
     the explicit spelling does, and a symbol it cannot read throws
     rather than being quietly misread. Recorded so the next person
     does not rediscover it as a bug. */
  assert.equal(chordInfo('Calt'), null, 'bare "alt" is not read — spell it C7b9b13');
});

test('unreadable symbols return null rather than something plausible', () => {
  /* The quiet failure this repo keeps hitting is a check that accepts
     what it did not understand and then reports a clean bill of health
     on material it never read. */
  for (const s of ['', '   ', 'Hm7', 'splork', null, undefined, 'Fsplork']) {
    assert.equal(chordInfo(s), null, JSON.stringify(s) + ' must not parse');
  }
});

test('a dominant is a major third with a minor seventh, and nothing else is', () => {
  assert.equal(chordInfo('G7').dominant, true);
  assert.equal(chordInfo('Gmaj7').dominant, false);
  assert.equal(chordInfo('Gm7').dominant, false);
  assert.equal(chordInfo('G').dominant, false);
});

test('a chord with no third says so rather than inventing one', () => {
  /* harmony() guards on hasThird before reading third, so null here is
     correct and a fabricated third would be a silent wrong answer. */
  for (const s of ['Csus4', 'Csus2', 'C5']) {
    const i = chordInfo(s);
    if (!i) continue;
    assert.equal(i.hasThird, false, s + ' has no third');
    assert.equal(i.third, null, s + ' must report null, not a guess');
  }
});

test('the diatonic chords of a key', () => {
  assert.deepEqual(keyChords('D', 'major'),
    ['Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'A7', 'Bm7', 'C#m7b5']);
  assert.equal(keyChords('A', 'minor').length, 7);
  assert.ok(keyChords('D', 'dorian').length >= 7, 'a mode is a real thing to want');
  assert.deepEqual(keyChords('', 'major'), [], 'no tonic, no answer');
});

test('roman numerals both ways', () => {
  assert.deepEqual(fromRoman('D', ['I', 'V', 'vi', 'IV']), ['D', 'A', 'B', 'G']);
  assert.deepEqual(toRoman('D', ['D', 'A', 'Bm', 'G']), ['I', 'V', 'VIm', 'IV']);
  assert.deepEqual(fromRoman('', ['I']), []);
  assert.deepEqual(fromRoman('D', []), []);
});

test('rubsAgainst is the semitone ABOVE, which is the interval that beats', () => {
  /* The rule harmony() is built on, in one place rather than re-derived
     at each call site. A semitone BELOW a chord tone is not it. */
  assert.equal(rubsAgainst(8, 'Gmaj7'), true, 'G# is a semitone above G');
  assert.equal(rubsAgainst(9, 'Gmaj7'), false, 'A is a whole tone above G');
  assert.equal(rubsAgainst(2, 'Bmaj7'), false,
    'D sits a semitone BELOW Bmaj7\'s D# and must not be flagged');
  assert.equal(rubsAgainst(4, 'Bmaj7'), true, 'E is a semitone above D#');
  assert.equal(rubsAgainst(0, 'splork'), false, 'an unreadable chord rubs against nothing');
});

test('midiName for findings that name a pitch', () => {
  assert.equal(midiName(60), 'C4');
  assert.equal(midiName(61), 'C#4');
  assert.equal(midiName(42), 'F#2');
});

test('scalesFitting suggests, and the caller must not use it to decide harmony', () => {
  const got = scalesFitting(['C', 'E', 'G', 'B']);
  assert.ok(got.length > 0);
  assert.ok(got.some((s) => /major/.test(s)), 'C E G B is in C major: ' + got.join(' | '));
  assert.deepEqual(scalesFitting([]), []);
});
