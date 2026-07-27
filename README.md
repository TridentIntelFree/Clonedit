# JBH-88

An offline sampler, sequencer and groovebox that runs in a browser. Build a drum
kit from any sound, program euclidean polyrhythms, morph one pattern into
another, record live takes to tape lanes, and bounce the result to WAV — with no
connection and nothing sent anywhere.

## What is what

| Path | What it is |
| --- | --- |
| `src/` | **The source.** Edit here. `index.html` (markup), `app.css`, `legacy.js` (the engine), `pure/` (logic, unit-tested), `lib/*.svelte` (components). |
| `tests/` | Node unit tests for `src/pure/`. No browser — they run in under a second. |
| `index.html` | **The app — generated.** One self-contained file: open it, serve it, or install it as a PWA. Built from `src/`; do not edit by hand. |
| `standalone.html` | A frozen, hand-written snapshot of R96, kept as a build-free fallback. See below. |
| `samples/` | Bundled CC0 sound packs (VSCO-2 CE, plus synthesized drums). |
| `icons/`, `manifest.webmanifest`, `sw.js` | PWA install and offline shell. |

## Building and running

```sh
npm install
npm run build     # src/ -> a single self-contained index.html at the repo root
npm run dev       # hot-reloading dev server while you work
```

`npm run build` is the only way `index.html` changes. It is committed because
there is no CI — that file *is* the deployment — so **build before you push** or
the deployed app will lag behind the source.

The build will not publish an app that does not work. Output is staged as
`index.next.html`, loaded in a real browser from a real server, and only
promoted to `index.html` once it has booted: 64 pads, the engine present, all
ten tabs opening, the sequencer running, no JS errors. If any of that fails,
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
npm test     # 46 unit tests, ~0.25s, no browser
```

`src/pure/` holds everything with no DOM, no Web Audio and no app state:
euclid, the groove tables, the pattern model, scale snapping, the morph maths,
impulse-response sizing, numeric helpers. Because it is importable in Node, its
properties can be asserted directly — that euclid is maximally even for every
combination up to 32 steps, that snapping to a scale is idempotent, that a morph
cell never flips back once it has crossed. `npm run build` runs these first and
stops if any fail.

Everything else is covered by browser-driven scripts that drive the real UI by
element ID. They are the safety net for the migration: as long as the IDs stay
stable, they keep validating each step.

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

The app grew to ~9,000 lines in one file, which is why `src/` exists. The
migration is deliberately incremental and is guarded by a browser-driven
verification suite that drives the real UI by element ID — as long as the IDs
stay stable, those scripts validate every step.

1. ~~Stand up Vite + Svelte; split out CSS and JS; build back to a single
   self-contained `index.html`.~~ **Done (R97)** — all thirteen verification
   scripts pass against the built file, and the global name set was diffed
   before and after to prove nothing went missing.
2. ~~Extract the pure logic into modules that can be unit-tested in Node.~~
   **Started (R99)** — euclid, groove, pattern model, scale, morph, IR sizing
   and numeric helpers are in `src/pure/` with 46 tests. Still to move: the WAV
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
