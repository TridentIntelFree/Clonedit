/* THE FOLDED EXPLANATIONS.

   The app teaches itself through prose sitting next to the controls, which is
   most of what makes it usable without a manual — and which, on a phone, put
   three paragraphs between two sliders. The report was "can't read it".

   Folding solves that only if it really is folded by default, really does open,
   and really does remember. And the whole point of folding was to afford MORE
   explanation, so the content has to have actually grown rather than just moved.

   The accessibility checks are not decoration: a disclosure that a keyboard
   cannot reach, or that a screen reader announces as an unlabelled control, has
   taken working prose and hidden it from the people who most need it read out. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { audio: false });
  try {
    t.head('EVERYTHING IS FOLDED TO START WITH');
    const initial = await page.evaluate(() => {
      const ex = [...document.querySelectorAll('details.ex')];
      const more = [...document.querySelectorAll('.hint-more')];
      return {
        nEx: ex.length, nMore: more.length,
        openEx: ex.filter(d => d.open).length,
        openMore: more.filter(b => b.getAttribute('aria-expanded') === 'true').length,
        bodiesHidden: [...document.querySelectorAll('.hint-body')].every(b => b.hidden),
        leads: document.querySelectorAll('.hint-lead').length,
      };
    });
    t.note('    ' + initial.nEx + ' per-control explainers · ' + initial.nMore + ' per-tab lessons');
    t.ok('every tab still has its one-line lead', initial.leads === 12, initial.leads + ' leads');
    t.ok('there is an explainer on every tab', initial.nMore === 12, initial.nMore + '');
    t.ok('the per-control explainers exist', initial.nEx >= 15, initial.nEx + '');
    t.ok('none of them start open', initial.openEx === 0 && initial.openMore === 0,
      initial.openEx + ' + ' + initial.openMore + ' open');
    t.ok('and the lesson panels start hidden', initial.bodiesHidden);

    t.head('THE CONTENT ACTUALLY GREW');
    const words = await page.evaluate(() => {
      const count = sel => [...document.querySelectorAll(sel)]
        .reduce((n, e) => n + e.textContent.trim().split(/\s+/).length, 0);
      return { leads: count('.hint-lead'), lessons: count('.hint-body'), ex: count('.ex-body') };
    });
    t.note('    lead lines ' + words.leads + ' words · folded lessons ' + words.lessons +
      ' · folded explainers ' + words.ex);
    /* Folding that only relocated the existing text would have missed the point
       — the request was for MORE explanation, affordable because it is hidden
       until asked for. */
    t.ok('the folded material dwarfs what is on screen',
      words.lessons + words.ex > words.leads * 4,
      (words.lessons + words.ex) + ' folded vs ' + words.leads + ' visible');

    t.head('OPENING ONE WORKS');
    /* The tab has to be the visible one. An inactive view is display:none, so
       everything inside it measures zero and cannot take focus — which says
       nothing about whether the disclosure works. */
    const showTab = v => page.evaluate(v =>
      document.querySelector('#tabs button[data-v="' + v + '"]').click(), v);
    await showTab('out');
    /* Measure the <details> BOX, not the body inside it. Chrome keeps a closed
       details' content in the box tree so that ::details-content can animate,
       so the body reports a height even while nothing of it is rendered —
       measuring the child said 323px both before and after, which was the test
       being wrong rather than the fold. The element's own height is what a
       reader actually sees, and checkVisibility() accounts for the same
       content-visibility the box measurement misses. */
    const opened = await page.evaluate(() => {
      const d = document.querySelector('#v-out details.ex');
      const body = d.querySelector('.ex-body');
      const vis = () => body.checkVisibility
        ? body.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
        : null;
      const before = d.getBoundingClientRect().height, visBefore = vis();
      d.querySelector('summary').click();
      const after = d.getBoundingClientRect().height;
      return { open: d.open, before, after, visBefore, visAfter: vis(),
        summary: d.querySelector('summary').textContent.trim() };
    });
    t.ok('it opens', opened.open, '"' + opened.summary + '"');
    t.ok('the whole thing was only a summary while closed', opened.before < 40,
      opened.before.toFixed(0) + 'px tall');
    t.ok('and grows to show the explanation', opened.after > opened.before + 100,
      opened.before.toFixed(0) + 'px → ' + opened.after.toFixed(0) + 'px');
    t.ok('the body is genuinely not rendered when closed', opened.visBefore === false,
      'checkVisibility ' + opened.visBefore);
    t.ok('and is rendered when open', opened.visAfter === true,
      'checkVisibility ' + opened.visAfter);

    await showTab('pads');
    const lesson = await page.evaluate(() => {
      const b = document.querySelector('#v-pads .hint-more');
      b.click();
      const body = document.getElementById(b.getAttribute('aria-controls'));
      return { expanded: b.getAttribute('aria-expanded'), hidden: body.hidden,
        h: body.getBoundingClientRect().height };
    });
    t.ok('a tab lesson opens', lesson.expanded === 'true' && !lesson.hidden);
    t.ok('aria-expanded tracks it', lesson.expanded === 'true');
    t.ok('and it has real height', lesson.h > 100, lesson.h.toFixed(0) + 'px');

    t.head('AND IS REMEMBERED ACROSS A RELOAD');
    await page.reload({ timeout: 40000 });
    await page.waitForFunction(() => {
      const l = document.getElementById('lcdmsg');
      return l && /Amber|READY|SESSION/.test(l.textContent);
    }, null, { timeout: 45000 });
    const after = await page.evaluate(() => ({
      ex: document.querySelector('#v-out details.ex').open,
      more: document.querySelector('#v-pads .hint-more').getAttribute('aria-expanded'),
      others: [...document.querySelectorAll('details.ex')].filter(d => d.open).length,
    }));
    t.ok('the explainer is still open', after.ex);
    t.ok('the lesson is still open', after.more === 'true');
    t.ok('but nothing else opened itself', after.others === 1, after.others + ' open');

    t.head('CLOSING IS REMEMBERED TOO');
    await showTab('out');
    await page.evaluate(() => document.querySelector('#v-out details.ex summary').click());
    await showTab('pads');
    await page.evaluate(() => document.querySelector('#v-pads .hint-more').click());
    /* <details> fires `toggle` asynchronously, so the save can lose a race with
       reload. Wait for the store to actually be empty rather than assuming. */
    await page.waitForFunction(() =>
      (localStorage.getItem('jbh_learn_v1') || '[]') === '[]', null, { timeout: 5000 });
    await page.reload({ timeout: 40000 });
    await page.waitForFunction(() => {
      const l = document.getElementById('lcdmsg');
      return l && /Amber|READY|SESSION/.test(l.textContent);
    }, null, { timeout: 45000 });
    const closed = await page.evaluate(() => ({
      ex: document.querySelector('#v-out details.ex').open,
      more: document.querySelector('#v-pads .hint-more').getAttribute('aria-expanded'),
    }));
    t.ok('the explainer stayed closed', !closed.ex);
    t.ok('the lesson stayed closed', closed.more === 'false');

    t.head('REACHABLE WITHOUT A MOUSE OR EYES');
    const a11y = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('details.ex').forEach(d => {
        const s = d.querySelector('summary');
        if (!s) { bad.push('a details with no summary'); return; }
        if (!s.textContent.trim()) bad.push('an unlabelled summary');
      });
      document.querySelectorAll('.hint-more').forEach(b => {
        if (!b.textContent.trim()) bad.push('an unlabelled lesson button');
        if (b.getAttribute('aria-expanded') == null) bad.push('a lesson button with no aria-expanded');
        const id = b.getAttribute('aria-controls');
        if (!id || !document.getElementById(id)) bad.push('a lesson button pointing at nothing');
      });
      return bad;
    });
    t.ok('every disclosure is labelled and wired', a11y.length === 0, a11y.join(' | '));

    // <summary> is focusable natively; the lesson buttons are real <button>s.
    await showTab('out');
    const focus = await page.evaluate(() => {
      const s = document.querySelector('#v-out details.ex summary');
      s.focus();
      const gotSummary = document.activeElement === s;
      return { gotSummary };
    });
    await showTab('pads');
    focus.gotButton = await page.evaluate(() => {
      const b = document.querySelector('#v-pads .hint-more');
      b.focus();
      return document.activeElement === b;
    });
    t.ok('a summary takes keyboard focus', focus.gotSummary);
    t.ok('a lesson button takes keyboard focus', focus.gotButton);

    await showTab('mix');
    const kb = await page.evaluate(async () => {
      const d = document.querySelector('#v-mix details.ex');
      d.querySelector('summary').focus();
      return { before: d.open };
    });
    await page.keyboard.press('Enter');
    const kbAfter = await page.evaluate(() => document.querySelector('#v-mix details.ex').open);
    t.ok('Enter opens a folded explainer', !kb.before && kbAfter);

    t.head('THE SIDEWAYS CLAMP STILL LEAVES THE TOGGLE REACHABLE');
    /* The clamp used to be on the whole .hint. That container now holds the
       button and the lesson, so clamping it would hide the control that opens
       them — the clamp is on the lead line alone. */
    await showTab('trax');            // the longest lead in the app
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(250);
    const land = await page.evaluate(() => {
      const hint = document.querySelector('#v-trax .hint');
      const lead = hint.querySelector('.hint-lead');
      const btn = hint.querySelector('.hint-more');
      const hr = hint.getBoundingClientRect(), br = btn.getBoundingClientRect();
      return { leadMax: getComputedStyle(lead).maxHeight,
        leadClipped: lead.scrollHeight > lead.clientHeight + 1,
        btnVisible: br.height > 0 && br.bottom <= hr.bottom + 1,
        hintOverflow: getComputedStyle(hint).overflow };
    });
    /* Assert the RULE is in force, not that one particular sentence overflows —
       a short lead on a wide landscape screen legitimately fits. */
    t.ok('the clamp is applied to the lead line', land.leadMax !== 'none', land.leadMax);
    t.ok('and a long lead is actually clipped by it', land.leadClipped);
    t.ok('but the toggle is still visible and inside the box', land.btnVisible);
    t.ok('the container is not clipping its own controls', land.hintOverflow === 'visible',
      land.hintOverflow);
    await page.setViewportSize({ width: 430, height: 932 });

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
