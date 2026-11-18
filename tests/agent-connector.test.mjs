/* The one-file connector and the tracks folder, without a browser.

   tests/browser/agent-connector.test.mjs runs the whole thing end to end.
   This is the part that can be checked in milliseconds: that the committed
   file is the one its source builds, that it imports nothing it did not
   bundle, and that no name an agent can think of reaches outside the folder. */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { safeName, makeTracks, parseWav, wavToMp3 } from '../mcp/tools.mjs';
import { bundleAgent } from '../scripts/build-agent.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the committed connector is exactly what its source builds', async () => {
  const want = await bundleAgent();
  const have = readFileSync(resolve(ROOT, 'agent', 'jbh88-agent.mjs'), 'utf8');
  assert.ok(have === want, 'agent/jbh88-agent.mjs is stale \u2014 run node scripts/build-agent.mjs');
});

test('it imports nothing but Node itself, so there is nothing to install', () => {
  const js = readFileSync(resolve(ROOT, 'agent', 'jbh88-agent.mjs'), 'utf8');
  const specs = [...js.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)].map(m => m[1])
    .concat([...js.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]))
    .concat([...js.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]));
  const foreign = specs.filter(s => !s.startsWith('node:'));
  assert.deepStrictEqual(foreign, [], 'the connector needs packages it did not bundle: ' + foreign.join(', '));
  assert.ok(js.startsWith('#!/usr/bin/env node\n'), 'the hashbang must be the first line');
});

test('a name never becomes a path', () => {
  const cases = {
    '../../etc/passwd': 'passwd',
    '/Users/me/Desktop/song.wav': 'song.wav',
    'C:\\Windows\\System32\\x': 'x',
    '..': 'untitled',
    '.hidden': 'hidden',
    'con': 'untitled',
    'a/b\\c': 'c',
    'first light': 'first light',
    'Café del Mar (mix)': 'Café del Mar (mix)',
    'semi;colon|pipe>redirect': 'semicolonpiperedirect',
    '': 'untitled',
  };
  for (const [inp, out] of Object.entries(cases)) assert.strictEqual(safeName(inp), out, inp);
  assert.strictEqual(safeName('song.mp3', 'mp3'), 'song.mp3');
  assert.strictEqual(safeName('song', 'json'), 'song.json');
  assert.ok(safeName('x'.repeat(500)).length <= 80);
});

test('the tracks folder holds every read and write inside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-tracks-'));
  try {
    const T = makeTracks(join(dir, 'tracks'));
    const w = T.write('../../escape.json', '{}');
    assert.strictEqual(w.path, join(dir, 'tracks', 'escape.json'));
    assert.ok(!existsSync(join(dir, 'escape.json')));
    assert.throws(() => T.fromUri('file:///etc/passwd'), /outside the tracks folder/);
    assert.throws(() => T.fromUri('file://' + join(dir, 'tracks', 'sub', 'x.json')), /outside/);
    assert.strictEqual(T.fromUri(w.uri), 'escape.json');
    assert.throws(() => T.read('nope.json'), /no "nope.json" in the tracks folder/);
    /* a sibling whose name starts with the folder's is not inside it */
    assert.throws(() => T.fromUri('file://' + join(dir, 'tracks-private', 'x.json')), /outside/);
    /* the -2 is chosen across all of a save's formats at once */
    T.write('song.mp3', 'x');
    assert.strictEqual(T.stem('song', ['mp3', 'json'], false), 'song-2');
    assert.strictEqual(T.stem('song', ['wav'], false), 'song');
    assert.strictEqual(T.stem('song', ['mp3'], true), 'song');
    assert.deepStrictEqual(T.list().map(f => f.file).sort(), ['escape.json', 'song.mp3']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a WAV the app writes becomes an MP3', async () => {
  const rate = 44100, n = rate;           // one second of stereo 16-bit
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(i / 20) * 9000);
    b.writeInt16LE(v, 44 + i * 4); b.writeInt16LE(-v, 46 + i * 4); }
  const w = parseWav(b);
  assert.strictEqual(w.rate, rate); assert.strictEqual(w.L.length, n);
  assert.strictEqual(w.R[100], -w.L[100]);
  const mp3 = await wavToMp3(b, 128);
  assert.ok(mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0, 'MPEG frame sync');
  /* 128 kbps for one second is 16 KB, give or take a frame */
  assert.ok(mp3.length > 14000 && mp3.length < 19000, mp3.length + ' bytes');
});
