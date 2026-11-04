/* TONES WITH THE ANSWER WRITTEN INTO THEM, then found again — and the
   two traps that this problem is famous for.

   Both traps are already documented in this repo from the other side.
   scripts/audit-pitch.mjs picks peaks out of a spectrum and had to
   learn to take the "lowest strong partial" rather than the loudest,
   because struck metal routinely has an upper partial louder than its
   fundamental; a detector that takes the loudest reports a vibraphone
   an octave high. And a difference function has the mirror-image fault:
   a signal with period T repeats at 2T as well, so taking the DEEPEST
   dip reports everything an octave low.

   A detector that has not been run against both is not a detector.
   These are synthetic; the real-recording validation is in the module
   header, and it found something these could not. */

import { test } from 'node:test';
import assert from 'node:assert';
import { detectPitch, pitchOfWindow, pitchTrack, hzToMidi, midiToHz,
  midiName, centsOff } from '../src/pure/pitch.js';

const SR = 44100;

/* a tone at `hz` with the harmonic amplitudes given, decaying */
function tone(hz, secs, harmonics = [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2]],
  { sr = SR, decay = 2 } = {}) {
  const n = Math.round(sr * secs);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [mult, amp] of harmonics) v += amp * Math.sin(2 * Math.PI * hz * mult * t);
    d[i] = v * 0.3 * Math.exp(-t / decay);
  }
  return d;
}

test('Hz and MIDI convert both ways, with A4 where it belongs', () => {
  assert.equal(Math.round(hzToMidi(440)), 69);
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(midiName(69), 'A4');
  assert.equal(midiName(60), 'C4');
  assert.equal(midiName(61), 'C#4');
  /* a round trip over the whole range, because an off-by-one in the 69
     or a 12 in the wrong place is a whole-octave error that looks
     plausible in every log it appears in */
  for (let m = 21; m <= 108; m++) {
    assert.equal(Math.round(hzToMidi(midiToHz(m))), m, 'round trip failed at ' + m);
  }
});

test('cents are signed and sharp is positive', () => {
  assert.equal(centsOff(440), 0);
  assert.ok(centsOff(440 * Math.pow(2, 25 / 1200)) > 20, 'a quarter tone sharp');
  assert.ok(centsOff(440 * Math.pow(2, -25 / 1200)) < -20, 'a quarter tone flat');
});

test('it finds the note it was given, across the whole useful range', () => {
  for (const midi of [31, 36, 40, 45, 52, 57, 64, 69, 76, 81, 88]) {
    const p = detectPitch(tone(midiToHz(midi), 1.2), SR);
    assert.ok(p, 'refused ' + midiName(midi));
    assert.equal(p.midi, midi,
      midiName(midi) + ' read as ' + p.note + ' (' + p.hz + 'Hz)');
    assert.ok(Math.abs(p.cents) <= 10, midiName(midi) + ' off by ' + p.cents + ' cents');
    assert.equal(p.stable, true, midiName(midi) + ': ' + p.says);
  }
});

test('A BASS NOTE IS IN RANGE, which the first default got wrong', () => {
  /* 50Hz was the first minimum and it refused a four-string bass's low
     E at 41.2Hz outright. B0 at 30.9Hz is the bottom of a five-string. */
  for (const midi of [23, 28, 31]) {
    const p = detectPitch(tone(midiToHz(midi), 1.4), SR);
    assert.ok(p && p.midi === midi,
      midiName(midi) + ' (' + midiToHz(midi).toFixed(1) + 'Hz) read as '
      + (p ? p.note : 'refused'));
  }
});

test('THE VIBRAPHONE TRAP: the fundamental is not the loudest partial', () => {
  /* struck metal with its second partial nearly seven times the
     fundamental. A detector that picks the loudest spectral peak calls
     this an octave high, which is the fault audit-pitch.mjs records
     having to fix. */
  const metal = tone(midiToHz(60), 1.2, [[1, 0.15], [2, 1.0], [3, 0.4]]);
  const p = detectPitch(metal, SR);
  assert.ok(p, 'refused the metal tone');
  assert.equal(p.midi, 60, 'read as ' + p.note + ' — an octave error on weak fundamental');
});

test('AND THE MIRROR TRAP: the deepest dip is often the octave below', () => {
  /* A period of 2T correlates nearly as well as T, so taking the
     deepest dip rather than the first one under the threshold reports
     everything an octave low. A tone with a strong even-harmonic
     structure is where that bites. */
  const p = detectPitch(tone(440, 1.2, [[1, 1], [2, 0.95], [4, 0.6]]), SR);
  assert.ok(p, 'refused');
  assert.equal(p.midi, 69, 'read as ' + p.note + ' — the octave-down failure');
});

test('a detuned note is the RIGHT note played badly, not another note', () => {
  /* the distinction a producer needs: 40 cents flat is not a semitone */
  const flat = midiToHz(69) * Math.pow(2, -40 / 1200);
  const p = detectPitch(tone(flat, 1.2), SR);
  assert.equal(p.midi, 69, 'read as ' + p.note);
  assert.ok(p.cents <= -30, 'cents ' + p.cents);
  assert.match(p.says, /flat/);
  assert.match(p.says, /not a different note/);
});

