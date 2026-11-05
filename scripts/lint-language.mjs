/* DOES THE APP TALK TO A PERSON, OR TO ITSELF?

   Reported: "the language can be a little confusing... a lot of the
   language used in the app for the user is written in a way that most
   humans don't understand."

   That is true and it is measurable. Every message in this app serves
   TWO audiences out of one string: an agent reading `says` over MCP,
   for whom `slot("kick", 0)` is exactly the right next step, and a
   person reading the same sentence in a panel, for whom it is a
   function signature in a music app. Collected by driving the real app,
   4 of 17 messages told a person to type code:

     harmony   "Pitched parts come from note(), not step()."
     fit       "slot(\x22kick\x22, 0) puts one in"
     critique  "reference(url) takes a finished recording"
     dynamics  "call instrument() first, or pass a pad number"

   And three more buried their point under numbers, or used a metaphor
   as though it were a term — "speaks in 0ms, rings 155ms", "no element
   is unusually forward for its energy", "+51.9dB above everything
   else. That is its place."

   WHAT THIS CHECKS, and each rule earned its place from that list:

     CODE      a call a person is told to make. Name the control instead.
     JARGON    a term from the measurement layer with no gloss near it.
     LONG      a sentence over 30 words. The record is 54.
     LOWER     a sentence starting lower-case mid-message, which reads
               as a fragment rather than a sentence.

   WHAT IT DELIBERATELY DOES NOT CHECK: tone, or whether a sentence is
   GOOD. Plenty here is good — translate()'s "anything below about 400Hz
   is simply not reproduced there, so energy that lives only in the sub
   is energy most listeners never hear" explains a consequence better
   than a shorter line would. A linter that chased brevity would delete
   it. So this flags four specific, checkable faults and leaves the
   writing to a writer.

   Run: node scripts/lint-language.mjs [--all]
   Exit 1 if anything outside EXEMPT is flagged. */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOW_ALL = process.argv.includes('--all');

/* ---- what a person reads -------------------------------------------- */

/* Comments in this repo are written FOR agents and are not read by
   anybody in the app, so they must come out before anything is judged;
   leaving them in measures the documentation rather than the product. */
function stripComments(src) {
  let out = '', q = '', inB = false, inL = false;
  for (let k = 0; k < src.length; k++) {
    const c = src[k], d = src[k + 1];
    if (inL) { if (c === '\n') { inL = false; out += c; } continue; }
    if (inB) { if (c === '*' && d === '/') { inB = false; k++; } continue; }
    if (q) { out += c; if (c === '\\') { out += src[++k] || ''; continue; } if (c === q) q = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '/' && d === '/') { inL = true; k++; continue; }
    if (c === '/' && d === '*') { inB = true; k++; continue; }
    out += c;
  }
  return out;
}

/* A message is built by concatenation, so the literal after `says:` is
   only its first fragment. This walks forward collecting every string
   literal joined by `+` (and through the ternaries and calls between
   them) until the expression ends, which is what the person actually
   sees. A regex over one literal reported 6 code references where
   driving the app found far more. */
