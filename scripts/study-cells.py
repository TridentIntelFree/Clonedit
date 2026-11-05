#!/usr/bin/env python3.13
# WHERE DO MELODIC NOTES FALL, AND HOW LONG ARE THEY?
#
# Run with -I; the corpus is only ever read.
#
# The rhythm cell library in mlWrite() is hand-authored. Its comment says
# so plainly -- "each is something a player would actually do" -- and
# that is the one unmeasured thing left in the write path. Every other
# norm here comes from a corpus: melody from 8,514 Essen folksongs,
# harmony from 370 Bach chorales, counterpoint from 70 Palestrina
# scores, drum figures from 1,138 Groove MIDI takes. The cells came from
# somebody's judgement.
#
# WHY NOT PINK NOISE, which is what prompted this. A 1/f distribution
# would give note durations the right HISTOGRAM and no PLACEMENT, and
# placement is the whole problem: AGENTS.md records that generating
# values and dealing them onto invented step offsets is what gave
# HOLLOWAY an audible stumble. A duration drawn from any distribution
# does not know where the downbeat is. So this measures the two
# together, as whole bars, which is the only form in which they mean
# anything.
#
# WHY THE GROOVE CORPUS IS THE WRONG ONE, having suggested it myself:
# Groove MIDI is drums. A drum hit has an onset and no played duration --
# a kick's note-off is meaningless -- so it can answer placement and
# cannot answer duration. The Essen Folksong Collection is monophonic
# melody with notated durations, which is what the lead and bass cells
# are for.
#
# WHAT IT EMITS: src/pure/cells.js
#   MELODY_CELLS.bars    the commonest whole-bar figures, as [step, beats]
#   MELODY_CELLS.onsets  share of notes starting on each of 16 steps
#   MELODY_CELLS.durations share of notes at each length in steps
#
# Usage: python3.13 -I scripts/study-cells.py

import json
import os
import sys
from collections import Counter
from fractions import Fraction

try:
    import music21
    from music21 import converter
except ImportError:
    sys.exit('needs music21 (pip install --break-system-packages music21); '
             'its corpus/essenFolksong ships the ABC this reads')

STEPS = 16          # the app's bar, and the grid every cell is written on
TOL = Fraction(1, 100)

ESSEN = os.path.join(os.path.dirname(music21.__file__), 'corpus', 'essenFolksong')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                   'src', 'pure', 'cells.js')


def duple(ts):
    """Can this bar be written on a 16-step grid at all?

    A 16-step bar divides into 2, 4, 8 and 16 and does NOT divide into 3,
    so 3/4, 6/8 and 9/8 cannot be represented without inventing a
    tuplet. They are counted and excluded rather than squeezed -- a 3/4
    bar stretched onto 16 steps is a 3/4 bar nobody played. Triple feels
    are what poly() and the FEEL cross-rhythm are for."""
    if ts is None:
        return False
    beats = Fraction(ts.numerator) / Fraction(ts.denominator) * 4   # in quarters
    # the bar must split into 16 equal steps
    return (Fraction(16) * (Fraction(1) / beats)).denominator == 1 or \
           (beats * 4).denominator == 1 and Fraction(16) % (beats * 4) == 0


def bar_cells(measure, bar_quarters):
    """(step, length-in-steps) per note, or None if it will not quantize.

    Positions are a FRACTION OF THE BAR rather than a beat count, so a
    bar of 4/2 and a bar of 4/4 come out on the same 16 steps. The app's
    bar is 16 steps whatever the notation says."""
    out = []
    per = Fraction(bar_quarters) / STEPS      # quarters per step
    if per <= 0:
        return None
    for n in measure.notes:
        off = Fraction(n.offset)
        ql = Fraction(n.quarterLength)
        if ql <= 0:
            return None
        step = off / per
        length = ql / per
        if step.denominator != 1 or length.denominator != 1:
            return None                       # a triplet or a tie we cannot place
        step, length = int(step), int(length)
        if step < 0 or step >= STEPS:
            return None
        out.append((step, min(length, STEPS * 4)))
    return out or None


files = sorted(f for f in os.listdir(ESSEN) if f.endswith('.abc'))
print('reading %d ABC files from %s' % (len(files), ESSEN))

bars = Counter()
onsets = Counter()
durations = Counter()
tunes = 0
stat = Counter()

for fi, fn in enumerate(files):
    try:
        opus = converter.parse(os.path.join(ESSEN, fn))
    except Exception as e:                      # noqa: BLE001
        stat['file_failed'] += 1
        print('  skipped %s (%s)' % (fn, str(e)[:60]))
        continue
    scores = list(opus.scores) if hasattr(opus, 'scores') else [opus]
    for sc in scores:
        tunes += 1
        tss = list(sc.recurse().getElementsByClass('TimeSignature'))
        ts = tss[0] if tss else None
        if not ts:
            stat['no_meter'] += 1
            continue
        if len(tss) > 1:
            stat['meter_changes'] += 1
        bar_q = Fraction(ts.numerator * 4, ts.denominator)
        if (Fraction(bar_q) / STEPS).denominator != 1 and \
           (STEPS / (Fraction(bar_q))).denominator != 1:
            stat['odd_meter'] += 1
            continue
        if ts.numerator % 3 == 0 and ts.numerator != 3 * 0:
            # 3/4, 6/8, 9/8 -- see duple()
            if ts.numerator in (3, 6, 9, 12) and ts.numerator != 12:
                stat['triple_meter'] += 1
                continue
        for m in sc.recurse().getElementsByClass('Measure'):
            if not m.notes:
                stat['empty_bar'] += 1
                continue
            cs = bar_cells(m, bar_q)
            if cs is None:
                stat['unquantizable_bar'] += 1
                continue
            stat['bar'] += 1
            bars[tuple(cs)] += 1
            for step, length in cs:
                onsets[step] += 1
                durations[length] += 1
    print('  %2d/%d %-16s tunes=%d bars=%d' % (fi + 1, len(files), fn, tunes, stat['bar']))

