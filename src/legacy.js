'use strict';
/* ================================================================
   JBH-88 — sampling workstation (rebuild of final form)
   Fixes carried forward:
   - Gain fan-out: per-pad channel/pan/send nodes are built ONCE and
     connected ONCE to the buses. Per-hit sources connect only into
     their pad's persistent channel. No repeated bus connections.
   - Init ordering: audio graph + timing offsets fully established
     before any scheduler or clock-derived value is read.
   - iOS file picker: no accept attribute on file inputs.
   - Mic errors: specific handling for NotAllowedError, NotFoundError,
     NotReadableError, SecurityError (Lockdown Mode hypothesis).
   - Version stamp to confirm deployed build identity.
   - R11: background-return silence — full revival ladder (resume →
     element replay → stream rebuild → context rebuild + watchdog).
   - R12: restore correctness — playback position (pattern, bank,
     chain state) persisted; per-pattern BPM no longer clobbered on
     load; live params re-applied automation-safe (cancel before set);
     stale sampler work state cleared. New: synth-rendered preset
     library (SMPL tab) — bass, piano, strings, brass, experimental.
   - R13: save-on-edit. iOS kills the page before the pagehide/hidden
     async IndexedDB write commits, so lifecycle+60s saves could lose
     the last minute of edits. Every mutation now schedules a debounced
     autosave (~1.5s). PLAY also re-applies the current pattern's own
     tempo so a stale per-pattern BPM can't diverge from the display.
   - R14: REC OUT rebuilt as a PCM tap on the master bus. The old
     MediaRecorder path compressed to AAC and iOS can stamp the wrong
     sample rate into the container — captures decoded back to a pad
     pitch/tempo-shifted. Raw Float32 capture at the context rate is
     sample-accurate; SAVE now writes lossless WAV.
   - R15: chop workspace re-points at the target pad's sample after a
     restore (and on entering SMPL) instead of going dead; TRANSIENT
     says so when it finds nothing instead of yielding 1 silent slice;
     orphaned buffers are GC'd before snapshots so the autosave vault
     can't bloat into silent iOS IndexedDB write failures.
   - R16: per-pad voice cap (3) — dense steps on sustained samples
     stacked 40+ full-length voices into a wash that masked quieter
     tracks (measured: sub still present electrically but buried).
     Sequencer fires now flash the track strip + pad grid, SEQ gains
     a SOLO button, and mic capture re-asserts the playback session
     on iOS so bass doesn't die into the earpiece route.
   - R17: mic InvalidStateError — WebKit throws when the mic stream's
     hardware rate (48k) differs from the context rate (44.1k) inside
     createMediaStreamSource. The level meter now falls back to a
     throwaway context at the hardware rate (or skips metering) and
     can never break the recording; the revival watchdog holds off
     while the mic owns the audio session.
   - R18: bounce matches live playback — per-pattern tempo (PTN TEMPO)
     honored per chained pattern with the synced delay following, and
     the PROJ SOURCE defaults to CHAIN when chain mode is armed so the
     bounce renders the sequence the way PLAY plays it.
   - R19: mic wouldn't arm — every touch re-asserted the 'playback'
     session (which forbids capture on iOS), so the arming tap itself
     killed the mic track and MediaRecorder.start() threw
     InvalidStateError. Arm now requests 'play-and-record' first,
     resumeSession leaves the session alone while the mic owns it,
     start() is guarded, and 'playback' is restored after capture.
   - R20: mic permission preflight — a remembered site-level 'deny'
     means iOS never re-prompts; the LCD now says exactly where to
     re-enable it (aA menu → Website Settings → Microphone) instead
     of failing mutely.
   - R21: TRAX — 8 cakewalk-style tape lanes. Arm a track, PLAY rolls
     and records (BUS taps the master pre-track-return so overdubs
     never bleed; MIC uses the R17/R19 session dance), STOP commits
     the take aligned to bar 1. Mute/solo/volume per lane, takes go
     to pads, persist in the session, GC-tracked, and mix into the
     bounce. Plus offline PWA: manifest + network-first service
     worker — fresh build when online, full app with no connection.
   - R22: LIVE tab — key/scale-aware playable instruments through the
     master bus (recordable via TRAX/REC OUT): theremin XY surface
     with snap, diatonic chord pads (7th/strum/BPM-synced arp),
     Karplus-Strong strum harp, and scale keys; four synth voices
     with level + rev/dly sends.
   - R23: sensors + performance FX. SHAKE PERC (devicemotion jerk →
     shaker/tambourine/cabasa/bells, tap fallback), BREATH FLUTE (mic
     RMS as a wind controller), RIBBON BASS (X pitch, Y wah). DJ deck
     gains a performance insert on the whole mix: TILT WAH
     (deviceorientation), TAPE STOP, tempo-synced STUTTER — all ahead
     of the TRAX bus tap so performances record with their FX.
   - R24: fx rack + looper. Six reverb algorithms (hall/room/plate/
     spring/cathedral/gated) on the shared bus; delay modes digital/
     ping-pong/tape (saturated feedback + wow), rebuildable live and
     identical in the bounce. Each TRAX lane gets FX (filter/pan/
     rev/dly sends, live-adjustable) and an \u221e loop toggle that
     loops the take at the nearest whole bar.
   - R25: one-tap \u25cf REC PERFORMANCE on the LIVE tab — arms the
     first empty tape lane (BUS) and rolls the transport in one tap;
     tapping again or STOP commits. Transport \u25cf message now says
     it records steps, not audio.
   - R26: SAMPLE PACKS (SMPL tab). Download samples from a manifest
     URL; encoded bytes stored on disk in a new IndexedDB store (v2)
     — far larger quota than RAM, never inlined into the session —
     decoded to a pad only on demand. Persistent storage requested so
     iOS won't evict; cached manifest makes the list and downloaded
     samples work fully offline. Ships a synthesized (public-domain)
     starter drum kit under /samples.
   - R27: REAL INSTRUMENTS pack — 37 actual recorded orchestral
     one-shots (piano, violin, contrabass, flute, bassoon, horns,
     trumpet, trombone, tuba, organ, harp, xylophone) sourced from
     VSCO-2 Community Edition, which is verified CC0 1.0 (public
     domain, no attribution). Only VSCO-2-origin instruments included;
     Freesound/Karoryfer/Iowa-sourced ones excluded as license-
     uncertain. Built-in pack picker chooses Real (CC0) / Studio
     (synth) / custom URL.
   - R28: Full Range CC0 pack — 162 VSCO-2 samples (every note of all
     12 instruments) referenced by GitHub raw URL in a 26 KB manifest,
     so the whole library is available with ZERO added repo/app bytes;
     GitHub serves them CORS-open, the phone downloads only what you
     GET and keeps it offline. Picker: Full / Core / Studio / custom.
   - R29: STEP LOCKS + polymeter — per-step parameter locks (pitch,
     probability, ratchet/roll, micro-timing nudge) via a LOCK mode
     and per-step editor, plus per-track LENGTH (1–16) for polymeter.
     Absolute step counter drives per-track modulo; live playback,
     ext-clock, live-rec quantize, and the WAV bounce all honor locks
     and track length identically. Backward-compatible: old patterns
     migrate to len 16 / no locks.
   - R30: AMP tab — live guitar/line/mic input processor. Chain: input
     → noise gate → drive (clean/crunch/lead/fuzz) → cabinet sim →
     3-band EQ → chorus → delay/reverb sends (shared MIX engine) →
     master, so it's recordable via TRAX/REC OUT. Autocorrelation
     tuner, amp presets, device select. Reuses the play-and-record
     session dance; input released on backgrounding.
   - R31: master brickwall limiter (post-compressor) so dense/fast
     playing no longer clips into the destination (the clicking/
     distortion). Live output, REC OUT capture, and the WAV bounce
     all pass through it. Default pack renamed 'Full Kit' and now
     includes the CC0 drums + perc so a complete kit shows on load.
   - R32: SIDECHAIN (MIX tab) — pick a trigger pad (the kick); every
     time it fires it ducks a duck bus carrying all other pads and the
     live instruments, then recovers, for the classic pump. Trigger
     pad takes a direct (unducked) path so it punches through. Depth +
     recovery controls; scheduled inside triggerPad so it works live,
     from MIDI, and in the WAV bounce identically. Persisted.
   - R33: AUTOMATION recording (SEQ tab) — arm AUTO REC, move the MACRO
     while playing, and the moves record into the pattern as a looping
     automation lane (master filter, volume, delay fb, reverb, sidechain
     depth, warble). Lanes replay every loop, drive the macro visually,
     overwrite locally on re-record, persist with the session, and bake
     into the WAV bounce (master FX lanes).
   - R34: STEM EXPORT (PROJ) — the bounce is refactored into a shared
     renderMix(padSet,traxSet); BOUNCE STEMS renders one WAV per used
     pad and per tape track (isolated, through their own FX/sends),
     then lists per-stem SAVE buttons (iOS-safe) plus SAVE ALL. Master
     bounce unchanged.
   - R35: UNDO / REDO — transport buttons + Cmd/Ctrl-Z (Shift = redo).
     Snapshots the editable state (pads/patterns/locks/automation/chain/
     mix/sidechain/instruments/track meta) minus buffers; restores via
     applySessionDoc with current buffers. Edits coalesced ~600ms into
     one step; 40-deep stack.
   - R36: SONG / ARRANGEMENT mode (SEQ tab) — build a track from
     sections (pattern × repeat count), reorder/remove, LOOP or play
     once. PLAY runs the arrangement bar-by-bar; current section
     highlights. Bounce SOURCE gains SONG (expands sections); stem
     export follows it. Persisted; undoable.
   - R37: MIDI EXPORT (PROJ) — writes a Standard MIDI File (format 1)
     of the bounce SOURCE (pattern/chain/song): one track per used pad
     using its mapped note, step velocities, per-pattern tempo events,
     swing, and step-lock pitch/nudge/ratchet. Take patterns into any DAW.
   - R38: per-tab help + cleanup. Each tab shows a concise workflow/
     recording hint at the top (TRAX spells out arm → PLAY → STOP →
     FX → TO PAD, the previously-buried flow). Added a favicon link to
     stop the /favicon.ico 404. Full smoke test across all tabs/flows
     passes with zero JS errors.
   - R39: sounding samples now stop when you'd expect. STOP silences
     every sounding pad voice (panicVoices) so a long one-shot no longer
     rings out after you stop; CLR ROW cuts that track's voices, CLR PTN
     and pad CLEAR / sample-replace cut their voices too (stopPadVoices).
     Previously a long sample kept playing its full length after the
     step/pad was removed.
   - R40: the app opens ALIVE. Seven synthesized DRUM presets (kick,
     snare, clap, closed/open hat, rim, tom) join the preset library —
     fully offline, no samples needed. New KITS section (SMPL tab):
     one tap renders a curated sound set into bank A and lays a starter
     groove (TRAP / HOUSE / BOOM-BAP / LO-FI / TECHNO / AMBIENT), setting
     BPM + swing to match. First launch with no saved session now boots
     straight into a playable TRAP demo instead of an empty grid.
   - R41: SOLID MIDI — turn an old phone into a MIDI sound module.
     * Hot-plug: onstatechange rebuilds the input list live; ALL INPUTS
       mode (default) listens to every controller so plugging in "just
       works" — no re-enable, no picking.
     * Bluetooth MIDI (Web Bluetooth, Android/desktop): + BLUETOOTH pairs
       a BLE-MIDI controller; a running-status BLE-MIDI parser feeds the
       same note/CC/clock path. A real route on phones with no USB-OTG.
     * CHROMATIC PLAY: the whole keyboard plays the SELECTED pad,
       transposed from a ROOT note — any loaded sample becomes a playable
       instrument with zero mapping.
     * Live status line + activity dot (flashes on every message);
       honest, actionable guidance on iOS/insecure-context instead of a
       dead-end "unavailable". Settings persist across sessions.
   - R42: FEELS SOLID — always-on stereo master meter under the LCD
     (L/R bars, green→amber→red by peak, CLIP indicator that lights when
     the output nears the ceiling / the limiter is working). Meter taps
     the limiter stage via channel-splitter + analysers and survives the
     softclip re-routing. Pad hits are now velocity-reactive: harder hits
     glow brighter/wider, live and under sequencer playback, so the grid
     visibly breathes with the beat.
   - R43: SOUNDS PRO — deeper per-pad engine.
     * Per-pad LFO: one oscillator per pad channel routed to CUTOFF (via
       filter detune, musical log sweep), PAN, or VOLUME (tremolo).
       Sine/tri/saw/square, free-Hz or tempo-synced (1 bar…1/16) rate that
       follows BPM, depth control. Bakes into the bounce.
     * WARP: pitch-preserving granular (Hann-windowed overlap-add) time-
       stretch that fits a sample to N beats at the current tempo, so
       loops lock to the grid. RESET restores the pristine original
       (kept in memory to avoid compounding). Both live in PADS → EDIT.
   - R44: real MIXER (MIX tab). One channel strip per in-use pad, each
     with a live post-fader meter, a vertical fader, pan, MUTE / SOLO,
     and REV/DLY sends — plus a MASTER strip. Dedicated mute/solo gate
     node per channel (downstream of fader + vol-LFO) so a muted channel
     is truly silent; per-channel analysers drive the meters only while
     the MIX tab is open. Mute/solo bake into the master bounce (stems
     stay isolated). Tap a strip name to jump to that pad's EDIT. State
     persists.
   - R45: PROJECT LIBRARY (PROJECT tab). Keep many named beats on the
     device, not just one autosave. SAVE updates the open project, SAVE
     AS NEW keeps a copy, NEW starts an empty session, and each library
     row LOADs / DUPs / DELetes. Full docs live under 'proj:<id>' in the
     session store with a small 'projIndex' for instant browsing (no
     buffer decode to list); size + pad count + age shown per row. The
     'last' autosave slot is untouched, so crash recovery still works,
     and the open project is remembered across restores.
   - R46: STORAGE METER in the project library — a bar + readout of how
     much the projects use, the device usage vs the browser quota (%),
     and whether storage is KEPT (persisted). Bar goes green→amber→red as
     the quota fills; KEEP OFFLINE requests persistent storage so iOS
     won’t evict your beats. Refreshes on every save/load/delete.
   - R47: GHOST-PAD fixes. (1) Toggling a step OFF while playing now cuts
     that pad's still-ringing voice — a long sample no longer keeps
     sounding after you remove its step. (2) CLEAR-ing a pad now also
     removes its steps + locks from EVERY pattern, so a cleared sound
     leaves nothing behind on the sequencer that could re-trigger. Both
     are undoable.
   - R48: review pass. Fixed a real undo corruption: undo snapshots
     stored pads/trax with bufId INDICES while autosave's gcBuffers()
     compacts and renumbers S.buffers between snapshots — so delete →
     (autosave) → UNDO put the WRONG sample (or silence) on pads. Every
     undo/redo entry now carries a reference copy of the buffers array it
     was taken against (AudioBuffer refs — pointers, not audio copies),
     so undo is immune to GC renumbering and even undoes across project
     loads coherently. Also: warpOrig scratch cleared when a session doc
     is applied (stale pre-warp originals can't resurface), old projects
     saved before R43/R44 get defaults for the lfo, mute, solo and
     warpBeats fields, and undo/restore/load redraw the mixer strips.
   - R49: SYNTH UPGRADE. Hats rebuilt on the classic six-square metallic
     bank (808/909 recipe) instead of plain filtered noise — they read as
     metal now, not static. Snare gains a three-mode drum body with pitch
     blip + resonant wire rattle; clap gains stereo pre-slaps and a
     darkening room tail. New DRUMS: 808 Cowbell, Shaker, tunable Conga.
     New families: KEYS (FM E-Piano Tine, Drawbar Organ w/ percussion
     click + leslie shimmer), LEAD (7-voice Supersaw fanned wide, Synth
     Pluck), PAD (Warm Pad with breathing filter + slow drift). HOUSE,
     LO-FI and AMBIENT kits refreshed with the new voices. All synthesized
     — zero added bytes of samples.
   - R50: SEQUENCING DEPTH.
     * NOTES lane (SEQ): a scale-aware melodic grid for the shown pad —
       rows are scale notes relative to the sample's own root, tap to
       place / re-pitch / remove, OCT shifts the window, scale picker
       shared with LIVE. Writes ordinary step + pitch-lock data, so
       melodies play live, bake into the bounce, and export to MIDI with
       zero extra plumbing. Playhead column tracks in the lane.
     * NOTE REPEAT (PADS): hold a pad for a BPM-synced roll (1/4–1/32,
       incl. triplet), driven by a lookahead scheduler for sample-
       accurate spacing; writes steps when LIVE REC is armed; rolls end
       on release / STOP / bank switch.
     * HUMANIZE (SEQ): ±12ms timing drift + velocity breathing, applied
       identically in live playback and the offline bounce. Persisted.
   - R51: MIDI OUT — the phone drives hardware now.
     * OUTPUT device picker (hot-plug aware, rebuilt on statechange).
     * NOTES OUT: every sequencer step (pad NOTE + step pitch lock,
       ratchets included) and every live pad hit goes out as note-on/off
       on the chosen channel, scheduled with the same lookahead clock as
       the audio (ctx-time → Web MIDI timestamps), so hardware synths
       play in sample-tight sync with the pads.
     * CLOCK OUT: 24 PPQN MIDI clock on the step grid plus START/STOP,
       so drum machines and arps follow this tempo. Suppressed while
       EXT CLOCK is on (never a follower and a leader at once).
     * Settings persist with the session.
   - R52: CLAUDE'S SONG — "Amber Signal", a full composition by Claude
     shipped as the factory demo (and a one-tap button in SMPL → KITS).
     A-minor, 92 BPM lo-fi cinematic hip-hop across all 8 patterns and a
     12-section SONG arrangement (intro → build → verse → chorus →
     verse → chorus → breakdown → outro): e-piano arpeggio over
     Am–F–C–G, sub-bass with octave jumps, a pluck hook, a cello answer
     in the breakdown, bells/glass/riser for air, ghost-note probability,
     hat ratchets, sidechain pump off the kick, 30% humanize, hall
     reverb + ping-pong delay. 16 pads, every one an in-house synth.
   - R53: the last four pro-checklist items, together.
     * PER-CHANNEL EQ: 3-band (low shelf 200 / mid bell 1k Q0.8 / high
       shelf 4k, ±12dB) inserted in every pad channel after the filter —
       full sliders in PADS → EDIT, mini L/M/H sliders on each mixer
       strip. Applied by applyPadFx, so it's live AND baked into bounce.
     * AUTO-WARP (opt-in, default OFF as of R65): when explicitly enabled
       via the AUTO toggle in the WARP row, warped pads re-stretch from the
       pristine original when the tempo settles (500ms debounce, 0.5 BPM
       threshold to ignore MIDI-clock jitter) so loops stay locked to the
       grid. OFF by default so BPM only drives the sequencer — samples play
       at their natural speed regardless of tempo.
     * COMPRESSED EXPORT (PROJ): offline render, then real-time encode
       via MediaRecorder — AAC .m4a where supported (Safari/iOS, newer
       Chrome), else Opus .webm. ~10× smaller than WAV for sharing.
     * LIBRARY BACKUP (PROJ): BACKUP ALL packs every saved project
       (audio included, base64) into one .json; IMPORT BACKUP restores
       them — projects survive browser-storage wipes and move between
       devices.
   - R54: PAD LEGIBILITY — every pad shows its number (bold, top-left,
     brightens when loaded) and a hardware-style status LED (top-right):
     dark = empty, GREEN = sample loaded, AMBER = this pad has steps in
     the current pattern. LEDs live-update on step edits and pattern
     switches; the FX dot moved beside the LED.
   - R55: TOTAL BPM CONTROL. The 40–240 clamp is gone: BPM is now signed
     ±1…±999, and NEGATIVE BPM runs the sequencer BACKWARDS (steps walk
     15→0 with all locks/ratchets/probability intact; the song/chain
     arrangement still advances forward bar by bar; the offline bounce
     mirrors the reversed order). All time math (step clock, delay sync,
     synced LFOs, warp, note-repeat, stutter, MIDI clock out) uses the
     magnitude, so effects stay musical in reverse. New transport
     buttons: ½ (half time), ×2 (double time), REV (flip direction, lit
     red while reversed). Typing 0 flips direction. Per-pattern tempos
     inherit the full range, so one pattern can run forward and the
     next backward.
   - R56: SILENCER (SEQ). A dedicated always-available 16-step cut row
     per pattern: place a step and at that exact moment every sounding
     voice fades out AND the master gate closes, choking reverb/delay
     tails — true silence until the NEXT hit (programmed or manually
     played), which reopens the gate just before it sounds. FADE slider
     sets abrupt CUT (5ms) vs soft fade (600ms). Works in reverse
     playback, bakes into the WAV bounce (cuts join the sorted event
     stream), survives save/restore, playhead tracks the row. STOP and
     manual pad hits always reopen the gate so the app can never stick
     silent. TRAX tape lanes intentionally keep rolling.
   - R57: AI JAM — the app is now scriptable from plain text, and ships
     a second Claude composition written in that very format.
     * SONG DOC (mvx-songdoc-1): a JSON schema describing a complete
       production — pads as synth preset + note + mix, patterns as
       steps/velocities/pitches with locks, silencer cuts and signed
       per-pattern BPM, plus arrangement, master FX and sidechain.
       PROJ → AI JAM: paste + LOAD DOC, EXPORT CURRENT (round-trips
       preset-based pads so an AI can remix your work), SPEC (the
       schema, ready to hand to any AI). Console: window.MVX.
     * "MIRRORS FOR MACHINES": melodic techno, D minor, 126 BPM, defined
       entirely as a song doc (button beside CLAUDE'S SONG). Two of its
       patterns carry bpm −126 — the mirror sections literally play
       backwards — and the SILENCER punctuates the mirror + breakdown.
   - R58: STEP VELOCITY back in reach + per-step editing. The VEL row
     had been pushed below the NOTES/SILENCER sections (off-screen on
     phones — "the feature disappeared"); it now sits directly under the
     step grid with a hint. NEW: the LOCK panel gets a VEL slider that
     edits the velocity of an ALREADY-PLACED step (shows its current
     level, places the step if it was off) — previously the only way to
     change a step's loudness was delete + re-add.
   - R59: LIVE-ONLY RECORDING. TRAX SOURCE gains LIVE ONLY: a dedicated
     recording bus that carries just what YOU perform — live instruments,
     AMP guitar, and manually-played pads (touch, MIDI, note-repeat
     rolls; each manual voice opens its pad's post-FX live-send for its
     lifetime) — while the sequencer plays as silent backing. MASTER BUS
     still records everything you hear; MIC unchanged. Overdub real
     multitrack takes over a beat without the beat printing into them.
   - R60: MID-SONG SILENCE HARDENING (report: song plays once, then the
     transport keeps running silently). Cause profile matches the iOS
     audio-session death — the output MediaStream dies (typically when
     the screen dims ~1 min in) while the sequencer keeps scheduling.
     Fixes: (1) Screen Wake Lock held while the transport plays, so iOS
     never dims mid-song (the usual trigger); released on STOP, re-
     acquired on return. (2) A 2.5s playback watchdog that runs the
     full resumeSession revival (context resume, dead-stream rebuild,
     wedged-clock rebuild) DURING playback — previously revival only
     ran on touch/visibility, so hands-off listening stayed silent.
   - R61: SELF-HEAL + DIAG (follow-up: pads went silent while LIVE
     instruments still sounded — so the session/output is alive and the
     failure is engine-level in the pad path; not reproducible off-
     device). Two responses: (1) the playback watchdog now detects
     "steps are firing but the master has been silent >5s" and
     automatically dumps a diagnostic snapshot to the PROJ log, rebuilds
     the whole audio graph, and restarts playback (once per 30s max).
     (2) A DIAG button (PROJ → AI JAM row) captures engine state —
     context, gains/gates, buffer table integrity, dangling pad bufIds,
     voice counts, recent JS errors — into the text box for one-
     screenshot bug reports. Errors now keep an 8-entry ring buffer.
   - R62: GAIN FORENSICS (field DIAG showed the silence: pad channel
     gain written to 0 while every gate/buffer was healthy — and the
     rebuild stayed silent because state carried the 0). Every writer
     of pad gain (EDIT fader, MIXER fader, MIDI CC with its CC number)
     now logs into a forensics ring shown by DIAG, alongside a per-pad
     state/node gain table and the saved CC LEARN maps — the next
     occurrence names the culprit. The self-healer now also restores
     any loaded pad whose gain sits below 0.05 to 0.8 before rebuilding,
     so healing actually restores sound. Prime suspect: a controller CC
     mapped to SEL PAD GAIN streaming zeros.
   - R63: PREVENTION + FAILSAFE BUNDLE. Field DIAG #2 showed gainWrites
     NONE with both pads' STATE at 0 → the saved project itself was
     poisoned by the earlier incidents. (1) LOAD FAILSAFE: a project
     where EVERY loaded pad has ~0 volume is repaired to 0.8 at load,
     before first play — no more heal-on-every-session. Healed gains
     now persist (dirty()). (2) BLACK BOX: the app always keeps the
     last 30s of the master in memory — "KEEP LAST 30s" (DJ) writes
     what you just heard onto the TARGET pad; survives output rebuilds.
     (3) TIME MACHINE: automatic checkpoints every 3 min (kept 6, or 3
     for huge projects) with a REWIND list in PROJ; rewinding first
     checkpoints the present so it's always reversible. (4) MIDI
     stuck-note failsafe: All-Notes-Off + All-Sound-Off on STOP and on
     silencer cuts. (5) SILENT-TAKE GUARD: a take that commits at
     near-zero peak warns immediately with the likely cause.
   - R64: TRAX WORKFLOW FIXES (field report). (1) LIVE ONLY truly
     isolates: each manual hit now taps its OWN voice into the live
     bus via a per-voice gain node, so sequenced hits on the same pad
     no longer leak into a LIVE ONLY take (the old pad-wide gate let
     everything on that pad through while a manual voice rang).
     (2) RE-RECORD OVER A LANE: while a lane is armed, its previous
     take stays silent during recording and is replaced on STOP —
     selecting a track and recording now overwrites it. (3) Every
     TRAX lane has a ✕ CLEAR button (confirm) that stops its voices
     and empties just that lane. (4) TO PAD targeting: KEEP/JAM→PAD
     and take→PAD land on the CURRENT pad only if it's empty,
     otherwise the first empty pad (same bank first) — and the pad
     selection ring is now always visible, even on an empty pad
     outside EDIT mode, so you can see where audio will land.
   - R65: BPM ⟂ PLAYBACK SPEED. Field report: lowering the BPM slowed the
     actual samples (loaded loops AND trax-takes-on-pads), because AUTO-WARP
     re-stretched every warped pad on each tempo change. AUTO-WARP is now an
     opt-in that DEFAULTS OFF and loads OFF (so projects saved under the old
     default stop slowing) — BPM drives ONLY the sequencer's step timing;
     samples play at their natural speed at any tempo. WARP → FIT TEMPO
     stays as a deliberate, one-time manual stretch; the AUTO toggle in the
     WARP row re-enables tempo-following for anyone who wants grid-locked
     loops.
   - R66: REC PERFORMANCE ISOLATES (field report). The ● REC PERFORMANCE
     button on the LIVE tab forced the capture source to MASTER BUS, so it
     recorded the whole mix (the beat + your playing) instead of just what
     you played. It now records the LIVE bus — only your live performance
     (on-screen instrument, guitar/amp, and manually-played pads via the
     R64 per-voice taps), never the backing sequencer. To capture the full
     mix on purpose, arm a lane in TRAX and set the source to MASTER BUS.
   - R67: PER-PAD SPEED + KEEP PITCH. Now that BPM only drives the sequencer,
     each pad gets its own SPEED knob (0.25×–4×, EDIT panel). VARISPEED (the
     default) multiplies playback rate — pitch follows, like tape/turntable —
     and is instant (next hit). KEEP PITCH swaps in a time-stretched buffer so
     the sample plays faster/slower at its ORIGINAL pitch; stretched buffers
     are cached per (sample, direction, speed) and rebuilt only when the knob
     settles, so triggers never hitch. Speed is per-pad, persists, and bakes
     into the WAV bounce (caches are pre-built before the offline render).
   - R68: CLEARER PAD SELECTION + DELIBERATE OVERWRITE. The selected pad now
     shows a blue ring + glow and a small "SEL" tag — visible even on an empty
     pad, so you always know which pad is selected and where KEEP / take→PAD /
     JAM→PAD will land. And a pad you TAP now wins: your pick overwrites even
     a full pad, overcoming the auto "send to an empty pad" fallback. That
     fallback still applies when you haven't tapped (e.g. right after loading),
     so quick sampling never clobbers a used pad by accident.
   - R69: PROJECT SAVE/LOAD SAFETY (field reports). (1) DATA-LOSS GUARD: plain
     SAVE overwrites the OPEN project in place — so building a new beat and
     hitting SAVE while an old project was open replaced it. SAVE now saves as
     a NEW entry when the project name has been changed (or the open project is
     gone), so the original is never clobbered; the NAME row shows which
     project SAVE will update. Persistent storage is requested on every save so
     iOS can't evict the library under pressure. (2) SILENT-PADS-ON-LOAD: a
     project saved with a pad soloed loaded with every OTHER pad silenced
     ("one channel plays, all the pads are silent"). SOLO is a transient
     audition state, so it's cleared on load (mutes still persist).
   - R70: (1) SELECTION UNIFIED — tapping a pad now also makes it the sequencer
     row, not just the EDIT target. Before, they only synced in EDIT mode, so
     selecting a pad and "removing it from the sequence" edited a DIFFERENT
     row and the pad kept playing. Now the pad you tap (blue SEL) is the row
     the step grid edits everywhere; the SEQ pad-strip selects it back too.
     (2) NOTES-LANE HARMONY — the melodic NOTES lane is now polyphonic: stack
     several notes in one column and the pad fires them together as a chord
     (voices don't choke each other; per-pad voice cap raised 3→6). Chords
     persist, bounce to WAV, and export to MIDI as real chords.
   - R71: AI JAM MADE IT WORK (field report — Grok's output wouldn't load and
     the SPEC confused both AI and human). (1) TOLERANT LOADER: the doc box
     now digs the JSON out of a normal chat reply — strips ```json fences and
     ignores prose before/after — so an AI's answer pastes straight in.
     (2) CLEAR SPEC: SPEC is now a plain-language prompt with the exact keys,
     allowed values (no more "hall|room|…" pipe strings an AI copies literally),
     and a complete WORKING example that loads as-is. (3) Song docs carry
     CHORDS: several entries on one step load/export/round-trip as harmony.
   - R72: TRAX RECORDING SAFETY (field report — "recorded another track and it
     overwrote track one with the master"). (1) REC PERFORMANCE never clobbers
     a take: it records to an EMPTY lane (the armed lane only if IT is empty,
     else the first empty one) — no more overwriting an existing track through
     a stale arm. When every lane is full it says so instead of overwriting.
     (2) Arming a lane that already holds a take now warns that PLAY RE-RECORDS
     over it. (The "recorded the master" part was the pre-R66 REC PERFORMANCE
     behavior — it now captures only the live bus; update the app to get it.)
   - R73: EDIT A TRAX TAKE IN THE SAMPLE EDITOR (requested). The TRAX FX panel
     gains "EDIT ▸ SMPL": it copies the take onto a target pad and opens it in
     the SMPL sample editor, so you can TRIM / CHOP / TRANSIENT / REVERSE / NORM
     a recording with the full toolset. It works on a COPY, so the lane's
     original take is never altered; the edited result lives on the pad
     (playable, sequenceable, choppable across pads).
   - R74: RENAME → JBH-88 + BETA FEEDBACK. (1) The app's visible name is now
     JBH-88 (title, logo, welcome, AI-JAM prompt). Internal data-format ids
     (mvx880-project, the IndexedDB name, mvx-songdoc-1) are UNCHANGED so every
     existing saved project, library, and song doc still loads; window.JBH is
     the console API with window.MVX kept as a back-compat alias. (2) BETA
     FEEDBACK (PROJ): testers write a report that's packaged into an opaque,
     un-spammable 'jbhfb1:' blob (app version + optional diagnostics) and sent
     to the developer via the OS share sheet / clipboard — no server, no public
     endpoint, private to each tester. Collected blobs go in the repo's
     feedback/ folder for later analysis.
   - R75: ONLINE CAPPED FEEDBACK INBOX. Optional online path for the feedback
     panel: set FEEDBACK_ENDPOINT to a deployed relay (feedback/worker.js — a
     tiny Cloudflare Worker holding the GitHub token server-side) and reports
     POST to it while online. The relay stores them in feedback/inbox.json as a
     RING BUFFER capped at 100, so even a spam flood can never keep more than
     100 short messages; it also throttles per IP and rejects anything that
     isn't a small jbhfb1 blob. With no endpoint set (default) or offline, it
     still falls back to the share/copy path — nothing breaks. decode.js reads
     the whole inbox on request.
   - R76: AI-JAM SILENT-LOAD FIX (beta report: "Ai upload didn't work" — the
     session came back empty). A song doc that parsed but landed ZERO pads used
     to still say "LOADED" and play silence. Now it refuses with a specific
     reason — naming the unknown preset ids (or noting sample-only pads) and
     pointing to SPEC — and a partial load reports how many pads loaded and how
     many presets were skipped, so a bad AI reply is obvious instead of silent.
   - R77: BETTER DRUMS + EASY FREE-SOUND IMPORT (requested — the old CC0 drums
     sounded fake/thin and were missing basics). (1) NEW PACK "JBH Drums — Kit
     One (CC0)": 27 original one-shots synthesized from scratch (four kicks:
     808/909/acoustic/tight, four snares, closed/open hats + crash/ride, clap,
     three toms, congas/cowbell/rimshot/shaker/tambourine/clave, and tuned 808
     bass) — punchy transients, pitch envelopes, layering, saturation. Fully
     CC0/original, so it ships and redistributes freely. Pick it in SMPL →
     SAMPLE PACKS. (2) FREE SOUNDS: a button by IMPORT opens Pixabay + Freesound
     CC0 in a new tab, and IMPORT FILE now takes MULTIPLE files at once, filling
     empty pads. (Importing is always license-safe; the app never re-hosts the
     files — only bundled sounds are our own CC0 synthesis.)
   - R78: EASIER SOUND IMPORT (report: downloaded a file, couldn't find/unpack
     it). (1) IN-APP UNZIP: importing a .zip (or a zip picked via IMPORT FILE)
     now unpacks the audio inside automatically and spreads it across pads —
     no manual unzip needed (DecompressionStream). (2) IMPORT URL: paste a
     direct .wav/.mp3/.zip link and it fetches + imports straight in, with a
     clear message when a host (e.g. Pixabay) blocks direct fetch. (3) Plain-
     language iOS guidance: downloads live in Files → Downloads (IMPORT FILE →
     Browse → Downloads). All decode paths funnel through one importer.
   - R79: iOS IMPORT HELP (report: can't paste into the URL box; Pixabay
     downloads show a Share/Open sheet and never reach Files). (1) A one-tap
     PASTE button reads the clipboard into the URL box (iOS long-press paste is
     unreliable). (2) Rewrote the panel with the actual iPhone recipe: on the
     Share sheet choose "Save to Files" → Downloads, then IMPORT FILE → Browse
     → Recents/Downloads — calling out that the missed "Save to Files" step is
     why downloads seem to vanish. Made clear Pixabay PAGE links can't be
     fetched directly.
   - R80: REAL RECORDED CELLO + ACOUSTIC DRUMS (requested: "I want them to
     sound real", "realistic cello"). Added a pack of 34 genuinely RECORDED
     samples from VSCO 2: Community Edition (Versilian Studios) — CC0 public
     domain, so it ships and redistributes freely:
       * CELLO — 13 sustain-vibrato notes spanning the true cello range
         (C2 65Hz → F5) plus 6 pizzicato. Each note's pitch was verified by
         autocorrelation and named by its ACTUAL detected pitch (VSCO's own
         labels are an octave low), so pads map correctly.
       * DRUMS — real bass drum (4 dynamics), 3 snares, toms, congas, crash,
         suspended cymbal, triangle. Real transient dynamics (RMS ~0.07 against
         0.95 peak) — the thing synthesis couldn't fake.
     Converted to mono 44.1k/16-bit, trimmed, peak-normalised. Selected by
     default in SMPL → SAMPLE PACKS; the synth kit remains as "Kit One".
   - R81: BIG CC0 CATALOG + STORAGE YOU CONTROL. Sample packs cost nothing
     until used — a manifest is a few KB of JSON and the app ships no audio —
     so the real pack grew to 75 recorded samples: cello (sustain + pizz),
     viola, violin, contrabass, harp, marimba, glockenspiel, trumpet,
     trombone, french horn, tuba, and the acoustic drum kit. Every pitched
     file is named by its MEASURED pitch, with detection bounded to each
     instrument's real range so overtones can't cause an octave error
     (glockenspiel is inharmonic, so its three are labelled by register).
     MY DOWNLOADS (SMPL): lists every sound stored on the device — from ANY
     pack, not just the loaded one — with its size, → PAD, individual delete,
     and DELETE ALL. Before this, a sample downloaded from one pack became
     invisible and undeletable once you switched packs. PROJ gains DELETE ALL
     for the saved-project library (backup first; the open project is kept).
   - R82: SAFETY ON "DELETE ALL PROJECTS". Erasing the whole library now takes
     three separate gates: (1) a warning that names the projects and says
     plainly that every saved song is permanently erased, (2) a CANNOT-BE-UNDONE
     step pointing at BACKUP ALL as the escape hatch, (3) a TYPED confirmation
     — you must type DELETE, so stray taps can't do it. Any cancel, dismissal
     or wrong word leaves every project intact and says so. The button is
     styled red; an empty library is a no-op with no dialogs at all.
   - R83: SCULPT — reshape a sample ON the waveform (requested). (1) DRAW GAIN:
     drag across the wave to draw a volume curve (192 points, 0…2×) — pull a
     loud hit down, lift a quiet tail. The curve is drawn over the wave with a
     green ghost preview of the result and a unity reference line; nothing is
     destructive until APPLY, which bakes it into a NEW buffer (so UNDO works).
     (2) TAME PEAKS builds that curve automatically from a smoothed peak
     envelope, pulling only the loudest parts toward 60% and gliding rather
     than stepping. (3) LENGTH (0.25×–4×, with ½ and ×2) stretches or shrinks
     the sample with PITCH PRESERVED, reusing the WARP granular engine — the
     readout shows the before → after duration live.
   - R84: EUCLID + GROOVE (SEQ). EUCLID spreads N hits as evenly as possible
     over K steps — the maths behind tresillo, clave and most Afro-Latin /
     Balkan rhythms — with live ●·· preview, 12 named presets, free
     STEPS/HITS/ROTATE, REPLACE / ADD / REMOVE modes, an optional "set track
     LEN" that turns the result into real polymeter, and ALL LOADED PADS which
     rotates each pad one step further for instant polyrhythm. Distribution is
     phased so step 0 is always a hit, and is provably maximally even for every
     combination up to 16. GROOVE applies feel templates — swing 54/58/62/
     66, off-grid drunk, Latin push, reggae drag, triplet shuffle, half-time lean,
     human loose — as per-step timing nudges plus optional velocity accents,
     with an AMOUNT blend and per-track or all-tracks scope. Both write into
     the pattern, so they bounce and export exactly as heard; STRAIGHT clears.
   - R85: BUILD A KIT — turn ANY sound into a full drum kit (SMPL). Takes the
     loaded sample (import, pack, mic, or a TRAX take) and re-voices it into
     4, 8 or 12 pieces: kick, snare, hat, perc, open hat, clap, tom, rim, sub,
     crash, ride, fx. Each piece is the SAME audio pitched, band-limited and
     re-enveloped, with a synthesized sub under the low pieces, a matched
     noise layer on the snare, and multi-tap bursts for the clap — so the kit
     is coherent because it all came from one recording. Controls: piece
     count, source (whole sample or the selected chop slice), TUNE ±12st,
     DECAY 0.4–2.2×, SNAP (attack/decay sharpness), and an optional starter
     beat. It auto-finds the sample's strongest onset to use as attack
     material, trims and normalises each piece, fills pads from the TARGET
     onward, and warns before replacing loaded pads. Undoable.
   - R86: CIRCLE VIEW (SEQ). A GRID / CIRCLE toggle — your choice, remembered
     between sessions; both views edit the SAME pattern and stay in sync. In
     circle view every track is a ring: the selected track is the outer ring
     (tap its segments to place hits, brightness = velocity), and up to seven
     other tracks with content are inner rings — tap one to select it. Each
     ring turns at its OWN track LEN, so polymeter (long supported, never
     visible) becomes something you watch drift, with a blue playhead per
     ring. The hub shows the pattern and selected track.
   - R87: SCALE LOCK (SEQ) — a musical guard-rail, off by default. Pitch in the
     sequencer is a semitone OFFSET from each pad's own sound, so offset 0 is
     that pad's tonic; locking snaps every offset to the nearest degree of the
     chosen KEY + SCALE. It applies where pitch is written or played: the step
     LOCK pitch control, the NOTES lane (whose rows now follow this scale
     rather than borrowing the LIVE instrument's), and chromatic MIDI input.
     FIX PTN retunes pitches already written in the current pattern, chords
     included, and reports how many moved. Persists with the project.
   - R88: GRANULAR TEXTURE PADS. Pad MODE now cycles 1-SHOT → GATE → GRAIN. A
     GRAIN pad doesn't play the sample — it sprays short windowed fragments
     from a position in it, so a 0.2s snippet becomes an endless pad. HOLD the
     pad for a cloud and SLIDE to steer it: left/right = POSITION, up/down =
     DENSITY. Per-pad controls for position, grain SIZE, DENSITY, SPREAD
     (position jitter + stereo scatter), PITCH JITTER and BURST length.
     Grains run through the pad's normal channel so filter/EQ/drive/sends all
     apply, they honour pitch, speed and REVERSE, and sequenced grain pads
     play a burst through the SAME code path — so bounces match what you hear.
     Grain voices are tracked per pad so STOP, panic and pad-clear cut them.
   - R89: PATTERN LENGTH 16 / 32 / 48 / 64. The old 16-step ceiling existed
     because one constant meant two things: the size of a pattern AND the
     length of a bar (used by TRAX loop alignment, MIDI bar ticks, automation
     and pattern advance). Those are now separated — NSTEPS stays 16 as the
     steps-per-BAR timing constant, patterns carry their own plen, and step
     rows are allocated to a 64 capacity. A 64-step pattern is simply 4 bars.
     Default is 16, so every existing project, bounce, export and TRAX lane
     behaves exactly as before; old saves migrate by padding their rows and
     recording plen 16. Per-track LEN now runs up to the pattern length, so
     polymeter gets far more room (a 12 against a 32), and EUCLID's STEPS
     follows. Changing the length moves tracks that ran full-length with it
     while leaving deliberately shortened polymeter tracks alone.
   - R90: RECORDING MOVED OFF THE MAIN THREAD. REC OUT, TRAX lanes and the
     BLACK BOX all captured audio through ScriptProcessorNode — deprecated,
     and it runs on the MAIN thread, so heavy UI work (waveform drawing, the
     circle view, a big pattern redraw) could glitch a take. All three now
     share one AudioWorklet capture tap that runs on the audio thread and
     batches samples before posting, with transferable buffers so there is no
     copy. The worklet module is built from a Blob, so the app is still a
     single offline file, and it is preloaded when audio starts. Engines
     without AudioWorklet transparently keep the old path.
   - R91: STORE-READINESS PASS 1 — naming + install metadata. (1) Groove
     presets no longer carry third-party marks: "MPC SWING xx%" became
     "SWING xx%" (subtle/classic/heavy/hard) and "DILLA" became "OFF-GRID";
     synth presets "808 Cowbell"/"808 Sub" became "Sub Cowbell"/"Deep Sub",
     and the sample pack's "Kick 808/909", "Snare 909" and "808 Bass" became
     Kick Sub / Kick Punch / Snare Snap / Sub Bass. The timing and velocity
     tables are untouched — only the labels changed. Remaining 808/909
     mentions are code comments describing a synthesis recipe, not UI.
     (2) Install metadata was still branded MVX-880 with a single 653-byte
     icon: the manifest is now JBH-88 Groovebox with description, scope,
     orientation and categories, and there is a real icon set (180/192/256/
     512/1024 plus maskable 192/512) drawn as the circle-sequencer motif.
     The service worker caches them and its cache name is bumped so devices
     pick the rename up.
   - R92: FIRST-RUN GUIDED TOUR. Opening the app cold dropped you into a
     10-tab groovebox with no idea which tab did what. A nine-step tour now
     runs the first time only: welcome, the pads, the sound library, BUILD A
     KIT, the sequencer, euclid + groove, circle view + scale lock, TRAX
     lanes, then PLAY. Each step switches to the tab it needs, scrolls its
     target into view and cuts a spotlight hole out of the dimmer, with the
     card auto-placed above or below the highlight so it never covers what
     it is pointing at. The sequencer step retargets itself to the circle
     canvas when circle view is active, and any target that happens to be
     hidden degrades to a centred card rather than a stray box. SKIP, Escape
     and arrow keys all work; completion is remembered in localStorage so it
     never reappears, and the new ? button in the transport bar replays it
     on demand. It stays out of the way of the crash-recovery prompt — if
     there is a session to restore, that wins and the tour does not open.
   - R93: PATTERN MORPH (SEQ). Patterns could only be cut between — chain or
     song jumped from A to B on a bar line and that was the only transition
     the box could make. MORPH melts one pattern into another over N bars by
     giving every cell (track + step, plus the silencer row) a rank and
     crossing it over when the morph amount passes that rank. ORDER is what
     makes it musical: METRIC ranks by metric weight, so the 16ths mutate
     first, then the 8ths, then the beats, and the downbeat is the last thing
     to go — the groove keeps its backbone until the end. The same ranking
     inverted changes the skeleton first. SWEEP wipes left to right, SCATTER
     is a hash of (track, step) so it is scattered but repeats identically
     every time, and TRACK brings the instruments over one at a time. Where
     both patterns hit the same cell, velocities ride across instead of
     jumping. The endpoints are exact — t=0 IS A and t=1 IS B, returned by
     reference, so an arrived morph carries B's own length and polymeter,
     which an interpolated buffer cannot. In between, the blend keeps A's
     shape and reads B modulo its own track lengths, so a 16-step B tiles
     into a 32-step A. END picks what happens on arrival: land on B, loop,
     ping-pong the endpoints, or HOLD for hand-scrubbing with the AMOUNT
     slider. MORPH stands CHAIN and SONG down while it runs and they stand it
     down when re-armed. The step grid, notes lane, silencer row, circle view
     and pad LEDs all show the blend you are hearing, so pattern editing is
     locked with an explanation until you stop — PRINT freezes the blend you
     like into a pattern slot (deep-copied, defaulting to a free one). The
     bounce and MIDI export gained a MORPH source: renders and exports now
     walk a list of pattern OBJECTS rather than slot indices, so a morph bar
     that lives in no slot goes through exactly the same path as a chain.
   - R94: PRE-VERB — reverse reverb (SMPL · SCULPT). A reverb tail decays away
     from a hit; reverse the sound, send THAT through the reverb, and reverse
     the result, and the tail runs backwards INTO the hit instead. The sample
     grows a swell at the front that peaks exactly on the transient, which is
     the sound of a riser leading into a beat. Rendered offline through the
     same makeIR() family the mixer send uses, so PLATE here has the character
     of PLATE there. Three modes: PRE-VERB (swell → dry hit), SWELL ONLY (the
     riser alone, cut on its peak), BOOMERANG (swell → hit → forward bloom).
     Source is the whole sample or the chop slice you have selected; the
     result lands on the pad with trim/warp reset, and UNDO restores.
     Three things the naive version gets wrong, all fixed here. (1) A
     convolution's output level depends entirely on the material, so the wash
     is peak-normalised against the source before AMOUNT is applied —
     otherwise the same AMOUNT is inaudible on one sample and deafening on
     the next; it now means "swell peak relative to sample peak" everywhere.
     (2) The IR's two channels are decorrelated noise, so a short or
     narrowband source can excite one side several dB harder than the other:
     under a dry hit that is invisible, but as a bare SWELL it read as
     lopsided (HALL measured 4.4 dB right-heavy). The channels are now RMS-
     matched over the wash, which centres the image while leaving the
     waveforms decorrelated so the width survives. (3) makeIR clamps its own
     length per type — CATHEDRAL has a 4.5s floor, GATED is fixed at 0.55s —
     so sizing the offline render from the length the user asked for cut a
     cathedral tail off at a third of its length. That clamp is now a shared
     irDur() the render and the readout both use; the IRs themselves are
     unchanged, bit for bit.
   - R95: WIDE SCREENS — iPad, and any phone turned sideways. The app was one
     phone-width column with no media queries at all, so a tablet got the same
     layout stretched across twice the space: rows a metre wide, a circle
     sequencer taller than the screen, and half the display empty. From 760px
     (iPad portrait) up, each view becomes a two-column grid. Only .row and
     .pslider pair up — headings, hints, grids, canvases and lists still span
     the full width, because those are what need room — so nothing in the
     markup had to be reflowed and phone portrait is untouched, measured box
     for box against the previous build. The 16 pads become 8x2, which is the
     hardware layout and reachable with both thumbs; a whole 16-step bar fits
     on one line instead of two; lists of uniform rows (song sections, tape
     lanes, projects, rewind points, stems) pair up rather than leaving the
     right half bare; the circle is bounded by viewport HEIGHT so it always
     fits; and rows stop growing past 1120px on an iPad Pro. Short viewports
     also claw back vertical chrome and clamp the per-tab hint to two lines,
     tap to open. Two details worth recording: a grid item defaults to
     stretching to its row and an overflow:hidden box has a min-content height
     of zero, so the clamped hint was being squashed to 2px until
     align-items:start went on; and responsive overrides have to be the LAST
     rules in the sheet, because same-specificity rules defined later in the
     file were quietly winning. The guided tour needed real work to survive
     the short screen: its card was up to 244px of a 430px viewport, so it
     covered whatever it pointed at. The card is now compact and scrollable
     under 560px tall, tall targets scroll to the top rather than the centre,
     and placement tries under the highlight, over it, under a highlight
     trimmed to fit, and only then pins low. The manifest no longer locks the
     installed app to portrait.
   - R96: SCREEN READERS AND KEYBOARDS. The UI leans on glyphs (▶ ● ∞ ×), on
     colour (green LED = loaded, amber = playing in this pattern) and on a
     couple of canvases — none of which a screen reader can see. 75 sliders
     and 55 menus shipped with no accessible name at all, there were no live
     regions, no pressed state, and no focus outline anywhere, so a keyboard
     user could not see where they were.
     Rather than hand-tag ~300 controls — which drifts the moment anything is
     added — names are DERIVED at runtime from the text already on screen
     beside each control (its row's .lbl, else the section heading), and
     a11yPass() re-runs after anything rebuilds the DOM. It is idempotent and
     an explicit aria-label in the markup always wins, so the derivation is a
     floor, not a ceiling. An audit pass then flagged 20 names that were
     ambiguous rather than missing — duplicated within a view, under three
     characters, or fallen through to a section heading — and those got
     written by hand.
     Sliders speak their readout rather than their raw number (aria-valuetext
     mirrors the .val span and tracks while you drag). Toggle state lives in a
     CSS class, which is invisible to a reader, so a MutationObserver mirrors
     .on onto aria-pressed — but only for buttons seen lit at least once, so
     momentary ones (NORMALIZE, BOUNCE) are not mis-announced as switches; the
     step, pad and note grids are excluded because the playhead class-toggles
     them many times a second and they are labelled by their own draw
     routines. Buttons built already-lit need a sweep in every pass, because
     mutations on a detached node are never observed.
     Also: the tab bar became a real tablist/tab/tabpanel with aria-selected;
     the LCD became a polite live region so state changes are announced; pads
     name their sample, selection and whether they play in this pattern; steps
     name their position and track and carry aria-pressed; both canvases got
     text alternatives that point at the equivalent non-visual control; and a
     :focus-visible outline now exists. Pads stay <div> (the touch path reads
     velocity off the Y position) but gained role=button, tabindex and
     Enter/Space handling, so they are finally reachable without a touchscreen
     — they were completely unusable by keyboard before.
   - R97: A BUILD STEP, AND THE FIRST SVELTE COMPONENT. At ~9,000 lines in one
     file, every feature was costing more than the last, so the project now
     builds with Vite and can render Svelte. Nothing about the shipped artifact
     changed: vite-plugin-singlefile inlines everything, so index.html is still
     ONE self-contained file you can open, serve, install offline or drop into
     a Capacitor shell — it is just generated now instead of hand-edited.
     The migration is deliberately incremental, and two things made it safe.
     First, the browser-driven verification suite drives the real UI by element
     ID, so keeping IDs stable let all thirteen scripts validate the move; they
     pass against the built file unchanged. Second, the engine's ~370 top-level
     declarations are true globals that the app, the console and the tests all
     read AND WRITE (workBuf = b, morphBuf = null). ES module bindings cannot
     be assigned from outside, so bundling the engine as a module would have
     silently broken every one of those. It stays a classic inline script with
     byte-identical semantics, injected at build time, while new code arrives
     beside it as modules and components. The global name set was diffed before
     and after: nothing lost.
     Two things the bundler must not touch, both enforced in vite.config.js:
     the manifest link (a data: URI manifest cannot be installed as a PWA) and
     the icon links, which point at real files beside the page. They are
     injected verbatim after bundling. scripts/emit.mjs then refuses to
     overwrite the deployed index.html unless the output actually contains the
     stylesheet, the engine, the pad grid and those links.
     standalone.html is a frozen copy of R96 kept as a build-free fallback, and
     src/lib/About.svelte is the first component — small and additive on
     purpose, proving the pipeline compiles, mounts into the running app, stays
     reactive and scopes its styles.
   - R98: THE BUILD NOW GUARDS THE LINK YOU HANDED OUT. index.html is not just
     an artifact, it is what everyone who was sent the link is running, so a
     broken one is not a failed build — it is a broken app in someone else's
     hands. The build no longer writes it directly. Output is staged as
     index.next.html, loaded in a real browser from a real server with the real
     sample and icon files beside it, and only promoted once it has actually
     booted: 64 pads, the engine's functions present, all ten tabs opening, the
     sequencer running, the Svelte component mounted, no JS errors and no failed
     requests. If any of that fails the live page is left untouched and the
     build exits non-zero. Verified by deliberately sabotaging the engine and
     confirming index.html came through byte-identical.
     Also fixes a service worker bug that had exactly the same consequence.
     "Network-first" was not enough on its own: a plain fetch() still goes
     through the browser's HTTP cache, so an installed app could be handed a
     stale page while perfectly online — and the worker then wrote that stale
     copy into its own cache and kept serving it. Someone could have sat on an
     old build long after it was fixed. The shell is now revalidated with
     cache:'no-store' and installed with cache:'reload'. The first test written
     for this passed against the OLD worker too, because page.reload()
     revalidates the navigation by itself and never exercises the worker's own
     fetch path; rewritten to fetch through the worker, the old code returns
     stale twice without contacting the server and the new code returns fresh.
     Samples and icons are deliberately left on normal caching — they are large,
     they almost never change, and re-downloading a 14 MB pack every launch
     would be worse than the bug.
   - R99: LOGIC OUT OF THE ENGINE, INTO TESTS. First real step of the migration:
     the parts with no DOM, no Web Audio and no app state now live in src/pure/
     as ES modules — euclid, the groove tables, the pattern model, scale
     snapping, the morph maths, impulse-response sizing and the numeric helpers.
     They are imported straight into Node, so 46 unit tests run in a quarter of
     a second instead of driving a browser for a minute.
     The engine is a classic script that runs before any module would, and it
     calls euclid() and morphPattern() as bare names, so the pure code is
     bundled to a classic IIFE and injected AHEAD of it, publishing each export
     as a global. One definition of each function, and the tests import the real
     thing rather than a copy. Sixteen browser suites still pass and the global
     name set lost nothing; eleven names were GAINED, because consts like SCALES
     and GROOVES used to be lexical globals invisible on window and are now
     inspectable from the console.
     Two things the fast tests found that browser testing had not. (1) trackLen
     treated a zero and a negative length differently — 0 is falsy so it fell
     back to the full pattern, but -4 clamped to 1, a track firing on every
     single step. Unreachable from the UI, reachable from a damaged save; junk
     now consistently means "as long as the pattern". (2) The preset labelled
     "Son clave · 5 in 16" was not playing son clave. Traditional son clave has
     gaps 3,3,4,2,4 — not maximally even, so NO (hits, steps) pair produces it.
     E(5,16) is the 4,3,3,3,3 pattern Toussaint names bossa nova, and the preset
     is relabelled to match what it actually plays. Tresillo, cinquillo and the
     West African bell really are Euclidean and are asserted up to rotation,
     since this implementation deliberately phases every pattern so step 0 is a
     hit.
   - R100: GETTING IT ONTO A HOME SCREEN. The app had no install UI of any kind,
     which meant everyone sent the link was running it in a browser tab — URL
     bar eating the screen, none of the offline behaviour we had been building,
     and gone when the tab closed. The three cases behave completely differently
     and none announce themselves: Chrome fires beforeinstallprompt, which can
     be saved and replayed as a real system dialog; iOS Safari never prompts and
     has NO API, so the only honest move is to say where the button is (Share →
     Add to Home Screen); everything else varies enough that pointing at the
     browser menu beats inventing a path. In-app browsers (Facebook, Instagram)
     cannot install at all and are told to open in Safari instead.
     Two shapes, one component: a one-time dismissible banner that only appears
     once the first-run tour has been dealt with, so the two never collide, and
     a permanent panel in PROJ so dismissing the nudge never makes installing
     undiscoverable. Already installed shows neither. The detection is pure and
     lives in src/pure/install.js, tested against real user-agent strings rather
     than whatever browser happens to run the suite.
     Written as a Svelte component — the first feature built the new way rather
     than added to the engine. The banner is hidden on short screens: it is
     worth a strip of a tall phone, but on a sideways one it cost a tenth of the
     app for a portrait-time action, which the landscape layout test caught.
   - R101: CALMER, AND EASIER TO WORK IN. Everything was 8-12px monospace with a
     1px line around it, which reads as technical and cold and is genuinely hard
     on the eyes. The biggest single change is two typefaces instead of one:
     words use the system UI face, and monospace is kept for the things that ARE
     data — the LCD, numeric readouts, meters, the rhythm previews — where fixed
     width means something. On top of that, one type scale and one spacing
     rhythm instead of sizes chosen ad hoc, a 40px minimum on controls (grids
     and strips opt out, since a step is square by definition), softer surfaces,
     rounder corners, and headings that separate sections by weight and space
     rather than a rule drawn across the panel.
     The tab bar now scrolls sideways with comfortable targets. Ten tabs already
     crowded a phone and an eleventh would not have fitted at all; switching to
     a tab from elsewhere scrolls it into view, or it would appear to do nothing.
     Four things the bigger type broke, each caught by measuring rather than by
     eye: "BANK A" wrapped onto two lines (the row is now labelled BANK once,
     with A/B/C/D beside it, which was inconsistent anyway); the tempo readout
     clipped to "92." because the shared input padding ate the last digit; the
     header overflowed a narrow phone and pushed the record button off-screen,
     because both sides were fixed-width and neither could shrink; and a blanket
     white-space:nowrap fixed the first of those while shoving EXPORT COMPRESSED
     400px wide on a 375px screen, so it is now applied only to the rows that
     need it. The hint clamp had to be re-derived too — it is sized to the
     line-height, and changing the type size silently started it cutting through
     the middle of a line again, exactly as in R95. Both the app rule and the
     test now compute from the line-height instead of a magic number.
   - R102: A MIC TAB. Microphone capture existed but was scattered and none of
     it was direct: SMPL recorded a raw sample, TRAX would take MIC as a lane
     source but only while the sequencer rolled, and the AMP chain is voiced for
     a guitar — cabinet filtering and a presence bump, which is wrong for a
     voice. This is a channel built for a microphone, and a record button that
     needs nothing armed and nothing playing.
     Chain: source → gate → rumble highpass → tone lowpass → compressor →
     sibilance cut → low/mid/high → character → doubler → out, with monitor,
     reverb and delay sends, and a capture destination. Eight presets from
     Natural through Telephone and Megaphone to Huge. MONITOR is off until
     asked, because a monitored mic on speakers howls, and the hint next to it
     says so in both states.
     SIBILANCE is a fixed peaking cut near 7kHz, not a true dynamic de-esser —
     that needs sidechained band splitting, which Web Audio cannot do cleanly
     without phase trouble. It is named for what it does rather than what it is
     not.
     RECORD captures the shaped channel through a MediaStreamDestination (or the
     raw mic, if you untick it) and drops the take on the next empty tape lane
     or the selected pad. The iOS permission dance — the remembered-deny
     preflight, the play-and-record session category, and a real message for
     each failure — was factored out of the sampler's mic button so every entry
     point explains itself the same way. Verified end to end against Chromium's
     fake capture device rather than mocked.
     Also fixes a slider-label bug the new type size exposed everywhere: a flex
     item shrinks below its content by default, so longer names (SIBILANCE,
     CHARACTER) were being squeezed and clipped. Labels and readouts now hold
     their width and the slider takes what is left.
   - R103: SECTIONS WERE PAINTING ON TOP OF EACH OTHER. Reported as crowded,
     overlapping text at the top of the MIX tab in landscape, and the cause runs
     deeper than it looks. A .view is a flex child, so its height is DEFINITE;
     when a grid container has a definite block size and its auto rows overflow
     it, the browser shrinks those rows toward each item's MIN-content
     contribution — and an element with overflow:hidden or overflow:auto has a
     min-content HEIGHT of zero. So the clamped hint got a 22px row and the
     mixer strips a 12px row, and every section after them was drawn over the
     one before. grid-auto-rows:max-content sizes each row to its item and lets
     the panel scroll, which is what a scrolling panel wanted anyway.
     This also explains R95: the hint being squashed there was the same bug, and
     align-items:start only stopped the ITEM shrinking into the too-small row —
     it never fixed the row. The layout suite had checked for sideways overflow
     but never for overlap, which is how it survived two releases; it now walks
     every tab at six sizes and fails if any two sections intersect. Confirmed
     by reverting the fix and watching four of the six sizes fail — including
     iPad portrait, where the sampler's download list was sitting on top of the
     waveform, which nobody had reported.
     Also: the mixer's vertical faders were the only native-blue controls in an
     otherwise amber app, because -webkit-appearance:slider-vertical opts a
     range back into the platform look. writing-mode does the rotating without
     giving up the custom thumb.
   - R104: THE MORPH SLIDER WAS HIJACKING THE SEQUENCER. Reported as hits not
     lighting up in the circle view, and the cause was a footgun introduced with
     MORPH itself: dragging the AMOUNT slider ENGAGED the morph. A thumb brushing
     it on the way past was enough. From then on the grid and the circle showed a
     BLEND rather than the pattern — so on a project whose second pattern is
     empty, the hits simply vanished — and every edit was silently refused, with
     nothing having announced that a mode had been entered.
     The slider now only sets the amount and redraws the preview strip. MORPH is
     the only thing that starts a morph, which is what the button is for, and
     END:HOLD already existed for hand-scrubbing once it is running.
     A running morph is also no longer something you have to infer: a badge sits
     directly above the step grid naming both patterns and the amount, and the
     circle paints the same warning across the top, because that view fills the
     screen and the badge would be off-shot.
     The circle suite only ever checked the DATA — ring lengths, which track is
     selected, where the playheads sit — which is why a rendering complaint had
     to come from a user. It now reads the canvas: hits must light the rings well
     beyond the ring-label baseline, no playhead may be painted while stopped,
     and one must be painted on every frame while playing, moving as it goes.
   - R105: REPORTS YOU CAN ACTUALLY READ. Feedback was packaged into an opaque
     jbhfb1 base64 blob and handed to the share sheet, which on a phone means a
     FILE with nowhere sensible to send it — and even once it arrived it needed
     feedback/decode.js to read. Reports are plain Markdown now: what happened,
     the build, the device, and the engine diagnostics folded into a details
     block. Nothing to decode.
     POST TO THE ISSUE TRACKER opens a prefilled GitHub issue, labelled 'beta
     report'; the tester presses Submit and it is immediately readable and
     repliable, with no relay to deploy and no file to pass around. COPY IT
     INSTEAD puts the identical text on the clipboard for anyone without a
     GitHub account or who would rather send it privately, and PREVIEW prints
     the exact report into the diagnostic log so nobody has to take on trust
     what is being sent. The body is built to a character budget so the issue
     URL stays inside what GitHub accepts, and it says when the diagnostics had
     to be trimmed rather than dropping them silently.
     The panel used to promise the report was 'private; sent only to the
     developer' and that 'other testers never see it'. The repository is PUBLIC,
     so that claim would have been false the moment reports became issues. It
     now says the project is public, says what the diagnostics contain (engine
     state — pad slots, levels, errors; no project names, no sample names, no
     audio), and offers COPY as the genuinely private route.
   - R106: REPORTING WITHOUT AN ACCOUNT. R105 made reports readable but left the
     main route needing a GitHub login, which is no good for a tester who just
     wants to type a few words. A static offline file cannot write to a repo by
     itself — that needs a secret, and a secret shipped inside a public app gets
     abused — so the relay in feedback/worker.js does it: the app POSTs the
     report, the relay holds the token server-side and appends it to
     feedback/inbox.json, and it is read from there. The tester needs no
     account, installs nothing, and never sees a file.
     The relay already existed for the old blob format; it now takes plain
     Markdown, so the inbox is readable without decoding anything. With an
     endpoint configured SEND is one tap; with none it says so plainly, keeps
     the issue-tracker route, and warns that one needs an account and is public.
     A relay that is down or blocked falls back to the issue tracker rather than
     losing the report.
     feedback/decode.js turns out to have been broken since R97: package.json
     gained "type": "module", which made its require() calls illegal. Nobody
     noticed because there were no reports to read. Rewritten as ESM, taught the
     new format, and now covered by the suite.
   - R107: IN-APP REPORTING REMOVED. Three releases chased the same goal — let a
     tester type a few words somewhere they can actually be read — and every
     route carried a cost that was not worth paying. A file from the share sheet
     had nowhere useful to go. An issue on the tracker needed a GitHub account
     and made the report public. A relay solved both but needed a token, a
     Cloudflare deploy and a URL pasted back in: a lot of standing machinery for
     a handful of beta testers who can simply send a message.
     So the panel, the relay, the decoder and the inbox are gone. DIAG in the
     PROJ tab still prints the same engine state into the diagnostic log, so
     anyone hitting a problem can copy that in alongside their own words — which
     is what happened in practice anyway. The room in PROJ is free for something
     worth having.
     Kept in git history rather than erased from it: feedback/worker.js and
     decode.js are one revert away if a real inbox is ever wanted.
   - R108: MIC + AMP SETTINGS LIVE WITH THE PROJECT. Twenty-nine controls
     between the two tabs, and every one of them was thrown away on reload —
     you re-dialled your voice or your amp from scratch every session, which
     made both tabs feel disposable. They now save and restore the way S.inst
     already did: a flat map of control id → value, read off the DOM and written
     back, including the CAB and CHORUS toggle buttons, which are buttons rather
     than inputs and would otherwise have been missed. The readouts are redrawn
     on restore, since each control's own listener normally writes them and a
     restored slider would otherwise sit next to the previous project's number.
     Two things are deliberately not stored. The input device, because a
     deviceId from one phone is meaningless on another. And MONITOR — reopening
     a project with the mic monitor already live would howl through the speakers
     before anyone could reach a control.
     Restoring reaches the live audio when the mic or amp is already open, and
     does nothing but fill the controls when it is not. A document with junk
     values, or an older one with no mic/amp keys at all, still loads: an
     unrecognised preset falls back to a real option rather than leaving the
     control blank.
   - R109: THE OUT TAB — a mastering stage you can see. The mix went from the
     pads straight into a compressor and out; there was nowhere to shape the
     whole thing and nothing to look at while deciding. OUT adds a log-frequency
     spectrum, peak/RMS/loudness/mono-safe meters with a plain-English line
     underneath, and a master chain sitting between the performance filter and
     the compressor: three-band EQ, mid/side width, a bass-mono crossover and an
     adjustable output ceiling. MASTER, REVERB and DELAY moved here from MIX,
     which was carrying two jobs.
     The chain is built inside buildGraph and driven by one applyMasterG(g,ctx),
     so the bounce gets the identical treatment — a master you cannot export is
     decoration. The bass-mono stage is a real Linkwitz-Riley crossover (two
     cascaded Butterworth sections each side): the mix is split, the low band is
     summed to the centre, the high band goes on to the width stage, and the two
     add back flat. A single lowpass/highpass pair leaves a +3dB bump right at
     the crossover, and — the first version's actual bug — filtering a band off
     to the side without summing it does not centre anything at all.
     BYPASS A/Bs the tone, image and bass mono only. The ceiling stays engaged
     through it, because a comparison button that can clip the speakers is a
     trap rather than a feature.
     Gain and volume now run 0–200% instead of stopping at unity — pad gain,
     instrument and mixer volume, reverb send, and the MIDI CC scalings that
     feed them — with the ceiling there to catch what that invites. Readouts are
     percentages, so a fader says 140% rather than 1.4.
     Exported WAVs get TPDF dither before the 16-bit rounding, which trades a
     hiss well below the last bit for the quantisation distortion that otherwise
     lands on quiet fades.
   - R110: SHARPER, BIGGER, CONSISTENT — and a CEILING that means it.
     Four bits of polish and one real bug underneath them.
     CANVASES now match the screen. Every canvas is drawn in the fixed logical
     space its width/height attributes describe, and CSS stretched that to fit;
     on a phone in portrait the ratio happened to land near 2x, but in landscape
     and on iPad it did not — the waveform and the spectrum ran at 0.73x on an
     iPad Pro, i.e. drawn with fewer pixels than the screen was showing, then
     upscaled. fitCanvas keeps the logical space exactly as it was, so no
     drawing code changed, and only resizes the backing store to the real
     device pixels. Every canvas is now 2x on every screen tested; the cap is
     deliberate, since 3x costs 2.25x the fill rate of 2x on canvases that
     redraw every frame, for a difference nobody can see on a spectrum bar.
     TOUCH TARGETS. The six checkboxes rendered at the browser default 13x13 —
     half of WCAG 2.2's floor and the only controls in the app ignoring --tap.
     They are 24x24 now. The mixer's M/S pair came out 23.5px wide because two
     buttons and a gap were splitting a 50px content box; the strip is 66px
     instead of 62. Nothing in any tab is below 24x24 any more.
     ONE SEND, ONE UNIT. Reverb and delay sends read "0.35" in the pad editor,
     the mixer's pad strip and TRAX FX, but "35%" on the instrument, the amp,
     the mic and the master return — the same knob speaking two languages
     depending on which tab you found it in. All percentages now. Pan reads
     L50 / C / R75 rather than -0.50, which says where the sound is instead of
     what the number is.
     AUTO + TRIM. A master trim between the compressor and the limiter, and a
     button that sets it so the loudest peak in the mix lands on the ceiling.
     AUTO renders the mix offline and taps it where the trim leaves off, BEFORE
     the limiter and the safety clipper, because those two are exactly what hide
     the overshoot being measured — ask the finished bounce how loud it is and
     it will always answer "the ceiling". One press writes one number into a
     slider you can see and move yourself; it undoes and saves like anything
     else, rather than being a process quietly riding your master.
     And the bug AUTO turned up: CEILING RAN BACKWARDS. A DynamicsCompressor
     applies makeup gain of its own, scaled to the threshold, so lowering the
     ceiling made everything LOUDER — a mix 20dB below the threshold, nowhere
     near it, came out 6.6dB hotter at a -12dB ceiling than at -0.5dB, and
     nothing was ever held at the stated level. The amount is
     implementation-defined, so it is now measured in whatever browser is
     running rather than assumed, and cancelled. A mix under the ceiling is
     untouched by it at any setting; a hot one is held to within a dB of what
     the label says. The help text no longer claims a 20:1 limiter is a
     brickwall — the soft clipper after it is what guarantees 0dBFS is
     unreachable, and it says so.
   - R111: AUTO LISTENS TO THE WHOLE PIECE. Reported: it wasn't hearing enough
     to judge fairly. It wasn't. Two things were wrong.
     SCOPE. It rendered whatever BOUNCE's source dropdown said, which lives on
     another tab and ships set to CURRENT PATTERN — so a trim meant to protect a
     whole song was being decided by one pattern, and the chorus sailed straight
     past it. AUTO now ignores that dropdown and takes the fullest arrangement
     there is: the song if you have one, else the chain, else this pattern. It
     says which, and how much music that is, before it starts.
     SAMPLING. Worse, one pass systematically UNDER-reads. Probability locks
     skip hits and humanize scales velocities down — neither can ever make a
     render louder, only quieter — so measuring one ordinary take and trusting
     it guarantees the next bounce is hotter than the trim allowed for. The
     analysis pass now pins both to their loudest setting: every probability
     step fires, no velocity thinning. Deterministic, so pressing AUTO twice
     gives the same number.
     What that still cannot bound is humanize's TIMING jitter, which can push a
     peak up rather than down — nudge two hits a few milliseconds apart and
     their transients may line up better than they do on the exact grid.
     Sampling it properly means rendering the whole piece several times over, at
     roughly twice realtime, behind a button; not worth it. So it is given room
     instead, scaled to the humanize setting, and the limiter downstream absorbs
     what an unlucky take does with the rest.
     The analysis also drops the reverb tail — a convolution tail is loudest
     where it starts, under the music that made it, so cutting it cannot lower
     the peak — which halves the wait on a single pattern. A full song is still
     a real wait, but the render runs on the audio thread: measured zero
     main-thread stalls across a 30-second analysis, so the app stays usable
     throughout, and the LCD says so rather than looking hung.
   - R112: THE RECIPE BOOK. The tour explains what things are; nobody learned a
     groovebox from a glossary. Five recipes now walk you through actual work —
     a beat from one sound, your voice on a pad, a loop turned into an
     arrangement, a live take on tape, and mastering and exporting a file —
     each ending in something that exists rather than a page you have read.
     They run on the tour's own machinery: same overlay, same spotlight, same
     tab-switching. What is new is that a step can WATCH. Fourteen of the thirty
     steps name a condition — a sample on a pad, two patterns in the chain, the
     transport rolling — poll it four times a second, and move on by themselves
     when it comes true. NEXT still works, because a guide that traps you is
     worse than one you ignore, and leaving mid-recipe keeps everything you made.
     Alongside them, one line of suggestion under the tabs, drawn from the state
     of the project: an empty bank is told where sounds come from, a kit with no
     pattern is pointed at EUCLID, width up with bass mono off gets flagged, a
     mix slammed into the limiter is pointed at AUTO. Rules, not a model — the
     app has a finite number of states worth commenting on, every line names a
     control that exists, and a small language model would have invented
     controls that do not. SHOW ME borrows the spotlight for a second. Dismiss
     silences one for the session; the checkbox in the ? menu silences the lot
     for good, and that choice survives a reload.
     The ? button is now the single door to all of it — tour, recipes, and the
     switch — which meant the card had to hold a lot more than it used to. It
     scrolls its BODY rather than itself, so SKIP and NEXT stay on screen: at
     40vh on a phone held sideways the exits had ended up below the fold, and a
     dialog you can only leave by scrolling is a trap.
   - R113: THE RECIPES NOW ACTUALLY GUIDE. Reported: it showed instructions but
     then left you on your own — "a slide show, essentially". Correct, and for
     two reasons that between them made guiding impossible.
     YOU COULD NOT REACH THE CONTROL. #tourDim is a full-screen layer and took
     every tap: elementFromPoint over a spotlighted BUILD KIT returned the dim,
     not the button. Fine for a tour, which only asks you to read — fatal for a
     recipe, which asks you to press something. The overlay now passes clicks
     through and only the card takes them, and with a spotlight up the flat dim
     is hidden so the ring's own shadow both darkens the page and leaves a real
     hole in it.
     EVERY STEP WAS ALREADY DONE. The predicates asked whether a state was true,
     not whether you had done anything — and the demo project ships with sixteen
     pads loaded and twelve hits written, so "a sound on a pad", "a bank with a
     kit in it" and "hits in the pattern" were all satisfied the instant the
     step opened. Three steps auto-advanced in under a second each. That is
     precisely the slide show.
     Steps now complete on a change YOU caused: `tap` waits for the actual
     control to be pressed, `base` snapshots a value as the step opens so
     `done(base)` can require it to have moved. Fourteen watched steps, all
     converted. The opening step of the beat recipe also moved from the pack
     list to PRESETS → RENDER → PAD, which synthesises a sound on the spot and
     so needs neither a downloaded pack nor a connection.
     The tests deserved this: they walked the steps by calling tourShow()
     directly, which verified the mechanism and never once asked whether a
     person could follow it. There is now one that drives a whole recipe by
     clicking the real buttons at real coordinates, and one that opens every
     watched step on the untouched demo project and fails if any of them
     advances while nobody is touching anything.
   - R114: THE MIC RECIPE LEFT A SILENT PAD. Reported, and reproduced: the
     noise gate shipped at 12%, and its threshold is that number times 0.35
     compared against RMS — so it only opened above about -27dBFS RMS. With
     autoGainControl deliberately off, a phone at arm's length does not get
     there, so the gate never opened and RECORD captured the shaped channel
     downstream of it: a buffer of digital silence, placed on a pad, announced
     as "TAKE → A04".
     Three things were wrong and all three are fixed.
     The gate now ships OFF. A gate is something you dial in while watching the
     meter, not something that eats your first take before you know it exists.
     The meter lied by omission. It reads PEAK while the gate compares RMS, and
     on a voice those are far apart — the bar danced convincingly while nothing
     got through. A held gate now says GATE SHUT where the level is and stripes
     the bar red, so the one number you are looking at stops disagreeing with
     what the audio is doing.
     And a silent take is no longer reported as a success. TRAX has guarded this
     since R44; the mic never did. The take is kept — it is still your
     recording — but the message says it is empty and names the likely cause,
     the gate or the level, depending on which one it actually is.
     The recipe gained a step for it, too: after the mic goes on it will not
     move on until the meter actually shows signal, which is the step that would
     have stopped this happening in the first place.
   ================================================================ */
const BUILD = 'JBH-88 · R114 · 2026-07-27 · the mic gate no longer eats your take';
document.getElementById('build').textContent = BUILD;
document.getElementById('build2').textContent = BUILD;
console.log(BUILD);

const $ = id => document.getElementById(id);
const lcd = m => { $('lcdmsg').textContent = m; };
/* clamp, posMod, clampBpm, mulberry32 → src/pure/math.js */
function bpmAbs(){ return Math.abs(S.bpm); }

/* ---------------- how a value reads ----------------
   One send level, one way of writing it. Reverb and delay sends used to read
   "0.35" on a pad, in the pad's mixer strip and on a tape track, but "35%" on
   the instrument, the amp, the mic and the master return — the same knob
   speaking two languages depending on which tab you found it in.
   Pan is written the way every mixer writes it, because "-0.50" tells you a
   number and "L50" tells you where the sound is. */
const sendText = v => Math.round((+v||0)*100)+'%';
const dbLin = db => Math.pow(10, (+db||0)/20);
const dbText = db => ((+db||0)>0?'+':'')+(+db||0).toFixed(1)+'dB';
function panText(v){
  const n=+v||0, a=Math.round(Math.abs(n)*100);
  return a<3 ? 'C' : (n<0?'L':'R')+a;
}

/* ---------------- state ---------------- */
/* NPADS/NSTEPS/NPAT/MAXSTEPS/PATLENS, patLen → src/pure/pattern.js */
function curPatLen(){ return patLen(typeof curPat==='function' ? curPat() : S.patterns[S.pattern]); }
function newPad(i){ return { bufId:-1, name:'', start:0, end:1,
  gain:0.9, pitch:0, fine:0, speed:1, keepPitch:false, pan:0, rev:0, dly:0, att:0.002, rel:0.06,
  grSize:0.12, grDens:18, grSpread:0.05, grPitch:0, grPos:0, grBurst:0.45,
  choke:0, note:36+i, reverse:false, mode:'one',
  ftype:'off', fcut:1, fres:0.9, drv:0, crush:16,
  eqLo:0, eqMid:0, eqHi:0,
  lfoOn:false, lfoTgt:'cutoff', lfoShape:'sine', lfoSync:'free', lfoRate:2, lfoDepth:0.5,
  warpBeats:4, warpBpm:0, mute:false, solo:false }; }
/* newPattern, trackLen, rowUsed, stepLock, stepHasLock → src/pure/pattern.js */

const S = {
  pads: Array.from({length:NPADS},(_,i)=>newPad(i)),
  buffers: [],            // AudioBuffers, referenced by pads via bufId
  patterns: Array.from({length:NPAT},()=>newPattern()),
  pattern: 0, bank: 0, editPad: 0, seqPad: 0,
  bpm: 100, swing: 0, human: 0, autoWarp: false, silFade: 0.06, masterVol: 0.9, delayFb: 0.35,
  revLvl: 0.9, revSize: 3.0, revType: 'hall', delayDiv: 0.375, dlyTone: 5200, dlyMode: 'digital', compAmt: 0.4,
  chain: [], chainOn: false, chainPos: 0,
  vcurve: 'linear', midiCh: -1, extClk: false, pcPat: true,
  midiChrom: false, midiRoot: 60, midiIn: '*',
  scaleLock: false, scaleRoot: 0, scaleName: 'minor',   // musical guard-rail for written + played pitch
  notesOut: false, clkOut: false, midiOutCh: 0,
  ccMaps: {},             // ccNum -> target string
  edit:false, liveRec:false, ptnBpm:false,
  scOn:false, scTrig:0, scDepth:0.6, scRel:0.25,
  autoTarget:'mfilt',
  song:[], songOn:false, songLoop:true,
  morph:{ on:false, from:0, to:1, bars:8, curve:'weight', mode:'once', vel:true, amt:0, pos:0 },
  /* master chain (OUT tab). Neutral by default: flat EQ, natural width, and a
     ceiling just under 0 so nothing changes until it is asked to. */
  mEqLo:0, mEqMid:0, mEqHi:0, mWidth:1, mCeil:-1.0, mMono:0, mByp:false, mTrim:0
};
const revCache = {};      // bufId -> reversed AudioBuffer

/* ---------------- audio graph ---------------- */
let AC=null, LIVE=null;      // LIVE = {master,comp,revIn,dlyIn,dlyFb,dlyNode,pads:[...]}
// IR generated per-graph from S.revSize (deterministic seed)


/* irDur → src/pure/ir.js */
function makeIR(ctx, size, type){ // deterministic IR family — identical live and offline
  const t=type||'hall', sr=ctx.sampleRate;
  const dur=irDur(size,t);
  const len=Math.floor(sr*dur), b=ctx.createBuffer(2,len,sr);
  for(let ch=0; ch<2; ch++){
    const d=b.getChannelData(ch), rnd=mulberry32(880+ch+t.length*7);
    let st=0;
    for(let i=0;i<len;i++){
      const x=i/len, n=rnd()*2-1;
      let v;
      if(t==='room'){ v=n*Math.pow(1-x,1.7)*0.6; }
      else if(t==='plate'){ v=(n-st*0.55)*Math.pow(1-x,2.1)*0.55; st=n; }               // pre-emphasized: bright & dense
      else if(t==='spring'){ const flut=0.25+0.75*Math.abs(Math.sin(Math.PI*i/(0.048*sr)));
        v=n*Math.pow(1-x,2.0)*flut*0.55; }                                              // periodic boing flutter
      else if(t==='cath'){ const a=0.35*(1-x)+0.03; st+=(n-st)*a; v=st*Math.pow(1-x,3.0)*0.9; } // darkens as it dies
      else if(t==='gated'){ v=(x<0.72? n*(0.5-x*0.25) : 0); }                           // 80s hard gate
      else { v=n*Math.pow(1-x,2.6)*0.5; }                                               // hall
      d[i]=v;
    }
    if(t==='room'){ for(let k=1;k<=6;k++){ const p=Math.floor(sr*0.008*k*(1+k*0.13)); if(p<len) d[p]+=(k%2?0.5:-0.4)/k; } }
  }
  return b;
}
function buildDelayNet(ctx,g){ // delay network per S.dlyMode — dlyIn stays as the stable send target
  if(!g.dlyIn) g.dlyIn=ctx.createGain(); else { try{ g.dlyIn.disconnect(); }catch(e){} }
  (g._dlyKill||[]).forEach(n=>{ try{ n.disconnect(); if(n.stop) n.stop(); }catch(e){} });
  const mode=S.dlyMode||'digital', dt=delayTime();
  g.dlyFilt=ctx.createBiquadFilter(); g.dlyFilt.type='lowpass'; g.dlyFilt.frequency.value=S.dlyTone;
  g.dlyFb=ctx.createGain(); g.dlyFb.gain.value=S.delayFb;
  g.dlyFb2=null;
  if(mode==='pingpong' && ctx.createStereoPanner){
    const dL=ctx.createDelay(2), dR=ctx.createDelay(2);
    dL.delayTime.value=dt; dR.delayTime.value=dt;
    const pL=ctx.createStereoPanner(), pR=ctx.createStereoPanner();
    pL.pan.value=-0.85; pR.pan.value=0.85;
    g.dlyFb2=ctx.createGain(); g.dlyFb2.gain.value=S.delayFb;
    g.dlyIn.connect(dL);
    dL.connect(pL); dR.connect(pR);
    pL.connect(g.dlyFilt); pR.connect(g.dlyFilt);
    dL.connect(g.dlyFb); g.dlyFb.connect(dR);
    dR.connect(g.dlyFb2); g.dlyFb2.connect(dL);
    g.dlyNodes=[dL,dR];
    g._dlyKill=[dL,dR,pL,pR,g.dlyFb,g.dlyFb2,g.dlyFilt];
  }else{
    const d=ctx.createDelay(2); d.delayTime.value=dt;
    g.dlyIn.connect(d); d.connect(g.dlyFilt);
    if(mode==='tape'){ // saturated feedback + slow wow
      const sat=ctx.createWaveShaper(); sat.curve=makeDriveCurve(0.22);
      g.dlyFilt.connect(sat); sat.connect(g.dlyFb); g.dlyFb.connect(d);
      const lfo=ctx.createOscillator(); lfo.frequency.value=0.5;
      const lg=ctx.createGain(); lg.gain.value=0.0035;
      lfo.connect(lg); lg.connect(d.delayTime); lfo.start();
      g._dlyKill=[d,sat,lfo,lg,g.dlyFb,g.dlyFilt];
    }else{
      g.dlyFilt.connect(g.dlyFb); g.dlyFb.connect(d);
      g._dlyKill=[d,g.dlyFb,g.dlyFilt];
    }
    g.dlyNodes=[d];
  }
  g.dlyFilt.connect(g.master);
}
function liveDelaySync(){ if(!LIVE) return; (LIVE.dlyNodes||[]).forEach(d=>d.delayTime.setTargetAtTime(delayTime(),AC.currentTime,0.05)); }
function compThresh(){ return -6 - S.compAmt*26; }

function makeDriveCurve(amt){
  if(amt<=0) return null;                      // null curve = pass-through
  const n=1024, c=new Float32Array(n), k=1+amt*40, norm=Math.tanh(k);
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x)/norm; }
  return c;
}
function makeCrushCurve(bits){
  if(bits>=16) return null;
  const n=2048, c=new Float32Array(n), steps=Math.pow(2,bits);
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.round(x*steps)/steps; }
  return c;
}
function cutHz(x){ return 60*Math.pow(16000/60, clamp(x,0,1)); } // log map 60Hz–16kHz
function makeSoftClip(){ // identity below 0.7, smooth knee to ~0.93, clamps peaks
  const n=2048, c=new Float32Array(n), t=0.7;
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1, ax=Math.abs(x);
    const y = ax<=t ? ax : t+(1-t)*Math.tanh((ax-t)/(1-t));
    c[i]=(x<0?-1:1)*y;
  }
  return c;
}

function applyPadFx(n, p, ctx){
  n.drv.curve = makeDriveCurve(p.drv);
  n.crush.curve = makeCrushCurve(p.crush);
  if(p.ftype==='off'){ n.flt.type='peaking'; n.flt.gain.value=0; n.flt.frequency.value=1000; n.flt.Q.value=0.5; }
  else{ n.flt.type=p.ftype; n.flt.gain.value=0; n.flt.frequency.value=cutHz(p.fcut); n.flt.Q.value=p.fres; }
  if(n.eqLo){ n.eqLo.gain.value=p.eqLo||0; n.eqMid.gain.value=p.eqMid||0; n.eqHi.gain.value=p.eqHi||0; }
}
const LFO_BEATS={'1/1':4,'1/2':2,'1/4':1,'1/8':0.5,'1/16':0.25};
function lfoHz(p){
  if(p.lfoSync && p.lfoSync!=='free'){ const beats=LFO_BEATS[p.lfoSync]||1; return 1/(beats*(60/bpmAbs())); }
  return clamp(p.lfoRate||2,0.02,40);
}
function applyPadLfo(n, p, ctx){
  if(!n||!n.lfoAmp) return;
  const t=ctx?ctx.currentTime:0;
  try{ n.lfoAmp.disconnect(); }catch(e){}
  if(!p.lfoOn){ try{ n.lfoAmp.gain.setValueAtTime(0,t); }catch(e){} return; }
  try{ n.lfoOsc.type=p.lfoShape||'sine'; }catch(e){}
  try{ n.lfoOsc.frequency.value=lfoHz(p); }catch(e){}   // direct set — control-rate LFO, no click, getter stays truthful
  const d=clamp(p.lfoDepth||0,0,1);
  if(p.lfoTgt==='pan' && n.pan){ n.lfoAmp.gain.value=d; n.lfoAmp.connect(n.pan.pan); }
  else if(p.lfoTgt==='vol'){ n.lfoAmp.gain.value=d*0.6; n.lfoAmp.connect(n.ch.gain); }
  else { n.lfoAmp.gain.value=d*2400; n.lfoAmp.connect(n.flt.detune); }   // cutoff via detune (cents) — musical, log sweep
}
function refreshLfoRates(){   // synced LFOs follow tempo changes
  if(!LIVE||!LIVE.pads) return;
  for(let i=0;i<NPADS;i++){ const p=S.pads[i], n=LIVE.pads[i];
    if(p.lfoOn && p.lfoSync!=='free' && n&&n.lfoOsc){ try{ n.lfoOsc.frequency.value=lfoHz(p); }catch(e){} } }
}

function buildGraph(ctx){
  const g={};
  g.master = ctx.createGain(); g.master.gain.value = S.masterVol;
  g.comp = ctx.createDynamicsCompressor();
  g.comp.threshold.value=compThresh(); g.comp.ratio.value=3;
  g.comp.attack.value=0.003; g.comp.release.value=0.25;
  // performance insert — tilt-wah filter + stutter gate act on the whole mix
  g.perfFilt=ctx.createBiquadFilter(); g.perfFilt.type='lowpass';
  g.perfFilt.frequency.value=18500; g.perfFilt.Q.value=0.7;
  g.perfGain=ctx.createGain();
  // brickwall limiter — catches summed-voice peaks so dense/fast playing
  // doesn't clip into the destination (hard-clip = the clicking/distortion)
  g.limiter=ctx.createDynamicsCompressor();
  g.limiter.threshold.value=S.mCeil; g.limiter.knee.value=0; g.limiter.ratio.value=20;
  g.limiter.attack.value=0.001; g.limiter.release.value=0.05;
  // final soft-clip safety: preserves levels <0.7, saturates smoothly toward
  // ~0.93 and clamps anything above — output can never hard-clip the destination
  g.softclip=ctx.createWaveShaper(); g.softclip.curve=makeSoftClip(); g.softclip.oversample='2x';
  g.mTrim=ctx.createGain(); g.mTrim.gain.value=dbLin(S.mTrim);
  // cancels the limiter's own makeup gain, so CEILING means what it says
  g.limComp=ctx.createGain(); g.limComp.gain.value=1/makeupAt(S.mCeil);
  /* MASTER CHAIN (OUT tab) — inserted between the performance filter and the
     compressor, because EQ and imaging belong before dynamics, and because it
     is built HERE it exists identically in the offline bounce. What you hear is
     what the WAV contains. */
  g.mLo =ctx.createBiquadFilter(); g.mLo.type='lowshelf';  g.mLo.frequency.value=110;
  g.mMid=ctx.createBiquadFilter(); g.mMid.type='peaking';  g.mMid.frequency.value=1000; g.mMid.Q.value=0.7;
  g.mHi =ctx.createBiquadFilter(); g.mHi.type='highshelf'; g.mHi.frequency.value=6500;

  /* Mono-maker: everything below this frequency is summed to the centre. A
     mastering habit rather than a gimmick — wide bass smears on a club system
     and disappears on a phone speaker. 10 Hz = off.

     A real crossover, not a filter bolted on the side: the mix is SPLIT here,
     the low band is summed to mono, the high band goes on to the width stage,
     and the two are added back at the compressor. Both halves are two cascaded
     Butterworth sections (Q=1/sqrt2), i.e. Linkwitz-Riley 4th order, which is
     the pairing that sums back to flat — a single lowpass/highpass pair leaves
     a +3dB bump right at the crossover. */
  const lr=(type)=>{ const f=ctx.createBiquadFilter(); f.type=type;
    f.frequency.value=10; f.Q.value=Math.SQRT1_2; return f; };
  g.mMonoLo=lr('lowpass');  g.mMonoLo2=lr('lowpass');
  g.mMonoHi=lr('highpass'); g.mMonoHi2=lr('highpass');
  /* the low band, folded to the centre: L and R at half each into one channel,
     which the stereo bus below then feeds equally to both speakers */
  g.mMonoSplit=ctx.createChannelSplitter(2);
  g.mMonoL=ctx.createGain(); g.mMonoL.gain.value=0.5;
  g.mMonoR=ctx.createGain(); g.mMonoR.gain.value=0.5;
  g.mMonoSum=ctx.createGain();
  g.mMonoLo.connect(g.mMonoLo2); g.mMonoLo2.connect(g.mMonoSplit);
  g.mMonoSplit.connect(g.mMonoL,0); g.mMonoSplit.connect(g.mMonoR,1);
  g.mMonoL.connect(g.mMonoSum);    g.mMonoR.connect(g.mMonoSum);
  g.mMonoHi.connect(g.mMonoHi2);

  /* Mid/side width. M=(L+R)/2, S=(L-R)/2, then L=M+wS and R=M-wS, so w=1 is
     bit-for-bit unchanged, 0 is mono and 2 is wide. */
  g.wSplit=ctx.createChannelSplitter(2);
  g.wMidL=ctx.createGain(); g.wMidL.gain.value=0.5;
  g.wMidR=ctx.createGain(); g.wMidR.gain.value=0.5;
  g.wMid =ctx.createGain();
  g.wSideL=ctx.createGain(); g.wSideL.gain.value=0.5;
  g.wSideR=ctx.createGain(); g.wSideR.gain.value=-0.5;
  g.wSide=ctx.createGain();
  g.wAmt =ctx.createGain(); g.wAmt.gain.value=S.mWidth;
  g.wNeg =ctx.createGain(); g.wNeg.gain.value=-1;
  g.wOutL=ctx.createGain(); g.wOutR=ctx.createGain();
  g.wMerge=ctx.createChannelMerger(2);
  g.wSplit.connect(g.wMidL,0);  g.wSplit.connect(g.wMidR,1);
  g.wMidL.connect(g.wMid);      g.wMidR.connect(g.wMid);
  g.wSplit.connect(g.wSideL,0); g.wSplit.connect(g.wSideR,1);
  g.wSideL.connect(g.wSide);    g.wSideR.connect(g.wSide);
  g.wSide.connect(g.wAmt);
  g.wMid.connect(g.wOutL);  g.wAmt.connect(g.wOutL);            // L = M + wS
  g.wMid.connect(g.wOutR);  g.wAmt.connect(g.wNeg); g.wNeg.connect(g.wOutR);   // R = M - wS
  g.wOutL.connect(g.wMerge,0,0); g.wOutR.connect(g.wMerge,0,1);

  g.master.connect(g.perfFilt); g.perfFilt.connect(g.perfGain);
  g.perfGain.connect(g.mLo); g.mLo.connect(g.mMid); g.mMid.connect(g.mHi);
  g.mHi.connect(g.mMonoHi); g.mHi.connect(g.mMonoLo);            // split at the mono frequency
  g.mMonoHi2.connect(g.wSplit);                                  // above it: stereo width
  g.wMerge.connect(g.comp); g.mMonoSum.connect(g.comp);          // below it: centred, added back
  // master trim — the one gain AUTO moves. It sits after the compressor and
  // before the limiter, so it changes how hard the limiter is driven without
  // changing how much the compressor does; pulling it down makes the limiter
  // stop working rather than making it work on a quieter signal.
  g.comp.connect(g.mTrim); g.mTrim.connect(g.limiter);
  g.limiter.connect(g.limComp); g.limComp.connect(g.softclip);
  g.softclip.connect(ctx.destination);
  // stereo master meter taps — from the limiter (the final-stage level, and a
  // node that survives the softclip re-routing in ensureAudio/rebuildOut)
  g.meterSplit=ctx.createChannelSplitter(2);
  g.meterL=ctx.createAnalyser(); g.meterL.fftSize=1024;
  g.meterR=ctx.createAnalyser(); g.meterR.fftSize=1024;
  g.limiter.connect(g.meterSplit);
  g.meterSplit.connect(g.meterL,0); g.meterSplit.connect(g.meterR,1);
  // reverb
  g.revIn = ctx.createGain();
  g.conv = ctx.createConvolver();
  g.conv.buffer = makeIR(ctx, S.revSize, S.revType);
  g.revRet = ctx.createGain(); g.revRet.gain.value=S.revLvl;
  g.revIn.connect(g.conv); g.conv.connect(g.revRet); g.revRet.connect(g.master);
  // delay (mode-dependent network)
  buildDelayNet(ctx,g);
  // tape-track return — joins at the compressor, after the master tap
  // point, so BUS overdubs never re-record existing tracks
  g.trackBus=ctx.createGain();
  g.trackBus.connect(g.comp);
  // sidechain duck bus — everything routed here dips when the trigger pad fires;
  // the trigger pad itself takes the direct path to master (punches through)
  g.duckBus=ctx.createGain(); g.duckBus.connect(g.master);
  // LIVE-ONLY recording bus: carries just what the player performs (live
  // instruments, AMP, manually-hit pads). Feeds nothing audible — TRAX taps
  // it when SOURCE is LIVE ONLY, so takes exclude the sequencer.
  g.liveBus=ctx.createGain();
  // pad channels — built ONCE, connected ONCE (fan-out fix)
  // per-hit env → [drv → crush → flt] insert chain → ch gain → pan → dry + sends
  g.pads=[];
  for(let i=0;i<NPADS;i++){
    const p=S.pads[i];
    const drv=ctx.createWaveShaper();
    const crush=ctx.createWaveShaper();
    const flt=ctx.createBiquadFilter();
    // 3-band channel EQ: low shelf 200 / mid bell 1k / high shelf 4k, ±12dB
    const eqLo=ctx.createBiquadFilter(); eqLo.type='lowshelf'; eqLo.frequency.value=200;
    const eqMid=ctx.createBiquadFilter(); eqMid.type='peaking'; eqMid.frequency.value=1000; eqMid.Q.value=0.8;
    const eqHi=ctx.createBiquadFilter(); eqHi.type='highshelf'; eqHi.frequency.value=4000;
    const ch=ctx.createGain(); ch.gain.value=p.gain;
    const pan=ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const rev=ctx.createGain(); rev.gain.value=p.rev;
    const dly=ctx.createGain(); dly.gain.value=p.dly;
    drv.connect(crush); crush.connect(flt); flt.connect(eqLo); eqLo.connect(eqMid); eqMid.connect(eqHi); eqHi.connect(ch);
    let tail=ch;
    if(pan){ pan.pan.value=p.pan; ch.connect(pan); tail=pan; }
    // mixer mute/solo gate — downstream of the fader (ch.gain) and its vol-LFO,
    // so a muted channel is truly silent; also the per-channel meter tap point
    const mute=ctx.createGain(); mute.gain.value=1; tail.connect(mute);
    const meterAn=ctx.createAnalyser(); meterAn.fftSize=256; mute.connect(meterAn);
    const dryDuck=ctx.createGain(); dryDuck.gain.value=1;   // ducked path (default)
    const dryDir=ctx.createGain(); dryDir.gain.value=0;     // direct path (trigger pad only)
    mute.connect(dryDuck); dryDuck.connect(g.duckBus);
    mute.connect(dryDir); dryDir.connect(g.master);
    mute.connect(rev); mute.connect(dly);
    rev.connect(g.revIn); dly.connect(g.dlyIn);
    // per-pad LFO — one oscillator + depth gain, routed to the chosen param
    const lfoOsc=ctx.createOscillator(), lfoAmp=ctx.createGain(); lfoAmp.gain.value=0;
    lfoOsc.connect(lfoAmp); try{ lfoOsc.start(); }catch(e){}
    const node={in:drv,drv,crush,flt,eqLo,eqMid,eqHi,ch,pan,rev,dly,dryDuck,dryDir,mute,meterAn,lfoOsc,lfoAmp};
    applyPadFx(node,p,ctx);
    applyPadLfo(node,p,ctx);
    g.pads.push(node);
  }
  return g;
}

function delayTime(){ return clamp(60/bpmAbs()*S.delayDiv, 0.02, 1.9); }
function scApplyRoutingG(g,ctx){ // trigger pad → direct (unducked); others → duck bus
  if(!g||!g.pads) return; const t=ctx?ctx.currentTime:0;
  for(let i=0;i<NPADS;i++){ const n=g.pads[i]; if(!n||!n.dryDuck) continue;
    const isTrig = S.scOn && i===S.scTrig;
    n.dryDuck.gain.setValueAtTime(isTrig?0:1,t);
    n.dryDir.gain.setValueAtTime(isTrig?1:0,t);
  }
  if(!S.scOn && g.duckBus){ try{ g.duckBus.gain.cancelScheduledValues(t); g.duckBus.gain.setValueAtTime(1,t); }catch(e){} }
}
function scApplyRouting(){ if(LIVE) scApplyRoutingG(LIVE,AC); }

function getReversed(bid){
  if(revCache[bid]) return revCache[bid];
  const b=S.buffers[bid]; if(!b) return null;
  let r;
  try{ r=new AudioBuffer({length:b.length,sampleRate:b.sampleRate,numberOfChannels:b.numberOfChannels}); }
  catch(e){ ensureAudio(); r=AC.createBuffer(b.numberOfChannels,b.length,b.sampleRate); }
  for(let c=0;c<b.numberOfChannels;c++){
    const s=b.getChannelData(c), d=r.getChannelData(c);
    for(let i=0,n=b.length;i<n;i++) d[i]=s[n-1-i];
  }
  revCache[bid]=r; return r;
}

/* ---- per-pad playback SPEED ----
   OFF (varispeed): playbackRate is multiplied by speed — pitch follows, like
   a turntable/tape. ON (keepPitch): the sample is time-stretched to 1/speed
   (pitch preserved) and played at base pitch. Stretched buffers are cached
   per (bufId, direction, speed) and rebuilt only when the knob settles, so
   triggers never hitch — a trigger only READS the cache (varispeed fallback
   if it isn't built yet). */
const speedCache = {};   // `${bufId}|${dir}|${spd}` -> pitch-preserved AudioBuffer
function speedKey(bufId,reverse,spd){ return bufId+'|'+(reverse?'r':'f')+'|'+spd.toFixed(3); }
function buildSpeedStretch(bufId,reverse,spd){   // sync build + cache (no-op at 1×)
  if(bufId<0 || Math.abs(spd-1)<=0.001) return null;
  const key=speedKey(bufId,reverse,spd);
  if(speedCache[key]) return speedCache[key];
  const src=reverse?getReversed(bufId):S.buffers[bufId];
  if(!src) return null;
  const out=timeStretch(src, 1/spd);   // faster => shorter, pitch preserved
  speedCache[key]=out; return out;
}
function padSpeed(p){ return clamp(p.speed||1,0.25,4); }
function ensureSpeedCaches(){   // pre-build every pitch-locked pad's stretch (before a bounce, or after load)
  for(let i=0;i<NPADS;i++){ const p=S.pads[i];
    if(p.bufId>=0 && p.keepPitch){ const s=padSpeed(p); if(Math.abs(s-1)>0.001) buildSpeedStretch(p.bufId,!!p.reverse,s); } }
}
/* trigger a pad into a given graph (live or offline) */
const chokeLive = {};    // group -> last env GainNode (live path)
const activeEnv = {};    // padIdx -> {env,src} for gate-mode release (live)
const liveVoices = new Set();   // active live sources for DJ pitch/warble
let perfPitch=0, perfBend=0;    // fader semitones + wheel bend semitones
function perfFactor(){ return Math.pow(2,(perfPitch+perfBend)/12); }
function updatePerf(){
  if(!AC) return;
  const t=AC.currentTime, f=perfFactor();
  liveVoices.forEach(src=>{ try{ src.playbackRate.setTargetAtTime(src._base*f,t,0.02); }catch(e){} });
}
function triggerPad(ctx, g, idx, vel, when, chokeReg, pitchOff, liveTap){
  const p=S.pads[idx]; if(p.bufId<0) return null;
  if(p.mode==='grain'){   // GRAIN pads spray a cloud instead of playing the sample
    scheduleGrains(ctx,g,idx,clamp(vel,0,1),when,clamp(p.grBurst||0.45,0.05,4),pitchOff||0);
    return null;
  }
  let buf=S.buffers[p.bufId]; if(!buf) return null;
  let s0=p.start, e0=p.end;
  if(p.reverse){ buf=getReversed(p.bufId); s0=1-p.end; e0=1-p.start; }
  const baseRate=Math.pow(2,(p.pitch+(pitchOff||0)+p.fine/100)/12);
  // SPEED: varispeed multiplies the rate; keepPitch swaps in a pre-stretched
  // buffer (pitch preserved) and plays at base pitch. If the stretch isn't
  // cached yet, fall back to varispeed for this one hit.
  const spd=padSpeed(p);
  let speedMul=spd;
  if(p.keepPitch && Math.abs(spd-1)>0.001){
    const sb=speedCache[speedKey(p.bufId,!!p.reverse,spd)];
    if(sb){ buf=sb; speedMul=1; }
  }
  const effBase=baseRate*speedMul;
  const live=(ctx===AC);
  const rate=live? effBase*perfFactor() : effBase;
  const off=s0*buf.duration;
  const sliceDur=Math.max(0.005,(e0-s0)*buf.duration);
  const outDur=sliceDur/rate;
  const src=ctx.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate;
  if(live){
    src._base=effBase;
    liveVoices.add(src);
    if(LIVE.warbGain){ try{ LIVE.warbGain.connect(src.playbackRate); }catch(e){} }
  }
  const env=ctx.createGain();
  const v=clamp(vel,0,1);
  env.gain.setValueAtTime(0,when);
  env.gain.linearRampToValueAtTime(v,when+Math.max(0.001,p.att));
  const relStart=when+Math.max(p.att+0.002,outDur-p.rel);
  env.gain.setValueAtTime(v,relStart);
  env.gain.linearRampToValueAtTime(0.0001,relStart+p.rel);
  src.connect(env); env.connect(g.pads[idx].in);
  let ltg=null;
  if(liveTap && g.liveBus){   // per-voice tap: ONLY this manual voice reaches the LIVE-ONLY record bus
    ltg=ctx.createGain(); ltg.gain.value=p.gain;
    env.connect(ltg); ltg.connect(g.liveBus);
  }
  // per-pad voice cap — sustained samples on dense steps used to stack
  // dozens of full-length voices into a wash. 6 leaves room for a chord
  // (NOTES lane harmony) plus its tail overlapping the next step.
  const act=g.pads[idx].act || (g.pads[idx].act=[]);
  act.push(env._v={env,src});
  if(act.length>6){
    const old=act.shift();
    try{ old.env.gain.cancelScheduledValues(when); old.env.gain.setTargetAtTime(0,when,0.015); old.src.stop(when+0.12); }catch(e){}
  }
  // choke
  if(p.choke>0 && chokeReg){
    const prev=chokeReg[p.choke];
    if(prev){ try{ prev.gain.cancelScheduledValues(when); prev.gain.setTargetAtTime(0,when,0.012); }catch(e){} }
    chokeReg[p.choke]=env;
  }
  if(S.scOn && idx===S.scTrig && g.duckBus){   // sidechain: this hit ducks the duck bus
    const dg=g.duckBus.gain, dep=clamp(S.scDepth,0,0.95), rel=clamp(S.scRel,0.03,1);
    try{ dg.cancelScheduledValues(when); dg.linearRampToValueAtTime(1-dep, when+0.012); dg.linearRampToValueAtTime(1, when+0.012+rel); }catch(e){}
  }
  src.start(when,off,sliceDur);
  src.stop(when+outDur+p.rel+0.25);
  src.onended=()=>{
    const i=act.indexOf(env._v); if(i>=0) act.splice(i,1);
    liveVoices.delete(src);
    if(live && LIVE.warbGain){ try{ LIVE.warbGain.disconnect(src.playbackRate); }catch(e){} }
    try{src.disconnect();env.disconnect();}catch(e){}
    if(ltg){ try{ ltg.disconnect(); }catch(e){} }
  };
  return {env,src};
}

/* ---------------- GRANULAR TEXTURE PADS ---------------------------------------
   A pad in GRAIN mode doesn't play the sample — it sprays short windowed
   fragments ("grains") from a position in it. Holding the pad sustains the
   cloud forever from a 0.2s source; sliding your finger moves POSITION (X) and
   DENSITY (Y) live. Grains run through the pad's normal channel, so filter,
   EQ, drive, pan and sends all still apply. Sequenced grain pads play a burst,
   and because the same code path renders offline, bounces match. */
const grainVoices={};      // padIdx -> Set of live sources (so STOP/panic can cut them)
const grainHold={};        // padIdx -> {timer,nextT,vel} while a finger is down
function grainReg(idx,src){
  const set=grainVoices[idx]||(grainVoices[idx]=new Set());
  set.add(src); src.addEventListener('ended',()=>set.delete(src));
}
function scheduleGrains(ctx,g,idx,vel,when,dur,pitchOff){
  const p=S.pads[idx]; if(p.bufId<0) return;
  let buf=S.buffers[p.bufId]; if(!buf) return;
  if(p.reverse){ const r=getReversed(p.bufId); if(r) buf=r; }
  const live=(ctx===AC);
  const dens=clamp(p.grDens||18,1,50), size=clamp(p.grSize||0.12,0.01,0.6);
  const spread=clamp(p.grSpread||0.05,0,1), pj=clamp(p.grPitch||0,0,24);
  const basePos=clamp(p.grPos!=null?p.grPos:p.start,0,1);
  const iv=1/dens, n=Math.max(1,Math.min(400,Math.ceil(dur*dens)));
  for(let i=0;i<n;i++){
    const t=when+i*iv;
    const jit=spread?(Math.random()*2-1)*spread:0;
    const posN=clamp(basePos+jit,0,0.999);
    const semis=p.pitch+(pitchOff||0)+p.fine/100+(pj?(Math.random()*2-1)*pj:0);
    let rate=Math.pow(2,semis/12)*(p.speed||1);
    if(live) rate*=perfFactor();
    const src=ctx.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate;
    const env=ctx.createGain();
    env.gain.setValueAtTime(0,t);
    env.gain.linearRampToValueAtTime(vel*0.7,t+size*0.4);      // Hann-ish window: no clicks
    env.gain.linearRampToValueAtTime(0.0001,t+size);
    let tail=env;
    if(ctx.createStereoPanner && spread>0){
      const pan=ctx.createStereoPanner();
      pan.pan.value=clamp((Math.random()*2-1)*Math.min(1,spread*2),-1,1);
      env.connect(pan); tail=pan;
    }
    src.connect(env); tail.connect(g.pads[idx].in);
    const off=Math.min(posN*buf.duration, Math.max(0,buf.duration-0.005));
    try{ src.start(t,off,Math.min(size*rate+0.02, Math.max(0.005,buf.duration-off))); }catch(e){ continue; }
    try{ src.stop(t+size+0.03); }catch(e){}
    if(live) grainReg(idx,src);
    src.onended=()=>{ try{ src.disconnect(); env.disconnect(); if(tail!==env) tail.disconnect(); }catch(e){} };
  }
}
function grainStart(idx,vel){
  if(grainHold[idx]) return;
  ensureAudio();
  const h={nextT:AC.currentTime,vel:clamp(vel,0.1,1)};
  h.timer=setInterval(()=>{                 // lookahead so the cloud never gaps
    const p=S.pads[idx], dens=clamp(p.grDens||18,1,50);
    while(h.nextT<AC.currentTime+0.15){
      scheduleGrains(AC,LIVE,idx,h.vel,h.nextT,1/dens,0);
      h.nextT+=1/dens;
    }
  },40);
  grainHold[idx]=h;
  flashPad(idx,vel);
}
function grainStop(idx){
  const h=grainHold[idx]; if(!h) return;
  clearInterval(h.timer); delete grainHold[idx];
}
function grainStopAll(){ Object.keys(grainHold).forEach(k=>grainStop(+k)); }
function grainCut(idx){    // hard stop any sounding grains on a pad
  grainStop(idx);
  const set=grainVoices[idx]; if(!set) return;
  set.forEach(s=>{ try{ s.stop(); }catch(e){} }); set.clear();
}
function padRelease(idx){ // gate mode: note-off on touch release (live only)
  repStop(idx);                            // end a NOTE REPEAT roll on release
  grainStop(idx);                          // end a held grain cloud (tails ring out)
  const p=S.pads[idx]; if(p.mode!=='gate') return;
  const a=activeEnv[idx]; if(!a || !AC) return;
  const t=AC.currentTime;
  try{
    a.env.gain.cancelScheduledValues(t);
    a.env.gain.setTargetAtTime(0,t,Math.max(0.01,p.rel*0.5));
    a.src.stop(t+p.rel+0.1);
  }catch(e){}
  delete activeEnv[idx];
}
function stopPadVoices(idx){ // cut every sounding voice on a pad NOW (clear / replace = instant silence)
  try{ grainCut(idx); }catch(e){}
  if(!AC || !LIVE || !LIVE.pads[idx]) return;
  const t=AC.currentTime, act=LIVE.pads[idx].act;
  if(act){ act.forEach(v=>{ try{ v.env.gain.cancelScheduledValues(t); v.env.gain.setTargetAtTime(0,t,0.008); v.src.stop(t+0.04); }catch(e){} }); act.length=0; }
  if(activeEnv[idx]) delete activeEnv[idx];
}

/* ---------------- CAPTURE TAPS (AudioWorklet, with a safe fallback) ----------
   Every recorder in the app — REC OUT, TRAX lanes, the BLACK BOX — needs the
   same thing: read the audio flowing through a node into JS. That used to be a
   ScriptProcessorNode, which is deprecated and runs on the MAIN thread, so a
   busy UI could glitch a take. These now run in an AudioWorklet (audio thread)
   and batch samples before posting, so capture survives heavy drawing.
   The module is built from a Blob so the app stays a single offline file.
   Older engines without AudioWorklet transparently keep the old path. */
const CAPTURE_WORKLET_SRC = `
class JBHCapture extends AudioWorkletProcessor {
  constructor(opt){
    super();
    const o=(opt&&opt.processorOptions)||{};
    this.size=o.size||2048;
    this.l=new Float32Array(this.size); this.r=new Float32Array(this.size); this.n=0; this.on=true;
    this.port.onmessage=e=>{ if(e.data&&e.data.cmd==='stop'){ this.flush(); this.on=false; } };
  }
  flush(){
    if(!this.n) return;
    const l=this.l.slice(0,this.n), r=this.r.slice(0,this.n);
    this.port.postMessage({l:l,r:r,t:currentTime,n:this.n},[l.buffer,r.buffer]);
    this.n=0;
  }
  process(inputs){
    if(!this.on) return true;
    const inp=inputs[0];
    if(inp && inp.length && inp[0] && inp[0].length){
      const L=inp[0], R=inp.length>1&&inp[1]?inp[1]:inp[0];
      for(let i=0;i<L.length;i++){
        this.l[this.n]=L[i]; this.r[this.n]=R[i]; this.n++;
        if(this.n>=this.size) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('jbh-capture', JBHCapture);
`;
let captureWorkletURL=null;
function captureWorkletReady(ctx){ return !!(ctx && ctx._jbhCapReady); }
async function loadCaptureWorklet(ctx){
  if(!ctx || ctx._jbhCapReady || !ctx.audioWorklet) return false;
  try{
    if(!captureWorkletURL) captureWorkletURL=URL.createObjectURL(new Blob([CAPTURE_WORKLET_SRC],{type:'text/javascript'}));
    await ctx.audioWorklet.addModule(captureWorkletURL);
    ctx._jbhCapReady=true;
    return true;
  }catch(e){ return false; }
}
/* makeCaptureTap(ctx, onChunk) -> {node, stop()}   onChunk(L,R,frames,time)
   L/R are Float32Arrays owned by the caller. `node` is connected like any
   other AudioNode; it also needs a silent route to destination so the graph
   pulls it (true for both the worklet and the fallback). */
function makeCaptureTap(ctx,onChunk,size){
  const sink=ctx.createGain(); sink.gain.value=0;
  if(captureWorkletReady(ctx)){
    const node=new AudioWorkletNode(ctx,'jbh-capture',{numberOfInputs:1,numberOfOutputs:1,
      outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',
      processorOptions:{size:size||2048}});
    node.port.onmessage=e=>{ const d=e.data; if(d&&d.l) onChunk(d.l,d.r,d.n,d.t); };
    node.connect(sink); sink.connect(ctx.destination);
    return { node, worklet:true,
      stop(){ try{ node.port.postMessage({cmd:'stop'}); }catch(e){}
              try{ node.disconnect(); }catch(e){} try{ sink.disconnect(); }catch(e){} } };
  }
  const node=ctx.createScriptProcessor(4096,2,2);   // legacy engines only
  node.onaudioprocess=e=>{
    const b=e.inputBuffer;
    onChunk(b.getChannelData(0), b.getChannelData(b.numberOfChannels>1?1:0), b.length,
      (e.playbackTime!=null?e.playbackTime:ctx.currentTime));
  };
  node.connect(sink); sink.connect(ctx.destination);
  return { node, worklet:false,
    stop(){ try{ node.onaudioprocess=null; node.disconnect(); }catch(e){} try{ sink.disconnect(); }catch(e){} } };
}

/* BLACK BOX — always-on rolling capture of the last 30s of the master.
   Whatever you just heard is always recoverable: KEEP writes it to a pad. */
const BB_SECONDS=30;
let bbTap=null, bbCap=null, bbL=null, bbR=null, bbPos=0, bbFilled=0;
function bbStart(){
  if(!AC||!LIVE||bbTap) return;
  try{
    const n=Math.ceil(AC.sampleRate*BB_SECONDS);
    if(!bbL||bbL.length!==n){ bbL=new Float32Array(n); bbR=new Float32Array(n); bbPos=0; bbFilled=0; }
    const cap=makeCaptureTap(AC,(inL,inR,frames)=>{
      let p=bbPos;
      for(let i=0;i<frames;i++){ bbL[p]=inL[i]; bbR[p]=inR[i]; p++; if(p>=bbL.length)p=0; }
      bbPos=p; bbFilled=Math.min(bbL.length,bbFilled+frames);
    });
    bbTap=cap.node; bbCap=cap;
    LIVE.softclip.connect(bbTap);
    LIVE.bbTap=bbTap; LIVE.bbSink=cap;
  }catch(e){ bbTap=null; }
}
function bbKeep(){
  ensureAudio();
  if(!bbTap||!bbFilled){ lcd('BLACK BOX: nothing captured yet — play something first.'); return; }
  const n=bbFilled, buf=AC.createBuffer(2,n,AC.sampleRate);
  const L=buf.getChannelData(0), R=buf.getChannelData(1);
  let src=(bbPos-bbFilled+bbL.length)%bbL.length;
  for(let i=0;i<n;i++){ L[i]=bbL[src]; R[i]=bbR[src]; src++; if(src>=bbL.length)src=0; }
  S.editPad=pickTargetPad();
  loadIntoTarget(buf,'blackbox');
  lcd('BLACK BOX \u2192 '+padName(S.editPad)+' \u00b7 last '+(n/AC.sampleRate).toFixed(0)+'s saved — trim/chop it in SMPL.');
}
function ensureAudio(){
  /* load the capture worklet early so REC OUT / TRAX / BLACK BOX get the
     audio-thread path rather than falling back on first use. The BLACK BOX
     arms itself as soon as audio exists — before the module can finish
     loading — so upgrade it once the worklet is ready (its history is kept,
     bbStart reuses the ring buffer when the length matches). */
  setTimeout(async ()=>{
    try{
      if(!AC) return;
      const ok=await loadCaptureWorklet(AC);
      if(ok && bbCap && !bbCap.worklet && LIVE){
        try{ LIVE.softclip.disconnect(bbTap); }catch(e){}
        try{ bbCap.stop(); }catch(e){}
        bbTap=null; bbCap=null; bbStart();
      }
    }catch(e){}
  },0);
  if(AC) { resumeSession(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  AC = new Ctor();
  LIVE = buildGraph(AC);      // graph fully built before anything reads it (ordering fix)
  scApplyRoutingG(LIVE,AC);   // apply sidechain routing to the fresh graph
  // --- iOS output routing (SAMSARA pattern) ---
  // comp -> MediaStreamDestination -> hidden <audio>. Playback category
  // ignores the ring/silent switch; direct ctx.destination does not.
  try{
    LIVE.softclip.disconnect();
    LIVE.msd=AC.createMediaStreamDestination();
    LIVE.softclip.connect(LIVE.msd);
    const ael=document.createElement('audio');
    ael.setAttribute('playsinline',''); ael.style.display='none';
    ael.srcObject=LIVE.msd.stream;
    document.body.appendChild(ael);
    LIVE.ael=ael;
    const pr=ael.play();
    if(pr && pr.catch) pr.catch(()=>{ // element playback refused — add direct out, keep msd for recording
      LIVE.softclip.connect(AC.destination);
      lcd('OUT: direct (element path refused)');
    });
  }catch(e){
    try{ LIVE.softclip.connect(AC.destination); }catch(e2){}
  }
  // performance warble LFO — connects into each live voice's playbackRate
  try{
    LIVE.warbOsc=AC.createOscillator(); LIVE.warbOsc.frequency.value=5;
    LIVE.warbGain=AC.createGain(); LIVE.warbGain.gain.value=0;
    LIVE.warbOsc.connect(LIVE.warbGain); LIVE.warbOsc.start();
  }catch(e){}
  // silent unlock buffer inside the gesture
  try{
    const b=AC.createBuffer(1,1,AC.sampleRate);
    const s=AC.createBufferSource(); s.buffer=b; s.connect(AC.destination); s.start(0);
  }catch(e){}
  if(AC.state!=='running') AC.resume();
  startMeter();
  bbStart();
  lcd('AUDIO ONLINE · '+Math.round(AC.sampleRate)+' Hz · state:'+AC.state);
}

/* ---------------- canvases at the screen's real resolution -------------------
   Every canvas here is drawn in the fixed logical coordinate space it was
   authored with — the width/height attributes on the tag — and CSS then
   stretches that to whatever the layout gives it. On a phone that meant a
   760-wide circle painted into ~1200 device pixels: the browser upscaled it and
   everything looked soft next to the crisp HTML around it.

   fitCanvas keeps the logical space exactly as it was, so no drawing code has
   to change, and only makes the backing store match the real pixels underneath,
   scaling the context by the same amount. Per-axis, so a canvas whose CSS box
   has a slightly different aspect ratio than its logical one keeps the geometry
   it has today rather than shifting.

   Capped at 2x on purpose: a 3x phone would cost 2.25x the fill rate of 2x for
   a difference you cannot see on a spectrum bar or a waveform edge, and these
   redraw every frame. */
const canvasBase=new WeakMap();
function fitCanvas(cv){
  let base=canvasBase.get(cv);
  if(!base){ base={w:cv.width||1, h:cv.height||1}; canvasBase.set(cv,base); }
  const r=cv.getBoundingClientRect();
  const dpr=Math.min(2, window.devicePixelRatio||1);
  if(r.width>0 && r.height>0){
    const w=Math.max(1,Math.round(r.width*dpr)), h=Math.max(1,Math.round(r.height*dpr));
    if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; }   // resizing also clears it
  }
  const cx=cv.getContext('2d');
  cx.setTransform(cv.width/base.w, 0, 0, cv.height/base.h, 0, 0);
  return {cx, W:base.w, H:base.h};
}

/* ---------------- master level meter (feels-solid feedback) ---------------- */
let meterRAF=0, mClipHold=0, _mbufL=null, _mbufR=null;
function paintBar(el,rms,pk){
  el.style.width=Math.min(100,Math.pow(rms,0.6)*128).toFixed(0)+'%';
  el.style.background = pk>=0.9?'var(--red)':pk>=0.7?'var(--lcd)':'var(--green)';
}
function readAn(an,buf){
  an.getFloatTimeDomainData(buf);
  let pk=0,sum=0; for(let i=0;i<buf.length;i++){ const a=Math.abs(buf[i]); if(a>pk)pk=a; sum+=buf[i]*buf[i]; }
  return {rms:Math.sqrt(sum/buf.length),pk};
}
function meterLoop(){
  meterRAF=requestAnimationFrame(meterLoop);
  if(!LIVE||!LIVE.meterL||document.hidden) return;
  if(!_mbufL||_mbufL.length!==LIVE.meterL.fftSize){ _mbufL=new Float32Array(LIVE.meterL.fftSize); _mbufR=new Float32Array(LIVE.meterR.fftSize); }
  const l=readAn(LIVE.meterL,_mbufL), r=readAn(LIVE.meterR,_mbufR);
  paintBar($('mL'),l.rms,l.pk); paintBar($('mR'),r.rms,r.pk);
  const pk=Math.max(l.pk,r.pk), now=performance.now();
  if(pk>0.02) lastLoudT=now;
  if(pk>=0.895) mClipHold=now;
  $('mClip').classList.toggle('on', now-mClipHold<800);
  // per-channel mixer meters — only when the MIX tab is visible
  if(mixMeters.length && $('v-mix') && $('v-mix').classList.contains('on')){
    for(const m of mixMeters){
      let rms, ppk;
      if(m.idx<0){ rms=Math.max(l.rms,r.rms); ppk=pk; }
      else{ const n=LIVE.pads[m.idx]; if(!n||!n.meterAn){ continue; }
        if(!m.buf||m.buf.length!==n.meterAn.fftSize) m.buf=new Float32Array(n.meterAn.fftSize);
        const rr=readAn(n.meterAn,m.buf); rms=rr.rms; ppk=rr.pk; }
      m.fill.style.height=Math.min(100,Math.pow(rms,0.6)*128).toFixed(0)+'%';
      m.fill.style.background = ppk>=0.9?'var(--red)':ppk>=0.7?'var(--lcd)':'var(--green)';
    }
  }
}
function startMeter(){ if(!meterRAF) meterRAF=requestAnimationFrame(meterLoop); }

/* surface runtime errors on-device — no console on iPhone */
const errLog=[];
function logErr(m){ errLog.push(new Date().toTimeString().slice(0,8)+' '+m); if(errLog.length>8) errLog.shift(); }
const gainLog=[];   // who wrote a pad's channel gain, when, to what — the ch:0 forensics
function logGain(idx,v,src){ gainLog.push(new Date().toTimeString().slice(0,8)+' '+padName(idx)+'='+(+v).toFixed(2)+' by '+src); if(gainLog.length>10) gainLog.shift(); }
window.onerror=function(msg,src,line){ logErr(msg+' @'+line); lcd('ERR: '+msg+' @'+line); try{plog('ERR: '+msg+' line '+line);}catch(e){} };
window.onunhandledrejection=function(ev){ const m=ev&&ev.reason&&ev.reason.message?ev.reason.message:'promise rejection'; logErr(m); lcd('ERR: '+m); };

/* test tone through the FULL master chain — tap the JBH-88 logo.
   Beep audible + pads silent = sample/decode issue.
   Beep silent = output/session issue. */
document.getElementById('logo').addEventListener('click',()=>{
  ensureAudio();
  const o=AC.createOscillator(), g=AC.createGain();
  o.frequency.value=440; g.gain.value=0.0;
  g.gain.setValueAtTime(0,AC.currentTime);
  g.gain.linearRampToValueAtTime(0.4,AC.currentTime+0.01);
  g.gain.linearRampToValueAtTime(0,AC.currentTime+0.35);
  o.connect(g); g.connect(LIVE.master);
  o.start(); o.stop(AC.currentTime+0.4);
  lcd('TEST TONE · state:'+AC.state);
});

function writeLiveStep(idx, vel, when){ // quantize a live hit onto the grid (LIVE REC)
  if(!(S.liveRec && playing)) return;
  if(morphActive()) return;              // a morph is a performance, not a take
  const sd=stepDur(), pat=S.patterns[S.pattern], L=trackLen(pat,idx);
  const pos=(posMod(curAbsStep,L) + ((when!=null?when:AC.currentTime)-lastStepTime)/sd) % L;
  const st=posMod(Math.round(pos),L);
  pat.steps[idx][st]=vel;
  if(idx===S.seqPad) drawSteps();
  dirty();
}
/* A deliberately tapped pad wins: manualPad is set when you tap a pad and
   consumed by the next send, so your pick overwrites even a FULL pad. Without
   a fresh tap (e.g. right after loading), the auto plan still fills an empty
   pad so quick sampling never clobbers a used pad by accident. */
let manualPad=false;
function pickTargetPad(){
  const chosen=manualPad; manualPad=false;                 // honor a deliberate tap once, then back to auto
  if(S.pads[S.editPad].bufId<0) return S.editPad;          // selected pad is empty — land here
  if(chosen) return S.editPad;                             // you tapped this (full) pad on purpose — overwrite it
  for(let s2=0;s2<16;s2++){ const i=S.bank*16+s2; if(S.pads[i].bufId<0) return i; }   // else first empty (this bank)
  for(let i=0;i<NPADS;i++) if(S.pads[i].bufId<0) return i;                            // …then any empty
  return S.editPad;                                        // no empty pad left — fall back to the selection
}
function hitLive(idx, vel, pitchOff){
  ensureAudio();
  if(silGateDown && LIVE){ silRestore(LIVE, AC.currentTime); silGateDown=false; }
  const a=triggerPad(AC, LIVE, idx, vel, AC.currentTime, chokeLive, pitchOff||0, true);
  if(a) activeEnv[idx]=a;
  flashPad(idx,vel);
  if(S.notesOut && midiOutDev && S.pads[idx].bufId>=0)
    moNote((S.pads[idx].note>=0?S.pads[idx].note:36+idx)+(pitchOff||0), vel, null, 0.12);
  writeLiveStep(idx,vel,null);
}

/* ---------------- pads UI ---------------- */
const padEls=[];
function buildPads(){
  const gr=$('padgrid'); gr.innerHTML='';
  padEls.length=0;   // rebuilds must not leave drawPads/flashPad writing to detached elements
  for(let i=0;i<16;i++){
    const el=document.createElement('div'); el.className='pad';
    el.setAttribute('role','button'); el.tabIndex=0;
    el.innerHTML='<div class="pn"></div><div class="led"></div><div class="pname"></div>';
    el.addEventListener('keydown',e=>{
      if(e.key!==' ' && e.key!=='Enter' && e.key!=='Spacebar') return;
      e.preventDefault(); padPress(i,0.85);          // no Y position to read from
    });
    el.addEventListener('keyup',e=>{
      if(e.key!==' ' && e.key!=='Enter' && e.key!=='Spacebar') return;
      e.preventDefault();
      if(!S.edit) padRelease(padIndex(i));   // padRelease takes a PAD index, not a slot
    });
    el.addEventListener('touchstart',e=>{
      e.preventDefault();
      const t=e.changedTouches[0], r=el.getBoundingClientRect();
      const vel=clamp(1-((t.clientY-r.top)/r.height)*0.7,0.3,1);
      padPress(i,vel);
    },{passive:false});
    el.addEventListener('touchmove',e=>{   // GRAIN: slide to steer the cloud
      const idx=padIndex(i); if(!grainHold[idx]) return;
      e.preventDefault();
      const t=e.changedTouches[0], r=el.getBoundingClientRect(), p=S.pads[idx];
      p.grPos=clamp((t.clientX-r.left)/r.width,0,1);
      p.grDens=clamp(1+(1-(t.clientY-r.top)/r.height)*49,1,50);
      if(idx===S.editPad && $('grainPanel').style.display!=='none'){
        $('grPos').value=p.grPos; $('grPosV').textContent=Math.round(p.grPos*100)+'%';
        $('grDens').value=p.grDens; $('grDensV').textContent=Math.round(p.grDens)+'/s';
      }
    },{passive:false});
    el.addEventListener('touchend',e=>{ e.preventDefault(); if(!S.edit) padRelease(padIndex(i)); },{passive:false});
    el.addEventListener('mousedown',e=>{
      const r=el.getBoundingClientRect();
      const vel=clamp(1-((e.clientY-r.top)/r.height)*0.7,0.3,1);
      padPress(i,vel);
    });
    el.addEventListener('mouseup',()=>{ if(!S.edit) padRelease(padIndex(i)); });
    gr.appendChild(el); padEls.push(el);
  }
  drawPads();
}
function padIndex(slot){ return S.bank*16+slot; }
function padName(i){ return 'ABCD'[Math.floor(i/16)] + String(i%16+1).padStart(2,'0'); }
/* ---- NOTE REPEAT: BPM-synced roll while a pad is held ---- */
let repOn=false; const repHold={};   // idx -> {timer, nextT, vel}
$('btnRepeat').addEventListener('click',()=>{ repOn=!repOn; $('btnRepeat').classList.toggle('on',repOn);
  lcd(repOn?'NOTE REPEAT · hold a pad for a '+$('repRate').selectedOptions[0].textContent+' roll':'NOTE REPEAT OFF'); });
function repStart(idx,vel){
  if(repHold[idx]) return;
  ensureAudio();
  const h={nextT:AC.currentTime, vel};
  h.timer=setInterval(()=>{               // mini lookahead scheduler — sample-accurate rolls
    const iv=60/bpmAbs()/parseInt($('repRate').value,10);
    while(h.nextT<AC.currentTime+0.1){
      triggerPad(AC,LIVE,idx,h.vel,h.nextT,chokeLive,0,true);
      writeLiveStep(idx,h.vel,h.nextT);
      const dt=Math.max(0,(h.nextT-AC.currentTime)*1000);
      setTimeout(()=>flashPad(idx,h.vel),dt);
      h.nextT+=iv;
    }
  },25);
  repHold[idx]=h;
}
function repStop(idx){ const h=repHold[idx]; if(h){ clearInterval(h.timer); delete repHold[idx]; } }
function repStopAll(){ Object.keys(repHold).forEach(k=>repStop(k)); }
function padPress(slot,vel){
  const idx=padIndex(slot);
  // The tapped pad is THE current pad everywhere: EDIT target, blue SEL, AND the
  // sequencer row. Before, seqPad only followed in EDIT mode, so selecting a pad
  // then "removing it from the sequence" edited a DIFFERENT row — the pad kept
  // playing. Sync them so the step grid always shows the pad you selected.
  const seqChanged = S.seqPad!==idx;
  S.editPad=idx; S.seqPad=idx; manualPad=true;
  if(seqChanged) seqSelStep=-1;
  if(S.edit){ hitLive(idx,vel); drawPads(); drawEdit(); if(seqChanged) drawSeq(); return; }
  if(repOn && S.pads[idx].bufId>=0){ repStart(idx,vel); drawEditTitleOnly(); if(seqChanged) drawSeq(); return; }
  if(S.pads[idx].mode==='grain' && S.pads[idx].bufId>=0){ grainStart(idx,vel); drawEditTitleOnly(); if(seqChanged) drawSeq(); return; }
  hitLive(idx,vel); drawEditTitleOnly(); if(seqChanged) drawSeq();
}
function drawPads(){
  const pat=curPat();
  for(let s=0;s<16;s++){
    const idx=padIndex(s), p=S.pads[idx], el=padEls[s];
    el.classList.toggle('loaded',p.bufId>=0);
    el.classList.toggle('inseq',p.bufId>=0 && pat.steps[idx].some(v=>v>0));   // amber LED: this pad plays in the current pattern
    el.classList.toggle('sel',idx===S.editPad);   // the TARGET pad is always visible, even when empty
    el.classList.toggle('fx',hasFx(p));
    el.querySelector('.pn').textContent=padName(idx);
    el.querySelector('.pname').textContent=p.name||'';
    el.setAttribute('aria-label', 'Pad '+padName(idx)
      + (p.name?', '+p.name:', empty')
      + (idx===S.editPad?', selected':'')
      + (p.bufId>=0 && pat.steps[idx].some(v=>v>0) ? ', plays in this pattern':''));
  }
}
function flashPad(idx,vel){
  if(Math.floor(idx/16)!==S.bank) return;
  const el=padEls[idx%16]; el.classList.add('hit');
  const v=vel==null?0.9:clamp(vel,0.1,1);
  el.style.boxShadow='0 0 '+(3+v*15).toFixed(0)+'px rgba(255,140,46,'+(0.35+v*0.55).toFixed(2)+')';
  clearTimeout(el._hitT);
  el._hitT=setTimeout(()=>{ el.classList.remove('hit'); el.style.boxShadow=''; },100);
}

/* edit panel */
function drawEditTitleOnly(){ $('epTitle').textContent=padName(S.editPad)+(S.pads[S.editPad].name?' · '+S.pads[S.editPad].name:''); }
function drawEdit(){
  const p=S.pads[S.editPad];
  drawEditTitleOnly();
  // percent, to match the mixer and the master — a level is a level wherever
  // you touch it, and 0-200% is easier to reason about than 0.00-2.00
  $('epGain').value=p.gain; $('epGainV').textContent=Math.round(p.gain*100)+'%';
  $('epPitch').value=p.pitch; $('epPitchV').textContent=(p.pitch>0?'+':'')+p.pitch+' st';
  $('epFine').value=p.fine; $('epFineV').textContent=(p.fine>0?'+':'')+p.fine+' ct';
  { const sp=padSpeed(p); $('epSpeed').value=sp; $('epSpeedV').textContent=sp.toFixed(2)+'×';
    $('epKeepPitch').classList.toggle('on',!!p.keepPitch);
    $('epKeepPitch').textContent=p.keepPitch?'KEEP PITCH':'VARISPEED';
    // keep-pitch pad showing a sample with no cached stretch yet (e.g. a freshly
    // loaded sample) — build it now so the next hit is pitch-locked, not varispeed
    if(p.keepPitch && p.bufId>=0 && Math.abs(sp-1)>0.001 && !speedCache[speedKey(p.bufId,!!p.reverse,sp)])
      buildSpeedStretch(p.bufId,!!p.reverse,sp); }
  $('epPan').value=p.pan; $('epPanV').textContent=panText(p.pan);
  $('epRev').value=p.rev; $('epRevV').textContent=sendText(p.rev);
  $('epDly').value=p.dly; $('epDlyV').textContent=sendText(p.dly);
  $('epAtt').value=p.att; $('epAttV').textContent=Math.round(p.att*1000)+'ms';
  $('epRel').value=p.rel; $('epRelV').textContent=Math.round(p.rel*1000)+'ms';
  $('epChoke').value=String(p.choke);
  $('epRevrs').classList.toggle('on',p.reverse);
  $('epMode').textContent=p.mode==='grain'?'GRAIN':(p.mode==='gate'?'GATE':'1-SHOT');
  $('epMode').classList.toggle('on',p.mode!=='one');
  $('grainPanel').style.display=p.mode==='grain'?'block':'none';
  if(p.mode==='grain'){
    $('grSize').value=p.grSize; $('grSizeV').textContent=Math.round(p.grSize*1000)+'ms';
    $('grDens').value=p.grDens; $('grDensV').textContent=Math.round(p.grDens)+'/s';
    $('grSpread').value=p.grSpread; $('grSpreadV').textContent=Math.round(p.grSpread*100)+'%';
    $('grPitch').value=p.grPitch; $('grPitchV').textContent='\u00b1'+p.grPitch+' st';
    $('grPos').value=p.grPos; $('grPosV').textContent=Math.round(p.grPos*100)+'%';
    $('grBurst').value=p.grBurst; $('grBurstV').textContent=p.grBurst.toFixed(2)+'s';
  }
  $('epNote').textContent=p.note<0?'—':p.note;
  $('epFType').value=p.ftype;
  $('epFCut').value=p.fcut; $('epFCutV').textContent=Math.round(cutHz(p.fcut))+'Hz';
  $('epFRes').value=p.fres; $('epFResV').textContent='Q '+p.fres.toFixed(1);
  $('epDrv').value=p.drv; $('epDrvV').textContent=Math.round(p.drv*100)+'%';
  $('epCrush').value=p.crush; $('epCrushV').textContent=p.crush>=16?'OFF':p.crush+' bit';
  $('epEqLo').value=p.eqLo||0; $('epEqLoV').textContent=eqFmt(p.eqLo||0);
  $('epEqMid').value=p.eqMid||0; $('epEqMidV').textContent=eqFmt(p.eqMid||0);
  $('epEqHi').value=p.eqHi||0; $('epEqHiV').textContent=eqFmt(p.eqHi||0);
  $('epLfoOn').textContent=p.lfoOn?'LFO ON':'LFO OFF'; $('epLfoOn').classList.toggle('on',!!p.lfoOn);
  $('epLfoTgt').value=p.lfoTgt||'cutoff'; $('epLfoShape').value=p.lfoShape||'sine'; $('epLfoSync').value=p.lfoSync||'free';
  $('epLfoRate').value=p.lfoRate||2; $('epLfoRateV').textContent=(p.lfoSync&&p.lfoSync!=='free')?p.lfoSync:(p.lfoRate||2).toFixed(2)+'Hz';
  $('epLfoRate').disabled=(p.lfoSync&&p.lfoSync!=='free');
  $('epLfoDepth').value=p.lfoDepth||0; $('epLfoDepthV').textContent=Math.round((p.lfoDepth||0)*100)+'%';
  $('epWarpBeats').value=String(p.warpBeats||4);
  $('epWarpInfo').textContent = p.bufId>=0 ? (S.buffers[p.bufId].duration.toFixed(2)+'s'+(p.warped?(' · WARPED to '+p.warpBeats+' beats @ '+S.bpm.toFixed(1)):'')) : 'load a sample first';
  $('smTarget').textContent=padName(S.editPad);
  $('seqPadName').textContent=padName(S.seqPad);
  $('mxPad').textContent=padName(S.editPad);
  $('mxPadRev').value=p.rev; $('mxPadRevV').textContent=sendText(p.rev);
  $('mxPadDly').value=p.dly; $('mxPadDlyV').textContent=sendText(p.dly);
}
function bindEdit(id, key, fmt, applyLive){
  $(id).addEventListener('input',e=>{
    const p=S.pads[S.editPad]; p[key]=parseFloat(e.target.value);
    drawEdit(); dirty();
    if(LIVE && applyLive) applyLive(LIVE.pads[S.editPad], p);
  });
}
bindEdit('epGain','gain',null,(n,p)=>{ logGain(S.editPad,p.gain,'EDIT fader'); n.ch.gain.setTargetAtTime(p.gain,AC.currentTime,0.01); });
bindEdit('epPitch','pitch',null,null);
bindEdit('epFine','fine',null,null);
/* SPEED — varispeed is instant (next hit); keepPitch rebuilds the stretch when
   the knob settles so triggers never hitch mid-move. */
let speedBuildT=0;
$('epSpeed').addEventListener('input',e=>{
  const p=S.pads[S.editPad]; p.speed=clamp(parseFloat(e.target.value)||1,0.25,4);
  $('epSpeedV').textContent=p.speed.toFixed(2)+'×'; dirty();
  if(p.keepPitch && p.bufId>=0){ clearTimeout(speedBuildT);
    speedBuildT=setTimeout(()=>{ buildSpeedStretch(p.bufId,!!p.reverse,padSpeed(p)); drawEdit(); },220); }
});
$('epKeepPitch').addEventListener('click',()=>{
  const p=S.pads[S.editPad]; p.keepPitch=!p.keepPitch;
  if(p.keepPitch && p.bufId>=0) buildSpeedStretch(p.bufId,!!p.reverse,padSpeed(p));
  drawEdit(); dirty();
  lcd(p.keepPitch?('KEEP PITCH — pad plays '+padSpeed(p).toFixed(2)+'× with pitch preserved'):('VARISPEED — pad speed also shifts pitch (tape/turntable)'));
});
bindEdit('epPan','pan',null,(n,p)=>{ if(n.pan) n.pan.pan.setTargetAtTime(p.pan,AC.currentTime,0.01); });
bindEdit('epRev','rev',null,(n,p)=>{ n.rev.gain.setTargetAtTime(p.rev,AC.currentTime,0.01); });
bindEdit('epDly','dly',null,(n,p)=>{ n.dly.gain.setTargetAtTime(p.dly,AC.currentTime,0.01); });
bindEdit('epAtt','att',null,null);
bindEdit('epRel','rel',null,null);
/* grain cloud params — live while the pad is held */
[['grPos','grPos',v=>Math.round(v*100)+'%'],['grSize','grSize',v=>Math.round(v*1000)+'ms'],
 ['grDens','grDens',v=>Math.round(v)+'/s'],['grSpread','grSpread',v=>Math.round(v*100)+'%'],
 ['grPitch','grPitch',v=>'\u00b1'+Math.round(v)+' st'],['grBurst','grBurst',v=>(+v).toFixed(2)+'s']
].forEach(([id,key,fmt])=>{
  $(id).addEventListener('input',e=>{ const p=S.pads[S.editPad]; p[key]=parseFloat(e.target.value); $(id+'V').textContent=fmt(p[key]); dirty(); });
});
$('epChoke').addEventListener('change',e=>{ S.pads[S.editPad].choke=parseInt(e.target.value,10); dirty(); });
$('epRevrs').addEventListener('click',()=>{ const p=S.pads[S.editPad]; p.reverse=!p.reverse; if(p.bufId>=0) getReversed(p.bufId);
  if(p.keepPitch && p.bufId>=0) buildSpeedStretch(p.bufId,!!p.reverse,padSpeed(p));   // stretch depends on direction
  drawEdit(); dirty(); });
$('epMode').addEventListener('click',()=>{ const p=S.pads[S.editPad];
  p.mode = p.mode==='one' ? 'gate' : (p.mode==='gate' ? 'grain' : 'one');
  if(p.mode!=='grain') grainCut(S.editPad);
  drawEdit(); dirty();
  lcd(p.mode==='grain'?'GRAIN — hold the pad for a cloud; slide for POSITION (left/right) and DENSITY (up/down).':(p.mode==='gate'?'GATE — the sound lasts as long as you hold.':'1-SHOT — the sample plays through.')); });
function liveFx(){ const p=S.pads[S.editPad]; if(LIVE) applyPadFx(LIVE.pads[S.editPad],p,AC); drawPads(); drawEdit(); dirty(); }
function hasFx(p){ return p.ftype!=='off' || p.drv>0 || p.crush<16 || !!(p.eqLo||p.eqMid||p.eqHi); }
$('epFType').addEventListener('change',e=>{
  const p=S.pads[S.editPad]; p.ftype=e.target.value;
  // jump cutoff somewhere audible when enabling — 16kHz LP sounds like nothing
  if(p.ftype==='lowpass' && p.fcut>0.85) p.fcut=0.45;
  if(p.ftype==='highpass' && p.fcut<0.15) p.fcut=0.45;
  if(p.ftype==='bandpass') p.fcut=clamp(p.fcut,0.25,0.75);
  liveFx(); trigSel();
});
function trigSel(){ if(S.pads[S.editPad].bufId>=0) hitLive(S.editPad,0.85); }
$('epFCut').addEventListener('input',e=>{ S.pads[S.editPad].fcut=parseFloat(e.target.value); liveFx(); });
$('epFCut').addEventListener('change',trigSel);
$('epFRes').addEventListener('input',e=>{ S.pads[S.editPad].fres=parseFloat(e.target.value); liveFx(); });
$('epFRes').addEventListener('change',trigSel);
$('epDrv').addEventListener('input',e=>{ S.pads[S.editPad].drv=parseFloat(e.target.value); liveFx(); });
$('epDrv').addEventListener('change',trigSel);
$('epCrush').addEventListener('input',e=>{ S.pads[S.editPad].crush=parseInt(e.target.value,10); liveFx(); });
$('epCrush').addEventListener('change',trigSel);
const eqFmt=v=>(v>0?'+':'')+(+v).toFixed(1)+'dB';
['Lo','Mid','Hi'].forEach(b=>{
  $('epEq'+b).addEventListener('input',e=>{ S.pads[S.editPad]['eq'+b]=parseFloat(e.target.value); liveFx(); });
  $('epEq'+b).addEventListener('change',trigSel);
});

/* ---- per-pad LFO ---- */
function liveLfo(){ const p=S.pads[S.editPad]; if(LIVE) applyPadLfo(LIVE.pads[S.editPad],p,AC); drawEdit(); dirty(); }
$('epLfoOn').addEventListener('click',()=>{ const p=S.pads[S.editPad]; p.lfoOn=!p.lfoOn; liveLfo(); lcd(p.lfoOn?'LFO ON · '+(p.lfoTgt).toUpperCase():'LFO OFF'); });
$('epLfoTgt').addEventListener('change',e=>{ S.pads[S.editPad].lfoTgt=e.target.value; liveLfo(); });
$('epLfoShape').addEventListener('change',e=>{ S.pads[S.editPad].lfoShape=e.target.value; liveLfo(); });
$('epLfoSync').addEventListener('change',e=>{ S.pads[S.editPad].lfoSync=e.target.value; liveLfo(); });
$('epLfoRate').addEventListener('input',e=>{ S.pads[S.editPad].lfoRate=parseFloat(e.target.value); liveLfo(); });
$('epLfoDepth').addEventListener('input',e=>{ S.pads[S.editPad].lfoDepth=parseFloat(e.target.value); liveLfo(); });

/* ---- WARP: pitch-preserving granular time-stretch to fit N beats @ tempo ---- */
function timeStretch(buf, ratio){   // ratio = outDur/inDur (>1 slower/longer, pitch preserved)
  const sr=buf.sampleRate, nCh=buf.numberOfChannels;
  const inLen=buf.length, outLen=Math.max(1,Math.round(inLen*ratio));
  const grain=Math.max(256,Math.round(sr*0.08));      // ~80ms grains
  const hopOut=Math.floor(grain/2), hopIn=Math.max(1,Math.round(hopOut/ratio));
  const win=new Float32Array(grain);
  for(let i=0;i<grain;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(grain-1));   // Hann
  const out=mkAudioBuf(outLen,sr,nCh);
  for(let c=0;c<nCh;c++){
    const din=buf.getChannelData(c), dout=out.getChannelData(c);
    const norm=new Float32Array(outLen);
    let inPos=0, outPos=0;
    while(outPos<outLen){
      const i0=Math.floor(inPos);
      for(let k=0;k<grain;k++){
        const si=i0+k; if(si>=inLen) break;
        const oi=outPos+k; if(oi>=outLen) break;
        dout[oi]+=din[si]*win[k]; norm[oi]+=win[k];
      }
      inPos+=hopIn; outPos+=hopOut;
    }
    for(let i=0;i<outLen;i++) if(norm[i]>1e-4) dout[i]/=norm[i];
  }
  return out;
}
const warpOrig={};   // padIdx -> pristine pre-warp AudioBuffer (session-only, avoids compounding)
$('epWarpBeats').addEventListener('change',e=>{ S.pads[S.editPad].warpBeats=parseInt(e.target.value,10); dirty(); });
$('epWarp').addEventListener('click',()=>{
  const i=S.editPad, p=S.pads[i];
  if(p.bufId<0){ lcd('WARP: load a sample onto this pad first.'); return; }
  ensureAudio();
  const src = warpOrig[i] || S.buffers[p.bufId];
  if(!warpOrig[i]) warpOrig[i]=src;
  const beats=p.warpBeats||4, targetDur=beats*(60/bpmAbs()), ratio=targetDur/src.duration;
  if(!isFinite(ratio)||ratio<=0){ lcd('WARP: bad ratio.'); return; }
  try{ stopPadVoices(i); }catch(e){}
  lcd('WARPING '+src.duration.toFixed(2)+'s → '+targetDur.toFixed(2)+'s ('+beats+' beats @ '+S.bpm.toFixed(1)+') …');
  const out=timeStretch(src,ratio);
  S.buffers.push(out); p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.pitch=0; p.fine=0; p.warped=true; p.warpBpm=S.bpm;
  workBuf=out; slices=[]; selSlice=-1;
  drawPads(); drawEdit(); drawWave(); dirty();
  hitLive(i,0.9);
  lcd('WARPED · '+targetDur.toFixed(2)+'s locks to '+beats+' beats @ '+S.bpm.toFixed(1));
});
$('epWarpAuto').addEventListener('click',()=>{ S.autoWarp=!S.autoWarp; $('epWarpAuto').classList.toggle('on',S.autoWarp);
  lcd(S.autoWarp?'AUTO-WARP ON — warped pads follow the tempo (BPM will re-stretch them)':'AUTO-WARP OFF — BPM affects only the sequencer'); dirty(); });
/* auto-warp: when the tempo settles, re-stretch every warped pad so loops
   stay locked to the grid. Stretches from the pristine pre-warp original
   when it's in memory; after a restore the current buffer is adopted as
   the new original (one-generation artifact bound, never compounding). */
let autoWarpT=0;
function autoWarpTick(){
  if(!S.autoWarp) return;
  let n=0;
  for(let i=0;i<NPADS;i++){
    const p=S.pads[i];
    if(!p.warped || p.bufId<0) continue;
    if(Math.abs(Math.abs(p.warpBpm||0)-bpmAbs())<0.5) continue;   // ignore MIDI-clock jitter (sign is direction, not speed)
    if(!warpOrig[i]) warpOrig[i]=S.buffers[p.bufId];
    const src=warpOrig[i], targetDur=(p.warpBeats||4)*(60/bpmAbs()), ratio=targetDur/src.duration;
    if(!isFinite(ratio)||ratio<=0) continue;
    try{ stopPadVoices(i); }catch(e){}
    const out=timeStretch(src,ratio);
    S.buffers.push(out); p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.warpBpm=S.bpm;
    if(i===S.editPad){ workBuf=out; slices=[]; selSlice=-1; drawWave(); drawEdit(); }
    n++;
  }
  if(n){ dirty(); lcd('AUTO-WARP · '+n+' pad'+(n>1?'s':'')+' re-locked to '+S.bpm.toFixed(1)+' BPM'); }
}
function scheduleAutoWarp(){ clearTimeout(autoWarpT); autoWarpT=setTimeout(autoWarpTick,500); }
$('epWarpReset').addEventListener('click',()=>{
  const i=S.editPad, p=S.pads[i];
  if(!warpOrig[i]){ lcd('WARP: nothing to reset.'); return; }
  try{ stopPadVoices(i); }catch(e){}
  S.buffers.push(warpOrig[i]); p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.warped=false;
  workBuf=warpOrig[i]; slices=[]; selSlice=-1;
  delete warpOrig[i];
  drawPads(); drawEdit(); drawWave(); dirty(); lcd('WARP RESET · original restored');
});

/* ---------------- MIX view ---------------- */
function bindMix(id, get, set, fmt){
  const el=$(id), vel=$(id+'V');
  const draw=()=>{ el.value=get(); if(vel) vel.textContent=fmt(get()); };
  el.addEventListener('input',e=>{ set(parseFloat(e.target.value)); if(vel) vel.textContent=fmt(get()); dirty(); });
  draw(); return draw;
}
const pct=x=>Math.round(x*100)+'%';
bindMix('mxVol',()=>S.masterVol,v=>{ S.masterVol=v; if(LIVE) LIVE.master.gain.setTargetAtTime(v,AC.currentTime,0.02); },pct);
bindMix('mxComp',()=>S.compAmt,v=>{ S.compAmt=v; if(LIVE) LIVE.comp.threshold.setTargetAtTime(compThresh(),AC.currentTime,0.05); },pct);
bindMix('mxRevLvl',()=>S.revLvl,v=>{ S.revLvl=v; if(LIVE) LIVE.revRet.gain.setTargetAtTime(v,AC.currentTime,0.02); },pct);
bindMix('mxRevSize',()=>S.revSize,v=>{ S.revSize=v; if(LIVE) LIVE.conv.buffer=makeIR(AC,S.revSize,S.revType); },v=>v.toFixed(1)+'s');
bindMix('mxDlyFb',()=>S.delayFb,v=>{ S.delayFb=v; if(LIVE){ LIVE.dlyFb.gain.setTargetAtTime(v,AC.currentTime,0.02); if(LIVE.dlyFb2) LIVE.dlyFb2.gain.setTargetAtTime(v,AC.currentTime,0.02); } },pct);
bindMix('mxDlyTone',()=>S.dlyTone,v=>{ S.dlyTone=v; if(LIVE) LIVE.dlyFilt.frequency.setTargetAtTime(v,AC.currentTime,0.03); },v=>Math.round(v/100)/10+'k');
$('mxDlyDiv').value=String(S.delayDiv);
$('mxDlyDiv').addEventListener('change',e=>{ S.delayDiv=parseFloat(e.target.value); dirty(); liveDelaySync(); });
$('mxRevType').value=S.revType;
$('mxRevType').addEventListener('change',e=>{ S.revType=e.target.value;
  if(LIVE) LIVE.conv.buffer=makeIR(AC,S.revSize,S.revType);
  dirty(); lcd('REVERB: '+e.target.selectedOptions[0].textContent); });
$('mxDlyMode').value=S.dlyMode;
$('mxDlyMode').addEventListener('change',e=>{ S.dlyMode=e.target.value;
  if(LIVE) buildDelayNet(AC,LIVE);
  dirty(); lcd('DELAY: '+e.target.selectedOptions[0].textContent); });
$('mxPadRev').addEventListener('input',e=>{ const p=S.pads[S.editPad]; p.rev=parseFloat(e.target.value); dirty();
  $('mxPadRevV').textContent=sendText(p.rev);
  if(LIVE) LIVE.pads[S.editPad].rev.gain.setTargetAtTime(p.rev,AC.currentTime,0.01); });
$('mxPadDly').addEventListener('input',e=>{ const p=S.pads[S.editPad]; p.dly=parseFloat(e.target.value); dirty();
  $('mxPadDlyV').textContent=sendText(p.dly);
  if(LIVE) LIVE.pads[S.editPad].dly.gain.setTargetAtTime(p.dly,AC.currentTime,0.01); });
$('epClear').addEventListener('click',()=>{ const i=S.editPad; stopPadVoices(i); S.pads[i]=newPad(i); delete warpOrig[i];
  // remove the pad from the sequencer entirely — clearing a sound must leave no ghost steps/locks that keep triggering
  S.patterns.forEach(pt=>{ if(pt.steps[i]) pt.steps[i].fill(0); if(pt.locks) for(let s=0;s<MAXSTEPS;s++) delete pt.locks[i+':'+s]; });
  drawPads(); drawEdit(); drawMixer(); drawSeq(); drawSteps(); dirty(); lcd('PAD '+padName(i)+' CLEARED · removed from all patterns'); });

/* ---------------- per-pad channel MIXER ---------------- */
let mixMeters=[];   // [{idx, fill}] for the meter loop (idx=-1 => master)
function padInUse(i){
  if(S.pads[i].bufId>=0) return true;
  for(let q=0;q<NPAT;q++){ const st=S.patterns[q].steps[i]; for(let s=0;s<MAXSTEPS;s++) if(st[s]>0) return true; }
  return false;
}
function mixChannels(){ const out=[]; for(let i=0;i<NPADS;i++) if(padInUse(i)) out.push(i); return out; }
function anySolo(){ for(let i=0;i<NPADS;i++) if(S.pads[i].solo) return true; return false; }
function padAudible(i){ const p=S.pads[i]; return !p.mute && (!anySolo() || p.solo); }
function applyMixMutes(){
  if(!LIVE||!LIVE.pads) return; const t=AC?AC.currentTime:0;
  for(let i=0;i<NPADS;i++){ const n=LIVE.pads[i]; if(n&&n.mute){ try{ n.mute.gain.setTargetAtTime(padAudible(i)?1:0,t,0.01); }catch(e){} } }
}
function mixEditPad(i){ S.editPad=i; S.seqPad=i; if(!S.edit){ S.edit=true; $('btnEdit').classList.add('on'); $('editpanel').style.display='block'; }
  document.querySelector('#tabs button[data-v="pads"]').click(); drawPads(); drawEdit(); }
function drawMixer(){
  const wrap=$('mixStrips'); if(!wrap) return;
  const chans=mixChannels();
  $('mixCount').textContent=chans.length?('· '+chans.length+' in use'):'';
  wrap.innerHTML=''; mixMeters=[];
  const mkStrip=(idx)=>{
    const p=idx>=0?S.pads[idx]:null;
    const el=document.createElement('div'); el.className='mstrip'+(idx<0?' master':'');
    const nm=document.createElement('div'); nm.className='mnm'; nm.textContent=idx<0?'MASTER':padName(idx);
    const sub=document.createElement('div'); sub.className='msub'; sub.textContent=idx<0?'':(p.name||'');
    if(idx>=0){ nm.title='edit '+padName(idx); nm.addEventListener('click',()=>mixEditPad(idx)); }
    el.append(nm,sub);
    const farea=document.createElement('div'); farea.className='mfarea';
    const mtr=document.createElement('div'); mtr.className='mmtr'; const fill=document.createElement('div'); mtr.appendChild(fill);
    const fader=document.createElement('input'); fader.type='range'; fader.className='vf';
    fader.min=0; fader.max=2; fader.step=0.01; fader.value= idx<0?S.masterVol:p.gain;
    const chan = idx<0 ? 'master' : (padName(idx)+(p.name?' '+p.name:''));
    fader.setAttribute('aria-label','Level, '+chan);
    el.setAttribute('role','group'); el.setAttribute('aria-label','Channel strip, '+chan);
    fader.addEventListener('input',e=>{ const v=parseFloat(e.target.value);
      if(idx<0){ S.masterVol=v; if(LIVE) LIVE.master.gain.setTargetAtTime(v,AC.currentTime,0.02); if($('mxVol')){ $('mxVol').value=v; $('mxVolV').textContent=pct(v);} }
      else{ p.gain=v; logGain(idx,v,'MIXER fader'); if(LIVE) LIVE.pads[idx].ch.gain.setTargetAtTime(v,AC.currentTime,0.01); if(idx===S.editPad) drawEdit(); }
      dirty(); });
    farea.append(mtr,fader); el.appendChild(farea);
    mixMeters.push({idx,fill});
    if(idx>=0){
      const pan=document.createElement('div'); pan.className='mpan';
      const pr=document.createElement('input'); pr.type='range'; pr.min=-1; pr.max=1; pr.step=0.05; pr.value=p.pan; pr.title='pan';
      pr.setAttribute('aria-label','Pan, '+chan);
      pr.addEventListener('input',e=>{ p.pan=parseFloat(e.target.value); if(LIVE&&LIVE.pads[idx].pan) LIVE.pads[idx].pan.pan.setTargetAtTime(p.pan,AC.currentTime,0.01); if(idx===S.editPad) drawEdit(); dirty(); });
      pan.appendChild(pr); el.appendChild(pan);
      const btns=document.createElement('div'); btns.className='mbtns';
      const mb=document.createElement('button'); mb.textContent='M';
      mb.setAttribute('aria-label','Mute '+chan); mb.classList.toggle('on',p.mute);
      mb.addEventListener('click',()=>{ p.mute=!p.mute; mb.classList.toggle('on',p.mute); applyMixMutes(); dirty(); });
      const sb=document.createElement('button'); sb.textContent='S';
      sb.setAttribute('aria-label','Solo '+chan); sb.classList.toggle('on',p.solo);
      sb.addEventListener('click',()=>{ p.solo=!p.solo; drawMixer(); applyMixMutes(); dirty(); });
      btns.append(mb,sb); el.appendChild(btns);
      const mkSend=(lbl,key)=>{ const r=document.createElement('div'); r.className='msend';
        const s=document.createElement('span'); s.textContent=lbl;
        const inp=document.createElement('input'); inp.type='range'; inp.min=0; inp.max=1; inp.step=0.01; inp.value=p[key]; inp.title=(key==='rev'?'reverb':'delay')+' send';
        inp.setAttribute('aria-label',(key==='rev'?'Reverb':'Delay')+' send, '+chan);
        inp.addEventListener('input',e=>{ p[key]=parseFloat(e.target.value); if(LIVE) LIVE.pads[idx][key].gain.setTargetAtTime(p[key],AC.currentTime,0.01); if(idx===S.editPad) drawEdit(); dirty(); });
        r.append(s,inp); return r; };
      el.appendChild(mkSend('R','rev')); el.appendChild(mkSend('D','dly'));
      const mkEq=(lbl,key)=>{ const r=document.createElement('div'); r.className='msend';
        const s=document.createElement('span'); s.textContent=lbl;
        const inp=document.createElement('input'); inp.type='range'; inp.min=-12; inp.max=12; inp.step=0.5; inp.value=p[key]||0; inp.title='EQ '+lbl+' (±12dB)';
        inp.setAttribute('aria-label','EQ '+({L:'low',M:'mid',H:'high'}[lbl]||lbl)+', '+chan);
        inp.addEventListener('input',e=>{ p[key]=parseFloat(e.target.value); if(LIVE) applyPadFx(LIVE.pads[idx],p,AC); if(idx===S.editPad) drawEdit(); dirty(); });
        r.append(s,inp); return r; };
      el.appendChild(mkEq('L','eqLo')); el.appendChild(mkEq('M','eqMid')); el.appendChild(mkEq('H','eqHi'));
    }else{
      const cl=document.createElement('div'); cl.className='mval'; cl.id='mixMasterClip'; cl.textContent='';
      el.appendChild(cl);
    }
    return el;
  };
  wrap.appendChild(mkStrip(-1));
  chans.forEach(i=>wrap.appendChild(mkStrip(i)));
}
/* ---- sidechain UI ---- */
function drawSidechain(){
  const sel=$('mxScTrig');
  if(sel.options.length!==NPADS){ sel.innerHTML=''; for(let i=0;i<NPADS;i++){ const o=document.createElement('option'); o.value=i; o.textContent=padName(i); sel.appendChild(o); } }
  sel.value=String(S.scTrig);
  $('mxScOn').classList.toggle('on',S.scOn);
  $('mxScDepth').value=S.scDepth; $('mxScDepthV').textContent=Math.round(S.scDepth*100)+'%';
  $('mxScRel').value=S.scRel; $('mxScRelV').textContent=Math.round(S.scRel*1000)+'ms';
}
$('mxScOn').addEventListener('click',()=>{ S.scOn=!S.scOn; scApplyRouting(); drawSidechain(); dirty();
  lcd(S.scOn?'SIDECHAIN ON · '+padName(S.scTrig)+' ducks the mix':'SIDECHAIN OFF'); });
$('mxScTrig').addEventListener('change',e=>{ S.scTrig=parseInt(e.target.value,10); scApplyRouting(); dirty();
  lcd('SIDECHAIN TRIGGER → '+padName(S.scTrig)); });
$('mxScDepth').addEventListener('input',e=>{ S.scDepth=parseFloat(e.target.value); $('mxScDepthV').textContent=Math.round(S.scDepth*100)+'%'; dirty(); });
$('mxScRel').addEventListener('input',e=>{ S.scRel=parseFloat(e.target.value); $('mxScRelV').textContent=Math.round(S.scRel*1000)+'ms'; dirty(); });
$('epLearn').addEventListener('click',()=>{ noteLearnPad=S.editPad; lcd('NOTE LEARN: play a MIDI note for '+padName(S.editPad)); });

$('btnEdit').addEventListener('click',()=>{ S.edit=!S.edit; $('btnEdit').classList.toggle('on',S.edit); $('editpanel').style.display=S.edit?'block':'none'; drawPads(); drawEdit(); });
document.querySelectorAll('#bankrow [data-b]').forEach(b=>b.addEventListener('click',()=>{
  repStopAll();   // a roll can't survive its pad scrolling off-screen
  S.bank=parseInt(b.dataset.b,10);
  document.querySelectorAll('#bankrow [data-b]').forEach(x=>x.classList.toggle('on',x===b));
  drawPads();
}));


/* ---------------- PATTERN MORPH — melt pattern A into pattern B ----------------
   Every cell (track + step, plus the silencer row) is given a rank in [0,1)
   by the chosen ORDER. At morph amount t the cell shows B when t > rank and A
   otherwise, so the pattern crosses over one cell at a time instead of
   switching in one jump. ORDER is what makes it musical rather than random:

     weight   metric weight, weakest first — the 16ths mutate, then the 8ths,
              then the beats, and the downbeat is the last thing to go. The
              groove keeps its backbone until the very end.
     strong   the same ranking inverted: the skeleton changes first and the
              decoration follows, which reads as a sudden lurch that settles.
     sweep    straight left-to-right through the bar — a wipe.
     scatter  a hash of (track, step): scattered but deterministic, so the same
              morph sounds identical every time and bounces the same way.
     track    one instrument at a time, in pad order.

   The endpoints are exact: t<=0 IS pattern A and t>=1 IS pattern B, returned by
   reference, so a completed morph is bit-identical to selecting B — including
   its own length and per-track polymeter, which an interpolated buffer cannot
   carry. In between, the blend keeps A's length and A's track lengths and
   reads B modulo its own, so a 16-step B tiles into a 32-step A. Automation
   lanes are not interpolated; they come from whichever side is more than half
   present. ---- */
/* morphRanker, morphPattern → src/pure/morph.js */

let morphBuf=null;
function morphActive(){ return !!(S.morph && S.morph.on); }
function curPat(){ return (morphActive() && morphBuf) ? morphBuf : S.patterns[S.pattern]; }
function morphBuild(){
  const m=S.morph;
  m.from=clamp(m.from|0,0,NPAT-1); m.to=clamp(m.to|0,0,NPAT-1);
  morphBuf = morphPattern(S.patterns[m.from], S.patterns[m.to], clamp(m.amt,0,1), m.curve, m.vel);
}
function morphStart(){
  const m=S.morph;
  if(m.from===m.to){ lcd('MORPH needs two different patterns — FROM and TO are both PTN '+(m.from+1)+'.'); return; }
  m.on=true; m.pos=0; m.amt=0;
  S.chainOn=false; S.songOn=false;               // the morph owns the arrangement while it runs
  selectPattern(m.from);
  morphBuild(); drawSeq(); dirty();
  lcd('MORPH ARMED · PTN '+(m.from+1)+' → PTN '+(m.to+1)+' over '+m.bars+' bar'+(m.bars>1?'s':''));
}
function morphStop(msg){
  S.morph.on=false; morphBuf=null;
  drawSeq(); dirty();
  if(msg) lcd(msg);
}
function morphBar(){          // one notch per bar, called from the bar-boundary hook
  const m=S.morph;
  if(!m.on || m.mode==='hold') return;
  m.pos++;
  if(m.pos>=m.bars){
    if(m.mode==='loop'){ m.pos=0; m.amt=0; morphBuild(); drawSteps(); return; }
    if(m.mode==='ping'){ const f=m.from; m.from=m.to; m.to=f; m.pos=0; m.amt=0;
      selectPattern(m.from); morphBuild(); drawSeq();
      lcd('MORPH PING-PONG · now PTN '+(m.from+1)+' → PTN '+(m.to+1)); return; }
    m.on=false; morphBuf=null; m.amt=1;
    selectPattern(m.to); drawSeq();
    lcd('MORPH COMPLETE · PTN '+(m.to+1)); return;
  }
  m.amt=m.pos/m.bars;
  morphBuild(); drawSteps();
}
function morphSetAmt(v){
  const m=S.morph;
  m.amt=clamp(v,0,1);
  m.pos=Math.round(m.amt*m.bars);
  /* Dragging this used to ENGAGE the morph, which silently took the sequencer
     over: the grid and circle started showing a blend instead of the pattern,
     and every edit was refused. A thumb brushing the slider on the way past was
     enough, and nothing announced it. The slider now only sets the amount and
     redraws the preview strip; MORPH is the only thing that starts a morph. */
  if(m.on){ morphBuild(); drawSteps(); }
  else drawMorph();
  dirty();
}
function morphGuard(){        // shared by every pattern-editing handler
  if(!morphActive()) return false;
  lcd('MORPH IS RUNNING — the grid shows the blend. Stop MORPH to edit the pattern.');
  return true;
}
function drawMorph(){
  const m=S.morph;
  ['mfFrom','mfTo','mfPrint'].forEach(id=>{
    const sel=$(id); if(!sel) return;
    if(sel.options.length!==NPAT){ sel.innerHTML='';
      for(let i=0;i<NPAT;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent='PTN '+(i+1); sel.appendChild(o); }
      if(id==='mfPrint'){        // never default PRINT onto A or B — land on the first free slot
        let d=NPAT-1;
        for(let i=0;i<NPAT;i++){ if(i===m.from||i===m.to) continue;
          let used=false; for(let q=0;q<NPADS&&!used;q++) used=rowUsed(S.patterns[i],q);
          if(!used){ d=i; break; } }
        sel.value=String(d);
      } }
  });
  $('mfFrom').value=String(m.from); $('mfTo').value=String(m.to);
  $('mfBars').value=String(m.bars); $('mfCurve').value=m.curve; $('mfMode').value=m.mode;
  $('mfVel').checked=!!m.vel;
  $('mfAmt').value=String(m.amt);
  $('mfAmtV').textContent=Math.round(m.amt*100)+'%';
  $('btnMorphOn').classList.toggle('on',m.on);
  // preview: the selected track, A on the left of the slash, what you get now on the right
  const A=S.patterns[m.from], B=S.patterns[m.to];
  const blend=(m.on&&morphBuf)?morphBuf:morphPattern(A,B,m.amt,m.curve,m.vel);
  const glyph=(pat,p)=>{ const L=trackLen(pat,p); let out=''; for(let i=0;i<L;i++) out+=(pat.steps[p][i]>0?'●':'·'); return out; };
  $('mfPreview').textContent = glyph(A,S.seqPad)+'  →  '+glyph(blend,S.seqPad)+'  →  '+glyph(B,S.seqPad);
  const bar=m.on?(' · bar '+Math.min(m.pos+1,m.bars)+'/'+m.bars):'';
  $('mfInfo').textContent = (m.on?'RUNNING':'idle')+bar+' · '+padName(S.seqPad)+' shown';
}
$('mfFrom').addEventListener('change',e=>{ S.morph.from=parseInt(e.target.value,10)|0; if(S.morph.on){ S.morph.pos=0; S.morph.amt=0; selectPattern(S.morph.from); } morphBuild(); drawSeq(); dirty(); });
$('mfTo').addEventListener('change',e=>{ S.morph.to=parseInt(e.target.value,10)|0; morphBuild(); drawSteps(); dirty(); });
$('mfBars').addEventListener('change',e=>{ S.morph.bars=clamp(parseInt(e.target.value,10)|0,1,64); S.morph.pos=Math.round(S.morph.amt*S.morph.bars); drawMorph(); dirty(); });
$('mfCurve').addEventListener('change',e=>{ S.morph.curve=e.target.value; morphBuild(); drawSteps(); dirty(); });
$('mfMode').addEventListener('change',e=>{ S.morph.mode=e.target.value; drawMorph(); dirty(); });
$('mfVel').addEventListener('change',e=>{ S.morph.vel=!!e.target.checked; morphBuild(); drawSteps(); dirty(); });
$('mfAmt').addEventListener('input',e=>morphSetAmt(parseFloat(e.target.value)));
$('btnMorphOn').addEventListener('click',()=>{ if(S.morph.on) morphStop('MORPH OFF · back to PTN '+(S.pattern+1)); else morphStart(); });
$('btnMorphPrint').addEventListener('click',()=>{
  const m=S.morph, dst=parseInt($('mfPrint').value,10)|0;
  const A=S.patterns[m.from], B=S.patterns[m.to];
  if(m.from===m.to){ lcd('MORPH needs two different patterns.'); return; }
  const snap=morphPattern(A,B,clamp(m.amt,0,1),m.curve,m.vel);
  let over=false; for(let q=0;q<NPADS&&!over;q++) over=rowUsed(S.patterns[dst],q);
  S.patterns[dst]=JSON.parse(JSON.stringify(snap));   // deep copy: endpoints return A/B by reference
  if(m.on && (dst===m.from || dst===m.to)) morphBuild();
  drawSeq(); dirty();
  lcd('PRINTED the '+Math.round(m.amt*100)+'% blend to PTN '+(dst+1)+(over?' — that slot had a pattern in it (UNDO to get it back)':''));
  plog('MORPH printed PTN '+(m.from+1)+' → PTN '+(m.to+1)+' at '+Math.round(m.amt*100)+'% ('+m.curve+') into PTN '+(dst+1)+'.');
});


/* ---------------- SCREEN READERS -----------------------------------------
   The UI leans on glyphs (▶ ● ∞ ×), on colour (green pad = loaded, amber =
   playing) and on a canvas or two, none of which a screen reader can see, and
   75 sliders and 55 menus shipped with no accessible name at all. Rather than
   hand-tag every control — which drifts the moment anything is added — the
   labels are derived at runtime from the text already on screen next to each
   control, and a11yPass() is re-run after anything rebuilds the DOM. It is
   idempotent: an explicit aria-label written in the markup always wins. */
function a11yName(el){
  // the visible label sitting in the same row is the name a sighted user reads
  let n=el.previousElementSibling;
  while(n){ if(n.classList && n.classList.contains('lbl') && n.textContent.trim()) return n.textContent.trim(); n=n.previousElementSibling; }
  const row=el.closest('.row,.pslider');
  if(row){ const l=row.querySelector('.lbl'); if(l && l.textContent.trim()) return l.textContent.trim(); }
  // otherwise fall back to the section heading it lives under
  let h=(row||el).previousElementSibling;
  while(h){ if(h.tagName==='H3') return h.firstChild ? String(h.firstChild.textContent||'').trim() : ''; h=h.previousElementSibling; }
  return '';
}
function a11ySliderText(el){
  const row=el.closest('.pslider,.row');
  const v=row && row.querySelector('.val');
  return v && v.textContent.trim() ? v.textContent.trim() : null;
}
function a11ySync(el){                     // keep the spoken value matching the readout
  const t=a11ySliderText(el);
  if(t) el.setAttribute('aria-valuetext',t); else el.removeAttribute('aria-valuetext');
}
function a11yPass(root){
  const r=root||document;
  r.querySelectorAll('input[type=range],select,input[type=text],input[type=number],input[type=file]').forEach(el=>{
    if(!el.getAttribute('aria-label')){
      const n=a11yName(el);
      if(n) el.setAttribute('aria-label', n.replace(/\s+/g,' '));
    }
    if(el.type==='range'){
      a11ySync(el);
      if(!el._a11y){ el._a11y=1; el.addEventListener('input',()=>a11ySync(el)); }
    }
  });
  r.querySelectorAll('input[type=checkbox]').forEach(el=>{
    if(el.getAttribute('aria-label')) return;
    const lab=el.closest('label');
    const t=lab ? lab.textContent.trim() : a11yName(el);
    if(t) el.setAttribute('aria-label', t.replace(/\s+/g,' '));
  });
  // buttons whose face is a glyph: name them from their title, else their row label
  r.querySelectorAll('button').forEach(b=>{
    if(b.getAttribute('aria-label')) return;
    const face=(b.textContent||'').trim();
    if(/[A-Za-z0-9]/.test(face)) return;               // already speaks for itself
    const t=b.getAttribute('title');
    if(t){ b.setAttribute('aria-label',t); return; }
    const n=a11yName(b);
    if(n) b.setAttribute('aria-label',n+' '+face);
  });
  r.querySelectorAll('button.on').forEach(a11yPressed);
  a11yTabs();
}
function a11yTabs(){
  document.querySelectorAll('#tabs button').forEach(b=>
    b.setAttribute('aria-selected', b.classList.contains('on') ? 'true' : 'false'));
}
/* Toggle buttons carry their state in a CSS class, which is invisible to a
   reader. Mirror it onto aria-pressed — but only for buttons that actually
   turn on, so momentary ones (NORMALIZE, BOUNCE) are not mis-announced as
   switches. A button opts in the first time it is seen lit. */
function a11yPressed(b){
  if(b.classList.contains('on')){ b.dataset.tgl='1'; b.setAttribute('aria-pressed','true'); }
  else if(b.dataset.tgl) b.setAttribute('aria-pressed','false');
}
function a11yWatch(){
  document.querySelectorAll('button.on').forEach(a11yPressed);
  if(!window.MutationObserver) return;
  new MutationObserver(ms=>{
    for(const m of ms){
      const t=m.target;
      if(!t.classList || t.tagName!=='BUTTON') continue;
      // step / pad / note cells are relabelled by their own draw routines and
      // are class-toggled many times a second by the playhead — skip them here
      if(t.classList.contains('step')||t.classList.contains('pad')||t.classList.contains('ncell')) continue;
      if(t.parentElement && t.parentElement.id==='tabs'){ a11yTabs(); continue; }
      a11yPressed(t);
    }
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
}


/* ---------------- MIC — a voice channel, and tape without ceremony ------------
   Mic capture already existed but was scattered: SMPL recorded a raw sample,
   TRAX could take MIC as a lane source but only while the sequencer rolled, and
   the AMP chain was voiced for guitar (cabinet filtering, presence bump) which
   is wrong for a voice. This is a channel built for a microphone, and a record
   button that needs nothing armed and nothing playing.

   Signal path:
     source → in → analyser (metering, pre-shaping so the meter shows the room)
                 → gate → rumble HPF → tone LPF → compressor → sibilance cut
                 → low/mid/high → character → doubler → out
     out → monitor → master     (monitor OFF by default; speakers WILL howl)
     out → liveBus              (a mic is a live performance, so LIVE-ONLY
                                 tape recording picks it up)
     out → reverb / delay sends
     out → capture destination  (what RECORD actually records)

   SIBILANCE is a fixed peaking cut around 7kHz, not a true dynamic de-esser —
   that needs sidechained band splitting, which Web Audio cannot do cleanly
   without phase trouble. It is labelled for what it does rather than what it
   is not: it takes the edge off harsh S sounds at the cost of some air. ---- */
let micOn=false, micChain=null, micStreamIn=null, micVuRAF=0, micAn=null, micPeakHold=0;
let micRec=null, micRecT0=0, micRecTimer=0;

const MIC_PRESETS={
  natural:{gain:1,  hp:80,  lp:18000, gate:.12, comp:.35, sib:0,  lo:0,  mid:0,   hi:1,  drive:0,   dbl:0,  rev:.10, dly:0},
  warm:   {gain:1.2,hp:70,  lp:12000, gate:.12, comp:.45, sib:.2, lo:3,  mid:-1,  hi:-1, drive:.10, dbl:0,  rev:.14, dly:0},
  bright: {gain:1.1,hp:95,  lp:18000, gate:.14, comp:.35, sib:.3, lo:-1, mid:1,   hi:4,  drive:0,   dbl:0,  rev:.12, dly:0},
  radio:  {gain:1.6,hp:120, lp:14000, gate:.18, comp:.85, sib:.35,lo:2,  mid:2,   hi:3,  drive:.25, dbl:0,  rev:.04, dly:0},
  phone:  {gain:1.4,hp:400, lp:3000,  gate:.18, comp:.7,  sib:0,  lo:-8, mid:6,   hi:-6, drive:.15, dbl:0,  rev:0,   dly:0},
  mega:   {gain:1.8,hp:350, lp:4000,  gate:.2,  comp:.8,  sib:0,  lo:-6, mid:8,   hi:-4, drive:.75, dbl:0,  rev:.05, dly:0},
  whisper:{gain:2.2,hp:110, lp:18000, gate:.05, comp:.75, sib:.4, lo:-2, mid:0,   hi:5,  drive:0,   dbl:.2, rev:.35, dly:.08},
  huge:   {gain:1.2,hp:75,  lp:18000, gate:.12, comp:.5,  sib:.25,lo:2,  mid:0,   hi:2,  drive:.08, dbl:.55,rev:.5,  dly:.22},
};

/* Opening a microphone on iOS has more failure modes than it has successes, and
   every one of them is silent by default. Shared so the MIC tab, the sampler
   and the amp all explain themselves the same way. */
async function openMicStream(constraints){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    throw new Error('This browser has no microphone access. If Lockdown Mode is on, media APIs are disabled.');
  try{
    if(navigator.permissions && navigator.permissions.query){
      const st=await navigator.permissions.query({name:'microphone'});
      if(st.state==='denied')
        throw new Error('Microphone blocked for this site — Safari: tap aA in the address bar → Website Settings → Microphone → Allow.');
    }
  }catch(e){ if(/blocked for this site/.test(e.message)) throw e; }
  // a 'playback' audio session forbids capture on iOS: the track arrives dead
  try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record'; }catch(e){}
  try{
    return await navigator.mediaDevices.getUserMedia(constraints||{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  }catch(err){
    const n=err&&err.name;
    if(n==='NotAllowedError') throw new Error('Microphone denied — Safari: aA menu → Website Settings → Microphone → Allow.');
    if(n==='NotFoundError')   throw new Error('No microphone found on this device.');
    if(n==='NotReadableError')throw new Error('Microphone busy — another app may be holding it.');
    if(n==='SecurityError')   throw new Error('Microphone blocked by browser security.');
    throw new Error('Microphone error: '+(n||'unknown'));
  }
}

function micBuild(){
  const M={};
  M.src=AC.createMediaStreamSource(micStreamIn);
  M.in=AC.createGain();
  M.an=AC.createAnalyser(); M.an.fftSize=1024;
  M.gate=AC.createGain(); M.gate.gain.value=1;
  M.hp=AC.createBiquadFilter(); M.hp.type='highpass'; M.hp.frequency.value=80;
  M.lp=AC.createBiquadFilter(); M.lp.type='lowpass';  M.lp.frequency.value=18000;
  M.comp=AC.createDynamicsCompressor();
  M.sib=AC.createBiquadFilter(); M.sib.type='peaking'; M.sib.frequency.value=7000; M.sib.Q.value=1.6; M.sib.gain.value=0;
  M.lo=AC.createBiquadFilter();  M.lo.type='lowshelf';  M.lo.frequency.value=180;
  M.mid=AC.createBiquadFilter(); M.mid.type='peaking';  M.mid.frequency.value=1400; M.mid.Q.value=0.8;
  M.hi=AC.createBiquadFilter();  M.hi.type='highshelf'; M.hi.frequency.value=4200;
  M.drive=AC.createWaveShaper(); M.drive.oversample='2x';
  M.dry=AC.createGain();
  // doubler: a short modulated delay reads as a second, slightly-late take
  M.dblDelay=AC.createDelay(0.08); M.dblDelay.delayTime.value=0.026;
  M.dblLfo=AC.createOscillator(); M.dblLfo.frequency.value=0.7;
  M.dblDepth=AC.createGain(); M.dblDepth.gain.value=0.0015;
  M.dblWet=AC.createGain(); M.dblWet.gain.value=0;
  M.out=AC.createGain();
  M.mon=AC.createGain(); M.mon.gain.value=0;      // silence until asked: feedback
  M.rsend=AC.createGain(); M.rsend.gain.value=0;
  M.dsend=AC.createGain(); M.dsend.gain.value=0;
  M.dest=AC.createMediaStreamDestination();       // what RECORD captures

  M.dblLfo.connect(M.dblDepth); M.dblDepth.connect(M.dblDelay.delayTime); M.dblLfo.start();
  M.src.connect(M.in);
  M.in.connect(M.an);                              // meter the room, before shaping
  M.in.connect(M.gate);
  M.gate.connect(M.hp); M.hp.connect(M.lp); M.lp.connect(M.comp); M.comp.connect(M.sib);
  M.sib.connect(M.lo); M.lo.connect(M.mid); M.mid.connect(M.hi); M.hi.connect(M.drive);
  M.drive.connect(M.dry); M.dry.connect(M.out);
  M.drive.connect(M.dblDelay); M.dblDelay.connect(M.dblWet); M.dblWet.connect(M.out);
  M.out.connect(M.mon); M.mon.connect(LIVE.master);
  if(LIVE.liveBus) M.out.connect(LIVE.liveBus);
  M.out.connect(M.rsend); M.rsend.connect(LIVE.revIn);
  M.out.connect(M.dsend); M.dsend.connect(LIVE.dlyIn);
  M.out.connect(M.dest);
  micAn=new Float32Array(M.an.fftSize);
  return M;
}

function micApply(){
  const M=micChain; if(!M||!AC) return;
  const t=AC.currentTime, v=id=>parseFloat($(id).value);
  M.in.gain.setTargetAtTime(v('micGain'),t,0.02);
  M.hp.frequency.setTargetAtTime(v('micHp'),t,0.02);
  M.lp.frequency.setTargetAtTime(v('micLp'),t,0.02);
  const c=v('micComp');
  M.comp.threshold.setTargetAtTime(-6-c*40,t,0.02);
  M.comp.ratio.setTargetAtTime(1.5+c*14,t,0.02);
  M.comp.attack.setTargetAtTime(0.004,t,0.02);
  M.comp.release.setTargetAtTime(0.12+c*0.2,t,0.02);
  M.sib.gain.setTargetAtTime(-v('micSib')*14,t,0.02);
  M.lo.gain.setTargetAtTime(v('micLo'),t,0.02);
  M.mid.gain.setTargetAtTime(v('micMid'),t,0.02);
  M.hi.gain.setTargetAtTime(v('micHi'),t,0.02);
  const d=v('micDrive');
  M.drive.curve = d>0.001 ? makeDriveCurve(d) : null;
  M.dblWet.gain.setTargetAtTime(v('micDbl')*0.8,t,0.02);
  M.rsend.gain.setTargetAtTime(v('micRev'),t,0.02);
  M.dsend.gain.setTargetAtTime(v('micDly'),t,0.02);
  micLabels();
}
function micLabels(){
  const f=(id,txt)=>{ const e=$(id+'V'); if(e) e.textContent=txt; };
  f('micGain',(+$('micGain').value).toFixed(1)+'×');
  f('micHp',Math.round(+$('micHp').value)+'Hz');
  const lp=+$('micLp').value; f('micLp', lp>=17500?'off':(lp>=1000?(lp/1000).toFixed(1)+'kHz':Math.round(lp)+'Hz'));
  ['micComp','micSib','micDrive','micDbl','micRev','micDly'].forEach(id=>f(id,Math.round(+$(id).value*100)+'%'));
  // a gate at zero is OFF, and saying so is the difference between "I have not
  // set this" and "this is what is eating my voice"
  { const g=+$('micGate').value; f('micGate', g<=0 ? 'off' : Math.round(g*100)+'%'); }
  ['micLo','micMid','micHi'].forEach(id=>{ const x=+$(id).value; f(id,(x>0?'+':'')+x.toFixed(1)+'dB'); });
}
function micMeter(){
  if(!micOn||!micChain){ micVuRAF=0; return; }
  micVuRAF=requestAnimationFrame(micMeter);
  micChain.an.getFloatTimeDomainData(micAn);
  let pk=0, sum=0;
  for(let i=0;i<micAn.length;i++){ const a=Math.abs(micAn[i]); if(a>pk) pk=a; sum+=micAn[i]*micAn[i]; }
  const rms=Math.sqrt(sum/micAn.length);
  /* The gate compares RMS, and the meter beside it shows PEAK — which are a
     long way apart on a voice. At the old 12% default the gate only opened
     above about -27dBFS RMS, and with autoGainControl off a phone held at
     arm's length rarely gets there: the bar danced, the gate stayed shut, and
     the recording came out silent with nothing on screen saying why.
     It defaults to off now, and when it IS closing on real signal it says so
     where the level is, instead of leaving you to work it out. */
  const th=parseFloat($('micGate').value)*0.35;
  const gateOff = th<=0.0005;
  const open = gateOff || rms>th;
  micChain.gate.gain.setTargetAtTime(open?1:0.0001, AC.currentTime, open?0.005:0.05);
  micPeakHold=Math.max(pk, micPeakHold*0.93);
  const bar=$('micBar').firstElementChild;
  bar.style.width=Math.min(100,micPeakHold*140)+'%';
  bar.classList.toggle('hot', micPeakHold>0.5 && micPeakHold<=0.94);
  bar.classList.toggle('clip', micPeakHold>0.94);
  bar.classList.toggle('shut', !open && micPeakHold>0.02);
  const db = micPeakHold>0.0005 ? (20*Math.log10(micPeakHold)).toFixed(0)+' dB' : '—';
  $('micPeakV').textContent = micPeakHold>0.94 ? 'CLIP'
    : (!open && micPeakHold>0.02) ? 'GATE SHUT' : db;
}

async function micEnable(){
  ensureAudio();
  lcd('ASKING FOR THE MICROPHONE …');
  const dev=$('micIn').value;
  const con={audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
  if(dev && dev!=='default') con.audio.deviceId={exact:dev};
  try{ micStreamIn=await openMicStream(con); }
  catch(err){ lcd(err.message); return; }
  try{ micChain=micBuild(); }
  catch(e){ lcd('MIC SETUP FAILED: '+e.message); micDisable(); return; }
  micOn=true;
  $('btnMicOn').classList.add('on'); $('btnMicOn').innerHTML='&#9673; MIC IS ON — TAP TO STOP';
  micApply(); micMeter(); micListDevices();
  lcd('MIC ON — shape the voice, then RECORD. Headphones before MONITOR.');
}
function micDisable(){
  micOn=false;
  if(micVuRAF) cancelAnimationFrame(micVuRAF); micVuRAF=0;
  if(micRec && micRec.state==='recording'){ try{ micRec.stop(); }catch(e){} }
  if(micChain){ try{ micChain.src.disconnect(); micChain.out.disconnect(); micChain.mon.disconnect();
    micChain.dblLfo.stop(); micChain.dblLfo.disconnect(); }catch(e){} }
  micChain=null;
  if(micStreamIn){ micStreamIn.getTracks().forEach(t=>t.stop()); micStreamIn=null; }
  $('btnMicOn').classList.remove('on'); $('btnMicOn').innerHTML='&#9673; TURN THE MIC ON';
  $('btnMicMon').classList.remove('on');
  const bar=$('micBar'); if(bar&&bar.firstElementChild) bar.firstElementChild.style.width='0%';
  $('micPeakV').textContent='—';
  resumeSession();
}
async function micListDevices(){
  try{
    const ds=await navigator.mediaDevices.enumerateDevices();
    const sel=$('micIn'), cur=sel.value;
    const ins=ds.filter(d=>d.kind==='audioinput');
    if(!ins.length) return;
    sel.innerHTML='<option value="default">Default microphone</option>';
    ins.forEach((d,i)=>{ const o=document.createElement('option'); o.value=d.deviceId;
      o.textContent=d.label||('Microphone '+(i+1)); sel.appendChild(o); });
    sel.value=cur;
    if(sel.selectedIndex<0) sel.value='default';
  }catch(e){}
}

/* RECORD — nothing armed, nothing rolling. Captures the shaped channel (or the
   raw mic, if asked) and drops the take on a tape lane or the selected pad. */
function micNextLane(){
  for(let i=0;i<S.trax.length;i++) if(S.trax[i].bufId<0) return i;
  return -1;
}
async function micRecordStart(){
  if(!micOn||!micChain){ lcd('TURN THE MIC ON FIRST.'); return; }
  const wet=$('micWet').checked;
  const stream = wet ? micChain.dest.stream : micStreamIn;
  let mr; try{ mr=new MediaRecorder(stream); }
  catch(e){ lcd('This browser cannot record from the microphone (no MediaRecorder).'); return; }
  const chunks=[];
  mr.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
  mr.onstop=async ()=>{
    clearInterval(micRecTimer); micRecTimer=0;
    $('btnMicRec').classList.remove('on'); $('btnMicRec').innerHTML='&#9679; RECORD';
    micRec=null;
    if(!chunks.length){ $('micRecInfo').textContent='nothing captured'; lcd('NOTHING CAPTURED — too short?'); return; }
    $('micRecInfo').textContent='decoding…';
    try{
      const buf=await AC.decodeAudioData(await new Blob(chunks).arrayBuffer());
      micPlaceTake(buf);
    }catch(err){ lcd('COULD NOT DECODE THE RECORDING: '+(err.message||err)); $('micRecInfo').textContent='failed'; }
  };
  micRec=mr; micRecT0=performance.now();
  mr.start();
  $('btnMicRec').classList.add('on'); $('btnMicRec').innerHTML='&#9632; STOP';
  micRecTimer=setInterval(()=>{
    const s=(performance.now()-micRecT0)/1000;
    $('micRecInfo').textContent='recording '+s.toFixed(1)+'s';
  },100);
  lcd('RECORDING — tap STOP when you are done.');
}
/* A take that came back empty is the one outcome that must never be reported as
   success — TRAX has guarded this since R44 and the mic never did, so "TAKE →
   A04" was printed over a silent buffer and the pad simply did nothing.
   Kept rather than discarded: it is still your recording, and the reason is
   nearly always one of two things you can fix in a second. */
function micTakeSilent(buf){
  let pk=0;
  for(let ch=0;ch<buf.numberOfChannels;ch++){ const d=buf.getChannelData(ch);
    for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  if(pk>=0.004) return false;
  const gated=parseFloat($('micGate').value)>0;
  plog('SILENT MIC TAKE: peak '+pk.toFixed(5)+'. '+(gated
    ? 'GATE is at '+Math.round(parseFloat($('micGate').value)*100)+'% — it was probably never opening.'
    : 'Nothing reached the microphone.')+' Kept anyway.');
  lcd('⚠ THAT TAKE IS SILENT — '+(gated
    ? 'turn GATE down to off and watch the meter, then record again.'
    : 'check the meter moves while you talk, and raise GAIN if it barely does.'));
  return true;
}
function micPlaceTake(buf){
  S.buffers.push(buf); const bid=S.buffers.length-1;
  const dur=buf.duration.toFixed(1)+'s';
  const silent=micTakeSilent(buf);
  if($('micDest').value==='pad'){
    const pad=S.editPad, p=S.pads[pad];
    p.bufId=bid; p.start=0; p.end=1; p.warped=false; p.name=p.name||'voice';
    delete warpOrig[pad];
    drawPads(); drawEdit(); dirty();
    $('micRecInfo').textContent=(silent?'⚠ silent · ':'')+dur+' → '+padName(pad);
    if(!silent) lcd('TAKE → '+padName(pad)+' · '+dur+' — play the pad, or open it in SMPL to chop it.');
    return;
  }
  const lane=micNextLane();
  if(lane<0){ $('micRecInfo').textContent='all lanes full';
    lcd('EVERY TAPE LANE IS FULL — clear one in TRAX, or set GOES TO: the selected pad.'); return; }
  const tr=S.trax[lane];
  tr.bufId=bid; tr.name='voice'; tr.gain=tr.gain||0.9;
  drawTrax(); dirty();
  $('micRecInfo').textContent=(silent?'⚠ silent · ':'')+dur+' → T'+(lane+1);
  if(!silent) lcd('TAKE → TAPE LANE '+(lane+1)+' · '+dur+' — it plays with the song; FX and TO PAD are in TRAX.');
}

$('btnMicOn').addEventListener('click',()=>{ if(micOn) { micDisable(); lcd('MIC OFF.'); } else micEnable(); });
$('btnMicMon').addEventListener('click',()=>{
  if(!micChain){ lcd('TURN THE MIC ON FIRST.'); return; }
  const on=!$('btnMicMon').classList.contains('on');
  $('btnMicMon').classList.toggle('on',on);
  micChain.mon.gain.setTargetAtTime(on?1:0,AC.currentTime,0.02);
  $('micMonHint').textContent = on ? 'on — if it howls, you are on speakers: turn this off'
                                   : 'off — headphones only, or it will feed back';
  lcd(on?'MONITOR ON — headphones only.':'MONITOR OFF.');
});
$('micIn').addEventListener('change',()=>{ if(micOn){ micDisable(); micEnable(); } });
['micGain','micHp','micLp','micGate','micComp','micSib','micLo','micMid','micHi','micDrive','micDbl','micRev','micDly']
  .forEach(id=>$(id).addEventListener('input',()=>{ $('micPreset').value=$('micPreset').value; micApply(); }));
$('micPreset').addEventListener('change',e=>{
  const P=MIC_PRESETS[e.target.value]; if(!P) return;
  const set=(id,v)=>{ $(id).value=String(v); };
  set('micGain',P.gain); set('micHp',P.hp); set('micLp',P.lp); set('micGate',P.gate);
  set('micComp',P.comp); set('micSib',P.sib); set('micLo',P.lo); set('micMid',P.mid);
  set('micHi',P.hi); set('micDrive',P.drive); set('micDbl',P.dbl); set('micRev',P.rev); set('micDly',P.dly);
  micApply();
  lcd('VOICE: '+e.target.selectedOptions[0].textContent);
});
$('btnMicRec').addEventListener('click',()=>{
  if(micRec && micRec.state==='recording'){ try{ micRec.stop(); }catch(e){} return; }
  micRecordStart();
});
micLabels();



/* ---------------- MIC + AMP settings live with the project --------------------
   Twenty-nine controls between them, and every one was thrown away on reload —
   you re-dialled your voice or your amp from scratch every session. They are
   stored the way S.inst already was: a flat map of control id → value, read off
   the DOM and written back.

   Two things are deliberately NOT stored. The input device, because a deviceId
   from one phone means nothing on another. And the MONITOR state — reopening a
   project with the mic monitor already live would howl through the speakers
   before anyone could reach a control. */
const MIC_CTRLS=['micPreset','micGain','micHp','micLp','micGate','micComp','micSib',
  'micLo','micMid','micHi','micDrive','micDbl','micRev','micDly','micDest'];
const AMP_CTRLS=['ampModel','ampPreset','ampGain','ampLevel','ampGate',
  'ampBass','ampMid','ampTreb','ampChDepth','ampDly','ampRev'];

function readCtrls(ids){
  const o={};
  ids.forEach(id=>{ const e=$(id); if(!e) return;
    o[id]=(e.type==='checkbox')?!!e.checked:e.value; });
  return o;
}
function writeCtrls(ids,vals){
  if(!vals) return;
  ids.forEach(id=>{ const e=$(id); if(!e || !(id in vals)) return;
    if(e.type==='checkbox'){ e.checked=!!vals[id]; return; }
    e.value=String(vals[id]);
    // a saved value that no longer exists (a renamed preset, a removed option)
    // must not leave the control blank
    if(e.tagName==='SELECT' && e.selectedIndex<0) e.selectedIndex=0;
  });
}
/* the readouts are updated inline by each control's own listener, so after a
   restore they have to be redrawn or they show the previous project's numbers */
function ampLabels(){
  const pct=id=>{ const e=$(id+'V'); if(e) e.textContent=Math.round(parseFloat($(id).value)*100)+'%'; };
  const db =id=>{ const e=$(id+'V'); if(e){ const v=parseFloat($(id).value); e.textContent=(v>0?'+':'')+v; } };
  ['ampGain','ampLevel','ampChDepth','ampDly','ampRev'].forEach(pct);
  ['ampBass','ampMid','ampTreb'].forEach(db);
  const g=$('ampGateV'); if(g){ const v=parseFloat($('ampGate').value); g.textContent=v<=0?'off':Math.round(v*100)+'%'; }
}
function micSettings(){
  const o=readCtrls(MIC_CTRLS);
  o.wet=$('micWet')?!!$('micWet').checked:true;
  return o;
}
function ampSettings(){
  const o=readCtrls(AMP_CTRLS);
  o.cab   =$('ampCab')?$('ampCab').classList.contains('on'):true;       // toggle buttons, not inputs
  o.chorus=$('ampChorus')?$('ampChorus').classList.contains('on'):false;
  return o;
}
function applyMicSettings(v){
  if(!v) return;
  writeCtrls(MIC_CTRLS,v);
  if($('micWet') && 'wet' in v) $('micWet').checked=!!v.wet;
  try{ micLabels(); }catch(e){}
  if(micChain){ try{ micApply(); }catch(e){} }      // only touches audio if the mic is open
}
function applyAmpSettings(v){
  if(!v) return;
  writeCtrls(AMP_CTRLS,v);
  if($('ampCab') && 'cab' in v) $('ampCab').classList.toggle('on',!!v.cab);
  if($('ampChorus') && 'chorus' in v) $('ampChorus').classList.toggle('on',!!v.chorus);
  try{ ampLabels(); }catch(e){}
  if(ampNodes){ try{ ampApplyModel(); ampApplyTone(); ampApplyFx(); }catch(e){} }
}
/* touching any of them marks the project dirty, so they autosave like the rest */
MIC_CTRLS.concat(AMP_CTRLS,['micWet']).forEach(id=>{
  const e=$(id); if(e) e.addEventListener('change',()=>dirty());
});
['ampCab','ampChorus'].forEach(id=>{ const e=$(id); if(e) e.addEventListener('click',()=>dirty()); });


/* ---------------- OUT — spectrum, meters, and the master controls -------------
   The numbers matter more than the picture, so the analyser is the smallest
   part of this. PEAK says whether it will clip; LOUD says whether it will sit
   at the right level next to other music; WIDTH says whether it survives being
   folded to mono on a phone speaker. All three are read off the same taps the
   level meter already uses. */
let outRAF=0, specData=null, mPeakHold=0, kL=null, kR=null, kAn=null;

/* Loudness needs the signal K-weighted first (BS.1770): a high shelf for the
   head's response and a highpass for the body's. This is short-term and
   ungated, so it is labelled approximate rather than pretending to be a
   certified LUFS reading. */
function buildLoudTap(){
  if(!AC||!LIVE||kAn) return;
  try{
    kL=AC.createBiquadFilter(); kL.type='highshelf'; kL.frequency.value=1500; kL.gain.value=4;
    kR=AC.createBiquadFilter(); kR.type='highpass';  kR.frequency.value=38;   kR.Q.value=0.5;
    kAn=AC.createAnalyser(); kAn.fftSize=2048;
    LIVE.limiter.connect(kL); kL.connect(kR); kR.connect(kAn);
  }catch(e){ kAn=null; }
}
function outDraw(){
  const cv=$('spectrum');
  if(!cv || !document.getElementById('v-out').classList.contains('on')){ outRAF=0; return; }
  outRAF=requestAnimationFrame(outDraw);
  const {cx,W,H}=fitCanvas(cv);
  cx.fillStyle='#120d04'; cx.fillRect(0,0,W,H);
  if(!AC||!LIVE){ cx.fillStyle='rgba(255,180,84,0.5)'; cx.font='16px system-ui,sans-serif';
    cx.textAlign='center'; cx.fillText('press PLAY to see the output', W/2, H/2); return; }
  buildLoudTap();
  const an=LIVE.meterL;
  if(!specData || specData.length!==an.frequencyBinCount) specData=new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(specData);

  // log frequency axis: linear bins squash everything musical into the left edge
  const nyq=AC.sampleRate/2, f0=30, f1=Math.min(18000,nyq);
  const bars=76;
  for(let i=0;i<bars;i++){
    const fa=f0*Math.pow(f1/f0,i/bars), fb=f0*Math.pow(f1/f0,(i+1)/bars);
    let lo=Math.floor(fa/nyq*specData.length), hi=Math.max(lo+1,Math.ceil(fb/nyq*specData.length));
    let v=0; for(let k=lo;k<hi&&k<specData.length;k++) if(specData[k]>v) v=specData[k];
    const h=(v/255)*(H-14), x=i*(W/bars);
    /* colour by level, but never red: a loud BAND is not clipping, and painting
       it red would say "danger" about a perfectly healthy bass drum. Clipping
       is the PEAK readout's job, where it means something. */
    cx.fillStyle = v>210 ? '#ff8c2e' : (v>140 ? 'rgba(255,160,60,0.85)' : 'rgba(255,180,84,0.55)');
    cx.fillRect(x+1, H-h, (W/bars)-2, h);
  }
  // octave guides, so the picture can be read as frequency rather than shape
  cx.fillStyle='rgba(255,255,255,0.28)'; cx.font='11px ui-monospace'; cx.textAlign='center';
  [100,1000,10000].forEach(f=>{
    const x=(Math.log(f/f0)/Math.log(f1/f0))*W;
    cx.fillRect(x,0,1,H-13);
    cx.fillText(f>=1000?(f/1000)+'k':String(f), x, H-2);
  });
  outMeters();
}
function outMeters(){
  const L=LIVE.meterL, R=LIVE.meterR;
  const n=L.fftSize;
  const a=new Float32Array(n), b=new Float32Array(n);
  L.getFloatTimeDomainData(a); R.getFloatTimeDomainData(b);
  let pk=0, sum=0, sl=0, sr=0, sc=0;
  for(let i=0;i<n;i++){
    const l=a[i], r=b[i];
    const m=Math.max(Math.abs(l),Math.abs(r)); if(m>pk) pk=m;
    sum+=(l*l+r*r)/2; sl+=l*l; sr+=r*r; sc+=l*r;
  }
  const rms=Math.sqrt(sum/n);
  mPeakHold=Math.max(pk,mPeakHold*0.95);
  const dB=v=>v>1e-6?(20*Math.log10(v)):-Infinity;
  const fmt=v=>v===-Infinity?'—':(v>=0?'+':'')+v.toFixed(1);
  $('mPeakV').textContent=fmt(dB(mPeakHold));
  $('mPeakV').style.color = mPeakHold>0.995 ? 'var(--red)' : (mPeakHold>0.85?'var(--amber)':'var(--lcd)');
  $('mRmsV').textContent=fmt(dB(rms));

  // approximate short-term loudness off the K-weighted tap
  let loud=-Infinity;
  if(kAn){
    const k=new Float32Array(kAn.fftSize); kAn.getFloatTimeDomainData(k);
    let ks=0; for(let i=0;i<k.length;i++) ks+=k[i]*k[i];
    const kr=Math.sqrt(ks/k.length);
    if(kr>1e-6) loud=-0.691+10*Math.log10(kr*kr*2);
  }
  $('mLufsV').textContent = loud===-Infinity ? '—' : loud.toFixed(1);

  // correlation: +1 is mono, 0 is wide, negative means it will cancel in mono
  const corr=(sl>1e-9&&sr>1e-9)?(sc/Math.sqrt(sl*sr)):1;
  $('mCorrV').textContent=corr.toFixed(2);
  $('mCorrV').style.color = corr<0 ? 'var(--red)' : (corr<0.3?'var(--amber)':'var(--lcd)');

  // one line of plain English, because a number only helps if you know the target
  let msg='';
  if(mPeakHold>0.995) msg='Clipping. Lower CEILING, or turn the master down.';
  else if(corr<0) msg='Parts of this will cancel out in mono. Try less WIDTH, or BASS MONO.';
  else if(loud>-9) msg='Very loud — fine for a club, crushed for streaming.';
  else if(loud>-16 && loud<-11) msg='Sitting about right for streaming.';
  else if(loud<-22 && loud>-Infinity) msg='Quiet. Push the master, the ceiling will hold it.';
  else if(loud===-Infinity) msg='Press PLAY to read the output.';
  else msg='Peak ' + fmt(dB(mPeakHold)) + ' dB · nothing is clipping.';
  $('outAdvice').textContent=msg;
}
function outLabels(){
  const f=(id,txt)=>{ const e=$(id+'V'); if(e) e.textContent=txt; };
  ['mEqLo','mEqMid','mEqHi'].forEach(id=>{ const v=parseFloat($(id).value); f(id,(v>0?'+':'')+v.toFixed(1)+'dB'); });
  f('mWidth',Math.round(parseFloat($('mWidth').value)*100)+'%');
  const mono=parseFloat($('mMono').value);
  f('mMono', mono<25?'off':Math.round(mono)+'Hz');
  f('mCeil',parseFloat($('mCeil').value).toFixed(1)+'dB');
  f('mTrim',dbText(parseFloat($('mTrim').value)));
}
function outRead(){
  S.mEqLo=parseFloat($('mEqLo').value); S.mEqMid=parseFloat($('mEqMid').value); S.mEqHi=parseFloat($('mEqHi').value);
  S.mWidth=parseFloat($('mWidth').value);
  const mono=parseFloat($('mMono').value); S.mMono = mono<25 ? 0 : mono;
  S.mCeil=parseFloat($('mCeil').value);
  S.mTrim=parseFloat($('mTrim').value);
  outLabels(); applyMaster(); dirty();
}
function outWrite(){
  $('mEqLo').value=S.mEqLo; $('mEqMid').value=S.mEqMid; $('mEqHi').value=S.mEqHi;
  $('mWidth').value=S.mWidth; $('mMono').value=S.mMono||0; $('mCeil').value=S.mCeil;
  $('mTrim').value=S.mTrim||0;
  $('btnMByp').classList.toggle('on',!!S.mByp);
  outLabels();
}
['mEqLo','mEqMid','mEqHi','mWidth','mMono','mCeil','mTrim'].forEach(id=>
  $(id).addEventListener('input',outRead));
$('btnMByp').addEventListener('click',()=>{
  S.mByp=!S.mByp; $('btnMByp').classList.toggle('on',S.mByp);
  applyMaster(); dirty();
  lcd(S.mByp?'MASTER CHAIN BYPASSED — hearing it raw.':'MASTER CHAIN ON.');
});
$('btnMFlat').addEventListener('click',()=>{
  S.mEqLo=S.mEqMid=S.mEqHi=0; S.mWidth=1; S.mMono=0; S.mCeil=-1; S.mByp=false; S.mTrim=0;
  outWrite(); applyMaster(); dirty(); lcd('MASTER CHAIN RESET to flat.');
});

/* AUTO — set TRIM so the loudest peak in the mix lands exactly on the ceiling.
   It renders the mix offline and taps it where the trim leaves off, BEFORE the
   limiter and the safety clipper, because those two are precisely what hide the
   overshoot you are trying to measure: ask the finished bounce how loud it is
   and it will always answer "the ceiling".
   One press, one number, written into a slider you can see and move yourself —
   not a process quietly riding your master. It is undoable and it saves with
   the project like any other control. */
let mAutoBusy=false;
$('btnMAuto').addEventListener('click',async ()=>{
  if(mAutoBusy) return;
  mAutoBusy=true; $('btnMAuto').classList.add('on');
  /* Judge the whole piece, not whichever pattern is selected. A trim set from
     one pattern is no use the moment the chorus arrives, and BOUNCE's source
     dropdown lives on another tab and defaults to CURRENT PATTERN — so AUTO
     picks the fullest arrangement there is and ignores it. */
  const src = S.song.length ? 'song' : (S.chain.length ? 'chain' : 'pat');
  const heard = src==='song' ? 'the whole song ('+S.song.reduce((a,x)=>a+Math.max(1,x.reps||1),0)+' patterns)'
    : src==='chain' ? 'the whole chain ('+S.chain.length+' patterns)'
    : 'pattern '+(S.pattern+1);
  /* Say how much music this is before disappearing into it. A full song renders
     at roughly twice realtime, so a two-minute piece is the better part of a
     minute — worth waiting for, but only if you know that is what is happening.
     The render itself runs on the audio thread, so the app stays usable
     throughout; nothing here freezes. */
  let secs=0;
  try{ secs=bounceSeq(src).reduce((a,sq)=>
    a+patLen(sq.pat)*(60/Math.abs((S.ptnBpm&&sq.pat.bpm)?sq.pat.bpm:S.bpm)/4),0); }catch(e){}
  const howLong = secs>1 ? ', '+(secs<60?Math.round(secs)+'s':Math.round(secs/60)+' min')+' of music' : '';
  try{
    lcd('AUTO — listening to '+heard.replace(/\)$/, howLong+')')+' … the app stays usable.');
    await new Promise(r=>setTimeout(r,0));            // let that message paint before the render blocks
    const peakOf=b=>{ let pk=0;
      for(let ch=0;ch<b.numberOfChannels;ch++){ const d=b.getChannelData(ch);
        for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
      return pk; };
    const rendered=await renderMix(null,null,{preLimit:true,worstCase:true,noTail:true,loops:1,src});
    if(!rendered){ lcd('AUTO — nothing to measure. Put something in the pattern or a tape track first.'); return; }
    const pk=peakOf(rendered);
    if(!(pk>1e-6)){ lcd('AUTO — that render came out silent, so there is nothing to set.'); return; }

    /* The worst-case pass covers the two things that only ever make a render
       QUIETER — skipped probability steps and thinned velocities. It cannot
       cover humanize's timing JITTER, which can push a peak up: nudge two hits
       a few milliseconds apart and their transients may line up better than
       they do on the exact grid. Nothing finite bounds that, and sampling it
       properly would mean rendering the whole piece several times over, which
       at roughly twice realtime is not a thing to do behind a button. So it is
       given room instead — measured at 0.5dB with humanize at its default and
       under 1dB at the top of the range — and the limiter, which is still
       downstream, absorbs whatever an unlucky take does with the rest. */
    const margin = S.human>0 ? Math.min(1, 1.5*S.human) : 0;
    /* The measurement was taken with the trim at unity, so the answer is the
       setting itself — not an adjustment to the setting it already had. */
    const want=20*Math.log10(dbLin(S.mCeil)/pk)-margin;
    const before=S.mTrim;
    S.mTrim=clamp(Math.round(want*10)/10,-24,12);
    outWrite(); applyMaster(); dirty();
    const moved=S.mTrim-before;
    const over=20*Math.log10(pk*dbLin(before))-S.mCeil;   // how far past the ceiling it WAS
    const at=' Loudest point of '+heard+' now sits on the '+S.mCeil.toFixed(1)+'dB ceiling'
      +(margin?', with '+margin.toFixed(1)+'dB spare for humanize.':'.');
    if(want<-24 || want>12)
      lcd('AUTO — '+heard+' needs '+dbText(want)+' and TRIM only goes to '+dbText(S.mTrim)
        +'. Move the master volume and press AUTO again.');
    else if(moved<-0.05)
      lcd('AUTO — down '+Math.abs(moved).toFixed(1)+'dB. You were '+over.toFixed(1)+'dB into the limiter;'
        +' it has nothing left to do.'+at);
    else if(moved>0.05)
      lcd('AUTO — up '+moved.toFixed(1)+'dB. You had that much headroom going spare.'+at);
    else lcd('AUTO — already right where it should be.'+at);
  }catch(e){ lcd('AUTO failed: '+e.message); logErr('auto trim: '+e.message); }
  finally{ mAutoBusy=false; $('btnMAuto').classList.remove('on'); }
});
outLabels();
// off the boot path — the app is usable while this runs, and applyMaster() at
// the end of it folds the result into whatever graph exists by then
setTimeout(()=>{ measureMakeup(); }, 0);


/* ---------------- what the CEILING costs you ---------------------------------
   A DynamicsCompressor applies makeup gain of its own, scaled to the threshold,
   and that made CEILING run backwards: a mix 20dB below the threshold — nowhere
   near it, nothing to limit — came out 6.6dB LOUDER at a -12dB ceiling than at
   -0.5dB, and nothing was ever actually held at the stated level.

   The amount is implementation-defined, so it is measured here rather than
   assumed: a tone 40dB below the threshold, through a compressor with these
   exact settings. That far down nothing else is acting on it, so whatever comes
   back is the makeup gain alone. Thirteen tiny offline renders, once, off the
   critical path; a straight line between them everywhere in between.

   Until the table exists the compensation is 1, which is exactly the behaviour
   the app had before — so a slow or failed measurement costs nothing. */
const MAKEUP=[];
async function measureMakeup(){
  for(let c=0;c>=-12.0001;c-=1){
    try{
      const sr=44100, n=4096, a=Math.pow(10,(c-40)/20);
      const oc=new OfflineAudioContext(1,n,sr);
      const k=oc.createDynamicsCompressor();
      k.threshold.value=c; k.knee.value=0; k.ratio.value=20;
      k.attack.value=0.001; k.release.value=0.05;
      const b=oc.createBuffer(1,n,sr), d=b.getChannelData(0);
      for(let i=0;i<n;i++) d[i]=Math.sin(2*Math.PI*440*i/sr)*a;
      const src=oc.createBufferSource(); src.buffer=b;
      src.connect(k); k.connect(oc.destination); src.start();
      const out=await oc.startRendering(), o=out.getChannelData(0);
      let pk=0; for(let i=n>>1;i<n;i++) pk=Math.max(pk,Math.abs(o[i]));
      if(pk>0) MAKEUP.push([c,pk/a]);
    }catch(e){ return; }                 // no table = no compensation, as before
  }
  try{ applyMaster(); }catch(e){}        // the live graph picks it up immediately
}
function makeupAt(ceil){
  if(MAKEUP.length<2) return 1;
  const c=clamp(ceil,MAKEUP[MAKEUP.length-1][0],MAKEUP[0][0]);
  for(let i=1;i<MAKEUP.length;i++){
    const [c1,g1]=MAKEUP[i];
    if(c>=c1){ const [c0,g0]=MAKEUP[i-1], f=(c-c1)/(c0-c1); return g1+(g0-g1)*f; }
  }
  return MAKEUP[MAKEUP.length-1][1];
}

/* ---------------- MASTER CHAIN — applied to any graph, live or offline -------
   Written as apply(g) so the live graph and the bounce get the same treatment
   from the same code. A master you cannot export is decoration. */
function applyMasterG(g, ctx){
  if(!g || !g.mLo) return;
  const t=ctx?ctx.currentTime:0, byp=S.mByp;
  const set=(param,v)=>{ try{ param.setTargetAtTime(v,t,0.02); }catch(e){ param.value=v; } };
  set(g.mLo.gain,  byp?0:S.mEqLo);
  set(g.mMid.gain, byp?0:S.mEqMid);
  set(g.mHi.gain,  byp?0:S.mEqHi);
  set(g.wAmt.gain, byp?1:S.mWidth);
  // 10Hz is below anything audible: the mono band collects nothing and the
  // width path carries the whole mix, which is what "off" has to mean. It has
  // to be this low — at 20Hz the 4th-order slope is still shaving ~1.5dB off
  // 30Hz content, which you would hear on a sub as the crossover "off".
  const mono=byp?10:Math.max(10,S.mMono||10);
  [g.mMonoLo,g.mMonoLo2,g.mMonoHi,g.mMonoHi2].forEach(f=>set(f.frequency,mono));
  // Trim is a level control, not tone, so it stays put through a bypass — an
  // A/B that jumps in volume tells you nothing about the tone.
  set(g.mTrim.gain, dbLin(S.mTrim));
  // The ceiling is NOT part of the bypass. BYPASS is an A/B of the tone shaping
  // — EQ, width, bass mono — so you can hear what you did. The limiter is the
  // safety rail on the way out; lifting it on bypass would let an A/B clip the
  // speakers, which is the one thing a bypass button must never do.
  try{ g.limiter.threshold.setTargetAtTime(S.mCeil, t, 0.02); }catch(e){ g.limiter.threshold.value=S.mCeil; }
  if(g.limComp) set(g.limComp.gain, 1/makeupAt(S.mCeil));
}
function applyMaster(){ if(LIVE&&AC) applyMasterG(LIVE,AC); }

/* ---------------- tabs ---------------- */
/* The bar scrolls sideways now, so a tab you switch to from anywhere else —
   the tour, a "go to SMPL" shortcut — has to be brought into view or it just
   appears to do nothing. */
function tabIntoView(b){ try{ b.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}); }catch(e){} }
document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click',()=>{
  tabIntoView(b);
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  $('v-'+b.dataset.v).classList.add('on');
  if(b.dataset.v==='seq'){ drawSeq(); }
  if(b.dataset.v==='smpl'){
    if(!workBuf){ const p=S.pads[S.editPad];   // empty workspace: adopt the target pad's sample
      if(p.bufId>=0 && S.buffers[p.bufId]){ workBuf=S.buffers[p.bufId]; slices=[]; selSlice=-1; } }
    drawWave(); drawEdit();
    refreshHaveKeys().then(()=>{ drawPackList(); drawDownloads(); updateStoreMeter(); });   // always reflect current on-device library
  }
  if(b.dataset.v==='mix'){ drawEdit(); drawSidechain(); drawMixer(); }
  if(b.dataset.v==='proj'){ $('bSrc').value=(S.songOn&&S.song.length)?'song':((S.chainOn&&S.chain.length)?'chain':'pat'); drawProjects(); drawRewind(); }
  if(b.dataset.v==='trax'){ drawTrax(); }
  if(b.dataset.v==='live'){ drawLive(); }
  if(b.dataset.v==='amp'){ ampListDevices(); }
  if(b.dataset.v==='mic'){ micLabels(); if(micOn) micListDevices(); }
  if(b.dataset.v==='out'){ outWrite(); if(!outRAF) outDraw(); }
  a11yPass($('v-'+b.dataset.v));
  // a tab switch is a natural pause, and evaluating here bounds how often a
  // suggestion can appear at all — defined further down, so guard the boot pass
  try{ coachRefresh(); }catch(e){}
}));

/* ---------------- sampler ---------------- */
let workBuf=null, slices=[];   // slices = [{s,e} normalized]

function decode(ab){
  return new Promise((res,rej)=>{
    let done=false;
    const ok=b=>{ if(!done){done=true;res(b);} }, bad=e=>{ if(!done){done=true;rej(e||new Error('decode failed'));} };
    try{
      const p=AC.decodeAudioData(ab,ok,bad);   // callback form works everywhere
      if(p && p.then) p.then(ok,bad);          // promise form where supported
    }catch(e){ bad(e); }
  });
}

$('btnFreeSounds').addEventListener('click',()=>{
  const bar=$('freeSoundsBar'); const show=bar.style.display==='none';
  bar.style.display=show?'block':'none'; $('btnFreeSounds').classList.toggle('on',show);
  if(show) lcd('FREE SOUNDS — grab CC0 sounds from Pixabay/Freesound, then IMPORT FILE (multi-select fills empty pads).');
});
const AUDIO_RE=/\.(wav|mp3|ogg|oga|m4a|aac|flac|aif|aiff|caf|opus)$/i;
/* Minimal in-app ZIP reader (central-directory based) so a downloaded pack of
   sounds imports without the user having to unpack it first. Deflate via the
   built-in DecompressionStream (iOS 16.4+ / modern browsers). */
async function unzipEntries(ab){
  const dv=new DataView(ab), u8=new Uint8Array(ab), N=ab.byteLength;
  let eocd=-1; const lim=Math.max(0,N-22-65536);
  for(let i=N-22;i>=lim;i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error('not a zip');
  const count=dv.getUint16(eocd+10,true); let p=dv.getUint32(eocd+16,true);
  const dec=new TextDecoder(), out=[];
  for(let n=0;n<count && p+46<=N;n++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), compSize=dv.getUint32(p+20,true),
      nameLen=dv.getUint16(p+28,true), extraLen=dv.getUint16(p+30,true), commLen=dv.getUint16(p+32,true), lho=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nameLen));
    p+=46+nameLen+extraLen+commLen;
    if(name.endsWith('/') || name.indexOf('__MACOSX')>=0 || !AUDIO_RE.test(name)) continue;
    const lNameLen=dv.getUint16(lho+26,true), lExtraLen=dv.getUint16(lho+28,true);
    const start=lho+30+lNameLen+lExtraLen, comp=u8.subarray(start,start+compSize);
    let data;
    if(method===0){ data=comp.slice().buffer; }
    else if(method===8){
      if(typeof DecompressionStream==='undefined') throw new Error('this browser can’t unzip — update iOS/Safari, or unpack it on your device');
      data=await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    } else continue;
    out.push({name,ab:data});
  }
  return out;
}
function looksZip(ab){ const u=new Uint8Array(ab); return u.length>3 && u[0]===0x50 && u[1]===0x4b && (u[2]===3||u[2]===5||u[2]===7); }
async function expandItems(items){   // unpack any zips into their audio entries
  const out=[];
  for(const it of items){
    if(looksZip(it.ab) || /\.zip$/i.test(it.name||'')){
      let entries; try{ entries=await unzipEntries(it.ab); }catch(err){ lcd('Couldn’t unpack '+(it.name||'zip')+' — '+(err.message||'try unzipping on your device')); continue; }
      if(!entries.length) lcd('No audio files found inside '+(it.name||'the zip')+'.');
      out.push(...entries);
    } else out.push(it);
  }
  return out;
}
async function importItems(items){   // items:[{name,ab}] → decode each onto consecutive pads from the target
  if(!items.length) return;
  ensureAudio();
  let cur=S.editPad, ok=0, fail=0, full=false, landed=[], first=true;
  for(let k=0;k<items.length;k++){
    const it=items[k];
    lcd('DECODING '+(k+1)+'/'+items.length+' · '+(it.name||'sound')+' …');
    let buf; try{ buf=await decode(it.ab.slice(0)); }catch(err){ fail++; continue; }
    if(!first){
      let t=-1; for(let off=1;off<=NPADS;off++){ const i=(cur+off)%NPADS; if(S.pads[i].bufId<0){ t=i; break; } }
      if(t<0){ full=true; break; } S.editPad=t;
    }
    loadIntoTarget(buf, (it.name||'sample').replace(/^.*[\/\\]/,'').replace(/\.[^.]+$/,''));
    landed.push(padName(S.editPad)); cur=S.editPad; first=false; ok++;
  }
  drawPads();
  if(ok===1 && !fail && !full) return;   // loadIntoTarget already showed a nice message
  lcd('IMPORTED '+ok+' sound'+(ok!==1?'s':'')+(landed.length?' → '+landed.join(', '):'')+(fail?' · '+fail+' skipped (not audio)':'')+(full?' · pads full — clear some for more':''));
}
$('btnImport').addEventListener('click',()=>{ ensureAudio(); $('fileIn').value=''; $('fileIn').click(); });
$('fileIn').addEventListener('change',async e=>{
  const files=e.target.files ? Array.from(e.target.files) : []; if(!files.length) return;
  ensureAudio();
  const items=[]; for(const f of files) items.push({name:f.name, ab:await f.arrayBuffer()});
  await importItems(await expandItems(items));
});
$('btnPasteUrl').addEventListener('click',async ()=>{
  // iOS long-press paste is finicky; one-tap read from the clipboard is reliable
  try{
    const t=(await navigator.clipboard.readText()||'').trim();
    if(t){ $('importUrl').value=t; lcd('Pasted — tap GO to import.'); }
    else{ $('importUrl').focus(); lcd('Clipboard empty. Copy a direct file link first (or long-press the box → Paste).'); }
  }catch(e){ $('importUrl').focus(); lcd('Couldn’t read the clipboard — long-press the box and tap Paste, then GO.'); }
});
$('btnImportUrl').addEventListener('click',async ()=>{
  let url=($('importUrl').value||'').trim(); if(!url){ lcd('Paste a direct link to a .wav / .mp3 / .zip file first.'); return; }
  if(!/^https?:\/\//i.test(url)) url='https://'+url;
  ensureAudio();
  lcd('FETCHING '+url.replace(/^https?:\/\//,'').slice(0,44)+' …');
  try{
    const res=await fetch(url,{mode:'cors'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const ab=await res.arrayBuffer();
    const items=await expandItems([{name:(url.split('?')[0].split('/').pop()||'sound'), ab}]);
    if(!items.length){ lcd('That link had no importable audio.'); return; }
    await importItems(items);
    $('importUrl').value='';
  }catch(err){
    lcd('Couldn’t fetch that link — '+((err&&err.message)||'blocked')+'. Many sites (incl. Pixabay) block direct fetch; download the file and use IMPORT FILE instead.');
  }
});

function loadIntoTarget(buf,name){
  try{ stopPadVoices(S.editPad); }catch(e){}
  workBuf=buf; slices=[]; selSlice=-1;
  S.buffers.push(buf);
  const bid=S.buffers.length-1;
  const p=S.pads[S.editPad];
  p.bufId=bid; p.start=0; p.end=1; p.name=name.slice(0,14); p.warped=false;
  delete warpOrig[S.editPad]; delete p.srcPreset; delete p.srcNote;
  drawPads(); drawEdit(); drawWave(); drawMixer(); dirty();
  lcd('LOADED → '+padName(S.editPad)+' · '+buf.duration.toFixed(2)+'s');
}

/* mic — specific error handling (incl. Lockdown Mode hypothesis) */
let mediaRec=null, micStream=null, micRAF=0, micBusy=false, meterCtx=null;
$('btnMic').addEventListener('click',async ()=>{
  if(mediaRec && mediaRec.state==='recording'){ mediaRec.stop(); return; }
  ensureAudio();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    lcd('MIC: getUserMedia unavailable. If Lockdown Mode is on, media APIs may be disabled.'); return;
  }
  micBusy=true;   // hold the watchdog off — iOS reconfigures the session around getUserMedia
  // preflight: a remembered 'deny' means iOS never shows the prompt again —
  // surface that instead of failing mutely
  try{
    if(navigator.permissions && navigator.permissions.query){
      const st=await navigator.permissions.query({name:'microphone'});
      if(st.state==='denied'){
        micBusy=false;
        lcd('MIC BLOCKED for this site — Safari: tap aA in the address bar → Website Settings → Microphone → Allow.');
        return;
      }
    }
  }catch(e){}
  // a 'playback' session category forbids capture on iOS — the mic track arrives
  // dead and MediaRecorder.start() throws InvalidStateError. Ask for record rights first.
  try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record'; }catch(e){}
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}});
  }catch(err){
    micBusy=false;
    const n=err && err.name;
    if(n==='NotAllowedError') lcd('MIC DENIED — Safari: aA menu → Website Settings → Microphone → Allow. Or iOS Settings → Safari → Microphone.');
    else if(n==='NotFoundError') lcd('MIC: no microphone found on this device.');
    else if(n==='NotReadableError') lcd('MIC BUSY — another app may be holding the microphone.');
    else if(n==='SecurityError') lcd('MIC BLOCKED by browser security. If Lockdown Mode is enabled, mic capture may be disabled.');
    else lcd('MIC ERROR: '+(n||'unknown'));
    return;
  }
  const chunks=[];
  try{ mediaRec=new MediaRecorder(micStream); }
  catch(e){ micBusy=false; lcd('MediaRecorder unavailable in this browser.'); stopMicStream(); return; }
  mediaRec.ondataavailable=ev=>{ if(ev.data && ev.data.size) chunks.push(ev.data); };
  mediaRec.onstop=async ()=>{
    stopMicStream();
    micBusy=false;
    resumeSession();   // mic capture flips iOS to play-and-record — reclaim the playback route first
    $('btnMic').classList.remove('on'); $('btnMic').textContent='REC MIC';
    if(!chunks.length){ lcd('NOTHING CAPTURED — recording too short?'); return; }
    lcd('DECODING RECORDING …');
    try{
      const blob=new Blob(chunks,{type:mediaRec.mimeType||'audio/mp4'});
      const ab=await blob.arrayBuffer();
      const buf=await decode(ab);
      loadIntoTarget(buf,'mic-'+new Date().toISOString().slice(11,19).replace(/:/g,''));
    }catch(e){ lcd('RECORDING DECODE FAILED.'); }
  };
  try{ mediaRec.start(); }
  catch(e){
    micBusy=false; stopMicStream(); mediaRec=null;
    resumeSession();
    lcd('MIC ARM FAILED ('+(e.name||'error')+') — close other audio apps, then retry.');
    return;
  }
  $('btnMic').classList.add('on'); $('btnMic').textContent='STOP';
  lcd('RECORDING… tap STOP to capture into '+padName(S.editPad));
  meterMic();
});
function stopMicStream(){
  cancelAnimationFrame(micRAF);
  const bar=$('miclvl').firstElementChild; bar.style.width='0%';
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
  if(meterCtx){ try{ meterCtx.close(); }catch(e){} meterCtx=null; }
}
function meterMic(){ // level meter is cosmetic — never let it break the recording
  if(!micStream || !AC) return;
  let ctx=AC, src=null;
  try{ src=ctx.createMediaStreamSource(micStream); }
  catch(e){
    // WebKit: InvalidStateError when the mic stream's hardware rate (48k)
    // differs from the context rate (44.1k). Meter via a throwaway context
    // created NOW, which adopts the current hardware rate.
    try{
      const Ctor=window.AudioContext||window.webkitAudioContext;
      meterCtx=new Ctor(); ctx=meterCtx;
      src=ctx.createMediaStreamSource(micStream);
    }catch(e2){ return; }
  }
  const an=ctx.createAnalyser(); an.fftSize=512; src.connect(an);
  const data=new Uint8Array(an.fftSize);
  const bar=$('miclvl').firstElementChild;
  (function loop(){
    if(!micStream) return;
    an.getByteTimeDomainData(data);
    let mx=0; for(let i=0;i<data.length;i++){ const d=Math.abs(data[i]-128); if(d>mx) mx=d; }
    bar.style.width=Math.min(100,mx/1.28)+'%';
    micRAF=requestAnimationFrame(loop);
  })();
}

/* waveform + chop */
let selSlice=-1, lastTapNorm=0, zeroSnap=true;

function zeroCross(norm){ // snap a normalized position to nearest zero crossing within 20ms
  if(!workBuf) return norm;
  const d=workBuf.getChannelData(0), n=d.length;
  const c=Math.floor(norm*n), w=Math.floor(workBuf.sampleRate*0.02);
  for(let o=0;o<w;o++){
    const a=c+o, b=c-o;
    if(a+1<n && d[a]<=0!==d[a+1]<=0) return a/n;
    if(b>0 && d[b-1]<=0!==d[b]<=0) return b/n;
  }
  return norm;
}
function drawWave(){
  try{ pvInfo(); }catch(e){}
  const cv=$('wave'), {cx,W,H}=fitCanvas(cv);
  cx.fillStyle='#120d04'; cx.fillRect(0,0,W,H);
  if(!workBuf){ cx.fillStyle='#8a6530'; cx.font='20px ui-monospace'; cx.fillText('NO SAMPLE — import or record',20,H/2); return; }
  const mid=H/2;
  // selected slice highlight behind waveform
  if(selSlice>=0 && slices[selSlice]){
    const sl=slices[selSlice];
    cx.fillStyle='rgba(255,140,46,0.18)';
    cx.fillRect(sl.s*W,0,(sl.e-sl.s)*W,H);
  }
  const d=workBuf.getChannelData(0);
  cx.strokeStyle='#ffb454'; cx.beginPath();
  const spp=Math.max(1,Math.floor(d.length/W));
  for(let x=0;x<W;x++){
    let mn=1,mx=-1;
    const o=x*spp, e=Math.min(d.length,o+spp);
    for(let i=o;i<e;i++){ const v=d[i]; if(v<mn)mn=v; if(v>mx)mx=v; }
    cx.moveTo(x,mid+mn*mid*0.92); cx.lineTo(x,mid+mx*mid*0.92);
  }
  cx.stroke();
  cx.strokeStyle='#63c76a';
  slices.forEach((sl,i)=>{
    const x=sl.s*W;
    cx.lineWidth=(i===selSlice)?3:1;
    cx.beginPath(); cx.moveTo(x,0); cx.lineTo(x,H); cx.stroke();
  });
  cx.lineWidth=1;
  // SCULPT: show the gain curve over the wave (and a preview of the result)
  if(shapeMode || shapeTouched){
    const gy=g=>H-(g/SHAPE_MAX)*H;   // top = SHAPE_MAX, middle = 1.0
    if(shapeTouched){                 // ghost of what APPLY will produce
      cx.strokeStyle='rgba(99,199,106,0.55)'; cx.beginPath();
      for(let x=0;x<W;x++){
        let mn=1,mx=-1; const o=x*spp, e=Math.min(d.length,o+spp);
        for(let i=o;i<e;i++){ const v=d[i]; if(v<mn)mn=v; if(v>mx)mx=v; }
        const g=shapeAt(x/W);
        cx.moveTo(x,mid+clamp(mn*g,-1,1)*mid*0.92); cx.lineTo(x,mid+clamp(mx*g,-1,1)*mid*0.92);
      }
      cx.stroke();
    }
    cx.strokeStyle='rgba(255,255,255,0.22)'; cx.beginPath();   // unity (1.0) reference
    cx.moveTo(0,gy(1)); cx.lineTo(W,gy(1)); cx.stroke();
    cx.strokeStyle=shapeMode?'#4aa3ff':'rgba(74,163,255,0.6)'; cx.lineWidth=2; cx.beginPath();
    for(let x=0;x<W;x++){ const y=gy(shapeAt(x/W)); if(x===0) cx.moveTo(x,y); else cx.lineTo(x,y); }
    cx.stroke(); cx.lineWidth=1;
    if(shapeMode){ cx.fillStyle='#4aa3ff'; cx.font='16px ui-monospace'; cx.fillText('DRAW GAIN',10,22); }
  }
  $('selInfo').textContent = selSlice>=0 && slices[selSlice]
    ? (selSlice+1)+'/'+slices.length+' · '+((slices[selSlice].e-slices[selSlice].s)*workBuf.duration).toFixed(2)+'s' : '—';
  try{ shapeLenInfo(); }catch(e){}
}
function auditionRegion(s,e){
  if(!workBuf) return;
  ensureAudio();
  const src=AC.createBufferSource(); src.buffer=workBuf;
  const gn=AC.createGain(); gn.gain.value=0.9;
  src.connect(gn); gn.connect(LIVE.master);
  const off=s*workBuf.duration, dur=Math.max(0.01,(e-s)*workBuf.duration);
  src.start(AC.currentTime,off,dur);
  src.onended=()=>{ try{src.disconnect();gn.disconnect();}catch(err){} };
}
function waveTap(clientX){
  const cv=$('wave'), r=cv.getBoundingClientRect();
  lastTapNorm=clamp((clientX-r.left)/r.width,0,1);
  if(slices.length){
    selSlice=slices.findIndex(sl=>lastTapNorm>=sl.s && lastTapNorm<sl.e);
    if(selSlice>=0) auditionRegion(slices[selSlice].s, slices[selSlice].e);
  }else{
    auditionRegion(lastTapNorm,1);
  }
  drawWave();
}
/* ---------------- SCULPT — reshape the sample on the waveform ----------------
   DRAW GAIN: drag across the wave to draw a volume curve (SHAPE_N control
   points, 1.0 = unchanged, top of the display = SHAPE_MAX). Nothing is
   destructive until APPLY, which bakes the curve into a NEW buffer on the pad
   (so undo still works). TAME PEAKS computes a smoothed peak envelope and
   pulls only the loud parts down. LENGTH stretches/shrinks with pitch
   preserved, reusing the WARP granular engine. */
const SHAPE_N=192, SHAPE_MAX=2.0;
let shapeMode=false, shapeCurve=null, shapeDrag=false, shapeTouched=false;
function shapeReset(){ shapeCurve=new Float32Array(SHAPE_N).fill(1); shapeTouched=false; }
shapeReset();
function shapeAt(norm){   // interpolated gain at a normalized position
  if(!shapeCurve) return 1;
  const x=clamp(norm,0,1)*(SHAPE_N-1), i=Math.floor(x), f=x-i;
  const a=shapeCurve[i], b=shapeCurve[Math.min(SHAPE_N-1,i+1)];
  return a+(b-a)*f;
}
function shapePaint(clientX,clientY){
  const cv=$('wave'), r=cv.getBoundingClientRect();
  const nx=clamp((clientX-r.left)/r.width,0,1);
  const ny=clamp((clientY-r.top)/r.height,0,1);
  // top of the canvas = SHAPE_MAX, middle = 1.0, bottom = 0
  const g=clamp((1-ny)*SHAPE_MAX,0,SHAPE_MAX);
  const i=Math.round(nx*(SHAPE_N-1));
  const w=3;   // brush width so a finger drag paints smoothly
  for(let k=-w;k<=w;k++){
    const j=i+k; if(j<0||j>=SHAPE_N) continue;
    const t=1-Math.abs(k)/(w+1);
    shapeCurve[j]=shapeCurve[j]*(1-t)+g*t;
  }
  shapeTouched=true;
  drawWave();
}
function shapeSummary(){
  if(!shapeTouched) return 'curve flat — drag on the wave to shape it';
  let lo=99,hi=0; for(let i=0;i<SHAPE_N;i++){ lo=Math.min(lo,shapeCurve[i]); hi=Math.max(hi,shapeCurve[i]); }
  return 'curve '+lo.toFixed(2)+'× … '+hi.toFixed(2)+'× — tap APPLY to bake it in';
}
$('btnShape').addEventListener('click',()=>{
  shapeMode=!shapeMode;
  $('btnShape').classList.toggle('on',shapeMode);
  drawWave();
  lcd(shapeMode?'DRAW GAIN ON — drag across the wave. Above the middle = louder, below = quieter.':'DRAW GAIN OFF — tapping the wave auditions slices again.');
});
$('btnShapeFlat').addEventListener('click',()=>{ shapeReset(); drawWave(); lcd('CURVE RESET — flat (no change).'); });
$('btnShapeApply').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  if(!shapeTouched){ lcd('Nothing to apply — draw a curve first (or use TAME PEAKS).'); return; }
  const nch=workBuf.numberOfChannels, n=workBuf.length;
  const nb=mkAudioBuf(n,workBuf.sampleRate,nch);
  for(let c=0;c<nch;c++){
    const src=workBuf.getChannelData(c), dst=nb.getChannelData(c);
    for(let i=0;i<n;i++) dst[i]=clamp(src[i]*shapeAt(i/n),-1,1);
  }
  S.buffers.push(nb);
  const p=S.pads[S.editPad];
  p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.warped=false;
  delete warpOrig[S.editPad];
  workBuf=nb; slices=[]; selSlice=-1; shapeReset();
  drawPads(); drawEdit(); drawWave(); dirty();
  lcd('SHAPE APPLIED → '+padName(S.editPad)+' (UNDO restores the original).');
});
$('btnTame').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  // build a gain curve that pulls only the loud parts down toward the average
  const d=workBuf.getChannelData(0), n=d.length, seg=Math.max(1,Math.floor(n/SHAPE_N));
  const env=new Float32Array(SHAPE_N);
  for(let i=0;i<SHAPE_N;i++){
    let pk=0; const o=i*seg, e=Math.min(n,o+seg);
    for(let k=o;k<e;k++){ const a=Math.abs(d[k]); if(a>pk) pk=a; }
    env[i]=pk;
  }
  let mx=0; for(let i=0;i<SHAPE_N;i++) mx=Math.max(mx,env[i]);
  if(mx<1e-5){ lcd('SILENT SAMPLE — nothing to tame.'); return; }
  // Level toward a target instead of only cutting the loud bits: pulling the
  // peaks down ALONE drops the average more than the peak, which makes the
  // sample less even, not more. Aiming every audible part at the target (at a
  // partial ratio) brings peaks down AND quiet parts up.
  const target=mx*0.6, floor=mx*0.06, ratio=0.7;
  // widen the loud regions first so a burst's EDGES get reduced too — otherwise
  // smoothing leaves them at full level and the peak just moves to the edge.
  const wide=new Float32Array(SHAPE_N);
  for(let i=0;i<SHAPE_N;i++){
    let pk=0; for(let k=-4;k<=4;k++){ const j=i+k; if(j>=0&&j<SHAPE_N) pk=Math.max(pk,env[j]); }
    wide[i]=pk;
  }
  const raw=new Float32Array(SHAPE_N);
  for(let i=0;i<SHAPE_N;i++)
    raw[i]= wide[i]>floor ? clamp(Math.pow(target/wide[i],ratio),0.25,2.5) : 1;
  // smooth so the move glides instead of stepping
  for(let i=0;i<SHAPE_N;i++){
    let s=0,w=0;
    for(let k=-6;k<=6;k++){ const j=i+k; if(j<0||j>=SHAPE_N) continue; const t=1-Math.abs(k)/7; s+=raw[j]*t; w+=t; }
    shapeCurve[i]=s/w;
  }
  shapeTouched=true; drawWave();
  let lo=9,hi=0; for(let i=0;i<SHAPE_N;i++){ lo=Math.min(lo,shapeCurve[i]); hi=Math.max(hi,shapeCurve[i]); }
  lcd('PEAKS TAMED — loud parts to '+Math.round(lo*100)+'%, quiet parts to '+Math.round(hi*100)+'%. Preview, then APPLY (NORMALIZE after to bring it back up).');
});
function shapeLenInfo(){
  const r=parseFloat($('shapeLen').value)||1;
  $('shapeLenV').textContent=r.toFixed(2)+'×';
  $('shapeLenInfo').textContent = workBuf
    ? workBuf.duration.toFixed(2)+'s → '+(workBuf.duration*r).toFixed(2)+'s (pitch stays the same)'
    : 'load a sample first';
}
$('shapeLen').addEventListener('input',shapeLenInfo);
$('btnLenHalf').addEventListener('click',()=>{ $('shapeLen').value=clamp((parseFloat($('shapeLen').value)||1)/2,0.25,4); shapeLenInfo(); });
$('btnLenDbl').addEventListener('click',()=>{ $('shapeLen').value=clamp((parseFloat($('shapeLen').value)||1)*2,0.25,4); shapeLenInfo(); });
$('btnLenApply').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  const r=clamp(parseFloat($('shapeLen').value)||1,0.25,4);
  if(Math.abs(r-1)<0.01){ lcd('LENGTH is 1.00× — move the slider first.'); return; }
  const before=workBuf.duration;
  lcd('STRETCHING '+before.toFixed(2)+'s → '+(before*r).toFixed(2)+'s …');
  setTimeout(()=>{
    try{
      const out=timeStretch(workBuf,r);
      S.buffers.push(out);
      const p=S.pads[S.editPad];
      p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.warped=false;
      delete warpOrig[S.editPad];
      workBuf=out; slices=[]; selSlice=-1; shapeReset();
      $('shapeLen').value=1;
      drawPads(); drawEdit(); drawWave(); shapeLenInfo(); pvInfo(); dirty();
      lcd((r<1?'SHRUNK':'STRETCHED')+' '+before.toFixed(2)+'s → '+out.duration.toFixed(2)+'s · pitch unchanged (UNDO restores).');
    }catch(err){ lcd('STRETCH FAILED: '+(err.message||'error')); }
  },30);
});

/* ---------------- PRE-VERB — reverse reverb -----------------------------------
   A reverb tail decays away from a hit. Reverse the sound, send THAT through the
   reverb, and reverse the result: the tail now runs backwards into the hit, so
   the sample grows a swell at the FRONT that arrives exactly on the transient.

   Everything is rendered offline through the same makeIR() family the mixer
   uses, so a PLATE pre-verb has the same character as PLATE on the send. The
   wash is peak-normalised against the source before AMOUNT is applied — a
   convolution's output level depends on the material, and without that step the
   same AMOUNT would be inaudible on one sample and deafening on the next. ---- */
function reverseCopy(buf){
  const n=buf.length, nch=buf.numberOfChannels, out=mkAudioBuf(n,buf.sampleRate,nch);
  for(let c=0;c<nch;c++){
    const src=buf.getChannelData(c), dst=out.getChannelData(c);
    for(let i=0;i<n;i++) dst[i]=src[n-1-i];
  }
  return out;
}
function balanceGains(buf, a, z){   // per-channel gains that equalise RMS over [a,z)
  const nch=buf.numberOfChannels, g=new Array(nch).fill(1);
  if(nch<2) return g;
  const rms=[];
  for(let c=0;c<nch;c++){ const d=buf.getChannelData(c); let e=0, n=0;
    for(let i=a;i<z && i<d.length;i++){ e+=d[i]*d[i]; n++; }
    rms.push(n?Math.sqrt(e/n):0); }
  const mean=rms.reduce((x,y)=>x+y,0)/nch;
  if(mean<1e-9) return g;
  for(let c=0;c<nch;c++) g[c]= rms[c]>1e-9 ? clamp(mean/rms[c],0.5,2) : 1;
  return g;
}
function bufPeak(buf){
  let pk=0;
  for(let c=0;c<buf.numberOfChannels;c++){ const d=buf.getChannelData(c);
    for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; } }
  return pk;
}
async function convolveOffline(src, len, type){   // src → 100% wet, tail included
  const sr=src.sampleRate;
  // size the render from the IR's REAL length, not the one asked for: CATHEDRAL
  // has a 4.5s floor and would otherwise be cut off mid-tail.
  const d=irDur(len,type);
  const oc=new OfflineAudioContext(2, Math.ceil((src.duration+d+0.05)*sr), sr);
  const ir=makeIR(oc,len,type);
  const s=oc.createBufferSource(); s.buffer=src;
  const cv=oc.createConvolver(); cv.normalize=true; cv.buffer=ir;
  s.connect(cv); cv.connect(oc.destination);
  s.start(0);
  return { wet: await oc.startRendering(), irDur: ir.duration };
}
const PV_MAX=30;   // seconds — a runaway CATHEDRAL on a long take is not a sample
async function preVerb(src, opt){
  const sr=src.sampleRate, mode=opt.mode||'pre', mix=clamp(opt.mix,0,2);
  const srcPk=bufPeak(src);
  if(srcPk<1e-5) throw new Error('the sample is silent');

  // 1) reverse → reverb → reverse. The tail that was AFTER the sound is now before it.
  const back=await convolveOffline(reverseCopy(src), opt.len, opt.type);
  const swell=reverseCopy(back.wet);
  const wn=Math.min(swell.length, Math.max(1,Math.round(back.irDur*sr)));   // the wash is the part ahead of the sound

  // 2) centre it. The IR's two channels are decorrelated noise, so a short or
  //    narrowband source can excite one side several dB harder than the other —
  //    fine under a dry hit, but as a bare swell it reads as lopsided. Match the
  //    channel RMS (the waveforms stay decorrelated, so the width survives).
  const wBal=balanceGains(swell,0,wn);

  // 3) level the wash against the source so AMOUNT means the same thing every time
  let wpk=0;
  for(let c=0;c<swell.numberOfChannels;c++){ const d=swell.getChannelData(c);
    for(let i=0;i<wn;i++){ const a=Math.abs(d[i])*wBal[c]; if(a>wpk) wpk=a; } }
  const wg = wpk>1e-6 ? (srcPk*mix)/wpk : 0;

  // 4) an optional forward bloom for BOOMERANG, balanced the same way
  let fwd=null, fn=0, fg=0, fBal=[1,1];
  if(mode==='boom'){
    const f=await convolveOffline(src, opt.len, opt.type);
    fwd=f.wet; fn=fwd.length;
    fBal=balanceGains(fwd,0,fn);
    let fpk=0;
    for(let c=0;c<fwd.numberOfChannels;c++){ const d=fwd.getChannelData(c);
      for(let i=0;i<fn;i++){ const a=Math.abs(d[i])*fBal[c]; if(a>fpk) fpk=a; } }
    fg = fpk>1e-6 ? (srcPk*mix)/fpk : 0;
  }

  // 5) lay it out: [wash][dry (+bloom)]
  const nch=Math.max(1,Math.min(2,Math.max(src.numberOfChannels, swell.numberOfChannels)));
  const dryN = mode==='only' ? 0 : src.length;
  const total = Math.min(Math.ceil(PV_MAX*sr), wn + Math.max(dryN, fn));
  const out=mkAudioBuf(Math.max(64,total), sr, nch);
  const chOf=(b,c)=>b.getChannelData(Math.min(c,b.numberOfChannels-1));
  for(let c=0;c<nch;c++){
    const d=out.getChannelData(c), w=chOf(swell,c);
    const wgc=wg*wBal[c];
    for(let i=0;i<wn && i<total;i++) d[i]=w[i]*wgc;
    if(mode!=='only'){
      const y=chOf(src,c);
      for(let i=0;i<src.length && wn+i<total;i++) d[wn+i]+=y[i];
      if(fwd){ const f=chOf(fwd,c), fgc=fg*fBal[c];
        for(let i=0;i<fn && wn+i<total;i++) d[wn+i]+=f[i]*fgc; }
    }
  }
  // 6) a short fade at each end, and only pull down if we actually clipped
  const fade=Math.min(Math.floor(sr*0.004), Math.floor(out.length/8));
  let pk=bufPeak(out);
  const k = pk>0.99 ? 0.99/pk : 1;
  for(let c=0;c<nch;c++){
    const d=out.getChannelData(c);
    if(k!==1) for(let i=0;i<d.length;i++) d[i]*=k;
    for(let i=0;i<fade;i++){ d[i]*=i/fade; d[d.length-1-i]*=i/fade; }
  }
  return { buf:out, washSec:wn/sr, gain:k };
}
function pvSource(){        // whole sample, or the chop slice you have selected
  if($('pvSrc').value==='slice' && selSlice>=0 && slices[selSlice]){
    const sl=slices[selSlice], sr=workBuf.sampleRate;
    const a=Math.floor(sl.s*workBuf.length), b=Math.floor(sl.e*workBuf.length);
    const nb=mkAudioBuf(Math.max(64,b-a),sr,workBuf.numberOfChannels);
    for(let c=0;c<workBuf.numberOfChannels;c++) nb.copyToChannel(workBuf.getChannelData(c).subarray(a,b),c);
    return nb;
  }
  return workBuf;
}
function pvInfo(){
  const el=$('pvInfo'); if(!el) return;
  if(!workBuf){ el.textContent='load a sample first'; return; }
  const src=(($('pvSrc').value==='slice' && selSlice>=0 && slices[selSlice]) ? slices[selSlice] : null);
  const dur=src ? (slices[selSlice].e-slices[selSlice].s)*workBuf.duration : workBuf.duration;
  const len=irDur(+$('pvLen').value, $('pvType').value), mode=$('pvMode').value;
  const outDur = mode==='only' ? len : (mode==='boom' ? len+dur+len : len+dur);
  el.textContent=dur.toFixed(2)+'s → '+Math.min(PV_MAX,outDur).toFixed(2)+'s · '+len.toFixed(2)+'s swell'+(src?' · slice '+(selSlice+1):'');
}
['pvLen','pvMix'].forEach(id=>$(id).addEventListener('input',()=>{
  $('pvLenV').textContent=(+$('pvLen').value).toFixed(2)+'s';
  $('pvMixV').textContent=Math.round(+$('pvMix').value*100)+'%';
  pvInfo();
}));
['pvMode','pvType','pvSrc'].forEach(id=>$(id).addEventListener('change',pvInfo));
let pvBusy=false;
$('btnPreverb').addEventListener('click',async ()=>{
  if(pvBusy) return;
  if(!workBuf){ lcd('NO SAMPLE — load one into the editor first.'); return; }
  const opt={ mode:$('pvMode').value, type:$('pvType').value,
              len:clamp(parseFloat($('pvLen').value)||1.5,0.2,4),
              mix:clamp(parseFloat($('pvMix').value)||0.85,0.05,1.5) };
  pvBusy=true; $('btnPreverb').disabled=true;
  lcd('RENDERING PRE-VERB · '+opt.type.toUpperCase()+' '+opt.len.toFixed(2)+'s …');
  try{
    const src=pvSource();
    const r=await preVerb(src,opt);
    S.buffers.push(r.buf);
    const pd=S.pads[S.editPad];
    pd.bufId=S.buffers.length-1; pd.start=0; pd.end=1; pd.warped=false;
    delete warpOrig[S.editPad];
    workBuf=r.buf; slices=[]; selSlice=-1; shapeReset();
    drawPads(); drawEdit(); drawWave(); pvInfo(); dirty();
    const label={pre:'PRE-VERB',only:'SWELL',boom:'BOOMERANG'}[opt.mode];
    lcd(label+' → '+padName(S.editPad)+' · '+r.washSec.toFixed(2)+'s of swell ahead of the hit'+(r.gain<1?' (trimmed '+Math.round((1-r.gain)*100)+'% to stop clipping)':'')+' · UNDO restores.');
    plog('PRE-VERB: '+opt.mode+' / '+opt.type+' / '+opt.len.toFixed(2)+'s / '+Math.round(opt.mix*100)+'% → '+r.buf.duration.toFixed(2)+'s on '+padName(S.editPad)+'.');
  }catch(err){ lcd('PRE-VERB FAILED: '+(err.message||'error')); }
  finally{ pvBusy=false; $('btnPreverb').disabled=false; }
});

$('wave').addEventListener('touchstart',e=>{ e.preventDefault();
  const t=e.changedTouches[0];
  if(shapeMode){ shapeDrag=true; shapePaint(t.clientX,t.clientY); return; }
  waveTap(t.clientX); },{passive:false});
$('wave').addEventListener('touchmove',e=>{ if(!shapeMode||!shapeDrag) return; e.preventDefault();
  const t=e.changedTouches[0]; shapePaint(t.clientX,t.clientY); },{passive:false});
$('wave').addEventListener('touchend',()=>{ if(shapeDrag){ shapeDrag=false; lcd(shapeSummary()); } });
$('wave').addEventListener('mousedown',e=>{
  if(shapeMode){ shapeDrag=true; shapePaint(e.clientX,e.clientY); return; }
  waveTap(e.clientX); });
$('wave').addEventListener('mousemove',e=>{ if(shapeMode&&shapeDrag) shapePaint(e.clientX,e.clientY); });
window.addEventListener('mouseup',()=>{ if(shapeDrag){ shapeDrag=false; lcd(shapeSummary()); } });

$('btnPrev').addEventListener('click',()=>auditionRegion(0,1));
$('btnZero').addEventListener('click',()=>{ zeroSnap=!zeroSnap; $('btnZero').classList.toggle('on',zeroSnap); });
$('btnSplit').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  let pos=zeroSnap? zeroCross(lastTapNorm) : lastTapNorm;
  if(!slices.length){ slices=[{s:0,e:pos},{s:pos,e:1}]; selSlice=0; drawWave(); return; }
  const i=slices.findIndex(sl=>pos>sl.s+0.001 && pos<sl.e-0.001);
  if(i<0){ lcd('TAP INSIDE A SLICE FIRST.'); return; }
  const sl=slices[i];
  slices.splice(i,1,{s:sl.s,e:pos},{s:pos,e:sl.e});
  selSlice=i; drawWave(); lcd('SPLIT → '+slices.length+' slices');
});
$('btnMerge').addEventListener('click',()=>{
  if(selSlice<0 || selSlice>=slices.length-1){ lcd('SELECT A SLICE (not the last).'); return; }
  slices[selSlice].e=slices[selSlice+1].e;
  slices.splice(selSlice+1,1);
  drawWave(); lcd('MERGED → '+slices.length+' slices');
});
function nudge(which,dir){
  if(selSlice<0 || !workBuf){ lcd('SELECT A SLICE.'); return; }
  const step=0.010/workBuf.duration*dir;   // 10ms
  const sl=slices[selSlice];
  if(which==='s'){
    let v=clamp(sl.s+step, selSlice>0?slices[selSlice-1].s+0.001:0, sl.e-0.002);
    if(zeroSnap) v=zeroCross(v);
    sl.s=v; if(selSlice>0) slices[selSlice-1].e=v;   // keep slices contiguous
  }else{
    let v=clamp(sl.e+step, sl.s+0.002, selSlice<slices.length-1?slices[selSlice+1].e-0.001:1);
    if(zeroSnap) v=zeroCross(v);
    sl.e=v; if(selSlice<slices.length-1) slices[selSlice+1].s=v;
  }
  drawWave(); auditionRegion(sl.s,sl.e);
}
$('btnSm').addEventListener('click',()=>nudge('s',-1));
$('btnSp').addEventListener('click',()=>nudge('s',1));
$('btnEm').addEventListener('click',()=>nudge('e',-1));
$('btnEp').addEventListener('click',()=>nudge('e',1));

$('btnNorm').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  let peak=0;
  for(let c=0;c<workBuf.numberOfChannels;c++){
    const d=workBuf.getChannelData(c);
    for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>peak) peak=a; }
  }
  if(peak<1e-5){ lcd('SILENT SAMPLE.'); return; }
  const k=0.99/peak;
  for(let c=0;c<workBuf.numberOfChannels;c++){
    const d=workBuf.getChannelData(c);
    for(let i=0;i<d.length;i++) d[i]*=k;
  }
  const bid=S.buffers.indexOf(workBuf);
  if(bid>=0) delete revCache[bid];   // reversed copies now stale
  drawWave(); dirty(); lcd('NORMALIZED ×'+k.toFixed(2));
});
$('btnTrim').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE.'); return; }
  const th=0.004, nch=workBuf.numberOfChannels, n=workBuf.length;
  let a=0,b=n-1,found=false;
  outer: for(a=0;a<n;a++){ for(let c=0;c<nch;c++) if(Math.abs(workBuf.getChannelData(c)[a])>th){ found=true; break outer; } }
  if(!found){ lcd('ALL SILENCE — nothing kept.'); return; }
  outer2: for(b=n-1;b>a;b--){ for(let c=0;c<nch;c++) if(Math.abs(workBuf.getChannelData(c)[b])>th){ break outer2; } }
  const len=b-a+1;
  if(len>=n-8){ lcd('NO SILENCE TO TRIM.'); return; }
  let nb;
  try{ nb=new AudioBuffer({length:len,sampleRate:workBuf.sampleRate,numberOfChannels:nch}); }
  catch(e){ ensureAudio(); nb=AC.createBuffer(nch,len,workBuf.sampleRate); }
  for(let c=0;c<nch;c++) nb.copyToChannel(workBuf.getChannelData(c).subarray(a,b+1),c);
  S.buffers.push(nb);
  const bid=S.buffers.length-1;
  workBuf=nb; slices=[]; selSlice=-1;
  const p=S.pads[S.editPad];
  p.bufId=bid; p.start=0; p.end=1;
  drawPads(); drawWave(); dirty();
  lcd('TRIMMED → '+nb.duration.toFixed(2)+'s (new buffer on '+padName(S.editPad)+')');
});
$('chopSens').addEventListener('input',e=>{ $('chopSensV').textContent=parseFloat(e.target.value).toFixed(2); });

$('btnEqual').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE TO CHOP.'); return; }
  const n=parseInt($('chopN').value,10);
  slices=[]; selSlice=-1; for(let i=0;i<n;i++) slices.push({s:i/n,e:(i+1)/n});
  drawWave(); lcd(n+' EQUAL SLICES.');
});
$('btnTrans').addEventListener('click',()=>{
  if(!workBuf){ lcd('NO SAMPLE TO CHOP.'); return; }
  const k=parseFloat($('chopSens').value);
  const d=workBuf.getChannelData(0), win=1024, hop=512;
  const en=[];
  for(let o=0;o+win<d.length;o+=hop){
    let s=0; for(let i=0;i<win;i+=4){ const v=d[o+i]; s+=v*v; }
    en.push(Math.sqrt(s/(win/4)));
  }
  const onsets=[0]; let last=-99;
  for(let i=8;i<en.length;i++){
    let avg=0; for(let j=i-8;j<i;j++) avg+=en[j]; avg/=8;
    if(en[i]>k*Math.max(avg,1e-5) && i-last>3){ onsets.push(i); last=i; }
  }
  const total=en.length;
  slices=[]; selSlice=-1;
  for(let i=0;i<onsets.length;i++){
    const s=onsets[i]/total, e=(i+1<onsets.length? onsets[i+1]/total : 1);
    if(e-s>0.002) slices.push({s,e});
  }
  drawWave();
  lcd(slices.length>1 ? slices.length+' TRANSIENT SLICES @ sens '+k.toFixed(2)
                      : 'NO TRANSIENTS FOUND — lower SENS or use EQUAL.');
});
function fillAssignFrom(){
  const sel=$('assignFrom'); sel.innerHTML='';
  for(let i=0;i<NPADS;i++){ const o=document.createElement('option'); o.value=i; o.textContent=padName(i); sel.appendChild(o); }
}
$('btnAssign').addEventListener('click',()=>{
  if(!workBuf || !slices.length){ lcd('CHOP FIRST.'); return; }
  let bid=S.buffers.indexOf(workBuf);
  if(bid<0){ S.buffers.push(workBuf); bid=S.buffers.length-1; }
  const from=parseInt($('assignFrom').value,10);
  let n=0;
  slices.forEach((sl,i)=>{
    const idx=from+i; if(idx>=NPADS) return;
    const p=S.pads[idx];
    p.bufId=bid; p.start=sl.s; p.end=sl.e; p.name='slc'+String(i+1).padStart(2,'0');
    n++;
  });
  drawPads(); dirty(); lcd(n+' SLICES → '+padName(from)+'…');
});

/* ---------------- presets — synth-rendered instrument library ----------------
   Rendered offline at 44.1k into a normal AudioBuffer, then loaded through
   loadIntoTarget like any import — choppable, reversible, FX-able, and
   persisted with the session like every other sample. Seeded noise keeps
   every render deterministic. */
function noteHz(m){ return 440*Math.pow(2,(m-69)/12); }
function midiName(m){ return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12]+(Math.floor(m/12)-1); }
function pOsc(oc,type,f){ const o=oc.createOscillator(); o.type=type; o.frequency.value=f; return o; }
function pGain(oc,v){ const g=oc.createGain(); g.gain.value=v; return g; }
function pFilt(oc,type,f,q,db){ const x=oc.createBiquadFilter(); x.type=type; x.frequency.value=f; x.Q.value=q||1; if(db!=null)x.gain.value=db; return x; }
function pPan(oc,p){ if(oc.createStereoPanner){ const s=oc.createStereoPanner(); s.pan.value=p; return s; } return pGain(oc,1); }
function pNoise(oc,dur,seed){
  const n=Math.ceil(oc.sampleRate*dur), b=oc.createBuffer(1,n,oc.sampleRate), d=b.getChannelData(0), r=mulberry32(seed);
  for(let i=0;i<n;i++) d[i]=r()*2-1;
  const s=oc.createBufferSource(); s.buffer=b; return s;
}
function pEnv(oc,pts){ // [[t,v],[t,v,'x'?],…] — first point is setValueAtTime, 'x' = exponential ramp
  const g=oc.createGain(); g.gain.setValueAtTime(pts[0][1],pts[0][0]);
  for(let i=1;i<pts.length;i++){ const q=pts[i];
    if(q[2]==='x') g.gain.exponentialRampToValueAtTime(Math.max(1e-4,q[1]),q[0]);
    else g.gain.linearRampToValueAtTime(q[1],q[0]); }
  return g;
}
function pChain(){ for(let i=0;i<arguments.length-1;i++) arguments[i].connect(arguments[i+1]); return arguments[arguments.length-1]; }

/* piano: per-partial additive with inharmonic stretching, hammer-position
   comb, triple-string unison beating, per-partial decay, hammer thump */
function pianoRender(bright){ return (oc,out,f0,dur)=>{
  const nyq=oc.sampleRate*0.45;
  const hp=pFilt(oc,'highpass',Math.max(30,f0*0.4),0.7), lp=pFilt(oc,'lowpass',bright?9500:3400,0.4);
  const rel=pEnv(oc,[[0,1],[dur-0.3,1],[dur,0.0001,'x']]);
  pChain(hp,lp,rel,out);
  const roll=bright?1.15:1.85, B=0.00015+0.00025*Math.pow(f0/220,1.2);
  [-1.6,0,1.7].forEach(dc=>{           // 3 strings per note, slightly detuned — natural beating
    for(let n=1;n<=30;n++){
      const fn=n*f0*Math.sqrt(1+B*n*n)*Math.pow(2,dc/1200);
      if(fn>nyq) break;
      const a=Math.pow(n,-roll)*(0.35+0.65*Math.abs(Math.sin(Math.PI*n*0.118)));
      const tau=(3.4*Math.pow(261/f0,0.5))/(1+0.06*n*n);
      const o=pOsc(oc,'sine',fn), g=oc.createGain();
      g.gain.setValueAtTime(0,0);
      g.gain.linearRampToValueAtTime(a*0.3,bright?0.002:0.007);
      g.gain.setTargetAtTime(0,0.012,tau);
      o.connect(g); g.connect(hp);
      o.start(0); o.stop(dur);
    }
  });
  const n=pNoise(oc,0.03,42), nf=pFilt(oc,'bandpass',Math.min(nyq,f0*3.2),1.1),
        ne=pEnv(oc,[[0,bright?0.5:0.22],[0.025,0.0001,'x']]);
  pChain(n,nf,ne,hp); n.start(0);
};}

const PRESETS=[
{id:'dkick',cat:'DRUMS',name:'Kick',note:36,dur:0.9,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sine',60);
  o.frequency.setValueAtTime(165,0);
  o.frequency.exponentialRampToValueAtTime(48,0.10);          // pitch-drop punch
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.22);
  const e=pEnv(oc,[[0,0],[0.002,1],[0.10,0.72],[dur,0.0001,'x']]);
  pChain(o,sat,e,out); o.start(0); o.stop(dur);
  const n=pNoise(oc,0.012,5), nf=pFilt(oc,'highpass',1400,0.7), ne=pEnv(oc,[[0,0.55],[0.008,0.0001,'x']]);
  pChain(n,nf,ne,out); n.start(0);                            // beater click
}},
{id:'dsnare',cat:'DRUMS',name:'Snare',note:38,dur:0.42,render:(oc,out,f0,dur)=>{
  // drum-body tone: two detuned modes with independent decay + pitch blip on the hit
  [[186,0.6,0.10],[276,0.42,0.055],[330,0.2,0.04]].forEach(m=>{
    const o=pOsc(oc,'triangle',m[0]);
    o.frequency.setValueAtTime(m[0]*1.35,0); o.frequency.exponentialRampToValueAtTime(m[0],0.03);
    const e=pEnv(oc,[[0,0],[0.001,m[1]],[m[2]+0.15,0.0001,'x']]);
    pChain(o,e,out); o.start(0); o.stop(dur);
  });
  // rattle: noise through a resonant band pair (wires) — brighter and snappier than plain HP noise
  const n=pNoise(oc,dur,17), b1=pFilt(oc,'bandpass',3400,1.4), b2=pFilt(oc,'peaking',7000,1.2,6),
        hp=pFilt(oc,'highpass',1200,0.7),
        ne=pEnv(oc,[[0,0],[0.001,0.95],[0.05,0.5],[0.19,0.0001,'x']]);
  pChain(n,hp,b1,b2,ne,out); n.start(0);
}},
{id:'dclap',cat:'DRUMS',name:'Clap',note:39,dur:0.55,render:(oc,out,f0,dur)=>{
  // pre-slaps spread slightly across the stereo field, then a wider room burst
  [[0,-0.25],[0.011,0.2],[0.023,-0.1]].forEach(s=>{
    const n=pNoise(oc,0.03,23+Math.round(s[0]*1000)), bp=pFilt(oc,'bandpass',1150,1.6),
          e=pEnv(oc,[[s[0],0],[s[0]+0.001,0.85],[s[0]+0.012,0.0001,'x']]);
    pChain(n,bp,e,pPan(oc,s[1]),out); n.start(s[0]);
  });
  const body=pNoise(oc,dur,29), bp2=pFilt(oc,'bandpass',1050,0.9), pk=pFilt(oc,'peaking',2600,1,4);
  bp2.frequency.setValueAtTime(1400,0.034); bp2.frequency.exponentialRampToValueAtTime(900,0.3);   // darkening tail reads as a room
  const be=pEnv(oc,[[0.033,0],[0.035,0.95],[0.3,0.0001,'x']]);
  pChain(body,bp2,pk,be,out); body.start(0.02);
}},
/* metallic hat bank — six detuned square oscillators (the 808/909 recipe);
   filtered noise alone reads as static, the beating between squares reads as metal */
{id:'dhat',cat:'DRUMS',name:'Closed Hat',note:42,dur:0.14,render:(oc,out,f0,dur)=>{
  const hp=pFilt(oc,'highpass',7000,0.9), bp=pFilt(oc,'bandpass',10200,1.1),
        e=pEnv(oc,[[0,0],[0.001,0.62],[0.03,0.18],[dur,0.0001,'x']]);
  pChain(hp,bp,e,out);
  [263.5,400,421,474,587,845].forEach(f=>{ const o=pOsc(oc,'square',f*1.45); pChain(o,pGain(oc,0.16),hp); o.start(0); o.stop(dur); });
  const n=pNoise(oc,0.03,31); pChain(n,pGain(oc,0.25),hp); n.start(0);   // stick sizzle
}},
{id:'dohat',cat:'DRUMS',name:'Open Hat',note:46,dur:0.75,render:(oc,out,f0,dur)=>{
  const hp=pFilt(oc,'highpass',6500,0.9), bp=pFilt(oc,'bandpass',9500,0.9),
        e=pEnv(oc,[[0,0],[0.001,0.55],[0.12,0.3],[dur,0.0001,'x']]);
  pChain(hp,bp,e,out);
  [263.5,400,421,474,587,845].forEach(f=>{ const o=pOsc(oc,'square',f*1.45); pChain(o,pGain(oc,0.15),hp); o.start(0); o.stop(dur); });
  const n=pNoise(oc,dur,37); pChain(n,pGain(oc,0.18),hp); n.start(0);   // wash under the metal
}},
{id:'dcow',cat:'DRUMS',name:'Sub Cowbell',note:56,dur:0.4,render:(oc,out,f0,dur)=>{
  const bp=pFilt(oc,'bandpass',2640,3.5), e=pEnv(oc,[[0,0],[0.001,0.9],[0.02,0.45],[dur,0.0001,'x']]);
  pChain(bp,e,out);
  [540,800].forEach(f=>{ const o=pOsc(oc,'square',f); pChain(o,pGain(oc,0.5),bp); o.start(0); o.stop(dur); });
}},
{id:'dshk',cat:'DRUMS',name:'Shaker',note:70,dur:0.22,render:(oc,out,f0,dur)=>{
  const bp=pFilt(oc,'bandpass',4200,1.8), hp=pFilt(oc,'highpass',2500,0.7);
  const e=oc.createGain(), g=e.gain;                    // shh-T: soft swell into the accent
  g.setValueAtTime(0.0001,0);
  g.linearRampToValueAtTime(0.3,0.03); g.linearRampToValueAtTime(0.05,0.055);
  g.setValueAtTime(0.85,0.06); g.exponentialRampToValueAtTime(0.0001,0.19);
  const n=pNoise(oc,dur,53); pChain(n,hp,bp,e,out); n.start(0);
}},
{id:'dcong',cat:'DRUMS',name:'Conga',note:63,dur:0.35,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sine',f0);                            // tunable — renders at the picker note
  o.frequency.setValueAtTime(f0*1.35,0); o.frequency.exponentialRampToValueAtTime(f0,0.025);
  const e=pEnv(oc,[[0,0],[0.002,0.95],[dur,0.0001,'x']]);
  pChain(o,e,out); o.start(0); o.stop(dur);
  const n=pNoise(oc,0.015,61), nf=pFilt(oc,'bandpass',Math.min(oc.sampleRate*0.4,f0*8),1.2),
        ne=pEnv(oc,[[0,0.4],[0.012,0.0001,'x']]);
  pChain(n,nf,ne,out); n.start(0);                       // palm slap
}},
{id:'drim',cat:'DRUMS',name:'Rimshot',note:37,dur:0.15,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'square',330), bp=pFilt(oc,'bandpass',1700,3), e=pEnv(oc,[[0,0],[0.0004,0.8],[0.04,0.0001,'x']]);
  pChain(o,bp,e,out); o.start(0); o.stop(dur);
}},
{id:'dtom',cat:'DRUMS',name:'Tom',note:45,dur:0.5,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sine',110); o.frequency.setValueAtTime(210,0);
  o.frequency.exponentialRampToValueAtTime(88,0.22);
  const e=pEnv(oc,[[0,0],[0.002,0.95],[dur,0.0001,'x']]);
  pChain(o,e,out); o.start(0); o.stop(dur);
  const n=pNoise(oc,0.02,9), ne=pEnv(oc,[[0,0.25],[0.02,0.0001,'x']]);
  pChain(n,pFilt(oc,'bandpass',400,1),ne,out); n.start(0);
}},
{id:'b808',cat:'BASS',name:'Deep Sub',note:31,dur:2.8,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sine',f0);
  o.frequency.setValueAtTime(f0*3.4,0);
  o.frequency.exponentialRampToValueAtTime(f0,0.06);        // pitch-drop knock
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.3);
  const e=pEnv(oc,[[0,0],[0.005,1],[0.12,0.85],[dur,0.0001,'x']]);
  pChain(o,sat,e,out); o.start(0); o.stop(dur);
  const n=pNoise(oc,0.02,77), nf=pFilt(oc,'bandpass',2200,1), ne=pEnv(oc,[[0,0.35],[0.018,0.0001,'x']]);
  pChain(n,nf,ne,out); n.start(0);
}},
{id:'bsub',cat:'BASS',name:'Deep Sine Sub',note:29,dur:3.2,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sine',f0), o2=pOsc(oc,'sine',f0*2), g2=pGain(oc,0.13);
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.1);
  const e=pEnv(oc,[[0,0],[0.03,1],[dur*0.55,0.65],[dur,0.0001,'x']]);
  o.connect(sat); o2.connect(g2); g2.connect(sat); pChain(sat,e,out);
  o.start(0); o2.start(0); o.stop(dur); o2.stop(dur);
}},
{id:'breese',cat:'BASS',name:'Reese Bass',note:33,dur:3.2,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',f0*3.5,3);
  lp.frequency.setValueAtTime(f0*3.5,0);
  lp.frequency.linearRampToValueAtTime(f0*10,dur*0.55);
  lp.frequency.linearRampToValueAtTime(f0*4,dur);
  const e=pEnv(oc,[[0,0],[0.04,0.85],[dur-0.35,0.85],[dur,0.0001,'x']]);
  pChain(lp,e,out);
  [[-16,-0.45],[16,0.45],[31,-0.15],[-31,0.15]].forEach(v=>{  // 4 detuned saws, spread wide
    const o=pOsc(oc,'sawtooth',f0); o.detune.value=v[0];
    pChain(o,pGain(oc,0.3),pPan(oc,v[1]),lp);
    o.start(0); o.stop(dur);
  });
  const sub=pOsc(oc,'sine',f0*0.5);                          // octave-down sine anchor
  pChain(sub,pGain(oc,0.6),e); sub.start(0); sub.stop(dur);
}},
{id:'bfm',cat:'BASS',name:'FM Growl',note:33,dur:2.6,render:(oc,out,f0,dur)=>{
  const car=pOsc(oc,'sine',f0), mod=pOsc(oc,'sine',f0*2.01), mi=pGain(oc,0);
  mi.gain.setValueAtTime(f0*9,0);
  mi.gain.exponentialRampToValueAtTime(f0*1.2,dur*0.8);      // index sweep = growl closing
  mod.connect(mi); mi.connect(car.frequency);
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.4);
  const e=pEnv(oc,[[0,0],[0.006,0.9],[dur*0.5,0.6],[dur,0.0001,'x']]);
  pChain(car,sat,e,out);
  const sub=pOsc(oc,'sine',f0); pChain(sub,pGain(oc,0.5),e);
  car.start(0); mod.start(0); sub.start(0);
  car.stop(dur); mod.stop(dur); sub.stop(dur);
}},
{id:'pgrand',cat:'PIANO',name:'Grand Piano',note:60,dur:5,render:pianoRender(true)},
{id:'pfelt',cat:'PIANO',name:'Felt Piano',note:60,dur:5,render:pianoRender(false)},
{id:'kep',cat:'KEYS',name:'E-Piano Tine',note:60,dur:4,render:(oc,out,f0,dur)=>{
  // FM tine: carrier + fast-decaying high-ratio modulator = the bell-strike, then a warm body
  const car=pOsc(oc,'sine',f0), mod=pOsc(oc,'sine',f0*3.53), mi=pGain(oc,0);
  mi.gain.setValueAtTime(f0*5,0);
  mi.gain.exponentialRampToValueAtTime(f0*0.06,0.6);          // strike brightness dies into pure tone
  mod.connect(mi); mi.connect(car.frequency);
  const e=pEnv(oc,[[0,0],[0.002,0.95],[0.9,0.4],[dur,0.0001,'x']]);
  const lp=pFilt(oc,'lowpass',5200,0.5);
  pChain(car,lp,e,out); car.start(0); mod.start(0); car.stop(dur); mod.stop(dur);
  const sub=pOsc(oc,'sine',f0*0.5), se=pEnv(oc,[[0,0],[0.004,0.22],[0.5,0.08],[dur,0.0001,'x']]);
  pChain(sub,se,out); sub.start(0); sub.stop(dur);            // bark/body an octave down
  const trem=pOsc(oc,'sine',4.6), tg=pGain(oc,0);             // gentle stereo-ish tremolo
  tg.gain.value=0.12; trem.connect(tg); tg.connect(e.gain); trem.start(0);
}},
{id:'korg',cat:'KEYS',name:'Drawbar Organ',note:60,dur:3.5,render:(oc,out,f0,dur)=>{
  const e=pEnv(oc,[[0,0],[0.015,0.8],[dur-0.25,0.8],[dur,0.0001,'x']]);
  const lp=pFilt(oc,'lowpass',6500,0.4); pChain(lp,e,out);
  const nyq=oc.sampleRate*0.45;
  [[0.5,0.55],[1,0.9],[1.5,0.45],[2,0.4],[3,0.22],[4,0.18],[6,0.1],[8,0.08]].forEach(d=>{   // drawbars
    const f=f0*d[0]; if(f>nyq) return;
    const o=pOsc(oc,'sine',f); pChain(o,pGain(oc,d[1]*0.28),lp); o.start(0); o.stop(dur);
  });
  const pc=pOsc(oc,'sine',f0*3), pe=pEnv(oc,[[0,0.4],[0.25,0.0001,'x']]);    // percussion click (3rd harmonic)
  pChain(pc,pe,lp); pc.start(0); pc.stop(0.4);
  const les=pOsc(oc,'sine',5.7), lg=pGain(oc,0); lg.gain.value=0.1;          // leslie-ish shimmer
  les.connect(lg); lg.connect(e.gain); les.start(0);
}},
{id:'lsuper',cat:'LEAD',name:'Supersaw Lead',note:64,dur:2.6,render:(oc,out,f0,dur)=>{
  const hp=pFilt(oc,'highpass',Math.max(60,f0*0.5),0.7), lp=pFilt(oc,'lowpass',9000,0.6);
  const e=pEnv(oc,[[0,0],[0.008,0.85],[dur-0.4,0.7],[dur,0.0001,'x']]);
  pChain(hp,lp,e,out);
  [[-24,-0.8],[-14,-0.5],[-6,-0.2],[0,0],[6,0.2],[14,0.5],[24,0.8]].forEach(v=>{   // 7 saws fanned wide
    const o=pOsc(oc,'sawtooth',f0); o.detune.value=v[0];
    pChain(o,pGain(oc,0.16),pPan(oc,v[1]),hp); o.start(0); o.stop(dur);
  });
  const sub=pOsc(oc,'sine',f0*0.5); pChain(sub,pGain(oc,0.35),e); sub.start(0); sub.stop(dur);
}},
{id:'lpluck',cat:'LEAD',name:'Synth Pluck',note:69,dur:1.4,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',f0*6,2);
  lp.frequency.setValueAtTime(Math.min(oc.sampleRate*0.4,f0*14),0);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300,f0*1.5),0.35);      // the pluck IS the filter drop
  const e=pEnv(oc,[[0,0],[0.002,0.9],[dur,0.0001,'x']]);
  pChain(lp,e,out);
  const o1=pOsc(oc,'sawtooth',f0), o2=pOsc(oc,'square',f0); o2.detune.value=8;
  pChain(o1,pGain(oc,0.5),lp); pChain(o2,pGain(oc,0.3),lp);
  o1.start(0); o2.start(0); o1.stop(dur); o2.stop(dur);
}},
{id:'pwarm',cat:'PAD',name:'Warm Pad',note:57,dur:6,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',600,0.5);
  lp.frequency.setValueAtTime(600,0);
  lp.frequency.linearRampToValueAtTime(3200,1.4);
  lp.frequency.linearRampToValueAtTime(1200,dur);                            // breathes open then settles
  const e=pEnv(oc,[[0,0],[0.9,0.6],[dur-1.4,0.6],[dur,0.0001,'x']]);
  pChain(lp,e,out);
  [[-10,-0.6,'sawtooth'],[7,0.6,'sawtooth'],[-4,-0.25,'triangle'],[13,0.3,'triangle']].forEach(v=>{
    const o=pOsc(oc,v[2],f0); o.detune.value=v[0];
    pChain(o,pGain(oc,v[2]==='sawtooth'?0.22:0.3),pPan(oc,v[1]),lp);
    o.start(0); o.stop(dur);
  });
  const sub=pOsc(oc,'sine',f0*0.5); pChain(sub,pGain(oc,0.3),e); sub.start(0); sub.stop(dur);
  const sh=pOsc(oc,'sine',0.35), sg=pGain(oc,0); sg.gain.value=180;          // slow filter drift keeps it alive
  sh.connect(sg); sg.connect(lp.frequency); sh.start(0);
}},
{id:'scello',cat:'STRINGS',name:'Cello',note:48,dur:4,render:(oc,out,f0,dur)=>{
  const hp=pFilt(oc,'highpass',Math.max(50,f0*0.5),0.7),
        b1=pFilt(oc,'peaking',250,1.4,7), b2=pFilt(oc,'peaking',500,2,5),   // body formants
        b3=pFilt(oc,'peaking',1200,2.5,4), lp=pFilt(oc,'lowpass',3600,0.5);
  const e=pEnv(oc,[[0,0],[0.3,0.7],[dur-0.55,0.7],[dur,0.0001,'x']]);
  pChain(hp,b1,b2,b3,lp,e,out);
  const lfo=pOsc(oc,'sine',5.1), vd=pGain(oc,0);             // vibrato eases in after the bow settles
  vd.gain.setValueAtTime(0,0);
  vd.gain.setValueAtTime(0,0.45);
  vd.gain.linearRampToValueAtTime(f0*0.012,1.5);
  lfo.connect(vd); lfo.start(0);
  const o=pOsc(oc,'sawtooth',f0); vd.connect(o.frequency);
  pChain(o,pGain(oc,0.8),hp); o.start(0); o.stop(dur);
  const tri=pOsc(oc,'triangle',f0); vd.connect(tri.frequency);
  pChain(tri,pGain(oc,0.35),hp); tri.start(0); tri.stop(dur);
  const bow=pNoise(oc,dur,91), bf=pFilt(oc,'bandpass',f0*2,1.5);
  pChain(bow,bf,pGain(oc,0.05),hp); bow.start(0);
}},
{id:'sens',cat:'STRINGS',name:'Str Ensemble',note:60,dur:4.5,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',2600,0.4);
  lp.frequency.setValueAtTime(2600,0);
  lp.frequency.linearRampToValueAtTime(6000,1.3);
  const e=pEnv(oc,[[0,0],[0.6,0.65],[dur-0.9,0.65],[dur,0.0001,'x']]);
  pChain(lp,e,out);
  const r=mulberry32(4321);
  for(let v=0;v<9;v++){                                      // 9 players: unison + octave up + octave down
    const oct=v<5?1:(v<7?2:0.5), base=f0*oct;
    if(base>oc.sampleRate*0.4) continue;
    const o=pOsc(oc,'sawtooth',base);
    o.detune.value=(r()*2-1)*14;
    const lfo=pOsc(oc,'sine',4+r()*2), vd=pGain(oc,0);
    vd.gain.setValueAtTime(0,0);
    vd.gain.linearRampToValueAtTime(base*0.007,0.9+r()*0.8);
    lfo.connect(vd); vd.connect(o.frequency); lfo.start(0);
    pChain(o,pGain(oc,oct===1?0.22:(oct===2?0.09:0.14)),pPan(oc,(r()*2-1)*0.8),lp);
    o.start(0); o.stop(dur);
  }
}},
{id:'spizz',cat:'STRINGS',name:'Pizzicato',note:55,dur:1.6,render:(oc,out,f0,dur)=>{
  // Karplus-Strong pluck computed straight into a buffer
  const sr=oc.sampleRate, N=Math.max(2,Math.round(sr/f0)), len=Math.ceil(sr*dur);
  const b=oc.createBuffer(1,len,sr), d=b.getChannelData(0), r=mulberry32(7+Math.floor(f0));
  for(let i=0;i<N;i++) d[i]=r()*2-1;
  const loss=Math.exp(Math.log(0.05)/(0.9*f0));              // ~5% left after 0.9s at any pitch
  for(let i=N;i<len;i++) d[i]=(d[i-N]+d[i-N+1])*0.5*loss;
  const src=oc.createBufferSource(); src.buffer=b;
  pChain(src,pFilt(oc,'peaking',400,1.2,4),pFilt(oc,'lowpass',5000,0.5),out);
  src.start(0);
}},
{id:'brs',cat:'BRASS',name:'Brass Section',note:55,dur:3,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',450,1.2);
  lp.frequency.setValueAtTime(450,0);
  lp.frequency.linearRampToValueAtTime(Math.min(4200,f0*16),0.16);  // cutoff blooms open — brass blat
  lp.frequency.linearRampToValueAtTime(Math.min(3000,f0*12),0.6);
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.15);
  const e=pEnv(oc,[[0,0],[0.05,0.9],[0.3,0.7],[dur-0.5,0.7],[dur,0.0001,'x']]);
  pChain(lp,sat,e,out);
  const lfo=pOsc(oc,'sine',5.2), vd=pGain(oc,0);
  vd.gain.setValueAtTime(0,0);
  vd.gain.setValueAtTime(0,0.55);
  vd.gain.linearRampToValueAtTime(f0*0.008,1.4);
  lfo.connect(vd); lfo.start(0);
  [-11,0,12].forEach((dt,i)=>{
    const o=pOsc(oc,'sawtooth',f0);
    o.frequency.setValueAtTime(f0*0.93,0);
    o.frequency.exponentialRampToValueAtTime(f0,0.09+i*0.02);       // scoop up from below
    o.detune.value=dt; vd.connect(o.frequency);
    pChain(o,pGain(oc,0.3),pPan(oc,(i-1)*0.35),lp);
    o.start(0); o.stop(dur);
  });
  const br=pNoise(oc,0.2,55), bf=pFilt(oc,'highpass',2500,0.7),
        be=pEnv(oc,[[0,0.12],[0.15,0.0001,'x']]);                   // breath at the attack
  pChain(br,bf,be,out); br.start(0);
}},
{id:'bstab',cat:'BRASS',name:'Brass Stab',note:57,dur:1.2,render:(oc,out,f0,dur)=>{
  const lp=pFilt(oc,'lowpass',300,3);
  lp.frequency.setValueAtTime(300,0);
  lp.frequency.exponentialRampToValueAtTime(Math.min(5500,f0*20),0.035);
  lp.frequency.exponentialRampToValueAtTime(f0*3,dur*0.7);
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.25);
  const e=pEnv(oc,[[0,0],[0.008,1],[dur*0.55,0.5],[dur,0.0001,'x']]);
  pChain(lp,sat,e,out);
  [-14,0,14].forEach((dt,i)=>{
    const o=pOsc(oc,'sawtooth',f0); o.detune.value=dt;
    pChain(o,pGain(oc,0.33),pPan(oc,(i-1)*0.3),lp);
    o.start(0); o.stop(dur);
  });
}},
{id:'xbell',cat:'EXPERIMENTAL',name:'Metal Bell',note:72,dur:4.5,render:(oc,out,f0,dur)=>{
  const modes=[[0.56,0.5,3.6],[1,1,3.2],[2.76,0.6,1.9],[5.40,0.35,1.1],[8.93,0.2,0.65],[13.34,0.1,0.4],[18.64,0.05,0.25]];
  const nyq=oc.sampleRate*0.45;
  modes.forEach((m,i)=>{                                     // inharmonic partials, detuned pairs beat
    const f=f0*m[0]; if(f>nyq) return;
    [0,1.5].forEach(dt=>{
      const o=pOsc(oc,'sine',f); o.detune.value=dt*(i+1);
      const g=oc.createGain();
      g.gain.setValueAtTime(0,0);
      g.gain.linearRampToValueAtTime(m[1]*0.3,0.003);
      g.gain.setTargetAtTime(0,0.01,m[2]);
      pChain(o,g,pPan(oc,(i%2?1:-1)*0.25),out);
      o.start(0); o.stop(dur);
    });
  });
  const n=pNoise(oc,0.02,13), nf=pFilt(oc,'highpass',3000,0.7), ne=pEnv(oc,[[0,0.4],[0.02,0.0001,'x']]);
  pChain(n,nf,ne,out); n.start(0);
}},
{id:'xglass',cat:'EXPERIMENTAL',name:'Glass Drone',note:60,dur:6,render:(oc,out,f0,dur)=>{
  const r=mulberry32(99);
  [[1,0.5],[1.5,0.3],[2.005,0.28],[3.01,0.18],[4.52,0.1],[6.05,0.06]].forEach(q=>{
    const f=f0*q[0]; if(f>oc.sampleRate*0.4) return;
    const o=pOsc(oc,'sine',f);
    const trem=pOsc(oc,'sine',0.13+r()*0.4), td=pGain(oc,q[1]*0.4);
    const g=pGain(oc,q[1]*0.6);
    trem.connect(td); td.connect(g.gain); trem.start(0);     // slow independent shimmer per partial
    const e=pEnv(oc,[[0,0],[1.2+r()*0.8,1],[dur-1.2,1],[dur,0.0001,'x']]);
    pChain(o,g,e,pPan(oc,(r()*2-1)*0.7),out);
    o.start(0); o.stop(dur);
  });
}},
{id:'xzap',cat:'EXPERIMENTAL',name:'Laser Zap',note:69,dur:0.8,render:(oc,out,f0,dur)=>{
  const o=pOsc(oc,'sawtooth',f0*24), o2=pOsc(oc,'square',f0*24);
  [o,o2].forEach(x=>{ x.frequency.setValueAtTime(f0*24,0); x.frequency.exponentialRampToValueAtTime(f0*0.6,0.32); });
  o2.detune.value=9;
  const sat=oc.createWaveShaper(); sat.curve=makeDriveCurve(0.5);
  const e=pEnv(oc,[[0,0],[0.004,0.8],[0.3,0.3],[dur,0.0001,'x']]);
  o.connect(sat); const g2=pGain(oc,0.4); o2.connect(g2); g2.connect(sat); pChain(sat,e,out);
  o.start(0); o2.start(0); o.stop(dur); o2.stop(dur);
}},
{id:'xsweep',cat:'EXPERIMENTAL',name:'Noise Riser',note:60,dur:2.6,render:(oc,out,f0,dur)=>{
  const n=pNoise(oc,dur,7), bp=pFilt(oc,'bandpass',150,5);
  bp.frequency.setValueAtTime(Math.max(60,f0*0.5),0);
  bp.frequency.exponentialRampToValueAtTime(9000,dur*0.85);
  const e=pEnv(oc,[[0,0.15],[dur*0.85,1],[dur,0.0001,'x']]);
  const pn=pPan(oc,0), lfo=pOsc(oc,'sine',0.9), pd=pGain(oc,0.7);
  if(pn.pan){ lfo.connect(pd); pd.connect(pn.pan); lfo.start(0); }   // auto-pan sweep
  pChain(n,bp,e,pn,out); n.start(0);
}},
{id:'xgrain',cat:'EXPERIMENTAL',name:'Grain Cloud',note:60,dur:3.8,render:(oc,out,f0,dur)=>{
  const r=mulberry32(2026), iv=[-12,0,0,7,12,19,24];         // grains land on octaves & fifths
  const e=pEnv(oc,[[0,0.25],[dur*0.4,1],[dur-0.6,0.6],[dur,0.0001,'x']]);
  e.connect(out);
  for(let i=0;i<70;i++){
    const t0=r()*(dur-0.45), gl=0.06+r()*0.22;
    const f=f0*Math.pow(2,iv[Math.floor(r()*iv.length)]/12)*(1+(r()*2-1)*0.01);
    if(f>oc.sampleRate*0.4) continue;
    const o=pOsc(oc,r()<0.3?'triangle':'sine',f);
    const g=oc.createGain();
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(0.25,t0+gl*0.4);
    g.gain.linearRampToValueAtTime(0,t0+gl);
    pChain(o,g,pPan(oc,(r()*2-1)*0.85),e);
    o.start(t0); o.stop(t0+gl+0.01);
  }
}}
];

function normBuf(b,target){
  let peak=0;
  for(let c=0;c<b.numberOfChannels;c++){ const d=b.getChannelData(c);
    for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>peak) peak=a; } }
  if(peak>1e-6){ const k=target/peak;
    for(let c=0;c<b.numberOfChannels;c++){ const d=b.getChannelData(c);
      for(let i=0;i<d.length;i++) d[i]*=k; } }
  return b;
}
async function renderPreset(def,midi){
  const SR=44100, dur=def.dur;
  const oc=new OfflineAudioContext(2,Math.ceil(SR*dur),SR);
  const fade=oc.createGain();                                // hard-guarantee a clickless tail
  fade.gain.setValueAtTime(1,0);
  fade.gain.setValueAtTime(1,Math.max(0,dur-0.05));
  fade.gain.linearRampToValueAtTime(0,dur-0.003);
  fade.connect(oc.destination);
  def.render(oc,fade,noteHz(midi),dur);
  return normBuf(await oc.startRendering(),0.92);            // consistent hot level across presets
}
(function(){
  const sel=$('presetSel'); let cat='', og=null;
  PRESETS.forEach(p=>{
    if(p.cat!==cat){ og=document.createElement('optgroup'); og.label=p.cat; sel.appendChild(og); cat=p.cat; }
    const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; og.appendChild(o);
  });
  const ns=$('presetNote');
  for(let m=24;m<=96;m++){ const o=document.createElement('option'); o.value=m; o.textContent=midiName(m); ns.appendChild(o); }
  ns.value=String(PRESETS[0].note);
  sel.addEventListener('change',()=>{ const d=PRESETS.find(p=>p.id===sel.value); if(d) ns.value=String(d.note); });
})();
$('btnPresetLoad').addEventListener('click',async ()=>{
  const d=PRESETS.find(p=>p.id===$('presetSel').value); if(!d) return;
  ensureAudio();
  const midi=parseInt($('presetNote').value,10);
  lcd('RENDERING '+d.name+' @ '+midiName(midi)+' …');
  try{
    const buf=await renderPreset(d,midi);
    loadIntoTarget(buf,d.name);
    S.pads[S.editPad].srcPreset=d.id; S.pads[S.editPad].srcNote=midi;   // provenance → song-doc export round-trips
    hitLive(S.editPad,0.9);
  }catch(err){ lcd('PRESET FAILED: '+(err&&err.message?err.message:'render error')); }
});

/* ---------------- KITS: one-tap instant setups (all synth, fully offline) ----------------
   Each kit renders a curated set of presets into bank-A pads and (optionally)
   writes a starter groove so the app is playable the instant it opens. slots
   map pad index -> [presetId, midiNote]; beat maps pad index -> step positions. */
const KITS=[
  { id:'trap', name:'TRAP', bpm:140, swing:0.12,
    slots:[['dkick',36],['dsnare',38],['dhat',42],['dohat',46],['dclap',39],['drim',37],['b808',31],['bsub',29]],
    beat:{ 0:[0,7,10], 1:[4,12], 2:[0,2,4,6,8,10,12,14], 3:[7,15], 4:[4,12], 6:[0,10],
           2.5:[3,11,13,14,15] } },   // note: only integer pad keys used; fractional ignored below
  { id:'house', name:'HOUSE', bpm:124, swing:0.0,
    slots:[['dkick',36],['dclap',39],['dhat',42],['dohat',46],['drim',37],['bsub',29],['korg',60],['lpluck',69]],
    beat:{ 0:[0,4,8,12], 1:[4,12], 2:[2,6,10,14], 3:[2,6,10,14], 5:[0,8], 6:[0,7,11] } },
  { id:'boombap', name:'BOOM-BAP', bpm:90, swing:0.16,
    slots:[['dkick',36],['dsnare',38],['dhat',42],['dohat',46],['b808',33],['scello',48],['pgrand',60],['brs',55]],
    beat:{ 0:[0,3,8,10], 1:[4,12], 2:[0,2,4,6,8,10,12,14], 4:[0,8] } },
  { id:'lofi', name:'LO-FI', bpm:78, swing:0.18,
    slots:[['dkick',36],['drim',37],['dhat',42],['dsnare',38],['kep',60],['scello',48],['bsub',29],['dshk',70]],
    beat:{ 0:[0,8], 1:[4,12], 2:[0,3,4,6,8,11,12,14], 6:[0,8] } },
  { id:'techno', name:'TECHNO', bpm:130, swing:0.0,
    slots:[['dkick',36],['dclap',39],['dhat',42],['dohat',46],['drim',37],['dtom',45],['breese',33],['xsweep',60]],
    beat:{ 0:[0,4,8,12], 1:[4,12], 2:[2,6,10,14], 3:[2,6,10,14], 4:[7,15], 6:[0,3,6,8,11,14] } },
  { id:'ambient', name:'AMBIENT', bpm:70, swing:0.0,
    slots:[['dkick',36],['dohat',46],['xbell',72],['xglass',60],['kep',60],['pwarm',57],['scello',48],['bsub',29]],
    beat:{ 0:[0,8], 3:[0,4,8,12], 6:[0], 7:[0,8] } },
];
function assignBufToPad(idx,buf,name){
  try{ stopPadVoices(idx); }catch(e){}
  S.buffers.push(buf); const bid=S.buffers.length-1;
  const p=S.pads[idx];
  p.bufId=bid; p.start=0; p.end=1; p.pitch=0; p.fine=0; p.reverse=false; p.mode='one'; p.warped=false;
  delete warpOrig[idx]; delete p.srcPreset; delete p.srcNote;   // provenance is re-set by preset/kit/songdoc loaders
  p.name=(name||'').slice(0,14);
  return bid;
}
let kitBusy=false;
async function loadKit(kit, layBeat){
  if(kitBusy) return; kitBusy=true;
  ensureAudio();
  try{
    lcd('BUILDING '+kit.name+' KIT …');
    for(let i=0;i<kit.slots.length;i++){
      const [pid,note]=kit.slots[i], def=PRESETS.find(p=>p.id===pid);
      if(!def) continue;
      const buf=await renderPreset(def, note!=null?note:def.note);
      assignBufToPad(i, buf, def.name);
      S.pads[i].srcPreset=pid; S.pads[i].srcNote=note!=null?note:def.note;
    }
    if(layBeat){
      const pat=S.patterns[S.pattern];
      pat.plen=NSTEPS;                                   // a factory kit lays a clean one-bar pattern
      for(let p=0;p<NPADS;p++){ pat.steps[p].fill(0); pat.len[p]=NSTEPS; }
      pat.locks={};
      for(const k in kit.beat){ const pi=parseInt(k,10);
        if(String(pi)!==k) continue;                 // skip any non-integer decorative keys
        kit.beat[k].forEach(st=>{ if(st>=0&&st<NSTEPS) pat.steps[pi][st]=0.9; }); }
      if(kit.bpm) setBpm(kit.bpm);
      if(kit.swing!=null){ S.swing=kit.swing; $('swing').value=String(kit.swing); $('swingV').textContent=Math.round(kit.swing*100)+'%'; }
    }
    S.bank=0; S.editPad=0; S.seqPad=0;
    buildPads(); drawPads(); drawEdit(); drawSeq(); drawFader(); drawMixer(); dirty();
    lcd(kit.name+' KIT READY · press PLAY');
  }catch(err){ lcd('KIT FAILED: '+(err&&err.message?err.message:'error')); }
  finally{ kitBusy=false; }
}
(function(){
  const row=$('kitRow');
  const cs=document.createElement('button'); cs.textContent="CLAUDE'S SONG ♪"; cs.dataset.kit='claude';
  cs.style.cssText='background:var(--lcd-bg);color:var(--lcd);border-color:var(--amber)';
  cs.addEventListener('click',()=>loadClaudeSong());
  row.appendChild(cs);
  const mr=document.createElement('button'); mr.textContent='MIRRORS ♪'; mr.dataset.kit='mirrors';
  mr.style.cssText='background:var(--lcd-bg);color:var(--lcd);border-color:var(--amber)';
  mr.addEventListener('click',()=>loadSongDoc(MIRRORS_DOC));
  row.appendChild(mr);
  KITS.forEach(kit=>{
    const b=document.createElement('button'); b.textContent=kit.name; b.dataset.kit=kit.id;
    b.addEventListener('click',()=>loadKit(kit, $('kitBeat').checked));
    row.appendChild(b);
  });
})();

/* ================= SONG DOC — the AI jam interface =================
   A plain-text JSON format that describes a complete production: pads
   (synth preset + note + mix), patterns (steps with velocity + pitch,
   locks, silencer cuts, signed per-pattern BPM) and the arrangement.
   Any AI — or human — can write one in chat and paste it into
   PROJ → AI JAM; the app renders every sound and plays it. EXPORT
   round-trips the current session so an AI can remix your work.
   Programmatic access: window.MVX.load(docOrJson) / .export() /
   .play() / .stop() / .spec */
const SONGDOC_EXAMPLE={
  fmt:'mvx-songdoc-1', title:'Example Beat', bpm:120, swing:0.08, human:0.15, loop:true,
  song:[[0,4]],
  pads:[
    {preset:'dkick', note:36, gain:1.0},
    {preset:'dclap', note:60, gain:0.8, rev:0.18},
    {preset:'dohat', note:70, gain:0.5, pan:0.2},
    {preset:'b808',  note:36, gain:0.9}
  ],
  patterns:[
    { steps:{
        "0":[[0,1],[4,1],[8,1],[12,1]],
        "1":[[4,0.8],[12,0.8]],
        "2":[[2,0.5],[6,0.5],[10,0.5],[14,0.5]],
        "3":[[0,0.9,0],[0,0.9,7],[8,0.9,3]]
      }, sil:[], bpm:null }
  ]
};
const SONGDOC_SPEC=
`JBH-88 SONG DOC — jam with an AI in 3 steps:
1) Copy this ENTIRE message.  2) Paste it to any AI (Claude, ChatGPT, Grok…) and ask for a beat.
3) Paste the AI's reply back here (PROJ → AI JAM box) and tap LOAD.  (Fences / extra text are fine — the loader digs the JSON out.)

===== INSTRUCTIONS FOR THE AI =====
Compose a beat for the JBH-88 groovebox. Reply with ONE JSON object that matches the schema below. Do not invent field names. Prose around it is tolerated, but the JSON object must be complete and valid.

REQUIRED top-level keys: "fmt":"mvx-songdoc-1", "pads":[…], "patterns":[…].
OPTIONAL: "title", "bpm" 1-999, "swing" 0-0.6, "human" 0-1, "loop":true, "song":[[patternIndex,repeats],…].

pads[]  (up to 16 voices; pad 0 is first):
  {"preset":"<id>","note":<MIDI 60=C4>,"gain":0-1.2,"pan":-1..1,"rev":0-1,"dly":0-1,"choke":0-8}
  preset ids —
    drums:  dkick dsnare dclap dhat dohat drim dtom dcow dshk dcong
    bass:   b808 bsub breese bfm
    keys:   pgrand pfelt kep korg
    lead:   lsuper lpluck pwarm
    orch:   scello sens spizz brs bstab
    fx:     xbell xglass xzap xsweep xgrain

patterns[]  (up to 8, each 16 steps):
  {"steps":{"<padIndex>":[[step,vel,pitch],…]},"sil":[steps],"bpm":null}
    step 0-15 · vel 0-1 · pitch = semitones (optional; 0 or omit for none).
    Put SEVERAL entries on the same step (same pad) for a CHORD.
    "bpm": null follows the song tempo; a NEGATIVE bpm plays that pattern BACKWARDS.
    "sil": steps where all sound cuts until the next hit (optional; [] is fine).

OPTIONAL mix — use a single value, not a list:
  "revType":"hall"  (or room, plate, spring, cath, gated) · "revSize":0.8-6
  "dlyMode":"digital"  (or pingpong, tape) · "delayDiv":0.375 · "delayFb":0-0.85
  "sidechain":{"on":true,"trig":<padIndex>,"depth":0-0.95}

===== COPY-PASTE EXAMPLE (this exact JSON loads and plays) =====
`+JSON.stringify(SONGDOC_EXAMPLE,null,2);
/* AIs almost always wrap JSON in a ```json fence with prose around it, or add
   a sentence before/after. Be forgiving: strip fences, then fall back to the
   outermost {...} so a normal chat reply still loads. */
function parseSongDocText(t){
  if(t&&typeof t==='object') return t;
  if(typeof t!=='string') return null;
  let s=t.trim();
  const fence=s.match(/```(?:json)?\s*([\s\S]*?)```/i);   // ```json … ``` (or plain ``` … ```)
  if(fence) s=fence[1].trim();
  try{ return JSON.parse(s); }catch(e){}
  const a=s.indexOf('{'), b=s.lastIndexOf('}');            // pull the JSON object out of surrounding text
  if(a>=0&&b>a){ try{ return JSON.parse(s.slice(a,b+1)); }catch(e){} }
  return null;
}
async function loadSongDoc(doc){
  if(kitBusy) return false;
  if(typeof doc==='string'){
    const parsed=parseSongDocText(doc);
    if(!parsed){ lcd('SONG DOC: couldn’t find valid JSON. Paste the AI’s reply — a { … } object is enough (code fences and extra text are OK).'); return false; }
    doc=parsed;
  }
  if(!doc||doc.fmt!=='mvx-songdoc-1'||!Array.isArray(doc.pads)||!Array.isArray(doc.patterns)){
    lcd('SONG DOC: bad format — need fmt "mvx-songdoc-1" with pads[] and patterns[]. Tap SPEC for the schema.'); return false; }
  kitBusy=true;
  ensureAudio();
  try{
    lcd('RENDERING “'+(doc.title||'song')+'” …');
    try{ panicVoices(); }catch(e){}
    for(let i=0;i<NPADS;i++){ S.pads[i]=newPad(i); delete warpOrig[i]; }   // a doc defines the WHOLE session — no leftovers
    let loadedPads=0; const unknownPresets=[]; let namedOnly=0;
    for(let i=0;i<Math.min(16,doc.pads.length);i++){
      const pd=doc.pads[i]; if(!pd) continue;
      if(!pd.preset){ if(pd.name) namedOnly++; continue; }   // sampled/recorded pads carry a name only — can't re-synthesize from text
      const def=PRESETS.find(x=>x.id===pd.preset);
      if(!def){ unknownPresets.push(pd.preset); plog('songdoc: unknown preset "'+pd.preset+'" on pad '+i+' — skipped'); continue; }
      const note=pd.note!=null?pd.note:def.note;
      const buf=await renderPreset(def,note);
      assignBufToPad(i,buf,def.name);
      S.pads[i].srcPreset=def.id; S.pads[i].srcNote=note;
      ['gain','pan','rev','dly','choke','eqLo','eqMid','eqHi','att','rel','mode'].forEach(k=>{ if(pd[k]!=null) S.pads[i][k]=pd[k]; });
      loadedPads++;
    }
    if(loadedPads===0){   // don't silently say LOADED when nothing landed — the #1 AI-jam failure
      kitBusy=false;
      const why = unknownPresets.length
        ? 'the preset id'+(unknownPresets.length>1?'s':'')+' '+[...new Set(unknownPresets)].map(x=>'"'+x+'"').join(', ')+' aren’t in JBH-88'
        : (namedOnly? 'the pads have names but no "preset" (sampled pads can’t be rebuilt from text)' : 'no pad had a valid "preset"');
      plog('SONG DOC loaded 0 pads — '+why+'. Valid ids are in SPEC.');
      lcd('SONG DOC: nothing to play — '+why+'. Tap SPEC for the exact preset ids and hand it back to the AI.');
      return false;
    }
    const P=Array.from({length:NPAT},()=>newPattern());
    doc.patterns.slice(0,NPAT).forEach((pp,pi)=>{
      if(!pp) return;
      if(pp.bpm!=null) P[pi].bpm=clampBpm(pp.bpm);
      if(PATLENS.indexOf(pp.len|0)>=0 && !pp.steps) {}
      if(pp.plen!=null && PATLENS.indexOf(pp.plen|0)>=0){ P[pi].plen=pp.plen|0; P[pi].len=new Array(NPADS).fill(pp.plen|0); }
      if(Array.isArray(pp.sil)) pp.sil.forEach(x=>{ const st=x|0; if(st>=0&&st<MAXSTEPS) P[pi].sil[st]=1; });
      if(pp.steps) for(const k in pp.steps){
        const pad=parseInt(k,10); if(!(pad>=0&&pad<NPADS)) continue;
        const byStep={};
        (pp.steps[k]||[]).forEach(ev=>{
          if(!Array.isArray(ev)) return;
          const st=ev[0]|0, vel=ev[1]!=null?ev[1]:0.9, pitch=Math.round(ev[2]||0);
          if(st<0||st>=MAXSTEPS) return;
          P[pi].steps[pad][st]=clamp(vel,0.05,1);
          (byStep[st]=byStep[st]||[]).push(pitch);   // several entries on one step = a chord
        });
        for(const st in byStep){
          const set=Array.from(new Set(byStep[st])).sort((a,b)=>a-b), kk=pad+':'+st;
          if(set.length>1){ const lk=P[pi].locks[kk]||{}; lk.pitches=set; lk.pitch=set[0]; P[pi].locks[kk]=lk; }
          else if(set[0]){ const lk=P[pi].locks[kk]||{}; lk.pitch=set[0]; P[pi].locks[kk]=lk; }
        }
      }
      if(pp.locks) for(const kk in pp.locks){
        const src=pp.locks[kk]||{}, lk=P[pi].locks[kk]||{};
        if(src.pitch!=null) lk.pitch=Math.round(src.pitch);
        if(src.prob!=null) lk.prob=clamp(src.prob,0,1);
        if(src.rat!=null&&src.rat>1) lk.rat=clamp(src.rat|0,2,4);
        if(src.nudge!=null) lk.nudge=clamp(src.nudge,-0.5,0.5);
        if(Object.keys(lk).length) P[pi].locks[kk]=lk;
      }
      if(pp.len) for(const k in pp.len){ const pad=parseInt(k,10); if(pad>=0&&pad<NPADS) P[pi].len[pad]=clamp(pp.len[k]|0,1,patLen(P[pi])); }
    });
    S.patterns=P; S.pattern=0;
    S.song=Array.isArray(doc.song)? doc.song.filter(x=>Array.isArray(x)).map(x=>({pat:clamp(x[0]|0,0,NPAT-1),reps:clamp(x[1]|0,1,64)})) : [];
    S.songOn=S.song.length>0; S.songLoop=doc.loop!==false; songPos=0; songRep=0;
    S.chain=[]; S.chainOn=false; S.chainPos=0; S.morph.on=false; S.morph.amt=0; S.morph.pos=0; morphBuf=null;
    S.ptnBpm=doc.patterns.some(pp=>pp&&pp.bpm!=null); $('btnPtnBpm').classList.toggle('on',S.ptnBpm);
    if(doc.bpm!=null) setBpm(doc.bpm);
    if(doc.swing!=null){ S.swing=clamp(doc.swing,0,0.6); $('swing').value=S.swing; $('swingV').textContent=Math.round(S.swing*100)+'%'; }
    if(doc.human!=null){ S.human=clamp(doc.human,0,1); $('human').value=S.human; $('humanV').textContent=Math.round(S.human*100)+'%'; }
    if(doc.silFade!=null){ S.silFade=clamp(doc.silFade,0.005,0.6); $('silFade').value=S.silFade; $('silFadeV').textContent=Math.round(S.silFade*1000)+'ms'; }
    if(doc.revType&&['hall','room','plate','spring','cath','gated'].indexOf(doc.revType)>=0){ S.revType=doc.revType; $('mxRevType').value=doc.revType; }
    if(doc.revSize!=null){ S.revSize=clamp(doc.revSize,0.8,6); $('mxRevSize').value=S.revSize; $('mxRevSizeV').textContent=S.revSize.toFixed(1)+'s'; }
    if(doc.dlyMode&&['digital','pingpong','tape'].indexOf(doc.dlyMode)>=0){ S.dlyMode=doc.dlyMode; $('mxDlyMode').value=doc.dlyMode; }
    if(doc.delayDiv!=null){ S.delayDiv=doc.delayDiv; $('mxDlyDiv').value=String(doc.delayDiv); }
    if(doc.delayFb!=null){ S.delayFb=clamp(doc.delayFb,0,0.85); $('mxDlyFb').value=S.delayFb; $('mxDlyFbV').textContent=Math.round(S.delayFb*100)+'%'; }
    if(doc.dlyTone!=null){ S.dlyTone=clamp(doc.dlyTone,500,12000); $('mxDlyTone').value=S.dlyTone; $('mxDlyToneV').textContent=Math.round(S.dlyTone/100)/10+'k'; }
    const sc=doc.sidechain||{};
    S.scOn=!!sc.on; if(sc.trig!=null)S.scTrig=clamp(sc.trig|0,0,NPADS-1);
    if(sc.depth!=null)S.scDepth=clamp(sc.depth,0,0.95); if(sc.rel!=null)S.scRel=clamp(sc.rel,0.05,0.6);
    if(AC&&LIVE){ LIVE.conv.buffer=makeIR(AC,S.revSize,S.revType); buildDelayNet(AC,LIVE); reapplyLivePads(); }
    scApplyRouting(); drawSidechain();
    S.bank=0; S.editPad=0; S.seqPad=0;
    $('projName').value=(doc.title||'songdoc').slice(0,40);
    buildPads(); drawPads(); drawEdit(); drawSeq(); drawFader(); drawMixer(); drawSong(); dirty();
    const skip = unknownPresets.length ? ' ('+unknownPresets.length+' unknown preset'+(unknownPresets.length>1?'s':'')+' skipped — see PROJ log)' : '';
    lcd('“'+(doc.title||'song')+'” LOADED · '+loadedPads+' pad'+(loadedPads>1?'s':'')+skip+' — press PLAY ♪');
    return true;
  }catch(err){ lcd('SONG DOC FAILED: '+(err&&err.message||'error')); return false; }
  finally{ kitBusy=false; }
}
function exportSongDoc(){
  const pads=[];
  for(let i=0;i<16;i++){ const p=S.pads[i];
    if(p.bufId<0){ pads.push(null); continue; }
    const o={preset:p.srcPreset||null};
    if(p.srcNote!=null) o.note=p.srcNote;
    if(!o.preset) o.name=p.name;    // sampled/recorded pads can't be re-synthesized from text
    o.gain=+p.gain.toFixed(2); if(p.pan)o.pan=+p.pan.toFixed(2);
    if(p.rev)o.rev=+p.rev.toFixed(2); if(p.dly)o.dly=+p.dly.toFixed(2);
    if(p.choke)o.choke=p.choke; if(p.eqLo)o.eqLo=p.eqLo; if(p.eqMid)o.eqMid=p.eqMid; if(p.eqHi)o.eqHi=p.eqHi;
    pads.push(o);
  }
  const patterns=S.patterns.map(pt=>{
    const steps={};
    for(let p=0;p<NPADS;p++){ const evs=[];
      for(let st=0;st<patLen(pt);st++){ const v=pt.steps[p][st]; if(v>0){
        const lk=pt.locks[p+':'+st];
        const pitches=(lk&&lk.pitches&&lk.pitches.length)?lk.pitches:[(lk&&lk.pitch)||0];   // a chord exports as one entry per note
        pitches.forEach(po=>{ evs.push(po?[st,+v.toFixed(2),po]:[st,+v.toFixed(2)]); }); } }
      if(evs.length) steps[p]=evs; }
    const locks={};
    for(const k in pt.locks){ const lk=pt.locks[k], o={};
      if(lk.prob!=null) o.prob=lk.prob; if(lk.rat>1) o.rat=lk.rat; if(lk.nudge) o.nudge=lk.nudge;
      if(Object.keys(o).length) locks[k]=o; }
    const sil=[]; (pt.sil||[]).forEach((v,i)=>{ if(v) sil.push(i); });
    const o={steps};
    if(patLen(pt)!==NSTEPS) o.plen=patLen(pt);
    if(Object.keys(locks).length) o.locks=locks;
    if(sil.length) o.sil=sil;
    if(pt.bpm!=null) o.bpm=pt.bpm;
    return o;
  });
  return { fmt:'mvx-songdoc-1', title:$('projName').value, bpm:S.bpm, swing:S.swing, human:S.human, silFade:S.silFade,
    revType:S.revType, revSize:S.revSize, dlyMode:S.dlyMode, delayDiv:S.delayDiv, delayFb:S.delayFb, dlyTone:S.dlyTone,
    sidechain:{on:S.scOn,trig:S.scTrig,depth:S.scDepth,rel:S.scRel},
    loop:S.songLoop, song:S.song.map(x=>[x.pat,x.reps]), pads, patterns };
}
window.MVX={ get version(){ return BUILD; }, spec:SONGDOC_SPEC,
  load:d=>loadSongDoc(d), export:exportSongDoc, play:()=>startSeq(), stop:()=>stopSeq() };
window.JBH=window.MVX;   // JBH-88 is the current name; window.MVX kept as a back-compat alias

/* ============ "Mirrors for Machines" — composition #2 by Claude ============
   Melodic techno, D minor, 126 BPM: Dm | Bb | F | C. Written AS a song doc —
   the same format any AI can paste in. Two patterns carry NEGATIVE tempo
   (they play backwards: the mirror), and the SILENCER punctuates the mirror
   and the breakdown. A machine writing music that literally reverses itself. */
const MIRRORS_DOC={ fmt:'mvx-songdoc-1', title:'Mirrors for Machines',
  bpm:126, swing:0.04, human:0.18, silFade:0.08,
  revType:'plate', revSize:2.6, dlyMode:'pingpong', delayDiv:0.375, delayFb:0.34, dlyTone:5200,
  sidechain:{on:true,trig:0,depth:0.4,rel:0.22}, loop:true,
  song:[[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[2,2],[3,2],[5,2],[4,2],[7,2]],
  pads:[
    {preset:'dkick',note:36,gain:0.95},
    {preset:'dclap',note:39,gain:0.75,rev:0.18},
    {preset:'dhat',note:42,gain:0.55,pan:0.2,choke:1},
    {preset:'dohat',note:46,gain:0.45,pan:0.2,rev:0.1,choke:1},
    {preset:'dshk',note:70,gain:0.4,pan:-0.35},
    {preset:'drim',note:37,gain:0.5,pan:-0.25},
    {preset:'dcow',note:56,gain:0.5,pan:0.3},
    {preset:'bsub',note:38,gain:0.95},
    {preset:'lsuper',note:62,gain:0.65,rev:0.25,dly:0.2},
    {preset:'lpluck',note:74,gain:0.6,pan:-0.2,rev:0.25,dly:0.3},
    {preset:'korg',note:50,gain:0.6,pan:0.15,rev:0.2},
    {preset:'xbell',note:74,gain:0.45,pan:0.35,rev:0.5,dly:0.25},
    {preset:'pwarm',note:50,gain:0.5,rev:0.4},
    {preset:'xglass',note:62,gain:0.45,rev:0.5},
    {preset:'xsweep',note:60,gain:0.55,rev:0.3},
    {preset:'xzap',note:69,gain:0.5,pan:-0.3,dly:0.3},
  ],
  patterns:[
  { steps:{ 9:[[0,0.6,0],[2,0.55,3],[4,0.6,7],[6,0.55,12],[8,0.6,-4],[10,0.55,0],[12,0.6,3],[14,0.55,8]],
            12:[[0,0.5,0],[8,0.5,-4]], 13:[[0,0.35]], 4:[[2,0.35],[6,0.35],[10,0.35],[14,0.35]],
            0:[[0,0.7]], 11:[[12,0.3,12]] },
    locks:{'11:12':{prob:0.5}} },
  { steps:{ 0:[[0,0.95],[4,0.95],[8,0.95],[12,0.95]], 1:[[4,0.75],[12,0.75]],
            3:[[2,0.45],[10,0.45]], 2:[[6,0.5],[14,0.5]],
            4:[[0,0.3],[2,0.3],[4,0.3],[6,0.3],[8,0.3],[10,0.3],[12,0.3],[14,0.3]],
            7:[[2,0.9,0],[6,0.85,0],[10,0.9,-4],[14,0.85,-4]],
            9:[[0,0.5,0],[2,0.45,3],[4,0.5,7],[6,0.45,12],[8,0.5,-4],[10,0.45,0],[12,0.5,3],[14,0.45,8]],
            12:[[0,0.5,0],[8,0.5,-4]], 5:[[7,0.4]] },
    locks:{'5:7':{prob:0.6}} },
  { steps:{ 0:[[0,0.95],[4,0.95],[8,0.95],[12,0.95]], 1:[[4,0.75],[12,0.75]],
            3:[[2,0.45],[10,0.45]], 2:[[6,0.5],[14,0.5]],
            4:[[0,0.3],[2,0.3],[4,0.3],[6,0.3],[8,0.3],[10,0.3],[12,0.3],[14,0.3]],
            7:[[2,0.9,0],[6,0.85,0],[10,0.9,-4],[14,0.85,-4]],
            8:[[0,0.8,7],[2,0.7,5],[4,0.75,3],[7,0.7,0],[8,0.8,8],[10,0.7,7],[12,0.75,3],[15,0.65,5]],
            9:[[1,0.4,12],[9,0.4,8]], 12:[[0,0.5,0],[8,0.5,-4]], 5:[[7,0.4]] },
    locks:{'9:1':{prob:0.5},'9:9':{prob:0.5},'5:7':{prob:0.6}} },
  { steps:{ 0:[[0,0.95],[4,0.95],[8,0.95],[12,0.95]], 1:[[4,0.75],[12,0.75]],
            3:[[2,0.45],[10,0.45]], 2:[[6,0.5],[14,0.5]],
            4:[[0,0.3],[2,0.3],[4,0.3],[6,0.3],[8,0.3],[10,0.3],[12,0.3],[14,0.3]],
            6:[[3,0.5],[11,0.5],[14,0.45,-2]],
            7:[[2,0.9,3],[6,0.85,3],[10,0.9,-2],[14,0.85,-2]],
            10:[[0,0.7,3],[3,0.6,3],[8,0.7,-2],[11,0.6,-2]],
            8:[[4,0.7,10],[6,0.65,8],[12,0.7,5],[14,0.65,7]],
            12:[[0,0.5,3],[8,0.5,-2]] } },
  { bpm:-126,
    steps:{ 0:[[0,0.85],[4,0.85],[8,0.85],[12,0.85]],
            2:[[0,0.4],[2,0.4],[4,0.4],[6,0.4],[8,0.4],[10,0.4],[12,0.4],[14,0.4]],
            8:[[0,0.8,7],[2,0.7,5],[4,0.75,3],[7,0.7,0],[8,0.8,8],[10,0.7,7],[12,0.75,3],[15,0.65,5]],
            9:[[0,0.5,0],[2,0.45,3],[4,0.5,7],[6,0.45,12],[8,0.5,-4],[10,0.45,0],[12,0.5,3],[14,0.45,8]],
            12:[[0,0.5,0],[8,0.5,-4]], 11:[[5,0.35,15]] },
    sil:[8], locks:{'11:5':{prob:0.6}} },
  { steps:{ 0:[[0,0.95],[4,0.95],[8,0.95],[12,0.95]], 1:[[4,0.8],[12,0.8]],
            3:[[2,0.5],[10,0.5]],
            2:[[0,0.45],[1,0.3],[2,0.45],[3,0.3],[4,0.45],[5,0.3],[6,0.45],[7,0.3],[8,0.45],[9,0.3],[10,0.45],[11,0.3],[12,0.45],[13,0.3],[14,0.45],[15,0.45]],
            4:[[0,0.3],[2,0.3],[4,0.3],[6,0.3],[8,0.3],[10,0.3],[12,0.3],[14,0.3]],
            15:[[15,0.5]],
            7:[[2,0.95,0],[3,0.6,12],[6,0.9,0],[10,0.95,-4],[11,0.6,8],[14,0.9,-4]],
            8:[[0,0.8,7],[2,0.7,5],[4,0.75,3],[7,0.7,0],[8,0.8,8],[10,0.7,7],[12,0.75,3],[15,0.65,5]],
            10:[[7,0.5,0],[15,0.5,-4]],
            9:[[0,0.5,0],[2,0.45,3],[4,0.5,7],[6,0.45,12],[8,0.5,-4],[10,0.45,0],[12,0.5,3],[14,0.45,8]],
            11:[[0,0.35,12],[8,0.35,8]], 14:[[0,0.5]] },
    locks:{'2:15':{rat:2},'15:15':{prob:0.6},'14:0':{prob:0.5}} },
  { steps:{ 0:[[0,0.7]], 4:[[2,0.3],[6,0.3],[10,0.3],[14,0.3]],
            12:[[0,0.55,3],[8,0.55,-2]], 13:[[0,0.4,3]],
            10:[[4,0.45,3],[12,0.45,-2]],
            9:[[0,0.55,3],[2,0.5,7],[4,0.55,10],[6,0.5,15],[8,0.55,-2],[10,0.5,2],[12,0.55,5],[14,0.5,10]],
            11:[[10,0.35,15]], 7:[[0,0.8,3],[8,0.8,-2]] },
    sil:[12], locks:{'10:4':{prob:0.6},'10:12':{prob:0.6},'11:10':{prob:0.5}} },
  { bpm:-126,
    steps:{ 9:[[0,0.5,0],[2,0.45,3],[4,0.5,7],[6,0.45,12],[8,0.5,-4],[10,0.45,0],[12,0.5,3],[14,0.45,8]],
            12:[[0,0.5,0],[8,0.5,-4]], 13:[[0,0.4]], 0:[[0,0.6],[8,0.5]], 11:[[4,0.3,12]] },
    locks:{'11:4':{prob:0.5}} },
  ]};

/* ================= CLAUDE'S SONG — "Amber Signal" =================
   A composition by Claude, written as the factory demo. A-minor, 92 BPM,
   lo-fi cinematic hip-hop: Am | F | C | G under an e-piano arpeggio,
   with a pluck hook in the chorus and a cello answer in the breakdown.
   Built entirely from the in-house synth presets and sequenced with the
   app's own tools — pitch locks (melody), ratchets, probability ghost
   notes, sidechain pump, humanize, ping-pong delay, SONG arrangement:
   intro ×2 → build ×2 → verse ×4 → chorus ×4 → verse ×2 → chorus ×4 →
   breakdown ×2 → outro ×2. */
async function loadClaudeSong(){
  if(kitBusy) return; kitBusy=true;
  ensureAudio();
  try{
    lcd("BUILDING CLAUDE'S SONG …");
    const PADS=[ // [presetId, renderNote, tweaks] — pads A01–A16
      ['dkick',36,{gain:.95}],
      ['dsnare',38,{gain:.85,rev:.15}],
      ['dhat',42,{gain:.6,pan:.15,choke:1}],
      ['dohat',46,{gain:.5,pan:.15,rev:.12,choke:1}],
      ['dshk',70,{gain:.45,pan:.35}],
      ['drim',37,{gain:.55,pan:-.3,rev:.15}],
      ['bsub',33,{gain:.95}],                            // A1 — the root of the piece
      ['kep',57,{gain:.7,pan:.15,rev:.25,dly:.12}],      // A3 e-piano
      ['pwarm',45,{gain:.55,rev:.35}],                   // A2 pad
      ['scello',45,{gain:.65,pan:-.25,rev:.3}],          // A2 cello
      ['lpluck',69,{gain:.7,pan:-.2,rev:.3,dly:.25}],    // A4 pluck hook
      ['xbell',69,{gain:.5,pan:.3,rev:.5,dly:.2}],       // A4 bell accents
      ['dclap',39,{gain:.7,rev:.2}],
      ['xglass',57,{gain:.5,rev:.5}],                    // atmosphere
      ['xsweep',60,{gain:.55,rev:.3}],                   // riser into the chorus
      ['dcong',63,{gain:.55,pan:-.35}],
    ];
    for(let i=0;i<PADS.length;i++){
      const [pid,note,tw]=PADS[i], def=PRESETS.find(p=>p.id===pid);
      const buf=await renderPreset(def,note);
      assignBufToPad(i,buf,def.name);
      Object.assign(S.pads[i],tw);
    }
    // ---- patterns. Harmony offsets from A: Am=0, F=-4, C=+3, G=-2 ----
    const P=Array.from({length:NPAT},()=>newPattern());
    const N=(pi,pad,st,vel,pitch,x)=>{ P[pi].steps[pad][st]=vel;
      const lk={}; if(pitch) lk.pitch=pitch; if(x) Object.assign(lk,x);
      if(Object.keys(lk).length) P[pi].locks[pad+':'+st]=lk; };
    const arpAmF=[[0,0],[2,3],[4,7],[6,12],[8,-4],[10,0],[12,3],[14,8]];     // Am then F, broken
    const arpCG =[[0,3],[2,7],[4,10],[6,15],[8,-2],[10,2],[12,5],[14,10]];   // C then G
    const ep=(pi,arp,vel)=>arp.forEach(a=>N(pi,7,a[0],vel,a[1]));
    const verseDrums=pi=>{
      N(pi,0,0,.95); N(pi,0,7,.8); N(pi,0,10,.9);
      N(pi,1,4,.9); N(pi,1,12,.92);
      [0,2,4,6,8,10,12].forEach(s=>N(pi,2,s,.5)); N(pi,2,14,.5,0,{rat:2}); N(pi,2,7,.35,0,{prob:.6});
      [2,6,10,14].forEach(s=>N(pi,4,s,.4));
      N(pi,5,11,.4,0,{prob:.5});
    };
    const chorusDrums=pi=>{
      N(pi,0,0,.95); N(pi,0,6,.85); N(pi,0,10,.9);
      N(pi,1,4,.9); N(pi,1,12,.92); N(pi,12,4,.6); N(pi,12,12,.6);
      N(pi,3,2,.5); N(pi,3,10,.5);
      [0,4,6,8,12].forEach(s=>N(pi,2,s,.45)); N(pi,2,15,.45,0,{rat:2});
      [0,2,4,6,8,10,12,14].forEach(s=>N(pi,4,s,.3));
    };
    // P0 INTRO — e-piano alone with the pad breathing under it
    ep(0,arpAmF,.7); N(0,8,0,.55); N(0,8,8,.5,-4); N(0,13,0,.4,0,{prob:.7}); N(0,11,12,.35,12,{prob:.5});
    // P1 BUILD — heartbeat kick, shaker, rim ticks, riser at the turn
    ep(1,arpAmF,.7); N(1,8,0,.55); N(1,8,8,.5,-4); N(1,13,0,.35,0,{prob:.7});
    N(1,0,0,.6); N(1,0,8,.6); [2,6,10,14].forEach(s=>N(1,4,s,.45)); N(1,5,4,.45); N(1,5,12,.45);
    N(1,14,8,.5);
    // P2 VERSE Am|F
    verseDrums(2); ep(2,arpAmF,.6);
    N(2,6,0,.9); N(2,6,5,.85,0,{prob:.7}); N(2,6,8,.9,-4); N(2,6,13,.85,-4,{prob:.7});
    N(2,8,0,.5); N(2,8,8,.5,-4);
    // P3 VERSE C|G — cello slips in
    verseDrums(3); ep(3,arpCG,.6);
    N(3,6,0,.9,3); N(3,6,5,.85,3,{prob:.7}); N(3,6,8,.9,-2); N(3,6,13,.85,-2,{prob:.7});
    N(3,8,0,.5,3); N(3,8,8,.5,-2);
    N(3,9,0,.5,12); N(3,9,8,.5,10);
    // P4 CHORUS Am|F — the pluck hook, bass jumps the octave
    chorusDrums(4); ep(4,arpAmF,.5);
    N(4,6,0,.95); N(4,6,3,.7,12); N(4,6,5,.85); N(4,6,8,.95,-4); N(4,6,11,.7,8); N(4,6,13,.85,-4);
    N(4,10,0,.8,12); N(4,10,3,.75,7); N(4,10,6,.7,3); N(4,10,8,.8,8); N(4,10,11,.75,7); N(4,10,14,.7);
    N(4,8,0,.5); N(4,8,8,.5,-4); N(4,11,0,.3,12);
    // P5 CHORUS C|G — hook answers, congas talk
    chorusDrums(5); ep(5,arpCG,.5);
    N(5,15,3,.5); N(5,15,11,.5); N(5,15,14,.45,-3);
    N(5,6,0,.95,3); N(5,6,3,.7,15); N(5,6,5,.85,3); N(5,6,8,.95,-2); N(5,6,11,.7,10); N(5,6,13,.85,-2);
    N(5,10,0,.8,15); N(5,10,3,.75,10); N(5,10,6,.7,7); N(5,10,8,.8,10); N(5,10,10,.7,5); N(5,10,12,.7,2); N(5,10,14,.75,5);
    N(5,8,0,.5,3); N(5,8,8,.5,-2);
    // P6 BREAKDOWN — the floor drops out, cello sings the answer
    N(6,0,0,.7); N(6,0,10,.6); [2,6,10,14].forEach(s=>N(6,4,s,.35));
    N(6,8,0,.6); N(6,13,0,.35);
    N(6,9,0,.65,12); N(6,9,4,.6,15); N(6,9,8,.6,10); N(6,9,12,.65,7);
    N(6,7,6,.4,7,{prob:.6}); N(6,7,14,.4,3,{prob:.6});
    N(6,6,0,.8); N(6,6,8,.7,-2);
    // P7 OUTRO — back to the opening, bells say goodnight
    ep(7,arpAmF,.5); N(7,8,0,.5); N(7,13,0,.4); N(7,0,0,.5); N(7,0,8,.5);
    N(7,11,4,.35,12); N(7,11,12,.3,7); N(7,6,0,.6);
    S.patterns=P; S.pattern=0;
    // ---- arrangement ----
    S.song=[{pat:0,reps:2},{pat:1,reps:2},{pat:2,reps:2},{pat:3,reps:2},{pat:4,reps:2},{pat:5,reps:2},
            {pat:2,reps:1},{pat:3,reps:1},{pat:4,reps:2},{pat:5,reps:2},{pat:6,reps:2},{pat:7,reps:2}];
    S.songOn=true; S.songLoop=true; songPos=0; songRep=0;
    S.chain=[0,1,2,3,4,5,6,7]; S.chainOn=false; S.chainPos=0; S.morph.on=false; S.morph.amt=0; S.morph.pos=0; morphBuf=null;
    // ---- the mix ----
    setBpm(92);
    S.swing=.09; $('swing').value='0.09'; $('swingV').textContent='9%';
    S.human=.3; $('human').value='0.3'; $('humanV').textContent='30%';
    S.revType='hall'; S.revSize=3.2; $('mxRevType').value='hall'; $('mxRevSize').value=3.2; $('mxRevSizeV').textContent='3.2s';
    S.dlyMode='pingpong'; S.delayDiv=.375; S.delayFb=.3; S.dlyTone=4800;
    $('mxDlyMode').value='pingpong'; $('mxDlyDiv').value='0.375'; $('mxDlyFb').value=.3; $('mxDlyFbV').textContent='30%';
    $('mxDlyTone').value=4800; $('mxDlyToneV').textContent='4.8k';
    S.scOn=true; S.scTrig=0; S.scDepth=.35; S.scRel=.28;
    if(AC&&LIVE){
      LIVE.conv.buffer=makeIR(AC,S.revSize,S.revType);
      buildDelayNet(AC,LIVE);
      reapplyLivePads();
    }
    scApplyRouting(); drawSidechain();
    S.bank=0; S.editPad=7; S.seqPad=7;   // land on the e-piano so NOTES shows the melody
    $('projName').value="Claude's Song";
    buildPads(); drawPads(); drawEdit(); drawSeq(); drawFader(); drawMixer(); drawSong(); dirty();
    lcd("CLAUDE'S SONG · “Amber Signal” — press PLAY for the full arrangement ♪");
  }catch(err){ lcd('SONG FAILED: '+(err&&err.message?err.message:'error')); }
  finally{ kitBusy=false; }
}

/* ---------------- sample packs (download online → IndexedDB → offline) ----------------
   Encoded file bytes live on disk in IndexedDB (large quota, unlike RAM), so a big
   library survives offline and never inflates the session save. Bytes decode to an
   AudioBuffer only when you load one onto a pad. Persistent-storage is requested so
   iOS won't evict the library under pressure. */
let packManifest=null, packHaveKeys=new Set();
const LIBKEY=id=>'s:'+id;
async function refreshHaveKeys(){
  try{ const keys=await idbKeysS(IDB_LIB); packHaveKeys=new Set(keys.filter(k=>typeof k==='string'&&k.indexOf('s:')===0)); }
  catch(e){ packHaveKeys=new Set(); }
}
async function updateStoreMeter(){
  let txt='';
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est=await navigator.storage.estimate();
      const mb=x=>(x/1048576).toFixed(1)+'MB';
      txt=packHaveKeys.size+' samples · '+mb(est.usage||0)+' used';
      if(est.quota) txt+=' / '+mb(est.quota)+' free-quota';
    }else txt=packHaveKeys.size+' samples on device';
    let persisted=false;
    if(navigator.storage && navigator.storage.persisted) persisted=await navigator.storage.persisted();
    txt+=persisted?' · KEPT':'';
  }catch(e){ txt=packHaveKeys.size+' samples on device'; }
  $('packStore').textContent=txt;
}
function drawPackList(){
  const el=$('packList'); el.innerHTML='';
  if(!packManifest || !packManifest.samples || !packManifest.samples.length){
    el.innerHTML='<div class="packhdr">No pack loaded. Enter a manifest URL and tap LOAD PACK (online), or reopen to see downloaded samples.</div>';
    return;
  }
  const hd=document.createElement('div'); hd.className='packhdr';
  hd.textContent=(packManifest.name||'PACK')+' — '+packManifest.samples.length+' samples';
  el.appendChild(hd);
  packManifest.samples.forEach(sm=>{
    const have=packHaveKeys.has(LIBKEY(sm.id));
    const row=document.createElement('div'); row.className='packrow'+(have?' have':'');
    const cat=document.createElement('span'); cat.className='pcat'; cat.textContent=sm.cat||'';
    const nm=document.createElement('span'); nm.className='pnm'; nm.textContent=sm.name||sm.id;
    row.append(cat,nm);
    if(have){
      const pad=document.createElement('button'); pad.textContent='→ PAD'; pad.classList.add('on');
      pad.addEventListener('click',()=>libToPad(sm));
      const del=document.createElement('button'); del.innerHTML='&#215;';
      del.addEventListener('click',async ()=>{ await idbDelS(IDB_LIB,LIBKEY(sm.id)); await refreshHaveKeys(); drawPackList(); drawDownloads(); updateStoreMeter(); });
      row.append(pad,del);
    }else{
      const get=document.createElement('button'); get.textContent='GET';
      get.addEventListener('click',()=>libDownload(sm,get));
      row.append(get);
    }
    el.appendChild(row);
  });
}
function packBase(){ try{ return new URL($('packUrl').value, location.href).href; }catch(e){ return $('packUrl').value; } }
async function loadPack(){
  const url=packBase();
  lcd('LOADING PACK …');
  try{
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const man=await res.json();
    if(!man || !Array.isArray(man.samples)) throw new Error('bad manifest');
    man._url=url;
    packManifest=man;
    await idbPutS(IDB_LIB,'__manifest',man);   // cache so the list survives offline
    await refreshHaveKeys(); drawPackList(); updateStoreMeter();
    lcd('PACK: '+(man.name||'loaded')+' · '+man.samples.length+' samples — tap GET to store.');
  }catch(err){
    // offline / failed fetch — fall back to the last cached manifest
    try{ const cached=await idbGetS(IDB_LIB,'__manifest');
      if(cached){ packManifest=cached; await refreshHaveKeys(); drawPackList(); updateStoreMeter();
        lcd('OFFLINE — showing cached pack. Downloaded samples are usable; GET needs a connection.'); return; }
    }catch(e){}
    lcd('PACK LOAD FAILED: '+(err.message||'no connection & no cached pack'));
  }
}
async function libDownload(sm,btn){
  const base=packManifest && packManifest._url ? packManifest._url : packBase();
  let fileUrl; try{ fileUrl=new URL(sm.file, base).href; }catch(e){ fileUrl=sm.file; }
  if(btn){ btn.textContent='…'; btn.disabled=true; }
  lcd('DOWNLOADING '+sm.name+' …');
  try{
    const res=await fetch(fileUrl);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const bytes=await res.arrayBuffer();
    await idbPutS(IDB_LIB,LIBKEY(sm.id),{id:sm.id,name:sm.name,cat:sm.cat,type:res.headers.get('content-type')||'audio/wav',bytes});
    if(navigator.storage && navigator.storage.persist){ try{ await navigator.storage.persist(); }catch(e){} }
    await refreshHaveKeys(); drawPackList(); drawDownloads(); updateStoreMeter();
    lcd('STORED '+sm.name+' — now available offline. Tap → PAD to use.');
  }catch(err){
    if(btn){ btn.textContent='GET'; btn.disabled=false; }
    lcd('DOWNLOAD FAILED: '+(err.message||'no connection'));
  }
}
async function libToPad(sm){
  ensureAudio();
  lcd('LOADING '+sm.name+' → '+padName(S.editPad)+' …');
  try{
    const rec=await idbGetS(IDB_LIB,LIBKEY(sm.id));
    if(!rec || !rec.bytes) throw new Error('not on device — GET it first');
    const buf=await decode(rec.bytes.slice(0));   // slice: decodeAudioData detaches the buffer
    loadIntoTarget(buf,sm.name);
    hitLive(S.editPad,0.9);
  }catch(err){ lcd('LOAD FAILED: '+(err.message||'decode error')); }
}
$('packPick').addEventListener('change',e=>{
  const v=e.target.value;
  if(v==='custom'){ $('packUrlRow').style.display='flex'; $('packUrl').focus(); }
  else{ $('packUrlRow').style.display='none'; $('packUrl').value=v; }
});
$('btnPackLoad').addEventListener('click',loadPack);
$('btnPackPersist').addEventListener('click',async ()=>{
  if(navigator.storage && navigator.storage.persist){
    const ok=await navigator.storage.persist();
    lcd(ok?'STORAGE KEPT — iOS will not evict your library.':'Persistent storage not granted (library still works; may be evicted under pressure).');
    updateStoreMeter();
  }else lcd('Persistent storage API unavailable on this browser.');
});
/* MY DOWNLOADS — every stored sound, regardless of which pack it came from.
   Downloads live in IndexedDB keyed 's:<id>'; the pack list can only show the
   CURRENT pack, so anything from another pack used to be invisible AND
   undeletable. This lists them all with size, → PAD, and delete. */
let dlDrawing=false, dlAgain=false;
async function drawDownloads(){
  const el=$('dlList'); if(!el) return;
  // re-entrancy guard: this is async (one IDB read per sound), so two
  // overlapping calls would each clear then append — doubling every row.
  if(dlDrawing){ dlAgain=true; return; }
  dlDrawing=true;
  try{ await drawDownloadsInner(el); }
  finally{
    dlDrawing=false;
    if(dlAgain){ dlAgain=false; drawDownloads(); }
  }
}
async function drawDownloadsInner(el){
  el.innerHTML='';
  let keys=[];
  try{ keys=(await idbKeysS(IDB_LIB)).filter(k=>typeof k==='string'&&k.indexOf('s:')===0); }catch(e){}
  const rows=[]; let total=0;
  for(const k of keys){
    let rec=null; try{ rec=await idbGetS(IDB_LIB,k); }catch(e){}
    if(!rec) continue;
    const sz=(rec.bytes&&rec.bytes.byteLength)||0; total+=sz;
    rows.push({k,rec,sz});
  }
  $('dlInfo').textContent = rows.length
    ? rows.length+' sound'+(rows.length>1?'s':'')+' · '+fmtBytes(total)+' on this device'
    : 'Nothing downloaded yet — tap GET on a pack sample above.';
  $('btnDlClear').disabled = !rows.length;
  if(!rows.length){ el.innerHTML='<div style="font-size:11px;color:var(--txt-dim);padding:4px">Sounds you GET from a pack are saved here for offline use. They stay until you delete them.</div>'; return; }
  rows.sort((a,b)=>(a.rec.cat||'').localeCompare(b.rec.cat||'')||(a.rec.name||'').localeCompare(b.rec.name||''));
  rows.forEach(({k,rec,sz})=>{
    const row=document.createElement('div'); row.className='packrow have';
    const cat=document.createElement('span'); cat.className='pcat'; cat.textContent=rec.cat||'';
    const nm=document.createElement('span'); nm.className='pnm'; nm.textContent=(rec.name||rec.id)+'  ('+fmtBytes(sz)+')';
    const pad=document.createElement('button'); pad.textContent='→ PAD'; pad.classList.add('on');
    pad.addEventListener('click',()=>libToPad({id:rec.id,name:rec.name,cat:rec.cat}));
    const del=document.createElement('button'); del.innerHTML='&#215;'; del.title='delete this sound';
    del.addEventListener('click',async ()=>{
      if(!confirm('Delete “'+(rec.name||rec.id)+'” from this device?')) return;
      try{ await idbDelS(IDB_LIB,k); }catch(e){}
      await refreshHaveKeys(); drawPackList(); drawDownloads(); updateStoreMeter();
      lcd('DELETED “'+(rec.name||rec.id)+'” · '+fmtBytes(sz)+' freed.');
    });
    row.append(cat,nm,pad,del); el.appendChild(row);
  });
}
$('btnDlRefresh').addEventListener('click',async ()=>{ await refreshHaveKeys(); drawDownloads(); drawPackList(); updateStoreMeter(); lcd('Downloads list refreshed.'); });
$('btnDlClear').addEventListener('click',async ()=>{
  let keys=[]; try{ keys=(await idbKeysS(IDB_LIB)).filter(k=>typeof k==='string'&&k.indexOf('s:')===0); }catch(e){}
  if(!keys.length) return;
  if(!confirm('Delete ALL '+keys.length+' downloaded sound'+(keys.length>1?'s':'')+' from this device?\n\nPads already using them keep playing — this only clears the download store. Your projects are not touched.')) return;
  for(const k of keys){ try{ await idbDelS(IDB_LIB,k); }catch(e){} }
  await refreshHaveKeys(); drawPackList(); drawDownloads(); updateStoreMeter();
  lcd('CLEARED '+keys.length+' downloaded sound'+(keys.length>1?'s':'')+'.');
});
(async function initPacks(){
  await refreshHaveKeys();
  try{ const cached=await idbGetS(IDB_LIB,'__manifest'); if(cached) packManifest=cached; }catch(e){}
  drawPackList(); drawDownloads(); updateStoreMeter();
})();

/* ---------------- sequencer ---------------- */
let playing=false, curStep=0, nextStepTime=0, lastStepTime=0, seqTimer=0, seqSolo=false;
function stepDur(){ return 60/bpmAbs()/4; }

function schedStep(barStep, absStep, t){
  const sd=stepDur(), pat=curPat(), fired=[];
  const swing = (barStep%2===1) ? S.swing*sd : 0;
  if(pat.sil && pat.sil[posMod(absStep,patLen(pat))]){ silenceAt(LIVE, t+swing, S.silFade); silGateDown=true; }
  for(let p=0;p<NPADS;p++){
    if(seqSolo && p!==S.seqPad) continue;
    const L=trackLen(pat,p), idx=posMod(absStep,L);
    const v=pat.steps[p][idx];
    if(!(v>0)) continue;
    const lk=pat.locks && pat.locks[p+':'+idx];
    if(lk && lk.prob!=null && Math.random()>lk.prob) continue;   // probability
    let when=t+swing;
    if(lk && lk.nudge) when+=lk.nudge*sd;                        // micro-timing
    let hv=v;
    if(S.human>0){ when+=(Math.random()*2-1)*S.human*0.012;      // humanize: ±12ms drift + velocity breathing
      hv=clamp(v*(1-Math.random()*S.human*0.22),0.05,1);
      if(when<AC.currentTime) when=AC.currentTime; }
    // NOTES-lane harmony: a column can hold several pitches — fire the pad
    // once per note so they sound together as a chord.
    const chord=(lk&&lk.pitches&&lk.pitches.length)?lk.pitches:[(lk&&lk.pitch)||0];
    const rat=(lk&&lk.rat>1)?lk.rat:1;                           // ratchet / roll
    const creg=chord.length>1?null:chokeLive;                    // chord voices must not choke each other
    chord.forEach(pitchOff=>{
      if(rat>1){ const rd=sd/rat; for(let r=0;r<rat;r++) triggerPad(AC, LIVE, p, hv, when+r*rd, creg, pitchOff); }
      else triggerPad(AC, LIVE, p, hv, when, creg, pitchOff);
    });
    if(S.notesOut && midiOutDev){   // mirror the step (whole chord) to hardware
      const baseNote=(S.pads[p].note>=0?S.pads[p].note:36+p);
      chord.forEach(pitchOff=>{ const base=baseNote+pitchOff;
        if(rat>1){ const rd=sd/rat; for(let r=0;r<rat;r++) moNote(base,hv,when+r*rd,rd*0.8); }
        else moNote(base,hv,when,sd*0.85); });
    }
    fired.push({p,v:hv});
  }
  if(fired.length) lastFireT=performance.now();
  if(silGateDown && fired.length){ silRestore(LIVE, t+swing); silGateDown=false; }   // sound returns on the next hit
  const delay=Math.max(0,(t-AC.currentTime)*1000);
  setTimeout(()=>{ markStep(absStep); flashFired(fired); },delay);
}
function flashFired(fired){ // visual proof a row actually triggered
  const btns=document.querySelectorAll('#seqpadstrip button');
  fired.forEach(f=>{
    const p=f.p, v=f.v;
    flashPad(p,v);
    if(Math.floor(p/16)!==S.bank) return;
    const b=btns[p%16]; if(!b) return;
    b.classList.add('hit'); setTimeout(()=>b.classList.remove('hit'),80);
  });
}
function markStep(absStep){
  curAbsStep=absStep;
  const cur=posMod(absStep, trackLen(curPat(),S.seqPad));
  curStep=cur; lastStepTime=AC?AC.currentTime:0;
  document.querySelectorAll('#stepgrid .step').forEach((el,i)=>el.classList.toggle('cur',i===cur));
  const cur16=posMod(absStep,curPatLen());
  document.querySelectorAll('#silrow .step').forEach((el,i)=>el.classList.toggle('cur',i===cur16));
  if(notesMode) document.querySelectorAll('#notegrid .ncell').forEach(el=>el.classList.toggle('curcol',+el.dataset.col===cur));
  if(seqView==='circle') drawCircle();
}

/* ---------------- CIRCLE VIEW — the same pattern, drawn as rings -------------
   Each track becomes a ring whose segments are its steps, and each ring turns
   at its OWN length. Polymeter (already supported via per-track LEN) stops
   being an abstraction and becomes something you can watch drift. Grid and
   circle edit the same data; the toggle is purely how you look at it. */
let seqView='grid';
const CIRC={rings:[],cx:0,cy:0};
function circleTracks(){
  const pat=curPat(), list=[S.seqPad];
  for(let p=0;p<NPADS && list.length<8;p++){
    if(p===S.seqPad) continue;
    if(pat.steps[p].some(v=>v>0)) list.push(p);
  }
  return list;
}
function drawCircle(){
  const cv=$('circle'); if(!cv || seqView!=='circle') return;
  const {cx,W,H}=fitCanvas(cv), ccx=W/2, ccy=H/2;
  cx.fillStyle='#120d04'; cx.fillRect(0,0,W,H);
  const pat=curPat(), tracks=circleTracks();
  const outer=Math.min(W,H)*0.46, inner=Math.min(W,H)*0.14;
  const span=(outer-inner)/Math.max(1,tracks.length);
  CIRC.rings=[]; CIRC.cx=ccx; CIRC.cy=ccy;
  tracks.forEach((p,ri)=>{
    const r1=outer-ri*span, r0=r1-span*0.72;
    const len=trackLen(pat,p), row=pat.steps[p], isSel=(p===S.seqPad);
    const curIdx=playing?posMod(curAbsStep,len):-1;
    for(let i=0;i<len;i++){
      const a0=-Math.PI/2 + (i/len)*Math.PI*2 + 0.012;
      const a1=-Math.PI/2 + ((i+1)/len)*Math.PI*2 - 0.012;
      const v=row[i], on=v>0, isCur=(i===curIdx);
      cx.beginPath();
      cx.arc(ccx,ccy,r1,a0,a1); cx.arc(ccx,ccy,r0,a1,a0,true); cx.closePath();
      if(on){
        const al=isSel?(0.45+v*0.55):(0.20+v*0.28);
        cx.fillStyle=isSel?'rgba(255,140,46,'+al.toFixed(2)+')':'rgba(255,180,84,'+al.toFixed(2)+')';
      }else{
        cx.fillStyle=isSel?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.03)';
      }
      cx.fill();
      if(isCur){ cx.strokeStyle='#4aa3ff'; cx.lineWidth=isSel?4:2; cx.stroke(); }
      else if(isSel && i%4===0){ cx.strokeStyle='rgba(255,255,255,0.18)'; cx.lineWidth=1; cx.stroke(); }
    }
    // ring label
    cx.fillStyle=isSel?'#ffb454':'rgba(255,180,84,0.5)';
    cx.font=(isSel?'bold ':'')+Math.round(span*0.42)+'px ui-monospace';
    cx.textAlign='right'; cx.textBaseline='middle';
    cx.fillText(padName(p)+(len!==patLen(pat)?('/'+len):''), ccx-6, ccy-(r0+r1)/2+span*0.05);
    CIRC.rings.push({p,r0,r1,len});
  });
  if(morphActive()){                               // this is a blend, not the pattern
    cx.fillStyle='rgba(74,163,255,0.92)';
    cx.font='bold '+Math.round(W*0.028)+'px system-ui,sans-serif';
    cx.textAlign='center'; cx.textBaseline='top';
    cx.fillText('MORPH '+Math.round(S.morph.amt*100)+'% — showing the blend', ccx, 10);
  }
  // hub: pattern + selected track
  cx.textAlign='center'; cx.textBaseline='middle';
  cx.fillStyle='#8a6530'; cx.font='26px ui-monospace';
  cx.fillText('PTN '+(S.pattern+1), ccx, ccy-14);
  cx.fillStyle='#ffb454'; cx.font='bold 30px ui-monospace';
  cx.fillText(padName(S.seqPad), ccx, ccy+20);
}
function circleTap(clientX,clientY){
  const cv=$('circle'), r=cv.getBoundingClientRect();
  // CIRC.rings are in the canvas's logical space, not its backing pixels
  const base=canvasBase.get(cv)||{w:cv.width,h:cv.height};
  const sx=base.w/r.width, sy=base.h/r.height;
  const x=(clientX-r.left)*sx-CIRC.cx, y=(clientY-r.top)*sy-CIRC.cy;
  const rad=Math.hypot(x,y);
  const ring=CIRC.rings.find(g=>rad>=g.r0-2 && rad<=g.r1+2);
  if(!ring) return;
  if(ring.p!==S.seqPad){          // tapping an inner ring selects that track
    S.seqPad=ring.p; S.editPad=ring.p; manualPad=true;
    seqSelStep=-1; drawSeq(); drawPads(); drawCircle();
    lcd('TRACK '+padName(ring.p)+' selected — it moves to the outer ring.');
    return;
  }
  let ang=Math.atan2(y,x)+Math.PI/2;            // 0 at top, clockwise
  if(ang<0) ang+=Math.PI*2;
  const i=Math.floor(ang/(Math.PI*2)*ring.len)%ring.len;
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern], row=pat.steps[ring.p];
  const wasOn=row[i]>0;
  row[i]=wasOn?0:parseFloat($('stepVel').value);
  if(wasOn){ delete pat.locks[ring.p+':'+i]; if(playing) stopPadVoices(ring.p); }
  else if(!playing) hitLive(ring.p,row[i]);
  drawSteps(); drawCircle(); dirty();
}
$('circle').addEventListener('touchstart',e=>{ e.preventDefault(); const t=e.changedTouches[0]; circleTap(t.clientX,t.clientY); },{passive:false});
$('circle').addEventListener('mousedown',e=>circleTap(e.clientX,e.clientY));
function setSeqView(v){
  seqView=v;
  $('stepgrid').style.display = v==='grid' ? '' : 'none';
  $('circlewrap').style.display = v==='circle' ? '' : 'none';
  $('btnViewGrid').classList.toggle('on',v==='grid');
  $('btnViewCircle').classList.toggle('on',v==='circle');
  $('viewHint').textContent = v==='circle'
    ? 'rings turn at their own LEN — watch polymeter drift'
    : 'rows of steps';
  if(v==='circle') drawCircle();
  try{ localStorage.setItem('jbh_seqview',v); }catch(e){}
}
$('btnViewGrid').addEventListener('click',()=>setSeqView('grid'));
$('btnViewCircle').addEventListener('click',()=>setSeqView('circle'));
try{ const sv=localStorage.getItem('jbh_seqview'); if(sv==='circle') setSeqView('circle'); }catch(e){}
function seqTick(){
  while(nextStepTime < AC.currentTime + 0.12){
    schedStep(curStepSched, absStepSched, nextStepTime);
    if(S.clkOut && midiOutDev && !S.extClk){   // 24 PPQN = 6 ticks per 16th, scheduled on the step grid
      const sd=stepDur(); for(let k=0;k<6;k++) moSend([0xF8], nextStepTime+k*sd/6);
    }
    nextStepTime += stepDur();
    const dir=S.bpm<0?-1:1;                       // negative BPM: the sequence runs backwards
    const PL=curPatLen();
    curStepSched=posMod(curStepSched+dir,PL); absStepSched+=dir;
    const barDone = dir>0 ? curStepSched===0 : curStepSched===PL-1;
    if(barDone){                                   // the ARRANGEMENT still advances forward
      if(morphActive()){ morphBar(); }
      else if(S.chainOn && S.chain.length){
        S.chainPos=(S.chainPos+1)%S.chain.length; selectPattern(S.chain[S.chainPos]); drawSeq();
      } else if(S.songOn && S.song.length){ songAdvance(); }
    }
  }
}
let curStepSched=0, absStepSched=0, curAbsStep=0, songPos=0, songRep=0;
function startSeq(){
  ensureAudio();
  if(playing) return;
  playing=true;
  if(morphActive()){ S.morph.pos=Math.round(clamp(S.morph.amt,0,1)*S.morph.bars); selectPattern(S.morph.from); morphBuild(); drawSeq(); }
  else if(S.chainOn && S.chain.length){ S.chainPos=0; selectPattern(S.chain[0]); drawSeq(); }
  else if(S.songOn && S.song.length){ songPos=0; songRep=0; selectPattern(S.song[0].pat); drawSeq(); drawSong(); }
  else selectPattern(S.pattern);   // re-apply this pattern's own tempo before the clock is read
  curStepSched=0; curStep=0; absStepSched=0;
  nextStepTime=AC.currentTime+0.08;   // offsets set BEFORE the loop reads them (ordering fix)
  if(S.clkOut && !S.extClk) moSend([0xFA]);   // MIDI START — followers reset to bar 1
  wakeAcquire();                              // screen stays on = iOS audio session stays alive
  startTrax(nextStepTime);            // tape lanes roll (and record) from bar 1
  if(!S.extClk) seqTimer=setInterval(seqTick,25);
  autoStart();
  $('btnPlay').classList.add('on');
  lcd('PLAY · PTN '+(S.pattern+1)+(S.extClk?' · EXT CLK':''));
}
/* ---- SILENCER: a sequenced cut. Fades every sounding voice and chokes the
   FX tails at an exact step time; the master gate reopens on the next hit
   (programmed or played). Shared by the live graph and the offline bounce. ---- */
let silGateDown=false;
function silenceAt(g, t, fade){
  const f=Math.max(0.004,fade||0.06);
  for(let i=0;i<NPADS;i++){ const act=g.pads[i]&&g.pads[i].act;
    if(act) act.forEach(v=>{ try{ v.env.gain.cancelScheduledValues(t); v.env.gain.setTargetAtTime(0,t,f/3); v.src.stop(t+f+0.15); }catch(e){} });
  }
  try{ const gn=g.perfGain.gain; gn.cancelScheduledValues(t); gn.setValueAtTime(1,t); gn.linearRampToValueAtTime(0.0001,t+f); }catch(e){}
  if(g===LIVE && S.notesOut) moAllOff(t);   // the SILENCER cuts hardware synths too
}
function silRestore(g, t){
  try{ const gn=g.perfGain.gain; gn.cancelScheduledValues(t); gn.setValueAtTime(0.0001,t); gn.linearRampToValueAtTime(1,t+0.008); }catch(e){}
}
function panicVoices(){ // silence every sounding pad voice immediately (short click-free fade)
  try{ repStopAll(); }catch(e){}
  try{ grainStopAll(); for(const k in grainVoices) grainCut(+k); }catch(e){}
  if(!AC||!LIVE) return;
  const t=AC.currentTime;
  for(let i=0;i<NPADS;i++){ const act=LIVE.pads[i]&&LIVE.pads[i].act;
    if(act){ act.forEach(v=>{ try{ v.env.gain.cancelScheduledValues(t); v.env.gain.setTargetAtTime(0,t,0.012); v.src.stop(t+0.06); }catch(e){} }); act.length=0; } }
  Object.keys(activeEnv).forEach(k=>delete activeEnv[k]);
  Object.keys(chokeLive).forEach(k=>delete chokeLive[k]);
}
function stopSeq(){
  playing=false; clearInterval(seqTimer);
  wakeRelease();
  if(S.clkOut) moSend([0xFC]);        // MIDI STOP
  if(S.notesOut) moAllOff();          // stuck-note failsafe
  stopTraxVoices();
  try{ grainStopAll(); }catch(e){}
  panicVoices();                 // STOP silences sounding samples (long one-shots don't ring on)
  if(silGateDown && LIVE){ silRestore(LIVE, AC.currentTime); silGateDown=false; }
  $('btnPlay').classList.remove('on');
  document.querySelectorAll('#stepgrid .step').forEach(el=>el.classList.remove('cur'));
  lcd('STOP.');
  if(traxCap) traxCommit();      // last, so a take message (incl. the silent-take warning) isn't clobbered by "STOP."
}
$('btnPlay').addEventListener('click',startSeq);
$('btnStop').addEventListener('click',stopSeq);
$('btnRec').addEventListener('click',()=>{ S.liveRec=!S.liveRec; $('btnRec').classList.toggle('on',S.liveRec); $('btnLiveRec').classList.toggle('on',S.liveRec); lcd(S.liveRec?'STEP REC ARMED — pad hits write steps, not audio. For audio: LIVE \u25cf REC or TRAX.':'STEP REC OFF'); });
$('btnLiveRec').addEventListener('click',()=>$('btnRec').click());

function setBpm(b){
  if(b===0) b=S.bpm>0?-1:1;   // crossing zero flips direction
  S.bpm=clampBpm(b);
  $('bpmRev').classList.toggle('on',S.bpm<0);
  if(S.ptnBpm && !S.extClk && !vinylOn) S.patterns[S.pattern].bpm=S.bpm;
  $('bpmval').value=S.bpm.toFixed(1);
  $('djBpm').value=S.bpm; $('djBpmV').textContent=S.bpm.toFixed(1);
  liveDelaySync();
  refreshLfoRates();
  scheduleAutoWarp();
  dirty(); }
$('bpmUp').addEventListener('click',()=>setBpm(S.bpm+1));
$('bpmDown').addEventListener('click',()=>setBpm(S.bpm-1));
$('bpmHalf').addEventListener('click',()=>{ setBpm(S.bpm/2); lcd('HALF TIME · '+S.bpm.toFixed(1)+' BPM'); });
$('bpmDbl').addEventListener('click',()=>{ setBpm(S.bpm*2); lcd('DOUBLE TIME · '+S.bpm.toFixed(1)+' BPM'); });
$('bpmRev').addEventListener('click',()=>{ setBpm(-S.bpm);
  lcd(S.bpm<0?'REVERSE · sequencer runs backwards at '+Math.abs(S.bpm).toFixed(1)+' BPM':'FORWARD · '+S.bpm.toFixed(1)+' BPM'); });
$('bpmval').addEventListener('change',e=>{ const v=parseFloat(e.target.value); if(isFinite(v)) setBpm(v); else setBpm(S.bpm); });
$('djBpm').addEventListener('input',e=>setBpm(parseFloat(e.target.value)));
$('swing').addEventListener('input',e=>{ S.swing=parseFloat(e.target.value); $('swingV').textContent=Math.round(S.swing*100)+'%'; dirty(); });
$('human').addEventListener('input',e=>{ S.human=parseFloat(e.target.value); $('humanV').textContent=Math.round(S.human*100)+'%'; dirty(); });

/* ---------------- DJ deck ---------------- */
let vinylOn=false, vinylBaseBpm=100;
function drawFader(){
  const st=perfPitch;
  $('pfaderthumb').style.top='calc('+(50-st/12*50)+'% - 17px)';
  $('pfaderval').textContent=(st>=0?'+':'')+st.toFixed(1)+' st';
}
function setPerfPitch(st){
  perfPitch=clamp(st,-12,12);
  drawFader(); updatePerf();
  if(vinylOn) setBpm(vinylBaseBpm*Math.pow(2,perfPitch/12));
}
(function(){
  const f=$('pfader');
  function fromY(clientY){
    const r=f.getBoundingClientRect();
    const n=clamp((clientY-r.top)/r.height,0,1);   // 0 top .. 1 bottom
    setPerfPitch((0.5-n)*24);
  }
  f.addEventListener('touchstart',e=>{ e.preventDefault(); ensureAudio(); fromY(e.changedTouches[0].clientY); },{passive:false});
  f.addEventListener('touchmove',e=>{ e.preventDefault(); fromY(e.changedTouches[0].clientY); },{passive:false});
  let md=false;
  f.addEventListener('mousedown',e=>{ md=true; ensureAudio(); fromY(e.clientY); });
  window.addEventListener('mousemove',e=>{ if(md) fromY(e.clientY); });
  window.addEventListener('mouseup',()=>{ md=false; });
  f.addEventListener('dblclick',()=>setPerfPitch(0));
})();
$('btnVinyl').addEventListener('click',()=>{
  vinylOn=!vinylOn; $('btnVinyl').classList.toggle('on',vinylOn);
  if(vinylOn){ vinylBaseBpm=S.bpm/Math.pow(2,perfPitch/12); setBpm(vinylBaseBpm*Math.pow(2,perfPitch/12)); lcd('VINYL: tempo rides the fader'); }
  else lcd('VINYL OFF: fader is pitch-only');
});

/* wheel — drag to bend, springs back to 0 */
(function(){
  const w=$('wheel');
  let dragging=false, startY=0, raf=0;
  function setBend(st){
    perfBend=clamp(st,-7,7);
    $('wheelval').textContent=(perfBend>=0?'+':'')+perfBend.toFixed(1)+' st';
    w.style.transform='rotate('+(perfBend*8)+'deg)';
    updatePerf();
  }
  function spring(){
    cancelAnimationFrame(raf);
    (function step(){
      if(dragging) return;
      perfBend*=0.82;
      if(Math.abs(perfBend)<0.02){ setBend(0); return; }
      setBend(perfBend);
      raf=requestAnimationFrame(step);
    })();
  }
  function start(y){ dragging=true; startY=y; ensureAudio(); cancelAnimationFrame(raf); }
  function move(y){ if(dragging) setBend((startY-y)/18); }
  function end(){ dragging=false; spring(); }
  w.addEventListener('touchstart',e=>{ e.preventDefault(); start(e.changedTouches[0].clientY); },{passive:false});
  w.addEventListener('touchmove',e=>{ e.preventDefault(); move(e.changedTouches[0].clientY); },{passive:false});
  w.addEventListener('touchend',e=>{ e.preventDefault(); end(); },{passive:false});
  w.addEventListener('mousedown',e=>start(e.clientY));
  window.addEventListener('mousemove',e=>{ if(dragging) move(e.clientY); });
  window.addEventListener('mouseup',()=>{ if(dragging) end(); });
})();
$('warbDepth').addEventListener('input',e=>{
  const v=parseFloat(e.target.value);
  $('warbDepthV').textContent=Math.round(v/0.12*100)+'%';
  ensureAudio();
  if(LIVE.warbGain) LIVE.warbGain.gain.setTargetAtTime(v,AC.currentTime,0.05);
});
$('warbRate').addEventListener('input',e=>{
  const v=parseFloat(e.target.value);
  $('warbRateV').textContent=v.toFixed(1)+'Hz';
  ensureAudio();
  if(LIVE.warbOsc) LIVE.warbOsc.frequency.setTargetAtTime(v,AC.currentTime,0.05);
});

/* jam recorder — sample-accurate PCM tap on the master bus.
   MediaRecorder compressed to AAC and iOS can stamp the wrong sample
   rate into that container, so captures decoded back pitch/tempo-shifted.
   Tapping the compressor output into Float32 chunks keeps everything at
   the context rate — the pad plays back exactly what was heard, and
   SAVE writes lossless WAV instead of M4A. */
let jamTap=null, jamCap=null, jamL=[], jamR=[], jamLen=0, jamOn=false, jamBuf=null;
const JAM_MAX_S=300;
function jamStamp(){ return 'jam-'+new Date().toISOString().slice(11,19).replace(/:/g,''); }
$('btnJam').addEventListener('click',()=>{
  if(jamOn){ stopJam(); return; }
  ensureAudio();
  jamL=[]; jamR=[]; jamLen=0; jamBuf=null;
  try{
    jamCap=makeCaptureTap(AC,(l,r,frames)=>{
      if(!jamOn) return;
      jamL.push(l.buffer?l:new Float32Array(l));      // worklet hands us owned arrays
      jamR.push(r.buffer?r:new Float32Array(r));
      jamLen+=frames;
      if(jamLen>=AC.sampleRate*JAM_MAX_S) stopJam();
    });
    jamTap=jamCap.node;
    LIVE.softclip.connect(jamTap);
  }catch(e){ jamTap=null; lcd('REC OUT unavailable: '+(e.message||'no tap')); return; }
  jamOn=true;
  $('btnJam').classList.add('on'); $('btnJam').textContent='STOP REC';
  lcd('RECORDING MASTER OUT — everything you hear (max '+(JAM_MAX_S/60)+' min).');
});
function stopJam(){
  if(!jamOn) return;
  jamOn=false;
  try{ LIVE.softclip.disconnect(jamTap); }catch(e){}
  try{ if(jamCap) jamCap.stop(); }catch(e){}
  jamTap=null; jamCap=null;
  $('btnJam').classList.remove('on'); $('btnJam').innerHTML='&#9679; REC OUT';
  if(!jamLen){ lcd('JAM EMPTY.'); return; }
  jamBuf=AC.createBuffer(2,jamLen,AC.sampleRate);
  const L=jamBuf.getChannelData(0), R=jamBuf.getChannelData(1);
  let o=0; for(const c of jamL){ L.set(c,o); o+=c.length; }
  o=0; for(const c of jamR){ R.set(c,o); o+=c.length; }
  jamL=[]; jamR=[]; jamLen=0;
  $('btnJamSave').style.display=''; $('btnJamPad').style.display='';
  lcd('JAM CAPTURED · '+jamBuf.duration.toFixed(1)+'s @ '+Math.round(jamBuf.sampleRate)+' Hz — SAVE or TO PAD');
}
$('btnJamSave').addEventListener('click',()=>{
  if(!jamBuf) return;
  download(encodeWav(jamBuf), jamStamp()+'.wav');
});
$('btnJamPad').addEventListener('click',()=>{
  if(!jamBuf) return;
  S.editPad=pickTargetPad();
  loadIntoTarget(jamBuf, jamStamp());
  if(Math.abs(perfPitch+perfBend)>0.01)
    lcd('LOADED → '+padName(S.editPad)+' — note: pitch fader at '+(perfPitch>=0?'+':'')+perfPitch.toFixed(1)+' st bends this pad too (double-tap fader to zero).');
});

/* ---------------- TRAX — cakewalk-style tape lanes ---------------- */
const NTRAX=8, TRAX_MAX_S=180;
function newTrack(){ return {bufId:-1,name:'',gain:0.9,pan:0,mute:false,loop:false,ftype:'off',fcut:1,rev:0,dly:0}; }
S.trax=Array.from({length:NTRAX},()=>newTrack());
let traxArm=-1, traxSolo=-1, traxVoices=[], traxCap=null, traxStream=null;

function drawTrax(){
  const el=$('traxlist'); el.innerHTML='';
  S.trax.forEach((tr,i)=>{
    const row=document.createElement('div'); row.className='row';
    const num=document.createElement('span'); num.className='lbl'; num.style.minWidth='22px'; num.textContent='T'+(i+1);
    const rec=document.createElement('button'); rec.className='rec'; rec.innerHTML='&#9679;';
    rec.setAttribute('aria-label','Arm track '+(i+1)+' to record');
    rec.classList.toggle('on',traxArm===i);
    rec.addEventListener('click',()=>armTrack(i));
    const mu=document.createElement('button'); mu.textContent='M';
    mu.setAttribute('aria-label','Mute track '+(i+1)); mu.classList.toggle('on',tr.mute);
    mu.addEventListener('click',()=>{ tr.mute=!tr.mute; applyTraxMix(); drawTrax(); dirty(); });
    const so=document.createElement('button'); so.textContent='S';
    so.setAttribute('aria-label','Solo track '+(i+1)); so.classList.toggle('on',traxSolo===i);
    so.addEventListener('click',()=>{ traxSolo=traxSolo===i?-1:i; applyTraxMix(); drawTrax(); });
    const b=tr.bufId>=0?S.buffers[tr.bufId]:null;
    const nm=document.createElement('span');
    nm.style.cssText='font-size:10px;min-width:64px;color:'+(b?'var(--lcd)':'var(--txt-dim)');
    nm.textContent=b?(tr.name||'take')+' '+b.duration.toFixed(1)+'s':'— empty —';
    row.setAttribute('aria-label','Tape track '+(i+1)+': '+(b?((tr.name||'take')+', '+b.duration.toFixed(1)+' seconds'):'empty'));
    const vol=document.createElement('input'); vol.type='range'; vol.min='0'; vol.max='1.2'; vol.step='0.01';
    vol.value=tr.gain; vol.style.flex='1'; vol.style.minWidth='60px';
    vol.setAttribute('aria-label','Volume, track '+(i+1));
    vol.addEventListener('input',e=>{ tr.gain=parseFloat(e.target.value); applyTraxMix(); dirty(); });
    const lp=document.createElement('button'); lp.innerHTML='&#8734;';
    lp.setAttribute('aria-label','Loop track '+(i+1));
    lp.classList.toggle('on',tr.loop);
    lp.addEventListener('click',()=>{ tr.loop=!tr.loop; drawTrax(); dirty();
      lcd('TRACK '+(i+1)+(tr.loop?' LOOPS at the nearest bar':' plays once')); });
    const fx=document.createElement('button'); fx.textContent='FX';
    fx.setAttribute('aria-label','Effects for track '+(i+1));
    fx.classList.toggle('on',traxFxSel===i && $('traxfx').style.display!=='none');
    fx.addEventListener('click',()=>{
      if(traxFxSel===i && $('traxfx').style.display!=='none'){ $('traxfx').style.display='none'; }
      else{ traxFxSel=i; drawTraxFx(); $('traxfx').style.display='block'; }
      drawTrax();
    });
    const clr=document.createElement('button'); clr.innerHTML='&#215;'; clr.title='clear this take';
    clr.setAttribute('aria-label','Clear the take on track '+(i+1));
    clr.addEventListener('click',()=>{ if(tr.bufId<0){ lcd('TRACK '+(i+1)+' is already empty.'); return; }
      if(confirm('Clear the take on TRACK '+(i+1)+'?')) clearTrack(i); });
    row.append(num,rec,mu,so,lp,nm,vol,fx,clr);
    el.appendChild(row);
  });
  if($('traxfx').style.display!=='none') drawTraxFx();
  a11yPass(el);
}
let traxFxSel=0;
function drawTraxFx(){
  const i=traxFxSel, tr=S.trax[i];
  $('tfxTitle').textContent='T'+(i+1)+(tr.name?' \u00b7 '+tr.name:'');
  $('tfxType').value=tr.ftype||'off';
  $('tfxCut').value=tr.fcut; $('tfxCutV').textContent=Math.round(cutHz(tr.fcut))+'Hz';
  $('tfxPan').value=tr.pan||0; $('tfxPanV').textContent=panText(tr.pan);
  $('tfxRev').value=tr.rev||0; $('tfxRevV').textContent=sendText(tr.rev);
  $('tfxDly').value=tr.dly||0; $('tfxDlyV').textContent=sendText(tr.dly);
}
$('tfxType').addEventListener('change',e=>{ S.trax[traxFxSel].ftype=e.target.value; applyTraxFx(traxFxSel); dirty();
  lcd('TRACK FILTER '+e.target.value.toUpperCase()+' — on/off takes effect on next PLAY.'); });
$('tfxCut').addEventListener('input',e=>{ const tr=S.trax[traxFxSel]; tr.fcut=parseFloat(e.target.value);
  $('tfxCutV').textContent=Math.round(cutHz(tr.fcut))+'Hz'; applyTraxFx(traxFxSel); dirty(); });
$('tfxPan').addEventListener('input',e=>{ const tr=S.trax[traxFxSel]; tr.pan=parseFloat(e.target.value);
  $('tfxPanV').textContent=panText(tr.pan); applyTraxFx(traxFxSel); dirty(); });
$('tfxRev').addEventListener('input',e=>{ const tr=S.trax[traxFxSel]; tr.rev=parseFloat(e.target.value);
  $('tfxRevV').textContent=sendText(tr.rev); applyTraxFx(traxFxSel); dirty(); });
$('tfxDly').addEventListener('input',e=>{ const tr=S.trax[traxFxSel]; tr.dly=parseFloat(e.target.value);
  $('tfxDlyV').textContent=sendText(tr.dly); applyTraxFx(traxFxSel); dirty(); });
$('tfxPad').addEventListener('click',()=>{
  const tr=S.trax[traxFxSel];
  if(tr.bufId<0){ lcd('TRACK '+(traxFxSel+1)+' IS EMPTY.'); return; }
  S.editPad=pickTargetPad();   // never silently overwrite a used pad when an empty one exists
  const p=S.pads[S.editPad]; p.bufId=tr.bufId; p.start=0; p.end=1; p.name=(tr.name||'take').slice(0,14); p.warped=false; delete warpOrig[S.editPad];
  drawPads(); drawEdit(); dirty(); lcd('TRACK '+(traxFxSel+1)+' \u2192 '+padName(S.editPad)+(S.pads[S.editPad]?'':''));
});
$('tfxEdit').addEventListener('click',()=>{
  const tr=S.trax[traxFxSel];
  if(tr.bufId<0){ lcd('TRACK '+(traxFxSel+1)+' IS EMPTY.'); return; }
  ensureAudio();
  const orig=S.buffers[tr.bufId]; if(!orig){ lcd('TRACK '+(traxFxSel+1)+' has no audio.'); return; }
  // Open the take in the SMPL sample editor by copying it onto a target pad.
  // A COPY, so trims/normalize/reverse never alter the lane's original take.
  const copy=mkAudioBuf(orig.length,orig.sampleRate,orig.numberOfChannels);
  for(let c=0;c<orig.numberOfChannels;c++) copy.copyToChannel(orig.getChannelData(c).slice(),c);
  S.buffers.push(copy); const bid=S.buffers.length-1;
  S.editPad=pickTargetPad();
  const p=S.pads[S.editPad]; p.bufId=bid; p.start=0; p.end=1; p.name=(tr.name||'take').slice(0,14); p.warped=false; delete warpOrig[S.editPad];
  workBuf=copy; slices=[]; selSlice=-1;
  drawPads(); drawEdit(); dirty();
  const b=document.querySelector('#tabs button[data-v="smpl"]'); if(b) b.click();
  drawWave();
  lcd('TRACK '+(traxFxSel+1)+' \u2192 '+padName(S.editPad)+' (a copy) \u2014 edit in SMPL: TRIM / CHOP / TRANSIENT / REVERSE / NORM. The lane\u2019s take is untouched.');
});
function clearTrack(i){
  traxVoices.forEach(v=>{ if(v.i===i){ try{ v.src.stop(); }catch(e){} } });
  S.trax[i]=newTrack();
  if(traxArm===i) disarmTrax();
  if(traxFxSel===i) $('traxfx').style.display='none';
  drawTrax(); dirty(); lcd('TRACK '+(i+1)+' CLEARED.');
}
$('tfxClr').addEventListener('click',()=>{
  S.trax[traxFxSel]=newTrack();
  if(traxArm===traxFxSel) disarmTrax();
  applyTraxMix(); drawTrax(); drawTraxFx(); dirty();
});
async function armTrack(i){
  if(traxCap){ lcd('ALREADY ROLLING — press STOP first.'); return; }
  if(traxArm===i){ disarmTrax(); drawTrax(); lcd('TRACK '+(i+1)+' DISARMED.'); return; }
  ensureAudio();
  disarmTrax();
  if($('traxSrc').value==='mic'){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ lcd('MIC unavailable on this browser.'); drawTrax(); return; }
    micBusy=true;
    try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record'; }catch(e){}
    try{ traxStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}}); }
    catch(err){ micBusy=false; drawTrax(); lcd('MIC DENIED/UNAVAILABLE ('+((err&&err.name)||'error')+').'); return; }
  }
  traxArm=i; drawTrax();
  const hasTake=S.trax[i].bufId>=0;
  lcd('TRACK '+(i+1)+' ARMED · '+$('traxSrc').selectedOptions[0].textContent+(hasTake
    ? ' — PLAY RE-RECORDS over this take (its old audio is replaced on STOP).'
    : ' — press PLAY to roll, STOP to commit.'));
}
function disarmTrax(){
  traxArm=-1;
  if(traxStream){ try{ traxStream.getTracks().forEach(t=>t.stop()); }catch(e){} traxStream=null; micBusy=false; resumeSession(); }
}
function trackLoopEnd(b){ // loop the take at the nearest whole bar so it stays in step
  const bar=60/bpmAbs()/4*NSTEPS;
  let end=Math.round(b.duration/bar)*bar;
  if(end<bar*0.99 || end>b.duration+0.001) end=Math.floor(b.duration/bar)*bar;
  if(end<bar*0.99) end=b.duration;   // shorter than a bar: loop the whole take
  return end;
}
function wireTrack(ctx,g,tr,b,when,gainVal){ // shared by live transport and bounce
  const src=ctx.createBufferSource(); src.buffer=b;
  if(tr.loop){ src.loop=true; src.loopStart=0; src.loopEnd=trackLoopEnd(b); }
  let head=src, flt=null;
  if(tr.ftype && tr.ftype!=='off'){
    flt=ctx.createBiquadFilter(); flt.type=tr.ftype; flt.frequency.value=cutHz(tr.fcut); flt.Q.value=1.2;
    head.connect(flt); head=flt;
  }
  const gn=ctx.createGain(); gn.gain.value=gainVal;
  head.connect(gn);
  const pn=ctx.createStereoPanner?ctx.createStereoPanner():null;
  let tail=gn;
  if(pn){ pn.pan.value=tr.pan||0; gn.connect(pn); tail=pn; }
  tail.connect(g.trackBus);
  const rv=ctx.createGain(); rv.gain.value=tr.rev||0;
  const dl=ctx.createGain(); dl.gain.value=tr.dly||0;
  tail.connect(rv); tail.connect(dl);
  rv.connect(g.revIn); dl.connect(g.dlyIn);
  src.start(when);
  return {src,gn,flt,pn,rv,dl};
}
function startTrax(when){
  stopTraxVoices();
  S.trax.forEach((tr,i)=>{
    if(tr.bufId<0) return;
    if(i===traxArm) return;   // re-recording over this lane: its old take stays silent and gets replaced on STOP
    const b=S.buffers[tr.bufId]; if(!b) return;
    const aud=!tr.mute && (traxSolo<0||traxSolo===i);
    const v=wireTrack(AC,LIVE,tr,b,when,aud?tr.gain:0);
    v.i=i;
    v.src.onended=()=>{ try{v.src.disconnect();v.gn.disconnect();}catch(e){} };
    traxVoices.push(v);
  });
  if(traxArm>=0) traxBeginCapture(when);
}
function applyTraxFx(i){ // live-adjust a playing lane's fx (filter on/off needs next PLAY)
  const tr=S.trax[i];
  traxVoices.forEach(v=>{
    if(v.i!==i) return;
    try{
      if(v.flt && tr.ftype!=='off'){ v.flt.type=tr.ftype; v.flt.frequency.setTargetAtTime(cutHz(tr.fcut),AC.currentTime,0.02); }
      if(v.pn) v.pn.pan.setTargetAtTime(tr.pan||0,AC.currentTime,0.02);
      v.rv.gain.setTargetAtTime(tr.rev||0,AC.currentTime,0.02);
      v.dl.gain.setTargetAtTime(tr.dly||0,AC.currentTime,0.02);
    }catch(e){}
  });
}
function applyTraxMix(){
  traxVoices.forEach(v=>{
    const tr=S.trax[v.i];
    const aud=!tr.mute && (traxSolo<0 || traxSolo===v.i);
    try{ v.gn.gain.setTargetAtTime(aud?tr.gain:0,AC.currentTime,0.02); }catch(e){}
  });
}
function stopTraxVoices(){ traxVoices.forEach(v=>{ try{v.src.stop();}catch(e){} }); traxVoices=[]; }
function traxBeginCapture(when){
  const useMic=!!traxStream;
  let ctx=AC, srcNode=null;
  try{
    if(useMic){
      try{ srcNode=AC.createMediaStreamSource(traxStream); }
      catch(e){ // WebKit rate mismatch — capture in a context at the hardware rate
        const Ctor=window.AudioContext||window.webkitAudioContext;
        ctx=new Ctor(); srcNode=ctx.createMediaStreamSource(traxStream);
      }
    }
    const cap={ctx,srcNode,L:[],R:[],len:0,first:-1,
      seqStartCap: ctx===AC ? when : ctx.currentTime+(when-AC.currentTime)};
    const ct=makeCaptureTap(ctx,(l,r,frames,when)=>{
      if(cap.first<0) cap.first=(when!=null?when:ctx.currentTime);
      cap.L.push(l.buffer?l:new Float32Array(l));
      cap.R.push(r.buffer?r:new Float32Array(r));
      cap.len+=frames;
      if(cap.len>=ctx.sampleRate*TRAX_MAX_S) traxCommit();
    });
    const tap=ct.node;
    cap.bufSize=ct.worklet?2048:(tap.bufferSize||4096);
    cap.srcMode=useMic?'mic':($('traxSrc').value==='live'?'live':'bus');
    if(useMic) srcNode.connect(tap);
    else if(cap.srcMode==='live') LIVE.liveBus.connect(tap);
    else (LIVE.perfGain||LIVE.master).connect(tap);
    cap.tap=tap; cap.cap=ct;
    // sync marker: a ±4.0 impulse pair fired into the TAP ONLY (never audible)
    // exactly at bar 1 — located in the raw capture at commit for
    // sample-accurate alignment, then scrubbed from the take head.
    // callback timestamps proved unreliable (cold vs warm starts differ by a
    // whole buffer), so we align in the audio domain instead.
    try{
      const mb=ctx.createBuffer(1,80,ctx.sampleRate), md=mb.getChannelData(0);
      md[0]=4; md[64]=-4;
      const ms=ctx.createBufferSource(); ms.buffer=mb;
      ms.connect(tap);
      ms.start(Math.max(ctx.currentTime+0.005, cap.seqStartCap));
      ms.onended=()=>{ try{ms.disconnect();}catch(e){} };
    }catch(e){}
    traxCap=cap;
    lcd('ROLLING — TRACK '+(traxArm+1)+' recording ('+cap.srcMode.toUpperCase()+') · STOP commits.');
  }catch(e){ traxCap=null; lcd('TRACK REC FAILED: '+(e.message||'tap error')); }
}
function traxCommit(){
  const cap=traxCap; if(!cap) return;
  traxCap=null;
  try{ if(cap.srcNode) cap.srcNode.disconnect();
    else if(cap.srcMode==='live') LIVE.liveBus.disconnect(cap.tap);
    else (LIVE.perfGain||LIVE.master).disconnect(cap.tap); }catch(e){}
  try{ if(cap.cap) cap.cap.stop(); else cap.tap.disconnect(); }catch(e){}
  const i=traxArm;
  disarmTrax();
  if(cap.ctx!==AC){ try{ cap.ctx.close(); }catch(e){} }
  if(i<0 || !cap.len){ drawTrax(); lcd('TAKE EMPTY.'); return; }
  const sr=cap.ctx.sampleRate;
  const L=new Float32Array(cap.len), R=new Float32Array(cap.len);
  let o=0; for(const c of cap.L){ L.set(c,o); o+=c.length; }
  o=0; for(const c of cap.R){ R.set(c,o); o+=c.length; }
  // align sample 0 with bar 1: find the sync marker in the raw capture
  let mi=-1;
  const lim=Math.min(L.length-65, sr*2);
  for(let i=0;i<lim;i++){ if(L[i]>2.5 && L[i+64]<-2.5){ mi=i; break; } }
  let dl,dr;
  if(mi>=0){
    dl=L.subarray(mi); dr=R.subarray(mi);
    for(let k=0;k<128 && k<dl.length;k++){ dl[k]=0; dr[k]=0; }   // scrub the marker
  }else{
    // marker missed (capture started after bar 1) — timestamp fallback
    const first=(cap.first<0?cap.seqStartCap:cap.first)-cap.bufSize/sr;
    const lead=Math.round((cap.seqStartCap-first)*sr);
    if(lead>=0){ const k=Math.min(lead,L.length); dl=L.subarray(k); dr=R.subarray(k); }
    else{ dl=new Float32Array(L.length-lead); dl.set(L,-lead); dr=new Float32Array(R.length-lead); dr.set(R,-lead); }
  }
  if(dl.length<sr*0.05){ drawTrax(); lcd('TAKE TOO SHORT.'); return; }
  const buf=AC.createBuffer(2,dl.length,sr);
  buf.copyToChannel(dl,0); buf.copyToChannel(dr,1);
  S.buffers.push(buf);
  S.trax[i].bufId=S.buffers.length-1;
  S.trax[i].name='take'+(i+1);
  drawTrax(); dirty();
  $('btnPerfRec').classList.remove('on');
  let tpk=0; for(let k=0;k<dl.length;k+=4){ const a=Math.abs(dl[k]); if(a>tpk) tpk=a; }
  if(tpk<0.004){
    plog('SILENT-TAKE GUARD: track '+(i+1)+' take peaked at '+tpk.toFixed(4)+' — likely wrong SOURCE (BUS/LIVE/MIC) or nothing played. Kept anyway.');
    lcd('\u26a0 TAKE '+(i+1)+' LOOKS SILENT — check SOURCE (BUS records the mix, LIVE ONLY records what you play, MIC needs the mic).');
  }else{
    lcd('TAKE \u2192 TRACK '+(i+1)+' \u00b7 '+buf.duration.toFixed(1)+'s — it plays with the transport; find it in TRAX.');
  }
}

/* ---------------- LIVE — playable instruments ---------------- */
/* SCALES, NOTE_NAMES, snapSemitone → src/pure/scale.js */
const INSTDEF={mode:'ther',key:0,scale:'minor',voice:'glass',vol:0.8,rev:0.18,dly:0.08,sev:false,strum:true,arp:false,snap:true,perc:'shaker'};
S.inst=Object.assign({},INSTDEF);
const instVoices=new Set();
let ther=null, arpTimer=0, arpNotes=null, arpIdx=0, arpNext=0;

function instBus(){ // lazy per-graph: level + rev/dly sends into the master mix
  if(!LIVE._inst){
    const g=AC.createGain(); g.gain.value=S.inst.vol;
    const rv=AC.createGain(); rv.gain.value=S.inst.rev;
    const dl=AC.createGain(); dl.gain.value=S.inst.dly;
    g.connect(LIVE.duckBus||LIVE.master); g.connect(rv); g.connect(dl);   // live instruments duck too
    if(LIVE.liveBus) g.connect(LIVE.liveBus);   // …and count as live performance for LIVE-ONLY recording
    rv.connect(LIVE.revIn); dl.connect(LIVE.dlyIn);
    LIVE._inst={g,rv,dl};
  }
  return LIVE._inst;
}
function scaleMidis(n){ // n notes of the current key/scale upward from the root octave
  const iv=SCALES[S.inst.scale]||SCALES.minor, root=48+S.inst.key, out=[];
  for(let i=0;i<n;i++) out.push(root+12*Math.floor(i/iv.length)+iv[i%iv.length]);
  return out;
}
const ksCache={};
function ksBuf(f){ // live Karplus-Strong pluck, cached per rounded Hz
  const k=Math.round(f); if(ksCache[k]) return ksCache[k];
  const sr=AC.sampleRate, N=Math.max(2,Math.round(sr/f)), len=Math.ceil(sr*1.8);
  const b=AC.createBuffer(1,len,sr), d=b.getChannelData(0), r=mulberry32(k);
  for(let i=0;i<N;i++) d[i]=r()*2-1;
  const loss=Math.exp(Math.log(0.05)/(1.2*f));
  for(let i=N;i<len;i++) d[i]=(d[i-N]+d[i-N+1])*0.5*loss;
  ksCache[k]=b; return b;
}
function instVoice(f,when){
  ensureAudio();
  const bus=instBus(), t=when!=null?when:AC.currentTime;
  const env=AC.createGain(); env.connect(bus.g);
  const parts=[], v={env,parts,dead:false};
  if(S.inst.voice==='pluck'){
    const src=AC.createBufferSource(); src.buffer=ksBuf(f);
    env.gain.setValueAtTime(0.85,t);
    src.connect(env); src.start(t); parts.push(src);
    src.onended=()=>{ instVoices.delete(v); try{src.disconnect();env.disconnect();}catch(e){} };
  }else{
    let atk=0.015, lvl=0.5, mk;
    if(S.inst.voice==='glass'){
      mk=()=>{ const o1=pLive('sine',f), o2=pLive('triangle',f); o2.detune.value=6;
        const g2=AC.createGain(); g2.gain.value=0.35;
        o1.connect(env); o2.connect(g2); g2.connect(env); return [o1,o2]; };
    }else if(S.inst.voice==='saw'){
      atk=0.05; lvl=0.4;
      mk=()=>{ const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2300; lp.Q.value=0.6; lp.connect(env);
        return [-7,7].map(dt=>{ const o=pLive('sawtooth',f); o.detune.value=dt; o.connect(lp); return o; }); };
    }else{ // ep — 2-op FM
      atk=0.004; lvl=0.55;
      mk=()=>{ const car=pLive('sine',f), mod=pLive('sine',f), mi=AC.createGain();
        mi.gain.setValueAtTime(f*2.5,t); mi.gain.exponentialRampToValueAtTime(Math.max(1,f*0.2),t+1.1);
        mod.connect(mi); mi.connect(car.frequency); car.connect(env); return [car,mod]; };
    }
    env.gain.setValueAtTime(0,t);
    env.gain.linearRampToValueAtTime(lvl,t+atk);
    mk().forEach(o=>{ o.start(t); parts.push(o); });
  }
  instVoices.add(v);
  v.stop=(tt)=>{
    if(v.dead) return; v.dead=true;
    const x=Math.max(tt!=null?tt:AC.currentTime, AC.currentTime);
    const rel=S.inst.voice==='pluck'?0.15:0.3;
    try{ env.gain.cancelScheduledValues(x); env.gain.setTargetAtTime(0,x,rel*0.4); }catch(e){}
    parts.forEach(o=>{ try{ o.stop(x+rel*3); }catch(e){} });
    setTimeout(()=>{ instVoices.delete(v); try{env.disconnect();}catch(e){} },(x-AC.currentTime+rel*3+0.2)*1000);
  };
  return v;
}
function pLive(type,f){ const o=AC.createOscillator(); o.type=type; o.frequency.value=f; return o; }
function instPanic(){
  instVoices.forEach(v=>{ try{ v.stop(); }catch(e){} });
  instVoices.clear();
  arpStop(); therEnd();
  try{ fluteVoices.forEach(v=>v.stop()); fluteVoices.clear(); }catch(e){}
  try{ ribbonEnd(); }catch(e){}
  try{ tapeEnd(); stutterEnd(); }catch(e){}
}
/* theremin — continuous voice with vibrato; X pitch (2 oct), Y volume */
function therStart(){
  ensureAudio();
  const bus=instBus();
  const o=pLive('sine',220), lfo=pLive('sine',5.4), vd=AC.createGain();
  vd.gain.value=0; lfo.connect(vd); vd.connect(o.frequency);
  const g=AC.createGain(); g.gain.value=0;
  o.connect(g); g.connect(bus.g);
  o.start(); lfo.start();
  ther={o,lfo,vd,g};
}
function therMove(nx,ny){
  if(!ther) return;
  const lo=48+S.inst.key;
  let m=lo+nx*24;
  if(S.inst.snap){
    const set=scaleMidis(15);
    m=set.reduce((a,b)=>Math.abs(b-m)<Math.abs(a-m)?b:a,set[0]);
  }
  const f=noteHz(m), t=AC.currentTime;
  ther.o.frequency.setTargetAtTime(f,t,0.025);
  ther.vd.gain.setTargetAtTime(f*0.007,t,0.1);
  ther.g.gain.setTargetAtTime((1-ny)*0.55,t,0.03);
}
function therEnd(){
  if(!ther) return;
  const th=ther; ther=null;
  try{
    th.g.gain.setTargetAtTime(0,AC.currentTime,0.06);
    th.o.stop(AC.currentTime+0.4); th.lfo.stop(AC.currentTime+0.4);
  }catch(e){}
  setTimeout(()=>{ try{th.g.disconnect();}catch(e){} },600);
  drawSurf(-1,-1);
}
/* arp — BPM-synced 1/8s while a chord pad is held */
function arpStart(notes){
  arpStop();
  ensureAudio();
  arpNotes=notes.slice().sort((a,b)=>a-b); arpIdx=0; arpNext=AC.currentTime+0.02;
  arpTimer=setInterval(()=>{
    if(!arpNotes) return;
    while(arpNext<AC.currentTime+0.12){
      const dur=60/bpmAbs()/2;
      const vv=instVoice(noteHz(arpNotes[arpIdx%arpNotes.length]),arpNext);
      vv.stop(arpNext+dur*0.85);
      arpIdx++; arpNext+=dur;
    }
  },25);
}
function arpStop(){ clearInterval(arpTimer); arpTimer=0; arpNotes=null; }

function chordNotes(deg){ // diatonic stack on scale degree deg (0-based)
  const iv=SCALES[S.inst.scale]||SCALES.minor, root=48+S.inst.key, L=iv.length;
  const pick=k=>root+12*Math.floor((deg+k)/L)+iv[(deg+k)%L];
  const n=[pick(0),pick(2),pick(4)];
  if(S.inst.sev) n.push(pick(6));
  return n;
}
function chordLabel(deg){
  const n=chordNotes(deg), third=(n[1]-n[0])%12, fifth=(n[2]-n[0])%12;
  const R=['I','II','III','IV','V','VI','VII'][deg%7];
  if(fifth===6) return R.toLowerCase()+'\u00b0';
  return third===3?R.toLowerCase():R;
}
function drawChordGrid(){
  const el=$('chordgrid'); el.innerHTML='';
  const iv=SCALES[S.inst.scale]||SCALES.minor;
  for(let d=0;d<8;d++){
    const deg=d%iv.length + (d>=iv.length?iv.length:0);
    const b=document.createElement('button');
    const isOct=d>=iv.length;
    b.innerHTML=isOct?chordLabel(deg%iv.length)+'\u2191':chordLabel(d);
    let held=null;
    const press=()=>{
      ensureAudio();
      const notes=chordNotes(d%iv.length).map(m=>m+(isOct?12:0));
      if(S.inst.arp){ arpStart(notes); held='arp'; }
      else{
        held=notes.map((m,k)=>instVoice(noteHz(m),AC.currentTime+(S.inst.strum?k*0.03:0)));
      }
      b.classList.add('on');
    };
    const rel=()=>{
      if(held==='arp') arpStop();
      else if(held) held.forEach(v=>v.stop());
      held=null; b.classList.remove('on');
    };
    b.addEventListener('touchstart',e=>{ e.preventDefault(); press(); },{passive:false});
    b.addEventListener('touchend',e=>{ e.preventDefault(); rel(); },{passive:false});
    b.addEventListener('mousedown',press);
    b.addEventListener('mouseup',rel);
    b.addEventListener('mouseleave',rel);
    el.appendChild(b);
  }
}
function drawKeysGrid(){
  const el=$('keysgrid'); el.innerHTML='';
  scaleMidis(16).forEach(m=>{
    const b=document.createElement('button'); b.textContent=midiName(m);
    let v=null;
    const press=()=>{ ensureAudio(); v=(S.inst.mode==='flute')?fluteVoiceStart(noteHz(m)):instVoice(noteHz(m)); b.classList.add('on'); };
    const rel=()=>{ if(v){ v.stop(); v=null; } b.classList.remove('on'); };
    b.addEventListener('touchstart',e=>{ e.preventDefault(); press(); },{passive:false});
    b.addEventListener('touchend',e=>{ e.preventDefault(); rel(); },{passive:false});
    b.addEventListener('mousedown',press);
    b.addEventListener('mouseup',rel);
    b.addEventListener('mouseleave',rel);
    el.appendChild(b);
  });
}
/* surface: theremin field / harp strings */
let harpLast=-1;
function drawSurf(px,py){
  const cv=$('liveSurf'), {cx,W,H}=fitCanvas(cv);
  cx.fillStyle='#120d04'; cx.fillRect(0,0,W,H);
  const set=scaleMidis(15), lo=48+S.inst.key;
  if(S.inst.mode==='harp'){
    set.forEach((m,i)=>{
      const x=(i+0.5)/set.length*W;
      cx.strokeStyle=i===harpLast?'#ffb454':'#8a6530';
      cx.lineWidth=i===harpLast?4:2;
      cx.beginPath(); cx.moveTo(x,10); cx.lineTo(x,H-10); cx.stroke();
    });
    cx.fillStyle='#8a6530'; cx.font='18px ui-monospace';
    cx.fillText('SWIPE ACROSS THE STRINGS',20,H-18);
  }else{
    if(S.inst.snap){
      cx.strokeStyle='#3a2c12'; cx.lineWidth=1;
      set.forEach(m=>{
        const x=(m-lo)/24*W;
        cx.beginPath(); cx.moveTo(x,0); cx.lineTo(x,H); cx.stroke();
      });
    }
    cx.fillStyle='#8a6530'; cx.font='18px ui-monospace';
    cx.fillText(S.inst.mode==='ribbon'
      ? 'X: BASS PITCH \u00b7 Y: WAH'+(S.inst.snap?' \u00b7 SNAPPED':'')
      : 'X: PITCH \u00b7 Y: VOLUME'+(S.inst.snap?' \u00b7 SNAPPED':''),20,H-18);
    if(px>=0){
      cx.fillStyle='#ff8c2e';
      cx.beginPath(); cx.arc(px*W,py*H,14,0,Math.PI*2); cx.fill();
      cx.strokeStyle='#ffb454'; cx.beginPath(); cx.arc(px*W,py*H,22,0,Math.PI*2); cx.stroke();
    }
  }
}
function surfXY(e,touch){
  const cv=$('liveSurf'), r=cv.getBoundingClientRect();
  const q=touch?e.changedTouches[0]:e;
  return [clamp((q.clientX-r.left)/r.width,0,1), clamp((q.clientY-r.top)/r.height,0,1)];
}
function surfDown(nx,ny){
  if(S.inst.mode==='harp'){ harpPluck(nx); }
  else if(S.inst.mode==='ribbon'){ if(!ribbon) ribbonStart(); ribbonMove(nx,ny); drawSurf(nx,ny); }
  else{ if(!ther) therStart(); therMove(nx,ny); drawSurf(nx,ny); }
}
function surfMove(nx,ny){
  if(S.inst.mode==='harp'){ harpPluck(nx); }
  else if(S.inst.mode==='ribbon'){ if(ribbon){ ribbonMove(nx,ny); drawSurf(nx,ny); } }
  else if(ther){ therMove(nx,ny); drawSurf(nx,ny); }
}
function surfUp(){
  therEnd(); ribbonEnd();
  harpLast=-1;
}
function harpPluck(nx){
  const set=scaleMidis(15);
  const ix=clamp(Math.floor(nx*set.length),0,set.length-1);
  if(ix===harpLast) return;
  harpLast=ix;
  ensureAudio();
  const keep=S.inst.voice; S.inst.voice='pluck';   // the harp always plucks
  instVoice(noteHz(set[ix]));
  S.inst.voice=keep;
  drawSurf(-1,-1);
}
(function(){
  const cv=$('liveSurf');
  let down=false;
  cv.addEventListener('touchstart',e=>{ e.preventDefault(); ensureAudio(); const [x,y]=surfXY(e,true); surfDown(x,y); },{passive:false});
  cv.addEventListener('touchmove',e=>{ e.preventDefault(); const [x,y]=surfXY(e,true); surfMove(x,y); },{passive:false});
  cv.addEventListener('touchend',e=>{ e.preventDefault(); surfUp(); },{passive:false});
  cv.addEventListener('mousedown',e=>{ down=true; ensureAudio(); const [x,y]=surfXY(e); surfDown(x,y); });
  window.addEventListener('mousemove',e=>{ if(down){ const [x,y]=surfXY(e); surfMove(x,y); } });
  window.addEventListener('mouseup',()=>{ if(down){ down=false; surfUp(); } });
})();
/* ribbon bass — mono slide bass; X pitch (2 low octaves), Y opens the filter */
let ribbon=null;
function nearestIn(set,m){ return set.reduce((a,b)=>Math.abs(b-m)<Math.abs(a-m)?b:a,set[0]); }
function ribbonStart(){
  ensureAudio(); const bus=instBus();
  const o=pLive('sawtooth',55), sub=pLive('sine',27.5), sg=AC.createGain(); sg.gain.value=0.6;
  const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600; lp.Q.value=5;
  const g=AC.createGain(); g.gain.value=0;
  o.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(g); g.connect(bus.g);
  o.start(); sub.start();
  g.gain.setTargetAtTime(0.5,AC.currentTime,0.02);
  ribbon={o,sub,lp,g};
}
function ribbonMove(nx,ny){
  if(!ribbon) return;
  const lo=24+S.inst.key; let m=lo+nx*24;
  if(S.inst.snap) m=nearestIn(scaleMidis(15).map(x=>x-24),m);
  const f=noteHz(m), t=AC.currentTime;
  ribbon.o.frequency.setTargetAtTime(f,t,0.04);
  ribbon.sub.frequency.setTargetAtTime(f/2,t,0.04);
  ribbon.lp.frequency.setTargetAtTime(120*Math.pow(60,1-ny),t,0.03);   // Y = wah
}
function ribbonEnd(){
  if(!ribbon) return;
  const r=ribbon; ribbon=null;
  try{
    r.g.gain.setTargetAtTime(0,AC.currentTime,0.05);
    r.o.stop(AC.currentTime+0.35); r.sub.stop(AC.currentTime+0.35);
  }catch(e){}
  setTimeout(()=>{ try{r.g.disconnect();}catch(e){} },500);
  drawSurf(-1,-1);
}
/* breath flute — mic RMS drives the voice like a wind controller */
const fluteVoices=new Set();
let breathOn=false, breathStream=null, breathCtx=null, breathAn=null, breathData=null, breathLvl=0, breathRAF=0;
function fluteVoiceStart(f){
  ensureAudio(); const bus=instBus(), t=AC.currentTime;
  const o=pLive('triangle',f), o2=pLive('sine',f*2.001), g2=AC.createGain(); g2.gain.value=0.15;
  const lfo=pLive('sine',5), vd=AC.createGain(); vd.gain.value=f*0.004;
  lfo.connect(vd); vd.connect(o.frequency);
  const nz=pNoise(AC,2,321); nz.loop=true;
  const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=Math.min(12000,f*2); nf.Q.value=8;
  const ng=AC.createGain(); ng.gain.value=0;
  const g=AC.createGain(); g.gain.value=0;
  o.connect(g); o2.connect(g2); g2.connect(g); nz.connect(nf); nf.connect(ng); ng.connect(g); g.connect(bus.g);
  if(!breathOn){ g.gain.linearRampToValueAtTime(0.45,t+0.07); ng.gain.setValueAtTime(0.08,t); }
  o.start(); o2.start(); lfo.start(); nz.start();
  const fv={g,ng,stop:()=>{
    fluteVoices.delete(fv);
    try{
      g.gain.setTargetAtTime(0,AC.currentTime,0.06);
      [o,o2,lfo,nz].forEach(x=>{ try{x.stop(AC.currentTime+0.4);}catch(e){} });
    }catch(e){}
    setTimeout(()=>{ try{g.disconnect();}catch(e){} },600);
  }};
  fluteVoices.add(fv); return fv;
}
async function breathToggle(){
  if(breathOn){ breathStop(); lcd('BREATH OFF.'); return; }
  ensureAudio();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ lcd('BREATH: mic unavailable.'); return; }
  micBusy=true;
  try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record'; }catch(e){}
  try{ breathStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}}); }
  catch(err){ micBusy=false; lcd('BREATH: mic denied ('+((err&&err.name)||'error')+').'); return; }
  let src, ctx=AC;
  try{ src=AC.createMediaStreamSource(breathStream); }
  catch(e){
    try{ const Ctor=window.AudioContext||window.webkitAudioContext; breathCtx=new Ctor(); ctx=breathCtx; src=ctx.createMediaStreamSource(breathStream); }
    catch(e2){ breathStop(); lcd('BREATH: no analyser path.'); return; }
  }
  breathAn=ctx.createAnalyser(); breathAn.fftSize=512; src.connect(breathAn);
  breathData=new Uint8Array(breathAn.fftSize);
  breathOn=true; $('instBreath').classList.add('on');
  (function loop(){
    if(!breathOn) return;
    breathAn.getByteTimeDomainData(breathData);
    let sm=0; for(let i=0;i<breathData.length;i++){ const d=(breathData[i]-128)/128; sm+=d*d; }
    const rms=Math.sqrt(sm/breathData.length), tgt=clamp(rms*6,0,1);
    breathLvl+=(tgt-breathLvl)*(tgt>breathLvl?0.5:0.12);   // fast attack, slow release
    fluteVoices.forEach(fv=>{ try{
      fv.g.gain.setTargetAtTime(0.6*breathLvl,AC.currentTime,0.03);
      fv.ng.gain.setTargetAtTime(0.13*breathLvl,AC.currentTime,0.03);
    }catch(e){} });
    breathRAF=requestAnimationFrame(loop);
  })();
  lcd('BREATH ON — hold a key and blow into the mic.');
}
function breathStop(){
  breathOn=false; cancelAnimationFrame(breathRAF);
  if(breathStream){ try{ breathStream.getTracks().forEach(t=>t.stop()); }catch(e){} breathStream=null; }
  if(breathCtx){ try{ breathCtx.close(); }catch(e){} breathCtx=null; }
  breathAn=null; breathLvl=0; micBusy=false; resumeSession();
  $('instBreath').classList.remove('on');
}
/* shake percussion — devicemotion jerk triggers synthesized shaker family */
let motionHooked=false, shakeArmed=false, tiltOn=false, shakeLast=0, lastAcc=null;
async function enableMotion(){
  try{
    if(window.DeviceMotionEvent && DeviceMotionEvent.requestPermission){
      const r=await DeviceMotionEvent.requestPermission();
      if(r!=='granted'){ lcd('MOTION DENIED — allow motion access in Safari.'); return false; }
    }
    if(window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission){
      try{ await DeviceOrientationEvent.requestPermission(); }catch(e){}
    }
  }catch(e){}
  if(!motionHooked){
    window.addEventListener('devicemotion',onMotion);
    window.addEventListener('deviceorientation',onTilt);
    motionHooked=true;
  }
  return true;
}
function onMotion(e){
  if(!shakeArmed) return;
  const a=e.accelerationIncludingGravity; if(!a || a.x==null) return;
  const now=performance.now();
  if(lastAcc){
    const j=Math.abs(a.x-lastAcc.x)+Math.abs(a.y-lastAcc.y)+Math.abs(a.z-lastAcc.z);
    if(j>13 && now-shakeLast>110){ shakeLast=now; hitPerc(clamp((j-13)/24,0.3,1)); }
  }
  lastAcc={x:a.x,y:a.y,z:a.z};
}
function hitPerc(v){
  ensureAudio();
  const bus=instBus(), t=AC.currentTime, kind=S.inst.perc||'shaker';
  function burst(dur,f,q,g0,at){
    const n=pNoise(AC,dur+0.02,Math.floor(f)), bp=AC.createBiquadFilter();
    bp.type='bandpass'; bp.frequency.value=f; bp.Q.value=q;
    const g=AC.createGain();
    g.gain.setValueAtTime(g0*v,(at||t));
    g.gain.exponentialRampToValueAtTime(0.001,(at||t)+dur);
    n.connect(bp); bp.connect(g); g.connect(bus.g); n.start(at||t);
    n.onended=()=>{ try{n.disconnect();g.disconnect();}catch(e){} };
  }
  function jingles(n,base,spread,dec,g0){
    for(let i=0;i<n;i++){
      const f=base+((i*997)%spread), o=pLive('sine',f), g=AC.createGain();
      const t0=t+0.004*i;
      g.gain.setValueAtTime(g0*v,t0);
      g.gain.exponentialRampToValueAtTime(0.001,t0+dec+0.04*i);
      o.connect(g); g.connect(bus.g); o.start(t0); o.stop(t0+dec+0.3);
      o.onended=()=>{ try{o.disconnect();g.disconnect();}catch(e){} };
    }
  }
  if(kind==='shaker'){ burst(0.075,5200,1.5,0.8); burst(0.05,3400,1.2,0.25,t+0.012); }
  else if(kind==='cabasa'){ burst(0.045,7400,2.4,0.75); }
  else if(kind==='tamb'){ burst(0.05,6000,1.1,0.4); jingles(5,5400,2800,0.22,0.14); }
  else{ jingles(8,4800,4200,0.45,0.12); burst(0.04,6500,1,0.2); }
}
/* DJ performance FX — tape stop, stutter, tilt wah */
let tapeOn=false, tapeWasPlaying=false, stutTimer=0, stutNext=0;
function tapeStart(){
  ensureAudio(); if(tapeOn) return; tapeOn=true;
  $('btnTape').classList.add('on');
  tapeWasPlaying=playing;
  if(playing) clearInterval(seqTimer);     // freeze the transport while the platter dies
  const t=AC.currentTime;
  liveVoices.forEach(src=>{ try{
    src.playbackRate.cancelScheduledValues(t);
    src.playbackRate.setValueAtTime(Math.max(0.01,src.playbackRate.value),t);
    src.playbackRate.exponentialRampToValueAtTime(0.012,t+0.55);
  }catch(e){} });
  if(LIVE) LIVE.perfGain.gain.setTargetAtTime(0,t+0.45,0.15);
}
function tapeEnd(){
  if(!tapeOn) return; tapeOn=false;
  $('btnTape').classList.remove('on');
  const t=AC.currentTime;
  if(LIVE){ LIVE.perfGain.gain.cancelScheduledValues(t); LIVE.perfGain.gain.setTargetAtTime(1,t,0.02); }
  liveVoices.forEach(src=>{ try{
    src.playbackRate.cancelScheduledValues(t);
    src.playbackRate.setTargetAtTime(src._base*perfFactor(),t,0.08);   // spin back up
  }catch(e){} });
  if(tapeWasPlaying && playing && !S.extClk){
    nextStepTime=AC.currentTime+0.1;
    clearInterval(seqTimer); seqTimer=setInterval(seqTick,25);
  }
}
function stutterStart(){
  ensureAudio(); if(stutTimer) return;
  $('btnStut').classList.add('on');
  const g=LIVE.perfGain.gain;
  g.cancelScheduledValues(AC.currentTime);
  stutNext=AC.currentTime+0.02;
  const sched=()=>{
    const cyc=60/bpmAbs()/4;                  // 1/16 gate synced to tempo
    while(stutNext<AC.currentTime+0.15){
      g.setValueAtTime(1,stutNext);
      g.setValueAtTime(0,stutNext+cyc*0.55);
      stutNext+=cyc;
    }
  };
  sched(); stutTimer=setInterval(sched,40);
}
function stutterEnd(){
  if(!stutTimer) return;
  clearInterval(stutTimer); stutTimer=0;
  $('btnStut').classList.remove('on');
  if(LIVE){ const g=LIVE.perfGain.gain; g.cancelScheduledValues(AC.currentTime); g.setTargetAtTime(1,AC.currentTime,0.01); }
}
function onTilt(e){
  if(!tiltOn || !LIVE) return;
  const nx=clamp(((e.gamma||0)+45)/90,0,1), q=1+clamp(Math.abs(e.beta||0)/90,0,1)*8;
  LIVE.perfFilt.frequency.setTargetAtTime(180*Math.pow(80,nx),AC.currentTime,0.05);
  LIVE.perfFilt.Q.setTargetAtTime(q,AC.currentTime,0.05);
}
function tiltReset(){
  if(!LIVE) return;
  LIVE.perfFilt.frequency.setTargetAtTime(18500,AC.currentTime,0.05);
  LIVE.perfFilt.Q.setTargetAtTime(0.7,AC.currentTime,0.05);
}
function drawLive(){
  const m=S.inst.mode;
  $('instSel').value=m; $('instVoiceSel').value=S.inst.voice;
  $('instKey').value=String(S.inst.key); $('instScale').value=S.inst.scale;
  $('instSnap').classList.toggle('on',S.inst.snap);
  $('instSnap').style.display=(m==='ther'||m==='ribbon')?'':'none';
  $('liveSurf').style.display=(m==='ther'||m==='harp'||m==='ribbon')?'block':'none';
  $('chordgrid').style.display=(m==='chord')?'grid':'none';
  $('keysgrid').style.display=(m==='keys'||m==='flute')?'grid':'none';
  $('chordopts').style.display=(m==='chord')?'flex':'none';
  $('percopts').style.display=(m==='perc')?'flex':'none';
  $('fluteopts').style.display=(m==='flute')?'flex':'none';
  $('percKind').value=S.inst.perc||'shaker';
  $('instShake').classList.toggle('on',shakeArmed);
  $('inst7').classList.toggle('on',S.inst.sev);
  $('instStrum').classList.toggle('on',S.inst.strum);
  $('instArp').classList.toggle('on',S.inst.arp);
  $('instVol').value=S.inst.vol; $('instVolV').textContent=Math.round(S.inst.vol*100)+'%';
  $('instRev').value=S.inst.rev; $('instRevV').textContent=Math.round(S.inst.rev*100)+'%';
  $('instDly').value=S.inst.dly; $('instDlyV').textContent=Math.round(S.inst.dly*100)+'%';
  if(m==='chord') drawChordGrid();
  if(m==='keys'||m==='flute') drawKeysGrid();
  if(m==='ther'||m==='harp'||m==='ribbon') drawSurf(-1,-1);
}
(function(){
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  names.forEach((n,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=n; $('instKey').appendChild(o); });
})();
$('btnPerfRec').addEventListener('click',()=>{
  if(traxCap){ stopSeq(); return; }            // rolling — stop commits the take
  ensureAudio();
  // REC PERFORMANCE always goes to an EMPTY lane so it can never overwrite a
  // track you already recorded. Use the armed lane only if IT is empty; else
  // the first empty lane. (To re-record a specific take, arm it in TRAX and
  // press PLAY — that path is the deliberate overwrite.)
  let i=(traxArm>=0 && S.trax[traxArm].bufId<0) ? traxArm : S.trax.findIndex(t=>t.bufId<0);
  if(i<0){ lcd('ALL 8 TRACKS HAVE TAKES — clear one in TRAX (✕), or arm it there and PLAY to re-record.'); return; }
  $('traxSrc').value='live';                   // REC PERFORMANCE isolates what YOU play (the live bus), not the whole mix
  if(traxStream) disarmTrax();                 // a pending mic arm would hijack the capture source
  traxArm=i; drawTrax();
  if(playing) stopSeq();
  startSeq();                                  // transport rolls; capture starts on the armed lane
  $('btnPerfRec').classList.add('on');
  lcd('RECORDING \u2192 TRACK '+(i+1)+' — play! Only your live playing is captured, not the beat. Tap again (or STOP) to commit.');
});
$('instSel').addEventListener('change',e=>{ instPanic(); S.inst.mode=e.target.value; drawLive(); dirty(); });
$('instVoiceSel').addEventListener('change',e=>{ S.inst.voice=e.target.value; dirty(); });
$('instKey').addEventListener('change',e=>{ instPanic(); S.inst.key=parseInt(e.target.value,10); drawLive(); dirty(); });
$('instScale').addEventListener('change',e=>{ instPanic(); S.inst.scale=e.target.value; drawLive(); dirty(); });
$('instSnap').addEventListener('click',()=>{ S.inst.snap=!S.inst.snap; drawLive(); });
$('inst7').addEventListener('click',()=>{ S.inst.sev=!S.inst.sev; drawLive(); dirty(); });
$('instStrum').addEventListener('click',()=>{ S.inst.strum=!S.inst.strum; drawLive(); dirty(); });
$('instArp').addEventListener('click',()=>{ S.inst.arp=!S.inst.arp; drawLive(); dirty(); });
$('percKind').addEventListener('change',e=>{ S.inst.perc=e.target.value; dirty(); });
$('instShake').addEventListener('click',async ()=>{
  if(shakeArmed){ shakeArmed=false; drawLive(); lcd('SHAKE OFF.'); return; }
  ensureAudio();
  if(await enableMotion()){ shakeArmed=true; drawLive(); lcd('SHAKE ON — shake the phone to play '+(S.inst.perc||'shaker')+'.'); }
});
$('percTapA').addEventListener('click',()=>hitPerc(0.9));
$('percTapG').addEventListener('click',()=>hitPerc(0.45));
$('instBreath').addEventListener('click',breathToggle);
$('btnTilt').addEventListener('click',async ()=>{
  if(tiltOn){ tiltOn=false; $('btnTilt').classList.remove('on'); tiltReset(); lcd('TILT WAH OFF.'); return; }
  ensureAudio();
  if(await enableMotion()){ tiltOn=true; $('btnTilt').classList.add('on'); lcd('TILT WAH — tilt left/right sweeps the filter, forward/back adds resonance.'); }
});
(function(){
  const hold=(id,on,off)=>{ const b=$(id);
    b.addEventListener('touchstart',e=>{ e.preventDefault(); on(); },{passive:false});
    b.addEventListener('touchend',e=>{ e.preventDefault(); off(); },{passive:false});
    b.addEventListener('mousedown',on);
    b.addEventListener('mouseup',off);
    b.addEventListener('mouseleave',off);
  };
  hold('btnTape',tapeStart,tapeEnd);
  hold('btnStut',stutterStart,stutterEnd);
})();
$('instVol').addEventListener('input',e=>{ S.inst.vol=parseFloat(e.target.value); $('instVolV').textContent=Math.round(S.inst.vol*100)+'%'; if(LIVE&&LIVE._inst) LIVE._inst.g.gain.setTargetAtTime(S.inst.vol,AC.currentTime,0.02); dirty(); });
$('instRev').addEventListener('input',e=>{ S.inst.rev=parseFloat(e.target.value); $('instRevV').textContent=Math.round(S.inst.rev*100)+'%'; if(LIVE&&LIVE._inst) LIVE._inst.rv.gain.setTargetAtTime(S.inst.rev,AC.currentTime,0.02); dirty(); });
$('instDly').addEventListener('input',e=>{ S.inst.dly=parseFloat(e.target.value); $('instDlyV').textContent=Math.round(S.inst.dly*100)+'%'; if(LIVE&&LIVE._inst) LIVE._inst.dl.gain.setTargetAtTime(S.inst.dly,AC.currentTime,0.02); dirty(); });

/* seq UI */
function selectPattern(i){
  S.pattern=i;
  const pb=S.patterns[i].bpm;
  if(S.ptnBpm && pb && !S.extClk){
    S.bpm=clampBpm(pb);
    $('bpmval').value=S.bpm.toFixed(1);
    $('djBpm').value=S.bpm; $('djBpmV').textContent=S.bpm.toFixed(1);
    liveDelaySync();
  }
}
function drawSeq(){
  const pr=$('patrow');
  pr.querySelectorAll('button').forEach(b=>b.remove());
  for(let i=0;i<NPAT;i++){
    const b=document.createElement('button'); b.textContent=i+1;
    b.setAttribute('aria-label','Pattern '+(i+1));
    if(i===S.pattern) b.classList.add('on');
    b.addEventListener('click',()=>{ selectPattern(i); drawSeq(); lcd('PTN '+(i+1)+(S.ptnBpm&&S.patterns[i].bpm?' · '+S.patterns[i].bpm.toFixed(1)+' BPM':'')); });
    pr.appendChild(b);
  }
  $('chainview').textContent=S.chain.length? S.chain.map(x=>x+1).join(' → ') : '—';
  $('btnChainOn').classList.toggle('on',S.chainOn);
  // pad strip: 16 pads of current bank
  const st=$('seqpadstrip'); st.innerHTML='';
  for(let s=0;s<16;s++){
    const idx=padIndex(s);
    const b=document.createElement('button'); b.textContent=padName(idx).slice(1);
    b.setAttribute('aria-label','Edit track '+padName(idx)+(S.pads[idx].name?', '+S.pads[idx].name:''));
    if(idx===S.seqPad) b.classList.add('on');
    b.addEventListener('click',()=>{ S.seqPad=idx; S.editPad=idx; manualPad=true; seqSelStep=-1; drawSeq(); drawStepLock(); drawPads(); });
    st.appendChild(b);
  }
  $('seqPadName').textContent=padName(S.seqPad)+(S.pads[S.seqPad].name?' · '+S.pads[S.seqPad].name:'');
  { const pl=curPatLen(); $('patLenSel').value=String(pl); $('euSteps').max=String(pl); }
  { const b=$('seqModeBadge');                    // the grid is not the pattern right now — say so
    if(b){ const on=morphActive();
      b.style.display=on?'':'none';
      if(on) b.textContent='MORPH RUNNING · PTN '+(S.morph.from+1)+' → PTN '+(S.morph.to+1)
        +' · '+Math.round(S.morph.amt*100)+'% — showing the blend, editing is off'; } }
  drawSteps(); drawAuto(); drawSong();
}
let seqLockMode=false, seqSelStep=-1;
function drawSteps(){
  const gr=$('stepgrid'); gr.innerHTML='';
  const pat=curPat(), row=pat.steps[S.seqPad], L=trackLen(pat,S.seqPad);
  $('seqLenV').textContent=L;
  for(let i=0;i<L;i++){
    const el=document.createElement('button'); el.className='step'+(i%4===0?' q2':'');
    const v=row[i];
    if(v>0){ el.classList.add('on'); el.style.opacity=String(0.45+v*0.55); }
    el.setAttribute('aria-label','Step '+(i+1)+' of '+L+', '+padName(S.seqPad));
    el.setAttribute('aria-pressed', v>0?'true':'false');
    if(pat.locks && stepHasLock(pat.locks[S.seqPad+':'+i])) el.classList.add('lockmark');
    if(seqLockMode && i===seqSelStep) el.classList.add('selstep');
    el.addEventListener('click',()=>{
      if(morphGuard()) return;
      if(seqLockMode){ seqSelStep=i; drawSteps(); drawStepLock(); }
      else {
        const wasOn=row[i]>0;
        row[i]=wasOn?0:parseFloat($('stepVel').value);
        if(wasOn && playing) stopPadVoices(S.seqPad);   // removing a step cuts its still-ringing voice — no ghost
        drawSteps(); dirty();
      }
    });
    gr.appendChild(el);
  }
  drawNotes();   // keep the melodic lane in step with the velocity grid
  drawPads();    // pad LEDs mirror the current pattern's usage
  drawSil();     // silencer row belongs to the pattern too
  drawMorph();   // and the morph preview follows the selected track
  if(seqView==='circle') drawCircle();   // both views show the same pattern
  a11yPass($('stepgrid').parentElement===document.body?document:$('v-seq'));
}
function setTrackLen(d){
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern];
  const PL=patLen(pat);
  if(!Array.isArray(pat.len)) pat.len=new Array(NPADS).fill(PL);
  pat.len[S.seqPad]=clamp((pat.len[S.seqPad]||PL)+d,1,PL);
  if(seqSelStep>=pat.len[S.seqPad]) seqSelStep=-1;
  drawSteps(); drawStepLock(); dirty();
  lcd('TRACK '+padName(S.seqPad)+' LEN '+pat.len[S.seqPad]+(pat.len[S.seqPad]!==PL?' · polymeter':''));
}
function setPatLen(n){
  if(PATLENS.indexOf(n)<0) return;
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern], old=patLen(pat);
  if(n===old){ drawSteps(); return; }
  pat.plen=n;
  if(!Array.isArray(pat.len)) pat.len=new Array(NPADS).fill(n);
  for(let p=0;p<NPADS;p++){
    // tracks that were running the full pattern follow it; shortened
    // (polymeter) tracks keep their own length, just capped by the new size
    pat.len[p] = (pat.len[p]===old) ? n : clamp(pat.len[p]||n,1,n);
  }
  if(seqSelStep>=n) seqSelStep=-1;
  $('euSteps').max=String(n);
  drawSeq(); drawSteps(); drawStepLock(); euRefresh(); dirty();
  lcd('PATTERN '+(S.pattern+1)+' IS NOW '+n+' STEPS ('+(n/NSTEPS)+' bar'+(n>NSTEPS?'s':'')+') — '+(n>old?'the extra steps are empty':'steps past '+n+' are no longer played'));
}
$('patLenSel').addEventListener('change',e=>setPatLen(parseInt(e.target.value,10)));
$('btnLenDn').addEventListener('click',()=>setTrackLen(-1));
$('btnLenUp').addEventListener('click',()=>setTrackLen(1));
$('btnStepLock').addEventListener('click',()=>{
  seqLockMode=!seqLockMode; $('btnStepLock').classList.toggle('on',seqLockMode);
  if(!seqLockMode) seqSelStep=-1;
  $('lockHint').textContent=seqLockMode?'tap a step to edit its locks':'tap step to toggle';
  drawSteps(); drawStepLock();
});
function drawStepLock(){
  const panel=$('steplock');
  if(!seqLockMode || seqSelStep<0){ panel.style.display='none'; return; }
  panel.style.display='block';
  const lk=S.patterns[S.pattern].locks[S.seqPad+':'+seqSelStep]||{};
  $('slTitle').textContent=padName(S.seqPad)+' · step '+(seqSelStep+1);
  const sv=S.patterns[S.pattern].steps[S.seqPad][seqSelStep];
  $('slVel').value=sv>0?sv:parseFloat($('stepVel').value);
  $('slVelV').textContent=sv>0?Math.round(sv*100)+'%':'(step off)';
  $('slPitch').value=lk.pitch||0; $('slPitchV').textContent=lk.pitch?((lk.pitch>0?'+':'')+lk.pitch+' st'):'off';
  $('slProb').value=lk.prob!=null?lk.prob:1; $('slProbV').textContent=Math.round((lk.prob!=null?lk.prob:1)*100)+'%';
  $('slRat').value=lk.rat||1; $('slRatV').textContent=String(lk.rat||1);
  $('slNudge').value=lk.nudge||0; $('slNudgeV').textContent=(lk.nudge?(lk.nudge>0?'+':'')+Math.round(lk.nudge*100)+'%':'0');
}
function setLock(field,val,def){
  if(seqSelStep<0) return;
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern], k=S.seqPad+':'+seqSelStep, lk=pat.locks[k]||{};
  if(field==='pitch'){ delete lk.pitches;   // the step-lock pitch control edits a single note — collapse any chord here
    val=snapToScale(val); }                  // SCALE LOCK: land in key
  if(val===def) delete lk[field]; else lk[field]=val;
  if(Object.keys(lk).length) pat.locks[k]=lk; else delete pat.locks[k];
  drawSteps(); drawStepLock(); dirty();
}
$('slVel').addEventListener('input',e=>{
  if(seqSelStep<0) return;
  if(morphGuard()) return;
  S.patterns[S.pattern].steps[S.seqPad][seqSelStep]=parseFloat(e.target.value);
  drawSteps(); drawStepLock(); dirty();
});
$('slPitch').addEventListener('input',e=>setLock('pitch',parseInt(e.target.value,10),0));
$('slProb').addEventListener('input',e=>setLock('prob',parseFloat(e.target.value),1));
$('slRat').addEventListener('input',e=>setLock('rat',parseInt(e.target.value,10),1));
$('slNudge').addEventListener('input',e=>setLock('nudge',parseFloat(e.target.value),0));
$('slClr').addEventListener('click',()=>{ if(morphGuard()) return; delete S.patterns[S.pattern].locks[S.seqPad+':'+seqSelStep]; drawSteps(); drawStepLock(); dirty(); });

/* ---- melodic NOTES lane: a scale grid that writes per-step pitch locks.
   Rows are scale notes relative to the pad's own root (a sample plays at
   pitch 0 = how it was recorded), so any sound becomes a melody instrument.
   One note per step — the engine, bounce and MIDI export already honor
   lock pitch, so this is pure UI over existing data. */
let notesMode=false, noteOct=0;
const NOTE_ROWS=8;
function noteOffsets(){ // semitone offset per row, TOP row first
  const sc=SCALES[S.scaleName]||SCALES.minor, n=sc.length, out=[];
  for(let r=0;r<NOTE_ROWS;r++){
    const deg=NOTE_ROWS-1-r;
    out.push(sc[deg%n]+12*Math.floor(deg/n)+noteOct*12);
  }
  return out;
}
function drawNotes(){
  const panel=$('notesPanel'); if(!panel || panel.style.display==='none') return;
  const gr=$('notegrid'); gr.innerHTML='';
  const pat=curPat(), row=pat.steps[S.seqPad], L=trackLen(pat,S.seqPad);
  gr.style.gridTemplateColumns='30px repeat('+L+',1fr)';
  $('noteScale').value=S.scaleName in SCALES ? S.scaleName : 'minor';
  $('noteOctV').textContent=(noteOct>0?'+':'')+noteOct;
  const offs=noteOffsets();
  offs.forEach((off,r)=>{
    const lbl=document.createElement('div'); lbl.className='nlbl';
    lbl.textContent=off===0?'root':(off>0?'+':'')+off;
    gr.appendChild(lbl);
    for(let i=0;i<L;i++){
      const c=document.createElement('button'); c.className='ncell'+(off===0?' root':'')+(i%4===0?' q2':'');
      c.dataset.col=i;
      if(row[i]>0){
        const lk=pat.locks && pat.locks[S.seqPad+':'+i];
        if(notePitches(lk,row[i]).includes(off)) c.classList.add('non');   // light every note in the chord
      }
      c.addEventListener('click',()=>toggleNote(i,off));
      gr.appendChild(c);
    }
  });
}
function notePitches(lk,rowv){   // the pitch offsets active in a NOTES column (a chord may hold several)
  if(!(rowv>0)) return [];
  if(lk && lk.pitches && lk.pitches.length) return lk.pitches.slice();
  return [ (lk&&lk.pitch)||0 ];
}
function setNotePitches(pat,k,row,i,set){   // write a column's chord back; keeps lk.pitch as the lowest for MIDI-out/compat
  set=Array.from(new Set(set)).sort((a,b)=>a-b);
  let lk=pat.locks[k]||{};
  if(!set.length){ row[i]=0; delete lk.pitch; delete lk.pitches; if(!Object.keys(lk).length) delete pat.locks[k]; else pat.locks[k]=lk; return; }
  if(!(row[i]>0)) row[i]=parseFloat($('stepVel').value);
  if(set.length===1){ delete lk.pitches; if(set[0]===0) delete lk.pitch; else lk.pitch=set[0]; }
  else { lk.pitches=set; lk.pitch=set[0]; }
  if(Object.keys(lk).length) pat.locks[k]=lk; else delete pat.locks[k];
}
function toggleNote(i,off){
  // Polyphonic: tapping adds/removes a note in the column, so several pitches
  // can stack into a chord (harmony). Tapping a lit note removes just that one.
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern], k=S.seqPad+':'+i, row=pat.steps[S.seqPad];
  let set=notePitches(pat.locks[k],row[i]);
  const had=set.includes(off);
  set = had ? set.filter(x=>x!==off) : set.concat(off);
  setNotePitches(pat,k,row,i,set);
  if(playing) stopPadVoices(S.seqPad);
  else if(!had) hitLive(S.seqPad,(row[i]>0?row[i]:parseFloat($('stepVel').value)),off);   // audition the added note
  drawSteps(); dirty();
}
$('btnNotes').addEventListener('click',()=>{
  notesMode=!notesMode; $('btnNotes').classList.toggle('on',notesMode);
  $('notesPanel').style.display=notesMode?'block':'none';
  if(notesMode) drawNotes();
  lcd(notesMode?'NOTES: tap the grid to write a melody on '+padName(S.seqPad):'NOTES closed');
});
$('noteScale').addEventListener('change',e=>{ S.scaleName=e.target.value; $('scaleName').value=e.target.value; drawScaleLock(); drawNotes(); dirty(); });
$('noteOctDn').addEventListener('click',()=>{ noteOct=clamp(noteOct-1,-3,3); drawNotes(); });
$('noteOctUp').addEventListener('click',()=>{ noteOct=clamp(noteOct+1,-3,3); drawNotes(); });
function drawSil(){
  const gr=$('silrow'); if(!gr) return; gr.innerHTML='';
  const pat=curPat();
  if(!Array.isArray(pat.sil)) pat.sil=new Array(MAXSTEPS).fill(0);
  for(let i=0;i<patLen(pat);i++){
    const el=document.createElement('button'); el.className='step'+(i%4===0?' q2':'');
    if(pat.sil[i]) el.classList.add('on');
    el.setAttribute('aria-label','Silencer, step '+(i+1));
    el.setAttribute('aria-pressed', pat.sil[i]?'true':'false');
    el.addEventListener('click',()=>{ if(morphGuard()) return; pat.sil[i]=pat.sil[i]?0:1; drawSil(); dirty();
      lcd(pat.sil[i]?'SILENCER on step '+(i+1)+' — cut, then sound returns on the next hit':'silencer step cleared'); });
    gr.appendChild(el);
  }
}
$('silFade').addEventListener('input',e=>{ S.silFade=parseFloat(e.target.value);
  $('silFadeV').textContent=Math.round(S.silFade*1000)+'ms'; dirty(); });
$('btnChainAdd').addEventListener('click',()=>{ S.chain.push(S.pattern); drawSeq(); dirty(); });
$('btnChainClr').addEventListener('click',()=>{ S.chain=[]; S.chainPos=0; drawSeq(); dirty(); });
$('btnChainOn').addEventListener('click',()=>{ S.chainOn=!S.chainOn; if(S.chainOn && morphActive()) morphStop('MORPH OFF — CHAIN takes over.'); drawSeq(); dirty(); });
$('btnSolo').addEventListener('click',()=>{
  seqSolo=!seqSolo; $('btnSolo').classList.toggle('on',seqSolo);
  lcd(seqSolo?'SOLO: only '+padName(S.seqPad)+' plays — tap SOLO again to unmute all':'SOLO OFF — all tracks play');
});
$('btnRowClr').addEventListener('click',()=>{ if(morphGuard()) return; const pat=S.patterns[S.pattern]; stopPadVoices(S.seqPad); pat.steps[S.seqPad].fill(0); for(let i=0;i<MAXSTEPS;i++) delete pat.locks[S.seqPad+':'+i]; drawSteps(); drawStepLock(); dirty(); });
$('btnPtnBpm').addEventListener('click',()=>{
  S.ptnBpm=!S.ptnBpm; dirty();
  $('btnPtnBpm').classList.toggle('on',S.ptnBpm);
  if(S.ptnBpm){
    if(S.patterns[S.pattern].bpm==null) S.patterns[S.pattern].bpm=S.bpm;
    lcd('PTN TEMPO ON · PTN '+(S.pattern+1)+' @ '+S.bpm.toFixed(1)+' BPM');
  }else lcd('PTN TEMPO OFF · global BPM');
});
$('btnPatClr').addEventListener('click',()=>{ if(morphGuard()) return; panicVoices(); S.patterns[S.pattern]=newPattern(); drawSteps(); dirty(); lcd('PTN '+(S.pattern+1)+' CLEARED'); });

/* ---------------- BUILD A KIT — derive a drum kit from one sample -------------
   Every piece is the SAME source audio, re-voiced: pitched (playbackRate),
   band-limited (biquad), re-enveloped, and for some pieces layered with a
   synthesized sub or a noise burst taken through the same filter. Because it
   all comes from one recording, the kit sounds coherent — and any sound works:
   a field recording, a vocal, a door slam, a Pixabay grab. */
const KIT_PIECES=[
  {id:'KICK', len:0.50, semi:-24, filt:['lowpass',115,1.1], att:0.002, dec:0.34, sub:{hz:52,g:0.75,dec:0.30}, drive:1.5},
  {id:'SNARE',len:0.30, semi:-4,  filt:['bandpass',950,0.9], att:0.002, dec:0.17, noise:{hz:2400,q:0.7,g:0.5,dec:0.13}},
  {id:'HAT',  len:0.11, semi:8,   filt:['highpass',6800,0.7],att:0.001, dec:0.045},
  {id:'PERC', len:0.22, semi:2,   filt:['bandpass',1250,1.5],att:0.002, dec:0.13},
  {id:'OHAT', len:0.45, semi:8,   filt:['highpass',6000,0.7],att:0.001, dec:0.32},
  {id:'CLAP', len:0.34, semi:-2,  filt:['bandpass',1600,0.8],att:0.002, dec:0.15, bursts:[0,0.012,0.023,0.034]},
  {id:'TOM',  len:0.42, semi:-14, filt:['lowpass',430,1.0],  att:0.002, dec:0.30, sub:{hz:110,g:0.4,dec:0.26}},
  {id:'RIM',  len:0.10, semi:4,   filt:['bandpass',2600,2.6],att:0.001, dec:0.05},
  {id:'SUB',  len:0.95, semi:-31, filt:['lowpass',95,1.0],   att:0.005, dec:0.75, sub:{hz:41,g:0.8,dec:0.70}},
  {id:'CRASH',len:1.50, semi:6,   filt:['highpass',3600,0.6],att:0.003, dec:1.15},
  {id:'RIDE', len:1.05, semi:10,  filt:['bandpass',5400,0.8],att:0.002, dec:0.80},
  {id:'FX',   len:0.85, semi:-9,  filt:['bandpass',720,1.2], att:0.06,  dec:0.62, rev:true},
];
function loudestOffset(buf){   // the strongest onset — the most useful attack material
  const d=buf.getChannelData(0), sr=buf.sampleRate, win=Math.max(1,Math.floor(sr*0.01));
  let best=0,bi=0;
  for(let o=0;o+win<d.length;o+=win){
    let e=0; for(let i=o;i<o+win;i+=2) e+=d[i]*d[i];
    if(e>best){ best=e; bi=o; }
  }
  return Math.max(0,(bi-Math.floor(sr*0.004))/sr);   // back off slightly so the attack isn't clipped
}
async function renderKitPiece(src, def, opts){
  const sr=44100, len=Math.max(0.05,def.len*opts.decay);
  const oc=new OfflineAudioContext(1,Math.ceil(sr*len),sr);
  const rate=Math.pow(2,(def.semi+opts.tune)/12);
  const s=oc.createBufferSource(); s.buffer=src; s.playbackRate.value=rate;
  const f=oc.createBiquadFilter(); f.type=def.filt[0]; f.frequency.value=def.filt[1]; f.Q.value=def.filt[2];
  const env=oc.createGain();
  let node=s; node.connect(f); node=f;
  if(def.drive){ const ws=oc.createWaveShaper(); const c=new Float32Array(1024);
    for(let i=0;i<1024;i++){ const x=i/511.5-1; c[i]=Math.tanh(x*def.drive); }
    ws.curve=c; ws.oversample='2x'; node.connect(ws); node=ws; }
  node.connect(env); env.connect(oc.destination);
  // amp envelope — SNAP shortens the attack and sharpens the decay curve
  const att=Math.max(0.0005,def.att*(1.4-opts.snap)), dec=Math.max(0.02,def.dec*opts.decay);
  env.gain.setValueAtTime(0,0);
  env.gain.linearRampToValueAtTime(1,att);
  env.gain.setTargetAtTime(0,att,dec/(2.2+opts.snap*2.5));
  const off=Math.min(Math.max(0,opts.offset), Math.max(0,src.duration-0.02));
  if(def.bursts){ // clap: several short taps of the same material
    def.bursts.forEach((b,k)=>{
      const bs=oc.createBufferSource(); bs.buffer=src; bs.playbackRate.value=rate;
      const bg=oc.createGain(); bg.gain.value=(1-k*0.16);
      bs.connect(f); bs.connect(bg); bg.connect(f);
      try{ bs.start(b,off,Math.min(0.05,src.duration-off)); }catch(e){}
    });
  }
  try{ s.start(0,off,Math.min(src.duration-off,len*rate+0.05)); }catch(e){ try{ s.start(0); }catch(e2){} }
  if(def.sub){   // synthesized body so low pieces have real weight
    const o=oc.createOscillator(), g=oc.createGain();
    o.type='sine'; o.frequency.setValueAtTime(def.sub.hz*2.2*Math.pow(2,opts.tune/12),0);
    o.frequency.exponentialRampToValueAtTime(def.sub.hz*Math.pow(2,opts.tune/12),Math.min(0.09,def.sub.dec));
    g.gain.setValueAtTime(0,0); g.gain.linearRampToValueAtTime(def.sub.g,0.004);
    g.gain.setTargetAtTime(0,0.004,def.sub.dec*opts.decay/2.4);
    o.connect(g); g.connect(oc.destination); o.start(0); o.stop(len);
  }
  if(def.noise){ // noise layer through the same band = snare "sizzle" that matches the source
    const nb=oc.createBuffer(1,Math.ceil(sr*Math.min(len,0.4)),sr), nd=nb.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
    const ns=oc.createBufferSource(); ns.buffer=nb;
    const nf=oc.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=def.noise.hz; nf.Q.value=def.noise.q;
    const ng=oc.createGain();
    ng.gain.setValueAtTime(0,0); ng.gain.linearRampToValueAtTime(def.noise.g,0.002);
    ng.gain.setTargetAtTime(0,0.002,def.noise.dec*opts.decay/2.4);
    ns.connect(nf); nf.connect(ng); ng.connect(oc.destination); ns.start(0);
  }
  const out=await oc.startRendering();
  // trim trailing silence + normalize
  const d=out.getChannelData(0); let pk=0, last=0;
  for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk) pk=a; }
  if(pk<1e-5) return out;
  for(let i=0;i<d.length;i++) if(Math.abs(d[i])>pk*0.005) last=i;
  const n=Math.max(Math.floor(sr*0.03),last+Math.floor(sr*0.01));
  const fin=mkAudioBuf(Math.min(n,d.length),sr,1), fd=fin.getChannelData(0);
  const k=0.95/pk;
  for(let i=0;i<fd.length;i++) fd[i]=d[i]*k;
  const fade=Math.min(fd.length,Math.floor(sr*0.006));
  for(let i=0;i<fade;i++) fd[fd.length-1-i]*=i/fade;
  return fin;
}
['kbTune','kbDecay','kbSnap'].forEach(id=>$(id).addEventListener('input',()=>{
  $('kbTuneV').textContent=(+$('kbTune').value>0?'+':'')+$('kbTune').value+' st';
  $('kbDecayV').textContent=(+$('kbDecay').value).toFixed(2)+'×';
  $('kbSnapV').textContent=Math.round(+$('kbSnap').value*100)+'%';
}));
let kitBuilding=false;
$('btnKitBuild').addEventListener('click',async ()=>{
  if(kitBuilding) return;
  if(!workBuf){ lcd('Load a sound first (IMPORT FILE, a pack sample, REC MIC, or a TRAX take).'); return; }
  ensureAudio();
  const count=parseInt($('kbSize').value,10);
  const start=S.editPad;
  const used=[]; for(let i=0;i<count;i++){ const p=(start+i)%NPADS; if(S.pads[p].bufId>=0) used.push(padName(p)); }
  if(used.length && !confirm('BUILD KIT will fill '+count+' pads starting at '+padName(start)+'.\n\n'+used.length+' of them already have sounds ('+used.slice(0,6).join(', ')+(used.length>6?'…':'')+') and will be REPLACED.\n\nUndo restores them. Continue?')) return;
  // source region: whole sample, or the selected chop slice
  let src=workBuf, offset=loudestOffset(workBuf);
  if($('kbSrc').value==='slice' && selSlice>=0 && slices[selSlice]){
    const sl=slices[selSlice], sr=workBuf.sampleRate;
    const a=Math.floor(sl.s*workBuf.length), b=Math.floor(sl.e*workBuf.length);
    const nb=mkAudioBuf(Math.max(64,b-a),sr,workBuf.numberOfChannels);
    for(let c=0;c<workBuf.numberOfChannels;c++) nb.copyToChannel(workBuf.getChannelData(c).subarray(a,b),c);
    src=nb; offset=loudestOffset(nb);
  }
  const opts={ tune:+$('kbTune').value, decay:+$('kbDecay').value, snap:+$('kbSnap').value, offset };
  kitBuilding=true; $('btnKitBuild').disabled=true;
  try{
    const made=[];
    for(let i=0;i<count;i++){
      const def=KIT_PIECES[i];
      lcd('BUILDING '+(i+1)+'/'+count+' · '+def.id+' …');
      await new Promise(r=>setTimeout(r,0));
      const buf=await renderKitPiece(src,def,opts);
      const pad=(start+i)%NPADS;
      S.buffers.push(buf);
      const p=S.pads[pad];
      p.bufId=S.buffers.length-1; p.start=0; p.end=1; p.name=def.id; p.warped=false;
      p.gain=0.9; p.pitch=0; p.fine=0; p.reverse=false; p.mode='one'; p.speed=1; p.keepPitch=false;
      delete warpOrig[pad]; delete p.srcPreset; delete p.srcNote;
      made.push(pad);
    }
    if($('kbBeat').checked){   // a simple, musical starter pattern using the new pads
      const pat=S.patterns[S.pattern];
      made.forEach(p=>{ pat.steps[p].fill(0); for(let s=0;s<MAXSTEPS;s++) delete pat.locks[p+':'+s]; });
      const put=(i,steps,v)=>{ if(i>=made.length) return; steps.forEach(s=>{ if(s<NSTEPS) pat.steps[made[i]][s]=v; }); };
      put(0,[0,4,8,12],1.0);              // KICK
      put(1,[4,12],0.9);                  // SNARE
      put(2,[2,6,10,14],0.55);            // HAT
      put(3,[7,15],0.6);                  // PERC
      if(made.length>=8){ put(4,[14],0.5); put(5,[12],0.7); put(6,[9],0.6); put(7,[3,11],0.45); }
      drawSeq();
    }
    workBuf=S.buffers[S.pads[start].bufId]; slices=[]; selSlice=-1;
    buildPads(); drawPads(); drawEdit(); drawWave(); drawMixer(); dirty();
    lcd('KIT BUILT · '+count+' pieces → '+padName(made[0])+'–'+padName(made[made.length-1])+(($('kbBeat').checked)?' + starter beat — press PLAY':' — tap the pads'));
  }catch(err){ lcd('KIT BUILD FAILED: '+(err&&err.message||'error')); }
  finally{ kitBuilding=false; $('btnKitBuild').disabled=false; }
});

/* ---------------- SCALE LOCK — a musical guard-rail ---------------------------
   Pitch in the sequencer is a SEMITONE OFFSET from each pad's own sound, so
   offset 0 is that pad's tonic. Locking snaps every written or played offset
   to the nearest degree of the chosen scale — you can still play anything, it
   just lands in key. Off by default; nothing is rewritten unless you ask. */
/* The snap itself is pure and lives in src/pure/scale.js; this is the thin
   wrapper that knows about app state — whether the lock is even on. */
function snapToScale(semi){ return S.scaleLock ? snapSemitone(semi, S.scaleName) : semi; }
(function(){ const r=$('scaleRoot');
  NOTE_NAMES.forEach((n,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=n; r.appendChild(o); });
  r.value='0';
})();
function scaleLabel(){
  return NOTE_NAMES[S.scaleRoot|0]+' '+($('scaleName').selectedOptions[0]?$('scaleName').selectedOptions[0].textContent:S.scaleName);
}
function drawScaleLock(){
  $('btnScaleLock').classList.toggle('on',!!S.scaleLock);
  $('scaleRoot').value=String(S.scaleRoot|0);
  $('scaleName').value=S.scaleName;
  $('scaleRoot').disabled=$('scaleName').disabled=false;
  $('scaleHint').textContent = S.scaleLock
    ? 'ON — every pitch you write or play snaps into '+scaleLabel()+'. FIX PTN retunes what is already there.'
    : 'Off — pitches are chromatic (any semitone).';
}
$('btnScaleLock').addEventListener('click',()=>{
  S.scaleLock=!S.scaleLock; drawScaleLock(); drawNotes(); drawStepLock(); dirty();
  lcd(S.scaleLock?('SCALE LOCK ON · '+scaleLabel()+' — written and played notes snap into key.'):'SCALE LOCK OFF — chromatic again.');
});
$('scaleRoot').addEventListener('change',e=>{ S.scaleRoot=parseInt(e.target.value,10)||0; drawScaleLock(); dirty(); lcd('KEY '+scaleLabel()); });
$('scaleName').addEventListener('change',e=>{ S.scaleName=e.target.value; $('noteScale').value=e.target.value; drawScaleLock(); drawNotes(); dirty(); lcd('SCALE '+scaleLabel()); });
$('btnScaleFix').addEventListener('click',()=>{
  if(morphGuard()) return;
  if(!S.scaleLock){ lcd('Turn SCALE LOCK on first, then FIX PTN retunes this pattern into key.'); return; }
  const pat=S.patterns[S.pattern]; let n=0;
  for(const k in pat.locks){
    const lk=pat.locks[k];
    if(lk.pitches && lk.pitches.length){
      const snapped=Array.from(new Set(lk.pitches.map(snapToScale))).sort((a,b)=>a-b);
      if(snapped.join()!==lk.pitches.join()) n++;
      lk.pitches=snapped; lk.pitch=snapped[0];
      if(snapped.length===1){ delete lk.pitches; if(!snapped[0]) delete lk.pitch; }
    }else if(lk.pitch){
      const s=snapToScale(lk.pitch);
      if(s!==lk.pitch) n++;
      if(s) lk.pitch=s; else delete lk.pitch;
    }
    if(!Object.keys(lk).length) delete pat.locks[k];
  }
  drawSteps(); drawStepLock(); dirty();
  lcd(n? ('RETUNED '+n+' step'+(n>1?'s':'')+' into '+scaleLabel()) : ('Everything in PTN '+(S.pattern+1)+' is already in '+scaleLabel()+'.'));
});
drawScaleLock();

/* ---------------- EUCLID — spread N hits as evenly as possible over K steps ----
   Bjorklund's algorithm: the pattern behind tresillo, clave, and most
   Afro-Latin/Balkan rhythms. Pairs with per-track LEN (polymeter): a 5-in-7
   track against a 16-step kick phrases for bars before it repeats. */
/* euclid → src/pure/euclid.js */
function euParams(){ return { hits:+$('euHits').value, steps:+$('euSteps').value, rot:+$('euRot').value }; }
function euRefresh(){
  const {hits,steps,rot}=euParams();
  $('euStepsV').textContent=steps; $('euHitsV').textContent=hits; $('euRotV').textContent=rot;
  $('euHits').max=steps; if(+$('euHits').value>steps){ $('euHits').value=steps; $('euHitsV').textContent=steps; }
  $('euRot').max=Math.max(0,steps-1); if(+$('euRot').value>steps-1){ $('euRot').value=Math.max(0,steps-1); $('euRotV').textContent=$('euRot').value; }
  const p=euclid(+$('euHits').value,steps,+$('euRot').value);
  $('euPreview').textContent=p.map(v=>v?'●':'·').join(' ');
}
['euSteps','euHits','euRot'].forEach(id=>$(id).addEventListener('input',()=>{ $('euPreset').value=''; euRefresh(); }));
$('euPreset').addEventListener('change',e=>{
  const v=e.target.value; if(!v) return;
  const [h,s,r]=v.split(',').map(Number);
  $('euSteps').value=s; $('euHits').value=h; $('euRot').value=r;
  euRefresh();
});
function euApplyTo(pad){
  if(morphGuard()) return;
  const pat=S.patterns[S.pattern], {rot}=euParams();
  const steps=+$('euSteps').value, hits=+$('euHits').value, mode=$('euMode').value;
  const vel=parseFloat($('stepVel').value)||0.85;
  const p=euclid(hits,steps,rot);
  if($('euSetLen').checked){ if(!Array.isArray(pat.len)) pat.len=new Array(NPADS).fill(patLen(pat)); pat.len[pad]=clamp(steps,1,patLen(pat)); }
  const row=pat.steps[pad], PL=patLen(pat);
  for(let i=0;i<PL;i++){
    const on=p[i%steps];
    if(mode==='replace'){ if(i<steps||!$('euSetLen').checked){ row[i]=on?vel:0; if(!on) delete pat.locks[pad+':'+i]; } }
    else if(mode==='merge'){ if(on&&!(row[i]>0)) row[i]=vel; }
    else if(mode==='remove'){ if(on){ row[i]=0; delete pat.locks[pad+':'+i]; } }
  }
  return p.filter(Boolean).length;
}
$('btnEuApply').addEventListener('click',()=>{
  const n=euApplyTo(S.seqPad);
  drawSteps(); drawStepLock(); dirty();
  const {steps}=euParams();
  lcd('EUCLID '+$('euHits').value+' in '+steps+(+$('euRot').value?' rot '+$('euRot').value:'')+' → '+padName(S.seqPad)+($('euSetLen').checked?' · LEN '+steps+' (polymeter)':''));
});
$('btnEuAll').addEventListener('click',()=>{
  const loaded=[]; for(let i=0;i<NPADS;i++) if(S.pads[i].bufId>=0) loaded.push(i);
  if(!loaded.length){ lcd('No loaded pads to fill.'); return; }
  if(!confirm('Apply this euclid to ALL '+loaded.length+' loaded pad(s) in PTN '+(S.pattern+1)+'?\n\nMODE = '+$('euMode').value.toUpperCase()+'. Undo restores.')) return;
  loaded.forEach((p,k)=>{ const save=$('euRot').value; $('euRot').value=(+save+k)%Math.max(1,+$('euSteps').value); euApplyTo(p); $('euRot').value=save; });
  drawSteps(); dirty();
  lcd('EUCLID → '+loaded.length+' pads (each rotated one step further — instant polyrhythm).');
});

/* ---------------- GROOVE — feel templates -------------------------------------
   Each template gives, per 16th step, a timing offset (as a fraction of a step;
   + = late/behind, − = early/ahead) and a velocity multiplier. Written into the
   pattern as nudge locks + step velocities, so it bounces and exports exactly
   as heard. STRAIGHT clears them. */
/* GROOVES → src/pure/groove.js */

$('grvAmt').addEventListener('input',e=>{ $('grvAmtV').textContent=Math.round(parseFloat(e.target.value)*100)+'%'; });
function grooveApply(pad){
  const g=GROOVES[$('grvSel').value]||GROOVES.straight;
  if(morphGuard()) return;
  const amt=clamp(parseFloat($('grvAmt').value),0,1);
  const useVel=$('grvVel').checked;
  const pat=S.patterns[S.pattern], row=pat.steps[pad], PL=patLen(pat);
  let n=0;
  for(let i=0;i<PL;i++){
    if(!(row[i]>0)) continue;
    n++;
    const k=pat.locks[pad+':'+i]||{};
    const off=(g.t[i%16]||0)*amt;
    if(Math.abs(off)<0.001) delete k.nudge; else k.nudge=clamp(off,-0.5,0.5);
    if(useVel){
      const mul=1+((g.v[i%16]||1)-1)*amt;
      row[i]=clamp(row[i]*mul,0.05,1);
    }
    if(Object.keys(k).length) pat.locks[pad+':'+i]=k; else delete pat.locks[pad+':'+i];
  }
  return n;
}
$('btnGrvTrack').addEventListener('click',()=>{
  const n=grooveApply(S.seqPad);
  drawSteps(); drawStepLock(); dirty();
  const g=GROOVES[$('grvSel').value]||GROOVES.straight;
  lcd(n? (g.name+' → '+padName(S.seqPad)+' · '+n+' step'+(n>1?'s':'')+' at '+Math.round(parseFloat($('grvAmt').value)*100)+'%')
       : 'No hits on '+padName(S.seqPad)+' to groove — program some steps first.');
});
$('btnGrvAll').addEventListener('click',()=>{
  let tot=0, pads=0;
  for(let p=0;p<NPADS;p++){ const n=grooveApply(p); if(n){ tot+=n; pads++; } }
  drawSteps(); drawStepLock(); dirty();
  const g=GROOVES[$('grvSel').value]||GROOVES.straight;
  lcd(tot? (g.name+' → '+pads+' track'+(pads>1?'s':'')+', '+tot+' steps at '+Math.round(parseFloat($('grvAmt').value)*100)+'%')
        : 'Nothing programmed in this pattern yet.');
});
euRefresh();

/* ---------------- AUTOMATION — record macro moves into the pattern ---------------- */
let autoArmed=false, autoRAF=0; const autoTouch={};
const autoTargets={
  mfilt:{name:'MASTER FILTER',fromNorm:x=>120*Math.pow(150,x),toNorm:v=>Math.log(clamp(v,120,18500)/120)/Math.log(150),
    get:()=>LIVE?LIVE.perfFilt.frequency.value:18000, fmt:v=>Math.round(v)+'Hz',
    apply:v=>{ if(LIVE) LIVE.perfFilt.frequency.setTargetAtTime(clamp(v,120,18500),AC.currentTime,0.02); },
    applyG:(g,v,t)=>{ try{ g.perfFilt.frequency.setValueAtTime(clamp(v,120,18500),t); }catch(e){} }},
  mvol:{name:'MASTER VOLUME',fromNorm:x=>x*2,toNorm:v=>clamp(v,0,2)/2,
    get:()=>S.masterVol, fmt:v=>Math.round(v/1.2*100)+'%',
    apply:v=>{ S.masterVol=v; if(LIVE) LIVE.master.gain.setTargetAtTime(v,AC.currentTime,0.02); },
    applyG:(g,v,t)=>{ try{ g.master.gain.setValueAtTime(v,t); }catch(e){} }},
  dfb:{name:'DELAY FEEDBACK',fromNorm:x=>x*0.85,toNorm:v=>clamp(v,0,0.85)/0.85,
    get:()=>S.delayFb, fmt:v=>Math.round(v/0.85*100)+'%',
    apply:v=>{ S.delayFb=v; if(LIVE){ LIVE.dlyFb.gain.setTargetAtTime(v,AC.currentTime,0.02); if(LIVE.dlyFb2) LIVE.dlyFb2.gain.setTargetAtTime(v,AC.currentTime,0.02); } },
    applyG:(g,v,t)=>{ try{ g.dlyFb.gain.setValueAtTime(v,t); if(g.dlyFb2) g.dlyFb2.gain.setValueAtTime(v,t); }catch(e){} }},
  rev:{name:'REVERB LEVEL',fromNorm:x=>x*2,toNorm:v=>clamp(v,0,2)/2,
    get:()=>S.revLvl, fmt:v=>Math.round(v/1.2*100)+'%',
    apply:v=>{ S.revLvl=v; if(LIVE) LIVE.revRet.gain.setTargetAtTime(v,AC.currentTime,0.02); },
    applyG:(g,v,t)=>{ try{ g.revRet.gain.setValueAtTime(v,t); }catch(e){} }},
  scd:{name:'SIDECHAIN DEPTH',fromNorm:x=>x*0.95,toNorm:v=>clamp(v,0,0.95)/0.95,
    get:()=>S.scDepth, fmt:v=>Math.round(v/0.95*100)+'%',
    apply:v=>{ S.scDepth=v; }},   // read live at trigger time; live-only (not baked)
  warb:{name:'WARBLE DEPTH',fromNorm:x=>x*0.12,toNorm:v=>clamp(v,0,0.12)/0.12,
    get:()=>(LIVE&&LIVE.warbGain)?LIVE.warbGain.gain.value:0, fmt:v=>Math.round(v/0.12*100)+'%',
    apply:v=>{ if(LIVE&&LIVE.warbGain) LIVE.warbGain.gain.setTargetAtTime(v,AC.currentTime,0.05); }}
};
function autoPos(){ // bar-relative position 0..NSTEPS
  if(!AC) return 0;
  const sd=stepDur();
  const PL=curPatLen();
  let p=(curAbsStep%PL)+(AC.currentTime-lastStepTime)/sd;
  p%=PL; if(p<0) p+=PL; return p;
}
function autoValueAt(lane,p){
  const n=lane.length; if(!n) return null; if(n===1) return lane[0].v;
  let i0=-1; for(let i=0;i<n;i++){ if(lane[i].p<=p) i0=i; else break; }
  let a,b,seg,dt;
  const PLA=curPatLen();
  if(i0<0){ a=lane[n-1]; b=lane[0]; seg=(PLA-a.p)+b.p; dt=(PLA-a.p)+p; }
  else if(i0===n-1){ a=lane[n-1]; b=lane[0]; seg=(PLA-a.p)+b.p; dt=p-a.p; }
  else { a=lane[i0]; b=lane[i0+1]; seg=b.p-a.p; dt=p-a.p; }
  return a.v+(b.v-a.v)*(seg>0?clamp(dt/seg,0,1):0);
}
function autoRecord(id,p,v){
  const pat=S.patterns[S.pattern]; if(!pat.autom) pat.autom={};
  let lane=(pat.autom[id]||[]).filter(pt=>Math.abs(pt.p-p)>0.3);   // overwrite near new point
  lane.push({p,v}); lane.sort((a,b)=>a.p-b.p); pat.autom[id]=lane;
}
function autoLoop(){
  if(!playing){ autoRAF=0; return; }
  const pat=S.patterns[S.pattern];
  if(pat.autom){
    const p=autoPos(), t=AC.currentTime;
    for(const id in pat.autom){
      if(autoTouch[id] && (t-autoTouch[id])<0.2) continue;   // don't fight a hand actively recording this lane
      const lane=pat.autom[id]; if(!lane||!lane.length) continue;
      const v=autoValueAt(lane,p); if(v==null) continue;
      autoTargets[id].apply(v);
      if(id===S.autoTarget){ $('autoMacro').value=autoTargets[id].toNorm(v); $('autoMacroV').textContent=autoTargets[id].fmt(v); }
    }
  }
  autoRAF=requestAnimationFrame(autoLoop);
}
function autoStart(){ if(!autoRAF) autoRAF=requestAnimationFrame(autoLoop); }
function drawAuto(){
  const sel=$('autoTarget');
  if(sel.options.length!==Object.keys(autoTargets).length){ sel.innerHTML='';
    for(const id in autoTargets){ const o=document.createElement('option'); o.value=id; o.textContent=autoTargets[id].name; sel.appendChild(o); } }
  sel.value=S.autoTarget;
  $('btnAutoRec').classList.toggle('on',autoArmed);
  const pat=S.patterns[S.pattern], has=pat.autom&&pat.autom[S.autoTarget]&&pat.autom[S.autoTarget].length;
  const t=autoTargets[S.autoTarget];
  $('autoMacro').value=t.toNorm(t.get()); $('autoMacroV').textContent=(has?'●':'')+t.fmt(t.get());
}
$('btnAutoRec').addEventListener('click',()=>{
  autoArmed=!autoArmed; $('btnAutoRec').classList.toggle('on',autoArmed);
  lcd(autoArmed?'AUTO REC ARMED — move the MACRO while playing to record '+autoTargets[S.autoTarget].name:'AUTO REC OFF');
});
$('autoTarget').addEventListener('change',e=>{ S.autoTarget=e.target.value; drawAuto(); });
$('autoMacro').addEventListener('input',e=>{
  const t=autoTargets[S.autoTarget], v=t.fromNorm(parseFloat(e.target.value));
  t.apply(v); $('autoMacroV').textContent=t.fmt(v);
  if(autoArmed && playing){ autoTouch[S.autoTarget]=AC.currentTime; autoRecord(S.autoTarget,autoPos(),v); dirty(); }
});
$('btnAutoClr').addEventListener('click',()=>{
  const pat=S.patterns[S.pattern]; if(pat.autom) delete pat.autom[S.autoTarget];
  drawAuto(); dirty(); lcd('AUTO CLEARED · '+autoTargets[S.autoTarget].name);
});

/* ---------------- SONG / arrangement ---------------- */
function songAdvance(){
  const sec=S.song[songPos]; if(!sec){ songPos=0; songRep=0; return; }
  songRep++;
  if(songRep >= Math.max(1,sec.reps||1)){
    songRep=0; songPos++;
    if(songPos >= S.song.length){
      if(S.songLoop){ songPos=0; }
      else { songPos=S.song.length-1; drawSong(); stopSeq(); lcd('SONG COMPLETE'); return; }
    }
  }
  selectPattern(S.song[songPos].pat); drawSeq(); drawSong();
}
function drawSong(){
  $('btnSongOn').classList.toggle('on',S.songOn);
  $('btnSongLoop').classList.toggle('on',S.songLoop);
  const bars=S.song.reduce((a,x)=>a+Math.max(1,x.reps||1),0);
  $('songInfo').textContent=S.song.length? S.song.length+' sec · '+bars+' bars'+(S.songOn&&playing?' · @'+(songPos+1):'') : 'empty — +SEC to build';
  const el=$('songlist'); if(!el) return; el.innerHTML='';
  S.song.forEach((sec,i)=>{
    const row=document.createElement('div'); row.className='row'; row.style.gap='4px';
    if(S.songOn && playing && i===songPos) row.style.background='var(--panel2)';
    const num=document.createElement('span'); num.className='lbl'; num.style.minWidth='18px'; num.textContent=String(i+1);
    const psel=document.createElement('select');
    for(let pp=0;pp<NPAT;pp++){ const o=document.createElement('option'); o.value=pp; o.textContent='PTN '+(pp+1); psel.appendChild(o); }
    psel.value=String(sec.pat); psel.addEventListener('change',e=>{ sec.pat=parseInt(e.target.value,10); dirty(); });
    const S_='section '+(i+1);
    psel.setAttribute('aria-label','Pattern for '+S_);
    row.setAttribute('role','group');
    row.setAttribute('aria-label','Song '+S_+': pattern '+(sec.pat+1)+', '+(sec.reps||1)+' bars');
    const dn=document.createElement('button'); dn.textContent='−';
    dn.setAttribute('aria-label','Fewer repeats, '+S_);
    dn.addEventListener('click',()=>{ sec.reps=Math.max(1,(sec.reps||1)-1); drawSong(); dirty(); });
    const rv=document.createElement('span'); rv.style.cssText='min-width:36px;text-align:center;font-size:11px;color:var(--lcd)'; rv.textContent=(sec.reps||1)+'×';
    const up=document.createElement('button'); up.textContent='+';
    up.setAttribute('aria-label','More repeats, '+S_);
    up.addEventListener('click',()=>{ sec.reps=Math.min(64,(sec.reps||1)+1); drawSong(); dirty(); });
    const mv=document.createElement('button'); mv.innerHTML='&#9650;';
    mv.setAttribute('aria-label','Move '+S_+' earlier');
    mv.addEventListener('click',()=>{ if(i>0){ const t=S.song[i-1]; S.song[i-1]=S.song[i]; S.song[i]=t; drawSong(); dirty(); } });
    const rm=document.createElement('button'); rm.innerHTML='&#215;';
    rm.setAttribute('aria-label','Delete '+S_);
    rm.addEventListener('click',()=>{ S.song.splice(i,1); if(songPos>=S.song.length) songPos=0; drawSong(); dirty(); });
    row.append(num,psel,dn,rv,up,mv,rm);
    el.appendChild(row);
  });
  a11yPass(el);
}
$('btnSongAdd').addEventListener('click',()=>{ S.song.push({pat:S.pattern,reps:4}); drawSong(); dirty(); lcd('SECTION ADDED · PTN '+(S.pattern+1)+' ×4'); });
$('btnSongClr').addEventListener('click',()=>{ S.song=[]; S.songOn=false; songPos=0; songRep=0; drawSong(); dirty(); lcd('SONG CLEARED'); });
$('btnSongLoop').addEventListener('click',()=>{ S.songLoop=!S.songLoop; drawSong(); dirty(); lcd(S.songLoop?'SONG LOOPS':'SONG PLAYS ONCE then stops'); });
$('btnSongOn').addEventListener('click',()=>{
  if(!S.song.length){ lcd('ADD SECTIONS FIRST (+SEC)'); return; }
  S.songOn=!S.songOn; if(S.songOn){ S.chainOn=false; if(morphActive()) morphStop('MORPH OFF — SONG takes over.'); }
  drawSong(); drawSeq(); dirty();
  lcd(S.songOn?'SONG MODE ON — PLAY runs the arrangement':'SONG MODE OFF');
});

/* ---------------- AMP — live guitar/line input processor ----------------
   Guitar audio enters as a media input (interface/adapter/mic), not MIDI.
   Chain: in → gate → drive(model) → cab → 3-band EQ → chorus → out → master
   (+ delay/reverb sends into the shared MIX engine). Processed signal feeds
   LIVE.master so TRAX/REC OUT can capture it. Includes an autocorrelation
   tuner. */
let ampOn=false, ampStream=null, ampNodes=null, ampRAF=0, ampBuf=null, ampTick=0;
function makeFuzzCurve(){ const n=1024,c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.max(-0.72,Math.min(0.72,x*6))/0.72; } return c; }
function ampBuild(){
  const A={};
  A.src=AC.createMediaStreamSource(ampStream);
  A.in=AC.createGain();
  A.an=AC.createAnalyser(); A.an.fftSize=2048;
  A.gate=AC.createGain(); A.gate.gain.value=1;
  A.pre=AC.createGain();
  A.drive=AC.createWaveShaper(); A.drive.oversample='2x';
  A.hp=AC.createBiquadFilter(); A.hp.type='highpass'; A.hp.frequency.value=85;      // cab low cut
  A.lp=AC.createBiquadFilter(); A.lp.type='lowpass'; A.lp.frequency.value=5200;      // cab high cut
  A.pres=AC.createBiquadFilter(); A.pres.type='peaking'; A.pres.frequency.value=2200; A.pres.Q.value=1; A.pres.gain.value=3;
  A.bass=AC.createBiquadFilter(); A.bass.type='lowshelf'; A.bass.frequency.value=120;
  A.mid=AC.createBiquadFilter(); A.mid.type='peaking'; A.mid.frequency.value=800; A.mid.Q.value=0.9;
  A.treb=AC.createBiquadFilter(); A.treb.type='highshelf'; A.treb.frequency.value=3200;
  A.chDelay=AC.createDelay(0.05); A.chDelay.delayTime.value=0.025;
  A.chLfo=AC.createOscillator(); A.chLfo.frequency.value=1.2;
  A.chDepth=AC.createGain(); A.chDepth.gain.value=0;
  A.chWet=AC.createGain(); A.chWet.gain.value=0;
  A.out=AC.createGain();
  A.dsend=AC.createGain(); A.dsend.gain.value=0;
  A.rsend=AC.createGain(); A.rsend.gain.value=0;
  A.chLfo.connect(A.chDepth); A.chDepth.connect(A.chDelay.delayTime); A.chLfo.start();
  A.src.connect(A.in);
  A.in.connect(A.an);                                  // tap clean input for gate + tuner
  A.in.connect(A.gate);
  A.gate.connect(A.pre); A.pre.connect(A.drive); A.drive.connect(A.hp); A.hp.connect(A.lp); A.lp.connect(A.pres);
  A.pres.connect(A.bass); A.bass.connect(A.mid); A.mid.connect(A.treb);
  A.treb.connect(A.out);                               // dry
  A.treb.connect(A.chDelay); A.chDelay.connect(A.chWet); A.chWet.connect(A.out);   // chorus wet
  A.out.connect(LIVE.master);
  if(LIVE.liveBus) A.out.connect(LIVE.liveBus);   // guitar is live performance
  A.out.connect(A.dsend); A.dsend.connect(LIVE.dlyIn);
  A.out.connect(A.rsend); A.rsend.connect(LIVE.revIn);
  return A;
}
function ampApplyModel(){
  const A=ampNodes; if(!A) return;
  const m=$('ampModel').value, g=parseFloat($('ampGain').value); let curve,pre;
  if(m==='clean'){ curve=makeDriveCurve(0.03+g*0.15); pre=1+g*1.5; }
  else if(m==='crunch'){ curve=makeDriveCurve(0.2+g*0.5); pre=1.5+g*4; }
  else if(m==='lead'){ curve=makeDriveCurve(0.4+g*0.6); pre=2+g*7; }
  else { curve=makeFuzzCurve(); pre=3+g*12; }
  A.drive.curve=curve||makeDriveCurve(0.02);
  A.pre.gain.setTargetAtTime(pre,AC.currentTime,0.02);
}
function ampApplyTone(){
  const A=ampNodes; if(!A) return; const t=AC.currentTime;
  A.bass.gain.setTargetAtTime(parseFloat($('ampBass').value),t,0.02);
  A.mid.gain.setTargetAtTime(parseFloat($('ampMid').value),t,0.02);
  A.treb.gain.setTargetAtTime(parseFloat($('ampTreb').value),t,0.02);
  const cab=$('ampCab').classList.contains('on');
  A.lp.frequency.setTargetAtTime(cab?5200:18000,t,0.02);
  A.pres.gain.setTargetAtTime(cab?3:0,t,0.02);
  A.out.gain.setTargetAtTime(parseFloat($('ampLevel').value),t,0.02);
}
function ampApplyFx(){
  const A=ampNodes; if(!A) return; const t=AC.currentTime;
  const ch=$('ampChorus').classList.contains('on');
  A.chDepth.gain.setTargetAtTime(ch?parseFloat($('ampChDepth').value):0,t,0.05);
  A.chWet.gain.setTargetAtTime(ch?0.5:0,t,0.05);
  A.dsend.gain.setTargetAtTime(parseFloat($('ampDly').value),t,0.02);
  A.rsend.gain.setTargetAtTime(parseFloat($('ampRev').value),t,0.02);
}
function ampAutoCorr(buf,sr){
  let SIZE=buf.length,rms=0;
  for(let i=0;i<SIZE;i++) rms+=buf[i]*buf[i];
  rms=Math.sqrt(rms/SIZE); if(rms<0.008) return -1;
  let r1=0,r2=SIZE-1; const thr=0.2;
  for(let i=0;i<SIZE/2;i++){ if(Math.abs(buf[i])<thr){ r1=i; break; } }
  for(let i=1;i<SIZE/2;i++){ if(Math.abs(buf[SIZE-i])<thr){ r2=SIZE-i; break; } }
  const b=buf.subarray(r1,r2), nn=b.length; if(nn<8) return -1;
  const c=new Float32Array(nn);
  for(let i=0;i<nn;i++){ let s=0; for(let j=0;j<nn-i;j++) s+=b[j]*b[j+i]; c[i]=s; }
  let d=0; while(d<nn-1 && c[d]>c[d+1]) d++;
  let maxv=-1,maxp=-1;
  for(let i=d;i<nn;i++){ if(c[i]>maxv){ maxv=c[i]; maxp=i; } }
  let T0=maxp; if(T0<=0) return -1;
  const x1=c[T0-1]||0,x2=c[T0],x3=c[T0+1]||0, a=(x1+x3-2*x2)/2, bb=(x3-x1)/2;
  if(a) T0=T0-bb/(2*a);
  return sr/T0;
}
function ampShowTuner(f){
  if(!(f>50&&f<1200)){ $('ampTuner').textContent='—'; $('ampTunerCents').textContent=''; return; }
  const nn=12*Math.log2(f/440)+69, rd=Math.round(nn);
  const name=NOTE_NAMES[((rd%12)+12)%12]+(Math.floor(rd/12)-1);
  const cents=Math.round((nn-rd)*100);
  $('ampTuner').textContent=name;
  $('ampTunerCents').textContent=(cents>0?'+':'')+cents+'¢ '+(Math.abs(cents)<5?'✓ IN TUNE':(cents>0?'♯ sharp':'♭ flat'));
}
function ampLoop(){
  if(!ampOn||!ampNodes) return;
  ampNodes.an.getFloatTimeDomainData(ampBuf);
  let sum=0; for(let i=0;i<ampBuf.length;i++) sum+=ampBuf[i]*ampBuf[i];
  const rms=Math.sqrt(sum/ampBuf.length);
  const gv=parseFloat($('ampGate').value);
  const open = gv<=0 || rms>Math.pow(10,(-62+gv*42)/20);
  ampNodes.gate.gain.setTargetAtTime(open?1:0.0001,AC.currentTime,open?0.004:0.03);
  if((++ampTick%6)===0) ampShowTuner(ampAutoCorr(ampBuf,AC.sampleRate));
  ampRAF=requestAnimationFrame(ampLoop);
}
async function ampListDevices(){
  try{
    const devs=await navigator.mediaDevices.enumerateDevices();
    const sel=$('ampIn'), cur=sel.value; sel.innerHTML='';
    const d0=document.createElement('option'); d0.value='default'; d0.textContent='Default input'; sel.appendChild(d0);
    devs.filter(d=>d.kind==='audioinput').forEach((d,i)=>{ const o=document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||('Input '+(i+1)); sel.appendChild(o); });
    if(cur){ try{ sel.value=cur; }catch(e){} }
  }catch(e){}
}
async function ampEnable(){
  ensureAudio();
  if(ampOn){ ampDisable(); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ lcd('INPUT: getUserMedia unavailable on this browser.'); return; }
  micBusy=true;
  try{ if(navigator.audioSession) navigator.audioSession.type='play-and-record'; }catch(e){}
  const dev=$('ampIn').value;
  const con={audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
  if(dev&&dev!=='default') con.audio.deviceId={exact:dev};
  try{ ampStream=await navigator.mediaDevices.getUserMedia(con); }
  catch(err){ micBusy=false; lcd('INPUT DENIED/UNAVAILABLE ('+((err&&err.name)||'error')+').'); return; }
  try{ ampNodes=ampBuild(); }
  catch(e){ micBusy=false; try{ampStream.getTracks().forEach(t=>t.stop());}catch(e2){} ampStream=null; lcd('AMP BUILD FAILED: '+(e.message||'graph error')); return; }
  ampBuf=new Float32Array(ampNodes.an.fftSize);
  ampApplyModel(); ampApplyTone(); ampApplyFx();
  ampOn=true; $('btnAmpOn').classList.add('on'); $('btnAmpOn').innerHTML='&#9673; INPUT LIVE — tap to stop';
  ampRAF=requestAnimationFrame(ampLoop);
  lcd('GUITAR INPUT LIVE · use headphones · feeds the master (record via TRAX/REC OUT).');
  ampListDevices();
}
function ampDisable(){
  ampOn=false; cancelAnimationFrame(ampRAF);
  if(ampNodes){ try{ ampNodes.src.disconnect(); ampNodes.out.disconnect(); ampNodes.chLfo.stop(); ampNodes.chLfo.disconnect(); }catch(e){} }
  if(ampStream){ try{ ampStream.getTracks().forEach(t=>t.stop()); }catch(e){} ampStream=null; }
  ampNodes=null; micBusy=false; resumeSession();
  $('btnAmpOn').classList.remove('on'); $('btnAmpOn').innerHTML='&#9673; ENABLE INPUT (guitar / line / mic)';
  $('ampTuner').textContent='—'; $('ampTunerCents').textContent='';
}
const AMP_PRESETS={
  clean:{model:'clean',gain:0.25,bass:2,mid:0,treb:3,cab:1,chorus:0,dly:0.12,rev:0.25},
  blues:{model:'crunch',gain:0.45,bass:1,mid:3,treb:2,cab:1,chorus:0,dly:0.1,rev:0.18},
  rock:{model:'lead',gain:0.7,bass:2,mid:4,treb:3,cab:1,chorus:0,dly:0.2,rev:0.2},
  fuzz:{model:'fuzz',gain:0.6,bass:3,mid:-2,treb:1,cab:1,chorus:0,dly:0.05,rev:0.15},
  ambient:{model:'clean',gain:0.2,bass:0,mid:-1,treb:4,cab:1,chorus:1,dly:0.45,rev:0.6}
};
function ampApplyPreset(id){
  const p=AMP_PRESETS[id]; if(!p) return;
  $('ampModel').value=p.model;
  $('ampGain').value=p.gain; $('ampGainV').textContent=Math.round(p.gain*100)+'%';
  $('ampBass').value=p.bass; $('ampBassV').textContent=(p.bass>0?'+':'')+p.bass;
  $('ampMid').value=p.mid; $('ampMidV').textContent=(p.mid>0?'+':'')+p.mid;
  $('ampTreb').value=p.treb; $('ampTrebV').textContent=(p.treb>0?'+':'')+p.treb;
  $('ampCab').classList.toggle('on',!!p.cab);
  $('ampChorus').classList.toggle('on',!!p.chorus);
  $('ampDly').value=p.dly; $('ampDlyV').textContent=Math.round(p.dly*100)+'%';
  $('ampRev').value=p.rev; $('ampRevV').textContent=Math.round(p.rev*100)+'%';
  ampApplyModel(); ampApplyTone(); ampApplyFx();
  lcd('AMP PRESET: '+id.toUpperCase());
}
$('btnAmpOn').addEventListener('click',ampEnable);
$('ampIn').addEventListener('change',()=>{ if(ampOn){ ampDisable(); ampEnable(); } });
$('ampModel').addEventListener('change',ampApplyModel);
$('ampPreset').addEventListener('change',e=>{ if(e.target.value) ampApplyPreset(e.target.value); });
$('ampGain').addEventListener('input',e=>{ $('ampGainV').textContent=Math.round(parseFloat(e.target.value)*100)+'%'; ampApplyModel(); });
$('ampLevel').addEventListener('input',e=>{ $('ampLevelV').textContent=Math.round(parseFloat(e.target.value)*100)+'%'; ampApplyTone(); });
$('ampGate').addEventListener('input',e=>{ const v=parseFloat(e.target.value); $('ampGateV').textContent=v<=0?'off':Math.round(v*100)+'%'; });
$('ampBass').addEventListener('input',e=>{ $('ampBassV').textContent=(e.target.value>0?'+':'')+e.target.value; ampApplyTone(); });
$('ampMid').addEventListener('input',e=>{ $('ampMidV').textContent=(e.target.value>0?'+':'')+e.target.value; ampApplyTone(); });
$('ampTreb').addEventListener('input',e=>{ $('ampTrebV').textContent=(e.target.value>0?'+':'')+e.target.value; ampApplyTone(); });
$('ampCab').addEventListener('click',()=>{ $('ampCab').classList.toggle('on'); ampApplyTone(); });
$('ampChorus').addEventListener('click',()=>{ $('ampChorus').classList.toggle('on'); ampApplyFx(); });
$('ampChDepth').addEventListener('input',ampApplyFx);
$('ampDly').addEventListener('input',e=>{ $('ampDlyV').textContent=Math.round(parseFloat(e.target.value)*100)+'%'; ampApplyFx(); });
$('ampRev').addEventListener('input',e=>{ $('ampRevV').textContent=Math.round(parseFloat(e.target.value)*100)+'%'; ampApplyFx(); });

/* ---------------- MIDI ----------------
   Goal: turn an old phone into a MIDI sound module. Web MIDI (USB-OTG) works
   on Android Chrome & desktop; iOS Safari lacks it, so we also offer a
   Bluetooth-MIDI path (Web Bluetooth) and give honest, actionable guidance
   instead of a dead end. Hot-plug is handled via statechange, and by default
   we listen to ALL inputs so plugging a controller in "just works". */
let midiAccess=null, noteLearnPad=null, ccLearnArm=false;
let clkLast=0, clkAvg=0, clkTicks=0;
let bleMidiDevs=[];   // {name, char, dev}
const bleInputs=new Map();   // synthetic input id -> {name}

for(let c=1;c<=16;c++){ const o=document.createElement('option'); o.value=c-1; o.textContent='CH '+c; $('midiCh').appendChild(o); }
(function(){ const r=$('midiRoot'); for(let m=36;m<=84;m++){ const o=document.createElement('option'); o.value=m; o.textContent=midiName(m); r.appendChild(o); } r.value='60'; })();
$('midiCh').addEventListener('change',e=>{ S.midiCh=parseInt(e.target.value,10); });
$('vcurve').addEventListener('change',e=>{ S.vcurve=e.target.value; });
$('midiRoot').addEventListener('change',e=>{ S.midiRoot=parseInt(e.target.value,10); });
$('btnChrom').addEventListener('click',()=>{ S.midiChrom=!S.midiChrom; $('btnChrom').classList.toggle('on',S.midiChrom);
  lcd(S.midiChrom?'CHROMATIC: keyboard plays the SELECTED pad, ROOT = its natural pitch':'CHROMATIC OFF — notes trigger mapped pads'); });
$('btnExtClk').addEventListener('click',()=>{ S.extClk=!S.extClk; $('btnExtClk').classList.toggle('on',S.extClk); lcd(S.extClk?'EXT CLOCK: sequencer follows MIDI clock':'INTERNAL CLOCK'); });
$('btnPcPat').addEventListener('click',()=>{ S.pcPat=!S.pcPat; $('btnPcPat').classList.toggle('on',S.pcPat); });
$('btnMapGM').addEventListener('click',()=>{
  for(let i=0;i<NPADS;i++) S.pads[i].note=36+i;
  drawEdit(); lcd('GM MAP: notes 36–99 → pads A01–D16');
});
$('btnMapClear').addEventListener('click',()=>{
  for(let i=0;i<NPADS;i++) S.pads[i].note=-1;
  drawEdit(); lcd('NOTE MAP CLEARED — use LEARN per pad');
});

const isIOS=/iP(hone|ad|od)/.test(navigator.platform)||(/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1);
function midiStat(txt, live){
  $('midiStat').textContent=txt;
  $('midiDot').style.background = live ? 'var(--lcd)' : '#444';
}
let _actT=0;
function midiActivity(){ const d=$('midiDot'); d.style.background='var(--amber)'; clearTimeout(_actT); _actT=setTimeout(()=>{ d.style.background='var(--lcd)'; },90); }

$('btnMidiOn').addEventListener('click',async ()=>{
  if(!window.isSecureContext){
    midiStat('MIDI needs a secure page (HTTPS). Open the app over https:// or localhost.',false);
    mlog('Blocked: not a secure context.'); return;
  }
  if(!navigator.requestMIDIAccess){
    if(isIOS){
      midiStat('iOS Safari has no Web MIDI. Use the + BLUETOOTH button, or open in a Web-MIDI browser (e.g. “Web MIDI Browser”). USB-MIDI works on Android Chrome.',false);
      mlog('Web MIDI absent (iOS). Try Bluetooth or an Android phone.');
    }else{
      midiStat('This browser has no Web MIDI. Try Chrome/Edge, or the + BLUETOOTH button.',false);
      mlog('Web MIDI API not present.');
    }
    return;
  }
  try{
    midiAccess=await navigator.requestMIDIAccess({sysex:false});
    midiAccess.onstatechange=refreshMidiInputs;
    $('midiIn').addEventListener('change',e=>{ S.midiIn=e.target.value; rebindInputs(); });
    $('btnMidiOn').classList.add('on');
    refreshMidiInputs();
    lcd('MIDI ONLINE');
  }catch(e){ midiStat('MIDI access denied. Reload and allow MIDI when prompted.',false); mlog('requestMIDIAccess rejected: '+(e&&e.name)); }
});
function usbInputs(){ const a=[]; if(midiAccess) midiAccess.inputs.forEach(inp=>a.push(inp)); return a; }
function usbOutputs(){ const a=[]; if(midiAccess) midiAccess.outputs.forEach(o=>a.push(o)); return a; }
function refreshMidiInputs(){
  const sel=$('midiIn'), prev=S.midiIn||'*'; sel.innerHTML='';
  const add=(v,t)=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; sel.appendChild(o); };
  add('*','ALL INPUTS');
  const us=usbInputs(); us.forEach(inp=>add(inp.id, inp.name||('USB '+inp.id)));
  bleInputs.forEach((v,id)=>add(id,'BLE · '+v.name));
  const values=[...sel.options].map(o=>o.value);
  sel.value = values.includes(prev)? prev : '*';
  S.midiIn=sel.value;
  rebindInputs();
  refreshMidiOutputs();
  const total=us.length+bleInputs.size;
  midiStat(total? ('MIDI ON · '+total+' device'+(total>1?'s':'')+': '+us.map(i=>i.name).concat([...bleInputs.values()].map(v=>v.name)).join(', ')) : 'MIDI ON · plug a controller in (USB-OTG or + BLUETOOTH)', true);
}
function rebindInputs(){   // wire onmidimessage on exactly the chosen source(s)
  usbInputs().forEach(inp=>{ inp.onmidimessage = (S.midiIn==='*'||S.midiIn===inp.id)? onMidi : null; });
  // BLE inputs are dispatched from their notification handler, filtered there
}

/* ---- MIDI OUT: notes + 24 PPQN clock to hardware ---- */
let midiOutDev=null, midiOutId='';
function refreshMidiOutputs(){
  const sel=$('midiOutSel'); if(!sel) return;
  sel.innerHTML='<option value="">— OFF —</option>';
  usbOutputs().forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.name||('OUT '+o.id); sel.appendChild(op); });
  const values=[...sel.options].map(o=>o.value);
  sel.value = values.includes(midiOutId)? midiOutId : '';
  bindMidiOutput(sel.value);
}
function bindMidiOutput(id){
  midiOutId=id||'';
  midiOutDev=null;
  if(id) usbOutputs().forEach(o=>{ if(o.id===id) midiOutDev=o; });
}
$('midiOutSel').addEventListener('change',e=>{ bindMidiOutput(e.target.value);
  lcd(midiOutDev? 'MIDI OUT → '+(midiOutDev.name||'device') : 'MIDI OUT OFF'); });
function midiNow(when){ // AudioContext seconds → Web MIDI (performance.now) milliseconds
  return performance.now() + Math.max(0,(when-AC.currentTime))*1000;
}
function moSend(bytes,when){ if(!midiOutDev) return;
  try{ midiOutDev.send(bytes, (when!=null&&AC)? midiNow(when) : undefined); }catch(e){} }
function moAllOff(when){ if(!midiOutDev) return; const ch=S.midiOutCh&15;
  moSend([0xB0|ch,123,0],when); moSend([0xB0|ch,120,0],when); }   // hardware can never hang on a stuck note
function moNote(note,vel,when,durS){ // schedules ON at `when` (ctx-time) and its OFF after durS
  if(!S.notesOut||!midiOutDev) return;
  const ch=S.midiOutCh&15, n=clamp(Math.round(note),0,127);
  moSend([0x90|ch,n,clamp(Math.round(vel*127),1,127)],when);
  const t=(when!=null&&AC)?when:(AC?AC.currentTime:null);
  moSend([0x80|ch,n,0], t!=null? t+Math.max(0.02,durS||0.12) : null);
}
$('btnNotesOut').addEventListener('click',()=>{ S.notesOut=!S.notesOut; $('btnNotesOut').classList.toggle('on',S.notesOut);
  lcd(S.notesOut?(midiOutDev?'NOTES OUT → '+(midiOutDev.name||'device'):'NOTES OUT armed — pick an OUTPUT device'):'NOTES OUT OFF'); dirty(); });
$('btnClkOut').addEventListener('click',()=>{ S.clkOut=!S.clkOut; $('btnClkOut').classList.toggle('on',S.clkOut);
  lcd(S.clkOut?'CLOCK OUT: 24 PPQN + START/STOP':'CLOCK OUT OFF'); dirty(); });
(function(){ const s=$('midiOutCh'); for(let c=1;c<=16;c++){ const o=document.createElement('option'); o.value=c-1; o.textContent='CH '+c; s.appendChild(o); } })();
$('midiOutCh').addEventListener('change',e=>{ S.midiOutCh=parseInt(e.target.value,10); dirty(); });

/* ---- Bluetooth MIDI (Web Bluetooth; Android/desktop Chrome) ---- */
const BLE_MIDI_SVC='03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const BLE_MIDI_CHR='7772e5db-3868-4112-a1a9-f2669d106bf3';
$('btnMidiBle').addEventListener('click',async ()=>{
  if(!navigator.bluetooth){
    midiStat(isIOS? 'iOS Safari has no Web Bluetooth either. A dedicated Web-MIDI browser app is the only in-browser route on iOS.' : 'This browser has no Web Bluetooth. Use Chrome/Edge on Android or desktop.',false);
    mlog('navigator.bluetooth absent.'); return;
  }
  try{
    lcd('BLUETOOTH: pick your MIDI controller…');
    const dev=await navigator.bluetooth.requestDevice({ filters:[{services:[BLE_MIDI_SVC]}], optionalServices:[BLE_MIDI_SVC] });
    const server=await dev.gatt.connect();
    const svc=await server.getPrimaryService(BLE_MIDI_SVC);
    const chr=await svc.getCharacteristic(BLE_MIDI_CHR);
    await chr.startNotifications();
    const id='ble:'+dev.id;
    chr.addEventListener('characteristicvaluechanged',ev=>parseBleMidi(ev.target.value));
    dev.addEventListener('gattserverdisconnected',()=>{ bleInputs.delete(id); refreshMidiInputs(); mlog('BLE disconnected: '+dev.name); });
    bleInputs.set(id,{name:dev.name||'BLE MIDI'});
    bleMidiDevs.push({name:dev.name,dev,char:chr});
    $('btnMidiOn').classList.add('on'); $('btnMidiBle').classList.add('on');
    refreshMidiInputs();
    mlog('BLE connected: '+(dev.name||dev.id));
  }catch(e){ if(e && e.name==='NotFoundError') lcd('BLUETOOTH: no device chosen.'); else { midiStat('Bluetooth pairing failed: '+(e&&e.message||e),false); mlog('BLE error: '+(e&&e.message)); } }
});
/* BLE-MIDI packet → note/CC/realtime events. Format: header byte, then
   [timestamp-low, status?, data…] runs; we ignore precise timing and just
   extract MIDI status+data bytes, honoring running status. */
function parseBleMidi(dataView){
  if(S.midiIn!=='*' && String(S.midiIn).indexOf('ble:')!==0) return;   // a specific USB input is selected
  const b=[]; for(let i=0;i<dataView.byteLength;i++) b.push(dataView.getUint8(i));
  if(b.length<3) return;
  let i=1, running=0;   // skip header
  while(i<b.length){
    if(b[i]&0x80){ i++; if(i>=b.length) break; }   // timestamp byte, skip
    let status;
    if(b[i]&0x80){ status=b[i]; running=status; i++; } else status=running;
    if(!status) break;
    if(status>=0xF8){ dispatchMidi([status]); continue; }   // realtime, no data
    const need=((status&0xF0)===0xC0||(status&0xF0)===0xD0)?1:2;
    const d=[status];
    for(let k=0;k<need && i<b.length;k++){ if(b[i]&0x80) break; d.push(b[i]); i++; }
    if(d.length===need+1) dispatchMidi(d);
  }
}
function dispatchMidi(bytes){ onMidi({data:bytes}); }
function velCurve(v){
  const x=v/127;
  if(S.vcurve==='soft') return Math.sqrt(x);
  if(S.vcurve==='hard') return x*x;
  if(S.vcurve==='fixed') return 1;
  return x;
}
function onMidi(ev){
  const d=ev.data, st=d[0]&0xF0, ch=d[0]&0x0F;
  // realtime first — never channel-filtered
  if(d[0]===0xF8){ onClockTick(); return; }
  if(d[0]===0xFA){ if(S.extClk){ startSeq(); curStepSched=0; absStepSched=0; } return; }
  if(d[0]===0xFC){ if(S.extClk) stopSeq(); return; }
  if(d[0]===0xFB){ if(S.extClk && !playing) startSeq(); return; }
  if(S.midiCh>=0 && ch!==S.midiCh) return;
  if((st===0x90 && d[2]>0)||st===0xB0||st===0xC0) midiActivity();
  if(st===0x90 && d[2]>0){
    mlog('NOTE ON  ch'+(ch+1)+' n'+d[1]+' v'+d[2]);
    if(noteLearnPad!==null){ S.pads[noteLearnPad].note=d[1]; lcd('NOTE '+d[1]+' → '+padName(noteLearnPad)); noteLearnPad=null; drawEdit(); return; }
    if(S.midiChrom){   // instrument mode: whole keyboard plays the selected pad, transposed
      if(S.pads[S.editPad].bufId>=0) hitLive(S.editPad, velCurve(d[2]), snapToScale(d[1]-S.midiRoot));
      return;
    }
    const idx=S.pads.findIndex(p=>p.note===d[1] && p.note>=0);
    if(idx>=0) hitLive(idx, velCurve(d[2]));
  }else if(st===0xB0){
    mlog('CC ch'+(ch+1)+' #'+d[1]+' = '+d[2]);
    if(ccLearnArm){ S.ccMaps[d[1]]=$('ccTarget').value; ccLearnArm=false; $('btnCcLearn').classList.remove('on'); drawCcMaps(); lcd('CC '+d[1]+' → '+$('ccTarget').selectedOptions[0].textContent); return; }
    applyCc(d[1],d[2]);
  }else if(st===0xC0){
    mlog('PGM ch'+(ch+1)+' → '+d[1]);
    if(S.pcPat && d[1]<NPAT){ selectPattern(d[1]); drawSeq(); lcd('PC → PTN '+(d[1]+1)); }
  }
}
function onClockTick(){
  const now=performance.now();
  if(clkLast){
    const dt=now-clkLast;
    clkAvg = clkAvg? clkAvg*0.9+dt*0.1 : dt;
    const bpm=60000/(clkAvg*24);
    if(bpm>30 && bpm<300) setBpm(Math.round(bpm*10)/10);
  }
  clkLast=now;
  if(S.extClk && playing){
    clkTicks=(clkTicks+1)%6;         // 6 ticks per 16th at 24 PPQN
    if(clkTicks===0){
      ensureAudio();
      schedStep(curStepSched, absStepSched, AC.currentTime+0.005);
      const dir=S.bpm<0?-1:1;
      const PL=curPatLen();
      curStepSched=posMod(curStepSched+dir,PL); absStepSched+=dir;
      const barDone = dir>0 ? curStepSched===0 : curStepSched===PL-1;
      if(barDone){
        if(morphActive()){ morphBar(); }
        else if(S.chainOn && S.chain.length){ S.chainPos=(S.chainPos+1)%S.chain.length; selectPattern(S.chain[S.chainPos]); drawSeq(); }
        else if(S.songOn && S.song.length){ songAdvance(); }
      }
    }
  }
}
function applyCc(cc,val){
  const t=S.ccMaps[cc]; if(!t) return;
  const x=val/127;
  if(t==='m:vol'){ S.masterVol=x*2; if(LIVE) LIVE.master.gain.setTargetAtTime(S.masterVol,AC.currentTime,0.02); }
  else if(t==='m:bpm'){ setBpm(40+x*200); }
  else if(t==='m:swing'){ S.swing=x*0.6; $('swing').value=S.swing; $('swingV').textContent=Math.round(S.swing*100)+'%'; }
  else if(t==='m:dfb'){ S.delayFb=x*0.85; if(LIVE){ LIVE.dlyFb.gain.setTargetAtTime(S.delayFb,AC.currentTime,0.02); if(LIVE.dlyFb2) LIVE.dlyFb2.gain.setTargetAtTime(S.delayFb,AC.currentTime,0.02); } }
  else{
    const p=S.pads[S.editPad], n=LIVE?LIVE.pads[S.editPad]:null;
    if(t==='p:gain'){ p.gain=x*2; logGain(S.editPad,p.gain,'MIDI CC#'+cc); if(n) n.ch.gain.setTargetAtTime(p.gain,AC.currentTime,0.02); }
    else if(t==='p:pitch'){ p.pitch=Math.round(x*24-12); }
    else if(t==='p:pan'){ p.pan=x*2-1; if(n&&n.pan) n.pan.pan.setTargetAtTime(p.pan,AC.currentTime,0.02); }
    else if(t==='p:rev'){ p.rev=x; if(n) n.rev.gain.setTargetAtTime(x,AC.currentTime,0.02); }
    else if(t==='p:dly'){ p.dly=x; if(n) n.dly.gain.setTargetAtTime(x,AC.currentTime,0.02); }
    else if(t==='p:cut'){ p.fcut=x; if(n) n.flt.frequency.setTargetAtTime(cutHz(x),AC.currentTime,0.02); }
    if($('v-pads').classList.contains('on')) drawEdit();
  }
}
$('btnCcLearn').addEventListener('click',()=>{ ccLearnArm=!ccLearnArm; $('btnCcLearn').classList.toggle('on',ccLearnArm); if(ccLearnArm) lcd('CC LEARN: move a controller…'); });
function drawCcMaps(){
  const el=$('ccMaps'); el.innerHTML='';
  Object.keys(S.ccMaps).forEach(cc=>{
    const d=document.createElement('div'); d.className='maprow';
    d.innerHTML='<span>CC '+cc+' → '+S.ccMaps[cc]+'</span>';
    const b=document.createElement('button'); b.textContent='×';
    b.addEventListener('click',()=>{ delete S.ccMaps[cc]; drawCcMaps(); });
    d.appendChild(b); el.appendChild(d);
  });
}
const mlines=[];
function mlog(s){ mlines.push(s); if(mlines.length>10) mlines.shift(); $('mididlog').textContent=mlines.join('\n'); }

/* ---------------- project: JSON save/load ---------------- */
function f32ToB64(f32){
  const i16=new Int16Array(f32.length);
  for(let i=0;i<f32.length;i++) i16[i]=Math.max(-32768,Math.min(32767,Math.round(f32[i]*32767)));
  const u8=new Uint8Array(i16.buffer);
  let s=''; const CH=0x8000;
  for(let i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH));
  return btoa(s);
}
function b64ToF32(b64){
  const bin=atob(b64), u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  const i16=new Int16Array(u8.buffer), f32=new Float32Array(i16.length);
  for(let i=0;i<i16.length;i++) f32[i]=i16[i]/32767;
  return f32;
}
function download(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000);
}
$('btnSave').addEventListener('click',()=>{
  gcBuffers();
  const bufs=S.buffers.map(b=>{
    const chans=[];
    for(let c=0;c<b.numberOfChannels;c++) chans.push(f32ToB64(b.getChannelData(c)));
    return {sr:b.sampleRate,len:b.length,ch:chans};
  });
  const doc={ fmt:'mvx880-project', build:BUILD, name:$('projName').value,
    bpm:S.bpm, swing:S.swing, human:S.human, autoWarp:S.autoWarp, silFade:S.silFade, masterVol:S.masterVol, delayFb:S.delayFb,
    revLvl:S.revLvl, revSize:S.revSize, revType:S.revType, delayDiv:S.delayDiv, dlyTone:S.dlyTone, dlyMode:S.dlyMode, compAmt:S.compAmt,
    vcurve:S.vcurve, midiCh:S.midiCh, pcPat:S.pcPat, ccMaps:S.ccMaps, ptnBpm:S.ptnBpm,
    midiChrom:S.midiChrom, midiRoot:S.midiRoot, notesOut:S.notesOut, clkOut:S.clkOut, midiOutCh:S.midiOutCh,
    scaleLock:S.scaleLock, scaleRoot:S.scaleRoot, scaleName:S.scaleName,
    chain:S.chain, chainOn:S.chainOn, chainPos:S.chainPos,
    pattern:S.pattern, bank:S.bank, editPad:S.editPad, seqPad:S.seqPad,
    trax:S.trax, inst:S.inst, mic:micSettings(), amp:ampSettings(),
    mEqLo:S.mEqLo, mEqMid:S.mEqMid, mEqHi:S.mEqHi, mWidth:S.mWidth, mMono:S.mMono, mCeil:S.mCeil, mByp:S.mByp, mTrim:S.mTrim,
    scOn:S.scOn, scTrig:S.scTrig, scDepth:S.scDepth, scRel:S.scRel,
    song:S.song, songOn:S.songOn, songLoop:S.songLoop, morph:S.morph,
    pads:S.pads, patterns:S.patterns, buffers:bufs };
  const blob=new Blob([JSON.stringify(doc)],{type:'application/json'});
  download(blob, ($('projName').value||'mvx-session')+'.json');
  plog('Saved project JSON ('+Math.round(blob.size/1024)+' KB).');
});
$('btnLoad').addEventListener('click',()=>{ $('jsonIn').value=''; $('jsonIn').click(); });
function mkAudioBuf(len,sr,nch){
  try{ return new AudioBuffer({length:len,sampleRate:sr,numberOfChannels:nch}); }
  catch(e){ ensureAudio(); return AC.createBuffer(nch,len,sr); }
}
function hardSet(param,v){ // plain .value writes lose to earlier setTargetAtTime automation — cancel first
  const t=AC.currentTime;
  try{ param.cancelScheduledValues(t); }catch(e){}
  param.setValueAtTime(v,t);
}
function reapplyLivePads(){   // push S.pads channel state onto the live graph (restore + NEW)
  if(!AC||!LIVE||!LIVE.pads) return;
  for(let i=0;i<NPADS;i++){ const p=S.pads[i], n=LIVE.pads[i]; if(!n) continue;
    hardSet(n.ch.gain,p.gain); if(n.pan)hardSet(n.pan.pan,p.pan); hardSet(n.rev.gain,p.rev); hardSet(n.dly.gain,p.dly);
    applyPadFx(n,p,AC); applyPadLfo(n,p,AC); }
  applyMixMutes();
}
function applySessionDoc(doc, bufs){
  S.bpm=doc.bpm; S.swing=doc.swing; S.human=doc.human||0;
  // BPM must only drive the sequencer: AUTO-WARP (tempo re-stretches samples)
  // is retired as a default — always load OFF so a project saved under the old
  // default doesn't keep slowing loops/trax-on-pads when the tempo changes.
  S.autoWarp=false;
  S.silFade=doc.silFade!=null?doc.silFade:0.06; S.masterVol=doc.masterVol; S.delayFb=doc.delayFb;
  S.revLvl=(doc.revLvl!=null)?doc.revLvl:0.9;
  S.revSize=(doc.revSize!=null)?doc.revSize:3.0;
  S.delayDiv=(doc.delayDiv!=null)?doc.delayDiv:0.375;
  S.dlyTone=(doc.dlyTone!=null)?doc.dlyTone:5200;
  S.compAmt=(doc.compAmt!=null)?doc.compAmt:0.4;
  S.revType=doc.revType||'hall'; S.dlyMode=doc.dlyMode||'digital';
  S.vcurve=doc.vcurve; S.midiCh=doc.midiCh; S.pcPat=doc.pcPat; S.ccMaps=doc.ccMaps||{};
  S.midiChrom=!!doc.midiChrom; S.midiRoot=doc.midiRoot!=null?doc.midiRoot:60;
  S.notesOut=!!doc.notesOut; S.clkOut=!!doc.clkOut; S.midiOutCh=doc.midiOutCh!=null?doc.midiOutCh:0;
  S.scaleLock=!!doc.scaleLock; S.scaleRoot=doc.scaleRoot|0; S.scaleName=(doc.scaleName in SCALES)?doc.scaleName:'minor';
  try{ drawScaleLock(); }catch(e){}
  S.chain=doc.chain||[]; S.pads=doc.pads; S.patterns=doc.patterns;
  // playback position — without these a restore lands on PTN 1 / BANK A with chain off
  S.chainOn=!!doc.chainOn;
  S.chainPos=clamp(doc.chainPos|0,0,Math.max(0,S.chain.length-1));
  { const d=doc.morph||{}, m=S.morph;                 // a saved morph restores idle — you re-arm it
    m.from=clamp(d.from|0,0,NPAT-1); m.to=clamp(d.to|0,0,NPAT-1);
    m.bars=clamp(d.bars|0||8,1,64);
    m.curve=['weight','strong','sweep','scatter','track'].indexOf(d.curve)>=0?d.curve:'weight';
    m.mode=['once','loop','ping','hold'].indexOf(d.mode)>=0?d.mode:'once';
    m.vel=d.vel!==false; m.amt=clamp(+d.amt||0,0,1); m.pos=0; m.on=false; morphBuf=null; }
  S.pattern=clamp(doc.pattern|0,0,NPAT-1);
  S.bank=clamp(doc.bank|0,0,3);
  S.editPad=clamp(doc.editPad|0,0,NPADS-1);
  S.seqPad=clamp(doc.seqPad|0,0,NPADS-1);
  S.trax=(Array.isArray(doc.trax)&&doc.trax.length)?doc.trax:Array.from({length:NTRAX},()=>newTrack());
  while(S.trax.length<NTRAX) S.trax.push(newTrack());
  S.trax.forEach(tr=>{ if(tr.gain==null)tr.gain=0.9; if(tr.pan==null)tr.pan=0; tr.mute=!!tr.mute; if(tr.bufId==null)tr.bufId=-1;
    tr.loop=!!tr.loop; if(tr.ftype==null)tr.ftype='off'; if(tr.fcut==null)tr.fcut=1; if(tr.rev==null)tr.rev=0; if(tr.dly==null)tr.dly=0; });
  traxArm=-1; traxSolo=-1;
  S.inst=Object.assign({},INSTDEF,doc.inst||{});
  try{ applyMicSettings(doc.mic); applyAmpSettings(doc.amp); }catch(e){}
  { const num=(v,d,lo,hi)=>{ const n=parseFloat(v); return isFinite(n)?clamp(n,lo,hi):d; };
    S.mEqLo =num(doc.mEqLo, 0,-12,12); S.mEqMid=num(doc.mEqMid,0,-12,12); S.mEqHi=num(doc.mEqHi,0,-12,12);
    S.mWidth=num(doc.mWidth,1,0,2);    S.mMono =num(doc.mMono, 0,0,300);
    S.mCeil =num(doc.mCeil,-1,-12,0);  S.mByp  =!!doc.mByp;
    S.mTrim =num(doc.mTrim, 0,-24,12);
    try{ outWrite(); applyMaster(); }catch(e){} }
  S.scOn=!!doc.scOn; S.scTrig=clamp(doc.scTrig|0,0,NPADS-1);
  S.scDepth=(doc.scDepth!=null)?doc.scDepth:0.6; S.scRel=(doc.scRel!=null)?doc.scRel:0.25;
  S.song=Array.isArray(doc.song)?doc.song.map(x=>({pat:clamp(x.pat|0,0,NPAT-1),reps:clamp(x.reps|0,1,64)})):[];
  S.songOn=!!doc.songOn; S.songLoop=(doc.songLoop!=null)?!!doc.songLoop:true; songPos=0; songRep=0;
  if(LIVE && LIVE._inst){
    hardSet(LIVE._inst.g.gain,S.inst.vol); hardSet(LIVE._inst.rv.gain,S.inst.rev); hardSet(LIVE._inst.dl.gain,S.inst.dly);
  }
  S.ptnBpm=!!doc.ptnBpm; $('btnPtnBpm').classList.toggle('on',S.ptnBpm);
  S.patterns.forEach(pt=>{
    if(pt.bpm===undefined) pt.bpm=null;
    if(PATLENS.indexOf(pt.plen)<0) pt.plen=NSTEPS;                       // pre-R89 patterns are one bar
    if(!Array.isArray(pt.len)) pt.len=new Array(NPADS).fill(pt.plen);
    if(!pt.locks||typeof pt.locks!=='object') pt.locks={};
    if(!Array.isArray(pt.sil)) pt.sil=new Array(MAXSTEPS).fill(0);
    while(pt.sil.length<MAXSTEPS) pt.sil.push(0);                        // grow to capacity
    for(let p=0;p<NPADS;p++){
      if(!Array.isArray(pt.steps[p])) pt.steps[p]=new Array(MAXSTEPS).fill(0);
      while(pt.steps[p].length<MAXSTEPS) pt.steps[p].push(0);
      pt.len[p]=clamp(pt.len[p]||pt.plen,1,pt.plen);
    }
  });
  S.pads.forEach(p=>{ if(p.fine==null)p.fine=0; if(p.reverse==null)p.reverse=false; if(p.mode==null)p.mode='one'; if(p.ftype==null)p.ftype='off'; if(p.fcut==null)p.fcut=1; if(p.fres==null)p.fres=0.9; if(p.drv==null)p.drv=0; if(p.crush==null)p.crush=16;
    if(p.mute==null)p.mute=false; if(p.solo==null)p.solo=false;   // pre-R43/R44 docs lack these
    if(p.lfoOn==null)p.lfoOn=false; if(p.lfoTgt==null)p.lfoTgt='cutoff'; if(p.lfoShape==null)p.lfoShape='sine';
    if(p.lfoSync==null)p.lfoSync='free'; if(p.lfoRate==null)p.lfoRate=2; if(p.lfoDepth==null)p.lfoDepth=0.5;
    if(p.warpBeats==null)p.warpBeats=4; if(p.warpBpm==null)p.warpBpm=0;
    if(p.speed==null)p.speed=1; if(p.keepPitch==null)p.keepPitch=false;
    if(p.grSize==null)p.grSize=0.12; if(p.grDens==null)p.grDens=18; if(p.grSpread==null)p.grSpread=0.05;
    if(p.grPitch==null)p.grPitch=0; if(p.grPos==null)p.grPos=0; if(p.grBurst==null)p.grBurst=0.45;
    if(p.eqLo==null)p.eqLo=0; if(p.eqMid==null)p.eqMid=0; if(p.eqHi==null)p.eqHi=0; });
  { // LOAD FAILSAFE: every loaded pad at ~0 volume = a poisoned save (a real
    // field failure wrote gain 0 into state and autosave kept it). One pad at
    // 0 is legit mixing; ALL of them is never intentional — repair silently.
    const lp=S.pads.filter(p=>p.bufId>=0);
    if(lp.length && lp.every(p=>(p.gain||0)<0.05)){
      lp.forEach(p=>{ p.gain=0.8; });
      try{ logGain(S.pads.indexOf(lp[0]),0.8,'LOAD-repair (all pads were 0)'); }catch(e){}
      setTimeout(()=>{ try{ plog('LOAD FAILSAFE: every loaded pad had volume 0 (poisoned save) — restored to 0.8.'); lcd('FIXED: pad volumes were saved at 0 — restored to 0.8.'); }catch(e){} },50);
    }
  }
  { // SOLO is a transient "audition this pad" state, not song data. A project
    // saved with a pad soloed would load with every OTHER pad silenced — the
    // "one channel plays, all the pads that built the sound are silent" report.
    // Clear solos on load (mutes, a deliberate channel-off, still persist).
    const soloed=S.pads.filter(p=>p.solo).length;
    if(soloed){ S.pads.forEach(p=>{ p.solo=false; });
      setTimeout(()=>{ try{ plog('Cleared '+soloed+' solo(s) from the loaded project so every pad plays (use S in MIX to solo again).'); }catch(e){} },50); }
  }
  Object.keys(revCache).forEach(k=>delete revCache[k]);
  Object.keys(speedCache).forEach(k=>delete speedCache[k]);   // keyed by bufId — stale after a load
  Object.keys(chokeLive).forEach(k=>delete chokeLive[k]);
  Object.keys(activeEnv).forEach(k=>delete activeEnv[k]);
  Object.keys(warpOrig).forEach(k=>delete warpOrig[k]);   // pre-warp originals belong to the outgoing session
  S.buffers=bufs;
  // re-point the chop workspace at the restored target pad's sample —
  // nulling it left CHOP/TRANSIENT dead ("NO SAMPLE") after every restore
  slices=[]; selSlice=-1;
  { const p=S.pads[S.editPad]; workBuf=(p.bufId>=0 && S.buffers[p.bufId])||null; }
  if(doc.name) $('projName').value=doc.name;
  { const keep=S.ptnBpm; S.ptnBpm=false; setBpm(S.bpm); S.ptnBpm=keep; }  // don't clobber the restored pattern's own BPM
  $('swing').value=S.swing; $('swingV').textContent=Math.round(S.swing*100)+'%';
  $('human').value=S.human; $('humanV').textContent=Math.round(S.human*100)+'%';
  $('epWarpAuto').classList.toggle('on',S.autoWarp);
  $('silFade').value=S.silFade; $('silFadeV').textContent=Math.round(S.silFade*1000)+'ms';
  $('vcurve').value=S.vcurve; $('midiCh').value=String(S.midiCh);
  $('midiRoot').value=String(S.midiRoot); $('btnChrom').classList.toggle('on',S.midiChrom);
  $('btnNotesOut').classList.toggle('on',S.notesOut); $('btnClkOut').classList.toggle('on',S.clkOut); $('midiOutCh').value=String(S.midiOutCh);
  if(AC){ // re-apply pad channel params to live graph
    reapplyLivePads();
    hardSet(LIVE.master.gain,S.masterVol);
    hardSet(LIVE.revRet.gain,S.revLvl); LIVE.conv.buffer=makeIR(AC,S.revSize,S.revType);
    hardSet(LIVE.comp.threshold,compThresh());
    buildDelayNet(AC,LIVE);   // rebuilds mode/feedback/tone/time from restored state
    scApplyRoutingG(LIVE,AC);
  }
  $('mxVol').value=S.masterVol; $('mxVolV').textContent=Math.round(S.masterVol*100)+'%';
  $('mxComp').value=S.compAmt; $('mxCompV').textContent=Math.round(S.compAmt*100)+'%';
  $('mxRevLvl').value=S.revLvl; $('mxRevLvlV').textContent=Math.round(S.revLvl*100)+'%';
  $('mxRevSize').value=S.revSize; $('mxRevSizeV').textContent=S.revSize.toFixed(1)+'s';
  $('mxDlyFb').value=S.delayFb; $('mxDlyFbV').textContent=Math.round(S.delayFb*100)+'%';
  $('mxDlyTone').value=S.dlyTone; $('mxDlyToneV').textContent=Math.round(S.dlyTone/100)/10+'k';
  $('mxDlyDiv').value=String(S.delayDiv);
  $('mxRevType').value=S.revType; $('mxDlyMode').value=S.dlyMode;
  document.querySelectorAll('#bankrow [data-b]').forEach(x=>x.classList.toggle('on',parseInt(x.dataset.b,10)===S.bank));
  ensureSpeedCaches();   // pitch-locked pads need their stretched buffers ready before the first hit/bounce
  drawPads(); drawEdit(); drawSeq(); drawCcMaps(); drawWave(); drawTrax(); drawLive(); drawSidechain(); drawSong(); drawMixer();
}
$('jsonIn').addEventListener('change',async e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  try{
    const doc=JSON.parse(await f.text());
    if(doc.fmt!=='mvx880-project') throw new Error('not an MVX project');
    const bufs=doc.buffers.map(b=>{
      const ab=mkAudioBuf(b.len,b.sr,b.ch.length);
      b.ch.forEach((c64,i)=>ab.copyToChannel(b64ToF32(c64),i));
      return ab;
    });
    applySessionDoc(doc,bufs);
    curProjId=null; drawProjects();   // an imported file isn't a library entry yet — SAVE adds it
    plog('Loaded project: '+f.name);
    lcd('PROJECT LOADED · tap SAVE AS NEW to keep it in the library.');
  }catch(err){ plog('Load failed: '+err.message); lcd('LOAD FAILED.'); }
});

/* ---------------- IndexedDB session vault (survives page kill) ---------------- */
const IDB_NAME='mvx880', IDB_STORE='session', IDB_LIB='library';
function idbOpen(){ return new Promise((res,rej)=>{
  const rq=indexedDB.open(IDB_NAME,2);       // v2 adds the sample-library store; upgrade keeps existing sessions
  rq.onupgradeneeded=()=>{ const db=rq.result;
    if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    if(!db.objectStoreNames.contains(IDB_LIB)) db.createObjectStore(IDB_LIB);
  };
  rq.onsuccess=()=>res(rq.result);
  rq.onerror=()=>rej(rq.error);
});}
function idbPutS(store,key,val){ return idbOpen().then(db=>new Promise((res,rej)=>{
  const tx=db.transaction(store,'readwrite');
  tx.objectStore(store).put(val,key);
  tx.oncomplete=()=>{ db.close(); res(); };
  tx.onerror=()=>{ db.close(); rej(tx.error); };
}));}
function idbGetS(store,key){ return idbOpen().then(db=>new Promise((res,rej)=>{
  const tx=db.transaction(store,'readonly');
  const rq=tx.objectStore(store).get(key);
  rq.onsuccess=()=>{ db.close(); res(rq.result); };
  rq.onerror=()=>{ db.close(); rej(rq.error); };
}));}
function idbDelS(store,key){ return idbOpen().then(db=>new Promise((res,rej)=>{
  const tx=db.transaction(store,'readwrite');
  tx.objectStore(store).delete(key);
  tx.oncomplete=()=>{ db.close(); res(); };
  tx.onerror=()=>{ db.close(); rej(tx.error); };
}));}
function idbKeysS(store){ return idbOpen().then(db=>new Promise((res,rej)=>{
  const tx=db.transaction(store,'readonly');
  const rq=tx.objectStore(store).getAllKeys();
  rq.onsuccess=()=>{ db.close(); res(rq.result||[]); };
  rq.onerror=()=>{ db.close(); rej(rq.error); };
}));}
function idbPut(key,val){ return idbPutS(IDB_STORE,key,val); }
function idbGet(key){ return idbGetS(IDB_STORE,key); }

function gcBuffers(){ // drop orphaned samples (every re-render leaves one) so the vault doesn't bloat past iOS IDB limits
  const used=new Set();
  S.pads.forEach(p=>{ if(p.bufId>=0) used.add(p.bufId); });
  S.trax.forEach(tr=>{ if(tr.bufId>=0) used.add(tr.bufId); });
  const wi=workBuf?S.buffers.indexOf(workBuf):-1;
  if(wi>=0) used.add(wi);
  if(used.size>=S.buffers.length) return;
  try{ commitUndo(); }catch(e){}   // flush pending edits so _committed matches live state before renumbering
  const map={}, nb=[];
  S.buffers.forEach((b,i)=>{ if(used.has(i)){ map[i]=nb.length; nb.push(b); } });
  S.pads.forEach(p=>{ if(p.bufId>=0) p.bufId=map[p.bufId]; });
  S.trax.forEach(tr=>{ if(tr.bufId>=0) tr.bufId=map[tr.bufId]; });
  Object.keys(revCache).forEach(k=>delete revCache[k]);   // keyed by old ids
  Object.keys(speedCache).forEach(k=>delete speedCache[k]);   // keyed by old ids
  S.buffers=nb;
  // keep the undo BASELINE in step with the renumbering, or the next
  // commitUndo sees a phantom "change" and undo needs pressing twice.
  // Stack entries stay untouched — each carries its own buffers array.
  if(_committed){
    const remap=arr=>{ (arr||[]).forEach(o=>{ if(o.bufId>=0) o.bufId=(map[o.bufId]!=null?map[o.bufId]:-1); }); };
    remap(_committed.doc.pads); remap(_committed.doc.trax);
    _committed.bufs=nb.slice();
  }
}
function snapshotSession(){
  gcBuffers();
  const bufs=S.buffers.map(b=>{
    const ch=[];
    for(let c=0;c<b.numberOfChannels;c++){
      const f=b.getChannelData(c), i16=new Int16Array(f.length);
      for(let i=0;i<f.length;i++) i16[i]=Math.max(-32768,Math.min(32767,Math.round(f[i]*32767)));
      ch.push(i16.buffer);
    }
    return {sr:b.sampleRate,len:b.length,ch};
  });
  return { fmt:'mvx880-project', t:Date.now(), name:$('projName').value, projId:curProjId,
    bpm:S.bpm, swing:S.swing, human:S.human, autoWarp:S.autoWarp, silFade:S.silFade, masterVol:S.masterVol, delayFb:S.delayFb,
    revLvl:S.revLvl, revSize:S.revSize, revType:S.revType, delayDiv:S.delayDiv, dlyTone:S.dlyTone, dlyMode:S.dlyMode, compAmt:S.compAmt,
    vcurve:S.vcurve, midiCh:S.midiCh, pcPat:S.pcPat, ccMaps:S.ccMaps, ptnBpm:S.ptnBpm,
    midiChrom:S.midiChrom, midiRoot:S.midiRoot, notesOut:S.notesOut, clkOut:S.clkOut, midiOutCh:S.midiOutCh,
    scaleLock:S.scaleLock, scaleRoot:S.scaleRoot, scaleName:S.scaleName,
    chain:S.chain, chainOn:S.chainOn, chainPos:S.chainPos,
    pattern:S.pattern, bank:S.bank, editPad:S.editPad, seqPad:S.seqPad,
    trax:S.trax, inst:S.inst, mic:micSettings(), amp:ampSettings(),
    mEqLo:S.mEqLo, mEqMid:S.mEqMid, mEqHi:S.mEqHi, mWidth:S.mWidth, mMono:S.mMono, mCeil:S.mCeil, mByp:S.mByp, mTrim:S.mTrim,
    scOn:S.scOn, scTrig:S.scTrig, scDepth:S.scDepth, scRel:S.scRel,
    song:S.song, songOn:S.songOn, songLoop:S.songLoop, morph:S.morph,
    pads:S.pads, patterns:S.patterns, buffers:bufs };
}
let autosaving=false;
async function autosave(){
  if(autosaving) return;
  autosaving=true;
  try{ await idbPut('last',snapshotSession()); }catch(e){}
  autosaving=false;
}
/* iOS kills the page without letting the pagehide/hidden async IDB write
   finish, so lifecycle saves alone lose the last minute of work. Save
   shortly after every edit instead — the vault is never more than ~2s stale. */
let dirtyT=0;
function dirty(){ clearTimeout(dirtyT); dirtyT=setTimeout(autosave,1500); scheduleUndo(); }

/* ---------------- undo / redo (snapshot of the editable state, no buffers) ---------------- */
let undoStack=[], redoStack=[], _committed=null, undoTimer=0;
function undoSnap(){
  return { name:$('projName').value,
    bpm:S.bpm, swing:S.swing, human:S.human, autoWarp:S.autoWarp, silFade:S.silFade, masterVol:S.masterVol, delayFb:S.delayFb,
    revLvl:S.revLvl, revSize:S.revSize, revType:S.revType, delayDiv:S.delayDiv, dlyTone:S.dlyTone, dlyMode:S.dlyMode, compAmt:S.compAmt,
    vcurve:S.vcurve, midiCh:S.midiCh, pcPat:S.pcPat, ccMaps:S.ccMaps, ptnBpm:S.ptnBpm,
    midiChrom:S.midiChrom, midiRoot:S.midiRoot, notesOut:S.notesOut, clkOut:S.clkOut, midiOutCh:S.midiOutCh,
    scaleLock:S.scaleLock, scaleRoot:S.scaleRoot, scaleName:S.scaleName,
    chain:S.chain, chainOn:S.chainOn, chainPos:S.chainPos,
    pattern:S.pattern, bank:S.bank, editPad:S.editPad, seqPad:S.seqPad,
    trax:S.trax, inst:S.inst, mic:micSettings(), amp:ampSettings(),
    mEqLo:S.mEqLo, mEqMid:S.mEqMid, mEqHi:S.mEqHi, mWidth:S.mWidth, mMono:S.mMono, mCeil:S.mCeil, mByp:S.mByp, mTrim:S.mTrim,
    scOn:S.scOn, scTrig:S.scTrig, scDepth:S.scDepth, scRel:S.scRel, autoTarget:S.autoTarget,
    song:S.song, songOn:S.songOn, songLoop:S.songLoop, morph:S.morph,
    pads:S.pads, patterns:S.patterns };
}
function cloneSnap(x){ return JSON.parse(JSON.stringify(x)); }
/* Every undo entry pairs the JSON state with a REFERENCE copy of S.buffers
   as it was at that moment. bufIds are indices into that exact array —
   autosave's gcBuffers() compacts/renumbers S.buffers between snapshots, so
   applying an old doc against the CURRENT array put wrong samples on pads
   (the delete→undo "wrong sound / silent pad" bug). AudioBuffer refs are
   shared, not copied, so this costs pointers, not audio memory. */
function undoCapture(){ return { doc:cloneSnap(undoSnap()), bufs:S.buffers.slice() }; }
function undoInit(){ _committed=undoCapture(); updateUndoUI(); }
function scheduleUndo(){ clearTimeout(undoTimer); undoTimer=setTimeout(commitUndo,600); }
function commitUndo(){
  if(!_committed){ _committed=undoCapture(); return; }
  const cur=undoCapture();
  if(JSON.stringify(cur.doc)===JSON.stringify(_committed.doc)) return;
  undoStack.push(_committed); if(undoStack.length>40) undoStack.shift();
  _committed=cur; redoStack.length=0;
  updateUndoUI();
}
function restoreSnap(entry){
  applySessionDoc(cloneSnap(entry.doc), entry.bufs.slice());
  S.autoTarget=entry.doc.autoTarget||'mfilt'; drawAuto();
}
function undo(){
  commitUndo();
  if(!undoStack.length){ lcd('NOTHING TO UNDO'); return; }
  redoStack.push(undoCapture());
  const entry=undoStack.pop();
  restoreSnap(entry); _committed=undoCapture();
  updateUndoUI(); lcd('UNDO · '+undoStack.length+' left');
}
function redo(){
  if(!redoStack.length){ lcd('NOTHING TO REDO'); return; }
  undoStack.push(undoCapture());
  const entry=redoStack.pop();
  restoreSnap(entry); _committed=undoCapture();
  updateUndoUI(); lcd('REDO');
}
function updateUndoUI(){
  const u=$('btnUndo'), r=$('btnRedo'); if(!u) return;
  u.disabled=!undoStack.length; r.disabled=!redoStack.length;
}
$('btnUndo').addEventListener('click',undo);
$('btnRedo').addEventListener('click',redo);
window.addEventListener('keydown',e=>{
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  const mod=e.metaKey||e.ctrlKey;
  if(mod && (e.key==='z'||e.key==='Z')){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); }
  else if(mod && (e.key==='y'||e.key==='Y')){ e.preventDefault(); redo(); }
});
function ageText(ms){
  const m=Math.round(ms/60000);
  if(m<1) return 'moments ago';
  if(m<60) return m+' min ago';
  const h=Math.round(m/60);
  if(h<48) return h+' hr ago';
  return Math.round(h/24)+' days ago';
}
function factoryDemo(){   // brand-new user: open into a full song, not an empty grid
  loadClaudeSong().then(()=>{
    lcd("WELCOME · “Amber Signal” by Claude loaded — press PLAY. Kits + sounds live in SMPL.");
  });
}
function docToBuffers(doc){   // PCM (Int16) back to AudioBuffers
  return (doc.buffers||[]).map(b=>{
    const ab=mkAudioBuf(b.len,b.sr,b.ch.length);
    b.ch.forEach((raw,i)=>{
      const i16=new Int16Array(raw), f=new Float32Array(i16.length);
      for(let j=0;j<i16.length;j++) f[j]=i16[j]/32767;
      ab.copyToChannel(f,i);
    });
    return ab;
  });
}
async function offerRestore(){
  let doc=null;
  try{ doc=await idbGet('last'); }catch(e){ factoryDemo(); return; }
  if(!doc || !doc.pads){ factoryDemo(); return; }
  const bar=$('restoreBar');
  $('restoreAge').textContent=(doc.name?doc.name+' · ':'')+ageText(Date.now()-doc.t);
  bar.style.display='flex';
  $('btnRestore').onclick=()=>{
    try{
      applySessionDoc(doc,docToBuffers(doc));
      curProjId=doc.projId||null; drawProjects();
      bar.style.display='none';
      lcd('SESSION RESTORED · '+ageText(Date.now()-doc.t));
    }catch(err){ lcd('RESTORE FAILED: '+err.message); }
  };
  $('btnRestoreX').onclick=()=>{ bar.style.display='none'; };
}
/* ---------------- PROJECT LIBRARY (many named projects on-device) ----------------
   Full docs live under 'proj:<id>' in the session store; a small 'projIndex'
   array holds browse metadata so the list never has to decode buffers. The
   'last' autosave slot is untouched — it remains the crash-recovery session. */
let curProjId=null;
function docKB(doc){ let n=0; (doc.buffers||[]).forEach(b=>b.ch.forEach(a=>n+=a.byteLength)); return Math.round(n/1024); }
function projMeta(id,doc){ return { id, name:doc.name||'untitled', t:doc.t||Date.now(),
  pads:S.pads.filter(p=>p.bufId>=0).length, kb:docKB(doc) }; }
async function projIndexGet(){ try{ return (await idbGet('projIndex'))||[]; }catch(e){ return []; } }
async function projIndexUpsert(meta){ let idx=await projIndexGet(); idx=idx.filter(x=>x.id!==meta.id); idx.unshift(meta); await idbPut('projIndex',idx); }
async function projIndexRemove(id){ let idx=await projIndexGet(); idx=idx.filter(x=>x.id!==id); await idbPut('projIndex',idx); }
async function requestPersist(){   // iOS may evict non-persisted IndexedDB under storage pressure — losing the whole library
  try{ if(navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); }catch(e){}
}
async function projSaveNew(){
  const id='p'+Date.now().toString(36)+Math.floor(Math.random()*1e3).toString(36);
  const doc=snapshotSession(); doc.projId=id;
  try{ await idbPut('proj:'+id,doc); await projIndexUpsert(projMeta(id,doc)); }
  catch(e){ lcd('SAVE FAILED: '+(e&&e.message||'storage')); return; }
  requestPersist();
  curProjId=id; await drawProjects(); lcd('SAVED “'+doc.name+'” to library'); plog('Project saved: '+doc.name);
}
async function projSave(){
  if(!curProjId){ return projSaveNew(); }
  const idx=await projIndexGet();
  const open=idx.find(x=>x.id===curProjId);
  const nm=($('projName').value||'untitled');
  // DATA-LOSS GUARD: SAVE updates the OPEN project in place. If that project is
  // gone, or you've renamed it (a strong signal you mean a different beat),
  // save as a NEW entry instead of overwriting — the old project is never lost.
  if(!open){ plog('The open project was no longer in the library — saving as a new entry.'); return projSaveNew(); }
  if((open.name||'')!==nm){ plog('Renamed “'+(open.name||'untitled')+'” → “'+nm+'” — saved as a NEW project; the original is untouched. (Use the same name to update in place.)'); lcd('SAVED “'+nm+'” as a NEW project — “'+(open.name||'untitled')+'” kept.'); return projSaveNew(); }
  const doc=snapshotSession(); doc.projId=curProjId;
  try{ await idbPut('proj:'+curProjId,doc); await projIndexUpsert(projMeta(curProjId,doc)); }
  catch(e){ lcd('SAVE FAILED: '+(e&&e.message||'storage')); return; }
  requestPersist();
  await drawProjects(); lcd('UPDATED “'+doc.name+'”'); plog('Project updated: '+doc.name);
}
async function projLoad(id){
  let doc=null; try{ doc=await idbGet('proj:'+id); }catch(e){}
  if(!doc||!doc.pads){ lcd('PROJECT NOT FOUND.'); await projIndexRemove(id); await drawProjects(); return; }
  try{
    if(playing) stopSeq();
    applySessionDoc(doc,docToBuffers(doc));
    curProjId=id; $('projName').value=doc.name||'untitled';
    await idbPut('last',snapshotSession());   // make the loaded project the active/crash-recovery session
    await drawProjects();
    lcd('LOADED “'+(doc.name||'untitled')+'”');
  }catch(err){ lcd('LOAD FAILED: '+err.message); }
}
async function projDelete(id,name){
  try{ await idbDelS(IDB_STORE,'proj:'+id); }catch(e){}
  await projIndexRemove(id);
  if(curProjId===id) curProjId=null;
  await drawProjects(); lcd('DELETED “'+(name||'project')+'”');
}
async function projDuplicate(id){
  let doc=null; try{ doc=await idbGet('proj:'+id); }catch(e){}
  if(!doc) return;
  const nid='p'+Date.now().toString(36)+Math.floor(Math.random()*1e3).toString(36);
  doc.projId=nid; doc.name=((doc.name||'untitled')+' copy').slice(0,40); doc.t=Date.now();
  try{ await idbPut('proj:'+nid,doc);
    let idx=await projIndexGet(); idx=idx.filter(x=>x.id!==nid);
    idx.unshift({id:nid,name:doc.name,t:doc.t,pads:(doc.pads||[]).filter(p=>p.bufId>=0).length,kb:docKB(doc)});
    await idbPut('projIndex',idx);
  }catch(e){ lcd('DUPLICATE FAILED: '+(e&&e.message||'storage')); return; }
  await drawProjects(); lcd('DUPLICATED → “'+doc.name+'”');
}
function projNew(){
  if(playing) stopSeq();
  try{ panicVoices(); }catch(e){}
  S.pads=Array.from({length:NPADS},(_,i)=>newPad(i));
  S.patterns=Array.from({length:NPAT},()=>newPattern());
  S.buffers=[]; S.trax=Array.from({length:NTRAX},()=>newTrack());
  S.song=[]; S.songOn=false; S.chain=[]; S.chainOn=false; S.chainPos=0; S.morph.on=false; S.morph.amt=0; S.morph.pos=0; morphBuf=null;
  S.pattern=0; S.bank=0; S.editPad=0; S.seqPad=0;
  S.scOn=false; workBuf=null; slices=[]; selSlice=-1;
  Object.keys(warpOrig).forEach(k=>delete warpOrig[k]);
  curProjId=null; $('projName').value='untitled';
  reapplyLivePads(); scApplyRouting();
  buildPads(); drawPads(); drawEdit(); drawSeq(); drawTrax(); drawSong(); drawMixer(); drawFader(); drawSidechain();
  dirty(); lcd('NEW PROJECT · empty session');
}
function fmtBytes(x){ return x>=1048576?(x/1048576).toFixed(1)+'MB':Math.round(x/1024)+'KB'; }
async function updateProjStore(){
  const idx=await projIndexGet();
  const projBytes=idx.reduce((a,x)=>a+(x.kb||0),0)*1024;
  let usage=0, quota=0, persisted=false;
  try{
    if(navigator.storage && navigator.storage.estimate){ const e=await navigator.storage.estimate(); usage=e.usage||0; quota=e.quota||0; }
    if(navigator.storage && navigator.storage.persisted) persisted=await navigator.storage.persisted();
  }catch(e){}
  const pctUsed=quota?clamp(usage/quota,0,1):0;
  const fill=$('projStoreFill'); if(fill){ fill.style.width=(pctUsed*100).toFixed(1)+'%';
    fill.style.background=pctUsed>=0.9?'var(--red)':pctUsed>=0.7?'var(--lcd)':'var(--green)'; }
  const btn=$('btnProjPersist'); if(btn){ btn.classList.toggle('on',persisted); btn.textContent=persisted?'KEPT ✓':'KEEP OFFLINE'; }
  let t=idx.length+' project'+(idx.length===1?'':'s')+' use '+fmtBytes(projBytes);
  if(quota) t+=' · device '+fmtBytes(usage)+' / '+fmtBytes(quota)+' ('+Math.round(pctUsed*100)+'%)';
  t+=persisted?' · KEPT, won’t be evicted':' · tap KEEP OFFLINE so iOS won’t evict them';
  const txt=$('projStoreTxt'); if(txt){ txt.textContent=t; txt.style.color=pctUsed>=0.9?'var(--red)':'var(--lcd)'; }
}
$('btnProjPersist').addEventListener('click',async ()=>{
  if(navigator.storage && navigator.storage.persist){
    let ok=false; try{ ok=await navigator.storage.persist(); }catch(e){}
    lcd(ok?'STORAGE KEPT — your projects won’t be auto-evicted.':'Browser declined persistent storage (projects are still saved).');
  }else lcd('Persistent-storage API not available in this browser.');
  updateProjStore();
});
async function drawProjects(){
  const el=$('projList'); if(!el) return;
  const idx=await projIndexGet();
  idx.sort((a,b)=>b.t-a.t);
  const totKb=idx.reduce((a,x)=>a+(x.kb||0),0);
  $('projLibInfo').textContent = idx.length? ('· '+idx.length+' saved · '+(totKb>1024?(totKb/1024).toFixed(1)+'MB':totKb+'KB')) : '· none yet';
  updateProjStore();
  { const openMeta = curProjId && idx.find(x=>x.id===curProjId);
    $('projCur').textContent = openMeta ? ('● SAVE updates “'+(openMeta.name||'untitled')+'”') : (curProjId? '● in library' : '○ unsaved — SAVE makes a new entry'); }
  el.innerHTML='';
  if(!idx.length){ el.innerHTML='<div style="font-size:11px;color:var(--txt-dim);padding:4px">No saved projects yet. Make a beat and tap SAVE AS NEW.</div>'; return; }
  idx.forEach(m=>{
    const row=document.createElement('div'); row.className='projrow'+(m.id===curProjId?' cur':'');
    const main=document.createElement('div'); main.className='pjmain';
    const nm=document.createElement('div'); nm.className='pjname'; nm.textContent=m.name||'untitled';
    const meta=document.createElement('div'); meta.className='pjmeta';
    meta.textContent=ageText(Date.now()-m.t)+' · '+(m.pads||0)+' pads · '+(m.kb>1024?(m.kb/1024).toFixed(1)+'MB':(m.kb||0)+'KB');
    main.append(nm,meta);
    const load=document.createElement('button'); load.textContent='LOAD'; load.className='on'; load.addEventListener('click',()=>projLoad(m.id));
    const dup=document.createElement('button'); dup.textContent='DUP'; dup.addEventListener('click',()=>projDuplicate(m.id));
    const del=document.createElement('button'); del.textContent='DEL'; del.addEventListener('click',()=>{ if(confirm('Delete “'+(m.name||'project')+'”? This cannot be undone.')) projDelete(m.id,m.name); });
    row.append(main,load,dup,del); el.appendChild(row);
  });
}
/* TIME MACHINE — the app checkpoints itself every 3 minutes. REWIND is
   always reversible: rewinding first checkpoints the present. */
let ckptBusy=false;
async function ckptSave(){
  if(ckptBusy||!S.buffers.length) return; ckptBusy=true;
  try{
    const doc=snapshotSession();
    await idbPut('ckpt:'+Date.now(),doc);
    let ks=(await idbKeysS(IDB_STORE)).filter(k=>typeof k==='string'&&k.indexOf('ckpt:')===0).sort();
    const keep=docKB(doc)>8192?3:6;   // big sample-heavy projects keep fewer
    while(ks.length>keep){ await idbDelS(IDB_STORE,ks.shift()); }
  }catch(e){}
  ckptBusy=false;
}
setInterval(ckptSave,180000);
async function drawRewind(){
  const el=$('rewindList'); if(!el) return;
  let ks=[]; try{ ks=(await idbKeysS(IDB_STORE)).filter(k=>typeof k==='string'&&k.indexOf('ckpt:')===0).sort().reverse(); }catch(e){}
  el.innerHTML='';
  if(!ks.length){ el.innerHTML='<div style="font-size:10px;color:var(--txt-dim);padding:2px 0 6px">No checkpoints yet — they appear automatically every 3 minutes while you work.</div>'; return; }
  ks.forEach(k=>{
    const t=parseInt(k.slice(5),10);
    const row=document.createElement('div'); row.className='row';
    const nm=document.createElement('span'); nm.style.cssText='font-size:11px;flex:1;color:var(--lcd)';
    nm.textContent='\u23f1 '+ageText(Date.now()-t);
    const b=document.createElement('button'); b.textContent='REWIND';
    b.addEventListener('click',async ()=>{
      if(!confirm('Rewind the session to '+ageText(Date.now()-t)+'? A checkpoint of RIGHT NOW is saved first, so you can rewind the rewind.')) return;
      try{
        try{ await idbPut('ckpt:'+Date.now(), snapshotSession()); }catch(e){}
        const doc=await idbGet(k);
        if(!doc){ lcd('CHECKPOINT MISSING.'); drawRewind(); return; }
        if(playing) stopSeq();
        applySessionDoc(doc,docToBuffers(doc));
        curProjId=doc.projId||null;
        await idbPut('last',snapshotSession());
        drawProjects(); drawRewind();
        lcd('REWOUND \u2713 session restored from '+ageText(Date.now()-t));
      }catch(e){ lcd('REWIND FAILED: '+e.message); }
    });
    row.append(nm,b); el.appendChild(row);
  });
}
$('btnBlackBox').addEventListener('click',bbKeep);
$('btnProjSave').addEventListener('click',projSave);
$('btnProjSaveNew').addEventListener('click',projSaveNew);
$('btnProjNew').addEventListener('click',()=>{ if(confirm('Start a new empty project? Save first if you want to keep the current one.')) projNew(); });
function plog(s){ $('projlog').textContent=(new Date().toTimeString().slice(0,8))+'  '+s+'\n'+$('projlog').textContent; }

/* ---------------- WAV bounce (OfflineAudioContext) ---------------- */
function encodeWav(buf){
  const nCh=2, sr=buf.sampleRate, len=buf.length;
  const bytes=44+len*nCh*2, ab=new ArrayBuffer(bytes), dv=new DataView(ab);
  function ws(o,s){ for(let i=0;i<s.length;i++) dv.setUint8(o+i,s.charCodeAt(i)); }
  ws(0,'RIFF'); dv.setUint32(4,bytes-8,true); ws(8,'WAVE');
  ws(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nCh,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*nCh*2,true); dv.setUint16(32,nCh*2,true); dv.setUint16(34,16,true);
  ws(36,'data'); dv.setUint32(40,len*nCh*2,true);
  const L=buf.getChannelData(0), R=buf.numberOfChannels>1?buf.getChannelData(1):L;
  /* TPDF dither — the actual last step of finishing a 16-bit master.
     Rounding 32-bit float to 16-bit quantises, and quantisation error that
     CORRELATES with the signal is heard as a grainy fizz on reverb and fades.
     Adding a triangular sub-LSB noise before rounding decorrelates it: the
     error becomes steady, inaudible hiss instead. It costs about -93dB of
     noise, which is a fair price and what every mastering chain does. */
  const q=1/32767, tpdf=()=>(Math.random()-Math.random())*q;
  const clip=v=>v<-1?-1:(v>1?1:v);
  let o=44;
  for(let i=0;i<len;i++){
    dv.setInt16(o,Math.round(clip(L[i]+tpdf())*32767),true); o+=2;
    dv.setInt16(o,Math.round(clip(R[i]+tpdf())*32767),true); o+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}
/* ---------------- MIDI export (Standard MIDI File, format 1) ---------------- */
function midiVlq(n){ const b=[n&0x7f]; n=Math.floor(n/128); while(n>0){ b.unshift((n&0x7f)|0x80); n=Math.floor(n/128); } return b; }
function midiStr(s){ const o=[]; for(let i=0;i<s.length;i++) o.push(s.charCodeAt(i)&0x7f); return o; }
function midiTrack(evs){ // evs: [{tick, msg:[...]}], sorted; returns full MTrk bytes
  evs.sort((a,b)=>a.tick-b.tick || (a.ord||0)-(b.ord||0));
  const data=[]; let last=0;
  for(const e of evs){ const dt=Math.max(0,Math.round(e.tick)-last); last=Math.round(e.tick); data.push(...midiVlq(dt),...e.msg); }
  data.push(...midiVlq(0),0xFF,0x2F,0x00);   // end of track
  const len=data.length, hdr=[0x4D,0x54,0x72,0x6B, (len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255];
  return hdr.concat(data);
}
function exportMidi(){
  const src=$('bSrc').value, PPQ=480, TPS=PPQ/4;   // ticks per 16th step
  const seq=bounceSeq(src);
  const perPad={}, tempoEvs=[]; let absStepExp=0, lastBpm=-1, barTick=0;
  seq.forEach(sq=>{
    const pat=sq.pat, PL=patLen(pat);
    const bpm=(S.ptnBpm && pat.bpm)? clampBpm(pat.bpm) : S.bpm;
    if(bpm!==lastBpm){ const upq=Math.round(60000000/Math.abs(bpm));
      tempoEvs.push({tick:barTick,ord:0,msg:[0xFF,0x51,0x03,(upq>>>16)&255,(upq>>>8)&255,upq&255]}); lastBpm=bpm; }
    for(let st=0;st<PL;st++){
      const stTick=barTick+st*TPS+(st%2===1?Math.round(S.swing*TPS):0);
      for(let p=0;p<NPADS;p++){
        const L=trackLen(pat,p), idx=(absStepExp+st)%L;
        const v=pat.steps[p][idx]; if(!(v>0)) continue;
        const lk=pat.locks&&pat.locks[p+':'+idx];
        const baseNote=(S.pads[p].note>=0?S.pads[p].note:36);
        const chord=(lk&&lk.pitches&&lk.pitches.length)?lk.pitches:[(lk&&lk.pitch)||0];   // export the whole chord
        const vel=clamp(Math.round(v*127),1,127);
        let tick=stTick+((lk&&lk.nudge)?Math.round(lk.nudge*TPS):0); if(tick<0) tick=0;
        const rat=(lk&&lk.rat>1)?lk.rat:1, gate=Math.max(20,Math.round((rat>1?TPS/rat:TPS)*0.85));
        (perPad[p]=perPad[p]||[]);
        chord.forEach(po=>{ const note=clamp(baseNote+po,0,127);
          for(let r=0;r<rat;r++){ const on=tick+Math.round(r*(TPS/rat));
            perPad[p].push({tick:on,ord:1,msg:[0x90,note,vel]});
            perPad[p].push({tick:on+gate,ord:0,msg:[0x80,note,0]}); } });
      }
    }
    absStepExp+=PL; barTick+=PL*TPS;
  });
  const usedPads=Object.keys(perPad).map(Number).sort((a,b)=>a-b);
  if(!usedPads.length){ plog('MIDI: nothing to export — source is empty.'); lcd('NO MIDI TO EXPORT.'); return; }
  // track 0: tempo map + time signature
  const t0=[{tick:0,ord:0,msg:[0xFF,0x58,0x04,0x04,0x02,0x24,0x08]},
            {tick:0,ord:0,msg:[0xFF,0x03,midiStr('JBH tempo').length,...midiStr('JBH tempo')]}].concat(tempoEvs);
  const ntrks=1+usedPads.length;
  const head=[0x4D,0x54,0x68,0x64,0,0,0,6, 0,1, (ntrks>>>8)&255,ntrks&255, (PPQ>>>8)&255,PPQ&255];
  let bytes=head.concat(midiTrack(t0));
  for(const p of usedPads){
    const nm=padName(p)+(S.pads[p].name?' '+S.pads[p].name:'');
    const evs=[{tick:0,ord:0,msg:[0xFF,0x03,midiStr(nm).length,...midiStr(nm)]}].concat(perPad[p]);
    bytes=bytes.concat(midiTrack(evs));
  }
  const blob=new Blob([new Uint8Array(bytes)],{type:'audio/midi'});
  download(blob,($('projName').value||'mvx-session')+'.mid');
  plog('MIDI exported: '+usedPads.length+' tracks, '+seq.length+' bar(s), '+Math.round(blob.size/1024*10)/10+'KB.');
  lcd('MIDI EXPORTED · '+usedPads.length+' tracks');
}
$('btnMidi').addEventListener('click',exportMidi);

/* the arrangement a render/export should walk, one entry per bar. Patterns are
   handed over as OBJECTS rather than indices so a morph — whose bars are blends
   that live in no slot — renders through exactly the same code path. */
function bounceSeq(src){
  if(src==='morph'){
    const m=S.morph, A=S.patterns[m.from], B=S.patterns[m.to], out=[];
    if(m.from===m.to) return [{pat:A, idx:m.from}];
    const bars=clamp(m.bars|0,1,64);
    for(let k=0;k<bars;k++) out.push({pat:morphPattern(A,B,k/bars,m.curve,m.vel), idx:m.from});
    out.push({pat:B, idx:m.to});             // land on B, exactly
    return out;
  }
  if(src==='song' && S.song.length)
    return S.song.reduce((a,x)=>{ for(let r=0;r<Math.max(1,x.reps||1);r++) a.push({pat:S.patterns[x.pat], idx:x.pat}); return a; },[]);
  if(src==='chain' && S.chain.length>0) return S.chain.map(i=>({pat:S.patterns[i], idx:i}));
  return [{pat:S.patterns[S.pattern], idx:S.pattern}];
}

/* shared offline render — padSet/traxSet null = all; a Set restricts to those
   indices (Set() = none). Used by the master bounce and per-stem export. */
/* opt.preLimit — tap the mix where the trim leaves off, before the limiter and
   the safety clipper, with the trim itself at unity. That is the only place the
   true overshoot is still visible; downstream of it everything is squashed to
   the ceiling by design. AUTO is the only caller.
   opt.src / opt.loops — render something other than what the BOUNCE controls
   say. AUTO uses this to judge the whole arrangement rather than whichever
   pattern happens to be selected on another tab.
   opt.worstCase — pin the per-render randomness to its loudest setting: every
   probability step fires, and humanize does not thin the velocities. Both of
   those can only ever make a pass QUIETER — skipped hits and scaled-down
   velocities — so sampling one ordinary render systematically under-reads the
   peak, and AUTO would set a trim that the next bounce sails past. One
   deterministic worst case instead: whatever you actually render can only come
   out at or below it, and pressing AUTO twice gives the same answer. */
async function renderMix(padSet, traxSet, opt){
  ensureSpeedCaches();   // bake pitch-locked stretches so the offline render matches what you hear live
  const worst=!!(opt&&opt.worstCase);
  const loops=(opt&&opt.loops)||parseInt($('bLoops').value,10);
  const src=(opt&&opt.src)||$('bSrc').value;
  const seq=bounceSeq(src);
  const events=[], tempoSeg=[], autoEvents=[]; let t=0.05, absB=0;
  for(let l=0;l<loops;l++){
    for(const sq of seq){
      const pat=sq.pat, PLB=patLen(pat);
      const bpm=(S.ptnBpm && pat.bpm)? clampBpm(pat.bpm) : S.bpm;
      const sd=60/Math.abs(bpm)/4;
      tempoSeg.push({t,bpm});
      const rev=bpm<0;
      for(let st=0;st<PLB;st++){
        const swing=(st%2===1?S.swing*sd:0);
        if(pat.sil && pat.sil[posMod(rev?-(absB+st):(absB+st),PLB)]) events.push({when:t+st*sd+swing, sil:true});
        for(let p=0;p<NPADS;p++){
          if(padSet && !padSet.has(p)) continue;
          const L=trackLen(pat,p), idx=posMod(rev?-(absB+st):(absB+st),L);
          const v=pat.steps[p][idx]; if(!(v>0)) continue;
          const lk=pat.locks&&pat.locks[p+':'+idx];
          if(!worst && lk && lk.prob!=null && Math.random()>lk.prob) continue;
          let when=t+st*sd+swing; if(lk&&lk.nudge) when+=lk.nudge*sd;
          let hv=v;
          if(!worst && S.human>0){ when=Math.max(0.01,when+(Math.random()*2-1)*S.human*0.012);   // same humanize as live playback
            hv=clamp(v*(1-Math.random()*S.human*0.22),0.05,1); }
          const chord=(lk&&lk.pitches&&lk.pitches.length)?lk.pitches:[(lk&&lk.pitch)||0], rat=(lk&&lk.rat>1)?lk.rat:1;
          const isChord=chord.length>1;                            // NOTES-lane harmony bakes into the bounce too
          chord.forEach(pitch=>{
            if(rat>1){ const rd=sd/rat; for(let r=0;r<rat;r++) events.push({when:when+r*rd,p,v:hv,pitch,chord:isChord}); }
            else events.push({when,p,v:hv,pitch,chord:isChord});
          });
        }
      }
      if(pat.autom){ const barDur=sd*PLB;
        for(const id in pat.autom){ if(!autoTargets[id]||!autoTargets[id].applyG) continue;
          const lane=pat.autom[id]; if(!lane||!lane.length) continue;
          for(let k=0;k<=32;k++){ const pos=k/32*PLB, v=autoValueAt(lane,pos);
            if(v!=null) autoEvents.push({id, v, when:t+(pos/PLB)*barDur}); } } }
      absB+=PLB; t+=sd*PLB;
    }
  }
  const trax=[];
  S.trax.forEach((tr,i)=>{
    if(tr.bufId<0 || tr.mute) return;
    if(traxSolo>=0 && i!==traxSolo) return;
    if(traxSet && !traxSet.has(i)) return;
    const b=S.buffers[tr.bufId]; if(b) trax.push({tr,b});
  });
  if(!events.length && !trax.length) return null;
  let dur=t; trax.forEach(x=>{ dur=Math.max(dur,0.05+x.b.duration); });
  /* The reverb tail is most of a short render — 3.7s of decay after a 2.7s
     pattern. A bounce needs it. AUTO does not: a convolution tail is loudest
     where it starts, under the music that produced it, and only decays from
     there, so cutting it cannot lower the peak being measured. It roughly
     halves the wait on a one-pattern analysis. */
  const SR=44100, total=dur+((opt&&opt.noTail)?0.35:Math.max(3.0,S.revSize+0.5));
  const oc=new OfflineAudioContext(2, Math.ceil(total*SR), SR);
  const g=buildGraph(oc);
  applyMasterG(g,oc);          // the bounce gets the same master chain as the speakers
  if(opt&&opt.preLimit){ try{ g.mTrim.gain.value=1; g.mTrim.disconnect(); g.mTrim.connect(oc.destination); }catch(e){} }
  scApplyRoutingG(g,oc);
  if(!padSet){ for(let i=0;i<NPADS;i++){ if(g.pads[i]&&g.pads[i].mute) g.pads[i].mute.gain.value = padAudible(i)?1:0; } }   // master bounce honors mixer mute/solo (stems ignore it)
  for(const a of autoEvents){ try{ autoTargets[a.id].applyG(g,a.v,a.when); }catch(e){} }
  tempoSeg.forEach(seg=>{ const dt=clamp(60/seg.bpm*S.delayDiv,0.02,1.9);
    (g.dlyNodes||[]).forEach(d=>d.delayTime.setValueAtTime(dt,seg.t)); });
  const chokeOff={};
  events.sort((a,b)=>(a.when-b.when) || ((a.sil?0:1)-(b.sil?0:1)));   // a cut on the same step lands first
  let gateDown=false;
  for(const ev of events){
    if(ev.sil){ silenceAt(g, ev.when, S.silFade); gateDown=true; continue; }
    if(gateDown){ silRestore(g, Math.max(0.001,ev.when-0.002)); gateDown=false; }
    triggerPad(oc, g, ev.p, ev.v, ev.when, ev.chord?null:chokeOff, ev.pitch);   // chord voices don't choke each other
  }
  for(const x of trax){ const w=wireTrack(oc,g,x.tr,x.b,0.05,x.tr.gain); if(x.tr.loop) w.src.stop(t); }
  return await oc.startRendering();
}
$('btnBounce').addEventListener('click',async ()=>{
  if(seqSolo) plog('Note: SOLO is armed in the SEQ view — the bounce still renders ALL pattern tracks.');
  lcd('RENDERING MASTER …');
  try{
    const rendered=await renderMix(null,null);
    if(!rendered){ plog('Nothing to bounce — pattern and tracks are empty.'); lcd('NOTHING TO BOUNCE.'); return; }
    const wav=encodeWav(rendered);
    download(wav, ($('projName').value||'mvx-session')+'.wav');
    plog('WAV done: '+Math.round(wav.size/1024)+' KB · 44.1k/16-bit stereo.');
    lcd('BOUNCE COMPLETE.');
  }catch(err){ plog('Bounce failed: '+err.message); lcd('BOUNCE FAILED.'); }
});

/* ---- compressed export: offline render, then real-time encode via MediaRecorder.
   AAC (audio/mp4 → .m4a) where supported (Safari/iOS, newer Chrome), else
   Opus (.webm). Real-time is the price of zero dependencies. ---- */
let cmpBusy=false;
function mimeLabel(m){ return m.indexOf('mp4')>=0?'M4A (AAC)':'WEBM (Opus)'; }
$('btnCompressed').addEventListener('click',async ()=>{
  if(cmpBusy){ lcd('COMPRESSED EXPORT already running…'); return; }
  const mime=['audio/mp4','audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus','audio/webm']
    .find(m=>window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
  if(!mime){ plog('Compressed export unavailable — this browser\'s MediaRecorder has no AAC/Opus. Use WAV.'); lcd('NO COMPRESSED CODEC — use WAV.'); return; }
  cmpBusy=true;
  let iv=0;
  try{
    lcd('RENDERING …');
    const rendered=await renderMix(null,null);
    if(!rendered){ plog('Nothing to export.'); lcd('NOTHING TO EXPORT.'); cmpBusy=false; return; }
    ensureAudio();
    const dur=rendered.duration;
    const src=AC.createBufferSource(); src.buffer=rendered;
    const msd=AC.createMediaStreamDestination();   // private stream — silent, doesn't touch the master
    src.connect(msd);
    const rec=new MediaRecorder(msd.stream,{mimeType:mime,audioBitsPerSecond:192000});
    const chunks=[];
    rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
    const done=new Promise(res=>{ rec.onstop=res; });
    rec.start(500);
    const t0=AC.currentTime;
    src.start();
    iv=setInterval(()=>{ const left=Math.max(0,dur-(AC.currentTime-t0));
      lcd('ENCODING '+mimeLabel(mime)+' · '+Math.ceil(left)+'s left — keep the app open'); },500);
    await new Promise(res=>{ src.onended=res; });
    await new Promise(res=>setTimeout(res,300));   // let the tail flush into the recorder
    try{ rec.stop(); }catch(e){}
    await done;
    const blob=new Blob(chunks,{type:mime});
    const ext=mime.indexOf('mp4')>=0?'m4a':'webm';
    download(blob, ($('projName').value||'mvx-session')+'.'+ext);
    plog('Compressed export: '+Math.round(blob.size/1024)+' KB .'+ext+' (WAV would be ~'+Math.round(dur*44100*4/1024)+' KB).');
    lcd('EXPORTED .'+ext.toUpperCase()+' · '+Math.round(blob.size/1024)+' KB');
  }catch(err){ plog('Compressed export failed: '+err.message); lcd('EXPORT FAILED.'); }
  finally{ clearInterval(iv); cmpBusy=false; }
});

/* ---- whole-library backup / restore: every saved project in one JSON file ---- */
function u8ToB64(u8){ let s=''; const CH=0x8000; for(let i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH)); return btoa(s); }
function b64ToU8(b64){ const bin=atob(b64), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8; }
$('btnLibBackup').addEventListener('click',async ()=>{
  const idx=await projIndexGet();
  if(!idx.length){ lcd('LIBRARY EMPTY — nothing to back up.'); return; }
  lcd('PACKING '+idx.length+' project(s) …');
  const out=[];
  for(const m of idx){
    let doc=null; try{ doc=await idbGet('proj:'+m.id); }catch(e){}
    if(!doc) continue;
    out.push({ id:m.id, doc:Object.assign({},doc,{
      buffers:(doc.buffers||[]).map(b=>({sr:b.sr,len:b.len,ch:b.ch.map(ab=>u8ToB64(new Uint8Array(ab)))})) }) });
  }
  const blob=new Blob([JSON.stringify({fmt:'mvx880-library',t:Date.now(),projects:out})],{type:'application/json'});
  download(blob,'mvx-library-backup.json');
  plog('Library backup: '+out.length+' project(s), '+(blob.size/1048576).toFixed(1)+' MB.');
  lcd('BACKUP SAVED · '+out.length+' projects');
});
$('btnLibImport').addEventListener('click',()=>{ $('libIn').value=''; $('libIn').click(); });
/* DELETE ALL PROJECTS — deliberately hard to do by accident: three separate
   gates, the last one typed. This erases every saved song permanently. */
$('btnLibClear').addEventListener('click',async ()=>{
  const idx=await projIndexGet();
  if(!idx.length){ lcd('LIBRARY ALREADY EMPTY — nothing to delete.'); return; }
  const n=idx.length, plural=n>1?'s':'';
  const names=idx.slice(0,6).map(m=>' • '+(m.name||'untitled')).join('\n')+(n>6?'\n • …and '+(n-6)+' more':'');

  // GATE 1 — what this actually does
  if(!confirm(
    '⚠️ DELETE ALL PROJECTS\n\n'+
    'This permanently erases EVERY saved song in your library — all '+n+' of them:\n\n'+
    names+'\n\n'+
    'Your beats, patterns, samples and arrangements in those projects will be GONE.\n\n'+
    'Continue?')) { lcd('Cancelled — nothing was deleted.'); return; }

  // GATE 2 — the escape hatch
  if(!confirm(
    '⚠️ STILL SURE?  (2 of 3)\n\n'+
    'THIS CANNOT BE UNDONE. There is no trash, no rewind, no recovery.\n\n'+
    'If you have not backed up, tap CANCEL now and use “BACKUP ALL ⬇ .JSON” first —\n'+
    'it saves all '+n+' project'+plural+' to one file you can re-import later.\n\n'+
    'Cancel = keep my projects.\nOK = continue to the final step.')) {
    lcd('Cancelled — your '+n+' project'+plural+' are safe. Tip: BACKUP ALL saves them to a file.'); return; }

  // GATE 3 — typed confirmation, so it can't happen from stray taps
  const word='DELETE';
  let typed=null;
  try{ typed=prompt('FINAL STEP (3 of 3)\n\nTo permanently delete all '+n+' project'+plural+', type:\n\n'+word+'\n\n(Anything else cancels.)',''); }
  catch(e){ typed=confirm('FINAL STEP (3 of 3)\n\nPermanently delete all '+n+' project'+plural+' now?')?word:null; }
  if(typed===null){ lcd('Cancelled — nothing was deleted.'); return; }
  if(String(typed).trim().toUpperCase()!==word){
    lcd('Cancelled — you typed “'+String(typed).slice(0,20)+'”, not '+word+'. Nothing was deleted.'); return; }

  for(const m of idx){ try{ await idbDelS(IDB_STORE,'proj:'+m.id); }catch(e){} }
  try{ await idbPut('projIndex',[]); }catch(e){}
  curProjId=null;
  await drawProjects();
  plog('DELETED ALL '+n+' saved project(s) — confirmed through three gates.');
  lcd('LIBRARY CLEARED · all '+n+' project'+plural+' permanently deleted. (The project open right now is still loaded — SAVE AS NEW to keep it.)');
});
$('btnDocLoad').addEventListener('click',async ()=>{
  const t=$('docText').value.trim();
  if(!t){ lcd('Paste a song doc first — tap SPEC to see the format.'); return; }
  const ok=await loadSongDoc(t);
  if(ok) plog('Song doc loaded: '+($('projName').value||'untitled'));
});
$('btnDocExport').addEventListener('click',()=>{
  $('docText').value=JSON.stringify(exportSongDoc());
  const anon=S.pads.filter(p=>p.bufId>=0&&!p.srcPreset).length;
  plog('Exported song doc'+(anon?' ('+anon+' sampled pad(s) noted by name only — presets round-trip, recordings don\'t)':'')+'.');
  lcd('DOC EXPORTED to the text box — copy it to your AI.');
});
$('btnDocSpec').addEventListener('click',()=>{ $('docText').value=SONGDOC_SPEC; lcd('SPEC + example in the box — copy ALL of it to an AI, ask for a beat, paste the reply back, tap LOAD DOC.'); });
$('btnDiag').addEventListener('click',()=>{ const d=diagDump('manual'); $('docText').value=d; lcd('DIAG in the text box + PROJ log — screenshot or copy it when reporting a bug.'); });

$('libIn').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  try{
    const j=JSON.parse(await f.text());
    if(j.fmt!=='mvx880-library'||!Array.isArray(j.projects)) throw new Error('not an MVX library backup');
    let n=0;
    for(const pr of j.projects){
      if(!pr||!pr.id||!pr.doc||pr.doc.fmt!=='mvx880-project') continue;
      const doc=Object.assign({},pr.doc,{
        buffers:(pr.doc.buffers||[]).map(b=>({sr:b.sr,len:b.len,ch:b.ch.map(s=>b64ToU8(s).buffer)})) });
      await idbPut('proj:'+pr.id,doc);
      await projIndexUpsert({ id:pr.id, name:doc.name||'untitled', t:doc.t||Date.now(),
        pads:(doc.pads||[]).filter(p=>p.bufId>=0).length, kb:docKB(doc) });
      n++;
    }
    await drawProjects();
    plog('Imported '+n+' project(s) from '+f.name+'.');
    lcd('IMPORTED · '+n+' project(s) into the library');
  }catch(err){ plog('Import failed: '+err.message); lcd('IMPORT FAILED: '+err.message); }
});
$('btnStems').addEventListener('click',async ()=>{
  const src2=$('bSrc').value;
  let seq;
  if(src2==='song' && S.song.length) seq=S.song.reduce((a,x)=>{ for(let r=0;r<Math.max(1,x.reps||1);r++) a.push(x.pat); return a; },[]);
  else if(src2==='chain' && S.chain.length>0) seq=S.chain;
  else seq=[S.pattern];
  const usedPads=new Set();
  seq.forEach(pi=>{ const pat=S.patterns[pi]; for(let p=0;p<NPADS;p++){ if(pat.steps[p].some(v=>v>0)) usedPads.add(p); } });
  const jobs=[...usedPads].sort((a,b)=>a-b).map(p=>({type:'pad',id:p,label:padName(p)+(S.pads[p].name?' '+S.pads[p].name:'')}));
  S.trax.forEach((tr,i)=>{ if(tr.bufId>=0 && !tr.mute) jobs.push({type:'trax',id:i,label:'T'+(i+1)+(tr.name?' '+tr.name:'')}); });
  if(!jobs.length){ plog('No stems — nothing playing in the bounce source.'); lcd('NO STEMS.'); return; }
  $('stemlist').innerHTML=''; lcd('RENDERING '+jobs.length+' STEMS …');
  const base=$('projName').value||'mvx-session', done=[];
  for(const j of jobs){
    let rendered;
    try{ rendered = j.type==='pad'? await renderMix(new Set([j.id]), new Set()) : await renderMix(new Set(), new Set([j.id])); }
    catch(e){ plog('Stem '+j.label+' failed: '+e.message); continue; }
    if(!rendered) continue;
    const wav=encodeWav(rendered), fname=base+'-'+j.label.replace(/[^A-Za-z0-9]+/g,'_')+'.wav';
    done.push({fname,wav});
    const row=document.createElement('div'); row.className='row';
    const nm=document.createElement('span'); nm.style.cssText='font-size:11px;flex:1;color:var(--lcd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    nm.textContent=j.label+' · '+Math.round(wav.size/1024)+'KB';
    const b=document.createElement('button'); b.textContent='SAVE'; b.addEventListener('click',()=>download(wav,fname));
    row.append(nm,b); $('stemlist').appendChild(row);
    lcd('STEM '+done.length+'/'+jobs.length+' · '+j.label);
  }
  if(done.length){
    const row=document.createElement('div'); row.className='row';
    const all=document.createElement('button'); all.textContent='SAVE ALL ('+done.length+')'; all.className='on grow';
    all.addEventListener('click',async ()=>{ for(const d of done){ download(d.wav,d.fname); await new Promise(r=>setTimeout(r,700)); } lcd('SAVED ALL STEMS'); });
    row.appendChild(all); $('stemlist').insertBefore(row,$('stemlist').firstChild);
  }
  plog('Stems ready: '+done.length+'. Tap SAVE per stem (iOS-safe) or SAVE ALL (desktop).');
  lcd('STEMS READY · '+done.length+' files');
});

/* ---------------- session lifecycle (iOS backgrounding) ----------------
   Backgrounding can kill THREE things, in escalating order of damage:
   1. AudioContext → 'interrupted'/'suspended'          fix: resume()
   2. hidden <audio> element paused                     fix: .play()
   3. the MediaStream feeding it DEAD (track ended or
      muted) — the element then "plays" a dead pipe,
      which is running transport with total silence     fix: rebuild MSD,
                                                        reattach srcObject
   Plus a watchdog: if the context claims 'running' but its clock is
   frozen, the whole context is wedged — close it and rebuild from scratch
   (AudioBuffers are context-independent, so samples survive).
   resume() and element .play() are only reliable inside a user gesture,
   so revival is wired to visibility, pageshow, focus, AND every touch. */
function outIsDead(){
  if(!LIVE || !LIVE.msd) return false;
  const tr=LIVE.msd.stream.getAudioTracks()[0];
  return !tr || tr.readyState==='ended' || tr.muted;
}
function rebuildOut(){
  if(!AC || !LIVE) return;
  try{ LIVE.softclip.disconnect(); }catch(e){}   // clears msd AND any direct fallback — no doubling
  try{
    LIVE.msd=AC.createMediaStreamDestination();
    LIVE.softclip.connect(LIVE.msd);
    if(!LIVE.ael){
      const ael=document.createElement('audio');
      ael.setAttribute('playsinline',''); ael.style.display='none';
      document.body.appendChild(ael); LIVE.ael=ael;
    }
    LIVE.ael.srcObject=LIVE.msd.stream;
    const p=LIVE.ael.play();
    if(p && p.catch) p.catch(()=>{ try{ LIVE.softclip.connect(AC.destination); }catch(e){} });
    if(jamOn && typeof jamTap!=='undefined' && jamTap){ try{ LIVE.softclip.connect(jamTap); }catch(e){} }   // don't drop an in-flight REC OUT
    if(LIVE.bbTap){ try{ LIVE.softclip.connect(LIVE.bbTap); }catch(e){} }   // black box keeps listening
    lcd('OUT REVIVED · '+AC.state);
  }catch(e){
    try{ LIVE.softclip.connect(AC.destination); }catch(e2){}
  }
}
function rebuildAudio(){ // last resort: wedged context — new context, new graph, same session
  try{ if(jamOn) stopJam(); }catch(e){}   // finalize the capture on the old context before it dies
  try{ stopTraxVoices(); if(traxCap) traxCommit(); }catch(e){}
  try{ instPanic(); }catch(e){}
  try{ if(ampOn) ampDisable(); }catch(e){}
  try{ if(LIVE && LIVE.ael){ LIVE.ael.srcObject=null; LIVE.ael.remove(); } }catch(e){}
  try{ if(AC) AC.close(); }catch(e){}
  AC=null; LIVE=null; bbTap=null;   // black box re-arms on the fresh context (history kept if the rate matches)
  liveVoices.clear();
  Object.keys(chokeLive).forEach(k=>delete chokeLive[k]);
  Object.keys(activeEnv).forEach(k=>delete activeEnv[k]);
  ensureAudio();
  lcd('AUDIO REBUILT · press PLAY');
}
let wakeLock=null;
async function wakeAcquire(){  // keep the screen on while music plays (iOS 16.4+/Android)
  try{
    if(navigator.wakeLock && !wakeLock){
      wakeLock=await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release',()=>{ wakeLock=null; });
    }
  }catch(e){ wakeLock=null; }
}
function wakeRelease(){ try{ if(wakeLock){ wakeLock.release(); wakeLock=null; } }catch(e){} }
function resumeSession(){
  if(!AC) return;
  if(micBusy || ampOn || (mediaRec && mediaRec.state==='recording')) return;   // mic/amp owns the session — forcing 'playback' here kills the capture
  // re-assert playback session category (DRUKBOX lesson — iOS can revert it)
  try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}
  if(AC.state!=='running'){
    try{ const p=AC.resume(); if(p && p.catch) p.catch(()=>{}); }catch(e){}
  }
  if(outIsDead()){ rebuildOut(); }
  else if(LIVE && LIVE.ael && LIVE.ael.paused){
    try{ const p=LIVE.ael.play(); if(p && p.catch) p.catch(()=>{}); }catch(e){}
  }
  // watchdog: verify the clock actually advances after revival attempts
  clearTimeout(resumeSession._t);
  const t0=AC.currentTime;
  resumeSession._t=setTimeout(()=>{
    if(!AC || document.hidden) return;
    if(micBusy || (mediaRec && mediaRec.state==='recording')) return;   // session belongs to the mic right now
    if(AC.state==='running' && AC.currentTime===t0) rebuildAudio();   // wedged
    else if(outIsDead()) rebuildOut();                                // stream died late
  },400);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(playing) stopSeq();
    try{ instPanic(); }catch(e){}
    try{ if(breathOn) breathStop(); }catch(e){}
    try{ if(ampOn) ampDisable(); }catch(e){}
    if(jamOn) stopJam();
    if(mediaRec && mediaRec.state==='recording') mediaRec.stop();
    autosave();
  }else{
    resumeSession();
    if(playing) wakeAcquire();
  }
});
window.addEventListener('pageshow',resumeSession);
window.addEventListener('pagehide',()=>autosave());
setInterval(()=>{ if(!document.hidden && S.buffers.length) autosave(); },60000);
window.addEventListener('focus',resumeSession);
document.body.addEventListener('touchstart',()=>{ if(AC) resumeSession(); },{passive:true});
let lastLoudT=0, lastFireT=0, lastHealT=-1e9;   // -inf: the 30s rate-limit must not block the FIRST heal
function diagDump(tag){
  try{
    const dang=[]; S.pads.forEach((pd,i)=>{ if(pd.bufId>=0 && !S.buffers[pd.bufId]) dang.push(padName(i)+'→'+pd.bufId); });
    const acts=LIVE?LIVE.pads.reduce((a,n)=>a+((n&&n.act)?n.act.length:0),0):-1;
    const g=id=>{ try{ return +id.gain.value.toFixed(3); }catch(e){ return '?'; } };
    const p0=LIVE?LIVE.pads[S.editPad]:null;
    const lines=[
      'DIAG('+tag+') '+BUILD,
      'ctx:'+(AC?AC.state:'none')+' @'+(AC?Math.round(AC.sampleRate):0)+'Hz outDead:'+(AC?outIsDead():'-')+' playing:'+playing+' songPos:'+songPos+' ptn:'+(S.pattern+1),
      'buffers:'+S.buffers.length+' loadedPads:'+S.pads.filter(x=>x.bufId>=0).length+' dangling:'+(dang.length?dang.join(' '):'none')+' voices:'+acts,
      'gates — perf:'+(LIVE?g(LIVE.perfGain):'-')+' duck:'+(LIVE?g(LIVE.duckBus):'-')+' master:'+(LIVE?g(LIVE.master):'-')+' silGate:'+silGateDown,
      'selPad '+padName(S.editPad)+' — bufId:'+(p0?S.pads[S.editPad].bufId:'-')+' ch:'+(p0?g(p0.ch):'-')+' mute:'+(p0?g(p0.mute):'-')+' solo:'+S.pads.filter(x=>x.solo).length+' muted:'+S.pads.filter(x=>x.mute).length,
      'padGains: '+S.pads.map((pd,i)=>pd.bufId>=0?padName(i)+':'+pd.gain.toFixed(2)+'/'+(LIVE&&LIVE.pads[i]?g(LIVE.pads[i].ch):'-'):null).filter(Boolean).join(' '),
      'ccMaps: '+(Object.keys(S.ccMaps).length?JSON.stringify(S.ccMaps):'none')+' · midiIn:'+(midiAccess?'on':'off'),
      'gainWrites: '+(gainLog.length?gainLog.join(' | '):'none'),
      'errors: '+(errLog.length?errLog.join(' | '):'none'),
    ];
    lines.forEach(l=>plog(l));
    return lines.join('\n');
  }catch(e){ plog('DIAG failed: '+e.message); return ''; }
}
setInterval(()=>{
  if(!(playing && AC && !document.hidden)) return;
  resumeSession();   // mid-song output death self-heals
  const now=performance.now();
  // pads scheduled + firing but the master has been silent >5s → engine-level
  // failure we can't hear-diagnose remotely: dump state and rebuild everything.
  if(lastFireT && now-lastFireT<2500 && lastLoudT && now-lastLoudT>5000 && now-lastHealT>30000){
    lastHealT=now;
    diagDump('auto-heal');
    const zeroed=[];
    S.pads.forEach((pd,i)=>{ if(pd.bufId>=0 && pd.gain<0.05){ zeroed.push(padName(i)+' was '+pd.gain.toFixed(2)); pd.gain=0.8; } });
    if(zeroed.length){ plog('SELF-HEAL: restored zeroed pad gains → 0.8: '+zeroed.join(', ')+' (see gainWrites above for who zeroed them)'); dirty(); }
    plog('SELF-HEAL: steps firing but output silent — rebuilding audio and restarting playback.');
    try{ stopSeq(); }catch(e){}
    try{ rebuildAudio(); }catch(e){}
    try{ startSeq(); drawEdit(); drawMixer(); lcd('AUDIO SELF-HEALED — playback restarted (see PROJ log)'); }catch(e){}
  }
},2500);

/* ---------------- guided tour ----------------
   First-run walkthrough. Nine steps; each one switches to the tab it needs,
   scrolls its target into view and cuts a spotlight hole out of the dimmer.
   "Seen" is remembered in localStorage; the ? button in the transport bar
   replays it any time. */
const TOUR_KEY='jbh_tour_v1';
const TOUR=[
  { title:'WELCOME TO JBH-88',
    body:'A full groovebox that runs with <b>no connection</b> — sampler, sequencer, mixer and multitrack recorder, all on your device.<br><br>This takes about a minute. You can leave any time with SKIP, and replay it from the <b>?</b> button up top.' },

  { tab:'pads', el:'padgrid', title:'THE PADS',
    body:'Tap a pad to play its sound. Tap the small label to <b>select</b> it — a blue ring marks the selected pad, and that is where new samples get sent.<br><br>Four banks of 16 give you 64 pads per project.' },

  { tab:'smpl', el:'packPick', title:'GET SOME SOUNDS',
    body:'Pick a <b>built-in pack</b> and send any sound straight to the selected pad. Everything bundled here is CC0 — free to use in anything you make.<br><br><b>IMPORT</b> loads your own files, and <b>MIC</b> records straight into the app.' },

  { tab:'smpl', el:'btnKitBuild', title:'BUILD A KIT FROM ONE SOUND',
    body:'Point this at a single sample and it carves out a whole kit — kick, snare, hats, toms and percussion — by filtering, pitching and shaping that one sound.<br><br>Fastest way to fill an empty bank.' },

  { tab:'seq', el:function(){ return seqView==='circle' ? 'circlewrap' : 'stepgrid'; },
    title:'THE SEQUENCER',
    body:'Tap steps to turn them on. The row you are editing follows the selected pad, so pick a pad then write its part.<br><br>Patterns run <b>16, 32, 48 or 64</b> steps — set the length with LEN.' },

  { tab:'seq', el:'euPreset', title:'EUCLIDEAN RHYTHMS + GROOVE',
    body:'Spread <b>N hits evenly over M steps</b> and you get the rhythms that run through most of the world’s music. Choose a preset, or dial hits/steps/rotate yourself.<br><br>The <b>GROOVE</b> menu below then pushes the timing around — swing, shuffle, dragged backbeats — so it breathes instead of marching.' },

  { tab:'seq', el:'btnViewCircle', title:'CIRCLE VIEW + SCALE LOCK',
    body:'<b>CIRCLE</b> draws each part as a turning ring. Rings of different lengths drift against each other, which makes polymeter obvious instead of invisible.<br><br><b>&#128274; SCALE</b> pins every pitch you write to a key, so nothing you play lands wrong.' },

  { tab:'trax', el:'traxlist', title:'TRAX — RECORD YOUR TAKE',
    body:'These are your tape lanes. Arm one with <b>&#9679;</b>, press PLAY and it records a pass — the whole mix, just what you play in <b>LIVE</b>, or the mic.<br><br>Stack lanes into an arrangement, and reopen any take in the sample editor to chop it like any other sound.' },

  { tab:'pads', el:'btnPlay', title:'THAT IS THE TOUR',
    body:'Press <b>&#9654;</b> to start playing. Your work saves itself as you go, and the <b>PROJ</b> tab keeps named projects, undo history and the bounce/export tools.<br><br>Have fun. Replay this any time with <b>?</b>.' }
];
let tourAt=-1;
/* ---------------- guides: the tour, and the recipe book ----------------------
   One runner, two kinds of content. The tour explains; a recipe is followed —
   it watches for you to actually do each step and moves on by itself when you
   have. NEXT still works, because a guide that traps you is worse than one you
   ignore.
   RECIPES live in `recipeBook`. Deliberately five: this is a way in, not a
   manual, and the moment it becomes a manual nobody reads it. */
let guideRecipe=null, guideLabel='TOUR', guideTimer=0, guideTap=null;
function guideSteps(){ return guideRecipe ? guideRecipe.steps : TOUR; }

/* A step with a `done` predicate waits for the real thing to happen — a sample
   landing on a pad, the transport rolling — rather than trusting that a tap on
   NEXT means you did it. Polled rather than hooked into every control: one
   timer against a handful of cheap reads costs nothing and needs no listener
   on all 300 controls. */
function guideWatch(st){
  clearTimeout(guideTimer);
  if(guideTap){ guideTap(); guideTap=null; }
  const w=$('tourWait');
  if(!st || (typeof st.done!=='function' && !st.tap)){ w.style.display='none'; w.textContent=''; return; }
  w.style.display='';
  const at=tourAt;
  let tapped=false;

  /* A step completes on something YOU did, not on something that happened to be
     true already. That distinction is the whole feature: the demo project ships
     with sixteen pads loaded and a pattern written, so absolute predicates like
     "a sample is on a pad" were satisfied the moment the step opened and the
     recipe raced past on its own — instructions, then you were left alone.
     Two ways to say it, and every step uses one:
       tap  — the actual control was pressed. Exact, and the usual choice.
       base — a value snapshotted as the step opens; done(base) compares against
              it, so only a change counts. */
  if(st.tap){
    const el=$(st.tap);
    if(el){
      const fire=()=>{ tapped=true; };
      el.addEventListener('click',fire); el.addEventListener('change',fire);
      guideTap=()=>{ el.removeEventListener('click',fire); el.removeEventListener('change',fire); };
    }
  }
  let base; try{ base = st.base ? st.base() : undefined; }catch(e){ base=undefined; }

  const poll=()=>{
    if(tourAt!==at || !$('tour').classList.contains('on')) return;
    let ok=tapped;
    if(!ok && typeof st.done==='function'){ try{ ok=!!st.done(base); }catch(e){ ok=false; } }
    if(ok){
      w.className='done'; w.textContent='✓ '+(st.didIt||'Done.');
      guideTimer=setTimeout(()=>{ if(tourAt===at) tourShow(at+1); }, 950);
      return;
    }
    w.className=''; w.textContent='Now you: '+st.waitFor;
    guideTimer=setTimeout(poll,200);
  };
  poll();
}

function tourTarget(st){
  if(!st || !st.el) return null;
  const id = (typeof st.el==='function') ? st.el() : st.el;
  const e = $(id);
  if(!e) return null;
  const r = e.getBoundingClientRect();
  return (r.width>0 && r.height>0) ? e : null;   // hidden targets fall back to a centred card
}
function tourPlace(){
  const st=guideSteps()[tourAt]; if(!st) return;
  const spot=$('tourSpot'), card=$('tourCard');
  const el=tourTarget(st);
  const vh=window.innerHeight, ch=card.offsetHeight||160, pad=6, gap=12, edge=8;
  // with a spotlight up the ring's own shadow dims the page and leaves a hole;
  // the flat dim would only fill that hole back in
  $('tourDim').classList.toggle('off', !!el);
  if(!el){
    spot.classList.remove('on');
    card.style.top = Math.max(12, Math.round((vh-ch)/2)) + 'px';
    return;
  }
  const r=el.getBoundingClientRect();
  let sTop=r.top-pad, sH=r.height+pad*2;
  if(sTop<edge){ sH-=(edge-sTop); sTop=edge; }                 // keep it on screen
  if(sTop+sH > vh-edge) sH = vh-edge-sTop;
  // A card sitting on top of the thing it is pointing at is useless. On a short
  // screen — a phone on its side — a full pad grid or tape-lane list is taller
  // than the room left over, so highlight as much of it as still leaves space
  // for the card rather than covering it.
  // A card sitting on top of the thing it points at is useless, and on a short
  // screen — a phone on its side — a pad grid or a tape-lane list is taller than
  // the room left over. Try, in order: under the whole highlight, over it, under
  // a highlight trimmed to the top of the target, and only then pinned low.
  let top;
  if(sTop+sH+gap+ch+edge <= vh)      top = sTop+sH+gap;
  else if(sTop-gap-ch >= edge)       top = sTop-gap-ch;
  else {
    const trimmed = vh-sTop-gap-ch-edge;      // how tall the highlight can be with the card below
    if(trimmed >= 40){ sH = trimmed; top = sTop+sH+gap; }
    else { top = Math.max(edge, vh-ch-edge);
           sH = Math.max(28, Math.min(sH, top-gap-sTop)); }
  }
  spot.classList.add('on');
  spot.style.left   = Math.round(r.left-pad)+'px';
  spot.style.top    = Math.round(sTop)+'px';
  spot.style.width  = Math.round(r.width+pad*2)+'px';
  spot.style.height = Math.round(sH)+'px';
  card.style.top    = Math.round(top)+'px';
}
function tourShow(i){
  if(i<0) i=0;
  const steps=guideSteps();
  if(i>=steps.length){ tourClose(true); return; }
  tourAt=i;
  const st=steps[i];
  if(st.tab){ const b=document.querySelector('#tabs button[data-v="'+st.tab+'"]'); if(b && !b.classList.contains('on')) b.click(); }
  $('tourStep').textContent = guideLabel+' · STEP '+(i+1)+' OF '+steps.length;
  $('tourTitle').innerHTML  = st.title;
  $('tourBody').innerHTML   = st.body;
  $('tourBack').style.visibility = i===0 ? 'hidden' : 'visible';
  $('tourNext').textContent = (i===steps.length-1) ? 'DONE' : 'NEXT';
  guideWatch(st);
  const el=tourTarget(st);
  if(el){
    const tall = el.getBoundingClientRect().height > window.innerHeight*0.42;
    const blk = tall ? 'start' : 'center';    // tall targets go to the top so the card fits below
    try{ el.scrollIntoView({block:blk,inline:'nearest'}); }catch(e){ try{ el.scrollIntoView(); }catch(e2){} }
  }
  requestAnimationFrame(()=>requestAnimationFrame(tourPlace));
  tourPlace();
}
function tourOpen(i){
  $('tour').classList.add('on');
  $('tour').setAttribute('aria-hidden','false');
  $('tourNext').style.display='';        // the menu hides these; a guide needs them back
  $('tourSkip').textContent='SKIP';
  tourShow(typeof i==='number' ? i : 0);
}
function tourClose(finished){
  $('tour').classList.remove('on');
  $('tour').setAttribute('aria-hidden','true');
  $('tourSpot').classList.remove('on');
  tourAt=-1;
  clearTimeout(guideTimer);
  if(guideTap){ guideTap(); guideTap=null; }
  $('tourDim').classList.remove('off');
  const wasRecipe=guideRecipe;
  guideRecipe=null; guideLabel='TOUR';
  if(wasRecipe){
    lcd(finished ? ('RECIPE DONE — '+wasRecipe.name+'. The ? button has four more.')
                 : ('Left the recipe. Everything you did is still there.'));
    coachRefresh();
    return;
  }
  try{ localStorage.setItem(TOUR_KEY, finished?'done':'skipped'); }catch(e){}
  if(finished) lcd('TOUR COMPLETE · replay it any time with ?');
}
function tourSeen(){ try{ return !!localStorage.getItem(TOUR_KEY); }catch(e){ return true; } }

/* ---------------- the recipe book -------------------------------------------
   Five workflows, each ending in something that exists: a loop playing, a take
   on a pad, a file on your phone. Every step names a real control and, where
   the result is checkable, watches for it.
   Predicates are cheap reads of live state, called four times a second while a
   step is open, so they must not allocate or render. */
const padsLoaded=()=>S.pads.filter(p=>p.bufId>=0).length;
const patHits=()=>{ const pt=curPat(); let n=0;
  for(let p=0;p<NPADS;p++) for(let s=0;s<pt.plen;s++) if(pt.steps[p][s]>0) n++;
  return n; };
const recipeBook=[
{ id:'beat', name:'A beat from one sound',
  blurb:'Turn a single sample into a full kit, put a rhythm under it, and hear it loop. Two minutes.',
  steps:[
  { title:'A BEAT FROM ONE SOUND', body:'Four steps. Each one waits for you to actually do it, so you can take as long as you like — and everything you make here stays when you finish.' },
  { tab:'smpl', el:'btnPresetLoad', title:'MAKE ONE SOUND',
    body:'Pick anything from <b>PRESETS</b> — a kick is the clearest — then press <b>RENDER &rarr; PAD</b>.<br><br>It synthesises the sound there and then, so this works with no samples and no connection. It lands on whichever pad is selected.',
    waitFor:'press RENDER → PAD.', didIt:'You made a sound.',
    tap:'btnPresetLoad' },
  { tab:'smpl', el:'btnKitBuild', title:'GROW IT INTO A KIT',
    body:'Now press <b>BUILD KIT</b>. It carves that one sound into a kick, snare, hats, toms and percussion by filtering, pitching and reshaping it — and lays a starter beat in the current pattern while it is at it.',
    waitFor:'press BUILD KIT → PADS.', didIt:'You have a kit.',
    tap:'btnKitBuild' },
  { tab:'seq', el:'euPreset', title:'GIVE IT A RHYTHM',
    body:'The selected pad gets its own row of steps. <b>EUCLID</b> spreads a number of hits evenly across the bar — the pattern behind most dance and folk music.<br><br>Choose one and it writes itself onto the pad you have selected.',
    waitFor:'choose a EUCLID preset.', didIt:'That is your rhythm.',
    tap:'euPreset' },
  { el:'btnPlay', title:'PRESS PLAY',
    body:'That is a beat. It loops until you stop it.<br><br>While it runs: tap steps in the grid to add or remove hits, and tap a pad label to move to that pad&rsquo;s row.',
    waitFor:'press PLAY.', didIt:'It is playing.',
    base:()=>playing, done:b=>playing&&!b },
  { title:'THAT IS THE LOOP', body:'Everything else in the app hangs off what you just did: <b>MIC</b> records your own sounds onto pads, <b>TRAX</b> records performances over the top, <b>OUT</b> masters it and <b>PROJ</b> exports it.<br><br>The <b>?</b> button has a recipe for each of those.' }]},

{ id:'voice', name:'Your own voice on a pad',
  blurb:'Record something through the mic, shape it, and play it from a pad like any other sample.',
  steps:[
  { title:'YOUR OWN VOICE ON A PAD', body:'Anything the microphone hears can become an instrument. Works just as well on a room, a table, or a guitar.' },
  { tab:'pads', el:'padgrid', title:'PICK WHERE IT GOES',
    body:'Tap the small <b>label</b> under a pad to select it — a blue ring marks the one you have chosen. That is where the recording will land.<br><br>An empty pad is the safe choice; recording over a full one replaces its sound.' },
  { tab:'mic', el:'btnMicOn', title:'TURN THE MIC ON',
    body:'Your browser will ask permission the first time. Nothing is sent anywhere — the audio never leaves the device.',
    waitFor:'press TURN THE MIC ON.', didIt:'The mic is on.',
    tap:'btnMicOn', done:()=>micBusy },
  { tab:'mic', el:'micBar', title:'CHECK IT CAN HEAR YOU',
    body:'Say something. The bar should move.<br><br>If it barely does, raise <b>GAIN</b> below until talking normally pushes it around the middle. If it turns into red stripes and reads <b>GATE SHUT</b>, turn <b>GATE</b> down to off — it is holding back everything you say.<br><br>This step is here because a mic that looks fine and records silence is the easiest way to waste ten minutes.',
    waitFor:'make some noise — I want to see that meter move.', didIt:'It can hear you.',
    done:()=>micPeakHold>0.02 },
  { tab:'mic', el:'micPreset', title:'GIVE IT A CHARACTER',
    body:'The presets are starting points, not decoration — <b>RADIO</b> and <b>TELEPHONE</b> in particular turn a plain voice into something that sits in a track.<br><br>Aim for the bar dancing around the middle, not pinned at the top.' },
  { tab:'mic', el:'micDest', title:'SEND IT TO THE PAD',
    body:'Set <b>GOES TO</b> to <b>the selected pad</b> — that is the one you ringed a moment ago.<br><br>Leave the checkbox below ticked and the shaping is baked in; untick it to keep the raw mic and shape it later.',
    waitFor:'set GOES TO to the selected pad.', didIt:'It will land on your pad.',
    done:()=>$('micDest').value==='pad' },
  { tab:'mic', el:'btnMicRec', title:'RECORD',
    body:'Press <b>RECORD</b>, make your noise, press it again to stop. Short is better — a single word or hit plays back best from a pad.',
    waitFor:'record something, then press it again to stop.', didIt:'It is on the pad.',
    base:()=>S.pads[S.editPad].bufId, done:b=>S.pads[S.editPad].bufId!==b },
  { tab:'pads', el:'padgrid', title:'PLAY IT',
    body:'Tap the pad. That is your sound, playable like anything else — and everything in the pad editor works on it: pitch, reverse, filter, the lot.<br><br>To put it in the beat, go to <b>SEQ</b> and write its row.' }]},

{ id:'arrange', name:'From a loop to an arrangement',
  blurb:'Use more than one pattern and chain them, so the track goes somewhere instead of repeating.',
  steps:[
  { title:'FROM A LOOP TO AN ARRANGEMENT', body:'A loop is not a track. This turns what you have into something with a shape.<br><br>Start with a pattern you already like playing.' },
  { tab:'seq', el:'patrow', title:'MAKE A SECOND PATTERN',
    body:'Patterns are numbered along this row. Tap an empty one to move to it, then write something different — sparser, or busier, or the same beat with a break in it.<br><br><b>COPY</b> duplicates the one you are on, which is usually the fast way to a variation.' },
  { tab:'seq', el:'chainrow', title:'CHAIN THEM',
    body:'<b>+PTN</b> adds the pattern you are on to the end of the chain. Move to your other pattern and add that too.<br><br>The chain is the running order — the same pattern can appear more than once.',
    waitFor:'add two patterns with +PTN.', didIt:'You have a running order.',
    base:()=>S.chain.length, done:b=>S.chain.length>=2 && S.chain.length>b },
  { tab:'seq', el:'btnChainOn', title:'TURN THE CHAIN ON',
    body:'With <b>CHAIN</b> lit, PLAY walks the running order instead of looping one pattern.',
    waitFor:'press CHAIN.', didIt:'Chain engaged.',
    tap:'btnChainOn', done:()=>S.chainOn },
  { el:'btnPlay', title:'LISTEN TO IT MOVE',
    body:'That is an arrangement. For something longer, <b>SONG</b> holds sections with repeat counts, so eight bars of one thing and four of another is two entries rather than twelve.',
    waitFor:'press PLAY.', didIt:'It is playing.',
    base:()=>playing, done:b=>playing&&!b }]},

{ id:'take', name:'Play a take over the top',
  blurb:'Record yourself performing over the beat onto a tape lane, and keep it as audio.',
  steps:[
  { title:'PLAY A TAKE OVER THE TOP', body:'<b>TRAX</b> is a tape recorder running alongside the sequencer. Anything you play while it rolls is captured as audio — no steps, no quantising.' },
  { tab:'trax', el:'traxSrc', title:'CHOOSE WHAT IT RECORDS',
    body:'<b>LIVE ONLY</b> is the one you want here: it records what <i>you</i> play — pads you hit, the LIVE instruments, the AMP input — and treats the sequencer as silent backing you can hear but do not capture.<br><br><b>MASTER BUS</b> records everything instead, which is for bouncing rather than performing.',
    waitFor:'set SOURCE to LIVE ONLY.', didIt:'It will capture just your playing.',
    done:()=>$('traxSrc').value==='live' },
  { tab:'trax', el:'traxlist', title:'ARM A LANE',
    body:'Tap the <b>&#9679;</b> on any empty lane. Armed lanes are the ones that will record.',
    waitFor:'tap ● on an empty lane.', didIt:'Lane armed.',
    base:()=>traxArm, done:b=>traxArm>=0 && traxArm!==b },
  { el:'btnPlay', title:'PLAY, AND PERFORM',
    body:'PLAY rolls the beat and starts recording at the same time. Hit pads, play the LIVE tab, make a mess — you can do it again.<br><br>Press <b>STOP</b> when you are finished and the take commits to the lane.',
    waitFor:'press PLAY and perform.', didIt:'Recording.',
    base:()=>playing, done:b=>playing&&!b },
  { tab:'trax', el:'traxlist', title:'KEEP IT, OR DO IT AGAIN',
    body:'Press <b>STOP</b> to commit. The lane now holds your take — <b>&infin;</b> loops it, <b>M</b> and <b>S</b> mute and solo it, and <b>FX</b> gives it filter, pan and sends.<br><br><b>FX &rarr; TO PAD</b> moves the take onto a pad, so a phrase you played once becomes something you can trigger.' }]},

{ id:'finish', name:'Finish it and get a file',
  blurb:'Set the master so nothing clips, then export a WAV you can send to anyone.',
  steps:[
  { title:'FINISH IT AND GET A FILE', body:'The mix is done; this is the part that makes it sound finished and gets it off the device.' },
  { tab:'out', el:'spectrum', title:'LOOK AT THE OUTPUT',
    body:'Press <b>PLAY</b> and watch. The spectrum shows what is actually leaving, and the four numbers under it read peak, average, loudness and how well it survives being folded to mono.<br><br>The line under those says, in words, what it thinks.',
    waitFor:'press PLAY.', didIt:'You can see it.',
    base:()=>playing, done:b=>playing&&!b },
  { tab:'out', el:'btnMAuto', title:'LET AUTO SET THE LEVEL',
    body:'<b>AUTO</b> renders your whole arrangement, finds its loudest moment and sets <b>TRIM</b> so that moment lands exactly on the ceiling — loud, with nothing clipping and the limiter left with nothing to do.<br><br>It says what it listened to and what it changed. Take a look at TRIM afterwards; it is an ordinary slider you can overrule.' },
  { tab:'out', el:'mMono', title:'MIND THE BOTTOM END',
    body:'<b>BASS MONO</b> at around <b>120Hz</b> pulls everything below that to the centre. Wide bass smears on a big system and thins out on a phone speaker; centring it is a habit worth having.<br><br><b>WIDTH</b> above 100% opens the sides out — useful in small doses, and the MONO-SAFE number tells you when you have gone too far.' },
  { tab:'proj', el:'bSrc', title:'CHOOSE WHAT TO BOUNCE',
    body:'<b>CURRENT PATTERN</b> is the loop you are on; <b>CHAIN</b> and <b>SONG</b> render the arrangement. <b>LOOPS</b> repeats the whole thing.' },
  { tab:'proj', el:'btnBounce', title:'BOUNCE IT',
    body:'This renders offline — faster than realtime — through the exact chain you have been listening to, and saves a 44.1k 16-bit WAV.<br><br><b>EXPORT COMPRESSED</b> below gives a much smaller M4A or WEBM, which is the one to send in a message.' },
  { title:'THAT IS A FINISHED TRACK', body:'Worth knowing: <b>SAVE</b> in PROJ keeps the whole session — samples included — on the device, and <b>EXPORT JSON</b> writes it to a file you can move to another phone.' }]}
];

function recipeStart(id){
  const r=recipeBook.find(x=>x.id===id); if(!r) return;
  guideRecipe=r; guideLabel=r.name.toUpperCase();
  tourOpen(0);
}

/* The ? button is the one door to all of this — the tour, the recipes, and the
   switch that turns the suggestions off. Rendered into the guide card rather
   than given markup of its own. */
function guideMenu(){
  guideRecipe=null; guideLabel='HELP';
  $('tour').classList.add('on');
  $('tour').setAttribute('aria-hidden','false');
  $('tourSpot').classList.remove('on');
  tourAt=-1;
  clearTimeout(guideTimer);
  $('tourWait').style.display='none';
  $('tourStep').textContent='HELP';
  $('tourTitle').textContent='WHAT DO YOU WANT TO DO?';
  $('tourBody').innerHTML =
    '<button class="rcp" data-go="tour"><b>Take the tour</b><span>Every tab, one minute. What things are, rather than how to use them.</span></button>'
    + recipeBook.map(r=>'<button class="rcp" data-go="'+r.id+'"><b>'+r.name+'</b><span>'+r.blurb+'</span></button>').join('')
    + '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11px;color:var(--txt-dim)">'
    + '<input type="checkbox" id="coachOn"'+(coachEnabled()?' checked':'')+'>'
    + 'Suggest things as I work &mdash; one line under the tabs, based on what is actually in the project.</label>';
  $('tourBack').style.visibility='hidden';
  $('tourNext').style.display='none';
  $('tourSkip').textContent='CLOSE';
  $('tourCard').style.top='12px';
  $('tourBody').querySelectorAll('.rcp').forEach(b=>b.addEventListener('click',()=>{
    const go=b.dataset.go;
    $('tourNext').style.display=''; $('tourSkip').textContent='SKIP';
    if(go==='tour'){ guideRecipe=null; guideLabel='TOUR'; tourShow(0); }
    else recipeStart(go);
  }));
  $('coachOn').addEventListener('change',e=>{
    try{ localStorage.setItem(COACH_KEY, e.target.checked?'on':'off'); }catch(err){}
    coachRefresh();
    lcd(e.target.checked?'SUGGESTIONS ON.':'SUGGESTIONS OFF — the ? button turns them back on.');
  });
}
$('tourNext').addEventListener('click',()=>tourShow(tourAt+1));
$('tourBack').addEventListener('click',()=>tourShow(tourAt-1));
$('tourSkip').addEventListener('click',()=>tourClose(false));
$('btnTour').addEventListener('click',guideMenu);
window.addEventListener('resize',()=>{ if(tourAt>=0) tourPlace(); });
document.addEventListener('keydown',e=>{
  if(!$('tour').classList.contains('on')) return;
  if(e.key==='Escape'){ tourClose(false); return; }      // also closes the menu, where tourAt is -1
  if(tourAt<0) return;                                   // the menu has no next/back
  if(e.key==='ArrowRight'||e.key==='Enter'){ tourShow(tourAt+1); }
  else if(e.key==='ArrowLeft'){ tourShow(tourAt-1); }
});
/* short screens clamp the per-tab hint to two lines — tapping one opens it. */
document.querySelectorAll('.hint').forEach(h=>h.addEventListener('click',()=>h.classList.toggle('open')));

/* ---------------- suggestions -----------------------------------------------
   One line, drawn from what is actually in the project. Rules, not a model:
   the app has a finite number of states worth commenting on, every answer here
   names a control that exists, and it costs nothing to run.
   Evaluated on tab switch — a natural pause, and it bounds how often anything
   can appear. Dismissing one silences it for the session; the toggle silences
   the lot for good. */
const COACH_KEY='jbh_coach_v1';
const coachEnabled=()=>{ try{ return localStorage.getItem(COACH_KEY)!=='off'; }catch(e){ return true; } };
const coachSeen={};
let coachCur=null;
const COACH_TIPS=[
  { id:'empty', tab:'smpl',
    when:()=>padsLoaded()===0,
    say:'Every pad is empty. Pick a <b>pack</b> below and tap a sound to put it on the selected pad.',
    go:{tab:'smpl',el:'packPick'} },
  { id:'onesound', tab:'smpl',
    when:()=>padsLoaded()>0 && padsLoaded()<4,
    say:'<b>BUILD KIT</b> turns one sound into a whole kit — kick, snare, hats, toms.',
    go:{tab:'smpl',el:'btnKitBuild'} },
  { id:'nosteps', tab:'seq',
    when:()=>padsLoaded()>0 && patHits()===0,
    say:'You have sounds but no pattern. <b>EUCLID</b> writes a rhythm onto the selected pad in one tap.',
    go:{tab:'seq',el:'euPreset'} },
  { id:'longpat', tab:'seq',
    when:()=>{ const pt=curPat(); if(pt.plen<=16) return false;
      let last=-1;
      for(let p=0;p<NPADS;p++) for(let s=0;s<pt.plen;s++) if(pt.steps[p][s]>0 && s>last) last=s;
      return last>=0 && last<pt.plen/2-1; },
    say:'This pattern is <b>0</b> steps but everything happens in the first half — a shorter <b>PTN</b> would tighten the loop.',
    go:{tab:'seq',el:'patLenSel'} },
  { id:'limiting', tab:'out',
    when:()=>S.mTrim===0 && mPeakHold>0.92,
    say:'You are pushing hard into the limiter. <b>AUTO</b> sets the level so nothing has to be squashed.',
    go:{tab:'out',el:'btnMAuto'} },
  { id:'widebass', tab:'out',
    when:()=>!S.mMono && S.mWidth>1.15,
    say:'Width is up with <b>BASS MONO</b> off — wide bass smears on a big system. 120Hz is a safe habit.',
    go:{tab:'out',el:'mMono'} },
  { id:'unsaved', tab:'proj',
    when:()=>padsLoaded()>=4 && patHits()>0,
    say:'Worth a <b>SAVE</b> — it keeps the samples too, so the project opens exactly like this.',
    go:{tab:'proj',el:'btnSave'} },
  { id:'monitor', tab:'mic',
    when:()=>micBusy && $('btnMicMon') && $('btnMicMon').classList.contains('on'),
    say:'<b>MONITOR</b> is on. Headphones only from here, or it will feed back through the speaker.',
    go:{tab:'mic',el:'btnMicMon'} },
];
function coachPick(tab){
  if(!coachEnabled()) return null;
  for(const t of COACH_TIPS){
    if(t.tab && t.tab!==tab) continue;
    if(coachSeen[t.id]) continue;
    let ok=false; try{ ok=!!t.when(); }catch(e){ ok=false; }
    if(ok) return t;
  }
  return null;
}
function coachRefresh(){
  const bar=$('coachBar'); if(!bar) return;
  const on=document.querySelector('#tabs button.on');
  const t=coachPick(on?on.dataset.v:null);
  coachCur=t;
  if(!t){ bar.style.display='none'; return; }
  // the LEN tip needs the live number, which the rule cannot know when declared
  let say=t.say;
  if(t.id==='longpat') say=say.replace('<b>0</b>','<b>'+curPat().plen+'</b>');
  $('coachText').innerHTML=say;
  $('coachGo').style.display=t.go?'':'none';
  bar.style.display='flex';
}
$('coachHide').addEventListener('click',()=>{
  if(coachCur) coachSeen[coachCur.id]=1;
  $('coachBar').style.display='none';
});
$('coachGo').addEventListener('click',()=>{
  const t=coachCur; if(!t||!t.go) return;
  coachSeen[t.id]=1;
  $('coachBar').style.display='none';
  guideRecipe=null; guideLabel='SUGGESTION';
  const b=document.querySelector('#tabs button[data-v="'+t.go.tab+'"]');
  if(b && !b.classList.contains('on')) b.click();
  const el=$(t.go.el);
  if(el){
    try{ el.scrollIntoView({block:'center'}); }catch(e){}
    // borrow the tour's spotlight for a moment — no card, just "here"
    const r=el.getBoundingClientRect(), spot=$('tourSpot');
    $('tour').classList.add('on'); $('tourCard').style.display='none'; $('tourDim').style.opacity='0';
    spot.classList.add('on');
    spot.style.left=Math.round(r.left-6)+'px'; spot.style.top=Math.round(r.top-6)+'px';
    spot.style.width=Math.round(r.width+12)+'px'; spot.style.height=Math.round(r.height+12)+'px';
    setTimeout(()=>{ spot.classList.remove('on'); $('tour').classList.remove('on');
      $('tourCard').style.display=''; $('tourDim').style.opacity=''; }, 1600);
  }
});

function tourMaybeAutoStart(){
  if(tourSeen()) return;
  const bar=$('restoreBar');
  if(bar && bar.style.display!=='none') return;   // returning user with a session to restore
  setTimeout(()=>{ if(!tourSeen() && tourAt<0) tourOpen(0); },700);
}

/* Chrome fires beforeinstallprompt once, early, and only when the app is
   actually installable. Catch it here — this script runs before any module —
   and let the install UI (a Svelte component, mounted later) read it. */
window.__jbhInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__jbhInstall = e;
  dispatchEvent(new CustomEvent('jbh-installable')); });
addEventListener('appinstalled', () => { window.__jbhInstall = null;
  dispatchEvent(new CustomEvent('jbh-installed'));
  try{ lcd('INSTALLED — open JBH-88 from your home screen from now on.'); }catch(e){} });

/* ---------------- boot ---------------- */
buildPads(); fillAssignFrom(); drawEdit(); drawSeq(); setBpm(100); drawFader(); drawTrax(); drawLive(); drawSidechain();
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});   // offline shell — network-first, so updates land when online
}
document.body.addEventListener('touchstart',function once(){ ensureAudio(); document.body.removeEventListener('touchstart',once); },{passive:true});
drawSong(); undoInit(); drawProjects(); drawRewind();
a11yPass(); a11yWatch();
lcd('READY · load a sample into a pad (SMPL tab).');
offerRestore().then(tourMaybeAutoStart, tourMaybeAutoStart);
