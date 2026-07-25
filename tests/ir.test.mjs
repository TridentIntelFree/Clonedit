import { test } from 'node:test';
import assert from 'node:assert/strict';
import { irDur } from '../src/pure/ir.js';

test('each space overrides the length you ask for', () => {
  assert.equal(irDur(6, 'room'), 1.2, 'a room that rings for six seconds is not a room');
  assert.equal(irDur(0.3, 'gated'), 0.55, 'gated is a fixed shape');
  assert.equal(irDur(6, 'gated'), 0.55);
  assert.equal(irDur(6, 'spring'), 2.2);
  assert.equal(irDur(1, 'cath'), 4.5, 'a cathedral needs room to be one');
  assert.equal(irDur(6, 'cath'), 6, 'but it can be bigger');
});

test('hall honours the slider', () => {
  for (const s of [0.5, 1.5, 3, 6]) assert.equal(irDur(s, 'hall'), s);
});

test('nothing is ever shorter than a click', () => {
  for (const t of ['hall', 'room', 'plate', 'spring', 'cath', 'gated'])
    for (const s of [0, -5, 0.01, undefined, null])
      assert.ok(irDur(s, t) >= 0.25, `${t} at ${s} -> ${irDur(s, t)}`);
});

test('an unknown space behaves like a hall', () => {
  assert.equal(irDur(2.5, 'nonsense'), irDur(2.5, 'hall'));
  assert.equal(irDur(2.5, undefined), irDur(2.5, 'hall'));
});
