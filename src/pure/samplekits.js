/* PREMADE KITS MADE OF RECORDINGS, NOT OSCILLATORS.

   `KITS` in src/legacy.js already existed and every one of them is
   synthesised: a slot is [presetId, note] and loading one calls
   renderPreset(). That is why they work with no connection, and it is also
   why a track built from one sounds like an oscillator with a filter on
   it — the complaint this repo has recorded more than once.

   These are the other kind. A voice here is a REGEX AGAINST A PACK, so the
   kit redistributes nothing and carries no audio: the sounds are fetched
   from the same manifests the picker lists, on demand, and cached on the
   device like any other pack sound.

   WHY A KIT IS NOT JUST A PACK. A pack is a library — VCSL Wide is 1,045
   samples across nineteen instruments, and nothing in it says which one is
   the kick. A kit is a CASTING: this recording plays the downbeat, this
   one answers it, this one carries the harmony. That is the thing WRITE
   needs and could never be told, which is why `learn()` had to be built to
   guess roles from the spectrum. A kit does not guess; it declares.

   EVERY VOICE IS AN instrument() CALL, which is the mechanism that already
   thins a range evenly by note, stacks several dynamics of one note onto
   one pad as velocity layers, and tags the pads so motif(), counterpoint()
   and balance() can see them. A drum voice is the degenerate case: fifteen
   recordings of one note, which lands as one pad with fourteen velocity
   layers — a ghost note and an accent being different takes rather than
   one waveform at two gains, which is the thing AGENTS.md says a kit must
   have.

   `role` is the declaration. It is what the kit knows and the spectrum
   cannot: an 808 kick and an 808 bass note are the same signal, and
   pitchedness() refuses to choose between them for good reason.

   THE MATCHES ARE VERIFIED, NOT WRITTEN FROM MEMORY. Every id pattern here
   was resolved against the manifest it names, and
   scripts/check-sample-kits.mjs re-resolves all of them — `npm run lint`
   fails if a kit names a pack that is gone, a pattern that matches
   nothing, or a range with no samples in it. A kit that points at a sound
   which is not there is the same fault as a button for a call that does
   not exist.

   PITCH WAS AUDITED BEFORE ANY OF THESE WERE WRITTEN. AGENTS.md records
   that VSCO-2 names files an octave below what they sound, which once put
   every string in this repo a register high. scripts/audit-pitch.mjs on
   samples/vsco-orch.json now reports all 22 instruments within 0.1
   semitones, so that manifest has been corrected and the bass and cello
   below are safe to write on. Re-run it before trusting a different pack. */

/* Each voice:
     role  what it plays — kick, snare, hat, ride, perc, bass, keys, lead,
           air, texture. Declared, never inferred.
     inst  the tag the pads get, which is the name note() and ensemble()
           use. Drums share one tag so they read as one instrument.
     pack  the manifest to take it from.
     match a regex against the sample ID (not its name — instrument()
           tests the id, which is the mistake made first here).
     lo/hi MIDI range to keep, and max how many pads to spend on it.      */

