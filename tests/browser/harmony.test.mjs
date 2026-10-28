/* DO THE NOTES FIT THE CHORDS — and does the check know the difference.

   harmony() was written because a listener said HOLLOWAY had "real
   structure but distasteful chordage" and every analyser in the app
   had called the track fine. They would: melody() and motif() measure
   a line against itself, counterpoint() measures two lines against
   each other, and none of them knows what the chord is.

   A check nobody has run against a known-bad input is not a checker,
   so the input here is the exact line that drew the complaint. Its
   walking bass approached each bar with a chromatic semitone from the
   next root — correct practice, and correct because the note is
   SHORT — played on a piano whose decay is most of a bar. It produced
   C# over Am, A# over Am, G# over C and G# over G. The fixed line
   chooses the approach so that it lands in the chord it rings into.
   Both are built here, from the same progression, and the check has
   to separate them.

   The other half of the claim is that it stays quiet where nothing is
   wrong, which is the failure mode this repo keeps hitting: a check
   that cries wolf gets ignored and may as well not exist. */

import { boot, checker } from './harness.mjs';

const CHORDS = ['Am', 'F', 'C', 'G'];

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    /* Both lines are written on a piano with the long decay that makes
       the question interesting — the ring is the whole point. */
    const build = async (which) => page.evaluate(async ([kind, chords]) => {
      await window.JBH.clear();
      await window.JBH.set({ bpm: 92 });
      await window.JBH.instrument('lh', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 38, hi: 64 });
      for (const x of window.JBH.instPads('lh'))
        window.JBH.pad(x.pad, { att: 0.003, dec: 1.9, sus: 0, rel: 0.6 });
      const PCS = { Am: [9, 0, 4], F: [5, 9, 0], C: [0, 4, 7], G: [7, 11, 2] };
      const roots = [45, 41, 48, 43];
      const fits = (m, ch) => ch.includes(((m % 12) + 12) % 12);
      const rubs = (m, ch) => ch.some(pc => ((((m % 12) + 12) % 12) - pc + 12) % 12 === 1);
      const r = window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      if (r.warning || r.selected !== true) throw new Error(r.warning || 'not selected');
      const notes = [];
      for (let b = 0; b < 4; b++) {
        const root = roots[b], next = roots[(b + 1) % 4], at = b * 16;
        const here = PCS[chords[b]], there = PCS[chords[(b + 1) % 4]];
        let lead, third;
        if (kind === 'bad') {              /* what actually got bounced */
          lead = next - root > 0 ? next - 1 : next + 1;
          notes.push([root, at, 0.8], [root + 7, at + 6, 0.46],
            [root + 12, at + 10, 0.6], [lead, at + 14, 0.42]);
        } else {                            /* chosen against both chords */
          lead = [next - 1, next + 1, next - 2, next + 2]
            .find(m => fits(m, there) && !rubs(m, here))
            ?? [next - 1, next + 1, next - 2, next + 2]
              .find(m => !rubs(m, here) && !rubs(m, there))
            ?? next - 5;
          third = root + (here.includes((root + 3) % 12) ? 3 : 4);
          notes.push([root, at, 0.8], [third, at + 6, 0.46],
            [root + 7, at + 10, 0.52], [lead, at + 14, 0.42]);
        }
      }
      await window.JBH.batch(notes.map(([m, st, v]) => ['note', 'lh', m, st, v]));
      return await window.JBH.harmony({ src: 'pat', chords });
    }, [which, CHORDS]);

    t.head('THE LINE THAT DREW THE COMPLAINT');
    const bad = await build('bad');
    t.ok('it is read at all — the progression was declared, so it ran',
      bad.ran === true && bad.bars === 4, bad.bars + ' bars of ' + bad.chords.join(' '));
    t.ok('it finds the minor ninths',
      bad.minorNinths.length >= 3,
      bad.minorNinths.map(c => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][c.pc]
        + ' over ' + c.chord).join(', ') || 'none');
    t.ok('and names one of the four that were actually heard as wrong',
      bad.minorNinths.some(c => (c.pc === 8 && /^[CG]$/.test(c.chord))
        || (c.pc === 1 && c.chord === 'Am') || (c.pc === 10 && c.chord === 'Am')),
      bad.findings.map(f => f.says).join(' ').slice(0, 150));
    t.ok('it says no chord states its third',
      bad.barsWithNoThird.length === 4,
      bad.barsWithNoThird.length + ' of 4 bars have no third in them');

    t.head('THE SAME LINE WITH THE APPROACH CHOSEN AGAINST BOTH CHORDS');
    const good = await build('good');
    t.ok('the minor ninths are gone',
      good.minorNinths.length === 0,
      good.minorNinths.length + ' left (was ' + bad.minorNinths.length + ')');
    t.ok('every chord now states its third',
      good.barsWithNoThird.length === 0,
      good.barsWithNoThird.length + ' bars without a third');
    t.ok('and it says so rather than staying ambiguous',
      good.findings.length === 0 && /every note sits in or beside its chord/.test(good.says),
      good.says.slice(0, 110));

    t.head('A HELD NOTE IS NOT THE FAULT — WHERE IT LANDS IS');
    /* The ring across a bar line is what joins the bars, so the check
       must count the good ones rather than punish length. */
    t.ok('notes ringing into a chord they belong to are counted, not flagged',
      good.carriedConsonant > 0,
      good.carriedConsonant + ' notes ring across a bar line into their chord');
    t.ok('the fixed line carries more of them than the broken one did',
      good.carriedConsonant >= bad.carriedConsonant,
      'fixed ' + good.carriedConsonant + ' vs broken ' + bad.carriedConsonant);

    t.head('IT REFUSES RATHER THAN GUESSES');
    const refused = await page.evaluate(async () => {
      const out = {};
      try { await window.JBH.harmony({ src: 'pat' }); out.noChords = 'no error'; }
      catch (e) { out.noChords = e.message; }
      try { await window.JBH.harmony({ src: 'pat', chords: ['Am', 'Fsplork'] }); out.bogus = 'no error'; }
      catch (e) { out.bogus = e.message; }
      return out;
    });
    t.ok('without a progression it says why it cannot infer one',
      /needs the progression/.test(refused.noChords)
        && /inferring it from the notes/.test(refused.noChords),
      refused.noChords.slice(0, 120));
    t.ok('a chord symbol it cannot read throws instead of being skipped',
      /do not know the chord quality/.test(refused.bogus), refused.bogus.slice(0, 100));

    /* ---- the bug that made this check lie about a correct piece ---- */
    t.head('CASE IS THE DISTINCTION IN A CHORD SYMBOL');
    /* The quality list opened with /^(maj7|M7|Δ7?)$/i, which matches
       "m7". Every minor seventh was judged against a MAJOR seventh:
       Bm7 read as B D# F# A#, the written D came back a non-chord
       tone, and the check reported "Bm7 states no third" on bars whose
       third was sitting right there. It said so about a correct
       nocturne three times before anyone looked at the regex.

       Tested through the real call rather than against the regexes: a
       single D over Bm7 is the third and must not be flagged, and the
       same D over Bmaj7 IS a semitone under its D#, so the two have to
       come out differently. */
    const cased = await page.evaluate(async () => {
      const run = async (chord) => {
        await window.JBH.clear();
        await window.JBH.set({ bpm: 120 });
        await window.JBH.instrument('v', { pack: 'samples/salamander.json',
          match: '^sal:', lo: 45, hi: 70 });
        for (const x of window.JBH.instPads('v'))
          window.JBH.pad(x.pad, { att: 0.002, dec: 0.5, sus: 0, rel: 0.1 });
        window.JBH.pattern(0, { plen: 16, clear: true, select: true });
        /* B, D, F# — a B minor triad with its third on top */
        await window.JBH.batch([['note', 'v', 59, 0, 0.7, { beats: 2 }],
          ['note', 'v', 62, 0, 0.7, { beats: 2 }], ['note', 'v', 66, 0, 0.7, { beats: 2 }]]);
        const h = await window.JBH.harmony({ src: 'pat', chords: [chord] });
        return { noThird: h.barsWithNoThird.length, m9: h.minorNinths.length };
      };
      return { minor: await run('Bm7'), major: await run('Bmaj7'), upperM: await run('BM7') };
    });
    /* The first draft of this asserted that the D would read as a minor
       ninth over Bmaj7. It does not, and should not: D sits a semitone
       BELOW that chord's D#, and the rule flags only the semitone
       above, which is the interval that beats. The discriminator that
       does separate the two readings is the third — present in Bm7,
       absent from Bmaj7 — which is the exact thing the case bug
       destroyed. */
    t.ok('a D over Bm7 is the third, not a stranger',
      cased.minor.noThird === 0,
      'Bm7: ' + cased.minor.noThird + ' bars without a third');
    t.ok('the same D over Bmaj7 is not its third, whose D# nothing played',
      cased.major.noThird === 1,
      'Bmaj7: ' + cased.major.noThird + ' bars without a third');
    t.ok('BM7 means major seventh, the opposite of Bm7',
      cased.upperM.noThird === cased.major.noThird
        && cased.upperM.noThird !== cased.minor.noThird,
      'BM7 reads like Bmaj7 (' + cased.upperM.noThird + ') and not like Bm7 ('
        + cased.minor.noThird + ')');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
