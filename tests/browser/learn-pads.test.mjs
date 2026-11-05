/* LEARN MY PADS, AND A BUILD THAT USES WHAT IT LEARNED.

   The ask: "a button that learns pads, then click write song and it
   utilises what it learned about the pads available to increase
   musicality."

   The fault underneath it was real and had been costing every build. The
   kit was assigned BY PAD INDEX:

     const drums = loose.slice(0, 3);
     //   drums[0] -> kick figure, [1] -> snare, [2] -> hat

   So the three voices went to whichever pads were free in pad order.
   Load a hat on A01 and a kick on A03 and the measured hiphop kick bar
   plays on the hat while the hat pattern fires the kick, and every check
   in this repo passes: the steps are on the grid, the harmony is
   untouched, pulse() finds a beat. It is simply not the kit anybody
   loaded, and nothing here looks at whether a figure landed on the right
   sound.

   The unit tests in tests/padprofile.test.mjs measure synthesised
   signals, which this repo has been burnt by before — "Fifteen green
   tests on synthesised audio, and wrong anyway". These drive the real
   app with a REAL pack, through the CONTROLS, which is the only place
   the answer is true or false. Measured against jbh-drums the detector
   gets 20 of 22 unambiguously-named samples right; the two it disagrees
   with are a cowbell and a rimshot, where the label is a judgement call
   and it flags the rimshot as unsure.

   AND IT CAUGHT A BUG OLDER THAN THE FEATURE. `if (drums[0])` is false
   when the kick is on pad 0, because a pad index is a number and A01 is
   zero. The old code took `loose.slice(0, 3)`, so the kick was usually
   pad 0 and the commonest board silently had NO KICK. The output named
   every voice correctly while writing two of them, which is why this
   counts hits per pad rather than reading the sentence. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('IT TELLS A KICK FROM A SNARE FROM A HAT, ON A REAL PACK');
    const read = await page.evaluate(async () => {
      await window.JBH.pack('samples/jbh-drums.json');
      const want = ['jbh:kick_909', 'jbh:snare_909', 'jbh:hat_closed',
        'jbh:kick_acoustic', 'jbh:snare_acoustic', 'jbh:hat_open',
        'jbh:ride', 'jbh:clap'];
      for (let i = 0; i < want.length; i++) await window.JBH.sound(want[i], i);
      const L = window.JBH.learn({ force: true });
      const by = {};
      for (const r of L.pads) by[want[r.pad]] = r;
      return { by, says: L.says, kit: L.kit };
    });
    const truth = {
      'jbh:kick_909': 'kick', 'jbh:kick_acoustic': 'kick',
      'jbh:snare_909': 'snare', 'jbh:snare_acoustic': 'snare', 'jbh:clap': 'snare',
      'jbh:hat_closed': 'hat', 'jbh:hat_open': 'hat', 'jbh:ride': 'hat',
    };
    let right = 0;
    for (const id of Object.keys(truth)) {
      const r = read.by[id];
      if (r && r.kit === truth[id]) right++;
    }
    t.ok('all eight read as what they are', right === 8,
      right + '/8 — ' + Object.keys(truth).map(id =>
        id.replace('jbh:', '') + '=' + (read.by[id] ? read.by[id].kit : '?')).join(' '));
    t.ok('and each carries the numbers it decided on, so it can be argued with',
      /air-vs-body/.test((read.by['jbh:kick_909'] || {}).says || ''),
      (read.by['jbh:kick_909'] || {}).says);

    t.head('THE BUTTON SAYS WHAT IT HEARD');
    const btn = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.pack('samples/jbh-drums.json');
      /* DELIBERATELY REVERSED: hat first, kick last — the order that was
         silently wrong, and the order pad-index assignment gets wrong */
      await window.JBH.sound('jbh:hat_closed', 0);
      await window.JBH.sound('jbh:snare_909', 1);
      await window.JBH.sound('jbh:kick_909', 2);
      await window.JBH.sound('jbh:bass808_C1', 3);
      window.JBH.pad(3, { inst: 'bass', srcNote: 36 });
      document.getElementById('mlLearn').click();
      await new Promise(r => setTimeout(r, 400));
      return document.getElementById('mlLearnInfo').textContent;
    });
    t.ok('it names the pad it hears as each voice, not the pad order',
      /kick=A03/.test(btn) && /snare=A02/.test(btn) && /hat=A01/.test(btn),
      btn.slice(0, 120));
    t.ok('and reports how many readings were clear-cut',
      /clear-cut/.test(btn), btn.slice(0, 160));

    t.head('AND THE BUILD PUTS THE FIGURES ON THOSE PADS');
    const built = await page.evaluate(async () => {
      document.getElementById('mlGenre').value = 'boombap';
      document.getElementById('mlDemo').click();
      for (let i = 0; i < 160; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (!document.getElementById('mlDemo').disabled) break;
      }
      const hits = {};
      for (let pn = 0; pn < 3; pn++) {
        const pat = S.patterns[pn];
        for (let p = 0; p < 4; p++)
          hits['p' + pn + 'pad' + p] = (pat.steps[p] || []).filter(v => v > 0).length;
      }
      return { said: document.getElementById('mlInfo').textContent, hits,
        tags: [0, 1, 2, 3].map(i => S.pads[i].inst || '-') };
    });
    t.ok('the build reports the measured kit, by pad name',
      /kick=A03/.test(built.said) && /snare=A02/.test(built.said)
      && /hat=A01/.test(built.said), built.said.slice(0, 200));
    t.ok('the kick pad is left out of the melodic voices',
      built.tags[2] === '-', 'pad tags: ' + built.tags.join(' '));

    /* THE PAD-ZERO REGRESSION. A01 is pad index 0, and `if (drums[0])`
       is false for it — so the voice assigned to A01 had its figure
       computed, its break and fill worked out, and nothing written. */
    const padZero = [built.hits.p0pad0, built.hits.p1pad0, built.hits.p2pad0];
    t.ok('A01 IS PAD 0 AND STILL GETS ITS PART — truthiness on a pad index',
      padZero.every(n => n > 0), 'hits on A01 per pattern: ' + padZero.join(', '));
    t.ok('every pad on the board plays something',
      [0, 1, 2, 3].every(p => built.hits['p1pad' + p] > 0),
      JSON.stringify(built.hits));

    /* ---- BEND TO MY WILL -------------------------------------------
       "A bend-to-my-will button that forces pads into parameters as
       best I can, as opposed to selecting the best available."

       The first mechanism was mutate() with a role as its objective,
       and the measurement killed it: a ride aimed at a kick went 0% ->
       0% with 0dB of spectral change over 15 candidates and 32 seconds,
       because mutate turns the pad's knobs and never touches the audio.
       This is the EQ match that does change the audio. */
    t.head('BEND FORCES A SOUND INTO A JOB');
    const bend = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.pack('samples/jbh-drums.json');
      await window.JBH.sound('jbh:ride', 0);
      /* two more pads, so S.editPad has moved on — loadIntoTarget writes
         to the SELECTED pad and bend has to pin it, or the bent audio
         lands on the last pad touched while the report describes the
         untouched one */
      await window.JBH.sound('jbh:snare_909', 1);
      await window.JBH.sound('jbh:hat_closed', 2);
      const t0 = Date.now();
      const r = await window.JBH.bend(0, 'kick');
      return { r, secs: (Date.now() - t0) / 1000,
        otherPadsUntouched: [1, 2].every(p => !/kick/.test(S.pads[p].name || '')) };
    });
    t.ok('a ride aimed at a kick genuinely goes dark',
      bend.r.measured.before.air - bend.r.measured.after.air > 40,
      'air-vs-body ' + bend.r.measured.before.air + ' -> '
      + bend.r.measured.after.air + 'dB; the knob search managed 0dB here');
    t.ok('and its centroid comes down into kick territory',
      bend.r.measured.after.centroid < 400,
      'centroid ' + bend.r.measured.before.centroid + ' -> '
      + bend.r.measured.after.centroid + 'Hz');
    t.ok('THE MEASUREMENT MOVES, which is the whole point',
      bend.r.measured.before.air !== bend.r.measured.after.air,
      'two identical measurements are not a weak effect, they are no effect');
    t.ok('it bends the pad it was given, not whichever pad is selected',
      bend.otherPadsUntouched === true,
      'pads 1 and 2 untouched: ' + bend.otherPadsUntouched);
    t.ok('and it is fast enough to be a button',
      bend.secs < 5, bend.secs.toFixed(1) + 's');
    t.ok('it reports the curve it applied, band by band',
      Array.isArray(bend.r.curve) && bend.r.curve.some(c => Math.abs(c.db) >= 1),
      JSON.stringify((bend.r.curve || []).map(c => c.db)));

    /* THE HONEST FAILURE. A kick has nothing above 500Hz, and a boost is
       capped because lifting an empty band amplifies noise instead of
       adding a sound. It must say so rather than claim a win. */
    const hopeless = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.pack('samples/jbh-drums.json');
      await window.JBH.sound('jbh:kick_909', 0);
      return await window.JBH.bend(0, 'hat');
    });
    t.ok('a kick bent toward a hat admits it got nowhere',
      hopeless.after < 0.3, 'fit ' + hopeless.before + ' -> ' + hopeless.after);
    t.ok('and names the tools that DO make substance that is not there',
      /resynth|REBUILD PAD/.test(hopeless.says) && /paint/.test(hopeless.says),
      hopeless.says.slice(-180));
    t.ok('it says the file on disk is untouched, so the person knows how to undo',
      /untouched/.test(hopeless.says), hopeless.says.slice(-90));

    t.head('A BOARD WITH NOTHING ON IT');
    const empty = await page.evaluate(async () => {
      await window.JBH.clear();
      try { window.JBH.learn(); return 'did not refuse'; }
      catch (e) { return e.message; }
    });
    t.ok('refuses with the thing to do about it, rather than throwing on undefined',
      /nothing is loaded/.test(empty) && /put a sound on a pad/.test(empty), empty);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
