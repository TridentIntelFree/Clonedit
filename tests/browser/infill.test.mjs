/* WRITE ONE VOICE INTO ONE SPAN, AND OFFER ALTERNATIVES.

   The research on co-creative music tools converges on a finding that
   is the opposite of "make me a track": a model that hands over a
   finished piece overwhelms the person with content and frustrates
   them with randomness, and what helps is constraining generation to a
   particular voice over a particular span and offering options. So the
   first thing tested here is that it writes NOTHING unless asked, and
   that what it offers can be reproduced exactly from the seed it
   reports.

   The second thing is the HOLLOWAY lesson. A previous session
   generated pitches, got back step numbers that were not a rhythm, and
   dealt them onto invented arrays of offsets; the overflow clamped to
   step 15 and the listener's first word was "timing". So every note
   here must land on a real position with a real length, and a span of
   four bars must produce notes in all four of them.

   The third is that it must refuse to write against a harmony nobody
   declared, for the same reason harmony() refuses to infer one. */

import { boot, checker } from './harness.mjs';

const setup = (page) => page.evaluate(async () => {
  await window.JBH.clear();
  await window.JBH.set({ bpm: 100 });
  await window.JBH.instrument('bass', { pack: 'samples/salamander.json',
    match: '^sal:', lo: 36, hi: 55 });
  await window.JBH.instrument('lead', { pack: 'samples/salamander.json',
    match: '^sal:', lo: 60, hi: 79 });
  window.JBH.pattern(0, { plen: 64, clear: true, select: true });
  window.JBH.key('D', 'major');
  window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
});

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    await setup(page);

    t.head('IT SUGGESTS AND DOES NOT APPLY');
    const sug = await page.evaluate(async () =>
      await window.JBH.infill('bass', { from: 0, bars: 4, n: 5, role: 'bass', seed: 11 }));
    const after = await page.evaluate(async () =>
      (await window.JBH.schedule({ src: 'pat', full: false })).notes);
    t.ok('it returns several ways to play it, not one answer',
      sug.candidates.length === 5 && sug.applied === false,
      sug.candidates.length + ' candidates, applied ' + sug.applied);
    t.ok('and the pattern is still empty afterwards',
      after === 0, after + ' notes written without being asked');
    t.ok('it says the choosing is not its to make',
      /Play them|nothing here can hear them/.test(sug.says), sug.says.slice(-90));
    t.ok('the candidates differ from each other',
      new Set(sug.candidates.map(c => JSON.stringify(c.notes))).size > 1,
      new Set(sug.candidates.map(c => JSON.stringify(c.notes))).size + ' distinct of 5');

    t.head('A SEED REPRODUCES A CANDIDATE EXACTLY');
    /* Stateless on purpose: nothing is held between the offer and the
       apply, so the same seed always writes the same part. */
    const again = await page.evaluate(async () =>
      await window.JBH.infill('bass', { from: 0, bars: 4, n: 5, role: 'bass', seed: 11 }));
    t.ok('the same seed gives the same candidates',
      JSON.stringify(again.candidates.map(c => c.notes))
        === JSON.stringify(sug.candidates.map(c => c.notes)), 'byte-identical');
    t.ok('a different seed gives different ones',
      await page.evaluate(async (prev) => {
        const r = await window.JBH.infill('bass', { from: 0, bars: 4, n: 5, role: 'bass', seed: 99 });
        return JSON.stringify(r.candidates.map(c => c.notes)) !== prev;
      }, JSON.stringify(sug.candidates.map(c => c.notes))), 'seed 99 differs from seed 11');

    t.head('EVERY NOTE HAS A REAL POSITION AND A REAL LENGTH');
    /* The HOLLOWAY failure in one assertion: pitches dealt onto step
       numbers that were not a rhythm, overflowing onto step 15. */
    const shape = await page.evaluate(async () => {
      const r = await window.JBH.infill('lead', { from: 0, bars: 4, n: 3, role: 'lead', seed: 7 });
      const all = [].concat(...r.candidates.map(c => c.notes));
      const barsHit = new Set(all.map(n => Math.floor(n[1] / 16)));
      return {
        steps: [...new Set(all.map(n => n[1] % 16))].sort((a, b) => a - b),
        anyZeroLength: all.some(n => !(n[3] > 0)),
        bars: [...barsHit].sort((a, b) => a - b),
        pileOn15: all.filter(n => n[1] % 16 === 15).length,
        total: all.length,
      };
    });
    t.ok('every note has a positive length',
      shape.anyZeroLength === false, 'none zero-length of ' + shape.total);
    t.ok('all four bars of the span are written into',
      shape.bars.join(',') === '0,1,2,3', 'bars ' + shape.bars.join(','));
    t.ok('notes are not piled onto the last step of the bar',
      shape.pileOn15 / shape.total < 0.15,
      shape.pileOn15 + ' of ' + shape.total + ' on step 15');
    t.ok('and they fall on more than one position in the bar',
      shape.steps.length >= 4, 'positions used: ' + shape.steps.join(' '));

    t.head('WHAT IT WRITES FITS THE DECLARED HARMONY');
    const q = await page.evaluate(async () =>
      (await window.JBH.infill('bass', { from: 0, bars: 4, n: 6, role: 'bass', seed: 3 }))
        .candidates.map(c => c.score));
    t.ok('no candidate contains a minor ninth against its own chord',
      q.every(s => s.minorNinths === 0),
      'worst candidate has ' + Math.max(...q.map(s => s.minorNinths)));
    t.ok('and the best one states a third in every bar',
      q[0].barsWithNoThird === 0, q[0].barsWithNoThird + ' bars without a third');
    t.ok('each candidate is scored against the measured melodic norms',
      q.every(s => s.norm && s.norm.step === 46.9 && typeof s.meanErrorPct === 'number'),
      'mean distance from Essen: ' + q.map(s => s.meanErrorPct).join(', '));

    t.head('APPLYING IS A SECOND CALL, BY SEED');
    const applied = await page.evaluate(async (seed) => {
      const before = (await window.JBH.schedule({ src: 'pat', full: false })).notes;
      const r = await window.JBH.infill('bass',
        { from: 0, bars: 4, role: 'bass', seed: 11, apply: seed });
      const after = (await window.JBH.schedule({ src: 'pat', full: false })).notes;
      return { before, r, after };
    }, sug.candidates[0].seed);
    t.ok('nothing was in the pattern before',
      applied.before === 0, applied.before + ' notes');
    t.ok('and the chosen candidate is written',
      applied.r.applied === true && applied.after >= applied.r.wrote,
      'wrote ' + applied.r.wrote + ', pattern now has ' + applied.after);
    t.ok('it reports the chords it wrote against',
      applied.r.chords.join(' ') === 'Bm7 Gmaj7 Dmaj7 A', applied.r.chords.join(' '));

    t.head('IT REFUSES WHAT IT SHOULD REFUSE');
    const no = await page.evaluate(async () => {
      const out = {};
      await window.JBH.clear();
      await window.JBH.instrument('bass', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 36, hi: 55 });
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      try { await window.JBH.infill('bass', { from: 0, bars: 4 }); out.noChords = 'no error'; }
      catch (e) { out.noChords = e.message; }
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      try { await window.JBH.infill('nosuch', { from: 0, bars: 4 }); out.noInst = 'no error'; }
      catch (e) { out.noInst = e.message; }
      try { await window.JBH.infill('bass', { from: 0, bars: 4, role: 'wrong' }); out.badRole = 'no error'; }
      catch (e) { out.badRole = e.message; }
      return out;
    });
    t.ok('with no progression declared it will not write against a guess',
      /no chord declared/.test(no.noChords) && /wrong note comes to look correct/.test(no.noChords),
      no.noChords.slice(0, 110));
    t.ok('an instrument that does not exist is named, not ignored',
      /no instrument "nosuch"/.test(no.noInst), no.noInst.slice(0, 70));
    t.ok('an unknown role throws rather than falling back silently',
      /role must be/.test(no.badRole), no.badRole.slice(0, 60));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
