import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, installSteps, isInstalled } from '../src/pure/install.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/470.0]',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
};

test('every iOS browser is Safari underneath, so none of them can prompt', () => {
  for (const k of ['iphoneSafari', 'iphoneChrome', 'ipad']) {
    const p = detectPlatform(UA[k]);
    assert.equal(p.id, 'ios', k);
    assert.equal(p.prompts, false, k + ' must not claim it can prompt');
  }
});

test('Android Chrome can prompt; Android Firefox cannot', () => {
  assert.deepEqual(detectPlatform(UA.androidChrome), { id: 'android', prompts: true, inApp: false });
  assert.equal(detectPlatform(UA.androidFirefox).prompts, false);
});

test('desktop Chrome can prompt; desktop Firefox and Safari cannot', () => {
  assert.equal(detectPlatform(UA.desktopChrome).prompts, true);
  assert.equal(detectPlatform(UA.desktopFirefox).id, 'firefox');
  assert.equal(detectPlatform(UA.desktopFirefox).prompts, false);
  assert.equal(detectPlatform(UA.macSafari).id, 'mac-safari');
  assert.equal(detectPlatform(UA.macSafari).prompts, false);
});

test('an in-app browser is called out — it has no Share menu to reach', () => {
  const p = detectPlatform(UA.iphoneFacebook);
  assert.equal(p.id, 'ios');
  assert.equal(p.inApp, true);
  assert.match(installSteps(p)[0], /Safari/);
});

test('every platform gets usable words, never an empty panel', () => {
  for (const k of Object.keys(UA)) {
    const steps = installSteps(detectPlatform(UA[k]));
    assert.ok(steps.length > 0, k);
    assert.ok(steps.every(s => typeof s === 'string' && s.length > 12), k + ': ' + JSON.stringify(steps));
  }
  assert.ok(installSteps(detectPlatform('')).length > 0, 'unknown UA still gets guidance');
});

test('iOS gets the Share → Add to Home Screen route, since nothing else will tell them', () => {
  const steps = installSteps(detectPlatform(UA.iphoneSafari));
  assert.match(steps.join(' '), /Share/);
  assert.match(steps.join(' '), /Add to Home Screen/);
});

test('an already-installed app reports itself, and a plain tab does not', () => {
  assert.equal(isInstalled({ navigator: { standalone: true }, matchMedia: () => ({ matches: false }) }), true);
  assert.equal(isInstalled({ navigator: {}, matchMedia: q => ({ matches: q.includes('standalone') }) }), true);
  assert.equal(isInstalled({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isInstalled({}), false, 'a browser without matchMedia must not throw');
});
