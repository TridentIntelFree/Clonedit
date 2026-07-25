/* Stage the built page as index.next.html and run the static checks.

   It is deliberately NOT written to index.html here. That file is what people
   who have been sent the link are running, so it is only replaced once
   scripts/smoke.mjs has loaded the new one in a real browser and confirmed it
   works. Until then the live app is untouched. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');

const must = [
  ['an inlined stylesheet', /<style[^>]*>[\s\S]{2000,}<\/style>/],
  ['the legacy engine', /function padPress\s*\(/],
  ['the pad grid', /id="padgrid"/],
  ['the Svelte component', /aboutPanel/],
  ['the manifest link', /<link rel="manifest" href="manifest\.webmanifest">/],
  ['the apple touch icon', /rel="apple-touch-icon"/],
];
const missing = must.filter(([, re]) => !re.test(html)).map(([w]) => w);
if (missing.length) {
  console.error('BUILD REFUSED — the output is missing: ' + missing.join(', '));
  process.exit(1);
}
if (/<script[^>]+src=["'][^"']/.test(html) || /<link[^>]+rel=["']stylesheet/.test(html)) {
  console.error('BUILD REFUSED — the output is not self-contained (it still loads an external file).');
  process.exit(1);
}

const banner = `<!DOCTYPE html>
<!-- ==========================================================================
     GENERATED FILE — do not edit.

     Built from src/ by \`npm run build\`. Hand edits here are overwritten the
     next time anyone builds. Change src/index.html, src/app.css, src/legacy.js
     or a component under src/lib/ instead.

     It is committed because there is no CI: this file IS the deployment.
     ========================================================================== -->
`;
writeFileSync(resolve(root, 'index.next.html'), html.replace(/^<!DOCTYPE html>\r?\n/i, banner));
console.log('staged  index.next.html  ' + (html.length / 1024).toFixed(0) + ' KB');
