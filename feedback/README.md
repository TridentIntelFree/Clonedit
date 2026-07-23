# JBH-88 — Beta Feedback

A private, un-spammable, offline-friendly channel for beta testers to report
issues. There is **no server**: the app packages each report into an opaque
`jbhfb1:` blob and hands it to the tester's share sheet / clipboard, so it
reaches the developer directly. Other testers never see it, and there is no
public endpoint to spam.

## How it flows

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
