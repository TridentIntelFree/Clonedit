/* A RECIPE IS A SET OF SLOTS, NOT A SET OF PADS.

   `writeSurprise()` writes onto whatever pads happen to be loaded, so the
   recipe is shaped by your board rather than the other way round, and a
   style that wants a sub and a hat gets whatever you had lying there.

   Turned around: the recipe names the SLOTS it needs — low end here, a
   hat here, a synth here — the pads are created EMPTY under those names,
   you put your own sound in each, and the sequencer plays the pattern
   either way. The pattern and the timbre stop being the same decision.

   An empty named slot is a BRIEF. "This wants the low end" tells you what
   to go and find, which is the thing you otherwise have to already know.
   And a brief written in MEASURABLE terms can be checked: drop a bowed
   swell into a footwork hat slot and `fitSlot()` can say it takes 280ms
   to speak when the pattern wants notes 86ms apart, rather than leaving
   you to wonder why the part vanished.

   WHAT IS MEASURED HERE AND WHAT IS NOT. The fit check is measurement —
   it runs on `timbreOf()` numbers taken off the actual buffer. The step
   PATTERNS are not: they are composed from stated principles, the same
   way the hand-written genre table was. The corpus that would fix that is
   already half-used in this repo — scripts/study-groove.py reads the
   Groove MIDI Dataset, 1,150 genre-labelled performances, and took only
   the TIMING from it. Taking the patterns too is the obvious next step
   and until it happens `makeRecipe()` says `patternsMeasured: false`
   rather than letting composed numbers pass as measured ones. */

/* minGap() is deliberately NOT re-exported through a recipe: it was a
   `minGapAt(t)` closure on every slot, and a function cannot cross the
   MCP boundary -- the bridge JSON round-trips every result, so it would
   have arrived as undefined with nothing said. Callers that want it
   call minGap() themselves. */
import { playable, stepMs } from './timbre.js';

/* ---- THE SLOT VOCABULARY ------------------------------------------
   Each slot says what job it does and what a sound has to be able to do
   to hold it. `wants` is in the units timbreOf() reports, so nothing
   here needs interpreting before it can be checked.

   `presets` are the built-in synth sounds in the right family — a
   starting point and explicitly NOT the answer. AGENTS.md: pick the
   source by its measured numbers, not its name, because the thing
   called `vibh` is the dullest instrument in VCSL. The fit check is
   what decides; this list is only so the slot is never empty of
   suggestions on a board with nothing loaded. */
export const ROLES = {
  low:   { label: 'LOW END', pitched: true,
           says: 'the weight. One note at a time, felt more than heard.',
           wants: { attackMsMax: 60, ringMsMin: 120, ringMsMax: 2500 },
           presets: ['b808', 'bsub', 'breese', 'bfm'] },
  kick:  { label: 'KICK', pitched: false,
           says: 'the downbeat. Short, and it has to speak instantly.',
           wants: { attackMsMax: 25, ringMsMax: 700 },
           presets: ['dkick', 'dtom'] },
  snare: { label: 'SNARE', pitched: false,
           says: 'the backbeat, and the thing a fill is made of.',
           wants: { attackMsMax: 25, ringMsMax: 600 },
           presets: ['dsnare', 'dclap', 'drim'] },
  hat:   { label: 'HI', pitched: false,
           says: 'the air and the motion. Plays fastest, so it has to be the quickest to speak.',
           wants: { attackMsMax: 15, ringMsMax: 300 },
           presets: ['dhat', 'dshk', 'dohat', 'dcow'] },
  synth: { label: 'SYNTH', pitched: true,
           says: 'the harmonic middle — what states the chord.',
           wants: { attackMsMax: 120, ringMsMin: 150 },
           presets: ['kep', 'korg', 'pwarm', 'lsuper'] },
  lead:  { label: 'LEAD', pitched: true,
           says: 'the tune. It has to be heard over everything else.',
           wants: { attackMsMax: 80 },
           presets: ['lpluck', 'lsuper', 'pgrand', 'xbell'] },
  pad:   { label: 'PAD', pitched: true,
           says: 'the sustain under it. The one slot that WANTS a long ring.',
           wants: { ringMsMin: 600 },
           presets: ['pwarm', 'scello', 'sens', 'xsweep'] },
};

