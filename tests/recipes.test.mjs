/* A recipe is slots; a slot is a brief; a brief can be checked. */
import { test } from 'node:test';
import assert from 'node:assert';
import { ROLES, fitSlot, suggestFor, makeRecipe, figureFor } from '../src/pure/recipes.js';
import { DRUM_CORPUS } from '../src/pure/grooves.js';
import { timbreOf } from '../src/pure/timbre.js';

const SR = 44100;
function hit(attackSec, decaySec, { sr = SR, hz = 220, tail = 0.2 } = {}) {
  const n = Math.round(sr * (attackSec + decaySec + tail));
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const a = t < attackSec ? (attackSec > 0 ? t / attackSec : 1)
      : Math.pow(10, -3 * (t - attackSec) / decaySec);
    d[i] = a * Math.sin(2 * Math.PI * hz * t);
  }
  return d;
}
const PLUCK = timbreOf(hit(0.002, 0.12), SR);
const BOWED = timbreOf(hit(0.220, 1.2), SR);
const PADDY = timbreOf(hit(0.050, 3.0), SR);

test('every slot states a job and a measurable want', () => {
  for (const [id, R] of Object.entries(ROLES)) {
    assert.ok(R.label && R.says.length > 20, id + ' needs a brief');
    assert.ok(Object.keys(R.wants).length > 0, id + ' needs something checkable');
    assert.ok(R.presets.length > 0, id + ' needs a starting suggestion');
  }
});

test('a bowed swell is refused for a fast hat and accepted for a pad', () => {
  const hat = fitSlot('hat', BOWED, 160, 1);
  assert.equal(hat.fits, false);
  assert.match(hat.says, /will not be heard|to speak/);
  const pad = fitSlot('pad', BOWED, 160, 16);
  assert.equal(pad.fits, true, pad.says);
});

test('a pluck suits a hat and is called short for a pad', () => {
  assert.equal(fitSlot('hat', PLUCK, 160, 1).fits, true);
  assert.match(fitSlot('pad', PLUCK, 90, 16).says, /rings only|clipped/);
});

test('the same sound passes a slow slot and fails a fast one', () => {
  assert.equal(fitSlot('synth', BOWED, 90, 8).fits, true);
  assert.equal(fitSlot('synth', BOWED, 174, 1).fits, false);
});

test('suggestions are ordered by fit, not by name', () => {
  const s = suggestFor('hat', [
    { id: 'bowed', timbre: BOWED }, { id: 'pluck', timbre: PLUCK }, { id: 'paddy', timbre: PADDY },
  ], 160, 1);
  assert.equal(s[0].id, 'pluck', 'the pluck should win a hat slot: ' + JSON.stringify(s.map(x => x.id)));
  assert.equal(s[s.length - 1].id, 'bowed');
});

test('a silent pad is reported rather than ranked', () => {
  const dead = timbreOf(new Float32Array(SR), SR);
  const f = fitSlot('low', dead, 100, 4);
  assert.equal(f.fits, false);
  assert.match(f.says, /silent/);
});

test('a recipe is reproducible from its seed and varies between seeds', () => {
  const a = makeRecipe(1234), b = makeRecipe(1234), c = makeRecipe(999);
  assert.deepEqual(JSON.stringify(a.steps), JSON.stringify(b.steps), 'same seed, same recipe');
  assert.equal(a.bpm, b.bpm);
  const many = [1, 2, 3, 4, 5, 6, 7, 8].map(makeRecipe);
  assert.ok(new Set(many.map(r => r.name)).size >= 6, 'eight seeds should not give one recipe');
  assert.ok(c.seed === 999);
});

test('tempo, feel and density are drawn together, not independently', () => {
  /* a 52bpm track with sixteenth hats is what sampling them separately
     produces, and it is not a thing anyone plays */
  for (let s = 1; s < 60; s++) {
    const r = makeRecipe(s);
    const f = ['slow', 'midtempo', 'four', 'fast'].indexOf(r.family);
    assert.ok(f >= 0, 'every recipe belongs to a family');
    if (r.family === 'slow') assert.ok(r.bpm <= 76, 'slow family stayed slow: ' + r.bpm);
    if (r.family === 'fast') assert.ok(r.bpm >= 140, 'fast family stayed fast: ' + r.bpm);
  }
});

test('every recipe asks for something low and something that marks the beat', () => {
  for (let s = 1; s < 40; s++) {
    const ids = makeRecipe(s).slots.map(x => x.id);
    assert.ok(ids.includes('low'), 'seed ' + s + ' has no low end');
    assert.ok(ids.includes('kick'), 'seed ' + s + ' has nothing on the downbeat');
  }
});

/* ---- WHAT IS MEASURED AND WHAT IS NOT ----------------------------
   The drum figures come out of the Groove corpus and every pitched part
   is still composed, so one flag for a whole recipe would say something
   true about the hat and false about the bass. These check that the
   claim is made per voice and that it is the claim the data supports. */

