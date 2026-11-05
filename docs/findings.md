# Findings

The long accounts, split out of AGENTS.md so that file can be read on
every turn without carrying all of them. Nothing here is summarised or
deleted -- each section is verbatim where it was.

Every one of these is a post-mortem of something that cost real work,
and most record a mistake made twice. Read the one that matches what you
are about to touch. AGENTS.md carries the rules; this carries why they
are the rules.

### A SPAN IS CAPPED AT FOUR BARS, because a pattern is

`MAXSTEPS` is 64 and a bar is 16 steps, so **one pattern holds four
bars and no more**. That is the real ceiling on every `bars:` option in
this app, and for a long time nothing said so. Asked for eight,
`infill()` generated notes out at step 122 and `step()` clamped every
one of them onto the last step of the pattern — five of eighteen notes
on step 63 in one measured run. That is the HOLLOWAY stumble again,
arriving by a different route, and the infill suite missed it because
it only ever asked for four bars.

It refuses now and names what fits. A longer span is several patterns:
the WRITE panel cuts it into four-bar chunks and writes each into the
next pattern along, seeding each from the first so the chunks are
variations rather than copies. There are eight pattern slots, the
chunks have to be **consecutive**, and a span with nowhere left to go
is refused rather than wrapped — written with `% S.patterns.length` it
wrapped, and sixteen bars from pattern 6 wrote its second half back
over patterns 1 and 2, in that order, with nothing said.

Two things to carry from that. A span longer than one pattern is an
ARRANGEMENT question, so the chunking belongs to the panel and not to
`infill()`, which stays one voice over one span. And OFFER scores the
first chunk only — the candidates are what the first four bars sound
like — which the info line says out loud, because scoring one thing
and writing another is the sort of quiet mismatch this file is full of.

**AND ALL OF THAT WAS TRUE OF ONE OF THE TWO WRITE PATHS.** The
paragraph above describes the single-voice WRITE IT. With **ALL** ticked
the apply handler called `ensemble()` once and `return`ed — three lines
above the chunk loop written for exactly this — so a sixteen-bar span
wrote **four bars into one pattern and dropped the other twelve in
silence**. Measured by driving the panel and reading the answer:

```
SPAN offers 1 2 4 8 16        nothing disabled at PTN 64
OFFER  ... ranked by fault, not by worth
WRITE  wrote 88 notes ... over bars 1–4
       ptn1 hits63   ptn2 ·   ptn3 ·   ptn4 ·
```

Three faults, one root. The span control **offered 16 and enabled it**,
which is *A CONTROL MUST NOT OFFER WHAT CANNOT WORK* with the write path
rather than the pattern length as the thing that cannot. The ensemble
OFFER never added the "these are the first 4 bars" sentence the single
path has always added, so a person choosing between five sixteen-bar
arrangements was choosing between five four-bar ones with no way to
know. And the span was silently truncated rather than refused.

It chunks now, by the same rule: consecutive patterns, the progression
carried forward where the target has none, the selection handed back.
**A later chunk has to be applied by a seed `ensemble()` really has in
its set** — the candidate seeds are `base ^ (k*2654435761)`, so the base
itself is always the k=0 one; inventing a seed gets the apply refused,
correctly, and taking the nearest is how a scored arrangement becomes an
unscored one. Chunk 1 is the arrangement that was picked; the rest are
variations on their own seeds that nothing ranked, and the info line says
which is which.

**Every test here asked for four bars or fewer** — the one span where the
two paths agree. That is the third time in this file that *the common
path was the untested one*, and the second time a fixture convenient for
every case tested one configuration.

### One voice has to see the others, and the panel never let it

`infill()` has read `o.against` from the start, and it is what switches
on BOTH of its inter-voice filters — the semitone/minor-9th test against
what is sounding, and the parallel fifth/octave test against what each
voice was doing when either last moved. **Nothing in the panel ever
passed it.** Only `ensemble()`'s internal chain did. So the commonest
real edit there is — *keep everything, rewrite the lead* — was written as
though the voice were alone in the pattern, and the only way to find out
was `harmony()` or `counterpoint()` afterwards.

The fixture that shows it is the part worth keeping, because the obvious
one proves nothing. A semitone above a CHORD tone was already refused, so
a clash can only appear where another voice sounds something the chord
symbol does not contain. Hold **F♯ under Em** — the 9th, an ordinary
colour note — and the lead is free to play **G**, which is Em's own minor
third and so the one pitch the chord filter is most certain about:

```
written blind    8  8  9  6  6  7     false relations, six seeds
with against     0  0  0  0  0  0
```

`mlAgainst()` reads the PATTERN, not `schedule()`, because schedule
reports a TIME and `against` wants an absolute STEP — converting back
through swing, humanisation and the poly lanes would put the filter and
the measure into disagreement about when two notes are adjacent, which is
the fault the parallel-interval section above spent a session on.
`lk.len` is seconds, `(60/bpm)*beats` where it was written, so the
inverse is exact. It is recomputed PER CHUNK on a multi-pattern span,
since each chunk lands in a different pattern and has to fit what is on
that one.

**AND THE WIRING LOOKED BROKEN WHEN THE ESCAPE WAS WHAT WAS MISSING.**
With `against` passed, seven of eleven lead notes still landed on G. The
filter was reached every time and yielded every time, because a strong
beat — or the last weak slot of a bar that has not stated its third —
narrows the classes to ONE, `pcChoices=[ch.third]`, and `[G]` filtered by
"not a semitone above F♯" is empty. The old code said *a rule that
empties the list has to yield*, so it handed back the clash it had just
removed everything else for. That is the same shape as the fallback two
blocks down, which used to fall back to the root, and on a major seventh
the root IS the clash.

So the semitone filter has a ladder now, like the parallel one. **And the
order of that ladder is not obvious — all three attempts wrote zero
clashes and only the third was acceptable:**

| escape | stepwise | repeats | parallel 5ths |
|---|---|---|---|
| chord tones first | 0–21% | 36–100%, classes `{root, 5th}` | 0 |
| stepwise classes only | 57–80% | 10–29% | **1 of 24 pairs** |
| every safe class, stepwise preferred | 14–55% | 18–73% | 0 |

Reaching for a chord tone first is the mistake this file already paid
for: chord tones are a third apart by construction, so they are the
expensive escape, not the cheap one. But narrowing to the stepwise
classes *alone* shrank the pool the parallel filter underneath escapes
into and bought a parallel fifth — **"the escape has to be wider than the
choice was" applies to the filter below this one too.** The pool keeps
every safe class and merely prefers the stepwise ones, which the contour
chooser picks anyway because a stepwise class is the nearest to the
anchor by definition.

Two costs left in deliberately. In that fixture every bar reports **no
third**, which is structural — Em's third is G and G is banned for the
whole span — and one seed in six goes static, because a filter that fires
on every note replaces the strong-beat and third-stating narrowing each
time and the line loses its shape logic. On real material the escape
fires occasionally and the genre builds measure **44.5% stepwise against
the 46.9 norm** with all of this in place. Tuning either further would be
writing a target for a number.

### `gate` existed and had no control

Articulation spans **0.28 beats (footwork) to 2.18 (doom)** across the
sixteen recipes, it is audible, and it reached the engine through the
`GENRES` table only — so a person writing by hand got one fixed note
length with no way to change it. The same shape as `mlPoly`, which
existed with no control for several builds, and as `from`, which
`infill()` took and no control reached. There is a `#mlGate` now, read by
both OFFER paths, and `writeSurprise()` snaps it to the nearest option
when it leaves the panel set to what it used — assigning 1.9 to a select
with no 1.9 in it leaves the control showing whatever it showed before,
which reads as "the build did not set this".

### A part does not have to start at bar 1

`infill()` has always taken a `from`, and until now no control in the
panel reached it, so every part the UI wrote began at the top of the
pattern. Writing a different ending, or filling the second half of a
phrase, meant dropping to the API — which is the kind of gap that makes
a panel look finished and leave half its function unreachable.

The bar list is rebuilt from the selected pattern's own LEN, since a
one-bar pattern has one place to start, and a stale "from bar 4" on a
pattern that has since been shortened is a refusal whose cause the
person cannot see.

Two numbers to keep straight, because getting them wrong is visible in
the one sentence guaranteed to be read: `from` is a ZERO-based bar
index internally, and every bar and pattern the person reads is
ONE-based. `says` printed `from` raw, so choosing "from bar 3" answered
"wrote into bars 2–3" in the same sentence that called the pattern
"pattern 1".

`from` and a multi-pattern span are mutually exclusive and it refuses
rather than reconciling them: each pattern after the first starts at
its own bar 1, so there is nowhere for a middle starting bar to mean
anything once the span crosses a pattern boundary.

### A CONTROL MUST NOT OFFER WHAT CANNOT WORK

The span cap above shipped as a regression, and the shape of it is the
part worth keeping. A fresh board is one pattern of 16 steps — ONE BAR
— and the span control defaults to 4. The moment a span had to fit the
pattern, OFFER refused on every untouched project: load an instrument,
declare a key, pick a progression, press OFFER, read "set LEN to 64"
and get no music. The panel's whole flow, dead on arrival.

Every test in `tests/browser/musical-layer.test.mjs` passed over it,
because **every one of them opens with `pattern(0,{plen:64,…})`**. Six
green assertions about spans working, written in the same session, none
of them on the default board. A fixture that is convenient for every
test is a fixture that tests one configuration.

Two rules out of it. A test suite needs at least one case that touches
nothing it does not have to — no plen, no clear, no state set by hand —
because that is the configuration every new person is in. And a control
should not offer a choice that cannot work and then explain itself
after the fact: the impossible spans are disabled now, each labelled
with the LEN that would buy it, and the selection falls back to the
widest span that fits. The refusal still exists underneath as a
backstop; it is no longer the way anyone finds out.

### FEEL is a cross-rhythm and cannot be a triplet

**16 does not divide by 3.** Three even hits in a bar cannot be written
on this grid at all; ask EUCLID for 3 in 16 and it answers 5-5-6, which
is audibly not a triplet. So the feels in the WRITE panel are named
"3 over", "5 over", "7 over" and not "triplet", and the refusal for an
unknown feel points at `poly()`, which gives a pad its own BPM and is
the only call here that produces real triplets.

What a cycle of N steps does instead is drift. Because N does not
divide the bar, the figure lands somewhere new each time round and
comes back after N bars — a hemiola, and the drift is the whole effect.
So **the cycle is laid across the WHOLE SPAN, not restarted per bar.**
Restarting it every bar is what turns a cross-rhythm back into a
figure, and it is the obvious way to write it.

Measured on one seed over four bars: straight uses 8 of the 16
positions in a bar, 3-over-4 uses all 16.

**FEEL IS NOT poly() AND THE PERSON ASKED FOR poly().** Twice, in the
words "polyrhythms" and "Poly options for the write function". What
shipped is a cross-rhythm written on the 16-step grid, which is a real
effect and is not the same thing, so do not read the FEEL dropdown as
that request being closed.

The genuine article is already in the app and `src/pure/poly.js` makes
it easy to reach: a pad's BPM counts ITS OWN hits per minute, so a pad
at 75 against a project at 100 is three hits per bar against four
beats — true 3-against-4, re-anchored every bar with LOCK TO BAR on,
phasing with it off. No arithmetic needs inventing.

**THIS IS DONE NOW, and the unverified part was the easy part.** The
cell pitch lock works: a three-cell lane with locks of 0, 5 and 7
semitones on a pad sampled at 36 scheduled midi 36, 41 and 43, 0.87s
apart, at 69 against a project 92. `polyFire` has always read `lk.pitch`
and `lk.pitches` and passed them to `triggerPad`; nobody had checked.

So `ensemble()` takes a `poly` option — *in time*, *cross-tempo
spread*, *cross-tempo wide* — and the WRITE panel has it beside ALL.
Each upper voice gets a lane at a ratio while keeping the grid part
written for it, which is what makes the timings conflict instead of
replacing one another.

**THE PITCHES CANNOT BE CHOSEN PER BAR, and that is the whole design.**
A lane at 3:4 does not line up with the bar, so by construction it
drifts across the progression and meets every chord in it — a figure
harmonised against bar 1 is wrong by bar 2. The notes come from the
pitch classes safe against EVERY chord in the span: no semitone above
any chord tone anywhere. A smaller set, and the only one that stays
right while the figure moves. Asserted per cell against all four
chords.

**The foundation does not drift.** The bass keeps the project tempo; a
sub that wanders off the beat takes the weight with it, which is the
same reason WOBBLE leaves the fundamental steady.

One pad carries the lane — the one nearest the middle of the
instrument. A lane per sampled note would be a different feature and
the pads would need one clock between them to stay one voice.

### DEMO — one tap builds four bars

Every control in the WRITE panel needs something set up before it does
anything: an instrument tagged, a key, chords, a pattern long enough.
That is six decisions before the first sound, which is most of what
"make write user friendly" means. **DEMO** does the setup and then uses
the panel's own calls, so the result is reachable by hand afterwards,
and it reports every step so it reads as a demonstration rather than a
preset. Measured output at PTN 64:

```
bass   16 events  midi 29-40   straight
synth  33 events  midi 52-65   cross-tempo 5:4 @115
hi     33 events  midi 74-86   cross-tempo 3:4 @69
0 clashes in 80-odd voice-pairs · 62-68% oblique · 0 minor ninths
```

**AND THE DEMO SHIPPED WITH THE MISMATCH THIS FILE KEEPS CATCHING.** It
passed `seed: offer.seedUsed` — a field that does not exist — so apply
fell back to the default base seed, rebuilt a different five
candidates, failed to find the chosen one among them, and wrote
`cands[0]` of the new set. Scored one arrangement, wrote another.
`ensemble()` returns its `seed` now, and an `apply` whose seed is not in
the regenerated set is REFUSED rather than quietly substituted — a
caller cannot get it right if the value is not handed back, and the
nearest match is not the one that was chosen.

### SURPRISE builds a whole track, in one of ten genres

"If we can have the random button offer a full build from pads with some
genres to select from and options that would be incredible. Some strange
ones would be cool."

A genre here is a bundle of levers the engine really has — tempo, swing,
`human`, `humanDrift`, pattern length, density, the cross-rhythm feel,
the poly mode, the send amounts, the kick/snare/hat step sets, which
`PROGS` families are in character, and whether the scale is pentatonic.
Ten of them: house, boombap, dnb, ambient, noir, and the strange five,
gamelan, motorik, hauntology, math and dub. It uses the WRITE panel's
own calls on the pads already loaded, so everything it does is reachable
by hand afterwards, and it leaves the panel set to what it used — OFFER
is then a variation of what you just heard rather than a fresh start.

**The faults it shipped with are all the same fault**, and it is the one
this file keeps a section for. Four options were declared in the genre
table and read by nothing:

- `feel` and `penta` reached the panel and not the writing, so gamelan's
  five-cycle and math's seven never touched a note.
- `scale:'penta'` then turned out to narrow only ONE of the two places
  that write pitches. `infill()` honours it on the grid; the cross-tempo
  lane draws its own notes from every class merely consonant with the
  chord, which for a single triad is nine of the twelve. So the gamelan
  build measured EIGHT pitch classes in a track whose whole character is
  five, with the grid part pentatonic and the lane over it not.
- `lufs` cannot be applied at all — a loudness is only reachable by
  rendering and solving for the trim — so it is reported as the target
  to aim the bounce at, which is the one honest use of a number you
  cannot set.

