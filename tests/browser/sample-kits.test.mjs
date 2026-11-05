/* A KIT IS A CASTING, NOT A LIBRARY.

   Every kit this app had was synthesised: a slot is [presetId, note] and
   loading one calls renderPreset(). That is why they need no connection,
   and it is also why a track built from one sounds like an oscillator
   with a filter on it.

   A pack is no answer either. VCSL Wide is 1,045 samples across nineteen
   instruments and nothing in it says which one is the kick — which is
   precisely why `learn()` had to be built to guess roles out of the
   spectrum, and why an 808 kick and an 808 bass note defeat it, being the
   same signal. A kit declares instead of guessing: this recording plays
   the downbeat, this one carries the harmony.

   scripts/check-sample-kits.mjs resolves every voice against its manifest
   and `npm run lint` runs it, so a kit pointing at a sound that is not
   there fails the build. What it cannot check is the half that lives in
   the browser: that the audio actually arrives, lands on pads, and comes
   back tagged with the role it was cast in. That is this.

   IT USES THE NETWORK ON PURPOSE. The samples are fetched from the same
   manifests the picker lists, so a kit that cannot download is a kit that
   does not work, and that should read as a failure rather than a skip.
   METAL ROOM is the one driven here because it is the cheapest — 25 files
   against ROOM's 95. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base, { viewport: { width: 430, height: 932 } });
  try {
    t.head('THE KITS ARE OFFERED, AND MARKED APART FROM THE SYNTH ONES');
    const row = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('#kitRow button')].map(b => b.textContent),
      known: typeof SAMPLE_KITS !== 'undefined' ? SAMPLE_KITS.map(k => k.name) : [],
    }));
    t.ok('every recorded kit has a button',
      row.known.length > 0 && row.known.every(n => row.labels.some(l => l === '● ' + n)),
      row.known.join(', ') + ' vs ' + row.labels.join(' | ').slice(0, 90));
    t.ok('and the synthesised kits are still there',
      row.labels.some(l => l === 'TRAP') && row.labels.some(l => l === 'LO-FI'),
      'TRAP and LO-FI present');

    t.head('LOADING ONE PUTS REAL RECORDINGS ON PADS, IN THEIR ROLES');
    let files = 0;
    const count = r => { if (/raw\.githubusercontent/.test(r.url())) files++; };
    page.on('request', count);
    const kit = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll('#kitRow button')]
        .find(b => b.textContent.startsWith('● METAL'));
      if (!btn) return { err: 'no METAL ROOM button' };
      btn.click();
      for (let i = 0; i < 400; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (/READY|FAILED/.test(document.getElementById('lcdmsg').textContent)) break;
      }
      const pads = [];
      for (let i = 0; i < 64; i++) {
        const p = S.pads[i];
        if (p.bufId >= 0) pads.push({ role: p.role || null, inst: p.inst || null,
          name: p.name || '', layers: (p.layers || []).length, note: p.srcNote });
      }
      return { lcd: document.getElementById('lcdmsg').textContent, pads, bpm: S.bpm };
    });
    page.off('request', count);

    t.ok('it reports every voice, not just some', /6 of 6 voices/.test(kit.lcd || ''),
      (kit.lcd || kit.err || '').slice(0, 110));
    t.ok('and it fetched real audio to do it', files > 10, files + ' files from the pack host');

    const roles = {};
    for (const p of (kit.pads || [])) if (p.role) (roles[p.role] = roles[p.role] || []).push(p);
    t.ok('EVERY PAD KNOWS WHAT IT IS, which no pack could ever say',
      (kit.pads || []).length > 0 && kit.pads.every(p => p.role),
      Object.keys(roles).join(', ') || 'no roles on any pad');
    for (const r of ['kick', 'snare', 'bass'])
      t.ok('there is a ' + r, !!roles[r], roles[r] ? roles[r].map(p => p.name)[0] : 'MISSING');

    t.head('THE DRUMS CARRY VELOCITY LAYERS, WHICH IS THE POINT OF A REAL KIT');
    /* AGENTS.md: a ghost note and an accent must be different recordings
       of a stick hitting a drum, not one waveform at two gains. */
    const layered = (kit.pads || []).filter(p => p.layers > 0);
    t.ok('at least one drum is several takes deep', layered.length > 0,
      layered.map(p => p.name + ' x' + (p.layers + 1)).join(', ') || 'no layers anywhere');

    t.head('AND A MELODIC VOICE GETS A RANGE, NOT ONE PAD');
    /* infill() centres a one-pad instrument on its own note and allows a
       fifth either way, because a sample dragged further stops sounding
       like the instrument. A bass cast onto one recording is a bass that
       cannot play a line. */
    const bass = roles.bass || [];
    const notes = bass.map(p => p.note).filter(n => n != null).sort((a, b) => a - b);
    t.ok('the bass spans more than one note', notes.length >= 3,
      notes.length + ' pads, notes ' + (notes.join(',') || 'none'));
    t.ok('and the tempo came with the kit', kit.bpm === 100, 'bpm ' + kit.bpm);

    t.head('AND THE KIT STAGES ITS OWN LEVELS');
    /* CHAMBER first shipped with a 22dB peak spread across its own pads —
       cello at -20.5dBFS against a glockenspiel at -42.2 — so a part
       written on it was fifteen decibels out of balance before anybody
       touched a fader. Gain is a multiplier on whatever the pad holds and
       these sources differ enormously on disk, so a kit that does not
       stage itself has shipped a mixing problem as a feature. */
    const lev = await page.evaluate(() => {
      const rows = [];
      for (let i = 0; i < 64; i++) { const p = S.pads[i];
        if (p.bufId >= 0 && p.role) {
          const raw = 20 * Math.log10(Math.max(bufPeak(S.buffers[p.bufId]), 1e-9));
          rows.push({ raw, after: raw + 20 * Math.log10(Math.max(p.gain, 1e-9)), gain: p.gain });
        } }
      return rows;
    });
    const sp = a => Math.max(...a) - Math.min(...a);
    const before = sp(lev.map(r => r.raw)), after = sp(lev.map(r => r.after));
    t.ok('the staged spread is tighter than the raw one', after < before - 3,
      before.toFixed(1) + 'dB raw -> ' + after.toFixed(1) + 'dB staged');
    t.ok('and no pad was given a gain the engine cannot set',
      lev.every(r => r.gain > 0 && r.gain <= 2),
      'gains ' + lev.map(r => r.gain.toFixed(2)).join(', ').slice(0, 60));
    t.ok('a kit that had to clamp says so rather than looking staged',
      !/too quiet on disk/.test(kit.lcd) || /spread closed/.test(kit.lcd),
      (kit.lcd || '').slice(0, 130));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
