/* THE TRACK VIEW, AND WHAT A CLIP IS.

   "I'd like to be able to do anything Cakewalk can do and would like a similar
   layout."

   The honest scope first, because it matters for reading what follows: this is
   one HTML file that runs on a phone, and Cakewalk is thirty years of Windows
   DAW with VST hosting, a MIDI piano roll and unlimited tracks. Those are not
   coming. What IS Cakewalk, and what TRAX genuinely lacked, is the TRACK VIEW:
   headers down the left, a bar ruler across the top, and clips drawn where
   they actually sit in time.

   Underneath the picture is the change that mattered: until R200 a take had no
   POSITION. It started at bar 1 because bar 1 was the only place it could
   start, and ran to its end because there was no way to say otherwise. That
   one fact is why there was no punch-in, no verse-take-and-chorus-take on one
   lane, and nothing to draw — there was no timeline because nothing had a
   time.

   So what is guarded here is the thing the whole app is built on: WHAT IS
   DRAWN IS WHAT PLAYS. A clip shown at bar 3 has to be at bar 3 in the file
   someone is handed, a trim has to remove audio from the bounce and not just
   from the picture, and a project saved before any of this existed has to come
   back sounding exactly as it did. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A TAKE HAS A PLACE IN TIME');
    const clip = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(350);
      document.querySelector('#tabs button[data-v="trax"]').click();
      await wait(250);
      S.bpm = 120; S.swing = 0; S.human = 0; S.songOn = false; S.chainOn = false;
      S.pads.forEach(p => { p.mute = true; });
      S.trax.forEach(tr => { tr.bufId = -1; });
      /* A one-second lane whose only content is a click in the first 50ms, so
         "where does it play" has an unambiguous answer. */
      const sr = AC.sampleRate, n = Math.round(sr);
      const b = AC.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < Math.round(sr * 0.05); i++) d[i] = 0.8 * (1 - i / (sr * 0.05)); }
      S.buffers.push(b);
      const tr = S.trax[0];
      tr.bufId = S.buffers.indexOf(b); tr.mute = false; tr.gain = 1; tr.loop = false;
      tr.start = 0; tr.tin = 0; tr.tout = 1; tr.fin = 0; tr.fout = 0;
      drawTrax(); await wait(150);
      o.barSec = +tvBarSec().toFixed(3);

      const clickAt = (buf) => { const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.2) return +(i / buf.sampleRate).toFixed(3);
        return -1; };
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '1';
      const bounce = () => renderMix(new Set(), new Set([0]), { loops: 1, src: 'pat', noTail: true });

      o.atBar1 = clickAt(await bounce());
      tr.start = tvBarSec() * 2;
      o.atBar3 = clickAt(await bounce());
      tr.start = 0;

      /* TRIM removes audio from the file, not only from the drawing. */
      tr.tin = 0.5;
      o.trimmedAway = clickAt(await bounce());
      tr.tin = 0;

      /* FADE IN must actually attenuate the start. Measured AT THE CLIP, not
         at the top of the file — the bounce leads in with 50ms of silence
         before anything starts, so sampling the first 20ms of the render
         compared silence against silence and read 0 against 0 on a working
         fade. */
      const peakNear = (buf, fromS, lenS) => { const d = buf.getChannelData(0);
        const a0 = Math.round(fromS * buf.sampleRate), n0 = Math.round(lenS * buf.sampleRate);
        let m = 0; for (let i = a0; i < a0 + n0 && i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
        return +m.toFixed(4); };
      const clipT = clickAt(await bounce());          // where the click actually lands
      tr.fin = 0.4;
      o.fadedStart = peakNear(await bounce(), clipT, 0.02);
      tr.fin = 0;
      o.plainStart = peakNear(await bounce(), clipT, 0.02);

      /* A PROJECT FROM BEFORE ANY OF THIS must be unchanged. */
      delete tr.start; delete tr.tin; delete tr.tout; delete tr.fin; delete tr.fout;
      o.legacy = clickAt(await bounce());
      tr.start = 0; tr.tin = 0; tr.tout = 1; tr.fin = 0; tr.fout = 0;

      /* And the load gate must refuse a poisoned clip rather than hand a NaN
         to src.start(), which throws and takes the transport with it. */
      const doc = JSON.parse(JSON.stringify(snapshotSession()));
      doc.trax[0].start = NaN; doc.trax[0].tin = 'x'; doc.trax[0].tout = -5; doc.trax[0].fin = 1e9;
      const round = JSON.parse(JSON.stringify(doc));
      applySessionDoc(round, S.buffers);
      const h = S.trax[0];
      o.healed = { start: h.start, tin: h.tin, tout: h.tout, fin: h.fin };
      o.healedAllFinite = [h.start, h.tin, h.tout, h.fin, h.fout].every(v => isFinite(v));
      S.pads.forEach(p => { p.mute = false; });
      return o;
    });
    t.note('    one bar is ' + clip.barSec + 's at 120 BPM');
    t.note('    click lands at ' + clip.atBar1 + 's with the clip at bar 1, ' +
      clip.atBar3 + 's with it at bar 3');
    t.ok('MOVING A CLIP MOVES WHEN IT PLAYS, in the bounce and not only on screen',
      Math.abs((clip.atBar3 - clip.atBar1) - clip.barSec * 2) < 0.02,
      'moved ' + (clip.atBar3 - clip.atBar1).toFixed(3) + 's for two bars of ' + clip.barSec + 's');
    t.ok('and trimming really removes the audio', clip.trimmedAway === -1,
      clip.trimmedAway === -1 ? 'the click is gone' : 'still at ' + clip.trimmedAway);
    t.ok('a fade in attenuates the start rather than just drawing a triangle',
      clip.fadedStart < clip.plainStart * 0.25,
      clip.plainStart + ' → ' + clip.fadedStart);
    t.ok('A PROJECT SAVED BEFORE CLIPS EXISTED IS UNCHANGED',
      clip.legacy === clip.atBar1, 'bar 1, click at ' + clip.legacy + 's');
    t.ok('and a poisoned clip is healed rather than thrown at src.start()',
      clip.healedAllFinite && clip.healed.start === 0 && clip.healed.tout > clip.healed.tin,
      JSON.stringify(clip.healed));

    t.head('AND THE VIEW IS THE ONE CAKEWALK USES');
    const view = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('#tabs button[data-v="trax"]').click();
      await wait(200);
      setTvView('track'); await wait(150);
      const wrap = document.getElementById('tvwrap').getBoundingClientRect();
      const heads = document.getElementById('tvheads').getBoundingClientRect();
      const cv = document.getElementById('tvcanvas').getBoundingClientRect();
      o.layout = { headsLeftOfTimeline: heads.right <= cv.left + 1,
        headsFixedWidth: Math.round(heads.width), onScreen: wrap.width > 100 && wrap.height > 100 };
      /* One header row per track, each with its own arm, mute and solo, and
         they must be real buttons — a canvas cannot be reached by keyboard and
         this app checks that everything can. */
      o.headButtons = document.querySelectorAll('#tvheads button').length;
      o.tracks = S.trax.length;
      o.labelled = [...document.querySelectorAll('#tvheads button')]
        .every(b => (b.getAttribute('aria-label') || '').length > 3);
      /* Nothing tappable below the floor the rest of the app holds to. */
      o.smallest = Math.min(...[...document.querySelectorAll('#tvheads button')]
        .map(b => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
      /* LIST is still there, and the two views are never both showing. */
      o.trackOnly = getComputedStyle(document.getElementById('traxlist')).display === 'none';
      setTvView('list'); await wait(120);
      o.listShows = getComputedStyle(document.getElementById('traxlist')).display !== 'none'
        && getComputedStyle(document.getElementById('tvwrap')).display === 'none';
      setTvView('track'); await wait(120);

      /* A DRAG MOVES THE CLIP, through the same pointer path a finger takes. */
      const tr = S.trax[0];
      tr.start = 0; drawTrax(); await wait(100);
      const bb = document.getElementById('tvcanvas').getBoundingClientRect();
      const rowY = bb.top + TV_HEAD + TV_ROW * 0.5;
      tvPointerDown(bb.left + 20, rowY);
      o.selectedOnTap = tvSel;
      o.panelOpened = document.getElementById('tvclip').style.display;
      tvPointerMove(bb.left + 20 + tvPx * 2 + 4, rowY);
      tvPointerUp();
      o.draggedToBar = +(clipStart(tr) / tvBarSec()).toFixed(3);
      /* …and it snapped, rather than landing 4 pixels past bar 3. */
      o.snapped = Math.abs(clipStart(tr) / tvBarSec() - 2) < 1e-6;

      /* Dragging the right edge trims instead of moving. */
      tr.start = 0; tr.tout = 1; drawTrax(); await wait(80);
      const b0 = S.buffers[tr.bufId];
      const cw = clipLen(tr, b0) / tvBarSec() * tvPx;
      tvPointerDown(bb.left + cw - 3, rowY);
      o.zoneWasOut = tvDrag && tvDrag.zone === 'out';
      tvPointerMove(bb.left + cw - 3 - tvPx * 0.3, rowY);
      tvPointerUp();
      o.trimmedTo = +(+S.trax[0].tout).toFixed(3);

      tr.start = 0; tr.tin = 0; tr.tout = 1; tvSel = -1;
      document.getElementById('tvclip').style.display = 'none';
      drawTrax();
      return o;
    });
    t.note('    headers ' + view.layout.headsFixedWidth + 'px wide, ' +
      view.headButtons + ' buttons across ' + view.tracks + ' tracks');
    t.ok('TRACK HEADERS SIT LEFT OF THE TIMELINE, as they do in a track view',
      view.layout.headsLeftOfTimeline && view.layout.onScreen);
    t.ok('with arm, mute and solo per track', view.headButtons === view.tracks * 3);
    t.ok('as real buttons with real labels, not shapes drawn on the canvas',
      view.labelled);
    t.ok('and nothing tappable falls under the 24px floor the rest of the app holds',
      view.smallest >= 24, view.smallest + 'px smallest side');
    t.ok('the old LIST is still there, and the two are never both showing',
      view.trackOnly && view.listShows);
    t.ok('DRAGGING A CLIP MOVES IT, and it lands on the grid',
      view.draggedToBar === 2 && view.snapped, 'dropped at bar ' + (view.draggedToBar + 1));
    t.ok('tapping one selects it and opens its clip panel',
      view.selectedOnTap === 0 && view.panelOpened === 'block');
    t.ok('and dragging the EDGE trims instead of moving',
      view.zoneWasOut && view.trimmedTo < 0.95 && view.trimmedTo > 0.3,
      'trim out ' + view.trimmedTo);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
