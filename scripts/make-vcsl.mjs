/* Build samples/vcsl-mallets.json from the VCSL file listing.

   WHY THESE INSTRUMENTS. A track came back described as "not very hifi",
   and the measurement agreed: against the best-received mix in this repo
   its 8kHz band sat 17dB lower and its 4kHz band 10dB lower, because the
   palette was synthesised, bandpassed and crushed. Nothing in it had any
   real top octave to lose in the first place.

   Struck metal does. A vibraphone bar, a glockenspiel, a tubular bell and
   a wine glass all carry genuine energy to the top of the audible range
   because that is what the material does when you hit it, and these are
   recordings of exactly that rather than an oscillator with a filter on
   it. They are also pitched, which the other obvious source of air —
   cymbals and noise — is not, and a theme has to be played on something.

   So this reaches for the part of VCSL the project never opened: the
   idiophones. Mallets, bells, glass and thumb pianos, plus the unpitched
   metal and wood that belongs alongside them.

   HOW TO RUN IT. The audio is gigabytes and only the paths are wanted,
   so the source is a treeless clone:

     git clone --filter=blob:none --no-checkout --depth 1 \
       https://github.com/sgossner/VCSL.git /tmp/vcsl-idx
     node scripts/make-vcsl.mjs /tmp/vcsl-idx

   Nothing is redistributed: every entry is a raw.githubusercontent URL
   fetched on demand, the same way the VSCO and Naked Drums manifests
   work. VCSL is CC0, so that is courtesy rather than obligation.

   READ THE COVERAGE REPORT IT PRINTS. The violin that got called
   squealing was a five-sample manifest with a twenty-four semitone hole,
   and the hole was invisible until something was written across it. This
   script prints each instrument's range and widest gap for that reason,
   and anything with a gap worth worrying about is listed at the end
   rather than left for a mix to discover. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/make-vcsl.mjs <path-to-VCSL-clone>'); process.exit(2); }
const OUT = resolve(import.meta.dirname, '..', 'samples', 'vcsl-mallets.json');
const RAW = 'https://raw.githubusercontent.com/sgossner/VCSL/master/';

/* OCTAVE NAMING, MEASURED RATHER THAN ASSUMED. Like VSCO, this library
   names its files an octave below what they sound: scripts/audit-pitch.mjs
   reads the whole mallet section at +12.0 with 100% agreement on the
   vibraphone, hand chimes, balafon and glass, against a Salamander piano
   that reads dead zero. So the octave number is one lower than the
   sounding octave and the offset is 2 rather than 1.

   The tubular glockenspiel is six octaves further out again and
   consistently so, which is odd enough to be worth stating: its files
   are named A0..A2 and sound A6..A8, a register a glockenspiel actually
   has. It gets its own offset.

   WHAT IS DELIBERATELY NOT PITCHED. A tubular bell has no fundamental —
   its partials sit near 2:3:4 and the pitch a listener hears is a strike
   note that is not any one of them. Measured, both bell sets split down
   the middle: `chimes` reads +12 on three samples and +24 on four,
   `chimes2` reads 0 on four and +12 on three, all with the detector
   perfectly steady within each sample. That is the instrument, not the
   measurement, and it means no transposition of a bell can be trusted.
   They are carried as colour at their own recorded pitch, which is
   always right, instead of as something to write a melody on. */
const DEFAULT_OCTAVE_OFFSET = 2;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(name, off) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const n = PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return n + (parseInt(m[3], 10) + off) * 12;
}

/* Folder, short tag, category and display name. `pitched` marks the ones
   a melody can be written on; the rest are colour and are mapped to a
   single pad rather than across a keyboard. */
