# Making music with this app, if you are an agent

Start with two calls: `howto()` and `review()`. Everything below is what
they return, in prose, and why.

    jbh_howto     the order to work in, and the traps
    jbh_review    every check at once, before a bounce

Both are in the MCP server (`mcp/server.mjs`) and on `window.JBH`.

## Why this file exists

The app has seventeen analysers. A finished track was bounced here using
six of them, and the three that would have caught what the listener
complained about — `loudness`, `translate`, `spectrum` — were among the
eleven that were not run. The listener's verdict was "the bass isn't
clear, the bells are louder than you expect". `loudness()` had those
bells at +14 to +22 dB above their own energy. `translate()` had the
bass problem and named its fix in one sentence.

Nothing was missing from the app. What was missing was any guarantee
that the checks get run. Choosing them by hand is where results stop
being repeatable, which is why `review()` runs all of them and reports
which ones it could not reach — a check that silently did not run reads
exactly like a check that passed.

## The order

0. Read `samples/atlas-*.json` for the pack you are about to use, or
   generate it. Choosing a sound and discovering afterwards that it
   cannot do the job is the most expensive mistake available here.
   The atlas groups by the manifest's `cat`, so it is useless on a pack
   whose samples all declare the same one — every found sound in
   `foundkit` and `darkkit` says `DRUMS`, and the atlas reports a
   single row for the lot. Measure those per file, and read *A field
   recording does not start when the file does* before writing on them.
1. **Then one sound at a time.** Not a palette, one sound. Decide what
   the song needs next — it needs a bass, it needs something high — and
   make that, and finish it, before you start the next thing. For each:

   a. pick the source by its measured numbers in the atlas, not its
      name. The thing called `vibh` is the dullest instrument in VCSL.

   b. tweak it until it *is* the sound the song needs, rather than a
      sample that will do. `pad()` sets gain and envelope; `chop()`,
      `tape()`, `freeze()`, `mutate()`, `paint()` and `resynth()` change
      what it actually is. A sample is a starting point.

   c. write its part — `note()` for pitched lines, `step()` for the
      rest.

   d. `place(pad)`. What band does it own, what is covering it, what is
      it covering. Fix it now, while it is the only thing you are
      thinking about and nothing else has been built on top of it.

   e. `review({quick:true})` every few sounds, since it is free.

2. Only once every sound is in, and each already fits: `reference(url)`
   with a finished mix you want to sound like. **Before** judging tone —
   without it, tonal balance is not checked at all and `critique()`
   says so.
3. `review({src:'song'})`. Fix what it names, in the order it names them.
   Run it again. This should mostly confirm. If it finds a sound with
   nowhere to sit, that sound was placed badly and you skipped 1d.
4. `render({loudness:true})` across a few `mTrim` values, choose by
   measurement, then bounce. Make sure the ladder BRACKETS your target:
   a denser arrangement is far hotter than a sparse one, and a ladder
   whose quietest rung is already too loud fails every gate and writes
   no file.

## Check while you build, not after

Everything in this file was being run once, at the end, on a finished
arrangement. That is the wrong time to learn that two parts shadow each
other or that the beat cannot be found, because by then the piece is
written and the finding costs a rewrite rather than an edit.

The reason it happened is that `review()` renders audio and so costs
minutes. But **four of the checks render nothing at all** — they read
the schedule, which the app already knows exactly:

| free | what it answers |
|---|---|
| `pulse()` | is there a beat a listener can find |
| `motif()` | does anything in this line ever come back |
| `melody()` | is this a tune or a scale with a rhythm |
| `counterpoint()` | are these two voices actually one voice |

That is most of what matters while writing, and it is instant.
`review({quick:true})` runs exactly those and nothing else, so it can
be called after every pattern. The expensive half — per-pad levels,
perceived loudness, tonal balance against a reference, what survives a
phone — belongs at the end, where it was always going to live.

A song script should look like: write a pattern, `review({quick:true})`,
write the next one. Not: write everything, then look.

## One sound at a time, not a palette

The order above was rewritten because the way this repo had been
working was backwards, and the evidence is a function.

