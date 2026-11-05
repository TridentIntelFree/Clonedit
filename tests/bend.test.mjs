/* DOES BENDING THE AUDIO ACTUALLY MOVE THE SOUND?

   mutate() was the obvious mechanism and the measurement said no:

     ride           -> kick    0% ->  0%   0dB change, nothing in 15 tries
     snare_acoustic -> hat    70% -> 71%   5.48dB change, 32 seconds

   It turns the pad's knobs and never touches the audio, so a ride that
   needs 66dB more body to hold a kick's place is out of its reach. This
   is the EQ match that does change the audio, and the first thing to
   assert about it is that it HAS an effect — "two identical
   measurements are not a weak effect, they are no effect" is a rule
   this repo wrote after a nine-decibel edit moved a band by zero. */

import { test } from 'node:test';
import assert from 'node:assert';
import { eqCurve, binGains, applyCurve } from '../src/pure/bend.js';
import { BANDS, bandEnergies, fromShape, roleFit } from '../src/pure/padprofile.js';
import { ROLE_SHAPES } from '../src/pure/roleshapes.js';

const SR = 44100;

function noise(lo, hi, ms, decayMs = 40, seed = 11) {
  const n = Math.round(SR * ms / 1000), out = new Float32Array(n);
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const parts = [];
  for (let k = 0; k < 80; k++) parts.push([lo + (hi - lo) * rnd(), rnd() * 2 * Math.PI]);
  const d = SR * decayMs / 1000;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const [f, ph] of parts) v += Math.sin(2 * Math.PI * f * i / SR + ph);
    out[i] = (v / parts.length) * Math.exp(-i / d);
  }
  return out;
}
/* broadband, so there IS something in every band to move */
const WIDE = noise(40, 15000, 400, 120);
const bands = buf => bandEnergies(buf, SR).bands;

test('the measured role shapes are ordered like the instruments', () => {
  const air = r => ROLE_SHAPES[r].airVsBodyDb;
  assert.ok(air('kick') < air('snare'), air('kick') + ' vs ' + air('snare'));
  assert.ok(air('snare') < air('hat'), air('snare') + ' vs ' + air('hat'));
  assert.ok(air('bass') < air('kick'), air('bass') + ' vs ' + air('kick'));
  for (const r of Object.keys(ROLE_SHAPES))
    assert.equal(ROLE_SHAPES[r].bands.length, BANDS.length, r);
});

test('a boost is capped and a cut is not — nothing to bring up in an empty band', () => {
  const have = BANDS.map(([lo, hi]) => ({ lo, hi, rel: -80 }));
  const want = BANDS.map(([lo, hi]) => ({ lo, hi, rel: 0 }));
  for (const c of eqCurve(have, want, { maxBoost: 18 }))
    assert.equal(c.db, 18, c.lo + ': ' + c.db);
  for (const c of eqCurve(want, have, { maxCut: 48 }))
    assert.equal(c.db, -48, c.lo + ': ' + c.db);
});

test('strength scales the move, and zero asks for nothing', () => {
  const have = BANDS.map(([lo, hi]) => ({ lo, hi, rel: -20 }));
  const want = BANDS.map(([lo, hi]) => ({ lo, hi, rel: -10 }));
  assert.equal(eqCurve(have, want, { strength: 0 })[0].db, 0);
  assert.equal(eqCurve(have, want, { strength: 0.5 })[0].db, 5);
  assert.equal(eqCurve(have, want, { strength: 1 })[0].db, 10);
});

test('bin gains interpolate rather than step, so band edges do not ring', () => {
  const curve = BANDS.map(([lo, hi], i) => ({ lo, hi, db: i === 0 ? 12 : -12 }));
  const g = binGains(curve, 1025, SR / 2048);
  /* monotone from the first band down into the second, no cliff */
  const db = k => 20 * Math.log10(g[k]);
  assert.ok(db(1) > 10, 'bottom bin ' + db(1).toFixed(1));
  assert.ok(db(1024) < -10, 'top bin ' + db(1024).toFixed(1));
  /* FROM 100Hz UP. FFT bins are spaced LINEARLY and this curve is
     defined in octaves, so bin 1 to bin 2 is a whole octave while bin
     500 to 501 is a thousandth of one. A big step down there is the bin
     grid, not a ringing filter, and asserting otherwise would be
     asserting against the DFT. */
  const from = Math.ceil(100 / (SR / 2048));
  let jumps = 0;
  for (let k = from + 1; k < 1025; k++) if (Math.abs(db(k) - db(k - 1)) > 1.5) jumps++;
  assert.equal(jumps, 0, jumps + ' bins above 100Hz jump more than 1.5dB');
});

