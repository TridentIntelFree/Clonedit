/* THE GUIDES, AND THE SIZE OF THE THING THEY ARE GUIDING YOU AROUND.

   Two problems that turn out to be the same problem: a guide is only worth
   anything if what it points at is really there and really on the screen.

   The tour, the six recipes and the suggestion bar all name controls by id and
   spotlight them. Nothing in the build checks that those ids still exist — a
   renamed button leaves a step that highlights nothing and reads as broken, and
   it is exactly the kind of rot that a growing app produces quietly. This walks
   every one of them against a live page.

   It also walks the POLY recipe FOR REAL — pressing its buttons in order and
   checking the next step's target is on screen at the moment that step opens —
   because half of that recipe points inside a panel that only exists once you
   have pressed POLY. Checking those ids against a cold page proves nothing, and
   a check that proves nothing while passing is how the POLY panel shipped
   opening 2000px below the fold with a green test beside it.

   The size checks come from a report off an Android phone: the fixed furniture
   plus each tab's opening paragraph took 255px of a 640px screen, and the pad
   grid ran off the bottom. The measurements here are the ones that made the
   case, so they are also the ones that would notice it coming back. */

import { boot, checker } from './harness.mjs';

/* Everything the guides can point at, read out of the live page's own data
   rather than re-declared here — a copy of the list would rot in step with the
   thing it is meant to be checking. */
