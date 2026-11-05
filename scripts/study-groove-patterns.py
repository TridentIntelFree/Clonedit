# A LIBRARY OF REAL BARS, not a distribution to sample from.
#
# Two routes into this corpus were tried first and both fail, which is
# why the output is shaped the way it is.
#
# PER-STEP PROBABILITIES. The marginal over 334 rock takes reads 20-34%
# on every one of sixteen snare steps. Written onto a grid as sixteen
# independent draws that gives a bar with snare scattered everywhere,
# because the steps within one bar are strongly correlated and a
# marginal throws exactly that away. The average of many grooves is not
# a groove.
#
# EXACT WHOLE-BAR PATTERNS. Measured: it takes 1,533 distinct kick/snare/
# hat combinations to cover half of rock's 6,296 bars, and the commonest
# single bar is 3% of them. The first guess at why was fill takes -- 647
# of the 1,150 are labelled `fill` -- but excluding them removes 70 bars
# out of 6,366 and moves no figure by more than a point, because a fill
# take is a groove with a fill at the end. The diffuseness is real: a
# human drummer varies nearly every bar.
#
# What IS concentrated is one voice over one bar. Rock snare is
# `....x.......x...` on 27% of bars, hiphop snare on 35%, dance kick is
# four-on-the-floor on 27%. So this emits, per style and per voice, the
# commonest bars with the share of the corpus each actually holds --
# real bars to choose between, which is what src/pure/contours.js and
# infill() already do for rhythm. The library stops being composed.
#
# IT COVERS DRUMS AND NOTHING ELSE. The corpus is ten drummers on a
# Roland TD-11, so kick, snare, hat, ride, tom and the rest are measured
# and every pitched slot in a recipe -- low, synth, lead, pad -- is
# still composed. `patternsMeasured` therefore has to be per voice
# rather than one flag for a whole recipe, or it says something true
# about the hat and false about the bass.
#
# Run with -I; the corpus path comes in as an argument and is only read.

import sys, os, csv, json, collections
import mido

CORPUS = sys.argv[1]
OUT = sys.argv[2]
INFO = os.path.join(CORPUS, 'info.csv')

VOICES = {
    'kick':  (35, 36),
    'snare': (38, 40),
    'ghost': (37,),
    'hat':   (42, 44),
    'open':  (46,),
    'ride':  (51, 53, 59),
    'crash': (49, 55, 57, 52),
    'tom':   (41, 43, 45, 47, 48, 50),
}
NOTE2VOICE = {n: v for v, ns in VOICES.items() for n in ns}
STEPS = 16
TOP = 6            # figures kept per voice per style
MIN_BARS = 250     # a style with fewer bars cannot state a share
MIN_SHARE = 0.015  # and a figure under this is one drummer's habit


def grid(mask):
    return ''.join('x' if mask >> s & 1 else '.' for s in range(STEPS))


HEADER = """/* MEASURED DRUM FIGURES — generated, do not hand-edit.

   Rebuild with:
     python3 -I scripts/study-groove-patterns.py <corpus> src/pure/grooves.js

   where <corpus> is an extracted Groove MIDI Dataset v1.0.0 (CC BY 4.0,
   magenta.tensorflow.org/datasets/groove). The dataset is not vendored
   here; it is 3MB of MIDI and this file is what it is for.

   WHAT THIS IS. One bar of one voice, as ten drummers actually played
   it, with the share of the corpus each figure holds. `g` is sixteen
   steps, `p` is that share, `v` is the mean velocity at each step the
   figure hits, 0..1. `silent` is the share of bars where the style does
   not use the voice at all — which is information: punk uses a closed
   hat on 16% of its bars and a ride the rest of the time, so offering a
   punk hat figure as though it were the norm would be wrong.

   WHY FIGURES AND NOT A DISTRIBUTION. Two other shapes were tried.

   Per-step probabilities, averaged over a style, come out flat: 20-34%
   on every one of sixteen snare steps across 334 rock takes. Sixteen
   independent draws at those odds scatter snare everywhere, because the
   steps inside one bar are strongly correlated and a marginal discards
   exactly that. The average of many grooves is not a groove.

   Exact whole-bar patterns go the other way: 1,533 distinct kick/snare/
   hat combinations are needed to cover half of rock's 6,296 bars, and
   the commonest single bar is 3% of them. Fill takes looked like the
   cause — 647 of the 1,150 are labelled `fill` — but excluding them
   removes 70 bars out of 6,366 and moves no figure by more than a
   point, because a fill take is a groove with a fill at the end. Human
   drummers vary nearly every bar and that is not an artefact.

   One voice over one bar is the level that concentrates. Rock snare is
   the backbeat on 26% of bars, hiphop snare on 34%, afrocuban kick is
   four-on-the-floor on 20%.

   THE GRID IS CHECKED AGAINST KNOWN ANSWERS. Every take was played to a
   metronome at a stated tempo, so tick 0 is a bar line and no beat
   tracking is needed — that assumption is the one thing all of this
   rests on, so the generator refuses to write this file unless rock's
   commonest snare bar is the backbeat and its commonest kick bar hits
   the downbeat. Two patterns nobody told it to look for came out of it
   anyway: jazz hi-hat on 2 and 4, and the swing ride.

   `takes` IS THE NUMBER OF PERFORMANCES and it matters as much as
   `bars`: a style carrying 545 bars off 7 takes describes one or two
   drummers, not a genre. Those styles are marked `thin: true` rather
   than dropped, because the bars are real; prefer an unmarked style
   when the question is what a style normally does.

   IT IS DRUMS AND NOTHING ELSE. The corpus is ten drummers on a Roland
   TD-11. Every pitched part — bass, synth, lead, pad — is still
   composed, which is why a recipe reports what was measured per voice
   rather than carrying one flag for the whole thing. */

"""


