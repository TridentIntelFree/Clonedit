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

    /* R195. A step could already hold a pitch, a probability, a ratchet and a
       nudge — everything about WHEN it plays and nothing about what it sounds
       like. Five sound fields were added: cutoff, level, pan, decay and start.

       The one-to-one rule makes two demands of them that are easy to get
       wrong in opposite directions. The lock has to be AUDIBLE, or the editor
       is showing a control that does nothing. And it has to be LOCAL — the
       channel parameters it moves are shared by every voice on the pad, so a
       value written at step 8 would otherwise still be there at step 9 and the
       grid would be showing one hit while the bar plays another. */
    t.head('A STEP THAT HOLDS A SOUND, NOT JUST A HIT');
    const lock = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(400);
      const PAD = 6;
      o.padWas = JSON.parse(JSON.stringify(S.pads[PAD]));
      o.mutesWere = S.pads.map(p => p.mute);
      /* Broadband, so a cutoff lock has something to take away, and shorter
         than a step so two hits can never overlap into each other's window. */
      const n = Math.round(AC.sampleRate * 0.07);
      const b = AC.createBuffer(2, n, AC.sampleRate);
      const rnd = mulberry32(777);
      for (let i = 0; i < n; i++) { const v = (rnd() * 2 - 1) * 0.7;
        b.getChannelData(0)[i] = v; b.getChannelData(1)[i] = v; }
      S.buffers.push(b);
      S.pads.forEach((p, i) => { p.mute = i !== PAD; });
      S.pads[PAD] = newPad(PAD);
      const p0 = S.pads[PAD];
      p0.bufId = S.buffers.indexOf(b); p0.mute = false; p0.gain = 0.9;
      p0.ftype = 'lowpass'; p0.fcut = 0.85; p0.fres = 1;
      S.editPad = PAD; S.seqPad = PAD;
      const pat = S.patterns[S.pattern];
      setPatLen(16);
      pat.steps.forEach(row => row.fill(0));
      pat.locks = {}; pat.sil.fill(0);
      S.chainOn = false; S.songOn = false; S.human = 0;
      S.swing = 0;               // swing moves ODD steps, which is where the A/B lands
      pat.steps[PAD][0] = 1; pat.steps[PAD][8] = 1;
      pat.locks[PAD + ':8'] = { fcut: 0.10, gain: 0.25 };
      bumpLocks();
      reapplyLivePads(); await wait(250);

      o.usedFields = padLockedFields(pat, PAD);
      o.otherPadUntouched = padLockedFields(pat, PAD === 0 ? 1 : 0);
      o.marked = stepHasLock(pat.locks[PAD + ':8']);

      /* Rendered rather than sampled live, so what is measured is the file
         someone would be handed — a lock the bounce dropped would be the
         sequencer lying about what it played. */
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '1';
      const buf = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      const d = buf.getChannelData(0), sr = buf.sampleRate;
      const stepSec = 60 / S.bpm / 4;
      const seg = (stepIdx) => {
        const a = Math.round((0.05 + stepIdx * stepSec + 0.01) * sr);
        const len = Math.round(0.05 * sr);
        let pk = 0, zc = 0;
        for (let i = a; i < a + len && i < d.length; i++) {
          pk = Math.max(pk, Math.abs(d[i]));
          if (i > a && (d[i] >= 0) !== (d[i - 1] >= 0)) zc++;
        }
        return { pk: +pk.toFixed(4), zcr: Math.round(zc / 0.05) };
      };
      o.plain = seg(0);
      o.locked = seg(8);
      o.quieter = +(20 * Math.log10(o.locked.pk / o.plain.pk)).toFixed(1);
      o.darker = +(o.locked.zcr / o.plain.zcr).toFixed(2);

      /* THE STEP AFTER A LOCKED ONE MUST BE UNCHANGED BY IT.

         Compared as an A/B rather than against a neighbouring step: render the
         same pattern twice, differing ONLY in whether step 8 carries a lock,
         and look at step 9's samples in both. Comparing step 9 to step 0
         instead kept measuring the window rather than the code — swing moves
         odd steps, the compressor has a different history by then, and the
         numbers drifted for reasons that had nothing to do with leaking. Two
         renders of the same step index share all of that. */
      pat.steps[PAD][9] = 1;
      const withLock = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      delete pat.locks[PAD + ':8']; bumpLocks();
      const noLock = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      const a = withLock.getChannelData(0), c = noLock.getChannelData(0);
      const from = Math.round((0.05 + 9 * stepSec) * sr);
      const to = Math.min(a.length, c.length, Math.round((0.05 + 10 * stepSec) * sr));
      let worst = 0, energy = 0;
      for (let i = from; i < to; i++) { worst = Math.max(worst, Math.abs(a[i] - c[i]));
        energy = Math.max(energy, Math.abs(c[i])); }
      o.restore = { worst: +worst.toFixed(5), stepEnergy: +energy.toFixed(4), samples: to - from };
      /* And the locked step itself must differ between the two renders, or the
         A/B above proves only that the measurement is blind. */
      const f8 = Math.round((0.05 + 8 * stepSec) * sr), t8 = from;
      let d8 = 0; for (let i = f8; i < t8 && i < a.length; i++) d8 = Math.max(d8, Math.abs(a[i] - c[i]));
      o.lockedStepDiffers = +d8.toFixed(4);

      S.patterns[S.pattern].locks = {};
      S.patterns[S.pattern].steps.forEach(row => row.fill(0));
      bumpLocks();
      S.pads[PAD] = o.padWas; o.mutesWere.forEach((m, i) => { S.pads[i].mute = m; });
      reapplyLivePads();
      return o;
    });
    t.note('    plain step   peak ' + lock.plain.pk + '  zero-crossings ' + lock.plain.zcr + '/s');
    t.note('    locked step  peak ' + lock.locked.pk + '  zero-crossings ' + lock.locked.zcr + '/s');
    t.ok('the pad is known to use locks, and which fields',
      !!lock.usedFields && lock.usedFields.fcut === 1 && lock.usedFields.gain === 1,
      JSON.stringify(lock.usedFields));
    t.ok('a pad with no locks of its own is left alone entirely',
      lock.otherPadUntouched === null);
    t.ok('and the grid marks the step, so the sound is not hidden from the editor',
      lock.marked === true);
    t.ok('A LOCKED STEP REALLY IS QUIETER IN THE BOUNCE', lock.quieter < -9,
      lock.quieter + ' dB against the plain step');
    t.ok('and really is darker', lock.darker < 0.5,
      (lock.darker * 100).toFixed(0) + '% of the plain step’s zero-crossing rate');
    t.note('    step 9, with the lock vs without  → worst sample difference ' +
      lock.restore.worst + ' over ' + lock.restore.samples + ' samples');
    t.ok('AND THE STEP AFTER IT IS UNCHANGED — the lock does not leak down the bar',
      lock.restore.worst < 0.01 && lock.restore.stepEnergy > 0.1,
      lock.restore.worst + ' against a step carrying ' + lock.restore.stepEnergy);
    t.ok('measured by an A/B that would have seen a leak',
      lock.lockedStepDiffers > 0.05,
      'the locked step itself differs by ' + lock.lockedStepDiffers + ' between the two renders');
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

    /* Last, because it reloads the whole session — a lock that did not survive
       a save would be worse than no lock, and a POISONED one must not reach an
       AudioParam. NaN is the case that matters: JSON.stringify writes it as
       null, which is exactly how R189 got a dead value into the mix and kept
       it there across a save. */
    t.head('A SOUND LOCK SURVIVES A SAVE, AND A BROKEN ONE DOES NOT');
    const trip = await page.evaluate(async () => {
      const o = {}; const PAD = 3, K = PAD + ':4';
      const pat = S.patterns[S.pattern];
      pat.steps[PAD][4] = 0.9;
      pat.locks[K] = { fcut: 0.10, gain: 0.25, pan: -0.5, rel: 0.08, start: 0.25 };
      bumpLocks();
      const doc = JSON.parse(JSON.stringify(snapshotSession()));
      o.saved = doc.patterns[S.pattern].locks[K];
      doc.patterns[S.pattern].locks[K] = { fcut: NaN, gain: 99, pan: -0.5, rel: 'x', start: -1 };
      const round = JSON.parse(JSON.stringify(doc));     // NaN → null, as a real file would
      /* Copied, not referenced: applySessionDoc heals this very object in
         place, so holding the reference would report the repair as the file. */
      o.onDisk = Object.assign({}, round.patterns[S.pattern].locks[K]);
      applySessionDoc(round, S.buffers);
      o.healed = S.patterns[S.pattern].locks[K];
      return o;
    });
    t.note('    saved   ' + JSON.stringify(trip.saved));
    t.note('    on disk ' + JSON.stringify(trip.onDisk));
    t.note('    loaded  ' + JSON.stringify(trip.healed));
    t.ok('all five fields come back exactly',
      trip.saved && trip.saved.fcut === 0.10 && trip.saved.gain === 0.25 &&
      trip.saved.pan === -0.5 && trip.saved.rel === 0.08 && trip.saved.start === 0.25);
    t.ok('a NaN cutoff is dropped rather than written into the filter',
      trip.healed != null && trip.healed.fcut === undefined);
    t.ok('and so is a level, a decay and a start that are out of range or not numbers',
      trip.healed.gain === undefined && trip.healed.rel === undefined &&
      trip.healed.start === undefined);
    t.ok('while the field that was fine is kept, so loading is not a reset',
      trip.healed.pan === -0.5);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
