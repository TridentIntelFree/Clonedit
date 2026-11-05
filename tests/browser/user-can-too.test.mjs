/* THREE CAPABILITIES AN AGENT HAD AND A PERSON DID NOT.

   The discoverability audit found no control anywhere for recipe(),
   fit() or timbre(), and none for measuring a take. So an agent could
   name the slots a track needs, check whether a sound suits one, and
   measure what a sample can do — and whoever was sitting in front of
   the app could not. That asymmetry is the fault this repo keeps
   having to fix from one side or the other.

   These drive the CONTROLS, not the API. A test that calls window.JBH
   proves the capability works and says nothing about whether anyone can
   reach it, which is exactly how the gap survived: every test of these
   calls them directly. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('EVERY CONTROL IS ACTUALLY IN THE MARKUP');
    const present = await page.evaluate(() => {
      const ids = ['mlRecipe', 'mlFit', 'mlSlots', 'btnTimbre', 'timbreInfo',
        'btnTempo', 'btnTakeMeasure', 'takeInfo'];
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        out[id] = !el ? 'MISSING' : (el.disabled ? 'present (disabled)' : 'present');
      }
      return out;
    });
    t.ok('all eight exist',
      Object.values(present).every(v => v !== 'MISSING'), JSON.stringify(present));
    t.ok('AND CHECK MY SOUNDS STARTS DISABLED, because fit() refuses with no recipe',
      present.mlFit === 'present (disabled)', 'mlFit is ' + present.mlFit);

    t.head('PRESSING THE RECIPE BUTTON NAMES EMPTY PADS');
    const rec = await page.evaluate(async () => {
      await window.JBH.clear();
      document.getElementById('mlRecipe').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (document.getElementById('mlSlots').textContent.length > 40) break;
      }
      const named = S.pads.map((p, i) => ({ i, name: p.name, inst: p.inst, buf: p.bufId }))
        .filter(x => x.inst && x.buf < 0);
      const pat = S.patterns[S.pattern];
      let steps = 0;
      for (const p in pat.steps) for (const v of (pat.steps[p] || [])) if (v > 0) steps++;
      return { slots: document.getElementById('mlSlots').textContent,
        info: document.getElementById('mlInfo').textContent,
        named, steps, fitEnabled: !document.getElementById('mlFit').disabled };
    });
    t.ok('it made empty pads carrying slot names',
      rec.named.length >= 2, rec.named.map(x => 'pad' + (x.i + 1) + '=' + x.name).join(' '));
    t.ok('and wrote the kit pattern onto them before any sound was chosen',
      rec.steps > 0, rec.steps + ' steps on empty pads');
    t.ok('the panel shows each slot with its PAD NUMBER and its brief',
      /PAD \d/.test(rec.slots) && rec.slots.length > 80,
      rec.slots.slice(0, 150));
    t.ok('AND CHECK MY SOUNDS IS NOW ENABLED', rec.fitEnabled === true,
      'enabled: ' + rec.fitEnabled);

    t.head('CHECK MY SOUNDS REPORTS EMPTY, THEN JUDGES WHAT YOU PUT IN');
    const fit = await page.evaluate(async () => {
      document.getElementById('mlFit').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (/empty/.test(document.getElementById('mlInfo').textContent)) break;
      }
      const emptied = document.getElementById('mlInfo').textContent;

      /* drop a deliberately slow sound into the first non-pitched slot */
      const slot = S.pads.findIndex(p => p.inst && p.bufId < 0);
      const sr = AC.sampleRate;
      const buf = AC.createBuffer(1, Math.round(sr * 1.5), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const tt = i / sr;
        const a = tt < 0.25 ? tt / 0.25 : Math.pow(10, -3 * (tt - 0.25) / 1.0);
        d[i] = 0.6 * a * Math.sin(2 * Math.PI * 300 * tt);
      }
      S.buffers.push(buf);
      S.pads[slot].bufId = S.buffers.length - 1;
      S.pads[slot].srcNote = 60;
      document.getElementById('mlFit').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        const txt = document.getElementById('mlInfo').textContent;
        if (!/still empty/.test(txt)) break;
      }
      return { emptied, after: document.getElementById('mlInfo').textContent,
        slots: document.getElementById('mlSlots').textContent };
    });
    t.ok('with nothing loaded it says the slots are empty rather than passing them',
      /empty/.test(fit.emptied), fit.emptied);
    t.ok('and a slow sound in a fast slot is reported in milliseconds',
      /\d+ms to speak/.test(fit.slots), 
      (fit.slots.match(/[^.]*\d+ms to speak[^.]*\./) || [fit.slots.slice(0, 120)])[0]);

    t.head('WHAT CAN THIS SOUND DO');
    const tb = await page.evaluate(async () => {
      S.editPad = S.pads.findIndex(p => p.bufId >= 0);
      document.getElementById('btnTimbre').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (document.getElementById('timbreInfo').textContent.length > 20) break;
      }
      return document.getElementById('timbreInfo').textContent;
    });
    t.ok('it answers with attack, ring and the gap it needs',
      /speaks in \d+ms/.test(tb) && /rings \d+ms/.test(tb) && /sixteenths|sixteenth/.test(tb),
      tb.slice(0, 170));

    t.head('HOW FAST IS THIS LOOP');
    const tp = await page.evaluate(async () => {
      /* a 12s loop at a known 128bpm, dropped onto the selected pad */
      const SR = AC.sampleRate, bpm = 128, beat = 60 / bpm, secs = 12;
      const buf = AC.createBuffer(1, Math.round(SR * secs), SR);
      const d = buf.getChannelData(0);
      for (let k = 0; k * beat < secs; k++) {
        const s = Math.round(k * beat * SR);
        for (let i = 0; i < SR * 0.3 && s + i < d.length; i++) {
          const t2 = i / SR;
          d[s + i] += 0.9 * Math.exp(-t2 / 0.06) * Math.sin(2 * Math.PI * 55 * t2);
          if (k % 2) d[s + i] += 0.5 * Math.exp(-t2 / 0.05) * (Math.random() * 2 - 1);
        }
      }
      S.buffers.push(buf);
      const pad = S.pads.findIndex(p => p.bufId < 0);
      S.pads[pad].bufId = S.buffers.length - 1;
      S.editPad = pad;
      document.getElementById('btnTempo').click();
      for (let i = 0; i < 160; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (/bpm/.test(document.getElementById('timbreInfo').textContent)) break;
      }
      return document.getElementById('timbreInfo').textContent;
    });
    t.ok('it finds the tempo of a loop the person loaded',
      /12[6-9](\.\d)?bpm|128bpm/.test(tp), tp.slice(0, 150));
    t.ok('AND NAMES THE HALF OR DOUBLE, since nothing in the audio settles it',
      /half or twice as fast/.test(tp) && /min and max/.test(tp),
      tp.slice(0, 220));

    t.head('HOW DID THAT TAKE SIT');
    const take = await page.evaluate(async () => {
      /* no take anywhere: it must say how to make one, not throw */
      document.getElementById('btnTakeMeasure').click();
      for (let i = 0; i < 100; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (!/only measures/.test(document.getElementById('takeInfo').textContent)) break;
      }
      const none = document.getElementById('takeInfo').textContent;

      /* now a real one, with an 18ms lag built in */
      const bpm = 96, s16 = 15 / bpm, sr = AC.sampleRate;
      const buf = AC.createBuffer(2, Math.round(sr * (8 * 2 * s16 + 0.5)), sr);
      const L = buf.getChannelData(0);
      for (let k = 0; k < 8; k++) {
        const s = Math.round((k * 2 * s16 + 0.018) * sr);
        for (let j = 0; j < sr * 0.25 && s + j < L.length; j++) {
          const tt = j / sr;
          L[s + j] += 0.6 * Math.exp(-tt / 0.05) * Math.sin(2 * Math.PI * 180 * tt);
        }
      }
      buf.getChannelData(1).set(L);
      S.buffers.push(buf);
      S.trax[0].bufId = S.buffers.length - 1;
      await window.JBH.set({ bpm });
      document.getElementById('btnTakeMeasure').click();
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (/TRACK 1/.test(document.getElementById('takeInfo').textContent)) break;
      }
      return { none, got: document.getElementById('takeInfo').textContent };
    });
    t.ok('with no take it says how to make one instead of failing',
      /take on it yet/.test(take.none) && /Arm a lane/.test(take.none)
      && !/null/.test(take.none),
      take.none.slice(0, 130));
    t.ok('AND IT MEASURES THE LAG THAT WAS PLAYED, against human timing',
      /TRACK 1/.test(take.got) && /behind the click/.test(take.got)
      && /Groove corpus/.test(take.got),
      take.got.slice(0, 220));

    t.head('DOES THIS HAVE A SHAPE');
    const form = await page.evaluate(async () => {
      await window.JBH.clear();
      const out = {};
      /* nothing in the chain at all */
      document.getElementById('btnForm').click();
      await new Promise(r => setTimeout(r, 200));
      out.empty = document.getElementById('songInfo').textContent;
      /* one pattern looping — the fault every other check is blind to */
      S.song = [{ pat: 0, reps: 4 }, { pat: 0, reps: 4 }];
      document.getElementById('btnForm').click();
      await new Promise(r => setTimeout(r, 200));
      out.loop = document.getElementById('songInfo').textContent;
      /* a real shape */
      S.patterns[1].steps[0] = [];
      S.patterns[1].steps[0][3] = 0.9;
      S.patterns[1].steps[0][11] = 0.9;
      S.patterns[0].steps[0] = [];
      S.patterns[0].steps[0][0] = 0.9;
      S.patterns[0].steps[0][8] = 0.9;
      S.song = [{ pat: 0, reps: 4 }, { pat: 1, reps: 4 }, { pat: 0, reps: 4 }];
      document.getElementById('btnForm').click();
      await new Promise(r => setTimeout(r, 200));
      out.shape = document.getElementById('songInfo').textContent;
      return out;
    });
    t.ok('an empty chain is named as a sketch, not passed',
      /no arrangement/.test(form.empty) && /sketch/.test(form.empty),
      form.empty.slice(0, 120));
    t.ok('ONE PATTERN LOOPING IS CAUGHT, which no other check can see',
      /one pattern/.test(form.loop) && /nothing about it changes|passes all of them/.test(form.loop),
      form.loop.slice(0, 150));
    t.ok('and a real shape reads back as one',
      /A B A/.test(form.shape) && /comes back/.test(form.shape),
      form.shape.slice(0, 130));
    t.ok('it never judges how long a section should be',
      !/too long|too short|should be/i.test(form.shape)
      && /No section length is judged/.test(form.shape),
      form.shape.slice(-110));

    /* THE FEEL PANEL, DRIVEN RATHER THAN IMPORTED.

       This shipped throwing ReferenceError on every use and no test
       noticed, because src/pure/groove.js and src/pure/grooves.js both
       exported GROOVES — and `export *` drops an ambiguous name rather
       than resolving it, so the page got neither. Both files' unit
       tests import by path and stayed green the whole time.

       tests/pure-globals.test.mjs is the general check and runs in
       milliseconds. This is the specific one, and it is here because
       the reason the fault survived is that nobody clicked the
       button. */
    t.head('THE GROOVE PANEL APPLIES A FEEL');
    const feel = await page.evaluate(async () => {
      const out = { globals: typeof GROOVES };
      const pat = S.patterns[S.pattern];
      pat.steps[0] = []; pat.locks = {};
      /* EVERY sixteenth, not every eighth. The first version of this
         fixture put hits only on even steps, and mpc58 nudges only the
         ODD ones — so it read zero offsets off a feel that was applied
         perfectly, and the test was wrong about the code rather than
         the other way round. */
      for (let st = 0; st < 16; st++) pat.steps[0][st] = 0.9;
      S.seqPad = 0;
      document.getElementById('grvSel').value = 'mpc58';
      document.getElementById('grvAmt').value = '1';
      try { document.getElementById('btnGrvTrack').click(); }
      catch (e) { out.threw = e.message; return out; }
      await new Promise(r => setTimeout(r, 150));
      out.lcd = document.getElementById('lcdmsg').textContent;
      out.nudged = Object.keys(pat.locks).filter(k => pat.locks[k].nudge).length;
      out.names = [...document.getElementById('grvSel').options].length;
      return out;
    });
    t.ok('GROOVES is a global the page actually received',
      feel.globals === 'object', 'typeof GROOVES = ' + feel.globals);
    t.ok('clicking APPLY TO TRACK does not throw',
      !feel.threw, feel.threw || 'no throw');
    t.ok('and it writes real timing offsets onto the steps',
      feel.nudged > 0, feel.nudged + ' steps nudged');
    t.ok('the feel it applied is named back to the person',
      /SWING 58%/.test(feel.lcd || ''), (feel.lcd || '').slice(0, 90));
    t.ok('the picker offers every template in the table',
      feel.names >= 8, feel.names + ' options');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