And one thing pentatonic cannot fix by itself: a two-chord vamp supplies
chord tones from outside the five whatever the scale says, so a genre
whose character IS the five notes has to stop the harmony moving too.
Gamelan takes the one-chord family for that reason.

**Three sections had one seed between them.** `seed: SEED` went to all
three patterns, so A, B and C wrote the same notes and differed only in
density and feel — an arrangement of A B A B C B over one line is that
line six times, and "it goes somewhere" had nowhere to go. They are
offset from the one seed now rather than drawn fresh: same key, same
chords, same register, same rhythm library, different material.
Variations of each other, not strangers.

**A kit is not one velocity repeated.** The first version wrote every
kick at 0.95 and every hat at 0.4, which on a velocity-layered kit plays
ONE recording over and over — the drum-machine sound reached from the
other direction, a real kit used as if it were synthesised. It writes
accents, ghost notes at 0.2 (a different recording on a layered kit: a
stick resting on the head, not a backbeat), and the two things that make
a pattern read as a track rather than a loop: a BREAK, where the kick
drops out of the quiet section's last bar, and a FILL, where the snare
ramps through the busy one's. Both need two bars to mean anything and
are skipped on a one-bar pattern rather than emptying it.

**ONE TAG IS ONE VOICE, HOWEVER MANY PADS IT SPANS**, and getting that
wrong cost the kit entirely. Picking four pads by register and calling
each a voice gives four voices with the SAME `inst` whenever one
instrument covers them — six `bass()` calls are all tagged `bass`, which
is one sound over six notes exactly as `instrument()` makes one. So
`ensemble()` wrote four parts onto one instrument, every voice's
`against` was the same six pads, `instPads` claimed all of them as used,
and `drums` came out empty: four piled lines and no drums at all, on a
board with six sounds on it. The voices are deduped by tag now, and the
kit prefers an UNTAGGED pad, because a tagged pad is one the person said
is an instrument and writing four-to-the-floor onto it is the wrong
guess to make silently.

**The test fixture hid the last two of those.** It made its pads with
`bass()` and never tagged them, so every genre test ran against one
instrument — the configuration where the voice dedupe is needed and the
kit cannot exist. That is the same lesson as the `instrument()` fixture
two sections up, and the third time in this file: *when a convenience
exists for setting up a test, check what configuration it is hiding.*

### Sixteen recipes, and legacy.js is not one flat scope

Six more: footwork (160, rolling threes), doom (52, held), afro
(interlocking 3+3+2), baroque (no kit, three voices answering), minimal
(one chord at 128) and gospel (swung sevenths). They fill real gaps —
nothing was above 142 but dnb, nothing under 64, and nothing without a
kit at all.

**The new lever is note length.** The cell library fixed articulation,
so every recipe got the same one however different its tempo and
harmony: a dub bass that should hang over the bar and a footwork stab
that should not were the same note with different drums under them.
`gate` scales the cell's own length, clamped to a quarter-step floor and
a four-beat ceiling — a held note must not outlast the bar it was
checked against, which is the ringing-note problem this file already
has a section on. Across the sixteen, articulation spans **0.28 beats
(footwork) to 2.18 (doom)**, and it tracks the recipe rather than the
tempo.

**ensemble() HAD TWO OPTION LISTS**, and that is the finding worth
keeping. It calls `infill()` once per candidate while OFFERING and once
per voice while APPLYING, three hundred lines apart, each with its own
object literal. `gate` went into the first and not the second, so the
offer was scored WITH it and the arrangement written WITHOUT:

```
through ensemble   1.09  1.01  0.95  0.95   gates 0.5 1 2 3 — no effect
through infill     0.61  1.13  2.25  2.92   the same gates, working
```

That is "quietly scoring one thing and writing another" from the DEMO
section, in a second place. It was nearly shipped: the genre table read
plausibly in SECONDS, because a faster tempo shortens notes on its own,
and only converting to BEATS showed every gate at or above 1 landing on
the same number. **When a lever has no effect, convert to the unit the
lever is in before believing it.** Built from one `voiceOpts()` now, so
a third option has nowhere to drift to.

**And the dropdown was a second copy of the table.** Six recipes were
added to the engine and the control went on offering ten: they existed
and were unreachable. It is generated from `GENRES`, each row's own
`says` as its label.

**legacy.js IS NOT ONE FLAT SCOPE, which cost two rounds.** Everything
after `if($('mlTonic')){` — the whole key/chords/WRITE region, `GENRES`,
`writeSurprise` — is inside that block. A helper placed just outside it
cannot see the table inside it: the first picker threw "GENRES is not
defined" into a `try/catch` and left the control EMPTY, which is worse
than the duplication it was fixing. Moving it inside then broke the call
from `drawMusicalLayer()`, which is outside: **19 failures in one suite
from one misplaced call**, because the throw took the rest of the redraw
with it.

`typeof X` evaluated in the page tells you which side of that boundary a
name is on — `drawSpanPicker` and `leadSilence` come back `function`,
`GENRES` and `writeSurprise` come back `undefined`. Check that before
deciding where a new helper goes, and **do not wrap the call in a bare
`catch(e){}`**: both of these were invisible until the catches were made
to report.

### Velocity has to change the TIMBRE, not just the level

The generator writes a velocity arc per note and a kit with ghost notes
and accents, and on a velocity-layered instrument that picks a different
recording — the whole argument for layers. On a SINGLE-SAMPLE pad, which
is what an uploaded sound is, velocity moved the gain and nothing else.
A volume knob, not expression.

`velFlt` is the routing and has been in the app all along: velFlt ×
velocity × 2400 cents of cutoff lift. **It takes TWO settings and both
default to the wrong one** — `ftype:'off'` means there is no filter to
move, and `velFlt:0` means no amount to move it by:

```
velFlt 0.45, ftype 'off'        quiet -1.9   loud -1.9    0.00dB
ftype 'lowpass', velFlt 0       quiet -21.8  loud -21.8   0.00dB
ftype 'lowpass', velFlt 0.45    quiet -18.6  loud -10.1   8.50dB
```

So the build enables the filter with it, graded by role — bass 0.80/0.30,
lead 0.70/0.45, arp 0.65/0.55 — and **only on a pad whose filter is still
`off`**. A filter the person dialled is a decision, and overriding it to
add expression takes more than was asked for. It reports which sounds it
touched.

**The wrong instrument for the question, twice.** The first two attempts
measured on a BASS, where 2k-4k sits 34dB below 250-500: lifting a cutoff
reveals nothing up there and every row read 0.00dB however well the
routing worked. One of them read −0.90dB, *backwards*, because the louder
note pushed the limiter. Measure a brightness change on a bright source,
with `mTrim` low enough that the limiter is nowhere near it. (`paint()`
takes `partials` as OBJECTS, `{hz, level}`; an array-of-arrays paints
silence and says so.)

**AND bass() IS NOT A STAND-IN FOR AN UPLOADED SOUND.** Every `bass()`
style already sets `lowpass / fcut 0.72 / velFlt 0.55`, so a `bass()`
fixture is the one case this feature correctly skips — and testing
against it hid the feature completely: the pads came back changed, by
`bass()`, while the build reported touching nothing. That is the **third**
time in this file that a `bass()` fixture has concealed the thing under
test. An uploaded pad is `ftype:'off', fcut:1, velFlt:0`; set that
explicitly in the fixture or you are testing a different configuration
from the one every person is in.

### Two voices moving into the same perfect interval FUSE

The inter-voice filter was about ONE interval, the semitone, and it was
blind to MOTION. Measured on four genre builds against the 70 Palestrina
scores these norms come from:

```
parallel fifths   2.9%, 1.92%   against 0.235%
parallel octaves  2.38%, 7.5%   against 0.111%
```

Ten to seventy times the rate of the practice the rule comes from, in
every genre, because nothing was looking. This is not a taste rule: the
upper voice stops being heard as a part and becomes a timbre on the
lower, which is the one thing a multi-voice write exists to avoid.

It is **filtered, not scored**, which is the opposite of what this file
says to do with a number and is deliberate. Oblique motion measured
77–98% against the 68% norm on the same builds and is LEFT ALONE: voices
on their own rhythmic cells rarely move together, and that is structure,
not a wrong note. A parallel fifth is a wrong note by the rule the corpus
measured, so it is removed rather than discouraged.

**Three things cost real time and all three are the same mistake —
comparing against the wrong moment.**

*The reference point is the last time EITHER voice moved*, which is what
`counterpoint()` measures: it walks the union of both voices' onsets and
asks what each was doing at the step before. Written against the writing
voice's own previous note, the filter cleared every parallel fifth and
left the octaves almost untouched — 2.33% where the norm is 0.111% —
because whenever the other voice had an onset BETWEEN my two notes, the
interval I compared against was not the interval the measure compared
against. A filter and a measure that disagree about when two notes are
adjacent do not meet in the middle; one has to be rewritten, and the
measure is the one with a corpus behind it.

*Every sounding pair, not one of them.* `prevSounding.find(x =>
x.inst === n.inst)` takes the FIRST note of that voice sounding a moment
ago, and a voice can have two at once — a long note still ringing under a
new onset. One real parallel octave survived in one voice-pair of
twenty-four that way, v0 and v2 both rising two semitones three octaves
apart, reported at 4.76% while the filter said there was nothing there.
It was found by dumping both voices and working out the interval by hand.
An unexplained residue in a filter written an hour ago is usually a class
of cases, not a rounding error.

*And the escape has to be wider than the choice was.* A strong beat
narrows the pitch classes to one, so with only that class and its octaves
to try there was often nowhere to go — an octave shift keeps the pitch
class, and a parallel OCTAVE is a pitch-class relationship. The escapes,
in order of what they cost the line: another allowed class near the
contour, a scale tone a step from where the line is, any chord tone that
passes the same semitone tests, the same class an octave away, and
finally **staying put** — a voice that does not move is oblique by
definition, and a repeated note is 21.1% of the Essen melodies.

**AND THE ESCAPE HAS A PRICE. Ranked on contour distance alone it reached
for a chord tone, and chord tones are a third apart by construction**, so
buying zero parallel octaves cost 8.6 points of stepwise motion — 46.53%
down to 37.92% against the Essen norm of 46.9%. That is this file's
longest warning arriving by the back door: a real fault fixed by quietly
degrading a measure nobody was watching. Scoring a one-or-two-semitone
move 1.5 better, and offering the key's scale tones as escapes, recovers
most of it. Measured over 36 voice-pairs at a fixed key:

| | before | after | norm |
|---|---|---|---|
| parallel fifths | 0 | 0 | 0.235% |
| parallel octaves | **2.88%**, in 14 of 36 pairs | **0**, in none | 0.111% |
| stepwise | 46.53 | 41.23 | 46.9 |
| repeated | 18.04 | 22.09 | 21.1 |
| leaps turned back from | 34.05 | 40.66 | 56.1 |

Two of those are still off the norm and are left off it. Leap recovery
has never reached 56% here and pushing it would be the same mistake
again.

**Pin the tempo and the humanisation before measuring any of this.**
`clear()` does not reset them, and `counterpoint()` walks onset TIMES —
so run after a build that left 64bpm and 30% drift behind, six seeds
reported a parallel octave that the same six seeds in a fresh page did
not. A pitch rule measured through a timing effect is not measured.

### A drum has a pitch, and the pad's pitch knob was invisible

`harmony()` found the generated kit clashing on two of four genre builds,
worst case 48 notes of "E over Ebm" — a tuned kick a semitone above the
minor third of the chord, the one interval this repo measured as rare in
Bach and the one that actually beats. The other two builds passed only
because the key happened to contain the kick's pitch.

Producers tune a kick to the root for exactly this reason, but **the
tonic is not unconditionally safe**: it is the natural 11 over the
dominant, a semitone above that chord's major third, which is the one
tension this file says stays flagged. So the class is chosen the way the
cross-tempo lane chooses its notes — the classes safe against EVERY
chord in the progression, preferring the tonic, then the nearest — and
shifted by at most a tritone, because a kick dragged further stops
sounding like the kick the person chose.

The first version left the third drum pad alone, reasoning that a cymbal
has no pitch worth tuning. Written without checking, and the next run
disagreed: the untuned third pad was the single worst thing in the
boombap build, 48 notes of "E over Ebm", because it is the one the hat
pattern fires on every second or fourth step. A noise-like sound loses
nothing to a few semitones and a pitched one gains the whole fix.

**AND THE FIX READ AS DOING NOTHING, because the measurement could not
see it.** `schedule()` reported `midi` as `srcNote` plus the per-step
pitch lock, and left out `p.pitch` — the semitone transpose on the EDIT
panel, applied for real through `pitchRatio` at every trigger. So every
analyser that reads the schedule — `harmony`, `melody`, `motif`,
`counterpoint`, `pulse` — measured a different note from the one coming
out of the speaker, for any pad the person had transposed. Pitch a bass
down an octave, which is an ordinary thing to do, and `harmony()` checks
the octave above.

That is the trap in the `paint()` section with the sign reversed. There,
two identical measurements looked like a weak effect and were no effect.
Here they looked like no effect and were no measurement. Both times the
rule is the same: **before concluding an edit failed, check that the
instrument you are reading can see the thing you changed.**

With the kit tuned and the knob counted, `harmony()` passes clean on
three of four genre builds and the fourth has one voice-pair semitone in
the whole arrangement.

## The MCP server had never been started by anything

Asked to check the handshake carried everything, the answer was that
**there had never been a handshake.** `@modelcontextprotocol/sdk` was in
neither `dependencies` nor `devDependencies` and was not installed, so
the first line of `mcp/server.mjs` threw MODULE_NOT_FOUND. The whole
agent interface this repo documents could not boot.

`tests/mcp-coverage.test.mjs` is why nobody knew. It reads the server
with `readFileSync` and checks its TEXT — every analyser exposed, every
forwarded option real — which is a good check that has caught real
drift. What it cannot see is whether the file RUNS, because it never
imports it. A suite named after the server, green, over a server that
could not start: the same shape as `offline.test.mjs` asserting the
instrument keeps playing while the app could not open.

`tests/mcp-handshake.test.mjs` spawns it over stdio and completes the
handshake for real. The browser boots lazily on the first tool CALL, so
initialize and tools/list cost nothing but a node process.

### What the handshake was not saying

- **No `instructions` at all.** That field is part of the initialize
  result and is what a client puts in front of the model BEFORE its
  first call. The tool list cannot do that job: `jbh_howto`'s
  description has read "START HERE" from the beginning and nothing made
  anyone start there, which is how a track got bounced with six of
  seventeen checks run. It now carries six things, each one measured
  elsewhere in this file.
- **`version: '1.0.0'`** while the app was on R255 — information a
  client cannot use and cannot notice is wrong. It is parsed out of the
  built file now, so the handshake says which app it is driving.

### Six calls had no tool, and one of them was the headline feature

`jbh_ensemble` did not exist. "Write every layer at once", asked for in
those words, had no tool — nor did `chop`, `bass`, `instPads`, `phrase`
or `checkMix`. And `jbh_infill`'s schema forwarded **nine of the sixteen
options infill() reads**: `density`, `octave`, `feel`, `gate`, `scale`,
`shape` and `against` were all unreachable, including both levers added
in the session before this one.

The coverage test checks one direction — no forwarded name that the
function does not read. Nothing checked the other: no option the
function reads that is never forwarded, and no CALL that has no tool.
That check exists now, and it is driven off the **dispatch** rather than
tool names, because the mapping is not derivable from the name
(`jbh_load_preset` calls `preset()`, `jbh_inst_pads` calls `instPads()`)
and a name-matching first draft reported ten false gaps. Deliberate
omissions go in an `API_ONLY` map with the reason, and the test also
fails when that map goes stale — a name listed as unexposed that since
got a tool is a reason nobody will reread.

