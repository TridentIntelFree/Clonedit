#!/usr/bin/env python3.13
"""HOW LONG IS A PHRASE — and two ways of asking that do not work.

READ THIS BEFORE EXTENDING IT. Three methods were tried against the
3,194 scores music21 ships offline. One is sound and two are not, and
the two failures are more useful than the success because each looked
like a result:

  1. PHRASE ENDS FROM RESTS. Gave Beethoven a commonest phrase length
     of HALF A BAR at 32.9% and Handel one bar at 60%. A one-beat
     threshold catches every small gap, and in polyphony one voice
     rests constantly while the others carry the music. Dropped.

  2. REPEATING UNITS, by the same bar-signature algorithm that
     midi-structure.mjs runs on a MIDI file. Gave 1-bar units at 88%
     across every corpus — Josquin 94%, Monteverdi 96%, trecento 100%.
     Excluding runs of empty bars moved it to 84.6%, which is the
     shape of a fix that is not the fix. The real cause is the
     signature: a set of pitch CLASSES plus onsets on a 16th grid is
     too coarse for homophonic vocal writing, where every voice moves
     on the same beats and two adjacent bars in one key routinely
     share both. The same signature works on the MIDI it was built for
     because that material is rhythmically varied. Dropped here;
     still correct there.

  3. PHRASE ENDS FROM FERMATAS. Sound, because it is notation rather
     than inference — the composer wrote the phrase end down. It only
     applies where composers did that, which in this corpus means the
     chorales.

So this script now measures one thing properly instead of three things
badly. A number that is wrong is worse than a number that is missing,
because someone will write music to it.

HOW LONG IS A PHRASE, MEASURED RATHER THAN ASSUMED.

AGENTS.md records the gap and one data point for it: Bach's chorales
run 2411 phrases over 58 distinct lengths, the commonest accounting for
39.7%, against HOLLOWAY's eight phrases of one length at 100%. That
single comparison has been carrying the whole argument, and it is one
composer in one genre writing to hymn texts with uneven lines — so some
of his variety is the text's and not a free choice.

midi-structure.mjs now measures form and has nothing to report against
but those two anecdotes. This measures the question properly, across
every corpus music21 ships offline: Renaissance polyphony, Baroque
chorales, Irish and continental folk tune collections, Monteverdi
madrigals, and what Classical there is. If four-bar-square turns out to
be a norm somewhere and a modern convention everywhere else, that is
worth knowing before writing another piece to it.

RUN IT WITH python3.13, NOT python3. In this container pip installs for
3.13 while `python3` resolves to a 3.11 at /usr/local/bin, so music21
is invisible to the interpreter you would reach for by reflex.

    /usr/bin/python3.13 scripts/study-form.py [--per 200]

Writes samples/form-norms.json.
"""
import sys, json, argparse, collections, os, warnings
warnings.filterwarnings('ignore')

try:
    from music21 import corpus, stream, note, expressions, meter
except ImportError:
    sys.exit('music21 is not importable by this interpreter. Use '
             '/usr/bin/python3.13 — pip installs for 3.13 here while '
             'python3 is a 3.11 that cannot see it.')

ap = argparse.ArgumentParser()
ap.add_argument('--per', type=int, default=200,
                help='max scores per collection (runtime; say so in the output)')
ap.add_argument('--out', default='samples/form-norms.json')
A = ap.parse_args()


def phrases_by_fermata(flat, bar_len):
    """Where the composer wrote the phrase ends down.

    Only chorales really do this, and it is the most trustworthy signal
    there is because it is notation rather than inference.

    Takes an ALREADY FLATTENED stream. The first version called
    el.getOffsetInHierarchy(sc) once per note, which walks the
    containment tree on every call — eight scores per collection did
    not finish in three minutes, while parsing all of them took under a
    second. The cost was never the corpus, it was asking each note
    where it was."""
    marks = []
    for el in flat.getElementsByClass(note.Note):
        if any(isinstance(e, expressions.Fermata) for e in el.expressions):
            marks.append(float(el.offset) + float(el.quarterLength))
    if len(marks) < 2:
        return None
    marks = sorted(set(round(m, 3) for m in marks))
    out, prev = [], 0.0
    for m in marks:
        if m - prev > 0.1:
            out.append((m - prev) / bar_len)
        prev = m
    return out


"""REST-BASED PHRASE DETECTION WAS DROPPED, and the evidence is worth
keeping. Inferring phrase ends from where the top voice rests gave
Beethoven a commonest phrase length of HALF A BAR at 32.9% and Handel
one bar at 60% — not phrases, just a one-beat threshold catching every
small gap, in textures where one voice rests constantly while the
others carry the music. Shipping that as a norm would have been worse
than shipping nothing, because someone would have written to it.

The same mistake midi-structure.mjs made with silence, in a corpus
instead of a track. Phrase ends are only reliably readable where the
composer wrote them down, which in practice means fermatas in
chorales.

So what is measured across everything instead is the REPEATING UNIT:
how many bars go by before the material comes back. It needs no phrase
detection, it works on any texture, and it is the same measure
midi-structure.mjs computes on a MIDI file — which makes the
comparison apples-to-apples, where the phrase comparison never was."""


