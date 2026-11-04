/* THE TABLE IS GENERATED, SO WHAT IS TESTED IS THE TABLE.

   src/pure/grooves.js is written by scripts/study-groove-patterns.py
   from a corpus that is not in this repository, so nobody running these
   tests can re-derive it. That makes the checked-in file the artefact
   and these the only thing standing between a bad regeneration and a
   release.

   Two kinds of assertion. The structural ones would catch an emitter
   bug — a grid of the wrong length, a velocity for a step that has no
   hit, a share outside 0..1. The musical ones are known answers: this
   is a corpus of backbeat drumming, so if rock's commonest snare bar
   ever stops being the backbeat, the bar alignment broke and every
   figure in the file is noise. The generator checks those two before it
   writes; these check that what WAS written still says so, which is not
   the same thing — a stale file passes the generator's check by never
   having been regenerated. */

import { test } from 'node:test';
import assert from 'node:assert';
import { GROOVES } from '../src/pure/grooves.js';

const STEPS = 16;
const styles = Object.entries(GROOVES.styles);

test('it says where it came from and what it does not cover', () => {
  assert.match(GROOVES.source, /Groove MIDI Dataset/);
  assert.match(GROOVES.source, /CC BY 4\.0/);
  /* the pitched half being unmeasured is the thing most likely to be
     forgotten by whatever reads this, so the file has to say it */
  assert.match(GROOVES.note, /[Dd]rums only/);
  assert.ok(GROOVES.measured.bars > 10000, 'bars: ' + GROOVES.measured.bars);
  assert.equal(GROOVES.measured.steps, STEPS);
});

test('every figure is sixteen steps with a share and real velocities', () => {
  let figures = 0;
  for (const [style, e] of styles) {
    for (const [voice, d] of Object.entries(e.voices)) {
      assert.ok(d.figures.length > 0, style + '/' + voice + ' has no figures');
      assert.ok(d.silent >= 0 && d.silent <= 1, style + '/' + voice + ' silent ' + d.silent);
      for (const f of d.figures) {
        figures++;
        const where = style + '/' + voice + ' ' + f.g;
        assert.equal(f.g.length, STEPS, where + ' is not 16 steps');
        assert.match(f.g, /^[x.]{16}$/, where + ' has a character that is not x or .');
        assert.ok(f.g.includes('x'), where + ' is an empty bar — that is `silent`, not a figure');
        assert.ok(f.p > 0 && f.p <= 1, where + ' share ' + f.p);
        /* A VELOCITY PER HIT AND NO OTHERS. A velocity on a step with no
           hit would be written onto the grid as a note nobody measured,
           and a hit with no velocity would fall back to a default and
           lose the ghost-note distinction that is half the point of
           carrying velocities at all. */
        const hits = [...f.g].reduce((a, c, i) => (c === 'x' ? a.concat(i) : a), []);
        assert.deepEqual(Object.keys(f.v).map(Number).sort((a, b) => a - b), hits,
          where + ' velocities do not match its hits');
        for (const [s, v] of Object.entries(f.v)) {
          assert.ok(v > 0 && v <= 1, where + ' step ' + s + ' velocity ' + v);
        }
      }
      /* ranked by share, because callers take the first n */
      for (let i = 1; i < d.figures.length; i++) {
        assert.ok(d.figures[i - 1].p >= d.figures[i].p,
          style + '/' + voice + ' figures are not sorted by share');
      }
    }
  }
  assert.ok(figures > 200, 'only ' + figures + ' figures in the whole table');
});

test('each style states its tempo range in order and its sample size', () => {
  for (const [style, e] of styles) {
    const [lo, med, hi] = e.bpm;
    assert.ok(lo <= med && med <= hi, style + ' bpm out of order: ' + e.bpm);
    assert.ok(lo >= 30 && hi <= 320, style + ' bpm implausible: ' + e.bpm);
    assert.ok(e.bars >= 250, style + ' has only ' + e.bars + ' bars');
    assert.ok(e.takes >= 1);
    /* A STYLE IS NOT A DRUMMER, and the flag that says so has to be
       present wherever it is true — a thin style reads exactly like a
       well-sampled one otherwise. */
    if (e.takes < 20) assert.equal(e.thin, true, style + ' is thin and unflagged');
    else assert.equal(e.thin, undefined, style + ' is flagged thin with ' + e.takes + ' takes');
  }
});

/* ---- KNOWN ANSWERS ------------------------------------------------ */

test('rock is a backbeat, which is what proves the bar alignment', () => {
  const r = GROOVES.styles.rock;
  assert.ok(r, 'rock is the best-sampled style here and must be present');
  assert.equal(r.voices.snare.figures[0].g, '....x.......x...',
    'if this is not the backbeat, tick 0 is not a bar line and the whole table is noise');
  assert.ok(r.voices.snare.figures[0].p > 0.15,
    'and it should be a quarter of all rock bars, got ' + r.voices.snare.figures[0].p);
  assert.equal(r.voices.kick.figures[0].g[0], 'x',
    'rock kick should land on the downbeat');
});

test('the figures nobody told it to look for are there', () => {
  /* These three were not sought and are not used by the generator's own
     check, so they are evidence the method finds real playing rather
     than the two patterns it was told to expect. */
  const jazz = GROOVES.styles.jazz;
  assert.equal(jazz.voices.hat.figures[0].g, '....x.......x...',
    'jazz hi-hat belongs on 2 and 4');
  assert.match(jazz.voices.ride.figures[0].g, /^x\.\.\.x\.\.x/,
    'the jazz ride should come out swung, got ' + jazz.voices.ride.figures[0].g);
  /* reggae's one drop: the kick on beat three and nothing on beat one */
  const reggae = GROOVES.styles.reggae.voices.kick.figures;
  assert.ok(reggae.some(f => f.g === '........x.......' && f.p > 0.1),
    'the one drop should be a fifth of reggae kick bars: '
    + reggae.map(f => f.g + ' ' + f.p).join(' '));
});

test('silence is reported, because a style that drops a voice is telling you something', () => {
  /* Punk drummers in this corpus are on the ride, not the closed hat.
     Offering a punk hat figure as the norm would be wrong, and only
     `silent` says so — the figures themselves look perfectly ordinary. */
  assert.ok(GROOVES.styles.punk.voices.hat.silent > 0.5,
    'punk hat silent share: ' + GROOVES.styles.punk.voices.hat.silent);
  /* and a voice every style plays must NOT read as mostly absent, or
     the field is measuring something else */
  assert.ok(GROOVES.styles.rock.voices.snare.silent < 0.1,
    'rock snare silent share: ' + GROOVES.styles.rock.voices.snare.silent);
});

test('a ghost note is quieter than a backbeat, in the data', () => {
  /* The reason velocities are carried at all. A sixteenth-note kick
     figure is played lighter than four on the floor, and if the table
     flattened that it would be a step list with extra bytes. */
  const k = GROOVES.styles.rock.voices.kick.figures;
  const four = k.find(f => f.g === 'x...x...x...x...');
  const busy = k.find(f => [...f.g].filter(c => c === 'x').length >= 6);
  assert.ok(four && busy, 'expected both a four-on-the-floor and a busy kick figure');
  const mean = (f) => Object.values(f.v).reduce((a, b) => a + b, 0) / Object.keys(f.v).length;
  assert.ok(mean(busy) < mean(four),
    'the busy figure should be played lighter: ' + mean(busy).toFixed(2)
    + ' vs ' + mean(four).toFixed(2));
});
