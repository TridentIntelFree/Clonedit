/* THE LOOP AGENTS.md PRESCRIBES, AUTOMATED.
 *
 * "A song script should look like: write a pattern, review({quick:true}),
 * write the next one. Not: write everything, then look." That is the
 * instruction, and nothing did it — infill() reported that it wrote
 * twelve notes and said nothing about what those notes did to the
 * piece, while the checks that would say are free and read the
 * schedule.
 *
 * The risk in automating it is crying wolf, which review() has already
 * had to be fixed for twice. So the contract under test is: findings
 * only, silence when there is nothing to say, and a failed check must
 * never fail the write.
 */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const setup = async () => page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.set({ bpm: 100 });
      /* one tagged instrument, built the common way: a single pad with
         a root note, which is what TAG IT gives you */
      const before = S.buffers.length;
      document.getElementById('presetSel').value = 'pgrand';
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('btnPresetLoad').click();
      for (let k = 0; k < 200; k++) {
        await new Promise(r => setTimeout(r, 100));
        if (S.buffers.length > before) break;
      }
      S.pads[0].inst = 'keys'; S.pads[0].srcNote = 60;
      await window.JBH.key('C', 'major');
      await window.JBH.chords(0, ['C', 'Am', 'F', 'G']);
    });

    t.head('A WRITE REPORTS WHAT IT DID TO THE PIECE');
    await setup();
    const wrote = await page.evaluate(async () => {
      const off = await window.JBH.infill('keys', { from: 0, bars: 1, role: 'lead', n: 3 });
      const r = await window.JBH.infill('keys',
        { from: 0, bars: 1, role: 'lead', apply: off.candidates[0].seed });
      return r;
    });
    t.ok('the write still succeeds and says what it wrote',
      wrote.applied === true && wrote.wrote > 0, wrote.says.slice(0, 90));
    t.ok('AND IT CARRIES THE FREE CHECKS’ VERDICT, which it never used to',
      wrote.checked && typeof wrote.checked.clean === 'boolean'
      && Array.isArray(wrote.checked.ran) && wrote.checked.ran.length > 0,
      JSON.stringify(wrote.checked && { clean: wrote.checked.clean, ran: wrote.checked.ran }));
    t.ok('form is among what ran, so one-pattern-looping is caught at write time',
      (wrote.checked.ran || []).includes('form'),
      (wrote.checked.ran || []).join(', '));

    t.head('FINDINGS ONLY — IT MUST NOT CRY WOLF');
    /* The fault the first run of this test found, before the filter
       existed: it forwarded every finding review quick produced, so a
       one-bar sketch was told "there is no arrangement" — true, the
       normal state of a project somebody just started, and not about
       the notes that were just written. On material where nothing is
       wrong this has to be silent, or it is the check that cries wolf
       and then may as well not exist. */
    t.ok('AN EMPTY SONG CHAIN IS NOT A COMPLAINT ABOUT THE NOTES',
      wrote.checked.clean === true
      && !/arrangement|song chain/.test(wrote.checked.says),
      wrote.checked.says.slice(0, 150));
    t.ok('and it says where the arrangement question does belong',
      /review\(\)/.test(wrote.checked.says), wrote.checked.says.slice(0, 160));
    t.ok('a clean write does not lengthen the one-line summary at all',
      !/to look at after that write/.test(wrote.says), wrote.says.slice(-120));

    t.head('IT CAN BE TURNED OFF FOR A RUN OF WRITES');
    await setup();
    const off = await page.evaluate(async () => {
      const o = await window.JBH.infill('keys', { from: 0, bars: 1, role: 'lead', n: 2 });
      return window.JBH.infill('keys',
        { from: 0, bars: 1, role: 'lead', apply: o.candidates[0].seed, check: false });
    });
    t.ok('check:false writes without checking, for a script writing many parts',
      off.applied === true && off.checked === null,
      'checked is ' + JSON.stringify(off.checked));

    t.head('A FAILED CHECK MUST NOT FAIL THE WRITE');
    await setup();
    const broke = await page.evaluate(async () => {
      /* sabotage the checker and confirm the notes still land: the
         write already happened, and throwing here would report a
         success as an error */
      const real = window.JBH.review;
      window.JBH.review = async () => { throw new Error('deliberate'); };
      try {
        const o = await window.JBH.infill('keys', { from: 0, bars: 1, role: 'lead', n: 2 });
        const r = await window.JBH.infill('keys',
          { from: 0, bars: 1, role: 'lead', apply: o.candidates[0].seed });
        const pat = S.patterns[S.pattern];
        let notes = 0;
        for (const k in pat.locks) {
          const lk = pat.locks[k];
          if (lk && (lk.pitch != null || (lk.pitches && lk.pitches.length))) notes++;
        }
        return { applied: r.applied, wrote: r.wrote, checked: r.checked, notes };
      } finally { window.JBH.review = real; }
    });
    t.ok('the notes are on the grid even though the check threw',
      broke.applied === true && broke.wrote > 0 && broke.notes > 0,
      'wrote ' + broke.wrote + ', ' + broke.notes + ' steps carry pitches');
    t.ok('and it says the check could not run rather than claiming clean',
      broke.checked && broke.checked.clean === null
      && /could not run the free checks/.test(broke.checked.says),
      JSON.stringify(broke.checked));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
