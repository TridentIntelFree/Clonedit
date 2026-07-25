/* Copy the built single file to the repository root, where index.html has always
   lived — the deploy, the service worker shell list and every relative path
   (samples/, icons/, manifest.webmanifest) depend on it being there. */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const built = resolve(root, 'dist/index.html');
const out = resolve(root, 'index.html');

const html = readFileSync(built, 'utf8');

// a broken emit would overwrite the deployed app, so sanity-check the payload
const must = [
  ['an inlined stylesheet', /<style[^>]*>[\s\S]{2000,}<\/style>/],
  ['the legacy engine', /function padPress\s*\(/],
  ['the pad grid', /id="padgrid"/],
  ['the Svelte component', /data-svelte="about"|aboutPanel/],
  ['the manifest link', /rel="manifest"/],
  ['an apple touch icon', /rel="apple-touch-icon"/],
];
const missing = must.filter(([, re]) => !re.test(html)).map(([what]) => what);
if (missing.length) {
  console.error('emit refused — the build is missing: ' + missing.join(', '));
  process.exit(1);
}
if (html.includes('type="module" src=')) {
  console.error('emit refused — the build still references an external module; it must be self-contained.');
  process.exit(1);
}

/* Anyone opening index.html should know an edit here is lost on the next build. */
const banner = `<!DOCTYPE html>
<!-- ==========================================================================
     GENERATED FILE — do not edit.

     Built from src/ by \`npm run build\`. Hand edits here are overwritten the
     next time anyone builds. Change src/index.html, src/app.css, src/legacy.js
     or a component under src/lib/ instead.

     It is committed because there is no CI: this file IS the deployment.
     ========================================================================== -->
`;
writeFileSync(out, html.replace(/^<!DOCTYPE html>\r?\n/i, banner));
console.log('index.html  ' + (statSync(out).size / 1024).toFixed(0) + ' KB  (self-contained)');
