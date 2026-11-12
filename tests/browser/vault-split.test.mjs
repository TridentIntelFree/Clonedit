/* A LONG TRACK IS SAVED ONCE, NOT ON EVERY EDIT.

   Reported: "the app crashes when a large file is loaded. A multiple
   minute full track."

   Decoding it was never the fault. The session document carried every
   sample inline, so an autosave — which fires 1.5s after ANY edit — meant
   re-encoding and re-writing the whole track to say one step had been
   toggled. Measured with a six-minute stereo file: 570ms of frozen main
   thread and a fresh 66MB allocation per save, and a REWIND checkpoint
   every three minutes that did it all again and kept up to six copies.
   On a phone that is a reaped tab.

   The audio is in records of its own now, written once and keyed by
   content, and the autosave slot and the checkpoints hold keys.

   WHAT THIS SUITE IS REALLY FOR is the other direction. A vault that
   stores audio by reference can lose it in ways one that stores it
   inline cannot: a document pointing at a record that was swept, an
   in-place edit the key did not notice, an old session nobody migrated.
   So most of what is below is a round trip through a real page reload,
   because "the save was fast" is worth nothing if the restore is wrong.

   No fixture file: the buffer is synthesised in the page. Sixty megabytes
   of WAV in the repository to test that the app copes with large files
   would be its own kind of joke. Thirty seconds is long enough to tell
   "once" from "every time", and nothing here asserts a duration — only
   what was and was not written. */

import { boot, checker } from './harness.mjs';

