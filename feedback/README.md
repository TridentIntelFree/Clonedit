# Reading beta reports

The **PROJ → REPORT A PROBLEM** panel writes plain Markdown. Nothing has to be
decoded, unpacked, or forwarded as a file.

## The normal path: the issue tracker

**POST TO THE ISSUE TRACKER** opens
`github.com/TridentIntelFree/Clonedit/issues/new` with the whole report already
written into the form — description, build, device, and the engine diagnostics
folded into a `<details>` block. The tester presses **Submit** and it is filed,
labelled `beta report`.

To read them, just look at the issues, or ask Claude to. They are ordinary
issues: readable, searchable, and repliable.

Two things to know:

- It needs a GitHub account.
- **The repository is public**, so anything typed into the box is public. The
  panel says so plainly rather than promising privacy it cannot deliver.

## The private path: COPY

**COPY IT INSTEAD** puts the identical report on the clipboard as plain text,
for a tester who has no GitHub account or would rather send it privately. Paste
it into a message or email; paste it to Claude and it reads as-is.

**PREVIEW** prints the exact report into the diagnostic log first, so nobody has
to take on trust what is being sent.

## What the diagnostics contain

Engine state only: pad slots and their levels, buffer counts, audio-context
state, MIDI mappings, and the recent gain/error logs. **No project names, no
sample names, no audio, no location, no identifiers.** Unticking *attach
diagnostics* leaves them out entirely.

## `decode.js` — for old reports only

Reports used to be packed into an opaque `jbhfb1:` base64 blob, which is what
made them awkward: a phone would hand you a file with nowhere useful to send it,
and reading it needed this decoder.

`decode.js` is kept for blobs collected before R105:

```sh
node feedback/decode.js "<jbhfb1:… blob>"   # decode one
node feedback/decode.js path/to/file.txt    # decode blobs in a file
node feedback/decode.js                     # decode inbox.json + reports/
```

`worker.js` and `inbox.json` belong to that older relay-based route. Nothing
depends on them now; they are left in place in case a self-hosted inbox is ever
wanted instead of the issue tracker.