total_bars = stat['bar']
total_notes = sum(onsets.values())
print('\n%d tunes, %d usable bars, %d notes' % (tunes, total_bars, total_notes))
print('skipped: ' + ', '.join('%s=%d' % (k, v) for k, v in sorted(stat.items())
                              if k != 'bar'))

if total_bars < 2000:
    sys.exit('REFUSING: only %d bars survived, which is not a corpus' % total_bars)

# ---- the three tables -------------------------------------------------

onset_pct = [round(100.0 * onsets[s] / total_notes, 2) for s in range(STEPS)]
dur_items = sorted(durations.items(), key=lambda kv: -kv[1])[:12]
dur_pct = [{'steps': d, 'pct': round(100.0 * c / total_notes, 2)} for d, c in dur_items]

# the commonest whole bars, which is placement and duration together
top = bars.most_common(40)
bar_rows = []
for cells, c in top:
    bar_rows.append({
        'cells': [[s, round(l / 4.0, 3)] for s, l in cells],   # beats, as CELLS uses
        'notes': len(cells),
        'pct': round(100.0 * c / total_bars, 3),
    })

# ---- THE GATE ---------------------------------------------------------
# A decoding mistake does not look like a discovery. Three things have to
# be true of any honest reading of melodic rhythm, and if they are not
# then the offsets or the meters were read wrong.
problems = []
if onset_pct[0] != max(onset_pct):
    problems.append('step 0 is not the commonest onset (%.1f%%, max is %.1f%% at step %d)'
                    % (onset_pct[0], max(onset_pct), onset_pct.index(max(onset_pct))))
on_beat = sum(onset_pct[s] for s in (0, 4, 8, 12))
off_16 = sum(onset_pct[s] for s in (1, 3, 5, 7, 9, 11, 13, 15))
if on_beat <= off_16:
    problems.append('quarter-note positions (%.1f%%) do not beat odd sixteenths (%.1f%%)'
                    % (on_beat, off_16))
if not dur_pct or dur_pct[0]['steps'] > 8:
    problems.append('the commonest duration is %s steps, which is longer than a half bar'
                    % (dur_pct[0]['steps'] if dur_pct else '?'))
if problems:
    print('\nREFUSING TO WRITE -- this is not what melodic rhythm looks like:')
    for p in problems:
        print('  ' + p)
    print('That is a decoding mistake, not a discovery.')
    sys.exit(2)

print('\nONSET BY STEP (%% of notes)')
for s in range(STEPS):
    bar = '#' * int(round(onset_pct[s] / 1.5))
    print('  %2d %6.2f%% %s' % (s, onset_pct[s], bar))
print('  on the quarter: %.1f%%   on odd sixteenths: %.1f%%' % (on_beat, off_16))

print('\nDURATION (%% of notes), in 16th steps')
for d in dur_pct:
    print('  %2d steps %6.2f%%' % (d['steps'], d['pct']))

print('\nCOMMONEST WHOLE BARS (placement and duration together)')
for r in bar_rows[:12]:
    print('  %6.3f%%  %s' % (r['pct'], ' '.join('%d:%g' % (s, l) for s, l in r['cells'])))

payload = {
    'source': 'Essen Folksong Collection (music21 corpus, %d ABC files)' % len(files),
    'measured': {'tunes': tunes, 'bars': total_bars, 'notes': total_notes,
                 'steps': STEPS},
    'skipped': {k: v for k, v in sorted(stat.items()) if k != 'bar'},
    'onsetPct': onset_pct,
    'durationPct': dur_pct,
    'bars': bar_rows,
}

header = '''/* GENERATED by scripts/study-cells.py -- do not edit by hand.

   WHERE MELODIC NOTES FALL AND HOW LONG THEY ARE, measured from the
   Essen Folksong Collection: %d tunes, %d bars, %d notes.

   The rhythm cell library in mlWrite() is hand-authored and said so,
   and it was the last unmeasured thing in the write path -- melody,
   harmony, counterpoint and drum figures all come from corpora, and the
   cells came from somebody\\x27s judgement.

   THIS IS PLACEMENT AND DURATION TOGETHER, as whole bars, because
   separately they mean nothing. A duration drawn from any distribution,
   pink noise included, has the right histogram and does not know where
   the downbeat is -- which is exactly the mistake AGENTS.md records as
   HOLLOWAY\\x27s audible stumble.

   ONLY DUPLE METERS ARE IN HERE. A 16-step bar divides into 2, 4, 8 and
   16 and does not divide into 3, so 3/4, 6/8 and 9/8 were counted and
   excluded rather than squeezed onto a grid that cannot hold them. The
   `skipped` map says how many went which way. Triple feels are what
   poly() and the FEEL cross-rhythm are for.

   AND IT IS FOLK MELODY, which is what the corpus is. These are lead
   and inner-voice figures. A bass line and an arpeggio are different
   jobs and this says nothing about them.
*/
''' % (payload['measured']['tunes'], total_bars, total_notes)

with open(OUT, 'w') as fh:
    fh.write(header)
    fh.write('export const MELODY_CELLS = ')
    fh.write(json.dumps(payload, indent=2))
    fh.write(';\n')
print('\nwrote ' + os.path.relpath(OUT))
