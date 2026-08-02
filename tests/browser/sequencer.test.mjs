/* THE ONE-TO-ONE RULE.

   The standing design rule for this app, in the words it was set in: "The
   function of the sequencer must only play what it's showing it will play and
   only save what it's showing. The correlation between what the sequencer
   shows and what pad plays must be 1:1."

   Shortening a pattern is where that rule is decided, because the steps past
   the new end are still sitting in the array. I assumed the app hid them and
   brought them back on lengthening; it does not, and it is right not to.
   trimTrack REMOVES them, and the LCD says "N hits past the end were removed,
   not hidden". That is the stricter reading: a hit you cannot see and cannot
   hear does not exist, and the alternative is a pattern that resurrects old
   material the next time someone lengthens it.
   So what is guarded here is the contract the app actually offers — removed,
   announced, and never resurrected — plus the two directions that were never
   in doubt: a hidden step must not sound, and must not be saved. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    /* The app's answer to the rule is stricter than "hide them": shortening
       REMOVES the hits past the new end and says how many it removed. Which is
       the honest reading — a hit you cannot see and cannot hear does not exist,
       and the alternative is a pattern that quietly resurrects old material the
       next time it is lengthened. This guards that, and guards the announcement
       too: silently destroying a hit would be the actual bug. */
    t.head('SHORTENING A PATTERN REMOVES WHAT IT HIDES, AND SAYS SO');
    const keep = await page.evaluate(() => {
      S.human = 0; S.swing = 0; S.chainOn = false; S.songOn = false;
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      const pat = S.patterns[S.pattern];
      setPatLen(32);
      pat.steps.forEach(r => r.fill(0));
      [0, 5, 20, 29].forEach(i => { pat.steps[pad][i] = 0.9; });
      const before = pat.steps[pad].slice(0, 32).map(v => v > 0 ? 1 : 0).join('');
      setPatLen(16);
      const said = document.getElementById('lcdmsg').textContent;
      const afterShorten = pat.steps[pad].slice(0, 32).map(v => v > 0 ? 1 : 0).join('');
      setPatLen(32);
      const afterRelength = pat.steps[pad].slice(0, 32).map(v => v > 0 ? 1 : 0).join('');
      const saidLonger = document.getElementById('lcdmsg').textContent;
      return { pad, before, said, afterShorten, afterRelength, saidLonger };
    });
    t.note('    before        ' + keep.before);
    t.note('    shortened     ' + keep.afterShorten);
    t.note('    lengthened    ' + keep.afterRelength);
    t.ok('the steps the grid still shows are untouched',
      keep.afterShorten.slice(0, 16) === keep.before.slice(0, 16), keep.afterShorten.slice(0, 16));
    t.ok('the steps past the new end are removed',
      keep.afterShorten.slice(16) === '0'.repeat(16), keep.afterShorten.slice(16));
    t.ok('and it says how many it removed rather than doing it quietly',
      /2 hits past the end were removed/.test(keep.said), '"' + keep.said + '"');
    t.ok('lengthening again gives empty steps, not resurrected ones',
      keep.afterRelength.slice(16) === '0'.repeat(16), keep.afterRelength.slice(16));
    t.ok('and says the new steps are empty',
      /extra steps are empty/.test(keep.saidLonger), '"' + keep.saidLonger + '"');

    /* No onset detection: adjacent hits blur and scheduling has a few ms of
       give. Render the same pattern twice instead and compare sample by sample.
       A step that sounds must change the audio; a step that does not must not. */
    t.head('AND PLAYS EXACTLY WHAT IT SHOWS — by comparing renders');
    const proof = await page.evaluate(async () => {
      S.human = 0; S.swing = 0; S.chainOn = false; S.songOn = false;
      setPatLen(16);
      const pat = S.patterns[S.pattern];
      const pad = S.pads.findIndex(x => x.bufId >= 0);
      S.seqPad = pad;
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '1';
      S.trax.forEach(x => { x.bufId = -1; });
      const reset = () => { pat.steps.forEach(r => r.fill(0)); pat.locks = {}; pat.sil.fill(0);
        pat.len = pat.len.map(() => 16); [0, 3, 4, 7, 11, 14].forEach(i => { pat.steps[pad][i] = 0.9; }); };
      const render = async () => (await renderMix(new Set([pad]), new Set())).getChannelData(0).slice();
      const differs = (a, b) => { const n = Math.min(a.length, b.length); let d = 0;
        for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

      /* The control must be measured more than once. Chrome's summing order for
         more than about five concurrent sources is not repeatable, so an
         unchanged render differs from itself by about -73dB — but roughly one
         run in eight comes back bit-identical. Sampling it once and comparing
         "hidden <= control" therefore fails whenever the control draws a zero,
         which has nothing to do with the property under test. */
      reset(); const bassline = await render();
      let control = 0;
      for (let i = 0; i < 4; i++) { reset(); control = Math.max(control, differs(bassline, await render())); }
      reset(); pat.steps[pad][20] = 0.9;              // BEYOND the 16-step end
      const hidden = differs(bassline, await render());
      reset(); pat.steps[pad][5] = 0.9;               // one the grid shows
      const visible = differs(bassline, await render());
      reset();
      return { control, hidden, visible };
    });
    t.note('    same pattern, four times    → worst difference ' + proof.control.toExponential(2));
    t.note('    plus a hit PAST the end     → ' + proof.hidden.toExponential(2));
    t.note('    plus a hit the grid shows   → ' + proof.visible.toExponential(2));
    t.ok('the run-to-run noise floor is negligible', proof.control < 0.002,
      proof.control.toExponential(2));
    /* The real invariant is not "hidden is near the control" — both are draws
       from the same noise and either can land anywhere in it. It is that a step
       the grid does not show is nowhere near one it does. */
    t.ok('A HIT PAST THE END IS INAUDIBLE',
      proof.hidden <= Math.max(proof.control * 1.5, 0.002) && proof.hidden < proof.visible / 100,
      proof.hidden.toExponential(2) + ' vs noise ' + proof.control.toExponential(2) +
      ', vs an audible hit ' + proof.visible.toExponential(2));
    t.ok('while a hit the grid shows is orders of magnitude louder',
      proof.visible > proof.control * 100,
      Math.round(proof.visible / Math.max(proof.control, 1e-12)) + '× the noise floor');

    t.head('AND SAVES EXACTLY WHAT IT SHOWS');
    const saved = await page.evaluate(async () => {
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      const pat = S.patterns[S.pattern];
      setPatLen(32);
      pat.steps.forEach(r => r.fill(0));
      [0, 20].forEach(i => { pat.steps[pad][i] = 0.9; });
      setPatLen(16);
      const doc = JSON.parse(JSON.stringify(snapshotSession()));
      const back = doc.patterns[S.pattern];
      return { len: back.len[pad] != null ? back.len[pad] : back.len,
        step20: back.steps[pad][20] > 0, step0: back.steps[pad][0] > 0 };
    });
    t.ok('the saved pattern records its shown length', saved.len === 16, 'len ' + saved.len);
    t.ok('nothing past the shown end is saved', !saved.step20);
    t.ok('and everything shown is saved', saved.step0);

    t.head('A TAP AND THE TAP THAT UNDOES IT LAND ON THE SAME PATTERN');
    /* Reported as "I click and add one then I click it again to remove it but
       the sound still plays", and it was not a removal bug. The demo project
       ships with a SONG running, the grid follows it, and the pattern changed
       between the two taps — so the second tap ADDED the hit to a different
       pattern instead of removing it from the first. Both taps were obeyed
       exactly; the target moved.

       Reproduced here at 200 BPM so the arrangement moves quickly, then the
       fix is checked: the first edit pauses the arrangement and holds the
       pattern. */
    const trap = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('#tabs button[data-v="seq"]').click();
      S.songOn = true; S.chainOn = false; S.bpm = 200;
      if (S.song.length < 2) S.song = [{ pat: 0, reps: 1 }, { pat: 1, reps: 1 }];
      arrHeldOnce = false;                       // a fresh session, before any edit
      const pad = S.seqPad;
      S.patterns.forEach(pt => pt.steps[pad].fill(0));
      drawSeq();
      const out = { driving: arrDriving(), warn: document.getElementById('arrWarn').style.display };
      startSeq();
      await wait(300);
      out.patAtAdd = S.pattern + 1;
      document.querySelectorAll('#stepgrid .step')[6].click();          // ADD
      out.said = document.getElementById('lcdmsg').textContent;
      out.pausedSong = !S.songOn && !S.chainOn;
      // give the arrangement every chance to move the grid out from under us
      await wait(2500);
      out.patAtRemove = S.pattern + 1;
      document.querySelectorAll('#stepgrid .step')[6].click();          // REMOVE
      out.setIn = S.patterns.map((pt, i) => pt.steps[pad][6] > 0 ? i + 1 : null).filter(Boolean);
      stopSeq();
      return out;
    });
    t.ok('the demo really is driven by an arrangement', trap.driving && trap.warn === 'flex');
    t.note('    "' + trap.said + '"');
    t.ok('the first step edit pauses it', trap.pausedSong);
    t.ok('and says so, naming the way back', /PAUSED/.test(trap.said) && /Press SONG/.test(trap.said));
    t.ok('so the grid is on the same pattern for both taps',
      trap.patAtAdd === trap.patAtRemove, trap.patAtAdd + ' → ' + trap.patAtRemove);
    t.ok('and the hit that was added is really gone, from every pattern',
      trap.setIn.length === 0, 'still set in PTN ' + trap.setIn.join(','));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