export const SAMPLE_KITS = [
  {
    id: 'room', name: 'ROOM', bpm: 90, swing: 0.14,
    note: 'a real kit in a room, upright bass and a grand piano',
    about: 'boom-bap and lo-fi. The drums are Naked Drums, which is genuinely '
      + 'recorded with several takes per velocity, so ghost notes and accents '
      + 'are different hits rather than one sample at two gains.',
    voices: [
      { role: 'kick',  inst: 'drums', pack: 'samples/nakeddrums.json', match: '-Bottom_Black', max: 1 },
      { role: 'snare', inst: 'drums', pack: 'samples/nakeddrums.json', match: '^nd:TopOne_Black', max: 1 },
      { role: 'hat',   inst: 'drums', pack: 'samples/nakeddrums.json', match: 'HatMic',        max: 1 },
      { role: 'ride',  inst: 'drums', pack: 'samples/nakeddrums.json', match: 'RideMic',       max: 1 },
      { role: 'perc',  inst: 'drums', pack: 'samples/nakeddrums.json', match: '^nd:-TopOne',   max: 1 },
      { role: 'bass',  inst: 'bass',  pack: 'samples/vsco-orch.json',  match: '^vo:bass-',     lo: 28, hi: 55, max: 6 },
      { role: 'keys',  inst: 'keys',  pack: 'samples/salamander.json', match: '^sal:[A-G]',    lo: 48, hi: 84, max: 8 },
    ],
  },
  {
    id: 'chamber', name: 'CHAMBER', bpm: 76, swing: 0.0,
    note: 'timpani, cello, contrabass and a glockenspiel',
    about: 'slow and cinematic. The cello carries the tune and the glockenspiel '
      + 'is the only thing with real top octave in it — struck metal has energy '
      + 'up there because that is what metal does, which a filtered oscillator '
      + 'never has to lose.',
    voices: [
      { role: 'kick',  inst: 'drums', pack: 'samples/vcsl-wide.json',    match: '^vc:timp',   lo: 36, hi: 48, max: 2 },
      { role: 'snare', inst: 'drums', pack: 'samples/vcsl-wide.json',    match: '^vc:snr-Snare\\d_HitSN', max: 1 },
      { role: 'perc',  inst: 'drums', pack: 'samples/vcsl-mallets.json', match: '^vc:tri-Triangle1_Hit', max: 1 },
      { role: 'bass',  inst: 'bass',  pack: 'samples/vsco-orch.json',    match: '^vo:bass-',  lo: 28, hi: 52, max: 5 },
      { role: 'lead',  inst: 'cello', pack: 'samples/vsco-orch.json',    match: '^vo:cello-', lo: 40, hi: 72, max: 7 },
      { role: 'air',   inst: 'bells', pack: 'samples/vcsl-mallets.json', match: '^vc:glock',  lo: 72, hi: 96, max: 5 },
    ],
  },
  {
    id: 'metal', name: 'METAL ROOM', bpm: 100, swing: 0.06,
    note: 'brake drum, anvil, shaker, vibraphone and a bass',
    about: 'struck metal instead of a drum machine. The snare is a brake drum '
      + 'and the accent is an anvil, both real recordings — a found sound is '
      + 'wrong for the thing carrying the beat, but struck metal is not a found '
      + 'sound, it is an instrument.',
    voices: [
      { role: 'kick',  inst: 'drums', pack: 'samples/vcsl-wide.json',    match: '^vc:bdrum-bassdrum_hit', max: 1 },
      { role: 'snare', inst: 'drums', pack: 'samples/vcsl-mallets.json', match: '^vc:brake-BrakeDrum1_Hammer', max: 1 },
      { role: 'hat',   inst: 'drums', pack: 'samples/vcsl-mallets.json', match: '^vc:shaker', max: 1 },
      { role: 'perc',  inst: 'drums', pack: 'samples/vcsl-mallets.json', match: '^vc:anvil',  max: 1 },
      { role: 'bass',  inst: 'bass',  pack: 'samples/vsco-orch.json',    match: '^vo:bass-',  lo: 28, hi: 50, max: 5 },
      { role: 'keys',  inst: 'vibes', pack: 'samples/vcsl-mallets.json', match: '^vc:vibs',   lo: 53, hi: 89, max: 6 },
    ],
  },
];

/* The roles a kit may declare. Kept here rather than in the checker so the
   engine and the checker cannot disagree about what a role is. */
export const KIT_ROLES = ['kick', 'snare', 'hat', 'ride', 'perc', 'bass',
  'keys', 'lead', 'air', 'texture'];

/* Which roles are drums. writeKit() needs the drum voices and ensemble()
   needs everything else, and both were working it out from the spectrum. */
export const KIT_DRUM_ROLES = ['kick', 'snare', 'hat', 'ride', 'perc'];

export function sampleKit(id) {
  return SAMPLE_KITS.find(k => k.id === id) || null;
}
