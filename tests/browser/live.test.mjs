/* PLAYING IT IN BY HAND.

   "The ribbon bass is good, the chord pad and single notes are cool... can we
   add better more realistic live instruments. More bass options possibly, a way
   to play bass pads live there would be great. Also would be good to have a way
   to record hitting live pads on the main pad site, as an option."

   Three separable things, and this guards the two that are checkable by
   measurement plus the one that was really a discoverability problem:

   BASS VOICES. Five, and the claim being made is that they are five
   instruments rather than one instrument with the filter in five places. That
   is a measurable claim, so it is measured: SUB has to be effectively empty
   above the low mids, and the plucked ones have to have an attack the sustained
   ones do not.

   PAD KEYS. Playing a pad's own sample across a scale, which is the answer to
   "play bass pads live" — a bass you sampled beats any oscillator in this tab.
   The thing that makes it usable rather than a novelty is that the middle of
   the keyboard is the sample AS RECORDED and the intervals are measured from
   the pad's own note, so a sampled bass lands in tune with the pattern.

   RECORDING PAD HITS. Both paths already worked — STEP REC has always written
   pad hits into the pattern, and hitLive has always passed liveTap so a lane
   set to LIVE ONLY captures the taps — but one was an unlabelled dot in the
   header and the other was on a different tab. What is new is that both are on
   the tab where you play, and that the app says they are different things. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('FIVE BASS VOICES, NOT ONE WITH A MENU');
    const bass = await page.evaluate(async () => {
      document.querySelector('#tabs button[data-v="live"]').click();
      S.inst.mode = 'ribbon'; S.inst.snap = false; S.inst.key = 0;
      drawLive();
      const an = AC.createAnalyser(); an.fftSize = 8192;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const out = {};
      for (const v of Object.keys(BASS_VOICES)) {
        S.inst.bass = v;
        ribbonStart();
        if (!LIVE._inst.g._tapped) { LIVE._inst.g.connect(an); LIVE._inst.g._tapped = 1; }
        ribbonMove(0.5, 0.6);
        await wait(260);
        const f = new Float32Array(an.frequencyBinCount);
        an.getFloatFrequencyData(f);
        const hz = AC.sampleRate / an.fftSize;
        const band = (lo, hi) => { let m = -200;
          for (let i = Math.floor(lo / hz); i < Math.min(f.length, hi / hz); i++) if (f[i] > m) m = f[i];
          return m; };
        out[v] = { name: BASS_VOICES[v].name, pluck: BASS_VOICES[v].pluck,
          sub: band(20, 80), low: band(80, 250), mid: band(250, 1200), hi: band(1200, 6000) };
        ribbonEnd();
        await wait(420);
      }
      return out;
    });
    for (const [k, v] of Object.entries(bass))
      t.note('    ' + v.name.padEnd(8) + ' sub ' + v.sub.toFixed(0).padStart(5) +
        '  low ' + v.low.toFixed(0).padStart(5) + '  mid ' + v.mid.toFixed(0).padStart(5) +
        '  hi ' + v.hi.toFixed(0).padStart(5) + ' dB');
    t.ok('there are five of them', Object.keys(bass).length === 5, Object.keys(bass).length + '');
    t.ok('every one of them makes sound in the bass', Object.values(bass).every(v => v.sub > -60),
      Object.values(bass).map(v => v.name + ':' + v.sub.toFixed(0)).join(' '));
    /* The claim that has to hold or the menu is decoration. */
    t.ok('SUB really is a sub — nothing to speak of in the mids',
      bass.sub.mid < bass.finger.mid - 40,
      'SUB mid ' + bass.sub.mid.toFixed(0) + ' vs FINGER ' + bass.finger.mid.toFixed(0));
    t.ok('and PICK is brighter than FINGER, which is the whole point of it',
      bass.pick.mid > bass.finger.mid + 3,
      'PICK ' + bass.pick.mid.toFixed(0) + ' vs FINGER ' + bass.finger.mid.toFixed(0));
    t.ok('the plucked ones are marked as plucked and the sustained ones are not',
      bass.finger.pluck > 0 && bass.pick.pluck > 0 && bass.upright.pluck > 0 &&
      bass.sub.pluck === 0 && bass.reese.pluck === 0);
    /* REESE is two oscillators beating; one would be silent as a "detune". */
    const reese = await page.evaluate(() => {
      S.inst.bass = 'reese'; const r = ribbonStart();
      const o = { two: !!r.o2, detune: BASS_VOICES.reese.detune,
        spread: r.o2 ? Math.abs(r.o.detune.value - r.o2.detune.value) : 0 };
      ribbonEnd(); return o;
    });
    t.ok('REESE really is two oscillators pulled apart', reese.two && reese.spread === reese.detune,
      reese.spread + ' cents between them');

    t.head('AND THE PANEL SAYS WHAT EACH ONE IS');
    const says = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 500));
      const read = v => { document.getElementById('bassVoice').value = v;
        document.getElementById('bassVoice').dispatchEvent(new Event('change'));
        return document.getElementById('bassHint').textContent; };
      const out = { sub: read('sub'), finger: read('finger') };
      out.shown = document.getElementById('bassopts').style.display !== 'none';
      return out;
    });
    t.ok('the selector is on screen for the bass', says.shown);
    t.note('    ' + says.sub);
    /* Y does something different on a sine, and saying so beats letting someone
       decide the control is broken. */
    t.ok('SUB explains why it has no wah', /no harmonics to open|no wah/.test(says.sub), says.sub);
    t.ok('FINGER says each touch strikes it again', /touch strikes it again/.test(says.finger),
      says.finger);

    t.head('PAD KEYS — YOUR OWN SOUND, IN TUNE');
    const pk = await page.evaluate(() => {
      S.inst.mode = 'padkeys'; S.inst.key = 0; S.inst.scale = 'minor'; S.inst.padKey = -1;
      drawLive();
      const pad = padKeysPad();
      const root = S.pads[pad].note >= 0 ? S.pads[pad].note : 48;
      const fired = []; const real = window.triggerPad;
      window.triggerPad = (c, g, p, v, when, reg, pitch, lt) => {
        fired.push({ p, pitch, liveTap: !!lt }); return real(c, g, p, v, when, reg, pitch, lt); };
      const keys = [...document.querySelectorAll('#keysgrid button')];
      const midis = scaleMidis(16);
      keys.slice(0, 6).forEach(b => b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      window.triggerPad = real;
      return { pad, root, padNote: S.pads[pad].note, nKeys: keys.length,
        midis: midis.slice(0, 6), fired,
        options: document.querySelectorAll('#padKeyPad option').length,
        hint: document.getElementById('padkeyHint').textContent };
    });
    t.note('    ' + pk.nKeys + ' keys playing pad ' + pk.pad + ' (its own note ' + pk.padNote + ')');
    t.note('    offsets ' + pk.fired.map(f => f.pitch).join(' '));
    t.ok('every key triggers the chosen pad, not a synth voice',
      pk.fired.length === 6 && pk.fired.every(f => f.p === pk.pad),
      pk.fired.length + ' hits on pad ' + pk.pad);
    /* The property that makes it play in tune: the offset is measured from the
       pad's OWN note, so the sample sits where the pattern expects it. */
    t.ok('and the pitch offset is measured from the pad\'s own root',
      pk.fired.every((f, i) => f.pitch === pk.midis[i] - pk.root),
      pk.fired.map(f => f.pitch).join(',') + ' vs ' +
      pk.midis.map(m => m - pk.root).join(','));
    t.ok('the hits count as live performance, so a take can capture them',
      pk.fired.every(f => f.liveTap));
    t.ok('and every loaded pad is offered', pk.options > 0, pk.options + ' pads');
    t.ok('with a line saying it is the same sound the sequencer makes',
      /same sound the sequencer makes/.test(pk.hint), pk.hint.slice(0, 70));

    t.head('RECORDING PAD HITS, FROM THE TAB YOU PLAY THEM ON');
    const rec = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('#tabs button[data-v="pads"]').click();
      S.chainOn = false; S.songOn = false; arrHeldOnce = true;
      const out = { idle: document.getElementById('padRecHint').textContent };

      document.getElementById('btnPadSteps').click();
      out.armed = { liveRec: S.liveRec, headerDot: document.getElementById('btnRec').classList.contains('on'),
        hint: document.getElementById('padRecHint').textContent };
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      const pat = S.patterns[S.pattern]; pat.steps[pad].fill(0);
      startSeq(); await wait(300);
      hitLive(pad, 0.9); await wait(140); hitLive(pad, 0.9);
      await wait(300); stopSeq();
      out.stepsWritten = pat.steps[pad].filter(v => v > 0).length;
      document.getElementById('btnPadSteps').click();
      out.disarmed = !S.liveRec;

      await wait(2400);                       // past the STOP tail drain
      const before = S.trax.filter(x => x.bufId >= 0).length;
      document.getElementById('btnPadAudio').click(); await wait(200);
      out.rolling = { label: document.getElementById('btnPadAudio').textContent.trim(),
        on: document.getElementById('btnPadAudio').classList.contains('on'),
        hint: document.getElementById('padRecHint').textContent };
      for (let i = 0; i < 4; i++) { hitLive(pad, 0.95); await wait(220); }
      document.getElementById('btnPadAudio').click(); await wait(800);
      const lane = S.trax.findIndex(x => x.bufId >= 0);
      let peak = 0;
      if (lane >= 0) { const b = S.buffers[S.trax[lane].bufId];
        if (b) { const d = b.getChannelData(0);
          for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } } }
      out.audio = { lanesBefore: before, lanesAfter: S.trax.filter(x => x.bufId >= 0).length,
        peak, label: document.getElementById('btnPadAudio').textContent.trim() };
      return out;
    });
    t.note('    idle: "' + rec.idle + '"');
    t.ok('the two are offered side by side and told apart',
      /STEPS/.test(rec.idle) && /AUDIO/.test(rec.idle) && /exactly as played/.test(rec.idle),
      rec.idle);
    t.ok('STEPS arms the same thing the header dot does',
      rec.armed.liveRec && rec.armed.headerDot);
    t.ok('and pad hits then land in the pattern', rec.stepsWritten === 2,
      rec.stepsWritten + ' steps written');
    t.ok('turning it off disarms it', rec.disarmed);
    t.note('    rolling: "' + rec.rolling.hint + '"');
    t.ok('AUDIO starts rolling and says how to keep it',
      rec.rolling.on && /STOP & KEEP/.test(rec.rolling.label), rec.rolling.label);
    t.ok('and the take lands on a tape lane with the taps in it',
      rec.audio.lanesAfter > rec.audio.lanesBefore && rec.audio.peak > 0.05,
      rec.audio.lanesAfter + ' lanes, peak ' + rec.audio.peak.toFixed(3));
    t.ok('after which the button offers to record again',
      /AUDIO/.test(rec.audio.label), rec.audio.label);

    t.head('A DELETED SOUND THAT STILL PLAYS — IT WAS ON TAPE');
    /* "I remove it from sequence, delete the pad, delete the track, and it
       plays when I hit play when I'm trying to play something else"... "the
       sample was from trax."
       A tape lane plays with the transport, and nothing outside the TRAX tab
       said one existed. Reproduced exactly: pad bufId -1, zero steps in any
       pattern, and PLAY still put 0.89 peak out of the master. R156 made it far
       easier to hit by putting AUDIO → TRACK on the pads tab, where a take can
       be made without ever opening TRAX. */
    const ghost = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      S.chainOn = false; S.songOn = false; arrHeldOnce = true; setBpm(120);
      document.querySelector('#tabs button[data-v="pads"]').click();
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      S.trax.forEach((tr, i) => { if (tr.bufId >= 0) clearTrack(i); });
      S.patterns.forEach(pt => pt.steps.forEach(r => r.fill(0)));
      S.editPad = pad; drawSeq(); drawPads();
      const tab = () => { const b = document.querySelector('#tabs button[data-v="trax"]');
        return { marked: b.classList.contains('hasload'), n: b.dataset.n }; };
      const out = { tabEmpty: tab() };

      document.getElementById('btnPadAudio').click(); await wait(200);
      for (let i = 0; i < 4; i++) { hitLive(pad, 0.95); await wait(200); }
      document.getElementById('btnPadAudio').click(); await wait(800);
      out.lanes = S.trax.filter(t => t.bufId >= 0).length;
      out.tabLoaded = tab();
      out.padHint = document.getElementById('padRecHint').textContent;

      document.getElementById('epClear').click();
      out.clearSaid = document.getElementById('lcdmsg').textContent;
      out.padBuf = S.pads[pad].bufId;
      out.steps = S.patterns.reduce((n, pt) => n + pt.steps.reduce((m, r) => m + r.filter(v => v > 0).length, 0), 0);
      await wait(2400);

      const an = AC.createAnalyser(); an.fftSize = 2048;
      LIVE.softclip.connect(an);
      const b = new Float32Array(an.fftSize);
      const peakOver = async n => { let p = 0;
        for (let i = 0; i < n; i++) { await wait(140); an.getFloatTimeDomainData(b);
          for (let k = 0; k < b.length; k++) { const a = Math.abs(b[k]); if (a > p) p = a; } }
        return p; };
      startSeq(); out.stillAudible = await peakOver(12); stopSeq();
      await wait(2400);

      // and clearing the lane really does silence it
      S.trax.forEach((tr, i) => { if (tr.bufId >= 0) clearTrack(i); });
      out.tabAfterClear = tab();
      startSeq(); out.afterLaneCleared = await peakOver(12); stopSeq();
      return out;
    });
    t.note('    after deleting the pad: bufId ' + ghost.padBuf + ', ' + ghost.steps +
      ' steps anywhere, master peak ' + ghost.stillAudible.toFixed(3));
    t.ok('the take does still play — that part is correct, it is a recording',
      ghost.stillAudible > 0.05, ghost.stillAudible.toFixed(3));
    /* Which is fine. What was wrong is that nothing said so. */
    t.ok('the TRAX tab is unmarked when no lane holds anything', !ghost.tabEmpty.marked);
    t.ok('and carries a count the moment one does',
      ghost.tabLoaded.marked && ghost.tabLoaded.n === String(ghost.lanes),
      JSON.stringify(ghost.tabLoaded));
    t.ok('the pads tab says the lanes will play too',
      /tape lane/.test(ghost.padHint), ghost.padHint.slice(0, 90));
    t.note('    "' + ghost.clearSaid + '"');
    t.ok('and clearing a pad names the one place it cannot reach',
      /tape lane/.test(ghost.clearSaid) && /TRAX/.test(ghost.clearSaid), ghost.clearSaid);
    t.ok('clearing the lane finally silences it',
      ghost.afterLaneCleared < 0.02, ghost.afterLaneCleared.toFixed(4));
    t.ok('and the tab mark goes with it', !ghost.tabAfterClear.marked);

    t.head('PITCH NO LONGER CHANGES HOW LONG THE SOUND LASTS');
    /* "The pitch shift effects time it shouldn't effect the speed of the
       sound." A sampler pitches by playback rate, so +12 is twice as fast and
       half as long. KEEP TIME pre-stretches by the pitch ratio so the rate and
       the stretch cancel in duration and compound in pitch. */
    const pitch = await page.evaluate(async () => {
      /* The LONGEST loaded sample. A grain stretcher works in ~80ms windows, so
         on a sound shorter than a few grains the output length is quantised to
         something coarse — measured at 122% of the original an octave down on a
         185ms sample. That is a real limit of the technique and it is written
         into the panel, but it is not what this check is about. */
      /* The longest ONE-SHOT pad. A GRAIN pad's length is set by its burst, not
         by its sample, so pitch cannot change it — and the demo song's longest
         pad happens to be exactly that, which made this measure the one pad
         where the property does not apply and read 100% for tape pitch too. */
      let pad = -1, best = 0;
      S.pads.forEach((x, i) => { if (x.bufId >= 0 && x.mode !== 'grain') {
        const d = S.buffers[x.bufId].duration;
        if (d > best) { best = d; pad = i; } } });
      const p = S.pads[pad];
      p.start = 0; p.end = 1; p.rel = 0.06; p.keepPitch = false;
      S.chainOn = false; S.songOn = false; S.human = 0; S.swing = 0;
      /* Its own tempo, explicitly. An earlier section leaves the transport at
         120, where one bar is 2s — shorter than this sample — so every
         measurement came back as the render window rather than the sound, and
         all three pitches read identical. A test that inherits state measures
         whatever ran before it. */
      /* ONE hit, in a window long enough to hold it. Two loops put a second
         hit at the four-second mark and the measurement ran to the end of THAT
         — so tape at +12 read 73% of the original instead of the ~50% one hit
         actually gives. At 30 BPM a sixteen-step bar is 8s, which holds the 6s
         sample whole. */
      setBpm(30); setPatLen(16);
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '1';
      const len = async () => {
        S.patterns.forEach(pt => pt.steps.forEach(r => r.fill(0)));
        S.patterns[S.pattern].steps[pad][0] = 0.9;
        const kR = p.rev, kD = p.dly; p.rev = 0; p.dly = 0;
        ensureSpeedCaches();
        const buf = await renderMix(new Set([pad]), new Set());
        p.rev = kR; p.dly = kD;
        const d = buf.getChannelData(0);
        let peak = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
        const thr = peak * 0.02; let last = 0;
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) last = i;
        return last / buf.sampleRate;
      };
      const out = { srcDur: best };
      p.keepTime = false; p.pitch = 0;  out.tape0 = await len();
      p.pitch = 12;                     out.tapeUp = await len();
      p.pitch = -12;                    out.tapeDn = await len();
      p.keepTime = true;  p.pitch = 0;  out.keep0 = await len();
      p.pitch = 12;                     out.keepUp = await len();
      p.pitch = -12;                    out.keepDn = await len();
      p.pitch = 0;
      return out;
    });
    t.note('    source ' + pitch.srcDur.toFixed(2) + 's');
    t.note('    TAPE PITCH  0:' + pitch.tape0.toFixed(3) + '  +12:' + pitch.tapeUp.toFixed(3) +
      '  -12:' + pitch.tapeDn.toFixed(3) + 's');
    t.note('    KEEP TIME   0:' + pitch.keep0.toFixed(3) + '  +12:' + pitch.keepUp.toFixed(3) +
      '  -12:' + pitch.keepDn.toFixed(3) + 's');
    /* The old behaviour still has to be available — it is what a sampler does
       and it is the right sound for a tape effect. */
    t.ok('TAPE PITCH still shortens when you pitch up', pitch.tapeUp < pitch.tape0 * 0.7,
      (pitch.tapeUp / pitch.tape0 * 100).toFixed(0) + '% of the original length');
    t.ok('and lengthens when you pitch down', pitch.tapeDn > pitch.tape0 * 1.6,
      (pitch.tapeDn / pitch.tape0 * 100).toFixed(0) + '%');
    const errUp = Math.abs(pitch.keepUp - pitch.keep0) / pitch.keep0;
    const errDn = Math.abs(pitch.keepDn - pitch.keep0) / pitch.keep0;
    t.ok('KEEP TIME holds the length an octave UP', errUp < 0.15,
      (pitch.keepUp / pitch.keep0 * 100).toFixed(0) + '% of the original');
    t.ok('and an octave DOWN', errDn < 0.15,
      (pitch.keepDn / pitch.keep0 * 100).toFixed(0) + '%');
    /* The comparison that matters to somebody using it: whatever the residual,
       it has to be a different order of thing from what tape does. */
    const tapeErrUp = Math.abs(pitch.tapeUp - pitch.tape0) / pitch.tape0;
    const tapeErrDn = Math.abs(pitch.tapeDn - pitch.tape0) / pitch.tape0;
    t.ok('and both are far closer to unchanged than tape is',
      errUp < tapeErrUp / 3 && errDn < tapeErrDn / 3,
      'up ' + (errUp * 100).toFixed(0) + '% vs ' + (tapeErrUp * 100).toFixed(0) +
      '% · down ' + (errDn * 100).toFixed(0) + '% vs ' + (tapeErrDn * 100).toFixed(0) + '%');

    t.head('AND AN OLDER PROJECT KEEPS THE VOICING IT WAS MADE WITH');
    const mig = await page.evaluate(() => {
      const doc = { fmt: DOC_FMT, v: 1, pads: [{ bufId: -1, pitch: 7 }, { bufId: -1 }], patterns: [] };
      migrateDoc(doc, 1);
      return { v: doc.v, cur: DOC_V, keepTime: doc.pads.map(p => p.keepTime),
        newPad: newPad(0).keepTime };
    });
    t.ok('a v1 project has its pads stamped tape-style on load',
      mig.keepTime.every(k => k === false), JSON.stringify(mig.keepTime));
    t.ok('but a brand new pad keeps its length', mig.newPad === true);
    t.ok('and the document is brought up to the current version', mig.v === mig.cur,
      'v' + mig.v + ' of ' + mig.cur);

    t.head('THE MIC CLAIMS THE TAPE SOURCE, AND GIVES IT BACK');
    /* "When I record on the mic screen it doesn't automatically activate the
       track and you have to manually change the source to mic on the trax
       page." Arming a lane with the mic live and SOURCE on the master bus
       records the backing track with the mic buried in it. */
    const mic = await page.evaluate(() => {
      const sel = document.getElementById('traxSrc');
      const out = {};
      sel.value = 'bus'; micOn = true;
      out.msg = micClaimTrax();
      out.during = sel.value;
      micReleaseTrax(); micOn = false;
      out.restored = sel.value;
      // a deliberate choice made while the mic is live is not undone
      sel.value = 'live'; micOn = true; micClaimTrax(); sel.value = 'live';
      micReleaseTrax(); micOn = false;
      out.deliberate = sel.value;
      return out;
    });
    t.ok('turning the mic on points TRAX at it', mic.during === 'mic', mic.during);
    t.ok('and says so rather than changing a setting in silence',
      /TRAX SOURCE/.test(mic.msg), mic.msg);
    t.ok('turning the mic off restores what was there', mic.restored === 'bus', mic.restored);
    t.ok('but a source you chose while the mic was live is left alone',
      mic.deliberate === 'live', mic.deliberate);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
