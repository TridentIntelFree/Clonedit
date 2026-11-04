/* AN AI CANNOT PRODUCE WHAT IT IS NOT TOLD ABOUT.

   The link could already carry a conversation and could be asked to do
   anything on window.JBH. What it could not do was NOTICE: jbhEmit()
   had two callers, `say` and `ping`, so a take finishing or the
   transport rolling reached nobody. These check the two halves that
   close that — the event buffer, and the one call that can measure
   audio somebody played rather than steps the sequencer scheduled. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('IT NOTICES THE TRANSPORT, WITH OR WITHOUT A LISTENER');
    const ev = await page.evaluate(async () => {
      await window.JBH.clear();
      const before = window.JBH.events();
      /* deliberately NOT opening the link: the buffer has to fill
         anyway, or a client that connects late has lost everything */
      await window.JBH.set({ bpm: 96 });
      startSeq();
      await new Promise(r => setTimeout(r, 250));
      stopSeq();
      const after = window.JBH.events({ since: before.seq });
      return { before, after, kinds: after.events.map(e => e.what) };
    });
    t.ok('the buffer starts empty and says so rather than returning nothing',
      ev.before.events.length === 0 && /nothing has happened|nothing new/.test(ev.before.says),
      ev.before.says);
    t.ok('PLAY and STOP both arrive, in order',
      ev.kinds.indexOf('play') >= 0 && ev.kinds.indexOf('stop') > ev.kinds.indexOf('play'),
      ev.kinds.join(' → '));
    t.ok('and the play event carries the tempo it rolled at',
      (ev.after.events.find(e => e.what === 'play') || {}).bpm === 96,
      JSON.stringify(ev.after.events.find(e => e.what === 'play')));
    t.ok('`since` returns only what is new',
      ev.after.events.length > 0 && ev.after.events.every(e => e.seq > ev.before.seq),
      'seqs ' + ev.after.events.map(e => e.seq).join(',')
      + ' all above ' + ev.before.seq);

    t.head('A TAKE IS MEASURED OFF THE AUDIO, NOT OFF THE SCHEDULE');
    const take = await page.evaluate(async () => {
      /* A real TRAX pass needs a mic and a rolling transport, so the
         take is written straight onto a lane here: what is under test is
         the MEASUREMENT, and building the buffer by hand is the only way
         to know what the answer should be. Hits every 2 sixteenths at
         96bpm, each 18ms late. */
      const bpm = 96, s16 = 15 / bpm, sr = AC.sampleRate;
      /* long enough to HOLD all eight hits. At 96bpm two sixteenths is
         0.3125s, so the eighth lands at 2.21s and a 2.0s buffer silently
         dropped it -- the detector then correctly found seven and the
         test called that a miss. An expectation the fixture cannot meet
         is a bug in the test, not in the thing under test. */
      const secs = 8 * 2 * s16 + 0.5;
      const buf = AC.createBuffer(2, Math.round(sr * secs), sr);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let i = 0; i < L.length; i++) { L[i] = (Math.random() * 2 - 1) * 0.002; }
      const at = [];
      for (let k = 0; k < 8; k++) {
        const t0 = k * 2 * s16 + 0.018;
        at.push(+t0.toFixed(4));
        const s = Math.round(t0 * sr);
        for (let j = 0; j < sr * 0.25 && s + j < L.length; j++) {
          const tt = j / sr;
          L[s + j] += 0.6 * Math.exp(-tt / 0.05) * Math.sin(2 * Math.PI * 180 * tt);
        }
      }
      R.set(L);
      S.buffers.push(buf);
      S.trax[0].bufId = S.buffers.length - 1;
      S.trax[0].name = 'take1';
      const m = window.JBH.take(1, { bpm });
      return { wrote: at, m };
    });
    t.ok('it finds the hits that were played',
      take.m.timing.onsets === take.wrote.length,
      'wrote ' + take.wrote.length + ', found ' + take.m.timing.onsets
      + ' at ' + (take.m.onsetTimes || []).slice(0, 4).join(', '));
    t.ok('AND REPORTS THE 18ms LAG THAT WAS BUILT INTO IT',
      take.m.timing.offsetMs >= 8 && take.m.timing.offsetMs <= 30,
      take.m.timing.says);
    t.ok('a steady lag is called tight, because steady is not loose',
      take.m.timing.tight === true && take.m.timing.spreadMs <= 12,
      'spread ' + take.m.timing.spreadMs + 'ms vs offset ' + take.m.timing.offsetMs + 'ms');
    t.ok('the take is reported clean, with no invented faults',
      take.m.faults.length === 0 && /clean/.test(take.m.health.says),
      take.m.health.says);
    t.ok('and it says the feel is allowed to be the point',
      /neither is wrong|if the feel is/.test(take.m.says),
      take.m.says.slice(-120));

    t.head('IT REFUSES RATHER THAN GUESSING');
    const refuse = await page.evaluate(async () => {
      await window.JBH.clear();
      const out = {};
      try { window.JBH.take(1); } catch (e) { out.empty = e.message; }
      try { window.JBH.take(99); } catch (e) { out.nosuch = e.message; }
      return out;
    });
    t.ok('an empty lane says how to put a take on it',
      /no take on it/.test(refuse.empty || '') && /PLAY/.test(refuse.empty || ''),
      refuse.empty);
    t.ok('and a lane that does not exist says how many there are',
      /lanes, numbered from 1/.test(refuse.nosuch || ''), refuse.nosuch);

    t.head('THE CONVERSATION IS TWO-WAY AND HONEST ABOUT WHO IS THERE');
    const chat = await page.evaluate(async () => {
      const told = window.JBH.tell('that take sits behind the click — keep it?');
      const said = window.JBH.say('keep it, I like the push');
      return { told, said, log: window.JBH.messages().slice(-2),
        peers: window.JBH.peers() };
    });
    t.ok('what the agent says is shown to the person',
      chat.told.shown === true && /behind the click/.test(chat.told.text), chat.told.text);
    t.ok('AND A MESSAGE WITH NOBODY LISTENING IS NOT REPORTED AS SENT',
      chat.said.sent === false, JSON.stringify(chat.said));
    t.ok('both sides land in one transcript',
      chat.log.length === 2 && chat.log.some(m => /keep it, I like/.test(m.text || '')),
      JSON.stringify(chat.log.map(m => m.who || m.from)));

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
