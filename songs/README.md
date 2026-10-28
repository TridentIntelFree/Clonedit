# songs

Each file here renders one finished track, start to finish, with no
manual steps: it builds the instruments, writes the parts, checks the
mix with the app's own tools, picks a master setting by measurement and
writes the WAV.

    npm run build          # the browser tests serve the promoted index.html
    node songs/<name>.mjs

They are committed because the bounces are not. The repo ships no audio
(see .gitignore), the container these were made in is temporary, and a
WAV is a dead end — the script is the thing that can be changed, re-run
and learned from.

| file | what it is |
|---|---|
| `anneal.mjs` | D dorian, 132bpm. Struck metal and wood with an audible pulse. Written against two measurements rather than a mood — see below. |
| `three-bodies.mjs` | contrapuntal, C dorian, 140bpm. Three voices on 3/5/8-step cycles so they rarely move together, meeting at the bar line. Synthesised palette, long overlapping tails. |
| `subsidence.mjs` | dark and heavy, 168bpm. Field recordings for percussion, a three-layer bass — sine sub for weight, octave for the note, Reese and FM growl for dirt. |
| `salvage.mjs` | 150bpm, every percussion sound a field recording: a door knock is the kick, breaking glass the snare, a dripping tap the hi-hat. |
| `weathering.mjs` | A aeolian, 88bpm. Almost nothing in it is an instrument — written after a sampled glockenspiel turned out to hold only G, C and Ab. |
| `slow-glass.mjs` | A aeolian, 88bpm. One decision per lesson from the session that preceded it, nothing carried over from the track before. |
| `crosscurrent.mjs` | A aeolian, 92bpm. The first use of `poly()` — real 3:4:5 cross-rhythm inside one bar, after six tracks on a single grid at a single tempo. |
| `tenement.mjs` | 96bpm, every sound a real recording of something that is not an instrument: a door knock, keys, a train, a fire, glass, a hinge. It is also where `motif()`, `counterpoint()` and `balance()` were found to go silent on a track built with `sound()`, because they filter on the `inst` tag only `instrument()` sets. |
| `meridian.mjs` | ambient with a pulse, 84bpm, 2:17. Eight versions. It scored -16.2 LUFS with every pad owning its own band and came back as "drone machine noise" — its bass held one pitch throughout and five of six sounds never changed note. The track that proved nothing here measures whether the harmony moves. |
| `ridgeway.mjs` | D minor, 96bpm, 1:10. The first track whose notes were not written by hand: the melody comes from magenta's `chord_pitches_improv` over a stated progression. |
| `kitwork.mjs` | a drum solo, 104bpm, 37s. Recorded kit only (`nakeddrums`), with velocity layers and round robins, after a version built on a synthesised "real" pack was identified as fake on hearing. Swapping the kit took the pulse autocorrelation from 0.53 to 0.65 and the crest from 14.4 to 18.3. |
| `holloway.mjs` | A minor, 92bpm, piano trio. Written as a test of the documentation rather than of the app: build a track using only what AGENTS.md and `howto()` tell a fresh agent, and record every place that proved insufficient — see below. |

Each one ends by asking the app what is wrong before it bounces —
`critique()`, `translate()`, `counterpoint()`, `loudness()` — and those
answers are printed as it runs. Reading that output is most of the point.

## what `anneal.mjs` was written against

`three-bodies.mjs` came back as "the timing comes off as random sound and
the sounds aren't very hifi". Both halves turned out to be measurable,
and both first explanations were wrong.

**The timing.** The obvious reading was that nothing in it repeated —
every pitch, rest and length in that file does come from a random number
generator. `motif()` was built to confirm it and refuted it instead: the
piece restates its figures *above* the norm for its length. `pulse()`
found the real fault. 98% of its onsets sit on the sixteenth grid, but
weighted by how loud each onset actually is, only 46% land on a beat. A
rimshot at weight 42 and a conga at 21.8, both scattered with random
nudges, outweighed the kick's 17.3 — and the kick was the only thing
holding the pulse, at 77% on the beat. The beat was in the arrangement
and buried under everything audible. So the check worth having is the
gap between the on-beat share counted per event and the same share
weighted by loudness; if weighting lowers it, the quiet things are
marking the metre and the loud things are ignoring it.

**The sounds.** Against the best-received mix here, that track's 8kHz
band sat 17.3dB lower and its 4kHz band 9.8dB lower — a palette of
synthesis through resonant bandpasses and bitcrushing has no top octave
to lose. Real struck metal was the obvious answer and was half wrong.
Measured one instrument at a time, a vibraphone struck with soft mallets
is the dullest thing in the library at 80dB down above 8kHz, and the
hand chimes and glass are not much better. Big resonant bars put their
energy where their pitch is. What is actually bright is the small thin
metal — triangle 1.8dB down, cabasa 1.5, shaker 1.6, bell tree 5.4 — and
the two glockenspiels, which are pitched *and* bright at 19 and 21dB
down. The air in `anneal.mjs` comes from those; the mallets underneath
are allowed to be warm.
| `alberto.mjs` | 150bpm, 1:30, drums only. The first break here written as a CHOP rather than as a pattern: one bar of source material, sixteen slices, eight orders over them, plus stutter / pitch / drop. Every bar re-uses the same slices and no two bars are the same. Written toward an Aphex Twin-shaped track; the melodic half is not in it yet. |
