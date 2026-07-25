import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morphPattern, morphRanker } from '../src/pure/morph.js';
import { newPattern, patLen, trackLen } from '../src/pure/pattern.js';

const mk = (len, track0) => { const p = newPattern(len); track0.forEach(i => (p.steps[0][i] = 0.9)); return p; };
const row = (p, n = 16) => p.steps[0].slice(0, n).map(v => v > 0 ? 'x' : '.').join('');

const A = () => mk(16, [0, 4, 8, 12]);            // four on the floor
const B = () => { const p = mk(16, [2, 6, 10, 14]); p.steps[0][15] = 0.5; return p; };

test('the endpoints are the patterns themselves, by reference', () => {
  const a = A(), b = B();
  // this matters: an arrived morph has to carry B's own length and polymeter,
  // which a blended copy cannot
  assert.equal(morphPattern(a, b, 0, 'weight', false), a);
  assert.equal(morphPattern(a, b, 1, 'weight', false), b);
  assert.equal(morphPattern(a, b, -0.5, 'weight', false), a);
  assert.equal(morphPattern(a, b, 9, 'weight', false), b);
});

test('a cell never flips back once it has crossed', () => {
  const a = A(), b = B();
  for (const curve of ['weight', 'strong', 'sweep', 'scatter', 'track']) {
    const crossed = new Array(16).fill(false);
    for (let k = 1; k < 40; k++) {
      const r = row(morphPattern(a, b, k / 40, curve, false));
      for (let i = 0; i < 16; i++) {
        const isB = r[i] === row(b)[i];
        if (crossed[i]) assert.ok(isB, `${curve}: step ${i} reverted at t=${k / 40}`);
        else if (isB && row(a)[i] !== row(b)[i]) crossed[i] = true;
      }
    }
  }
});

test('metric order changes the offbeats before the downbeat', () => {
  const a = A(), b = B();
  const arrival = i => {
    for (let k = 1; k <= 40; k++) if (row(morphPattern(a, b, k / 40, 'weight', false))[i] === row(b)[i]) return k / 40;
    return 1;
  };
  // step 15 is an odd step (weakest); step 2 is an 8th; step 0 is the downbeat
  assert.ok(arrival(15) < arrival(2), `15 crossed at ${arrival(15)}, 2 at ${arrival(2)}`);
  assert.ok(arrival(2) < arrival(4), `2 crossed at ${arrival(2)}, 4 at ${arrival(4)}`);
});

test('strong order inverts that', () => {
  const a = A(), b = B();
  const arrival = (i, c) => {
    for (let k = 1; k <= 40; k++) if (row(morphPattern(a, b, k / 40, c, false))[i] === row(b)[i]) return k / 40;
    return 1;
  };
  assert.ok(arrival(2, 'strong') < arrival(15, 'strong'));
});

test('sweep crosses strictly left to right', () => {
  const a = A(), b = B();
  for (let k = 1; k < 16; k++) {
    const got = row(morphPattern(a, b, k / 16, 'sweep', false));
    assert.equal(got, row(b).slice(0, k) + row(a).slice(k), `at t=${k}/16`);
  }
});

test('scatter is shuffled but identical every time', () => {
  const a = A(), b = B();
  const once = row(morphPattern(a, b, 0.5, 'scatter', false));
  for (let i = 0; i < 5; i++) assert.equal(row(morphPattern(A(), B(), 0.5, 'scatter', false)), once);
  assert.notEqual(once, row(morphPattern(a, b, 0.5, 'sweep', false)), 'should differ from a wipe');
});

test('velocity rides across where both patterns hit', () => {
  const a = newPattern(16), b = newPattern(16);
  a.steps[0][0] = 0.9; b.steps[0][0] = 0.4;
  assert.equal(morphPattern(a, b, 0.5, 'sweep', true).steps[0][0], 0.65);
  // with blending off the cell simply belongs to one side or the other
  const off = morphPattern(a, b, 0.5, 'sweep', false).steps[0][0];
  assert.ok(off === 0.9 || off === 0.4, `got ${off}`);
});

test('a shorter B tiles into a longer A, and A keeps its shape', () => {
  const a = newPattern(32), b = newPattern(16);
  for (let i = 0; i < 32; i += 8) a.steps[0][i] = 0.9;
  b.steps[0][3] = 0.7;
  const m = morphPattern(a, b, 0.99, 'sweep', false);
  assert.equal(patLen(m), 32);
  assert.equal(trackLen(m, 0), 32);
  assert.equal(row(m, 32), '...x' + '.'.repeat(15) + 'x' + '.'.repeat(12));
});

test('the ranker covers every cell exactly once, in [0,1)', () => {
  for (const curve of ['weight', 'strong', 'sweep']) {
    const rank = morphRanker(curve, 16, [0]);
    const seen = new Set();
    for (let st = 0; st < 16; st++) {
      const r = rank(0, st);
      assert.ok(r >= 0 && r < 1, `${curve} step ${st} ranked ${r}`);
      seen.add(r);
    }
    assert.equal(seen.size, 16, `${curve} produced duplicate ranks`);
  }
});

test('a missing pattern does not throw', () => {
  assert.equal(morphPattern(null, null, 0.5, 'weight', false), null);
  const a = A();
  assert.equal(morphPattern(a, null, 0.5, 'weight', false), a);
});
