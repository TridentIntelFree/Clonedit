/* WHICH PACK HAS A CELLO IN IT?

   There was no way to ask, and three separate things made it so.

   `packManifest` is ONE object, so loading a pack replaces the last one.
   The picker listed twelve files in a flat row of hand-written options.
   And there was no filter anywhere, so VCSL Wide put 1,045 rows into a
   210px box. 2,840 samples, and the only route to any of them was already
   knowing which file held it.

   Two packs were not even in that list. `foundkit` and `darkkit` have a
   section of AGENTS.md to themselves — their onset fields are documented
   sample by sample — and a person could not load either, because adding a
   manifest to samples/ and adding an <option> to the markup are separate
   acts and nobody did the second one. Twice. The picker is generated from
   the manifests now and the generator refuses to run on a pack it has no
   shelf for, so that cannot recur by omission; this suite is the half that
   checks the generated thing arrives in the page.

   These drive the controls, not the index module. tests/sampleindex.test.mjs
   can check the ranking function in isolation and say nothing about whether
   a person can reach a sound. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { viewport: { width: 430, height: 932 } });
  try {
    const open = async () => {
      await page.evaluate(async () => {
        document.querySelector('#tabs button[data-v="smpl"]').click();
        await new Promise(r => setTimeout(r, 250));
      });
    };
    await open();

    t.head('THE PACK LIST IS BUILT FROM THE MANIFESTS, NOT TYPED OUT');
    const picker = await page.evaluate(() => {
      const sel = document.getElementById('packPick');
      const groups = [...sel.querySelectorAll('optgroup')];
      return {
        options: sel.options.length,
        shelves: groups.map(g => g.label),
        values: [...sel.options].map(o => o.value),
        labels: [...sel.options].map(o => o.textContent),
        /* every pack the index knows about should be offered */
        known: typeof SAMPLE_PACKS !== 'undefined' ? SAMPLE_PACKS.map(p => p.file) : [],
      };
    });
    t.ok('every pack in samples/ is offered',
      picker.known.length > 0 && picker.known.every(f => picker.values.includes(f)),
      picker.known.filter(f => !picker.values.includes(f)).join(', ') || picker.known.length + ' packs, all listed');
    t.ok('and they are on shelves rather than in one flat list',
      picker.shelves.length >= 4, picker.shelves.join(' / '));
    t.ok('a URL is still an option, so the list is not a ceiling',
      picker.values.includes('custom'), 'custom present');

    /* THE REGRESSION THAT STARTED THIS. Named rather than covered by the
       "every pack" check above, because these two are the evidence that
       the general check is worth having. */
    t.head('THE TWO PACKS NOBODY COULD LOAD');
    for (const f of ['samples/foundkit.json', 'samples/darkkit.json'])
      t.ok(f.replace('samples/', '') + ' is reachable', picker.values.includes(f),
        picker.values.includes(f) ? 'listed' : 'STILL MISSING');

    t.head('EVERY NAME SAYS WHAT IS IN IT, AND HOW MUCH');
    /* the old labels ran to ninety characters with the licence in the
       middle; a count that is typed by hand is a count that goes stale */
    const named = picker.labels.filter(l => l !== 'From a URL… (.json or .sfz)');
    t.ok('each carries a measured count', named.every(l => /· \d+ sounds/.test(l)),
      named.find(l => !/· \d+ sounds/.test(l)) || 'all counted');
    t.ok('and the counts are the manifests’ real sizes', await page.evaluate(() =>
      SAMPLE_PACKS.every(p => document.getElementById('packPick').textContent
        .includes(p.name + ' · ' + p.n + ' sounds'))), 'measured, not typed');

    t.head('FIND A SOUND, IN A PACK THAT IS NOT LOADED');
    const search = await page.evaluate(async () => {
      const box = document.getElementById('packFind');
      box.value = 'cello';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const other = document.getElementById('packFindOther');
      return {
        shown: other.style.display !== 'none' && other.children.length > 0,
        text: other.textContent.slice(0, 120),
        rows: [...other.querySelectorAll('.packrow')].length,
        canLoad: !!other.querySelector('.packrow button'),
      };
    });
    t.ok('a search names the packs that hold one', search.shown && search.rows > 0,
      search.rows + ' pack(s): ' + JSON.stringify(search.text.slice(0, 70)));
    t.ok('and offers to load one, which is the actual answer', search.canLoad,
      search.canLoad ? 'LOAD button present' : 'no way to act on the result');

    t.head('AND IT FILTERS THE PACK YOU DO HAVE OPEN');
    const filtered = await page.evaluate(async () => {
      const box = document.getElementById('packFind');
      box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      await JBH.pack('samples/jbh-drums.json');
      await new Promise(r => setTimeout(r, 300));
      const all = document.querySelectorAll('#packList .packrow').length;
      box.value = 'kick'; box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const some = document.querySelectorAll('#packList .packrow').length;
      const hdr = document.querySelector('#packList .packhdr').textContent;
      box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return { all, some, hdr, back: document.querySelectorAll('#packList .packrow').length };
    });
    t.ok('typing narrows the rows', filtered.some > 0 && filtered.some < filtered.all,
      filtered.all + ' rows -> ' + filtered.some);
    t.ok('and the header says how many of how many', /\d+ of \d+ samples match/.test(filtered.hdr),
      JSON.stringify(filtered.hdr));
    t.ok('clearing it puts them all back', filtered.back === filtered.all,
      filtered.back + ' of ' + filtered.all);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
