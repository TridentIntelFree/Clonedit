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
import { DRUM_CORPUS } from './grooves.js';
/* the measured colour of each job — see ROLE_TARGETS for the numbers
   and where they came from */
import { ROLE_TARGETS, roleFit } from './padprofile.js';

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
           colour: 'bass',
           presets: ['b808', 'bsub', 'breese', 'bfm'] },
  kick:  { label: 'KICK', pitched: false,
           says: 'the downbeat. Short, and it has to speak instantly.',
           wants: { attackMsMax: 25, ringMsMax: 700 },
           colour: 'kick',
           presets: ['dkick', 'dtom'] },
  snare: { label: 'SNARE', pitched: false,
           says: 'the backbeat, and the thing a fill is made of.',
           wants: { attackMsMax: 25, ringMsMax: 600 },
           colour: 'snare',
           presets: ['dsnare', 'dclap', 'drim'] },
  hat:   { label: 'HI', pitched: false,
           says: 'the air and the motion. Plays fastest, so it has to be the quickest to speak.',
           wants: { attackMsMax: 15, ringMsMax: 300 },
           colour: 'hat',
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

  /* ---- AND WHAT COLOUR THE JOB WANTS -------------------------------
     "When our write is looking for ideal samples does it know what to
     want?" It did not. Every brief above was ENVELOPE ONLY — attack and
     ring in milliseconds — and the consequence is not a near-miss:

       hat_closed  (0ms attack,  35ms ring)  into the KICK slot -> fits
       ride        (0ms attack, 600ms ring)  into the KICK slot -> fits
       kick_909    (0ms attack, 155ms ring)  into the KICK slot -> fits

       ranked for KICK:  hat_closed(0)  ride(0)  kick_909(0)

     A dead tie, so CHECK MY SOUNDS put a closed hi-hat first for the
     kick slot purely because it came first in the list, and said "it
     suits this slot". The timing was all it knew how to want.

     A kick and a hat have near-identical envelopes; what separates them
     is colour, and ROLE_TARGETS has that measured off a real pack. Only
     the four slots with a colour anybody could state carry one: the
     three drum voices and the low end, which must be low to do its job.
     SYNTH, LEAD and PAD deliberately have none — a bright lead and a
     dark one are both leads, and that is taste rather than brokenness,
     which is the line this whole check is drawn along.

     It REMARKS and RANKS; it does not gate. `fits` still turns only on
     whether the sound can speak, because a hat in the kick slot is a
     choice someone might want and this tool exists to inform it, not to
     overrule it. What changes is that the suggestion order now knows,
     and the remark says what is wrong in the sound's own numbers. */
  let colour = null;
  if (R.colour && t.airVsBodyDb != null && t.centroidHz != null) {
    colour = roleFit(t, R.colour);
    if (colour && colour.fit < 0.999)
      notes.push('for colour it ' + colour.miss.join(' and ')
        + ' — ' + ROLE_TARGETS[R.colour].says + '.');
  }

  /* speaking is the pass/fail; everything else is a remark, and the
     score exists to ORDER suggestions rather than to gate them */
  const fits = play.speaks && !t.silent;
  /* colour contributes up to 3, so a right-coloured sound with one
     envelope remark still outranks a wrong-coloured one with none */
  const colourCost = colour ? +((1 - colour.fit) * 3).toFixed(2) : 0;
  const score = (play.speaks ? 0 : 100) + (t.silent ? 100 : 0)
    + notes.length + colourCost;
  return { fits, score, role: R.label, gap,
    colour: colour ? { want: R.colour, fit: colour.fit, miss: colour.miss } : null,
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

/* ---- THE DRUM HALF IS MEASURED NOW -------------------------------- */

/* WHICH MEASURED STYLE THIS TEMPO BELONGS TO.

   The figures in grooves.js are grouped by the corpus's own style
   labels, and a style carries the tempo range it was played at. Picking
   a style whose range brackets the recipe's bpm is what keeps the two
   consistent: a 170bpm recipe must not be handed figures measured off
   90bpm hiphop takes, because the hat that reads as laid back at 90
   reads as a blur at 170.

   A style marked `thin` rests on fewer than twenty performances, so it
   is one or two drummers rather than a genre. Those are used only when
   nothing else brackets the tempo, and the recipe says which style it
   drew from either way. */
export function stylesFor(bpm, { allowThin = false } = {}) {
  const all = Object.entries(DRUM_CORPUS.styles)
    .map(([id, e]) => ({ id, ...e }))
    .filter(e => allowThin || !e.thin);
  const inRange = all.filter(e => bpm >= e.bpm[0] && bpm <= e.bpm[2]);
  if (inRange.length) {
    /* nearest median first, so a 130bpm recipe prefers a style that
       sits there over one that merely reaches it */
    return inRange.sort((a, b) => Math.abs(a.bpm[1] - bpm) - Math.abs(b.bpm[1] - bpm));
  }
  if (!allowThin) return stylesFor(bpm, { allowThin: true });
  return all.sort((a, b) => Math.abs(a.bpm[1] - bpm) - Math.abs(b.bpm[1] - bpm));
}

/* ONE FIGURE, CHOSEN BY DENSITY AND THEN BY HOW COMMON IT IS.

   Density is a musical decision the recipe has already made, so it
   selects the BAND of candidates — the sparsest third, the middle, the
   busiest third by hit count — and the corpus share decides within that
   band. Choosing purely by share would make every sparse recipe play
   the commonest bar in the style, which is the same figure every time;
   choosing purely at random throws away the thing that was measured. */
export function figureFor(voice, style, dens, rnd) {
  const d = style && style.voices && style.voices[voice];
  if (!d || !d.figures.length) return null;
  const hits = f => [...f.g].filter(c => c === 'x').length;
  /* A CORPUS BAR IS NOT A LOOP, and this is where that bites.
     A bar in the table is a bar in CONTEXT: the drummer dropping out,
     building up, or ending a phrase. Those bars are real and legitimately
     sparse, and looping one is nonsense — the second commonest rock kick
     bar is a single hit on beat two, which is a pickup, not a groove.
     (Rotated takes were the first suspect and were measured instead of
     assumed: 84% of the takes that can be decided start on a bar line
     and only about 5% are off by an odd beat, nowhere near enough to
     explain it.)

     So a figure is loopable if it marks the bar on its own — two hits
     or more — or if one hit a bar is demonstrably the figure rather
     than a dropout, which a large share is the evidence for. That
     second clause is what keeps reggae's one drop, a single kick on
     beat three held by 23% of its bars, while dropping rock's lone
     kick at 3%. Filtering here and not in grooves.js on purpose: the
     table is measurement and this is a musical judgement about looping,
     and mixing the two would leave no way to see what was measured. */
  const loopable = d.figures.filter(f => hits(f) >= 2 || f.p >= 0.15);
  if (!loopable.length) return null;
  /* AND SOMETIMES THE CORPUS HAS NO FIGURE TO GIVE. Reggae's best
     loopable snare bar holds 1.8% of its bars and jazz's 2.9%, which
     means that 97% of the time the drummer played something else.
     Calling either "the measured snare figure" would be the exact
     overclaiming this file exists to avoid, so the voice is refused and
     the caller composes instead — and reports that it composed.

     The floor is absolute AND the spread is relative, because one of
     them alone gets it wrong in a different direction. An absolute
     floor on its own punishes the best-sampled styles: rock holds 6,388
     bars across 334 takes from 50 to 200bpm, so its shares are low
     because the category is broad, not because the playing is vague.
     A relative test on its own accepts anything as long as it beats the
     other candidates, which is how 1.8% would have got in. */
  const best = Math.max(...loopable.map(f => f.p));
  if (best < 0.04) return null;
  const pool = loopable.filter(f => f.p >= best * 0.4);
  const sorted = pool.slice().sort((a, b) => hits(a) - hits(b));
  const n = sorted.length;
  const band = dens === 'sparse' ? sorted.slice(0, Math.max(1, Math.ceil(n / 2)))
    : dens === 'busy' ? sorted.slice(Math.floor(n / 2))
      : sorted;
  /* weighted by the share each figure actually holds */
  const tot = band.reduce((a, f) => a + f.p, 0);
  let r = (rnd ? rnd() : Math.random()) * tot;
  for (const f of band) { r -= f.p; if (r <= 0) return f; }
  return band[band.length - 1];
}

/* COMPOSED FROM PRINCIPLES, for the voices the corpus cannot speak for
   and for every pitched slot. This is what the whole recipe used to be
   and it is still the honest answer wherever the measurement refuses:
   kept as a named function so that `measured[voice] === false` points at
   something real rather than being a flag over a hidden branch. */
export function composeSteps(voice, fam, dens, rnd) {
  const r = rnd || Math.random;
  const beat = [0, 4, 8, 12], off = [2, 6, 10, 14];
  const sixteenths = [1, 3, 5, 7, 9, 11, 13, 15];
  const out = {};
  const put = (s, p, v) => { out[s] = { p: +p.toFixed(2), v: +v.toFixed(2) }; };
  if (voice === 'kick' || voice === 'low') {
    for (const s of beat) {
      if (voice === 'low' && s % 8 !== 0) continue;
      put(s, fam === 'four' ? 1 : (s === 0 ? 1 : 0.25 + r() * 0.5), 0.8);
    }
    for (const s of off) if (r() < 0.4) put(s, 0.15 + r() * 0.35, 0.6);
  } else if (voice === 'snare') {
    put(4, 1, 0.9); put(12, 1, 0.9);
    for (const s of sixteenths) if (r() < (dens === 'busy' ? 0.3 : 0.12)) put(s, 0.1 + r() * 0.3, 0.45);
  } else if (voice === 'hat') {
    const every = dens === 'busy' ? 1 : dens === 'normal' ? 2 : 4;
    for (let s = 0; s < 16; s += every) put(s, s % 4 === 0 ? 1 : 0.5 + r() * 0.45, s % 4 === 0 ? 0.8 : 0.55);
  }
  return out;
}

/* A FIGURE AS STEPS THE SEQUENCER CAN TAKE: a definite hit, because a
   measured bar is a bar somebody played and not a set of odds. The
   variation across a track comes from choosing between figures, which is
   what infill() already does for rhythm, rather than from rolling dice
   on every step.

   VELOCITY IS COMPARABLE WITHIN A VOICE AND NOT ACROSS VOICES, so only
   the part that transfers is carried over.

   Measured across the table: kick figures average between 0.21 and 0.92
   depending on style, while snares sit at 0.9 to 1.0 in ALL THIRTEEN
   styles. Every drummer in every style hitting the kick far softer than
   the snare is not a fact about music; a kick pedal and a struck mesh
   head are different sensors on one electronic kit, and whatever the
   cause — which this has not established — that offset belongs to the
   capture and must not be carried onto somebody else's samples. Written
   through raw it put a reggae kick on the grid at velocity 0.26 under a
   snare at 0.90, which is the shape of the complaint this repo has
   already written down twice: the sound is not quiet, it is barely
   being played.

   So the figure is scaled by ITS OWN loudest stroke, and what survives
   is the shape inside it: the ghost note under the accent, which is the
   whole reason for carrying velocities.

   Scaling by the loudest stroke of the voice ACROSS the style was tried
   first and is wrong here, which took a test to see. It preserves one
   more real thing — a busy sixteenth kick is genuinely played lighter
   than four on the floor, within the one sensor — but it left seed 16
   writing a kick that peaked at 0.29, because that figure really is a
   third of the hardest kick in its style. A recipe loops ONE figure per
   voice, so the loud figure it is being measured against is not in the
   track to be louder than; the listener hears only this bar, and a part
   that sits at a third of a reference nobody can hear reads as not
   being played. If figures are ever varied across sections, the style
   becomes the right reference again and this should change back.

   The absolute level is then the pad's gain, which is where this repo
   stages levels anyway: from a measured peak, not from taste.

   EXPORTED because the song generator draws kits too, and it was
   reading a figure's raw `v` map straight off the table. Two readings
   of the same numbers is how "velocity is comparable within a voice,
   never across voices" gets quietly forgotten in one of them. */
export function figureSteps(f) {
  let ref = 0;
  for (const v of Object.values(f.v)) if (v > ref) ref = v;
  const scale = ref > 0 ? 0.95 / ref : 1;
  const out = {};
  for (let s = 0; s < 16; s++) {
    if (f.g[s] !== 'x') continue;
    const raw = f.v[s] || 0.8;
    out[s] = { p: 1, v: Math.max(0.05, Math.min(1, +(raw * scale).toFixed(2))) };
  }
  return out;
}

export function makeRecipe(seed, opt) {
  const o = opt || {};
  /* THE SEED IS MIXED BEFORE IT IS USED, and leaving that out made this
     a one-family generator.

     A bare xorshift returns very small numbers for its first few draws
     from a small seed: measured over seeds 1-199 the first draw had a
     mean of 0.006, so `pick(FAMILIES)` chose FAMILIES[0] for ALL 199 OF
     THEM. Every recipe anyone made by counting up from 1 — which is
     what a UI does — came out slow, and because the style is then
     chosen by tempo, only three of the thirteen measured styles could
     ever be drawn from. The same mean after mixing is 0.465, and
     over 4,000 seeds the four families come out uniform on a
     chi-square test. Warming the generator by discarding its first few
     draws was tried and is not needed: the uneven-looking 65/45/42/47
     over the first 199 seeds is small-sample noise, and discarding
     exactly one draw measures WORSE than discarding none.

     This passed the test that a recipe varies between seeds, because
     consecutive seeds do differ in their LATER draws. Variety and
     uniformity are different properties and only one of them was
     being checked. */
  let rs = (seed >>> 0) || 0x9e37;
  rs = (rs + 0x9e3779b9) >>> 0;
  rs = Math.imul(rs ^ (rs >>> 16), 0x21f0aaad) >>> 0;
  rs = Math.imul(rs ^ (rs >>> 15), 0x735a2d97) >>> 0;
  rs = (rs ^ (rs >>> 15)) >>> 0 || 0x9e37;
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

  /* THE DRUM PATTERNS COME OUT OF THE CORPUS. One bar of one voice as
     ten drummers actually played it, at the velocities they played it,
     picked from a style whose measured tempo range brackets this bpm.
     Each hit is a certainty rather than a probability, because a
     measured bar is a bar somebody played — see figureSteps(). What is
     still composed is every PITCHED slot, which is why `measured` below
     is per voice. */
  const styleOpts = stylesFor(bpm);
  const style = o.style
    ? (stylesFor(bpm, { allowThin: true }).find(x => x.id === o.style) || styleOpts[0])
    : pick(styleOpts.slice(0, 3));
  const P = {}, measured = {}, drew = {};
  for (const id of slots) {
    if (ROLES[id].pitched) { measured[id] = false; continue; }
    /* `low` is a sub, and a drum corpus has nothing to say about a bass
       part. The kick figure is the wrong answer for it — a sub doubling
       the kick exactly is a known way to lose both. */
    if (id === 'low') {
      measured[id] = false;
      P[id] = composeSteps('low', fam.id, dens, rnd);
      continue;
    }
    /* A STYLE THAT DROPS A VOICE IS TELLING YOU SOMETHING. Punk in this
       corpus is on the ride for 84% of its bars, so a punk "hat" figure
       is a sixth of the evidence pretending to be the norm. Where the
       named voice is mostly silent and another cymbal is not, the slot
       takes the one that was actually played, and says so. */
    let voice = id;
    if (id === 'hat' && style.voices.hat && style.voices.hat.silent > 0.5) {
      const alt = ['ride', 'open'].find(v => style.voices[v]
        && style.voices[v].silent < style.voices.hat.silent);
      if (alt) voice = alt;
    }
    const f = figureFor(voice, style, dens, rnd);
    if (!f) {
      measured[id] = false;
      P[id] = composeSteps(id, fam.id, dens, rnd);
      continue;
    }
    P[id] = figureSteps(f);
    measured[id] = true;
    drew[id] = { style: style.id, voice, g: f.g, share: f.p };
  }
  /* A recipe with no drums measured is not one worth reporting as
     measured, and it means the tempo found no style at all. */
  const anyMeasured = Object.values(measured).some(Boolean);

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
    /* SAID OUT LOUD, AND PER VOICE, because composed numbers passing as
       measured ones is the failure this repo keeps writing down — and
       one flag for a whole recipe would now say something true about
       the hat and false about the bass. */
    patternsMeasured: anyMeasured,
    measured, drew,
    style: style.id, styleThin: !!style.thin,
    source: DRUM_CORPUS.source,
    name,
    says: name + '. ' + motion.says + '. ' + slots.length + ' slots: '
      + slots.map(s => ROLES[s].label).join(', ')
      + '. Drums measured off ' + style.id + ' in the Groove corpus ('
      + style.takes + ' performances, ' + style.bars + ' bars'
      + (style.thin ? ', THIN — few enough players that this is their habit '
        + 'rather than the style' : '') + '): '
      + (Object.keys(drew).length
        ? Object.keys(drew).map(k => ROLES[k].label + ' ' + drew[k].g
          + ' (' + Math.round(drew[k].share * 100) + '% of bars'
          + (drew[k].voice !== k ? ', played on the ' + drew[k].voice : '') + ')').join(', ')
        : 'none — no voice had a figure the corpus states clearly enough')
      + '. Composed: ' + slots.filter(x => !measured[x]).map(x => ROLES[x].label).join(', ')
      + ' (every pitched part, and any drum voice this style plays too '
      + 'variably to name a figure for).',
  };
}
