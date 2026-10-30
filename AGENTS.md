# Making music with this app, if you are an agent

Start with two calls: `howto()` and `review()`. Everything below is what
they return, in prose, and why.

    jbh_howto     the order to work in, and the traps
    jbh_review    every check at once, before a bounce

Both are in the MCP server (`mcp/server.mjs`) and on `window.JBH`.

## SHIPPING IT. READ THIS BEFORE YOU GO LOOKING FOR THE ANSWER

The loop is **build, merge to main, launch, they test**. It has run more than
two hundred times. It is four commands and it is not a decision to be
reopened:

```
npm run build                    # tests, lint, vite, emit, smoke -> index.html
git add -A && git commit         # index.html is COMMITTED; CI fails if it drifts from src/
git push origin main
# launch: Actions > Pages > Run workflow   (.github/workflows/pages.yml)
```

Live at **https://tridentintelfree.github.io/Clonedit/**

**GitHub Pages is already enabled and has been for a long time.** Do not
"set up hosting", do not weigh hosting options, do not propose an artifact,
a private host or a new pipeline. If you catch yourself designing a deploy,
stop: it exists.

**You cannot see the live site from a cloud session.** The agent proxy denies
`tridentintelfree.github.io`, so curl returns `HTTP 000` and that means
NOTHING about whether the site is up:

```
connect_rejected — gateway answered 403 to CONNECT (policy denial)
host: tridentintelfree.github.io:443
```

Check `curl -sS "$HTTPS_PROXY/__agentproxy/status"` before concluding
anything from a failed fetch, and verify a deploy by its workflow run
instead. A whole session was spent re-deriving all of the above, twice,
because an `HTTP 000` was read as "probably not deployed" rather than "I am
not allowed to look".

**Why this section exists.** Everything else in this file is about making
music, and the one thing a session is most often asked to do — put the new
build in front of the person — was written down nowhere. So each fresh
session re-invented it from the repository, and the re-invention was worse
than the thing it replaced: a four-option question about hosting, an
auto-deploy pipeline nobody wanted, and a PR's worth of turns spent before
anything was launched. A procedure that lives only in the user's head is a
procedure the next session will get wrong.

**The repo is public and that is fine.** It is early, nothing depends on it,
and the source is public already. "Who can access it" is not a question that
needs reopening either.

**One trap, left by the session that wrote this.** `pages.yml` runs
`actions/configure-pages` with `enablement: true`, which can switch the Pages
source from *Deploy from a branch* to *GitHub Actions*. If the site stops
updating on a plain push to main, that is why: either run the workflow after
pushing, or set Settings > Pages back to a branch source and delete
`pages.yml`.

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

**And `review()` is not the whole app either.** It calls twelve:
`schedule`, `critique`, `loudness`, `translate`, `compare`,
`dynamics`, `continuity`, `pulse`, `melody`, `motif`, `counterpoint`
and `harmony`. Five analysers exist that it never calls, and a clean
review reads like full coverage while they sit unrun:

| not in `review()` | when to run it |
|---|---|
| `place(sound)` | per sound as it goes in — step 1d. The one that distinguishes absent from quiet. |
| `audit(sound)` | per sound, needs a reference. Is this the colour you meant. |
| `balance()` | needs a reference. Solves the group levels instead of guessing them. |
| `spectrum()` | the whole mix's shape, when you want the numbers rather than a verdict. |
| `levels()` | per-pad levels; `critique()` reads it, but it is worth seeing raw. |

Three of those five — `audit`, `balance` and `compare` — need a
reference, so **with none loaded a quarter of the app cannot run at
all** and `review()` will still say "nothing serious". That is not the
same sentence as "this was checked".

## Read this before the rest of the file

Everything below this section is about sound: levels, spectra, phase,
loudness. It is all true and it is all secondary. A track was bounced
here that passed every one of those checks — no silence, -16.2 LUFS,
four bands inside half a decibel of the reference, every pad owning
its own band — and the listener's verdict was **"drone machine
noise"**.

