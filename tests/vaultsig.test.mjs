/* IS THIS THE AUDIO THAT IS ALREADY ON DISK?

   The session vault used to carry every sample inline, so saving "step 4
   is now on" re-encoded and re-wrote a whole six-minute track: 570ms of
   frozen main thread and a fresh 66MB allocation, 1.5 seconds after any
   edit. Audio is stored once now, keyed by its content.

   That makes this the function that decides whether somebody's work comes
   back. If it says "unchanged" about audio that changed, the edit is never
   written and RESTORE hands back the old samples without a word. So the
   tests are about the edits this app actually makes, and about the sweep —
   the one piece of code here that DELETES audio. */

import { test } from 'node:test';
import assert from 'node:assert';
import { chanSig, sigNew, sigFeed, sigHex, wordsOf, audKey, audRefsOf,
  isLightDoc, audUnreferenced } from '../src/pure/vaultsig.js';

const tone = (n, f = 220, sr = 48000) => {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr);
  return d;
};

test('the same audio gives the same signature, so it is written once', () => {
  assert.equal(chanSig(tone(48000)), chanSig(tone(48000)));
});

test('ONE SAMPLE changed is a different signature', () => {
  /* the case a sampled probe misses: an edit smaller than its stride */
  const a = tone(480000), b = tone(480000);
  b[123457] += 1e-4;
  assert.notEqual(chanSig(a), chanSig(b));
});

test('NORMALIZE IN PLACE is seen — the edit that rules out keying by object', () => {
  /* btnNorm multiplies workBuf's own samples and keeps the object. Keyed
     by identity the vault would never have written the result. */
  const d = tone(96000);
  const before = chanSig(d);
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  const k = 0.99 / peak;
  for (let i = 0; i < d.length; i++) d[i] *= k;      // same array, new content
  assert.notEqual(chanSig(d), before);
});

test('it reads order, so reversing or swapping samples is a change', () => {
  const a = tone(4800);
  const b = a.slice().reverse();
  assert.notEqual(chanSig(a), chanSig(b));
  const c = a.slice(); [c[10], c[2000]] = [c[2000], c[10]];
  assert.notEqual(chanSig(a), chanSig(c));
});

test('silence of different lengths does not collide, because the key has the length', () => {
  const a = new Float32Array(1000), b = new Float32Array(2000);
  assert.notEqual(audKey(a.length, chanSig(a)), audKey(b.length, chanSig(b)));
});

test('hashing in slices gives the same answer as hashing at once', () => {
  /* the engine yields between slices so a long channel does not freeze
     the page; that is only safe if the result does not depend on where
     the cuts fall */
  const d = tone(100003);
  const u = wordsOf(d);
  for (const step of [1, 7, 4096, 65536, 100003]) {
    const s = sigNew();
    for (let i = 0; i < u.length; i += step) sigFeed(s, u, i, Math.min(u.length, i + step));
    assert.equal(sigHex(s), chanSig(d), 'slices of ' + step);
  }
});

test('a view into a larger buffer hashes its own samples, not its neighbours', () => {
  /* getChannelData can hand back a view with a byteOffset */
  const big = tone(9000);
  const view = big.subarray(3000, 6000);
  assert.equal(chanSig(view), chanSig(view.slice()));
});

/* ---- which documents point at which audio ---- */

const light = (...keys) => ({ buffers: keys.map(k => ({ sr: 48000, len: 10, aud: [].concat(k) })) });
const inline = () => ({ buffers: [{ sr: 48000, len: 10, ch: [new ArrayBuffer(20)], pk: [1] }] });

test('a light document is told apart from an old inline one', () => {
  assert.equal(isLightDoc(light('aud:10:a')), true);
  assert.equal(isLightDoc(inline()), false);
  assert.equal(isLightDoc({ buffers: [] }), false);
  assert.equal(isLightDoc(null), false);
});

test('refs are read from every buffer and every channel', () => {
  assert.deepEqual(audRefsOf(light(['aud:10:a', 'aud:10:b'], 'aud:10:c')),
    ['aud:10:a', 'aud:10:b', 'aud:10:c']);
  assert.deepEqual(audRefsOf(inline()), []);
});

/* THE SWEEP. Everything below is about what gets deleted. */

test('audio a document still points at is NEVER swept', () => {
  const present = ['aud:10:a', 'aud:10:b', 'vault', 'ck2:1'];
  const gone = audUnreferenced(present, [light('aud:10:a'), light('aud:10:b')]);
  assert.deepEqual(gone, []);
});

test('audio held only by a CHECKPOINT survives the autosave slot moving on', () => {
  /* the session no longer uses it, but REWIND does — deleting it would
     turn a checkpoint into a session with a hole in it */
  const vault = light('aud:10:new'), ckpt = light('aud:10:old');
  assert.deepEqual(audUnreferenced(['aud:10:new', 'aud:10:old'], [vault, ckpt]), []);
});

test('audio nothing points at is swept, and only that', () => {
  const gone = audUnreferenced(['aud:10:a', 'aud:10:orphan', 'vault', 'last', 'proj:x'],
    [light('aud:10:a')]);
  assert.deepEqual(gone, ['aud:10:orphan']);
});

test('it never offers a non-audio key for deletion, whatever it is handed', () => {
  const gone = audUnreferenced(['vault', 'last', 'ckpt:1', 'ck2:2', 'proj:a', 'projIndex', 7, null], []);
  assert.deepEqual(gone, []);
});

test('with no documents at all, nothing is pinned — and it says exactly which', () => {
  assert.deepEqual(audUnreferenced(['aud:1:x', 'vault'], []), ['aud:1:x']);
  assert.deepEqual(audUnreferenced([], [light('aud:1:x')]), []);
  assert.deepEqual(audUnreferenced(null, null), []);
});