The old method: load twenty instruments, write every part, then set all
the levels. By that point there are nine bands and seven groups
interacting, nothing can be adjusted without disturbing something else,
and five rounds of setting levels by ear each fixed one part of the
spectrum and broke another. `balance()` was written to solve that
system as linear algebra, and it works — nine bands inside 1.7 dB in
one pass. But it is a solver for a problem that did not have to exist.
Every sound was placed blind and the relationships between them were
left to be negotiated at the end.

The method that does not create it: the song needs a bass, so make the
bass — take a source, tweak it until it is the bass this song wants,
check it against what is already there, and only then ask what the song
needs next. Each sound is finished in context. The relationships come
out right because each one was made against the others, not alongside
them.

`place(pad)` is the check that makes this affordable. Two renders — the
pad alone, and everything else — then a band-by-band comparison:

```
await JBH.place(bassPad)
→ { owns:'60-120', ownsBy:9.4, weakest:'4000-8000',
    says:'it sits in 60-120Hz, where it is +9.4dB above everything
          else. That is its place.' }
```

`ownsBy` is the number to read. Positive and the sound has somewhere to
live. Negative by more than about 6 dB and it owns nothing anywhere,
which is **not** a level problem: turning it up makes the whole mix
louder without making room for it. Either move it where the others are
not, or thin what is in its way. That distinction — absent versus
quiet — is invisible to every meter in this file and it is the one that
costs rewrites.

Two renders is the point. `critique()` does one render per pad and is
why a review takes a quarter of an hour; `place()` costs the same
whether the song has three sounds in it or thirty, so it can be run on
every sound as it goes in without ever being the slow part.

## There is no correct loudness

Every track bounced in this repo was aimed at about −11.5 LUFS, as
though that were the answer. It is not. Measured across 112 tracks of
one widely-admired electronic catalogue, the median is −14.5 dB with
the middle half spanning −21.2 to −8.7 — a sixteen-decibel spread, with
ambient records near −23 and dense ones near −7.6. The loudness is a
decision about the music, not a target to hit.

Pick it from what the piece is. A slow, spacious track mastered to the
same level as a dense one has had its dynamics spent on nothing, and
`dynamics()` and the crest figure will both say so.

## A reference does not have to be audio

`scripts/reference-profile.mjs <file>` measures any local audio file and
writes a profile: nine relative band levels, LUFS, crest. `reference()`
accepts that object directly, so `compare()` and `balance()` can target
a mix without the audio ever being in the repository or reachable over
the network. Measure once, keep the numbers.

This matters because the alternative is circular. Matching your own
previous bounce only propagates your own mistakes, and for a long time
that is exactly what was happening here.

## The traps

These are the ones that cost real work here. None are guessable from the
API.

**A sample pack can lie about pitch.** VSCO-2 CE names every file an
octave below what it sounds, and is not consistent with itself: one solo
violin folder uses scientific pitch and another folder of the same
instrument uses the octave-down convention. For a long time every
ensemble string, woodwind and brass in this repo played a register above
what was written — a cello section landing in viola range — and the
complaint it produced was "the strings sound unnatural". Run
`scripts/audit-pitch.mjs <manifest>` before writing on a pack. It
refuses to report until its detector passes signals whose answers are
known, because the first version of that detector read harmonics as
fundamentals and declared a correct library 12 semitones out.

**Gain is a multiplier on whatever the pad holds.** A full-scale synth at
gain 0.4 is far louder than a field recording at gain 2.0. Sources here
differ by 35 dB on disk. Stage from each sample's measured peak first and
balance by ear only after that. Setting levels by taste across mixed
sources once collapsed a whole track to kick and sub, 19 dB darker than
the track it was meant to improve on.

**Loud is not energetic.** The ear is 10–15 dB more sensitive near 3 kHz
than at 100 Hz, so bright metal and high mallets read far louder than any
RMS meter reports. `loudness()` gives perceived minus measured; anything
at +10 dB or more will jump out of the mix no matter how tidy the RMS
looks.

