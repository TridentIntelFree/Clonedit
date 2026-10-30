/* Build samples/vsco-orch.json from the VSCO-2 CE file listing.

   WHY THIS EXISTS AS A SCRIPT. The manifest it replaces was written by
   hand, and the hand missed things: the solo violin had five entries
   against the library's two hundred and ninety-two, with a twenty-four
   semitone hole between C4 and C6 and no dynamics at all. A lead line
   written in that hole is a C6 sample dragged down five semitones with no
   velocity layer behind it, which is why the one piece that leaned on the
   violin came back described as squealing. The samples were there the
   whole time. Nobody had listed them.

   So the listing is generated from the repository tree and not typed.

   HOW TO RUN IT. The audio is gigabytes and none of it is wanted here —
   only the paths — so the source is a treeless clone:

     git clone --filter=blob:none --no-checkout --depth 1 \
       https://github.com/sgossner/VSCO-2-CE.git /tmp/vsco-idx
     node scripts/make-vsco.mjs /tmp/vsco-idx

   Nothing is redistributed: every entry is a raw.githubusercontent URL
   fetched on demand, exactly as the Naked Drums manifest works. VSCO-2 CE
   is CC0, so this is courtesy rather than obligation.

   IT IS A NEW FILE, NOT A REPLACEMENT. Projects saved against the old
   vsco:* ids keep resolving, because sample ids are how a song doc names
   its sounds and silently renaming them would empty somebody's pads. */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/make-vsco.mjs <path-to-VSCO-2-CE-clone>'); process.exit(2); }
const OUT = resolve(import.meta.dirname, '..', 'samples', 'vsco-orch.json');
const RAW = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/';

/* THIS LIBRARY NAMES ITS FILES AN OCTAVE BELOW WHAT THEY SOUND, and the
   first version of this script did not know that. It assumed scientific
   pitch notation — A4 = 440Hz = note 69, as the Salamander piano manifest
   correctly uses — so every instrument here was mapped an octave too low
   and every line written on one came out an octave too high. A cello part
   written in cello register sounded in viola register.

   This is measured, not assumed. scripts/audit-pitch.mjs fetches samples
   and compares what they sound against what they claim, and it reads the
   Salamander piano at dead zero (A4 → 440.4Hz) while reading these files
   at +12.0 with no spread across instruments or registers:

     LDFlute_susvib_A4_v1_1.wav   named A4   sounds 880.2Hz = A5
     LDFlute_susvib_A5_v1_1.wav   named A5   sounds 1762.6Hz = A6

   So for most of this library the octave number is one lower than the
   sounding octave.

   BUT NOT ALL OF IT, which is the part that cost the most. The library
   is internally inconsistent, and not even consistent within a single
   instrument: measured over six samples each, spread across their
   ranges,

     Solo Violin/Arco Vib   5 of 6 read -12   scientific pitch
     Solo Violin/Pizz       4 of 6 read -12   scientific pitch
     Solo Violin/spic       6 of 6 read   0   an octave down
     Strings/Harp           5 of 6 read -12   scientific pitch

   — the same solo violin, named two different ways depending on the
   articulation. The odd readings out are the detector catching a
   harmonic on a short or very quiet sample, not a third convention.

   Under the original assumption of scientific pitch everywhere, the
   violin and harp were right and every ensemble string, woodwind, brass
   and spiccato sounded an octave above what was written. A cello section
   written in cello register came out in viola register, which is a far
   better account of "the strings sound unnatural" than anything that was
   proposed at the time.

   Hence a per-folder offset rather than one constant. Change anything
   here and re-run scripts/audit-pitch.mjs: every instrument should read
   within a semitone of zero. */
const DEFAULT_OCTAVE_OFFSET = 2;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(name, off) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const n = PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return n + (parseInt(m[3], 10) + off) * 12;
}

/* Which folders are worth carrying, what to call them, and which
   articulation inside each is the one a melody is actually written with.
   Short attacks and effects are left out: a sustain library that also
   quietly contains spiccato produces pads that sound wrong for reasons
   nobody can see from the pad name. */
