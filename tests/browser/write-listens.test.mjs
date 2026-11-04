/* IT LISTENS TO THE PAD BEFORE IT WRITES FOR IT.

   All the write path knew about an instrument was its PITCH:
   mlVoices() reads `p.srcNote` and nothing else, so a 90ms pluck and a
   two-second bowed swell got IDENTICAL parts and whether the part could
   be played at all was discovered by listening to the result. timbre()
   had measured exactly what settles that since the day it was added and
   no part of the write path ever called it.

   The claim under test is narrow and checkable: the same role, the same
   tempo, the same seed, two sounds that differ only in how fast they
   speak — and the figures offered must differ. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A SLOW SOUND IS NOT WRITTEN LIKE A FAST ONE');
    const r = await page.evaluate(async () => {
      /* Two instruments built by hand so the ONLY difference is the
         attack. A preset would differ in a dozen ways at once and the
         test would prove nothing about which one mattered. */
      const sr = AC.sampleRate;
      const mk = (attackSec) => {
        const buf = AC.createBuffer(1, Math.round(sr * 1.2), sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          const tt = i / sr;
          const a = tt < attackSec ? tt / attackSec
            : Math.pow(10, -3 * (tt - attackSec) / 0.8);
          d[i] = 0.6 * a * Math.sin(2 * Math.PI * 220 * tt);
        }
        S.buffers.push(buf);
        return S.buffers.length - 1;
      };
      await window.JBH.clear();
      await window.JBH.key('C', 'major');
      await window.JBH.chords(0, ['C', 'Am', 'F', 'G']);
      await window.JBH.set({ bpm: 150 });

      const fastId = mk(0.002);          /* a pluck */
      const slowId = mk(0.260);          /* a bowed swell */
      /* one pad each, tagged, with a root note so instPads() sees them */
      S.pads[0].bufId = fastId; S.pads[0].inst = 'pluck'; S.pads[0].srcNote = 60;
      S.pads[1].bufId = slowId; S.pads[1].inst = 'swell'; S.pads[1].srcNote = 60;

      const fast = await window.JBH.infill('pluck', { from: 0, bars: 1, role: 'arp', n: 3 });
      const slow = await window.JBH.infill('swell', { from: 0, bars: 1, role: 'arp', n: 3 });
      return { fast, slow };
    });

    t.ok('it measured both sounds rather than only reading their pitch',
      r.fast.timbre && r.slow.timbre && r.slow.timbre.attackMs > 150
      && r.fast.timbre.attackMs < 30,
      'pluck ' + (r.fast.timbre || {}).attackMs + 'ms vs swell '
      + (r.slow.timbre || {}).attackMs + 'ms');
    t.ok('the pluck needs no gap and the swell needs several',
      r.fast.timbre.minGap === 1 && r.slow.timbre.minGap > 1,
      'minGap pluck ' + r.fast.timbre.minGap + ' vs swell ' + r.slow.timbre.minGap);
    t.ok('AND THAT CHANGES WHICH FIGURES ARE OFFERED',
      r.fast.timbre.figures !== r.slow.timbre.figures,
      'pluck: ' + r.fast.timbre.figures + '  ·  swell: ' + r.slow.timbre.figures);
    t.ok('the swell is told why, in milliseconds, with a way out',
      /takes \d+ms to speak/.test(r.slow.says)
      && /tempo down|slower|trim/.test(r.slow.says),
      r.slow.says.slice(-190));
    t.ok('and the pluck is not nagged about a problem it does not have',
      !/takes \d+ms to speak/.test(r.fast.says), r.fast.says.slice(-90));

    t.head('IT STILL WRITES SOMETHING, BECAUSE THE SOUND IS THEIR CHOICE');
    const wrote = await page.evaluate(async () => {
      const off = await window.JBH.infill('swell', { from: 0, bars: 1, role: 'arp', n: 3 });
      const seed = off.candidates[0].seed;
      const ap = await window.JBH.infill('swell', { from: 0, bars: 1, apply: seed, role: 'arp' });
      const pat = S.patterns[S.pattern];
      let notes = 0;
      for (const k in pat.locks) {
        const lk = pat.locks[k];
        if (lk && (lk.pitch != null || (lk.pitches && lk.pitches.length))) notes++;
      }
      return { ap, notes };
    });
    t.ok('a marginal sound is still written, not refused',
      wrote.ap.applied === true && wrote.ap.wrote > 0 && wrote.notes > 0,
      'wrote ' + wrote.ap.wrote + ' notes, ' + wrote.notes + ' steps carry pitches');
    t.ok('and the applied result carries what it heard too',
      wrote.ap.timbre && wrote.ap.timbre.attackMs > 150,
      JSON.stringify(wrote.ap.timbre));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
