/* Measure a track once, keep the numbers.

   A reference is a curve, not a recording. Everything in the app that
   judges tonal balance — compare(), balance(), critique()'s off-reference
   check — reads nine relative band levels and a couple of scalars. The
   audio is only ever how you obtain them.

   That distinction is worth having a script for. A mix engineer's
   reference track is usually a commercial record, which cannot live in
   a repository and often cannot even be handed between machines. Its
   SPECTRUM can: nine numbers describing a shape, which is a measurement
   of a recording rather than the recording, and which is all the solver
   needs. Measure once, anywhere, commit the profile, and every later
   mix can be fitted to it without the file ever moving again.

     node scripts/reference-profile.mjs <audio-file> [name] > ref.json

   Then, in the app or a song script:

     reference(JSON.parse(readFileSync('ref.json','utf8')))
     balance({src:'song'})

   Bands match SPEC_BANDS in src/legacy.js exactly, and the levels are
   each band's energy relative to the whole, which is what specShape()
   computes — so a profile made here and one made from a loaded WAV are
   the same measurement and can be compared with each other.

   Needs ffmpeg. Takes any format ffmpeg reads. */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const FILE = process.argv[2];
if (!FILE) {
  console.error('usage: node scripts/reference-profile.mjs <audio-file> [name] > ref.json');
  process.exit(2);
}
const path = resolve(FILE);
if (!existsSync(path)) { console.error('no such file: ' + path); process.exit(2); }
const NAME = process.argv[3] || basename(path);

/* the same nine, in the same order, as the app */
const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000],
  [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
const nameOf = (a, b) => {
  const s = (n) => n >= 1000 ? (n / 1000) + 'k' : '' + n;
  return s(a) + '-' + s(b);
};

/* BOTH STREAMS. ffmpeg writes astats and ebur128 to STDERR, not stdout,
   and execFileSync hands back stdout alone when the command succeeds —
   so the first version of this read an empty string every time the
   measurement worked, and only saw numbers when ffmpeg had failed. */
function ff(args) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', ...args],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  return String((r.stdout || '') + (r.stderr || ''));
}
const grab = (out, label) => {
  const m = [...out.matchAll(new RegExp(label + '[^\\n]*?(-?\\d+(?:\\.\\d+)?)', 'g'))];
  return m.length ? parseFloat(m[m.length - 1][1]) : null;
};

/* THE WHOLE-FILE LEVEL FIRST, because every band is reported relative to
   it. Reading bands as absolutes is the mistake that once showed a mix
   as fixed at the top while a 16dB hole sat at 500Hz. */
const whole = ff(['-i', path, '-af', 'astats=metadata=0', '-f', 'null', '-']);
const totalDb = grab(whole, 'RMS level dB');
if (totalDb == null) {
  console.error('ffmpeg could not measure ' + path + ' — is it audio, and is ffmpeg installed?');
  process.exit(3);
}
const peakDb = grab(whole, 'Peak level dB');

const shape = [];
for (const [lo, hi] of BANDS) {
  /* two cascaded 2-pole sections a side: the same fourth-order shape the
     app's filterbank uses, so the two agree */
  const out = ff(['-i', path, '-af',
    `highpass=f=${lo}:p=2,highpass=f=${lo}:p=2,lowpass=f=${hi}:p=2,lowpass=f=${hi}:p=2,astats=metadata=0`,
    '-f', 'null', '-']);
  const db = grab(out, 'RMS level dB');
  shape.push({
    band: nameOf(lo, hi), lo, hi,
    rel: db == null ? -120 : +(db - totalDb).toFixed(1),
  });
}

/* LUFS and the true peak, when ffmpeg has ebur128 */
let lufs = null;
const eb = ff(['-i', path, '-af', 'ebur128=framelog=quiet:peak=true', '-f', 'null', '-']);
const im = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(eb);
if (im) lufs = parseFloat(im[1]);

const dur = (() => {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(whole);
  return d ? +(+d[1] * 3600 + +d[2] * 60 + parseFloat(d[3])).toFixed(1) : null;
})();

/* crest here is peak over perceived loudness, matching specReport() */
const crestDb = (peakDb != null && lufs != null) ? +(peakDb - lufs).toFixed(2) : null;

const profile = {
  name: NAME, shape, lufs, crestDb, seconds: dur,
  note: 'Nine-band spectrum relative to the whole, measured by '
    + 'scripts/reference-profile.mjs. This is a description of a shape, not audio. '
    + 'Load it with reference(profile), then compare() or balance().',
};
process.stdout.write(JSON.stringify(profile, null, 1) + '\n');
process.stderr.write(NAME + ': ' + shape.map(b => b.band + ' ' + b.rel).join('  ')
  + (lufs == null ? '' : '\n  ' + lufs + ' LUFS, crest ' + crestDb) + '\n');
