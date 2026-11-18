#!/usr/bin/env node
/* JBH-88 AGENT CONNECTOR — the app the person has open, driven by their AI.

   WHY THIS EXISTS. The only way an agent could reach this app was
   mcp/server.mjs, and the app's own instructions for it began
   `cd Clonedit/mcp && npm install`. So every agent asked to "connect to
   JBH-88" did the only thing those words allow: it cloned the person's
   repository — every file in it — onto whatever machine it ran on, installed
   a browser automation library, and then drove a SECOND, hidden copy of the
   app that the person could neither see nor hear. Weaker models went further
   and walked the home directory looking for a path that worked.

   This replaces all of that with one file:

     - NO CLONE, NO INSTALL. It is this file and Node. Download it, point the
       agent's MCP config at it, done. Nothing here reads the repository.
     - IT DRIVES THE PERSON'S OWN WINDOW. The app connects to it over a
       WebSocket on 127.0.0.1, so the agent and the person work on the same
       session at the same time — they see every step land and hear every
       play, and can take over with the mouse whenever they like.
     - ONE FOLDER. The only files it can read or write are in the tracks
       folder (~/Music/JBH-88 by default). Tools take a NAME, never a path.
     - DELIVERABLE. jbh_save_track writes an MP3, a WAV and a session .json
       that reopens in the app, and returns links a chat client can attach.

   WHO MAY CONNECT. It listens on 127.0.0.1 only, so nothing off this
   computer can reach it. A web page can still try — any site can open a
   WebSocket to localhost — so the browser's Origin header decides: the
   published app, and copies served from localhost, are let in; a page from
   anywhere else is refused before it can say a word. A page with no origin
   (a file opened from disk, or a sandboxed frame on someone else's site) must
   also present the token from the link this connector hands out.

   Built into agent/jbh88-agent.mjs by scripts/build-agent.mjs, which bundles
   mcp/tools.mjs and an MP3 encoder into it. Edit this file, not that one. */

import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { TOOLS, GUIDANCE, dispatch, ok, makeTracks, tracksDir, MIME_OF } from '../../mcp/tools.mjs';

const VERSION = '2.0.0';
const SITE = (process.env.JBH_SITE || 'https://tridentintelfree.github.io/Clonedit/').replace(/#.*$/, '');
const FIRST_PORT = +process.env.JBH_PORT || 47888;
const LAST_PORT = FIRST_PORT + 7;
const TOKEN = randomBytes(18).toString('base64url');
/* Four characters both ends display, so the person can see that the tab
   which says CONNECTED is connected to THIS agent and not another one. */
const CODE = createHash('sha256').update(TOKEN).digest('base64url').replace(/[^A-Z2-9]/gi, '')
  .toUpperCase().slice(0, 4);
const log = (...a) => process.stderr.write('[jbh88] ' + a.join(' ') + '\n');

const tracks = makeTracks(tracksDir());

/* ---- who may connect ----------------------------------------------------- */
const siteOrigin = (() => { try { return new URL(SITE).origin; } catch (e) { return null; } })();
const extraOrigins = String(process.env.JBH_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
function originAllowed(origin) {
  if (!origin) return 'token';          // not a browser page — prove it with the token
  if (origin === 'null') return 'token';  // file:// or a sandboxed frame
  if (origin === siteOrigin || extraOrigins.includes(origin)) return 'yes';
  try {
    const u = new URL(origin);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      || u.hostname === '[::1]')) return 'yes';
  } catch (e) {}
  return 'no';
}
function tokenOk(t) {
  const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---- a WebSocket server in ~120 lines, so there is nothing to install ---- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 768 * 1024 * 1024;   // a long WAV as base64 is tens of MB
function wsFrame(op, payload) {
  const n = payload.length;
  let h;
  if (n < 126) { h = Buffer.alloc(2); h[1] = n; }
  else if (n < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  h[0] = 0x80 | op;
  return [h, payload];
}
function wsAccept(req, sock, onMessage, onClose) {
  const key = req.headers['sec-websocket-key'];
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  /* Chunks are kept as a list and joined once a whole frame is present.
     Concatenating on every packet is quadratic, and a 40 MB render arrives
     as hundreds of them. */
  let chunks = [], have = 0, frag = [], fragLen = 0, closed = false;
  const peer = {
    send(text) {
      if (closed) return false;
      for (const b of wsFrame(1, Buffer.from(text, 'utf8'))) sock.write(b);
      return true;
    },
    close(code = 1000, why = '') {
      if (closed) return;
      const p = Buffer.alloc(2 + Buffer.byteLength(why)); p.writeUInt16BE(code, 0); p.write(why, 2);
      try { for (const b of wsFrame(8, p)) sock.write(b); } catch (e) {}
      closed = true; try { sock.end(); } catch (e) {}
      onClose();
    },
  };
  const join = () => { const b = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, have); chunks = [b]; return b; };
  sock.on('data', (d) => {
    chunks.push(d); have += d.length;
    for (;;) {
      if (have < 2) return;
      let b = chunks[0].length >= 14 || chunks.length === 1 ? chunks[0] : join();
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) { if (have < 4) return; b = join(); } len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) { if (have < 10) return; b = join(); }
        len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > MAX_MESSAGE || fragLen + len > MAX_MESSAGE) { peer.close(1009, 'too big or unmasked'); return; }
      const total = off + 4 + len;
      if (have < total) return;
      b = join();
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, total));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      const restBuf = b.subarray(total);
      chunks = restBuf.length ? [restBuf] : []; have = restBuf.length;
      if (op === 8) { peer.close(1000); return; }
      if (op === 9) { for (const x of wsFrame(10, data)) sock.write(x); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        frag.push(data); fragLen += data.length;
        if (fin) { const m = Buffer.concat(frag, fragLen).toString('utf8'); frag = []; fragLen = 0;
          try { onMessage(m); } catch (e) { log('bad message:', e.message); } }
      }
    }
  });
  const gone = () => { if (!closed) { closed = true; onClose(); } };
  sock.on('close', gone); sock.on('error', gone);
  return peer;
}

