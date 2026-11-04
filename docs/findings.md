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