test('a flat curve returns the sound essentially unchanged', () => {
  const flat = BANDS.map(([lo, hi]) => ({ lo, hi, db: 0 }));
  const out = applyCurve(WIDE, SR, flat);
  let worst = 0;
  for (let i = 0; i < WIDE.length; i++) worst = Math.max(worst, Math.abs(out[i] - WIDE[i]));
  assert.ok(worst < 0.02, 'worst sample error ' + worst.toFixed(4)
    + ' — the STFT must reconstruct, or every bend carries that error');
});

test('IT ACTUALLY MOVES THE SPECTRUM — not a weak effect, an effect', () => {
  const dark = BANDS.map(([lo, hi]) => ({ lo, hi, db: lo >= 2000 ? -30 : 0 }));
  const before = fromShape(bands(WIDE));
  const after = fromShape(bands(applyCurve(WIDE, SR, dark)));
  assert.ok(before.airVsBodyDb - after.airVsBodyDb > 15,
    'air-vs-body went ' + before.airVsBodyDb + ' -> ' + after.airVsBodyDb
    + 'dB, which is not enough to be the point of the tool');
  assert.ok(after.centroidHz < before.centroidHz * 0.7,
    'centroid ' + before.centroidHz + ' -> ' + after.centroidHz + 'Hz');
});

test('and it keeps the level, so staging is not quietly undone', () => {
  const dark = BANDS.map(([lo, hi]) => ({ lo, hi, db: lo >= 2000 ? -30 : 0 }));
  const out = applyCurve(WIDE, SR, dark);
  const pk = a => { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; };
  assert.ok(Math.abs(pk(out) - pk(WIDE)) < 1e-3,
    'peak ' + pk(WIDE).toFixed(4) + ' -> ' + pk(out).toFixed(4));
});

/* THE WHOLE POINT, END TO END: a bright broadband sound aimed at the
   kick template has to come out measurably more kick-like than it went
   in, by the same roleFit() the detector reads back. */
test('bending toward a role improves that role’s fit', () => {
  const moved = [];
  for (const role of ['kick', 'snare', 'hat']) {
    const curve = eqCurve(bands(WIDE), ROLE_SHAPES[role].bands, { strength: 1 });
    const out = applyCurve(WIDE, SR, curve);
    const f0 = roleFit(fromShape(bands(WIDE)), role);
    const f1 = roleFit(fromShape(bands(out)), role);
    /* NEVER WORSE, and better wherever there was room. The fixture is
       decaying broadband noise, which already measures as a textbook
       snare — fit 1.0 before anything is done to it — so demanding an
       improvement there demands a number above the maximum. Asserting
       it anyway is how a test ends up describing its fixture instead of
       the code. */
    assert.ok(f1.fit >= f0.fit - 1e-9,
      role + ': fit went DOWN, ' + f0.fit + ' -> ' + f1.fit);
    if (f0.fit < 0.999) {
      assert.ok(f1.fit > f0.fit, role + ': fit ' + f0.fit + ' -> ' + f1.fit
        + ' — there was room to improve and it did not');
      moved.push(role + ' ' + f0.fit + '->' + f1.fit);
    }
  }
  assert.ok(moved.length >= 2, 'only ' + moved.length + ' role(s) had room to move, '
    + 'so this is barely exercising anything: ' + moved.join(', '));
});

/* THE HEADLINE, NAMED OUTRIGHT: the job the knob search scored 0% on,
   over 15 candidates and 32 seconds, with 0dB of spectral change. */
test('a bright sound aimed at the kick template genuinely goes dark', () => {
  const curve = eqCurve(bands(WIDE), ROLE_SHAPES.kick.bands, { strength: 1 });
  const out = applyCurve(WIDE, SR, curve);
  const m0 = fromShape(bands(WIDE)), m1 = fromShape(bands(out));
  assert.ok(m0.airVsBodyDb - m1.airVsBodyDb > 40,
    'air-vs-body ' + m0.airVsBodyDb + ' -> ' + m1.airVsBodyDb
    + 'dB; mutate() managed 0dB on this job');
  assert.ok(m1.centroidHz < 300,
    'centroid ' + m0.centroidHz + ' -> ' + m1.centroidHz + 'Hz');
  assert.equal(roleFit(m1, 'kick').fit, 1, roleFit(m1, 'kick').says);
});

test('bending toward a role does not silently wreck the sound', () => {
  const curve = eqCurve(bands(WIDE), ROLE_SHAPES.kick.bands, { strength: 1 });
  const out = applyCurve(WIDE, SR, curve);
  assert.equal(out.length, WIDE.length);
  assert.ok(out.some(v => Math.abs(v) > 0.001), 'it went silent');
  assert.ok(out.every(v => Number.isFinite(v)), 'it produced NaN or Infinity');
});

test('empty input is refused rather than crashing', () => {
  const flat = BANDS.map(([lo, hi]) => ({ lo, hi, db: 0 }));
  assert.equal(applyCurve(null, SR, flat), null);
  assert.equal(applyCurve(new Float32Array(0), SR, flat), null);
  assert.equal(applyCurve(WIDE, SR, null), null);
  assert.equal(eqCurve(null, null), null);
});
