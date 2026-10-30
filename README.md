# JBH-88

An offline sampler, sequencer, synthesiser and multitrack recorder that runs in
a browser. Build a drum kit from any sound, program euclidean rhythms, give one
pad a tempo of its own, give one *step* its own cutoff and decay, play thirteen
synth voices through a pedalboard and a tuneable room, record live takes to tape
lanes and punch in over them, then bounce the result to WAV — with no connection
and nothing sent anywhere.

Everything ships as **one self-contained HTML file**. No server, no install, no
account; open it from a file:// URL if you like. It is about 1.3 MB.

### The sections

Navigation is two rows. The top one holds five activities — **SOUND**,
**WRITE**, **PLAY**, **MIX**, **SONG** — and is always wholly on screen; the
row under it holds the tabs of whichever activity is open, and is not drawn at
all when an activity has one (WRITE and SONG are a single tap). The bar this
replaced held all twelve tabs and scrolled sideways, which hid half of them.

| Activity | Tab | What it does |
| --- | --- | --- |
| SOUND | **PADS / SMPL** | 64 pads across four banks. Import, record from the mic, or synthesise a sound from PRESETS; chop, trim, warp, reverse, slice on transients. BUILD KIT carves a whole kit out of one sample. |
| SOUND | **TOOLS** | PAINT a sound from inharmonic partials, REBUILD one out of the pieces of your other pads, FREEZE an instant of it into something that sustains, RUN TO TAPE for a pitch that will not hold still, and MUTATE to vary a sound and keep what measures best. All five act on the pad the tab names at the top. |
| WRITE | **SEQ** | 16–64 steps, grid or circle view. Per-track lengths for polymeter, euclidean fills, groove templates, a NOTES lane for melodies, POLY for a pad at its own tempo, and **step locks** — give one step its own pitch, probability, ratchet, nudge, cutoff, level, pan, decay or start point. |
| PLAY | **TRAX** | Eight tape lanes with a **Track View**: headers left, bar ruler on top, clips drawn where they play. Drag to move, drag the edges to trim, fades, and **punch in/out** that replaces a span and keeps the rest. |
| PLAY | **LIVE** | Thirteen synth voices — including phase distortion, PWM, a partial cluster, formant, ring modulation and a per-note **grand piano** — through DRIVE, CHORUS, PHASER, TREMOLO and a tuneable ROOM. Nine ways to play them, a keyboard that is always on screen, and a tombola where notes bounce inside a spinning shape. |
| PLAY | **MIC / AMP** | Record a voice, or play a guitar or line input through an amp simulation. |
| PLAY | **DJ** | Two decks with performance filters. |
| PLAY | **MIDI** | USB MIDI where the browser has it, plus BLE MIDI over Web Bluetooth; clock in and out at 24 PPQN, notes out to hardware, CC mapping. |
| MIX | **MIX / OUT** | Per-pad faders and sends, sidechain ducking, and a mastering chain. REVIEW MIX runs every analyser at once; BALANCE solves the group levels against a loaded reference. |
| SONG | **PROJ** | WAV bounce, per-pad stems and MIDI export. Named projects, undo history, autosave to IndexedDB, a portable text **song document** format, and **AGENT LINK**. |

### Driving it from an agent

`window.JBH` is the whole app as an API — sounds, pads, steps, tape lanes, the
LIVE instrument, the transport — and it works *while the thing is playing*.

