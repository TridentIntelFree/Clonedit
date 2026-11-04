/* A recipe is slots; a slot is a brief; a brief can be checked. */
import { test } from 'node:test';
import assert from 'node:assert';
import { ROLES, fitSlot, suggestFor, makeRecipe } from '../src/pure/recipes.js';
import { timbreOf } from '../src/pure/timbre.js';

const SR = 44100;
function hit(attackSec, decaySec, { sr = SR, hz = 220, tail = 0.2 } = {}) {
  const n = Math.round(sr * (attackSec + decaySec + tail));
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const a = t < attackSec ? (attackSec > 0 ? t / attackSec : 1)
      : Math.pow(10, -3 * (t - attackSec) / decaySec);
    d[i] = a * Math.sin(2 * Math.PI * hz * t);
  }
  return d;
}
const PLUCK = timbreOf(hit(0.002, 0.12), SR);
const BOWED = timbreOf(hit(0.220, 1.2), SR);
const PADDY = timbreOf(hit(0.050, 3.0), SR);

test('every slot states a job and a measurable want', () => {
  for (const [id, R] of Object.entries(ROLES)) {
    assert.ok(R.label && R.says.length > 20, id + ' needs a brief');
    assert.ok(Object.keys(R.wants).length > 0, id + ' needs something checkable');
    assert.ok(R.presets.length > 0, id + ' needs a starting suggestion');
  }
});

test('a bowed swell is refused for a fast hat and accepted for a pad', () => {
  const hat = fitSlot('hat', BOWED, 160, 1);
  assert.equal(hat.fits, false);
  assert.match(hat.says, /will not be heard|to speak/);
  const pad = fitSlot('pad', BOWED, 160, 16);
  assert.equal(pad.fits, true, pad.says);
});

test('a pluck suits a hat and is called short for a pad', () => {
  assert.equal(fitSlot('hat', PLUCK, 160, 1).fits, true);
  assert.match(fitSlot('pad', PLUCK, 90, 16).says, /rings only|clipped/);
});

test('the same sound passes a slow slot and fails a fast one', () => {
  assert.equal(fitSlot('synth', BOWED, 90, 8).fits, true);
  assert.equal(fitSlot('synth', BOWED, 174, 1).fits, false);
});

test('suggestions are ordered by fit, not by name', () => {
  const s = suggestFor('hat', [
    { id: 'bowed', timbre: BOWED }, { id: 'pluck', timbre: PLUCK }, { id: 'paddy', timbre: PADDY },
  ], 160, 1);
  assert.equal(s[0].id, 'pluck', 'the pluck should win a hat slot: ' + JSON.stringify(s.map(x => x.id)));
  assert.equal(s[s.length - 1].id, 'bowed');
});

test('a silent pad is reported rather than ranked', () => {
  const dead = timbreOf(new Float32Array(SR), SR);
  const f = fitSlot('low', dead, 100, 4);
  assert.equal(f.fits, false);
  assert.match(f.says, /silent/);
});

test('a recipe is reproducible from its seed and varies between seeds', () => {
  const a = makeRecipe(1234), b = makeRecipe(1234), c = makeRecipe(999);
  assert.deepEqual(JSON.stringify(a.steps), JSON.stringify(b.steps), 'same seed, same recipe');
  assert.equal(a.bpm, b.bpm);
  const many = [1, 2, 3, 4, 5, 6, 7, 8].map(makeRecipe);
  assert.ok(new Set(many.map(r => r.name)).size >= 6, 'eight seeds should not give one recipe');
  assert.ok(c.seed === 999);
});

test('tempo, feel and density are drawn together, not independently', () => {
  /* a 52bpm track with sixteenth hats is what sampling them separately
     produces, and it is not a thing anyone plays */
  for (let s = 1; s < 60; s++) {
    const r = makeRecipe(s);
    const f = ['slow', 'midtempo', 'four', 'fast'].indexOf(r.family);
    assert.ok(f >= 0, 'every recipe belongs to a family');
    if (r.family === 'slow') assert.ok(r.bpm <= 76, 'slow family stayed slow: ' + r.bpm);
    if (r.family === 'fast') assert.ok(r.bpm >= 140, 'fast family stayed fast: ' + r.bpm);
  }
});

test('every recipe asks for something low and something that marks the beat', () => {
  for (let s = 1; s < 40; s++) {
    const ids = makeRecipe(s).slots.map(x => x.id);
    assert.ok(ids.includes('low'), 'seed ' + s + ' has no low end');
    assert.ok(ids.includes('kick'), 'seed ' + s + ' has nothing on the downbeat');
  }
});

test('it does not claim its patterns are measured, because they are not', () => {
  const r = makeRecipe(7);
  assert.equal(r.patternsMeasured, false);
  assert.match(r.says, /composed rather than measured/);
});

test('each slot carries the gap its notes sit at, so a fit can be judged', () => {
  const r = makeRecipe(42);
  for (const s of r.slots) {
    assert.ok(s.gap >= 1, s.id + ' needs a gap');
    const f = fitSlot(s.id, PLUCK, r.bpm, s.gap);
    assert.ok(typeof f.fits === 'boolean', s.id + ' must be checkable');
  }
});
