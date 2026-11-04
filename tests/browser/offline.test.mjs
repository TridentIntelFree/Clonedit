/* OFFLINE.

   The claim is not "a badge appears". It is that the instrument keeps working
   with the network cut — it ships no audio at all, every default sound is
   synthesised in code — and that the few controls which genuinely need a
   connection are marked rather than left to fail without explanation.

   The badge shipped unreadable, which is why the layout is measured at four
   widths here. It sat beside the logo at 8px, and the header's left column is
   clipped where the transport begins: past the logo at 430px, where I checked
   it, but mid-badge at 390px and earlier still at 360px. It rendered as "OF".
   Checking a layout at one width is what let that ship. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const read = () => page.evaluate(() => ({
      online: navigator.onLine,
      pip: !document.getElementById('offPip').hidden,
      packDim: document.getElementById('btnPackLoad').classList.contains('offline'),
      packTitle: document.getElementById('btnPackLoad').title,
      packDisabled: document.getElementById('btnPackLoad').disabled,
      lcd: document.getElementById('lcdmsg').textContent,
    }));

    t.head('WHILE ONLINE');
    let s = await read();
    t.ok('no OFFLINE badge', !s.pip);
    t.ok('LOAD PACK is not dimmed', !s.packDim);
    const onlineTitle = s.packTitle;

    t.head('NETWORK CUT');
    await ctx.setOffline(true);
    await page.waitForTimeout(400);
    s = await read();
    t.ok('navigator.onLine went false', !s.online);
    t.ok('the OFFLINE badge is showing', s.pip);
    t.ok('LOAD PACK is dimmed', s.packDim);
    t.ok('LOAD PACK explains itself', /offline/i.test(s.packTitle), '"' + s.packTitle + '"');
    /* Marked, not disabled: tapping it offline should be able to say why, and
       the pack loader already falls back to the cached manifest so downloaded
       samples stay browsable. A disabled button could do neither. */
    t.ok('but is still clickable, so it can say why', !s.packDisabled);
    t.note('    it says: "' + s.lcd + '"');
    t.ok('the message says the instrument still works', /still work/i.test(s.lcd));

    t.head('AND IT IS READABLE AT EVERY PORTRAIT WIDTH');
    for (const w of [360, 390, 414, 430]) {
      await page.setViewportSize({ width: w, height: 844 });
      await page.waitForTimeout(150);
      /* The build line's width is set by how little room the transport leaves —
         on a 360px phone the whole left column is about 78px whether online or
         not. So the bar is not an absolute width, it is that showing the badge
         costs the build line nothing at that width. */
      await ctx.setOffline(false); await page.waitForTimeout(200);
      const onlineBuildW = await page.evaluate(() =>
        document.getElementById('build').getBoundingClientRect().width);
      await ctx.setOffline(true); await page.waitForTimeout(200);
      const m = await page.evaluate(() => {
        const pip = document.getElementById('offPip'), tr = document.getElementById('transport');
        const r = pip.getBoundingClientRect(), trr = tr.getBoundingClientRect();
        // is any pixel of the badge hidden by an ancestor's overflow?
        let el = pip.parentElement, cut = false;
        while (el && el !== document.body) {
          const er = el.getBoundingClientRect();
          if (getComputedStyle(el).overflow !== 'visible' &&
              (r.right > er.right + 0.5 || r.left < er.left - 0.5)) cut = true;
          el = el.parentElement;
        }
        return { px: parseFloat(getComputedStyle(pip).fontSize), cut,
          over: r.right > trr.left + 0.5,
          buildW: document.getElementById('build').getBoundingClientRect().width };
      });
      const kept = m.buildW >= onlineBuildW - 12;    // one row-gap of slack
      t.ok(w + 'px: badge whole at ' + m.px + 'px, build line ' + m.buildW.toFixed(0) +
        'px (was ' + onlineBuildW.toFixed(0) + ' online)',
        !m.cut && !m.over && m.px >= 10 && kept,
        m.cut ? 'CLIPPED by an ancestor' : m.over ? 'UNDER the transport' :
        m.px < 10 ? 'text only ' + m.px + 'px' :
        !kept ? 'the badge cost the build line ' + (onlineBuildW - m.buildW).toFixed(0) + 'px' : '');
    }
    await page.setViewportSize({ width: 430, height: 932 });

    t.head('AND THE INSTRUMENT STILL PLAYS WITH THE NETWORK DOWN');
    const still = await page.evaluate(async () => {
      const o = {};
      o.hasSound = S.pads.findIndex(x => x.bufId >= 0) >= 0;
      document.getElementById('bLoops').value = '1';
      document.getElementById('bSrc').value = 'pat';
      startSeq(); await new Promise(x => setTimeout(x, 1500));
      o.ran = playing && curStep > 0;
      stopSeq();
      const buf = await renderMix(null, null);      // the bounce, offline
      let pk = 0; const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
      o.peak = pk; o.secs = buf.length / buf.sampleRate;
      return o;
    });
    t.ok('sounds are loaded without a network', still.hasSound);
    t.ok('the sequencer runs', still.ran);
    t.ok('the bounce renders and is not silent', still.peak > 0.01,
      'peak ' + still.peak.toFixed(3) + ' over ' + still.secs.toFixed(2) + 's');

    /* ---- THE OFFLINE SHELL, WHICH WAS EMPTY --------------------------
       The suite above proves the instrument keeps PLAYING with the
       network cut. It never asked whether the app OPENS, and it did not:
       `cache.addAll()` is atomic, `'./'` 404s on any server without a
       directory index — including this harness — so the precache
       rejected, `install` failed, the worker never activated and the
       cache sat empty. The page swallowed it in `.catch(()=>{})`.

         cached   { "jbh88-shell-v5": [] }      rootStatus 404
         state    "none"    controlled false    reload  ERR_INTERNET_DISCONNECTED

       This harness IS the known-bad input, which is why the assertion
       belongs here: `'./'` still 404s below, and the shell has to
       populate anyway. */
    t.head('THE OFFLINE SHELL SURVIVES A MISSING ENTRY');
    await ctx.setOffline(false);
    const sw = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const reg = await navigator.serviceWorker.register('./sw.js');
      for (let i = 0; i < 80; i++) { await w(200); if (navigator.serviceWorker.controller) break; }
      const names = await caches.keys();
      const have = [];
      for (const n of names) have.push(...(await (await caches.open(n)).keys())
        .map(q => q.url.replace(location.origin, '')));
      let rootStatus = null;
      try { rootStatus = (await fetch('./', { cache: 'no-store' })).status; } catch (e) {}
      return { controlled: !!navigator.serviceWorker.controller,
        state: reg.active ? reg.active.state : 'none', names, have, rootStatus };
    });
    t.ok("the harness really does 404 './' — the entry that broke it",
      sw.rootStatus === 404, "'./' -> HTTP " + sw.rootStatus);
    t.ok('the worker activates anyway, instead of failing its install',
      sw.state === 'activated' && sw.controlled,
      sw.state + ' · controlled ' + sw.controlled);
    t.ok('AND THE SHELL IS POPULATED, not empty',
      sw.have.indexOf('/index.html') >= 0 && sw.have.length >= 7,
      sw.have.length + ' cached: ' + sw.have.join(' '));

    t.head('AND THE APP OPENS WITH THE NETWORK CUT');
    await ctx.setOffline(true);
    let reopened = null, reloadErr = null;
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      reopened = await page.evaluate(() => ({
        write: !!document.getElementById('mlOffer'),
        pads: !!document.getElementById('padgrid'),
        jbh: typeof window.JBH === 'object' }));
    } catch (e) { reloadErr = String(e && e.message || e).split('\n')[0]; }
    t.ok('it reloads from the cache rather than the network',
      !!reopened && reopened.jbh, reloadErr || JSON.stringify(reopened));
    t.ok('and the WRITE panel is there to use',
      !!reopened && reopened.write && reopened.pads, JSON.stringify(reopened));

    /* ---- AND WRITING REALLY WORKS, FROM COLD, WITH NO CONNECTION ----
       The presets are generated in code and the norms are baked
       constants, so every part of the WRITE path should run. Asserted
       rather than assumed, because "it ships no audio" is a claim about
       the sounds and says nothing about infill, ensemble or the five
       free checks. */
    t.head('THE WHOLE WRITE PATH RUNS WITH NO CONNECTION');
    const wrote = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const g = id => document.getElementById(id);
      const o = {};
      await window.JBH.clear();
      for (const [p, id, note] of [[0, 'bsub', 36], [1, 'pfelt', 60], [2, 'xbell', 72]]) {
        g('presetSel').value = id;
        g('presetSel').dispatchEvent(new Event('change'));
        g('presetNote').value = String(note);
        const before = S.buffers.length;
        S.editPad = p; S.seqPad = p;
        g('btnPresetLoad').click();
        for (let k = 0; k < 200; k++) { await w(100); if (S.buffers.length > before) break; }
        await w(100);
      }
      const live = S.pads.map((x, i) => ({ x, i })).filter(q => q.x.bufId >= 0).slice(0, 3);
      o.presets = live.length;
      const names = ['sub', 'keys', 'bell'];
      live.forEach((q, n) => window.JBH.pad(q.i,
        { inst: names[n], srcNote: q.x.srcNote != null ? q.x.srcNote : 36 + q.i }));
      window.JBH.key('F', 'dorian');
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Fm', 'Bb', 'Eb', 'Cm']);
      const vs = names.map((n, i) => ({ inst: n, role: i === 0 ? 'bass' : 'lead' }));
      const off = await window.JBH.ensemble(vs, { bars: 4, n: 3, src: 'pat', seed: 4242 });
      o.offered = off.candidates.length;
      o.wrote = (await window.JBH.ensemble(vs,
        { bars: 4, n: 3, src: 'pat', seed: 4242, apply: off.candidates[0].seed })).wrote;
      o.pulse = (await window.JBH.pulse({ src: 'pat' })).pulseStrength;
      o.melody = (await window.JBH.melody('sub', { src: 'pat' })).notes;
      o.harmony = ((await window.JBH.harmony({ src: 'pat' })).findings || []).length;
      const c = await window.JBH.counterpoint(['sub', 'keys'], { src: 'pat' });
      o.oblique = c.motion ? c.motion.oblique : null;
      /* THE PACK HAS TWO CORRECT OUTCOMES OFFLINE and the first draft of
         this assertion demanded the second one, so it failed on the
         better news: the worker caches every successful GET, so a
         manifest fetched earlier comes back from cache with no network
         and the pack simply WORKS. When nothing has been cached the call
         throws instead, and then the message has to name the presets.
         Asserting only the throw was asserting that the redundancy had
         not worked. */
      try {
        await window.JBH.pack('samples/salamander.json');
        o.packSounds = window.JBH.sounds().length;
      } catch (e) { o.packErr = String(e && e.message || e); }
      return o;
    });
    t.ok('three presets load with the network down',
      wrote.presets === 3, wrote.presets + ' pads');
    t.ok('OFFER and WRITE IT run — infill and ensemble need no connection',
      wrote.offered >= 2 && wrote.wrote > 0,
      wrote.offered + ' candidates, ' + wrote.wrote + ' notes written');
    t.ok('and all five free checks run off their baked norms',
      wrote.pulse != null && wrote.melody > 0 && wrote.harmony != null &&
      wrote.oblique != null,
      'pulse ' + wrote.pulse + ' · ' + wrote.melody + ' notes · harmony ' +
      wrote.harmony + ' findings · oblique ' + wrote.oblique);
    t.ok('A PACK EITHER COMES BACK FROM CACHE OR NAMES THE WAY ROUND IT',
      (wrote.packSounds > 0) || /presets need none/.test(wrote.packErr || ''),
      wrote.packSounds > 0
        ? 'served from cache with the network down — ' + wrote.packSounds + ' sounds'
        : 'refused: ' + (wrote.packErr || '').slice(0, 130));

    t.head('NETWORK BACK');
    await ctx.setOffline(false);
    await page.waitForTimeout(400);
    s = await read();
    t.ok('the badge clears', !s.pip);
    t.ok('LOAD PACK is undimmed', !s.packDim);
    t.ok('its original tooltip is restored', s.packTitle === onlineTitle,
      '"' + s.packTitle + '"');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