```js
JBH.calls()                       // everything callable
JBH.params()                      // every writable field, and its value now
JBH.clear()                       // an empty session, not the demo song
JBH.presets()                     // synthesised sounds, no network
await JBH.preset('dkick', 0)      // render one onto pad 1
await JBH.pack(); await JBH.sound('kick_acoustic', 1)   // downloadable packs
JBH.step(0, 4, 1, { fcut: 0.2 })  // a step, with its sound lock
JBH.pattern(0, { plen: 64, len: { 3: 7 } })   // 4 bars; pad 3 phases on 7
JBH.poly(5, { on: true, bpm: 300, cells: 3,   // a pad with its OWN tempo:
  row: [[0, .9, { pitch: 0 }], [1, .6, { pitch: 3 }], [2, .7, { pitch: 7 }]] })
JBH.euclid(2, 5, 16)              // 5 hits spread over 16
JBH.lane(2, { start: 4.0 })       // move a tape clip
JBH.live({ voice: 'piano' })
JBH.set({ bpm: 128 }); JBH.play(); JBH.hit(0, 0.9)      // live, in time
await JBH.render()                // bounce and read peak/RMS back
```

`render()` matters most: an agent that cannot hear what it made is composing
blind. It returns the measurements, and the WAV bytes if asked.

`params()` matters nearly as much. Every effect in the app was always
reachable — `set()`, `pad()`, `lane()` and `live()` each write any field of
the thing they own — but nothing said the reverb is `revType`/`revSize`/
`revLvl` or that the master chain is the `m`-prefixed block, and a name you
have to guess is not an API. `params()` reads the lot off the live objects,
so it cannot drift: 68 session fields, 55 per pad, 31 on the instrument, 17
on a tape lane.

`poly()` is the one thing the step grid genuinely cannot express. A pad's BPM
counts **its own hits** per minute, so against a project at 100, 300 is
triplets and 500 is quintuplets — real polyrhythm, not a tuplet drawn on a
16th grid. Pair it with `pattern({len})`, where a track shorter than the
pattern phases against it, and three divisions of the beat can run at once.

`sound(id, pad)` puts it on **that** pad — it replaces what is there rather
than wandering off to an empty one, asks nothing, and throws if the download
or the decode fails. A kit laid out by index stays where it was put.

```js
await JBH.instrument('piano', { pack, match:'vsco:piano', lo:36, hi:89 })
JBH.note('piano', [50,53,57], 0, .7, { beats: 2 })  // a chord, held two beats
await JBH.figure('flute', { bpm:345, cells:5, notes:[[0,74,.3],…] })
JBH.automate('mfilt', [[0,.1],[15,1]])              // a filter across the bar
await JBH.schedule()              // every note the bounce will play
await JBH.levels()                // per-pad balance in dB, and what's buried
await JBH.render({ only:[0,1], loudness:true })     // a stem, and LUFS
JBH.nearest(61, 'piano')          // the closest real sample, and the bend
await JBH.batch([['step',0,0,1], ['pad',0,{gain:.8}]])   // one crossing
```

`instrument()` / `note()` / `figure()` are the ones to reach for. Everything
else here is pad-shaped and music is not: a part means choosing a sample per
note, loading enough roots that none is bent far, allocating pads, and
merging what lands on one pad at one step into a chord. That is the same
eighty lines for everybody, and getting it wrong does not fail loudly — it
just comes out sounding like a cheap synthesiser.

A note can say when it **ends**, too: `{ beats: 2 }` or `{ len: 1.2 }`.
Without that a step says when a note starts and nothing about when it stops,
so a crotchet and a semiquaver come out identical.

`schedule()` is the renderer's own event list, returned from inside the same
loop that builds the file — not a second opinion about it. Reach for it
instead of analysing the rendered WAV: an onset detector written to check
some tuplet figures reported 146 onsets for four piano notes, twice. The app
has always known exactly when every note lands.

**Sample packs.** `pack(url)` takes this app's own `.json` manifest or an
**`.sfz`** — the format nearly every free library ships, which states which
recording plays at which note, dynamic and alternate, and which are release
samples. `instrument()` turns that into velocity bands with round-robin
alternates, a crossfade across the band edges, and the release recordings
attached. In the app, **SMPL → SAMPLE PACKS → IMPORT FROM THIS DEVICE** takes
an `.sfz` plus its audio, or loose audio files mapped from their filenames
(`A4v8`, `C#3`, `Snare_mf_rr3`, `rel1`), and reports what it worked out so a
wrong guess is visible.