def bar_signature(flat, bar_len, n_bars):
    """One string per bar: its pitch classes and where its onsets fall.
    The same signature midi-structure.mjs builds, so the two measures
    can be read against each other."""
    bars = [[] for _ in range(n_bars)]
    for el in flat.notes:
        off = float(el.offset)
        b = int(off // bar_len)
        if 0 <= b < n_bars:
            pos = round((off - b * bar_len) / bar_len * 16)
            for pch in (el.pitches if hasattr(el, 'pitches') else [el.pitch]):
                bars[b].append((pch.pitchClass, pos))
    out = []
    for b in bars:
        if not b:
            out.append('.')
            continue
        pcs = sorted(set(x[0] for x in b))
        hits = sorted(set(x[1] for x in b))
        out.append(','.join(map(str, pcs)) + '|' + ','.join(map(str, hits)))
    return out


def repeat_units(sigs, max_period=16):
    """Walk the bar sequence; at each position take the shortest period
    whose block repeats at least twice, and extend while it keeps
    repeating. Identical to the pass in midi-structure.mjs."""
    units, i, n = [], 0, len(sigs)
    while i < n:
        found = None
        for p in range(1, min(max_period, (n - i) // 2) + 1):
            if sigs[i:i + p] != sigs[i + p:i + 2 * p]:
                continue
            reps = 2
            while sigs[i + reps * p:i + (reps + 1) * p] == sigs[i:i + p]:
                reps += 1
            found = (p, reps)
            break
        if found:
            p_, reps = found
            block = sigs[i:i + p_]
            # AN EMPTY BAR REPEATING IS NOT REPETITION. Without this,
            # Josquin came back 94.3% one-bar units, Monteverdi 96% and
            # trecento 100% — Renaissance textures where every voice
            # rests often enough that the flattened score has long runs
            # of silent bars, each "repeating" the last. The detector
            # was measuring rests and calling them form, which is the
            # third time in this session a checker has locked onto
            # silence and reported it as structure.
            if any(x != '.' for x in block):
                units.append(found)
            i += p_ * reps
        else:
            i += 1
    return units


def bar_length(sc):
    try:
        ts = sc.recurse().getElementsByClass(meter.TimeSignature)
        if len(ts):
            return ts[0].barDuration.quarterLength
    except Exception:
        pass
    return 4.0


def rounded(x):
    """A phrase is a musical length, not a float. 3.98 and 4.02 bars are
    the same decision, and keeping the decimals would report every piece
    as having as many distinct lengths as it has phrases."""
    return round(x * 2) / 2


paths = corpus.getCorePaths()
by_coll = collections.defaultdict(list)
for p in paths:
    s = str(p)
    if '/corpus/' not in s:
        continue
    by_coll[s.split('/corpus/')[1].split('/')[0]].append(p)

print(f'{len(paths)} scores offline across {len(by_coll)} collections; '
      f'reading up to {A.per} of each\n', flush=True)

result, grand = {}, []
units_grand, grand_units = [], {}
for coll in sorted(by_coll, key=lambda c: -len(by_coll[c])):
    files = by_coll[coll][:A.per]
    lens_f, lens_r, ok, bad = [], [], 0, 0
    units_all, units_w, bars_total = [], {}, 0
    for f in files:
        try:
            sc = corpus.parse(f)
        except Exception:
            bad += 1
            continue
        try:
            bl = bar_length(sc) or 4.0
            flat = sc.flatten()
            pf = phrases_by_fermata(flat, bl)
            if pf:
                lens_f += [rounded(x) for x in pf if 0.4 < x < 64]
            notes_ = flat.notes
            if len(notes_):
                last = max(float(e.offset) + float(e.quarterLength) for e in notes_)
                nb = max(1, int(last // bl) + 1)
                if 4 <= nb <= 600:
                    for p, reps in repeat_units(bar_signature(flat, bl, nb)):
                        units_all.append(p)
                        units_w[p] = units_w.get(p, 0) + reps
                    bars_total += nb
            ok += 1
        except Exception:
            bad += 1
    if not units_all:
        print(f'  {coll:<16} nothing repeats, or too few readable scores', flush=True)
        continue
    uw = sum(units_w.values())
    cu = collections.Counter(units_all)
    topu, topun = max(units_w.items(), key=lambda kv: kv[1])
    entry = {
        'scores_read': ok, 'unreadable': bad, 'bars': bars_total,
        'repeat_units': len(units_all), 'unit_repeats': uw,
        'distinct_unit_lengths': len(cu),
        'commonest_unit_bars': topu,
        'commonest_unit_pct': round(100 * topun / uw, 1),
        'unit_four_or_eight_pct': round(100 * sum(v for k, v in units_w.items() if k in (4, 8)) / uw, 1),
        'unit_top': [[k, round(100 * v / uw, 1)]
                     for k, v in sorted(units_w.items(), key=lambda kv: -kv[1])[:8]],
    }
    if len(lens_f) >= 50:
        c = collections.Counter(lens_f)
        top, topn = c.most_common(1)[0]
        entry['phrase_method'] = 'fermata'
        entry['phrases'] = len(lens_f)
        entry['phrase_distinct_lengths'] = len(c)
        entry['phrase_commonest_bars'] = top
        entry['phrase_commonest_pct'] = round(100 * topn / len(lens_f), 1)
        entry['phrase_top'] = [[k, round(100 * v / len(lens_f), 1)] for k, v in c.most_common(8)]
        grand += lens_f
    result[coll] = entry
    units_grand.extend([k] * v for k, v in units_w.items())
    for k, v in units_w.items():
        grand_units[k] = grand_units.get(k, 0) + v
    ph = (f'  phrases {entry["phrases"]} via fermata, commonest '
          f'{entry["phrase_commonest_bars"]}bar {entry["phrase_commonest_pct"]}%'
          if 'phrases' in entry else '')
    print(f'  {coll:<16} unit {entry["commonest_unit_bars"]}bar '
          f'{entry["commonest_unit_pct"]:>5}%  4-or-8 {entry["unit_four_or_eight_pct"]:>5}%  '
          f'{entry["distinct_unit_lengths"]:>2} lengths  ({ok} scores){ph}', flush=True)

if grand_units:
    gw = sum(grand_units.values())
    topu, topun = max(grand_units.items(), key=lambda kv: kv[1])
    result['_units_all'] = {
        'unit_repeats': gw, 'distinct_lengths': len(grand_units),
        'commonest_bars': topu, 'commonest_pct': round(100 * topun / gw, 1),
        'four_or_eight_pct': round(100 * sum(v for k, v in grand_units.items() if k in (4, 8)) / gw, 1),
        'top': [[k, round(100 * v / gw, 1)]
                for k, v in sorted(grand_units.items(), key=lambda kv: -kv[1])[:10]],
    }
    u = result['_units_all']
    print(f'\n  REPEATING UNITS, ALL CORPORA: {u["unit_repeats"]} repeats, '
          f'{u["distinct_lengths"]} distinct lengths')
    print('    ' + '  '.join(f'{k}bar {v}%' for k, v in u['top'][:8]))
    print(f'    4-bar and 8-bar units together: {u["four_or_eight_pct"]}%')

if grand:
    c = collections.Counter(grand)
    top, topn = c.most_common(1)[0]
    result['_all'] = {
        'phrases': len(grand), 'distinct_lengths': len(c),
        'commonest_bars': top, 'commonest_pct': round(100 * topn / len(grand), 1),
        'four_or_eight_pct': round(100 * sum(v for k, v in c.items() if k in (4, 8)) / len(grand), 1),
        'top': [[k, round(100 * v / len(grand), 1)] for k, v in c.most_common(10)],
    }
    a = result['_all']
    print(f'\n  FERMATA PHRASES, where they exist: {a["phrases"]} phrases, '
          f'{a["distinct_lengths"]} distinct lengths, commonest '
          f'{a["commonest_bars"]}bar {a["commonest_pct"]}%')

result['_note'] = (
    'Two measures, and only one of them is comparable across genres. '
    'REPEAT UNITS: how many bars pass before the material comes back, found '
    'by the same algorithm midi-structure.mjs runs on a MIDI file, so the two '
    'can be read against each other. Needs no phrase detection and works on '
    'any texture. PHRASES: only where the composer wrote the ends down, which '
    'in practice means fermatas in chorales. '
    'Rest-based phrase inference was tried and DROPPED: it gave Beethoven a '
    'commonest phrase of half a bar at 32.9% and Handel one bar at 60%, '
    'because a one-beat threshold catches every small gap and in polyphony '
    'one voice rests while the others carry on. Shipping that as a norm would '
    'have been worse than shipping nothing. Read the Bach figures with the '
    'caveat AGENTS.md already gives: some of the variety in a texted genre '
    'belongs to the text rather than to a free choice.')
result['_scores_per_collection_cap'] = A.per

os.makedirs(os.path.dirname(A.out) or '.', exist_ok=True)
with open(A.out, 'w') as fh:
    json.dump(result, fh, indent=1, sort_keys=True)
print(f'\nwrote {A.out}')
