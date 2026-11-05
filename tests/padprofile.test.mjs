/* THE SONG BUILDER ASSIGNED KICK, SNARE AND HAT BY PAD INDEX.

   `drums[0]` got the kick figure, `[1]` the snare, `[2]` the hat, where
   `drums` was whichever pads were free in pad order. Load a hat on A01
   and a kick on A03 and the measured hiphop kick bar plays on the hat.
   Every check in the repo passes: the steps are on the grid, the
   harmony is untouched, `pulse()` finds a beat. It simply is not the
   kit anybody loaded.

   These measure synthesised signals whose answers are known. That is a
   REAL limit and this repo has been bitten by it — "Fifteen green tests
   on synthesised audio, and wrong anyway", where an onset detector
   passed 15 synthetic cases and got 4 of 9 real ones. So the shapes here
   are deliberately the ones that distinguish the three voices in
   physics rather than in flavour: a 60Hz thud, a filtered-noise crack,
   a bright short tick. If this ever disagrees with a real kit, the real
   kit is right. */

import { test } from 'node:test';
import assert from 'node:assert';
import { fft, BANDS, bandEnergies, kitRoleOf, pitchedness, profileOf, assignKit }
  from '../src/pure/padprofile.js';
import { timbreOf } from '../src/pure/timbre.js';

const SR = 44100;

/* ---- fixtures ------------------------------------------------------ */

function env(n, attackMs, decayMs) {
  const a = Math.max(1, SR * attackMs / 1000), d = Math.max(1, SR * decayMs / 1000);
  return i => i < a ? i / a : Math.exp(-(i - a) / d);
}

function tone(hz, ms, attackMs = 2, decayMs = 60) {
  const n = Math.round(SR * ms / 1000), out = new Float32Array(n), e = env(n, attackMs, decayMs);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * hz * i / SR) * e(i);
  return out;
}

/* band-limited noise by summing sinusoids across the band — cheap, and
   exact about where the energy is, which is the whole point here */
function noise(lo, hi, ms, attackMs = 1, decayMs = 40, seed = 7) {
  const n = Math.round(SR * ms / 1000), out = new Float32Array(n), e = env(n, attackMs, decayMs);
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const parts = [];
  for (let k = 0; k < 60; k++) parts.push([lo + (hi - lo) * rnd(), rnd() * 2 * Math.PI]);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const [f, ph] of parts) v += Math.sin(2 * Math.PI * f * i / SR + ph);
    out[i] = (v / parts.length) * e(i);
  }
  return out;
}

const KICK = tone(60, 220, 3, 45);
const SNARE = noise(200, 4000, 180, 1, 35);
const HAT = noise(6000, 14000, 70, 0.5, 12);
const PAD = tone(440, 2200, 60, 1400);          /* a sustained mid note */
const SUB = tone(55, 1800, 5, 900);            /* low and ringing: kick or 808? */

const prof = buf => profileOf(timbreOf(buf, SR), buf, SR);

/* ---- the transform ------------------------------------------------- */

test('fft finds a pure tone in the right bin', () => {
  const N = 1024, hz = SR * 64 / N;        /* exactly bin 64 */
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = Math.sin(2 * Math.PI * hz * i / SR);
  fft(re, im);
  let best = 0, at = 0;
  for (let k = 1; k < N / 2; k++) {
    const m = re[k] * re[k] + im[k] * im[k];
    if (m > best) { best = m; at = k; }
  }
  assert.equal(at, 64, 'peak bin');
});

test('fft of silence is silence', () => {
  const re = new Float64Array(256), im = new Float64Array(256);
  fft(re, im);
  assert.ok(re.every(v => v === 0) && im.every(v => v === 0));
});

/* ---- the spectrum -------------------------------------------------- */

test('a 60Hz tone owns the 60-120 band and reads dark', () => {
  const b = bandEnergies(KICK, SR);
  assert.ok(b, 'measured');
  assert.match(b.owns, /^(20-60|60-120)$/, 'owns ' + b.owns);
  assert.ok(b.centroidHz < 200, 'centroid ' + b.centroidHz + 'Hz');
  assert.ok(b.airVsBodyDb < -20, 'air-vs-body ' + b.airVsBodyDb + 'dB');
});

test('6-14kHz noise owns a top band and reads bright', () => {
  const b = bandEnergies(HAT, SR);
  assert.match(b.owns, /^(4k-8k|8k-16k)$/, 'owns ' + b.owns);
  assert.ok(b.centroidHz > 4000, 'centroid ' + b.centroidHz + 'Hz');
  assert.ok(b.airVsBodyDb > 20, 'air-vs-body ' + b.airVsBodyDb + 'dB');
});

test('band levels are relative, so gain does not move them', () => {
  const quiet = Float32Array.from(KICK, v => v * 0.01);
  const a = bandEnergies(KICK, SR), b = bandEnergies(quiet, SR);
  assert.equal(a.owns, b.owns);
  assert.ok(Math.abs(a.centroidHz - b.centroidHz) <= 2,
    a.centroidHz + ' vs ' + b.centroidHz);
  a.bands.forEach((x, i) => assert.ok(Math.abs(x.rel - b.bands[i].rel) < 0.5,
    x.band + ': ' + x.rel + ' vs ' + b.bands[i].rel));
});