**Bass carries by its harmonics.** Below about 400 Hz nothing is
reproduced on a phone. A near-pure sine sub is felt on a large speaker
and simply absent on a small one, which reads as "the bass isn't clear"
rather than "the bass is quiet". `translate()` measures the loss; the fix
is a saturated parallel copy in 150–800 Hz.

**A beat can be present and inaudible.** Being on the grid is not the
same as being heard on the beat. `pulse()` weighs onsets by velocity,
pad gain *and* the level of the sample the pad holds — the first version
omitted that last term and ranked a −33 dBFS cabasa above a full-scale
kick, which inverted every number it produced.

**Read spectra normalised, never absolute.** `compare()` normalises both
sides against their own total. An absolute reading once showed a track
fixed at the top while a 16 dB hole sat at 500 Hz.

**Independent is not the same as unrelated.** Voices need shared material
as well as separate motion. `counterpoint()` measures the motion;
`motif()` measures whether anything ever comes back. A seeded random walk
passes `melody()` and `counterpoint()` and sounds like nothing at all.

## A field recording does not start when the file does

The found-sound packs here (`foundkit`, `darkkit`) are ESC-50 clips.
Every one is exactly five seconds long with the event somewhere inside
it, usually a fifth of a second in, and the manifest records where in
an `onset` field. A pad's `start` is a fraction of the file, so it has
to be set to `onset / 5` or the pad begins on room tone.

This is not a subtle quality issue. The keys in `fk:type` begin 0.2s
into the file; a pad given `dec: 0.17, sus: 0` opens its gate on
silence and shuts it 30 milliseconds before the sound arrives. The
sample peaks at 0.0 dBFS on disk and measured **−70 dB** in the mix.
Every instinct says "it is too quiet, turn it up" — and gain stops at
2, so turning it up cannot work and the obvious conclusion is that the
sound is weak. It was never quiet. It was never playing.

`place()` caught it, and caught it as the right problem: *owns
NOTHING, below −70dB in every band*, which is the reading that means
absent rather than quiet. Three other pads in the same track were
losing 10–30 dB the same way without being obviously broken.

So: before writing for a found-sound pack, read the `onset` field and
set `start` from it. The onsets in use here are

| sample | onset | `start` |
|---|---|---|
| `fk:knock2` | 0.14 | 0.028 |
| `fk:type` | 0.20 | 0.040 |
| `fk:fire` | 0.222 | 0.044 |
| `dk:train` | 0.208 | 0.042 |
| `dk:glass` | 0.128 | 0.026 |
| `dk:creak` | 0.02 | 0.004 |

`scripts/timbre-atlas.mjs` will not save you here: it groups by the
manifest's `cat`, and all twelve found sounds declare `DRUMS`, so it
reports one row for the pack and tells you nothing about any sample in
it. Measure these per file.

## A found sound belongs to no group, and three tools go quiet

`instrument()` tags every pad it makes with an `inst`. `sound()` does
not, because a found sound is not an instrument. Three of the most
useful calls here filter on exactly that tag, so on a track built from
found sounds they do not fail — they simply find nothing and say
nothing:

| call | what it filters on | what you get |
|---|---|---|
| `motif()` | pads with an `inst` | no lines, no finding |
| `counterpoint()` | two or more such lines | no voices, no finding |
| `balance()` | `p.inst` groups | *"no instruments on the board"* |

TENEMENT lost all three this way. Its material was never examined, and
the one call that solves a mix against a reference could not be run on
it at all. `review({quick:true})` now says so under COULD NOT APPLY,
but the quiet half is worse than the loud half: a check that finds
nothing to look at reads exactly like a check that passed.

The fix needs no new code and was verified in the browser. `pad()`
assigns whatever key it is handed, and `inst` is just a key:

```
await JBH.sound('dk:train', 0)
JBH.pad(0, { inst: 'bass' })        // now balance() can see it
```

Group found sounds by the job they do — bass, drums, air, lead — not
by what they were recorded from. The groups are what `balance()`
moves, so they should be the things you would want to move together.

## pulse() is not a humanisation check, and cannot be

`pulse()` counts an onset as on-grid within

