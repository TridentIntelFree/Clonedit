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
      o.pipOnElement = !pip.hidden;
      o.pipTitle = pip.title.slice(0, 80);
      sel.value = 'direct'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      o.pipOnDirect = !pip.hidden;
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
    t.ok('and never claims it about the direct path', !bt.pipOnDirect);

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
      const hit = async () => { hitLive(pad, 1); let m = 0;
        for (let k = 0; k < 30; k++) { m = Math.max(m, rms()); await wait(20); }
        await wait(450); return +m.toFixed(4); };

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