def jsnum(x):
    """0.07 not 0.07000000000000001, and no trailing .0 on a whole number."""
    s = ('%g' % x)
    return s


def emit(out, path):
    L = [HEADER, 'export const DRUM_CORPUS = {\n']
    L.append('  source: %s,\n' % json.dumps(out['source']))
    L.append('  note: %s,\n' % json.dumps(out['note']))
    m = out['measured']
    L.append('  measured: { takes: %d, skipped: %d, bars: %d, steps: %d },\n'
             % (m['takes'], m['skipped'], m['bars'], m['steps']))
    L.append('  styles: {\n')
    for style, e in out['styles'].items():
        L.append('    %s: { bars: %d, takes: %d, bpm: [%d, %d, %d],%s voices: {\n'
                 % (style, e['bars'], e['takes'],
                    e['bpm'][0], e['bpm'][1], e['bpm'][2],
                    ' thin: true,' if e.get('thin') else ''))
        for v, d in sorted(e['voices'].items()):
            L.append('      %s: { silent: %s, figures: [\n' % (v, jsnum(d['silent'])))
            for f in d['figures']:
                vel = ', '.join('%s: %s' % (k, jsnum(val))
                                for k, val in sorted(f['v'].items(), key=lambda x: int(x[0])))
                L.append("        { g: '%s', p: %s, v: { %s } },\n"
                         % (f['g'], jsnum(f['p']), vel))
            L.append('      ] },\n')
        L.append('    } },\n')
    L.append('  },\n};\n')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(''.join(L))


