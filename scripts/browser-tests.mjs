/* Runs every tests/browser/*.test.mjs against the published index.html.

   One browser and one server for the whole run — launching Chromium is the
   expensive part, and these tests are read-only with respect to each other
   (each gets a fresh context, so localStorage and IndexedDB do not leak
   between them).

   Fail-closed, like the build gate: no browser means the run fails rather than
   reporting success it did not earn. Pass a substring to run a subset:
       node scripts/browser-tests.mjs midi
*/
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findBrowser, serve, ROOT } from '../tests/browser/harness.mjs';

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const dir = resolve(ROOT, 'tests', 'browser');
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs'))
  .filter(f => !only.length || only.some(o => f.includes(o))).sort();

if (!files.length) { console.error('no browser tests matched'); process.exit(1); }
if (!existsSync(resolve(ROOT, 'index.html'))) {
  console.error('index.html is missing — run `npm run build` first'); process.exit(1);
}

const exe = await findBrowser();
if (!exe) {
  console.error('NO BROWSER — these tests cannot run without one.');
  console.error('  install one (npx playwright install chromium) or set CHROME_PATH.');
  process.exit(1);
}
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core is missing (npm install)'); process.exit(1); }

const { base, close } = await serve();
const browser = await chromium.launch({ executablePath: exe,
  args: ['--autoplay-policy=no-user-gesture-required'] });

let failed = 0;
const t0 = Date.now();
for (const f of files) {
  const name = f.replace(/\.test\.mjs$/, '');
  const started = Date.now();
  let result;
  try {
    const mod = await import(pathToFileURL(resolve(dir, f)));
    result = await mod.default({ browser, base });
  } catch (e) {
    result = { lines: ['  ✗ the test itself threw: ' + (e && e.stack || e)], failures: ['crashed'] };
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const bad = result.failures.length;
  console.log('\n' + '─'.repeat(64));
  console.log((bad ? 'FAIL  ' : 'ok    ') + name + '   (' + secs + 's)');
  console.log('─'.repeat(64));
  console.log(result.lines.join('\n'));
  if (bad) { failed += bad; console.log('\n  ' + bad + ' failure' + (bad > 1 ? 's' : '') + ' in ' + name); }
}

await browser.close(); close();

const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log('\n' + '═'.repeat(64));
if (failed) {
  console.log(failed + ' failing check' + (failed > 1 ? 's' : '') + ' across ' + files.length +
    ' suite' + (files.length > 1 ? 's' : '') + '  (' + total + 's)');
  process.exit(1);
}
console.log('all browser tests passed — ' + files.length + ' suite' +
  (files.length > 1 ? 's' : '') + '  (' + total + 's)');