It was. Its bass held one pitch for two minutes seventeen, and five
of its six sounds never changed note at all. A static bass under a
looping figure is a drone by construction, and **nothing in this app
measures whether the harmony moves**, so nine bands of spectral
analysis called it fine.

The four things that actually turned that around, in the order they
mattered:

**1. Write music, not texture.** Chords that change. A melody with
contour. If every pad plays one pitch you have made a drone no matter
how it is mixed. `magenta` is installed for exactly this —
`chord_pitches_improv` writes a melody against a stated progression
and loads from Google Cloud Storage, which is reachable from here
when HuggingFace and PyPI's torch index are not:

```js
const mm = require('@magenta/music/node/music_rnn');   // not the barrel:
const m = new mm.MusicRNN(                             // index pulls in Tone
  'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv');
await m.initialize();
await m.continueSequence(seed, 58, 0.9, ['Dm','Bb','F','C']);
```

Generate several and choose — the same seed and temperature gave 12%
leaps on one draw and 40% on the next.

**2. Use real samples for real instruments.** A drum kit must have
VELOCITY LAYERS: a ghost note and an accent should be different
recordings of a stick hitting a drum, not one waveform at two gains.
`samples/nakeddrums.json` is a genuinely recorded kit — five velocity
layers on the kick, three round robins — and swapping it in for a
synthesised one took the pulse autocorrelation from 0.53 to 0.65 and
the crest from 14.4 to 18.3. Load it with `instrument()` so the
sampler picks layers by velocity; `sound()` on one pad throws that
away.

**3. A found sound is not a drum.** A door knock pitched down four
semitones with drive on it is a loud distorted door knock. The
listener called it "a strange percussive noise" and that is exactly
what it was. Processing changes a sound; it does not change what the
sound is of. Found recordings are wonderful for texture and wrong for
the thing carrying the beat.

**4. The checks cannot tell you whether it is music.** They detect
BROKENNESS — silence, clipping, DC, a sound with nowhere to sit — and
that is worth having. They say nothing about whether anyone would
want to hear it, and passing them all is not evidence of anything
except that it is not broken. Play it to someone.

**5. NEVER MOVE A MUSICAL PARAMETER TO IMPROVE A NUMBER.** This is
the one that cost the most and it is the hardest to feel coming,
because every individual step looks like diligence.

Two tracks, both bounced from this app, measured side by side. One was
written by another agent and the listener called it "very good". The
other is HOLLOWAY, built over hours of exactly the loop this file
recommends — run the free checks, fix what they name, run them again —
and the listener's verdict was "worse than previous bad samples:
timing bad, chord progression bad, levels bad".

| | the good one | HOLLOWAY |
|---|---|---|
| level variation, 10s windows | 2 dB | **12 dB** |
| loudness range | 4.2 LU | **10.3 LU** |
| fine-grained RMS spread (p95−p5) | 14.5 dB | **23.8 dB** |
| onsets per second | 5.90 | 6.37 |
| crest | 15 | 14.7 |
| LUFS | −16.5 | −16.0 |
| minor ninths | — | **0** |

**Every dynamics measure in this repo ranks HOLLOWAY above the track
that is actually better.** Not by a little. The listener needed about
a minute.

Each of the three faults traces to a measurement being served:

- *Timing.* `melody()` refuses to report on a line whose note gaps are
  too uniform. To clear that refusal the generated pitches were dealt
  onto four invented arrays of step offsets — `[0,4,6,10,12,14]` and
  friends — which bear no relation to the notes landing on them. Where
  a bar held more pitches than the array had slots, the overflow
  clamped to step 15, so one phrase fires at steps 12, 14 and 15 and
  then the downbeat. Three times a cycle. An audible stumble that
  exists only because a card-dealing mechanism had no musical meaning
  to fall back on.
- *Levels.* The section below says to read the level map for flatness.
  So the arrangement was pushed to a 12dB arc and the opening fades in
  from −28dB — to satisfy a sentence written in this file. The good
  track sits at 2dB.
