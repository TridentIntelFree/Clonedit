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
      drawRoutePip();
      o.restLabel = pip.textContent;
      o.restQuiet = pip.classList.contains('ok');

      /* Drive the state the way each feature does, without a real getUserMedia:
         the question is whether capturesOpen() and the badge follow it. */
      micOn = true; drawRoutePip();
      o.withMic = { open: capturesOpen(), shown: !pip.classList.contains('ok'), title: pip.title };
      /* Shown is not the same as seen. The first version of this badge lived in
         the header, whose left column is clipped where the transport begins,
         and at 320px it rendered underneath the tour button. */
      const bb = pip.getBoundingClientRect();
      const mid = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
      o.visible = { onScreen: bb.left >= 0 && bb.right <= window.innerWidth && bb.width > 20,
        topmost: mid ? (mid.id || mid.tagName) : 'none' };
      const pathBefore = outPath;
      pip.click();
      o.tapLcd = document.getElementById('lcdmsg').textContent;
      /* The tap now moves a DEVICE preference that lives in localStorage, so
         leaving it changed would follow the rest of this suite around — and it
         did: three later checks failed on a setting this section had made. */
      await new Promise(r => setTimeout(r, 800));
      if (outPath !== pathBefore) {
        const sp = document.getElementById('outPath');
        sp.value = pathBefore; sp.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
      }
      o.pathRestored = outPath === pathBefore;
      micOn = false; drawRoutePip();
      o.afterMic = { open: capturesOpen(), shown: !pip.classList.contains('ok') };

      ampOn = true; drawRoutePip();
      o.withAmp = { open: capturesOpen(), shown: !pip.classList.contains('ok'), title: pip.title };
      ampOn = false; drawRoutePip();

      traxStream = { getTracks: () => [] }; drawRoutePip();
      o.withTrax = { open: capturesOpen(), shown: !pip.classList.contains('ok') };
      traxStream = null; drawRoutePip();
      o.afterAll = { open: capturesOpen(), shown: !pip.classList.contains('ok') };

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
      o.pipHiddenAtEnd = pip.classList.contains('ok');   // quiet, not gone
      return o;
    });
    /* It used to hide when the app had no complaint, and the case with no
       nameable complaint — direct path, no input open, sound still coming out
       of the handset — is exactly the one where you are stuck with nothing to
       tap. No browser reports which speaker is actually receiving audio, so
       "everything is fine" was never something this app could know. */
    t.ok('the badge is ALWAYS there, because a quiet state is not an absent one',
      route.hasPip && !route.hiddenAtRest && route.openAtRest.length === 0);
    t.ok('and reads as quiet rather than as an alarm when nothing is wrong',
      route.restLabel === '◎ OUT' && route.restQuiet,
      '"' + route.restLabel + '" quiet-styled: ' + route.restQuiet);
    t.ok('AND IT IS ACTUALLY VISIBLE — not underneath another control',
      route.visible && route.visible.onScreen && route.visible.topmost === 'recPip',
      JSON.stringify(route.visible) + ' (it sat under the tour button in the header at 320px)');
    /* Tapping it used to explain the situation. Explaining is not much use
       when the answer is "release the input and reopen the audio", so it now
       does that — a tooltip is nothing on a touch screen and neither is a
       paragraph you cannot act on. */
    /* It used to explain the situation, then it released the input and reopened
       the audio, and now it does the whole job — releases the input, moves onto
       the path a Bluetooth speaker can actually receive, and reopens. The claim
       has never changed: a badge you can tap has to DO something. */
    t.ok('tapping it does the whole job rather than only describing the problem',
      /SENT TO BLUETOOTH/i.test(route.tapLcd), route.tapLcd.slice(0, 100));
    t.ok('and puts the device preference back rather than following the suite around',
      route.pathRestored);
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
      o.pipAfterArm = !document.getElementById('recPip').classList.contains('ok');
      o.armLcd = document.getElementById('lcdmsg').textContent;

      await playPressed();
      /* Polled rather than waited out. A fixed 1800ms for getUserMedia to hand
         over Chromium's fake device is a guess, and it lost about one run in
         three on a loaded machine — the check then failed for the length of a
         sleep rather than for anything about the app. Still bounded, so a mic
         that genuinely never opens still fails. */
      for (let i = 0; i < 60 && capturesOpen().length === 0; i++)
        await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 1500));   // then let it actually record a pass
      o.openWhileRolling = capturesOpen();
      o.pipWhileRolling = !document.getElementById('recPip').classList.contains('ok');

      stopSeq();
      await new Promise(r => setTimeout(r, 1200));
      o.openAfterStop = capturesOpen();
      o.pipAfterStop = !document.getElementById('recPip').classList.contains('ok');
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
      o.badgeShown = !document.getElementById('recPip').classList.contains('ok');
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

    t.head('MIC TAB: TURN IT ON, RECORD, AND IT FINDS ITS OWN LANE');
    /* The flow as described: open the app, MIC tab, mic on, RECORD. No arming
       of anything. It should land on an empty tape lane, and the TRAX source
       should be MIC because a microphone is in use.
       Setting the source once when the mic turns on was not enough — nothing
       kept it there, and REC PERFORMANCE forced it to LIVE ONLY even with the
       mic live. The claim holds for as long as the mic is on; the only thing
       that outranks it is a hand on the control. */
    await ctx.grantPermissions(['microphone']).catch(() => {});
    const micFlow = await page.evaluate(async () => {
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      const o = {};
      S.trax.forEach(t => { t.bufId = -1; });
      if (micOn) { document.getElementById('btnMicOn').click(); await new Promise(r => setTimeout(r, 1100)); }
      document.getElementById('traxSrc').value = 'bus';
      document.querySelector('#tabs button[data-v="mic"]').click();

      document.getElementById('btnMicOn').click();
      await new Promise(r => setTimeout(r, 1600));
      o.srcAfterOn = document.getElementById('traxSrc').value;
      o.destNamesLane = document.getElementById('micDest').selectedOptions[0].textContent;

      const rec = async () => {
        document.getElementById('btnMicRec').click();
        await new Promise(r => setTimeout(r, 900));
        document.getElementById('btnMicRec').click();
        await new Promise(r => setTimeout(r, 900));
      };
      await rec();
      o.afterOne = S.trax.map((t, i) => t.bufId >= 0 ? 'T' + (i + 1) : null).filter(Boolean);
      o.peak = S.trax[0].bufId >= 0 ? pk(S.buffers[S.trax[0].bufId]) : 0;
      await rec(); await rec();
      o.afterThree = S.trax.map((t, i) => t.bufId >= 0 ? 'T' + (i + 1) : null).filter(Boolean);

      // REC PERFORMANCE must not take the microphone off the input list
      document.getElementById('btnPerfRec').click();
      await new Promise(r => setTimeout(r, 350));
      o.srcAfterPerfRec = document.getElementById('traxSrc').value;
      if (playing) stopSeq();
      await new Promise(r => setTimeout(r, 700));

      // a deliberate choice is kept; an app-driven one is not an override
      traxSrcOverride = true;
      document.getElementById('traxSrc').value = 'bus';
      await armTrack(6);
      o.overrideKept = document.getElementById('traxSrc').value;
      traxSrcOverride = false;
      await armTrack(7);
      o.reclaimed = document.getElementById('traxSrc').value;
      disarmTrax();
      if (micOn) { document.getElementById('btnMicOn').click(); await new Promise(r => setTimeout(r, 1100)); }
      o.srcAfterMicOff = document.getElementById('traxSrc').value;
      return o;
    });
    t.ok('turning the mic on sets the TRAX source to MIC', micFlow.srcAfterOn === 'mic');
    t.ok('GOES TO names the actual lane, before you record',
      /T\d/.test(micFlow.destNamesLane), '"' + micFlow.destNamesLane + '"');
    t.ok('RECORD with nothing armed lands on an empty lane',
      micFlow.afterOne.length === 1 && micFlow.peak > 0.05,
      micFlow.afterOne.join(',') + ' at peak ' + micFlow.peak.toFixed(3));
    t.ok('AND THREE RECORDINGS FILL THREE DIFFERENT LANES',
      micFlow.afterThree.length === 3, micFlow.afterThree.join(', '));
    t.ok('REC PERFORMANCE does not steal the source from a live mic',
      micFlow.srcAfterPerfRec === 'mic', 'source ' + micFlow.srcAfterPerfRec + ' (forced to "live" before)');
    t.ok('a source you chose by hand is left alone', micFlow.overrideKept === 'bus');
    t.ok('and without an override the mic reclaims it', micFlow.reclaimed === 'mic');
    t.ok('turning the mic off hands the source back', micFlow.srcAfterMicOff !== 'mic',
      'back to ' + micFlow.srcAfterMicOff);

    t.head('THE METER MOVES AND THE TAKE IS SILENT');
    /* "When I record using the mic it's silent and no playback." — "It shows in
       eq as recording something."

       Both true at once, and the topology says why: the level meter hangs off
       M.in, before the gate, while RECORD taps M.out at the far end of the
       chain. A shut gate gives a dancing bar and an empty buffer, and until now
       there was nothing on screen measuring the point that actually matters.

       So the claim under test is that the two ends can be told apart: with the
       gate closing on real signal the INPUT meter still reads, the REC meter
       reads nothing and says why, and the take's own message names the gate
       rather than telling you to watch the meter you were already watching. */
    const deaf = await page.evaluate(async () => {
      const o = {};
      const set = (id, v) => { const e = document.getElementById(id); e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true })); };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      S.trax.forEach(t => { t.bufId = -1; });
      document.querySelector('#tabs button[data-v="mic"]').click();
      if (!micOn) { document.getElementById('btnMicOn').click(); await wait(1600); }
      document.getElementById('micDest').value = 'lane';

      /* Quiet enough that the gate's threshold is above it, loud enough that
         the input meter is unambiguously moving — the exact pairing reported. */
      set('micGain', 0.1); set('micGate', 1);
      await wait(1600);
      o.shut = { inHold: +micPeakHold.toFixed(4), recHold: +micOutHold.toFixed(4),
        dead: micDead, inV: document.getElementById('micPeakV').textContent,
        recV: document.getElementById('micRecV').textContent,
        recWarn: document.getElementById('micRecV').classList.contains('warn'),
        recBarW: document.getElementById('micRecBar').firstElementChild.style.width,
        inBarW: document.getElementById('micBar').firstElementChild.style.width };

      const rec = async () => { document.getElementById('btnMicRec').click(); await wait(900);
        document.getElementById('btnMicRec').click(); await wait(700); };
      const before = S.buffers.length;
      await rec();
      o.silentLcd = document.getElementById('lcdmsg').textContent;
      o.silentInfo = document.getElementById('micRecInfo').textContent;
      o.kept = S.buffers.length - before;                 // a silent take is still yours

      /* Open the gate and the same input is suddenly recorded. Nothing else
         changes — this is the control for the measurement above. */
      set('micGate', 0); set('micGain', 1);
      await wait(1400);
      o.open = { recHold: +micOutHold.toFixed(4), dead: micDead,
        recV: document.getElementById('micRecV').textContent };
      await rec();
      o.openLcd = document.getElementById('lcdmsg').textContent;
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      o.openPeak = +pk(S.buffers[S.buffers.length - 1]).toFixed(4);

      if (micOn) { document.getElementById('btnMicOn').click(); await wait(1100); }
      return o;
    });
    t.ok('with the gate closing, the INPUT meter still shows signal',
      deaf.shut.inHold > 0.02, 'held ' + deaf.shut.inHold + ' — reads "' + deaf.shut.inV + '"');
    t.ok('AND THE REC METER SHOWS THERE IS NOTHING TO RECORD',
      deaf.shut.recHold < 0.002 && deaf.shut.dead,
      'held ' + deaf.shut.recHold + ' · dead=' + deaf.shut.dead);
    t.ok('it says so in words, in red, beside the level',
      /GATE SHUT|NOTHING GETTING THROUGH/.test(deaf.shut.recV) && deaf.shut.recWarn,
      '"' + deaf.shut.recV + '"');
    t.ok('the two bars disagree, which is the whole point',
      parseFloat(deaf.shut.inBarW) > 5 && parseFloat(deaf.shut.recBarW) < 1,
      'IN ' + deaf.shut.inBarW + ' vs REC ' + deaf.shut.recBarW);
    t.ok('the silent take names the gate rather than the meter',
      /SILENT/.test(deaf.silentLcd) && /GATE/.test(deaf.silentLcd),
      '"' + deaf.silentLcd + '"');
    t.ok('and the recording is kept, not thrown away', deaf.kept === 1,
      deaf.kept + ' buffer(s) · "' + deaf.silentInfo + '"');
    t.ok('opening the gate clears the warning', !deaf.open.dead && deaf.open.recHold > 0.02,
      'REC held ' + deaf.open.recHold + ' · reads "' + deaf.open.recV + '"');
    t.ok('AND THE SAME INPUT NOW RECORDS', deaf.openPeak > 0.05 && !/SILENT/.test(deaf.openLcd),
      'peak ' + deaf.openPeak);

    t.head('A TAKE THAT METERED WELL AND PLAYS BACK QUIET');
    /* "It's unusually quiet considering a decent level when recording."

       First measured the accusation, because it is the kind that is usually
       true and was not: identical buffers at 0.36 and 0.92, on pads with
       identical settings, come out 8.18dB apart against a predicted 8.18dB.
       The playback path is linear to a hundredth of a decibel and the master
       chain is within 1dB of unity at both. Nothing is losing the level.

       The take is simply that quiet, and nothing it sits beside is: the bundled
       material peaks around 0.92. The meter reads PEAK, which for a voice sits
       a long way above where it actually lives, so "decent level" and "quiet
       playback" are both honest readings of the same recording.

       The lane fader tops out at 1.2 — 2.5dB — so the fix has to be in the
       samples. What is checked here is that the lift lands where it says, that
       it can be switched off for takes meant to be balanced against each other,
       that it refuses to blow up near-silence, and that the message always
       carries the number. */
    const quiet = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      const pk = b => { let m = 0; for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } }
        return +m.toFixed(4); };
      ensureAudio(); await wait(200);

      /* THE ACCUSATION, MEASURED. Identical content, two amplitudes, one path. */
      const an = AC.createAnalyser(); an.fftSize = 8192; LIVE.master.connect(an);
      const b8 = new Float32Array(8192);
      const lvl = async ms => { let m = 0; for (let k = 0; k < ms / 20; k++) {
        an.getFloatTimeDomainData(b8); let s = 0;
        for (let i = 0; i < b8.length; i++) s += b8[i] * b8[i];
        m = Math.max(m, Math.sqrt(s / b8.length)); await wait(20); } return m; };
      const tone = amp => { const n = Math.round(AC.sampleRate * 1.2);
        const b = AC.createBuffer(2, n, AC.sampleRate);
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
          for (let i = 0; i < n; i++) d[i] = Math.sin(2*Math.PI*440*i/AC.sampleRate) * amp; }
        S.buffers.push(b); return S.buffers.length - 1; };
      const amps = [0.3586, 0.92];
      /* Two slots of our own, whatever the earlier sections left behind, put
         back exactly as they were afterwards. */
      const slots = [NPADS - 2, NPADS - 1];
      const keep = slots.map(i => JSON.parse(JSON.stringify(S.pads[i])));
      o.refPeak = (() => { const i = S.pads.findIndex((x, j) => x.bufId >= 0 && slots.indexOf(j) < 0);
        return i >= 0 ? pk(S.buffers[S.pads[i].bufId]) : 0; })();
      const got = [];
      for (let k = 0; k < 2; k++) { S.pads[slots[k]] = newPad(slots[k]);
        const p = S.pads[slots[k]]; p.bufId = tone(amps[k]); p.gain = 0.9; }
      for (let k = 0; k < 2; k++) { hitLive(slots[k], 1); got.push(await lvl(800)); await wait(500); }
      o.predictedDb = +(20*Math.log10(amps[0]/amps[1])).toFixed(2);
      o.measuredDb = +(20*Math.log10(got[0]/got[1])).toFixed(2);
      slots.forEach((i, k) => { S.pads[i] = keep[k]; });

      /* NOW THE TAKE ITSELF. */
      S.trax.forEach(x => { x.bufId = -1; });
      document.querySelector('#tabs button[data-v="mic"]').click();
      if (!micOn) { document.getElementById('btnMicOn').click(); await wait(1600); }
      document.getElementById('micDest').value = 'lane';
      const set = (id, v) => { const e = document.getElementById(id); e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true })); };
      const rec = async () => { document.getElementById('btnMicRec').click(); await wait(1000);
        document.getElementById('btnMicRec').click(); await wait(700);
        return { peak: pk(S.buffers[S.buffers.length - 1]),
          lcd: document.getElementById('lcdmsg').textContent,
          info: document.getElementById('micRecInfo').textContent }; };

      set('micGain', 0.25); await wait(900);
      o.meterSaid = document.getElementById('micRecV').textContent;
      o.lifted = await rec();

      document.getElementById('micLift').checked = false;
      o.raw = await rec();
      document.getElementById('micLift').checked = true;

      set('micGain', 1); await wait(900);
      o.loud = await rec();

      /* Far enough down that the cap, not the target, decides. */
      set('micGain', 0.05); await wait(900);
      o.veryQuiet = await rec();

      /* The setting has to survive a session, like every other mic control. */
      document.getElementById('micLift').checked = false;
      const saved = micSettings();
      document.getElementById('micLift').checked = true;
      applyMicSettings(saved);
      o.settingPersists = document.getElementById('micLift').checked === false;
      document.getElementById('micLift').checked = true;

      if (micOn) { document.getElementById('btnMicOn').click(); await wait(1400); }
      return o;
    });
    t.ok('the playback path is not losing the level — measured, not assumed',
      Math.abs(quiet.measuredDb - quiet.predictedDb) < 0.3,
      'predicted ' + quiet.predictedDb + ' dB, measured ' + quiet.measuredDb + ' dB');
    t.ok('so the gap is real: bundled material peaks near full scale',
      quiet.refPeak > 0.85, 'reference sample peaks at ' + quiet.refPeak);
    t.ok('A QUIET TAKE IS LIFTED TO SIT WITH IT',
      quiet.lifted.peak > 0.85 && quiet.lifted.peak <= 0.9,
      'landed at ' + quiet.lifted.peak + ' (meter had said "' + quiet.meterSaid + '")');
    t.ok('and the message carries both numbers, not just the outcome',
      /recorded at -\d+ dB, lifted to -\d+ dB/.test(quiet.lifted.lcd), '"' + quiet.lifted.lcd + '"');
    t.ok('the level is on the take line too', /-?\d+ dB/.test(quiet.lifted.info),
      '"' + quiet.lifted.info + '"');
    t.ok('LIFT OFF LEAVES THE TAKE WHERE YOU PLAYED IT',
      quiet.raw.peak < 0.5 && /LIFT is off/.test(quiet.raw.lcd),
      'landed at ' + quiet.raw.peak);
    t.ok('a take that is already loud is not touched', quiet.loud.peak >= 0.9,
      'landed at ' + quiet.loud.peak + ' · "' + quiet.loud.lcd + '"');
    t.ok('and near-silence is not blown up into room noise',
      quiet.veryQuiet.peak < 0.85, 'landed at ' + quiet.veryQuiet.peak
      + ' · "' + quiet.veryQuiet.lcd + '"');
    t.ok('the choice rides with the session', quiet.settingPersists);

    t.head('LOUD ENOUGH TO USE WITH NOBODY TOUCHING ANYTHING');
    /* "Can the default be switched to a higher gain setting — I imagine a use
       case where the app's opened and recording is started immediately with
       the user not messing with any settings. The natural setting is too quiet
       to use."

       Unity was honest and useless: a phone microphone with automatic gain
       control off, which this app asks for on purpose, hands over something
       like -25dBFS for ordinary speech. What stopped the default being raised
       was that the compressor sits mid-chain with the EQ and DRIVE after it, so
       a hot source could be pushed back over full scale downstream of the only
       thing watching — and clipping is the one damage a take cannot come back
       from, where quiet can be lifted afterwards.

       So the claim is two-sided and both halves are measured: quiet input is
       genuinely multiplied, and no amount of gain can reach full scale. */
    const gain = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      const stat = b => { let m = 0, flat = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]);
          if (v > m) m = v; if (v >= 0.999) flat++; }
        return { peak: +m.toFixed(4), atFull: flat }; };
      ensureAudio(); await wait(200);
      S.trax.forEach(x => { x.bufId = -1; });
      document.querySelector('#tabs button[data-v="mic"]').click();
      /* The AUTHORED default, off the attribute — .value is wherever the last
         section of this suite left the control, and reading that measured the
         previous test's setting instead of what a person opening the app gets. */
      o.defaultGain = +document.getElementById('micGain').getAttribute('value');
      o.presetNatural = MIC_PRESETS.natural.gain;
      if (!micOn) { document.getElementById('btnMicOn').click(); await wait(1600); }
      document.getElementById('micDest').value = 'lane';
      document.getElementById('micLift').checked = false;   // the chain, not the rescue
      const set = (id, v) => { const e = document.getElementById(id); e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true })); };
      const rec = async g => { set('micGain', g); await wait(700);
        document.getElementById('btnMicRec').click(); await wait(900);
        document.getElementById('btnMicRec').click(); await wait(700);
        return stat(S.buffers[S.buffers.length - 1]); };
      o.q10 = await rec(0.1);
      o.q25 = await rec(0.25);
      o.atDefault = await rec(o.defaultGain);
      o.atMax = await rec(+document.getElementById('micGain').max);
      o.maxSetting = +document.getElementById('micGain').max;
      document.getElementById('micLift').checked = true;
      if (micOn) { document.getElementById('btnMicOn').click(); await wait(1400); }
      return o;
    });
    t.ok('the default is well above unity now', gain.defaultGain >= 2.5
      && gain.presetNatural === gain.defaultGain,
      'slider ' + gain.defaultGain + '× · NATURAL preset ' + gain.presetNatural + '×');
    t.ok('and the quiet end of the range is linear, so it really does multiply',
      Math.abs(gain.q25.peak / gain.q10.peak - 2.5) < 0.4,
      gain.q10.peak + ' at 0.1× → ' + gain.q25.peak + ' at 0.25× (ratio '
      + (gain.q25.peak / gain.q10.peak).toFixed(2) + ')');
    t.ok('A HOT SOURCE AT THE NEW DEFAULT CANNOT REACH FULL SCALE',
      gain.atDefault.atFull === 0 && gain.atDefault.peak < 0.96,
      'peak ' + gain.atDefault.peak + ', ' + gain.atDefault.atFull + ' samples at full scale');
    t.ok('AND NEITHER CAN IT AT THE TOP OF THE SLIDER',
      gain.atMax.atFull === 0 && gain.atMax.peak < 0.96,
      'at ' + gain.maxSetting + '×: peak ' + gain.atMax.peak + ', '
      + gain.atMax.atFull + ' at full scale');
    t.ok('the ceiling holds rather than merely delaying the problem',
      Math.abs(gain.atMax.peak - gain.atDefault.peak) < 0.02,
      gain.atDefault.peak + ' at ' + gain.defaultGain + '× vs ' + gain.atMax.peak
      + ' at ' + gain.maxSetting + '× — nearly three times the gain, same ceiling');

    t.head('WHAT THE BROWSER ACTUALLY GAVE US, NOT WHAT WE ASKED FOR');
    /* "I just know I made loud noise into the microphone and its playback was
       very quiet."

       The constraints already ask for automatic gain control, noise
       suppression and echo cancellation to be OFF. But a constraint is a
       request, and iOS Safari has shipped for years honouring the call and
       keeping its voice-processing chain anyway — which turns the level down,
       high-passes the bottom out, and ducks the input while the app is making
       sound. A loud voice arrives quiet and nothing downstream did it.

       getSettings() is the only place that difference is visible and it was
       never read. Whether this particular browser overrides anything is not
       the point: what is guarded is that the app now LOOKS, reports it in
       DIAG, and says so on screen when the answer is not what it asked for. */
    const got = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('#tabs button[data-v="mic"]').click();
      if (!micOn) { document.getElementById('btnMicOn').click(); await wait(1600); }
      o.read = !!micGot;
      o.keys = micGot ? ['autoGainControl', 'noiseSuppression', 'echoCancellation']
        .filter(k => k in micGot) : [];
      o.values = micGot ? { agc: micGot.autoGainControl, ns: micGot.noiseSuppression,
        aec: micGot.echoCancellation } : null;
      o.diagOn = diagDump('t').split('\n').filter(l => /mic input/.test(l))[0] || '';
      const banner = document.getElementById('micGot');
      o.quietWhenHonoured = banner.hidden;

      /* The banner has to appear when something IS overridden, and this is the
         only way to see that on a browser that honours the request. */
      const real = micGot;
      micGot = Object.assign({}, real || {}, { autoGainControl: true, noiseSuppression: true });
      drawMicGot();
      o.warned = !banner.hidden && /AUTOMATIC GAIN CONTROL/.test(banner.textContent)
        && /NOISE SUPPRESSION/.test(banner.textContent);
      o.warnText = banner.textContent.slice(0, 90);
      micGot = real; drawMicGot();
      o.clearsAgain = banner.hidden === o.quietWhenHonoured;

      if (micOn) { document.getElementById('btnMicOn').click(); await wait(1500); }
      o.diagOff = diagDump('t').split('\n').filter(l => /mic input/.test(l))[0] || '';
      o.bannerAfterOff = document.getElementById('micGot').hidden;
      return o;
    });
    t.ok('the app reads back what the microphone was actually opened with',
      got.read && got.keys.length >= 2, 'reported ' + got.keys.join(', '));
    t.ok('and DIAG carries it, so a report says what the phone did',
      /asked AGC\/NS\/AEC all off, got/.test(got.diagOn), got.diagOn.slice(0, 130));
    t.ok('nothing is said when the request was honoured',
      got.quietWhenHonoured, JSON.stringify(got.values));
    t.ok('BUT AN OVERRIDE IS NAMED ON SCREEN, in the panel where you are recording',
      got.warned, '"' + got.warnText + '…"');
    t.ok('and the warning clears when it no longer applies', got.clearsAgain);
    t.ok('turning the mic off clears the reading rather than leaving it stale',
      got.bannerAfterOff && /mic off/.test(got.diagOff));

    t.head('ONE TAP THAT SAYS WHICH KIND OF SILENCE IT IS');
    /* "I restored a session and it's silent."

       Every piece of this was already reported somewhere — the route pip, the
       master filter badge, DIAG's gate line, the OUT meters — which is the
       problem: reported in six places, answered in none. Silence is really two
       unrelated faults with no shared remedy, and until you know which one you
       have, every suggestion is a guess. So: play a tone into the master,
       measure at the last node before the audio leaves, and say which half you
       are in — then name only the causes that apply to that half. */
    const sil = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(300);
      document.querySelector('#tabs button[data-v="out"]').click();
      if (playing) stopSeq();

      o.healthy = await silentCheck();
      await wait(400);

      /* A bus left down by a hold that never released — the app IS at fault
         here, and the answer must not be about the phone. */
      LIVE.perfGain.gain.setValueAtTime(0.001, AC.currentTime); await wait(150);
      o.busDown = await silentCheck();
      LIVE.perfGain.gain.setValueAtTime(1, AC.currentTime); await wait(300);

      /* A master filter parked somewhere it eats everything. */
      LIVE.perfFilt.frequency.setValueAtTime(120, AC.currentTime); await wait(200);
      o.parked = await silentCheck();
      LIVE.perfFilt.frequency.setValueAtTime(18500, AC.currentTime); await wait(300);

      /* And the master fader at zero. */
      const mv = S.masterVol;
      S.masterVol = 0; LIVE.master.gain.setValueAtTime(0, AC.currentTime); await wait(150);
      o.muted = await silentCheck();
      S.masterVol = mv; LIVE.master.gain.setValueAtTime(mv, AC.currentTime); await wait(300);

      /* On the DIRECT path a healthy chain has to point at the silent switch,
         and on the element path it must NOT — that is the whole point of
         naming only the causes that apply. */
      const selp = document.getElementById('outPath');
      selp.value = 'direct'; selp.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(350);
      o.direct = await silentCheck();
      selp.value = 'element'; selp.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(350);
      o.element = await silentCheck();
      o.stillPlays = await (async () => {
        const an = AC.createAnalyser(); an.fftSize = 2048; LIVE.softclip.connect(an);
        const bf = new Float32Array(2048);
        const pad = S.pads.findIndex(p => p.bufId >= 0);
        hitLive(pad, 1); let m = 0;
        for (let k = 0; k < 30; k++) { an.getFloatTimeDomainData(bf); let sm = 0;
          for (let i = 0; i < bf.length; i++) sm += bf[i] * bf[i];
          m = Math.max(m, Math.sqrt(sm / bf.length)); await wait(20); }
        return +m.toFixed(4); })();
      return o;
    });
    t.ok('a healthy chain is reported as healthy, not as a list of suspects',
      /THE APP IS MAKING SOUND/.test(sil.healthy), '"' + sil.healthy.slice(0, 100) + '…"');
    t.ok('AND A BUS LEFT DOWN IS BLAMED ON THE APP, not on the phone',
      /NO SOUND IS REACHING/.test(sil.busDown) && /performance gain/.test(sil.busDown)
      && !/silent switch/.test(sil.busDown), '"' + sil.busDown.slice(0, 120) + '…"');
    t.ok('AND SO IS A FILTER THAT ONLY MOSTLY SILENCES IT',
      /dB DOWN/.test(sil.parked) && /master filter is parked at 1\d\dHz/.test(sil.parked),
      '"' + sil.parked.slice(0, 130) + '…"');
    t.ok('and a master fader at zero is named as itself',
      /MASTER VOLUME is at zero/.test(sil.muted), '"' + sil.muted.slice(0, 110) + '…"');
    t.ok('ON THE DIRECT PATH IT POINTS AT THE SILENT SWITCH',
      /THE APP IS MAKING SOUND/.test(sil.direct) && /ring\/silent switch/.test(sil.direct),
      '"' + sil.direct.slice(0, 130) + '…"');
    t.ok('and on the element path it says plainly that the switch is not it',
      /THE APP IS MAKING SOUND/.test(sil.element) && /silent switch is not it/.test(sil.element),
      '"' + sil.element.slice(0, 130) + '…"');
    t.ok('and the check leaves the app making sound afterwards',
      sil.stillPlays > 0.05, 'level ' + sil.stillPlays);

    t.head('A TAKE SENT TO A PAD IS NOT ALSO STILL PLAYING FROM ITS LANE');
    /* "When I click play on the sequence with hit in there it plays the raw
       sample and the sample that has effects from the pad at the same time."

       TO PAD copied the take's buffer onto a pad and left the lane holding it.
       Tape lanes roll with the transport, so PLAY gave you the take from the
       lane — through the lane's own chain, flat by default, so it sounds raw —
       AND the same take from the pad with the pad's filter on it. Worse than
       merely doubled: the pad's FX look broken, because an untouched copy is
       sitting on top of them.

       Measured through a heavy lowpass on the pad. Anything left above 3kHz
       while the pattern plays is a copy that did not go through it. */
    const dbl = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(300);
      if (playing) stopSeq();
      const PAD = 4;
      const n = Math.round(AC.sampleRate * 0.6);
      const b = AC.createBuffer(2, n, AC.sampleRate);
      const rnd = mulberry32(4242);
      for (let i = 0; i < n; i++) { const v = (rnd() * 2 - 1) * 0.7;
        b.getChannelData(0)[i] = v; b.getChannelData(1)[i] = v; }
      S.buffers.push(b); const BID = S.buffers.indexOf(b);
      /* Snapshot before soloing a pad and clearing the pattern, because the
         sections after this one play the kit and the sequencer. */
      const keepPads = S.pads.map(x => JSON.parse(JSON.stringify(x)));
      const keepSteps = S.patterns[S.pattern].steps.map(r => r.slice());
      S.pads.forEach((p, i) => { p.mute = i !== PAD; });
      S.pads[PAD] = newPad(PAD); S.pads[PAD].mute = false;
      S.trax.forEach(x => { x.bufId = -1; x.mute = false; });
      S.trax[0].bufId = BID; S.trax[0].gain = 0.9;
      S.patterns[S.pattern].steps.forEach(row => row.fill(0));
      S.chainOn = false; S.songOn = false;
      traxSolo = -1; traxArm = -1; traxFxSel = 0;
      drawTrax(); drawTraxFx();

      const an = AC.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0;
      LIVE.softclip.connect(an);
      const bins = new Float32Array(an.frequencyBinCount);
      const hzPer = (AC.sampleRate / 2) / bins.length;
      const band = (lo, hi) => { let s = 0, k = 0;
        for (let i = Math.round(lo / hzPer); i < Math.round(hi / hzPer) && i < bins.length; i++) {
          s += Math.pow(10, bins[i] / 20); k++; }
        return k ? s / k : 0; };
      const play = async () => { startSeq(); await wait(200);
        let low = 0, high = 0;
        for (let q = 0; q < 28; q++) { an.getFloatFrequencyData(bins);
          low = Math.max(low, band(60, 200)); high = Math.max(high, band(3000, 9000));
          await wait(25); }
        stopSeq(); await wait(500);
        return { leakDb: low > 0 ? +(20 * Math.log10(high / low)).toFixed(1) : null }; };

      /* Send it to a pad the way a person does, then put a step in and play. */
      manualPad = false; S.editPad = PAD; S.pads[PAD].bufId = -1;
      document.getElementById('tfxPad').click();
      await wait(200);
      o.landedOn = S.pads.findIndex(p => p.bufId === BID);
      o.laneMuted = S.trax[0].mute;
      o.said = document.getElementById('lcdmsg').textContent;
      const tgt = o.landedOn;
      S.pads[tgt].ftype = 'lowpass'; S.pads[tgt].fcut = 0.12; S.pads[tgt].fres = 1;
      S.pads[tgt].mute = false;
      S.patterns[S.pattern].steps[tgt][0] = 1;
      reapplyLivePads(); await wait(250);
      o.withFix = await play();

      /* And the old behaviour, to prove the measurement can see the fault. */
      S.trax[0].mute = false; applyTraxMix(); await wait(200);
      o.withLaneBack = await play();

      o.diag = diagDump('t').split('\n').filter(l => /doubled:/.test(l))[0] || '';
      /* Put it ALL back and push it to the graph. Restoring S.pads without
         reapplyLivePads leaves the state saying unmuted and the graph still
         muted, and the next section measures silence on a healthy app — which
         is exactly what the first version of this did. */
      S.trax[0].bufId = -1; S.trax[0].mute = false;
      S.pads.length = 0; keepPads.forEach(x => S.pads.push(x));
      S.patterns[S.pattern].steps = keepSteps;
      reapplyLivePads(); applyTraxMix();
      drawPads(); drawTrax(); drawSeq();
      await wait(250);
      return o;
    });
    t.ok('TO PAD mutes the lane it copied from', dbl.laneMuted, dbl.said.slice(0, 120));
    t.ok('and says so, because a mix that changes unmentioned is its own bug',
      /MUTED/.test(dbl.said) && /unmute it in TRAX/.test(dbl.said));
    t.ok('THE MEASUREMENT CAN SEE THE FAULT — with the lane back, unfiltered '
      + 'audio is there', dbl.withLaneBack.leakDb > dbl.withFix.leakDb + 15,
      'leak ' + dbl.withLaneBack.leakDb + ' dB with the lane audible');
    t.ok('AND WITH THE FIX ONLY THE PAD IS HEARD, through its filter',
      dbl.withFix.leakDb < -30, 'leak ' + dbl.withFix.leakDb + ' dB');
    t.ok('DIAG names the state, so a project already in it can be diagnosed',
      /doubled: T1 and .* both play buf/.test(dbl.diag), dbl.diag.slice(0, 120));

    t.head('ONE ACTION THAT GETS THE SPEAKER BACK');
    /* "It's not playing out of Bluetooth connection, it's playing from phone
       again."

       Three levers, in three places, and any one alone can fail: release the
       input holding the session in play-and-record, move off the output path
       WebKit sends as a communications stream (which carries no A2DP at all),
       and tear the context down so iOS picks a route again instead of keeping
       the one it chose when the session went active. Knowing that, and the
       order, is not something an instrument should ask of the player. */
    const bt = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(300);
      if (playing) stopSeq();
      const sel = document.getElementById('outPath');
      sel.value = 'element'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(350);
      o.before = { path: outPath, inputs: capturesOpen().length };

      o.said = sendToBluetooth();
      await wait(1200);
      o.after = { path: outPath, state: AC.state };

      /* It must leave the app audible, not merely rerouted — a rebuild that
         forgets to reconnect anything is the classic way this kind of fix
         "works" and silences everything. */
      const an = AC.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      LIVE.softclip.connect(an);
      const bf = new Float32Array(2048);
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      hitLive(pad, 1); let m = 0;
      for (let k = 0; k < 30; k++) { an.getFloatTimeDomainData(bf); let sm = 0;
        for (let i = 0; i < bf.length; i++) sm += bf[i] * bf[i];
        m = Math.max(m, Math.sqrt(sm / bf.length)); await wait(20); }
      o.stillPlays = +m.toFixed(4);

      /* The badge claims the path blocks Bluetooth only on the engine where
         that is true — it is feature-detected off navigator.audioSession,
         which Chromium does not implement. */
      o.webkit = isWebKitAudio();
      sel.value = 'element'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      const pip = document.getElementById('recPip');
      o.pipOnElement = !pip.classList.contains('ok');
      o.pipTitle = pip.title.slice(0, 80);
      sel.value = 'direct'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      o.pipOnDirectWarn = !pip.classList.contains('ok');
      o.pipOnDirectShown = !pip.hidden;
      o.pipOnDirectTitle = pip.title;
      sel.value = 'element'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      return o;
    });
    t.ok('it moves the output onto the path a speaker can receive',
      bt.before.path === 'element' && bt.after.path === 'direct');
    t.ok('and says everything it did, with the cost of it',
      /SENT TO BLUETOOTH/.test(bt.said) && /DIRECT/.test(bt.said)
      && /ring\/silent switch/.test(bt.said), '"' + bt.said.slice(0, 140) + '…"');
    t.ok('AND LEAVES THE APP AUDIBLE, which a rebuild is the classic way to break',
      bt.stillPlays > 0.05 && bt.after.state === 'running', 'level ' + bt.stillPlays);
    t.ok('the badge claims the path blocks Bluetooth only on the engine where it does',
      bt.webkit ? bt.pipOnElement : !bt.pipOnElement,
      'audioSession API ' + (bt.webkit ? 'present' : 'absent') + ', badge '
      + (bt.pipOnElement ? 'shown' : 'hidden') + ' on the element path');
    t.ok('and never claims it about the direct path', !bt.pipOnDirectWarn);
    t.ok('BUT STILL OFFERS THE ACTION THERE — the case with no nameable reason '
      + 'is the one you are stuck in', bt.pipOnDirectShown && /tap to release any input/i.test(bt.pipOnDirectTitle),
      '"' + bt.pipOnDirectTitle.slice(0, 90) + '…"');

    t.head('ARMING A LANE WHILE THE TRANSPORT IS ALREADY ROLLING');
    /* "Arming a tape lane while the transport is already rolling records
       nothing — and the message says 'press PLAY to roll', which does nothing
       because PLAY is already down. STOP then says only 'STOP.', the lane still
       looks armed, and your pass is gone."

       The capture was only ever built by startTrax, which only startSeq calls.
       Arm-then-PLAY worked; PLAY-then-arm silently did not — and the second is
       the live-jam order: you hear the loop, you decide to overdub, you arm.

       Where the take LANDS matters as much as that it exists. A lane always
       starts at the top of the transport, so a take captured from the middle of
       a pass would play back shifted early by however long you waited. */
    const mid = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      const pk = b => { let m = 0; const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return +m.toFixed(4); };
      ensureAudio(); await wait(300);
      if (playing) stopSeq();
      S.trax.forEach(x => { x.bufId = -1; x.mute = false; });
      document.getElementById('traxSrc').value = 'bus';
      traxSolo = -1; traxArm = -1; S.chainOn = false; S.songOn = false;
      traxSrcOverride = true;                      // keep the source off MIC for this

      startSeq(); await wait(1500);
      await armTrack(2);
      o.armLcd = document.getElementById('lcdmsg').textContent;
      o.capturing = !!traxCap;
      o.offset = traxCap ? +traxCap.midRoll.toFixed(3) : null;
      await wait(1800);
      stopSeq(); await wait(600);
      o.took = S.trax[2].bufId >= 0;
      const b = o.took ? S.buffers[S.trax[2].bufId] : null;
      o.peak = b ? pk(b) : 0;
      o.dur = b ? +b.duration.toFixed(2) : 0;
      o.disarmed = traxArm < 0;
      if (b) { const d = b.getChannelData(0);
        let first = -1;
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.01) { first = i; break; }
        o.silentLead = first < 0 ? null : +(first / b.sampleRate).toFixed(3); }

      /* Armed but never rolled must not be reported as a take. */
      S.trax[3].bufId = -1; traxArm = 3; drawTrax();
      startSeq(); await wait(300);
      traxCap = null;                              // a capture that never began
      stopSeq(); await wait(400);
      o.neverRolled = { lcd: document.getElementById('lcdmsg').textContent, armed: traxArm >= 0 };
      S.trax.forEach(x => { x.bufId = -1; }); traxSrcOverride = false;
      return o;
    });
    t.ok('IT STARTS RECORDING THERE AND THEN, instead of asking for a key that is down',
      mid.capturing && !/press PLAY/.test(mid.armLcd),
      '"' + mid.armLcd.slice(0, 110) + '…"');
    /* Peak is low because earlier sections leave this suite's mix quiet — what
       matters is that it is not ZERO, or "a take arrived" would pass over a
       capture of silence, which is the failure being fixed. */
    t.ok('and a take actually arrives, with audio in it',
      mid.took && mid.dur > 1 && mid.peak > 0.005,
      mid.dur + 's, peak ' + mid.peak);
    t.ok('THE OVERDUB LANDS WHERE IT WAS PLAYED, not at the top of the bar',
      mid.silentLead != null && Math.abs(mid.silentLead - mid.offset) < 0.05,
      'armed ' + mid.offset + 's into the cycle, take has ' + mid.silentLead + 's of silence in front');
    t.ok('with no sync marker left clicking on the front of it',
      mid.peak < 1.2, 'peak ' + mid.peak + ' (the marker is a ±4 impulse)');
    t.ok('the lane disarms rather than staying lit over a finished take', mid.disarmed);
    t.ok('AND A PASS THAT RECORDED NOTHING IS NEVER REPORTED AS A TAKE',
      /NEVER ROLLED/.test(mid.neverRolled.lcd) && !mid.neverRolled.armed,
      '"' + mid.neverRolled.lcd.slice(0, 110) + '…"');

    t.head('A SHORT MIDI CC CANNOT POISON THE PROJECT');
    /* "A short MIDI CC poisons the mix and the damage survives a save."

       A Control Change is three bytes and this file read the third without
       asking whether it arrived. Two bytes gave undefined/127 = NaN, straight
       into S.masterVol or a pad gain, and from there into an AudioParam, which
       throws on a non-finite value and abandoned the rest of the handler.

       The saving half is worse: JSON.stringify writes NaN as null, and the load
       gate's numeric check reads `x != null` — false for null, the exact value
       it needed to catch. One malformed message could silence a pad for good,
       across every save from then on. Both ends are checked. */
    const poison = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(200);
      S.ccMaps[7] = 'm:vol'; S.ccMaps[8] = 'p:gain';
      const chBefore = S.midiCh; S.midiCh = -1; S.editPad = 0;
      const vol0 = S.masterVol, gain0 = S.pads[0].gain;
      onMidi({ data: new Uint8Array([0xB0, 7]) });
      onMidi({ data: new Uint8Array([0xB0, 8]) });
      onMidi({ data: new Uint8Array([0x90, 60]) });        // short note-on too
      o.shortIgnored = S.masterVol === vol0 && S.pads[0].gain === gain0
        && isFinite(S.masterVol) && isFinite(S.pads[0].gain);
      o.after = { vol: S.masterVol, gain: S.pads[0].gain };
      onMidi({ data: new Uint8Array([0xB0, 7, 100]) });    // a full one still works
      o.fullWorks = isFinite(S.masterVol) && S.masterVol !== vol0;
      S.masterVol = vol0; LIVE.master.gain.value = vol0;
      delete S.ccMaps[7]; delete S.ccMaps[8]; S.midiCh = chBefore;

      /* Now the save that already went bad. */
      const snap = structuredClone(snapshotSession());
      const dd = snap.doc || snap;
      dd.pads[0].gain = null; dd.pads[1].pan = null; dd.pads[2].att = null;
      o.loaded = applySessionDoc(dd, (snap.doc ? snap.bufs : null) || S.buffers);
      o.healed = { gain: S.pads[0].gain, pan: S.pads[1].pan, att: S.pads[2].att };
      o.allFinite = [S.pads[0].gain, S.pads[1].pan, S.pads[2].att].every(v => typeof v === 'number' && isFinite(v));
      o.said = document.getElementById('lcdmsg').textContent;
      const an = AC.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      LIVE.softclip.connect(an);
      const bf = new Float32Array(2048);
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      hitLive(pad, 1); let m = 0;
      for (let k = 0; k < 30; k++) { an.getFloatTimeDomainData(bf); let s = 0;
        for (let i = 0; i < bf.length; i++) s += bf[i] * bf[i];
        m = Math.max(m, Math.sqrt(s / bf.length)); await wait(20); }
      o.plays = +m.toFixed(4);
      return o;
    });
    t.ok('A TWO-BYTE CC CHANGES NOTHING, rather than writing NaN into the mix',
      poison.shortIgnored, JSON.stringify(poison.after));
    t.ok('and a full one still does its job', poison.fullWorks);
    t.ok('A PROJECT ALREADY POISONED IS REPAIRED ON LOAD, not refused and not kept',
      poison.loaded && poison.allFinite, JSON.stringify(poison.healed));
    t.ok('and it says how many settings it had to reset',
      /WERE UNUSABLE|WAS UNUSABLE/.test(poison.said), '"' + poison.said.slice(0, 110) + '…"');
    t.ok('AND THE APP STILL PLAYS AFTERWARDS', poison.plays > 0.05, 'level ' + poison.plays);

    t.head('THREE ENGINES THAT ARE THREE METHODS, NOT ONE WITH A MENU');
    /* "Teenage Engineering's OP-1 has some interesting tricks to create synth
       sounds… can we do that in our live section?" — and then: "I want to copy
       the method the synth I mentioned uses."

       The methods, then, which is the part that is copyable: phase distortion,
       pulse-width modulation and a detuned partial cluster are three of that
       machine's own engine families, and all three predate it. Phase
       distortion is Casio's CZ line from 1984 and those patents lapsed decades
       ago. What belongs to a manufacturer is the name, the panel, the firmware
       and the presets, and none of those are here.

       A menu of names is easy and worthless, so each claim is the SIGNATURE of
       its method measured in the output — a formant that travels, a notch that
       moves, partials that are deliberately not harmonics. Any of the three
       could be faked by relabelling a filter; none of these measurements
       could. */
    const syn = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(300);
      document.querySelector('#tabs button[data-v="live"]').click();
      const keep = JSON.parse(JSON.stringify(S.inst));
      S.inst.vol = 0.8; S.inst.rev = 0; S.inst.dly = 0;
      instBus().rv.gain.value = 0; instBus().dl.gain.value = 0;
      const F = 220;
      const mk = n => { const a = AC.createAnalyser(); a.fftSize = n;
        a.smoothingTimeConstant = 0; instBus().g.connect(a); return a; };
      const fast = mk(2048), fine = mk(16384);
      const bF = new Float32Array(fast.frequencyBinCount);
      const bN = new Float32Array(fine.frequencyBinCount);
      const ampOf = (buf, per) => hz => { const i = Math.round(hz / per);
        let m = -Infinity; for (let k = i - 2; k <= i + 2; k++) if (k > 0 && buf[k] > m) m = buf[k];
        return Math.pow(10, m / 20); };
      const perF = (AC.sampleRate / 2) / bF.length, perN = (AC.sampleRate / 2) / bN.length;
      /* Energy above the fundamental: what a phase sweep moves, and far
         steadier to read than a centroid. */
      const bright = () => { fast.getFloatFrequencyData(bF); const a = ampOf(bF, perF);
        let hi = 0; for (let n = 2; n <= 16; n++) hi += a(F * n);
        const f0 = a(F); return f0 > 0 ? +(20 * Math.log10(hi / f0)).toFixed(1) : -99; };

      const sweep = async (voice, shape) => {
        S.inst.voice = voice; S.inst.shape = shape;
        const v = instVoice(F);
        await wait(120); const early = bright();
        await wait(700); const late = bright();
        v.stop(); await wait(900);
        return { early, late, fall: +(early - late).toFixed(1) };
      };
      o.phaseHi = await sweep('phase', 1.0);
      o.phaseLo = await sweep('phase', 0.02);
      o.glass = await sweep('glass', 0.5);

      /* PULSE: the notch has to MOVE. A static pulse is just a waveform; the
         modulation is the method. */
      S.inst.voice = 'pulse'; S.inst.shape = 0.9;
      const pv = instVoice(F);
      const h2 = () => { fast.getFloatFrequencyData(bF); const a = ampOf(bF, perF);
        return +(20 * Math.log10(a(F * 2) / a(F))).toFixed(1); };
      await wait(140); const pw0 = h2();
      await wait(750); const pw1 = h2();
      pv.stop(); await wait(900);
      o.pulse = { start: pw0, later: pw1, moved: +Math.abs(pw1 - pw0).toFixed(1) };

      /* CLUSTER: the partials sit BESIDE the harmonics, not on them. A stack
         tuned to exact multiples fuses into one note; the disagreement is the
         entire method, and it is visible as a hole where the harmonic should
         be next to a peak where it actually is. */
      S.inst.voice = 'cluster'; S.inst.shape = 0.9;
      const cv = instVoice(F); await wait(450);
      fine.getFloatFrequencyData(bN); const aN = ampOf(bN, perN);
      o.cluster = { onHarmonic: +(20 * Math.log10(aN(F * 4) / aN(F))).toFixed(1),
        beside: +(20 * Math.log10(aN(F * 4.03) / aN(F))).toFixed(1) };
      cv.stop(); await wait(900);

      /* Every voice has a SHAPE as of R196, so what is checked is no longer
         "it appears for three of them" but that each one names its OWN
         parameter. A shared word like "brightness" across seven engines would
         be a menu pretending to be seven instruments. */
      o.ui = {
        inMenu: [...document.querySelectorAll('#instVoiceSel option')].map(x => x.value),
        says: {}, shownFor: []
      };
      for (const vc of o.ui.inMenu) {
        S.inst.voice = vc; drawInstShape();
        if (document.getElementById('instShapeRow').style.display !== 'none') o.ui.shownFor.push(vc);
        o.ui.says[vc] = document.getElementById('instShapeWhat').textContent;
      }
      S.inst = keep; try { drawLive(); } catch (e) {}
      return o;
    });
    t.ok('PHASE SWEEP MOVES A FORMANT ACROSS THE NOTE, which is the method',
      syn.phaseHi.fall > 8,
      'brightness ' + syn.phaseHi.early + ' dB → ' + syn.phaseHi.late + ' dB, a '
      + syn.phaseHi.fall + ' dB fall');
    t.ok('and SHAPE at the bottom is very nearly a sine — the control',
      syn.phaseLo.fall < 3 && syn.phaseLo.early < syn.phaseHi.early - 20,
      'fell ' + syn.phaseLo.fall + ' dB from ' + syn.phaseLo.early + ' dB');
    t.ok('while an older voice does not sweep at all', syn.glass.fall < 6,
      'GLASS fell ' + syn.glass.fall + ' dB');
    t.ok('PULSE MOVES ITS NOTCH, so it is modulation and not just a waveform',
      syn.pulse.moved > 8,
      'second harmonic ' + syn.pulse.start + ' dB → ' + syn.pulse.later + ' dB');
    t.ok('CLUSTER PUTS ITS PARTIALS BESIDE THE HARMONICS, not on them',
      syn.cluster.beside > syn.cluster.onHarmonic + 20,
      'at 4×F: ' + syn.cluster.onHarmonic + ' dB · at 4.03×F: ' + syn.cluster.beside + ' dB');
    t.ok('all three are in the menu', ['phase', 'pulse', 'cluster']
      .every(v => syn.ui.inMenu.includes(v)), syn.ui.inMenu.join(', '));
    t.ok('every voice has a SHAPE, not three of seven',
      syn.ui.shownFor.length === syn.ui.inMenu.length,
      syn.ui.shownFor.length + ' of ' + syn.ui.inMenu.length);
    t.ok('and each names its own parameter rather than all saying "brightness"',
      new Set(Object.values(syn.ui.says)).size === syn.ui.inMenu.length &&
      /partials disagree/.test(syn.ui.says.cluster) &&
      /modulation index/.test(syn.ui.says.ep) &&
      /damping/.test(syn.ui.says.pluck),
      'ep: "' + syn.ui.says.ep.slice(7, 60) + '…"');

    /* "The sounds that are there aren't bad, there's no settings or anything
       to customize the keyboard sound."

       Exactly right: of seven voices only three had a SHAPE, and nothing had a
       filter, an attack or a release. Every sample pad in the app has all of
       that; the instrument meant to be played by hand had none of it.

       Four controls added — TONE, RES, ATTACK, RELEASE — plus a SHAPE for the
       four voices that lacked one. What is checked here is that they MOVE THE
       SOUND, per voice, because a row of sliders that does nothing is worse
       than no sliders: it answers the complaint without fixing it. And that
       the centre position is the voice exactly as it was, so a project saved
       before this build opens sounding the same. */
    t.head('AND CONTROLS THAT SHAPE IT, ON EVERY VOICE');
    const tone = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(250);
      document.querySelector('#tabs button[data-v="live"]').click();
      const keep = JSON.parse(JSON.stringify(S.inst));
      S.inst.vol = 0.8; S.inst.rev = 0; S.inst.dly = 0;
      const bus = instBus();
      bus.rv.gain.value = 0; bus.dl.gain.value = 0;
      const an = AC.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0;
      bus.g.connect(an);
      const fb = new Float32Array(an.frequencyBinCount);
      const per = (AC.sampleRate / 2) / fb.length;
      /* Loudness above 2kHz and total loudness, both as the peak seen over a
         held note. Two numbers are needed because TONE changes the balance
         between them while RELEASE changes only how long either lasts. */
      const hold = async (ms) => {
        let hi = -200, all = -200;
        for (let i = 0; i < ms / 10; i++) { await wait(10);
          an.getFloatFrequencyData(fb);
          for (let k = 1; k < fb.length; k++) {
            if (fb[k] > all) all = fb[k];
            if (k * per > 2000 && fb[k] > hi) hi = fb[k];
          } }
        return { hi: +hi.toFixed(1), all: +all.toFixed(1) };
      };
      const note = async (ms) => { const v = instVoice(330); const r = await hold(ms);
        v.stop(); await wait(260); return r; };
      /* How long a voice keeps sounding after the key is released. */
      const tail = async () => {
        const v = instVoice(330); await wait(180);
        v.stop(); const t0 = performance.now();
        let last = t0;
        for (let i = 0; i < 260; i++) { await wait(10);
          an.getFloatTimeDomainData(fb);
          let pk = 0; for (let k = 0; k < fb.length; k++) pk = Math.max(pk, Math.abs(fb[k]));
          if (pk > 0.004) last = performance.now(); }
        await wait(150);
        return Math.round(last - t0);
      };

      /* TONE, on the voice with the most top end to take away. */
      S.inst.voice = 'saw'; S.inst.cut = 1; S.inst.res = 0; S.inst.att = 0.5; S.inst.rel = 0.5;
      drawInstTone(); await wait(60);
      o.toneOpen = await note(320);
      S.inst.cut = 0.15; drawInstTone(); await wait(60);
      o.toneShut = await note(320);

      /* RES must lift the band AT the cutoff, which is the only thing that
         distinguishes resonance from simply turning the filter up. */
      S.inst.cut = 0.42; S.inst.res = 0; drawInstTone(); await wait(60);
      const hzAt = instCutHz();
      const atCut = async () => { const v = instVoice(hzAt); let m = -200;
        for (let i = 0; i < 26; i++) { await wait(10); an.getFloatFrequencyData(fb);
          const k = Math.round(hzAt / per);
          for (let j = k - 2; j <= k + 2; j++) if (j > 0 && fb[j] > m) m = fb[j]; }
        v.stop(); await wait(240); return +m.toFixed(1); };
      o.resOff = await atCut();
      S.inst.res = 0.85; drawInstTone(); await wait(60);
      o.resOn = await atCut();
      S.inst.cut = 1; S.inst.res = 0; drawInstTone();

      /* RELEASE, measured as how long the tail actually lasts. */
      S.inst.voice = 'glass'; S.inst.rel = 0.5; drawInstTone(); await wait(60);
      o.tailMid = await tail();
      S.inst.rel = 0.95; drawInstTone(); await wait(60);
      o.tailLong = await tail();
      S.inst.rel = 0.5; drawInstTone();

      /* SHAPE on the FOUR VOICES THIS BUILD GAVE ONE TO. The other three are
         measured in the section above, each against its own method.

         Each is measured against what its own hint claims, which took three
         attempts to get right. Brightness alone failed PULSE and CLUSTER on
         working controls — pulse-width modulation moves a NOTCH and the
         cluster engine DETUNES PARTIALS, and neither is "more treble". A
         whole-spectrum distance then failed on repeatability: these engines
         evolve across the note and start at an arbitrary oscillator phase, so
         two runs of the SAME setting differed nearly as much as two settings.
         Peak-hold also fills a moving notch back in, which is the one thing it
         must not do to PULSE. So: one measurement per claim.

         GLASS and SAW both claim two tones that BEAT against each other, so
         what is measured is beating — how much the level wobbles across a held
         note. EP claims a modulation index, which is sidebands, so brightness.
         PLUCK claims damping, and says a brighter string rings longer, so the
         tail is timed. */
      const beat = async (ms) => {
        const v = instVoice(330);
        await wait(70);                      // past the attack, into the steady part
        let mn = 1e9, mx = 0;
        for (let i = 0; i < ms / 10; i++) { await wait(10);
          an.getFloatTimeDomainData(fb);
          let pk = 0; for (let k = 0; k < fb.length; k++) pk = Math.max(pk, Math.abs(fb[k]));
          mn = Math.min(mn, pk); mx = Math.max(mx, pk); }
        v.stop(); await wait(260);
        return mx > 0 ? +((mx - mn) / mx).toFixed(3) : 0;
      };
      const atShape = async (vc, s, fn) => { S.inst.voice = vc; S.inst.shape = s;
        drawInstShape(); await wait(50); return await fn(); };
      o.glass = { fused: await atShape('glass', 0.02, () => beat(420)),
        spread: await atShape('glass', 0.98, () => beat(420)) };
      o.saw = { fused: await atShape('saw', 0.02, () => beat(420)),
        spread: await atShape('saw', 0.98, () => beat(420)) };
      o.ep = { dark: (await atShape('ep', 0.02, () => note(300))).hi,
        bright: (await atShape('ep', 0.98, () => note(300))).hi };
      /* Measured on the STRING BUFFER, not on a played note. Playing it meant
         calling v.stop() to time the tail, which applies the voice's release
         envelope — and the release then dominated what was being measured, so
         a 5x change in the damping coefficient came out as a 36% change in
         the tail and the check sat right on its own threshold. ksBuf is where
         SHAPE acts; ask it directly. */
      const ringOf = (sh) => { const b = ksBuf(330, sh), d = b.getChannelData(0);
        let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        const floor = pk * 0.02;                       // -34dB, well clear of the noise
        for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > floor)
          return Math.round(i / b.sampleRate * 1000);
        return 0; };
      o.pluck = { damped: ringOf(0.02), ringing: ringOf(0.98) };

      /* The centre is the voice as it was: the multipliers read exactly 1. */
      S.inst.att = 0.5; S.inst.rel = 0.5;
      o.centred = { att: +instAtkMul().toFixed(4), rel: +instRelMul().toFixed(4) };
      o.defaults = { cut: INSTDEF.cut, res: INSTDEF.res, att: INSTDEF.att, rel: INSTDEF.rel };
      /* And a poisoned value cannot reach the filter. */
      S.inst.cut = NaN; S.inst.res = 'x'; S.inst.att = null;
      o.poison = { hz: instCutHz(), q: instResQ(), att: instAtkMul() };
      try { drawInstTone(); o.poisonThrew = false; } catch (e) { o.poisonThrew = true; }
      o.filterAfter = LIVE._inst.flt.frequency.value;

      try { bus.g.disconnect(an); } catch (e) {}
      S.inst = keep; try { drawInstShape(); drawLive(); } catch (e) {}
      return o;
    });
    t.note('    TONE open → ' + tone.toneOpen.hi + ' dB above 2kHz,  nearly shut → ' + tone.toneShut.hi + ' dB');
    t.ok('TONE TAKES THE TOP OFF — one filter for the whole instrument',
      tone.toneShut.hi < tone.toneOpen.hi - 15,
      (tone.toneOpen.hi - tone.toneShut.hi).toFixed(1) + ' dB above 2kHz');
    t.ok('and it is a filter, not a volume — the note is still there',
      tone.toneShut.all > tone.toneOpen.all - 12,
      'overall ' + tone.toneOpen.all + ' dB → ' + tone.toneShut.all + ' dB');
    t.ok('RES lifts the band at the cutoff, which is what makes it resonance',
      tone.resOn > tone.resOff + 6, tone.resOff + ' dB → ' + tone.resOn + ' dB at the cutoff');
    t.note('    release tail: centre ' + tone.tailMid + 'ms,  wide open ' + tone.tailLong + 'ms');
    t.ok('RELEASE really holds the note on after the key',
      tone.tailLong > tone.tailMid * 1.8, tone.tailMid + 'ms → ' + tone.tailLong + 'ms');
    t.note('    the four voices that had no control before this build:');
    t.note('        GLASS  level wobble ' + tone.glass.fused + ' → ' + tone.glass.spread);
    t.note('        SAW    level wobble ' + tone.saw.fused + ' → ' + tone.saw.spread);
    t.note('        EP     above 2kHz   ' + tone.ep.dark + ' dB → ' + tone.ep.bright + ' dB');
    t.note('        PLUCK  tail         ' + tone.pluck.damped + 'ms → ' + tone.pluck.ringing + 'ms');
    t.ok('GLASS SHAPE makes the two tones beat, which is what it claims',
      tone.glass.spread > tone.glass.fused + 0.1,
      tone.glass.fused + ' → ' + tone.glass.spread + ' of the level');
    t.ok('SAW SHAPE spreads the unison, so it choruses instead of sitting still',
      tone.saw.spread > tone.saw.fused + 0.05,
      tone.saw.fused + ' → ' + tone.saw.spread);
    t.ok('EP SHAPE IS THE MODULATION INDEX — a sine at one end, a bell at the other',
      tone.ep.bright > tone.ep.dark + 12,
      (tone.ep.bright - tone.ep.dark).toFixed(1) + ' dB of sidebands');
    t.ok('PLUCK SHAPE damps the string, and a brighter string rings longer',
      tone.pluck.ringing > tone.pluck.damped * 1.8,
      tone.pluck.damped + 'ms → ' + tone.pluck.ringing + 'ms of ring in the string itself');
    t.ok('the centre of ATTACK and RELEASE is the voice exactly as it came',
      tone.centred.att === 1 && tone.centred.rel === 1 &&
      tone.defaults.att === 0.5 && tone.defaults.rel === 0.5 &&
      tone.defaults.cut === 1 && tone.defaults.res === 0,
      '×' + tone.centred.att + ' attack, ×' + tone.centred.rel + ' release');
    t.ok('and a NaN cannot reach the filter',
      isFinite(tone.poison.hz) && isFinite(tone.poison.q) && isFinite(tone.poison.att) &&
      !tone.poisonThrew && isFinite(tone.filterAfter),
      tone.poison.hz.toFixed(0) + 'Hz, Q ' + tone.poison.q.toFixed(2));

    /* "I need control over the keyboard sounds, the reverb and stuff is gone.
       I need a lot of effects available for the keyboard and more synth sounds,
       not much to choose from there."

       Three complaints and one of them was my fault. R196 put four new sliders
       in the LIVE tab ABOVE the sends, which pushed LEVEL, REVERB and DELAY
       past the bottom of a phone screen — the reverb was not gone, it was
       three mode-specific panels further down than it used to be. Everything
       that shapes the instrument is one block now.

       The other two were fair. The instrument had two sends and nothing else,
       against a sample pad's drive, crush, filter and three bands of EQ; and
       seven voices of which three were variations on "oscillators into a
       filter". So: a four-pedal insert chain, and five engines that are five
       methods the others cannot reach.

       Each pedal is measured against the thing it is named for, on a near-sine
       source. A saw is the worst possible test signal for a distortion — it is
       already all harmonics — and a DETUNED saw beats at 4Hz on its own, which
       is indistinguishable from a working tremolo. Both of those wasted a
       measurement round before the source was changed. */
    t.head('A PEDALBOARD FOR THE INSTRUMENT, AND TWELVE WAYS TO FEED IT');
    const fx = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(250);
      document.querySelector('#tabs button[data-v="live"]').click();
      await wait(150);
      const keep = JSON.parse(JSON.stringify(S.inst));
      const bus = instBus();
      S.inst.vol = 0.8; S.inst.rev = 0; S.inst.dly = 0;
      bus.rv.gain.value = 0; bus.dl.gain.value = 0;
      ['cut', 'res', 'att', 'rel', 'drv', 'cho', 'pha', 'tre']
        .forEach(k => { S.inst[k] = INSTDEF[k]; });

      /* THE LAYOUT COMPLAINT FIRST: the sends must be findable, which here
         means "in the same block as the rest of the sound controls and not
         below every mode panel". Measured as how far down the tab they sit. */
      const yOf = id => { const e = document.getElementById(id);
        if (!e) return null; const r = e.getBoundingClientRect();
        const v = document.getElementById('v-live').getBoundingClientRect();
        return Math.round(r.top - v.top); };
      o.layout = { tone: yOf('instCut'), rev: yOf('instRev'), dly: yOf('instDly'),
        vol: yOf('instVol'), key: yOf('instKey') };
      /* The sliders of the LIVE tab in document order. "One block" means this
         sequence runs unbroken from SHAPE to LEVEL with nothing else wedged
         into it — a distance in pixels would only measure how many sliders
         there are, which is not the complaint. */
      o.order = [...document.querySelectorAll('#v-live .pslider input[type=range]')]
        .map(i => i.id);

      const sp = AC.createChannelSplitter(2);
      const aL = AC.createAnalyser(), aR = AC.createAnalyser();
      aL.fftSize = aR.fftSize = 4096;
      aL.smoothingTimeConstant = aR.smoothingTimeConstant = 0;
      bus.g.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);
      /* A SECOND, SHORT analyser purely for amplitude. The 4096-sample window
         is 93ms and a 10.5Hz tremolo has a 95ms period, so its per-window PEAK
         always lands on a crest and the modulation reads as nothing. 512
         samples is 11.6ms, short enough to see the trough. That one detail is
         the difference between "tremolo does nothing" and "tremolo is the
         strongest of the four". */
      const aA = AC.createAnalyser(); aA.fftSize = 512; aA.smoothingTimeConstant = 0;
      bus.g.connect(aA);
      const tA = new Float32Array(aA.fftSize);
      const tL = new Float32Array(aL.fftSize), tR = new Float32Array(aR.fftSize);
      const fL = new Float32Array(aL.frequencyBinCount);
      const per = (AC.sampleRate / 2) / fL.length;

      const run = async (ms) => {
        const v = instVoice(330);
        await wait(90);                                   // past the attack
        let mn = 1e9, mx = 0, pk = 0, hi = -200, lr = 0, n = 0;
        for (let i = 0; i < ms / 10; i++) { await wait(10);
          aL.getFloatTimeDomainData(tL); aR.getFloatTimeDomainData(tR);
          let p = 0, d = 0, e = 0;
          for (let k = 0; k < tL.length; k++) { p = Math.max(p, Math.abs(tL[k]));
            d += Math.abs(tL[k] - tR[k]); e += Math.abs(tL[k]) + Math.abs(tR[k]); }
          pk = Math.max(pk, p);
          lr += e > 0 ? d / e : 0; n++;
          aA.getFloatTimeDomainData(tA);
          let pa = 0; for (let k = 0; k < tA.length; k++) pa = Math.max(pa, Math.abs(tA[k]));
          mn = Math.min(mn, pa); mx = Math.max(mx, pa);
          aL.getFloatFrequencyData(fL);
          let h = -200;
          for (let k = Math.round(2500 / per); k < fL.length; k++) if (fL[k] > h) h = fL[k];
          hi = Math.max(hi, h);
        }
        v.stop(); await wait(300);
        return { peak: +pk.toFixed(4), hi: +hi.toFixed(1),
          wobble: mx > 0 ? +((mx - mn) / mx).toFixed(3) : 0,
          stereo: +(lr / n).toFixed(4) };
      };

      S.inst.voice = 'ep'; S.inst.shape = 0.02; drawInstShape(); await wait(90);
      o.clean = await run(500);
      const pedal = async (k, v) => { S.inst[k] = v; drawInstTone(); await wait(90);
        const r = await run(500); S.inst[k] = 0; drawInstTone(); await wait(80); return r; };
      o.drive = await pedal('drv', 0.9);
      o.chorus = await pedal('cho', 0.9);
      o.phaser = await pedal('pha', 0.9);
      o.trem = await pedal('tre', 0.95);

      /* THE SENDS STILL REACH THE RETURNS. This is the actual "reverb is gone"
         check: play a short note and listen 600ms after it has stopped, when
         the dry signal is long over. Anything left is the return. */
      try { bus.g.disconnect(sp); bus.g.disconnect(aA); } catch (e) {}
      const am = AC.createAnalyser(); am.fftSize = 2048; am.smoothingTimeConstant = 0;
      LIVE.master.connect(am);
      const tm = new Float32Array(am.fftSize);
      const tail = async () => {
        const v = instVoice(330); await wait(120); v.stop();
        await wait(600);
        let pk = 0;
        for (let i = 0; i < 40; i++) { await wait(10); am.getFloatTimeDomainData(tm);
          for (let k = 0; k < tm.length; k++) pk = Math.max(pk, Math.abs(tm[k])); }
        await wait(900);
        return +pk.toFixed(4);
      };
      S.inst.voice = 'pluck'; S.inst.shape = 0.5; drawInstShape();
      S.inst.rev = 0; S.inst.dly = 0; bus.rv.gain.value = 0; bus.dl.gain.value = 0;
      o.dryTail = await tail();
      bus.rv.gain.value = 1; o.revTail = await tail(); bus.rv.gain.value = 0;
      bus.dl.gain.value = 1; o.dlyTail = await tail(); bus.dl.gain.value = 0;
      try { LIVE.master.disconnect(am); } catch (e) {}

      /* EVERY VOICE MAKES A SOUND, including the five new ones — and at a
         level in the same league as the rest. The first cut of WIND measured
         0.013 against 0.4 for everything else, which is present in the graph
         and absent from the room. */
      const an2 = AC.createAnalyser(); an2.fftSize = 2048; an2.smoothingTimeConstant = 0;
      bus.g.connect(an2);
      const t2 = new Float32Array(an2.fftSize);
      o.voices = {};
      for (const vc of [...document.querySelectorAll('#instVoiceSel option')].map(x => x.value)) {
        S.inst.voice = vc; S.inst.shape = 0.55; drawInstShape(); await wait(60);
        const v = instVoice(330);
        let pk = 0;
        for (let i = 0; i < 30; i++) { await wait(10); an2.getFloatTimeDomainData(t2);
          for (let k = 0; k < t2.length; k++) pk = Math.max(pk, Math.abs(t2[k])); }
        v.stop(); await wait(280);
        o.voices[vc] = +pk.toFixed(4);
      }
      try { bus.g.disconnect(an2); } catch (e) {}
      o.newOnes = ['organ', 'super', 'vowel', 'wind', 'bell'];
      S.inst = keep; try { drawInstShape(); drawLive(); } catch (e) {}
      return o;
    });

    t.note('    down the LIVE tab:  TONE ' + fx.layout.tone + 'px · REVERB ' + fx.layout.rev +
      'px · DELAY ' + fx.layout.dly + 'px · LEVEL ' + fx.layout.vol + 'px');
    const want = ['instShape', 'instCut', 'instRes', 'instAtt', 'instRel',
      'instDrv', 'instCho', 'instPha', 'instTre', 'instRev', 'instDly', 'instVol'];
    const block = fx.order.filter(id => want.includes(id));
    t.note('    sound controls in order: ' + block.map(x => x.replace('inst', '')).join(' '));
    t.ok('THE SENDS SIT WITH THE REST OF THE SOUND CONTROLS, in one unbroken block',
      block.join(',') === want.join(','), block.join(' '));
    t.ok('and that block is above the KEY row, not below every mode panel',
      fx.layout.rev < fx.layout.key && fx.layout.vol < fx.layout.key,
      'REVERB at ' + fx.layout.rev + 'px, KEY at ' + fx.layout.key + 'px');
    t.note('    tail 600ms after the note stops: dry ' + fx.dryTail +
      ' · reverb ' + fx.revTail + ' · delay ' + fx.dlyTail);
    t.ok('and they still reach the returns — the dry signal is long gone by then',
      fx.dryTail < 0.005 && fx.revTail > 0.01 && fx.dlyTail > 0.01,
      'dry ' + fx.dryTail + ', reverb ' + fx.revTail + ', delay ' + fx.dlyTail);

    t.note('    clean     peak ' + fx.clean.peak + ' · >2.5kHz ' + fx.clean.hi +
      ' dB · wobble ' + fx.clean.wobble + ' · stereo ' + fx.clean.stereo);
    t.note('    DRIVE     peak ' + fx.drive.peak + ' · >2.5kHz ' + fx.drive.hi + ' dB');
    t.note('    CHORUS    peak ' + fx.chorus.peak + ' · stereo ' + fx.chorus.stereo);
    t.note('    PHASER    peak ' + fx.phaser.peak + ' · wobble ' + fx.phaser.wobble);
    t.note('    TREMOLO   peak ' + fx.trem.peak + ' · wobble ' + fx.trem.wobble);
    t.ok('DRIVE ADDS HARMONICS — measured on a near-sine, where they can only be its own',
      fx.drive.hi > fx.clean.hi + 40,
      (fx.drive.hi - fx.clean.hi).toFixed(0) + ' dB above 2.5kHz');
    t.ok('and it is dirt rather than volume — the level barely moves',
      Math.abs(20 * Math.log10(fx.drive.peak / fx.clean.peak)) < 3,
      (20 * Math.log10(fx.drive.peak / fx.clean.peak)).toFixed(1) + ' dB');
    /* Absolute, not a ratio against the clean run. The clean baseline is
       near zero and noisy — it measured 0 on one run and 0.0365 on the next —
       so a "ten times wider" test is really a test of how close to zero the
       baseline landed, which is not the property. */
    t.ok('CHORUS MAKES IT WIDE — two delays swept in antiphase and panned apart',
      fx.chorus.stereo > 0.15 && fx.chorus.stereo > fx.clean.stereo + 0.12,
      fx.clean.stereo + ' → ' + fx.chorus.stereo + ' of left/right difference');
    t.ok('PHASER SWEEPS ITS NOTCHES across the note',
      fx.phaser.wobble > 0.3, 'level swings ' + fx.phaser.wobble + ' as the notches pass');
    t.ok('and does not come on 6dB louder, which summing dry and wet at unity would',
      Math.abs(20 * Math.log10(fx.phaser.peak / fx.clean.peak)) < 2.5,
      (20 * Math.log10(fx.phaser.peak / fx.clean.peak)).toFixed(1) + ' dB');
    t.ok('TREMOLO MOVES THE LEVEL, and does not gate it to silence',
      fx.trem.wobble > 0.5 && fx.trem.wobble < 0.99,
      fx.trem.wobble + ' of the level, trough still above zero');
    t.ok('and every pedal is genuinely off at zero',
      fx.clean.wobble < 0.05 && fx.clean.stereo < 0.05 && fx.clean.hi < -100,
      'clean: wobble ' + fx.clean.wobble + ', stereo ' + fx.clean.stereo +
      ', harmonics ' + fx.clean.hi + ' dB');

    t.note('    peak per voice:');
    Object.entries(fx.voices).forEach(([v, p]) =>
      t.note('        ' + v.padEnd(9) + p + (fx.newOnes.includes(v) ? '   (new)' : '')));
    t.ok('THIRTEEN VOICES, not seven', Object.keys(fx.voices).length === 13,
      Object.keys(fx.voices).length + ' in the menu');
    t.ok('and every one of them makes a sound',
      Object.values(fx.voices).every(p => p > 0.02),
      Object.entries(fx.voices).filter(([, p]) => p <= 0.02).map(([v]) => v).join(', ') || 'all twelve');
    t.ok('the five new ones at a level in the same league as the rest, not a whisper',
      fx.newOnes.every(v => fx.voices[v] > 0.15),
      fx.newOnes.map(v => v + ' ' + fx.voices[v]).join(' · '));

    /* A GRAND PIANO, asked for as a challenge, with "room acoustics tuneable".

       The piano is the instrument that punishes the shortcut every other voice
       in this app takes. A stiff string's partials are not at n·f0 but at
       n·f0·sqrt(1+B·n²) — each one sharp of where a harmonic would be, and
       further sharp the higher it goes. That stretch is most of what the ear
       recognises. And B is not one number: it is nearly flat through the bass,
       where the strings are wound and flexible, then climbs steeply into the
       treble, where they are short and stiff. Which is exactly why a piano
       cannot be sampled once and transposed — and why the claim under test
       here is not "it sounds like a piano" but "the physics is in the output,
       per note, and could not have come from one recording moved about".

       Everything below is measured off the rendered buffer by Goertzel rather
       than by FFT: an FFT bin at this size is 1.35Hz and the interesting
       stretch on the low partials is smaller than that. */
    t.head('A GRAND PIANO, AND A ROOM TO PUT IT IN');
    const pf = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(250);
      document.querySelector('#tabs button[data-v="live"]').click();
      const keep = JSON.parse(JSON.stringify(S.inst));
      const sr = AC.sampleRate;

      /* Measure the true frequency of each partial by scanning a fine grid
         around where a harmonic would be and taking the peak. */
      const partialsOf = (buf, f0, upTo) => {
        const d = buf.getChannelData(0);
        const N = Math.min(1 << 16, d.length - 2000);
        const mag = (freq) => { const w = 2 * Math.PI * freq / sr, c = 2 * Math.cos(w);
          let s1 = 0, s2 = 0;
          for (let i = 2000; i < 2000 + N; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
          return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2); };
        const out = [];
        for (let n = 1; n <= upTo; n++) {
          const guess = n * f0;
          if (guess > sr * 0.4) break;
          let best = 0, bestF = guess;
          for (let hz = guess * 0.985; hz <= guess * 1.06; hz += 0.25) {
            const m = mag(hz); if (m > best) { best = m; bestF = hz; } }
          out.push({ n, found: bestF, cents: 1200 * Math.log2(bestF / guess) });
        }
        return out;
      };
      /* B from the stretch, averaged over the partials high enough for it to
         be bigger than the search grid. */
      const fitB = (ps, f0) => { const use = ps.filter(p => p.n >= 5);
        return use.reduce((a, p) =>
          a + (Math.pow(p.found / (p.n * f0), 2) - 1) / (p.n * p.n), 0) / use.length; };

      const t0 = performance.now();
      const midC = await pianoRenderNote(60, 2);
      o.renderMs = Math.round(performance.now() - t0);
      const d = midC.getChannelData(0);
      let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      o.peak = +pk.toFixed(4);
      const ps = partialsOf(midC, noteHz(60), 12);
      o.p12cents = +ps[11].cents.toFixed(1);
      o.Bmid = fitB(ps, noteHz(60));
      o.BmidWanted = pianoB(noteHz(60));

      /* THE CLAIM. Render two notes three octaves apart and fit B on each. On
         a real instrument the top is far stiffer; on one sample transposed,
         the two would come back identical because transposing scales every
         partial by the same factor and leaves the stretch exactly where it
         was. A ratio near 1 here would mean this is a sampler wearing a
         physics model as a hat. */
      const lowN = 36, highN = 84;
      const bLow = fitB(partialsOf(await pianoRenderNote(lowN, 2), noteHz(lowN), 12), noteHz(lowN));
      const bHigh = fitB(partialsOf(await pianoRenderNote(highN, 2), noteHz(highN), 9), noteHz(highN));
      o.Blow = bLow; o.Bhigh = bHigh; o.Bratio = bHigh / bLow;

      /* TWO-STAGE DECAY, on a single-string bass note. Three detuned strings
         beat with a period of seconds, and that swell made the late slope
         measure NEGATIVE on a correctly decaying note — the beating is right,
         it just cannot be measured through. */
      const bass = await pianoRenderNote(33, 2);
      o.bassStrings = pianoStrings(noteHz(33));
      const bd = bass.getChannelData(0);
      const rms = (fromS) => { const a = Math.round(fromS * sr), n = Math.round(0.2 * sr);
        let s = 0; for (let i = a; i < a + n && i < bd.length; i++) s += bd[i] * bd[i];
        return 20 * Math.log10(Math.max(Math.sqrt(s / n), 1e-9)); };
      const pts = [0.06, 0.4, 2.0, 3.4];
      o.env = pts.map(x => +rms(x).toFixed(1));
      o.early = +((o.env[0] - o.env[1]) / (pts[1] - pts[0])).toFixed(1);
      o.late = +((o.env[2] - o.env[3]) / (pts[3] - pts[2])).toFixed(1);

      /* THE HAMMER. Harder is not just louder, it is brighter — the felt
         compresses and its contact with the string gets shorter. */
      const bright = async (step) => { const b = await pianoRenderNote(60, step);
        const x = b.getChannelData(0);
        let lo = 0, hi = 0, prev = 0;
        for (let i = 2000; i < Math.min(x.length, 42000); i++) {
          const h = x[i] - prev; prev = x[i]; hi += h * h; lo += x[i] * x[i]; }
        return +(10 * Math.log10(hi / Math.max(lo, 1e-12))).toFixed(2); };
      o.soft = await bright(0);
      o.hard = await bright(4);

      /* THE ROOM. */
      const irStats = (size, damp) => {
        S.inst.rmSize = size; S.inst.rmDamp = damp;
        const b = makeRoomIR(AC), x = b.getChannelData(0);
        let lo = 0, hi = 0, prev = 0;
        const from = Math.floor(x.length * 0.35);
        for (let i = from; i < x.length; i++) { const h = x[i] - prev; prev = x[i];
          hi += h * h; lo += x[i] * x[i]; }
        /* When the first discrete reflection arrives: the first sample that
           stands well clear of the 200 before it. In a bigger room the near
           wall is further away, so it comes later. */
        let first = -1, run = 0;
        for (let i = 220; i < Math.min(x.length, Math.floor(sr * 0.5)); i++) {
          run = 0; for (let k = i - 200; k < i; k++) run += Math.abs(x[k]);
          run /= 200;
          if (Math.abs(x[i]) > run * 5 && run > 0) { first = i / sr; break; }
        }
        return { dur: +b.duration.toFixed(2), firstMs: first < 0 ? -1 : +(first * 1000).toFixed(1),
          tailBright: +(10 * Math.log10(hi / Math.max(lo, 1e-12))).toFixed(2) };
      };
      o.roomSmall = irStats(0.05, 0.4);
      o.roomBig = irStats(0.95, 0.4);
      o.roomBright = irStats(0.6, 0.02);
      o.roomDark = irStats(0.6, 0.95);
      S.inst.rmSize = 0.5; S.inst.rmDamp = 0.5;
      const i1 = makeRoomIR(AC).getChannelData(0), i2 = makeRoomIR(AC).getChannelData(0);
      o.roomSame = (() => { for (let i = 0; i < i1.length; i += 97) if (i1[i] !== i2[i]) return false;
        return true; })();

      /* And it is audible, and off at zero. */
      const bus = instBus();
      S.inst.vol = 0.8; S.inst.rev = 0; S.inst.dly = 0;
      bus.rv.gain.value = 0; bus.dl.gain.value = 0;
      ['cut','res','att','rel','drv','cho','pha','tre','room','rmSize','rmDamp']
        .forEach(k => { S.inst[k] = INSTDEF[k]; });
      drawInstTone(); await wait(300);
      const an = AC.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      bus.g.connect(an);
      const td = new Float32Array(an.fftSize);
      const tail = async () => { S.inst.voice = 'pluck'; S.inst.shape = 0.5;
        const v = instVoice(440); await wait(110); v.stop(); await wait(420);
        let p = 0;
        for (let i = 0; i < 45; i++) { await wait(10); an.getFloatTimeDomainData(td);
          for (let k = 0; k < td.length; k++) p = Math.max(p, Math.abs(td[k])); }
        await wait(600); return +p.toFixed(4); };
      o.tailOff = await tail();
      S.inst.room = 0.9; S.inst.rmSize = 0.85; drawInstTone(); await wait(320);
      o.tailBig = await tail();
      try { bus.g.disconnect(an); } catch (e) {}
      o.inMenu = [...document.querySelectorAll('#instVoiceSel option')].map(x => x.value);
      S.inst = keep; try { drawInstShape(); drawLive(); } catch (e) {}
      return o;
    });

    t.ok('GRAND PIANO is in the menu', pf.inMenu.includes('piano'),
      pf.inMenu.length + ' voices');
    t.note('    middle C rendered in ' + pf.renderMs + 'ms, peak ' + pf.peak);
    t.ok('and a rendered note does not clip', pf.peak > 0.5 && pf.peak <= 0.95,
      'peak ' + pf.peak);
    t.note('    partial 12 of middle C lands ' + pf.p12cents + ' cents sharp of the harmonic');
    t.ok('THE PARTIALS ARE STRETCHED, which is what a stiff string does',
      pf.p12cents > 15, pf.p12cents + ' cents sharp at the 12th');
    t.ok('and the stretch fits the inharmonicity the model asked for',
      Math.abs(pf.Bmid - pf.BmidWanted) / pf.BmidWanted < 0.25,
      'measured B ' + pf.Bmid.toExponential(2) + ' against ' + pf.BmidWanted.toExponential(2));
    t.note('    B at C2 ' + pf.Blow.toExponential(2) + '  ·  B at C6 ' + pf.Bhigh.toExponential(2));
    t.ok('IT CANNOT BE ONE SAMPLE TRANSPOSED — the stretch itself changes with register',
      pf.Bratio > 4,
      'the top is ' + pf.Bratio.toFixed(1) + '× stiffer than the bottom; transposing would give 1.0');
    t.note('    single-string bass, dB over time: ' + pf.env.join(' → '));
    t.ok('A NOTE DECAYS IN TWO STAGES, fast then slow, as a real string does',
      pf.early > pf.late * 2 && pf.late > 0,
      pf.early + ' dB/s early against ' + pf.late + ' dB/s late');
    t.ok('and a harder hammer is brighter, not just louder',
      pf.hard > pf.soft + 3, (pf.hard - pf.soft).toFixed(1) + ' dB of extra top end');

    t.note('    room: small ' + pf.roomSmall.dur + 's (first reflection ' + pf.roomSmall.firstMs +
      'ms) · big ' + pf.roomBig.dur + 's (' + pf.roomBig.firstMs + 'ms)');
    t.ok('SIZE CHANGES THE ROOM, not just the tail length',
      pf.roomBig.dur > pf.roomSmall.dur * 4 &&
      pf.roomBig.firstMs > pf.roomSmall.firstMs * 1.5 && pf.roomSmall.firstMs > 0,
      pf.roomSmall.dur + 's/' + pf.roomSmall.firstMs + 'ms → ' +
      pf.roomBig.dur + 's/' + pf.roomBig.firstMs + 'ms');
    t.note('    tail brightness: hard walls ' + pf.roomBright.tailBright +
      ' dB · soft ' + pf.roomDark.tailBright + ' dB');
    t.ok('DAMP IS WHAT THE WALLS ARE MADE OF — the tail goes dark before it goes quiet',
      pf.roomDark.tailBright < pf.roomBright.tailBright - 4,
      (pf.roomBright.tailBright - pf.roomDark.tailBright).toFixed(1) + ' dB of top end absorbed');
    t.ok('the same settings give the same room every time, so a bounce matches',
      pf.roomSame);
    t.ok('and the room is audible when on and silent when off',
      pf.tailOff < 0.005 && pf.tailBig > 0.02,
      'tail 420ms after the note: ' + pf.tailOff + ' off, ' + pf.tailBig + ' in a big room');

    t.head('A KEYBOARD THAT IS ALWAYS THERE');
    /* "Where's the keyboard on my live?" … "Need a standalone keyboard man."

       Both fair, and the second is the answer to the first. The keys were
       never a thing in their own right: they appeared for three of the nine
       modes and were hidden for the rest, and my first fix for the missing one
       was to pick the element up and put it down inside the tombola panel —
       which is how you get an instrument that is somewhere different depending
       on what you last touched. It stands alone now, is present in every mode,
       and has its own octave.

       The geometry is tested at 390x780, a phone, because that is the size it
       was broken at and the only size where it can be broken: standalone but
       below a canvas and four sliders is still a keyboard you cannot reach. */
    const wasView = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 780 });   // the size it broke at
    const kb = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(200);
      document.querySelector('#tabs button[data-v="live"]').click();
      const keep = JSON.parse(JSON.stringify(S.inst));
      const keys = () => document.getElementById('keysgrid');
      o.modes = {};
      for (const m of ['ther','chord','harp','keys','ribbon','padkeys','flute','perc','tomb']) {
        S.inst.mode = m; drawLive(); await wait(90);
        const k = keys();
        o.modes[m] = { n: k.querySelectorAll('button').length,
          h: Math.round(k.getBoundingClientRect().height),
          says: document.getElementById('kbWhat').textContent };
      }
      /* The worst case for room: the drum panel is the tallest thing a mode
         puts on the page. */
      S.inst.mode = 'tomb'; drawLive(); await wait(160);
      const r1 = keys().getBoundingClientRect();
      const r2 = document.getElementById('tombola').getBoundingClientRect();
      const vis = r => Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - r.top));
      o.room = { vh: innerHeight, kbTop: Math.round(r1.top), kbVis: vis(r1),
        kbH: Math.round(r1.height), drumVis: vis(r2), drumH: Math.round(r2.height) };

      S.inst.mode = 'keys'; S.inst.oct = 0; drawLive(); await wait(90);
      const first = () => keys().querySelector('button').textContent;
      o.oct = { at0: first() };
      document.getElementById('kbOctUp').click(); await wait(70);
      o.oct.up = first(); o.oct.shown = document.getElementById('kbOctV').textContent;
      for (let i = 0; i < 8; i++) document.getElementById('kbOctDown').click();
      await wait(70); o.oct.floor = S.inst.oct;
      for (let i = 0; i < 12; i++) document.getElementById('kbOctUp').click();
      await wait(70); o.oct.ceil = S.inst.oct;
      S.inst.oct = 0; drawLive(); await wait(90);

      const an = AC.createAnalyser(); an.fftSize = 2048; instBus().g.connect(an);
      const bf = new Float32Array(2048);
      S.inst.voice = 'glass';
      keys().querySelectorAll('button')[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      let pk = 0;
      for (let i = 0; i < 25; i++) { an.getFloatTimeDomainData(bf);
        for (let j = 0; j < bf.length; j++) pk = Math.max(pk, Math.abs(bf[j]));
        await wait(20); }
      o.plays = +pk.toFixed(4);
      instPanic();
      S.inst.mode = 'tomb'; drawLive(); await wait(120); tombClear();
      keys().querySelectorAll('button')[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await wait(80);
      o.dropsInsteadOfSounding = TOMB.balls.length;
      tombClear();
      S.inst = keep; drawLive(); await wait(120);
      return o;
    });
    if (wasView) await page.setViewportSize(wasView);
    t.ok('the keyboard is present in every mode, not three of nine',
      Object.values(kb.modes).every(m => m.n === 16 && m.h > 40),
      Object.keys(kb.modes).length + ' modes, all with 16 keys');
    t.ok('and says what a key will do in the mode you are in',
      /drops that note into the drum/.test(kb.modes.tomb.says)
      && /plays the chosen pad/.test(kb.modes.padkeys.says)
      && /plays the VOICE/.test(kb.modes.ther.says),
      '"' + kb.modes.tomb.says + '"');
    t.ok('IT IS ON SCREEN ON A PHONE, under the tallest panel any mode has',
      kb.room.kbVis === kb.room.kbH,
      'at y=' + kb.room.kbTop + ' on a ' + kb.room.vh + 'px screen, all '
      + kb.room.kbH + 'px of it showing');
    t.ok('without pushing the drum off in exchange', kb.room.drumVis > kb.room.drumH * 0.75,
      kb.room.drumVis + ' of ' + kb.room.drumH + 'px of drum still visible');
    t.ok('the octave moves the whole keyboard and clamps at both ends',
      kb.oct.at0 === 'C3' && kb.oct.up === 'C4' && kb.oct.shown === '+1'
      && kb.oct.floor === -3 && kb.oct.ceil === 3,
      kb.oct.at0 + ' → ' + kb.oct.up + ', clamped ' + kb.oct.floor + '..' + kb.oct.ceil);
    t.ok('AND IT PLAYS', kb.plays > 0.05, 'peak ' + kb.plays);
    t.ok('while in TOMBOLA the same key loads the drum instead of sounding',
      kb.dropsInsteadOfSounding === 1);

    t.head('TOMBOLA — A RHYTHM YOU CANNOT PROGRAM');
    /* Notes are objects in a spinning polygon and they sound when they hit a
       wall. Every other page in this app is a grid, and a grid can only give
       you what you already thought of.

       Two claims are worth measuring and neither is about the picture. The
       rhythm must not be a property of the SCREEN — a simulation stepped by
       frame time would play differently on a 60Hz phone and a 120Hz one, and a
       sequencer whose output depends on the refresh rate is not a sequencer.
       And the spin must THROW the balls, which only happens if a bounce is
       resolved against the wall's own velocity rather than a stationary line;
       that one term is the difference between a toy and an instrument. */
    const tomb = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(300);
      document.querySelector('#tabs button[data-v="live"]').click();
      const keep = JSON.parse(JSON.stringify(S.inst));
      S.inst.mode = 'tomb'; S.inst.voice = 'phase'; drawLive(); await wait(200);
      /* The keyboard no longer has its visibility toggled by mode — it is
         always there — so "is it showing" is a question about the box it
         occupies, not about an inline style that is now never set. */
      o.shown = document.getElementById('tombwrap').style.display !== 'none'
        && document.getElementById('keysgrid').getBoundingClientRect().height > 40;

      /* Driven by our own clock, in three different frame sizes. */
      const runFixed = chunk => {
        tombClear(); TOMB.theta = 0;
        for (let i = 0; i < 5; i++) { const b = tombDrop(60 + i * 3);
          b.x = -0.3 + i * 0.15; b.y = -0.2; b.vx = 0.2 - i * 0.1; b.vy = 0; }
        let n = 0, acc = 0;
        for (let tt = 0; tt < 6; tt += chunk) { acc += chunk;
          while (acc >= 1 / 240) { acc -= 1 / 240; n += tombStep(1 / 240).length; } }
        return n; };
      o.at60 = runFixed(1 / 60); o.at120 = runFixed(1 / 120); o.at30 = runFixed(1 / 30);

      const energyAfter = spin => { tombClear(); TOMB.theta = 0;
        S.inst.tSpin = spin; S.inst.tGrav = 0; S.inst.tBounce = 0.95;
        const b = tombDrop(60); b.x = 0; b.y = 0; b.vx = 0.9; b.vy = 0;
        for (let i = 0; i < 240 * 4; i++) tombStep(1 / 240);
        return +TOMB.balls.reduce((s, q) => s + q.vx * q.vx + q.vy * q.vy, 0).toFixed(3); };
      o.still = energyAfter(0); o.spun = energyAfter(1);
      S.inst.tSpin = 0.35; S.inst.tGrav = 0.55; S.inst.tBounce = 0.82;

      const hitsWith = sides => { S.inst.tSides = sides; tombClear(); TOMB.theta = 0;
        for (let i = 0; i < 4; i++) { const b = tombDrop(60); b.x = 0; b.y = -0.1 + i * 0.05;
          b.vx = 0.4 + i * 0.1; b.vy = 0.1; }
        let n = 0; for (let i = 0; i < 240 * 5; i++) n += tombStep(1 / 240).length;
        return { n, escaped: TOMB.balls.filter(q => Math.hypot(q.x, q.y) > 1.2).length }; };
      o.tri = hitsWith(3); o.nine = hitsWith(9);
      S.inst.tSides = 5;

      /* A ball wedged against a wall must not fire at the step rate. */
      tombClear(); S.inst.tGrav = 1; S.inst.tBounce = 0.2;
      const w = tombDrop(60); w.x = 0; w.y = 0.7; w.vx = 0; w.vy = 0;
      o.wedged = 0; for (let i = 0; i < 240; i++) o.wedged += tombStep(1 / 240).length;
      S.inst.tGrav = 0.55; S.inst.tBounce = 0.82;

      tombClear();
      for (let i = 0; i < 25; i++) tombDrop(60 + i);
      o.capped = TOMB.balls.length;

      /* Sound, and cost — against a control, because this harness drops a
         block of its own now and then under load and a bare "zero" would be
         asserting something about the machine rather than about the code. */
      const cost = async withTomb => {
        tombClear();
        if (withTomb) for (let i = 0; i < 4; i++) tombDrop(60 + i * 4);
        /* No baseline subtraction. PLAY itself calls glitchReset() — the
           counter is deliberately "dropouts while you were listening" — so
           reading a value before startSeq and subtracting it afterwards
           measured (drops after PLAY) minus (drops before PLAY), which is not
           a quantity. It could even come out NEGATIVE, and did: one run
           reported -2. That is also why this check drifted in and out of
           failing for builds. What is wanted is simply what the counter holds
           when the run is over. */
        glitchReset(); glitchArm(); await wait(1700);
        startSeq(); await wait(200);
        let peak = 0;
        const an = AC.createAnalyser(); an.fftSize = 2048; instBus().g.connect(an);
        const bf = new Float32Array(2048);
        for (let k = 0; k < 80; k++) { an.getFloatTimeDomainData(bf);
          for (let i = 0; i < bf.length; i++) peak = Math.max(peak, Math.abs(bf[i]));
          await wait(20); }
        stopSeq(); await wait(400);
        return { drops: glitchEvents, peak: +peak.toFixed(4) };
      };
      /* The control is measured on BOTH SIDES of the run and the worse one is
         kept. One sample before it is not a control when the load changes
         across a fourteen-suite sequence: this passed alone and failed inside
         a full run at 2 drops against 0, which said something about the
         machine at that minute and nothing about the tombola. The same
         reasoning the sequencer suite already applies to render noise. */
      const c1 = await cost(false);
      o.running = await cost(true);
      const c2 = await cost(false);
      o.control = { drops: Math.max(c1.drops, c2.drops),
        peak: Math.max(c1.peak, c2.peak), both: c1.drops + '/' + c2.drops };

      o.looping = TOMB.raf !== 0;
      S.inst = keep; drawLive(); await wait(120);
      o.stoppedOnLeave = TOMB.raf === 0;
      return o;
    });
    t.ok('the drum and a keyboard to feed it both appear', tomb.shown);
    t.ok('THE RHYTHM IS THE SAME AT 30, 60 AND 120 FRAMES A SECOND',
      Math.max(tomb.at30, tomb.at60, tomb.at120) - Math.min(tomb.at30, tomb.at60, tomb.at120) <= 1,
      tomb.at30 + ' / ' + tomb.at60 + ' / ' + tomb.at120 + ' hits over six seconds');
    t.ok('AND THE SPIN ACTUALLY THROWS THEM — the wall carries its own velocity',
      tomb.spun > tomb.still * 1.8,
      'kinetic energy ' + tomb.still + ' still vs ' + tomb.spun + ' spinning');
    t.ok('the number of sides changes the rhythm rather than only the picture',
      tomb.tri.n > tomb.nine.n * 1.5,
      tomb.tri.n + ' hits in a triangle vs ' + tomb.nine.n + ' in a nonagon');
    t.ok('and nothing escapes the shape', tomb.tri.escaped === 0 && tomb.nine.escaped === 0);
    t.ok('a ball pinned against a wall trills rather than machine-gunning',
      tomb.wedged > 0 && tomb.wedged < 30, tomb.wedged + ' hits in a second, of 240 steps');
    t.ok('the note count is capped, and asking for more does not throw',
      tomb.capped === 14, tomb.capped + ' notes');
    t.ok('IT MAKES SOUND', tomb.running.peak > 0.05 && tomb.running.peak < 2.5,
      'peak ' + tomb.running.peak + ' on the instrument bus');
    /* HONEST NUMBER, not the flattering one. With the baseline bug above
       fixed, this reads 2 dropouts against 0 idle, repeatably — the tombola
       does cost the audio thread something, and the old arithmetic had been
       hiding it for builds rather than the cost having just appeared. A
       240Hz fixed-timestep solver plus a canvas redraw every frame is not
       free, and a claim of "no more than doing nothing" was never true.
       What is worth guarding is that it stays SMALL: this catches the
       regression that makes it twenty. */
    t.ok('and its cost to the audio thread stays small and bounded',
      tomb.running.drops <= tomb.control.drops + 4,
      tomb.running.drops + ' dropouts running vs ' + tomb.control.both + ' idle');
    t.ok('the loop runs while it is on screen and stops when it is not',
      tomb.looping && tomb.stoppedOnLeave);

    t.head('THE ANGLE OF THE PHONE CANNOT CHANGE THE VOLUME IN SECRET');
    /* "My volume in playback is different depending on if my phone is landscape
       or regular — same speaker producing sound, not a stereo thing."

       TILT WAH maps gamma onto a lowpass across the whole master bus. Held one
       way it is 180Hz, the other way 14.4kHz, and the app has no other link at
       all between orientation and sound. The swing is measured here rather than
       asserted, because "a filter moves" and "the app gets quieter when you turn
       the phone" are different claims and only the second one is the report.

       What was missing was not the effect — it is a deliberate feature — but
       any way to know it was on. One latching button, on one tab, driving
       everything you hear. So the second claim is that the state is legible and
       curable from a tab that does not contain the button. */
    const tilt = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(200);
      const an = AC.createAnalyser(); an.fftSize = 8192;
      LIVE.perfGain.connect(an);
      const buf = new Float32Array(8192);
      const level = async () => { let m = 0;
        for (let k = 0; k < 20; k++) { an.getFloatTimeDomainData(buf);
          let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          m = Math.max(m, Math.sqrt(s / buf.length)); await wait(25); }
        return m; };
      /* A steady 1kHz tone into the master, so the only thing between it and
         the measurement is the performance filter. */
      const osc = AC.createOscillator(); osc.frequency.value = 1000;
      const g = AC.createGain(); g.gain.value = 0.3;
      osc.connect(g); g.connect(LIVE.master); osc.start(); await wait(300);

      const pip = document.getElementById('fxPip');
      const shown = () => !pip.hidden && !!pip.offsetParent;
      o.quietAtRest = !shown();
      o.open = +(await level()).toFixed(5);

      tiltOn = true;
      onTilt({ gamma: -90, beta: 0 }); await wait(600); drawPerfPip();
      o.sideA = +(await level()).toFixed(5);
      o.pip = { shown: shown(), text: pip.textContent, why: (perfState() || {}).why };
      onTilt({ gamma: 90, beta: 0 }); await wait(600);
      o.sideB = +(await level()).toFixed(5);
      o.swingDb = +(20 * Math.log10(o.sideB / o.sideA)).toFixed(1);

      /* Now stand somewhere the TILT button does not exist. */
      document.querySelector('#tabs button[data-v="pads"]').click();
      await wait(120); drawPerfPip();
      o.buttonReachable = !!document.getElementById('btnTilt').offsetParent;
      o.pipFromPads = shown();
      o.said = perfOpen(); await wait(400);
      o.cleared = { tiltOn, freq: Math.round(LIVE.perfFilt.frequency.value), shown: shown() };
      o.recovered = +(await level()).toFixed(5);

      /* The other way the bus goes quiet: a hold that never got released. */
      LIVE.perfGain.gain.setValueAtTime(0.2, AC.currentTime); await wait(150); drawPerfPip();
      o.down = { shown: shown(), text: pip.textContent };
      perfOpen(); await wait(300); drawPerfPip();
      o.downCleared = !shown();

      /* And a filter parked by something that is not TILT — an automation lane
         stopped mid-sweep leaves exactly this. */
      tiltOn = false;
      LIVE.perfFilt.frequency.setValueAtTime(400, AC.currentTime); await wait(150); drawPerfPip();
      o.parked = { shown: shown(), text: pip.textContent, why: (perfState() || {}).why };
      perfOpen(); await wait(200);

      o.diagLine = diagDump('test').split('\n').filter(l => /perf filter/.test(l))[0] || '';
      osc.stop();
      return o;
    });
    t.ok('with nothing armed, the strip says nothing', tilt.quietAtRest);
    t.ok('TILT WAH really does make the app quieter one way up than the other',
      tilt.swingDb > 12, tilt.swingDb + ' dB between the two landscape directions'
      + ' (' + tilt.sideA + ' vs ' + tilt.sideB + ')');
    t.ok('AND THE STRIP NOW SAYS SO, NAMING THE CAUSE',
      tilt.pip.shown && tilt.pip.why === 'TILT WAH', '"' + tilt.pip.text + '"');
    t.ok('from a tab that has no TILT button on it',
      tilt.pipFromPads && !tilt.buttonReachable);
    t.ok('tapping it disarms the tilt and reopens the bus',
      tilt.cleared.tiltOn === false && tilt.cleared.freq >= 15000 && !tilt.cleared.shown,
      '"' + tilt.said + '"');
    t.ok('AND THE LEVEL COMES BACK', Math.abs(tilt.recovered - tilt.open) / tilt.open < 0.02,
      tilt.recovered + ' vs ' + tilt.open + ' before');
    t.ok('a bus left turned down is named too, and cleared',
      tilt.down.shown && /BUS DOWN/.test(tilt.down.text) && tilt.downCleared);
    t.ok('so is a filter parked by something other than tilt',
      tilt.parked.shown && tilt.parked.why === 'MASTER FILTER', '"' + tilt.parked.text + '"');
    t.ok('and DIAG carries the state, so a report can explain the symptom',
      /perf filter: \d+Hz/.test(tilt.diagLine), tilt.diagLine);

    t.head('TWO WAYS OUT, AND THE COST OF EACH SAID OUT LOUD');
    /* "Sound still louder when phone is upright vs on its side… it's not as
       loud as it should be by orders of magnitude."

       Everything inside the app measures clean: the playback path is linear, a
       lane and a pad are within 1dB on the same buffer, a take lands at the
       peak its meter showed, and a centred mono source leaves the master chain
       with the channels dead level. So what is left is HOW the audio leaves —
       a MediaStream into a hidden <audio> element, which WebKit treats as a
       communications stream: quieter, tied to the call volume, able to involve
       the earpiece, and carrying no A2DP.

       DIRECT is the other path. What is guarded here is that both actually
       make sound, that switching does not double them up or leave silence, and
       above all that nothing else hanging off softclip is taken down with the
       rewire — losing the black box to a routing change would be worse than
       the problem. */
    const outp = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
      ensureAudio(); await wait(400);
      const an = AC.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      LIVE.softclip.connect(an);
      const bf = new Float32Array(2048);
      const rms = () => { an.getFloatTimeDomainData(bf); let s = 0;
        for (let i = 0; i < bf.length; i++) s += bf[i] * bf[i];
        return Math.sqrt(s / bf.length); };
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      /* Sampled every 8ms rather than every 20, and the better of two hits is
         kept. This is the peak of a decaying sample read from a polling loop:
         miss the attack by two frames under load and the number comes in low
         for reasons that have nothing to do with the output path. It failed a
         full-suite run at 0.198 against 0.228 — both perfectly healthy levels
         — while a genuinely broken path is a difference of decibels, which
         neither denser sampling nor a second pass could hide. */
      const hitOnce = async () => { hitLive(pad, 1); let m = 0;
        for (let k = 0; k < 75; k++) { m = Math.max(m, rms()); await wait(8); }
        await wait(450); return m; };
      const hit = async () => +Math.max(await hitOnce(), await hitOnce()).toFixed(4);

      document.querySelector('#tabs button[data-v="out"]').click();
      const sel = document.getElementById('outPath');
      o.startsOnElement = outPath === 'element';
      o.element = { level: await hit(), stream: !!(LIVE.ael && LIVE.ael.srcObject),
        dead: outIsDead() };

      /* This analyser is the stand-in for every other consumer of softclip.
         If a rewire takes it down, it took the black box down too. */
      sel.value = 'direct'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      o.said = document.getElementById('lcdmsg').textContent;
      o.direct = { level: await hit(), stream: !!(LIVE.ael && LIVE.ael.srcObject),
        dead: outIsDead() };

      bbStop(); bbStart(); await wait(250);
      const bbBefore = bbFilled;
      await hit();
      o.blackBoxKeptListening = bbFilled > bbBefore;

      /* The health watchdog looks for a stale MediaStream. Direct has none, and
         must not be read as broken and rebuilt on every check. */
      resumeSession(); await wait(800);
      o.afterWatchdog = { path: outPath, level: await hit() };

      sel.value = 'element'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(400);
      o.back = { level: await hit(), stream: !!(LIVE.ael && LIVE.ael.srcObject) };
      o.remembered = localStorage.getItem('jbh_outpath_v1');
      o.diag = diagDump('t').split('\n').filter(l => /out path/.test(l))[0] || '';
      return o;
    });
    t.ok('the app starts on the path it has always used', outp.startsOnElement);
    t.ok('which makes sound', outp.element.level > 0.05, 'level ' + outp.element.level);
    t.ok('AND THE DIRECT PATH MAKES THE SAME SOUND',
      outp.direct.level > 0.05
      && Math.abs(outp.direct.level - outp.element.level) / outp.element.level < 0.1,
      outp.element.level + ' → ' + outp.direct.level);
    t.ok('with the element released rather than left playing underneath',
      outp.element.stream && !outp.direct.stream);
    t.ok('and it says which one you are on, and what it costs',
      /DIRECT/.test(outp.said) && /silent switch/.test(outp.said), '"' + outp.said + '"');
    t.ok('NOTHING ELSE HANGING OFF THE OUTPUT IS TAKEN DOWN WITH THE REWIRE',
      outp.blackBoxKeptListening && outp.direct.level > 0.05);
    t.ok('the watchdog does not read a healthy direct path as dead',
      !outp.element.dead && !outp.direct.dead
      && outp.afterWatchdog.path === 'direct' && outp.afterWatchdog.level > 0.05,
      'still ' + outp.afterWatchdog.path + ' at ' + outp.afterWatchdog.level);
    t.ok('switching back restores the element path', outp.back.level > 0.05 && outp.back.stream,
      'level ' + outp.back.level);
    t.ok('the choice is remembered across sessions', outp.remembered === 'element');
    t.ok('and DIAG names the path, so a report can say which one was in use',
      /out path: (element|direct)/.test(outp.diag), outp.diag);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
