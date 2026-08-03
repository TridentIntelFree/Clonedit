/* THE AUDIO THREAD, AND WHETHER IT IS KEEPING UP.

   Reported as "a strange popping buzzing distortion that's not in relation to
   typical settings... kind of happens spontaneously", with a request for a
   filter in OUT that finds and removes it.

   Measuring first said there was nothing to filter. A full 61-second render of
   the demo song came back with peak 0.933, no sample at full scale, DC offset
   0.00007, and every sample-to-sample jump above 0.3 sitting exactly on a drum
   attack — which is what a drum attack IS at 44.1kHz. The offline path is
   clean, so whatever is being heard only exists live, and the only thing that
   is true live and not offline is a deadline.

   The cause was in this file's own capture worklet: it called .slice() twice
   per batch, on the AUDIO THREAD, twenty-three times a second, for as long as
   the app was open — the BLACK BOX starts with the audio and never stops.
   Allocation on a realtime thread invites the collector to run there, and a
   collection inside a 2.6ms deadline is a block that never gets computed. It
   comes out of the speaker as a click, at moments that have nothing to do with
   what you played. Exactly the report.

   So: buffers are recycled and nothing in process() allocates, the worklet
   counts blocks it missed, and OUT reports the count instead of pretending a
   filter could remove a gap in audio that was never computed.

   What is guarded here is that the capture still captures — the fix transfers
   buffers back and forth, and getting that wrong hands a consumer a detached
   array and silently ruins a take — and that the counter is honest in both
   directions. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('THE BOUNCE IS CLEAN — so there is nothing to filter out');
    const render = await page.evaluate(async () => {
      S.chainOn = false; S.songOn = false; S.human = 0;
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '2';
      const buf = await renderMix(null, null);
      if (!buf) return { none: true };
      const d = buf.getChannelData(0);
      let peak = 0, dc = 0, atFull = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        if (a >= 0.999) atFull++;
        dc += d[i];
      }
      return { peak, dc: dc / d.length, atFull, n: d.length, sr: buf.sampleRate };
    });
    t.note('    peak ' + render.peak.toFixed(4) + ' · DC ' + render.dc.toFixed(6) +
      ' · ' + render.atFull + ' samples at full scale');
    t.ok('the render never reaches full scale', render.atFull === 0 && render.peak < 0.999,
      render.peak.toFixed(4));
    t.ok('and carries no DC offset to speak of', Math.abs(render.dc) < 0.001,
      render.dc.toFixed(6));

    t.head('THE CAPTURE TAP STILL CAPTURES, WITH ITS BUFFERS RECYCLED');
    /* The risk the fix introduces: buffers are transferred to the main thread
       and transferred back. Hand a consumer one of those and it detaches under
       them — a take that records silence, or worse, garbage. */
    const cap = await page.evaluate(async () => {
      S.songOn = true; S.chainOn = false;
      startSeq();
      await new Promise(r => setTimeout(r, 4000));
      stopSeq();
      /* The ring holds everything since audio came up, which includes the quiet
         before PLAY was pressed. A hole means silence BETWEEN sounds, so the
         scan runs from the first sound to the last and ignores the lead-in —
         otherwise the test fails on the app working correctly. */
      let first = -1, last = -1, peak = 0;
      for (let i = 0; i < bbFilled; i++) {
        const a = Math.abs(bbL[i]);
        if (a > peak) peak = a;
        if (a > 1e-7) { if (first < 0) first = i; last = i; }
      }
      let nz = 0, longestZeroRun = 0, run = 0;
      for (let i = Math.max(0, first); i <= last; i++) {
        if (Math.abs(bbL[i]) > 1e-7) { nz++; run = 0; }
        else { run++; if (run > longestZeroRun) longestZeroRun = run; }
      }
      const span = Math.max(1, last - first + 1);
      return { worklet: !!(LIVE.bbSink && LIVE.bbSink.worklet), secs: span / AC.sampleRate,
        peak, nonSilent: nz / span, longestZeroRun, sr: AC.sampleRate };
    });
    t.note('    ' + cap.secs.toFixed(2) + 's of signal · peak ' + cap.peak.toFixed(3) +
      ' · ' + (cap.nonSilent * 100).toFixed(0) + '% non-silent · longest silent run ' +
      (cap.longestZeroRun / cap.sr * 1000).toFixed(1) + 'ms');
    t.ok('it is running on the audio thread, not the main one', cap.worklet);
    t.ok('and captured real audio, not a detached buffer', cap.peak > 0.05 && cap.nonSilent > 0.4,
      'peak ' + cap.peak.toFixed(3) + ', ' + (cap.nonSilent * 100).toFixed(0) + '% non-silent');
    /* A recycling mistake shows up as a whole batch of zeros — 2048 frames,
       about 43ms — dropped into the middle of the signal. */
    t.ok('with no batch-sized hole where a recycled buffer went wrong',
      cap.longestZeroRun < 2048, cap.longestZeroRun + ' zero samples in a row');

    t.head('THE COUNTER IS HONEST IN BOTH DIRECTIONS');
    const counter = await page.evaluate(async () => {
      document.querySelector('#tabs button[data-v="out"]').click();
      const read = () => ({ txt: document.getElementById('engHealth').textContent,
        cls: document.getElementById('engHealth').className,
        what: document.getElementById('engWhat').textContent });
      glitchReset(); drawEngine();
      const clean = read();
      /* Starting audio always costs a block or two — graph build, worklet load,
         context resume. Counting those means opening the panel red on a healthy
         phone, so nothing counts until the engine has settled. */
      glitchArm();
      glitchAdd(4800); drawEngine();
      const armed = read();
      await new Promise(r => setTimeout(r, 1700));
      glitchAdd(480); drawEngine();          // 10ms at 48k
      const one = read();
      for (let i = 0; i < 10; i++) glitchAdd(480);
      drawEngine();
      const many = read();
      startSeq(); stopSeq();                 // PLAY is the natural zero point
      drawEngine();
      const afterPlay = read();
      return { clean, armed, one, many, afterPlay };
    });
    t.ok('a healthy engine reads green', counter.clean.cls === 'engok' &&
      /no dropouts/.test(counter.clean.txt), counter.clean.txt);
    t.ok('and says a pop heard while green is coming from the mix',
      /coming from the mix/.test(counter.clean.what));
    t.ok('the startup cost is not counted', counter.armed.cls === 'engok', counter.armed.txt);
    t.note('    one dropout  → ' + counter.one.txt);
    t.note('    eleven       → ' + counter.many.txt);
    t.ok('a real dropout is counted once the engine has settled',
      counter.one.cls !== 'engok' && /1 dropout/.test(counter.one.txt), counter.one.txt);
    t.ok('and it escalates rather than staying at one shade',
      counter.many.cls === 'engbad' && counter.one.cls === 'engwarn',
      counter.one.cls + ' → ' + counter.many.cls);
    /* The whole point of the reading is telling two unrelated problems apart. */
    t.ok('it says plainly that no filter can remove a dropout',
      /no filter can remove it/.test(counter.many.what) ||
      /<b>no filter can remove it<\/b>/.test(counter.many.what),
      counter.many.what.slice(0, 90));
    t.ok('and that the bounce is unaffected', /bounce is unaffected/.test(counter.many.what));
    t.ok('PLAY resets it, so the reading is always about what you just heard',
      counter.afterPlay.cls === 'engok', counter.afterPlay.txt);

    t.head('THE ONE THING THAT RUNS CONSTANTLY CAN BE TURNED OFF');
    const bb = await page.evaluate(async () => {
      const btn = document.getElementById('btnBBOn');
      const before = { on: !!bbTap, label: btn.textContent };
      btn.click();
      const off = { on: !!bbTap, label: btn.textContent, said: document.getElementById('lcdmsg').textContent };
      btn.click();
      const back = { on: !!bbTap, label: btn.textContent };
      // and it still records after being cycled
      startSeq();
      await new Promise(r => setTimeout(r, 2000));
      stopSeq();
      let peak = 0;
      for (let i = 0; i < bbFilled; i++) { const a = Math.abs(bbL[i]); if (a > peak) peak = a; }
      return { before, off, back, recaptured: { secs: bbFilled / AC.sampleRate, peak } };
    });
    t.ok('it starts on', bb.before.on && bb.before.label === 'ON');
    t.ok('and can be stopped', !bb.off.on && bb.off.label === 'OFF');
    t.ok('saying what that costs you', /KEEP will have nothing/.test(bb.off.said),
      bb.off.said.slice(0, 80));
    t.ok('and turned back on', bb.back.on && bb.back.label === 'ON');
    t.ok('after which it records again', bb.recaptured.peak > 0.05 && bb.recaptured.secs > 1,
      bb.recaptured.secs.toFixed(2) + 's, peak ' + bb.recaptured.peak.toFixed(3));

    t.head('STOP STOPS THE ECHO, NOT JUST THE SOURCES');
    /* "Something happened and it just kept playing an echo. It happened while I
       was messing with delay, it played a sample over and over, couldn't stop
       it." The diagnostic they sent explained it exactly: 1.8s of delay at 0.85
       feedback, from a project sitting at 12.5 BPM. Each repeat is 85% of the
       one before, so it takes about forty to fall 60dB — over a minute — and
       STOP did nothing, because panicVoices only killed SOURCES. Nothing was
       playing the echo; the delay line was regenerating it from its own output.
       Reproduced at those exact settings. */
    const echo = await page.evaluate(async () => {
      /* An earlier section ends with stopSeq(), and stopSeq now ducks the delay
         send for 2.1s while the line drains. Starting the echo inside that
         window measures the fix rather than the bug. */
      await new Promise(r => setTimeout(r, 2300));
      setBpm(12.5); S.delayDiv = 0.375; S.delayFb = 0.85;
      LIVE.dlyFb.gain.value = 0.85;
      if (LIVE.dlyFb2) LIVE.dlyFb2.gain.value = 0.85;
      liveDelaySync();
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      S.pads[pad].dly = 1; S.pads[pad].gain = 1;
      const n = LIVE.pads[pad];
      n.dly.gain.value = 1; n.ch.gain.value = 1;
      S.mTrim = 0; LIVE.mTrim.gain.value = 1;
      const an = AC.createAnalyser(); an.fftSize = 2048;
      LIVE.softclip.connect(an);
      const b = new Float32Array(an.fftSize);
      const level = () => { an.getFloatTimeDomainData(b); let p = 0;
        for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; } return p; };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      triggerPad(AC, LIVE, pad, 1, AC.currentTime + 0.02, chokeLive);
      await wait(500);
      const dry = level();
      await wait(1800); const echo1 = level();      // one delay time later
      await wait(1800); const echo2 = level();      // and again, barely decayed
      stopSeq();
      await wait(400);  const afterStop = level();
      await wait(1600); const later = level();
      await wait(1600);                              // past the 2.1s restore
      return { delaySecs: delayTime(), dry, echo1, echo2, afterStop, later,
        restored: { fb: +LIVE.dlyFb.gain.value.toFixed(2),
          dlyIn: +LIVE.dlyIn.gain.value.toFixed(2),
          revRet: +LIVE.revRet.gain.value.toFixed(2) } };
    });
    t.note('    delay ' + echo.delaySecs.toFixed(2) + 's · dry ' + echo.dry.toFixed(4) +
      ' → +1.8s ' + echo.echo1.toFixed(4) + ' → +3.6s ' + echo.echo2.toFixed(4));
    t.note('    after STOP ' + echo.afterStop.toFixed(5) + ' → +1.6s ' + echo.later.toFixed(5));
    t.ok('the reported settings really do build a 1.8s line',
      Math.abs(echo.delaySecs - 1.8) < 0.01, echo.delaySecs.toFixed(3) + 's');
    /* The runaway itself: one hit is still most of its original level several
       seconds later, with nothing playing it. */
    t.ok('one hit is still ringing 3.6s later', echo.echo2 > echo.dry * 0.4,
      (echo.echo2 / echo.dry * 100).toFixed(0) + '% of the original');
    t.ok('STOP silences it', echo.afterStop < echo.echo2 * 0.05,
      echo.afterStop.toFixed(5) + ' vs ' + echo.echo2.toFixed(4));
    t.ok('and it stays silent rather than creeping back', echo.later < echo.echo2 * 0.05,
      echo.later.toFixed(5));
    /* And the settings come back, or STOP would quietly cost you your effects. */
    t.ok('the feedback, send and reverb return are restored afterwards',
      echo.restored.fb === 0.85 && echo.restored.dlyIn === 1 && echo.restored.revRet > 0,
      JSON.stringify(echo.restored));

    t.head('AND THE PANEL SAYS HOW LONG IT WILL RING BEFORE YOU BUILD ONE');
    const ring = await page.evaluate(() => {
      document.querySelector('#tabs button[data-v="mix"]').click();
      const read = (bpm, div, fb) => { setBpm(bpm); S.delayDiv = div; S.delayFb = fb;
        drawDlyRing(); return document.getElementById('dlyRing').textContent; };
      return { mild: read(120, 0.375, 0.35), heavy: read(120, 0.375, 0.85),
        reported: read(12.5, 0.375, 0.85), off: read(120, 0.375, 0) };
    });
    t.note('    ' + ring.mild);
    t.note('    ' + ring.reported);
    t.ok('an ordinary setting reads as a short tail', /about <?b?[^>]*>?1s|about 1s/.test(ring.mild),
      ring.mild);
    t.ok('the reported session reads as over a minute', /77s|7\ds/.test(ring.reported), ring.reported);
    t.ok('and names the tempo as the reason it is that long',
      /12\.5 BPM/.test(ring.reported), ring.reported);
    t.ok('a long tail also says STOP will silence it', /STOP silences it/.test(ring.reported));
    t.ok('and a short one does not nag about it', !/STOP silences it/.test(ring.mild));
    t.ok('zero feedback reads as no ring at all', /nothing/.test(ring.off), ring.off);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
