import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, posMod, clampBpm, mulberry32 } from '../src/pure/math.js';

test('clamp holds the bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('posMod wraps negatives forward — the sequencer runs backwards', () => {
  assert.equal(posMod(-1, 16), 15, 'step -1 must be the LAST step, not -1');
  assert.equal(posMod(-17, 16), 15);
  assert.equal(posMod(0, 16), 0);
  assert.equal(posMod(16, 16), 0);
  for (let n = -64; n <= 64; n++) {
    const r = posMod(n, 16);
    assert.ok(r >= 0 && r < 16, `${n} -> ${r}`);
  }
});

test('clampBpm keeps the sign — negative BPM means backwards, not silent', () => {
  assert.equal(clampBpm(120), 120);
  assert.equal(clampBpm(-120), -120);
  assert.equal(clampBpm(0), 1, 'zero would stop the clock');
  assert.equal(clampBpm(-0.2), -1);
  assert.equal(clampBpm(5000), 999);
  assert.equal(clampBpm(-5000), -999);
});

test('mulberry32 is deterministic and stays in [0,1)', () => {
  // impulse responses and the SCATTER morph order come from this, so an
  // unstable PRNG would make a bounce differ from what was heard
  const a = mulberry32(908), b = mulberry32(908), c = mulberry32(909);
  const seqA = [], seqB = [], seqC = [];
  for (let i = 0; i < 500; i++) { seqA.push(a()); seqB.push(b()); seqC.push(c()); }
  assert.deepEqual(seqA, seqB, 'same seed must give the same stream');
  assert.notDeepEqual(seqA, seqC, 'adjacent seeds must not collide');
  assert.ok(seqA.every(v => v >= 0 && v < 1));
  const mean = seqA.reduce((x, y) => x + y, 0) / seqA.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, 'mean ' + mean);
});
