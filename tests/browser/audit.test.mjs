/* R202 — THE AUDIT FIXES.

   Each of these was found by driving R201 in a real browser or reading it
   against itself, and each was reproduced before it was fixed:

   - turning the master volume down set off the self-heal, which restarted the
     song from the top and pushed a deliberately quiet pad from 3% to 80%
   - BLACK BOX OFF threw "Cannot set properties of null" from late worklet chunks
   - after NEW PROJECT a reversed pad played the PREVIOUS project's sound, and
     pad faces drew the old sound's waveform — caches keyed on a reused index
   - with the MIC open, coming back to the app never resumed the audio context
   - a punch over a take recorded at another sample rate copied it at the wrong
     speed, and a pass armed after the punch-in point erased the lane up to
     where it armed

   The checks drive the same functions the app calls, so they fail on R201 and
   pass on R202. */

import { boot, checker } from './harness.mjs';

const wait = ms => new Promise(r => setTimeout(r, ms));

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('TURNING THE VOLUME DOWN IS NOT A FAULT');
    const pad = await page.evaluate(() => {
      const i = S.pads.findIndex(p => p.bufId >= 0);
      S.pads[i].gain = 0.03;
      startSeq();
      return i;
    });
    await wait(1500);
    await page.evaluate(() => { S.masterVol = 0; LIVE.master.gain.setTargetAtTime(0, AC.currentTime, 0.02); });
    const lcds = new Set();
    for (let k = 0; k < 18; k++) { await wait(500); lcds.add(await page.evaluate(() => document.getElementById('lcdmsg').textContent)); }
    const quiet = await page.evaluate(i => ({ gain: S.pads[i].gain, playing }), pad);
    t.ok('no self-heal fires with the master at zero', ![...lcds].some(s => /SELF-HEALED/.test(s)),
      [...lcds].map(s => s.slice(0, 40)).join(' | '));
    t.ok('and the quiet pad keeps the level it was given', Math.abs(quiet.gain - 0.03) < 1e-9, 'gain ' + quiet.gain);
    t.ok('and the song is still playing', quiet.playing === true);

    t.head('BUT A REALLY DEAD OUTPUT STILL HEALS');
    /* The control. Silence the graph underneath the app, with the master volume
       where the person left it: steps fire, nothing reaches the meters. */
    await page.evaluate(i => { S.pads[i].gain = 0.8; S.masterVol = 0.9;
      S.pads.forEach(p => { p.mute = false; });
      LIVE.master.gain.cancelScheduledValues(0); LIVE.master.gain.setValueAtTime(0, AC.currentTime); }, pad);
    let healed = false;
    for (let k = 0; k < 30 && !healed; k++) {
      await wait(500);
      healed = await page.evaluate(() => /SELF-HEALED/.test(document.getElementById('lcdmsg').textContent));
    }
    t.ok('a silent engine with an audible mix is rebuilt', healed);
    await page.evaluate(() => { try { stopSeq(); } catch (e) {} });

    t.head('BLACK BOX ON / OFF');
    const before = errors.length;
    await page.evaluate(async () => {
      for (let k = 0; k < 8; k++) { bbStop(); bbStart(); await new Promise(r => setTimeout(r, 60)); bbStop(); await new Promise(r => setTimeout(r, 90)); }
      bbStart();
    });
    await wait(600);
    t.ok('switching it off and on throws nothing', errors.length === before, errors.slice(before).join(' | '));
    const bb = await page.evaluate(() => ({ on: !!bbTap, filled: bbFilled }));
    t.ok('and it is recording again afterwards', bb.on && bb.filled > 0, JSON.stringify(bb));

    t.head('A NEW PROJECT DOES NOT INHERIT THE OLD ONE\'S AUDIO');
    const caches = await page.evaluate(() => {
      const zc = a => { let z = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) z++; return z; };
      const i = S.pads.findIndex(p => p.bufId >= 0);
      const oldBid = S.pads[i].bufId;
      getReversed(oldBid); peaksFor(oldBid);       // warm both caches on the old sound
      projNew();
      // a rising 1760 Hz tone: nothing like a kick, forwards or backwards
      const sr = AC.sampleRate, n = sr, b = AC.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let k = 0; k < n; k++) d[k] = 0.5 * Math.sin(2 * Math.PI * 1760 * k / sr) * (k / n);
      S.buffers.push(b); S.pads[0].bufId = S.buffers.length - 1;
      const bid = S.pads[0].bufId, r = getReversed(bid), pk = peaksFor(bid);
      return { bid, fwd: zc(d), rev: zc(r.getChannelData(0)), revFirst: Math.abs(r.getChannelData(0)[10]),
               pkHead: pk[0], pkTail: pk[pk.length - 1] };
    });
    t.ok('the reversed copy is of the NEW sound', Math.abs(caches.fwd - caches.rev) <= 2,
      caches.fwd + ' vs ' + caches.rev + ' zero crossings');
    t.ok('and the pad face draws the new sound (quiet head, loud tail)', caches.pkHead < 0.2 && caches.pkTail > 0.9,
      'head ' + caches.pkHead.toFixed(2) + ' tail ' + caches.pkTail.toFixed(2));

    t.head('BACK FROM THE BACKGROUND WITH THE MIC OPEN');
    const resumed = await page.evaluate(async () => {
      await AC.suspend();
      const was = AC.state;
      micOn = true;
      try { resumeSession(); } finally { micOn = false; }
      await new Promise(r => setTimeout(r, 300));
      return { was, now: AC.state };
    });
    t.ok('the audio context is woken even though an input is open', resumed.was === 'suspended' && resumed.now === 'running',
      resumed.was + ' → ' + resumed.now);

    t.head('PUNCH-IN OVER A TAKE AT ANOTHER SAMPLE RATE');
    const sr = await page.evaluate(() => {
      const sr = 44100, osr = 48000;
      // the existing take: 3s at 48k with one click at exactly 0.5s
      const old = new AudioBuffer({ length: osr * 3, sampleRate: osr, numberOfChannels: 2 });
      old.getChannelData(0)[osr / 2] = 1; old.getChannelData(1)[osr / 2] = 1;
      S.buffers.push(old);
      const tr = newTrack(); tr.bufId = S.buffers.length - 1; tr.start = 0;
      const nl = new Float32Array(sr * 3), nr = new Float32Array(sr * 3);
      const r = punchSplice(tr, nl, nr, sr, 1, 2, 0);
      const o = r.buf.getChannelData(0);
      let at = -1, pk = 0; for (let k = 0; k < sr; k++) if (Math.abs(o[k]) > pk) { pk = Math.abs(o[k]); at = k; }
      return { at: at / sr, rate: r.buf.sampleRate, len: r.buf.duration };
    });
    t.near('the old take\'s click is still at 0.5s', sr.at, 0.5, 0.001, 's');
    t.near('and the take is still 3s long', sr.len, 3, 0.01, 's');

    t.head('A PASS ARMED AFTER THE PUNCH-IN POINT');
    const mid = await page.evaluate(() => {
      const sr = AC.sampleRate;
      const old = AC.createBuffer(2, sr * 3, sr);
      old.getChannelData(0).fill(0.5); old.getChannelData(1).fill(0.5);
      S.buffers.push(old);
      const tr = newTrack(); tr.bufId = S.buffers.length - 1; tr.start = 0;
      // armed at 1.5s: zero-padded to there, real audio (0.25) after
      const nl = new Float32Array(sr * 3), nr = new Float32Array(sr * 3);
      nl.fill(0.25, Math.round(sr * 1.5)); nr.fill(0.25, Math.round(sr * 1.5));
      const r = punchSplice(tr, nl, nr, sr, 1.0, 2.5, 1.5);
      const o = r.buf.getChannelData(0), at = s => o[Math.round(s * sr)];
      return { before: at(1.25), inside: at(2.0), after: at(2.75) };
    });
    t.ok('what was on the lane before recording began is kept', Math.abs(mid.before - 0.5) < 1e-6, 'at 1.25s: ' + mid.before);
    t.ok('the new audio lands where it was recorded', Math.abs(mid.inside - 0.25) < 1e-6, 'at 2.0s: ' + mid.inside);
    t.ok('and the take continues after the punch-out', Math.abs(mid.after - 0.5) < 1e-6, 'at 2.75s: ' + mid.after);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } catch (e) {
    t.ok('the suite ran to the end', false, String(e && e.stack || e));
  } finally {
    await ctx.close();
  }
  return { lines: t.lines, failures: t.failures };
}
