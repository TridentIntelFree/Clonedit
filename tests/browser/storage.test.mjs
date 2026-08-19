/* WHAT SURVIVES BEING SAVED.

   Three findings from a QA pass on R160, all reproduced here first so the
   fixes are measured against the failure rather than asserted.

   ONE: a document that passes docAccept could still throw part way through
   applySessionDoc. Most numeric fields carried defaults; masterVol and delayFb
   did not, and both are written straight into AudioParams, which throw on a
   non-finite value. The load failed a third of the way down — AFTER pads,
   patterns and tape lanes had been replaced — and printed "LOAD FAILED" over a
   session that had in fact been half-overwritten and could not be recovered.
   docAccept's own comment states the invariant it was breaking: every route in
   must be refused whole or applied whole.

   TWO: every persistence path quantised audio to Int16 clamped at +/-1. The
   TRAX tap sits upstream of the limiter on purpose, so takes above 0dBFS are
   normal and the float path carries them; saving flat-topped them permanently,
   including into the slot crash-recovery reads.

   THREE: the same quantisation is undithered and fixed in absolute terms, so
   quiet material lost the most — about 6 effective bits at -60dBFS.

   Two and three are one fix: a scale factor per channel. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A HALF-APPLIED LOAD IS REFUSED AT THE GATE');
    const gate = await page.evaluate(async () => {
      const o = { survived: [], refused: [] };
      const base = structuredClone(snapshotSession());
      /* A marker that tells a whole load from a half one: if the session is
         genuinely untouched, this pad and this tempo are still here after. */
      const mark = () => ({ bpm: S.bpm, pads: S.pads.length,
        pat0: S.patterns[0] ? S.patterns[0].steps[0].join('') : '' });
      S.bpm = 137;
      const before = mark();

      /* Every field that reaches an AudioParam, deleted one at a time. */
      for (const k of ['masterVol', 'delayFb', 'bpm', 'swing', 'vcurve', 'midiCh',
        'pcPat', 'silFade', 'revLvl', 'compAmt', 'mCeil', 'mTrim', 'mWidth',
        'mMud', 'mAir', 'mFocus', 'mDeess', 'takeSeed']) {
        const d = structuredClone(base); delete d[k];
        /* Asserting only "did not throw" is what let a bad DOC_NUMS entry
           through: listing `morph`, which is an object, made docAccept refuse
           every real project, and a no-throw check called that a pass. The
           load must actually RETURN TRUE. */
        let bad = null;
        try { if (applySessionDoc(d, docToBuffers(structuredClone(d))) === false) bad = 'refused'; }
        catch (e) { bad = 'threw: ' + String(e.message || e); }
        (bad ? o.refused : o.survived).push(k + (bad ? ' — ' + bad : ''));
      }

      /* And present-but-not-a-number, which is the shape a truncated or
         hand-edited file actually arrives in. */
      S.bpm = 137;
      const evil = structuredClone(base);
      evil.masterVol = 'loud';
      let evilThrew = null, accepted = null;
      try { accepted = applySessionDoc(evil, docToBuffers(structuredClone(evil))); }
      catch (e) { evilThrew = String(e.message || e); }
      o.evilThrew = evilThrew;
      o.evilAccepted = accepted;
      o.afterEvil = mark();
      o.before = before;
      o.lcd = document.getElementById('lcdmsg').textContent;

      const nan = structuredClone(base); nan.delayFb = NaN;
      o.nanRefused = applySessionDoc(nan, docToBuffers(structuredClone(nan))) === false;
      return o;
    });
    t.ok('a document missing any one of them still LOADS — not throws, not refused',
      gate.refused.length === 0, gate.refused.join(' | ') || 'all 18 loaded');
    t.ok('a field present but not a number is refused, not applied',
      gate.evilAccepted === false && !gate.evilThrew,
      gate.evilThrew ? 'threw: ' + gate.evilThrew : 'returned false cleanly');
    t.ok('and the session it refused is genuinely untouched',
      JSON.stringify(gate.afterEvil) === JSON.stringify(gate.before),
      JSON.stringify(gate.afterEvil) + ' vs ' + JSON.stringify(gate.before));
    t.ok('the message says the file is damaged rather than blaming the session',
      /damaged/i.test(gate.lcd), '"' + gate.lcd + '"');
    t.ok('NaN is caught too, not just the wrong type', gate.nanRefused);

    /* The guard on the guard. DOC_NUMS is a hand-written list of field names,
       and naming a field that is not actually numeric makes docAccept refuse
       EVERY real project — a far worse bug than the one it exists to prevent.
       It happened twice while writing this: `morph` is an object and `vcurve`
       is the string 'linear'. Checked against a real document so the list
       cannot drift away from the schema. */
    const nums = await page.evaluate(() => {
      const doc = snapshotSession(), wrong = {};
      for (const k of DOC_NUMS) {
        const x = doc[k];
        if (x == null) wrong[k] = 'absent from a real snapshot';
        else if (typeof x !== 'number' || !isFinite(x)) wrong[k] = typeof x + ' ' + JSON.stringify(x);
      }
      return { wrong, count: DOC_NUMS.length };
    });
    t.ok('every field DOC_NUMS names really is a finite number in a real project',
      Object.keys(nums.wrong).length === 0,
      Object.keys(nums.wrong).length ? JSON.stringify(nums.wrong) : nums.count + ' fields, all numeric');

    t.head('AUDIO OVER 0dBFS SURVIVES BEING SAVED');
    const loud = await page.evaluate(async () => {
      const SR = AC.sampleRate, N = 4096;
      const src = AC.createBuffer(2, N, SR);
      const a = src.getChannelData(0), b = src.getChannelData(1);
      for (let i = 0; i < N; i++) {
        a[i] = 1.16 * Math.sin(2 * Math.PI * 220 * i / SR);   // a real take can reach this
        b[i] = 0.004 * Math.sin(2 * Math.PI * 440 * i / SR);  // and a quiet one this
      }
      a[0] = 1.9; a[1] = -1.9;
      const worst = (x, y) => { let w = 0;
        for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); if (d > w) w = d; }
        return w; };
      const pk = d => { let m = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; };
      const over = d => { let n = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1) n++; return n; };

      // through the .json project path
      const p0 = pcmPeak(a), p1 = pcmPeak(b);
      const j0 = b64ToF32(f32ToB64(a, p0), p0), j1 = b64ToF32(f32ToB64(b, p1), p1);
      // through the autosave vault path
      const v0 = pcmRestore(pcmQuant(a, p0), p0), v1 = pcmRestore(pcmQuant(b, p1), p1);
      // and what the OLD code did, for the comparison
      const oldQ = f => { const i16 = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
        const g = new Float32Array(f.length);
        for (let i = 0; i < f.length; i++) g[i] = i16[i] / 32767;
        return g; };
      const legacy = oldQ(a);

      return {
        srcPeak: pk(a), srcOver: over(a),
        jsonPeak: pk(j0), jsonOver: over(j0), jsonErr: worst(a, j0),
        vaultPeak: pk(v0), vaultOver: over(v0), vaultErr: worst(a, v0),
        legacyPeak: pk(legacy), legacyOver: over(legacy), legacyFlat: legacy.filter(v => v >= 0.99997).length,
        quietErrJson: worst(b, j1), quietErrVault: worst(b, v1),
        quietLegacyErr: worst(b, oldQ(b)), quietPeak: pk(b),
      };
    });
    /* Effective bits RELATIVE TO THE SIGNAL, not to full scale. The error of an
       undithered fixed grid is constant in absolute terms, so measuring against
       full scale hides the entire finding: it reports 17 bits for a -48dBFS
       channel that a listener hears as 8. */
    const bits = (e, peak) => Math.log2(peak / e);
    t.note('    source peaks ' + loud.srcPeak.toFixed(4) + ' with ' + loud.srcOver + ' samples over 1.0');
    t.note('    old code     peak ' + loud.legacyPeak.toFixed(5) + ', ' + loud.legacyFlat + ' samples pinned flat at full scale');
    t.ok('the .json project no longer clips a take above 0dBFS',
      loud.jsonPeak > 1.8 && loud.jsonOver === loud.srcOver,
      'peak ' + loud.jsonPeak.toFixed(4) + ', ' + loud.jsonOver + ' over (source had ' + loud.srcOver + ')');
    t.ok('nor does the autosave vault crash-recovery reads from',
      loud.vaultPeak > 1.8 && loud.vaultOver === loud.srcOver,
      'peak ' + loud.vaultPeak.toFixed(4) + ', ' + loud.vaultOver + ' over');
    t.ok('the old encoding really did flatten it — this is the bug, measured',
      loud.legacyPeak <= 1.0001 && loud.legacyFlat > 100,
      loud.legacyFlat + ' samples flat-topped at 1.0');

    t.head('AND QUIET AUDIO KEEPS ITS RESOLUTION');
    t.note('    a channel peaking ' + loud.quietPeak.toFixed(4)
      + ' (' + (20 * Math.log10(loud.quietPeak)).toFixed(1) + ' dBFS)');
    t.ok('the old encoding left it under 9 effective bits',
      bits(loud.quietLegacyErr, loud.quietPeak) < 9,
      bits(loud.quietLegacyErr, loud.quietPeak).toFixed(1) + ' bits, worst error '
      + loud.quietLegacyErr.toExponential(2));
    t.ok('scaling per channel gives it the whole 16-bit grid back',
      bits(loud.quietErrVault, loud.quietPeak) > 14.5,
      bits(loud.quietErrVault, loud.quietPeak).toFixed(1) + ' bits, worst error '
      + loud.quietErrVault.toExponential(2));
    t.ok('on the .json path too', bits(loud.quietErrJson, loud.quietPeak) > 14.5,
      bits(loud.quietErrJson, loud.quietPeak).toFixed(1) + ' bits');
    t.ok('and a loud channel is no worse than it was',
      bits(loud.vaultErr, loud.srcPeak) > 14.5,
      bits(loud.vaultErr, loud.srcPeak).toFixed(1) + ' bits');

    t.head('OLDER PROJECTS STILL OPEN, AND OLDER BUILDS REFUSE THESE');
    const compat = await page.evaluate(async () => {
      const o = {};
      const doc = structuredClone(snapshotSession());
      o.version = doc.v;
      /* A v2 document: quantised against full scale, carrying no pk. Absent pk
         must mean 1, which is exactly what the old encoder assumed. */
      const v2 = structuredClone(doc);
      v2.v = 2;
      (v2.buffers || []).forEach(b => { delete b.pk; });
      o.v2Accepted = applySessionDoc(v2, docToBuffers(structuredClone(v2))) !== false;
      let pk = 0;
      const back = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      if (back) { const d = back.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      o.v2Peak = pk;
      const future = structuredClone(doc); future.v = 99;
      o.futureRefused = applySessionDoc(future, docToBuffers(structuredClone(future))) === false;
      o.futureLcd = document.getElementById('lcdmsg').textContent;
      return o;
    });
    t.ok('this build writes v3', compat.version === 3, 'v' + compat.version);
    t.ok('a project written before the scale factor still opens', compat.v2Accepted);
    t.ok('and still makes sound — absent pk reads as 1, the old meaning',
      compat.v2Peak > 0.05, 'peak ' + compat.v2Peak.toFixed(4));
    t.ok('a document from a newer build is still refused whole', compat.futureRefused);
    t.ok('saying so rather than misreading it', /NOT OPENED|Update JBH-88/i.test(compat.futureLcd),
      '"' + compat.futureLcd + '"');

    t.head('A ROUND TRIP OF THE WHOLE SESSION');
    const trip = await page.evaluate(async () => {
      const snap = structuredClone(snapshotSession());
      applySessionDoc(structuredClone(snap), docToBuffers(structuredClone(snap)));
      const b = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
      let pk = 0;
      if (b) { const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      return { peak: pk, bufs: S.buffers.length, pads: S.pads.filter(p => p.bufId >= 0).length };
    });
    t.ok('the reloaded session still plays', trip.peak > 0.05,
      'peak ' + trip.peak.toFixed(4) + ', ' + trip.bufs + ' buffers, ' + trip.pads + ' loaded pads');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
