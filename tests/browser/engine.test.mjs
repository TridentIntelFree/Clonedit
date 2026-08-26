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

    t.head('THE FILTER MOVES ON EVERY HIT, NOT JUST WHERE YOU LEFT IT');
    /* "Why do I feel limited with the quality of the sounds I can create? It
       doesn't feel like a full palette."

       Because the cutoff was a number. It sat where you put it and the only
       thing that ever moved it was a free-running LFO, so a pad could be bright
       or dark but never a pluck, a wow, or a note that opens as it lands.

       What is measured is the sound, not the parameter: a filter envelope that
       automates an AudioParam nobody can hear is worth nothing. So this reads
       the SPECTRAL CENTROID of the pad's own output over the length of a hit —
       where the energy sits — and asks whether it travels. The static case is
       measured alongside as the control, because "the centroid moved" only
       means something next to a case where it does not. */
    const feg = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(200);
      const PAD = 5;
      const keep = JSON.parse(JSON.stringify(S.pads[PAD]));
      /* Broadband noise, so a filter anywhere in the band has something to
         take away and the centroid can travel across most of the spectrum. */
      /* mulberry32, the app's own generator, rather than a hand-rolled LCG:
         s * 1103515245 leaves the 53-bit safe range as soon as s is large, so
         the low bits are lost and the sequence degenerates into a short cycle.
         It is not noise, it is a tone — and the first version of this test
         measured a centroid pinned at 12kHz whatever the filter was doing. */
      const n = Math.round(AC.sampleRate * 1.1);
      const b = AC.createBuffer(2, n, AC.sampleRate);
      const rnd = mulberry32(9137);
      for (let i = 0; i < n; i++) { const v = (rnd() * 2 - 1) * 0.6;
        b.getChannelData(0)[i] = v; b.getChannelData(1)[i] = v; }
      S.buffers.push(b);
      S.pads[PAD] = newPad(PAD); const p = S.pads[PAD];
      p.bufId = S.buffers.length - 1; p.gain = 0.9; p.att = 0.001; p.rel = 0.05;
      p.ftype = 'lowpass'; p.fcut = 0.18; p.fres = 2;
      S.editPad = PAD; liveFx();

      const an = AC.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      LIVE.pads[PAD].mute.connect(an);
      const bins = new Float32Array(an.frequencyBinCount);
      const hzPer = (AC.sampleRate / 2) / bins.length;
      /* Weighted by amplitude, but only over bins that carry signal. Counting
         every bin lets a thousand cells sitting on the analyser's -100dB floor
         outvote the fifty that have the sound in them, and the centroid parks
         near the middle of the spectrum whatever the filter does — which is
         exactly what the first version of this measured. */
      const centroid = () => { an.getFloatFrequencyData(bins);
        let top = -Infinity;
        for (let i = 1; i < bins.length; i++) if (bins[i] > top) top = bins[i];
        if (!isFinite(top) || top < -95) return 0;
        let num = 0, den = 0;
        for (let i = 1; i < bins.length; i++) {
          if (bins[i] < top - 45) continue;
          const a = Math.pow(10, bins[i] / 20);
          num += a * i * hzPer; den += a; }
        return den > 0 ? Math.round(num / den) : 0; };
      const flt = LIVE.pads[PAD].flt;
      /* Only while the note is actually sounding. Once the amp envelope has let
         go there is nothing but the floor left, and the centroid of a floor is
         meaningless — it was reading 2kHz of "movement" out of the silence
         after a static hit. */
      const td = new Float32Array(an.fftSize);
      const loud = () => { an.getFloatTimeDomainData(td); let s = 0;
        for (let i = 0; i < td.length; i++) s += td[i] * td[i];
        return Math.sqrt(s / td.length) > 0.01; };
      const run = async () => { const c = [], d = [];
        for (let k = 0; k < 16; k++) { const on = loud(), v = centroid();
          if (on && v > 0) { c.push(v); d.push(Math.round(flt.detune.value)); }
          await wait(35); }
        return { c, d, n: c.length, lo: Math.min(...c), hi: Math.max(...c) }; };

      /* One throwaway hit and a settle first. applyPadFx ramps the cutoff with
         a time constant and ducks the channel for 4ms around a type change, so
         a measurement taken the instant after switching the filter on catches
         the filter still travelling — which reads as the static control moving
         further than the envelope does. */
      p.fegAmt = 0; liveFx();
      hitLive(PAD, 1); await wait(700);
      hitLive(PAD, 1); o.still = await run(); await wait(500);

      p.fegAmt = 0.9; p.fegA = 0.004; p.fegD = 0.5; p.fegS = 0; p.fegR = 0.1;
      liveFx();
      hitLive(PAD, 1); o.up = await run(); await wait(500);

      p.fegAmt = -0.9; p.fcut = 0.62; liveFx();
      hitLive(PAD, 1); o.down = await run(); await wait(500);
      p.fcut = 0.18;

      /* The cutoff LFO writes to the SAME detune. An AudioParam sums its
         automation with what is connected to it, so both must survive together
         — the envelope was put on the intrinsic value precisely so the LFO did
         not have to move or be given up. */
      p.fegAmt = 0.9; p.lfoOn = true; p.lfoTgt = 'cutoff'; p.lfoSync = 'free';
      p.lfoRate = 9; p.lfoDepth = 0.6; liveFx();
      hitLive(PAD, 1); const both = await run();
      /* Measured in the sound, not in the parameter: AudioParam.value reports
         the intrinsic automation only and never includes what is connected to
         it, so the LFO's contribution is invisible from JS by construction. */
      o.lfoRides = { swept: both.hi - both.lo > 400,
        wobbles: (() => { let turns = 0;
          for (let i = 2; i < both.c.length; i++) {
            const a = both.c[i - 1] - both.c[i - 2], c2 = both.c[i] - both.c[i - 1];
            if ((a > 0) !== (c2 > 0)) turns++; }
          return turns >= 3; })(), cen: both.c };
      p.lfoOn = false; liveFx(); await wait(400);

      /* Raising AMOUNT with the filter switched off modulates nothing. */
      p.fegAmt = 0; p.ftype = 'off'; liveFx(); drawEdit();
      const amt = document.getElementById('epFegAmt');
      amt.value = '0.7'; amt.dispatchEvent(new Event('input', { bubbles: true }));
      o.trap = { ftype: S.pads[PAD].ftype, said: document.getElementById('lcdmsg').textContent };

      /* And with no amount at all, the detune must be left at rest — a pad
         whose envelope was just turned off cannot keep the last sweep. */
      p.fegAmt = 0; p.ftype = 'lowpass'; liveFx();
      hitLive(PAD, 1); await wait(300);
      o.restsAtZero = Math.abs(flt.detune.value) < 1;

      /* IT HAS TO BOUNCE. triggerPad is handed its ctx and graph, so the same
         code runs offline — but that is a claim, and this is a file. */
      p.fegAmt = 0.9; p.fegD = 0.5; p.ftype = 'lowpass'; p.fcut = 0.18;
      S.patterns[S.pattern].steps.forEach(row => row.fill(0));
      S.patterns[S.pattern].steps[PAD][0] = 1;
      /* Zero crossings per second, not a hand-rolled DFT. For noise through a
         lowpass the rate tracks the cutoff directly, it needs no windowing, and
         it cannot be quietly wrong the way a strided transform can — the first
         version of this decimated by 4 inside the sum and returned sampleRate/4
         for every input it was given. */
      const bounceZcr = async amtVal => {
        S.pads[PAD].fegAmt = amtVal;
        const r = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
        const d = r.getChannelData(0);
        const seg = (t0, t1) => { const a = Math.round(r.sampleRate * t0),
          b2 = Math.min(d.length - 1, Math.round(r.sampleRate * t1));
          let z = 0; for (let i = a + 1; i <= b2; i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++;
          return Math.round(z / ((b2 - a) / r.sampleRate)); };
        return { early: seg(0.08, 0.16), late: seg(0.40, 0.50), n: d.length };
      };
      o.bounceSwept = await bounceZcr(0.9);
      o.bounceStill = await bounceZcr(0);

      /* PLAYING HARDER HAS TO CHANGE THE SOUND, NOT ONLY THE LEVEL.
         The centroid is level-independent by construction — it says WHERE the
         energy is, not how much — so a difference in it between a soft hit and
         a hard one is a difference in timbre and cannot be the volume. */
      S.pads[PAD] = newPad(PAD); const q = S.pads[PAD];
      q.bufId = S.buffers.length - 1; q.gain = 0.9; q.att = 0.002; q.rel = 0.05;
      q.ftype = 'lowpass'; q.fcut = 0.14; q.fres = 2; q.fegAmt = 0;
      S.editPad = PAD; liveFx();
      hitLive(PAD, 1); await wait(700);

      const atVel = async v => { hitLive(PAD, v); await wait(120);
        const r2 = await run(); return r2.n ? Math.round(r2.c.reduce((a, x) => a + x, 0) / r2.n) : 0; };

      q.velFlt = 0; liveFx(); await wait(200);
      o.velOff = { soft: await atVel(0.2), hard: await atVel(1.0) };
      q.velFlt = 0.9; liveFx(); await wait(200);
      o.velOn = { soft: await atVel(0.2), hard: await atVel(1.0) };

      /* VEL→ENV scales the sweep rather than the cutoff, so the thing that
         changes is how FAR the filter travels on the note, not where it sits. */
      q.velFlt = 0; q.fegAmt = 0.9; q.fegA = 0.004; q.fegD = 0.5; q.fegS = 0;
      q.velEnv = 1; liveFx(); await wait(200);
      /* Travel is read acoustically AND off the parameter. The acoustic figure
         is the one that matters, but it is not fair between velocities on its
         own: a soft hit falls under the level gate sooner, so fewer frames of
         its sweep are seen and it measures short even when the automation is
         identical. The peak detune says what was actually scheduled. */
      const travel = async v => { hitLive(PAD, v); await wait(80);
        let top = 0; const t0 = performance.now();
        const poll = setInterval(() => { const a = Math.abs(flt.detune.value);
          if (a > top) top = a; }, 8);
        const r2 = await run(); clearInterval(poll); void t0;
        return { heard: r2.n ? r2.hi - r2.lo : 0, peakDet: Math.round(top) }; };
      o.envTravel = { soft: await travel(0.2), hard: await travel(1.0) };
      q.velEnv = 0; liveFx(); await wait(200);
      o.envTravelFlat = { soft: await travel(0.2), hard: await travel(1.0) };

      /* Same trap as the envelope: velocity cannot open a filter that is off. */
      q.velFlt = 0; q.fegAmt = 0; q.ftype = 'off'; liveFx(); drawEdit();
      const vf = document.getElementById('epVelFlt');
      vf.value = '0.8'; vf.dispatchEvent(new Event('input', { bubbles: true }));
      o.velTrap = { ftype: S.pads[PAD].ftype, said: document.getElementById('lcdmsg').textContent };

      /* The four voices that exist only because of this. Each must actually
         set an amount — a preset table is easy to add a name to and easy to
         forget to wire — and choosing a static voice afterwards has to clear
         it, or the last envelope haunts the next sound. */
      S.pads[PAD] = newPad(PAD); S.pads[PAD].bufId = S.buffers.length - 1;
      o.voices = {};
      for (const id of ['zap', 'acid', 'bloom', 'shut', 'touch', 'pluck', 'bell', 'organ']) {
        applyPadVoice(id);
        o.voices[id] = { amt: S.pads[PAD].fegAmt, ftype: S.pads[PAD].ftype,
          vel: S.pads[PAD].velFlt, venv: S.pads[PAD].velEnv,
          sus: S.pads[PAD].sus, dec: S.pads[PAD].dec,
          shownAmt: document.getElementById('epFegAmtV').textContent };
      }
      applyPadVoice('clean');
      o.cleanClears = S.pads[PAD].fegAmt === 0 && S.pads[PAD].velFlt === 0
        && S.pads[PAD].velEnv === 0;

      S.pads[PAD] = keep; liveFx();
      return o;
    });
    t.ok('a static filter keeps the sound in one place — the control',
      feg.still.n >= 4 && feg.still.hi - feg.still.lo < 400,
      'centroid moved ' + (feg.still.hi - feg.still.lo) + ' Hz across '
      + feg.still.n + ' frames of the hit');
    t.ok('AN ENVELOPE OPENING UPWARD ACTUALLY SWEEPS THE SOUND',
      feg.up.hi - feg.up.lo > 600,
      'centroid travelled ' + (feg.up.hi - feg.up.lo) + ' Hz (' + feg.up.lo + '→' + feg.up.hi + ')');
    t.ok('and it starts open and closes, not the other way round',
      feg.up.c[1] > feg.up.c[feg.up.c.length - 1],
      feg.up.c.slice(0, 8).join(' → '));
    t.ok('a negative amount closes downward instead',
      feg.down.d.some(v => v < -1000) && feg.down.hi - feg.down.lo > 400,
      'detune reached ' + Math.min(...feg.down.d) + ' cents');
    t.ok('THE CUTOFF LFO STILL RIDES ON TOP OF THE ENVELOPE',
      feg.lfoRides.swept && feg.lfoRides.wobbles,
      'centroid: ' + feg.lfoRides.cen.slice(0, 8).join(' '));
    t.ok('raising AMOUNT with no filter opens one rather than doing nothing',
      feg.trap.ftype === 'lowpass' && /FILTER . LP/.test(feg.trap.said),
      '"' + feg.trap.said + '"');
    t.ok('and with no amount the cutoff is left where you set it',
      feg.restsAtZero);
    t.ok('THE SWEEP IS IN THE EXPORTED FILE, not only in the speaker',
      feg.bounceSwept.early > feg.bounceSwept.late * 1.4,
      'zero crossings ' + feg.bounceSwept.early + '/s → ' + feg.bounceSwept.late + '/s');
    t.ok('and a bounce with the envelope off does not move',
      feg.bounceStill.early < feg.bounceStill.late * 1.4,
      feg.bounceStill.early + '/s → ' + feg.bounceStill.late + '/s');

    t.ok('with VEL→CUT off, a soft hit and a hard one are the same sound',
      Math.abs(feg.velOff.hard - feg.velOff.soft) < 120,
      feg.velOff.soft + ' Hz vs ' + feg.velOff.hard + ' Hz — the control');
    t.ok('WITH IT ON, PLAYING HARDER IS AUDIBLY BRIGHTER',
      feg.velOn.hard > feg.velOn.soft * 1.8,
      feg.velOn.soft + ' Hz at velocity 0.2 → ' + feg.velOn.hard + ' Hz at 1.0');
    t.ok('and it is the timbre, not the level — the centroid cannot hear volume',
      feg.velOn.soft > 0 && feg.velOff.soft > 0);
    t.ok('VEL→ENV makes a soft note sweep less far than a hard one',
      feg.envTravel.hard.heard > feg.envTravel.soft.heard + 300
      && feg.envTravel.hard.peakDet > feg.envTravel.soft.peakDet * 2,
      'heard ' + feg.envTravel.soft.heard + ' Hz vs ' + feg.envTravel.hard.heard
      + ' Hz · scheduled ' + feg.envTravel.soft.peakDet + ' vs '
      + feg.envTravel.hard.peakDet + ' cents');
    t.ok('and with it off both notes are given the same sweep',
      Math.abs(feg.envTravelFlat.hard.peakDet - feg.envTravelFlat.soft.peakDet) < 200,
      feg.envTravelFlat.soft.peakDet + ' vs ' + feg.envTravelFlat.hard.peakDet + ' cents');
    t.ok('VEL→CUT with no filter opens one too, rather than doing nothing',
      feg.velTrap.ftype === 'lowpass' && /softest hit/.test(feg.velTrap.said),
      '"' + feg.velTrap.said + '"');
    t.ok('the four envelope voices all actually set one',
      ['zap', 'acid', 'bloom', 'shut'].every(k => feg.voices[k].amt !== 0
        && feg.voices[k].ftype !== 'off'),
      Object.entries(feg.voices).map(([k, v]) => k + ' ' + v.shownAmt).join(' · '));
    t.ok('and TOUCH is velocity alone, so the two halves can be heard apart',
      feg.voices.touch.amt === 0 && feg.voices.touch.vel > 0.5
      && feg.voices.touch.ftype === 'lowpass');
    t.ok('a static voice afterwards clears the envelope AND the velocity',
      feg.cleanClears);
    t.ok('PLUCK and BELL are shapes that needed the decay stage to exist',
      feg.voices.pluck.sus === 0 && feg.voices.bell.sus === 0 && feg.voices.bell.dec > 1,
      'pluck sus ' + feg.voices.pluck.sus + ' · bell decay ' + feg.voices.bell.dec + 's');
    t.ok('and ORGAN holds, which is the same stage set the other way',
      feg.voices.organ.sus === 1);

    t.head('AN ENVELOPE WITH ALL FOUR STAGES');
    /* The amp envelope was attack and release: up to velocity, hold there for
       the whole slice, down. Two thirds of an envelope, and the missing third
       is the one that decides whether a sustained sample is a pad or a pluck.

       Measured on the pad's OWN output rather than the master, because the
       master compressor would flatten exactly the difference being tested. */
    const adsr = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(200);
      const PAD = 7;
      const keep = JSON.parse(JSON.stringify(S.pads[PAD]));
      const n = Math.round(AC.sampleRate * 2.0);
      const b = AC.createBuffer(2, n, AC.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * 330 * i / AC.sampleRate) * 0.8; }
      S.buffers.push(b);
      S.pads[PAD] = newPad(PAD); const p = S.pads[PAD];
      p.bufId = S.buffers.length - 1; p.gain = 0.9; p.att = 0.002; p.rel = 0.05;
      S.editPad = PAD; liveFx(); await wait(300);

      const an = AC.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0;
      LIVE.pads[PAD].mute.connect(an);
      const td = new Float32Array(an.fftSize);
      const rms = () => { an.getFloatTimeDomainData(td); let s = 0;
        for (let i = 0; i < td.length; i++) s += td[i] * td[i];
        return Math.sqrt(s / td.length); };
      /* One trace per hit, sampled through the first second of a two-second
         sample — well inside the hold, so nothing here is the release. */
      const trace = async () => { hitLive(PAD, 1); const out = [];
        for (let k = 0; k < 30; k++) { await wait(25); out.push(+rms().toFixed(4)); }
        await wait(1400); return out; };
      const at = (tr, ms) => tr[Math.min(tr.length - 1, Math.round(ms / 25) - 1)];

      p.dec = 0.12; p.sus = 1; liveFx();
      await trace();                                   // warm-up, ignored
      o.held = await trace();

      p.dec = 0.25; p.sus = 0.15; liveFx();
      o.plucked = await trace();

      p.dec = 0.25; p.sus = 0.55; liveFx();
      o.half = await trace();

      const peak = tr => Math.max(...tr);
      o.heldRatio = +(at(o.held, 600) / peak(o.held)).toFixed(3);
      o.pluckRatio = +(at(o.plucked, 600) / peak(o.plucked)).toFixed(3);
      o.halfRatio = +(at(o.half, 600) / peak(o.half)).toFixed(3);

      /* A SLICE THAT ENDS MID-DECAY must follow the slope you set, not a
         steeper one squeezed to fit. With a 1s decay and a 0.35s slice the
         level where the release begins should be about a third of the way
         down, not all the way to sustain. */
      p.dec = 1.0; p.sus = 0.0; p.end = 0.175;         // 0.35s of a 2s sample
      liveFx();
      const shortTr = await trace();
      const pk = peak(shortTr);
      o.shortEnd = +(at(shortTr, 300) / pk).toFixed(3);
      p.end = 1;

      S.pads[PAD] = keep; liveFx();
      return o;
    });
    t.ok('SUSTAIN at full holds the note — the old two-stage envelope, unchanged',
      adsr.heldRatio > 0.9, 'still at ' + Math.round(adsr.heldRatio * 100) + '% after 600ms');
    t.ok('AND LOWERING IT TURNS THE SAME SAMPLE INTO A PLUCK',
      adsr.pluckRatio < 0.3, 'fallen to ' + Math.round(adsr.pluckRatio * 100) + '% after 600ms');
    t.ok('with the level in between landing in between',
      adsr.halfRatio > adsr.pluckRatio + 0.15 && adsr.halfRatio < adsr.heldRatio - 0.15,
      Math.round(adsr.pluckRatio * 100) + '% · ' + Math.round(adsr.halfRatio * 100)
      + '% · ' + Math.round(adsr.heldRatio * 100) + '%');
    t.ok('a slice that ends mid-decay keeps the slope you set',
      adsr.shortEnd > 0.4 && adsr.shortEnd < 0.9,
      'at ' + Math.round(adsr.shortEnd * 100) + '% when the release begins — a decay '
      + 'squeezed to fit would already be near zero');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
