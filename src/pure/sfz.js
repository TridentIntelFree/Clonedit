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