`jbh_call` can reach anything by name, so nothing was strictly
unreachable. That is not the point. A tool is what makes a call
discoverable and gives it a schema, and a headline feature behind an
escape hatch is a headline feature nobody finds.

**And three of the six schemas were invented.** Written from the call
signature rather than the body, `jbh_bass` got `note` and `secs` (it
reads `midi` and `seconds`), `jbh_chop` got `to` and `mode` (it reads
`floorDb`, `boredom`, `window`) and `jbh_phrase` was described as
copying steps when it shapes velocity and timing. All five bogus names
passed `mcp-coverage`, because its reverse check only walks the sound
GENERATORS. Read the options off `o.` in the body; the signature tells
you nothing.

### It loaded the app as a FILE, so no pack could ever load

This is the one that mattered most. The server did
`page.goto(pathToFileURL(findApp()))`, and **Chromium blocks `fetch()`
to a `file://` URL**. The app fetches its pack manifest and then each
sound, so over MCP:

```
jbh_pack -> pack did not load: file:///…/samples/salamander.json
```

and that took `jbh_packs`, `jbh_instrument` and `jbh_load_sound` with
it. An agent connecting to this server could use the 31 synthesised
presets and nothing else — including `nakeddrums`, the recorded kit this
file insists on for drums and says to load with `instrument()`. **The
central recommendation here was unreachable through the documented
interface**, and no test had started the server to find out.

It serves the app over HTTP from a tiny static server now, rooted at the
app's own directory so `samples/` sits beside it exactly as deployed,
bound to 127.0.0.1, path-confined. The browser suites have done this
from the start — it is the same few lines. 127.0.0.1 is also a secure
context, so the service worker registers and the offline behaviour
matches the real thing. Measured after: `jbh_instrument` lays four
salamander pads, `jbh_ensemble` offers three arrangements and writes 42
notes with 0 clashes, `gate` and `feel` and `poly` all arriving.

### The written layer had no onboarding either

Seven guided walkthroughs and not one touched `mlTonic`, `mlChords`,
`mlTagGo`, `mlOffer`, `mlApply`, `mlDemo` or `mlGenre`. The key, the
progression, TAG IT, OFFER/WRITE IT and the sixteen recipes were
invisible to the tour — and it is the panel that needs one most, because
by its own documentation it takes six decisions before it does anything.
`BUILD ME A TRACK` does those six for you, but a button that does
everything teaches nothing about doing it yourself, so the eighth recipe
walks the six. The guides suite had `cover.recipes === 7` hard-coded,
which is the right kind of test to have and the kind that has to be
updated rather than loosened.

**And the README did not mention the written layer at all.** Zero
occurrences of chords, progression, TAG IT, OFFER, infill, ensemble,
genre or recipe — the headline work of several sessions, absent from the
document a reader starts at. It also claimed 1.3 MB (it is 2), 81 unit
tests (144) and eighteen browser suites (27), and left `mcp/` and
`songs/` out of its own what-is-what table. Numbers in prose rot
silently; the suite count is in three places and was wrong in all three.

## Driving the controls is the only way to find these, and it misleads

Every fault in the two sections above was found by working the panel the
way a person does rather than by calling the API, and that is now the
third feature in a row where the API tests were green and the control
was broken. It is worth doing. But a probe that drives the DOM reports
its own mistakes as app faults, and in one walkthrough here **three
"bugs" were printed and all three were mine**:

- **A pad listens on `mousedown`, not `click`.** `padPress()` is what
  sets `S.editPad`, `S.seqPad` and `manualPad`, so `el.click()` on a pad
  cell selects nothing and every later step operates on whatever was
  selected before. This printed as *"TAG IT left the pad with no inst"*
  four times over, from a board where tagging worked perfectly.
- **A pad cell is BANK-RELATIVE.** `#padgrid .pad` holds sixteen cells
  and cell *i* is pad `S.bank*16+i`. Asserting against `S.pads[i]` after
  tapping cell *i* reads four empty pads on a board that opened on bank
  B. Record `S.editPad` after the tap and read *that* — the index you
  aimed at is not the index you got, and the app is the one that knows.
- **The analysers return NESTED shapes.** It is `m.got.{repeat, step,
  third, leap, range}`, `pu.onGrid.beat`, `pu.pulseStrength`,
  `c.motion.{oblique, contrary, par5, par8}`, `mo.pitchRecurrence` and
  `mo.norm.pitch`. Flat names come back `undefined`, which prints as a
  dash and reads exactly like a check that declined to measure.

And one that is not a mistake but looks like three: `S.patterns[n].len`
is **an array, one LEN per pad** (polymeter), not a number. `patLen()`
is the scalar.

So: tap with a real `MouseEvent('mousedown')`, read back what the app
selected instead of what you asked for, and **before reporting a fault,
reproduce it from the other direction** — the failing walkthrough above
had every genuine finding sitting underneath three phantom ones.

## Writing works with no connection. The app did not OPEN with no connection

Asked to guarantee the WRITE panel offline, the answer turned out to be
"almost everything already is, and the one thing that was not was the
app itself". Measured with the network really cut at the browser, not
mocked, because the failures are in the service worker and IndexedDB and
a mock exercises neither.

**What needs nothing.** Driven from a cold board with the network off:
the 31 presets load (they are generated in code, not fetched), TAG IT,
`key()`, `chords()`, `infill()`, `ensemble()` — OFFER and WRITE IT both
— and all five free checks, whose norms are baked constants
(`CP_NORMS`, `MELODY_NORMS`, `MOTIF_NORMS`), and `render()`, so a bounce
is possible too. Measured: 3 candidates offered, 40 notes written, pulse
0.778, oblique 90, harmony clean.

**What needs a connection: downloading a pack, and only the first time.**
Samples go into IndexedDB and `packHaveKeys` gates the fetch, the
manifest is cached under `__manifest`, and the worker caches every
successful GET — so a pack fetched once reloads offline. Measured: 183
sounds served with the network down. `pack()` throwing offline now names
the presets, because "no sounds available" is wrong by thirty-one.

**AND THE OFFLINE SHELL WAS EMPTY, for a reason worth the whole
section.** `cache.addAll()` is ATOMIC. `SHELL` contained `'./'`, which
404s on any server that does not serve a directory index — every
`python3 -m http.server`, and the test harness here — so the precache
rejected, that rejection went to `install`'s `waitUntil`, the install
failed, **the worker never activated** and the cache stayed empty:

```
cacheNames  ["jbh88-shell-v5"]          rootStatus  404
cached      { "jbh88-shell-v5": [] }    state "none" · controlled false
reload with the network off  ->  net::ERR_INTERNET_DISCONNECTED
```

GitHub Pages *does* serve `/` as an index, so the deployed site was
getting away with it. The failure mode is what matters: **one renamed
icon silently costs every bit of offline capability the app has**, and
the only symptom is that it does not open on a train.

And nothing could say so, because the page had
`navigator.serviceWorker.register('./sw.js').catch(()=>{})` — the bare
swallow this file already has a rule against, hiding the exact failure it
would have been added for. Each entry is cached on its own now
(`Promise.allSettled` over `cache.put`), a partial shell is REPORTED to
the page and into `errLog`, and DIAG carries an `offline:` line — shell
*n*/9, stored samples, cached pack — so "will this work offline" is a
question you can answer before losing the connection rather than by
losing it. After: `activated`, 8 of 9 cached with `'./'` still 404ing,
and the app reloads.

**Two lessons, both already in this file and both paid for again.** An
atomic operation over a list of files fails WHOLLY for one missing item,
so never precache with `addAll` — and `swShell` was first declared beside
the registration at the bottom of the file while DIAG reads it a thousand
lines above, which is the `refSpec` temporal dead zone for the third time.
A read before initialisation throws, and the throw would have taken the
rest of DIAG with it: the one output a person pastes when something is
wrong. It is declared next to `firedBad` now.

**The suite had an `offline.test.mjs` all along**, and it asserted that
the instrument keeps PLAYING with the network cut — sounds loaded, the
sequencer runs, the bounce is not silent. It never asked whether the app
opens. That is the shape to watch for: a suite named after the risk,
covering the half of it that was easy to reach.

### The fifth free check: do the notes fit the chords

`harmony({chords:[…]})` is the one question the other four cannot ask.
`melody()` and `motif()` measure a line against itself,
`counterpoint()` measures two lines against each other, and **not one
of them knows what the chord is**. So a part can score at the folk
norm for contour and recurrence, pass every mixing check, and sit a
semitone off the harmony in every bar. HOLLOWAY did, and the verdict
was "real structure but distasteful chordage".

It took the progression as an argument because **nothing in this app
stored one** — pads held samples, patterns held steps, and no key was
written anywhere. That is fixed: `key()` and `chords()` store it and
this reads it, as the section above describes. Pass `{chords:[…]}`
only to check a part against a progression you have not committed to.

What has not changed, and must not: it is never inferred from the
notes, because inferring the harmony from the notes is precisely what
makes a wrong note look correct. Declaring it is half the value — a
progression you cannot write down is one you have not decided.

**The rule is the minor ninth, not "outside the chord".** Most good
music is mostly non-chord tones, and a check that flagged them would
flag everything. What actually beats is a pitch sounding a SEMITONE
ABOVE a chord tone. That is the standard account of why the 4th is the
avoid note over a major chord — it is a semitone above the 3rd — and
why the 11th is fine over a minor chord, where the 3rd is a whole tone
below it.

That account came off theory websites, so it was measured against
Bach's 371 chorales the way every other norm here was
(`scripts/study-harmony.py`, `samples/harmony-norms.json`). It holds.
Across 179,005 sounding voice-pairs the semitone-or-minor-9th class is
**1.08%** — the second rarest thing in the corpus — against 16.1% for
the perfect fifth and 15.3% for the minor third. Bach is not avoiding
dissonance; the tritone is at 3.9% and the minor seventh at 3.8%. He
is avoiding *this interval*.

Two things the measurement changed. The major seventh is **0.79%**,
RARER than the semitone class — so it is not the safe contrast I had
written it as, at least not in four-part chorale texture, and the
claim came out of this file. And the bare semitone (0.36%) is half as
common as the compound minor ninth (0.72%): where Bach uses the
interval at all he tends to spread it across an octave, which is a
reason to be most suspicious of a semitone rub low and close — which
is exactly where HOLLOWAY's was, F♯2 against F2.

On HOLLOWAY's bass the check named four notes and let two pass:

| | |
|---|---|
| C♯ over Am | semitone above the ♭3 — **flagged** |
| A♯ over Am | semitone above the root — **flagged** |
| G♯ over C | semitone above the 5th — **flagged** |
| F♯ over F | semitone above the root — **flagged** |
| F♯ over Am | the Dorian 13th — allowed |
| B over F | the Lydian ♯11 — allowed |

**A ringing note is not the fault. Where it lands is.** This is the
part no theory book covers, because a theory book assumes a note stops
when it is written to stop. A chromatic approach on beat 4 is correct
walking-bass practice and the textbook reason it works is that it is
SHORT — but on a sampled piano with a 1.9-second decay in a
2.6-second bar it is not short, and it is still sounding when the next
chord arrives.

The wrong fix is to damp it. That ring is where the continuity in a
trio comes from; the bar lines stop being seams because something is
always still sounding across them. Shortening everything to fit its
own bar buys clean harmony and spends the legato. What a held note
owes is to land somewhere in the chord it rings into, and there are
two ways:

- a **common tone** — it belongs to both chords, and the overlap is
  pure glue;
- a **suspension** — it does not belong to the new chord, is heard as
  a dissonance on the downbeat, and *resolves by step* onto a chord
  tone just after.

`harmony()` counts the first in `carriedConsonant`, a number that
wants to be high, and does not report the second at all.

**How high is "high" is also measured.** Across 27,931 chord changes
in the chorales, Bach holds at least one voice through **77.9%** of
them, a mean of **1.53 of his four**. Holding across the change is the
norm, not an effect — but he holds one or two voices, not all of them,
and the distribution is flat: 22% hold nothing, 31% hold one, 19% two,
28% three. A sampled piano with a two-second decay holds *everything*,
which is past the top of that range, and that is why every note late
in the bar has to be chosen against the next chord and not just the
approach note.

**But a suspension has to let go.** The first version of this check
tested only "does the voice step onto a chord tone", and that made it
useless on the exact material it was written for: HOLLOWAY's F♯2
steps down a semitone onto F2 at the bar line, textbook, so it was
counted as resolved — while still ringing, so the two sounded
*together* for two more beats. That is not a resolution, it is a
semitone cluster in the bass, and it was half the complaint. A
suspension releases the dissonance as the resolution speaks. The
check now requires the dissonance to be over within a beat of its
resolution, and on this piano that means a chromatic approach is
simply never a suspension — which is the true answer for this
instrument.

**And the corpus says preparation matters more than resolution**,
which is the reverse of what this file first asserted. Asked which
voice of a semitone clash moves, the answer was 50% — the shape of a
number with two populations in it. Split by role: the **lower** note
steps away 72.5% of the time and the upper note only 27.3%, because
the commonest semitone clash in a chorale is a leading tone sitting
*under* a held note, not a suspension hanging over one. So "it
resolves" is a weak test. What separates Bach's semitone clashes from
HOLLOWAY's is where they came FROM:

| the upper note of a semitone clash | Bach |
|---|---|
| was sounding before, and was consonant then — a prepared suspension | **49.5%** |
| arrived new on the clash | 39.4% |
| was already clashing and goes on clashing | **11.1%** |

That last row is the rarest case in the corpus, about one voice-pair
in a thousand overall, and it is precisely what HOLLOWAY's approach
notes were doing: a chromatic that was a non-chord tone when it was
struck, still a non-chord tone when the harmony changed under it, and
never consonant at any point. Bach's dissonances are nearly always
notes that were *consonant a moment ago*. If a held note is going to
clash, it should have arrived as a chord tone.

**And play the third.** Roots, fifths and octaves state no quality at
all, so whatever chromatic happens to be in the bar becomes the note
defining it. The third and seventh are the guide tones; the fifth is
the one to drop. **94.6%** of Bach's sonorities state a third.
HOLLOWAY's left hand was root–fifth–octave in every bar — four bars of
four, no third anywhere, 0% — which is why one stray approach note
could sour the whole thing. The convention it should have followed is
root on 1, **third on 2**, fifth on 3, approach on 4.

**One exception, because the rule over-fires on a dominant.** A ♭9 is
by definition a semitone above the root, so E7♭9 resolving to Am — the
most ordinary cadence in a minor key — came back as a fault the first
time this ran on real music. The altered tensions ♭9, ♯9 and ♭13 are
what a dominant is for. The note that genuinely cannot go over one is
the natural 11, a semitone above the major third, and that stays
flagged — it is what Dm's fifth became when it rang on into E7.

### What those four actually say, on a track that is not broken

Worth knowing before you run them, because their findings sound like
style notes and are not. Every one of these came out of HOLLOWAY, each
cost one edit to a part, and none of them needed a render:

| it said | what was true | the edit |
|---|---|---|
| *100% of the gaps in this part are the same length* | the left hand was one root per bar — four whole notes a phrase | give it a walk: root, fifth, octave, chromatic approach |
| *70% of the gaps the same length* | `chord_pitches_improv` writes a pitch per step, and its step numbers are not a rhythm | keep each pitch in its bar, lay the bar out on a rhythmic cell |
| *repeated notes 1.6% against 21.1% in real melody* | having merged every repeat, the tune now had fewer than tunes have | cap a run at two rather than collapsing it to one |
| *oblique motion 0% against 68% in Palestrina — that is chords with a tune on top* | both hands moved on every beat, so neither was ever the one holding | the left hand holds in the odd bars and walks in the even ones |

