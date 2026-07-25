import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* The shipped artifact is ONE self-contained index.html — no server, no module
   loading, openable from a file:// URL. That is what makes the app installable
   and offline, and the migration to Svelte must not cost it, so everything is
   inlined and the output is copied to the repository root by scripts/emit.mjs. */

const SRC = resolve(import.meta.dirname, 'src');

/* Two things Vite must NOT touch.

   1) The manifest and icon links. Vite would hash them into assets/ or, with
      single-file inlining, turn them into data: URIs — and a data: URI manifest
      cannot be installed as a PWA. They point at real files sitting beside the
      built page, so they are injected verbatim after bundling.

   2) The legacy engine. Its ~370 top-level declarations are true globals that
      the app, the browser console and the verification suite all read AND
      write (workBuf = b, morphBuf = null). ES module bindings cannot be
      assigned from outside, so converting it wholesale would silently break
      every one of those. It stays a classic inline script — byte-identical
      semantics — while new code arrives as Svelte components and modules
      beside it. Logic moves out of here module by module, deliberately. */
function staticHead() {
  return {
    name: 'jbh-static-head',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const links = readFileSync(resolve(SRC, 'head-links.html'), 'utf8').trim();
        const legacy = readFileSync(resolve(SRC, 'legacy.js'), 'utf8');
        return html
          .replace('</head>', links + '\n</head>')
          .replace('</body>', '<script>\n' + legacy + '\n</script>\n</body>');
      },
    },
  };
}

export default defineConfig({
  root: 'src',
  publicDir: false,
  plugins: [svelte(), viteSingleFile(), staticHead()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
});