**One recording per note is not an instrument.** `samples/salamander.json`
is the Salamander Grand Piano (Alexander Holm, CC-BY 3.0): a Yamaha C5
sampled every minor third with sixteen recorded dynamics. `instrument()`
stacks several of them on each pad as velocity layers, and `layMode:'vel'`
picks between them by how hard the step was struck. Measured on one note,
that is 31 dB of timbre between pianissimo and fortissimo. A filter and a
waveshaper over a single mezzo sample manage about 16 dB, and it does not
sound the same, because a loud note on a piano is a different event rather
than a brighter one.

**Transposing a sampled instrument is not free.** Pitch is playback rate
unless `keepTime` is on, and a piano moved a fifth stops sounding like a
piano — the hammer noise and the beating of the unisons move with it. For
anything acoustic, load a root near every note you mean to play and bend it
a semitone, rather than stretching one sample across an octave. `nearest()`
picks that root for you, and `schedule().stretched` names any recorded
instrument being bent further than you meant — it ignores drums, where
pitching a sample around is ordinary technique rather than a mistake.

**AGENT LINK** (PROJ) exposes the same API *outside* the page, over
`postMessage` and `BroadcastChannel('jbh88')` — same device, no server,
nothing sent anywhere. Envelope in: `{jbh:1, id, call, args}`. Out:
`{jbh:1, id, ok, result}`. `JBH.say()` and `JBH.tell()` carry a line of text
each way so you can talk to whatever is driving it.

It is **off until you switch it on, and off again on reload** — an app that
answers to any tab on its origin the moment it loads is a different
proposition. Text arriving over the link is rendered as text, never as markup.

The directions are **in the app**, not only here: PROJ → AI & AGENTS →
*How do I connect one?* carries the MCP config and the console snippet with
copy buttons, and unfolds itself the first time you open the link with nothing
on the other end. It is also honest about the limit — nothing can reach the
copy of the app on your phone from another device, because there is no server
anywhere in this project. Live control of *that* screen needs a relay in the
middle, and there isn't one.

The older **AI JAM** paste-a-document flow still works and still needs no
connection of any kind, but it is one-way and only reaches sixteen pads; the
link above is the live path.

## What is what

| Path | What it is |
| --- | --- |
| `src/` | **The source.** Edit here. `index.html` (markup), `app.css`, `legacy.js` (the engine), `pure/` (logic, unit-tested), `lib/*.svelte` (components). |
| `tests/` | Node unit tests for `src/pure/` (no browser, under a second), plus `tests/browser/` — eighteen suites that drive the real app in Chromium, including a stress suite that property-tests, soaks and fuzzes rather than asking questions somebody already thought of. |
| `index.html` | **The app — generated.** One self-contained file: open it, serve it, or install it as a PWA. Built from `src/`; do not edit by hand. |
| `standalone.html` | A frozen, hand-written snapshot of R96, kept as a build-free fallback. See below. |
| `samples/` | CC0 sound packs, served **beside** the app rather than inside it. Loading one is a network fetch and each sound is downloaded to IndexedDB before it can be used — the app itself ships no audio. |
| `icons/`, `manifest.webmanifest`, `sw.js` | PWA install and offline shell. |

## Building and running

```sh
npm install
npm run build     # src/ -> a single self-contained index.html at the repo root
npm run dev       # hot-reloading dev server while you work
```

`npm run build` is the only way `index.html` changes. It is committed because
that file *is* the deployment, so **build before you push** or the deployed app
will lag behind the source. `.github/workflows/ci.yml` runs the unit tests, the
build, a check that the committed `index.html` matches what `src/` produces, and
the browser suites on every push.

The build will not publish an app that does not work. Output is staged as
`index.next.html`, loaded in a real browser from a real server, and only
promoted to `index.html` once it has booted: 64 pads, the engine present, all
twelve tabs opening, the sequencer running, no JS errors. If any of that fails,
**`index.html` is left exactly as it was** and the build exits non-zero — the
link you have handed out keeps working. The failing build is left at
`index.next.html` to inspect.

