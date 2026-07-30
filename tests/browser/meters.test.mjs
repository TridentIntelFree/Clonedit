/* THE METERS MEASURE WHAT THEY ARE NAMED.

   A meter that agrees with itself proves nothing, so every figure here is
   checked against a signal whose answer is known by construction rather than
   against another part of the app. That discipline is not decoration: three
   earlier true-peak implementations and one of my own reference figures passed
   a self-consistency check and were still wrong.

   LOUDNESS was once a K-weighted RMS of a single 46ms analyser frame, ungated,
   labelled LUFS and sitting in a row with PEAK and RMS, which were true. It
   read 4.6dB optimistic — aim a master at -14 with that and you deliver -18.6. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async () => {
      const o = {};
      const N = 8192, sr = AC.sampleRate;
      const mk = fn => { const b = AC.createBuffer(1, N, sr), d = b.getChannelData(0);
        for (let i = 0; i < N; i++) d[i] = fn(i); return b; };

      /* A full-scale sine at sr/4 sampled on its zero crossings: the samples sit
         at ±0.7071 and the true peak between them is exactly 1.0. A meter that
         cannot find that +3.01dB cannot be trusted on music. */
      const sine = mk(i => Math.sin(2 * Math.PI * (i + 0.5) / 4));
      o.sineSample = samplePeakOf(sine);
      o.sineTrue = truePeakOf(sine);
      const dc = mk(() => 0.5);
      o.dcTrue = truePeakOf(dc);                   // DC has no inter-sample peak

      /* For a stereo sine of amplitude A the BS.1770 sum is z = 2·(A²/2) = A²,
         and at 1kHz the K curve's +0.7dB almost exactly cancels the -0.691
         offset — so it reads its own peak dBFS. My first version of this test
         asserted -23 for a -20dBFS tone, which was simply wrong. */
      const tone = (amp, chans) => { const b = AC.createBuffer(chans, sr * 4, sr);
        for (let c = 0; c < chans; c++) { const d = b.getChannelData(c);
          for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * 1000 * i / sr); }
        return b; };
      o.ref = lufsIntegrated(tone(0.1, 2)).lufs;
      o.ref10 = lufsIntegrated(tone(0.0316, 2)).lufs;
      o.refMono = lufsIntegrated(tone(0.1, 1)).lufs;

      // the fast true-peak path must agree with brute force on a real bounce
      document.getElementById('bLoops').value = '1';
      const buf = await renderMix(null, null);
      const tA = performance.now(); o.fast = truePeakOf(buf); o.tFast = performance.now() - tA;
      const tB = performance.now();
      o.brute = (() => { const edge = TP_PHASES[0].length, off = TP_PHASES.offset; let pk = 0;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch);
          const lo = Math.min(edge, Math.floor(d.length / 2)), hi = Math.max(lo, d.length - edge);
          for (let n = lo; n < hi; n++) for (let q = 0; q < TP_OS; q++) {
            const h = TP_PHASES[q]; let acc = 0;
            for (let k = 0; k < h.length; k++) { const i = n - k + off;
              if (i >= 0 && i < d.length) acc += d[i] * h[k]; }
            const a = Math.abs(acc); if (a > pk) pk = a; } }
        return pk; })();
      o.tBrute = performance.now() - tB;
      o.report = bounceReport(buf);
      o.integrated = lufsIntegrated(buf).lufs;

      // and the live meter must actually read while playing
      document.querySelector('#tabs button[data-v="out"]').click();
      await new Promise(x => setTimeout(x, 300));
      startSeq();
      await new Promise(x => setTimeout(x, 4000));
      o.shown = document.getElementById('mLufsV').textContent;
      const lr = loudRead();
      o.m = lr.m; o.s = lr.s;
      stopSeq();
      return o;
    });

    const dB = v => 20 * Math.log10(v);

    t.head('TRUE PEAK, ON SIGNALS WITH KNOWN ANSWERS');
    t.near('an sr/4 sine sampled between its peaks reads -3.01 dBFS',
      dB(r.sineSample), -3.01, 0.05, 'dB');
    t.near('and 0.00 dBTP true', dB(r.sineTrue), 0, 0.25, 'dB');
    t.near('DC has no inter-sample peak', r.dcTrue, 0.5, 0.01);

    t.head('LOUDNESS, AGAINST WHAT THE STANDARD REQUIRES');
    t.near('a 1kHz -20dBFS stereo tone reads its own peak dBFS', r.ref, -20, 0.5, ' LUFS');
    t.near('10dB down reads 10 LU down', r.ref - r.ref10, 10, 0.2, ' LU');
    t.near('two channels are 3.01 LU louder than one', r.ref - r.refMono, 3.01, 0.2, ' LU');

    t.head('THE FAST TRUE-PEAK PATH');
    t.ok('agrees with brute force', Math.abs(dB(r.fast / r.brute)) < 0.01,
      Math.abs(dB(r.fast / r.brute)).toFixed(4) + 'dB apart');
    t.ok('and is much faster', r.tBrute > r.tFast * 3,
      (r.tBrute / Math.max(r.tFast, 0.001)).toFixed(0) + '× (' + r.tFast.toFixed(0) + 'ms vs ' +
      r.tBrute.toFixed(0) + 'ms)');

    t.head('THE BOUNCE REPORT');
    r.report.forEach(l => t.note('    ' + l));
    t.ok('it states an integrated loudness', r.report.some(l => /LUFS/.test(l)));
    t.ok('it states a true peak in dBTP', r.report.some(l => /dBTP/.test(l)));
    t.ok('it compares against the -14 streaming target', r.report.some(l => /-14/.test(l)));
    t.ok('the reported integrated figure matches a fresh measurement',
      r.report.some(l => l.includes(r.integrated.toFixed(1))),
      'measured ' + r.integrated.toFixed(1));

    t.head('THE LIVE METER');
    t.note('    on screen: "' + r.shown + '"');
    t.ok('it reads a number while playing', r.m !== null && isFinite(r.m),
      'momentary ' + (isFinite(r.m) ? r.m.toFixed(1) : '—'));
    t.ok('the panel shows it', /\d/.test(r.shown), '"' + r.shown + '"');
    t.ok('momentary and short-term are in the same neighbourhood',
      !isFinite(r.s) || Math.abs(r.m - r.s) < 12,
      isFinite(r.s) ? Math.abs(r.m - r.s).toFixed(1) + ' apart' : 'short-term not yet filled');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
