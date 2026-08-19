/* MIDI, checked without a controller.

   What this can and cannot do is worth being exact about, because the whole
   point is to be trusted in place of hardware that is not available.

   IT CAN check everything on this side of the Web MIDI API. A fake MIDIAccess
   is installed before the app loads, so `MIDI ON` runs the real midiInit: real
   enumeration, real select population, real rebindInputs, real bindMidiOutput.
   Input is delivered by calling the handler the app itself installed on the
   fake device — not by reaching past it into onMidi — so the wiring is under
   test too. Output is captured at the fake device's send(), with the timestamps
   the app computed, so the 24 PPQN clock can be measured rather than assumed.

   IT CANNOT tell you a specific controller works. It says nothing about USB
   driver behaviour, real-world jitter, what byte a particular pad sends, or
   whether a device enumerates at all on a given phone. Those need the hardware.
   What it does establish is that if the bytes arrive, the app does the right
   thing with them, and that the bytes it sends are correct and correctly
   timed. */

import { boot, checker } from './harness.mjs';

/* A fake Web MIDI device pair, installed before any app code runs. */
const fakeMidi = () => {
  const listify = arr => {
    const m = new Map(arr.map(x => [x.id, x]));
    m.forEach = cb => arr.forEach(x => cb(x));   // MIDIInputMap iterates values
    return m;
  };
  const input = { id: 'in-1', name: 'Fake Controller', type: 'input',
    state: 'connected', onmidimessage: null };
  const sent = [];
  const output = { id: 'out-1', name: 'Fake Synth', type: 'output', state: 'connected',
    send(bytes, ts) { sent.push({ bytes: Array.from(bytes), ts: ts == null ? null : ts }); },
    clear() { sent.length = 0; } };
  const access = { inputs: listify([input]), outputs: listify([output]),
    onstatechange: null, sysexEnabled: false };
  navigator.requestMIDIAccess = () => Promise.resolve(access);
  window.__midi = {
    /* Deliver bytes the way the device would: through whatever handler the app
       installed. Returns false if the app never wired one up, which is itself
       a failure worth seeing. */
    in(bytes) {
      if (typeof input.onmidimessage !== 'function') return false;
      input.onmidimessage({ data: Uint8Array.from(bytes), receivedTime: performance.now() });
      return true;
    },
    bound: () => typeof input.onmidimessage === 'function',
    sent, clear: () => { sent.length = 0; },
    input, output, access,
  };
};

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { initScript: fakeMidi });
  try {
    // ---------------------------------------------------------------- setup
    t.head('CONNECTING (the app\'s own midiInit, against a fake device)');
    const secure = await page.evaluate(() => window.isSecureContext);
    t.ok('the page is a secure context (Web MIDI refuses otherwise)', secure);

    await page.evaluate(() => document.querySelector('#tabs button[data-v="midi"]').click());
    await page.click('#btnMidiOn');
    await page.waitForTimeout(300);

    const conn = await page.evaluate(() => ({
      on: document.getElementById('btnMidiOn').classList.contains('on'),
      inputs: [...document.getElementById('midiIn').options].map(o => o.textContent),
      outputs: [...document.getElementById('midiOutSel').options].map(o => o.textContent),
      status: document.getElementById('midiStat') ? document.getElementById('midiStat').textContent : '',
      bound: window.__midi.bound(),
    }));
    t.ok('the device is enumerated into the input list', conn.inputs.includes('Fake Controller'),
      conn.inputs.join(' | '));
    t.ok('and into the output list', conn.outputs.includes('Fake Synth'), conn.outputs.join(' | '));
    t.ok('the app wired its handler onto the input', conn.bound);

    // ------------------------------------------------------------ notes in
    t.head('NOTES IN');
    /* All 64 pads ship with a note already (36..99), so "an unmapped note" has
       to be found rather than assumed — picking 61 off the top of my head chose
       one that legitimately belongs to pad 25, and the app was right to fire
       it. Take the pad that owns a note and a note that no pad owns. */
    const noteIn = await page.evaluate(async () => {
      S.midiChrom = false; S.midiCh = -1; S.vcurve = 'linear';
      const pad = S.pads.findIndex(p => p.bufId >= 0 && p.note >= 0);
      const note = S.pads[pad].note;
      const owned = new Set(S.pads.map(p => p.note));
      const free = [...Array(128).keys()].find(n => !owned.has(n));
      const hits = [];
      const real = window.hitLive;
      window.hitLive = (i, v, tr) => { hits.push({ i, v: +(+v).toFixed(3), tr }); return real(i, v, tr); };
      const delivered = window.__midi.in([0x90, note, 100]);
      window.__midi.in([0x90, free, 100]);         // no pad owns this one
      window.__midi.in([0x80, note, 0]);           // note off must not retrigger
      window.__midi.in([0x90, note, 0]);           // velocity 0 is a note off
      window.hitLive = real;
      return { pad, note, free, delivered, hits };
    });
    t.note('  (pad ' + noteIn.pad + ' owns note ' + noteIn.note +
      '; note ' + noteIn.free + ' is owned by nothing)');
    t.ok('the message reached the app through its own handler', noteIn.delivered);
    t.ok('a mapped note triggers exactly its pad',
      noteIn.hits.length === 1 && noteIn.hits[0].i === noteIn.pad,
      JSON.stringify(noteIn.hits));
    t.ok('an unmapped note triggers nothing', noteIn.hits.length === 1);
    t.ok('note-off and velocity-0 do not retrigger', noteIn.hits.length === 1);

    // ------------------------------------------------------- velocity curve
    t.head('VELOCITY CURVES (velCurve, over the full range)');
    const vel = await page.evaluate(() => {
      const out = {};
      for (const c of ['linear', 'soft', 'hard', 'fixed']) {
        S.vcurve = c;
        out[c] = [1, 64, 127].map(v => velCurve(v));
      }
      S.vcurve = 'linear';
      return out;
    });
    t.ok('linear is v/127', Math.abs(vel.linear[2] - 1) < 1e-9 && Math.abs(vel.linear[1] - 64 / 127) < 1e-9,
      vel.linear.map(v => v.toFixed(5)).join(', '));
    t.ok('soft is louder than linear at the same input', vel.soft[1] > vel.linear[1],
      vel.soft[1].toFixed(4) + ' > ' + vel.linear[1].toFixed(4));
    t.ok('hard is quieter than linear at the same input', vel.hard[1] < vel.linear[1],
      vel.hard[1].toFixed(4) + ' < ' + vel.linear[1].toFixed(4));
    t.ok('fixed ignores velocity entirely', vel.fixed[0] === 1 && vel.fixed[2] === 1,
      vel.fixed.join(', '));
    t.ok('every curve tops out at full scale',
      ['linear', 'soft', 'hard', 'fixed'].every(c => Math.abs(vel[c][2] - 1) < 1e-9));

    // -------------------------------------------------------- channel filter
    t.head('CHANNEL FILTER');
    const chan = await page.evaluate(() => {
      const pad = S.pads.findIndex(p => p.bufId >= 0 && p.note >= 0);
      const note = S.pads[pad].note; S.midiChrom = false;
      const count = () => { let n = 0; const real = window.hitLive;
        window.hitLive = (...a) => { n++; return real(...a); };
        return { done: () => { window.hitLive = real; return n; } }; };
      S.midiCh = 2;                                 // listen to channel 3 only
      let c = count(); window.__midi.in([0x90 | 2, note, 100]); const onCh = c.done();
      c = count(); window.__midi.in([0x90 | 5, note, 100]); const offCh = c.done();
      S.midiCh = -1;                                // OMNI
      c = count(); window.__midi.in([0x90 | 5, note, 100]); const omni = c.done();
      return { onCh, offCh, omni };
    });
    t.ok('a note on the chosen channel is taken', chan.onCh === 1, 'hits ' + chan.onCh);
    t.ok('a note on another channel is ignored', chan.offCh === 0, 'hits ' + chan.offCh);
    t.ok('OMNI takes any channel', chan.omni === 1, 'hits ' + chan.omni);

    // ------------------------------------------------------- chromatic mode
    t.head('CHROMATIC MODE (whole keyboard plays one pad, transposed)');
    const chrom = await page.evaluate(() => {
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      S.editPad = pad; S.midiChrom = true; S.midiRoot = 60; S.midiCh = -1; S.scaleLock = false;
      const hits = [];
      const real = window.hitLive;
      window.hitLive = (i, v, tr) => { hits.push({ i, tr }); };
      [60, 67, 48].forEach(n => window.__midi.in([0x90, n, 100]));
      window.hitLive = real;
      S.midiChrom = false;
      return { pad, hits };
    });
    t.ok('every note plays the selected pad',
      chrom.hits.length === 3 && chrom.hits.every(h => h.i === chrom.pad),
      JSON.stringify(chrom.hits));
    t.ok('transposition is relative to the root note',
      chrom.hits[0].tr === 0 && chrom.hits[1].tr === 7 && chrom.hits[2].tr === -12,
      chrom.hits.map(h => h.tr).join(', ') + ' (expected 0, 7, -12)');

    // -------------------------------------------------------------- CC + PC
    t.head('CONTROL CHANGE');
    const cc = await page.evaluate(() => {
      S.midiCh = -1; S.ccMaps = {};
      // LEARN: arm, move a controller, the moved CC binds to the chosen target
      document.getElementById('ccTarget').value = 'm:bpm';
      document.getElementById('btnCcLearn').click();
      window.__midi.in([0xB0, 74, 64]);
      const learned = { ...S.ccMaps };
      const armedAfter = document.getElementById('btnCcLearn').classList.contains('on');
      // and now it should drive the target across its range
      window.__midi.in([0xB0, 74, 0]);   const lo = S.bpm;
      window.__midi.in([0xB0, 74, 127]); const hi = S.bpm;
      // a CC that is not mapped must do nothing
      const before = S.bpm;
      window.__midi.in([0xB0, 99, 0]);
      const unmappedMoved = S.bpm !== before;
      return { learned, armedAfter, lo, hi, unmappedMoved };
    });
    t.ok('LEARN binds the CC that moved', cc.learned['74'] === 'm:bpm', JSON.stringify(cc.learned));
    t.ok('LEARN disarms itself after binding one control', !cc.armedAfter);
    t.ok('the mapped CC sweeps its target', cc.lo === 40 && cc.hi === 240,
      'CC 0 → ' + cc.lo + ' BPM, CC 127 → ' + cc.hi + ' BPM (expected 40 and 240)');
    t.ok('an unmapped CC changes nothing', !cc.unmappedMoved);

    t.head('PROGRAM CHANGE');
    const pc = await page.evaluate(() => {
      S.midiCh = -1; S.pcPat = true; selectPattern(0);
      window.__midi.in([0xC0, 3]);
      const moved = S.pattern;
      S.pcPat = false; selectPattern(0);
      window.__midi.in([0xC0, 3]);
      const ignored = S.pattern;
      S.pcPat = true;
      return { moved, ignored };
    });
    t.ok('PC selects the pattern', pc.moved === 3, 'pattern ' + (pc.moved + 1));
    t.ok('and does nothing when PC→pattern is switched off', pc.ignored === 0,
      'pattern ' + (pc.ignored + 1));

    // ------------------------------------------------------------- clock out
    t.head('CLOCK OUT — 24 PPQN, measured');
    const clk = await page.evaluate(async () => {
      document.getElementById('midiOutSel').value = 'out-1';
      document.getElementById('midiOutSel').dispatchEvent(new Event('change'));
      S.clkOut = true; S.notesOut = false; S.extClk = false;
      setBpm(120);
      window.__midi.clear();
      startSeq();
      await new Promise(r => setTimeout(r, 1200));
      stopSeq();
      await new Promise(r => setTimeout(r, 100));
      const s = window.__midi.sent;
      const clocks = s.filter(m => m.bytes[0] === 0xF8).map(m => m.ts).sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < clocks.length; i++) gaps.push(clocks[i] - clocks[i - 1]);
      gaps.sort((a, b) => a - b);
      return {
        bound: !!midiOutDev,
        start: s.findIndex(m => m.bytes[0] === 0xFA),
        stop: s.findIndex(m => m.bytes[0] === 0xFC),
        n: clocks.length,
        medianGap: gaps.length ? gaps[gaps.length >> 1] : -1,
        p90: gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.9))] : -1,
        worst: gaps.length ? gaps[gaps.length - 1] : -1,
        span: clocks.length > 1 ? clocks[clocks.length - 1] - clocks[0] : 0,
        firstBytes: s.slice(0, 3).map(m => m.bytes[0].toString(16)),
      };
    });
    t.ok('the output device is bound by the select', clk.bound);
    t.ok('START (0xFA) is sent, before any clock', clk.start === 0,
      'index ' + clk.start + ' · first bytes ' + clk.firstBytes.join(' '));
    t.ok('STOP (0xFC) is sent', clk.stop >= 0);
    t.ok('clock ticks were sent', clk.n > 20, clk.n + ' ticks');
    /* 24 PPQN at 120 BPM is one tick every 60/120/24 s = 20.833 ms. This is the
       number the whole feature exists to produce; if it is wrong, every synced
       device drifts. */
    t.near('the tick interval is 24 PPQN at 120 BPM', clk.medianGap, 20.833, 0.6, 'ms');
    /* Nine ticks in ten are correctly spaced, rather than "the wall-clock span
       matches the ideal". The span version failed once on a 50ms stall in the
       test machine — the median was still exact to a fraction of a millisecond,
       so the CLOCK was right and one frame was late. Three re-runs came back at
       1.22-1.23s against the failing run's 1.28s. Systematic error is what
       breaks a synced device and it moves the median; a single blocked frame in
       a headless browser does not, and must not fail a build. */
    t.ok('and nine ticks in ten are spaced correctly, not just the median',
      clk.p90 < 20.833 * 1.35,
      '90th-percentile gap ' + clk.p90.toFixed(2) + 'ms · worst ' + clk.worst.toFixed(2) +
      'ms · ' + clk.n + ' ticks');

    // tempo change must move the tick rate with it
    const clk2 = await page.evaluate(async () => {
      setBpm(60);
      window.__midi.clear();
      startSeq();
      await new Promise(r => setTimeout(r, 1200));
      stopSeq();
      const clocks = window.__midi.sent.filter(m => m.bytes[0] === 0xF8).map(m => m.ts).sort((a, b) => a - b);
      const gaps = []; for (let i = 1; i < clocks.length; i++) gaps.push(clocks[i] - clocks[i - 1]);
      gaps.sort((a, b) => a - b);
      return gaps.length ? gaps[gaps.length >> 1] : -1;
    });
    t.near('halving the tempo doubles the tick interval', clk2, 41.667, 1.2, 'ms');

    // ------------------------------------------------------------- notes out
    t.head('NOTES OUT');
    const notes = await page.evaluate(async () => {
      S.clkOut = false; S.notesOut = true; S.midiOutCh = 0;
      setBpm(120);
      const pad = S.pads.findIndex(p => p.bufId >= 0);
      const pat = S.patterns[S.pattern];
      pat.steps.forEach(r => r.fill(0));
      pat.steps[pad][0] = 0.9; pat.steps[pad][4] = 0.9;
      S.seqPad = pad;
      window.__midi.clear();
      startSeq();
      await new Promise(r => setTimeout(r, 1400));
      stopSeq();
      await new Promise(r => setTimeout(r, 300));
      const s = window.__midi.sent;
      const ons = s.filter(m => (m.bytes[0] & 0xF0) === 0x90 && m.bytes[2] > 0);
      const offs = s.filter(m => (m.bytes[0] & 0xF0) === 0x80 ||
        ((m.bytes[0] & 0xF0) === 0x90 && m.bytes[2] === 0));
      // and on a different channel
      S.midiOutCh = 9;
      window.__midi.clear();
      startSeq(); await new Promise(r => setTimeout(r, 700)); stopSeq();
      const ch9 = window.__midi.sent.filter(m => (m.bytes[0] & 0xF0) === 0x90);
      S.notesOut = false;
      return { ons: ons.length, offs: offs.length,
        ch: ons.length ? (ons[0].bytes[0] & 0x0F) : -1,
        ch9: ch9.length ? (ch9[0].bytes[0] & 0x0F) : -1 };
    });
    t.ok('steps are mirrored out as note-ons', notes.ons >= 2, notes.ons + ' note-ons');
    t.ok('every note is released', notes.offs >= notes.ons - 1,
      notes.ons + ' on, ' + notes.offs + ' off — a missing off is a stuck note on the hardware');
    t.ok('notes go out on the configured channel', notes.ch === 0, 'channel ' + (notes.ch + 1));
    t.ok('changing the channel moves them', notes.ch9 === 9, 'channel ' + (notes.ch9 + 1));

    // -------------------------------------------------------------- ext clock
    t.head('EXTERNAL CLOCK IN');
    const ext = await page.evaluate(async () => {
      S.clkOut = false; S.notesOut = false;
      setBpm(100);
      S.extClk = true;
      // 24 ticks per beat at 140 BPM → 60000/140/24 = 17.857 ms apart
      const iv = 60000 / 140 / 24;
      const t0 = performance.now();
      window.__midi.in([0xFA]);                     // START
      const startedPlaying = playing;
      /* Feed a run of ticks at real wall-clock spacing, because the app derives
         tempo from the measured interval between them. */
      for (let i = 0; i < 96; i++) {
        await new Promise(r => setTimeout(r, iv));
        window.__midi.in([0xF8]);
      }
      const derived = S.bpm;
      const stepsAdvanced = absStepSched;
      window.__midi.in([0xFC]);                     // STOP
      const stoppedPlaying = playing;
      S.extClk = false;
      return { startedPlaying, derived, stepsAdvanced, stoppedPlaying,
        elapsed: performance.now() - t0 };
    });
    t.ok('MIDI START begins playback', ext.startedPlaying);
    t.ok('MIDI STOP ends it', !ext.stoppedPlaying);
    /* setTimeout cannot hold a 17.9ms period exactly, so the derived tempo is
       checked loosely — what matters is that it tracked the incoming clock to
       roughly the right tempo rather than sitting at the 100 it started from. */
    t.ok('tempo is derived from the incoming clock', Math.abs(ext.derived - 140) < 25 && ext.derived !== 100,
      'read ' + ext.derived + ' BPM from a ~140 BPM clock');
    t.ok('the sequencer advances one step per 6 ticks',
      ext.stepsAdvanced >= 12 && ext.stepsAdvanced <= 20,
      ext.stepsAdvanced + ' steps from 96 ticks (expected 16)');

    // ----------------------------------------------------------- BLE parsing
    t.head('BLE-MIDI PACKET PARSING (the iOS route — no Web MIDI there)');
    const ble = await page.evaluate(() => {
      S.midiIn = '*'; S.midiCh = -1; S.midiChrom = false;
      const note = S.pads[S.pads.findIndex(p => p.bufId >= 0 && p.note >= 0)].note;
      const hits = [];
      const real = window.hitLive;
      window.hitLive = (i, v) => { hits.push(i); };
      const pkt = a => parseBleMidi(new DataView(Uint8Array.from(a).buffer));
      // header, timestamp, note-on ×2 with running status (the common encoding)
      pkt([0x80, 0x80, 0x90, note, 100, 0x80, note, 100]);
      const withRunning = hits.length;
      pkt([0x80, 0x80, 0xF8]);                      // a realtime byte alone
      window.hitLive = real;
      return { withRunning, total: hits.length };
    });
    t.ok('a BLE packet with running status yields both notes', ble.withRunning === 2,
      ble.withRunning + ' notes');
    t.ok('a realtime byte in a BLE packet does not crash the parser', true);

    // --------------------------------------------------------- panic / hangs
    t.head('STUCK NOTES');
    const panic = await page.evaluate(() => {
      document.getElementById('midiOutSel').value = 'out-1';
      document.getElementById('midiOutSel').dispatchEvent(new Event('change'));
      S.notesOut = true; S.midiOutCh = 0;
      window.__midi.clear();
      moAllOff();
      S.notesOut = false;
      const s = window.__midi.sent.map(m => m.bytes);
      return { all: s, has123: s.some(b => b[1] === 123), has120: s.some(b => b[1] === 120) };
    });
    t.ok('all-notes-off (CC 123) is sent', panic.has123, JSON.stringify(panic.all));
    t.ok('all-sound-off (CC 120) is sent too', panic.has120);

    t.head('JS ERRORS');
    t.ok('none during the whole MIDI run', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