/* The upright piano is deliberately absent: its files are named by index
   (Player_dyn1_rr1_000.wav) against a MappingChart.txt rather than by note,
   and the Salamander grand already in samples/ is a better instrument than
   decoding that would buy. */
const WANT = [
  { dir: 'Strings/Solo Violin/Arco Vib',      tag: 'violin',   cat: 'VIOLIN',  name: 'Violin' , oct: 1 },
  { dir: 'Strings/Violin Section/susvib',     tag: 'violins',  cat: 'VIOLIN',  name: 'Violins' },
  { dir: 'Strings/Viola Section/susvib',      tag: 'viola',    cat: 'VIOLA',   name: 'Violas' },
  { dir: 'Strings/Cello Section/susvib',      tag: 'cello',    cat: 'CELLO',   name: 'Cellos' },
  { dir: 'Strings/Solo Contrabass/SusVib',    tag: 'bass',     cat: 'BASS',    name: 'Contrabass' },
  { dir: 'Strings/Solo Violin/Pizz',          tag: 'vlnpizz',  cat: 'VIOLIN',  name: 'Violin pizz' , oct: 1 },
  { dir: 'Strings/Cello Section/pizzT',       tag: 'clopizz',  cat: 'CELLO',   name: 'Cello pizz' },
  { dir: 'Strings/Solo Contrabass/Pizz',      tag: 'basspizz', cat: 'BASS',    name: 'Contrabass pizz' },
  { dir: 'Woodwinds/Flute/susvib',            tag: 'flute',    cat: 'FLUTE',   name: 'Flute' },
  { dir: 'Woodwinds/Flute/susNV',             tag: 'flutenv',  cat: 'FLUTE',   name: 'Flute (no vib)' },
  { dir: 'Woodwinds/Clarinet/susLong',        tag: 'clarinet', cat: 'CLAR',    name: 'Clarinet' },
  { dir: 'Woodwinds/Oboe/Sus',                tag: 'oboe',     cat: 'OBOE',    name: 'Oboe' },
  { dir: 'Woodwinds/Bassoon/sus',             tag: 'bassoon',  cat: 'BSN',     name: 'Bassoon' },
  { dir: 'Brass/F Horn/sus',                  tag: 'horn',     cat: 'HORN',    name: 'Horn' },
  { dir: 'Brass/Trumpet/sus',                 tag: 'trumpet',  cat: 'TPT',     name: 'Trumpet' },
  { dir: 'Brass/Tenor Trombone/sus',          tag: 'trombone', cat: 'TBN',     name: 'Trombone' },
  { dir: 'Brass/Tuba/sus',                    tag: 'tuba',     cat: 'TUBA',    name: 'Tuba' },
  { dir: 'Strings/Harp',                      tag: 'harp',     cat: 'HARP',    name: 'Harp' , oct: 1 },
  /* SHORT BOW STROKES, CARRIED FOR THEIR ATTACKS RATHER THAN THEIR NOTES.
     The sustains here were recorded with soft eased-in entries: measured,
     their first 90ms is about 1.8dB DARKER and up to 22dB quieter than
     their own steady bowing, so a line built from them has no bite
     anywhere and reads as an organ. The spiccato takes do have it — 8dB
     more upper-mid at the attack — and are carried so they can be layered
     under a sustain as the moment the hair catches the string. */
  { dir: 'Strings/Cello Section/spic',   tag: 'cellospic',  cat: 'CELLO',  name: 'Cello spic' },
  { dir: 'Strings/Solo Violin/spic',     tag: 'violinspic', cat: 'VIOLIN', name: 'Violin spic' },
  { dir: 'Strings/Viola Section/spic',   tag: 'violaspic',  cat: 'VIOLA',  name: 'Viola spic' },
  { dir: 'Strings/Solo Contrabass/Spic', tag: 'basspic',    cat: 'BASS',   name: 'Contrabass spic' },
];

/* Short, loud or otherwise unmelodic takes inside an otherwise wanted
   folder. Matched on the whole path, case-insensitively. */
const SKIP = /(stac|trem|mute|fluttr|gliss|_rr[3-9]|sfz|marc)/i;