```
tol = max(12ms, a sixteenth * 0.30)      // 53.6ms at 84bpm
```

That width is right for the question it asks — *can a listener find
the beat* — and useless for the question it looks like it answers.
Human micro-timing is far smaller than the window: the median offset
across 1,150 performances in the Groove corpus is 0.075 of a
sixteenth, 13.4ms at 84bpm. **A human drummer scores ~100% on
`sixteenth` too.**

So "sixteenth 100%" was never evidence that a track is robotic, and
MERIDIAN still reporting 100% after every step was nudged is not
evidence the nudges failed. They are applied — the scheduler does
`when += lk.nudge * sd` in three places — they are simply five times
smaller than the tolerance.

The comparison to avoid is the one made here first: the study script's
"1.70% land exactly on the grid" is EXACT EQUALITY, and setting it
against pulse's windowed 100% is two different measurements wearing
the same word. To verify humanisation, measure onset deviation
directly against the grid, the way `scripts/study-groove.py` does to
the corpus — do not ask `pulse()`, which is built not to care.

## Two layers of one sample do not simply add up

TENEMENT's sub and body are the same recording — `dk:train`, same
pitch, same start, same steps — split by a lowpass at 105Hz and a
resonant bandpass at 374Hz. Being the same source they are perfectly
time-aligned, so the obvious expectation is that they reinforce. They
do not, because the two filters impose different group delay, and
where their skirts overlap the copies partly cancel:

```
120-250Hz   sub -26.3   body -31.4   sum -27.8   power-sum -25.1   -2.7dB
```

Everywhere else the delta is within half a decibel, because the two
occupy different bands and never meet. 2.7dB is not a catastrophe, but
it sits exactly in the band that joins the bass to the midrange, and it
was free to avoid: move the band-split apart, or flip the polarity of
one layer and measure which way is louder.

Measure this whenever one source is split across layers. The method is
`place(a)` and `place(b)` for the parts, `spectrum()` for the sum, and
a power sum to compare against — if the measured sum falls below the
power sum, the layers are fighting.

**And check that the measurement varies.** The first run of this
reported all nine bands cancelling by exactly -3.0dB, which is not a
physical result; a real phase interaction swings about with frequency.
A constant was the signature of a broken test: `spectrum()` was being
passed `{pads:[0]}` to isolate a layer, it has no such option, the
filter was dropped silently and all three calls measured the whole
mix. Power-summing a number with itself is +3dB, so the artefact was
exactly -3.0 every time. spectrum() now refuses a pad filter by name
instead of ignoring it.

## There is no correct tonal balance either, only a correct one for this piece

The loudness section below says the level is a decision about the
music. The same is true of the spectrum, and more sharply. A measured
ambient-hall reference in this repo sits at −27dB in 20-60Hz and −29.5
in 8-16k: a dark, mid-centred shape with almost no sub. Matching a
beat-driven track to it would be wrong by about 19dB in the bass, and
matching an ambient piece to a drum track's profile would be equally
wrong the other way.

So a reference is per-piece, or at least per-genre, and
`samples/ref-*.json` is a collection rather than a setting. Load the
one that fits what you are making. Having none loaded is still worse
than having an imperfect one — without a reference `compare()` does not
run at all, and a mix can pass every per-pad check while its total
shape is tilted badly, which is exactly what happened to TENEMENT.

## Stage from a measured peak, and let it fail loudly

Gain is capped at 2. That matters more than it sounds, because the
honest way to set levels is to render each pad alone, read its peak,
and compute the gain that puts it on target — and when that arithmetic
asks for more than 2, the right response is to say so rather than
silently clamp:

```
stage(pad, -14)
→ solo peak -70.1dB  target -14dB  gain 2.00
  CANNOT REACH IT — needs 638.3, cap is 2.
  The sound is wrong for the job, not the level.
```

A clamped gain looks like a staged level and is not one. The bell tree
was pushed to maximum and stayed inaudible for exactly this reason: it
peaks at −40 dBFS and no gain setting reaches the job. When staging
reports it cannot get there, change the sound — a different source, a
different part of it, a filter that is not sitting on the only region
it has — rather than the number.

