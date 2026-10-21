/* THE FILTERBANK, AND WHETHER IT CAN BE BELIEVED.

   spectrum(), reference() and compare() exist so that tonal judgements about
   a mix stop being made by eye. That is only worth anything if the numbers
   they produce are right, and the history of measurement code in this repo
   says they will not be right the first time: a zero-crossing count that was
   counting dither, a Goertzel that drifted, a diff that compared base64
   characters. So the band split is checked against signals whose answer is
   known before the render starts.

   The specific trap this suite is pointed at is the Q unit. Web Audio reads
   BiquadFilterNode.Q in DECIBELS for lowpass and highpass and as a real Q
   everywhere else — the same trap that made BASS MONO recombine +7.4dB up at
   its crossover for two builds, documented in clarity.test.mjs. bandEnergy()
   converts, and if that conversion were dropped the bands would ring at their
   corners and the tone placement below would drift. Nothing here trusts the
   paragraph in the source; it sweeps tones and reads what comes back.

   Frequencies are deliberately awkward. Band edges are powers-of-two round
   numbers, so a probe on a round frequency can sit exactly on a corner and
   read half its energy in each of two bands, which looks like leakage and is
   not. Each probe below is placed near the geometric centre of its band and
   nowhere near an edge. */

import { boot, checker } from './harness.mjs';

