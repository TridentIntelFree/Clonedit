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
       pattern's own LEN, because a stale "from bar 4" on a pattern that
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
    t.ok('a four-bar pattern offers four, rebuilt when LEN changes',
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
    t.ok('and an impossible span is disabled, naming the LEN that would buy it',
      virgin.spans.filter(o => o.off).length === 4
        && /needs LEN 64/.test((virgin.spans.find(o => o.v === '4') || {}).text || ''),
      virgin.spans.map(o => o.text + (o.off ? '(off)' : '')).join(' | '));
    t.ok('OFFER OFFERS rather than refusing',
      /ways to play/.test(virgin.offered) && virgin.nOpts >= 2,
      virgin.offered.slice(0, 80));
    t.ok('AND WRITE IT PUTS NOTES ON THE BOARD',
      virgin.hits > 0 && /wrote \d+ notes/.test(virgin.said),
      virgin.hits + ' hits · ' + virgin.said.slice(0, 70));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