## Configuring a pattern does not select it

`step()` and `note()` write to `S.patterns[S.pattern]` — the SELECTED
pattern. `pattern(n, props)` configures the pattern named by `n` and
until recently did not select it. So the obvious shape

```
pattern(1, {plen:32, clear:true});   step(pad, 0, 0.9);  …
```

cleared pattern 1 and wrote every step into pattern 0, which was
still selected. **Three tracks were bounced that way.** MERIDIAN came
out 62% digital silence wherever an empty pattern played, with all
four patterns' notes piled on top of each other wherever pattern 0
did. The listener's words were "mostly silence with a big crash of
random in the middle", which is an exact description of that bug.

Pass `{select:true}`. Clearing or copying into a pattern that is not
selected now sets a `warning` on the result, because clearing is what
you do in order to write. Better still, assert it:

```
const r = await call('pattern', n, {select:true, clear:true});
if (r.warning || r.selected !== true) throw new Error(r.warning);
```

`readBack()` has always returned `selected`, and it was false every
time. A field nobody reads is not a safeguard.

## paint() normalises, so only the ratios mean anything

`paint()` ends with `g = 0.9/pk`. Every partial level you hand it is
relative to the others and the absolute scale is thrown away.

That is easy to know and easy to forget. A bass here had 20-60Hz
measuring +10.2dB over the reference, so its 55Hz fundamental was cut
from 0.10 to 0.035 — nine decibels — and the mix did not move. The
band read -16.8 before and -16.8 after, identical to the decimal,
because the other six partials had been scaled down in the same pass.
Relative to them the fundamental went from 0.22 to 0.18: a change of
1.7dB, not 9.

The tell was there and went unread. A painted pad's solo peak is
always about -1.0dB, because 0.9 full scale is what the normaliser
produces; staging it reported `solo -1.0dB` in both versions, which
is what "this sound did not change" looks like.

So: pick the partial whose band already measures right, hold it
fixed, and move the others against it. Dividing every level by its
band's error and renormalising is the same as doing nothing.

The wider version of this trap: before concluding that an edit failed
to achieve its goal, check that the edit changed anything at all. Two
identical measurements are not a weak effect, they are no effect.

## audit(pad) — did the sound come out the way you meant it to

`place()` asks whether a sound has somewhere to sit among the others.
`audit()` asks the earlier question, and the one nothing here used to
ask: **is the sound itself the colour you were trying to make.**

The gap this fills cost two whole iterations of a track. A bass was
painted with its fundamental cut nine decibels to empty the sub.
`paint()` did exactly as instructed — the partials were faithfully
what the spec said — and the mix did not move, because `paint()`
normalises. The SOUND matched the SPEC. The spec did not achieve the
GOAL, and nothing compared those two things until a whole-track
render twenty minutes later reported the band unchanged to the
decimal.

```
await JBH.audit(bassPad)        // against the loaded reference()
→ { judgedOver: 5, notOccupied: ['2k-4k','4k-8k','8k-16k','1k-2k'],
    worst: '20-60', worstDb: 8.4, meanErrorDb: 5.62,
    suggest: { eqLo: -6.6, eqMid: -1.1, eqHi: null },
    says: 'worst band is 20-60Hz at +8.4dB, mean error 5.62dB over
           the 5 bands it occupies. On a sampled pad, try eqLo -6.6,
           eqMid -1.1.' }
```

**It predicts the bounce only where the sound dominates the band.**
That bass audited at +8.4dB in 20-60Hz and the finished mix measured
+8.2dB there — five seconds against twenty minutes for the same
answer — because the bass is what fills that band.

It does not generalise, and the first version of this section claimed
it did on the strength of that one sound. Run across a whole track:

| sound | audit | the finished mix in that band |
|---|---|---|
| bass | 20-60 **+8.0** | **+8.1** |
| kick | 20-60 **+15.7** | +8.1 |
| perc | 8k-16k **+29.0** | **-1.5** |