/* THE FOUND-SOUND CASE, which is the one that matters in this repo.
   foundkit and darkkit are five-second ESC-50 clips with the event a
   fifth of a second in; averaging the whole file measures the room. */
test('it measures where the sound is, not where the file starts', () => {
  const lead = new Float32Array(Math.round(SR * 2.5));
  const buf = new Float32Array(lead.length + HAT.length);
  buf.set(HAT, lead.length);
  const b = bandEnergies(buf, SR);
  assert.ok(b.atSec > 2.0, 'measured at ' + b.atSec + 's, not the silence');
  assert.ok(b.centroidHz > 4000, 'centroid ' + b.centroidHz + 'Hz');
});

test('digital silence is refused rather than described', () => {
  assert.equal(bandEnergies(new Float32Array(4096), SR), null);
  assert.equal(bandEnergies(null, SR), null);
  assert.equal(bandEnergies(new Float32Array(0), SR), null);
});

/* ---- the roles ----------------------------------------------------- */

test('each of the three shapes is recognised as its own voice', () => {
  for (const [name, buf] of [['kick', KICK], ['snare', SNARE], ['hat', HAT]]) {
    const k = prof(buf).kit;
    assert.equal(k.role, name, name + ' read as ' + k.role + ' — ' + k.says);
    assert.equal(k.confident, true, name + ': ' + k.says);
  }
});

test('a sustained note is not called percussive, and a tick is not called a note', () => {
  assert.equal(prof(PAD).kind, 'pitched', JSON.stringify(prof(PAD).kind));
  assert.equal(prof(HAT).kind, 'percussive');
});

/* THE ONE IT REFUSES, AND WHY THAT IS THE RIGHT ANSWER.

   An 808 kick and an 808 bass note are the same signal; which one it is
   depends on what you play it as. samples/jbh-drums.json ships both and
   they measure alike — kick_808 at 62Hz and bass808_C1 at 36Hz, both all
   body, both ringing. Ring does not separate them either: an 808 bass
   note holds for two seconds and so does a long 909 kick.

   The first version of pitchedness() called anything with a 500ms tail
   under 3kHz a note, which read a 909 kick as melodic — the song builder
   then dealt it a bass line and reported `kick=—` on a board whose kick
   was sitting right there. Guessing the other way would be just as
   wrong. So it refuses, and the caller uses the two things that actually
   know: the `inst` tag, which is the person saying so, and the kit
   scores, which say what the sound would be GOOD at. */
test('a low ringing sound is refused rather than guessed either way', () => {
  assert.equal(prof(SUB).kind, null,
    'a 55Hz ring read as ' + prof(SUB).kind + ' — there is nothing here to '
    + 'tell an 808 kick from an 808 bass note, so it must not claim to');
  /* and it is still obviously kit material if the board needs a kick */
  assert.equal(prof(SUB).kit.role, 'kick', prof(SUB).kit.says);
});

test('silence has no role at all', () => {
  const z = new Float32Array(4096);
  assert.equal(kitRoleOf(profileOf(timbreOf(z, SR), z, SR)), null);
  assert.equal(pitchedness(null), null);
});

/* ---- the assignment, which is the bug this exists for -------------- */

test('THE KIT FOLLOWS THE SOUNDS, NOT THE PAD NUMBERS', () => {
  /* hat on pad 0, kick on pad 2 — the order that was silently wrong */
  const profiles = { 0: prof(HAT), 1: prof(SNARE), 2: prof(KICK) };
  const a = assignKit(profiles, [0, 1, 2]);
  assert.equal(a.kick, 2, 'kick went to pad ' + a.kick);
  assert.equal(a.snare, 1, 'snare went to pad ' + a.snare);
  assert.equal(a.hat, 0, 'hat went to pad ' + a.hat);
  assert.equal(a.guessed, undefined, 'nothing had to be guessed');
});

test('and it still assigns every voice when the board is all one thing', () => {
  const profiles = { 3: prof(PAD), 4: prof(PAD), 5: prof(PAD) };
  const a = assignKit(profiles, [3, 4, 5]);
  for (const v of ['kick', 'snare', 'hat'])
    assert.ok(a[v] != null, v + ' unassigned — a kit of nothing is worse');
  assert.equal(new Set([a.kick, a.snare, a.hat]).size, 3, 'one pad per voice');
});

test('no pad takes two voices', () => {
  const profiles = { 0: prof(KICK), 1: prof(KICK), 2: prof(KICK) };
  const a = assignKit(profiles, [0, 1, 2]);
  assert.equal(new Set([a.kick, a.snare, a.hat]).size, 3,
    JSON.stringify(a) + ' — three identical pads must still spread');
});

test('fewer pads than voices leaves the extras unfilled, not doubled', () => {
  const a = assignKit({ 0: prof(KICK), 1: prof(HAT) }, [0, 1]);
  const used = ['kick', 'snare', 'hat'].map(v => a[v]).filter(v => v != null);
  assert.equal(used.length, 2, JSON.stringify(a));
  assert.equal(new Set(used).size, 2, 'and they are different pads');
});