/* ---- DOES THIS SOUND FIT THIS SLOT --------------------------------

   Reports; it does not refuse. A slot is a brief and briefs get broken
   on purpose — a pad in the hat slot is a choice someone might want. The
   one thing stated firmly is whether the sound can SPEAK at the rate the
   pattern plays it, because a note shorter than its own attack is not a
   quiet note, it is no note, and that is brokenness rather than taste.

   `gap` is how many sixteenths apart this slot's notes are in the recipe,
   so the same sound can fit a slow slot and not a fast one. */
export function fitSlot(role, timbre, bpm, gap = 1) {
  const R = (typeof role === 'string') ? ROLES[role] : role;
  if (!R) throw new Error('no slot called "' + role + '". Known: ' + Object.keys(ROLES).join(', '));
  const t = timbre || {};
  const w = R.wants || {};
  const notes = [];
  const play = playable(t, bpm, gap);

  if (!play.speaks) notes.push(play.says);
  if (w.attackMsMax != null && t.attackMs > w.attackMsMax)
    notes.push('it takes ' + t.attackMs + 'ms to speak and this slot wants under '
      + w.attackMsMax + 'ms — it will feel behind the beat even where it is on it.');
  if (w.ringMsMax != null && t.ringMs > w.ringMsMax)
    notes.push('it rings ' + t.ringMs + 'ms where the slot wants under ' + w.ringMsMax
      + 'ms, so hits will run into each other. That is glue in a pad and mud in a hat.');
  if (w.ringMsMin != null && t.ringMs < w.ringMsMin)
    notes.push('it rings only ' + t.ringMs + 'ms and this slot wants at least '
      + w.ringMsMin + 'ms — it will sound clipped where the part expects it to hold.');
  if (t.silent) notes.push('this pad is silent.');

  /* speaking is the pass/fail; everything else is a remark, and the
     score exists to ORDER suggestions rather than to gate them */
  const fits = play.speaks && !t.silent;
  const score = (play.speaks ? 0 : 100) + (t.silent ? 100 : 0) + notes.length;
  return { fits, score, role: R.label, gap,
    says: notes.length ? notes.join(' ') : 'it suits this slot.' };
}

/* Rank candidates for a slot by how well they actually fit, measured.
   `candidates` are {id, timbre} — whatever is on the board, in a pack,
   or the built-in presets once something has measured them. */
export function suggestFor(role, candidates, bpm, gap = 1) {
  const out = (candidates || []).map(c =>
    Object.assign({ id: c.id }, fitSlot(role, c.timbre, bpm, gap)));
  out.sort((a, b) => a.score - b.score);
  return out;
}

/* ---- A RECIPE NOBODY WROTE ----------------------------------------

   Seeded, so a recipe you liked can be got back, and composed rather
   than drawn at random: tempo, feel and density are correlated in real
   music, and sampling them independently produces a 52bpm track with
   sixteenth hats on it. So a FAMILY is chosen first and everything else
   is drawn inside what that family can be.

   It names itself after what it IS — tempo, feel, harmonic motion —
   rather than after a genre it has not earned. Calling a random draw
   "techno" is the kind of claim this repo keeps having to walk back. */
const FAMILIES = [
  { id: 'slow',    bpm: [52, 76],   dens: ['sparse', 'normal'],        feels: ['straight', 'straight', '3'] },
  { id: 'midtempo',bpm: [84, 104],  dens: ['sparse', 'normal', 'busy'],feels: ['straight', 'straight', '3', '5'] },
  { id: 'four',    bpm: [118, 132], dens: ['normal', 'busy'],          feels: ['straight', 'straight', '7'] },
  { id: 'fast',    bpm: [140, 176], dens: ['normal', 'busy'],          feels: ['straight', '3'] },
];
const MOTION = [
  { id: 'one chord',  bars: 1, says: 'the harmony does not move, so the rhythm has to' },
  { id: 'two-chord vamp', bars: 2, says: 'two chords, back and forth' },
  { id: 'four-bar',   bars: 4, says: 'a chord a bar' },
];