Three things to take from that. The first is that **the two melodic
findings pointed in opposite directions** — too few repeats after a fix
for too many — so these are ranges to land inside, not directions to
push in. The second is that `melody()` and `motif()` will not report at
all on a part whose rhythm is too regular; "too regular to measure this
way" is a refusal, and underneath it the melodic checks are silently not
running. The third is that `counterpoint()`'s phrasing is literal.
"Chords with a tune on top" is a description of the part, not a grade,
and the fix is to let one voice hold still.

### Form is measured outside the app, by one script

`harmony()` closed the gap on whether the notes fit the chords. Phrase
structure was the same kind of hole: no analyser in the app asks how
long a phrase is or whether they are all the same length, and none
does now either — the app sees a schedule, and form is easier to read
off a score.

`scripts/midi-structure.mjs` reads a MIDI file and reports phrase
lengths, repeating units, harmonic rhythm and a letter-per-bar form
map. Run it on anything you can export. **Read its header first**: its
own phrase detector looked for silence, which is how a chorale marks a
phrase and is not how continuous music marks one, and it reported "one
phrase, 120 bars" on a dense track before the periodicity pass was
added.

**AND THE FIRST THING IT FOUND WAS NOT A FORM FAULT.** Run on three
genre builds it reported the identical range — `F1-A#2`, seventeen
semitones — for noir, house and dnb. **A span that does not vary with
the material is not a measurement of the material**, and the fault was
upstream of the script: `exportMidi()` wrote `pad.note`, which is the
MIDI-IN mapping and on a fresh board is just `36+index`. Four voices
sampled at 36, 48, 60 and 72 exported as 36, 37, 38, 39 — four octaves
crushed into four semitones. Anyone opening the .mid in a DAW got the
rhythm and not the music, and the export had no test at all.

It was corrupting the form analysis it was feeding:

| | with pad numbers | with real pitches |
|---|---|---|
| range | F1-A#2 | F1-G5 |
| noir repeating unit | *none found — through-composed* | **8 bars ×2** |
| dnb phrases | 1, length [24] | **10, 4 distinct lengths** |
| dnb harmonic rhythm | 100% | 87% |

A pitched pad exports its sampled note plus the transpose knob, which
is what the speaker plays and what every analyser reads. A pad with no
`srcNote` is a drum and keeps `pad.note`, because a drum track's note
number is a MAP SLOT rather than a pitch — adding the kit tuning there
would move the kick to a different instrument in the DAW.

This is the `schedule()` pitch-knob bug one level over, found the same
week: the pitch computed from the wrong source, everything downstream
faithfully wrong. **When a measurement comes out the same for inputs
that differ, suspect the measurement's input before its conclusion.**

Two things it reported that are NOT faults, recorded so the next
session does not fix them. House reads as one 24-bar phrase with no
internal boundary — house is relentless by design and the detector is
correctly reporting that there is no break. And harmonic rhythm sits at
87-100%, a chord change almost every bar. Both are legitimate choices,
and turning either into a target is this file's longest warning.

Measured from the same chorales, off the fermatas that mark their
phrase ends (`scripts/study-harmony.py` reports it):

```
2411 phrases, 6.52 per chorale
58 distinct phrase lengths
the commonest, 2 bars, is 39.7% — so 60% of phrases are NOT it
```

**THOSE LAST TWO NUMBERS DO NOT REPRODUCE, and the conclusion drawn
from them is weaker than it reads.** Measured again off the fermatas
in music21's 433 Bach scores (`scripts/study-form.py`), the same
method on the same composer gives **2534 phrases** — close enough —
but

```
at the 0.01-bar buckets the original used:  34 distinct, 2 bars = 60.1%
at half-bar buckets, which is musical:      14 distinct, 2 bars = 68.0%
```

Either way, **two-bar phrases are most of Bach's chorale phrasing**,
not 39.7% of it, and the sentence "so 60% of phrases are NOT it" comes
out backwards: about 60% of them ARE it. Bach's chorale phrasing is
overwhelmingly regular, which is what you would expect of a genre
setting metrical hymn stanzas.

The two measurements differ in their source — 370 kern files there,
433 music21 scores here — and that has not been run down, so this is a
disagreement rather than a correction. What matters is that the number
being quoted is not safe to write music against, and the argument it
was carrying has to stand on less: HOLLOWAY's **one** distinct phrase
length at **100%** is still more rigid than fourteen at 68%, but the
gap is nothing like "58 against 1".

HOLLOWAY has eight phrases. Every one is exactly four bars. **One
distinct length, 100%.** The arrangement varies dynamics and texture
across those phrases, which is why the level map now moves 12dB, but
the grid underneath never budges, and four-square is audible as
four-square however the surface is dressed. That is still a real
finding. It is just not the one Bach's chorales support most strongly,
and the honest comparison for a piece with a beat is probably not a
chorale at all.

Some of Bach's variety comes from hymn texts with uneven lines rather
than from free choice, so 58 lengths is an upper bound on what a
composer picks deliberately. It is still not one. If you are writing
here and the phrase length is a constant, that is a decision you made
by not making it.

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

**A sound is usually not one pad.** `instrument()` lays a sampled
piano across one pad per sampled note — eleven of them for a melody
spanning two octaves — and those are not eleven sounds, they are one.
`place()` and `audit()` took a pad index, so handed the middle one
they rendered a single note of the piano and set it against *the other
ten notes of the same piano*, which they had counted among "everything
else". A piano trio's melody came back `owns 250-500 by -6.1dB` — the
reading that means absent — in a mix where the piano is the loudest
thing in the room. Picking a representative pad does not rescue it:
the same code took the middle of the kit, landed on a hi-hat the part
never plays, and threw.

Both calls now take an instrument tag, a list of pads, or one pad, and
whatever they are handed is the sound:

```
await JBH.place('rh')      // every pad tagged rh, as one sound
await JBH.place([4,5,6])
await JBH.place(bassPad)   // still works
```

So on a track built with `instrument()`, pass the name. On one built
with `sound()`, tag the pads first — `pad(i,{inst:'bass'})` — which is
the same fix the found-sound section asks for, and for the same
reason.

## A thrown note is a silent note; a thrown TICK is a broken app

From a DIAG off a real device, eight times in one second:

```
errors: NotSupportedError: Events are overlapping @10567
```

`setValueAtTime` throws when it lands inside a scheduled
`setValueCurveAtTime` span. The swell's gate tested `outDur-att`, and the
span the curve really occupies is `relStart-attEnd`, which is
`outDur-relT-att` — **the release was not in the guard.** A note shorter
than its own release passed the test, `span` was clamped up to the 0.02
floor the API needs, the curve then ended AFTER `relStart`, and the
release event landed inside it.

**The throw mattered far more than the envelope did.** The source is
connected and started AFTER that line, and the exception escaped
`chord.forEach` in the sequencer tick — so the remaining pads in that
step never fired and the step being drawn never finished. The report was
"it glitched hard visually and audibly", which is what a dropped tick
looks like and not what a wrong envelope sounds like. One bad note took
out everything scheduled behind it.

So there are two layers now, and they do different jobs:

- the **gate** is the fix: `swSpan = relStart-attEnd` and the swell only
  runs when there is more than 0.05s of it.
- `fireSafe()` is the **guarantee**: `triggerPad()` throwing is
  survivable, the tick abandoning its step is not. It wraps the two live
  sequencer call sites and the offline render loop, where a throw
  otherwise loses the whole bounce twenty minutes in for one bad note.

**Both report. Neither swallows.** A bare `catch(e){}` on the release
pair would have hidden the exact fault it was added for, and `firedBad`
is in DIAG so the next fault of this shape is visible rather than
inferred from a stutter.

### It takes `lk.len` to reproduce, and the first test did not have one

The regression test drove the real sequencer at 174bpm with a swell on
every step and a 0.45s release, and **it passed against known-bad
code** — which makes it not a regression test.

`outDur` is `sliceDur/rate` capped by `lk.len`. With a 1.2s sample and no
cap, `outDur` is 1.2s, there is room for any release, and the fault
cannot happen. It is the note-length lock that makes a note shorter than
its own release — and `infill()` writes one on every note it generates,
as `beats`. That is why a generated dnb part at 174bpm hit this and a
hand-drawn pattern never did: a sixteenth is 86ms at that tempo and the
generated note lengths are shorter still.

With `len:0.17` in the lock the test reports **8 overlap errors against
known-bad code — the same count as the device DIAG — and 0 against the
fix.** Run a new check against a known-bad input before trusting it;
this is the third time in this file that advice has paid.

And the test asserted the transport first for the same reason: the first
draft read `S.playing`, which does not exist (`playing` is a bare
top-level binding), got `undefined`, and the two assertions underneath
passed on a sequencer that had never started.

### The same shape is in the bow path

`nenv.gain.setValueAtTime(lvl2, when+dur)` sits inside the slur's
up-curve `[when, when+xf]` whenever a note is shorter than the slur, and
a throw there loses that voice's connect and start exactly as the amp
envelope did. Clamped to the end of the curve and wrapped. **Suspect this
shape anywhere a curve is scheduled and a discrete event follows it** —
the two places found here were written months apart and neither knew
about the other.

### And an UPLOADED file has no manifest at all

Everything above is wired to the `onset` field in a pack manifest, so
none of it reached the commonest case there is: a person uploading their
own sounds. `start` stays 0, and a file with 150ms of head before the
hit opens its gate on silence exactly as `fk:type` did.

Measured on the same audio twice, once with 180ms of silence welded on
the front, so the only difference between the two pads is the thing
being measured:

```
before   clean  -10.1 dBFS     late  -120 dBFS   (silent)
after    clean  -10.3 dBFS     late   -10.8 dBFS
         clean start 0 (untouched)  ·  late start 0.334
```

`leadSilence(buf)` is what the build now runs on every pad it claims,
voices and kit alike, and it **reports the trim** — a trim nobody
mentioned is indistinguishable from a sample that was always fine.

**IT IS NOT AN ONSET DETECTOR AND MUST NOT BECOME ONE.** That is the
whole reason it is safe to run unasked. `loudestOffset()` beside it
finds the LOUDEST window, which on a sound that swells is a second in,
and trimming to there would cut the attack off a pad. This asks only
"where does the file stop being silent", at −45dB against the file's own
peak, and returns 0 unless that point is past 25ms — so a sound that
starts immediately is left byte-identical, and the claim it makes is
narrow enough to be true of anything.

**Two fixture mistakes, and the first one nearly read as a broken fix.**
The test buffer was pushed to `S.buffers` BEFORE the `bass()` call that
set up the pad, so `S.buffers.length-1` named the buffer `bass()` had
just appended; the pad held a perfectly normal sound, the trim correctly
found nothing, and `start` stayed 0 — which looks identical to wiring
that never ran. `leadSilence()` was then checked in isolation first (0
on the clean buffer, 0.177 on the late one, first non-zero sample at
0.180) and the fault was in the test. **Verify the unit before
debugging the integration**, and build the known-bad case so that the
only difference between the two sides is the thing being measured.

## One dynamic's worth of alternates is not dynamics

AGENTS.md has said from the start that `nakeddrums` is "five velocity
layers on the kick, three round robins" and to load it with
`instrument()`. **Four of its five drums got that and the snare did
not**, for a reason that was in the mode DECISION rather than the layer
picker, which worked throughout.

A pack can carry two different things per note and they are not
interchangeable. DYNAMICS are recordings at different velocities and
velocity should choose between them. ALTERNATES are round robins — takes
of the SAME dynamic — so a repeat is not the same waveform twice. The
decision asked `rr>1 && n>=rr*2`, meaning "is there more than one
velocity band here", and fell back to `vel` when the answer was no.
`vel` splits the velocity range across whatever samples exist, so for
one dynamic's worth of alternates velocity switches WHICH TAKE instead
of how hard, and every repeat at one velocity is identical.

Measured, by firing `pickLayerIdx` eight times at a fixed velocity:

```
kick, hats, ride, tom   velrr   3,4,5,3,4,5,3,4
snare                   vel     2,2,2,2,2,2,2,2      <- all three samples
                                                        recorded at vel 0.504
```

That is exactly what `pickLayerIdx`'s own comment says `velrr` exists to
prevent — "a hi-hat struck sixteen times in a bar was sixteen identical
waveforms" — happening to the loudest thing in a backbeat.

Count the BANDS, not a threshold: `floor(n/rr) >= 2` and the velocity
really does mean dynamics; exactly one band and the samples are
alternates, which is what plain `rr` is for, cycling and ignoring
velocity because there is no dynamic information in them to read. The
snare reads `0,1,2,0,1,2,0,1` now.

**The regression to protect is the opposite case**: a sampled piano has
dynamics and no round robins and must keep selecting by velocity.
`layerModeFor()` is in `src/pure/sfz.js` with that case tested, because
**this pack is fetched over HTTP and no browser test ever loaded it** —
the kit this file recommends was itself unverified, which is how the
snare went unnoticed through every bounce.

**And my own probe perturbed the thing it measured.** Reading the
velocity sweep for a `velrr` pad gave `2,0,4,5,3`, non-monotonic, which
looks like a scrambled velocity map and is not: `pickLayerIdx` advances
the round-robin counter on every call, so sweeping velocities through it
also advances the take. The snare result stands because `vel` has no
counter to advance. If a chooser has state, a probe that calls it
repeatedly is changing the answer.

**And tape() is the wrong call on a velocity-layered kit anyway.** It
reads ONE buffer off the pad and writes one back. `nakeddrums`' kick
pad is five velocity layers by three round robins — fifteen separate
recordings of a beater hitting a head — and that layering is the whole
reason the kit sounds like drums rather than like a drum machine. The
wobble is worth having on a single-sample mallet or a pad. On the kit
it would buy a tape artefact and spend the instrument.

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

**The collection holds two, and both are compromised.**
`ref-ambient-hall.json` was generated by the user with another AI music
app; `ref-solo-piano.json` is a bounce from THIS app, which is exactly
the circularity this section warns against, and its own file says so.
So for anything that is not ambient or a solo keyboard the advice above
has little to act on.

**AND THE LIBRARY COULD NOT GROW, FOR A REASON THAT WAS NOT THE
MEASURING.** `reference()` has decoded audio into a nine-band profile
all along, and the MIX TOOLS help has always said "load a finished mix
with `reference()` first" — an API call the interface never offered.
`compare()`, `balance()` and `audit()` were reachable only from a
terminal, so in practice none of them ever ran, and nothing said so:
REVIEW reported "nothing serious" on a mix whose tonal balance had not
been looked at.

There is a control for it now, on MIX TOOLS beside REVIEW and BALANCE: a
picker listing the profiles that ship with the app plus any the person
has made, **MEASURE A TRACK** which turns a file they pick into a saved
nine-band profile, and an export so a good one can come back here as
`samples/ref-*.json`. With nothing loaded the line under it reads *"No
reference loaded. compare(), balance() and audit() cannot run"* rather
than staying blank.

**That is the fix a session can make; the profiles are not.** Outside
audio is not reachable from a cloud session — measured, not assumed:
only `raw.githubusercontent.com` and `storage.googleapis.com` answer,
while `upload.wikimedia.org`, `archive.org`, `cdn.freesound.org` and
`opus-codec.org` are all denied. And the rule above still stands: do
not invent band numbers. A reference has to be measured from a record
someone actually chose, which means the person using the app, not the
session writing it.

