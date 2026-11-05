/* WHAT DOES A KICK ACTUALLY LOOK LIKE, as nine band levels.

   ROLE_TARGETS gives each job two numbers — air-vs-body and a centroid
   range — which is enough to RECOGNISE a sound and not enough to MAKE
   one. Two constraints cannot specify nine bands, so bending a sample
   toward a role needs a target SHAPE, and inventing one would be the
   fabrication this repo keeps a section about.

   So it is measured, from the labelled samples of a real pack, the same
   way src/pure/grooves.js was measured from the Groove MIDI Dataset.
   The output is the mean relative band level per role, which an EQ match
   can aim a real sample at.

   Run:  node scripts/study-role-shapes.mjs
   Emits: src/pure/roleshapes.js

   IT REFUSES TO WRITE unless the shapes it measured are ordered the way
   the instruments are — kick darkest, hat brightest, snare between — on
   the same air-vs-body axis ROLE_TARGETS uses. A table that fails that
   is a decoding or labelling mistake, not a discovery, and the whole
   point of a baked table is that nobody re-derives it later. */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BANDS, bandName, bandEnergies, fromShape } from '../src/pure/padprofile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;

/* The labels are the file names, which for this pack are unambiguous —
   `kick_909` is a kick. That is the whole reason this pack is the one
   measured: it says what each sample is, in the one place a generated
   manifest cannot fake. */
const LABEL = id =>
  /kick/.test(id) ? 'kick'
    : /snare|clap|rimshot/.test(id) ? 'snare'
      : /hat|crash|ride|shaker|tambourine|clave/.test(id) ? 'hat'
        : /bass808/.test(id) ? 'bass'
          : null;

const man = JSON.parse(readFileSync(resolve(ROOT, 'samples/jbh-drums.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'roleshapes-'));

function pcm(file) {
  const raw = join(tmp, 'a.raw');
  const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y',
    '-i', resolve(ROOT, 'samples', file),
    '-ac', '1', '-ar', String(SR), '-f', 'f32le', raw], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const b = readFileSync(raw);
  return new Float32Array(b.buffer, b.byteOffset, b.length >> 2);
}

const byRole = new Map();
const used = [];
for (const s of man.samples || []) {
  const role = LABEL(s.id);
  if (!role) continue;
  const data = pcm(s.file);
  if (!data || !data.length) { console.log('  skipped (no audio):', s.id); continue; }
  const b = bandEnergies(data, SR);
  if (!b) { console.log('  skipped (silent):', s.id); continue; }
  if (!byRole.has(role)) byRole.set(role, []);
  byRole.get(role).push(b.bands.map(x => x.rel));
  used.push(role + '  ' + s.id.padEnd(22) + b.owns.padEnd(9)
    + String(b.centroidHz).padStart(6) + 'Hz' + String(b.airVsBodyDb).padStart(8) + 'dB');
}

console.log('measured:');
for (const line of used) console.log('  ' + line);

/* MEAN IN THE ENERGY DOMAIN, not the dB domain. Averaging decibels
   gives the geometric mean, which drags a band toward whichever sample
   had the least of it and is not the average spectrum of anything. */
const shapes = {};
for (const [role, rows] of byRole) {
  const n = BANDS.length, lin = new Array(n).fill(0);
  for (const r of rows) for (let i = 0; i < n; i++) lin[i] += Math.pow(10, r[i] / 10);
  shapes[role] = {
    n: rows.length,
    bands: BANDS.map((b, i) => ({
      band: bandName(b), lo: b[0], hi: b[1],
      rel: +(10 * Math.log10(lin[i] / rows.length)).toFixed(1),
    })),
  };
}

console.log('\nrole shapes:');
for (const role of Object.keys(shapes)) {
  const m = fromShape(shapes[role].bands);
  shapes[role].airVsBodyDb = m.airVsBodyDb;
  shapes[role].centroidHz = m.centroidHz;
  console.log('  ' + role.padEnd(6) + 'n=' + shapes[role].n
    + '  air ' + String(m.airVsBodyDb).padStart(7) + 'dB  centroid '
    + String(m.centroidHz).padStart(6) + 'Hz');
  console.log('        ' + shapes[role].bands.map(b => b.band + ':' + b.rel).join('  '));
}

/* ---- THE GATE ------------------------------------------------------ */
const air = r => shapes[r] && shapes[r].airVsBodyDb;
const problems = [];
for (const r of ['kick', 'snare', 'hat']) if (!shapes[r]) problems.push('no ' + r + ' measured');
if (!problems.length) {
  if (!(air('kick') < air('snare'))) problems.push('kick is not darker than snare ('
    + air('kick') + ' vs ' + air('snare') + ')');
  if (!(air('snare') < air('hat'))) problems.push('snare is not darker than hat ('
    + air('snare') + ' vs ' + air('hat') + ')');
  for (const r of Object.keys(shapes))
    if (shapes[r].n < 3) problems.push(r + ' rests on only ' + shapes[r].n + ' samples');
}
if (problems.length) {
  console.error('\nREFUSING TO WRITE — the shapes are not ordered like the instruments:');
  for (const p of problems) console.error('  ' + p);
  console.error('That is a decoding or labelling mistake, not a discovery.');
  process.exit(2);
}

const header = `/* GENERATED by scripts/study-role-shapes.mjs — do not edit by hand.

   The mean spectrum of each drum job, as nine band levels relative to
   the sample's own total, measured from the labelled samples of
   samples/jbh-drums.json.

   WHY THIS EXISTS. ROLE_TARGETS in padprofile.js gives two numbers per
   role — air-vs-body and a centroid range — which is enough to
   RECOGNISE a sound and not enough to MAKE one: two constraints cannot
   specify nine bands. Bending a real sample toward a role needs
   something to aim at, and this is it, measured rather than invented.

   WHAT IT IS NOT. ${Object.values(shapes).reduce((a, s) => a + s.n, 0)} samples from one pack is not a corpus. It
   is the average of a handful of recordings that are unambiguously
   labelled, which is the best evidence in this repo and a long way from
   "what a kick is". The generator refuses to write unless kick is
   darker than snare and snare darker than hat on the same axis
   ROLE_TARGETS uses, so a decoding mistake cannot land here quietly.
*/
`;

const body = 'export const ROLE_SHAPES = ' + JSON.stringify(shapes, null, 2) + ';\n';
writeFileSync(resolve(ROOT, 'src/pure/roleshapes.js'), header + body);
console.log('\nwrote src/pure/roleshapes.js');
