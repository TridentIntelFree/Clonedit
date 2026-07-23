#!/usr/bin/env node
/* Decode a JBH-88 beta-feedback blob.
   Usage: node decode.js "<jbhfb1:... blob, prose around it is fine>"
      or: node decode.js feedback/reports/somefile.txt
   With no argument, decodes every jbhfb1 blob found under feedback/reports/. */
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
  const dir = path.join(__dirname, 'reports');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f !== '.gitkeep') : [];
  if (!files.length) { console.log('No reports in feedback/reports/.'); process.exit(0); }
  for (const f of files) {
    const r = decodeBlob(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (r) show(f, r);
  }
}