def main():
    rows = list(csv.DictReader(open(INFO, encoding='utf-8')))
    # style -> voice -> mask -> [count, {step: [vels]}]
    fig = collections.defaultdict(
        lambda: collections.defaultdict(
            lambda: collections.defaultdict(
                lambda: [0, collections.defaultdict(list)])))
    bars_of_style = collections.Counter()
    bpms = collections.defaultdict(list)
    files = skipped = 0

    for r in rows:
        if r['time_signature'] != '4-4':
            skipped += 1
            continue
        path = os.path.join(CORPUS, r['midi_filename'])
        if not os.path.exists(path):
            skipped += 1
            continue
        style = r['style'].split('/')[0]
        try:
            mid = mido.MidiFile(path)
        except Exception:
            skipped += 1
            continue
        tpb = mid.ticks_per_beat
        sixteenth = tpb / 4.0
        bar_ticks = sixteenth * STEPS
        # bar -> voice -> {step: velocity}
        bars = collections.defaultdict(lambda: collections.defaultdict(dict))
        t = 0
        for msg in mido.merge_tracks(mid.tracks):
            t += msg.time
            if msg.type != 'note_on' or msg.velocity <= 0:
                continue
            v = NOTE2VOICE.get(msg.note)
            if v is None:
                continue
            bar = int(t // bar_ticks)
            step = int(round((t % bar_ticks) / sixteenth)) % STEPS
            # a flam quantising onto one step keeps the louder stroke
            prev = bars[bar][v].get(step, 0)
            bars[bar][v][step] = max(prev, msg.velocity)
        if not bars:
            skipped += 1
            continue
        files += 1
        bpms[style].append(float(r['bpm']))
        last = max(bars)
        for bar, vs in bars.items():
            if bar == last:        # the take stops mid-bar
                continue
            bars_of_style[style] += 1
            for v in VOICES:
                hitmap = vs.get(v, {})
                mask = 0
                for s in hitmap:
                    mask |= 1 << s
                rec = fig[style][v][mask]
                rec[0] += 1
                for s, vel in hitmap.items():
                    rec[1][s].append(vel)

    # ---- KNOWN ANSWERS, or the grid is wrong and none of it means
    # anything. Backbeat drumming puts the snare on 4 and 12 and the
    # kick on 1; if the tick arithmetic or the bar alignment were off,
    # these would be somewhere else.
    problems = []
    rock = fig.get('rock', {})
    if rock:
        snare_top = max(((m, c[0]) for m, c in rock['snare'].items() if m),
                        key=lambda x: x[1])[0]
        if grid(snare_top) != '....x.......x...':
            problems.append('rock snare\x27s commonest bar is %s, not the backbeat'
                            % grid(snare_top))
        kick_top = max(((m, c[0]) for m, c in rock['kick'].items() if m),
                       key=lambda x: x[1])[0]
        if not (kick_top & 1):
            problems.append('rock kick\x27s commonest bar %s has nothing on the downbeat'
                            % grid(kick_top))
    else:
        problems.append('no rock bars found at all')

    print('%d files, %d skipped, %d bars' % (files, skipped, sum(bars_of_style.values())))
    if problems:
        print('GRID CHECK FAILED -- writing nothing:')
        for p in problems:
            print('  ' + p)
        sys.exit(1)
    print('grid check passed: rock snare on the backbeat, rock kick on the downbeat')

    out = {
        'source': 'Groove MIDI Dataset v1.0.0, CC BY 4.0 '
                  '(magenta.tensorflow.org/datasets/groove)',
        'measured': {'takes': files, 'skipped': skipped,
                     'bars': sum(bars_of_style.values()), 'steps': STEPS},
        'note': 'Drums only. Every pitched part is still composed.',
        'styles': {},
    }
    for style in sorted(bars_of_style, key=lambda s: -bars_of_style[s]):
        n = bars_of_style[style]
        if n < MIN_BARS:
            continue
        bs = sorted(bpms[style])
        ent = {'bars': n, 'takes': len(bs),
               'bpm': [bs[0], bs[len(bs) // 2], bs[-1]],
               'voices': {}}
        # A STYLE IS NOT A DRUMMER. `dance` has 545 bars off 7
        # performances and `afrobeat` 976 off 13, so those figures are a
        # couple of players' habits rather than what the style does.
        # Flagged rather than dropped -- they are still real bars, and a
        # caller that knows the difference can use them.
        if len(bs) < 20:
            ent['thin'] = True
        for v in sorted(VOICES):
            masks = fig[style][v]
            empty = masks.get(0, [0])[0]
            picks = []
            for mask, (c, vmap) in sorted(masks.items(), key=lambda x: -x[1][0]):
                if mask == 0 or len(picks) >= TOP:
                    continue
                share = c / n
                if share < MIN_SHARE:
                    break
                # mean velocity at each step this figure actually hits,
                # 0..1 as the sequencer wants it. This is the half of a
                # groove that a step list cannot carry: a backbeat and a
                # ghost note are the same step at different velocities.
                vel = {}
                for s in range(STEPS):
                    if mask >> s & 1 and vmap.get(s):
                        vel[str(s)] = round(sum(vmap[s]) / len(vmap[s]) / 127, 2)
                picks.append({'g': grid(mask), 'p': round(share, 3), 'v': vel})
            if not picks:
                continue
            ent['voices'][v] = {'silent': round(empty / n, 3), 'figures': picks}
        out['styles'][style] = ent

    emit(out, OUT)
    print('\nwrote %s  (%d bytes, %d styles)'
          % (OUT, os.path.getsize(OUT), len(out['styles'])))
    for style, e in out['styles'].items():
        print('\n%s — %d takes, %d bars, %d-%dbpm (med %d)'
              % (style, e['takes'], e['bars'], e['bpm'][0], e['bpm'][2], e['bpm'][1]))
        for v in ('kick', 'snare', 'hat', 'ride'):
            if v not in e['voices']:
                continue
            d = e['voices'][v]
            print('  %-6s silent %2d%%  %s' % (v, round(100 * d['silent']),
                  '  '.join('%s %2d%%' % (f['g'], round(100 * f['p'])) for f in d['figures'][:4])))


main()
