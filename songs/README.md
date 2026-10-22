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
| `three-bodies.mjs` | contrapuntal, C dorian, 140bpm. Three voices on 3/5/8-step cycles so they rarely move together, meeting at the bar line. Synthesised palette, long overlapping tails. |
| `subsidence.mjs` | dark and heavy, 168bpm. Field recordings for percussion, a three-layer bass — sine sub for weight, octave for the note, Reese and FM growl for dirt. |
| `salvage.mjs` | 150bpm, every percussion sound a field recording: a door knock is the kick, breaking glass the snare, a dripping tap the hi-hat. |

Each one ends by asking the app what is wrong before it bounces —
`critique()`, `translate()`, `counterpoint()`, `loudness()` — and those
answers are printed as it runs. Reading that output is most of the point.
