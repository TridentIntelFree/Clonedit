/* POLYRHYTHM, IN THE ENGINE.

   The arithmetic is unit tested in tests/poly.test.mjs. What cannot be checked
   there is the thing that actually matters: that the LIVE scheduler and the
   OFFLINE bounce put the hits in the same places. Those two disagreeing is the
   worst bug this app can have — it means the file is not what you heard — and
   they are separate code paths walking separate loops, so it has to be measured
   rather than assumed.

   Both paths are measured by spying on triggerPad, which is the single door
   every sounding hit goes through, live and offline. That gives exact times
   instead of inferred ones. The bounce is then cross-checked against onsets
   found in the rendered audio, because a spy proves what the code intended and
   only the waveform proves what came out. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    // ---- a clean two-track setup: one poly, one ordinary -------------------
    const setup = await page.evaluate(() => {
      S.human = 0; S.swing = 0; S.chainOn = false; S.songOn = false;
      setBpm(100);
      setPatLen(16);
      const pat = S.patterns[S.pattern];
      const pads = [];
      for (let i = 0; i < NPADS && pads.length < 2; i++) if (S.pads[i].bufId >= 0) pads.push(i);
      pat.steps.forEach(r => r.fill(0));
      pat.locks = {}; pat.sil.fill(0);
      S.trax.forEach(x => { x.bufId = -1; });
      const [A, B] = pads;
      // A: three against four, locked to the bar
      pat.poly = { [A]: { on: true, mode: 'lock', len: 3, bars: 1 } };
      for (let k = 0; k < 3; k++) pat.steps[A][k] = 0.9;
      // B: an ordinary four-on-the-floor
      [0, 4, 8, 12].forEach(i => { pat.steps[B][i] = 0.9; });
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '4';
      return { A, B, bpm: S.bpm, barDur: 60 / 100 * 4 };
    });
    t.note('    pad ' + setup.A + ' = 3 per bar (locked) · pad ' + setup.B +
      ' = 4 per bar (grid) · 100 BPM, bar = ' + setup.barDur + 's');

    // ---- the live scheduler ------------------------------------------------
    t.head('LIVE');
    const live = await page.evaluate(async ({ A, B }) => {
      const hits = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch) => {
        if (p === A || p === B) hits.push({ p, when });
        return real(c, g, p, v, when, reg, pitch);
      };
      startSeq();
      const t0 = seqT0;
      await new Promise(r => setTimeout(r, 11000));   // ~4.5 bars at 100 BPM
      stopSeq();
      window.triggerPad = real;
      return { t0, hits: hits.map(h => ({ p: h.p, w: +(h.when - t0).toFixed(6) })) };
    }, setup);

    const barDur = setup.barDur;
    const polyLive = live.hits.filter(h => h.p === setup.A).map(h => h.w).sort((a, b) => a - b);
    const gridLive = live.hits.filter(h => h.p === setup.B).map(h => h.w).sort((a, b) => a - b);
    t.note('    poly hits ' + polyLive.length + ' · grid hits ' + gridLive.length +
      ' over ' + (Math.max(...gridLive) / barDur).toFixed(2) + ' bars');

    /* Every locked hit must sit exactly on a third of a bar. This is the whole
       feature: 16 is not divisible by 3, so a hit that lands on a grid step
       means the track is not actually polyrhythmic. */
    const thirdErr = polyLive.map(w => {
      const n = w / (barDur / 3);
      return Math.abs(n - Math.round(n)) * (barDur / 3);
    });
    const worstThird = Math.max(...thirdErr);
    t.ok('every poly hit lands on an exact third of a bar',
      worstThird < 1e-4, 'worst error ' + (worstThird * 1000).toFixed(4) + 'ms');
    const liveGaps = [];
    for (let i = 1; i < polyLive.length; i++) liveGaps.push(polyLive[i] - polyLive[i - 1]);
    const gapErr = Math.max(...liveGaps.map(g => Math.abs(g - barDur / 3)));
    t.ok('consecutively spaced one third of a bar apart', gapErr < 1e-4,
      polyLive.length + ' hits, worst gap error ' + (gapErr * 1000).toFixed(4) + 'ms');
    t.ok('the ordinary track is untouched — still on quarters',
      gridLive.every(w => { const n = w / (barDur / 4); return Math.abs(n - Math.round(n)) < 1e-6; }));

    /* And the property that makes it audible as a polyrhythm rather than a
       mistake: the two tracks may only ever agree on a bar line. */
    const coin = polyLive.filter(x => gridLive.some(y => Math.abs(x - y) < 1e-4));
    const offBar = coin.filter(w => { const n = w / barDur; return Math.abs(n - Math.round(n)) > 1e-4; });
    t.ok('the two tracks coincide ONLY on the downbeat',
      offBar.length === 0 && coin.length >= 3,
      coin.length + ' coincidences, ' + offBar.length + ' of them off the bar line');

    // ---- the bounce --------------------------------------------------------
    t.head('BOUNCE — the same hits, or the file is not what you heard');
    const bounced = await page.evaluate(async ({ A, B }) => {
      const hits = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch) => {
        if (p === A || p === B) hits.push({ p, when });
        return real(c, g, p, v, when, reg, pitch);
      };
      const buf = await renderMix(new Set([A, B]), new Set());
      window.triggerPad = real;
      // the bounce lays events out from 0.05s; live measured from seqT0
      const base = 0.05;
      return { hits: hits.map(h => ({ p: h.p, w: +(h.when - base).toFixed(6) })),
        secs: buf.length / buf.sampleRate };
    }, setup);

    const polyB = bounced.hits.filter(h => h.p === setup.A).map(h => h.w).sort((a, b) => a - b);
    const gridB = bounced.hits.filter(h => h.p === setup.B).map(h => h.w).sort((a, b) => a - b);
    t.note('    bounce: ' + polyB.length + ' poly · ' + gridB.length + ' grid over ' +
      bounced.secs.toFixed(2) + 's');

    t.ok('the bounce puts poly hits on exact thirds too',
      polyB.every(w => { const n = w / (barDur / 3); return Math.abs(n - Math.round(n)) < 1e-4; }));

    /* The comparison this suite exists for. Live ran for a few bars, the bounce
       for four loops; compare the overlap hit for hit. */
    const n = Math.min(polyLive.length, polyB.length);
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(polyLive[i] - polyB[i]));
    t.ok('LIVE AND BOUNCE AGREE ON EVERY POLY HIT', n >= 9 && worst < 1e-4,
      n + ' hits compared, worst difference ' + (worst * 1000).toFixed(4) + 'ms');
    let worstG = 0;
    const nG = Math.min(gridLive.length, gridB.length);
    for (let i = 0; i < nG; i++) worstG = Math.max(worstG, Math.abs(gridLive[i] - gridB[i]));
    t.ok('and on every ordinary hit', nG >= 12 && worstG < 1e-4,
      nG + ' compared, worst ' + (worstG * 1000).toFixed(4) + 'ms');

    // ---- and it is actually in the audio -----------------------------------
    /* A spy proves what the code meant to do; only the waveform proves what came
       out. The check is not "are the gaps right" but the stronger one: does the
       audio contain a transient at every time the scheduler claimed, and none
       in between.

       The kick decays as a falling sine, so a naive threshold crossing finds its
       tail three or four times about 0.2s after each hit — 44 "onsets" for 12
       real ones. A refractory period fixes that, and 0.4s is chosen to be far
       longer than that artefact while still less than half the 0.8s spacing
       being measured, so it cannot merge two genuine hits or manufacture the
       answer: quarter-bar spacing (0.6s) would still be resolved. */
    t.head('AND IT IS IN THE WAVEFORM, NOT JUST THE INTENTIONS');
    const audio = await page.evaluate(async ({ A }) => {
      const keepR = S.pads[A].rev, keepD = S.pads[A].dly;
      S.pads[A].rev = 0; S.pads[A].dly = 0;                  // dry: echoes are not hits
      const want = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch) => {
        if (p === A) want.push(when - 0.05);
        return real(c, g, p, v, when, reg, pitch);
      };
      const buf = await renderMix(new Set([A]), new Set());
      window.triggerPad = real;
      S.pads[A].rev = keepR; S.pads[A].dly = keepD;

      const d = buf.getChannelData(0), sr = buf.sampleRate;
      const win = Math.round(sr * 0.005), env = [];
      for (let i = 0; i + win < d.length; i += win) {
        let s = 0; for (let k = 0; k < win; k++) s += d[i + k] * d[i + k];
        env.push(Math.sqrt(s / win));
      }
      const peak = Math.max(...env), thr = peak * 0.25, REFRACT = 0.4;
      const found = [];
      for (let i = 1; i < env.length; i++) {
        const at = i * win / sr - 0.05;
        if (env[i] <= thr || env[i - 1] > thr) continue;
        if (found.length && at - found[found.length - 1] < REFRACT) continue;
        found.push(at);
      }
      return { want: want.sort((x, y) => x - y), found, peak };
    }, setup);

    t.note('    scheduled ' + audio.want.length + ' · detected ' + audio.found.length +
      ' (peak ' + audio.peak.toFixed(3) + ')');
    t.ok('the audio contains one transient per scheduled hit',
      audio.found.length === audio.want.length,
      audio.found.length + ' vs ' + audio.want.length);
    /* Attack time plus a 5ms analysis window puts a detected onset slightly
       after the scheduled one; 25ms of slack covers that and would still catch a
       hit landing on the wrong third. */
    const late = audio.want.map((w, i) => (audio.found[i] ?? NaN) - w);
    const worstLate = Math.max(...late.map(Math.abs));
    t.ok('each one lands where the scheduler said it would',
      isFinite(worstLate) && worstLate < 0.025,
      'worst offset ' + (worstLate * 1000).toFixed(1) + 'ms');
    const aGaps = [];
    for (let i = 1; i < audio.found.length; i++) aGaps.push(audio.found[i] - audio.found[i - 1]);
    const aWorst = Math.max(...aGaps.map(g => Math.abs(g - barDur / 3)));
    t.ok('and the spacing in the audio is one third of a bar',
      aWorst < 0.01, 'worst gap error ' + (aWorst * 1000).toFixed(1) + 'ms');

    // ---- free mode ---------------------------------------------------------
    t.head('FREE MODE — its own tempo, never re-anchoring');
    const free = await page.evaluate(async ({ A }) => {
      const pat = S.patterns[S.pattern];
      pat.poly = { [A]: { on: true, mode: 'free', bpm: 137, len: 4 } };
      pat.steps[A].fill(0);
      for (let k = 0; k < 4; k++) pat.steps[A][k] = 0.9;   // every cell, or a silent one reads as a missed hit
      const hits = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch) => {
        if (p === A) hits.push(when); return real(c, g, p, v, when, reg, pitch);
      };
      const buf = await renderMix(new Set([A]), new Set());
      window.triggerPad = real;
      return { hits: hits.map(w => +(w - 0.05).toFixed(6)).sort((a, b) => a - b),
        expect: 60 / 137 / 4 };
    }, setup);
    t.note('    ' + free.hits.length + ' hits, expected spacing ' + (free.expect * 1000).toFixed(2) + 'ms');
    const fgaps = [];
    for (let i = 1; i < free.hits.length; i++) fgaps.push(free.hits[i] - free.hits[i - 1]);
    const fworst = Math.max(...fgaps.map(g => Math.abs(g - free.expect)));
    t.ok('it ticks at its own BPM', fworst < 1e-4,
      'worst deviation ' + (fworst * 1000).toFixed(4) + 'ms from ' + (free.expect * 1000).toFixed(2) + 'ms');
    /* The defining property: its phase against the bar keeps moving. A free
       track that returns to the same place every bar is just a locked one. */
    const phase = w => ((w % barDur) + barDur) % barDur;
    t.ok('and drifts against the bar rather than re-locking',
      Math.abs(phase(free.hits[0]) - phase(free.hits[free.hits.length - 1])) > 1e-3,
      'phase moved ' + Math.abs(phase(free.hits[0]) - phase(free.hits[free.hits.length - 1])).toFixed(4) + 's');

    // ---- an ordinary project is unaffected ---------------------------------
    t.head('A PROJECT WITH NO POLY TRACKS IS UNCHANGED');
    const plain = await page.evaluate(async () => {
      const pat = S.patterns[S.pattern];
      delete pat.poly;
      const pad = S.pads.findIndex(x => x.bufId >= 0);
      pat.steps.forEach(r => r.fill(0));
      [0, 4, 8, 12].forEach(i => { pat.steps[pad][i] = 0.9; });
      const hits = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch) => { hits.push(+(when - 0.05).toFixed(6));
        return real(c, g, p, v, when, reg, pitch); };
      await renderMix(new Set([pad]), new Set());
      window.triggerPad = real;
      return hits.sort((a, b) => a - b);
    });
    t.ok('hits still land on the ordinary grid',
      plain.every(w => { const n = w / (barDur / 4); return Math.abs(n - Math.round(n)) < 1e-6; }),
      plain.length + ' hits, all on quarters');

    t.head('THE SETTINGS RIDE WITH THE PROJECT');
    /* Patterns are serialised whole, so `poly` should travel for free — but
       "should" is how fields go missing. The take seed rode in one serialiser
       out of four when it was added, and only a round-trip test caught it. */
    const trip = await page.evaluate(async ({ A }) => {
      const pat = S.patterns[S.pattern];
      pat.poly = { [A]: { on: true, mode: 'lock', len: 5, bars: 2 } };
      const doc = JSON.parse(JSON.stringify(snapshotSession()));
      const inDoc = doc.patterns[S.pattern].poly;
      // and back in through the real loader
      pat.poly = {};
      applySessionDoc(doc, docToBuffers(doc));
      const back = polyCfg(S.patterns[S.pattern], A);
      // undo/redo goes through its own snapshot
      const uSnap = JSON.parse(JSON.stringify(undoSnap()));
      return { inDoc: inDoc && inDoc[A], back, inUndo: uSnap.patterns[S.pattern].poly?.[A] };
    }, setup);
    t.ok('a saved project carries the poly settings',
      !!trip.inDoc && trip.inDoc.len === 5 && trip.inDoc.bars === 2, JSON.stringify(trip.inDoc));
    t.ok('and they come back through the loader',
      !!trip.back && trip.back.len === 5 && trip.back.bars === 2 && trip.back.mode === 'lock',
      JSON.stringify(trip.back));
    t.ok('undo snapshots carry them too', !!trip.inUndo && trip.inUndo.len === 5,
      JSON.stringify(trip.inUndo));

    // ---- the panel ---------------------------------------------------------
    t.head('THE PANEL DRIVES THE ENGINE');
    const ui = await page.evaluate(async () => {
      const o = {};
      document.querySelector('#tabs button[data-v="seq"]').click();
      await new Promise(r => setTimeout(r, 200));
      const pad = S.pads.findIndex(x => x.bufId >= 0);
      S.seqPad = pad;
      const pat = S.patterns[S.pattern];
      delete pat.poly; pat.steps.forEach(r => r.fill(0));
      drawSeq(); drawSteps();

      document.getElementById('btnPoly').click();
      o.opens = document.getElementById('polyPanel').style.display === 'block';
      o.startsOnGrid = polyCfg(pat, pad) === null;
      o.gridCellsBefore = document.querySelectorAll('#stepgrid .step').length;

      // three per bar, via a quick button
      document.querySelector('.polypre[data-len="3"]').click();
      const cfg = polyCfg(pat, pad);
      o.mode = cfg && cfg.mode; o.len = cfg && cfg.len; o.bars = cfg && cfg.bars;
      o.readout = document.getElementById('polyReadout').textContent;
      o.polyCells = document.querySelectorAll('#polygrid .pcell').length;
      o.gridCellsAfter = document.querySelectorAll('#stepgrid .step').length;
      o.gridMarked = document.getElementById('stepgrid').classList.contains('polyrow');

      // a cell written in the panel is the same data the grid edits
      document.querySelectorAll('#polygrid .pcell')[1].click();
      o.rowAfterTap = pat.steps[pad].slice(0, 4).map(v => v > 0 ? 1 : 0).join('');
      o.gridShowsIt = document.querySelectorAll('#stepgrid .step')[1].classList.contains('on');

      // free mode
      document.getElementById('btnPolyFree').click();
      const f = polyCfg(pat, pad);
      o.freeMode = f && f.mode;
      o.freeRowShown = document.getElementById('polyFreeRow').style.display === 'flex';
      o.lockRowHidden = document.getElementById('polyLockRow').style.display === 'none';
      const sl = document.getElementById('polyBpm');
      sl.value = '137'; sl.dispatchEvent(new Event('input'));
      o.freeBpm = polyCfg(pat, pad).bpm;
      o.freeReadout = document.getElementById('polyReadout').textContent;

      // and back off
      document.getElementById('btnPolyOff').click();
      o.backToGrid = polyCfg(pat, pad) === null;
      o.gridCellsBack = document.querySelectorAll('#stepgrid .step').length;
      return o;
    });
    t.ok('the panel opens', ui.opens);
    t.ok('a pad starts on the ordinary grid', ui.startsOnGrid);
    t.ok('a quick button sets a locked 3-per-bar', ui.mode === 'lock' && ui.len === 3 && ui.bars === 1,
      JSON.stringify({ m: ui.mode, len: ui.len, bars: ui.bars }));
    t.note('    readout: "' + ui.readout + '"');
    t.ok('the readout states hits, ratio AND the interval',
      /3 hits per 1 bar/.test(ui.readout) && /3:16/.test(ui.readout) && /one every/.test(ui.readout));
    t.ok('the panel draws one cell per hit', ui.polyCells === 3, ui.polyCells + ' cells');
    /* The rule this app is built on. Sixteen boxes for a track that plays three
       would be the sequencer showing something it will not play. */
    t.ok('THE STEP GRID SHOWS 3 CELLS, NOT 16', ui.gridCellsAfter === 3,
      ui.gridCellsBefore + ' before → ' + ui.gridCellsAfter + ' after');
    t.ok('and is marked as running on a different pulse', ui.gridMarked);
    t.ok('a cell tapped in the panel is the same hit the grid shows',
      ui.rowAfterTap === '0100' && ui.gridShowsIt, ui.rowAfterTap);
    t.ok('FREE swaps the controls over',
      ui.freeMode === 'free' && ui.freeRowShown && ui.lockRowHidden);
    t.ok('the BPM slider sets the pad tempo', ui.freeBpm === 137, String(ui.freeBpm));
    t.note('    free readout: "' + ui.freeReadout + '"');
    t.ok('and the readout says it drifts', /drift/.test(ui.freeReadout), ui.freeReadout);
    t.ok('turning it off returns the pad to the grid',
      ui.backToGrid && ui.gridCellsBack === 16, ui.gridCellsBack + ' cells');

    t.head('SHORTENING A POLY ROW REMOVES WHAT IT HIDES');
    /* Same contract the pattern length follows: a hit you can no longer see must
       not still sound, and you are told it went. */
    const shrink = await page.evaluate(() => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.poly = { [pad]: { on: true, mode: 'lock', len: 5, bars: 1 } };
      pat.steps[pad].fill(0);
      for (let k = 0; k < 5; k++) pat.steps[pad][k] = 0.9;
      drawPoly();
      document.getElementById('polyLenDn').click();      // 5 -> 4
      document.getElementById('polyLenDn').click();      // 4 -> 3
      return { row: pat.steps[pad].slice(0, 6).map(v => v > 0 ? 1 : 0).join(''),
        said: document.getElementById('lcdmsg').textContent,
        len: polyCfg(pat, pad).len };
    });
    t.ok('cells past the new end are cleared', shrink.row === '111000', shrink.row);
    t.ok('and it says so, in grammatical English',
      /1 hit past the new end was removed, not hidden/.test(shrink.said), '"' + shrink.said + '"');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