/* One probe per band, near the geometric mean, none of them round. */
const PROBES = [
  { band: '20-60',    f: 34.7 },
  { band: '60-120',   f: 84.9 },
  { band: '120-250',  f: 173.3 },
  { band: '250-500',  f: 353.1 },
  { band: '500-1k',   f: 706.3 },
  { band: '1k-2k',    f: 1412.7 },
  { band: '2k-4k',    f: 2825.3 },
  { band: '4k-8k',    f: 5651.1 },
  { band: '8k-16k',   f: 11302.7 },
];

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {

    /* ---- 1. A TONE LANDS IN ITS OWN BAND -------------------------------- */
    t.head('A TONE LANDS IN ITS OWN BAND, AND NOWHERE ELSE');
    const place = await page.evaluate(async (PROBES) => {
      const SR = 48000, N = SR * 2;
      const out = [];
      for (const p of PROBES) {
        const oc = new OfflineAudioContext(1, N, SR);
        const o = oc.createOscillator(); o.frequency.value = p.f;
        const g = oc.createGain(); g.gain.value = 0.25;
        o.connect(g); g.connect(oc.destination); o.start();
        const buf = await oc.startRendering();
        const b = await bandEnergy(buf);
        const idx = b.findIndex(x => x.band === p.band);
        const mine = b[idx].db;
        /* the loudest band that is NOT this one */
        let spill = -999, spillBand = '';
        b.forEach((x, i) => { if (i !== idx && x.db > spill) { spill = x.db; spillBand = x.band; } });
        out.push({ band: p.band, f: p.f, mine: +mine.toFixed(1),
                   spill: +spill.toFixed(1), spillBand, margin: +(mine - spill).toFixed(1) });
      }
      return out;
    }, PROBES);
    for (const r of place) {
      /* 12dB, not 20. The geometric centre of a one-octave band is HALF an
         octave from each corner, and a 4th-order pair rolls at 24dB/octave,
         so 12dB is the arithmetic and anything near it is the filter working.
         The first version of this check asked for 20 and failed all nine
         bands on a bank that was behaving perfectly. */
      t.ok(r.f + 'Hz reads in ' + r.band, r.margin >= 10,
        r.mine + 'dB here vs ' + r.spill + 'dB in ' + r.spillBand + ' — ' + r.margin + 'dB down');
    }
    /* AND THIS is the check that actually pins the Q unit. A 0.25 sine is
       0.25/root-2 RMS, which is -15.05dB, and a correctly-damped band reads
       that at its centre. A Q left in linear units would make each section
       resonant, the corners would ring, and these nine readings would
       scatter — they are within a few tenths of each other and of theory. */
    const flat = place.map(r => r.mine);
    const worstDev = Math.max(...flat.map(v => Math.abs(v - (-15.05))));
    t.ok('every band passes its own centre at the same level — the Q is in dB',
      worstDev <= 1.0,
      'worst band is ' + worstDev.toFixed(2) + 'dB off the -15.05dB a 0.25 sine should read');

    /* ---- 2. THE BANK DOES NOT INVENT OR LOSE ENERGY ---------------------- */
    t.head('AND THE BANK NEITHER INVENTS NOR LOSES ENERGY');
    const consv = await page.evaluate(async () => {
      /* Noise band-limited to 120..8000 so the measured bands cover all of
         it — comparing against full-range noise would charge the bank for
         the sub-20Hz and above-16k content it never claimed to measure. */
      const SR = 48000, N = SR * 4;
      const oc = new OfflineAudioContext(1, N, SR);
      const src = oc.createBufferSource();
      const nb = oc.createBuffer(1, N, SR);
      const d = nb.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < N; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * 0.2; }
      src.buffer = nb;
      const hp = oc.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = 120; hp.Q.value = 20 * Math.log10(0.7071);
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 8000; lp.Q.value = 20 * Math.log10(0.7071);
      src.connect(hp); hp.connect(lp); lp.connect(oc.destination); src.start();
      const buf = await oc.startRendering();
      const x = buf.getChannelData(0);
      let tot = 0; for (let i = 0; i < x.length; i++) tot += x[i] * x[i];
      const totDb = 10 * Math.log10(tot / x.length);
      const b = await bandEnergy(buf);
      let sum = 0; for (const q of b) sum += Math.pow(10, q.db / 10);
      return { totDb: +totDb.toFixed(2), sumDb: +(10 * Math.log10(sum)).toFixed(2) };
    });
    t.ok('summed bands equal the broadband energy',
      Math.abs(consv.sumDb - consv.totDb) <= 1.0,
      consv.sumDb + 'dB summed vs ' + consv.totDb + 'dB broadband');

    /* ---- 3. SHAPE IGNORES LEVEL ----------------------------------------- */
    t.head('THE SHAPE IS THE TONE, WITH THE VOLUME TAKEN OUT');
    const inv = await page.evaluate(async () => {
      const SR = 48000, N = SR * 2;
      const mk = async (amp) => {
        const oc = new OfflineAudioContext(1, N, SR);
        [220.7, 1310.3, 5501.9].forEach(f => {
          const o = oc.createOscillator(); o.frequency.value = f;
          const g = oc.createGain(); g.gain.value = amp;
          o.connect(g); g.connect(oc.destination); o.start();
        });
        return specShape(await bandEnergy(await oc.startRendering()));
      };
      const a = await mk(0.1), b = await mk(0.2);   // +6dB
      let worst = 0;
      a.forEach((x, i) => { worst = Math.max(worst, Math.abs(x.rel - b[i].rel)); });
      return { worst: +worst.toFixed(3) };
    });
    t.ok('turning the whole thing up 6dB moves no band of the shape',
      inv.worst <= 0.15, 'worst band moved ' + inv.worst + 'dB');

    /* ---- 4. A MIX COMPARED WITH ITSELF IS A FLAT LINE -------------------- */
    t.head('A MIX COMPARED WITH ITSELF IS FLAT, AND A KNOWN EQ MOVE IS NOT');
    const self = await page.evaluate(async () => {
      /* Reference taken from a pad's own sample, then the same audio
         measured again: every delta must be zero, or the comparison is
         measuring its own machinery rather than the music. */
      const pad = S.pads.findIndex(p => p && p.bufId >= 0);
      if (pad < 0) return { skip: true };
      const r = await window.JBH.reference({ pad });
      const mine = await specReport(S.buffers[S.pads[pad].bufId]);
      const d = diffSpec(mine, r);
      let worst = 0;
      d.bands.forEach(b => { worst = Math.max(worst, Math.abs(b.delta)); });
      return { pad, worst: +worst.toFixed(3), matched: d.matched, bands: d.bands.length };
    });
    if (self.skip) t.ok('a pad with audio on it exists to reference', false, 'no loaded pad');
    else {
      t.ok('every band of a self-comparison reads zero', self.worst <= 0.05,
        self.bands + ' bands, worst delta ' + self.worst + 'dB');
      t.ok('and it reports itself matched', self.matched === true);
    }

    /* A 6dB high shelf at 6.5kHz must show up above 6.5kHz and essentially
       nowhere else. This is the end-to-end proof: if the bank, the shape
       normalisation or the diff were wrong, a move this specific would smear. */
    const eq = await page.evaluate(async () => {
      const SR = 48000, N = SR * 3;
      const noise = (oc) => {
        const nb = oc.createBuffer(2, N, SR);
        for (let c = 0; c < 2; c++) {
          const d = nb.getChannelData(c); let s = 999 + c;
          for (let i = 0; i < N; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * 0.15; }
        }
        return nb;
      };
      const run = async (shelfDb) => {
        const oc = new OfflineAudioContext(2, N, SR);
        const src = oc.createBufferSource(); src.buffer = noise(oc);
        const f = oc.createBiquadFilter();
        f.type = 'highshelf'; f.frequency.value = 6500; f.gain.value = shelfDb;
        src.connect(f); f.connect(oc.destination); src.start();
        return await specReport(await oc.startRendering());
      };
      const flatS = await run(0), lifted = await run(6);
      const d = diffSpec(lifted, Object.assign({ name: 'flat' }, flatS));
      const by = {}; d.bands.forEach(b => { by[b.band] = b.delta; });
      const rel = (s, a, b) => {
        const m = {}; s.shape.forEach(x => { m[x.band] = x.rel; });
        return m[a] - m[b];
      };
      /* The tilt between two bands, which no normalisation can touch. */
      const tilt = rel(lifted, '8k-16k', '250-500') - rel(flatS, '8k-16k', '250-500');
      return { by, tilt: +tilt.toFixed(2) };
    });
    /* A +6dB shelf must move the top band 6dB relative to the midrange, and
       THAT is the assertion, because the per-band deltas alone cannot say it.
       The shape is normalised against each mix's own total energy, so lifting
       a band that already dominates — and in white noise the top octave holds
       half the energy — pushes every other band's number down to compensate.
       The first version of this check read "+1.5dB in the top, -4dB in the
       mids" and called the bank broken when it was reporting exactly right.
       It is a real property of the tool, not an artefact: a big delta in a
       loud band always shows up partly as the rest of the mix moving the
       other way, and compare()'s own note says so. */
    t.near('a +6dB shelf at 6.5k tilts 8k-16k against the mids by 6dB',
      eq.tilt, 6, 0.8, 'dB');
    t.ok('and the top band is the one that moved up',
      eq.by['8k-16k'] > 0 && eq.by['8k-16k'] > eq.by['250-500'],
      '8k-16k ' + eq.by['8k-16k'] + 'dB vs 250-500 ' + eq.by['250-500'] + 'dB');

    /* ---- 5. SETTINGS THAT DO NOTHING NOW SAY SO -------------------------- */
    t.head('A SETTING THAT IS NOT DOING ANYTHING SAYS SO');
    const warn = await page.evaluate(() => {
      const pick = (r, f) => (r.warnings || []).find(w => w.field === f) || null;
      const mud = window.JBH.set({ mMud: 0.14 });        // the real bug: wrong sign, out of range
      const tiny = window.JBH.set({ mEqLo: -0.2 });      // in range, below audibility
      const typo = window.JBH.set({ masterVolume: 1 });  // not a setting at all
      const good = window.JBH.set({ mEqMid: 2.5 });      // a real move
      window.JBH.set({ mMud: 0, mEqLo: 0, mEqMid: 0 });
      return {
        mud: pick(mud, 'mMud'), tiny: pick(tiny, 'mEqLo'),
        typo: (typo.warnings || []).find(w => w.severity === 'ignored') || null,
        good: (good.warnings || []).length,
      };
    });
    t.ok('mMud at +0.14 is reported as out of range',
      !!warn.mud && warn.mud.severity === 'out-of-range',
      warn.mud ? warn.mud.says.slice(0, 72) + '…' : 'no warning');
    t.ok('a -0.2dB EQ move is reported as inaudible',
      !!warn.tiny && warn.tiny.severity === 'inaudible');
    t.ok('and a key that is not a setting is named rather than dropped',
      !!warn.typo, warn.typo ? warn.typo.says.slice(0, 56) + '…' : 'no warning');
    t.ok('while a real 2.5dB move passes without comment', warn.good === 0);

    /* ---- 6. THE CHAIN, ISOLATED ----------------------------------------- */
    t.head('vsDry SHOWS WHAT THE PAD CHAIN DID AND NOTHING ELSE');
    const dry = await page.evaluate(async () => {
      const pad = S.pads.findIndex(p => p && p.bufId >= 0);
      if (pad < 0) return { skip: true };
      /* Make sure the pad is struck in the current pattern. */
      const pat = S.patterns[S.pattern];
      for (let i = 0; i < 16; i += 4) pat.steps[pad][i] = 0.9;
      const save = { ftype: S.pads[pad].ftype, fcut: S.pads[pad].fcut };
      const clean = await window.JBH.vsDry(pad);
      /* Now close a lowpass hard — the exact shape of the bug that made a
         real piano sound like an electric one. */
      S.pads[pad].ftype = 'lowpass'; S.pads[pad].fcut = 0.18;
      const shut = await window.JBH.vsDry(pad);
      S.pads[pad].ftype = save.ftype; S.pads[pad].fcut = save.fcut;
      const top = s => { const m = {}; s.bands.forEach(b => { m[b.band] = b.delta; }); return m; };
      return { pad, cleanFx: clean.bypassed, cleanTop: top(clean)['4k-8k'],
               shutTop: top(shut)['4k-8k'], shutFx: shut.bypassed };
    });
    if (dry.skip) t.ok('a loaded pad exists', false);
    else {
      t.ok('a hard lowpass shows up as the top bands collapsing',
        dry.shutTop <= -6, '4k-8k reads ' + dry.shutTop + 'dB against the bypassed render');
      t.ok('and it names the filter among what it bypassed',
        dry.shutFx.indexOf('ftype') >= 0, dry.shutFx.join(', '));
      t.ok('while an unprocessed pad reports a near-zero difference',
        Math.abs(dry.cleanTop) < 3, '4k-8k ' + dry.cleanTop + 'dB with ' +
        (dry.cleanFx.length ? dry.cleanFx.join(', ') : 'nothing') + ' bypassed');
    }

    /* ---- 7. ONE CALL THAT COLLECTS THE BAD NEWS -------------------------- */
    t.head('critique COLLECTS WHAT THE OTHER CALLS ALREADY KNEW');
    const crit = await page.evaluate(async () => {
      const pads = S.pads.map((p, i) => (p && p.bufId >= 0 ? i : -1)).filter(i => i >= 0);
      if (pads.length < 2) return { skip: true };
      const pat = S.patterns[S.pattern];
      pads.slice(0, 2).forEach(p => { for (let i = 0; i < 16; i += 4) pat.steps[p][i] = 0.9; });
      const victim = pads[1], saveG = S.pads[victim].gain;
      S.pads[victim].gain = 0.004;                  // far under everything
      window.JBH.set({ mMud: 0.14 });               // the setting that lies
      const bad = await window.JBH.critique({ src: 'pat' });
      S.pads[victim].gain = saveG;
      window.JBH.set({ mMud: 0 });
      const sevs = bad.found.map(f => f.severity);
      return { ok: bad.ok, sevs, checked: bad.checked,
               hasMud: sevs.indexOf('out-of-range') >= 0,
               hasQuiet: bad.found.some(f => f.pad === victim) };
    });
    if (crit.skip) t.ok('two loaded pads exist', false);
    else {
      t.ok('a drowned pad is reported', crit.hasQuiet, crit.sevs.join(', '));
      t.ok('and so is the out-of-range mMud, in the same answer', crit.hasMud);
      t.ok('and the run is marked not-ok', crit.ok === false);
    }
    /* A remark must not read as a fault, or ok:false becomes the normal
       state and stops carrying information. */
    const clean = await page.evaluate(async () => {
      /* The reference left loaded by check 4 is cleared FIRST. Without this
         the run compared a four-bar mix against a 0.9s piano note, produced
         five off-reference findings, and the assertion below passed through
         its own escape clause — a test that was green for the wrong reason
         and hid a real one in critique(). */
      await window.JBH.reference(null);
      const r = await window.JBH.critique({ src: 'pat', balance: false });
      return { ok: r.ok, sevs: r.found.map(f => f.severity) };
    });
    t.ok('with nothing wrong, a missing reference alone does not fail the run',
      clean.ok === true,
      'ok=' + clean.ok + ' from [' + (clean.sevs.join(', ') || 'nothing') + ']');

    /* And the short reference must not be allowed to produce tone findings. */
    const shortJudge = await page.evaluate(async () => {
      const pad = S.pads.findIndex(p => p && p.bufId >= 0);
      await window.JBH.reference({ pad });
      const r = await window.JBH.critique({ src: 'pat', balance: false });
      await window.JBH.reference(null);
      return { off: r.found.filter(f => f.severity === 'off-reference').length,
               said: r.found.some(f => f.severity === 'no-reference') };
    });
    t.ok('a one-note reference produces no tone findings at all',
      shortJudge.off === 0, shortJudge.off + ' off-reference findings');
    t.ok('and critique says why rather than going quiet', shortJudge.said);

    /* ---- 8. A SINGLE NOTE IS NOT A MIX REFERENCE ------------------------- */
    t.head('AND A ONE-NOTE REFERENCE SAYS SO INSTEAD OF ANSWERING');
    const shortRef = await page.evaluate(async () => {
      const pad = S.pads.findIndex(p => p && p.bufId >= 0);
      const b = S.buffers[S.pads[pad].bufId];
      const r = await window.JBH.reference({ pad });
      const d = diffSpec(await specReport(b), r);
      await window.JBH.reference(null);
      return { secs: r.seconds, warned: /single note or hit/.test(d.notes[0] || '') };
    });
    t.ok('a reference under ten seconds is called out',
      shortRef.secs >= 10 || shortRef.warned,
      shortRef.secs + 's reference, warned=' + shortRef.warned);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
