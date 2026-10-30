/* THE TWO-ROW NAVIGATION, IN A REAL BROWSER AT A REAL WIDTH.

   tests/layout.test.mjs reads the markup and checks the structure holds
   together — every tab in exactly one activity, every activity reachable,
   the engine's table agreeing with the attributes. That is static and it is
   instant, and it cannot answer the question the whole change was made to
   answer: DOES THE BAR FIT.

   It has to, because the bar this replaced did not. Twelve tabs scrolled
   sideways and the CSS comment over them admitted the bind — "Ten tabs
   already crowded a phone and an eleventh will not fit at all." Scrolling is
   not a solution to that, it is a way of not seeing it: a destination off the
   edge is one nobody picks. So the measurement that matters is scrollWidth
   against clientWidth on the activity row, at the narrowest width this app
   claims to support, and R134's lesson applies — measure it, do not look at
   it and decide it seems fine.

   The other half is the compatibility property the whole design rests on.
   Twelve browser suites, the tour, the coach bar, the session restore and
   five call sites inside the engine navigate by
   #tabs button[data-v="x"].click(). None of them know activities exist. If
   that click stops opening the owning activity, every one of them lands on a
   tab that is in the DOM, is marked on, and is not on screen — which is the
   worst kind of broken, because everything keeps reporting success. */

import { boot, checker } from './harness.mjs';

const VIEWS = ['pads', 'smpl', 'tools', 'seq', 'trax', 'mic', 'live', 'amp', 'dj', 'midi', 'mix', 'out', 'proj'];

