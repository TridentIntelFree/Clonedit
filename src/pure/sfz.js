/* SFZ — THE FORMAT EVERY FREE SAMPLE LIBRARY ALREADY SHIPS.

   The app's own manifest is a list of sounds with a note on each, which was
   enough while every library here had one recording per note. It is not
   enough for a real instrument: a piano has a dozen dynamics, a drum kit has
   ten alternates of every hit, and both have release recordings that sound
   when a key comes up. The engine grew all three last week and then had
   nowhere to get them from — the blocker stopped being the sampler and
   became the sourcing.

   SFZ already encodes exactly that mapping, and Salamander, Naked Drums,
   VSCO and most of the free world ship it. So rather than invent another
   manifest and hand-write it per library, read theirs.

   This is the subset that matters here. SFZ has hundreds of opcodes; the
   ones below are the ones that say WHICH RECORDING to play and WHEN, which
   is all the engine needs. Everything else is ignored rather than guessed
   at — a filter cutoff written for some other sampler's filter is not
   information about this one.

     sample            the file, relative to default_path then the .sfz
     pitch_keycenter   what note it was recorded at (key, or lokey, if absent)
     lovel hivel       the dynamic band, 1-127
     seq_position      which alternate in a round robin
     trigger=release   a release recording, not a note
     volume            per-region trim, in dB

   Opcodes inherit <global> -> <master> -> <group> -> <region>, which is how
   a library says "all of these are the snare" once instead of per line. */

const HEADER = /<(global|master|group|region|control|curve|effect)>/gi;

/* The note names SFZ allows in place of a number: c4, F#3, Bb-1. Middle C is
   60 here, which is the convention Salamander and the SFZ spec use. */
const LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function sfzNote(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^-?\d+$/.test(s)) return +s;
  const m = /^([a-gA-G])([#b]?)(-?\d+)$/.exec(s);
  if (!m) return null;
  return LETTER[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
    + (parseInt(m[3], 10) + 1) * 12;
}

/* Opcodes are `name=value` separated by whitespace, and a value may itself
   contain spaces — `sample=Grand Piano/A 4.wav` is legal and common. So a
   value runs until the next `name=`, not until the next space. */
function opcodes(chunk, into) {
  const re = /([a-zA-Z0-9_]+)\s*=\s*([^=]*?)(?=\s+[a-zA-Z0-9_]+\s*=|$)/g;
  let m;
  while ((m = re.exec(chunk))) into[m[1].toLowerCase()] = m[2].trim();
  return into;
}

export function parseSfz(text, opt) {
  const o = opt || {};
  /* // to end of line, and /* *​/ blocks. Done before anything else so a
     commented-out region cannot contribute opcodes. */
  const src = String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n\r]*/g, ' ');

  const parts = [];
  let last = 0, lastTag = null, m;
  HEADER.lastIndex = 0;
  while ((m = HEADER.exec(src))) {
    if (lastTag) parts.push([lastTag, src.slice(last, m.index)]);
    lastTag = m[1].toLowerCase(); last = m.index + m[0].length;
  }
  if (lastTag) parts.push([lastTag, src.slice(last)]);

  let control = {}, global = {}, master = {}, group = {};
  const regions = [];
  for (const [tag, body] of parts) {
    if (tag === 'control') { opcodes(body, control); continue; }
    if (tag === 'curve' || tag === 'effect') continue;
    if (tag === 'global') { global = opcodes(body, {}); master = {}; group = {}; continue; }
    if (tag === 'master') { master = opcodes(body, {}); group = {}; continue; }
    if (tag === 'group')  { group  = opcodes(body, {}); continue; }
    regions.push(opcodes(body, Object.assign({}, global, master, group)));
  }

  const defPath = (control.default_path || '').replace(/\\/g, '/');
  const out = [], seen = new Map();
  for (const r of regions) {
    if (!r.sample) continue;
    const file = (defPath + r.sample).replace(/\\/g, '/').trim();
    const rel = /release/i.test(r.trigger || '');
    const note = rel ? null
      : sfzNote(r.pitch_keycenter != null ? r.pitch_keycenter
        : (r.key != null ? r.key : r.lokey));
    if (!rel && note == null) continue;     // a region that names no pitch
    const lo = +r.lovel || 1, hi = +r.hivel || 127;
    /* The MIDDLE of the band, normalised. The engine picks a layer by where
       a velocity falls, so what it needs from each recording is the dynamic
       it represents, not the edges of its range. */
    const vel = Math.min(1, Math.max(0, ((lo + hi) / 2) / 127));
    const rr = r.seq_position != null ? Math.max(1, +r.seq_position || 1) : 1;
    /* An id that is stable across loads, because downloads are cached under
       it — two libraries with a kick_01.wav must not collide. */
    const base = (o.prefix || 'sfz') + ':' + file.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
    let id = base, n = seen.get(base) || 0;
    if (n) id = base + '~' + n;
    seen.set(base, n + 1);
    const e = { id, name: o.name || file.replace(/^.*\//, ''), cat: rel ? 'REL' : (o.cat || 'SAMPLE'), file };
    if (rel) e.rel = true; else { e.note = note; e.vel = vel; if (rr > 1 || r.seq_length) e.rr = rr; }
    if (r.volume != null && isFinite(+r.volume)) e.db = +r.volume;
    out.push(e);
  }
  return { name: o.name || 'SFZ instrument', samples: out,
    regions: regions.length, skipped: regions.length - out.length };
}

/* How many alternates the library supplies per dynamic. The engine needs one
   number for the whole pad, so this is the commonest count rather than the
   maximum: one region with a stray seq_position should not make every band
   claim alternates it does not have. */
export function sfzRoundRobin(samples) {
  const per = new Map();
  for (const s of samples || []) {
    if (s.rel || s.note == null) continue;
    const k = s.note + '|' + (s.vel == null ? 0 : Math.round(s.vel * 127));
    per.set(k, (per.get(k) || 0) + 1);
  }
  if (!per.size) return 1;
  const tally = new Map();
  for (const n of per.values()) tally.set(n, (tally.get(n) || 0) + 1);
  let best = 1, bestN = 0;
  for (const [n, c] of tally) if (c > bestN || (c === bestN && n > best)) { best = n; bestN = c; }
  return Math.max(1, best);
}

/* WHEN THERE IS NO SFZ, READ THE FILENAMES.

   Half the sample libraries in the world are a folder of wavs named by
   whoever recorded them. The conventions are not universal but they are
   narrow, and guessing from them beats making someone map ninety files by
   hand — provided the guess is reported rather than assumed, so a wrong one
   is visible instead of silently detuning an instrument.

     A4 / C#3 / Bb-1 / 60      the note
     v1..v16 / _p _mf _ff      the dynamic
     rr3 / _3 / take3          the alternate
     rel / release / damper    a release recording */
const DYN = { ppp: 0.08, pp: 0.16, p: 0.28, mp: 0.42, mf: 0.56, f: 0.72, ff: 0.86, fff: 0.96 };
export function sampleFromName(filename) {
  const base = String(filename || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const out = { raw: base, guessed: [] };
  /* The token must not be the start of a longer word — "reload" and
     "relative" are not release samples — but it may be followed by a
     capital or a number, because "pedalU1" and "relD2" are exactly how
     libraries name them. */
  if (/(^|[^a-z])(release|damper|pedal|rel)(?![a-z]{3})/i.test(base)) {
    out.rel = true; out.guessed.push('release');
    return out;
  }
  /* The note is looked for with a boundary on each side, so the 4 in
     "kick4" is not read as an octave and the A in "Amp" is not a pitch. */
  let m = /(?:^|[^a-gA-G0-9#b])([a-gA-G])([#b]?)(-?[0-8])(?![0-9])/.exec(base);
  if (m) { out.note = sfzNote(m[1] + m[2] + m[3]); out.guessed.push('note'); }
  else {
    m = /(?:^|[^0-9])((?:1[0-1][0-9]|12[0-7]|[1-9]?[0-9]))(?![0-9])/.exec(base);
    if (m && +m[1] >= 12 && +m[1] <= 127) { out.note = +m[1]; out.guessed.push('note'); }
  }
  const v = /(?:^|[^a-z])v(?:el)?([0-9]{1,2})(?![0-9])/i.exec(base);
  if (v) { out.velIdx = +v[1]; out.guessed.push('velocity'); }
  else {
    const d = /(?:^|[^a-z])(fff|ff|f|mf|mp|ppp|pp|p)(?:[^a-z]|$)/i.exec(base);
    if (d) { out.vel = DYN[d[1].toLowerCase()]; out.guessed.push('velocity'); }
  }
  const rr = /(?:^|[^a-z])(?:rr|take|t)([0-9]{1,2})(?![0-9])/i.exec(base);
  if (rr) { out.rr = +rr[1]; out.guessed.push('alternate'); }
  return out;
}

/* A folder of files -> a manifest. Velocity indexes are spread across 0..1
   once the whole set is known, because v1..v16 and v1..v4 mean the same
   range divided differently and neither says so. */
export function packFromNames(files, opt) {
  const o = opt || {}, pre = (o.prefix || 'local');
  const read = files.map(f => ({ f, g: sampleFromName(typeof f === 'string' ? f : f.name) }));
  const idxs = [...new Set(read.map(r => r.g.velIdx).filter(n => n != null))].sort((a, b) => a - b);
  const samples = [], seen = new Map();
  for (const { f, g } of read) {
    const name = typeof f === 'string' ? f : f.name;
    const short = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    let id = pre + ':' + short, n = seen.get(id) || 0;
    if (n) id = id + '~' + n;
    seen.set(pre + ':' + short, n + 1);
    const e = { id, name: short, cat: g.rel ? 'REL' : (o.cat || 'SAMPLE'), file: name };
    if (g.rel) e.rel = true;
    else {
      if (g.note == null) continue;         // nothing to map it to
      e.note = g.note;
      if (g.velIdx != null && idxs.length > 1)
        e.vel = (idxs.indexOf(g.velIdx) + 0.5) / idxs.length;
      else if (g.vel != null) e.vel = g.vel;
      if (g.rr) e.rr = g.rr;
    }
    samples.push(e);
  }
  return { name: o.name || 'imported', samples,
    read: read.length, mapped: samples.length, velocitySteps: idxs.length };
}

/* ---- #include AND #define -----------------------------------------------

   The first version of this parser read a flat .sfz and was enough for
   Salamander. It is not enough for most of the rest: ARIA-style libraries
   are assembled out of dozens of fragments, and the entry file is often
   nothing but a list of includes. Naked Drums' stereo kit is sixty-two
   lines, every one of them an #include or a comment, and its sample paths
   are written $dir/snare/...$ext with both halves defined three files away.

   So before anything can be parsed it has to be ASSEMBLED. Kept pure by
   taking the files as a map rather than fetching them: the caller walks
   the include graph, which it has to do anyway to know what to download. */

const INC = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gmi;

/* Collapse . and .. without a URL, because these are repository paths and
   may sit above the entry file. */
export function sfzResolve(dir, rel) {
  const parts = (dir ? dir.split('/') : []).concat(String(rel).replace(/\\/g, '/').split('/'));
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') { if (out.length) out.pop(); continue; }
    out.push(p);
  }
  return out.join('/');
}
const dirOf = p => { const i = String(p).lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };

/* Every path a file pulls in, as candidates to fetch.

   ARIA resolves an #include against the MAIN .sfz's directory, not against
   the file doing the including — which reads backwards until you see a
   real library. Naked Drums' Data/stereo/DI_Snare_Tops.txt writes
   "../Data/group/snare_top1.txt", and that only lands on a real file if
   ".." is taken from the entry's folder. Resolved from the including file
   it becomes Data/Data/group/..., which is exactly the 42 missing
   fragments the first version of this reported.

   Both are returned, entry-relative first, because the other convention
   exists in the wild and trying it costs one failed lookup. */
export function sfzIncludes(text, fromPath, entryDir) {
  const dFrom = dirOf(fromPath || '');
  const dEntry = entryDir == null ? dFrom : entryDir;
  const out = [];
  let m; INC.lastIndex = 0;
  while ((m = INC.exec(String(text || '')))) {
    const a = sfzResolve(dEntry, m[1]), b = sfzResolve(dFrom, m[1]);
    out.push(a); if (b !== a) out.push(b);
  }
  return [...new Set(out)];
}

/* Splice the graph into one document. A file already spliced is not
   spliced again: these graphs are diamonds, not trees, and a library that
   includes one keymap from nine places should not get nine copies. */
export function sfzAssemble(entry, files, maxDepth) {
  const missing = [], seen = new Set();
  const depth = maxDepth == null ? 24 : maxDepth;
  const get = p => (files instanceof Map ? files.get(p) : files[p]);
  const dEntry = dirOf(entry);
  const walk = (path, level) => {
    if (level > depth) return '// include depth exceeded\n';
    const text = get(path);
    if (text == null) { missing.push(path); return ''; }
    if (seen.has(path)) return '';
    seen.add(path);
    const dFrom = dirOf(path);
    return String(text).replace(INC, (_, rel) => {
      const a = sfzResolve(dEntry, rel), b = sfzResolve(dFrom, rel);
      if (get(a) != null || get(b) == null) return walk(a, level + 1);
      return walk(b, level + 1);
    });
  };
  return { text: walk(entry, 0), missing, included: seen.size };
}

/* #define $NAME value, substituted everywhere — including inside opcode
   NAMES, which is why this is textual rather than per-value: real files
   write locc$VOL_DI=1 and amplitude_oncc$VOL_DI=$RANGE_VOL. Longest names
   first, or $VOL would eat the front of $VOL_DI. */
export function sfzMacros(text) {
  /* SEQUENTIAL, NOT GLOBAL — and this is the whole game.

     A #define applies to the text AFTER it, and a later one of the same
     name replaces it from that point on. Collecting every define into one
     map and substituting everywhere looks equivalent and is not: these
     libraries redefine the same handful of names over and over, once per
     fragment. Naked Drums has 144 files in Data/file/ that each redefine
     $MIC, $ART and the take name for the regions that follow, so a global
     map gave every region in the kit the LAST file's values. It parsed
     cleanly, reported 118 playable regions, and pointed almost all of them
     at filenames that do not exist.

     Substituting a define's own value as it is stored, rather than on use,
     keeps the same rule for a macro written in terms of another. */
  const defs = new Map();
  const re = /#define[ \t]+(\$[A-Za-z0-9_]+)[ \t]+(\S+)/gi;
  let rx = null, rxFor = -1;
  const subst = chunk => {
    if (!defs.size || !chunk) return chunk;
    if (rxFor !== defs.size) {
      const keys = [...defs.keys()].sort((a, b) => b.length - a.length);
      rx = new RegExp(keys.map(k => k.replace(/\$/g, '\\$')).join('|'), 'g');
      rxFor = defs.size;
    }
    let s2 = chunk;
    for (let i = 0; i < 6; i++) {
      const n = s2.replace(rx, k => defs.get(k));
      if (n === s2) break;
      s2 = n;
    }
    return s2;
  };
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += subst(String(text).slice(last, m.index));
    const had = defs.has(m[1]);
    defs.set(m[1], subst(m[2]));
    if (had) rxFor = -1;                 // same count, different value
    else rxFor = -1;
    last = m.index + m[0].length;
  }
  out += subst(String(text).slice(last));
  return { text: out, defs };
}

