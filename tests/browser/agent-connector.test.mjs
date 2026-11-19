/* THE AGENT CONNECTOR, END TO END: a real connector process, the real app in
   a real browser, and an MCP client on the other end — the three pieces a
   person actually has.

   What it has to prove is what the old route got wrong. That route told an
   agent to clone the repository and install a browser, then drove a hidden
   second copy of the app. So:

     - the connector runs from its one file, with nothing installed beside it;
     - the app the person has OPEN is what it drives, and the person can see
       that it is connected and what it is doing;
     - the only files it can write or read are in its tracks folder, whatever
       name it is handed;
     - a page from another site cannot connect to it at all;
     - a finished song comes out as an MP3, a WAV and a session that loads. */

import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { boot, checker, ROOT } from './harness.mjs';

function mcpClient(child) {
  let buf = '', id = 0;
  const waits = new Map();
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      const w = waits.get(m.id); if (w) { waits.delete(m.id); w(m); }
    }
  });
  const rpc = (method, params) => new Promise((res, rej) => {
    const n = ++id;
    const to = setTimeout(() => { waits.delete(n); rej(new Error(method + ' timed out')); }, 120000);
    waits.set(n, m => { clearTimeout(to); res(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
  });
  const tool = async (name, args = {}) => {
    const m = await rpc('tools/call', { name, arguments: args });
    const r = m.result || {};
    const text = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    let json = null; try { json = JSON.parse((r.content || [])[0].text); } catch (e) {}
    return { r, text, json, isError: !!r.isError };
  };
  return { rpc, tool };
}

/* A raw WebSocket upgrade, so a test can be a hostile page: a browser cannot
   be made to send a forged Origin, but that is exactly the header the
   connector decides on, so the refusal is tested at the level it happens. */
function upgrade(port, headers, path = '/jbh') {
  return new Promise(res => {
    const req = request({ host: '127.0.0.1', port, path, headers: Object.assign({
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' }, headers) });
    req.on('upgrade', (r, sock) => { sock.destroy(); res(101); });
    req.on('response', r => { r.resume(); res(r.statusCode); });
    req.on('error', () => res(0));
    req.end();
  });
}

export default async function ({ browser, base }) {
  const t = checker();
  /* The connector is copied out of the repository before it is run, into a
     directory with no node_modules anywhere above it. If it imports anything
     it did not bundle, it dies here — which is the "no install" promise,
     checked rather than claimed. */
  const work = mkdtempSync(join(tmpdir(), 'jbh-agent-'));
  const exe = join(work, 'jbh88-agent.mjs');
  copyFileSync(resolve(ROOT, 'agent', 'jbh88-agent.mjs'), exe);
  const tracks = join(work, 'tracks');
  const child = spawn(process.execPath, [exe], { cwd: work, stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { JBH_NO_OPEN: '1', JBH_TRACKS: tracks,
      JBH_SITE: base + '/index.html', NODE_PATH: '' }) });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const mcp = mcpClient(child);
  const { ctx, page, errors } = await boot(browser, base);
  try {
    t.head('IT STARTS FROM ITS ONE FILE, WITH NOTHING INSTALLED');
    const init = await mcp.rpc('initialize', { protocolVersion: '2025-06-18',
      clientInfo: { name: 'test-agent', version: '1' }, capabilities: {} });
    const res = init.result || {};
    t.ok('it completes the MCP handshake', res.serverInfo && res.serverInfo.name === 'jbh88',
      JSON.stringify(res.serverInfo) + ' ' + (init.error ? init.error.message : ''));
    t.ok('and its first words to the model are: connect first, and never clone',
      /FIRST CALL jbh_connect/.test(res.instructions || '') && /Never clone/i.test(res.instructions || ''),
      (res.instructions || '').split('\n').slice(5, 7).join(' '));
    const list = await mcp.rpc('tools/list', {});
    const names = (list.result.tools || []).map(x => x.name);
    t.ok('jbh_connect is the first tool, and the delivery tools are there',
      names[0] === 'jbh_connect' && names.includes('jbh_save_track') && names.includes('jbh_list_tracks'),
      names.length + ' tools, first ' + names[0]);
    const st0 = (await mcp.tool('jbh_status')).json;
    const port = st0 && st0.port;
    t.ok('it is listening on loopback', port >= 47888 && port <= 47895, 'port ' + port);

    t.head('A PAGE FROM ANOTHER SITE CANNOT CONNECT');
    const evil = await upgrade(port, { Origin: 'https://evil.example', Host: '127.0.0.1:' + port });
    const noOrigin = await upgrade(port, { Host: '127.0.0.1:' + port });
    const rebind = await upgrade(port, { Origin: 'http://127.0.0.1:9', Host: 'evil.example:' + port });
    const token = /#agent=\d+\.([A-Za-z0-9_-]+)/.exec(st0.link)[1];
    const withToken = await upgrade(port, { Host: '127.0.0.1:' + port }, '/jbh?t=' + token);
    t.ok('another site’s page is refused by its Origin', evil === 403, 'HTTP ' + evil);
    t.ok('a caller with no origin and no token is refused', noOrigin === 401, 'HTTP ' + noOrigin);
    t.ok('a rebound hostname is refused', rebind === 403, 'HTTP ' + rebind);
    t.ok('and the token from the link is what lets a page with no origin in', withToken === 101, 'HTTP ' + withToken);

    t.head('THE PERSON PRESSES CONNECT, AND THE APP THEY HAVE OPEN IS WHAT IT DRIVES');
    const before = await page.evaluate(async () => {
      document.querySelector('#tabs button[data-v="proj"]').click();
      await new Promise(r => setTimeout(r, 100));
      const b = document.getElementById('btnAgentConnect');
      const box = b.getBoundingClientRect();
      return { label: b.textContent, shown: b.offsetParent !== null && box.width > 0,
        pipHidden: document.getElementById('agentPip').hidden };
    });
    t.ok('the button is on screen in the SONG tab, not behind the advanced switch',
      before.shown && /CONNECT AN AGENT/.test(before.label), before.label);
    const conn = await page.evaluate(async () => {
      document.getElementById('btnAgentConnect').click();
      for (let i = 0; i < 60 && !agentCount(); i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 100));
      const pip = document.getElementById('agentPip');
      return { n: agentCount(), agents: JBH.agents(), pip: !pip.hidden && pip.textContent,
        stat: document.getElementById('agentConnStat').textContent,
        btn: document.getElementById('btnAgentConnect').textContent,
        auto: localStorage.getItem('jbh_agent_auto') };
    });
    t.ok('the app finds the connector by itself', conn.n === 1, JSON.stringify(conn.agents));
    t.ok('it names the agent and shows the code', conn.agents[0] && conn.agents[0].agent === 'test-agent'
      && conn.agents[0].code === st0.code && conn.stat.includes(st0.code), conn.stat.slice(0, 90));
    t.ok('a pill in the header says an agent is in the room', /AGENT/.test(conn.pip || ''), String(conn.pip));
    t.ok('and it will reconnect by itself next time', conn.auto === '1');
    const c = (await mcp.tool('jbh_connect', { wait: 5 })).json;
    t.ok('jbh_connect reports the same window and the same code',
      c && c.connected && c.code === conn.agents[0].code, c && c.says);

    t.head('IT WORKS IN THAT WINDOW, LIVE');
    const ck0 = await page.evaluate(async () => (await ckptKeys()).length);
    await mcp.tool('jbh_clear');
    const ck1 = await page.evaluate(async () => (await ckptKeys()).length);
    t.ok('replacing the session takes a checkpoint first, so nothing open is lost',
      ck1 > ck0 || ck1 === 6, ck0 + ' → ' + ck1 + ' checkpoints');
    await mcp.tool('jbh_load_preset', { id: 'dkick', pad: 0 });
    for (const s of [0, 4, 8, 12]) await mcp.tool('jbh_step', { pad: 0, step: s, vel: 0.9 });
    await mcp.tool('jbh_set', { props: { bpm: 97 } });
    const live = await page.evaluate(() => ({ bpm: S.bpm, name: S.pads[0].name,
      steps: [0, 4, 8, 12].filter(s => S.patterns[S.pattern].steps[0][s]).length,
      shown: document.getElementById('bpmval').value,
      log: JBH.messages().map(m => m.text).join(' | ') }));
    t.ok('what the agent writes is in the person’s session', live.bpm === 97 && live.steps === 4,
      'bpm ' + live.bpm + ', pad 1 ' + live.name + ', ' + live.steps + '/4 steps');
    t.ok('and on their screen', parseFloat(live.shown) === 97, 'tempo box reads ' + live.shown);
    t.ok('the transcript says who connected', /Agent connected: test-agent/.test(live.log));

    t.head('A SONG CHAIN IN THE SHAPE PEOPLE GUESS IS ACCEPTED');
    /* set({song:[[0,1]]}) was stored as given, form() then called it no
       arrangement and review() crashed reading .sil off an array. */
    await mcp.tool('jbh_set', { props: { song: [[0, 2]], songOn: false } });
    const chain = await page.evaluate(() => JSON.stringify(S.song));
    const junk = await mcp.tool('jbh_set', { props: { song: [{ pat: 99 }] } });
    const chain2 = await page.evaluate(() => JSON.stringify(S.song));
    t.ok('pairs become {pat, reps}', chain === '[{"pat":0,"reps":2}]', chain);
    t.ok('and a bad entry is refused by name, leaving the chain alone',
      chain2 === chain && /song entry/.test(JSON.stringify(junk.json && junk.json.warnings)),
      JSON.stringify(junk.json && junk.json.warnings).slice(0, 120));
    await mcp.tool('jbh_set', { props: { song: [] } });

    t.head('A FINISHED SONG COMES OUT AS FILES A CHAT CAN CARRY — AND ONLY INTO ONE FOLDER');
    const saved = await mcp.tool('jbh_save_track', { name: '../../../etc/a beat', src: 'pat', loops: 2 });
    const files = existsSync(tracks) ? readdirSync(tracks).sort() : [];
    t.ok('a name that tries to climb out lands in the tracks folder anyway',
      files.join(',') === 'a beat.json,a beat.mp3,a beat.wav', files.join(', ') + ' in ' + tracks);
    const mp3 = files.includes('a beat.mp3') ? readFileSync(join(tracks, 'a beat.mp3')) : Buffer.alloc(0);
    const wav = files.includes('a beat.wav') ? readFileSync(join(tracks, 'a beat.wav')) : Buffer.alloc(0);
    t.ok('the MP3 is an MP3', mp3.length > 4000 && mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0,
      mp3.length + ' bytes, starts ' + mp3.subarray(0, 2).toString('hex'));
    t.ok('and much smaller than the WAV', wav.toString('ascii', 0, 4) === 'RIFF' && mp3.length * 4 < wav.length,
      'mp3 ' + mp3.length + ' / wav ' + wav.length);
    const links = (saved.r.content || []).filter(x => x.type === 'resource_link');
    t.ok('each file comes back as a link a client can attach',
      links.length === 3 && links.every(l => l.uri.startsWith('file://') && l.mimeType),
      links.map(l => l.name + ' ' + l.mimeType).join(', '));
    t.ok('and the reply names the paths to hand over', saved.json && /Give the person/.test(saved.json.says),
      saved.json && saved.json.says.slice(0, 80));
    const res2 = await mcp.rpc('resources/list', {});
    t.ok('the folder is listed as resources', (res2.result.resources || []).length === 3);
    const outside = await mcp.rpc('resources/read', { uri: 'file:///etc/passwd' });
    t.ok('and a resource outside it cannot be read', !!outside.error && !outside.result,
      outside.error && outside.error.message);
    const sneak = await mcp.tool('jbh_load_session', { path: '/etc/passwd' });
    t.ok('nor can a session path be pointed anywhere else', sneak.isError && /tracks folder/.test(sneak.text),
      sneak.text.slice(0, 90));

    t.head('AND THE SESSION REOPENS');
    await page.evaluate(() => JBH.set({ bpm: 140 }));
    const back = await mcp.tool('jbh_load_track', { name: 'a beat' });
    await page.waitForTimeout(800);
    const reopened = await page.evaluate(() => ({ bpm: S.bpm, name: S.pads[0].name }));
    t.ok('loading it by name brings back what was saved', !back.isError && reopened.bpm === 97,
      'bpm ' + reopened.bpm + ' ' + back.text.slice(0, 60));

    t.head('DISCONNECT MEANS IT');
    const off = await page.evaluate(async () => {
      document.getElementById('btnAgentConnect').click();
      await new Promise(r => setTimeout(r, 300));
      return { n: agentCount(), pip: document.getElementById('agentPip').hidden,
        auto: localStorage.getItem('jbh_agent_auto') };
    });
    await new Promise(r => setTimeout(r, 300));
    const st1 = (await mcp.tool('jbh_status')).json;
    t.ok('the app lets go, hides the pill and stops re-dialling',
      off.n === 0 && off.pip && off.auto === null, JSON.stringify(off));
    t.ok('and the connector knows', st1 && st1.connected === false);

    t.head('THE LINK AN AGENT HANDS OVER GOES TO THE TAB THAT IS ALREADY OPEN');
    /* Two tabs on one project is how autosaves overwrite each other, so a
       link opened while JBH-88 is already up must not start a second
       session of its own. */
    const tab2 = await ctx.newPage();
    await tab2.goto(base + '/index.html#agent=' + port + '.' + token);
    await tab2.waitForFunction(() => window.JBH && document.getElementById('lcdmsg'), null, { timeout: 45000 });
    await page.waitForFunction(() => agentCount() === 1, null, { timeout: 15000 }).catch(() => {});
    await tab2.waitForTimeout(1200);
    const hand = { old: await page.evaluate(() => agentCount()),
      fresh: await tab2.evaluate(() => ({ n: agentCount(), hash: location.hash,
        said: JBH.messages().map(m => m.text).join(' | ') })) };
    t.ok('the tab that was already open takes the connection', hand.old === 1, 'old tab: ' + hand.old);
    t.ok('the new one says it can be closed, and does not connect itself',
      hand.fresh.n === 0 && /other JBH-88 tab/.test(hand.fresh.said), hand.fresh.said.slice(0, 90));
    t.ok('and the token is wiped from the address bar', hand.fresh.hash === '', 'hash ' + hand.fresh.hash);
    await tab2.close();
    await page.evaluate(() => agentDisconnect());

    t.head('JS ERRORS');
    t.ok('none', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
    try { child.stdin.end(); child.kill(); } catch (e) {}
    try { rmSync(work, { recursive: true, force: true }); } catch (e) {}
  }
  if (t.failures.length) t.note('connector stderr:\n' + stderr.slice(-800));
  return t;
}