export function makeRecipe(seed, opt) {
  const o = opt || {};
  let rs = (seed >>> 0) || 0x9e37;
  const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length) % a.length];
  const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

  const fam = o.family ? FAMILIES.find(f => f.id === o.family) || pick(FAMILIES) : pick(FAMILIES);
  const bpm = o.bpm != null ? +o.bpm : between(fam.bpm[0], fam.bpm[1]);
  const feel = o.feel || pick(fam.feels);
  const dens = o.density || pick(fam.dens);
  const motion = pick(MOTION);
  const swing = feel === 'straight' ? +(rnd() * 0.18).toFixed(2) : 0;

  /* WHICH SLOTS THIS ONE CALLS FOR. Always something low and something
     that marks the beat; the rest is what makes one recipe unlike
     another. A recipe with every slot filled is not a style, it is a
     full board. */
  const slots = ['low', 'kick'];
  if (rnd() < 0.85) slots.push('snare');
  if (rnd() < 0.9) slots.push('hat');
  if (rnd() < 0.7) slots.push('synth');
  if (rnd() < 0.5) slots.push('lead');
  if (rnd() < 0.35 || fam.id === 'slow') slots.push('pad');

  /* STEP PROBABILITIES, NOT STEP LISTS. A probability per step is what
     this sequencer already supports as a step lock, it is what a real
     corpus actually yields, and it is what makes two bars of the same
     recipe differ without being random. Composed from principles here;
     see patternsMeasured below. */
  const beat = [0, 4, 8, 12], off = [2, 6, 10, 14];
  const sixteenths = [1, 3, 5, 7, 9, 11, 13, 15];
  const P = {};
  if (slots.includes('kick')) {
    P.kick = {};
    for (const s of beat) P.kick[s] = fam.id === 'four' ? 1 : (s === 0 ? 1 : +(0.25 + rnd() * 0.5).toFixed(2));
    for (const s of off) if (rnd() < 0.4) P.kick[s] = +(0.15 + rnd() * 0.35).toFixed(2);
  }
  if (slots.includes('snare')) {
    P.snare = { 4: 1, 12: 1 };
    for (const s of sixteenths) if (rnd() < (dens === 'busy' ? 0.3 : 0.12)) P.snare[s] = +(0.1 + rnd() * 0.3).toFixed(2);
  }
  if (slots.includes('hat')) {
    P.hat = {};
    const every = dens === 'busy' ? 1 : dens === 'normal' ? 2 : 4;
    for (let s = 0; s < 16; s += every) P.hat[s] = s % 4 === 0 ? 1 : +(0.5 + rnd() * 0.45).toFixed(2);
  }

  /* the gap each slot's notes sit at, which is what fitSlot() needs to
     judge a sound against: a hat on sixteenths and a pad on whole notes
     are not the same demand on a sample */
  const gaps = { low: 4, kick: 4, snare: 4, hat: dens === 'busy' ? 1 : 2,
    synth: 2, lead: 2, pad: 16 };

  const name = bpm + 'bpm ' + (feel === 'straight' ? 'straight' : feel + '-over')
    + ' · ' + dens + ' · ' + motion.id;
  return {
    seed: seed >>> 0, family: fam.id, bpm, feel, density: dens, swing,
    bars: motion.bars, motion: motion.id,
    slots: slots.map(id => ({
      id, label: ROLES[id].label, says: ROLES[id].says,
      pitched: ROLES[id].pitched, wants: ROLES[id].wants,
      gap: gaps[id] || 2, presets: ROLES[id].presets,
    })),
    steps: P,
    sixteenthMs: Math.round(stepMs(bpm)),
    /* SAID OUT LOUD, because composed numbers that pass as measured ones
       is the failure this repo keeps writing down. */
    patternsMeasured: false,
    name,
    says: name + '. ' + motion.says + '. ' + slots.length + ' slots: '
      + slots.map(s => ROLES[s].label).join(', ')
      + '. The step patterns are composed rather than measured — the Groove '
      + 'corpus this repo already reads for its timing norms would fix that.',
  };
}
