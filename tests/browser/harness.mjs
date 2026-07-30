/* Shared plumbing for the browser tests.

   These tests exist because almost nothing in this app can be verified without
   a browser in it. The engine is one 11,000-line classic script talking to Web
   Audio, Web MIDI and IndexedDB; the pure helpers under src/pure/ are unit
   tested by `npm test`, but they are about 3% of the code. Everything else —
   whether a step that is not shown can be heard, whether a bounce is
   repeatable, whether a project from a future build is refused — is only true
   or false inside a running page.

   The browser resolution and the static server are the same ones scripts/
   smoke.mjs uses, factored out so there is one answer to "which Chromium" and
   one answer to "how is the app served". */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, normalize } from 'node:path';
import { createServer } from 'node:http';

export const ROOT = resolve(import.meta.dirname, '..', '..');

/* Ordered by how deliberate the choice is: an explicit CHROME_PATH beats the
   sandbox's preinstalled copy, which beats a `playwright install` download,
   which beats whatever the distro happens to ship.

   The playwright-core lookup matters for CI, where `npx playwright install`
   puts Chromium under ~/.cache/ms-playwright in a versioned directory that no
   fixed path can name. It is asked last among the deliberate options and
   wrapped, because on a machine with no download it throws rather than
   returning nothing. */
export async function findBrowser() {
  const fixed = [
    process.env.CHROME_PATH,
    resolve(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium'),
  ].filter(Boolean);
  const isFile = p => { try { return statSync(p).isFile(); } catch { return false; } };
  const hit = fixed.find(isFile);
  if (hit) return hit;
  try {
    const { chromium } = await import('playwright-core');
    const p = chromium.executablePath();
    if (p && isFile(p)) return p;
  } catch {}
  return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(isFile);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json' };

export async function serve(root = ROOT) {
  const server = createServer((req, res) => {
    const p = resolve(root, '.' + normalize(decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: 'http://127.0.0.1:' + server.address().port, close: () => server.close() };
}

/* A page with the app booted and settled.

   The tour and the install prompt are dismissed before the first line of app
   code runs, because both cover the UI and neither is what any of these tests
   is about. `initScript` lets a test install its own fakes in that same
   window — the MIDI suite uses it to put a fake Web MIDI device in place
   before the app can look for one. */
export async function boot(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 430, height: 932 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('jbh_tour_v1', 'done'); localStorage.setItem('jbh_install_dismissed', '1'); } catch {}
  });
  if (opts.initScript) await ctx.addInitScript(opts.initScript);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/' + (opts.file || 'index.html'), { timeout: 40000 });
  /* Wait for the app to say it is ready, not merely for load. Boot decides
     whether to restore a session or build the demo song, and the demo takes a
     couple of seconds to render — a test that starts editing before that
     finishes is racing the app, which is a real bug this suite has already
     caught once. */
  await page.waitForFunction(() => {
    const l = document.getElementById('lcdmsg');
    return l && /Amber|READY|SESSION/.test(l.textContent);
  }, null, { timeout: 45000 });
  if (opts.audio !== false) {
    await page.evaluate(async () => { ensureAudio(); await new Promise(r => setTimeout(r, 600)); });
  }
  return { ctx, page, errors };
}

/* A test collects assertions and returns them. Deliberately not a framework:
   each check carries the measurement that produced it, so a failure reads as
   evidence rather than as "expected true, got false". */
export function checker() {
  const lines = [], failures = [];
  const t = {
    note: s => { lines.push(s); },
    head: s => { lines.push((lines.length ? '\n' : '') + s); },
    ok(name, pass, detail = '') {
      lines.push('  ' + (pass ? '✓ ' : '✗ ') + name + (detail ? '  ' + detail : ''));
      if (!pass) failures.push(name + (detail ? ' — ' + detail : ''));
      return pass;
    },
    near(name, got, want, tol, unit = '') {
      const d = Math.abs(got - want);
      return t.ok(name, d <= tol,
        got.toFixed(3) + unit + ' vs ' + want.toFixed(3) + unit + ' (±' + tol + ')');
    },
    get lines() { return lines; },
    get failures() { return failures; },
  };
  return t;
}
