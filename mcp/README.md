# jbh88-mcp

JBH-88 as MCP tools, so an agent can build in the real engine instead of
guessing at JSON — load the actual sounds, write the actual steps, render the
actual mix, and **read the level back**.

That last part is the point. An agent composing blind cannot tell that the hats
came out inaudible. One that can call `jbh_render` and see `peak: 0.004` can fix
it before you ever hear it.

**Start with `jbh_howto`, then `jbh_review`.** The first returns the order to
work in and the traps that are not guessable from the API — a pack that names
its samples an octave off, gain being a multiplier on whatever a pad holds, a
beat that is on the grid and still inaudible. The second runs every analyser,
sorts the findings by severity, and says which checks it could not reach.

For a while this server exposed thirty-four tools and not one of them was an
analyser, which made the paragraph above false: an agent could write and render
and had no way to listen. A track was bounced that way using six of the
seventeen checks the app has, and the three that would have caught what the
listener complained about were among the eleven skipped. `AGENTS.md` at the
repo root has the rest of that story and the traps in full.

## Setting it up

```json
{
  "mcpServers": {
    "jbh88": {
      "command": "node",
      "args": ["/path/to/Clonedit/mcp/server.mjs"],
      "env": { "JBH_APP": "/path/to/Clonedit/index.html" }
    }
  }
}
```

`JBH_APP` is optional — the server looks for `index.html` next to its own
checkout, then in the working directory. `CHROME_PATH` is optional too; it finds
the usual Chromium locations on its own.

```sh
cd mcp && npm install
```

It needs a Chromium. If you have none, `npx playwright install chromium`.

## What it does, and what it cannot

The server owns a **headless browser** with the app loaded, and forwards calls
into `window.JBH`. There is no second implementation of anything: if a tool here
disagreed with the app, the app would be right.

**It cannot reach a copy of the app open on your phone.** The browser here is its
own instance, in this process, and nothing it plays is audible to anyone — the
audio renders offline. Work reaches a person as a **file**:

- `jbh_save_session` writes a `.json` you open with **PROJ → LOAD .JSON**. Every
  pad, pattern, lock, tape lane and setting, with the audio embedded.
- `jbh_render` with `wav_path` writes a `.wav` you can just listen to.

Driving the instance in someone's hand, live, is a different problem: it needs a
relay between two machines, and this is not that.

## The tools

| Tool | What it does |
| --- | --- |
| `jbh_state` | What is loaded and playing. Call it first, and after anything that should have changed something. |
| `jbh_params` | **Every writable field and its current value**, read off the live objects. Call this instead of guessing that the reverb is `revType`. |
| `jbh_schedule` | **When every note lands** — the bounce's own event list, from the same loop that builds the file. Time, pad, pitch, real MIDI, velocity. Use it instead of analysing the WAV. Its `stretched` field names any recorded instrument being transposed too far to still sound like itself. |
| `jbh_levels` | A per-pad balance table in one call: peak, RMS, dB against the full mix, and which pads are buried. |
| `jbh_nearest` | The sample closest to a MIDI note, and how many semitones away. Pitch is playback rate here, so this is how you keep a piano sounding like one. |
| `jbh_batch` | Several calls in one crossing; a failure is reported in place rather than taking the batch down. |
| `jbh_clear` | An empty session. A freshly opened app holds a demo song, and pads you don't overwrite ride along in every file you save. |
| `jbh_presets` / `jbh_load_preset` | The sounds the app synthesises in the page. No network, always work. |
| `jbh_pack` / `jbh_load_sound` | Downloadable sample packs. Needs a connection once. |
| `jbh_step` | One step, with its locks — pitch, probability, ratchet, nudge, and the sound locks (cutoff, level, pan, decay, start). |
| `jbh_pad` / `jbh_lane` / `jbh_live` | Read or write a pad, a tape lane's clip, or the LIVE instrument. |
| `jbh_pattern` | The pattern's own shape: length (16/32/48/64), a per-pattern tempo, the silencer row, and `len` — a track shorter than the pattern is **polymeter** and phases against it. Also copy and clear. |
| `jbh_poly` | **A pad with its own BPM.** Against a project at 100: 300 is triplets, 500 is quintuplets, 75 is three hits per bar against four beats. Per-cell locks carry the pitch, so a figure can be a melody rather than one repeated note. |
| `jbh_euclid` | N hits spread as evenly over K steps as a number allows. |
| `jbh_set` / `jbh_transport` / `jbh_hit` | Tempo and the rest; play and stop; hit a pad in time. |
| `jbh_render` | Bounce and report length, peak, RMS, clipping, silence. `only` renders a STEM; `loudness` adds integrated LUFS, true peak and crest — the terms a release is judged on. Optionally write a WAV. |
| `jbh_automate` | A line that moves while the bar plays: crescendo, a filter opening across the pattern. Says whether the target is baked into the bounce or live only. |
| `jbh_auto_targets` | What can be automated, and where each sits now. |
| `jbh_layer` | Stack another recording of the same note on a pad. With `layMode:'vel'` the engine picks by how hard the note is struck — the one thing no filter can imitate. |
| `jbh_instrument` / `jbh_note` / `jbh_figure` | **Write notes, not pads.** Lay an instrument across a range, then write notes and chords by MIDI number; the pad and the semitone offset are worked out for you, and a figure's cells are grouped by register so nothing is stretched far. |
| `jbh_save_session` / `jbh_load_session` | The file a person opens. |
| `jbh_song_doc` | The compact text format — smaller, readable, but sixteen pads only and no tape lanes or instrument. |
| `jbh_call` | Any `window.JBH` method by name. Covers anything added after these tools were written. |

## A session, start to finish

```
jbh_presets                                  → see what there is
jbh_load_preset  {id:"dkick",  pad:0}
jbh_load_preset  {id:"dsnare", pad:1}
jbh_step         {pad:0, step:0,  vel:0.95}
jbh_step         {pad:2, step:7,  vel:0.6, locks:{fcut:0.18, pan:-0.4}}
jbh_set          {props:{bpm:94, swing:0.12}}
jbh_render       {loops:2}                   → peak 0.92, not silent. Good.
jbh_save_session {path:"beat.json", name:"first idea"}
```

Then open `beat.json` in the app with **PROJ → LOAD .JSON**.
