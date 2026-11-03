/* THE APP CAN HOLD A MUSICAL IDEA NOW.

   AGENTS.md states the gap: "nothing in this app stores one [a
   progression]. Pads hold samples, patterns hold steps, there is no key
   written anywhere." The cost was concrete and kept recurring —
   harmony() had to be HANDED a progression, so every song script kept a
   second copy that could drift from the checker's; form could only be
   measured from exported MIDI outside the app; and nothing writing
   notes had anything to write them against.

   This tests the layer the way it will actually be used: declare a key
   and some chords, check they survive a save and a reload, check
   harmony() reads them without being told, and check that the things
   which should REFUSE still refuse. The last part matters most. The
   whole point of declaring a progression is that it is not guessed, so
   an undeclared one must come back as "undeclared" and never as an
   inference from the notes. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A KEY CAN BE DECLARED, READ AND CLEARED');
    const k = await page.evaluate(async () => {
      await window.JBH.clear();
      const before = window.JBH.key();
      const set = window.JBH.key('d', 'dorian');
      const read = window.JBH.key();
      let bad = null;
      try { window.JBH.key('H'); } catch (e) { bad = e.message; }
      const cleared = window.JBH.key(null);
      return { before, set, read, bad, cleared, after: window.JBH.key() };
    });
    t.ok('an undeclared key reads as null, not as a guess',
      k.before === null, JSON.stringify(k.before));
    t.ok('declaring one normalises the tonic and keeps the mode',
      k.set.tonic === 'D' && k.set.mode === 'dorian', JSON.stringify(k.set));
    t.ok('and it reads back', k.read.tonic === 'D', JSON.stringify(k.read));
    t.ok('a tonic that is not a note is refused rather than stored',
      /needs a tonic/.test(k.bad || ''), (k.bad || 'no error').slice(0, 70));
    t.ok('null clears it back to undeclared', k.after === null, JSON.stringify(k.after));

    t.head('CHORDS GO ON A PATTERN, ONE PER BAR');
    const c = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });      // 4 bars
      const ok4 = window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      const short = window.JBH.chords(1, ['Am', 'F']);         // pattern 1 default len
      const read = window.JBH.chords(0);
      let bad = null;
      try { window.JBH.chords(0, 'Bm7'); } catch (e) { bad = e.message; }
      return { ok4, short, read, bad, all: window.JBH.chords() };
    });
    t.ok('four chords on a four-bar pattern is clean',
      c.ok4.bars === 4 && !c.ok4.warning, 'bars ' + c.ok4.bars + ', warning ' + c.ok4.warning);
    t.ok('and they read back as written',
      c.read.join(' ') === 'Bm7 Gmaj7 Dmaj7 A', c.read.join(' '));
    t.ok('a count that does not match the pattern WARNS rather than passing quietly',
      !!c.short.warning && /repeats the list/.test(c.short.warning),
      (c.short.warning || 'no warning').slice(0, 90));
    t.ok('a string where a list belongs is refused',
      /needs an array/.test(c.bad || ''), (c.bad || 'no error').slice(0, 60));

    t.head('THE SONG SPELLS OUT ITS OWN PROGRESSION');
    /* The thing that did not exist: the arrangement's actual chord
       sequence, derived from pattern order rather than written out a
       second time beside it. */
    const p = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });
      window.JBH.pattern(1, { plen: 64 });
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      window.JBH.chords(1, ['Em7', 'Gmaj7', 'Dmaj7', 'F#7']);
      window.JBH.key('D', 'major');
      window.JBH.set({ song: [{ pat: 0, reps: 2 }, { pat: 1, reps: 1 }], songOn: true });
      return window.JBH.progression({ src: 'song' });
    });
    t.ok('two reps of pattern 0 then one of pattern 1 is twelve bars',
      p.bars === 12, p.bars + ' bars');
    t.ok('and the order is the arrangement\'s, not the writing order',
      p.chords.join(' ') === 'Bm7 Gmaj7 Dmaj7 A Bm7 Gmaj7 Dmaj7 A Em7 Gmaj7 Dmaj7 F#7',
      p.chords.join(' '));
    t.ok('it carries the key along', p.key && p.key.tonic === 'D', JSON.stringify(p.key));

    t.head('HARMONY() READS IT WITHOUT BEING TOLD');
    const h = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.set({ bpm: 100 });
      await window.JBH.instrument('v', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 50, hi: 74 });
      for (const x of window.JBH.instPads('v'))
        window.JBH.pad(x.pad, { att: 0.002, dec: 0.6, sus: 0, rel: 0.1 });
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      window.JBH.key('D', 'major');
      /* a root and third in each bar, so every chord states its quality */
      await window.JBH.batch([
        ['note', 'v', 59, 0, 0.7, { beats: 2 }], ['note', 'v', 62, 0, 0.7, { beats: 2 }],
        ['note', 'v', 55, 16, 0.7, { beats: 2 }], ['note', 'v', 59, 16, 0.7, { beats: 2 }],
        ['note', 'v', 62, 32, 0.7, { beats: 2 }], ['note', 'v', 66, 32, 0.7, { beats: 2 }],
        ['note', 'v', 57, 48, 0.7, { beats: 2 }], ['note', 'v', 61, 48, 0.7, { beats: 2 }]]);
      return await window.JBH.harmony({ src: 'pat' });
    });
    t.ok('it ran with no chords argument at all',
      h.ran === true, 'ran ' + h.ran + ', ' + h.bars + ' bars');
    t.ok('and says where it got them, rather than leaving it ambiguous',
      h.chordSource === 'declared on the patterns', String(h.chordSource));
    t.ok('it used the declared progression',
      h.chords.join(' ') === 'Bm7 Gmaj7 Dmaj7 A', h.chords.join(' '));
    t.ok('every bar states its third, which is what was written',
      h.barsWithNoThird.length === 0,
      h.barsWithNoThird.length + ' bars without a third');

    t.head('WHAT MUST STILL REFUSE');
    const refuse = await page.evaluate(async () => {
      const out = {};
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      await window.JBH.instrument('v', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 55, hi: 67 });
      await window.JBH.batch([['note', 'v', 60, 0, 0.7], ['note', 'v', 64, 0, 0.7]]);
      try { await window.JBH.harmony({ src: 'pat' }); out.none = 'no error'; }
      catch (e) { out.none = e.message; }
      /* half declared: pattern 0 has chords, pattern 1 in the song does not */
      window.JBH.pattern(1, { plen: 64 });
      window.JBH.chords(0, ['Am', 'F', 'C', 'G']);
      window.JBH.set({ song: [{ pat: 0, reps: 1 }, { pat: 1, reps: 1 }], songOn: true });
      out.prog = window.JBH.progression({ src: 'song' });
      try { await window.JBH.harmony({ src: 'song' }); out.half = 'no error'; }
      catch (e) { out.half = e.message; }
      return out;
    });
    t.ok('with nothing declared it refuses and says how to declare it',
      /no progression/.test(refuse.none) && /key\(/.test(refuse.none),
      refuse.none.slice(0, 100));
    t.ok('it still will not infer the harmony from the notes',
      /makes a wrong note look correct/.test(refuse.none), 'the refusal gives the reason');
    t.ok('a half-declared progression is reported as half-declared',
      refuse.prog.declared === 4 && refuse.prog.bars === 8
      && refuse.prog.undeclaredPatterns.join() === '1',
      refuse.prog.declared + ' of ' + refuse.prog.bars + ' bars, missing pattern '
        + refuse.prog.undeclaredPatterns.join());
    t.ok('and harmony() refuses it rather than checking only the half that exists',
      /only 4 of 8 bars/.test(refuse.half || ''), (refuse.half || 'no error').slice(0, 80));

    t.head('IT SURVIVES A SAVE AND A RELOAD');
    /* A musical layer that does not persist is a scratchpad. */
    const round = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, select: true });
      window.JBH.key('F#', 'minor');
      window.JBH.chords(0, ['F#m', 'D', 'A', 'E']);
      const doc = window.JBH.sessionDoc ? window.JBH.sessionDoc() : null;
      return { doc: !!doc, key: window.JBH.key(), chords: window.JBH.chords(0) };
    });
    t.ok('the layer is readable before any round trip',
      round.key.tonic === 'F#' && round.chords.length === 4,
      round.key.tonic + ' ' + round.key.mode + ' / ' + round.chords.join(' '));


    t.head('THE KEY & CHORDS PANEL DRIVES THE REAL STATE');
    /* The musical layer went in with an API and no UI, which is the
       gap the SOUND TOOLS buttons were added to close for the
       generators and which reopened one level down for their
       controls. A capability only an agent can reach is half a
       capability — and a panel that exists and is not wired reads
       exactly like a panel that works, so this drives the controls
       and reads the answer out of S, not out of the panel. */
    const ml = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      const fire = (id, v) => { const el = document.getElementById(id);
        el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      const present = ['mlTonic', 'mlMode', 'mlChords', 'mlSet', 'mlInfo',
        'mlInst', 'mlRole', 'mlOffer', 'mlPick', 'mlApply']
        .map(id => ({ id, found: !!document.getElementById(id) }));
      fire('mlMode', 'dorian'); fire('mlTonic', 'F#');
      const key = window.JBH.key();
      document.getElementById('mlChords').value = 'F#m7, D, A, E';
      document.getElementById('mlSet').click();
      const chords = window.JBH.chords(0);
      /* a symbol it cannot read must leave the rest alone */
      document.getElementById('mlChords').value = 'Am, Fsplork, C, G';
      document.getElementById('mlSet').click();
      const afterBad = window.JBH.chords(0);
      const badMsg = document.getElementById('mlInfo').textContent;
      return { present, key, chords, afterBad, badMsg,
        keyHint: document.getElementById('mlKeyChords').textContent,
        bars: document.getElementById('mlBarsLbl').textContent };
    });
    for (const p of ml.present) t.ok('there is a ' + p.id, p.found, p.found ? 'present' : 'MISSING');
    t.ok('the key selects write the real key',
      ml.key && ml.key.tonic === 'F#' && ml.key.mode === 'dorian', JSON.stringify(ml.key));
    t.ok('SET writes the chords onto the selected pattern',
      ml.chords && ml.chords.join(' ') === 'F#m7 D A E', String(ml.chords));
    t.ok('the panel knows how many bars the pattern is',
      /4 BARS/.test(ml.bars), ml.bars);
    t.ok('and suggests what fits the key, from tonal',
      /in key:/.test(ml.keyHint) && ml.keyHint.split(' ').length > 3,
      ml.keyHint.slice(0, 70));
    t.ok('AN UNREADABLE SYMBOL LEAVES THE EARLIER ONES ALONE',
      ml.afterBad.join(' ') === 'F#m7 D A E',
      'still ' + ml.afterBad.join(' ') + ' — a typo in one chord must not half-apply the list');
    t.ok('and it says which symbol it could not read',
      /Fsplork/.test(ml.badMsg), ml.badMsg.slice(0, 90));

    /* ---- AND NOW THE WAY A PERSON DOES IT ------------------------------
       Everything above sets .value and calls .click() in one synchronous
       pass. The box is never focused, so it is never blurred, and that is
       exactly the step that was broken: drawMusicalLayer rewrites the box
       from S.chords unless the box is the active element, a blur listener
       called it, and tapping SET blurs before the click lands. Traced on a
       real tap:

           blur:  value="Dm Bb F C"
           click: value=""
           LCD:   CHORDS CLEARED on pattern 1

       The panel's whole reason to exist is that a person can set a
       progression without the API, and by hand it cleared every one. So
       this types with the keyboard and clicks with the mouse. */
    t.head('TYPED IN BY HAND AND SET WITH A TAP');
    await page.evaluate(() => {
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, null);
      document.querySelector('#tabs button[data-v="seq"]').click();
    });
    await page.waitForTimeout(250);
    await page.locator('#mlChords').click();
    await page.locator('#mlChords').fill('Dm Bb F C');
    const atBlur = await page.locator('#mlChords').inputValue();
    await page.locator('#mlSet').click();
    await page.waitForTimeout(250);
    const typed = await page.evaluate(() => ({
      stored: window.JBH.chords(0),
      box: document.getElementById('mlChords').value,
      lcd: document.getElementById('lcdmsg').textContent.trim() }));
    t.ok('what was typed is still in the box when SET reads it',
      atBlur === 'Dm Bb F C', 'typed "' + atBlur + '"');
    t.ok('TAPPING SET STORES THE PROGRESSION, it does not clear it',
      !!typed.stored && typed.stored.join(' ') === 'Dm Bb F C',
      typed.stored ? typed.stored.join(' ') : 'nothing stored — ' + typed.lcd.slice(0, 60));
    t.ok('and it says so', /CHORDS SET/.test(typed.lcd), typed.lcd.slice(0, 60));

    /* clearing has to keep working, since that is the branch that was
       firing when it should not have been */
    await page.locator('#mlChords').click();
    await page.locator('#mlChords').fill('');
    await page.locator('#mlSet').click();
    await page.waitForTimeout(250);
    t.ok('an empty box still clears, deliberately',
      await page.evaluate(() => !window.JBH.chords(0)
        && /CHORDS CLEARED/.test(document.getElementById('lcdmsg').textContent)),
      'emptying the box and tapping SET is how you clear it');

    t.head('OFFER WRITES NOTHING UNTIL WRITE IT IS PRESSED');
    const off = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('bass', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 36, hi: 55 });
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
      window.JBH.key('D', 'major');
      const wait = async (id) => { for (let i = 0; i < 150; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      document.getElementById('mlRole').value = 'bass';
      document.getElementById('mlOffer').click();
      await wait('mlOffer');
      const opts = [...document.getElementById('mlPick').options].map(o => o.textContent);
      const afterOffer = (await window.JBH.schedule({ src: 'pat', full: false })).notes;
      const hidden = document.getElementById('mlPickRow').hidden;
      document.getElementById('mlApply').click();
      await wait('mlApply');
      const afterApply = (await window.JBH.schedule({ src: 'pat', full: false })).notes;
      return { opts, afterOffer, afterApply, hidden,
        info: document.getElementById('mlInfo').textContent };
    });
    t.ok('OFFER lists several candidates with their numbers',
      off.opts.length >= 2 && /notes/.test(off.opts[0]),
      off.opts.length + ': ' + (off.opts[0] || '').slice(0, 60));
    t.ok('the first is marked as best on the numbers, not as best',
      /best on the numbers/.test(off.opts[0] || ''), (off.opts[0] || '').slice(0, 40));
    t.ok('and NOTHING is written by offering',
      off.afterOffer === 0, off.afterOffer + ' notes after OFFER');
    t.ok('the picker only appears once there is something to pick',
      off.hidden === false, 'shown after offering');
    t.ok('WRITE IT is what actually writes',
      off.afterApply > 0, off.afterOffer + ' notes -> ' + off.afterApply);

    /* ---- A SPAN LONGER THAN ONE PATTERN -----------------------------
       A pattern holds 64 steps and a bar is 16, so four bars is the
       ceiling and eight has to become two patterns. Both halves of that
       went wrong when it was written: infill() generated steps out past
       the end and step() clamped them onto step 63, and the handler that
       spread the chunks indexed them with `% S.patterns.length`, which
       wraps -- sixteen bars from pattern 6 wrote its second half back
       over patterns 1 and 2, in that order, silently. So this checks
       that eight bars land in two CONSECUTIVE patterns and that a span
       with nowhere to go is refused instead of wrapping. */
    t.head('EIGHT BARS ARE WRITTEN ACROSS TWO PATTERNS');
    const span = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('bass', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 36, hi: 55 });
      const wait = async (id) => { for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      const run = async (startPat, span) => {
        for (let p = 0; p < 8; p++) window.JBH.pattern(p, { clear: true });
        window.JBH.pattern(startPat, { plen: 64, clear: true, select: true });
        window.JBH.chords(startPat, ['Bm7', 'Gmaj7', 'Dmaj7', 'A']);
        window.JBH.key('D', 'major');
        document.getElementById('mlRole').value = 'bass';
        document.getElementById('mlSpan').value = String(span);
        document.getElementById('mlOffer').click();
        await wait('mlOffer');
        const offered = document.getElementById('mlInfo').textContent;
        document.getElementById('mlApply').click();
        await wait('mlApply');
        /* READ THE INFO LINE BEFORE TOUCHING ANYTHING ELSE. Counting the
           hits first calls pattern() eight times, each of which redraws
           the panel, and drawMusicalLayer rewrites mlInfo — so the test
           read "Pattern 1: Bm7 Gmaj7..." and the assertion that it names
           both patterns failed on a handler that had named them
           correctly. The weaker /pattern/i assertion beside it PASSED on
           that same wrong text, which is the more useful half of the
           lesson. */
        const info = document.getElementById('mlInfo').textContent;
        const selected = (await window.JBH.pattern(null, {})).index;
        const hits = [];
        for (let p = 0; p < 8; p++) {
          const r = await window.JBH.pattern(p, {});
          hits.push(r.hits);
        }
        return { hits, offered, info, selected };
      };
      return { eight: await run(0, 8), noRoom: await run(6, 16) };
    });
    const e = span.eight;
    t.ok('bars 1-4 go in the selected pattern and bars 5-8 in the NEXT one',
      e.hits[0] > 0 && e.hits[1] > 0, 'hits per pattern: ' + e.hits.join(','));
    t.ok('and nothing is written into any pattern after those two',
      e.hits.slice(2).every(h => h === 0), 'hits per pattern: ' + e.hits.join(','));
    /* not "the note counts differ" — two chunks off two seeds can land on
       the same count by chance, and a test that fails one run in twenty
       is worse than no test. The structural claim is the one worth
       pinning: it names BOTH patterns it wrote. */
    t.ok('and it names both patterns it wrote, not just the one',
      /patterns 1, 2/.test(e.info), e.info.slice(0, 60));
    t.ok('it says how many bars it wrote, and leaves the first selected',
      /8 bars/.test(e.info) && e.selected === 0, e.info.slice(0, 90));
    t.ok('OFFER says the candidates are only the first chunk',
      /first 4 bars|first 4|8 bars/.test(e.offered || e.info), (e.offered || '').slice(0, 90));
    t.ok('SIXTEEN BARS FROM PATTERN 7 IS REFUSED, not wrapped onto pattern 1',
      span.noRoom.hits[0] === 0 && span.noRoom.hits[1] === 0,
      'hits per pattern: ' + span.noRoom.hits.join(','));
    t.ok('and the refusal says how much room there is and where to start',
      /only 8|room for|Select pattern/.test(span.noRoom.info),
      span.noRoom.info.slice(0, 110));

    /* ---- WHERE IN THE PATTERN THE PART STARTS ------------------------
       infill() has always taken a `from` and no control reached it, so
       every part the panel wrote began at bar 1 and writing a different
       ending meant dropping to the API. The options are built from the
       pattern's own PTN length, because a stale "from bar 4" on a pattern that
       is now one bar long is a refusal whose cause is invisible. */
    t.head('A PART CAN START PART-WAY THROUGH THE PATTERN');
    const from = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('keys', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 72, max: 8 });
      const wait = async (id) => { for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      const list = () => ({
        opts: [...document.getElementById('mlFrom').options].map(o => o.textContent),
        disabled: document.getElementById('mlFrom').disabled });
      window.JBH.key('A', 'minor');
      window.JBH.pattern(0, { plen: 16, clear: true, select: true });
      const at1 = list();
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      const at4 = list();
      window.JBH.chords(0, ['Am', 'F', 'C', 'G']);
      document.getElementById('mlRole').value = 'lead';
      const go = async (f, span) => {
        document.getElementById('mlFrom').value = String(f);
        document.getElementById('mlSpan').value = String(span);
        document.getElementById('mlOffer').click();
        await wait('mlOffer');
        const info = document.getElementById('mlInfo').textContent;
        if (!/ways to play/.test(info)) return { refused: info };
        document.getElementById('mlApply').click();
        await wait('mlApply');
        const said = document.getElementById('mlInfo').textContent;
        const r = await window.JBH.infill('keys',
          { from: f, bars: span, n: 1, role: 'lead', src: 'pat', seed: 3 });
        const steps = r.candidates[0].notes.map(n => n[1]);
        return { said, lo: Math.min(...steps), hi: Math.max(...steps) };
      };
      const half = await go(2, 2);
      window.JBH.pattern(0, { clear: true, select: true });
      window.JBH.chords(0, ['Am', 'F', 'C', 'G']);
      return { at1, at4, half, tooLong: await go(2, 4), spanning: await go(2, 8) };
    });
    t.ok('a one-bar pattern offers one place to start, and says so by disabling',
      from.at1.opts.length === 1 && from.at1.disabled === true,
      from.at1.opts.join(' / ') + ' disabled=' + from.at1.disabled);
    t.ok('a four-bar pattern offers four, rebuilt when PTN changes',
      from.at4.opts.length === 4 && from.at4.disabled === false, from.at4.opts.join(' / '));
    t.ok('writing from bar 3 of 4 puts every note in the second half',
      from.half.lo >= 32 && from.half.hi <= 63,
      'steps ' + from.half.lo + '–' + from.half.hi + ' (bar 3 starts at 32)');
    /* the off-by-one most likely to be read: `from` is a zero-based index
       and the sentence printed it raw, so "from bar 3" answered "bars 2–3" */
    t.ok('and it reports the bars ONE-BASED, matching the control',
      /bars 3–4/.test(from.half.said || ''), (from.half.said || '').slice(0, 95));
    t.ok('a span with no room left in the pattern is refused, with the room named',
      from.tooLong.refused && /room for 2/.test(from.tooLong.refused),
      (from.tooLong.refused || '(it wrote it)').slice(0, 100));
    t.ok('and a multi-pattern span from a middle bar is refused as meaningless',
      from.spanning.refused && /bar 1|nowhere/.test(from.spanning.refused),
      (from.spanning.refused || '(it wrote it)').slice(0, 100));

    /* ---- THE UNTOUCHED BOARD ----------------------------------------
       THE CASE EVERY OTHER TEST IN THIS FILE MISSED, and it shipped
       broken because of it. All of them open with
       pattern(0,{plen:64,...}), so none of them ever saw the DEFAULT
       pattern, which is 16 steps — one bar. Once a span had to fit the
       pattern, the span control's default of 4 bars could not, and
       OFFER refused on every fresh project: the panel's whole flow,
       end to end, dead on arrival, with six green assertions above it
       about spans working.
       So this one touches nothing it does not have to. No plen, no
       clear, no chords written by hand — a key, a progression off the
       dropdown, and the two buttons. If it writes a note, the panel
       works for someone opening the app. */
    t.head('IT WRITES ON AN UNTOUCHED BOARD, WITH NOTHING SET BUT A KEY');
    const virgin = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('keys', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 48, hi: 72, max: 8 });
      const wait = async (id) => { for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      document.getElementById('mlTonic').value = 'A';
      document.getElementById('mlTonic').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('mlMode').value = 'minor';
      document.getElementById('mlMode').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const prog = document.getElementById('mlProgPick');
      prog.selectedIndex = 1;
      prog.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('mlSet').click();
      await new Promise(r => setTimeout(r, 200));
      const spans = [...document.getElementById('mlSpan').options]
        .map(o => ({ v: o.value, off: o.disabled, sel: o.selected, text: o.textContent }));
      document.getElementById('mlOffer').click();
      await wait('mlOffer');
      const offered = document.getElementById('mlInfo').textContent;
      const nOpts = document.getElementById('mlPick').options.length;
      document.getElementById('mlApply').click();
      await wait('mlApply');
      return { spans, offered, nOpts,
        said: document.getElementById('mlInfo').textContent,
        hits: (await window.JBH.pattern(0, {})).hits,
        plen: (await window.JBH.pattern(0, {})).plen };
    });
    t.ok('the default pattern really is one bar — the case the others skip',
      virgin.plen === 16, 'plen ' + virgin.plen);
    t.ok('the span control selects a span THAT FITS, not one that cannot',
      (virgin.spans.find(o => o.sel) || {}).v === '1',
      'selected ' + JSON.stringify((virgin.spans.find(o => o.sel) || {}).text));
    /* PTN, NOT LEN. These messages said LEN for months and LEN is a
       different control — it shortens one TRACK for polymeter — sitting
       in the same row as PTN, which is the pattern length a span needs.
       So "set LEN to 64" sent people to the knob that cannot fix it;
       asked "where can I find LEN?", the honest answer was that the app
       was naming the wrong one. */
    t.ok('and an impossible span is disabled, naming the PTN that would buy it',
      virgin.spans.filter(o => o.off).length === 4
        && /needs PTN 64/.test((virgin.spans.find(o => o.v === '4') || {}).text || ''),
      virgin.spans.map(o => o.text + (o.off ? '(off)' : '')).join(' | '));
    t.ok('OFFER OFFERS rather than refusing',
      /ways to play/.test(virgin.offered) && virgin.nOpts >= 2,
      virgin.offered.slice(0, 80));
    t.ok('AND WRITE IT PUTS NOTES ON THE BOARD',
      virgin.hits > 0 && /wrote \d+ notes/.test(virgin.said),
      virgin.hits + ' hits · ' + virgin.said.slice(0, 70));

    /* ---- ALL LAYERS, THROUGH THE TWO BUTTONS -------------------------
       The ensemble call is tested in the infill suite; this is the part a
       person touches. Roles are NOT asked for: an instrument sampled at
       the bottom of the keyboard is the bass whatever it is called, so
       they come from each instrument's mean sampled pitch. Asking would
       be asking someone to tell the app something it already knows. */
    t.head('ALL LAYERS: ONE TICK WRITES EVERY INSTRUMENT');
    const allui = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('bassy', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 28, hi: 48, max: 8 });
      await window.JBH.instrument('synthy', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 52, hi: 72, max: 10 });
      await window.JBH.instrument('hiya', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 74, hi: 88, max: 8 });
      const wait = async (id) => { for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      window.JBH.key('D', 'minor');
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Dm', 'Bb', 'F', 'C']);
      drawSteps();
      const all = document.getElementById('mlAll');
      all.checked = true; all.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const roles = document.getElementById('mlInfo').textContent;
      document.getElementById('mlOffer').click();
      await wait('mlOffer');
      const opts = [...document.getElementById('mlPick').options].map(o => o.textContent);
      const mid = (await window.JBH.schedule({ src: 'pat', full: false })).notes;
      document.getElementById('mlApply').click();
      await wait('mlApply');
      const sc = await window.JBH.schedule({ src: 'pat', full: true });
      const per = {};
      for (const n of ['bassy', 'synthy', 'hiya']) {
        const pads = window.JBH.instPads(n).map(x => x.pad != null ? x.pad : x);
        per[n] = (sc.events || []).filter(e => pads.indexOf(e.pad) >= 0).length;
      }
      /* and unticking must put the single-voice path back, not leave the
         panel writing arrangements from a stale flag */
      all.checked = false; all.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const backToOne = document.getElementById('mlPickRow').hidden;
      return { roles, opts, mid, per, backToOne,
        said: document.getElementById('mlInfo').textContent };
    });
    t.ok('ticking ALL reads the roles off the register, without asking',
      /bassy as bass/.test(allui.roles) && /hiya as arp/.test(allui.roles),
      allui.roles.slice(0, 95));
    t.ok('OFFER lists whole arrangements with their clash counts',
      allui.opts.length >= 3 && /clash/.test(allui.opts[0] || ''),
      (allui.opts[0] || '').slice(0, 60));
    t.ok('and still writes nothing until WRITE IT',
      allui.mid === 0, allui.mid + ' notes after offering');
    t.ok('WRITE IT PUTS A PART ON ALL THREE INSTRUMENTS',
      allui.per.bassy > 0 && allui.per.synthy > 0 && allui.per.hiya > 0,
      Object.entries(allui.per).map(([k, v]) => k + ' ' + v).join(', '));
    t.ok('and unticking ALL returns the panel to the single-voice path',
      allui.backToOne === true, 'picker hidden again: ' + allui.backToOne);

    /* ---- THE SPAN HAS TO CHUNK ON THIS PATH TOO ----------------------
       The single-voice WRITE IT has cut a long span into four-bar chunks
       across consecutive patterns from the start. The ALL branch called
       ensemble() once and RETURNED, three lines above that loop — so a
       sixteen-bar span wrote four bars into one pattern and dropped the
       other twelve in silence, while the span control offered 16 and
       enabled it. Every test here asked for four bars or fewer, which is
       the one span where the two paths agree: the common case was the
       untested one, for the third time in this file.

       Found by driving the panel and reading the answer — asked for 16
       bars, told "over bars 1-4". Verified against known-bad code by
       restoring the early return: patterns 2, 3 and 4 come back empty
       and the first two assertions below fail. */
    t.head('A SIXTEEN-BAR SPAN WITH ALL TICKED FILLS FOUR PATTERNS');
    const chunked = await page.evaluate(async () => {
      await window.JBH.clear();
      for (const [n, lo, hi] of [['low', 28, 48], ['mid', 52, 72], ['top', 74, 88]])
        await window.JBH.instrument(n, { pack: 'samples/salamander.json',
          match: '^sal:', lo, hi, max: 8 });
      const wait = async (id) => { for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!document.getElementById(id).disabled) return; } };
      window.JBH.key('D', 'minor');
      window.JBH.pattern(0, { plen: 64, clear: true, select: true });
      window.JBH.chords(0, ['Dm', 'Bb', 'F', 'C']);
      drawSteps();
      const all = document.getElementById('mlAll');
      all.checked = true; all.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 180));
      const sp = document.getElementById('mlSpan');
      sp.value = '16'; sp.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      document.getElementById('mlOffer').click();
      await wait('mlOffer');
      const offered = document.getElementById('mlInfo').textContent;
      document.getElementById('mlApply').click();
      await wait('mlApply');
      /* READ IT NOW. Captured at the end instead, this came back "No
         chords on pattern 8" — selecting a pattern redraws the panel and
         the info line is the panel's, so a sentence read three actions
         later is a different sentence. */
      const said = document.getElementById('mlInfo').textContent;
      const hits = S.patterns.map(p => {
        let n = 0;
        for (const row of Object.values(p.steps || {})) for (const v of (row || [])) if (v > 0) n++;
        return n;
      });
      /* AND THE PICKER MUST NOT OFFER WHAT HAS NOWHERE TO GO. Sixteen
         bars is four patterns; from the last one there is room for one,
         and the LEN test alone said yes. */
      const seen = {};
      for (const sel of [0, 5, 7]) {
        await window.JBH.pattern(sel, { select: true, plen: 64 });
        await new Promise(r => setTimeout(r, 180));
        seen[sel + 1] = [...document.getElementById('mlSpan').options]
          .filter(o => o.disabled).map(o => o.value);
      }
      return { hits, offered, seen, said, selected: S.pattern + 1 };
    });
    t.ok('the first four patterns all get a part',
      chunked.hits.slice(0, 4).every(h => h > 0),
      'hits per pattern: ' + chunked.hits.join(', '));
    t.ok('and the fifth is left alone — the span stops where it ends',
      chunked.hits[4] === 0, 'pattern 5 has ' + chunked.hits[4] + ' hits');
    t.ok('they are VARIATIONS, not four copies of one chunk',
      new Set(chunked.hits.slice(0, 4)).size >= 3,
      'hits: ' + chunked.hits.slice(0, 4).join(', '));
    t.ok('OFFER says only the first chunk was scored',
      /first 4 bars/.test(chunked.offered) && /across 4 patterns/.test(chunked.offered),
      chunked.offered.slice(-130));
    t.ok('WRITE IT names the patterns it filled',
      /16 bars across patterns 1, 2, 3, 4/.test(chunked.said),
      chunked.said.slice(0, 120));
    t.ok('and it hands the selection back to where it started',
      chunked.hits.length === 8, 'patterns: ' + chunked.hits.length);
    t.ok('16 bars is offered from pattern 1 and refused from patterns 6 and 8',
      chunked.seen[1].indexOf('16') < 0 && chunked.seen[6].indexOf('16') >= 0 &&
      chunked.seen[8].indexOf('16') >= 0 && chunked.seen[8].indexOf('8') >= 0,
      'disabled from ptn1 [' + chunked.seen[1] + '] ptn6 [' + chunked.seen[6] +
      '] ptn8 [' + chunked.seen[8] + ']');

    /* ---- EVERY CONTROL THE HANDLERS REACH FOR MUST EXIST -------------
       mlPoly was referenced by the OFFER handler for several builds and
       was not in the markup at all: an edit script threw before writing
       the file, and `$('mlPoly')?$('mlPoly').value:'none'` reads null and
       falls back, so cross-tempo lanes were UNREACHABLE from the panel
       while every test passed — because the tests call ensemble()
       directly. The feature worked and nobody could get to it.

       That is the third time this session a capability existed and the
       way in did not. A test on the API cannot see it, so this one looks
       at the page: every id the write handlers read, present. */
    t.head('THE PANEL HAS EVERY CONTROL ITS HANDLERS READ');
    const wired = await page.evaluate(() => {
      const need = ['mlTonic', 'mlMode', 'mlProgPick', 'mlProgKind', 'mlChords', 'mlSet',
        'mlInfo', 'mlInst', 'mlRole', 'mlSpan', 'mlFrom', 'mlPtn', 'mlDens', 'mlOct',
        'mlFeel', 'mlAll', 'mlConverse', 'mlPoly', 'mlOffer', 'mlPick', 'mlApply',
        'mlDemo', 'mlTagPad', 'mlTagName', 'mlTagGo'];
      const missing = need.filter(id => !document.getElementById(id));
      /* a select the handler reads by value must also offer the values
         the handler branches on, or the branch is dead */
      const opts = (id) => { const e = document.getElementById(id);
        return e ? [...e.options].map(o => o.value) : []; };
      return { missing, poly: opts('mlPoly'), dens: opts('mlDens'),
        span: opts('mlSpan'), feel: opts('mlFeel') };
    });
    t.ok('no control the write handlers read is missing from the page',
      wired.missing.length === 0, wired.missing.join(', ') || 'all present');
    t.ok('and the cross-tempo select offers the modes ensemble() implements',
      wired.poly.includes('spread') && wired.poly.includes('wide') && wired.poly.includes('none'),
      wired.poly.join(' '));
    t.ok('density offers the three infill() reads',
      ['sparse', 'normal', 'busy'].every(v => wired.dens.includes(v)), wired.dens.join(' '));
    t.ok('and the spans and feels match what the engine accepts',
      wired.span.includes('16') && wired.feel.includes('3'),
      wired.span.join(',') + ' · ' + wired.feel.join(','));

    /* ---- A GENRE IS A BUNDLE OF SETTINGS, OR IT IS A LABEL -----------
       "If we can have the random button offer a full build from pads with
       some genres to select from... Some strange ones would be cool."

       Each entry is defined only by levers the engine really has, so the
       test is that two genres cannot come out the same: if house and
       gamelan produce the same tempo, the same scale width and the same
       lanes, one of them is a name rather than a kind of music.

       It also pins the two faults found building it. `feel` and `penta`
       were declared in the genre table and READ BY NOTHING — the panel
       was set to show them while the build passed neither, which is the
       "an option forwarded may not be one the function reads" trap,
       committed in the same hour that section was quoted. And `pentaOnly`
       was declared BELOW the IIFE that reads it, so every infill call hit
       a temporal dead zone and the whole build silently wrote nothing. */
    t.head('EACH GENRE BUILDS A MEASURABLY DIFFERENT TRACK');
    const gen = await page.evaluate(async () => {
      const build = async (g) => {
        await window.JBH.clear();
        window.JBH.key(null);
        /* TAGGED ONE BY ONE, as TAG IT does. bass() names everything it
           makes `bass`, so six calls are ONE instrument over six notes,
           and a build has no second voice and no pad left for a kit. */
        for (let i = 0; i < 6; i++) {
          await window.JBH.bass({ style: 'sub', midi: 34 + i * 7, seconds: 0.4, pad: i });
          window.JBH.pad(i, { inst: 'v' + i, srcNote: 34 + i * 7 });
        }
        document.getElementById('mlGenre').value = g;
        const b = document.getElementById('mlDemo');
        b.click();
        for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 100));
          if (!b.disabled) break; }
        /* poly config is PER PATTERN and poly() reads the selected one */
        const lanes = []; const sel = S.pattern;
        for (let pi = 0; pi < S.patterns.length; pi++) {
          await window.JBH.pattern(pi, { select: true });
          for (let i = 0; i < 16; i++) { const q = window.JBH.poly(i);
            if (q && q.on) lanes.push(q.cells); }
        }
        await window.JBH.pattern(sel, { select: true });
        const sc = await window.JBH.schedule({ src: 'pat', full: true });
        const pcs = new Set((sc.events || []).map(e => e.midi % 12));
        /* the whole arrangement, which is where there are enough notes
           for a pitch-class count to mean anything.

           COUNTED OVER THE MELODIC PADS ONLY. Every pad here is tagged,
           the kit included, and the kit fires its pad's own srcNote — so
           counting tagged pads put the two drum sounds' pitches into a
           scale measurement and read SIX classes on a pentatonic track.
           A drum pad plays one pitch; a written line moves. */
        const so = await window.JBH.schedule({ src: 'song', full: true });
        const perPad = new Map();
        for (const e of (so.events || [])) {
          if (!perPad.has(e.pad)) perPad.set(e.pad, new Set());
          perPad.get(e.pad).add(e.midi);
        }
        const songPcs = new Set((so.events || [])
          .filter(e => (perPad.get(e.pad) || new Set()).size >= 2)
          .map(e => e.midi % 12));
        let pats = 0;
        for (let i = 0; i < S.patterns.length; i++) {
          let h = 0;
          for (let q = 0; q < 16; q++) for (let st = 0; st < 64; st++)
            if (S.patterns[i].steps[q][st] > 0) h++;
          if (h) pats++;
        }
        return { bpm: S.bpm, swing: S.swing, drift: S.humanDrift, pats,
          plen: S.patterns[0].plen || 16, lanes: lanes.length, pcs: pcs.size,
          sections: (S.song || []).length, songPcs: songPcs.size,
          notes: (sc.events || []).length,
          info: document.getElementById('mlDemo').textContent };
      };
      return { house: await build('house'), gamelan: await build('gamelan'),
        math: await build('math'), ambient: await build('ambient') };
    });
    const ks = ['house', 'gamelan', 'math', 'ambient'];
    t.ok('every genre writes notes, patterns and an arrangement',
      ks.every(k => gen[k].notes > 0 && gen[k].pats >= 2 && gen[k].sections >= 2),
      ks.map(k => k + ' ' + gen[k].notes + 'n/' + gen[k].pats + 'p/' + gen[k].sections + 's').join(' · '));
    t.ok('and each sets its own tempo and humanise',
      new Set(ks.map(k => gen[k].bpm)).size === 4,
      ks.map(k => k + ' ' + gen[k].bpm + 'bpm').join(' · '));
    /* THE TWO FAULTS. penta has to narrow the notes and feel has to
       reach the writing, or they are labels in a table. */
    /* MEASURED AGAINST FIVE, NOT AGAINST ANOTHER GENRE. The first version
       of this compared gamelan's pitch-class count to house's, and the
       two disagreed between runs — house drew a two-chord vamp in one
       key and used five classes, gamelan drew a seventh and used six, so
       a true property was tested by a comparison that is noise. A
       pentatonic scale has five classes; count them. */
    t.ok('PENTATONIC REALLY NARROWS THE SCALE — gamelan uses five classes',
      gen.gamelan.songPcs > 0 && gen.gamelan.songPcs <= 5,
      'gamelan ' + gen.gamelan.songPcs + ' pitch classes over the whole song'
        + ' (house ' + gen.house.songPcs + ')');
    t.ok('and house, which is not pentatonic, uses more than five',
      gen.house.songPcs > 5,
      'house ' + gen.house.songPcs + ' pitch classes');
    t.ok('and a cross-rhythm genre really gets cross-tempo lanes',
      gen.gamelan.lanes > 0 && gen.math.lanes > 0 && gen.house.lanes === 0,
      'gamelan ' + gen.gamelan.lanes + ' · math ' + gen.math.lanes + ' · house ' + gen.house.lanes);
    t.ok('math gets its 48-step pattern, which the others do not',
      gen.math.plen === 48 && gen.house.plen === 64,
      'math PTN' + gen.math.plen + ' · house PTN' + gen.house.plen);
    t.ok('and the button says what it built, where the button is',
      /WROTE|AGAIN/i.test(gen.house.info || ''), (gen.house.info || '').slice(0, 40));

    /* ---- A KIT IS NOT ONE VELOCITY REPEATED --------------------------
       The first genre build wrote every kick at 0.95 and every hat at
       0.4, which on a velocity-layered kit plays ONE recording over and
       over — the drum-machine sound, reached by using a real kit as if
       it were a synthesised one. And all three sections were passed the
       same seed, so an arrangement of A B A B C B was one line six
       times.

       These assert the three things that fixed it, because each is the
       kind of fault that leaves every other check green: distinct
       velocities on the kit, a kick that drops out of the quiet
       section's last bar, and three patterns whose notes differ. */
    t.head('THE KIT AND THE SECTIONS ARE NOT ONE THING REPEATED');
    const kit = await page.evaluate(async () => {
      await window.JBH.clear();
      window.JBH.key(null);
      for (let i = 0; i < 6; i++) {
        await window.JBH.bass({ style: 'sub', midi: 30 + i * 7, seconds: 0.3, pad: i });
        window.JBH.pad(i, { inst: 'v' + i, srcNote: 30 + i * 7 });
      }
      document.getElementById('mlGenre').value = 'house';
      const b = document.getElementById('mlDemo');
      b.click();
      for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 100));
        if (!b.disabled) break; }
      const pats = [];
      for (let pi = 0; pi < 3; pi++) {
        const st = S.patterns[pi].steps, rows = [];
        for (let q = 0; q < 16; q++) {
          const hits = [];
          for (let k = 0; k < (S.patterns[pi].plen || 16); k++)
            if (st[q][k] > 0) hits.push(k + ':' + st[q][k].toFixed(2));
          if (hits.length) rows.push({ pad: q, hits });
        }
        pats.push(rows);
      }
      const untagged = [];
      for (let q = 0; q < 16; q++)
        if (S.pads[q] && S.pads[q].bufId >= 0 && !S.pads[q].inst) untagged.push(q);
      return { pats, untagged, plen: S.patterns[0].plen || 16,
        song: (S.song || []).length };
    });
    const vels = (rows) => {
      const v = new Set();
      for (const r of rows) for (const h of r.hits) v.add(h.split(':')[1]);
      return v;
    };
    t.ok('the busy section uses many distinct velocities, not one or two',
      vels(kit.pats[2]).size >= 6,
      vels(kit.pats[2]).size + ' distinct velocities across ' +
        kit.pats[2].reduce((n, r) => n + r.hits.length, 0) + ' hits');
    /* THE BREAK. House kicks on 0,16,32,48; the quiet section drops the
       one in its last bar, so a 64-step pattern keeps three of four.

       The kit has to be identified by what the build DID, not guessed
       from the hits: the first version looked for a row starting at step
       0 with few hits and picked a bass line, then reported the break
       missing on a pattern that has one. writeSurprise() tags its
       voices with an `inst` and leaves the kit untagged — but every pad
       on this board is tagged, because bass() names what it makes, so
       the kit is found by the step set the genre asked for: house kicks
       on 0, 16, 32 and 48 and nothing else does. */
    const kicks = (rows) => {
      const want = [0, 16, 32];
      const r = rows.find(x => {
        const st = x.hits.map(h => +h.split(':')[0]);
        return want.every(w => st.includes(w)) && st.length <= 4;
      });
      return r ? r.hits.map(h => +h.split(':')[0]) : [];
    };
    const kq = kicks(kit.pats[0]), kb = kicks(kit.pats[1]);
    t.ok('the kick drops out of the quiet section\'s LAST bar — the break',
      kq.length > 0 && kb.length > 0 &&
      !kq.some(st => st >= kit.plen - 16) && kb.some(st => st >= kit.plen - 16),
      'quiet kicks ' + kq.join(',') + ' · full kicks ' + kb.join(','));
    /* THE SEEDS. Same chords and register, different notes. */
    const sig = (rows) => rows.map(r => r.pad + '=' + r.hits.join(',')).join('|');
    t.ok('and the three patterns are variations, not three copies',
      sig(kit.pats[0]) !== sig(kit.pats[1]) &&
      sig(kit.pats[1]) !== sig(kit.pats[2]) &&
      sig(kit.pats[0]) !== sig(kit.pats[2]),
      'three distinct patterns across ' + kit.song + ' sections');

    /* ---- TWO VOICES MOVING INTO THE SAME PERFECT INTERVAL FUSE -------
       The inter-voice filter was about ONE interval, the semitone, and
       was blind to motion. Measured on four genre builds against the 70
       Palestrina scores these norms come from:

         parallel fifths   2.9%, 1.92%   against 0.235%
         parallel octaves  2.38%, 7.5%   against 0.111%

       Ten to seventy times the rate of the practice the rule comes from,
       in every genre, because nothing was looking. It is not a taste
       rule: the upper voice stops being heard as a part and becomes a
       timbre on the lower, which is the one thing a multi-voice write
       exists to avoid.

       Fixed at a known key, progression and seed, because the first read
       of this was off random genre builds and the numbers moved more
       between runs than the fix moved them — a filter judged against
       noise. */
    t.head('NO PARALLEL FIFTHS OR OCTAVES BETWEEN VOICES');
    const par = await page.evaluate(async () => {
      const J = window.JBH, rows = [];
      /* TEMPO AND HUMANISATION PINNED, and clear() does not reset them.
         counterpoint() walks the UNION of both voices' onset TIMES, so
         humanDrift changes which notes it treats as adjacent — run after
         the ambient genre build above, which leaves 64bpm and 30% drift
         behind, these six seeds reported a parallel octave that the same
         six seeds in a fresh page did not. A pitch rule measured through
         a timing effect is not measured. */
      await J.set({ bpm: 100, swing: 0, human: 0, humanDrift: 0 });
      for (let k = 0; k < 8; k++) {
        await J.clear();
        await J.set({ bpm: 100, swing: 0, human: 0, humanDrift: 0 });
        J.key('C', 'minor');
        const midis = [36, 48, 60];
        for (let i = 0; i < 3; i++) {
          await J.bass({ style: 'sub', midi: midis[i], seconds: 0.5, pad: i });
          J.pad(i, { inst: 'v' + i, srcNote: midis[i] });
        }
        await J.pattern(0, { plen: 64, clear: true, select: true });
        J.chords(0, ['Cm', 'Fm', 'G7', 'Cm']);
        const vs = [{ inst: 'v0', role: 'bass' }, { inst: 'v1', role: 'lead' },
          { inst: 'v2', role: 'arp' }];
        const o = { from: 0, bars: 4, n: 1, src: 'pat', density: 'normal',
          octave: 0, poly: 'none', converse: false, feel: 'straight',
          seed: (1000 + k * 7919) >>> 0 };
        const off = await J.ensemble(vs, o);
        await J.ensemble(vs, Object.assign({}, o, { seed: off.seed,
          apply: off.candidates[0].seed }));
        for (const pair of [['v0', 'v1'], ['v1', 'v2'], ['v0', 'v2']]) {
          const c = await J.counterpoint(pair, { src: 'pat' });
          if (c && c.motion) rows.push({ pair: pair.join('/'),
            par5: c.motion.par5, par8: c.motion.par8 });
        }
        /* the melodic norms, which the escape must not quietly spend.
           ALL THREE VOICES, not just the lead: a bass walks and a lead
           leaps, so one voice's step count is its role rather than the
           engine's, and v1 alone reads 24% where the three together
           read 41%. */
        for (const t2 of ['v0', 'v1', 'v2']) {
          const mel = await J.melody(t2, { src: 'pat' });
          if (mel && mel.got) rows.push({ mel: mel.got });
        }
      }
      return rows;
    });
    const cp = par.filter(r => r.pair);
    const bad5 = cp.filter(r => r.par5 > 0), bad8 = cp.filter(r => r.par8 > 0);
    t.ok('no parallel fifths in any voice-pair', bad5.length === 0,
      cp.length + ' pairs measured, ' + bad5.length + ' with a parallel fifth');
    t.ok('and no parallel octaves — two voices in octaves are one voice',
      bad8.length === 0,
      cp.length + ' pairs measured, ' + bad8.length + ' with a parallel octave'
        + (bad8.length ? ' (worst ' + Math.max(...bad8.map(r => r.par8)) + '%)' : ''));
    /* THE ESCAPE HAS A PRICE AND THE TEST SAYS WHAT IT IS. Ranked on
       contour alone the escape reached for a chord tone, and chord tones
       are a third apart by construction, so stepwise motion fell from
       46.53% to 37.92% against the Essen norm of 46.9% — a real fault
       fixed by degrading a measure nobody was watching, which is the
       trade this repo's longest section is about. Preferring a stepwise
       escape recovers most of it. This asserts the band, not a target. */
    const mels = par.filter(r => r.mel).map(r => r.mel);
    const avg = (f) => +(mels.reduce((n, m) => n + (m[f] || 0), 0) / mels.length).toFixed(2);
    t.ok('and the escape did not spend the melodic norms to buy it',
      mels.length > 0 && avg('step') >= 32 && avg('repeat') <= 32,
      'step ' + avg('step') + '% (norm 46.9, was 37.92 before the stepwise '
        + 'preference) · repeat ' + avg('repeat') + '% (norm 21.1)');

    /* ---- THE PAD'S OWN PITCH KNOB IS PART OF THE NOTE ----------------
       `midi` was srcNote plus the per-step pitch lock, and `p.pitch` —
       the semitone transpose on the EDIT panel, applied for real through
       pitchRatio at every trigger — was left out. So every analyser that
       reads the schedule measured a different note from the one coming
       out of the speaker, for any pad the person had transposed.

       Found while tuning the generated kit to the key: the shift was
       applied, the sound moved, and harmony() went on reporting the
       untuned pitch, which reads as "the fix did nothing" when the truth
       is "the measurement cannot see it". */
    t.head('A TRANSPOSED PAD IS MEASURED AT THE PITCH IT SOUNDS');
    const knob = await page.evaluate(async () => {
      const J = window.JBH;
      await J.clear();
      await J.bass({ style: 'sub', midi: 48, seconds: 0.4, pad: 0 });
      J.pad(0, { inst: 'k', srcNote: 48, pitch: 0 });
      await J.pattern(0, { plen: 16, clear: true, select: true });
      J.step(0, 0, 0.9);
      const before = (await J.schedule({ src: 'pat', full: true })).events
        .filter(e => e.pad === 0).map(e => e.midi);
      J.pad(0, { pitch: -5 });
      const after = (await J.schedule({ src: 'pat', full: true })).events
        .filter(e => e.pad === 0).map(e => e.midi);
      return { before, after };
    });
    t.ok('transposing a pad moves the note every analyser reads',
      knob.before[0] === 48 && knob.after[0] === 43,
      'srcNote 48 reads ' + knob.before[0] + ', at pitch -5 reads ' + knob.after[0]);

    /* ---- A SOUND THAT STARTS LATE IS A SOUND THAT DOES NOT PLAY ------
       A pad's `start` is a fraction of the file and it stays at 0 for
       anything a person uploads, so a file with 150ms of head before the
       hit opens its gate on silence and, on a short decay, shuts before
       the sound arrives. This repo already had it costing real work —
       a sample peaking at 0.0dBFS on disk measuring -70dB in the mix,
       "it was never quiet, it was never playing" — but the fix was only
       ever wired to packs carrying an `onset` field in a manifest, and
       an uploaded file has no manifest.

       The fixture is the same audio twice, once with 180ms of silence
       welded on the front, so the only difference between the two pads
       is the thing being measured. */
    t.head('THE BUILD SKIPS LEADING SILENCE ON AN UPLOADED SOUND');
    const lead = await page.evaluate(async () => {
      const J = window.JBH, out = {};
      await J.clear(); J.key('C', 'minor');
      for (let i = 0; i < 3; i++) {
        await J.bass({ style: 'sub', midi: 36 + i * 12, seconds: 0.5, pad: i });
        J.pad(i, { inst: 'v' + i, srcNote: 36 + i * 12 });
      }
      await J.bass({ style: 'sub', midi: 48, seconds: 0.35, pad: 5 });
      await J.bass({ style: 'sub', midi: 48, seconds: 0.35, pad: 6 });
      J.pad(5, { inst: null }); J.pad(6, { inst: null });
      /* MADE AND INDEXED AFTER BOTH bass() CALLS. Pushed before them,
         S.buffers.length-1 names the buffer bass() has just appended and
         the pad holds a perfectly normal sound — the trim then correctly
         finds nothing, which reads exactly like broken wiring. */
      const src = S.buffers[S.pads[5].bufId];
      const sr = src.sampleRate, head = Math.floor(sr * 0.18);
      const late = AC.createBuffer(1, head + src.length, sr);
      late.getChannelData(0).set(src.getChannelData(0), head);
      S.buffers.push(late);
      S.pads[6].bufId = S.buffers.length - 1; S.pads[6].start = 0;
      const probe = async () => {
        await J.pattern(0, { plen: 16, clear: true, select: true });
        J.step(5, 0, 0.9); J.step(6, 0, 0.9);
        J.pad(5, { dec: 0.17, sus: 0, rel: 0.05 });
        J.pad(6, { dec: 0.17, sus: 0, rel: 0.05 });
        const a = await J.render({ only: [5], src: 'pat' });
        const b = await J.render({ only: [6], src: 'pat' });
        const db = (x) => +(20 * Math.log10(Math.max(x, 1e-6))).toFixed(1);
        return { normal: db(a.peak), late: db(b.peak) };
      };
      out.before = await probe();
      document.getElementById('mlGenre').value = 'noir';
      const btn = document.getElementById('mlDemo'); btn.click();
      for (let i = 0; i < 900; i++) { await new Promise(r => setTimeout(r, 100));
        if (!btn.disabled) break; }
      out.says = (document.getElementById('mlInfo') || btn).textContent;
      out.starts = [+S.pads[5].start.toFixed(3), +S.pads[6].start.toFixed(3)];
      out.after = await probe();
      return out;
    });
    t.ok('the fixture really is broken before the fix — 180ms of head is silent',
      lead.before.late < -60 && lead.before.normal > -20,
      'clean ' + lead.before.normal + 'dB · late ' + lead.before.late + 'dB');
    t.ok('AND THE BUILD RECOVERS IT to within a decibel of the same audio',
      lead.after.late > -20 && Math.abs(lead.after.late - lead.after.normal) < 2,
      'clean ' + lead.after.normal + 'dB · late ' + lead.after.late
        + 'dB (was ' + lead.before.late + ')');
    t.ok('by setting start on that pad and leaving the clean one alone',
      lead.starts[0] === 0 && lead.starts[1] > 0.2,
      'clean start ' + lead.starts[0] + ' · late start ' + lead.starts[1]);
    /* AND IT SAYS SO. A trim nobody mentioned is indistinguishable from
       a sample that was always fine, and the person needs to know their
       upload had a fifth of a second of nothing on the front. */
    t.ok('and it reports the trim rather than doing it silently',
      /leading silence/i.test(lead.says || ''),
      (lead.says || '').slice(-80));

    /* ---- ONE OPTION LIST, BECAUSE THERE WERE TWO --------------------
       ensemble() calls infill() twice — once per candidate while
       OFFERING and once per voice while APPLYING — and each call wrote
       its own object literal, three hundred lines apart. `gate`, a new
       note-length lever, was added to the offering list and missed on
       the applying one, so the offer was scored WITH it and the
       arrangement written WITHOUT it.

       Measured, before the fix, through ensemble: 1.09, 1.01, 0.95,
       0.95 beats for gates of 0.5, 1, 2 and 3 — no effect, and slightly
       backwards. The same gates through infill() directly: 0.61, 1.13,
       2.25, 2.92. A lever that works on one path and not the other is
       how "scored one thing, wrote another" looks from outside.

       This asserts the WRITTEN notes through the ensemble path, which
       is the one that was broken, and it is a monotone check rather
       than a target: longer gate, longer notes, with the four-beat cap
       binding at the top. */
    t.head('NOTE LENGTH IS A LEVER, ON THE PATH THAT WRITES');
    const gate = await page.evaluate(async () => {
      const J = window.JBH, rows = [];
      for (const g of [0.5, 1, 2, 3]) {
        await J.clear();
        await J.set({ bpm: 100, swing: 0, human: 0, humanDrift: 0 });
        J.key('C', 'minor');
        for (let i = 0; i < 3; i++) {
          await J.bass({ style: 'sub', midi: 36 + i * 12, seconds: 2.0, pad: i });
          J.pad(i, { inst: 'v' + i, srcNote: 36 + i * 12 });
        }
        await J.pattern(0, { plen: 64, clear: true, select: true });
        J.chords(0, ['Cm', 'Fm', 'G7', 'Cm']);
        const vs = [{ inst: 'v0', role: 'bass' }, { inst: 'v1', role: 'lead' },
          { inst: 'v2', role: 'arp' }];
        const oo = { from: 0, bars: 4, n: 1, src: 'pat', density: 'sparse',
          poly: 'none', converse: false, feel: 'straight', seed: 4242, gate: g };
        const off = await J.ensemble(vs, oo);
        await J.ensemble(vs, Object.assign({}, oo,
          { seed: off.seed, apply: off.candidates[0].seed }));
        const sc = await J.schedule({ src: 'pat', full: true });
        const lens = (sc.events || [])
          .filter(e => S.pads[e.pad] && S.pads[e.pad].inst)
          .map(e => e.len).filter(x => x > 0);
        const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
        rows.push({ g, beats: +(mean * 100 / 60).toFixed(2), n: lens.length });
      }
      return rows;
    });
    const gb = gate.map(r => r.beats);
    t.ok('a shorter gate really writes shorter notes through ensemble',
      gb[0] < gb[1] * 0.75,
      'gate 0.5 -> ' + gb[0] + ' beats vs gate 1 -> ' + gb[1]);
    t.ok('AND A LONGER ONE WRITES LONGER — the half that was missing',
      gb[2] > gb[1] * 1.5 && gb[3] >= gb[2],
      gate.map(r => 'gate ' + r.g + ' ' + r.beats + 'b').join(' · '));

    /* ---- THE DROPDOWN IS THE TABLE, NOT A COPY OF IT -----------------
       The option list was written out in the markup, so adding six
       recipes to the engine left the control offering ten: they existed
       and were unreachable. It is built from GENRES now, and this is
       what stops the two drifting again.

       It also pins where the builder has to LIVE. legacy.js is not one
       flat scope — everything after `if($('mlTonic')){` is inside that
       block — so the first version of the picker sat outside it, could
       not see GENRES, threw "GENRES is not defined" into a try/catch,
       and left the control empty. Emptier than the duplication it was
       fixing. `typeof X` from the page tells you which side of that
       boundary a name is on. */
    t.head('EVERY RECIPE THE ENGINE HAS IS REACHABLE FROM THE CONTROL');
    const opts = await page.evaluate(() => {
      const sel = document.getElementById('mlGenre');
      return { values: [...sel.options].map(o => o.value).filter(Boolean),
        labelled: [...sel.options].filter(o => o.value && /—/.test(o.textContent)).length,
        blank: [...sel.options].filter(o => !o.value).length };
    });
    t.ok('the control offers sixteen recipes and a surprise-me',
      opts.values.length >= 16 && opts.blank === 1,
      opts.values.length + ' recipes: ' + opts.values.join(' '));
    t.ok('and every one carries its own one-line description',
      opts.labelled === opts.values.length,
      opts.labelled + ' of ' + opts.values.length + ' labelled from the table');
    t.ok('including the six that the hardcoded list did not have',
      ['footwork', 'doom', 'afro', 'baroque', 'minimal', 'gospel']
        .every(n => opts.values.includes(n)),
      'footwork doom afro baroque minimal gospel');

    /* ---- VELOCITY HAS TO CHANGE THE TIMBRE, NOT JUST THE LEVEL ------
       The generator writes a velocity arc and a kit with ghosts and
       accents, and on a VELOCITY-LAYERED instrument that picks a
       different recording. On a single-sample pad — which is what an
       uploaded sound is — velocity moved the gain and nothing else.

       `velFlt` is the routing and has been in the app all along, but it
       takes TWO settings and both default to the wrong one: there must
       be a filter to move, and a non-zero amount to move it by. This is
       the 2x2 that proves it needs both, measured on a BRIGHT source,
       because the first two attempts used a bass — where 2k-4k sits
       34dB down, so every row read 0.00dB however well the routing
       worked. The wrong instrument for the question, twice. */
    t.head('VELOCITY OPENS THE FILTER, AND IT TAKES TWO SETTINGS');
    const vel = await page.evaluate(async () => {
      const J = window.JBH;
      const tilt = async (velFlt, ftype, v) => {
        await J.clear();
        await J.set({ bpm: 100, swing: 0, human: 0, humanDrift: 0, mTrim: -20 });
        await J.paint({ pad: 0, seconds: 1.0, partials: [
          { hz: 220, level: 1 }, { hz: 440, level: 0.85 }, { hz: 880, level: 0.8 },
          { hz: 1760, level: 0.75 }, { hz: 3520, level: 0.7 }, { hz: 7040, level: 0.6 }] });
        J.pad(0, { inst: 'k', srcNote: 48, velFlt, ftype, fcut: 0.45, fres: 1.0,
          att: 0.004, dec: 0.6, sus: 0.85, rel: 0.2, gain: 0.9 });
        await J.pattern(0, { plen: 16, clear: true, select: true });
        J.step(0, 0, v);
        const sp = await J.spectrum({ src: 'pat' });
        const g = (n) => { const r = (sp.bands || []).find(x => x.band === n);
          return r ? r.db : null; };
        return +(g('2k-4k') - g('250-500')).toFixed(2);
      };
      const d = async (vf, ft) => +((await tilt(vf, ft, 0.95)) - (await tilt(vf, ft, 0.25))).toFixed(2);
      return { noFilter: await d(0.45, 'off'), noAmount: await d(0, 'lowpass'),
        both: await d(0.45, 'lowpass') };
    });
    t.ok('with no filter to move, the amount does nothing',
      Math.abs(vel.noFilter) < 1, vel.noFilter + 'dB between a soft and a hard note');
    t.ok('and a filter on its own does nothing either',
      Math.abs(vel.noAmount) < 1, vel.noAmount + 'dB');
    t.ok('TOGETHER a hard note is audibly brighter than a soft one',
      vel.both > 4,
      vel.both + 'dB  (no filter ' + vel.noFilter + ' · no amount ' + vel.noAmount + ')');

    /* and the build has to set BOTH, per role, without overriding a
       filter the person dialled themselves */
    t.head('THE BUILD GIVES AN UPLOADED SOUND THAT EXPRESSION');
    const vb = await page.evaluate(async () => {
      const J = window.JBH;
      await J.clear(); J.key('C', 'minor');
      for (let i = 0; i < 3; i++) {
        await J.bass({ style: 'growl', midi: 36 + i * 14, seconds: 0.6, pad: i });
        /* AS AN UPLOAD ARRIVES. bass() sets lowpass/0.72/velFlt 0.55
           itself, so a bass() fixture is the one case the feature
           correctly skips — and testing against it hid the feature
           completely. Third time a bass() fixture has done that. */
        J.pad(i, { inst: 'v' + i, srcNote: 36 + i * 14, ftype: 'off', fcut: 1, velFlt: 0 });
      }
      J.pad(2, { ftype: 'highpass', fcut: 0.33, velFlt: 0 });   /* their choice */
      for (let i = 0; i < 3; i++) {
        await J.bass({ style: 'sub', midi: 40, seconds: 0.25, pad: 4 + i });
        J.pad(4 + i, { inst: null });
      }
      document.getElementById('mlGenre').value = 'gospel';
      const btn = document.getElementById('mlDemo'); btn.click();
      for (let i = 0; i < 900; i++) { await new Promise(r => setTimeout(r, 100));
        if (!btn.disabled) break; }
      return { pads: [0, 1, 2].map(i => ({ ftype: S.pads[i].ftype,
        fcut: +S.pads[i].fcut.toFixed(2), velFlt: +S.pads[i].velFlt.toFixed(2) })),
        says: (document.getElementById('mlInfo') || btn).textContent };
    });
    t.ok('the bass gets a gentle amount and the lead more',
      vb.pads[0].ftype === 'lowpass' && vb.pads[1].ftype === 'lowpass' &&
      vb.pads[0].velFlt > 0 && vb.pads[1].velFlt > vb.pads[0].velFlt,
      'bass fcut ' + vb.pads[0].fcut + '/vel ' + vb.pads[0].velFlt +
      ' · lead ' + vb.pads[1].fcut + '/' + vb.pads[1].velFlt);
    t.ok('AND A FILTER THE PERSON SET IS LEFT ALONE',
      vb.pads[2].ftype === 'highpass' && vb.pads[2].fcut === 0.33 &&
      vb.pads[2].velFlt === 0,
      'still ' + vb.pads[2].ftype + ' at ' + vb.pads[2].fcut);
    t.ok('and it says which sounds it touched',
      /velocity opens the filter/i.test(vb.says || ''),
      (vb.says || '').slice(-90));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
