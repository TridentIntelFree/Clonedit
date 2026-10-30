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

    /* ---- IT HAS TO BE A TUNE, NOT AN ARPEGGIO ------------------------
       Every slot used to draw from the chord's own tones, and two chord
       tones are a third apart by construction, so stepwise motion was
       arithmetically impossible. Measured over five candidates on
       Dm-Bb-F-C it came out at 0, 0, 0, 7.7 and 8.3 per cent against the
       46.9% of the 8,514 Essen melodies this is scored against. The lines
       were harmonically immaculate and none of them was a tune:
       D4 F4 A4, F4 A4 C5, C5 G4 E4.
       Passing notes now come from the KEY rather than the chord. This
       holds that: the melodic norms are a range to land inside, so it
       asserts a floor rather than a target, and asserts it on the median
       so one unlucky seed cannot fail the suite. */
    t.head('WHAT IT WRITES IS A MELODY, NOT THE CHORD SPELLED OUT');
    const tune = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('keys', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 72, max: 8 });
      window.JBH.key('D', 'minor');
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Dm', 'Bb', 'F', 'C']);
      const r = await window.JBH.infill('keys', { from: 0, bars: 4, n: 5, role: 'lead', src: 'pat' });
      return r.candidates.map(c => ({ step: c.score.got.step, miss: c.score.meanErrorPct,
        no3: c.score.barsWithNoThird, m9: c.score.minorNinths }));
    });
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const steps = tune.map(c => c.step);
    t.ok('MOST OF ITS INTERVALS ARE STEPS, the way a melody moves',
      med(steps) >= 20, 'median ' + med(steps) + '% stepwise across '
        + steps.length + ' candidates (' + steps.join(', ') + '), norm is 46.9%');
    t.ok('and it lands far closer to the melodic norms than spelling the chord did',
      med(tune.map(c => c.miss)) <= 18,
      'median ' + med(tune.map(c => c.miss)) + ' off-norm — it was 19.6 to 25.8 when every note was a chord tone');
    t.ok('without giving up the harmony to get there',
      tune.every(c => c.m9 === 0) && med(tune.map(c => c.no3)) === 0,
      'minor ninths ' + tune.map(c => c.m9).join(',') + ' · bars with no third ' + tune.map(c => c.no3).join(','));

    /* ---- A SPAN BIGGER THAN THE PATTERN, AND A RHYTHM THAT CROSSES IT
       MAXSTEPS is 64 and a bar is 16, so four bars is all one pattern
       holds. Asked for eight, this used to generate notes out at step
       122 and let step() clamp every one onto the last step: measured,
       five of eighteen landed on step 63. That is the HOLLOWAY stumble,
       and the suite tested for it at four bars without ever asking for
       more. It refuses now, and says what will fit.
       The feels are cross-rhythms, not triplets: 16 does not divide by
       3, so three even hits in a bar cannot be written on this grid at
       all. A three-step CYCLE can, and because it does not divide the
       bar it lands somewhere new each time round, which is the effect. */
    t.head('A SPAN THAT DOES NOT FIT IS REFUSED, NOT CLAMPED');
    const span = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('keys', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 72, max: 8 });
      window.JBH.key('D', 'minor');
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Dm', 'Bb', 'F', 'C']);
      const out = {};
      for (const bars of [4, 8]) {
        try {
          const r = await window.JBH.infill('keys', { from: 0, bars, n: 1, role: 'lead', src: 'pat', seed: 5 });
          const steps = r.candidates[0].notes.map(n => n[1]);
          out[bars] = { ok: true, max: Math.max(...steps), past: steps.filter(x => x > 63).length };
        } catch (e) { out[bars] = { ok: false, msg: e.message }; }
      }
      return out;
    });
    t.ok('four bars fit a 64-step pattern and stay inside it',
      span[4].ok && span[4].past === 0, 'highest step ' + span[4].max);
    t.ok('EIGHT BARS ARE REFUSED rather than clamped onto the last step',
      span[8].ok === false && /does not fit|holds 4 not 8|4 bars/.test(span[8].msg),
      span[8].ok ? 'IT WROTE THEM: ' + span[8].past + ' notes past the end' : span[8].msg.slice(0, 80));
    t.ok('and the refusal says what will fit and how to get more',
      span[8].ok === false && /LEN|longer|pattern/i.test(span[8].msg), span[8].msg.slice(0, 70));

    t.head('A FEEL THAT CROSSES THE BAR');
    const feel = await page.evaluate(async () => {
      const grab = async (f) => {
        const r = await window.JBH.infill('keys',
          { from: 0, bars: 4, n: 1, role: 'lead', src: 'pat', seed: 11, feel: f });
        const st = r.candidates[0].notes.map(n => n[1] % 16);
        return { positions: [...new Set(st)].sort((a, b) => a - b), n: st.length };
      };
      let refused = null;
      try { await window.JBH.infill('keys', { from: 0, bars: 4, n: 1, feel: 'triplet', src: 'pat' }); }
      catch (e) { refused = e.message; }
      return { straight: await grab('straight'), three: await grab('3'), refused };
    });
    t.ok('a three-step cycle uses positions the straight cells never touch',
      feel.three.positions.length > feel.straight.positions.length,
      'straight uses ' + feel.straight.positions.join(',')
        + ' · 3-over-4 uses ' + feel.three.positions.join(','));
    t.ok('and an unknown feel is refused, naming what a triplet actually needs',
      feel.refused && /poly\(\)|do not divide|16 steps/.test(feel.refused),
      (feel.refused || '(accepted it)').slice(0, 95));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