const WANT = [
  /* --- pitched metal: the reason this file exists --- */
  { dir: 'Idiophones/Struck Idiophones/Vibraphone/Soft Mallets', tag: 'vibs',    cat: 'MALLET', name: 'Vibraphone soft', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets', tag: 'vibh',    cat: 'MALLET', name: 'Vibraphone hard', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Vibraphone/Bowed',        tag: 'vibbow',  cat: 'MALLET', name: 'Vibraphone bowed', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Glockenspiel',            tag: 'glock',   cat: 'MALLET', name: 'Glockenspiel', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Tubular Glockenspiel',    tag: 'tglock',  cat: 'MALLET', name: 'Tubular glock', pitched: 1, oct: 7 },
  { dir: 'Idiophones/Struck Idiophones/Tubular Bells 1',         tag: 'chimes',  cat: 'BELL',   name: 'Tubular bells' },
  { dir: 'Idiophones/Struck Idiophones/Tubular Bells 2',         tag: 'chimes2', cat: 'BELL',   name: 'Tubular bells 2' },
  { dir: 'Idiophones/Struck Idiophones/Hand Chimes',             tag: 'hchime',  cat: 'BELL',   name: 'Hand chimes', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Hand Bells, Nepalese',    tag: 'nbell',   cat: 'BELL',   name: 'Nepalese bells', pitched: 1 },
  /* --- pitched wood, for the body the metal has none of --- */
  { dir: 'Idiophones/Struck Idiophones/Marimba',                 tag: 'marimba', cat: 'MALLET', name: 'Marimba', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Xylophone',               tag: 'xylo',    cat: 'MALLET', name: 'Xylophone', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Balafon/Traditional Mallet', tag: 'balafon', cat: 'MALLET', name: 'Balafon', pitched: 1 },
  { dir: 'Idiophones/Struck Idiophones/Balafon/Hard Mallet',     tag: 'balafonh', cat: 'MALLET', name: 'Balafon hard', pitched: 1 },
  /* --- plucked tongues: quiet, close, full of noise at the attack --- */
  { dir: 'Idiophones/Plucked Idiophones/Kalimba, Kenya',         tag: 'kalimba', cat: 'THUMB',  name: 'Kalimba', pitched: 1 },
  { dir: 'Idiophones/Plucked Idiophones/Kalimba, Tanzania',      tag: 'kalimbt', cat: 'THUMB',  name: 'Kalimba Tz', pitched: 1 },
  { dir: 'Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B', tag: 'mbira', cat: 'THUMB', name: 'Mbira', pitched: 1 },
  { dir: 'Idiophones/Plucked Idiophones/Nyunga Nyunga, Mozambique, Low F', tag: 'nyunga', cat: 'THUMB', name: 'Nyunga nyunga', pitched: 1 },
  /* --- glass: sustains, and the separate release takes they need --- */
  { dir: 'Idiophones/Friction Idiophones/Wine Glasses/Sustains', tag: 'glass',   cat: 'GLASS',  name: 'Wine glasses', pitched: 1 },
  /* --- unpitched colour --- */
  { dir: 'Idiophones/Struck Idiophones/Triangles',               tag: 'tri',     cat: 'PERC',   name: 'Triangle' },
  { dir: 'Idiophones/Struck Idiophones/Finger Cymbals',          tag: 'fcym',    cat: 'PERC',   name: 'Finger cymbals' },
  { dir: 'Idiophones/Struck Idiophones/Bell Tree/Individual',    tag: 'btree',   cat: 'PERC',   name: 'Bell tree' },
  { dir: 'Idiophones/Struck Idiophones/Sleigh Bells',            tag: 'sleigh',  cat: 'PERC',   name: 'Sleigh bells' },
  { dir: 'Idiophones/Struck Idiophones/Anvil',                   tag: 'anvil',   cat: 'PERC',   name: 'Anvil' },
  { dir: 'Idiophones/Struck Idiophones/Brake Drum',              tag: 'brake',   cat: 'PERC',   name: 'Brake drum' },
  { dir: 'Idiophones/Struck Idiophones/Claves',                  tag: 'claves',  cat: 'PERC',   name: 'Claves' },
  { dir: 'Idiophones/Struck Idiophones/Woodblock',               tag: 'wblock',  cat: 'PERC',   name: 'Woodblock' },
  { dir: 'Idiophones/Struck Idiophones/Suspended Cymbal 1',      tag: 'suscym',  cat: 'PERC',   name: 'Susp cymbal' },
  { dir: 'Idiophones/Struck Idiophones/Cabasa',                  tag: 'cabasa',  cat: 'PERC',   name: 'Cabasa' },
  { dir: 'Idiophones/Struck Idiophones/Shaker, Small',           tag: 'shaker',  cat: 'PERC',   name: 'Shaker' },
  { dir: 'Idiophones/Struck Idiophones/Slit Drum',               tag: 'slit',    cat: 'PERC',   name: 'Slit drum' },
];

/* Takes that would quietly change an instrument's character if they got
   mixed in with its ordinary notes. `Legacy` folders are older, noisier
   recordings of the same instruments; rolls and scrapes are gestures
   rather than notes; `_Decay` is the release half of a glass sustain and
   belongs to the sustain, not beside it. */
const SKIP = /(legacy|roll|scrape|gliss|_decay|sweep|crescendo)/i;

const files = execFileSync('git', ['-C', SRC, 'ls-tree', '-r', '--name-only', 'HEAD'],
  { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(f => /\.wav$/i.test(f));

/* NOTE AND DYNAMIC OUT OF A FILENAME, across the several naming schemes
   this one library uses: `glock_loud_C5_01`, `chimes_A#3_ff_rr1`,
   `Marimba_hit_Outrigger_B2_loud_01`, `Vibes_bowed_A2_rr1_Main` and
   `Mbira6_Normal_MainSpirit_A4_k1_vl3_rr2` are all present. */
const WORDDYN = { soft: 0, quiet: 0, med: 1, medium: 1, mid: 1, loud: 2, hard: 2 };
const DYNORD = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
function parse(path, oct) {
  const base = path.split('/').pop().replace(/\.wav$/i, '');
  const note = /(?:^|_)([A-Ga-g][#b]?-?\d)(?:_|$)/.exec(base);
  const midi = note ? midiOf(note[1], oct) : null;
  /* `_vl3_` and `_v2_` both appear and both mean the same thing. Matching
     only the first left the vibraphone's two layers indistinguishable, so
     they were sharing a velocity and firing interchangeably. */
  const vl = /_vl?(\d)(?:_|$)/i.exec(base);
  const dyn = /_(pp|p|mp|mf|f|ff)(?:_|$)/.exec(base);
  const word = new RegExp('(?:^|_)(' + Object.keys(WORDDYN).join('|') + ')(?:_|$)', 'i').exec(base);
  return {
    midi, base,
    /* one ordering per scheme, resolved to a rank below */
    vl: vl ? +vl[1] : null,
    dyn: dyn ? dyn[1].toLowerCase() : null,
    word: word ? WORDDYN[word[1].toLowerCase()] : null,
  };
}

const out = [];
const report = [];
const warn = [];
for (const w of WANT) {
  const pre = w.dir.toLowerCase() + '/';
  const mine = files.filter(f => f.toLowerCase().startsWith(pre) && !SKIP.test(f.slice(w.dir.length)));
  const oct = w.oct == null ? DEFAULT_OCTAVE_OFFSET : w.oct;
  const rows = mine.map(f => ({ f, p: parse(f, oct) })).filter(x => !w.pitched || x.p.midi != null);
  if (!rows.length) { report.push([w.tag, 0, 0, 0, 'NO FILES MATCHED']); warn.push(w.tag + ': no files'); continue; }

  /* A dynamic marking is a position in a scale, so it only means anything
     once you know how many the recordist actually made. Collect the
     distinct levels present for THIS instrument, then space them across
     the velocity range by centres rather than edges — with three layers
     the quiet one should answer for everything up to about a third, not
     for velocity zero alone. */
  const scheme = rows.some(r => r.p.vl != null) ? 'vl'
    : rows.some(r => r.p.dyn) ? 'dyn'
      : rows.some(r => r.p.word != null) ? 'word' : null;
  const levels = scheme === 'vl' ? [...new Set(rows.map(r => r.p.vl).filter(x => x != null))].sort((a, b) => a - b)
    : scheme === 'dyn' ? [...new Set(rows.map(r => r.p.dyn).filter(Boolean))].sort((a, b) => DYNORD.indexOf(a) - DYNORD.indexOf(b))
      : scheme === 'word' ? [...new Set(rows.map(r => r.p.word).filter(x => x != null))].sort((a, b) => a - b) : [];
  const steps = levels.length || 1;
  const velOf = (p) => {
    if (steps < 2) return 0.8;
    const key = scheme === 'vl' ? p.vl : scheme === 'dyn' ? p.dyn : p.word;
    const i = levels.indexOf(key);
    if (i < 0) return 0.8;
    return +(((i + 0.5) / steps) * 0.94 + 0.05).toFixed(4);
  };

  const notes = new Set();
  for (const r of rows) {
    if (w.pitched && r.p.midi != null) notes.add(r.p.midi);
    out.push({
      id: 'vc:' + w.tag + '-' + r.p.base,
      name: w.name + (r.p.midi != null ? ' ' + r.p.midi : ''),
      cat: w.cat,
      file: RAW + r.f.split('/').map(encodeURIComponent).join('/'),
      ...(w.pitched && r.p.midi != null ? { note: r.p.midi } : {}),
      vel: velOf(r.p),
      inst: w.tag,
    });
  }
  const ns = [...notes].sort((a, b) => a - b);
  const gap = ns.length > 1 ? Math.max(...ns.slice(1).map((n, i) => n - ns[i])) : 0;
  report.push([w.tag, rows.length, ns.length, steps,
    ns.length ? 'range ' + ns[0] + '-' + ns[ns.length - 1] + ', widest gap ' + gap : 'unpitched']);
  /* Three semitones is about as far as a struck bar can be dragged before
     it stops sounding like its own instrument; past six it is a different
     one. Anything wider gets named here so a melody is never written
     across it by accident. */
  if (w.pitched && gap > 6) warn.push(w.tag + ': ' + gap + '-semitone gap — do not write a line across it');
  else if (w.pitched && ns.length < 8) warn.push(w.tag + ': only ' + ns.length + ' distinct notes');
}

out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
writeFileSync(OUT, JSON.stringify({
  name: 'VCSL — idiophones: mallets, bells, glass and metal (CC0)',
  license: 'CC0 1.0 Universal — Versilian Community Sample Library by Versilian Studios '
    + '(Sam Gossner). Public domain: free to use, modify, sell and redistribute.',
  source: 'https://github.com/sgossner/VCSL',
  note: 'Generated by scripts/make-vcsl.mjs from the repository tree. Fetched on '
    + 'demand; no audio is stored here. Struck and plucked idiophones, carried '
    + 'for the real top octave that synthesised sources do not have.',
  samples: out,
}, null, 1) + '\n');

console.log('instrument      files notes layers');
for (const r of report) console.log(String(r[0]).padEnd(15) + String(r[1]).padStart(5)
  + String(r[2]).padStart(6) + String(r[3]).padStart(7) + '  ' + r[4]);
console.log('\n' + out.length + ' samples → ' + OUT);
if (warn.length) {
  console.log('\nWATCH OUT (' + warn.length + '):');
  for (const w of warn) console.log('  ' + w);
}