const settle = async (page) => {
  await page.waitForFunction(() => {
    const l = document.getElementById('lcdmsg');
    return l && /Amber|READY|SESSION/.test(l.textContent);
  }, null, { timeout: 45000 });
};

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { viewport: { width: 430, height: 932 } });
  try {
    /* a spy on what reaches the database and what gets re-encoded */
    const arm = () => page.evaluate(() => {
      window.__puts = []; window.__quant = 0;
      if (!window.__armed) {
        window.__armed = true;
        const put = window.idbPut, q = window.pcmQuant;
        window.idbPut = function (k, v) { window.__puts.push(String(k)); return put.apply(this, arguments); };
        window.pcmQuant = function () { window.__quant++; return q.apply(this, arguments); };
      }
    });
    const keys = () => page.evaluate(async () => (await idbKeysS(IDB_STORE)).map(String));
    const aud = (ks) => ks.filter(k => k.startsWith('aud:'));

    t.head('THE AUDIO IS WRITTEN ONCE');
    await arm();
    const first = await page.evaluate(async () => {
      await JBH.clear();
      /* wipe anything an earlier suite left in this origin's store */
      for (const k of await idbKeysS(IDB_STORE)) await idbDelS(IDB_STORE, k);
      const sr = 48000, n = sr * 30;
      const buf = mkAudioBuf(n, sr, 2);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let i = 0; i < n; i++) {
        L[i] = 0.3 * Math.sin(2 * Math.PI * 110 * i / sr);
        R[i] = 0.2 * Math.sin(2 * Math.PI * 165 * i / sr);   // different, so it cannot dedupe
      }
      S.editPad = 0;
      loadIntoTarget(buf, 'long take', { keepTarget: true, noAsk: true });
      await autosave();
      return { puts: window.__puts.slice(), quant: window.__quant };
    });
    let ks = await keys();
    t.ok('one record per channel, and a document that points at them',
      aud(ks).length === 2 && ks.includes('vault'), ks.join('  '));
    t.ok('it was encoded to get there', first.quant > 0, first.quant + ' encode calls');

    t.head('AND AN EDIT DOES NOT WRITE IT AGAIN');
    await arm();
    const edit = await page.evaluate(async () => {
      JBH.step(0, 4, 0.9);                 // the smallest edit there is
      await autosave();
      const doc = (await vaultPeek()).doc;
      return { puts: window.__puts.slice(), quant: window.__quant,
        bytes: JSON.stringify(doc).length, light: isLightDoc(doc),
        inline: doc.buffers.some(b => b.ch) };
    });
    t.ok('toggling a step re-encodes NOTHING', edit.quant === 0, edit.quant + ' encode calls');
    t.ok('and writes only the document', edit.puts.length === 1 && edit.puts[0] === 'vault',
      'wrote: ' + edit.puts.join(', '));
    t.ok('which holds keys, not samples', edit.light && !edit.inline,
      (edit.bytes / 1024).toFixed(0) + 'KB for a session holding 11MB of audio');

    t.head('AN IN-PLACE EDIT IS SEEN — THE CASE THAT RULES OUT KEYING BY OBJECT');
    /* NORMALIZE multiplies the buffer's own samples and keeps the object.
       A vault keyed by identity would go on believing the old audio was
       current and RESTORE would hand it back un-normalised. */
    const before = aud(ks).sort().join('|');
    const norm = await page.evaluate(async () => {
      const obj = S.buffers[S.pads[0].bufId];
      document.getElementById('btnNorm').click();
      await autosave();
      const same = S.buffers[S.pads[0].bufId] === obj;
      let pk = 0; const d = S.buffers[S.pads[0].bufId].getChannelData(0);
      for (let i = 0; i < d.length; i += 97) pk = Math.max(pk, Math.abs(d[i]));
      return { same, pk };
    });
    ks = await keys();
    t.ok('the buffer is the same object, louder', norm.same && norm.pk > 0.9,
      'same object: ' + norm.same + ', peak now ' + norm.pk.toFixed(3));
    t.ok('and the vault noticed anyway', aud(ks).sort().join('|') !== before,
      'keys changed: ' + (aud(ks).sort().join('|') !== before));
    t.ok('the audio it replaced was swept, not left to pile up', aud(ks).length === 2,
      aud(ks).length + ' audio records for 2 channels');

    t.head('A CHECKPOINT COSTS NO AUDIO');
    await arm();
    const ck = await page.evaluate(async () => {
      await ckptSave();
      return { puts: window.__puts.slice(), quant: window.__quant };
    });
    ks = await keys();
    t.ok('REWIND got its checkpoint', ks.some(k => k.startsWith('ck2:')), ks.filter(k => k.startsWith('ck')).join(', '));
    t.ok('without a second copy of anything',
      ck.quant === 0 && aud(ks).length === 2 && ck.puts.every(k => !k.startsWith('aud:')),
      ck.quant + ' encodes, ' + aud(ks).length + ' audio records, wrote ' + ck.puts.join(', '));

    t.head('IT COMES BACK. THROUGH A REAL RELOAD.');
    const want = await page.evaluate(() => {
      const b = S.buffers[S.pads[0].bufId];
      const at = [0, 1234, 480000, 1439999];
      return { len: b.length, sr: b.sampleRate, nch: b.numberOfChannels,
        L: at.map(i => b.getChannelData(0)[i]), R: at.map(i => b.getChannelData(1)[i]),
        step: S.patterns[S.pattern].steps[0][4], name: S.pads[0].name };
    });
    await page.reload(); await settle(page);
    const offered = await page.evaluate(() => ({
      bar: document.getElementById('restoreBar').style.display,
      loaded: S.buffers.length }));
    t.ok('the session is offered, and nothing was pulled into memory to offer it',
      offered.bar === 'flex' && offered.loaded === 0, 'bar ' + offered.bar + ', buffers in memory ' + offered.loaded);
    const got = await page.evaluate(async () => {
      ensureAudio();
      document.getElementById('btnRestore').click();
      for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100));
        if (/RESTORED|FAILED/.test(document.getElementById('lcdmsg').textContent)) break; }
      const p = S.pads[0], b = p.bufId >= 0 ? S.buffers[p.bufId] : null;
      const at = [0, 1234, 480000, 1439999];
      return { lcd: document.getElementById('lcdmsg').textContent.slice(0, 60),
        len: b && b.length, sr: b && b.sampleRate, nch: b && b.numberOfChannels,
        L: b ? at.map(i => b.getChannelData(0)[i]) : [], R: b ? at.map(i => b.getChannelData(1)[i]) : [],
        step: S.patterns[S.pattern].steps[0][4], name: p.name };
    });
    t.ok('RESTORE says so', /RESTORED/.test(got.lcd), got.lcd);
    t.ok('same length, rate and channels', got.len === want.len && got.sr === want.sr && got.nch === want.nch,
      got.len + ' @ ' + got.sr + ' x' + got.nch);
    /* one 16-bit step of a channel normalised to its own peak */
    const close = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1 / 16000);
    t.ok('THE SAMPLES ARE THE NORMALISED ONES, both channels',
      close(got.L, want.L) && close(got.R, want.R),
      'L ' + got.L.map(v => v.toFixed(4)).join(',') + ' vs ' + want.L.map(v => v.toFixed(4)).join(','));
    t.ok('and the edit made after the audio is there too', got.step === want.step && got.name === want.name,
      'step ' + got.step + ', pad "' + got.name + '"');

    t.head('AUDIO ONLY A CHECKPOINT STILL NEEDS IS NOT SWEPT');
    /* the session moves on to a different sound; REWIND still points at
       the long one. Deleting it would leave a checkpoint with a hole. */
    const pinned = await page.evaluate(async () => {
      const buf = mkAudioBuf(4800, 48000, 1);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 9) * 0.4;
      S.editPad = 0;
      loadIntoTarget(buf, 'short', { keepTarget: true, noAsk: true });
      await autosave();
      const ks = (await idbKeysS(IDB_STORE)).map(String);
      const ckKey = ks.filter(k => k.startsWith('ck2:')).sort()[0];
      let ok = true, why = '';
      try { await vaultHydrate(await idbGet(ckKey)); } catch (e) { ok = false; why = e.message; }
      return { aud: ks.filter(k => k.startsWith('aud:')).length, ok, why };
    });
    t.ok('the checkpoint can still be opened in full', pinned.ok, pinned.why || 'hydrates');
    t.ok('because its audio was kept beside the new sound’s', pinned.aud === 3,
      pinned.aud + ' audio records: two for the checkpoint, one for the session');

    t.head('A SESSION WITH A HOLE IN IT IS REFUSED, NOT RESTORED QUIETLY');
    await page.evaluate(async () => {
      await autosave();
      const doc = (await vaultPeek()).doc;
      await idbDelS(IDB_STORE, doc.buffers[0].aud[0]);      // the damage
    });
    await page.reload(); await settle(page);
    const hole = await page.evaluate(async () => {
      ensureAudio();
      document.getElementById('btnRestore').click();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100));
        if (/RESTORED|FAILED/.test(document.getElementById('lcdmsg').textContent)) break; }
      return { lcd: document.getElementById('lcdmsg').textContent.slice(0, 90),
        bar: document.getElementById('restoreBar').style.display, loaded: S.buffers.length };
    });
    t.ok('it says the audio is missing', /RESTORE FAILED/.test(hole.lcd) && /missing/.test(hole.lcd), hole.lcd);
    t.ok('and leaves everything exactly where it was', hole.bar === 'flex' && hole.loaded === 0,
      'bar ' + hole.bar + ', buffers ' + hole.loaded);

    /* THE ONE EVERY EXISTING USER GOES THROUGH. Their session is in 'last'
       with the samples inline, written by a build that knew nothing about
       any of this. It has to restore exactly as it always did, and then
       be moved over without a moment where it exists nowhere. */
    t.head('AN OLD VAULT STILL OPENS, AND IS MOVED OVER SAFELY');
    await page.evaluate(async () => {
      ensureAudio();
      await JBH.clear();
      const buf = mkAudioBuf(48000, 48000, 1);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 20) * 0.6;
      S.editPad = 0;
      loadIntoTarget(buf, 'old work', { keepTarget: true, noAsk: true });
      const old = snapshotSession();               // the format every earlier build wrote
      for (const k of await idbKeysS(IDB_STORE)) await idbDelS(IDB_STORE, k);
      await idbPutS(IDB_STORE, 'last', old);
    });
    await page.reload(); await settle(page);
    const legacy = await page.evaluate(async () => {
      ensureAudio();
      const offered = document.getElementById('restoreBar').style.display;
      document.getElementById('btnRestore').click();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100));
        if (/RESTORED|FAILED/.test(document.getElementById('lcdmsg').textContent)) break; }
      const lcd = document.getElementById('lcdmsg').textContent.slice(0, 50);
      const name = S.pads[0].name, len = S.pads[0].bufId >= 0 ? S.buffers[S.pads[0].bufId].length : 0;
      const beforeSave = (await idbKeysS(IDB_STORE)).map(String);
      JBH.step(0, 0, 0.9);
      await autosave();
      const afterSave = (await idbKeysS(IDB_STORE)).map(String);
      return { offered, lcd, name, len, beforeSave, afterSave };
    });
    t.ok('the old session is offered and restores', legacy.offered === 'flex' && /RESTORED/.test(legacy.lcd)
      && legacy.name === 'old work' && legacy.len === 48000, legacy.lcd + ' · "' + legacy.name + '" ' + legacy.len);
    t.ok('the old slot is untouched until the new one is written', legacy.beforeSave.includes('last'),
      legacy.beforeSave.join(', '));
    t.ok('and retired only once the session is safely in the new one',
      legacy.afterSave.includes('vault') && !legacy.afterSave.includes('last')
      && legacy.afterSave.some(k => k.startsWith('aud:')), legacy.afterSave.join(', '));
    await page.reload(); await settle(page);
    const again = await page.evaluate(async () => {
      ensureAudio();
      document.getElementById('btnRestore').click();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100));
        if (/RESTORED|FAILED/.test(document.getElementById('lcdmsg').textContent)) break; }
      return { lcd: document.getElementById('lcdmsg').textContent.slice(0, 40), name: S.pads[0].name,
        step: S.patterns[S.pattern].steps[0][0] };
    });
    t.ok('it restores from there on the next launch', /RESTORED/.test(again.lcd) && again.name === 'old work'
      && again.step > 0, again.lcd + ' · "' + again.name + '" step ' + again.step);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
