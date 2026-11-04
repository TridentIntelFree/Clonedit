# Making music with this app, if you are an agent

Start with two calls: `howto()` and `review()`. Everything below is what
they return, in prose, and why.

    jbh_howto     the order to work in, and the traps
    jbh_review    every check at once, before a bounce

Both are in the MCP server (`mcp/server.mjs`) and on `window.JBH`.

## SHIPPING IT. READ THIS BEFORE YOU GO LOOKING FOR THE ANSWER

The loop is **build, merge to main, and it is live**. It has run more than
two hundred times. It is three commands and there is no launch step:

```
npm run build                    # tests, lint, vite, emit, smoke -> index.html
git add -A && git commit         # index.html is COMMITTED; CI fails if it drifts from src/
git push origin main             # <- this IS the deploy
```

Live at **https://tridentintelfree.github.io/Clonedit/** within about a minute.

**PUSHING TO MAIN PUBLISHES THE SITE. THERE IS NOTHING ELSE TO RUN.** Pages
is set to *Deploy from a branch* (main, root), so GitHub's own
`pages build and deployment` fires on every push and serves the repository
as it stands — index.html, samples/, icons, the manifest and the service
worker. It is in the Actions tab under that name, it is on run 189, and it
is not one of this repo's workflow files, which is why it is easy to miss:
`.github/workflows/` holds only CI.

Do not "set up hosting", do not weigh hosting options, do not propose an
artifact or a private host, and above all **do not add a Pages workflow**.
One was added in this session and it was pure harm: redundant with a
deployer that had already run 188 times, contending with it for the Pages
environment so that both sat queued, and carrying `enablement: true`, which
can switch the source away from the branch and break the automatic deploy
entirely. It was deleted. If you catch yourself designing a deploy, stop.

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
already installed with 29 reachable checkpoints.

**BUT NOT trio_16bar, AND THE CLAIM THAT USED TO BE HERE IS WRONG.**
This file said it "writes melody, bass and drums as one coherent thing
in about three seconds on CPU", which was never measured. Measured:
16.5 seconds to initialise and **123 seconds to sample two**, and the
material is worse than what is already in the repo —

```
sample 1  melody  4% stepwise, 62% repeats, off-norm 28.1
sample 2  melody 10% stepwise, 69% leaps,   off-norm 28.2
the baked contour corpus averages off-norm 7.9
```

Only one of six voices across two samples landed near the norms. An
unfiltered VAE sample is not better material; it is a lottery ticket
that takes a minute to print. `chord_pitches_improv` with a filter is
the route that works here, which is what `src/pure/contours.js` is.

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

### ensemble() — every layer at once, each against the others

"Can we have write consider each layer of the sequence simultaneously?
Bass on one hi on another synth on another and it create a tune."

`infill()` stays one voice over one span; that constraint is from the
co-creative research and is load-bearing. `ensemble()` does not throw it
away — it writes the voices ONE AT A TIME, foundation first, each one
knowing what the earlier ones already play, and offers whole
ARRANGEMENTS to choose between. The person still chooses; they choose
between ensembles rather than between bass lines.

```
ensemble([{inst:'bass',role:'bass'},{inst:'keys',role:'lead'}], {bars:4, n:5})
ensemble(voices, {bars:4, apply:<seed>})
```

**Order is foundation-first and it matters.** The bass states the
harmony, so it goes first and everything else is written over it. Write
the lead first and the bass has to dodge a line that was not thinking
about it.

**The two inter-voice numbers were already measured here and nothing
used them.** Both are in the norms table further down:

- the semitone/minor-9th class is **1.08% of Bach's 179,005 sounding
  voice-pairs**. `infill()` has always refused it against the CHORD, and
  that filter is blind between voices — a held note from another part is
  not in the chord symbol. `against:` closes that.
- oblique motion is **68% of moves between a pair of Palestrina
  voices**. Two parts moving together on every beat are one part in
  thirds. Scored, never forced: pushing a number is what this file's
  longest section warns about.

**The honest size of the effect.** Measured over four draws of three
voices, writing them independently gave a mean 1.56% clash rate and the
ensemble 1.28% against Bach's 1.08% — closer, and not dramatic, because
two of the four independent draws already had none. The real gain is
that the clash rate is MEASURED at all, so a candidate with 0 in 82
sounding voice-pairs can be picked instead of discovered by ear. The
spread across one offer was 0/82, 0/74, 0/64, 2/77, 5/70, so the
ranking does separate them.

