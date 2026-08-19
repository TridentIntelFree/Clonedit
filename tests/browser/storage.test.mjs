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

    t.head('AND THE SAME GUARD ONE LEVEL DOWN, INSIDE pads[] AND trax[]');
    /* DOC_NUMS only ever saw top-level scalars. pads[].gain/.pan/.rev/.dly go
       to hardSet and then to an AudioParam, so a pad carrying a string broke
       the invariant exactly as masterVol did — and worse, because it did not
       stop at the session: the poisoned pad reached S, autosave wrote it to
       the vault, and RESTORE brought it back, leaving S.pads[0].gain a string
       while the audio node still held 0.9, disagreeing permanently. */
    const deep = await page.evaluate(async () => {
      const o = {};
      const base = structuredClone(snapshotSession());
      S.bpm = 91;
      const before = { bpm: S.bpm, gain: S.pads[0].gain };

      const cases = [
        ['pads[0].gain string', d => { d.pads[0].gain = 'banana'; }],
        ['pads[0].pan NaN', d => { d.pads[0].pan = NaN; }],
        ['pads[3].rev null-ish', d => { d.pads[3].rev = 'x'; }],
        ['pads[5].dly Infinity', d => { d.pads[5].dly = Infinity; }],
        ['pads[2].pitch string', d => { d.pads[2].pitch = '3'; }],
        ['pads[1] is null', d => { d.pads[1] = null; }],
        ['pads[0] is an array', d => { d.pads[0] = [1, 2, 3]; }],
        ['trax[0].gain string', d => { if (d.trax && d.trax[0]) d.trax[0].gain = 'loud'; }],
        ['trax[1].fcut NaN', d => { if (d.trax && d.trax[1]) d.trax[1].fcut = NaN; }],
      ];
      o.leaked = [];
      for (const [name, poison] of cases) {
        const d = structuredClone(base); poison(d);
        S.bpm = 91;
        let threw = null, res = null;
        try { res = applySessionDoc(d, docToBuffers(structuredClone(d))); }
        catch (e) { threw = String(e.message || e); }
        const held = S.bpm === 91 && typeof S.pads[0].gain === 'number';
        if (res !== false || threw || !held)
          o.leaked.push(name + ' → ' + (threw ? 'threw ' + threw : 'returned ' + res)
            + (held ? '' : ', SESSION TOUCHED bpm=' + S.bpm + ' gain=' + JSON.stringify(S.pads[0].gain)));
      }
      o.after = { bpm: S.bpm, gain: S.pads[0].gain };
      o.before = before;
      /* And a real pad document still loads — the check must not have become
         so strict that it refuses the app's own output. */
      o.realStillLoads = applySessionDoc(structuredClone(base),
        docToBuffers(structuredClone(base))) !== false;
      o.gainType = typeof S.pads[0].gain;
      return o;
    });
    t.ok('a poisoned pad or lane number is refused whole, at the gate',
      deep.leaked.length === 0, deep.leaked.join(' | ') || 'all 9 refused cleanly');
    t.ok('and the live session never sees it',
      deep.after.bpm === 91 && typeof deep.after.gain === 'number',
      JSON.stringify(deep.after));
    t.ok('while a real project still loads — the guard did not become the bug',
      deep.realStillLoads && deep.gainType === 'number');

    t.head('AN EMPTY SESSION DOES NOT WIPE THE VAULT');
    /* Undoing to the bottom returns the session to zero buffers, and dirty()
       then fires an ordinary autosave — which took the vault from sixteen
       buffers to none. Redo still held the work, but the undo stack is memory
       only: lose the page in that window and the work is gone silently. */
    const vault = await page.evaluate(async () => {
      const o = {};
      await idbPut('last', snapshotSession());
      const before = await idbGet('last');
      o.before = before.buffers.length;
      const keep = S.buffers;
      S.buffers = [];                       // what undoing to the bottom leaves
      await autosave();
      const after = await idbGet('last');
      o.after = after ? after.buffers.length : 'GONE';
      o.sameStamp = !!after && after.t === before.t;
      /* and it must SAY it filed the old one into REWIND, not fail silently */
      o.log = document.getElementById('projlog').textContent.split('\n')[0];
      o.lcd = document.getElementById('lcdmsg').textContent;
      // a second empty autosave must not churn out another checkpoint
      const logLen = document.getElementById('projlog').textContent.length;
      await autosave();
      o.noChurn = document.getElementById('projlog').textContent.length === logLen;
      S.buffers = keep;
      // and once there IS audio again, the vault updates normally
      await autosave();
      const back = await idbGet('last');
      o.restored = back ? back.buffers.length : 'GONE';
      return o;
    });
    t.ok('the vault still holds the audio after an empty-session autosave',
      vault.after === vault.before && vault.sameStamp,
      vault.before + ' buffers before, ' + vault.after + ' after');
    t.ok('and it says what it did rather than doing it silently',
      /REWIND/i.test(vault.log) && /HELD BACK|REWIND/i.test(vault.lcd),
      '"' + vault.lcd + '"');
    t.ok('a second empty autosave does not churn out another checkpoint', vault.noChurn);
    t.ok('and once there is audio again the vault updates normally',
      vault.restored > 0, vault.restored + ' buffers');

    t.head('A SHORT OR OVERLONG DOCUMENT IS REPAIRED, NOT REFUSED');
    /* The loops that consume these run to NPADS and NTRAX whatever the
       document brought, so a project carrying four pads threw on the fifth —
       the same half-applied load one more level down, and older than the
       numeric guard. A short pattern was quieter and worse: it LOADED, then
       threw during playback when the scheduler reached a step row that was
       not there, which is why this section renders as well as loads. */
    const shape = await page.evaluate(async () => {
      const o = { bad: [] };
      const base = structuredClone(snapshotSession());
      const run = async (name, mut, expect) => {
        const d = structuredClone(base); mut(d);
        let res = null, threw = null;
        try { res = applySessionDoc(d, docToBuffers(structuredClone(d))); }
        catch (e) { threw = 'load threw ' + (e.message || e); }
        if (!threw && expect === 'load') {
          if (res === false) threw = 'refused';
          else {
            /* And it must survive being PLAYED — that is where the short
               pattern used to fail, long after the load reported success.
               A null render is not a fault here: truncating a pattern's track
               rows legitimately removes the hits that lived on them, so there
               is genuinely nothing to play. Only a throw is a failure. */
            try { const b = await renderMix(null, null, { loops: 1, src: 'pat', noTail: true });
              if (b) { let pk = 0; const dd = b.getChannelData(0);
                for (let i = 0; i < dd.length; i++) { const v = Math.abs(dd[i]); if (v > pk) pk = v; }
                o.peaks = o.peaks || {}; o.peaks[name] = +pk.toFixed(3); }
              else { o.silent = o.silent || []; o.silent.push(name); }
            } catch (e) { threw = 'render threw ' + (e.message || e); }
          }
        }
        if (!threw && expect === 'refuse' && res !== false) threw = 'was accepted';
        if (threw) o.bad.push(name + ' → ' + threw);
        // restore a sane session between cases
        applySessionDoc(structuredClone(base), docToBuffers(structuredClone(base)));
      };
      await run('4 pads', d => { d.pads = d.pads.slice(0, 4); }, 'load');
      await run('0 pads', d => { d.pads = []; }, 'load');
      await run('80 pads', d => { while (d.pads.length < 80) d.pads.push(structuredClone(d.pads[0])); }, 'load');
      await run('a pattern with 4 track rows', d => {
        d.patterns.forEach(p => { p.steps = p.steps.slice(0, 4); }); }, 'load');
      await run('a pattern whose steps is not an array', d => { d.patterns[0].steps = null; }, 'load');
      await run('a track row that is not an array', d => { d.patterns[0].steps[2] = 'x'; }, 'load');
      await run('1 tape lane', d => { d.trax = d.trax.slice(0, 1); }, 'load');
      await run('no patterns at all', d => { d.patterns = []; }, 'refuse');
      o.padsAfter = S.pads.length;
      o.tracksAfter = S.patterns[0].steps.length;
      return o;
    });
    t.ok('every short or overlong shape loads, and playing it cannot throw',
      shape.bad.length === 0, shape.bad.join(' | ') || 'all 8 behaved');
    /* Which of these SHOULD still make sound took two corrections to get
       right, so it is spelled out. Truncating pads to four discards the sixty
       samples that lived on the rest, and truncating a pattern's track rows
       discards the hits on them — both are silent because the document really
       did throw that material away, not because anything failed. The cases
       that keep their audio are the ones where nothing was removed: extra pads
       appended, a single malformed row, a short tape-lane list. */
    t.ok('the shapes that lose nothing still make sound',
      shape.peaks && shape.peaks['80 pads'] > 0.02
      && shape.peaks['a track row that is not an array'] > 0.02
      && shape.peaks['1 tape lane'] > 0.02,
      JSON.stringify(shape.peaks));
    t.note('    silent because the document discarded the material, not because it broke: '
      + (shape.silent || []).concat(
          Object.keys(shape.peaks || {}).filter(k => shape.peaks[k] === 0)).join(', '));
    t.ok('and the session ends up with this build\'s own dimensions',
      shape.padsAfter === 64 && shape.tracksAfter === 64,
      shape.padsAfter + ' pads, ' + shape.tracksAfter + ' track rows');

    t.head('A HOSTILE SCALE FACTOR IS CLAMPED');
    const pk = await page.evaluate(() => {
      const f = new Float32Array(64);
      for (let i = 0; i < 64; i++) f[i] = Math.sin(i / 3) * 0.8;
      const q = pcmQuant(f, 1);
      const peak = arr => { let m = 0; for (let i = 0; i < arr.length; i++) { const v = Math.abs(arr[i]); if (v > m) m = v; } return m; };
      return {
        huge: peak(pcmRestore(q, 1e30)),
        max: PK_MAX,
        neg: peak(pcmRestore(q, -5)),
        zero: peak(pcmRestore(q, 0)),
        str: peak(pcmRestore(q, 'loud')),
        normal: peak(pcmRestore(q, 1)),
        finite: pcmRestore(q, 1e30).every(v => isFinite(v)),
      };
    });
    t.ok('a 1e30 scale cannot put astronomical samples in a buffer',
      pk.huge <= pk.max && pk.finite, 'peak ' + pk.huge.toFixed(2) + ', ceiling ' + pk.max);
    t.ok('negative, zero and non-numeric scales fall back to 1',
      Math.abs(pk.neg - pk.normal) < 1e-6 && Math.abs(pk.zero - pk.normal) < 1e-6
      && Math.abs(pk.str - pk.normal) < 1e-6,
      [pk.neg, pk.zero, pk.str, pk.normal].map(v => v.toFixed(4)).join(' / '));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
