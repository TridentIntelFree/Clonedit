/* The pitch detector has to prove itself before anything trusts it.

   This is here because of what happened when it did not. A detector that
   read "the lowest strong spectral peak" was used to audit a sample
   library and reported every instrument in it as exactly 12 or 24
   semitones out. The numbers were uniform, confident and completely
   wrong: it was locking onto harmonics, and 12 and 24 are what the
   second and fourth harmonics look like.

   The failure was only caught because the same tool was pointed at a
   library already known to be correct and disagreed with it too. So the
   calibration is a test now, and the audit refuses to print without it.

   The cases below are the ones that matter for real instruments: a
   struck bar, a plucked string and a bowed note all routinely put more
   energy into an upper partial than into the fundamental, and two of
   these signals have barely any fundamental at all. */

import { test } from 'node:test';
import assert from 'node:assert';
import { selfTest, fundamentalHz, fundamentalRobust, midiOfHz, hzOfMidi } from '../scripts/lib/pitch.mjs';

test('pitch detector passes its own calibration', () => {
  const r = selfTest();
  for (const row of r.rows) {
    assert.ok(Number.isFinite(row.err),
      row.name + ': no pitch found at all');
    assert.ok(Math.abs(row.err) <= 0.5,
      row.name + ': wanted ' + row.want + 'Hz, got ' + (row.got || 0).toFixed(1)
      + 'Hz — ' + row.err.toFixed(2) + ' semitones out');
  }
  assert.ok(r.ok, 'worst case ' + r.worst.toFixed(2) + ' semitones');
});

test('a missing fundamental does not read an octave high', () => {
  /* the exact shape that broke the first detector: energy at 2f, 3f and
     4f, nothing whatever at f */
  const sr = 16000, n = sr * 1.5, buf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = 8000 * (Math.sin(2 * Math.PI * 440 * i / sr)
      + 0.8 * Math.sin(2 * Math.PI * 660 * i / sr)
      + 0.6 * Math.sin(2 * Math.PI * 880 * i / sr));
  }
  const hz = fundamentalHz(buf, sr);
  const err = 12 * Math.log2(hz / 220);
  assert.ok(Math.abs(err) < 0.5, 'read ' + hz.toFixed(1) + 'Hz, wanted 220Hz');
});

test('midi and hz convert both ways', () => {
  for (const m of [21, 48, 60, 69, 84, 108]) {
    assert.ok(Math.abs(midiOfHz(hzOfMidi(m)) - m) < 1e-9);
  }
  assert.ok(Math.abs(hzOfMidi(69) - 440) < 1e-9);
});

test('the robust reading reports how much the frames disagreed', () => {
  const sr = 16000, n = sr * 2, buf = new Float64Array(n);
  /* a note that slides a whole tone: the frames should disagree, and the
     caller needs to be told rather than handed a confident median */
  for (let i = 0; i < n; i++) {
    const f = 220 * Math.pow(2, (2 * (i / n)) / 12);
    buf[i] = 8000 * Math.sin(2 * Math.PI * f * i / sr);
  }
  const r = fundamentalRobust(buf, sr);
  assert.ok(r && r.n >= 3, 'expected several frames');
  assert.ok(r.spread > 0.5, 'a gliding note should report spread, got ' + r.spread.toFixed(2));

  /* and a steady one should not */
  const steady = new Float64Array(n);
  for (let i = 0; i < n; i++) steady[i] = 8000 * Math.sin(2 * Math.PI * 220 * i / sr);
  const s = fundamentalRobust(steady, sr);
  assert.ok(s.spread < 0.2, 'a steady note should not wobble, got ' + s.spread.toFixed(2));
});
