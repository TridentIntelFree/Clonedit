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
      o.toldThem = JBH.messages().some(m => m.who === 'app' && /Not sent/i.test(m.text));
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
      empty.peersWhenNobodyThere === 0 && /CLOSE LINK/i.test(empty.openBtn) &&
      /no client attached/i.test(empty.openStat),
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

    /* "Needs to reach every tool… needs access to all effects and
       parameters."

       It did not. Three kinds of gap, and they are different kinds:

       UNREACHABLE — the pattern's own shape (how long it is, how long each
       pad's track is before it repeats, its tempo, its silencer row) and
       POLY, a pad with its own BPM. step() writes inside a pattern and set()
       writes the session around it, and these sat between the two. POLY is
       the sharper loss: polyrhythm was the one rhythm an agent had to ask a
       person for.

       UNDISCOVERABLE — every effect WAS reachable, because set(), pad(),
       lane() and live() each write any field of the thing they own. But
       nothing said the reverb is revType/revSize/revLvl or that the master
       chain is the m-prefixed block, and a name you have to guess is not an
       API.

       UNASKABLE — a clean slate. An agent lands on the demo song and
       everything it does not overwrite stays in the saved file. */
    t.head('THE WHOLE APP, NOT A SHORTLIST');
    const reach = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      o.cleared = JBH.clear(); await w(300);
      o.padsAfterClear = o.cleared.pads.loaded;

      /* DISCOVERY: the names, read off the live objects */
      const pr = JBH.params();
      o.counts = { session: Object.keys(pr.session).length, pad: Object.keys(pr.pad).length,
        live: Object.keys(pr.live).length, lane: Object.keys(pr.lane).length };
      o.namesTheyHadToGuess = ['revType','revSize','revLvl','dlyMode','dlyTone','compAmt',
        'mWidth','mCeil','mAir','mMud','scaleLock','silFade'].filter(k => k in pr.session);
      o.padNames = ['ftype','fcut','fres','drv','crush','eqLo','eqHi','lfoTgt','lfoRate',
        'grSize','grDens','fegAmt'].filter(k => k in pr.pad);
      o.saysHowToWrite = !!(pr.writtenBy && pr.writtenBy.poly && pr.writtenBy.pattern);

      /* and every one of those names must actually take a value */
      JBH.set({ revType:'cath', revSize:4.2, dlyMode:'pingpong', mAir:0.4, compAmt:0.6 });
      o.fxTook = S.revType === 'cath' && S.revSize === 4.2 && S.dlyMode === 'pingpong' &&
        S.mAir === 0.4 && S.compAmt === 0.6;
      await JBH.preset('dhat', 3);
      JBH.pad(3, { ftype:'lp', fcut:0.4, crush:8, lfoOn:true, lfoTgt:'cutoff' });
      o.padFxTook = S.pads[3].ftype === 'lp' && S.pads[3].crush === 8 && S.pads[3].lfoOn === true;

      /* PATTERN SHAPE */
      const p0 = JBH.pattern(0, { plen: 32, bpm: 96 });
      o.plen = p0.plen; o.patBpm = p0.bpm;
      /* growing a pattern must carry full-length tracks with it, or the new
         half silently repeats the old one */
      o.noPhantomPolymeter = Object.keys(p0.len).length === 0;
      const p0b = JBH.pattern(0, { len: { 3: 7 } });
      o.polymeter = p0b.len['3'];

      /* EUCLID */
      o.eu = JBH.euclid(3, 5, 7, 0, 0.6, { fcut: 0.3 });
      o.euLockThere = !!(S.patterns[0].locks['3:0'] || {}).fcut;

      /* POLY — a pad with its own BPM, and per-cell pitch */
      JBH.set({ bpm: 100 });
      const pol = JBH.poly(5, { on:true, bpm:300, cells:3, lock:true, trig:'step',
        row: [[0,0.9,{pitch:0}], [1,0.6,{pitch:3}], [2,0.7,{pitch:7}]] });
      o.poly = { bpm: pol.bpm, cells: pol.cells, hits: pol.hits,
        pitch1: pol.locks['1'] && pol.locks['1'].pitch };
      /* the scheduler's own arithmetic — the same functions the live player
         and the offline bounce share, so this is what the WAV contains */
      const bar = NSTEPS * stepDur(), cfg = polyCfg(S.patterns[0], 5);
      o.perBeat = +(polyHitsPerBar(cfg, bar) / 4).toFixed(3);
      o.quint = (() => { JBH.poly(6, { on:true, bpm:500, cells:5, lock:true, row:[[0,1],[2,1],[4,1]] });
        return +(polyHitsPerBar(polyCfg(S.patterns[0], 6), bar) / 4).toFixed(3); })();
      o.readsBackNull = JBH.poly(40);

      /* COPY, then CLEAR */
      JBH.pattern(1, { copyFrom: 0 });
      o.copiedHits = JBH.pattern(1).hits;
      o.copiedPoly = JBH.pattern(1).poly.length;
      o.clearedHits = JBH.pattern(1, { clear: true }).hits;
      return o;
    });
    t.ok('an agent can ask for a CLEAN SLATE rather than inheriting the demo',
      reach.padsAfterClear === 0, reach.padsAfterClear + ' pads loaded after clear()');
    t.note('    params(): ' + reach.counts.session + ' session · ' + reach.counts.pad +
      ' pad · ' + reach.counts.live + ' live · ' + reach.counts.lane + ' lane');
    t.ok('params() NAMES THE EFFECTS instead of leaving them to be guessed',
      reach.namesTheyHadToGuess.length === 12 && reach.padNames.length === 12 &&
      reach.saysHowToWrite,
      reach.namesTheyHadToGuess.length + '/12 session · ' + reach.padNames.length + '/12 pad');
    t.ok('and every one of those names really takes a value',
      reach.fxTook && reach.padFxTook);
    t.ok('the pattern’s own length and tempo can be set',
      reach.plen === 32 && reach.patBpm === 96, 'plen ' + reach.plen + ' · bpm ' + reach.patBpm);
    t.ok('GROWING A PATTERN CARRIES ITS TRACKS, rather than leaving them short',
      reach.noPhantomPolymeter,
      'tracks left at the old length would make the new half repeat the old, silently');
    t.ok('and a single track can be shortened — polymeter', reach.polymeter === 7);
    t.ok('euclid spreads hits and can lock them', reach.eu.hits === 5 &&
      reach.eu.at.join(',') === '0,2,3,5,6' && reach.euLockThere, reach.eu.at.join(','));
    t.ok('POLY GIVES A PAD ITS OWN BPM, with a pitch per cell',
      reach.poly.bpm === 300 && reach.poly.cells === 3 && reach.poly.hits === 3 &&
      reach.poly.pitch1 === 3, JSON.stringify(reach.poly));
    t.ok('AND THE SCHEDULER AGREES: 300 against 100 is three to the beat, 500 is five',
      reach.perBeat === 3 && reach.quint === 5,
      reach.perBeat + ' and ' + reach.quint + ' per beat — 3:4:5 in one bar');
    t.ok('a pad with no figure reads back as nothing, not as an empty one',
      reach.readsBackNull === null);
    t.ok('a pattern can be copied whole — steps, locks and figures',
      reach.copiedHits > 0 && reach.copiedPoly === 2,
      reach.copiedHits + ' hits, ' + reach.copiedPoly + ' poly pads');
    t.ok('and cleared', reach.clearedHits === 0);

    /* "What would help you interface with it better" — and the answer was
       not more control. It was that render() hands back four numbers for a
       piece three minutes long, so anything else has to be read out of the
       audio, which means writing an onset detector, which means being
       wrong: one written to check these very figures reported 146 onsets
       for four piano notes.

       schedule() is the bounce's own event list, returned from inside the
       same loop that builds the file rather than worked out beside it. The
       first thing it was pointed at found a bug that had been in the
       renderer the whole time. */
    t.head('THE APP CAN SAY WHEN EVERY NOTE LANDS');
    const sch = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      JBH.clear(); await w(250);
      JBH.set({ bpm: 100, human: 0, swing: 0 });
      await JBH.pack('samples/real-cc0-full.json');

      /* nearest(): the call that makes the transposition mistake hard */
      o.near = [60, 61, 66].map(m => { const g = JBH.nearest(m, 'piano');
        return { ask: m, id: g.id, by: g.semitones }; });
      o.pickedViolin = JBH.nearest(62, 'violin').id;

      const ld = await JBH.sound('vsco:piano-E4', 1);
      o.sampleKnowsItsNote = ld.note;
      o.padKnowsItsNote = JBH.pad(1).srcNote;

      /* THE REGRESSION. A step-fired figure with a pitch on every cell.
         The renderer used to push pitch:0 here and drop the cell's lock
         entirely, so this bounced as one note three times while the live
         player played the written figure. */
      JBH.poly(1, { on: true, bpm: 300, cells: 3, lock: true, trig: 'step',
        row: [[0, 0.9, { pitch: 0 }], [1, 0.8, { pitch: 3 }], [2, 0.7, { pitch: 7 }]] });
      JBH.step(1, 0, 1);
      const s = await JBH.schedule({ src: 'pat' });
      o.fig = s.events.filter(e => e.pad === 1)
        .map(e => ({ t: e.t, pitch: e.pitch, midi: e.midi, vel: e.vel }));
      o.gaps = o.fig.slice(1).map((e, i) => +(e.t - o.fig[i].t).toFixed(3));

      /* levels(): a balance table from one call */
      await JBH.sound('vsco:piano-C4', 0);
      JBH.step(0, 0, 1); JBH.step(0, 8, 0.9);
      JBH.pad(0, { gain: 1.0 }); JBH.pad(1, { gain: 0.05 });
      const lv = await JBH.levels({ src: 'pat' });
      o.levels = lv.pads.map(x => ({ pad: x.pad, hits: x.hits, dbRms: x.dbRms }));
      o.buried = lv.buried;

      /* batch(): many calls, one crossing, failures reported in place */
      const bt = await JBH.batch([['set', { bpm: 111 }], ['step', 0, 4, 0.5],
        ['nope'], ['state']]);
      o.batch = { n: bt.n, failed: bt.failed, err: bt.results[2].error,
        stillRan: S.bpm === 111 && bt.results[3].ok === true };
      return o;
    });
    t.ok('nearest() names the closest real sample and how far the bend is',
      sch.near[0].by === 0 && Math.abs(sch.near[1].by) === 1 &&
      Math.abs(sch.near[2].by) <= 1 && /violin/.test(sch.pickedViolin),
      sch.near.map(x => x.ask + '→' + x.id + ' ' + x.by).join(' · '));
    t.ok('a pad REMEMBERS WHAT NOTE ITS SAMPLE IS',
      sch.sampleKnowsItsNote === 64 && sch.padKnowsItsNote === 64,
      'nothing in the app knew that "Piano C4" was middle C');
    t.ok('schedule() reports the figure’s times, three to the beat at 100bpm',
      sch.fig.length === 3 && sch.gaps.every(g => Math.abs(g - 0.2) < 0.002),
      sch.fig.map(e => e.t).join(' ') + ' · gaps ' + sch.gaps.join(' '));
    t.ok('AND THE BOUNCE CARRIES EVERY CELL’S OWN PITCH — it used to carry none',
      sch.fig.map(e => e.pitch).join(',') === '0,3,7' &&
      sch.fig.map(e => e.midi).join(',') === '64,67,71',
      'the renderer pushed pitch:0 for step-fired figures, so a written ' +
      'melody bounced as one note repeated while it played correctly live');
    t.ok('and the velocity of each cell survives too',
      sch.fig.map(e => e.vel).join(',') === '0.9,0.8,0.7', sch.fig.map(e => e.vel).join(','));
    t.ok('levels() gives a per-pad balance table in ONE call, in dB',
      sch.levels.length === 2 && sch.levels.some(x => x.dbRms < -12),
      sch.levels.map(x => 'pad' + x.pad + ' ' + x.dbRms + 'dB').join(' · '));
    t.ok('and says outright which pads are buried', Array.isArray(sch.buried));
    /* THE MISTAKE THE APP NOW CATCHES BY ITSELF.

       Twice in a row, by someone who knew about it and was checking for it,
       a piece written from real instrument samples came out stretched far
       enough to stop sounding like the instrument. Once from writing notes
       outside the sampled range; once from sharing one pad between two
       registers so its root drifted a fifth from what it was asked to play.
       Both times the per-note arithmetic said everything was fine. The
       renderer knew and had no way to say so. Now it says so. */
    const str = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      JBH.clear(); await w(250);
      JBH.set({ bpm: 100, human: 0 });
      await JBH.pack('samples/real-cc0-full.json');
      await JBH.sound('vsco:piano-C4', 0);      // a recording of middle C
      await JBH.preset('dkick', 1);             // synthesised, not a recording
      JBH.step(0, 0, 1, { pitch: 7 });          // a piano asked for a fifth
      JBH.step(1, 8, 1, { pitch: 9 });          // a kick pitched up: ordinary
      const a = await JBH.schedule({ src: 'pat' });
      o.flagged = a.stretched;
      o.limit = a.stretchLimit;
      /* load a root near the note and it goes quiet */
      await JBH.sound('vsco:piano-G4', 2);
      JBH.step(0, 0, 0); JBH.step(2, 0, 1, { pitch: 0 });
      o.after = (await JBH.schedule({ src: 'pat' })).stretched;
      return o;
    });
    t.ok('schedule() SAYS WHEN A RECORDED INSTRUMENT IS BEING STRETCHED TOO FAR',
      str.flagged.length === 1 && str.flagged[0].pad === 0 &&
      str.flagged[0].semitones === 7 && str.flagged[0].root === 60,
      JSON.stringify(str.flagged));
    t.ok('and does NOT cry about a pitched drum, which is ordinary technique',
      !str.flagged.some(x => x.pad === 1),
      'the first version flagged a kick moved nine semitones; that is not a mistake');
    t.ok('and goes quiet once a root near the note is loaded',
      str.after.length === 0, JSON.stringify(str.after));

    t.ok('batch() runs them all and reports a failure IN PLACE',
      sch.batch.n === 4 && sch.batch.failed === 1 &&
      /no such call/.test(sch.batch.err) && sch.batch.stillRan,
      'one bad call in eight hundred should not lose the other 799');

    /* WRITE NOTES, NOT PADS.

       Everything else here is pad-shaped and music is not. A piano part
       means choosing a sample per note, loading a spread of roots wide
       enough that none is bent far, allocating a pad to each, resolving
       every note to a pad and an offset, and merging what lands on one pad
       at one step into a chord instead of overwriting it. Eighty lines, the
       same eighty for anybody, and it was written by hand twice here and
       was wrong both times — in different ways, neither of which failed
       loudly. */
    t.head('AN INSTRUMENT, NOT SIXTY-FOUR PADS');
    const inst = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      JBH.clear(); await w(250);
      JBH.set({ bpm: 96, human: 0, swing: 0 });
      o.lay = await JBH.instrument('piano', { pack: 'samples/real-cc0-full.json',
        match: 'vsco:piano', lo: 40, hi: 88, max: 22 });

      /* a chord, then another note ON THE SAME STEP: it must merge */
      JBH.note('piano', [50, 53, 57, 62], 0, 0.7);
      JBH.note('piano', 69, 0, 0.8);
      JBH.note('piano', 67, 4, 0.6);

      /* a figure spanning an octave — grouped by register, so no one sample
         is stretched across the whole run */
      o.fig = await JBH.figure('piano', { bpm: 288, cells: 5, match: 'vsco:piano',
        notes: [[0, 72, .5], [1, 77, .4], [2, 81, .45], [3, 84, .4], [4, 77, .35]],
        fire: [0, 8] });

      const s = await JBH.schedule({ src: 'pat' });
      o.atStep0 = [...new Set(s.events.filter(e => e.t < 0.1).map(e => e.midi))].sort((a, b) => a - b);
      o.stretched = s.stretched;
      o.notes = s.notes;
      o.noInstrument = (() => { try { JBH.note('tuba', 60, 0, 1); return null; }
        catch (e) { return e.message; } })();
      return o;
    });
    t.ok('instrument() lays a playable range across as many pads as it needs',
      inst.lay.pads.length === 22 && inst.lay.lo <= 41 && inst.lay.hi >= 86,
      inst.lay.pads.length + ' pads, MIDI ' + inst.lay.lo + '-' + inst.lay.hi +
      ', worst bend ' + inst.lay.worstBend);
    t.ok('note() RESOLVES PITCH TO A PAD, and merges a chord with what is there',
      inst.atStep0.includes(50) && inst.atStep0.includes(62) && inst.atStep0.includes(69) &&
      [50, 53, 57, 62, 69].every(m => inst.atStep0.includes(m)),
      'step 0 sounds ' + inst.atStep0.join(',') +
      ' — four written as a chord plus one written separately');
    t.ok('figure() GROUPS ITS CELLS BY REGISTER rather than stretching one sample',
      inst.fig.pads.length >= 2 && inst.fig.pads.length <= 5 && inst.fig.bend <= 3,
      inst.fig.pads.length + ' pads for 5 cells spanning an octave, worst bend ' +
      inst.fig.bend);
    t.ok('and NOTHING COMES OUT OVER-STRETCHED — the renderer agrees',
      inst.stretched.length === 0, JSON.stringify(inst.stretched));
    t.ok('an instrument that was never laid out says so rather than guessing',
      /no instrument/.test(inst.noInstrument || ''), String(inst.noInstrument));

    /* HOW LONG A NOTE LASTS.

       A step said when a note STARTED and nothing about when it stopped: it
       rang for exactly as long as its sample. On a drum that is the whole
       truth. On anything sustaining it means a crotchet and a semiquaver
       come out identical, which is not a rhythm — it is a list of attack
       times, and it is why the chamber pieces written here before this all
       had the same legato. */
    const dur = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      const tail = async () => {       // energy well after the note should have gone
        const r = await JBH.render({ src: 'pat', loops: 1, wav: true, depth: 16 });
        const bin = atob(r.wavBase64);
        const dv = new DataView(new ArrayBuffer(bin.length));
        for (let i = 0; i < bin.length; i++) dv.setUint8(i, bin.charCodeAt(i));
        let off = 12, data = null, rate = 48000, ch = 2;
        while (off < bin.length - 8) {
          const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1),
            dv.getUint8(off + 2), dv.getUint8(off + 3));
          const sz = dv.getUint32(off + 4, true);
          if (id === 'fmt ') { ch = dv.getUint16(off + 10, true); rate = dv.getUint32(off + 12, true); }
          if (id === 'data') { data = { start: off + 8, size: sz }; break; }
          off += 8 + sz + (sz & 1);
        }
        const n = Math.floor(data.size / (2 * ch));
        const from = Math.floor(rate * 0.9), to = Math.min(n, Math.floor(rate * 1.8));
        let s = 0, c = 0;
        for (let i = from; i < to; i++) { const v = dv.getInt16(data.start + i * 2 * ch, true) / 32768; s += v * v; c++; }
        return { tail: +Math.sqrt(s / c).toFixed(5), peak: r.peak };
      };
      const lay = async () => { JBH.clear(); await w(200);
        JBH.set({ bpm: 120, human: 0, swing: 0 });
        await JBH.instrument('pf', { pack: 'samples/real-cc0-full.json',
          match: 'vsco:piano', lo: 55, hi: 72, max: 6 }); };

      await lay(); JBH.note('pf', 60, 0, 0.9);
      o.ring = await tail();
      await lay(); JBH.note('pf', 60, 0, 0.9, { beats: 0.5 });   // a quaver at 120
      o.cut = await tail();
      o.sched = (await JBH.schedule({ src: 'pat' })).events[0];
      return o;
    });
    t.ok('A NOTE CAN BE CUT SHORT — it rang for its whole sample before',
      dur.ring.tail > 0.004 && dur.cut.tail < dur.ring.tail / 20,
      'tail RMS ' + dur.ring.tail + ' ringing vs ' + dur.cut.tail + ' cut to a quaver');
    t.ok('and the ATTACK is untouched — it is shorter, not quieter',
      Math.abs(dur.ring.peak - dur.cut.peak) < 0.004,
      'peak ' + dur.ring.peak + ' vs ' + dur.cut.peak);
    t.ok('beats are converted to seconds at the tempo they are written at',
      dur.sched.len === 0.25, 'half a beat at 120bpm · reported len ' + dur.sched.len);

    /* THE REST OF WHAT A FINISHED RECORD NEEDS.

       Three things the portal could not do, each of which the app could.
       It could build an arrangement but not a PERFORMANCE — no crescendo,
       no filter opening across eight bars — because the automation lanes
       were reachable only by dragging a finger across the AUTO tab. It
       could bounce the mix but never a STEM, though renderMix has always
       taken a pad set. And it was judging its own masters on peak and RMS
       while the BOUNCE button computed a properly gated LUFS and a true
       peak and wrote them to a log nothing outside the page can read. */
    t.head('A PERFORMANCE, STEMS, AND THE NUMBERS A RELEASE IS JUDGED ON');
    const fin = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      JBH.clear(); await w(250);
      JBH.set({ bpm: 110, human: 0, swing: 0 });
      await JBH.preset('dkick', 0); await JBH.preset('dsnare', 1); await JBH.preset('dhat', 2);
      [0, 4, 8, 12].forEach(s => JBH.step(0, s, 1));
      [4, 12].forEach(s => JBH.step(1, s, .9));
      [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => JBH.step(2, s, .5));

      o.targets = Object.keys(JBH.autoTargets());
      o.liveOnly = JBH.automate('scd', [[0, .2], [15, .9]]).inTheBounce;

      /* brightness of the first half against the second, measured off the
         rendered file — the only way to know a sweep is in the audio and
         not merely in the data */
      const bright = async () => {
        const r = await JBH.render({ src: 'pat', loops: 1, wav: true, depth: 16 });
        const bin = atob(r.wavBase64), dv = new DataView(new ArrayBuffer(bin.length));
        for (let i = 0; i < bin.length; i++) dv.setUint8(i, bin.charCodeAt(i));
        let off = 12, data = null, rate = 48000, ch = 2;
        while (off < bin.length - 8) {
          const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1),
            dv.getUint8(off + 2), dv.getUint8(off + 3));
          const sz = dv.getUint32(off + 4, true);
          if (id === 'fmt ') { ch = dv.getUint16(off + 10, true); rate = dv.getUint32(off + 12, true); }
          if (id === 'data') { data = { start: off + 8, size: sz }; break; }
          off += 8 + sz + (sz & 1);
        }
        const n = Math.floor(data.size / (2 * ch));
        const zc = (a, b2) => { let z = 0, prev = 0;
          for (let i = a; i < b2; i++) { const v = dv.getInt16(data.start + i * 2 * ch, true);
            if ((v >= 0) !== (prev >= 0)) z++; prev = v; }
          return Math.round(z / ((b2 - a) / rate)); };
        const half = Math.floor(n / 2);
        return { early: zc(0, half), late: zc(half, n) };
      };
      o.flat = await bright();
      JBH.automate('mfilt', [[0, 0.08], [15, 1.0]]);
      o.swept = await bright();
      o.sweepInfo = JBH.automate('mfilt', [[0, 0.08], [8, 0.4], [15, 1.0]]);

      /* loudness, and stems */
      o.master = await JBH.render({ src: 'pat', loops: 2, loudness: true });
      o.kick = await JBH.render({ src: 'pat', loops: 2, only: [0] });
      o.hat = await JBH.render({ src: 'pat', loops: 2, only: [2] });
      o.cleared = JBH.automate('mfilt', null).cleared;
      return o;
    });
    t.ok('every automation target is listed with its current value',
      fin.targets.length >= 5 && fin.targets.includes('mfilt') && fin.targets.includes('mvol'),
      fin.targets.join(' '));
    t.ok('AND A SWEPT FILTER IS IN THE AUDIO, not just in the data',
      fin.swept.late - fin.swept.early > (fin.flat.late - fin.flat.early) + 300,
      'zero crossings early→late: ' + fin.flat.early + '→' + fin.flat.late + ' flat, ' +
      fin.swept.early + '→' + fin.swept.late + ' swept');
    t.ok('a lane says whether it is baked into the bounce or live only',
      fin.liveOnly === false && fin.sweepInfo.inTheBounce === true,
      'sidechain depth is read at trigger time; the master filter is baked');
    t.ok('THE MEASUREMENTS A RELEASE IS JUDGED ON, not just peak and RMS',
      fin.master.lufs < 0 && fin.master.truePeakDb < 0 && fin.master.crestDb > 3 &&
      typeof fin.master.vsStreaming === 'number',
      fin.master.lufs + ' LUFS · ' + fin.master.truePeakDb + ' dBTP · crest ' +
      fin.master.crestDb + ' dB · ' + fin.master.vsStreaming + ' vs streaming');
    t.ok('STEMS: one instrument at a time, the same length as the master',
      fin.kick.only.join() === '0' && fin.kick.seconds === fin.master.seconds &&
      fin.hat.rms < fin.kick.rms / 4 && !fin.hat.silent,
      'kick rms ' + fin.kick.rms + ' · hat rms ' + fin.hat.rms);
    t.ok('and a lane can be cleared again', fin.cleared === true);

    /* THE SAME NOTE, RECORDED SEVERAL TIMES.

       "They haven't sounded right at all yet." They had not, and the
       reason was never the mixing: every instrument loaded here was ONE
       recording per note, stretched across every dynamic. A filter was
       darkening the quiet notes and a waveshaper inventing a top end the
       mp3 never had — about 16dB of manufactured timbre where a real
       piano moves 31dB, and none of it with the right character, because
       a fortissimo note is a different event and not a brighter one.

       A pad has had `layers` and a layMode of 'vel' since long before
       any of this, and it had never once been used, because nothing in
       the shipped library carried more than one dynamic per note. */
    t.head('VELOCITY LAYERS — THE SAME NOTE, RECORDED SEVERAL TIMES');
    const vel = await page.evaluate(async () => {
      const o = {}, w = ms => new Promise(r => setTimeout(r, ms));
      JBH.clear(); await w(250);
      JBH.set({ bpm: 100, human: 0, swing: 0 });
      o.lay = await JBH.instrument('tv', { pack: 'tests/fixtures/vel-pack.json',
        match: '^tv:' });
      const pads = JBH.instPads('tv');
      o.pads = pads.length;
      const p = S.pads[pads[0].pad];
      o.mode = p.layMode;
      o.layers = (p.layers || []).length;
      /* EVERY LAYER MUST BE ITS OWN RECORDING. Sharing a buffer would mean
         the velocity switch picks between identical audio, which measures
         as working and sounds like nothing. */
      o.distinctBuffers = new Set([p.bufId, ...(p.layers || []).map(l => l.bufId)]).size;
      /* and the engine must choose a different one as the note gets harder */
      o.picked = [0.1, 0.5, 0.95].map(v => pickLayerIdx({}, p, pads[0].pad, v));
      /* THE REGRESSION. instrument() thinned its candidates by SAMPLE, and
         once a pack carried several dynamics per note that tore the groups
         apart — a six-dynamic piano came back claiming four, with a
         different four on every note. It counts notes now. */
      o.dynamics = o.lay.dynamics;
      o.layered = o.lay.velocityLayered;
      return o;
    });
    t.ok('an instrument built from a multi-dynamic pack stacks them on one pad',
      vel.pads === 2 && vel.layers === 2 && vel.mode === 'vel',
      vel.pads + ' notes, ' + vel.layers + ' layers on the first, mode ' + vel.mode);
    t.ok('EVERY DYNAMIC IS ITS OWN RECORDING, not the same buffer three times',
      vel.distinctBuffers === 3, vel.distinctBuffers + ' distinct buffers across 3 dynamics');
    t.ok('and a harder note really does select a different one',
      vel.picked[0] === 0 && vel.picked[2] === 2 && vel.picked[0] !== vel.picked[1],
      'velocity 0.1 / 0.5 / 0.95 → layer ' + vel.picked.join(' / '));
    t.ok('THINNING COUNTS NOTES, so the velocity groups survive it',
      vel.dynamics === 3 && vel.layered === 2,
      'counting samples instead shredded a six-dynamic piano down to four');

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
      o.statPointsAtIt = /Connecting a client/i.test(
        document.getElementById('agentStat').textContent);
      o.transcriptPointsAtIt = JBH.messages().some(
        m => m.who === 'app' && /Connecting a client/i.test(m.text));

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
