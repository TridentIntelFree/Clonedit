/* Entry point for everything that is NOT the legacy engine.

   The engine is injected as a classic inline script by vite.config.js and boots
   first; this module is deferred, so by the time it runs the app is up and its
   globals exist. New UI arrives here as Svelte components mounted into the
   existing markup, one piece at a time. */
import './app.css';
import { mount } from 'svelte';
import About from './lib/About.svelte';

const host = document.getElementById('aboutPanel');
if (host) {
  mount(About, {
    target: host,
    props: { build: (globalThis.BUILD || document.getElementById('build')?.textContent || '') },
  });
}
