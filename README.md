# JBH-88

An offline sampler, sequencer and groovebox that runs in a browser. Build a drum
kit from any sound, program euclidean polyrhythms, morph one pattern into
another, record live takes to tape lanes, and bounce the result to WAV — with no
connection and nothing sent anywhere.

## What is what

| Path | What it is |
| --- | --- |
| `index.html` | **The app.** One self-contained file — open it, serve it, or install it as a PWA. This is what gets deployed. |
| `standalone.html` | A frozen, hand-written snapshot of R96, kept as a build-free fallback. See below. |
| `src/` | Source the app is being migrated to (Vite + Svelte). Not yet the source of `index.html`. |
| `samples/` | Bundled CC0 sound packs (VSCO-2 CE, plus synthesized drums). |
| `icons/`, `manifest.webmanifest`, `sw.js` | PWA install and offline shell. |
| `feedback/` | Beta feedback inbox and the decoder for reading it. |

## Running it

Nothing to install:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

A plain `file://` open works too, except that service-worker install and a few
`fetch`-based sample loads need an origin, so a local server is better.

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

1. Stand up Vite + Svelte; split out CSS and JS; build back to a single
   self-contained `index.html` so deployment and offline behaviour are unchanged.
2. Extract the pure logic (euclid, groove, morph, pre-verb, impulse responses,
   persistence) into modules that can be unit-tested in Node without a browser.
3. Convert the UI tab by tab into Svelte components.

Nothing about the shipped artifact changes: the build emits one inlined HTML
file, so "it is just an HTML file you can open" stays true.

## Licensing

Bundled audio is CC0 (VSCO-2 Community Edition, and drums synthesized for this
project); see `samples/LICENSE.txt` for provenance. Pixabay material is
deliberately **not** bundled — its licence forbids redistribution and
standalone use.
