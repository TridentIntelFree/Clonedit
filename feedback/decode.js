#!/usr/bin/env node
/* Decode JBH-88 beta feedback.
   Usage:
     node decode.js                      decode the online inbox (feedback/inbox.json),
                                          then any blobs under feedback/reports/
     node decode.js "<jbhfb1:... blob>"  decode one blob (prose around it is fine)
     node decode.js path/to/file.txt     decode blobs in a file */
const fs = require('fs');
const path = require('path');

function decodeBlob(raw) {
  const m = String(raw).match(/jbhfb1:[A-Za-z0-9+/=]+/s);
  if (!m) return null;
  const b64 = m[0].slice('jbhfb1:'.length);
  try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
  catch (e) { return { _error: 'could not decode: ' + e.message }; }
}

function show(label, obj) {
  console.log('=== ' + label + ' ===');
  console.log(JSON.stringify(obj, null, 2));
  console.log('');
}

const arg = process.argv[2];
if (arg) {
  const raw = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
  const r = decodeBlob(raw);
  if (!r) { console.error('No jbhfb1 blob found.'); process.exit(1); }
  show(fs.existsSync(arg) ? path.basename(arg) : 'input', r);
} else {
  let count = 0;
  // 1) the online inbox (ring buffer, newest last)
  const inboxPath = path.join(__dirname, 'inbox.json');
  if (fs.existsSync(inboxPath)) {
    let inbox = null; try { inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf8')); } catch (e) {}
    const reports = (inbox && Array.isArray(inbox.reports)) ? inbox.reports : [];
    if (reports.length) {
      console.log('# ONLINE INBOX — ' + reports.length + '/' + (inbox.cap || 100) + ' (updated ' + (inbox.updated || '?') + ')\n');
      reports.forEach((e, i) => { const r = decodeBlob(e.blob || e); if (r) { r._recv = e.t; r._ip = e.ip; show('#' + (i + 1), r); count++; } });
    }
  }
  // 2) any manually-collected blobs
  const dir = path.join(__dirname, 'reports');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f !== '.gitkeep') : [];
  for (const f of files) { const r = decodeBlob(fs.readFileSync(path.join(dir, f), 'utf8')); if (r) { show(f, r); count++; } }
  if (!count) console.log('No feedback yet (feedback/inbox.json is empty and feedback/reports/ has no blobs).');
}
