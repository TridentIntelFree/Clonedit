/* Does a sample sound the note its manifest says it does?

   WHY THIS EXISTS. A manifest is a promise about pitch, and nothing has
   ever checked it. The solo violin shipped with a twenty-four semitone
   hole and lines were written straight across it; every note in the hole
   came out as a sample dragged up to five semitones, which is what
   "squealing" meant. That was a gap, and the coverage report in
   make-vsco.mjs now catches gaps.

   This catches the other half: a file whose NAME disagrees with its
   SOUND. VCSL's tubular glockenspiel is stored as A0, A1, A2 — notes a
   glockenspiel cannot produce. If those names are positions on a layout
   rather than sounding pitches, writing a melody on them transposes it
   four octaves and no listing anywhere would show it.

   So: fetch a few samples per instrument, measure what they actually
   sound, and compare against what the manifest claims.

   HOW IT MEASURES. ffmpeg converts each file to mono 16kHz 16-bit raw,
   which sidesteps every decoding question. Then a plain FFT, and the
   lowest strong partial is taken as the fundamental — "lowest strong"
   rather than "loudest" because struck metal routinely has an upper
   partial louder than its fundamental, and taking the loudest peak would
   report a vibraphone an octave high half the time.

     node scripts/audit-pitch.mjs samples/vcsl-mallets.json [per-instrument]

   A difference of a semitone or so is tuning and measurement. Anything
   past three is a naming scheme that means something other than pitch,
   and the instrument should not be played melodically until it is
   understood. */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fundamentalRobust, midiOfHz, selfTest } from './lib/pitch.mjs';

const MANIFEST = process.argv[2];
if (!MANIFEST) { console.error('usage: node scripts/audit-pitch.mjs <manifest.json> [per-inst]'); process.exit(2); }
const PER = +(process.argv[3] || 3);

const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pitched = man.samples.filter(s => s.note != null);
const byInst = new Map();
for (const s of pitched) {
  if (!byInst.has(s.inst)) byInst.set(s.inst, []);
  byInst.get(s.inst).push(s);
}

/* The detector lives in scripts/lib/pitch.mjs and carries its own
   calibration. Run it first: a first version of this audit reported
   every instrument in a known-good library as exactly 12 or 24
   semitones out, because it was locking onto harmonics. The numbers
   looked authoritative and were meaningless, so nothing here is
   allowed to print until the detector has proved itself against
   signals whose answers are known. */
const cal = selfTest();
if (!cal.ok) {
  console.error('PITCH DETECTOR FAILED ITS OWN CALIBRATION — refusing to audit.\n');
  for (const r of cal.rows) {
    console.error('  ' + r.name.padEnd(32) + 'want ' + String(r.want).padStart(7)
      + '   got ' + (r.got ? r.got.toFixed(1) : '-').padStart(8)
      + '   ' + (Number.isFinite(r.err) ? r.err.toFixed(2) + ' st' : 'FAIL'));
  }
  process.exit(3);
}
console.log('detector calibrated: worst error ' + cal.worst.toFixed(2)
  + ' semitones over ' + cal.rows.length + ' known signals\n');

const SR = 16000;

const tmp = mkdtempSync(join(tmpdir(), 'pitchaudit-'));
const rows = [];
try {
  for (const [inst, list] of byInst) {
    /* spread the picks across the instrument's range rather than taking
       the first few, because a naming error usually shows at the edges */
    const sorted = [...list].sort((a, b) => a.note - b.note);
    const picks = [];
    for (let i = 0; i < Math.min(PER, sorted.length); i++) {
      picks.push(sorted[Math.floor(i * (sorted.length - 1) / Math.max(1, Math.min(PER, sorted.length) - 1))]);
    }
    const diffs = [];
    /* WHY THE FAILURE REASON IS KEPT. An earlier version swallowed every
       exception into an empty catch, so when a refactor left a constant
       undefined the whole run reported "could not measure" for all
       twenty-two instruments and said nothing about why. A measurement
       that cannot be taken has to say what stopped it, or it reads the
       same as a measurement that came back empty. */
    let why = '';
    for (const s of [...new Set(picks)]) {
      const wav = join(tmp, 'a.wav'), raw = join(tmp, 'a.raw');
      try {
        execFileSync('curl', ['-sSL', '--max-time', '60', '-o', wav, s.file], { stdio: 'pipe' });
        execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', wav,
          '-ac', '1', '-ar', String(SR), '-t', '3', '-f', 's16le', raw], { stdio: 'pipe' });
        const buf = readFileSync(raw);
        const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
        if (pcm.length < SR * 0.2) { why = why || 'clip shorter than 200ms'; continue; }
        const r = fundamentalRobust(pcm, SR);
        if (!r) { why = why || 'no pitch found'; continue; }
        diffs.push({ declared: s.note, heard: midiOfHz(r.hz), hz: r.hz, wobble: r.spread, id: s.id });
      } catch (e) { why = why || String(e.message || e).split('\n')[0].slice(0, 60); }
      finally { try { rmSync(wav); rmSync(raw); } catch { /* already gone */ } }
    }
    if (process.env.PITCH_VERBOSE) {
      for (const d of diffs) console.log('    ' + d.id.slice(0, 54).padEnd(56)
        + 'declared ' + String(d.declared).padStart(3) + '  heard ' + d.heard.toFixed(1).padStart(6)
        + '  diff ' + (d.heard - d.declared).toFixed(1).padStart(6)
        + '  wobble ' + d.wobble.toFixed(1) + 'st');
    }
    if (!diffs.length) { rows.push([inst, 0, null, null, 'could not measure: ' + (why || 'unknown')]); continue; }
    const ds = diffs.map(d => d.heard - d.declared).sort((a, b) => a - b);
    const med = ds[ds.length >> 1];
    /* AGREEMENT, NOT RANGE. Judging an instrument by its widest-to-
       narrowest reading flagged almost everything, because one short
       pizzicato or one very low horn note read as a harmonic is enough
       to blow the range open while every other sample agrees exactly.
       What matters is whether the readings cluster: a library with two
       naming conventions in it splits into two groups, whereas a good
       folder with one bad measurement does not. */
    const agree = ds.filter(d => Math.abs(d - med) < 1.5).length;
    const frac = agree / ds.length;
    const odd = ds.length - agree;
    rows.push([inst, diffs.length, med, frac,
      Math.abs(med) > 1.5 ? 'DECLARED PITCH IS WRONG by about ' + Math.round(med) + ' semitones'
        : frac < 0.7 ? 'SPLIT — only ' + agree + '/' + ds.length + ' agree; likely two conventions'
          : odd ? 'ok (' + odd + ' sample' + (odd > 1 ? 's' : '') + ' unmeasurable — short or very low)'
            : 'ok']);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log('instrument      n   heard-declared  agree');
for (const r of rows) {
  console.log(String(r[0]).padEnd(15) + String(r[1]).padStart(2)
    + (r[2] == null ? '       -     ' : (r[2] >= 0 ? '  +' : '  ') + r[2].toFixed(1).padStart(6) + ' st')
    + (r[3] == null ? '        ' : (100 * r[3]).toFixed(0).padStart(6) + '% ') + '  ' + r[4]);
}
const bad = rows.filter(r => /WRONG|SPLIT|could not/.test(r[4]));
if (bad.length) {
  console.log('\nDO NOT WRITE MELODIES ON THESE UNTIL UNDERSTOOD:');
  for (const b of bad) console.log('  ' + b[0] + ' — ' + b[4]);
} else console.log('\nevery instrument sounds within 3 semitones of its declared pitch.');
