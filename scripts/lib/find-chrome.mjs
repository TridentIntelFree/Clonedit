/* WHERE IS A CHROMIUM, ON WHICHEVER MACHINE THIS IS.
 *
 * Two copies of this question existed and both answered it for Linux.
 * `mcp/server.mjs` looked only at /opt/pw-browsers and /usr/bin, and
 * tests/browser/harness.mjs added exactly one macOS path and no Windows
 * path at all. The repo depends on `playwright-core`, which deliberately
 * ships NO browser binaries — so on a Mac or a Windows machine with
 * Chrome installed and Playwright's browsers never downloaded, the MCP
 * server found nothing, fell through to "let playwright use its own
 * download", and there was none. The whole point of that server is to
 * let somebody's AI drive the app in front of them, and it could not
 * start on either of the two platforms most people have.
 *
 * PLATFORM AND ENV ARE INJECTED, which is the only honest way to write
 * this from a Linux container. Code that picks paths by
 * `process.platform` cannot be tested anywhere but the platform it is
 * picking for, so every branch here takes its platform as an argument
 * and tests/find-chrome.test.mjs exercises all three. The alternative is
 * shipping Windows paths nobody has ever evaluated, which is how the
 * Linux-only versions got written in the first place.
 *
 * It returns CANDIDATES rather than an answer, in the order to try them,
 * because the last two cannot be checked with a stat: a Playwright
 * `channel` is resolved by Playwright's own registry, and the bundled
 * download is whatever `playwright-core` can find. The caller tries each
 * until a launch succeeds and reports which one worked.
 */

import { existsSync } from 'node:fs';
import { posix, win32, join } from 'node:path';

/* THE SEPARATOR IS CHOSEN BY THE TARGET PLATFORM, NOT BY THE HOST.
   `join` from 'node:path' uses whatever the machine it runs on uses, so
   building a Windows path with it on Linux yields
   `C:\Program Files/Google/Chrome/...` -- mixed, and worse, the test
   that checks it cannot see the difference. Picking the variant
   explicitly makes the output identical wherever it is computed, which
   is the whole reason the platform is a parameter. */
const sep = (platform) => (platform === 'win32' ? win32.join : posix.join);

/* Every candidate carries `why` so a failure can say what was looked
   for. "No browser found" is useless; "looked in Program Files and in
   LOCALAPPDATA, and Playwright has no download" is actionable. */
export function chromeCandidates(opt) {
  const o = opt || {};
  const platform = o.platform || process.platform;
  const env = o.env || process.env;
  const home = env.HOME || env.USERPROFILE || '';
  const out = [];

  /* 1. AN EXPLICIT ANSWER ALWAYS WINS. Somebody who set this has a
     reason, and guessing past it is how a tool ends up driving a
     different browser than the one being debugged. */
  if (env.CHROME_PATH) out.push({ executablePath: env.CHROME_PATH, why: 'CHROME_PATH' });

  /* 2. Playwright's own download location, when it has been pointed
     somewhere specific. The container this repo is developed in sets
     exactly this. */
  if (env.PLAYWRIGHT_BROWSERS_PATH) {
    out.push({ executablePath: sep(platform)(env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
      why: 'PLAYWRIGHT_BROWSERS_PATH' });
  }

  if (platform === 'darwin') {
    /* The system install first, then a per-user one — a Mac without
       admin rights puts apps in ~/Applications and the system path
       simply is not there. Edge and Brave are Chromium underneath and
       drive identically; a person who has one of those and not Chrome
       should not be told to install a browser. */
    out.push(
      { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        why: 'Chrome in /Applications' },
      { executablePath: posix.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        why: 'Chrome in ~/Applications' },
      { executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        why: 'Edge in /Applications' },
      { executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        why: 'Chromium in /Applications' },
      { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        why: 'Brave in /Applications' },
    );
  } else if (platform === 'win32') {
    /* THREE ROOTS, and all three are needed. A 64-bit Chrome lands in
       Program Files, a 32-bit one in Program Files (x86), and a
       per-user install — which is what you get without admin rights,
       and therefore what a work laptop usually has — lands in
       LOCALAPPDATA. Reading them from the environment rather than
       hardcoding C:\\ because a machine whose system drive is not C is
       unusual and not rare. */
    const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter(Boolean);
    for (const r of roots) {
      out.push({ executablePath: win32.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        why: 'Chrome in ' + r });
    }
    for (const r of roots) {
      out.push({ executablePath: win32.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        why: 'Edge in ' + r });
    }
  } else {
    out.push(
      { executablePath: '/opt/pw-browsers/chromium', why: 'playwright in /opt' },
      { executablePath: '/usr/bin/chromium', why: 'chromium' },
      { executablePath: '/usr/bin/chromium-browser', why: 'chromium-browser' },
      { executablePath: '/usr/bin/google-chrome', why: 'google-chrome' },
      { executablePath: '/usr/bin/google-chrome-stable', why: 'google-chrome-stable' },
      { executablePath: '/snap/bin/chromium', why: 'chromium from snap' },
      { executablePath: '/usr/bin/microsoft-edge', why: 'edge' },
    );
  }

  /* 3. PLAYWRIGHT'S CHANNELS, which resolve a system install through its
     own registry on every platform. These cannot be stat-ed, so they go
     after the paths — a path that exists is a faster and more certain
     answer than a launch that might throw — but before the bundled
     download, because a browser the person already has beats 150MB of
     download they did not ask for. */
  out.push({ channel: 'chrome', why: 'system Chrome, via Playwright' });
  out.push({ channel: 'msedge', why: 'system Edge, via Playwright' });

  /* 4. Whatever playwright-core can find on its own. Empty options means
     "your default", which is the bundled download when one exists. */
  out.push({ why: "Playwright's own download" });
  return out;
}

/* The first candidate that is a file on disk, or null. Channels and the
   bundled download are not paths, so they are not pickable here — a
   caller that wants them has to try launching. */
export function pickChrome(opt) {
  for (const c of chromeCandidates(opt)) {
    if (c.executablePath && existsSync(c.executablePath)) return c;
  }
  return null;
}

/* WHAT TO TELL SOMEBODY WHO HAS NO BROWSER. Names the platform, what was
   looked for, and the one command that fixes it. */
export function noBrowserMessage(opt) {
  const o = opt || {};
  const platform = o.platform || process.platform;
  const looked = chromeCandidates(o).filter(c => c.executablePath)
    .map(c => c.why);
  const name = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux';
  return 'No Chromium-based browser found on this ' + name + ' machine. Looked for: '
    + looked.join(', ') + '. Either install Google Chrome or Microsoft Edge, or run '
    + '`npx playwright install chromium` to fetch one, or set CHROME_PATH to a '
    + 'browser you already have.';
}

/* IS THERE A SCREEN TO PUT A WINDOW ON. macOS and Windows always have
   one; a Linux box might be a server, a container or a CI runner, where
   a headful launch fails outright. Checked rather than assumed, because
   defaulting to headless everywhere is what made the MCP server
   invisible and defaulting to headful everywhere would break CI. */
export function hasDisplay(opt) {
  const o = opt || {};
  const platform = o.platform || process.platform;
  const env = o.env || process.env;
  if (platform === 'darwin' || platform === 'win32') return true;
  return !!(env.DISPLAY || env.WAYLAND_DISPLAY);
}
