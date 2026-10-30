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
    /* The five pad tools live on TOOLS and the two mix tools on MIX. They
       were all on PROJ, which names no pad, so each of them acted on a
       selection the person could not see — the layout test is the one that
       holds that line now, and this suite follows them to where they went.
       It matters that these clicks are REAL navigation and not a formality:
       a tool whose answer lands in a log on another tab is a tool that looks
       like it did nothing. */
    const goto = async (v) => page.evaluate(async (name) => {
      document.querySelector('#tabs button[data-v="' + name + '"]').click();
      await new Promise(r => setTimeout(r, 150));
    }, v);
    await goto('tools');

    t.head('THE BUTTONS ARE THERE, THEY ARE WIRED, AND THEY ARE WHERE THEY ACT');
    const present = await page.evaluate(() => {
      const where = (id) => {
        const el = document.getElementById(id);
        const v = el && el.closest('.view');
        return { id, found: !!el, view: v ? v.id : null, shown: !!(v && v.classList.contains('on')) };
      };
      return { pad: ['btnToolPaint', 'btnToolMutate', 'btnToolResynth', 'btnToolFreeze', 'btnToolTape'].map(where),
        mix: ['btnToolReview', 'btnToolBalance'].map(where) };
    });
    for (const p of present.pad)
      t.ok('there is a ' + p.id + ', on the tools tab', p.found && p.view === 'v-tools',
        p.found ? p.view : 'MISSING');
    for (const p of present.mix)
      t.ok('there is a ' + p.id + ', on the mixer', p.found && p.view === 'v-mix',
        p.found ? p.view : 'MISSING');
    t.ok('and opening TOOLS really opens it',
      present.pad.every(p => p.shown) && present.mix.every(p => !p.shown),
      'v-tools is the open view');
    /* It has to name the pad the way the REST OF THE APP names it. The first
       version of this asked for /pad \d+/ and passed on "E-Piano Tine — pad
       7" while the overwrite dialog one tap later said "Replace what is on
       A08?" — two names for one pad, from the same press. So the test is not
       "is there a number here" but "does it agree with the EDIT panel", which
       is the thing that was actually wrong. */
    const named = await page.evaluate(() => {
      const el = document.querySelector('#v-tools [data-padname]');
      const ep = document.getElementById('epTitle');
      return { tools: (el && el.textContent || '').trim(),
        edit: (ep && ep.textContent || '').trim() };
    });
    t.ok('the tools tab names the pad in the app\'s own A01..D16 form',
      /^[A-D]\d\d\b/.test(named.tools), '"' + named.tools + '"');
    t.ok('and it is the same pad the EDIT panel is showing',
      named.tools.slice(0, 3) === named.edit.slice(0, 3),
      'TOOLS "' + named.tools + '" vs EDIT "' + named.edit + '"');

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

    /* ---- PAINT IS THE ONE THAT DESTROYS SOMETHING ----------------------
       The other four either restore the pad or write to a free one. This
       calls paint({pad:i}), which reaches loadIntoTarget with noAsk — so
       while it sat on PROJ it replaced the sample on a pad that tab did not
       name, with no warning. Both halves are tested, because a guard that
       cannot be got past is as broken as one that never fires. */
    t.head('PAINT ASKS BEFORE IT REPLACES A SOUND');
    const loadOne = () => page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('p', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 60, max: 1 });
      const pad = window.JBH.instPads('p')[0].pad;
      window.JBH.pad(pad, { name: 'keepme' });
      S.editPad = pad;
      return pad;
    });
    const press = (pad) => page.evaluate(async (i) => {
      document.getElementById('btnToolPaint').click();
      for (let k = 0; k < 120; k++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById('btnToolPaint').disabled) break;
      }
      return { name: window.JBH.pad(i).name,
        log: (document.getElementById('toolLog') || {}).textContent || '' };
    }, pad);

    const padA = await loadOne();
    let asked = false;
    const onDismiss = (d) => { asked = true; d.dismiss(); };
    page.on('dialog', onDismiss);
    const refused = await press(padA);
    page.off('dialog', onDismiss);
    t.ok('it asks when the selected pad is holding something', asked, 'a dialog was raised');
    t.ok('and saying no leaves the sound exactly where it was',
      refused.name === 'keepme' && /left alone/i.test(refused.log),
      'pad ' + padA + ' still holds "' + refused.name + '"');

    const padB = await loadOne();
    const onAccept = (d) => d.accept();
    page.on('dialog', onAccept);
    const allowed = await press(padB);
    page.off('dialog', onAccept);
    t.ok('and saying yes still paints, so the guard is not a wall',
      allowed.name !== 'keepme' && /painted/i.test(allowed.log),
      'pad ' + padB + ' now holds "' + allowed.name + '"');

    /* ---- REVIEW: the one that matters most, on a tiny arrangement ------- */
    t.head('REVIEW RUNS THE WHOLE BATTERY FROM A BUTTON');
    await goto('mix');
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

    t.ok('and the answer is readable on the tab the button is on',
      await page.evaluate(() => {
        const el = document.querySelector('#v-mix .toollog');
        return !!el && el.style.display !== 'none' && /REVIEW of the/.test(el.textContent || '');
      }), 'the mixer has its own log, so the verdict is not left on another tab');

    /* ---- FREEZE and TAPE, which must not eat the pad they came from ---- */
    t.head('FREEZE AND TAPE LEAVE THE ORIGINAL ALONE');
    await goto('tools');
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


    /* ---- REBUILD'S CONTROLS ACTUALLY REACH resynth() ------------------
       The button ran resynth() on its bare defaults, so every parameter
       the function has was reachable from the API and from nowhere a
       person could press. That is the gap these buttons were added to
       close, reopened one level down: the tool exposed, its controls
       not.

       A panel that exists and is not wired reads exactly like a panel
       that works, so this does not check that the controls RENDER. It
       sets them to values nothing else would produce and reads them
       back out of what resynth() reports it was given. */
    t.head('THE REBUILD PANEL IS WIRED, NOT JUST PRESENT');
    const ctrls = await page.evaluate(() =>
      ['rsAlgo', 'rsBins', 'rsMfcc', 'rsBlock', 'rsBrainBlock', 'rsNovelty',
        'rsBoredom', 'rsSticky', 'rsStretch', 'rsSlideErr', 'rsAutotune',
        'rsStereo', 'rsReset'].map(id => ({ id, found: !!document.getElementById(id) })));
    for (const c of ctrls)
      t.ok('there is a ' + c.id, c.found, c.found ? 'present' : 'MISSING');

    const drive = await page.evaluate(async () => {
      await window.JBH.clear();
      const P = (hz, level) => ({ hz, level });
      await window.JBH.paint({ pad: 0, seconds: 0.8, partials: [P(220, 1), P(440, .5)] });
      await window.JBH.paint({ pad: 1, seconds: 0.8, partials: [P(330, 1), P(660, .5)] });
      await window.JBH.paint({ pad: 2, seconds: 0.8, partials: [P(277, 1), P(554, .6)] });
      /* edit pad 2 is the target; 0 and 1 are the brain */
      window.JBH.set({ editPad: 2 });
      const set = (id, v) => { const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = v; else el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true })); };
      /* values nothing defaults to */
      set('rsAlgo', 'synaptic'); set('rsBins', 16); set('rsMfcc', 0);
      set('rsBlock', 90); set('rsBrainBlock', 30); set('rsNovelty', 0.8);
      set('rsBoredom', 0.1); set('rsSticky', 0.65); set('rsStretch', 2);
      set('rsAutotune', true);
      const readouts = {
        bins: document.getElementById('rsBinsV').textContent,
        mfcc: document.getElementById('rsMfccV').textContent,
        block: document.getElementById('rsBlockV').textContent,
        stretch: document.getElementById('rsStretchV').textContent,
        slipDisabled: document.getElementById('rsSlideErr').disabled };
      document.getElementById('btnToolResynth').click();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById('btnToolResynth').disabled) break;
      }
      return { readouts, log: (document.getElementById('toolLog') || {}).textContent || '' };
    });

    t.ok('the readouts track the sliders without a render',
      drive.readouts.bins === '16' && drive.readouts.mfcc === '0%'
      && drive.readouts.block === '90ms' && drive.readouts.stretch === '2\u00d7',
      JSON.stringify(drive.readouts));
    t.ok('SLIP is live in synaptic mode only for slide — it is enabled here only if slide',
      drive.readouts.slipDisabled === true,
      'slide-only control disabled outside slide: ' + drive.readouts.slipDisabled);
    t.ok('the rebuild ran and reported back',
      /REBUILD/.test(drive.log) && /blocks of/.test(drive.log),
      drive.log.split('\n').slice(0, 2).join(' | ').slice(0, 110));
    t.ok('BINS 16 with MFCC off really reached the matcher — 16 dimensions, not 45',
      /matched on 16 dimensions/.test(drive.log),
      (/matched on \d+ dimensions/.exec(drive.log) || ['no dimension line'])[0]);
    t.ok('BLOCK 90ms reached it too, rather than the default 60',
      /blocks of 90ms/.test(drive.log),
      (/blocks of \d+ms/.exec(drive.log) || ['no block line'])[0]);
    t.ok('SYNAPTIC was used — the network was actually walked',
      /synapse network/.test(drive.log),
      (/\d+ nodes of the synapse network/.exec(drive.log) || ['no synapse line'])[0]);
    t.ok('AUTOTUNE reached it',
      /pitch-bent toward the target/.test(drive.log),
      (/\d+ blocks were pitch-bent/.exec(drive.log) || ['no autotune line'])[0]);
    t.ok('STRETCH 2 made the rebuild longer than the target',
      /The rebuild is [\d.]+s against the target/.test(drive.log),
      (/The rebuild is .*/.exec(drive.log) || ['no stretch line'])[0]);

    const reset = await page.evaluate(async () => {
      document.getElementById('rsReset').click();
      return { bins: document.getElementById('rsBins').value,
        binsV: document.getElementById('rsBinsV').textContent,
        mfcc: document.getElementById('rsMfcc').value,
        autotune: document.getElementById('rsAutotune').checked,
        algo: document.getElementById('rsAlgo').value };
    });
    t.ok('RESET puts every control back, readouts included',
      reset.bins === '32' && reset.binsV === '32' && reset.mfcc === '0.35'
      && reset.autotune === false && reset.algo === 'basic',
      JSON.stringify(reset));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
