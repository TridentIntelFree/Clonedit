/* ONE MESSAGE, TWO AUDIENCES — AND ONLY ONE OF THEM CAN TYPE.

   Reported: "the language can be a little confusing... a lot of the
   language used in the app for the user is written in a way that most
   humans don't understand. The hints and stuff can be confusing."

   True, and the cause is structural rather than careless. Every `says`
   string in this app is read by TWO readers. An agent gets it back over
   MCP, and for an agent `slot("kick", 0)` is exactly the right next
   step — it can make that call. A person reads the same sentence in a
   panel, where it is a function signature in a music app, and there is
   no keyboard anywhere near it.

   Collected by driving the real app, 4 of 17 messages told a person to
   type code, and the language lint found 40 across the whole surface:

     harmony   "Pitched parts come from note(), not step()."
     fit       "slot(\x22kick\x22, 0) puts one in"
     critique  "reference(url) takes a finished recording"
     mutate    "It is a sample now — pad() it, chop() it, mutate() it"

   The fix is NOT to rewrite the strings, because that would take the
   call away from the agent that can use it. It is to translate at the
   boundary: the API keeps saying `slot()`, and the panel says "the USE
   PAD button". Eight places render a `says` into the DOM, plus the LCD,
   so there is one seam and this is it.

   IT IS DELIBERATELY CONSERVATIVE. It rewrites only what is in the
   tables below and leaves every other word exactly as written. A
   translator that guessed would turn good sentences into odd ones, and
   plenty here is good — "anything below about 400Hz is simply not
   reproduced there, so energy that lives only in the sub is energy most
   listeners never hear" explains a consequence better than anything
   shorter would. Nothing should touch that. */

/* ---- calls a person cannot make, and the control that does it -------

   Every label here was read out of src/index.html rather than recalled,
   because a control named in a hint that does not exist is worse than
   the jargon it replaced — this repo has a section about a documented
   call that was never real. */
export const CONTROL_FOR = {
  slot: 'the USE PAD button',
  fit: 'CHECK MY SOUNDS',
  recipe: 'GIVE ME A RECIPE TO FILL IN',
  learn: 'LEARN MY PADS',
  timbre: 'WHAT CAN THIS SOUND DO?',
  bend: 'BEND TO MY WILL',
  tempo: 'HOW FAST IS THIS LOOP?',
  take: 'HOW DID THAT TAKE SIT?',
  form: 'SHAPE?',
  infill: 'OFFER',
  ensemble: 'the OFFER button with ALL ticked',
  instrument: 'TAG IT',
  resynth: 'REBUILD PAD',
  paint: 'PAINT A BELL',
  mutate: 'MUTATE PAD',
  freeze: 'FREEZE PAD',
  tape: 'RUN TO TAPE',
  review: 'REVIEW MIX',
  chords: 'the chord box on the SEQ tab',
  key: 'the key box on the SEQ tab',
  /* these have no single button, so they are described by what they are
     rather than pointed at.

     NAMED AS AN ACTION, NOT AS A THING, because the sentences they
     appear in are verb frames. "Pitched parts come from note(), not
     step()" with a noun substituted reads "come from a pitched part,
     not a drum step", which is circular — the first draft of this table
     did exactly that. */
  note: 'writing notes',
  step: 'writing steps',
  harmony: 'the harmony check',
  pulse: 'the beat check',
  melody: 'the tune check',
  motif: 'the repetition check',
  counterpoint: 'the two-voice check',
  place: 'the placement check',
  balance: 'the balance tool',
  reference: 'loading a reference track',
  compare: 'the tonal comparison',
  levels: 'the level meters',
  loudness: 'the loudness check',
  translate: 'the phone-speaker check',
  dynamics: 'the dynamics check',
  critique: 'the mix report',
  spectrum: 'the spectrum view',
  render: 'a bounce',
  pad: 'the pad controls',
  pattern: 'the pattern controls',
  /* NOT 'CHOP'. There is no button with that label — only a section
     heading, "SAMPLING, CHOPPING AND WARPING". Naming it as a button
     would be the stage() fabrication this repo has a section about, and
     the test that checks every claimed label against the markup caught
     it. */
  chop: 'the CHOP tool in SMPL',
  poly: 'the POLY lane',
  /* found by the lint's residual: these reach a person through an error
     and had nothing to turn into */
  sound: 'loading a sound onto a pad',
  pack: 'loading a sample pack',
  hit: 'tapping the pad',
  phrase: 'the phrase shaper',
  figure: 'the figure tool',
};

