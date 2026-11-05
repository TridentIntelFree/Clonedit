/* WHICH PACK HAS A CELLO IN IT?

   There was no way to ask. `packManifest` is ONE object, so loading a pack
   replaces the last one, the picker named twelve files in a flat list, and
   nothing anywhere said what was inside any of them. 2,840 samples and the
   only route to a sound was already knowing which file held it.

   Two of the twelve were not even in the picker. `foundkit` and `darkkit`
   are referenced all through AGENTS.md — there is a whole section on their
   onset fields — and a person could not load either, because adding a
   manifest to samples/ and adding an <option> to the markup are two
   separate acts and nobody did the second one. That is this repo's oldest
   failure shape: the capability is real and there is no way in.

   So the picker is GENERATED from the manifests now, and this script is
   what generates it. The counts are measured; only the shelf a pack sits
   on and its short name are editorial, and those live in SHELVES below.

   IT REFUSES TO RUN ON A MANIFEST IT DOES NOT KNOW, which is the point. A
   new pack dropped into samples/ fails the build with its own filename
   until somebody says where it goes — so "the pack exists and nothing
   lists it" cannot happen again by omission. It was never a decision; it
   was a step that got skipped twice.

   THE UNIT IS AN INSTRUMENT, NOT A NOTE. Searching 2,840 rows for "cello"
   returns 131 individual notes, which is not an answer to the question
   anybody asked. Samples whose names differ only by a trailing index are
   one instrument with a count, and that collapses to 312 rows — about
   15KB, small enough to bake in, so the search works with no connection
   like the rest of the writing side.

   Run: node scripts/build-sample-index.mjs [--check]
   --check verifies the committed file matches the manifests and writes
   nothing, which is what CI and `npm run lint` want. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src', 'pure', 'sampleindex.js');
const CHECK = process.argv.includes('--check');

/* Files in samples/ that are not sample packs: measured references, baked
   corpus norms and the timbre atlases. Matched by prefix rather than
   listed, because new ones of each arrive regularly. */
const NOT_A_PACK = /^(atlas-|form-norms|groove-norms|harmony-norms|ref-)/;

/* THE ONLY EDITORIAL PART. A count can be measured and a shelf cannot:
   nothing in a manifest says whether a person reaching for drums would
   look in it. Keep the names short — the old ones ran to ninety
   characters with the licence in the middle, which is the kind of label
   you stop reading.

   `note` is what the pack is FOR, in a few words. `star` marks the ones
   worth loading first. The licence is kept out of the name and shown
   beside it, because it belongs to the pack and not to its title. */
const SHELVES = {
  'nakeddrums.json':    { shelf: 'Drums', name: 'Naked Drums', star: true,
    note: 'a real kit — velocity layers and 3 takes per hit', lic: 'CC BY' },
  'jbh-drums.json':     { shelf: 'Drums', name: 'Kit One',
    note: 'synthesised, works with no connection', lic: 'CC0' },

  'salamander.json':    { shelf: 'Piano and keys', name: 'Salamander Grand', star: true,
    note: '6 dynamics per note', lic: 'CC-BY' },

  'vsco-orch.json':     { shelf: 'Orchestra', name: 'VSCO-2 Orchestra', star: true,
    note: 'strings, winds and brass with velocity layers', lic: 'CC0' },
  'real-cc0.json':      { shelf: 'Orchestra', name: 'Orchestra · core',
    note: 'a smaller selection of the same library', lic: 'CC0' },
  'vsco-real.json':     { shelf: 'Orchestra', name: 'Cello and acoustic drums',
    note: 'close-recorded cello with a real kit', lic: 'CC0' },

  'vcsl-mallets.json':  { shelf: 'Tuned percussion', name: 'Mallets, bells and metal', star: true,
    note: 'vibraphone, kalimba, glass, anvil', lic: 'CC0' },

  'foundkit.json':      { shelf: 'Found sounds', name: 'Found Kit',
    note: 'field recordings — knocks, typing, fire', lic: 'CC0' },
  'darkkit.json':       { shelf: 'Found sounds', name: 'Dark Kit',
    note: 'industrial — thunder, glass, a train', lic: 'CC0' },

  'vcsl-wide.json':     { shelf: 'Mixed libraries', name: 'VCSL Wide', star: true,
    note: 'Steinway, harpsichord, harps, sax, timpani, congas', lic: 'CC0' },
  'real-cc0-full.json': { shelf: 'Mixed libraries', name: 'Full Kit',
    note: 'drums plus real instruments', lic: 'CC0' },
  'manifest.json':      { shelf: 'Mixed libraries', name: 'JBH Studio',
    note: 'synthesised, a little of everything', lic: 'CC0' },
};

