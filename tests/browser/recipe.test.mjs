/* A RECIPE IS SLOTS, AND THE PADS START EMPTY.

   The claim worth testing is not that a recipe loads. It is that the
   PATTERN is real before any sound is chosen -- steps written onto an
   empty pad, playing silently until something arrives -- because that is
   what makes an empty named pad a brief rather than a placeholder. If
   the steps waited for a sound, the whole design would collapse back
   into "write onto the pads you already have". */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A RECIPE MAKES EMPTY NAMED PADS AND A REAL PATTERN');
    const r = await page.evaluate(async () => {
      await window.JBH.clear();
      const out = await window.JBH.recipe({ seed: 4242 });
      const pat = S.patterns[S.pattern];
      const perSlot = {}, perSlotVel = {};
      for (const s of out.slots) {
        const row = pat.steps[s.pad] || [];
        let hits = 0, probs = 0;
        const vels = [];
        for (let i = 0; i < row.length; i++) if (row[i] > 0) {
          hits++;
          vels.push(row[i]);                 /* the step's velocity as stored */
          const lk = pat.locks[s.pad + ':' + i];
          if (lk && lk.prob != null && lk.prob < 1) probs++;
        }
        perSlot[s.slot] = { pad: s.pad, hits, probs,
          name: S.pads[s.pad].name, inst: S.pads[s.pad].inst,
          bufId: S.pads[s.pad].bufId };
        perSlotVel[s.slot] = vels;
      }
      return { out, perSlot, perSlotVel, selected: S.pattern, bpm: S.bpm,
        plen: patLen(S.patterns[S.pattern]) };
    });
    t.ok('it names an empty pad for every slot it asked for',
      r.out.slots.length >= 2 &&
      r.out.slots.every(s => r.perSlot[s.slot].name === s.label &&
        r.perSlot[s.slot].inst === s.slot),
      r.out.slots.map(s => s.label + '->' + s.pad).join(' '));
    t.ok('AND EVERY ONE OF THOSE PADS IS STILL EMPTY',
      r.out.slots.every(s => r.perSlot[s.slot].bufId < 0),
      'bufIds ' + r.out.slots.map(s => r.perSlot[s.slot].bufId).join(','));
    t.ok('the kit pattern is written anyway — onto empty pads',
      r.out.wroteSteps > 0 && r.perSlot.kick && r.perSlot.kick.hits > 0,
      r.out.wroteSteps + ' steps · kick ' + (r.perSlot.kick || {}).hits);
    t.ok('and some of those steps carry a real probability lock',
      Object.values(r.perSlot).some(x => x.probs > 0),
      'probabilistic steps per slot: ' +
      Object.entries(r.perSlot).map(([k, v]) => k + ':' + v.probs).join(' '));
    t.ok('the pattern is long enough for the recipe and the tempo is set',
      r.plen >= r.out.bars * 16 && Math.abs(r.bpm) === r.out.bpm,
      'plen ' + r.plen + ' for ' + r.out.bars + ' bars · ' + r.bpm + 'bpm');
    t.ok('the drum figures are measured, and it names the style and the share',
      r.out.patternsMeasured === true && r.out.drew && Object.keys(r.out.drew).length > 0
      && /Groove corpus/.test(r.out.says),
      r.out.style + ' · ' + Object.entries(r.out.drew || {})
        .map(([k, d]) => k + ' ' + d.g + ' ' + Math.round(d.share * 100) + '%').join('  '));
    t.ok('AND NO PITCHED SLOT IS CLAIMED AS MEASURED',
      r.out.slots.every(s => (s.pitched || s.slot === 'low')
        ? r.out.measured[s.slot] === false : true)
      && /Composed:/.test(r.out.says),
      'measured: ' + JSON.stringify(r.out.measured));
    t.ok('a measured step carries the velocity it was played at, not a flat default',
      (() => {
        const vs = [];
        for (const [v, st] of Object.entries(r.perSlotVel)) {
          if (r.out.measured[v]) vs.push(...st);
        }
        /* a flat default would be one value repeated; the corpus gives a
           downbeat around 0.7 and a sixteenth figure around 0.5 */
        return vs.length > 2 && new Set(vs.map(x => Math.round(x * 100))).size > 1;
      })(),
      JSON.stringify(r.perSlotVel));

    t.head('IT NEVER TAKES A PAD THAT ALREADY HAS A SOUND');
    const keep = await page.evaluate(async () => {
      await window.JBH.clear();
      /* three loaded pads it must leave alone */
      for (const [p, id] of [[0, 'dkick'], [1, 'pgrand'], [2, 'xbell']]) {
        S.editPad = p; S.seqPad = p;
        const before = S.buffers.length;
        document.getElementById('presetSel').value = id;
        document.getElementById('presetSel').dispatchEvent(new Event('change'));
        document.getElementById('btnPresetLoad').click();
        for (let k = 0; k < 200; k++) { await new Promise(x => setTimeout(x, 100));
          if (S.buffers.length > before) break; }
      }
      const mine = [0, 1, 2].map(i => ({ pad: i, bufId: S.pads[i].bufId, name: S.pads[i].name }));
      const out = await window.JBH.recipe({ seed: 77 });
      return { mine, after: [0, 1, 2].map(i => ({ bufId: S.pads[i].bufId, name: S.pads[i].name })),
        slotPads: out.slots.map(s => s.pad) };
    });
    t.ok('the three loaded pads are untouched',
      keep.after.every((a, i) => a.bufId === keep.mine[i].bufId && a.name === keep.mine[i].name),
      JSON.stringify(keep.after));
    t.ok('and the slots went somewhere else',
      keep.slotPads.every(p => p > 2), 'slots on pads ' + keep.slotPads.join(','));

    t.head('FIT HANDS BACK THE BRIEF, THEN MEASURES WHAT YOU CHOSE');
    const fit = await page.evaluate(async () => {
      await window.JBH.clear();
      const out = await window.JBH.recipe({ seed: 4242, family: 'fast' });
      const hatSlot = out.slots.find(s => s.slot === 'hat')
        || out.slots.find(s => !s.pitched);
      const emptied = await window.JBH.fit(hatSlot.slot);

      /* a deliberately WRONG sound: 250ms to speak, built here so the
         only thing under test is the measurement, not a preset's
         character that might change */
      const sr = AC.sampleRate, secs = 1.6;
      const buf = AC.createBuffer(1, Math.round(sr * secs), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const tt = i / sr;
        const a = tt < 0.25 ? tt / 0.25 : Math.pow(10, -3 * (tt - 0.25) / 1.2);
        d[i] = a * Math.sin(2 * Math.PI * 300 * tt);
      }
      S.buffers.push(buf);
      const id = S.buffers.length - 1;          /* recorded AFTER the push */
      S.pads[hatSlot.pad].bufId = id;
      S.pads[hatSlot.pad].srcNote = 60;
      const slow = await window.JBH.fit(hatSlot.slot);
      return { slot: hatSlot.slot, gap: hatSlot.gap, bpm: out.bpm, emptied, slow };
    });
    t.ok('an empty slot returns its brief and a family to look in',
      fit.emptied.empty === true && /still empty/.test(fit.emptied.says) &&
      fit.emptied.says.length > 80,
      fit.emptied.says.slice(0, 110));
    t.ok('AND A SLOW SOUND IN A FAST SLOT IS REPORTED, WITH THE NUMBERS',
      fit.slow.empty === false && fit.slow.fits === false &&
      fit.slow.attackMs > 150,
      'attack ' + fit.slow.attackMs + 'ms, gap ' + fit.slow.gap +
      ' at ' + fit.bpm + 'bpm · ' + fit.slow.says.slice(0, 120));
    t.ok('and it names the way out rather than only the fault',
      /slower|wider gap|tempo down|trim/.test(fit.slow.says),
      fit.slow.says.slice(0, 140));

    t.head('FIT REFUSES RATHER THAN GUESSING WITH NO RECIPE');
    const refuse = await page.evaluate(async () => {
      await window.JBH.clear();
      try { await window.JBH.fit('hat'); return 'did not refuse'; }
      catch (e) { return e.message; }
    });
    t.ok('with no recipe loaded it says so and points at timbre()',
      /no recipe loaded/.test(refuse) && /timbre\(\)/.test(refuse), refuse.slice(0, 110));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