export default async function ({ browser, base }) {
  const t = checker();

  /* 360x640: an ordinary Android, and the width R135 sized this app's
     chrome against. If the activity row fits here it fits everywhere. */
  const { ctx, page, errors } = await boot(browser, base, { viewport: { width: 360, height: 640 } });
  try {
    t.head('THE ACTIVITY ROW FITS, WHICH IS THE WHOLE POINT');
    const fit = await page.evaluate(() => {
      const g = document.getElementById('groups');
      return { w: g.clientWidth, sw: g.scrollWidth, n: g.querySelectorAll('button').length,
        labels: [...g.querySelectorAll('button')].map(b => b.textContent.trim()),
        /* no button may be clipped either — fitting the row is not the same
           as every label being legible in it */
        clipped: [...g.querySelectorAll('button')].filter(b => b.scrollWidth > b.clientWidth + 1)
          .map(b => b.textContent.trim()) };
    });
    t.ok('all five activities are on screen at 360px, with nothing to scroll',
      fit.sw <= fit.w + 1 && fit.n === 5,
      fit.n + ' activities, ' + fit.sw + 'px of content in ' + fit.w + 'px: ' + fit.labels.join(' '));
    t.ok('and none of their labels is cut off',
      fit.clipped.length === 0, fit.clipped.length ? 'clipped: ' + fit.clipped.join(', ') : 'all five read in full');

    t.head('EVERY VIEW IS STILL REACHABLE, AND LANDS VISIBLE');
    const reach = await page.evaluate(async (views) => {
      const out = [];
      for (const v of views) {
        document.querySelector('#tabs button[data-v="' + v + '"]').click();
        await new Promise(r => setTimeout(r, 40));
        const view = document.getElementById('v-' + v);
        const tab = document.querySelector('#tabs button[data-v="' + v + '"]');
        const grp = document.querySelector('#groups button.on');
        out.push({ v,
          open: view.classList.contains('on'),
          /* in the DOM and marked on is not enough — the tab itself has to be
             drawn, which is exactly what fails if the group does not follow */
          tabShown: tab.offsetParent !== null || document.getElementById('tabs').classList.contains('solo'),
          group: grp ? grp.dataset.g : null,
          groupMatches: tab.dataset.g === (grp ? grp.dataset.g : null) });
      }
      return out;
    }, VIEWS);
    const bad = reach.filter(r => !r.open);
    t.ok('all thirteen open when clicked by data-v', bad.length === 0,
      bad.length ? 'did not open: ' + bad.map(r => r.v).join(', ') : VIEWS.length + ' views');
    const wrong = reach.filter(r => !r.groupMatches);
    t.ok('and clicking a tab opens its activity — what every other caller relies on',
      wrong.length === 0,
      wrong.length ? wrong.map(r => r.v + ' left ' + r.group + ' open').join('; ')
        : 'the activity follows the tab in all ' + VIEWS.length + ' cases');
    const hidden = reach.filter(r => !r.tabShown);
    t.ok('and the tab you landed on is actually drawn, not merely marked',
      hidden.length === 0, hidden.length ? 'not drawn: ' + hidden.map(r => r.v).join(', ') : 'all drawn');

    t.head('A ONE-MEMBER ACTIVITY DOES NOT DRAW A ROW SAYING ITS OWN NAME');
    const solo = await page.evaluate(async () => {
      const read = async (v) => {
        document.querySelector('#tabs button[data-v="' + v + '"]').click();
        await new Promise(r => setTimeout(r, 40));
        const bar = document.getElementById('tabs');
        return { v, solo: bar.classList.contains('solo'), h: bar.getBoundingClientRect().height };
      };
      return { seq: await read('seq'), proj: await read('proj'), pads: await read('pads'), trax: await read('trax') };
    });
    t.ok('WRITE and SONG hide the second row — they are one tap, as before',
      solo.seq.solo && solo.proj.solo && solo.seq.h === 0,
      'seq row ' + solo.seq.h + 'px, proj row ' + solo.proj.h + 'px');
    t.ok('and SOUND and PLAY draw theirs',
      !solo.pads.solo && !solo.trax.solo && solo.pads.h > 0,
      'pads row ' + solo.pads.h + 'px, trax row ' + solo.trax.h + 'px');

    t.head('CLICKING AN ACTIVITY OPENS SOMETHING, AND REMEMBERS WHICH');
    const mem = await page.evaluate(async () => {
      const grp = async (g) => {
        document.querySelector('#groups button[data-g="' + g + '"]').click();
        await new Promise(r => setTimeout(r, 60));
        const on = document.querySelector('#tabs button.on');
        return on ? on.dataset.v : null;
      };
      const first = await grp('play');                       // lands on the first member
      document.querySelector('#tabs button[data-v="dj"]').click();
      await new Promise(r => setTimeout(r, 60));
      await grp('sound');                                     // leave
      const back = await grp('play');                         // and return
      return { first, back };
    });
    t.ok('an activity opens its first member when you have not been there',
      mem.first === 'trax', 'PLAY opened ' + mem.first);
    t.ok('and the one you left it on when you have',
      mem.back === 'dj', 'PLAY reopened ' + mem.back);

    t.head('THE TAPE-LANE WARNING SURVIVES BEING PUT INSIDE AN ACTIVITY');
    /* The badge exists because a tape lane plays with the transport whether
       or not you remember it is there, and the argument for putting it on the
       tab was "the count goes where it can always be seen". TRAX is inside
       PLAY now, so the tab is not always seen and the activity has to carry
       it — otherwise the one warning about a phantom sound is itself hidden
       behind a tap. */
    const badge = await page.evaluate(async () => {
      const read = () => {
        const g = document.querySelector('#groups button[data-g="play"]');
        const tb = document.querySelector('#tabs button[data-v="trax"]');
        return { gOn: g.classList.contains('hasload'), gN: g.dataset.n || '',
          tOn: tb.classList.contains('hasload'), tN: tb.dataset.n || '',
          /* the badge is drawn by ::after off data-n, so read what the
             browser actually renders rather than trusting the attribute */
          gDrawn: (getComputedStyle(g, '::after').content || 'none') };
      };
      /* drawTraxBadge counts lanes whose bufId is set; give it two and call
         it, which is where every real route through the app ends up anyway */
      const before = read();
      const had = S.trax.map(x => x.bufId);
      S.trax[0].bufId = 0; S.trax[1].bufId = 0;
      drawTraxBadge();
      const after = read();
      S.trax.forEach((x, i) => { x.bufId = had[i]; });
      drawTraxBadge();
      const restored = read();
      return { before, after, restored };
    });
    t.ok('with no lanes loaded, neither the tab nor the activity is badged',
      !badge.before.gOn && !badge.before.tOn, 'clean at rest');
    t.ok('two loaded lanes badge the TRAX tab, as they always did',
      badge.after.tOn && badge.after.tN === '2', 'tab reads ' + badge.after.tN);
    t.ok('and the PLAY activity carries the same count, so it survives the fold',
      badge.after.gOn && badge.after.gN === '2' && badge.after.gDrawn.indexOf('2') >= 0,
      'activity reads ' + badge.after.gN + ', rendered as ' + badge.after.gDrawn);
    t.ok('and both clear again when the lanes do',
      !badge.restored.gOn && !badge.restored.tOn, 'back to clean');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }

  /* 360 is the width this app's chrome was sized against, but the size
     settings here are a stored preference and not a media query, so a 320px
     phone on NORMAL gets no help from them and the row has to hold on its
     own. It does, by shrinking the columns rather than overflowing — which
     only works because the buttons carry min-width:0, and that is one
     declaration away from being lost. */
  const narrow = await boot(browser, base, { viewport: { width: 320, height: 640 }, audio: false });
  try {
    t.head('AND IT STILL FITS ON A NARROWER PHONE');
    const r = await narrow.page.evaluate(() => {
      const g = document.getElementById('groups');
      const bs = [...g.querySelectorAll('button')];
      return { w: g.clientWidth, sw: g.scrollWidth,
        clipped: bs.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()),
        each: bs.map(b => b.clientWidth) };
    });
    t.ok('at 320px the activities shrink rather than scroll',
      r.sw <= r.w + 1, r.sw + 'px of content in ' + r.w + 'px [' + r.each.join(' ') + ']');
    t.ok('and all five are still readable',
      r.clipped.length === 0, r.clipped.length ? 'clipped: ' + r.clipped.join(', ') : 'none clipped');
  } finally {
    await narrow.ctx.close();
  }
  return t;
}
