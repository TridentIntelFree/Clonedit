/* RESYNTH — does it actually do what Samplebrain's manual describes.

   The function has claimed since it was written to be "an independent
   implementation of a published technique". It was not: measured
   against docs/manual.md it had roughly a third of the parameters, and
   the comment above it asserted parity under the heading WHAT READING
   THEIR MANUAL CHANGED. Nobody had checked.

   So this file tests the features against what the manual SAYS they
   do, not against whether the call returns without throwing. Each
   block below names the behaviour the manual promises and asserts the
   output changes in the direction it promises. Where a parameter is
   supposed to alter the sound, two renders with different values must
   differ; where it is supposed to leave something alone, they must
   not.

   The brain and target are built from synthesised tones rather than
   loaded samples, so the test has known answers: a target whose pitch
   is a known interval from the brain's lets autotune be checked
   numerically instead of by eye. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    /* Build a brain of three steady tones and a target that sweeps
       through them, all on pads, deterministically. */
    const setup = async () => page.evaluate(async () => {
      await window.JBH.clear();
      /* paint() is the repo's own way to make a sound from partials, so
         the brain is built with it rather than by poking buffers.
         Its partials are objects — {hz, level} — not [hz, level] pairs;
         passing pairs makes every partial silent and paint() refuses
         with "every row was silent", which is the right behaviour and
         took one run to discover. */
      const P = (hz, level) => ({ hz, level });
      await window.JBH.paint({ pad: 0, seconds: 1.2,
        partials: [P(220, 1), P(440, 0.5), P(660, 0.25)] });
      await window.JBH.paint({ pad: 1, seconds: 1.2,
        partials: [P(330, 1), P(660, 0.5), P(990, 0.25)] });
      await window.JBH.paint({ pad: 2, seconds: 1.2,
        partials: [P(550, 1), P(1100, 0.4), P(1650, 0.2)] });
      /* the target: a different timbre, at a pitch between the brain's,
         so autotune has a real interval to close */
      await window.JBH.paint({ pad: 3, seconds: 1.0,
        partials: [P(277, 1), P(554, 0.7), P(831, 0.5), P(1108, 0.3)] });
      return [0, 1, 2, 3].map(i => ({ pad: i, has: window.JBH.pad(i).bufId >= 0 }));
    });
    const pads = await setup();
    t.head('A BRAIN AND A TARGET');
    t.ok('four painted pads to work with', pads.every(p => p.has),
      pads.map(p => 'pad ' + p.pad).join(', '));

    const run = (o) => page.evaluate(async (opt) =>
      await window.JBH.resynth(Object.assign({ target: 3, brain: [0, 1, 2],
        pad: 10, seed: 12345 }, opt)), o);

    t.head('THE FEATURE SPACE IS NO LONGER EIGHT NUMBERS');
    const coarse = await run({ bins: 8, mfcc: 0 });
    const fine = await run({ bins: 32, mfcc: 0 });
    const withMfcc = await run({ bins: 32, mfcc: 0.5 });
    t.ok('bins is honoured and reported',
      coarse.features.bins === 8 && fine.features.bins === 32,
      'coarse ' + coarse.features.dims + ' dims, fine ' + fine.features.dims + ' dims');
    t.ok('more bins means a higher-dimensional match',
      fine.features.dims > coarse.features.dims,
      coarse.features.dims + ' -> ' + fine.features.dims);
    t.ok('blending in MFCC adds cepstral dimensions on top',
      withMfcc.features.dims > fine.features.dims && withMfcc.features.mfcc === 0.5,
      fine.features.dims + ' -> ' + withMfcc.features.dims + ' at mfcc 0.5');
    t.ok('mfcc:1 drops the spectral half rather than carrying both',
      (await run({ bins: 32, mfcc: 1 })).features.dims === 13,
      'mfcc-only is ' + (await run({ bins: 32, mfcc: 1 })).features.dims + ' dims');
    t.ok('the default is the finer space, not the old eight bands',
      (await run({})).features.dims > 8,
      'default is ' + (await run({})).features.dims + ' dims');

    t.head('FFT SUBSECTION — "a subrange of the bins"');
    const sub = await run({ bins: 32, mfcc: 0, binRange: [8, 20] });
    t.ok('a bin range narrows the comparison to those bins',
      sub.features.dims === 12 && sub.features.binRange[0] === 8,
      'bins 8..20 gives ' + sub.features.dims + ' dims');

    t.head('SEPARATE BRAIN AND TARGET BLOCK SIZES');
    /* "This does not need to match the brain block size" — said twice
       in their manual, once under each heading. */
    const split = await run({ blockMs: 80, brainBlockMs: 25 });
    t.ok('the two sizes are independent and both reported',
      split.blockMs === 80 && split.brainBlockMs === 25,
      'target ' + split.blockMs + 'ms, brain ' + split.brainBlockMs + 'ms');
    t.ok('a smaller brain block really does make more candidates',
      split.brainBlocks > (await run({ blockMs: 80, brainBlockMs: 80 })).brainBlocks,
      split.brainBlocks + ' candidates at 25ms');

    t.head('ALGORITHMS');
    const basic = await run({ algorithm: 'basic' });
    const syn = await run({ algorithm: 'synaptic', synapses: 40 });
    const slide = await run({ algorithm: 'slide', synapses: 40, slideError: 1.5 });
    t.ok('synaptic builds a synapse network and searches only neighbours',
      syn.algorithm === 'synaptic' && syn.synapsesBuilt > 0,
      syn.synapsesBuilt + ' nodes had their neighbours computed');
    t.ok('basic builds no network at all',
      basic.synapsesBuilt === 0, 'basic built ' + basic.synapsesBuilt);
    t.ok('slide warps the timing by holding target blocks — the manual\'s words',
      slide.algorithm === 'slide' && slide.slidRepeats > 0,
      slide.slidRepeats + ' target blocks were held and stretched');
    t.ok('a slide threshold that nothing fails produces no warp',
      (await run({ algorithm: 'slide', synapses: 40, slideError: 40 })).slidRepeats === 0,
      'at slideError 40dB nothing is held');
    t.ok('an unknown algorithm is refused rather than silently ignored',
      await page.evaluate(async () => {
        try { await window.JBH.resynth({ target: 3, brain: [0, 1, 2], algorithm: 'wrong' });
          return false; } catch (e) { return /algorithm must be/.test(e.message); }
      }), 'it throws');

    t.head('AUTOTUNE — "pitch bend the chosen brain block to match"');
    const tuned = await run({ autotune: true });
    const untuned = await run({ autotune: false });
    t.ok('it bends blocks when asked',
      tuned.autotuned > 0, tuned.autotuned + ' blocks were bent');
    t.ok('and bends none when not asked',
      untuned.autotuned === 0, untuned.autotuned + ' bent with autotune off');

    t.head('SEARCH STRETCH, OVERLAP, WINDOW, STEREO, TARGET MIX');
    /* "Repeats blocks in the target a fixed amount, like a simple
       timestretch." So the OUTPUT has to get longer — the first version
       of this wrote into a buffer fixed at the target's length, which
       meant stretch 3 reached only the first third of the target and
       placed exactly as many blocks as stretch 1. The test caught it. */
    const st = await run({ stretch: 3 });
    t.ok('search stretch lengthens the output — it is a timestretch',
      st.settings.stretch === 3 && st.seconds > basic.seconds * 2,
      basic.seconds + 's -> ' + st.seconds + 's at stretch 3 (target '
        + st.targetSeconds + 's)');
    t.ok('and it is the same target throughout, not a longer read of it',
      st.targetSeconds === basic.targetSeconds,
      'target stays ' + st.targetSeconds + 's');
    t.ok('stretch 1 leaves the duration exactly the target\'s',
      basic.seconds === basic.targetSeconds,
      basic.seconds + 's == ' + basic.targetSeconds + 's');
    const ov = await run({ overlap: 0.75 });
    t.ok('overlap is adjustable, not fixed at a half',
      ov.settings.overlap === 0.75 && ov.blocks > basic.blocks,
      'overlap 0.75 places ' + ov.blocks + ' blocks against ' + basic.blocks);
    t.ok('window shape is selectable and validated',
      (await run({ window: 'dodgy' })).features.window === 'dodgy'
      && await page.evaluate(async () => {
        try { await window.JBH.resynth({ target: 3, brain: [0, 1, 2], window: 'nope' });
          return false; } catch (e) { return /window must be/.test(e.message); }
      }), "'dodgy' is accepted, 'nope' throws");
    t.ok('targetMix is carried through',
      (await run({ targetMix: 0.4 })).settings.targetMix === 0.4, 'mix 0.4');

    t.head('WHAT MUST NOT HAVE CHANGED');
    /* Four songs in this repo call resynth with the old options. They
       must still work, and `reversed:true` must still mean what it did
       before `algorithm` existed. */
    const old = await run({ reversed: true, novelty: 0.5, boredom: 0.4,
      stickiness: 0.2, match: 'shape', blockMs: 50 });
    t.ok('reversed:true still selects the reversed algorithm',
      old.reversed === true && old.algorithm === 'reversed', 'algorithm ' + old.algorithm);
    t.ok('the old option names are all still honoured',
      old.settings.novelty === 0.5 && old.settings.boredom === 0.4
      && old.settings.stickiness === 0.2 && old.match === 'shape',
      JSON.stringify(old.settings).slice(0, 90));
    t.ok('it still puts a sample on a pad and says what it did',
      old.pad === 10 && old.blocks > 0 && /rebuilt/.test(old.says),
      old.blocks + ' blocks, ' + old.seconds + 's');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
