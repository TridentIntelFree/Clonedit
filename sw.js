/* JBH-88 offline shell.

   Network-first: online always serves the newest deployed build, offline falls
   back to the last good copy.

   The subtlety is that "network-first" is not enough on its own. A plain
   fetch() still goes through the browser's own HTTP cache, so an installed app
   could be handed a stale index.html while perfectly online — and then this
   worker would write that stale copy into its cache and keep serving it. A
   tester could sit on a broken build long after it was fixed. The shell is
   therefore revalidated with cache:'no-store', which bypasses the HTTP cache
   for exactly the files that change on every deploy.

   Samples and icons are deliberately NOT no-store: they are large, they almost
   never change, and forcing a re-download of a 14 MB sample pack on every
   launch would be worse than useless. */
const CACHE = 'jbh88-shell-v4';   // bumped: shell revalidation no longer trusts the HTTP cache
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png'];

/* Files that change every time the app is rebuilt, and so must never be served
   from a stale HTTP cache: the page itself and its install metadata. */
function isShellDoc(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /(^|\/)$|\.html$|\.webmanifest$/.test(url.pathname);
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c =>
    // reload = fetch these past the HTTP cache while installing, too
    c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const shell = isShellDoc(e.request);
  e.respondWith((async () => {
    try {
      const fresh = await fetch(shell ? new Request(e.request, { cache: 'no-store' }) : e.request);
      if (fresh && fresh.ok) {
        const c = await caches.open(CACHE);
        c.put(e.request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
