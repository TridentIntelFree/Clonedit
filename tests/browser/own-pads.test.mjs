/* A RECIPE ON A BOARD THAT ALREADY HAS SOUNDS.
 *
 * Reported from use: "when I click check my sounds it doesn't check
 * pads that I already had to fill the gap, it only counts the new
 * recipe." Exactly right. recipe() claims only EMPTY pads on purpose —
 * taking somebody's loaded sound to make room is the wrong guess to
 * make silently — and the consequence was never followed through: a
 * person with a full board got slots pointing at new empty pads, CHECK
 * MY SOUNDS reported every slot empty forever, and there was no way to
 * say "pad 3 is my kick, use that".
 *
 * The second half of the same report: write should "consider what
 * sounds it has before it writes them". Roles came from mean pitch
 * alone, so the highest instrument was made the arp whether or not it
 * could play one.
 */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    /* three sounds already on the board before any recipe exists, built
       by hand so each one's speed is known: a click, a thud and a swell */
    const load = async () => page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.set({ bpm: 150 });
      const sr = AC.sampleRate;
      const mk = (attack, decay, hz) => {
        const b = AC.createBuffer(1, Math.round(sr * 1.4), sr);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          const tt = i / sr;
          const a = tt < attack ? tt / attack : Math.pow(10, -3 * (tt - attack) / decay);
          d[i] = 0.6 * a * Math.sin(2 * Math.PI * hz * tt);
        }
        S.buffers.push(b);
        return S.buffers.length - 1;
      };
      /* pad 0 a fast click, pad 1 a fast low thud, pad 2 a slow swell */
      S.pads[0].bufId = mk(0.002, 0.05, 900); S.pads[0].name = 'my click'; S.pads[0].srcNote = 72;
      S.pads[1].bufId = mk(0.003, 0.20, 60); S.pads[1].name = 'my thud'; S.pads[1].srcNote = 36;
      S.pads[2].bufId = mk(0.260, 1.00, 440); S.pads[2].name = 'my swell'; S.pads[2].srcNote = 60;
    });

    t.head('A RECIPE STILL LEAVES YOUR SOUNDS ALONE');
    await load();
    const rec = await page.evaluate(async () => {
      const out = await window.JBH.recipe({ seed: 4242 });
      return { slots: out.slots.map(s => ({ slot: s.slot, pad: s.pad })),
        mine: [0, 1, 2].map(i => ({ pad: i, name: S.pads[i].name, buf: S.pads[i].bufId })) };
    });
    t.ok('the three pads I had are untouched and the slots went elsewhere',
      rec.mine.every(m => m.buf >= 0 && /^my /.test(m.name))
      && rec.slots.every(s => s.pad > 2),
      rec.mine.map(m => m.name).join(', ') + ' | slots on '
      + rec.slots.map(s => s.pad).join(','));

    t.head('AND CHECK MY SOUNDS NOW LOOKS AT THEM — THE REPORTED BUG');
    const fit = await page.evaluate(async () => {
      const r = await window.JBH.recipe({ seed: 4242 });
      const low = r.slots.find(s => s.slot === 'low') || r.slots[0];
      const f = await window.JBH.fit(low.slot);
      return { slot: low.slot, label: low.label, f };
    });
    t.ok('an empty slot offers the pads I already loaded, by pad number',
      Array.isArray(fit.f.candidates) && fit.f.candidates.length > 0
      && fit.f.candidates.every(c => c.pad >= 0 && c.pad <= 2),
      (fit.f.candidates || []).map(c => 'PAD ' + (c.pad + 1) + ' ' + c.name).join('; '));
    t.ok('it says so in words, and names the call that uses one',
      /already have/.test(fit.f.says) && /slot\(/.test(fit.f.says),
      fit.f.says.slice(0, 200));

    t.head('PUTTING ONE IN MOVES THE WRITTEN STEPS WITH IT');
    const moved = await page.evaluate(async () => {
      const r = await window.JBH.recipe({ seed: 4242 });
      /* a kit slot, so there are steps written on its empty pad */
      const kit = r.slots.find(s => !s.pitched && s.slot !== 'low') || r.slots[1];
      /* THE PAD INDEX AS A NUMBER, before anything can move it. The
         first version of this test read kit.pad again afterwards and
         compared a pad against itself, because recipe() handed back the
         same objects slot() rewrites — so the move looked like a copy
         and the implementation was blamed for an hour. recipe() returns
         copies now; this stays explicit anyway. */
      const oldPad = kit.pad | 0;
      const pat = S.patterns[S.pattern];
      const before = (pat.steps[oldPad] || []).filter(v => v > 0).length;
      const res = await window.JBH.slot(kit.slot, 0);      /* my click */
      const after = {
        onOld: (S.patterns[S.pattern].steps[oldPad] || []).filter(v => v > 0).length,
        onNew: (S.patterns[S.pattern].steps[0] || []).filter(v => v > 0).length,
      };
      return { slot: kit.slot, oldPad, snapshotStable: kit.pad === oldPad,
        before, after, res,
        padName: S.pads[0].name, padInst: S.pads[0].inst };
    });
    t.ok('the steps are on my pad now, and not on the empty one',
      moved.before > 0 && moved.after.onNew === moved.before && moved.after.onOld === 0,
      moved.before + ' steps: old pad now ' + moved.after.onOld
      + ', my pad ' + moved.after.onNew);
    t.ok('and the snapshot recipe() returned did not change under the caller',
      moved.snapshotStable === true,
      'slots[n].pad was ' + moved.oldPad + ' before and after');
    t.ok('AND MY PAD CARRIES THE SLOT so balance() and the panel see one instrument',
      moved.padInst === moved.slot, 'inst=' + moved.padInst + ' name=' + moved.padName);
    t.ok('it reports the move and then the fit, in one sentence',
      /is pad 1 now/.test(moved.res.says) && /steps? moved with it/.test(moved.res.says),
      moved.res.says.slice(0, 170));

    t.head('IT REFUSES THE MOVES THAT WOULD DO NOTHING');
    const refuse = await page.evaluate(async () => {
      const r = await window.JBH.recipe({ seed: 4242 });
      const s0 = r.slots[0];
      const out = {};
      try { await window.JBH.slot(s0.slot, 60); } catch (e) { out.empty = e.message; }
      try { await window.JBH.slot('nosuchslot', 0); } catch (e) { out.noslot = e.message; }
      return out;
    });
    t.ok('an empty pad is refused with the reason, not silently accepted',
      /is empty/.test(refuse.empty || '') && /change nothing/.test(refuse.empty || ''),
      refuse.empty);
    t.ok('and an unknown slot lists the ones there are',
      /no slot/.test(refuse.noslot || '') && /It has:/.test(refuse.noslot || ''),
      refuse.noslot);

    t.head('WRITE CONSIDERS WHAT THE SOUND CAN PLAY, NOT JUST ITS PITCH');
    await load();
    const roles = await page.evaluate(async () => {
      /* tag all three. By pitch alone the swell (60) is not highest, so
         make it the highest to force the old behaviour into the open. */
      S.pads[0].inst = 'click'; S.pads[0].srcNote = 48;
      S.pads[1].inst = 'thud'; S.pads[1].srcNote = 36;
      S.pads[2].inst = 'swell'; S.pads[2].srcNote = 84;
      return mlVoices();
    });
    const swell = roles.find(r => r.inst === 'swell');
    t.ok('the highest sound is NOT made the arp when it cannot play one',
      swell && swell.role !== 'arp',
      roles.map(r => r.inst + '=' + r.role).join(' '));
    t.ok('and it says why, rather than quietly reshuffling',
      swell && /takes \d+ms to speak/.test(swell.why || ''), (swell || {}).why);
    t.ok('the arp goes to the highest that CAN play one',
      (roles.find(r => r.role === 'arp') || {}).inst === 'click'
      || !roles.some(r => r.role === 'arp'),
      roles.map(r => r.inst + '=' + r.role).join(' '));
    t.ok('and the bass is still the lowest, untouched',
      (roles.find(r => r.role === 'bass') || {}).inst === 'thud',
      roles.map(r => r.inst + '=' + r.role).join(' '));

    t.head('AND THE PERSON CAN ACT ON IT, NOT JUST READ IT');
    const ui = await page.evaluate(async () => {
      await window.JBH.clear();
      const sr = AC.sampleRate;
      const b = AC.createBuffer(1, Math.round(sr * 1.2), sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const tt = i / sr;
        d[i] = 0.6 * Math.exp(-tt / 0.05) * Math.sin(2 * Math.PI * 200 * tt);
      }
      S.buffers.push(b);
      S.pads[0].bufId = S.buffers.length - 1; S.pads[0].name = 'my click';
      document.getElementById('mlRecipe').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (document.getElementById('mlSlots').textContent.length > 40) break;
      }
      document.getElementById('mlFit').click();
      for (let i = 0; i < 160; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (document.querySelectorAll('#mlSlots button').length) break;
      }
      const btns = [...document.querySelectorAll('#mlSlots button')];
      if (!btns.length) return { buttons: 0 };
      const label = btns[0].textContent;
      btns[0].click();
      for (let i = 0; i < 160; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (/is pad 1 now/.test(document.getElementById('mlSlots').textContent)) break;
      }
      /* read the SLOTS box, not mlInfo: mlInfo is shared with the chord
         panel, which rewrites it on every redraw — the first version of
         this test watched mlInfo and caught "No chords on pattern 1"
         arriving on top of the result */
      return { buttons: btns.length, label,
        info: document.getElementById('mlSlots').textContent,
        padInst: S.pads[0].inst };
    });
    t.ok('CHECK MY SOUNDS offers a button per sound I already have',
      ui.buttons > 0 && /USE PAD 1/.test(ui.label || ''),
      ui.buttons + ' buttons, first reads "' + ui.label + '"');
    t.ok('and pressing it actually puts my pad in the slot',
      /is pad 1 now/.test(ui.info || '') && !!ui.padInst,
      (ui.info || '').slice(0, 130) + ' | pad 1 inst=' + ui.padInst);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
