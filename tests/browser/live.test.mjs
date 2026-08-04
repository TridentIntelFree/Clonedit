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

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
