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

    /* Reported next, after the empty room was fixed: "I click open agent link
       and it doesn't do anything or provide anything or suggest I put in
       anything or connect to anything." It did do something — it started
       listening, and the panel said so honestly — but it never once said what
       the other end was supposed to BE or where one comes from. Honest about
       being empty is only half the job; a door still needs a sign.

       So this section does not check that the directions exist. It RUNS them.
       The snippet printed on screen is lifted out of the page and executed in
       a same-origin frame, which is what a second tab is as far as
       BroadcastChannel is concerned. If the printed text drifts from the
       envelope the app actually speaks, the link never flips and this fails. */
    /* "I'd like for the agent to be able to use everything in the app,
       including downloadable sounds."

       It could not. JBH.pack(), JBH.sounds() and JBH.sound() all read a
       variable called haveKeys, and no such variable exists — the set is
       called packHaveKeys. Every one of them threw ReferenceError on the
       first call, over every route: MCP, the bus, the console. Nothing ever
       called them, so nothing ever found out. The section above asserted
       that 'pack' and 'sound' appear in JBH.calls(), which is a list of
       names, not a claim that any of them works.

       So these CALL them. And then the pad the caller named, because the old
       path handed off to the button's loader, which picks its own
       destination: a pad that already held a sound was passed over for the
       first empty one in the bank, which scatters a kit an agent is trying
       to lay out deliberately. */
    t.head('DOWNLOADABLE SOUNDS — THE HALF THAT HAD NEVER RUN');
    const dl = await page.evaluate(async () => {
      const o = {};
      const list = await JBH.pack('samples/jbh-drums.json');
      o.listed = list.length;
      o.shape = list[0] && Object.keys(list[0]).sort().join(',');

      /* onto an empty pad past the sixteenth, which no song doc can describe */
      o.far = await JBH.sound('jbh:kick_808', 50);
      o.farName = S.pads[50].name;

      /* and onto one that is ALREADY FULL — it must be replaced, in place,
         with no dialog, and the pads either side left alone */
      const before51 = S.pads[51].bufId, before52 = S.pads[52].bufId;
      await JBH.sound('jbh:hat_open', 51);
      o.second = await JBH.sound('jbh:snare_909', 51);
      o.pad51 = S.pads[51].name;
      o.neighboursUntouched = S.pads[52].bufId === before52;
      o.wasOccupied = before51 < 0;

      /* have-flags come back from the right set now */
      o.haveFlag = JBH.sounds().find(s => s.id === 'jbh:kick_808').have;

      /* and a name that is not in the pack is an error, not a shrug */
      o.unknown = await JBH.sound('jbh:does-not-exist', 53).then(() => null, e => e.message);
      o.pad53Empty = S.pads[53].bufId < 0;
      return o;
    });
    t.ok('JBH.pack() LOADS A MANIFEST AT ALL — this threw ReferenceError before',
      dl.listed > 20, dl.listed + ' sounds, fields: ' + dl.shape);
    t.ok('and sounds() reports which are already on the device', dl.haveFlag === true);
    t.ok('a downloaded sample lands on the pad that was asked for',
      dl.far.pad === 50 && dl.farName === dl.far.name,
      'pad ' + dl.far.pad + ' holds "' + dl.farName + '" (' + dl.far.seconds + 's)');
    t.ok('AND ON AN OCCUPIED PAD IT REPLACES, rather than wandering to an empty one',
      dl.wasOccupied && dl.second.pad === 51 && dl.pad51 === dl.second.name &&
      dl.neighboursUntouched,
      'pad 51 holds "' + dl.pad51 + '", pad 52 untouched: ' + dl.neighboursUntouched);
    t.ok('a sound that is not in the pack throws instead of reporting success',
      /no sound/.test(dl.unknown || '') && dl.pad53Empty, String(dl.unknown));

    t.head('AND IT TELLS YOU HOW TO CONNECT ONE — IN LINES THAT WORK');
    const how = await page.evaluate(async () => {
      const o = {}; const wait = ms => new Promise(x => setTimeout(x, ms));
      document.querySelector('#tabs button[data-v="proj"]').click();
      await wait(150);
      if (jbhBus) document.getElementById('btnAgentLink').click();
      await wait(100);
      const d = document.getElementById('agentHow');
      o.present = !!d;
      if (!d) return o;
      /* The unfold is once-per-page on purpose — a panel that keeps
         reopening itself is its own kind of broken — and the sections above
         already spent it on this page. Put the page back to how it meets a
         person who has just arrived. */
      d.open = false; howShown = false;
      document.getElementById('btnAgentLink').click();
      await wait(250);
      o.openedItself = d.open === true;
      /* …and having read them, you get to put them away. */
      d.open = false;
      document.getElementById('btnAgentLink').click(); await wait(120);
      document.getElementById('btnAgentLink').click(); await wait(250);
      o.stayedClosed = d.open === false;
      o.statPointsAtIt = /How do I connect one/i.test(
        document.getElementById('agentStat').textContent);
      o.transcriptPointsAtIt = JBH.messages().some(
        m => m.who === 'app' && /How do I connect one/i.test(m.text));

      /* THE MCP CONFIG MUST BE CONFIG, not prose that looks like it. */
      const cfg = document.getElementById('cmdMcpCfg').textContent;
      try {
        const j = JSON.parse(cfg);
        const s = j.mcpServers && j.mcpServers.jbh88;
        o.mcp = { parsed: true, cmd: s && s.command, arg: s && s.args && s.args[0] };
      } catch (e) { o.mcp = { parsed: false, err: String(e.message), raw: cfg.slice(0, 80) }; }

      /* THE SNIPPET MUST CONNECT. Run the printed text, unedited, in a
         same-origin frame and watch the app's own presence flip. */
      const snip = document.getElementById('cmdTab').textContent;
      o.peersBefore = JBH.peers();
      const f = document.createElement('iframe');
      f.style.display = 'none'; document.body.appendChild(f);
      try { f.contentWindow.eval(snip); } catch (e) { o.evalErr = String(e.message); }
      await wait(400);
      o.peersAfter = JBH.peers();
      o.statAfter = document.getElementById('agentStat').textContent.trim();

      /* and the call plumbing it prints must round-trip */
      try {
        const r = await f.contentWindow.jbh('state');
        o.roundTrip = { ok: r && r.ok === true, bpm: r && r.result && r.result.bpm };
      } catch (e) { o.roundTrip = { ok: false, err: String(e.message) }; }
      /* the line it tells you to type to talk back must land on screen */
      try { await f.contentWindow.jbh('tell', 'connected from the console'); } catch (e) {}
      await wait(200);
      o.toldArrived = document.getElementById('agentLog').textContent
        .includes('connected from the console');

      f.remove();

      /* THE COPY BUTTONS MUST LEAVE SOMETHING BEHIND. Headless has no
         clipboard permission, which is the same position as a phone on an
         insecure origin — so this exercises the fallback, and the fallback is
         the one that has to work when it matters. Selected text is one
         long-press from a paste; nothing selected is a dead button. */
      getSelection().removeAllRanges();
      document.getElementById('btnCopyMcp').click();
      await wait(300);
      /* NOT read back off the clipboard. navigator.clipboard.readText() waits
         on a permission prompt that headless never answers — the promise does
         not reject, it simply never settles, and .catch() cannot rescue a
         promise that never finishes. It hung this suite once already. The LCD
         says which of the two paths ran, so check the consequence of that
         one. */
      const said = document.getElementById('lcdmsg').textContent;
      o.copyWrote = /COPIED/i.test(said);
      o.copyFellBack = /COULD NOT REACH THE CLIPBOARD/i.test(said);
      o.copySelected = getSelection().toString().length > 20;
      getSelection().removeAllRanges();

      document.getElementById('btnAgentLink').click();
      await wait(100);
      return o;
    });
    t.ok('the panel carries the directions at all', how.present,
      'the whole complaint was that it carried none');
    t.ok('AND OPENS THEM ITSELF the moment the link goes live with nobody on it',
      how.openedItself, 'the question arrives at that exact moment');
    t.ok('and then LEAVES THEM ALONE — closed once, it stays closed',
      how.stayedClosed, 'a panel that keeps reopening itself is its own fault');
    t.ok('the status line and the transcript both point at them',
      how.statPointsAtIt && how.transcriptPointsAtIt);
    t.ok('the MCP block is real config and names the server in this repo',
      how.mcp.parsed === true && how.mcp.cmd === 'node' &&
      /mcp\/server\.mjs$/.test(how.mcp.arg || ''), JSON.stringify(how.mcp));
    t.ok('THE PRINTED SNIPPET ACTUALLY CONNECTS — run unedited, the link flips',
      how.peersBefore === 0 && how.peersAfter === 1 && /CONNECTED/.test(how.statAfter || ''),
      'peers ' + how.peersBefore + '→' + how.peersAfter +
      (how.evalErr ? ' · eval: ' + how.evalErr : ''));
    t.ok('and the call it prints round-trips a real answer',
      how.roundTrip && how.roundTrip.ok === true && how.roundTrip.bpm > 0,
      JSON.stringify(how.roundTrip));
    t.ok('and jbh(‘tell’,…) puts a line on this page, as promised',
      how.toldArrived);
    t.ok('COPY takes one of its two paths and says which — never silence',
      how.copyWrote || how.copyFellBack,
      'a copy button that reports nothing is the same dead button again');
    t.ok('and when the clipboard is out of reach it leaves the text selected',
      how.copyWrote || how.copySelected,
      how.copyFellBack ? 'fell back, selected: ' + how.copySelected : 'wrote to the clipboard');

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.join(' | '));
  } finally {
    await ctx.close();
  }
  return t;
}