/* ---- the app on the other end -------------------------------------------- */
let appPeer = null, appInfo = null, nextId = 1;
const pending = new Map();
const waiters = new Set();
let clientName = 'an AI agent';

function attach(peer, info) {
  if (appPeer) {
    /* One window at a time. The newest is the one the person just opened or
       pressed CONNECT in, so it wins, and the old one is told why. */
    try { appPeer.send(JSON.stringify({ jbh: 1, event: 'bye', why: 'another JBH-88 window connected' })); } catch (e) {}
    try { appPeer.close(1000, 'replaced'); } catch (e) {}
  }
  appPeer = peer; appInfo = info;
  log('app connected:', info.build || '(unknown build)', 'from', info.origin || 'no origin');
  for (const w of waiters) w();
  waiters.clear();
}
function detach(peer) {
  if (appPeer !== peer) return;
  appPeer = null; appInfo = null;
  for (const [, p] of pending) p.reject(new Error('The JBH-88 window closed or disconnected while this was running. '
    + 'Ask the person to reopen it; jbh_connect reconnects.'));
  pending.clear();
  log('app disconnected');
}

const http = createServer((req, res) => {
  /* A plain GET answers so a person can check the connector is running by
     opening the address, and so the app can tell "nothing listening" from
     "something listening that is not us". Nothing else is served. */
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ jbh88: 'agent-connector', version: VERSION, app: !!appPeer }));
});
http.on('upgrade', (req, sock) => {
  const refuse = (code, why) => {
    sock.write('HTTP/1.1 ' + code + ' ' + why + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    sock.destroy(); log('refused a connection:', why, req.headers.origin || '(no origin)');
  };
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  /* A Host that is not loopback is DNS rebinding: a site whose name now
     points at 127.0.0.1, which the Origin check alone would also catch. */
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return refuse(403, 'Forbidden host');
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/jbh' || String(req.headers.upgrade).toLowerCase() !== 'websocket'
    || !req.headers['sec-websocket-key']) return refuse(400, 'Bad Request');
  const origin = req.headers.origin;
  const verdict = originAllowed(origin);
  if (verdict === 'no') return refuse(403, 'Origin not allowed');
  if (verdict === 'token' && !tokenOk(u.searchParams.get('t'))) return refuse(401, 'Token required');
  let peer = null;
  peer = wsAccept(req, sock, (text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || m.jbh !== 1) return;
    if (m.event === 'hello') {
      attach(peer, { build: m.build, origin, at: Date.now() });
      peer.send(JSON.stringify({ jbh: 1, event: 'welcome', code: CODE, agent: clientName,
        version: VERSION, tracks: tracks.dir }));
      return;
    }
    if (m.event) return;                          // say / did / ping: nothing to do here
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result === undefined ? null : m.result);
    else p.reject(new Error(m.error || 'the app reported an error'));
  }, () => detach(peer));
});

