/* WHICH LAYER MODE A SAMPLED NOTE GETS.

   The bug was not in the layer picker, which worked; it was in the
   decision about which mode to put a pad in. nakeddrums' snare is three
   round robins of ONE dynamic, failed a `n >= rr*2` threshold, fell back
   to velocity selection, and so played the identical recording on every
   repeat at the same velocity — the exact fault that mode exists to
   prevent, on four of five drums' worth of working behaviour.

   The pack is fetched over HTTP and no browser test loaded it, which is
   why nobody noticed. The rule lives in src/pure/ now so it can be
   checked here in milliseconds, with the real pack's shapes as cases. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerModeFor } from '../src/pure/sfz.js';

test('the real kit: alternates cycle, dynamics are read as dynamics', () => {
  /* nakeddrums, rr:3. use.length is capped at 1+LAY_MAX = 8, so the
     15-sample kick arrives as 8. */
  assert.equal(layerModeFor(8, 3), 'velrr', 'kick — 2+ bands of 3 takes');
  assert.equal(layerModeFor(9, 3), 'velrr', 'hats/ride/tom');
  assert.equal(layerModeFor(3, 3), 'rr',
    'SNARE — three takes of one dynamic. This returned vel, and a '
    + 'backbeat then played the same waveform every time.');
  assert.equal(layerModeFor(2, 3), 'rr', 'two takes of one dynamic');
});

test('a multi-dynamic library with NO alternates still selects by velocity', () => {
  /* the regression that matters: a sampled piano has dynamics and no
     round robins, and must not start ignoring velocity */
  assert.equal(layerModeFor(6, 1), 'vel');
  assert.equal(layerModeFor(2, 1), 'vel');
  assert.equal(layerModeFor(16, 1), 'vel');
});

test('one sample has nothing to choose between', () => {
  assert.equal(layerModeFor(1, 3), 'vel');
  assert.equal(layerModeFor(0, 3), 'vel');
});

test('rr is treated as at least 1 however it arrives', () => {
  assert.equal(layerModeFor(6, 0), 'vel');
  assert.equal(layerModeFor(6, undefined), 'vel');
});