**Register is the other half and is not a counterpoint rule.** Three
voices in the same octave fight however correct their intervals are, so
each voice keeps its instrument's own sampled range. That is what
`place()` says about a mix, one layer up.

**AND THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN, for the commonest
case.** `TAG IT` tags the SELECTED pad, so the ordinary way to work
gives instruments of exactly ONE pad; `infill()` then had `lo === hi`,
its `hi>lo` guard fired, and it substituted a fixed 48–72 for every such
instrument. Measured: pads sampled at 36, 48 and 60 all reported range
48–72, and the one at 36 was written pitches 50–57 — a bass transposed
up a minor seventh. Three tagged pads therefore wrote three parts in one
octave off the same cell library, reported as "it wrote the identical
hits for each thing, did not create song or melody".

The range is centred on the pad's own note now, a fifth either way —
not an octave, because the pitch comes from resampling one recording and
a sample dragged further than that stops sounding like the instrument.

Every test in the infill suite used `instrument()`, which lays down a
pad per note and so never has `lo === hi`. **The common path was the
untested one, for the second time in two sessions** — the span
regression on a fresh board was the same shape. When a convenience
exists for setting up a test, check what configuration it is hiding.

On the WRITE panel it is the **ALL** tick next to the instrument. Roles
are not asked for — an instrument sampled at the bottom of the keyboard
is the bass whatever it is called, so they come from each instrument's
mean sampled pitch: lowest takes bass, highest takes arp, the rest carry
the tune.

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
it.

**AND IT HAS A FALSE POSITIVE THAT COSTS MORE THAN THE BUG IT CATCHES.**
Its scanner sees a quote character and skips to the matching one, so a
**regex literal carrying quote characters** can leave it inside a string
for the rest of the file. It then walks past the next comment opener
without opening a comment, an apostrophe in that comment's prose ends
the stale string, and the comment's CLOSER is reported as *"a comment
was closed that was never opened"* — in a comment that is perfectly well
formed, a hundred lines from the cause.

Two of those were reported in one new test file, from
`/^import .*?from '([^']+)'/` and `/jbh\('([a-zA-Z0-9_]+)'/`. The first
thing tried was rewording the prose at the reported line, which is
treating the symptom and moved the report somewhere else. **Do not trust
the line number.** This locates the real one:

```js
/* paste into node: prints the comment opener that got skipped, and the
   line where the quote that swallowed it was opened */
let inBlock=false,inLine=false,quote='',line=1,qline=0;
for(let i=0;i<src.length;i++){ const c=src[i],d=src[i+1];
  if(c==='\n'){line++;inLine=false;continue;} if(inLine)continue;
  if(inBlock){ if(c==='*'&&d==='/'){inBlock=false;i++;} continue; }
  if(quote){ if(c==='\\'){i++;continue;}
    if(c==='/'&&d==='*') console.log('skipped opener line',line,'- quote open since',qline);
    if(c===quote) quote=''; continue; }
  if(c==='"'||c==="'"||c==='`'){ quote=c; qline=line; continue; }
  if(c==='/'&&d==='/'){ inLine=true; i++; continue; }
  if(c==='/'&&d==='*'){ inBlock=true; i++; continue; } }