let PORT = null;
async function listen() {
  for (let p = FIRST_PORT; p <= LAST_PORT; p++) {
    const okp = await new Promise((res) => {
      const onErr = () => { http.off('listening', onOk); res(false); };
      const onOk = () => { http.off('error', onErr); res(true); };
      http.once('error', onErr); http.once('listening', onOk);
      http.listen(p, '127.0.0.1');
    });
    if (okp) { PORT = p; return; }
  }
  throw new Error('ports ' + FIRST_PORT + '-' + LAST_PORT + ' are all in use');
}

function link() { return SITE + '#agent=' + PORT + '.' + TOKEN; }

let opened = false;
function openBrowser(url) {
  if (process.env.JBH_NO_OPEN === '1') return false;
  try {
    let c;
    if (process.platform === 'win32')
      c = spawn('cmd', ['/c', 'start', '""', '"' + url + '"'], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') c = spawn('open', [url], { detached: true, stdio: 'ignore' });
    else c = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    c.on('error', () => {});
    c.unref();
    return true;
  } catch (e) { return false; }
}
const waitForApp = (ms) => appPeer ? Promise.resolve(true) : new Promise((res) => {
  const w = () => { clearTimeout(t); res(true); };
  const t = setTimeout(() => { waiters.delete(w); res(false); }, ms);
  waiters.add(w);
});

function howToConnect() {
  return 'Not connected to JBH-88 yet. Tell the person, in these words: "Open this link on this '
    + 'computer to let me use JBH-88: ' + link() + '" — or, if JBH-88 is already open, press '
    + 'SONG → CONNECT AN AGENT. If the browser asks to let the site reach apps on this device, '
    + 'they should press Allow. The window will show the code ' + CODE + '. Then call jbh_connect again.';
}

/* Connect, opening the person's browser at most once per run if no window
   is there. Every tool goes through this, so an agent that skips jbh_connect
   still gets the same path rather than a bare "not connected". */
async function ensureApp({ open = true, wait = 45000 } = {}) {
  if (appPeer) return true;
  /* A tab that has connected before reconnects on its own every few
     seconds, so give it the chance before opening another one. */
  if (await waitForApp(6000)) return true;
  if (open && !opened) { opened = openBrowser(link()); if (opened) log('opened', SITE); }
  return waitForApp(opened ? wait : 1500);
}

async function jbh(method, args = []) {
  if (!appPeer && !(await ensureApp())) throw new Error(howToConnect());
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    appPeer.send(JSON.stringify({ jbh: 1, id, call: method, args, from: clientName }));
  });
}

/* ---- the tools only this connector has ------------------------------------ */
const OWN_TOOLS = [
  { name: 'jbh_connect', description:
      'START HERE. Connects to the JBH-88 window the person has open on this computer, so you '
      + 'drive their real app while they watch and listen — every step you write lands on '
      + 'their screen. If no window is open it opens one in their browser and waits. If that does '
      + 'not work it returns a link: give the link to the person, in plain words, and call this '
      + 'again. You never need to download, clone or install anything else: this connector is '
      + 'the whole of it. Returns the pairing code the window shows, so the person can confirm '
      + 'it is you.',
    inputSchema: { type: 'object', properties: {
      open: { type: 'boolean', description: 'open the browser if no window is connected (default true)' },
      wait: { type: 'integer', description: 'seconds to wait for the window (default 45)' } } } },
  { name: 'jbh_status', description:
      'Is the person’s JBH-88 window connected, which build is it, and where is the tracks folder. '
      + 'Instant; opens nothing.',
    inputSchema: { type: 'object', properties: {} } },
];
const ALL_TOOLS = [...OWN_TOOLS, ...TOOLS];

const INSTRUCTIONS = [
  'JBH-88 is a groovebox and sampler that runs in the person’s browser. These tools drive THE',
  'WINDOW THEY HAVE OPEN, live: they see every change you make and hear everything you play,',
  'and they can work in it at the same time as you. Be a collaborator: say what you are doing',
  'with jbh_tell, and read jbh_events and jbh_messages for what they did and said.',
  '',
  'FIRST CALL jbh_connect. It finds or opens their window. Never clone a repository, download',
  'source code or install anything to use JBH-88 — this connector is all there is to it.',
  '',
  'FILES: you can read and write ONE folder, the tracks folder (' + tracks.dir + '). Tools',
  'take a file NAME there, never a path; you have no other access to this computer.',
  'TO DELIVER A SONG call jbh_save_track {name}: it writes an MP3 (give them this), a WAV and',
  'a session .json that reopens in JBH-88, and returns their paths and links.',
  '',
  'jbh_clear and jbh_load_track replace what is open in their window. The app takes a',
  'checkpoint first (SONG → REWIND) but ASK before replacing work they have not saved.',
  '',
  GUIDANCE,
].join('\n');

