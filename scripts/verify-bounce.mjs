/* CHECK THE FILE, NOT THE APP'S OPINION OF IT.
   ============================================
   Every analyser in this repo measures the app's own render with the
   app's own code. That is circular, and it hid something large: the
   app reported MERIDIAN at -16.2 LUFS with a 95% beat and every pad
   owning a band, while 62% of the delivered file was digital silence
   at -91dB. Not quiet. Nothing.

   It hid because every check here reports an INTEGRATED figure over
   the whole render, and integrated LUFS is gated — silence is
   excluded from it by definition. compare(), loudness(), place() and
   pulse() all look at the piece as one lump. Nothing in the app looks
   at the time axis, so a track can be half empty and score well.

   This reads the bounced file with ffmpeg, which knows nothing about
   the app, and asks the questions the app cannot:

     is any of it silent, and for how long
     does the level hold up across the whole duration
     does it clip, or carry DC
     what does its spectrum actually look like
     is it mono-compatible

   Run it on every bounce. Trusting a measurement made by the thing
   being measured is how three tracks went out broken.

   usage: node scripts/verify-bounce.mjs <file.wav|mp3> [--ref samples/ref-*.json] */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node scripts/verify-bounce.mjs <audiofile> [--ref profile.json]');
  process.exit(2);
}
const refIdx = process.argv.indexOf('--ref');
const refPath = refIdx > 0 ? process.argv[refIdx + 1] : null;

/* ffmpeg writes every one of these to stderr, and at INFO level —
   -v error hides the only thing the call is for, which is a trap this
   repo has now fallen into twice. */
const ff = (args) => spawnSync('ffmpeg',
  ['-nostdin', '-v', 'info', ...args, '-f', 'null', '-'],
  { encoding: 'utf8', timeout: 300000 }).stderr || '';

const dur = (() => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat((r.stdout || '0').trim()) || 0;
})();

let problems = 0;
const fail = (s) => { problems++; console.log('  FAIL  ' + s); };
const pass = (s) => console.log('  ok    ' + s);

console.log('\n' + file + '  ' + dur.toFixed(1) + 's\n');

/* ---- 1. SILENCE. The one that got through. --------------------------- */
console.log('SILENCE');
{
  const out = ff(['-i', file, '-af', 'silencedetect=noise=-50dB:d=0.4']);
  const spans = [];
  const re = /silence_start:\s*(-?[\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(out))) spans.push([Math.max(0, +m[1]), +m[2]]);
  const quiet = spans.reduce((a, [s, e]) => a + (e - s), 0);
  const pct = dur ? 100 * quiet / dur : 0;
  if (!spans.length) pass('no stretch below -50dB lasting 0.4s or more');
  else {
    const line = spans.slice(0, 6)
      .map(([s, e]) => s.toFixed(1) + '-' + e.toFixed(1) + 's').join(', ');
    const msg = quiet.toFixed(1) + 's of ' + dur.toFixed(1) + 's is silent ('
      + pct.toFixed(0) + '%): ' + line;
    pct >= 10 ? fail(msg) : pass(msg);
  }
}

/* ---- 2. DOES THE LEVEL HOLD UP ACROSS THE PIECE ---------------------- */
console.log('\nLEVEL OVER TIME  (10s windows)');
{
  const vols = [];
  for (let t = 0; t + 1 < dur; t += 10) {
    const out = ff(['-ss', String(t), '-t', '10', '-i', file, '-af', 'volumedetect']);
    const mm = /mean_volume:\s*(-?[\d.]+) dB/.exec(out);
    const pk = /max_volume:\s*(-?[\d.]+) dB/.exec(out);
    vols.push({ t, mean: mm ? +mm[1] : -99, peak: pk ? +pk[1] : -99 });
  }
  for (const v of vols) {
    const bar = '#'.repeat(Math.max(0, Math.round((v.mean + 60) / 2)));
    console.log('   ' + String(v.t + 's').padStart(5) + '  '
      + v.mean.toFixed(1).padStart(7) + 'dB  ' + bar);
  }
  const live = vols.filter(v => v.mean > -60);
  if (!live.length) fail('nothing above -60dB anywhere');
  else {
    const lo = Math.min(...live.map(v => v.mean)), hi = Math.max(...live.map(v => v.mean));
    const dead = vols.length - live.length;
    if (dead) fail(dead + ' of ' + vols.length + ' windows are effectively silent');
    else pass('every window carries audio');
    (hi - lo > 25)
      ? fail('level swings ' + (hi - lo).toFixed(0) + 'dB between windows — '
             + 'that is a hole or a pile-up, not dynamics')
      : pass('level varies ' + (hi - lo).toFixed(0) + 'dB across the piece');
  }
}