- *Harmony.* `harmony()` asks whether the notes fit the chords. It
  never asks whether the progression is worth hearing, so Am F C G went
  unquestioned, and the bass arpeggiates root–third–fifth–approach in
  every single bar because the check wanted a third stated. That is an
  exercise, not a part.

This is Goodhart's law with a bounce attached. Every measure here is
reasonable as a FAULT DETECTOR and harmful as a TARGET. The moment a
number becomes the thing being improved, the music becomes whatever
satisfies the number, and these numbers are all blind in the same
direction — they cannot see whether anyone wants to hear it.

So: run the checks, read them as pass/fail, and fix what is BROKEN.
If a check reports something and the musical answer is "that is fine
as it is", that is a legitimate answer and the number stays where it
is. When a check refuses to measure — `melody()` on a too-regular
line, `motif()` with no instrument tag — the fix is to understand why,
not to perturb the material until the refusal goes away.

And when the material itself is the problem, the answer is better
material, not more constraint satisfaction. `@magenta/music` is
already installed with 29 reachable checkpoints; `trio_16bar` writes
melody, bass and drums as one coherent thing in about three seconds on
CPU. It was sitting unused while all of the above was hand-assembled.

## A pack named "real" may not be

`samples/real-cc0-full.json` contains `mvxkit`, which is synthesised.
The tell was in the files, not the name: durations of exactly 0.450,
0.220, 0.060 and 0.400 seconds, mono, no source URL, no attribution.
Real recordings do not land on round numbers and 60ms is shorter than
any miked hi-hat.

Before trusting a pack to be what it says, check one file:

```
ffprobe -v error -show_entries format=duration -of csv=p=0 <file>
```

A round duration, a missing source field, one sample per instrument
and no velocity layers all point the same way. The manifests that
carry a real library name a URL per sample — `nakeddrums` points at
the sfzinstruments mirror, `foundkit` at ESC-50 — and the ones that
do not are generated.

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

   d. `place(pad)` — or `place('name')` for a sampled instrument,
      which is spread over many pads and is still one sound. What band
      does it own, what is covering it, what is it covering. Fix it
      now, while it is the only thing you are thinking about and
      nothing else has been built on top of it.

   e. `review({quick:true})` every few sounds, since it is free.

2. Only once every sound is in, and each already fits: `reference(url)`
   with a finished mix you want to sound like. **Before** judging tone —
   without it, tonal balance is not checked at all and `critique()`
   says so.
3. `review({src:'song', chords:[…]})`. Fix what it names, in the order
   it names them. Run it again. This should mostly confirm. If it
   finds a sound with nowhere to sit, that sound was placed badly and
   you skipped 1d. Pass the progression or the harmony is not checked
   and it says so under `no-progression`.

   **Write the WAV before this, not after.** `review()` renders and
   measures and modifies nothing, so a bounce written before it is
   byte-identical to one written after — and this pass takes twenty
   minutes. Two renders of HOLLOWAY were lost to container restarts
   that landed inside `review()`, each with every check already passed
   and printed and no file on disk. The rule "check before you ship"
   is about a person reading the output and deciding, not about the
   order two read-only calls happen to run in. Write the file, then
   review, and re-run if the review finds something; the script should
   say loudly if it did.
4. One `render({loudness:true})` at a known `mTrim`, then solve for the
   trim rather than laddering: the master is linear, so

   ```
   trim = probeTrim + (targetLufs - probeLufs)       // clamp -24..12
   ```

   lands within a few tenths in one extra render. A ladder of three or
   four trims was the method here for a long time, costs that many
   renders, and still misses whenever it does not bracket the target —
   a denser arrangement is far hotter than a sparse one, and a ladder
   whose quietest rung is already too loud fails every gate and writes
   no file. Probe from somewhere definitely too quiet, −12, and let the
   arithmetic do the rest. If it asks for more than +12 the pads are
   staged too low; say so rather than clamping silently.

