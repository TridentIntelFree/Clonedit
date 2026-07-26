#!/usr/bin/env node
/* Read the beta-report inbox.
 *
 *   node feedback/decode.js                    the online inbox (feedback/inbox.json)
 *                                              plus anything under feedback/reports/
 *   node feedback/decode.js path/to/file.json  a specific inbox file
 *   node feedback/decode.js "<jbhfb1:… blob>"  one pre-R105 blob
 *
 * Reports have been plain Markdown since R105, so this mostly just prints them.
 * The base64 'jbhfb1:' form is still understood, because reports collected
 * before then were packed that way.
 *
 * This file is ESM: the project's package.json sets "type": "module", which
 * silently broke the old require()-based version.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function decodeBlob(raw) {
  const m = String(raw).match(/jbhfb1:[A-Za-z0-9+/=]+/s);
  if (!m) return null;
  try {
    const o = JSON.parse(Buffer.from(m[0].slice('jbhfb1:'.length), 'base64').toString('utf8'));
    // render the old structured form as the same readable shape
    return '**What happened**\n\n' + (o.msg || '(no message)') + '\n\n'
      + '| | |\n|---|---|\n'
      + '| **Type** | ' + (o.cat || '?') + ' |\n'
      + '| **Build** | ' + (o.v || '?') + ' |\n'
      + '| **When** | ' + (o.t || '?') + ' |\n'
      + (o.diag ? ('\nDiagnostics\n\n```\n' + o.diag + '\n```\n') : '');
  } catch (e) { return '(could not decode: ' + e.message + ')'; }
}

function show(label, text) {
  console.log('\n' + '═'.repeat(64));
  console.log(label);
  console.log('═'.repeat(64));
  console.log(String(text).trim());
}

function readInbox(file) {
  let inbox = null;
  try { inbox = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    console.error('Could not read ' + file + ': ' + e.message); return 0;
  }
  const reports = (inbox && Array.isArray(inbox.reports)) ? inbox.reports : [];
  if (!reports.length) { console.log('Inbox is empty (' + file + ').'); return 0; }
  console.log('# ' + reports.length + '/' + (inbox.cap || 100) + ' reports · updated ' + (inbox.updated || '?'));
  reports.forEach((e, i) => {
    const text = e.text || decodeBlob(e.blob || '') || '(empty)';
    show('#' + (i + 1) + '  ' + (e.t || '') + (e.ip ? '  · sender ' + e.ip : ''), text);
  });
  return reports.length;
}

const arg = process.argv[2];
if (arg && /jbhfb1:/.test(arg)) {
  show('pasted blob', decodeBlob(arg) || '(no jbhfb1 blob found)');
} else if (arg) {
  if (!existsSync(arg)) { console.error('No such file: ' + arg); process.exit(1); }
  const raw = readFileSync(arg, 'utf8');
  if (/jbhfb1:/.test(raw) && !/"reports"/.test(raw)) show(basename(arg), decodeBlob(raw));
  else readInbox(arg);
} else {
  let n = 0;
  const inboxPath = resolve(HERE, 'inbox.json');
  if (existsSync(inboxPath)) n += readInbox(inboxPath);
  const dir = resolve(HERE, 'reports');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter(x => x !== '.gitkeep')) {
      const raw = readFileSync(resolve(dir, f), 'utf8');
      show(f, /jbhfb1:/.test(raw) ? decodeBlob(raw) : raw);
      n++;
    }
  }
  if (!n) console.log('No reports yet. feedback/inbox.json fills up once the relay is deployed —\nsee feedback/worker.js for the one-time setup.');
}
