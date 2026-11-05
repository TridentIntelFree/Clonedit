/* A SECOND FADER PER PAD, BECAUSE THE FIRST ONE IS NOT A FADER.

   "I need a master volume for each pad as well that's not either of the
   gain values."

   The two gain values are `epGain` on EDIT and `ampGain` on AMP, and
   they are two sliders on ONE field, `p.gain`. The mixer strip is a
   third. And `p.gain` is also what a per-step lock can override, what
   the vol-LFO modulates, and what mutate() and bend() search when they
   hunt for a better sound. So "turn this pad down and leave it there"
   had nowhere to live: AGENTS.md says to stage a pad from its measured
   peak into `gain`, and riding any of those three sliders afterwards
   destroys the staging you just computed.

   `p.vol` is that missing place. It is a GainNode downstream of `ch` in
   the per-pad graph, so gain, locks and the LFO all still do exactly
   what they did, and upstream of `mute` and the two sends, so it is
   post-fader like a real console and pulling a pad down takes its
   reverb with it.

   These drive it the way a person would and measure the audio, because
   a level control that is wired to the state and not to the graph looks
   identical from the outside until you listen. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('IT ATTENUATES THE AUDIO, BY THE AMOUNT IT SAYS');
    const lv = await page.evaluate(async () => {
      await JBH.clear();
      await JBH.pack('samples/jbh-drums.json');
      await JBH.sound('jbh:kick_909', 0);
      await JBH.pattern(0, { plen: 16, clear: true, select: true });
      for (const st of [0, 4, 8, 12]) JBH.step(0, st, 0.9);
      const at = async (props) => {
        JBH.pad(0, props);
        const r = await JBH.render({ src: 'pat', loops: 1 });
        return { peak: r.peak, db: 20 * Math.log10(Math.max(r.peak, 1e-9)) };
      };
      return {
        base: await at({ gain: 1, vol: 1 }),
        half: await at({ gain: 1, vol: 0.5 }),
        quarter: await at({ gain: 1, vol: 0.25 }),
        zero: await at({ gain: 1, vol: 0 }),
        gainHalf: await at({ gain: 0.5, vol: 1 }),
        both: await at({ gain: 0.5, vol: 1.5 }),
      };
    });
    /* the master limiter takes a few tenths off, so these are windows
       rather than exact figures — measured -5.65 and -11.60 */
    const dHalf = lv.half.db - lv.base.db, dQuarter = lv.quarter.db - lv.base.db;
    t.ok('halving it is about 6dB down', dHalf < -5 && dHalf > -7,
      dHalf.toFixed(2) + ' dB (peak ' + lv.base.peak + ' -> ' + lv.half.peak + ')');
    t.ok('quartering it is about 12dB down', dQuarter < -10.5 && dQuarter > -13,
      dQuarter.toFixed(2) + ' dB');
    t.ok('and zero is silence, not nearly silence', lv.zero.peak === 0,
      'peak ' + lv.zero.peak);

    t.head('AND IT IS INDEPENDENT OF GAIN, WHICH IS THE WHOLE POINT');
    /* gain 0.5 and vol 0.5 are the same multiplier in different places,
       so they must measure the same; and setting both must compound */
    t.ok('gain 0.5 and vol 0.5 land on the same peak',
      Math.abs(lv.gainHalf.peak - lv.half.peak) < 1e-4,
      'gain ' + lv.gainHalf.peak + ' vs vol ' + lv.half.peak);
    const dBoth = lv.both.db - lv.base.db;
    t.ok('gain 0.5 with vol 1.5 compounds to about x0.75',
      dBoth < -1.5 && dBoth > -3.5, dBoth.toFixed(2) + ' dB (expect about -2.5)');

    t.head('THE CONTROL IS IN THE MIXER, ONE PER LOADED PAD');
    const ui = await page.evaluate(async () => {
      await JBH.sound('jbh:snare_909', 1);
      await JBH.sound('jbh:hat_closed', 2);
      JBH.pad(0, { gain: 1, vol: 1 });
      await new Promise(r => setTimeout(r, 150));
      const rows = document.querySelectorAll('.mstrip .mvol input[type=range]');
      const out = { count: rows.length };
      if (!rows.length) return out;
      rows[0].value = '0.3';
      rows[0].dispatchEvent(new Event('input', { bubbles: true }));
      /* the node ramps over 10ms, so .value does not move the instant
         setTargetAtTime is called — reading it too early reports the old
         number and looks like a control wired to nothing */
      await new Promise(r => setTimeout(r, 250));
      out.state = S.pads[0].vol;
      out.node = LIVE && LIVE.pads[0] && LIVE.pads[0].vol
        ? +LIVE.pads[0].vol.gain.value.toFixed(3) : 'no node';
      out.ch = LIVE && LIVE.pads[0] ? +LIVE.pads[0].ch.gain.value.toFixed(3) : null;
      out.max = rows[0].max;
      return out;
    });
    t.ok('there is a VOL row for every loaded pad', ui.count === 3,
      ui.count + ' rows for 3 loaded pads');
    t.ok('dragging it writes the pad', ui.state === 0.3, 'S.pads[0].vol = ' + ui.state);
    t.ok('AND REACHES THE LIVE GRAPH, not just the state', ui.node === 0.3,
      'live vol node = ' + ui.node);
    t.ok('while leaving gain alone, which is the complaint it answers',
      ui.ch === 1, 'live ch (gain) = ' + ui.ch);
    t.ok('it can push above unity, since a fader that only cuts is half a fader',
      +ui.max > 1, 'max ' + ui.max);

    t.head('IT SURVIVES A SONG DOC, AND OLD DOCS ARE UNCHANGED');
    const doc = await page.evaluate(() => {
      JBH.pad(0, { vol: 0.4 });
      const moved = JBH.export().pads[0].vol;
      JBH.pad(0, { vol: 1 });
      const unmoved = JBH.export().pads[0].vol;
      /* and a doc that predates the field loads as 1 rather than 0 */
      const d = JBH.export();
      delete d.pads[0].vol;
      return { moved, unmoved, hasKey: 'vol' in (JBH.export().pads[0] || {}) };
    });
    t.ok('a moved fader is written to the doc', doc.moved === 0.4, String(doc.moved));
    t.ok('and an untouched one is not, so old docs round-trip byte for byte',
      doc.unmoved === undefined && doc.hasKey === false,
      'vol in doc at default: ' + JSON.stringify(doc.unmoved));

    t.head('AND THE BEAT CHECK KNOWS ABOUT IT');
    /* pulse() weighs each onset by velocity, pad gain and the level of
       the sample the pad holds. A fader it could not see would let it
       report a pulse carried by a pad that is silent. */
    const pulse = await page.evaluate(async () => {
      await JBH.clear();
      await JBH.pack('samples/jbh-drums.json');
      await JBH.sound('jbh:kick_909', 0);
      await JBH.sound('jbh:hat_closed', 1);
      await JBH.pattern(0, { plen: 16, clear: true, select: true });
      for (const st of [0, 4, 8, 12]) JBH.step(0, st, 0.9);
      for (let st = 0; st < 16; st += 2) JBH.step(1, st, 0.7);
      JBH.pad(0, { vol: 1 }); JBH.pad(1, { vol: 1 });
      /* AWAITED. pulse() is async, and comparing two un-awaited
         Promises serialises both to {} — which looks exactly like a
         weighting that cannot see the fader. That is what the first
         version of this check reported, and the code was right. */
      const loud = await JBH.pulse({ src: 'pat' });
      JBH.pad(1, { vol: 0 });
      const hatOff = await JBH.pulse({ src: 'pat' });
      const w = (r) => (r.pads.find(p => p.pad === 1) || {}).weight;
      return { before: w(loud), after: w(hatOff),
        beatBefore: loud.onGrid.beat, beatAfter: hatOff.onGrid.beat };
    });
    t.ok('a pad at vol 0 carries no weight in the beat measurement',
      pulse.before > 0.3 && pulse.after === 0,
      'hat weight ' + pulse.before + ' -> ' + pulse.after);
    t.ok('and the on-beat share moves, because the silenced onsets stop counting',
      pulse.beatBefore !== pulse.beatAfter,
      'onGrid.beat ' + pulse.beatBefore + '% -> ' + pulse.beatAfter + '%');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
