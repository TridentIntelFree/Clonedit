# Timing and velocity norms from the Groove MIDI Dataset (CC BY 4.0).
# Run with -I; the corpus path comes in as an argument and is only ever read.
#
# WHY. Every track bounced in this repo sits exactly on the sixteenth
# grid — TENEMENT measured 100% — because swing, human and humanDrift
# have never been set to anything but zero. There was no number to set
# them to. This produces one, the same way the counterpoint and melody
# norms were produced: by measuring a corpus rather than recalling a
# rule of thumb.
#
# The corpus is 1,150 performances by ten drummers on a Roland TD-11,
# each played to a metronome at a stated tempo, so the deviation of a
# hit from its grid line IS the micro-timing — there is nothing else it
# could be. Magenta's GrooVAE paper reports that on-beat notes tend to
# land late and off-beat notes early; this checks that against the data
# rather than taking it on trust, and splits it by metrical position
# and by genre, which the headline claim does not.
#
# Offsets are signed: POSITIVE IS LATE. They are reported both as a
# fraction of a sixteenth (tempo-independent, which is what a sequencer
# needs) and in milliseconds (what a listener experiences, and the two
# diverge wildly across a corpus spanning 50-200bpm).

import sys, os, csv, json, collections, statistics as st
import mido

CORPUS = sys.argv[1]
INFO = os.path.join(CORPUS, 'info.csv')

def classify(tick, tpb):
    """Where in the beat this lands, on a 4/4 sixteenth grid."""
    sixteenth = tpb / 4.0
    nearest = round(tick / sixteenth)
    off = (tick - nearest * sixteenth) / sixteenth      # fraction of a 16th, signed
    slot = int(nearest) % 4                             # 0=beat 1=e 2=and 3=a
    return slot, off

