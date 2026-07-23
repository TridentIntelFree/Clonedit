/* JBH-88 beta-feedback relay — Cloudflare Worker.
 *
 * The app is a static offline file and cannot safely write to GitHub itself
 * (that needs a secret, and an embedded secret gets abused). This tiny relay
 * holds the secret server-side, accepts one short report at a time, and stores
 * it in the repo as a RING BUFFER capped at 100 — so a spam flood can never
 * grow the inbox beyond 100 short messages.
 *
 * ── Deploy (once) ────────────────────────────────────────────────────────
 *   1. Create a GitHub fine-grained token limited to THIS repo with
 *      "Contents: Read and write". Nothing else.
 *   2. `npm i -g wrangler` then `wrangler deploy` this file (or paste it into
 *      the Cloudflare dashboard → Workers → Quick edit).
 *   3. Set these as Worker variables/secrets:
 *        GH_TOKEN   (secret)  the fine-grained token
 *        GH_REPO    (var)     "owner/name"  e.g. "tridentintelfree/clonedit"
 *        GH_BRANCH  (var)     "main"
 *        GH_PATH    (var)     "feedback/inbox.json"
 *   4. Copy the Worker's URL into the app: set FEEDBACK_ENDPOINT in index.html.
 *
 * The token never touches the app or the testers. The Worker only appends;
 * it can't read other files or damage the repo beyond feedback/inbox.json.
 */

const CAP = 100;            // hard ceiling on stored reports (ring buffer)
const MAX_BLOB = 8000;      // reject anything bigger than a short report + diag
const MIN_INTERVAL_MS = 4000; // soft per-IP throttle (best-effort, in-memory)

const seen = new Map();     // ip -> last accept time (per-isolate, best effort)

export default {
  async fetch(req, env) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return j({ error: 'POST only' }, 405, cors);

    const ip = req.headers.get('cf-connecting-ip') || '';
    const last = seen.get(ip) || 0;
    if (Date.now() - last < MIN_INTERVAL_MS) return j({ error: 'slow down' }, 429, cors);

    let body;
    try { body = await req.json(); } catch (e) { return j({ error: 'bad json' }, 400, cors); }
    const blob = (body && body.blob || '').toString();
    if (!/^jbhfb1:[A-Za-z0-9+/=]+$/.test(blob) || blob.length > MAX_BLOB)
      return j({ error: 'invalid report' }, 400, cors);

    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await ghGet(env);
      const data = (cur.json && Array.isArray(cur.json.reports))
        ? cur.json
        : { fmt: 'jbh-inbox-1', cap: CAP, updated: '', reports: [] };
      data.reports.push({ t: new Date().toISOString(), ip: await hash(ip), blob });
      if (data.reports.length > CAP) data.reports = data.reports.slice(-CAP);  // keep newest 100
      data.cap = CAP;
      data.updated = new Date().toISOString();
      const put = await ghPut(env, JSON.stringify(data, null, 1), cur.sha);
      if (put.ok) { seen.set(ip, Date.now()); return j({ ok: true, stored: data.reports.length }, 200, cors); }
      if (put.status !== 409) return j({ error: 'store failed', status: put.status }, 502, cors);
      // 409 = someone else wrote first; re-read and retry
    }
    return j({ error: 'busy, try again' }, 429, cors);
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}

function api(env, path) { return 'https://api.github.com/repos/' + env.GH_REPO + path; }
function ghHeaders(env) {
  return { authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'jbh-feedback', 'x-github-api-version': '2022-11-28' };
}
async function ghGet(env) {
  const url = api(env, '/contents/' + env.GH_PATH + '?ref=' + (env.GH_BRANCH || 'main'));
  const r = await fetch(url, { headers: ghHeaders(env) });
  if (r.status === 404) return { sha: null, json: null };
  if (!r.ok) return { sha: null, json: null };
  const f = await r.json();
  let json = null;
  try { json = JSON.parse(atob(f.content.replace(/\n/g, ''))); } catch (e) {}
  return { sha: f.sha, json };
}
async function ghPut(env, contentStr, sha) {
  const url = api(env, '/contents/' + env.GH_PATH);
  const b64 = btoa(unescape(encodeURIComponent(contentStr)));
  const payload = { message: 'feedback: new beta report', content: b64, branch: env.GH_BRANCH || 'main' };
  if (sha) payload.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(payload) });
  return { ok: r.ok, status: r.status };
}
async function hash(s) {   // short, non-reversible tag so repeat spammers are visible without storing IPs
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('jbh:' + s));
    return [...new Uint8Array(buf)].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return 'anon'; }
}