**A second temporal dead zone, found the same way as the first.**
`refSay()` read `typeof refSpec` to decide what to print, and `refSpec`
is a `let` fourteen thousand lines further down — `typeof` is safe on an
UNDECLARED name and not on a declared-but-uninitialised one, which is
the only case it throws. The status line came up blank, and the reason
was sitting in `errLog` ("Cannot access 'refSpec' before
initialization") because the catch around it reports instead of
swallowing. It takes the spec as an argument now. Nothing loads a
reference automatically, so at boot the answer is always "none" and no
read is needed. HOLLOWAY is a piano trio, and measured
against that profile it reads

```
20-60   +5.2    250-500  +3.8    2k-4k   -7.3
60-120  +5.5    500-1k   +4.8    4k-8k   -8.3
120-250 +5.3    1k-2k    -1.9    8k-16k  -5.1
```

— five decibels hot through everything a piano's body does and eight
down through everything a hall's air does, which is not a verdict on
the mix, it is the difference between a piano trio and an ambient
record. Chasing it would take four decibels out of the register the
piece lives in and put eight into a band a piano has little in. So it
was bounced with no reference and `compare()` did not run.

(The first draft of this paragraph said "told its left hand is 15dB
too loud". Nobody had measured that; it was a plausible number written
to make a point, and the real figure is +5.5. The habit this file
keeps warning about is easy to fall into while writing the warning.)

Do not paper over that by loading the wrong one, and do not invent
band numbers — a fabricated reference is worse than none, because
`balance()` will solve a real mix against it. The route the file
already gives is the right one: `scripts/reference-profile.mjs <file>`
measures any local audio and writes a profile, so one recording of the
kind of thing you are making, measured once, fixes this permanently
for that genre. What it must not be is one of this repo's own bounces,
which only propagates whatever is already wrong here.

## audit(sound) — did the sound come out the way you meant it to

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
                                // or audit('bass') for a sampled
                                // instrument, which is many pads
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

**Read that level map for the opposite fault too, which it will not
flag.** HOLLOWAY's first bounce came out between −17.8 and −19.7dB in
every single window — eighty-four seconds at one level — and the
checker's verdict is `ok level varies 2dB across the piece`, because
it tests for a hole, and a flat piece has no hole. It passed and it
had no arc: the arrangement alternated a "full" and a "sparse"
pattern, but only the kit thinned between them, and the kit is not
what you hear. The piano played the same part at the same velocity
from end to end.

The fix is written as music, not as a master setting: the same phrase
at three dynamics in three pattern slots, the quiet sections keeping
only the melody notes that land on a beat. On a sampled piano that is
also a timbre change rather than a level change, since velocity picks
a different recording — which is the whole argument for velocity
layers, used for expression rather than just for realism.

So the question to ask of the level map is not only "is any of it
empty" but "does it go anywhere". Nothing in this repo answers the
second one.

Run it before sending anything to anyone. And note that it was
validated against a known-bad file before being trusted, which is how
three bugs *in the checker* turned up — a regex that matched the
first per-frame line instead of the summary and reported -70 LUFS for
a -16.1 file, and two checks testing for field names this ffmpeg
never prints, which therefore ran silently and passed silently. A
checker nobody has run against a known-bad input is not a checker.

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

**This paragraph claimed that for months while the function had about a
third of the technique in it.** Asked directly whether the features
matched, the answer had to be no, and finding that out took one clone
and one read of `docs/manual.md` in their repo. What was missing:

- it compared blocks on **eight** log-spaced bands. Samplebrain uses a
  hundred frequency bins, or MFCCs, or a blend. Eight numbers cannot
  separate blocks that a hundred separate easily, so everything matched
  "near enough" — which is how a rebuild comes out as mush. By far the
  largest of the gaps, and the least visible.
- no `synaptic` or `slide` search. Those are not speed optimisations.
  The manual says synaptic makes the output change on each repetition
  of the target, and that slide "unpredictably warps the timing". Both
  are sound-defining and both were absent.
- no autotune, no separate brain and target block sizes, no adjustable
  overlap or window, no frequency subrange, no search stretch, no
  brain/target mix, mono only.

All of that is in now, so the parameters are:

| | |
|---|---|
| `bins` 4-100, `mfcc` 0-1 | how finely two blocks are told apart. Defaults are 32 and 0.35, which is 45 dimensions against the old 8. `{bins:8, mfcc:0}` is the old matcher |
| `binRange [lo,hi]` | compare only that slice of the bins |
| `algorithm` | `basic`, `reversed`, `synaptic`, `slide` |
| `synapses`, `slideError` | neighbours to check; the dB error that makes slide hold a block |
| `novelty`, `boredom`, `stickiness` | bias against what is used, how fast that decays, whether to keep a run of the source intact |
| `blockMs`, `brainBlockMs` | separate on purpose — their manual says so under each heading |
| `overlap`, `window` | `hann`, `rect` or `dodgy` (their legacy linear fade) |
| `autotune` | bend the chosen block toward the target's pitch |
| `stretch` | repeat each target block. This LENGTHENS the output |
| `targetMix`, `stereo` | mix the target back in; search L and R separately |

**The lesson is not about this function.** The comment above it was
headed *WHAT READING THEIR MANUAL CHANGED* and listed four real fixes
taken from that manual. Someone did read it, acted on the first four
things, and wrote the result up in the past tense — and that write-up
then stood as evidence the implementation had caught up with the thing
it names. Reading a manual and implementing what it describes are
different events. If you fix some of what a document says, say which
some.

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

## This file has been tested by use, and that is how it should be read

`songs/holloway.mjs` was written as a test of this document rather than
of the app: build a track from nothing but what `howto()` and this file
tell a reader who has never seen the repo, and write down every place
the instructions proved insufficient. Four did, and all four are fixed
above rather than listed here:

- `howto().says`, the one line a reader who reads one line gets, still
  summarised the whole file as a mixing procedure. Followed exactly it
  produces a well-balanced drone, which is the failure the rest of the
  file exists to prevent.
- `place()` and `audit()` took a pad index, and a sampled instrument is
  one sound spread over a pad per note — so the headline method,
  `place()` each sound as it goes in, measured one note of a piano
  against the rest of the same piano. The melody read −6.1dB, meaning
  absent; by instrument tag the same audio reads +12.4dB.
- `audit-pitch.mjs` condemned a correct library, because two of its
  three picks were the top and bottom notes its detector cannot hear.
- the one reference profile in the repo is ambient, so for anything
  else the advice to always load one has nothing to act on.

Two of those were in calls written *in this repo to prevent exactly the
mistake they then made*, which is the argument for the exercise. A
document about a tool is only true of the version of the tool it was
written against, and the cheapest way to find where it has drifted is
to follow it literally and record every place it does not work. If you
are reading this a long way downstream: do that again, and add what you
find to the section it belongs in rather than to a list at the end.

## The corpus does not reduce to a table, and two shapes had to fail first

`src/pure/recipes.js` shipped with every recipe reporting
`patternsMeasured: false`, because its drum patterns were a table like
`kick:[0,16,32,48]` — somebody's idea of what house music does. The
corpus that would settle it was already half-used here:
`scripts/study-groove.py` reads the Groove MIDI Dataset, 1,150
genre-labelled performances by ten drummers to a metronome, and took
only the TIMING from it.

Taking the patterns too turned out to be three different jobs, because
the two obvious shapes for the answer are both wrong.

**Per-step probabilities are flat.** Averaged over 334 rock takes the
snare reads 20–34% on every one of sixteen steps. Written onto a grid as
sixteen independent draws that scatters snare everywhere, because the
steps inside one bar are strongly correlated and a marginal discards
exactly that. The average of many grooves is not a groove. This was the
shape the old `patternsMeasured: false` comment promised, and it would
have been worse than what it replaced.

**Exact whole-bar patterns are diffuse.** It takes 1,533 distinct
kick/snare/hat combinations to cover half of rock's 6,296 bars, and the
commonest single bar is 3% of them. Fill takes looked like the cause —
647 of the 1,150 are labelled `fill` — and excluding them removes 70
bars out of 6,366 and moves no figure by more than a point, because a
fill take is a groove with a fill at the end. Human drummers vary nearly
every bar and that is not an artefact to be filtered away.

**One voice over one bar is the level that concentrates.** Rock snare is
the backbeat on 26% of bars, hiphop snare on 34%, afrocuban kick is
four-on-the-floor on 20%. So the output is a library of real bars, each
carrying the share of the corpus it holds — which is what
`src/pure/contours.js` and `infill()` already do for rhythm. The library
stops being composed.

### What validated it was the figures nobody asked for

Everything rests on tick 0 being a bar line. Every take was played to a
metronome at a stated tempo, so that is a reasonable assumption and the
generator refuses to write the file unless rock's commonest snare bar is
the backbeat and its commonest kick bar hits the downbeat.

Those two it was told to expect. Three it was not came out anyway: jazz
hi-hat on 2 and 4, the swing ride as `x...x..xx...x..x`, and reggae's
one drop — a single kick on beat three — on 23% of reggae kick bars.
Finding conventions nobody encoded is much better evidence than passing
the check that was written for it.

### A corpus bar is not a loop

A bar in the table is a bar in CONTEXT: the drummer dropping out,
building up, ending a phrase. Those bars are real and legitimately
sparse, and looping one is nonsense. The tell was that the second
commonest rock kick bar is a single hit on beat two at 6.4%, which is a
pickup and not a groove.

Misalignment was the first suspect and was measured rather than assumed.
Scoring each take's four possible rotations by snare-on-the-backbeats
and kick-on-the-downbeat: 84% of the takes that can be decided start on
a bar line, 11.5% are off by a half bar and about 5% by an odd beat.
Nowhere near enough to explain it, so the sparse tail is the corpus
telling the truth about itself.

(That measurement needed two attempts. Scored on the backbeat alone,
nothing was ever decidable, because `{4,12}` maps onto itself under a
half-bar shift — rotations 0 and 2 score identically by construction. A
test that returns "no answer" for every single input is reporting a bug
in itself, not a property of the data.)

The filter is therefore a musical judgement and lives at SELECTION time,
in `figureFor()`, not in `grooves.js`: a figure is loopable if it marks
the bar on its own (two hits or more) or if one hit a bar is
demonstrably the figure rather than a dropout, which a large share is
the evidence for. Hit count alone cannot separate them, because the one
drop is a single hit and IS the figure. Keeping the table as pure
measurement and the judgement beside it is what makes both readable; a
table with the judgement baked in has no way to show what was measured.

### Sometimes the honest answer is that there is no figure

Reggae's best loopable snare bar holds 1.8% of its bars and jazz's 2.9%,
which means 97% of the time the drummer played something else. Calling
either "the measured snare figure" is the overclaiming this whole layer
exists to avoid.

So a voice is refused unless its best loopable figure holds at least 4%
of the style's bars, and the caller composes instead and reports that it
composed. The floor is absolute AND the spread within a voice is
relative, because either alone fails in a different direction: an
absolute floor punishes the best-sampled styles, since rock's shares are
low because the category is broad rather than because the playing is
vague; a purely relative test accepts anything that beats the other
candidates, which is how 1.8% would have got in.

The upshot is that `patternsMeasured` became a map rather than being
flipped to `true`. Kick is measured for all 13 styles, snare for 10, hat
for 11, and every pitched part is still composed — one flag would have
said something true about the hat and false about the bass.

### Velocity is comparable within a voice and not across voices

Carried over raw, the velocities put a reggae kick on the grid at 0.26
under a snare at 0.90 — the shape of a complaint this repo has already
written down twice, where the sound is not quiet but barely being
played.

The table says why. Kick figures average between 0.21 and 0.92 depending
on style, while snares sit at 0.9 to 1.0 in ALL THIRTEEN styles. Every
drummer in every style hitting the kick far softer than the snare is not
a fact about music: a kick pedal and a struck mesh head are different
sensors on one electronic kit. Whatever the cause — which this has not
established — that offset belongs to the capture and must not be carried
onto somebody else's samples.

Each figure is therefore scaled by its own loudest stroke, so what
survives is the shape inside it: the ghost note under the accent, which
is the only reason to carry velocities at all.

Scaling by the loudest stroke of the voice across the whole style was
tried first and preserves one more real thing — a busy sixteenth kick
genuinely is played lighter than four on the floor, within the one
sensor. It is still wrong here, and a test found it: seed 16 wrote a
kick peaking at 0.29, because that figure really is a third of the
hardest kick in its style. A recipe loops ONE figure per voice, so the
loud figure being measured against is not in the track to be louder
than. If figures are ever varied across sections, the style becomes the
right reference again.

## Counting up from 1 explored one corner of the space

`makeRecipe(seed)` seeds a xorshift directly from its argument:

```js
let rs = (seed >>> 0) || 0x9e37;
const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
                    return (rs >>> 0) / 4294967296; };
```

A bare xorshift returns very small numbers for its first few draws from
a small seed. Measured over seeds 1 to 199, the first draw had a mean of
**0.006** — so `pick(FAMILIES)`, which is the first thing a recipe draws,
chose `FAMILIES[0]` for ALL 199 OF THEM. Every recipe anyone made by
counting up from 1 came out slow, and because the measured drum style is
then chosen by tempo, only three of the thirteen styles could ever be
reached. A UI counts up from 1, so this was the common case and not an
edge.

Mixing the seed before use (splitmix-style, then xorshift) takes that
mean to 0.465, and over 4,000 seeds the four families come out uniform
on a chi-square test. Warming the generator by discarding its first few
draws was tried and is not needed; discarding exactly one draw measures
worse than discarding none, and the uneven-looking 65/45/42/47 over the
first 199 seeds is small-sample noise.

**The test suite was green throughout.** It asserted that a recipe is
reproducible from its seed and that it VARIES between seeds, and both
were true — consecutive seeds differ in their later draws. Variety and
uniformity are different properties and only one of them was being
checked. The new test measures the distribution of families over 400
seeds against a deliberately loose chi-square bound, because the job is
to catch a generator stuck in one corner (the real bug scored about
1200) and not to certify an RNG.

## An option read one layer down is reachable from nowhere

`tests/mcp-handshake.test.mjs` checks that every option a function reads
is forwarded by its tool and declared in its schema — the reverse of the
`jumble` check in `tests/mcp-coverage.test.mjs`, and the thing that
catches an option you can set from the console and not over MCP.

It scans `src/legacy.js` for `o.<name>` inside each API method. But
`recipe()` hands its whole options object to `makeRecipe(seed, o)` in
`src/pure/recipes.js`, so every option that function reads is a
`recipe()` option and NONE of them appear as `o.` in `legacy.js`. The
check was blind to family, bpm, feel, density and style alike. It stayed
green while `style` was reachable from the browser console and
unreachable over MCP, which is precisely the gap the test exists to
close.

Found by adding `style` and noticing the suite did not care. The check
now follows an options object passed wholesale into a function exported
from `src/pure` and counts that function's reads as the method's,
verified the way the `jumble` case was: by taking `style` back out and
watching it fail.

## An AI that is never told reads exactly like an AI with nothing to say

The app could already hold a conversation. `MVX.say()` carries a line
from the person to whatever is driving, `MVX.tell()` carries one back and
shows it in a transcript and on the LCD "because a reply nobody notices
is not a reply", `MVX.peers()` refuses to report "sent" when nothing is
on the other end, and the whole link is off until switched on and off
again on reload. It is a careful piece of work.

Two things stopped it being a producer, and both were absences rather
than bugs.

**It could not notice.** `jbhEmit()` had exactly two callers — `say` and
`ping` — so nothing about a take finishing, the transport rolling or a
pattern changing ever reached the other end. An AI asked to produce
would have had to ask "did you record something?" every few seconds,
which is interviewing, not watching. It is the same shape as a check
that silently did not run: an AI that is never told reads exactly like
an AI with nothing to say.

`jbhNotify()` now delivers twice, because the two kinds of client cannot
both be served by one. A same-origin tab gets a push over the link,
which is what live feedback wants. An MCP client cannot be pushed to at
all — request/response, in another process — so the same events land in
a 200-entry ring buffer it polls with `events({since})`. Writing only
the push would have left the MCP half with no way in.

**And none of it was reachable from a tool.** There was no `jbh_say`,
`jbh_tell`, `jbh_messages`, `jbh_listen` or `jbh_peers`. The entire
conversational surface of the app was reachable from the browser console
and from nowhere an agent actually lives.

### Why the test that exists to catch that did not

`tests/mcp-handshake.test.mjs` asserts that every app call has a tool or
sits in `API_ONLY` with a stated reason. It finds the API by slicing
`src/legacy.js` between `window.MVX={` and `window.JBH=window.MVX;`.

Ten methods are added after that line as `window.MVX.name = function`,
and the slice contains none of them: `say`, `tell`, `messages`, `peers`,
`listen`, `ping` and the rest. So the check saw an API with a hole in it
exactly the shape of the feature that was missing, and stayed green.

Widened to include the later assignments, it immediately named five
calls with no tool and no reason — `calls`, `say`, `ping`, `sessionFile`,
`loadFile` — and the widening carries its own assertion that four known
late methods are in the parsed set, so a future narrowing cannot quietly
undo it.

Four of those five are deliberate omissions and now say why. `say` is
the interesting one: it writes into the person's own transcript labelled
as them, so an agent calling it would be putting words in their mouth in
their own UI. `jbh_tell` is the agent's half; this half is theirs.

This is the second blind spot found in that one test in a day. The other
was options read one layer down in `src/pure`. Both are the same
mistake: a parser that is wrong about where the thing it checks ENDS
does not report faults, it reports nothing.

## Fifteen green tests on synthesised audio, and wrong anyway

`src/pure/take.js` measures a take somebody played, which the rest of
the check layer cannot: `pulse()`, `melody()`, `motif()` and `harmony()`
read the SCHEDULE — the steps the sequencer is going to play — and a
TRAX take is audio off the mic bus.

The first onset detector asked whether an RMS window was 1.8x louder
than the window before it. It passed fifteen tests built on synthesised
hits, including ones for a sustained note, a ragged attack and room
tone. Then it was run against twelve real ESC-50 clips whose onsets
`samples/foundkit.json` declares, and put the declared onset among those
it found **four times out of nine** discrete events.

A single neighbouring window is not a baseline. A hit arriving over
three windows never shows a big step between any adjacent pair, and a
noisy floor produces enormous ratios between two quiet ones. Replaced
with the rise in LOG energy, peak-picked against a LOCAL median plus a
margin, it gets six of nine — and the three it still "misses" turned out
to be the point.

### The manifest was wrong, not the detector

At the onset `fk:snare` declares, the audio is 73dB below that file's
own peak and the real attack is 107ms later. `fk:can` is 68dB down with
its attack 150ms later. `fk:hat` has no transient within 400ms of its
declared value. `fk:tom` points past its own first event, and in
`darkkit`, `dk:glass` lands in digital silence.

AGENTS.md tells you to read that field and set a pad's `start` from it,
because an ESC-50 clip is five seconds long with the event somewhere
inside. That advice is right, and a pad trimmed to one of those five
values opens on room tone and measures about −70dB in the mix — which is
the exact fault the section two above it describes, produced by
following the section. The cure was the cause.

`scripts/audit-onsets.mjs` measures a manifest against its own audio and
exits non-zero if any declared onset sits in near-silence while the file
becomes audible clearly elsewhere. Both conditions are required: a clip
can be quiet at its onset and rise smoothly, and a clip that is loud
from sample zero has no onset to trim to, which the script reports as
its own answer rather than as a fault — six of the twelve are field
recordings that simply start. The five real ones are fixed in the
manifests.

**Synthetic tests assert the thing you already believe.** Fifteen of
them agreed with me and the detector was still not good enough to ship;
one directory of real recordings disagreed, and the disagreement was
worth more than all fifteen. Where a corpus or a pack is reachable, test
against it.

## A take is late or it is loose, and those are different problems

`takeTiming()` reports a constant offset and a spread separately, and
collapsing them would waste the measurement.

A player sitting 30ms behind the click for a whole pass is TIGHT: the
offset can be nudged in one move and nothing needs playing again. A
player averaging zero with a 60ms spread cannot be fixed by moving
anything. Reporting a single "average error" would rank those two the
same, and they call for opposite advice.

This is the lesson `scripts/study-groove.py` had already learned on the
corpus. Its first run reported every metrical position early by about
the same 9.3ms, which is not a micro-timing pattern — it is a constant,
either a drummer sitting ahead of the click for a take or latency in the
capture, and it swamps the shape being looked for. De-meaning each
performance against itself is what left only the thing being asked
about.

And tight is judged against **0.075 of a sixteenth**, the median human
micro-timing across those 1,150 performances, rather than against zero.
Zero is a machine. This repo already knows the neighbouring version of
that mistake: `pulse()` scores a human drummer ~100% because its
tolerance is five times wider than the deviation being measured, so
"sixteenth 100%" was never evidence a track was robotic.

## WRITE never listened to the pad it was writing for

`src/pure/timbre.js` was added to measure what a sample can actually do:
how long it takes to speak, how long it rings, and the narrowest gap it
can be played at. Its own header described the problem it existed to
solve — that `infill()` and `ensemble()` know an instrument's PITCH and
nothing about its SOUND, because `mlVoices()` reads `p.srcNote` and
nothing else, so a 90ms pluck and a two-second bowed swell get identical
parts.

Then nothing called it. `timbre`, `minGap` and `playable` appeared in
exactly two places in `src/legacy.js`: the `timbre()` method itself and
an error message in `fit()`. The write path never asked.

That is this repo's most repeated mistake — a capability with no way in —
and this was the version where the capability existed, was tested, was
documented, and sat one function call from the code that needed it. The
module header even said what the consequence was. Writing the thing and
wiring the thing are two jobs and only the first one feels finished.

### What it took

A cell in the library is `[step, beats]` pairs, so the tightest gap in
one is the smallest distance between consecutive onsets, including the
wrap into the next bar because cells repeat. An `arp` cell puts notes two
sixteenths apart and a `bass` cell four to six. `minGap` is already in
sixteenths, so "can this sound play this cell" is a comparison and not a
new measurement.

Measured in the browser, same role, same tempo, same seed, two sounds
differing only in attack:

```
pluck  5ms attack   minGap 1   3/3 arp figures fit
swell  235ms        minGap 5   0/3 arp figures fit
```

and the swell's report reads: *takes 235ms to speak and every arp figure
puts notes closer than the 5 sixteenths (500ms) it needs at this tempo.
The loosest one was used anyway. Write it slower, take the tempo down, or
trim the pad's start — or pick a quicker sound for this part.*

`ensemble()` calls `infill()`, so one fix covered both, and `CELLS[`
appears exactly once in the file so there was no second generator to
keep in step.

### Filtered, not forced, and it still writes

The role and the tempo are the person's decisions and so is the sound.
When no cell in the library suits it, refusing would be wrong — this call
OFFERS candidates, and a sound that is marginal at this tempo is still
the one they chose. So the loosest available cell is used, the part is
written, and the report says what it heard and names the fix.

That is the line the longest section in AGENTS.md draws. Whether a note
is shorter than its own attack is BROKENNESS: it is not a quiet note, it
is no note. Whether a 235ms swell belongs in a 150bpm arp part is TASTE,
and the app does not get a vote.

The ring is reported the same way and is not filtered on at all, because
overlap is sometimes the point — a trio holds its bar lines together with
it. It is said out loud when a sound rings more than twice its gap, with
the consequence attached: glue in a trio and mud in a fast part, and
every note late in a bar has to land in the chord it rings into.

### The stale claim was the tell

`timbre.js`'s header still described WRITE as knowing nothing about
sound, in the present tense, after the wiring made it false. A document
read on every turn carrying a claim that is no longer true is worse than
one that says nothing, because the next session will believe it and
rebuild what already exists. It is corrected, and the correction says
when it changed and what the measurement was.

## Eighteen calls an agent could use and would never hear about

The MCP server exposes 73 tools, each with a careful description, and no
agent reads 73 descriptions before deciding what to do. It reads the
handshake instructions, which say *call jbh_howto first*, and then it
reads `howto()`. That chain is the only path by which a capability
becomes something an agent KNOWS it has.

Audited: the handshake named none of `infill`, `ensemble`, `recipe`,
`fit`, `take`, `events` or `tell`, and `howto()` named none of them
either. `howto()` is excellent on sound and on the order to work in — it
names `pad`, `chop`, `tape`, `mutate`, `paint`, `resynth`, `note`,
`step`, `place`, `review`, `reference`, `render` — and it stopped there.
So the chain led an agent to make sounds and mix them and never told it
the app can write parts, hold a conversation, or measure something
somebody played.

Eighteen reachable calls were in neither place:

```
live  poly  euclid  params  schedule  automate  autoTargets  export
critique  infill  ensemble  tell  events  take  recipe  phrase
continuity  dynamics
```

`poly` is the one that stings. AGENTS.md has a whole section about it —
*Reach for what is already there* — recording that six tracks were
written in this repo before anyone used it, every one on a single
16-step grid at a single tempo. The rule in that section is to check
whether the thing you want already exists and has simply never been
reached for. **An agent cannot follow that rule about a call nobody
told it exists.** The lament and the cause were in the same repository,
one document apart.

### The fix is a test, not a paragraph

Three sections were added to `howto()` — `writing`, `producing`,
`checks` — and the handshake now names the six easiest to miss. But
prose rots: that is how this happened, since every one of those
eighteen was added by somebody who updated the tool list and not the
document.

`tests/discoverable.test.mjs` asserts the CHAIN. Every call an MCP tool
forwards to must be named in the handshake instructions or in
`howto()`, or carry a stated reason for being too small to mention.
Adding a name to `EXEMPT` is a decision; leaving a call out of both is
an oversight, and the test is what forces the distinction — the same
shape as the `API_ONLY` list in the handshake test one layer down.

A second assertion names the headline capabilities positively —
`infill`, `ensemble`, `recipe`, `fit`, `take`, `events`, `tell`,
`timbre`, `key`, `chords`, `place`, `pulse`, `harmony`, `render` —
because `EXEMPT` is an escape hatch and an edit that quietly moved one
into it rather than documenting it would otherwise pass.

### And three capabilities are still AI-only

The same audit against the UI found no control at all for `recipe()`,
`fit()` or `timbre()`, and none for measuring a take — the `take`
matches in the markup are TRAX's recording controls, which is a
different thing from measuring what was recorded. `src/pure/pitch.js`
is wired to nothing yet by design, being validated before anything is
built on it.

That asymmetry is worth stating rather than quietly carrying: an agent
can load a recipe, check whether a sound fits its slot, and measure
what a sample can do, and a person sitting in front of the app cannot.

## An agent could, and the person could not

The discoverability audit turned up the half nobody had checked: there
was no control anywhere for `recipe()`, `fit()` or `timbre()`, and none
for measuring a take. An agent could name the slots a track needs, judge
whether a sound suits one, and measure what a sample can actually do;
whoever was sitting in front of the app could do none of it.

That asymmetry is this repo's recurring fault seen from the other side.
Every previous version of it was an engine feature with no way in at
all — `gate` with no control, `poly` unused for six tracks, the pad's
pitch knob invisible. This time the way in existed and pointed only at
the agent, which is harder to notice because the capability demonstrably
works and has tests.

**And the tests were the reason it survived.** Every test of these calls
them directly: `JBH.recipe()`, `JBH.fit()`, `JBH.timbre()`. A test that
calls the API proves the capability works and says nothing about whether
anyone can reach it. `tests/browser/user-can-too.test.mjs` drives the
CONTROLS — `document.getElementById('mlRecipe').click()` — because that
is the only question that was going unasked.

The controls:

| control | where | what it does |
|---|---|---|
| GIVE ME A RECIPE TO FILL IN | WRITE | names the slots, leaves the pads empty, writes the kit |
| CHECK MY SOUNDS | WRITE | measures each slot's sound against that slot's job |
| WHAT CAN THIS SOUND DO? | pad tools | attack, ring, and the tightest part this sample can play |
| HOW DID THAT TAKE SIT? | TRAX | onsets, timing against the click, and the three real faults |

RECIPE sits directly under BUILD ME A TRACK FROM MY PADS on purpose:
they are exact inverses. That one writes onto whatever pads you already
loaded, so the track is shaped by your board; this one names the slots
and leaves the pads empty, so the pattern comes first and choosing the
sounds is the creative act rather than a constraint on it.

CHECK MY SOUNDS starts DISABLED, because `fit()` refuses with no recipe
loaded and a button whose only possible output is that refusal is worse
than no button — *a control must not offer what cannot work*.

### The first thing anybody would have seen

Pressing HOW DID THAT TAKE SIT? on a fresh project said:

```
no track null — TRAX has 8 lanes, numbered from 1.
```

`take()` had one refusal for two different situations. Asked for a
specific lane that does not exist, "TRAX has 8 lanes" is the right
answer. Asked for no lane in particular and finding none with a take,
the right answer is that nothing has been recorded yet — and the button
hits exactly that path on an empty project, so it was the first thing
anybody would ever see from it. The error named the wrong cause, which
is the fault `tape()` is documented for one section over. Split in two:

```
no lane has a take on it yet. Arm a lane, press PLAY, play something,
then STOP — then this will tell you how it sat.
```

Found by a test asserting the refusal was helpful rather than merely
present.

## The MCP server could not start on a Mac or on Windows

The whole point of `mcp/server.mjs` is to let somebody's AI drive the app
in front of them. On either of the two platforms most people have, it
could not boot.

Its browser lookup was four Linux paths:

```
CHROME_PATH, /opt/pw-browsers/chromium, /usr/bin/chromium,
/usr/bin/chromium-browser, /usr/bin/google-chrome
```

and this repo depends on `playwright-core`, which **deliberately ships
no browser binaries**. So on a Mac with Chrome sitting in
`/Applications`, it found nothing, fell through to a comment reading
*"let playwright use its own download if it has one"*, and there was
none.

`tests/browser/harness.mjs` had its own copy of the same question, with
one macOS path and no Windows path at all. Two answers to the same
question, wrong in the same direction — which is what happens when a
question gets answered twice.

### Platform is a parameter, because otherwise it cannot be tested

Both copies were written in a Linux container, where a Windows path can
be typed and never evaluated. That is the whole mechanism of the bug,
not an accident of it.

`scripts/lib/find-chrome.mjs` takes its platform and environment as
arguments, and `tests/find-chrome.test.mjs` exercises all three from
here. It is not the same as running on a Mac, and it is the difference
between paths that were reasoned about and paths nobody ever looked at.

**And the separator caught the same trap one level down.** `join` from
`node:path` uses the HOST's separator, so building a Windows path with
it on Linux produces `C:\Program Files/Google/Chrome/...` — mixed, and
worse, the test that checked it could not see the difference. The
win32 branch uses `path.win32.join` explicitly, which makes the output
identical wherever it is computed and the assertion mean something.

### Windows needs three roots and the third is the common one

A 64-bit Chrome installs to Program Files, a 32-bit one to Program
Files (x86), and a per-user install — which is what you get **without
admin rights**, so what a work laptop usually has — to `LOCALAPPDATA`.
Missing that third is missing the commonest case on a managed machine.
The roots are read from the environment rather than hardcoded to `C:`,
because a machine whose system drive is something else is unusual and
not rare.

Edge, Brave and Chromium are all tried as well. They are Chromium
underneath and drive identically, and somebody who has Edge and not
Chrome should not be told to install a browser.

### Visible by default, which is the other half of being friendly

`chromium.launch({})` defaults to headless, so an agent drove a browser
nobody could see. That is right in CI and exactly wrong for a person
sitting at a desktop — who can also click in the same window and take
over, which costs nothing to allow and is most of what "watch my AI
work" means.

It launches visible now, at 1280x900 with the real window driving the
viewport, and falls back to headless where there is no screen —
checked, not assumed, since this container has none and a headful
launch there fails outright. The choice is reported on stderr:

```
[jbh] browser: PLAYWRIGHT_BROWSERS_PATH (headless — no display found)
```

because "I cannot see a window" is otherwise a mystery with no way into
it. `JBH_HEADLESS=1` forces hidden, `0` forces shown.

Verified by spawning the real server over stdio and making real tool
calls — `jbh_state` and a `jbh_pack` load — rather than by reading the
code. The handshake tests boot the server but not the browser, which
launches lazily on the first call, so they could never have caught this.

### And a prefix is not a directory

The static server that serves the app and its sample packs confined
requests with `p.startsWith(root)`. `/home/me/Clonedit` is a prefix of
`/home/me/Clonedit-private`, so a sibling directory was reachable — on
every platform, and more easily on Windows where the separator differs.
Confining to a directory means `root + sep`. Found while reading the
path handling for platform assumptions, which is the kind of thing that
only turns up when you go looking at paths for another reason.

## A piece can pass every check in this repo and be one loop

Every analyser here looks INSIDE a pattern. `pulse()` at the steps,
`melody()` and `motif()` at one voice's notes, `counterpoint()` at two,
`harmony()` at the chords of a bar, and the whole mixing half at a
render. Not one of them can see `S.song` — the chain of
`{pat, reps}` that is the arrangement.

So a track could pass all of them and be one pattern looping for three
minutes. That is the same failure as the bounce whose verdict was
"drone machine noise", exactly one level up: that one passed nine bands
of spectral analysis because nothing measured whether the HARMONY
moved, and this one passes everything because nothing measured whether
the ARRANGEMENT moves.

AGENTS.md had already recorded the gap — *form is measured outside the
app, by one script* — and `scripts/midi-structure.mjs` measures it from
exported MIDI, which means it cannot be part of the loop a person or an
agent actually works in.

`form()` closes it and is FREE in the same sense as the other four: it
reads the chain the app already knows exactly and renders nothing, so
`review({quick:true})` runs it after every pattern rather than once at
the end.

### Three faults, and the third is invisible in the summary

- **one pattern** — the loop-for-three-minutes case
- **nothing comes back** — every section new, which reads as wandering
  rather than as a form; a listener needs something to recognise
- **two pattern numbers whose steps are identical** — and this is the
  one worth having. The sequence prints as letters, `A B A C`, which is
  how anybody describes a form out loud; but two patterns can differ by
  index and not by content, so the string reads `A B` while the
  listener hears `A A`. Jaccard over the played steps catches it, and
  it is free because the app knows every step it will play.

### And it refuses to judge a section length

This is the part that took the most thought, and the answer was in the
repo already. `samples/form-norms.json` is what this project measured
when it last went looking at form, and most of its fields carry a
warning in the file itself:

> Every field named UNSOUND_* is kept as evidence and must NOT be used
> as a norm.

What survived is Bach phrase length by fermata: commonest 2 bars, 67.8%
of 2,538 phrases across 433 scores. That is a fact about chorales, not
about how long a section of a groovebox track should be. The same file
records that only **6.7%** of those phrases are four or eight bars — so
even the familiar "eight-bar section" is unsupported by the one corpus
here.

Inventing a target from that would be the exact Goodhart failure the
longest section of AGENTS.md is about, where a track was pushed to a
12dB dynamic arc to satisfy a sentence in a document and came out worse
than the one it was trying to beat. So nothing is judged, the refusal is
stated in the output so nobody later reads its absence as an oversight,
and a test asserts that reps of 1, 2, 3, 7, 16 and 64 all draw no
comment.

### A chain that is switched off is not a form problem

`S.songOn` can be false with a perfectly good arrangement sitting
there, and then the selected pattern loops instead — which sounds
exactly like having no form and needs a completely different fix. The
result says so rather than letting the numbers imply the wrong cause.

### The test's own cap failed as if the function were gone

`tests/mcp-coverage.test.mjs` finds `howto()` with a regex capped at
16000 characters. Documenting the writing, producing and checks
sections pushed the body to 16647, the lazy match could no longer reach
the closing brace, and the failure read *"howto() not found or no
longer returns an object literal"* — which sends the first reader
hunting for a syntax error in a function that is perfectly fine. The
cap is a runaway guard, not a budget for the document; it is 40000 now
and the message says to check the cap before believing the function is
broken.

## The loop this file prescribes was never automated

AGENTS.md says it in one line: *"A song script should look like: write
a pattern, `review({quick:true})`, write the next one. Not: write
everything, then look."* That is the working loop, it is correct, and
nothing in the app did it. `infill()` reported that it wrote twelve
notes and said nothing about what those notes did — while the checks
that would say are FREE, read the schedule, and were a separate call
somebody had to remember to make in between.

So applying a candidate now runs them and attaches what they found. It
reuses `review({quick:true})` rather than calling the checks again,
because two routes to the same verdict is how they drift apart.

### And the first run of its own test caught it crying wolf

The first version forwarded every finding review quick produced. The
very first assertion printed:

```
wrote 3 notes for keys into bar 1 over C.
1 thing to look at after that write: form.
there is no arrangement — the song chain is empty
```

Which is **true**, and is the normal state of a project somebody
started four minutes ago, and has nothing to do with the three notes
just written. Every write during sketching would have carried it.

That is the exact failure this file already names twice — *a check that
cries wolf gets ignored, and then it may as well not exist* — and the
rule it gives for avoiding it is to ask what a new check will say on
material where nothing is wrong. On material where nothing is wrong,
the arrangement checks say the arrangement is unfinished.

So the post-write report carries the MATERIAL checks only: `melody`,
`motif`, `counterpoint`, `harmony` — the line, how it sits against the
other voices, and whether it fits the chords. `form` and `pulse` are
about the whole project and stay in `review()`, which is where somebody
asks about the whole project. The clean message says so, rather than
leaving their absence to look like an oversight.

### A failed check must not fail the write

The notes are already on the grid by the time the check runs. Throwing
there would report a successful write as an error and send somebody
looking for a fault in the writing, which is the "error names the wrong
cause" shape that `tape()` is documented for. It returns
`clean: null` with the reason instead, and a test sabotages `review()`
to prove the notes still land.

### Two options appeared out of nowhere, and the net caught them

Reading `o.chords` and `o.check` in the new helper silently gave
`infill()` and `ensemble()` two options no tool forwarded. The handshake
test named all four within seconds of the code existing. That check was
extended earlier the same day to follow an options object passed into
`src/pure`, and this is the first time it caught something that was not
deliberately planted — which is the difference between a test that
passes and a test that works.

## A recipe that cannot use the sounds you already have

Reported from use: *"when I click check my sounds it doesn't check pads
that I already had to fill the gap, it only counts the new recipe."*

Exactly right, and the cause was a decision made on purpose whose
consequence was never followed through. `recipe()` claims only EMPTY
untagged pads — taking somebody's loaded sound to make room for a slot
is the wrong guess to make silently, and a test asserts it. But on a
board that already has sounds, that leaves every slot pointing at a
NEW empty pad, `fit()` reports them empty forever because the only pads
it looks at are the ones the recipe made, and there was no way at all to
say "pad 3 is my kick, use that".

So the half that was built is correct and the half that makes it usable
was missing.

### suggestFor() had been sitting there the whole time

`src/pure/recipes.js` has exported `suggestFor(role, candidates, bpm,
gap)` since recipes were added — it ranks candidate sounds against a
slot's brief — and **nothing ever called it**. It had a unit test and no
caller. That is this repo's most repeated mistake wearing its usual
disguise: the capability existed, was tested, and had no way in.

`fit()` on an empty slot now measures every loaded pad that is not
already in a slot, ranks them with it, and names the best three by pad
number.

### And a suggestion you cannot act on is just a sentence

The first version printed the ranking and ended with `slot("low", 2)` —
an API call, in a panel, to somebody who has never opened a console.
That is the same fault one layer smaller: the advice was reachable and
the action was not. There is a **USE PAD** button per candidate now.

`slot(name, pad)` **moves the written steps with the assignment**, which
is the whole reason it is a call rather than a note in the manual. The
kit pattern is written onto the slot's pad before any sound is chosen;
left behind, the part would play silently on an empty pad while the
sound just assigned sits mute — which reads exactly like the assignment
not working.

### The returned slots were the live ones, and mutated under the caller

`recipe()` handed back the same objects `slot()` rewrites. So a snapshot
taken before an assignment had silently changed after it: read
`slots[2].pad` afterwards and you get the NEW pad, with nothing to say
it moved.

It cost an hour. A test compared the old pad against the new one, both
reads went through the same mutated object, the move looked like a copy,
and the implementation was blamed. `recipe()` returns copies now.

### mlInfo is shared, so a result lives until the next redraw

The USE PAD button reported "LOW END is pad 1 now" and had it replaced
by "No chords on pattern 1" before anybody could read it. `mlInfo`
carries both the key-and-chords panel's STATUS and every action's
RESULT, the panel rewrites it on any redraw, and assigning a pad
redraws. The result reads as the button having done something else
entirely.

Results belong where the thing they are about is drawn, so the outcome
goes into the slots box. Worth suspecting anywhere else a shared status
line carries an action's answer.

## The arp role never asked whether the sound could play one

The second half of the same report: write should *"consider what sounds
it has before it writes them"*.

`mlVoices()` assigned roles from the mean sampled pitch alone — lowest
takes bass, highest takes arp, the rest carry the tune. That is right
about REGISTER and silent about SPEED. An arp part puts notes two
sixteenths apart, so at 150bpm it asks for a note every 200ms; hand
that to a bowed swell taking 235ms to speak and the part is silence
with the shape of a part. The instrument was chosen for being the
highest and nothing asked whether it could do the job.

Measured in the browser, three tagged sounds where the slowest is also
the highest:

```
before   thud=bass  click=lead  swell=arp
after    thud=bass  click=arp   swell=lead
         "swell takes 230ms to speak and an arp part puts notes closer
          than that at 150bpm, so it carries the tune instead."
```

The register ordering still decides. This only declines to call
something an arp when it demonstrably cannot play one, hands the role to
the highest that can, and says why — a role that moved for a reason
nobody can see is worse than the wrong role. Bass is left alone: a slow
sound is fine down there, where the notes are far apart anyway. An
instrument whose timbre cannot be measured is not demoted on a guess.

## Two files exported the same name, and the app lost both

`src/pure/` is published to the page as globals: `vite.config.js`
bundles `src/pure/index.js` — which is nothing but `export *` lines — to
an IIFE and does `Object.assign(globalThis, __JBH_PURE)`. The engine
then calls `euclid()`, `SCALES`, `GROOVES` and the rest as bare names.

`export *` has one rule that bites here. When two re-exported modules
export the SAME name, that name is AMBIGUOUS and the star export
silently omits it. Not an error, not a warning: the key is simply not on
the namespace object, so the global is never assigned.

`src/pure/groove.js` exports `GROOVES` — the swing and feel templates
the GROOVE panel is built from, STRAIGHT and SWING 58% and OFF-GRID and
LATIN PUSH and REGGAE DRAG. The commit that added the measured drum
corpus added `src/pure/grooves.js`, one letter apart, exporting
`GROOVES` as well. From that commit on, in the shipped `index.html`:

```
grooveApply()  ->  ReferenceError: GROOVES is not defined
```

The whole feel panel threw on every use, and the measured corpus it
collided with was not reachable either. Both were lost, which is worse
than either one winning.

**Nothing failed.** The unit tests import each module DIRECTLY by path,
so `tests/groove.test.mjs` and `tests/grooves.test.mjs` were both green
the entire time, each testing a table the page could not see. No browser
test drove that control. The comment in `src/pure/index.js` explaining
why the corpus was exported — "the whole point of measuring something is
that you can go and read the numbers" — described something that did not
happen.

A second one was sitting beside it: `midiName`, exported by both
`pitch.js` and `theory.js`. That one cost nothing only because
`legacy.js` happens to define a third copy of the same function locally.

The fix is two renames — `DRUM_CORPUS` for the measurement, `noteName`
for pitch.js's local helper. The check that matters is
`tests/pure-globals.test.mjs`, which bundles `src/pure/index.js` exactly
the way the build does and asserts that every name any file declares
actually arrives on the namespace. Testing a module by its path says
nothing about whether the page receives it, and for a folder whose
entire job is to be published as globals, the published surface is the
thing worth asserting.

## Is every tool we have to write actually used before a song is made?

`tests/discoverable.test.mjs` asks whether an agent can FIND each call.
The next question is different: when the app builds a track by itself —
SURPRISE ME, `writeSurprise()` — does it REACH for what it has?

The audit found the generator in better shape than expected. It already
reaches `ensemble()`, `infill()`, `phrase()` (through ensemble, for the
dynamic arc), `poly`, `key()`, `chords()`, `gate`, `feel`, pentatonic
scales, `converse`, `timbre()` (through `mlVoices`, for the arp
playability check), `tape()` and the song chain. Two things it did not:

**The measured drum corpus.** `src/pure/grooves.js` holds 336 figures
from 1,138 Groove MIDI takes and 20,528 bars, and it was reachable only
from `recipe()`. `writeKit()` was writing drums from hand-authored
`kick`/`snare`/`hat` arrays in the GENRES table, next to a corpus it
never opened.

**`form()`.** `writeSurprise()` writes the only song chain in the app, so
it is the only caller for which `form()` has anything to read — and it
never ran it. A piece can pass every other check in this repo and be one
loop; the builder was in a position to notice that about its own output
and did not look.

**But wiring all sixteen genres to the corpus would have been worse than
leaving it alone, and the measurement says so.** The corpus is one
drummer at a time on an electronic kit in thirteen ACOUSTIC idioms. Most
genres here are electronic, and asking it for them returns something
that is real and is not the genre:

```
motorik -> rock      x...x...x...x...   four on the floor. Motorik IS
                                        straight eighths; the corpus bar
                                        deletes the genre.
dub     -> reggae    x...x...x...x...   not a one drop, and reggae
                                        refuses snare and hat anyway
house   -> dance     7 takes            one or two drummers, which
afro    -> afrobeat  13 takes           grooves.js already flags `thin`
gospel  -> soul      76bpm vs [80,148]  outside the measured range
```

Two of sixteen pass: boombap from 95 hiphop takes, noir from 99 jazz
takes. `kitFrom()` gates on `thin` and on the style's measured tempo
range, and `figureFor()` applies its own refusals on top — noir gets
kick and hat and is refused a snare, correctly, because jazz's best
loopable snare bar holds 2.9% of its bars and the other 97% of the time
the drummer played something else. The build says which voices are
measured and from how many takes, and says nothing at all when it drew
from the table, because a claim nobody can check is worth nothing:

```
BOOMBAP — ... Kit: kick/snare/hat drawn from 95 measured hiphop takes.
NOIR    — ... Kit: kick/hat drawn from 99 measured jazz takes.
HOUSE   — ... (no claim)
```

The hand tables are not laziness. They are the definition of idioms
nobody recorded for this dataset, and two honest draws beat sixteen
dishonest ones.

**The ratchet is `tests/generator-reach.test.mjs`**: a writing capability
is either reached by the generator or named in `EXEMPT` with a reason
saying why the generator is RIGHT not to call it. `euclid()`, `figure()`,
`recipe()`/`fit()`/`slot()`, the sound-rewriting tools and `live()`/`hit()`
are exempt; the test rejects an exemption that reads like a to-do.

**And the first draft of that test was reading a vocabulary and calling
it a call graph.** It joined a fixed list of function bodies, so when
`writeKit()` was made to stop calling `kitFrom()` — the exact regression
of unwiring the corpus — every test still passed: `kitFrom`'s body was in
the list whether or not anything reached it, and `DRUM_CORPUS` still
appeared in the joined text. It walks now, starting at `writeSurprise()`
and admitting a function only once its name appears in text already
admitted. Three known-bad inputs were tried against it; the fixed-list
version caught two.

## The kit was assigned by pad index, and A01 never played

"I'd like to be able to click a button that learns pads, then click
write song and it utilise what it learned about pads available and that
info it gathers from learning apply to songwriting to increase
musicality."

The fault underneath that request was real and had been costing every
build:

```js
const drums = loose.slice(0, 3);
//   drums[0] -> kick figure, [1] -> snare, [2] -> hat
```

The three voices went to whichever pads were free IN PAD ORDER. Load a
hat on A01 and a kick on A03 and the measured hiphop kick bar plays on
the hat while the hat pattern fires the kick. Every check in this repo
passes: the steps are on the grid, the harmony is untouched, `pulse()`
finds a beat, `form()` reports A B A B C B. Nothing is broken. It is
simply not the kit anybody loaded, and nothing here looks at whether a
figure landed on the right sound.

`timbre()` could not have caught it. A kick and a closed hat are both a
fast attack and a short tail; the difference is entirely SPECTRAL, and
nothing in `src/pure/` measured a spectrum.

### Air-vs-body is the axis, and the centroid is not

The first version of the detector scored on the spectral centroid —
under 150Hz a kick, 300-2500Hz a snare, above 2500Hz a hat. It passed
every synthesised fixture, then met a real pack of 27 drums and **every
single snare came back as a hat**:

```
sample              truth  read   owns      centroid   air
jbh:snare_909       snare  hat    120-250       3798   -1.9
jbh:snare_acoustic  snare  hat    8k-16k        6716    8.7
jbh:snare_tight     snare  hat    250-500       4675   -1.3
jbh:snare_rim       snare  hat    8k-16k        7671    9.6
jbh:clap            snare  hat    4k-8k         6601   21.7
```

A real snare is BRIGHT — the wire buzz puts its centroid at 3.8-7.7kHz,
exactly where the hats sit (hat_closed 3033, ride 4215, hat_open 5551).
The centroid cannot separate those two at all. "A snare is a mid sound"
came from intuition, not measurement, which is the failure AGENTS.md
describes as a plausible number reading later as a fact.

What does separate them, across the same 27 samples:

```
kick    air-vs-body  -95.6 .. -41.8     all body, no air
snare                -10.9 .. +21.7     shell tone AND wire buzz
hat                  +31.0 .. +82.8     all air, no body
```

That is not a quirk of one pack, it is what the instruments are: a kick
is a tuned membrane with nothing above it, a cymbal is nothing but
overtones, and a snare is the one with both at once. Being a ratio it is
also level-independent. Accuracy went from 16/22 to **20/22**, and the
two it disagrees with are a cowbell and a rimshot — percussion where the
label is a judgement call, and it flags the rimshot as unsure.

### The one it refuses, and why that is right

An 808 kick and an 808 bass note are THE SAME SIGNAL; which one it is
depends on what you play it as. `jbh-drums` ships both and they measure
alike — kick_808 at 62Hz, bass808_C1 at 36Hz, both all body, both
ringing. Ring does not separate them either.

The first `pitchedness()` called anything with a 500ms tail under 3kHz a
note, so a 909 kick (600ms ring at 62Hz) read as melodic: the builder
dealt it a bass line and reported `kick=—` on a board whose kick was
sitting right there and had been correctly identified one line earlier.
Guessing the other way would be equally wrong, so below 300Hz it returns
null and the caller uses the two things that actually know — the `inst`
tag, which is the person saying so outright, and the kit scores, which
say what the sound would be GOOD at.

The kit-candidate filter then has to be `!== 'pitched'` rather than
`=== 'percussive'`, because the kick measures as neither. Requiring a
positive `percussive` threw away the one voice the kit most needs.

### And a bug older than the feature

```js
if (drums[0]) { ... }      // A01 is pad index 0, so this is FALSE
```

A pad index is a number. The voice assigned to A01 had its figure
computed, its break and fill worked out around it, and then nothing
written. It stayed hidden because the old code took `loose.slice(0, 3)`
and the kick was USUALLY pad 0 — so the commonest board silently had no
kick at all. The measured assignment surfaced it by putting a hat there
instead, which was equally skipped and far more obvious.

It was found by counting hits per pad after a build, not by reading the
output, which named every voice correctly while writing two of them.
`tests/generator-reach.test.mjs` now rejects any `if (drums[n])` in
`writeKit`, verified by putting one back.

### What the build does with it now

`learn()` runs BEFORE the voices are chosen — the order matters, because
choosing voices first takes the kit pads away and a drum gets dealt a
melody. Percussive pads are reserved for the kit, pitched ones carry the
parts, and the kit gives its least convincing member back if that would
leave nobody to play the tune. An `inst` tag outranks any measurement.

```
hat on A01, snare on A02, kick on A03, tagged bass on A04

LEARN   kick=A03 snare=A02 hat=A01. 4 of 4 were clear-cut.
BUILD   1 voice over 3 patterns ... Kit by ear: kick=A03 snare=A02
        hat=A01. Kit: kick/snare/hat drawn from 95 measured hiphop takes.
hits    A01 16, A02 8, A03 12, bass 11   (per pattern)
```

**The build measures the pads whether or not the button was pressed.** A
track that is only right when you remember to press something first is a
track that is usually wrong. The button exists so a person can SEE the
reading before committing to it, and disagree — which is why it prints
the numbers per pad rather than only the verdict.

### A process note worth more than the feature

Mid-way through, three probes in a row reported `kick=—` and a debug hook
that never fired. The cause was that `npm run build` runs the unit tests
first and had been ABORTING on a test I had just broken, so every probe
was measuring a stale `index.html`. Reading `tail -3` of a build showed a
test summary rather than a build summary and that went unnoticed for
three cycles. Check that the thing you are measuring is the thing you
just changed — the same trap as "before concluding that an edit failed,
check that the edit changed anything at all", one level up.

## Bend to my will: the knob search was the wrong mechanism

"A bend-to-my-will button that forces pads into parameters as best I can
as opposed to selecting the best available would be interesting."

Everything else on the board PICKS. `fit()` ranks the pads you own
against a slot, `assignKit()` hands the three drum voices to whichever
sounds measure most like them, and both answer "which of these is
closest". Bend is the other verb: name the job, and the sound is pushed
toward it until it measures like the thing.

`mutate()` looked like the mechanism and it was already a knob search —
render a candidate, measure it, score it, keep the best — so adding a
role as its objective was four lines. AGENTS.md's own rule: check
whether the thing you want already exists and has never been reached
for.

**Then it was measured, and the person using it had already said it:
"mutate doesn't have much effect either."** On real samples, scored on
the render:

```
ride           -> kick     0% ->  0%    0dB spectral change, 15 tries, 32s
snare_acoustic -> hat      70% -> 71%   5.48dB change, 32s
```

Nothing, and one percentage point. Which is exactly what AGENTS.md says
about mutate — it turns the pad's own knobs and **never touches the
audio**, so "the most transformed thing it can return is your sample
with a filter on it". A ride needs 66dB more body to hold a kick's place
and no filter setting adds low end that was never recorded. The tool was
working correctly and was the wrong tool.

### What the fix needed first: something to aim at

`ROLE_TARGETS` scores a role from two numbers — air-vs-body and a
centroid range. That is enough to RECOGNISE a sound and not enough to
MAKE one: two constraints cannot specify nine bands. So
`scripts/study-role-shapes.mjs` measures the mean band shape of each job
from the labelled samples of `samples/jbh-drums.json`, the way
`grooves.js` was measured from the Groove MIDI Dataset, and refuses to
write unless kick comes out darker than snare and snare darker than hat
on the same axis:

```
kick  n=4  air  -75.3dB  centroid    73Hz
snare n=6  air    4.2dB  centroid  4406Hz
hat   n=8  air   34.4dB  centroid  4616Hz
bass  n=3  air  -97.3dB  centroid    38Hz
```

21 samples from one pack is not a corpus, and the generated file says so
in its own header.

### The mechanism that works

An EQ match on the buffer: measure the sample's nine bands, compare with
the job's shape, apply the difference through an STFT. One static curve
across the whole sample, because the envelope is the sample's identity
and the thing being changed is COLOUR. Same job, both mechanisms:

```
                 knob search                  audio bend
ride -> kick     air 31.7 -> 31.7dB           air 31.7 -> -27.0dB
                 centroid 4215 -> 4215Hz      centroid 4215 -> 149Hz
                 fit 0% -> 0%,  32 seconds    fit 0% -> 73%,  0.2 seconds
```

A boost is capped at 18dB and a cut is not, which is the honest
asymmetry: lifting a band that holds nothing amplifies noise instead of
adding a sound. A kick bent toward a hat gets to 2% and says it needs
56dB more air, then names `resynth()` and `paint()`, which do make
substance that is not there. Most of the real transformation is in the
cutting anyway — take the air off a ride and what is left thumps.

### Two identical measurements, twice, for two different reasons

AGENTS.md: "before concluding that an edit failed to achieve its goal,
check that the edit changed anything at all. Two identical measurements
are not a weak effect, they are no effect." That exact reading appeared
twice here, and **neither time was the transform at fault**.

First, `bend()` reported before and after with `learn()`, which profiles
the RAW SAMPLE. Knobs do not touch the buffer, so learn() could not see
any of them:

```
snare_acoustic -> hat   fit 77% -> 77%   air 8.7 -> 8.7dB
moved fcut 1->0.646, ftype off->bandpass, eqHi 0->-2.915, (8 more)
```

Eleven knobs moved and the measurement did not shift a decimal. The edit
had worked and the measurement was blind to it — the same rule wearing
the other face. `mutate()` already returns the rendered before and after
shapes, so there was nothing to add but to read the right ones.

Second, after the audio bend was in, the numbers went identical again:
air 31.7 → 31.7 following an 18dB boost and a 48dB cut. The curve was
right, the transform was right, and `loadIntoTarget(buf, name,
{keepTarget: true})` writes to **`S.editPad`**, not to the pad the
function was handed. With one pad loaded those are the same pad and
everything looks correct; load three and the selection has moved on, so
the bent audio landed on the last pad touched while `bend()` measured
and reported the untouched one. The browser test now loads three pads
for exactly this reason.

### And a build that aborts looks like a build that ran

Three probe cycles in a row reported a stale result and a debug hook
that never fired. `npm run build` runs the unit tests first, and it had
been ABORTING on a test broken a minute earlier — so every probe was
measuring the previous `index.html`. Reading `tail -3` of the build
showed a *test* summary rather than a build summary, and that went
unnoticed three times. Check that the thing being measured is the thing
that was just changed.

## Higher-order Markov and pink noise: measured, and already there

Two pieces of generative advice arrived together:

> Move beyond basic Markov chains: instead of single-note transition
> tables, use higher-order Markov chains, n-grams, or Variable-Order
> Markov Models that look back 4 to 8 notes rather than just the
> immediate predecessor.
>
> Incorporate Pink Noise (1/f): use pink noise distributions instead of
> uniform random choices for picking note durations and pitch intervals.
> It mimics the natural statistical balance of real human music — where
> large leaps are rare and small steps are common.

Both are sound in general. Measured against what is actually in this
repo, neither is a change worth making, and the measuring is the point —
`scripts/study-contour-noise.mjs` reproduces all of it.

**There are no Markov chains to move beyond.** Nothing in `src/` or
`scripts/` contains a transition table. `infill()` and `ensemble()` write
from `src/pure/contours.js`: 130 interval sequences generated offline by
magenta's `chord_pitches_improv`, an LSTM. An LSTM's context is not a
4-to-8 note window, so the advice describes a step backwards from what is
there. The advice would have been exactly right about the version before
it, which chose each pitch from the chord and the key and came out as
arpeggios.

**"Small steps common, large leaps rare" is already measured, not
approximated.** `scripts/study-melody.py` counted 441,316 intervals of
the Essen Folksong Collection into four classes, and `MELODY_NORMS` holds
the result. Our material against it:

```
class     ours    Essen   diff
repeat    23.3     21.1   +2.2
step      47.4     46.9   +0.5
third     18.4     19.0   -0.6
leap      11.0     13.1   -2.1
```

Worst class 2.2 points out, over 2,143 intervals. Pink noise is a proxy
for that distribution; we have the distribution. Substituting the proxy
would be the inverse of this repo's rule that the norms are measured
rather than recalled.

**And the half a histogram cannot capture is also already there.** A
sequence can have a perfect interval distribution and still be white
noise in its ordering, which is the real content of the 1/f claim —
Voss & Clarke (1975) measured long-range correlation, not a marginal.
So: the spectral slope of the pitch walk, fitted as log power against
log frequency, with controls generated by the same estimator on the same
lengths rather than quoted from elsewhere:

```
                      n     p15   median    p85
our contours         72    0.64     1.35   1.80
white-noise control 1400  -0.64     0.03   0.63
random-walk control 1440   1.14     1.72   2.19
```

Pink is 1.00. The contours sit between pink and brownian and nowhere
near white — which is the region real melody occupies, inherited from a
model trained on it. The advice says "instead of uniform random
choices", and uniform random choices would measure 0.03.

A slope fitted over less than two decades of frequency is indicative
rather than precise, and 72 of 130 contours are long enough to fit one
at all. The interval distribution rests on all 2,143 and is the firmer
of the two numbers.

**Where it could still apply, and where it still should not.** The one
unmeasured thing in the write path is melodic note DURATION: the cell
library in `mlWrite` is hand-authored — "each is something a player
would actually do" — so no corpus stands behind it. That is a real gap
and pink noise is still the wrong tool for it, because the problem with
a duration here is not its distribution but its PLACEMENT. AGENTS.md
records what happens when that is forgotten: generating values and
dealing them onto step offsets with no musical meaning is what gave
HOLLOWAY an audible stumble, and the fix was to keep the rhythm with the
cell library. A duration drawn from a 1/f distribution has the right
histogram and does not know where the downbeat is.

What would actually help there is a measured duration-and-placement
distribution from a real corpus, the way `grooves.js` was measured for
drums. The Groove MIDI Dataset is already local and already carries
timing.
