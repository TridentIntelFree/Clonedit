/* THE SAMPLE RATE TRAP.

   A DIAG from a real phone read "ctx:running @16000Hz". Safari drops the audio
   session to 16kHz when a mic stream is live or a Bluetooth headset negotiates
   HFP, and a context created at that moment is born there for its lifetime.

   The damage was never the thin monitoring. decodeAudioData decodes at the rate
   of the context you call it on, so a 44.1k sample imported during such a
   session lost two thirds of its bandwidth permanently — and renderMix renders
   at 44100 regardless, so the bounce upsampled the wreckage into a file that
   measured perfectly and sounded like a phone call.

   The property under test is therefore not "the code runs". It is that a sample
   imported during a degraded session keeps its full bandwidth. A 15kHz tone
   settles that with no room for interpretation: a 16kHz buffer has a Nyquist of
   8kHz and cannot represent it at all. Chrome honours the sampleRate hint, so
   the degraded session is reproduced for real rather than mocked. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    const r = await page.evaluate(async () => {
      const o = {};
      const TONE = 15000, SRC_SR = 44100;
      /* Goertzel: the energy at exactly f, as a fraction of full scale. */
      const at = (d, sr, f) => {
        const n = Math.min(d.length, 16384), w = 2 * Math.PI * f / sr;
        const cr = 2 * Math.cos(w); let s1 = 0, s2 = 0;
        for (let i = 0; i < n; i++) { const s = d[i] + cr * s1 - s2; s2 = s1; s1 = s; }
        return 2 * Math.sqrt(s1 * s1 + s2 * s2 - cr * s1 * s2) / n;
      };
      const rms = d => { let a = 0; for (let i = 0; i < d.length; i++) a += d[i] * d[i];
        return Math.sqrt(a / d.length); };

      // 1s of 15kHz, written out as a real 44.1k WAV by the app's own encoder
      const oc = new OfflineAudioContext(1, SRC_SR, SRC_SR);
      const src = oc.createBuffer(1, SRC_SR, SRC_SR), sd = src.getChannelData(0);
      for (let i = 0; i < sd.length; i++) sd[i] = 0.8 * Math.sin(2 * Math.PI * TONE * i / SRC_SR);
      const wav = await encodeWav(src).arrayBuffer();
      o.sourceEnergy = at(sd, SRC_SR, TONE);

      const realAC = AC;
      o.liveRate = realAC.sampleRate;
      o.healthyDecodesOnLive = decodeCtx() === realAC;
      o.healthyBad = srBad();

      let fake = null;
      try { fake = new AudioContext({ sampleRate: 16000 }); } catch (e) {}
      if (!fake || fake.sampleRate !== 16000) { o.couldNotFake = true; return o; }
      AC = fake;                                   // stand where the phone stood
      o.degradedBad = srBad();

      // what the old code did: decode on the live context
      const before = await new Promise((res, rej) => {
        const ok = x => res(x), bad = e => rej(e);
        const p = AC.decodeAudioData(wav.slice(0), ok, bad); if (p && p.then) p.then(ok, bad);
      });
      o.beforeRate = before.sampleRate;
      o.beforeRms = rms(before.getChannelData(0));
      o.beforeEnergy = at(before.getChannelData(0), before.sampleRate, TONE);

      // what it does now
      const after = await decode(wav.slice(0));
      o.afterRate = after.sampleRate;
      o.afterRms = rms(after.getChannelData(0));
      o.afterEnergy = at(after.getChannelData(0), after.sampleRate, TONE);

      // the rescued buffer must still be playable on the degraded context
      try { const s = AC.createBufferSource(); s.buffer = after; s.connect(AC.destination);
        o.playable = true; } catch (e) { o.playable = false; o.playErr = e.message; }

      srWatch();
      const bar = document.getElementById('srBar');
      o.bannerShown = bar && bar.style.display === 'flex';
      o.bannerText = document.getElementById('srWhat').textContent;
      o.diag = (diagDump('test').match(/ctx:[^\n]*/) || [''])[0];

      AC = realAC;
      try { fake.close(); } catch (e) {}
      srWatch();
      o.bannerCleared = document.getElementById('srBar').style.display === 'none';
      return o;
    });

    if (r.couldNotFake) {
      t.ok('a 16kHz context could be opened to test with', false,
        'this browser refused the sampleRate hint');
      return t;
    }

    t.head('THE HEALTHY CASE MUST BE UNCHANGED');
    t.note('    live context ' + r.liveRate + ' Hz');
    t.ok('a healthy context is not flagged', !r.healthyBad);
    t.ok('and is decoded on directly — no detour, no extra resample',
      r.healthyDecodesOnLive);

    t.head('THE TRAP: A SESSION AT 16000 Hz');
    t.ok('the app recognises it as degraded', r.degradedBad);
    t.note('    BEFORE (decoded on the live context, which is what shipped)');
    t.note('      buffer ' + r.beforeRate + ' Hz · rms ' + r.beforeRms.toFixed(4) +
      ' · energy at 15kHz ' + r.beforeEnergy.toFixed(3));
    t.note('    AFTER (decodeCtx routes around the degraded session)');
    t.note('      buffer ' + r.afterRate + ' Hz · rms ' + r.afterRms.toFixed(4) +
      ' · energy at 15kHz ' + r.afterEnergy.toFixed(3));
    t.ok('the old path really did destroy the tone', r.beforeEnergy < 0.01,
      'energy ' + r.beforeEnergy.toFixed(4) + ' — above this buffer\'s 8kHz Nyquist');
    t.ok('the rescued decode is at full rate', r.afterRate >= 44100, r.afterRate + ' Hz');
    t.ok('AND THE 15kHz TONE SURVIVES INTACT', r.afterEnergy > 0.5,
      r.afterEnergy.toFixed(3) + ' of ' + r.sourceEnergy.toFixed(3) + ' in the source');
    t.ok('it still plays on the 16kHz context (buffers carry their own rate)',
      r.playable, r.playErr || '');

    t.head('AND IT SAYS SO');
    t.ok('the banner appears', r.bannerShown);
    t.ok('naming the actual rate', /16000 Hz/.test(r.bannerText), '"' + r.bannerText + '"');
    t.ok('DIAG flags it too', /LOW/.test(r.diag), r.diag);
    t.ok('the banner clears once the rate is healthy again', r.bannerCleared);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