test('it says per voice what was measured, and names the corpus', () => {
  const r = makeRecipe(7);
  assert.ok(r.measured && typeof r.measured === 'object', 'no per-voice claim at all');
  /* every slot it asked for has to appear, or a missing key reads as
     "not measured" and as "never considered" at the same time */
  for (const sl of r.slots) {
    assert.equal(typeof r.measured[sl.id], 'boolean',
      sl.id + ' has no measured claim');
  }
  assert.match(r.source, /Groove MIDI Dataset/);
  assert.match(r.says, /Groove corpus/);
  assert.match(r.says, /Composed:/);
});

test('NO PITCHED SLOT IS EVER CLAIMED AS MEASURED', () => {
  /* The corpus is ten drummers on a drum kit. It has nothing to say
     about a bass line, and `low` is the trap here: it is a drum-shaped
     slot name on a pitched job, and the kick figure is the wrong answer
     for it. Checked across many seeds because which slots a recipe asks
     for is itself a draw. */
  for (let seed = 1; seed < 120; seed++) {
    const r = makeRecipe(seed);
    for (const sl of r.slots) {
      if (sl.pitched || sl.id === 'low') {
        assert.equal(r.measured[sl.id], false,
          'seed ' + seed + ' claims ' + sl.id + ' is measured');
        assert.ok(!r.drew[sl.id], 'seed ' + seed + ' drew a figure for ' + sl.id);
      }
    }
  }
});

test('a measured figure is reported with the share of bars it holds', () => {
  let found = 0;
  for (let seed = 1; seed < 60; seed++) {
    const r = makeRecipe(seed);
    for (const [voice, d] of Object.entries(r.drew)) {
      found++;
      assert.equal(r.measured[voice], true, voice + ' drew a figure but is not measured');
      assert.match(d.g, /^[x.]{16}$/);
      assert.ok(d.share > 0 && d.share <= 1, voice + ' share ' + d.share);
      assert.ok(DRUM_CORPUS.styles[d.style], 'drew from an unknown style ' + d.style);
      /* and the steps it wrote must BE that figure, or the provenance
         is decoration */
      const wrote = Array.from({ length: 16 },
        (_, i) => (r.steps[voice] && r.steps[voice][i] ? 'x' : '.')).join('');
      assert.equal(wrote, d.g, voice + ' wrote ' + wrote + ' but reports ' + d.g);
    }
  }
  assert.ok(found > 40, 'only ' + found + ' measured voices across 59 seeds');
});

test('a measured hit is a certainty at the velocity it was played', () => {
  /* A bar from the corpus is a bar somebody played, not a set of odds,
     and the velocities are the half of a groove a step list cannot
     carry. A composed voice is the opposite: its ghost notes are
     genuinely probabilistic. */
  let certain = 0, chancy = 0;
  for (let seed = 1; seed < 40; seed++) {
    const r = makeRecipe(seed);
    for (const [voice, steps] of Object.entries(r.steps)) {
      for (const st of Object.values(steps)) {
        assert.ok(st.p > 0 && st.p <= 1, voice + ' p ' + st.p);
        assert.ok(st.v > 0 && st.v <= 1, voice + ' v ' + st.v);
        if (r.measured[voice]) { assert.equal(st.p, 1); certain++; }
        else if (st.p < 1) chancy++;
      }
    }
  }
  assert.ok(certain > 100, 'only ' + certain + ' measured steps');
  assert.ok(chancy > 10, 'composed voices should carry probabilistic steps, got ' + chancy);
});

test('the style it drew from can play at the tempo it chose', () => {
  /* A 170bpm recipe handed figures measured off 90bpm takes is the one
     way this can be quietly wrong: the hat that is laid back at 90 is a
     blur at 170, and nothing downstream would catch it. */
  for (let seed = 1; seed < 80; seed++) {
    const r = makeRecipe(seed);
    const st = DRUM_CORPUS.styles[r.style];
    assert.ok(st, 'seed ' + seed + ' drew from unknown style ' + r.style);
    if (!Object.keys(r.drew).length) continue;
    assert.ok(r.bpm >= st.bpm[0] && r.bpm <= st.bpm[2],
      'seed ' + seed + ' is ' + r.bpm + 'bpm but ' + r.style
      + ' was played at ' + st.bpm[0] + '-' + st.bpm[2]);
  }
});

test('a voice the corpus cannot speak for is composed and SAYS so', () => {
  /* Reggae's best loopable snare bar holds 1.8% of its bars and
     jazz's 2.9%, so 97% of the time the drummer played something
     else. Claiming either as the measured figure is the overclaiming
     this whole layer is built to avoid. */
  const thin = figureFor('snare', { voices: DRUM_CORPUS.styles.reggae.voices }, 'normal', () => 0.5);
  assert.equal(thin, null, 'reggae snare should be refused, not reported');
  const solid = figureFor('snare', { voices: DRUM_CORPUS.styles.rock.voices }, 'normal', () => 0.5);
  assert.ok(solid && solid.g === '....x.......x...',
    'rock snare is a quarter of its bars and must be accepted');
  /* and when it is refused the recipe still writes a part, rather than
     leaving the slot silent */
  const r = makeRecipe(999);
  const refused = r.slots.filter(sl => !sl.pitched && sl.id !== 'low' && !r.measured[sl.id]);
  for (const sl of refused) {
    assert.ok(r.steps[sl.id] && Object.keys(r.steps[sl.id]).length > 0,
      sl.id + ' was refused a figure and then left with no part at all');
  }
});