const collect = () => ({
  tour: TOUR.map((s, i) => ({ where: 'tour#' + i, tab: s.tab || null,
    el: typeof s.el === 'function' ? s.el() : (s.el || null), tap: s.tap || null })),
  recipes: recipeBook.flatMap(r => r.steps.map((s, i) => ({ where: r.id + '#' + i,
    tab: s.tab || null, el: typeof s.el === 'function' ? s.el() : (s.el || null),
    tap: s.tap || null }))),
  coach: COACH_TIPS.map(c => ({ where: 'coach:' + c.id, tab: c.go && c.go.tab || null,
    el: c.go && c.go.el || null, tap: null, menu: !!(c.go && c.go.menu) })),
  names: { recipes: recipeBook.map(r => r.name), sizes: SIZES.map(s => s.id) },
});

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { audio: false });
  try {
    t.head('EVERY CONTROL THE GUIDES NAME STILL EXISTS');
    const g = await page.evaluate(collect);
    const all = [...g.tour, ...g.recipes, ...g.coach];
    const ids = [...new Set(all.flatMap(s => [s.el, s.tap]).filter(Boolean))];
    t.note('    ' + g.tour.length + ' tour steps · ' + g.recipes.length + ' recipe steps across ' +
      g.names.recipes.length + ' recipes · ' + g.coach.length + ' suggestions');
    t.note('    ' + ids.length + ' distinct controls named');
    const missing = await page.evaluate(list => list.filter(id => !document.getElementById(id)), ids);
    t.ok('all of them resolve to an element', missing.length === 0, missing.join(', ') || 'none missing');

    /* The tab has to exist too — a step that switches to a tab that is gone
       leaves the spotlight measuring whatever tab happened to be open. */
    const tabs = [...new Set(all.map(s => s.tab).filter(Boolean))];
    const noTab = await page.evaluate(list =>
      list.filter(v => !document.querySelector('#tabs button[data-v="' + v + '"]')), tabs);
    t.ok('and every tab they switch to exists', noTab.length === 0, noTab.join(', ') || tabs.length + ' tabs');

    /* Not a proof that a step works offline — only that it does not route you
       through a control the app itself has marked as needing a connection.
       The tour used to open on SAMPLE PACKS, which is a manifest fetched over
       the network with a per-sound download behind it, on an app whose first
       line is "runs with no connection". */
    const netty = await page.evaluate(list => list.filter(id => {
      const e = document.getElementById(id);
      return e && e.classList.contains('needsnet');
    }), ids);
    t.ok('no step sends you to a control that needs a connection', netty.length === 0,
      netty.join(', ') || 'none');

    t.head('EACH STEP IS ON SCREEN WHEN ITS TAB IS OPEN');
    /* Targets inside a panel a previous step opens are excluded here and
       covered properly by the walk below; everything else must be visible the
       moment its tab is selected. */
    const deferred = new Set(['btnPolyOn', 'polyPre34', 'btnPolyLock']);
    const unseen = await page.evaluate(({ list, skip }) => {
      const bad = [];
      for (const s of list) {
        if (!s.el || skip.includes(s.el)) continue;
        if (s.tab) { const b = document.querySelector('#tabs button[data-v="' + s.tab + '"]');
          if (b && !b.classList.contains('on')) b.click(); }
        const e = document.getElementById(s.el);
        const r = e && e.getBoundingClientRect();
        if (!r || r.width < 1 || r.height < 1) bad.push(s.where + ' → #' + s.el);
      }
      return bad;
    }, { list: all, skip: [...deferred] });
    t.ok('every other target has a real box', unseen.length === 0, unseen.join(' · ') || 'all drawn');

    t.head('WALKING THE POLY RECIPE THE WAY A PERSON DOES');
    const walk = await page.evaluate(() => {
      const seen = (id) => { const e = document.getElementById(id);
        if (!e) return { id, ok: false, why: 'missing' };
        const r = e.getBoundingClientRect();
        return { id, ok: r.width > 0 && r.height > 0 && e.checkVisibility(),
          why: Math.round(r.width) + 'x' + Math.round(r.height) }; };
      document.querySelector('#tabs button[data-v="seq"]').click();
      const out = { before: seen('btnPolyOn') };
      document.getElementById('btnPoly').click();          // recipe step 2
      out.afterPoly = seen('btnPolyOn');
      document.getElementById('btnPolyOn').click();        // recipe step 3
      out.afterOwnBpm = { pre34: seen('polyPre34'), lock: seen('btnPolyLock') };
      /* step 4's predicate: pressing 3:4 must change the pad's BPM */
      const bpm0 = polyCfg(curPat(), S.seqPad).bpm;
      document.getElementById('polyPre34').click();
      out.bpm = { before: bpm0, after: polyCfg(curPat(), S.seqPad).bpm };
      const bar = NSTEPS * stepDur();
      out.hitsPerBar = polyLockedHitsPerBar(polyCfg(curPat(), S.seqPad), bar);
      document.getElementById('btnPolyOff').click();       // leave the pad as we found it
      return out;
    });
    t.ok('the OWN BPM button is not on screen before POLY is pressed', !walk.before.ok,
      walk.before.why);
    t.ok('pressing POLY puts it on screen', walk.afterPoly.ok, walk.afterPoly.why);
    t.ok('pressing OWN BPM reveals the 3:4 button the next step points at',
      walk.afterOwnBpm.pre34.ok, walk.afterOwnBpm.pre34.why);
    t.ok('and the LOCK button the last step points at', walk.afterOwnBpm.lock.ok,
      walk.afterOwnBpm.lock.why);
    t.ok("the step's own predicate fires — 3:4 changes the pad's BPM",
      walk.bpm.after !== walk.bpm.before, walk.bpm.before + ' → ' + walk.bpm.after);
    t.ok('and 3:4 really is three hits per bar', Math.abs(walk.hitsPerBar - 3) < 1e-9,
      walk.hitsPerBar + ' hits/bar');

    t.head('SCREEN SIZE — 360x640, THE PHONE THAT REPORTED IT');
    await page.setViewportSize({ width: 360, height: 640 });
    const chrome = () => page.evaluate(() => {
      const v = document.querySelector('.view.on');
      const pg = document.getElementById('padgrid');
      const r = pg.getBoundingClientRect();
      return { top: Math.round(v.getBoundingClientRect().top),
        padBottom: Math.round(r.bottom), vh: window.innerHeight };
    });
    /* Through the announcing path, which is the one a tap takes: it reflows,
       re-measures the canvases and drops the suggestion bar that offered the
       setting. Measuring the silent path would flatter the result by 61px. */
    const pick = async s => { await page.evaluate(v => sizeApply(v, true), s);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      return chrome(); };
    await page.evaluate(() => { document.querySelector('#tabs button[data-v="pads"]').click(); });
    const norm = await pick('norm');
    t.note('    NORMAL: furniture ' + norm.top + 'px, pad grid ends at ' + norm.padBottom +
      ' of ' + norm.vh);
    const sm = await pick('sm');
    const xs = await pick('xs');
    t.note('    COMPACT: ' + sm.top + 'px · TINY: ' + xs.top + 'px');
    t.ok('COMPACT gives back real room', norm.top - sm.top >= 40,
      (norm.top - sm.top) + 'px');
    t.ok('TINY gives back more still', norm.top - xs.top >= 90, (norm.top - xs.top) + 'px');
    t.ok('and the pad grid that used to run off the bottom now fits',
      norm.padBottom > norm.vh && xs.padBottom <= xs.vh,
      norm.padBottom + ' → ' + xs.padBottom + ' (screen ' + xs.vh + ')');

    /* The point of the setting is that it shrinks the FURNITURE. A size control
       that also shrinks what you aim at has traded one problem for a worse one,
       so this measures the things a finger has to hit. */
    const targets = await page.evaluate(() => {
      const m = id => { const e = document.getElementById(id);
        const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); };
      const pad = document.querySelector('#padgrid .pad');
      const step = document.querySelector('#stepgrid .step');
      const pr = pad.getBoundingClientRect();
      return { pad: Math.round(Math.min(pr.width, pr.height)),
        step: step ? Math.round(step.getBoundingClientRect().height) : null,
        play: m('btnPlay'), stop: m('btnStop'), tab: (() => {
          const b = document.querySelector('#tabs button');
          const r = b.getBoundingClientRect(); return Math.round(r.height); })() };
    });
    t.note('    at TINY: pad ' + targets.pad + 'px · transport ' + targets.play +
      'px · tab row ' + targets.tab + 'px');
    t.ok('pads are untouched by the size setting', targets.pad >= 44, targets.pad + 'px');
    t.ok('nothing tappable falls under the 24px floor',
      Math.min(targets.play, targets.stop, targets.tab) >= 24,
      Math.min(targets.play, targets.stop, targets.tab) + 'px smallest');

    t.head('IT REMEMBERS, AND IT IS REACHABLE');
    const stored = await page.evaluate(() => localStorage.getItem('jbh_size_v1'));
    t.ok('the choice is written to the device', stored === 'xs', String(stored));
    await page.reload({ timeout: 40000 });
    await page.waitForFunction(() => document.getElementById('lcdmsg'), null, { timeout: 40000 });
    const survived = await page.evaluate(() => document.body.classList.contains('sz-xs'));
    t.ok('and is applied again on the next launch', survived);

    const menu = await page.evaluate(() => {
      guideMenu();
      const btns = [...document.querySelectorAll('#tourBody .szrow button')];
      const card = document.getElementById('tourCard').getBoundingClientRect();
      const rowOf = () => document.querySelector('#tourBody .szrow').getBoundingClientRect();
      const body = () => document.getElementById('tourBody').getBoundingClientRect();
      const inside = r => { const b = body(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1; };
      const cold = inside(rowOf());
      guideMenu('size');                       // the way the suggestion opens it
      return { n: btns.length, labels: btns.map(b => b.textContent),
        marked: btns.filter(b => b.classList.contains('on')).map(b => b.dataset.sz),
        note: (document.getElementById('szNote') || {}).textContent || '',
        onScreen: card.top >= 0 && card.top < window.innerHeight,
        cold, focused: inside(rowOf()) };
    });
    t.ok('the ? menu offers all four sizes', menu.n === 4, menu.labels.join(' / '));
    t.ok('with the current one marked', menu.marked.length === 1 && menu.marked[0] === 'xs',
      menu.marked.join(',') || 'none marked');
    t.ok('and says what the current one does', menu.note.length > 20, menu.note.slice(0, 60));
    t.ok('the menu itself is on screen at 360x640', menu.onScreen);
    /* Six recipes push the size row off the bottom of a card that is already
       as tall as a 640px screen allows. Opening the menu FROM the suggestion
       has to land on the thing the suggestion was about. */
    t.note('    the size row is ' + (menu.cold ? '' : 'not ') + 'visible when ? is opened cold');
    t.ok('opening it from the suggestion scrolls the size row into view', menu.focused);

    /* A setting nobody can find is not a setting. On a short screen the app
       offers it rather than waiting to be asked. */
    const offered = await page.evaluate(() => {
      localStorage.setItem('jbh_size_v1', 'norm');
      const tip = COACH_TIPS.find(c => c.id === 'screensize');
      return { fires: !!tip.when(), opensMenu: !!(tip.go && tip.go.menu) };
    });
    t.ok('a short screen is offered the setting unprompted', offered.fires && offered.opensMenu);

    await page.setViewportSize({ width: 430, height: 932 });
    const quiet = await page.evaluate(() =>
      !!COACH_TIPS.find(c => c.id === 'screensize').when());
    t.ok('a tall one is not pestered about it', !quiet);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