/* ---- terms worth keeping, explained once ----------------------------

   These are not replaced, because the number beside them is real and a
   person who learns the word can then read every later message. They
   are explained the FIRST time they appear in a message and left alone
   after, so a sentence does not carry the same parenthesis twice. */
export const GLOSS = {
  'air-vs-body': 'how much treble it has against bass',
  centroid: 'how bright it is, in Hz',
  LUFS: 'a loudness measure, like an average level',
  crest: 'the gap between the peaks and the average',
  onset: 'a note start',
  onsets: 'note starts',
  periodicity: 'a steady repeating pulse',
  transient: 'the attack at the start of a sound',
  transients: 'the attacks at the start of sounds',
  sonority: 'the notes sounding at one moment',
  'oblique motion': 'one voice moving while the other holds',
  dBFS: 'level, where 0 is as loud as the file goes',
};

/* Longest first, so "oblique motion" is matched before "oblique" and
   "onsets" before "onset". */
const GLOSS_KEYS = Object.keys(GLOSS).sort((a, b) => b.length - a.length);

/* ---- the translation ------------------------------------------------ */

/* `name(whatever)` — balanced to one level, which is all these use.
   Built per call rather than as one big alternation so the replacement
   can know WHICH name matched. */
function replaceCalls(text) {
  let out = text;
  for (const [fn, control] of Object.entries(CONTROL_FOR)) {
    /* the call with its arguments, including a nested quote or bracket:
       slot("kick", 0) / reference({pad}) / chords(pattern,[…]) */
    const re = new RegExp('\\b' + fn + '\\s*\\((?:[^()]|\\([^()]*\\))*\\)', 'g');
    out = out.replace(re, control);
    /* and the bare mention with empty parens, which reads the same way */
    out = out.replace(new RegExp('\\b' + fn + '\\s*\\(\\)', 'g'), control);
  }
  return out;
}

function glossOnce(text) {
  let out = text;
  const used = new Set();
  for (const key of GLOSS_KEYS) {
    if (used.has(GLOSS[key])) continue;
    const re = new RegExp('(^|[^\\w-])(' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w-])', 'i');
    const m = out.match(re);
    if (!m) continue;
    /* already explained by the sentence itself — leave it be */
    if (new RegExp('\\(' + '[^)]*' + '\\)').test(out.slice(m.index, m.index + key.length + 60))
      && out.slice(m.index, m.index + key.length + 60).includes('(')) {
      const after = out.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (after.trim().startsWith('(')) { used.add(GLOSS[key]); continue; }
    }
    out = out.slice(0, m.index + m[0].length)
      + ' (' + GLOSS[key] + ')'
      + out.slice(m.index + m[0].length);
    used.add(GLOSS[key]);
  }
  return out;
}

/* A message assembled from fragments often has a lower-case sentence in
   the middle, which reads as something broken off rather than as a
   sentence. Only after a full stop, and never a word that is lower-case
   on purpose — a pad name, a note, a setting. */
/* WORDS THAT ARE LOWER-CASE ON PURPOSE. Capitalising a unit changes it
   into a different word, and "Tempo. Bpm now 120." was what the first
   version produced — caught by its own test. */
const LOWER_ON_PURPOSE = /^(bpm|dB|dBFS|dBu|dBV|kHz|Hz|ms|mS|sec|px|st|rms|lufs|mono|pre|post)\b/i;

function capitaliseSentences(text) {
  const lift = (whole, lead, rest) =>
    LOWER_ON_PURPOSE.test(rest) ? whole : lead + rest.charAt(0).toUpperCase() + rest.slice(1);
  return text
    .replace(/([.!?]\s+)([a-z][a-z]{2,}\b)/g, (m, p, w) => lift(m, p, w))
    .replace(/^([a-z][a-z]{2,}\b)/, (m, w) => lift(m, '', w));
}

/* WHAT A PERSON SHOULD READ.

   Idempotent: running it twice changes nothing, because every control
   name it inserts contains no parentheses to match a second time and
   every gloss is added once. The UI can therefore apply it without
   tracking whether it already has. */
export function plainly(text) {
  if (text == null) return text;
  const s = String(text);
  if (!s.trim()) return s;
  return capitaliseSentences(glossOnce(replaceCalls(s)));
}

/* The same, for a short line like the LCD where a parenthesis of
   explanation would push the sentence off the display. Calls become
   control names; nothing is glossed. */
export function plainlyShort(text) {
  if (text == null) return text;
  const s = String(text);
  if (!s.trim()) return s;
  return capitaliseSentences(replaceCalls(s));
}