The percussion is the worst-shaped sound in the piece by a wide
margin and the mix is fine where it lives, because it sits 18dB down
and contributes almost nothing. The kick is twice as far out in the
sub as the bass and the bass is still what the mix shows, because a
short transient carries little energy.

So audit() measures a sound's COLOUR, not its CONTRIBUTION. Read it
with place(), which says how the sound stands against the others: a
large audit error on a pad that place() shows owning its band is
worth fixing, and the same error on a pad 18dB under everything is
not. Neither call answers the other's question.

**It judges only the bands the sound occupies** — within 20dB of its
own loudest. The first version compared all nine and so marked a bass
down at 8-16kHz, where a bass has nothing and the reference has
cymbals; it called that the worst band at -53dB and advised eqHi +43,
which would have destroyed the sound. That is the identical mistake
`place()` had already had fixed out of its `owns`, made again in a new
call in the same week. A single sound is not meant to look like a
mix. It is meant to have the right colour where it lives.

## Nothing in this app looks at the time axis

Every analyser here reports an INTEGRATED figure over the whole
render. `compare()`, `loudness()`, `place()`, `pulse()` and the rest
see the piece as one lump, and integrated LUFS is *gated*, so silence
is excluded from it by definition. A track can be two thirds empty
and score beautifully — MERIDIAN did: -16.2 LUFS, 95% beat, every pad
owning its own band, and 53 of its 86 seconds at -91dB.

Worse, every one of those numbers came from the app measuring its own
output with its own code. That is circular. If an analyser is wrong,
or simply silent about a whole class of fault, the mix is broken in
exactly the way nothing will report.

So **check the bounced file with something that is not this app**:

```
node scripts/verify-bounce.mjs <file> --ref samples/ref-*.json
```

It uses ffmpeg and asks what the app cannot — is any of it silent and
for how long, does the level hold across the duration, does it clip
or carry DC, how wide is it, how far is its spectrum from a
reference. The level map it prints, one bar per ten seconds, makes a
hole obvious at a glance.

Run it before sending anything to anyone. And note that it was
validated against a known-bad file before being trusted, which is how
three bugs *in the checker* turned up — a regex that matched the
first per-frame line instead of the summary and reported -70 LUFS for
a -16.1 file, and two checks testing for field names this ffmpeg
never prints, which therefore ran silently and passed silently. A
checker nobody has run against a known-bad input is not a checker.

## The norms are measured, not recalled

| check | measured from |
|---|---|
| `counterpoint()` | 70 Palestrina scores — 68% of moves between a pair of voices are oblique |
| `melody()` | Essen Folksong Collection, 8514 melodies |
| `motif()` | 8196 of those melodies, bucketed by length: recurrence above the same intervals reshuffled is about +28 overall, +51 for lines of 96 notes or more |

The scripts that produced them are in `scripts/study-*.py`. A random walk
scores about +7 on `motif()`; that gap is the whole point of the measure.

## Making sounds, not just judging them

Three calls have no equivalent elsewhere in the app.

`balance(opt)` solves the group levels against a loaded reference
instead of guessing them. It renders each instrument group once; after
that the fit is arithmetic, so trying a thousand combinations costs
nothing more. Five rounds of setting one track's levels by ear each
fixed one part of the spectrum and broke another — this put nine bands
inside 1.7 dB in one pass. Moves are capped at 9 dB by default, because
an unconstrained fit does not balance a mix, it deletes from one: left
alone, its cleanest route to the target took an instrument down 49 dB.
A group pinned at the cap is telling you the part or the sound is
wrong, not the level. It suggests; it does not apply.

`mutate(pad, opt)` makes variations of a sound, measures them, and
keeps the one that wins. Richard James described commissioning software
that starts with a sound, analyses it, makes randomised variations and
compares them against the original before picking the best; this is
that, with the analysers here as the fitness function. Randomising
alone is not the idea — every candidate is scored against the sound it
came from. `want` is different, similar, brighter, darker, punchier or
fuller. It restores the pad unless you pass `keep:true`.