That needs a browser. If none can be found the build stops rather than
publishing something unverified; install one with `npx playwright install
chromium`, or set `CHROME_PATH`. `npm run build -- --skip-smoke` overrides it,
and you should know why you are doing that.

To just run what is already built, no toolchain needed:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

A plain `file://` open works too, except that service-worker install and a few
`fetch`-based sample loads need an origin, so a local server is better.

### Testing

```sh
npm test                      # 81 unit tests, well under a second, no browser
node scripts/browser-tests.mjs   # 18 suites against the built index.html, ~8 min
node scripts/browser-tests.mjs guides   # or just one
```

`src/pure/` holds everything with no DOM, no Web Audio and no app state:
euclid, the groove tables, the pattern model, scale snapping, the morph maths,
impulse-response sizing, numeric helpers. Because it is importable in Node, its
properties can be asserted directly — that euclid is maximally even for every
combination up to 32 steps, that snapping to a scale is idempotent, that a morph
cell never flips back once it has crossed. `npm run build` runs these first and
stops if any fail.

Everything else lives in `tests/browser/`, which boots the built `index.html`
in Chromium and drives the real UI. These exist because most of what this app
claims cannot be checked any other way: whether a step the grid does not show
can still be *heard*, whether a bounce matches what was played, whether a
project from a future build is refused, whether the guides still point at
controls that exist — and whether a panel that "opens" actually lands somewhere
a person can see it, which is a bug that shipped once with a passing test beside
it.

### Why the engine is still one big file

`src/legacy.js` holds ~370 top-level declarations that are *true globals* — the
app, the browser console and the verification suite all read **and write** them
(`workBuf = b`, `morphBuf = null`). ES module bindings cannot be assigned from
outside, so bundling it as a module would silently break every one of those. It
is injected as a classic inline script with identical semantics, and logic moves
out of it into real modules deliberately, a piece at a time — not in one jump.

## The standalone fallback

`standalone.html` is a complete, working copy of the app as a single
hand-written file. It exists so there is always a version that runs with **no
build step at all**.

It is a snapshot, not a second copy under maintenance — it will drift behind
`index.html`, and that is the intended trade. To move the fallback forward
deliberately:

```sh
cp index.html standalone.html    # then re-add the banner at the top
```

It lives at the repository root on purpose: `samples/`, `icons/` and
`manifest.webmanifest` resolve relative to it, so moving it into a subfolder
would break sample loading and PWA install.

## Migrating to Svelte

The app grew past 18,000 lines in one file, which is why `src/` exists. The
migration is deliberately incremental and is guarded by a browser-driven
verification suite that drives the real UI by element ID — as long as the IDs
stay stable, those scripts validate every step.

1. ~~Stand up Vite + Svelte; split out CSS and JS; build back to a single
   self-contained `index.html`.~~ **Done (R97)** — all thirteen verification
   scripts pass against the built file, and the global name set was diffed
   before and after to prove nothing went missing.
2. ~~Extract the pure logic into modules that can be unit-tested in Node.~~
   **Started (R99)** — euclid, groove, pattern model, scale, morph, IR sizing
   and numeric helpers are in `src/pure/` with 81 tests. Still to move: the WAV
   encoder's byte packing and the DSP maths (time-stretch,
   peak/RMS analysis) once buffer access is abstracted.
3. Convert the UI tab by tab into Svelte components.

`src/lib/About.svelte` is the first component, mounted into the PROJ tab.

Nothing about the shipped artifact changes: the build emits one inlined HTML
file, so "it is just an HTML file you can open" stays true.

## Licensing

Bundled audio is CC0 (VSCO-2 Community Edition, and drums synthesized for this
project); see `samples/LICENSE.txt` for provenance. Pixabay material is
deliberately **not** bundled — its licence forbids redistribution and
standalone use.