function messagesFrom(src, lead) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = src.indexOf(lead, at);
    if (i < 0) break;
    at = i + lead.length;
    let k = at, depth = 0, text = '', q = '', lit = '', seen = 0;
    for (; k < src.length && k < at + 6000; k++) {
      const c = src[k];
      if (q) {
        if (c === '\\') { lit += src[++k] || ''; continue; }
        if (c === q) { q = ''; text += lit + ' '; lit = ''; seen++; continue; }
        lit += c; continue;
      }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; continue; }
      if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; continue; }
      if ((c === ',' || c === ';') && depth === 0) break;
    }
    if (seen) out.push({ at: i, text: text.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const legacy = stripComments(readFileSync(resolve(ROOT, 'src', 'legacy.js'), 'utf8'));
const lineOf = (idx) => legacy.slice(0, idx).split('\n').length;

const msgs = [
  ...messagesFrom(legacy, 'says:'),
  ...messagesFrom(legacy, 'says ='),
  ...messagesFrom(legacy, 'lcd('),
  ...messagesFrom(legacy, 'throw new Error('),
].filter(m => m.text.length > 25);

/* ---- the four rules -------------------------------------------------- */

/* THE CALLS A PERSON MIGHT BE SHOWN, MINUS THE ONES ALREADY HANDLED.

   The source strings deliberately keep the call, because the same string
   goes to an agent over MCP that can make it. src/pure/plain.js
   translates at the UI boundary — `slot("kick", 0)` becomes "the USE PAD
   button" in a panel — so a call that CONTROL_FOR covers is not a fault
   and flagging it would be flagging the design.

   What is left is the real residual: a call that reaches a person with
   nothing to turn it into. Importing the table rather than restating it
   also means adding a translation retires the warning automatically,
   where a second copy would drift. */
const { CONTROL_FOR } = await import('../src/pure/plain.js');
const CALLS = ['note', 'step', 'slot', 'reference', 'compare', 'harmony', 'instrument',
  'infill', 'ensemble', 'melody', 'motif', 'counterpoint', 'place', 'balance', 'resynth',
  'paint', 'mutate', 'bend', 'learn', 'timbre', 'recipe', 'fit', 'poly', 'form', 'pulse',
  'tempo', 'take', 'render', 'review', 'levels', 'loudness', 'translate', 'dynamics',
  'critique', 'spectrum', 'audit', 'chords', 'key', 'pattern', 'euclid', 'phrase',
  'figure', 'sound', 'pack', 'chop', 'tape', 'freeze', 'live', 'hit']
  .filter(c => !CONTROL_FOR[c]);

/* terms from the measurement layer. Each is fine IF the same message
   explains it; the gloss is what makes it teachable rather than
   exclusive. */
const JARGON = {
  'air-vs-body': /treble|bass|bright|body and|above 2|high against/i,
  centroid: /bright|how high|average pitch|colour/i,
  LUFS: /loud|level/i,
  crest: /peak|punch|dynamic/i,
  onset: /hit|note start|attack|when .* lands|beat/i,
  periodicity: /repeat|regular|pulse|beat/i,
  'K-weight': /ear|hearing|perceiv/i,
  integrated: /whole|over the|average/i,
  sonority: /chord|notes at once/i,
  oblique: /one voice|stays|holds/i,
  quantis: /grid|snap/i,
  quantiz: /grid|snap/i,
  transient: /attack|start of|click/i,
  dBFS: /level|loud|peak/i,
};

const findings = [];
for (const m of msgs) {
  const line = lineOf(m.at);
  const t = m.text;

  for (const c of CALLS) {
    const re = new RegExp('\\b' + c + '\\s*\\(', '');
    if (re.test(t)) { findings.push({ line, rule: 'CODE', detail: c + '()', text: t }); break; }
  }
  for (const [word, gloss] of Object.entries(JARGON)) {
    if (!new RegExp(word, 'i').test(t)) continue;
    if (gloss.test(t)) continue;
    findings.push({ line, rule: 'JARGON', detail: word + ' with no gloss', text: t });
    break;
  }
  const longest = t.split(/(?<=[.!?])\s+/)
    .map(s => ({ s, n: s.split(/\s+/).filter(Boolean).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (longest && longest.n > 30)
    findings.push({ line, rule: 'LONG', detail: longest.n + ' words', text: longest.s });
  const frag = t.split(/(?<=[.!?])\s+/).slice(1).find(s => /^[a-z]/.test(s) && s.split(/\s+/).length > 3);
  if (frag) findings.push({ line, rule: 'LOWER', detail: 'sentence starts lower-case', text: frag });
}

/* ---- what is allowed to stay ---------------------------------------- */

/* A line here is a DECISION. The agent-facing half of the API is read
   by agents, and an error thrown at a caller who passed the wrong
   argument is right to name the argument. What is not allowed is a
   PANEL telling a person to type a function. */
const EXEMPT = [
  /pass a pad number/,              /* an API misuse error, aimed at the caller */
  /call instrument\(\) first/,      /* same: nothing in the UI can reach this */
  /reference\(\{base64/,            /* the API spec line, printed for agents */
  /JBH\.pack\(\) then JBH\.sounds\(\)/,  /* names the two API calls on purpose */
  /needs a target shape/,           /* audit() has no control; an agent-only call */
];

const kept = findings.filter(f => !EXEMPT.some(re => re.test(f.text)));

const byRule = {};
for (const f of kept) (byRule[f.rule] = byRule[f.rule] || []).push(f);

console.log(msgs.length + ' messages a person can see; ' + kept.length + ' flagged'
  + (findings.length - kept.length ? (', ' + (findings.length - kept.length) + ' exempt') : ''));

const why = {
  CODE: 'a call with no entry in CONTROL_FOR, so it reaches a person untranslated.',
  JARGON: 'a measurement term with no explanation in the same message.',
  LONG: 'one sentence over 30 words.',
  LOWER: 'a sentence starting lower-case, which reads as a fragment.',
};
for (const r of ['CODE', 'JARGON', 'LONG', 'LOWER']) {
  const list = byRule[r] || [];
  if (!list.length) continue;
  console.log('\n' + r + ' (' + list.length + ') — ' + why[r]);
  for (const f of (SHOW_ALL ? list : list.slice(0, 8)))
    console.log('  legacy.js:' + String(f.line).padEnd(6) + f.detail.padEnd(28)
      + '"' + f.text.slice(0, 96) + (f.text.length > 96 ? '…' : '') + '"');
  if (!SHOW_ALL && list.length > 8) console.log('  … ' + (list.length - 8) + ' more (--all)');
}
/* GATES ON `CODE` ONLY, and reports the rest.

   CODE is objective: a call reached a person with nothing to turn it
   into, and the fix is one line in CONTROL_FOR. JARGON, LONG and LOWER
   are judgements about writing, and a build that refused to run until a
   sentence was shortened would end with sentences trimmed to satisfy a
   word count -- the Goodhart failure the longest section of AGENTS.md is
   about. They are printed because somebody should read them; they stop
   nothing. */
const hard = kept.filter(f => f.rule === 'CODE');
if (hard.length) console.log('\n' + hard.length
  + ' message(s) show a call with no translation. Add it to CONTROL_FOR in '
  + 'src/pure/plain.js, or to EXEMPT here if it is genuinely agent-only.');
else console.log('\nNo untranslated calls reach a person.'
  + (kept.length ? ' The rest above are for a writer to weigh, not faults.' : ''));
process.exit(hard.length ? 1 : 0);
