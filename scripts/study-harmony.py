# Harmony norms measured from Bach's four-part chorales. Run with -I;
# scores are arguments and are only read.
#
# WHY. harmony() in this app reports three things — a pitch sounding a
# semitone above a chord tone, two voices a semitone apart, and a chord
# with no third in it — and all three rules were taken from theory
# websites. This file is the repo's standing rule applied to them: the
# norms are measured, not recalled. The 371 chorales are the canonical
# four-part harmony corpus, they are what the rules were abstracted
# from in the first place, and they are the right place to find out
# whether the abstraction survived.
#
# It also answers the thing no textbook states as a number: how much
# does real four-part writing HOLD across a chord change. That is the
# continuity a sampled piano gets for free from its decay, and the
# question harmony() asks about every ringing note.
#
# The kern parser is the one from study-counterpoint.py, unchanged,
# because the format and the corpus publisher are the same.
import sys, re, collections

PC = {'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}

def midi(tok):
    m = re.search(r'([a-gA-G]+)', tok)
    if not m: return None
    s = m.group(1); L = s[0]; base = PC[L.lower()]
    octv = 4+len(s)-1 if L.islower() else 3-(len(s)-1)
    return base + (octv+1)*12 + tok.count('#') - tok.count('-')

def dur(tok):
    m = re.match(r'(\d+)(\.*)', tok)
    if not m: return None
    d = int(m.group(1))
    if d == 0: return None
    q = 4.0/d
    if m.group(2): q = (4.0/d) * (2 - 0.5**len(m.group(2)))
    return q

def phrases_of(path):
    """Phrase lengths in quarter notes, split at fermatas (';')."""
    try: lines = [l.rstrip('\n') for l in open(path, encoding='utf-8', errors='replace')]
    except Exception: return []
    spines = None; q = 0.0; out = []
    for l in lines:
        if not l or l.startswith('!'): continue
        f = l.split('\t')
        if l.startswith('**'): spines = len(f); continue
        if l.startswith('*') or l.startswith('='): continue
        if spines is None or len(f) != spines: continue
        step = None
        for tok in f:
            if tok == '.' or tok == '': continue
            d = dur(tok)
            if d is not None: step = d if step is None else min(step, d)
        if step is None: continue
        q += step
        if ';' in l: out.append(q); q = 0.0
    return out


def grid_of(path):
    """[ [midi-or-None per voice] ] — one row per attack point."""
    try: lines = [l.rstrip('\n') for l in open(path, encoding='utf-8', errors='replace')]
    except Exception: return []
    spines = None; grid = []; cur = None
    for l in lines:
        if not l or l.startswith('!'): continue
        f = l.split('\t')
        if l.startswith('**'):
            spines = len(f); cur = [None]*spines; continue
        if l.startswith('*') or l.startswith('='): continue
        if spines is None or len(f) != spines: continue
        step = None
        for i, tok in enumerate(f):
            if tok == '.' or tok == '': continue
            d = dur(tok)
            if d is None: continue
            if 'r' in tok and not re.search(r'[a-gA-G]', tok): cur[i] = None
            else: cur[i] = midi(tok)
            step = d if step is None else min(step, d)
        if step is None: continue
        grid.append(list(cur))
    return grid

# FORM, measured from the same corpus and the same parse. Harmony is
# not the only thing nothing here checks: no analyser in this app looks
# at phrase structure either, and HOLLOWAY's eight phrases are all
# exactly four bars long. Bach marks phrase ends with fermatas, so the
# question costs nothing extra to ask while the files are open.
phrase_len = collections.Counter(); phrases_per = collections.Counter()

vert = collections.Counter(); vertN = 0
semitone_bare = 0          # two voices one semitone apart
semitone_comp = 0          # ... an octave or more apart: the minor 9th
maj7 = 0                   # for contrast: the one that is NOT harsh
third_present = 0; sonorities = 0
held_hist = collections.Counter(); changes = 0
diss_total = 0; diss_stepped = 0
role = collections.Counter()
files = 0

for path in sys.argv[1:]:
    ph = phrases_of(path)
    if len(ph) >= 2:
        phrases_per[len(ph)] += 1
        for x in ph: phrase_len[round(x/4.0, 2)] += 1

    grid = grid_of(path)
    if len(grid) < 8: continue
    files += 1
    nv = len(grid[0])

    for t, row in enumerate(grid):
        voices = [p for p in row if p is not None]
        if len(voices) < 2: continue
        sonorities += 1
        # does anything in this sonority state a third
        pcs = {p % 12 for p in voices}
        if any(((a - b) % 12) in (3, 4) for a in pcs for b in pcs if a != b):
            third_present += 1
        # every pair of sounding voices
        for i in range(len(voices)):
            for j in range(i+1, len(voices)):
                d = abs(voices[i] - voices[j])
                vert[d % 12] += 1; vertN += 1
                if d % 12 == 1:
                    if d == 1: semitone_bare += 1
                    else: semitone_comp += 1
                if d % 12 == 11: maj7 += 1

    # HOW MUCH IS HELD ACROSS A CHANGE. Counted over adjacent attack
    # points whose sonority actually differs, since a repeated chord
    # holds everything by definition and would flatter the number.
    for t in range(1, len(grid)):
        a, b = grid[t-1], grid[t]
        pa = {p % 12 for p in a if p is not None}
        pb = {p % 12 for p in b if p is not None}
        if not pa or not pb or pa == pb: continue
        changes += 1
        held = sum(1 for v in range(nv)
                   if a[v] is not None and b[v] is not None and a[v] == b[v])
        held_hist[held] += 1

    # DOES A DISSONANCE MOVE BY STEP, and WHICH voice moves.
    #
    # Asked of "any voice in a semitone relation" the answer came back
    # 50.01%, which is the shape of a number that has two populations
    # in it. In a semitone clash only the UPPER note is the dissonance;
    # the lower one is the chord tone being leaned on and has no reason
    # to go anywhere. Counting both together averages the voice that
    # must resolve with the voice that must not, and 50% is what that
    # looks like. So they are counted apart, along with whether the
    # upper note was already sounding in the previous chord, which is
    # what makes a suspension a suspension rather than an accident.
    for t in range(len(grid)-1):
        row, nxt, prv = grid[t], grid[t+1], (grid[t-1] if t else None)
        for v in range(nv):
            p = row[v]
            if p is None or nxt[v] is None: continue
            partners = [row[w] for w in range(nv)
                        if w != v and row[w] is not None and abs(p-row[w]) % 12 == 1]
            if not partners: continue
            upper = all(p > q for q in partners)
            lower = all(p < q for q in partners)
            stepped = abs(nxt[v] - p) in (1, 2)
            diss_total += 1
            if stepped: diss_stepped += 1
            if upper:
                role['upper'] += 1
                if stepped: role['upper_stepped'] += 1
                if prv is not None and prv[v] == p:
                    role['upper_held'] += 1
                    if stepped: role['upper_held_stepped'] += 1
                    # PREPARED means more than "was already sounding". A
                    # suspension is a note that was CONSONANT in the chord
                    # before and becomes a dissonance when the harmony
                    # moves under it. A chromatic that was already clashing
                    # and goes on clashing is not prepared, it is just
                    # hanging — which is exactly what HOLLOWAY's approach
                    # notes were doing.
                    was_clashing = any(w != v and prv[w] is not None
                                       and abs(p-prv[w]) % 12 == 1 for w in range(nv))
                    if not was_clashing:
                        role['upper_prepared'] += 1
                        if stepped: role['upper_prepared_stepped'] += 1
            elif lower:
                role['lower'] += 1
                if stepped: role['lower_stepped'] += 1

if not files:
    print('no scores read'); sys.exit(1)

pct = lambda n, d: (100.0*n/d) if d else 0.0
print('BACH FOUR-PART CHORALES — harmony norms')
print('  %d scores, %d sonorities, %d voice-pairs' % (files, sonorities, vertN))
print()
print('VERTICAL INTERVALS (interval class, %% of all sounding voice pairs)')
names = {0:'unison/octave',1:'semitone / minor 9th',2:'whole tone / major 9th',
         3:'minor 3rd',4:'major 3rd',5:'perfect 4th',6:'tritone',7:'perfect 5th',
         8:'minor 6th',9:'major 6th',10:'minor 7th',11:'major 7th'}
for ic in range(12):
    print('   %-24s %6.2f%%' % (names[ic], pct(vert[ic], vertN)))
print()
print('THE INTERVAL harmony() IS BUILT ON')
print('   a semitone apart, bare        %6.3f%%  (%d)' % (pct(semitone_bare, vertN), semitone_bare))
print('   a minor 9th or wider          %6.3f%%  (%d)' % (pct(semitone_comp, vertN), semitone_comp))
print('   both, as one class            %6.3f%%' % pct(semitone_bare+semitone_comp, vertN))
print('   a major 7th, for contrast     %6.3f%%  (%d)' % (pct(maj7, vertN), maj7))
print()
print('THE THIRD')
print('   sonorities stating a third    %6.2f%%' % pct(third_present, sonorities))
print()
print('WHAT IS HELD ACROSS A CHORD CHANGE  (%d changes, of 4 voices)' % changes)
tot = sum(held_hist.values())
for k in sorted(held_hist):
    print('   %d voice%s held %12s %6.2f%%' % (k, ' ' if k == 1 else 's', '', pct(held_hist[k], tot)))
mean = sum(k*v for k, v in held_hist.items())/tot if tot else 0
print('   mean voices held              %6.2f' % mean)
print('   at least one held             %6.2f%%' % pct(tot-held_hist[0], tot))
print()
print('FORM — PHRASE LENGTHS, from the fermatas that mark them')
_pt = sum(phrase_len.values())
if _pt:
    print('   phrases                       %d' % _pt)
    print('   per chorale, mean             %6.2f'
          % (sum(k*v for k, v in phrases_per.items())/sum(phrases_per.values())))
    print('   distinct lengths used         %d' % len(phrase_len))
    for k, v in phrase_len.most_common(6):
        print('      %5.2f bars                %6.1f%%' % (k, pct(v, _pt)))
    print('   the single commonest length   %6.1f%%  (so %.0f%% are NOT it)'
          % (pct(max(phrase_len.values()), _pt), 100-pct(max(phrase_len.values()), _pt)))
print()
print('DOES A DISSONANCE MOVE BY STEP')
print('   voices in a semitone relation %d' % diss_total)
print('   all of them, step next        %6.2f%%' % pct(diss_stepped, diss_total))
print('   -- the UPPER note, which is the dissonance --')
print('      occurrences                %d' % role['upper'])
print('      steps next                 %6.2f%%' % pct(role['upper_stepped'], role['upper']))
print('      was already sounding       %6.2f%%' % pct(role['upper_held'], role['upper']))
print('      ...and was CONSONANT then  %6.2f%%  (a prepared suspension)'
      % pct(role['upper_prepared'], role['upper']))
print('      ...was already clashing    %6.2f%%  (merely hanging)'
      % pct(role['upper_held']-role['upper_prepared'], role['upper']))
print('      arrived new on the clash   %6.2f%%' % pct(role['upper']-role['upper_held'], role['upper']))
print('   -- the LOWER note, which is the chord tone --')
print('      occurrences                %d' % role['lower'])
print('      steps next                 %6.2f%%' % pct(role['lower_stepped'], role['lower']))

# --- the norms file the app reads -------------------------------------
import json, os
if os.environ.get('HARMONY_NORMS_OUT'):
    json.dump({
        'corpus': 'J.S. Bach, 371 four-part chorales (kern, craigsapp/bach-371-chorales)',
        'scores': files, 'sonorities': sonorities, 'voice_pairs': vertN,
        'vertical_interval_class_pct': {names[i]: round(pct(vert[i], vertN), 3)
                                        for i in range(12)},
        'semitone_or_minor9_pct': round(pct(semitone_bare+semitone_comp, vertN), 3),
        'semitone_bare_pct': round(pct(semitone_bare, vertN), 3),
        'minor9_or_wider_pct': round(pct(semitone_comp, vertN), 3),
        'major7_pct': round(pct(maj7, vertN), 3),
        'sonorities_stating_a_third_pct': round(pct(third_present, sonorities), 2),
        'chord_changes': changes,
        'mean_voices_held_of_4': round(mean, 3),
        'at_least_one_voice_held_pct': round(pct(tot-held_hist[0], tot), 2),
        'voices_held_pct': {str(k): round(pct(held_hist[k], tot), 2) for k in sorted(held_hist)},
        'semitone_clash_upper_note': {
            'n': role['upper'],
            'steps_next_pct': round(pct(role['upper_stepped'], role['upper']), 2),
            'prepared_consonant_before_pct': round(pct(role['upper_prepared'], role['upper']), 2),
            'already_clashing_pct': round(pct(role['upper_held']-role['upper_prepared'], role['upper']), 2),
            'arrived_new_pct': round(pct(role['upper']-role['upper_held'], role['upper']), 2),
        },
        'phrases': _pt,
        'phrases_per_piece_mean': round(
            sum(k*v for k, v in phrases_per.items())/sum(phrases_per.values()), 2)
            if phrases_per else None,
        'distinct_phrase_lengths': len(phrase_len),
        'phrase_length_bars_pct': {str(k): round(pct(v, _pt), 2)
                                   for k, v in phrase_len.most_common(8)},
        'commonest_phrase_length_pct': round(pct(max(phrase_len.values()), _pt), 2)
            if phrase_len else None,
        'semitone_clash_lower_note': {
            'n': role['lower'],
            'steps_next_pct': round(pct(role['lower_stepped'], role['lower']), 2),
        },
    }, open(os.environ['HARMONY_NORMS_OUT'], 'w'), indent=1)
    print('\nwrote ' + os.environ['HARMONY_NORMS_OUT'])
