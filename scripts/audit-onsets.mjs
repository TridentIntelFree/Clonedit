/* DOES A FOUND-SOUND PACK'S `onset` FIELD POINT AT THE SOUND?
 *
 * AGENTS.md tells you to read that field and set a pad's `start` from
 * it, because an ESC-50 clip is five seconds long with the event
 * somewhere inside and a pad that starts at 0 opens on room tone. That
 * advice is right and it is only as good as the numbers, and four of
 * the twelve in samples/foundkit.json were wrong when this was written:
 *
 *   fk:snare  declared 0.028  real attack 0.135   73dB down at the value
 *   fk:can    declared 0.100  real attack 0.250   68dB down
 *   fk:tom    declared 0.906  first event 0.210   36dB down
 *   fk:hat    declared 0.258  no transient within 400ms
 *
 * Trimming to a value that sits 70dB below the file's own peak produces
 * exactly the fault AGENTS.md describes two sections earlier — a pad
 * that measures -70dB in the mix, where every instinct says "turn it
 * up" and gain cannot reach it because the sound is not playing yet.
 * The cure was the cause.
 *
 * So this measures rather than trusts. Run it over a manifest and a
 * directory of that pack's audio:
 *
 *   node scripts/audit-onsets.mjs samples/foundkit.json <dir-of-wavs>
 *
 * It needs ffmpeg on PATH to decode, and the files local — the packs
 * are served beside the app and the repo ships no audio, so download
 * them into their own directory first. Nothing is written; it prints a
 * verdict per sample and exits non-zero if any are wrong, so it can
 * gate a pack before anyone writes a part for it.
 *
 * TWO MEASUREMENTS, because they answer different questions. The
 * ENVELOPE CROSSING is where the file first becomes audible at all and
 * is what a `start` trim wants. The ONSET DETECTOR finds every attack
 * and is what tells you whether the clip holds one event or twenty. A
 * clip that is loud from sample zero has no onset to trim to, and that
 * is reported as its own answer rather than as a fault — several of
 * these are field recordings that simply start.
 */

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { onsets } from '../src/pure/take.js';
import { envelopeRms } from '../src/pure/timbre.js';

const WIN = 0.005;
const SR = 44100;

function decode(file, tmp) {
  const out = join(tmp, basename(file).replace(/\.[^.]+$/, '') + '.raw');
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le',
    '-ac', '1', '-ar', String(SR), out]);
  const buf = readFileSync(out);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/* The first time the file is within `db` of its own peak. Relative
   rather than absolute because these clips arrive at any level, and a
   fixed -40dBFS gate finds everything in a hot one and nothing in a
   quiet one. */
function crossing(env, peak, db) {
  const th = peak * Math.pow(10, db / 20);
  for (let i = 0; i < env.length; i++) if (env[i] >= th) return +(i * WIN).toFixed(3);
  return null;
}

function main() {
  const [manifestPath, dir] = process.argv.slice(2);
  if (!manifestPath || !dir) {
    console.error('usage: node scripts/audit-onsets.mjs <manifest.json> <dir-of-audio>');
    process.exit(2);
  }
  const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const samples = (man.samples || []).filter(s => s.onset != null);
  if (!samples.length) {
    console.log('no sample in this manifest declares an onset — nothing to audit.');
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'jbh-onsets-'));
  const bad = [];
  console.log(manifestPath + ' — ' + samples.length + ' samples declare an onset\n');
  console.log('id'.padEnd(12) + 'declared  audible   dB there  attacks  verdict');
  try {
    for (const s of samples) {
      const name = (s.id || '').replace(/[^a-zA-Z0-9]/g, '_');
      /* the manifest names a URL; the local file is whatever it was
         saved as, so try the id and the URL's basename */
      const cands = [join(dir, name + '.wav'), join(dir, name + '.raw')];
      if (s.file) cands.push(join(dir, basename(s.file)));
      const hit = cands.find(existsSync);
      if (!hit) {
        console.log((s.id || '?').padEnd(12) + String(s.onset).padEnd(10)
          + 'not found locally — skipped');
        continue;
      }
      const d = hit.endsWith('.raw')
        ? (() => { const b = readFileSync(hit);
          return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); })()
        : decode(hit, tmp);
      const env = envelopeRms(d, SR, WIN);
      let peak = 0;
      for (const v of env) if (v > peak) peak = v;
      if (peak <= 0) {
        console.log((s.id || '?').padEnd(12) + String(s.onset).padEnd(10) + 'SILENT FILE');
        bad.push([s.id, 'the file is silent']);
        continue;
      }
      const audible = crossing(env, peak, -30);
      const at = env[Math.round(s.onset / WIN)] || 0;
      const atDb = at > 0 ? 20 * Math.log10(at / peak) : -Infinity;
      const found = onsets(d, SR);
      /* WRONG means: the declared point is in near-silence AND the file
         becomes audible somewhere clearly else. Either alone is not a
         fault — a clip can be quiet at its onset and rise smoothly, and
         a clip that is loud from zero has a meaningless onset but
         trimming to it costs nothing. */
      const quietThere = atDb < -35;
      const elsewhere = audible != null && Math.abs(audible - s.onset) > 0.05;
      const wrong = quietThere && elsewhere;
      if (wrong) bad.push([s.id, 'declared ' + s.onset + ' sits '
        + (atDb === -Infinity ? "-inf" : Math.round(-atDb) + "dB") + " down; audible from " + audible]);
      console.log((s.id || '?').padEnd(12)
        + String(s.onset).padEnd(10)
        + String(audible == null ? '—' : audible).padEnd(10)
        + (atDb === -Infinity ? '-inf' : Math.round(atDb) + 'dB').padEnd(10)
        + String(found.length).padStart(5) + '    '
        + (wrong ? 'ONSET IS WRONG'
          : audible === 0 ? 'ok (loud from the start)' : 'ok'));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (bad.length) {
    console.log('\n' + bad.length + ' declared onset(s) do not point at the sound:');
    for (const [id, why] of bad) console.log('  ' + id + ' — ' + why);
    console.log('\nA pad trimmed to one of these opens on room tone and measures'
      + '\nabout -70dB in the mix, which reads as "too quiet" and cannot be'
      + '\nfixed with gain. Fix the manifest, not the level.');
    process.exit(1);
  }
  console.log('\nevery declared onset points at audible sound.');
}

main();
