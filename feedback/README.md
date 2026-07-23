# JBH-88 — Beta Feedback

A private, spam-limited channel for beta testers to report issues. Every report
is packaged into an opaque `jbhfb1:` blob (base64 — hides the text and resists
casual tampering). There are two delivery paths:

- **Online inbox (recommended)** — if you deploy the tiny relay in `worker.js`
  and set its URL as `FEEDBACK_ENDPOINT` in `index.html`, the app POSTs reports
  to it and the relay stores them in **`inbox.json`** as a **ring buffer capped
  at 100**. Even a spam flood can never grow the inbox past 100 short messages.
  Ask the assistant to "check the beta feedback" and it reads `inbox.json`.
- **Share fallback** — with no endpoint set, or when the tester is offline, the
  app hands the blob to the OS share sheet / clipboard so the tester forwards it
  to you directly (drop those into `reports/`). No public endpoint either way.

## The online inbox (`inbox.json`)

```json
{ "fmt": "jbh-inbox-1", "cap": 100, "updated": "<iso>",
  "reports": [ { "t": "<iso>", "ip": "<4-byte hash>", "blob": "jbhfb1:…" } ] }
```

Newest last; the relay trims to the last 100. `ip` is a short non-reversible
hash (spot repeat spammers without storing anyone's address). `decode.js` with
no arguments decodes the whole inbox.

### Deploy the relay (once)

The app is a static file and can't hold a GitHub token safely, so a minimal
Cloudflare Worker (`worker.js`) holds it server-side and only ever appends to
`inbox.json`. See the header of `worker.js` for the exact steps:

1. Make a GitHub **fine-grained token** limited to this repo, **Contents:
   Read and write** only.
2. `wrangler deploy worker.js` (or paste it into the Cloudflare dashboard).
3. Set Worker vars: `GH_TOKEN` (secret), `GH_REPO`, `GH_BRANCH`, `GH_PATH=feedback/inbox.json`.
4. Put the Worker URL into `FEEDBACK_ENDPOINT` in `index.html`.

The token never touches the app or the testers. The relay throttles per IP and
rejects anything that isn't a small `jbhfb1:` blob.

## Share-fallback flow

1. **Tester** (in the app): PROJ tab → **BETA FEEDBACK** → pick a type, write
   what happened, leave "attach diagnostics" on → **PACKAGE & SEND REPORT**.
   The app copies / shares a blob like:

   ```
   JBH-88 beta report [BUG] — please forward to the developer:

   jbhfb1:eyJmIjoiamJoZmIxIiwidiI6IkpCSC04OCB...
   ```

2. **Tester → Developer**: the tester sends that blob to you (text, email,
   DM — whatever channel you give your testers). Nothing is posted publicly.

3. **Developer → repo**: drop each blob into a file under
   `feedback/reports/`, one report per file, e.g.
   `feedback/reports/2026-07-21-glitch-anon.txt`. The file can contain just
   the `jbhfb1:...` blob (the surrounding prose is ignored by the decoder).

4. **Analysis (on request)**: ask the assistant to "check the beta feedback."
   It reads `feedback/reports/*`, decodes the blobs, and summarises. Per the
   agreed process, it will **check with you before acting** on any report.

## What's inside a report

Decoded JSON:

| field  | meaning                                                        |
|--------|---------------------------------------------------------------|
| `f`    | format tag, always `jbhfb1`                                    |
| `v`    | app BUILD string (which version the tester was on)            |
| `t`    | ISO timestamp                                                  |
| `cat`  | `bug` \| `crash` \| `audio` \| `idea` \| `other`              |
| `msg`  | the tester's message (≤1400 chars)                            |
| `diag` | optional engine snapshot (context/gains/buffers/errors), if the tester left "attach diagnostics" on |

No identity is collected unless the tester types their name into the message.

## Decode a blob

Node:

```js
const s = process.argv[2].replace(/^.*?(jbhfb1:)/s, '$1').trim();
const json = Buffer.from(s.slice('jbhfb1:'.length), 'base64').toString('utf8');
console.log(JSON.stringify(JSON.parse(json), null, 2));
```

```
node decode.js "$(cat feedback/reports/somefile.txt)"
```

Browser console (paste the blob as `b`):

```js
JSON.parse(decodeURIComponent(escape(atob(b.replace(/^.*?jbhfb1:/s,'').trim()))))
```

## Notes on abuse-resistance

- **Un-spammable**: no public write endpoint exists; reports only travel
  through channels you control. The app also rate-limits to one report per
  15 seconds locally.
- **Tamper-resistant**: the blob is base64; casual edits make it fail to
  decode, so a mangled report is obvious rather than silently misleading.
- **Private**: each tester only ever handles their own report; there is no
  shared inbox inside the app.
