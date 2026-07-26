/* The gate between a build and the people using the app.

   index.html is a link that has been handed out; a broken one is not a failed
   build, it is a broken app in someone else's hands. So the staged page is
   loaded in a real browser, from a real server, with the real sample and icon
   files beside it, and only replaces index.html once it has actually booted.

   Fail-closed on purpose: if no browser can be found the build stops rather
   than publishing something unverified. Pass --skip-smoke to override, and
   know what you are overriding. */
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, normalize } from 'node:path';
import { createServer } from 'node:http';

const root = resolve(import.meta.dirname, '..');
const staged = resolve(root, 'index.next.html');
const live = resolve(root, 'index.html');
if (!existsSync(staged)) { console.error('nothing staged — run the build first'); process.exit(1); }

const promote = () => {
  writeFileSync(live, readFileSync(staged));
  unlinkSync(staged);
  console.log('published  index.html  ' + (statSync(live).size / 1024).toFixed(0) + ' KB');
};

if (process.argv.includes('--skip-smoke')) {
  console.warn('\n  !! smoke test SKIPPED — publishing an unverified build !!\n');
  promote(); process.exit(0);
}

const CANDIDATES = [
  process.env.CHROME_PATH, resolve(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium'),
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const exe = CANDIDATES.find(p => { try { return statSync(p).isFile(); } catch { return false; } });

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('BUILD HELD — playwright-core is missing (npm install).'); process.exit(1); }
if (!exe) {
  console.error('BUILD HELD — no browser found to verify the build with.');
  console.error('  install one (npx playwright install chromium) or set CHROME_PATH,');
  console.error('  or run `npm run build -- --skip-smoke` to publish unverified.');
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const p = resolve(root, '.' + normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const problems = [];
let tabCount = 0;
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('jbh_tour_v1', 'done'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('JS error: ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(r.status() + ' ' + r.url().replace(base, '')); });

  await page.goto(base + '/index.next.html', { timeout: 30000 });
  await page.waitForFunction(() => {
    const l = document.getElementById('lcdmsg');
    return l && /Amber|READY|SESSION/.test(l.textContent);
  }, null, { timeout: 30000 }).catch(() => problems.push('the app never finished booting'));

  const r = await page.evaluate(async () => {
    const out = {};
    out.pads = (typeof S === 'object' && S.pads) ? S.pads.length : -1;
    out.missing = ['padPress', 'drawSeq', 'startSeq', 'morphPattern', 'preVerb', 'euclid', 'makeIR', 'a11yPass']
      .filter(n => typeof window[n] !== 'function');
    out.tabs = [];
    out.nTabs = document.querySelectorAll('#tabs button').length;
    for (const b of document.querySelectorAll('#tabs button')) {
      try { b.click(); await new Promise(r => setTimeout(r, 60));
        if (!document.querySelector('.view.on')) out.tabs.push(b.dataset.v);
      } catch (e) { out.tabs.push(b.dataset.v + ':' + e.message); }
    }
    document.querySelector('#tabs button[data-v="proj"]').click();
    await new Promise(r => setTimeout(r, 200));
    out.svelte = !!document.querySelector('[data-svelte="about"]');
    try { ensureAudio(); startSeq(); await new Promise(r => setTimeout(r, 900));
      out.playing = playing === true && curStepSched > 0; stopSeq();
    } catch (e) { out.playing = false; out.audioErr = e.message; }
    return out;
  });

  if (r.pads !== 64) problems.push('expected 64 pads, got ' + r.pads);
  if (r.missing.length) problems.push('engine functions missing: ' + r.missing.join(', '));
  if (r.tabs.length) problems.push('tabs that failed to open: ' + r.tabs.join(', '));
  if (!r.svelte) problems.push('the Svelte component did not mount');
  if (!r.playing) problems.push('the sequencer did not run' + (r.audioErr ? ' (' + r.audioErr + ')' : ''));
  tabCount = r.nTabs;
  if (!(r.nTabs >= 10)) problems.push('only ' + r.nTabs + ' tabs rendered');
} catch (e) {
  problems.push('smoke test crashed: ' + e.message);
} finally {
  await browser.close(); server.close();
}

if (problems.length) {
  console.error('\nBUILD HELD — the new page did not pass, so index.html was left alone:');
  problems.forEach(p => console.error('  · ' + p));
  console.error('\nThe live app is untouched. The failing build is at index.next.html.\n');
  process.exit(1);
}
console.log('smoke   booted, ' + tabCount + ' tabs, audio ran, Svelte mounted');
promote();
