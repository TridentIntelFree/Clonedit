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
