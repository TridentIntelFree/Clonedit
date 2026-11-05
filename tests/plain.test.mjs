/* ONE MESSAGE, TWO AUDIENCES — AND ONLY ONE OF THEM CAN TYPE.

   Reported: "the language can be a little confusing... written in a way
   that most humans don't understand. The hints and stuff can be
   confusing."

   The cause is structural. Every `says` string serves an agent over MCP,
   for which `slot("kick", 0)` is the right next step, and a person in a
   panel, for whom it is a function signature in a music app. Driving the
   real app, 4 of 17 messages told a person to type code; the language
   lint found 40 across the whole surface.

   So the strings stay as they are — taking the call away would take it
   away from the agent that can make it — and the UI translates at the
   boundary. The fixtures below are REAL messages, copied from a run
   rather than invented, because a translator tested on invented input
   is tested on the easy case. */

import { test } from 'node:test';
import assert from 'node:assert';
import { plainly, plainlyShort, CONTROL_FOR, GLOSS } from '../src/pure/plain.js';

/* straight out of the app */
const REAL = {
  fit: 'KICK is still empty. the downbeat. Short, and it has to speak instantly. '
    + 'You already have 3 sounds that could do it: PAD 1 Kick Punch (fits). '
    + 'slot("kick", 0) puts one in, and the steps move with it.',
  harmony: 'nothing pitched is playing — harmony() has nothing to judge. '
    + 'Pitched parts come from note(), not step().',
  critique: 'tonal balance was not judged: no reference is loaded. reference(url) takes '
    + 'a finished recording of comparable material and compare() then reports the '
    + 'difference band by band.',
  pulse: 'the pulse is clear and the audible onsets agree with it.',
  bend: 'A03 bent toward kick: 0% -> 48% of the way there. air-vs-body 40 -> -17.1dB, '
    + 'centroid 3033 -> 415Hz.',
  translate: 'the mix loses 14.1dB on a phone speaker. Anything below about 400Hz is '
    + 'simply not reproduced there, so energy that lives only in the sub is energy '
    + 'most listeners never hear.',
};

test('a call a person cannot make becomes the control that does it', () => {
  const t = plainly(REAL.fit);
  assert.ok(!/slot\s*\(/.test(t), t);
  assert.match(t, /USE PAD/, t);
});

test('every mapped call disappears from a message', () => {
  for (const fn of Object.keys(CONTROL_FOR)) {
    const t = plainly('first. ' + fn + '(1, "x") does the thing.');
    assert.ok(!new RegExp('\\b' + fn + '\\s*\\(').test(t),
      fn + '() survived: ' + t);
    /* case-insensitive: a control name landing at a sentence start is
       capitalised, which is correct and is not a missing replacement */
    assert.ok(t.toLowerCase().includes(CONTROL_FOR[fn].toLowerCase()), fn + ' -> ' + t);
  }
});

/* THE ONE THAT CAUGHT A BAD TABLE. "Pitched parts come from note(), not
   step()" is a VERB frame, and the first version mapped those to nouns —
   giving "Pitched parts come from a pitched part, not a drum step",
   which is circular and worse than the code it replaced. */
test('a verb frame reads as an instruction, not as a circle', () => {
  const t = plainly(REAL.harmony);
  assert.match(t, /writing notes/, t);
  assert.match(t, /writing steps/, t);
  assert.ok(!/come from a pitched part/.test(t), 'circular: ' + t);
});

test('a measurement term is explained the first time and not the second', () => {
  const t = plainly('centroid 3033 then centroid 415.');
  assert.equal((t.match(/how bright it is/g) || []).length, 1, t);
});

test('every gloss is reachable, so none is dead weight', () => {
  for (const [term, gloss] of Object.entries(GLOSS)) {
    const t = plainly('The ' + term + ' is 3.');
    assert.ok(t.includes(gloss), term + ' was not glossed: ' + t);
  }
});

test('a sentence that starts lower-case mid-message is capitalised', () => {
  assert.match(plainly(REAL.pulse), /^The pulse/);
  assert.match(plainly(REAL.critique), /^Tonal balance/);
  assert.match(plainly('One thing. and another thing here.'), /\. And another/);
});

test('but a pad name, a note or a unit is left alone', () => {
  /* two-letter and mixed-case tokens are not sentence starts: A01, dB,
     Hz, bpm, mS. Capitalising those would read as a different word. */
  for (const s of ['Done. A01 is loaded.', 'Level. dB is the unit.', 'Tempo. bpm now 120.'])
    assert.equal(plainly(s), s, s + ' -> ' + plainly(s));
});

test('IT LEAVES GOOD WRITING ALONE, which is most of it', () => {
  /* translate()'s message explains a consequence better than anything
     shorter would. A translator that trimmed or rephrased would make it
     worse, so the only change allowed here is the capital. */
  const t = plainly(REAL.translate);
  assert.equal(t, REAL.translate.replace(/^the/, 'The'));
});

test('it is idempotent, so the UI need not track whether it ran', () => {
  for (const k of Object.keys(REAL)) {
    const once = plainly(REAL[k]);
    assert.equal(plainly(once), once, k + ' changed on a second pass');
  }
});

test('it never returns nothing for something', () => {
  for (const k of Object.keys(REAL)) {
    const t = plainly(REAL[k]);
    assert.ok(t && t.length > REAL[k].length * 0.5, k + ' lost most of its text');
  }
  assert.equal(plainly(''), '');
  assert.equal(plainly(null), null);
  assert.equal(plainly(undefined), undefined);
  assert.equal(plainly('   '), '   ');
});

test('the short form swaps calls and adds no parentheses, for a one-line display', () => {
  const t = plainlyShort(REAL.bend);
  assert.ok(!/how bright it is/.test(t), 'the LCD has no room for a gloss: ' + t);
  assert.ok(!/slot\s*\(/.test(plainlyShort(REAL.fit)));
  assert.match(plainlyShort(REAL.fit), /USE PAD/);
  assert.equal(plainlyShort(null), null);
});

/* A CONTROL NAMED IN A HINT MUST EXIST. This repo documented a call
   called stage() that was never real, and it survived several tracks
   before somebody tried it. A button name is the same kind of claim. */
test('every control it names is a real label in the markup', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const html = readFileSync(resolve(root, 'src', 'index.html'), 'utf8');
  const labels = [...html.matchAll(/<button[^>]*>([\s\S]{0,80}?)<\/button>/g)]
    .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim());
  const missing = [];
  for (const [fn, control] of Object.entries(CONTROL_FOR)) {
    /* ONLY THE ONES THAT CLAIM TO BE A BUTTON. Every button label in
       this app is upper-case, so a phrase that starts lower-case is
       describing something ("the harmony check", "tapping the pad",
       "loading a sample pack") rather than naming a control. The first
       version listed the lower-case openers it had seen, and broke the
       moment a mapping started with a word not on that list. */
    if (/^[a-z]/.test(control)) continue;
    if (!labels.some(l => l === control)) missing.push(fn + ' -> "' + control + '"');
  }
  assert.deepEqual(missing, [],
    'named as a button and not in src/index.html:\n  ' + missing.join('\n  '));
});
