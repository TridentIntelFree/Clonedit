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
    /* "At least the one we injected". Asserting exactly one made this fail the
       day the demo song got heavier and the machine dropped a real block during
       the test — which is the counter doing its job, not a regression. */
    t.ok('a real dropout is counted once the engine has settled',
      counter.one.cls !== 'engok' && /dropout/.test(counter.one.txt), counter.one.txt);
    t.ok('and it escalates rather than staying at one shade',
      counter.many.cls === 'engbad' && counter.one.cls !== 'engbad',
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

    t.head('AND THE DRAIN NEVER EATS THE NEXT THING YOU PLAY');
    /* R154 hung the drain off panicVoices, which CLR PTN and loading a project
       also call — so clearing a pattern mid-song ducked the sends for two
       seconds and let them swell back in underneath the music, and pressing PLAY
       within 2.1s of STOP started the song with no effects at all. Reported as
       "my playback is messed up, it has a distortion that's not from effects".
       The drain belongs to STOP; PLAY cancels it outright. */
    const drain = await page.evaluate(async () => {
      const g = () => ({ fb: +LIVE.dlyFb.gain.value.toFixed(3),
        dlyIn: +LIVE.dlyIn.gain.value.toFixed(3),
        revIn: +LIVE.revIn.gain.value.toFixed(3),
        revRet: +LIVE.revRet.gain.value.toFixed(3) });
      const wait = ms => new Promise(r => setTimeout(r, ms));
      S.delayFb = 0.5; LIVE.dlyFb.gain.value = 0.5;
      startSeq(); await wait(300);
      const playing1 = g();
      stopSeq(); await wait(120);
      const drained = g();
      startSeq(); await wait(120);            // PLAY well inside the 2.1s window
      const replay = g();
      await wait(2300);                       // the old timer would have fired by now
      const stillGood = g();
      stopSeq(); await wait(2400);
      // CLR PTN must not drain anything — it is not a transport action
      startSeq(); await wait(200);
      document.getElementById('btnPatClr').click();
      await wait(150);
      const afterClr = g();
      stopSeq();
      return { playing1, drained, replay, stillGood, afterClr };
    });
    t.note('    playing ' + JSON.stringify(drain.playing1));
    t.note('    drained ' + JSON.stringify(drain.drained));
    t.note('    replay  ' + JSON.stringify(drain.replay));
    t.ok('STOP does duck the sends', drain.drained.dlyIn < 0.2 && drain.drained.fb < 0.2,
      JSON.stringify(drain.drained));
    t.ok('PLAY restores them at once, not two seconds later',
      drain.replay.dlyIn > 0.9 && drain.replay.revIn > 0.9 &&
      Math.abs(drain.replay.fb - 0.5) < 0.01, JSON.stringify(drain.replay));
    t.ok('and the cancelled timer cannot fire underneath the music',
      drain.stillGood.dlyIn > 0.9 && Math.abs(drain.stillGood.fb - 0.5) < 0.01,
      JSON.stringify(drain.stillGood));
    /* Clearing a pattern kills voices, which is right, but it is not STOP. */
    t.ok('CLR PTN mid-song leaves the effects alone',
      drain.afterClr.dlyIn > 0.9 && drain.afterClr.revIn > 0.9 &&
      Math.abs(drain.afterClr.fb - 0.5) < 0.01, JSON.stringify(drain.afterClr));

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

    t.head('DIAG SAYS WHETHER THERE IS ANY AUDIO, AND CAN BE COPIED');
    /* A silence report arrived with a DIAG that looked perfect: context
       running, gates open, pad unmuted, nothing dangling. It looked perfect
       because nothing in it said whether the one buffer held sound — it did
       not. A dump that cannot tell "healthy and playing nothing" from "healthy
       and holding silence" points everyone at the graph, which was the one
       part that was fine. */
    const diag = await page.evaluate(async () => {
      S.buffers.length = 0;
      S.pads.forEach(p => { p.bufId = -1; });
      S.trax.forEach(t => { t.bufId = -1; });
      const quiet = AC.createBuffer(2, AC.sampleRate, AC.sampleRate);
      const loud = AC.createBuffer(2, AC.sampleRate, AC.sampleRate);
      const d0 = loud.getChannelData(0);
      for (let i = 0; i < d0.length; i++) d0[i] = 0.6 * Math.sin(i / 20);
      S.buffers.push(quiet, loud);
      S.pads[0].bufId = 0; S.editPad = 0;
      S.pads[1].bufId = 1;
      S.trax[0].bufId = 0;
      document.getElementById('btnDiag').click();
      const text = document.getElementById('docText').value;
      const line = re => text.split('\n').find(l => re.test(l)) || '';
      const o = { peaks: line(/buffer peaks:/), lanes: line(/^lanes:/) };
      document.getElementById('btnDiagCopy').click();
      await new Promise(r => setTimeout(r, 400));
      o.copyLcd = document.getElementById('lcdmsg').textContent;
      o.boxHasIt = /buffer peaks:/.test(document.getElementById('docText').value);
      return o;
    });
    t.ok('a silent buffer is named as SILENT, with what it is loaded on',
      /0\(A01\/T1\):SILENT/.test(diag.peaks), diag.peaks);
    t.ok('and one with audio in it reports its peak instead',
      /1\(A02\):0\.\d/.test(diag.peaks));
    t.ok('the lane line names the source and any open input',
      /source \w+/.test(diag.lanes) && /inputs open:/.test(diag.lanes), diag.lanes);
    t.ok('COPY puts the report on the clipboard, or says why it could not',
      /COPIED|CLIPBOARD/i.test(diag.copyLcd), '"' + diag.copyLcd + '"');
    t.ok('and the report is in the text box either way', diag.boxHasIt);

    t.head('MOVING A PAD EFFECT DOES NOT COST THE AUDIO THREAD');
    /* Reported: "when I mess with settings (up or down) on my pads effects it
       wrecks them timing wise, distorts in a strange way". Both symptoms came
       from the cost of the move, not the setting. Every input event rebuilt a
       1024-float drive curve and a 2048-float crush curve — 12KB of garbage
       per event — and handed both to a WaveShaperNode. A garbage collector
       running under a real-time thread is heard as dropouts, and a dropout
       inside a note is heard as distortion.
       The anti-click dip made it worse: it ramped the FX gain to silence and
       used a 6ms setTimeout to bring it back, so on a drag the ramps overlap
       and cancel each other — amplitude modulation at the rate of your finger,
       and a pad that can be left sitting silent. */
    const fx = await page.evaluate(async () => {
      const o = {}, p = S.pads[0], n = LIVE.pads[0];
      o.sameValueSameObject = makeDriveCurve(0.5) === makeDriveCurve(0.5)
        && makeCrushCurve(8) === makeCrushCurve(8);
      const first = makeDriveCurve(0.37);
      for (let i = 0; i < 200; i++) makeDriveCurve(0.37);
      o.neverRebuilt = makeDriveCurve(0.37) === first;

      // repeated identical settings must stop at the node
      const proto = Object.getPrototypeOf(n.drv);
      const desc = Object.getOwnPropertyDescriptor(proto, 'curve');
      let writes = 0;
      Object.defineProperty(n.drv, 'curve', { configurable: true,
        get() { return desc.get.call(this); },
        set(v) { writes++; desc.set.call(this, v); } });
      p.drv = 0.5; applyPadFx(n, p, AC, false); writes = 0;
      for (let i = 0; i < 50; i++) applyPadFx(n, p, AC, false);
      o.writesForFiftyIdenticalCalls = writes;

      // an abrupt drag must move the gain twice per burst and end up back at 1
      p.drv = 0; applyPadFx(n, p, AC, false);
      const g = n.fxg.gain, realRamp = g.linearRampToValueAtTime.bind(g);
      let ramps = 0;
      g.linearRampToValueAtTime = (v, t) => { ramps++; return realRamp(v, t); };
      for (let i = 0; i < 20; i++) {
        p.drv = i % 2 ? 0.95 : 0.05;          // every step abrupt, faster than the dip
        applyPadFx(n, p, AC, true);
        await new Promise(r => setTimeout(r, 2));
      }
      await new Promise(r => setTimeout(r, 400));
      o.rampsForTwentyAbruptChanges = ramps;
      o.gainRecovered = g.value;
      o.nothingPending = !n._fxPend;
      o.landedOnLastValue = n._drvCurve === makeDriveCurve(p.drv);

      // and the whole thing under a running transport
      glitchReset();
      startSeq();
      for (let i = 0; i <= 120; i++) { p.drv = (i % 101) / 100;
        applyPadFx(n, p, AC, true); await new Promise(r => setTimeout(r, 5)); }
      await new Promise(r => setTimeout(r, 2200));
      o.glitchMs = glitchMs();
      stopSeq();
      p.drv = 0; applyPadFx(n, p, AC, false);
      return o;
    });
    t.ok('the same setting returns the same cached curve, never rebuilt',
      fx.sameValueSameObject && fx.neverRebuilt);
    t.ok('fifty identical calls reach the WaveShaper once, not fifty times',
      fx.writesForFiftyIdenticalCalls <= 1, fx.writesForFiftyIdenticalCalls + ' assignments');
    t.ok('twenty abrupt changes duck the gain per burst, not per event',
      fx.rampsForTwentyAbruptChanges <= 24,
      fx.rampsForTwentyAbruptChanges + ' ramps (uncoalesced would be 40)');
    t.ok('AND THE GAIN COMES BACK — a drag cannot leave the pad silent',
      Math.abs(fx.gainRecovered - 1) < 0.01 && fx.nothingPending,
      'gain ' + fx.gainRecovered.toFixed(4));
    t.ok('the last value you chose is the one that lands', fx.landedOnLastValue);
    t.ok('and a 120-event drag while playing costs no dropouts',
      fx.glitchMs < 20, fx.glitchMs.toFixed(1) + 'ms lost');

    t.head('WARP RESET CANNOT RESTORE A SAMPLE THE PAD NO LONGER HAS');
    /* "If you warp a pad, then later reuse that same slot for a chopped slice
       from a different sample, pressing WARP RESET on it silently destroys the
       newly-assigned audio and replaces it with the old, unrelated pre-warp
       buffer — with a message ('original restored') that's actively misleading
       about what just happened."

       warpOrig[i] is a restore point for the audio that was warped. The moment
       something else lands on that pad the restore point is for a sample that
       is not there, and offering it is worse than having none: the message says
       "original" about audio the pad never held. Three editor paths wrote
       p.bufId without dropping it — ASSIGN, TRIM and NORMALIZE — so all three
       are checked, along with the rest of the pad-replacement contract ASSIGN
       was skipping. */
    const warp = await page.evaluate(async () => {
      const o = {};
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const sig = b => { const d = b.getChannelData(0); let s = 0;
        for (let i = 0; i < d.length; i += 97) s += Math.abs(d[i]); return +(s / d.length).toFixed(8); };
      const tone = (hz, sec) => { const b = AC.createBuffer(1, Math.round(AC.sampleRate * sec), AC.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * hz * i / AC.sampleRate) * 0.8;
        S.buffers.push(b); return S.buffers.length - 1; };

      document.querySelector('#tabs button[data-v="smpl"]').click();
      const PAD = 3;

      /* Warp pad 3, holding sample A. */
      S.editPad = PAD;
      const A = tone(220, 1.7);
      S.pads[PAD].bufId = A; S.pads[PAD].warped = false; delete warpOrig[PAD];
      workBuf = S.buffers[A];
      drawEdit(); drawWave();
      document.getElementById('epWarp').click();
      await wait(200);
      o.warped = S.pads[PAD].warped === true && !!warpOrig[PAD];
      o.origSig = sig(warpOrig[PAD] || S.buffers[S.pads[PAD].bufId]);

      /* Now put an unrelated sample in the editor, chop it, and ASSIGN from
         pad 3 — the exact sequence reported. Give the pad some voicing first,
         so the rest of the replacement contract is measurable too. */
      const B = tone(1500, 1.4);
      workBuf = S.buffers[B]; slices = []; selSlice = -1;
      Object.assign(S.pads[PAD], { reverse: true, speed: 0.5, fcut: 400, ftype: 'lowpass' });
      document.getElementById('chopN').value = '4';
      document.getElementById('btnEqual').click();
      document.getElementById('assignFrom').value = String(PAD);
      document.getElementById('btnAssign').click();
      await wait(120);
      const assigned = S.pads[PAD].bufId;
      o.assignedSig = sig(S.buffers[assigned]);
      o.assignLcd = document.getElementById('lcdmsg').textContent;
      o.stillWarped = S.pads[PAD].warped;
      o.voicing = { reverse: S.pads[PAD].reverse, speed: S.pads[PAD].speed, fcut: S.pads[PAD].fcut };

      /* THE PRESS THAT USED TO EAT THE CHOP. */
      document.getElementById('epWarpReset').click();
      await wait(120);
      o.afterResetSig = sig(S.buffers[S.pads[PAD].bufId]);
      o.resetLcd = document.getElementById('lcdmsg').textContent;
      o.chopSurvived = o.afterResetSig === o.assignedSig;

      /* TRIM and NORMALIZE stand on the same ground: both leave the pad holding
         audio the stored original is not a copy of. */
      const check = async (btn, prep) => {
        S.editPad = PAD;
        const id = tone(330, 1.6);
        S.pads[PAD].bufId = id; S.pads[PAD].warped = false; delete warpOrig[PAD];
        workBuf = S.buffers[id]; drawEdit(); drawWave();
        document.getElementById('epWarp').click(); await wait(200);
        if (prep) prep();
        document.getElementById(btn).click(); await wait(120);
        const edited = sig(S.buffers[S.pads[PAD].bufId]);
        document.getElementById('epWarpReset').click(); await wait(120);
        return { held: sig(S.buffers[S.pads[PAD].bufId]) === edited,
          said: document.getElementById('lcdmsg').textContent };
      };
      /* TRIM needs silence to remove; the warped tone has none, so pad the tail. */
      o.trim = await check('btnTrim', () => {
        const d = workBuf.getChannelData(0);
        for (let i = Math.floor(d.length * 0.6); i < d.length; i++) d[i] = 0;
      });
      o.norm = await check('btnNorm');
      return o;
    });
    t.ok('a pad warps and keeps a pre-warp original to go back to', warp.warped);
    t.ok('ASSIGN puts the chopped slice on the pad', warp.assignedSig !== warp.origSig);
    t.ok('AND WARP RESET NO LONGER SWAPS IT FOR THE OLD SAMPLE', warp.chopSurvived,
      'signature ' + warp.afterResetSig + ' vs chop ' + warp.assignedSig
      + ' / pre-warp ' + warp.origSig);
    t.ok('it says there is nothing to reset, which is the truth',
      /nothing to reset/i.test(warp.resetLcd), '"' + warp.resetLcd + '"');
    t.ok('ASSIGN also clears the warp flag it invalidated', warp.stillWarped === false);
    t.ok('AND THE LAST SOUND’S VOICING, like every other way onto a pad',
      warp.voicing.reverse === false && warp.voicing.speed === 1 && warp.voicing.fcut !== 400,
      JSON.stringify(warp.voicing));
    t.ok('and it says what it cleared', /cleared the old/.test(warp.assignLcd),
      '"' + warp.assignLcd + '"');
    t.ok('TRIM SILENCE survives a WARP RESET too', warp.trim.held, '"' + warp.trim.said + '"');
    t.ok('and so does NORMALIZE', warp.norm.held, '"' + warp.norm.said + '"');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