def main():
    rows = list(csv.DictReader(open(INFO, encoding='utf-8')))
    # slot -> list of signed offsets (fraction of a sixteenth)
    byslot = collections.defaultdict(list)
    byslot_ms = collections.defaultdict(list)
    vel = collections.defaultdict(list)
    bygenre = collections.defaultdict(lambda: collections.defaultdict(list))
    # THE SAME OFFSETS WITH EACH PERFORMANCE'S OWN MEAN REMOVED.
    # The first run of this reported every position early by about the
    # same amount — -9.3ms on the beat and -9.3ms on the "and" — which
    # is not a micro-timing pattern, it is a constant: a drummer sitting
    # ahead of the click for a whole take, or latency in the capture.
    # Absolute offsets cannot test a claim about the SHAPE of the
    # timing, because the constant swamps it and its sign is an
    # artefact of the recording. De-meaning each performance against
    # itself leaves only how the positions differ FROM EACH OTHER,
    # which is the thing GrooVAE actually describes.
    rel = collections.defaultdict(list)
    relgenre = collections.defaultdict(lambda: collections.defaultdict(list))
    files = skipped = hits = 0
    exact = 0

    for r in rows:
        if r.get('time_signature') != '4-4':
            skipped += 1; continue
        path = os.path.join(CORPUS, r['midi_filename'])
        if not os.path.exists(path):
            skipped += 1; continue
        try:
            bpm = float(r['bpm'])
            mf = mido.MidiFile(path)
        except Exception:
            skipped += 1; continue
        tpb = mf.ticks_per_beat
        if not tpb:
            skipped += 1; continue
        ms_per_sixteenth = (60000.0 / bpm) / 4.0
        genre = (r.get('style') or '').split('/')[0] or 'unknown'
        files += 1
        t = 0
        here = []                      # (slot, off) for this performance only
        for msg in mf.tracks[0]:
            t += msg.time
            if msg.type != 'note_on' or msg.velocity == 0:
                continue
            slot, off = classify(t, tpb)
            # a hit more than half a sixteenth out has been assigned to
            # the wrong grid line; it is not micro-timing, it is a
            # different note, so it is not evidence either way
            if abs(off) >= 0.5:
                continue
            hits += 1
            if off == 0:
                exact += 1
            byslot[slot].append(off)
            byslot_ms[slot].append(off * ms_per_sixteenth)
            vel[slot].append(msg.velocity)
            bygenre[genre][slot].append(off)
            here.append((slot, off))
        if len(here) >= 16:
            dc = st.mean(o for _, o in here)
            for slot, off in here:
                rel[slot].append(off - dc)
                relgenre[genre][slot].append(off - dc)

    NAMES = {0: 'beat (1/4)', 1: 'e (1/16)', 2: 'and (1/8)', 3: 'a (1/16)'}
    print(f"Groove MIDI: {files} performances in 4/4, {hits} hits, "
          f"{skipped} files skipped")
    # NOT comparable to pulse()'s "sixteenth 100%". This is exact
    # equality; pulse() counts an onset as on-grid within a tolerance of
    # max(12ms, a sixteenth * 0.30) — 53.6ms at 84bpm. The median offset
    # in this very corpus is 0.075 of a sixteenth, 13.4ms at that tempo,
    # so a human drummer also scores ~100% there. pulse() measures
    # whether a listener finds the grid, not whether the timing is human.
    print(f"exactly on the grid: {100.0*exact/max(1,hits):.2f}%")
    print("  (exact equality — not the same question pulse() asks, which "
          "allows ~54ms at 84bpm\n   and would score this corpus near 100% too)\n")

    print(f"{'position':<13}{'n':>7}{'median':>9}{'mean':>8}{'ms':>8}"
          f"{'|late':>7}{'vel':>6}")
    norms = {}
    for slot in (0, 1, 2, 3):
        v = byslot[slot]
        if not v:
            continue
        late = 100.0 * sum(1 for x in v if x > 0) / len(v)
        norms[NAMES[slot]] = {
            'n': len(v),
            'median_frac16': round(st.median(v), 4),
            'mean_frac16': round(st.mean(v), 4),
            'mean_ms': round(st.mean(byslot_ms[slot]), 2),
            'pct_late': round(late, 1),
            'mean_velocity': round(st.mean(vel[slot]), 1),
        }
        print(f"{NAMES[slot]:<13}{len(v):>7}{st.median(v):>9.4f}"
              f"{st.mean(v):>8.4f}{st.mean(byslot_ms[slot]):>8.1f}"
              f"{late:>6.0f}%{st.mean(vel[slot]):>6.0f}")

    print("\n  positive = late. frac16 is a fraction of a sixteenth note.")

    # EACH PERFORMANCE AGAINST ITS OWN MEAN, which is the only way the
    # shape of the timing is visible at all.
    print(f"\n{'position':<13}{'n':>7}{'rel.median':>12}{'rel.mean':>10}")
    relnorms = {}
    for slot in (0, 1, 2, 3):
        v = rel[slot]
        if not v:
            continue
        relnorms[NAMES[slot]] = {'median_frac16': round(st.median(v), 4),
                                 'mean_frac16': round(st.mean(v), 4)}
        print(f"{NAMES[slot]:<13}{len(v):>7}{st.median(v):>12.4f}{st.mean(v):>10.4f}")

    # The claim under test, stated so it can fail.
    on = rel[0]
    offb = rel[1] + rel[2] + rel[3]
    if on and offb:
        d = st.mean(on) - st.mean(offb)
        verdict = ("HOLDS" if st.mean(on) > st.mean(offb) else "DOES NOT HOLD")
        print(f"\nGrooVAE's claim (on-beat late, off-beat early), measured "
              f"relative: {verdict}")
        print(f"  on-beat {st.mean(on):+.4f} vs off-beat {st.mean(offb):+.4f}"
              f"  (difference {d:+.4f} of a sixteenth)")
        gross = st.mean(byslot[0]) - st.mean(byslot[1] + byslot[2] + byslot[3])
        print(f"  (before de-meaning it read {gross:+.4f}, which is the "
              f"constant, not the pattern)")

    # SWING, measured directly, because it is immune to any constant
    # offset: how far the off-eighth sits between the beats. 0.5 is
    # straight, 0.667 is triplet swing. Taken per performance.
    print(f"\n{'genre':<14}{'swing':>8}   (0.500 straight, 0.667 triplet)")
    swing = {}
    for g in sorted(relgenre, key=lambda k: -sum(len(x) for x in relgenre[k].values())):
        b, a = relgenre[g][0], relgenre[g][2]
        if len(b) < 300 or len(a) < 300:
            continue
        # position of the "and" as a fraction of the beat: nominal 0.5
        # plus however late it sits, in sixteenths (two per eighth)
        s = 0.5 + (st.mean(a) - st.mean(b)) / 4.0
        swing[g] = round(s, 4)
        print(f"{g:<14}{s:>8.4f}")

    print(f"\n{'genre':<14}{'files':>6}{'beat':>9}{'e':>9}{'and':>9}{'a':>9}")
    gnorms = {}
    for g in sorted(bygenre, key=lambda k: -sum(len(x) for x in bygenre[k].values())):
        slots = bygenre[g]
        n = sum(len(x) for x in slots.values())
        if n < 500:
            continue
        cells = []
        gnorms[g] = {}
        for slot in (0, 1, 2, 3):
            if slots[slot]:
                m = st.mean(slots[slot])
                gnorms[g][NAMES[slot]] = round(m, 4)
                cells.append(f"{m:>+9.4f}")
            else:
                cells.append(f"{'-':>9}")
        print(f"{g:<14}{n:>6}" + "".join(cells))

    out = {'source': 'Groove MIDI Dataset v1.0.0 (CC BY 4.0), 4/4 subset',
           'files': files, 'hits': hits,
           'pct_exactly_on_grid': round(100.0*exact/max(1,hits), 2),
           'note': 'offset is signed, positive = late, as a fraction of a sixteenth. '
                   'by_position is absolute and carries each take\'s constant lead/lag; '
                   'relative_to_own_mean removes it and is the one to use for feel.',
           'by_position': norms, 'by_genre': gnorms,
           'relative_to_own_mean': relnorms, 'swing_by_genre': swing}
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', 'samples', 'groove-norms.json')
    with open(os.path.normpath(dest), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
    print("\nwrote", os.path.normpath(dest))

main()
