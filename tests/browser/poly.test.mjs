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
      // 75 against a project at 100 = three hits per bar: 3-against-4
      /* trig:'free' throughout this first half — these sections are about the
         lane that runs on its own clock, which is now the OPTION rather than the
         default. The step-fired default gets its own section further down. */
      pat.poly = { [A]: { on: true, bpm: 75, cells: 3, lock: true, trig: 'free' } };
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
      pat.poly = { [A]: { on: true, bpm: 137 * 4, cells: 4, lock: false, trig: 'free' } };
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
        expect: 60 / (137 * 4) };
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
      pat.poly = { [A]: { on: true, bpm: 125, cells: 5, lock: true } };
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
      !!trip.inDoc && trip.inDoc.bpm === 125 && trip.inDoc.cells === 5, JSON.stringify(trip.inDoc));
    t.ok('and they come back through the loader',
      !!trip.back && trip.back.cells === 5 && trip.back.lock === true, JSON.stringify(trip.back));
    t.ok('undo snapshots carry them too', !!trip.inUndo && trip.inUndo.cells === 5,
      JSON.stringify(trip.inUndo));

    // ---- the panel ---------------------------------------------------------
    t.head('THE PANEL: ONE NUMBER, ONE SWITCH');
    const ui = await page.evaluate(async () => {
      const o = {};
      document.querySelector('#tabs button[data-v="seq"]').click();
      await new Promise(r => setTimeout(r, 200));
      const pad = S.pads.findIndex(x => x.bufId >= 0);
      S.seqPad = pad; setBpm(100);
      const pat = S.patterns[S.pattern];
      delete pat.poly; pat.steps.forEach(r => r.fill(0));
      drawSeq(); drawSteps();

      document.getElementById('btnPoly').scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 250));
      document.getElementById('btnPoly').click();
      await new Promise(r => setTimeout(r, 1200));
      const pr = document.getElementById('polyPanel').getBoundingClientRect();
      o.onScreen = pr.top < window.innerHeight && pr.bottom > 0;
      o.distanceFromButton = Math.round(
        pr.top - document.getElementById('btnPoly').getBoundingClientRect().bottom);
      o.startsOnMainBeat = polyCfg(pat, pad) === null;
      o.bodyHidden = document.getElementById('polyBody').style.display === 'none';

      // switch it on: it should start at the project tempo, one hit per beat
      document.getElementById('btnPolyOn').click();
      o.defaultBpm = polyRaw().bpm;
      o.defaultSays = document.getElementById('polySays').textContent;

      // the 3:4 quick button — the case the grid cannot express
      document.querySelector('.polypre[data-mul="0.75"]').click();
      const c = polyCfg(pat, pad);
      o.threeBpm = polyRaw().bpm;
      o.threeSays = document.getElementById('polySays').textContent;
      o.threeShown = document.getElementById('polyBpmV').textContent;
      o.polyCells = document.querySelectorAll('#polygrid .pcell').length;
      o.gridCells = document.querySelectorAll('#stepgrid .step').length;
      o.laneMarked = getComputedStyle(document.querySelector('#polygrid .pcell'))
        .borderTopColor;
      o.alsoShown = document.getElementById('polyAlso').style.display !== 'none';
      o.alsoText = document.getElementById('polyAlso').textContent;
      o.defaultTrig = polyTrig(polyCfg(pat, pad));
      o.trigRowShown = document.getElementById('polyTrigRow').style.display !== 'none';

      // triplets
      document.querySelector('.polypre[data-mul="3"]').click();
      o.tripSays = document.getElementById('polySays').textContent;

      // an awkward tempo, locked: it should say where it landed
      const sl = document.getElementById('polyBpm');
      sl.value = '137'; sl.dispatchEvent(new Event('input'));
      o.lockedShown = document.getElementById('polyBpmV').textContent;
      o.lockedHint = document.getElementById('polyLockHint').textContent;
      // and unlocked: exactly what was asked for, drifting
      document.getElementById('btnPolyLock').click();
      o.freeShown = document.getElementById('polyBpmV').textContent;
      o.freeSays = document.getElementById('polySays').textContent;

      // CELLS must not change the rate
      const cellsBefore = polyCfg(pat, pad).cells;
      const before = polyStepDur(polyCfg(pat, pad), NSTEPS * stepDur());
      document.getElementById('polyCellUp').click();
      document.getElementById('polyCellUp').click();
      const after = polyStepDur(polyCfg(pat, pad), NSTEPS * stepDur());
      o.rateUnchangedByCells = Math.abs(before - after) < 1e-12;
      o.cellsBefore = cellsBefore;
      o.cellsNow = polyCfg(pat, pad).cells;

      document.getElementById('btnPolyOff').click();
      o.backToMain = polyCfg(pat, pad) === null;
      o.gridCellsBack = document.querySelectorAll('#stepgrid .step').length;
      return o;
    });
    t.ok('the panel opens on screen', ui.onScreen, ui.distanceFromButton + 'px below the button');
    t.ok('a pad starts on the main beat', ui.startsOnMainBeat && ui.bodyHidden);
    /* The mapping the whole redesign rests on: the same number as the project
       means the same speed. If this is not true nothing else in the panel is
       guessable. */
    t.ok('switching on starts at the project tempo', ui.defaultBpm === 100, String(ui.defaultBpm));
    t.note('    at 100: "' + ui.defaultSays + '"');
    t.ok('and says it is one hit per beat', /one hit per beat/.test(ui.defaultSays));

    t.note('    3:4 button → ' + ui.threeBpm + ' BPM: "' + ui.threeSays + '"');
    t.ok('the 3:4 button gives 75 against 100', ui.threeBpm === 75, String(ui.threeBpm));
    t.ok('and it is described as 3 hits per bar', /3 hits per bar/.test(ui.threeSays), ui.threeSays);
    t.ok('and as a 3:4 relationship', /3:4/.test(ui.threeSays));
    t.ok('and says when it comes back round', /every bar/.test(ui.threeSays));
    /* A preset gives the whole result: the rate and a bar's worth of cells. */
    t.ok('and gives the lane 3 cells to match', ui.polyCells === 3, ui.polyCells + '');
    /* THE TWO LANES ARE SEPARATE. Until R149 turning POLY on re-pointed the
       STEP grid at the poly cells, so both grids showed the same three boxes
       and the pad lost the part already written on it: "both screens do the
       same thing". The step grid is the step grid; the lane is below it. */
    t.ok('THE STEP GRID STILL SHOWS 16', ui.gridCells === 16, ui.gridCells + '');
    t.ok('and the lane is drawn in its own colour', ui.laneMarked !== 'rgb(43, 48, 56)',
      ui.laneMarked);
    t.ok('and the grid says the pad has a figure', ui.alsoShown &&
      /POLY FIGURE/.test(ui.alsoText), ui.alsoText.slice(0, 70));
    t.ok('a new figure is fired FROM THE STEPS by default', ui.defaultTrig === 'step',
      ui.defaultTrig);
    t.ok('and the choice is on screen, not buried', ui.trigRowShown);

    t.note('    triplet button: "' + ui.tripSays + '"');
    t.ok('the triplet button says 3 hits per beat', /3 hits per beat/.test(ui.tripSays), ui.tripSays);

    t.head('LOCK EXPLAINS ITSELF');
    t.note('    137 locked → shows ' + ui.lockedShown + ', hint "' + ui.lockedHint + '"');
    /* 137 against 100 is 5.48 hits per bar, which cannot fit. Locked it becomes
       5 hits per bar = 125 BPM, and the panel must show where it LANDED rather
       than what was typed — otherwise the number and the sound disagree. */
    t.ok('a locked awkward tempo is nudged to one that fits',
      parseFloat(ui.lockedShown) === 125, ui.lockedShown);
    t.ok('and it says it moved it, and to what',
      /137/.test(ui.lockedHint) && /125/.test(ui.lockedHint), ui.lockedHint);
    t.ok('unlocking gives back exactly what was asked for',
      parseFloat(ui.freeShown) === 137, ui.freeShown);
    t.note('    137 unlocked: "' + ui.freeSays + '"');
    t.ok('and says it drifts', /drifts/.test(ui.freeSays), ui.freeSays);

    t.head('CELLS AND SPEED ARE SEPARATE');
    /* One number doing two jobs is most of why the first design was confusing. */
    t.ok('changing CELLS does not change the rate', ui.rateUnchangedByCells);
    t.ok('and CELLS actually changed', ui.cellsNow === ui.cellsBefore + 2,
      ui.cellsBefore + ' → ' + ui.cellsNow);
    t.ok('turning it off returns the pad to the main beat',
      ui.backToMain && ui.gridCellsBack === 16, ui.gridCellsBack + '');

    t.head('SHORTENING A POLY ROW REMOVES WHAT IT HIDES');
    /* Same contract the pattern length follows: a hit you can no longer see must
       not still sound, and you are told it went. */
    const shrink = await page.evaluate(() => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.poly = { [pad]: { on: true, bpm: 125, cells: 5, lock: true, row: polyEmptyRow() } };
      for (let k = 0; k < 5; k++) pat.poly[pad].row[k] = 0.9;
      pat.steps[pad].fill(0);
      pat.steps[pad][3] = 0.7;                            // and a hit on the GRID lane
      drawPoly();
      document.getElementById('polyCellDn').click();      // 5 -> 4
      document.getElementById('polyCellDn').click();      // 4 -> 3
      return { row: polyRowOf(pat, pad).slice(0, 6).map(v => v > 0 ? 1 : 0).join(''),
        grid: pat.steps[pad].slice(0, 6).map(v => v > 0 ? 1 : 0).join(''),
        said: document.getElementById('lcdmsg').textContent,
        cells: polyCfg(pat, pad).cells };
    });
    t.ok('cells past the new end are cleared', shrink.row === '111000', shrink.row);
    t.ok('and it says so, in grammatical English',
      /1 poly cell past the new end was removed, not hidden/.test(shrink.said),
      '"' + shrink.said + '"');
    t.ok("and the pad's grid row is not touched by it", shrink.grid === '000100', shrink.grid);

    t.head('TWO LANES ON ONE PAD, AND BOTH OF THEM PLAY');
    /* The report: "our sequencer doesn't move after selecting poly and both
       screens do the same thing... I want the bottom sequencer not to have to
       agree with the top, so that if I want to put a triple hit on one pad I
       can do so in poly."

       Until R149 the poly cells WERE the pad's grid row — one array behind two
       views — so turning POLY on silently replaced the part already written on
       that pad and the two grids could not disagree by construction. This is
       the test that they now can, and that the pad is heard playing both. */
    const lanes = await page.evaluate(async () => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.locks = {};
      pat.steps[pad].fill(0);
      pat.steps[pad][0] = 0.9; pat.steps[pad][8] = 0.9;      // GRID: two hits, on the beat
      pat.poly = { [pad]: { on: true, bpm: 75, cells: 3, lock: true, trig: 'free',
        row: polyEmptyRow() } };
      pat.poly[pad].row[0] = 0.9; pat.poly[pad].row[1] = 0.9; pat.poly[pad].row[2] = 0.9;
      S.bpm = 100; pat.plen = 16; pat.len = new Array(NPADS).fill(16);
      drawSeq(); drawPoly();

      const out = {
        gridBoxes: document.querySelectorAll('#stepgrid .step').length,
        laneCells: document.querySelectorAll('#polygrid .pcell').length,
        gridRow: pat.steps[pad].slice(0, 16).map(v => v > 0 ? 1 : 0).join(''),
        laneRow: polyRowOf(pat, pad).slice(0, 3).map(v => v > 0 ? 1 : 0).join(''),
      };
      /* Editing one lane must not touch the other. Tap grid step 4 and lane
         cell 1 and read both back. */
      document.querySelectorAll('#stepgrid .step')[4].click();
      document.querySelectorAll('#polygrid .pcell')[1].click();
      out.gridAfter = pat.steps[pad].slice(0, 16).map(v => v > 0 ? 1 : 0).join('');
      out.laneAfter = polyRowOf(pat, pad).slice(0, 3).map(v => v > 0 ? 1 : 0).join('');

      // put it back, then count what the pad actually fires in one bar
      document.querySelectorAll('#polygrid .pcell')[1].click();
      pat.steps[pad][4] = 0;
      const keepR = S.pads[pad].rev, keepD = S.pads[pad].dly;
      S.pads[pad].rev = 0; S.pads[pad].dly = 0;
      const when = [];
      const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, w, reg, pitch) => {
        if (p === pad) when.push(+(w - 0.05).toFixed(6));
        return real(c, g, p, v, w, reg, pitch);
      };
      await renderMix(new Set([pad]), new Set());
      window.triggerPad = real;
      S.pads[pad].rev = keepR; S.pads[pad].dly = keepD;
      out.fired = [...new Set(when)].sort((a, b) => a - b);
      out.barDur = 16 * (60 / 100 / 4);
      return out;
    });
    t.note('    grid ' + lanes.gridBoxes + ' steps · lane ' + lanes.laneCells + ' cells');
    t.ok('the grid keeps its own length', lanes.gridBoxes === 16, lanes.gridBoxes + '');
    t.ok('and the lane keeps its own', lanes.laneCells === 3, lanes.laneCells + '');
    t.ok('they hold different patterns', lanes.gridRow === '1000000010000000' &&
      lanes.laneRow === '111', lanes.gridRow + ' / ' + lanes.laneRow);
    t.ok('editing the grid does not touch the lane',
      lanes.gridAfter === '1000100010000000' && lanes.laneAfter === '101',
      lanes.gridAfter + ' / ' + lanes.laneAfter);

    /* One bar at 100 BPM is 2.4s. The grid lane fires at 0 and 1.2; the poly
       lane fires three times a bar, at 0, 0.8 and 1.6. They coincide at 0, so
       the pad should fire at 0, 0.8, 1.2 and 1.6 — four distinct times, two of
       which belong to a rhythm the 16-step grid cannot write. */
    const bar = lanes.barDur;
    const want = [0, bar / 3, bar / 2, 2 * bar / 3];
    const inBar = lanes.fired.filter(w => w < bar - 1e-6);
    t.note('    first bar fires at ' + inBar.map(w => w.toFixed(3)).join(' · ') +
      '   (bar = ' + bar.toFixed(3) + 's)');
    t.ok('the pad is heard playing BOTH lanes', inBar.length === 4, inBar.length + ' hits');
    const off = want.map((w, i) => Math.abs((inBar[i] ?? NaN) - w));
    t.ok('at the grid times AND the triplet times',
      off.every(d => d < 1e-4), 'worst ' + (Math.max(...off) * 1000).toFixed(2) + 'ms');

    t.head("THE LANE'S PLAYHEAD MOVES");
    /* "Our sequencer doesn't move after selecting poly." It did not: drawPoly
       worked out which cell was sounding but nothing redrew during playback, so
       the head sat on cell 0 forever. It rides the frame loop now. */
    const head = await page.evaluate(async () => {
      if (!document.getElementById('polyPanel').style.display ||
          document.getElementById('polyPanel').style.display === 'none') {
        document.getElementById('btnPoly').click();
      }
      S.chainOn = false; S.songOn = false;
      startSeq();
      const seen = [];
      await new Promise(r => {
        const t = setInterval(() => {
          seen.push([...document.querySelectorAll('#polygrid .pcell')]
            .findIndex(e => e.classList.contains('cur')));
          if (seen.length >= 40) { clearInterval(t); r(); }
        }, 60);
      });
      stopSeq();
      return { seen, distinct: new Set(seen).size };
    });
    t.note('    cells lit over 2.4s: ' + head.seen.join(','));
    t.ok('the lane lights every one of its cells while playing',
      head.distinct >= 3, head.distinct + ' distinct');
    t.ok('and it is not stuck on one', head.seen.some((v, i) => i && v !== head.seen[i - 1]));

    t.head('A PROJECT FROM BEFORE THE SPLIT MOVES ITS CELLS ACROSS');
    /* R144-R148 stored the cells in the grid row. Those hits have to end up in
       the lane — and be REMOVED from the grid, because a copy would add hits to
       the ordinary pattern that nobody wrote. */
    const old = await page.evaluate(() => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.locks = {};
      pat.steps[pad].fill(0);
      pat.steps[pad][0] = 0.9; pat.steps[pad][2] = 0.7;   // were poly cells 0 and 2
      pat.steps[pad][11] = 0.8;                            // past the cells: a real grid hit
      pat.poly = { [pad]: { on: true, bpm: 75, cells: 3, lock: true } };   // no row: pre-R149
      const needed = polyNeedsSplit(pat.poly[pad]);
      const row = polyRowOf(pat, pad);
      return { needed,
        lane: row.slice(0, 4).map(v => v > 0 ? 1 : 0).join(''),
        grid: pat.steps[pad].slice(0, 12).map(v => v > 0 ? 1 : 0).join(''),
        again: polyNeedsSplit(pat.poly[pad]) };
    });
    t.ok('an old setting is recognised as needing the split', old.needed);
    t.ok('its cells arrive in the lane', old.lane === '1010', old.lane);
    t.ok('and are gone from the grid row, not duplicated into it',
      old.grid === '000000000001', old.grid);
    t.ok('and it is a one-time conversion', !old.again);

    t.head('LOCKS BELONG TO THE LANE THEY WERE SET ON');
    /* Sharing the key meant a ratchet put on grid step 2 also landed on poly
       cell 2 — invisible from either panel. */
    const locks = await page.evaluate(() => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.locks = {};
      pat.poly = { [pad]: { on: true, bpm: 75, cells: 3, lock: true, trig: 'free',
        row: polyEmptyRow() } };
      pat.poly[pad].row[2] = 0.9;
      pat.steps[pad].fill(0); pat.steps[pad][2] = 0.9;
      seqLockMode = true; drawSeq(); drawPoly();
      document.querySelectorAll('#polygrid .pcell')[2].click();      // select the LANE cell
      const laneTitle = document.getElementById('slTitle').textContent;
      const rat = document.getElementById('slRat');
      rat.value = '5'; rat.dispatchEvent(new Event('input'));        // ratchet the lane cell
      document.querySelectorAll('#stepgrid .step')[2].click();       // now the GRID step
      const gridTitle = document.getElementById('slTitle').textContent;
      const out = { laneTitle, gridTitle,
        laneLock: JSON.stringify(pat.locks['P' + pad + ':2'] || null),
        gridLock: JSON.stringify(pat.locks[pad + ':2'] || null),
        gridRatShown: document.getElementById('slRat').value };
      seqLockMode = false; document.getElementById('btnStepLock').classList.remove('on');
      return out;
    });
    t.note('    lane: "' + locks.laneTitle + '"  ·  grid: "' + locks.gridTitle + '"');
    t.ok('the editor says which lane it is on',
      /POLY cell 3/.test(locks.laneTitle) && /step 3/.test(locks.gridTitle) &&
      !/POLY/.test(locks.gridTitle));
    t.ok('a lock set on a lane cell is stored under the lane', locks.laneLock !== 'null' &&
      /"rat":5/.test(locks.laneLock), locks.laneLock);
    t.ok('and the grid step at the same index did not get it',
      locks.gridLock === 'null' && locks.gridRatShown === '1',
      locks.gridLock + ' / rat ' + locks.gridRatShown);

    t.head('REMOVING IT REALLY REMOVES IT');
    /* Reported: "I try a pattern, remove it from a sequence and it still plays
       as if I left it in." CLR ROW emptied the grid row and left the poly lane
       running — and the pad's LED went dark, so nothing on screen accounted for
       what you could still hear. Both halves are checked here, because the
       silent one is what made the first half impossible to diagnose. */
    const removal = await page.evaluate(async () => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.locks = {};
      pat.steps[pad].fill(0); pat.steps[pad][0] = 0.9; pat.steps[pad][8] = 0.9;
      pat.poly = { [pad]: { on: true, bpm: 75, cells: 3, lock: true, trig: 'free',
        row: polyEmptyRow() } };
      for (let k = 0; k < 3; k++) pat.poly[pad].row[k] = 0.9;
      pat.locks['P' + pad + ':1'] = { rat: 3 };
      S.bpm = 100; drawSeq(); drawPads();

      const fires = async () => {
        const keepR = S.pads[pad].rev, keepD = S.pads[pad].dly;
        S.pads[pad].rev = 0; S.pads[pad].dly = 0;
        const w = []; const real = window.triggerPad;
        window.triggerPad = (c, g, p, v, when, reg, pi) => {
          if (p === pad) w.push(+(when - 0.05).toFixed(3));
          return real(c, g, p, v, when, reg, pi);
        };
        await renderMix(new Set([pad]), new Set());
        window.triggerPad = real;
        S.pads[pad].rev = keepR; S.pads[pad].dly = keepD;
        return [...new Set(w)].filter(x => x > -0.01 && x < 2.4).length;
      };
      const led = () => {
        const el = document.querySelectorAll('#padgrid .pad')[pad % 16];
        return { on: el.classList.contains('inseq'), poly: el.classList.contains('polyonly') };
      };
      const out = { before: await fires(), ledBefore: led() };

      // a pad playing ONLY from its lane must still read as playing
      pat.steps[pad].fill(0); drawSeq(); drawPads();
      out.laneOnly = await fires();
      out.ledLaneOnly = led();

      // and CLR ROW must empty the whole track
      pat.steps[pad][0] = 0.9; drawSeq();
      document.getElementById('btnRowClr').click();
      out.after = await fires();
      out.said = document.getElementById('lcdmsg').textContent;
      out.grid = pat.steps[pad].some(v => v > 0);
      out.lane = padPolyHits(pat, pad);
      out.laneLock = pat.locks['P' + pad + ':1'] || null;
      out.ledAfter = led();
      out.cfgKept = !!polyCfg(pat, pad);
      return out;
    });
    t.note('    grid+lane ' + removal.before + ' hits · lane alone ' + removal.laneOnly +
      ' · after CLR ROW ' + removal.after);
    t.ok('a pad with only a poly lane still lights its LED',
      removal.ledLaneOnly.on, JSON.stringify(removal.ledLaneOnly));
    t.ok('and the LED says the lane is why', removal.ledLaneOnly.poly);
    t.ok('while a grid hit alone lights it amber, not teal',
      removal.ledBefore.on && !removal.ledBefore.poly, JSON.stringify(removal.ledBefore));
    t.ok('CLR ROW silences the pad completely', removal.after === 0,
      removal.after + ' hits still fire');
    t.ok('the grid row is empty', !removal.grid);
    t.ok('and so is the lane', removal.lane === 0, removal.lane + ' cells');
    t.ok("and the lane's locks went with it", removal.laneLock === null,
      JSON.stringify(removal.laneLock));
    t.ok('the LED goes dark only once it really is silent', !removal.ledAfter.on);
    t.note('    "' + removal.said + '"');
    t.ok('and it says it cleared the lane too, not just the row',
      /poly cell/.test(removal.said), removal.said);
    /* Clearing the hits is not the same as giving the pad back to the main
       beat, and the message has to be honest about which one just happened. */
    t.ok('the pad keeps its own BPM until MAIN BEAT is pressed', removal.cfgKept);

    t.head('AND THE GRID SAYS WHY THE PAD IS STILL SOUNDING');
    const notice = await page.evaluate(() => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      pat.poly[pad].trig = 'free';
      pat.poly[pad].row[0] = 0.9;
      pat.steps[pad].fill(0);
      drawSeq();
      return { text: document.getElementById('polyAlso').textContent,
        shown: document.getElementById('polyAlso').style.display !== 'none' };
    });
    t.ok('the notice is up when the lane has hits and the grid does not', notice.shown);
    t.ok('and it says clearing the steps will not stop it',
      /will not stop it/.test(notice.text), notice.text.slice(0, 120));
    t.ok('and names the two ways to stop it',
      /CLR ROW/.test(notice.text) && /MAIN BEAT/.test(notice.text));
    t.ok('and says the lane belongs to this pattern',
      /This pattern only/.test(notice.text));

    t.head('THE FIGURE IS FIRED BY THE STEPS, AND ONLY BY THE STEPS');
    /* "The poly lane shouldn't play if nothing is selected on the main sequencer
       to trigger the poly lane to play." That is the default now: the pad's
       figure replaces the single hit at every lit step, and an empty row is
       silence. Measured in a render, because the whole complaint was about what
       could be heard when nothing on the grid accounted for it. */
    const fired = await page.evaluate(async () => {
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      S.bpm = 100; S.human = 0; S.swing = 0; S.chainOn = false; S.songOn = false;
      arrHeldOnce = true;
      pat.locks = {}; pat.steps[pad].fill(0);
      pat.plen = 16; pat.len = new Array(NPADS).fill(16);
      // 300 BPM = three hits per beat: a triplet, 0.2s apart at a 0.6s beat
      pat.poly = { [pad]: { on: true, bpm: 300, cells: 3, lock: true, row: polyEmptyRow() } };
      for (let k = 0; k < 3; k++) pat.poly[pad].row[k] = 0.9;
      document.getElementById('bLoops').value = '1';
      drawSeq();
      const at = async () => {
        const kR = S.pads[pad].rev, kD = S.pads[pad].dly;
        S.pads[pad].rev = 0; S.pads[pad].dly = 0;
        const w = []; const real = window.triggerPad;
        window.triggerPad = (c, g, p, v, when, reg, pi) => {
          if (p === pad) w.push(+(when - 0.05).toFixed(3));
          return real(c, g, p, v, when, reg, pi);
        };
        const buf = await renderMix(new Set([pad]), new Set());
        window.triggerPad = real;
        S.pads[pad].rev = kR; S.pads[pad].dly = kD;
        return { t: [...new Set(w)].filter(x => x > -0.01 && x < 2.39).sort((a, b) => a - b),
          silent: !buf };
      };
      const out = { empty: await at() };
      pat.steps[pad][0] = 0.9; drawSeq(); out.one = await at();
      pat.steps[pad][8] = 0.9; drawSeq(); out.two = await at();
      pat.locks[pad + ':8'] = { plain: 1 }; drawSeq(); out.plain = await at();
      out.marked = document.querySelectorAll('#stepgrid .step')[8].classList.contains('lockmark');
      return out;
    });
    t.note('    empty grid      → ' + (fired.empty.t.join(' ') || '(silence)'));
    t.note('    step 0 lit      → ' + fired.one.t.join('  '));
    t.note('    steps 0 and 8   → ' + fired.two.t.join('  '));
    t.note('    step 8 = PLAIN  → ' + fired.plain.t.join('  '));
    t.ok('AN EMPTY GRID ROW IS SILENCE', fired.empty.t.length === 0,
      fired.empty.t.length + ' hits fired with nothing lit');
    t.ok('one lit step fires the whole figure', fired.one.t.length === 3,
      fired.one.t.length + ' hits');
    /* 300 BPM against a project at 100 is three hits per beat, so the figure
       occupies one beat: 0, 0.2, 0.4. */
    t.ok('at the figure\'s own tempo, not the grid\'s',
      fired.one.t.every((w, i) => Math.abs(w - i * 0.2) < 0.01),
      fired.one.t.join(' '));
    t.ok('a second lit step fires it again, from there',
      fired.two.t.length === 6 && Math.abs(fired.two.t[3] - 1.2) < 0.01,
      fired.two.t.join(' '));
    /* The figure REPLACES the step's single hit rather than decorating it —
       three cells on a step is three hits, not four. */
    t.ok('and replaces the plain hit rather than adding to it',
      fired.two.t.length === 6, fired.two.t.length + ' hits from 2 steps × 3 cells');
    t.ok('PLAIN HIT takes one step back out of the figure',
      fired.plain.t.length === 4 && Math.abs(fired.plain.t[3] - 1.2) < 0.01,
      fired.plain.t.join(' '));
    t.ok('and that step is marked on the grid, not changed in secret', fired.marked);

    t.head('A QUICK PRESET GIVES A FIGURE YOU CAN PLACE ON A STEP');
    /* The presets used to set a BAR's worth of cells, which was right when the
       row was a continuous lane and wrong the moment a step fires it: `triplet`
       came out twelve cells long, so one step swallowed the next four beats.
       A figure has to last a whole number of BEATS, and the smallest count that
       does is what a button labelled `triplet` promises — three. */
    const presets = await page.evaluate(() => {
      setBpm(100); arrHeldOnce = true;
      const pad = S.seqPad, pat = S.patterns[S.pattern];
      delete pat.poly; drawSeq();
      if (document.getElementById('polyPanel').style.display === 'none')
        document.getElementById('btnPoly').click();
      document.getElementById('btnPolyOn').click();
      const beat = 60 / 100, out = {};
      document.querySelectorAll('.polypre').forEach(b => {
        b.click();
        const c = polyCfg(pat, pad), bar = NSTEPS * stepDur();
        out[b.textContent] = { cells: c.cells, beats: +(polyFigureDur(c, bar) / beat).toFixed(4) };
      });
      return out;
    });
    for (const [name, v] of Object.entries(presets))
      t.note('    ' + name.padEnd(8) + v.cells + ' cells = ' + v.beats + ' beats');
    t.ok('every preset lasts a whole number of beats',
      Object.values(presets).every(v => Math.abs(v.beats - Math.round(v.beats)) < 1e-6),
      Object.entries(presets).map(([k, v]) => k + ':' + v.beats).join(' '));
    t.ok('triplet is three cells in one beat, not twelve in four',
      presets['triplet'].cells === 3 && Math.abs(presets['triplet'].beats - 1) < 1e-6,
      presets['triplet'].cells + ' cells / ' + presets['triplet'].beats + ' beats');
    t.ok('and 3:4 is three cells across the bar, which is what it means',
      presets['3:4'].cells === 3 && Math.abs(presets['3:4'].beats - 4) < 1e-6,
      presets['3:4'].cells + ' cells / ' + presets['3:4'].beats + ' beats');

    t.head('THE PANEL SAYS WHICH ONE IT IS DOING');
    const says = await page.evaluate(() => {
      const pad = S.seqPad;
      if (document.getElementById('polyPanel').style.display === 'none')
        document.getElementById('btnPoly').click();
      document.getElementById('btnPolyStep').click();
      const step = { hint: document.getElementById('polyTrigHint').textContent,
        said: document.getElementById('lcdmsg').textContent,
        on: document.getElementById('btnPolyStep').classList.contains('on') };
      document.getElementById('btnPolyFree').click();
      const free = { hint: document.getElementById('polyTrigHint').textContent,
        said: document.getElementById('lcdmsg').textContent,
        on: document.getElementById('btnPolyFree').classList.contains('on'),
        trig: polyTrig(polyCfg(S.patterns[S.pattern], pad)) };
      document.getElementById('btnPolyStep').click();
      return { step, free };
    });
    t.note('    FROM EACH STEP: "' + says.step.hint.slice(0, 100) + '"');
    t.note('    ON ITS OWN:     "' + says.free.hint.slice(0, 100) + '"');
    t.ok('FROM EACH STEP is marked and explains the gate', says.step.on &&
      /No step, no sound/.test(says.step.hint), says.step.hint.slice(0, 80));
    t.ok('ON ITS OWN is marked and warns that it keeps going', says.free.on &&
      says.free.trig === 'free' && /empty the row/.test(says.free.hint),
      says.free.hint.slice(0, 80));
    t.ok('and each switch says what changed', /FROM EACH STEP/.test(says.step.said) &&
      /ON ITS OWN/.test(says.free.said));

    t.head("THE DEMO SONG ACTUALLY USES ANY OF THIS");
    /* A feature the factory song does not touch is a feature nobody meets. It
       is also the only end-to-end check that poly figures, chords and built
       sounds survive a real arrangement rather than a test fixture. */
    const song = await page.evaluate(async () => {
      await loadClaudeSong();
      await new Promise(r => setTimeout(r, 400));
      const beat = 60 / Math.abs(S.bpm), bar = NSTEPS * (beat / 4);
      const poly = [];
      S.patterns.forEach((pt, pi) => {
        if (!pt.poly) return;
        Object.keys(pt.poly).forEach(k => {
          const c = polyCfg(pt, +k); if (!c) return;
          poly.push({ pat: pi, pad: +k, bpm: c.bpm, cells: c.cells,
            beats: polyFigureDur(c, bar) / beat, trig: polyTrig(c) });
        });
      });
      let chords = 0, plain = 0;
      S.patterns.forEach(pt => { for (const k in pt.locks) {
        const lk = pt.locks[k];
        if (lk.pitches && lk.pitches.length > 1) chords++;
        if (lk.plain) plain++;
      } });
      return { bpm: S.bpm, poly, chords, plain,
        built: S.pads.filter(p => /glass pluck|bowed air/.test(p.name || '')).map(p => p.name),
        grain: S.pads.filter(p => p.mode === 'grain').length,
        reversed: S.pads.filter(p => p.bufId >= 0 && p.reverse).length,
        keepTime: S.pads.filter(p => p.bufId >= 0 && p.keepTime).length };
    });
    song.poly.forEach(p => t.note('    P' + p.pat + ' pad ' + p.pad + ' — ' + p.bpm +
      'bpm × ' + p.cells + ' cells = ' + p.beats.toFixed(2) + ' beats, fired ' + p.trig));
    t.ok('the song carries poly figures', song.poly.length >= 3, song.poly.length + '');
    t.ok('all of them are fired by the steps, not free-running',
      song.poly.every(p => p.trig === 'step'));
    /* The two cases worth having: three inside a beat, and three across a bar. */
    t.ok('one is three hits inside a single beat',
      song.poly.some(p => p.cells === 3 && Math.abs(p.beats - 1) < 0.01),
      song.poly.map(p => p.beats.toFixed(2)).join(' '));
    t.ok('and one is three across the whole bar — three against four',
      song.poly.some(p => p.cells === 3 && Math.abs(p.beats - 4) < 0.01),
      song.poly.map(p => p.beats.toFixed(2)).join(' '));
    /* Without PLAIN HIT the beat-long figure fires from every lit hat and
       overlaps four deep; measured at 54ms between hits before it was added. */
    t.ok('the timekeeping hats are marked PLAIN so the figure does not smear',
      song.plain >= 8, song.plain + ' steps');
    t.ok('the notes lane carries real chords, not single notes',
      song.chords >= 4, song.chords + ' chords');
    t.ok('and two sounds are built by layering rather than chosen',
      song.built.length === 2, song.built.join(', '));
    t.ok('with a grain cloud, a reversed pad and KEEP TIME in use',
      song.grain >= 1 && song.reversed >= 1 && song.keepTime >= 1,
      'grain ' + song.grain + ' · reversed ' + song.reversed + ' · keepTime ' + song.keepTime);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
