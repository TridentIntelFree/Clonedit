/* What every instrument in a pack actually sounds like, measured once.

   WHY. Almost every mixing mistake in this repo came from not knowing a
   fact that a measurement would have given in a second.

     - Levels were staged by ear across sources that differ by 35dB on
       disk, which collapsed a whole track to kick and sub.
     - A palette was chosen for its "real top octave" and the headline
       instrument turned out to be the dullest thing in the library: a
       vibraphone struck with soft mallets is 80dB down above 8kHz.
     - The bell tree was lifted to maximum gain and stayed inaudible,
       because it peaks at -44dBFS on disk and gain stops at +6.

   Each of those was found by measuring, late, after a bounce had
   already gone out. None of them needed to be found twice. A pack's
   timbre does not change, so this measures it once and writes it down.

     node scripts/timbre-atlas.mjs samples/vcsl-mallets.json
     node scripts/timbre-atlas.mjs samples/vsco-orch.json

   Writes samples/atlas-<pack>.json: per instrument, the level it
   arrives at, the band it owns, how fast it starts and how long it
   rings. That is the information needed to choose a sound for a job
   rather than choosing one and discovering afterwards that it cannot
   do the job.

   It is a cache, not a source of truth — regenerate it when a manifest
   changes. Nothing is redistributed; it stores numbers about sounds,
   not sounds. */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { fft } from './lib/pitch.mjs';

const MANIFEST = process.argv[2];
if (!MANIFEST) {
  console.error('usage: node scripts/timbre-atlas.mjs <manifest.json> [per-instrument]');
  process.exit(2);
}
const PER = +(process.argv[3] || 2);
const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const OUT = resolve(resolve(MANIFEST, '..'),
  'atlas-' + basename(MANIFEST).replace(/\.json$/, '') + '.json');

const SR = 44100;
const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000],
  [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
const bandName = ([a, b]) => {
  const s = (n) => n >= 1000 ? (n / 1000) + 'k' : '' + n;
  return s(a) + '-' + s(b);
};

/* group by instrument where the manifest says so, otherwise treat the
   whole pack as one — the unpitched kits have no `inst` field and are
   still worth knowing about */
const byInst = new Map();
for (const s of man.samples || []) {
  const k = s.inst || s.cat || '(pack)';
  if (!byInst.has(k)) byInst.set(k, []);
  byInst.get(k).push(s);
}

const tmp = mkdtempSync(join(tmpdir(), 'atlas-'));
function pcmOf(url) {
  const bin = join(tmp, 'a.bin'), raw = join(tmp, 'a.raw');
  let r = spawnSync('curl', ['-sSL', '--max-time', '60', '-o', bin, url], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', bin,
    '-ac', '1', '-ar', String(SR), '-t', '6', '-f', 's16le', raw], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    const b = readFileSync(raw);
    return new Int16Array(b.buffer, b.byteOffset, b.length >> 1);
  } catch { return null; }
}

/* ENVELOPE IN 5ms WINDOWS, which is where attack and decay come from.
   A 10ms window was once too coarse to see a cello's attack at all and
   counted four of the eight articulations actually played. */
function envelope(pcm) {
  const w = Math.floor(SR * 0.005), e = [];
  for (let i = 0; i + w < pcm.length; i += w) {
    let s = 0;
    for (let j = i; j < i + w; j++) { const v = pcm[j] / 32768; s += v * v; }
    e.push(Math.sqrt(s / w));
  }
  return e;
}
function shapeOf(pcm) {
  /* one frame from just past the attack, where the tone is established */
  const N = 16384, off = Math.min(Math.max(0, pcm.length - N), Math.floor(SR * 0.04));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const v = i + off < pcm.length ? pcm[i + off] / 32768 : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  }
  fft(re, im);
  const binHz = SR / N, pw = new Array(BANDS.length).fill(0);
  for (let i = 1; i < N / 2; i++) {
    const hz = i * binHz;
    const b = BANDS.findIndex(([lo, hi]) => hz >= lo && hz < hi);
    if (b >= 0) pw[b] += re[i] * re[i] + im[i] * im[i];
  }
  const tot = pw.reduce((a, c) => a + c, 0) || 1e-12;
  return pw.map((p, i) => ({ band: bandName(BANDS[i]),
    rel: +(10 * Math.log10(Math.max(p, 1e-12) / tot)).toFixed(1) }));
}

