import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euclid } from '../src/pure/euclid.js';

const hits = p => p.filter(Boolean).length;
const show = p => p.map(v => v ? 'x' : '.').join('');

/* The gaps between consecutive hits (wrapping) must differ by at most one.
   That IS maximal evenness — it is the whole property the algorithm exists for,
   and it is what makes these patterns sound like rhythm instead of arithmetic. */
function gaps(p) {
  const idx = p.map((v, i) => v ? i : -1).filter(i => i >= 0);
  return idx.map((v, i) => (i + 1 < idx.length ? idx[i + 1] : idx[0] + p.length) - v);
}

test('places exactly the requested number of hits', () => {
  for (let steps = 1; steps <= 32; steps++)
    for (let h = 0; h <= steps; h++)
      assert.equal(hits(euclid(h, steps, 0)), h, `${h} in ${steps}`);
});

test('is maximally even for every combination up to 32 steps', () => {
  for (let steps = 2; steps <= 32; steps++) {
    for (let h = 1; h < steps; h++) {
      const g = gaps(euclid(h, steps, 0));
      assert.ok(Math.max(...g) - Math.min(...g) <= 1,
        `${h} in ${steps} gave uneven gaps ${g.join(',')} → ${show(euclid(h, steps, 0))}`);
    }
  }
});

test('always starts on the downbeat', () => {
  // "1 in 4" landing on the last step instead of step 0 is the wrong bar
  for (let steps = 2; steps <= 32; steps++)
    for (let h = 1; h <= steps; h++)
      assert.equal(euclid(h, steps, 0)[0], true, `${h} in ${steps} missed step 0`);
});

test('produces the named rhythms', () => {
  assert.equal(show(euclid(3, 8, 0)), 'x..x..x.', 'tresillo');
  assert.equal(show(euclid(4, 16, 0)), 'x...x...x...x...', 'four on the floor');
  assert.equal(show(euclid(1, 4, 0)), 'x...');
});

/* Written-out clave and cinquillo start on their traditional phase, which is
   not always a hit on step 0. This implementation deliberately phases every
   pattern so step 0 IS a hit — otherwise "1 in 4" would land on the last step
   — so the right assertion is that it produces the same CYCLE, not the same
   string. A rotation of a rhythm is the same rhythm. */
const isRotationOf = (got, want) =>
  [...want].some((_, r) => want.slice(r) + want.slice(0, r) === got);

test('matches the traditional rhythms up to rotation', () => {
  assert.ok(isRotationOf(show(euclid(5, 8, 0)), 'x.xx.xx.'), 'cinquillo: ' + show(euclid(5, 8, 0)));
  assert.ok(isRotationOf(show(euclid(7, 12, 0)), 'x.xx.x.xx.x.'), 'West African bell: ' + show(euclid(7, 12, 0)));
  assert.ok(isRotationOf(show(euclid(4, 16, 0)), 'x...x...x...x...'), 'four on the floor');
});

test('son clave is NOT euclidean, and the preset that claims 5-in-16 is bossa', () => {
  // Worth pinning down, because it is easy to assume every named clave falls
  // out of this algorithm. Traditional son clave has gaps 3,3,4,2,4 — not
  // maximally even, so no (hits, steps) pair produces it. E(5,16) is the
  // 4,3,3,3,3 pattern Toussaint names bossa nova, which is what the preset
  // labelled "Son clave" was actually playing.
  const sonClave = 'x..x..x...x.x...';
  const g = gaps([...sonClave].map(c => c === 'x'));
  assert.ok(Math.max(...g) - Math.min(...g) > 1, 'son clave should not be maximally even');
  assert.ok(!isRotationOf(show(euclid(5, 16, 0)), sonClave));
  assert.deepEqual(gaps(euclid(5, 16, 0)).sort(), [3, 3, 3, 3, 4], 'E(5,16) is the bossa distribution');
});

test('rotation shifts without changing the hit count', () => {
  const base = euclid(5, 16, 0);
  for (let r = 1; r < 16; r++) {
    const rot = euclid(5, 16, r);
    assert.equal(hits(rot), hits(base));
    assert.deepEqual(rot, base.slice(r).concat(base.slice(0, r)));
  }
});

test('rotation wraps in both directions and a full turn is a no-op', () => {
  assert.deepEqual(euclid(5, 16, 16), euclid(5, 16, 0));
  assert.deepEqual(euclid(5, 16, -3), euclid(5, 16, 13));
});

test('degenerate input cannot produce a broken pattern', () => {
  assert.deepEqual(euclid(0, 8, 0), new Array(8).fill(false));
  assert.deepEqual(euclid(8, 8, 0), new Array(8).fill(true));
  assert.deepEqual(euclid(99, 8, 0), new Array(8).fill(true), 'more hits than steps');
  assert.equal(euclid(3, 0, 0).length, 1, 'zero steps must not yield an empty pattern');
  assert.equal(euclid(-4, 8, 0).filter(Boolean).length, 0, 'negative hits');
});
