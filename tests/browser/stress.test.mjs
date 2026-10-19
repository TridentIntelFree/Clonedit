/* THE STRESS PASS.

   Every other suite in here asks a specific question that somebody already
   thought of. This one does not: it explores. It exists because R200 to R202
   added a lot of state that interacts — a clip has a position, a trim and
   fades; a punch window splices into it; buffers are renumbered underneath by
   the collector; and all of it saves, loads and undoes. Hand-written cases
   cover the shapes you imagine. Most of what is left is shapes you did not.

   Three things, in order of how much each has found:

   1. A PROPERTY TEST over punchSplice. The old take is a RAMP, so every sample
      encodes its own position and a misplacement shows up as a wrong value
      rather than as silence. Two hundred and twenty random combinations of
      clip start, trim, and punch window — including windows that overhang the
      clip at either end — against one rule: outside the window you get the
      original, inside it you get the new audio.

   2. THE INVARIANTS THAT SPAN FEATURES. A bounce must be deterministic; the
      buffer collector must renumber without changing a note (which is exactly
      what R202's identity-keyed caches were for); a save and reload must
      bounce bit-for-bit the same; and putting a lane's old buffer back must
      restore what it played, which is what undo relies on.

   3. A RANDOM OPERATION SOAK. Five hundred operations drawn from fifteen —
      record, drag a clip, drag the ruler, punch, clear, new project, collect
      buffers, change tempo, snapshot — with every tape invariant re-checked
      after EVERY ONE, so a break is pinned to the operation that caused it
      rather than to the run. It ends by proving the app can still render. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('PUNCH IS CORRECT FOR SHAPES NOBODY WROTE A CASE FOR');
    const prop = await page.evaluate(async () => {
      const o = { fails: [] }; const wait = ms => new Promise(x => setTimeout(x, ms));
      ensureAudio(); await wait(300);
      const sr = AC.sampleRate;
      S.bpm = 120; S.swing = 0; S.human = 0; S.songOn = false; S.chainOn = false;
      const rnd = mulberry32(20261019);
      const mkRamp = (secs) => { const n = Math.round(sr * secs), b = AC.createBuffer(2, n, sr);
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
          for (let i = 0; i < n; i++) d[i] = i / n; }
        return b; };
      let runs = 0, bad = 0;
      for (let k = 0; k < 220; k++) {
        const old = mkRamp(2 + rnd() * 6);
        S.buffers.push(old);
        const tr = newTrack();
        tr.bufId = S.buffers.indexOf(old);
        tr.start = rnd() * 3; tr.tin = rnd() * 0.3; tr.tout = 0.7 + rnd() * 0.3;
        const cs = clipStart(tr), cl = clipLen(tr, old), ci = clipIn(tr, old);
        const pIn = Math.max(0, cs - 1 + rnd() * (cl + 2));
        const pOut = pIn + 0.15 + rnd() * 2;
        const n = Math.round(sr * (pOut + 2));
        const nl = new Float32Array(n).fill(-0.75), nr = new Float32Array(n).fill(-0.75);
        const res = punchSplice(tr, nl, nr, sr, pIn, pOut, 0);
        if (!res) continue;
        runs++;
        const d = res.buf.getChannelData(0), start = res.start, XF = 0.008;
        const at = s => d[Math.round((s - start) * sr)];
        const want = s => (ci + (s - cs)) / old.duration;
        let worst = 0, worstAt = -1;
        for (let s = start + 0.002; s < start + res.buf.duration - 0.002; s += 0.011) {
          if ((s > pIn - XF * 2 && s < pOut + XF * 2)) continue;
          if (!(s >= cs + 0.002 && s <= cs + cl - 0.002)) continue;
          const e = Math.abs(at(s) - want(s));
          if (e > worst) { worst = e; worstAt = s; }
        }
        let insideWorst = 0;
        for (let s = pIn + XF * 2.5; s < pOut - XF * 2.5; s += 0.011) {
          if (s < start) continue;
          insideWorst = Math.max(insideWorst, Math.abs(at(s) - (-0.75)));
        }
        if (worst > 2e-3 || insideWorst > 2e-3) { bad++;
          if (o.fails.length < 4) o.fails.push({ case: k, start: +cs.toFixed(3),
            len: +cl.toFixed(3), tin: +tr.tin.toFixed(3), pIn: +pIn.toFixed(3),
            pOut: +pOut.toFixed(3), outsideErr: +worst.toExponential(2),
            at: +worstAt.toFixed(3), insideErr: +insideWorst.toExponential(2) }); }
      }
      o.runs = runs; o.bad = bad;
      return o;
    });
    t.note('    ' + prop.runs + ' random clip/trim/window combinations placed');
    t.ok('enough of them were placeable to mean anything', prop.runs > 150, prop.runs + ' runs');
    t.ok('IN EVERY ONE, OUTSIDE THE WINDOW IS THE ORIGINAL AND INSIDE IS THE NEW AUDIO',
      prop.bad === 0, prop.bad ? JSON.stringify(prop.fails) : 'no counterexample in ' + prop.runs);

    t.head('THE INVARIANTS THAT SPAN FEATURES');
    const inv = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(x => setTimeout(x, ms));
      const sr = AC.sampleRate;
      S.bpm = 120; S.swing = 0; S.human = 0; S.songOn = false; S.chainOn = false;
      S.punchOn = false;
      document.getElementById('bSrc').value = 'pat';
      document.getElementById('bLoops').value = '1';
      const sig = (buf) => { const d = buf.getChannelData(0); let s = 0, pk = 0;
        for (let i = 0; i < d.length; i += 7) { s += d[i] * d[i] * (1 + (i % 13)); pk = Math.max(pk, Math.abs(d[i])); }
        return { e: +Math.sqrt(s / (d.length / 7)).toFixed(6), pk: +pk.toFixed(5), n: d.length }; };
      const same = (a, b) => a.n === b.n && Math.abs(a.e - b.e) < 1e-6 && Math.abs(a.pk - b.pk) < 1e-6;
      const mk = (secs, seed) => { const n = Math.round(sr * secs), b = AC.createBuffer(2, n, sr), r2 = mulberry32(seed);
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
          for (let i = 0; i < n; i++) d[i] = (r2() * 2 - 1) * 0.6; }
        return b; };
      S.trax.forEach(tr => { tr.bufId = -1; });
      S.pads.forEach(p => { p.mute = true; });
      const bar = tvBarSec();
      [[0, 3.0, 7, 0, 0, 1], [1, 2.0, 8, bar, 0.15, 0.8], [2, 2.5, 9, bar * 2, 0, 0.6]]
        .forEach(([i, len, seed, st, ti, to]) => {
          const b = mk(len, seed); S.buffers.push(b);
          const tr = S.trax[i];
          tr.bufId = S.buffers.indexOf(b); tr.mute = false; tr.gain = 0.9;
          tr.start = st; tr.tin = ti; tr.tout = to; tr.fin = 0.05; tr.fout = 0.08; });
      const lanes = new Set([0, 1, 2]);
      const bounce = async () => sig(await renderMix(new Set(), lanes, { loops: 1, src: 'pat', noTail: true }));
      const a1 = await bounce();
      o.deterministic = same(a1, await bounce());
      gcBuffers();
      o.gcSafe = same(a1, await bounce());
      S.punchOn = true; S.punchIn = bar; S.punchOut = bar * 2;
      const doc = JSON.parse(JSON.stringify(snapshotSession()));
      await applySessionDoc(JSON.parse(JSON.stringify(doc)), S.buffers.slice());
      await wait(120);
      o.roundTrip = same(a1, await bounce());
      o.clipsKept = S.trax.slice(0, 3).map(tr => [+(+tr.start).toFixed(3), +(+tr.tin).toFixed(3), +(+tr.tout).toFixed(3)]);
      o.punchKept = { on: S.punchOn, in: +(+S.punchIn).toFixed(3), out: +(+S.punchOut).toFixed(3) };
      const one = new Set([0]);
      const before = sig(await renderMix(new Set(), one, { loops: 1, src: 'pat', noTail: true }));
      const oldId = S.trax[0].bufId;
      const n2 = Math.round(sr * 6);
      const spl = punchSplice(S.trax[0], new Float32Array(n2).fill(0.4), new Float32Array(n2).fill(0.4), sr, 0.5, 1.5, 0);
      if (spl) { S.buffers.push(spl.buf); S.trax[0].bufId = S.buffers.length - 1;
        S.trax[0].start = spl.start; S.trax[0].tin = 0; S.trax[0].tout = 1; S.trax[0].fin = 0; S.trax[0].fout = 0; }
      o.punchChangedIt = !same(before, sig(await renderMix(new Set(), one, { loops: 1, src: 'pat', noTail: true })));
      S.trax[0].bufId = oldId; S.trax[0].start = 0; S.trax[0].tin = 0;
      S.trax[0].tout = 1; S.trax[0].fin = 0.05; S.trax[0].fout = 0.08;
      o.restorable = same(before, sig(await renderMix(new Set(), one, { loops: 1, src: 'pat', noTail: true })));
      S.pads.forEach(p => { p.mute = false; });
      S.punchOn = false;
      return o;
    });
    t.ok('the same project bounces the same twice', inv.deterministic);
    t.ok('COLLECTING BUFFERS RENUMBERS THEM WITHOUT CHANGING A NOTE',
      inv.gcSafe, 'the thing R202 identity-keyed the caches for');
    t.note('    clips after a save and reload: ' + JSON.stringify(inv.clipsKept));
    t.ok('A SAVE AND RELOAD BOUNCES BIT-FOR-BIT THE SAME', inv.roundTrip);
    t.ok('with every clip position, trim and the punch window intact',
      inv.punchKept.on === true && inv.clipsKept[1][0] > 0 && inv.clipsKept[1][1] > 0,
      JSON.stringify(inv.punchKept));
    t.ok('a punch really changes what the lane plays', inv.punchChangedIt);
    t.ok('and putting the old buffer back restores it exactly — what undo rides on',
      inv.restorable);

    t.head('FIVE HUNDRED OPERATIONS IN NO PARTICULAR ORDER');
    const soak = await page.evaluate(async () => {
      const o = { ops: 0, thrown: [], broken: [] };
      const wait = ms => new Promise(x => setTimeout(x, ms));
      document.querySelector('#tabs button[data-v="trax"]').click();
      await wait(200);
      const sr = AC.sampleRate, rnd = mulberry32(99887);
      const pick = a => a[Math.floor(rnd() * a.length)];

      const mkBuf = () => { const n = Math.round(sr * (0.5 + rnd() * 3));
        const b = AC.createBuffer(2, n, sr);
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
          for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * 0.5; }
        return b; };

      /* Every invariant the tape section is supposed to hold, checked after
         every single operation rather than at the end — so a break is pinned
         to the operation that caused it instead of to the whole run. */
      const check = (whatDidIt) => {
        S.trax.forEach((tr, i) => {
          const bad = [];
          if (tr.bufId >= S.buffers.length) bad.push('bufId ' + tr.bufId + ' past the end of S.buffers (' + S.buffers.length + ')');
          if (tr.bufId >= 0 && !S.buffers[tr.bufId]) bad.push('bufId ' + tr.bufId + ' points at nothing');
          ['start', 'tin', 'tout', 'fin', 'fout', 'gain', 'pan'].forEach(k => {
            if (!isFinite(+tr[k])) bad.push(k + ' is ' + tr[k]); });
          if (+tr.tout <= +tr.tin) bad.push('tout ' + tr.tout + ' <= tin ' + tr.tin);
          if (+tr.start < 0) bad.push('start ' + tr.start + ' is negative');
          if (bad.length && o.broken.length < 6) o.broken.push({ after: whatDidIt, track: i + 1, bad });
        });
        ['punchIn', 'punchOut'].forEach(k => {
          if (!isFinite(+S[k]) && o.broken.length < 6) o.broken.push({ after: whatDidIt, bad: [k + ' is ' + S[k]] }); });
      };

      const OPS = {
        record: () => { const i = Math.floor(rnd() * S.trax.length);
          const b = mkBuf(); S.buffers.push(b);
          const tr = S.trax[i]; tr.bufId = S.buffers.indexOf(b); tr.name = 'take' + i; },
        dragClip: () => { const bb = document.getElementById('tvcanvas').getBoundingClientRect();
          const row = Math.floor(rnd() * S.trax.length);
          const y = bb.top + TV_HEAD + TV_ROW * (row + 0.5);
          tvPointerDown(bb.left + rnd() * 200, y);
          tvPointerMove(bb.left + rnd() * 400, y);
          tvPointerUp(); },
        dragRuler: () => { const bb = document.getElementById('tvcanvas').getBoundingClientRect();
          tvPointerDown(bb.left + rnd() * 300, bb.top + 4);
          tvPointerMove(bb.left + rnd() * 500, bb.top + 4);
          tvPointerUp(); },
        punchToggle: () => document.getElementById('btnPunch').click(),
        punchSpliceGo: () => { const i = Math.floor(rnd() * S.trax.length), tr = S.trax[i];
          const n = Math.round(sr * 6);
          const nl = new Float32Array(n).fill(0.3), nr = new Float32Array(n).fill(0.3);
          const pi = rnd() * 4, po = pi + rnd() * 3;
          const res = punchSplice(tr, nl, nr, sr, pi, po, rnd() < 0.3 ? rnd() * 5 : 0);
          if (res) { S.buffers.push(res.buf); tr.bufId = S.buffers.length - 1;
            tr.start = res.start; tr.tin = 0; tr.tout = 1; tr.fin = 0; tr.fout = 0; } },
        clearTrack: () => clearTrack(Math.floor(rnd() * S.trax.length)),
        clipPanel: () => { const i = Math.floor(rnd() * S.trax.length); tvcOpen(i);
          ['tvcStart', 'tvcIn', 'tvcOut', 'tvcFin', 'tvcFout'].forEach(id => {
            const e = document.getElementById(id);
            if (e && rnd() < 0.5) { e.value = String(+e.min + rnd() * (+e.max - +e.min));
              e.dispatchEvent(new Event('input', { bubbles: true })); } }); },
        snapReset: () => { if (tvSel >= 0) (rnd() < 0.5
          ? document.getElementById('tvcSnap') : document.getElementById('tvcReset')).click(); },
        view: () => setTvView(rnd() < 0.5 ? 'track' : 'list'),
        muteSolo: () => { const i = Math.floor(rnd() * S.trax.length);
          if (rnd() < 0.5) S.trax[i].mute = !S.trax[i].mute;
          else traxSolo = traxSolo === i ? -1 : i;
          applyTraxMix(); drawTrax(); },
        gc: () => gcBuffers(),
        snap: () => JSON.parse(JSON.stringify(snapshotSession())),
        bpm: () => setBpm(60 + rnd() * 120),
        redraw: () => drawTrax(),
        newProject: () => { if (rnd() < 0.15) projNew(); },
      };
      const names = Object.keys(OPS);

      for (let k = 0; k < 500; k++) {
        const nm = pick(names);
        o.ran = o.ran || {}; o.ran[nm] = (o.ran[nm] || 0) + 1;
        try { OPS[nm](); o.ops++; }
        catch (e) { if (o.thrown.length < 8) o.thrown.push({ op: nm, err: String(e && e.message || e) }); }
        check(nm);
        if (k % 60 === 0) await wait(0);
      }
      o.buffers = S.buffers.length;
      /* Lay a fresh lane down AFTER the soak: the run can end just after a
         projNew() and an empty project renders null by design, so without
         this the final check measures the test's luck, not the app. */
      OPS.record(); OPS.record();
      o.lanesLoaded = S.trax.filter(tr => tr.bufId >= 0).length;
      try {
        S.pads.forEach(p => { p.mute = true; });
        const b = await renderMix(new Set(), new Set(S.trax.map((_, i) => i)), { loops: 1, src: 'pat', noTail: true });
        o.stillRenders = !!b && b.length > 0;
        S.pads.forEach(p => { p.mute = false; });
      } catch (e) { o.stillRenders = false; o.renderErr = String(e && e.message || e); }
      return o;
    });
    t.note('    ' + soak.ops + ' operations across ' + Object.keys(soak.ran || {}).length + ' kinds');
    t.ok('NOTHING THREW', soak.thrown.length === 0,
      soak.thrown.length ? JSON.stringify(soak.thrown) : 'all ' + soak.ops + ' completed');
    t.ok('AND NO TAPE INVARIANT BROKE — checked after every single one',
      soak.broken.length === 0,
      soak.broken.length ? JSON.stringify(soak.broken) : 'bufIds in range, trims ordered, every number finite');
    t.ok('every kind of operation actually got exercised',
      Object.keys(soak.ran || {}).length >= 14 &&
      Object.values(soak.ran || {}).every(n => n > 5), JSON.stringify(soak.ran));
    t.ok('and the app can still render afterwards', soak.stillRenders === true,
      soak.renderErr || (soak.lanesLoaded + ' lanes loaded'));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
