/* CLICK EVERY CONTROL AND SEE WHICH ONES BREAK.

   This exists because of a measured pattern, not a worry. In one
   session, four bugs were found underneath features being added, and
   every one of them shared a shape:

     GROOVES name collision    the feel panel threw ReferenceError in
                               the SHIPPED build, and both files' unit
                               tests stayed green the whole time
     if(drums[0])              pad A01 is index 0, so the commonest
                               board silently had no kick
     loadIntoTarget            wrote to the selected pad, not the one
                               passed in
     kit by pad index          the kick figure landed on a hat

   None are exotic. All were invisible to the unit suite, because a test
   that imports a module by path says nothing about whether the page
   receives it, and a test that calls window.JBH says nothing about
   whether anyone can reach the call. The app has 223 buttons, 87 selects
   and 180 inputs; the browser suites drive a few dozen of them.

   So this drives all of them and reports what throws.

   WHAT IT CAN AND CANNOT SEE. It catches an uncaught error from a
   handler, which is what the GROOVES bug was. It cannot tell a control
   that does nothing from a control that correctly did nothing — "no
   sound loaded" is a legitimate refusal and looks identical from out
   here. So it reports THROWS, and classifies them, because the
   classification is the whole value:

     ReferenceError            a name the page never received. Always a bug.
     TypeError on undefined    a thing assumed present. Almost always a bug.
     Error with a message      usually a refusal, and usually correct.

   Run: node scripts/audit-controls.mjs [--all]
   Without --all it skips controls whose id looks destructive, because
   one of them clearing the project makes every later control refuse for
   the wrong reason. */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findBrowser, serve, boot } from '../tests/browser/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = process.argv.includes('--all');
const DESTRUCTIVE = /new|clear|del|reset|wipe|erase|kill|load|save|export|import|rec|bounce|render/i;

const html = readFileSync(resolve(ROOT, 'src', 'index.html'), 'utf8');
const ids = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
/* SELECTS TOO, and they are the same bug class rather than an extra.
   The GROOVES ReferenceError was reached from `grvSel` as much as from
   the two buttons: a dropdown whose handler reads a name the page never
   received is broken in exactly the same way, and there are 87 of
   them. Each option is selected in turn and a `change` is dispatched,
   because setting `.value` alone fires nothing. */
const selIds = [...html.matchAll(/<select[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
const skipped = ALL ? [] : ids.filter(id => DESTRUCTIVE.test(id));
const targets = ids.filter(id => ALL || !DESTRUCTIVE.test(id));
const selTargets = selIds.filter(id => ALL || !DESTRUCTIVE.test(id));

console.log(ids.length + ' buttons and ' + selIds.length + ' selects in src/index.html; '
  + 'driving ' + targets.length + ' and ' + selTargets.length
  + (skipped.length ? (', skipping ' + skipped.length + ' that look destructive') : ''));

const exe = await findBrowser();
const { base, close } = await serve();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const { ctx, page } = await boot(browser, base);

/* a dialog would block the run; a control that asks before destroying
   something is behaving correctly, so answer no and move on */
page.on('dialog', d => d.dismiss().catch(() => {}));

const errors = [];
page.on('pageerror', e => errors.push(String(e && e.message || e)));

/* give the controls something to work on, so a refusal for lack of a
   sound is not mistaken for a broken handler */
await page.evaluate(async () => {
  await window.JBH.pack('samples/jbh-drums.json');
  await window.JBH.sound('jbh:kick_909', 0);
  await window.JBH.sound('jbh:snare_909', 1);
  await window.JBH.sound('jbh:hat_closed', 2);
  window.JBH.pad(0, { inst: 'bass', srcNote: 36 });
  window.JBH.key('D', 'minor');
  const pat = S.patterns[0];
  for (const st of [0, 4, 8, 12]) { pat.steps[0] = pat.steps[0] || []; pat.steps[0][st] = 0.9; }
});

const found = [];
let clicked = 0, missing = 0;
for (const id of targets) {
  const before = errors.length;
  const present = await page.evaluate((x) => {
    const el = document.getElementById(x);
    if (!el) return false;
    try { el.click(); } catch (e) { throw e; }
    return true;
  }, id).catch(e => { errors.push(String(e && e.message || e)); return true; });
  if (!present) { missing++; continue; }
  clicked++;
  /* handlers may be async; give them a moment to reject */
  await page.waitForTimeout(90);
  const fresh = errors.slice(before);
  if (fresh.length) found.push({ id, errors: [...new Set(fresh)] });
}

/* ---- and every option of every select ------------------------------ */
let selDriven = 0, options = 0;
for (const id of selTargets) {
  const before = errors.length;
  const n = await page.evaluate((x) => {
    const el = document.getElementById(x);
    return el ? el.options.length : -1;
  }, id);
  if (n < 0) { missing++; continue; }
  selDriven++;
  for (let i = 0; i < n; i++) {
    await page.evaluate(([x, k]) => {
      const el = document.getElementById(x);
      if (!el || !el.options[k]) return;
      el.value = el.options[k].value;
      /* .value alone fires nothing, so the handler is never reached */
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, i]).catch(e => errors.push(String(e && e.message || e)));
    options++;
  }
  await page.waitForTimeout(60);
  const fresh = errors.slice(before);
  if (fresh.length) found.push({ id: id + ' (select)', errors: [...new Set(fresh)] });
}

await ctx.close(); await browser.close(); close();

/* ---- the report ---------------------------------------------------- */

const classify = (msg) => /ReferenceError|is not defined/.test(msg) ? 'REFERENCE'
  : /is not a function|Cannot read propert|of undefined|of null/.test(msg) ? 'UNDEFINED'
    : 'THROWN';

console.log('\nclicked ' + clicked + ' buttons, drove ' + selDriven + ' selects over '
  + options + ' options'
  + (missing ? (', ' + missing + ' not in the built page') : '')
  + '; ' + found.length + ' raised something\n');

const buckets = { REFERENCE: [], UNDEFINED: [], THROWN: [] };
for (const f of found) for (const m of f.errors) buckets[classify(m)].push({ id: f.id, m });

const label = {
  REFERENCE: 'A NAME THE PAGE NEVER RECEIVED — always a bug',
  UNDEFINED: 'SOMETHING ASSUMED PRESENT — almost always a bug',
  THROWN: 'threw with a message — usually a refusal, read each one',
};
let bugs = 0;
for (const k of ['REFERENCE', 'UNDEFINED', 'THROWN']) {
  if (!buckets[k].length) continue;
  if (k !== 'THROWN') bugs += buckets[k].length;
  console.log(k + ' (' + buckets[k].length + ') — ' + label[k]);
  for (const b of buckets[k]) console.log('  ' + b.id.padEnd(22) + b.m.slice(0, 110));
  console.log('');
}
if (skipped.length) console.log('not clicked (name looks destructive; --all includes them):\n  '
  + skipped.join(' ') + '\n');
console.log(bugs ? (bugs + ' look like real faults.') : 'nothing in the two bug buckets.');
process.exit(bugs ? 1 : 0);
