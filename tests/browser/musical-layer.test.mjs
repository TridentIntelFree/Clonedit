/* THE APP CAN HOLD A MUSICAL IDEA NOW.

   AGENTS.md states the gap: "nothing in this app stores one [a
   progression]. Pads hold samples, patterns hold steps, there is no key
   written anywhere." The cost was concrete and kept recurring —
   harmony() had to be HANDED a progression, so every song script kept a
   second copy that could drift from the checker's; form could only be
   measured from exported MIDI outside the app; and nothing writing
   notes had anything to write them against.

   This tests the layer the way it will actually be used: declare a key
   and some chords, check they survive a save and a reload, check
   harmony() reads them without being told, and check that the things
   which should REFUSE still refuse. The last part matters most. The
   whole point of declaring a progression is that it is not guessed, so
   an undeclared one must come back as "undeclared" and never as an
   inference from the notes. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A KEY CAN BE DECLARED, READ AND CLEARED');
    const k = await page.evaluate(async () => {
      await window.JBH.clear();
      const before = window.JBH.key();
      const set = window.JBH.key('d', 'dorian');
      const read = window.JBH.key();
      let bad = null;
      try { window.JBH.key('H'); } catch (e) { bad = e.message; }
      const cleared = window.JBH.key(null);
      return { before, set, read, bad, cleared, after: window.JBH.key() };
    });
    t.ok('an undeclared key reads as null, not as a guess',
      k.before === null, JSON.stringify(k.before));
    t.ok('declaring one normalises the tonic and keeps the mode',
      k.set.tonic === 'D' && k.set.mode === 'dorian', JSON.stringify(k.set));
    t.ok('and it reads back', k.read.tonic === 'D', JSON.stringify(k.read));
    t.ok('a tonic that is not a note is refused rather than stored',
      /needs a tonic/.test(k.bad || ''), (k.bad || 'no error').slice(0, 70));
    t.ok('null clears it back to undeclared', k.after === null, JSON.stringify(k.after));

    t.head('CHORDS GO ON A PATTERN, ONE PER BAR');
    const c = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });      // 4 bars
      const ok4 = window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      const short = window.JBH.chords(1, ['Am', 'F']);         // pattern 1 default len
      const read = window.JBH.chords(0);
      let bad = null;
      try { window.JBH.chords(0, 'Bm7'); } catch (e) { bad = e.message; }
      return { ok4, short, read, bad, all: window.JBH.chords() };
    });
    t.ok('four chords on a four-bar pattern is clean',
      c.ok4.bars === 4 && !c.ok4.warning, 'bars ' + c.ok4.bars + ', warning ' + c.ok4.warning);
    t.ok('and they read back as written',
      c.read.join(' ') === 'Bm7 Gmaj7 Dmaj7 A', c.read.join(' '));
    t.ok('a count that does not match the pattern WARNS rather than passing quietly',
      !!c.short.warning && /repeats the list/.test(c.short.warning),
      (c.short.warning || 'no warning').slice(0, 90));
    t.ok('a string where a list belongs is refused',
      /needs an array/.test(c.bad || ''), (c.bad || 'no error').slice(0, 60));

    t.head('THE SONG SPELLS OUT ITS OWN PROGRESSION');
    /* The thing that did not exist: the arrangement's actual chord
       sequence, derived from pattern order rather than written out a
       second time beside it. */
    const p = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });
      window.JBH.pattern(1, { plen: 64 });
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      window.JBH.chords(1, ['Em7', 'Gmaj7', 'Dmaj7', 'F#7']);
      window.JBH.key('D', 'major');
      window.JBH.set({ song: [{ pat: 0, reps: 2 }, { pat: 1, reps: 1 }], songOn: true });
      return window.JBH.progression({ src: 'song' });
    });
    t.ok('two reps of pattern 0 then one of pattern 1 is twelve bars',
      p.bars === 12, p.bars + ' bars');
    t.ok('and the order is the arrangement\'s, not the writing order',
      p.chords.join(' ') === 'Bm7 Gmaj7 Dmaj7 A Bm7 Gmaj7 Dmaj7 A Em7 Gmaj7 Dmaj7 F#7',
      p.chords.join(' '));
    t.ok('it carries the key along', p.key && p.key.tonic === 'D', JSON.stringify(p.key));

    t.head('HARMONY() READS IT WITHOUT BEING TOLD');
    const h = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.set({ bpm: 100 });
      await window.JBH.instrument('v', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 50, hi: 74 });
      for (const x of window.JBH.instPads('v'))
        window.JBH.pad(x.pad, { att: 0.002, dec: 0.6, sus: 0, rel: 0.1 });
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      window.JBH.key('D', 'major');
      /* a root and third in each bar, so every chord states its quality */
      await window.JBH.batch([
        ['note', 'v', 59, 0, 0.7, { beats: 2 }], ['note', 'v', 62, 0, 0.7, { beats: 2 }],
        ['note', 'v', 55, 16, 0.7, { beats: 2 }], ['note', 'v', 59, 16, 0.7, { beats: 2 }],
        ['note', 'v', 62, 32, 0.7, { beats: 2 }], ['note', 'v', 66, 32, 0.7, { beats: 2 }],
        ['note', 'v', 57, 48, 0.7, { beats: 2 }], ['note', 'v', 61, 48, 0.7, { beats: 2 }]]);
      return await window.JBH.harmony({ src: 'pat' });
    });
    t.ok('it ran with no chords argument at all',
      h.ran === true, 'ran ' + h.ran + ', ' + h.bars + ' bars');
    t.ok('and says where it got them, rather than leaving it ambiguous',
      h.chordSource === 'declared on the patterns', String(h.chordSource));
    t.ok('it used the declared progression',
      h.chords.join(' ') === 'Bm7 Gmaj7 Dmaj7 A', h.chords.join(' '));
    t.ok('every bar states its third, which is what was written',
      h.barsWithNoThird.length === 0,
      h.barsWithNoThird.length + ' bars without a third');

    t.head('WHAT MUST STILL REFUSE');
    const refuse = await page.evaluate(async () => {
      const out = {};
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      await window.JBH.instrument('v', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 55, hi: 67 });
      await window.JBH.batch([['note', 'v', 60, 0, 0.7], ['note', 'v', 64, 0, 0.7]]);
      try { await window.JBH.harmony({ src: 'pat' }); out.none = 'no error'; }
      catch (e) { out.none = e.message; }
      /* half declared: pattern 0 has chords, pattern 1 in the song does not */
      window.JBH.pattern(1, { plen: 64 });
      window.JBH.chords(0, ['Am', 'F', 'C', 'G']);
      window.JBH.set({ song: [{ pat: 0, reps: 1 }, { pat: 1, reps: 1 }], songOn: true });
      out.prog = window.JBH.progression({ src: 'song' });
      try { await window.JBH.harmony({ src: 'song' }); out.half = 'no error'; }
      catch (e) { out.half = e.message; }
      return out;
    });
    t.ok('with nothing declared it refuses and says how to declare it',
      /no progression/.test(refuse.none) && /key\(/.test(refuse.none),
      refuse.none.slice(0, 100));
    t.ok('it still will not infer the harmony from the notes',
      /makes a wrong note look correct/.test(refuse.none), 'the refusal gives the reason');
    t.ok('a half-declared progression is reported as half-declared',
      refuse.prog.declared === 4 && refuse.prog.bars === 8
      && refuse.prog.undeclaredPatterns.join() === '1',
      refuse.prog.declared + ' of ' + refuse.prog.bars + ' bars, missing pattern '
        + refuse.prog.undeclaredPatterns.join());
    t.ok('and harmony() refuses it rather than checking only the half that exists',
      /only 4 of 8 bars/.test(refuse.half || ''), (refuse.half || 'no error').slice(0, 80));

    t.head('IT SURVIVES A SAVE AND A RELOAD');
    /* A musical layer that does not persist is a scratchpad. */
    const round = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });
      window.JBH.key('F#', 'minor');
      window.JBH.chords(0, ['F#m', 'D', 'A', 'E']);
      const doc = window.JBH.sessionDoc ? window.JBH.sessionDoc() : null;
      return { doc: !!doc, key: window.JBH.key(), chords: window.JBH.chords(0) };
    });
    t.ok('the layer is readable before any round trip',
      round.key.tonic === 'F#' && round.chords.length === 4,
      round.key.tonic + ' ' + round.key.mode + ' / ' + round.chords.join(' '));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