test('a single-hit bar is not looped unless it is plainly the figure', () => {
  /* The tell that found this: a lone kick on beat two is the second
     commonest rock kick bar at 6.4%, and it is a pickup rather than a
     groove. Reggae's one drop is also a single hit and IS the figure,
     held by 23% of its bars, so hit count alone cannot separate them. */
  const seen = new Set();
  for (let seed = 1; seed < 200; seed++) {
    const r = makeRecipe(seed);
    for (const [voice, d] of Object.entries(r.drew)) {
      const hits = [...d.g].filter(c => c === 'x').length;
      assert.ok(hits >= 2 || d.share >= 0.15,
        'looped ' + d.g + ' for ' + voice + ' on ' + d.share + ' of bars');
      seen.add(d.g);
    }
  }
  assert.ok(seen.size > 15, 'only ' + seen.size + ' distinct figures over 199 seeds');
});

test('each slot carries the gap its notes sit at, so a fit can be judged', () => {
  const r = makeRecipe(42);
  for (const s of r.slots) {
    assert.ok(s.gap >= 1, s.id + ' needs a gap');
    const f = fitSlot(s.id, PLUCK, r.bpm, s.gap);
    assert.ok(typeof f.fits === 'boolean', s.id + ' must be checkable');
  }
});

test('COUNTING UP FROM 1 EXPLORES THE WHOLE SPACE, not one corner of it', () => {
  /* The bug this is here for: a bare xorshift returns tiny numbers for
     its first draws from a small seed, so every one of seeds 1-199
     picked the first family, every recipe came out slow, and only three
     of the thirteen measured styles could be reached. A UI counts up
     from 1, so small seeds are the common case and not the edge.

     Variety between seeds was already tested and passed throughout,
     because consecutive seeds differ in their later draws. This tests
     UNIFORMITY, which is a different property. */
  const fams = new Map(), styles = new Set(), figures = new Set();
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const r = makeRecipe(seed);
    fams.set(r.family, (fams.get(r.family) || 0) + 1);
    styles.add(r.style);
    for (const d of Object.values(r.drew)) figures.add(d.g);
  }
  assert.equal(fams.size, 4, 'only drew families: ' + [...fams.keys()].join(', '));
  /* Chi-square at 3 degrees of freedom is 7.81 at p=0.05. The bound
     here is deliberately loose: the job is to catch a generator stuck
     in one corner -- the real bug scored about 1200 -- not to certify
     an RNG. */
  const exp = N / 4;
  const chi = [...fams.values()].reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
  assert.ok(chi < 20, 'families are skewed: '
    + [...fams.entries()].map(([k, v]) => k + ':' + v).join(' ')
    + ' chi2 ' + chi.toFixed(1));
  assert.ok(styles.size >= 8, 'only reached ' + styles.size
    + ' measured styles: ' + [...styles].join(', '));
  assert.ok(figures.size >= 25,
    'only ' + figures.size + ' distinct figures over ' + N + ' seeds');
});

test('velocity is scaled within a voice, because across voices it is not comparable', () => {
  /* Kick figures in the table average 0.21 to 0.92 by style while
     snares sit at 0.9-1.0 in all thirteen, so the corpus carries a
     systematic kick-under-snare offset that belongs to its electronic
     kit rather than to the music. Written through raw it put a reggae
     kick on the grid at 0.26 under a snare at 0.90.

     The two properties that must BOTH hold: no measured voice comes out
     crushed, and the dynamics inside a voice survive the scaling. A
     normalisation that flattened the second would be a step list with
     extra bytes. */
  let loudEnough = 0, shaped = 0;
  for (let seed = 1; seed < 250; seed++) {
    const r = makeRecipe(seed);
    for (const [voice, steps] of Object.entries(r.steps)) {
      if (!r.measured[voice]) continue;
      const vs = Object.values(steps).map(c => c.v);
      const top = Math.max(...vs);
      assert.ok(top >= 0.3,
        'seed ' + seed + ' wrote ' + voice + ' with nothing above ' + top
        + ' — that reads as not being played');
      loudEnough++;
      if (new Set(vs.map(v => Math.round(v * 20))).size > 1) shaped++;
    }
  }
  assert.ok(loudEnough > 150, 'only ' + loudEnough + ' measured voices checked');
  /* ghost notes and accents are a real part of this corpus, so a decent
     share of figures must come out with more than one level in them */
  assert.ok(shaped > 20,
    'only ' + shaped + ' of ' + loudEnough
    + ' measured voices kept any dynamic shape — the scaling flattened them');
});
