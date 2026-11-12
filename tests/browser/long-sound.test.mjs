/* A COPY OF A LONG SOUND IS NOT FREE, AND NOBODY WAS COUNTING THEM.

   Found while measuring why a multi-minute file takes the app down. The
   reversed copy and every time-stretched copy of a pad's sound are whole
   new buffers, cached, and nothing ever let go of one. KEEP TIME is on by
   default and its warm-up builds one stretch PER DISTINCT PITCH the pad's
   steps use, up to sixteen, each a synchronous pass over the entire sound.
   For a snare that is nothing. For a six-minute track it is two gigabytes,
   asked for by drawing the edit panel.

   So there is a budget, and two rules that differ by who asked: nothing
   built UNASKED may exceed a quarter of it, and something a person pressed
   a button for is built if it fits at all.

   The device is made to look like a small phone (deviceMemory 2, which is
   a 96MB budget and a 24MB ceiling on unasked copies) so that "long" is
   two minutes of mono rather than a fixture nobody wants in the repo.

   AND THE GUARD MUST NOT BECOME THE BUG. Every check on the long pad has a
   twin on an ordinary one, because a budget that also stopped a snare
   from holding its length would be this app's commonest feature broken to
   protect its rarest case. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, {
    viewport: { width: 430, height: 932 },
    initScript: () => { try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }); } catch (e) {} },
  });
  try {
    const setup = await page.evaluate(async () => {
      await JBH.clear();
      const sr = 48000;
      const mk = (secs, f) => { const b = mkAudioBuf(Math.round(sr * secs), sr, 1), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * f * i / sr); return b; };
      S.editPad = 0; loadIntoTarget(mk(135, 110), 'long', { keepTarget: true, noAsk: true });
      const lcdLong = document.getElementById('lcdmsg').textContent;
      S.editPad = 1; loadIntoTarget(mk(1.5, 220), 'short', { keepTarget: true, noAsk: true });
      const lcdShort = document.getElementById('lcdmsg').textContent;
      return { budgetMB: Math.round(derivedBudget() / 1048576),
        longMB: Math.round(bufBytes(S.buffers[S.pads[0].bufId]) / 1048576), lcdLong, lcdShort };
    });
    const held = () => page.evaluate(() => {
      const out = { rev: 0, spd: 0, bytes: 0 };
      for (const k in revCache) { out.rev++; out.bytes += bufBytes(revCache[k]); }
      for (const k in speedCache) { out.spd++; out.bytes += bufBytes(speedCache[k]); }
      out.mb = Math.round(out.bytes / 1048576); return out;
    });

    t.head('LOADING ONE SAYS WHAT IT COSTS, AND ONLY WHEN IT COSTS');
    t.ok('the long sound is announced as one, with its size',
      /A LONG SOUND/.test(setup.lcdLong) && /MB in memory/.test(setup.lcdLong),
      setup.lcdLong.slice(0, 90));
    t.ok('and an ordinary one is not lectured', !/LONG SOUND/.test(setup.lcdShort), setup.lcdShort.slice(0, 50));

    t.head('NOTHING BUILDS A COPY OF IT UNASKED');
    /* three pitched steps, which is what makes the warm-up want three
       stretches of the whole sound */
    const warm = await page.evaluate(async () => {
      const pat = S.patterns[S.pattern];
      for (const [st, semi] of [[0, 3], [4, 5], [8, 7]]) {
        pat.steps[0][st] = 0.9; pat.locks[0 + ':' + st] = { pitch: semi };
        pat.steps[1][st] = 0.9; pat.locks[1 + ':' + st] = { pitch: semi };
      }
      S.pads[0].pitch = 2; S.pads[1].pitch = 2;
      const long = warmKeepTime(0), short = warmKeepTime(1);
      ensureSpeedCaches();
      S.editPad = 0; drawEdit();
      const btnLong = document.getElementById('epKeepTime').textContent,
            onLong = document.getElementById('epKeepTime').classList.contains('on');
      S.editPad = 1; drawEdit();
      const btnShort = document.getElementById('epKeepTime').textContent,
            onShort = document.getElementById('epKeepTime').classList.contains('on');
      return { long, short, btnLong, onLong, btnShort, onShort };
    });
    let h = await held();
    t.ok('the warm-up built no stretch of the long sound', warm.long === 0, warm.long + ' built');
    t.ok('BUT STILL BUILT THEM FOR THE SHORT ONE — the guard did not become the bug', warm.short >= 3,
      warm.short + ' stretches for the short pad');
    t.ok('and what is held is the short pad’s, a fraction of a megabyte', h.mb <= 3,
      h.spd + ' stretches, ' + h.mb + 'MB of a ' + setup.budgetMB + 'MB budget');
    t.ok('THE CONTROL SAYS SO rather than sitting lit over a pad it is not holding',
      /TOO LONG/.test(warm.btnLong) && !warm.onLong, '"' + warm.btnLong + '", lit: ' + warm.onLong);
    t.ok('and reads normally on the pad where it does work', warm.btnShort === 'KEEP TIME' && warm.onShort,
      '"' + warm.btnShort + '", lit: ' + warm.onShort);

    t.head('WHAT SOMEBODY ASKS FOR IS STILL DONE, IF IT FITS');
    const asked = await page.evaluate(() => {
      const r = getReversed(S.pads[0].bufId);
      return { got: !!r, same: !!r && r.length === S.buffers[S.pads[0].bufId].length };
    });
    t.ok('REVERSE on the long sound makes its one copy', asked.got && asked.same,
      setup.longMB + 'MB sound, ' + setup.budgetMB + 'MB budget');

    t.head('AND THE TOTAL IS HELD, OLDEST OUT FIRST');
    const evict = await page.evaluate(() => {
      /* stand-ins the size of real copies: three 40MB entries into a 96MB
         budget cannot all stay */
      const fake = (mb, used) => ({ length: mb * 262144, numberOfChannels: 1, _used: used });
      for (const k in revCache) delete revCache[k];
      for (const k in speedCache) delete speedCache[k];
      speedCache.oldest = fake(40, 1); speedCache.middle = fake(40, 2);
      const ok = derivedRoom(40 * 1048576, false);
      const left = Object.keys(speedCache).sort();
      const tooBig = derivedRoom(200 * 1048576, false);       // more than the whole budget
      const autoBig = derivedRoom(30 * 1048576, true);        // over a quarter, unasked
      const autoSmall = derivedRoom(2 * 1048576, true);
      for (const k in speedCache) delete speedCache[k];
      return { ok, left, tooBig, autoBig, autoSmall };
    });
    t.ok('room is made by dropping the least recently used', evict.ok && evict.left.join() === 'middle',
      'kept: ' + evict.left.join(', '));
    t.ok('something bigger than the whole budget is refused outright', evict.tooBig === false, String(evict.tooBig));
    t.ok('an unasked copy over a quarter of it is refused', evict.autoBig === false, String(evict.autoBig));
    t.ok('and a small unasked one is not', evict.autoSmall === true, String(evict.autoSmall));

    /* EXPORT JSON is what the app tells you to press when the autosave has
       failed, so it is the one path that must work when things are already
       going badly — and it built the whole project as a single contiguous
       string, beside three other copies of the same audio. It is assembled
       from parts now. The only acceptable evidence that the new file is
       the old file is to produce both and compare them. */
    t.head('EXPORT JSON IS THE SAME FILE, BUILT IN PIECES');
    const ex = await page.evaluate(async () => {
      const whole = JSON.stringify(sessionFileDoc());
      const pieces = await sessionFileBlob().text();
      let parsed = null; try { parsed = JSON.parse(pieces); } catch (e) {}
      return { same: whole === pieces, mb: (pieces.length / 1048576).toFixed(1),
        bufs: parsed ? parsed.buffers.length : -1,
        firstDiff: whole === pieces ? -1 : [...whole].findIndex((c, i) => c !== pieces[i]) };
    });
    t.ok('byte for byte what the one-string version wrote', ex.same,
      ex.same ? ex.mb + 'MB, identical' : 'first difference at character ' + ex.firstDiff);
    t.ok('and it parses, with every buffer in it', ex.bufs >= 2, ex.bufs + ' buffers');

    /* The undo stack's own comment said sharing buffer references "costs
       pointers, not audio memory". True of a sound still in use. But undo
       exists to bring back what is NOT in use, so every sound that has
       been replaced stays alive in the entries that remember it, forty
       deep, and nothing counted that. */
    t.head('UNDO DOES NOT QUIETLY KEEP EVERY SOUND THAT WAS REPLACED');
    const un = await page.evaluate(async () => {
      const sr = 48000;
      const heldOnly = () => { const live = new Set(S.buffers), seen = new Set(); let n = 0;
        for (const e of undoStack) for (const b of e.bufs) if (b && !live.has(b) && !seen.has(b)) { seen.add(b); n += bufBytes(b); }
        return n; };
      commitUndo();
      /* six takes onto one pad, 25MB each: five of them end up held by
         history alone, which is more than the 96MB this device gets */
      for (let k = 1; k <= 6; k++) {
        const b = mkAudioBuf(sr * 135, sr, 1); b.getChannelData(0).fill(0.05 * k);
        S.editPad = 0; loadIntoTarget(b, 'take ' + k, { keepTarget: true, noAsk: true });
        commitUndo();
        /* what the autosave does 1.5s after each of these: the replaced
           take leaves the session here, and only history still has it */
        gcBuffers();
      }
      const big = { heldMB: Math.round(heldOnly() / 1048576), depth: undoStack.length,
        budgetMB: Math.round(derivedBudget() / 1048576),
        said: /Undo history shortened/.test(document.getElementById('projlog').textContent) };
      /* and it still works: one step back is the take before this one */
      undo();
      big.back = S.pads[0].name;
      /* THE TWIN. Ordinary sounds, replaced twice as many times, lose
         nothing — the limit is on megabytes, not on how much you may undo. */
      const d0 = undoStack.length;
      for (let k = 1; k <= 12; k++) {
        const b = mkAudioBuf(sr, sr, 1); b.getChannelData(0).fill(0.01 * k);
        S.editPad = 1; loadIntoTarget(b, 'hit ' + k, { keepTarget: true, noAsk: true });
        commitUndo();
      }
      return { big, smallGrew: undoStack.length - d0 };
    });
    t.ok('the audio held by history alone stays inside the budget', un.big.heldMB <= un.big.budgetMB,
      un.big.heldMB + 'MB held, budget ' + un.big.budgetMB + 'MB, ' + un.big.depth + ' steps kept');
    t.ok('some history survives — it is shortened, not thrown away', un.big.depth >= 1, un.big.depth + ' steps');
    t.ok('and it says so in the project log', un.big.said, 'logged: ' + un.big.said);
    t.ok('UNDO still steps back one take', un.big.back === 'take 5', 'pad reads "' + un.big.back + '"');
    t.ok('twelve ordinary replacements keep all twelve steps', un.smallGrew === 12, un.smallGrew + ' steps added');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