const rows = [];
try {
  for (const [inst, list] of byInst) {
    const sorted = [...list].sort((a, b) => (a.note || 0) - (b.note || 0));
    const picks = [];
    for (let i = 0; i < Math.min(PER, sorted.length); i++) {
      picks.push(sorted[Math.floor(i * (sorted.length - 1) / Math.max(1, Math.min(PER, sorted.length) - 1))]);
    }
    const got = [];
    for (const s of [...new Set(picks)]) {
      const pcm = pcmOf(s.file);
      if (!pcm || pcm.length < SR * 0.02) continue;
      let pk = 0, pkAt = 0;
      for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]);
        if (a > pk) { pk = a; pkAt = i; } }
      if (pk < 64) continue;                        /* effectively silent */
      const env = envelope(pcm);
      let emax = 0, emaxAt = 0;
      for (let i = 0; i < env.length; i++) if (env[i] > emax) { emax = env[i]; emaxAt = i; }
      /* attack: to 90% of the envelope peak. decay: from the peak down
         20dB, which is where a sound stops carrying rather than where
         it technically ends */
      let a90 = emaxAt;
      for (let i = 0; i <= emaxAt; i++) if (env[i] >= emax * 0.9) { a90 = i; break; }
      let d20 = env.length - 1;
      for (let i = emaxAt; i < env.length; i++) if (env[i] <= emax * 0.1) { d20 = i; break; }
      got.push({
        peakDb: +(20 * Math.log10(pk / 32768)).toFixed(1),
        attackMs: +(a90 * 5).toFixed(0),
        decayMs: +((d20 - emaxAt) * 5).toFixed(0),
        shape: shapeOf(pcm),
      });
    }
    if (!got.length) { rows.push({ instrument: inst, samples: list.length, measured: 0 }); continue; }
    const med = (xs) => { const v = [...xs].sort((a, b) => a - b); return v[v.length >> 1]; };
    const shape = BANDS.map((B, i) => ({ band: bandName(B),
      rel: +med(got.map(g => g.shape[i].rel)).toFixed(1) }));
    let owns = shape[0], air = 0, body = 0;
    for (const b of shape) if (b.rel > owns.rel) owns = b;
    for (let i = 0; i < shape.length; i++) {
      if (BANDS[i][0] >= 2000) air += Math.pow(10, shape[i].rel / 10);
      if (BANDS[i][0] < 500) body += Math.pow(10, shape[i].rel / 10);
    }
    rows.push({
      instrument: inst, samples: list.length, measured: got.length,
      peakDb: +med(got.map(g => g.peakDb)).toFixed(1),
      attackMs: +med(got.map(g => g.attackMs)).toFixed(0),
      decayMs: +med(got.map(g => g.decayMs)).toFixed(0),
      /* how much of this sound lives above 2kHz against below 500 — the
         single number that says whether it can carry air */
      airVsBodyDb: +(10 * Math.log10(Math.max(air, 1e-12) / Math.max(body, 1e-12))).toFixed(1),
      owns: owns.band, shape,
    });
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

rows.sort((a, b) => (b.airVsBodyDb == null ? -999 : b.airVsBodyDb)
  - (a.airVsBodyDb == null ? -999 : a.airVsBodyDb));
writeFileSync(OUT, JSON.stringify({
  pack: man.name || basename(MANIFEST), source: man.source || '',
  note: 'Measured by scripts/timbre-atlas.mjs. peakDb is the level the sample '
    + 'ARRIVES at, which is what gain has to correct for first. airVsBodyDb is energy '
    + 'above 2kHz against below 500Hz: positive carries air, strongly negative cannot, '
    + 'whatever is done to it with a filter.',
  instruments: rows,
}, null, 1) + '\n');

console.log('instrument       peak   attack   decay    air-vs-body   owns');
for (const r of rows) {
  if (!r.measured) { console.log(String(r.instrument).padEnd(16) + '  (could not measure)'); continue; }
  console.log(String(r.instrument).padEnd(16)
    + String(r.peakDb).padStart(6) + String(r.attackMs + 'ms').padStart(8)
    + String(r.decayMs + 'ms').padStart(8) + String(r.airVsBodyDb).padStart(13)
    + '   ' + r.owns);
}
console.log('\n' + rows.length + ' instruments → ' + OUT);