## The app stores a key and a progression now

It did not, and most of this file was shaped by that absence. Pads held
samples, patterns held steps, and the harmony existed only in whatever
the writer was holding in their head — so `harmony()` had to be HANDED
a progression, every song script kept a second copy of it beside the
checker's, form could only be measured from exported MIDI outside the
app, and anything generating notes had nothing to generate them
against.

```
key('D', 'major')                              declare it, read it, clear it
chords(0, ['Bm7','Gmaj7','Dmaj7','A'])         one symbol per BAR of that pattern
progression({src:'song'})                      the arrangement's chords, expanded
```

**Chords belong to a PATTERN, not to an absolute song bar.** A pattern
is the reusable block here, so carrying its own bars keeps it
harmonically closed and lets it be dropped anywhere in the
arrangement; the song's progression is then whatever its pattern order
spells out. Written against song bars, every chord would break the
moment the arrangement changed.

`harmony()` reads this when it is not handed a list. What has not
changed is the refusal to guess — with nothing declared it still
refuses and still says why. A HALF-declared progression is refused
too, rather than checked in the bars that have a chord and skipped in
the bars that do not, which reads exactly like a harmony that passed.

It is on the **SEQ tab** as well, so a person can set it without an
API. The chord box parses every symbol before writing any of them: a
typo in the fourth chord does not leave the first three applied.

### infill() — one voice, one span, several answers

```
infill('bass', {from:0, bars:4, role:'bass', n:5})   offers, writes nothing
infill('bass', {from:0, bars:4, apply:<seed>})       writes that one
```

It is not a generator and the distinction is the point. The research
on co-creative music tools converges on it: a model that hands over a
finished part overwhelms the person with content and frustrates them
with randomness, and what helps is constraining generation to one
VOICE over one SPAN and offering options. So this returns candidates
with the numbers they score on and the seed that reproduces each, and
writing is a second call. It suggests, like `balance()` and
`mutate()`.

**The rhythm is chosen first.** A figure is taken per bar from a small
library and the pitches are written into its slots, so every note has
a real position and a real length. Generating pitches and dealing them
onto invented step offsets is what gave HOLLOWAY its audible stumble,
and it is the easiest mistake to make again the moment a generator
returns a pitch per step.

Candidates are ranked by FAULT — minor ninths, then bars with no
third, then distance from the Essen norms — which is **not** ranked by
worth. Nothing here can hear them. If the one ranked fifth sounds
best, the ranking is wrong and the ear is right.

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
| `pulse({src})` | is there a beat a listener can find |
| `motif(inst, {src})` | does anything in this line ever come back |
| `melody(inst, {src})` | is this a tune or a scale with a rhythm |
| `counterpoint([inst,inst], {src})` | are these two voices actually one voice |
| `harmony({chords, src})` | do the notes fit the chords — see below |

Three of them take an instrument tag POSITIONALLY, not in the options
object — `melody('rh', {src:'song'})`, not `melody({instrument:'rh'})`.
The MCP tools take `{instrument}` because that is how MCP passes
arguments, and copying that shape into a browser call passes an object
where a name goes and gets nothing back.

That is most of what matters while writing, and it is instant.
`review({quick:true})` runs exactly those and nothing else, so it can
be called after every pattern. The expensive half — per-pad levels,
perceived loudness, tonal balance against a reference, what survives a
phone — belongs at the end, where it was always going to live.

A song script should look like: write a pattern, `review({quick:true})`,
write the next one. Not: write everything, then look.

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

## Run `npm run lint` before anything slow

It takes a tenth of a second and it catches the most repeated mistake in
this repo's history: closing a block comment and then carrying on
writing prose.

```
   ...the bar turns, and the approach is honestly available here. */
   THE APPROACH IS CHOSEN AGAINST BOTH CHORDS, not just taken as the
```

