/* DOES A SOUND HAVE A PLACE — AND CAN THE CHECK TELL.

   place() exists because of how a mix actually gets built, which is one
   sound at a time: you need a bass, so you make the bass, and you
   finish it before starting the next thing. The question it answers is
   the one that method asks at every step — against everything already
   here, does this new sound sit anywhere.

   Returning an object would be easy and worthless. The claim worth
   testing is the distinction: a sound with a band to itself must read
   differently from the same sound with something else already sitting
   on top of it. So that is the experiment — identical material, once
   with the band free and once with it taken — and the two readings have
   to separate. If they do not, the call is decoration. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('A SOUND ALONE IN ITS BAND OWNS IT');
    const alone = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('low', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 30, hi: 40, max: 1 });
      const bass = window.JBH.instPads('low')[0].pad;
      window.JBH.pattern(0, { plen: 16, clear: true });
      await window.JBH.batch([['step', bass, 0, 0.9], ['step', bass, 8, 0.9]]);
      return await window.JBH.place(bass);
    });
    t.ok('it names a band as the one it owns',
      !!alone.owns, alone.owns ? alone.owns + 'Hz by ' + alone.ownsBy + 'dB' : 'owns nothing');
    t.ok('with nothing else loaded it says so rather than inventing a verdict',
      alone.against === 0 && /nothing else is loaded/.test(alone.says), alone.says);

    /* ---- now put something else in exactly the same place ------------ */
    t.head('THE SAME SOUND WITH ITS BAND ALREADY TAKEN');
    const crowded = await page.evaluate(async () => {
      /* three more copies of the same register, louder: the band is gone */
      await window.JBH.instrument('hog', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 30, hi: 40, max: 1 });
      const hogs = window.JBH.instPads('hog').map(x => x.pad);
      for (const h of hogs) window.JBH.pad(h, { gain: 2.0 });
      await window.JBH.batch(hogs.flatMap(h =>
        [0, 2, 4, 6, 8, 10, 12, 14].map(s => ['step', h, s, 1.0])));
      const bass = window.JBH.instPads('low')[0].pad;
      window.JBH.pad(bass, { gain: 0.08 });
      return { quiet: await window.JBH.place(bass),
        loud: await window.JBH.place(hogs[0]) };
    });

    t.ok('the quiet one is measured against what is now there',
      crowded.quiet.against > 0, crowded.quiet.against + ' other pad(s) sounding');
    t.ok('and it reads as worse off than when it had the band to itself',
      crowded.quiet.ownsBy < alone.ownsBy,
      'alone ' + alone.ownsBy + 'dB → crowded ' + crowded.quiet.ownsBy + 'dB');
    t.ok('the loud one still owns something',
      crowded.loud.ownsBy > crowded.quiet.ownsBy,
      'hog ' + crowded.loud.ownsBy + 'dB vs buried ' + crowded.quiet.ownsBy + 'dB');

    t.head('IT SAYS WHICH PROBLEM IT IS');
    /* the distinction the whole call is for: absent is not quiet */
    const absent = crowded.quiet.ownsBy < -6;
    t.ok('a sound under everything everywhere is called absent, not quiet',
      !absent || /absent/.test(crowded.quiet.findings.join(' ')),
      absent ? crowded.quiet.findings[0].slice(0, 130)
        : 'not buried far enough to trigger it (' + crowded.quiet.ownsBy + 'dB)');
    t.ok('every band is reported, not just the verdict',
      Array.isArray(crowded.quiet.bands) && crowded.quiet.bands.length >= 8
        && crowded.quiet.bands.every(b => typeof b.over === 'number'),
      (crowded.quiet.bands || []).length + ' bands, each with pad/rest/over');

    t.head('IT REFUSES RATHER THAN GUESSES');
    const refused = await page.evaluate(async () => {
      /* a pad that holds a sample but has no step written for it */
      await window.JBH.instrument('mute', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 64, hi: 72, max: 1 });
      const p = window.JBH.instPads('mute')[0].pad;
      try { await window.JBH.place(p); return 'no error'; }
      catch (e) { return e.message; }
    });
    t.ok('a pad that plays nothing is told so, not scored',
      /plays nothing/.test(refused), refused.slice(0, 100));

    /* ---- the bug the first real run of this found ------------------- */
    t.head('A BAND IS NOT OWNED JUST BECAUSE NOBODY ELSE IS IN IT');
    /* place() originally took the largest `over` outright. Against a
       lowpassed sub, a bandpassed mid read as owning 2-4kHz by 27dB —
       not because it had anything up there, but because the sub had
       nothing at all and any scrap beats silence. The one number you
       are meant to read then points at the part of the sound that
       matters least. A band only counts if the sound actually lives
       there. */
    const sparse = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('s', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 30, hi: 40, max: 1 });
      const sub = window.JBH.instPads('s')[0].pad;
      /* a sub with everything above ~105Hz taken off it */
      window.JBH.pad(sub, { ftype: 'lowpass', fcut: 0.10, gain: 1.0 });
      await window.JBH.instrument('m', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 52, hi: 64, max: 1 });
      const mid = window.JBH.instPads('m')[0].pad;
      /* and a mid living around 374Hz: cutHz(x) = 60 * (16000/60)^x */
      window.JBH.pad(mid, { ftype: 'bandpass', fcut: 0.33, fres: 1.8, drv: 0.7, gain: 0.5 });
      window.JBH.pattern(0, { plen: 16, clear: true });
      await window.JBH.batch([['step', sub, 0, 0.9], ['step', mid, 0, 0.9]]);
      const r = await window.JBH.place(mid);
      const loudest = [...r.bands].sort((a, b) => b.pad - a.pad)[0];
      return { owns: r.owns, ownsBy: r.ownsBy, loudest: loudest.band,
        loudestDb: loudest.pad, ownsDb: r.bands.find(b => b.band === r.owns).pad };
    });
    t.ok('the band it claims is one it is genuinely loud in',
      sparse.ownsDb >= sparse.loudestDb - 12,
      'owns ' + sparse.owns + ' at ' + sparse.ownsDb + 'dB; its loudest is '
        + sparse.loudest + ' at ' + sparse.loudestDb + 'dB');
    t.ok('and not a high band it merely happens to be alone in',
      !/^(4000|8000)-/.test(sparse.owns || ''),
      'owns ' + sparse.owns + ' by ' + sparse.ownsBy + 'dB');

    /* ---- the bug a fresh agent hit on its first real track ---------- */
    t.head('A SAMPLED INSTRUMENT IS ONE SOUND, NOT ONE PAD PER NOTE');
    /* instrument() lays a piano across a pad per sampled note. place()
       took a pad index, so the documented method — place() each sound
       as it goes in — rendered ONE NOTE and set it against the other
       ten notes of the same piano, which it counted among "everything
       else". A piano trio's melody came back owning nothing, by
       -6.1dB, in a mix where the piano was the loudest thing in it. */
    const grouped = await page.evaluate(async () => {
      await window.JBH.clear();
      await window.JBH.instrument('piano', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 57, hi: 81 });
      await window.JBH.instrument('sub', { pack: 'samples/salamander.json',
        match: '^sal:', lo: 30, hi: 40, max: 1 });
      const keys = window.JBH.instPads('piano').map(x => x.pad);
      const sub = window.JBH.instPads('sub')[0].pad;
      window.JBH.pad(sub, { ftype: 'lowpass', fcut: 0.10 });
      window.JBH.pattern(0, { plen: 16, clear: true });
      await window.JBH.batch([...keys.map((p, i) => ['step', p, i, 0.8]),
        ['step', sub, 0, 0.9], ['step', sub, 8, 0.9]]);
      return { pads: keys.length,
        one: await window.JBH.place(keys[Math.floor(keys.length / 2)]),
        all: await window.JBH.place('piano'),
        list: await window.JBH.place(keys) };
    });
    t.ok('the piano is spread over several pads',
      grouped.pads >= 5, grouped.pads + ' pads tagged piano');
    t.ok('placed by name, all of them are the sound',
      grouped.all.pads.length === grouped.pads,
      'place("piano") measured ' + grouped.all.pads.length + ' pads');
    t.ok('and the rest of the piano is no longer counted against it',
      grouped.all.against < grouped.one.against,
      'by name: against ' + grouped.all.against + ' · by pad: against '
        + grouped.one.against);
    t.ok('which is the difference between owning its band and owning nothing',
      grouped.all.ownsBy > grouped.one.ownsBy,
      'one note ' + grouped.one.ownsBy + 'dB → whole piano ' + grouped.all.ownsBy + 'dB');
    t.ok('a list of pads reads the same as the tag',
      grouped.list.ownsBy === grouped.all.ownsBy && grouped.list.owns === grouped.all.owns,
      'list ' + grouped.list.owns + '/' + grouped.list.ownsBy
        + ' vs tag ' + grouped.all.owns + '/' + grouped.all.ownsBy);
    const byName = await page.evaluate(async () => {
      try { await window.JBH.place('nosuchinstrument'); return 'no error'; }
      catch (e) { return e.message; }
    });
    t.ok('an unknown tag is refused, and says why a tag might be missing',
      /no pads carry/.test(byName) && /sound\(\) does not/.test(byName),
      byName.slice(0, 110));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