test('OUT OF RANGE IS REPORTED UNRELIABLE, not answered confidently', () => {
  /* The range is the caller's declaration. A difference function
     searching 30-1600Hz cannot find 4186Hz, and what comes back is a
     plausible wrong answer — so it has to arrive labelled. This is the
     real-piano C8 case reproduced. */
  const p = detectPitch(tone(midiToHz(108), 1.0), SR, { maxHz: 1600 });
  if (p) {
    assert.equal(p.stable, false, 'a 4186Hz tone read as ' + p.note + ' and called stable');
    assert.match(p.says, /UNRELIABLE/);
    /* either diagnosis is correct and the zero-crossing one is better,
       because it says WHICH way it is wrong and what to change */
    assert.match(p.says, /above the 1600Hz ceiling|outside the 30-1600Hz range/);
    assert.match(p.says, /maxHz|range/);
  }
  /* AND WIDENING THE RANGE DOES NOT RESCUE THE TOP OF A PIANO, which is
     a real limit of measuring periodicity in the time domain rather
     than a tuning problem. Measured: exact up to A7 at 3520Hz, where
     the period is 12.5 samples at 44.1kHz, and wrong by an octave at C8
     at 4186Hz, where it is 10.5. Asserted here so the ceiling is a
     stated property and not a surprise. G6 is already above a
     soprano's top note, so this ceiling is far above the job. */
  const high = detectPitch(tone(midiToHz(105), 1.0), SR, { maxHz: 5000 });
  assert.ok(high && high.midi === 105,
    'A7 at 3520Hz should still be exact: ' + (high ? high.note : 'refused'));
  const top = detectPitch(tone(midiToHz(108), 1.0), SR, { maxHz: 5000 });
  assert.ok(!top || top.midi !== 108,
    'C8 is expected to be beyond this method; if it now works, the ceiling '
    + 'moved and the module header should say so');
});

test('noise and silence are refused rather than named', () => {
  const n = Math.round(SR * 0.5);
  const hiss = new Float32Array(n);
  for (let i = 0; i < n; i++) hiss[i] = (Math.random() * 2 - 1) * 0.3;
  const p = detectPitch(hiss, SR);
  assert.ok(!p || p.stable === false, 'noise read as a stable ' + (p && p.note));
  assert.equal(detectPitch(new Float32Array(SR), SR), null, 'silence must refuse');
  assert.equal(pitchOfWindow(new Float32Array(16), SR), null, 'too short must refuse');
});

/* ---- A LINE -------------------------------------------------------- */

test('A SUNG LINE COMES BACK AS NOTES, which is the point of all of it', () => {
  /* this is what melody(), motif() and harmony() can read */
  const want = [60, 62, 64, 65, 67];
  const each = 0.4;
  const n = Math.round(SR * want.length * each);
  const d = new Float32Array(n);
  want.forEach((m, k) => {
    const hz = midiToHz(m), from = Math.round(k * each * SR);
    for (let i = 0; i < Math.round(each * SR) && from + i < n; i++) {
      const t = i / SR;
      d[from + i] = 0.3 * (Math.sin(2 * Math.PI * hz * t)
        + 0.4 * Math.sin(2 * Math.PI * hz * 2 * t));
    }
  });
  const tr = pitchTrack(d, SR);
  assert.equal(tr.notes.length, want.length,
    'expected ' + want.length + ' notes, got ' + tr.notes.length
    + ': ' + tr.notes.map(x => x.note).join(' '));
  tr.notes.forEach((nt, i) => {
    assert.equal(nt.midi, want[i], 'note ' + i + ' is ' + nt.note);
    assert.ok(nt.seconds > each * 0.5, 'note ' + i + ' lasted ' + nt.seconds);
  });
  assert.match(tr.says, /Monophonic only/);
});

test('a held note is ONE note, not four hundred frames', () => {
  const d = tone(midiToHz(64), 2.0, [[1, 1], [2, 0.4]], { decay: 20 });
  const tr = pitchTrack(d, SR);
  assert.equal(tr.notes.length, 1, 'got ' + tr.notes.length + ' notes');
  assert.ok(tr.notes[0].seconds > 1.5, 'lasted ' + tr.notes[0].seconds);
  assert.ok(tr.notes[0].frames > 20, 'merged from ' + tr.notes[0].frames + ' frames');
});

test('vibrato and a glide do not become grace notes', () => {
  /* a frame or two of a neighbouring pitch is not a note somebody
     played, and reporting it would fill a melody with things nobody
     sang */
  const secs = 1.5, n = Math.round(SR * secs);
  const d = new Float32Array(n);
  const base = midiToHz(67);
  /* PHASE IS INTEGRATED, and the first version of this fixture was
     wrong in a way worth keeping a note about. Written as
     sin(2*pi*f(t)*t) it looks like vibrato and is not: the
     instantaneous frequency of that expression is f(t) + t*f'(t), and
     the second term grows with time, so a "third of a semitone" wobble
     measured as a TWENTY-TWO semitone sweep. The detector reported the
     sweep honestly and the test called it a bug. */
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const hz = base * Math.pow(2, (0.35 * Math.sin(2 * Math.PI * 5.5 * t)) / 12);
    phase += 2 * Math.PI * hz / SR;
    d[i] = 0.3 * Math.sin(phase);
  }
  const tr = pitchTrack(d, SR);
  assert.ok(tr.notes.length <= 2,
    'vibrato produced ' + tr.notes.length + ' notes: '
    + tr.notes.map(x => x.note + '/' + x.seconds).join(' '));
  assert.equal(tr.notes[0].midi, 67, 'centre pitch read as ' + tr.notes[0].note);
});

test('nothing pitched is said plainly, and the two causes named', () => {
  const tr = pitchTrack(new Float32Array(SR), SR);
  assert.equal(tr.notes.length, 0);
  assert.match(tr.says, /nothing reliably pitched/);
  assert.match(tr.says, /chord|drum|noise/);
});