That is a syntax error, `node --check` finds it instantly, and it
happened **five times in one session** — twice in `src/legacy.js` and
three times in one song script. It is not an interesting bug. The whole
cost is in *when* it surfaces: a song script is parsed at the top of a
twenty-minute render and nowhere else, so a backgrounded run reports it
after the wait rather than before.

`scripts/lint-comments.mjs` is the check and `npm run build` now runs
it. Its first draft flagged seven places and all seven were object
properties sitting under a comment — `mEqLo:0,` and friends — so it was
narrowed until it caught every real case and none of those. It carries
`--self-test` with the five real failures and nine known-good lines in
it, because a checker nobody has run against a known-bad input is not a
checker.

## The traps

These are the ones that cost real work here. None are guessable from the
API.

**An option the MCP server forwards may not be one the function reads.**
`jbh_resynth` passed `jumble` for a long time; `resynth()` has no such
option — it was replaced by `novelty`/`boredom`/`stickiness` and the MCP
schema was never updated. So an agent working over MCP could set a knob
with no effect while the seven that worked were unreachable, because the
schema did not mention them. The coverage tests checked that a TOOL
existed and never that its arguments connected to anything.
`tests/mcp-coverage.test.mjs` now walks each generator's dispatch case
and checks every forwarded name against the options the function
actually reads. Verified by putting `jumble` back and watching it fail.

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

Read its verdict, not just its headline. It picks samples from the
EDGES of each instrument's range, because that is where a naming error
shows — and the edges are also where the detector fails. A piano's
bottom A is 27.5Hz, under what a 16kHz mono clip resolves, and its top
C has a hammer thud louder than its fundamental. Run at the old default
of three picks, a correct 88-note library gave

    salamander  3  +0.0 st  33%  SPLIT — only 1/3 agree; two conventions
    DO NOT WRITE MELODIES ON THESE UNTIL UNDERSTOOD

while its nine interior notes all read within 0.2 semitones. Two of
three votes were samples the detector could not hear, counted as
disagreements. It now takes five picks and only counts an outlier as
evidence of a second convention when it lands within a semitone and a
half of an octave or two from the median — a naming scheme splits a
library at exactly -12, a detector failure scatters to +18.8 and -76.7.
Both known-bad cases still trip it: a whole library declared an octave
low reads `DECLARED PITCH IS WRONG by about 12 semitones`, and a pack
with its upper half renamed reads `SPLIT — 3/6 read an octave out`.

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

**Per-pad LUFS counts FREQUENT as LOUD.** `loudness()` reports an
integrated figure per pad, and integrated means summed over the whole
render — so a sound that plays sixteen times a bar accumulates far
more of it than one that plays four times, at the same actual level.
K-weighting then discounts everything under 100 Hz by design. Put the
two together on a drum break and the meter reads:

```
Ride  -12.6    Hats  -16.5    Snare  -26.6    Kick  -32.2
```

which looks like a kick buried twenty decibels under the cymbals and
is mostly an artefact of the kick playing a quarter as often, down
where the weighting curve is steepest. Raising it twenty decibels to
answer the number would have wrecked the mix.

The actual fault was upstream and the figures did point at it, read
the other way round: the hats were written on every sixteenth, ten
strokes a second at 150bpm, and no hi-hat part that dense belongs in
a break. Thinning them to eighths fixed the balance without touching
a gain.

So read per-pad LUFS as a density map, not a balance. For balance ask
`place()`, which renders the sound against everything else and answers
the question that matters — does it own a band, or does it own nothing
anywhere. Those are different questions and only one of them is about
level.

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

## tape() silently de-registers an instrument

`instPads(name)` finds a pad by three things at once:

```js
S.pads[i].inst===name && S.pads[i].bufId>=0 && S.pads[i].srcNote!=null
```

`tape()` ends by calling `loadIntoTarget()`, which resets the pad in
place and clears both `inst` and `srcNote`. Its very next line tries
to put one of them back:

```js
if(p.srcNote!=null) S.pads[target].srcNote=p.srcNote;   // p IS S.pads[target]
```