/* ---- 3. LOUDNESS AND PEAK, MEASURED OUTSIDE THE APP ------------------ */
console.log('\nLOUDNESS (EBU R128)');
{
  const full = ff(['-i', file, '-af', 'ebur128=peak=true']);
  /* ebur128 prints a running line per frame AND a Summary at the end,
     and both contain "I:" and "LRA:". Matching the first hit reads the
     opening frame — which on a track that starts quiet gave -70 LUFS
     and a range of 0, numbers that are simply the first 100ms. Only
     the Summary block is the measurement. */
  const si = full.lastIndexOf('Summary:');
  const out = si >= 0 ? full.slice(si) : full;
  const g = (re) => { const m = re.exec(out); return m ? +m[1] : null; };
  const I = g(/I:\s*(-?[\d.]+) LUFS/), LRA = g(/LRA:\s*([\d.]+) LU/);
  const TP = g(/Peak:\s*(-?[\d.]+) dBFS/);
  if (si < 0) fail('could not find ebur128 Summary — loudness NOT measured');
  console.log('   integrated ' + I + ' LUFS   range ' + LRA + ' LU   true peak ' + TP + ' dBFS');
  if (TP != null) (TP > -0.5 ? fail('true peak ' + TP + ' dBFS — will clip on lossy encode')
    : pass('true peak has headroom'));
  if (LRA != null) (LRA > 20
    ? fail('loudness range ' + LRA + ' LU is enormous — usually a dead section')
    : pass('loudness range ' + LRA + ' LU'));
}

/* ---- 4. DC, CLIPPING, MONO COMPATIBILITY ----------------------------- */
console.log('\nSIGNAL HEALTH');
{
  /* plain astats: naming measure_overall produced neither line, and a
     check that prints nothing reads exactly like a check that passed */
  const out = ff(['-i', file, '-af', 'astats']);
  const dc = /DC offset:\s*(-?[\d.]+)/.exec(out);
  /* this ffmpeg's astats has no "Number of clipped samples" field at
     all — the check was matching a string that never appears, and so
     never ran. The fields that do exist are Peak level dB and Abs
     Peak count. */
  const pk = /Peak level dB:\s*(-?[\d.]+|inf)/.exec(out);
  const apc = /Abs Peak count:\s*(\d+)/.exec(out);
  dc ? (Math.abs(+dc[1]) > 0.01 ? fail('DC offset ' + dc[1]) : pass('no DC offset'))
     : fail('astats reported no DC offset — the check did not run');
  if (pk) {
    const v = pk[1] === 'inf' ? 0 : +pk[1];
    (v >= -0.1 ? fail('sample peak ' + pk[1] + ' dB — at or over full scale'
      + (apc ? ', ' + apc[1] + ' samples at peak' : ''))
      : pass('sample peak ' + pk[1] + ' dB'));
  } else fail('astats gave no peak level — the check did not run');
  /* mono fold-down: if the sum is far below the stereo level, the sides
     are fighting and a phone will lose the difference */
  const st = /mean_volume:\s*(-?[\d.]+) dB/.exec(ff(['-i', file, '-af', 'volumedetect']));
  const mo = /mean_volume:\s*(-?[\d.]+) dB/.exec(
    ff(['-i', file, '-af', 'pan=mono|c0=0.5*c0+0.5*c1,volumedetect']));
  if (st && mo) {
    const d = +mo[1] - +st[1];
    (d < -3 ? fail('mono fold-down loses ' + (-d).toFixed(1) + 'dB — phase trouble in the sides')
      : pass('mono fold-down loses ' + (-d).toFixed(1) + 'dB'));
  }
  /* HOW WIDE IS IT, which a fold-down test cannot tell you: a mix with
     no sides at all folds down perfectly and is still mono. */
  const side = /mean_volume:\s*(-?[\d.]+) dB/.exec(
    ff(['-i', file, '-af', 'pan=mono|c0=c0-c1,volumedetect']));
  if (side && st) {
    const w = +side[1] - +st[1];
    console.log('   stereo width: sides are ' + w.toFixed(1) + 'dB against the mix'
      + (w < -25 ? '  (essentially mono)' : w < -15 ? '  (narrow)' : ''));
  }
}

/* ---- 5. SPECTRUM, AND A REFERENCE IF ONE IS GIVEN -------------------- */
if (refPath && existsSync(refPath)) {
  console.log('\nSPECTRUM vs ' + refPath.replace(/^.*\//, ''));
  const ref = JSON.parse(readFileSync(refPath, 'utf8'));
  const BANDS = (ref.shape || []).map(b => [b.band, b.lo, b.hi, b.rel]);
  const lv = [];
  for (const [band, lo, hi] of BANDS) {
    const out = ff(['-i', file, '-af',
      `highpass=f=${lo}:poles=2,highpass=f=${lo}:poles=2,`
      + `lowpass=f=${hi}:poles=2,lowpass=f=${hi}:poles=2,volumedetect`]);
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(out);
    lv.push({ band, db: m ? +m[1] : -99 });
  }
  const tot = 10 * Math.log10(lv.reduce((a, b) => a + Math.pow(10, b.db / 10), 0));
  let worst = null;
  for (let i = 0; i < lv.length; i++) {
    const rel = +(lv[i].db - tot).toFixed(1), want = BANDS[i][3];
    const d = +(rel - want).toFixed(1);
    if (!worst || Math.abs(d) > Math.abs(worst.d)) worst = { band: lv[i].band, d };
    console.log('   ' + String(lv[i].band).padEnd(10) + 'got ' + String(rel).padStart(7)
      + '  want ' + String(want).padStart(7) + '  ' + (d >= 0 ? '+' : '') + d);
  }
  if (worst) (Math.abs(worst.d) > 8
    ? fail('worst band ' + worst.band + ' is ' + worst.d + 'dB from the reference')
    : pass('worst band ' + worst.band + ' is ' + worst.d + 'dB from the reference'));
}

console.log('\n' + (problems ? problems + ' PROBLEM' + (problems > 1 ? 'S' : '')
  + ' in the delivered file' : 'the delivered file passes every check here'));
process.exit(problems ? 1 : 0);
