/* PATHS FOR PLATFORMS THIS CANNOT RUN ON.
 *
 * Two copies of browser discovery existed in this repo and both answered
 * the question for Linux only — because they were written in a Linux
 * container, where a Windows path can be typed but never evaluated. That
 * is how the MCP server came to be unable to start on either of the two
 * platforms most people have, while every test passed.
 *
 * So the resolver takes its platform and environment as arguments, and
 * these exercise all three. It is not the same as running on a Mac, and
 * it is the difference between paths that were reasoned about and paths
 * nobody ever looked at.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { chromeCandidates, pickChrome, noBrowserMessage, hasDisplay }
  from '../scripts/lib/find-chrome.mjs';

const paths = (o) => chromeCandidates(o).filter(c => c.executablePath)
  .map(c => c.executablePath);

test('macOS looks in /Applications AND in the user\u2019s own', () => {
  const p = paths({ platform: 'darwin', env: { HOME: '/Users/sam' } });
  assert.ok(p.some(x => x === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    'the system Chrome path is wrong: ' + p.join(' | '));
  /* a Mac without admin rights installs to ~/Applications and the
     system path simply is not there */
  assert.ok(p.some(x => x === '/Users/sam/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    'no per-user Chrome path');
  /* Edge and Brave are Chromium underneath; somebody who has one of
     those and not Chrome should not be told to install a browser */
  assert.ok(p.some(x => /Microsoft Edge$/.test(x)), 'no Edge');
  assert.ok(p.some(x => /Brave Browser$/.test(x)), 'no Brave');
  /* and nothing Linux-shaped should be in there */
  assert.ok(!p.some(x => x.startsWith('/usr/bin')), 'Linux paths leaked into macOS');
});

test('WINDOWS LOOKS IN ALL THREE ROOTS, which is the one that was missing', () => {
  /* 64-bit Chrome lands in Program Files, 32-bit in Program Files (x86),
     and a per-user install — what you get without admin rights, so what
     a work laptop usually has — in LOCALAPPDATA. Missing the third is
     missing the commonest case. */
  const env = {
    'PROGRAMFILES': 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\sam',
  };
  const p = paths({ platform: 'win32', env });
  /* BACKSLASHES, computed on a Linux host. `join` from 'node:path' uses
     the HOST's separator, so the first version of this built
     `C:\\Program Files/Google/...` and this test could not tell. The
     resolver picks path.win32 explicitly for this branch, which is what
     makes the assertion below mean anything. */
  assert.ok(p.every(x => !x.includes('/')),
    'a forward slash in a Windows path: ' + p.find(x => x.includes('/')));
  for (const root of Object.values(env).slice(0, 3)) {
    assert.ok(p.some(x => x.startsWith(root) && /chrome\.exe$/.test(x)),
      'no Chrome under ' + root + ': ' + p.join(' | '));
  }
  assert.ok(p.some(x => /msedge\.exe$/.test(x)), 'no Edge on Windows');
  assert.ok(!p.some(x => x.startsWith('/')), 'a unix path leaked into Windows');
});

test('a Windows machine whose system drive is not C still works', () => {
  /* read from the environment rather than hardcoded, because a machine
     that boots from D is unusual and not rare */
  const p = paths({ platform: 'win32',
    env: { 'PROGRAMFILES': 'D:\\Program Files', LOCALAPPDATA: 'D:\\Users\\k\\AppData\\Local' } });
  assert.ok(p.every(x => x.startsWith('D:')), p.join(' | '));
  assert.ok(p.length >= 4, 'only ' + p.length + ' candidates');
});

test('Linux keeps every path it had, and gains the ones it was missing', () => {
  const p = paths({ platform: 'linux', env: {} });
  for (const had of ['/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/opt/pw-browsers/chromium']) {
    assert.ok(p.includes(had), 'lost ' + had);
  }
  /* a snap install is the default on recent Ubuntu and was in neither
     of the two versions this replaces */
  assert.ok(p.includes('/snap/bin/chromium'), 'no snap path');
});

test('AN EXPLICIT ANSWER ALWAYS WINS, on every platform', () => {
  /* somebody who set this has a reason, and guessing past it is how a
     tool drives a different browser than the one being debugged */
  for (const platform of ['darwin', 'win32', 'linux']) {
    const c = chromeCandidates({ platform, env: { CHROME_PATH: '/my/own/chrome' } });
    assert.equal(c[0].executablePath, '/my/own/chrome', platform + ' ignored CHROME_PATH');
    assert.match(c[0].why, /CHROME_PATH/);
  }
});

test('the channels and the bundled download come last, and in that order', () => {
  /* a path that exists is faster and more certain than a launch that
     might throw, and a browser the person already has beats 150MB of
     download they did not ask for */
  for (const platform of ['darwin', 'win32', 'linux']) {
    const c = chromeCandidates({ platform, env: {} });
    const firstChannel = c.findIndex(x => x.channel);
    const lastPath = c.reduce((a, x, i) => (x.executablePath ? i : a), -1);
    assert.ok(firstChannel > lastPath,
      platform + ': a channel is tried before a real path');
    assert.equal(c[c.length - 1].executablePath, undefined,
      platform + ': the bundled download is not last');
    assert.equal(c[c.length - 1].channel, undefined);
    assert.deepEqual(c.filter(x => x.channel).map(x => x.channel), ['chrome', 'msedge']);
  }
});

test('every candidate says what it is, so a failure can name what it looked for', () => {
  /* "no browser found" is useless; naming the places is actionable */
  for (const platform of ['darwin', 'win32', 'linux']) {
    for (const c of chromeCandidates({ platform, env: {} })) {
      assert.ok(c.why && c.why.length > 3, platform + ': a candidate with no reason');
    }
  }
});

test('the no-browser message names the platform and the way out', () => {
  const win = noBrowserMessage({ platform: 'win32',
    env: { 'PROGRAMFILES': 'C:\\Program Files' } });
  assert.match(win, /Windows/);
  assert.match(win, /playwright install chromium/);
  assert.match(win, /CHROME_PATH/);
  assert.match(win, /Chrome or Microsoft Edge/);
  assert.match(noBrowserMessage({ platform: 'darwin', env: {} }), /macOS/);
  assert.match(noBrowserMessage({ platform: 'linux', env: {} }), /Linux/);
});

test('A SCREEN IS ASSUMED ON MAC AND WINDOWS AND CHECKED ON LINUX', () => {
  /* defaulting to headless everywhere is what made the MCP server
     invisible; defaulting to headful everywhere would break CI and this
     very container, which has no display at all */
  assert.equal(hasDisplay({ platform: 'darwin', env: {} }), true);
  assert.equal(hasDisplay({ platform: 'win32', env: {} }), true);
  assert.equal(hasDisplay({ platform: 'linux', env: {} }), false);
  assert.equal(hasDisplay({ platform: 'linux', env: { DISPLAY: ':0' } }), true);
  assert.equal(hasDisplay({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } }), true);
});

test('and on THIS machine it finds the browser the tests already use', () => {
  /* the one assertion that is not a simulation: whatever platform this
     is, the resolver has to agree with reality */
  const hit = pickChrome();
  assert.ok(hit, 'found no browser here, but the browser suites run: '
    + noBrowserMessage());
  assert.ok(hit.executablePath.length > 1);
});
