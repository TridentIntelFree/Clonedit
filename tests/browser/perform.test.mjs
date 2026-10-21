/* PERFORMANCE, AS DISTINCT FROM ARRANGEMENT.

   The app could say which note and how loud, and nothing else. Everything
   written through it therefore came out as a list of attack times at
   roughly one dynamic — correct, and obviously not played. Three things
   were added to fix that, and all three make claims that are easy to
   assert loosely and hard to assert honestly:

     a SWELL must change the TIMBRE, not merely the level. Turning a quiet
     recording up is not a crescendo, and a test that only checks the
     level got louder would pass on exactly the fake this feature exists
     to avoid. So the check is a BRIGHTNESS RATIO — upper partials against
     the fundamental band — which is level-invariant by construction and
     therefore cannot be satisfied by a gain ramp.

     DRIFT must be correlated. White noise and drift both "move the notes
     about"; only one of them sounds like a player. The difference is
     entirely in whether neighbouring notes agree, so that is measured
     directly as a lag-1 autocorrelation and compared against the white
     noise it replaces.

     phrase() must shape notes that already exist and never invent one,
     because the sequencer showing what it will play is the rule the whole
     app is built on. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {

    /* ---- 1. DRIFT IS CORRELATED, JITTER IS NOT -------------------------- */
    t.head('DRIFT DRIFTS — NEIGHBOURING NOTES AGREE, WHICH IS THE WHOLE POINT');
    const drift = await page.evaluate(() => {
      const lag1 = a => {
        const m = a.reduce((x, y) => x + y, 0) / a.length;
        let num = 0, den = 0;
        for (let i = 0; i < a.length; i++) {
          den += (a[i] - m) * (a[i] - m);
          if (i) num += (a[i] - m) * (a[i - 1] - m);
        }
        return den > 1e-12 ? num / den : 0;
      };
      /* a sixteenth at 84bpm, which is the spacing that actually matters */
      const dt = 0.1786, N = 64;
      const d = [], w = [];
      for (let i = 0; i < N; i++) { d.push(humanDriftAt(i * dt)); w.push(Math.random() * 2 - 1); }
      const save = { h: S.human, hd: S.humanDrift };
      S.human = 0; S.humanDrift = 1;
      const off = [], rep = [];
      for (let i = 0; i < N; i++) off.push(humanTimeOffset(i * dt, Math.random));
      for (let i = 0; i < N; i++) rep.push(humanTimeOffset(i * dt, Math.random));
      S.human = 0; S.humanDrift = 0;
      const zero = humanTimeOffset(1.234, Math.random);
      S.human = save.h; S.humanDrift = save.hd;
      let maxAbs = 0, same = 0;
      off.forEach((v, i) => { maxAbs = Math.max(maxAbs, Math.abs(v)); if (v === rep[i]) same++; });
      return { rDrift: +lag1(d).toFixed(3), rNoise: +lag1(w).toFixed(3),
               maxMs: +(maxAbs * 1000).toFixed(1), same, N, zero };
    });
    t.ok('successive drift values are strongly correlated', drift.rDrift >= 0.8,
      'lag-1 r = ' + drift.rDrift);
    t.ok('where the white noise it replaces is not', Math.abs(drift.rNoise) < 0.4,
      'lag-1 r = ' + drift.rNoise);
    t.ok('the displacement stays musical rather than sloppy', drift.maxMs <= 35,
      'worst ' + drift.maxMs + 'ms at full');
    /* Stateless on purpose: a running random walk would have given the
       offline bounce and the live pass different answers for the same bar. */
    t.ok('the same instant always gives the same offset', drift.same === drift.N,
      drift.same + '/' + drift.N + ' identical on a second pass');
    t.ok('and at zero it is exactly off', drift.zero === 0, 'returned ' + drift.zero);

    /* ---- 2. phrase() SHAPES, AND ONLY SHAPES ---------------------------- */
    t.head('phrase() SHAPES THE NOTES THAT ARE THERE AND ADDS NONE');
    const ph = await page.evaluate(() => {
      const pad = S.pads.findIndex(p => p && p.bufId >= 0);
      const pat = S.patterns[S.pattern];
      for (let i = 0; i < 64; i++) { pat.steps[pad][i] = 0; }
      for (let i = 0; i < 16; i++) pat.steps[pad][i] = 0.8;   // flat, deliberately
      const before = pat.steps[pad].slice(0, 16);
      const r = window.JBH.phrase(pad, 0, 15, { vel: 'cresc', time: 'rit' });
      const after = pat.steps[pad].slice(0, 16);
      const nudges = [];
      for (let i = 0; i < 16; i++) {
        const lk = pat.locks[pad + ':' + i];
        nudges.push(lk && lk.nudge != null ? lk.nudge : 0);
      }
      /* an empty step inside the span must stay empty */
      pat.steps[pad][20] = 0;
      window.JBH.phrase(pad, 16, 31, { vel: 'cresc' });
      const stillEmpty = pat.steps[pad][20] === 0;
      let bad = null;
      try { window.JBH.phrase(pad, 0, 15, { vel: 'wobble' }); }
      catch (e) { bad = e.message; }
      return { touched: r.touched, before, after, nudges, stillEmpty, bad,
               rose: after[15] > after[0], mono: nudges.every((n, i) => i === 0 || n >= nudges[i - 1] - 1e-9) };
    });
    t.ok('every written note in the span was touched', ph.touched === 16, ph.touched + ' of 16');
    t.ok('a cresc raises the end above the start', ph.rose,
      ph.before[0] + ' → ' + ph.after[0].toFixed(2) + ' … ' + ph.after[15].toFixed(2));
    t.ok('a rit displaces progressively later, never earlier', ph.mono,
      'nudge ' + ph.nudges[0] + ' → ' + ph.nudges[15]);
    t.ok('and an empty step is left empty rather than filled in', ph.stillEmpty);
    t.ok('an unknown shape name is refused with the list of real ones',
      !!ph.bad && /cresc/.test(ph.bad), ph.bad ? ph.bad.slice(0, 64) + '…' : 'no throw');

    /* ---- 3. A SWELL CHANGES THE TIMBRE ---------------------------------- */
    t.head('A SWELL CROSSES BETWEEN TAKES — SO IT BRIGHTENS, NOT JUST LOUDENS');
    const sw = await page.evaluate(async () => {
      /* A BOWED instrument, and that is not incidental. A struck string
         only decays, so a piano cannot crescendo and crossfading to a
         louder take mid-decay arrives at a sample that has already
         decayed — measured as louder and no brighter. Tested on the piano
         this check failed for a real reason, and the reason was the
         choice of instrument, not the feature. */
      await window.JBH.clear();
      const pf = await window.JBH.instrument('pf',
        { pack: 'samples/vsco-orch.json', match: '^vo:violin-', lo: 62, hi: 74, max: 3 });
      if (!pf || !pf.pads.length) return { skip: 'no violin pads' };
      if ((pf.dynamics | 0) < 2) return { skip: 'only ' + pf.dynamics + ' dynamics' };
      const pads = window.JBH.instPads('pf');
      const pad = pads[0].pad;
      /* release samples off: on an instrument that has them the key-off
         thunk is the loudest thing in the buffer and a peak reading
         measures that instead of the note. */
      await window.JBH.batch(pads.map(p => ['pad', p.pad,
        { layMode: 'vel', layXf: 0, sus: 1, dec: 4, rel: 0.4, att: 0.05,
          ftype: 'off', rev: 0, relBufs: [] }]));
      window.JBH.set({ bpm: 60, human: 0, humanDrift: 0, revLvl: 0, masterVol: 1 });
      window.JBH.pattern(0, { plen: 64, clear: true });

      /* One long note, rendered twice: flat, then swelling to near full. */
      const one = async (locks) => {
        window.JBH.pattern(0, { clear: true });
        const pat = S.patterns[0];
        pat.steps[pad][0] = 0.25;
        pat.locks[pad + ':0'] = Object.assign({ len: 3.0 }, locks);
        bumpLocks();
        const buf = await renderMix(new Set([pad]), new Set(), { loops: 1, src: 'pat', noTail: false });
        return buf;
      };
      /* Brightness as a RATIO of bands, so a pure level change cannot move
         it. Measured over the first and last thirds of the held note. */
      const bright = async (buf, from, to) => {
        const b = await bandEnergy(sliceBuf(buf, from, to - from));
        const g = n => Math.pow(10, b.find(x => x.band === n).db / 10);
        return 10 * Math.log10((g('2k-4k') + g('1k-2k')) / Math.max(1e-12, g('250-500')));
      };
      const flat = await one(null);
      const swel = await one({ swell: 0.95 });
      const r = {
        flatEarly: await bright(flat, 0.1, 0.9), flatLate: await bright(flat, 1.9, 2.7),
        swEarly: await bright(swel, 0.1, 0.9), swLate: await bright(swel, 1.9, 2.7),
      };
      /* THE CEILING THE RECORDINGS THEMSELVES SET. A crossfade cannot
         produce more timbral change than exists between the two takes, so
         the threshold is read off the material rather than invented. It
         matters: VSCO's violin p and f are only about 1.5dB apart in the
         upper bands, where Salamander's six piano dynamics span ten. An
         absolute threshold would have been a statement about the sample
         library wearing the costume of a statement about this feature. */
      const p0 = S.pads[pad];
      const lb = async (i) => {
        const lay = padLayer(p0, i), b = S.buffers[lay.bufId];
        if (!b) return null;
        const e = await bandEnergy(b);
        const g = n => Math.pow(10, e.find(x => x.band === n).db / 10);
        return 10 * Math.log10((g('2k-4k') + g('1k-2k')) / Math.max(1e-12, g('250-500')));
      };
      const l0 = await lb(0), l1 = await lb(padLayerCount(p0) - 1);
      r.ceiling = (l0 == null || l1 == null) ? 0 : Math.abs(l1 - l0);
      const pk = buf => { const d = buf.getChannelData(0); let m = 0;
        for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
      r.flatPeak = +pk(flat).toFixed(4); r.swPeak = +pk(swel).toFixed(4);
      for (const k in r) r[k] = +(+r[k]).toFixed(2);
      return r;
    });
    if (sw.skip) t.ok('a multi-dynamic piano is available to swell', false, sw.skip);
    else {
      const swGain = sw.swLate - sw.swEarly, flatGain = sw.flatLate - sw.flatEarly;
      /* The flat note is the control: whatever the recording does on its
         own over these two and a half seconds happens to both, so only
         the DIFFERENCE between them is the feature. */
      const got = swGain - flatGain;
      t.ok('the swelling note gains most of the brightness the two takes differ by',
        sw.ceiling > 0.3 && got >= sw.ceiling * 0.6,
        got.toFixed(2) + 'dB of the ' + sw.ceiling.toFixed(2) + 'dB these recordings differ by ('
        + Math.round(100 * got / Math.max(0.01, sw.ceiling)) + '%) — swell '
        + swGain.toFixed(1) + 'dB vs flat ' + flatGain.toFixed(1) + 'dB');
      t.ok('and it is genuinely louder by the end as well',
        sw.swPeak > sw.flatPeak * 2,
        'peak ' + sw.flatPeak + ' flat vs ' + sw.swPeak + ' swelling');
    }

    /* ---- 4. AND IT CAN SAY SO BEFOREHAND -------------------------------- */
    t.head('dynamics() SAYS WHETHER WRITING A CRESCENDO WILL DO ANYTHING');
    const dyn = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('vn',
        { pack: 'samples/vsco-orch.json', match: '^vo:violin-', lo: 62, hi: 74, max: 2 });
      const v = await window.JBH.dynamics('vn');
      await window.JBH.instrument('pf',
        { pack: 'samples/salamander.json', match: '^sal:', lo: 60, hi: 64, max: 2 });
      const p = await window.JBH.dynamics('pf');
      return { v, p };
    });
    t.ok('the six-dynamic piano is reported as wide',
      dyn.p.toneDb >= 5, dyn.p.layers + ' layers, ' + dyn.p.toneDb + 'dB of tone');
    t.ok('the two-dynamic violin is reported as narrow, and not flattered',
      dyn.v.toneDb < 2.5, dyn.v.layers + ' layers, ' + dyn.v.toneDb + 'dB of tone');
    t.ok('and each says which in words, not only in a number',
      /crescendo|swell/.test(dyn.p.says) && /crescendo|swell/.test(dyn.v.says),
      dyn.v.says.slice(0, 70) + '…');

    /* ---- 5. HOLES IN A PART THAT IS MEANT TO BE HELD -------------------- */
    t.head('continuity() FINDS THE GAPS AN AVERAGE HIDES');
    const cont = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('vn',
        { pack: 'samples/vsco-orch.json', match: '^vo:violins-', lo: 58, hi: 79, max: 9 });
      const pads = window.JBH.instPads('vn').map(p => p.pad);
      await window.JBH.batch(pads.map(p => ['pad', p,
        { sus: 1, rel: 0.5, dec: 6, att: 0.05, ftype: 'off', rev: 0, gain: 1.3, relBufs: [] }]));
      window.JBH.set({ bpm: 100, human: 0, humanDrift: 0, revLvl: 0, masterVol: 1, compAmt: 0 });
      const notes = [70, 75, 74, 72];
      const run = async (beats) => {
        window.JBH.pattern(0, { plen: 64, clear: true });
        await window.JBH.batch(notes.map((m, bar) =>
          ['note', 'vn', m, bar * 16, 0.5, { beats }]));
        return await window.JBH.continuity('vn', { src: 'pat' });
      };
      /* 3.6 beats stops inside a 4-beat bar; 4.6 overlaps the next one. */
      const gappy = await run(3.6), tied = await run(4.6);
      /* and a plucked part must NOT be scolded for the gaps that define it */
      window.JBH.pattern(0, { plen: 64, clear: true });
      await window.JBH.batch([0, 8, 16, 24, 32, 40, 48, 56].map((st, i) =>
        ['note', 'vn', notes[i % 4], st, 0.6, { beats: 0.25 }]));
      const plucked = await window.JBH.continuity('vn', { src: 'pat' });
      return { gappy, tied, plucked };
    });
    /* 3.6 beats of a 4-beat bar is 10% silence, all of it in the same
       place every bar. Quantity alone cannot call that a fault — a real
       quartet voice rests 25% of the time — so what is asserted is that
       the gaps are recognised as LANDING ON THE BARLINE. */
    t.ok('a bed whose notes stop inside the bar is called pulsing',
      cont.gappy.pulsing === true,
      cont.gappy.holesPct + '% silence, ' + cont.gappy.gapsAtBarEndPct
      + '% of it at the end of a bar');
    t.ok('tying them over the barline closes it',
      cont.tied.holesPct <= 6 && cont.tied.pulsing === false,
      cont.tied.holesPct + '% once the notes overlap');
    t.ok('and it says what to do rather than only that something is wrong',
      /overlap/.test(cont.gappy.says), cont.gappy.says.slice(0, 64) + '…');
    t.ok('a short-note part is not scolded for the gaps that define it',
      cont.plucked.sustained === false && /short notes/.test(cont.plucked.says),
      'median ' + cont.plucked.medianNoteSec + 's → ' + cont.plucked.says.slice(0, 40));

    /* ---- 6. ONE BOW STROKE, NOT EIGHT ----------------------------------- */
    t.head('bow MODE JOINS NOTES INSTEAD OF RE-ARTICULATING THEM');
    const bowed = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('vc',
        { pack: 'samples/vsco-orch.json', match: '^vo:cello-', lo: 40, hi: 64, max: 11 });
      const pads = window.JBH.instPads('vc').map(p => p.pad);
      const LINE = [[0, 52], [4, 55], [8, 57], [12, 59], [16, 60], [20, 59], [24, 57], [28, 55]];
      const run = async (mode, beats) => {
        await window.JBH.batch(pads.map(p => ['pad', p, { mode, sus: 1, rel: 0.22, dec: 5,
          att: 0.03, ftype: 'off', rev: 0, gain: 1.6, relBufs: [], vary: 0,
          bowSlur: 0.045, bowIn: 0.3, bowMaxSt: 7 }]));
        window.JBH.set({ bpm: 96, human: 0, humanDrift: 0, revLvl: 0, masterVol: 1, compAmt: 0 });
        window.JBH.pattern(0, { plen: 32, clear: true });
        await window.JBH.batch(LINE.map(([st, m]) => ['note', 'vc', m, st, 0.55, { beats }]));
        const buf = await renderMix(new Set(pads), new Set(), { loops: 1, src: 'pat', noTail: false });
        const d = buf.getChannelData(0), sr = buf.sampleRate, w = Math.floor(sr * 0.01), e = [];
        for (let i = 0; i + w < d.length; i += w) { let s = 0;
          for (let j = i; j < i + w; j++) s += d[j] * d[j]; e.push(Math.sqrt(s / w)); }
        let pk = 0; for (const v of e) if (v > pk) pk = v;
        let att = 0;
        for (let i = 2; i < e.length; i++) if (e[i] > pk * 0.12 && e[i] > e[i - 2] * 2.2) att++;
        return att;
      };
      return { plain: await run('one', 1.1), bow: await run('bow', 1.1),
               detached: await run('bow', 0.4) };
    });
    t.ok('eight slurred notes re-articulate far less in bow mode',
      bowed.bow < bowed.plain * 0.5,
      bowed.plain + ' attack transients as separate voices, ' + bowed.bow + ' bowed');
    /* A slur is written by overlapping the notes, so notes with gaps between
       them MUST take a fresh bow — otherwise the mode would be gluing
       together things the part says are separate. */
    t.ok('and detached notes still take a bow each',
      bowed.detached > bowed.bow * 2,
      bowed.detached + ' when the notes do not reach each other');

    /* ---- 7. IS IT A TUNE? ----------------------------------------------- */
    t.head('melody() MEASURES A LINE AGAINST REAL MELODY');
    const mel = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('pf',
        { pack: 'samples/salamander.json', match: '^sal:', lo: 55, hi: 84, max: 14 });
      const write = async (rows) => {
        window.JBH.pattern(0, { plen: 64, clear: true });
        await window.JBH.batch(rows.map(([st, m]) => ['note', 'pf', m, st, 0.6, { beats: 0.5 }]));
        return await window.JBH.melody('pf', { src: 'pat' });
      };
      /* pure stepwise motion: no repeat, no leap — a scale with a rhythm */
      const scale = await write([[0, 67], [2, 69], [4, 71], [6, 72], [8, 74], [10, 72],
        [12, 71], [14, 69], [16, 67], [18, 69], [20, 71], [22, 72], [24, 74], [26, 76]]);
      let bad = null;
      try { window.JBH.pattern(0, { plen: 128 }); } catch (e) { bad = e.message; }
      return { scale, bad };
    });
    t.ok('a line with no repeated notes is told so',
      mel.scale.findings.some(f => /repeated notes/.test(f)),
      'repeats ' + mel.scale.got.repeat + '% against ' + mel.scale.norm.repeat + '%');
    t.ok('and a line with no leaps is told so',
      mel.scale.findings.some(f => /leaps/.test(f)),
      'leaps ' + mel.scale.got.leap + '% against ' + mel.scale.norm.leap + '%');
    /* The pattern length that silently did nothing and lost half a line. */
    t.ok('an impossible pattern length is refused rather than ignored',
      !!mel.bad && /16, 32, 48, 64/.test(mel.bad),
      mel.bad ? mel.bad.slice(0, 64) + '…' : 'no throw');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