/* Shelf order in the picker: what somebody is most likely to want first,
   then by how specific it is. */
const SHELF_ORDER = ['Drums', 'Piano and keys', 'Orchestra', 'Tuned percussion',
  'Found sounds', 'Mixed libraries'];

/* ONE INSTRUMENT, MANY NOTES. "Piano A 36", "Cello C#2 vl3 rr2" and
   "Upright piano 36" are one instrument each as far as a person looking
   for a cello is concerned. Strips a trailing index, a velocity layer and
   a round-robin number; anything else in the name is kept, because that is
   where the instrument actually is. */
function stemOf(s) {
  return String(s.name || s.id)
    .replace(/\s+(vl|rr)\d+$/i, '')
    .replace(/\s*[#0-9]+$/, '')
    .trim() || String(s.id);
}

const files = readdirSync(resolve(ROOT, 'samples'))
  .filter(f => f.endsWith('.json') && !NOT_A_PACK.test(f))
  .sort();

const unknown = files.filter(f => !SHELVES[f]);
if (unknown.length) {
  console.error('A SAMPLE PACK WITH NOWHERE TO GO.\n');
  for (const f of unknown) console.error('  samples/' + f);
  console.error('\nThe picker is generated from this script, so a pack with no entry in');
  console.error('SHELVES is a pack nobody can load — which is exactly how foundkit and');
  console.error('darkkit sat unreachable. Add it to SHELVES in');
  console.error('scripts/build-sample-index.mjs with a shelf, a short name and what it');
  console.error('is for, then run the script again.');
  process.exit(1);
}
const missing = Object.keys(SHELVES).filter(f => !files.includes(f));
if (missing.length) {
  console.error('SHELVES names packs that are not in samples/: ' + missing.join(', '));
  console.error('Remove the entry, or restore the manifest.');
  process.exit(1);
}

const packs = [], index = [];
for (const f of files) {
  const ed = SHELVES[f];
  const m = JSON.parse(readFileSync(resolve(ROOT, 'samples', f), 'utf8'));
  const samples = Array.isArray(m.samples) ? m.samples : [];
  if (!samples.length) { console.error('samples/' + f + ' has no samples'); process.exit(1); }

  const cats = {};
  const by = new Map();
  for (const s of samples) {
    cats[s.cat || '?'] = (cats[s.cat || '?'] || 0) + 1;
    const stem = stemOf(s);
    const k = (s.cat || '') + '\u0000' + stem;
    const g = by.get(k) || { s: stem, c: s.cat || '', n: 0, id: s.id };
    g.n++;
    by.set(k, g);
  }
  const pi = packs.length;
  packs.push({ file: 'samples/' + f, shelf: ed.shelf, name: ed.name, note: ed.note,
    lic: ed.lic, star: !!ed.star, n: samples.length, cats,
    /* the manifest's own title, kept so the pack can still say who made it */
    full: m.name || ed.name });
  for (const g of [...by.values()].sort((a, b) => b.n - a.n || a.s.localeCompare(b.s)))
    index.push({ p: pi, s: g.s, c: g.c, n: g.n, id: g.id });
}

packs.sort; /* order is file order; the picker sorts by shelf when it builds */

const body = `/* GENERATED by scripts/build-sample-index.mjs — do not edit.

   What is in every sample pack, so a person can search for a cello
   without first knowing which of twelve files holds one. Counts are
   measured from the manifests; the shelf and the short name come from
   SHELVES in that script. Run it again after changing a manifest;
   \`npm run lint\` checks this file still matches.

   ${packs.length} packs · ${packs.reduce((a, p) => a + p.n, 0)} samples · ${index.length} instruments
*/

export const SHELF_ORDER = ${JSON.stringify(SHELF_ORDER)};

/* one row per pack, in the order the manifests sort */
export const SAMPLE_PACKS = ${JSON.stringify(packs, null, 1)};

/* one row per INSTRUMENT: p = index into SAMPLE_PACKS, s = its name,
   c = category, n = how many samples it has, id = one of them */
export const SAMPLE_INDEX = ${JSON.stringify(index)};

/* Matches every word of the query somewhere in the instrument, its
   category or its pack — so "piano cc0" and "cello orchestra" both work,
   and word order does not matter. Ranked by where the match landed: the
   instrument's own name first, then its category, then the pack's.
   Returns rows carrying their pack, because the answer to "where is a
   cello" is a pack as much as an instrument. */
export function findInstruments(q, limit) {
  const words = String(q || '').toLowerCase().split(/\\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const r of SAMPLE_INDEX) {
    const pk = SAMPLE_PACKS[r.p];
    const inst = r.s.toLowerCase(), cat = (r.c || '').toLowerCase();
    const pack = (pk.name + ' ' + pk.note + ' ' + pk.lic + ' ' + pk.shelf).toLowerCase();
    let score = 0, ok = true, where = 'inst';
    for (const w of words) {
      if (inst.includes(w)) score += inst.startsWith(w) ? 6 : 4;
      else if (cat.includes(w)) { score += 2; if (where === 'inst') where = 'cat'; }
      else if (pack.includes(w)) { score += 1; where = 'pack'; }
      else { ok = false; break; }
    }
    if (ok) out.push({ pack: pk, inst: r.s, cat: r.c, n: r.n, id: r.id, score, where });
  }
  /* A PACK-LEVEL MATCH IS A LAST RESORT, NOT A RESULT. The mallets pack is
     described as "vibraphone, kalimba, glass, anvil", so searching kalimba
     matched all 29 of its instruments on the pack text and the answer came
     back "Kalimba, Kalimba, Xylophone, Triangle". The weak match is worth
     keeping — it is how "orchestra" or "CC0" find anything at all — but
     only when nothing matched an actual instrument. */
  const strong = out.filter(r => r.where !== 'pack');
  const use = strong.length ? strong : out;
  use.sort((a, b) => b.score - a.score || b.n - a.n || a.inst.localeCompare(b.inst));
  return limit ? use.slice(0, limit) : use;
}
`;

if (CHECK) {
  let have = '';
  try { have = readFileSync(OUT, 'utf8'); } catch (e) { /* missing: reported below */ }
  if (have === body) {
    console.log('sample index matches the manifests — ' + packs.length + ' packs, '
      + packs.reduce((a, p) => a + p.n, 0) + ' samples, ' + index.length + ' instruments.');
    process.exit(0);
  }
  console.error('src/pure/sampleindex.js does not match samples/.');
  console.error('A manifest changed and the index did not, so the picker and the search');
  console.error('are describing a library that is not there. Run:');
  console.error('');
  console.error('  node scripts/build-sample-index.mjs');
  process.exit(1);
}

writeFileSync(OUT, body);
console.log('wrote src/pure/sampleindex.js — ' + packs.length + ' packs, '
  + packs.reduce((a, p) => a + p.n, 0) + ' samples, ' + index.length + ' instruments');
for (const sh of SHELF_ORDER) {
  const mine = packs.filter(p => p.shelf === sh);
  console.log('  ' + sh.padEnd(18) + mine.map(p => p.name + ' (' + p.n + ')').join(' · '));
}