```

The fix in the file is `\x27` in place of a literal apostrophe inside a
regex, which carries no quote character at all. The linter itself is
left alone: narrowing it further risks the real fault it was written for,
and it catches that one reliably.

**And writing the closing marker into a comment to EXPLAIN any of this
ends the comment.** That happened here, inside the fix for the linter,
and turned the rest of the paragraph into code — the exact fault the
checker exists to catch, committed while documenting the checker.
Describe the marker; never quote it. Its first draft flagged seven places and all seven were object
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

## The norms are measured, not recalled

| check | measured from |
|---|---|
| `counterpoint()` | 70 Palestrina scores — 68% of moves between a pair of voices are oblique |
| `harmony()` | J.S. Bach, 370 of the 371 chorales — the semitone/minor-9th class is 1.08% of 179,005 sounding voice-pairs, 94.6% of sonorities state a third, and at least one voice is held through 77.9% of chord changes |
| `melody()` | Essen Folksong Collection, 8514 melodies |
| `motif()` | 8196 of those melodies, bucketed by length: recurrence above the same intervals reshuffled is about +28 overall, +51 for lines of 96 notes or more |
| `recipe()` | Groove MIDI Dataset, 1,138 takes and 20,528 bars — one bar of one drum voice as ten drummers played it, in `src/pure/grooves.js` |

The scripts that produced them are in `scripts/study-*.py`. A random walk
scores about +7 on `motif()`; that gap is the whole point of the measure.

**`recipe()` is measured for DRUMS and composed for everything else, and
it says which per voice.** `measured` is a map, not a flag, and `drew`
names the style, the figure and the share of bars it holds. Three things
about that table are worth knowing before you use it:

- **A corpus bar is not a loop.** A bar in the data is a bar in
  CONTEXT — the drummer dropping out, building up, ending a phrase. The
  second commonest rock kick bar is a single hit on beat two, which is a
  pickup. Figures are filtered for loopability at SELECTION time, not in
  the table, so what was measured stays readable.
- **Some voices have no figure to give, and are refused.** Reggae's best
  loopable snare bar holds 1.8% of its bars, jazz's 2.9%. Those compose
  instead and report `measured.snare === false`.
- **Velocity is comparable within a voice, never across voices.** Kick
  figures average 0.21–0.92 by style while snares sit at 0.9–1.0 in all
  thirteen; every drummer in every style hitting the kick softer than
  the snare is a property of the electronic kit, not the music. Each
  figure is scaled by its own loudest stroke. Do not read a cross-voice
  balance off this table.

## mutate() cannot make a new sound, and will be asked to

`mutate()` turns the PAD'S OWN KNOBS and nothing else: filter, drive,
crush, the envelope, EQ, pitch, start, the two sends, reverse. It renders
the pad, measures it, tries variations and keeps the best. **It never
touches the audio.** The most transformed thing it can return is your
sample with a filter on it, and that is its ceiling however well it works.

Measured through the button on a piano strike, working correctly:

```
ftype off->lowpass, fcut 1->0.56 (1.1kHz), eqLo +1.9dB, gain 0.9->0.81
7.5dB rms of spectral difference, peak within 0.1dB
```

Audible, correct, and still just a filtered piano.

So when someone asks for a sound that is *significantly different* — and
they will, because "mutate" promises more than a knob search can deliver —
**the tool is `resynth()`, REBUILD PAD.** That one rebuilds the target out
of blocks of the other loaded pads, so the substance is genuinely new. It
wants several pads loaded to draw from; with one pad there is nothing to
rebuild from but itself.

A session was spent fixing three real faults in mutate — it demanded the
pad be sequenced first, it discarded its own winner, and it scored a muted
pad as a triumph — and all three were worth fixing. But the person was
asking for transformation the whole time, and mutate was never going to
give it to them. Say which tool does the job before improving the one that
cannot.

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


## The findings are in docs/findings.md

This file is the operating manual: the order to work in, the live
traps, and how to ship. It used to also carry every post-mortem this
repo has written, and at 141KB it was injected into a session on
every single turn — about 35,000 tokens before a word was said. The
long accounts are in `docs/findings.md` now, nothing deleted and
nothing summarised, and they are worth reading when you touch the
thing they are about:

- [A SPAN IS CAPPED AT FOUR BARS, because a pattern is](docs/findings.md#a-span-is-capped-at-four-bars-because-a-pattern-is)
- [One voice has to see the others, and the panel never let it](docs/findings.md#one-voice-has-to-see-the-others-and-the-panel-never-let-it)
- [`gate` existed and had no control](docs/findings.md#gate-existed-and-had-no-control)
- [A part does not have to start at bar 1](docs/findings.md#a-part-does-not-have-to-start-at-bar-1)
- [A CONTROL MUST NOT OFFER WHAT CANNOT WORK](docs/findings.md#a-control-must-not-offer-what-cannot-work)
- [FEEL is a cross-rhythm and cannot be a triplet](docs/findings.md#feel-is-a-cross-rhythm-and-cannot-be-a-triplet)
- [DEMO — one tap builds four bars](docs/findings.md#demo--one-tap-builds-four-bars)
- [SURPRISE builds a whole track, in one of ten genres](docs/findings.md#surprise-builds-a-whole-track-in-one-of-ten-genres)
- [Sixteen recipes, and legacy.js is not one flat scope](docs/findings.md#sixteen-recipes-and-legacyjs-is-not-one-flat-scope)
- [Velocity has to change the TIMBRE, not just the level](docs/findings.md#velocity-has-to-change-the-timbre-not-just-the-level)
- [Two voices moving into the same perfect interval FUSE](docs/findings.md#two-voices-moving-into-the-same-perfect-interval-fuse)
- [A drum has a pitch, and the pad's pitch knob was invisible](docs/findings.md#a-drum-has-a-pitch-and-the-pads-pitch-knob-was-invisible)
- [The MCP server had never been started by anything](docs/findings.md#the-mcp-server-had-never-been-started-by-anything)
- [What the handshake was not saying](docs/findings.md#what-the-handshake-was-not-saying)
- [Six calls had no tool, and one of them was the headline feature](docs/findings.md#six-calls-had-no-tool-and-one-of-them-was-the-headline-feature)
- [It loaded the app as a FILE, so no pack could ever load](docs/findings.md#it-loaded-the-app-as-a-file-so-no-pack-could-ever-load)
- [The written layer had no onboarding either](docs/findings.md#the-written-layer-had-no-onboarding-either)
- [Driving the controls is the only way to find these, and it misleads](docs/findings.md#driving-the-controls-is-the-only-way-to-find-these-and-it-misleads)
- [Writing works with no connection. The app did not OPEN with no connection](docs/findings.md#writing-works-with-no-connection-the-app-did-not-open-with-no-connection)
- [The fifth free check: do the notes fit the chords](docs/findings.md#the-fifth-free-check-do-the-notes-fit-the-chords)
- [What those four actually say, on a track that is not broken](docs/findings.md#what-those-four-actually-say-on-a-track-that-is-not-broken)
- [Form is measured outside the app, by one script](docs/findings.md#form-is-measured-outside-the-app-by-one-script)
- [One sound at a time, not a palette](docs/findings.md#one-sound-at-a-time-not-a-palette)
- [A thrown note is a silent note; a thrown TICK is a broken app](docs/findings.md#a-thrown-note-is-a-silent-note-a-thrown-tick-is-a-broken-app)
- [It takes `lk.len` to reproduce, and the first test did not have one](docs/findings.md#it-takes-lklen-to-reproduce-and-the-first-test-did-not-have-one)
- [The same shape is in the bow path](docs/findings.md#the-same-shape-is-in-the-bow-path)
- [And an UPLOADED file has no manifest at all](docs/findings.md#and-an-uploaded-file-has-no-manifest-at-all)
- [One dynamic's worth of alternates is not dynamics](docs/findings.md#one-dynamics-worth-of-alternates-is-not-dynamics)
- [Two layers of one sample do not simply add up](docs/findings.md#two-layers-of-one-sample-do-not-simply-add-up)
- [There is no correct tonal balance either, only a correct one for this piece](docs/findings.md#there-is-no-correct-tonal-balance-either-only-a-correct-one-for-this-piece)
- [audit(sound) — did the sound come out the way you meant it to](docs/findings.md#auditsound--did-the-sound-come-out-the-way-you-meant-it-to)
- [Nothing in this app looks at the time axis](docs/findings.md#nothing-in-this-app-looks-at-the-time-axis)
- [Making sounds, not just judging them](docs/findings.md#making-sounds-not-just-judging-them)
- [This file has been tested by use, and that is how it should be read](docs/findings.md#this-file-has-been-tested-by-use-and-that-is-how-it-should-be-read)
- [The corpus does not reduce to a table, and two shapes had to fail first](docs/findings.md#the-corpus-does-not-reduce-to-a-table-and-two-shapes-had-to-fail-first)
- [Counting up from 1 explored one corner of the space](docs/findings.md#counting-up-from-1-explored-one-corner-of-the-space)

**Add new findings there, not here.** What belongs in this file is a
rule short enough to follow without the story behind it; the story
goes beside the others. A document that is read on every turn has to
earn its length, and that is a cost the person using it pays.