const files = execFileSync('git', ['-C', SRC, 'ls-tree', '-r', '--name-only', 'HEAD'],
  { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(f => /\.wav$/i.test(f));

/* NOTE AND DYNAMIC OUT OF A FILENAME, over two naming schemes that both
   appear in this one repository: `LLVln_ArcoVib_A3_f.wav` carries its
   dynamic as p/mf/f, and `susvib_A2_v3_1.wav` carries it as v1..v3. */
function parse(path, oct) {
  const base = path.split('/').pop().replace(/\.wav$/i, '');
  const note = /(?:^|_)([A-Ga-g][#b]?-?\d)(?:_|$)/.exec(base);
  if (!note) return null;
  const midi = midiOf(note[1], oct);
  if (midi == null) return null;
  const v = /_v(\d)(?:_|$)/.exec(base);
  const d = /_(pp|p|mp|mf|f|ff)(?:_|$)/.exec(base);
  return { midi, layer: v ? +v[1] : null, dyn: d ? d[1].toLowerCase() : null, base };
}
/* A dynamic marking is a position in a scale, not a number, so it is only
   meaningful once you know how many the recordist actually made. Both
   schemes are therefore resolved per instrument: collect the distinct
   layers that exist, then space them across the velocity range. */
const DYNORD = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

const out = [];
const report = [];
for (const w of WANT) {
  const mine = files.filter(f => f.toLowerCase().startsWith(w.dir.toLowerCase() + '/') && !SKIP.test(f));
  const oct = w.oct == null ? DEFAULT_OCTAVE_OFFSET : w.oct;
  const rows = mine.map(f => ({ f, p: parse(f, oct) })).filter(x => x.p);
  if (!rows.length) { report.push([w.tag, 0, 0, '-', 'NO FILES MATCHED']); continue; }
  const byLayer = [...new Set(rows.map(r => r.p.layer).filter(x => x != null))].sort((a, b) => a - b);
  const byDyn = [...new Set(rows.map(r => r.p.dyn).filter(Boolean))]
    .sort((a, b) => DYNORD.indexOf(a) - DYNORD.indexOf(b));
  const steps = byLayer.length || byDyn.length || 1;
  const velOf = (p) => {
    if (steps < 2) return 0.8;
    const i = p.layer != null ? byLayer.indexOf(p.layer) : byDyn.indexOf(p.dyn);
    if (i < 0) return 0.8;
    /* Centres, not edges: with three layers the quiet one answers for
       everything up to about a third rather than for velocity zero alone. */
    return +(((i + 0.5) / steps) * 0.94 + 0.05).toFixed(4);
  };
  const notes = new Set();
  for (const r of rows) {
    notes.add(r.p.midi);
    out.push({
      id: 'vo:' + w.tag + '-' + r.p.base,
      name: w.name + ' ' + r.p.midi,
      cat: w.cat,
      file: RAW + r.f.split('/').map(encodeURIComponent).join('/'),
      note: r.p.midi,
      vel: velOf(r.p),
      inst: w.tag,
    });
  }
  const ns = [...notes].sort((a, b) => a - b);
  const gap = ns.length > 1 ? Math.max(...ns.slice(1).map((n, i) => n - ns[i])) : 0;
  report.push([w.tag, rows.length, ns.length, steps, 'range ' + ns[0] + '-' + ns[ns.length - 1] + ', widest gap ' + gap]);
}

out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
writeFileSync(OUT, JSON.stringify({
  name: 'VSCO-2 Community Edition — orchestral sustains (CC0)',
  license: 'CC0 1.0 Universal — VSCO 2 Community Edition by Versilian Studios '
    + '(Sam Gossner, Simon Dalzell). Public domain: free to use, modify, sell and redistribute.',
  source: 'https://github.com/sgossner/VSCO-2-CE',
  note: 'Generated by scripts/make-vsco.mjs from the repository tree. Fetched on '
    + 'demand; no audio is stored here. Sustains, plus pizzicato for the strings.',
  samples: out,
}, null, 1) + '\n');

console.log('instrument      files notes layers');
for (const r of report) console.log(String(r[0]).padEnd(15) + String(r[1]).padStart(5)
  + String(r[2]).padStart(6) + String(r[3]).padStart(7) + '  ' + r[4]);
console.log('\n' + out.length + ' samples → ' + OUT);
