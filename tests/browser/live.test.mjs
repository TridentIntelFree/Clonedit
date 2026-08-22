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

    t.head('A NEW SOUND ON A PAD DOES NOT INHERIT THE LAST ONE\'S VOICING');
    /* Reported: a TRAX take sent TO PAD came back very quiet, with the EQ
       "looking insane", and inaudible over Bluetooth. The take was fine — the
       pad it landed on still carried the previous sound's gain, filter and EQ,
       because when every pad is full pickTargetPad falls back to the selected
       one. Measured before the fix: rendered 0.20 instead of 0.82, with the
       700-3000Hz band two million times below 30-90Hz — pure sub-bass, which
       a Bluetooth speaker does not reproduce. */
    const voice = await page.evaluate(async () => {
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      /* Measured AT the tones the take is made of, not across a band. A band
         sum steps through six probe points and 1400Hz fell between two of
         them, so it read the midrange as absent when it was fully present —
         the test failing on its own arithmetic rather than on the app. */
      const at = (buf, f) => { const d = buf.getChannelData(0);
        const w = 2 * Math.PI * f / buf.sampleRate, cr = 2 * Math.cos(w);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < d.length; i++) { const s = d[i] + cr * s1 - s2; s2 = s1; s1 = s; }
        return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cr * s1 * s2)) / d.length; };
      const o = {};
      // a take on a lane, made directly so the test does not depend on timing
      const SR = AC.sampleRate, N = Math.round(SR * 0.5);
      const take = AC.createBuffer(1, N, SR), td = take.getChannelData(0);
      for (let i = 0; i < N; i++) {           // broadband, so a lowpass is obvious
        td[i] = 0.8 * (Math.sin(2 * Math.PI * 180 * i / SR) + Math.sin(2 * Math.PI * 1400 * i / SR)
          + Math.sin(2 * Math.PI * 7000 * i / SR)) / 3;
      }
      S.buffers.push(take);
      S.trax[0].bufId = S.buffers.length - 1;
      S.trax[0].name = 'take';

      // every pad full, so TO PAD must fall back to the selected one
      for (let i = 0; i < NPADS; i++) if (S.pads[i].bufId < 0) S.pads[i].bufId = 0;
      /* TO PAD asks before replacing a sound now, and an unanswered dialog is
         a decline — so this says yes on purpose. The asking itself is covered
         in its own section. */
      const realConfirm = window.confirm; window.confirm = () => true;
      S.editPad = 5;
      Object.assign(S.pads[5], { gain: 0.15, ftype: 'lp', fcut: 0.12, fres: 3,
        eqLo: 9, eqMid: -12, eqHi: -12, pitch: -7, mode: 'one' });

      traxFxSel = 0;
      document.getElementById('tfxPad').click();
      const pi = S.editPad, p = S.pads[pi];
      o.landedOnUsedPad = pi === 5;
      o.pad = { gain: p.gain, ftype: p.ftype, fcut: p.fcut, fres: p.fres,
        eqLo: p.eqLo, eqMid: p.eqMid, eqHi: p.eqHi, pitch: p.pitch };
      o.lcd = document.getElementById('lcdmsg').textContent;
      /* placement must SURVIVE — the slot's identity is not the sound's */
      o.keptNote = p.note, o.keptChoke = p.choke;

      window.confirm = realConfirm;
      S.patterns[S.pattern].steps.forEach(r => r.fill(0));
      S.patterns[S.pattern].steps[pi][0] = 1;
      S.trax.forEach(tr => { tr.mute = true; });
      const b = await renderMix(new Set([pi]), new Set(), { loops: 1, src: 'pat', noTail: true });
      o.peak = b ? pk(b) : 0;
      if (b) { o.low = at(b, 180); o.mid = at(b, 1400); o.high = at(b, 7000); }
      return o;
    });
    t.ok('the take really did land on a pad that was already in use',
      voice.landedOnUsedPad);
    t.ok('and the pad\'s level, filter, EQ and pitch are back to defaults',
      voice.pad.gain === 0.9 && voice.pad.ftype === 'off' && voice.pad.fcut === 1
      && voice.pad.eqLo === 0 && voice.pad.eqMid === 0 && voice.pad.eqHi === 0
      && voice.pad.pitch === 0, JSON.stringify(voice.pad));
    t.ok('it says what it cleared rather than doing it silently',
      /cleared/.test(voice.lcd) && /UNDO/.test(voice.lcd), '"' + voice.lcd + '"');
    t.ok('the take plays at a normal level, not buried',
      voice.peak > 0.5, 'peak ' + voice.peak.toFixed(4) + ' (0.20 before the fix)');
    t.ok('AND IT KEEPS ITS MIDRANGE AND TOP — what Bluetooth actually reproduces',
      voice.mid > voice.low * 0.25 && voice.high > voice.low * 0.1,
      '180Hz ' + voice.low.toFixed(4) + ' · 1.4kHz ' + voice.mid.toFixed(4)
      + ' · 7kHz ' + voice.high.toFixed(4) + ' (the lowpass left almost nothing above 180Hz)');

    t.head('AN OPEN INPUT IS VISIBLE, AND RELEASES THE ROUTE WHEN IT CLOSES');
    /* Reported: the app played through the phone speaker and would not play
       through Bluetooth, while other apps used the same speaker fine without
       reconnecting. That is the iOS audio session: any open input puts it in
       'play-and-record', which routes output to the built-in speaker and
       carries no A2DP Bluetooth. Bluetooth itself cannot be tested here — no
       BT stack, no iOS, and Chromium does not implement navigator.audioSession
       — so what is testable is checked: that the app knows when an input is
       open, says so, and lets go the moment it closes. */
    const route = await page.evaluate(async () => {
      const o = {};
      const pip = document.getElementById('recPip');
      o.hasPip = !!pip;
      o.hiddenAtRest = pip ? pip.hidden : null;
      o.openAtRest = capturesOpen();

      /* Drive the state the way each feature does, without a real getUserMedia:
         the question is whether capturesOpen() and the badge follow it. */
      micOn = true; drawRoutePip();
      o.withMic = { open: capturesOpen(), shown: !pip.hidden, title: pip.title };
      /* Shown is not the same as seen. The first version of this badge lived in
         the header, whose left column is clipped where the transport begins,
         and at 320px it rendered underneath the tour button. */
      const bb = pip.getBoundingClientRect();
      const mid = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
      o.visible = { onScreen: bb.left >= 0 && bb.right <= window.innerWidth && bb.width > 20,
        topmost: mid ? (mid.id || mid.tagName) : 'none' };
      pip.click();
      o.tapLcd = document.getElementById('lcdmsg').textContent;
      micOn = false; drawRoutePip();
      o.afterMic = { open: capturesOpen(), shown: !pip.hidden };

      ampOn = true; drawRoutePip();
      o.withAmp = { open: capturesOpen(), shown: !pip.hidden, title: pip.title };
      ampOn = false; drawRoutePip();

      traxStream = { getTracks: () => [] }; drawRoutePip();
      o.withTrax = { open: capturesOpen(), shown: !pip.hidden };
      traxStream = null; drawRoutePip();
      o.afterAll = { open: capturesOpen(), shown: !pip.hidden };

      /* And the guard that used to yank the route out from under a live
         capture: resumeSession must NOT reclaim playback while an input is
         open. micOn and breathOn were missing from the old list. */
      micOn = true;
      let killed = false;
      const realType = (() => { try { return navigator.audioSession && navigator.audioSession.type; }
        catch (e) { return null; } })();
      o.sessionApiPresent = realType != null;
      resumeSession();
      o.stillOpenAfterResume = capturesOpen().length > 0;
      micOn = false;
      resumeSession();
      o.releasedAfterClose = capturesOpen().length === 0;
      drawRoutePip();
      o.pipHiddenAtEnd = pip.hidden;
      return o;
    });
    t.ok('the badge exists and is hidden while nothing is capturing',
      route.hasPip && route.hiddenAtRest && route.openAtRest.length === 0);
    t.ok('AND IT IS ACTUALLY VISIBLE — not underneath another control',
      route.visible && route.visible.onScreen && route.visible.topmost === 'recPip',
      JSON.stringify(route.visible) + ' (it sat under the tour button in the header at 320px)');
    /* Tapping it used to explain the situation. Explaining is not much use
       when the answer is "release the input and reopen the audio", so it now
       does that — a tooltip is nothing on a touch screen and neither is a
       paragraph you cannot act on. */
    t.ok('tapping it resets the output rather than only describing the problem',
      /OUTPUT RESET|RELEASING/i.test(route.tapLcd), route.tapLcd.slice(0, 90));
    t.ok('the MIC panel raises it, and the tooltip names the feature',
      route.withMic.shown && route.withMic.open.includes('MIC')
      && /MIC/.test(route.withMic.title) && /Bluetooth/i.test(route.withMic.title),
      route.withMic.open.join(', '));
    t.ok('so does the AMP input', route.withAmp.shown && route.withAmp.open.includes('AMP INPUT'));
    t.ok('so does a tape lane armed to the mic', route.withTrax.shown);
    t.ok('and closing each one clears it again',
      route.afterMic.open.length === 0 && !route.afterMic.shown
      && route.afterAll.open.length === 0 && !route.afterAll.shown && route.pipHiddenAtEnd);
    t.ok('resumeSession does not reclaim the route from a live capture',
      route.stillOpenAfterResume, 'the old guard omitted micOn and breathOn');
    t.ok('but does release it once the capture closes', route.releasedAfterClose);

    t.head('A TAPE LANE CAN BE PREVIEWED ON ITS OWN');
    /* Asked for: until now the only way to hear a take was to press PLAY and
       wait for it to come round with everything else, which is no way to
       answer "did that actually record?". The preview is deliberately its own
       path — dry, straight to master, ignoring the lane's mute, volume and FX
       — because a lane muted at zero is exactly the one you need to audition. */
    const prev = await page.evaluate(async () => {
      const o = {};
      const SR = AC.sampleRate;
      const take = AC.createBuffer(2, Math.round(SR * 0.6), SR);
      const d = take.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 300 * i / SR);
      S.buffers.push(take);
      S.trax[1].bufId = S.buffers.length - 1;
      S.trax[1].name = 'take2';
      S.trax[1].mute = true; S.trax[1].gain = 0;      // the hard case
      drawTrax();

      const rows = document.querySelectorAll('#traxlist .row');
      const btn = rows[1].querySelector('button[aria-label^="Preview track 2"]');
      o.hasButton = !!btn;
      o.enabledWithTake = btn ? !btn.disabled : null;
      const empty = rows[3].querySelector('button[aria-label^="Preview track 4"]');
      o.disabledWhenEmpty = empty ? empty.disabled : null;

      btn.click();
      o.playingAfterTap = !!traxPrev && traxPrev.i === 1;
      o.lcd = document.getElementById('lcdmsg').textContent;
      const again = document.querySelectorAll('#traxlist .row')[1]
        .querySelector('button[aria-label^="Stop previewing track 2"]');
      o.buttonBecameStop = !!again;
      if (again) { again.click(); o.stoppedAfterSecondTap = !traxPrev; }

      // the transport takes over an audition rather than layering on it
      btn.click ? document.querySelectorAll('#traxlist .row')[1]
        .querySelector('button[aria-label^="Preview track 2"]').click() : null;
      o.playingBeforeTransport = !!traxPrev;
      startSeq();
      o.stoppedByTransport = !traxPrev;
      stopSeq();

      // a silent take says so instead of leaving you listening to nothing
      const quiet = AC.createBuffer(2, Math.round(SR * 0.3), SR);
      S.buffers.push(quiet);
      S.trax[2].bufId = S.buffers.length - 1;
      drawTrax();
      document.querySelectorAll('#traxlist .row')[2]
        .querySelector('button[aria-label^="Preview track 3"]').click();
      o.silentLcd = document.getElementById('lcdmsg').textContent;
      traxPreviewStop();
      return o;
    });
    t.ok('every lane holding a take gets a preview button',
      prev.hasButton && prev.enabledWithTake);
    t.ok('and an empty lane\'s is disabled rather than misleading', prev.disabledWhenEmpty);
    t.ok('tapping it plays the take even though the lane is muted at zero volume',
      prev.playingAfterTap, '"' + prev.lcd + '"');
    t.ok('it says it is bypassing the mix rather than leaving that a surprise',
      /ignoring mute/.test(prev.lcd), prev.lcd.slice(0, 90));
    t.ok('the button turns into a stop, and a second tap stops it',
      prev.buttonBecameStop && prev.stoppedAfterSecondTap);
    t.ok('starting the transport ends the audition rather than layering on it',
      prev.playingBeforeTransport && prev.stoppedByTransport);
    t.ok('and a silent take says so instead of playing nothing in silence',
      /SILENT/.test(prev.silentLcd), '"' + prev.silentLcd + '"');

    t.head('AN ARMED MIC LANE HOLDS NOTHING UNTIL IT IS ACTUALLY RECORDING');
    /* Arming used to open the microphone so the capture would be live before
       PLAY. The cost was hidden and large: on iOS an open input forces output
       to the phone's own speaker and carries no Bluetooth, so merely arming a
       lane cost the user their speaker for as long as it stayed armed —
       reported as "no sound is coming out of it, it comes out of phone".
       The stream opens on PLAY and closes at commit now. This runs against
       Chromium's fake microphone, so it is the real getUserMedia path. */
    await ctx.grantPermissions(['microphone']).catch(() => {});
    const arm = await page.evaluate(async () => {
      const o = {};
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      S.trax.forEach(t => { t.bufId = -1; });
      document.getElementById('traxSrc').value = 'mic';

      await armTrack(0);
      o.armed = traxArm === 0;
      o.openAfterArm = capturesOpen();
      o.pipAfterArm = !document.getElementById('recPip').hidden;
      o.armLcd = document.getElementById('lcdmsg').textContent;

      await playPressed();
      await new Promise(r => setTimeout(r, 1800));
      o.openWhileRolling = capturesOpen();
      o.pipWhileRolling = !document.getElementById('recPip').hidden;

      stopSeq();
      await new Promise(r => setTimeout(r, 1200));
      o.openAfterStop = capturesOpen();
      o.pipAfterStop = !document.getElementById('recPip').hidden;
      o.tookIt = S.trax[0].bufId >= 0;
      o.peak = S.trax[0].bufId >= 0 ? pk(S.buffers[S.trax[0].bufId]) : 0;
      o.commitLcd = document.getElementById('lcdmsg').textContent;
      return o;
    });
    t.ok('arming a MIC lane opens no input at all', arm.armed
      && arm.openAfterArm.length === 0 && !arm.pipAfterArm,
      'inputs open after arm: ' + (arm.openAfterArm.join(', ') || 'none'));
    t.ok('and says so, rather than warning about a cost it no longer has',
      /costs you nothing/.test(arm.armLcd), arm.armLcd.slice(-80));
    t.ok('PLAY opens the microphone, and only then',
      arm.openWhileRolling.length > 0 && arm.pipWhileRolling,
      arm.openWhileRolling.join(', '));
    t.ok('STOP closes it again, so the route comes straight back',
      arm.openAfterStop.length === 0 && !arm.pipAfterStop);
    t.ok('AND THE TAKE IS STILL RECORDED — timing did not depend on holding it early',
      arm.tookIt && arm.peak > 0.05,
      'peak ' + arm.peak.toFixed(4) + ' · "' + arm.commitLcd.slice(0, 60) + '"');

    t.head('A LEAKED INPUT IS SEEN, AND THE OUTPUT CAN BE RESET');
    /* Reported: nothing in the app reaches Bluetooth while other apps do. That
       is not one feature holding the route — it is a stream that outlived its
       feature. The badge read state FLAGS, so in exactly that case it stayed
       hidden: the flag says closed, the track is still running, and iOS is in
       record mode because of the track. */
    const leak = await page.evaluate(async () => {
      const o = {};
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1800));
      o.opened = micOn && liveInputTracks().length > 0;
      micOn = false;                       // the leak: flag cleared, track still live
      drawRoutePip();
      o.stillLive = liveInputTracks();
      o.badgeShown = !document.getElementById('recPip').hidden;
      o.capturesSeesIt = capturesOpen().join(', ');
      document.getElementById('btnDiag').click();
      o.diag = (document.getElementById('docText').value.split('\n')
        .find(l => /input streams:/.test(l)) || '');

      const before = AC, rate = AC.sampleRate;
      const bufs = S.buffers.length, pads = S.pads.filter(p => p.bufId >= 0).length;
      document.getElementById('btnOutReset').click();
      await new Promise(r => setTimeout(r, 1500));
      o.liveAfter = liveInputTracks();
      o.contextReplaced = AC !== before;
      o.rateKept = AC.sampleRate === rate;
      o.running = AC.state === 'running';
      o.buffersKept = S.buffers.length === bufs;
      o.padsKept = S.pads.filter(p => p.bufId >= 0).length === pads;
      o.lcd = document.getElementById('lcdmsg').textContent;
      o.log = document.getElementById('projlog').textContent.slice(0, 400);
      const b = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      let pk = 0; if (b) { const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      o.stillPlays = pk;
      return o;
    });
    t.ok('the real microphone opened', leak.opened);
    t.ok('A STREAM THAT OUTLIVED ITS FEATURE IS STILL SEEN',
      leak.badgeShown && /still open/.test(leak.capturesSeesIt),
      leak.capturesSeesIt + ' (a flag-driven badge stayed hidden here)');
    t.ok('and DIAG names it, so a dump can reveal it', /MIC panel/.test(leak.diag), leak.diag);
    t.ok('RESET OUTPUT releases every live track', leak.liveAfter.length === 0,
      leak.stillLive.join(', ') + ' → none');
    t.ok('and opens a fresh audio context, which is what re-picks the output',
      leak.contextReplaced && leak.running && leak.rateKept);
    t.ok('without costing samples, pads, or the ability to play',
      leak.buffersKept && leak.padsKept && leak.stillPlays > 0.05,
      'peak ' + leak.stillPlays.toFixed(4));
    /* Read from the log rather than the LCD: rebuildOut can append its own
       message on a headless browser where element playback is refused, and the
       last line wins. The log keeps both. */
    t.ok('and it records what it released', /OUTPUT RESET: released/.test(leak.log),
      (leak.log.split('\n').find(l => /OUTPUT RESET/.test(l)) || leak.lcd).slice(0, 90));

    t.head('THE OUTPUT CATEGORY IS A CHOICE, NOT A HARD-CODED GUESS');
    /* Since R111 the app has forced 'playback' whenever nothing is recording —
       an override of the browser's own routing judgement, on every touch,
       because resumeSession is bound to touchstart. The spec default is
       'auto'. That override is a plausible reason a paired speaker stops being
       chosen, and it cannot be tested anywhere Chromium runs: navigator.
       audioSession is not implemented, so the real code path is a no-op here.
       What CAN be tested is that the choice reaches the API, that a capture
       still overrides it, and that it survives a reload — so the person with
       the phone is changing something real. */
    const sess = await page.evaluate(async () => {
      const o = {}, sel = document.getElementById('outRoute');
      o.defaultsToPlayback = sel.value === 'playback' && sessPref === 'playback';
      let asked = [];
      Object.defineProperty(navigator, 'audioSession', { configurable: true,
        value: { get type() { return this._t || 'auto'; }, set type(v) { this._t = v; asked.push(v); } } });
      applyAudioRoute(); o.withPlayback = asked.slice();
      asked = []; sel.value = 'auto'; sel.dispatchEvent(new Event('change'));
      o.withAuto = asked.slice(); o.pref = sessPref;
      o.persisted = localStorage.getItem('jbh_sess_v1');
      asked = []; micOn = true; applyAudioRoute(); micOn = false;
      o.whileCapturing = asked.slice();
      asked = []; applyAudioRoute(); o.afterCapturing = asked.slice();
      document.getElementById('btnDiag').click();
      o.diag = document.getElementById('docText').value.split('\n')
        .find(l => /routing pref/.test(l)) || '';
      sel.value = 'playback'; sel.dispatchEvent(new Event('change'));
      return o;
    });
    t.ok('it defaults to what the app already did, so nothing changes by surprise',
      sess.defaultsToPlayback);
    t.ok('choosing PLAYBACK asks for playback', sess.withPlayback.join() === 'playback');
    t.ok('choosing AUTO hands the decision back to the browser',
      sess.withAuto.join() === 'auto' && sess.pref === 'auto', sess.withAuto.join());
    t.ok('and the choice is remembered on the device', sess.persisted === 'auto');
    t.ok('but a live capture still forces record mode whatever the preference',
      sess.whileCapturing.join() === 'play-and-record');
    /* The falling edge also rebuilds the audio, which re-asserts the category,
       so this can legitimately be asked for more than once. What matters is
       that the preference is what it lands on. */
    t.ok('and the preference returns the moment the capture ends',
      sess.afterCapturing.length > 0
      && sess.afterCapturing[sess.afterCapturing.length - 1] === 'auto',
      sess.afterCapturing.join(' → '));
    t.ok('DIAG reports the preference and whether the API exists at all',
      /routing pref/.test(sess.diag) && /audioSession API/.test(sess.diag), sess.diag);

    t.head('THE AUDIO SESSION IS NOT REWRITTEN ON EVERY TOUCH');
    /* resumeSession is bound to touchstart, visibilitychange, pageshow and
       focus, and ends in applyAudioRoute — so the app was asking iOS to
       configure the audio session on EVERY TOUCH, almost always to the value
       it already held. Configuring a session makes iOS re-evaluate the output
       route, and the handset speaker is the fallback. Reported as a pad heard
       on Bluetooth and a lane started moments later heard on the phone: one
       output, re-routed in between. */
    const writes = await page.evaluate(async () => {
      let w = [];
      Object.defineProperty(navigator, 'audioSession', { configurable: true,
        value: { get type() { return this._t || 'auto'; }, set type(v) { this._t = v; w.push(v); } } });
      forgetAudioRoute();
      const o = {};
      applyAudioRoute(); o.first = w.slice(); w = [];
      for (let i = 0; i < 50; i++) resumeSession();
      o.touches = w.length; w = [];
      micOn = true; applyAudioRoute(); o.capture = w.slice(); w = [];
      /* forgetAudioRoute before the release, so the falling edge does not also
         rebuild the audio context underneath a test that is counting writes.
         The rebuild is covered on its own further down. */
      micOn = false; forgetAudioRoute(); applyAudioRoute(); o.release = w.slice(); w = [];
      const sel = document.getElementById('outRoute');
      sel.value = 'auto'; sel.dispatchEvent(new Event('change'));
      o.prefChange = w.slice(); w = [];
      sel.value = 'playback'; sel.dispatchEvent(new Event('change'));
      return o;
    });
    t.ok('the first call does configure the session', writes.first.join() === 'playback');
    t.ok('FIFTY TOUCHES AFTERWARDS WRITE NOTHING AT ALL',
      writes.touches === 0, writes.touches + ' writes (was one per touch)');
    t.ok('but opening an input still switches it', writes.capture.join() === 'play-and-record');
    t.ok('and closing it switches back', writes.release.join() === 'playback');
    t.ok('a deliberate preference change always reaches the OS',
      writes.prefChange.join() === 'auto');

    t.head('CLOSING THE MIC RE-PICKS THE OUTPUT, NOT JUST THE LABEL');
    /* The reported sequence, exactly: mic on, mic used, mic off — after which
       sound stays on the handset and a RELOAD fixes it. That is the signature
       of a route pinned at session activation: iOS chooses the output when the
       session activates and does not revisit it because the category changed
       back. Confirmed from the device: "I can restore the session and it plays
       through bt. Only sessions where I arm mic then turn it back off are
       affected." So the last input closing has to rebuild, not relabel. */
    const repick = await page.evaluate(async () => {
      const o = {};
      const ctx0 = AC;
      const bufsBefore = S.buffers.length, padsBefore = S.pads.filter(p => p.bufId >= 0).length;
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1600));
      o.opened = micOn;
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1400));
      o.closed = !micOn;
      o.rebuiltWhenIdle = AC !== ctx0;
      o.idleLcd = document.getElementById('lcdmsg').textContent;
      o.buffersKept = S.buffers.length;
      o.padsKept = S.pads.filter(p => p.bufId >= 0).length;
      o.buffersBefore = bufsBefore; o.padsBefore = padsBefore;
      let pk = 0;
      const b = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      if (b) { const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      o.playsAfter = pk;

      // and the same thing mid-transport must NOT stop the music
      startSeq();
      await new Promise(r => setTimeout(r, 500));
      const ctx1 = AC, msd1 = LIVE.msd;
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1600));
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1100));
      o.stillPlaying = playing;
      o.contextKept = AC === ctx1;
      o.outRebuilt = LIVE.msd !== msd1;
      o.playingLcd = document.getElementById('lcdmsg').textContent;
      stopSeq();
      return o;
    });
    t.ok('the microphone opened and closed', repick.opened && repick.closed);
    t.ok('WITH THE TRANSPORT STOPPED, closing it reopens the audio — what a reload does',
      repick.rebuiltWhenIdle, 'context replaced: ' + repick.rebuiltWhenIdle);
    t.ok('and says so, in a message that is not immediately overwritten',
      /reopened/.test(repick.idleLcd), '"' + repick.idleLcd + '"');
    t.ok('without losing samples, pads, or the ability to play',
      repick.buffersKept === repick.buffersBefore && repick.padsKept === repick.padsBefore
      && repick.playsAfter > 0.05,
      repick.buffersBefore + '→' + repick.buffersKept + ' buffers, '
      + repick.padsBefore + '→' + repick.padsKept + ' pads, peak ' + repick.playsAfter.toFixed(4));
    t.ok('WHILE PLAYING it rebuilds only the output and does not stop the music',
      repick.stillPlaying && repick.contextKept && repick.outRebuilt);
    t.ok('and points at RESET OUTPUT in case the lighter rebuild did not take',
      /RESET OUTPUT/.test(repick.playingLcd), '"' + repick.playingLcd.slice(0, 90) + '"');

    t.head('SAMPLES LAND ON EMPTY PADS, AND OVERWRITING ASKS FIRST');
    /* Reported: "I want to click like ten samples from my list and have them go
       to separate empty pads unless I select a pad to overwrite." They all went
       to pad 1, each overwriting the last. The chooser to do it properly
       already existed — pickTargetPad walks the bank for an empty pad — but
       loadIntoTarget and libToPad wrote to S.editPad directly and never called
       it, so the default was "overwrite the selection" rather than "use an
       empty pad". */
    const land = await page.evaluate(async () => {
      const o = {};
      /* These two sections empty the kit on purpose, so the session is put
         back at the end — later sections measure real audio and a suite that
         leaves the app gutted makes every check after it meaningless. */
      window.__restore = structuredClone(snapshotSession());
      S.pads.forEach(p => { p.bufId = -1; p.name = ''; });
      S.editPad = 0; manualPad = false;
      const mk = () => { const b = AC.createBuffer(1, 2048, AC.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 12) * 0.5;
        return b; };
      const landed = [];
      for (let i = 0; i < 10; i++) { loadIntoTarget(mk(), 'sample' + i); landed.push(padName(S.editPad)); }
      o.landed = landed;
      o.distinct = new Set(landed).size;
      o.loaded = S.pads.filter(p => p.bufId >= 0).length;

      const real = window.confirm;
      let asked = null;
      window.confirm = m => { asked = m; return false; };
      S.editPad = 3; manualPad = true;
      const nameBefore = S.pads[3].name;
      o.declined = loadIntoTarget(mk(), 'newsound') === false;
      o.untouched = S.pads[3].name === nameBefore;
      o.asked = (asked || '').split('\n')[0];
      o.askedNamesBoth = /newsound/.test(asked || '') && /sample3/.test(asked || '');
      window.confirm = () => true;
      S.editPad = 3; manualPad = true;
      loadIntoTarget(mk(), 'newsound');
      o.overwroteOnAccept = S.pads[3].name === 'newsound';
      /* An empty pad must never ask — ten clicks with ten dialogs is worse
         than the bug. */
      let askedOnEmpty = false;
      window.confirm = () => { askedOnEmpty = true; return true; };
      S.editPad = 40; manualPad = true;
      loadIntoTarget(mk(), 'quiet');
      o.silentOnEmpty = !askedOnEmpty;
      window.confirm = real;
      return o;
    });
    t.ok('ten samples land on ten DIFFERENT pads',
      land.distinct === 10 && land.loaded >= 10, land.landed.join(' '));
    t.ok('they fill empty pads in order', land.landed[0] === 'A01' && land.landed[9] === 'A10');
    t.ok('choosing a full pad deliberately asks before replacing',
      /Replace what is on A04/.test(land.asked), '"' + land.asked + '"');
    t.ok('and the question names both the sound going and the sound arriving',
      land.askedNamesBoth);
    t.ok('declining leaves the pad exactly as it was', land.declined && land.untouched);
    t.ok('accepting replaces it', land.overwroteOnAccept);
    t.ok('AND AN EMPTY PAD IS NEVER QUESTIONED — no dialog per click',
      land.silentOnEmpty);

    t.head('TO PAD SAYS WHERE IT IS GOING BEFORE YOU TAP IT');
    const topad = await page.evaluate(async () => {
      const o = {};
      S.pads.forEach(p => { p.bufId = -1; p.name = ''; });
      S.editPad = 0; manualPad = false;
      S.trax[0].bufId = 0; S.trax[0].name = 'take1';
      traxFxSel = 0; drawTraxFx();
      const btn = document.getElementById('tfxPad');
      o.emptyTargetLabel = btn.innerHTML;
      o.emptyTargetPlain = btn.className === '';
      o.emptyTargetTitle = btn.title;
      S.pads.forEach(p => { if (p.bufId < 0) { p.bufId = 0; p.name = 'held'; } });
      drawTraxFx();
      o.fullTargetLabel = document.getElementById('tfxPad').innerHTML;
      o.fullTargetWarn = document.getElementById('tfxPad').className === 'warn';
      o.fullTargetTitle = document.getElementById('tfxPad').title;
      S.trax[1].bufId = -1; traxFxSel = 1; drawTraxFx();
      o.emptyLaneDisabled = document.getElementById('tfxPad').disabled;
      /* Reading the panel must not consume a deliberate pad choice — it peeks. */
      S.editPad = 7; manualPad = true;
      drawTraxFx(); drawTraxFx();
      o.manualSurvivedRedraw = manualPad === true;
      manualPad = false;
      const snap = window.__restore;
      applySessionDoc(structuredClone(snap), docToBuffers(structuredClone(snap)));
      o.restoredPads = S.pads.filter(p => p.bufId >= 0).length;
      return o;
    });
    t.ok('it names the empty pad it will use', /TO PAD → A\d\d/.test(topad.emptyTargetLabel),
      topad.emptyTargetLabel);
    t.ok('plainly, when nothing is at risk',
      topad.emptyTargetPlain && /is empty/.test(topad.emptyTargetTitle));
    t.ok('and marks itself when the target already holds a sound',
      topad.fullTargetWarn && /⚠/.test(topad.fullTargetLabel), topad.fullTargetLabel);
    t.ok('saying what is on it and that you will be asked',
      /already holds/.test(topad.fullTargetTitle) && /asked/.test(topad.fullTargetTitle));
    t.ok('a lane with no take disables it rather than misleading', topad.emptyLaneDisabled);
    t.ok('and merely LOOKING at the panel does not spend a deliberate pad choice',
      topad.manualSurvivedRedraw);
    t.ok('the kit these two sections emptied is put back for what follows',
      topad.restoredPads >= 8, topad.restoredPads + ' pads loaded again');

    t.head('AN ARMED LANE RECORDS WHAT THE SOURCE SAYS WHEN IT ROLLS');
    /* Reported: "when I open the app and go to mic to record something it
       doesn't record unless I go to trax and select mic". The MIC panel's own
       RECORD button was fine; the broken order was arming a lane FIRST and
       turning the microphone on afterwards.
       R168 snapshotted the source at arm time. Turning the mic on sets TRAX
       SOURCE to MIC — that has worked since R157 — but the armed lane still
       held the source it was armed with, so PLAY recorded the PRE-MASTER bus:
       measured at peak 0.87, which is the demo song, not a voice. Selecting
       MIC in TRAX "fixed" it only because it made the user re-arm.
       Both orders are checked, because the whole bug was that one of them
       behaved differently from the other. */
    await ctx.grantPermissions(['microphone']).catch(() => {});
    const order = await page.evaluate(async () => {
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      const o = {};
      const run = async (micFirst) => {
        S.trax.forEach(t => { t.bufId = -1; });
        if (micOn) { document.getElementById('btnMicOn').click(); await new Promise(r => setTimeout(r, 1200)); }
        document.getElementById('traxSrc').value = 'bus';
        if (micFirst) {
          document.getElementById('btnMicOn').click();
          await new Promise(r => setTimeout(r, 1600));
          await armTrack(0);
        } else {
          await armTrack(0);
          document.getElementById('btnMicOn').click();
          await new Promise(r => setTimeout(r, 1600));
        }
        const src = document.getElementById('traxSrc').value;
        await playPressed();
        await new Promise(r => setTimeout(r, 1500));
        const capturing = traxCap ? traxCap.srcMode : 'none';
        stopSeq();
        await new Promise(r => setTimeout(r, 1100));
        const peak = S.trax[0].bufId >= 0 ? pk(S.buffers[S.trax[0].bufId]) : 0;
        const lcd = document.getElementById('lcdmsg').textContent;
        if (micOn) { document.getElementById('btnMicOn').click(); await new Promise(r => setTimeout(r, 1200)); }
        return { src, capturing, peak, lcd };
      };
      o.micThenArm = await run(true);
      o.armThenMic = await run(false);
      return o;
    });
    t.ok('mic on THEN arm records the microphone',
      order.micThenArm.src === 'mic' && order.micThenArm.capturing === 'mic',
      'source ' + order.micThenArm.src + ', captured ' + order.micThenArm.capturing);
    t.ok('ARM THEN MIC ON records the microphone TOO — the order must not matter',
      order.armThenMic.src === 'mic' && order.armThenMic.capturing === 'mic',
      'source ' + order.armThenMic.src + ', captured ' + order.armThenMic.capturing
      + ' (was "bus" — it recorded the demo song instead of the voice)');
    t.ok('and both takes say they came from MIC',
      /from MIC/.test(order.micThenArm.lcd) && /from MIC/.test(order.armThenMic.lcd),
      '"' + order.armThenMic.lcd.slice(0, 60) + '"');
    t.ok('both actually captured audio',
      order.micThenArm.peak > 0.05 && order.armThenMic.peak > 0.05,
      order.micThenArm.peak.toFixed(3) + ' / ' + order.armThenMic.peak.toFixed(3));

    t.head('A PREVIEW CANNOT BE LEFT STUCK BY THE CONTEXT GOING AWAY');
    /* Reported: previewing without turning the mic off first plays silent, the
       sound never comes back, and the button "shows it as playing".
       rebuildAudio stops the jam, the tape voices, the instruments and the amp
       — the lane preview was added after that list and never joined it. So a
       preview running when the context is replaced is orphaned on a dead one:
       onended never arrives, traxPrev stays set, and the button sits lit for
       ever. Closing the mic is now itself a thing that replaces the context,
       which is how this surfaced. */
    const stuck = await page.evaluate(async () => {
      const o = {};
      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1600));
      document.getElementById('btnMicRec').click();
      await new Promise(r => setTimeout(r, 1300));
      document.getElementById('btnMicRec').click();
      await new Promise(r => setTimeout(r, 1100));
      o.gotTake = S.trax[0].bufId >= 0;
      o.micStillOn = micOn;

      const btn = () => document.querySelectorAll('#traxlist .row')[0]
        .querySelector('button[aria-label^="Preview track 1"], button[aria-label^="Stop previewing track 1"]');
      btn().click();
      await new Promise(r => setTimeout(r, 250));
      o.started = !!traxPrev;
      o.ctxBefore = traxPrev ? traxPrev.ctx === AC : false;

      document.getElementById('btnMicOn').click();       // closes the mic -> rebuilds
      await new Promise(r => setTimeout(r, 1600));
      o.cleared = !traxPrev;
      o.backToPlayButton = !!document.querySelectorAll('#traxlist .row')[0]
        .querySelector('button[aria-label^="Preview track 1"]');

      let pk = 0;
      const b = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      if (b) { const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      o.appStillPlays = pk;

      btn().click();
      await new Promise(r => setTimeout(r, 250));
      o.worksAgain = !!traxPrev;
      traxPreviewStop();

      /* And the self-heal: a preview left pointing at a dead context is not
         playing, whatever the flag says. */
      traxPrev = { i: 0, src: {}, g: {}, ctx: { state: 'closed' } };
      o.healed = traxPreviewAlive() === false && traxPrev === null;
      return o;
    });
    t.ok('a take was recorded with the mic left on', stuck.gotTake && stuck.micStillOn);
    t.ok('the preview starts on the live context', stuck.started && stuck.ctxBefore);
    t.ok('CLOSING THE MIC MID-PREVIEW DOES NOT LEAVE IT STUCK', stuck.cleared);
    t.ok('and the button goes back to ▶ rather than staying lit',
      stuck.backToPlayButton);
    t.ok('the app still makes sound afterwards', stuck.appStillPlays > 0.05,
      'peak ' + stuck.appStillPlays.toFixed(4));
    t.ok('and preview works again straight away', stuck.worksAgain);
    t.ok('a preview pointing at a dead context reports itself as not playing',
      stuck.healed);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
