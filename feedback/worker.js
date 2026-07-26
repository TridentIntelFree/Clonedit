/* JBH-88 beta-feedback relay — Cloudflare Worker.
 *
 * The app is a static offline file and cannot safely write to GitHub itself
 * (that needs a secret, and an embedded secret gets abused). This tiny relay
 * holds the secret server-side, accepts one short report at a time, and stores
 * it in the repo as a RING BUFFER capped at 100 — so a spam flood can never
 * grow the inbox beyond 100 short messages.
 *
 * A tester needs no account and installs nothing: the app POSTs here, this
 * writes the report into the repo, and it can be read straight from
 * feedback/inbox.json. Reports are plain Markdown, so no decoding either.
 *
 * ── Deploy (once, about ten minutes, all in a browser) ────────────────────
 *   1. github.com → Settings → Developer settings → Personal access tokens →
 *      Fine-grained tokens → Generate new token.
 *        · Repository access: Only select repositories → this repo
 *        · Permissions: Repository permissions → Contents → Read and write
 *      Nothing else. Copy the token.
 *   2. dash.cloudflare.com → Workers & Pages → Create → Worker → Deploy.
 *      Then "Edit code", paste this whole file over what is there, Deploy.
 *   3. That Worker → Settings → Variables:
 *        GH_TOKEN   (encrypt it)  the token from step 1
 *        GH_REPO    (plain text)  "TridentIntelFree/Clonedit"
 *        GH_BRANCH  (plain text)  "main"
 *        GH_PATH    (plain text)  "feedback/inbox.json"
 *   4. Copy the Worker's URL (…workers.dev) and set FEEDBACK_ENDPOINT in
 *      src/legacy.js, then rebuild. Or, without rebuilding, run this once in
 *      the app's console:
 *        localStorage.setItem('jbh_fb_endpoint','https://…workers.dev')
 *
 * The token never touches the app or the testers. This Worker can only append
 * to that one file; it cannot read anything else or damage the repo.
 */

const CAP = 100;            // hard ceiling on stored reports (ring buffer)
const MAX_REPORT = 9000;    // reject anything bigger than a short report + diag
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
    // Reports are plain Markdown as of R105, so the inbox is readable without a
    // decoder. The old base64 form is still accepted so anything already in
    // flight is not thrown away.
    const text = (body && (body.report || body.blob) || '').toString();
    if (text.length < 8 || text.length > MAX_REPORT)
      return j({ error: 'invalid report' }, 400, cors);

    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await ghGet(env);
      const data = (cur.json && Array.isArray(cur.json.reports))
        ? cur.json
        : { fmt: 'jbh-inbox-2', cap: CAP, updated: '', reports: [] };
      data.fmt = 'jbh-inbox-2';
      data.reports.push({ t: new Date().toISOString(), ip: await hash(ip), text });
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
