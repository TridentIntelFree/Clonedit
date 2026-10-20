/* THE AGENT SURFACE.

   "I'd like for the agent to be able to use everything in the app, including
   downloadable sounds… and a way to legitimately connect an agent so it has
   full live time control… maybe even a way to communicate to the connected
   agent in the app… the copy and paste system sucks, direct connection would
   be ideal."

   AI JAM — paste a song document in, the app builds it — has been here a long
   time and is genuinely limited: it is one-way, it only happens between
   takes, and its format reaches sixteen pads and nothing else. No tape lanes,
   no LIVE instrument, no downloadable sounds, and no way to play a pad at a
   moment of your choosing.

   What is tested here is the replacement: window.JBH as a full control
   surface, the same surface reachable from OUTSIDE the page while it is
   playing, and a line of text each way so the thing driving it can be talked
   to rather than only commanded.

   Two properties get the most attention, because they are the ones that
   would hurt. It must be OFF until switched on — an app that answers to any
   tab on its origin the moment it loads is a different proposition from this
   one. And text arriving from whatever is connected must never be able to
   run as script in here. */

import { boot, checker } from './harness.mjs';

export default async function ({ browser, base }) {
  const t = checker();
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('AN AGENT CAN REACH EVERYTHING, NOT JUST SIXTEEN PADS');
    const api = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(x => setTimeout(x, ms));
      ensureAudio(); await wait(350);
      S.pads.forEach(p => { p.mute = false; }); S.masterVol = 0.9;
      o.calls = JBH.calls();

      /* PRESETS — offline, no network */
      o.presetCount = JBH.presets().length;
      o.presetOnPad40 = await JBH.preset('dkick', 40);
      o.pad40 = { bufId: S.pads[40].bufId >= 0, name: S.pads[40].name };

      /* A pad past the sixteenth — outside the song doc entirely */
      o.padWrite = JBH.pad(40, { gain: 0.42, pan: -0.3, fcut: 0.6 });
      o.padReadBack = JBH.pad(40).gain;

      /* Steps + locks from outside */
      JBH.step(40, 0, 1, { fcut: 0.2 });
      JBH.step(40, 8, 0.7, { pitch: 5 });
      o.stepsWritten = JBH.state().hits;
      o.lockThere = !!(S.patterns[S.pattern].locks['40:0'] || {}).fcut;

      /* TRAX + LIVE */
      o.laneWrite = JBH.lane(2, { gain: 0.55, start: 1.5, loop: true });
      o.liveWrite = JBH.live({ voice: 'bell', cut: 0.7, room: 0.3 });

      /* set() + hit() while rolling */
      JBH.set({ bpm: 133, swing: 0.2 });
      o.bpm = S.bpm;
      JBH.play(); await wait(250);
      o.playingNow = JBH.state().playing;
      o.hit = JBH.hit(40, 0.9, 7);
      await wait(200);
      JBH.stop();

      /* THE LIVE CHANNEL: drive it the way an outside page would. */
      JBH.listen(true);
      const viaBus = await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const id = 'probe1';
        const to = setTimeout(() => { bc.close(); res({ timedOut: true }); }, 2500);
        bc.onmessage = ev => { if (!ev.data || ev.data.id !== id) return;
          clearTimeout(to); bc.close(); res(ev.data); };
        bc.postMessage({ jbh: 1, id, call: 'state', args: [] });
      });
      o.busReply = viaBus && viaBus.ok === true
        ? { ok: true, bpm: viaBus.result && viaBus.result.bpm } : viaBus;
      /* an async call over the bus must resolve before replying */
      const viaBusAsync = await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const id = 'probe2';
        const to = setTimeout(() => { bc.close(); res({ timedOut: true }); }, 8000);
        bc.onmessage = ev => { if (!ev.data || ev.data.id !== id) return;
          clearTimeout(to); bc.close(); res(ev.data); };
        bc.postMessage({ jbh: 1, id, call: 'render', args: [{}] });
      });
      o.busAsync = viaBusAsync && viaBusAsync.ok === true
        ? { ok: true, peak: viaBusAsync.result && viaBusAsync.result.peak } : viaBusAsync;
      /* an unknown call must come back as an error, not silence */
      const bad = await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const id = 'probe3';
        const to = setTimeout(() => { bc.close(); res({ timedOut: true }); }, 2500);
        bc.onmessage = ev => { if (!ev.data || ev.data.id !== id) return;
          clearTimeout(to); bc.close(); res(ev.data); };
        bc.postMessage({ jbh: 1, id, call: 'nonsense', args: [] });
      });
      o.badCall = bad;
      /* and OFF means off */
      JBH.listen(false);
      const afterOff = await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const to = setTimeout(() => { bc.close(); res({ silent: true }); }, 1200);
        bc.onmessage = () => { clearTimeout(to); bc.close(); res({ silent: false }); };
        bc.postMessage({ jbh: 1, id: 'probe4', call: 'state', args: [] });
      });
      o.offIsOff = afterOff.silent === true;
      return o;
    });
    t.note('    ' + api.calls.length + ' calls: ' + api.calls.join(' '));
    t.ok('the surface covers sounds, pads, lanes, the instrument and the transport',
      ['presets','preset','pack','sounds','sound','pad','lane','live','step','hit','set','state','render','listen']
        .every(k => api.calls.includes(k)),
      api.calls.join(' '));
    t.ok('every synthesised preset is listable and one lands on a pad',
      api.presetCount > 20 && api.presetOnPad40.pad === 40 && api.pad40.bufId,
      api.presetCount + ' presets · "' + api.pad40.name + '" on pad 41');
    t.ok('ON A PAD PAST THE SIXTEENTH — which the song doc can never describe',
      api.presetOnPad40.pad === 40);
    t.ok('pad properties read and write', api.padReadBack === 0.42,
      'gain ' + api.padReadBack + ', pan ' + api.padWrite.pan);
    t.ok('steps and their locks can be written from outside',
      api.stepsWritten > 0 && api.lockThere,
      api.stepsWritten + ' hits, cutoff lock present');
    t.ok('and so can a tape lane\u2019s clip position', api.laneWrite.start === 1.5 &&
      api.laneWrite.gain === 0.55 && api.laneWrite.loop === true);
    t.ok('and the LIVE instrument, including the new voices and the room',
      api.liveWrite.voice === 'bell' && api.liveWrite.cut === 0.7 && api.liveWrite.room === 0.3);

    t.head('WHILE IT IS PLAYING');
    t.ok('tempo moves under the transport', api.bpm === 133);
    t.ok('the transport really is rolling', api.playingNow === true);
    t.ok('AND A PAD CAN BE HIT AT A MOMENT OF THE AGENT\u2019S CHOOSING',
      api.hit && api.hit.pad === 40,
      'the one thing a pasted document can never express');

    t.head('FROM OUTSIDE THE PAGE');
    t.ok('a call over BroadcastChannel is answered',
      api.busReply && api.busReply.ok === true && api.busReply.bpm === 133,
      JSON.stringify(api.busReply));
    t.ok('AND AN ASYNC ONE RESOLVES BEFORE IT REPLIES — render came back with a real peak',
      api.busAsync && api.busAsync.ok === true && api.busAsync.peak > 0.05,
      JSON.stringify(api.busAsync));
    t.ok('an unknown call comes back as an error rather than as silence',
      api.badCall && api.badCall.ok === false && /no such call/.test(api.badCall.error),
      api.badCall && api.badCall.error);
    t.ok('and OFF MEANS OFF', api.offIsOff);

    t.head('AND IT CAN BE TALKED TO');
    const msg = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(x => setTimeout(x, ms));
      ensureAudio(); await wait(300);
      document.querySelector('#tabs button[data-v="proj"]').click();
      await wait(200);
      o.offAtBoot = { listening: !!jbhBus,
        logHidden: getComputedStyle(document.getElementById('agentLog')).display === 'none' };

      document.getElementById('btnAgentLink').click();
      await wait(150);
      o.afterConnect = { listening: !!jbhBus,
        logShown: getComputedStyle(document.getElementById('agentLog')).display !== 'none',
        btn: document.getElementById('btnAgentLink').textContent };

      /* the app speaks; a listener must hear it */
      const heard = await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const to = setTimeout(() => { bc.close(); res(null); }, 2000);
        bc.onmessage = ev => { if (!ev.data || ev.data.event !== 'say') return;
          clearTimeout(to); bc.close(); res(ev.data); };
        setTimeout(() => { document.getElementById('agentSay').value = 'make it darker';
          document.getElementById('btnAgentSay').click(); }, 60);
      });
      o.appSaid = heard && heard.text;

      /* the agent answers, over the bus, and it lands on screen */
      await new Promise(res => {
        const bc = new BroadcastChannel('jbh88');
        const to = setTimeout(() => { bc.close(); res(); }, 2000);
        bc.onmessage = ev => { if (!ev.data || ev.data.id !== 'm1') return;
          clearTimeout(to); bc.close(); res(); };
        bc.postMessage({ jbh: 1, id: 'm1', call: 'tell', args: ['lowering the cutoff on the hats'] });
      });
      await wait(150);
      o.transcript = JBH.messages().map(m => m.who + ': ' + m.text);
      o.onScreen = document.getElementById('agentLog').textContent;

      /* AND IT MUST NOT BE INJECTABLE. A connected tab is not trusted with
         script execution in here. */
      JBH.tell('<img src=x onerror="window.__pwned=1">');
      await wait(120);
      o.xss = { pwned: !!window.__pwned,
        imgInjected: !!document.getElementById('agentLog').querySelector('img'),
        shownAsText: document.getElementById('agentLog').textContent.includes('<img src=x') };

      document.getElementById('btnAgentLink').click();
      await wait(120);
      o.afterDisconnect = { listening: !!jbhBus,
        logHidden: getComputedStyle(document.getElementById('agentLog')).display === 'none' };
      return o;
    });
    t.ok('IT IS OFF AT BOOT, and the panel says so',
      msg.offAtBoot.listening === false && msg.offAtBoot.logHidden,
      'an app that answers its origin unasked is a different proposition');
    t.ok('opening it shows the panel, and the button offers the way back',
      msg.afterConnect.listening && msg.afterConnect.logShown &&
      /CLOSE LINK|DISCONNECT/.test(msg.afterConnect.btn), msg.afterConnect.btn);
    t.ok('what you type reaches whatever is connected',
      msg.appSaid === 'make it darker', JSON.stringify(msg.appSaid));
    t.ok('and what it answers lands in the transcript, in order',
      msg.transcript.length >= 3 && msg.transcript.some(l => /^you: make it darker$/.test(l)) &&
      msg.transcript.some(l => /^agent: lowering the cutoff/.test(l)),
      msg.transcript.join(' | '));
    t.ok('THE APP\u2019S OWN LINES ARE NOT LABELLED AS THE AGENT',
      msg.transcript.some(l => l.startsWith('app:')) &&
      !msg.transcript.some(l => /^agent: Link open/.test(l)),
      'the greeting used to wear the AGENT badge, so an empty room looked like a reply');
    t.ok('TEXT FROM OUTSIDE CANNOT RUN AS SCRIPT IN HERE',
      msg.xss.pwned === false && msg.xss.imgInjected === false && msg.xss.shownAsText,
      'an injected <img onerror> is shown as the characters it is');
    t.ok('and DISCONNECT puts it all away again',
      msg.afterDisconnect.listening === false && msg.afterDisconnect.logHidden);

    /* Reported, in exactly these words: "it said connect agent, I clicked it,
       said hello, nothing happens." Nothing was SUPPOSED to happen — there was
       no agent — but the app gave no sign of that. It reported the message
       sent, and its own greeting carried the AGENT label, so an empty room
       read as one that had answered and then gone quiet. A feature that
       reports success for doing nothing is worse than one that is missing. */
    t.head('AN EMPTY ROOM SAYS SO');
    const empty = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(x => setTimeout(x, ms));
      document.querySelector('#tabs button[data-v="proj"]').click();
      await wait(150);
      if (jbhBus) document.getElementById('btnAgentLink').click();
      await wait(100);
      o.closedBtn = document.getElementById('btnAgentLink').textContent;
      o.closedStat = document.getElementById('agentStat').textContent.trim();
      document.getElementById('btnAgentLink').click();
      await wait(200);
      o.peersWhenNobodyThere = JBH.peers();
      o.openBtn = document.getElementById('btnAgentLink').textContent;
      o.openStat = document.getElementById('agentStat').textContent.trim();
      o.sayIntoVoid = JBH.say('hello');
      await wait(150);
      o.toldThem = JBH.messages().some(m => m.who === 'app' && /went nowhere/.test(m.text));
      /* now put a peer on the channel and watch it flip */
      const bc = new BroadcastChannel('jbh88');
      bc.postMessage({ jbh: 1, event: 'hello' });
      await wait(250);
      o.peersAfterJoin = JBH.peers();
      o.joinedStat = document.getElementById('agentStat').textContent.trim();
      o.sayWithPeer = JBH.say('now there is someone');
      bc.close();
      document.getElementById('btnAgentLink').click();
      await wait(100);
      return o;
    });
    t.ok('closed, the button offers to open it and the status says nothing can drive the page',
      /OPEN AGENT LINK/.test(empty.closedBtn) && /closed/.test(empty.closedStat),
      empty.closedBtn + ' · ' + empty.closedStat);
    t.ok('OPEN IS NOT THE SAME AS CONNECTED, and the app no longer pretends it is',
      empty.peersWhenNobodyThere === 0 && /waiting/i.test(empty.openBtn) &&
      /nothing has connected yet/.test(empty.openStat),
      empty.openBtn + ' · ' + empty.openStat.slice(0, 60));
    t.ok('saying something into an empty room REPORTS FAILURE rather than success',
      empty.sayIntoVoid.sent === false && empty.sayIntoVoid.noPeer === true,
      JSON.stringify(empty.sayIntoVoid));
    t.ok('and says so in the transcript, where the message they just typed is',
      empty.toldThem);
    t.ok('ONCE SOMETHING JOINS, it flips to connected',
      empty.peersAfterJoin === 1 && /CONNECTED/.test(empty.joinedStat),
      empty.joinedStat.slice(0, 60));
    t.ok('and then a message really is sent', empty.sayWithPeer.sent === true);

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