let protocol = '2024-11-05';
async function callTool(name, a) {
  if (name === 'jbh_connect') {
    const was = !!appPeer;
    const got = await ensureApp({ open: a.open !== false, wait: Math.max(1, +a.wait || 45) * 1000 });
    if (!got) return ok({ connected: false, link: link(), code: CODE, opened, says: howToConnect() });
    let st = null; try { st = await jbh('state', []); } catch (e) {}
    try { await jbh('tell', ['Connected to ' + clientName + ' (code ' + CODE + ').']); } catch (e) {}
    return ok({ connected: true, already: was, code: CODE, build: appInfo && appInfo.build,
      tracks: tracks.dir, state: st,
      says: 'Connected to the person’s JBH-88 window (it shows code ' + CODE + '). Call jbh_howto '
        + 'next, then work one sound at a time. Deliver with jbh_save_track.' });
  }
  if (name === 'jbh_status') {
    return ok({ connected: !!appPeer, build: appInfo && appInfo.build, code: CODE, port: PORT,
      link: link(), tracks: tracks.dir, connector: VERSION });
  }
  const r = await dispatch(name, a, { jbh, tracks, protocol });
  if (r !== undefined) return r;
  return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] };
}

/* ---- MCP over stdio, by hand, so there is nothing to install --------------
   Newline-delimited JSON-RPC 2.0 on stdin/stdout. stdout carries protocol
   and nothing else; every log line goes to stderr. */
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const isReq = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize': {
        const want = params.protocolVersion;
        protocol = SUPPORTED.includes(want) ? want : SUPPORTED[0];
        if (params.clientInfo && params.clientInfo.name)
          clientName = String(params.clientInfo.name).slice(0, 60);
        return reply(id, { protocolVersion: protocol,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: 'jbh88', title: 'JBH-88', version: VERSION },
          instructions: INSTRUCTIONS });
      }
      case 'ping': return isReq && reply(id, {});
      case 'tools/list': return reply(id, { tools: ALL_TOOLS });
      case 'tools/call': {
        let r;
        try { r = await callTool(params.name, params.arguments || {}); }
        catch (e) { r = { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] }; }
        return reply(id, r);
      }
      case 'resources/list':
        return reply(id, { resources: tracks.list().map(f => ({ uri: f.uri, name: f.file,
          mimeType: MIME_OF[f.file.split('.').pop().toLowerCase()], size: f.bytes,
          description: 'saved from JBH-88, ' + f.modified.slice(0, 16).replace('T', ' ') })) });
      case 'resources/templates/list': return reply(id, { resourceTemplates: [] });
      case 'resources/read': {
        const file = tracks.fromUri(params.uri);
        const data = tracks.read(file);
        const mime = MIME_OF[file.split('.').pop().toLowerCase()] || 'application/octet-stream';
        return reply(id, { contents: [mime === 'application/json'
          ? { uri: params.uri, mimeType: mime, text: data.toString('utf8') }
          : { uri: params.uri, mimeType: mime, blob: data.toString('base64') }] });
      }
      case 'prompts/list': return reply(id, { prompts: [] });
      default:
        if (isReq) return fail(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    if (isReq) fail(id, -32603, String(e && e.message || e));
  }
}

await listen();
log('JBH-88 connector ' + VERSION + ' listening on 127.0.0.1:' + PORT + ' — code ' + CODE);
log('tracks folder: ' + tracks.dir);
log('to connect by hand, open: ' + link());

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let m; try { m = JSON.parse(line); } catch (e) { return fail(null, -32700, 'Parse error'); }
  if (Array.isArray(m)) m.forEach(x => handle(x)); else handle(m);
});
/* The client closing stdin is how an MCP server is told to stop. */
rl.on('close', () => { try { if (appPeer) appPeer.close(1001, 'agent ended'); } catch (e) {} process.exit(0); });
