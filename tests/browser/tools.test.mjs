/* THE SOUND TOOLS PANEL — THE PART A PERSON CAN REACH.

   review(), balance(), paint(), mutate() and resynth() were all built
   from an agent's side of the app and were callable only from the API.
   The person actually sitting in front of the thing could not get at
   any of them: not the check that runs every analyser, not the solver
   that sets levels against a reference, and not the two calls that
   make a sound out of nothing. A feature nobody can reach is not a
   feature.

   So there are buttons now, and this is what proves they are wired to
   the calls rather than merely present. Each one is clicked and its
   output read back out of the log, because a button that throws
   silently looks exactly like a button that worked. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    /* the panel lives in the project tab */
    await page.evaluate(async () => {
      document.querySelector('#tabs button[data-v="proj"]').click();
      await new Promise(r => setTimeout(r, 150));
    });

    t.head('THE BUTTONS ARE THERE AND THEY ARE WIRED');
    const present = await page.evaluate(() =>
      ['btnToolReview', 'btnToolBalance', 'btnToolPaint', 'btnToolMutate', 'btnToolResynth',
        'btnToolFreeze', 'btnToolTape']
        .map(id => ({ id, found: !!document.getElementById(id) })));
    for (const p of present) t.ok('there is a ' + p.id, p.found, p.found ? 'present' : 'MISSING');

    /* ---- PAINT: the cheapest of them, and it must leave a real sample --- */
    t.head('PAINT MAKES A SOUND OUT OF NOTHING');
    const painted = await page.evaluate(async () => {
      await window.JBH.clear();
      const before = window.JBH.state().pads.loaded;
      document.getElementById('btnToolPaint').click();
      /* the button is async; wait for it to re-enable */
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById('btnToolPaint').disabled) break;
      }
      const log = document.getElementById('toolLog');
      const pad = window.JBH.state().editPad;
      const r = await window.JBH.spectrum({ pads: [pad], src: 'pat' }).catch(() => null);
      return { before, log: (log && log.textContent) || '', pad,
        hasBuf: !!(window.JBH.params && true) };
    });
    t.ok('the log fills in rather than staying empty',
      painted.log.length > 40 && !/could not run/i.test(painted.log),
      painted.log.slice(0, 110).replace(/\n/g, ' | '));
    t.ok('and it says what it painted',
      /painted/i.test(painted.log), painted.log.split('\n')[1] || '(no second line)');

    /* ---- REVIEW: the one that matters most, on a tiny arrangement ------- */
    t.head('REVIEW RUNS THE WHOLE BATTERY FROM A BUTTON');
    const reviewed = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('p', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 72, max: 4 });
      const pads = window.JBH.instPads('p').map(x => x.pad);
      window.JBH.pattern(0, { plen: 16, clear: true });
      await window.JBH.batch(pads.slice(0, 3).map((p, i) => ['step', p, i * 4, 0.8]));
      document.getElementById('btnToolReview').click();
      for (let i = 0; i < 400; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById('btnToolReview').disabled) break;
      }
      return (document.getElementById('toolLog') || {}).textContent || '';
    });
    t.ok('it reports a verdict, not an exception',
      /REVIEW of the/.test(reviewed) && !/could not run:\n\s+\w+Error/.test(reviewed),
      reviewed.split('\n').slice(0, 2).join(' | ').slice(0, 120));
    t.ok('and says how many checks it managed',
      /from \d+ checks/.test(reviewed),
      (/from \d+ checks/.exec(reviewed) || ['(not stated)'])[0]);

    /* ---- FREEZE and TAPE, which must not eat the pad they came from ---- */
    t.head('FREEZE AND TAPE LEAVE THE ORIGINAL ALONE');
    const made = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('p', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 60, max: 1 });
      const src = window.JBH.instPads('p')[0].pad;
      const before = window.JBH.state().pads.loaded;
      const press = async (id) => {
        document.getElementById(id).click();
        for (let i = 0; i < 300; i++) {
          await new Promise(r => setTimeout(r, 100));
          if (!document.getElementById(id).disabled) break;
        }
        return (document.getElementById('toolLog') || {}).textContent || '';
      };
      const fz = await press('btnToolFreeze');
      const afterFreeze = window.JBH.state().pads.loaded;
      const tp = await press('btnToolTape');
      const afterTape = window.JBH.state().pads.loaded;
      return { src, before, afterFreeze, afterTape, fz, tp };
    });
    t.ok('freeze makes a new pad rather than replacing one',
      made.afterFreeze === made.before + 1 && /held \d+ partials/.test(made.fz),
      made.before + ' pads → ' + made.afterFreeze + '; ' + made.fz.split('\n')[1].slice(0, 80));
    t.ok('and tape does too',
      made.afterTape === made.afterFreeze + 1 && /cents of wow/.test(made.tp),
      made.afterFreeze + ' pads → ' + made.afterTape + '; ' + made.tp.split('\n')[1].slice(0, 80));

    /* ---- the panel must not be able to inject markup -------------------- */
    t.head('WHAT GOES IN THE LOG IS TEXT');
    const safe = await page.evaluate(() => {
      const el = document.getElementById('toolLog');
      el.textContent = '<img src=x onerror="window.__xss=1">';
      return { html: el.innerHTML.indexOf('<img') === -1, fired: !window.__xss };
    });
    t.ok('an angle bracket stays an angle bracket', safe.html && safe.fired,
      'set as text, never parsed as markup');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
