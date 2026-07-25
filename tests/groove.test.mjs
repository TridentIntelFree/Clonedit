import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROOVES } from '../src/pure/groove.js';

const ids = Object.keys(GROOVES);

test('every groove has a full bar of timing and velocity', () => {
  for (const id of ids) {
    const g = GROOVES[id];
    assert.ok(g.name, id + ' has no name');
    assert.equal(g.t.length, 16, id + ' timing table is not 16 long');
    assert.equal(g.v.length, 16, id + ' velocity table is not 16 long');
  }
});

test('timing offsets stay inside a step, and velocities stay sane', () => {
  for (const id of ids) {
    const g = GROOVES[id];
    // a nudge of a whole step would reorder the bar rather than shift the feel
    assert.ok(g.t.every(v => Math.abs(v) < 0.5), id + ' nudges a step too far: ' + g.t.join(','));
    assert.ok(g.v.every(v => v > 0 && v <= 1), id + ' has a silent or boosted step: ' + g.v.join(','));
  }
});

test('STRAIGHT really is neutral', () => {
  assert.ok(GROOVES.straight.t.every(v => v === 0));
  assert.ok(GROOVES.straight.v.every(v => v === 1));
});

test('swing pushes only the offbeats, and harder as the percentage rises', () => {
  const swings = ['mpc54', 'mpc58', 'mpc62', 'mpc66'];
  let last = 0;
  for (const id of swings) {
    const g = GROOVES[id];
    for (let i = 0; i < 16; i += 2) assert.equal(g.t[i], 0, id + ' moved a downbeat');
    assert.ok(g.t[1] > last, id + ' should swing harder than the one before');
    last = g.t[1];
    assert.ok(g.t.filter((_, i) => i % 2 === 1).every(v => v === g.t[1]), id + ' is uneven');
  }
});

test('the off-grid feel is deliberately uneven, unlike swing', () => {
  const t = GROOVES.dilla.t;
  const odd = new Set(t.filter((_, i) => i % 2 === 1));
  assert.ok(odd.size > 1, 'off-grid should not be a uniform swing');
  assert.ok(t.some(v => v < 0), 'something should sit ahead of the beat');
});

test('no groove carries a third-party name', () => {
  // R91 removed these from the UI; keep them out
  for (const id of ids)
    assert.ok(!/mpc|dilla|akai|roland/i.test(GROOVES[id].name), GROOVES[id].name);
});