`p` was captured as `S.pads[i]` at the top of the function, and when
no `pad:` option is passed `target === i`, so `p` and
`S.pads[target]` are the same object — already reset. The guard reads
null and the restore does nothing. `inst` is never restored at all.

So the pad keeps its taped audio and stops being part of the
instrument. Nothing throws. The failure surfaces much later, at the
first `note()` call, as

```
no instrument "lead" — call instrument() first
```

which reads as *the instrument() call is missing* rather than *it was
undone forty lines ago*, and that is the expensive part: the error
names the wrong cause.

Until it is fixed in the app, capture the mapping before taping and
put it back by hand, then assert that the instrument survived:

```js
const roots=new Map(pads.map(x=>[x.pad, x.note]));
for(const x of pads) await tape(x.pad, {...});
for(const x of pads) await pad(x.pad, {inst:'lead', srcNote:roots.get(x.pad)});
if((await instPads('lead')).length !== pads.length)
  throw new Error('tape() cost the instrument some of its pads');
```

The same shape of bug is worth suspecting in any call that rewrites a
pad's buffer — `freeze()`, `paint()`, `resynth()`, `mutate()` — since
they all end by loading a new buffer onto a pad. Only `tape()` has
been checked.

**And tape() is the wrong call on a velocity-layered kit anyway.** It
reads ONE buffer off the pad and writes one back. `nakeddrums`' kick
pad is five velocity layers by three round robins — fifteen separate
recordings of a beater hitting a head — and that layering is the whole
reason the kit sounds like drums rather than like a drum machine. The
wobble is worth having on a single-sample mallet or a pad. On the kit
it would buy a tape artefact and spend the instrument.

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

**The collection currently holds one.** `samples/ref-ambient-hall.json`
is the whole of it, so for anything that is not ambient the advice
above has nothing to act on. HOLLOWAY is a piano trio, and measured
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

## Stage from a measured peak, and let it fail loudly

**`stage()` DOES NOT EXIST.** It is not in `src/legacy.js`, it is not in
`mcp/server.mjs`, it is not on `window.JBH`. The worked example below
was written into this file as though it were a call anyone could make,
complete with output nothing ever printed, and it sat here through
several tracks before someone tried to use it. Staging is a thing you
have to do by hand: render the pad alone, read the peak, compute the
gain, and check the result against the cap yourself.

That is worth more than the lost call. A fabricated transcript in a
document about not fabricating numbers is the same failure as the
"+15dB too loud" figure a few sections up — a plausible illustration
written to make a true point, which then reads as a measurement. If an
example in this file shows output, it should be output something
actually produced. Delete it otherwise.

The principle it was illustrating does hold. Gain is capped at 2, the
honest way to set levels is to render each pad alone, read its peak,
and compute the gain that puts it on target — and when that arithmetic
asks for more than 2, the right response is to say so rather than
silently clamp. Something like:

```js
/* render() takes `only`, a list of pads — not `pads`, and not `solo` —
   and returns a LINEAR `peak`, not a dB one. Both of those were got
   wrong on the first attempt at writing this paragraph. */
const solo   = await render({only:[i], src:'song'});
const peakDb = 20 * Math.log10(Math.max(solo.peak, 1e-6));
const want   = Math.pow(10, (targetDb - peakDb) / 20) * padGain;
if (want > 2) throw new Error('pad '+i+' needs gain '+want.toFixed(1)
  +' to reach '+targetDb+'dB and the cap is 2. The sound is wrong for '
  +'the job, not the level.');
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

## The norms are measured, not recalled

| check | measured from |
|---|---|
| `counterpoint()` | 70 Palestrina scores — 68% of moves between a pair of voices are oblique |
| `harmony()` | J.S. Bach, 370 of the 371 chorales — the semitone/minor-9th class is 1.08% of 179,005 sounding voice-pairs, 94.6% of sonorities state a third, and at least one voice is held through 77.9% of chord changes |
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