`paint(opt)` draws a sound as a spectrum and resynthesises it, the way
MetaSynth does — the program behind the face hidden in the spectrogram
of *Equation*. An image is a spectrogram: horizontal is time, vertical
is frequency, brightness is level. Pass `rows` as a grid of levels with
the lowest frequency first, or `partials` to place tones individually,
which is how you build a bell with real inharmonic ratios rather than a
filtered oscillator pretending. Frequency maps logarithmically by
default; that is the detail people took years to work out about the
face, and it is the difference between a usable sound and everything
crowded into the top octave. What comes out is a sample on a pad, so
`chop()` and `mutate()` work on it like anything else.

`resynth(opt)` plays one sound using the pieces of another. It chops a
corpus of pads (the brain) and the target into short blocks, then
rebuilds the target from whichever brain blocks sound most like each
moment of it — the shape is the target's, the substance is the brain's.
A piano note rebuilt from vibraphone, marimba and hand chimes takes 633
blocks out of 2103 candidates. The idea is Samplebrain's, designed by
Richard James and written by Dave Griffiths; this is an independent
implementation of a published technique, not a port of their GPL code.
Matching is on spectral shape with each block normalised against its own
level, so a quiet corpus can stand in for a loud target.

`freeze(pad, opt)` holds one instant of a sound for as long as you
like. `paint()` can make anything provided you already know the
partials you want, and usually you do not — but you have a sound whose
colour is right for a fifth of a second and no way to keep it. This
reads the spectrum at one moment, keeps the strongest partials and
sustains them, so any one-shot becomes a pad. Nothing loops, because
nothing is replayed. `shimmer` gives each partial its own few cents of
drift; without it they sum to an organ.

`tape(pad, opt)` gives a sound a pitch that will not hold still.
Everything made here is perfectly in tune for the whole length of a
note, which never happened to a recording made on tape, and there is a
`humanDrift` for timing with no equivalent for pitch. Wow is slow and
heard as the pitch sagging; flutter is fast and heard as roughness
rather than as pitch; drift is neither and never quite comes back. All
three in cents, with small defaults, because real machines are subtle.

## Reach for what is already there

The next gain is usually not a new call. `poly()` gives a pad its own
BPM and produces real cross-rhythm — 3:4:5 inside one bar — and six
tracks were written in this repo before anyone used it, every one of
them on a single 16-step grid at a single tempo. The same habit left a
finished track bounced with six of seventeen analysers run.

Before adding a tool, check whether the thing you want already exists
and has simply never been reached for.

## Know the pack before you write for it

`scripts/timbre-atlas.mjs <manifest>` measures every instrument in a
pack once and writes `samples/atlas-<pack>.json`: the level each sample
arrives at, which band it owns, how fast it starts, how long it rings,
and how much energy it has above 2 kHz against below 500.

Almost every mixing mistake in this repo came from not knowing one of
those numbers. Levels were staged by ear across sources that differ by
35 dB on disk. A palette was chosen for its "real top octave" and its
headline instrument — a vibraphone struck with soft mallets — turned out
to be the dullest thing in the library at 30 dB more body than air. The
bell tree was pushed to maximum gain and stayed inaudible because it
peaks at −40 dBFS and gain stops at +6. Each was discovered by
measuring, late, after a bounce had gone out, and none of them needed
discovering twice.

Read the atlas before choosing a sound for a job, rather than choosing
one and finding out afterwards that it cannot do the job.

## A warning from the tool this borrowed from

Samplebrain's own manual says, of its parameters: "we gradually added
more and more tweakable parameters until it became slightly out of
control." That is the failure mode of everything in this file. `review()`
had to be fixed twice for the same disease — it ran melodic checks on
shakers and reported one fact four times per instrument, burying four
real findings under thirty-two spurious ones.

A check that cries wolf gets ignored, and then it may as well not
exist. When adding one, ask what it will say on material where nothing
is wrong.

## Reproducing a track

`songs/*.mjs` each render one finished track end to end — build the
instruments, write the parts, run the checks, choose a master setting by
measurement, write the WAV. The bounces are gitignored; the scripts are
the artefact. `songs/README.md` says what each one was written against.
